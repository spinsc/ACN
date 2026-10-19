// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO DE PRODUTO NA ENGENHARIA — o modelo (D1 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// Pedido do usuário em 19/10/2026: as 8 etapas eram iguais; cada uma passa a ter o que precisa ENTREGAR e uma PORTA de decisão ao fim
// (ideia do Stage-Gate; o PLM chama de revisão e liberação). Decisões do usuário no mesmo dia:
//   • quem decide nas portas: o SOLICITANTE e o GERENTE (Admin ou qualquer perfil "Gerente ..."); na Validação, também a QUALIDADE, na pessoa que a
//     Engenharia indica ao iniciar a etapa (só nos tipos "produto novo" e "adaptação");
//   • o SOLICITANTE é quem criou a demanda, mas pode ser outro (campo na janela de nova demanda); Admin pode aprovar no lugar de qualquer papel e fica registrado;
//   • o TIPO de desenvolvimento decide quais entregáveis são obrigatórios, para não engessar o que é simples.
//
// Este arquivo só tem regra, sem tela e sem banco: cada operação recebe a demanda COMO ESTÁ AGORA NO BANCO e devolve { erro } ou { patch } (as colunas a gravar),
// para a tela gravar tudo num único UPDATE (as etapas e o histórico nunca ficam pela metade). A tela (DesenvolvimentoPorta.tsx) é quem lê e grava.
//
// Demanda sem tipo (tipo_desenvolvimento nulo) = as que já existiam antes da D1: seguem no modelo antigo (concluir etapa com um clique), sem portas, até alguém escolher o tipo.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_DEV = [
  { id: 'produto_novo', rotulo: 'Produto novo', ajuda: 'Tudo do processo: requisitos, conceitos, riscos, protótipos, testes e liberação.' },
  { id: 'adaptacao', rotulo: 'Adaptação de produto existente', ajuda: 'Parte de algo que já existe: sem a escolha entre conceitos; testa o que mudou.' },
  { id: 'melhoria', rotulo: 'Melhoria / correção', ajuda: 'Ajuste pontual: desenho com revisão e teste do ponto alterado.' },
  { id: 'peca_avulsa', rotulo: 'Peça avulsa (sob encomenda)', ajuda: 'Uma peça só: briefing, desenho, primeira unidade conferida e entrega.' },
];
export const rotuloDoTipoDev = (id: string) => TIPOS_DEV.find(t => t.id === id)?.rotulo || (id === 'a_definir' ? 'A definir' : '—');

