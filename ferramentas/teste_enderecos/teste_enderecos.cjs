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

// ── Fase 3 (26/11/2026): licitação, card do CRM, pedido de compra e OS com endereço próprio (`#/<tela>/<palavra>/<código>`) ──
// Cada registro é descrito uma vez (`FASE3`) e os cenários C32 a C44 rodam nos quatro: o que muda de um para outro é o seletor da janela, o título dela e o botão de fechar.
const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const UUID_INEXISTENTE = '00000000-0000-4000-8000-00000000f003';
const FASE3 = [
  { tipo: 'licitacao', tela: 'licitacoes', nome: 'licitacoes', menu: 'Licitações', aba: 'Licitações · ACN', rotulo: 'a licitação', de: 'da licitação', contextoMencao: 'licitacao', abaMencao: 'licitacoes',
    tabela: 'licitacoes', colunas: 'id,numero', filtro: 'numero=not.is.null', ordem: 'criado_em.desc', esperado: (r) => r.numero,
    janela: '.acn-lic-overlay.acn-lic-ov-card', titulo: '.acn-lic-cab-titulo', fechar: '.acn-lic-cab-acoes button[aria-label="Fechar"]', copiar: '.acn-lic-cab-acoes button[aria-label="Copiar o link desta licitação"]', acoes: '.acn-lic-cab-acoes' },
  { tipo: 'card', tela: 'crm', nome: 'crm', menu: 'Comercial / CRM', aba: 'Comercial / CRM · ACN', rotulo: 'o card', de: 'do card', contextoMencao: 'crm', abaMencao: 'crm',
    tabela: 'crm_oportunidades', colunas: 'id,titulo', filtro: 'titulo=not.is.null', ordem: 'criado_em.desc', esperado: (r) => r.titulo,
    janela: '.acn-crm-ab-fundo', titulo: '.acn-crm-ab-titulo', fechar: '.acn-crm-ab-acoes button[aria-label="Fechar"]', copiar: '.acn-crm-ab-acoes button[aria-label="Copiar o link deste card"]', acoes: '.acn-crm-ab-acoes' },
  { tipo: 'pedido', tela: 'compras', nome: 'compras', menu: 'Compras', aba: 'Compras · ACN', rotulo: 'o pedido de compra', de: 'do pedido', contextoMencao: 'compra', abaMencao: 'compras',
    tabela: 'pcp_pedidos_compra', colunas: 'id,numero_pedido', filtro: 'numero_pedido=not.is.null', ordem: 'numero_pedido.desc', esperado: (r) => 'Mesa de Cotações — ' + r.numero_pedido,
    janela: '[role="dialog"][aria-label="Mesa de cotações"]', titulo: '.modal-title', fechar: null, copiar: '[role="dialog"][aria-label="Mesa de cotações"] button[aria-label="Copiar o link deste pedido"]', acoes: '[role="dialog"][aria-label="Mesa de cotações"] .acn-modal-cab' },
  { tipo: 'os', tela: 'sac', nome: 'sac', menu: 'SAC', aba: 'SAC · ACN', rotulo: 'a OS', de: 'da OS', contextoMencao: 'sac', abaMencao: 'sac',
    tabela: 'sac_ordens_servico', colunas: 'id,numero_os', filtro: 'numero_os=not.is.null', ordem: 'data_abertura.desc', esperado: (r) => 'Resumo da OS ' + r.numero_os,
    janela: '[role="dialog"][aria-label^="Resumo da OS"]', titulo: null, fechar: '[role="dialog"][aria-label^="Resumo da OS"] button[aria-label="Fechar"]', copiar: '[role="dialog"][aria-label^="Resumo da OS"] button[aria-label="Copiar o link desta OS"]', acoes: '.acn-srs-acoes' },
];
const enderecoDe = (F, id) => `#/${F.nome}/${F.tipo}/${id}`;
const reRegistro = (F) => new RegExp(`^#/${F.nome}/${F.tipo}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`, 'i');

