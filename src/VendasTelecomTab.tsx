// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VendasTelecomTab — a aba "Vendas" do Telecom (pedido do usuário em 03/11/2026, Fatia 1)
//
// Comercial enxuto para o operador de vendas do Telecom (setor privado: shoppings, condomínios etc.). Trabalha nos MESMOS cards do CRM, marcados com
// `setor_venda = 'telecom'` (regras em VendasTelecom.ts); o Comercial vê os mesmos cards no CRM. O operador: lança o contato, anota o andamento,
// envia a proposta (com o PV, como no CRM), registra perda ou desistência, FECHA O PEDIDO (empresa que fatura) e LANÇA A OP pela janela Nova OP já preenchida
// (rádio em envio de material, que cai na Separação e envio do Telecom; Fatia 2, 03/11/2026). O faturamento segue no Fiscal; a cotação pela Formação de Preços é o próximo passo.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { logChange } from './AuditSystem';
import { mostrarAviso, confirmar } from './Feedback';
import NovaOpOsModal from './NovaOpOsModal';
import FormacaoPrecosTab from './FormacaoPrecosTab';
import { Botao, Chips, Faixa, Selo, MenuAcoes, hojeISO, diaBR } from './Interface';
import Icone from './Icone';
import { combinaBusca } from './SearchUtils';
import { conferirContatoDoCard, mensagemContatoDoCard } from './ContatoObrigatorio';
import { podeAlterarNumeroOplPv } from './utils/permissoes';
import { mdiPlus, mdiMagnify, mdiSendOutline, mdiOpenInNew, mdiCheck, mdiRefresh, mdiUndoVariant, mdiCloseCircleOutline, mdiAccountOffOutline, mdiCheckCircleOutline, mdiClipboardTextOutline, mdiCurrencyUsd } from '@mdi/js';
import {
  COLUNAS_VENDAS, TEMPERATURAS, FORM_VAZIO, formDoCard, erroDoCard, camposDoCard, payloadDoCardNovo, colunaDoTipo, ehEncerrado, movimentosDoTipo,
  pvDe, erroDoEnvioDaProposta, contatoAtrasado, textoDoHistorico, PADROES_DA_OP_TELECOM, EMPRESAS_DA_VENDA, erroDoPedidoFechado,
} from './VendasTelecom';

const reais = (v: any) => v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const agoraISO = () => new Date().toISOString();

