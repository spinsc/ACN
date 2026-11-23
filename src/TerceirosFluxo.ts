// Serviços de terceiros: as regras do PEDIDO e do QUADRO (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, pedido do usuário em 22/11/2026).
// Tudo aqui é conta pura, sem tela e sem banco, no modelo de ViagemFluxo.ts (as colunas, os passos que cada pessoa pode dar e o porquê quando não pode).
// Quem confere de verdade é o banco: as funções `terceiros_*` repetem estas regras (`terceiros_pode_mexer` e `terceiros_pode_marcar_data`) e recusam o que a tela deixasse passar;
// a tela só deixa de oferecer o botão que o banco recusaria. Por isso `podeMexerNoServico` e `podeMarcarData` têm de andar juntos com o SQL (supabase/sql/terceiros_servicos_t1.sql).
import { ehAdminOuGerente } from './utils/permissoes';
import { combinaBusca } from './SearchUtils';
import { lerValorDigitado } from './LerValor';
import type { TipoDeServico, PrestadorDeTerceiros, OndeSeFaz } from './TerceirosModelo';

export type SituacaoDoServico = 'solicitado' | 'agendado' | 'realizado' | 'cancelado';
export type PeriodoDoServico = 'manha' | 'tarde' | 'dia_todo';
export type LigacaoDoServico = 'op' | 'os' | 'demanda' | 'projeto';
export type FamiliaDoSelo = 'ok' | 'atencao' | 'erro' | 'info' | 'neutro' | 'marca';

export type PecaDoServico = { descricao: string; quantidade: number | null };
/** `caminho` é a chave no armazenamento (bucket acn-media, pasta terceiros/); o endereço de leitura sai dele, nada é guardado a mais. */
export type AnexoDoServico = { caminho: string; nome: string; tamanho?: number | null; por?: string | null; em?: string | null };
export type EventoDoServico = { em: string; por: string; acao: string; detalhe?: string };

export type ServicoDeTerceiro = {
  id: string; numero: string; tipo_id: string; descricao: string; status: SituacaoDoServico; status_desde: string;
  solicitante_id: string | null; solicitante_nome: string; solicitante_perfil: string | null;
  ligacao_tipo: LigacaoDoServico | null; ligacao_id: string | null; ligacao_rotulo: string | null; venda_base: string | null;
  prestador_id: string | null; onde: OndeSeFaz | null; valor_combinado: number | null; valor_final: number | null;
  data_desejada: string | null; data_agendada: string | null; periodo: PeriodoDoServico | null; data_realizada: string | null;
  conferido_por: string | null; conferido_em: string | null; pecas: PecaDoServico[]; anexos: AnexoDoServico[]; observacao: string | null;
  cancelado_motivo: string | null; cancelado_em: string | null; cancelado_por: string | null; historico?: EventoDoServico[];
  criado_em: string; criado_por: string | null; atualizado_em: string; atualizado_por: string | null;
};

// ═══ AS COLUNAS ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Três colunas (decisão do usuário em 22/11/2026): "no prestador", atrasado, choque de data e a pagar são SELOS calculados, não colunas, para ninguém ter um passo a mais ao atualizar.
// O Cancelado sai do quadro e fica no filtro "Cancelados".
export const COLUNAS_TERCEIROS: { id: SituacaoDoServico; rotulo: string; ajuda: string; familia: FamiliaDoSelo }[] = [
  { id: 'solicitado', rotulo: 'A definir', familia: 'atencao', ajuda: 'O serviço foi pedido; falta escolher o prestador e marcar o dia.' },
  { id: 'agendado', rotulo: 'Agendado', familia: 'info', ajuda: 'Prestador, dia e período marcados.' },
  { id: 'realizado', rotulo: 'Realizado', familia: 'ok', ajuda: 'O serviço foi feito e conferido.' },
];
export const COLUNA_CANCELADO: { id: SituacaoDoServico; rotulo: string; ajuda: string; familia: FamiliaDoSelo } =
  { id: 'cancelado', rotulo: 'Cancelado', familia: 'neutro', ajuda: 'Pedido cancelado, com o motivo no histórico. Nada se apaga.' };

const POR_COLUNA: Record<string, typeof COLUNAS_TERCEIROS[number]> = Object.fromEntries([...COLUNAS_TERCEIROS, COLUNA_CANCELADO].map(c => [c.id, c]));
export const rotuloDaSituacao = (s: string): string => POR_COLUNA[s]?.rotulo || String(s);
export const colunaDoServico = (s: Pick<ServicoDeTerceiro, 'status'>) => POR_COLUNA[s.status] || COLUNAS_TERCEIROS[0];

