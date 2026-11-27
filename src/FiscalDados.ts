// @ts-nocheck
// Leitura e gravação dos cadastros fiscais (preparação do módulo fiscal, 26/11/2026; as regras puras estão em FiscalRegras.ts e as tabelas em supabase/sql/fiscal_cadastros.sql).
// Padrão do sistema: leitura recusada devolve `erro` (nunca "sem cadastro"), e toda gravação confere a linha devolvida (o banco responde "ok, 0 linhas" a um UPDATE negado).
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { explicarErroDoBanco } from './ErroDoBanco';
import { logChange } from './AuditSystem';
import { conferirNota } from './FiscalXml';
import { registroDaNota, registroDoEvento, registroDaInutilizacao, numerosDaNotaDaOp } from './FiscalArquivo';
import { oQueAsOpsCitam } from './FiscalProntidao';
import {
  erroDoFiscalCliente, fiscalClienteParaGravar, erroDoFiscalItem, fiscalItemParaGravar, erroDoEmitente, emitenteParaGravar,
  erroDaTransportadora, transportadoraParaGravar, soDigitos,
} from './FiscalRegras';

const TAMANHO_DO_BLOCO = 150;
const idDe = (usuario: any) => usuario?.id || null;   // currentUser.id é o auth_usuarios.id (plano "pessoa é o ID")

// ── Cliente ──
/** Os dados fiscais de uma lista de clientes (por id). Cliente sem linha = ninguém preencheu ainda. */
export async function lerFiscalDosClientes(ids: string[]) {
  const mapa = new Map<string, any>();
  const unicos = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += TAMANHO_DO_BLOCO) {
    const { data, error } = await supabase.from('fiscal_clientes').select('*').in('cliente_id', unicos.slice(i, i + TAMANHO_DO_BLOCO));
    if (error) return { mapa, erro: explicarErroDoBanco(error) };
    for (const l of data || []) mapa.set(l.cliente_id, l);
  }
  return { mapa, erro: '' };
}

export async function lerTodosOsFiscaisDosClientes() {
  const mapa = new Map<string, any>();
  try { for (const l of await lerPaginado(() => supabase.from('fiscal_clientes').select('*').order('cliente_id'))) mapa.set(l.cliente_id, l); return { mapa, erro: '' }; }
  catch (e: any) { return { mapa, erro: explicarErroDoBanco(e) }; }
}

/** Grava (ou refaz) os dados fiscais de UM cliente. Devolve `{ ok, erro, linha }`. */
export async function salvarFiscalDoCliente(clienteId: string, form: any, usuario: any, antes: any = null) {
  const recusa = erroDoFiscalCliente(form);
  if (recusa) return { ok: false, erro: recusa, linha: null };
  const dados = fiscalClienteParaGravar(form, idDe(usuario));
  const { data, error } = await supabase.from('fiscal_clientes').upsert({ cliente_id: clienteId, ...dados }, { onConflict: 'cliente_id' }).select('*');
  if (error) return { ok: false, erro: explicarErroDoBanco(error), linha: null };
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a gravação dos dados fiscais. Atualize a tela e confira antes de tentar de novo.', linha: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_clientes', entityId: clienteId, changeType: antes ? 'UPDATE' : 'CREATE', oldRow: antes || undefined, newRow: data[0], user: usuario });
  return { ok: true, erro: '', linha: data[0] };
}

// ── Item ──
export async function lerFiscalDosItens(ids: string[]) {
  const mapa = new Map<string, any>();
  const unicos = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += TAMANHO_DO_BLOCO) {
    const { data, error } = await supabase.from('fiscal_itens').select('*').in('item_id', unicos.slice(i, i + TAMANHO_DO_BLOCO));
    if (error) return { mapa, erro: explicarErroDoBanco(error) };
    for (const l of data || []) mapa.set(l.item_id, l);
  }
  return { mapa, erro: '' };
}

export async function lerTodosOsFiscaisDosItens() {
  const mapa = new Map<string, any>();
  try { for (const l of await lerPaginado(() => supabase.from('fiscal_itens').select('*').order('item_id'))) mapa.set(l.item_id, l); return { mapa, erro: '' }; }
  catch (e: any) { return { mapa, erro: explicarErroDoBanco(e) }; }
}

