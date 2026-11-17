// Aviso "Data do calendário" da caixa de Menções: de que registro ele fala.
//
// Bug da Renata (Licitações), 17/11/2026: a rotina do banco `calendario_avisar` grava no aviso, como `contexto_id`, uma CHAVE composta
// `fonte:ref:dia` (ex.: `licitacao:757a3e83-…#disputa:2026-11-16`) para renovar um aviso por item e por dia. Nenhuma tela entende essa chave,
// então o botão "Licitações →" só trocava de aba e a licitação não abria ("quando clico para ir onde está a suposta menção, não vai").
// Aqui a chave vira o contexto e o id que a tela de origem já sabe abrir (os mesmos das menções comuns).

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
