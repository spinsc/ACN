// Teste da fatia B4b do plano do bucket privado (imagem colada dentro de texto formatado: Área Livre das licitações, nota do CRM e Área Livre da cotação do Compras), 26/11/2026.
// 1) Varredura do código (sem navegador): nenhum editor manda imagem de texto ao bucket público; os três editores hidratam ao carregar, limpam ao gravar e inserem pela peça nova;
//    o texto só de leitura (anotação antiga das licitações) usa o componente; o limpador de HTML só deixa passar a marca de imagem de texto.
// 2) No navegador, com o armazenamento SIMULADO (nada sai para fora), rodando as funções REAIS de src/ImagensDeTexto.tsx: hidratar (marca → endereço assinado, endereço público
//    antigo → marca, imagem de fora e `data:` intocadas), limpar ao gravar (some o endereço assinado, fica a marca), enviar (vai ao privado, devolve o <img> com a marca), e o componente de leitura.
// Precisa do servidor de desenvolvimento no ar (porta 5173): NODE_PATH=<pasta com puppeteer-core>/node_modules node ferramentas/migrar_bucket/teste_b4b.cjs
const fs = require('fs');
const path = require('path');
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

// ── 1) varredura do código ──
const SRC = path.join(__dirname, '..', '..', 'src');
const lerSrc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\r\n').join('\n');   // os arquivos do projeto têm quebra de linha do Windows
const arquivos = fs.readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('zz_'));
const achados = [];
for (const f of arquivos) {
  const t = lerSrc(f);
  const re = /from\((['"])acn-media\1\)\.upload/g;
  let mm;
  while ((mm = re.exec(t))) {
    const antes = t.slice(Math.max(0, mm.index - 400), mm.index);
    if (/\/area-livre\//.test(antes) || /\/nota\//.test(antes)) achados.push(f);
  }
}
ok(achados.length === 0, 'nenhum envio de imagem de texto vai ao bucket público (' + achados.join(', ') + ')');
const lic = lerSrc('LicitacoesTab.tsx'), crm = lerSrc('CrmTab.tsx'), cmp = lerSrc('ComprasTab.tsx');
// Licitações
ok(/enviarImagemDeTexto\(file, `licitacoes\/\$\{licitacaoId\}\/area-livre`\)/.test(lic), 'Área Livre das licitações envia a imagem pela peça nova');
ok(/limparParaGravar\(el\.innerHTML\)/.test(lic), 'Área Livre das licitações limpa o texto antes de gravar');
ok(/hidratarImagens\(el\)/.test(lic), 'Área Livre das licitações hidrata as imagens ao carregar');
ok(/<HtmlComImagens html=\{textoAntigo\}/.test(lic), 'a anotação antiga (só leitura) das licitações usa o componente de leitura');
ok(!/dangerouslySetInnerHTML=\{\{ __html: htmlSeguro\(textoAntigo\) \}\}/.test(lic), 'a anotação antiga não usa mais o HTML direto');
// CRM
ok(/enviarImagemDeTexto\(file, `crm-docs\/\$\{modalAbrir\.id\}\/nota`/.test(crm), 'a nota do CRM envia a imagem pela peça nova');
ok(/limparParaGravar\(abrirNotaRef\.current\.innerHTML\)/.test(crm), 'a nota do CRM limpa o texto antes de gravar');
ok(/hidratarImagens\(abrirNotaRef\.current\)/.test(crm), 'a nota do CRM hidrata as imagens ao carregar');
// Compras
ok(/enviarImagemDeTexto\(file, `pcp-cotacoes\/\$\{cotacao\.id\}\/area-livre`\)/.test(cmp), 'a Área Livre da cotação envia a imagem pela peça nova');
ok(/limparParaGravar\(el\.innerHTML\)/.test(cmp), 'a Área Livre da cotação limpa o texto antes de gravar');
ok(/hidratarImagens\(el\)/.test(cmp), 'a Área Livre da cotação hidrata as imagens ao carregar');
// nenhum dos três grava o innerHTML cru
ok(!/const html = el\.innerHTML;/.test(lic) && !/const html = el\.innerHTML;/.test(cmp) && !/const html = abrirNotaRef\.current\.innerHTML;/.test(crm), 'nenhum editor grava o innerHTML cru');
// o limpador de HTML só deixa passar a marca de imagem de texto
const rti = lerSrc('RichTextInput.tsx');
ok(/marca === 'IMG' && nome === 'data-arquivo' && marcaDeImagemValida\(valor\)/.test(rti), 'o limpador de HTML só aceita data-arquivo de imagem de texto');
// quem mais exibe esse HTML? só o editor e o componente: conferir que nenhum outro arquivo lê as colunas de texto com imagem para desenhar
const leitores = arquivos.filter((f) => /areas_livres|\.area_livre\b/.test(lerSrc(f)) && /dangerouslySetInnerHTML/.test(lerSrc(f)) && !['LicitacoesTab.tsx', 'ImagensDeTexto.tsx', 'RichTextInput.tsx'].includes(f));
ok(leitores.length === 0, 'nenhum outro arquivo desenha o texto das áreas livres (' + leitores.join(', ') + ')');

// ── 2) navegador ──
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
const MONTAR = path.join(SRC, 'zz_teste_b4b_montar.tsx');   // peça provisória, apagada no fim (não vai para o commit)
fs.writeFileSync(MONTAR, "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport function montar(el, node) { createRoot(el).render(node); }\nexport { React };\n");
const limpar = () => { try { fs.unlinkSync(MONTAR); } catch { /* já saiu */ } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { envios: [], assinados: [], publicos: [] };
  const existentes = new Set(['licitacoes/L1/area-livre/1.png', 'crm-docs/L1/nota/5.png']);   // o que "já está" no privado simulado
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = decodeURIComponent(req.url());
    if (!u.includes('supabase.co')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    if (/\/storage\/v1\/object\/public\/acn-media\//.test(u)) { log.publicos.push(u); return req.respond({ status: 200, headers: CORS, body: 'x' }); }
    let m = u.match(/\/storage\/v1\/object\/sign\/acn-privado\/(.+)$/);
    if (m) {
      log.assinados.push(m[1]);
      if (!existentes.has(m[1]) && !log.envios.includes('acn-privado/' + m[1])) return req.respond({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }) });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ signedURL: '/object/sign/acn-privado/' + m[1] + '?token=T' + log.assinados.length }) });
    }
    m = u.match(/\/storage\/v1\/object\/(acn-[a-z]+)\/(.+)$/);
    if (m && req.method() === 'POST') { log.envios.push(m[1] + '/' + m[2]); return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ Key: m[1] + '/' + m[2], Id: 'x' }) }); }
    if (/\/object\/sign\/acn-privado\/.+\?token=/.test(u)) return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: 'x' });
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async (PUB) => {
    const saida = {};
    const esperar = (ms) => new Promise((res) => setTimeout(res, ms));
    const it = await import('/ACN/src/ImagensDeTexto.tsx');
    const rti = await import('/ACN/src/RichTextInput.tsx');

    // 1) hidratar
    const raiz = document.createElement('div'); document.body.appendChild(raiz);
    raiz.innerHTML = '<p>texto <b>forte</b></p>'
      + '<img id="a" data-arquivo="privado:licitacoes/L1/area-livre/1.png">'
      + '<img id="b" src="' + PUB + 'licitacoes/L1/area-livre/2.png">'
      + '<img id="c" src="https://exemplo.com/foto.png">'
      + '<img id="d" src="data:image/png;base64,AAAA">'
      + '<img id="e" data-arquivo="privado:chat/sala1/1_x.pdf">'
      + '<img id="f" src="' + PUB + 'crm-docs/L1/nota/5.png">';
    saida.antes = raiz.innerHTML;
    it.hidratarImagens(raiz);
    await esperar(900);
    const g = (id) => raiz.querySelector('#' + id);
    saida.a = { src: g('a').getAttribute('src'), marca: g('a').getAttribute('data-arquivo') };
    saida.b = { src: g('b').getAttribute('src'), marca: g('b').getAttribute('data-arquivo') };
    saida.c = { src: g('c').getAttribute('src'), marca: g('c').getAttribute('data-arquivo') };
    saida.d = { src: g('d').getAttribute('src'), marca: g('d').getAttribute('data-arquivo') };
    saida.e = { src: g('e').getAttribute('src'), marca: g('e').getAttribute('data-arquivo') };
    saida.f = { src: g('f').getAttribute('src'), marca: g('f').getAttribute('data-arquivo') };

    // 2) limpar ao gravar
    const hidratado = raiz.innerHTML;
    const limpo = it.limparParaGravar(hidratado);
    const d2 = document.createElement('div'); d2.innerHTML = limpo;
    const q = (id) => d2.querySelector('#' + id);
    saida.limpo = { a: [q('a').getAttribute('src'), q('a').getAttribute('data-arquivo')], b: [q('b').getAttribute('src'), q('b').getAttribute('data-arquivo')],
      c: [q('c').getAttribute('src'), q('c').getAttribute('data-arquivo')], d: [q('d').getAttribute('src') && q('d').getAttribute('src').slice(0, 15), q('d').getAttribute('data-arquivo')],
      f: [q('f').getAttribute('src'), q('f').getAttribute('data-arquivo')], negrito: !!d2.querySelector('b') };
    saida.semImagem = it.limparParaGravar('<p>oi <b>x</b></p>') === '<p>oi <b>x</b></p>';
    saida.soDeFora = it.limparParaGravar('<img src="https://exemplo.com/a.png">') === '<img src="https://exemplo.com/a.png">';
    saida.vazio = it.limparParaGravar('') === '';
    // limpar duas vezes dá o mesmo
    saida.idempotente = it.limparParaGravar(limpo) === limpo;

    // 3) o texto limpo passa pelo limpador de HTML e guarda a marca de imagem de texto, mas não a do chat
    const seguro = rti.htmlSeguro(limpo);
    const d3 = document.createElement('div'); d3.innerHTML = seguro;
    const marcasSeguras = [...d3.querySelectorAll('img')].map((i) => i.getAttribute('data-arquivo')).filter(Boolean);
    saida.seguro = { a: marcasSeguras.find((x) => x.startsWith('privado:licitacoes/L1/area-livre/1')) || null, e: marcasSeguras.find((x) => x.startsWith('privado:chat')) || null };
    const malicioso = rti.htmlSeguro('<img data-arquivo="privado:licitacoes/x/area-livre/1.png" onerror="alert(1)"><script>alert(2)</script>');
    saida.malicioso = malicioso;

    // 4) enviar
    const arq = new File(['x'], 'Foto da tela!.PNG', { type: 'image/png' });
    saida.envio = await it.enviarImagemDeTexto(arq, 'licitacoes/L1/area-livre');
    saida.envioCrm = await it.enviarImagemDeTexto(new File(['x'], 'p.jpeg', { type: 'image/jpeg' }), 'crm-docs/L1/nota', 'display:block;');

    // 5) componente de leitura
    const m = await import('/ACN/src/zz_teste_b4b_montar.tsx');
    const el = document.createElement('div'); document.body.appendChild(el);
    m.montar(el, m.React.createElement(it.HtmlComImagens, { html: '<p>nota</p><img data-arquivo="privado:crm-docs/L1/nota/5.png" onerror="window.__xss=1"><script>window.__xss2=1</script>', className: 'zz-leitura' }));
    await esperar(1000);
    const im = el.querySelector('.zz-leitura img');
    saida.leitura = { src: im && im.getAttribute('src'), temScript: !!el.querySelector('script'), onerror: im && im.getAttribute('onerror'), xss: !!(window.__xss || window.__xss2), texto: el.textContent.includes('nota') };
    return saida;
  }, PUBLICO);

  // hidratar
  ok(/acn-privado\/licitacoes\/L1\/area-livre\/1\.png\?token=/.test(r.a.src || '') && r.a.marca === 'privado:licitacoes/L1/area-livre/1.png', 'imagem com marca ganha o endereço assinado (' + JSON.stringify(r.a) + ')');
  ok(r.b.src === PUBLICO + 'licitacoes/L1/area-livre/2.png' && r.b.marca === 'privado:licitacoes/L1/area-livre/2.png', 'endereço público antigo ainda sem cópia: segue abrindo e já ganha a marca (' + JSON.stringify(r.b) + ')');
  ok(/acn-privado\/crm-docs\/L1\/nota\/5\.png\?token=/.test(r.f.src || '') && r.f.marca === 'privado:crm-docs/L1/nota/5.png', 'endereço público antigo já copiado abre pelo privado (' + JSON.stringify(r.f) + ')');
  ok(r.c.src === 'https://exemplo.com/foto.png' && r.c.marca === null, 'imagem da internet fica como está');
  ok(r.d.src === 'data:image/png;base64,AAAA' && r.d.marca === null, 'imagem data: fica como está');
  ok(r.e.src === null && r.e.marca === 'privado:chat/sala1/1_x.pdf' && !log.assinados.some((p) => p.startsWith('chat/')), 'marca que aponta para o chat NÃO é hidratada nem pede endereço');
  // limpar
  ok(r.limpo.a[0] === null && r.limpo.a[1] === 'privado:licitacoes/L1/area-livre/1.png', 'ao gravar, a imagem com endereço assinado fica só com a marca (' + JSON.stringify(r.limpo.a) + ')');
  ok(r.limpo.b[0] === null && r.limpo.b[1] === 'privado:licitacoes/L1/area-livre/2.png', 'ao gravar, o endereço público antigo vira a marca (' + JSON.stringify(r.limpo.b) + ')');
  ok(r.limpo.f[0] === null && r.limpo.f[1] === 'privado:crm-docs/L1/nota/5.png', 'ao gravar, a nota antiga já copiada vira a marca');
  ok(r.limpo.c[0] === 'https://exemplo.com/foto.png' && r.limpo.c[1] === null, 'ao gravar, a imagem da internet continua com o endereço');
  ok(r.limpo.d[0] === 'data:image/png;' && r.limpo.d[1] === null, 'ao gravar, a imagem data: continua como está');
  ok(r.limpo.negrito, 'ao gravar, o resto do texto continua igual');
  ok(r.semImagem && r.soDeFora && r.vazio, 'texto sem imagem nossa sai exatamente igual');
  ok(r.idempotente, 'limpar duas vezes dá o mesmo texto');
  ok(r.seguro.a === 'privado:licitacoes/L1/area-livre/1.png', 'o limpador de HTML mantém a marca de imagem de texto');
  ok(r.seguro.e === null, 'o limpador de HTML tira a marca que aponta para fora das imagens de texto (' + JSON.stringify(r.seguro) + ')');
  ok(!/onerror|<script/i.test(r.malicioso) && /data-arquivo="privado:licitacoes\/x\/area-livre\/1\.png"/.test(r.malicioso), 'o limpador continua tirando script e onerror (' + r.malicioso + ')');
  // enviar
  ok(r.envio.erro === null && /^<img data-arquivo="privado:licitacoes\/L1\/area-livre\/\d+\.png" src="[^"]*token=T/.test(r.envio.html || ''), 'o envio devolve o <img> com a marca e o endereço assinado (' + r.envio.html + ')');
  ok(log.envios.some((e) => /^acn-privado\/licitacoes\/L1\/area-livre\/\d+\.png$/.test(e)), 'a imagem foi ao bucket privado, com extensão limpa (' + log.envios.join(' | ') + ')');
  ok(/display:block;/.test(r.envioCrm.html || '') && /privado:crm-docs\/L1\/nota\/\d+\.jpeg/.test(r.envioCrm.html || ''), 'a nota do CRM mantém o estilo de bloco e a marca');
  ok(!log.envios.some((e) => e.startsWith('acn-media/')), 'nada foi enviado ao bucket público');
  // componente de leitura
  ok(r.leitura.src && /acn-privado\/crm-docs\/L1\/nota\/5\.png\?token=/.test(r.leitura.src) && r.leitura.texto, 'o componente de leitura mostra a imagem pelo endereço assinado e o texto (' + JSON.stringify(r.leitura) + ')');
  ok(!r.leitura.temScript && r.leitura.onerror === null && !r.leitura.xss, 'o componente de leitura não roda script nem onerror');

  await browser.close();
  limpar();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { limpar(); console.error(e); process.exit(1); });
