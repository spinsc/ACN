// Serviços de terceiros: a LEITURA e a GRAVAÇÃO dos serviços (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026; as regras puras estão em TerceirosFluxo.ts).
// O que não se quebra aqui:
//  • o serviço NÃO tem política de gravação: tudo grava pelas funções do banco `terceiros_*` (tudo ou nada, conferem a situação de antes e quem pode, deixam o histórico do próprio serviço).
//    Nunca `insert` ou `update` direto na tabela: ele seria recusado e, pior, passaria por cima das conferências.
//  • leitura recusada devolve o erro, nunca "lista vazia": a tela mantém a lista de antes e avisa em vermelho (a falha não pode parecer "não há serviços").
//  • a leitura traz SEMPRE o que está em aberto (A definir e Agendado) e, do que já acabou (Realizado e Cancelado), só os últimos 120 dias (escolha minha, a confirmar):
//    com os meses o quadro ficaria pesado, e o "Mostrar mais antigos" lê tudo. O número escondido é contado à parte, para a tela dizer quantos são.
//  • toda gravação confere a resposta: o banco devolve as linhas gravadas e, se faltar uma, a tela diz que não foi confirmado (nunca "deu certo" sem ter dado).
//  • os anexos sobem para o armazenamento ANTES de o pedido ser gravado, e, se o pedido falha, os arquivos recém-enviados são retirados (nada fica solto).
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { logChange } from './AuditSystem';
import { nomeSeguroDeArquivo, contentTypeUpload } from './FormatosArquivo';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { explicarErroDoBanco } from './ErroDoBanco';
import { somarDiasISO, rotuloDaSituacao, rotuloDoPeriodo } from './TerceirosFluxo';
import type { ServicoDeTerceiro, EventoDoServico, AnexoDoServico, PecaDoServico, LigacaoDoServico } from './TerceirosFluxo';
import type { OndeSeFaz } from './TerceirosModelo';

export const DIAS_DA_JANELA_DE_LEITURA = 120;

/** Tudo do serviço MENOS o histórico (que é a coluna mais pesada e só a janela de detalhe usa, lendo à parte). */
export const COLUNAS_DO_SERVICO =
  'id,numero,tipo_id,descricao,status,status_desde,solicitante_id,solicitante_nome,solicitante_perfil,ligacao_tipo,ligacao_id,ligacao_rotulo,venda_base,ordem_id,prestador_id,onde,'
  + 'valor_combinado,valor_final,data_desejada,data_agendada,periodo,data_realizada,conferido_por,conferido_em,pecas,anexos,observacao,cancelado_motivo,cancelado_em,cancelado_por,'
  + 'criado_em,criado_por,atualizado_em,atualizado_por';

/** `escondidos`: quantos serviços encerrados ficaram fora da janela (null = não deu para contar; undefined = não contou desta vez, a tela mantém o número de antes). */
export type LeituraDeServicos = { lista: ServicoDeTerceiro[]; erro: string | null; escondidos: number | null | undefined; desde: string | null };

/**
 * Lê os serviços. `todos` = também o que acabou há mais de 120 dias. `hoje` é o texto AAAA-MM-DD de hoje (nunca `new Date().toISOString()`: é o dia de Londres).
 * `contarEscondidos` = false na atualização de minuto em minuto: a contagem dos antigos é uma segunda consulta, e a tela só pode gastar UMA por minuto (regra do custo do banco).
 */
export async function lerServicos(hoje: string, todos: boolean, contarEscondidos = true): Promise<LeituraDeServicos> {
  const desde = todos ? null : somarDiasISO(hoje, -DIAS_DA_JANELA_DE_LEITURA);
  try {
    const linhas = await lerPaginado(() => {
      const q = supabase.from('terceiros_servicos').select(COLUNAS_DO_SERVICO).order('id');
      return desde ? q.or(`status.in.(solicitado,agendado),atualizado_em.gte.${desde}`) : q;
    });
    let escondidos: number | null | undefined = 0;
    if (desde && !contarEscondidos) escondidos = undefined;
    else if (desde) {
      const { count, error } = await supabase.from('terceiros_servicos').select('id', { count: 'exact', head: true }).in('status', ['realizado', 'cancelado']).lt('atualizado_em', desde);
      escondidos = error ? null : (count ?? 0);
    }
    return { lista: linhas as ServicoDeTerceiro[], erro: null, escondidos, desde };
  } catch (e: any) {
    return { lista: [], erro: explicarErroDoBanco(e), escondidos: null, desde };
  }
}

