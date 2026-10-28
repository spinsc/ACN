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
    // pedido do usuário em 22/10/2026: uma circular técnica no fim do protótipo. Opcional nos tipos que têm protótipo (não trava a porta de quem não precisa dela).
    ['circular_tecnica', 'Circular técnica', 'Comunicado técnico ao fim do protótipo: o que ficou definido ou mudou e o que cada área precisa fazer.', 'ppp-'],
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

// ── espera por material (28/10/2026, pedido do usuário) ───────────────────────────────────────────────────────────────
// Um desenvolvimento pode depender de itens de uma OC da OP (o suporte da barra só se desenvolve quando chega o rack de teto comprado). A demanda guarda em `espera_material` os itens
// esperados; o banco marca `chegou_em` quando todos chegaram (a Logística marca a chegada de cada item, ou a OC vira "Recebido"). Enquanto falta item e um gerente não liberou, nenhuma
// etapa pode ser iniciada. A conta é feita pelo que está GUARDADO, uma só, para a trava, o painel e os selos dizerem a mesma coisa; os detalhes (o que falta, quando chegou) vêm de EsperaDeMaterial.ts.
export type EstadoDaEspera = 'sem' | 'aguardando' | 'chegou' | 'liberada';
export function estadoGuardadoDaEspera(d: any): EstadoDaEspera {
  const e = d?.espera_material;
  if (!e || !Array.isArray(e.itens) || e.itens.length === 0) return 'sem';
  if (e.liberada) return 'liberada';
  return e.chegou_em ? 'chegou' : 'aguardando';
}
export const esperaBloqueia = (d: any) => estadoGuardadoDaEspera(d) === 'aguardando';

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
  // 28/10/2026: o desenvolvimento espera o material de uma compra; só um gerente libera antes de chegar (com motivo, na caixa "Material do desenvolvimento")
  if (esperaBloqueia(d)) return { erro: 'Não foi possível iniciar: este desenvolvimento espera a chegada de material. Quando chegar, a Engenharia é avisada; um gerente pode liberar antes.' };
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
// D3 (19/10/2026) acrescenta os da etapa de Desenvolvimento: desenhos com revisão, lista de materiais preliminar, riscos e revisão de projeto.
export const ENTREGAVEIS_COM_FORMULARIO = ['briefing', 'requisitos', 'normas', 'similares', 'meta_custo', 'conceitos', 'conceito_escolhido', 'desenhos', 'bom_prelim', 'riscos', 'revisao_projeto',
  // D4 (19/10/2026): Prototipagem e Validação
  'prototipos', 'problemas', 'circular_tecnica', 'plano_testes', 'teste_instalacao', 'conferencia_normas',
  // D5 (19/10/2026): Produção, Acabamento e Entrega
  'item_catalogo', 'instrucao_montagem', 'primeira_unidade', 'custo_real', 'padrao_acabamento', 'amostra', 'pacote_tecnico', 'licoes'];
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

// ── D3: desenhos, lista de materiais preliminar, riscos e revisão de projeto ───────────────────────────────────────
/** Rev A, B … Z, AA …: a letra da revisão é sempre pela ordem (a tela não escolhe). */
export function letraDaRevisao(n: number) {
  let s = ''; let k = n + 1;
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
  return s;
}
export function revisaoVigente(d: any) {
  const rs = dadosDoEntregavel(d, 'desenhos')?.revisoes || [];
  return rs.length ? rs[rs.length - 1] : null;
}
const arred2 = (n: number) => Math.round(n * 100) / 100;
/** Custo estimado de UMA unidade do produto: soma de quantidade × custo unitário de cada linha da lista de materiais. */
export function custoEstimado(dados: any) {
  return arred2((dados?.linhas || []).reduce((s: number, l: any) => s + arred2((Number(l.quantidade) || 0) * (Number(l.custo_unit) || 0)), 0));
}
/** Compara o estimado com a meta de custo da Concepção: { meta, estimado, diferenca, percentual } (nulo se ainda não há meta). */
export function custoContraMeta(d: any) {
  const meta = Number(dadosDoEntregavel(d, 'meta_custo')?.custo_alvo) || 0;
  const bom = dadosDoEntregavel(d, 'bom_prelim');
  if (!meta || !bom?.linhas?.length) return null;
  const estimado = custoEstimado(bom);
  return { meta, estimado, diferenca: arred2(estimado - meta), percentual: Math.round(((estimado - meta) / meta) * 1000) / 10 };
}
/** Gravidade × probabilidade (1 a 5 cada): 15 ou mais é alto, de 8 a 14 é médio, abaixo disso é baixo. */
export function nivelDoRisco(gravidade: number, probabilidade: number) {
  const pontos = (Number(gravidade) || 0) * (Number(probabilidade) || 0);
  return { pontos, nivel: pontos >= 15 ? 'alto' : pontos >= 8 ? 'medio' : 'baixo' };
}
export const AREAS_REVISAO = ['Engenharia', 'Produção', 'Compras', 'Qualidade', 'Comercial', 'Outra'];
export const CONCLUSOES_REVISAO: Record<string, string> = { aprovado: 'Aprovado', aprovado_com_ajustes: 'Aprovado com ajustes', reprovado: 'Reprovado' };
const areasObrigatorias = (tipo: string) => (tipo === 'produto_novo' ? ['Produção', 'Compras', 'Qualidade'] : []);