export const PERIODOS: { id: PeriodoDoServico; rotulo: string }[] = [
  { id: 'manha', rotulo: 'Manhã' }, { id: 'tarde', rotulo: 'Tarde' }, { id: 'dia_todo', rotulo: 'Dia todo' },
];
export const rotuloDoPeriodo = (p: string | null | undefined): string => PERIODOS.find(x => x.id === p)?.rotulo || '—';

export const ROTULO_DA_LIGACAO: Record<string, string> = { op: 'OP', os: 'OS', demanda: 'Demanda', projeto: 'Projeto' };
/** "OP A1673.2609/03", "OS 2611-021"… ou "Sem ligação" (o serviço avulso). */
export const rotuloDaLigacao = (s: Pick<ServicoDeTerceiro, 'ligacao_tipo' | 'ligacao_rotulo'>): string =>
  (s.ligacao_tipo ? `${ROTULO_DA_LIGACAO[s.ligacao_tipo] || s.ligacao_tipo}${s.ligacao_rotulo ? ' ' + s.ligacao_rotulo : ''}` : 'Sem ligação');

// ═══ DATAS (texto AAAA-MM-DD; nunca `new Date(texto)` para o dia: a meia-noite de Londres é o dia anterior no Brasil) ══════════════════════════════
const meioDia = (iso: string): number => new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime();
export const diasEntreDatas = (de: string, ate: string): number => Math.round((meioDia(ate) - meioDia(de)) / 86400000);
export function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(meioDia(iso));
  d.setDate(d.getDate() + dias);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
/** Dias na coluna em que o cartão está (a partir de `status_desde`). */
export function diasNaColunaDoServico(s: Pick<ServicoDeTerceiro, 'status_desde' | 'atualizado_em' | 'criado_em'>, agora = new Date()): number {
  const t = new Date(s.status_desde || s.atualizado_em || s.criado_em || '').getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((agora.getTime() - t) / 86400000)) : 0;
}

// ═══ QUEM PODE O QUÊ (espelho das funções do banco) ═══════════════════════════════════════════════════════════════════════════════════════════════
/** Diretoria = Admin e perfis "Gerente …", a mesma conta de `terceiros_ator()` no banco (a equipe do Comercial que só vale como gerente em outras telas NÃO conta aqui). */
export const ehDaDiretoria = (u: any): boolean => ehAdminOuGerente(u);
/** Adaptação = quem tem a aba `producao` (lista de abas vazia = todas), a conta de `tem_aba('producao')`. */
export function ehDaAdaptacao(u: any): boolean {
  const abas = u?.abas_permitidas;
  return !Array.isArray(abas) || abas.length === 0 || abas.includes('producao');
}
/** Valores (combinado e final) só para quem já vê valores no sistema: o campo vazio vale "vê" (decisão do usuário em 22/11/2026, o mesmo padrão do Compras). */
export const veValores = (u: any): boolean => u?.ver_valores !== false;

const foiPedidoPor = (u: any, s: Pick<ServicoDeTerceiro, 'solicitante_id'>): boolean => !!(u?.id && s?.solicitante_id && String(s.solicitante_id) === String(u.id));

/** Altera os dados, dá como realizado, reabre e cancela: diretoria, quem pediu e, nos tipos da Adaptação, a Adaptação. */
export function podeMexerNoServico(u: any, s: Pick<ServicoDeTerceiro, 'solicitante_id'>, tipo: Pick<TipoDeServico, 'quem_marca_data'> | null | undefined): boolean {
  if (!u) return false;
  if (ehDaDiretoria(u)) return true;
  if (foiPedidoPor(u, s)) return true;
  return tipo?.quem_marca_data === 'adaptacao' && ehDaAdaptacao(u);
}
/** Marca, muda e tira a data: nos tipos da Adaptação só ela (e a diretoria), mesmo que o Comercial tenha pedido; nos outros, quem pediu (e a diretoria). */
export function podeMarcarData(u: any, s: Pick<ServicoDeTerceiro, 'solicitante_id'>, tipo: Pick<TipoDeServico, 'quem_marca_data'> | null | undefined): boolean {
  if (!u) return false;
  if (ehDaDiretoria(u)) return true;
  if (tipo?.quem_marca_data === 'adaptacao') return ehDaAdaptacao(u);
  return foiPedidoPor(u, s);
}

/** A frase de quem marca o dia deste tipo, para a tela explicar por que o botão não aparece. */
export const explicacaoDeQuemMarcaOData = (tipo: Pick<TipoDeServico, 'quem_marca_data' | 'nome'> | null | undefined): string =>
  (tipo?.quem_marca_data === 'adaptacao'
    ? `Em ${String(tipo.nome || 'este tipo').toLowerCase()} quem marca o dia com o prestador é a Adaptação (ou um gerente). O pedido espera em "A definir" com a data que foi desejada.`
    : 'Só quem pediu o serviço, os gerentes e o Admin marcam o dia.');

