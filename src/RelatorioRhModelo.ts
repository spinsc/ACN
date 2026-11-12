// ─────────────────────────────────────────────────────────────────────────────
// RH — relatórios personalizados (pedido do usuário em 05/11/2026)
//
// Um só relatório que a pessoa monta: escolhe as colunas, filtra (tipo, empresa, departamento, função, sexo, mês de aniversário, período de admissão, situação), agrupa e ordena;
// e há modelos prontos (aniversariantes, admissões e tempo de casa, quadro por função, quadro completo) que só preenchem essas escolhas. Tudo é calculado aqui, no navegador,
// sobre as pessoas que a tela do RH já leu (ativas e desligadas): não há consulta nova ao banco, e quem não pode ler o cadastro do RH não chega a ver o relatório.
//
// Decisão de conteúdo (05/11/2026): ficam FORA das colunas escolhíveis salário, CPF, CNPJ, endereço e contato de emergência. São dado sensível e nenhum dos relatórios pedidos
// (aniversários, admissões, funções) precisa deles; se o RH pedir, entram à parte e com decisão do usuário.
// Datas são tratadas como texto AAAA-MM-DD, nunca por `new Date`, porque a data de nascimento "1990-05-10" virava 09/05 no fuso do Brasil.
// ─────────────────────────────────────────────────────────────────────────────
import { departamentosTexto, departamentoPrincipal } from './RhDepartamentos';
import { combinaBusca, normalizarBusca } from './SearchUtils';

export type Pessoa = any;
export type ColunaDoRelatorio = { id: string; rotulo: string; texto: (f: Pessoa, hoje: string) => string; ordem?: (f: Pessoa, hoje: string) => number | string | null };

const dia = (d: any): [number, number, number] | null => {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
export const diaBr = (d: any): string => { const p = dia(d); return p ? `${String(p[2]).padStart(2, '0')}/${String(p[1]).padStart(2, '0')}/${p[0]}` : ''; };
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Idade em anos completos no dia `hoje`. Vazio se não há data de nascimento. */
export function idadeEm(nascimento: any, hoje: string): number | null {
  const n = dia(nascimento), h = dia(hoje);
  if (!n || !h) return null;
  let anos = h[0] - n[0];
  if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) anos--;
  return anos >= 0 ? anos : null;
}

/** O próximo aniversário a partir de `hoje` (hoje conta) e a idade que a pessoa completa nele. 29/02 em ano sem bissexto vale 28/02. */
export function proximoAniversario(nascimento: any, hoje: string): { data: string; completa: number } | null {
  const n = dia(nascimento), h = dia(hoje);
  if (!n || !h) return null;
  const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const noAno = (a: number) => (n[1] === 2 && n[2] === 29 && !bissexto(a)) ? [a, 2, 28] : [a, n[1], n[2]];
  let [a, m, d] = noAno(h[0]);
  if (m < h[1] || (m === h[1] && d < h[2])) [a, m, d] = noAno(h[0] + 1);
  return { data: `${a}-${doisDigitos(m)}-${doisDigitos(d)}`, completa: a - n[0] };
}

/** Meses completos entre duas datas (a segunda não vale antes da primeira). */
export function mesesEntre(de: any, ate: any): number | null {
  const a = dia(de), b = dia(ate);
  if (!a || !b) return null;
  const m = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0);
  return m >= 0 ? m : null;
}

