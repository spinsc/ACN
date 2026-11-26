// Teste de fumaça de TODAS as telas do menu, só leitura (B7 do plano de migração para o servidor interno, 26/11/2026).
//
// Para que serve: antes da mudança de casa, tirar a LINHA DE BASE (o que cada tela já faz hoje: erros, pedidos que falham, tempo até sossegar,
// para que endereços ela pede); depois da virada, a mesma ferramenta roda no servidor novo e o resultado é comparado tela a tela
// (aceite do plano: nenhuma tela pior que a linha de base e nenhum pedido ao Supabase ou ao GitHub).
//
// Uso (pasta do repositório; o puppeteer-core fica fora do projeto, NODE_PATH apontando para um node_modules que o tenha):
//   node ferramentas/fumaca/fumaca.cjs                    todas as telas, com as abas de dentro de cada uma
//   node ferramentas/fumaca/fumaca.cjs "^(Início|Compras)$"   só as telas cujo nome casa com a expressão
//   node ferramentas/fumaca/fumaca.cjs --sem-abas         só a primeira vista de cada tela (mais leve)
//   BASE=https://spinsc.github.io/ACN/  → a produção publicada; sem BASE, o servidor de desenvolvimento (lib.cjs).
//   ACN_BANCO=...                       → outro banco (a homologação do servidor interno); ver ferramentas/comum/rede_de_teste.cjs.
//
// Gravações bloqueadas (lib.cjs: nada chega ao banco). Conta de teste ZZTESTE (senha fora do repositório). Cada tela lê o banco de produção:
// RODE FORA DO HORÁRIO DE USO (a bateria de endereços, com um navegador por cenário, já derrubou o banco por instantes em horário cheio).
// Saída: ferramentas/fumaca/saida/<data_hora>/fumaca.json e resumo.md (a pasta saida/ não vai para o Git).
const fs = require('fs'), path = require('path');
const { abrir, espera, BASE } = require('../auditoria_layout/lib.cjs');
const { gravaAlgo, vaiAoBancoOuParaFora, ehLocal, caminhoDe } = require('../comum/rede_de_teste.cjs');