// ═══ OS PASSOS (o modelo é movimentosDaViagem, de ViagemFluxo.ts) ═════════════════════════════════════════════════════════════════════════════════
export type AcaoDoServico = 'agendar' | 'reagendar' | 'realizar' | 'voltar_a_definir' | 'reabrir' | 'cancelar';
export type MovimentoDoServico = {
  acao: AcaoDoServico;
  para: SituacaoDoServico;
  rotulo: string;                       // o texto do botão ou do item de menu
  sentido: 'avanca' | 'volta' | 'lateral' | 'cancela';
  pedeMotivo: boolean;                  // voltar, reabrir e cancelar pedem motivo (o banco exige 5 letras ou mais)
  abreJanela: boolean;                  // agendar e dar como realizado pedem dados (janela própria)
  perigo?: boolean;
};

/** Os passos que ESTA pessoa pode dar a partir da situação em que o serviço está. */
export function movimentosDoServico(s: ServicoDeTerceiro, tipo: TipoDeServico | null | undefined, u: any): MovimentoDoServico[] {
  const l: MovimentoDoServico[] = [];
  if (!s) return l;
  const mexe = podeMexerNoServico(u, s, tipo);
  const data = podeMarcarData(u, s, tipo);
  if (s.status === 'solicitado') {
    if (data) l.push({ acao: 'agendar', para: 'agendado', rotulo: 'Agendar (prestador, dia e período)', sentido: 'avanca', pedeMotivo: false, abreJanela: true });
    if (mexe) l.push({ acao: 'realizar', para: 'realizado', rotulo: 'Dar como realizado', sentido: 'avanca', pedeMotivo: false, abreJanela: true });
    if (mexe) l.push({ acao: 'cancelar', para: 'cancelado', rotulo: 'Cancelar o pedido', sentido: 'cancela', pedeMotivo: true, abreJanela: false, perigo: true });
  } else if (s.status === 'agendado') {
    if (mexe) l.push({ acao: 'realizar', para: 'realizado', rotulo: 'Dar como realizado', sentido: 'avanca', pedeMotivo: false, abreJanela: true });
    if (data) l.push({ acao: 'reagendar', para: 'agendado', rotulo: 'Reagendar (outro dia, período ou prestador)', sentido: 'lateral', pedeMotivo: false, abreJanela: true });
    if (data) l.push({ acao: 'voltar_a_definir', para: 'solicitado', rotulo: 'Voltar para A definir (tira o dia marcado)', sentido: 'volta', pedeMotivo: true, abreJanela: false });
    if (mexe) l.push({ acao: 'cancelar', para: 'cancelado', rotulo: 'Cancelar o serviço', sentido: 'cancela', pedeMotivo: true, abreJanela: false, perigo: true });
  } else if (s.status === 'realizado') {
    if (mexe) l.push({ acao: 'reabrir', para: 'agendado', rotulo: 'Reabrir (volta para Agendado)', sentido: 'volta', pedeMotivo: true, abreJanela: false });
  }
  return l;
}

/** Soltar o cartão numa coluna (arrastar): o passo que leva até ela, ou o porquê de não poder. */
export function movimentoParaAColuna(s: ServicoDeTerceiro, tipo: TipoDeServico | null | undefined, destino: string, u: any): { movimento?: MovimentoDoServico; porque?: string } {
  if (s.status === destino) return {};
  const todos = movimentosDoServico(s, tipo, u);
  const m = todos.find(x => x.para === destino && x.acao !== 'reagendar');
  if (m) return { movimento: m };
  const aqui = rotuloDaSituacao(s.status);
  const nome = rotuloDaSituacao(destino);
  if (s.status === 'cancelado') return { porque: 'O pedido cancelado não volta: peça o serviço de novo.' };
  if (destino === 'cancelado') return { porque: 'Só quem pediu o serviço, os gerentes e o Admin cancelam o pedido.' };
  if (destino === 'agendado' && s.status === 'solicitado' && !podeMarcarData(u, s, tipo)) return { porque: explicacaoDeQuemMarcaOData(tipo) };
  if (destino === 'realizado' && !podeMexerNoServico(u, s, tipo)) return { porque: 'Só quem pediu, a Adaptação (nos tipos dela), os gerentes e o Admin dão o serviço como realizado.' };
  if (s.status === 'realizado' && destino === 'solicitado') return { porque: 'Daqui o serviço volta primeiro para "Agendado" (reabrir); depois pode voltar para "A definir".' };
  if (!todos.length) return { porque: `Você não pode mexer num serviço em "${aqui}".` };
  return { porque: `Daqui ("${aqui}") o serviço não vai direto para "${nome}". Use: ${todos.map(x => x.rotulo).join('; ')}.` };
}

