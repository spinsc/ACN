// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TERMÔMETRO DE MARKUP — item 5/5 do levantamento do dono da empresa
//
// Média de markup_pct por proposta/licitação (cotação vencedora, ou a de
// maior versão), com faixas de cor pra sinalizar rápido se o markup está
// apertado ou bom, tanto no card individual quanto numa visão agregada.
//
// Padrão: 1 busca em lote por tela (mesmo padrão de `pedidosCompra` em
// CrmTab.tsx) alimentando um mapa processoId -> markupMédio, que os
// componentes de apresentação abaixo só leem (badge não faz fetch próprio,
// ao contrário de AnaliseStatusBadge, pra evitar N+1 queries por card).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

// Mesmo corte de 65% usado como markup mínimo em FormacaoPrecosTab.tsx
// (MARKUP_MINIMO_CUSTO_PCT) — repetido aqui porque não é exportado de lá.
export const MARKUP_BANDAS = [
  { id: 'vermelho', min: -Infinity, max: 65,  cor: '#dc2626', bg: '#fef2f2', borda: '#fca5a5', label: 'Markup baixo' },
  { id: 'laranja',  min: 65,        max: 80,  cor: '#c2410c', bg: '#fff7ed', borda: '#fdba74', label: 'Apertado' },
  { id: 'amarelo',  min: 80,        max: 100, cor: '#a16207', bg: '#fefce8', borda: '#fde047', label: 'Bom' },
  { id: 'verde',    min: 100,       max: 100.000001, cor: '#16a34a', bg: '#f0fdf4', borda: '#86efac', label: 'Na meta' },
  { id: 'dourado',  min: 100.000001, max: Infinity,  cor: '#92400e', bg: '#fffbeb', borda: '#f59e0b', label: 'Overmarkup' },
] as const;

const BANDA_NEUTRA = { id: 'neutro', cor: '#64748b', bg: '#f1f5f9', borda: '#cbd5e1', label: 'Sem cotação' };

export function corMarkup(pct: number | null | undefined) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return BANDA_NEUTRA;
  // ">100% já é dourado" (confirmado com o usuário) — só cai em "verde" quem
  // está exatamente em 100%; qualquer coisa acima já sinaliza overmarkup.
  if (pct > 100) return MARKUP_BANDAS[4];
  const banda = MARKUP_BANDAS.find(b => pct >= b.min && pct < b.max);
  return banda || MARKUP_BANDAS[3]; // pct === 100 exatamente cai aqui (verde)
}

// Média de markup_pct dos itens em modo CUSTO de uma cotação (itens em modo
// TABELA usam markup_pct como campo de desconto, não entram na média).
// Extraído de carregarMarkupPorProcesso pra ser reaproveitado também pelo
// relatório "Markup por Vendedor" (RelatoriosTab.tsx), sem duplicar a conta.
/**
 * Markup da cotação: PONDERADO PELO CUSTO, não média simples.
 *
 * Mudança pedida pelo dono da empresa em 25/09/2026. A média simples dava um
 * voto igual a cada item, e isso mente quando há markup alto em item barato
 * convivendo com markup baixo no item que pesa. Caso real (PE 55/2026
 * Cabrália): frete de R$ 560 a 30% e rádio de R$ 190 a 150% davam "65%" na
 * média simples, quando a proposta na verdade rende 47,7% — porque três
 * quartos do dinheiro estão no item de 30%.
 *
 * Ponderar pelo custo é a MESMA conta que "custo vs venda", e sai da própria
 * fórmula do preço (FormacaoCalculo.precoUnitario):
 *     preço = custo × (1 + markup) ÷ (1 − DIFAL)
 *   ⇒ Σ preço×(1−DIFAL) = Σ custo×(1+markup)
 *   ⇒ markup = Σ(custo × markup) ÷ Σ custo
 * Conferindo no exemplo: vende 1.875, custa 1.250 → 47,7%. Mesmo número.
 *
 * O peso é o custo TOTAL da linha (com IPI, ST e quantidade), que é a base
 * sobre a qual o preço é formado. Item sem custo não pesa; se nenhum item tem
 * custo, cai para a média simples, senão o número sumiria da tela.
 *
 * TABELA fica de fora como sempre: lá o markup_pct é desconto, não markup.
 */
