// Leitura e gravação do CPF/CNPJ do cliente da OP (regras puras em ClienteDocumentoOp.ts; pedido do usuário em 27/11/2026).
import { supabase } from './supabaseClient';
import { documentoParaGravar, erroDoDocumentoDoCliente, textoDoPedidoDeDocumento } from './ClienteDocumentoOp';
import { quemCorrigeOEndereco } from './EnderecoDoComercial';

/** Lê no cadastro os clientes que as OPs citam (pelo id gravado e, na falta dele, pelo nome escrito). Leitura recusada devolve `erro`: nunca "sem clientes". */
export async function lerClientesDasOps(ops: any[]): Promise<{ clientes: any[]; erro?: string }> {
  const ids = [...new Set((ops || []).map(o => o?.cliente_id).filter(Boolean))];
  const nomes = [...new Set((ops || []).filter(o => !o?.cliente_id && !documentoParaGravar(o?.cliente_documento)).map(o => String(o?.cliente_nome || '').trim()).filter(Boolean))];
  const saida: any[] = [];
  try {
    if (ids.length) {
      const { data, error } = await supabase.from('clientes').select('id,nome,documento').in('id', ids);
      if (error) return { clientes: [], erro: error.message };
      saida.push(...(data || []));
    }
    if (nomes.length) {
      const { data, error } = await supabase.from('clientes').select('id,nome,documento').in('nome', nomes);
      if (error) return { clientes: [], erro: error.message };
      for (const c of data || []) if (!saida.some(x => x.id === c.id)) saida.push(c);
    }
  } catch (e: any) { return { clientes: [], erro: String(e?.message || e) }; }
  return { clientes: saida };
}

export type ResultadoDaGravacao = { ok: boolean; erro?: string; semHistorico?: string };

/**
 * Grava o documento do cliente na OP (só dígitos). Confere a linha devolvida ("ok, 0 linhas" é falha). Se a OP está ligada a um cliente do cadastro
 * que ainda NÃO tem documento, completa o cadastro também (nunca troca um documento que já existe). O histórico da OP guarda quem informou.
 */
export async function gravarDocumentoDaOp({ op, valor, usuario }: { op: any; valor: any; usuario: any }): Promise<ResultadoDaGravacao> {
  const erro = erroDoDocumentoDoCliente(valor, true);
  if (erro) return { ok: false, erro };
  const doc = documentoParaGravar(valor);
  const { data, error } = await supabase.from('oples').update({ cliente_documento: doc }).eq('id', op.id).select('id');
  if (error) return { ok: false, erro: `Não foi possível gravar o CPF/CNPJ na OP: ${error.message}` };
  if (!data?.length) return { ok: false, erro: 'Não foi possível gravar o CPF/CNPJ: a OP não foi encontrada ou você não tem permissão para alterá-la.' };
  const r: ResultadoDaGravacao = { ok: true };
  if (op.cliente_id) {
    try { await supabase.from('clientes').update({ documento: doc }).eq('id', op.cliente_id).or('documento.is.null,documento.eq.'); } catch { /* o cadastro é só um complemento */ }
  }
  const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: op.id, numero_opl: op.opl, setor: usuario?.perfil || 'Logística',
    evento: `CPF/CNPJ do cliente informado: ${doc}`, status_anterior: op.status_geral, status_novo: op.status_geral,
    usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: new Date().toISOString(),
  }]);
  if (erroLog) r.semHistorico = erroLog.message;
  return r;
}

/** Põe na caixa de Menções do vendedor da OP o pedido do documento (e uma linha no andamento da OP). Nunca avisa quem pede nem a conta de teste. */
export async function pedirDocumentoAoVendedor({ op, usuario, setor }: { op: any; usuario: any; setor?: string }): Promise<{ ok: boolean; erro?: string; avisados?: string[]; semHistorico?: string }> {
  if (!op?.opl) return { ok: false, erro: 'Não achei a OP para avisar o vendedor.' };
  const quem = usuario?.nome || 'O setor';
  const quando = new Date().toISOString();
  let alvos = [];
  try {
    const { data: usuarios, error } = await supabase.from('auth_usuarios').select('id,nome,email,ativo').eq('ativo', true);
    if (error) return { ok: false, erro: `Não foi possível ler quem é o vendedor da OP (${error.message}). Tente de novo.` };
    alvos = quemCorrigeOEndereco({ op, usuarios: usuarios || [], autorId: usuario?.id });
  } catch (e: any) { return { ok: false, erro: `Não foi possível ler quem é o vendedor da OP (${String(e?.message || e)}). Tente de novo.` }; }
  if (!alvos.length) return { ok: false, erro: 'Não achei o vendedor desta OP entre os usuários ativos (ou o vendedor é você). Peça ao Comercial pelo chat ou pelo andamento da OP.' };
  const texto = textoDoPedidoDeDocumento({ op, quem });
  const linhas = alvos.map(a => ({
    mencionado_id: a.id, mencionado_nome: a.nome, mencionante_id: String(usuario?.id || ''), mencionante_nome: quem,
    contexto: 'op', contexto_id: String(op.opl), contexto_descricao: `OP ${op.opl}${op.cliente_nome ? ' — ' + op.cliente_nome : ''}`,
    campo: 'acompanhamento', texto_trecho: texto, aba_destino: 'crm', lida: false, criado_em: quando,
  }));
  const { error: erroMenc } = await supabase.from('mencoes').insert(linhas);
  if (erroMenc) return { ok: false, erro: `Não foi possível avisar o vendedor: ${erroMenc.message}` };
  const r: any = { ok: true, avisados: alvos.map(a => a.nome) };
  try {
    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id: op.opl, referencia_tipo: 'op', referencia_desc: `OP ${op.opl}`, setor: setor || usuario?.perfil || 'Logística', texto,
      usuario_id: String(usuario?.id || ''), usuario_nome: quem, criado_em: quando,
    });
    if (error) r.semHistorico = error.message;
  } catch (e: any) { r.semHistorico = String(e?.message || e); }
  return r;
}