// ═══ O QUE FALTA / O QUE ESTÁ ERRADO (a janela confere antes de chamar o banco; o banco confere de novo) ═══════════════════════════════════════════
export function erroDoAgendamento(d: { prestadorId: string; data: string; periodo: string }, hoje: string): string | null {
  if (!d.prestadorId) return 'Escolha o prestador que vai fazer o serviço.';
  if (!d.data) return 'Informe o dia do serviço.';
  if (d.data < hoje) return 'O dia do agendamento não pode ser anterior a hoje. Se o serviço já foi feito, dê-o como realizado.';
  if (!PERIODOS.some(p => p.id === d.periodo)) return 'Escolha o período: manhã, tarde ou dia todo.';
  return null;
}

const pareceNegativo = (texto: unknown): boolean => /^\s*(R\$\s*)?-/i.test(String(texto ?? ''));

/** `valor` é o texto digitado; "0" vale (o serviço pode ter saído sem custo), vazio não. */
export function erroDaConclusao(d: { data: string; valor: string; temPrestador: boolean }, hoje: string): string | null {
  if (!d.temPrestador) return 'Defina o prestador antes de dar o serviço como realizado.';
  if (!d.data) return 'Informe o dia em que o serviço foi feito.';
  if (d.data > hoje) return 'O dia em que o serviço foi feito não pode ser no futuro.';
  if (d.data < somarDiasISO(hoje, -365)) return 'O dia em que o serviço foi feito está a mais de um ano: confira a data.';
  // `lerValorDigitado` recusa o negativo como "não é número"; a pessoa que digitou "-5" merece a frase certa.
  if (pareceNegativo(d.valor)) return 'O valor final não pode ser negativo.';
  const v = lerValorDigitado(d.valor);
  if (v.vazio) return 'Informe o valor final cobrado pelo prestador (pode ser zero).';
  if (v.invalido) return 'O valor final não parece um número (exemplo: 1.250,00).';
  return null;
}

export const motivoValido = (t: unknown): boolean => String(t ?? '').trim().length >= 5;

// ── o formulário do pedido ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type FormDoPedido = {
  tipo_id: string; descricao: string; onde: '' | OndeSeFaz; data_desejada: string; prestador_id: string; valor_combinado: string; observacao: string;
  pecas: { descricao: string; quantidade: string }[];
};
export const FORM_PEDIDO_VAZIO: FormDoPedido = { tipo_id: '', descricao: '', onde: '', data_desejada: '', prestador_id: '', valor_combinado: '', observacao: '', pecas: [] };

/** Tira as linhas de peça sem descrição e põe a quantidade como número (vazia vale "sem quantidade"). */
export function pecasParaGravar(pecas: FormDoPedido['pecas']): PecaDoServico[] {
  return (pecas || []).map(p => ({ descricao: String(p.descricao || '').trim().replace(/\s+/g, ' '), q: String(p.quantidade ?? '').trim() }))
    .filter(p => p.descricao)
    .map(p => ({ descricao: p.descricao, quantidade: p.q ? Number.parseInt(p.q, 10) : null }));
}

export function erroDoPedido(f: FormDoPedido, hoje: string, opcoes: { veValor: boolean; quantidadeDeServicos: number }): string | null {
  if (!f.tipo_id) return 'Escolha o tipo de serviço.';
  if (f.descricao.trim().length < 3) return 'Descreva o serviço (pelo menos 3 letras).';
  if (f.data_desejada && f.data_desejada < hoje) return 'A data desejada já passou: informe hoje ou uma data futura.';
  if (opcoes.veValor && f.valor_combinado.trim()) {
    if (pareceNegativo(f.valor_combinado)) return 'O valor combinado não pode ser negativo.';
    if (lerValorDigitado(f.valor_combinado).invalido) return 'O valor combinado não parece um número (exemplo: 1.250,00).';
  }
  for (const p of f.pecas || []) {
    const q = String(p.quantidade ?? '').trim();
    if (q && !/^\d{1,5}$/.test(q)) return `A quantidade da peça "${String(p.descricao || '').trim() || '(sem nome)'}" deve ser um número inteiro (ou ficar em branco).`;
    if (q && Number.parseInt(q, 10) < 1) return `A quantidade da peça "${String(p.descricao || '').trim() || '(sem nome)'}" deve ser 1 ou mais.`;
    if (q && !String(p.descricao || '').trim()) return 'Uma peça tem quantidade mas não tem nome: escreva o nome ou tire a linha.';
  }
  if (opcoes.quantidadeDeServicos < 1) return 'Marque pelo menos uma unidade para pedir o serviço.';
  if (opcoes.quantidadeDeServicos > 100) return 'Peça no máximo 100 unidades de uma vez (marque menos unidades e peça o resto em seguida).';
  return null;
}

