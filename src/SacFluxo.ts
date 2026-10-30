// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// SAC — O CAMINHO DA OS: COBRADA × SEM COBRANÇA (PLANO_SAC_FLUXO.md, etapa S1, decisões do usuário em 27/10/2026)
//
// Até aqui a OS de garantia que tinha veículo caía no fluxo da manutenção veicular e começava por COTAÇÃO de preço ao cliente (e queria terminar no Fiscal): o SAC perguntou "por que aparece
// em cotação se é garantia?". A regra decidida: a OS nasce dizendo se é COBRADA ou SEM COBRANÇA (garantia dentro da cobertura ou cortesia):
//   • sem cobrança: nunca passa por cotação nem por aprovação do cliente, depois do CQ vai a "Concluído" e à entrega, e NÃO vai ao Fiscal;
//   • cobrada: o fluxo de sempre (cotação/orçamento → aprovação → execução → CQ → Fiscal → entrega).
// A garantia começa na FICHA da aba Garantia (avaliação da cobertura, fornecedor, custos e autorização já existem): a OS de garantia nasce de uma ficha liberada e guarda `garantia_id`.
// A marca fica em `sac_ordens_servico.cobranca`; NULA = OS anterior a esta regra e vale pelo tipo de serviço (tipo "Garantia" = sem cobrança) — nenhuma linha antiga é regravada.
// Módulo sem tela: é a regra pura, para testar sem navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { bloqueioForaDaGarantia, podeVerGarantia, COBERTURAS_GARANTIA } from './GarantiaModelo';
import { lerValorDigitado } from './LerValor';

export type Cobranca = 'garantia' | 'cobrada';
export const ROTULOS_COBRANCA: Record<Cobranca, string> = { garantia: 'Sem cobrança (garantia ou cortesia)', cobrada: 'Cobrada do cliente' };
export const TIPO_GARANTIA = 'Garantia';

/** A OS é cobrada ou sem cobrança? A marca gravada manda; sem ela, o tipo de serviço "Garantia" é sem cobrança e o resto é cobrado. */
export function cobrancaDaOS(os: any): Cobranca {
  if (os?.cobranca === 'garantia' || os?.cobranca === 'cobrada') return os.cobranca;
  return os?.tipo_servico === TIPO_GARANTIA ? 'garantia' : 'cobrada';
}
export const osSemCobranca = (os: any): boolean => cobrancaDaOS(os) === 'garantia';

/**
 * A etapa em que a OS NASCE.
 *  • veicular: sem cobrança (ou avaliação presencial) começa em "Em Provisionamento" (a Produção marca a data); só a cobrada com avaliação remota começa em "Em Cotação";
 *  • do Laboratório: sem cobrança nasce "Aprovado" (vai direto para a execução, com a demanda do Laboratório); a cobrada nasce em "Diagnóstico".
 */
export function statusInicialDaOS({ ehVeicular, tipoAvaliacao, cobranca }: { ehVeicular: boolean; tipoAvaliacao?: string | null; cobranca: Cobranca }): string {
  if (ehVeicular) return cobranca === 'garantia' || tipoAvaliacao !== 'Remota' ? 'Em Provisionamento' : 'Em Cotação';
  return cobranca === 'garantia' ? 'Aprovado' : 'Diagnóstico';
}

/** A etapa depois que a Qualidade aprova a OS veicular: a cobrada vai ao SAC enviar ao Fiscal; a sem cobrança já está concluída e vai à entrega. */
export const statusAposCQ = (os: any): string => (osSemCobranca(os) ? 'Concluído' : 'Aguardando Envio Fiscal');

/** OS aberta para atendimento em garantia, antes de existir a marca (OS antiga) ou pela ficha. */
export const ehOsDeGarantia = (os: any): boolean => os?.tipo_servico === TIPO_GARANTIA || !!os?.garantia_id;

/** "Em Cotação" de uma OS sem cobrança (as 9 OS de garantia que nasceram antes desta regra): não há cotação a fazer; a ação é seguir para o atendimento. */
export const cotacaoSemSentido = (os: any): boolean => os?.status === 'Em Cotação' && osSemCobranca(os);

// ── a ficha da Garantia libera a OS? ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A ficha pode gerar uma OS de execução agora?
 *  • o atendimento está aberto e a pessoa o enxerga (quem abriu, o responsável, os copiados e o Admin — a regra de visibilidade da Garantia);
 *  • a avaliação técnica está registrada ("sem avaliação, não segue", regra da G2): é ela que diz a cobertura;
 *  • fora da garantia: só com o alinhamento aceito pelo cliente e a autorização da direção (a mesma trava do restante da ficha).
 * O fornecedor e quem executa seguem em paralelo na ficha: não travam a abertura da OS (suposição minha, 27/10/2026, registrada no plano).
 */
export function podeGerarOsDaGarantia(g: any, u: any): { ok: boolean; motivo: string } {
  if (!g || g.situacao !== 'aberto') return { ok: false, motivo: 'O atendimento não está aberto.' };
  if (!podeVerGarantia(g, u)) return { ok: false, motivo: 'Você não participa deste atendimento.' };
  if (!g.avaliacao) return { ok: false, motivo: 'Falta a avaliação técnica do atendimento (é ela que diz se está dentro da garantia).' };
  const fora = bloqueioForaDaGarantia(g);
  if (fora.bloqueado) return { ok: false, motivo: `Atendimento fora da garantia: falta ${fora.faltas.join(' e ')}.` };
  return { ok: true, motivo: '' };
}

/**
 * Como a ficha sugere cobrar a OS: dentro da garantia (ou "a confirmar", que a ficha não trava) = sem cobrança; fora da garantia = cobrada, a não ser que a direção tenha aprovado uma CORTESIA.
 * É só a sugestão: quem abre a OS vê e pode trocar.
 */
export function cobrancaSugeridaDaGarantia(g: any): Cobranca {
  const cobertura = g?.avaliacao?.cobertura;
  if (cobertura !== 'fora') return 'garantia';
  const cortesia = (Array.isArray(g?.autorizacoes) ? g.autorizacoes : []).some((a: any) => a.status === 'aprovada' && a.tipo === 'cortesia');
  return cortesia ? 'garantia' : 'cobrada';
}

/** "(47) 99999-1234" ou "fulano@x.com" → o campo certo da OS. O contato da ficha é um texto só. */
export function separarContato(contato: any): { telefone: string; email: string } {
  const t = String(contato ?? '').trim();
  if (!t) return { telefone: '', email: '' };
  if (t.includes('@')) return { telefone: '', email: t };
  return { telefone: t, email: '' };
}