// os registros reais que os cenários abrem (lidos com o crachá da conta de teste: SÓ LEITURA, nada é gravado)
let REGS = null;
async function registrosDoBanco() {
  if (REGS) return REGS;
  const s = await crachaDeTeste();
  const ler = async (tabela, qs) => {
    const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?${qs}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token } });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error(`a leitura de ${tabela} foi recusada: ` + JSON.stringify(d).slice(0, 200));
    return d;
  };
  REGS = {};
  for (const F of FASE3) {
    const linhas = await ler(F.tabela, `select=${F.colunas}&${F.filtro}&order=${F.ordem}&limit=8`);
    // dois registros com títulos DIFERENTES: o teste de trocar de um para o outro precisa distinguir qual aparece
    const a = linhas[0];
    const b = linhas.find(x => x.id !== a.id && norm(F.esperado(x)) !== norm(F.esperado(a)));
    REGS[F.tipo] = { a, b };
  }
  // um card com UMA só OP viva: o C41 abre a OP de dentro do card
  const ops = await ler('oples', 'select=id,opl,crm_oportunidade_id&crm_oportunidade_id=not.is.null&status_geral=neq.Cancelado&order=data_entrada.desc&limit=300');
  const porCard = {};
  for (const o of ops) (porCard[o.crm_oportunidade_id] = porCard[o.crm_oportunidade_id] || []).push(o);
  const cardId = Object.keys(porCard).find(k => porCard[k].length === 1 && !/[\s/]/.test(porCard[k][0].opl));
  if (cardId) {
    const cards = await ler('crm_oportunidades', `select=id,titulo&id=eq.${cardId}`);
    REGS.cardComOp = cards[0] ? { card: cards[0], op: porCard[cardId][0] } : null;
  } else REGS.cardComOp = null;
  return REGS;
}
async function doBanco(F, id) {
  const s = await crachaDeTeste();
  const r = await fetch(`${URL_BASE}/rest/v1/${F.tabela}?select=${F.colunas}&id=eq.${id}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token } });
  const d = await r.json();
  return Array.isArray(d) ? (d[0] || null) : null;
}

/** O que a pessoa vê agora do registro: endereço, título da aba, passos do histórico, janelas abertas (do registro, da OP e o Acompanhamento da OS do SAC) e o aviso de endereço. */
const estadoReg = (page, F) => page.evaluate((sel) => {
  const aviso = document.querySelector('.acn-endereco-aviso');
  return {
    hash: location.hash, titulo: document.title, historico: history.length, marca: !!(history.state && history.state.acn === 1),
    janelas: document.querySelectorAll(sel).length,
    opJanelas: document.querySelectorAll('.acn-opl-overlay').length,
    acomp: document.querySelectorAll('[role="dialog"][aria-label="Acompanhamentos"]').length,
    painelAberto: !!document.querySelector('.acn-gav'),
    aviso: aviso ? aviso.innerText.replace(/\s+/g, ' ').trim() : null,
    origem: location.origin + location.pathname,
  };
}, F.janela);
const lerTituloDaJanela = (page, F) => page.evaluate((F) => {
  const j = document.querySelector(F.janela);
  if (!j) return null;
  if (F.tipo === 'os') return j.getAttribute('aria-label');
  const t = F.tipo === 'pedido' ? j.querySelector(F.titulo) : document.querySelector(F.titulo);
  return t ? t.innerText : null;
}, { janela: F.janela, tipo: F.tipo, titulo: F.titulo });
/** Espera a janela do registro `reg` (pelo título dela, não só por "existe uma janela": trocar de A para B tem de esperar o B). */
const esperarJanelaDe = (page, F, reg, ms = 30000) => page.waitForFunction((F, esperado) => {
  const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  const j = document.querySelector(F.janela);
  if (!j) return false;
  let t = null;
  if (F.tipo === 'os') t = j.getAttribute('aria-label');
  else { const x = F.tipo === 'pedido' ? j.querySelector(F.titulo) : document.querySelector(F.titulo); t = x && x.innerText; }
  return norm(t) === esperado;
}, { timeout: ms }, { janela: F.janela, tipo: F.tipo, titulo: F.titulo }, norm(F.esperado(reg)));
const esperarSemJanela3 = (page, F, ms = 15000) => page.waitForFunction((sel) => !document.querySelector(sel), { timeout: ms }, F.janela);
const fecharRegistro = (page, F) => page.evaluate((F) => {
  if (F.tipo === 'pedido') {
    const b = [...document.querySelectorAll(F.janela + ' button')].find(x => x.innerText.trim() === 'Fechar');
    if (!b) throw new Error('não achei o botão "Fechar" da Mesa de Cotações');
    b.click(); return;
  }
  const x = document.querySelector(F.fechar);
  if (!x) throw new Error('não achei o botão de fechar de ' + F.tipo);
  x.click();
}, { tipo: F.tipo, janela: F.janela, fechar: F.fechar });
/** Abre o primeiro registro da lista da tela, com um clique de verdade (o caminho de quem usa o sistema). */
async function abrirPelaLista(page, F) {
  if (F.tipo === 'pedido') {
    // o Compras abre no Resumo; as listas (Tabela e Kanban) têm o botão que abre a Mesa de Cotações conforme a etapa do pedido
    await page.waitForFunction(() => [...document.querySelectorAll('.acn-main button')].some(x => x.innerText.trim() === 'Tabela'), { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll('.acn-main button')].find(x => x.innerText.trim() === 'Tabela').click());
    const BOTAO = '^(Cotações|Ver Aprovação|Ver\\/Corrigir Cotações)';
    await page.waitForFunction((re) => [...document.querySelectorAll('.acn-main button')].some(x => new RegExp(re).test(x.innerText.trim())), { timeout: 30000 }, BOTAO);
    await page.evaluate((re) => [...document.querySelectorAll('.acn-main button')].find(x => new RegExp(re).test(x.innerText.trim())).click(), BOTAO);
    return;
  }
  const CARTAO = { licitacao: '.acn-licit', card: '.acn-crm-card.abrivel', os: '.acn-kb-card.abrivel' }[F.tipo];
  await page.waitForSelector(CARTAO, { timeout: 30000 });
  await page.evaluate((s) => document.querySelector(s).click(), CARTAO);
}
/** Espera o DESFECHO de uma abertura que o endereço pediu e o sistema recusou: o endereço deixa de ser o do registro. */
const esperarDesfechoDoRegistro = (page, F, ms = 25000) => page.waitForFunction((n, t) => !new RegExp('^#/' + n + '/' + t + '/', 'i').test(location.hash), { timeout: ms }, F.nome, F.tipo).catch(() => {});
const msgNaoAchou = (F) => { const art = F.rotulo.startsWith('a ') ? 'a' : 'o'; return `Não foi possível abrir ${F.rotulo}: não ${art} encontrei, ou você não tem acesso a ${art === 'a' ? 'ela' : 'ele'}.`; };
const msgLeituraFalhou = (F, erro) => `Não foi possível abrir ${F.rotulo}: a leitura falhou (${erro}). Tente de novo.`;
/** O clipboard de mentira do C22, valendo para qualquer tela: guarda o que foi copiado (forma moderna e forma antiga) e deixa o teste escolher o modo. */
const instalarClipboardDeTeste = (page) => page.evaluateOnNewDocument(() => {
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

// ── Fase 4 (26/11/2026): as abas de dentro de cada tela (`#/<tela>/<aba>`) ──
// Cada tela com abas é descrita UMA vez (`FASE4`: o menu e o rótulo que a pessoa vê em cada aba) e o cenário C45 roda em todas. O quadro (quais abas a tela tem, qual é a padrão e o nome de
// cada uma no endereço) vem do PRÓPRIO `Rotas.ts`, lido do código: se uma tela entra no quadro e não aqui, ou o rótulo mudou, o teste pega.
let ROTAS = null;
const FASE4 = [
  { id: 'compras', menu: 'Compras', rotulos: { pedidos: 'Requisições', fornecedores: 'Fornecedores' } },
  { id: 'sac', menu: 'SAC', rotulos: { os: 'Ordens de Serviço', chamados_nfc: 'Chamados NFC', garantia: 'Garantia', cadastros: 'Cadastros' } },
  { id: 'formacao_precos', menu: 'Formação de preços', rotulos: { formacao: 'Formação de Preços', precos_formados: 'Preços Formados' } },
  { id: 'crm', menu: 'Comercial / CRM', rotulos: { kanban: 'Kanban', agenda: 'Agenda', recentes: 'Últimas visualizadas', relatorio: 'Relatório', opls: 'OPs em aberto', faturamentos: 'Faturamentos', demandas: 'Demandas', contatos: 'Contatos' } },
  { id: 'producao', menu: 'Adaptação', rotulos: { producao: 'Produção', veicular: 'SAC veicular', agenda: 'Agendamentos', voucher: 'Voucher', equipes: 'Equipes' } },
  { id: 'rh', menu: 'RH', rotulos: { geral: 'Visão geral', colaboradores: 'Colaboradores', ponto: 'Relógio Ponto', comissoes: 'Comissões', relatorios: 'Relatórios', autorizacoes: 'Autorizações' } },
  { id: 'serralheria', menu: 'Serralheria', rotulos: { demandas: 'Demandas Ativas', relatorios: 'Relatórios' } },
  { id: 'chicotes', menu: 'Chicotes', rotulos: { demandas: 'Demandas Ativas', relatorios: 'Relatórios' } },
  { id: 'laboratorio', menu: 'Laboratório', rotulos: { demandas: 'Demandas Ativas', relatorios: 'Relatórios' } },
  { id: 'engenharia', menu: 'Engenharia', rotulos: { analise: 'Análise', desenvolvimento: 'Desenvolvimento', estruturas: 'Estruturas', horas: 'Horas/Tarefas' } },
  { id: 'financeiro', menu: 'Financeiro', rotulos: { pendencias: 'Pendências', centros: 'Centros de custo', conciliacao: 'Conciliação bancária', kanban: 'Tarefas', custoop: 'Custo por OP', demandas: 'Demandas' } },
  { id: 'marketing', menu: 'Marketing', rotulos: { opls: 'OPs Liberadas para Divulgação', pedidos: 'Pedidos de Registro' } },
  { id: 'telecom', menu: 'Telecom', rotulos: { vendas: 'Vendas', separacao: 'Separação e envio', demandas: 'Análises e demandas' } },
  { id: 'terceiros', menu: 'Serviços de terceiros', lembra: 'lista', rotulos: { quadro: 'Quadro', agenda: 'Agenda', lista: 'Lista', relatorio: 'Relatório do mês', ordens: 'Ordens de pintura', prestadores: 'Prestadores', tipos: 'Tipos de serviço', modelo: 'Modelo do contrato' } },
];
/** As abas da barra de abas número `n` da tela aberta (na ordem em que aparecem), qual está marcada, o endereço e quantos passos o histórico tem. */
const estadoAbas = (page, n = 0) => page.evaluate((n) => {
  const listas = [...document.querySelectorAll('.acn-main [role="tablist"]')];
  const l = listas[n];
  const abas = l ? [...l.querySelectorAll('[role="tab"]')].map(b => ({ rotulo: ((b.querySelector('span') || b).innerText || '').replace(/\s*\([^)]*\)\s*$/, '').trim(), ativa: b.getAttribute('aria-selected') === 'true' })) : [];
  return { hash: location.hash, historico: history.length, abas, rotulos: abas.map(a => a.rotulo), ativas: abas.filter(a => a.ativa).map(a => a.rotulo), listas: listas.length };
}, n);
const clicarNaAba = (page, rotulo, n = 0) => page.evaluate((r, n) => {
  const l = [...document.querySelectorAll('.acn-main [role="tablist"]')][n];
  const b = l && [...l.querySelectorAll('[role="tab"]')].find(x => ((x.querySelector('span') || x).innerText || '').replace(/\s*\([^)]*\)\s*$/, '').trim() === r);   // o "(12)" no fim do rótulo (Marketing) muda com os dados: não conta
  if (!b) throw new Error('aba não achada: ' + r);
  b.click();
}, rotulo, n);
const esperarAbas = (page, n = 0, ms = 40000) => page.waitForFunction((n) => document.querySelectorAll('.acn-main [role="tablist"]').length > n, { timeout: ms }, n);

