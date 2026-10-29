// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAR A OP NO PCP — estrutura do veículo, perguntas do carro e BOM
//
// Decisão do usuário em 12/10/2026 (Etapa 18 do plano de UX): a OP passa a cair direto no PCP, e é o PCP que configura a
// estrutura, as perguntas e a BOM — antes isso era a janela "Liberar BOM" da Engenharia (EngenhariaTab.tsx). Os blocos são os
// mesmos de lá (conferência da estrutura, copiar a BOM de outra OP, editor da BOM) e não foram copiados: vêm de
// AplicarEstrutura.tsx e OpItens.tsx. O que muda é a gravação: a OP já está em "Em Espera PCP", então salvar NÃO muda o status
// da OP — só grava a BOM e marca `status_bom = 'BOM Liberado'`, que o Almoxarifado e o Marketing já leem.
//
// A fabricação interna (chicotes e serralheria) NÃO aparece aqui: o PCP já a sugere na janela do kiting, que é o próximo passo.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { PainelConferenciaEstrutura } from './AplicarEstrutura';
import ModalSolicitarDesenvolvimento from './SolicitarDesenvolvimento';
import { AvisoRespostasDiferentes } from './RespostasEmLote';
import { aplicarDiferencaNaBom, avisoDoQueNaoFoiTirado } from './CalculoDaEstrutura';
import { BomEditor, CopiarBomDeOutraOp, bomPreenchida, sugerirBom } from './OpItens';
import { Faixa, Botao } from './Interface';
import { logChange } from './AuditSystem';
import { notificarEvento } from './whatsappHelper';
import Icone from './Icone';
import { mdiTrayArrowUp, mdiTagOutline, mdiWrenchOutline, mdiCogOutline } from '@mdi/js';

const chaveLinha = (l: any) => l?.item_id || `txt:${l?.nome}`;
const temConteudo = (l: any) => l?.item_id || String(l?.nome || '').trim();

/** Soma por item: a mesma peça em duas linhas vira uma só, com a quantidade somada (o que a janela da Engenharia já fazia). */
export function somarLinhas(atuais: any[], novas: any[], idsConjunto: string[] = []) {
  const mapa = new Map();
  [...(atuais || []).filter(l => temConteudo(l) && !idsConjunto.includes(String(l?.item_id))), ...novas].forEach(l => {
    const k = chaveLinha(l);
    const ja = mapa.get(k);
    if (ja) ja.quantidade = Number(ja.quantidade || 0) + Number(l.quantidade || 0);
    else mapa.set(k, { ...l });
  });
  return [...mapa.values()];
}

/** Monta a BOM inicial da janela: a que a OP já tem; senão a sugerida a partir do que foi vendido. */
async function prepararBom(o: any, setter: (v: any) => void) {
  if ((o?.bom_itens || []).length) { setter(o.bom_itens); return; }
  setter([]);
  if ((o?.itens_vendidos || []).length) {
    const sugerida = await sugerirBom(o.itens_vendidos);
    // a sugestão chega DEPOIS de a janela abrir (uma consulta por item vendido): ela só soma o que ainda não está na lista, para
    // não apagar o que a pessoa já digitou nesse intervalo (mesmo cuidado de 29/09/2026 na janela da Engenharia)
    setter((atuais: any[]) => {
      const ja = new Set((atuais || []).map(chaveLinha));
      return [...(atuais || []), ...sugerida.filter((l: any) => !ja.has(chaveLinha(l)))];
    });
  }
}

const TIPOS_ENVIO_DIRETO = ['Envio de Material para Terceiro', 'Envio de Produto Vendido', 'Demanda Direta para Engenharia'];
const isEnvioDireto = (o: any) => o.item_envio === true || TIPOS_ENVIO_DIRETO.some(t => (o.tipo_projeto || '').includes(t));

/**
 * `ops`: as OPs que a janela atende — uma só, ou as unidades de um lote desmembrado ainda em "Em Espera PCP".
 * `onSalvo(salvas, completo)`: quem chama atualiza a lista; fecha a janela só quando `completo` (todas gravaram).
 * `onPedido`: o PCP enviou um pedido de desenvolvimento por aqui (Etapa 18c); quem chama atualiza a lista, e esta janela continua aberta.
 */
