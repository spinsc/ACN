// @ts-nocheck
// Serviços de terceiros, fatia T5 (23/11/2026): a janela "Pedir pagamento" e a caixa que diz como está o pagamento do serviço (PLANO_SERVICOS_TERCEIROS.md).
// Decidido com o usuário em 23/11/2026: UM pedido por visita ou ordem. A janela abre já preenchida com o prestador (favorecido e CNPJ ou CPF); quem pede completa o vencimento e os dados para pagar.
// O valor NÃO é digitado aqui: o banco soma o valor final dos serviços (TerceirosPagamento.ts), então a tela e o Financeiro nunca divergem. Quem não vê valores também pede (não vê o total).
// A caixa `CaixaDoPagamento` vale para um serviço, para os carros marcados de um grupo e para os serviços de uma ordem: mostra quantos já foram pagos, quantos estão com o Financeiro e quantos ainda podem ser pedidos.
import React, { useState } from 'react';
import { mdiClose, mdiCashMultiple } from '@mdi/js';
import { Botao, Faixa, Chips, Selo } from './Interface';
import { TIPOS_DE_CUSTO, FORMAS_DE_PAGAMENTO } from './PagamentoDeTerceiro';
import { reaisDoServico, veValores, situacaoDoPagamento } from './TerceirosFluxo';
import { resumoDosServicos } from './TerceirosAcoes';
import { momentoBR } from './TerceirosPecas';
import { formInicialDoPagamento, erroDoPedidoDePagamento, motivoQueNaoPedePagamento, pedirPagamento, somaDosValoresFinais } from './TerceirosPagamento';

// ═══ A JANELA ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * `servicos` são os que o pedido cobre (já conferidos pela tela: realizados, do mesmo prestador, sem pedido aberto); o banco confere tudo de novo.
 * `aoGravar(resposta, servicosDeAntes)` recebe o que o banco confirmou (a demanda, o total e as linhas dos serviços).
 */
