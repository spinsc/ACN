// ─────────────────────────────────────────────────────────────────────────────
// PONTO PARA O RH (20/11/2026): as regras da aba RH › Relógio Ponto, sem tela e sem banco (por isso se testam em Node).
//
// Três assuntos:
//  1. OCORRÊNCIAS — o que o RH precisa olhar no ponto de cada dia que já passou (batida incompleta, sem batida, falta, atraso, hora extra);
//  2. A GRADE DO MÊS — uma célula por pessoa e dia, para ver o mês inteiro de todos de uma vez;
//  3. O PAREAMENTO — como cada pessoa do RH é ligada à Secullum (CPF) e ao usuário do sistema (marca, e-mail ou nome), e o que falta para ligar.
// As contas de hora e a situação do dia são as de PontoSecullum.ts: o sistema não refaz o cálculo da Secullum.
// ─────────────────────────────────────────────────────────────────────────────
import { paresDoDia, situacaoDoDia, paraMinutos, paraTexto, extrasDoMes, ehFimDeSemana, ultimoDiaDoMes } from './PontoSecullum';

export type Familia = 'ok' | 'erro' | 'atencao' | 'info' | 'neutro' | 'marca';

// ── 1. Ocorrências ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Os tipos de ocorrência, na ordem em que aparecem. `ajusta` = alguém precisa corrigir ou justificar na Secullum (o resto só informa). */
export const TIPOS_DE_OCORRENCIA: { id: string; rotulo: string; familia: Familia; ajusta: boolean; dica: string }[] = [
  { id: 'incompleto', rotulo: 'Batida incompleta', familia: 'erro', ajusta: true, dica: 'Tem entrada sem saída (ou saída sem entrada): alguém esqueceu de bater. Corrigir na Secullum.' },
  { id: 'sem_batida', rotulo: 'Sem batida', familia: 'erro', ajusta: true, dica: 'Havia jornada prevista e nenhuma batida, e nenhum abono ou justificativa. Justificar ou lançar a batida na Secullum.' },
  { id: 'falta', rotulo: 'Falta', familia: 'erro', ajusta: true, dica: 'A Secullum contou o dia como falta. Se há atestado ou abono, lançar na Secullum.' },
  { id: 'atraso', rotulo: 'Atraso', familia: 'atencao', ajusta: false, dica: 'Atraso que a Secullum calculou no dia.' },
  { id: 'extra', rotulo: 'Hora extra', familia: 'info', ajusta: false, dica: 'Hora extra que a Secullum calculou no dia.' },
];
export const TIPO_DE_OCORRENCIA = Object.fromEntries(TIPOS_DE_OCORRENCIA.map(t => [t.id, t]));

export type Ocorrencia = { rhId: string; dia: string; tipo: string; detalhe: string };

/** O que o RH precisa ver num dia. Só dias que já passaram: o dia de hoje ainda não acabou (a Secullum o conta como falta antes de a pessoa bater). */
export function ocorrenciasDoDia(rhId: string, dia: string, valores: any, hoje: string): Ocorrencia[] {
  if (dia >= hoje) return [];
  const v = valores || {};
  const lista: Ocorrencia[] = [];
  const sit = situacaoDoDia(v, dia, hoje);
  const pares = paresDoDia(v);
  const batidas = pares.map(p => `${p.entrada || '—'} – ${p.saida || '…'}`).join(' · ');
  if (sit.id === 'incompleto') lista.push({ rhId, dia, tipo: 'incompleto', detalhe: batidas });
  else if (sit.id === 'sem_batida') lista.push({ rhId, dia, tipo: 'sem_batida', detalhe: `jornada de ${v['Carga'] || '—'} sem nenhuma batida` });
  else if (sit.id === 'falta') lista.push({ rhId, dia, tipo: 'falta', detalhe: `${v['Faltas'] || '—'} de falta` });
  const atraso = paraMinutos(v['Atras.']);
  if (atraso > 0) lista.push({ rhId, dia, tipo: 'atraso', detalhe: `${paraTexto(atraso)} de atraso${batidas ? ` · ${batidas}` : ''}` });
  const ex = extrasDoMes(v);
  if (ex.total > 0) lista.push({ rhId, dia, tipo: 'extra', detalhe: `${paraTexto(ex.total)}${ex.partes.length > 1 ? ` (${ex.partes.map(p => `${p.rotulo} ${paraTexto(p.min)}`).join(', ')})` : ''}${batidas ? ` · ${batidas}` : ''}` });
  return lista;
}

/** As ocorrências de todos: `dias` é a lista de linhas de `ponto_dias` ({ rh_id, dia, valores }). Mais novas primeiro, depois por pessoa. */
export function ocorrenciasDoMes(dias: any[], hoje: string): Ocorrencia[] {
  const todas: Ocorrencia[] = [];
  for (const d of dias || []) todas.push(...ocorrenciasDoDia(String(d.rh_id), String(d.dia).slice(0, 10), d.valores, hoje));
  return todas.sort((a, b) => b.dia.localeCompare(a.dia) || a.rhId.localeCompare(b.rhId));
}

