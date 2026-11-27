// @ts-nocheck
// Leitura e gravação das regras fiscais versionadas (módulo fiscal, Etapa 3, 27/11/2026; as regras puras estão em FiscalMotor.ts e as tabelas em supabase/sql/fiscal_regras.sql).
// Padrão do sistema: leitura recusada devolve `erro` (nunca "sem regras"), e a gravação confere a linha devolvida (o banco responde "ok, 0 linhas" a um UPDATE negado).
// As VERSÕES só mudam pelas funções do banco (criar, descartar, aprovar); as REGRAS de um rascunho se gravam direto, e o banco recusa mexer em versão aprovada.
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { logChange } from './AuditSystem';
import { erroDaRegra, regraParaGravar } from './FiscalMotor';

/** Todas as versões (a mais nova primeiro), com o nome de quem aprovou. */
export async function lerVersoesDasRegras() {
  const { data, error } = await supabase.from('fiscal_regras_versoes').select('*').order('numero', { ascending: false });
  if (error) return { versoes: [], erro: explicarErroDoBanco(error) };
  const versoes = data || [];
  const ids = [...new Set(versoes.flatMap(v => [v.aprovada_por_id, v.ultimo_editor_id]).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const r = await supabase.from('auth_usuarios').select('id, nome').in('id', ids);
    for (const u of r.data || []) nomes.set(u.id, u.nome);   // sem o nome a tela mostra "—": não vale erro, a regra não depende disso
  }
  return { versoes: versoes.map(v => ({ ...v, aprovada_por_nome: nomes.get(v.aprovada_por_id) || '', ultimo_editor_nome: nomes.get(v.ultimo_editor_id) || '' })), erro: '' };
}

export async function lerRegrasDaVersao(versaoId: string) {
  const { data, error } = await supabase.from('fiscal_regras').select('*').eq('versao_id', versaoId).order('criada_em').order('id');
  if (error) return { regras: [], erro: explicarErroDoBanco(error) };
  return { regras: data || [], erro: '' };
}

/** Grava (ou refaz) UMA regra de um rascunho. Devolve `{ ok, erro, linha }`. */
export async function salvarRegra(form: any, versaoId: string, usuario: any, antes: any = null) {
  const recusa = erroDaRegra(form);
  if (recusa) return { ok: false, erro: recusa, linha: null };
  const dados = regraParaGravar(form, versaoId);
  const q = antes
    ? supabase.from('fiscal_regras').update(dados).eq('id', antes.id).select('*')
    : supabase.from('fiscal_regras').insert(dados).select('*');
  const { data, error } = await q;
  if (error) return { ok: false, erro: mensagemDaRegra(error), linha: null };
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a gravação da regra. Atualize a tela e confira antes de tentar de novo.', linha: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_regras', entityId: data[0].id, changeType: antes ? 'UPDATE' : 'CREATE', oldRow: antes || undefined, newRow: data[0], user: usuario });
  return { ok: true, erro: '', linha: data[0] };
}

export async function apagarRegra(regra: any, usuario: any) {
  const { data, error } = await supabase.from('fiscal_regras').delete().eq('id', regra.id).select('id');
  if (error) return { ok: false, erro: mensagemDaRegra(error) };
  if (!data?.length) return { ok: false, erro: 'O banco não confirmou a exclusão da regra (ela pode já ter sido tirada). Atualize a tela.' };
  logChange({ module: 'fiscal', entityType: 'fiscal_regras', entityId: regra.id, changeType: 'DELETE', oldRow: regra, user: usuario });
  return { ok: true, erro: '' };
}

/** Abre um rascunho: cópia da vigente (ou de `baseId`, ou vazio se não há nenhuma). */
export async function criarVersaoDeRegras(baseId: string | null, titulo: string, usuario: any) {
  const { data, error } = await supabase.rpc('fiscal_regras_nova_versao', { p_base: baseId, p_titulo: titulo || null });
  if (error) return { ok: false, erro: mensagemDaRegra(error), id: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_regras_versoes', entityId: data, changeType: 'CREATE', newRow: { id: data, baseada_em: baseId, titulo }, user: usuario });
  return { ok: true, erro: '', id: data };
}

export async function descartarVersaoDeRegras(versao: any, usuario: any) {
  const { error } = await supabase.rpc('fiscal_regras_descartar', { p_versao: versao.id });
  if (error) return { ok: false, erro: mensagemDaRegra(error) };
  logChange({ module: 'fiscal', entityType: 'fiscal_regras_versoes', entityId: versao.id, changeType: 'DELETE', oldRow: versao, user: usuario });
  return { ok: true, erro: '' };
}

/** Aprova o rascunho (só Admin e gerentes; o banco confere tudo de novo). Devolve `{ ok, erro, resultado }`. */
export async function aprovarVersaoDeRegras(versao: any, nota: string, usuario: any) {
  const { data, error } = await supabase.rpc('fiscal_regras_aprovar', { p_versao: versao.id, p_nota: nota });
  if (error) return { ok: false, erro: mensagemDaRegra(error), resultado: null };
  logChange({ module: 'fiscal', entityType: 'fiscal_regras_versoes', entityId: versao.id, changeType: 'UPDATE', oldRow: versao, newRow: { ...versao, situacao: 'aprovada', nota_aprovacao: nota }, user: usuario });
  return { ok: true, erro: '', resultado: data };
}

/** As mensagens do banco desta área já vêm em português (são as `raise exception` das funções); o resto passa pelo tradutor geral. */
function mensagemDaRegra(error: any): string {
  const m = String(error?.message || '');
  if (/fiscal_regras_condicoes_uk|duplicate key/i.test(m + String(error?.details || ''))) return 'Já existe uma regra com exatamente estas condições nesta versão. Edite a que existe.';
  if (/congelada|rascunho|aprovam|aprova a pr|contradizem|confirmadas|Escreva a nota|nenhuma regra|Só quem tem a aba/i.test(m)) return m;
  return explicarErroDoBanco(error);
}