export function ModalPedirPagamento({ servicos, prestador, tipos, currentUser, onClose, aoGravar, aoRecarregar }) {
  const tipoDe = (s: any) => tipos.find((t: any) => t.id === s.tipo_id);
  const ids = servicos.map((s: any) => s.id);
  const verV = veValores(currentUser);
  const [f, setF] = useState(() => formInicialDoPagamento(prestador));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const varios = servicos.length > 1;
  const titulo = `Pedir pagamento${varios ? ` (${servicos.length} serviços)` : ''}`;   // o nome da janela para o leitor de tela é o mesmo título que a pessoa vê
  const set = (k: string, v: string) => setF((a: any) => ({ ...a, [k]: v }));
  const total = somaDosValoresFinais(servicos);
  const ligacoes = [...new Set(servicos.map((s: any) => s.ligacao_rotulo ? `${String(s.ligacao_tipo || '').toUpperCase()} ${s.ligacao_rotulo}`.trim() : '').filter(Boolean))];

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDoPedidoDePagamento(f) || motivoQueNaoPedePagamento(servicos, currentUser, tipoDe);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    const r = await pedirPagamento(ids, f);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, servicos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-p" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{resumoDosServicos(servicos, tipoDe)}</div>
          <p className="acn-terc-dica">
            O pedido abre UMA demanda no Financeiro (aba Demandas), já ligada a {ligacoes.length ? ligacoes.slice(0, 3).join(', ') + (ligacoes.length > 3 ? ' e outras' : '') : 'este serviço'}.
            {verV ? ` O valor é a soma dos valores finais: ${reaisDoServico(total)}${varios ? ` (${servicos.length} serviços)` : ''}.` : ' O valor é a soma dos valores finais dos serviços e vai sozinho ao Financeiro.'}
          </p>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-pg-fav">Favorecido (quem recebe) *</label>
            <input id="terc-pg-fav" className="acn-input" value={f.favorecido} onChange={e => set('favorecido', e.target.value)} autoFocus />
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-pg-doc">CNPJ ou CPF</label>
            <input id="terc-pg-doc" className="acn-input" inputMode="numeric" value={f.documento} onChange={e => set('documento', e.target.value)} placeholder="só números" />
            {!f.documento && <p className="acn-terc-dica">O cadastro do prestador não tem o documento: o Financeiro vai pedir se faltar.</p>}
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-pg-venc">Vencimento *</label>
            <input id="terc-pg-venc" className="acn-input" type="date" value={f.vencimento} onChange={e => set('vencimento', e.target.value)} />
            <p className="acn-terc-dica">O dia em que o pagamento precisa sair: é com ele que o Financeiro programa.</p>
          </div>
          <div className="acn-terc-campo"><span className="acn-label">Tipo de custo</span>
            <Chips rotulo="Tipo de custo" ativo={f.tipo} onChange={(id: string) => set('tipo', id || 'servico')} itens={TIPOS_DE_CUSTO} />
          </div>
          <div className="acn-terc-campo"><span className="acn-label">Forma de pagamento</span>
            <Chips rotulo="Forma de pagamento" ativo={f.forma} onChange={(id: string) => set('forma', id || 'pix')} itens={FORMAS_DE_PAGAMENTO} />
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-pg-dados">Dados para pagar</label>
            <input id="terc-pg-dados" className="acn-input" value={f.dados_pagamento} onChange={e => set('dados_pagamento', e.target.value)} placeholder="Chave Pix, linha digitável do boleto, banco e conta…" />
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-pg-obs">Observações</label>
            <input id="terc-pg-obs" className="acn-input" value={f.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Número da nota, combinado com o prestador…" />
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCashMultiple} disabled={ocupado} onClick={gravar}>{ocupado ? 'Pedindo…' : 'Pedir ao Financeiro'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ A CAIXA DO PAGAMENTO ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Como está o pagamento do que já foi realizado (um serviço, os marcados de um grupo ou os de uma ordem). Só aparece se algum já foi realizado.
 * `aoPedir(servicos)` abre a janela acima com os serviços que podem ser pedidos agora; sem esse recado a caixa só informa.
 */
export function CaixaDoPagamento({ servicos, currentUser, tipoDe, aoPedir }) {
  const feitos = servicos.filter((s: any) => s.status === 'realizado');
  if (!feitos.length) return null;
  const verValor = veValores(currentUser);
  const unico = feitos.length === 1 ? feitos[0] : null;
  const por = (sit: string) => feitos.filter((s: any) => situacaoDoPagamento(s) === sit);
  const pagos = por('pago'), pedidos = por('pedido'), duvida = por('desconhecido'), semPedido = por('nenhum');
  const semValor = semPedido.filter((s: any) => !(Number(s.valor_final) > 0));
  const pediveis = semPedido.filter((s: any) => Number(s.valor_final) > 0);
  const motivo = pediveis.length ? motivoQueNaoPedePagamento(pediveis, currentUser, tipoDe) : null;
  const de = (n: number) => (feitos.length > 1 ? ` (${n})` : '');
  const pedidoAntigoCancelado = !!unico && !!unico.pagamento_demanda_id && situacaoDoPagamento(unico) === 'nenhum';

  return (
    <div className="acn-terc-caixa" role="group" aria-label="Pagamento ao prestador">
      <div className="acn-terc-caixa-linha">
        {pagos.length > 0 && <Selo familia="ok" title="O Financeiro concluiu a demanda de pagamento.">Pago{de(pagos.length)}</Selo>}
        {pedidos.length > 0 && <Selo familia="info" title="O pagamento foi pedido e a demanda ainda está aberta no Financeiro.">Pagamento pedido{de(pedidos.length)}</Selo>}
        {duvida.length > 0 && <Selo familia="neutro" title="O pagamento foi pedido, mas não foi possível ler a situação da demanda agora.">Pagamento pedido, situação não lida{de(duvida.length)}</Selo>}
        {pediveis.length > 0 && <Selo familia="atencao" title="O serviço foi feito e o pagamento ainda não foi pedido ao Financeiro.">{verValor ? 'A pagar' : 'Pagamento ainda não pedido'}{de(pediveis.length)}</Selo>}
        {semValor.length > 0 && <span className="acn-fraco">{semValor.length === 1 && feitos.length === 1 ? 'Sem valor final: nada a pagar.' : `${semValor.length} sem valor final (nada a pagar).`}</span>}
      </div>
      {unico && situacaoDoPagamento(unico) !== 'nenhum' && unico.pagamento_pedido_em && (
        <p className="acn-terc-dica">Pedido em {momentoBR(unico.pagamento_pedido_em)}{unico.pagamento_pedido_por ? ` por ${unico.pagamento_pedido_por}` : ''}. {situacaoDoPagamento(unico) === 'pago' ? 'O Financeiro concluiu a demanda.' : 'A demanda está na aba Demandas do Financeiro; quando for concluída, aqui passa a "Pago".'}</p>
      )}
      {pedidoAntigoCancelado && <p className="acn-terc-dica">O pedido anterior foi cancelado no Financeiro: dá para pedir de novo.</p>}
      {pediveis.length > 0 && aoPedir && (motivo === null
        ? (
          <div>
            <Botao pequeno variante="primario" icone={mdiCashMultiple} onClick={() => aoPedir(pediveis)}>
              Pedir pagamento{pediveis.length > 1 ? ` (${pediveis.length} serviços)` : ''}{verValor ? ` · ${reaisDoServico(somaDosValoresFinais(pediveis))}` : ''}
            </Botao>
          </div>
        )
        : <p className="acn-terc-dica">{motivo}</p>)}
    </div>
  );
}