export function contarOcorrencias(lista: Ocorrencia[]): Record<string, number> {
  const c: Record<string, number> = Object.fromEntries(TIPOS_DE_OCORRENCIA.map(t => [t.id, 0]));
  for (const o of lista) c[o.tipo] = (c[o.tipo] || 0) + 1;
  c.ajusta = TIPOS_DE_OCORRENCIA.filter(t => t.ajusta).reduce((s, t) => s + c[t.id], 0);
  return c;
}

// ── 2. A grade do mês ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Celula = { dia: string; familia: Familia | 'vazio'; texto: string; titulo: string };

/** Os dias do mês (AAAA-MM-DD), do primeiro ao último. */
export function diasDoMes(mes: string): string[] {
  const ult = Number(ultimoDiaDoMes(mes).slice(8, 10)), pre = mes.slice(0, 8);
  return Array.from({ length: ult }, (_, i) => pre + String(i + 1).padStart(2, '0'));
}

/**
 * A célula de uma pessoa num dia. Cor = a situação do dia (verde completo, vermelho a ajustar, azul hoje, cinza folga ou abono, vazio sem jornada ou dia que ainda vem);
 * o texto é a hora da primeira entrada (a pessoa que passa o olho já vê quem entrou tarde) e o título é o dia inteiro, para o mouse.
 */
export function celulaDoDia(dia: string, valores: any, hoje: string): Celula {
  if (dia > hoje) return { dia, familia: 'vazio', texto: '', titulo: 'Dia que ainda vem' };
  const v = valores || null;
  if (!v) return { dia, familia: 'vazio', texto: '', titulo: ehFimDeSemana(dia) ? 'Fim de semana, sem registro' : 'Sem registro guardado' };
  const sit = situacaoDoDia(v, dia, hoje);
  const pares = paresDoDia(v);
  const primeira = pares[0]?.entrada || '';
  const detalhes = [pares.length ? pares.map(p => `${p.entrada || '—'} – ${p.saida || '…'}`).join(' · ') : '', v['Normais'] ? `normais ${v['Normais']}` : '', extrasDoMes(v).total ? `extras ${paraTexto(extrasDoMes(v).total)}` : '', paraMinutos(v['Atras.']) > 0 ? `atraso ${v['Atras.']}` : ''].filter(Boolean).join(' · ');
  const familia: Familia | 'vazio' = sit.id === 'sem_jornada' ? 'vazio' : sit.id === 'trabalhando' || sit.id === 'ainda_nao_bateu' ? 'info' : sit.familia;
  return { dia, familia, texto: sit.familia === 'erro' ? '!' : primeira, titulo: `${sit.rotulo}${detalhes ? ` — ${detalhes}` : ''}` };
}

/** Quantos dias a pessoa trabalhou (teve batida) e quantos dias passados ainda têm problema. */
export function diasDaPessoa(dias: { dia: string; valores: any }[], hoje: string): { trabalhados: number; comProblema: number; comExtra: number } {
  let trabalhados = 0, comProblema = 0, comExtra = 0;
  for (const d of dias || []) {
    const dia = String(d.dia).slice(0, 10), v = d.valores || {};
    if (paresDoDia(v).length) trabalhados++;
    if (dia < hoje && situacaoDoDia(v, dia, hoje).familia === 'erro') comProblema++;
    if (dia < hoje && extrasDoMes(v).total > 0) comExtra++;
  }
  return { trabalhados, comProblema, comExtra };
}