/**
 * O que a ficha já sabe e vai preenchido na Nova OS: o cliente, o contato, o veículo do catálogo, o chassi e a falha. É o equipamento da OS; o tipo de equipamento e o resto o SAC completa.
 * A OS de uma ficha é sempre de veículo (a ficha exige veículo do catálogo e placa ou chassi); se o equipamento for ao Laboratório, o SAC desmarca.
 */
export function formularioDaOsDeGarantia(g: any) {
  const { telefone, email } = separarContato(g?.cliente_contato);
  const form = {
    tipo_servico: TIPO_GARANTIA,
    cliente_nome: String(g?.cliente_nome || ''), telefone, email,
    defeito_reclamado: String(g?.descricao_falha || ''),
    is_veiculo: true,
    garantia_id: g?.id || null,
    cobranca: cobrancaSugeridaDaGarantia(g) as Cobranca,
    _garantia_numero: String(g?.numero || ''),
  };
  const equip = { marca: '', modelo: String(g?.veiculo_nome || ''), numero_serie: '', chassi: String(g?.chassi || ''), defeito: String(g?.descricao_falha || ''), veiculo_id: String(g?.veiculo_id || '') };
  return { form, equipLista: [equip] };
}

/** A frase que barra a abertura de uma OS de garantia sem ficha (ou com a ficha que não libera); null = pode abrir. */
export function faltaFichaDaGarantia({ tipo_servico, garantia_id }: { tipo_servico?: string; garantia_id?: string | null }): string | null {
  if (tipo_servico !== TIPO_GARANTIA) return null;
  if (!garantia_id) return 'A OS de garantia começa pela ficha da aba Garantia: escolha o atendimento de garantia desta OS (ou abra a ficha antes). Garantia não passa por cotação.';
  return null;
}

/** A linha da lista de fichas na Nova OS: "GAR-0001/2026 — cliente — veículo (dentro da garantia)". */
export const rotuloDaFicha = (g: any): string =>
  `${g?.numero || '—'} — ${g?.cliente_nome || '—'} — ${g?.veiculo_nome || '—'}${g?.avaliacao?.cobertura ? ` (${COBERTURAS_GARANTIA[g.avaliacao.cobertura] || g.avaliacao.cobertura})` : ''}`;

// ── S2 (PLANO_SAC_FLUXO.md, 27/10/2026): a OS COBRADA concluída chega ao Fiscal ──────────────────────────────────────────────────────────────
// Decisão do usuário: toda OS cobrada (veicular e de Laboratório) depois de concluída vai ao Fiscal; a data da nota que o Fiscal emitiu vira a data de faturamento da OS (a da comissão),
// e o SAC deixa de digitá-la. A OS sem cobrança nunca passa por aqui.
export const STATUS_AGUARDANDO_NOTA = 'Aguardando Emissão NF';
export const STATUS_OS_FATURADA = 'Faturada - Aguardando Entrega';

/** O SAC pode enviar esta OS ao Fiscal agora? 'veicular' = depois do CQ (com os seriais dos itens); 'laboratorio' = depois de concluída (com o valor e os dados da nota). null = não. */
export function caminhoParaOFiscal(os: any): 'veicular' | 'laboratorio' | null {
  if (!os || osSemCobranca(os)) return null;
  if (os.status === 'Aguardando Envio Fiscal' && os.is_manutencao_veicular) return 'veicular';
  if (os.status === 'Concluído') return 'laboratorio';
  return null;
}

const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');

/** O que falta para o Fiscal conseguir emitir a nota de uma OS do Laboratório; vazio = pode enviar. `valor`: o número já lido (ou null). */
export function validarEnvioAoFiscal({ valor, documento }: { valor: number | null; documento: any }): string[] {
  const falta: string[] = [];
  if (valor == null || !(valor > 0)) falta.push('o valor total da OS (maior que zero)');
  const d = soDigitos(documento);
  if (d.length !== 11 && d.length !== 14) falta.push('o CPF (11 dígitos) ou o CNPJ (14 dígitos) para a nota');
  return falta;
}

/** O que a janela "Enviar ao Fiscal" traz preenchido: o valor da OS (ou o do orçamento) e o documento de faturamento (ou o do cliente). */
export function dadosIniciaisParaOFiscal(os: any) {
  const valor = os?.valor_total ?? os?.valor_orcamento;
  return {
    valor: valor == null || valor === '' ? '' : String(valor).replace('.', ','),
    documento: String(os?.cnpj_faturamento || os?.cpf_cnpj || ''),
    razao: String(os?.razao_social_faturamento || os?.cliente_nome || ''),
    endereco: String(os?.endereco_faturamento || os?.endereco || ''),
  };
}

/** A data de faturamento da OS é o DIA da nota (AAAA-MM-DD); qualquer outra coisa vira null (nunca grava lixo na coluna de data). */
export const dataDeFaturamentoDaNota = (dia: any): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(dia || '')) ? String(dia) : null);

/** O tipo de equipamento/veículo que o Fiscal vê na linha da OS. */
export function equipamentoDaOsParaOFiscal(os: any): { titulo: string; detalhe: string } {
  if (os?.is_manutencao_veicular) return { titulo: String(os?.veiculo_modelo || ''), detalhe: os?.chassi ? `Chassi ${os.chassi}` : '' };
  const modelo = [os?.marca, os?.modelo].filter(Boolean).join(' ');
  return { titulo: String(os?.equipamento_nome || ''), detalhe: [modelo, os?.numero_serie ? `Série ${os.numero_serie}` : ''].filter(Boolean).join(' · ') };
}

// ── S3 (PLANO_SAC_FLUXO.md, 29/10/2026): a OS lançada pelo card do CRM nasce com caminho ──────────────────────────────────────────────────────────
// Até aqui ela nascia "Aberta" e parava: sem botão para o SAC, sem demanda para o Laboratório (3 OS ficaram semanas sem dono). Decisão do usuário (27/10/2026): a OS do card já vem VENDIDA (o valor e o pedido
// de venda são da venda), então não há cotação: vai direto para a execução. Quem executa o SAC escolhe ao lançar (resposta do usuário em 29/10/2026): o LABORATÓRIO (nasce "Aprovado" e recebe a demanda
// de execução, como a garantia) ou "o SAC conclui" (nasce "Em Execução", para o serviço feito fora do Laboratório). Concluída, a OS COBRADA vai ao Fiscal pelo botão de sempre (S2).
export type QuemExecuta = 'laboratorio' | 'sac';
export const ROTULOS_QUEM_EXECUTA: Record<QuemExecuta, string> = { laboratorio: 'Laboratório', sac: 'O SAC conclui' };