/** O valor combinado digitado como número (ou null se vazio); a janela só chama depois de `erroDoPedido`. */
export const valorDigitadoOuNulo = (texto: string): number | null => {
  const v = lerValorDigitado(texto);
  return v.valor != null ? v.valor : null;
};

// ═══ VALORES ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const reaisDoServico = (v: unknown): string => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
/** Final menos combinado (positivo = cobrou a mais); null quando falta um dos dois. */
export function diferencaDeValor(s: Pick<ServicoDeTerceiro, 'valor_combinado' | 'valor_final'>): number | null {
  if (s.valor_combinado == null || s.valor_final == null) return null;
  return Math.round((Number(s.valor_final) - Number(s.valor_combinado)) * 100) / 100;
}
export function textoDaDiferenca(s: Pick<ServicoDeTerceiro, 'valor_combinado' | 'valor_final'>): string {
  const d = diferencaDeValor(s);
  if (d === null) return '';
  if (d === 0) return 'igual ao combinado';
  return `${d > 0 ? '+' : '−'}${reaisDoServico(Math.abs(d))} ${d > 0 ? 'acima' : 'abaixo'} do combinado`;
}

// ═══ SELOS CALCULADOS (o que o cartão mostra além da coluna) ═══════════════════════════════════════════════════════════════════════════════════════
export type SeloDoServico = { id: string; rotulo: string; familia: FamiliaDoSelo; title?: string };

export const estaAtrasado = (s: Pick<ServicoDeTerceiro, 'status' | 'data_agendada'>, hoje: string): boolean => s.status === 'agendado' && !!s.data_agendada && s.data_agendada < hoje;
export const diasDeAtraso = (s: Pick<ServicoDeTerceiro, 'status' | 'data_agendada'>, hoje: string): number => (estaAtrasado(s, hoje) ? diasEntreDatas(s.data_agendada as string, hoje) : 0);

/** Os selos do serviço. `choques` vem de `choquesDeData` (calculado uma vez para a lista toda). */
export function selosDoServico(s: ServicoDeTerceiro, hoje: string, tipo: Pick<TipoDeServico, 'quem_marca_data'> | null | undefined, choques?: Map<string, string[]>, verValor = false): SeloDoServico[] {
  const l: SeloDoServico[] = [];
  if (s.status === 'solicitado') {
    if (!s.prestador_id) l.push({ id: 'sem_prestador', rotulo: 'Sem prestador', familia: 'atencao', title: 'Ainda não há prestador escolhido para este serviço.' });
    l.push({ id: 'sem_data', rotulo: 'Sem data', familia: 'atencao', title: tipo?.quem_marca_data === 'adaptacao' ? 'O dia é marcado pela Adaptação.' : 'Falta marcar o dia do serviço.' });
    if (s.data_desejada && s.data_desejada < hoje) l.push({ id: 'desejada_passou', rotulo: 'Data desejada passou', familia: 'atencao', title: 'O pedido queria o serviço para ' + s.data_desejada.split('-').reverse().join('/') + ' e ainda não foi agendado.' });
  } else if (s.status === 'agendado') {
    const atraso = diasDeAtraso(s, hoje);
    if (atraso > 0) l.push({ id: 'atrasado', rotulo: `Atrasado há ${atraso} dia${atraso > 1 ? 's' : ''}`, familia: 'erro', title: 'O dia marcado passou e o serviço não foi dado como realizado.' });
    else if (s.data_agendada === hoje) l.push({ id: 'hoje', rotulo: `Hoje · ${rotuloDoPeriodo(s.periodo).toLowerCase()}`, familia: 'marca', title: 'O serviço está marcado para hoje.' });
    const c = choques?.get(s.id);
    if (c?.length) l.push({ id: 'choque', rotulo: 'Choque de data', familia: 'erro', title: `O mesmo prestador já tem, neste dia e período: ${c.slice(0, 3).join('; ')}${c.length > 3 ? ` e mais ${c.length - 3}` : ''}.` });
  } else if (s.status === 'realizado' && verValor) {
    const d = diferencaDeValor(s);
    if (d !== null && d > 0) l.push({ id: 'acima_do_combinado', rotulo: 'Acima do combinado', familia: 'atencao', title: textoDaDiferenca(s) });
  }
  return l;
}

