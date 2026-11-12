// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS — busca geral e ordem dos cards (pedido do usuário em 05/11/2026)
//
// A tela de Requisições de Compra só filtrava por status. Agora há uma caixa de busca que procura em QUALQUER informação do card (como nas outras telas) e uma escolha de ordem
// para as colunas e para a tabela. Tudo é feito aqui no navegador, sobre os pedidos que a tela já leu (select *): não há consulta nova ao banco.
//
// Cuidado de dinheiro: quem não tem a permissão de ver valores NÃO pode descobrir um valor pela busca (digitar "1500" e ver o card aparecer), então valor da compra, dos itens e da
// cotação ficam fora do texto de busca dessa pessoa — e as ordens por valor nem aparecem para ela.
// ─────────────────────────────────────────────────────────────────────────────
import { combinaBusca } from './SearchUtils';

export type OrdemDeCompras = 'padrao' | 'criacao_antiga' | 'movimentacao' | 'entrega_proxima' | 'prometido_proximo' | 'valor_maior' | 'valor_menor' | 'fornecedor' | 'numero';

export const ORDENS_DE_COMPRAS: { id: OrdemDeCompras; rotulo: string; soComValor?: boolean }[] = [
  { id: 'padrao',            rotulo: 'Criado: mais recente primeiro' },
  { id: 'criacao_antiga',    rotulo: 'Criado: mais antigo primeiro' },
  { id: 'movimentacao',      rotulo: 'Movimentado há menos tempo' },
  { id: 'entrega_proxima',   rotulo: 'Entrega prevista: mais próxima' },
  { id: 'prometido_proximo', rotulo: 'Prazo prometido: mais próximo' },
  { id: 'valor_maior',       rotulo: 'Valor: maior primeiro', soComValor: true },
  { id: 'valor_menor',       rotulo: 'Valor: menor primeiro', soComValor: true },
  { id: 'fornecedor',        rotulo: 'Fornecedor: A a Z' },
  { id: 'numero',            rotulo: 'Nº do pedido: crescente' },
];

/** As ordens que a pessoa pode escolher: sem a permissão de ver valores, as ordens por valor não aparecem. */
export const ordensDisponiveis = (podeVerValor: boolean) => ORDENS_DE_COMPRAS.filter(o => podeVerValor || !o.soComValor);

const CHAVES_DE_VALOR = /^(valor|preco|preço|custo)/i;
const diaBR = (d: any) => { const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

/** Todo o texto do card em que a busca procura: as colunas simples do pedido (menos as de dinheiro, para quem não vê valores), o nome do departamento, as datas também no formato
 *  dia/mês/ano e o nome, a descrição e o fornecedor sugerido de cada item da lista. Colunas com lista ou objeto (cotações, vencedoras) ficam de fora. */
export function textoDeBuscaDoPedido(p: any, podeVerValor: boolean, departamentos: any[] = []): string[] {
  const partes: string[] = [];
  for (const [k, v] of Object.entries(p || {})) {
    if (v == null || typeof v === 'object' || typeof v === 'boolean') continue;
    if (!podeVerValor && CHAVES_DE_VALOR.test(k)) continue;
    if (k.endsWith('_id') || k === 'id') continue;   // identificadores internos: a pessoa nunca os viu na tela
    partes.push(String(v));
    const dia = diaBR(v);
    if (dia && /(data|prazo|prev|coletado|descartado)/i.test(k)) partes.push(dia);
  }
  const dep = (departamentos || []).find((d: any) => d.id === p?.departamento_id);
  if (dep?.nome) partes.push(dep.nome);
  for (const i of Array.isArray(p?.itens) ? p.itens : []) {
    for (const k of ['nome', 'descricao', 'fornecedor_sugerido', 'codigo']) if (i?.[k]) partes.push(String(i[k]));
  }
  return partes;
}

export const pedidoCombinaComBusca = (p: any, busca: string, podeVerValor: boolean, departamentos: any[] = []) =>
  !String(busca || '').trim() || combinaBusca(textoDeBuscaDoPedido(p, podeVerValor, departamentos), busca);

const ms = (d: any) => { const t = Date.parse(String(d ?? '')); return Number.isFinite(t) ? t : null; };
const numero = (v: any) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };   // Number(null) é 0: sem isto "sem valor" ganharia de "R$ 10" na ordem do menor valor
const soNumeros = (s: any) => { const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };

/** Compara dois valores que podem faltar: quem não tem o dado vai sempre para o fim, qualquer que seja o sentido. */
function comparar(a: number | string | null, b: number | string | null, crescente: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), 'pt-BR') : (a as number) - (b as number);
  return crescente ? r : -r;
}

/** Devolve uma lista nova na ordem escolhida. "Padrão" é a ordem de sempre (mais recente criado primeiro) e empata pelo número, para a ordem não pular entre leituras. */
export function ordenarPedidos(lista: any[], ordem: OrdemDeCompras): any[] {
  const criado = (p: any) => ms(p?.data_criacao);
  const chave: Record<OrdemDeCompras, (p: any) => number | string | null> = {
    padrao: criado, criacao_antiga: criado,
    movimentacao: p => ms(p?.ultima_movimentacao_em) ?? ms(p?.data_atualizacao) ?? criado(p),
    entrega_proxima: p => ms(p?.data_prevista_recebimento),
    prometido_proximo: p => ms(p?.prazo_prometido_entrega),
    valor_maior: p => numero(p?.valor_compra), valor_menor: p => numero(p?.valor_compra),
    fornecedor: p => (String(p?.fornecedor || '').trim() || null),
    numero: p => soNumeros(p?.numero_pedido),
  };
  const crescente = ordem === 'criacao_antiga' || ordem === 'entrega_proxima' || ordem === 'prometido_proximo' || ordem === 'valor_menor' || ordem === 'fornecedor' || ordem === 'numero';
  const k = chave[ordem] || chave.padrao;
  return [...(lista || [])].sort((a, b) => comparar(k(a), k(b), crescente) || comparar(soNumeros(b?.numero_pedido), soNumeros(a?.numero_pedido), true));
}
