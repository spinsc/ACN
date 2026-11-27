// @ts-nocheck
// Leitura e gravação dos cadastros fiscais (preparação do módulo fiscal, 26/11/2026; as regras puras estão em FiscalRegras.ts e as tabelas em supabase/sql/fiscal_cadastros.sql).
// Padrão do sistema: leitura recusada devolve `erro` (nunca "sem cadastro"), e toda gravação confere a linha devolvida (o banco responde "ok, 0 linhas" a um UPDATE negado).
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { explicarErroDoBanco } from './ErroDoBanco';
import { logChange } from './AuditSystem';
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
