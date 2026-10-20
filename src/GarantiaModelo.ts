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
export const FRASES_GARANTIA: Record<string, string> = { aberto: 'Atendimento aberto', editado: 'Dados alterados', cancelado: 'Atendimento cancelado', reaberto: 'Atendimento reaberto', encerrado: 'Atendimento encerrado',
  avaliacao: 'Avaliação técnica registrada', fornecedor: 'Fornecedor', execucao: 'Quem executa definido', peca_pedida: 'Peça pedida ao Compras' };
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

// ── G2 (19/10/2026): avaliação técnica, fornecedor, quem executa e o pedido de peça ──────────────────────────────────────
// Decisão do usuário em 19/10/2026: a avaliação, a consulta ao fornecedor e o pedido de peça são registrados pelo RESPONSÁVEL pelo atendimento e pela gerência.
// "Sem avaliação, não segue": fornecedor e quem executa só se registram depois da avaliação técnica. O pedido de peça ao Compras só abre com a avaliação registrada E a consulta ao
// fornecedor respondida (ou a justificativa de que não se aplica) — a trava vale no botão da ficha; compra aberta por outro caminho do Compras não sabe que é garantia.
export const COBERTURAS_GARANTIA: Record<string, string> = { dentro: 'Dentro da garantia', fora: 'Fora da garantia', a_confirmar: 'A confirmar' };
export const DECISOES_FORNECEDOR: Record<string, string> = { cobre: 'O fornecedor cobre', parcial: 'Cobre em parte', nao_cobre: 'O fornecedor não cobre' };
export const podeConduzirGarantia = (g: any, u: any) => !!u && (ehGerenteG(u) || ehResponsavel(g, u));

const diaOk = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(String(v) + 'T00:00:00Z'));
const txt = (v: any, max = 2000) => String(v ?? '').trim().slice(0, max);

/** "12 MESES", "24 meses", "12" → 12 (null se não der para ler). */
export function mesesDoPrazo(texto: any): number | null {
  const m = /(\d{1,3})/.exec(String(texto || ''));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 240 ? n : null;
}
const somarMeses = (iso: string, meses: number) => {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));          // 31/08 + 6 meses = 28/02, não 03/03
  return alvo.toISOString().slice(0, 10);
};
/** O apoio para quem avalia: a garantia da OP (prazo em texto e dia da entrega) contra o dia da falha. Só informa; quem decide é o técnico. */
export function apoioDeCobertura({ prazoTexto, entregaISO }: { prazoTexto: any; entregaISO: any }, ocorrenciaISO: string) {
  const meses = mesesDoPrazo(prazoTexto);
  if (!meses || !diaOk(entregaISO) || !diaOk(ocorrenciaISO)) return { meses, entrega: diaOk(entregaISO) ? entregaISO : null, fim: null, situacao: 'sem_dados', dias: 0 };
  const fim = somarMeses(entregaISO, meses);
  const dias = Math.round((Date.parse(fim + 'T00:00:00Z') - Date.parse(ocorrenciaISO + 'T00:00:00Z')) / 86400000);
  return { meses, entrega: entregaISO, fim, situacao: dias >= 0 ? 'dentro' : 'fora', dias: Math.abs(dias) };
}

/** Em que ponto está o atendimento: avaliação → fornecedor → quem executa → em atendimento. */
export function etapaDaGarantia(g: any): string {
  if (!g?.avaliacao) return 'avaliacao';
  if (!fornecedorLiberado(g)) return 'fornecedor';
  if (!g.execucao) return 'execucao';
  return 'andamento';
}
export const ROTULOS_ETAPA_GARANTIA: Record<string, string> = { abertura: 'Abertura', avaliacao: 'Avaliação técnica', fornecedor: 'Fornecedor', execucao: 'Quem executa', andamento: 'Em atendimento' };