export function markupPonderadoItens(itens: any[] | null | undefined): number | null {
  const itensCusto = (itens || []).filter((it: any) => it.tipo_calculo !== 'TABELA');
  if (!itensCusto.length) return null;

  const custoDa = (it: any) =>
    (Number(it.custo_unit) || 0)
    * (1 + (Number(it.ipi_pct) || 0) / 100)
    * (1 + (Number(it.st_pct) || 0) / 100)
    * Math.max(Number(it.qt) || 1, 0);

  const custoTotal = itensCusto.reduce((s: number, it: any) => s + custoDa(it), 0);
  if (custoTotal <= 0) {
    // cotação só com itens de custo zero (serviço ainda sem custo lançado):
    // sem peso não há ponderação, então vale a média simples
    return itensCusto.reduce((s: number, it: any) => s + (Number(it.markup_pct) || 0), 0) / itensCusto.length;
  }
  return itensCusto.reduce((s: number, it: any) => s + (Number(it.markup_pct) || 0) * custoDa(it), 0) / custoTotal;
}

/** Menor e maior markup entre os itens — mostra a dispersão que o número
 *  ponderado esconde. É o que deixa visível "tem item a 30% aqui dentro". */
export function faixaMarkupItens(itens: any[] | null | undefined): { min: number; max: number } | null {
  const pcts = (itens || []).filter((it: any) => it.tipo_calculo !== 'TABELA')
    .map((it: any) => Number(it.markup_pct) || 0);
  if (!pcts.length) return null;
  return { min: Math.min(...pcts), max: Math.max(...pcts) };
}

// Dada uma lista de cotações de um mesmo processo, escolhe a vencedora, ou a
// de maior versão se nenhuma estiver marcada — mesma regra em todo lugar.
export function cotacaoAlvo(cotacoes: any[]): any | null {
  if (!cotacoes || !cotacoes.length) return null;
  return cotacoes.find(c => c.vencedora) || [...cotacoes].sort((a, b) => (b.versao || 1) - (a.versao || 1))[0];
}

// ── Carrega o mapa processoId -> markup médio, para um tipo (crm|licitacao) ──
export type MarkupProcesso = { pct: number; min: number; max: number };

export async function carregarMarkupPorProcesso(tipo: 'crm' | 'licitacao'): Promise<Record<string, MarkupProcesso>> {
  const { data: vinc } = await supabase
    .from('cotacoes_precos_vinculos')
    .select('cotacao_id, processo_id')
    .eq('tipo', tipo);
  if (!vinc || !vinc.length) return {};

  const cotacaoIds = [...new Set(vinc.map((v: any) => v.cotacao_id))];
  const { data: cotacoes } = await supabase
    .from('cotacoes_precos')
    .select('id, itens, vencedora, versao')
    .in('id', cotacaoIds);
  const cotacaoPorId: Record<string, any> = {};
  (cotacoes || []).forEach((c: any) => { cotacaoPorId[c.id] = c; });

  const cotacoesPorProcesso: Record<string, any[]> = {};
  vinc.forEach((v: any) => {
    const c = cotacaoPorId[v.cotacao_id];
    if (!c) return;
    (cotacoesPorProcesso[v.processo_id] ||= []).push(c);
  });

  const resultado: Record<string, MarkupProcesso> = {};
  Object.entries(cotacoesPorProcesso).forEach(([processoId, cots]) => {
    const alvo = cotacaoAlvo(cots);
    if (!alvo) return;
    const pct = markupPonderadoItens(alvo.itens);
    if (pct === null) return;
    const faixa = faixaMarkupItens(alvo.itens);
    resultado[processoId] = { pct, min: faixa?.min ?? pct, max: faixa?.max ?? pct };
  });
  return resultado;
}