// ── choque de data: o mesmo prestador, no mesmo dia, em períodos que se sobrepõem, em visitas diferentes ──────────────────────────────────────────
// Escolha minha, a confirmar: a MESMA venda (ou a mesma ligação) no mesmo dia e prestador é UMA visita, mesmo que em períodos diferentes (39 carros da mesma venda não "batem" entre si);
// só visitas diferentes batem, e só AVISA: nunca impede de gravar (o prestador pode atender duas coisas no mesmo período).
const sobrepoe = (a: string | null, b: string | null): boolean => !!a && !!b && (a === 'dia_todo' || b === 'dia_todo' || a === b);
export const chaveDaVisita = (s: Pick<ServicoDeTerceiro, 'id' | 'venda_base' | 'ligacao_tipo' | 'ligacao_id'>): string =>
  (s.venda_base ? `venda:${s.venda_base}` : s.ligacao_id ? `${s.ligacao_tipo}:${s.ligacao_id}` : `servico:${s.id}`);
function rotuloDaVisita(grupo: ServicoDeTerceiro[]): string {
  const b = grupo[0];
  if (grupo.length === 1) return `${b.numero}${b.ligacao_rotulo ? ' · ' + b.ligacao_rotulo : ''}`;
  return b.venda_base ? `venda ${b.venda_base} · ${grupo.length} serviços` : `${b.ligacao_rotulo || b.numero} · ${grupo.length} serviços`;
}

/** id do serviço → as visitas com que ele bate (vazio = sem choque). Só os agendados com prestador, dia e período entram na conta. */
export function choquesDeData(servicos: ServicoDeTerceiro[]): Map<string, string[]> {
  const saida = new Map<string, string[]>();
  const dias = new Map<string, ServicoDeTerceiro[]>();
  for (const s of servicos) {
    if (s.status !== 'agendado' || !s.prestador_id || !s.data_agendada || !s.periodo) continue;
    const k = `${s.prestador_id}|${s.data_agendada}`;
    const l = dias.get(k);
    if (l) l.push(s); else dias.set(k, [s]);
  }
  const guardar = (id: string, rotulo: string) => { const l = saida.get(id); if (!l) saida.set(id, [rotulo]); else if (!l.includes(rotulo)) l.push(rotulo); };
  for (const doDia of dias.values()) {
    if (doDia.length < 2) continue;
    const visitas = new Map<string, ServicoDeTerceiro[]>();
    for (const s of doDia) { const k = chaveDaVisita(s); const l = visitas.get(k); if (l) l.push(s); else visitas.set(k, [s]); }
    const lista = [...visitas.values()];
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (!lista[i].some(a => lista[j].some(b => sobrepoe(a.periodo, b.periodo)))) continue;
        const ri = rotuloDaVisita(lista[i]); const rj = rotuloDaVisita(lista[j]);
        lista[i].forEach(s => guardar(s.id, rj));
        lista[j].forEach(s => guardar(s.id, ri));
      }
    }
  }
  return saida;
}

/** O que a janela de agendar mostra em vermelho ANTES de gravar: as visitas que já estão marcadas para o mesmo prestador, dia e período (fora as dos próprios serviços que estão sendo agendados). */
export function conflitosDoAgendamento(todos: ServicoDeTerceiro[], ids: string[], prestadorId: string, data: string, periodo: string): string[] {
  if (!prestadorId || !data || !periodo) return [];
  const escolhidos = todos.filter(s => ids.includes(s.id));
  const mesmas = new Set(escolhidos.map(chaveDaVisita));
  const visitas = new Map<string, ServicoDeTerceiro[]>();
  for (const s of todos) {
    if (ids.includes(s.id) || s.status !== 'agendado' || s.prestador_id !== prestadorId || s.data_agendada !== data || !sobrepoe(s.periodo, periodo)) continue;
    const k = chaveDaVisita(s);
    if (mesmas.has(k)) continue;
    const l = visitas.get(k);
    if (l) l.push(s); else visitas.set(k, [s]);
  }
  return [...visitas.values()].map(rotuloDaVisita);
}

// ═══ OS CARTÕES: um por serviço, ou um por venda (decisão 15 do plano: um serviço por carro, a tela agrupa) ═══════════════════════════════════════════
export type CartaoDoQuadro =
  | { tipo: 'um'; chave: string; servico: ServicoDeTerceiro }
  | { tipo: 'grupo'; chave: string; servicos: ServicoDeTerceiro[]; base: ServicoDeTerceiro };

const RANK_PERIODO: Record<string, number> = { manha: 0, dia_todo: 1, tarde: 2 };
const nulosPorUltimo = (a: string | null, b: string | null, desc = false): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return desc ? (a < b ? 1 : a > b ? -1 : 0) : (a < b ? -1 : a > b ? 1 : 0);
};

