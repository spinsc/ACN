// Teste da fatia B4 do plano do bucket privado (arquivos das licitações: pastas `licitacoes` e `crm-docs`), 26/11/2026.
// 1) Varredura do código (sem navegador): nenhum envio dessas pastas vai ao bucket público `acn-media`, toda leitura de documento e anexo passa pelo ajudante,
//    (a imagem colada em texto é a fatia B4b e tem o teste_b4b.cjs).
// 2) No navegador, com o armazenamento SIMULADO (nada sai para fora): cada pasta e cada categoria de documento pede o endereço assinado; o documento antigo ainda
//    sem cópia cai no endereço velho; a imagem de texto passa direto; o clique abre a aba com o endereço assinado; o valor novo (`privado:<caminho>`) abre.
// Não monta a tela das licitações (os componentes não são exportados e a tela depende de dezenas de leituras): a tela é conferida pela varredura do código.
// Precisa do servidor de desenvolvimento no ar (porta 5173): NODE_PATH=<pasta com puppeteer-core>/node_modules node ferramentas/migrar_bucket/teste_b4.cjs
const fs = require('fs');
const path = require('path');
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

// ── 1) varredura do código ──
const SRC = path.join(__dirname, '..', '..', 'src');
const lerSrc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').split('\r\n').join('\n');   // os arquivos do projeto têm quebra de linha do Windows
const arquivos = fs.readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const lic = lerSrc('LicitacoesTab.tsx');
const crm = lerSrc('CrmTab.tsx');

