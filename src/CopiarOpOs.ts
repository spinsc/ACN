// ─────────────────────────────────────────────────────────────────────────────
// COPIAR OP / COPIAR OS — várias OPs (ou OSs) iguais, cada uma com o seu número
//
// Pedido do usuário em 23/10/2026: uma venda que abre 6 OPs iguais, cada uma com o seu número de OP, não pode ser digitada seis vezes. Decidido com ele, em janela:
//   • o botão "Copiar" fica na OP aberta (menu "Mais ações da OP") e na OS do SAC (menu ⋯ da OS);
//   • na OP, quem copia DIGITA o número de cada cópia (o pedido de venda de 4 dígitos, ou o número completo); na OS o número vem sozinho, na sequência;
//   • a cópia leva TUDO da venda e da configuração, menos o que identifica UM veículo ou UM equipamento: chassi, placa, seriais dos itens e o que é do carro que chegou
//     ("informações de identificação individual não entram").
//
// Por que uma lista do que COPIA (e não do que deixa de fora): a OP tem mais de 200 colunas, a maioria é andamento (status, datas de cada setor, tempos, NF, CQ, equipe da produção).
// Uma coluna nova de andamento que alguém criar amanhã nunca pode vir junto por esquecimento; a dos dados da venda entra aqui de propósito, com a decisão registrada.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { hojeISO } from './Interface';

export const MAX_COPIAS = 30;

/** Colunas da OP que a cópia leva: o que foi VENDIDO e configurado. */
export const CAMPOS_COPIADOS_DA_OP = [
  // o que é a venda
  'tipo_op', 'faturamento_empresa', 'tipo_projeto', 'origem_venda', 'fluxo_entrega', 'categoria_servico', 'is_demanda_direta_engenharia',
  'cliente_nome', 'cliente_final', 'responsavel_comercial', 'vendedor', 'canal_venda', 'edital', 'proposta', 'local_instalacao', 'centro_custo',
  'crm_oportunidade_id', 'licitacao_id',
  // entrega e frete (o destino é da venda, não do carro)
  'destino_cidade', 'destino_uf', 'destino_cep', 'destino_logradouro', 'destino_numero', 'destino_bairro', 'destino_complemento', 'destino_destinatario', 'destino_telefone', 'frete_responsavel',
  // quantidade, valores e prazos
  'quantidade', 'valor_total', 'valor_mao_de_obra', 'valor_mao_de_obra_serralheria', 'data_prevista_entrega', 'prazo_entrega_comercial', 'prazo_entrega_producao', 'prazo_garantia',
  // faturamento
  'cnpj_faturamento', 'razao_social_faturamento', 'observacoes_faturamento',
  // observações e descrição do serviço
  'observacoes_comercial', 'observacoes_atencao', 'resumo_servicos', 'especificacoes', 'bom_especificacao',
  'servico_terceiro', 'tipo_servico_terceiro', 'tipos_servico_terceiro', 'obs_servico_terceiro',
  // o que foi vendido e a configuração (a lista de material já montada; as respostas sobre o carro vão em outra tabela)
  'itens_vendidos', 'bom_itens', 'composicao_comercial', 'kit_produto_id', 'kit_nome', 'kit_itens',
  // o veículo do catálogo (o modelo), nunca o carro individual
  'veiculo_id', 'modelo', 'veiculo',
];

/** Texto para a janela: o que a cópia da OP leva e o que não leva. */
export const LEVA_DA_OP = [
  'cliente, empresa, tipo de projeto, fluxo de entrega, origem da venda, responsável comercial e vínculo com o card do CRM ou a licitação',
  'itens vendidos (com quem separa cada linha), resumo dos serviços, especificações, serviço de terceiro e observações',
  'lista de material (BOM) e as respostas sobre o carro',
  'quantidade, valores, prazo de entrega, garantia, frete, endereço de entrega e dados de faturamento',
  'o veículo do catálogo (o modelo) e os documentos anexados (proposta, orçamento e outros arquivos)',
];
export const NAO_LEVA_DA_OP = [
  'chassi, placa, seriais dos itens e a data de chegada do veículo',
  'as fotos do veículo e as fotos e o checklist anexados',
  'o andamento: status, liberações, kit separado, embalagem, qualidade, nota fiscal, equipe da produção, notas e histórico — a cópia nasce como OP nova, "Em Espera PCP"',
];

const clonar = (v: any) => (v === undefined ? v : JSON.parse(JSON.stringify(v ?? null)));

// ── número de cada cópia ─────────────────────────────────────────────────────

