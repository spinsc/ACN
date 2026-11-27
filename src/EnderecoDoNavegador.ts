// A barra de endereço e o histórico do navegador (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fase 1, 25/11/2026).
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

// ── quem quer saber que o endereço mudou ──
// Fase 2 (25/11/2026): antes só o `useNavegacao` ouvia o endereço, e cada chamada de `aoMudarEndereco` instalava os seus próprios ouvintes do navegador
// sobre o MESMO `ultimoEndereco`: com dois ouvintes, o primeiro a ver o Voltar marcava o endereço como tratado e o segundo nunca era avisado. Agora os
// ouvintes do navegador são instalados uma vez só e cada mudança é repassada a TODOS os que se inscreveram. Duas origens:
//  - 'navegador': Voltar, Avançar ou endereço digitado (o navegador avisa);
//  - 'sistema': o próprio sistema escreveu o endereço (`irParaEndereco`): o pushState e o replaceState não avisam ninguém, então quem precisa
//    saber (a janela da OP, que fecha quando o endereço deixa de ser o dela, e o hospedeiro, que abre a OP de um endereço escrito por dentro) pede
//    `internas: true`. O `useNavegacao` não pede: ele mesmo já trocou a tela quando escreveu o endereço.
type Origem = 'navegador' | 'sistema';
type Ouvinte = { tratar: (hash: string, origem: Origem) => void; internas: boolean };
const ouvintes = new Set<Ouvinte>();
let ouvindoONavegador = false;

function repassar(hash: string, origem: Origem): void {
  for (const o of Array.from(ouvintes)) {            // cópia: um ouvinte pode se desinscrever (ou inscrever outro) enquanto é avisado
    if (origem === 'sistema' && !o.internas) continue;
    try { o.tratar(hash, origem); } catch (e) { console.error('[endereço] um ouvinte falhou:', e); }   // um ouvinte que falha não impede os outros
  }
}

function aoMudarPeloNavegador(): void {
  const hash = window.location.hash;
  if (hash === ultimoEndereco) return;
  ultimoEndereco = hash;
  repassar(hash, 'navegador');
}

function ligarOuvintesDoNavegador(): void {
  if (ouvindoONavegador) return;
  ouvindoONavegador = true;
  ultimoEndereco = window.location.hash;   // o primeiro ouvinte parte do endereço de agora (o que mudou antes dele ninguém precisa tratar)
  window.addEventListener('popstate', aoMudarPeloNavegador);
  window.addEventListener('hashchange', aoMudarPeloNavegador);
}

function desligarOuvintesDoNavegador(): void {
  if (!ouvindoONavegador) return;
  ouvindoONavegador = false;
  window.removeEventListener('popstate', aoMudarPeloNavegador);
  window.removeEventListener('hashchange', aoMudarPeloNavegador);
}

/**
 * Escreve o endereço. `substituir: false` (o padrão) cria um passo no histórico (Voltar volta para o endereço de antes); `substituir: true` só
 * troca o endereço do passo atual, sem criar passo (correção do endereço vazio, aviso de endereço desconhecido). Se o endereço já é este, não faz nada.
 * Avisa, ao terminar, os ouvintes que pediram as mudanças feitas pelo próprio sistema.
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
  repassar(hash, 'sistema');
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
 * Volta um passo no histórico (o botão Voltar do navegador). Só para um passo que o PRÓPRIO sistema criou (`temPassoAnterior`): o passo de antes está
 * dentro do sistema, e o Avançar reabre o que foi fechado. O navegador avisa a mudança por `popstate`, quando termina (não é na hora).
 */
export function voltarUmPasso(): void {
  if (typeof window === 'undefined') return;
  try { window.history.back(); } catch { /* sem histórico: o chamador já fechou a janela; só o endereço fica */ }
}

/**
 * Avisa quando o endereço muda: por fora do sistema (Voltar, Avançar ou a pessoa digitando outro endereço) e, com `internas: true`, também quando o
 * próprio sistema o escreve. Os dois eventos do navegador (`popstate` e `hashchange`) chegam juntos na maior parte dos casos; o endereço já tratado
 * não é tratado de novo. Qualquer número de ouvintes pode se inscrever ao mesmo tempo. Devolve a função que desliga.
 */
export function aoMudarEndereco(tratar: (hash: string, origem: Origem) => void, opcoes: { internas?: boolean } = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const ouvinte: Ouvinte = { tratar, internas: !!opcoes.internas };
  ouvintes.add(ouvinte);
  ligarOuvintesDoNavegador();
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0) desligarOuvintesDoNavegador();
  };
}
