// Ligar a OP ao cliente do cadastro (módulo fiscal, 27/11/2026). Regras puras: não leem nem gravam nada (a leitura e a gravação estão em FiscalDados.ts).
// Por quê: a OP só guardava o NOME escrito do cliente; a nota precisa do cadastro (IE, município, tipo de órgão...). A ligação é a coluna `oples.cliente_id`.
// O Fiscal liga POR NOME: todas as OPs que dizem o mesmo cliente (os carros de um lote, as OPs do mesmo pedido) viram uma linha só, e uma escolha vale para todas.
import { acharCliente, chaveDoNome } from './FiscalProntidao.ts';

/** OP que ainda vai virar nota: viva (nem cancelada nem já faturada) e sem número de nota. */
export function opPrecisaDeLigacao(op: any): boolean {
  if (!op || op.cliente_id) return false;
  const status = String(op.status_geral || '').trim();
  if (status === 'Cancelado' || status === 'Faturado') return false;
  return !String(op.numero_nf || '').trim();
}

export type SugestaoDeLigacao = { situacao: 'achado' | 'ambiguo' | 'sem_cadastro' | 'sem_nome'; cliente: any | null; por: 'documento' | 'nome' | '' };

export type GrupoDeLigacao = {
  chave: string;                 // o nome do cliente sem acento nem caixa
  nome: string;                  // como está escrito na primeira OP
  ops: any[];                    // as OPs do grupo, em ordem de número
  sugestao: SugestaoDeLigacao;   // só vale 'achado' quando TODAS as OPs do grupo apontam para o MESMO cadastro
};

/** Junta as OPs pelo nome do cliente e diz, para cada grupo, o cadastro que bate sozinho (CPF/CNPJ da OP ou nome idêntico, um só). Dois iguais ou divergência dentro do grupo = nada sugerido. */
export function agruparParaLigar(ops: any[], clientes: any[]): GrupoDeLigacao[] {
  const porChave = new Map<string, any[]>();
  for (const op of (ops || []).filter(opPrecisaDeLigacao)) {
    const k = chaveDoNome(op.cliente_nome);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(op);
  }
  const grupos: GrupoDeLigacao[] = [];
  for (const [chave, lista] of porChave) {
    const ordenadas = [...lista].sort((a, b) => String(a.opl || '').localeCompare(String(b.opl || ''), 'pt-BR', { numeric: true }));
    const achados = ordenadas.map(op => acharCliente(op, clientes));
    const primeiro = achados[0];
    let sugestao: SugestaoDeLigacao;
    if (!chave) sugestao = { situacao: 'sem_nome', cliente: null, por: '' };
    else if (achados.every(a => a.situacao === 'achado' && a.cliente?.id === primeiro.cliente?.id)) sugestao = { situacao: 'achado', cliente: primeiro.cliente, por: primeiro.por === 'documento' ? 'documento' : 'nome' };
    else if (achados.some(a => a.situacao === 'ambiguo' || a.situacao === 'achado')) sugestao = { situacao: 'ambiguo', cliente: null, por: primeiro.por === 'documento' ? 'documento' : 'nome' };
    else sugestao = { situacao: 'sem_cadastro', cliente: null, por: 'nome' };
    grupos.push({ chave, nome: String(ordenadas[0].cliente_nome || '').trim(), ops: ordenadas, sugestao });
  }
  return grupos.sort((a, b) => b.ops.length - a.ops.length || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Os grupos que se podem ligar de uma vez, sem a pessoa escolher nada: os que o cadastro acha sozinho. */
export const gruposComSugestao = (grupos: GrupoDeLigacao[]) => (grupos || []).filter(g => g.sugestao.situacao === 'achado');

/** Resumo para os cartões da tela. */
export function resumoDasLigacoes(grupos: GrupoDeLigacao[]) {
  const g = grupos || [];
  const soma = (l: GrupoDeLigacao[]) => l.reduce((n, x) => n + x.ops.length, 0);
  const sug = gruposComSugestao(g);
  return { ops: soma(g), nomes: g.length, opsComSugestao: soma(sug), nomesComSugestao: sug.length, opsSemSugestao: soma(g) - soma(sug) };
}
