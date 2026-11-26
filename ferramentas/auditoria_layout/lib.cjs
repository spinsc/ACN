// Helper de teste no padrão do projeto (CLAUDE.md, "Testes no navegador"):
// Chrome do Windows + puppeteer-core, usuário injetado em localStorage.user e
// TODA requisição externa que não seja GET/HEAD/OPTIONS é abortada — nenhum
// teste grava em produção, e o corpo do que SERIA gravado fica em `gravacoes`.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { crachaDeTeste } = require('./cracha_teste.cjs');
// 26/11/2026 (B5 do plano de migração): a trava de gravação passou a olhar também o CAMINHO (/rest/v1, /storage/v1, /functions/v1, /auth/v1, /realtime/v1, /api), não só o
// endereço "de fora": no servidor interno o sistema e o banco dividem o endereço. Ver ferramentas/comum/rede_de_teste.cjs.
const { vaiAoBancoOuParaFora } = require('../comum/rede_de_teste.cjs');
// 16/10/2026: com a trava do crachá ligada (Etapa 17b), o app exige a sessão do banco.
// 22/10/2026 (Etapa 17, onda 2): o banco não aceita mais a chave pública para ler (só os portais do cliente), então o crachá deixou de ser de mentira: é o da conta de teste ZZTESTE
// (perfil Almoxarifado, sem aba nenhuma; senha fora do repositório — ver cracha_teste.cjs). Quem manda é `crachaReal`, preenchido em abrir(); uma requisição que ainda leve o texto FAKE recebe o real.
// O que só Admin/RH/WhatsApp/lixeira enxergam vem VAZIO para essa conta (é de propósito: privilégio mínimo); telas desses assuntos devem simular a leitura (`simular`).
let crachaReal = null;
const comAnon = (r) => { const h = { ...r.headers() }; if (crachaReal && /FAKE/.test(h.authorization || '')) { h.authorization = 'Bearer ' + crachaReal; return { headers: h }; } return {}; };

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5173/ACN/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, accept, accept-profile, content-profile, prefer, range, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

// escritaSimulada(url, metodo, corpo) -> {status, body} responde a escrita DENTRO do navegador
// (nada chega ao banco); devolver null = a escrita é abortada, como sempre.
async function abrir({ largura = 1600, altura = 1000, simular = () => null, escritaSimulada = () => null, quebrarRpc = false, abortarLocal = null } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: altura });
  const sessao = await crachaDeTeste();
  crachaReal = sessao.access_token;
  await page.evaluateOnNewDocument((s) => {
    localStorage.setItem('acn_sessao_banco', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }));
    localStorage.setItem('user', JSON.stringify({
      id: '00000000-0000-0000-0000-000000000000', nome: 'ZZTESTE', email: 'zzteste@teste.local', perfil: 'Admin',
    }));
  }, sessao);
  const rpcs = [];       // chamadas à função de leitura do 5.6
  const gravacoes = [];   // o que seria gravado
  const alertas = [];     // alert() nativos
  const consoleErros = [];
  page.on('dialog', async d => { alertas.push(d.message()); await d.accept(); });
  page.on('console', m => { if (m.type() === 'error') consoleErros.push(m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const url = decodeURIComponent(r.url().replace(/\+/g, ' ')).replace('/rest/v1/rh_funcionarios_basico', '/rest/v1/rh_funcionarios');   // 14/10/2026 (Etapa 17b): nas simulações antigas a visão do RH básico responde como a tabela
    const metodo = r.method();
    const externo = vaiAoBancoOuParaFora(r.url());   // vai ao banco (em qualquer endereço) ou sai do computador
    if (abortarLocal && !externo && abortarLocal.test(r.url())) return r.abort('failed');   // simula arquivo do site que sumiu depois de uma publicação
    // POST só de leitura: as funções do banco que só leem — "alteração não vista" (Etapa 5.6)
    // e "desde quando na etapa" (Etapa 6.2)
    if (externo && metodo === 'POST' && /\/rest\/v1\/rpc\/(entidades_com_alteracao_nao_vista|desde_quando_na_etapa|calendario_eventos)/.test(url)) {
      rpcs.push({ url, corpo: r.postData() });
      return quebrarRpc ? r.abort('failed') : r.continue(comAnon(r));
    }
    // 17/11/2026: a conferência da exclusão de formação só LÊ; passa para o banco real, a menos que o teste devolva uma resposta simulada em escritaSimulada
    if (externo && metodo === 'POST' && /\/rest\/v1\/rpc\/formacao_excluir_conferir/.test(url)) {
      rpcs.push({ url, corpo: r.postData() });
      const sim = escritaSimulada(url, metodo, r.postData(), r.headers());
      if (sim) return r.respond({ status: sim.status || 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(sim.body) });
      return r.continue(comAnon(r));
    }
    if (externo && !['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      gravacoes.push({ metodo, url, corpo: r.postData() });
      const resp = escritaSimulada(url, metodo, r.postData(), r.headers());   // 16/10/2026: o 4º argumento são os cabeçalhos do pedido (ex.: Prefer: return=representation)
      // a resposta simulada pode ser uma Promise (resposta que demora): é assim que se fotografa a tela "enviando…" (12e50)
      const responder = (x) => (x ? r.respond({ status: x.status || 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(x.body) }) : r.abort('failed'));
      if (resp && typeof resp.then === 'function') return resp.then(responder);
      return responder(resp);
    }
    if (metodo === 'GET' && externo) {
      const resp = simular(url, r);     // devolve {status, body} para simular um cenário, ou null (ou uma Promise: resposta de leitura que demora — 12e52)
      if (resp && typeof resp.then === 'function') return resp.then(x => (x ? r.respond({ status: x.status || 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(x.body) }) : r.continue(comAnon(r))));
      if (resp) {
        return r.respond({ status: resp.status || 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(resp.body) });
      }
    }
    // contagem (HEAD do supabase-js com count): a simulação devolve { count: N } e vira o cabeçalho content-range
    if (metodo === 'HEAD' && externo) {
      const resp = simular(url, r);
      if (resp && resp.count != null) return r.respond({ status: 200, headers: { ...CORS, 'Access-Control-Expose-Headers': 'content-range', 'content-range': '*/' + resp.count }, body: '' });
    }
    return r.continue(comAnon(r));
  });
  return { browser, page, gravacoes, alertas, consoleErros, rpcs };
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function irParaAba(page, textoMenu) {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 });
  const clicou = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('nav *, aside *, [class*=side] *')].filter(e => e.children.length === 0 && e.textContent.trim() === t);
    if (!els.length) return false;
    els[0].click(); return true;
  }, textoMenu);
  if (!clicou) throw new Error('menu não achado: ' + textoMenu);
  await espera(2500);
}

module.exports = { abrir, espera, irParaAba, BASE, CORS };
