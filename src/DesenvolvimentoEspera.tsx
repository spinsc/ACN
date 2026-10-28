// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — a caixa "Material do desenvolvimento" (pedido do usuário em 28/10/2026)
//
// Um desenvolvimento pode depender de itens de uma OC da OP: o suporte da barra sinalizadora só começa quando chega o rack de teto comprado. A demanda liga aos ITENS esperados;
// a Logística marca o que chegou; o banco avisa a Engenharia na caixa de Menções e libera o início. As regras estão em EsperaDeMaterial.ts e em DesenvolvimentoModelo.ts
// (`estadoGuardadoDaEspera`, `esperaBloqueia`); aqui ficam só a leitura do que chegou e as peças de tela. Toda gravação segue a rotina segura da demanda (`useExecutar`).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import Icone from './Icone';
import { Botao, Faixa, Selo } from './Interface';
import { pedirTexto, mostrarAviso } from './Feedback';
import { ParticipantesPicker } from './Participantes';
import { useExecutar } from './DesenvolvimentoPorta';
import { ehGerenteDev, estadoGuardadoDaEspera, solicitanteDaDemanda } from './DesenvolvimentoModelo';
import { itensDaOC, numeroDaOC, chegadaDoItem, situacaoDaEspera, lerEsperaAgora, lerComprasParaEspera, lerChegadasDe, ligarItens, retirarEspera, liberarEspera } from './EsperaDeMaterial';
import { mdiPackageVariantClosed, mdiLinkVariantPlus, mdiLockOpenVariantOutline, mdiClose } from '@mdi/js';

const dataBR = (iso: any) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const dia = (d: any) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const qtd = (n: any) => (n == null ? '' : Number(n).toLocaleString('pt-BR'));

