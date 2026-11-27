// ─────────────────────────────────────────────────────────────────────────────
// ENTREGA POR FORNECEDOR — as peças de tela (pedido do usuário em 17/11/2026; as regras estão em ComprasEntregas.ts).
//  • PrevisaoDoPedido: a data (ou uma data por fornecedor) no cartão e na linha do Compras;
//  • QuadroDeEntregas: o quadro do Resumo do pedido, um fornecedor por linha, com a situação;
//  • ModalPrazoDeEntrega: o comprador ajusta a data de um ou de vários fornecedores, com motivo opcional.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiCalendarOutline, mdiCheck } from '@mdi/js';
import { entregasDoPedido, abertasDoPedido, estaAtrasada, dataBr, dataCurta, chaveDaEntrega, itensComPosicao } from './ComprasEntregas';

const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

/** A previsão de chegada no cartão/linha: uma data (pedido de um fornecedor) ou uma por fornecedor. Pedido sem entrega (ainda não comprado) não mostra nada. */
export function PrevisaoDoPedido({ pedido, linhas, comAno = false }: any) {
  const entregas = entregasDoPedido(pedido, linhas);
  if (!entregas.length) return null;
  const hoje = hojeLocal();
  const f = comAno ? dataBr : dataCurta;
  if (entregas.length === 1) return <span data-previsao>{f(entregas[0].data_prevista)}</span>;
  return (
    <span className="acn-ent-lista" data-previsao>
      {entregas.map((e: any) => (
        <span key={chaveDaEntrega(e)} className={'acn-ent-linha' + (estaAtrasada(e, hoje) ? ' atrasada' : e.situacao === 'recebida' ? ' recebida' : '')} title={e.fornecedor}>
          <span className="acn-ent-forn">{e.fornecedor}</span>
          <span className="acn-ent-dia">{e.situacao === 'recebida' ? `recebida ${dataCurta(e.data_recebimento_real || e.data_prevista)}` : f(e.data_prevista)}</span>
        </span>
      ))}
    </span>
  );
}

const ROTULO_SITUACAO = { aguardando: 'Aguardando', divergencia: 'Divergência', recebida: 'Recebida' };

/** O quadro do Resumo: cada fornecedor com a sua data, os itens dele e se já chegou. */
export function QuadroDeEntregas({ pedido, linhas, coleta = false }: any) {
  const entregas = entregasDoPedido(pedido, linhas);
  if (!entregas.length) return null;
  const hoje = hojeLocal();
  const itens = itensComPosicao(pedido);
  const nomesDe = (e: any) => (e.itens?.length ? itens.filter((i: any) => e.itens.includes(i.indice)) : []).map((i: any) => String(i.nome));
  return (
    <div className="acn-quadro" data-entregas>
      <div className="acn-quadro-titulo">{entregas.length > 1 ? 'Entrega por fornecedor' : coleta ? 'Coleta' : 'Entrega'}</div>
      {entregas.map((e: any) => {
        const atrasada = estaAtrasada(e, hoje);
        const nomes = nomesDe(e);
        return (
          <div key={chaveDaEntrega(e)} className="acn-ent-quadro-linha" data-entrega-fornecedor={e.fornecedor}>
            <div className="acn-ent-quadro-topo">
              <strong className="acn-ent-quadro-forn">{e.fornecedor}</strong>
              <span className="acn-ent-quadro-data">{coleta ? 'Coleta' : 'Entrega'} {dataBr(e.data_prevista)}</span>
              {e.situacao === 'recebida'
                ? <Selo familia="ok" ponto={false}>Recebida{e.data_recebimento_real ? ` em ${dataBr(e.data_recebimento_real)}` : ''}</Selo>
                : atrasada
                  ? <Selo familia="erro" ponto={false}>Atrasada</Selo>
                  : <Selo familia={e.situacao === 'divergencia' ? 'atencao' : 'neutro'} ponto={false}>{ROTULO_SITUACAO[e.situacao]}</Selo>}
            </div>
            {nomes.length > 0 && <div className="acn-ajuda acn-ent-quadro-itens">{nomes.join(' · ')}</div>}
            {e.numero_nf && <div className="acn-ajuda">NF {e.numero_nf}</div>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A janela de ajustar o prazo. Cada fornecedor com entrega aberta tem o seu campo de data (um só, se o pedido tem um fornecedor só);
 * `onSalvar(novas, motivo)` devolve true se gravou. Entrega já recebida não aparece: a data dela não muda mais.
 */
export function ModalPrazoDeEntrega({ pedido, linhas, coleta = false, onSalvar, onClose }: any) {
  const todas = entregasDoPedido(pedido, linhas);
  const abertas = abertasDoPedido(todas);
  const [datas, setDatas] = useState<Record<string, string>>(() => Object.fromEntries(abertas.map((e: any) => [chaveDaEntrega(e), e.data_prevista || ''])));
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const varias = todas.length > 1;
  const salvar = async () => {
    if (salvando) return;
    if (abertas.some((e: any) => !datas[chaveDaEntrega(e)])) { alert(varias ? 'Informe a data de cada fornecedor.' : 'Informe a nova data de entrega.'); return; }
    setSalvando(true);
    const ok = await onSalvar(datas, motivo, todas);
    setSalvando(false);
    if (ok) onClose();
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cmp-j420" role="dialog" aria-label={varias ? 'Datas de entrega por fornecedor' : 'Prazo de entrega'}>
        <div className="acn-modal-cab">
          <span className="modal-title acn-prod-ic"><Icone path={mdiCalendarOutline} size={16} /> {varias ? 'Datas de entrega' : coleta ? 'Dia da coleta' : 'Prazo de entrega'} — {pedido.numero_pedido}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">{pedido.descricao_material}</div>
          {abertas.length === 0 && <div className="acn-ajuda">Todas as entregas deste pedido já foram recebidas.</div>}
          {abertas.map((e: any) => {
            const chave = chaveDaEntrega(e);
            const rotulo = varias ? `${coleta ? 'Dia da coleta' : 'Nova data de entrega'} — ${e.fornecedor} *` : (coleta ? 'Novo dia da coleta *' : 'Nova data de entrega *');
            return (
              <div className="form-group" key={chave} data-entrega-fornecedor={e.fornecedor}>
                <label className="acn-label">{rotulo}</label>
                <input type="date" className="acn-input" aria-label={rotulo.replace(' *', '')} value={datas[chave] || ''} onChange={ev => setDatas(d => ({ ...d, [chave]: ev.target.value }))} />
              </div>
            );
          })}
          <div className="form-group">
            <label className="acn-label">Motivo (opcional)</label>
            <input className="acn-input" placeholder="Ex.: fornecedor adiou o envio" value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
          <div className="acn-ajuda">A alteração fica no histórico do pedido, com a data anterior de cada fornecedor.</div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" icone={mdiCheck} onClick={salvar} disabled={salvando || abertas.length === 0}>{salvando ? 'Salvando…' : varias ? 'Salvar datas' : 'Salvar prazo'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
