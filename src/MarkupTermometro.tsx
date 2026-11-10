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
import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { lerPaginado } from './LerPaginado';
import { Botao, Faixa } from './Interface';

// Mesmo corte de 65% usado como markup mínimo em FormacaoPrecosTab.tsx
// (MARKUP_MINIMO_CUSTO_PCT) — repetido aqui porque não é exportado de lá.
//
// Cortes configuráveis por tipo de negócio (pedido do Rafael Nunes, dono da
// empresa, em 23/09/2026): revenda tem markup normal mais baixo (~65%), venda
// varia bastante, pós-vendas/manutenção deveria exigir markup sempre mais
// alto. Os dois cortes de baixo (`min`/`bom`) são configuráveis por tipo em
// Admin → Faixas de Markup (ver carregarBandasMarkupPorTipo); 100% (meta) e
// acima (overmarkup) ficam fixos, porque isso é sobre a fórmula do preço, não
// política comercial por tipo — ">100% já é dourado" foi confirmado com o
// usuário antes disso existir.
export type BandaMarkupConfig = { min: number; bom: number; ativa: boolean };
export const BANDA_MARKUP_PADRAO: BandaMarkupConfig = { min: 65, bom: 80, ativa: true };

// Tipos de negócio do CRM que podem ter régua própria — ver tipo_negocio em
// crm_oportunidades e o seletor em CrmTab.tsx.
export const TIPOS_NEGOCIO_CRM = ['Revenda', 'Venda', 'Pós-vendas'] as const;
export const SLUG_TIPO_NEGOCIO: Record<string, string> = { 'Revenda': 'revenda', 'Venda': 'venda', 'Pós-vendas': 'pos_vendas' };

function bandasDe(cfg: BandaMarkupConfig) {
  return [
    { id: 'vermelho', min: -Infinity,     max: cfg.min, cor: '#dc2626', bg: '#fef2f2', borda: '#fca5a5', label: 'Markup baixo' },
    { id: 'laranja',  min: cfg.min,       max: cfg.bom, cor: '#c2410c', bg: '#fff7ed', borda: '#fdba74', label: 'Apertado' },
    { id: 'amarelo',  min: cfg.bom,       max: 100,     cor: '#a16207', bg: '#fefce8', borda: '#fde047', label: 'Bom' },
    { id: 'verde',    min: 100,           max: 100.000001, cor: '#16a34a', bg: '#f0fdf4', borda: '#86efac', label: 'Na meta' },
    { id: 'dourado',  min: 100.000001,    max: Infinity,   cor: '#92400e', bg: '#fffbeb', borda: '#f59e0b', label: 'Overmarkup' },
  ] as const;
}

// Mantido para quem já importava a régua fixa (RelatoriosTab.tsx — "Markup
// por Vendedor" não tem noção de tipo de negócio ainda).
export const MARKUP_BANDAS = bandasDe(BANDA_MARKUP_PADRAO);

const BANDA_NEUTRA = { id: 'neutro', cor: '#64748b', bg: '#f1f5f9', borda: '#cbd5e1', label: 'Sem cotação' };
// Tipo marcado como "sem régua fixa" no Admin (ex.: Venda, que varia demais
// pra ter uma faixa única) — mostra o número sem cor de alerta.
const BANDA_SEM_REGUA = { id: 'sem_regua', min: -Infinity, max: Infinity, cor: '#475569', bg: '#f1f5f9', borda: '#cbd5e1', label: 'Markup (sem régua fixa)' };

export function corMarkup(pct: number | null | undefined, cfg: BandaMarkupConfig = BANDA_MARKUP_PADRAO) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return BANDA_NEUTRA;
  if (cfg.ativa === false) return BANDA_SEM_REGUA;
  // ">100% já é dourado" (confirmado com o usuário) — só cai em "verde" quem
  // está exatamente em 100%; qualquer coisa acima já sinaliza overmarkup.
  const bandas = bandasDe(cfg);
  if (pct > 100) return bandas[4];
  const banda = bandas.find(b => pct >= b.min && pct < b.max);
  return banda || bandas[3]; // pct === 100 exatamente cai aqui (verde)
}