/** O histórico de UM serviço (a janela de detalhe lê quando abre e de novo depois de cada gravação). */
export async function lerHistoricoDoServico(id: string): Promise<{ historico: EventoDoServico[]; erro: string | null }> {
  try {
    const { data, error } = await supabase.from('terceiros_servicos').select('historico').eq('id', id).maybeSingle();
    if (error) return { historico: [], erro: explicarErroDoBanco(error) };
    if (!data) return { historico: [], erro: 'O serviço não foi encontrado.' };
    return { historico: Array.isArray(data.historico) ? data.historico : [], erro: null };
  } catch (e: any) {
    return { historico: [], erro: explicarErroDoBanco(e) };
  }
}

// ═══ AS CHAMADAS AO BANCO ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Um objeto só (e não duas formas "deu"/"falhou"): o projeto roda sem a conferência estrita de nulos, e nela o TypeScript não separa as duas formas pelo `ok`.
// `ok` verdadeiro traz `dados`; falso traz a frase em `erro` e, se o banco deu um, o `codigo` (TS001 = já existe serviço igual em aberto).
// `reler` vem ligado quando o banco diz que o serviço mudou de situação enquanto a janela estava aberta (alguém mexeu antes): a tela de trás ainda mostra a coluna de antes,
// e quem recebe a resposta lê a lista de novo, sem esperar a pessoa clicar em "Atualizar" (teste da T2, 23/11/2026: o cartão ficava na coluna velha).
export type RespostaDoBanco<T> = { ok: boolean; dados?: T; erro: string; codigo: string; reler?: boolean };
export const deu = <T>(dados: T): RespostaDoBanco<T> => ({ ok: true, dados, erro: '', codigo: '' });
export const falhou = <T>(erro: string, codigo = ''): RespostaDoBanco<T> => {
  // a frase do banco termina em "Atualize a tela."; como a tela se atualiza sozinha, a frase passa a dizer o que de fato acontece
  const reler = /mudou de situa/i.test(erro);
  return { ok: false, erro: reler ? erro.replace(/\s*Atualize a tela\.?\s*$/i, ' A tela já foi atualizada: feche esta janela e confira onde o serviço está.') : erro, codigo, reler };
};

/**
 * A frase que a pessoa lê. As funções `terceiros_*` escrevem a mensagem já em português ("raise exception": P0001, o duplicado TS001 e a falta de permissão 42501), e ela vale como veio.
 * O resto (e o 42501 do próprio Postgres, que vem em inglês) passa pelo tradutor geral do sistema.
 */
export function fraseDoErroDeServico(erro: any): string {
  const codigo = String(erro?.code ?? '');
  const msg = String(erro?.message ?? '').trim();
  const doPostgres = /permission denied|row-level security|violates|must be owner/i.test(msg);
  if (msg && (codigo === 'P0001' || codigo === 'TS001' || (codigo === '42501' && !doPostgres))) return msg;
  return explicarErroDoBanco(erro);
}

/** Chama uma função `terceiros_*` do banco. As funções da ordem (TerceirosOrdens.ts) e o modelo do contrato (TerceirosConfig.ts) usam a mesma, para a frase do erro e o `reler` valerem igual. */
export async function chamar<T>(funcao: string, args: Record<string, any>): Promise<RespostaDoBanco<T>> {
  try {
    const { data, error } = await supabase.rpc(funcao, args);
    if (error) return falhou<T>(fraseDoErroDeServico(error), String(error.code || ''));
    return deu(data as T);
  } catch (e: any) {
    return falhou<T>(fraseDoErroDeServico(e));
  }
}