/** A ordem dentro da coluna: A definir pela data desejada (a mais próxima primeiro); Agendado por dia e período; Realizado do mais recente ao mais antigo. */
export function ordenarServicos(lista: ServicoDeTerceiro[], situacao: SituacaoDoServico): ServicoDeTerceiro[] {
  const c = [...lista];
  c.sort((a, b) => {
    let r = 0;
    if (situacao === 'solicitado') r = nulosPorUltimo(a.data_desejada, b.data_desejada);
    else if (situacao === 'agendado') r = nulosPorUltimo(a.data_agendada, b.data_agendada) || (RANK_PERIODO[a.periodo || ''] ?? 9) - (RANK_PERIODO[b.periodo || ''] ?? 9);
    else if (situacao === 'realizado') r = nulosPorUltimo(a.data_realizada, b.data_realizada, true);
    else r = nulosPorUltimo(a.cancelado_em, b.cancelado_em, true);
    return r || a.numero.localeCompare(b.numero);
  });
  return c;
}

/**
 * A chave do grupo: mesma venda, mesmo tipo, mesma coluna e a MESMA situação do cartão (mesmo prestador e mesmo dia e período), para o carro que sai do padrão
 * (outra data, outro prestador) virar cartão próprio, como o plano pede. Serviço sem venda (OS, demanda, projeto, avulso) nunca agrupa.
 */
function chaveDoGrupo(s: ServicoDeTerceiro): string | null {
  if (!s.venda_base) return null;
  const parte = s.status === 'agendado' ? `${s.data_agendada}|${s.periodo}` : s.status === 'realizado' ? String(s.data_realizada || '') : s.status === 'cancelado' ? String(s.cancelado_em || '') : String(s.data_desejada || '');
  return [s.status, s.tipo_id, s.venda_base, s.prestador_id || '', parte].join('§');
}

/** Os cartões de UMA coluna, na ordem da coluna; dois ou mais da mesma venda e situação viram um cartão de grupo. */
export function cartoesDaColuna(servicos: ServicoDeTerceiro[], situacao: SituacaoDoServico): CartaoDoQuadro[] {
  const ordenados = ordenarServicos(servicos.filter(s => s.status === situacao), situacao);
  const grupos = new Map<string, ServicoDeTerceiro[]>();
  for (const s of ordenados) { const k = chaveDoGrupo(s); if (k) { const l = grupos.get(k); if (l) l.push(s); else grupos.set(k, [s]); } }
  const saida: CartaoDoQuadro[] = [];
  const jaFoi = new Set<string>();
  for (const s of ordenados) {
    const k = chaveDoGrupo(s);
    const doGrupo = k ? grupos.get(k) : null;
    if (k && doGrupo && doGrupo.length > 1) {
      if (jaFoi.has(k)) continue;
      jaFoi.add(k);
      saida.push({ tipo: 'grupo', chave: k, servicos: doGrupo, base: doGrupo[0] });
    } else saida.push({ tipo: 'um', chave: s.id, servico: s });
  }
  return saida;
}

/** Soma dos valores combinados de um conjunto de serviços e quantos ainda não têm valor. */
export function totalCombinado(servicos: ServicoDeTerceiro[]): { total: number; semValor: number } {
  let total = 0; let semValor = 0;
  for (const s of servicos) { if (s.valor_combinado == null) semValor++; else total += Number(s.valor_combinado); }
  return { total: Math.round(total * 100) / 100, semValor };
}

// ═══ CONTADORES E FILTROS (valem no Quadro e na Lista) ═══════════════════════════════════════════════════════════════════════════════════════════
// O contador "a pagar" do plano (4.4) só nasce na T5, junto do "Pedir pagamento": sem o pedido ligado ao serviço não há como saber o que já foi pago.
export type ContadorDeTerceiros = '' | 'sem_prestador' | 'sem_data' | 'atrasados' | 'choque';
export const CONTADORES_DE_TERCEIROS: { id: Exclude<ContadorDeTerceiros, ''>; rotulo: string; ajuda: string; familia: FamiliaDoSelo }[] = [
  { id: 'sem_prestador', rotulo: 'Sem prestador', familia: 'atencao', ajuda: 'Pedidos em "A definir" que ainda não têm prestador escolhido.' },
  { id: 'sem_data', rotulo: 'Sem data', familia: 'atencao', ajuda: 'Pedidos em "A definir": o dia ainda não foi marcado.' },
  { id: 'atrasados', rotulo: 'Atrasados', familia: 'erro', ajuda: 'Agendados cujo dia já passou e que não foram dados como realizados.' },
  { id: 'choque', rotulo: 'Choque de data', familia: 'erro', ajuda: 'Agendados em que o mesmo prestador tem outra visita no mesmo dia e período.' },
];