// o = obrigatório, p = opcional, - = não se aplica; as 4 letras seguem a ordem: produto novo, adaptação, melhoria, peça avulsa
const COLUNAS = ['produto_novo', 'adaptacao', 'melhoria', 'peca_avulsa'];
const CATALOGO: Record<string, [string, string, string, string][]> = {
  'Concepção': [
    ['briefing', 'Briefing', 'O problema a resolver, quem pediu e a OP ou o veículo de aplicação.', 'oooo'],
    ['requisitos', 'Requisitos com prioridade', 'O que o produto precisa fazer, separando o obrigatório do desejável.', 'oop-'],
    ['normas', 'Normas aplicáveis', 'Normas e exigências legais que valem para este produto (quem conhece o assunto preenche).', 'pp--'],
    ['meta_custo', 'Meta de custo e prazo', 'Quanto o produto pode custar e até quando precisa estar pronto.', 'oop-'],
    ['similares', 'Similares pesquisados', 'Produtos parecidos no mercado ou que já foram feitos aqui.', 'p---'],
  ],
  'Criação': [
    ['conceitos', 'Conceitos alternativos e escolha', '2 ou 3 caminhos com prós e contras, e a nota de cada um nos critérios que importam.', 'o---'],
    ['croqui', 'Croqui ou render', 'O desenho de ideia do produto, antes do projeto detalhado.', 'pop-'],
    ['conceito_escolhido', 'Conceito escolhido', 'Qual caminho seguiu e por quê.', 'oo--'],
  ],
  'Desenvolvimento': [
    ['desenhos', 'Desenhos com revisão', 'Os desenhos do projeto, identificados pela revisão (Rev A, B…).', 'oooo'],
    ['bom_prelim', 'Lista de materiais preliminar e custo estimado', 'O que leva e quanto deve custar, para comparar com a meta.', 'oop-'],
    ['riscos', 'Lista de riscos', 'O que pode dar errado, o tamanho do problema e o que fazer a respeito.', 'pp--'],
    ['revisao_projeto', 'Revisão de projeto', 'Reunião de análise do projeto com Produção, Compras e Qualidade.', 'op--'],
  ],
  'Prototipagem': [
    ['prototipos', 'Registro dos protótipos', 'Cada protótipo: número, revisão do desenho usada, material, horas gastas e fotos.', 'oop-'],
    ['problemas', 'Problemas encontrados e ações', 'O que deu errado no protótipo e o que mudou no desenho por causa disso.', 'ppp-'],
  ],
  'Validação': [
    ['plano_testes', 'Plano de testes ligado aos requisitos', 'Para cada requisito: o teste, o critério para passar, o resultado e a evidência.', 'ooo-'],
    ['teste_instalacao', 'Teste de instalação em veículo', 'O produto instalado no veículo de verdade, com fotos e anotações.', 'ppp-'],
    ['conferencia_normas', 'Conferência das normas', 'O produto conferido contra as normas listadas na Concepção.', 'pp--'],
  ],
  'Produção': [
    ['item_catalogo', 'Item no catálogo e estrutura de instalação', 'O item cadastrado (ou vinculado) no catálogo e a estrutura do veículo pronta.', 'oopp'],
    ['instrucao_montagem', 'Instrução de montagem', 'Como a Produção monta, passo a passo.', 'ppp-'],
    ['primeira_unidade', 'Primeira unidade conferida', 'A primeira unidade feita pela Produção, conferida contra o desenho.', 'oooo'],
    ['custo_real', 'Custo real × meta', 'O que custou de verdade comparado com a meta da Concepção.', 'pp--'],
  ],
  'Acabamento': [
    ['padrao_acabamento', 'Padrão de acabamento, identificação, embalagem e manual', 'Como o produto sai: pintura, etiqueta, caixa e manual.', 'oopp'],
    ['amostra', 'Amostra aprovada', 'Uma unidade acabada que serve de referência.', 'oopp'],
  ],
  'Entrega': [
    ['pacote_tecnico', 'Pacote técnico final', 'Desenho final, lista de materiais e manual, para guardar e repassar.', 'oop-'],
    ['licoes', 'Lições aprendidas', 'O que funcionou e o que faria diferente da próxima vez.', 'pp--'],
  ],
};

export const ROTULO_PAPEL: Record<string, string> = { solicitante: 'Solicitante', gerente: 'Gerente', qualidade: 'Qualidade' };

export const modeloGuiado = (d: any) => !!d?.tipo_desenvolvimento && d.tipo_desenvolvimento !== 'a_definir';

/** Os entregáveis da etapa para o tipo (só os que se aplicam), com a marca de obrigatório. */
export function entregaveisDaEtapa(nomeEtapa: string, tipo: string) {
  const col = COLUNAS.indexOf(tipo);
  if (col < 0) return [];
  return (CATALOGO[nomeEtapa] || [])
    .filter(([, , , marca]) => marca[col] !== '-')
    .map(([id, nome, ajuda, marca]) => ({ id, nome, ajuda, obrigatorio: marca[col] === 'o' }));
}

/** Quem precisa aprovar a porta da etapa. */
export function papeisExigidos(nomeEtapa: string, tipo: string): string[] {
  const papeis = ['solicitante', 'gerente'];
  if (nomeEtapa === 'Validação' && (tipo === 'produto_novo' || tipo === 'adaptacao')) papeis.push('qualidade');
  return papeis;
}

// ── quem é quem ────────────────────────────────────────────────────────────────────────────────────
const semAcento = (t: any) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const mesmoNome = (a: any, b: any) => !!semAcento(a) && semAcento(a) === semAcento(b);
export const ehAdminDev = (u: any) => String(u?.perfil || '').trim() === 'Admin';
export const ehGerenteDev = (u: any) => ehAdminDev(u) || /^gerente/i.test(String(u?.perfil || '').trim());

export function solicitanteDaDemanda(d: any) {
  return { nome: d.solicitante_nome || d.criado_por_nome || '', email: d.solicitante_email || d.criado_por || '' };
}
const ehOSolicitante = (d: any, u: any) => {
  const s = solicitanteDaDemanda(d);
  return (!!s.email && !!u?.email && String(s.email).toLowerCase() === String(u.email).toLowerCase()) || mesmoNome(s.nome, u?.nome);
};