export async function salvarFiscalDoItem(itemId: string, form: any, usuario: any, antes: any = null) {
  const recusa = erroDoFiscalItem(form);
  if (recusa) return { ok: false, erro: recusa, linha: null };
  const dados = fiscalItemParaGravar(form, idDe(usuario));
  const { data, error } = await supabase.from('fiscal_itens').upsert({ item_id: itemId, ...dados }, { onConflict: 'item_id' }).select('*');
  if (error) return { ok: false, erro: explicarErroDoBanco(error), linha: null };
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a gravação dos dados fiscais do item. Atualize a tela e confira antes de tentar de novo.', linha: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_itens', entityId: itemId, changeType: antes ? 'UPDATE' : 'CREATE', oldRow: antes || undefined, newRow: data[0], user: usuario });
  return { ok: true, erro: '', linha: data[0] };
}

/**
 * Aplica a MESMA resposta a vários itens de uma vez (a origem 0 a todos os nacionais, "não é monofásico", "CEST não se aplica"). Só os campos de `campos` mudam: o resto do
 * que cada item já tinha fica como está (o `upsert` atualiza só as colunas enviadas). Devolve quantos itens o banco confirmou.
 */
export async function aplicarFiscalEmLote(itemIds: string[], campos: { origem_fiscal?: number | null; monofasico?: boolean | null; cest_nao_se_aplica?: boolean }, usuario: any) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!ids.length) return { ok: false, erro: 'Nenhum item escolhido.', gravados: 0 };
  const mudanca: any = {};
  if ('origem_fiscal' in campos) mudanca.origem_fiscal = campos.origem_fiscal;
  if ('monofasico' in campos) mudanca.monofasico = campos.monofasico;
  if ('cest_nao_se_aplica' in campos) mudanca.cest_nao_se_aplica = campos.cest_nao_se_aplica;
  if (!Object.keys(mudanca).length) return { ok: false, erro: 'Escolha o que aplicar.', gravados: 0 };
  // "CEST não se aplica" não convive com um CEST já preenchido (a regra da tela): o banco não tem essa trava, então o lote não toca nos itens que já têm CEST
  let alvo = ids;
  if (mudanca.cest_nao_se_aplica === true) {
    const { data, error } = await supabase.from('fiscal_itens').select('item_id').in('item_id', ids.slice(0, 1000)).not('cest', 'is', null);
    if (error) return { ok: false, erro: explicarErroDoBanco(error), gravados: 0 };
    const comCest = new Set((data || []).map(l => l.item_id));
    alvo = ids.filter(i => !comCest.has(i));
  }
  const agora = new Date().toISOString();
  let gravados = 0;
  for (let i = 0; i < alvo.length; i += 200) {
    const linhas = alvo.slice(i, i + 200).map(item_id => ({ item_id, ...mudanca, atualizado_em: agora, atualizado_por_id: idDe(usuario) }));
    const { data, error } = await supabase.from('fiscal_itens').upsert(linhas, { onConflict: 'item_id' }).select('item_id');
    if (error) return { ok: false, erro: `${explicarErroDoBanco(error)} (${gravados} item(ns) já foram gravados antes de parar.)`, gravados };
    gravados += data?.length || 0;
  }
  if (gravados !== alvo.length) return { ok: false, erro: `O banco confirmou ${gravados} de ${alvo.length} itens. Atualize a lista e confira.`, gravados };
  logChange({ module: 'fiscal', entityType: 'fiscal_itens_lote', entityId: `lote-${Date.now()}`, changeType: 'CREATE', user: usuario, metadata: { campos: mudanca, quantidade: gravados, pedidos: ids.length } });
  return { ok: true, erro: '', gravados, pulados: ids.length - alvo.length };
}

// ── Empresas que emitem a nota ──
export async function lerEmitentes() {
  const { data, error } = await supabase.from('fiscal_emitentes').select('*').order('codigo');
  return { lista: error ? [] : (data || []), erro: error ? explicarErroDoBanco(error) : '' };
}