// ── D4: protótipos, problemas, plano de testes, instalação em veículo e conferência das normas ───────────────────
export const RESULTADOS_TESTE: Record<string, string> = { pendente: 'Ainda não testado', aprovado: 'Aprovado', reprovado: 'Reprovado' };
export const SITUACOES_NORMA: Record<string, string> = { atende: 'Atende', nao_atende: 'Não atende', nao_se_aplica: 'Não se aplica' };
const requisitosDoProjeto = (d: any) => dadosDoEntregavel(d, 'requisitos')?.itens || [];
const normasDoProjeto = (d: any) => dadosDoEntregavel(d, 'normas')?.itens || [];
/** Requisitos OBRIGATÓRIOS que nenhum teste do plano cobre (a ligação requisito → teste do modelo em V). */
export function requisitosSemTeste(d: any, dados: any) {
  const testes = dados?.testes || [];
  return requisitosDoProjeto(d).filter((r: any) => r.prioridade === 'obrigatorio' && !testes.some((t: any) => t.requisito_id === r.id));
}
/** Riscos médios e altos da etapa de Desenvolvimento que nenhum teste menciona (aviso, não trava). */
export function riscosSemTeste(d: any, dados: any) {
  const testes = dados?.testes || [];
  return (dadosDoEntregavel(d, 'riscos')?.itens || []).filter((r: any) => nivelDoRisco(r.gravidade, r.probabilidade).pontos >= 8 && !testes.some((t: any) => t.risco_id === r.id));
}
/** As normas da Concepção que a conferência ainda não respondeu. */
export function normasSemResposta(d: any, dados: any) {
  const itens = dados?.itens || [];
  return normasDoProjeto(d).filter((n: any) => !itens.some((i: any) => i.norma_id === n.id && SITUACOES_NORMA[i.situacao]));
}

// ── D5: Produção, Acabamento e Entrega ─────────────────────────────────────────────────────────────────────────────
export const RESULTADOS_UNIDADE: Record<string, string> = { pendente: 'Ainda não conferida', conforme: 'Conforme o desenho', nao_conforme: 'Não conforme' };
export const ITENS_DE_ACABAMENTO: [string, string][] = [['pintura', 'Pintura ou tratamento'], ['identificacao', 'Identificação (etiqueta, gravação)'], ['embalagem', 'Embalagem'], ['manual', 'Manual ou instrução ao cliente']];

