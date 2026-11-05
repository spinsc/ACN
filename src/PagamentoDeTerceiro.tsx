// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DEMANDAS GERAIS DO FINANCEIRO — pedido de pagamento a terceiro (pedido do usuário em 05/11/2026)
//
// "Demandas gerais aparecer o financeiro, será usado para solicitar pagamento de terceiros, valores e custos de terceiros e podem vincular a uma OS." A demanda do setor Financeiro ganha
// um quadro com o favorecido, o tipo de custo, o valor, o vencimento e a forma de pagamento (coluna `demandas_avulsas.pagamento_terceiro`); a OS (ou OP, PV…) se liga pelos vínculos que
// toda demanda já tem. Decidido com o usuário: SÓ ESTA PEÇA nasce no padrão novo, encaixada na DemandaAvulsaPanel sem migrar a tela inteira (como a Formação de preço e o Veículo da frota).
// A regra (validação e montagem do que se grava) fica aqui em funções puras; o quadro grava na hora, com a demanda lida de novo antes, e deixa o rastro no Histórico da demanda.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Chips, Faixa } from './Interface';
import { lerValorDigitado } from './LerValor';
import { logChange } from './AuditSystem';
import { mdiPencilOutline, mdiContentSaveOutline, mdiClose } from '@mdi/js';

export const TIPOS_DE_CUSTO = [
  { id: 'servico', rotulo: 'Serviço de terceiro' }, { id: 'material', rotulo: 'Material ou peça' }, { id: 'frete', rotulo: 'Frete ou transporte' },
  { id: 'diaria', rotulo: 'Diária ou mão de obra' }, { id: 'outro', rotulo: 'Outro' },
];
export const FORMAS_DE_PAGAMENTO = [{ id: 'pix', rotulo: 'Pix' }, { id: 'boleto', rotulo: 'Boleto' }, { id: 'transferencia', rotulo: 'Transferência' }, { id: 'outro', rotulo: 'Outra' }];
const rotuloDe = (lista: any[], id: string) => lista.find(x => x.id === id)?.rotulo || id || '—';
const reais = (n: any) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soDigitos = (t: any) => String(t || '').replace(/\D/g, '');
const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).split('-').reverse().join('/') : '—');
/** AAAA-MM-DD que existe de verdade (31/02 não vale); datas como texto, nunca `new Date` (o fuso muda o dia). */
const dataValida = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };

/** O que a tela edita: o valor fica como texto digitado ("1.500,50") até gravar. */
export const pagamentoVazio = () => ({ favorecido: '', documento: '', tipo: 'servico', valor: '', vencimento: '', forma: 'pix', dados_pagamento: '', observacao: '' });

/** O que falta para o pedido poder ser gravado; vazio = pode. */
export function erroDoPagamento(p: any): string {
  if (!String(p?.favorecido || '').trim()) return 'diga quem vai receber (o favorecido)';
  const v = lerValorDigitado(p?.valor);
  if (v.vazio) return 'informe o valor a pagar';
  if (v.invalido) return 'o valor não parece um número';
  if (!(v.valor > 0)) return 'o valor tem de ser maior que zero';
  if (String(p?.vencimento || '').trim() && !dataValida(p.vencimento)) return 'o vencimento não é uma data válida';
  const doc = soDigitos(p?.documento);
  if (doc && doc.length !== 11 && doc.length !== 14) return 'o CPF tem 11 números e o CNPJ tem 14';
  return '';
}

/** O que vai para o banco: valor como número, documento só com dígitos, textos aparados. */
export function pagamentoParaGravar(p: any) {
  return {
    favorecido: String(p.favorecido || '').trim(), documento: soDigitos(p.documento) || null, tipo: p.tipo || 'servico', valor: lerValorDigitado(p.valor).valor,
    vencimento: String(p.vencimento || '').trim() || null, forma: p.forma || 'pix', dados_pagamento: String(p.dados_pagamento || '').trim() || null, observacao: String(p.observacao || '').trim() || null,
  };
}
/** O contrário: do que está gravado para o que a tela edita. */
export const pagamentoParaEditar = (g: any) => ({ ...pagamentoVazio(), ...g, documento: g?.documento || '', valor: g?.valor != null ? String(g.valor).replace('.', ',') : '', vencimento: g?.vencimento || '', dados_pagamento: g?.dados_pagamento || '', observacao: g?.observacao || '' });

