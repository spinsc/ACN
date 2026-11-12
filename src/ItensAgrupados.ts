// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ItensAgrupados — a separação do Almoxarifado junta os itens iguais da BOM (pedido do usuário em 06/11/2026)
//
// A BOM calculada pela estrutura de instalação tem o MESMO material em várias linhas, uma por item que ele instala (o parafuso M3 do azul e o do vermelho, a arruela da sirene e a do
// azul…). Para quem calcula e confere a estrutura isso importa; para quem separa na prateleira não: "pro Almoxarifado não faz diferença onde ele vai instalado". Então a conferência de
// separação (a lista que o Almoxarifado e o Telecom marcam, a impressa e a que vai ao Dossiê) tem UMA linha por item, com a quantidade somada. A BOM em si, no PCP e na Engenharia,
// continua em pai e filho, como estava: só a separação junta.
//
// Também corrige o estoque: a baixa compara o que foi separado com o que a OP já baixou DO ITEM INTEIRO; com o mesmo item em duas linhas, a segunda gravação da separação devolvia
// material que não devia (cada linha era comparada com o total já baixado do item). Com uma linha por item a conta fica certa.
//
// Quem é o "mesmo item": o mesmo cadastro (`item_id`) e a mesma unidade; item digitado à mão (sem cadastro) pelo mesmo nome sem acento e sem diferença de maiúscula. Unidades diferentes
// (metro e peça do mesmo item) não se somam.
//
// Conferência já gravada: até 06/11/2026 ela guardava uma linha por linha da BOM, na mesma ordem. O registro novo leva `agrupado: true` e uma linha por item; o antigo é lido do jeito
// de sempre e SOMADO por item, então uma separação salva pela metade antes da mudança volta de onde parou, sem perder o que foi marcado nem o serial digitado.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarBusca } from './SearchUtils';

// a mesma leitura de número do OpItens: "1.000,5" é mil e meio, "12,5" é doze e meio
const num = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
/** Soma de quantidades sem sobra de ponto flutuante (0,1 + 0,2): quatro casas bastam para metro, quilo e peça. */
const arred = (n: number) => Math.round(n * 10000) / 10000;
const unicos = (lista: string[]) => [...new Set(lista.map(s => String(s || '').trim()).filter(Boolean))];
const listaDeSeriais = (t: any): string[] => unicos(String(t ?? '').split(/[\n,;]+/));

/** A chave que diz "é o mesmo item": o cadastro e a unidade (ou, sem cadastro, o nome sem acento). */
export const chaveDoItem = (l: any) =>
  `${l?.item_id ? `id:${l.item_id}` : `txt:${normalizarBusca(String(l?.nome ?? '')).trim()}`}|${String(l?.unidade ?? '').trim().toLowerCase()}`;

/**
 * Junta as linhas iguais da BOM, na ordem em que cada item aparece pela primeira vez, somando a quantidade. A linha devolvida não tem pai (`pai_item_id`, `pai_nome`): o que ela instala vai
 * só como dica em `instala` (a tela mostra no passar do mouse), e `ocorrencias` diz de quantas linhas da BOM ela veio.
 */
export function agruparItensIguais(linhas: any[]): any[] {
  const grupos = new Map<string, any>();
  for (const b of linhas || []) {
    const chave = chaveDoItem(b);
    const descricao = String(b?.descricao || '').trim();
    const g = grupos.get(chave);
    if (!g) {
      const { pai_item_id, pai_nome, ...resto } = b || {};
      grupos.set(chave, { ...resto, chave, quantidade: arred(num(b?.quantidade)), ocorrencias: 1, instala: pai_nome ? [String(pai_nome)] : [], descricoes: descricao ? [descricao] : [] });
    } else {
      g.quantidade = arred(g.quantidade + num(b?.quantidade));
      g.ocorrencias += 1;
      if (b?.pai_nome) g.instala.push(String(b.pai_nome));
      if (descricao) g.descricoes.push(descricao);
    }
  }
  return [...grupos.values()].map(({ descricoes, instala, ...g }) => ({ ...g, instala: unicos(instala), descricao: unicos(descricoes).join(' · ') }));
}

/**
 * Estado inicial do checklist de separação: UMA linha por item, a quantidade somada, e o que já foi marcado antes.
 *
 * Começa VAZIO (quem marca é o Almoxarifado, conforme coloca a peça na caixa — decidido com o usuário em 28/09/2026) e uma separação salva pela metade volta de onde parou.
 * `completo` é o kiting em lote, onde não há conferência linha a linha e a BOM inteira entra como separada.
 */
export function conferenciaPorItem(opl: any, { completo = false }: any = {}): any[] {
  const bom = opl?.bom_itens || [];
  const reg = opl?.kit_conferencia;
  const anteriores = reg?.linhas || [];
  const grupos = agruparItensIguais(bom);
  const feito = new Map<string, { separado: number; obs: string[]; seriais: string[] }>();
  const somar = (chave: string, ant: any, padrao: number) => {
    const f = feito.get(chave) || { separado: 0, obs: [], seriais: [] };
    f.separado = arred(f.separado + (ant ? num(ant.separado) : padrao));
    if (ant?.obs) f.obs.push(String(ant.obs));
    if (ant?.seriais) f.seriais.push(...listaDeSeriais(ant.seriais));
    feito.set(chave, f);
  };
  if (reg?.agrupado) {
    // registro novo: uma linha por item, achada pela chave (a BOM pode ter mudado de ordem ou de itens depois de salvar)
    const guardados = new Map<string, any>();
    anteriores.forEach((a: any) => guardados.set(chaveDoItem(a), a));
    grupos.forEach(g => somar(g.chave, guardados.get(g.chave) || null, completo ? g.quantidade : 0));
  } else {
    // registro antigo: uma linha por linha da BOM, na mesma posição e com o mesmo nome; soma o que foi marcado nas linhas do mesmo item
    bom.forEach((b: any, i: number) => somar(chaveDoItem(b), anteriores[i]?.nome === b.nome ? anteriores[i] : null, completo ? num(b.quantidade) : 0));
  }
  return grupos.map(g => {
    const f = feito.get(g.chave)!;
    return { ...g, planejado: g.quantidade, separado: f.separado, obs: unicos(f.obs).join(' / '), seriais: f.seriais.length ? unicos(f.seriais).join(', ') : '' };
  });
}

/** A lista tem uma linha por item (nenhum item repetido)? É o que o registro novo da conferência promete com `agrupado: true`. */
export const listaPorItem = (linhas: any[]) => {
  const chaves = (linhas || []).map(chaveDoItem);
  return new Set(chaves).size === chaves.length;
};