/** Qualquer coisa que não seja 'sac' vale como Laboratório (o padrão da tela). */
export const quemExecutaValido = (v: any): QuemExecuta => (v === 'sac' ? 'sac' : 'laboratorio');

/** A etapa em que a OS lançada pelo card NASCE: o Laboratório começa "Aprovado" (a demanda de execução o põe em "Em Execução" quando ele inicia); o SAC já começa "Em Execução". */
export const statusInicialDaOsDoCrm = (quem: any): string => (quemExecutaValido(quem) === 'sac' ? 'Em Execução' : 'Aprovado');

/** O SAC pode concluir esta OS agora? Só a que ele mesmo executa e está em execução. */
export const podeConcluirPeloSac = (os: any): boolean => os?.quem_executa === 'sac' && os?.status === 'Em Execução';

/** A OS está com o Laboratório (o SAC não tem o que fazer; é o texto que ocupa o lugar do botão)? Só a OS lançada com essa marca. */
export const estaComOLaboratorio = (os: any): boolean => os?.quem_executa === 'laboratorio' && (os?.status === 'Aprovado' || os?.status === 'Em Execução');

/** O pedido de venda do card, como a OS o guarda: só os dígitos, até 4 (o padrão do `numero_pv` do CRM); vazio = sem pedido de venda. */
export const numeroPvParaOS = (pv: any): string | null => String(pv ?? '').replace(/\D/g, '').slice(0, 4) || null;

/** A demanda de execução do Laboratório que nasce junto da OS do card (mesma forma da que a garantia cria na Nova OS do SAC). */
export function demandaDeExecucaoDaOsDoCrm({ numero, equipamento, defeito, usuario, agora, osId }: { numero: string; equipamento?: string; defeito?: string; usuario: any; agora: string; osId: string }) {
  return {
    setor_destino: 'Laboratorio',
    descricao: `[SAC-EXEC] ${numero} — ${equipamento || '—'} | ${String(defeito || '').trim() || 'Ver OS'}`,
    numero_opl: numero,
    status: 'Pendente',
    criado_por: usuario?.email,
    criado_por_nome: usuario?.nome,
    data_abertura: agora,
    sac_os_id: osId,
    sac_fase: 'execucao',
    logs_demanda: [{ texto: 'OS lançada pelo card do CRM (serviço vendido): vai direto para a execução, sem cotação.', usuario: usuario?.nome, hora: agora }],
  };
}

// ── S4 (PLANO_SAC_FLUXO.md, 29/10/2026): o fim da OS por cancelamento e a OS parada ───────────────────────────────────────────────────────────────────
// Antes não existia "cancelar" (o status "Cancelada" era previsto no menu, mas nada o gravava) e nada dizia há quantos dias a OS estava na mesma etapa nem quem tinha que agir: 8 OS esperavam o SAC enviar o
// orçamento havia mais de 60 dias, sem ninguém cobrado. Decisões do usuário (29/10/2026): cancela quem tem a aba SAC, sempre com motivo; a demanda aberta do Laboratório/Engenharia recebe só um recado e
// um aviso (o setor encerra; eu não fecho a demanda por ele); OS PARADA é a que está 7 dias ou mais na mesma etapa.
export const STATUS_OS_CANCELADA = 'Cancelada';
export const STATUS_OS_ENCERRADOS = ['Entregue', STATUS_OS_CANCELADA];
export const PRAZO_OS_PARADA_DIAS = 7;
export const OPCOES_OS_PARADA_DIAS = [7, 15, 30];
export type QuemAge = 'SAC' | 'Laboratório' | 'Produção' | 'Qualidade' | 'Fiscal' | 'Cliente';
export const QUEM_AGE: QuemAge[] = ['SAC', 'Laboratório', 'Produção', 'Qualidade', 'Fiscal', 'Cliente'];

/** Desde quando a OS está na etapa em que está: o gatilho do banco (`status_desde`); a OS anterior à regra usa a última atualização (e, sem ela, a abertura) como aproximação. */
export function desdeQuandoNaEtapa(os: any): Date | null {
  const bruto = os?.status_desde || os?.atualizado_em || os?.data_abertura;
  const d = bruto ? new Date(bruto) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

/** Dias corridos na etapa atual (inteiro, nunca negativo); null se a OS não tem data nenhuma. */
export function diasNaEtapa(os: any, agora: Date = new Date()): number | null {
  const d = desdeQuandoNaEtapa(os);
  return d ? Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000)) : null;
}

/** OS parada = ainda em andamento e há `limite` dias ou mais na mesma etapa. OS entregue ou cancelada nunca está parada. */
export function osParada(os: any, limite: number = PRAZO_OS_PARADA_DIAS, agora: Date = new Date()): boolean {
  if (!os || STATUS_OS_ENCERRADOS.includes(os.status)) return false;
  const dias = diasNaEtapa(os, agora);
  return dias != null && dias >= limite;
}

/**
 * Quem tem que agir agora e o que fazer, pela etapa da OS. null = a OS está encerrada (entregue ou cancelada).
 * A OS lançada pelo card (S3) segue `quem_executa`: o SAC, o Laboratório; a veicular em execução é da Produção.
 */