const args = process.argv.slice(2);
const semAbas = args.includes('--sem-abas');
const filtroTxt = args.find(a => !a.startsWith('--'));
const filtro = filtroTxt ? new RegExp(filtroTxt, 'i') : null;
const agora = new Date();
const carimbo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}_${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`;
const SAIDA = path.join(__dirname, 'saida', carimbo);
fs.mkdirSync(SAIDA, { recursive: true });
const LOG = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);
const QUIETO_MS = 800, LIMITE_MS = 15000;

// o que se lê de um pedido para o relatório: o host e o caminho, sem o que vem depois do "?" (pode ter nome de cliente ou id)
const rotuloDoPedido = (url) => { try { const u = new URL(url); return u.host + u.pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/<id>'); } catch { return String(url).slice(0, 80); } };
const tipoDoHost = (url) => { try { const h = new URL(url).host; if (ehLocal(url)) return 'local'; if (/supabase\.co$/.test(h)) return 'supabase'; if (/github\.io$|githubusercontent|github\.com$/.test(h)) return 'github'; return h; } catch { return 'outro'; } };

(async () => {
  const { browser, page } = await abrir({ largura: 1500, altura: 950 });
  let atual = null;   // o balde da tela que está sendo medida
  const novoBalde = (tela, aba) => ({ tela, aba: aba || null, abriu: false, conteudo: 0, msAteQuieto: null, errosDePagina: [], errosDeConsole: [], falhas: [], bloqueadas: 0, porHost: {}, pedidos: 0 });
  page.on('pageerror', e => { if (atual) atual.errosDePagina.push(String(e && e.message || e).slice(0, 240)); });
  page.on('console', m => { if (atual && m.type() === 'error') atual.errosDeConsole.push(m.text().slice(0, 240)); });
  page.on('request', r => {
    if (!atual) return;
    const t = tipoDoHost(r.url()); if (t === 'local') return;
    atual.pedidos++; atual.porHost[t] = (atual.porHost[t] || 0) + 1;
  });
  page.on('requestfailed', r => {
    if (!atual) return;
    // a gravação que a própria ferramenta bloqueou não é defeito da tela: só conta
    if (gravaAlgo(r.method()) && vaiAoBancoOuParaFora(r.url())) { atual.bloqueadas++; return; }
    atual.falhas.push({ tipo: 'rede', metodo: r.method(), pedido: rotuloDoPedido(r.url()), motivo: (r.failure() && r.failure().errorText) || '?' });
  });
  page.on('response', resp => {
    if (!atual || resp.status() < 400) return;
    const r = resp.request(); if (ehLocal(r.url()) && !caminhoDe(r.url()).match(/^\/(rest|storage|functions|auth|api)\//)) return;
    atual.falhas.push({ tipo: 'http', status: resp.status(), metodo: r.method(), pedido: rotuloDoPedido(r.url()) });
  });

  const resultados = [];
  const quieto = async () => { const t0 = Date.now(); await page.waitForNetworkIdle({ idleTime: QUIETO_MS, timeout: LIMITE_MS }).catch(() => {}); return Date.now() - t0; };
  const medir = async (tela, aba, acao) => {
    atual = novoBalde(tela, aba);
    const t0 = Date.now();
    try {
      atual.abriu = await acao();
      await quieto();
      atual.msAteQuieto = Date.now() - t0;
      await espera(500);
      atual.conteudo = await page.evaluate(() => (document.querySelector('.acn-main')?.innerText || '').replace(/\s+/g, ' ').trim().length);
    } catch (e) { atual.falhas.push({ tipo: 'ferramenta', motivo: String(e.message).slice(0, 200) }); }
    const b = atual; atual = null;
    b.errosDeConsole = [...new Set(b.errosDeConsole)]; b.errosDePagina = [...new Set(b.errosDePagina)];
    resultados.push(b);
    fs.writeFileSync(path.join(SAIDA, 'fumaca.json'), JSON.stringify({ base: BASE, quando: agora.toISOString(), semAbas, filtro: filtroTxt || null, resultados }, null, 1));
    LOG(`  ${tela}${aba ? ' › ' + aba : ''}: ${b.abriu ? 'abriu' : 'NÃO ABRIU'} · ${b.msAteQuieto ?? '?'} ms · ${b.pedidos} pedidos · ${b.falhas.length} falha(s) · ${b.errosDePagina.length} erro(s) de página · ${b.errosDeConsole.length} de console`);
    return b;
  };

  // abertura do sistema (a tela inicial também conta)
  await medir('(abertura do sistema)', null, async () => { await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 40000 }); return true; });

  const telas = await page.evaluate(() => [...document.querySelectorAll('.sidebar-item .sidebar-rotulo')].map(x => x.textContent.trim()).filter(Boolean));
  LOG('telas no menu:', telas.length);
  const irParaTela = (n) => page.evaluate((n) => {
    const achar = () => [...document.querySelectorAll('.sidebar-item .sidebar-rotulo')].find(x => x.textContent.trim() === n);
    if (!achar()) document.querySelectorAll('.sidebar-section[aria-expanded=false]').forEach(b => { try { b.click(); } catch {} });
    return new Promise(res => setTimeout(() => { const el = achar(); if (el) { el.click(); res(true); } else res(false); }, 450));
  }, n);

  for (const tela of telas) {
    if (/^(sair|logout)$/i.test(tela)) continue;
    if (filtro && !filtro.test(tela)) continue;
    LOG('TELA', tela);
    await medir(tela, null, () => irParaTela(tela));
    if (semAbas) continue;
    const abas = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(b => !b.closest('.acn-sidebar') && b.getBoundingClientRect().width > 0 && b.getAttribute('aria-selected') !== 'true').map(b => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    for (const aba of [...new Set(abas)].slice(0, 12)) {
      await medir(tela, aba, () => page.evaluate((t) => { const b = [...document.querySelectorAll('[role=tab]')].find(x => !x.closest('.acn-sidebar') && (x.innerText || '').replace(/\s+/g, ' ').trim() === t); if (b) { b.click(); return true; } return false; }, aba));
    }
  }
  await browser.close();

  // resumo legível
  const soma = (f) => resultados.reduce((s, r) => s + f(r), 0);
  const hosts = {}; resultados.forEach(r => Object.entries(r.porHost).forEach(([h, n]) => { hosts[h] = (hosts[h] || 0) + n; }));
  const linhas = [
    `# Fumaça das telas — ${agora.toLocaleString('pt-BR')}`, '',
    `Sistema: ${BASE} · ${semAbas ? 'só a primeira vista de cada tela' : 'telas e abas de dentro'}${filtroTxt ? ' · filtro ' + filtroTxt : ''}`, '',
    `- Vistas medidas: **${resultados.length}** (não abriram: ${resultados.filter(r => !r.abriu).length})`,
    `- Erros de página: **${soma(r => r.errosDePagina.length)}** · erros de console: **${soma(r => r.errosDeConsole.length)}** · pedidos com falha: **${soma(r => r.falhas.length)}** · gravações bloqueadas pela ferramenta: ${soma(r => r.bloqueadas)}`,
    `- Pedidos por destino: ${Object.entries(hosts).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ${n}`).join(' · ')}`, '',
    '| Tela | Aba | Abriu | ms até sossegar | Pedidos | Falhas | Erros de página | Erros de console |', '|---|---|---|---|---|---|---|---|',
    ...resultados.map(r => `| ${r.tela} | ${r.aba || ''} | ${r.abriu ? 'sim' : '**não**'} | ${r.msAteQuieto ?? '?'} | ${r.pedidos} | ${r.falhas.length || ''} | ${r.errosDePagina.length || ''} | ${r.errosDeConsole.length || ''} |`), '',
    '## Detalhes do que falhou', '',
    ...resultados.filter(r => r.falhas.length || r.errosDePagina.length || r.errosDeConsole.length).flatMap(r => [
      `### ${r.tela}${r.aba ? ' › ' + r.aba : ''}`,
      ...r.falhas.map(f => `- falha ${f.tipo}${f.status ? ' ' + f.status : ''}: ${f.metodo || ''} ${f.pedido || ''} ${f.motivo || ''}`.trim()),
      ...r.errosDePagina.map(e => `- erro de página: ${e}`),
      ...r.errosDeConsole.map(e => `- console: ${e}`), '',
    ]),
  ];
  fs.writeFileSync(path.join(SAIDA, 'resumo.md'), linhas.join('\n'));
  LOG('FIM. Resumo em', path.join(SAIDA, 'resumo.md'));
})().catch(e => { console.error('ERRO GERAL', e); process.exit(2); });
