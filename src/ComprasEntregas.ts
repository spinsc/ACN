// ─────────────────────────────────────────────────────────────────────────────
// ENTREGA POR FORNECEDOR (pedido do usuário em 17/11/2026; PLANO_ENTREGA_POR_FORNECEDOR.md)
//
// Um pedido de compra pode ter mais de um fornecedor vencedor (`vencedoras`), e cada um entrega no seu dia. Até esta mudança o pedido tinha UMA data
// (`pcp_pedidos_compra.data_prevista_recebimento`). Agora cada fornecedor é uma linha de `compras_entregas`, com a sua data e, a partir da etapa E2, o seu recebimento.
//
// Regras desta camada (puras, sem tela):
//  • Pedido SEM linhas (comprado antes desta mudança, ou criado direto como "Comprado" por outra tela) vale como UMA entrega, montada na hora a partir das colunas
//    do próprio pedido ("entrega virtual", `virtual: true`): nenhum pedido existente é regravado.
//  • O campo `data_prevista_recebimento` do pedido continua existindo e guarda a data mais distante das entregas ainda abertas (quando o pedido fica completo):
//    serve às telas que ainda mostram um valor único. Tela migrada mostra uma data por fornecedor.
//  • Datas sempre como texto AAAA-MM-DD (nunca `new Date` para o dia: o dia de Londres ≠ o dia de Palhoça).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';

