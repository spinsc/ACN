// Auditoria de layout de TODAS as telas (16/11/2026). Uso: node auditoria_layout.cjs <perfil> [filtroDeTela]
// Perfis: desktop (1920x1080), notebook (1366x768), tablet (820x1180 toque), celular (390x844 toque), celular-pequeno (360x740 toque).
// Gravações bloqueadas (lib.cjs). Para não sobrecarregar o banco de produção, as leituras são guardadas em disco (cache_leituras/) e reaproveitadas pelos outros perfis.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { abrir, espera, BASE } = require('./lib.cjs');
const PERFIS = {
  desktop: { largura: 1920, altura: 1080, toque: false },
  notebook: { largura: 1366, altura: 768, toque: false },
  tablet: { largura: 820, altura: 1180, toque: true },
  celular: { largura: 390, altura: 844, toque: true },
  'celular-pequeno': { largura: 360, altura: 740, toque: true },
  // tablet deitado (iPad 1180×820): toque, mas já na faixa do computador (>= 1024 px, a camada de celular/tablet não vale)
  'tablet-paisagem': { largura: 1180, altura: 820, toque: true },
  // janela do computador pela metade da tela (split-screen num monitor 1920): mouse, 960 px
  'desktop-meia-tela': { largura: 960, altura: 900, toque: false },
};
const perfil = process.argv[2] || 'desktop';
const filtro = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const P = PERFIS[perfil]; if (!P) { console.error('perfil?'); process.exit(1); }
const SAIDA = path.join(__dirname, 'auditoria', perfil);
const CACHE = path.join(__dirname, 'auditoria', 'cache_leituras');
fs.mkdirSync(path.join(SAIDA, 'fotos'), { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });
const jsonl = path.join(SAIDA, 'achados.jsonl');
// 18/11/2026: guarda a rodada anterior ao lado (achados_anterior.jsonl), para comparar antes e depois de uma fatia do plano de layout sem perder a medição de antes
try { if (fs.existsSync(jsonl) && fs.statSync(jsonl).size > 0) fs.copyFileSync(jsonl, path.join(SAIDA, 'achados_anterior.jsonl')); } catch {}
fs.writeFileSync(jsonl, '');
const chave = (r) => crypto.createHash('md5').update(r.method() + ' ' + r.url() + ' ' + (r.headers()['accept'] || '') + ' ' + (r.headers()['range'] || '')).digest('hex');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
const LOG = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