// Filtro por faixa (pedido do usuário em 07/10/2026, Comercial e Licitações): as opções são as próprias faixas do selo — Markup baixo, Apertado, Bom, Na meta, Overmarkup — mais "Sem cotação"
// (card sem preço formado) e "Sem régua fixa" (tipo de negócio sem régua no Admin). Quem filtra usa o MESMO corte do selo: o do tipo de negócio do card, quando existe.
export const OPCOES_FAIXA_MARKUP: { id: string; label: string }[] = [
  { id: 'vermelho', label: 'Markup baixo' },
  { id: 'laranja',  label: 'Apertado' },
  { id: 'amarelo',  label: 'Bom' },
  { id: 'verde',    label: 'Na meta' },
  { id: 'dourado',  label: 'Overmarkup' },
  { id: 'neutro',   label: 'Sem cotação' },
  { id: 'sem_regua', label: 'Sem régua fixa' },
];
export function idFaixaMarkup(pct: number | null | undefined, cfg?: BandaMarkupConfig): string {
  return corMarkup(pct, cfg).id;
}

// Carrega os cortes configurados em Admin → Faixas de Markup
// (configuracoes_sistema, chaves markup_regua_<tipo>_ativa/min/bom). Tipo sem
// configuração cai no padrão (65/80, régua ativa) — mesmo comportamento de
// sempre, até o Rafael mexer em algum tipo.
// 12e74 (7.x, 09/11/2026): a leitura que falhava devolvia o padrão 65/80 como se fosse a régua de cada tipo — o tipo que o Admin deixou "sem régua fixa" (ou com o corte dele, como a
// Pós-vendas, 100/150) passava a mostrar alerta vermelho e o corte errado, sem aviso nenhum. Agora a função diz que não conseguiu (`erro`), e quem chama mantém a régua que já tinha.
export type ResultadoDasBandas = { bandas: Record<string, BandaMarkupConfig>; erro: string };
export async function carregarBandasMarkupPorTipo(): Promise<ResultadoDasBandas> {
  try {
    const chaves = Object.values(SLUG_TIPO_NEGOCIO).flatMap(s => [`markup_regua_${s}_ativa`, `markup_regua_${s}_min`, `markup_regua_${s}_bom`]);
    const { data, error } = await supabase.from('configuracoes_sistema').select('chave,valor').in('chave', chaves);
    if (error) return { bandas: {}, erro: explicarErroDoBanco(error) };
    const mapa: Record<string, string> = Object.fromEntries((data || []).map((r: any) => [r.chave, r.valor]));
    const resultado: Record<string, BandaMarkupConfig> = {};
    for (const [tipo, slug] of Object.entries(SLUG_TIPO_NEGOCIO)) {
      const ativaStr = mapa[`markup_regua_${slug}_ativa`];
      resultado[tipo] = {
        ativa: ativaStr === undefined ? true : ativaStr !== 'false',
        min: Number(mapa[`markup_regua_${slug}_min`]) || BANDA_MARKUP_PADRAO.min,
        bom: Number(mapa[`markup_regua_${slug}_bom`]) || BANDA_MARKUP_PADRAO.bom,
      };
    }
    return { bandas: resultado, erro: '' };
  } catch (e) {
    return { bandas: {}, erro: explicarErroDoBanco(e) };
  }
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
// `total` (opcional): valor total do preço formado (total de vendas) da formação-alvo do processo, calculado por quem chama (a conta da formação mora na tela de Formação de Preços); o kanban do Comercial soma por coluna.
export type MarkupProcesso = { pct: number; min: number; max: number; total?: number | null };

// 12e74 (7.x, 09/11/2026): três defeitos que passavam em silêncio.
//  1) Nenhuma das três leituras olhava o erro: se uma falhava, o mapa saía vazio e TODO cartão aparecia "Sem cotação" (o selo sumia e o filtro por faixa dava lista errada), sem aviso.
//     Agora a função diz que não conseguiu (`erro`) e quem chama mantém o mapa que já tinha na tela.
//  2) As cotações eram lidas numa consulta só, com a lista de códigos no endereço. O endereço tem limite (cerca de 8 mil caracteres, uns 215 códigos) e o CRM já usava 109 em 09/11/2026,
//     com um a mais a cada formação ligada: passado o limite a leitura falharia inteira. Agora vai em blocos de 80 códigos.
//  3) Os vínculos eram lidos sem paginar (o banco corta a consulta em 1.000 linhas; hoje são 109 do CRM e 47 das Licitações): agora vão de 1.000 em 1.000, na ordem do código.
export type ResultadoDoMarkup = { mapa: Record<string, MarkupProcesso>; erro: string };
const COTACOES_POR_LEITURA = 80;

export async function carregarMarkupPorProcesso(tipo: 'crm' | 'licitacao', totalDe?: (cotacao: any) => number | null): Promise<ResultadoDoMarkup> {
  try {
    const vinc = await lerPaginado(() => supabase
      .from('cotacoes_precos_vinculos')
      .select('cotacao_id, processo_id')
      .eq('tipo', tipo)
      .order('id'));
    if (!vinc.length) return { mapa: {}, erro: '' };

    const cotacaoIds = [...new Set(vinc.map((v: any) => v.cotacao_id))];
    const blocos: any[][] = [];
    for (let i = 0; i < cotacaoIds.length; i += COTACOES_POR_LEITURA) blocos.push(cotacaoIds.slice(i, i + COTACOES_POR_LEITURA));
    const respostas = await Promise.all(blocos.map(ids => supabase
      .from('cotacoes_precos')
      .select('id, itens, vencedora, versao, parametros_globais')
      .in('id', ids)));
    const falhou = respostas.find(r => r.error);
    if (falhou) return { mapa: {}, erro: explicarErroDoBanco(falhou.error) };
    const cotacaoPorId: Record<string, any> = {};
    respostas.forEach(r => (r.data || []).forEach((c: any) => { cotacaoPorId[c.id] = c; }));

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
      resultado[processoId] = { pct, min: faixa?.min ?? pct, max: faixa?.max ?? pct, ...(totalDe ? { total: totalDe(alvo) } : {}) };
    });
    return { mapa: resultado, erro: '' };
  } catch (e) {
    return { mapa: {}, erro: explicarErroDoBanco(e) };
  }
}

