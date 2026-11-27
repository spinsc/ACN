// Teste da fatia B1 do plano do bucket privado (Compras, Logística, Financeiro, Viagens, Serviços de terceiros, contratos-padrão), 26/11/2026.
// 1) Varredura do código (sem navegador): nenhum envio das pastas da B1 pode ir ao bucket público `acn-media`.
// 2) No navegador, com o armazenamento e o banco SIMULADOS (nada sai para fora): as funções de envio exportadas mandam o arquivo ao `acn-privado`, gravam `privado:<caminho>`
//    no banco, e o clique no link abre o arquivo pelo endereço assinado (e o arquivo antigo, ainda no público, cai no endereço velho).
// Precisa do servidor de desenvolvimento no ar (porta 5173): NODE_PATH=<pasta com puppeteer-core>/node_modules node ferramentas/migrar_bucket/teste_b1.cjs
const fs = require('fs');
const path = require('path');
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };

// ── 1) varredura do código ──
const PASTAS_B1 = ['compras-anexos', 'pcp-cotacoes', 'pcp-nf-fornecedor', 'pcp-fretes-cotacoes', 'pcp-fretes-canhotos', 'centro-custo-despesas', 'financeiro-tarefas', 'contratos-padrao'];
const SRC = path.join(__dirname, '..', '..', 'src');
const arquivos = fs.readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
let usosPublicos = 0;
for (const f of arquivos) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf8');
  // trechos que sobem ao bucket público (upload ou endereço público)
  const publico = /from\((['"])acn-media\1\)|from\(BUCKET(_DOS_ANEXOS)?\)/.test(t);
  if (!publico) continue;
  // cada envio ao bucket público: o caminho montado logo antes não pode ser de pasta da B1 (exceto a área livre)
  const re2 = /from\((['"])acn-media\1\)|from\(BUCKET(_DOS_ANEXOS)?\)/g;
  let mm;
  while ((mm = re2.exec(t))) {
    const antes = t.slice(Math.max(0, mm.index - 700), mm.index);
    for (const p of PASTAS_B1) if (antes.slice(-400).includes(p + '/')) { usosPublicos++; console.log('  achado:', f, '→', p); }
  }
  // pastas dinâmicas: logística e viagens
  for (const p of ['`logistica/', '`viagens/', "'logistica/", "'viagens/"]) {
    if (t.includes(p) && !/enviarArquivoPrivado/.test(t)) { usosPublicos++; console.log('  achado:', f, '→', p); }
  }
}
ok(usosPublicos === 0, 'nenhum arquivo de código manda pasta da B1 ao bucket público (' + usosPublicos + ' achados)');
// os arquivos que enviam a pasta da B1 usam o ajudante privado
for (const f of ['ComprasFluxo.tsx', 'ComprasTab.tsx', 'FinanceiroTab.tsx', 'LogisticaTab.tsx', 'DespesaAnexos.tsx', 'FinanceiroKanban.tsx', 'ViagemProvisionamento.tsx', 'ViagemComprovantes.ts', 'TerceirosServicos.ts', 'AdminTab.tsx']) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf8');
  ok(/enviarArquivoPrivado/.test(t), f + ' envia pelo ajudante privado');
}
// toda leitura de anexo da B1 passa pelo link do ajudante
for (const f of ['ComprasFluxo.tsx', 'ComprasTab.tsx', 'FinanceiroTab.tsx', 'LogisticaTab.tsx', 'DespesaAnexos.tsx', 'FinanceiroKanban.tsx', 'ViagemProvisionamento.tsx', 'ViagemFechamento.tsx', 'AdminTab.tsx', 'TerceirosOrdemModal.tsx', 'TerceirosOrdemPassos.tsx', 'TerceirosServicoModal.tsx', 'MinhasSolicitacoesTab.tsx']) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf8');
  ok(/LinkDeArquivo/.test(t), f + ' abre anexo pelo LinkDeArquivo');
}
const sobrando = ['anexo_url', 'arquivo_url', 'canhoto_url', 'nf_fornecedor_url'].filter((c) => arquivos.some((f) => new RegExp('href=\\{[^}]*' + c).test(fs.readFileSync(path.join(SRC, f), 'utf8')) && !/Licit|CrmTab/.test(f)));
ok(sobrando.length === 0, 'nenhum href direto nas colunas de anexo da B1 (' + sobrando + ')');

// ── 2) navegador ──
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const PUBLICO = 'https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const log = { envios: [], assinados: [], gravacoes: [], publicos: [], outros: [] };
  const existentes = new Set(['compras-anexos/PC1/ja_copiado.pdf']);   // o que "já está" no privado simulado
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      log.gravacoes.push(req.method() + ' ' + u + ' ' + (req.postData() || ''));
      return req.respond({ status: 201, headers: { ...CORS, 'content-type': 'application/json' }, body: '[{"id":"novo"}]' });
    }
    log.outros.push(req.method() + ' ' + u);
    return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '[]' });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const r = await page.evaluate(async () => {
    const arq = (nome, tipo = 'application/pdf') => new File(['conteudo'], nome, { type: tipo });
    const saida = {};
    const compras = await import('/ACN/src/ComprasFluxo.tsx');
    saida.compras = await compras.enviarAnexosCompra('PC1', [arq('Nota Fiscal ç.pdf')], { email: 'a@b.c', nome: 'Teste' });
    const despesa = await import('/ACN/src/DespesaAnexos.tsx');
    saida.despesa = await despesa.enviarAnexosDespesa(['D1', 'D2'], [arq('recibo.pdf')], { email: 'a@b.c', nome: 'Teste' });
    const prov = await import('/ACN/src/ViagemProvisionamento.tsx');
    saida.contrato = await prov.anexarContrato({ id: 'V1', contrato_anexos: [] }, [arq('contrato.pdf')], { nome: 'Teste' });
    const comp = await import('/ACN/src/ViagemComprovantes.ts');
    saida.comprovante = await comp.anexarComprovante({ id: 'V1', comprovantes: [] }, 'hotel', [arq('hotel.pdf')], { nome: 'Teste' });
    const terc = await import('/ACN/src/TerceirosServicos.ts');
    saida.terceiros = await terc.enviarAnexos([arq('desenho.pdf')], 'terceiros/pasta-1');
    saida.enderecoTerceiros = terc.enderecoDoAnexo('terceiros/pasta-1/x.pdf');
    const ap = await import('/ACN/src/ArquivoPrivado.ts');
    saida.novoAssinado = await ap.urlDoArquivo('privado:compras-anexos/PC1/ja_copiado.pdf');
    saida.antigoCopiado = await ap.urlDoArquivo('https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/compras-anexos/PC1/ja_copiado.pdf');
    saida.antigoSemCopia = await ap.urlDoArquivo('https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/pcp-nf-fornecedor/1_x.pdf');
    saida.areaLivre = await ap.urlDoArquivo('https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/public/acn-media/pcp-cotacoes/c1/area-livre/1.png');
    return saida;
  });

  ok(Array.isArray(r.compras) && r.compras.length === 0, 'compras: sem erro (' + JSON.stringify(r.compras) + ')');
  ok(log.envios.some((e) => /^acn-privado\/compras-anexos\/PC1\/\d+_Nota_Fiscal_c\.pdf$/.test(e)), 'compras: foi ao bucket privado (' + log.envios.join(' | ') + ')');
  ok(Array.isArray(r.despesa) && r.despesa.length === 0, 'despesa: sem erro (' + JSON.stringify(r.despesa) + ')');
  ok(log.envios.some((e) => /^acn-privado\/centro-custo-despesas\/D1\/\d+_recibo\.pdf$/.test(e)), 'despesa: foi ao bucket privado');
  ok(r.contrato.lista.length === 1 && /^privado:viagens\/V1\/contrato\//.test(r.contrato.lista[0].url) && !r.contrato.erro, 'contrato da viagem guarda privado:<caminho> (' + JSON.stringify(r.contrato) + ')');
  ok(r.comprovante.lista.length === 1 && /^privado:viagens\/V1\/comprovantes\/hotel\//.test(r.comprovante.lista[0].url), 'comprovante da viagem guarda privado:<caminho>');
  ok(r.terceiros.anexos.length === 1 && /^terceiros\/pasta-1\//.test(r.terceiros.anexos[0].caminho) && r.terceiros.erros.length === 0, 'terceiros: o banco continua guardando só o caminho (' + JSON.stringify(r.terceiros) + ')');
  ok(log.envios.some((e) => /^acn-privado\/terceiros\/pasta-1\//.test(e)), 'terceiros: foi ao bucket privado');
  ok(!log.envios.some((e) => e.startsWith('acn-media/')), 'nada foi enviado ao bucket público (' + log.envios.filter((e) => e.startsWith('acn-media/')) + ')');
  const gravou = log.gravacoes.join('\n');
  ok(/privado:compras-anexos\/PC1\//.test(gravou), 'o registro do anexo de compras guarda privado:');
  ok(/privado:centro-custo-despesas\/D1\//.test(gravou) && !/object\/public/.test(gravou), 'o registro da despesa guarda privado: e nenhum endereço público');
  ok(/token=T/.test(r.novoAssinado || ''), 'valor novo abre por endereço assinado');
  ok(/acn-privado\/compras-anexos\/PC1\/ja_copiado\.pdf\?token=/.test(r.antigoCopiado || ''), 'endereço antigo já copiado abre pelo privado (' + r.antigoCopiado + ')');
  ok(r.antigoSemCopia === PUBLICO + 'pcp-nf-fornecedor/1_x.pdf', 'endereço antigo ainda sem cópia cai no endereço velho (' + r.antigoSemCopia + ')');
  ok(r.areaLivre === PUBLICO + 'pcp-cotacoes/c1/area-livre/1.png' && log.assinados.includes('pcp-cotacoes/c1/area-livre/1.png'), 'imagem de área livre (B4b) pede o endereço assinado e, sem cópia, cai no velho');
  ok(r.enderecoTerceiros === PUBLICO + 'terceiros/pasta-1/x.pdf', 'o endereço montado para terceiros é o antigo (o link tenta o privado antes)');

  await browser.close();
  console.log(total + ' conferências, ' + falhas + ' falhas');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