// ─── a caixa na demanda ─────────────────────────────────────────────────────────────────────────────────────────────
export function CaixaDeEspera({ demanda, currentUser, onAtualizado }: any) {
  const estado = estadoGuardadoDaEspera(demanda);
  const [executar, ocupado] = useExecutar(demanda.id, onAtualizado);
  const [abrindo, setAbrindo] = useState(false);
  const [vivo, setVivo] = useState<any>({ carregando: false, pedidos: [], chegadas: [], erro: '' });
  const chave = JSON.stringify(demanda.espera_material?.itens || []) + '|' + (demanda.espera_material?.chegou_em || '');

  useEffect(() => {
    let ativo = true;
    if (estado === 'sem') { setVivo({ carregando: false, pedidos: [], chegadas: [], erro: '' }); return () => { ativo = false; }; }
    setVivo((v: any) => ({ ...v, carregando: true }));
    lerEsperaAgora(demanda.espera_material).then(r => { if (ativo) setVivo({ carregando: false, ...r }); });
    return () => { ativo = false; };
  }, [chave]);

  const situacao = useMemo(() => situacaoDaEspera(demanda.espera_material, vivo.pedidos, vivo.chegadas), [chave, vivo]);
  const gerente = ehGerenteDev(currentUser);
  const etapas = demanda.etapas || [];
  const proxima = etapas.find((e: any) => e.status !== 'concluida');
  const faltaIniciar = proxima?.status === 'pendente';

  if (estado === 'sem') {
    if (demanda.situacao === 'cancelada') return null;
    return (
      <div className="acn-dev-espera-vazia">
        <Botao variante="discreto" pequeno icone={mdiPackageVariantClosed} onClick={() => setAbrindo(true)}
          title="Use quando o desenvolvimento só pode começar depois que chegar material de uma compra da OP">
          Esperar material de uma compra
        </Botao>
        {abrindo && <ModalItensEsperados demanda={demanda} currentUser={currentUser} executar={executar} onClose={() => setAbrindo(false)} />}
      </div>
    );
  }

  const e = demanda.espera_material;
  const total = e.itens.length;
  const problemas = situacao.itens.filter((i: any) => ['descartada', 'sumiu', 'mudou'].includes(i.estado));
  const retirar = async () => {
    const motivo = await pedirTexto('Por que este desenvolvimento deixa de esperar o material? O motivo fica no histórico da demanda.');
    if (motivo === null) return;
    await executar((d: any, agora: string) => retirarEspera(d, currentUser, motivo, agora));
  };
  const liberar = async () => {
    const motivo = await pedirTexto('Liberar o desenvolvimento ANTES de o material chegar? Escreva o motivo: ele fica no histórico e a Engenharia deixa de esperar o aviso.');
    if (motivo === null) return;
    await executar((d: any, agora: string) => liberarEspera(d, currentUser, motivo, agora));
  };

  return (
    <div className="acn-quadro" data-teste="espera-material">
      <div className="acn-quadro-titulo">
        <span><Icone path={mdiPackageVariantClosed} size={14} /> Material do desenvolvimento</span>
        {estado === 'aguardando' && <Selo familia="atencao">Aguardando material</Selo>}
        {estado === 'chegou' && <Selo familia="ok">Material chegou</Selo>}
        {estado === 'liberada' && <Selo familia="info" ponto={false}>Liberado sem esperar</Selo>}
      </div>

      {estado === 'aguardando' && (
        <Faixa tom="atencao">
          Este desenvolvimento só pode ser iniciado quando chegar o material{vivo.carregando || vivo.erro ? '' : `: faltam ${situacao.faltam} de ${total} ${total === 1 ? 'item' : 'itens'}`}.
          A Engenharia é avisada na caixa de Menções assim que chegar.
        </Faixa>
      )}
      {estado === 'chegou' && faltaIniciar && (
        <Faixa tom="erro">O material chegou em {dataBR(e.chegou_em)}: a Engenharia já pode iniciar o desenvolvimento.</Faixa>
      )}
      {estado === 'chegou' && !faltaIniciar && <div className="acn-ajuda">O material chegou em {dataBR(e.chegou_em)}.</div>}
      {estado === 'liberada' && (
        <div className="acn-ajuda">Liberado por <strong>{e.liberada.por}</strong> em {dataBR(e.liberada.em)}, sem esperar o material. Motivo: {e.liberada.motivo}</div>
      )}
      {vivo.erro && <Faixa tom="erro">Não foi possível conferir a situação das compras agora ({vivo.erro}). A lista abaixo pode estar desatualizada.</Faixa>}
      {estado === 'aguardando' && problemas.length > 0 && (
        <Faixa tom="erro">
          {problemas.map((p: any) => `${p.nome}: ${p.estado === 'descartada' ? 'a compra foi descartada, o material não vai chegar' : p.estado === 'sumiu' ? 'a compra não foi encontrada' : 'o item mudou na compra'}`).join('; ')}.
          Altere os itens esperados ou peça a um gerente para liberar.
        </Faixa>
      )}

      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Item</th><th>Compra</th><th>Previsão</th><th>Situação</th></tr></thead>
          <tbody>
            {situacao.itens.map((i: any) => (
              <tr key={i.pedido_id + i.chave}>
                <td>{i.nome}</td>
                <td>{i.pedido ? numeroDaOC(i.pedido) : i.numero || '—'}<div className="acn-fraco">{i.pedido?.fornecedor || i.fornecedor || ''}{i.pedido ? ` · ${i.pedido.status_compra}` : ''}</div></td>
                <td>{i.pedido ? dia(i.pedido.data_prevista_recebimento || i.pedido.prazo_entrega) : '—'}</td>
                <td>
                  {vivo.carregando && !vivo.pedidos.length ? <span className="acn-fraco">Conferindo…</span>
                    : i.estado === 'chegou' ? <Selo familia="ok" ponto={false}>{i.chegada.pelaOC ? 'Chegou (OC recebida)' : `Chegou ${qtd(i.chegada.quantidade)}${i.pedida ? ` de ${qtd(i.pedida)}` : ''}`}</Selo>
                    : i.estado === 'aguardando' ? <Selo familia="atencao" ponto={false}>Aguardando</Selo>
                    : <Selo familia="erro" ponto={false}>{i.estado === 'descartada' ? 'Compra descartada' : i.estado === 'sumiu' ? 'Compra não achada' : 'Item mudou'}</Selo>}
                  {i.estado === 'chegou' && !i.chegada.pelaOC && i.chegada.em && <div className="acn-fraco">{dataBR(i.chegada.em)}{i.chegada.por ? ` · ${i.chegada.por}` : ''}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(e.avisar || []).length > 0 && <div className="acn-ajuda">Avisa quando chegar: {e.avisar.map((p: any) => p.nome).join(', ')}.</div>}

      <div className="acn-dev-acoes">
        {demanda.situacao !== 'cancelada' && <Botao pequeno icone={mdiLinkVariantPlus} disabled={ocupado} onClick={() => setAbrindo(true)}>Alterar itens esperados</Botao>}
        {estado === 'aguardando' && gerente && <Botao pequeno variante="perigo-sec" icone={mdiLockOpenVariantOutline} disabled={ocupado} onClick={liberar}>Liberar mesmo assim</Botao>}
        <Botao pequeno variante="discreto" disabled={ocupado} onClick={retirar}>Retirar a espera</Botao>
      </div>
      {abrindo && <ModalItensEsperados demanda={demanda} currentUser={currentUser} executar={executar} onClose={() => setAbrindo(false)} />}
    </div>
  );
}

// ─── escolher os itens esperados ────────────────────────────────────────────────────────────────────────────────────
function ModalItensEsperados({ demanda, currentUser, executar, onClose }: any) {
  const atual = demanda.espera_material;
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [estado, setEstado] = useState<any>({ carregando: true, lista: [], chegadas: [], erro: '' });
  const [escolhidos, setEscolhidos] = useState<Record<string, any>>(() => Object.fromEntries((atual?.itens || []).map((i: any) => [`${i.pedido_id}|${i.chave}`, i])));
  const sol = solicitanteDaDemanda(demanda);
  const [avisar, setAvisar] = useState<any[]>(() => atual?.avisar?.length ? atual.avisar : [currentUser, sol].filter(p => p?.email).map(p => ({ email: p.email, nome: p.nome || p.email })).filter((p, i, a) => a.findIndex(x => String(x.email).toLowerCase() === String(p.email).toLowerCase()) === i));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setEstado((s: any) => ({ ...s, carregando: true }));
    (async () => {
      const r = await lerComprasParaEspera(demanda, buscaAplicada);
      const c = r.erro ? { chegadas: [], erro: '' } : await lerChegadasDe(r.lista.map((p: any) => String(p.id)));
      if (ativo) setEstado({ carregando: false, lista: r.lista, chegadas: c.chegadas, erro: r.erro || c.erro });
    })();
    return () => { ativo = false; };
  }, [buscaAplicada, demanda.id]);

  const alternar = (p: any, it: any) => {
    const k = `${p.id}|${it.chave}`;
    setEscolhidos(s => { const n = { ...s }; if (n[k]) delete n[k]; else n[k] = { pedido_id: String(p.id), chave: it.chave, nome: it.nome, numero: numeroDaOC(p), fornecedor: p.fornecedor || '' }; return n; });
  };
  const links = Object.values(escolhidos);

  const salvar = async () => {
    if (!links.length) { setErro('Escolha pelo menos um item.'); return; }
    setSalvando(true); setErro('');
    try {
      // o que já chegou é lido de novo na hora de gravar: a demanda nasce liberada se tudo o que ela espera já está aqui
      const agora = await lerEsperaAgora({ itens: links });
      if (agora.erro) { setErro(`Não foi possível conferir o que já chegou (${agora.erro}). Nada foi gravado.`); return; }
      const jaChegaram = situacaoDaEspera({ itens: links }, agora.pedidos, agora.chegadas).todos;
      const r = await executar((d: any, ag: string) => ligarItens(d, links, avisar, currentUser, jaChegaram, ag));
      if (r) { mostrarAviso(jaChegaram ? 'Todo o material escolhido já chegou: o desenvolvimento está liberado.' : 'A demanda agora espera o material. A Engenharia será avisada quando chegar.', jaChegaram ? 'ok' : 'info'); onClose(); }
    } finally { setSalvando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Itens esperados pelo desenvolvimento" data-teste="itens-esperados">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPackageVariantClosed} size={16} /> Material que o desenvolvimento espera</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" onClick={onClose} disabled={salvando} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            {demanda.numero_opl ? <>Compras da OP <strong>{demanda.numero_opl}</strong>. </> : 'Esta demanda não tem OP: busque a compra pelo número ou pelo material. '}
            Marque o(s) item(ns) que precisam chegar antes de o desenvolvimento começar; o primeiro que chegar de cada item conta.
          </div>
          <div className="acn-dev-busca-compra">
            <input className="acn-input" placeholder="Buscar outra compra por número da OC, do pedido ou material…" value={busca} aria-label="Buscar compra"
              onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setBuscaAplicada(busca); }} />
            <Botao pequeno onClick={() => setBuscaAplicada(busca)}>Buscar</Botao>
            {buscaAplicada && <Botao pequeno variante="discreto" onClick={() => { setBusca(''); setBuscaAplicada(''); }}>Voltar às compras da OP</Botao>}
          </div>

          {estado.erro && <Faixa tom="erro">Não foi possível ler as compras ({estado.erro}).</Faixa>}
          {estado.carregando ? <div className="acn-empty">Carregando…</div>
            : !estado.lista.length && !estado.erro ? <div className="acn-empty">{buscaAplicada ? 'Nenhuma compra encontrada com essa busca.' : 'Nenhuma compra ligada a esta OP. Busque pelo número da OC ou pelo material.'}</div>
            : estado.lista.map((p: any) => (
              <div key={p.id} className="acn-dev-compra-bloco">
                <div className="acn-dev-compra-cab"><strong>{numeroDaOC(p)}</strong> · {p.fornecedor || 'fornecedor a definir'} <Selo familia="neutro" ponto={false}>{p.status_compra}</Selo>
                  {p.numero_oc && p.numero_pedido ? <span className="acn-fraco"> (pedido {p.numero_pedido})</span> : null}
                  <div className="acn-fraco">{p.descricao_material}</div></div>
                {itensDaOC(p).map(it => {
                  const k = `${p.id}|${it.chave}`; const c = chegadaDoItem(p, estado.chegadas, it);
                  return (
                    <label key={k} className="acn-dev-compra-item">
                      <input type="checkbox" checked={!!escolhidos[k]} onChange={() => alternar(p, it)} />
                      <span>{it.nome}{it.quantidade ? <span className="acn-fraco"> · {qtd(it.quantidade)} un.</span> : null}</span>
                      {c.chegou && <Selo familia="ok" ponto={false}>{c.pelaOC ? 'Chegou (OC recebida)' : `Chegou ${qtd(c.quantidade)}`}</Selo>}
                    </label>
                  );
                })}
              </div>
            ))}

          {Object.values(escolhidos).some((i: any) => !estado.lista.some((p: any) => String(p.id) === String(i.pedido_id))) && (
            <div className="acn-ajuda">Também marcados, de outras compras: {Object.values(escolhidos).filter((i: any) => !estado.lista.some((p: any) => String(p.id) === String(i.pedido_id))).map((i: any) => `${i.nome} (${i.numero || 'compra'})`).join('; ')}.</div>
          )}

          <ParticipantesPicker value={avisar} onChange={setAvisar} rotulo="Quem a Engenharia avisa quando o material chegar (caixa de Menções)" />
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiPackageVariantClosed} disabled={salvando || !links.length} onClick={salvar}>{salvando ? 'Gravando…' : `Esperar ${links.length || ''} ${links.length === 1 ? 'item' : 'itens'}`.replace('  ', ' ')}</Botao>
        </div>
      </div>
    </div>
  );
}
