// ─────────────────────────────────────────────────────────────────────────────
// GUARDA DE CONTRASTE DO MODO ESCURO
//
// As telas pintam fundos e letras com cores próprias (style inline) pensadas
// para o fundo claro. No modo escuro isso gera fundo claro com letra clara, ou
// letra escura sobre fundo escuro. Em vez de caçar cor por cor, aqui cada peça
// é MEDIDA como o navegador realmente a desenha:
//   1. fundo claro que sobrou no escuro → vira a mesma cor em versão escura
//      (mantém o tom: amarelo continua amarelado, vermelho avermelhado);
//   2. texto com contraste abaixo de 4,5:1 (3:1 para letra grande) contra o
//      fundo real → a letra ganha a mesma cor mais clara/escura até ficar legível.
// Só age com body.dark; ao voltar para o claro, tudo é desfeito.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const FORA = 'img, svg, canvas, video, [data-acn-cor-livre]';
// o Painel TV tem fundos de propósito (cores das colunas): só a letra é corrigida lá
const FORA_FUNDO = '.acn-main-tv, ' + FORA;

function lerRGBA(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
  return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
}
function luminancia([r, g, b]: RGB) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contraste = (a: RGB, b: RGB) => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
function paraHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function deHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const css = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// Fundo que o elemento realmente mostra (compondo as camadas semitransparentes)
function fundoReal(el: Element | null, cache: Map<Element, RGB>): RGB {
  const camadas: [number, number, number, number][] = [];
  let x: Element | null = el;
  let base: RGB = [15, 23, 42];
  while (x) {
    const salvo = cache.get(x);
    if (salvo) { base = salvo; break; }
    const cs = getComputedStyle(x);
    const c = lerRGBA(cs.backgroundColor);
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
      const g = lerRGBA(cs.backgroundImage);
      if (g) { camadas.push(g); if (g[3] >= 0.95) break; }
    }
    if (c && c[3] > 0) { camadas.push(c); if (c[3] >= 0.95) break; }
    x = x.parentElement;
  }
  let res: RGB = base;
  for (let i = camadas.length - 1; i >= 0; i--) {
    const [r, g, b, a] = camadas[i];
    res = [r * a + res[0] * (1 - a), g * a + res[1] * (1 - a), b * a + res[2] * (1 - a)];
  }
  if (el) cache.set(el, res);
  return res;
}

// 1) Fundo claro no escuro → versão escura do mesmo tom
function escurecerFundo(el: HTMLElement) {
  if (el.closest(FORA_FUNDO)) return;
  const cs = getComputedStyle(el);
  const c = lerRGBA(cs.backgroundColor);
  if (!c || c[3] < 0.6) return;
  const rgb: RGB = [c[0], c[1], c[2]];
  if (luminancia(rgb) < 0.45) return;
  const r = el.getBoundingClientRect();
  // pontinhos, amostras de cor e barras finas mantêm a cor (é informação, não fundo)
  if (r.width < 22 || r.height < 12) return;
  if (!el.textContent?.trim() && !el.querySelector('input, select, textarea, button')) {
    if (r.height < 14) return;
  }
  const [h, s] = paraHsl(rgb);
  const escuro = s < 0.12 ? deHsl(217, 0.33, 0.17) : deHsl(h, Math.min(0.55, s * 0.6), 0.2);
  el.setAttribute('data-acn-escuro-fundo', '');
  el.style.setProperty('--acn-escuro-fundo', css(escuro));
}

// 2) Texto sem contraste → mesma cor, clareada (ou escurecida) até ficar legível
function corrigirTexto(el: HTMLElement, cache: Map<Element, RGB>) {
  if (el.closest(FORA)) return;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) return;
  const cor = lerRGBA(cs.color);
  if (!cor || cor[3] < 0.15) return; // texto transparente de propósito (espaçadores)
  const fundo = fundoReal(el, cache);
  const fg: RGB = [cor[0] * cor[3] + fundo[0] * (1 - cor[3]), cor[1] * cor[3] + fundo[1] * (1 - cor[3]), cor[2] * cor[3] + fundo[2] * (1 - cor[3])];
  const grande = parseFloat(cs.fontSize) >= 18 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
  const minimo = grande ? 3 : 4.5;
  if (contraste(fg, fundo) >= minimo) return;
  const [h, s, l] = paraHsl(fg);
  const fundoEscuro = luminancia(fundo) < 0.2;
  let novo: RGB | null = null;
  // procura a luminosidade mais próxima da original que passa no contraste (+ folga)
  for (let passo = 1; passo <= 20; passo++) {
    const nl = fundoEscuro ? Math.min(0.97, l + passo * 0.04) : Math.max(0.05, l - passo * 0.04);
    const cand = deHsl(h, Math.min(s, 0.85), nl);
    if (contraste(cand, fundo) >= minimo + 0.4) { novo = cand; break; }
  }
  if (!novo) novo = fundoEscuro ? [241, 245, 249] : [15, 23, 42];
  el.setAttribute('data-acn-escuro-texto', '');
  el.style.setProperty('--acn-escuro-texto', css(novo));
}

