// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — as regras da ficha (G1 do PLANO_GARANTIA.md, 19/10/2026)
//
// Só regra, sem tela e sem banco: a tela (GarantiaTab.tsx) lê, grava e mostra. Decisões do usuário em 19/10/2026:
//   • campos obrigatórios na abertura, como no plano: cliente (nome e contato), veículo do catálogo, placa OU chassi, OP/OS de origem OU nota fiscal, descrição da falha,
//     data da ocorrência, responsável pelo atendimento e quem é copiado (ao menos uma pessoa); quem abriu entra sozinho;
//   • ABRE quem tem SAC, Comercial ou gerente (Admin incluído); VÊ quem abriu, o responsável, os copiados e o Admin;
//   • número GAR-0001/2026 (sequencial por ano; quem dá o número é o banco, na função `garantia_abrir`, sem pular e sem repetir).
// Atendimento não se apaga: edita enquanto aberto, cancela com motivo e reabre. O encerramento é da G6.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGENS_GARANTIA: Record<string, string> = { op: 'OP', os: 'OS do SAC', nf: 'Nota fiscal da venda' };
export const SITUACOES_GARANTIA: Record<string, string> = { aberto: 'Aberto', encerrado: 'Encerrado', cancelado: 'Cancelado' };

const semAcento = (t: any) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mesmoEmail = (a: any, b: any) => !!String(a || '').trim() && String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// placa e chassi sempre em maiúscula e sem espaço, traço ou ponto (como o banco guarda e como se confere)
export const normalizarPlaca = (v: any) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normalizarChassi = (v: any) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const PLACA_VALIDA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;      // modelo antigo (ABC1234) e Mercosul (ABC1D23)
export const CHASSI_VALIDO = /^[A-HJ-NPR-Z0-9]{17}$/;               // 17 caracteres, sem I, O e Q

// ── quem pode o quê ─────────────────────────────────────────────────────────────────────────────────────────
export const ehAdminG = (u: any) => String(u?.perfil || '').trim() === 'Admin';
export const ehGerenteG = (u: any) => ehAdminG(u) || /^gerente/i.test(String(u?.perfil || '').trim());
/** Abre: Admin, qualquer gerente, o Comercial, o SAC e quem tem a aba SAC liberada. */
export function podeAbrirGarantia(u: any): boolean {
  if (!u) return false;
  if (ehGerenteG(u)) return true;
  const perfil = semAcento(u.perfil);
  if (perfil === 'comercial' || perfil === 'sac') return true;
  return Array.isArray(u.abas_permitidas) && u.abas_permitidas.includes('sac');
}
const ehAutor = (g: any, u: any) => mesmoEmail(g?.aberto_por_email, u?.email);
const ehResponsavel = (g: any, u: any) => mesmoEmail(g?.responsavel?.email, u?.email);
const ehCopiado = (g: any, u: any) => (Array.isArray(g?.copiados) ? g.copiados : []).some((p: any) => mesmoEmail(p?.email, u?.email));
/** Vê: quem abriu, o responsável, os copiados e o Admin. */
export const podeVerGarantia = (g: any, u: any) => !!u && (ehAdminG(u) || ehAutor(g, u) || ehResponsavel(g, u) || ehCopiado(g, u));
/** Edita, cancela e reabre: quem abriu, o responsável e a gerência. */
export const podeMexerNaGarantia = (g: any, u: any) => !!u && (ehGerenteG(u) || ehAutor(g, u) || ehResponsavel(g, u));

// ── validação da abertura ───────────────────────────────────────────────────────────────────────────────────
const diaValido = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(String(v) + 'T00:00:00Z'));

/** Lista (em português, para a pessoa) tudo que impede de gravar; vazia = pode gravar. `hoje` é AAAA-MM-DD. */
export function validarGarantia(c: any, hoje: string): string[] {
  const erros: string[] = [];
  const vazio = (v: any) => !String(v ?? '').trim();
  if (vazio(c.cliente_nome)) erros.push('o nome do cliente');
  if (vazio(c.cliente_contato)) erros.push('o contato do cliente (telefone ou e-mail)');
  if (vazio(c.veiculo_nome) || vazio(c.veiculo_id)) erros.push('o veículo (escolha no catálogo)');
  const placa = normalizarPlaca(c.placa), chassi = normalizarChassi(c.chassi);
  if (!placa && !chassi) erros.push('a placa ou o chassi');
  if (placa && !PLACA_VALIDA.test(placa)) erros.push(`uma placa válida (a digitada, "${c.placa}", não tem o formato ABC1234 nem ABC1D23)`);
  if (chassi && !CHASSI_VALIDO.test(chassi)) erros.push('um chassi válido (17 letras e números, sem I, O e Q)');
  if (!ORIGENS_GARANTIA[c.origem_tipo]) erros.push('a origem da venda (OP, OS do SAC ou nota fiscal)');
  else if (vazio(c.origem_ref)) erros.push(c.origem_tipo === 'nf' ? 'o número da nota fiscal' : `a ${ORIGENS_GARANTIA[c.origem_tipo]} de origem (escolha na lista)`);
  else if (c.origem_tipo === 'op' && vazio(c.opl_id)) erros.push('a OP de origem (escolha na lista)');
  else if (c.origem_tipo === 'os' && vazio(c.os_id)) erros.push('a OS de origem (escolha na lista)');
  if (vazio(c.descricao_falha)) erros.push('a descrição da falha');
  if (!diaValido(c.data_ocorrencia)) erros.push('a data da ocorrência');
  else if (String(c.data_ocorrencia) > hoje) erros.push('a data da ocorrência (não pode ser no futuro)');
  if (!c.responsavel?.email || vazio(c.responsavel?.nome)) erros.push('o responsável pelo atendimento');
  const copiados = Array.isArray(c.copiados) ? c.copiados.filter((p: any) => p?.email) : [];
  if (!copiados.length) erros.push('quem é copiado (ao menos uma pessoa)');
  return erros;
}

