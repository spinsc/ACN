// @ts-nocheck
// Helper para enviar notificações WhatsApp via Supabase Edge Function send-whatsapp
// Use em qualquer tab ao mover status de OPL, criar demanda, etc.

import { supabase } from './supabaseClient';

/**
 * Envia notificação WhatsApp.
 * @param destino  { setor: 'Engenharia' } | { perfis: ['PCP','Almoxarifado'] } | { numero: '5511999999999' } | { grupo: '120363...@g.us' }
 * @param mensagem Texto da mensagem
 */
export async function notificarWhatsApp(
  destino: { setor?: string; perfis?: string[]; numero?: string; grupo?: string },
  mensagem: string
): Promise<void> {
  try {
    await supabase.functions.invoke('send-whatsapp', {
      body: { ...destino, mensagem },
    });
  } catch (e) {
    console.warn('[WhatsApp] Falha ao enviar notificação:', e);
  }
}

// ─── Mensagens padronizadas ───────────────────────────────────────────────────

export function msgOplEnviada(opl: string, de: string, para: string, usuario: string) {
  return `🟢 *OPL ${opl}* enviada de *${de}* para *${para}*.\nPor: ${usuario}`;
}

export function msgOplDevolvida(opl: string, de: string, para: string, motivo: string, usuario: string) {
  return `🔴 *OPL ${opl}* devolvida de *${de}* para *${para}*.\nMotivo: ${motivo}\nPor: ${usuario}`;
}

export function msgDemandaCriada(opl: string, setor: string, descricao: string, usuario: string) {
  return `📋 Nova demanda para *${setor}*${opl ? ` — OPL ${opl}` : ''}.\nDescrição: ${descricao}\nAbertura: ${usuario}`;
}

export function msgKitLiberado(opl: string, usuario: string) {
  return `📦 *Kit liberado* para OPL ${opl}. Aguardando início de produção.\nPor: ${usuario}`;
}

export function msgCqAprovado(opl: string, usuario: string) {
  return `✅ *OPL ${opl}* aprovada no CQ. Aguardando liberação Comercial.\nAuditor: ${usuario}`;
}

export function msgCqReprovado(opl: string, motivo: string, usuario: string) {
  return `❌ *OPL ${opl}* REPROVADA no CQ.\nMotivo: ${motivo}\nAuditor: ${usuario}`;
}

export function msgAtrasoEntrega(opl: string, cliente: string, dataPrevisao: string) {
  return `⚠️ *ATRASO* — OPL ${opl} | Cliente: ${cliente}\nEntrega prevista: ${dataPrevisao} já passou. Verificar urgência.`;
}