/** Uma linha de resumo para o cartão da lista: "Fulano · R$ 1.500,00 · vence 12/11/2026". */
export function resumoDoPagamento(g: any): string {
  if (!g?.favorecido) return '';
  return [g.favorecido, g.valor != null ? reais(g.valor) : '', g.vencimento ? 'vence ' + dataBr(g.vencimento) : ''].filter(Boolean).join(' · ');
}

/** Os campos do pedido (usados na Nova Demanda e na edição do quadro). */
export function CamposDoPagamento({ valor, onChange }: any) {
  const set = (k: string, x: any) => onChange({ ...valor, [k]: x });
  return (
    <div className="acn-pgt-grade">
      <div className="acn-pgt-campo acn-pgt-largo"><label className="acn-label" htmlFor="pgt-favorecido">Favorecido (quem recebe) *</label>
        <input id="pgt-favorecido" className="acn-input" placeholder="Nome ou razão social do terceiro" value={valor.favorecido} onChange={e => set('favorecido', e.target.value)} /></div>
      <div className="acn-pgt-campo"><label className="acn-label" htmlFor="pgt-doc">CPF ou CNPJ</label>
        <input id="pgt-doc" className="acn-input" inputMode="numeric" placeholder="só números" value={valor.documento} onChange={e => set('documento', e.target.value)} /></div>
      <div className="acn-pgt-campo"><label className="acn-label" htmlFor="pgt-valor">Valor a pagar (R$) *</label>
        <input id="pgt-valor" className="acn-input" inputMode="decimal" placeholder="0,00" value={valor.valor} onChange={e => set('valor', e.target.value)} /></div>
      <div className="acn-pgt-campo"><label className="acn-label" htmlFor="pgt-venc">Vencimento</label>
        <input id="pgt-venc" type="date" className="acn-input" value={valor.vencimento} onChange={e => set('vencimento', e.target.value)} /></div>
      <div className="acn-pgt-campo acn-pgt-largo"><label className="acn-label">Tipo de custo</label>
        <Chips ativo={valor.tipo} onChange={(id: string) => set('tipo', id || 'servico')} rotulo="Tipo de custo" itens={TIPOS_DE_CUSTO} /></div>
      <div className="acn-pgt-campo acn-pgt-largo"><label className="acn-label">Forma de pagamento</label>
        <Chips ativo={valor.forma} onChange={(id: string) => set('forma', id || 'pix')} rotulo="Forma de pagamento" itens={FORMAS_DE_PAGAMENTO} /></div>
      <div className="acn-pgt-campo acn-pgt-largo"><label className="acn-label" htmlFor="pgt-dados">Dados para pagar</label>
        <input id="pgt-dados" className="acn-input" placeholder="Chave Pix, linha digitável do boleto, banco e conta…" value={valor.dados_pagamento} onChange={e => set('dados_pagamento', e.target.value)} /></div>
      <div className="acn-pgt-campo acn-pgt-largo"><label className="acn-label" htmlFor="pgt-obs">Observações</label>
        <input id="pgt-obs" className="acn-input" placeholder="Número da nota, combinado com o terceiro…" value={valor.observacao} onChange={e => set('observacao', e.target.value)} /></div>
    </div>
  );
}

/** Na Nova Demanda do Financeiro: o pedido de pagamento junto do título e da descrição. A OS se liga no campo de vínculos logo abaixo. */
export function PagamentoNaNovaDemanda({ valor, onChange }: any) {
  return (
    <div className="acn-quadro acn-pgt" data-teste="pagamento-nova">
      <div className="acn-quadro-titulo">PAGAMENTO A TERCEIRO</div>
      <div className="acn-ajuda">Preencha quem recebe e quanto. Para ligar o custo a uma OS, use "Vincular a processos" mais abaixo e escolha a OS.</div>
      <CamposDoPagamento valor={valor} onChange={onChange} />
    </div>
  );
}