/** Dos papéis que a porta exige, os que esta pessoa pode preencher (Admin preenche qualquer um, e fica registrado). */
export function papeisQueOUsuarioCobre(d: any, etapa: any, u: any): string[] {
  const exigidos = papeisExigidos(etapa.nome, d.tipo_desenvolvimento);
  return exigidos.filter(p => {
    if (ehAdminDev(u)) return true;
    if (p === 'gerente') return ehGerenteDev(u);
    if (p === 'solicitante') return ehOSolicitante(d, u);
    if (p === 'qualidade') return mesmoNome(etapa.qualidade_nome, u?.nome);
    return false;
  });
}

// ── estado de uma etapa ────────────────────────────────────────────────────────────────────────────
export const entregavelFeito = (etapa: any, id: string) => !!etapa?.entregaveis?.[id]?.feito;

export function entregaveisQueFaltam(d: any, etapa: any) {
  return entregaveisDaEtapa(etapa.nome, d.tipo_desenvolvimento).filter(e => e.obrigatorio && !entregavelFeito(etapa, e.id));
}

export function estadoDaPorta(d: any, etapa: any) {
  const exigidos = papeisExigidos(etapa.nome, d.tipo_desenvolvimento);
  const porta = etapa.porta || {};
  const decisoes = porta.pedida_em ? (porta.decisoes || []) : [];
  const aprovados = new Set(decisoes.flatMap((x: any) => x.papeis || []));
  return {
    pedida: !!porta.pedida_em, pedidaEm: porta.pedida_em || null, pedidaPor: porta.pedida_por || '',
    exigidos, decisoes, faltam: exigidos.filter(p => !aprovados.has(p)),
    ressalvas: porta.ressalvas || [],
  };
}

// ── operações (puras: recebem a demanda lida agora, devolvem { erro } ou { patch }) ─────────────────
const copiar = (v: any) => JSON.parse(JSON.stringify(v ?? null));
const evento = (tipo: string, etapa: string | null, u: any, texto: string | null, agora: string) => ({ em: agora, por: u?.nome || '', tipo, etapa, texto: texto || null });
const idxAtiva = (etapas: any[]) => etapas.findIndex(e => e.status !== 'concluida');
const naoAtiva = (d: any) => d.situacao === 'pausada' ? 'A demanda está pausada. Peça a um gerente para retomar.' : d.situacao === 'cancelada' ? 'A demanda foi cancelada.' : '';

function preparar(d: any, idx: number, exigeGuiado = true) {
  if (exigeGuiado && !modeloGuiado(d)) return { erro: 'Defina primeiro o tipo de desenvolvimento desta demanda.' };
  const parada = naoAtiva(d);
  if (parada) return { erro: parada };
  const etapas = copiar(d.etapas) || [];
  const etapa = etapas[idx];
  if (!etapa) return { erro: 'Não foi possível achar a etapa: a demanda mudou. A tela foi atualizada.' };
  const historico = copiar(d.historico) || [];
  return { etapas, etapa, historico };
}

export function definirTipo(d: any, tipo: string, u: any, agora: string) {
  if (!TIPOS_DEV.some(t => t.id === tipo)) return { erro: 'Escolha o tipo de desenvolvimento.' };
  if (d.situacao === 'cancelada') return { erro: 'A demanda foi cancelada.' };
  const concepcao = (d.etapas || [])[0];
  if (modeloGuiado(d) && concepcao?.porta?.concluida_em && !ehGerenteDev(u)) return { erro: 'Depois que a Concepção é aprovada, só Admin ou gerente muda o tipo.' };
  if (d.tipo_desenvolvimento === tipo) return { erro: 'Esta demanda já é desse tipo.' };
  const historico = copiar(d.historico) || [];
  historico.push(evento('tipo', null, u, `Tipo definido: ${rotuloDoTipoDev(tipo)}${d.tipo_desenvolvimento && d.tipo_desenvolvimento !== 'a_definir' ? ` (era ${rotuloDoTipoDev(d.tipo_desenvolvimento)})` : ''}`, agora));
  return { patch: { tipo_desenvolvimento: tipo, historico } };
}

