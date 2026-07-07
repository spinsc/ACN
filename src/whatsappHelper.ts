// @ts-nocheck
// Helper de notificações WhatsApp via Supabase Edge Function send-whatsapp
// Usa tabela notificacoes_config para ligar/desligar eventos e definir destinatários.

import { supabase } from './supabaseClient';

// ─── Cache de configuração ────────────────────────────────────────────────────
let _cache: Record<string, { ativo: boolean; destinatarios_perfis: string[] }> | null = null;

async function getConfig() {
  if (_cache) return _cache;
  const { data } = await supabase.from('notificacoes_config').select('*');
  _cache = {};
  (data || []).forEach((row: any) => {
    _cache![row.evento] = {
      ativo: row.ativo,
      destinatarios_perfis: row.destinatarios_perfis || [],
    };
  });
  return _cache;
}

/** Chame após salvar config no Admin para forçar recarregamento */
export function invalidarCacheNotif() {
  _cache = null;
}

// ─── Envio base ───────────────────────────────────────────────────────────────
export async function notificarWhatsApp(
  destino: { setor?: string; perfis?: string[]; numero?: string; grupo?: string },
  mensagem: string
): Promise<void> {
  try {
    await supabase.functions.invoke('send-whatsapp', {
      body: { ...destino, mensagem },
    });
  } catch (e) {
    console.warn('[WhatsApp] Falha ao enviar:', e);
  }
}

// ─── Disparo por evento (consulta config) ────────────────────────────────────
/**
 * Envia notificação somente se o evento estiver ativo na config.
 * @param evento  Chave do evento (ex: 'op_enviada_engenharia')
 * @param mensagem Texto da mensagem
 * @param setorOverride Sobrescreve destinatários da config (ex: setor dinâmico de demanda)
 */
export async function notificarEvento(
  evento: string,
  mensagem: string,
  setorOverride?: string | string[]
): Promise<void> {
  try {
    const cfg = await getConfig();
    const ev = cfg[evento];
    if (!ev || !ev.ativo) return;

    let perfis: string[];
    if (setorOverride) {
      perfis = Array.isArray(setorOverride) ? setorOverride : [setorOverride];
    } else {
      perfis = ev.destinatarios_perfis;
    }
    if (!perfis || perfis.length === 0) return;

    await notificarWhatsApp({ perfis }, mensagem);
  } catch (e) {
    console.warn('[WhatsApp] notificarEvento falhou:', e);
  }
}

// ─── Templates de mensagem ────────────────────────────────────────────────────
export const msg = {
  oplEnviada: (opl: string, para: string, usuario: string) =>
    `🟢 *OPL ${opl}* enviada para *${para}*.\nPor: ${usuario}`,

  oplDevolvida: (opl: string, para: string, motivo: string, usuario: string) =>
    `🔴 *OPL ${opl}* devolvida para *${para}*.\nMotivo: ${motivo || '—'}\nPor: ${usuario}`,

  kitOk: (opl: string, usuario: string) =>
    `📦 *Kit completo* — OPL ${opl} aguardando liberação PCP.\nAlmox: ${usuario}`,

  kitPendencia: (opl: string, obs: string, usuario: string) =>
    `⚠️ *Kit com pendência* — OPL ${opl}.\nObs: ${obs || '—'}\nAlmox: ${usuario}`,

  kitFaltaMaterial: (opl: string, obs: string, usuario: string) =>
    `🚨 *FALTA DE MATERIAL* — OPL ${opl} bloqueada.\nItens: ${obs || '—'}\nAlmox: ${usuario}`,

  producaoFinalizada: (opl: string, usuario: string) =>
    `🏭 *Produção finalizada* — OPL ${opl} aguardando CQ.\nPor: ${usuario}`,

  cqAprovado: (opl: string, auditor: string) =>
    `✅ *CQ APROVADO* — OPL ${opl}.\nAuditor: ${auditor}`,

  cqReprovado: (opl: string, motivo: string, auditor: string) =>
    `❌ *CQ REPROVADO* — OPL ${opl}.\nMotivo: ${motivo}\nAuditor: ${auditor}`,

  nfEmitida: (opl: string, nf: string, usuario: string) =>
    `🧾 *NF Emitida* — OPL ${opl}. NF: ${nf || '—'}.\nFiscal: ${usuario}`,

  entregue: (opl: string, cliente: string, recebeu: string) =>
    `🚚 *Entregue* — OPL ${opl}.\nCliente: ${cliente}\nRecebeu: ${recebeu}`,

  demandaCriada: (setor: string, opl: string, desc: string, usuario: string) =>
    `📋 Nova demanda para *${setor}*${opl ? ` | OPL ${opl}` : ''}.\n${desc}\nAbertura: ${usuario}`,

  atrasoEntrega: (opl: string, cliente: string, data: string) =>
    `⚠️ *ATRASO* — OPL ${opl} | ${cliente}.\nEntrega prevista: ${data} já passou!`,
};