/** O custo real da primeira unidade contra a meta (Concepção) e o estimado (lista de materiais). */
export function custoRealContra(d: any) {
  const real = Number(dadosDoEntregavel(d, 'custo_real')?.custo_real) || 0;
  if (!real) return null;
  const meta = Number(dadosDoEntregavel(d, 'meta_custo')?.custo_alvo) || 0;
  const bom = dadosDoEntregavel(d, 'bom_prelim');
  const est = bom?.linhas?.length ? custoEstimado(bom) : 0;
  return { real, meta, estimado: est, contraMeta: meta ? Math.round(((real - meta) / meta) * 1000) / 10 : null, contraEstimado: est ? Math.round(((real - est) / est) * 1000) / 10 : null };
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
  } else if (id === 'desenhos') {
    const rs = x.revisoes || [];
    if (!rs.length) falta.push('ao menos uma revisão do desenho');
    else if (rs.some((r: any) => !String(r.descricao || '').trim() || !(r.anexos || []).length)) falta.push('descrição e arquivo em todas as revisões');
  } else if (id === 'bom_prelim') {
    const ls = x.linhas || [];
    if (!ls.length) falta.push('ao menos um material');
    else if (ls.some((l: any) => !(Number(l.quantidade) > 0) || l.custo_unit === null || l.custo_unit === undefined)) falta.push('quantidade e custo unitário de todos os materiais');
    const meta = Number(dadosDoEntregavel(d, 'meta_custo')?.custo_alvo) || 0;
    if (ls.length && meta && custoEstimado(x) > meta && !String(x.justificativa || '').trim()) falta.push('a justificativa do custo estimado acima da meta');
  } else if (id === 'riscos') {
    const rs = x.itens || [];
    if (!rs.length && !x.nenhum) falta.push('os riscos, ou marcar que não viu risco relevante');
    if (rs.some((r: any) => nivelDoRisco(r.gravidade, r.probabilidade).pontos >= 8 && !String(r.acao || '').trim())) falta.push('a ação para cada risco médio ou alto');
  } else if (id === 'revisao_projeto') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) falta.push('a data da revisão');
    const ps = x.participantes || [];
    if (!ps.length) falta.push('os participantes');
    const sem = areasObrigatorias(d?.tipo_desenvolvimento).filter(a => !ps.some((p: any) => p.area === a));
    if (ps.length && sem.length) falta.push(`participante de ${sem.join(', ')}`);
    if (!CONCLUSOES_REVISAO[x.conclusao]) falta.push('a conclusão da revisão');
    else if (x.conclusao === 'reprovado') falta.push('a revisão foi reprovada: ajuste o projeto (nova revisão do desenho) e registre a revisão de novo');
    else if (x.conclusao === 'aprovado_com_ajustes' && (x.pontos || []).some((p: any) => !p.resolvido)) falta.push('resolver os pontos de ajuste em aberto');
    const vigente = revisaoVigente(d)?.rev;
    if (vigente && x.revisao_analisada && x.revisao_analisada !== vigente) falta.push(`repetir a revisão: o desenho mudou (a revisão analisada foi a ${x.revisao_analisada}, a vigente é a ${vigente})`);
  } else if (id === 'prototipos') {
    const ps = x.itens || [];
    const revisoes = (dadosDoEntregavel(d, 'desenhos')?.revisoes || []).map((r: any) => r.rev);
    if (!ps.length) falta.push('ao menos um protótipo');
    else {
      if (ps.some((p: any) => !String(p.descricao || '').trim())) falta.push('o que foi feito em cada protótipo');
      if (ps.some((p: any) => !p.rev_desenho || (revisoes.length && !revisoes.includes(p.rev_desenho)))) falta.push('a revisão do desenho usada em cada protótipo');
      if (ps.some((p: any) => p.horas === null || p.horas === undefined)) falta.push('as horas gastas em cada protótipo');
    }
  } else if (id === 'problemas') {
    const ps = x.itens || [];
    if (!ps.length && !x.nenhum) falta.push('os problemas, ou marcar que nenhum apareceu');
    if (ps.some((p: any) => !String(p.acao || '').trim())) falta.push('a ação de cada problema');
    if (ps.some((p: any) => !p.resolvido)) falta.push('resolver os problemas em aberto');
  } else if (id === 'circular_tecnica') {
    if (!String(x.assunto || '').trim()) falta.push('o assunto da circular');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) falta.push('a data da circular');
    if (!(x.areas || []).length) falta.push('para quais áreas a circular vai');
    if (!String(x.resumo || '').trim()) falta.push('o resumo técnico do que o protótipo definiu ou mudou');
  } else if (id === 'plano_testes') {
    const ts = x.testes || [];
    if (!ts.length) falta.push('ao menos um teste');
    const semTeste = requisitosSemTeste(d, x);
    if (semTeste.length) falta.push(`teste para o requisito: ${semTeste.map((r: any) => r.texto).join('; ')}`);
    if (ts.some((t: any) => !String(t.criterio || '').trim())) falta.push('o critério para passar em cada teste');
    const naoOk = ts.filter((t: any) => t.resultado !== 'aprovado');
    if (naoOk.length) falta.push(`${naoOk.length} teste(s) sem resultado aprovado`);
    if (ts.some((t: any) => t.resultado === 'aprovado' && !String(t.evidencia || '').trim())) falta.push('a evidência de cada teste aprovado');
  } else if (id === 'teste_instalacao') {
    if (!String(x.veiculo || '').trim()) falta.push('o veículo do teste');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) falta.push('a data do teste');
    if (x.resultado !== 'aprovado') falta.push('resultado aprovado (reprovado ou pendente não vale)');
  } else if (id === 'conferencia_normas') {
    const sem = normasSemResposta(d, x);
    if (sem.length) falta.push(`a situação de cada norma (faltam ${sem.length})`);
    if ((x.itens || []).some((i: any) => i.situacao === 'nao_atende' && normasDoProjeto(d).some((n: any) => n.id === i.norma_id))) falta.push('o produto não atende a uma norma: ajuste o projeto e confira de novo');
  } else if (id === 'item_catalogo') {
    if (!x.item_id) falta.push('o item do catálogo');
    const vs = x.veiculos || [];
    const sem = vs.filter((v: any) => v.estrutura !== true);
    if (x.item_id && !String(x.dispensa || '').trim()) {
      if (!vs.length) falta.push('os veículos de aplicação (ou justificar que o item não entra em estrutura)');
      else if (sem.length) falta.push(`a estrutura de instalação em: ${sem.map((v: any) => v.nome).join(', ')} (ou justificar que não se aplica)`);
    }
  } else if (id === 'instrucao_montagem') {
    if (!(x.passos || []).length) falta.push('ao menos um passo da montagem');
  } else if (id === 'primeira_unidade') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) falta.push('a data da conferência');
    if (x.resultado !== 'conforme') falta.push('resultado "conforme o desenho"');
    const vigente = revisaoVigente(d)?.rev;
    if (vigente && x.revisao_conferida && x.revisao_conferida !== vigente) falta.push(`repetir a conferência: o desenho mudou (conferida na Rev ${x.revisao_conferida}, vigente a Rev ${vigente})`);
  } else if (id === 'custo_real') {
    if (!(Number(x.custo_real) > 0)) falta.push('o custo real por unidade');
    const meta = Number(dadosDoEntregavel(d, 'meta_custo')?.custo_alvo) || 0;
    if (Number(x.custo_real) > 0 && meta && Number(x.custo_real) > meta && !String(x.justificativa || '').trim()) falta.push('a justificativa do custo real acima da meta');
  } else if (id === 'padrao_acabamento') {
    const sem = ITENS_DE_ACABAMENTO.filter(([k]) => !(String(x[k]?.texto || '').trim() || x[k]?.na));
    if (sem.length) falta.push(`${sem.map(([, r]) => r.toLowerCase()).join('; ')} (escreva ou marque "não se aplica")`);
  } else if (id === 'amostra') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) falta.push('a data da amostra');
    if (!String(x.local || '').trim()) falta.push('onde a amostra está guardada');
  } else if (id === 'pacote_tecnico') {
    if (!(x.arquivos || []).length) falta.push('ao menos um arquivo do pacote técnico');
    const vigente = revisaoVigente(d)?.rev;
    if (vigente && x.revisao_do_pacote && x.revisao_do_pacote !== vigente) falta.push(`atualizar o pacote: o desenho mudou (pacote na Rev ${x.revisao_do_pacote}, vigente a Rev ${vigente})`);
  } else if (id === 'licoes') {
    if (!(x.funcionou || []).length && !(x.diferente || []).length) falta.push('ao menos uma lição');
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
  if (id === 'desenhos') return { revisoes: lista(x.revisoes, 60).map((r: any) => ({
    id: txt(r.id, 20), rev: txt(r.rev, 4), descricao: txt(r.descricao, LIMITES.texto), por: txt(r.por, LIMITES.nome), em: txt(r.em, 40),
    anexos: lista(r.anexos, 20).map((a: any) => ({ nome: txt(a.nome, 200), url: txt(a.url, 1000) })).filter((a: any) => a.nome),
  })) };
  if (id === 'bom_prelim') {
    const num = (v: any) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? arred2(n) : null; };
    return { linhas: lista(x.linhas, 120).map((l: any) => ({ id: txt(l.id, 20), item: txt(l.item, 120), quantidade: num(l.quantidade), unidade: txt(l.unidade, 12), custo_unit: num(l.custo_unit) })).filter((l: any) => l.item), justificativa: txt(x.justificativa, LIMITES.texto) };
  }
  if (id === 'riscos') return { nenhum: !!x.nenhum, itens: lista(x.itens, LIMITES.itens).map((r: any) => ({ id: txt(r.id, 20), descricao: txt(r.descricao, LIMITES.texto), gravidade: dentro(r.gravidade, 1, 5) ?? 3, probabilidade: dentro(r.probabilidade, 1, 5) ?? 3, acao: txt(r.acao, LIMITES.texto), responsavel: txt(r.responsavel, LIMITES.nome) })).filter((r: any) => r.descricao) };
  if (id === 'revisao_projeto') return {
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(x.data || '')) ? x.data : '',
    participantes: lista(x.participantes, 30).map((p: any) => ({ id: txt(p.id, 20), nome: txt(p.nome, LIMITES.nome), area: AREAS_REVISAO.includes(p.area) ? p.area : 'Outra' })).filter((p: any) => p.nome),
    pontos: lista(x.pontos, LIMITES.itens).map((p: any) => ({ id: txt(p.id, 20), texto: txt(p.texto, LIMITES.texto), resolvido: !!p.resolvido })).filter((p: any) => p.texto),
    conclusao: CONCLUSOES_REVISAO[x.conclusao] ? x.conclusao : '', ata: txt(x.ata, 3000), revisao_analisada: txt(x.revisao_analisada, 4) || null,
  };
  const fotos = (v: any) => lista(v, 20).map((a: any) => ({ nome: txt(a.nome, 200), url: txt(a.url, 1000) })).filter((a: any) => a.nome);
  const diaOuVazio = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '');
  const numero = (v: any) => { const n = Number(v); return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? arred2(n) : null; };
  if (id === 'prototipos') return { itens: lista(x.itens, 30).map((p: any, i: number) => ({
    id: txt(p.id, 20), numero: `P${i + 1}`, rev_desenho: txt(p.rev_desenho, 4), descricao: txt(p.descricao, LIMITES.texto), material: txt(p.material, LIMITES.texto),
    horas: numero(p.horas), custo: numero(p.custo), data: diaOuVazio(p.data), fotos: fotos(p.fotos),
  })).filter((p: any) => p.descricao || p.material || p.fotos.length) };
  if (id === 'problemas') return { nenhum: !!x.nenhum, itens: lista(x.itens, LIMITES.itens).map((p: any) => ({
    id: txt(p.id, 20), descricao: txt(p.descricao, LIMITES.texto), prototipo_id: txt(p.prototipo_id, 20) || null, acao: txt(p.acao, LIMITES.texto), rev_corrigida: txt(p.rev_corrigida, 4), resolvido: !!p.resolvido,
  })).filter((p: any) => p.descricao) };
  if (id === 'circular_tecnica') return {
    assunto: txt(x.assunto, 200), data: diaOuVazio(x.data), areas: [...new Set(lista(x.areas, 12).filter((a: any) => AREAS_REVISAO.includes(a)))],
    prototipo_id: txt(x.prototipo_id, 20) || null, resumo: txt(x.resumo, 3000), acoes: txt(x.acoes, 3000), arquivos: fotos(x.arquivos), revisao_do_desenho: txt(x.revisao_do_desenho, 4) || null,
  };
  if (id === 'plano_testes') return { testes: lista(x.testes, 80).map((t: any) => ({
    id: txt(t.id, 20), requisito_id: txt(t.requisito_id, 20) || null, risco_id: txt(t.risco_id, 20) || null, descricao: txt(t.descricao, LIMITES.texto), criterio: txt(t.criterio, LIMITES.texto),
    resultado: RESULTADOS_TESTE[t.resultado] ? t.resultado : 'pendente', evidencia: txt(t.evidencia, LIMITES.texto), data: diaOuVazio(t.data),
  })).filter((t: any) => t.descricao) };
  if (id === 'teste_instalacao') return { veiculo: txt(x.veiculo, LIMITES.nome), data: diaOuVazio(x.data), resultado: RESULTADOS_TESTE[x.resultado] ? x.resultado : 'pendente', observacoes: txt(x.observacoes, 2000), fotos: fotos(x.fotos) };
  if (id === 'item_catalogo') return {
    item_id: txt(x.item_id, 60) || null, item_nome: txt(x.item_nome, 200), item_codigo: txt(x.item_codigo, 60),
    veiculos: lista(x.veiculos, 40).map((v: any) => ({ id: txt(v.id, 60), nome: txt(v.nome, 200), estrutura: v.estrutura === true ? true : v.estrutura === false ? false : null, verificado_em: txt(v.verificado_em, 40) })).filter((v: any) => v.id),
    dispensa: txt(x.dispensa, LIMITES.texto),
  };
  if (id === 'instrucao_montagem') return { passos: lista(x.passos, 60).map((p: any) => ({ id: txt(p.id, 20), texto: txt(p.texto, LIMITES.texto) })).filter((p: any) => p.texto), tempo_min: numero(x.tempo_min) };
  if (id === 'primeira_unidade') return { data: diaOuVazio(x.data), referencia: txt(x.referencia, LIMITES.nome), resultado: RESULTADOS_UNIDADE[x.resultado] ? x.resultado : 'pendente', observacoes: txt(x.observacoes, 2000), fotos: fotos(x.fotos), revisao_conferida: txt(x.revisao_conferida, 4) || null };
  if (id === 'custo_real') return { custo_real: numero(x.custo_real), justificativa: txt(x.justificativa, LIMITES.texto), observacao: txt(x.observacao, LIMITES.texto) };
  if (id === 'padrao_acabamento') return Object.fromEntries(ITENS_DE_ACABAMENTO.map(([k]) => [k, { texto: txt(x[k]?.texto, LIMITES.texto), na: !!x[k]?.na }]));
  if (id === 'amostra') return { data: diaOuVazio(x.data), local: txt(x.local, LIMITES.nome), observacao: txt(x.observacao, LIMITES.texto), fotos: fotos(x.fotos) };
  if (id === 'pacote_tecnico') return { arquivos: fotos(x.arquivos), garantia: txt(x.garantia, 2000), revisao_do_pacote: txt(x.revisao_do_pacote, 4) || null };
  if (id === 'licoes') { const l = (v: any) => lista(v, 30).map((i: any) => ({ id: txt(i.id, 20), texto: txt(i.texto, LIMITES.texto) })).filter((i: any) => i.texto); return { funcionou: l(x.funcionou), diferente: l(x.diferente) }; }
  if (id === 'conferencia_normas') return { itens: lista(x.itens, LIMITES.itens).map((i: any) => ({ norma_id: txt(i.norma_id, 20), texto: txt(i.texto, LIMITES.texto), situacao: SITUACOES_NORMA[i.situacao] ? i.situacao : '', obs: txt(i.obs, LIMITES.texto) })).filter((i: any) => i.norma_id) };
  return {};
}

