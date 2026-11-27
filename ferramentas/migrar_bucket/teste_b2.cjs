// Teste da fatia B2 do plano do bucket privado (OP, demandas, Desenvolvimento, tarefas da Engenharia, Análises, Vistoria de pátio e SAC), 26/11/2026.
// 1) Varredura do código (sem navegador): nenhum envio das pastas da B2 vai ao bucket público `acn-media`, e toda leitura de anexo passa pelo ajudante.
// 2) No navegador, com o armazenamento e o banco SIMULADOS (nada sai para fora): o envio do Desenvolvimento vai ao `acn-privado` e grava `privado:<caminho>`;
//    as miniaturas e os links das telas pedem o endereço assinado; o arquivo antigo (ainda no público) cai no endereço velho; `produtos` segue público.
// Precisa do servidor de desenvolvimento no ar (porta 5173): NODE_PATH=<pasta com puppeteer-core>/node_modules node ferramentas/migrar_bucket/teste_b2.cjs
const fs = require('fs');
const path = require('path');
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

// ── 1) varredura do código ──
const SRC = path.join(__dirname, '..', '..', 'src');
const lerSrc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const arquivos = fs.readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const PASTAS_B2 = ['opl-anexos', 'ops-em-criacao', 'demandas-avulsas', 'demandas-cotacoes', 'desenvolvimento', 'engenharia-tarefas', 'analise', 'vistorias', 'sac'];
// cada envio ao bucket público: o caminho montado logo antes não pode ser de pasta da B2
let usosPublicos = 0;
for (const f of arquivos) {
  const t = lerSrc(f);
  const re = /from\((['"])acn-media\1\)|from\(BUCKET(_DOS_ANEXOS)?\)/g;
  let mm;
  while ((mm = re.exec(t))) {
    const antes = t.slice(Math.max(0, mm.index - 500), mm.index);
    for (const p of PASTAS_B2) if (antes.includes('`' + p + '/') || antes.includes("'" + p + '/')) { usosPublicos++; console.log('  achado:', f, '→', p); }
  }
}
ok(usosPublicos === 0, 'nenhum arquivo de código manda pasta da B2 ao bucket público (' + usosPublicos + ' achados)');
// o único `acn-media` que sobra na AnaliseWidget e na FotosVeiculo é a constante, sem uso
for (const f of ['AnaliseWidget.tsx', 'FotosVeiculo.tsx']) ok(!/from\(BUCKET\)/.test(lerSrc(f)), f + ' não usa mais o bucket público');
// quem envia pasta da B2 usa o ajudante privado
for (const f of ['AnaliseWidget.tsx', 'OplAnexosWidget.tsx', 'NovaOpOsModal.tsx', 'SetorDemandaTab.tsx', 'TarefaAnexos.tsx', 'ProdutoArquivos.tsx', 'FormacaoPrecosTab.tsx', 'FotosVeiculo.tsx',
  'DemandaAvulsaPanel.tsx', 'DesenvolvimentoPecasTab.tsx', 'DesenvolvimentoPorta.tsx', 'VistoriasPatio.tsx', 'SacTab.tsx']) {
  ok(/enviarArquivoPrivado\(/.test(lerSrc(f)), f + ' envia pelo ajudante privado');
}
// toda leitura de anexo da B2 passa pelo link ou pela imagem do ajudante
for (const f of ['AnaliseWidget.tsx', 'OplAnexosWidget.tsx', 'NovaOpOsModal.tsx', 'SetorDemandaTab.tsx', 'TarefaAnexos.tsx', 'ProdutoArquivos.tsx', 'FotosVeiculo.tsx', 'DemandaAvulsaPanel.tsx',
  'DesenvolvimentoPecasTab.tsx', 'DesenvolvimentoPorta.tsx', 'DesenvolvimentoFormularios.tsx', 'VistoriasPatio.tsx', 'SacTab.tsx', 'SacResumoOS.tsx', 'AcnTabShared.tsx']) {
  ok(/LinkDeArquivo|ImagemPrivada/.test(lerSrc(f)), f + ' abre anexo pelo ajudante');
}
// nenhum <a href={x.url}> nem <img src={x.url}> direto nos arquivos da B2
const direto = [];
for (const f of ['AnaliseWidget.tsx', 'OplAnexosWidget.tsx', 'NovaOpOsModal.tsx', 'SetorDemandaTab.tsx', 'TarefaAnexos.tsx', 'FotosVeiculo.tsx', 'DemandaAvulsaPanel.tsx', 'DesenvolvimentoPecasTab.tsx',
  'DesenvolvimentoPorta.tsx', 'DesenvolvimentoFormularios.tsx', 'VistoriasPatio.tsx', 'SacTab.tsx', 'SacResumoOS.tsx', 'AcnTabShared.tsx']) {
  lerSrc(f).split('\n').forEach((l, i) => {
    if (/(href|src)=\{[a-z]+\.url\}/.test(l) && !/data:|URL\.createObjectURL/.test(l) && !(f === 'SacTab.tsx' && /assinatura/.test(l))) direto.push(f + ':' + (i + 1));
  });
}
ok(direto.length === 0, 'nenhum href/src direto em coluna de anexo da B2 (' + direto.join(', ') + ')');
// as fotos da Vistoria e do veículo (lista de endereços soltos) também passam pelo ajudante, inclusive no PDF
const vist = lerSrc('VistoriasPatio.tsx');
ok(/urlDoArquivo\(url\)/.test(vist) && /enderecoFoto/.test(vist), 'o PDF da vistoria pede o endereço assinado de cada foto');
ok(!/fetch\(url\)/.test(vist), 'o PDF da vistoria não busca a foto direto pelo valor guardado');
// o que ficou público de propósito: fotos e catálogo dos produtos (vão na proposta ao cliente)
ok(/from\('acn-media'\)\.upload\(path, file, \{ upsert: (false|true) \}\)/.test(lerSrc('CadastroProdutosTab.tsx')), 'CadastroProdutosTab segue enviando ao público (decisão do usuário)');

// ── 2) navegador ──
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
const MONTAR = path.join(SRC, 'zz_teste_b2_montar.tsx');   // peça provisória, apagada no fim (não vai para o commit)
fs.writeFileSync(MONTAR, "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport function montar(el, node) { createRoot(el).render(node); }\nexport { React };\n");
const limpar = () => { try { fs.unlinkSync(MONTAR); } catch { /* já saiu */ } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { envios: [], assinados: [], gravacoes: [], publicos: [] };
  const existentes = new Set(['opl-anexos/OP1/ja_copiado.pdf', 'ops-em-criacao/foto1.png', 'vistorias/saida_1.png']);   // o que "já está" no privado simulado
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
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async () => {
    const arq = (nome, tipo = 'application/pdf') => new File(['conteudo'], nome, { type: tipo });
    const saida = {};
    const porta = await import('/ACN/src/DesenvolvimentoPorta.tsx');
    saida.desenv = await porta.enviarArquivos('D1', 'Etapa Um', 'E1', [arq('Desenho ç.pdf')], { nome: 'Teste' });
    const ap = await import('/ACN/src/ArquivoPrivado.ts');
    const pub = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';
    saida.opCopiado = await ap.urlDoArquivo(pub + 'opl-anexos/OP1/ja_copiado.pdf');
    saida.opSemCopia = await ap.urlDoArquivo(pub + 'opl-anexos/OP2/1_x.pdf');
    saida.demandaSemCopia = await ap.urlDoArquivo(pub + 'demandas-avulsas/d1/1_x.pdf');
    saida.sacFotoSemCopia = await ap.urlDoArquivo(pub + 'sac/os_1/entrada/1_f.jpg');
    saida.produtoFoto = await ap.urlDoArquivo(pub + 'produtos/p1/fotos/1.jpg');
    saida.produtoProjeto = await ap.urlDoArquivo(pub + 'produtos/p1/projeto/1_x.dwg');
    saida.valorNovo = await ap.urlDoArquivo('privado:ops-em-criacao/foto1.png');
    // cada pasta da B2 tem de pedir o endereço assinado (é privada); o que não foi copiado cai no velho
    for (const p of ['opl-anexos', 'ops-em-criacao', 'demandas-avulsas', 'demandas-cotacoes', 'desenvolvimento', 'engenharia-tarefas', 'analise', 'vistorias', 'sac']) await ap.urlDoArquivo(pub + p + '/pasta-x/1_arq.pdf');
    saida.vistoriaCopiada = await ap.urlDoArquivo(pub + 'vistorias/saida_1.png');
    // tela de verdade: as miniaturas das fotos do carro e um link de anexo, com o clique abrindo o endereço assinado
    const m = await import('/ACN/src/zz_teste_b2_montar.tsx');
    const fv = await import('/ACN/src/FotosVeiculo.tsx');
    const tela = await import('/ACN/src/ArquivoPrivadoTela.tsx');
    const el = document.createElement('div'); el.id = 'zz'; document.body.appendChild(el);
    const R = m.React;
    m.montar(el, R.createElement('div', null,
      R.createElement(fv.FotosVeiculoVer, { fotos: [{ url: 'privado:ops-em-criacao/foto1.png', nome: 'foto1' }], tamanho: 72 }),
      R.createElement(tela.LinkDeArquivo, { valor: 'privado:opl-anexos/OP1/ja_copiado.pdf', className: 'zz-link' }, 'anexo da OP')));
    await new Promise((res) => setTimeout(res, 800));
    const img = el.querySelector('img');
    saida.img = img ? { src: img.getAttribute('src'), width: img.getAttribute('width') } : null;
    const abertas = [];
    window.open = (u) => { const aba = { location: { set href(v) { abertas.push(v); } }, close() {}, opener: null }; abertas.push('abriu:' + u); return aba; };
    el.querySelector('.zz-link').click();
    await new Promise((res) => setTimeout(res, 800));
    saida.cliques = abertas;
    return saida;
  });

  ok(r.desenv.falhas.length === 0 && r.desenv.enviados.length === 1 && /^privado:desenvolvimento\/D1\/Etapa_Um\/E1\/\d+_0_Desenho_c\.pdf$/.test(r.desenv.enviados[0].url), 'desenvolvimento: guarda privado:<caminho> (' + JSON.stringify(r.desenv) + ')');
  ok(log.envios.some((e) => /^acn-privado\/desenvolvimento\/D1\//.test(e)), 'desenvolvimento: foi ao bucket privado (' + log.envios.join(' | ') + ')');
  ok(!log.envios.some((e) => e.startsWith('acn-media/')), 'nada foi enviado ao bucket público');
  ok(/acn-privado\/opl-anexos\/OP1\/ja_copiado\.pdf\?token=/.test(r.opCopiado || ''), 'anexo antigo de OP já copiado abre pelo privado (' + r.opCopiado + ')');
  ok(r.opSemCopia === PUBLICO + 'opl-anexos/OP2/1_x.pdf', 'anexo antigo de OP ainda sem cópia cai no endereço velho');
  ok(r.demandaSemCopia === PUBLICO + 'demandas-avulsas/d1/1_x.pdf', 'anexo antigo de demanda sem cópia cai no endereço velho');
  ok(r.sacFotoSemCopia === PUBLICO + 'sac/os_1/entrada/1_f.jpg', 'foto antiga do SAC sem cópia cai no endereço velho');
  ok(log.assinados.some((p) => p === 'sac/os_1/entrada/1_f.jpg'), 'a foto do SAC passou a pedir o endereço assinado (é privada)');
  ok(r.produtoFoto === PUBLICO + 'produtos/p1/fotos/1.jpg' && !log.assinados.some((p) => p.includes('/fotos/')), 'foto de produto fica pública, sem pedir endereço assinado');
  ok(log.assinados.some((p) => p.includes('produtos/p1/projeto/')), 'arquivo de projeto do produto é privado');
  ok(/token=T/.test(r.valorNovo || ''), 'valor novo abre por endereço assinado');
  for (const p of ['opl-anexos', 'ops-em-criacao', 'demandas-avulsas', 'demandas-cotacoes', 'desenvolvimento', 'engenharia-tarefas', 'analise', 'vistorias', 'sac']) ok(log.assinados.includes(p + '/pasta-x/1_arq.pdf'), 'a pasta ' + p + ' é privada (pede o endereço assinado)');
  ok(/acn-privado\/vistorias\/saida_1\.png\?token=/.test(r.vistoriaCopiada || ''), 'foto antiga da vistoria já copiada abre pelo privado');
  ok(r.img && /acn-privado\/ops-em-criacao\/foto1\.png\?token=/.test(r.img.src || '') && r.img.width === '72', 'a miniatura da foto do carro usa o endereço assinado e mantém o tamanho (' + JSON.stringify(r.img) + ')');
  ok(r.cliques.length === 2 && /acn-privado\/opl-anexos\/OP1\/ja_copiado\.pdf\?token=/.test(r.cliques[1]), 'o clique no anexo abre a aba com o endereço assinado (' + JSON.stringify(r.cliques) + ')');

  await browser.close();
  limpar();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { limpar(); console.error(e); process.exit(1); });