export type FiltrosDeTerceiros = {
  contador: ContadorDeTerceiros; tipo_id: string; prestador_id: string;
  quem: string;      // '' = todos, 'meus' = os que eu pedi, ou o id de quem pediu
  setor: string;     // o perfil de quem pediu na hora do pedido ("pedido do Comercial")
  de: string; ate: string;   // período do dia do serviço (realizado > agendado > desejado)
  busca: string; ver: 'ativos' | 'cancelados' | 'todos';
};
export const FILTROS_VAZIOS: FiltrosDeTerceiros = { contador: '', tipo_id: '', prestador_id: '', quem: '', setor: '', de: '', ate: '', busca: '', ver: 'ativos' };

/** Quantos filtros (fora a busca) estão mexidos, para o botão "Limpar filtros". */
export const filtrosMexidos = (f: FiltrosDeTerceiros): number =>
  [f.contador, f.tipo_id, f.prestador_id, f.quem, f.setor, f.de, f.ate].filter(Boolean).length + (f.ver !== 'ativos' ? 1 : 0) + (f.busca.trim() ? 1 : 0);

export const dataDeReferencia = (s: ServicoDeTerceiro): string | null =>
  (s.status === 'realizado' ? s.data_realizada : s.status === 'agendado' ? s.data_agendada : s.data_desejada) || null;

export function passaNoContador(s: ServicoDeTerceiro, contador: ContadorDeTerceiros, hoje: string, choques?: Map<string, string[]>): boolean {
  if (!contador) return true;
  if (contador === 'sem_prestador') return s.status === 'solicitado' && !s.prestador_id;
  if (contador === 'sem_data') return s.status === 'solicitado';
  if (contador === 'atrasados') return estaAtrasado(s, hoje);
  return s.status === 'agendado' && !!choques?.get(s.id)?.length;
}

/** O que a busca enxerga num serviço (valores ficam de fora: quem não vê valores não os acha pela busca). */
export function textoDeBuscaDoServico(s: ServicoDeTerceiro, tipo: TipoDeServico | undefined, prestador: PrestadorDeTerceiros | undefined): string {
  return [s.numero, s.descricao, tipo?.nome, prestador?.nome, prestador?.razao_social, s.ligacao_rotulo, s.venda_base, s.solicitante_nome, s.solicitante_perfil, s.observacao,
    ...(s.pecas || []).map(p => p.descricao), rotuloDaSituacao(s.status), s.status === 'cancelado' ? s.cancelado_motivo : ''].filter(Boolean).join(' ');
}

export type ContextoDosFiltros = {
  u: any; hoje: string; tipos: Map<string, TipoDeServico>; prestadores: Map<string, PrestadorDeTerceiros>; choques?: Map<string, string[]>;
  /** true = não aplica o contador escolhido (para contar cada contador dentro dos outros filtros, como as Viagens fazem) */
  semContador?: boolean;
};

export function passaNosFiltros(s: ServicoDeTerceiro, f: FiltrosDeTerceiros, ctx: ContextoDosFiltros): boolean {
  if (f.ver === 'ativos' && s.status === 'cancelado') return false;
  if (f.ver === 'cancelados' && s.status !== 'cancelado') return false;
  if (!ctx.semContador && !passaNoContador(s, f.contador, ctx.hoje, ctx.choques)) return false;
  if (f.tipo_id && s.tipo_id !== f.tipo_id) return false;
  if (f.prestador_id && s.prestador_id !== f.prestador_id) return false;
  if (f.quem === 'meus') { if (!foiPedidoPor(ctx.u, s)) return false; } else if (f.quem && String(s.solicitante_id || '') !== f.quem) return false;
  if (f.setor && (s.solicitante_perfil || '') !== f.setor) return false;
  if (f.de || f.ate) {
    const d = dataDeReferencia(s);
    if (!d) return false;
    if (f.de && d < f.de) return false;
    if (f.ate && d > f.ate) return false;
  }
  if (f.busca.trim() && !combinaBusca(textoDeBuscaDoServico(s, ctx.tipos.get(s.tipo_id), s.prestador_id ? ctx.prestadores.get(s.prestador_id) : undefined), f.busca)) return false;
  return true;
}

/** Quantos serviços cada contador mostra, dentro dos outros filtros (o filtro do próprio contador não entra na conta). */
export function contarPendencias(servicos: ServicoDeTerceiro[], f: FiltrosDeTerceiros, ctx: ContextoDosFiltros): Record<Exclude<ContadorDeTerceiros, ''>, number> {
  const r = { sem_prestador: 0, sem_data: 0, atrasados: 0, choque: 0 };
  for (const s of servicos) {
    if (!passaNosFiltros(s, { ...f, ver: 'ativos' }, { ...ctx, semContador: true })) continue;
    (Object.keys(r) as (keyof typeof r)[]).forEach(k => { if (passaNoContador(s, k, ctx.hoje, ctx.choques)) r[k]++; });
  }
  return r;
}