(async () => {
  ROTAS = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../src/Rotas.ts')).href);
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
  // ── Fase 3 (26/11/2026): licitação, card do CRM, pedido de compra e OS com endereço próprio. Os cenários C32 a C44 rodam nos quatro (`FASE3`). ──
  for (const F of FASE3) {
    await cenario(`C32 ${F.nome}: o clique na lista escreve o endereço do registro; Voltar fecha, Avançar reabre e o X volta um passo`, {}, async ({ page }) => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await espera(1200);
      await clicarNoMenu(page, F.menu); await espera(2000);
      const antes = await estadoReg(page, F);
      confere(`${F.nome}: o menu abre a tela (#/${F.nome}) com o título dela`, antes.hash === '#/' + F.nome && antes.titulo === F.aba, JSON.stringify({ h: antes.hash, t: antes.titulo }));
      await abrirPelaLista(page, F);
      await page.waitForSelector(F.janela, { timeout: 30000 });
      await espera(1000);
      let e = await estadoReg(page, F);
      const id = (e.hash.match(reRegistro(F)) || [])[1];
      confere(`${F.nome}: o endereço do registro foi escrito (#/${F.nome}/${F.tipo}/<código>)`, !!id, e.hash);
      confere(`${F.nome}: UM passo novo no histórico, do próprio sistema`, e.historico === antes.historico + 1 && e.marca === true, JSON.stringify({ antes: antes.historico, depois: e.historico, marca: e.marca }));
      confere(`${F.nome}: o título da aba continua o da tela`, e.titulo === F.aba, e.titulo);
      confere(`${F.nome}: uma janela só`, e.janelas === 1, String(e.janelas));
      if (!id) return;
      const reg = await doBanco(F, id);
      confere(`${F.nome}: o código do endereço é de um registro que existe no banco`, !!reg, id);
      if (!reg) return;
      const tit = await lerTituloDaJanela(page, F);
      confere(`${F.nome}: a janela mostra o registro do endereço (não outro)`, norm(tit) === norm(F.esperado(reg)), `${tit} ≠ ${F.esperado(reg)}`);
      await page.goBack(); await esperarSemJanela3(page, F); await espera(600);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Voltar fecha a janela e volta ao endereço da tela`, e.hash === '#/' + F.nome && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
      await page.goForward(); await esperarJanelaDe(page, F, reg); await espera(600);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Avançar reabre o MESMO registro, uma janela só`, e.hash === enderecoDe(F, id) && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(800);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o X volta um passo (endereço da tela), sem janela`, e.hash === '#/' + F.nome && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
      const al = await A(page);
      confere(`${F.nome}: nenhum aviso`, al.length === 0, JSON.stringify(al));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    await cenario(`C33 ${F.nome}: link colado (primeira página) abre por cima da tela; o X troca o endereço pelo da tela e NUNCA sai do sistema`, {}, async ({ page }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(800);
      let e = await estadoReg(page, F);
      const origem = e.origem, h0 = e.historico;
      confere(`${F.nome}: o link colado abre o registro certo, uma janela só, no endereço do link`, e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      confere(`${F.nome}: por baixo fica a tela dona (título da aba)`, e.titulo === F.aba, e.titulo);
      confere(`${F.nome}: o passo do link colado não é do sistema e abrir não criou passo`, e.marca === false && h0 <= 2, JSON.stringify({ marca: e.marca, h0 }));
      await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(900);
      e = await estadoReg(page, F);
      confere(`${F.nome}: fechar troca o endereço pelo da tela (#/${F.nome}), sem janela`, e.hash === '#/' + F.nome && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
      confere(`${F.nome}: continua no sistema (mesma página) e sem passo novo`, e.origem === origem && e.historico === h0, JSON.stringify({ o: origem, h0, h1: e.historico }));
      confere(`${F.nome}: o título da aba continua o da tela`, e.titulo === F.aba, e.titulo);
      const al = await A(page);
      confere(`${F.nome}: nenhum aviso`, al.length === 0, JSON.stringify(al));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    await cenario(`C34 ${F.nome}: F5 com o registro aberto reabre o mesmo registro (aberto por link e aberto por clique)`, {}, async ({ page }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      // 1) aberto por link colado
      await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(600);
      await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(600);
      let e = await estadoReg(page, F);
      confere(`${F.nome}: F5 (aberto por link): reabre o mesmo registro, no mesmo endereço, uma janela`, e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(800);
      e = await estadoReg(page, F);
      confere(`${F.nome}: depois do F5 o X leva ao endereço da tela`, e.hash === '#/' + F.nome && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
      // 2) aberto por clique (o passo é do sistema) e F5: o X continua voltando um passo
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await espera(1000);
      await clicarNoMenu(page, F.menu); await espera(2000);
      await abrirPelaLista(page, F);
      await page.waitForSelector(F.janela, { timeout: 30000 }); await espera(800);
      e = await estadoReg(page, F);
      const id = (e.hash.match(reRegistro(F)) || [])[1];
      const reg = id ? await doBanco(F, id) : null;
      confere(`${F.nome}: aberto por clique, o endereço foi escrito e é de um registro que existe`, !!reg, e.hash);
      if (!reg) return;
      await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await esperarJanelaDe(page, F, reg); await espera(600);
      e = await estadoReg(page, F);
      confere(`${F.nome}: F5 (aberto por clique): reabre o mesmo registro e o passo continua sendo do sistema`, e.hash === enderecoDe(F, id) && e.janelas === 1 && e.marca === true, JSON.stringify({ h: e.hash, j: e.janelas, m: e.marca }));
      await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(900);
      e = await estadoReg(page, F);
      confere(`${F.nome}: depois do F5 o X volta um passo (endereço da tela)`, e.hash === '#/' + F.nome && e.janelas === 0, JSON.stringify({ h: e.hash, j: e.janelas }));
      const al = await A(page);
      confere(`${F.nome}: nenhum aviso`, al.length === 0, JSON.stringify(al));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    let modo = 'normal';
    const lidos = [];
    await cenario(`C35 ${F.nome}: registro que não existe, código que não é código e leitura recusada — UMA mensagem, sem janela, endereço limpo`, {
      simular: (url, r) => {
        if (r.method() !== 'GET' || !url.includes(`/rest/v1/${F.tabela}?select=*&id=eq.`)) return null;
        lidos.push(url);
        return modo === 'recusa' ? { status: 500, body: { message: 'erro simulado do banco' } } : null;
      },
    }, async ({ page }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const casos = [
        ['não existe (código válido)', 'normal', UUID_INEXISTENTE, msgNaoAchou(F), true],
        ['não é um código (texto)', 'normal', 'ZZNAOEXISTE9999', msgNaoAchou(F), false],
        ['o banco recusa a leitura', 'recusa', a.id, msgLeituraFalhou(F, 'erro simulado do banco'), true],
      ];
      for (const [nome, m, codigo, texto, leBanco] of casos) {
        modo = m; lidos.length = 0;
        await LA(page).catch(() => {});
        await abrirComoLinkColado(page, `#/${F.nome}/${F.tipo}/${codigo}`);
        await esperarSistema(page); await esperarDesfechoDoRegistro(page, F); await espera(800);
        const e = await estadoReg(page, F);
        const al = await A(page);
        const msgs = al.filter(x => x.startsWith('Não foi possível abrir ' + F.rotulo));
        confere(`${F.nome} (${nome}): UMA mensagem, a certa`, msgs.length === 1 && msgs[0] === texto, JSON.stringify(al));
        confere(`${F.nome} (${nome}): nenhuma janela e o endereço volta ao da tela`, e.janelas === 0 && e.hash === '#/' + F.nome, JSON.stringify({ j: e.janelas, h: e.hash }));
        confere(`${F.nome} (${nome}): ${leBanco ? 'perguntou ao banco' : 'nem perguntou ao banco (um texto que não é código não existe)'}`, leBanco ? lidos.length >= 1 : lidos.length === 0, JSON.stringify(lidos.map(u => u.slice(-60))));
        await LA(page);
        modo = 'normal';
        await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await espera(1500);
        const depois = await A(page);
        confere(`${F.nome} (${nome}): o F5 depois disso não avisa de novo`, depois.length === 0, JSON.stringify(depois));
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    let lento = true;   // liga e desliga a demora simulada da leitura do registro
    await cenario(`C36 ${F.nome}: banco lento — o Voltar durante a leitura não deixa a janela aparecer depois`, {
      simular: (url, r) => (lento && r.method() === 'GET' && url.includes(`/rest/v1/${F.tabela}?select=*&id=eq.`) ? new Promise(res => setTimeout(() => res(null), 3500)) : null),
    }, async ({ page }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await espera(1200);
      await clicarNoMenu(page, F.menu); await espera(2500);
      await page.evaluate((h) => { location.hash = h; }, end);
      await espera(900);
      let e = await estadoReg(page, F);
      confere(`${F.nome}: enquanto lê, ainda não há janela`, e.janelas === 0, String(e.janelas));
      await page.goBack(); await espera(300);
      await espera(5000);
      e = await estadoReg(page, F);
      confere(`${F.nome}: Voltar durante a espera: a janela NÃO aparece quando a leitura termina`, e.janelas === 0 && e.hash === '#/' + F.nome, JSON.stringify({ j: e.janelas, h: e.hash }));
      // agora sem Voltar: espera a leitura e a janela aparece
      await page.evaluate((h) => { location.hash = h; }, end);
      await esperarJanelaDe(page, F, a); await espera(400);
      e = await estadoReg(page, F);
      confere(`${F.nome}: esperando até o fim, a janela abre no endereço pedido`, e.janelas === 1 && e.hash === end, JSON.stringify({ j: e.janelas, h: e.hash }));
      lento = false;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    await cenario(`C37 ${F.nome}: "Copiar link" copia o endereço completo (moderno, jeito antigo e falha)`, {}, async ({ page }) => {
      await instalarClipboardDeTeste(page);
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(900);
      const existe = await page.evaluate((s) => !!document.querySelector(s), F.copiar);
      confere(`${F.nome}: a janela tem o botão "Copiar link"`, existe, F.copiar);
      if (!existe) return;
      const completo = BASE + end;
      const clicar = async () => { await page.evaluate((s) => document.querySelector(s).click(), F.copiar); await espera(900); };
      const ok = `Link ${F.de} copiado. É só colar na mensagem ou no e-mail.`;
      const falha = `Não foi possível copiar o link ${F.de}. Copie o endereço que está na barra do navegador.`;
      await LA(page); await clicar();
      let al = await A(page);
      const copiado = await page.evaluate(() => window.__copiado);
      confere(`${F.nome}: forma moderna copia o endereço COMPLETO (base atual + #/${F.nome}/${F.tipo}/<código>)`, copiado.length === 1 && copiado[0] === completo, JSON.stringify(copiado) + ' esperado ' + completo);
      confere(`${F.nome}: forma moderna avisa que copiou`, al.length === 1 && al[0] === ok, JSON.stringify(al));
      await page.evaluate(() => { window.__modoCopia = 'recusa'; });
      await LA(page); await clicar();
      al = await A(page);
      const exec = await page.evaluate(() => window.__execCopia);
      confere(`${F.nome}: o navegador recusa a forma moderna: usa o jeito antigo, com o mesmo endereço`, exec.length === 1 && exec[0] === completo, JSON.stringify(exec));
      confere(`${F.nome}: o jeito antigo avisa que copiou`, al.length === 1 && al[0] === ok, JSON.stringify(al));
      confere(`${F.nome}: o campo escondido do jeito antigo é retirado da tela`, (await page.evaluate(() => document.querySelectorAll('.acn-copiar-oculto').length)) === 0);
      await page.evaluate(() => { window.__modoCopia = 'falha'; });
      await LA(page); await clicar();
      al = await A(page);
      confere(`${F.nome}: as duas formas falham: mensagem de erro que manda copiar da barra`, al.length === 1 && al[0] === falha, JSON.stringify(al));
      const e = await estadoReg(page, F);
      confere(`${F.nome}: copiar não mexeu no endereço nem fechou a janela`, e.hash === end && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Menção, aviso, chat e vínculo gravam um "recado" (`__acnDeepLink`) e despacham `acn:abrir-registro` ANTES de trocar de tela; o `irParaTela` traduz o recado em UM endereço.
  const MENCAO = { atual: null };
  for (const F of FASE3) {
    await cenario(`C38 ${F.nome}: Menção — uma passada só (troca de tela e abre o registro certo); Voltar e Avançar acompanham`, {
      simular: (url, r) => (r.method() === 'GET' && url.includes('/rest/v1/mencoes?') && url.includes('select=*') && MENCAO.atual ? { status: 200, body: [MENCAO.atual] } : null),
    }, async ({ page, gravacoes }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      MENCAO.atual = {
        id: '99999999-0000-4000-8000-0000000000' + (10 + FASE3.indexOf(F)), mencionado_id: ID_ZZTESTE, mencionado_nome: 'ZZTESTE', mencionante_nome: 'ZZTESTE Autor',
        contexto: F.contextoMencao, contexto_id: a.id, contexto_descricao: 'registro de teste', aba_destino: F.abaMencao, texto_trecho: 'menção de teste (simulada)',
        lida: false, resolvida: false, criado_em: new Date().toISOString(),
      };
      const partida = F.tipo === 'pedido' ? { menu: 'Licitações', hash: '#/licitacoes' } : { menu: 'Compras', hash: '#/compras' };
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await espera(1200);
      await clicarNoMenu(page, partida.menu); await espera(1800);
      const h0 = (await estadoReg(page, F)).historico;
      await page.evaluate(() => { const b = document.querySelector('[title="Menções"], [title$="pendente(s)"]'); if (!b) throw new Error('botão de Menções não achado'); b.click(); });
      await page.waitForSelector('.acn-men-desc.link', { timeout: 15000 });
      await page.evaluate(() => document.querySelector('.acn-men-desc.link').click());
      // a janela que a Menção abre: no SAC é o Acompanhamento (onde a Menção foi escrita, como sempre foi), nos outros a do registro
      if (F.tipo === 'os') await page.waitForSelector('[role="dialog"][aria-label="Acompanhamentos"]', { timeout: 30000 });
      else await esperarJanelaDe(page, F, a);
      await espera(900);
      let e = await estadoReg(page, F);
      confere(`${F.nome}: a Menção abre o registro certo pelo endereço`, e.hash === end, e.hash);
      confere(`${F.nome}: UM passo só (trocar de tela e abrir o registro não somam dois)`, e.historico === h0 + 1, `${h0} → ${e.historico}`);
      confere(`${F.nome}: a tela dona está por baixo (título da aba)`, e.titulo === F.aba, e.titulo);
      confere(`${F.nome}: o painel de Menções fechou`, e.painelAberto === false);
      if (F.tipo === 'os') confere('os: a Menção abre o Acompanhamento (como sempre), não o resumo', e.acomp === 1 && e.janelas === 0, JSON.stringify({ a: e.acomp, j: e.janelas }));
      else confere(`${F.nome}: uma janela só`, e.janelas === 1, String(e.janelas));
      if (F.tipo === 'card') {
        const aba = await page.evaluate(() => { const t = document.querySelector('.acn-crm-ab-abas [role="tab"][aria-selected="true"]'); return t ? t.innerText.trim() : null; });
        confere('card: a Menção abre na aba "Análise", como sempre', /an[aá]lise/i.test(aba || ''), String(aba));
      }
      // Voltar leva à tela de onde a pessoa veio; Avançar reabre o registro (a tela dona monta de novo e lê o endereço)
      await page.goBack(); await espera(1500);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Voltar volta à tela de onde a Menção foi aberta (${partida.hash}), sem a janela`, e.hash === partida.hash && e.janelas === 0 && e.acomp === 0, JSON.stringify({ h: e.hash, j: e.janelas, a: e.acomp }));
      await page.goForward();
      if (F.tipo === 'os') await page.waitForSelector('[role="dialog"][aria-label^="Resumo da OS"], [role="dialog"][aria-label="Acompanhamentos"]', { timeout: 30000 });
      else await esperarJanelaDe(page, F, a);
      await espera(700);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Avançar reabre o registro, uma janela só`, e.hash === end && (e.janelas + e.acomp) === 1, JSON.stringify({ h: e.hash, j: e.janelas, a: e.acomp }));
      const al = await A(page);
      confere(`${F.nome}: nenhum aviso`, al.length === 0, JSON.stringify(al));
      confere(`${F.nome}: a Menção foi marcada como lida pela gravação normal (que o teste bloqueou)`, gravacoes.some(g => g.metodo === 'PATCH' && /\/mencoes/.test(g.url) && /"lida":true/.test(g.corpo || '')), JSON.stringify(gravacoes.map(g => g.metodo + ' ' + g.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60))));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C39 Busca geral: o card, a licitação e a OS abrem pelo endereço (a OS antes só trocava de aba)', {}, async ({ page }) => {
    const R = await registrosDoBanco();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await espera(1200);
    await clicarNoMenu(page, 'Compras'); await espera(1800);
    const limpo = (t) => norm(String(t).replace(/[^\p{L}\p{N} ]+/gu, ' '));
    const casos = [
      [FASE3[1], 'Processo CRM', limpo(R.card.a.titulo), norm(R.card.a.titulo), R.card.a]   /* título inteiro: em 26/11/2026 dois cards novos começavam igual (…TRACKER e …TRACKER LANTERNA) e o prefixo de 25 letras abria o errado */,
      [FASE3[0], 'Licitação', limpo(R.licitacao.a.numero), norm(R.licitacao.a.numero).slice(0, 25), R.licitacao.a],
      [FASE3[3], 'OS', limpo(R.os.a.numero_os), ('OS ' + norm(R.os.a.numero_os)).slice(0, 25), R.os.a],
    ];
    for (const [F, grupo, termo, inicio, reg] of casos) {
      await page.click('input[aria-label="Busca geral"]');
      await page.keyboard.type(termo, { delay: 12 });
      // o rótulo do grupo sai em maiúsculas (CSS) e o innerText devolve o texto como está na tela: compara em maiúsculas
      await page.waitForFunction((g, ini) => {
        const grupos = [...document.querySelectorAll('.acn-busca-resultados .acn-busca-grupo')].filter(x => x.innerText.trim().toUpperCase().endsWith(g.toUpperCase()));
        return grupos.some(x => [...x.parentElement.querySelectorAll('.acn-busca-item-titulo')].some(t => t.innerText.replace(/\s+/g, ' ').trim().startsWith(ini)));
      }, { timeout: 25000 }, grupo, inicio);
      await page.evaluate((g, ini) => {
        const x = [...document.querySelectorAll('.acn-busca-resultados .acn-busca-grupo')].find(y => y.innerText.trim().toUpperCase().endsWith(g.toUpperCase()));
        const it = [...x.parentElement.querySelectorAll('.acn-busca-item')].find(i => i.querySelector('.acn-busca-item-titulo').innerText.replace(/\s+/g, ' ').trim().startsWith(ini));
        it.click();
      }, grupo, inicio);
      try { await esperarJanelaDe(page, F, reg); } catch (err) {
        console.log('DIAG', F.nome, JSON.stringify(await estadoReg(page, F)), 'TITULO:', JSON.stringify(await lerTituloDaJanela(page, F)), 'ESPERADO:', JSON.stringify(norm(F.esperado(reg))), 'AVISOS:', JSON.stringify(await A(page)));
        throw err;
      }
      await espera(700);
      const e = await estadoReg(page, F);
      confere(`${F.nome}: o resultado da busca (${grupo}) abre o registro pelo endereço`, e.hash === enderecoDe(F, reg.id) && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      // UM passo só, provado pelo Voltar: um Voltar leva à tela de onde a busca foi feita (se a busca tivesse somado dois passos, cairia na tela dona). history.length não serve: depois do Voltar
      // da volta anterior o passo novo ocupa o lugar do que estava na frente e o tamanho do histórico não cresce
      await page.goBack(); await esperarSemJanela3(page, F); await espera(1200);
      const depois = await estadoReg(page, F);
      confere(`${F.nome}: a busca criou UM passo só: o Voltar leva à tela de onde ela foi feita, sem a janela`, depois.hash === '#/compras' && depois.janelas === 0, JSON.stringify({ h: depois.hash, j: depois.janelas }));
    }
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    const lidos = [];
    await cenario(`C40 ${F.nome}: quem não tem a aba da tela vê "conferindo" e depois "sem acesso", e o registro nem é lido`, {
      usuario: RESTRITO,
      simular: (url, r) => { if (r.method() === 'GET' && new RegExp(`/rest/v1/${F.tabela}\\?`).test(url)) lidos.push(url); return bancoComAbas(['pcp'], 2200)(url, r); },
    }, async ({ page }) => {
      const { a } = (await registrosDoBanco())[F.tipo];
      const end = enderecoDe(F, a.id);
      await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
      const linha = await observar(page, 5200);
      const conferindo = linha.find(x => x.aviso && /Conferindo o seu acesso/.test(x.aviso));
      const semAcesso = linha.find(x => x.aviso && /Você não tem acesso a esta tela/.test(x.aviso));
      confere(`${F.nome}: primeiro "Conferindo o seu acesso…" (não recusa antes da releitura)`, !!conferindo, JSON.stringify(linha.map(x => x.aviso)));
      confere(`${F.nome}: depois "sem acesso" com o nome da tela`, !!semAcesso && new RegExp(F.menu.split(' ')[0]).test(semAcesso.aviso), JSON.stringify(linha.map(x => x.aviso)));
      const e = await estadoReg(page, F);
      confere(`${F.nome}: nenhuma janela do registro e o endereço do link continua na barra`, e.janelas === 0 && e.hash === end, JSON.stringify({ j: e.janelas, h: e.hash }));
      confere(`${F.nome}: o registro nem foi lido do banco (a tela nem montou)`, lidos.length === 0, JSON.stringify(lidos.map(u => u.slice(-70))));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C41 OP aberta de dentro do card: as duas janelas ficam; o X da OP volta ao card; o X do card volta à tela', {}, async ({ page }) => {
    const R = await registrosDoBanco();
    confere('há um card com uma só OP viva para o teste', !!R.cardComOp, 'nenhum card tem exatamente uma OP');
    if (!R.cardComOp) return;
    const F = FASE3[1];
    const { card, op } = R.cardComOp;
    const end = enderecoDe(F, card.id), rotOp = 'OP ' + op.opl, endOp = '#/op/' + codif(op.opl);
    await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaDe(page, F, card); await espera(900);
    const inicio = await estadoReg(page, F);
    await page.waitForSelector('.acn-crm-ab-ir-op', { timeout: 30000 });
    await page.evaluate(() => document.querySelector('.acn-crm-ab-ir-op').click());
    await esperarJanelaOp(page, rotOp);
    const vigia = await vigiarJanelasDeOp(page, 2500);
    let e = await estadoReg(page, F);
    confere('a janela da OP abre POR CIMA do card e o card continua aberto', e.janelas === 1 && e.opJanelas === 1 && e.hash === endOp, JSON.stringify({ h: e.hash, j: e.janelas, op: e.opJanelas }));
    confere('uma janela de OP só (o hospedeiro não abre uma segunda nem lê a OP à toa)', vigia.maxJanelas === 1 && !vigia.viuCarregando, JSON.stringify(vigia));
    confere('a OP criou UM passo no histórico', e.historico === inicio.historico + 1, `${inicio.historico} → ${e.historico}`);
    await fecharJanelaOp(page); await esperarSemJanelaOp(page); await espera(900);
    e = await estadoReg(page, F);
    confere('o X da OP volta ao endereço do CARD e o card continua aberto (uma janela só)', e.hash === end && e.janelas === 1 && e.opJanelas === 0, JSON.stringify({ h: e.hash, j: e.janelas, op: e.opJanelas }));
    // de novo, agora pelo Voltar do navegador: tira só a OP
    await page.evaluate(() => document.querySelector('.acn-crm-ab-ir-op').click());
    await esperarJanelaOp(page, rotOp); await espera(600);
    await page.goBack(); await esperarSemJanelaOp(page); await espera(900);
    e = await estadoReg(page, F);
    confere('o Voltar do navegador tira só a OP: o card fica, no endereço dele', e.hash === end && e.janelas === 1 && e.opJanelas === 0, JSON.stringify({ h: e.hash, j: e.janelas, op: e.opJanelas }));
    await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(900);
    e = await estadoReg(page, F);
    confere('o X do card leva ao endereço da tela, sem sair do sistema', e.hash === '#/crm' && e.janelas === 0 && e.origem === inicio.origem, JSON.stringify({ h: e.hash, j: e.janelas }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    await cenario(`C42 ${F.nome}: de um registro para outro pelo endereço digitado — a janela mostra o novo (não o velho) e o Voltar volta ao primeiro`, {}, async ({ page }) => {
      const { a, b } = (await registrosDoBanco())[F.tipo];
      confere(`${F.nome}: há dois registros diferentes para o teste`, !!b, 'só um registro com título diferente');
      if (!b) return;
      await page.goto(BASE + enderecoDe(F, a.id), { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(700);
      await page.evaluate((h) => { location.hash = h; }, enderecoDe(F, b.id));
      await esperarJanelaDe(page, F, b); await espera(900);
      let e = await estadoReg(page, F);
      confere(`${F.nome}: digitar o endereço de outro registro mostra o outro, uma janela só`, e.hash === enderecoDe(F, b.id) && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      const tit = await lerTituloDaJanela(page, F);
      confere(`${F.nome}: o título da janela é o do segundo (nada do primeiro ficou)`, norm(tit) === norm(F.esperado(b)), `${tit} ≠ ${F.esperado(b)}`);
      await page.goBack(); await esperarJanelaDe(page, F, a); await espera(900);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Voltar reabre o primeiro`, e.hash === enderecoDe(F, a.id) && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      await page.goForward(); await esperarJanelaDe(page, F, b); await espera(600);
      e = await estadoReg(page, F);
      confere(`${F.nome}: o Avançar volta ao segundo`, e.hash === enderecoDe(F, b.id) && e.janelas === 1, JSON.stringify({ h: e.hash, j: e.janelas }));
      const al = await A(page);
      confere(`${F.nome}: nenhum aviso`, al.length === 0, JSON.stringify(al));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  for (const F of FASE3) {
    for (const [rotulo, largura, altura, toque] of [['celular 375', 375, 812, true], ['celular 360', 360, 740, true], ['celular 320', 320, 640, true], ['tablet 820', 820, 1180, true]]) {
      await cenario(`C43 ${F.nome} com o "Copiar link" — ${rotulo}: o botão não empurra nada para fora da tela`, { largura, altura, toque }, async ({ page }) => {
        const { a } = (await registrosDoBanco())[F.tipo];
        await page.goto(BASE + enderecoDe(F, a.id), { waitUntil: 'domcontentloaded' });
        await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(1200);
        await page.screenshot({ path: FOTOS + `/f3_${F.nome}_copiar_link_${rotulo.replace(/\s+/g, '_')}.png` });   // para olhar com os olhos o cabeçalho com o botão novo
        const m = await page.evaluate((F) => {
          const largura = window.innerWidth;
          const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { esq: Math.round(r.left), dir: Math.round(r.right), alt: Math.round(r.height), larg: Math.round(r.width) }; };
          const botao = document.querySelector(F.copiar);
          const fechar = F.fechar ? document.querySelector(F.fechar) : null;   // o "Fechar" da Mesa de Cotações fica no rodapé: não divide o cabeçalho com o botão
          const medir = () => ({ rolagem: document.documentElement.scrollWidth, botao: rect(botao), fechar: rect(fechar) });
          const com = medir();
          // sem o botão novo: o que já era assim antes da Fase 3 (a conferência é "o botão não piorou nada", e não "a tela inteira cabe")
          const antigo = botao.style.display; botao.style.display = 'none';
          const sem = medir();
          botao.style.display = antigo;
          return { largura, com, sem };
        }, { copiar: F.copiar, fechar: F.fechar });
        confere(`${F.nome}: o botão "Copiar link" existe e está inteiro dentro da tela`, m.com.botao && m.com.botao.esq >= 0 && m.com.botao.dir <= m.largura, JSON.stringify(m.com.botao));
        confere(`${F.nome}: o botão é fácil de tocar (32 px ou mais de altura)`, m.com.botao && m.com.botao.alt >= 32, JSON.stringify(m.com.botao));
        confere(`${F.nome}: o botão não criou rolagem para o lado (com ele ${m.com.rolagem}, sem ele ${m.sem.rolagem}, tela ${m.largura})`, m.com.rolagem <= Math.max(m.largura, m.sem.rolagem), JSON.stringify(m));
        if (m.com.fechar) confere(`${F.nome}: o X de fechar não foi empurrado para fora da tela pelo botão novo`, m.com.fechar.dir <= Math.max(m.largura, m.sem.fechar.dir) && (m.com.fechar.esq >= 0 || m.sem.fechar.esq < 0), JSON.stringify({ com: m.com.fechar, sem: m.sem.fechar, tela: m.largura }));
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  await cenario('C44 OS: do resumo ao Acompanhamento o endereço é o mesmo; o X do Acompanhamento tira o endereço', {}, async ({ page }) => {
    const F = FASE3[3];
    const { a } = (await registrosDoBanco()).os;
    const end = enderecoDe(F, a.id);
    await page.goto(BASE + end, { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarJanelaDe(page, F, a); await espera(800);
    const h0 = (await estadoReg(page, F)).historico;
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="dialog"][aria-label^="Resumo da OS"] button')].find(x => x.innerText.trim() === 'Acompanhamento');
      if (!b) throw new Error('o resumo da OS não tem o botão "Acompanhamento"');
      b.click();
    });
    await page.waitForSelector('[role="dialog"][aria-label="Acompanhamentos"]', { timeout: 20000 });
    await espera(900);
    let e = await estadoReg(page, F);
    confere('o Acompanhamento abre no lugar do resumo, com o mesmo endereço e sem passo novo', e.acomp === 1 && e.janelas === 0 && e.hash === end && e.historico === h0, JSON.stringify({ a: e.acomp, j: e.janelas, h: e.hash, h0, h1: e.historico }));
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Acompanhamentos"] button')].find(x => x.innerText.trim() === 'Fechar').click());
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="Acompanhamentos"]'), { timeout: 10000 }); await espera(900);
    e = await estadoReg(page, F);
    confere('o X do Acompanhamento tira o endereço da OS (link colado: troca pelo da tela)', e.hash === '#/sac' && e.acomp === 0 && e.janelas === 0, JSON.stringify({ h: e.hash, a: e.acomp, j: e.janelas }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // C45 (Fase 4): as abas de CADA tela do quadro. O quadro vem do código; uma tela que entrou no quadro sem entrar em `FASE4` (ou o contrário) reprova.
  await cenario('C45 Quadro de abas: o teste cobre exatamente as telas do quadro, com as mesmas abas', {}, async () => {
    const quadro = Object.keys(ROTAS.ABAS_DAS_TELAS).sort();
    // o Admin tem barra de botões (não a de abas padrão) e o cenário próprio C48; as outras estão em FASE4
    const coberto = [...FASE4.map(d => d.id), 'admin'].sort();
    confere('as telas do quadro de abas e as do teste são as mesmas', JSON.stringify(quadro) === JSON.stringify(coberto), `quadro=${quadro.join(',')} teste=${coberto.join(',')}`);
    FASE4.forEach(d => confere(`${d.id}: as abas do teste são as do quadro`, JSON.stringify([...Object.keys(d.rotulos), ...(d.ausentes || [])].sort()) === JSON.stringify([...ROTAS.ABAS_DAS_TELAS[d.id].abas].sort()), `teste=${Object.keys(d.rotulos)} quadro=${ROTAS.ABAS_DAS_TELAS[d.id]?.abas}`));
  });

  for (const D of FASE4) {
    await cenario(`C46 ${D.id}: as abas ganham endereço (um passo por troca), o endereço manda no F5, no link colado, no Voltar e no Avançar`, {}, async ({ page, consoleErros }) => {
      const Q = ROTAS.ABAS_DAS_TELAS[D.id];
      const nome = ROTAS.nomeNoEndereco(D.id);
      const lista = D.lista || 0;
      const rot = (a) => D.rotulos[a];
      const idDoRotulo = (r) => Object.keys(D.rotulos).find(a => D.rotulos[a] === r);
      const enderecoDaAba = (a) => ROTAS.montarEnderecoDaAba(D.id, [a]);
      const outras = Q.abas.filter(a => a !== Q.padrao);
      // o endereço e a aba marcada SEMPRE contam a mesma história (a regra central da Fase 4)
      const acorda = (e) => e.ativas.length === 1 && enderecoDaAba(idDoRotulo(e.ativas[0])) === e.hash;
      const ver = async () => estadoAbas(page, lista);
      const aguardar = async (esperado) => { try { await page.waitForFunction((n, r) => { const l = [...document.querySelectorAll('.acn-main [role="tablist"]')][n]; const b = l && l.querySelector('[role="tab"][aria-selected="true"]'); return !!b && ((b.querySelector('span') || b).innerText || '').trim() === r; }, { timeout: 8000 }, lista, esperado); } catch (e) { /* a conferência seguinte reprova e mostra o estado */ } await espera(250); };

      await page.goto(BASE + `#/${nome}`, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
      let e = await ver();
      confere(`${D.id}: a barra de abas tem as abas do quadro, na ordem`, JSON.stringify(e.rotulos) === JSON.stringify(Object.values(D.rotulos)), JSON.stringify(e.rotulos));
      confere(`${D.id}: abre na aba padrão (${rot(Q.padrao)}) e o endereço continua sem aba`, e.ativas[0] === rot(Q.padrao) && e.hash === `#/${nome}`, JSON.stringify({ a: e.ativas, h: e.hash }));
      const h0 = e.historico;
      let passos = 0;
      for (const aba of outras) {
        await clicarNaAba(page, rot(aba), lista); await aguardar(rot(aba));
        e = await ver(); passos++;
        confere(`${D.id}: clicar em "${rot(aba)}" → ${enderecoDaAba(aba)}, com UM passo novo`, e.ativas[0] === rot(aba) && e.hash === enderecoDaAba(aba) && e.historico === h0 + passos, JSON.stringify({ a: e.ativas, h: e.hash, h0, h1: e.historico, passos }));
      }
      const ultima = outras[outras.length - 1];
      await clicarNaAba(page, rot(ultima), lista); await espera(500);
      e = await ver();
      confere(`${D.id}: clicar de novo na aba aberta não cria passo`, e.historico === h0 + passos && e.hash === enderecoDaAba(ultima), JSON.stringify({ h0, h1: e.historico, passos, hash: e.hash }));
      await clicarNaAba(page, rot(Q.padrao), lista); await aguardar(rot(Q.padrao));
      e = await ver(); passos++;
      confere(`${D.id}: voltar à aba padrão pelo clique → #/${nome} (sem aba), um passo`, e.ativas[0] === rot(Q.padrao) && e.hash === `#/${nome}` && e.historico === h0 + passos, JSON.stringify({ a: e.ativas, h: e.hash, h0, h1: e.historico, passos }));
      // Voltar e Avançar andam entre as abas
      await page.goBack(); await aguardar(rot(ultima));
      e = await ver();
      confere(`${D.id}: Voltar → a aba de antes (${rot(ultima)}) e o endereço dela`, e.ativas[0] === rot(ultima) && e.hash === enderecoDaAba(ultima), JSON.stringify({ a: e.ativas, h: e.hash }));
      await page.goForward(); await aguardar(rot(Q.padrao));
      e = await ver();
      confere(`${D.id}: Avançar → a aba padrão de novo`, e.ativas[0] === rot(Q.padrao) && e.hash === `#/${nome}`, JSON.stringify({ a: e.ativas, h: e.hash }));
      // percorre o histórico inteiro para trás: cada passo mostra a aba que o endereço diz
      let todosAcordam = true; const vistos = [];
      for (let i = 0; i < passos; i++) { await page.goBack(); await espera(500); const x = await ver(); vistos.push(`${x.hash}=${x.ativas[0]}`); if (!acorda(x)) todosAcordam = false; }
      confere(`${D.id}: do Voltar ao começo, o endereço e a aba marcada contam a mesma história a cada passo`, todosAcordam, vistos.join(' | '));
      for (let i = 0; i < passos; i++) { await page.goForward(); await espera(400); }
      await aguardar(rot(Q.padrao));
      // F5 numa aba que não é a padrão
      await clicarNaAba(page, rot(ultima), lista); await aguardar(rot(ultima));
      const antesDoF5 = await ver();
      await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await esperarAbas(page, lista); await espera(1200);
      e = await ver();
      confere(`${D.id}: F5 em ${enderecoDaAba(ultima)} reabre na mesma aba, sem passo novo`, e.ativas[0] === rot(ultima) && e.hash === enderecoDaAba(ultima) && e.historico === antesDoF5.historico, JSON.stringify({ a: e.ativas, h: e.hash, antes: antesDoF5.historico, depois: e.historico }));
      // link colado
      for (const aba of outras) {
        await abrirComoLinkColado(page, enderecoDaAba(aba)); await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
        e = await ver();
        confere(`${D.id}: link colado ${enderecoDaAba(aba)} abre a aba "${rot(aba)}" e deixa o endereço como está`, e.ativas[0] === rot(aba) && e.hash === enderecoDaAba(aba), JSON.stringify({ a: e.ativas, h: e.hash }));
      }
      const aberta = outras[0];
      await abrirComoLinkColado(page, `#/${nome}/${ROTAS.nomeDaAba(Q.padrao)}`); await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
      e = await ver();
      confere(`${D.id}: o link com o nome da aba padrão escrito (#/${nome}/${ROTAS.nomeDaAba(Q.padrao)}) abre a padrão e a barra passa a mostrar o endereço curto`, e.ativas[0] === rot(Q.padrao) && e.hash === `#/${nome}`, JSON.stringify({ a: e.ativas, h: e.hash }));
      await abrirComoLinkColado(page, `#/${nome.toUpperCase()}/${ROTAS.nomeDaAba(aberta).toUpperCase()}`); await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
      e = await ver();
      confere(`${D.id}: o link em MAIÚSCULA abre a mesma aba e a barra é escrita no jeito certo`, e.ativas[0] === rot(aberta) && e.hash === enderecoDaAba(aberta), JSON.stringify({ a: e.ativas, h: e.hash }));
      // aba que não existe
      await abrirComoLinkColado(page, `#/${nome}/aba-que-nao-existe`); await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
      e = await ver();
      confere(`${D.id}: aba que a tela não tem → a padrão, e a barra é corrigida`, e.ativas[0] === rot(Q.padrao) && e.hash === `#/${nome}`, JSON.stringify({ a: e.ativas, h: e.hash }));
      const al0 = await A(page);
      confere(`${D.id}: aba desconhecida não gera aviso nem tela quebrada`, al0.length === 0 && e.listas > lista, JSON.stringify(al0));
      // clicar no menu na tela em que já está: a aba fica
      await abrirComoLinkColado(page, enderecoDaAba(aberta)); await esperarSistema(page); await esperarAbas(page, lista); await espera(900);
      const h1 = (await ver()).historico;
      await clicarNoMenu(page, D.menu); await espera(900);
      e = await ver();
      confere(`${D.id}: clicar no menu da tela em que já está NÃO derruba a aba nem cria passo`, e.ativas[0] === rot(aberta) && e.hash === enderecoDaAba(aberta) && e.historico === h1, JSON.stringify({ a: e.ativas, h: e.hash, h1, h2: e.historico }));
      // sair para outra tela e voltar pelo Voltar: a aba volta
      const outraTela = D.menu === 'PCP' ? 'Compras' : 'PCP';
      await clicarNoMenu(page, outraTela); await espera(1000);
      e = await estado(page);
      confere(`${D.id}: ir para ${outraTela} deixa a tela e o endereço dela`, e.hash === `#/${outraTela === 'PCP' ? 'pcp' : 'compras'}`, e.hash);
      await page.goBack(); await esperarAbas(page, lista); await espera(900);
      e = await ver();
      confere(`${D.id}: Voltar para a tela reabre a MESMA aba (${rot(aberta)})`, e.ativas[0] === rot(aberta) && e.hash === enderecoDaAba(aberta), JSON.stringify({ a: e.ativas, h: e.hash }));
      // sair e entrar de novo pelo menu: a aba que a tela abre e o endereço contam a mesma história (a tela pode lembrar a última aba)
      await clicarNoMenu(page, outraTela); await espera(900);
      await clicarNoMenu(page, D.menu); await esperarAbas(page, lista); await espera(1100);
      e = await ver();
      confere(`${D.id}: entrar pelo menu → a aba que abriu e o endereço combinam`, acorda(e), JSON.stringify({ a: e.ativas, h: e.hash }));
      if (D.lembra) {
        // a tela lembra a última aba que a pessoa usou (guardada no navegador): ao entrar pelo menu abre nela, a barra passa a mostrá-la SEM passo novo e sem derrubar a lembrança
        await clicarNaAba(page, rot(D.lembra), lista); await aguardar(rot(D.lembra));
        await clicarNoMenu(page, outraTela); await espera(900);
        const hAntes = (await estado(page)).historico;
        await clicarNoMenu(page, D.menu); await esperarAbas(page, lista); await espera(1100);
        e = await ver();
        confere(`${D.id}: a tela lembra a última aba usada (${rot(D.lembra)}) e o endereço a mostra`, e.ativas[0] === rot(D.lembra) && e.hash === enderecoDaAba(D.lembra), JSON.stringify({ a: e.ativas, h: e.hash }));
        confere(`${D.id}: mostrar a aba lembrada na barra não cria passo (só o clique do menu criou um)`, e.historico === hAntes + 1, JSON.stringify({ antes: hAntes, depois: e.historico }));
        await page.goBack(); await espera(1000);
        await page.goForward(); await esperarAbas(page, lista); await espera(1000);
        e = await ver();
        confere(`${D.id}: Voltar e Avançar sobre a aba lembrada: o endereço e a aba continuam combinando`, acorda(e), JSON.stringify({ a: e.ativas, h: e.hash }));
      }
      const al = await A(page);
      confere(`${D.id}: nenhum aviso durante o uso`, al.length === 0, JSON.stringify(al));
      const errosDoSistema = (consoleErros || []).filter(x => !/Failed to load resource|net::ERR|favicon|status of 4|status of 5/.test(x));
      confere(`${D.id}: nenhum erro no console`, errosDoSistema.length === 0, errosDoSistema.slice(0, 3).join(' | '));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // C47: a janela de um REGISTRO abre por cima da aba; o endereço do registro não diz aba e não derruba a que estava aberta
  await cenario('C47 Compras: o endereço de um pedido, com a aba Fornecedores à vista, abre a mesa na aba Requisições; Voltar e Avançar devolvem as duas abas', {}, async ({ page }) => {
    const F = FASE3[2];
    const { a } = (await registrosDoBanco()).pedido;
    const end = enderecoDe(F, a.id);
    await page.goto(BASE + '#/compras/fornecedores', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarAbas(page, 0); await espera(900);
    let t = await estadoAbas(page);
    confere('começa na aba Fornecedores', t.ativas[0] === 'Fornecedores' && t.hash === '#/compras/fornecedores', JSON.stringify({ a: t.ativas, h: t.hash }));
    const h0 = t.historico;
    await page.evaluate((h) => { location.hash = h; }, end);                       // o mesmo que o endereço digitado na barra
    await esperarJanelaDe(page, F, a); await espera(900);
    t = await estadoAbas(page);
    let r = await estadoReg(page, F);
    confere('a mesa do pedido abre pelo endereço, com UM passo novo', r.hash === end && r.janelas === 1 && t.historico === h0 + 1, JSON.stringify({ h: r.hash, j: r.janelas, h0, h1: t.historico }));
    confere('a aba que a janela precisa (Requisições) passa a ser a aberta, e o endereço do pedido não diz aba', t.ativas[0] === 'Requisições' && r.hash === end, JSON.stringify({ a: t.ativas, h: r.hash }));
    await page.goBack(); await espera(1500);
    t = await estadoAbas(page); r = await estadoReg(page, F);
    confere('Voltar: a mesa fecha e a aba Fornecedores volta, com o endereço dela', r.janelas === 0 && t.ativas[0] === 'Fornecedores' && t.hash === '#/compras/fornecedores', JSON.stringify({ j: r.janelas, a: t.ativas, h: t.hash }));
    await page.goForward(); await esperarJanelaDe(page, F, a); await espera(700);
    t = await estadoAbas(page); r = await estadoReg(page, F);
    confere('Avançar: a mesa reabre sobre Requisições, com o mesmo endereço', r.janelas === 1 && t.ativas[0] === 'Requisições' && r.hash === end, JSON.stringify({ j: r.janelas, a: t.ativas, h: r.hash }));
    // fechar a janela (passo do histórico que não é do sistema, porque o endereço foi digitado): o endereço vira o da tela, sem aba, e a aba aberta continua sendo Requisições
    await fecharRegistro(page, F); await esperarSemJanela3(page, F); await espera(900);
    t = await estadoAbas(page); r = await estadoReg(page, F);
    confere('o X da janela deixa a barra com o endereço da aba que está aberta (Requisições = sem aba)', r.janelas === 0 && t.ativas[0] === 'Requisições' && t.hash === '#/compras', JSON.stringify({ j: r.janelas, a: t.ativas, h: t.hash }));
    const al = await A(page);
    confere('nenhum aviso', al.length === 0, JSON.stringify(al));
  });

  // C48 (Fase 4): Admin. A barra dele é de botões (`.acn-tab-btn`, tela clássica não migrada), não a barra de abas padrão: por isso o cenário é próprio.
  await cenario('C48 Admin: as 23 abas ganham endereço (um passo por troca); F5, link colado, Voltar e Avançar seguem o endereço', {}, async ({ page }) => {
    const ids = ROTAS.ABAS_DAS_TELAS.admin.abas;
    const est = () => page.evaluate(() => {
      const bs = [...document.querySelectorAll('.acn-main .acn-tab-btn')];
      return { hash: location.hash, historico: history.length, n: bs.length, ativos: bs.map((b, i) => b.classList.contains('ativo') ? i : -1).filter(i => i >= 0), rotulos: bs.map(b => b.innerText.trim()) };
    });
    const clicar = (i) => page.evaluate((i) => { [...document.querySelectorAll('.acn-main .acn-tab-btn')][i].click(); }, i);
    const esperarBarra = () => page.waitForFunction(() => document.querySelectorAll('.acn-main .acn-tab-btn').length > 0, { timeout: 40000 });
    const end = (i) => ROTAS.montarEnderecoDaAba('admin', [ids[i]]);
    await page.goto(BASE + '#/admin', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page); await esperarBarra(); await espera(900);
    let e = await est();
    confere('admin: a barra tem as 23 abas e abre em Usuários, com o endereço sem aba', e.n === ids.length && e.ativos.join() === '0' && e.hash === '#/admin', JSON.stringify({ n: e.n, a: e.ativos, h: e.hash }));
    let h = e.historico;
    for (let i = 1; i < ids.length; i++) {
      await clicar(i); await espera(450);
      e = await est();
      confere(`admin: "${e.rotulos[i]}" → ${end(i)}, com UM passo novo e só ela marcada`, e.hash === end(i) && e.ativos.join() === String(i) && e.historico === h + 1, JSON.stringify({ h: e.hash, a: e.ativos, h0: h, h1: e.historico }));
      h = e.historico;
    }
    const ULT = ids.length - 1;
    await clicar(ULT); await espera(300);
    e = await est();
    confere('admin: clicar de novo na aba aberta não cria passo', e.historico === h && e.hash === end(ULT), JSON.stringify(e));
    await page.goBack(); await espera(900); e = await est();
    confere('admin: Voltar → a aba de antes e o endereço dela', e.hash === end(ULT - 1) && e.ativos.join() === String(ULT - 1), JSON.stringify({ h: e.hash, a: e.ativos }));
    await page.goForward(); await espera(900); e = await est();
    confere('admin: Avançar → a última aba de novo', e.hash === end(ULT) && e.ativos.join() === String(ULT), JSON.stringify({ h: e.hash, a: e.ativos }));
    const antes = (await est()).historico;
    await page.reload({ waitUntil: 'domcontentloaded' }); await esperarSistema(page); await esperarBarra(); await espera(1200);
    e = await est();
    confere('admin: F5 numa aba reabre a mesma aba, sem passo novo', e.hash === end(ULT) && e.ativos.join() === String(ULT) && e.historico === antes, JSON.stringify({ h: e.hash, a: e.ativos, h0: antes, h1: e.historico }));
    for (const i of [1, 5, 11]) {
      await abrirComoLinkColado(page, end(i)); await esperarSistema(page); await esperarBarra(); await espera(900);
      e = await est();
      confere(`admin: link colado ${end(i)} abre "${e.rotulos[i]}" e deixa o endereço como está`, e.hash === end(i) && e.ativos.join() === String(i), JSON.stringify({ h: e.hash, a: e.ativos }));
    }
    await abrirComoLinkColado(page, '#/admin/aba-que-nao-existe'); await esperarSistema(page); await esperarBarra(); await espera(900);
    e = await est();
    confere('admin: aba que a tela não tem → Usuários, e a barra é corrigida', e.hash === '#/admin' && e.ativos.join() === '0', JSON.stringify({ h: e.hash, a: e.ativos }));
    await abrirComoLinkColado(page, end(3)); await esperarSistema(page); await esperarBarra(); await espera(900);
    const h2 = (await est()).historico;
    await clicarNoMenu(page, 'Admin'); await espera(1200);
    e = await est();
    confere('admin: clicar no menu da tela em que já está NÃO derruba a aba nem cria passo', e.hash === end(3) && e.ativos.join() === '3' && e.historico === h2, JSON.stringify({ h: e.hash, a: e.ativos, h0: h2, h1: e.historico }));
    const al = await A(page);
    confere('admin: nenhum aviso durante o uso', al.length === 0, JSON.stringify(al));
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