/** O que vai ao banco: texto aparado, placa e chassi normalizados, só os campos da ficha. */
export function cargaDaGarantia(c: any) {
  const t = (v: any) => String(v ?? '').trim();
  const pessoa = (p: any) => ({ email: t(p?.email), nome: t(p?.nome) || t(p?.email) });
  const copiados: any[] = [];
  (Array.isArray(c.copiados) ? c.copiados : []).filter((p: any) => p?.email).forEach((p: any) => { if (!copiados.some(x => mesmoEmail(x.email, p.email))) copiados.push(pessoa(p)); });
  return {
    cliente_nome: t(c.cliente_nome), cliente_contato: t(c.cliente_contato),
    veiculo_id: t(c.veiculo_id) || null, veiculo_nome: t(c.veiculo_nome),
    placa: normalizarPlaca(c.placa) || null, chassi: normalizarChassi(c.chassi) || null,
    origem_tipo: c.origem_tipo, origem_ref: t(c.origem_ref),
    opl_id: c.origem_tipo === 'op' ? (t(c.opl_id) || null) : null, os_id: c.origem_tipo === 'os' ? (t(c.os_id) || null) : null,
    descricao_falha: t(c.descricao_falha), data_ocorrencia: t(c.data_ocorrencia),
    responsavel: pessoa(c.responsavel), copiados,
  };
}

// ── histórico e edição ──────────────────────────────────────────────────────────────────────────────────────
export const evento = (tipo: string, u: any, texto: string | null, agora: string) => ({ em: agora, por: u?.nome || '', tipo, texto: texto || null });
export const FRASES_GARANTIA: Record<string, string> = { aberto: 'Atendimento aberto', editado: 'Dados alterados', cancelado: 'Atendimento cancelado', reaberto: 'Atendimento reaberto', encerrado: 'Atendimento encerrado' };
export const fraseDoEvento = (e: any) => (FRASES_GARANTIA[e.tipo] || e.tipo) + (e.texto && e.tipo !== 'aberto' ? `: ${e.texto}` : '');

const ROTULOS_CAMPO: Record<string, string> = {
  cliente_nome: 'nome do cliente', cliente_contato: 'contato do cliente', veiculo_nome: 'veículo', placa: 'placa', chassi: 'chassi', origem_tipo: 'origem', origem_ref: 'origem',
  descricao_falha: 'descrição da falha', data_ocorrencia: 'data da ocorrência', responsavel: 'responsável', copiados: 'copiados',
};
/** Os campos (em português, sem repetir) que mudaram entre a ficha gravada e a nova carga. */
export function camposAlterados(antes: any, depois: any): string[] {
  const nomes: string[] = [];
  for (const k of Object.keys(ROTULOS_CAMPO)) {
    const a = k === 'responsavel' ? antes?.responsavel?.email : k === 'copiados' ? (antes?.copiados || []).map((p: any) => String(p.email).toLowerCase()).sort().join(',') : (antes?.[k] ?? '');
    const b = k === 'responsavel' ? depois?.responsavel?.email : k === 'copiados' ? (depois?.copiados || []).map((p: any) => String(p.email).toLowerCase()).sort().join(',') : (depois?.[k] ?? '');
    if (String(a ?? '') !== String(b ?? '') && !nomes.includes(ROTULOS_CAMPO[k])) nomes.push(ROTULOS_CAMPO[k]);
  }
  return nomes;
}

const copiar = (v: any) => JSON.parse(JSON.stringify(v ?? null));

export function aplicarEdicao(g: any, novos: any, u: any, hoje: string, agora: string) {
  if (g.situacao !== 'aberto') return { erro: 'Só o atendimento aberto pode ser editado. Reabra antes, se for o caso.' };
  if (!podeMexerNaGarantia(g, u)) return { erro: 'Só quem abriu, o responsável ou a gerência edita o atendimento.' };
  const erros = validarGarantia(novos, hoje);
  if (erros.length) return { erro: `Falta ou está errado: ${erros.join('; ')}.` };
  const carga = cargaDaGarantia(novos);
  const mudou = camposAlterados(g, carga);
  if (!mudou.length) return { erro: 'Nada foi alterado.' };
  const historico = copiar(g.historico) || [];
  historico.push(evento('editado', u, mudou.join(', '), agora));
  return { patch: { ...carga, historico }, mudou };
}

export function cancelarGarantia(g: any, u: any, motivo: string, agora: string) {
  if (g.situacao !== 'aberto') return { erro: 'Só o atendimento aberto pode ser cancelado.' };
  if (!podeMexerNaGarantia(g, u)) return { erro: 'Só quem abriu, o responsável ou a gerência cancela o atendimento.' };
  const m = String(motivo || '').trim();
  if (!m) return { erro: 'Escreva o motivo do cancelamento.' };
  const historico = copiar(g.historico) || [];
  historico.push(evento('cancelado', u, m, agora));
  return { patch: { situacao: 'cancelado', motivo_cancelamento: m, historico } };
}

export function reabrirGarantia(g: any, u: any, agora: string) {
  if (g.situacao !== 'cancelado') return { erro: 'Só o atendimento cancelado pode ser reaberto.' };
  if (!podeMexerNaGarantia(g, u)) return { erro: 'Só quem abriu, o responsável ou a gerência reabre o atendimento.' };
  const historico = copiar(g.historico) || [];
  historico.push(evento('reaberto', u, null, agora));
  return { patch: { situacao: 'aberto', motivo_cancelamento: null, historico } };
}