export async function salvarEmitente(id: string, form: any, usuario: any, antes: any = null) {
  const recusa = erroDoEmitente(form);
  if (recusa) return { ok: false, erro: recusa, linha: null };
  const { data, error } = await supabase.from('fiscal_emitentes').update(emitenteParaGravar(form, idDe(usuario))).eq('id', id).select('*');
  if (error) return { ok: false, erro: explicarErroDoBanco(error), linha: null };
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a gravação (a empresa não foi encontrada ou você não tem a aba Fiscal).', linha: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_emitentes', entityId: id, changeType: 'UPDATE', oldRow: antes || undefined, newRow: data[0], user: usuario });
  return { ok: true, erro: '', linha: data[0] };
}

// ── Transportadoras ──
export async function lerTransportadoras() {
  const { data, error } = await supabase.from('fiscal_transportadoras').select('*').order('nome');
  return { lista: error ? [] : (data || []), erro: error ? explicarErroDoBanco(error) : '' };
}

export async function salvarTransportadora(id: string | null, form: any, usuario: any, antes: any = null) {
  const recusa = erroDaTransportadora(form);
  if (recusa) return { ok: false, erro: recusa, linha: null };
  const dados = transportadoraParaGravar(form, idDe(usuario));
  const consulta = id ? supabase.from('fiscal_transportadoras').update(dados).eq('id', id) : supabase.from('fiscal_transportadoras').insert([dados]);
  const { data, error } = await consulta.select('*');
  if (error) {
    if (error.code === '23505' && soDigitos(form.documento)) return { ok: false, erro: 'Já existe uma transportadora cadastrada com este CNPJ ou CPF.', linha: null };
    return { ok: false, erro: explicarErroDoBanco(error), linha: null };
  }
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a gravação (a transportadora não foi encontrada ou você não tem permissão).', linha: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_transportadoras', entityId: data[0].id, changeType: id ? 'UPDATE' : 'CREATE', oldRow: antes || undefined, newRow: data[0], user: usuario });
  return { ok: true, erro: '', linha: data[0] };
}

export async function mudarAtivoDaTransportadora(t: any, ativo: boolean, usuario: any) {
  const { data, error } = await supabase.from('fiscal_transportadoras').update({ ativo, atualizado_em: new Date().toISOString(), atualizado_por_id: idDe(usuario) }).eq('id', t.id).select('id');
  if (error) return explicarErroDoBanco(error);
  if (!data?.length) return 'O banco não confirmou a mudança. Atualize a lista e tente de novo.';
  logChange({ module: 'fiscal', entityType: 'fiscal_transportadoras', entityId: t.id, changeType: 'UPDATE', oldRow: { ativo: t.ativo }, newRow: { ativo }, user: usuario });
  return '';
}

// ── Pendências (o relatório "o que falta preencher") ──
/** Todos os clientes e as respostas fiscais deles. Cada lado falha sozinho: o erro de um não apaga o outro. */
export async function lerPendenciasDosClientes() {
  let clientes: any[] = []; let erroClientes = '';
  try { clientes = await lerPaginado(() => supabase.from('clientes').select('id,nome,tipo,documento,cidade,estado').order('nome').order('id')); } catch (e: any) { erroClientes = explicarErroDoBanco(e); }
  const { mapa, erro } = await lerTodosOsFiscaisDosClientes();
  return { clientes, fiscais: mapa, erro: erroClientes || erro, erroClientes: !!erroClientes, erroFiscal: !!erro };
}

export async function lerPendenciasDosItens() {
  let itens: any[] = []; let erroItens = '';
  try { itens = await lerPaginado(() => supabase.from('cadastro_itens').select('id,codigo,nome,unidade,ncm,ipi_pct,ativo').eq('ativo', true).order('nome').order('id')); } catch (e: any) { erroItens = explicarErroDoBanco(e); }
  const { mapa, erro } = await lerTodosOsFiscaisDosItens();
  return { itens, fiscais: mapa, erro: erroItens || erro, erroItens: !!erroItens, erroFiscal: !!erro };
}

// ═══ Arquivo de notas emitidas (26/11/2026; regras puras em FiscalArquivo.ts, tabelas e função em supabase/sql/fiscal_arquivo_de_notas.sql) ═══
const NOTAS_POR_CHAMADA = 20;        // ~25 KB de XML cada: meio megabyte por chamada
const EVENTOS_POR_CHAMADA = 40;

