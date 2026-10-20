// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — quem é avisado de quê (G5 do PLANO_GARANTIA.md, 20/10/2026)
//
// Só regra, sem tela e sem banco: GarantiaTab.tsx grava a ficha e depois manda os avisos que esta função calcula. Decisão do usuário em 20/10/2026:
//   • o aviso cai na caixa de Menções (o sino) e leva direto à ficha; vai ao responsável e aos copiados — quem fez a ação não se avisa;
//   • SEMPRE avisam: abertura, cancelamento, reabertura, pedido de autorização (e então a direção toda, ou seja, todos os Admin) e a decisão da direção
//     (que também chega a quem fez o pedido);
//   • além disso, TODAS as mudanças opcionais avisam: avaliação, fornecedor, quem executa, peça pedida ao Compras, alinhamento com o cliente, quadro de custos,
//     cada movimento de peça em garantia e os apontamentos do diário técnico. Por isso a regra aqui é uma só: cada evento novo do histórico da ficha gera aviso.
// Quem entra ou sai da ficha numa edição das partes (responsável/copiados) também é avisado, com a frase própria dizendo o que mudou para ele.
// ─────────────────────────────────────────────────────────────────────────────
import { fraseDoEvento, ehAdminG } from './GarantiaModelo';

const chave = (e: any) => String(e || '').trim().toLowerCase();
const semAcento = (t: any) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Responsável e copiados da ficha, sem repetir, como lista de { email, nome }. */
export function partesDaGarantia(g: any): { email: string; nome: string }[] {
  const saida: { email: string; nome: string }[] = [];
  const poe = (p: any) => { if (p?.email && !saida.some(x => chave(x.email) === chave(p.email))) saida.push({ email: String(p.email), nome: p.nome || p.email }); };
  poe(g?.responsavel);
  (Array.isArray(g?.copiados) ? g.copiados : []).forEach(poe);
  return saida;
}

/** Os eventos que a gravação acrescentou ao histórico (o histórico só cresce). */
export const eventosNovos = (antes: any, depois: any): any[] => {
  const a = Array.isArray(antes?.historico) ? antes.historico.length : 0;
  return (Array.isArray(depois?.historico) ? depois.historico : []).slice(a);
};

export const descricaoDoAviso = (g: any) => `Garantia ${g?.numero || ''} — ${g?.cliente_nome || ''}`.trim();

/**
 * Quem recebe o aviso de UM evento, e com que texto.
 *  - antes: a ficha antes da gravação (null na abertura); depois: a ficha como ficou; autor: quem gravou;
 *  - usuarios: os usuários ativos do sistema, com `perfil` (só para achar a direção e quem fez o pedido de autorização).
 */
export function avisosDoEvento(antes: any, depois: any, ev: any, autor: any, usuarios: any[] = []): { email: string; nome: string; texto: string }[] {
  const alvos: { email: string; nome: string; texto: string }[] = [];
  const frase = fraseDoEvento(ev);
  const poe = (p: any, texto: string = frase) => { if (p?.email && !alvos.some(x => chave(x.email) === chave(p.email))) alvos.push({ email: String(p.email), nome: p.nome || p.email, texto }); };

  const partesDepois = partesDaGarantia(depois);
  const partesAntes = antes ? partesDaGarantia(antes) : [];
  const estavaAntes = (p: any) => partesAntes.some(x => chave(x.email) === chave(p.email));
  const estaDepois = (p: any) => partesDepois.some(x => chave(x.email) === chave(p.email));

  if (ev.tipo === 'editado') {
    // quem entrou e quem saiu da ficha sabe disso; os demais recebem a frase de sempre
    partesDepois.forEach(p => poe(p, antes && !estavaAntes(p) ? `Você passou a participar deste atendimento (${frase})` : frase));
    partesAntes.filter(p => !estaDepois(p)).forEach(p => poe(p, `Você saiu deste atendimento (${frase})`));
  } else {
    partesDepois.forEach(p => poe(p));
  }

  if (ev.tipo === 'autorizacao_pedida') {
    // a direção toda: todo Admin ativo
    usuarios.filter(u => ehAdminG(u) && u.ativo !== false && u.email).forEach(u => poe(u, `Pedido de autorização à direção: ${ev.texto || ''}`.trim()));
  }
  if (ev.tipo === 'autorizacao_aprovada' || ev.tipo === 'autorizacao_negada') {
    // quem fez o pedido recebe a decisão, mesmo que não seja o responsável nem copiado
    const a = (Array.isArray(depois?.autorizacoes) ? depois.autorizacoes : []).find((x: any) => x?.decisao?.em === ev.em);
    const quemPediu = a && usuarios.find(u => semAcento(u.nome) === semAcento(a.pedida_por) && u.email);
    if (quemPediu) poe(quemPediu);
  }

  return alvos.filter(p => chave(p.email) !== chave(autor?.email));   // quem fez a ação não se avisa
}

/** Todos os avisos que uma gravação gera: um por pessoa e por evento novo. */
export function avisosDaGravacao(antes: any, depois: any, autor: any, usuarios: any[] = []) {
  const saida: any[] = [];
  for (const ev of eventosNovos(antes, depois)) {
    for (const a of avisosDoEvento(antes, depois, ev, autor, usuarios)) saida.push({ ...a, evento: ev.tipo, por: ev.por });
  }
  return saida;
}