/** A consulta ao fornecedor está resolvida: respondida (com a decisão) ou dispensada com justificativa. */
export function fornecedorLiberado(g: any): boolean {
  const f = g?.fornecedor;
  if (!f) return false;
  if (f.modo === 'dispensa') return !!txt(f.dispensa);
  return f.modo === 'consulta' && !!txt(f.resposta) && !!DECISOES_FORNECEDOR[f.decisao] && diaOk(f.resposta_em);
}
/** O pedido de peça ao Compras: { ok, motivo } — motivo diz, em português, o que falta. */
export function podePedirPeca(g: any): { ok: boolean; motivo: string } {
  if (g?.situacao !== 'aberto') return { ok: false, motivo: 'O atendimento não está aberto.' };
  if (!g?.avaliacao) return { ok: false, motivo: 'Registre antes a avaliação técnica.' };
  if (!fornecedorLiberado(g)) return { ok: false, motivo: g?.fornecedor?.modo === 'consulta' ? 'Falta a resposta do fornecedor (ou a justificativa de que não se aplica).' : 'Registre antes a consulta ao fornecedor (ou a justificativa de que não se aplica).' };
  return { ok: true, motivo: '' };
}

const preparar = (g: any, u: any, exigeAvaliacao: boolean) => {
  if (g?.situacao !== 'aberto') return 'Só o atendimento aberto pode receber registros.';
  if (!podeConduzirGarantia(g, u)) return 'Só o responsável pelo atendimento ou a gerência faz este registro.';
  if (exigeAvaliacao && !g?.avaliacao) return 'Sem a avaliação técnica o atendimento não segue: registre-a primeiro.';
  return '';
};
const comEtapa = (g: any, mudado: any) => ({ ...mudado, etapa: etapaDaGarantia({ ...g, ...mudado }) });

export function registrarAvaliacao(g: any, u: any, { parecer, cobertura }: any, apoio: any, agora: string) {
  const erro = preparar(g, u, false); if (erro) return { erro };
  const p = txt(parecer);
  if (!p) return { erro: 'Escreva o parecer técnico.' };
  if (!COBERTURAS_GARANTIA[cobertura]) return { erro: 'Escolha a cobertura: dentro, fora ou a confirmar.' };
  const avaliacao = { parecer: p, cobertura, por: u?.nome || '', em: agora, apoio: apoio || null };
  const historico = copiar(g.historico) || [];
  historico.push(evento('avaliacao', u, `${COBERTURAS_GARANTIA[cobertura]}${g.avaliacao ? ' (avaliação refeita)' : ''}`, agora));
  return { patch: comEtapa(g, { avaliacao, historico }) };
}

export function registrarFornecedor(g: any, u: any, c: any, agora: string, hoje: string) {
  const erro = preparar(g, u, true); if (erro) return { erro };
  const historico = copiar(g.historico) || [];
  let fornecedor: any;
  if (c.modo === 'dispensa') {
    const j = txt(c.dispensa);
    if (!j) return { erro: 'Escreva por que a consulta ao fornecedor não se aplica.' };
    fornecedor = { modo: 'dispensa', dispensa: j, por: u?.nome || '', em: agora };
    historico.push(evento('fornecedor', u, `Consulta ao fornecedor dispensada: ${j}`, agora));
  } else if (c.modo === 'consulta') {
    const nome = txt(c.nome, 200);
    if (!nome) return { erro: 'Informe o fornecedor consultado.' };
    if (!diaOk(c.consultado_em)) return { erro: 'Informe a data em que o fornecedor foi consultado.' };
    if (String(c.consultado_em) > hoje) return { erro: 'A data da consulta não pode ser no futuro.' };
    if (c.prazo_resposta && (!diaOk(c.prazo_resposta) || String(c.prazo_resposta) < String(c.consultado_em))) return { erro: 'O prazo de resposta precisa ser uma data igual ou depois da consulta.' };
    const resposta = txt(c.resposta);
    if (resposta) {
      if (!DECISOES_FORNECEDOR[c.decisao]) return { erro: 'Diga se o fornecedor cobre, cobre em parte ou não cobre.' };
      if (!diaOk(c.resposta_em)) return { erro: 'Informe a data da resposta do fornecedor.' };
      if (String(c.resposta_em) < String(c.consultado_em)) return { erro: 'A resposta não pode ser antes da consulta.' };
      if (String(c.resposta_em) > hoje) return { erro: 'A data da resposta não pode ser no futuro.' };
    }
    fornecedor = { modo: 'consulta', nome, protocolo: txt(c.protocolo, 100), consultado_em: c.consultado_em, prazo_resposta: c.prazo_resposta || null, resposta, decisao: resposta ? c.decisao : null, resposta_em: resposta ? c.resposta_em : null, por: u?.nome || '', em: agora };
    historico.push(evento('fornecedor', u, resposta ? `${nome} respondeu: ${DECISOES_FORNECEDOR[c.decisao]}` : `Consulta registrada a ${nome}${fornecedor.protocolo ? ` (protocolo ${fornecedor.protocolo})` : ''}`, agora));
  } else return { erro: 'Escolha: consultar o fornecedor ou dizer que não se aplica.' };
  return { patch: comEtapa(g, { fornecedor, historico }) };
}

