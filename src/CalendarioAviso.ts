// Aviso de data do calendário (painel Avisos): de que registro ele fala.
//
// Bug da Renata (Licitações), 17/11/2026: a rotina do banco `calendario_avisar` grava no aviso, como `contexto_id`, uma CHAVE composta
// `fonte:ref:dia` (ex.: `licitacao:757a3e83-…:2026-11-16`) para renovar um aviso por item e por dia. Nenhuma tela entende essa chave,
// então o botão só trocava de aba e a licitação não abria ("quando clico para ir onde está a suposta menção, não vai").
// Aqui a chave vira o contexto e o id que a tela de origem já sabe abrir (os mesmos das menções comuns).
// Decisão do usuário no mesmo dia: esses avisos não são menções; moram no painel Avisos (AvisosOpPanel.tsx), e Menções os ignora.
// Fase 5, parte 4 (26/11/2026): a demanda geral tem endereço próprio (`#/demanda/<código>`), então o aviso (e o botão "Abrir" do Calendário) a abre
// POR CIMA da tela em que a pessoa está, como a Menção de demanda já fazia, em vez de trocar de aba pelo recado antigo.
import { abrirDemandaPeloEndereco } from './DemandaNoEndereco';
import { abrirOpPeloEndereco } from './OpNoEndereco';
import { ehCodigoInterno } from './Rotas';

export type AlvoDoAviso = { contexto: 'licitacao' | 'crm' | 'compra' | 'demanda_avulsa' | 'sac' | 'terceiro_servico' | 'op' | 'tarefa_financeiro'; id: string };

// Só entram as fontes cuja tela de origem comprovadamente abre o registro pelo id (licitação e CRM pelo `analise:abrir-origem`; compra,
// demanda avulsa, OS do SAC e serviço de terceiro pelo `acn:abrir-registro`). As outras fontes do calendário (chegada de veículo, entrega de OP, vistoria,
// tarefa do Financeiro, agendamento, compromisso) seguem só trocando de aba, como sempre foi: quem for ligar uma delas confere primeiro
// que a tela de destino escuta o contexto.
// Serviço de terceiro (T3, 23/11/2026): o aviso de serviço atrasado abre a janela do serviço (ou do grupo de carros da visita) em Serviços de terceiros;
// a chave leva o id do primeiro serviço da visita (`terceiro_servico:<id>:<dia>`), e a tela do módulo é quem acha o grupo a partir dele.
const CONTEXTO_DA_FONTE: Record<string, AlvoDoAviso['contexto']> = {
  licitacao: 'licitacao',
  crm_retorno: 'crm',
  crm_limite: 'crm',
  compra_entrega: 'compra',
  demanda_avulsa: 'demanda_avulsa',
  sac_prazo: 'sac',
  terceiro_servico: 'terceiro_servico',
  // 26/11/2026 (Fase 6): a tarefa do Financeiro tem endereço próprio (`#/financeiro/tarefa/<código>`); o `ref_id` da data é o id da tarefa
  tarefa_financeiro: 'tarefa_financeiro',
  // 26/11/2026 (Fase 5, parte 4): a data de entrega e a de chegada do veículo guardam o código da OP, e a OP tem endereço próprio: abre por cima da tela de agora
  op_entrega: 'op',
  op_chegada_veiculo: 'op',
};

// Nome da fonte para o cabeçalho do aviso no painel Avisos (a chave começa pela fonte).
const ROTULO_DA_FONTE: Record<string, string> = {
  licitacao: 'Licitação',
  crm_retorno: 'CRM · retorno ao cliente',
  crm_limite: 'CRM · prazo da proposta',
  telecom_retorno: 'Telecom · retorno ao cliente',
  op_entrega: 'Entrega de OP',
  op_chegada_veiculo: 'Chegada do veículo',
  sac_chegada_veiculo: 'Chegada do veículo (SAC)',
  sac_prazo: 'SAC · prazo da OS',
  demanda_avulsa: 'Demanda geral',
  demanda_etapa: 'Etapa de demanda',
  desenvolvimento_etapa: 'Desenvolvimento',
  compra_entrega: 'Entrega de compra',
  vistoria_retorno: 'Retorno de vistoria',
  tarefa_financeiro: 'Tarefa do Financeiro',
  agendamento: 'Agendamento',
  compromisso: 'Compromisso',
  terceiro_servico: 'Serviço de terceiro',
  terceiro_desejado: 'Data desejada do serviço de terceiro',
  ponto_dia: 'Ponto a ajustar na Secullum',
};