export function iniciarEtapa(d: any, idx: number, u: any, { responsavel, data_prevista, qualidade_nome }: any, agora: string) {
  const p = preparar(d, idx); if (p.erro) return p;
  const { etapas, etapa, historico } = p;
  if (etapa.status !== 'pendente') return { erro: 'Esta etapa já foi iniciada por outra pessoa. A tela foi atualizada.' };
  if (idx !== idxAtiva(etapas)) return { erro: 'Não foi possível iniciar: há uma etapa anterior em aberto.' };
  if (!String(responsavel || '').trim()) return { erro: 'Informe o responsável.' };
  if (papeisExigidos(etapa.nome, d.tipo_desenvolvimento).includes('qualidade') && !String(qualidade_nome || '').trim()) return { erro: 'Indique a pessoa da Qualidade que dará o parecer desta etapa.' };
  etapa.status = 'em_andamento';
  etapa.responsavel = String(responsavel).trim();
  etapa.data_prevista = data_prevista || null;
  etapa.data_inicio = agora;
  if (papeisExigidos(etapa.nome, d.tipo_desenvolvimento).includes('qualidade')) etapa.qualidade_nome = String(qualidade_nome).trim();
  historico.push(evento('etapa_iniciada', etapa.nome, u, `Responsável: ${etapa.responsavel}`, agora));
  return { patch: { etapas, historico } };
}

export function observarEtapa(d: any, idx: number, u: any, texto: string, agora: string) {
  const p = preparar(d, idx, false); if (p.erro) return p;
  const { etapas, etapa } = p;
  if (!String(texto || '').trim()) return { erro: 'Escreva a observação.' };
  etapa.observacoes = [...(etapa.observacoes || []), { texto: String(texto).trim(), usuario: u?.nome || '', hora: agora }];
  return { patch: { etapas } };
}

/** Mexe em UM entregável (feito, nota, anexos). Fechado enquanto a porta espera decisão: mudar depois do pedido invalidaria quem já olhou. */
export function atualizarEntregavel(d: any, idx: number, id: string, u: any, agora: string, mudar: (e: any) => string | void) {
  const p = preparar(d, idx); if (p.erro) return p;
  const { etapas, etapa } = p;
  if (etapa.status !== 'em_andamento') return { erro: 'A etapa não está em andamento.' };
  if (etapa.porta?.pedida_em) return { erro: 'A etapa está esperando a decisão da porta. Retire o pedido para mexer nos entregáveis.' };
  if (!entregaveisDaEtapa(etapa.nome, d.tipo_desenvolvimento).some(e => e.id === id)) return { erro: 'Este entregável não existe para o tipo desta demanda.' };
  etapa.entregaveis = etapa.entregaveis || {};
  const ent = { feito: false, feito_por: null, feito_em: null, anexos: [], nota: '', ...(etapa.entregaveis[id] || {}) };
  const motivo = mudar(ent, etapa);
  if (motivo) return { erro: motivo };
  etapa.entregaveis[id] = ent;
  return { patch: { etapas } };
}
export const marcarFeito = (d: any, idx: number, id: string, feito: boolean, u: any, agora: string) =>
  atualizarEntregavel(d, idx, id, u, agora, e => {
    // D2: o entregável que tem formulário só vale como feito com o formulário preenchido
    if (feito && temFormulario(id)) {
      const falta = faltaNoEntregavel(id, e.dados, d);
      if (falta.length) return `Falta preencher: ${falta.join('; ')}.`;
    }
    e.feito = !!feito; e.feito_por = feito ? (u?.nome || '') : null; e.feito_em = feito ? agora : null;
  });

// ── entregáveis com formulário próprio (D2, 19/10/2026): Concepção e Criação ────────────────────────────────────
// O conteúdo fica em `etapa.entregaveis[id].dados`. Marcar como feito exige o formulário completo; editar um formulário já "feito" que deixe de estar completo desmarca o "feito".
export const ENTREGAVEIS_COM_FORMULARIO = ['briefing', 'requisitos', 'normas', 'similares', 'meta_custo', 'conceitos', 'conceito_escolhido'];
export const temFormulario = (id: string) => ENTREGAVEIS_COM_FORMULARIO.includes(id);
export const PRIORIDADES: Record<string, string> = { obrigatorio: 'Obrigatório', desejavel: 'Desejável' };
// critérios de partida da matriz (nome, peso de 1 a 5); a Engenharia troca, tira e acrescenta
export const CRITERIOS_SUGERIDOS: [string, number][] = [['Custo', 5], ['Desempenho', 5], ['Segurança e normas', 5], ['Facilidade de fabricar', 4], ['Prazo de fabricação', 3]];
export const NOTA_MAXIMA = 5;
const LIMITES = { itens: 60, conceitos: 8, criterios: 12, texto: 600, nome: 100 };