// cada envio ao bucket público: o caminho montado logo antes só pode ser de imagem de texto
const achados = [];
for (const f of arquivos) {
  const t = lerSrc(f);
  const re = /from\((['"])acn-media\1\)\.upload/g;
  let mm;
  while ((mm = re.exec(t))) {
    const antes = t.slice(Math.max(0, mm.index - 400), mm.index);
    const ehLic = /`licitacoes\/\$\{[^}]+\}\/(\$\{[^}]+\}|[a-z_-]+)\//.test(antes) || /`crm-docs\/\$\{[^}]+\}\//.test(antes);
    if (ehLic) achados.push(f);
  }
}
ok(achados.length === 0, 'nenhum envio de documento de licitação vai ao bucket público (' + achados.join(', ') + ')');

// Licitações
const up = (lic.match(/async function uploadAnexo[\s\S]*?\n}\n/) || [''])[0];
ok(/enviarArquivoPrivado\(path, file, contentType\)/.test(up), 'uploadAnexo envia pelo ajudante privado');
ok(!/getPublicUrl|from\('acn-media'\)/.test(up), 'uploadAnexo não usa mais o bucket público');
ok((lic.match(/uploadAnexo\(/g) || []).length === 5, 'os 4 pontos de envio de documento seguem chamando uploadAnexo (' + (lic.match(/uploadAnexo\(/g) || []).length + ' ocorrências, 1 é a definição)');
ok(/<LinkDeArquivo valor=\{d\.url\}/.test(lic) && (lic.match(/<LinkDeArquivo valor=\{d\.url\}/g) || []).length === 2, 'os dois quadros de documentos abrem pelo link do ajudante');
ok(/<LinkDeArquivo valor=\{d\.anexo_url\}/.test(lic), 'o anexo do andamento abre pelo link do ajudante');
ok(!/href=\{d\.(url|anexo_url)\}/.test(lic), 'nenhum href direto em url ou anexo_url na tela das licitações');
// CRM (documentos da licitação aberta pelo card)
const sal = (crm.match(/const salvarAbrirDoc = [\s\S]*?\n  \}\);\n/) || [''])[0];
ok(/enviarArquivoPrivado\(path, abrirUploadFile, ct\)/.test(sal), 'o documento anexado pelo CRM vai ao bucket privado');
ok(!/getPublicUrl/.test(sal), 'o envio do documento do CRM não pede mais endereço público');
ok((crm.match(/<LinkDeArquivo valor=\{d\.url\}/g) || []).length === 2, 'as duas listas de documentos do CRM abrem pelo link do ajudante');
ok(!/href=\{d\.url\}/.test(crm), 'nenhum href direto em d.url no CRM');
// ninguém mais lê as colunas de arquivo dos documentos fora dessas telas (Admin só mostra rótulo; Logística só GRAVA uma linha de texto e lê o anexo da cotação, que é de outra tabela)
const leitores = arquivos.filter((f) => /\.(url|anexo_url)\b/.test(lerSrc(f)) && /licitacao_documentos/.test(lerSrc(f)));
ok(leitores.every((f) => ['LicitacoesTab.tsx', 'CrmTab.tsx', 'AdminTab.tsx', 'LogisticaTab.tsx'].includes(f)), 'só as telas conferidas leem url dos documentos (' + leitores.join(', ') + ')');

// ── 2) navegador ──
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
const MONTAR = path.join(SRC, 'zz_teste_b4_montar.tsx');   // peça provisória, apagada no fim (não vai para o commit)
fs.writeFileSync(MONTAR, "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport function montar(el, node) { createRoot(el).render(node); }\nexport { React };\n");
const limpar = () => { try { fs.unlinkSync(MONTAR); } catch { /* já saiu */ } };
const CATEGORIAS = ['edital_anexos', 'erratas', 'impugnacao', 'impugnacao_decisao', 'esclarecimento', 'esclarecimento_resposta', 'recurso', 'recurso_defesa', 'recurso_decisao',
  'processo', 'docs_enviados', 'contratos', 'atestado', 'andamento', 'cotacoes_fornecedores', 'documento'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { assinados: [], publicos: [] };
  const existentes = new Set(['licitacoes/L1/edital_anexos/1_ja_copiado.pdf', 'crm-docs/L1/andamento/2.pdf']);   // o que "já está" no privado simulado
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = decodeURIComponent(req.url());
    if (!u.includes('supabase.co')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    if (/\/storage\/v1\/object\/public\/acn-media\//.test(u)) { log.publicos.push(u); return req.respond({ status: 200, headers: CORS, body: 'x' }); }
    const m = u.match(/\/storage\/v1\/object\/sign\/acn-privado\/(.+)$/);
    if (m) {
      log.assinados.push(m[1]);
      if (!existentes.has(m[1])) return req.respond({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }) });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ signedURL: '/object/sign/acn-privado/' + m[1] + '?token=T' + log.assinados.length }) });
    }
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async (CATS, PUB) => {
    const saida = {};
    const esperar = (ms) => new Promise((res) => setTimeout(res, ms));
    const ap = await import('/ACN/src/ArquivoPrivado.ts');
    saida.copiado = await ap.urlDoArquivo(PUB + 'licitacoes/L1/edital_anexos/1_ja_copiado.pdf');
    saida.semCopia = await ap.urlDoArquivo(PUB + 'licitacoes/L1/edital_anexos/9_ainda_nao.pdf');
    saida.crmDocsCopiado = await ap.urlDoArquivo(PUB + 'crm-docs/L1/andamento/2.pdf');
    saida.valorNovo = await ap.urlDoArquivo('privado:licitacoes/L1/edital_anexos/1_ja_copiado.pdf');
    for (const c of CATS) await ap.urlDoArquivo(PUB + 'licitacoes/L9/' + c + '/1_a.pdf');
    for (const c of ['andamento', 'processo', 'contratos']) await ap.urlDoArquivo(PUB + 'crm-docs/L9/' + c + '/1.pdf');
    // o clique no link abre a aba com o endereço assinado
    const m = await import('/ACN/src/zz_teste_b4_montar.tsx');
    const tela = await import('/ACN/src/ArquivoPrivadoTela.tsx');
    const el = document.createElement('div'); document.body.appendChild(el);
    m.montar(el, m.React.createElement(tela.LinkDeArquivo, { valor: 'privado:licitacoes/L1/edital_anexos/1_ja_copiado.pdf', className: 'zz-link' }, 'edital'));
    await esperar(400);
    const abertas = [];
    window.open = (u) => { const aba = { location: { set href(v) { abertas.push(v); } }, close() {}, opener: null }; abertas.push('abriu:' + u); return aba; };
    el.querySelector('.zz-link').click();
    await esperar(800);
    saida.cliques = abertas;
    return saida;
  }, CATEGORIAS, PUBLICO);

  ok(/acn-privado\/licitacoes\/L1\/edital_anexos\/1_ja_copiado\.pdf\?token=/.test(r.copiado || ''), 'documento de licitação já copiado abre pelo privado (' + r.copiado + ')');
  ok(r.semCopia === PUBLICO + 'licitacoes/L1/edital_anexos/9_ainda_nao.pdf', 'documento ainda sem cópia cai no endereço velho');
  ok(/acn-privado\/crm-docs\/L1\/andamento\/2\.pdf\?token=/.test(r.crmDocsCopiado || ''), 'documento de crm-docs já copiado abre pelo privado');
  ok(/token=T/.test(r.valorNovo || ''), 'valor novo (privado:<caminho>) abre por endereço assinado');
  for (const c of CATEGORIAS) ok(log.assinados.includes('licitacoes/L9/' + c + '/1_a.pdf'), 'a categoria ' + c + ' das licitações é privada (pede o endereço assinado)');
  for (const c of ['andamento', 'processo', 'contratos']) ok(log.assinados.includes('crm-docs/L9/' + c + '/1.pdf'), 'crm-docs/' + c + ' é privado');
  ok(r.cliques.length === 2 && /acn-privado\/licitacoes\/L1\/edital_anexos\/1_ja_copiado\.pdf\?token=/.test(r.cliques[1]), 'o clique abre a aba com o endereço assinado (' + JSON.stringify(r.cliques) + ')');

  await browser.close();
  limpar();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { limpar(); console.error(e); process.exit(1); });