/** "3 anos e 2 meses", "5 meses", "menos de 1 mês". Para quem saiu, conta até o desligamento. */
export function tempoDeCasa(f: Pessoa, hoje: string): string {
  const fim = f?.status_presenca === 'Desligado' && dia(f?.data_desligamento) ? f.data_desligamento : hoje;
  if (!dia(f?.data_admissao)) return '';
  const m = mesesEntre(f.data_admissao, fim);
  if (m === null) return 'ainda não começou';
  const anos = Math.floor(m / 12), meses = m % 12;
  if (!anos && !meses) return 'menos de 1 mês';
  return [anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}` : '', meses ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean).join(' e ');
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const nomeDoMes = (m: number) => MESES[m - 1] || '';
export const tipoDe = (f: Pessoa) => f?.tipo_colaborador || 'Funcionário';
export const situacaoDe = (f: Pessoa) => f?.status_presenca === 'Desligado' ? 'Desligado' : 'Ativo';
const mmdd = (d: any) => { const p = dia(d); return p ? p[1] * 100 + p[2] : null; };

export const COLUNAS: ColunaDoRelatorio[] = [
  { id: 'nome', rotulo: 'Nome', texto: f => f.nome || '', ordem: f => normalizarBusca(f.nome || '') },
  { id: 'nome_completo', rotulo: 'Nome completo', texto: f => f.nome_completo || '', ordem: f => normalizarBusca(f.nome_completo || '') || null },
  { id: 'cargo', rotulo: 'Função / cargo', texto: f => f.cargo || '', ordem: f => normalizarBusca(f.cargo || '') || null },
  { id: 'departamento', rotulo: 'Departamento', texto: f => departamentosTexto(f), ordem: f => normalizarBusca(departamentosTexto(f)) || null },
  { id: 'tipo', rotulo: 'Tipo', texto: f => tipoDe(f), ordem: f => tipoDe(f) },
  { id: 'empresa', rotulo: 'Empresa', texto: f => f.empresa || '', ordem: f => normalizarBusca(f.empresa || '') || null },
  { id: 'empresa_prestador', rotulo: 'Empresa do prestador', texto: f => f.empresa_prestador || '', ordem: f => normalizarBusca(f.empresa_prestador || '') || null },
  { id: 'sexo', rotulo: 'Sexo', texto: f => f.sexo || '', ordem: f => f.sexo || null },
  { id: 'nascimento', rotulo: 'Nascimento', texto: f => diaBr(f.data_nascimento), ordem: f => dia(f.data_nascimento) ? String(f.data_nascimento).slice(0, 10) : null },
  { id: 'aniversario', rotulo: 'Aniversário (dia/mês)', texto: f => { const p = dia(f.data_nascimento); return p ? `${doisDigitos(p[2])}/${doisDigitos(p[1])}` : ''; }, ordem: f => mmdd(f.data_nascimento) },
  { id: 'idade', rotulo: 'Idade', texto: (f, h) => { const i = idadeEm(f.data_nascimento, h); return i === null ? '' : String(i); }, ordem: (f, h) => idadeEm(f.data_nascimento, h) },
  { id: 'proximo_aniversario', rotulo: 'Próximo aniversário', texto: (f, h) => { const a = proximoAniversario(f.data_nascimento, h); return a ? `${diaBr(a.data)} (completa ${a.completa})` : ''; },
    ordem: (f, h) => proximoAniversario(f.data_nascimento, h)?.data ?? null },
  { id: 'admissao', rotulo: 'Admissão / início', texto: f => diaBr(f.data_admissao), ordem: f => dia(f.data_admissao) ? String(f.data_admissao).slice(0, 10) : null },
  { id: 'tempo_casa', rotulo: 'Tempo de casa', texto: (f, h) => tempoDeCasa(f, h),
    ordem: (f, h) => { const fim = f?.status_presenca === 'Desligado' && dia(f?.data_desligamento) ? f.data_desligamento : h; return mesesEntre(f.data_admissao, fim); } },
  { id: 'situacao', rotulo: 'Situação', texto: f => situacaoDe(f), ordem: f => situacaoDe(f) },
  { id: 'desligamento', rotulo: 'Desligamento', texto: f => diaBr(f.data_desligamento), ordem: f => dia(f.data_desligamento) ? String(f.data_desligamento).slice(0, 10) : null },
  { id: 'motivo_desligamento', rotulo: 'Motivo do desligamento', texto: f => f.motivo_desligamento || '' },
  { id: 'email', rotulo: 'E-mail', texto: f => f.email || '', ordem: f => normalizarBusca(f.email || '') || null },
  { id: 'tamanho_camiseta', rotulo: 'Camiseta', texto: f => f.tamanho_camiseta || '' },
  { id: 'tamanho_calca', rotulo: 'Calça', texto: f => f.tamanho_calca || '' },
  { id: 'tamanho_sapato', rotulo: 'Sapato', texto: f => f.tamanho_sapato || '' },
];
export const colunaPorId = (id: string) => COLUNAS.find(c => c.id === id);

// ── filtros ──────────────────────────────────────────────────────────────────
export type FiltrosDoRelatorio = {
  situacao: 'ativos' | 'desligados' | 'todos';
  tipo: '' | 'Funcionário' | 'Terceiro';
  empresa: string; departamento: string; cargo: string; sexo: string;
  mesNascimento: string;            // '' = todos; 'este' = o mês de hoje; '1'..'12'
  admissaoDe: string; admissaoAte: string;   // AAAA-MM-DD; vazio = sem limite
  busca: string;
};
export const FILTROS_VAZIOS: FiltrosDoRelatorio = { situacao: 'ativos', tipo: '', empresa: '', departamento: '', cargo: '', sexo: '', mesNascimento: '', admissaoDe: '', admissaoAte: '', busca: '' };

const mesDoFiltro = (f: FiltrosDoRelatorio, hoje: string): number | null => {
  if (!f.mesNascimento) return null;
  if (f.mesNascimento === 'este') return dia(hoje)?.[1] ?? null;
  const n = Number(f.mesNascimento);
  return n >= 1 && n <= 12 ? n : null;
};

/** Quem passa nos filtros. Quem não tem a data que o filtro pede (nascimento ou admissão) NÃO passa — por isso a tela conta à parte os que ficaram de fora por falta da data. */
export function filtrarPessoas(pessoas: Pessoa[], fi: FiltrosDoRelatorio, hoje: string): { lista: Pessoa[]; semNascimento: number; semAdmissao: number } {
  const mes = mesDoFiltro(fi, hoje);
  let semNascimento = 0, semAdmissao = 0;
  const lista = (pessoas || []).filter(f => {
    if (fi.situacao === 'ativos' && situacaoDe(f) !== 'Ativo') return false;
    if (fi.situacao === 'desligados' && situacaoDe(f) !== 'Desligado') return false;
    if (fi.tipo && tipoDe(f) !== fi.tipo) return false;
    if (fi.empresa && (f.empresa || '') !== fi.empresa) return false;
    if (fi.sexo && (f.sexo || '') !== fi.sexo) return false;
    if (fi.cargo && normalizarBusca(String(f.cargo || '').trim()) !== normalizarBusca(String(fi.cargo).trim())) return false;
    if (fi.departamento && !(Array.isArray(f.departamentos) && f.departamentos.includes(fi.departamento)) && !(!f.departamentos?.length && f.departamento === fi.departamento)) return false;
    if (fi.busca.trim() && !combinaBusca([f.nome, f.nome_completo, f.cargo, departamentosTexto(f), f.empresa, f.empresa_prestador, f.email], fi.busca)) return false;
    if (mes !== null) { const p = dia(f.data_nascimento); if (!p) { semNascimento++; return false; } if (p[1] !== mes) return false; }
    if (fi.admissaoDe || fi.admissaoAte) {
      const a = dia(f.data_admissao) ? String(f.data_admissao).slice(0, 10) : null;
      if (!a) { semAdmissao++; return false; }
      if (fi.admissaoDe && a < fi.admissaoDe) return false;
      if (fi.admissaoAte && a > fi.admissaoAte) return false;
    }
    return true;
  });
  return { lista, semNascimento, semAdmissao };
}

// ── ordem e grupos ───────────────────────────────────────────────────────────
function comparar(a: number | string | null, b: number | string | null, crescente: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;            // quem não tem o dado vai sempre para o fim
  if (b === null) return -1;
  const r = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'pt-BR') : (a as number) - (b as number);
  return crescente ? r : -r;
}
export function ordenarPessoas(lista: Pessoa[], colunaId: string, crescente: boolean, hoje: string): Pessoa[] {
  const col = colunaPorId(colunaId) || colunaPorId('nome')!;
  const chave = col.ordem || ((f: Pessoa, h: string) => col.texto(f, h) || null);
  return [...lista].sort((a, b) => comparar(chave(a, hoje), chave(b, hoje), crescente) || comparar(normalizarBusca(a.nome || ''), normalizarBusca(b.nome || ''), true));
}

export const AGRUPAMENTOS: { id: string; rotulo: string }[] = [
  { id: '', rotulo: 'Sem grupos' }, { id: 'tipo', rotulo: 'Tipo' }, { id: 'departamento', rotulo: 'Departamento (o principal da pessoa)' }, { id: 'cargo', rotulo: 'Função / cargo' },
  { id: 'empresa', rotulo: 'Empresa' }, { id: 'sexo', rotulo: 'Sexo' }, { id: 'mes_nascimento', rotulo: 'Mês de aniversário' }, { id: 'ano_admissao', rotulo: 'Ano de admissão' }, { id: 'situacao', rotulo: 'Situação' },
];
const SEM = '(não informado)';
function rotuloDoGrupo(f: Pessoa, agrupar: string): { chave: string; ordem: number | string | null } {
  switch (agrupar) {
    case 'tipo': return { chave: tipoDe(f), ordem: tipoDe(f) };
    case 'departamento': { const d = departamentoPrincipal(f); return { chave: d || SEM, ordem: d ? normalizarBusca(d) : null }; }
    case 'cargo': return { chave: f.cargo?.trim() || SEM, ordem: f.cargo?.trim() ? normalizarBusca(f.cargo.trim()) : null };
    case 'empresa': return { chave: f.empresa || SEM, ordem: f.empresa ? normalizarBusca(f.empresa) : null };
    case 'sexo': return { chave: f.sexo || SEM, ordem: f.sexo ? normalizarBusca(f.sexo) : null };
    case 'situacao': return { chave: situacaoDe(f), ordem: situacaoDe(f) };
    case 'mes_nascimento': { const p = dia(f.data_nascimento); return p ? { chave: nomeDoMes(p[1]), ordem: p[1] } : { chave: SEM, ordem: 99 }; }
    case 'ano_admissao': { const p = dia(f.data_admissao); return p ? { chave: String(p[0]), ordem: p[0] } : { chave: SEM, ordem: 99999 }; }
    default: return { chave: '', ordem: 0 };
  }
}
/** Separa a lista (já ordenada) em grupos, na ordem natural do assunto do grupo (meses de janeiro a dezembro, anos crescentes, nomes de A a Z), com "não informado" por último. */
export function agruparPessoas(lista: Pessoa[], agrupar: string): { titulo: string; pessoas: Pessoa[] }[] {
  if (!agrupar) return [{ titulo: '', pessoas: lista }];
  const mapa = new Map<string, { ordem: number | string | null; pessoas: Pessoa[] }>();
  for (const f of lista) {
    const g = rotuloDoGrupo(f, agrupar);
    (mapa.get(g.chave) || mapa.set(g.chave, { ordem: g.ordem, pessoas: [] }).get(g.chave)!).pessoas.push(f);
  }
  return [...mapa.entries()].sort((a, b) => comparar(a[1].ordem, b[1].ordem, true)).map(([titulo, v]) => ({ titulo, pessoas: v.pessoas }));
}

// ── modelos prontos ──────────────────────────────────────────────────────────
export type ConfigDoRelatorio = { colunas: string[]; filtros: FiltrosDoRelatorio; agrupar: string; ordenarPor: string; crescente: boolean };
export type ModeloPronto = { id: string; rotulo: string; ajuda: string; config: () => ConfigDoRelatorio };
export const MODELOS: ModeloPronto[] = [
  { id: 'aniversariantes', rotulo: 'Aniversariantes', ajuda: 'Quem faz aniversário no mês, na ordem dos dias. Troque o mês no filtro.',
    config: () => ({ colunas: ['nome', 'aniversario', 'proximo_aniversario', 'cargo', 'departamento', 'tipo'], filtros: { ...FILTROS_VAZIOS, mesNascimento: 'este' }, agrupar: '', ordenarPor: 'aniversario', crescente: true }) },
  { id: 'admissoes', rotulo: 'Admissões e tempo de casa', ajuda: 'Data de admissão (ou início, para terceiros) e há quanto tempo a pessoa está na empresa; os mais antigos primeiro.',
    config: () => ({ colunas: ['nome', 'admissao', 'tempo_casa', 'cargo', 'departamento', 'tipo'], filtros: { ...FILTROS_VAZIOS }, agrupar: '', ordenarPor: 'admissao', crescente: true }) },
  { id: 'por_funcao', rotulo: 'Quadro por função', ajuda: 'Quem exerce cada função, com o total de cada uma.',
    config: () => ({ colunas: ['nome', 'tipo', 'departamento', 'admissao'], filtros: { ...FILTROS_VAZIOS }, agrupar: 'cargo', ordenarPor: 'nome', crescente: true }) },
  { id: 'quadro', rotulo: 'Quadro de colaboradores', ajuda: 'Todos os ativos por departamento, com tipo, empresa e admissão.',
    config: () => ({ colunas: ['nome', 'cargo', 'tipo', 'empresa', 'admissao'], filtros: { ...FILTROS_VAZIOS }, agrupar: 'departamento', ordenarPor: 'nome', crescente: true }) },
];

// ── saída ────────────────────────────────────────────────────────────────────
/** CSV que o Excel brasileiro abre direto: separador ponto e vírgula e marca de UTF-8 no início (senão os acentos quebram). Aspas dobradas dentro do texto. */
export function paraCsv(colunas: ColunaDoRelatorio[], grupos: { titulo: string; pessoas: Pessoa[] }[], hoje: string, comColunaGrupo: boolean, tituloDoGrupo = 'Grupo'): string {
  const celula = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = [...(comColunaGrupo ? [tituloDoGrupo] : []), ...colunas.map(c => c.rotulo)].map(celula).join(';');
  const linhas = grupos.flatMap(g => g.pessoas.map(f => [...(comColunaGrupo ? [g.titulo] : []), ...colunas.map(c => c.texto(f, hoje))].map(celula).join(';')));
  return '﻿' + [cab, ...linhas].join('\r\n');
}