/**
 * Guarda no banco as notas, os eventos e as inutilizações de um lote lido pelo Conferidor. Cada chamada é tudo ou nada (a função do banco); o lote vai em várias chamadas e,
 * se uma falhar, as anteriores ficam guardadas (rodar de novo é seguro: o que já estava guardado não é regravado). Devolve os totais e quantas notas ficaram de fora por falta de dado.
 */
export async function guardarNoArquivo(lote: any, emitentes: any[], usuario: any, aoProgredir?: (feitos: number, total: number) => void) {
  const totais = { novas: 0, atualizadas: 0, repetidas: 0, eventos_novos: 0, eventos_repetidos: 0, inutilizacoes_novas: 0, inutilizacoes_repetidas: 0, semDado: 0 };
  const notas: any[] = [];
  for (const n of lote.notas || []) {
    const r = registroDaNota(n, conferirNota(n, emitentes), n.xml || '');
    if (!r || !r.xml) totais.semDado++; else notas.push(r);
  }
  const eventos: any[] = [];
  for (const e of lote.eventos || []) { const r = registroDoEvento(e, e.xml || ''); if (!r || !r.xml) totais.semDado++; else eventos.push(r); }
  const inuts: any[] = [];
  for (const i of lote.inutilizacoes || []) { const r = registroDaInutilizacao(i, i.xml || ''); if (!r || !r.xml) totais.semDado++; else inuts.push(r); }

  const chamadas: any[][] = [];
  for (let i = 0; i < notas.length; i += NOTAS_POR_CHAMADA) chamadas.push([notas.slice(i, i + NOTAS_POR_CHAMADA), [], []]);
  for (let i = 0; i < Math.max(eventos.length, inuts.length); i += EVENTOS_POR_CHAMADA) chamadas.push([[], eventos.slice(i, i + EVENTOS_POR_CHAMADA), inuts.slice(i, i + EVENTOS_POR_CHAMADA)]);
  let feitas = 0;
  for (const [pn, pe, pi] of chamadas) {
    const { data, error } = await supabase.rpc('fiscal_guardar', { p_notas: pn, p_eventos: pe, p_inutilizacoes: pi });
    if (error || !data) {
      return { ok: false, erro: error ? explicarErroDoBanco(error) : 'O banco não confirmou a gravação.', totais, parcial: feitas > 0 };
    }
    for (const k of Object.keys(data)) if (k in totais) totais[k] += Number(data[k]) || 0;
    feitas++;
    aoProgredir?.(feitas, chamadas.length);
  }
  if (totais.novas || totais.atualizadas || totais.eventos_novos || totais.inutilizacoes_novas) {
    logChange({ module: 'fiscal', entityType: 'fiscal_notas', entityId: 'importacao', changeType: 'CREATE', newRow: { ...totais }, user: usuario });
  }
  return { ok: true, erro: '', totais, parcial: false };
}

/** Tudo o que a tela "Notas emitidas" lê. Cada leitura que falha volta no seu campo de erro (nunca vira "sem notas"). `comValores` só se a pessoa pode vê-los. */
export async function lerArquivoDeNotas(comValores: boolean) {
  const r: any = { notas: [], eventos: [], inutilizacoes: [], valores: new Map<string, number>(), ops: [], erros: {} };
  const tenta = async (chave: string, fn: () => Promise<any>) => { try { return await fn(); } catch (e: any) { r.erros[chave] = explicarErroDoBanco(e); return null; } };
  const [notas, eventos, inuts, valores, ops] = await Promise.all([
    tenta('notas', () => lerPaginado(() => supabase.from('fiscal_notas').select('*').order('emissao_dia', { ascending: false }).order('id'))),
    tenta('eventos', () => lerPaginado(() => supabase.from('fiscal_eventos').select('chave, tp_evento, sequencia, data_dia, texto, cstat, arquivo').order('id'))),
    tenta('inutilizacoes', () => lerPaginado(() => supabase.from('fiscal_inutilizacoes').select('*').order('id'))),
    comValores ? tenta('valores', () => lerPaginado(() => supabase.from('fiscal_notas_valores').select('chave, valor_nf').order('chave'))) : Promise.resolve([]),
    tenta('ops', () => lerPaginado(() => supabase.from('oples').select('opl, numero_nf, faturamento_empresa, data_emissao_nf').neq('numero_nf', '').order('id'))),
  ]);
  r.notas = notas || []; r.eventos = eventos || []; r.inutilizacoes = inuts || []; r.ops = ops || [];
  for (const v of valores || []) r.valores.set(v.chave, Number(v.valor_nf));
  return r;
}

