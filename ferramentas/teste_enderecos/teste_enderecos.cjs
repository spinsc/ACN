// Teste de navegador da Fase 1 do plano de endereços e rotas (25/11/2026).
// Padrão do projeto: Chrome do Windows + puppeteer-core, conta ZZTESTE, TODA gravação externa abortada (nada chega ao banco);
// cada cenário abre um navegador novo (isolado) e eles rodam EM SÉRIE. As permissões "do banco" de cada cenário são simuladas na leitura
// do próprio cadastro da pessoa (auth_usuarios), para provar o link de tela sem acesso, a permissão velha e a permissão nova.
// Os avisos do sistema (alert) viram aviso no canto da tela (main.tsx): o lib_enderecos.cjs os guarda para o teste ler (`A`) e zerar (`LA`).
const { abrir, espera, esperarSistema, estado, clicarNoMenu, lerAlertas, limparAlertas, BASE, ID_ZZTESTE, USUARIO_ADMIN } = require('./lib_enderecos.cjs');
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
    confere('Voltar de novo → #/inicio com a tela Início', e.hash === '#/inicio' && /Boa (noite|tarde|dia)/.test(e.texto), e.hash + ' | ' + e.texto);
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