export type SituacaoDaEntrega = 'aguardando' | 'divergencia' | 'recebida';

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const diaDe = (d: any): string | null => { const s = String(d ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
export const dataBr = (d: any): string => { const s = diaDe(d); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'; };
export const dataCurta = (d: any): string => { const s = diaDe(d); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'; };

/** Os itens do pedido com a posição de cada um (a mesma numeração da Mesa de Cotações e das vencedoras). */
export const itensComPosicao = (pedido: any): any[] => Array.isArray(pedido?.itens)
  ? pedido.itens.map((i: any, indice: number) => ({ ...i, indice })).filter((i: any) => String(i?.nome || '').trim()) : [];

/** Só pedido já comprado tem entrega. */
export const temEntrega = (pedido: any) => ['Comprado', 'Recebido'].includes(pedido?.status_compra);

// ── De quem é cada entrega, na hora de comprar ──────────────────────────────

export type EntregaPlanejada = { cotacao_id: string | null; fornecedor: string; itens: number[] | null; nomesDosItens: string[] };

/**
 * Os fornecedores a quem este pedido será comprado, cada um com os itens que entrega: uma entrega por cotação vencedora.
 * Pedido de um fornecedor só (a maioria) = uma entrega, com o pedido todo.
 */
export function entregasPlanejadas(pedido: any): EntregaPlanejada[] {
  const vencedoras = Array.isArray(pedido?.vencedoras) ? pedido.vencedoras.filter((v: any) => v?.cotacao_id) : [];
  const itens = itensComPosicao(pedido);
  if (vencedoras.length) {
    return vencedoras.map((v: any) => {
      const pos: number[] = Array.isArray(v.itens) ? v.itens.map(Number).filter(Number.isFinite) : [];
      return {
        cotacao_id: String(v.cotacao_id), fornecedor: String(v.fornecedor || '').trim() || 'Fornecedor',
        itens: pos.length ? pos : null,
        nomesDosItens: pos.length ? itens.filter((i: any) => pos.includes(i.indice)).map((i: any) => String(i.nome)) : itens.map((i: any) => String(i.nome)),
      };
    });
  }
  return [{ cotacao_id: pedido?.vencedora_id ? String(pedido.vencedora_id) : null, fornecedor: String(pedido?.fornecedor || '').trim() || 'Fornecedor', itens: null, nomesDosItens: itens.map((i: any) => String(i.nome)) }];
}

// ── As entregas de um pedido ─────────────────────────────────────────────────

export type Entrega = {
  id: string | null; virtual: boolean; pedido_id: string; cotacao_id: string | null; fornecedor: string; itens: number[] | null;
  data_prevista: string | null; situacao: SituacaoDaEntrega; numero_nf: string | null; data_recebimento_real: string | null;
  quantidade_recebida: number | null; observacoes: string | null; recebida_em: string | null; recebida_por: string | null; alerta_mencionado_em: string | null;
  /** Quando a posição desta entrega (o que aconteceu e a nova previsão) foi registrada em Avisos; silencia o alerta de atraso DESTE fornecedor por 24 horas úteis (E3). */
  posicao_em: string | null;
};

const daLinha = (l: any): Entrega => ({
  id: l.id, virtual: false, pedido_id: l.pedido_id, cotacao_id: l.cotacao_id || null, fornecedor: String(l.fornecedor || '').trim() || 'Fornecedor',
  itens: Array.isArray(l.itens) && l.itens.length ? l.itens.map(Number) : null, data_prevista: diaDe(l.data_prevista),
  situacao: ['aguardando', 'divergencia', 'recebida'].includes(l.situacao) ? l.situacao : 'aguardando',
  numero_nf: l.numero_nf || null, data_recebimento_real: diaDe(l.data_recebimento_real),
  quantidade_recebida: l.quantidade_recebida == null ? null : Number(l.quantidade_recebida), observacoes: l.observacoes || null,
  recebida_em: l.recebida_em || null, recebida_por: l.recebida_por || null, alerta_mencionado_em: l.alerta_mencionado_em || null, posicao_em: l.posicao_em || null,
});

/** A entrega "de antes": o pedido sem linhas inteiro como uma entrega só. */
export function entregaVirtualDoPedido(pedido: any): Entrega {
  const recebido = pedido?.status_compra === 'Recebido';
  return {
    id: null, virtual: true, pedido_id: pedido?.id, cotacao_id: pedido?.vencedora_id || null,
    fornecedor: String(pedido?.fornecedor || '').trim() || 'Fornecedor', itens: null, data_prevista: diaDe(pedido?.data_prevista_recebimento),
    situacao: recebido ? 'recebida' : pedido?.tem_divergencia ? 'divergencia' : 'aguardando',
    numero_nf: pedido?.numero_nf || null, data_recebimento_real: diaDe(pedido?.data_recebimento_real),
    quantidade_recebida: pedido?.quantidade_recebida == null ? null : Number(pedido.quantidade_recebida), observacoes: null,
    recebida_em: null, recebida_por: null, alerta_mencionado_em: pedido?.alerta_entrega_mencionado_em || null, posicao_em: null,
  };
}

/**
 * O pedido sem linhas: uma entrega só ou, se ele tem mais de um fornecedor vencedor (compras de antes desta mudança), uma por fornecedor, todas com a data do pedido.
 * Assim a data de cada um pode ser corrigida sem regravar nada de antemão (a linha nasce na primeira correção: ver `mudarDataDaEntrega`).
 */
export function entregasVirtuaisDoPedido(pedido: any): Entrega[] {
  const base = entregaVirtualDoPedido(pedido);
  const plano = entregasPlanejadas(pedido);
  if (plano.length < 2) return [base];
  return plano.map(p => ({ ...base, cotacao_id: p.cotacao_id, fornecedor: p.fornecedor, itens: p.itens, quantidade_recebida: null }));
}

/**
 * As entregas do pedido, da mais próxima para a mais distante. `linhas` são as linhas de `compras_entregas` JÁ lidas (de qualquer pedido: filtra aqui);
 * sem nenhuma linha do pedido, devolve a(s) entrega(s) virtual(is). Pedido que ainda não foi comprado não tem entrega.
 */
export function entregasDoPedido(pedido: any, linhas: any[] = []): Entrega[] {
  if (!temEntrega(pedido)) return [];
  const dele = (linhas || []).filter((l: any) => String(l.pedido_id) === String(pedido.id)).map(daLinha);
  const lista = dele.length ? dele : entregasVirtuaisDoPedido(pedido);
  return lista.sort((a, b) => String(a.data_prevista || '9999').localeCompare(String(b.data_prevista || '9999')) || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'));
}

export const estaAberta = (e: Entrega) => e.situacao !== 'recebida';
export const abertasDoPedido = (entregas: Entrega[]) => entregas.filter(estaAberta);

/** A data em que o pedido fica completo: a mais distante das entregas ainda abertas (todas recebidas: a mais distante de todas). */
export function dataMaisDistante(entregas: Entrega[]): string | null {
  const base = abertasDoPedido(entregas).length ? abertasDoPedido(entregas) : entregas;
  const datas = base.map(e => e.data_prevista).filter(Boolean) as string[];
  return datas.length ? datas.sort()[datas.length - 1] : null;
}

/** A primeira data ainda por vir (ou já vencida) entre as abertas. */
export function dataMaisProxima(entregas: Entrega[]): string | null {
  const datas = abertasDoPedido(entregas).map(e => e.data_prevista).filter(Boolean) as string[];
  return datas.length ? datas.sort()[0] : null;
}

/** Entrega aberta cuja data já passou (`hoje` = AAAA-MM-DD). */
export const estaAtrasada = (e: Entrega, hoje: string) => estaAberta(e) && !!e.data_prevista && e.data_prevista < hoje;

/** "Fornecedor A: 20/11 · Fornecedor B: 25/11" (ou só a data, quando o pedido tem um fornecedor só). */
export function resumoDasEntregas(entregas: Entrega[], opcoes: { comAno?: boolean } = {}): string {
  const f = opcoes.comAno ? dataBr : dataCurta;
  if (!entregas.length) return '';
  if (entregas.length === 1) return f(entregas[0].data_prevista);
  return entregas.map(e => `${e.fornecedor}: ${f(e.data_prevista)}`).join(' · ');
}

/** Quantidade que se espera ver chegar daquele fornecedor: a soma do que foi comprado nos itens dele (ou do pedido todo, sem lista de itens). */
export function esperadoDaEntrega(pedido: any, entrega: { itens: number[] | null }): number {
  const itens = itensComPosicao(pedido);
  if (!itens.length) return num(pedido?.quantidade_comprada ?? pedido?.quantidade);
  const dela = entrega?.itens?.length ? itens.filter((i: any) => entrega.itens!.includes(i.indice)) : itens;
  return dela.reduce((s: number, i: any) => s + num(i.quantidade_comprada ?? i.quantidade), 0);
}

// ── Leitura e gravação ───────────────────────────────────────────────────────

/** Lê as entregas de vários pedidos de uma vez. Leitura recusada devolve `erro` (nunca "sem entregas": o pedido cairia como entrega virtual com a data errada). */
export async function lerEntregas(pedidoIds: string[]): Promise<{ linhas: any[]; erro: string | null }> {
  const ids = [...new Set((pedidoIds || []).filter(Boolean).map(String))];
  const linhas: any[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('compras_entregas').select('*').in('pedido_id', ids.slice(i, i + 80));
    if (error) return { linhas: [], erro: explicarErroDoBanco(error) };
    linhas.push(...(data || []));
  }
  return { linhas, erro: null };
}

export type DataDeFornecedor = { cotacao_id: string | null; fornecedor: string; itens: number[] | null; data_prevista: string };

/** Confere as datas escolhidas na compra: todas preenchidas e reais. Devolve a frase do que falta, ou '' se está tudo certo. */
export function erroDasDatas(datas: DataDeFornecedor[], coleta = false): string {
  if (!datas.length) return 'Informe a data de entrega.';
  for (const d of datas) {
    if (!diaDe(d.data_prevista)) return datas.length > 1 ? `Informe ${coleta ? 'o dia da coleta' : 'a data de entrega'} de ${d.fornecedor}.` : (coleta ? 'Informe o dia da coleta.' : 'Informe o prazo de entrega combinado com o fornecedor.');
  }
  return '';
}

/**
 * Grava as entregas na hora de comprar: uma linha por fornecedor. Compra refeita (o pedido voltou a "Aprovado" e foi comprado de novo) troca as linhas
 * ainda sem recebimento pelas novas (a data de antes fica no histórico do pedido); com recebimento já registrado, recusa (o material já entrou).
 * Devolve `erro` com a frase para a pessoa; a compra em si já foi gravada, e o pedido sem linhas segue valendo como uma entrega só.
 */
export async function gravarEntregas(pedidoId: string, datas: DataDeFornecedor[], user: any): Promise<{ erro: string | null }> {
  const { data: antigas, error: erroLer } = await supabase.from('compras_entregas').select('id,situacao').eq('pedido_id', pedidoId);
  if (erroLer) return { erro: explicarErroDoBanco(erroLer) };
  if ((antigas || []).some((l: any) => l.situacao === 'recebida')) return { erro: 'este pedido já tem fornecedor recebido; as datas de quem já chegou não podem ser refeitas' };
  if ((antigas || []).length) {
    const { error: erroDel } = await supabase.from('compras_entregas').delete().eq('pedido_id', pedidoId).neq('situacao', 'recebida');
    if (erroDel) return { erro: explicarErroDoBanco(erroDel) };
  }
  const { error } = await supabase.from('compras_entregas').insert(datas.map(d => ({
    pedido_id: pedidoId, cotacao_id: d.cotacao_id, fornecedor: d.fornecedor, itens: d.itens, data_prevista: d.data_prevista, criado_por: user?.email || null,
  })));
  return { erro: error ? explicarErroDoBanco(error) : null };
}

// ── Recebimento por fornecedor (etapa E2, 17/11/2026) ────────────────────────
// Decidido com o usuário: a Logística recebe e confere CADA fornecedor separado; o pedido só vira "Recebido" quando todos foram recebidos.

const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

export type RecebimentoDaEntrega = {
  confere: boolean; numero_nf: string; data_recebimento_real: string; quantidade_recebida: number | null; observacoes?: string | null; user: any;
};

/** O que o pedido guarda do recebimento (as colunas `numero_nf`, `data_recebimento_real`, `quantidade_recebida` e `tem_divergencia` que já existiam nele). */
export type DoPedidoDepoisDoRecebimento = { numero_nf: string | null; data_recebimento_real: string | null; quantidade_recebida: number | null; tem_divergencia: boolean };

/**
 * O que o pedido passa a guardar quando se sabe o que cada fornecedor já entregou (pura, sobre as linhas de `compras_entregas` do pedido):
 * as NFs de todos juntas ("123 / 456"), o último dia de recebimento, a soma do que chegou (conferido ou com divergência: o material está aqui),
 * se algum fornecedor está com divergência, quem ainda falta e a data em que o pedido fica completo (a mais distante das entregas abertas).
 * O pedido só fica completo — `fechou` — quando NENHUMA entrega está aberta (divergência conta como aberta: o assunto não foi resolvido).
 */
export function fechamentoDoPedido(linhas: any[]): { campos: DoPedidoDepoisDoRecebimento; faltam: string[]; dataDoPedido: string | null; fechou: boolean } {
  const lista = linhas || [];
  const nfs = [...new Set(lista.map((l: any) => String(l.numero_nf || '').trim()).filter(Boolean))];
  const dias = lista.map((l: any) => diaDe(l.data_recebimento_real)).filter(Boolean).sort() as string[];
  const quantidades = lista.filter((l: any) => l.quantidade_recebida != null && l.quantidade_recebida !== '').map((l: any) => num(l.quantidade_recebida));
  const abertas = lista.filter((l: any) => l.situacao !== 'recebida');
  const datasAbertas = abertas.map((l: any) => diaDe(l.data_prevista)).filter(Boolean).sort() as string[];
  return {
    campos: {
      numero_nf: nfs.length ? nfs.join(' / ') : null,
      data_recebimento_real: dias.length ? dias[dias.length - 1] : null,
      quantidade_recebida: quantidades.length ? quantidades.reduce((a, b) => a + b, 0) : null,
      tem_divergencia: lista.some((l: any) => l.situacao === 'divergencia'),
    },
    faltam: abertas.map((l: any) => String(l.fornecedor || '').trim() || 'Fornecedor'),
    dataDoPedido: datasAbertas.length ? datasAbertas[datasAbertas.length - 1] : null,
    fechou: lista.length > 0 && abertas.length === 0,
  };
}

export type ResultadoDoRecebimento = {
  erro: string | null;
  /** Nenhum fornecedor ficou aberto: o pedido já pode virar "Recebido" (e liberar o faturamento). */
  fechouPedido: boolean;
  /** Quantos fornecedores o pedido tem (1 = recebimento como sempre foi). */
  total: number;
  /** Os fornecedores que ainda faltam receber (inclui os com divergência). */
  faltam: string[];
  campos: DoPedidoDepoisDoRecebimento | null;
  dataDoPedido: string | null;
};

/**
 * Registra o recebimento de UM fornecedor do pedido. Quem decide se o pedido está completo é o banco, relido logo depois de marcar (não a tela).
 *  • conferida = a entrega fica "recebida" (NF, dia, quantidade, quem e quando); com divergência = "divergencia" (continua aberta e pode ser recebida de novo);
 *  • pedido SEM linhas e com um fornecedor só (comprado antes da E1): nada a marcar, a data e o recebimento moram no próprio pedido (como sempre foi);
 *  • pedido SEM linhas e com vários fornecedores: as linhas de TODOS nascem agora (cada um com a data que o pedido mostrava) e só a escolhida é marcada;
 *  • recebimento de quem já foi recebido por outra pessoa é recusado (`.neq('situacao','recebida')` + conferência da linha devolvida).
 * Esta função NÃO mexe no pedido: quem chama grava com `atualizarPedidoAposRecebimento`.
 */
export async function receberEntrega(pedido: any, entrega: { id: string | null; cotacao_id: string | null; fornecedor: string }, r: RecebimentoDaEntrega): Promise<ResultadoDoRecebimento> {
  const falha = (erro: string): ResultadoDoRecebimento => ({ erro, fechouPedido: false, total: 0, faltam: [], campos: null, dataDoPedido: null });
  const { data: lidas, error: erroLer } = await supabase.from('compras_entregas').select('*').eq('pedido_id', pedido.id);
  if (erroLer) return falha(explicarErroDoBanco(erroLer));
  let linhas: any[] = lidas || [];
  const nf = String(r.numero_nf || '').trim();
  const dia = diaDe(r.data_recebimento_real);

  if (!linhas.length) {
    const virtuais = entregasVirtuaisDoPedido(pedido);
    if (virtuais.length < 2) {
      return {
        erro: null, fechouPedido: r.confere, total: 1, faltam: r.confere ? [] : [virtuais[0].fornecedor], dataDoPedido: null,
        campos: { numero_nf: nf || null, data_recebimento_real: dia, quantidade_recebida: r.quantidade_recebida, tem_divergencia: !r.confere },
      };
    }
    const novas = virtuais.map(e => ({ pedido_id: pedido.id, cotacao_id: e.cotacao_id, fornecedor: e.fornecedor, itens: e.itens, data_prevista: e.data_prevista, alerta_mencionado_em: e.alerta_mencionado_em, criado_por: r.user?.email || null }));
    if (novas.some(l => !l.data_prevista)) return falha('o pedido não tem data de entrega para todos os fornecedores; informe a data de cada um em "Alterar prazo de entrega" e receba de novo');
    const { data: criadas, error: erroCriar } = await supabase.from('compras_entregas').insert(novas).select('*');
    if (erroCriar) {
      // outra pessoa pode ter criado as linhas no mesmo instante (índice único): vale o que já está no banco
      const { data: dePois, error: erroDePois } = await supabase.from('compras_entregas').select('*').eq('pedido_id', pedido.id);
      if (erroDePois || !dePois?.length) return falha(explicarErroDoBanco(erroCriar));
      linhas = dePois;
    } else linhas = criadas || [];
  }

  if (linhas.every((l: any) => l.situacao === 'recebida')) {
    // estado de antes da E2 (pedido ainda "Comprado" com todas as entregas já recebidas): este recebimento fecha o pedido, como antes, sem marcar linha nenhuma
    return {
      erro: null, fechouPedido: r.confere, total: 1, faltam: r.confere ? [] : [String(entrega.fornecedor || 'Fornecedor')], dataDoPedido: null,
      campos: { numero_nf: nf || null, data_recebimento_real: dia, quantidade_recebida: r.quantidade_recebida, tem_divergencia: !r.confere },
    };
  }

  const alvo = linhas.find((l: any) => entrega.id ? String(l.id) === String(entrega.id) : String(l.cotacao_id || '') === String(entrega.cotacao_id || '') && String(l.fornecedor) === String(entrega.fornecedor));
  if (!alvo) return falha('a entrega deste fornecedor não foi encontrada; atualize a tela e tente de novo');
  if (alvo.situacao === 'recebida') return falha(`a entrega de ${alvo.fornecedor} já foi recebida (por outra pessoa, talvez); atualize a tela`);

  const marca: any = { numero_nf: nf || null, data_recebimento_real: dia, quantidade_recebida: r.quantidade_recebida, observacoes: r.observacoes || null };
  if (r.confere) { marca.situacao = 'recebida'; marca.recebida_em = new Date().toISOString(); marca.recebida_por = r.user?.email || null; }
  else { marca.situacao = 'divergencia'; marca.recebida_em = null; marca.recebida_por = null; }
  const { data: marcadas, error: erroMarcar } = await supabase.from('compras_entregas').update(marca).eq('id', alvo.id).neq('situacao', 'recebida').select('id');
  if (erroMarcar) return falha(explicarErroDoBanco(erroMarcar));
  if (!marcadas?.length) return falha(`a entrega de ${alvo.fornecedor} já foi recebida (por outra pessoa, talvez); atualize a tela`);

  const { data: depois, error: erroDepois } = await supabase.from('compras_entregas').select('*').eq('pedido_id', pedido.id);
  if (erroDepois) return falha(`o recebimento de ${alvo.fornecedor} foi marcado, mas não foi possível conferir se falta algum fornecedor (${explicarErroDoBanco(erroDepois)})`);
  const f = fechamentoDoPedido(depois || []);
  return { erro: null, fechouPedido: f.fechou, total: (depois || []).length, faltam: f.faltam, campos: f.campos, dataDoPedido: f.dataDoPedido };
}

/**
 * Grava no pedido o que o recebimento mudou: as NFs, o último dia, a soma recebida e a divergência; se NENHUM fornecedor ficou aberto, também a etapa "Recebido"
 * (com o dia da conclusão); senão o pedido segue "Comprado" e a data dele passa a ser a mais distante dos fornecedores que faltam.
 * Só grava se o pedido ainda está em "Comprado" (a conferência da linha devolvida evita gravar por cima de quem o mexeu).
 * `observacoes`: o texto livre do recebimento só vai para o pedido quando ele tem UM fornecedor só (como sempre foi); com vários, fica na entrega de cada um.
 */
export async function atualizarPedidoAposRecebimento(pedido: any, res: ResultadoDoRecebimento, observacoes?: string | null): Promise<{ erro: string | null }> {
  if (res.erro || !res.campos) return { erro: res.erro || 'recebimento sem resultado' };
  const upd: any = { ...res.campos };
  if (res.total <= 1 && observacoes !== undefined) upd.observacoes = observacoes || null;
  if (res.fechouPedido) { upd.status_compra = 'Recebido'; upd.data_conclusao = hojeLocal(); }
  else if (res.dataDoPedido) upd.data_prevista_recebimento = res.dataDoPedido;
  const { data, error } = await supabase.from('pcp_pedidos_compra').update(upd).eq('id', pedido.id).eq('status_compra', 'Comprado').select('id');
  if (error) return { erro: explicarErroDoBanco(error) };
  if (!data?.length) return { erro: 'o pedido não está mais em "Comprado" (alguém pode tê-lo mudado); atualize a tela' };
  return { erro: null };
}

/** Os fornecedores deste pedido que JÁ foram recebidos (o material entrou): quem volta uma etapa ou descarta o pedido precisa saber. Leitura recusada devolve `erro`. */
export async function fornecedoresJaRecebidos(pedidoId: string): Promise<{ erro: string | null; recebidos: string[] }> {
  const { data, error } = await supabase.from('compras_entregas').select('fornecedor,situacao').eq('pedido_id', pedidoId);
  if (error) return { erro: explicarErroDoBanco(error), recebidos: [] };
  return { erro: null, recebidos: (data || []).filter((l: any) => l.situacao === 'recebida').map((l: any) => String(l.fornecedor || '').trim() || 'Fornecedor') };
}

/** Pedido que volta de "Recebido" para "Comprado" (reprocesso): as entregas voltam a "aguardando" (a NF e o dia ficam como estavam, para consulta). Sem isto a compra refeita seria recusada. */
export async function reabrirEntregasDoPedido(pedidoId: string): Promise<{ erro: string | null }> {
  const { error } = await supabase.from('compras_entregas').update({ situacao: 'aguardando', recebida_em: null, recebida_por: null }).eq('pedido_id', pedidoId).neq('situacao', 'aguardando');
  return { erro: error ? explicarErroDoBanco(error) : null };
}

/** Identifica a entrega na tela, tenha linha ou não (a virtual não tem id). */
export const chaveDaEntrega = (e: { id: string | null; cotacao_id: string | null; fornecedor: string }) => e.id || `${e.cotacao_id || ''}|${e.fornecedor}`;

export type MudancaDeData = { fornecedor: string; de: string | null; para: string };

/**
 * Salva as novas datas das entregas ainda abertas (o comprador ajusta o prazo de um ou de vários fornecedores depois da compra). `novas`: chave da entrega → data.
 * Só grava a linha se a data ainda é a que a tela mostrava (outra pessoa pode tê-la mudado). Entrega recebida não muda.
 *  • linhas de `compras_entregas`: muda cada uma e refaz a data do pedido (a mais distante das abertas);
 *  • pedido antigo de um fornecedor só (uma entrega virtual): a data mora no pedido e muda lá;
 *  • pedido antigo de vários fornecedores (várias virtuais): é a primeira correção, então as linhas de TODOS nascem agora (cada um com a data que mostrava,
 *    o corrigido com a nova) e o pedido guarda a data mais distante.
 * `todas` são as entregas do pedido como a tela as mostra.
 */
export async function salvarDatasDasEntregas(pedido: any, todas: Entrega[], novas: Record<string, string>, user: any): Promise<{ erro: string | null; mudancas: MudancaDeData[] }> {
  const mudancas: { entrega: Entrega; de: string | null; para: string }[] = [];
  for (const e of todas) {
    if (e.situacao === 'recebida') continue;
    const n = diaDe(novas[chaveDaEntrega(e)]);
    if (n && n !== e.data_prevista) mudancas.push({ entrega: e, de: e.data_prevista, para: n });
  }
  const resultado = (erro: string | null) => ({ erro, mudancas: mudancas.map(m => ({ fornecedor: m.entrega.fornecedor, de: m.de, para: m.para })) });
  if (!mudancas.length) return resultado(null);

  const virtuais = todas.filter(e => e.virtual);
  if (virtuais.length > 1) {
    const linhas = virtuais.map(e => ({
      pedido_id: pedido.id, cotacao_id: e.cotacao_id, fornecedor: e.fornecedor, itens: e.itens, situacao: e.situacao,
      data_prevista: diaDe(novas[chaveDaEntrega(e)]) || e.data_prevista, criado_por: user?.email || null,
      alerta_mencionado_em: diaDe(novas[chaveDaEntrega(e)]) && diaDe(novas[chaveDaEntrega(e)]) !== e.data_prevista ? null : e.alerta_mencionado_em,
    }));
    if (linhas.some(l => !l.data_prevista)) return resultado('o pedido não tem data de entrega para todos os fornecedores; informe a data de cada um');
    const { error } = await supabase.from('compras_entregas').insert(linhas);
    if (error) return resultado(explicarErroDoBanco(error));
  } else if (virtuais.length === 1) {
    const { data, error } = await supabase.from('pcp_pedidos_compra').update({ data_prevista_recebimento: mudancas[0].para }).eq('id', pedido.id).select('id');
    if (error) return resultado(explicarErroDoBanco(error));
    if (!data?.length) return resultado('o pedido não foi alterado (alguém pode tê-lo mudado); atualize a tela e tente de novo');
    return resultado(null);
  } else {
    for (const m of mudancas) {
      const { data, error } = await supabase.from('compras_entregas').update({ data_prevista: m.para, alerta_mencionado_em: null })
        .eq('id', m.entrega.id).eq('data_prevista', m.de).neq('situacao', 'recebida').select('id');
      if (error) return resultado(explicarErroDoBanco(error));
      if (!data?.length) return resultado(`a data de ${m.entrega.fornecedor} já mudou ou a entrega já foi recebida; atualize a tela (as datas anteriores a esta já foram gravadas)`);
    }
  }
  const sync = await sincronizarDataDoPedido(pedido.id);
  return resultado(sync.erro ? `as datas foram gravadas, mas a data do pedido não foi atualizada (${sync.erro})` : null);
}

/** Recalcula a data do pedido (a mais distante das abertas) depois de mexer numa entrega; o campo único do pedido segue para as telas que ainda leem um valor só. */
export async function sincronizarDataDoPedido(pedidoId: string): Promise<{ erro: string | null; data: string | null }> {
  const { data: linhas, error } = await supabase.from('compras_entregas').select('data_prevista,situacao').eq('pedido_id', pedidoId);
  if (error) return { erro: explicarErroDoBanco(error), data: null };
  if (!linhas?.length) return { erro: null, data: null };
  const abertas = linhas.filter((l: any) => l.situacao !== 'recebida');
  const base = (abertas.length ? abertas : linhas).map((l: any) => diaDe(l.data_prevista)).filter(Boolean).sort() as string[];
  const data = base[base.length - 1] || null;
  if (!data) return { erro: null, data: null };
  const { error: erroUp } = await supabase.from('pcp_pedidos_compra').update({ data_prevista_recebimento: data }).eq('id', pedidoId);
  return { erro: erroUp ? explicarErroDoBanco(erroUp) : null, data };
}

/** O que a entrega dos pedidos antigos e das novas diz, em frase curta, para a pessoa que olha o pedido ("Chega em 20/11" ou "A: 20/11 · B: 25/11"). */
export function textoDaPrevisao(pedido: any, linhas: any[] = [], coleta = false): string {
  const e = entregasDoPedido(pedido, linhas);
  if (!e.length) return '';
  const abertas = abertasDoPedido(e);
  if (!abertas.length) return 'Tudo recebido';
  return `${coleta ? 'Coleta' : 'Chega'}: ${resumoDasEntregas(abertas)}`;
}

// ── Alerta de atraso por fornecedor (etapa E3, 17/11/2026) ───────────────────
// Decidido com o usuário: cada fornecedor atrasa, avisa e recebe a sua posição separado.

/**
 * Marca, de forma atômica, que o aviso de atraso desta entrega vai ser enviado agora: devolve false se outra tela já o marcou (ninguém envia duas vezes).
 * Entrega com linha marca a própria linha; a "virtual" (pedido sem linhas) marca o pedido, como sempre foi.
 */
export async function marcarAvisoDaEntrega(pedido: any, entrega: Entrega): Promise<boolean> {
  const agora = new Date().toISOString();
  if (entrega.id) {
    const { data } = await supabase.from('compras_entregas').update({ alerta_mencionado_em: agora }).eq('id', entrega.id).is('alerta_mencionado_em', null).select('id');
    return !!data?.length;
  }
  const { data } = await supabase.from('pcp_pedidos_compra').update({ alerta_entrega_mencionado_em: agora }).eq('id', pedido.id).is('alerta_entrega_mencionado_em', null).select('id');
  return !!data?.length;
}

/**
 * Registra a posição de UMA entrega atrasada (o texto já foi para o histórico do pedido): marca `posicao_em`, que silencia o alerta DESTE fornecedor por 24 horas úteis,
 * e reabre o aviso dela em Menções (`alerta_mencionado_em` vazio: volta a avisar se continuar atrasada).
 *  • entrega com linha: marca a linha (só se ainda não foi recebida);
 *  • entrega virtual de pedido de vários fornecedores (sem linhas): as linhas de TODOS nascem agora, como na primeira correção de data (cada um com a data que mostrava e o aviso
 *    que o pedido já tinha enviado), e só a escolhida leva a posição — a ação é da pessoa, nenhuma linha nasce sozinha;
 *  • entrega virtual de um fornecedor só: não há o que marcar na entrega; o aviso do pedido é reaberto e a movimentação do pedido, que o histórico atualiza, silencia o alerta.
 * `todas` são as entregas do pedido como o alerta as viu.
 */
export async function registrarPosicaoDaEntrega(pedido: any, entrega: Entrega, todas: Entrega[], user: any): Promise<{ erro: string | null }> {
  const agora = new Date().toISOString();
  if (entrega.id) {
    const { data, error } = await supabase.from('compras_entregas').update({ posicao_em: agora, alerta_mencionado_em: null }).eq('id', entrega.id).neq('situacao', 'recebida').select('id');
    if (error) return { erro: explicarErroDoBanco(error) };
    if (!data?.length) return { erro: 'a entrega já foi recebida ou mudou; atualize a tela' };
    return { erro: null };
  }
  const virtuais = (todas || []).filter(e => e.virtual);
  if (virtuais.length > 1) {
    const escolhida = (e: Entrega) => chaveDaEntrega(e) === chaveDaEntrega(entrega);
    const linhas = virtuais.map(e => ({
      pedido_id: pedido.id, cotacao_id: e.cotacao_id, fornecedor: e.fornecedor, itens: e.itens, situacao: e.situacao, data_prevista: e.data_prevista,
      alerta_mencionado_em: escolhida(e) ? null : e.alerta_mencionado_em, posicao_em: escolhida(e) ? agora : null, criado_por: user?.email || null,
    }));
    if (linhas.some(l => !l.data_prevista)) return { erro: 'o pedido não tem data de entrega para todos os fornecedores' };
    const { error } = await supabase.from('compras_entregas').insert(linhas);
    if (!error) return { erro: null };
    // outra pessoa pode ter criado as linhas no mesmo instante (índice único): vale o que já está no banco
    const { data: dePois, error: erroDePois } = await supabase.from('compras_entregas').select('*').eq('pedido_id', pedido.id);
    const alvo = (dePois || []).find((l: any) => String(l.cotacao_id || '') === String(entrega.cotacao_id || '') && String(l.fornecedor) === String(entrega.fornecedor));
    if (erroDePois || !alvo) return { erro: explicarErroDoBanco(error) };
    return registrarPosicaoDaEntrega(pedido, daLinha(alvo), [], user);
  }
  const { error } = await supabase.from('pcp_pedidos_compra').update({ alerta_entrega_mencionado_em: null }).eq('id', pedido.id);
  return { erro: error ? explicarErroDoBanco(error) : null };
}

// ── O resto do sistema lê por fornecedor (etapa E4, 17/11/2026) ──────────────
// Decidido com o usuário: "alterar o sistema todo para que possamos ter dados reais de quando chega o que". As telas de fora do Compras (card da OP, pendências do
// Almoxarifado, espera de material, CRM, Minhas Solicitações, relatório, conciliação) usam estes três ajudantes em vez de ler `data_prevista_recebimento`.

/**
 * Lê as linhas de entrega SÓ dos pedidos comprados com MAIS DE UM fornecedor vencedor: o pedido de um fornecedor só (a maioria) vale pela data do próprio pedido,
 * que é mantida igual à da entrega (`sincronizarDataDoPedido`), e não precisa de consulta. Os pedidos passados devem trazer `vencedoras`, `itens`, `status_compra` e `fornecedor`.
 * Leitura recusada devolve `erro` (nunca "sem entregas": o pedido cairia calado numa data só).
 */
export async function lerEntregasDosPedidos(pedidos: any[]): Promise<{ linhas: any[]; erro: string | null }> {
  const ids = (pedidos || []).filter(p => temEntrega(p) && entregasPlanejadas(p).length > 1).map(p => p.id);
  return ids.length ? lerEntregas(ids) : { linhas: [], erro: null };
}

export type ChegadaDoPedido = { entregas: Entrega[]; abertas: Entrega[]; atrasadas: Entrega[]; varias: boolean; proxima: string | null; distante: string | null };

/** Como o material deste pedido está chegando: as entregas, as ainda abertas, as atrasadas hoje (`hoje` = AAAA-MM-DD) e a data da próxima e da última a chegar. */
export function chegadaDoPedido(pedido: any, linhas: any[] = [], hoje: string): ChegadaDoPedido {
  const entregas = entregasDoPedido(pedido, linhas);
  const abertas = abertasDoPedido(entregas);
  return { entregas, abertas, atrasadas: abertas.filter(e => estaAtrasada(e, hoje)), varias: entregas.length > 1, proxima: dataMaisProxima(entregas), distante: dataMaisDistante(entregas) };
}

/**
 * As entregas que cobrem o item de posição `posicao` (0-based, a mesma numeração das vencedoras): as que têm a posição na lista de itens e, sem lista, o pedido inteiro.
 * O item só "chegou" quando TODAS as entregas que o cobrem foram recebidas (dois fornecedores sem lista de itens, no formato antigo, não dizem de quem é o item: vale o mais cauteloso).
 */
export function entregasDoItem(entregas: Entrega[], posicao: number): Entrega[] {
  return (entregas || []).filter(e => !e.itens?.length || e.itens.includes(posicao));
}

/** "A: 20/11 · B: recebida 18/11 · C: 05/11 (atrasada)": a frase das dicas e das listas para um pedido de vários fornecedores (vazia se o pedido tem uma entrega só). */
export function frasePorFornecedor(entregas: Entrega[], hoje: string): string {
  if (!entregas || entregas.length < 2) return '';
  return entregas.map(e => e.situacao === 'recebida'
    ? `${e.fornecedor}: recebida ${dataCurta(e.data_recebimento_real || e.data_prevista)}`
    : `${e.fornecedor}: ${dataCurta(e.data_prevista)}${estaAtrasada(e, hoje) ? ' (atrasada)' : e.situacao === 'divergencia' ? ' (com divergência)' : ''}`).join(' · ');
}
