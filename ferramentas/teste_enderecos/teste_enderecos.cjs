// Teste de navegador da Fase 1 do plano de endereços e rotas (25/11/2026).
// Padrão do projeto: Chrome do Windows + puppeteer-core, conta ZZTESTE, TODA gravação externa abortada (nada chega ao banco);
// cada cenário abre um navegador novo (isolado) e eles rodam EM SÉRIE. As permissões "do banco" de cada cenário são simuladas na leitura
// do próprio cadastro da pessoa (auth_usuarios), para provar o link de tela sem acesso, a permissão velha e a permissão nova.
// Os avisos do sistema (alert) viram aviso no canto da tela (main.tsx): o lib_enderecos.cjs os guarda para o teste ler (`A`) e zerar (`LA`).
const { abrir, espera, esperarSistema, estado, clicarNoMenu, lerAlertas, limparAlertas, BASE, ID_ZZTESTE, USUARIO_ADMIN } = require('./lib_enderecos.cjs');
const { crachaDeTeste, URL_BASE, ANON } = require('../auditoria_layout/cracha_teste.cjs');   // Fase 2: ler (só ler) as OPs que os cenários da OP abrem
const fs = require('fs');
const SAIDA = __dirname + '/saida';   // fora do git (ver .gitignore)
const FOTOS = SAIDA + '/fotos';
fs.mkdirSync(FOTOS, { recursive: true });
const A = lerAlertas;
const LA = limparAlertas;

const resultados = [];
const confere = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe });
  console.log(`${ok ? 'OK     ' : 'FALHOU '}${nome}${ok ? '' : '  →  ' + detalhe}`);
};
const gravacoesVistas = {};
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;   // para rodar só um cenário: node teste_enderecos.cjs "^C5"

async function cenario(nome, opcoes, fn) {
  if (ONLY && !ONLY.test(nome)) return;
  console.log(`\n=== ${nome}`);
  let ctx;
  try {
    ctx = await abrir(opcoes);
    await fn(ctx);
  } catch (e) {
    confere(`${nome}: terminou sem erro inesperado`, false, (e && e.stack) || String(e));
  } finally {
    if (ctx) {
      if (ctx.falhasDePagina.length) confere(`${nome}: sem exceção de JavaScript na página`, false, ctx.falhasDePagina.join(' | '));
      else confere(`${nome}: sem exceção de JavaScript na página`, true);
      ctx.gravacoes.forEach(g => { const k = g.metodo + ' ' + g.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]; gravacoesVistas[k] = (gravacoesVistas[k] || 0) + 1; });
      await ctx.browser.close();
    }
  }
}

// ── o usuário "do banco" ──
const RESTRITO = { ...USUARIO_ADMIN, perfil: 'PCP', abas_permitidas: ['pcp'] };
// responde a releitura do cadastro (.single()) com as permissões que o banco "tem" agora; `atrasoMs` mostra o instante do "conferindo".
// Só a leitura .single() do PRÓPRIO cadastro (cabeçalho Accept do PostgREST para um objeto só): "gestor_id=eq.<id>" e as outras leituras esperam uma lista e passam para o banco real.
const bancoComAbas = (abas, atrasoMs = 0) => (url, r) => {
  const ehLeituraDoProprioCadastro = url.includes('/rest/v1/auth_usuarios?') && url.includes('&id=eq.' + ID_ZZTESTE) && /pgrst\.object/.test((r.headers().accept) || '');
  if (!ehLeituraDoProprioCadastro) return null;
  const resp = { status: 200, body: { ...RESTRITO, abas_permitidas: abas } };
  return atrasoMs ? new Promise(res => setTimeout(() => res(resp), atrasoMs)) : resp;
};

// o que a pessoa vai vendo ao longo do tempo (só registra quando o aviso, o título ou o endereço mudam)
async function observar(page, ms, passo = 80) {
  const linha = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const e = await page.evaluate(() => {
      const a = document.querySelector('.acn-endereco-aviso');
      const m = document.querySelector('.acn-main') || document.body;
      return { hash: location.hash, titulo: document.title, aviso: a ? a.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) : null, texto: (m.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70) };
    }).catch(() => null);
    if (e) {
      const chave = JSON.stringify([e.titulo, e.aviso, e.hash]);
      if (!linha.length || linha[linha.length - 1].chave !== chave) linha.push({ t: Date.now() - t0, chave, ...e });
    }
    await espera(passo);
  }
  return linha;
}

const TEXTO_SEM_ACESSO = 'Você não tem acesso a essa aba. Peça a liberação a um Admin.';
const AVISO_DESCONHECIDO = 'Não reconheci este endereço do sistema. Abri a tela inicial.';

// ── Fase 2 (25/11/2026): a janela da OP pelo endereço ──
const codif = encodeURIComponent;
const SAUDACAO = /(Bom dia|Boa tarde|Boa noite)/;   // o título da tela Início (`saudacao`, InicioModelo.ts)
/** O que a pessoa vê da janela da OP agora (endereço, título, passos do histórico, janelas abertas, a tela por baixo e o "Abrindo a OP…"). */
const estadoOp = (page) => page.evaluate(() => {
  const car = document.querySelector('.acn-op-endereco-carregando');
  const main = document.querySelector('.acn-main') || document.body;
  return {
    hash: location.hash, titulo: document.title, historico: history.length, marca: !!(history.state && history.state.acn === 1),
    janelas: document.querySelectorAll('.acn-opl-overlay').length,
    rotulos: [...document.querySelectorAll('.acn-opl[role="dialog"]')].map(d => d.getAttribute('aria-label')),
    carregando: car ? car.innerText.trim() : null,
    painelAberto: !!document.querySelector('.acn-gav'),
    telaDeBaixo: (main.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    origem: location.origin + location.pathname,
  };
});
const esperarJanelaOp = (page, rotulo, ms = 25000) => page.waitForFunction((r) => [...document.querySelectorAll('.acn-opl[role="dialog"]')].some(d => d.getAttribute('aria-label') === r), { timeout: ms }, rotulo);
const esperarSemJanelaOp = (page, ms = 10000) => page.waitForFunction(() => !document.querySelector('.acn-opl-overlay'), { timeout: ms });
/**
 * Espera o DESFECHO de uma abertura que o endereço pediu e o banco recusou ou não achou: some o "Abrindo a OP…" e o endereço deixa de ser o da OP.
 * Não é um tempo fixo porque a leitura do banco demora o que a instância pequena demorar (na 2ª rodada de 25/11/2026 3,5 s fixos reprovaram um sistema que estava certo, só lento).
 * Se estourar o prazo, a conferência seguinte reprova e mostra o estado em que ficou: um "Abrindo a OP…" que nunca termina continua sendo pego.
 */
const esperarDesfechoDaAbertura = (page, ms = 25000) => page.waitForFunction(() => !document.querySelector('.acn-op-endereco-carregando') && !/^#\/op\//i.test(location.hash), { timeout: ms }).catch(() => {});
/**
 * Fica olhando a tela por `ms` e devolve o MÁXIMO de janelas de OP que apareceram e se o "Abrindo a OP…" chegou a aparecer. Um defeito que abre uma segunda janela DEPOIS de a leitura do
 * banco terminar só se vê esperando: na 1ª versão o C24 olhava 0,7 s depois de abrir e NÃO pegou o defeito plantado de propósito (o hospedeiro ignorando a janela que o módulo já abriu).
 */
async function vigiarJanelasDeOp(page, ms = 3000, passo = 60) {
  let maxJanelas = 0, viuCarregando = false;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => ({
      n: [...document.querySelectorAll('.acn-opl[role="dialog"]')].filter(d => /^OP /.test(d.getAttribute('aria-label') || '')).length,
      c: !!document.querySelector('.acn-op-endereco-carregando'),
    })).catch(() => null);
    if (s) { maxJanelas = Math.max(maxJanelas, s.n); if (s.c) viuCarregando = true; }
    await espera(passo);
  }
  return { maxJanelas, viuCarregando };
}
/**
 * Abre o endereço como quem COLA o link numa aba nova: o primeiro passo do histórico não é do sistema. Na primeira vez a página ainda está em branco e basta abrir o endereço;
 * depois troca o endereço sem o sistema perceber (`replaceState` não dispara evento) e recarrega a página. (Ir por "about:blank" não serve: o script que o teste injeta
 * em toda página mexe no localStorage, que o navegador nega numa página em branco, e isso aparece como exceção na página.)
 */
