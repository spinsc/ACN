// ─────────────────────────────────────────────────────────────────────────────
// PROTEÇÃO DO FUNDO DAS JANELAS — arrastar o mouse para fora não fecha a janela
//
// Quase toda janela do sistema fecha quando se clica no fundo escuro ao redor dela. Só que o navegador
// entrega o "clique" no elemento que contém o ponto onde o botão foi apertado E o ponto onde foi solto.
// Quem aperta o botão do mouse DENTRO de um campo e solta FORA da janelinha — o que acontece o tempo todo
// ao selecionar o texto de um campo arrastando o mouse, para depois colar outro por cima com Ctrl+V — gera
// um clique "no fundo", e a janela fecha antes da colagem. Relatado em 29/09/2026 no cadastro de cliente
// aberto pela criação de OP ("aperto Ctrl+V e a janela fecha"); reproduzido no navegador.
//
// Aqui o clique que nasce dentro da janela e termina no fundo é descartado, ANTES de chegar em qualquer
// tela. Vale para todas as janelas de uma vez, sem mexer em cada uma. Clique de verdade no fundo (apertar e
// soltar nele) continua fechando; clique em botão e em campo não muda nada, porque o alvo deles nunca é o
// fundo (elemento com posição fixa que contém o ponto onde o botão foi apertado).
// ─────────────────────────────────────────────────────────────────────────────

export function iniciarProtecaoDeFundo() {
  let origem: EventTarget | null = null;
  // no começo (captura) do aperto: guarda onde o botão do mouse foi apertado
  document.addEventListener('mousedown', (e) => { origem = e.target; }, true);
  // no começo (captura) do clique, antes de a tela (React) enxergar
  document.addEventListener('click', (e) => {
    const apertouEm = origem;
    origem = null;                       // um clique por aperto; teclado e clique programado não herdam
    const alvo = e.target as HTMLElement | null;
    if (!apertouEm || !alvo || apertouEm === alvo || !(apertouEm instanceof Node)) return;
    if (!alvo.contains || !alvo.contains(apertouEm)) return;
    // só o fundo da janela: elemento de posição fixa que cobre (quase) a tela toda e que não é botão nem
    // campo. Botão flutuante (chat, barra de ações) fica de fora: apertar no ícone e soltar na borda do
    // botão continua sendo um clique nele.
    if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(alvo.tagName)) return;
    if (window.getComputedStyle(alvo).position !== 'fixed') return;
    const r = alvo.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