// ── 3. O pareamento ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const soDigitos = (s: any) => String(s ?? '').replace(/\D/g, '');
export const semAcento = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "123.456.789-01" → "***.456.789-**" (o mesmo disfarce que a função de servidor usa para os CPFs da Secullum, para dar para comparar os dois lados). */
export function cpfMascarado(cpf: any): string {
  const d = soDigitos(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : (d ? '(CPF incompleto)' : '(sem CPF)');
}
export const cpfValido = (cpf: any): boolean => soDigitos(cpf).length === 11;

/**
 * Quem deveria bater ponto na Secullum: CLT ativo cuja empresa cita a Detech (a mesma regra da função de servidor), menos quem o RH marcou "Não bate ponto"
 * na ficha (25/11/2026: sócio, diretoria e quem trabalha fora da escala; sem a marca eles apareciam para sempre na faixa "sem par na Secullum").
 * A função de servidor da Secullum não conhece a marca: quem existe lá segue lido, só deixa de contar como pendência nas telas e nos avisos.
 */
export const deveBaterPonto = (p: any): boolean => !!p?.ativo && !p?.nao_bate_ponto && p?.tipo_colaborador === 'Funcionário' && /detech/i.test(String(p?.empresa || ''));

/**
 * O possível par, na Secullum, de quem o CPF não achou: um cadastro que só existe lá e tem o MESMO nome (sem acento) ou pelo menos dois nomes iguais.
 * É só uma pista para o RH conferir o CPF digitado; nunca liga ninguém sozinha.
 */
export function possivelParNaSecullum(nomeRh: string, soNaSecullum: { nome: string; cpf: string }[]): { nome: string; cpf: string } | null {
  const a = semAcento(nomeRh).split(' ').filter(t => t.length > 2);
  if (!a.length) return null;
  let melhor: any = null, melhorPontos = 0;
  for (const s of soNaSecullum || []) {
    const b = semAcento(s.nome).split(' ').filter(t => t.length > 2);
    const iguais = a.filter(t => b.includes(t)).length;
    const pontos = semAcento(nomeRh) === semAcento(s.nome) ? 100 : iguais;
    if (pontos > melhorPontos && (pontos === 100 || iguais >= 2)) { melhor = s; melhorPontos = pontos; }
  }
  return melhor;
}

export type LigacaoDoUsuario = { usuario: any | null; como: '' | 'marca' | 'e-mail' | 'nome'; observacao: string };
/**
 * Com quem o cadastro do RH está ligado no sistema, na mesma ordem do banco (`ponto_usuario_de`): a marca `usuario_id`, depois o e-mail, depois o nome inteiro,
 * e só vale se o casamento for ÚNICO. `usuarios` = os usuários ativos ({ id, nome, email }).
 */
export function ligacaoDoUsuario(rh: any, usuarios: any[]): LigacaoDoUsuario {
  const ativos = usuarios || [];
  if (rh?.usuario_id) {
    const u = ativos.find(x => x.id === rh.usuario_id);
    if (u) return { usuario: u, como: 'marca', observacao: 'ligado à mão pelo RH' };
  }
  const email = semAcento(rh?.email);
  if (email) {
    const c = ativos.filter(u => semAcento(u.email) === email);
    if (c.length === 1) return { usuario: c[0], como: 'e-mail', observacao: 'o e-mail da ficha é igual ao do usuário' };
    if (c.length > 1) return { usuario: null, como: '', observacao: 'mais de um usuário com o mesmo e-mail da ficha' };
  }
  const nome = semAcento(rh?.nome);
  if (nome) {
    const c = ativos.filter(u => semAcento(u.nome) === nome);
    if (c.length === 1) return { usuario: c[0], como: 'nome', observacao: 'o nome da ficha é igual ao do usuário' };
    if (c.length > 1) return { usuario: null, como: '', observacao: 'mais de um usuário com o mesmo nome da ficha' };
  }
  return { usuario: null, como: '', observacao: email ? 'o e-mail da ficha não é o de nenhum usuário' : 'a ficha não tem e-mail' };
}

/** Os usuários que mais se parecem com a ficha (pelos nomes), para a lista de escolha começar pelos mais prováveis. */
export function usuariosParecidos(rh: any, usuarios: any[]): any[] {
  const a = semAcento(rh?.nome).split(' ').filter(t => t.length > 2);
  const pontos = (u: any) => { const b = semAcento(u.nome).split(' '); return a.filter(t => b.includes(t)).length; };
  return [...(usuarios || [])].sort((x, y) => pontos(y) - pontos(x) || String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
}

export type SituacaoNaSecullum = { id: 'ok' | 'sem_cpf' | 'sem_par' | 'sem_leitura'; rotulo: string; familia: Familia; dica: string };
/** Onde a pessoa está na Secullum: lida (tem ponto guardado), CPF faltando, CPF que a Secullum não conhece, ou cadastro certo que ainda não foi lido. */
export function situacaoNaSecullum(rh: any, semParIds: string[], idsComPonto: Set<string>): SituacaoNaSecullum {
  if (!cpfValido(rh?.cpf)) return { id: 'sem_cpf', rotulo: 'CPF não cadastrado', familia: 'erro', dica: 'A ficha do RH não tem um CPF de 11 dígitos: é ele que liga a pessoa à Secullum. Preencher na ficha.' };
  if ((semParIds || []).includes(rh.id)) return { id: 'sem_par', rotulo: 'CPF não achado na Secullum', familia: 'erro', dica: 'O CPF da ficha não existe no cadastro da Secullum (digitado diferente ou pessoa ainda não cadastrada lá).' };
  if (idsComPonto?.has(rh.id)) return { id: 'ok', rotulo: 'Ligada', familia: 'ok', dica: 'O CPF foi achado na Secullum e o ponto está sendo lido.' };
  return { id: 'sem_leitura', rotulo: 'Ainda sem ponto lido', familia: 'atencao', dica: 'Nenhuma leitura boa ainda com este CPF: vale depois da próxima atualização.' };
}

// ── Planilha ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** CSV em português para o Excel (ponto e vírgula e marca UTF-8). */
export function paraCsv(cabecalho: string[], linhas: any[][]): string {
  const celula = (c: any) => { const t = String(c ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
}

// ── Quando é a próxima leitura automática ───────────────────────────────────────────────────────────────────────────────────────────────
/** As leituras automáticas da Secullum são às 8h30 e às 20h30 (horário de Brasília, que é o de quem usa o sistema). Devolve "hoje às 20:30" ou "amanhã às 08:30". */
export function proximaAtualizacao(agora: Date): string {
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos < 8 * 60 + 30) return 'hoje às 08:30';
  if (minutos < 20 * 60 + 30) return 'hoje às 20:30';
  return 'amanhã às 08:30';
}