async function abrirComoLinkColado(page, hash) {
  if (/^https?:/.test(page.url())) {
    await page.evaluate((h) => { history.replaceState(null, '', location.pathname + location.search + h); }, hash);
    await page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
  }
}
const fecharJanelaOp = (page) => page.evaluate(() => { const x = document.querySelector('.acn-opl-x'); if (!x) throw new Error('não achei o X da janela da OP'); x.click(); });
/** Digita o número na busca geral e clica no resultado do grupo "OP" cujo número é exatamente esse. */
async function abrirOpPelaBusca(page, numero) {
  await page.click('input[aria-label="Busca geral"]');
  await page.keyboard.type(numero, { delay: 15 });
  await page.waitForFunction((n) => [...document.querySelectorAll('.acn-busca-resultados .acn-busca-grupo')].some(g => g.innerText.trim().endsWith('OP')
    && [...g.parentElement.querySelectorAll('.acn-busca-item-titulo')].some(t => t.innerText.split(' — ')[0].trim() === n)), { timeout: 20000 }, numero);
  await page.evaluate((n) => {
    const g = [...document.querySelectorAll('.acn-busca-resultados .acn-busca-grupo')].find(h => h.innerText.trim().endsWith('OP'));
    const it = [...g.parentElement.querySelectorAll('.acn-busca-item')].find(i => i.querySelector('.acn-busca-item-titulo').innerText.split(' — ')[0].trim() === n);
    it.click();
  }, numero);
}
// as OPs reais que os cenários abrem (lidas do banco com o crachá da conta de teste: SÓ LEITURA, nada é gravado)
let OPS = null;
async function opsDeTeste() {
  if (OPS) return OPS;
  const s = await crachaDeTeste();
  const ler = async (filtro, limite = 1, colunas = '*') => {
    const r = await fetch(`${URL_BASE}/rest/v1/oples?select=${colunas}&${filtro}&limit=${limite}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token } });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('a leitura das OPs de teste foi recusada: ' + JSON.stringify(d).slice(0, 200));
    return d;
  };
  // "comum" = número simples que NENHUMA outra OP começa igual: a busca geral mostra no máximo 6 OPs, e o número de uma OP-base de lote se perderia entre as unidades /NN
  const candidatas = await ler('opl=not.like.*/*&opl=not.like.*%20*&status_geral=neq.Cancelado&order=data_entrada.desc', 40);
  const unicas = [];
  for (const c of candidatas) {
    if ((await ler(`opl=ilike.${encodeURIComponent(c.opl)}*`, 3, 'opl')).length === 1) unicas.push(c);
    if (unicas.length === 2) break;
  }
  // um lote com PELO MENOS duas unidades vivas (o menu "Abrir o lote" só aparece nele): o C30 abre a OP de uma unidade de dentro da janela de outra
  const doLote = await ler('opl=like.*/*&opl=not.like.*%20*&status_geral=neq.Cancelado&order=data_entrada.desc', 80, 'opl,id');
  const porBase = {};
  for (const u of doLote) { const base = u.opl.split('/')[0]; (porBase[base] = porBase[base] || []).push(u); }
  const baseComVarias = Object.keys(porBase).find(k => porBase[k].length >= 2);
  // um número ANTIGO com acento (6 das 571 OPs em 25/11/2026): o link digitado sem acento e em minúscula só acha pela coluna `opl_norm`
  const comAcento = (await ler('order=opl.asc', 1000, 'opl,opl_norm')).find(o => o.opl_norm !== o.opl.toLowerCase()) || null;
  OPS = {
    comum: unicas[0] || null,
    comAcento,
    loteComVarias: baseComVarias ? porBase[baseComVarias][0] : null,
    outra: unicas[1] || null,
    lote: (await ler('opl=like.*/*&opl=not.like.*%20*&status_geral=neq.Cancelado&order=data_entrada.desc'))[0] || null,
    estranha: (await ler('opl=like.*%20%2F%20*&order=data_entrada.desc'))[0] || null,   // número antigo com espaços e barra no meio ("D 715 / 717.2607 - …")
  };
  return OPS;
}
const NAO_ACHADA = 'ZZNAOEXISTE.9999';
const OP_EXCLUIDA = 'A1760.2611';   // cancelada e excluída em 25/11/2026 (CLAUDE.md): o banco a esconde de todos

(async () => {
  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C1 Admin: abertura, menu, Voltar, Avançar e F5', {}, async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    let e = await estado(page);
    confere('abre sem endereço e passa a mostrar #/inicio', e.hash === '#/inicio', e.hash);
    confere('a correção do endereço NÃO criou passo no histórico', e.historico <= 2, `historico=${e.historico}`);
    confere('título da aba = "Início · ACN"', e.titulo === 'Início · ACN', e.titulo);
    const h0 = e.historico;
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    e = await estado(page);
    confere('menu Compras → #/compras', e.hash === '#/compras', e.hash);
    confere('trocar de tela pelo menu cria UM passo', e.historico === h0 + 1, `${h0} → ${e.historico}`);
    confere('o passo é marcado como do sistema', e.marca === true);
    confere('título "Compras · ACN"', e.titulo === 'Compras · ACN', e.titulo);
    confere('a tela de Compras está aberta', /Resumo/.test(e.texto) && /Compras/.test(e.texto), e.texto);
    await clicarNoMenu(page, 'Compras'); await espera(500);
    e = await estado(page);
    confere('clicar na tela em que já está NÃO cria passo', e.historico === h0 + 1, `historico=${e.historico}`);
    await clicarNoMenu(page, 'PCP'); await espera(1200);
    e = await estado(page);
    confere('menu PCP → #/pcp', e.hash === '#/pcp' && e.titulo === 'PCP · ACN', e.hash + ' | ' + e.titulo);
    await page.goBack(); await espera(1000);
    e = await estado(page);
    confere('Voltar → #/compras com a tela Compras', e.hash === '#/compras' && /Resumo/.test(e.texto), e.hash + ' | ' + e.texto);
    await page.goBack(); await espera(1000);
    e = await estado(page);
    confere('Voltar de novo → #/inicio com a tela Início', e.hash === '#/inicio' && /(Bom dia|Boa tarde|Boa noite)/.test(e.texto), e.hash + ' | ' + e.texto);
    await page.goForward(); await espera(1000);
    await page.goForward(); await espera(1000);
    e = await estado(page);
    confere('Avançar duas vezes → #/pcp', e.hash === '#/pcp' && e.titulo === 'PCP · ACN', e.hash + ' | ' + e.titulo);
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await espera(1500);
    e = await estado(page);
    confere('F5 em #/pcp continua no PCP', e.hash === '#/pcp' && e.titulo === 'PCP · ACN', JSON.stringify({ h: e.hash, t: e.titulo }));
    confere('o passo do histórico continua marcado depois do F5', e.marca === true);
    await page.goBack(); await espera(1000);
    e = await estado(page);
    confere('Voltar depois do F5 ainda volta a #/compras', e.hash === '#/compras' && /Resumo/.test(e.texto), e.hash + ' | ' + e.texto);
    const al = await A(page);
    confere('nenhum aviso na tela durante o uso normal', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C2 Admin: link direto, endereço digitado, formas aceitas do endereço', {}, async ({ page }) => {
    await page.goto(BASE + '#/pcp', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1500);
    let e = await estado(page);
    confere('link #/pcp abre o PCP direto', e.hash === '#/pcp' && e.titulo === 'PCP · ACN', e.hash + ' | ' + e.titulo);
    await page.evaluate(() => { window.location.hash = '#/compras'; }); await espera(1200);
    e = await estado(page);
    confere('endereço digitado (#/compras) troca a tela', e.hash === '#/compras' && e.titulo === 'Compras · ACN' && /Resumo/.test(e.texto), e.hash + ' | ' + e.titulo);
    await page.evaluate(() => { window.location.hash = '#PCP/'; }); await espera(1200);
    e = await estado(page);
    confere('forma sem barra, maiúscula e barra no fim (#PCP/) abre o PCP', e.titulo === 'PCP · ACN', e.hash + ' | ' + e.titulo);
    await page.evaluate(() => { window.location.hash = '#/compras?filtro=1'; }); await espera(1200);
    e = await estado(page);
    confere('o que vier depois de "?" é ignorado nesta fase (abre Compras)', e.titulo === 'Compras · ACN', e.hash + ' | ' + e.titulo);
    const al = await A(page);
    confere('nenhum aviso nas formas aceitas', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C3 Admin: endereço desconhecido', {}, async ({ page }) => {
    await page.goto(BASE + '#/xyz', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1500);
    let e = await estado(page);
    let al = await A(page);
    confere('avisa UMA vez que não reconheceu o endereço', al.filter(a => a === AVISO_DESCONHECIDO).length === 1, JSON.stringify(al));
    confere('cai na tela inicial e troca o endereço', e.hash === '#/inicio' && e.titulo === 'Início · ACN', e.hash + ' | ' + e.titulo);
    confere('a troca do endereço desconhecido NÃO criou passo', e.historico <= 2, `historico=${e.historico}`);
    await LA(page);
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await espera(1200);
    al = await A(page);
    confere('F5 depois disso não avisa de novo', al.length === 0, JSON.stringify(al));
    await page.evaluate(() => { window.location.hash = '#/nao-existe'; }); await espera(1200);
    e = await estado(page);
    al = await A(page);
    confere('digitar um endereço desconhecido com o sistema aberto avisa UMA vez e volta ao início', al.filter(a => a === AVISO_DESCONHECIDO).length === 1 && e.hash === '#/inicio', JSON.stringify(al) + ' ' + e.hash);
    await LA(page);
    await page.evaluate(() => { window.location.hash = '#/painel_tv'; }); await espera(1200);
    al = await A(page);
    confere('nome interno com sublinhado (#/painel_tv) não vale: só o nome do endereço (painel-tv)', al.length === 1 && al[0] === AVISO_DESCONHECIDO, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C4 Painel TV pelo endereço', {}, async ({ page }) => {
    await page.goto(BASE + '#/painel-tv', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1800);
    const e = await estado(page);
    confere('#/painel-tv abre o Painel TV', e.hash === '#/painel-tv' && /Painel/.test(e.titulo) && e.titulo !== 'Início · ACN', e.hash + ' | ' + e.titulo);
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C5 Sem acesso: o link de uma tela que a pessoa não tem (permissões iguais no navegador e no banco)', { usuario: RESTRITO, simular: bancoComAbas(['pcp'], 2200) }, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 5200);
    const conferindo = linha.find(x => x.aviso && /Conferindo o seu acesso/.test(x.aviso));
    const semAcesso = linha.find(x => x.aviso && /Você não tem acesso a esta tela/.test(x.aviso));
    confere('primeiro mostra "Conferindo o seu acesso…" (não recusa antes da releitura)', !!conferindo, JSON.stringify(linha.map(x => x.aviso)));
    confere('depois da releitura mostra "sem acesso" com o nome da tela', !!semAcesso && /Compras/.test(semAcesso.aviso), JSON.stringify(linha.map(x => x.aviso)));
    confere('"conferindo" vem ANTES de "sem acesso"', conferindo && semAcesso && conferindo.t < semAcesso.t, `${conferindo && conferindo.t} / ${semAcesso && semAcesso.t}`);
    confere('a tela de Compras nunca aparece no meio', !linha.some(x => /Resumo/.test(x.texto)), JSON.stringify(linha.map(x => x.texto)));
    confere('título "Conferindo o acesso · ACN" e depois "Sem acesso · ACN"', linha.some(x => x.titulo === 'Conferindo o acesso · ACN') && linha.some(x => x.titulo === 'Sem acesso · ACN'), JSON.stringify(linha.map(x => x.titulo)));
    let e = await estado(page);
    confere('o endereço do link fica na barra (#/compras)', e.hash === '#/compras', e.hash);
    confere('o aviso tem o botão "Ir para a tela inicial"', e.botaoDoAviso === 'Ir para a tela inicial', String(e.botaoDoAviso));
    await page.screenshot({ path: FOTOS + '/c5_sem_acesso_desktop.png' });
    const historicoAntes = e.historico;
    await page.evaluate(() => { [...document.querySelectorAll('.acn-endereco-aviso button')][0].click(); });
    await espera(1000);
    e = await estado(page);
    confere('"Ir para a tela inicial" abre o Início (#/inicio)', e.hash === '#/inicio' && e.titulo === 'Início · ACN' && !e.aviso, e.hash + ' | ' + e.titulo + ' | ' + e.aviso);
    confere('...trocando o endereço do beco sem saída, sem criar passo', e.historico === historicoAntes, `${historicoAntes} → ${e.historico}`);
    let al = await A(page);
    confere('nenhum aviso de canto de tela (o aviso é na própria tela)', al.length === 0, JSON.stringify(al));
    // digitar o endereço de uma tela sem acesso com o sistema já aberto
    await page.evaluate(() => { window.location.hash = '#/compras'; }); await espera(900);
    e = await estado(page);
    confere('digitar #/compras com o sistema aberto mostra o aviso na hora (a releitura já terminou)', /Você não tem acesso a esta tela/.test(e.aviso || '') && e.titulo === 'Sem acesso · ACN', JSON.stringify({ a: e.aviso, t: e.titulo }));
    await page.goBack(); await espera(900);
    e = await estado(page);
    confere('Voltar sai do aviso e reabre a tela de antes (Início)', e.hash === '#/inicio' && !e.aviso && e.titulo === 'Início · ACN', e.hash + ' | ' + e.aviso + ' | ' + e.titulo);
    await page.goForward(); await espera(900);
    e = await estado(page);
    confere('Avançar volta ao aviso de "sem acesso"', /Você não tem acesso a esta tela/.test(e.aviso || ''), e.hash + ' | ' + e.aviso);
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C6 Permissão VELHA no navegador, nova no banco: a pessoa acabou de ganhar a aba e abre o link', { usuario: RESTRITO, simular: bancoComAbas(['pcp', 'compras'], 2200) }, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 5200);
    confere('mostra "Conferindo o seu acesso…" enquanto relê', linha.some(x => x.aviso && /Conferindo o seu acesso/.test(x.aviso)), JSON.stringify(linha.map(x => x.aviso)));
    confere('NUNCA mostra "sem acesso" (recusa falsa)', !linha.some(x => x.aviso && /não tem acesso/.test(x.aviso)) && !linha.some(x => x.titulo === 'Sem acesso · ACN'), JSON.stringify(linha.map(x => [x.titulo, x.aviso])));
    const e = await estado(page);
    confere('termina abrindo a tela de Compras, no endereço do link', e.hash === '#/compras' && e.titulo === 'Compras · ACN' && /Resumo/.test(e.texto) && !e.aviso, JSON.stringify({ h: e.hash, t: e.titulo, a: e.aviso }));
    const al = await A(page);
    confere('nenhum aviso de canto de tela', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C7 Permissão velha LIBERA no navegador e o banco já a tirou: abre na hora e não quebra', { usuario: { ...RESTRITO, abas_permitidas: ['pcp', 'compras'] }, simular: bancoComAbas(['pcp'], 1500) }, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 3800);
    const e = await estado(page);
    confere('abre Compras já na primeira leitura (a permissão guardada ainda vale)', linha.some(x => x.titulo === 'Compras · ACN'), JSON.stringify(linha.map(x => x.titulo)));
    const al = await A(page);
    confere('a releitura não derruba a tela aberta nem dá aviso', e.titulo === 'Compras · ACN' && al.length === 0, JSON.stringify({ t: e.titulo, al }));
    // a regra vale para o PRÓXIMO atalho: um link novo para a mesma tela cai em "sem acesso"
    await page.evaluate(() => { window.location.hash = '#/inicio'; }); await espera(800);
    await page.evaluate(() => { window.location.hash = '#/compras'; }); await espera(900);
    const e2 = await estado(page);
    confere('um link novo para a mesma tela, depois da releitura, vira "sem acesso"', /Você não tem acesso a esta tela/.test(e2.aviso || ''), JSON.stringify({ a: e2.aviso, t: e2.titulo }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C8 Atalhos internos conferem a permissão (nenhum abre tela sem acesso)', { usuario: RESTRITO, simular: bancoComAbas(['pcp']) }, async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1800);
    let e = await estado(page);
    confere('começa no Início', e.hash === '#/inicio', e.hash);
    const h0 = e.historico;
    const disparar = (nome, detalhe) => page.evaluate((n, d) => { window.__acnDeepLink = { teste: 1 }; window.dispatchEvent(new CustomEvent(n, { detail: d })); }, nome, detalhe);
    const recusado = async (rotulo, nome, detalhe) => {
      await LA(page);
      await disparar(nome, detalhe); await espera(700);
      const s = await estado(page);
      const sobra = await page.evaluate(() => window.__acnDeepLink);
      const al = await A(page);
      confere(`${rotulo}: avisa UMA vez "sem acesso"`, al.length === 1 && al[0] === TEXTO_SEM_ACESSO, JSON.stringify(al));
      confere(`${rotulo}: não troca de tela nem de endereço`, s.hash === '#/inicio' && s.historico === h0 && s.titulo === 'Início · ACN', JSON.stringify({ h: s.hash, hist: s.historico, t: s.titulo }));
      confere(`${rotulo}: apaga o recado de uso único (__acnDeepLink)`, sobra === null, JSON.stringify(sobra));
    };
    await recusado('acn:ir-para-aba (Compras)', 'acn:ir-para-aba', { aba: 'compras' });
    await recusado('acn:trocar-aba (Compras)', 'acn:trocar-aba', { aba: 'compras' });
    await recusado('analise:abrir-origem (card do CRM)', 'analise:abrir-origem', { origem: 'crm', origemId: 'x' });
    await recusado('analise:abrir-origem (licitação)', 'analise:abrir-origem', { origem: 'licitacao', origemId: 'x' });
    await recusado('crm:navegar-sac (SAC)', 'crm:navegar-sac', undefined);
    await LA(page);
    await disparar('acn:ir-para-aba', { aba: 'nao_existe' }); await espera(600);
    let al = await A(page);
    confere('tela que não existe: avisa que não encontrou o destino', al.length === 1 && /Não encontrei a tela de destino/.test(al[0]), JSON.stringify(al));
    await LA(page);
    await disparar('acn:ir-para-aba', { aba: 'pcp' }); await espera(1000);
    e = await estado(page);
    al = await A(page);
    confere('atalho para tela permitida (PCP) abre, sem aviso, com UM passo novo', e.hash === '#/pcp' && al.length === 0 && e.historico === h0 + 1, JSON.stringify({ h: e.hash, al, hist: e.historico }));
    await LA(page);
    await page.evaluate(() => { window.__depois = 0; window.addEventListener('teste:depois', () => { window.__depois++; }); window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'inicio', depois: { nome: 'teste:depois', detalhe: {} } } })); });
    await espera(900);
    const dep = await page.evaluate(() => window.__depois);
    confere('o atalho "ir para aba + depois" ainda dispara o evento de depois (400 ms)', dep === 1, `eventos=${dep}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  let sessaoReal = null;
  const entrarSimulado = (url) => {
    if (/\/functions\/v1\/entrar/.test(url)) return { status: 200, body: { ok: true, sessao: sessaoReal, usuario: USUARIO_ADMIN } };
    return null;
  };
  const entrarPeloFormulario = async (page) => {
    await page.waitForSelector('#login-email', { timeout: 20000 });
    await page.type('#login-email', 'zzteste@teste.local');
    await page.type('#login-senha', 'senha-de-mentira');   // a resposta de entrada é simulada na rede: a senha de verdade nunca é digitada
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }), page.click('.acn-login-btn')]);
  };
  await cenario('C9 Link sem estar entrado → tela de entrada → destino; sair zera o endereço', { injetar: false, escritaSimulada: entrarSimulado }, async (ctx) => {
    sessaoReal = ctx.sessao;
    const { page } = ctx;
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page, { entrada: true });
    let e = await estado(page);
    confere('sem sessão: aparece a tela de entrada e o link continua na barra', e.hash === '#/compras', e.hash);
    await entrarPeloFormulario(page);
    await esperarSistema(page); await espera(1500);
    e = await estado(page);
    confere('depois de entrar, abre a tela do link (Compras), não o Início', e.hash === '#/compras' && e.titulo === 'Compras · ACN' && /Resumo/.test(e.texto), JSON.stringify({ h: e.hash, t: e.titulo }));
    await page.click('.acn-user-btn'); await espera(400);
    const clicouSair = await page.evaluate(() => { const b = [...document.querySelectorAll('button[role="menuitem"]')].find(x => /Sair/.test(x.innerText)); if (!b) return false; b.click(); return true; });
    confere('o menu do usuário tem o botão Sair', clicouSair);
    await esperarSistema(page, { entrada: true }); await espera(500);
    const rastro = await page.evaluate(() => ({ hash: location.hash, href: location.href, state: window.history.state, user: localStorage.getItem('user'), sessao: localStorage.getItem('acn_sessao_banco'), titulo: document.title }));
    confere('sair zera o endereço da barra (sem #)', rastro.hash === '' && !rastro.href.includes('#'), rastro.href);
    confere('sair zera a marca do passo do histórico', rastro.state === null, JSON.stringify(rastro.state));
    confere('sair apaga o usuário e o crachá do navegador', rastro.user === null && rastro.sessao === null, JSON.stringify({ u: rastro.user, s: rastro.sessao && 'presente' }));
    confere('o título da aba volta ao original (não fica "Compras · ACN")', !/· ACN$/.test(rastro.titulo), rastro.titulo);
    await entrarPeloFormulario(page);
    await esperarSistema(page); await espera(1500);
    e = await estado(page);
    confere('quem entra depois de um "Sair" abre no Início (#/inicio), não na tela da pessoa anterior', e.hash === '#/inicio' && e.titulo === 'Início · ACN', JSON.stringify({ h: e.hash, t: e.titulo }));
    const al = await A(page);
    confere('nenhum aviso no caminho', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C10 "Ver como" e voltar ao Admin recarregam a página na raiz: o endereço some e abre o Início', {}, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await page.evaluate(() => { window.__marca = 1; });
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }), page.evaluate(() => { window.location.href = window.location.origin + '/ACN/'; })]);
    const recarregou = await page.evaluate(() => window.__marca === undefined);
    await esperarSistema(page); await espera(1200);
    const e = await estado(page);
    confere('ir para a raiz (como fazem o "Ver como" e o "Voltar ao Admin") é um recarregamento de verdade', recarregou);
    confere('...e o endereço da tela anterior some: abre o Início', e.hash === '#/inicio' && e.titulo === 'Início · ACN', e.hash + ' | ' + e.titulo);
  });

  // ───────────────────────────────────────────────────────────────────────────
  for (const [rotulo, largura, altura, toque] of [['celular 390x844', 390, 844, true], ['celular pequeno 360x740', 360, 740, true], ['tablet 820x1180', 820, 1180, true], ['meia tela 960x900', 960, 900, false]]) {
    await cenario(`C11 Layout do aviso de endereço — ${rotulo}`, { usuario: RESTRITO, simular: bancoComAbas(['pcp'], 1800), largura, altura, toque }, async ({ page }) => {
      await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await espera(500);
      let e = await estado(page);
      const arq = rotulo.split(' ')[0] + largura;
      confere(`${rotulo}: "conferindo" sem rolagem para o lado`, /Conferindo o seu acesso/.test(e.aviso || '') && e.larguraRolavel <= e.larguraJanela, JSON.stringify({ a: e.aviso, rolavel: e.larguraRolavel, janela: e.larguraJanela }));
      await page.screenshot({ path: `${FOTOS}/c11_${arq}_conferindo.png` });
      await espera(2200);
      e = await estado(page);
      confere(`${rotulo}: "sem acesso" aparece`, /Você não tem acesso a esta tela/.test(e.aviso || ''), e.aviso);
      confere(`${rotulo}: sem rolagem para o lado`, e.larguraRolavel <= e.larguraJanela, `${e.larguraRolavel} > ${e.larguraJanela}`);
      const caixa = await page.evaluate(() => {
        const b = document.querySelector('.acn-endereco-aviso button'); const f = document.querySelector('.acn-endereco-aviso .acn-faixa');
        const rb = b && b.getBoundingClientRect(); const rf = f && f.getBoundingClientRect();
        return { botao: rb && { esq: rb.left, dir: rb.right, topo: rb.top, base: rb.bottom, h: rb.height }, faixa: rf && { esq: rf.left, dir: rf.right }, largura: window.innerWidth, altura: window.innerHeight };
      });
      confere(`${rotulo}: o botão fica inteiro dentro da tela`, caixa.botao && caixa.botao.esq >= 0 && caixa.botao.dir <= caixa.largura && caixa.botao.base <= caixa.altura, JSON.stringify(caixa));
      confere(`${rotulo}: o botão fica dentro da faixa`, caixa.botao && caixa.faixa && caixa.botao.esq >= caixa.faixa.esq - 1 && caixa.botao.dir <= caixa.faixa.dir + 1, JSON.stringify(caixa));
      if (toque) confere(`${rotulo}: o botão é fácil de tocar (altura de 32 px ou mais)`, caixa.botao && caixa.botao.h >= 32, JSON.stringify(caixa.botao));
      await page.screenshot({ path: `${FOTOS}/c11_${arq}_sem_acesso.png` });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C12 A releitura das permissões demora mais que 8 s: decide com o que há e se corrige quando ela chega', { usuario: RESTRITO, simular: bancoComAbas(['pcp', 'compras'], 11000) }, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 14500, 150);
    const conferindo = linha.find(x => x.aviso && /Conferindo o seu acesso/.test(x.aviso));
    const semAcesso = linha.find(x => x.aviso && /Você não tem acesso a esta tela/.test(x.aviso));
    const abriu = linha.find(x => x.titulo === 'Compras · ACN');
    confere('começa em "Conferindo o seu acesso…"', !!conferindo && conferindo.t < 3000, JSON.stringify(linha.map(x => [x.t, x.aviso])));
    confere('passados ~8 s sem resposta, deixa de esperar e mostra "sem acesso" (não fica "conferindo" para sempre)', !!semAcesso && semAcesso.t >= 7000 && semAcesso.t <= 10500, JSON.stringify(linha.map(x => [x.t, x.aviso])));
    confere('quando a releitura chega (11 s) com a permissão nova, a tela do link abre sozinha', !!abriu && abriu.t >= 10500, JSON.stringify(linha.map(x => [x.t, x.titulo])));
    const e = await estado(page);
    confere('termina em Compras, no endereço do link, sem o aviso', e.hash === '#/compras' && e.titulo === 'Compras · ACN' && !e.aviso && /Resumo/.test(e.texto), JSON.stringify({ h: e.hash, t: e.titulo, a: e.aviso }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C13 A releitura das permissões FALHA (banco fora do ar): não fica esperando; mostra "sem acesso" com a orientação de atualizar', { usuario: RESTRITO, simular: (url, r) => (url.includes('/rest/v1/auth_usuarios?') && url.includes('&id=eq.' + ID_ZZTESTE) && /pgrst\.object/.test(r.headers().accept || '') ? { status: 500, body: { message: 'erro simulado' } } : null) }, async ({ page }) => {
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 3500);
    const semAcesso = linha.find(x => x.aviso && /Você não tem acesso a esta tela/.test(x.aviso));
    confere('com a leitura falhando, mostra "sem acesso" logo (sem esperar os 8 s)', !!semAcesso && semAcesso.t < 3000, JSON.stringify(linha.map(x => [x.t, x.aviso])));
    confere('o aviso orienta a atualizar a página (F5)', !!semAcesso && /F5/.test(semAcesso.aviso), JSON.stringify(semAcesso));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C14 Quem não tem lista de abas marcada (vale todas) abre qualquer link, sem espera', { usuario: { ...USUARIO_ADMIN, perfil: 'Financeiro', abas_permitidas: [] }, simular: (url, r) => (url.includes('/rest/v1/auth_usuarios?') && url.includes('&id=eq.' + ID_ZZTESTE) && /pgrst\.object/.test(r.headers().accept || '') ? { status: 200, body: { ...USUARIO_ADMIN, perfil: 'Financeiro', abas_permitidas: [] } } : null) }, async ({ page }) => {
    await page.goto(BASE + '#/financeiro', { waitUntil: 'domcontentloaded' });
    const linha = await observar(page, 2500);
    confere('abre o Financeiro direto, sem passar por "conferindo"', linha.some(x => x.titulo === 'Financeiro · ACN') && !linha.some(x => x.aviso), JSON.stringify(linha.map(x => [x.t, x.titulo, x.aviso])));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C15 Sessão vencida (usuário guardado, sem crachá): vai para a entrada, mantém o endereço e, depois de entrar, abre o destino', { injetar: false, escritaSimulada: entrarSimulado }, async (ctx) => {
    sessaoReal = ctx.sessao;
    const { page } = ctx;
    // só o usuário fica guardado; o crachá do banco "venceu" (não existe): o App manda para a tela de entrada com o aviso
    await page.evaluateOnNewDocument((u) => { if (!sessionStorage.getItem('__usuario_semeado')) { sessionStorage.setItem('__usuario_semeado', '1'); localStorage.setItem('user', JSON.stringify(u)); } }, USUARIO_ADMIN);
    await page.goto(BASE + '#/compras', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page, { entrada: true });
    let e = await estado(page);
    const aviso = await page.evaluate(() => { const a = document.querySelector('.acn-login-aviso'); return a ? a.innerText : null; });
    confere('a tela de entrada aparece com o aviso de segurança e o endereço do link continua na barra', aviso && /entre de novo/i.test(aviso) && e.hash === '#/compras', JSON.stringify({ aviso, h: e.hash }));
    await entrarPeloFormulario(page);
    await esperarSistema(page); await espera(1500);
    e = await estado(page);
    confere('depois de entrar, abre a tela do link (Compras)', e.hash === '#/compras' && e.titulo === 'Compras · ACN' && /Resumo/.test(e.texto), JSON.stringify({ h: e.hash, t: e.titulo }));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2 (25/11/2026): o endereço da OP, #/op/<número>
  // ═══════════════════════════════════════════════════════════════════════════
  await cenario('C16 OP pela busca geral: passo no histórico, título, Voltar fecha, Avançar reabre, X volta um passo', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    confere('achei no banco as OPs de teste (comum, outra, lote e número antigo)', ops.comum && ops.outra && ops.lote && ops.estranha, JSON.stringify(Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, v && v.opl]))));
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    let e = await estadoOp(page);
    confere('começa em #/compras, sem janela de OP', e.hash === '#/compras' && e.janelas === 0, JSON.stringify(e));
    const h0 = e.historico;
    await abrirOpPelaBusca(page, n);
    await esperarJanelaOp(page, rot); await espera(500);
    e = await estadoOp(page);
    confere('a janela da OP abriu e o endereço é #/op/<número>', e.hash === end && e.rotulos.length === 1 && e.rotulos[0] === rot, JSON.stringify(e));
    confere('abrir a OP criou UM passo no histórico, do sistema', e.historico === h0 + 1 && e.marca === true, `${h0} → ${e.historico}, marca=${e.marca}`);
    confere('título da aba = "OP <número> · ACN"', e.titulo === rot + ' · ACN', e.titulo);
    confere('a tela de baixo continua sendo Compras', /Resumo/.test(e.telaDeBaixo), e.telaDeBaixo);
    confere('só UMA janela (o hospedeiro não abriu outra)', e.janelas === 1, String(e.janelas));
    await page.goBack(); await esperarSemJanelaOp(page); await espera(600);
    e = await estadoOp(page);
    confere('Voltar fecha a janela e volta a #/compras', e.hash === '#/compras' && e.janelas === 0 && e.titulo === 'Compras · ACN', JSON.stringify({ h: e.hash, j: e.janelas, t: e.titulo }));
    await page.goForward(); await esperarJanelaOp(page, rot); await espera(500);
    e = await estadoOp(page);
    confere('Avançar reabre a OP (pelo endereço)', e.hash === end && e.janelas === 1 && e.titulo === rot + ' · ACN', JSON.stringify({ h: e.hash, j: e.janelas, t: e.titulo }));
    const h1 = e.historico;
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
    e = await estadoOp(page);
    confere('o X da janela volta UM passo (#/compras), com a tela Compras e o título dela', e.hash === '#/compras' && e.janelas === 0 && e.titulo === 'Compras · ACN' && /Resumo/.test(e.telaDeBaixo), JSON.stringify({ h: e.hash, t: e.titulo }));
    confere('fechar pelo X não criou passo novo (usa o Voltar)', e.historico === h1, `${h1} → ${e.historico}`);
    await page.goForward(); await esperarJanelaOp(page, rot); await espera(400);
    e = await estadoOp(page);
    confere('depois do X, o Avançar ainda reabre a OP', e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
    const al = await A(page);
    confere('nenhum aviso no uso normal', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C17 F5 com a OP aberta: reabre por cima do Início; fechar volta ao passo de antes', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    await abrirOpPelaBusca(page, n);
    await esperarJanelaOp(page, rot); await espera(400);
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page);
    await esperarJanelaOp(page, rot); await espera(600);
    let e = await estadoOp(page);
    confere('F5 em #/op/<número> reabre a janela da OP', e.hash === end && e.janelas === 1 && e.rotulos[0] === rot, JSON.stringify(e));
    confere('por baixo da janela fica o Início (a OP não tem tela dona)', SAUDACAO.test(e.telaDeBaixo), e.telaDeBaixo);
    confere('título da aba = OP', e.titulo === rot + ' · ACN', e.titulo);
    confere('o passo do histórico continua marcado como do sistema depois do F5', e.marca === true);
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(900);
    e = await estadoOp(page);
    confere('o X depois do F5 volta ao passo de antes (#/compras) e a tela Compras aparece', e.hash === '#/compras' && e.janelas === 0 && /Resumo/.test(e.telaDeBaixo) && e.titulo === 'Compras · ACN', JSON.stringify({ h: e.hash, t: e.titulo, b: e.telaDeBaixo.slice(0, 50) }));
    await page.goForward(); await esperarJanelaOp(page, rot); await espera(500);
    e = await estadoOp(page);
    confere('Avançar reabre a OP por cima de Compras (a tela de baixo agora é Compras)', e.hash === end && e.janelas === 1 && /Resumo/.test(e.telaDeBaixo), JSON.stringify({ h: e.hash, b: e.telaDeBaixo.slice(0, 50) }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C18 Link colado (primeira página): abre por cima do Início; fechar troca o endereço e NUNCA sai do sistema', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(600);
    let e = await estadoOp(page);
    const origem = e.origem, h0 = e.historico;
    confere('o link colado abre a OP', e.hash === end && e.janelas === 1 && e.titulo === rot + ' · ACN', JSON.stringify({ h: e.hash, j: e.janelas, t: e.titulo }));
    confere('por baixo fica o Início', SAUDACAO.test(e.telaDeBaixo), e.telaDeBaixo);
    confere('o passo do link colado NÃO é do sistema (não há passo anterior dentro dele)', e.marca === false);
    confere('abrir pelo link não criou passo no histórico', h0 <= 2, `historico=${h0}`);
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(800);
    e = await estadoOp(page);
    confere('fechar troca o endereço pelo da tela de baixo (#/inicio)', e.hash === '#/inicio' && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
    confere('continua no sistema (mesma página) e sem passo novo', e.origem === origem && e.historico === h0, `${origem} | ${h0} → ${e.historico}`);
    confere('o título volta ao do Início', e.titulo === 'Início · ACN', e.titulo);
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C19 OP que não existe e OP excluída: UMA mensagem, sem janela, sem "carregando" eterno, endereço limpo', {}, async ({ page }) => {
    for (const [nome, numero] of [['inexistente', NAO_ACHADA], ['excluída', OP_EXCLUIDA]]) {
      await LA(page).catch(() => {});
      await abrirComoLinkColado(page, '#/op/' + codif(numero));   // link colado de verdade: só mudar o # na mesma página seria "endereço digitado"
      await esperarSistema(page); await esperarDesfechoDaAbertura(page); await espera(800);
      const e = await estadoOp(page);
      const al = await A(page);
      const msgs = al.filter(a => a.includes('Não foi possível abrir a OP ' + numero));
      confere(`OP ${nome}: UMA mensagem dizendo que não achou ou sem acesso`, msgs.length === 1 && /não a encontrei, ou você não tem acesso/.test(msgs[0]), JSON.stringify(al));
      confere(`OP ${nome}: nenhuma janela e nenhum "Abrindo a OP…"`, e.janelas === 0 && e.carregando === null, JSON.stringify({ j: e.janelas, c: e.carregando }));
      confere(`OP ${nome}: o endereço é trocado pelo da tela de baixo`, e.hash === '#/inicio' && e.titulo === 'Início · ACN', JSON.stringify({ h: e.hash, t: e.titulo }));
      await LA(page);
      await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await espera(1500);
      const depois = await A(page);
      confere(`OP ${nome}: o F5 depois disso não avisa de novo`, depois.length === 0, JSON.stringify(depois));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C20 Link com o código interno (uuid): abre e o endereço passa a ser o número', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE + '#/op/' + ops.comum.id, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(700);
    let e = await estadoOp(page);
    confere('abre a OP pelo código interno', e.janelas === 1 && e.rotulos[0] === rot, JSON.stringify(e));
    confere('o endereço trocou o código pelo número, sem criar passo', e.hash === end && e.historico <= 2, `${e.hash} | historico=${e.historico}`);
    confere('título com o número', e.titulo === rot + ' · ACN', e.titulo);
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
    e = await estadoOp(page);
    confere('fechar leva ao Início, sem deixar o endereço da OP na barra', e.hash === '#/inicio' && e.janelas === 0, JSON.stringify({ h: e.hash }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C21 Números com barra e espaço (unidade de lote e número antigo): o link codifica e abre', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    for (const [nome, op] of [['unidade de lote', ops.lote], ['número antigo com espaços e barra', ops.estranha]]) {
      const n = op.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
      await abrirComoLinkColado(page, end);   // link colado de verdade, não só outro # na mesma página
      await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(600);
      let e = await estadoOp(page);
      confere(`${nome}: abre a OP certa`, e.janelas === 1 && e.rotulos[0] === rot && e.hash === end, JSON.stringify({ h: e.hash, r: e.rotulos }));
      confere(`${nome}: a barra mostra a barra codificada (%2F)`, !/\/op\/.*\/.*\//.test(e.hash.replace('#', '/')) && e.hash.includes('%2F'), e.hash);
      confere(`${nome}: título com o número inteiro`, e.titulo === rot + ' · ACN', e.titulo);
      // quem digita a barra sem codificar chega na mesma OP, sem abrir outra janela nem fechar esta
      await page.evaluate((h) => { location.hash = h; }, '#/op/' + n);
      await espera(1800);
      e = await estadoOp(page);
      confere(`${nome}: o mesmo número com a barra digitada sem codificar continua UMA janela, a mesma`, e.janelas === 1 && e.rotulos[0] === rot, JSON.stringify({ j: e.janelas, r: e.rotulos }));
      await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
      e = await estadoOp(page);
      confere(`${nome}: fechar leva ao Início`, e.hash === '#/inicio' && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C22 Copiar link: o endereço completo da OP (moderno, jeito antigo e falha)', {}, async (ctx) => {
    const { page } = ctx;
    const ops = await opsDeTeste();
    const n = ops.lote.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.evaluateOnNewDocument(() => {
      window.__copiado = []; window.__execCopia = []; window.__modoCopia = 'moderna';
      const stub = { writeText: async (t) => { if (window.__modoCopia === 'recusa' || window.__modoCopia === 'falha') throw new Error('recusado'); window.__copiado.push(t); } };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => (window.__modoCopia === 'sem' ? undefined : stub) });
      const original = document.execCommand.bind(document);
      document.execCommand = (cmd, ...r) => {
        if (cmd !== 'copy') return original(cmd, ...r);
        const campo = document.querySelector('.acn-copiar-oculto');
        window.__execCopia.push(campo ? campo.value : null);
        return window.__modoCopia !== 'falha';
      };
    });
    await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(800);
    const botao = await page.evaluate(() => { const b = document.querySelector('.acn-opl-cab-acoes button[aria-label="Copiar o link desta OP"]'); return b ? b.innerText.trim() : null; });
    confere('a janela tem o botão "Copiar link"', botao === 'Copiar link', String(botao));
    const completo = BASE + end;
    const clicar = async () => { await page.evaluate(() => document.querySelector('.acn-opl-cab-acoes button[aria-label="Copiar o link desta OP"]').click()); await espera(900); };
    await LA(page); await clicar();
    let al = await A(page);
    let copiado = await page.evaluate(() => window.__copiado);
    confere('forma moderna: copia o endereço COMPLETO (base atual + #/op/<número codificado>)', copiado.length === 1 && copiado[0] === completo, JSON.stringify(copiado) + ' esperado ' + completo);
    confere('forma moderna: avisa que copiou', al.length === 1 && /^Link da OP .* copiado\./.test(al[0]), JSON.stringify(al));
    await page.evaluate(() => { window.__modoCopia = 'recusa'; });
    await LA(page); await clicar();
    al = await A(page);
    const exec = await page.evaluate(() => window.__execCopia);
    confere('navegador recusa a forma moderna: usa o jeito antigo, com o mesmo endereço', exec.length === 1 && exec[0] === completo, JSON.stringify(exec));
    confere('jeito antigo: avisa que copiou', al.length === 1 && /copiado\./.test(al[0]), JSON.stringify(al));
    const sobrou = await page.evaluate(() => document.querySelectorAll('.acn-copiar-oculto').length);
    confere('o campo escondido do jeito antigo é retirado da tela', sobrou === 0, String(sobrou));
    await page.evaluate(() => { window.__modoCopia = 'sem'; });
    await LA(page); await clicar();
    al = await A(page);
    confere('sem a área de transferência moderna: copia pelo jeito antigo', al.length === 1 && /copiado\./.test(al[0]) && (await page.evaluate(() => window.__execCopia)).length === 2, JSON.stringify(al));
    await page.evaluate(() => { window.__modoCopia = 'falha'; });
    await LA(page); await clicar();
    al = await A(page);
    confere('as duas formas falham: mensagem de erro que manda copiar da barra', al.length === 1 && /^Não foi possível copiar o link da OP .*barra do navegador/.test(al[0]), JSON.stringify(al));
    const e = await estadoOp(page);
    confere('copiar não mexeu no endereço nem fechou a janela', e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C23 Menção de OP: abre a janela da OP por cima da tela atual, sem trocar de aba', {
    simular: (url, r) => {
      if (r.method() !== 'GET' || !url.includes('/rest/v1/mencoes?') || !url.includes('select=*')) return null;
      return OPS && OPS.comum ? { status: 200, body: [{
        id: '99999999-0000-4000-8000-000000000001', mencionado_id: ID_ZZTESTE, mencionado_nome: 'ZZTESTE', mencionante_nome: 'ZZTESTE Autor',
        contexto: 'op', contexto_id: OPS.comum.opl, contexto_descricao: 'OP ' + OPS.comum.opl, aba_destino: 'pcp', texto_trecho: 'menção de teste (simulada)',
        lida: false, resolvida: false, criado_em: new Date().toISOString(),
      }] } : null;
    },
  }, async ({ page, gravacoes }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    const h0 = (await estadoOp(page)).historico;
    await page.evaluate(() => { const b = document.querySelector('[title="Menções"], [title$="pendente(s)"]'); if (!b) throw new Error('botão de Menções não achado'); b.click(); });
    await page.waitForSelector('.acn-men-desc.link', { timeout: 15000 });
    let e = await estadoOp(page);
    confere('o painel de Menções abriu com a menção de OP', e.painelAberto, JSON.stringify(e));
    await page.evaluate(() => document.querySelector('.acn-men-desc.link').click());
    await esperarJanelaOp(page, rot); await espera(600);
    e = await estadoOp(page);
    confere('a janela da OP abriu pelo endereço', e.hash === end && e.janelas === 1 && e.rotulos[0] === rot, JSON.stringify(e));
    confere('NÃO trocou de aba (a menção apontava para o PCP): a tela de baixo segue sendo Compras', /Resumo/.test(e.telaDeBaixo), e.telaDeBaixo);
    confere('o painel de Menções fechou', e.painelAberto === false);
    confere('um passo no histórico', e.historico === h0 + 1, `${h0} → ${e.historico}`);
    confere('uma janela só', e.janelas === 1, String(e.janelas));
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
    e = await estadoOp(page);
    confere('o X volta a #/compras', e.hash === '#/compras' && e.janelas === 0, JSON.stringify({ h: e.hash }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
    confere('a menção foi marcada como lida pela gravação normal (que o teste bloqueou)', gravacoes.some(g => g.metodo === 'PATCH' && /\/mencoes/.test(g.url) && /"lida":true/.test(g.corpo || '')), JSON.stringify(gravacoes.map(g => g.metodo + ' ' + g.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60))));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C24 Número de OP clicável (LinkOpl) em uma tela: a janela do módulo ganha o endereço, uma só, e o Avançar reabre', {}, async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    // o número de OP clicável é o `LinkOpl` (title "Abrir detalhes da OP"); o "Abrir o lote inteiro" do `OpLote` usa a mesma classe e não é uma OP
    const LINK_DE_OP = '.acn-main span.acn-ats-link[title="Abrir detalhes da OP"]';
    let achou = null;
    for (const tela of ['PCP', 'Almoxarifado', 'Adaptação', 'Fiscal', 'Qualidade', 'Engenharia']) {
      try { await clicarNoMenu(page, tela); } catch (e) { continue; }   // a tela não está no menu desta conta
      const numero = await page.waitForSelector(LINK_DE_OP, { timeout: 9000 }).then(h => h.evaluate(l => l.innerText.trim())).catch(() => null);
      if (numero) { achou = { tela, numero }; break; }
    }
    confere('achei uma tela com número de OP clicável', !!achou, 'nenhuma das telas tem');
    if (!achou) return;
    const rot = 'OP ' + achou.numero, end = '#/op/' + codif(achou.numero);
    const antes = await estadoOp(page);
    await page.evaluate((sel) => document.querySelector(sel).click(), LINK_DE_OP);
    await esperarJanelaOp(page, rot);
    // o hospedeiro, se não visse que o módulo já abriu a OP, leria a OP do banco e abriria uma SEGUNDA janela só depois da leitura: por isso se vigia por uns segundos
    const vigia = await vigiarJanelasDeOp(page, 3500);
    let e = await estadoOp(page);
    confere(`a janela aberta pelo módulo (${achou.tela}) ganhou o endereço da OP`, e.hash === end && e.rotulos[0] === rot, JSON.stringify({ h: e.hash, r: e.rotulos }));
    confere('UMA janela só, e o hospedeiro nem chegou a mostrar "Abrindo a OP…" (não leu a OP à toa)', e.janelas === 1 && vigia.maxJanelas === 1 && !vigia.viuCarregando, JSON.stringify({ janelas: e.janelas, ...vigia }));
    confere('um passo no histórico e o título da OP', e.historico === antes.historico + 1 && e.titulo === rot + ' · ACN', `${antes.historico} → ${e.historico} | ${e.titulo}`);
    await page.goBack(); await esperarSemJanelaOp(page); await espera(600);
    e = await estadoOp(page);
    confere('Voltar fecha a janela do módulo e volta ao endereço da tela', e.hash === antes.hash && e.janelas === 0 && e.titulo === antes.titulo, JSON.stringify({ h: e.hash, t: e.titulo }));
    await page.goForward(); await esperarJanelaOp(page, rot); await espera(500);
    e = await estadoOp(page);
    confere('Avançar reabre a OP (agora pelo hospedeiro), uma janela só', e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
    e = await estadoOp(page);
    confere('o X volta ao endereço da tela', e.hash === antes.hash && e.janelas === 0, JSON.stringify({ h: e.hash }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C25 De uma OP para outra por endereço digitado, e Voltar entre elas', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    const a = ops.comum.opl, b = ops.outra.opl;
    const rotA = 'OP ' + a, rotB = 'OP ' + b, endA = '#/op/' + codif(a), endB = '#/op/' + codif(b);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    await abrirOpPelaBusca(page, a); await esperarJanelaOp(page, rotA); await espera(500);
    await page.evaluate((h) => { location.hash = h; }, endB);
    await esperarJanelaOp(page, rotB); await espera(900);
    let e = await estadoOp(page);
    confere('digitar o endereço de outra OP fecha a primeira e abre a segunda (uma janela só)', e.hash === endB && e.janelas === 1 && e.rotulos[0] === rotB && e.titulo === rotB + ' · ACN', JSON.stringify({ h: e.hash, r: e.rotulos, t: e.titulo }));
    await page.goBack(); await esperarJanelaOp(page, rotA); await espera(900);
    e = await estadoOp(page);
    confere('Voltar reabre a primeira OP (e fecha a segunda)', e.hash === endA && e.janelas === 1 && e.rotulos[0] === rotA, JSON.stringify({ h: e.hash, r: e.rotulos }));
    await page.goBack(); await esperarSemJanelaOp(page); await espera(700);
    e = await estadoOp(page);
    confere('Voltar de novo fecha tudo e volta a #/compras', e.hash === '#/compras' && e.janelas === 0 && e.titulo === 'Compras · ACN', JSON.stringify({ h: e.hash, t: e.titulo }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  let leituraLenta = true;   // liga e desliga a demora simulada da leitura da OP
  await cenario('C26 Banco lento: "Abrindo a OP…" aparece; Voltar durante a espera não deixa a janela aparecer depois', {
    simular: (url, r) => (leituraLenta && r.method() === 'GET' && /\/rest\/v1\/oples\?select=\*&opl=eq\./.test(url) ? new Promise(res => setTimeout(() => res(null), 3500)) : null),
  }, async ({ page }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, rot = 'OP ' + n, end = '#/op/' + codif(n);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1200);
    await page.evaluate((h) => { location.hash = h; }, end);
    await espera(900);
    let e = await estadoOp(page);
    confere('enquanto lê: aparece "Abrindo a OP …" e ainda não há janela', e.carregando && e.carregando.includes(n) && e.janelas === 0, JSON.stringify({ c: e.carregando, j: e.janelas }));
    await page.goBack(); await espera(300);
    await espera(5000);
    e = await estadoOp(page);
    confere('Voltar durante a espera: a janela NÃO aparece quando a leitura termina', e.janelas === 0 && e.carregando === null && e.hash === '#/compras', JSON.stringify({ j: e.janelas, c: e.carregando, h: e.hash }));
    // agora sem Voltar: espera a leitura e a janela aparece
    await page.evaluate((h) => { location.hash = h; }, end);
    await esperarJanelaOp(page, rot); await espera(400);
    e = await estadoOp(page);
    confere('esperando até o fim, a janela abre e o "Abrindo…" some', e.janelas === 1 && e.carregando === null, JSON.stringify({ j: e.janelas, c: e.carregando }));
    leituraLenta = false;
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C27 Leitura da OP recusada pelo banco: a mensagem diz que a leitura falhou (não "não achei"), uma vez, e o endereço é limpo', {
    simular: (url, r) => (r.method() === 'GET' && /\/rest\/v1\/oples\?select=\*&opl=eq\./.test(url) ? { status: 500, body: { message: 'erro simulado do banco' } } : null),
  }, async ({ page }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl;
    await page.goto(BASE + '#/op/' + codif(n), { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarDesfechoDaAbertura(page); await espera(800);
    const e = await estadoOp(page);
    const al = await A(page);
    const msgs = al.filter(a => a.includes('Não foi possível abrir a OP ' + n));
    confere('UMA mensagem dizendo que a leitura falhou', msgs.length === 1 && /a leitura falhou/.test(msgs[0]) && !/não a encontrei/.test(msgs[0]), JSON.stringify(al));
    confere('sem janela, sem "Abrindo…" e com o endereço limpo', e.janelas === 0 && e.carregando === null && e.hash === '#/inicio', JSON.stringify({ j: e.janelas, c: e.carregando, h: e.hash }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C28 O número da OP muda com a janela aberta (menu "Alterar o número da OP", feito pela tela): o endereço e o título acompanham', {
    // a troca é a função do banco `renomear_opl` (POST): o teste a bloqueia (nada chega ao banco) e responde como se o banco tivesse trocado o número
    escritaSimulada: (url, metodo, corpo) => {
      if (metodo !== 'POST' || !/\/rest\/v1\/rpc\/renomear_opl/.test(url)) return null;
      const c = JSON.parse(corpo || '{}');
      return { status: 200, body: { antigo: OPS && OPS.comum && OPS.comum.opl, novo: c.p_novo, ops: 1, referencias: 0 } };
    },
  }, async ({ page, gravacoes }) => {
    const ops = await opsDeTeste();
    const n = ops.comum.opl, NOVO = 'ZZ-RENOMEADA.0001';
    await page.goto(BASE + '#/op/' + codif(n), { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaOp(page, 'OP ' + n); await espera(900);
    const h0 = (await estadoOp(page)).historico;
    await page.evaluate(() => document.querySelector('.acn-opl[role="dialog"] button[aria-label="Mais ações da OP"]').click());
    await page.waitForSelector('.acn-menu [role="menuitem"]', { timeout: 8000 });
    await page.evaluate(() => {
      const i = [...document.querySelectorAll('.acn-menu [role="menuitem"]')].find(b => b.innerText.trim() === 'Alterar o número da OP');
      if (!i) throw new Error('o menu da OP não tem "Alterar o número da OP"');
      i.click();
    });
    await page.waitForSelector('.acn-dialogo-campo', { timeout: 8000 });
    await page.focus('.acn-dialogo-campo'); await espera(250);
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.type(NOVO, { delay: 10 });
    await page.keyboard.press('Enter');
    // a 2ª janela (a de confirmar a troca) aparece sem o campo de texto
    await page.waitForFunction(() => document.querySelector('.acn-dialogo') && !document.querySelector('.acn-dialogo-campo'), { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('.acn-dialogo-rodape button')].pop().click());
    await esperarJanelaOp(page, 'OP ' + NOVO); await espera(900);
    let e = await estadoOp(page);
    const rpc = gravacoes.filter(g => /\/rest\/v1\/rpc\/renomear_opl/.test(g.url));
    const corpo = rpc[0] ? JSON.parse(rpc[0].corpo || '{}') : {};
    confere('a troca saiu UMA vez, para a OP certa e com o número digitado (a gravação foi bloqueada pelo teste)', rpc.length === 1 && corpo.p_opl_id === ops.comum.id && corpo.p_novo === NOVO, JSON.stringify(rpc.map(g => g.corpo)));
    confere('a janela segue UMA só, agora com o número novo', e.janelas === 1 && e.rotulos[0] === 'OP ' + NOVO, JSON.stringify({ j: e.janelas, r: e.rotulos }));
    confere('o endereço acompanhou o número novo, sem criar passo no histórico', e.hash === '#/op/' + NOVO && e.historico === h0, JSON.stringify({ h: e.hash, antes: h0, depois: e.historico }));
    confere('o título acompanhou o número novo', e.titulo === 'OP ' + NOVO + ' · ACN', e.titulo);
    const al = await A(page);
    confere('o único aviso foi o "Número alterado: …" da própria troca', al.length === 1 && /^Número alterado: /.test(al[0]), JSON.stringify(al));
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(900);
    e = await estadoOp(page);
    confere('ao fechar, nenhum dos dois números fica na barra: volta ao Início', e.hash === '#/inicio' && e.janelas === 0 && e.titulo === 'Início · ACN', JSON.stringify({ h: e.hash, t: e.titulo }));
  });

  // ───────────────────────────────────────────────────────────────────────────
  for (const [rotulo, largura, altura, toque] of [['celular 375', 375, 812, true], ['celular 360', 360, 740, true], ['celular 320', 320, 640, true], ['tablet 820', 820, 1180, true]]) {
    await cenario(`C29 Janela da OP com o "Copiar link" — ${rotulo}: sem rolagem para o lado, botão inteiro na tela`, { largura, altura, toque }, async ({ page }) => {
      const ops = await opsDeTeste();
      const n = ops.comum.opl, rot = 'OP ' + n;
      await page.goto(BASE + '#/op/' + codif(n), { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(900);
      await page.screenshot({ path: FOTOS + '/op_copiar_link_' + rotulo.replace(/\s+/g, '_') + '.png' });   // para olhar com os olhos o cabeçalho com o botão novo
      const m = await page.evaluate(() => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { esq: Math.round(r.left), dir: Math.round(r.right), alt: Math.round(r.height), larg: Math.round(r.width) }; };
        const b = document.querySelector('.acn-opl-cab-acoes button[aria-label="Copiar o link desta OP"]');
        const x = document.querySelector('.acn-opl-x');
        const largura = window.innerWidth;
        // só os controles de ação do cabeçalho (o botão novo, o menu e o X): o título longo e o resto do cabeçalho já existiam e não são deste teste
        const passam = [...document.querySelectorAll('.acn-opl-cab-acoes *, .acn-opl-x')].filter(el => { const q = el.getBoundingClientRect(); return q.width > 0 && (q.right > largura + 1 || q.left < -1); }).length;
        // o texto do cabeçalho (quem é a OP) e a barra de ações não podem se cobrir: foi o defeito que a foto do celular mostrou ("Dossiê" por cima do texto)
        const txt = document.querySelector('.acn-opl-cab-txt').getBoundingClientRect();
        const acoes = document.querySelector('.acn-opl-cab-acoes').getBoundingClientRect();
        const seCobrem = !(txt.right <= acoes.left + 1 || acoes.right <= txt.left + 1 || txt.bottom <= acoes.top + 1 || acoes.bottom <= txt.top + 1);
        // a palavra mais comprida da linha de cima ("TRANSFORMAÇÃO") tem de caber na coluna do texto, senão ela passa por baixo dos botões
        const sup = document.querySelector('.acn-opl-cab-sup');
        const ruler = document.createElement('span');
        ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(sup).font + ';letter-spacing:' + getComputedStyle(sup).letterSpacing + ';text-transform:uppercase';
        document.body.appendChild(ruler);
        let palavraMaior = 0;
        for (const p of sup.innerText.split(/\s+/)) { ruler.textContent = p; palavraMaior = Math.max(palavraMaior, ruler.getBoundingClientRect().width); }
        ruler.remove();
        return { botao: b && rect(b), fechar: x && rect(x), janelaLargura: largura, rolagem: document.documentElement.scrollWidth, passam, seCobrem, colunaDoTexto: Math.round(txt.width), palavraMaior: Math.round(palavraMaior) };
      });
      confere('o botão "Copiar link" existe e está inteiro dentro da tela', m.botao && m.botao.esq >= 0 && m.botao.dir <= m.janelaLargura, JSON.stringify(m));
      confere('o botão é fácil de tocar (32 px ou mais de altura)', m.botao && m.botao.alt >= 32, JSON.stringify(m.botao));
      confere('o X de fechar continua inteiro dentro da tela', m.fechar && m.fechar.esq >= 0 && m.fechar.dir <= m.janelaLargura, JSON.stringify(m.fechar));
      confere('sem rolagem para o lado', m.rolagem <= m.janelaLargura, JSON.stringify(m));
      confere('nenhum controle de ação do cabeçalho passa da borda da tela', m.passam === 0, String(m.passam));
      confere('a barra de ações NÃO cobre o texto do cabeçalho', m.seCobrem === false, JSON.stringify(m));
      confere('a palavra mais comprida do cabeçalho cabe na coluna do texto', m.palavraMaior <= m.colunaDoTexto, JSON.stringify({ coluna: m.colunaDoTexto, palavra: m.palavraMaior }));
      // no celular as ações viram uma barra no alto e o texto fica com a largura toda (a foto mostrou ~27% antes do conserto); no tablet as ações ficam ao lado do texto, e 40% já separa o normal de um título espremido
      confere('a coluna do texto tem folga de verdade (celular: 60% da largura da tela; tablet: 40%)', m.colunaDoTexto >= m.janelaLargura * (largura <= 640 ? 0.6 : 0.4), JSON.stringify({ coluna: m.colunaDoTexto, tela: m.janelaLargura }));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Janela de OP aberta de DENTRO de outra: o caso do lote ("Abrir o lote" → o número clicável de outra unidade). A lista de janelas abertas do `OpNoEndereco` existe para isso:
  // a de baixo NÃO se fecha quando a de cima escreve o endereço dela, e cada X ou Voltar tira só uma.
  await cenario('C30 OP aberta de dentro de outra (o lote): duas janelas, a de baixo fica; o X e o Voltar tiram só a de cima', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    confere('há um lote com pelo menos duas unidades vivas para o teste', !!ops.loteComVarias, 'nenhum lote do banco tem duas unidades não canceladas');
    if (!ops.loteComVarias) return;
    const a = ops.loteComVarias.opl, rotA = 'OP ' + a, endA = '#/op/' + codif(a);
    const soOps = (x) => x.rotulos.filter(r => /^OP /.test(r));
    const LINK_DO_LOTE = '.acn-opl[role="dialog"][aria-label^="Lote "] span.acn-ats-link[title="Abrir detalhes da OP"]';
    const fecharJanelaDe = (rot) => page.evaluate((r) => {
      const j = [...document.querySelectorAll('.acn-opl[role="dialog"]')].find(d => d.getAttribute('aria-label') === r);
      if (!j) throw new Error('não achei a janela ' + r);
      j.querySelector('.acn-opl-x').click();
    }, rot);
    const esperarSemJanela = (rot) => page.waitForFunction((r) => ![...document.querySelectorAll('.acn-opl[role="dialog"]')].some(d => d.getAttribute('aria-label') === r), { timeout: 12000 }, rot);

    await abrirComoLinkColado(page, endA);
    await esperarSistema(page); await esperarJanelaOp(page, rotA); await espera(900);
    const inicio = await estadoOp(page);
    const h0 = inicio.historico;
    // menu "Mais ações da OP" → "Abrir o lote (N)": a janela do lote traz o "Carro a carro", com cada unidade como número clicável
    await page.evaluate(() => document.querySelector('.acn-opl[role="dialog"] button[aria-label="Mais ações da OP"]').click());
    await page.waitForSelector('.acn-menu [role="menuitem"]', { timeout: 8000 });
    // 26/11/2026: a janela só sabe quantas unidades o lote tem depois de ler o banco (a contagem começa em 0 e o item "Abrir o lote" fica escondido até lá); olhar uma vez só, 0,9 s depois
    // de abrir, falhou uma vez com o banco mais lento. O menu aberto se redesenha quando a contagem chega, então se espera o item aparecer.
    await page.waitForFunction(() => [...document.querySelectorAll('.acn-menu [role="menuitem"]')].some(m => /^Abrir o lote \(\d+\)$/.test(m.innerText.trim())), { timeout: 25000 })
      .catch(() => { throw new Error('o menu da OP não tem "Abrir o lote (N)", nem esperando 25 s a leitura das unidades do lote'); });
    await page.evaluate(() => {
      [...document.querySelectorAll('.acn-menu [role="menuitem"]')].find(m => /^Abrir o lote \(\d+\)$/.test(m.innerText.trim())).click();
    });
    await page.waitForFunction((s) => document.querySelector(s), { timeout: 30000 }, LINK_DO_LOTE);
    const b = await page.evaluate((s, num) => [...document.querySelectorAll(s)].map(x => x.innerText.trim()).find(n => n && n !== num) || null, LINK_DO_LOTE, a);
    confere('a janela do lote lista outra unidade para abrir', !!b, 'só a própria unidade apareceu');
    if (!b) return;
    const rotB = 'OP ' + b, endB = '#/op/' + codif(b);
    // clica na unidade B e vigia por uns segundos: o hospedeiro não pode ler a OP à toa nem abrir uma TERCEIRA janela depois da leitura
    const abrirB = async () => {
      await page.evaluate((s, n) => [...document.querySelectorAll(s)].find(x => x.innerText.trim() === n).click(), LINK_DO_LOTE, b);
      await esperarJanelaOp(page, rotB);
      return vigiarJanelasDeOp(page, 3000);
    };

    // 1) a segunda abre de dentro da primeira
    const vigia = await abrirB();
    let e = await estadoOp(page);
    confere('as DUAS janelas de OP ficam abertas (a de baixo não se fecha quando a de cima escreve o endereço), e nenhuma terceira aparece', soOps(e).length === 2 && soOps(e).includes(rotA) && soOps(e).includes(rotB) && vigia.maxJanelas === 2 && !vigia.viuCarregando, JSON.stringify({ r: e.rotulos, ...vigia }));
    confere('o endereço e o título são os da de cima, com UM passo novo no histórico', e.hash === endB && e.titulo === rotB + ' · ACN' && e.historico === h0 + 1, JSON.stringify({ h: e.hash, t: e.titulo, antes: h0, depois: e.historico }));

    // 2) o X da de cima: só ela sai, e o endereço volta ao da de baixo
    await fecharJanelaDe(rotB); await esperarSemJanela(rotB); await espera(900);
    e = await estadoOp(page);
    confere('o X da de cima fecha SÓ ela: a de baixo continua, com o endereço e o título dela', soOps(e).length === 1 && soOps(e)[0] === rotA && e.hash === endA && e.titulo === rotA + ' · ACN', JSON.stringify({ r: e.rotulos, h: e.hash, t: e.titulo }));
    confere('a janela do lote, por baixo delas, continua aberta', e.rotulos.some(r => /^Lote /.test(r)), JSON.stringify(e.rotulos));

    // 3) abre de novo e usa o Voltar do navegador
    await abrirB();
    await page.goBack(); await esperarSemJanela(rotB); await espera(900);
    e = await estadoOp(page);
    confere('o Voltar do navegador também tira SÓ a de cima', soOps(e).length === 1 && soOps(e)[0] === rotA && e.hash === endA && e.titulo === rotA + ' · ACN', JSON.stringify({ r: e.rotulos, h: e.hash, t: e.titulo }));

    // 4) o Avançar mostra a OP que o endereço pede
    await page.goForward(); await esperarJanelaOp(page, rotB); await espera(1200);
    e = await estadoOp(page);
    confere('o Avançar mostra a OP que o endereço pede, com o título dela e sem "Abrindo…" preso', soOps(e).includes(rotB) && e.hash === endB && e.titulo === rotB + ' · ACN' && e.carregando === null, JSON.stringify({ r: e.rotulos, h: e.hash, t: e.titulo, c: e.carregando }));

    // 5) o X da que sobrou volta um passo (o passo é do sistema): o endereço é o da anterior, e ela é reaberta
    await fecharJanelaDe(rotB); await esperarJanelaOp(page, rotA); await espera(900);
    e = await estadoOp(page);
    confere('o X dessa OP leva de volta à anterior (um passo atrás no histórico)', soOps(e).length === 1 && soOps(e)[0] === rotA && e.hash === endA && e.titulo === rotA + ' · ACN', JSON.stringify({ r: e.rotulos, h: e.hash, t: e.titulo }));

    // 6) o X da primeira: link colado, sem passo anterior dentro do sistema → o endereço vira o da tela de baixo
    await fecharJanelaDe(rotA); await esperarSemJanelaOp(page); await espera(900);
    e = await estadoOp(page);
    confere('o X da última volta ao Início, sem passo novo e sem sair do sistema', e.hash === '#/inicio' && e.janelas === 0 && e.historico === h0 + 1 && e.origem === inicio.origem && e.titulo === 'Início · ACN', JSON.stringify({ h: e.hash, j: e.janelas, hist: [h0, e.historico], o: e.origem, t: e.titulo }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Link digitado em minúscula ou sem acento: o endereço acha a OP pela coluna `opl_norm` (o número sem maiúscula nem acento) quando o número exato não existe
  await cenario('C31 Link em minúscula e sem acento: abre a mesma OP, com o título certo, e fechar leva ao Início', {}, async ({ page }) => {
    const ops = await opsDeTeste();
    const casos = [['em minúscula', ops.comum.opl, ops.comum.opl.toLowerCase()]];
    if (ops.comAcento) casos.push(['em minúscula e sem acento (número antigo)', ops.comAcento.opl, ops.comAcento.opl_norm]);
    else console.log('   (nenhuma OP com acento no número: o caso sem acento não se aplica)');
    for (const [nome, real, digitado] of casos) {
      const rot = 'OP ' + real;
      await abrirComoLinkColado(page, '#/op/' + codif(digitado));
      await esperarSistema(page); await esperarJanelaOp(page, rot); await espera(700);
      const e = await estadoOp(page);
      confere(`link ${nome}: abre a OP certa, uma janela só`, e.janelas === 1 && e.rotulos[0] === rot, JSON.stringify({ r: e.rotulos, digitado }));
      confere(`link ${nome}: o título é o da OP`, e.titulo === rot + ' · ACN', e.titulo);
      await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(700);
      const f = await estadoOp(page);
      confere(`link ${nome}: fechar leva ao Início, sem deixar o endereço digitado na barra`, f.hash === '#/inicio' && f.janelas === 0, JSON.stringify({ h: f.hash }));
    }
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n══════════ RESUMO ══════════');
  const falhas = resultados.filter(r => !r.ok);
  console.log(`${resultados.length - falhas.length} de ${resultados.length} conferências passaram; ${falhas.length} falharam`);
  falhas.forEach(f => console.log('  FALHOU: ' + f.nome + '\n          ' + f.detalhe));
  console.log('\ngravações que o sistema TENTOU fazer (todas abortadas pelo teste):');
  Object.entries(gravacoesVistas).sort().forEach(([k, n]) => console.log(`  ${n}x ${k}`));
  fs.writeFileSync(SAIDA + '/resultado_enderecos.json', JSON.stringify({ quando: new Date().toISOString(), total: resultados.length, falhas: falhas.length, resultados }, null, 1));
  process.exit(falhas.length ? 1 : 0);
})();