export function rotuloDoAvisoDoCalendario(chave: string | null | undefined): string {
  const fonte = String(chave || '').split(':')[0];
  return ROTULO_DA_FONTE[fonte] || 'Data do calendário';
}

/** O dia (AAAA-MM-DD) que a chave guarda, ou '' se não houver. Para saber se o aviso é de data vencida (dia antes de hoje) ou de hoje. */
export function diaDoAvisoDoCalendario(chave: string | null | undefined): string {
  const m = String(chave || '').match(/(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : '';
}

/**
 * Abre o registro de origem do aviso (quando a tela de origem sabe abrir) e leva à aba de destino.
 * `irParaAba` troca de aba e fecha o painel (quem chama passa a função da casca).
 * Devolve `true` quando o registro abriu POR CIMA da tela de agora (a demanda, pelo endereço): não há aba para trocar e quem chamou só precisa fechar o seu painel.
 */
export function abrirRegistroDoAviso(aviso: { contexto_id?: string | null; aba_destino?: string | null }, irParaAba?: (aba: string) => void): boolean {
  // Ponto (P3, 25/11/2026): o aviso de batida incompleta ou falta é de um DIA e de várias pessoas, não de um registro: leva à aba RH já na parte
  // "A tratar" do Relógio Ponto (o RHTab lê o pedido ao montar e o apaga).
  if (String(aviso.contexto_id || '').startsWith('ponto_dia:')) (window as any).__acnDeepLink = { rhAba: 'ponto', pontoVisao: 'tratar' };
  const alvo = alvoDoAvisoDoCalendario(aviso.contexto_id);
  if (alvo && alvo.contexto === 'demanda_avulsa' && ehCodigoInterno(alvo.id)) {
    abrirDemandaPeloEndereco(alvo.id);
    return true;
  }
  if (alvo && alvo.contexto === 'op' && ehCodigoInterno(alvo.id)) {
    abrirOpPeloEndereco(alvo.id);
    return true;
  }
  if (alvo) {
    if (alvo.contexto === 'crm' || alvo.contexto === 'licitacao') {
      // o mesmo caminho das menções de CRM e licitação (DashboardTab: troca a aba e abre o card)
      window.dispatchEvent(new CustomEvent('analise:abrir-origem', { detail: { origem: alvo.contexto, origemId: alvo.id } }));
    } else {
      // a tela de destino pode montar depois do clique: o global cobre esse caso, o evento cobre a tela já aberta
      const detail = { contexto: alvo.contexto, contextoId: alvo.id };
      (window as any).__acnDeepLink = detail;
      window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail }));
    }
  }
  if (aviso.aba_destino && irParaAba) irParaAba(aviso.aba_destino);
  return false;
}

/** `fonte:ref_id:AAAA-MM-DD` → o registro de origem, ou `null` quando a chave não é conhecida (a tela só troca de aba). */
export function alvoDoAvisoDoCalendario(chave: string | null | undefined): AlvoDoAviso | null {
  const texto = String(chave || '');
  const primeiro = texto.indexOf(':');
  const ultimo = texto.lastIndexOf(':');
  if (primeiro <= 0 || ultimo <= primeiro) return null;
  const fonte = texto.slice(0, primeiro);
  const ref = texto.slice(primeiro + 1, ultimo);        // o dia é o que vem depois do último ":"
  const contexto = CONTEXTO_DA_FONTE[fonte];
  const id = ref.split('#')[0].trim();                    // o que vem depois do "#" é o tipo da data (proposta, disputa, orçamento…)
  if (!contexto || !id) return null;
  return { contexto, id };
}
