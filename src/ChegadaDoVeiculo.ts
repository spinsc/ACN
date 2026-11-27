// ─────────────────────────────────────────────────────────────────────────────
// CHEGADA DO VEÍCULO À MATRIZ E PRAZO EM DIAS (pedido do usuário em 24/11/2026)
//
// 1) O Comercial não digita mais a data de entrega de uma OP de adaptação: diz QUANTOS DIAS a fábrica leva da chegada do carro até a conclusão
//    (número inteiro livre: 1, 2, 10, 30, 60…). A data de entrega (`data_prevista_entrega`) é a chegada do veículo + esses dias. Quem faz a conta é o
//    banco (gatilho `oples_calcular_entrega_pela_chegada`, supabase/sql/chegada_do_veiculo.sql), para valer em qualquer tela que grave a OP.
// 2) Quando o carro chega ao pátio da matriz, alguém aciona o botão "Veículo chegou à matriz" na janela da OP (normalmente o SAC). O sistema grava o
//    dia e a hora (`veiculo_chegou_em`), recalcula a entrega com a chegada de verdade e avisa, na caixa de Menções, o PCP, a Adaptação e o vendedor.
//
// Aqui ficam só as regras (puras, testáveis sem banco) e a gravação. A peça de tela é ChegadaDoVeiculoBotao.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { soEnvio, TIPO_VENDA_ENVIO } from './FluxoEntrega';
import { ehAdminOuGerente } from './utils/permissoes';

/** O teto é o mesmo do banco (constraint oples_prazo_dias_apos_chegada_ck): 10 anos de prazo já é erro de digitação. */
export const MAX_DIAS_APOS_CHEGADA = 3650;

/** Deixa só os dígitos (o campo dos dias não aceita letra, sinal, vírgula nem ponto). Até 4 dígitos, que cobrem o teto. */
export const somenteDigitos = (texto: any): string => String(texto ?? '').replace(/\D/g, '').slice(0, 4);

/** O que falta nos dias (texto para a pessoa) ou null se está certo. Vazio não vale: o campo é obrigatório na OP de adaptação. */
export function erroDosDias(texto: any): string | null {
  const t = String(texto ?? '').trim();
  if (!t) return 'Informe o prazo em dias, contado da chegada do veículo.';
  if (!/^\d+$/.test(t)) return `Prazo em dias inválido: "${t}". Use só um número inteiro, por exemplo 30.`;
  if (Number(t) > MAX_DIAS_APOS_CHEGADA) return `Prazo em dias grande demais (${t}). O máximo é ${MAX_DIAS_APOS_CHEGADA}.`;
  return null;
}