export function registrarExecucao(g: any, u: any, { tipo, tecnicos, terceiro_nome, terceiro_custo }: any, agora: string) {
  const erro = preparar(g, u, true); if (erro) return { erro };
  const historico = copiar(g.historico) || [];
  let execucao: any;
  if (tipo === 'propria') {
    const lista = (Array.isArray(tecnicos) ? tecnicos : []).map((t: any) => txt(t?.nome, 200)).filter(Boolean);
    const unicos = lista.filter((n, i) => lista.findIndex(x => semAcento(x) === semAcento(n)) === i);
    if (!unicos.length) return { erro: 'Escolha ao menos um técnico da equipe própria.' };
    execucao = { tipo: 'propria', tecnicos: unicos.map(nome => ({ nome })), por: u?.nome || '', em: agora };
    historico.push(evento('execucao', u, `Equipe própria: ${unicos.join(', ')}`, agora));
  } else if (tipo === 'terceiro') {
    const nome = txt(terceiro_nome, 200);
    if (!nome) return { erro: 'Informe o terceiro que vai executar.' };
    const custo = terceiro_custo === null || terceiro_custo === undefined || terceiro_custo === '' ? null : Number(terceiro_custo);
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) return { erro: 'O custo do terceiro precisa ser um valor em reais, zero ou maior.' };
    execucao = { tipo: 'terceiro', terceiro: { nome, custo_previsto: custo === null ? null : Math.round(custo * 100) / 100 }, por: u?.nome || '', em: agora };
    historico.push(evento('execucao', u, `Terceiro: ${nome}${custo !== null ? ` (custo previsto R$ ${custo.toFixed(2).replace('.', ',')})` : ''}`, agora));
  } else return { erro: 'Escolha quem executa: equipe própria ou terceiro.' };
  return { patch: comEtapa(g, { execucao, historico }) };
}

/** Registra na ficha o pedido que acabou de nascer no Compras. A trava é conferida aqui também (a tela só desliga o botão). */
export function registrarPedidoDePeca(g: any, u: any, { pedido_id, numero_pedido, titulo }: any, agora: string) {
  const erro = preparar(g, u, true); if (erro) return { erro };
  const trava = podePedirPeca(g); if (!trava.ok) return { erro: trava.motivo };
  if (!pedido_id || !numero_pedido) return { erro: 'Faltou o número do pedido de compra.' };
  const pedidos = copiar(g.pedidos_compra) || [];
  if (pedidos.some((p: any) => p.id === pedido_id)) return { erro: 'Este pedido já está registrado na ficha.' };
  pedidos.push({ id: pedido_id, numero: numero_pedido, titulo: txt(titulo, 300), em: agora, por: u?.nome || '' });
  const historico = copiar(g.historico) || [];
  historico.push(evento('peca_pedida', u, `Pedido ${numero_pedido} aberto no Compras`, agora));
  return { patch: { pedidos_compra: pedidos, historico } };
}

export function reabrirGarantia(g: any, u: any, agora: string) {
  if (g.situacao !== 'cancelado') return { erro: 'Só o atendimento cancelado pode ser reaberto.' };
  if (!podeMexerNaGarantia(g, u)) return { erro: 'Só quem abriu, o responsável ou a gerência reabre o atendimento.' };
  const historico = copiar(g.historico) || [];
  historico.push(evento('reaberto', u, null, agora));
  return { patch: { situacao: 'aberto', motivo_cancelamento: null, historico } };
}