export function quemTemQueAgir(os: any): { quem: QuemAge; oque: string } | null {
  if (!os || STATUS_OS_ENCERRADOS.includes(os.status)) return null;
  const veicular = !!os.is_manutencao_veicular;
  switch (os.status) {
    case 'Aberta': return { quem: 'SAC', oque: 'OS sem caminho: decidir se segue, cancela ou cobra' };
    case 'Diagnóstico': return { quem: veicular ? 'Produção' : 'Laboratório', oque: 'Terminar o diagnóstico e o orçamento' };
    case 'Orçamento Pronto': return { quem: 'SAC', oque: 'Enviar o orçamento ao cliente' };
    case 'Orç. Enviado': return { quem: 'Cliente', oque: 'Resposta do cliente ao orçamento (o SAC cobra)' };
    case 'Aprovado': return { quem: 'Laboratório', oque: 'Iniciar a execução' };
    case 'Em Cotação': return { quem: 'SAC', oque: osSemCobranca(os) ? 'Seguir sem cotação (garantia)' : 'Montar e enviar a cotação ao cliente' };
    case 'Aguardando Aprovação Cliente': return { quem: 'Cliente', oque: 'Aprovação da cotação (o SAC cobra)' };
    case 'Em Provisionamento': return { quem: 'Produção', oque: 'Marcar a data do atendimento' };
    case 'Aguardando Aceite SAC': return { quem: 'SAC', oque: 'Confirmar a data definida pela Produção' };
    case 'Provisionada': case 'Aguardando Início': return { quem: 'Produção', oque: 'Receber o veículo e iniciar' };
    case 'Verificação e Orçamento': return { quem: 'Produção', oque: 'Verificar e orçar' };
    case 'Em Execução':
      if (os.quem_executa === 'sac') return { quem: 'SAC', oque: 'Concluir a OS quando o serviço terminar' };
      return { quem: veicular ? 'Produção' : 'Laboratório', oque: 'Executar o serviço' };
    case 'Aguardando CQ': return { quem: 'Qualidade', oque: 'Auditar a OS' };
    case 'Concluído': return osSemCobranca(os) ? { quem: 'SAC', oque: 'Entregar ao cliente' } : { quem: 'SAC', oque: 'Enviar ao Fiscal' };
    case 'Aguardando Envio Fiscal': return { quem: 'SAC', oque: 'Informar os seriais e enviar ao Fiscal' };
    case 'Aguardando Emissão NF': return { quem: 'Fiscal', oque: 'Emitir a nota' };
    case 'Faturada - Aguardando Entrega': return { quem: 'SAC', oque: 'Entregar ao cliente' };
    case 'Reprovado': return { quem: 'SAC', oque: 'Reavaliar ou encerrar a OS' };
    default: return { quem: 'SAC', oque: 'Conferir a OS' };
  }
}

/** Por que a OS não pode ser cancelada agora; null = pode. Depois que o Fiscal recebeu a OS (nota em emissão ou emitida) ou ela foi entregue, não se cancela por aqui. */
export function motivoQueNaoCancela(os: any): string | null {
  if (!os) return 'OS não encontrada.';
  if (os.status === STATUS_OS_CANCELADA) return 'A OS já está cancelada.';
  if (os.status === 'Entregue') return 'A OS já foi entregue.';
  if (os.status === STATUS_AGUARDANDO_NOTA || os.status === STATUS_OS_FATURADA) return 'A OS já está no Fiscal (nota em emissão ou emitida): o cancelamento passa pelo Fiscal.';
  return null;
}

export const podeCancelarOS = (os: any): boolean => motivoQueNaoCancela(os) === null;

/** As demandas do Laboratório/Engenharia que ainda estão abertas (nem concluídas nem canceladas): são as que recebem o recado do cancelamento. */
export const demandasAbertasDaOS = (demandas: any[]): any[] =>
  (demandas || []).filter((d: any) => !['Concluido', 'Concluida', 'Concluído', 'Concluída', 'Cancelada', 'Cancelado'].includes(String(d?.status || '')));

/** O recado que vai no histórico da demanda aberta quando a OS é cancelada. */
export const recadoDoCancelamento = (os: any, motivo: string, usuario: any, agora: string) =>
  ({ texto: `OS ${os?.numero_os || ''} CANCELADA pelo SAC. Motivo: ${String(motivo).trim()}. Encerre esta demanda.`, usuario: usuario?.nome, hora: agora });

/** O que a gravação do cancelamento põe na OS. */
export const camposDoCancelamento = (motivo: string, usuario: any, agora: string) =>
  ({ status: STATUS_OS_CANCELADA, motivo_cancelamento: String(motivo).trim(), cancelada_em: agora, cancelada_por: usuario?.nome || usuario?.email || null, atualizado_em: agora });

/** O painel "o que está com o SAC hoje": quantas OS em andamento há com cada um que tem que agir, quantas já estão paradas e a lista do que é do SAC (as mais paradas primeiro). */
export function resumoDoQueEstaComQuem(ordens: any[], limite: number = PRAZO_OS_PARADA_DIAS, agora: Date = new Date()) {
  const porQuem: Record<string, { total: number; paradas: number }> = {};
  for (const q of QUEM_AGE) porQuem[q] = { total: 0, paradas: 0 };
  const doSac: { os: any; oque: string; dias: number | null }[] = [];
  for (const os of ordens || []) {
    const a = quemTemQueAgir(os);
    if (!a) continue;
    porQuem[a.quem].total++;
    if (osParada(os, limite, agora)) porQuem[a.quem].paradas++;
    if (a.quem === 'SAC') doSac.push({ os, oque: a.oque, dias: diasNaEtapa(os, agora) });
  }
  doSac.sort((x, y) => (y.dias ?? -1) - (x.dias ?? -1));
  return { porQuem, doSac };
}

// ── S5 (PLANO_SAC_FLUXO.md, 29/10/2026): a tela do SAC fala uma língua só ─────────────────────────────────────────────────────────────────────────
// Antes: a lista tinha cor e filtro para "Em Manutenção" e "Manutenção Concluída", mas nada mais grava esses dois (a Produção e a Qualidade gravam "Em Execução"; o botão "Entrega" de "Manutenção
// Concluída" era um atalho morto que pularia o CQ e o Fiscal); o único "fluxo" na tela era a legenda do Laboratório; e o quadro punha a OS faturada em "Concluído" mesmo faltando entregar.
// Agora: cada caminho tem a sua lista de etapas (aqui), a barra de progresso e as legendas leem dela, e o quadro tem a coluna "No Fiscal / aguardando entrega".

/** As etapas de cada caminho, na ordem em que a OS passa por elas. A OS lançada pelo card (S3) entra no caminho do Laboratório já "Aprovada": as etapas de antes contam como feitas. */
export const CAMINHOS_DA_OS = {
  laboratorio: ['Diagnóstico', 'Orçamento Pronto', 'Orç. Enviado', 'Aprovado', 'Em Execução', 'Concluído', 'Aguardando Emissão NF', 'Faturada - Aguardando Entrega', 'Entregue'],
  laboratorioSemCobranca: ['Aprovado', 'Em Execução', 'Concluído', 'Entregue'],
  veicularRemota: ['Em Cotação', 'Aguardando Aprovação Cliente', 'Em Provisionamento', 'Aguardando Aceite SAC', 'Provisionada', 'Em Execução', 'Aguardando CQ', 'Aguardando Envio Fiscal', 'Aguardando Emissão NF', 'Faturada - Aguardando Entrega', 'Entregue'],
  veicularPresencial: ['Em Provisionamento', 'Aguardando Aceite SAC', 'Provisionada', 'Verificação e Orçamento', 'Aguardando Aprovação Cliente', 'Em Execução', 'Aguardando CQ', 'Aguardando Envio Fiscal', 'Aguardando Emissão NF', 'Faturada - Aguardando Entrega', 'Entregue'],
  veicularSemCobranca: ['Em Provisionamento', 'Provisionada', 'Em Execução', 'Aguardando CQ', 'Concluído', 'Entregue'],
} as const;

