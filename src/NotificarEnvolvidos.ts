// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICAR ENVOLVIDOS NUMA OP
// A cada atualização da adaptação numa OP em andamento, avisa quem tem
// interesse legítimo naquele processo — sem que ninguém precise lembrar de
// marcar as pessoas na mão.
//
// Quem é avisado:
//   • quem abriu a OP lá no início            (oples.criado_por / criado_por_nome)
//   • quem fez a análise na engenharia        (responsavel_engenharia / usuario_liberacao_engenharia)
//   • quem vendeu, do comercial ou licitações (responsavel_comercial / vendedor)
//   • os administradores                      (ADMINS abaixo)
//
// Regras que evitam virar spam: cada pessoa recebe UMA vez (deduplicado por
// id) e quem escreveu a atualização não é notificado do próprio texto.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

/** Administradores que acompanham todas as adaptações. Por nome porque é como
 *  o usuário os identifica; a resolução para id é feita no banco. */
export const ADMINS_NOTIFICADOS = ['LUCIANO SPINELLI', 'RAFAEL NUNES', 'MATHEUS SPINELLI', 'RAPHAEL WEBER MELLO'];

type Alvo = { id: string; nome: string; papel: string };

/** Resolve nomes/e-mails soltos (é assim que a OP guarda) para usuários reais. */
async function resolverUsuarios(nomes: string[], emails: string[]): Promise<Map<string, { id: string; nome: string }>> {
  const mapa = new Map<string, { id: string; nome: string }>();
  const nomesLimpos  = [...new Set(nomes.filter(Boolean).map(n => String(n).trim()))];
  const emailsLimpos = [...new Set(emails.filter(Boolean).map(e => String(e).trim().toLowerCase()))];
  if (!nomesLimpos.length && !emailsLimpos.length) return mapa;

  const buscas: Promise<any>[] = [];
  if (nomesLimpos.length)  buscas.push(supabase.from('auth_usuarios').select('id,nome,email').in('nome', nomesLimpos));
  if (emailsLimpos.length) buscas.push(supabase.from('auth_usuarios').select('id,nome,email').in('email', emailsLimpos));
  const resultados = await Promise.all(buscas);

  for (const r of resultados) {
    for (const u of (r?.data || [])) {
      if (u?.nome)  mapa.set(String(u.nome).trim(), { id: String(u.id), nome: u.nome });
      if (u?.email) mapa.set(String(u.email).trim().toLowerCase(), { id: String(u.id), nome: u.nome });
    }
  }
  return mapa;
}

/**
 * Avisa os envolvidos sobre uma atualização da adaptação.
 * Falha em silêncio de propósito: a atualização já foi gravada, e não avisar
 * é bem menos grave do que estourar um erro na cara de quem só queria
 * registrar o andamento.
 */
export async function notificarEnvolvidosOp(opts: {
  /** Aceita o id (uuid) OU o número da OP — as telas guardam referência das
   *  duas formas (o modal de acompanhamento, por exemplo, passa o número). */
  ref: string;
  texto: string;            // o que foi escrito na atualização
  autorId?: string | null;
  autorNome?: string | null;
  /** Cabeçalho da notificação. Nem toda atualização vem da adaptação — a
   *  embalagem e o frete também interessam a quem vendeu. */
  assunto?: string;
}): Promise<number> {
  try {
    const ref = String(opts.ref || '').trim();
    if (!ref) return 0;
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const campos = 'id,opl,cliente_nome,status_geral,criado_por,criado_por_nome,responsavel_engenharia,usuario_liberacao_engenharia,responsavel_comercial,vendedor';
    const { data: op } = ehUuid
      ? await supabase.from('oples').select(campos).eq('id', ref).maybeSingle()
      : await supabase.from('oples').select(campos).eq('opl', ref).maybeSingle();
    if (!op) return 0;

    // Só interessa avisar enquanto a OP está viva; depois de faturada ou
    // cancelada a atualização não muda mais nada pra quem seria notificado.
    if (['Faturado', 'Cancelado'].includes(op.status_geral)) return 0;

    const porNome  = [op.criado_por_nome, op.responsavel_engenharia, op.usuario_liberacao_engenharia,
                      op.responsavel_comercial, op.vendedor, ...ADMINS_NOTIFICADOS];
    const porEmail = [op.criado_por];
    const mapa = await resolverUsuarios(porNome as string[], porEmail as string[]);

    const papel = (chave: any, papelNome: string): Alvo | null => {
      if (!chave) return null;
      const k = String(chave).trim();
      const u = mapa.get(k) || mapa.get(k.toLowerCase());
      return u ? { id: u.id, nome: u.nome, papel: papelNome } : null;
    };

    const candidatos: (Alvo | null)[] = [
      papel(op.criado_por_nome, 'abriu a OP'),
      papel(op.criado_por, 'abriu a OP'),
      papel(op.responsavel_engenharia, 'analisou na engenharia'),
      papel(op.usuario_liberacao_engenharia, 'liberou na engenharia'),
      papel(op.responsavel_comercial, 'responsável comercial'),
      papel(op.vendedor, 'vendeu'),
      ...ADMINS_NOTIFICADOS.map(n => papel(n, 'administrador')),
    ];

    // Uma notificação por pessoa, e nunca para quem escreveu.
    const porId = new Map<string, Alvo>();
    for (const c of candidatos) {
      if (!c) continue;
      if (opts.autorId && c.id === String(opts.autorId)) continue;
      if (!porId.has(c.id)) porId.set(c.id, c);
    }
    if (porId.size === 0) return 0;

    const trecho = (opts.texto || '').trim().replace(/\s+/g, ' ').slice(0, 220);
    const agora = new Date().toISOString();
    const linhas = [...porId.values()].map(alvo => ({
      mencionado_id: alvo.id,
      mencionado_nome: alvo.nome,
      mencionante_id: String(opts.autorId || ''),
      mencionante_nome: opts.autorNome || 'Sistema',
      contexto: 'op_adaptacao',
      contexto_id: String(op.id),
      contexto_descricao: `OP ${op.opl}${op.cliente_nome ? ' — ' + op.cliente_nome : ''}`,
      campo: 'acompanhamento',
      texto_trecho: `${opts.assunto || 'Atualização da adaptação'} na OP ${op.opl}: ${trecho}`,
      aba_destino: 'producao',
      lida: false,
      criado_em: agora,
    }));

    const { error } = await supabase.from('mencoes').insert(linhas);
    if (error) { console.warn('[notificarEnvolvidosOp]', error.message); return 0; }
    return linhas.length;
  } catch (e: any) {
    console.warn('[notificarEnvolvidosOp] falhou:', e?.message || e);
    return 0;
  }
}