(async () => {
  const simular = (url, r) => {
    if (!r) return null;
    const f = path.join(CACHE, chave(r) + '.json');
    if (fs.existsSync(f)) { try { return { status: 200, body: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return null; } }
    return null;
  };
  const sessao = await abrir({ largura: P.largura, altura: P.altura, simular });
  const { browser, page, consoleErros } = sessao;
  if (P.toque) await page.setViewport({ width: P.largura, height: P.altura, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  // guarda no disco as leituras novas
  page.on('response', async (resp) => {
    try {
      const rq = resp.request();
      if (rq.method() !== 'GET' || !/supabase\.co\/rest\/v1\//.test(rq.url()) || resp.status() !== 200) return;
      const f = path.join(CACHE, chave(rq) + '.json');
      if (fs.existsSync(f)) return;
      const t = await resp.text(); if (t.length > 3e6) return;
      JSON.parse(t); fs.writeFileSync(f, t);
    } catch {}
  });
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e).slice(0, 200)));
  await page.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'auditoria_dom.js'), 'utf8'));
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 40000 });
  await page.addStyleTag({ content: '[data-aud]{outline:3px solid #ff00aa !important;outline-offset:-2px !important}' });
  await espera(1500);
  const quieto = async () => { await page.waitForNetworkIdle({ idleTime: 600, timeout: 7000 }).catch(() => {}); await espera(400); };
  let nFoto = 0;

  const auditar = async (tela, sub, extra = {}) => {
    const rot = sub ? `${tela} › ${sub}` : tela;
    let r;
    try { r = await page.evaluate((o) => window.__auditar(o), { toque: P.toque, ...extra }); }
    catch (e) { LOG('  falha ao auditar', rot, e.message); return null; }
    // de novo com a tela rolada até o fim: é lá que o botão de chat / de avisos costuma ficar em cima do último controle da página
    if (!extra.modal && !extra.incluirMenu) {
      try {
        const rolou = await page.evaluate(() => {
          let melhor = null, m = 0;
          for (const e of document.querySelectorAll('main, main *, .acn-pagina, .acn-pagina *, #root > div, #root > div > div')) {
            const c = getComputedStyle(e);
            if (/(auto|scroll)/.test(c.overflowY) && e.scrollHeight - e.clientHeight > m && e.clientHeight > 200) { m = e.scrollHeight - e.clientHeight; melhor = e; }
          }
          const dr = document.documentElement.scrollHeight - innerHeight;
          if (dr > Math.max(m, 40)) { scrollTo(0, 1e7); return dr; }
          if (melhor && m > 40) { melhor.scrollTop = melhor.scrollHeight; window.__rolado = melhor; return m; }
          return 0;
        });
        if (rolou > 40) {
          await espera(350);
          const f = await page.evaluate((o) => window.__auditar(o), { toque: P.toque, soFlutuantes: true });
          f.issues.forEach(i => { i.desc = '[no fim da tela] ' + i.desc; r.issues.push(i); });
          await page.evaluate(() => { scrollTo(0, 0); if (window.__rolado) window.__rolado.scrollTop = 0; });
          // 18/11/2026 (L1 do plano de layout): o botão flutuante (📌 / 💬) SEMPRE cobre o que está embaixo dele na vista do topo; se a tela rola, a pessoa tira o conteúdo de baixo
          // dele rolando — isso não é defeito. O que importa é a vista do FIM da tela (acima), onde não há mais para onde rolar. Por isso, quando a tela rola, o que o flutuante cobre
          // no topo deixa de contar como achado (fica só o número em `flutuanteNoTopo`, para o relatório). Tela que NÃO rola mantém o achado.
          const doFlutuante = (i) => (i.t === 'controle-coberto' && /avs-pino|chat-fab|aviso-widget|chat-raiz/.test(i.desc)) || (i.t === 'flutuante-cobre-conteudo' && !/^\[no fim da tela\]/.test(i.desc));
          const antes = r.issues.length;
          r.issues = r.issues.filter(i => !doFlutuante(i));
          r.flutuanteNoTopo = antes - r.issues.length;
        }
      } catch (e) { /* o fim da tela é um extra: se falhar, fica só a auditoria do topo */ }
    }
    const altas = r.issues.filter(i => i.sev === 'alta');
    let foto = null;
    if (altas.length) {
      try {
        await page.evaluate(() => { const e = document.querySelector('[data-aud]'); if (e) e.scrollIntoView({ block: 'center', inline: 'center' }); });
        await espera(250);
        foto = `fotos/${String(++nFoto).padStart(3, '0')}_${slug(tela)}${sub ? '_' + slug(sub) : ''}${extra.modal ? '_janela' : ''}.jpg`;
        await page.screenshot({ path: path.join(SAIDA, foto), type: 'jpeg', quality: 55 });
      } catch (e) { foto = null; }
    }
    await page.evaluate(() => window.__limparMarcas()).catch(() => {});
    fs.appendFileSync(jsonl, JSON.stringify({ perfil, tela, sub: sub || null, modal: extra.modal || null, titulo: r.titulo, vw: r.vw, vh: r.vh, larguraDoc: r.larguraDoc, alturaDoc: r.alturaDoc, elementos: r.elementos,
      truncados: r.truncadosComReticencias, flutuanteNoTopo: r.flutuanteNoTopo || 0, foto, issues: r.issues }) + '\n');
    LOG(`  ${rot}${extra.modal ? ' [janela ' + extra.modal + ']' : ''}: ${r.issues.length} achado(s), ${altas.length} alto(s)`);
    return r;
  };

  // 1) o menu lateral no celular/tablet (gaveta aberta) e a lista de telas
  const telas = await page.evaluate(() => [...document.querySelectorAll('.sidebar-item .sidebar-rotulo')].map(x => x.textContent.trim()).filter(Boolean));
  LOG('telas no menu:', telas.length);
  // o menu é uma gaveta escondida em todos os tamanhos; os grupos fechados NÃO renderizam os itens, então é preciso abri-los antes de procurar a tela
  const abrirGrupos = () => page.evaluate(() => { document.querySelectorAll('.sidebar-section[aria-expanded=false]').forEach(b => { try { b.click(); } catch {} }); });
  const irParaTela = (n) => page.evaluate((n) => {
    const achar = () => [...document.querySelectorAll('.sidebar-item .sidebar-rotulo')].find(x => x.textContent.trim() === n);
    if (!achar()) document.querySelectorAll('.sidebar-section[aria-expanded=false]').forEach(b => { try { b.click(); } catch {} });
    return new Promise(res => setTimeout(() => { const el = achar(); if (el) { el.click(); res(true); } else res(false); }, 450));
  }, n);
  // fecha qualquer janela aberta (padrão ou camada fixa antiga): botão Cancelar/Fechar/✕, depois Escape, depois clique na película; por fim recarrega
  const fecharJanelas = async (tela) => {
    for (let t = 0; t < 4; t++) {
      if (!(await page.evaluate(() => window.__janelasAbertas().length > 0))) return;
      if (t === 0 || t === 1) await page.evaluate(() => {
        const js = window.__janelasAbertas(); const m = js[js.length - 1]; if (!m) return;
        const rot = (x) => (x.innerText || x.getAttribute('aria-label') || x.getAttribute('title') || '').trim();
        const b = [...m.querySelectorAll('button, [role=button]')].find(x => /^(cancelar|fechar|não|voltar|×|✕|x|close|descartar)$/i.test(rot(x)));
        if (b) b.click();
      });
      else if (t === 2) await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      await espera(450);
    }
    if (await page.evaluate(() => window.__janelasAbertas().length > 0)) {
      LOG('  janela não fechou; recarregando'); await page.goto(BASE, { waitUntil: 'networkidle2' }); await espera(1500);
      await irParaTela(tela); await quieto();
    }
  };
  {
    await page.evaluate(() => document.querySelector('.acn-hamburger')?.click()); await espera(900);
    await abrirGrupos(); await espera(500);
    await auditar('(menu lateral aberto)', null, { incluirMenu: true });
    await page.evaluate(() => document.querySelector('.acn-hamburger')?.click()).catch(() => {}); await espera(500);
  }

  for (const tela of telas) {
    if (/^(sair|logout)$/i.test(tela)) continue;
    if (filtro && !filtro.test(tela)) continue;
    LOG('TELA', tela);
    try {
      if (!(await irParaTela(tela))) { LOG('  não achei o item de menu', tela); fs.appendFileSync(jsonl, JSON.stringify({ perfil, tela, sub: null, erroDaAuditoria: 'item de menu não encontrado', issues: [] }) + '\n'); continue; }
      await quieto(); await espera(1200);
      await fecharJanelas(tela); // janela que ficou aberta da tela anterior não pode contaminar esta
      await page.evaluate(() => window.scrollTo(0, 0));
      await auditar(tela, null);
      // sub-abas
      const abas = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(b => !b.closest('.acn-sidebar') && b.getBoundingClientRect().width > 0 && b.getAttribute('aria-selected') !== 'true').map(b => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
      const unicas = [...new Set(abas)].slice(0, 9);
      for (const a of unicas) {
        const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll('[role=tab]')].find(x => !x.closest('.acn-sidebar') && (x.innerText || '').replace(/\s+/g, ' ').trim() === t); if (b) { b.click(); return true; } return false; }, a);
        if (!ok) continue;
        await quieto(); await espera(700);
        await auditar(tela, a);
      }
      // janelas: botões de "novo/cadastrar/..." (só abre; as gravações estão bloqueadas)
      const botoes = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.closest('.acn-sidebar, .modal-overlay') && b.getBoundingClientRect().width > 0 && !b.disabled
        && /^(\+\s*)?(nov[oa]s?\b|cadastrar|criar|adicionar|solicitar|lançar|registrar)/i.test((b.innerText || '').replace(/\s+/g, ' ').trim())).map(b => (b.innerText || '').replace(/\s+/g, ' ').trim()));
      for (const bt of [...new Set(botoes)].slice(0, 3)) {
        const abriu = await page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find(x => !x.closest('.acn-sidebar, .modal-overlay') && (x.innerText || '').replace(/\s+/g, ' ').trim() === t); if (b) { b.click(); return true; } return false; }, bt);
        if (!abriu) continue;
        await espera(1300);
        const temJanela = await page.evaluate(() => window.__janelasAbertas().length > 0);
        if (temJanela) {
          await auditar(tela, null, { modal: bt, incluirFixos: true });
          // rolar o corpo da janela até o fim e olhar de novo o rodapé
          await page.evaluate(() => { const c = document.querySelector('.modal-box .acn-modal-corpo'); if (c) c.scrollTop = c.scrollHeight; });
          await espera(300);
        }
        await fecharJanelas(tela);
      }
    } catch (e) {
      LOG('  ERRO na tela', tela, e.message);
      fs.appendFileSync(jsonl, JSON.stringify({ perfil, tela, sub: null, erroDaAuditoria: e.message, issues: [] }) + '\n');
      try { await page.goto(BASE, { waitUntil: 'networkidle2' }); await espera(1500); } catch {}
    }
  }
  fs.writeFileSync(path.join(SAIDA, 'erros_de_pagina.json'), JSON.stringify({ pageerrors: [...new Set(erros)].slice(0, 50), console: [...new Set(consoleErros)].slice(0, 50) }, null, 1));
  LOG('FIM', perfil);
  await browser.close();
})().catch(e => { console.error('ERRO GERAL', e); process.exit(2); });
