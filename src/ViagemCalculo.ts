// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a conta do orçamento (pedido do usuário em 22/10/2026)
//
// Só regra, sem tela nem internet: recebe a viagem COMO ESTÁ (roteiro já calculado em "rota", parâmetros de custo em "custos") e devolve os números. O caminho da rota (km e horas)
// vem de ViagemRota.ts; aqui só se transforma em dinheiro.
//
// Decisões desta primeira versão (a confirmar com o usuário):
//   • DIAS = dias de estrada (horas de direção ÷ horas dirigidas por dia, arredondado para cima) + dias inteiros de trabalho nas paradas ("dias no local"). Uma viagem que cabe no dia, sem dia no
//     local, é 1 dia e não tem pernoite.
//   • HOSPEDAGEM "se necessário": noites sugeridas = dias − 1. A pessoa pode trocar o número de noites; vazio = automático.
//   • PEDÁGIO é lançado à mão (linhas). Não existe fonte gratuita confiável de pedágio por trecho no Brasil; o ponto de ligação de uma API paga está em ViagemRota.ts (pedagiosDaRota).
//   • KM RODADO tem dois números: o custo real por km (combustível + desgaste) e o valor por km que se cobra ou reembolsa (digitado; vazio = o custo real).
// ─────────────────────────────────────────────────────────────────────────────

export type LinhaDeCusto = { id: string; descricao: string; valor: number };

export type CustosDaViagem = {
  consumo_km_l: number;            // km por litro do veículo
  preco_combustivel: number;       // R$ por litro
  custo_km_desgaste: number;       // R$ por km: pneus, manutenção, depreciação (o que não é combustível)
  horas_por_dia: number;           // horas de direção por dia (define quantos dias de estrada)
  diaria_quarto: number;           // R$ por quarto por noite
  quartos: number;
  noites: number | null;           // nulo = automático (dias − 1)
  alimentacao_pessoa_dia: number;  // R$ por pessoa por dia
  pedagios: LinhaDeCusto[];
  outros: LinhaDeCusto[];
  valor_km_rodado: number | null;  // R$ por km cobrado/reembolsado; nulo = custo real por km
  margem_pct: number;              // % sobre o custo, para o valor do orçamento
};

export const CUSTOS_PADRAO: CustosDaViagem = {
  consumo_km_l: 10, preco_combustivel: 0, custo_km_desgaste: 0, horas_por_dia: 8,
  diaria_quarto: 0, quartos: 1, noites: null, alimentacao_pessoa_dia: 0,
  pedagios: [], outros: [], valor_km_rodado: null, margem_pct: 0,
};

export const custosDaViagem = (v: any): CustosDaViagem => ({ ...CUSTOS_PADRAO, ...(v?.custos || {}) });

const num = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const soma = (l: LinhaDeCusto[]) => cent((l || []).reduce((s, x) => s + Math.max(0, num(x.valor)), 0));

export type ResultadoViagem = {
  km: number; horasDirecao: number; diasDeEstrada: number; diasNoLocal: number; dias: number;
  noitesSugeridas: number; noites: number;
  combustivel: number; desgaste: number; hospedagem: number; alimentacao: number; pedagios: number; outros: number;
  custoTotal: number; custoPorKm: number; valorKmRodado: number; kmRodadoTotal: number;
  margem: number; orcamento: number; temRota: boolean;
};