// Estado do termômetro de uma tela (CRM, Licitações): o mapa processo → markup e, no CRM, a régua de cada tipo de negócio. Cada tela tinha o seu par de useState e um `.then(set…)` solto,
// sem tratar erro (7.x de 09/11/2026, ver acima); agora é um gancho só:
//  • leitura que falha NÃO apaga o que já estava na tela — o `erro` sobe para a faixa vermelha (FaixaDoMarkup) e o mapa e a régua da última leitura boa ficam;
//  • vale sempre a leitura MAIS NOVA: uma resposta antiga e lenta, que chega depois da nova, é descartada (a tela recarrega várias vezes e as respostas não chegam na ordem em que saíram).
export function useMarkupDaTela(tipo: 'crm' | 'licitacao', totalDe?: (cotacao: any) => number | null, comBandas = false) {
  const [markup, setMarkup] = useState<Record<string, MarkupProcesso>>({});
  const [bandas, setBandas] = useState<Record<string, BandaMarkupConfig>>({});
  const [erro, setErro] = useState('');
  const ultimaLeitura = useRef(0);
  const recarregar = useCallback(async () => {
    const minha = ++ultimaLeitura.current;
    const [m, b] = await Promise.all([
      carregarMarkupPorProcesso(tipo, totalDe),
      comBandas ? carregarBandasMarkupPorTipo() : Promise.resolve<ResultadoDasBandas>({ bandas: {}, erro: '' }),
    ]);
    if (minha !== ultimaLeitura.current) return;
    if (!m.erro) setMarkup(m.mapa);
    if (comBandas && !b.erro) setBandas(b.bandas);
    setErro(m.erro || b.erro);
  }, [tipo, totalDe, comBandas]);
  return { markup, bandas, erro, recarregar };
}

// A faixa vermelha da leitura que falhou (alerta é vermelho, regra do usuário de 27/10/2026). Não aparece quando não há erro. `temSelos` = a tela ainda tem o mapa da última leitura boa.
export function FaixaDoMarkup({ erro, temSelos, onTentar }: { erro: string; temSelos: boolean; onTentar: () => void }) {
  if (!erro) return null;
  return (
    <Faixa tom="erro" acao={<Botao pequeno onClick={onTentar}>Tentar de novo</Botao>}>
      Não foi possível ler os dados do termômetro de markup ({erro}). Os selos de markup e o filtro por faixa podem estar incompletos{temSelos ? '; o que aparece é da última leitura que deu certo' : ''}.
    </Faixa>
  );
}

