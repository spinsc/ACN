// Tabelas no CELULAR (toque + tela até 639px): listas viram cartões
// "Rótulo: valor"; planilhas (muitos campos editáveis) rolam para o lado com a
// 1ª coluna fixa. O visual fica em responsivo.css (.acn-tab-cartoes /
// .acn-tab-planilha); aqui só se marca cada tabela e se copia o texto do
// cabeçalho para data-rotulo de cada célula.
//
// No computador isto não faz nada: sem aparelho de toque o observador nem liga.
// Não reescreve as tabelas das telas — funciona em todas, inclusive as novas.

const CELULAR = '(hover: none) and (pointer: coarse) and (max-width: 639.98px)';

function textoCabecalho(th: Element): string {
  return (th.textContent || '').replace(/\s+/g, ' ').trim();
}

function rotulosDaTabela(tabela: HTMLTableElement): string[] | null {
  const linhaCab = tabela.tHead?.rows[tabela.tHead.rows.length - 1];
  if (!linhaCab) return null;
  const rotulos: string[] = [];
  for (const th of Array.from(linhaCab.cells)) {
    const n = Math.max(1, th.colSpan || 1);
    for (let i = 0; i < n; i++) rotulos.push(textoCabecalho(th));
  }
  return rotulos;
}

function ehPlanilha(tabela: HTMLTableElement): boolean {
  const corpo = tabela.tBodies[0];
  if (!corpo) return false;
  let celulas = 0, comCampo = 0;
  for (const tr of Array.from(corpo.rows).slice(0, 20)) {
    for (const td of Array.from(tr.cells)) {
      celulas++;
      if (td.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea')) comCampo++;
    }
  }
  return celulas > 0 && comCampo / celulas > 0.3;
}

function marcarTabela(tabela: HTMLTableElement) {
  if (tabela.closest('.acn-main-tv')) return;
  const rotulos = rotulosDaTabela(tabela);
  // sem cabeçalho (tabelas "campo: valor") ou só 1-2 colunas: já cabem, ficam como estão
  if (!rotulos || rotulos.length < 3) return;
  if (ehPlanilha(tabela)) {
    tabela.classList.add('acn-tab-planilha');
    tabela.classList.remove('acn-tab-cartoes');
    return;
  }
  tabela.classList.add('acn-tab-cartoes');
  tabela.classList.remove('acn-tab-planilha');
  for (const corpo of Array.from(tabela.tBodies)) {
    for (const tr of Array.from(corpo.rows)) {
      let col = 0;
      const cells = Array.from(tr.cells);
      // linha de uma célula só ocupando a tabela toda (vazio, "carregando", grupo)
      if (cells.length === 1 && (cells[0].colSpan || 1) > 1) {
        tr.classList.add('acn-linha-inteira');
        continue;
      }
      for (const td of cells) {
        const r = rotulos[col] || '';
        if (td.getAttribute('data-rotulo') !== r) td.setAttribute('data-rotulo', r);
        const soAcoes = !!td.querySelector('button') && !(td.textContent || '').replace(/[\s​]/g, '').replace(/[^\p{L}\p{N}]/gu, '').length;
        td.classList.toggle('acn-cel-acoes', /^a[cç][oõ]es$/i.test(r) || (soAcoes && !r));
        col += Math.max(1, td.colSpan || 1);
      }
    }
  }
}

let agendado = 0;
function varrer() {
  agendado = 0;
  document.querySelectorAll('table').forEach(t => marcarTabela(t as HTMLTableElement));
}
function agendar() {
  if (!agendado) agendado = requestAnimationFrame(varrer);
}

function desmarcarTudo() {
  document.querySelectorAll('table.acn-tab-cartoes, table.acn-tab-planilha').forEach(t => {
    t.classList.remove('acn-tab-cartoes', 'acn-tab-planilha');
  });
}

export function iniciarTabelasResponsivas() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia(CELULAR);
  let obs: MutationObserver | null = null;
  const aplicar = () => {
    if (mq.matches && !obs) {
      obs = new MutationObserver(agendar);
      obs.observe(document.body, { childList: true, subtree: true });
      agendar();
    } else if (!mq.matches && obs) {
      obs.disconnect(); obs = null;
      desmarcarTudo();
    }
  };
  aplicar();
  mq.addEventListener?.('change', aplicar);
}
