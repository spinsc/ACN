// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE CUSTO DA MÃO DE OBRA — horas instaladas e custo da hora por departamento (pedido do diretor, levado pelo usuário em 13/11/2026)
//
// "Hora instalada" = a capacidade da casa: quantas horas as pessoas do departamento ficam à disposição no mês, e NÃO as horas apontadas em tarefa.
// Decidido com o usuário em 13/11/2026: o KPI de tarefas ainda não é usado à risca, então vale a JORNADA — segunda a sexta, das 8:00 às 17:48 com 1 hora de
// intervalo (8 h 48 min por dia útil). Os feriados nacionais não contam (os pontos facultativos, Carnaval e Corpus Christi, contam como dia de trabalho:
// a empresa decide a folga caso a caso e o relatório não inventa folga). Feriado de estado e de município não estão na lista.
//
// Custo: CLT = salário base + adicional de cargo de confiança + insalubridade + ajuda de custo + alimentação (a "folha"), com um percentual de ENCARGOS que quem lê
// ajusta na tela (INSS, FGTS, férias, 13º; o sistema não guarda encargo e o relatório mostra as duas colunas, sem e com). Terceiro = "Valor dos serviços" do
// cadastro, tratado como valor MENSAL (confirmado pelo usuário em 13/11/2026); terceiro não leva encargo. CLT e terceiro ficam SEMPRE em quadros separados.
//
// Departamento: a pessoa que está em mais de um conta INTEIRA no primeiro da lista do RH (decisão do usuário em 13/11/2026); sem nenhum, "Sem departamento".
// Quem entrou ou saiu no meio do mês conta só os dias úteis em que esteve na casa, e o custo do mês vem na mesma proporção.
// Pessoa sem custo cadastrado (salário ou valor de serviços vazio) entra nas horas, mas FICA FORA do custo da hora: senão o valor da hora cairia sem motivo.
// Datas são sempre texto AAAA-MM-DD (nunca `new Date` para o dia: vira o dia de Londres).
// ─────────────────────────────────────────────────────────────────────────────
import { feriadosDoAno, somarDias } from './InicioModelo';
import { departamentoPrincipal } from './RhDepartamentos';

/** 8:00 às 17:48 = 588 min, menos 1 h de intervalo. */
export const JORNADA_MINUTOS_POR_DIA = 528;
export const JORNADA_HORAS_POR_DIA = JORNADA_MINUTOS_POR_DIA / 60;   // 8,8 h = 8 h 48 min
export const JORNADA_TEXTO = 'segunda a sexta, das 8h às 17h48, com 1 hora de intervalo (8h48 por dia útil)';
export const SEM_DEPARTAMENTO = 'Sem departamento';

export type Periodo = { ini: string; fim: string };