function limparTudo() {
  document.querySelectorAll('[data-acn-escuro-fundo]').forEach(el => {
    el.removeAttribute('data-acn-escuro-fundo'); (el as HTMLElement).style.removeProperty('--acn-escuro-fundo');
  });
  document.querySelectorAll('[data-acn-escuro-texto]').forEach(el => {
    el.removeAttribute('data-acn-escuro-texto'); (el as HTMLElement).style.removeProperty('--acn-escuro-texto');
  });
}

const pendentes = new Set<Element>();
let agendado = 0;
const ligado = () => document.body.classList.contains('dark');

function processar() {
  agendado = 0;
  if (!ligado()) { pendentes.clear(); return; }
  const raizes = [...pendentes].filter(r => r.isConnected);
  pendentes.clear();
  // fundos primeiro (o texto é medido já sobre o fundo corrigido)
  for (const raiz of raizes) {
    if (raiz.nodeType !== 1) continue;
    const els = [raiz as HTMLElement, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))];
    for (const el of els) {
      if (el.hasAttribute('data-acn-escuro-fundo')) {
        // a tela pode ter trocado a cor: reavalia do zero
        el.removeAttribute('data-acn-escuro-fundo'); el.style.removeProperty('--acn-escuro-fundo');
      }
      escurecerFundo(el);
    }
  }
  const cache = new Map<Element, RGB>();
  for (const raiz of raizes) {
    if (raiz.nodeType !== 1) continue;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const vistos = new Set<Element>();
    let n: Node | null;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || vistos.has(el) || !n.nodeValue?.trim()) continue;
      vistos.add(el);
      if (el.hasAttribute('data-acn-escuro-texto')) { el.removeAttribute('data-acn-escuro-texto'); el.style.removeProperty('--acn-escuro-texto'); }
      corrigirTexto(el, cache);
    }
    // campos de formulário: o texto digitado não é nó de texto
    raiz.querySelectorAll<HTMLElement>('input, select, textarea').forEach(el => {
      if (el.hasAttribute('data-acn-escuro-texto')) { el.removeAttribute('data-acn-escuro-texto'); el.style.removeProperty('--acn-escuro-texto'); }
      corrigirTexto(el, cache);
    });
  }
}

function agendar(el: Element) {
  pendentes.add(el);
  if (!agendado) agendado = window.setTimeout(processar, 60);
}

export function iniciarContrasteEscuro() {
  if (typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver(lista => {
    if (!ligado()) return;
    for (const m of lista) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) agendar(n as Element); else if (n.parentElement) agendar(n.parentElement); });
      } else if (m.type === 'attributes') {
        const el = m.target as HTMLElement;
        // mudanças nossas (variáveis --acn-escuro-*) não disparam nova rodada
        if (m.attributeName === 'style' && /--acn-escuro-/.test(el.getAttribute('style') || '') && m.oldValue &&
            (m.oldValue.replace(/--acn-escuro-[^;]+;?/g, '').trim() === (el.getAttribute('style') || '').replace(/--acn-escuro-[^;]+;?/g, '').trim())) continue;
        agendar(el.parentElement || el);
      } else if (m.type === 'characterData' && m.target.parentElement) {
        agendar(m.target.parentElement);
      }
    }
  });
  const ligar = () => {
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'data-acn-tom', 'data-acn-ativa', 'data-acn-cab', 'data-acn-numero', 'disabled'], attributeOldValue: true, characterData: true });
    // liga/desliga junto com o tema
    new MutationObserver(() => {
      if (ligado()) agendar(document.body); else limparTudo();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (ligado()) agendar(document.body);
  };
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
}