// ── Ícone SVG de termômetro — tubo + bulbo, preenchido até a % e colorido
// pela faixa. Escala: 0%-130% mapeado pra 0%-100% de altura do tubo
// (clampado nas pontas), pra dar pra distinguir visualmente um 60% "quase
// vazio" de um 105% "quase cheio/dourado". ──
export function Termometro({ pct, size = 14 }: { pct: number | null | undefined; size?: number }) {
  const banda = corMarkup(pct);
  const valor = pct === null || pct === undefined || Number.isNaN(pct) ? 0 : pct;
  const fracao = Math.max(0, Math.min(1, valor / 130));
  const W = 14, H = 30;
  const tuboTopo = 4, tuboBase = 19; // região do tubo que preenche (o bulbo cobre o resto embaixo)
  const alturaFill = fracao * (tuboBase - tuboTopo);
  const yFill = tuboBase - alturaFill;
  const escala = size / H;
  return (
    <svg width={W * escala} height={H * escala} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0, display: 'block' }}>
      {/* tubo e bulbo vazios (fundo) */}
      <rect x={4.5} y={tuboTopo} width={5} height={19} rx={2.5} fill="#e2e8f0" stroke={banda.borda} strokeWidth={0.6} />
      <circle cx={7} cy={24} r={5.5} fill="#e2e8f0" stroke={banda.borda} strokeWidth={0.6} />
      {/* mercúrio — tubo preenchido até yFill, sempre alcançando o bulbo */}
      <rect x={5} y={yFill} width={4} height={tuboBase - yFill + 6} rx={2} fill={banda.cor} />
      {/* bulbo sempre cheio, por cima, pra ficar limpo */}
      <circle cx={7} cy={24} r={4.5} fill={banda.cor} />
    </svg>
  );
}

// ── Badge pequeno pro card individual (Kanban CRM / LicitCard) ──
export function MarkupBadge({ pct, min, max, discreto = false }:
  { pct: number | null | undefined; min?: number; max?: number; discreto?: boolean }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const banda = corMarkup(pct);
  // A faixa min–max só aparece quando os itens NÃO têm todos o mesmo markup:
  // é ela que revela o que o número ponderado esconde — um item a 30% junto de
  // um a 150%. Com todos iguais seria só ruído (pedido de 25/09/2026).
  const temDispersao = min !== undefined && max !== undefined && Math.abs(max - min) >= 0.05;
  const faixaTxt = temDispersao ? `${min!.toFixed(0)}% a ${max!.toFixed(0)}%` : '';
  const titulo = `Markup da cotação: ${banda.label}. Ponderado pelo custo — cada item pesa o quanto custa.`
    + (temDispersao ? `\nItens de ${faixaTxt} — vale olhar item a item.` : '');

  if (discreto) return (
    <span title={titulo} className="acn-num"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 500, color: banda.cor }}>
      <Termometro pct={pct} size={13} />
      {pct.toFixed(1)}%
      {temDispersao && <span style={{ fontSize: 9, opacity: .75, fontWeight: 400 }}>({faixaTxt})</span>}
    </span>
  );
  return (
    <span title={titulo} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, padding: '1px 5px 1px 3px', borderRadius: 3,
      background: banda.bg, color: banda.cor, border: `1px solid ${banda.borda}`,
    }}>
      <Termometro pct={pct} size={13} />
      {pct.toFixed(1)}%
      {temDispersao && <span style={{ opacity: .75, fontWeight: 400 }}>({faixaTxt})</span>}
    </span>
  );
}

// ── Barra de distribuição agregada (visão "kanban/relatório inteiro") ──
export function MarkupBarraDistribuicao({ valores }: { valores: (number | null | undefined)[] }) {
  const validos = valores.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (!validos.length) return null;

  const contagem = MARKUP_BANDAS.map(banda => ({
    banda,
    qtd: validos.filter(v => corMarkup(v).id === banda.id).length,
  })).filter(c => c.qtd > 0);

  const total = validos.length;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
        🌡️ MARKUP DA CARTEIRA <span style={{ fontWeight:600, color:'#94a3b8' }}>({total} com cotação)</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {contagem.map(({ banda, qtd }) => (
          <div key={banda.id} title={`${banda.label}: ${qtd}`}
            style={{ width: `${(qtd / total) * 100}%`, background: banda.cor }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
        {contagem.map(({ banda, qtd }) => (
          <div key={banda.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8.5, color: '#475569' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: banda.cor, display: 'inline-block' }} />
            {banda.label}: <strong style={{ color: '#1e293b' }}>{qtd}</strong> ({((qtd / total) * 100).toFixed(0)}%)
          </div>
        ))}
      </div>
    </div>
  );
}