/** A letra do número da OP: A (ACN) ou D (Detech), a mesma regra da Nova OP. */
export const letraDaEmpresa = (origem: any) => (/detech/i.test(String(origem?.faturamento_empresa || '')) ? 'D' : 'A');

/** O que a pessoa digitou vira o número da OP: 1 a 4 dígitos é o pedido de venda (vira "A1801.2610", com a letra da empresa e o ano e o mês de hoje, como na Nova OP);
 *  qualquer outra coisa é o número completo, como foi digitado (maiúsculo, sem espaço). */
export function numeroDaCopia(digitado: string, origem: any, agora: Date = new Date()): { numero: string; erro?: string } {
  const t = String(digitado || '').trim().toUpperCase();
  if (/^\d{1,4}$/.test(t)) {
    const yy = String(agora.getFullYear()).slice(-2), mm = String(agora.getMonth() + 1).padStart(2, '0');
    return { numero: `${letraDaEmpresa(origem)}${t.padStart(4, '0')}.${yy}${mm}` };
  }
  if (!/^[A-Z0-9][A-Z0-9._\/-]{2,29}$/.test(t)) return { numero: t, erro: 'número inválido: use o pedido de venda (até 4 dígitos) ou o número completo da OP, sem espaços' };
  return { numero: t };
}

