// Hierarquia de cores do Guia visual, aplicada sem reescrever as telas.
//
// As telas pintam botões e etiquetas com cores próprias (style inline — mais de
// 200 cores diferentes). Aqui cada um é lido pela cor que a tela deu e ganha um
// papel do guia em data-acn-tom; o visual de cada papel fica em design.css.
//   botões:    primario · secundario · selecionado · perigo · perigo-sec · discreto
//   etiquetas: selo + data-acn-familia (ok · atencao · erro · info · neutro · marca)
// Nenhum clique, texto ou regra muda — só a cor. Para uma peça ficar com a cor
// original (ex.: amostra de cor), basta data-acn-cor-livre nela ou num pai.

type RGBA = { r: number; g: number; b: number; a: number };
type HSL = { h: number; s: number; l: number };

const cacheCor = new Map<string, RGBA | null>();
let sonda: HTMLElement | null = null;

function lerCor(valor: string | null | undefined): RGBA | null {
  if (!valor) return null;
  const v = valor.trim().toLowerCase();
  if (!v || v === 'none' || v === 'initial' || v === 'inherit' || v === 'unset' || v === 'currentcolor') return null;
  if (cacheCor.has(v)) return cacheCor.get(v)!;
  let m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  let cor: RGBA | null = null;
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    cor = { r: +m[1], g: +m[2], b: +m[3], a };
  } else if (v === 'transparent') {
    cor = { r: 0, g: 0, b: 0, a: 0 };
  } else {
    // nomes de cor e outros formatos: o navegador converte
    if (!sonda) { sonda = document.createElement('span'); sonda.style.display = 'none'; document.body.appendChild(sonda); }
    sonda.style.color = '';
    sonda.style.color = v;
    if (sonda.style.color) {
      m = getComputedStyle(sonda).color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
      if (m) cor = { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    }
  }
  cacheCor.set(v, cor);
  return cor;
}

function hsl({ r, g, b }: RGBA): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

// Cor do fundo que a tela deu (cor sólida ou a 1ª cor de um degradê)
function fundoInline(el: HTMLElement): RGBA | null {
  const st = el.style;
  const c = lerCor(st.backgroundColor);
  if (c && c.a > 0.05) return c;
  const img = st.backgroundImage;
  if (img && img.includes('gradient')) {
    const m = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i);
    if (m) return lerCor(m[0]);
  }
  return c; // transparente ou nada
}

const ehVermelho = (h: HSL) => h.s > 0.35 && (h.h < 14 || h.h >= 340) && h.l > 0.2 && h.l < 0.75;

export function familiaDaCor(c: RGBA): string {
  const h = hsl(c);
  if (h.s < 0.18 || (h.l > 0.9 && h.s < 0.35)) return 'neutro';
  if (h.h < 14 || h.h >= 340) return 'erro';
  if (h.h < 62) return 'atencao';
  if (h.h < 158) return 'ok';
  if (h.h < 186) return 'marca';
  if (h.h < 255) return 'info';
  if (h.h < 300) return 'marca';
  return 'erro';
}

function papelBotao(el: HTMLElement): string | null {
  const bg = fundoInline(el);
  const txt = lerCor(el.style.color);
  const temBorda = !!el.style.borderStyle && el.style.borderStyle !== 'none' && !!el.style.borderWidth && parseFloat(el.style.borderWidth) > 0;
  const txtH = txt ? hsl(txt) : null;
  // sem fundo próprio: botão "de texto"
  if (!bg || bg.a <= 0.05) {
    if (!el.style.background && !el.style.backgroundColor && !txt && !temBorda) return null; // a tela não pintou nada
    if (txtH && ehVermelho(txtH)) return temBorda ? 'perigo-sec' : 'discreto-perigo';
    if (temBorda) return 'secundario';
    return txtH && txtH.s > 0.35 && txtH.l < 0.7 ? 'link' : 'discreto';
  }
  const h = hsl(bg);
  if (h.l >= 0.86) {
    // fundo claro: branco/cinza = secundário; claro colorido com texto colorido = item selecionado
    if (txtH && ehVermelho(txtH)) return 'perigo-sec';
    if (h.s >= 0.3 && h.l < 0.975) return 'selecionado';
    return 'secundario';
  }
  if (h.s < 0.2 && h.l > 0.33) return 'secundario'; // cinza médio (costuma ser "desligado")
  if (ehVermelho(h)) return 'perigo';
  return 'primario';
}

