// ─────────────────────────────────────────────────────────────────
// CPF/CNPJ DO CLIENTE NA OP (pedido do usuário em 27/11/2026)
//
// O Financeiro precisa do CNPJ do cliente e do valor da NF-e para cotar o frete de uma OP de envio de material. Por isso o documento do cliente passa a
// ser pedido NA ABERTURA da OP, obrigatório só no fluxo "envio de material" (decisão do usuário: os outros fluxos seguem como estavam). A janela de
// Frete da Logística já mostra o documento e o valor da NF-e (= o valor total da OP, escolha do usuário) a partir do que a OP sabe.
//
// Regras puras, sem banco (o teste as carrega direto no Node). O que lê e grava está em ClienteDocumentoOpDados.ts.
// ─────────────────────────────────────────────────────────────────
import { soDigitos, documentoValido } from './FiscalRegras';

/** A OP pede o documento do cliente quando ALGUM dos fluxos dela é envio de material (a Nova OP mista passa o fluxo de cada grupo). */
export function fluxoPedeDocumentoDoCliente(fluxos: any): boolean {
  const lista = Array.isArray(fluxos) ? fluxos : [fluxos];
  return lista.some(f => String(f || '') === 'envio_material');
}

/** 11 dígitos = CPF, 14 = CNPJ; qualquer outro tamanho não vale. Vazio devolve null (nunca "" nem zeros). */
export function documentoParaGravar(v: any): string | null {
  const d = soDigitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
}

/** 000.000.000-00 ou 00.000.000/0000-00 (o que ainda não é completo volta só com a máscara dos dígitos já digitados). */
export function formatarDocumento(v: any): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

/** A frase de erro (vazia = pode seguir). `obrigatorio` = a OP é de envio de material. Documento digitado errado é recusado até quando não é obrigatório. */
export function erroDoDocumentoDoCliente(v: any, obrigatorio: boolean): string {
  const d = soDigitos(v);
  if (!d) return obrigatorio ? 'Informe o CPF ou CNPJ do cliente: o Financeiro precisa dele para cotar o frete do envio de material.' : '';
  if (d.length !== 11 && d.length !== 14) return 'O CPF tem 11 dígitos e o CNPJ tem 14: confira o número do cliente.';
  if (!documentoValido(d)) return 'O CPF ou CNPJ do cliente não é válido: confira os dígitos.';
  return '';
}

// sem acento (faixa dos acentos soltos escrita por código, para o arquivo não depender de como o editor grava), maiúsculo, espaços juntos
const semAcentoMaiusculo = (v: any) => String(v ?? '').normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '').toUpperCase().replace(/\s+/g, ' ').trim();

export type OrigemDoDocumento = 'op' | 'cadastro' | 'cadastro_pelo_nome' | 'faturamento';
export type DocumentoDaOp = { documento: string; origem: OrigemDoDocumento } | null;

/**
 * O documento que a janela de Frete mostra. Ordem: o que foi digitado na OP; o do cadastro do cliente ligado à OP (`cliente_id`); o do cadastro achado pelo
 * nome escrito, só quando UM cliente tem aquele nome; por último o CNPJ de faturamento da OP (pode ser de outra empresa, então a tela pede para conferir
 * e nunca o grava como se fosse do cliente). `clientes` = linhas de `clientes` (id, nome, documento). Nada achado = null: nunca se inventa.
 */
export function documentoDaOp(op: any, clientes: any[]): DocumentoDaOp {
  const daOp = documentoParaGravar(op?.cliente_documento);
  if (daOp) return { documento: daOp, origem: 'op' };
  const lista = clientes || [];
  if (op?.cliente_id) {
    const c = lista.find(x => String(x.id) === String(op.cliente_id));
    const d = documentoParaGravar(c?.documento);
    if (d) return { documento: d, origem: 'cadastro' };
  } else {
    const nome = semAcentoMaiusculo(op?.cliente_nome);
    if (nome) {
      const iguais = lista.filter(x => semAcentoMaiusculo(x.nome) === nome);
      if (iguais.length === 1) {
        const d = documentoParaGravar(iguais[0].documento);
        if (d) return { documento: d, origem: 'cadastro_pelo_nome' };
      }
    }
  }
  const fat = documentoParaGravar(op?.cnpj_faturamento);
  if (fat) return { documento: fat, origem: 'faturamento' };
  return null;
}

export const RODAPE_DA_ORIGEM: Record<OrigemDoDocumento, string> = {
  op: '',
  cadastro: 'vem do cadastro do cliente',
  cadastro_pelo_nome: 'vem do cadastro (cliente achado pelo nome): confira',
  faturamento: 'é o CNPJ de faturamento da OP, que pode não ser o do cliente: confira',
};

/** O valor da NF-e do envio de material = o valor total da OP (escolha do usuário em 27/11/2026). Vazio ou zero = sem valor (a tela mostra "não informado"). */
export function valorDaNfDaOp(op: any): number | null {
  const n = Number(op?.valor_total);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** O texto do pedido ao vendedor (menção + andamento da OP). */
export function textoDoPedidoDeDocumento({ op, quem }: { op: any; quem: string }): string {
  return `Falta o CPF/CNPJ do cliente na OP ${op?.opl}: ${quem} não consegue cotar o frete do envio de material sem ele. Preencha na edição da OP (campo "CPF/CNPJ do cliente").`;
}
