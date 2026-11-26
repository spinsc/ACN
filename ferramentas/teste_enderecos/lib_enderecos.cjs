// Ferramenta de teste dos ENDEREÇOS (plano de endereços e rotas, Fase 1). Copia o padrão de ferramentas/auditoria_layout/lib.cjs
// (Chrome do Windows + puppeteer-core, TODA gravação externa abortada) e acrescenta o que o teste de endereço precisa:
//  - `usuario`: o usuário que fica guardado no navegador (permissões velhas, por exemplo) e `injetar: false` para abrir SEM sessão (teste de entrada);
//  - `toque`: celular de verdade (isMobile + hasTouch), para exercitar o responsivo.css;
//  - o `entrar` (POST da tela de entrada) só é respondido quando o teste devolve a resposta em `escritaSimulada`.
const puppeteer = require('puppeteer-core');
const { crachaDeTeste } = require('../auditoria_layout/cracha_teste.cjs');   // a conta de teste ZZTESTE e o crachá real (a senha fica fora do repositório)
const { vaiAoBancoOuParaFora } = require('../comum/rede_de_teste.cjs');     // 26/11/2026 (B5 do plano de migração): a trava de gravação olha também o caminho do banco

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5199/ACN/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, accept, accept-profile, content-profile, prefer, range, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};
const ID_ZZTESTE = '00000000-0000-0000-0000-000000000000';
const USUARIO_ADMIN = { id: ID_ZZTESTE, nome: 'ZZTESTE', email: 'zzteste@teste.local', perfil: 'Admin' };

let crachaReal = null;
const comCracha = (r) => { const h = { ...r.headers() }; if (crachaReal && /FAKE/.test(h.authorization || '')) { h.authorization = 'Bearer ' + crachaReal; return { headers: h }; } return {}; };

async function abrir({ largura = 1500, altura = 900, toque = false, usuario = USUARIO_ADMIN, injetar = true, simular = () => null, escritaSimulada = () => null } = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: toque, hasTouch: toque, deviceScaleFactor: toque ? 2 : 1 });
  const sessao = await crachaDeTeste();
  crachaReal = sessao.access_token;
  if (injetar) {
    await page.evaluateOnNewDocument((s, u) => {
      localStorage.setItem('acn_sessao_banco', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }));
      localStorage.setItem('user', JSON.stringify(u));
    }, sessao, usuario);
  }
  // O sistema troca window.alert por um aviso no canto da tela (main.tsx), então o evento "dialog" do navegador nunca vê os avisos. Este ouvinte fica ANTES do sistema:
  // guarda cada texto em sessionStorage (sobrevive ao F5) e repassa para a função que estiver valendo.
  await page.evaluateOnNewDocument(() => {
    const guardar = (t) => { try { const a = JSON.parse(sessionStorage.getItem('__alertas') || '[]'); a.push(String(t)); sessionStorage.setItem('__alertas', JSON.stringify(a)); } catch (e) {} };
    let atual = window.alert;
    Object.defineProperty(window, 'alert', { configurable: true, get() { return (t) => { guardar(t); return atual.call(window, t); }; }, set(v) { atual = v; } });
  });
  const gravacoes = [];   // o que SERIA gravado (nada chega ao banco)
  const alertas = [];     // alert() nativos
  const consoleErros = [];
  const falhasDePagina = [];
  page.on('dialog', async d => { alertas.push(d.message()); await d.accept(); });
  page.on('console', m => { if (m.type() === 'error') consoleErros.push(m.text()); });
  page.on('pageerror', e => falhasDePagina.push(String(e && e.message || e)));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const url = decodeURIComponent(r.url().replace(/\+/g, ' '));
    const metodo = r.method();
    const externo = vaiAoBancoOuParaFora(r.url());   // vai ao banco (em qualquer endereço) ou sai do computador
    const responder = (x) => r.respond({ status: x.status || 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(x.body) });
    // leituras do banco que só LEEM (funções): passam para o banco real
    if (externo && metodo === 'POST' && /\/rest\/v1\/rpc\/(entidades_com_alteracao_nao_vista|desde_quando_na_etapa|calendario_eventos|inicio_aniversariantes_do_mes|inicio_aniversariantes_cobertura|ponto_meu_rh_id)/.test(url)) {
      return r.continue(comCracha(r));
    }
    if (externo && !['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      gravacoes.push({ metodo, url, corpo: r.postData() });
      const resp = escritaSimulada(url, metodo, r.postData(), r.headers());
      if (resp && typeof resp.then === 'function') return resp.then(x => (x ? responder(x) : r.abort('failed')));
      return resp ? responder(resp) : r.abort('failed');
    }
    if (metodo === 'GET' && externo) {
      const resp = simular(url, r);
      if (resp && typeof resp.then === 'function') return resp.then(x => (x ? responder(x) : r.continue(comCracha(r))));
      if (resp) return responder(resp);
    }
    return r.continue(comCracha(r));
  });
  return { browser, page, gravacoes, alertas, consoleErros, falhasDePagina, sessao };
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

/** Os avisos (alert) que o sistema mostrou desde o último "limparAlertas" (valem também depois de um F5). */
const lerAlertas = (page) => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('__alertas') || '[]'); } catch (e) { return []; } });
const limparAlertas = (page) => page.evaluate(() => { try { sessionStorage.removeItem('__alertas'); } catch (e) {} });

/** Espera o sistema montar (cabeçalho com o botão do usuário) ou a tela de entrada. */
async function esperarSistema(page, { entrada = false, ms = 30000 } = {}) {
  if (entrada) await page.waitForSelector('.acn-login', { timeout: ms });
  else await page.waitForSelector('.acn-user-btn', { timeout: ms });
}

/** O estado que a pessoa vê agora: endereço, título da aba, aviso de endereço e a primeira linha do conteúdo. */
async function estado(page) {
  return page.evaluate(() => {
    const aviso = document.querySelector('.acn-endereco-aviso');
    const main = document.querySelector('.acn-main') || document.querySelector('main') || document.body;
    return {
      hash: window.location.hash,
      url: window.location.href,
      titulo: document.title,
      historico: window.history.length,
      marca: window.history.state && window.history.state.acn === 1,
      aviso: aviso ? aviso.innerText.replace(/\s+/g, ' ').trim() : null,
      avisoTipo: aviso ? (aviso.querySelector('.acn-faixa-erro, [class*="erro"]') ? 'erro' : 'info') : null,
      botaoDoAviso: aviso && aviso.querySelector('button') ? aviso.querySelector('button').innerText.trim() : null,
      texto: (main.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      larguraRolavel: document.documentElement.scrollWidth,
      larguraJanela: window.innerWidth,
    };
  });
}

/** Clica num item do menu lateral pelo texto (a gaveta pode estar escondida: clica por script, como o resto do projeto). */
async function clicarNoMenu(page, texto) {
  const ok = await page.evaluate((t) => {
    const itens = [...document.querySelectorAll('.sidebar-item')];
    const el = itens.find(i => { const r = i.querySelector('.sidebar-rotulo'); return r && r.textContent.trim() === t; });
    if (!el) return false;
    el.click(); return true;
  }, texto);
  if (!ok) throw new Error('item do menu não achado: ' + texto);
}

module.exports = { abrir, espera, esperarSistema, estado, clicarNoMenu, lerAlertas, limparAlertas, BASE, CORS, ID_ZZTESTE, USUARIO_ADMIN };
