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
  avaliacao: 'Avaliação técnica registrada', fornecedor: 'Fornecedor', execucao: 'Quem executa definido', peca_pedida: 'Peça pedida ao Compras',
  custos: 'Quadro de custos alterado', alinhamento: 'Alinhamento com o cliente', autorizacao_pedida: 'Autorização pedida à direção', autorizacao_aprovada: 'Direção aprovou',
  autorizacao_negada: 'Direção negou', autorizacao_cancelada: 'Pedido de autorização cancelado' };
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
  const fora = bloqueioForaDaGarantia(g);
  if (fora.bloqueado) return { ok: false, motivo: `Atendimento fora da garantia: falta ${fora.faltas.join(' e ')}.` };
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
  const fora = bloqueioForaDaGarantia(g);
  if (fora.bloqueado) return { erro: `Atendimento fora da garantia não segue sem ${fora.faltas.join(' e sem ')}.` };
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

// ── G3 (19/10/2026): custos, alinhamento com o cliente e autorização da direção ──────────────────────────────────────────
// Decisões do usuário em 19/10/2026: a DIREÇÃO é quem tem o perfil Admin; TUDO que é fora da garantia ou cortesia vai para a direção (sem faixa de valor); custos, alinhamento e pedido
// de autorização são registrados pelo responsável pelo atendimento e pela gerência. O atendimento FORA da garantia não segue (quem executa, pedido de peça) sem o alinhamento aceito
// pelo cliente e sem uma autorização aprovada pela direção. Cobertura "a confirmar" não trava, mas a tela avisa.
export const TIPOS_CUSTO: Record<string, string> = { diagnostico: 'Diagnóstico', deslocamento: 'Deslocamento', frete: 'Frete', mao_de_obra: 'Mão de obra', peca: 'Peça', terceiro: 'Terceiro', outro: 'Outro' };
export const PAGADORES_GARANTIA: Record<string, string> = { empresa: 'Nós (empresa)', cliente: 'Cliente', fornecedor: 'Fornecedor' };
export const CANAIS_CLIENTE: Record<string, string> = { telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', presencial: 'Presencial', outro: 'Outro' };
export const ACEITES_CLIENTE: Record<string, string> = { sim: 'O cliente aceitou', nao: 'O cliente não aceitou', aguardando: 'Aguardando o cliente' };
export const TIPOS_AUTORIZACAO: Record<string, string> = { fora_da_garantia: 'Despesa fora da garantia', cortesia: 'Cortesia' };
/** A direção: quem tem o perfil Admin. */
export const ehDirecaoGarantia = (u: any) => ehAdminG(u);

const reais = (v: any) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : NaN);
export const custoConsiderado = (l: any) => (l?.negociado !== null && l?.negociado !== undefined ? Number(l.negociado) : Number(l?.previsto) || 0);
/** Totais do quadro: o previsto, o considerado (o negociado quando há, senão o previsto), o já aprovado e quem paga cada parte. */
export function totaisDeCustos(g: any) {
  const linhas = Array.isArray(g?.custos) ? g.custos : [];
  const soma = (f: (l: any) => number) => Math.round(linhas.reduce((s: number, l: any) => s + f(l), 0) * 100) / 100;
  return {
    previsto: soma(l => Number(l.previsto) || 0),
    considerado: soma(custoConsiderado),
    aprovado: soma(l => (l.aprovado ? custoConsiderado(l) : 0)),
    porPagador: { empresa: soma(l => ((l.pagador || 'empresa') === 'empresa' ? custoConsiderado(l) : 0)), cliente: soma(l => (l.pagador === 'cliente' ? custoConsiderado(l) : 0)), fornecedor: soma(l => (l.pagador === 'fornecedor' ? custoConsiderado(l) : 0)) },
  };
}

