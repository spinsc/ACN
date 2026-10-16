// ─────────────────────────────────────────────────────────────────────────────
// EDIÇÃO QUE VALE PARA O LOTE INTEIRO (pedido do usuário em 16/10/2026)
//
// Lote (A1704.2610/01 a /20) continua sendo uma OP por carro. Mas há informação que vale para todos (prazo, destino, endereço, frete, itens vendidos, valor por carro,
// responsável…) e corrigir carro a carro é trabalho jogado fora — foi assim que o lote A1704 ficou com 80, 20 e 20 em cada carro e só dava para arrumar um por um.
// Na edição, a pessoa escolhe "só esta unidade" ou "o lote inteiro" (SeletorEscopo); no segundo caso, depois de gravar a OP aberta, a mesma mudança é aplicada nas
// outras unidades por aqui. Decisões do usuário: o Comercial também aplica no lote (antes só Admin/Gerente); valor digitado é POR CARRO e vale igual em todas.
//
// Regras de segurança, para o "lote inteiro" não estragar o que é de cada carro:
//   • só vai o que foi ALTERADO (campo que ninguém tocou não é regravado em nenhuma unidade);
//   • campos que são de cada unidade (chassi, placa, veículo, status, NF, seriais…) NUNCA vão para as outras — ver CAMPOS_SO_DA_UNIDADE;
//   • unidade já faturada ou cancelada não é mexida (e a tela diz quantas ficaram de fora);
//   • itens vendidos: o Comercial só mexe até a BOM da unidade ser liberada (a mesma trava da edição de uma OP só); Admin/Gerente sempre;
//   • cada unidade alterada ganha uma linha no histórico e na auditoria.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';

/** "A1704.2610/05" → "A1704.2610" */
export const baseDoLoteDe = (opl: any) => String(opl || '').trim().replace(/\/\d+$/, '');
/** "A1704.2610/05" → "05" */
export const sufixoDoLoteDe = (opl: any) => (String(opl || '').match(/\/(\d+)$/) || [])[1] || '';
/** A OP é uma unidade de lote (tem o sufixo /NN)? */
export const ehUnidadeDeLote = (opl: any) => /\/\d+$/.test(String(opl || '').trim());

/** Campos que pertencem a cada carro: uma alteração "no lote inteiro" nunca os leva às outras unidades. */
export const CAMPOS_SO_DA_UNIDADE = new Set([
  'opl', 'chassi', 'placa', 'veiculo_id', 'modelo', 'veiculo', 'quantidade',
  'numero_nf', 'numero_nf_servico', 'seriais_equipamentos', 'seriais_itens', 'data_chegada_veiculo',
  'status_geral', 'status_bom', 'status_almox', 'kit_conferencia', 'bom_itens', 'data_entrega', 'data_emissao_nf',
  'data_atualizacao',
]);

/** Unidades nestes status não são mexidas pela edição do lote inteiro. */
export const STATUS_FECHADOS_PARA_LOTE = ['Faturado', 'Faturado e Disponivel para Entrega', 'Cancelado'];

const COLUNAS_DATA = new Set(['data_entrada', 'data_prevista_entrega', 'prazo_entrega_comercial', 'prazo_entrega_producao', 'data_aceite_cliente']);
const COLUNAS_NUM = new Set(['valor_total', 'valor_mao_de_obra', 'valor_mao_de_obra_serralheria']);
/** Compara dois valores do jeito que o banco os enxerga (texto vazio = null, número = número, lista/objeto = JSON). */
const normalizar = (k: string, v: any) => {
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (COLUNAS_DATA.has(k)) return String(v).slice(0, 10);
  if (COLUNAS_NUM.has(k)) return String(Number(v));
  return String(v).trim();
};

/** Dos campos alterados, os que podem valer para o lote inteiro. */
export const camposDoLote = (mudados: Record<string, any>) => Object.keys(mudados || {}).filter(k => !CAMPOS_SO_DA_UNIDADE.has(k));

export type ResultadoLote = {
  atualizadas: string[];          // números das unidades que mudaram
  iguais: number;                 // já estavam com o valor
  puladas: { opl: string; motivo: string }[];
  falhas: string[];
  erroLeitura?: string;
};

