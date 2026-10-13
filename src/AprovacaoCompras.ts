// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS QUE ESPERAM A DECISÃO DE QUEM APROVA — a mesma conta para o painel "Esperando a sua aprovação" e para o contador do menu (R6, 13/10/2026)
//
// A Etapa 8 (30/09/2026) criou o painel, mas ele só listava as compras na etapa "Aguardando Aprovação". As ALÇADAS — a aprovação por valor (compras_alcadas_aprovacao) e a do
// departamento — ficam em pcp_aprovacoes e só se resolviam dentro da Mesa de Cotações: uma alçada de departamento pendente, criada na 1ª cotação, não aparecia em lugar nenhum
// para quem aprova. Resposta do usuário (R6): contador no menu ("Compras (N)") para quem aprova, e as alçadas à vista.
//
// Suposição a confirmar com o usuário (caminho conservador): "qualquer aprovador resolve" (regra de 24/09/2026) continua valendo; a alçada AQUI só aparece, não muda quem pode
// aprovar nem como (a decisão segue sendo na Mesa de Cotações). Quem é o "aprovador do departamento" (aprovador_nome da linha) é mostrado como informação.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

// Compra que já foi comprada, recebida ou descartada não espera mais ninguém, mesmo que sobre uma linha de alçada pendente
export const STATUS_SEM_ESPERA = ['Descartada', 'Recebido', 'Comprado'];

/** Texto da alçada pendente. O valor só entra para quem vê valores. */
export function rotuloDaAlcada(a: any, verValor = false): string {
  if (a?.tipo === 'departamento') return `Aprovação do departamento${a.aprovador_nome ? ` (${a.aprovador_nome})` : ''}`;
  const nome = a?.nivel_nome ? ` — ${a.nivel_nome}` : '';
  const valor = verValor && a?.valor_no_momento != null && a.valor_no_momento !== ''
    ? ` · ${Number(a.valor_no_momento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '';
  return `Alçada nível ${a?.nivel ?? '?'}${nome}${valor}`;
}

/**
 * As compras que esperam quem aprova: as da etapa "Aguardando Aprovação" mais as que têm alçada pendente (por valor ou por departamento) em outra etapa, cada uma uma vez só.
 * Devolve também as alçadas pendentes de cada compra (por id). Em caso de falha devolve `erro` e listas vazias — quem chama não pode tratar isso como "nada espera".
 */
export async function listarEsperandoAprovacao(): Promise<{ pedidos: any[]; alcadas: Record<string, any[]>; erro?: string; erroAlcadas?: string }> {
  const [{ data: aguardando, error: erroPed }, { data: pendentes, error: erroAlc }] = await Promise.all([
    supabase.from('pcp_pedidos_compra').select('*').eq('status_compra', 'Aguardando Aprovação').order('data_criacao', { ascending: true }),
    supabase.from('pcp_aprovacoes').select('*').eq('status', 'pendente').order('nivel', { ascending: true }),
  ]);
  if (erroPed) return { pedidos: [], alcadas: {}, erro: erroPed.message };
  // As alçadas são um complemento: se só a leitura delas falhar, a lista das compras em "Aguardando Aprovação" continua valendo (como era antes da R6) e quem chama avisa
  // que as compras que esperam só por uma alçada podem estar faltando — não some o painel inteiro nem vira "nada espera".
  if (erroAlc) return { pedidos: aguardando || [], alcadas: {}, erroAlcadas: erroAlc.message };
  const alcadas: Record<string, any[]> = {};
  (pendentes || []).forEach((a: any) => { (alcadas[a.pedido_id] = alcadas[a.pedido_id] || []).push(a); });
  const jaTenho = new Set((aguardando || []).map((p: any) => p.id));
  const faltam = Object.keys(alcadas).filter(id => !jaTenho.has(id));
  let extras: any[] = [];
  if (faltam.length) {
    const { data, error } = await supabase.from('pcp_pedidos_compra').select('*').in('id', faltam);
    // sem os pedidos das alçadas, vale o que já temos, com o aviso (mesma regra de acima)
    if (error) return { pedidos: aguardando || [], alcadas, erroAlcadas: error.message };
    extras = (data || []).filter((p: any) => !STATUS_SEM_ESPERA.includes(p.status_compra));
  }
  return { pedidos: [...(aguardando || []), ...extras], alcadas };
}

/** Quantas compras esperam quem aprova (para o contador do menu). null = a leitura falhou: o contador não muda, e nunca vira "0" por causa de uma falha. */
export async function contarEsperandoAprovacao(): Promise<number | null> {
  const r = await listarEsperandoAprovacao();
  return r.erro ? null : r.pedidos.length;
}
