// ─────────────────────────────────────────────────────────────────────────────
// PENDÊNCIA SANADA — o aviso grande que o Almoxarifado vê ao abrir a tela (pedido do usuário em 27/10/2026)
//
// Quando o item que segurava uma OP chega (compra recebida, chicote ou peça de serralheria concluídos), o Almoxarifado precisa saber sem ter que
// procurar: ao abrir a tela, uma janela no meio diz "a pendência da OP X foi sanada porque o item X chegou". Cada pessoa do Almoxarifado vê o aviso
// até clicar "Entendi" (decidido com o usuário): o que já foi visto fica gravado por pessoa, em `almox_avisos_pendencia_sanada_vistos`, e vale em
// qualquer computador. Aqui ficam só as regras e a gravação; a janela é `AvisoPendenciaSanada.tsx`.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

/** Só avisa o que foi sanado de pouco tempo para cá: o que chegou há semanas não é notícia (e evita um aviso enorme na primeira vez). */
export const DIAS_DO_AVISO = 7;

const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O texto da compra vem com o pedido e a lista de itens em várias linhas; no aviso vai numa linha só, sem passar de um tamanho legível. */
export const resumoDoItem = (titulo: any, max = 140): string => {
  const t = String(titulo || '').replace(/\s*\n+\s*/g, ' — ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

export type PendenciaSanada = {
  pendenciaId: string; opId: string; opl: string; cliente: string;
  setor: string; titulo: string; numero: string | null; quando: string; motivo: string;
};

/** O que o aviso diz, em linguagem de processo. */
const motivoDe = (p: any): string => {
  const item = resumoDoItem(p.titulo);
  if (norm(p.setor) === 'compras') return `a compra${p.numero ? ' ' + p.numero : ''} foi recebida: ${item}`;
  return `${p.setor || 'o setor'} concluiu: ${item}`;
};

/**
 * Quais pendências foram sanadas e o Almoxarifado ainda não viu.
 *  - `mapa`: o índice de `indicePendencias()` (opId → pendências, cada uma com `aberto`, `setor`, `titulo`, `concluidoEm`);
 *  - `ops`: as OPs que estão com o Almoxarifado (id, opl, cliente_nome, pendencias_kit);
 *  - `vistos`: os ids de pendência que esta pessoa já confirmou com "Entendi".
 * Sanada = o setor concluiu (compra "Recebido", demanda concluída) há menos de `DIAS_DO_AVISO` dias e o PCP ainda não liberou a pendência.
 * Pedido de desenvolvimento do PCP fica de fora: é da Engenharia, não tem material para o Almoxarifado receber.
 */
export function pendenciasSanadas(mapa: Map<string, any[]>, ops: any[], vistos: Set<string>, agora: Date = new Date()): PendenciaSanada[] {
  const limite = agora.getTime() - DIAS_DO_AVISO * 86400000;
  const saida: PendenciaSanada[] = [];
  const jaVistaNaLista = new Set<string>();
  for (const op of ops || []) {
    const lista = mapa.get(String(op.id)) || [];
    for (const p of lista) {
      if (p.aberto || p.tipo === 'engenharia_desenvolvimento') continue;
      const id = String(p.id);
      if (vistos.has(id) || jaVistaNaLista.has(`${op.id}|${id}`)) continue;
      if (((op.pendencias_kit || {})[p.id] || {}).liberado) continue;
      const t = p.concluidoEm ? new Date(p.concluidoEm).getTime() : NaN;
      if (!Number.isFinite(t) || t < limite || t > agora.getTime() + 86400000) continue;
      jaVistaNaLista.add(`${op.id}|${id}`);
      saida.push({ pendenciaId: id, opId: String(op.id), opl: op.opl, cliente: op.cliente_nome || '', setor: p.setor || '', titulo: p.titulo || '',
        numero: p.numero || null, quando: p.concluidoEm, motivo: motivoDe(p) });
    }
  }
  // o mais recente primeiro
  return saida.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}

const diaMes = (iso: any) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : ''; };

/**
 * O selo da fila do Almoxarifado para a OP com pendência (D0797, 27/10/2026): a OP de envio não trava, só avisa na hora de embalar, e por isso a
 * fila não mostrava que faltava chegar algo. `falta` é o resultado de `travaKit100`: o que ainda não chegou ou chegou e espera o "Recebi".
 */
export function resumoDaFalta(falta: any[]): { texto: string; title: string } {
  const lista = falta || [];
  const aCaminho = lista.filter(p => p.aberto);
  const linha = (p: any) => `• ${p.setor}: ${resumoDoItem(p.titulo, 90)}${p.aberto ? (p.previsao ? ` — previsão ${diaMes(p.previsao)}` : ' — ainda não chegou') : ' — chegou, aguarda o "Recebi"'}`;
  const primeiro = aCaminho[0] || lista[0];
  const previsao = primeiro && primeiro.aberto && primeiro.previsao ? ` (prev. ${diaMes(primeiro.previsao)})` : '';
  const mais = lista.length > 1 ? ` +${lista.length - 1}` : '';
  const texto = aCaminho.length ? `FALTA CHEGAR${previsao}${mais}` : `AGUARDA O RECEBI${mais}`;
  return { texto, title: `Pendência de fabricação/compra desta OP:\n${lista.map(linha).join('\n')}` };
}

/** A chave da pessoa nos avisos já vistos. */
export const chaveDoUsuario = (u: any): string => String(u?.id || u?.email || '');

/** O que esta pessoa já confirmou. Leitura que falha devolve o erro: quem chama não mostra o aviso (melhor calar que repetir a cada abertura). */
export async function lerVistos(usuarioChave: string): Promise<{ erro: string | null; ids: Set<string> }> {
  if (!usuarioChave) return { erro: 'usuário sem identificação', ids: new Set() };
  const { data, error } = await supabase.from('almox_avisos_pendencia_sanada_vistos').select('pendencia_id').eq('usuario_chave', usuarioChave);
  if (error) return { erro: error.message, ids: new Set() };
  return { erro: null, ids: new Set((data || []).map((r: any) => String(r.pendencia_id))) };
}

/** Grava o "Entendi". Devolve a mensagem de erro, ou null quando gravou. */
export async function marcarVistos(usuarioChave: string, lista: PendenciaSanada[]): Promise<string | null> {
  if (!usuarioChave) return 'Não foi possível gravar: usuário sem identificação.';
  if (!lista.length) return null;
  const linhas = lista.map(p => ({ usuario_chave: usuarioChave, pendencia_id: p.pendenciaId, opl_id: p.opId, visto_em: new Date().toISOString() }));
  const { error } = await supabase.from('almox_avisos_pendencia_sanada_vistos').upsert(linhas, { onConflict: 'usuario_chave,pendencia_id' });
  return error ? `Não foi possível gravar o "Entendi": ${error.message}` : null;
}