function papelSelo(el: HTMLElement): string | null {
  const st = el.style;
  const bg = fundoInline(el);
  if (el.classList.contains('acn-badge')) return bg && bg.a > 0.05 ? familiaDaCor(bg) : 'neutro';
  if (!bg || bg.a <= 0.05) return null;
  const txt = (el.textContent || '').trim();
  if (!txt || txt.length > 42) return null;
  if (el.querySelector('div, table, input, select, textarea, button, img')) return null;
  const raio = parseFloat(st.borderRadius || '0');
  const h = hsl(bg);
  // etiqueta = cantos arredondados, letra pequena ou caixa alta, texto curto
  const pequena = parseFloat(st.fontSize || '99') <= 12 || st.textTransform === 'uppercase' || raio >= 8;
  if (!pequena || (raio < 2 && !st.padding)) return null;
  if (h.l > 0.975 && h.s < 0.3) return null; // branco: não é etiqueta de cor
  return familiaDaCor(bg);
}

const FORA = '.acn-main-tv, .acn-sidebar, .acn-header, .acn-dialogo, .acn-avisos, [data-acn-cor-livre], svg';

function marcarBotao(el: HTMLElement) {
  if (el.closest(FORA)) return;
  // amostras de cor e botões sem texto com fundo pintado ficam como estão
  if (!(el.textContent || '').trim() && !el.querySelector('svg, img')) { el.removeAttribute('data-acn-tom'); return; }
  const antes = el.getAttribute('data-acn-tom');
  // ao passar o mouse a tela troca a cor: mantém o papel já dado
  if (antes && el.matches(':hover')) return;
  const p = papelBotao(el);
  const borda = !!el.style.borderStyle && el.style.borderStyle !== 'none' && parseFloat(el.style.borderWidth || '0') > 0;
  if (borda) { if (!el.hasAttribute('data-acn-borda')) el.setAttribute('data-acn-borda', ''); }
  else if (el.hasAttribute('data-acn-borda')) el.removeAttribute('data-acn-borda');
  if (p) { if (antes !== p) el.setAttribute('data-acn-tom', p); el.setAttribute('data-acn-tom-original', p); }
  else if (antes) { el.removeAttribute('data-acn-tom'); el.removeAttribute('data-acn-tom-original'); }
}

const BOTAO = 'button[style], label[style*="cursor: pointer"]';
const ehBotao = (c: Element) => c.tagName === 'BUTTON' || (c.tagName === 'LABEL' && (c as HTMLElement).style.cursor === 'pointer');

// Barras de abas desenhadas pela tela: vira aba sublinhada (caixa com borda grossa e
// botões esticados) ou seletor em pílulas (fundo cinza claro com botões dentro).
function marcarAbas(pai: Element) {
  const el = pai as HTMLElement;
  if (!el.style || el.closest(FORA)) return;
  const filhos = Array.from(el.children);
  const todosBotoes = filhos.length >= 2 && filhos.every(c => c.tagName === 'BUTTON');
  let tipo: string | null = null;
  if (todosBotoes && el.style.display === 'flex') {
    const borda = parseFloat(el.style.borderTopWidth || el.style.borderWidth || '0');
    const bg = fundoInline(el);
    if (borda >= 1.5 && el.style.borderStyle === 'solid' && filhos.some(c => parseFloat((c as HTMLElement).style.flexGrow || '0') >= 1)) tipo = 'abas';
    else if (bg && bg.a > 0.05) { const h = hsl(bg); if (h.l > 0.9 && (h.s < 0.35 || (h.l > 0.94 && h.s < 0.55))) tipo = 'chips'; }
  }
  if ((el.getAttribute('data-acn-grupo') || null) !== tipo) {
    if (tipo) el.setAttribute('data-acn-grupo', tipo); else el.removeAttribute('data-acn-grupo');
  }
  if (!tipo) return;
  for (const c of filhos) {
    const orig = c.getAttribute('data-acn-tom-original');
    const ativa = orig === 'primario' || orig === 'selecionado' || orig === 'perigo';
    if (c.hasAttribute('data-acn-ativa') !== ativa) { if (ativa) c.setAttribute('data-acn-ativa', ''); else c.removeAttribute('data-acn-ativa'); }
  }
}

// Cabeçalho de quadro pintado (.sec-hdr com fundo forte): fica branco, com a cor num ponto
function marcarCabecalho(el: HTMLElement) {
  if (el.closest(FORA)) return;
  const bg = fundoInline(el);
  let forte = false;
  if (bg && bg.a > 0.05) { const h = hsl(bg); forte = h.l < 0.8 && h.s > 0.12; }
  if (forte) {
    const cor = `rgb(${bg!.r}, ${bg!.g}, ${bg!.b})`;
    if (!el.hasAttribute('data-acn-cab')) el.setAttribute('data-acn-cab', '');
    if (el.style.getPropertyValue('--acn-cab-cor') !== cor) el.style.setProperty('--acn-cab-cor', cor);
  } else if (el.hasAttribute('data-acn-cab')) el.removeAttribute('data-acn-cab');
}