const NAO_CONFIRMOU = 'O banco não confirmou a gravação de todos os serviços. Atualize a tela para ver como ficou antes de tentar de novo.';

/** O banco devolve as linhas gravadas; se alguma das pedidas não veio, a gravação não foi confirmada. */
function conferirLinhas(dados: any, ids: string[]): RespostaDoBanco<ServicoDeTerceiro[]> {
  const linhas: any[] = Array.isArray(dados) ? dados : (dados && dados.id ? [dados] : []);
  const achados = new Set(linhas.map(l => l?.id));
  if (!ids.length || !ids.every(id => achados.has(id))) return falhou<ServicoDeTerceiro[]>(NAO_CONFIRMOU);
  return deu(linhas as ServicoDeTerceiro[]);
}

export type PedidoDeServicos = {
  tipo_id: string; descricao: string;
  /** as ligações: vazio = um serviço avulso; senão, UM serviço por ligação (cada OP /NN do lote) */
  ligacoes: { tipo: LigacaoDoServico; id: string }[];
  data_desejada: string | null; observacao: string | null; pecas: PecaDoServico[]; prestador_id: string | null; valor_combinado: number | null;
  onde: OndeSeFaz | null; permitir_duplicado: boolean; anexos: { caminho: string; nome: string; tamanho?: number | null }[];
};
export type ServicoPedido = { id: string; numero: string; ligacao_rotulo: string | null };

export async function pedirServicos(p: PedidoDeServicos): Promise<RespostaDoBanco<ServicoPedido[]>> {
  const r = await chamar<{ servicos: ServicoPedido[] }>('terceiros_solicitar', {
    p_tipo_id: p.tipo_id, p_descricao: p.descricao, p_ligacoes: p.ligacoes, p_data_desejada: p.data_desejada || null, p_observacao: p.observacao || null,
    p_pecas: p.pecas, p_prestador_id: p.prestador_id || null, p_valor_combinado: p.valor_combinado, p_onde: p.onde || null,
    p_permitir_duplicado: !!p.permitir_duplicado, p_anexos: p.anexos,
  });
  if (!r.ok) return falhou<ServicoPedido[]>(r.erro, r.codigo);
  const lista = r.dados?.servicos;
  if (!Array.isArray(lista) || lista.length !== Math.max(1, p.ligacoes.length)) {
    return falhou<ServicoPedido[]>('O banco não confirmou todos os serviços pedidos. Atualize a tela e confira o que foi criado antes de pedir de novo.');
  }
  return deu(lista);
}

/** Altera os dados de UM serviço (descrição, prestador, valor combinado, local, dia desejado, observação, peças e anexos); só vale se ele ainda está em `statusEsperado`. */
export async function atualizarServico(id: string, dados: Record<string, any>, statusEsperado: string): Promise<RespostaDoBanco<ServicoDeTerceiro>> {
  const r = await chamar<any>('terceiros_atualizar', { p_id: id, p_dados: dados, p_status_esperado: statusEsperado });
  if (!r.ok) return falhou<ServicoDeTerceiro>(r.erro, r.codigo);
  const c = conferirLinhas(r.dados, [id]);
  return c.ok ? deu(c.dados![0]) : falhou<ServicoDeTerceiro>(c.erro, c.codigo);
}

/** O mesmo ajuste em vários serviços (prestador, valor combinado, local, dia desejado, observação): tudo ou nada. */
export async function atualizarVarios(ids: string[], dados: Record<string, any>, statusEsperado: string): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_atualizar_varios', { p_ids: ids, p_dados: dados, p_status_esperado: statusEsperado });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

export async function agendarServicos(ids: string[], prestadorId: string | null, data: string, periodo: string, statusEsperado: string, motivo?: string | null): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_agendar', { p_ids: ids, p_prestador_id: prestadorId || null, p_data: data, p_periodo: periodo, p_status_esperado: statusEsperado, p_motivo: motivo?.trim() || null });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