/** Pontos de cada conceito (soma de peso × nota) e o máximo possível, do maior para o menor. */
export function ranking(dados: any) {
  const criterios = dados?.criterios || [];
  const maximo = criterios.reduce((s: number, c: any) => s + c.peso * NOTA_MAXIMA, 0);
  return (dados?.conceitos || [])
    .map((c: any) => ({ id: c.id, nome: c.nome, pontos: criterios.reduce((s: number, k: any) => s + k.peso * (Number(c.notas?.[k.id]) || 0), 0), maximo }))
    .sort((a: any, b: any) => b.pontos - a.pontos);
}

const conceitosSeAplicam = (tipo: string) => entregaveisDaEtapa('Criação', tipo).some(e => e.id === 'conceitos');
export function dadosDoEntregavel(d: any, id: string) {
  for (const e of d?.etapas || []) if (e.entregaveis?.[id]?.dados) return e.entregaveis[id].dados;
  return null;
}

/** O que ainda falta preencher para o formulário valer como feito (lista vazia = completo). */
export function faltaNoEntregavel(id: string, dados: any, d: any): string[] {
  const x = dados || {};
  const falta: string[] = [];
  if (id === 'briefing') { if (!String(x.problema || '').trim()) falta.push('o problema a resolver'); }
  else if (id === 'requisitos') {
    const itens = x.itens || [];
    if (!itens.length) falta.push('ao menos um requisito');
    else if (!itens.some((i: any) => i.prioridade === 'obrigatorio')) falta.push('ao menos um requisito obrigatório');
  } else if (id === 'normas' || id === 'similares') {
    if (!(x.itens || []).length && !x.nenhum) falta.push(id === 'normas' ? 'as normas, ou marcar que nenhuma se aplica' : 'os similares, ou marcar que não achou nenhum');
  } else if (id === 'meta_custo') {
    if (!(Number(x.custo_alvo) > 0)) falta.push('o custo alvo');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.prazo || ''))) falta.push('o prazo');
  } else if (id === 'conceitos') {
    const conceitos = x.conceitos || [], criterios = x.criterios || [];
    if (conceitos.length < 2) falta.push('ao menos 2 conceitos');
    if (!criterios.length) falta.push('ao menos 1 critério');
    if (conceitos.length && criterios.length && conceitos.some((c: any) => criterios.some((k: any) => c.notas?.[k.id] === undefined || c.notas?.[k.id] === null))) falta.push('a nota de cada conceito em cada critério');
  } else if (id === 'conceito_escolhido') {
    if (conceitosSeAplicam(d?.tipo_desenvolvimento)) {
      const lista = dadosDoEntregavel(d, 'conceitos')?.conceitos || [];
      if (!x.conceito_id || !lista.some((c: any) => c.id === x.conceito_id)) falta.push('o conceito escolhido');
    } else if (!String(x.nome || '').trim()) falta.push('o nome do conceito escolhido');
    if (!String(x.justificativa || '').trim()) falta.push('por que esse caminho');
  }
  return falta;
}

const txt = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
const dentro = (n: any, min: number, max: number) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null; };

/** Limpa o que veio da tela: corta texto, limita quantidades, descarta linha vazia e nota fora de 0 a 5. */
export function limparDados(id: string, dados: any) {
  const x = dados || {};
  const lista = (v: any, max: number) => (Array.isArray(v) ? v : []).slice(0, max);
  if (id === 'briefing') return { problema: txt(x.problema, 2000), aplicacao: txt(x.aplicacao, LIMITES.texto), pedido_por: txt(x.pedido_por, LIMITES.nome) };
  if (id === 'requisitos') return { itens: lista(x.itens, LIMITES.itens).map((i: any) => ({ id: txt(i.id, 20), texto: txt(i.texto, LIMITES.texto), prioridade: i.prioridade === 'desejavel' ? 'desejavel' : 'obrigatorio' })).filter((i: any) => i.texto) };
  if (id === 'normas' || id === 'similares') return { nenhum: !!x.nenhum, itens: lista(x.itens, LIMITES.itens).map((i: any) => ({ id: txt(i.id, 20), texto: txt(i.texto, LIMITES.texto), ...(id === 'similares' ? { link: txt(i.link, 300) } : {}) })).filter((i: any) => i.texto) };
  if (id === 'meta_custo') { const c = Number(x.custo_alvo); return { custo_alvo: Number.isFinite(c) && c > 0 ? Math.round(c * 100) / 100 : null, prazo: /^\d{4}-\d{2}-\d{2}$/.test(String(x.prazo || '')) ? x.prazo : '', quantidade: dentro(x.quantidade, 1, 1000000) }; }
  if (id === 'conceitos') {
    const criterios = lista(x.criterios, LIMITES.criterios).map((k: any) => ({ id: txt(k.id, 20), nome: txt(k.nome, LIMITES.nome), peso: dentro(k.peso, 1, 5) ?? 3 })).filter((k: any) => k.nome);
    const conceitos = lista(x.conceitos, LIMITES.conceitos).map((c: any) => {
      const notas: Record<string, number> = {};
      criterios.forEach((k: any) => { const n = c.notas?.[k.id]; if (n !== undefined && n !== null && n !== '') { const v = dentro(n, 0, NOTA_MAXIMA); if (v !== null) notas[k.id] = v; } });
      return { id: txt(c.id, 20), nome: txt(c.nome, LIMITES.nome), descricao: txt(c.descricao, LIMITES.texto), notas };
    }).filter((c: any) => c.nome);
    return { criterios, conceitos };
  }
  if (id === 'conceito_escolhido') return { conceito_id: txt(x.conceito_id, 20) || null, nome: txt(x.nome, LIMITES.nome), justificativa: txt(x.justificativa, 2000) };
  return {};
}