/** Nomes que valem como outra etapa do caminho ("Aguardando Início" é a Provisionada à espera do início). */
const ETAPA_EQUIVALENTE: Record<string, string> = { 'Aguardando Início': 'Provisionada' };

/** O caminho (lista de etapas) em que a OS anda: depende de ser veicular ou do Laboratório, de ser cobrada ou sem cobrança e, no veicular cobrado, de a avaliação ser remota ou presencial. */
export function etapasDoCaminho(os: any): readonly string[] {
  const semCobranca = osSemCobranca(os);
  if (os?.is_manutencao_veicular) return semCobranca ? CAMINHOS_DA_OS.veicularSemCobranca : os?.tipo_avaliacao === 'Remota' ? CAMINHOS_DA_OS.veicularRemota : CAMINHOS_DA_OS.veicularPresencial;
  return semCobranca ? CAMINHOS_DA_OS.laboratorioSemCobranca : CAMINHOS_DA_OS.laboratorio;
}

export type PassoDaOS = { nome: string; estado: 'feita' | 'atual' | 'futura' };

/** Onde a OS está no caminho dela: as etapas com o estado de cada uma e "etapa N de M". null = não há barra (cancelada, reprovada ou uma etapa que o caminho não conhece: melhor sem barra do que uma barra errada). */
export function progressoDaOS(os: any): { passos: PassoDaOS[]; indice: number; total: number; percentual: number; atual: string } | null {
  if (!os || os.status === STATUS_OS_CANCELADA || os.status === 'Reprovado') return null;
  const etapas = etapasDoCaminho(os);
  const atual = ETAPA_EQUIVALENTE[os.status] || os.status;
  const indice = etapas.indexOf(atual);
  if (indice < 0) return null;
  return {
    passos: etapas.map((nome, k) => ({ nome, estado: k < indice ? 'feita' : k === indice ? 'atual' : 'futura' })),
    indice, total: etapas.length, percentual: Math.round(((indice + 1) / etapas.length) * 100), atual,
  };
}

/** As legendas de fluxo da tela: o caminho do Laboratório e o do veículo (as duas cobradas; a OS sem cobrança pula o orçamento e o Fiscal). */
export const LEGENDAS_DE_FLUXO: { rotulo: string; etapas: readonly string[] }[] = [
  { rotulo: 'Laboratório', etapas: CAMINHOS_DA_OS.laboratorio },
  { rotulo: 'Veículo (presencial)', etapas: CAMINHOS_DA_OS.veicularPresencial },
  { rotulo: 'Veículo (remota)', etapas: CAMINHOS_DA_OS.veicularRemota },
];

export type ColunaDoQuadro = 'pendente' | 'andamento' | 'fiscal' | 'concluido';
export const COLUNAS_DO_QUADRO: { id: ColunaDoQuadro; rotulo: string; familia: string }[] = [
  { id: 'pendente', rotulo: 'PENDENTE', familia: 'atencao' },
  { id: 'andamento', rotulo: 'EM ANDAMENTO', familia: 'info' },
  { id: 'fiscal', rotulo: 'NO FISCAL / AGUARDANDO ENTREGA', familia: 'marca' },
  { id: 'concluido', rotulo: 'CONCLUÍDO', familia: 'ok' },
];

/**
 * Em que coluna do quadro a OS fica (escolha do usuário em 05/10/2026: "só pela etapa de trabalho"; a coluna do Fiscal veio na S5):
 * PENDENTE = Aberta e Diagnóstico · NO FISCAL / AGUARDANDO ENTREGA = do envio ao Fiscal até a entrega ("Faturada" não parece mais terminada) · CONCLUÍDO = Concluído e Entregue · EM ANDAMENTO = o resto.
 * Reprovado e Cancelada ficam FORA do quadro (null). Uma situação que ninguém classificou cai em EM ANDAMENTO, para nenhuma OS sumir.
 */
export function colunaDoQuadro(status: string): ColunaDoQuadro | null {
  if (status === 'Reprovado' || status === STATUS_OS_CANCELADA) return null;
  if (['Aberta', 'Diagnóstico'].includes(status)) return 'pendente';
  if (['Aguardando Envio Fiscal', STATUS_AGUARDANDO_NOTA, STATUS_OS_FATURADA].includes(status)) return 'fiscal';
  if (['Concluído', 'Entregue'].includes(status)) return 'concluido';
  return 'andamento';
}

// ── MOVER A OS ENTRE AS ETAPAS (pedido do usuário em 29/10/2026) ──────────────────────────────────────────────────────────────────────────────────
// O SAC passa a mover a OS arrastando o cartão no quadro ou pelo menu "Mover para…", com a janela de cada passo. Escopo decidido com o usuário: o SAC AVANÇA onde é ele quem age (enviar o orçamento, aprovar ou
// reprovar, iniciar e concluir a execução, enviar ao Fiscal, entregar, cancelar) e pode VOLTAR UMA etapa, com motivo. As etapas da Produção (Provisionada, Verificação…), da Qualidade (CQ) e do Fiscal
// (Aguardando Emissão NF) continuam sendo dos setores: nenhum movimento entra nelas nem sai delas por aqui, para não pular o CQ nem o Fiscal. Esta parte é só a regra (sem tela, para testar em unidade).
export type TipoMovimento = 'avancar' | 'voltar' | 'cancelar';
// `menu`: o texto do item no menu ⋯ quando "Mover para X" não diz o que o passo faz (o registro de atendimento já realizado)
export type Movimento = { id: string; processo: string; para: string; rotulo: string; ajuda: string; tipo: TipoMovimento; menu?: string };
const mov = (processo: string, para: string, rotulo: string, ajuda: string, tipo: TipoMovimento = 'avancar', menu?: string): Movimento => ({ id: `${processo}>${para}`, processo, para, rotulo, ajuda, tipo, ...(menu ? { menu } : {}) });