export default function ModalConfigurarOp({ ops, base = null, currentUser, onClose, onSalvo, onPedido }: any) {
  const lote = ops.length > 1;
  const [marcadas, setMarcadas] = useState<any>(() => Object.fromEntries(ops.map((o: any) => [o.id, true])));
  const [linhas, setLinhas] = useState<any[]>([]);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [versaoRespostas, setVersaoRespostas] = useState(0);   // sobe quando as respostas mudam: refaz o aviso de respostas diferentes
  const [solicitar, setSolicitar] = useState<any>(null);          // { itens }: a janela do pedido de desenvolvimento, por cima desta
  const emAcao = useRef(false);                                // clique duplo em "Salvar" gravava duas vezes (cuidado da 7.51/7.52)

  const selecionadas = ops.filter((o: any) => marcadas[o.id]);
  // a OP de referência da estrutura é a primeira marcada com itens vendidos (no lote, em ordem de número)
  const ref = selecionadas.find((o: any) => (o.itens_vendidos || []).length) || selecionadas[0] || ops[0];

  // "Sem estrutura" por linha vendida (29/10/2026): decidido pelo PCP aqui. As marcas valem na hora (a janela e o painel recalculam) e são gravadas na venda de cada OP igual.
  const [marcas, setMarcas] = useState<Record<number, boolean>>({});
  const [gravandoMarca, setGravandoMarca] = useState(false);
  useEffect(() => { setMarcas({}); }, [ref?.id]);
  const refComMarcas = { ...ref, itens_vendidos: (ref?.itens_vendidos || []).map((v: any, i: number) => (i in marcas ? { ...v, sem_estrutura: marcas[i] ? true : undefined } : v)) };
  const alternarSemEstrutura = async (i: number, valor: boolean) => {
    if (gravandoMarca) return;
    const linhaRef = (ref?.itens_vendidos || [])[i];
    if (!linhaRef) return;
    setGravandoMarca(true);
    try {
      // vale para as OPs marcadas que têm a MESMA linha na mesma posição (lote: a mesma BOM vai para todas); as diferentes ficam como estavam e a janela diz quais
      const alvos = selecionadas.filter((o: any) => (o.itens_vendidos || [])[i]?.nome === linhaRef.nome && (o.itens_vendidos || [])[i]?.item_id === linhaRef.item_id);
      const fora = selecionadas.filter((o: any) => !alvos.includes(o)).map((o: any) => o.opl);
      const falhas: string[] = [];
      for (const o of alvos) {
        if (!!(o.itens_vendidos || [])[i]?.sem_estrutura === valor) continue;   // essa OP já está como foi pedido: nada a gravar
        const novos = (o.itens_vendidos || []).map((v: any, j: number) => (j === i ? { ...v, sem_estrutura: valor ? true : undefined } : v));
        const { data, error } = await supabase.from('oples').update({ itens_vendidos: novos }).eq('id', o.id).select('id');
        if (error || !data?.length) { falhas.push(`${o.opl} (${error?.message || 'a OP não foi encontrada'})`); continue; }
        logChange({ module: 'pcp', entityType: 'oples', entityId: o.id, changeType: 'UPDATE', oldRow: { itens_vendidos: o.itens_vendidos }, newRow: { itens_vendidos: novos, sem_estrutura: valor ? linhaRef.nome : null }, user: currentUser });
        o.itens_vendidos = novos;   // a lista que a tela guarda acompanha, para a próxima marcação partir do que está gravado
      }
      if (falhas.length) alert(`Não foi possível gravar a marca "Sem estrutura" em: ${falhas.join('; ')}. As demais foram gravadas.`);
      else if (fora.length) alert(`A marca não foi aplicada em ${fora.join(', ')}: a venda delas não tem essa linha na mesma posição.`);
      setMarcas(m => ({ ...m, [i]: valor }));
    } finally { setGravandoMarca(false); }
  };

  useEffect(() => {
    const inicial = ops.find((o: any) => (o.bom_itens || []).length) || ops.find((o: any) => (o.itens_vendidos || []).length) || ops[0];
    prepararBom(inicial, setLinhas);
  }, []);

  const salvar = async () => {
    if (emAcao.current) return;
    if (!selecionadas.length) { alert('Selecione ao menos uma OP.'); return; }
    const bom = bomPreenchida(linhas);
    if (!bom.length) { alert('Preencha a BOM com pelo menos 1 item: o material ' + (lote ? 'de cada unidade.' : 'que será usado nesta OP.')); return; }
    emAcao.current = true;
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const salvas: any[] = [];
      for (const o of selecionadas) {
        // `data_liberacao_bom` é o ponto de partida do relógio do PCP (tempo_pcp_horas): quem já tinha a data (BOM da Engenharia) a mantém
        const { error } = await supabase.from('oples').update({
          status_bom: 'BOM Liberado', obs_liberacao_bom: obs, bom_itens: bom, data_liberacao_bom: o.data_liberacao_bom || agora,
        }).eq('id', o.id);
        if (error) {
          alert(`Não foi possível gravar a BOM da OP ${o.opl}: ${error.message}` +
            (lote ? `\n\nO lote parou aqui: ${salvas.length} unidade(s) foram gravadas e as demais ficaram como estavam. A janela continua aberta para tentar de novo.` : ''));
          break;
        }
        salvas.push(o);
        logChange({ module: 'pcp', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
          oldRow: { status_bom: o.status_bom, obs_liberacao_bom: o.obs_liberacao_bom }, newRow: { status_bom: 'BOM Liberado', obs_liberacao_bom: obs }, user: currentUser });
      }
      if (salvas.length) {
        const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert(salvas.map(o => ({
          opl_id: o.id, numero_opl: o.opl, setor: 'PCP',
          evento: lote
            ? `BOM configurada pelo PCP em lote (${salvas.length} OPs do grupo ${base}): ${bom.length} item(ns). Obs: ${obs || 'sem observações'}.`
            : `BOM configurada pelo PCP: ${bom.length} item(ns). Obs: ${obs || 'sem observações'}.`,
          status_anterior: o.status_geral, status_novo: o.status_geral,
          usuario_nome: currentUser?.nome, data_hora: agora,
        })));
        if (erroLog) alert(`A BOM foi gravada, mas o histórico de movimentação não: ${erroLog.message}`);
        onSalvo?.(salvas, salvas.length === selecionadas.length);
      }
    } finally {
      emAcao.current = false;
      setSalvando(false);
    }
  };

  // quando as marcadas não têm o mesmo veículo e os mesmos itens vendidos, a mesma BOM iria para todas (aviso de 29/09/2026)
  const chaveVenda = (o: any) => `${o.veiculo_id || ''}|${(o.itens_vendidos || []).map((v: any) => `${v.item_id}x${Number(v.quantidade) || 1}`).sort().join(',')}`;
  const iguais = selecionadas.every((o: any) => chaveVenda(o) === chaveVenda(ref));

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-eng-bom" role="dialog" aria-label={lote ? 'Configurar OPs em lote' : 'Configurar OP'}>
        <div className="acn-modal-cab">
          <span className="modal-title">
            {lote ? <><Icone path={mdiTagOutline} size={16} /> Configurar em Lote — {base}</> : <>Configurar OP — {ops[0].opl}</>}
          </span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            O PCP confere a estrutura do veículo, responde o que faltar das perguntas do carro e fecha a BOM (a lista de material).
            Salvar não muda a etapa da OP: depois é só liberar o kiting.
          </div>
          {lote ? (
            <>
              <div className="acn-ajuda">
                {ops.length} OPs deste número ainda na triagem. Desmarque as que não devem receber esta BOM
                (ex.: alguma unidade com especificação diferente das demais).
              </div>
              <div className="acn-quadro acn-eng-selecao">
                {ops.map((o: any) => (
                  <label key={o.id} className="acn-eng-selecao-linha">
                    <input type="checkbox" checked={!!marcadas[o.id]} onChange={e => setMarcadas((s: any) => ({ ...s, [o.id]: e.target.checked }))} />
                    <span className="acn-kb-cresce">{o.opl}</span>
                    <span className="acn-ajuda">{o.status_bom === 'BOM Liberado' ? 'BOM já configurada' : 'sem BOM'}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="acn-ajuda">Tipo: {ops[0].tipo_projeto} | Chassi: {ops[0].chassi || '—'}</div>
          )}
          {!lote && isEnvioDireto(ops[0]) && (
            <Faixa tom="atencao" icone={mdiTrayArrowUp}>
              <strong>ENVIO DIRETO AO CLIENTE</strong>
              <div>Este item não requer linha de produção. Depois da BOM, o PCP faz apenas a separação no Almoxarifado e o despacho direto.</div>
            </Faixa>
          )}
          {(ref?.itens_vendidos || []).length > 0 && (
            <div className="acn-quadro tom-info">
              <div><strong>Vendido:</strong></div>
              {/* 29/10/2026 (pedido do usuário, Pulse): quem decide se uma linha vendida usa ou não a estrutura do carro é o PCP, aqui, na hora de montar a BOM (não o vendedor) */}
              <div className="acn-vendido-lista">
                {refComMarcas.itens_vendidos.map((v: any, i: number) => (
                  <div key={i} className="acn-vendido-linha">
                    <span className="acn-kb-cresce">{Number(v.quantidade).toLocaleString('pt-BR')}× {v.nome}{v.descricao ? <span className="acn-ajuda"> — {v.descricao}</span> : null}</span>
                    {v.item_id && (
                      <label className="acn-vendido-semestr" title="Marque quando esta linha NÃO usa a estrutura de instalação do carro (ex.: Interled2 fixado com ventosa). Ela continua na venda e na BOM com o mesmo código, mas não recebe material de instalação.">
                        <input type="checkbox" checked={!!v.sem_estrutura} disabled={gravandoMarca} aria-label={`Sem estrutura: ${v.nome}`}
                          onChange={e => alternarSemEstrutura(i, e.target.checked)} /> Sem estrutura
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {lote && selecionadas.length > 0 && !iguais && (
            <Faixa tom="atencao">
              As OPs marcadas <b>não têm o mesmo veículo e os mesmos itens vendidos</b>. O material calculado abaixo é o da <b>{ref.opl}</b>,
              e a mesma BOM vai para todas — desmarque as diferentes e configure-as à parte.
            </Faixa>
          )}
          {lote && selecionadas.length > 0 && <AvisoRespostasDiferentes ops={selecionadas} refOpl={ref.opl} versao={versaoRespostas} />}
          {lote && <div className="acn-ajuda">Estrutura calculada com base na OP <b>{ref.opl}</b>.</div>}
          {ref && (
            <PainelConferenciaEstrutura opl={refComMarcas} currentUser={currentUser}
              opsParaResponder={lote ? selecionadas : undefined}
              onRespondido={lote ? () => setVersaoRespostas(v => v + 1) : undefined}
              onSolicitarDesenvolvimento={(itens: any[]) => setSolicitar({ itens })}
              onUsar={(novas: any[], idsConj: string[] = []) => setLinhas(atuais => somarLinhas(atuais, novas, idsConj))}
              onAjustarBom={(dif: any[], nomeConj?: string) => {
                // etapa 4 (15/10/2026): uma resposta mudou; entra na BOM desta janela só a diferença (o que foi ajustado à mão fica)
                const r = aplicarDiferencaNaBom(linhas, dif, nomeConj);
                setLinhas(r.bom);
                const aviso = avisoDoQueNaoFoiTirado(r.naoAchou);
                if (aviso) alert(aviso);
              }} />
          )}
          {!lote && (
            <CopiarBomDeOutraOp oplAtual={ops[0]} onCopiar={(novas: any[], modo: string) => setLinhas(atuais => modo === 'substituir' ? novas : somarLinhas(atuais, novas))} />
          )}
          <BomEditor linhas={linhas} onChange={setLinhas} vendidos={ref?.itens_vendidos || []} currentUser={currentUser} />
          {lote && <div className="acn-ajuda">A mesma BOM (por unidade) vai para todas as OPs selecionadas; ajuste uma unidade diferente depois, no detalhe dela.</div>}
          <div className="form-group">
            <label className="acn-label" htmlFor="pcp-obs-bom">Observações para o Almoxarifado{lote ? ' (aplicadas a todas as selecionadas)' : ''}</label>
            <textarea id="pcp-obs-bom" className="acn-input" rows={4}
              placeholder="Detalhes da BOM, itens especiais, pendências..."
              value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : lote ? `SALVAR CONFIGURAÇÃO DE ${selecionadas.length} OPs` : 'SALVAR CONFIGURAÇÃO'}
          </Botao>
          <Botao icone={mdiCogOutline} disabled={salvando} onClick={() => setSolicitar({ itens: [] })}
            title="Algo que nunca foi adaptado e precisa de projeto: pede à Engenharia, com esta OP anexada">
            Solicitar desenvolvimento
          </Botao>
          <Botao disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
      {solicitar && (
        <ModalSolicitarDesenvolvimento ops={selecionadas.length ? selecionadas : ops} base={base} itensSugeridos={solicitar.itens} currentUser={currentUser}
          onClose={() => setSolicitar(null)} onEnviado={() => { setSolicitar(null); onPedido?.(); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBERAÇÃO PARCIAL PARA A SERRALHERIA — antecipa a parte metálica/estrutural sem esperar o resto da configuração
//
// Era uma ação da Engenharia (EngenhariaTab.tsx); com a Etapa 18 a OP não passa mais por lá, então o PCP passa a poder pedi-la.
// Usa a mesma tabela e a mesma tela de sempre (demandas_setoriais + SetorDemandaTab.tsx): `tipo_solicitacao = 'liberacao_parcial_bom'`
// avisa a Serralheria de que precisa sincronizar `oples.serralheria_status` ao concluir. Não mexe no status geral da OP.
// ─────────────────────────────────────────────────────────────────────────────
export function ModalLiberacaoParcialSerralheria({ opl, currentUser, onClose, onFeito }: any) {
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const emAcao = useRef(false);
  const enviar = async () => {
    if (emAcao.current) return;
    if (!obs.trim()) { alert('Descreva o que a Serralheria precisa fazer!'); return; }
    emAcao.current = true;
    setEnviando(true);
    try {
      const agora = new Date().toISOString();
      const { error: errDemanda } = await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Serralheria', setor_origem: 'PCP', tipo_solicitacao: 'liberacao_parcial_bom',
        numero_opl: opl.opl, chassi: opl.chassi || null, descricao: obs.trim(),
        status: 'Pendente', criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
        data_abertura: agora,
        logs_demanda: [{ texto: `Liberação parcial (PCP): ${obs.trim()}`, usuario: currentUser?.nome, hora: agora }],
      }]);
      if (errDemanda) { alert('Erro ao criar demanda para Serralheria: ' + errDemanda.message); return; }
      // a demanda já nasceu; se a marca na OP não gravar, o selo "Liberado Parcial" não aparece e a conclusão da Serralheria não sincroniza
      const { error: erroMarca } = await supabase.from('oples').update({ serralheria_status: 'Pendente' }).eq('id', opl.id);
      if (erroMarca) alert(`A demanda foi aberta para a Serralheria, mas a OP não foi marcada como "Liberado Parcial": ${erroMarca.message}\n\nAvise o Admin: não envie de novo (abriria uma segunda demanda).`);
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
        evento: `Liberação parcial para Serralheria. Obs: ${obs.trim()}`,
        status_anterior: opl.status_geral, status_novo: opl.status_geral,
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
      // mesma chave de aviso que a Engenharia usava: quem o Admin configurou para receber continua recebendo
      notificarEvento('engenharia_libera_serralheria', `*Liberação parcial p/ Serralheria* — OP ${opl.opl}\n${obs.trim()}\nPor: ${currentUser?.nome} (PCP)`, 'Serralheria');
      onFeito?.();
    } finally {
      emAcao.current = false;
      setEnviando(false);
    }
  };
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Liberação parcial para a Serralheria">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiWrenchOutline} size={16} /> Liberar Parcial p/ Serralheria — {opl.opl}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            A Serralheria começa essa parte já; o PCP continua a configuração e libera o kiting normalmente quando terminar
            (essa liberação parcial não interfere na liberação do kiting).
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="pcp-serr">O que a Serralheria precisa fazer *</label>
            <textarea id="pcp-serr" className="acn-input" rows={4}
              placeholder="Descreva a parte metálica/estrutural a ser feita..."
              value={obs} onChange={e => setObs(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando...' : 'ENVIAR PARA SERRALHERIA'}</Botao>
          <Botao disabled={enviando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
