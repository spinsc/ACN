// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Botao, Selo, SelectBusca } from './Interface';
import Icone from './Icone';
import { podeVerValores } from './utils/permissoes';
import { raizDaCotacao, familiasDe } from './FormacaoFamilia';
import { mdiLinkVariant, mdiLinkVariantOff, mdiPlus, mdiOpenInNew } from '@mdi/js';

// Formação de preço ligada à Ordem de compra (pedido do usuário em 26/10/2026). "Ordem de compra" é a OC do Compras (a OC-AAAA-NNNN que sai ao fornecedor, em pcp_pedidos_compra.numero_oc).
// A ligação é entre a FAMÍLIA da formação (a raiz das versões) e o pedido que carrega a OC (cotacoes_precos_ordens_compra): uma formação pode ter várias OCs e uma OC pode atender mais de
// uma formação. Só liga e desliga: nada é copiado nem somado no banco. Dois lados: a Formação de Preços lista as OCs ligadas (aqui), e o resumo do pedido no Compras mostra a(s) formação(ões)
// ligada(s) — as duas telas leem a mesma tabela.

const COLUNAS_PEDIDO = 'id,numero_pedido,numero_oc,descricao_material,fornecedor,status_compra,valor_compra,data_criacao';
const fmtR = (v: any) => (v != null && v !== '' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)) : '—');

/** Abre o pedido no Compras (a Mesa de Cotações dele), pelo mesmo recado das Menções: `acn:ir-para-aba` troca a aba e o Compras lê o `__acnDeepLink` ao montar. */
export function abrirPedidoNoCompras(pedidoId: string) {
  (window as any).__acnDeepLink = { contexto: 'compra', contextoId: pedidoId };
  window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'compras' } }));
}

const rotuloDaOc = (p: any) => `${p.numero_oc}${p.numero_pedido ? ' · ' + p.numero_pedido : ''}${p.fornecedor ? ' · ' + p.fornecedor : ''}`;

