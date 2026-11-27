// Teste das duas páginas do cliente (Etapa 17, onda 5a) com as funções do banco SIMULADAS: confere o que cada página pede e como mostra a resposta.
// Nenhum pedido sai para o banco: tudo o que é do Supabase é respondido aqui; pedido a tabela é registrado como "indevido".
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173/ACN/';
const TOKEN = '11111111-1111-1111-1111-111111111111';
const CHASSI = 'TESTE000000000001';
let total = 0, falhas = 0;
const ok = (c, m) => { total++; if (!c) { falhas++; console.log('  FALHA:', m); } };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const esperar = ms => new Promise(r => setTimeout(r, ms));

const VEICULO = { chassi: CHASSI, placa: 'ABC1D23', modelo: 'Van Teste', orgao_cliente: 'ORGAO', opl_numero: 'A 1', data_entrega: '2026-01-10', data_fim_garantia: '2099-01-01', manual_pdf_url: null };

async function abrir(url, respostas) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const log = { rpc: [], rest: [], indevidos: [], dialogs: [] };
  page.on('dialog', d => { log.dialogs.push(d.message()); d.accept(); });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (!u.includes('supabase.co')) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS });
    const m = u.match(/\/rest\/v1\/rpc\/([a-z_]+)/);
    if (m) {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      log.rpc.push({ fn: m[1], body });
      const r = respostas[m[1]]; const resp = typeof r === 'function' ? r(body) : r;
      if (resp === undefined) return req.respond({ status: 404, headers: { ...CORS, 'content-type': 'application/json' }, body: '{}' });
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(resp) });
    }
    if (u.includes('/rest/v1/configuracoes_sistema')) {
      log.rest.push(decodeURIComponent(u));
      return req.respond({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify([{ chave: 'nfc_nome_empresa', valor: 'ACN Teste' }, { chave: 'nfc_endereco_maps', valor: 'ACN+Sinal+Verde' }]) });
    }
    log.indevidos.push(req.method() + ' ' + decodeURIComponent(u));
    return req.abort();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  return { browser, page, log };
}