/** "2026-11" → primeiro e último dia do mês (texto). */
export function periodoDoMes(mes: string): Periodo | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  if (!m) return null;
  const ano = +m[1], mm = +m[2];
  if (mm < 1 || mm > 12) return null;
  const ultimo = new Date(Date.UTC(ano, mm, 0)).getUTCDate();   // dia 0 do mês seguinte = último deste
  return { ini: `${m[1]}-${m[2]}-01`, fim: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, '0')}` };
}

const ehFimDeSemana = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); const w = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); return w === 0 || w === 6; };

/** Os feriados nacionais (não os facultativos) dos anos que o período toca, como conjunto de datas. */
export function feriadosDoPeriodo(p: Periodo): Set<string> {
  const anos = new Set<number>([+p.ini.slice(0, 4), +p.fim.slice(0, 4)]);
  const s = new Set<string>();
  anos.forEach(a => feriadosDoAno(a).filter(f => f.tipo === 'feriado').forEach(f => s.add(f.data)));
  return s;
}

/** Dias úteis (segunda a sexta, fora feriado nacional) entre duas datas, as duas contadas. */
export function diasUteisEntre(ini: string, fim: string, feriados: Set<string>): number {
  if (!ini || !fim || ini > fim) return 0;
  let n = 0;
  for (let d = ini, guarda = 0; d <= fim && guarda < 800; d = somarDias(d, 1), guarda++) {
    if (!ehFimDeSemana(d) && !feriados.has(d)) n++;
  }
  return n;
}

const num = (v: any): number => (v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const temValor = (v: any): boolean => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));
const dia = (v: any): string => (v ? String(v).slice(0, 10) : '');
export const ehTerceiro = (f: any): boolean => f?.tipo_colaborador === 'Terceiro';

/**
 * O custo do MÊS INTEIRO da pessoa e de onde ele veio. `custo: null` = nada cadastrado (a pessoa fica fora do custo da hora).
 * CLT: salário base é obrigatório; sem ele, `null`. Terceiro: "Valor dos serviços"; se estiver vazio e houver salário (cadastro antigo), usa o salário e avisa.
 */
export function custoMensalDaPessoa(f: any): { custo: number | null; folha: number; beneficios: number; origem: 'folha' | 'servicos' | 'salario_do_terceiro' | 'nenhum' } {
  if (ehTerceiro(f)) {
    if (temValor(f.valor_servicos)) return { custo: num(f.valor_servicos), folha: num(f.valor_servicos), beneficios: 0, origem: 'servicos' };
    if (temValor(f.salario)) return { custo: num(f.salario), folha: num(f.salario), beneficios: 0, origem: 'salario_do_terceiro' };
    return { custo: null, folha: 0, beneficios: 0, origem: 'nenhum' };
  }
  if (!temValor(f.salario)) return { custo: null, folha: 0, beneficios: 0, origem: 'nenhum' };
  const folha = num(f.salario) + (f.cargo_confianca ? num(f.adicional_cargo_confianca) : 0) + num(f.insalubridade_valor);
  const beneficios = num(f.ajuda_custo) + num(f.alimentacao);
  return { custo: Math.round((folha + beneficios) * 100) / 100, folha: Math.round(folha * 100) / 100, beneficios: Math.round(beneficios * 100) / 100, origem: 'folha' };
}

export type LinhaPessoa = {
  id: string; nome: string; tipo: 'CLT' | 'Terceiro'; departamento: string;
  de: string; ate: string; diasUteis: number; horas: number;
  custoDoMes: number | null; custoNoPeriodo: number | null; beneficios: number; origem: string;
  semDataDeEntrada: boolean;
};

/** A pessoa dentro do período: os dias úteis em que esteve na casa, as horas instaladas e o custo na mesma proporção. Fora do período → null. */
export function linhaDaPessoa(f: any, p: Periodo, feriados: Set<string>, diasUteisDoMes: number): LinhaPessoa | null {
  const adm = dia(f.data_admissao), desl = dia(f.data_desligamento);
  // desligada sem data: não dá para dizer quando saiu, então fica de fora (o relatório avisa quantas)
  const saiu = f.ativo === false || f.status_presenca === 'Desligado';
  if (saiu && !desl) return null;
  const de = adm && adm > p.ini ? adm : p.ini;
  const ate = desl && desl < p.fim ? desl : p.fim;
  if (de > ate) return null;
  const dias = diasUteisEntre(de, ate, feriados);
  const c = custoMensalDaPessoa(f);
  const proporcao = diasUteisDoMes > 0 ? dias / diasUteisDoMes : 0;
  return {
    id: f.id, nome: f.nome || '(sem nome)', tipo: ehTerceiro(f) ? 'Terceiro' : 'CLT', departamento: departamentoPrincipal(f) || SEM_DEPARTAMENTO,
    de, ate, diasUteis: dias, horas: dias * JORNADA_HORAS_POR_DIA,
    custoDoMes: c.custo, custoNoPeriodo: c.custo === null ? null : c.custo * proporcao, beneficios: c.beneficios * proporcao, origem: c.origem,
    semDataDeEntrada: !adm,
  };
}

export type Bloco = { pessoas: number; horas: number; horasComCusto: number; custo: number };
export type LinhaDepartamento = { departamento: string; clt: Bloco; terceiro: Bloco };
export type Resultado = {
  periodo: Periodo; diasUteisDoMes: number; horasPorPessoaNoMes: number;
  pessoas: LinhaPessoa[]; departamentos: LinhaDepartamento[];
  totalClt: Bloco; totalTerceiro: Bloco;
  semCusto: LinhaPessoa[]; semDataDeEntrada: LinhaPessoa[]; terceiroComSalario: LinhaPessoa[]; desligadosSemData: number;
};

const blocoVazio = (): Bloco => ({ pessoas: 0, horas: 0, horasComCusto: 0, custo: 0 });
function somar(b: Bloco, l: LinhaPessoa) {
  b.pessoas += 1; b.horas += l.horas;
  if (l.custoNoPeriodo !== null) { b.horasComCusto += l.horas; b.custo += l.custoNoPeriodo; }
}

/** Tudo do relatório, de um mês. `funcionarios` já com os departamentos anexados (`anexarDepartamentos`). `ordemDosDepartamentos` põe os departamentos na ordem da lista do RH. */
export function montarRelatorio(funcionarios: any[], mes: string, ordemDosDepartamentos: string[] = []): Resultado | null {
  const periodo = periodoDoMes(mes);
  if (!periodo) return null;
  const feriados = feriadosDoPeriodo(periodo);
  const diasUteisDoMes = diasUteisEntre(periodo.ini, periodo.fim, feriados);
  const vistos = new Set<string>();
  const pessoas: LinhaPessoa[] = [];
  let desligadosSemData = 0;
  for (const f of funcionarios || []) {
    if (!f?.id || vistos.has(f.id)) continue;
    vistos.add(f.id);
    const saiu = f.ativo === false || f.status_presenca === 'Desligado';
    if (saiu && !dia(f.data_desligamento)) { desligadosSemData++; continue; }
    const l = linhaDaPessoa(f, periodo, feriados, diasUteisDoMes);
    if (l) pessoas.push(l);
  }
  const porDepto = new Map<string, LinhaDepartamento>();
  const totalClt = blocoVazio(), totalTerceiro = blocoVazio();
  for (const l of pessoas) {
    const d = porDepto.get(l.departamento) || porDepto.set(l.departamento, { departamento: l.departamento, clt: blocoVazio(), terceiro: blocoVazio() }).get(l.departamento)!;
    somar(l.tipo === 'CLT' ? d.clt : d.terceiro, l);
    somar(l.tipo === 'CLT' ? totalClt : totalTerceiro, l);
  }
  const pos = (n: string) => { const i = ordemDosDepartamentos.indexOf(n); return n === SEM_DEPARTAMENTO ? 9999 : i < 0 ? 5000 : i; };
  const departamentos = [...porDepto.values()].sort((a, b) => pos(a.departamento) - pos(b.departamento) || a.departamento.localeCompare(b.departamento, 'pt-BR'));
  pessoas.sort((a, b) => a.departamento.localeCompare(b.departamento, 'pt-BR') || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    periodo, diasUteisDoMes, horasPorPessoaNoMes: diasUteisDoMes * JORNADA_HORAS_POR_DIA, pessoas, departamentos, totalClt, totalTerceiro,
    semCusto: pessoas.filter(l => l.custoNoPeriodo === null),
    semDataDeEntrada: pessoas.filter(l => l.semDataDeEntrada),
    terceiroComSalario: pessoas.filter(l => l.origem === 'salario_do_terceiro'),
    desligadosSemData,
  };
}

/** Custo da hora: custo ÷ horas das pessoas que têm custo cadastrado. `encargosPct` só vale para o CLT. Sem horas, null. */
export function custoDaHora(b: Bloco, encargosPct = 0): number | null {
  return b.horasComCusto > 0 ? (b.custo * (1 + encargosPct / 100)) / b.horasComCusto : null;
}
export const custoComEncargos = (b: Bloco, encargosPct: number): number => b.custo * (1 + encargosPct / 100);

/** O encargo digitado ("35", "35,5") vira número entre 0 e 300; vazio vale 0 e o que não é número devolve null (a tela avisa). */
export function lerEncargos(txt: string): number | null {
  const t = String(txt ?? '').trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 300 ? n : null;
}

/** O que a planilha e a tela escrevem: horas com uma casa ("1.234,5 h"), dinheiro em reais. */
export const fmtHoras = (h: number): string => `${h.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
export const fmtReais = (v: number | null): string => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
