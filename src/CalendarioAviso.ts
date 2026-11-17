// Aviso de data do calendário (painel Avisos): de que registro ele fala.
//
// Bug da Renata (Licitações), 17/11/2026: a rotina do banco `calendario_avisar` grava no aviso, como `contexto_id`, uma CHAVE composta
// `fonte:ref:dia` (ex.: `licitacao:757a3e83-…:2026-11-16`) para renovar um aviso por item e por dia. Nenhuma tela entende essa chave,
// então o botão só trocava de aba e a licitação não abria ("quando clico para ir onde está a suposta menção, não vai").
// Aqui a chave vira o contexto e o id que a tela de origem já sabe abrir (os mesmos das menções comuns).
// Decisão do usuário no mesmo dia: esses avisos não são menções; moram no painel Avisos (AvisosOpPanel.tsx), e Menções os ignora.

export type AlvoDoAviso = { contexto: 'licitacao' | 'crm' | 'compra' | 'demanda_avulsa' | 'sac'; id: string };

// Só entram as fontes cuja tela de origem comprovadamente abre o registro pelo id (licitação e CRM pelo `analise:abrir-origem`; compra,
// demanda avulsa e OS do SAC pelo `acn:abrir-registro`). As outras fontes do calendário (chegada de veículo, entrega de OP, vistoria,
// tarefa do Financeiro, agendamento, compromisso) seguem só trocando de aba, como sempre foi: quem for ligar uma delas confere primeiro
// que a tela de destino escuta o contexto.
const CONTEXTO_DA_FONTE: Record<string, AlvoDoAviso['contexto']> = {
  licitacao: 'licitacao',
  crm_retorno: 'crm',
  crm_limite: 'crm',
  compra_entrega: 'compra',
  demanda_avulsa: 'demanda_avulsa',
  sac_prazo: 'sac',
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
 */
export function abrirRegistroDoAviso(aviso: { contexto_id?: string | null; aba_destino?: string | null }, irParaAba?: (aba: string) => void) {
  const alvo = alvoDoAvisoDoCalendario(aviso.contexto_id);
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