/** O XML guardado de uma nota (ou de um evento, pela `ref`). Só quem tem a aba Fiscal e vê valores o lê. */
export async function lerXmlGuardado(ref: string) {
  const { data, error } = await supabase.from('fiscal_arquivos').select('xml').eq('ref', ref).maybeSingle();
  if (error) return { xml: '', erro: explicarErroDoBanco(error) };
  if (!data) return { xml: '', erro: 'O XML desta nota não está no arquivo (ou você não tem permissão para lê-lo).' };
  return { xml: data.xml as string, erro: '' };
}

// ═══ Prontidão da OP para emitir e nota guardada na OP (26/11/2026; regras puras em FiscalProntidao.ts e FiscalArquivo.ts) ═══
/**
 * Tudo o que se precisa ler para conferir estas OPs: as empresas, os clientes e os dados fiscais deles, e SÓ os itens que as OPs citam (pelo id, ou pelo nome quando a linha vendida não
 * tem o vínculo) com os dados fiscais deles. Leitura recusada devolve `erro` e `ctx` nulo: a tela diz "não consegui conferir", nunca "pronta" nem "faltam dados".
 * Consulta nova de tela que reabre: quem chama lê UMA vez ao abrir (e quando o conjunto de OPs muda), não de 30 em 30 segundos.
 */
export async function lerContextoDaProntidao(ops: any[]) {
  try {
    const em = await lerEmitentes();
    if (em.erro) return { ctx: null, erro: em.erro };
    const clientes = await lerPaginado(() => supabase.from('clientes').select('id,nome,documento').order('id'));
    const fc = await lerTodosOsFiscaisDosClientes();
    if (fc.erro) return { ctx: null, erro: fc.erro };
    const { itemIds, nomes } = oQueAsOpsCitam(ops);
    const catalogo = new Map<string, any>();
    const COLUNAS = 'id,codigo,nome,ncm,ipi_pct,ativo,categoria';
    for (let i = 0; i < itemIds.length; i += TAMANHO_DO_BLOCO) {
      const { data, error } = await supabase.from('cadastro_itens').select(COLUNAS).in('id', itemIds.slice(i, i + TAMANHO_DO_BLOCO));
      if (error) return { ctx: null, erro: explicarErroDoBanco(error) };
      for (const l of data || []) catalogo.set(l.id, l);
    }
    const chavesDeNome = nomes.map(n => n.toLowerCase());   // `nome_norm` é o nome sem acento e em minúsculas
    for (let i = 0; i < chavesDeNome.length; i += TAMANHO_DO_BLOCO) {
      const { data, error } = await supabase.from('cadastro_itens').select(COLUNAS).in('nome_norm', chavesDeNome.slice(i, i + TAMANHO_DO_BLOCO)).neq('ativo', false);
      if (error) return { ctx: null, erro: explicarErroDoBanco(error) };
      for (const l of data || []) catalogo.set(l.id, l);
    }
    const fi = await lerFiscalDosItens([...catalogo.keys()]);
    if (fi.erro) return { ctx: null, erro: fi.erro };
    return { ctx: { clientes, fiscaisDosClientes: fc.mapa, catalogo: [...catalogo.values()], fiscaisDosItens: fi.mapa, emitentes: em.lista }, erro: '' };
  } catch (e: any) {
    return { ctx: null, erro: explicarErroDoBanco(e) };
  }
}

// ═══ Ligar a OP ao cliente do cadastro (27/11/2026; regras puras em FiscalLigacaoDaOp.ts; coluna `oples.cliente_id`, supabase/sql/oples_cliente_id.sql) ═══
/**
 * As OPs que ainda vão virar nota e não têm cliente ligado, e os clientes do cadastro. Leitura recusada devolve `erro` (a tela diz que a lista está incompleta, nunca "nenhuma OP sem cliente").
 * A OP excluída não vem: a política do banco a esconde de todas as telas.
 */