/** No detalhe da demanda do Financeiro: mostra o pedido e deixa corrigir (grava na hora, com o rastro no Histórico). */
export function PagamentoDaDemanda({ demanda, currentUser, podeMexer, onMudou }: any) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(() => pagamentoParaEditar(demanda?.pagamento_terceiro));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const g = demanda?.pagamento_terceiro;

  const salvar = async () => {
    const falta = erroDoPagamento(f);
    if (falta) { setErro('Não foi possível salvar: ' + falta + '.'); return; }
    setErro(''); setSalvando(true);
    const novo = pagamentoParaGravar(f);
    // lê de novo antes de gravar: o histórico que outra pessoa acabou de escrever não pode ser apagado
    const { data: fresca, error: erroLeitura } = await supabase.from('demandas_avulsas').select('informacoes,pagamento_terceiro').eq('id', demanda.id).maybeSingle();
    if (erroLeitura || !fresca) { setSalvando(false); setErro('Não foi possível ler a demanda antes de gravar: ' + (erroLeitura?.message || 'demanda não encontrada') + '. Nada foi alterado.'); return; }
    const agora = new Date().toISOString();
    const antes = resumoDoPagamento(fresca.pagamento_terceiro) || 'sem pedido';
    const depois = resumoDoPagamento(novo);
    const { error } = await supabase.from('demandas_avulsas').update({
      pagamento_terceiro: novo,
      informacoes: [...(fresca.informacoes || []), { texto: `Pagamento a terceiro ${g ? 'corrigido' : 'registrado'}. Antes: ${antes}. Agora: ${depois}.`, usuario: currentUser?.nome || currentUser?.email || '', data: agora }],
      atualizado_em: agora,
    }).eq('id', demanda.id);
    setSalvando(false);
    if (error) { setErro('Não foi possível salvar o pagamento: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'demandas_avulsas', entityId: demanda.id, changeType: 'UPDATE', field: 'pagamento_terceiro', oldRow: { pagamento_terceiro: fresca.pagamento_terceiro ?? null }, newRow: { pagamento_terceiro: novo }, user: currentUser });
    setEditando(false);
    onMudou?.();
  };

  return (
    <div className="acn-quadro acn-pgt" data-teste="pagamento-detalhe">
      <div className="acn-pgt-cab">
        <div className="acn-quadro-titulo">PAGAMENTO A TERCEIRO</div>
        {podeMexer && !editando && <Botao pequeno icone={mdiPencilOutline} onClick={() => { setF(pagamentoParaEditar(g)); setEditando(true); }}>{g ? 'Corrigir' : 'Registrar o pagamento'}</Botao>}
      </div>
      {erro && <Faixa tom="erro">{erro}</Faixa>}
      {!editando && !g && <div className="acn-ajuda">Esta demanda ainda não tem o pedido de pagamento (favorecido, valor e vencimento).</div>}
      {!editando && g && (
        <dl className="acn-pgt-lista">
          <div><dt>Favorecido</dt><dd>{g.favorecido}{g.documento ? ' · ' + g.documento : ''}</dd></div>
          <div><dt>Valor</dt><dd><strong>{reais(g.valor)}</strong></dd></div>
          <div><dt>Vencimento</dt><dd>{dataBr(g.vencimento)}</dd></div>
          <div><dt>Tipo de custo</dt><dd>{rotuloDe(TIPOS_DE_CUSTO, g.tipo)}</dd></div>
          <div><dt>Forma de pagamento</dt><dd>{rotuloDe(FORMAS_DE_PAGAMENTO, g.forma)}{g.dados_pagamento ? ' · ' + g.dados_pagamento : ''}</dd></div>
          {g.observacao && <div><dt>Observações</dt><dd>{g.observacao}</dd></div>}
        </dl>
      )}
      {editando && (
        <>
          <CamposDoPagamento valor={f} onChange={setF} />
          <div className="acn-acoes">
            <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
            <Botao variante="discreto" icone={mdiClose} disabled={salvando} onClick={() => { setEditando(false); setErro(''); }}>Cancelar</Botao>
          </div>
        </>
      )}
    </div>
  );
}