// ── Ícone SVG de termômetro — tubo + bulbo, preenchido até a % e colorido
// pela faixa. Escala: 0%-130% mapeado pra 0%-100% de altura do tubo
// (clampado nas pontas), pra dar pra distinguir visualmente um 60% "quase
// vazio" de um 105% "quase cheio/dourado". ──
export function Termometro({ pct, size = 14, bandaCfg }: { pct: number | null | undefined; size?: number; bandaCfg?: BandaMarkupConfig }) {
  const banda = corMarkup(pct, bandaCfg);
  const valor = pct === null || pct === undefined || Number.isNaN(pct) ? 0 : pct;
  const fracao = Math.max(0, Math.min(1, valor / 130));
  const W = 14, H = 30;
  const tuboTopo = 4, tuboBase = 19; // região do tubo que preenche (o bulbo cobre o resto embaixo)
  const alturaFill = fracao * (tuboBase - tuboTopo);
  const yFill = tuboBase - alturaFill;
  const escala = size / H;
  return (
    <svg width={W * escala} height={H * escala} viewBox={`0 0 ${W} ${H}`} className="acn-mk-termo">
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
export function MarkupBadge({ pct, min, max, discreto = false, bandaCfg }:
  { pct: number | null | undefined; min?: number; max?: number; discreto?: boolean; bandaCfg?: BandaMarkupConfig }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const banda = corMarkup(pct, bandaCfg);
  // A faixa min–max só aparece quando os itens NÃO têm todos o mesmo markup:
  // é ela que revela o que o número ponderado esconde — um item a 30% junto de
  // um a 150%. Com todos iguais seria só ruído (pedido de 25/09/2026).
  const temDispersao = min !== undefined && max !== undefined && Math.abs(max - min) >= 0.05;
  const faixaTxt = temDispersao ? `${min!.toFixed(0)}% a ${max!.toFixed(0)}%` : '';
  const titulo = `Markup da cotação: ${banda.label}. Ponderado pelo custo — cada item pesa o quanto custa.`
    + (temDispersao ? `\nItens de ${faixaTxt} — vale olhar item a item.` : '');

  if (discreto) return (
    <span title={titulo} className="acn-num acn-mk-selo-d" style={{ color: banda.cor }}>
      <Termometro pct={pct} size={13} bandaCfg={bandaCfg} />
      {pct.toFixed(1)}%
      {temDispersao && <span className="acn-mk-faixa-d">({faixaTxt})</span>}
    </span>
  );
  // 12e74 (09/11/2026): o selo grande FICA com o estilo solto, de propósito. O sistema só reconhece "selo" (e o repinta nos tons do guia, no claro e no escuro) pelo estilo
  // escrito no próprio elemento — fundo, letra pequena e canto arredondado: `TonsVisuais.ts`; passando para classe, o selo mudaria de cor na tela.
  // Sai daqui junto com o `TonsVisuais`, na Etapa 13, quando o selo virar o `Selo` do guia.
  return (
    <span title={titulo} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, padding: '1px 5px 1px 3px', borderRadius: 3,
      background: banda.bg, color: banda.cor, border: `1px solid ${banda.borda}`,
    }}>
      <Termometro pct={pct} size={13} bandaCfg={bandaCfg} />
      {pct.toFixed(1)}%
      {temDispersao && <span className="acn-mk-faixa">({faixaTxt})</span>}
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
    <div className="acn-mk-barra">
      <div className="acn-mk-barra-tit">
        🌡️ MARKUP DA CARTEIRA <span className="acn-mk-barra-n">({total} com cotação)</span>
      </div>
      <div className="acn-mk-trilho">
        {contagem.map(({ banda, qtd }) => (
          <div key={banda.id} title={`${banda.label}: ${qtd}`}
            style={{ width: `${(qtd / total) * 100}%`, background: banda.cor }} />
        ))}
      </div>
      <div className="acn-mk-legenda">
        {contagem.map(({ banda, qtd }) => (
          <div key={banda.id} className="acn-mk-leg-item">
            <span className="acn-mk-amostra" style={{ background: banda.cor }} />
            {banda.label}: <strong className="acn-mk-leg-n">{qtd}</strong> ({((qtd / total) * 100).toFixed(0)}%)
          </div>
        ))}
      </div>
    </div>
  );
}