export function salvarCustos(g: any, u: any, linhas: any[], agora: string) {
  const erro = preparar(g, u, false); if (erro) return { erro };
  const antes = Array.isArray(g.custos) ? g.custos : [];
  const novas: any[] = [];
  for (const [n, l] of (Array.isArray(linhas) ? linhas : []).entries()) {
    if (!TIPOS_CUSTO[l?.tipo]) return { erro: `Linha ${n + 1}: escolha o tipo do custo.` };
    const previsto = reais(l.previsto);
    if (previsto === null || Number.isNaN(previsto) || previsto < 0) return { erro: `Linha ${n + 1}: informe o valor previsto em reais (zero ou maior).` };
    const negociado = reais(l.negociado);
    if (Number.isNaN(negociado as number) || (negociado !== null && negociado < 0)) return { erro: `Linha ${n + 1}: o valor negociado precisa ser em reais, zero ou maior.` };
    const negociadoPor = txt(l.negociado_por, 200);
    if (negociado !== null && !negociadoPor) return { erro: `Linha ${n + 1}: diga quem negociou o valor.` };
    const pagador = l.pagador || 'empresa';
    if (!PAGADORES_GARANTIA[pagador]) return { erro: `Linha ${n + 1}: escolha quem paga.` };
    const id = txt(l.id, 40) || `c${Date.parse(agora)}${n}`;
    const anterior = antes.find((x: any) => x.id === id);
    const aprovado = !!l.aprovado;
    novas.push({
      id, tipo: l.tipo, descricao: txt(l.descricao, 300), previsto, negociado, negociado_por: negociado === null ? '' : negociadoPor, pagador, origem: anterior?.origem || txt(l.origem, 20) || null,
      aprovado, aprovado_por: aprovado ? (anterior?.aprovado ? anterior.aprovado_por : u?.nome || '') : null, aprovado_em: aprovado ? (anterior?.aprovado ? anterior.aprovado_em : agora) : null,
    });
  }
  if (novas.length > 40) return { erro: 'O quadro aceita até 40 linhas.' };
  // o banco guarda jsonb e devolve as chaves em outra ordem: a comparação não pode depender dela
  const canon = (v: any) => JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.keys(val).sort().reduce((o: any, k) => { o[k] = val[k]; return o; }, {}) : val));
  if (canon(novas) === canon(antes)) return { erro: 'Nada foi alterado no quadro de custos.' };
  const total = totaisDeCustos({ custos: novas });
  const adicionadas = novas.filter(n => !antes.some((a: any) => a.id === n.id)).length;
  const removidas = antes.filter((a: any) => !novas.some(n => n.id === a.id));
  const historico = copiar(g.historico) || [];
  historico.push(evento('custos', u, `${novas.length} linha(s), considerado R$ ${total.considerado.toFixed(2).replace('.', ',')}${adicionadas ? `; ${adicionadas} nova(s)` : ''}${removidas.length ? `; tirou: ${removidas.map((r: any) => `${TIPOS_CUSTO[r.tipo]}${r.descricao ? ' ' + r.descricao : ''}`).join(', ')}` : ''}`, agora));
  return { patch: { custos: novas, historico } };
}

/** O custo previsto do terceiro (G2) entra no quadro com um clique; só uma vez. */
export function lancarCustoDoTerceiro(g: any, u: any, agora: string) {
  const erro = preparar(g, u, false); if (erro) return { erro };
  const t = g?.execucao?.terceiro;
  if (g?.execucao?.tipo !== 'terceiro' || t?.custo_previsto === null || t?.custo_previsto === undefined) return { erro: 'Não há custo previsto de terceiro para lançar.' };
  if ((g.custos || []).some((l: any) => l.origem === 'execucao')) return { erro: 'O custo do terceiro já está no quadro.' };
  return salvarCustos(g, u, [...(g.custos || []), { id: '', tipo: 'terceiro', descricao: t.nome, previsto: t.custo_previsto, negociado: null, pagador: 'empresa', aprovado: false, origem: 'execucao' }], agora);
}

export const alinhamentoAtual = (g: any) => { const l = Array.isArray(g?.alinhamentos) ? g.alinhamentos : []; return l.length ? l[l.length - 1] : null; };
/** Só se acrescenta (o que o cliente disse em cada contato fica guardado); vale o último. */
export function registrarAlinhamento(g: any, u: any, c: any, agora: string, hoje: string) {
  const erro = preparar(g, u, false); if (erro) return { erro };
  const quem = txt(c?.quem_falou, 200), combinado = txt(c?.combinado);
  if (!quem) return { erro: 'Diga com quem do cliente se falou.' };
  if (!diaOk(c?.quando)) return { erro: 'Informe o dia da conversa.' };
  if (String(c.quando) > hoje) return { erro: 'O dia da conversa não pode ser no futuro.' };
  if (!CANAIS_CLIENTE[c?.canal]) return { erro: 'Escolha por onde foi a conversa.' };
  if (!combinado) return { erro: 'Escreva o que ficou combinado.' };
  if (!ACEITES_CLIENTE[c?.aceitou]) return { erro: 'Diga se o cliente aceitou, não aceitou ou se ainda aguarda.' };
  const lista = copiar(g.alinhamentos) || [];
  lista.push({ id: `a${Date.parse(agora)}${lista.length}`, quem_falou: quem, quando: c.quando, canal: c.canal, combinado, aceitou: c.aceitou, por: u?.nome || '', em: agora });
  const historico = copiar(g.historico) || [];
  historico.push(evento('alinhamento', u, `${ACEITES_CLIENTE[c.aceitou]} (${CANAIS_CLIENTE[c.canal]}, com ${quem})`, agora));
  return { patch: { alinhamentos: lista, historico } };
}