export function salvarDados(d: any, idx: number, id: string, dados: any, u: any, agora: string) {
  if (!temFormulario(id)) return { erro: 'Este entregável não tem formulário.' };
  const limpo = limparDados(id, dados);
  return atualizarEntregavel(d, idx, id, u, agora, (e, etapa) => {
    e.dados = limpo;
    if (id === 'conceitos') {
      // trocar os conceitos pode apagar o que já tinha sido escolhido: a escolha volta a ficar em aberto, em vez de apontar para um conceito que não existe mais
      const esc = etapa.entregaveis?.conceito_escolhido;
      if (esc?.dados?.conceito_id && !limpo.conceitos.some((c: any) => c.id === esc.dados.conceito_id)) {
        esc.dados = { ...esc.dados, conceito_id: null };
        if (esc.feito) { esc.feito = false; esc.feito_por = null; esc.feito_em = null; }
      }
    }
    // formulário "feito" que deixou de estar completo volta a não-feito
    const copiaD = { ...d, etapas: d.etapas.map((et: any, i: number) => (i === idx ? { ...et, entregaveis: { ...(et.entregaveis || {}), [id]: { ...e } } } : et)) };
    if (e.feito && faltaNoEntregavel(id, limpo, copiaD).length) { e.feito = false; e.feito_por = null; e.feito_em = null; }
  });
}

export function pedirPorta(d: any, idx: number, u: any, agora: string) {
  const p = preparar(d, idx); if (p.erro) return p;
  const { etapas, etapa, historico } = p;
  if (etapa.status !== 'em_andamento') return { erro: 'A etapa não está em andamento.' };
  if (etapa.porta?.pedida_em) return { erro: 'A decisão da porta já foi pedida.' };
  const faltas = entregaveisQueFaltam(d, etapa);
  if (faltas.length) return { erro: `Faltam entregáveis obrigatórios: ${faltas.map(f => f.nome).join('; ')}.` };
  etapa.porta = { ...(etapa.porta || {}), pedida_em: agora, pedida_por: u?.nome || '', decisoes: [], ressalvas: etapa.porta?.ressalvas || [], anteriores: etapa.porta?.anteriores || [] };
  historico.push(evento('porta_pedida', etapa.nome, u, null, agora));
  return { patch: { etapas, historico } };
}

export function retirarPedido(d: any, idx: number, u: any, agora: string) {
  const p = preparar(d, idx); if (p.erro) return p;
  const { etapas, etapa, historico } = p;
  if (!etapa.porta?.pedida_em) return { erro: 'Não há pedido de decisão nesta etapa.' };
  if ((etapa.porta.decisoes || []).length) return { erro: 'Já há decisão registrada. Quem decidiu pode devolver a etapa para ajustes.' };
  etapa.porta = { ...etapa.porta, pedida_em: null, pedida_por: null, decisoes: [] };
  historico.push(evento('porta_retirada', etapa.nome, u, null, agora));
  return { patch: { etapas, historico } };
}