(async () => {
  // ───────── portal.html ─────────
  console.log('portal.html — o veículo e os chamados pelo token');
  let t = await abrir(BASE + 'portal.html?token=' + TOKEN, {
    portal_veiculo_por_token: { veiculo: VEICULO, chamados: [{ created_at: '2026-11-01T10:00:00Z', nome_solicitante: '<img src=x onerror=window.__xss=1>', status: 'Aberto', descricao_defeito: 'Luz queimada', notas_atendimento: null, atendido_por: null }] },
    portal_abrir_chamado: { ok: true },
  });
  ok(t.log.rpc.some(r => r.fn === 'portal_veiculo_por_token' && r.body.p_token === TOKEN), 'pede o veículo pelo token');
  ok((await t.page.$eval('#v-modelo', e => e.textContent)) === 'Van Teste', 'mostra o modelo');
  ok((await t.page.$eval('#conteudo', e => e.style.display)) === '', 'mostra o conteúdo');
  const lista = await t.page.$eval('#lista-chamados', e => e.innerHTML);
  ok(lista.includes('&lt;img') && !lista.includes('<img src=x'), 'chamado escapado na lista');
  ok(!(await t.page.evaluate(() => window.__xss)), 'nenhum script de chamado rodou');
  ok(t.log.indevidos.length === 0, 'nenhum pedido a tabela: ' + t.log.indevidos.join(' | '));
  ok(t.log.rest.every(u => !u.includes('nfc_pin_global')), 'não pede o PIN global');
  await t.page.evaluate(() => abrirModal());
  await t.page.type('#f-nome', 'Maria Teste');
  await t.page.type('#f-tel', '48999998888');
  await t.page.type('#f-desc', 'A luz da barra não acende');
  await t.page.click('#btn-enviar');
  await esperar(500);
  const envio = t.log.rpc.find(r => r.fn === 'portal_abrir_chamado');
  ok(envio && envio.body.p_token === TOKEN && envio.body.p_chassi === null && envio.body.p_nome === 'Maria Teste' && /\(48\) 99999-8888/.test(envio.body.p_telefone) && envio.body.p_descricao.includes('barra'), 'abre o chamado pela função, com o token: ' + JSON.stringify(envio));
  ok((await t.page.$eval('#msg-form', e => e.textContent)).includes('Chamado enviado'), 'mostra o aviso de sucesso');
  ok(!('veiculo_id' in (envio ? envio.body : {})) && !('status' in (envio ? envio.body : {})), 'não manda veiculo_id nem status (o servidor decide)');
  await t.browser.close();

  t = await abrir(BASE + 'portal.html?token=' + TOKEN, {
    portal_veiculo_por_token: { veiculo: VEICULO, chamados: [] },
    portal_abrir_chamado: { ok: false, erro: 'Já recebemos vários chamados deste veículo na última hora.' },
  });
  await t.page.evaluate(() => abrirModal());
  await t.page.type('#f-nome', 'Maria Teste'); await t.page.type('#f-tel', '48999998888'); await t.page.type('#f-desc', 'A luz da barra não acende');
  await t.page.click('#btn-enviar'); await esperar(500);
  ok((await t.page.$eval('#msg-form', e => e.textContent)).includes('vários chamados'), 'mostra o motivo da recusa do servidor');
  await t.browser.close();

  t = await abrir(BASE + 'portal.html?token=' + TOKEN, { portal_veiculo_por_token: null });
  ok((await t.page.$eval('#error', e => e.style.display)) === '', 'token que não acha veículo mostra o erro');
  await t.browser.close();
  t = await abrir(BASE + 'portal.html', {});
  ok((await t.page.$eval('#error', e => e.style.display)) === '', 'sem token mostra o erro');
  ok(t.log.rpc.length === 0, 'sem token não chama o banco');
  await t.browser.close();

  // ───────── veiculo.html ─────────
  console.log('veiculo.html — a parte aberta, o PIN e o chamado');
  const respV = (extra) => ({ nfc_veiculo_por_chassi: { veiculo: VEICULO }, ...extra });
  t = await abrir(BASE + 'veiculo.html?chassi=' + CHASSI, respV({ nfc_area_restrita: b => b.p_pin === 'certo' ? { ok: true, opl_numero: 'A 1444', servicos: [{ item_servico: '<b>Barra</b>', categoria: 'CAT', descricao_tecnica: '<script>window.__xss2=1</script>' }], chamados: [{ created_at: '2026-11-01T10:00:00Z', nome_solicitante: '<img src=x onerror=window.__xss3=1>', contato_telefone: '(48) 99999-9999', status: 'Aberto', descricao_defeito: 'Teste' }] } : (b.p_pin === 'trava' ? { ok: false, motivo: 'bloqueado', ate: '2099-01-01T00:00:00Z' } : { ok: false, motivo: 'pin', restantes: 4 }), portal_abrir_chamado: { ok: true } }));
  ok(t.log.rpc.some(r => r.fn === 'nfc_veiculo_por_chassi' && r.body.p_chassi === CHASSI), 'pede o veículo pelo chassi');
  ok((await t.page.$eval('#app', e => e.textContent)).includes('Van Teste'), 'mostra o modelo');
  ok(t.log.rest.every(u => !u.includes('nfc_pin_global')), 'não pede o PIN global');
  ok(!t.log.rpc.some(r => r.fn === 'nfc_area_restrita'), 'não pede a área restrita antes do PIN');
  ok(t.log.indevidos.length === 0, 'nenhum pedido a tabela: ' + t.log.indevidos.join(' | '));
  ok((await t.page.$eval('#area-restrita', e => getComputedStyle(e).display)) === 'none', 'área restrita escondida');
  await t.page.evaluate(() => abrirModal('modal-pin'));
  await t.page.type('#inp-pin', 'errado');
  await t.page.evaluate(() => verificarPin()); await esperar(300);
  ok((await t.page.$eval('#pin-erro', e => e.textContent)).includes('Restam 4 tentativas'), 'PIN errado diz quantas restam');
  ok((await t.page.$eval('#area-restrita', e => getComputedStyle(e).display)) === 'none', 'PIN errado não abre a área');
  await t.page.type('#inp-pin', 'trava');
  await t.page.evaluate(() => verificarPin()); await esperar(300);
  ok((await t.page.$eval('#pin-erro', e => e.textContent)).includes('15 minutos'), 'bloqueio avisa os 15 minutos');
  await t.page.type('#inp-pin', 'certo');
  await t.page.evaluate(() => verificarPin()); await esperar(400);
  ok((await t.page.$eval('#area-restrita', e => getComputedStyle(e).display)) === 'block', 'PIN certo abre a área restrita');
  const txt = await t.page.$eval('#app', e => e.textContent);
  ok(txt.includes('A 1444'), 'mostra a OPL depois do PIN');
  const html = await t.page.$eval('#lista-servicos', e => e.innerHTML) + await t.page.$eval('#lista-chamados', e => e.innerHTML);
  ok(html.includes('&lt;b&gt;Barra') && html.includes('&lt;img') && html.includes('&lt;script&gt;'), 'serviços e chamados escapados');
  ok(!(await t.page.evaluate(() => window.__xss2 || window.__xss3)), 'nenhum script rodou');
  ok(txt.includes('(48) 99999-9999'), 'o telefone do chamado aparece só depois do PIN');
  ok((await t.page.$eval('#modal-pin', e => e.classList.contains('open'))) === false, 'a janela do PIN fecha');
  // chamado
  await t.page.evaluate(() => abrirChamadoModal());
  await t.page.type('#inp-nome', 'João Teste'); await t.page.type('#inp-tel', '48999997777'); await t.page.type('#inp-desc', 'Defeito de teste na sirene');
  await t.page.evaluate(() => document.getElementById('btn-enviar-chamado').click()); await esperar(500);
  const ch = t.log.rpc.find(r => r.fn === 'portal_abrir_chamado');
  ok(ch && ch.body.p_token === null && ch.body.p_chassi === CHASSI && ch.body.p_nome === 'João Teste' && ch.body.p_descricao.includes('sirene'), 'abre o chamado pela função, com o chassi: ' + JSON.stringify(ch));
  ok(t.log.dialogs.some(d => d.includes('sucesso')), 'avisa o sucesso');
  await t.browser.close();

  t = await abrir(BASE + 'veiculo.html?chassi=' + CHASSI, respV({ portal_abrir_chamado: { ok: false, erro: 'Informe o telefone completo, com DDD.' } }));
  await t.page.evaluate(() => abrirChamadoModal());
  await t.page.type('#inp-nome', 'João Teste'); await t.page.type('#inp-tel', '48999997777'); await t.page.type('#inp-desc', 'Defeito de teste na sirene');
  await t.page.evaluate(() => document.getElementById('btn-enviar-chamado').click()); await esperar(500);
  ok(t.log.dialogs.some(d => d.includes('telefone completo')), 'mostra o motivo da recusa');
  await t.browser.close();

  t = await abrir(BASE + 'veiculo.html?chassi=' + encodeURIComponent('<img src=x onerror=window.__xss4=1>'), { nfc_veiculo_por_chassi: null });
  ok((await t.page.$eval('#app', e => e.textContent)).includes('Veículo não encontrado'), 'chassi que não acha mostra o erro');
  ok(!(await t.page.evaluate(() => window.__xss4)), 'o chassi da barra de endereço não executa script');
  await t.browser.close();

  console.log(`\n${total} conferências, ${falhas} falhas`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(2); });