export function salvarDados(d: any, idx: number, id: string, dados: any, u: any, agora: string) {
  if (!temFormulario(id)) return { erro: 'Este entregável não tem formulário.' };
  const limpo = limparDados(id, dados);
  return atualizarEntregavel(d, idx, id, u, agora, (e, etapa) => {
    if (id === 'desenhos') {
      // revisões só se acrescentam (como no PLM: o que já foi liberado como Rev A não se reescreve; mudou, é Rev B)
      const antes = e.dados?.revisoes || [];
      const novos = limpo.revisoes;
      if (novos.length < antes.length || antes.some((a: any, i: number) => a.descricao !== novos[i].descricao || JSON.stringify(a.anexos) !== JSON.stringify(novos[i].anexos))) return 'As revisões anteriores não podem ser alteradas: registre uma nova revisão.';
      if (novos.slice(antes.length).some((r: any) => !r.descricao || !r.anexos.length)) return 'A nova revisão precisa de uma descrição do que mudou e de ao menos um arquivo.';
      novos.forEach((r: any, i: number) => { r.rev = letraDaRevisao(i); if (i < antes.length) { r.id = antes[i].id; r.por = antes[i].por; r.em = antes[i].em; } else { r.por = u?.nome || ''; r.em = agora; } });
      // o desenho mudou: a revisão de projeto que olhou a versão anterior deixa de valer
      const rev = etapa.entregaveis?.revisao_projeto;
      if (novos.length > antes.length && rev?.feito && rev.dados?.revisao_analisada && rev.dados.revisao_analisada !== novos[novos.length - 1].rev) { rev.feito = false; rev.feito_por = null; rev.feito_em = null; }
    }
    if (id === 'primeira_unidade') limpo.revisao_conferida = revisaoVigente(d)?.rev || null;   // a conferência vale para a Rev do desenho vigente NESTE momento
    if (id === 'pacote_tecnico') limpo.revisao_do_pacote = revisaoVigente(d)?.rev || null;
    if (id === 'circular_tecnica') limpo.revisao_do_desenho = revisaoVigente(d)?.rev || null;   // a circular diz a que revisão do desenho se refere, no momento em que foi emitida
    if (id === 'revisao_projeto') limpo.revisao_analisada = revisaoVigente(d)?.rev || null;   // a revisão de projeto vale para a revisão do desenho vigente NESTE momento
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
  // D4 (19/10/2026): na Validação a Qualidade não só "aprova": ela escreve o parecer (o texto fica na decisão e no histórico)
  if (decisao === 'aprovou' && meus.includes('qualidade') && !txt) return { erro: 'A Qualidade precisa escrever o parecer ao aprovar a Validação.' };

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
// ── pedido de mudança depois da liberação (D5, 19/10/2026) ────────────────────────────────────────────────────────
// Regra do plano: depois que a Produção é liberada (etapa 6 concluída), mudar o projeto não é mais "voltar etapa": é um pedido curto — motivo, o que muda, impacto em custo e nas OPs
// abertas — aprovado pelo solicitante e pelo gerente, que gera a PRÓXIMA REVISÃO do desenho. Nada de editar a revisão liberada. Fica em `mudancas` (jsonb) na própria demanda.
export const liberada = (d: any) => d?.etapas?.[5]?.status === 'concluida';
export const STATUS_MUDANCA: Record<string, string> = { pedida: 'Aguardando aprovação', aprovada: 'Aprovada: falta a nova revisão do desenho', implementada: 'Implementada', recusada: 'Recusada', cancelada: 'Cancelada' };
const PAPEIS_MUDANCA = ['solicitante', 'gerente'];
const papeisNaMudanca = (d: any, u: any) => papeisQueOUsuarioCobre(d, { nome: 'Mudança' }, u);

function prepararMudanca(d: any, id: string | null, exigeLiberada = true) {
  if (!modeloGuiado(d)) return { erro: 'Defina primeiro o tipo de desenvolvimento desta demanda.' };
  const parada = naoAtiva(d); if (parada) return { erro: parada };
  if (exigeLiberada && !liberada(d)) return { erro: 'Pedido de mudança só existe depois da liberação para a Produção; antes disso, o gerente pode voltar a etapa.' };
  const mudancas = copiar(d.mudancas) || [];
  const historico = copiar(d.historico) || [];
  const m = id ? mudancas.find((x: any) => x.id === id) : null;
  if (id && !m) return { erro: 'Não foi possível achar o pedido de mudança: a demanda mudou. A tela foi atualizada.' };
  return { mudancas, historico, m };
}

// 22/10/2026: o pedido pode nascer de um atendimento de garantia (`garantia: { id, numero }`): o número da garantia fica no pedido e no histórico do projeto, e a ficha da Garantia lê daqui
export function pedirMudanca(d: any, u: any, { motivo, o_que_muda, impacto_custo, impacto_ops, garantia }: any, agora: string) {
  const p = prepararMudanca(d, null); if (p.erro) return p;
  const { mudancas, historico } = p;
  const campos = { motivo: txt(motivo, LIMITES.texto), o_que_muda: txt(o_que_muda, LIMITES.texto), impacto_custo: txt(impacto_custo, LIMITES.texto), impacto_ops: txt(impacto_ops, LIMITES.texto) };
  if (!campos.motivo) return { erro: 'Escreva o motivo da mudança.' };
  if (!campos.o_que_muda) return { erro: 'Escreva o que vai mudar no projeto.' };
  if (!campos.impacto_custo || !campos.impacto_ops) return { erro: 'Diga o impacto em custo e nas OPs abertas (se não há, escreva "nenhum").' };
  if (mudancas.some((m: any) => m.status === 'pedida' || m.status === 'aprovada')) return { erro: 'Já há uma mudança em andamento. Conclua ou cancele antes de pedir outra.' };
  const numero = `M${mudancas.length + 1}`;
  const origem = garantia?.id ? { id: txt(String(garantia.id), 60), numero: txt(garantia.numero, 30) } : null;
  mudancas.push({ id: `m${Date.parse(agora)}${mudancas.length}`, numero, ...campos, ...(origem ? { garantia: origem } : {}), status: 'pedida', pedida_por: u?.nome || '', pedida_em: agora, decisoes: [], rev_gerada: null, implementada_em: null });
  historico.push(evento('mudanca_pedida', null, u, `${numero}${origem ? ` (atendimento de garantia ${origem.numero})` : ''}: ${campos.motivo}`, agora));
  return { patch: { mudancas, historico } };
}

/** decisao: 'aprovou' | 'recusou' (texto obrigatório). Aprovam o solicitante e o gerente; uma recusa encerra o pedido. */
export function decidirMudanca(d: any, id: string, u: any, { decisao, texto }: any, agora: string) {
  const p = prepararMudanca(d, id); if (p.erro) return p;
  const { mudancas, historico, m } = p;
  if (m.status !== 'pedida') return { erro: 'Este pedido não está mais aguardando decisão. A tela foi atualizada.' };
  if (!['aprovou', 'recusou'].includes(decisao)) return { erro: 'Escolha uma decisão.' };
  const t = txt(texto, LIMITES.texto);
  if (decisao === 'recusou' && !t) return { erro: 'Escreva por que a mudança foi recusada.' };
  const ja = new Set((m.decisoes || []).flatMap((x: any) => x.papeis || []));
  const meus = papeisNaMudanca(d, u).filter(papel => !ja.has(papel));
  if (!meus.length) return { erro: 'Você não pode decidir este pedido (ou já decidiu).' };
  m.decisoes = [...(m.decisoes || []), { papeis: meus, por: u?.nome || '', em: agora, decisao, texto: t || null }];
  if (decisao === 'recusou') { m.status = 'recusada'; historico.push(evento('mudanca_recusada', null, u, `${m.numero}: ${t}`, agora)); }
  else {
    historico.push(evento('mudanca_aprovou', null, u, `${m.numero} (${meus.map(x => ROTULO_PAPEL[x]).join(' e ')})`, agora));
    const faltam = PAPEIS_MUDANCA.filter(papel => !m.decisoes.some((x: any) => (x.papeis || []).includes(papel)));
    if (!faltam.length) { m.status = 'aprovada'; historico.push(evento('mudanca_aprovada', null, u, `${m.numero}: registre a nova revisão do desenho`, agora)); }
  }
  return { patch: { mudancas, historico } };
}

/** A mudança aprovada vira a próxima revisão do desenho (a única forma de mexer no desenho depois da liberação). */
export function implementarMudanca(d: any, id: string, u: any, { descricao, anexos }: any, agora: string) {
  const p = prepararMudanca(d, id); if (p.erro) return p;
  const { mudancas, historico, m } = p;
  if (m.status !== 'aprovada') return { erro: 'Só a mudança aprovada gera a nova revisão do desenho.' };
  const desc = txt(descricao, LIMITES.texto);
  const arq = (Array.isArray(anexos) ? anexos : []).slice(0, 20).map((a: any) => ({ nome: txt(a.nome, 200), url: txt(a.url, 1000) })).filter((a: any) => a.nome);
  if (!desc || !arq.length) return { erro: 'A nova revisão precisa de uma descrição do que mudou e de ao menos um arquivo.' };
  const etapas = copiar(d.etapas);
  const iDes = etapas.findIndex((e: any) => e.entregaveis?.desenhos);
  const alvo = iDes >= 0 ? etapas[iDes] : etapas[2];
  alvo.entregaveis = alvo.entregaveis || {};
  const ent = alvo.entregaveis.desenhos = alvo.entregaveis.desenhos || { feito: true, feito_por: u?.nome || '', feito_em: agora, anexos: [], nota: '' };
  const revisoes = ent.dados?.revisoes || [];
  const rev = letraDaRevisao(revisoes.length);
  ent.dados = { ...(ent.dados || {}), revisoes: [...revisoes, { id: `r${Date.parse(agora)}${revisoes.length}`, rev, descricao: desc, anexos: arq, por: u?.nome || '', em: agora, mudanca: m.numero }] };
  m.status = 'implementada'; m.rev_gerada = rev; m.implementada_em = agora; m.implementada_por = u?.nome || '';
  historico.push(evento('mudanca_implementada', null, u, `${m.numero} gerou a Rev ${rev}`, agora));
  return { patch: { etapas, mudancas, historico } };
}

export function cancelarMudanca(d: any, id: string, u: any, motivo: string, agora: string) {
  const p = prepararMudanca(d, id); if (p.erro) return p;
  const { mudancas, historico, m } = p;
  if (m.status !== 'pedida' && m.status !== 'aprovada') return { erro: 'Este pedido já foi encerrado. A tela foi atualizada.' };
  if (!(ehGerenteDev(u) || mesmoNome(m.pedida_por, u?.nome))) return { erro: 'Só quem pediu a mudança, ou um gerente, pode cancelá-la.' };
  const t = txt(motivo, LIMITES.texto);
  if (!t) return { erro: 'Escreva o motivo do cancelamento.' };
  m.status = 'cancelada'; m.cancelada_motivo = t;
  historico.push(evento('mudanca_cancelada', null, u, `${m.numero}: ${t}`, agora));
  return { patch: { mudancas, historico } };
}

// ── painel: o que precisa de atenção em cada demanda (D6, 19/10/2026) ───────────────────────────────────────────────
// Uma demanda parada há 7 dias ou mais (sem ninguém gravar nada nela) é "parada"; o número é o mesmo para todos e fica aqui, num lugar só, para o painel e os selos dos cartões
// dizerem a mesma coisa. Cancelada e pedido do PCP ficam de fora (o PCP fecha pelos itens, não pelas etapas); pausada não conta como atrasada nem parada: a pausa já é a explicação.
export const DIAS_PARADA = 7;
const diasEntreDatas = (de: string, ate: string) => Math.floor((Date.parse(String(ate).slice(0, 10) + 'T00:00:00Z') - Date.parse(String(de).slice(0, 10) + 'T00:00:00Z')) / 86400000);

export function alertasDaDemanda(d: any, u: any, hojeIso: string, agoraMs: number) {
  const r = { atrasadaEtapa: 0, prazoVencido: 0, parada: 0, esperandoDecisao: false, esperandoMinha: false, custoAcima: false, ressalvas: 0, mudancaPendente: false, pausada: d?.situacao === 'pausada',
    esperandoMaterial: false, materialChegouDias: null as number | null };
  if (!d || d.origem === 'pcp' || d.situacao === 'cancelada') return r;
  const etapas = d.etapas || [];
  const idxAtiva = etapas.findIndex((e: any) => e.status !== 'concluida');
  const finalizada = etapas.length > 0 && idxAtiva === -1;
  // espera por material: esperar já é a explicação (não conta como parada); chegou e ninguém iniciou é o que o painel precisa mostrar
  const espera = estadoGuardadoDaEspera(d);
  if (!finalizada && d.situacao !== 'pausada') {
    if (espera === 'aguardando') r.esperandoMaterial = true;
    if (espera === 'chegou' && etapas[idxAtiva]?.status === 'pendente') r.materialChegouDias = Math.max(0, Math.floor((agoraMs - Date.parse(d.espera_material.chegou_em)) / 86400000)) || 0;
  }
  if (!finalizada && d.situacao !== 'pausada') {
    const ativa = etapas[idxAtiva];
    if (ativa?.status === 'em_andamento' && ativa.data_prevista && String(ativa.data_prevista).slice(0, 10) < hojeIso) r.atrasadaEtapa = diasEntreDatas(ativa.data_prevista, hojeIso);
    const prazo = dadosDoEntregavel(d, 'meta_custo')?.prazo;
    if (prazo && String(prazo) < hojeIso) r.prazoVencido = diasEntreDatas(prazo, hojeIso);
    if (d.atualizado_em && espera !== 'aguardando') { const dias = Math.floor((agoraMs - Date.parse(d.atualizado_em)) / 86400000); if (dias >= DIAS_PARADA) r.parada = dias; }
  }
  if (modeloGuiado(d)) {
    for (const e of etapas) {
      if (e.porta?.pedida_em && e.status !== 'concluida') {
        r.esperandoDecisao = true;
        if (u) { const est = estadoDaPorta(d, e); if (papeisQueOUsuarioCobre(d, e, u).some(p => est.faltam.includes(p))) r.esperandoMinha = true; }
      }
    }
    for (const m of d.mudancas || []) {
      if (m.status === 'pedida') {
        r.esperandoDecisao = true; r.mudancaPendente = true;
        if (u) { const ja = new Set((m.decisoes || []).flatMap((x: any) => x.papeis || [])); if (papeisNaMudanca(d, u).some(p => !ja.has(p))) r.esperandoMinha = true; }
      } else if (m.status === 'aprovada') r.mudancaPendente = true;
    }
    const est = custoContraMeta(d), real = custoRealContra(d);
    r.custoAcima = (!!est && est.diferenca > 0) || (!!real && real.contraMeta !== null && real.contraMeta > 0);
    for (const e of etapas) r.ressalvas += (e.porta?.ressalvas || []).filter((x: any) => !x.resolvida_em).length;
  }
  return r;
}
export const temAlerta = (a: any) => !!(a.atrasadaEtapa || a.prazoVencido || a.parada || a.esperandoDecisao || a.custoAcima || a.ressalvas || a.materialChegouDias !== null);

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
  mudanca_pedida: () => 'Pediu uma mudança depois da liberação',
  mudanca_aprovou: () => 'Aprovou a mudança',
  mudanca_aprovada: () => 'Mudança aprovada por todos',
  mudanca_recusada: () => 'Recusou a mudança',
  mudanca_implementada: () => 'Registrou a revisão do desenho da mudança',
  mudanca_cancelada: () => 'Cancelou a mudança',
  espera_ligada: () => 'Passou a esperar material de uma compra',
  espera_retirada: () => 'Retirou a espera por material',
  espera_liberada: () => 'Liberou o desenvolvimento sem esperar o material',
  material_chegou: () => 'Material chegou',
  material_voltou: () => 'O material voltou a faltar',
};
export const frasePorEvento = (e: any) => (FRASES[e.tipo] ? FRASES[e.tipo](e) : String(e.tipo || '')) + ((e.tipo === 'tipo') || !e.texto ? '' : `: ${e.texto}`);