// ─── NA FORMAÇÃO DE PREÇOS: as OCs ligadas a esta formação ────────────────────────
export function OrdensDeCompraDaFormacao({ cotacaoId, currentUser }: any) {
  const [raiz, setRaiz] = useState<string | null>(null);
  const [ligadas, setLigadas] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [candidatas, setCandidatas] = useState<any[]>([]);
  const [escolha, setEscolha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!cotacaoId) { setRaiz(null); setLigadas([]); return; }
    const { data: eu, error: erroEu } = await supabase.from('cotacoes_precos').select('id,versao_raiz_id').eq('id', cotacaoId).maybeSingle();
    if (erroEu || !eu) { setErro(erroEu?.message || 'formação não encontrada'); return; }
    const minha = raizDaCotacao(eu);
    setRaiz(minha);
    const { data: lig, error: erroLig } = await supabase.from('cotacoes_precos_ordens_compra').select('pedido_id').eq('raiz_id', minha);
    if (erroLig) { setErro(erroLig.message); return; }
    const ids = (lig || []).map((l: any) => l.pedido_id);
    if (!ids.length) { setErro(''); setLigadas([]); return; }
    const { data: peds, error: erroPeds } = await supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO).in('id', ids).order('data_criacao', { ascending: false });
    if (erroPeds) { setErro(erroPeds.message); return; }
    setErro(''); setLigadas(peds || []);
  }, [cotacaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirEscolha = async () => {
    setAdicionando(true);
    // só pedido que já tem OC (a OC nasce quando o Compras efetiva a compra); as já ligadas não aparecem de novo
    const { data, error } = await supabase.from('pcp_pedidos_compra').select(COLUNAS_PEDIDO).not('numero_oc', 'is', null).order('data_criacao', { ascending: false }).limit(1000);
    if (error) { setErro(error.message); setAdicionando(false); return; }
    const jaLigadas = new Set(ligadas.map((p: any) => p.id));
    setCandidatas((data || []).filter((p: any) => !jaLigadas.has(p.id)));
  };
  const vincular = async () => {
    if (!escolha || !raiz || ocupado) return;
    setOcupado(true);
    const { error } = await supabase.from('cotacoes_precos_ordens_compra').insert([{ raiz_id: raiz, pedido_id: escolha, criado_por_nome: currentUser?.nome || currentUser?.email || null }]);
    setOcupado(false);
    if (error) { alert(error.code === '23505' ? 'Esta OC já está ligada a esta formação.' : 'Não foi possível vincular a OC: ' + error.message); return; }
    setAdicionando(false); setEscolha('');
    carregar();
  };
  const desvincular = async (p: any) => {
    if (!await confirmar(`Desvincular a OC ${p.numero_oc} desta formação?\n\nNem a formação nem a OC são apagadas; só deixam de estar ligadas.`)) return;
    const { error } = await supabase.from('cotacoes_precos_ordens_compra').delete().eq('raiz_id', raiz).eq('pedido_id', p.id);
    if (error) { alert('Não foi possível desvincular: ' + error.message); return; }
    carregar();
  };

  if (!cotacaoId) return null;
  const verValor = podeVerValores(currentUser);
  const total = ligadas.reduce((s: number, p: any) => s + (Number(p.valor_compra) || 0), 0);
  return (
    <div className="acn-quadro acn-fp-relac" data-teste="oc-da-formacao">
      <div className="acn-fp-relac-cab">
        <span className="acn-quadro-titulo"><Icone path={mdiLinkVariant} size={13} /> Ordens de compra ligadas a esta formação ({ligadas.length}){verValor && ligadas.length > 0 && total > 0 ? ` · ${fmtR(total)}` : ''}</span>
        {!adicionando && <Botao pequeno icone={mdiPlus} onClick={abrirEscolha}>Vincular ordem de compra</Botao>}
      </div>
      {erro && <div className="acn-fp-relac-erro">Não foi possível ler as ordens de compra ligadas ({erro}).</div>}
      {!erro && !ligadas.length && !adicionando && <div className="acn-ajuda">Nenhuma. Vincule a OC do Compras que atendeu esta formação (a compra feita para entregar o que foi precificado).</div>}
      {ligadas.map((p: any) => (
        <div key={p.id} className="acn-fp-relac-linha">
          <span className="acn-fp-relac-nome" title={`${rotuloDaOc(p)} — ${p.descricao_material || ''}`}><strong className="acn-forte">{p.numero_oc}</strong>{p.numero_pedido ? ` · ${p.numero_pedido}` : ''}{p.fornecedor ? ` · ${p.fornecedor}` : ''}{p.descricao_material ? ` — ${String(p.descricao_material).split('\n')[0]}` : ''}</span>
          {p.status_compra && <Selo familia="neutro" ponto={false}>{p.status_compra}</Selo>}
          {verValor && <span className="acn-num acn-forte">{fmtR(p.valor_compra)}</span>}
          <Botao pequeno icone={mdiOpenInNew} onClick={() => abrirPedidoNoCompras(p.id)} title="Abre o pedido no Compras">Abrir no Compras</Botao>
          <Botao pequeno variante="discreto" icone={mdiLinkVariantOff} aria-label={`Desvincular ${p.numero_oc}`} title="Desvincular" onClick={() => desvincular(p)} />
        </div>
      ))}
      {adicionando && (
        <div className="acn-fp-relac-nova">
          <SelectBusca opcoes={candidatas.map((p: any) => ({ valor: p.id, rotulo: rotuloDaOc(p), busca: [p.numero_oc, p.numero_pedido, p.fornecedor, p.descricao_material] }))}
            valor={escolha} onChange={setEscolha} placeholder="Procure a OC (número, pedido, fornecedor ou item)" />
          <Botao pequeno variante="primario" disabled={!escolha || ocupado} onClick={vincular}>Vincular</Botao>
          <Botao pequeno onClick={() => { setAdicionando(false); setEscolha(''); }}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}

// ─── NO COMPRAS: a(s) formação(ões) ligada(s) a este pedido (resumo da requisição e Mesa de Cotações) ─
export function FormacoesDoPedidoDeCompra({ pedidoId }: any) {
  const [formacoes, setFormacoes] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!pedidoId) return;
      const { data: lig, error: erroLig } = await supabase.from('cotacoes_precos_ordens_compra').select('raiz_id').eq('pedido_id', pedidoId);
      if (!vivo) return;
      if (erroLig) { setErro(erroLig.message); return; }
      const raizes = [...new Set((lig || []).map((l: any) => l.raiz_id))];
      if (!raizes.length) { setErro(''); setFormacoes([]); return; }
      const lista = raizes.join(',');
      const { data: cots, error: erroCots } = await supabase.from('cotacoes_precos').select('id,nome,versao,versao_raiz_id,criado_em,orgao_cliente').or(`id.in.(${lista}),versao_raiz_id.in.(${lista})`);
      if (!vivo) return;
      if (erroCots) { setErro(erroCots.message); return; }
      setErro(''); setFormacoes(familiasDe(cots || []));
    })();
    return () => { vivo = false; };
  }, [pedidoId]);
  // sem ligação não ocupa lugar; leitura recusada avisa em vez de parecer "nenhuma"
  if (!erro && !formacoes.length) return null;
  return (
    <div className="acn-ficha-linha acn-cmp-ficha" data-teste="formacao-do-pedido">
      <span>Formação de preço</span>
      <span>{erro ? <span className="acn-txt-erro">não foi possível ler ({erro})</span>
        : formacoes.map(({ raiz, cot }: any) => <div key={raiz}>{cot.nome || 'Formação sem nome'} · v{cot.versao || 1}{cot.orgao_cliente ? ' · ' + cot.orgao_cliente : ''}</div>)}</span>
    </div>
  );
}
