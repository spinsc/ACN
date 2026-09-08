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

// ── Carrega o mapa processoId -> markup médio, para um tipo (crm|licitacao) ──
export async function carregarMarkupPorProcesso(tipo: 'crm' | 'licitacao'): Promise<Record<string, number>> {
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

  const resultado: Record<string, number> = {};
  Object.entries(cotacoesPorProcesso).forEach(([processoId, cots]) => {
    const alvo = cots.find(c => c.vencedora) || [...cots].sort((a, b) => (b.versao || 1) - (a.versao || 1))[0];
    if (!alvo) return;
    const itensCusto = (alvo.itens || []).filter((it: any) => it.tipo_calculo !== 'TABELA');
    if (!itensCusto.length) return;
    const soma = itensCusto.reduce((s: number, it: any) => s + (Number(it.markup_pct) || 0), 0);
    resultado[processoId] = soma / itensCusto.length;
  });
  return resultado;
}

// ── Badge pequeno pro card individual (Kanban CRM / LicitCard) ──
export function MarkupBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const banda = corMarkup(pct);
  return (
    <span title={`Markup médio da cotação: ${banda.label}`} style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
      background: banda.bg, color: banda.cor, border: `1px solid ${banda.borda}`,
      display: 'inline-block',
    }}>
      🌡️ {pct.toFixed(1)}%
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
