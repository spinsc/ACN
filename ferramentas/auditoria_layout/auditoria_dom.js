// Auditoria de layout (16/11/2026): roda DENTRO da página. Devolve a lista de problemas visuais da tela aberta: página que rola para o lado, caixa que vaza do contêiner,
// texto cortado, coisa em cima de coisa, controle coberto por outro, janela maior que a tela, alvo de toque pequeno e letra miúda.
// Janelas abertas: a película/janela padrão (.modal-overlay, [role=dialog]) e qualquer camada fixa que cubra quase a tela inteira e tenha conteúdo
// (a "Nova Demanda Avulsa" e outras janelas antigas não usam .modal-box).
window.__janelasAbertas = function () {
  const vw = innerWidth, vh = innerHeight, out = [];
  const vis = (el) => { const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  document.querySelectorAll('.modal-overlay, [role=dialog], body div, body aside, body section').forEach(el => {
    if (el.closest('.acn-sidebar') || !vis(el)) return;
    const c = getComputedStyle(el);
    const padrao = el.matches('.modal-overlay, [role=dialog]');
    if (!padrao) {
      if (c.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.85 || r.height < vh * 0.85) return;
      if (!el.querySelector('input, button, textarea, select') && (el.innerText || '').trim().length < 3) return;
    }
    // só a mais externa de cada pilha
    if (out.some(o => o.contains(el))) return;
    for (let i = out.length - 1; i >= 0; i--) if (el.contains(out[i])) out.splice(i, 1);
    out.push(el);
  });
  return out;
};
// a "caixa" da janela: o .modal-box, ou o filho que não ocupa a tela inteira (a janela dentro da película)
window.__caixaDaJanela = function (raiz) {
  const mb = raiz.matches('.modal-box') ? raiz : raiz.querySelector('.modal-box');
  if (mb) return mb;
  const vw = innerWidth, vh = innerHeight;
  const filho = [...raiz.querySelectorAll(':scope > *')].find(f => { const r = f.getBoundingClientRect(); return r.width > 40 && r.height > 40 && (r.width < vw * 0.99 || r.height < vh * 0.99); });
  return filho || raiz;
};
window.__auditar = function (opts) {
  opts = opts || {};
  const vw = window.innerWidth, vh = window.innerHeight;
  const INTERATIVO = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=menuitem], [role=option], summary';
  const issues = [];
  const marcados = [];
  const cache = new Map();
  const cs = (el) => { let c = cache.get(el); if (!c) { c = getComputedStyle(el); cache.set(el, c); } return c; };
  const seletor = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3); if (c.length) s += '.' + c.join('.'); return s; };
  const caminho = (el) => { const p = []; let e = el; for (let i = 0; i < 3 && e && e !== document.body; i++) { p.unshift(seletor(e)); e = e.parentElement; } return p.join(' > '); };
  const proprio = (el) => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue; return t.replace(/\s+/g, ' ').trim(); };
  const rotulo = (el) => (proprio(el) || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.value && String(el.value)) || el.innerText || '').toString().replace(/\s+/g, ' ').slice(0, 50);
  // incluirMenu = auditar SÓ a gaveta do menu (o resto da página fica de fora: ela passa por cima do conteúdo e geraria falsos achados)
  const emMenu = (el) => !!el.closest('.acn-sidebar, .sidebar, aside.sidebar, nav.sidebar-nav');
  const fixoCache = new Map();
  const raizFixa = (el) => { // o ancestral (ou o próprio) com position: fixed — widget flutuante, janela ou barra
    if (fixoCache.has(el)) return fixoCache.get(el);
    let r = null;
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { if (cs(p).position === 'fixed') { r = p; break; } }
    fixoCache.set(el, r); return r;
  };
  const visivel = (el) => { const c = cs(el); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  const efetivo = (el) => {
    const r = el.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const c = cs(p);
      if (c.overflowX !== 'visible' || c.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        if (c.overflowX !== 'visible') { L = Math.max(L, pr.left); R = Math.min(R, pr.right); }
        if (c.overflowY !== 'visible') { T = Math.max(T, pr.top); B = Math.min(B, pr.bottom); }
      }
    }
    return { L, T, R, B, w: R - L, h: B - T, r };
  };
  const marca = (el) => { try { el.setAttribute('data-aud', '1'); marcados.push(el); } catch (e) {} };
  const add = (t, sev, desc, el, extra) => {
    issues.push(Object.assign({ t, sev, desc, el: caminho(el), txt: rotulo(el) }, extra || {}));
    if (sev === 'alta') marca(el);
  };

  // com uma janela aberta só ela é auditada: o que está atrás da película fica coberto de propósito e geraria falso "em cima de"
  const janelasAbertas = window.__janelasAbertas();
  const janelaRaiz = janelasAbertas.length ? janelasAbertas[janelasAbertas.length - 1] : null;
  const todos = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let n = 0;
  while (walker.nextNode() && n < 9000) {
    const el = walker.currentNode; n++;
    if (/^(SCRIPT|STYLE|NOSCRIPT|PATH|G|CIRCLE|RECT|LINE|POLYLINE|DEFS|USE|TEXT|TSPAN)$/i.test(el.tagName)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.hasAttribute('data-aud-ignorar')) continue;
    if (!visivel(el)) continue;
    if (opts.incluirMenu ? !emMenu(el) : emMenu(el)) continue;
    if (janelaRaiz && !opts.incluirMenu && !janelaRaiz.contains(el)) continue;
    todos.push(el);
  }
  const ehInterativo = (el) => el.matches(INTERATIVO);
  const alvos = todos.filter(el => ehInterativo(el) || proprio(el).length >= 2 || /^(IMG|SVG|CANVAS|TABLE|VIDEO)$/i.test(el.tagName));

  // A) a página inteira rola para o lado?
  const doc = document.documentElement;
  const larguraDoc = Math.max(doc.scrollWidth, document.body.scrollWidth);
  const paginaRola = larguraDoc > vw + 1;
  const culpados = [];
  const pularFixo = (el) => !!raizFixa(el) && !opts.incluirFixos && !opts.incluirMenu;
  for (const el of alvos) {
    if (pularFixo(el)) continue;
    const e = efetivo(el);
    if (e.w > 0 && e.R > vw + 1) culpados.push({ el, sobra: Math.round(e.R - vw) });
  }
  culpados.sort((a, b) => b.sobra - a.sobra);
  if (paginaRola) {
    issues.push({ t: 'pagina-rola-para-o-lado', sev: 'alta', desc: `A página tem ${larguraDoc}px de largura numa tela de ${vw}px (sobra ${larguraDoc - vw}px).`, el: 'document', txt: '' });
    culpados.slice(0, 6).forEach(c => add('culpado-da-largura', 'alta', `Passa ${c.sobra}px da borda direita da tela.`, c.el, { sobra: c.sobra }));
  } else {
    // sem rolagem de página, mas algo fica fora da tela (cortado pelo body/overflow-x do app)
    culpados.filter(c => c.sobra > 4).slice(0, 6).forEach(c => add('fora-da-tela', 'alta', `Fica ${c.sobra}px além da borda direita da tela (não rola, fica cortado).`, c.el, { sobra: c.sobra }));
  }
  // à esquerda
  for (const el of alvos) {
    if (pularFixo(el)) continue;
    const e = efetivo(el);
    if (e.w > 4 && e.L < -4) { add('fora-da-tela-esquerda', 'alta', `Fica ${Math.round(-e.L)}px além da borda esquerda da tela.`, el); if (issues.filter(i => i.t === 'fora-da-tela-esquerda').length >= 6) break; }
  }

  // A2) a ÁREA DE CONTEÚDO rola para o lado? O corpo da página é travado (overflow hidden), então o "estouro" de verdade acontece dentro do .acn-main:
  //     quem manda mais que a largura da área faz a tela inteira rolar para o lado, com os botões da direita escondidos.
  if (!opts.incluirMenu && !janelaRaiz) {
    const main = document.querySelector('.acn-main');
    if (main) {
      const sw = main.scrollWidth, cw = main.clientWidth;
      if (sw > cw + 4) {
        const mr = main.getBoundingClientRect().right;
        const cul = [];
        for (const el of alvos) {
          if (pularFixo(el) || !main.contains(el)) continue;
          let cortado = false;
          for (let p = el.parentElement; p && p !== main; p = p.parentElement) { const c = cs(p); if (c.overflowX !== 'visible') { cortado = true; break; } }
          if (cortado) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > mr + 2) cul.push({ el, sobra: Math.round(r.right - mr) });
        }
        cul.sort((a, b) => b.sobra - a.sobra);
        issues.push({ t: 'area-rola-para-o-lado', sev: 'alta', desc: `A área de conteúdo tem ${sw}px de largura útil numa janela de ${cw}px: a tela rola para o lado (sobra ${sw - cw}px).`, el: 'div.acn-main', txt: '', sobra: sw - cw });
        cul.slice(0, 5).forEach(c => add('culpado-da-area', 'alta', `Passa ${c.sobra}px da borda direita da área de conteúdo (e nada em volta corta ou rola).`, c.el, { sobra: c.sobra }));
      }
    }
  }

  // A3) caixas que rolam para o lado (o usuário precisa arrastar para achar um botão) e caixas que CORTAM um controle sem dar rolagem (o botão some)
  if (!opts.incluirMenu) {
    let nRol = 0, nCorte = 0;
    for (const el of todos) {
      if (nRol >= 12 && nCorte >= 12) break;
      const c = cs(el);
      const ox = c.overflowX;
      if (ox === 'visible') continue;
      if (el.clientWidth < 120) continue;
      const exc = el.scrollWidth - el.clientWidth;
      if (exc <= 6) continue;
      const er = el.getBoundingClientRect();
      // controles (botão, campo, link) que ficam, em parte ou por inteiro, além da borda direita da caixa
      const escondidos = [];
      for (const f of el.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]')) {
        if (!visivel(f)) continue;
        const fr = f.getBoundingClientRect();
        if (fr.right > er.right + 2 && fr.left < er.right + 2000) escondidos.push(f);
      }
      if (ox === 'auto' || ox === 'scroll') {
        if (nRol >= 12) continue;
        nRol++;
        const grande = el.clientWidth >= vw * 0.5;
        issues.push({ t: 'rolagem-lateral', sev: escondidos.length && grande ? 'media' : 'baixa', desc: `A caixa ${seletor(el)} (${el.clientWidth}px) rola para o lado: o conteúdo tem ${el.scrollWidth}px (sobra ${exc}px)${escondidos.length ? `; ${escondidos.length} controle(s) ficam fora da vista, ex.: "${rotulo(escondidos[0])}"` : ''}.`,
          el: caminho(el), txt: '', sobra: exc, qtd: escondidos.length });
      } else if (escondidos.length) {
        if (nCorte >= 12) continue;
        nCorte++;
        add('corte-escondendo-controle', 'alta', `A caixa ${seletor(el)} (${el.clientWidth}px, overflow ${ox}) corta o conteúdo e esconde ${escondidos.length} controle(s), ex.: "${rotulo(escondidos[0])}", sem dar rolagem.`, el, { sobra: exc, qtd: escondidos.length });
      }
    }
  }

  // B) texto cortado (sem reticências)
  let truncados = 0;
  for (const el of todos) {
    const c = cs(el);
    const t = proprio(el);
    if (t.length < 2) continue;
    const ox = c.overflowX, oy = c.overflowY;
    if ((ox === 'hidden' || ox === 'clip') && el.scrollWidth > el.clientWidth + 2) {
      if (c.textOverflow === 'ellipsis') truncados++;
      else add('texto-cortado-largura', 'media', `O texto passa ${el.scrollWidth - el.clientWidth}px da caixa e é cortado sem reticências.`, el);
    }
    if ((oy === 'hidden' || oy === 'clip') && el.scrollHeight > el.clientHeight + 3 && !(c.webkitLineClamp && c.webkitLineClamp !== 'none')) {
      add('texto-cortado-altura', 'media', `O texto passa ${el.scrollHeight - el.clientHeight}px da altura da caixa e é cortado.`, el);
    }
  }

  // C) filho que vaza da caixa do pai (pai sem rolagem)
  for (const el of alvos) {
    const c = cs(el);
    if (c.position === 'absolute' || c.position === 'fixed') continue;
    const p = el.parentElement; if (!p || p === document.body || p === document.documentElement) continue;
    const pc = cs(p);
    if (pc.overflowX !== 'visible' || pc.display === 'contents') continue;
    const pr = p.getBoundingClientRect(); const er = el.getBoundingClientRect();
    if (pr.width < 4) continue;
    const vazaD = er.right - pr.right, vazaE = pr.left - er.left;
    if (vazaD > 2 || vazaE > 2) {
      const q = Math.max(vazaD, vazaE);
      add('vaza-da-caixa', q > 12 ? 'alta' : 'media', `Passa ${Math.round(q)}px da borda ${vazaD > vazaE ? 'direita' : 'esquerda'} da caixa em que está (${seletor(p)}).`, el, { sobra: Math.round(q) });
    }
  }

  // D) coisa em cima de coisa
  // texto que não é controle: vale a caixa das LINHAS de texto, não a do bloco inteiro (um bloco grande com o texto no meio não "ocupa" o canto onde está outro controle)
  // devolve {e, lines}: e = caixa que envolve todas as linhas; lines = a caixa de CADA linha (texto que quebra em duas linhas ao lado de um selo não ocupa o retângulo todo)
  const caixaDoTexto = (el, e) => {
    const rg = document.createRange(); let L = 1e9, T = 1e9, R = -1e9, B = -1e9; const lines = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const l = Math.max(r.left, e.L), t = Math.max(r.top, e.T), rr = Math.min(r.right, e.R), b = Math.min(r.bottom, e.B);
        if (rr - l < 1 || b - t < 1) continue;
        lines.push({ L: l, T: t, R: rr, B: b, w: rr - l, h: b - t });
        L = Math.min(L, l); T = Math.min(T, t); R = Math.max(R, rr); B = Math.max(B, b);
      }
    }
    if (!lines.length) return { e, lines: [e] };
    return { e: Object.assign({}, e, { L, T, R, B, w: R - L, h: B - T }), lines };
  };
  const emDetailsFechado = (el) => { const d = el.closest('details:not([open])'); return !!d && !el.closest('summary'); };
  const itens = alvos.filter(el => !emDetailsFechado(el) && !/^(TABLE|SVG|CANVAS|VIDEO)$/i.test(el.tagName) && (ehInterativo(el) || proprio(el).length >= 2)).map(el => {
    const e0 = efetivo(el);
    if (ehInterativo(el)) return { el, e: e0, lines: [e0], c: cs(el) };
    const t = caixaDoTexto(el, e0); return { el, e: t.e, lines: t.lines, c: cs(el) };
  })
    .filter(x => x.e.w > 3 && x.e.h > 3 && !((raizFixa(x.el)) && !opts.incluirFixos && !opts.incluirMenu));
  itens.sort((a, b) => a.e.T - b.e.T);
  const limite = Math.min(itens.length, 4500);
  let pares = 0;
  let colunaFixaSobre = 0;
  for (let i = 0; i < limite && pares < 40; i++) {
    const a = itens[i];
    for (let j = i + 1; j < limite; j++) {
      const b = itens[j];
      if (b.e.T >= a.e.B) break;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // L4 (19/11/2026): a coluna "Ações" presa à direita (acn-col-fixa) cobre de propósito a coluna que estaria sob ela até a pessoa rolar a tabela; não é defeito
      if (a.el.closest('.acn-col-fixa') || b.el.closest('.acn-col-fixa')) { colunaFixaSobre++; continue; }
      // a melhor interseção entre as caixas das LINHAS de texto (ou a caixa inteira do controle)
      let melhor = null;
      for (const la of a.lines) for (const lb of b.lines) {
        const w1 = Math.min(la.R, lb.R) - Math.max(la.L, lb.L), h1 = Math.min(la.B, lb.B) - Math.max(la.T, lb.T);
        if (w1 <= 2 || h1 <= 2) continue;
        const ar = w1 * h1;
        if (!melhor || ar > melhor.area) melhor = { iw: w1, ih: h1, area: ar, menor: Math.min(la.w * la.h, lb.w * lb.h), px: Math.max(la.L, lb.L) + w1 / 2, py: Math.max(la.T, lb.T) + h1 / 2 };
      }
      if (!melhor) continue;
      const { iw, ih, area, menor, px, py } = melhor;
      if (area < 60 || area / menor < 0.25) continue;
      // quem está por cima no ponto do encontro? se for um terceiro (janela, menu aberto), não é sobreposição de verdade
      if (px >= 0 && py >= 0 && px < vw && py < vh) {
        const top = document.elementFromPoint(px, py);
        if (top && !(a.el.contains(top) || top.contains(a.el) || b.el.contains(top) || top.contains(b.el))) continue;
      }
      const abs = a.c.position === 'absolute' || b.c.position === 'absolute';
      const ambosInterativos = ehInterativo(a.el) && ehInterativo(b.el);
      const sev = abs ? 'baixa' : (ambosInterativos || area / menor > 0.6 ? 'alta' : 'media');
      pares++;
      issues.push({ t: 'sobreposicao', sev, desc: `"${rotulo(a.el)}" e "${rotulo(b.el)}" se sobrepõem (${Math.round(iw)}×${Math.round(ih)}px, ${Math.round(100 * area / menor)}% do menor)${abs ? ' — um deles é posicionado (selo/ícone sobre outro?)' : ''}.`,
        el: caminho(a.el), el2: caminho(b.el), txt: rotulo(a.el) + ' × ' + rotulo(b.el) });
      if (sev === 'alta') { marca(a.el); marca(b.el); }
    }
  }

  // E) controle coberto por outro elemento
  let cobertos = 0;
  for (const x of itens) {
    if (cobertos >= 15) break;
    if (!ehInterativo(x.el) || x.c.position === 'fixed') continue;
    const e = x.e; if (e.L < 0 || e.T < 0 || e.R > vw || e.B > vh || e.w < 8 || e.h < 8) continue;
    const px = e.L + e.w / 2, py = e.T + e.h / 2;
    const top = document.elementFromPoint(px, py);
    if (!top || x.el.contains(top) || top.contains(x.el)) continue;
    if (top.closest('.acn-col-fixa')) continue; // L4: coluna Ações fixa cobre de propósito (a tabela rola e o controle fica alcançável)
    if (x.el.tagName === 'INPUT' && top.tagName === 'LABEL') continue;
    if (x.el.tagName === 'LABEL' && top.tagName === 'INPUT') continue;
    if (top.closest('.modal-overlay, [role=dialog], [role=listbox], [role=tooltip], .acn-toast, .acn-selmulti-lista, .acn-menu, [role=menu]') && !x.el.closest('.modal-overlay, [role=dialog]')) continue;
    cobertos++;
    add('controle-coberto', 'alta', `"${rotulo(x.el)}" está coberto por ${seletor(top)} "${rotulo(top).slice(0, 30)}" e não recebe o clique.`, x.el, { cobertoPor: caminho(top) });
  }

  // F) janela (modal) maior que a tela
  janelasAbertas.map(j => window.__caixaDaJanela(j)).forEach(m => {
    if (!visivel(m)) return;
    const r = m.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) add('janela-fora-da-tela', 'alta', `A janela passa da largura da tela (esquerda ${Math.round(r.left)}, direita ${Math.round(r.right)} de ${vw}px).`, m);
    if (r.top < -1) add('janela-fora-da-tela', 'alta', `O topo da janela fica ${Math.round(-r.top)}px acima da tela.`, m);
    if (r.bottom > vh + 1) add('janela-fora-da-tela', 'alta', `A base da janela fica ${Math.round(r.bottom - vh)}px abaixo da tela.`, m);
    const rod = m.querySelector('.acn-modal-rodape');
    if (rod) { const rr = rod.getBoundingClientRect(); if (rr.bottom > vh + 1 || rr.top < 0) add('rodape-da-janela-fora', 'alta', `Os botões do rodapé da janela ficam fora da tela (base em ${Math.round(rr.bottom)}px de ${vh}px).`, rod); }
  });

  // G) alvos de toque pequenos e H) letra miúda (só no celular/tablet)
  let pequenos = 0, miudas = 0; const exPeq = [], exMiu = [];
  if (opts.toque) {
    for (const x of itens) {
      if (ehInterativo(x.el) && !(x.el.tagName === 'INPUT' && /checkbox|radio/.test(x.el.type)) && x.e.r.width > 0) {
        const m = Math.min(x.e.r.width, x.e.r.height);
        if (m < 28) { pequenos++; if (exPeq.length < 8) exPeq.push(rotulo(x.el) + ' (' + Math.round(x.e.r.width) + '×' + Math.round(x.e.r.height) + ')'); }
      }
      const fs = parseFloat(x.c.fontSize);
      if (fs < 11 && proprio(x.el).length >= 2) { miudas++; if (exMiu.length < 8) exMiu.push(rotulo(x.el) + ' (' + fs + 'px)'); }
    }
    if (pequenos) issues.push({ t: 'alvo-de-toque-pequeno', sev: 'baixa', desc: `${pequenos} controle(s) com menos de 28px de lado menor; exemplos: ${exPeq.join('; ')}`, el: 'vários', txt: '', qtd: pequenos });
    if (miudas) issues.push({ t: 'letra-miuda', sev: 'baixa', desc: `${miudas} texto(s) com menos de 11px; exemplos: ${exMiu.join('; ')}`, el: 'vários', txt: '', qtd: miudas });
  }

  // I) widget flutuante (position: fixed) em cima de conteúdo da página: no celular o botão de chat, o de avisos e as barras fixas ficam sobre o que a pessoa precisa tocar
  if (!opts.incluirMenu) {
    const raizes = [];
    for (const el of todos) {
      if (cs(el).position !== 'fixed') continue;
      if (el.closest('.modal-overlay, [role=dialog], .modal-box')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.width >= vw * 0.95 && r.height >= vh * 0.5) continue; // fundo de janela / película
      if (raizFixa(el) !== el) continue;
      raizes.push({ el, r });
    }
    for (const rz of raizes.slice(0, 12)) {
      const cobre = [];
      for (const x of itens) {
        if (raizFixa(x.el)) continue;
        let mel = null;
        for (const ln of x.lines) {
          const w1 = Math.min(ln.R, rz.r.right) - Math.max(ln.L, rz.r.left), h1 = Math.min(ln.B, rz.r.bottom) - Math.max(ln.T, rz.r.top);
          if (w1 <= 2 || h1 <= 2) continue;
          if (!mel || w1 * h1 > mel.area) mel = { iw: w1, ih: h1, area: w1 * h1, menor: Math.min(ln.w * ln.h, rz.r.width * rz.r.height), px: Math.max(ln.L, rz.r.left) + w1 / 2, py: Math.max(ln.T, rz.r.top) + h1 / 2 };
        }
        if (!mel) continue;
        if (mel.area < 40 || mel.area / mel.menor < 0.3) continue;
        const px = mel.px, py = mel.py;
        if (px < 0 || py < 0 || px >= vw || py >= vh) continue;
        const top = document.elementFromPoint(px, py);
        if (!top || !rz.el.contains(top)) continue;
        cobre.push({ rot: rotulo(x.el), inter: ehInterativo(x.el), el: x.el });
      }
      if (cobre.length) {
        const inter = cobre.some(c => c.inter);
        issues.push({ t: 'flutuante-cobre-conteudo', sev: inter ? 'media' : 'baixa', desc: `O elemento fixo "${rotulo(rz.el) || seletor(rz.el)}" (${seletor(rz.el)}, ${Math.round(rz.r.width)}×${Math.round(rz.r.height)}px) cobre ${cobre.length} item(ns) da página${inter ? ', inclusive controle(s) clicável(is)' : ''}: ${cobre.slice(0, 4).map(c => '"' + c.rot + '"').join('; ')}.`,
          el: caminho(rz.el), el2: caminho(cobre[0].el), txt: rotulo(rz.el) });
      }
    }
  }
  if (opts.soFlutuantes) { const so = issues.filter(i => i.t === 'flutuante-cobre-conteudo'); issues.splice(0, issues.length, ...so); }

  if (document.body.innerText.trim().length < 30) issues.push({ t: 'tela-em-branco', sev: 'alta', desc: 'A tela ficou praticamente sem texto (em branco?).', el: 'body', txt: '' });

  const tituloEl = document.querySelector('main h1, main h2, .acn-pagina h1, h1, h2');
  return { vw, vh, larguraDoc, alturaDoc: Math.max(doc.scrollHeight, document.body.scrollHeight), elementos: todos.length, truncadosComReticencias: truncados, titulo: tituloEl ? (tituloEl.innerText || '').replace(/\s+/g, ' ').slice(0, 60) : '', issues };
};
window.__limparMarcas = () => document.querySelectorAll('[data-aud]').forEach(e => e.removeAttribute('data-aud'));
