// ─────────────────────────────────────────────────────────────────────────────
// AVISO DE "O SISTEMA FOI ATUALIZADO" — 08/10/2026
//
// Cada publicação renomeia os arquivos do site (o nome leva um código). Quem deixou a aba aberta de antes da publicação continua com a tela antiga, que ainda aponta para
// arquivos que não existem mais: na primeira tela ou função que precisa de um deles (ex.: emitir o PDF de comissões) aparecia "Failed to fetch dynamically imported module".
// Publicamos várias vezes por dia, então isso acontecia o tempo todo. Agora o sistema reconhece esse erro e explica em português, oferecendo atualizar a página.
// Não recarrega sozinho: a pessoa pode estar no meio de um formulário e perderia o que digitou.
// ─────────────────────────────────────────────────────────────────────────────
import { confirmar } from './Feedback';

let perguntando = false;
const ehFalhaDeArquivoNovo = (m: any) =>
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|error loading dynamically imported module/i.test(String(m || ''));

async function oferecerAtualizar() {
  if (perguntando) return;
  perguntando = true;
  try {
    const sim = await confirmar('O sistema foi atualizado enquanto esta página estava aberta, e por isso esta função não carregou.\n\nAtualizar a página agora? O que ainda não foi salvo nesta tela será perdido. Se preferir, cancele, salve o que está fazendo e atualize depois (Ctrl+F5).');
    if (sim) window.location.reload();
  } finally { perguntando = false; }
}

export function iniciarAvisoDeVersaoNova() {
  // o Vite dispara este evento quando um arquivo carregado sob demanda (import dinâmico) falha
  window.addEventListener('vite:preloadError', () => { oferecerAtualizar(); });
  // e a falha também chega como erro solto quando o import dinâmico é feito direto (ex.: await import('jspdf'))
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (ehFalhaDeArquivoNovo((e.reason && e.reason.message) || e.reason)) oferecerAtualizar();
  });
}

/** Para quem já captura o erro (try/catch) e mostra a própria mensagem: reconhece a falha de arquivo novo e oferece atualizar. Devolve true se era esse erro. */
export function tratarFalhaDeArquivoNovo(erro: any): boolean {
  if (!ehFalhaDeArquivoNovo(erro?.message || erro)) return false;
  oferecerAtualizar();
  return true;
}