// ── REGISTRAR ATENDIMENTO JÁ REALIZADO (pedido do SAC em 30/10/2026) ──────────────────────────────────────────────────────────────────────────────────
// O caso que originou: o lote de 7 viaturas da Defesa Civil de Taió (recall da prussiana, OS-0044 a 0050) foi atendido no local, fora da fábrica, mas as OS ficaram em "Em Cotação", e o único passo do SAC era
// "Seguir sem cotação", que manda a OS à Produção e à Qualidade para refazerem no sistema o que já foi feito. Regras decididas com o usuário em 30/10/2026: o SAC registra o atendimento (data, quem fez e o que
// foi feito, tudo obrigatório) e a OS vai direto a "Concluído"; vale para a OS que a fábrica AINDA NÃO executou, cobrada ou não (a cobrada segue ao Fiscal e a sem cobrança à entrega, como as outras); as OS de
// um mesmo lote podem ser registradas de uma vez. O registro fica em `sac_ordens_servico.atendimento_externo` (jsonb). NÃO se grava `data_conclusao_manutencao` nem `tecnico_responsavel` de propósito: são os
// campos que a comissão da Produção (RH) e o KPI da execução leem, e um serviço feito por fora não é produção da fábrica.
export const ETAPAS_ANTES_DA_EXECUCAO = ['Aberta', 'Diagnóstico', 'Orçamento Pronto', 'Orç. Enviado', 'Aprovado', 'Em Cotação', 'Aguardando Aprovação Cliente', 'Em Provisionamento', 'Aguardando Aceite SAC', 'Provisionada', 'Aguardando Início'];

/** Por que o atendimento desta OS não pode ser registrado como já realizado; null = pode. */
export function motivoQueNaoRegistraAtendimento(os: any): string | null {
  if (!os) return 'OS não encontrada.';
  const n = os.numero_os || 'A OS';
  if (STATUS_OS_ENCERRADOS.includes(os.status)) return `A ${n} está encerrada (${os.status}).`;
  if (!ETAPAS_ANTES_DA_EXECUCAO.includes(os.status)) return `A ${n} está em "${os.status}": a fábrica já está com ela ou já a executou. Só se registra o atendimento de uma OS que a fábrica ainda não executou.`;
  if (os.is_manutencao_veicular && os.data_chegada_veiculo) return `O veículo da ${n} já chegou à fábrica: o atendimento é da Produção, não um atendimento feito fora.`;
  return null;
}
export const podeRegistrarAtendimentoRealizado = (os: any): boolean => motivoQueNaoRegistraAtendimento(os) === null;

/** Para onde a OS vai depois de registrada: a cobrada ao Fiscal, a sem cobrança à entrega (a mesma regra de toda OS "Concluído"). */
export const proximoPassoDoRegistro = (os: any): string => (osSemCobranca(os) ? 'Entrega' : 'Enviar ao Fiscal');

export const CAMPOS_DO_REGISTRO: CampoDoMovimento[] = [
  { chave: 'data', rotulo: 'Data do atendimento', tipo: 'data', obrigatorio: true, ajuda: 'O dia em que o serviço foi feito (não pode ser uma data futura).' },
  { chave: 'executor', rotulo: 'Quem fez o atendimento', tipo: 'texto', obrigatorio: true },
  { chave: 'observacao', rotulo: 'O que foi feito', tipo: 'area', obrigatorio: true, ajuda: 'Fica no registro da OS e no histórico: descreva o serviço, o local e o que ficou combinado.' },
];

/** O que falta (ou está errado) no registro; vazio = pode gravar. `hoje` é o dia de hoje (AAAA-MM-DD), passado de fora para a regra ser testável. */
export function validarDadosDoRegistro(dados: any, hoje: string): string[] {
  const falta: string[] = [];
  const d = String(dados?.data || '').trim();
  if (!d) falta.push('Data do atendimento: obrigatória');
  else {
    const [a, m, dia] = d.split('-').map(Number);
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(a, m - 1, dia) : null;
    if (!dt || dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== dia) falta.push(`Data do atendimento: "${d}" não é uma data válida`);
    else if (d > hoje) falta.push('Data do atendimento: não pode ser uma data futura');
    else if (d < '2020-01-01') falta.push('Data do atendimento: confira o ano (antes de 2020)');
  }
  if (!String(dados?.executor || '').trim()) falta.push('Quem fez o atendimento: obrigatório');
  if (!String(dados?.observacao || '').trim()) falta.push('O que foi feito: obrigatório');
  return falta;
}

/** O que o registro grava na OS (a tela acrescenta nada: `atualizado_em` já vai aqui). O registro guarda a etapa de antes, para quem ler depois saber de onde a OS veio. */
export function patchDoRegistroDoAtendimento(os: any, dados: any, usuario: any, agora: string): Record<string, any> {
  return {
    status: 'Concluído',
    atendimento_externo: {
      data: String(dados?.data || '').trim(),
      executor: String(dados?.executor || '').trim(),
      observacao: String(dados?.observacao || '').trim(),
      registrado_por: usuario?.nome || usuario?.email || null,
      registrado_em: agora,
      etapa_de_antes: os?.status || null,
    },
    atualizado_em: agora,
  };
}

/** O recado que a demanda aberta do setor (Laboratório/Engenharia) recebe: a OS foi concluída por fora dela; o setor encerra a demanda. */
export const recadoDoRegistro = (os: any, dados: any, usuario: any, agora: string) =>
  ({ texto: `OS ${os?.numero_os || ''}: o SAC registrou o atendimento como JÁ REALIZADO (feito em ${String(dados?.data || '').split('-').reverse().join('/')} por ${String(dados?.executor || '').trim()}). A OS foi de "${os?.status}" para "Concluído". Encerre esta demanda.`, usuario: usuario?.nome, hora: agora });

/**
 * Os movimentos que o SAC pode fazer com a OS agora (vazio = nenhum: a OS está com outro setor, ou encerrada). Cada movimento tem um `processo`: o que a tela abre (uma janela que já existia, como "Enviar
 * orçamento" ou "Enviar ao Fiscal", ou a janela de dados nova). "Cancelar" vale em qualquer etapa antes do Fiscal (a mesma regra da S4).
 */