/** decisao: 'aprovou' | 'ressalva' (texto obrigatório) | 'devolveu' (texto obrigatório; a etapa volta a ser trabalhada) */
export function decidirPorta(d: any, idx: number, u: any, { decisao, texto }: any, agora: string) {
  const p = preparar(d, idx); if (p.erro) return p;
  const { etapas, etapa, historico } = p;
  if (!etapa.porta?.pedida_em) return { erro: 'A decisão da porta ainda não foi pedida (ou já foi encerrada). A tela foi atualizada.' };
  if (!['aprovou', 'ressalva', 'devolveu'].includes(decisao)) return { erro: 'Escolha uma decisão.' };
  if (decisao !== 'aprovou' && !String(texto || '').trim()) return { erro: decisao === 'ressalva' ? 'Escreva a ressalva.' : 'Escreva o que precisa ser ajustado.' };
  const estado = estadoDaPorta(d, etapa);
  const meus = papeisQueOUsuarioCobre(d, etapa, u).filter(papel => estado.faltam.includes(papel));
  if (!meus.length) return { erro: estado.faltam.length ? 'Você não pode decidir esta porta (ou já decidiu).' : 'Esta porta já está aprovada.' };
  const txt = String(texto || '').trim();

  if (decisao === 'devolveu') {
    const porta = etapa.porta;
    etapa.porta = { ...porta, anteriores: [...(porta.anteriores || []), { pedida_em: porta.pedida_em, pedida_por: porta.pedida_por, encerrada_em: agora, devolvida_por: u?.nome || '', motivo: txt, decisoes: porta.decisoes || [] }], pedida_em: null, pedida_por: null, decisoes: [] };
    historico.push(evento('devolveu', etapa.nome, u, txt, agora));
    return { patch: { etapas, historico } };
  }

  // Admin preenchendo um papel que não é dele (nem do cargo): fica dito de quem era o lugar
  const noLugarDe = ehAdminDev(u) ? meus.filter(papel => (papel === 'solicitante' && !ehOSolicitante(d, u)) || (papel === 'qualidade' && !mesmoNome(etapa.qualidade_nome, u?.nome))) : [];
  etapa.porta.decisoes = [...(etapa.porta.decisoes || []), { papeis: meus, por: u?.nome || '', por_email: u?.email || '', em: agora, decisao, texto: txt || null, ...(noLugarDe.length ? { no_lugar_de: noLugarDe } : {}) }];
  if (decisao === 'ressalva') {
    etapa.porta.ressalvas = [...(etapa.porta.ressalvas || []), { id: `r${Date.parse(agora)}${(etapa.porta.ressalvas || []).length}`, texto: txt, por: u?.nome || '', em: agora, papeis: meus, resolvida_em: null, resolvida_por: null }];
  }
  historico.push(evento(decisao === 'ressalva' ? 'ressalva' : 'aprovou', etapa.nome, u, [meus.map(m => ROTULO_PAPEL[m]).join(' e '), txt].filter(Boolean).join(' — '), agora));
  // `d` ainda não tem a decisão nova: o que falta é recalculado na etapa copiada
  const aindaFaltam = papeisExigidos(etapa.nome, d.tipo_desenvolvimento).filter(papel => !(etapa.porta.decisoes || []).some((x: any) => (x.papeis || []).includes(papel)));
  if (!aindaFaltam.length) {
    etapa.status = 'concluida';
    etapa.data_conclusao = agora;
    etapa.porta.concluida_em = agora;
    const abertas = (etapa.porta.ressalvas || []).filter((r: any) => !r.resolvida_em).length;
    historico.push(evento('etapa_concluida', etapa.nome, u, abertas ? `${abertas} ressalva(s) em aberto` : null, agora));
  }
  return { patch: { etapas, historico }, concluiu: !aindaFaltam.length };
}

export function resolverRessalva(d: any, idx: number, idRessalva: string, u: any, agora: string) {
  const p = preparar(d, idx, false); if (p.erro && !/pausada|cancelada/.test(p.erro)) return p;
  const etapas = copiar(d.etapas) || [];
  const etapa = etapas[idx];
  const r = (etapa?.porta?.ressalvas || []).find((x: any) => x.id === idRessalva);
  if (!r) return { erro: 'Não foi possível achar a ressalva: a demanda mudou. A tela foi atualizada.' };
  if (r.resolvida_em) return { erro: 'Esta ressalva já foi resolvida.' };
  r.resolvida_em = agora; r.resolvida_por = u?.nome || '';
  const historico = copiar(d.historico) || [];
  historico.push(evento('ressalva_resolvida', etapa.nome, u, r.texto, agora));
  return { patch: { etapas, historico } };
}

// ── decisões só do gerente: voltar etapa, pausar, retomar, cancelar, reabrir ───────────────────────
const soGerente = (u: any) => ehGerenteDev(u) ? '' : 'Só Admin ou gerente pode fazer isso.';

