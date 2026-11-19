// Plano de ajustes de layout, L4 (19/11/2026, decidido com o usuário: "coluna Ações fixa à direita"):
// em tablet e janela pela metade as tabelas largas rolam para o lado e a coluna "Ações" ficava fora da vista até a pessoa arrastar,
// sem nenhuma pista. Em vez de mexer em cada tabela (são dezenas, em telas grandes), uma peça só marca a coluna cujo cabeçalho é
// "Ações" com a classe `acn-col-fixa`; o CSS (design.css) a prende à direita. Tabela que não rola não muda em nada.
const CABECALHOS = /^(ações|ação|acoes|acao)$/i;
const MARCA = 'acn-col-fixa';

/** Marca, numa tabela, o cabeçalho "Ações" e a célula da mesma coluna em cada linha (só quando a linha tem uma célula por coluna: linha
 *  com colspan, de detalhe ou de total, não entra e não desalinha). */
export function marcarColunaDeAcoes(tabela: HTMLTableElement): void {
  const cab = tabela.tHead?.rows[0];
  if (!cab) return;
  const colunas = cab.cells.length;
  let indice = -1;
  for (let i = 0; i < colunas; i++) {
    if (CABECALHOS.test((cab.cells[i].textContent || '').trim())) { indice = i; break; }
  }
  if (indice < 0) return;
  cab.cells[indice].classList.add(MARCA);
  for (const corpo of Array.from(tabela.tBodies)) {
    for (const linha of Array.from(corpo.rows)) {
      if (linha.cells.length !== colunas) continue;
      const celula = linha.cells[indice];
      if (!celula.classList.contains(MARCA)) celula.classList.add(MARCA);
    }
  }
}

/** Liga a marcação a toda tabela da página, agora e sempre que a tela mudar. Devolve a função que desliga. */
export function ligarColunaDeAcoesFixa(raiz: HTMLElement = document.body): () => void {
  const pendentes = new Set<HTMLTableElement>();
  let agendado = 0;
  const processar = () => {
    agendado = 0;
    pendentes.forEach(t => { try { marcarColunaDeAcoes(t); } catch { /* tabela estranha: fica como está */ } });
    pendentes.clear();
  };
  const agendar = (tabela: HTMLTableElement | null) => {
    if (!tabela) return;
    pendentes.add(tabela);
    if (!agendado) agendado = window.requestAnimationFrame(processar);
  };
  const tabelasDe = (no: Node) => {
    if (no.nodeType !== 1) { agendar((no.parentElement as HTMLElement | null)?.closest('table') || null); return; }
    const el = no as HTMLElement;
    if (el.tagName === 'TABLE') agendar(el as HTMLTableElement);
    else {
      agendar(el.closest('table'));
      el.querySelectorAll('table').forEach(t => agendar(t as HTMLTableElement));
    }
  };
  const observador = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(tabelasDe);
      else tabelasDe(m.target);
    }
  });
  observador.observe(raiz, { childList: true, subtree: true });
  raiz.querySelectorAll('table').forEach(t => agendar(t as HTMLTableElement));
  return () => { observador.disconnect(); if (agendado) window.cancelAnimationFrame(agendado); };
}