export function movimentosDaOS(os: any): Movimento[] {
  if (!os || STATUS_OS_ENCERRADOS.includes(os.status)) return [];
  const m: Movimento[] = [];
  const veicular = !!os.is_manutencao_veicular;
  const semCobranca = osSemCobranca(os);
  const volta = (para: string) => m.push(mov('voltar', para, `Voltar para ${para}`, 'Volta uma etapa: pede o motivo, que vai ao histórico', 'voltar'));
  const entrega = () => mov(veicular ? 'entregar_veicular' : 'entregar_lab', 'Entregue', 'Entregar ao cliente', 'Abre a janela de entrega');
  switch (os.status) {
    case 'Aberta':
      m.push(mov('abrir_diagnostico', 'Diagnóstico', 'Abrir o diagnóstico', 'Abre a demanda de diagnóstico para o Laboratório'));
      m.push(mov('seguir_vendida', 'Aprovado', 'Seguir como vendida', 'A OS já está vendida: vai direto para a execução, sem cotação (o SAC escolhe quem executa)'));
      break;
    case 'Diagnóstico':
      if (!veicular) m.push(mov('informar_orcamento', 'Orçamento Pronto', 'Informar o orçamento', 'Informa o valor do orçamento (o Laboratório normalmente faz isso na demanda dele)'));
      break;
    case 'Orçamento Pronto':
      m.push(mov('enviar_orcamento', 'Orç. Enviado', 'Enviar o orçamento ao cliente', 'Abre a janela de envio do orçamento'));
      volta('Diagnóstico');
      break;
    case 'Orç. Enviado':
      m.push(mov('aprovar', 'Aprovado', 'Aprovado pelo cliente', 'Abre a janela de aprovação (nome de quem aprovou e assinatura)'));
      m.push(mov('reprovar', 'Reprovado', 'Reprovado pelo cliente', 'Abre a janela de reprovação (motivo e retirada)'));
      volta('Orçamento Pronto');
      break;
    case 'Aprovado':
      m.push(mov('iniciar_execucao', 'Em Execução', 'Iniciar a execução', 'Informa quem executa e a data de início'));
      if (!semCobranca && !os.quem_executa) volta('Orç. Enviado');   // a OS lançada pelo card e a garantia nasceram aprovadas: não há etapa de antes
      break;
    case 'Em Execução':
      if (!veicular) {   // a execução do veículo é da Produção
        m.push(os.quem_executa === 'sac' ? mov('concluir_sac', 'Concluído', 'Concluir a OS', 'O SAC conclui: confirma que o serviço terminou') : mov('concluir_lab', 'Concluído', 'Concluir a execução', 'Confirma a conclusão (o Laboratório normalmente faz isso na demanda dele)'));
        if (os.quem_executa !== 'sac') volta('Aprovado');
      }
      break;
    case 'Concluído':
      m.push(semCobranca ? entrega() : mov('enviar_fiscal_lab', 'Aguardando Emissão NF', 'Enviar ao Fiscal', 'Abre a janela do Fiscal (valor e CPF ou CNPJ da nota)'));
      // a OS concluída pelo registro de atendimento já realizado (30/10/2026) nunca esteve em execução: o "voltar" dela é desfazer o registro (volta à etapa de antes, que o registro guardou) — é a saída de quem registrou por engano
      if (os.atendimento_externo?.etapa_de_antes) m.push(mov('desfazer_registro', os.atendimento_externo.etapa_de_antes, 'Desfazer o registro do atendimento', `A OS volta para "${os.atendimento_externo.etapa_de_antes}" e o registro do atendimento é apagado (pede o motivo)`, 'voltar'));
      else if (!veicular) volta('Em Execução');   // o veículo concluído vem do CQ, que é da Qualidade
      break;
    case 'Em Cotação':
      m.push(semCobranca ? mov('seguir_sem_cotacao', 'Em Provisionamento', 'Seguir sem cotação', 'Garantia: não há cotação a fazer; segue para a Produção marcar a data') : mov('enviar_cotacao', 'Aguardando Aprovação Cliente', 'Enviar a cotação', 'Envia a cotação ao cliente (precisa dos itens da cotação)'));
      break;
    case 'Aguardando Aprovação Cliente':
      if (os.tipo_avaliacao === 'Remota' && !os.data_chegada_veiculo) {
        m.push(mov('aprovar_cotacao', 'Em Provisionamento', 'Cotação aprovada', 'O cliente aprovou: a OS segue para a Produção provisionar'));
        m.push(mov('recusar_cotacao', 'Reprovado', 'Cotação recusada', 'O cliente recusou a cotação'));
        volta('Em Cotação');
      } else {
        m.push(mov('aprovar_orcamento_presencial', 'Aguardando Início', 'Orçamento aprovado', 'O cliente aprovou o orçamento de verificação: a manutenção pode iniciar'));
        m.push(mov('recusar_cotacao', 'Reprovado', 'Orçamento recusado', 'O cliente recusou o orçamento'));
      }
      break;
    case 'Aguardando Aceite SAC':
      m.push(mov('aceite_sac', 'Provisionada', 'Dar o aceite da data', 'Abre a janela de aceite da data definida pela Produção'));
      break;
    case 'Aguardando Envio Fiscal':
      m.push(mov('enviar_fiscal_veicular', STATUS_AGUARDANDO_NOTA, 'Enviar ao Fiscal', 'Informa os seriais dos itens e envia ao Fiscal'));
      break;
    case STATUS_OS_FATURADA:
      m.push(entrega());
      break;
    case 'Reprovado':
      m.push(mov('reavaliar', veicular ? (os.tipo_avaliacao === 'Remota' ? 'Em Cotação' : 'Em Provisionamento') : 'Diagnóstico', 'Reavaliar', 'Reabre a OS para uma nova avaliação'));
      break;
  }
  // 30/10/2026: o serviço que já foi feito fora da fábrica leva a OS direto a "Concluído" (vale em toda etapa antes da execução; soltar o cartão na coluna CONCLUÍDO também abre este passo)
  if (podeRegistrarAtendimentoRealizado(os)) m.push(mov('registrar_realizado', 'Concluído', 'Registrar atendimento já realizado', 'O serviço já foi feito fora da fábrica: pede a data, quem fez e o que foi feito, e a OS vai direto para Concluído', 'avancar', 'Registrar atendimento já realizado'));
  if (podeCancelarOS(os)) m.push(mov('cancelar', STATUS_OS_CANCELADA, 'Cancelar a OS', 'Cancela a OS (pede o motivo)', 'cancelar'));
  return m;
}