// Uma ação principal por grupo: se vários botões lado a lado ficaram "principal",
// o último (à direita) continua principal e os outros viram secundários.
function ajustarGrupo(pai: Element) {
  const principais = Array.from(pai.children).filter(c =>
    ehBotao(c) && c.getAttribute('data-acn-tom-original') === 'primario') as HTMLElement[];
  principais.forEach((b, i) => {
    const alvo = i === principais.length - 1 ? 'primario' : 'secundario';
    if (b.getAttribute('data-acn-tom') !== alvo) b.setAttribute('data-acn-tom', alvo);
  });
}

function marcarSelo(el: HTMLElement) {
  if (el.closest(FORA) || el.closest('button')) return;
  const f = papelSelo(el);
  if (f) {
    if (el.getAttribute('data-acn-familia') !== f) el.setAttribute('data-acn-familia', f);
    if (el.getAttribute('data-acn-tom') !== 'selo') el.setAttribute('data-acn-tom', 'selo');
  } else if (el.getAttribute('data-acn-tom') === 'selo') {
    el.removeAttribute('data-acn-tom'); el.removeAttribute('data-acn-familia');
  }
}

// "Carregando..." em texto vira o esqueleto do conteúdo (visual em design.css)
const RE_CARREGANDO = /^[\s⏳⌛]*carregando(\s|\.|…|$)[^]{0,40}$/i;
function marcarCarregando(raiz: Element) {
  const alvos: Element[] = [];
  if (raiz.tagName === 'DIV' || raiz.tagName === 'TD' || raiz.tagName === 'P') alvos.push(raiz);
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const v = n.nodeValue || '';
    if (v.length < 60 && /carregando/i.test(v) && n.parentElement) alvos.push(n.parentElement);
  }
  for (const el of alvos) {
    if (!/^(DIV|TD|P)$/.test(el.tagName) || el.closest(FORA)) continue;
    const eh = el.childElementCount === 0 && RE_CARREGANDO.test(el.textContent || '');
    if (eh && !el.hasAttribute('data-acn-carregando')) { el.setAttribute('data-acn-carregando', ''); el.setAttribute('aria-busy', 'true'); }
    else if (!eh && el.hasAttribute('data-acn-carregando')) { el.removeAttribute('data-acn-carregando'); el.removeAttribute('aria-busy'); }
  }
}

const pendentes = new Set<Element>();
let agendado = false;

function processar() {
  agendado = false;
  const pais = new Set<Element>();
  for (const raiz of pendentes) {
    if (!raiz.isConnected) continue;
    const botoes = raiz.matches(BOTAO) ? [raiz] : [];
    botoes.push(...Array.from(raiz.querySelectorAll(BOTAO)));
    for (const b of botoes) { marcarBotao(b as HTMLElement); if (b.parentElement) pais.add(b.parentElement); }
    const selos = raiz.matches('span[style]') ? [raiz] : [];
    selos.push(...Array.from(raiz.querySelectorAll('span[style]')));
    for (const s of selos) marcarSelo(s as HTMLElement);
    const cabs = raiz.matches('.sec-hdr[style]') ? [raiz] : [];
    cabs.push(...Array.from(raiz.querySelectorAll('.sec-hdr[style]')));
    for (const c of cabs) marcarCabecalho(c as HTMLElement);
    marcarCarregando(raiz);
  }
  pendentes.clear();
  pais.forEach(p => { ajustarGrupo(p); marcarAbas(p); });
}

function agendar(el: Element) {
  pendentes.add(el);
  if (!agendado) { agendado = true; queueMicrotask(processar); }
}

export function iniciarTonsVisuais() {
  if (typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver(lista => {
    for (const m of lista) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => { if (n.nodeType === 1) agendar(n as Element); });
        // texto de uma etiqueta mudou (ex.: status novo)
        if (m.target.nodeType === 1 && ((m.target as Element).tagName === 'SPAN' || (m.target as Element).hasAttribute('data-acn-carregando'))) agendar(m.target as Element);
      } else if (m.type === 'attributes') {
        const el = m.target as Element;
        if (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'LABEL') agendar(el);
        else if ((el as HTMLElement).classList.contains('sec-hdr')) agendar(el);
      } else if (m.type === 'characterData') {
        const p = m.target.parentElement;
        if (p && (p.tagName === 'SPAN' || p.hasAttribute('data-acn-carregando') || /carregando/i.test(m.target.nodeValue || ''))) agendar(p);
      }
    }
  });
  const ligar = () => {
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'], characterData: true });
    agendar(document.body);
  };
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
}
