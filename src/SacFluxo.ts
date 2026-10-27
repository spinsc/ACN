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