/** Por que a OS não vai para a coluna do quadro onde foi solta (a frase que a pessoa lê). */
export function porQueNaoVaiParaAColuna(os: any, coluna: ColunaDoQuadro): string {
  const rotulo = COLUNAS_DO_QUADRO.find(c => c.id === coluna)?.rotulo || coluna;
  if (!os) return 'OS não encontrada.';
  if (STATUS_OS_ENCERRADOS.includes(os.status)) return `A ${os.numero_os} está encerrada (${os.status}).`;
  const a = quemTemQueAgir(os);
  if (!movimentosDaOS(os).some(x => x.tipo !== 'cancelar')) return `A ${os.numero_os} está com ${a ? `${a.quem === 'SAC' ? 'o SAC' : a.quem === 'Cliente' ? 'o cliente' : `o setor ${a.quem}`} (${os.status}): ${a.oque.toLowerCase()}` : os.status}. O SAC não move a OS nessa etapa.`;
  return `A ${os.numero_os} não vai para "${rotulo}" a partir de "${os.status}": só se move para a etapa seguinte (ou se volta uma etapa) pelas janelas de cada passo.`;
}

/** Os movimentos da OS cujo destino fica na coluna do quadro (o arrastar). O cancelamento não tem coluna: fica no menu. */
export const movimentosParaAColuna = (os: any, coluna: ColunaDoQuadro): Movimento[] => movimentosDaOS(os).filter(x => x.tipo !== 'cancelar' && colunaDoQuadro(x.para) === coluna);

// ── os dados que cada passo pede (só os passos SEM janela própria; os outros reaproveitam a janela que já existe) ─────────────────────────────────────
export type CampoDoMovimento = { chave: string; rotulo: string; tipo: 'texto' | 'valor' | 'data' | 'select' | 'area'; obrigatorio?: boolean; opcoes?: { valor: string; rotulo: string }[]; ajuda?: string };
export const CAMPOS_DO_MOVIMENTO: Record<string, CampoDoMovimento[]> = {
  abrir_diagnostico: [],
  seguir_vendida: [
    { chave: 'quem_executa', rotulo: 'Quem executa', tipo: 'select', obrigatorio: true, opcoes: [{ valor: 'laboratorio', rotulo: ROTULOS_QUEM_EXECUTA.laboratorio }, { valor: 'sac', rotulo: ROTULOS_QUEM_EXECUTA.sac }] },
    { chave: 'valor_total', rotulo: 'Valor da venda (R$)', tipo: 'valor', ajuda: 'Se a OS ainda não tem valor, informe: é o que o Fiscal fatura.' },
  ],
  informar_orcamento: [
    { chave: 'valor', rotulo: 'Valor do orçamento (R$)', tipo: 'valor', obrigatorio: true },
    { chave: 'condicoes', rotulo: 'Condições de pagamento', tipo: 'texto' },
  ],
  iniciar_execucao: [
    { chave: 'executor', rotulo: 'Quem vai executar', tipo: 'texto', obrigatorio: true },
    { chave: 'inicio', rotulo: 'Data de início', tipo: 'data', obrigatorio: true },
  ],
  concluir_lab: [{ chave: 'observacao', rotulo: 'Observação da conclusão (opcional)', tipo: 'area' }],
  voltar: [{ chave: 'motivo', rotulo: 'Motivo para voltar a OS', tipo: 'area', obrigatorio: true }],
  desfazer_registro: [{ chave: 'motivo', rotulo: 'Por que o registro será desfeito', tipo: 'area', obrigatorio: true }],
};
/** O passo usa a janela de dados (não tem janela própria)? Vale também para o que só pede a confirmação (sem campos), como abrir o diagnóstico. */
export const movimentoPedeDados = (processo: string): boolean => processo in CAMPOS_DO_MOVIMENTO;

/** O que falta (ou está ilegível) nos dados do passo; vazio = pode gravar. */
export function validarDadosDoMovimento(processo: string, dados: any): string[] {
  const falta: string[] = [];
  for (const c of CAMPOS_DO_MOVIMENTO[processo] || []) {
    const v = dados?.[c.chave];
    const vazio = v == null || String(v).trim() === '';
    if (c.tipo === 'valor') {
      const r = lerValorDigitado(v);
      if (r.invalido) falta.push(`${c.rotulo}: valor inválido ("${String(v).trim()}"); use só números, por exemplo 450 ou 1.450,50`);
      else if (c.obrigatorio && (r.vazio || !(r.valor > 0))) falta.push(`${c.rotulo}: informe um valor maior que zero`);
    } else if (c.obrigatorio && vazio) falta.push(`${c.rotulo}: obrigatório`);
  }
  return falta;
}

const valorOuNull = (v: any): number | null => { const r = lerValorDigitado(v); return r.valor !== undefined ? r.valor : null; };

/** O que o passo grava na OS (a tela acrescenta `atualizado_em`). Voltar para antes da aprovação limpa a marca de aprovada; o resto da OS não é mexido. */
export function patchDoMovimento(os: any, movimento: Movimento, dados: any, agora: string): Record<string, any> {
  switch (movimento.processo) {
    case 'abrir_diagnostico': return { status: 'Diagnóstico' };
    case 'seguir_vendida': {
      const quem = quemExecutaValido(dados?.quem_executa);
      const valor = valorOuNull(dados?.valor_total);
      return { status: statusInicialDaOsDoCrm(quem), cobranca: 'cobrada', aprovado: true, quem_executa: quem, ...(valor != null ? { valor_total: valor } : {}) };
    }
    case 'informar_orcamento': return { status: 'Orçamento Pronto', valor_orcamento: valorOuNull(dados?.valor), condicoes_pagamento: String(dados?.condicoes || '').trim() || null };
    case 'iniciar_execucao': return { status: 'Em Execução', tecnico_responsavel: String(dados?.executor || '').trim(), data_inicio_execucao_lab: /^\d{4}-\d{2}-\d{2}$/.test(String(dados?.inicio || '')) ? `${dados.inicio}T12:00:00-03:00` : agora };
    case 'concluir_lab': return { status: 'Concluído', data_finalizacao_execucao: agora };
    case 'voltar': return { status: movimento.para, ...(['Orç. Enviado', 'Orçamento Pronto', 'Diagnóstico'].includes(movimento.para) ? { aprovado: null } : {}) };
    case 'desfazer_registro': return { status: movimento.para, atendimento_externo: null };
    default: return { status: movimento.para };
  }
}

/** O recado que fica no histórico da demanda aberta do setor quando o SAC move a OS por fora dela. */
export const recadoDoMovimento = (os: any, movimento: Movimento, dados: any, usuario: any, agora: string) =>
  ({ texto: `OS ${os?.numero_os || ''} movida pelo SAC de "${os?.status}" para "${movimento.para}"${String(dados?.motivo || '').trim() ? `. Motivo: ${String(dados.motivo).trim()}` : ''}${String(dados?.observacao || '').trim() ? `. ${String(dados.observacao).trim()}` : ''}. Confira esta demanda.`, usuario: usuario?.nome, hora: agora });
