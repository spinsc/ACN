// Regras puras do bucket PRIVADO (Etapa 17, onda 5b, 26/11/2026): quais arquivos moram nele e como o endereço guardado no banco vira um caminho.
// Por que existe: o bucket `acn-media` é público (quem tem o endereço lê sem entrar). Os anexos do chat e as assinaturas de clientes e funcionários passaram para o
// `acn-privado`, que só entrega o arquivo por um endereço assinado de 1 hora a quem entrou no sistema (e, no chat, só aos membros da sala).
// Sem imports de propósito: dá para testar com `node` puro (ferramentas/migrar_bucket/teste_regras.cjs).

export const BUCKET_PRIVADO = 'acn-privado';
/** O que se grava no banco para um arquivo do bucket privado: "privado:" + o caminho. Os registros antigos guardam o endereço público inteiro e continuam valendo. */
export const MARCA_PRIVADA = 'privado:';
const TRECHO_PUBLICO = '/storage/v1/object/public/acn-media/';

/** Pastas que moram no bucket privado: o chat, as assinaturas e a assinatura das OS do SAC (`sac/<pasta>/assinatura_…`; as fotos do SAC seguem públicas). */
export function caminhoEhPrivado(caminho: string | null | undefined): boolean {
  if (!caminho) return false;
  if (caminho.startsWith('chat/') || caminho.startsWith('assinaturas/')) return true;
  return /^sac\/[^/]+\/assinatura_[^/]*$/.test(caminho);
}

export function valorParaGravar(caminho: string): string {
  return MARCA_PRIVADA + caminho;
}

/**
 * O caminho do arquivo no bucket privado para o valor guardado, ou null se o valor não é de arquivo privado (então vale como está).
 * `antigo` = veio do endereço público de antes: o arquivo pode ainda não ter sido copiado, e quem chama cai de volta no endereço velho se o privado não existir.
 */
export function caminhoDoValor(valor: string | null | undefined): { caminho: string; antigo: boolean } | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v) return null;
  if (v.startsWith(MARCA_PRIVADA)) {
    const caminho = v.slice(MARCA_PRIVADA.length);
    return caminho ? { caminho, antigo: false } : null;
  }
  const i = v.indexOf(TRECHO_PUBLICO);
  if (i < 0) return null;
  let caminho = v.slice(i + TRECHO_PUBLICO.length).split('?')[0].split('#')[0];
  try { caminho = decodeURIComponent(caminho); } catch { /* endereço torto: fica como veio */ }
  return caminhoEhPrivado(caminho) ? { caminho, antigo: true } : null;
}