export function voltarEtapa(d: any, u: any, motivo: string, agora: string) {
  if (soGerente(u)) return { erro: soGerente(u) };
  if (!modeloGuiado(d)) return { erro: 'Defina primeiro o tipo de desenvolvimento desta demanda.' };
  const parada = naoAtiva(d); if (parada) return { erro: parada };
  if (!String(motivo || '').trim()) return { erro: 'Escreva o motivo.' };
  const etapas = copiar(d.etapas) || [];
  const ativa = idxAtiva(etapas);
  const alvo = ativa === -1 ? etapas.length - 1 : ativa - 1;
  if (alvo < 0) return { erro: 'Esta já é a primeira etapa.' };
  const prev = etapas[alvo];
  const porta = prev.porta || {};
  prev.status = 'em_andamento'; prev.data_conclusao = null;
  prev.porta = { ...porta, anteriores: [...(porta.anteriores || []), { pedida_em: porta.pedida_em, pedida_por: porta.pedida_por, encerrada_em: agora, devolvida_por: u?.nome || '', motivo: `Etapa reaberta: ${String(motivo).trim()}`, decisoes: porta.decisoes || [] }], pedida_em: null, pedida_por: null, decisoes: [], concluida_em: null };
  if (ativa !== -1) {
    const atual = etapas[ativa];
    const pa = atual.porta || {};
    atual.status = 'pendente'; atual.data_inicio = null;
    atual.porta = { ...pa, pedida_em: null, pedida_por: null, decisoes: [] };
  }
  const historico = copiar(d.historico) || [];
  historico.push(evento('voltou', prev.nome, u, String(motivo).trim(), agora));
  return { patch: { etapas, historico } };
}

function mudarSituacao(d: any, u: any, de: string[], para: string, tipoEvento: string, motivo: string | null, exigeMotivo: boolean, agora: string) {
  if (soGerente(u)) return { erro: soGerente(u) };
  if (!de.includes(d.situacao || 'ativa')) return { erro: 'A situação da demanda mudou. A tela foi atualizada.' };
  if (exigeMotivo && !String(motivo || '').trim()) return { erro: 'Escreva o motivo.' };
  const historico = copiar(d.historico) || [];
  historico.push(evento(tipoEvento, null, u, motivo ? String(motivo).trim() : null, agora));
  return { patch: { situacao: para, historico } };
}
export const pausarDemanda = (d: any, u: any, motivo: string, agora: string) => mudarSituacao(d, u, ['ativa'], 'pausada', 'pausou', motivo, true, agora);
export const retomarDemanda = (d: any, u: any, agora: string) => mudarSituacao(d, u, ['pausada'], 'ativa', 'retomou', null, false, agora);
export const cancelarDemanda = (d: any, u: any, motivo: string, agora: string) => mudarSituacao(d, u, ['ativa', 'pausada'], 'cancelada', 'cancelou', motivo, true, agora);
export const reabrirDemanda = (d: any, u: any, agora: string) => mudarSituacao(d, u, ['cancelada'], 'ativa', 'reabriu', null, false, agora);

// ── texto do histórico ─────────────────────────────────────────────────────────────────────────────
const FRASES: Record<string, (e: any) => string> = {
  criada: () => 'Demanda criada',
  tipo: e => e.texto || 'Tipo definido',
  etapa_iniciada: e => `Iniciou a etapa ${e.etapa}`,
  porta_pedida: e => `Pediu a decisão da porta da etapa ${e.etapa}`,
  porta_retirada: e => `Retirou o pedido de decisão da etapa ${e.etapa}`,
  aprovou: e => `Aprovou a etapa ${e.etapa}`,
  ressalva: e => `Aprovou com ressalva a etapa ${e.etapa}`,
  devolveu: e => `Devolveu a etapa ${e.etapa} para ajustes`,
  etapa_concluida: e => `Etapa ${e.etapa} concluída`,
  ressalva_resolvida: e => `Ressalva resolvida (${e.etapa})`,
  voltou: e => `Reabriu a etapa ${e.etapa}`,
  pausou: () => 'Pausou a demanda',
  retomou: () => 'Retomou a demanda',
  cancelou: () => 'Cancelou a demanda',
  reabriu: () => 'Reabriu a demanda cancelada',
};
export const frasePorEvento = (e: any) => (FRASES[e.tipo] ? FRASES[e.tipo](e) : String(e.tipo || '')) + ((e.tipo === 'tipo') || !e.texto ? '' : `: ${e.texto}`);
