// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// QUEM É AVISADO QUANDO A OP VOLTA AO COMERCIAL (R3, decisão do usuário de 01/10/2026)
//
// "Contador na tela porém notificando os envolvidos naquele card, quem abriu e o seu gerente." Antes o aviso ia para o PERFIL inteiro (todo mundo do Comercial) ou, no caso
// do Fiscal, para ninguém (o evento nunca existiu na configuração). Agora vai pessoa a pessoa: quem abriu a OP, a pessoa do Comercial responsável por ela e o gerente deles.
//
// O cadastro de usuários não tem vínculo individual "fulano responde a sicrano": o que existe é o PERFIL, e o mapa de equipes de utils/permissoes.ts diz que perfis cada
// gerente cuida. Por isso "o gerente de quem abriu" é o gerente do perfil da pessoa (suposição a confirmar com o usuário, registrada no plano).
// Se ninguém for achado (sem cadastro, sem WhatsApp), o aviso cai para os perfis configurados no evento — a devolução nunca fica sem aviso por causa disso.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { notificarPessoa, notificarEvento } from './whatsappHelper';
import { ehGerenteDoPerfil } from './utils/permissoes';

const semAcentoMaiusculo = (v: any) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const email = (v: any) => String(v ?? '').trim().toLowerCase();

/**
 * Quem avisar, sem repetir ninguém e sem avisar quem está fazendo a devolução. `usuarios` = auth_usuarios (nome, email, perfil, whatsapp, ativo).
 * Puro, para testar sem banco. Cada item: { nome, numero, papel: 'abriu' | 'gerente' }.
 */
export function quemAvisar({ opl, usuarios, autorEmail }: { opl: any; usuarios: any[]; autorEmail?: string }) {
  const ativos = (usuarios || []).filter(u => u && u.ativo !== false);
  const donos = ativos.filter(u =>
    (!!email(opl?.criado_por) && email(u.email) === email(opl?.criado_por)) ||
    (!!semAcentoMaiusculo(opl?.responsavel_comercial) && semAcentoMaiusculo(u.nome) === semAcentoMaiusculo(opl?.responsavel_comercial)));
  const gerentes = ativos.filter(g => donos.some(d => ehGerenteDoPerfil(g.perfil, d.perfil)));
  const visto = new Set<string>();
  const saida: { nome: string; numero: string; papel: 'abriu' | 'gerente' }[] = [];
  const entrar = (u: any, papel: 'abriu' | 'gerente') => {
    const numero = String(u.whatsapp ?? '').trim();
    if (!numero || visto.has(numero) || (!!email(autorEmail) && email(u.email) === email(autorEmail))) return;
    visto.add(numero);
    saida.push({ nome: u.nome, numero, papel });
  };
  donos.forEach(u => entrar(u, 'abriu'));
  gerentes.forEach(u => entrar(u, 'gerente'));
  return saida;
}

/**
 * Avisa quem abriu a OP e o gerente dele que ela voltou ao Comercial. `opl` precisa do id; o resto (quem criou, responsável do Comercial) é lido do banco se faltar.
 * `evento` é a chave de notificacoes_config (liga/desliga no Admin). Nunca derruba a ação que chamou.
 */
export async function avisarDevolucaoAoComercial({ opl, evento, mensagem, autorEmail }: { opl: any; evento: string; mensagem: string; autorEmail?: string }) {
  try {
    let dados = opl;
    if (opl?.id && (opl.criado_por === undefined || opl.responsavel_comercial === undefined)) {
      const { data } = await supabase.from('oples').select('criado_por,responsavel_comercial').eq('id', opl.id).maybeSingle();
      dados = { ...opl, ...(data || {}) };
    }
    const { data: usuarios, error } = await supabase.from('auth_usuarios').select('nome,email,perfil,whatsapp,ativo').eq('ativo', true);
    const alvos = error ? [] : quemAvisar({ opl: dados, usuarios: usuarios || [], autorEmail });
    if (!alvos.length) { await notificarEvento(evento, mensagem); return; }
    for (const a of alvos) await notificarPessoa(evento, a.numero, mensagem);
  } catch (e) {
    console.warn('[Devolução] aviso a quem abriu a OP falhou:', e);
  }
}
