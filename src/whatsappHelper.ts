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

// ─── Setor → perfil ───────────────────────────────────────────────────────────
// Vários avisos são mandados pelo NOME DO SETOR (ex.: demanda para "Chicotes"),
// mas o envio procura o perfil do usuário pelo nome exato ("Chicote"). Sem esta
// tradução esses avisos não chegavam a ninguém.
const PERFIL_DO_SETOR: Record<string, string[]> = {
  Chicotes: ['Chicote'], Laboratorio: ['Laboratório'], Producao: ['Produção'], Logistica: ['Logística'],
  Licitacoes: ['Licitações'], Qualidade: ['CQ'], 'Controle de Qualidade': ['CQ'],
};
export function expandirPerfis(perfis: string[]) {
  return [...new Set(perfis.flatMap(p => [p, ...(PERFIL_DO_SETOR[p] || [])]))];
}

// Pessoas que respondem por um perfil sem ter esse perfil (ex.: PCP → Matheus).
// Quem já tem um dos perfis não é repetido (o envio por perfil já o alcança).
async function responsaveisDosPerfis(perfis: string[]): Promise<string[]> {
  const { data } = await supabase.from('notificacoes_responsaveis')
    .select('perfil, usuario:auth_usuarios(whatsapp, perfil, ativo)').in('perfil', perfis);
  return [...new Set((data || [])
    .map((r: any) => r.usuario)
    .filter((u: any) => u?.ativo && u?.whatsapp && !perfis.includes(u.perfil))
    .map((u: any) => u.whatsapp))];
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
 * @param evento Chave do evento (ex: 'op_enviada_engenharia')
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
    perfis = expandirPerfis(perfis);

    await notificarWhatsApp({ perfis }, mensagem);
    // quem responde por um perfil sem ter esse perfil (Admin › Notificações › Responsáveis)
    const extras = await responsaveisDosPerfis(perfis);
    for (const numero of extras) await notificarWhatsApp({ numero }, mensagem);
  } catch (e) {
    console.warn('[WhatsApp] notificarEvento falhou:', e);
  }
}

/**
 * Envia para o número de uma pessoa específica (ex.: o gestor que aprova uma hora
 * extra), somente se o evento estiver ativo na config. Os perfis do evento não são usados.
 */
export async function notificarPessoa(evento: string, numero: string | null | undefined, mensagem: string): Promise<void> {
  try {
    if (!numero) return;
    const cfg = await getConfig();
    if (!cfg[evento]?.ativo) return;
    await notificarWhatsApp({ numero }, mensagem);
  } catch (e) {
    console.warn('[WhatsApp] notificarPessoa falhou:', e);
  }
}

// ─── Templates de mensagem ────────────────────────────────────────────────────
export const msg = {
  oplEnviada: (opl: string, para: string, usuario: string) =>
    `*OPL ${opl}* enviada para *${para}*.\nPor: ${usuario}`,

  oplDevolvida: (opl: string, para: string, motivo: string, usuario: string) =>
    `*OPL ${opl}* devolvida para *${para}*.\nMotivo: ${motivo || '—'}\nPor: ${usuario}`,

  kitOk: (opl: string, usuario: string) =>
    `*Kit completo* — OPL ${opl} aguardando liberação PCP.\nAlmox: ${usuario}`,

  kitPendencia: (opl: string, obs: string, usuario: string) =>
    `*Kit com pendência* — OPL ${opl}.\nObs: ${obs || '—'}\nAlmox: ${usuario}`,

  kitFaltaMaterial: (opl: string, obs: string, usuario: string) =>
    `*FALTA DE MATERIAL* — OPL ${opl} bloqueada.\nItens: ${obs || '—'}\nAlmox: ${usuario}`,

  producaoFinalizada: (opl: string, usuario: string) =>
    `*Produção finalizada* — OPL ${opl} aguardando CQ.\nPor: ${usuario}`,

  cqAprovado: (opl: string, auditor: string) =>
    `*CQ APROVADO* — OPL ${opl}.\nAuditor: ${auditor}`,

  cqReprovado: (opl: string, motivo: string, auditor: string) =>
    `*CQ REPROVADO* — OPL ${opl}.\nMotivo: ${motivo}\nAuditor: ${auditor}`,

  nfEmitida: (opl: string, nf: string, usuario: string) =>
    `*NF Emitida* — OPL ${opl}. NF: ${nf || '—'}.\nFiscal: ${usuario}`,

  entregue: (opl: string, cliente: string, recebeu: string) =>
    `*Entregue* — OPL ${opl}.\nCliente: ${cliente}\nRecebeu: ${recebeu}`,

  demandaCriada: (setor: string, opl: string, desc: string, usuario: string) =>
    `Nova demanda para *${setor}*${opl ? ` | OPL ${opl}` : ''}.\n${desc}\nAbertura: ${usuario}`,

  atrasoEntrega: (opl: string, cliente: string, data: string) =>
    `*ATRASO* — OPL ${opl} | ${cliente}.\nEntrega prevista: ${data} já passou!`,
};
