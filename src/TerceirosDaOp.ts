// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OP QUE É SÓ SERVIÇO DE TERCEIRO — abrir os serviços da OP (pedido do usuário em 25/11/2026)
//
// As OPs 1760, 1797 e 1806 eram só plotagem e mais nada: não precisam do PCP, do Almoxarifado nem da Adaptação. O fluxo "Somente serviço de terceiro" (FluxoEntrega.ts) faz a OP
// nascer direto em "Aguardando Servico de Terceiro", e é daqui que nasce o serviço do módulo de Serviços de terceiros: UM serviço por tipo marcado e por unidade (cada OP /NN),
// em "A definir", ligado à OP. Quem escolhe o prestador e o dia é quem o tipo manda (Adaptação para plotagem, película e pintura; quem pediu nos outros).
//
// Quem grava é a função do banco `terceiros_solicitar` (por `pedirServicos`), nunca um insert direto: ela confere o tipo, a OP e o serviço repetido em aberto.
// Esta rotina NUNCA lança erro: a OP já existe quando ela roda, e o que falhar volta como aviso, para a tela dizer à pessoa que abra a OP e peça o serviço pelo botão
// "Pedir serviço de terceiro" (o quadro "Serviços de terceiros" da OP avisa em vermelho enquanto a OP só de terceiro estiver sem serviço).
// ─────────────────────────────────────────────────────────────────────────────
import { lerTipos, chaveDoNome } from './TerceirosModelo';
import { pedirServicos } from './TerceirosServicos';

/** Os nomes dos tipos de serviço marcados na OP, sem repetir, na ordem em que foram marcados. */
export function tiposDaOp(op: any): string[] {
  const lista = Array.isArray(op?.tipos_servico_terceiro) && op.tipos_servico_terceiro.length
    ? op.tipos_servico_terceiro
    : (op?.tipo_servico_terceiro ? [op.tipo_servico_terceiro] : []);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const t of lista) {
    const nome = String(t ?? '').trim();
    const chave = chaveDoNome(nome);
    if (!nome || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(nome);
  }
  return saida;
}

/** O que a pessoa precisa preencher na Nova OP para o fluxo "Somente serviço de terceiro": pelo menos um tipo e, no "Outro", a descrição. Vazio = pode seguir. */
export function erroDoServicoDaOp({ tipos, obs }: { tipos: string[]; obs: string }): string | null {
  if (!tipos || tipos.length === 0) return 'Marque o tipo de serviço de terceiro: sem ele a OP não tem o que fazer.';
  if (tipos.some(t => chaveDoNome(t) === 'outro') && String(obs || '').trim().length < 3) return 'Descreva o serviço marcado como "Outro" (pelo menos 3 letras).';
  return null;
}

const dataBr = (iso: any) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

export type ResultadoDosServicos = { abertos: number; avisos: string[] };

/**
 * Abre os serviços de terceiro das OPs recém-criadas (todas do mesmo lote ou cópia: o mesmo cliente, os mesmos tipos).
 *  `ops`: as OPs gravadas, com `id` e `opl`; `modelo`: a OP de onde saem os tipos, o cliente, a descrição do "Outro" e o prazo.
 * Cada tipo vira UM pedido ao banco (um serviço por OP); tipo que falha não impede os outros.
 */
export async function abrirServicosDaOp({ ops, modelo }: { ops: { id: string; opl?: string }[]; modelo: any }): Promise<ResultadoDosServicos> {
  const avisos: string[] = [];
  const nomes = tiposDaOp(modelo);
  const ids = (ops || []).map(o => o?.id).filter(Boolean);
  if (!ids.length) return { abertos: 0, avisos: ['Nenhuma OP foi gravada, então nenhum serviço de terceiro foi aberto.'] };
  if (!nomes.length) return { abertos: 0, avisos: ['A OP não tem tipo de serviço de terceiro marcado: nenhum serviço foi aberto.'] };

  const r = await lerTipos();
  if (r.erro) return { abertos: 0, avisos: [`Não foi possível ler os tipos de serviço de terceiro (${r.erro}). Nenhum serviço foi aberto.`] };
  const porNome = new Map((r.lista || []).filter(t => t.ativo).map(t => [chaveDoNome(t.nome), t]));

  const cliente = String(modelo?.cliente_nome || '').trim();
  const prazo = dataBr(modelo?.data_prevista_entrega);
  const observacao = [prazo ? `Prazo de entrega da OP: ${prazo}.` : '', 'Pedido aberto sozinho ao criar a OP (fluxo "Somente serviço de terceiro").'].filter(Boolean).join(' ');

  let abertos = 0;
  for (const nome of nomes) {
    const tipo = porNome.get(chaveDoNome(nome));
    if (!tipo) { avisos.push(`O tipo "${nome}" não está ativo no cadastro de Serviços de terceiros: abra a OP e peça esse serviço pelo botão "Pedir serviço de terceiro".`); continue; }
    const descricao = chaveDoNome(nome) === 'outro' && String(modelo?.obs_servico_terceiro || '').trim()
      ? String(modelo.obs_servico_terceiro).trim()
      : `${tipo.nome}${cliente ? ` — ${cliente}` : ''}`;
    // o banco aceita até 100 unidades por pedido
    for (let i = 0; i < ids.length; i += 100) {
      const bloco = ids.slice(i, i + 100);
      const p = await pedirServicos({
        tipo_id: tipo.id, descricao, ligacoes: bloco.map(id => ({ tipo: 'op', id })), data_desejada: null, observacao, pecas: [], prestador_id: null,
        valor_combinado: null, onde: null, permitir_duplicado: false, anexos: [],
      });
      if (p.ok) abertos += bloco.length;
      else avisos.push(`${tipo.nome}: ${p.erro}`);
    }
  }
  return { abertos, avisos };
}