export async function lerOpsParaLigar() {
  try {
    const ops = await lerPaginado(() => supabase.from('oples').select('id,opl,cliente_nome,cnpj_faturamento,status_geral,numero_nf,cliente_id').is('cliente_id', null).order('id'));
    const clientes = await lerPaginado(() => supabase.from('clientes').select('id,nome,tipo,documento,cidade,estado').order('id'));
    return { ops, clientes, erro: '' };
  } catch (e: any) {
    return { ops: [] as any[], clientes: [] as any[], erro: explicarErroDoBanco(e) };
  }
}

/**
 * Liga um conjunto de OPs a UM cliente do cadastro. Só toca as que AINDA estão sem ligação (`cliente_id is null` na própria gravação: duas pessoas não se atropelam) e confere
 * quantas linhas o banco confirmou. Nome e o resto da OP não mudam. Devolve `{ ok, erro, ligadas }`; `ligadas` < pedidas quer dizer que alguma OP já tinha sido ligada por outra pessoa.
 */
export async function ligarOpsAoCliente(ops: any[], cliente: any, usuario: any) {
  const lista = (ops || []).filter(o => o?.id);
  if (!lista.length) return { ok: false, erro: 'Nenhuma OP escolhida.', ligadas: 0 };
  if (!cliente?.id) return { ok: false, erro: 'Escolha o cliente do cadastro.', ligadas: 0 };
  let ligadas = 0;
  const confirmadas: any[] = [];
  for (let i = 0; i < lista.length; i += 100) {
    const bloco = lista.slice(i, i + 100);
    const { data, error } = await supabase.from('oples').update({ cliente_id: cliente.id }).in('id', bloco.map(o => o.id)).is('cliente_id', null).select('id');
    if (error) return { ok: false, erro: `${explicarErroDoBanco(error)}${ligadas ? ` (${ligadas} OP(s) já foram ligadas antes de parar.)` : ''}`, ligadas };
    const ids = new Set((data || []).map((l: any) => l.id));
    ligadas += ids.size;
    for (const o of bloco) if (ids.has(o.id)) confirmadas.push(o);
  }
  for (const o of confirmadas) {
    logChange({ module: 'fiscal', entityType: 'oples', entityId: o.id, changeType: 'UPDATE', oldRow: { cliente_id: null }, newRow: { cliente_id: cliente.id }, user: usuario, metadata: { cliente: cliente.nome, cliente_escrito_na_op: o.cliente_nome, opl: o.opl } });
  }
  if (ligadas !== lista.length) return { ok: false, erro: `O banco ligou ${ligadas} de ${lista.length} OPs: as outras já tinham sido ligadas por alguém. Atualize a lista e confira.`, ligadas };
  return { ok: true, erro: '', ligadas };
}

/**
 * As notas guardadas que uma OP cita (número digitado + empresa), os eventos delas (cancelamento) e o dicionário CNPJ → empresa. Só quem tem a aba Fiscal lê o arquivo (para os
 * outros o banco responde "nenhuma linha", não erro): quem chama NÃO deve mostrar "sem nota guardada" a quem não pode ler (use `podeVerArquivoFiscal`).
 */
export async function lerNotasDaOp(op: any) {
  const vazio = { notas: [] as any[], eventos: [] as any[], codigoDoCnpj: new Map<string, string>(), erro: '' };
  const numeros = [...new Set(numerosDaNotaDaOp(op?.numero_nf))];
  if (!numeros.length) return vazio;
  try {
    const em = await lerEmitentes();
    if (em.erro) return { ...vazio, erro: em.erro };
    const { data: notas, error } = await supabase.from('fiscal_notas')
      .select('chave, emitente_cnpj, emitente_nome, serie, numero, emissao_dia, autorizada, cstat, destinatario_nome, bloqueios, alertas').in('numero', numeros);
    if (error) return { ...vazio, erro: explicarErroDoBanco(error) };
    const chaves = (notas || []).map((n: any) => n.chave);
    let eventos: any[] = [];
    if (chaves.length) {
      const r = await supabase.from('fiscal_eventos').select('chave, tp_evento').in('chave', chaves);
      if (r.error) return { ...vazio, erro: explicarErroDoBanco(r.error) };
      eventos = r.data || [];
    }
    return { notas: notas || [], eventos, codigoDoCnpj: new Map<string, string>(em.lista.map((e: any) => [soDigitos(e.cnpj), e.codigo])), erro: '' };
  } catch (e: any) {
    return { ...vazio, erro: explicarErroDoBanco(e) };
  }
}
