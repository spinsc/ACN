// BOX do carro na Adaptação (pedido do usuário em 16/11/2026): quem inicia o trabalho informa em qual BOX o carro está.
// Regras decididas com o usuário: BOX 01 a 09 e um BOX EXTRA (para quando o carro não está em nenhum BOX); uma OP pode ocupar mais de um (veículo grande);
// o BOX pode ser trocado durante o trabalho e fica guardado por onde o carro já passou (oples.boxes_historico).
// Suposições minhas, a confirmar: um BOX que já tem outra OP em produção AVISA mas não impede (o BOX EXTRA nunca é "ocupado"); o BOX só vale enquanto a OP está em
// produção ou retrabalho — não há gatilho no banco que o libere: a ocupação é DERIVADA do status da OP, então não há BOX "preso" por esquecimento.
export const BOXES = ['BOX 01', 'BOX 02', 'BOX 03', 'BOX 04', 'BOX 05', 'BOX 06', 'BOX 07', 'BOX 08', 'BOX 09', 'BOX EXTRA'] as const;
export const BOX_EXTRA = 'BOX EXTRA';

export type PassagemPorBox = { boxes: string[]; entrou_em: string; saiu_em: string | null; por: string | null };

const STATUS_NO_BOX = ['Em Producao', 'Em Retrabalho'];

/** Os BOX da OP, na ordem da lista (nunca na ordem do clique) e só os que existem. */
export const boxesDaOp = (op: any): string[] => {
  const v: string[] = Array.isArray(op?.boxes) ? op.boxes : [];
  return BOXES.filter(b => v.includes(b));
};

export const textoDosBoxes = (boxes: string[] | null | undefined): string => (boxes || []).join(' + ');

/** A OP está em produção (ou retrabalho) e por isso ocupa o BOX. */
export const estaNoBox = (op: any): boolean => STATUS_NO_BOX.includes(op?.status_geral);

/** Erro ao iniciar ou trocar: pelo menos um BOX, e só da lista. Devolve a frase para a pessoa, ou null. */
export function erroDosBoxes(boxes: string[]): string | null {
  if (!boxes || boxes.length === 0) return 'Informe em qual BOX o carro está (se não está em nenhum, escolha BOX EXTRA).';
  const fora = boxes.filter(b => !(BOXES as readonly string[]).includes(b));
  if (fora.length) return `BOX desconhecido: ${fora.join(', ')}.`;
  return null;
}

/** BOX → OPs que o ocupam agora. `exceto` = a OP que está escolhendo (ela não conta como "outra"). O BOX EXTRA fica de fora: pode ter vários carros. */
export function ocupacaoDosBoxes(ops: any[], exceto?: string | null): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const o of ops || []) {
    if (!estaNoBox(o) || (exceto && String(o.id) === String(exceto))) continue;
    for (const b of boxesDaOp(o)) {
      if (b === BOX_EXTRA) continue;
      (mapa[b] || (mapa[b] = [])).push(o.opl || String(o.id));
    }
  }
  return mapa;
}

/** Dos BOX escolhidos, os que já têm outra OP (para o aviso). */
export const conflitosDeBox = (escolhidos: string[], ocupacao: Record<string, string[]>) =>
  escolhidos.filter(b => (ocupacao[b] || []).length > 0).map(b => ({ box: b, ops: ocupacao[b] }));

export const mesmosBoxes = (a: string[] | null | undefined, b: string[] | null | undefined): boolean => {
  const x = [...(a || [])].sort(), y = [...(b || [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * O que gravar ao informar ou trocar o BOX: os BOX de agora e o histórico com a passagem anterior fechada e a nova aberta.
 * Devolve null quando nada mudou (mesmos BOX). Uma passagem anterior já fechada nunca é reaberta.
 */
export function planejarTrocaDeBox(op: any, novos: string[], quem: string | null, agoraISO: string): { boxes: string[]; boxes_historico: PassagemPorBox[] } | null {
  const ordenados = BOXES.filter(b => novos.includes(b));
  const atuais = boxesDaOp(op);
  if (mesmosBoxes(atuais, ordenados)) return null;
  const hist: PassagemPorBox[] = Array.isArray(op?.boxes_historico) ? op.boxes_historico.map((p: any) => ({ ...p })) : [];
  // a última passagem aberta é a do BOX de antes; se a OP já tinha BOX mas nenhum histórico (não deveria), registra o que havia
  const aberta = [...hist].reverse().find(p => !p.saiu_em);
  if (aberta) aberta.saiu_em = agoraISO;
  else if (atuais.length) hist.push({ boxes: atuais, entrou_em: op?.data_inicio_producao || agoraISO, saiu_em: agoraISO, por: null });
  hist.push({ boxes: ordenados, entrou_em: agoraISO, saiu_em: null, por: quem });
  return { boxes: ordenados, boxes_historico: hist };
}

/** Frase para o histórico de movimentação da OP: "BOX 03 → BOX 03 + BOX 04". */
export const fraseDaTroca = (de: string[], para: string[]): string =>
  de.length ? `BOX alterado: ${textoDosBoxes(de)} → ${textoDosBoxes(para)}.` : `BOX informado: ${textoDosBoxes(para)}.`;