export async function realizarServicos(ids: string[], dataRealizada: string, valorFinal: number, statusEsperado: string, observacao?: string | null): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_realizar', { p_ids: ids, p_data_realizada: dataRealizada, p_valor_final: valorFinal, p_status_esperado: statusEsperado, p_observacao: observacao?.trim() || null });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

/** Volta uma coluna: Agendado → A definir (tira o dia) ou Realizado → Agendado (reabre). O motivo tem de ter 5 letras ou mais. */
export async function voltarServicos(ids: string[], para: 'solicitado' | 'agendado', motivo: string, statusEsperado: string): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_voltar', { p_ids: ids, p_para: para, p_motivo: motivo, p_status_esperado: statusEsperado });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

export async function cancelarServicos(ids: string[], motivo: string, statusEsperado: string): Promise<RespostaDoBanco<ServicoDeTerceiro[]>> {
  const r = await chamar<any>('terceiros_cancelar', { p_ids: ids, p_motivo: motivo, p_status_esperado: statusEsperado });
  return r.ok ? conferirLinhas(r.dados, ids) : falhou<ServicoDeTerceiro[]>(r.erro, r.codigo);
}

/** "TS-00012" ou "39 serviços (TS-00012 a TS-00050)", para a frase de confirmação. */
export function descreverNumeros(lista: { numero: string }[]): string {
  const n = [...lista].map(s => s.numero).sort();
  if (n.length === 0) return 'nenhum serviço';
  if (n.length === 1) return n[0];
  return `${n.length} serviços (${n[0]} a ${n[n.length - 1]})`;
}

// ═══ AUDITORIA (o histórico geral do sistema; o histórico do próprio serviço o banco já grava) ═══════════════════════════════════════════════════
const CAMPOS_AUDITADOS = ['status', 'prestador_id', 'data_agendada', 'periodo', 'data_desejada', 'data_realizada', 'valor_combinado', 'valor_final', 'descricao', 'onde', 'observacao', 'cancelado_motivo'];
const recorte = (s: any): Record<string, any> => Object.fromEntries(CAMPOS_AUDITADOS.map(c => [c, s?.[c] ?? null]));

/**
 * Registra no histórico geral. Roda em segundo plano e UM serviço por vez, para um lote de 39 carros não disparar 39 pedidos de uma vez ao banco; e nunca atrapalha quem trabalha:
 * se falhar, o serviço continua com o histórico próprio (`historico`), gravado pelo próprio banco na mesma transação da mudança.
 */
export function auditarServicos(antes: ServicoDeTerceiro[], depois: ServicoDeTerceiro[], user: any, nomesDosPrestadores: Record<string, string> = {}): void {
  const anteriores = new Map(antes.map(s => [s.id, s]));
  void (async () => {
    for (const d of depois) {
      try {
        await logChange({
          module: 'terceiros', entityType: 'terceiros_servicos', entityId: d.id, changeType: 'UPDATE', oldRow: recorte(anteriores.get(d.id)), newRow: recorte(d), user,
          formatters: { status: (v: any) => (v ? rotuloDaSituacao(String(v)) : '—'), periodo: (v: any) => rotuloDoPeriodo(v), prestador_id: (v: any) => (v ? nomesDosPrestadores[v] || String(v) : 'sem prestador') },
          metadata: { numero: d.numero },
        });
      } catch { /* o histórico do próprio serviço já guarda */ }
    }
  })();
}

export function auditarPedido(novos: ServicoPedido[], resumo: Record<string, any>, user: any): void {
  void (async () => {
    for (const n of novos) {
      try {
        await logChange({ module: 'terceiros', entityType: 'terceiros_servicos', entityId: n.id, changeType: 'CREATE', newRow: { ...resumo, numero: n.numero, ligacao: n.ligacao_rotulo }, user });
      } catch { /* idem */ }
    }
  })();
}