export default function VendasTelecomTab({ currentUser }) {
  const [estagios, setEstagios] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState('quadro');
  const [busca, setBusca] = useState('');
  const [janela, setJanela] = useState<any>(null);      // { card } — card null = contato novo
  const [enviar, setEnviar] = useState<any>(null);      // card que vai receber a proposta
  const [encerrar, setEncerrar] = useState<any>(null);  // { card, tipo: 'perda' | 'desistencia' }
  const [fechar, setFechar] = useState<any>(null);      // card que vai a Pedido fechado
  const [novaOp, setNovaOp] = useState<any>(null);      // card para o qual se lança a OP (a janela Nova OP já preenchida)
  const [opsPorCard, setOpsPorCard] = useState<Record<string, string[]>>({});
  const [cotar, setCotar] = useState<any>(null);      // card cuja cotação (Formação de Preços) está aberta
  const [cotacoesPorCard, setCotacoesPorCard] = useState<Record<string, number>>({});   // quantas formações cada card já tem (leitura que falha: sem selo, nunca "zero" afirmado)
  const [opsLidas, setOpsLidas] = useState(false);       // false = não deu para ler as OPs dos cards: não se afirma que "não tem OP"
  const hoje = hojeISO();

  // uma ação por vez nos botões que gravam (o clique duplo gravava duas vezes)
  const emAcao = useRef(new Set<string>());
  const umaVez = (chave: string, fn: (...a: any[]) => Promise<any>) => async (...args: any[]) => {
    if (emAcao.current.has(chave)) return undefined;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: est, error: errEst } = await supabase.from('crm_estagios_funil').select('id,nome,tipo,ordem').eq('funil', 'venda_direta').order('ordem');
      if (errEst) throw errEst;
      const lista = await lerPaginado(() => supabase.from('crm_oportunidades').select('*').eq('funil', 'venda_direta').eq('setor_venda', 'telecom')
        .order('criado_em', { ascending: false }).order('id'));
      setEstagios(est || []); setCards(lista); setErro('');
      // as OPs que cada card já gerou (o elo é `oples.crm_oportunidade_id`); em blocos, porque o filtro vai na URL
      const porCard: Record<string, string[]> = {};
      let lidas = true;
      const ids = lista.map(c => c.id);
      for (let i = 0; i < ids.length && lidas; i += 100) {
        const { data: ops, error: errOps } = await supabase.from('oples').select('opl,crm_oportunidade_id').in('crm_oportunidade_id', ids.slice(i, i + 100)).order('opl');
        if (errOps) { lidas = false; break; }
        (ops || []).forEach((o: any) => { (porCard[o.crm_oportunidade_id] = porCard[o.crm_oportunidade_id] || []).push(o.opl); });
      }
      if (lidas) setOpsPorCard(porCard);
      setOpsLidas(lidas);
      // as formações de preço de cada card (o elo é `cotacoes_precos.crm_oportunidade_id`; cada versão é uma linha)
      const cots: Record<string, number> = {};
      let cotsLidas = true;
      for (let i = 0; i < ids.length && cotsLidas; i += 100) {
        const { data: fp, error: errFp } = await supabase.from('cotacoes_precos').select('id,crm_oportunidade_id').in('crm_oportunidade_id', ids.slice(i, i + 100));
        if (errFp) { cotsLidas = false; break; }
        (fp || []).forEach((x: any) => { cots[x.crm_oportunidade_id] = (cots[x.crm_oportunidade_id] || 0) + 1; });
      }
      if (cotsLidas) setCotacoesPorCard(cots);
    } catch (e) {
      // a lista que já estava na tela fica; a faixa diz o motivo (leitura recusada nunca vira "nenhum contato")
      setErro(e?.message || 'erro desconhecido');
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    let agendado: any = null;
    const recarregar = () => { if (agendado) return; agendado = setTimeout(() => { agendado = null; carregar(true); }, 1500); };
    const canal = supabase.channel('vendas-telecom')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_oportunidades' }, recarregar)
      .subscribe();
    return () => { if (agendado) clearTimeout(agendado); supabase.removeChannel(canal); };
  }, [carregar]);

  const estagioPorId = useMemo(() => new Map(estagios.map(e => [e.id, e])), [estagios]);
  const tipoDe = (c: any) => estagioPorId.get(c.estagio_id)?.tipo;
  const estagioDoTipo = (tipo: string) => estagios.find(e => e.tipo === tipo);
  const visiveis = useMemo(() => cards.filter(c => combinaBusca([c.titulo, c.orgao, c.nome_contato, c.objeto_principal, c.numero_pv], busca)), [cards, busca]);
  const doTipoColuna = (col: any) => visiveis.filter(c => col.tipos.includes(String(tipoDe(c) || '')) || (col.id === 'lead' && !estagioPorId.has(c.estagio_id)));
  const emAndamento = cards.filter(c => ['estimativa', 'lead', 'enviado', 'aguardando_empenho'].includes(String(tipoDe(c) || ''))).length;
  const atrasados = cards.filter(c => contatoAtrasado(c, hoje, tipoDe(c))).length;

  const podeCrm = (currentUser?.abas_permitidas || []).includes('crm');
  const abrirNoCrm = (c: any) => {
    if (!podeCrm) { mostrarAviso('Você não tem a aba CRM liberada. Peça ao Comercial para abrir este card por lá.', 'atencao'); return; }
    (window as any).__acnDeepLink = { contexto: 'crm', contextoId: c.id };
    window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'crm' } }));
  };

  // ── enviar a proposta: a mesma exigência do CRM (PV de 4 dígitos, temperatura e dia do próximo contato) ──
  const comecarEnvio = (c: any) => {
    const contato = conferirContatoDoCard(c);
    if (!contato.ok) { mostrarAviso(mensagemContatoDoCard(contato, true) + '\nO contato foi aberto para você preencher.', 'atencao'); setJanela({ card: c }); return; }
    setEnviar(c);
  };

  const reativar = umaVez('reativar', async (c: any) => {
    const lead = estagioDoTipo('lead'); if (!lead) { mostrarAviso('Não encontrei a etapa Lead do funil. Tente atualizar a tela.', 'erro'); return; }
    const { data, error } = await supabase.from('crm_oportunidades').update({ estagio_id: lead.id, motivo_desistencia: null, atualizado_em: agoraISO() })
      .eq('id', c.id).eq('estagio_id', c.estagio_id).select('id');
    if (error || !data?.length) { mostrarAviso('Não foi possível reativar o contato: ' + (error?.message || 'ele mudou de etapa enquanto você olhava; atualize a tela') + '.', 'erro'); await carregar(true); return; }
    logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: c.id, changeType: 'UPDATE', oldRow: { estagio: 'Desistência' }, newRow: { estagio: 'Lead' }, user: currentUser });
    await carregar(true);
  });

  // lançar a OP: abre a Nova OP com o card, o PV e os itens da formação já preenchidos e o tipo/fluxo do Telecom (rádio em envio de material)
  const lancarOp = async (c: any) => {
    const jaTem = opsPorCard[c.id] || [];
    if (!opsLidas) { if (!await confirmar('Não consegui conferir se este contato já tem OP.\n\nLançar uma OP assim mesmo?')) return; }
    else if (jaTem.length && !await confirmar(`Este contato já tem ${jaTem.length === 1 ? 'a OP ' + jaTem[0] : 'as OPs ' + jaTem.join(', ')}.\n\nLançar mais uma OP para o mesmo contato?`)) return;
    setNovaOp(c);
  };

  const itensDoMenu = (c: any) => {
    const mov = movimentosDoTipo(tipoDe(c));
    return [
      { rotulo: 'Abrir e anotar', onClick: () => setJanela({ card: c }) },
      { rotulo: (cotacoesPorCard[c.id] || 0) ? 'Cotação (Formação de Preços)' : 'Fazer a cotação', icone: mdiCurrencyUsd, onClick: () => setCotar(c), oculto: !mov.includes('cotar') },
      { rotulo: 'Enviar proposta', icone: mdiSendOutline, onClick: () => comecarEnvio(c), oculto: !mov.includes('enviar_proposta') },
      { rotulo: 'Pedido fechado', icone: mdiCheckCircleOutline, onClick: () => setFechar(c), oculto: !mov.includes('pedido_fechado') },
      { rotulo: (opsPorCard[c.id] || []).length ? 'Lançar outra OP' : 'Lançar OP', icone: mdiClipboardTextOutline, onClick: () => lancarOp(c), oculto: !mov.includes('lancar_op') },
      { rotulo: 'Reativar contato', icone: mdiUndoVariant, onClick: () => reativar(c), oculto: !mov.includes('reativar') },
      { rotulo: 'Abrir no CRM', icone: mdiOpenInNew, onClick: () => abrirNoCrm(c) },
      { rotulo: 'Registrar perda', icone: mdiCloseCircleOutline, perigo: true, onClick: () => setEncerrar({ card: c, tipo: 'perda' }), oculto: !mov.includes('perda'), grupo: 'Encerrar' },
      { rotulo: 'O cliente desistiu', icone: mdiAccountOffOutline, perigo: true, onClick: () => setEncerrar({ card: c, tipo: 'desistencia' }), oculto: !mov.includes('desistencia'), grupo: 'Encerrar' },
    ];
  };

  const Cartao = ({ c }) => {
    const tipo = tipoDe(c);
    const atrasado = contatoAtrasado(c, hoje, tipo);
    return (
      <div className="acn-vtel-card" data-teste="vtel-card" onClick={() => setJanela({ card: c })} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') setJanela({ card: c }); }}>
        <div className="acn-vtel-card-topo">
          <span className="acn-vtel-card-nome">{c.orgao || '—'}</span>
          <span onClick={e => e.stopPropagation()}><MenuAcoes itens={itensDoMenu(c)} /></span>
        </div>
        <div className="acn-vtel-card-assunto">{c.titulo}</div>
        <div className="acn-vtel-card-meta">
          {c.nome_contato && <span>{c.nome_contato}</span>}
          {c.valor_registrado != null && <strong>{reais(c.valor_registrado)}</strong>}
          {c.numero_pv && <Selo familia="neutro" ponto={false}>PV {c.numero_pv}</Selo>}
          {(cotacoesPorCard[c.id] || 0) > 0 && !ehEncerrado(tipo) && <Selo familia="info" ponto={false} title="Este contato já tem formação de preços: clique para abrir a cotação" onClick={e => { e.stopPropagation(); setCotar(c); }}>Cotação{cotacoesPorCard[c.id] > 1 ? ` (${cotacoesPorCard[c.id]} versões)` : ''}</Selo>}
          {(opsPorCard[c.id] || []).map(o => <Selo key={o} familia="ok" ponto={false} title="OP lançada a partir deste contato">OP {o}</Selo>)}
          {String(tipo) === 'ganho' && opsLidas && !(opsPorCard[c.id] || []).length && <Selo familia="erro" ponto={false} title="O pedido está fechado, mas nenhuma OP foi lançada ainda: use Lançar OP no menu">Sem OP</Selo>}
          {c.temperatura && <Selo familia={c.temperatura === 'quente' ? 'erro' : c.temperatura === 'morno' ? 'atencao' : 'info'} ponto={false}>{TEMPERATURAS.find(t => t.id === c.temperatura)?.rotulo || c.temperatura}</Selo>}
          {String(tipo) === 'desistencia' && <Selo familia="neutro" ponto={false}>Desistiu</Selo>}
        </div>
        {c.prox_contato && (
          <div className={'acn-vtel-card-prox' + (atrasado ? ' atrasado' : '')}>
            {atrasado ? 'Contato atrasado: ' : 'Próximo contato: '}{diaBR(c.prox_contato)}{c.hora_prox_contato ? ' às ' + String(c.hora_prox_contato).slice(0, 5) : ''}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="acn-vtel" data-teste="vendas-telecom">
      <div className="acn-vtel-topo">
        <p className="acn-vtel-resumo">{carregando ? 'Carregando…' : `${emAndamento} contato(s) em andamento${atrasados ? ` · ${atrasados} com o contato atrasado` : ''}`}</p>
        <div className="acn-vtel-acoes">
          <Botao icone={mdiRefresh} onClick={() => carregar()} title="Ler de novo do banco">Atualizar</Botao>
          <Botao variante="primario" icone={mdiPlus} onClick={() => setJanela({ card: null })}>Novo contato</Botao>
        </div>
      </div>

      {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregar()}>Tentar de novo</Botao>}>Não consegui ler os contatos ({erro}). {cards.length ? 'A lista abaixo é a da última leitura.' : ''}</Faixa>}

      <div className="acn-vtel-barra">
        <Chips ativo={visao} onChange={setVisao} rotulo="Forma de ver" itens={[{ id: 'quadro', rotulo: 'Quadro' }, { id: 'lista', rotulo: 'Lista' }]} />
        <label className="acn-vtel-busca">
          <Icone path={mdiMagnify} size={16} />
          <input className="acn-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, assunto ou contato" aria-label="Buscar contato" />
        </label>
      </div>

      {!carregando && !erro && cards.length === 0 && (
        <div className="acn-vtel-vazio">Nenhum contato ainda. Use <strong>Novo contato</strong> para lançar o primeiro cliente do setor privado.</div>
      )}

      {visao === 'quadro' ? (
        <div className="acn-vtel-quadro">
          {COLUNAS_VENDAS.map(col => {
            const lista = doTipoColuna(col);
            return (
              <section key={col.id} className="acn-vtel-col" data-coluna={col.id}>
                <header className="acn-vtel-col-cab" title={col.ajuda}><span>{col.rotulo}</span><em>{lista.length}</em></header>
                <div className="acn-vtel-col-corpo">
                  {lista.length === 0 ? <div className="acn-vtel-col-vazia">Nenhum</div> : lista.map(c => <Cartao key={c.id} c={c} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="acn-vtel-tabela-caixa">
          <table className="acn-vtel-tabela">
            <thead><tr><th>Cliente</th><th>Assunto</th><th>Contato</th><th>Etapa</th><th>Valor</th><th>Próximo contato</th><th>Responsável</th><th /></tr></thead>
            <tbody>
              {visiveis.map(c => {
                const tipo = tipoDe(c); const col = colunaDoTipo(tipo);
                return (
                  <tr key={c.id} onClick={() => setJanela({ card: c })}>
                    <td><strong>{c.orgao || '—'}</strong></td>
                    <td>{c.titulo}</td>
                    <td>{c.nome_contato || '—'}</td>
                    <td><Selo familia={col.familia} ponto={false}>{String(tipo) === 'desistencia' ? 'Desistiu' : col.rotulo}</Selo></td>
                    <td>{reais(c.valor_registrado) || '—'}</td>
                    <td className={contatoAtrasado(c, hoje, tipo) ? 'acn-vtel-atrasado' : ''}>{c.prox_contato ? diaBR(c.prox_contato) : '—'}</td>
                    <td>{c.responsavel_nome || '—'}</td>
                    <td onClick={e => e.stopPropagation()}><MenuAcoes itens={itensDoMenu(c)} /></td>
                  </tr>
                );
              })}
              {!visiveis.length && <tr><td colSpan={8} className="acn-vtel-col-vazia">Nenhum contato{busca ? ' com essa busca' : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {janela && (
        <JanelaDoContato card={janela.card} encerrado={janela.card ? ehEncerrado(tipoDe(janela.card)) : false} currentUser={currentUser} umaVez={umaVez}
          estagioLeadId={estagioDoTipo('lead')?.id}
          onFechar={() => setJanela(null)} onGravado={async () => { setJanela(null); await carregar(true); }} />
      )}
      {enviar && (
        <JanelaEnvioDaProposta card={enviar} currentUser={currentUser} umaVez={umaVez} estagioEnviadoId={estagioDoTipo('enviado')?.id} nomeEtapa={estagioDoTipo('enviado')?.nome}
          onFechar={() => setEnviar(null)} onGravado={async () => { setEnviar(null); await carregar(true); }} />
      )}
      {cotar && (
        <JanelaDaCotacao card={cotar} currentUser={currentUser} onFechar={() => { setCotar(null); carregar(true); }} />
      )}
      {fechar && (
        <JanelaPedidoFechado card={fechar} currentUser={currentUser} umaVez={umaVez} estagioGanho={estagioDoTipo('ganho')}
          onFechar={() => setFechar(null)}
          onGravado={async (cardAtualizado: any) => { setFechar(null); await carregar(true); setNovaOp(cardAtualizado); }} />
      )}
      {novaOp && (
        <NovaOpOsModal isOpen currentUser={currentUser} crmCard={novaOp} padroes={PADROES_DA_OP_TELECOM}
          onClose={() => { setNovaOp(null); carregar(true); }}
          onSaved={(r: any) => { carregar(true); mostrarAviso(`OP ${r?.opl ? r.opl + ' ' : ''}lançada. Ela segue para o PCP e, em envio de material, cai na Separação e envio do Telecom.`, 'ok'); }} />
      )}
      {encerrar && (
        <JanelaDeEncerramento {...encerrar} currentUser={currentUser} umaVez={umaVez} estagio={estagioDoTipo(encerrar.tipo === 'perda' ? 'perdido' : 'desistencia')}
          onFechar={() => setEncerrar(null)} onGravado={async () => { setEncerrar(null); await carregar(true); }} />
      )}
    </div>
  );
}

// ── Contato novo ou aberto: dados do cliente, próximo contato e o andamento (a mesma tabela de histórico do CRM) ──
function JanelaDoContato({ card, encerrado, currentUser, umaVez, estagioLeadId, onFechar, onGravado }) {
  const [form, setForm] = useState(card ? formDoCard(card) : { ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [erroHistorico, setErroHistorico] = useState('');
  const [nota, setNota] = useState('');
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const lerHistorico = useCallback(async () => {
    if (!card) return;
    const { data, error } = await supabase.from('crm_historico').select('*').eq('oportunidade_id', card.id).order('criado_em', { ascending: false }).limit(100);
    if (error) { setErroHistorico(error.message); return; }
    setErroHistorico(''); setHistorico(data || []);
  }, [card?.id]);
  useEffect(() => { lerHistorico(); }, [lerHistorico]);

  const gravar = umaVez('gravar-contato', async () => {
    const msg = erroDoCard(form, { encerrado }); if (msg) { mostrarAviso(msg, 'atencao'); return; }
    if (!card && !estagioLeadId) { mostrarAviso('Não encontrei a etapa Lead do funil. Feche e abra a aba de novo.', 'erro'); return; }
    setSalvando(true);
    if (!card) {
      const p = payloadDoCardNovo(form, estagioLeadId, currentUser);
      const { data, error } = await supabase.from('crm_oportunidades').insert(p).select('id').single();
      setSalvando(false);
      if (error || !data?.id) { mostrarAviso('Não foi possível gravar o contato: ' + (error?.message || 'sem resposta') + '. Nada foi lançado; tente de novo.', 'erro'); return; }
      logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: data.id, changeType: 'CREATE', newRow: p, user: currentUser });
      mostrarAviso('Contato lançado em Lead.', 'ok');
    } else {
      const campos = camposDoCard(form);
      const { data, error } = await supabase.from('crm_oportunidades').update({ ...campos, atualizado_em: agoraISO() }).eq('id', card.id).select('id');
      setSalvando(false);
      if (error || !data?.length) { mostrarAviso('Não foi possível gravar o contato: ' + (error?.message || 'o registro não foi encontrado') + '.', 'erro'); return; }
      logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: card.id, changeType: 'UPDATE', oldRow: card, newRow: campos, user: currentUser });
    }
    await onGravado();
  });

  const anotar = umaVez('anotar-contato', async () => {
    const texto = nota.trim(); if (!texto || !card) return;
    const { error } = await supabase.from('crm_historico').insert({
      oportunidade_id: card.id, tipo: 'observacao', texto, usuario_nome: currentUser?.nome || currentUser?.email || 'Usuário', criado_em: agoraISO(),
    });
    if (error) { mostrarAviso('Não foi possível gravar a anotação: ' + error.message + '. O texto continua na caixa.', 'erro'); return; }
    setNota(''); await lerHistorico();
  });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box acn-modal-cadastro acn-vtel-janela" role="dialog" aria-label={card ? 'Contato' : 'Novo contato'} data-teste="vtel-janela">
        <div className="acn-modal-cab"><span className="modal-title">{card ? card.orgao || 'Contato' : 'Novo contato'}</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-vtel-linha2">
            <div className="form-group"><label className="acn-label" htmlFor="vt-orgao">Cliente *</label>
              <input id="vt-orgao" className="acn-input" value={form.orgao} placeholder="Shopping, condomínio, empresa…" onChange={e => set('orgao', e.target.value)} autoFocus={!card} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="vt-titulo">Assunto *</label>
              <input id="vt-titulo" className="acn-input" value={form.titulo} placeholder="Ex.: rádios para a equipe de segurança" onChange={e => set('titulo', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="acn-label" htmlFor="vt-obj">O que o cliente precisa (itens de telecom)</label>
            <textarea id="vt-obj" className="acn-input" rows={2} value={form.objeto_principal} onChange={e => set('objeto_principal', e.target.value)} /></div>
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Contato do cliente (nome e telefone ou e-mail)</div>
            <div className="acn-vtel-linha3">
              <div className="form-group"><label className="acn-label" htmlFor="vt-nome">Nome{encerrado ? '' : ' *'}</label>
                <input id="vt-nome" className="acn-input" value={form.nome_contato} onChange={e => set('nome_contato', e.target.value)} /></div>
              <div className="form-group"><label className="acn-label" htmlFor="vt-tel">Telefone</label>
                <input id="vt-tel" className="acn-input" value={form.contato} onChange={e => set('contato', e.target.value)} /></div>
              <div className="form-group"><label className="acn-label" htmlFor="vt-mail">E-mail</label>
                <input id="vt-mail" className="acn-input" type="email" value={form.contato_email} onChange={e => set('contato_email', e.target.value)} /></div>
            </div>
          </div>
          <div className="acn-vtel-linha3">
            <div className="form-group"><label className="acn-label" htmlFor="vt-valor">Valor estimado (R$)</label>
              <input id="vt-valor" className="acn-input" inputMode="decimal" value={form.valor} placeholder="0,00" onChange={e => set('valor', e.target.value)} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="vt-prox">Próximo contato</label>
              <input id="vt-prox" className="acn-input" type="date" value={form.prox_contato} onChange={e => set('prox_contato', e.target.value)} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="vt-hora">Horário</label>
              <input id="vt-hora" className="acn-input" type="time" value={form.hora_prox_contato} onChange={e => set('hora_prox_contato', e.target.value)} /></div>
          </div>
          <div className="form-group"><span className="acn-label">Temperatura</span>
            <Chips ativo={form.temperatura} onChange={v => set('temperatura', form.temperatura === v ? '' : v)} rotulo="Temperatura do lead" itens={TEMPERATURAS.map(t => ({ id: t.id, rotulo: t.rotulo }))} /></div>

          {card && (
            <div className="acn-quadro" data-teste="vtel-andamento">
              <div className="acn-quadro-titulo">Andamento</div>
              <textarea className="acn-input" rows={2} value={nota} placeholder="Anote a conversa, o que o cliente pediu, o que ficou combinado…" aria-label="Nova anotação" onChange={e => setNota(e.target.value)} />
              <Botao pequeno icone={mdiCheck} disabled={!nota.trim()} onClick={anotar}>Salvar anotação</Botao>
              {erroHistorico && <Faixa tom="erro">Não consegui ler o andamento ({erroHistorico}).</Faixa>}
              <div className="acn-vtel-historico">
                {historico.map(h => (
                  <div key={h.id} className={'acn-vtel-hist-linha' + (h.tipo === 'status_change' ? ' etapa' : '')}>
                    <div className="acn-vtel-hist-quem">{h.usuario_nome || '—'} · {h.criado_em ? new Date(h.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    <div>{textoDoHistorico(h)}</div>
                  </div>
                ))}
                {!historico.length && !erroHistorico && <div className="acn-vtel-col-vazia">Nenhuma anotação ainda.</div>}
              </div>
            </div>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar} disabled={salvando}>Fechar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={gravar} disabled={salvando}>{salvando ? 'Gravando…' : card ? 'Gravar' : 'Lançar contato'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ── Enviar a proposta: o CRM exige PV de 4 dígitos, temperatura e o próximo contato; a agenda e o histórico acompanham ──
function JanelaEnvioDaProposta({ card, currentUser, umaVez, estagioEnviadoId, nomeEtapa, onFechar, onGravado }) {
  const [pv, setPv] = useState(card.numero_pv || '');
  const [temp, setTemp] = useState(card.temperatura || '');
  const [dia, setDia] = useState(card.prox_contato && card.prox_contato >= hojeISO() ? card.prox_contato : '');
  const [hora, setHora] = useState(card.hora_prox_contato ? String(card.hora_prox_contato).slice(0, 5) : '');
  const [salvando, setSalvando] = useState(false);
  // PV já atribuído: só quem tem poder de gerente troca (a mesma regra do CRM; o banco é conferido de novo ao gravar)
  const pvTravado = !!String(card.numero_pv || '').trim() && !podeAlterarNumeroOplPv(currentUser);

  const confirmar = umaVez('enviar-proposta', async () => {
    const msg = erroDoEnvioDaProposta({ pv, temperatura: temp, data: dia }); if (msg) { mostrarAviso(msg, 'atencao'); return; }
    if (!estagioEnviadoId) { mostrarAviso('Não encontrei a etapa Enviado do funil. Feche e abra a aba de novo.', 'erro'); return; }
    const numero = pvDe(pv);
    setSalvando(true);
    const parar = (m: string, tom = 'erro') => { setSalvando(false); mostrarAviso(m, tom); };
    if (!podeAlterarNumeroOplPv(currentUser)) {
      const { data: gravado, error } = await supabase.from('crm_oportunidades').select('numero_pv').eq('id', card.id).maybeSingle();
      if (error) return parar('Não foi possível conferir o PV gravado: ' + error.message);
      const salvo = String(gravado?.numero_pv || '').trim();
      if (salvo && salvo !== numero) return parar(`O PV ${salvo} já foi atribuído a este contato. Só administradores e gerentes podem alterar o número do PV.`, 'atencao');
    }
    const { data: dup, error: errDup } = await supabase.from('crm_oportunidades').select('id,titulo').eq('numero_pv', numero).neq('id', card.id).maybeSingle();
    if (errDup) return parar('Não foi possível conferir se o PV já existe: ' + errDup.message);
    if (dup) return parar(`O PV ${numero} já está em uso em "${dup.titulo}". Informe outro número.`, 'atencao');

    const campos = { estagio_id: estagioEnviadoId, numero_pv: numero, temperatura: temp, prox_contato: dia, hora_prox_contato: hora || null, atualizado_em: agoraISO() };
    // só grava se o contato ainda está na etapa em que a tela o mostrou (outra pessoa pode tê-lo movido)
    const { data: ok, error: errCard } = await supabase.from('crm_oportunidades').update(campos).eq('id', card.id).eq('estagio_id', card.estagio_id).select('id');
    if (errCard || !ok?.length) return parar('Não foi possível enviar a proposta: ' + (errCard?.message || 'o contato mudou de etapa enquanto a janela estava aberta; atualize a tela') + '.');
    logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: card.id, changeType: 'UPDATE', oldRow: card, newRow: campos, user: currentUser });

    const faltou: string[] = [];
    const { error: errAgenda } = await supabase.from('agenda_compromissos').insert([{
      setor: 'comercial', usuario_email: currentUser?.email, usuario_nome: card.responsavel_nome || currentUser?.nome,
      titulo: `Contato — ${card.titulo}`, descricao: `PV ${numero} · Temperatura: ${temp}`,
      data_hora: new Date(`${dia}T${hora || '09:00'}:00`).toISOString(),
    }]);
    if (errAgenda) faltou.push(`o compromisso na agenda não foi criado (${errAgenda.message})`);
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: card.id, tipo: 'status_change', estagio_novo: nomeEtapa,
      conteudo: `PV ${numero} atribuído · Temperatura: ${temp} · Próximo contato: ${dia}${hora ? ' ' + hora : ''}`, usuario_nome: currentUser?.nome,
    });
    if (errHist) faltou.push(`o registro no histórico não foi gravado (${errHist.message})`);
    setSalvando(false);
    if (faltou.length) mostrarAviso(`A proposta foi enviada, mas ${faltou.join(' e ')}.`, 'atencao');
    await onGravado();
  });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onFechar(); }}>
      <div className="modal-box acn-modal-cadastro acn-vtel-janela-estreita" role="dialog" aria-label="Enviar proposta" data-teste="vtel-enviar">
        <div className="acn-modal-cab"><span className="modal-title"><Icone path={mdiSendOutline} size={16} /> Enviar proposta</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div><strong>{card.orgao}</strong> — {card.titulo}</div>
          <div className="form-group"><label className="acn-label" htmlFor="vt-pv">Número do PV (4 dígitos) *</label>
            <input id="vt-pv" className="acn-input" value={pv} placeholder="0000" maxLength={4} disabled={pvTravado} autoFocus={!pvTravado}
              title={pvTravado ? 'PV já atribuído. Só administradores e gerentes podem alterar o número.' : undefined} onChange={e => setPv(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
          <div className="form-group"><span className="acn-label">Temperatura do lead *</span>
            <Chips ativo={temp} onChange={setTemp} rotulo="Temperatura do lead" itens={TEMPERATURAS.map(t => ({ id: t.id, rotulo: t.rotulo }))} /></div>
          <div className="acn-vtel-linha2">
            <div className="form-group"><label className="acn-label" htmlFor="vt-env-dia">Próximo contato *</label>
              <input id="vt-env-dia" className="acn-input" type="date" min={hojeISO()} value={dia} onChange={e => setDia(e.target.value)} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="vt-env-hora">Horário</label>
              <input id="vt-env-hora" className="acn-input" type="time" value={hora} onChange={e => setHora(e.target.value)} /></div>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={confirmar} disabled={salvando}>{salvando ? 'Gravando…' : 'Confirmar envio'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ── Cotação: a mesma Formação de Preços do card do CRM, embutida e ligada ao card (a conta de preço é a oficial do sistema; markup, custo e DIFAL são da formação) ──
// Só fecha pelo botão: o clique fora da janela perderia uma formação ainda não salva. O catálogo é o inteiro (não há marca de "item de telecom" nos itens).
function JanelaDaCotacao({ card, currentUser, onFechar }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-vtel-janela-larga" role="dialog" aria-label="Cotação" data-teste="vtel-cotacao">
        <div className="acn-modal-cab"><span className="modal-title"><Icone path={mdiCurrencyUsd} size={16} /> Cotação — {card.orgao}</span></div>
        <div className="acn-modal-corpo">
          <FormacaoPrecosTab key={card.id} currentUser={currentUser} vinculo={{ tipo: 'crm', id: card.id }} rotulo={card.titulo || ''} embutido />
        </div>
        <div className="acn-modal-rodape"><Botao onClick={onFechar}>Fechar</Botao></div>
      </div>
    </div>
  );
}

// ── Pedido fechado: o card vai a "Empenhado" com a empresa que fatura (como a janela "Qual empresa venceu?" do CRM) e a OP é lançada em seguida ──
function JanelaPedidoFechado({ card, estagioGanho, currentUser, umaVez, onFechar, onGravado }) {
  const [empresa, setEmpresa] = useState(/detech/i.test(card.faturamento_empresa || '') ? 'DETECH' : 'ACN');
  const [salvando, setSalvando] = useState(false);
  const confirmar = umaVez('pedido-fechado', async () => {
    const msg = erroDoPedidoFechado({ numero_pv: card.numero_pv, empresa }); if (msg) { mostrarAviso(msg, 'atencao'); return; }
    if (!estagioGanho) { mostrarAviso('Não encontrei a etapa do pedido fechado no funil. Feche e abra a aba de novo.', 'erro'); return; }
    setSalvando(true);
    const campos = { estagio_id: estagioGanho.id, empresa_vencedora: empresa, atualizado_em: agoraISO() };
    // só grava se o contato ainda está na etapa em que a tela o mostrou
    const { data, error } = await supabase.from('crm_oportunidades').update(campos).eq('id', card.id).eq('estagio_id', card.estagio_id).select('id');
    if (error || !data?.length) { setSalvando(false); mostrarAviso('Não foi possível fechar o pedido: ' + (error?.message || 'o contato mudou de etapa enquanto a janela estava aberta; atualize a tela') + '.', 'erro'); return; }
    logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: card.id, changeType: 'UPDATE', oldRow: card, newRow: campos, user: currentUser });
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: card.id, tipo: 'status_change', estagio_novo: estagioGanho.nome, conteudo: `Pedido fechado · Empresa que fatura: ${empresa === 'DETECH' ? 'Detech' : 'ACN'}`, usuario_nome: currentUser?.nome,
    });
    setSalvando(false);
    if (errHist) mostrarAviso(`O pedido foi fechado, mas o histórico não foi gravado (${errHist.message}).`, 'atencao');
    await onGravado({ ...card, ...campos });
  });
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onFechar(); }}>
      <div className="modal-box acn-modal-cadastro acn-vtel-janela-estreita" role="dialog" aria-label="Pedido fechado" data-teste="vtel-fechar">
        <div className="acn-modal-cab"><span className="modal-title"><Icone path={mdiCheckCircleOutline} size={16} /> Pedido fechado</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div><strong>{card.orgao}</strong> — {card.titulo}{card.numero_pv ? ` (PV ${card.numero_pv})` : ''}</div>
          <div className="form-group"><span className="acn-label">Empresa que vai faturar *</span>
            <Chips ativo={empresa} onChange={setEmpresa} rotulo="Empresa que fatura" itens={EMPRESAS_DA_VENDA.map(e => ({ id: e.id, rotulo: e.rotulo }))} /></div>
          <div className="acn-ajuda">Ao confirmar, o contato vai para Pedido fechado e abre a janela da OP já preenchida: rádio em envio de material, com o PV e os itens da Formação de Preços. Se você fechar a janela da OP sem salvar, o contato fica com o selo "Sem OP" e o menu oferece "Lançar OP".</div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={confirmar} disabled={salvando}>{salvando ? 'Gravando…' : 'Fechar pedido e lançar a OP'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ── Perda ou desistência: o motivo é obrigatório e vai para o histórico do card ──
function JanelaDeEncerramento({ card, tipo, estagio, currentUser, umaVez, onFechar, onGravado }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const perda = tipo === 'perda';
  const confirmar = umaVez('encerrar-contato', async () => {
    const texto = motivo.trim();
    if (!texto) { mostrarAviso(perda ? 'Diga por que a venda foi perdida.' : 'Diga por que o cliente desistiu.', 'atencao'); return; }
    if (!estagio) { mostrarAviso('Não encontrei a etapa no funil. Feche e abra a aba de novo.', 'erro'); return; }
    setSalvando(true);
    const campos = { estagio_id: estagio.id, atualizado_em: agoraISO(), ...(perda ? { motivo_perda: texto } : { motivo_desistencia: texto }) };
    const { data, error } = await supabase.from('crm_oportunidades').update(campos).eq('id', card.id).eq('estagio_id', card.estagio_id).select('id');
    if (error || !data?.length) { setSalvando(false); mostrarAviso(`Não foi possível registrar ${perda ? 'a perda' : 'a desistência'}: ` + (error?.message || 'o contato mudou de etapa enquanto a janela estava aberta; atualize a tela') + '.', 'erro'); return; }
    logChange({ module: 'crm', entityType: 'crm_oportunidades', entityId: card.id, changeType: 'UPDATE', oldRow: card, newRow: campos, user: currentUser });
    const { error: errHist } = await supabase.from('crm_historico').insert({
      oportunidade_id: card.id, tipo: 'status_change', estagio_novo: estagio.nome, conteudo: perda ? texto : `Desistência: ${texto}`, usuario_nome: currentUser?.nome,
    });
    setSalvando(false);
    if (errHist) mostrarAviso(`${perda ? 'A perda' : 'A desistência'} foi registrada, mas o histórico não foi gravado (${errHist.message}).`, 'atencao');
    await onGravado();
  });
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onFechar(); }}>
      <div className="modal-box acn-modal-cadastro acn-vtel-janela-estreita" role="dialog" aria-label={perda ? 'Registrar perda' : 'O cliente desistiu'} data-teste="vtel-encerrar">
        <div className="acn-modal-cab"><span className="modal-title">{perda ? 'Registrar perda' : 'O cliente desistiu'}</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div><strong>{card.orgao}</strong> — {card.titulo}</div>
          <Faixa tom="erro">{perda ? 'O contato vai para Perdido.' : 'O contato vai para Perdido como desistência; dá para reativá-lo depois.'}</Faixa>
          <div className="form-group"><label className="acn-label" htmlFor="vt-motivo">Motivo *</label>
            <textarea id="vt-motivo" className="acn-input" rows={3} value={motivo} autoFocus onChange={e => setMotivo(e.target.value)} /></div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="perigo" icone={mdiCheck} onClick={confirmar} disabled={salvando}>{salvando ? 'Gravando…' : 'Confirmar'}</Botao>
        </div>
      </div>
    </div>
  );
}