/** Atendimento fora da garantia: o que falta para seguir. */
export function bloqueioForaDaGarantia(g: any): { bloqueado: boolean; faltas: string[] } {
  if (g?.avaliacao?.cobertura !== 'fora') return { bloqueado: false, faltas: [] };
  const faltas: string[] = [];
  if (alinhamentoAtual(g)?.aceitou !== 'sim') faltas.push('o alinhamento com o cliente, aceito por ele');
  if (!(Array.isArray(g.autorizacoes) ? g.autorizacoes : []).some((a: any) => a.status === 'aprovada')) faltas.push('a autorização da direção');
  return { bloqueado: faltas.length > 0, faltas };
}

export function pedirAutorizacao(g: any, u: any, { tipo, valor, motivo }: any, agora: string) {
  const erro = preparar(g, u, false); if (erro) return { erro };
  if (!TIPOS_AUTORIZACAO[tipo]) return { erro: 'Escolha o que está sendo pedido: despesa fora da garantia ou cortesia.' };
  const v = reais(valor);
  if (v === null || Number.isNaN(v) || v < 0) return { erro: 'Informe o valor da despesa em reais (zero ou maior).' };
  const m = txt(motivo);
  if (!m) return { erro: 'Escreva o motivo do pedido.' };
  const lista = copiar(g.autorizacoes) || [];
  if (lista.some((a: any) => a.status === 'pedida')) return { erro: 'Já há um pedido de autorização esperando a direção.' };
  lista.push({ id: `z${Date.parse(agora)}${lista.length}`, tipo, valor: v, motivo: m, status: 'pedida', pedida_por: u?.nome || '', pedida_em: agora, decisao: null });
  const historico = copiar(g.historico) || [];
  historico.push(evento('autorizacao_pedida', u, `${TIPOS_AUTORIZACAO[tipo]}, R$ ${v.toFixed(2).replace('.', ',')}`, agora));
  return { patch: { autorizacoes: lista, historico } };
}

/** Só a direção decide. decisao: 'aprovou' | 'negou' (texto obrigatório). */
export function decidirAutorizacao(g: any, id: string, u: any, { decisao, texto }: any, agora: string) {
  if (g?.situacao !== 'aberto') return { erro: 'Só o atendimento aberto recebe decisão.' };
  if (!ehDirecaoGarantia(u)) return { erro: 'Só a direção (perfil Admin) decide a autorização.' };
  const lista = copiar(g.autorizacoes) || [];
  const a = lista.find((x: any) => x.id === id);
  if (!a) return { erro: 'Não foi possível achar o pedido: a ficha mudou. A tela foi atualizada.' };
  if (a.status !== 'pedida') return { erro: 'Este pedido já foi decidido ou cancelado. A tela foi atualizada.' };
  if (!['aprovou', 'negou'].includes(decisao)) return { erro: 'Escolha: aprovar ou negar.' };
  const t = txt(texto);
  if (decisao === 'negou' && !t) return { erro: 'Escreva por que foi negado.' };
  a.status = decisao === 'aprovou' ? 'aprovada' : 'negada';
  a.decisao = { por: u?.nome || '', em: agora, texto: t || null };
  const historico = copiar(g.historico) || [];
  historico.push(evento(decisao === 'aprovou' ? 'autorizacao_aprovada' : 'autorizacao_negada', u, `${TIPOS_AUTORIZACAO[a.tipo]}, R$ ${Number(a.valor).toFixed(2).replace('.', ',')}${t ? ` — ${t}` : ''}`, agora));
  return { patch: { autorizacoes: lista, historico } };
}

export function cancelarAutorizacao(g: any, id: string, u: any, motivo: string, agora: string) {
  if (g?.situacao !== 'aberto') return { erro: 'Só o atendimento aberto recebe registros.' };
  const lista = copiar(g.autorizacoes) || [];
  const a = lista.find((x: any) => x.id === id);
  if (!a) return { erro: 'Não foi possível achar o pedido: a ficha mudou. A tela foi atualizada.' };
  if (a.status !== 'pedida') return { erro: 'Só o pedido que espera a direção pode ser cancelado.' };
  if (!(podeConduzirGarantia(g, u) || mesmoEmailG(a.pedida_por, u?.nome))) return { erro: 'Só o responsável, a gerência ou quem pediu cancela o pedido.' };
  const t = txt(motivo);
  if (!t) return { erro: 'Escreva o motivo do cancelamento.' };
  a.status = 'cancelada'; a.cancelada_motivo = t;
  const historico = copiar(g.historico) || [];
  historico.push(evento('autorizacao_cancelada', u, t, agora));
  return { patch: { autorizacoes: lista, historico } };
}
const mesmoEmailG = (a: any, b: any) => semAcento(a) !== '' && semAcento(a) === semAcento(b);

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