// ═══ ANEXOS (o desenho do corte e dobra, a foto, o orçamento…) ═════════════════════════════════════════════════════════════════════════════════════
export const BUCKET_DOS_ANEXOS = 'acn-media';
export const PASTA_DOS_ANEXOS = 'terceiros';
export const LIMITE_DE_ANEXO = 20 * 1024 * 1024;
export const MAXIMO_DE_ANEXOS_NO_PEDIDO = 10;

/** Uma pasta nova por pedido (o serviço só ganha número DEPOIS de gravado, então a pasta não pode usar o id dele). */
export function novaPastaDeAnexos(): string {
  const c: any = (globalThis as any).crypto;
  const id = c && typeof c.randomUUID === 'function' ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${PASTA_DOS_ANEXOS}/${id}`;
}

export const enderecoDoAnexo = (caminho: string): string => supabase.storage.from(BUCKET_DOS_ANEXOS).getPublicUrl(caminho).data.publicUrl;

export const tamanhoLegivel = (bytes?: number | null): string => {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '';
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
};

/**
 * Sobe os arquivos para `pasta`. Devolve o que subiu, os caminhos (para retirar se o pedido falhar) e UMA frase por arquivo que não subiu: quem chama decide —
 * no pedido, qualquer falha cancela tudo (o serviço sem o desenho que a pessoa anexou seria pior do que não gravar).
 */
export async function enviarAnexos(arquivos: File[], pasta: string): Promise<{ anexos: AnexoDoServico[]; caminhos: string[]; erros: string[] }> {
  const anexos: AnexoDoServico[] = []; const caminhos: string[] = []; const erros: string[] = [];
  let i = 0;
  for (const f of arquivos) {
    i++;
    if (f.size === 0) { erros.push(`"${f.name}": o arquivo está vazio.`); continue; }
    if (f.size > LIMITE_DE_ANEXO) { erros.push(`"${f.name}": o arquivo passa de 20 MB.`); continue; }
    const caminho = `${pasta}/${Date.now()}-${i}-${nomeSeguroDeArquivo(f.name)}`;
    try {
      const { error } = await supabase.storage.from(BUCKET_DOS_ANEXOS).upload(caminho, f, { upsert: false, contentType: contentTypeUpload(f) || undefined });
      if (error) { erros.push(`"${f.name}": ${explicarErroDeEnvio(error, f)}`); continue; }
    } catch (e: any) {
      erros.push(`"${f.name}": ${explicarErroDeEnvio(e, f)}`);
      continue;
    }
    caminhos.push(caminho);
    anexos.push({ caminho, nome: f.name, tamanho: f.size });
  }
  return { anexos, caminhos, erros };
}

/** Retira do armazenamento os arquivos que acabaram de subir e não ficaram ligados a nenhum serviço (o pedido falhou). Só o que ESTA ação enviou; nunca falha para quem chama. */
export async function retirarArquivosSoltos(caminhos: string[]): Promise<void> {
  if (!caminhos.length) return;
  try { await supabase.storage.from(BUCKET_DOS_ANEXOS).remove(caminhos); } catch { /* sem como retirar: fica no armazenamento, sem ligação */ }
}

// ═══ AS UNIDADES DA VENDA (um serviço por carro: cada OP /NN do lote) ══════════════════════════════════════════════════════════════════════════
export type UnidadeDaVenda = { id: string; opl: string; modelo: string | null; chassi: string | null; placa: string | null; cliente_nome: string | null; status_geral: string | null };
const COLUNAS_DA_UNIDADE = 'id,opl,modelo,chassi,placa,cliente_nome,status_geral';

/** "A1673.2609/03" → "A1673.2609" (a mesma conta do banco: `regexp_replace(opl, '/[0-9]+$', '')`). */
export const vendaBaseDaOp = (opl: string): string => String(opl || '').trim().replace(/\/\d+$/, '');

/**
 * A OP escolhida e as outras OPs do mesmo lote (mesma venda, `/01`, `/02`…), sem as canceladas (a escolhida fica sempre). Uma OP sem lote devolve só ela.
 * Leitura que falha devolve o erro e só a OP escolhida: o pedido ainda pode seguir para essa OP, mas a tela avisa que não conseguiu ler o lote.
 */
export async function lerUnidadesDaOp(opId: string): Promise<{ unidades: UnidadeDaVenda[]; base: string; erro: string | null }> {
  try {
    const { data: uma, error: e1 } = await supabase.from('oples').select(COLUNAS_DA_UNIDADE).eq('id', opId).maybeSingle();
    if (e1) return { unidades: [], base: '', erro: explicarErroDoBanco(e1) };
    if (!uma) return { unidades: [], base: '', erro: 'A OP não foi encontrada (ela pode ter sido excluída).' };
    const base = vendaBaseDaOp(uma.opl);
    // só letras, números, ponto, traço e sublinhado entram no filtro (o texto vira parte da consulta); nada fora disso deveria existir num número de OP
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(base)) return { unidades: [uma as UnidadeDaVenda], base, erro: null };
    const { data, error } = await supabase.from('oples').select(COLUNAS_DA_UNIDADE).or(`opl.eq.${base},opl.like.${base}/%`).order('opl').range(0, 499);
    if (error || !data) return { unidades: [uma as UnidadeDaVenda], base, erro: explicarErroDoBanco(error) };
    const vivas = (data as UnidadeDaVenda[]).filter(u => u.id === opId || String(u.status_geral || '') !== 'Cancelado');
    if (!vivas.some(u => u.id === opId)) vivas.push(uma as UnidadeDaVenda);
    return { unidades: vivas, base, erro: null };
  } catch (e: any) {
    return { unidades: [], base: '', erro: explicarErroDoBanco(e) };
  }
}

/**
 * O modelo, a placa e o chassi dos carros (as OPs) de um contrato ou de uma ordem de serviço (T4, 23/11/2026): vêm da OP, não do serviço, porque o serviço só guarda o número da OP.
 * Leitura que falha devolve o erro e o mapa vazio: quem imprime avisa na própria folha e deixa as linhas em branco para escrever à mão (a falha nunca vira "carro sem dados").
 */
export async function lerCarrosDasOps(opIds: string[]): Promise<{ mapa: Record<string, UnidadeDaVenda>; erro: string | null }> {
  const mapa: Record<string, UnidadeDaVenda> = {};
  const ids = [...new Set(opIds.filter(Boolean))];
  if (!ids.length) return { mapa, erro: null };
  try {
    for (let i = 0; i < ids.length; i += 60) {
      const { data, error } = await supabase.from('oples').select(COLUNAS_DA_UNIDADE).in('id', ids.slice(i, i + 60));
      if (error) return { mapa: {}, erro: explicarErroDoBanco(error) };
      for (const u of (data || []) as UnidadeDaVenda[]) mapa[u.id] = u;
    }
    return { mapa, erro: null };
  } catch (e: any) {
    return { mapa: {}, erro: explicarErroDoBanco(e) };
  }
}

/** Dos ids de OP/OS/demanda/projeto dados, quais já têm um serviço EM ABERTO deste tipo (id da ligação → número do serviço). Leitura que falha devolve o erro; o banco confere de novo ao gravar. */
export async function lerServicosAbertosDasLigacoes(tipoId: string, ligacaoIds: string[]): Promise<{ mapa: Record<string, string>; erro: string | null }> {
  const mapa: Record<string, string> = {};
  if (!tipoId || !ligacaoIds.length) return { mapa, erro: null };
  try {
    for (let i = 0; i < ligacaoIds.length; i += 60) {
      const { data, error } = await supabase.from('terceiros_servicos').select('numero,ligacao_id').eq('tipo_id', tipoId).in('status', ['solicitado', 'agendado']).in('ligacao_id', ligacaoIds.slice(i, i + 60));
      if (error) return { mapa, erro: explicarErroDoBanco(error) };
      for (const l of data || []) if (l.ligacao_id) mapa[l.ligacao_id] = l.numero;
    }
    return { mapa, erro: null };
  } catch (e: any) {
    return { mapa, erro: explicarErroDoBanco(e) };
  }
}