/** Dias para gravar: inteiro ou null (campo vazio ou ilegível nunca vira zero). */
export function diasParaGravar(texto: any): number | null {
  const t = String(texto ?? '').trim();
  return /^\d+$/.test(t) && Number(t) <= MAX_DIAS_APOS_CHEGADA ? Number(t) : null;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** Soma dias a um dia AAAA-MM-DD sem passar por fuso (a conta é em UTC ao meio-dia). Devolve AAAA-MM-DD ou null. */
export function somarDias(diaISO: any, dias: any): string | null {
  const m = String(diaISO ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const n = diasParaGravar(dias);
  if (!m || n === null) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
}

/** O dia (AAAA-MM-DD) de um instante, no horário de Brasília (a fábrica é em Palhoça/SC; o servidor guarda em UTC). */
export function diaEmBrasilia(instante: any): string | null {
  const t = new Date(instante);
  if (isNaN(t.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
}

/** AAAA-MM-DD → dd/mm/aaaa, lido direto do texto (nunca `new Date`, que desloca o dia). */
export const dataBr = (diaISO: any): string => {
  const m = String(diaISO ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/**
 * De que dia a entrega conta, e por quê: a chegada de verdade, se o botão já foi acionado; senão a previsão de chegada, se alguém a informou;
 * senão ainda não dá para calcular. É a mesma regra do gatilho do banco.
 */
export function baseDaEntrega(op: any): { dia: string | null; origem: 'real' | 'previsao' | 'nenhuma' } {
  if (op?.veiculo_chegou_em) return { dia: diaEmBrasilia(op.veiculo_chegou_em), origem: 'real' };
  const prev = String(op?.data_chegada_veiculo ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prev)) return { dia: prev, origem: 'previsao' };
  return { dia: null, origem: 'nenhuma' };
}

/** A frase que explica a data de entrega da OP, para a janela ("chegada em 10/12/2026 + 30 dias"). Vazia se a OP não usa dias. */
export function explicacaoDaEntrega(op: any): string {
  const dias = diasParaGravar(op?.prazo_dias_apos_chegada);
  if (dias === null) return '';
  const { dia, origem } = baseDaEntrega(op);
  if (origem === 'real') return `chegada em ${dataBr(dia)} + ${dias} dia(s)`;
  if (origem === 'previsao') return `previsão de chegada em ${dataBr(dia)} + ${dias} dia(s); recalcula quando o veículo chegar`;
  return `${dias} dia(s) depois da chegada do veículo (a data sai quando o veículo chegar)`;
}

// ── quem pode acionar e quando ───────────────────────────────────────────────

/** As abas de quem recebe e acompanha o carro: SAC (quem normalmente recebe no pátio), PCP, Adaptação e o Comercial, mais Admin e gerentes. */
const ABAS_QUE_ACIONAM = ['sac', 'pcp', 'producao', 'crm', 'comercial'];

export function podeAcionarChegada(usuario: any): boolean {
  if (!usuario) return false;
  if (ehAdminOuGerente(usuario)) return true;
  const abas = usuario?.abas_permitidas;
  return Array.isArray(abas) && abas.some((a: string) => ABAS_QUE_ACIONAM.includes(a));
}

const STATUS_FORA = ['Cancelado', 'Faturado', 'Entregue', 'Finalizado', 'Concluido', 'Concluído'];

/** Por que o botão não vale para esta OP (texto para a pessoa), ou null se vale. A OP que já foi marcada mostra a chegada, não o botão. */
export function motivoQueNaoAciona(op: any): string | null {
  if (!op) return 'OP não encontrada.';
  if (op.tipo_projeto === TIPO_VENDA_ENVIO || soEnvio(op.fluxo_entrega)) return 'Esta OP é de envio de material: não há veículo para chegar.';
  if (STATUS_FORA.includes(String(op.status_geral || ''))) return `A OP está ${String(op.status_geral).toLowerCase()}.`;
  if (op.excluida_em) return 'A OP foi excluída.';
  if (op.veiculo_chegou_em) return 'A chegada do veículo já foi registrada.';
  return null;
}

// ── quem é avisado ───────────────────────────────────────────────────────────

const semAcentoMaiusculo = (v: any) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const emailMin = (v: any) => String(v ?? '').trim().toLowerCase();
const ehConta = (u: any, nome: any) => !!semAcentoMaiusculo(nome) && semAcentoMaiusculo(u?.nome) === semAcentoMaiusculo(nome);
/** A conta de teste do sistema (ZZTESTE) tem todas as abas e nunca deve receber aviso de verdade. */
const ehContaDeTeste = (u: any) => /^ZZTESTE/i.test(String(u?.nome || ''));

export type Destinatario = { id: string; nome: string; papeis: string[]; aba: string };

/**
 * Quem recebe a menção de que o veículo chegou. Puro, para testar sem banco.
 *  - PCP: quem responde pelo PCP (Admin › Notificações › Responsáveis) e quem tem a aba PCP sem ser Admin;
 *  - Adaptação: quem responde pela Produção e quem tem a aba Adaptação (`producao`) sem ser Admin;
 *  - Vendedor: o responsável comercial e o vendedor da OP; se nenhum for usuário do sistema, quem abriu a OP.
 * Uma pessoa uma vez só (os papéis se juntam) e nunca quem acionou o botão. `responsaveis` = [{ perfil, usuario_id }].
 */
export function quemMencionar({ op, usuarios, responsaveis = [], autorId = null }: { op: any; usuarios: any[]; responsaveis?: any[]; autorId?: any }): Destinatario[] {
  const ativos = (usuarios || []).filter(u => u && u.ativo !== false && !ehContaDeTeste(u));
  const abasDe = (u: any) => (Array.isArray(u?.abas_permitidas) ? u.abas_permitidas : []);
  const ehResp = (u: any, perfil: string) => (responsaveis || []).some(r => String(r.perfil) === perfil && String(r.usuario_id) === String(u.id));

  const pcp = ativos.filter(u => ehResp(u, 'PCP') || (u.perfil !== 'Admin' && abasDe(u).includes('pcp')));
  const adaptacao = ativos.filter(u => ehResp(u, 'Produção') || (u.perfil !== 'Admin' && abasDe(u).includes('producao')));
  let vendedores = ativos.filter(u => ehConta(u, op?.responsavel_comercial) || ehConta(u, op?.vendedor));
  if (!vendedores.length && op?.criado_por) vendedores = ativos.filter(u => emailMin(u.email) === emailMin(op.criado_por) || ehConta(u, op?.criado_por_nome));

  const porId = new Map<string, Destinatario>();
  const entrar = (lista: any[], papel: string, aba: string) => {
    for (const u of lista) {
      const id = String(u.id);
      if (autorId && id === String(autorId)) continue;
      const atual = porId.get(id);
      if (atual) { if (!atual.papeis.includes(papel)) atual.papeis.push(papel); }
      else porId.set(id, { id, nome: u.nome, papeis: [papel], aba });
    }
  };
  entrar(pcp, 'PCP', 'pcp');
  entrar(adaptacao, 'Adaptação', 'producao');
  entrar(vendedores, 'vendedor', 'crm');
  return [...porId.values()];
}

// ── gravação ─────────────────────────────────────────────────────────────────

export type ResultadoChegada = { ok: boolean; erro?: string; entrega?: string | null; avisados?: number; semHistorico?: string; semAviso?: string };

/**
 * Registra que o veículo chegou. Só grava se a OP ainda não tinha a chegada marcada (duas pessoas não marcam a mesma OP), recalcula a entrega
 * (o banco faz a conta), escreve no histórico e no andamento da OP e menciona PCP, Adaptação e vendedor. Falha no histórico ou no aviso NÃO
 * desfaz a chegada: ela é dita no resultado, para a tela mostrar em vermelho.
 */
export async function registrarChegadaDoVeiculo({ op, usuario, agora = new Date() }: { op: any; usuario: any; agora?: Date }): Promise<ResultadoChegada> {
  const motivo = motivoQueNaoAciona(op);
  if (motivo) return { ok: false, erro: motivo };
  if (!podeAcionarChegada(usuario)) return { ok: false, erro: 'Seu perfil não registra a chegada do veículo.' };

  const quando = agora.toISOString();
  const { data: gravada, error } = await supabase.from('oples')
    .update({ veiculo_chegou_em: quando, veiculo_chegou_por: usuario?.nome || usuario?.email || null })
    .eq('id', op.id).is('veiculo_chegou_em', null)
    .select('id, opl, cliente_nome, modelo, prazo_dias_apos_chegada, data_prevista_entrega, veiculo_chegou_em, responsavel_comercial, vendedor, criado_por, criado_por_nome');
  if (error) return { ok: false, erro: `Não foi possível registrar a chegada: ${error.message}` };
  if (!gravada?.length) return { ok: false, erro: 'A chegada deste veículo já foi registrada por outra pessoa. Atualize a janela.' };
  const nova = gravada[0];

  const dia = diaEmBrasilia(quando);
  const dias = diasParaGravar(nova.prazo_dias_apos_chegada);
  const entrega = dias !== null ? String(nova.data_prevista_entrega || '').slice(0, 10) || null : null;
  const quem = usuario?.nome || 'Sistema';
  const carro = [nova.modelo, nova.cliente_nome].filter(Boolean).join(' · ');
  const texto = `Veículo chegou à matriz — OP ${nova.opl}${carro ? ` (${carro})` : ''}. Chegada registrada em ${dataBr(dia)} por ${quem}.`
    + (entrega ? ` Entrega prevista: ${dataBr(entrega)} (chegada + ${dias} dia(s)).` : '');

  const r: ResultadoChegada = { ok: true, entrega, avisados: 0 };

  const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: nova.id, numero_opl: nova.opl, setor: usuario?.perfil || 'SAC',
    evento: texto.slice(0, 200), status_anterior: op.status_geral, status_novo: op.status_geral,
    usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: quando,
  }]);
  if (erroLog) r.semHistorico = erroLog.message;
  try {
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: nova.opl, referencia_tipo: 'op', referencia_desc: `OP ${nova.opl}`, setor: usuario?.perfil || 'SAC', texto,
      usuario_id: String(usuario?.id || ''), usuario_nome: quem, criado_em: quando,
    });
  } catch (e: any) { r.semHistorico = r.semHistorico || String(e?.message || e); }

  try {
    const [{ data: usuarios, error: erroUsu }, { data: responsaveis }] = await Promise.all([
      supabase.from('auth_usuarios').select('id,nome,email,perfil,abas_permitidas,ativo').eq('ativo', true),
      supabase.from('notificacoes_responsaveis').select('perfil, usuario_id').in('perfil', ['PCP', 'Produção']),
    ]);
    if (erroUsu) throw new Error(erroUsu.message);
    const alvos = quemMencionar({ op: nova, usuarios: usuarios || [], responsaveis: responsaveis || [], autorId: usuario?.id });
    if (!alvos.length) { r.semAviso = 'ninguém para avisar (PCP, Adaptação e vendedor não foram encontrados no cadastro)'; return r; }
    const linhas = alvos.map(a => ({
      mencionado_id: a.id, mencionado_nome: a.nome,
      mencionante_id: String(usuario?.id || ''), mencionante_nome: quem,
      contexto: 'op', contexto_id: String(nova.opl), contexto_descricao: `OP ${nova.opl}${nova.cliente_nome ? ' — ' + nova.cliente_nome : ''}`,
      campo: 'acompanhamento', texto_trecho: texto, aba_destino: a.aba, lida: false, criado_em: quando,
    }));
    const { error: erroMenc } = await supabase.from('mencoes').insert(linhas);
    if (erroMenc) throw new Error(erroMenc.message);
    r.avisados = linhas.length;
  } catch (e: any) {
    r.semAviso = String(e?.message || e);
  }
  return r;
}
