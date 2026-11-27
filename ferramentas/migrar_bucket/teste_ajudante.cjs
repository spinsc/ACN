// Teste do ajudante do bucket privado (src/ArquivoPrivado.ts) NO NAVEGADOR, com o armazenamento SIMULADO: nada sai para o banco.
// Confere: envio ao bucket privado (e nunca ao público), endereço assinado, guarda em memória, queda para o endereço antigo, arquivo comum passa direto,
// abrir em aba nova com endereço novo. Precisa do servidor de desenvolvimento no ar (porta 5173): node ferramentas/migrar_bucket/teste_ajudante.cjs
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { assinados: [], envios: [], outros: [] };
  let falharEnvio = false;
  const existentes = new Set(['chat/s1/a.png', 'assinaturas/cq_1.png']);   // o que "já está" no bucket privado simulado
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = decodeURIComponent(req.url());
    if (!u.includes('supabase.co')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    let m = u.match(/\/storage\/v1\/object\/sign\/acn-privado\/(.+)$/);
    if (m) {
      log.assinados.push(m[1]);
      if (!existentes.has(m[1])) return req.respond({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }) });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ signedURL: '/object/sign/acn-privado/' + m[1] + '?token=T' + log.assinados.length }) });
    }
    m = u.match(/\/storage\/v1\/object\/(acn-[a-z]+)\/(.+)$/);
    if (m && req.method() === 'POST') {
      log.envios.push(m[1] + '/' + m[2]);
      if (falharEnvio) return req.respond({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ statusCode: '400', error: 'Invalid key', message: 'Invalid key' }) });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ Key: m[1] + '/' + m[2], Id: 'x' }) });
    }
    log.outros.push(req.method() + ' ' + u);
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async (PUBLICO) => {
    const m = await import('/ACN/src/ArquivoPrivado.ts');
    const saida = {};
    // 1) envio vai ao bucket privado e devolve "privado:<caminho>"
    const env = await m.enviarArquivoPrivado('chat/s1/novo.png', new Blob(['x'], { type: 'image/png' }));
    saida.envio = { valor: env.valor, erro: !!env.erro };
    // 2) valor novo vira endereço assinado; segunda chamada usa a guarda (um pedido só)
    saida.assinado1 = await m.urlDoArquivo('privado:chat/s1/a.png');
    saida.assinado2 = await m.urlDoArquivo('privado:chat/s1/a.png');
    // 3) clique de abrir pede endereço novo (fresco)
    saida.fresco = await m.urlDoArquivo('privado:chat/s1/a.png', true);
    // 4) endereço público antigo cuja cópia já existe → privado
    saida.antigoCopiado = await m.urlDoArquivo(PUBLICO + 'assinaturas/cq_1.png');
    // 5) endereço antigo ainda sem cópia → cai no endereço velho; segunda chamada não pergunta de novo
    saida.antigoSemCopia = await m.urlDoArquivo(PUBLICO + 'assinaturas/cq_2.png');
    saida.antigoSemCopia2 = await m.urlDoArquivo(PUBLICO + 'assinaturas/cq_2.png');
    // 6) valor novo sem arquivo → null (não há endereço velho para cair)
    saida.novoSemArquivo = await m.urlDoArquivo('privado:assinaturas/some.png');
    // 7) arquivo comum passa direto, sem pedir nada
    saida.comum = await m.urlDoArquivo(PUBLICO + 'licitacoes/x.pdf');
    saida.vazio = await m.urlDoArquivo('');
    // 8) abrir: aba aberta na hora, depois recebe o endereço
    const abas = [];
    window.open = (u, alvo, feat) => { const aba = { u, alvo, feat, opener: 1, location: { set href(v) { aba.href = v; } } }; abas.push(aba); return aba; };
    saida.abriu = await m.abrirArquivo('privado:chat/s1/a.png');
    saida.abas = abas.map(a => ({ inicial: a.u, href: a.href, opener: a.opener }));
    window.open = (u) => { abas.push({ u }); return { close() { abas.fechada = true; }, location: {} }; };
    window.alert = () => {};
    saida.abriuFalha = await m.abrirArquivo('privado:assinaturas/some.png');
    saida.fechou = !!abas.fechada;
    saida.comumAbre = await m.abrirArquivo(PUBLICO + 'licitacoes/x.pdf');
    return saida;
  }, PUBLICO);

  ok(r.envio.valor === 'privado:chat/s1/novo.png' && !r.envio.erro, 'envio devolve privado:<caminho> (' + JSON.stringify(r.envio) + ')');
  ok(log.envios[0] === 'acn-privado/chat/s1/novo.png', 'o envio foi ao bucket privado (' + log.envios + ')');
  ok(!log.envios.some(e => e.startsWith('acn-media/')), 'nada foi enviado ao bucket público');
  ok(/\/storage\/v1\/object\/sign\/acn-privado\/chat\/s1\/a\.png\?token=T1$/.test(r.assinado1 || ''), 'endereço assinado (' + r.assinado1 + ')');
  ok(r.assinado2 === r.assinado1, 'segunda chamada reaproveita o endereço guardado');
  ok(log.assinados.filter(p => p === 'chat/s1/a.png').length === 3, 'o 1º pedido, o "fresco" e o do abrirArquivo (as chamadas guardadas não pedem de novo) (' + log.assinados.filter(p => p === 'chat/s1/a.png').length + ')');
  ok(r.fresco && r.fresco !== r.assinado1, 'o clique de abrir pede endereço novo');
  ok(/acn-privado\/assinaturas\/cq_1\.png\?token=/.test(r.antigoCopiado || ''), 'endereço antigo já copiado vira assinado (' + r.antigoCopiado + ')');
  ok(r.antigoSemCopia === PUBLICO + 'assinaturas/cq_2.png', 'antigo sem cópia cai no endereço velho (' + r.antigoSemCopia + ')');
  ok(r.antigoSemCopia2 === r.antigoSemCopia && log.assinados.filter(p => p === 'assinaturas/cq_2.png').length === 1, 'a falha também é guardada: um pedido só');
  ok(r.novoSemArquivo === null, 'valor novo sem arquivo devolve null');
  ok(r.comum === PUBLICO + 'licitacoes/x.pdf' && !log.assinados.some(p => p.startsWith('licitacoes')), 'arquivo de outra pasta passa direto, sem pedir endereço');
  ok(r.vazio === null, 'vazio devolve null');
  ok(r.abriu === true && r.abas.length === 1 && r.abas[0].inicial === '' && /token=T/.test(r.abas[0].href || '') && r.abas[0].opener === null, 'abrir: aba aberta vazia, recebe o endereço e perde o vínculo (' + JSON.stringify(r.abas) + ')');
  ok(r.abriuFalha === false && r.fechou === true, 'abrir arquivo que não existe fecha a aba e avisa');
  ok(r.comumAbre === true, 'arquivo comum abre direto');

  // envio com erro do armazenamento: devolve o erro, sem valor
  falharEnvio = true;
  const e = await page.evaluate(async () => { const m = await import('/ACN/src/ArquivoPrivado.ts'); const x = await m.enviarArquivoPrivado('chat/s1/ruim.png', new Blob(['x'])); return { valor: x.valor, erro: !!x.erro }; });
  ok(e.valor === null && e.erro === true, 'envio recusado devolve erro e nenhum valor (' + JSON.stringify(e) + ')');
  ok(log.outros.length === 0, 'nenhum outro pedido saiu (' + log.outros.slice(0, 3) + ')');

  await browser.close();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
