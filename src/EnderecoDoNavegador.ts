// A barra de endereço e o histórico do navegador (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 1, 25/11/2026).
//
// As regras de ler e montar o endereço são do `Rotas.ts` (puras). Aqui está só o que toca o navegador: escrever o endereço, guardar um passo no
// histórico (Voltar e Avançar), perceber que o endereço mudou e zerá-lo. Tudo com try/catch: um navegador que recuse o histórico não pode
// derrubar o sistema (a troca de tela segue pelo estado da tela, só o endereço deixa de acompanhar).

/**
 * Marca guardada nos passos que o PRÓPRIO sistema criou no histórico (`history.state`). O primeiro passo de quem abriu um link colado não a tem:
 * é assim que a janela de um registro (Fase 2) sabe se "fechar" pode voltar um passo ou se voltar jogaria a pessoa para fora do sistema.
 * Ela sobrevive ao F5, e o passo de antes também (o histórico da aba não se perde ao recarregar).
 */
const MARCA = { acn: 1 };

/** O último endereço que o sistema já tratou: serve para não tratar duas vezes o mesmo Voltar (o navegador avisa por dois eventos). */
let ultimoEndereco = typeof window !== 'undefined' ? window.location.hash : '';

/** O que está depois do `#` agora (com o `#`, ou texto vazio). */
export function enderecoAtual(): string {
  return typeof window !== 'undefined' ? window.location.hash : '';
}

/**
 * Escreve o endereço. `substituir: false` (o padrão) cria um passo no histórico (Voltar volta para o endereço de antes); `substituir: true` só
 * troca o endereço do passo atual, sem criar passo (correção do endereço vazio, aviso de endereço desconhecido). Se o endereço já é este, não faz nada.
 */
export function irParaEndereco(hash: string, opcoes: { substituir?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (hash === window.location.hash) { ultimoEndereco = hash; return; }
  const url = window.location.pathname + window.location.search + hash;
  try {
    if (opcoes.substituir) window.history.replaceState(window.history.state, '', url);   // mantém a marca do passo, se ele já tinha
    else window.history.pushState(MARCA, '', url);
  } catch {
    window.location.hash = hash;   // sem a API do histórico: trocar o `#` também vale (dispara o aviso de endereço mudou, que o sistema trata como "já está nesta tela")
  }
  ultimoEndereco = hash;
}

/** Tira o endereço da barra (sair do sistema): a próxima pessoa que entrar neste computador não pode parar na tela da anterior. */
export function zerarEndereco(): void {
  if (typeof window === 'undefined') return;
  try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sem histórico: fica como está */ }
  ultimoEndereco = '';
}

/** Este passo do histórico foi criado pelo sistema (há um passo anterior DENTRO dele)? Falso para quem abriu um link colado. */
export function temPassoAnterior(): boolean {
  if (typeof window === 'undefined') return false;
  const estado = window.history.state;
  return !!estado && estado.acn === 1;
}

/**
 * Avisa quando o endereço muda por fora do sistema: Voltar e Avançar, ou a pessoa digitando outro endereço. Os dois eventos do navegador
 * (`popstate` e `hashchange`) chegam juntos na maior parte dos casos; o endereço já tratado não é tratado de novo. Devolve a função que desliga.
 */
export function aoMudarEndereco(tratar: (hash: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const aoMudar = () => {
    const hash = window.location.hash;
    if (hash === ultimoEndereco) return;
    ultimoEndereco = hash;
    tratar(hash);
  };
  window.addEventListener('popstate', aoMudar);
  window.addEventListener('hashchange', aoMudar);
  return () => {
    window.removeEventListener('popstate', aoMudar);
    window.removeEventListener('hashchange', aoMudar);
  };
}