export function calcularViagem(v: any): ResultadoViagem {
  const c = custosDaViagem(v);
  const km = Math.max(0, num(v?.rota?.km));
  const horasDirecao = Math.max(0, num(v?.rota?.horas));
  const temRota = km > 0;
  const horasDia = c.horas_por_dia > 0 ? c.horas_por_dia : 8;
  const diasNoLocal = (v?.paradas || []).reduce((s: number, p: any) => s + Math.max(0, Math.floor(num(p?.dias))), 0);
  const diasDeEstrada = horasDirecao > 0 ? Math.ceil(horasDirecao / horasDia) : 0;
  const dias = temRota ? Math.max(1, diasDeEstrada) + diasNoLocal : 0;
  const noitesSugeridas = Math.max(0, dias - 1);
  const noites = c.noites === null || c.noites === undefined ? noitesSugeridas : Math.max(0, Math.floor(num(c.noites)));
  const pessoas = Math.max(1, Math.floor(num(v?.pessoas)) || 1);

  const combustivel = c.consumo_km_l > 0 ? cent((km / c.consumo_km_l) * Math.max(0, c.preco_combustivel)) : 0;
  const desgaste = cent(km * Math.max(0, c.custo_km_desgaste));
  const hospedagem = cent(noites * Math.max(0, Math.floor(num(c.quartos)) || 0) * Math.max(0, c.diaria_quarto));
  const alimentacao = cent(pessoas * dias * Math.max(0, c.alimentacao_pessoa_dia));
  const pedagios = soma(c.pedagios);
  const outros = soma(c.outros);
  const custoTotal = cent(combustivel + desgaste + hospedagem + alimentacao + pedagios + outros);

  const custoPorKm = km > 0 ? cent((combustivel + desgaste) / km) : 0;   // em centavos: é como o km é cobrado e mostrado
  const valorKmRodado = c.valor_km_rodado === null || c.valor_km_rodado === undefined ? custoPorKm : Math.max(0, num(c.valor_km_rodado));
  const kmRodadoTotal = cent(km * valorKmRodado);
  const margem = cent(custoTotal * Math.max(0, num(c.margem_pct)) / 100);
  return {
    km, horasDirecao, diasDeEstrada, diasNoLocal, dias, noitesSugeridas, noites,
    combustivel, desgaste, hospedagem, alimentacao, pedagios, outros,
    custoTotal, custoPorKm, valorKmRodado, kmRodadoTotal, margem, orcamento: cent(custoTotal + margem), temRota,
  };
}

// ── formatos ─────────────────────────────────────────────────────────────────
export const fmtKm = (km: number) => `${(Math.round(num(km) * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
export const fmtReais = (v: number) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** 5,5 h → "5 h 30 min" */
export function fmtHoras(h: number) {
  const min = Math.round(num(h) * 60);
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh} h${mm ? ` ${String(mm).padStart(2, '0')} min` : ''}` : `${mm} min`;
}

/** O orçamento em texto, para colar numa mensagem ou num e-mail. */
export function textoDoOrcamento(v: any, r: ResultadoViagem) {
  const c = custosDaViagem(v);
  const roteiro = [v?.origem?.texto, ...(v?.paradas || []).map((p: any) => p.texto)].filter(Boolean);
  const linhas = [
    `ORÇAMENTO DE VIAGEM — ${v?.titulo || 'sem título'}`,
    v?.data_saida ? `Saída: ${new Date(v.data_saida + 'T12:00:00').toLocaleDateString('pt-BR')}` : '',
    `Roteiro: ${roteiro.join(' → ')}${v?.ida_e_volta && roteiro.length ? ' → volta à origem' : ''}`,
    r.temRota ? `Percurso: ${fmtKm(r.km)} · ${fmtHoras(r.horasDirecao)} de direção · ${r.dias} dia(s) · ${r.noites} noite(s)` : 'Percurso: rota ainda não calculada',
    `Pessoas: ${v?.pessoas || 1}`,
    '',
    `Combustível: ${fmtReais(r.combustivel)}`,
    `Desgaste do veículo: ${fmtReais(r.desgaste)}`,
    `Hospedagem: ${fmtReais(r.hospedagem)}`,
    `Alimentação: ${fmtReais(r.alimentacao)}`,
    `Pedágios: ${fmtReais(r.pedagios)}`,
    ...((c.outros || []).filter(o => o.descricao || num(o.valor)).map(o => `${o.descricao || 'Outro'}: ${fmtReais(num(o.valor))}`)),
    `CUSTO TOTAL: ${fmtReais(r.custoTotal)}`,
    c.margem_pct ? `Margem (${c.margem_pct}%): ${fmtReais(r.margem)}` : '',
    c.margem_pct ? `VALOR DO ORÇAMENTO: ${fmtReais(r.orcamento)}` : '',
    r.temRota ? `Km rodado: ${fmtReais(r.valorKmRodado)}/km × ${fmtKm(r.km)} = ${fmtReais(r.kmRodadoTotal)}` : '',
  ];
  return linhas.filter((l, i) => l !== '' || linhas[i - 1] !== '').join('\n');
}