/** A lista digitada (um número por linha; vírgula, ponto e vírgula e espaço também separam) vira uma linha por cópia, com o número que será criado e o problema, se houver. */
export function numerosDasCopias(texto: string, origem: any, agora: Date = new Date()) {
  const itens = String(texto || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const vistos = new Map<string, number>();
  const linhas = itens.map(digitado => {
    const r = numeroDaCopia(digitado, origem, agora);
    return { digitado, numero: r.numero, erro: r.erro as string | undefined };
  });
  linhas.forEach(l => { if (!l.erro) vistos.set(l.numero, (vistos.get(l.numero) || 0) + 1); });
  linhas.forEach(l => { if (!l.erro && (vistos.get(l.numero) || 0) > 1) l.erro = 'número repetido na lista'; });
  const erro = linhas.length > MAX_COPIAS ? `No máximo ${MAX_COPIAS} cópias de uma vez.` : undefined;
  return { linhas, erro };
}

// ── a cópia da OP ────────────────────────────────────────────────────────────

/** Os dados da OP nova: as colunas copiadas + o que faz dela uma OP nova (número, data, status, quem criou). */
export function payloadDaCopiaDaOp(origem: any, numero: string, usuario: any, agora: Date = new Date()) {
  const p: any = {};
  for (const c of CAMPOS_COPIADOS_DA_OP) if (origem?.[c] !== undefined) p[c] = clonar(origem[c]);
  return {
    ...p,
    opl: numero,
    tipo_op: origem?.tipo_op || 'OPL',
    data_entrada: hojeISO(),
    // a OP nasce direto no PCP (Etapa 18e, 13/10/2026), como a que sai da Nova OP: o relógio do PCP começa agora
    status_geral: 'Em Espera PCP',
    data_chegada_pcp: agora.toISOString(),
    criado_por: usuario?.email,
    criado_por_nome: usuario?.nome,
  };
}

/** Os anexos que a cópia leva: documentos (proposta, orçamento, arquivos). Foto e checklist de entrega são do carro/da entrega e ficam na OP de origem. */
export const ehAnexoDeDocumento = (a: any) => !['foto', 'checklist_entrega'].includes(String(a?.tipo || ''));

type Resultado = { criadas: { id: string; numero: string }[]; avisos: string[]; erro?: string };

/** Cria uma OP por número, todas de uma vez: as OPs entram numa gravação só (ou entram todas, ou nenhuma), depois vêm as respostas sobre o carro, os anexos e o histórico.
 *  Tudo o que pode falhar na LEITURA é lido antes de gravar qualquer coisa: leitura recusada não vira cópia sem as respostas ou sem os anexos. */
export async function copiarOp({ origem, numeros, usuario }: { origem: any; numeros: string[]; usuario: any }): Promise<Resultado> {
  const vazio = (erro: string): Resultado => ({ criadas: [], avisos: [], erro });
  if (!origem?.id) return vazio('Não achei a OP de origem.');
  if (!numeros.length) return vazio('Informe o número de pelo menos uma cópia.');
  if (numeros.length > MAX_COPIAS) return vazio(`No máximo ${MAX_COPIAS} cópias de uma vez.`);
  // a OP de origem é relida inteira: quem chama pode ter só a linha de uma lista
  const { data: lida, error: erroOrigem } = await supabase.from('oples').select('*').eq('id', origem.id).maybeSingle();
  if (erroOrigem || !lida) return vazio(`Não foi possível ler a OP de origem (${erroOrigem?.message || 'não encontrada'}). Nada foi criado.`);
  const { data: existentes, error: erroExiste } = await supabase.from('oples').select('opl').in('opl', numeros);
  if (erroExiste) return vazio(`Não foi possível conferir se os números já existem (${erroExiste.message}). Nada foi criado.`);
  if (existentes?.length) return vazio(`Já existe OP com este número: ${existentes.map((e: any) => e.opl).join(', ')}. Use números diferentes.`);
  const { data: respostas, error: erroRespostas } = await supabase.from('op_configuracao_respostas').select('*').eq('opl_id', lida.id);
  if (erroRespostas) return vazio(`Não foi possível ler as respostas sobre o carro da OP de origem (${erroRespostas.message}). Nada foi criado.`);
  const { data: anexos, error: erroAnexos } = await supabase.from('opl_anexos').select('*').eq('opl_id', lida.id);
  if (erroAnexos) return vazio(`Não foi possível ler os anexos da OP de origem (${erroAnexos.message}). Nada foi criado.`);

  const agora = new Date();
  const { data: novas, error: erroInsere } = await supabase.from('oples')
    .insert(numeros.map(n => payloadDaCopiaDaOp(lida, n, usuario, agora))).select('id,opl');
  if (erroInsere || !novas?.length) {
    return vazio(erroInsere?.code === '23505'
      ? 'Algum destes números acabou de ser usado por outra OP. Nada foi criado: confira os números e tente de novo.'
      : `Não foi possível criar as cópias (${erroInsere?.message || 'sem resposta'}). Nada foi criado.`);
  }
  const criadas = novas.map((n: any) => ({ id: n.id, numero: n.opl }));
  const avisos: string[] = [];

  // as respostas sobre o carro (a lista de material já foi junto, na coluna bom_itens)
  const respostasNovas = criadas.flatMap(c => (respostas || []).map((r: any) => { const { id, opl_id, respondido_em, ...resto } = r; return { ...resto, opl_id: c.id }; }));
  if (respostasNovas.length) {
    const { error } = await supabase.from('op_configuracao_respostas').insert(respostasNovas);
    if (error) avisos.push(`as respostas sobre o carro não foram copiadas (${error.message})`);
  }
  const anexosNovos = criadas.flatMap(c => (anexos || []).filter(ehAnexoDeDocumento).map((a: any) => ({
    opl_id: c.id, opl_numero: c.numero, setor: a.setor, tipo: a.tipo, nome: a.nome, url: a.url, criado_por: a.criado_por,
  })));
  if (anexosNovos.length) {
    const { error } = await supabase.from('opl_anexos').insert(anexosNovos);
    if (error) avisos.push(`os anexos não foram copiados (${error.message})`);
  }
  // histórico: cada OP nova diz de onde veio, e a de origem diz para onde foi copiada
  const agoraIso = new Date().toISOString();
  const quem = { usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: agoraIso };
  const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([
    ...criadas.map(c => ({ opl_id: c.id, numero_opl: c.numero, setor: usuario?.perfil || 'Comercial', evento: `OP criada como cópia da OP ${lida.opl}`, status_anterior: null, status_novo: 'Em Espera PCP', ...quem })),
    { opl_id: lida.id, numero_opl: lida.opl, setor: usuario?.perfil || 'Comercial', evento: `OP copiada ${criadas.length === 1 ? 'para' : `${criadas.length} vezes, para`}: ${criadas.map(c => c.numero).join(', ')}`, status_anterior: lida.status_geral, status_novo: lida.status_geral, ...quem },
  ]);
  if (erroLog) avisos.push(`o histórico das OPs não foi gravado (${erroLog.message})`);
  return { criadas, avisos };
}


// ── a cópia da OS (SAC) ──────────────────────────────────────────────────────
// A OS NÃO é criada direto daqui: a abertura de OS do SAC faz mais do que gravar a linha (o status inicial depende do tipo de serviço, a OS não veicular nasce junto com a
// demanda do Laboratório, a de acompanhamento da engenharia com a da Engenharia, e saem o aviso e as menções). Por isso o "Copiar OS" abre a própria tela de Nova OS do SAC já
// PREENCHIDA com a OS de origem e com uma linha de equipamento por cópia (sem serial nem chassi), no modo "uma OS para cada equipamento (lote)", que já dá a cada OS o seu número
// na sequência. A pessoa confere tudo na tela, preenche o serial de cada equipamento e cria.

/** O campo "Qtd" da Nova OS do SAC vai até 20. */
export const MAX_COPIAS_OS = 20;

export const LEVA_DA_OS = [
  'cliente, empresa, tipo de serviço, equipamento ou veículo (marca, modelo e o veículo do catálogo), defeito reclamado e observações',
  'prazos, valores, itens da cotação, despesas, dados de faturamento, acompanhamento de engenharia e vínculo com o CRM',
];
export const NAO_LEVA_DA_OS = [
  'número de série, chassi, os acessórios que vieram junto, as fotos e os documentos anexados',
  'o andamento: status, orçamento e aprovação, execução, nota fiscal e histórico',
];

const textoOuVazio = (v: any) => (v === null || v === undefined ? '' : String(v));
const diaOuVazio = (v: any) => textoOuVazio(v).slice(0, 10);
const dinheiroEmTexto = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

/** Tira de cada item da lista de equipamentos o que identifica UM equipamento (chassi, placa, número de série). */
export const semIdentificacaoIndividual = (e: any) => Object.fromEntries(Object.entries(e || {}).filter(([k]) => !/chassi|placa|serie|serial/i.test(k)));

/** O formulário de Nova OS do SAC preenchido com a OS de origem. `quantidade` é quantas OSs iguais criar (cada uma com um equipamento); OS que já tem mais de um equipamento
 *  na lista é copiada inteira, uma por vez. */
export function formularioDaCopiaDaOs(origem: any, quantidade: number) {
  const lista: any[] = Array.isArray(origem?.equipamentos_lista) ? origem.equipamentos_lista.filter((e: any) => e && typeof e === 'object') : [];
  const eq0 = lista[0] || {};
  const varios = lista.length > 1;
  const qtd = varios ? lista.length : Math.max(1, Math.min(MAX_COPIAS_OS, Math.floor(Number(quantidade)) || 1));
  const defeito = textoOuVazio(eq0.defeito || origem?.defeito_reclamado);
  const equipLista = varios
    ? lista.map(e => ({ marca: '', modelo: '', defeito: '', veiculo_id: '', ...semIdentificacaoIndividual(e), numero_serie: '', chassi: '' }))
    : Array.from({ length: qtd }, () => ({ marca: textoOuVazio(eq0.marca || origem?.marca), modelo: textoOuVazio(eq0.modelo || origem?.modelo), numero_serie: '', chassi: '', defeito, veiculo_id: textoOuVazio(eq0.veiculo_id) }));
  const form = {
    empresa: origem?.empresa || 'ACN',
    tipo_servico: textoOuVazio(origem?.tipo_servico) || 'Orçamento',
    tipo_projeto: textoOuVazio(origem?.tipo_projeto),
    equipamento_nome: textoOuVazio(origem?.equipamento_nome),
    marca: equipLista[0]?.marca || '', modelo: equipLista[0]?.modelo || '', numero_serie: '',
    quantidade: qtd,
    defeito_reclamado: defeito,
    observacoes: textoOuVazio(origem?.observacoes),
    cliente_nome: textoOuVazio(origem?.cliente_nome), empresa_orgao: textoOuVazio(origem?.empresa_orgao), endereco: textoOuVazio(origem?.endereco),
    cpf_cnpj: textoOuVazio(origem?.cpf_cnpj), telefone: textoOuVazio(origem?.telefone), email: textoOuVazio(origem?.email),
    prazo_orcamento: diaOuVazio(origem?.prazo_orcamento), data_prevista_entrega: diaOuVazio(origem?.data_prevista_entrega),
    acessorios: [] as any[],
    despesa_deslocamento: dinheiroEmTexto(origem?.despesa_deslocamento), despesa_hospedagem: dinheiroEmTexto(origem?.despesa_hospedagem), despesa_alimentacao: dinheiroEmTexto(origem?.despesa_alimentacao),
    is_veiculo: !!origem?.is_manutencao_veicular,
    tipo_avaliacao: origem?.tipo_avaliacao || 'Presencial',
    acompanhamento_engenharia: !!origem?.acompanhamento_engenharia,
    itens_cotacao: clonar(Array.isArray(origem?.itens_cotacao) ? origem.itens_cotacao : []),
    cnpj_faturamento: textoOuVazio(origem?.cnpj_faturamento), razao_social_faturamento: textoOuVazio(origem?.razao_social_faturamento), endereco_faturamento: textoOuVazio(origem?.endereco_faturamento),
    valor_total: origem?.valor_total ?? '', valor_mao_de_obra: origem?.valor_mao_de_obra ?? '',
    data_faturamento: '',
    crm_oportunidade_id: origem?.crm_oportunidade_id || null,
  };
  return { form, equipLista, emLote: !varios && qtd > 1, varios };
}