/** Lê as OTHER unidades do lote (todas menos a aberta). Devolve o erro em vez de "lista vazia" quando a leitura falha. */
export async function lerOutrasUnidadesDoLote(op: any): Promise<{ lista: any[]; erro: string }> {
  const base = baseDoLoteDe(op?.opl);
  if (!base) return { lista: [], erro: '' };
  const { data, error } = await supabase.from('oples').select('*').like('opl', `${base}/%`).order('opl');
  if (error) return { lista: [], erro: error.message };
  return { lista: (data || []).filter((o: any) => o.id !== op.id), erro: '' };
}

/**
 * Aplica `mudados` (campo → novo valor, só o que foi alterado) nas outras unidades do lote de `op`.
 * `ehGerente`: Admin/Gerente mexem nos itens vendidos mesmo com a BOM liberada; o Comercial, não.
 * `origem`: texto do histórico, ex.: "Edição do Comercial (vale para o lote)".
 */
export async function aplicarNoLote({ op, mudados, usuario, ehGerente, origem }: { op: any; mudados: Record<string, any>; usuario: any; ehGerente: boolean; origem: string }): Promise<ResultadoLote> {
  const r: ResultadoLote = { atualizadas: [], iguais: 0, puladas: [], falhas: [] };
  const campos = camposDoLote(mudados);
  if (!campos.length) return r;
  const { lista, erro } = await lerOutrasUnidadesDoLote(op);
  if (erro) { r.erroLeitura = erro; return r; }
  const agora = new Date().toISOString();
  for (const u of lista) {
    if (STATUS_FECHADOS_PARA_LOTE.includes(u.status_geral)) { r.puladas.push({ opl: u.opl, motivo: u.status_geral }); continue; }
    let doCampos = campos;
    if (!ehGerente && u.status_bom === 'BOM Liberado' && doCampos.includes('itens_vendidos')) {
      doCampos = doCampos.filter(k => k !== 'itens_vendidos');
      if (!doCampos.length) { r.puladas.push({ opl: u.opl, motivo: 'BOM já liberada (itens vendidos)' }); continue; }
    }
    const alteracao: Record<string, any> = {};
    doCampos.forEach(k => { if (normalizar(k, mudados[k]) !== normalizar(k, u[k])) alteracao[k] = mudados[k]; });
    const ks = Object.keys(alteracao);
    if (!ks.length) { r.iguais++; continue; }
    const { error: erroU } = await supabase.from('oples').update({ ...alteracao, data_atualizacao: agora }).eq('id', u.id);
    if (erroU) { r.falhas.push(`${u.opl}: ${erroU.message}`); continue; }
    logChange({ module: 'oples', entityType: 'oples', entityId: u.id, changeType: 'UPDATE',
      oldRow: Object.fromEntries(ks.map(k => [k, u[k]])), newRow: alteracao, user: usuario });
    const resumo = ks.map(k => k === 'itens_vendidos'
      ? `itens vendidos: ${(alteracao[k] || []).map((i: any) => `${i.quantidade}× ${i.nome}`).join('; ')}`
      : `${k}: ${u[k] ?? '—'} → ${alteracao[k] ?? '—'}`).join('; ');
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: u.id, numero_opl: u.opl, setor: usuario?.perfil || 'Comercial',
      evento: `${origem} por ${usuario?.nome || '—'}, a partir da ${op.opl} — ${resumo}`,
      status_anterior: u.status_geral, status_novo: u.status_geral,
      usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: agora,
    }]);
    if (erroLog) r.falhas.push(`${u.opl}: alterada, mas sem registro no histórico (${erroLog.message})`);
    r.atualizadas.push(u.opl);
  }
  return r;
}

/** Frase para a pessoa: o que aconteceu nas outras unidades. */
export function textoDoResultadoLote(r: ResultadoLote, totalOutras: number): string {
  if (r.erroLeitura) return `A OP aberta foi salva, mas não consegui ler as outras unidades do lote (${r.erroLeitura}). Nada mudou nelas.`;
  const partes = [`Lote: ${r.atualizadas.length} de ${totalOutras} outras unidades alteradas`];
  if (r.iguais) partes.push(`${r.iguais} já estavam assim`);
  if (r.puladas.length) partes.push(`${r.puladas.length} não mexidas (${[...new Set(r.puladas.map(p => p.motivo))].join('; ')})`);
  if (r.falhas.length) partes.push(`FALHOU em ${r.falhas.length}: ${r.falhas.slice(0, 3).join(' | ')}`);
  return partes.join(' · ') + '.';
}
