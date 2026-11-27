// Teste da fatia B3 do plano do bucket privado (documentos e imagens anexados ao card do CRM, pasta `crm-anexos`), 26/11/2026.
// 1) Varredura do código (sem navegador): nenhum envio da pasta vai ao bucket público `acn-media` e toda leitura de anexo passa pelo ajudante.
// 2) No navegador, com o armazenamento e o banco SIMULADOS (nada sai para fora): o widget do card envia ao `acn-privado` e grava `privado:<caminho>`;
//    a lista mostra miniatura e link pelo endereço assinado; o anexo antigo sem cópia cai no endereço velho; remover um anexo privado só desliga a ligação
//    (o navegador não apaga arquivo do privado), e remover um antigo ainda apaga do público como sempre.
// Precisa do servidor de desenvolvimento no ar (porta 5173): NODE_PATH=<pasta com puppeteer-core>/node_modules node ferramentas/migrar_bucket/teste_b3.cjs
const fs = require('fs');
const path = require('path');
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

// ── 1) varredura do código ──
const SRC = path.join(__dirname, '..', '..', 'src');
const lerSrc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const arquivos = fs.readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
let usosPublicos = 0;
for (const f of arquivos) {
  const t = lerSrc(f);
  const re = /from\((['"])acn-media\1\)|from\(BUCKET(_DOS_ANEXOS)?\)/g;
  let mm;
  while ((mm = re.exec(t))) {
    const antes = t.slice(Math.max(0, mm.index - 500), mm.index);
    if (antes.includes('`crm-anexos/') || antes.includes("'crm-anexos/")) { usosPublicos++; console.log('  achado:', f); }
  }
}
ok(usosPublicos === 0, 'nenhum arquivo de código manda a pasta crm-anexos ao bucket público (' + usosPublicos + ' achados)');
const w = lerSrc('CrmAnexosWidget.tsx');
ok(/enviarArquivoPrivado\(/.test(w), 'o widget do card envia pelo ajudante privado');
ok(!/getPublicUrl/.test(w), 'o widget não pede mais endereço público');
ok(!/\.upload\(/.test(w), 'o widget não envia direto ao armazenamento');
ok(/LinkDeArquivo/.test(w) && /ImagemPrivada/.test(w), 'o widget abre anexo pelo link e pela imagem do ajudante');
ok(!/(href|src)=\{[a-z]+\.url\}/.test(w), 'nenhum href/src direto em coluna de anexo do widget');
ok(/startsWith\('privado:'\)/.test(w), 'a remoção só apaga do armazenamento o que ainda é endereço público antigo');
// ninguém mais lê a tabela de anexos do CRM para mostrar link (só o widget, a contagem e o painel de dados do Admin, que mostra rótulos)
const leitores = arquivos.filter((f) => /from\(['"]crm_anexos['"]\)/.test(lerSrc(f)));
ok(leitores.length === 1 && leitores[0] === 'CrmAnexosWidget.tsx', 'só o widget lê crm_anexos (' + leitores.join(', ') + ')');
// a pasta dos documentos das licitações NÃO é desta fatia: segue como estava
ok(/crm-docs\//.test(lerSrc('CrmTab.tsx')), 'crm-docs (licitações) segue onde estava, é da B4');

// ── 2) navegador ──
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
const MONTAR = path.join(SRC, 'zz_teste_b3_montar.tsx');   // peça provisória, apagada no fim (não vai para o commit)
fs.writeFileSync(MONTAR, "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport function montar(el, node) { createRoot(el).render(node); }\nexport { React };\n");
const limpar = () => { try { fs.unlinkSync(MONTAR); } catch { /* já saiu */ } };

const LINHAS = [
  { id: 'a1', oportunidade_id: 'O1', tipo: 'edital', nome: 'edital.pdf', url: 'privado:crm-anexos/O1/1_edital.pdf', tamanho: 1000, mime_type: 'application/pdf', criado_por: 'Teste', criado_em: '2026-11-26T10:00:00Z' },
  { id: 'a2', oportunidade_id: 'O1', tipo: 'foto', nome: 'foto.png', url: 'privado:crm-anexos/O1/2_foto.png', tamanho: 2000, mime_type: 'image/png', criado_por: 'Teste', criado_em: '2026-11-26T10:01:00Z' },
  { id: 'a3', oportunidade_id: 'O1', tipo: 'contrato', nome: 'antigo.docx', url: PUBLICO + 'crm-anexos/O1/3_antigo.docx', tamanho: 3000, mime_type: 'application/octet-stream', criado_por: 'Teste', criado_em: '2026-11-25T10:00:00Z' },
  { id: 'a4', oportunidade_id: 'O1', tipo: 'foto', nome: 'antiga.jpg', url: PUBLICO + 'crm-anexos/O1/4_antiga.jpg', tamanho: 4000, mime_type: 'image/jpeg', criado_por: 'Teste', criado_em: '2026-11-25T10:01:00Z' },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { envios: [], assinados: [], gravacoes: [], publicos: [] };
  const existentes = new Set(['crm-anexos/O1/1_edital.pdf', 'crm-anexos/O1/2_foto.png']);   // o que "já está" no privado simulado
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      log.gravacoes.push(req.method() + ' ' + u + ' ' + (req.postData() || ''));
      return req.respond({ status: 201, headers: { ...CORS, 'content-type': 'application/json' }, body: '[{"id":"novo"}]' });
    }
    if (/\/rest\/v1\/crm_anexos/.test(u)) {
      if (req.method() === 'HEAD') return req.respond({ status: 200, headers: { ...CORS, 'content-range': '0-3/4' }, body: '' });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(LINHAS) });
    }
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async () => {
    const saida = {};
    const esperar = (ms) => new Promise((res) => setTimeout(res, ms));
    const alertas = []; window.alert = (t) => alertas.push(String(t));
    const m = await import('/ACN/src/zz_teste_b3_montar.tsx');
    const W = await import('/ACN/src/CrmAnexosWidget.tsx');
    const el = document.createElement('div'); el.id = 'zz'; document.body.appendChild(el);
    m.montar(el, m.React.createElement(W.default, { op: { id: 'O1', titulo: 'Card de teste' }, currentUser: { nome: 'Teste' } }));
    await esperar(600);
    el.querySelector('.acn-anx-contagem').click();
    await esperar(1500);
    const itens = [...document.querySelectorAll('.acn-anx-item')];
    saida.nItens = itens.length;
    saida.imgs = [...document.querySelectorAll('.acn-anx-img')].map((i) => i.getAttribute('src'));
    saida.hrefs = [...document.querySelectorAll('.acn-anx-item a')].map((a) => a.getAttribute('href'));
    // clique em "Abrir" do edital (privado)
    const abertas = [];
    window.open = (u) => { const aba = { location: { set href(v) { abertas.push(v); } }, close() {}, opener: null }; abertas.push('abriu:' + u); return aba; };
    [...itens[0].querySelectorAll('a')].find((a) => a.textContent.trim() === 'Abrir').click();
    await esperar(800);
    saida.cliqueEdital = abertas.slice();
    // envio de um arquivo novo
    const input = document.querySelector('.acn-anx-upload input[type=file]');
    const dt = new DataTransfer(); dt.items.add(new File(['conteudo'], 'Proposta ç final.pdf', { type: 'application/pdf' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    await esperar(1500);
    saida.alertas = alertas.slice();
    // remover o anexo privado (edital)
    const confirmarClicando = async () => { await esperar(300); const b = document.querySelector('.acn-dialogo-btn:not(.secundario)'); if (b) b.click(); await esperar(800); return !!b; };
    document.querySelectorAll('.acn-anx-item')[0].querySelector('button[aria-label="Remover arquivo"]').click();
    saida.confirmouPrivado = await confirmarClicando();
    // remover o anexo antigo (docx, ainda no endereço público)
    document.querySelectorAll('.acn-anx-item')[2].querySelector('button[aria-label="Remover arquivo"]').click();
    saida.confirmouAntigo = await confirmarClicando();
    return saida;
  });

  ok(r.nItens === 4, 'a lista mostra os 4 anexos (' + r.nItens + ')');
  ok(r.imgs.length === 2, 'as duas imagens têm miniatura (' + r.imgs.length + ')');
  ok(/acn-privado\/crm-anexos\/O1\/2_foto\.png\?token=/.test(r.imgs[0] || ''), 'a miniatura da foto privada usa o endereço assinado (' + r.imgs[0] + ')');
  ok((r.imgs[1] || '') === PUBLICO + 'crm-anexos/O1/4_antiga.jpg', 'a miniatura da foto antiga sem cópia cai no endereço velho (' + r.imgs[1] + ')');
  ok(r.hrefs.every((h) => h === '#'), 'os links da lista não levam o endereço do arquivo na página (' + JSON.stringify(r.hrefs) + ')');
  ok(r.cliqueEdital.length === 2 && /acn-privado\/crm-anexos\/O1\/1_edital\.pdf\?token=/.test(r.cliqueEdital[1]), 'o clique em Abrir abre a aba com o endereço assinado (' + JSON.stringify(r.cliqueEdital) + ')');
  ok(log.assinados.includes('crm-anexos/O1/4_antiga.jpg'), 'a foto antiga também passou a pedir o endereço assinado (a pasta é privada)');
  ok(log.envios.some((e) => /^acn-privado\/crm-anexos\/O1\/\d+_Proposta_final\.pdf$/.test(e)), 'o envio novo foi ao bucket privado, com nome seguro (' + log.envios.join(' | ') + ')');
  ok(!log.envios.some((e) => e.startsWith('acn-media/')), 'nada foi enviado ao bucket público');
  const ins = log.gravacoes.filter((g) => /^POST .*\/rest\/v1\/crm_anexos/.test(g));
  ok(ins.length === 1 && /"url":"privado:crm-anexos\/O1\/\d+_Proposta_final\.pdf"/.test(ins[0]) && /"nome":"Proposta ç final\.pdf"/.test(ins[0]), 'a linha do anexo guarda privado:<caminho> e o nome original (' + ins.join(' | ') + ')');
  ok(r.alertas.length === 0, 'o envio não gerou aviso de falha (' + JSON.stringify(r.alertas) + ')');
  ok(r.confirmouPrivado && r.confirmouAntigo, 'as duas remoções pediram confirmação');
  const dels = log.gravacoes.filter((g) => /^DELETE /.test(g));
  const delLinhas = dels.filter((g) => /\/rest\/v1\/crm_anexos/.test(g));
  const delArquivos = dels.filter((g) => /\/storage\/v1\/object\/acn-media/.test(g));
  const delPrivado = dels.filter((g) => /\/storage\/v1\/object\/acn-privado/.test(g));
  ok(delLinhas.length === 2 && /id=eq\.a1/.test(delLinhas[0]) && /id=eq\.a3/.test(delLinhas[1]), 'as duas ligações foram desligadas (' + delLinhas.join(' | ') + ')');
  ok(delPrivado.length === 0, 'o navegador não tenta apagar arquivo do bucket privado');
  ok(delArquivos.length === 1 && /crm-anexos\/O1\/3_antigo\.docx/.test(delArquivos[0]), 'o anexo antigo ainda é apagado do público (' + delArquivos.join(' | ') + ')');

  await browser.close();
  limpar();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { limpar(); console.error(e); process.exit(1); });
