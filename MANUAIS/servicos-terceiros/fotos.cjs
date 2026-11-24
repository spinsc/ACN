// Fotos das telas dos Serviços de terceiros para o manual (23/11/2026). Dados INVENTADOS (prestadores, vendas, carros e pessoas de exemplo), toda gravação bloqueada (nada chega ao banco).
// O que é de `terceiros_*`, das demandas do Financeiro e da Vistoria de pátio é SIMULADO (pasta simulador/, o mesmo simulador dos testes das fatias T2 a T5); o resto do sistema (menu, tipos de serviço) vem
// do banco real, só leitura, com o crachá da conta de teste (precisa do arquivo %USERPROFILE%\.acn-teste\zzteste.json, ver o CLAUDE.md).
//   NODE_PATH=<node_modules que tenha puppeteer-core> node MANUAIS/servicos-terceiros/fotos.cjs [parte]
//   partes: quadro, cartao (grupo, agenda, lista), relatorio, pedir, agendar, realizar, pagamento, vistoria, ordens, contrato, cadastros, op   (sem argumento: todas)
// Saída: public/manuais/servicos-terceiros/img (o manual cita as fotos por "img/NN-nome.jpg").
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const { abrir, espera, BASE } = require(REPO + '/ferramentas/auditoria_layout/lib.cjs');
const { crachaDeTeste, URL_BASE, ANON } = require(REPO + '/ferramentas/auditoria_layout/cracha_teste.cjs');
const { estender, criarBanco, diaISO, somarDias, agoraISO, uuid } = require('./simulador/sim_t5.cjs');

const SAIDA = process.env.SAIDA || path.join(REPO, 'public/manuais/servicos-terceiros/img');
fs.mkdirSync(SAIDA, { recursive: true });
const PARTE = process.argv[2] || 'tudo';
const quer = (p) => PARTE === 'tudo' || PARTE === p;

// ───────────────────────────── ajudantes de tela ─────────────────────────────
const clicarTexto = (page, sel, texto, exato = true) => page.evaluate((s, t, ex) => {
  const els = [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null || e.closest('.modal-overlay')).filter(e => { const x = e.textContent.replace(/\s+/g, ' ').trim(); return ex ? x === t : x.startsWith(t); });
  if (!els.length) return false; els[0].click(); return true;
}, sel, texto, exato);
const aba = (page, nome) => clicarTexto(page, 'button[role=tab]', nome, false);
const preencher = (page, sel, valor) => page.$eval(sel, (el, v) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}, valor);
const escolher = async (page, sel, texto) => {
  const valor = await page.$eval(sel, (el, t) => { const o = [...el.options].find(x => x.textContent.replace(/\s+/g, ' ').trim().includes(t)); return o ? o.value : null; }, texto);
  if (valor === null) throw new Error(`opção "${texto}" não achada em ${sel}`);
  await preencher(page, sel, valor);
};
const botaoDaJanela = (page, aria, texto, exato = true) => page.evaluate((a, t, ex) => {
  const j = document.querySelector(`[role=dialog][aria-label="${a}"]`); if (!j) return false;
  const b = [...j.querySelectorAll('button')].find(x => { const s = x.textContent.replace(/\s+/g, ' ').trim(); return ex ? s === t : s.startsWith(t); });
  if (!b || b.disabled) return false; b.click(); return true;
}, aria, texto, exato);
const janelasAbertas = (page) => page.$$eval('[role=dialog]', js => js.map(j => j.getAttribute('aria-label')));
const fecharTudo = async (page) => {
  for (let i = 0; i < 6; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('[role=dialog], .acn-dialogo').length);
    if (!n) break;
    await page.evaluate(() => {
      const dlg = document.querySelector('.acn-dialogo');
      if (dlg) { const b = [...dlg.querySelectorAll('.acn-dialogo-btn')].find(x => /^(cancelar|não|nao)$/i.test(x.innerText.trim())) || dlg.querySelector('.acn-dialogo-btn'); if (b) b.click(); return; }
      const js = [...document.querySelectorAll('[role=dialog]')]; const j = js[js.length - 1];
      const b = j.querySelector('button[aria-label="Fechar"]') || [...j.querySelectorAll('button')].find(x => /^(cancelar|fechar)$/i.test(x.innerText.trim()));
      if (b) b.click();
    });
    await espera(350);
  }
};
const abrirTela = async (page, rotulo) => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 });
  await espera(1200);
  for (let i = 0; i < 3; i++) {
    const clicou = await page.evaluate((t) => {
      const it = [...document.querySelectorAll('.sidebar-item')].find(x => (x.querySelector('.sidebar-rotulo')?.textContent || '').trim() === t);
      if (it) { it.click(); return true; }
      document.querySelectorAll('.sidebar-section[aria-expanded=false]').forEach(b => b.click());
      return false;
    }, rotulo);
    if (clicou) { await espera(1800); return true; }
    await espera(400);
  }
  return false;
};
const abrirTerceiros = async (page) => {
  if (!(await abrirTela(page, 'Serviços de terceiros'))) throw new Error('o item "Serviços de terceiros" não existe no menu');
  await page.waitForSelector('.acn-terc-barra', { timeout: 25000 });
  await espera(700);
};
const esconderFlutuantes = (page) => page.evaluate(() => {
  document.querySelectorAll('body *').forEach(e => { const c = getComputedStyle(e); if (c.position === 'fixed' && e.offsetWidth > 0 && e.offsetWidth < 90 && e.offsetHeight < 90 && !e.closest('.modal-overlay')) e.style.display = 'none'; });
  document.querySelectorAll('.acn-toast, [role=alert].acn-toast').forEach(e => { e.style.display = 'none'; });
});
const salvar = async (page, nome, opcoes = {}) => {
  await esconderFlutuantes(page);
  const arq = path.join(SAIDA, nome + '.jpg');
  const base = { path: arq, type: 'jpeg', quality: 84 };
  if (opcoes.el) {
    const todos = await page.$$(opcoes.el);
    const h = opcoes.ultimo ? todos[todos.length - 1] : (opcoes.indice != null ? todos[opcoes.indice] : todos[0]);
    if (!h) { console.log('SEM ELEMENTO para', nome, opcoes.el); return false; }
    await h.screenshot(base);
  } else if (opcoes.clip) await page.screenshot({ ...base, clip: opcoes.clip, captureBeyondViewport: false });
  else await page.screenshot(base);
  console.log('foto', nome);
  return true;
};
// a janela da frente, inteira (a caixa .modal-box do último diálogo)
const fotoDaJanela = (page, nome) => salvar(page, nome, { el: '[role=dialog] .modal-box, .modal-box', ultimo: true });
// só um trecho de dentro da janela (um quadro pelo título)
const parteDaJanela = async (page, nome, tituloRe) => {
  const ok = await page.evaluate((src) => {
    const raiz = [...document.querySelectorAll('[role=dialog]')].pop() || document;
    const q = [...raiz.querySelectorAll('.acn-quadro, section, .acn-terc-caixa')].find(x => new RegExp(src, 'i').test((x.querySelector('.acn-quadro-titulo, h3, h4, strong')?.textContent || '')));
    if (!q) return false; q.setAttribute('data-foto-alvo', '1'); q.scrollIntoView({ block: 'center' }); return true;
  }, tituloRe.source);
  if (!ok) { console.log('SEM PARTE', nome, tituloRe); return false; }
  await espera(250);
  const r = await salvar(page, nome, { el: '[data-foto-alvo="1"]' });
  await page.evaluate(() => document.querySelectorAll('[data-foto-alvo]').forEach(e => e.removeAttribute('data-foto-alvo')));
  return r;
};
const abrirCartao = async (page, id) => {
  const ok = await page.evaluate((i) => { const c = document.querySelector(`.acn-terc-card[data-servico="${i}"]`); if (!c) return false; c.click(); return true; }, id);
  await espera(600);
  return ok;
};
const abrirCartaoPorTexto = async (page, trecho) => {
  const ok = await page.evaluate((t) => { const c = [...document.querySelectorAll('.acn-terc-card')].find(k => k.innerText.includes(t)); if (!c) return false; c.click(); return true; }, trecho);
  await espera(700);
  return ok;
};
// abre uma OP pelo mesmo caminho do aviso do Calendário e abre o Dossiê dela
const abrirOpPeloAviso = async (page, id) => {
  await page.evaluate((i) => { window.__acnDeepLink = { contexto: 'op', contextoId: i }; window.dispatchEvent(new Event('acn:abrir-registro')); }, id);
  await page.waitForSelector('button[aria-label="Mais ações da OP"]', { timeout: 25000 });
  await espera(900);
};
const abrirDossie = async (page) => {
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Tudo que está ligado a esta OP/.test(x.getAttribute('title') || '')); if (!b) return false; b.click(); return true; });
  if (!ok) throw new Error('o botão Dossiê não existe');
  await page.waitForSelector('#dossie-op', { timeout: 40000 });
  await espera(600);
};
const mesPassado = (hoje) => { const d = new Date(hoje + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 1); return diaISO(d).slice(0, 7); };

(async () => {
  const s = await crachaDeTeste();
  const H = { apikey: ANON, Authorization: 'Bearer ' + s.access_token };
  const lerReal = async (q) => { const r = await fetch(URL_BASE + '/rest/v1/' + q, { headers: H }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
  const tiposReais = await lerReal('terceiros_tipos?select=*&order=ordem');
  if (!Array.isArray(tiposReais) || tiposReais.length < 8) throw new Error('tipos reais inesperados: ' + JSON.stringify(tiposReais).slice(0, 200));
  const T = Object.fromEntries(tiposReais.map(t => [t.nome, t.id]));
  const hoje = diaISO(new Date());
  const M0 = hoje.slice(0, 7), M1 = mesPassado(hoje);
  const dia = (n) => somarDias(hoje, n);
  const EU = { id: '00000000-0000-0000-0000-000000000000', nome: 'Mariana Souza', perfil: 'Admin' };
  console.log('Hoje:', hoje, '| mês:', M0);

  // ───────── os dados de exemplo ─────────
  const montar = () => {
    const b = estender(criarBanco({ hoje, tiposReais, quem: EU }), T);
    const P = (nome, extra = {}) => { const p = { id: uuid('c'), nome, nome_norm: nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), razao_social: null, cnpj_cpf: null, contato_nome: null, telefone: null, email: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, tipos_ids: [], observacao: null, ativo: true, ...extra }; b.prestadores.push(p); return p; };
    const PA = P('Auto Película Sul', { tipos_ids: [T['Película'], T['Plotagem']], contato_nome: 'Marcos Lima', telefone: '(48) 99999-0001', email: 'contato@autopeliculasul.exemplo.br', razao_social: 'Auto Película Sul Ltda', cnpj_cpf: '11.222.333/0001-44', logradouro: 'Rua das Flores', numero: '120', bairro: 'Centro', cidade: 'Cidade Exemplo', uf: 'SC', observacao: 'Atende de segunda a sábado; busca o carro na fábrica.' });
    const PB = P('Pintura Rápida', { tipos_ids: [T['Pintura'], T['Funilaria']].filter(Boolean), contato_nome: 'Rogério Alves', telefone: '(48) 3333-0002', cidade: 'Cidade Exemplo', uf: 'SC' });
    const PC = P('Lava Jato Centro', { tipos_ids: [T['Lavagem']], telefone: '(48) 3333-0003', cidade: 'Cidade Exemplo', uf: 'SC' });
    const PD = P('Serralheria Antiga', { tipos_ids: [T['Corte e dobra']], ativo: false });
    const PE = P('Eletrostática Sul', { tipos_ids: [T['Pintura eletrostática']], contato_nome: 'Débora Nunes', telefone: '(48) 3333-0001', email: 'debora@eletrostaticasul.exemplo.br', razao_social: 'Eletrostática Sul Ltda', cnpj_cpf: '12.345.678/0001-90', logradouro: 'Rua das Tintas', numero: '100', bairro: 'Distrito Industrial', cidade: 'Cidade Exemplo', uf: 'SC' });
    const PF = P('Mecânica do Vale', { tipos_ids: [T['Mecânica']].filter(Boolean), telefone: '(48) 3333-0004', cidade: 'Cidade Exemplo', uf: 'SC' });
    b.P = { PA, PB, PC, PD, PE, PF };
    const op = (opl, extra = {}) => { const o = { id: uuid('d'), opl, modelo: 'HILUX', chassi: null, placa: null, cliente_nome: 'Prefeitura de Exemplo', status_geral: 'Em Produção', ...extra }; b.oples.push(o); return o; };
    const lig = (o) => ({ ligacao_tipo: 'op', ligacao_id: o.id, ligacao_rotulo: o.opl, venda_base: o.opl.replace(/\/\d+$/, '') });
    const Ana = { solicitante_id: 'u-ana-comercial', solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial' };
    const Bruno = { solicitante_id: 'u-bruno-sac', solicitante_nome: 'Bruno SAC', solicitante_perfil: 'SAC' };
    const S = {};
    const novo = (o) => b.novoServico({ id: uuid('e'), naColuna: 1, ...o });
    // A DEFINIR
    S.g = [['1', '01', 'ABC1D23'], ['2', '02', 'ABC1D24'], ['3', '03', 'ABC1D25']].map(([n, nn, pl]) => novo({ tipo_id: T['Película'], descricao: 'Película fumê 35% nos vidros laterais e traseiro', ...lig(op(`A1673.2609/${nn}`, { placa: pl })), data_desejada: dia(7), ...Ana, naColuna: 2 }));
    S.lav = novo({ tipo_id: T['Lavagem'], descricao: 'Lavagem completa com polimento', ligacao_tipo: 'os', ligacao_id: 'os-2611-021', ligacao_rotulo: '2611-021', prestador_id: PC.id, data_desejada: dia(-2), ...Bruno, naColuna: 5 });
    S.fun = novo({ tipo_id: T['Funilaria'], descricao: 'Funilaria da lateral direita', ...lig(op('A1760.2610/01', { modelo: 'S10', placa: 'GHI7J89' })), prestador_id: PB.id, valor_combinado: 700, ...Ana, naColuna: 3 });
    S.novo = novo({ tipo_id: T['Película'], descricao: 'Película fumê 20% no para-brisa', ...lig(op('A2000.2611/01', { modelo: 'RANGER', placa: 'KLM1N23' })), data_desejada: dia(9), ...Ana });
    // eletrostática esperando ordem (fila) — três carros da mesma venda + dois avulsos
    const ele = (extra) => novo({ tipo_id: T['Pintura eletrostática'], descricao: 'Pintura eletrostática dos estribos', ...extra });
    const pecasE = [{ descricao: 'Para-choque dianteiro', quantidade: 1 }, { descricao: 'Estribo', quantidade: 2 }];
    S.e = [1, 2, 3].map(n => ele({ ...lig(op(`A1900.2611/0${n}`, { placa: `NOP4Q5${n}` })), ...Ana, pecas: pecasE, valor_combinado: 450 }));
    S.e4 = ele({ ...lig(op('D0900.2611/01', { modelo: 'RANGER', placa: 'DDD1D11' })), pecas: [{ descricao: 'Suporte da barra', quantidade: 4 }], prestador_id: PE.id, valor_combinado: 500, descricao: 'Pintura eletrostática do suporte da barra' });
    S.e5 = ele({ descricao: 'Pintura eletrostática avulsa de grades', ligacao_tipo: null, pecas: [{ descricao: 'Grade frontal', quantidade: 2 }] });
    // AGENDADO
    S.hoje = novo({ tipo_id: T['Película'], descricao: 'Película fumê 20% no para-brisa', ...lig(op('A1700.2610/01', { modelo: 'RANGER', placa: 'RST6U78' })), status: 'agendado', prestador_id: PA.id, data_agendada: dia(0), periodo: 'manha', data_desejada: dia(0), valor_combinado: 800, ...Ana, historico: [{ em: agoraISO(3), por: 'Ana Comercial', acao: 'solicitado', detalhe: 'Pedido de Película' }, { em: agoraISO(1), por: 'Mariana Souza', acao: 'agendado', detalhe: 'hoje · manhã' }] });
    S.atras = novo({ tipo_id: T['Plotagem'], descricao: 'Plotagem lateral com a logomarca da prefeitura', ...lig(op('A1650.2608/01', { placa: 'VWX9Y01' })), status: 'agendado', prestador_id: PA.id, data_agendada: dia(-3), periodo: 'tarde', valor_combinado: 600, ...Ana, naColuna: 4 });
    S.c1 = novo({ tipo_id: T['Película'], descricao: 'Película fumê nos vidros', ...lig(op('A1710.2610/01', { placa: 'BCD2E34' })), status: 'agendado', prestador_id: PA.id, data_agendada: dia(2), periodo: 'manha', valor_combinado: 800, ...Ana });
    S.c2 = novo({ tipo_id: T['Plotagem'], descricao: 'Plotagem do capô', ...lig(op('A1720.2610/01', { placa: 'FGH3I45' })), status: 'agendado', prestador_id: PA.id, data_agendada: dia(2), periodo: 'manha', valor_combinado: 350, ...Ana });
    S.mec = novo({ tipo_id: T['Mecânica'], descricao: 'Revisão da suspensão dianteira', ...lig(op('A1740.2610/01', { modelo: 'S10', placa: 'JKL4M56' })), status: 'agendado', prestador_id: PF.id, data_agendada: dia(4), periodo: 'dia_todo', valor_combinado: 1200, onde: 'prestador', ...Bruno });
    // a saída da Vistoria ligada ao serviço que está no prestador
    const saida = b.novaSaida({ status: 'Saiu', data_saida: agoraISO(2), previsao_retorno: dia(2), destino: 'Mecânica do Vale', tipo_servico: 'Mecanica', veiculo_placa: 'JKL4M56', tipo_documento: 'OPL', numero_documento: 'A1740.2610/01' });
    S.mec.vistoria_id = saida.id; S.mec.vistoria_ligada_em = agoraISO(2); S.mec.vistoria_ligada_por = 'Mariana Souza';
    // a ordem que espera a assinatura (3 carros da mesma venda) e a ordem enviada (duas vendas)
    S.m = [1, 2, 3].map(n => ele({ ...lig(op(`A1930.2611/0${n}`, { placa: `MMM1A0${n}` })), pecas: [{ descricao: 'Estribo', quantidade: 2 }, { descricao: 'Protetor de caçamba', quantidade: 1 }], valor_combinado: 300 }));
    b.OM = b.criarOrdem({ status: 'montada', prestador: PE, servicos: S.m, envio: dia(2), previsao: dia(6), observacao: 'Cor preto fosco; embalar as peças com papelão.' });
    S.v = [ele({ ...lig(op('A1920.2611/01', { placa: 'EEE5F67' })), pecas: [{ descricao: 'Para-lama', quantidade: 2 }], valor_combinado: 400 }), ele({ ...lig(op('A1925.2611/01', { placa: 'GGG8H90' })), pecas: [{ descricao: 'Para-lama', quantidade: 2 }], valor_combinado: 400 })];
    b.OE = b.criarOrdem({ status: 'enviada', prestador: PE, servicos: S.v, envio: dia(-5), previsao: dia(-1), observacao: 'Cor grafite.' });
    // REALIZADOS no mês: a pagar, pedido, pago, retrabalho sem cobrança, pedido cancelado
    const dPedido = b.novaDemanda({ status: 'Pendente', valor: 700 }), dPago = b.novaDemanda({ status: 'Concluída', valor: 1250 }), dCancel = b.novaDemanda({ status: 'Cancelada', valor: 300 });
    const R = (extra) => novo({ status: 'realizado', periodo: 'manha', conferido_por: 'Mariana Souza', conferido_em: agoraISO(2), naColuna: 3, ...extra });
    S.r1 = R({ tipo_id: T['Pintura'], descricao: 'Pintura de dois paralamas', prestador_id: PB.id, valor_combinado: 1000, valor_final: 1250, data_agendada: `${M0}-05`, data_realizada: `${M0}-06`, ...Ana, ligacao_tipo: null });   // a pagar
    S.r2 = R({ tipo_id: T['Película'], descricao: 'Película fumê da viatura 07', prestador_id: PA.id, valor_combinado: 800, valor_final: 800, data_realizada: `${M0}-03`, ...lig(op('A1673.2609/09', { placa: 'XYZ1A23' })), ...Ana });
    S.r3 = R({ tipo_id: T['Plotagem'], descricao: 'Plotagem lateral da prefeitura', prestador_id: PA.id, valor_combinado: 600, valor_final: 700, data_realizada: `${M0}-09`, pagamento_demanda_id: dPedido.id, pagamento_pedido_em: agoraISO(5), pagamento_pedido_por: 'Mariana Souza', ...Ana });
    S.r4 = R({ tipo_id: T['Pintura'], descricao: 'Pintura do capô', prestador_id: PB.id, valor_combinado: 1000, valor_final: 1000, data_realizada: `${M0}-12`, pagamento_demanda_id: dPago.id, pagamento_pedido_em: agoraISO(8), pagamento_pedido_por: 'Mariana Souza', ...Bruno });
    S.r5 = R({ tipo_id: T['Película'], descricao: 'Película refeita (retrabalho do prestador)', prestador_id: PA.id, valor_combinado: 500, valor_final: 0, data_realizada: `${M0}-14`, ...Ana });
    S.r6 = R({ tipo_id: T['Lavagem'], descricao: 'Lavagem da frota (4 carros)', prestador_id: PC.id, valor_combinado: 320, valor_final: 320, data_realizada: `${M0}-16`, ...Bruno });
    S.r7 = R({ tipo_id: T['Pintura'], descricao: 'Pintura da porta traseira', prestador_id: PB.id, valor_combinado: 2000, valor_final: 2000, data_realizada: `${M1}-20`, ...Ana, naColuna: 30 });
    b.D = { dPedido, dPago, dCancel };
    b.S = S;
    // o simulador assina com o nome da conta de teste; nas fotos todo registro é da Mariana (troca no lugar, para as referências continuarem valendo)
    const trocar = (o) => { const novo = JSON.parse(JSON.stringify(o).replaceAll('ZZTESTE', 'Mariana Souza')); for (const k of Object.keys(novo)) o[k] = novo[k]; };
    [...b.servicos, ...b.ordens].forEach(trocar);
    [b.historico, b.histOrdem].forEach(d => { for (const k of Object.keys(d)) d[k] = JSON.parse(JSON.stringify(d[k]).replaceAll('ZZTESTE', 'Mariana Souza')); });
    return b;
  };

  // ───────── a leitura própria do relatório do mês (a do sistema real é feita pela própria tela) ─────────
  const COLUNAS = ['id', 'numero', 'tipo_id', 'descricao', 'status', 'ligacao_tipo', 'ligacao_rotulo', 'venda_base', 'ordem_id', 'prestador_id', 'valor_combinado', 'valor_final', 'data_agendada', 'periodo', 'data_realizada', 'pagamento_demanda_id', 'solicitante_nome'];
  const simular = (b) => (url, r) => {
    // o quadro "Serviços de terceiros" do Dossiê da OP lê pela ligação (tipo + id), do mais novo ao mais antigo
    if (/\/rest\/v1\/terceiros_servicos\?/.test(url) && /[?&]ligacao_tipo=eq\./.test(url) && /[?&]ligacao_id=eq\./.test(url)) {
      const tipo = (url.match(/ligacao_tipo=eq\.([^&]+)/) || [])[1], id = (url.match(/ligacao_id=eq\.([^&]+)/) || [])[1];
      return { body: b.servicos.filter(x => x.ligacao_tipo === tipo && x.ligacao_id === id).sort((x, y) => y.criado_em.localeCompare(x.criado_em)) };
    }
    if (/\/rest\/v1\/terceiros_servicos\?/.test(url) && /or=\(and\(status\.eq\.realizado/.test(url)) {
      const de = (url.match(/data_realizada\.gte\.(\d{4}-\d{2}-\d{2})/) || [])[1], ate = (url.match(/data_realizada\.lte\.(\d{4}-\d{2}-\d{2})/) || [])[1], ateAg = (url.match(/data_agendada\.lte\.(\d{4}-\d{2}-\d{2})/) || [])[1];
      if (Number((url.match(/offset=(\d+)/) || [])[1] || 0) > 0) return { body: [] };
      const linhas = b.servicos.filter(x => (x.status === 'realizado' && x.data_realizada >= de && x.data_realizada <= ate) || (x.status === 'agendado' && x.data_agendada <= ateAg))
        .sort((x, y) => x.id.localeCompare(y.id)).map(x => Object.fromEntries(COLUNAS.map(c => [c, x[c]])));
      return { body: linhas };
    }
    return b.simular(url, r);
  };
  const entrar = async (page, b) => {
    // o usuário que o sistema mostra no alto é a Mariana (o crachá da conta de teste só serve para ler o resto do sistema)
    await page.evaluateOnNewDocument((u) => { localStorage.setItem('user', JSON.stringify({ ...u, email: 'mariana.souza@exemplo.com.br', ver_valores: true })); }, EU);
    await page.evaluateOnNewDocument(() => {
      window.__janelas = [];
      window.open = () => { const w = { escritos: [], document: { write: (h) => w.escritos.push(h), open() {}, close() {} }, focus() {}, print() {}, close() {} }; window.__janelas.push(w); return w; };
    });
  };
  const comTela = async (viewport, fn) => {
    const b = montar();
    const x = await abrir({ largura: viewport.largura, altura: viewport.altura, simular: simular(b), escritaSimulada: b.escrita });
    await entrar(x.page, b);
    await x.page.setViewport({ width: viewport.largura, height: viewport.altura, deviceScaleFactor: 1.25 });
    try { await fn(x.page, b, x); } finally { await x.browser.close(); }
    const indevidas = x.gravacoes.filter(g => !/audit_log|historico_alteracoes|ver_como_encerrar|inicio_aniversariantes|storage\/v1\/object\/sign/.test(decodeURIComponent(g.url)) && !/terceiros|storage/.test(g.url));
    if (indevidas.length) console.log('ATENÇÃO: gravações bloqueadas fora do módulo:', indevidas.map(g => g.metodo + ' ' + g.url.slice(0, 100)).join(' | '));
  };
  const GRANDE = { largura: 1500, altura: 950 };
  const janelaAlta = { largura: 1500, altura: 1500 };

  // ═════════════ QUADRO, filtros, grupo, agenda e lista ═════════════
  if (quer('quadro') || quer('cartao')) await comTela(GRANDE, async (page, b) => {
    await abrirTerceiros(page);
    if (quer('quadro')) {
      await salvar(page, '01-quadro');
      await salvar(page, '02-contadores-e-filtros', { el: '.acn-terc-barra' });
    }
    if (quer('cartao')) {
      // o cartão de grupo (película, 3 carros)
      if (!await abrirCartaoPorTexto(page, '3 carros')) console.log('SEM cartão de grupo');
      await fotoDaJanela(page, '03-grupo-de-carros');
      await fecharTudo(page);
      // a agenda (semana, por prestador)
      await aba(page, 'Agenda'); await espera(900);
      await salvar(page, '04-agenda-semana');
      // a lista
      await aba(page, 'Lista'); await espera(900);
      await salvar(page, '05-lista');
    }
  });

  // ═════════════ RELATÓRIO ═════════════
  if (quer('relatorio')) await comTela({ largura: 1500, altura: 1300 }, async (page, b) => {
    await abrirTerceiros(page);
    await aba(page, 'Relatório do mês'); await page.waitForSelector('.acn-terc-rel .acn-kpis', { timeout: 25000 }); await espera(700);
    await salvar(page, '06-relatorio');
    // abre o prestador de Película (3 serviços: pago, pedido, sem valor a pagar...)
    await page.evaluate(() => { const b = [...document.querySelectorAll('.acn-terc-rel button')].find(x => x.textContent.replace(/\s+/g, ' ').trim() === 'Auto Película Sul'); if (b) b.click(); });
    await espera(600);
    await salvar(page, '07-relatorio-prestador', { el: '.acn-terc-rel .acn-quadro' });
  });

  // ═════════════ PEDIR ═════════════
  if (quer('pedir')) await comTela(janelaAlta, async (page, b) => {
    await abrirTerceiros(page);
    await clicarTexto(page, 'button', 'Solicitar serviço', false); await espera(900);
    await escolher(page, '#terc-s-tipo', 'Pintura eletrostática'); await espera(300);
    await preencher(page, '#terc-s-desc', 'Pintura eletrostática dos estribos e do para-choque, cor preto fosco.');
    await escolher(page, '#terc-s-prest', 'Eletrostática Sul');
    await preencher(page, '#terc-s-valor', '450,00');
    await preencher(page, '#terc-s-data', dia(7));
    await clicarTexto(page, 'button', 'Adicionar peça', false); await espera(200);
    await clicarTexto(page, 'button', 'Adicionar peça', false); await espera(200);
    await preencher(page, 'input[aria-label="Peça 1"]', 'Para-choque dianteiro'); await preencher(page, 'input[aria-label="Quantidade da peça 1"]', '1');
    await preencher(page, 'input[aria-label="Peça 2"]', 'Estribo'); await preencher(page, 'input[aria-label="Quantidade da peça 2"]', '2');
    await espera(300);
    await fotoDaJanela(page, '08-pedir-servico');
  });

  // ═════════════ AGENDAR, REALIZAR, PAGAMENTO, VISTORIA ═════════════
  if (quer('agendar') || quer('realizar') || quer('pagamento') || quer('vistoria')) await comTela(janelaAlta, async (page, b) => {
    await abrirTerceiros(page);
    if (quer('agendar')) {
      await abrirCartao(page, b.S.novo.id);
      await clicarTexto(page, '[role=dialog] button', 'Agendar (prestador, dia e período)', false); await espera(700);
      await escolher(page, '#terc-ag-prest', 'Auto Película Sul');
      await preencher(page, '#terc-ag-dia', dia(2));
      await clicarTexto(page, '[role=dialog] button', 'Manhã', false); await espera(500);
      await fotoDaJanela(page, '09-agendar');
      await fecharTudo(page);
    }
    if (quer('realizar')) {
      await abrirCartao(page, b.S.hoje.id);
      await clicarTexto(page, '[role=dialog] button', 'Dar como realizado', false); await espera(700);
      await preencher(page, '#terc-re-dia', hoje);
      await preencher(page, '#terc-re-valor', '800,00');
      await preencher(page, '#terc-re-obs', 'Película aplicada e conferida, sem bolhas.');
      await espera(300);
      await fotoDaJanela(page, '10-realizar');
      await fecharTudo(page);
    }
    if (quer('pagamento')) {
      await abrirCartao(page, b.S.r1.id);
      await espera(500);
      await fotoDaJanela(page, '11-servico-realizado');
      await clicarTexto(page, '[role=dialog] button', 'Pedir pagamento', false); await espera(800);
      await fotoDaJanela(page, '12-pedir-pagamento');
      await fecharTudo(page);
    }
    if (quer('vistoria')) {
      await abrirCartao(page, b.S.mec.id);
      await espera(500);
      await fotoDaJanela(page, '13-saida-vistoria');
      await fecharTudo(page);
    }
  });

  // ═════════════ ORDENS ═════════════
  if (quer('ordens')) await comTela(janelaAlta, async (page, b) => {
    await abrirTerceiros(page);
    await aba(page, 'Ordens de pintura'); await page.waitForSelector('.acn-terc-modelo', { timeout: 15000 }); await espera(800);
    await page.setViewport({ width: 1500, height: 880, deviceScaleFactor: 1.25 }); await espera(400);
    await salvar(page, '14-ordens-fila');
    await page.setViewport({ width: 1500, height: 1500, deviceScaleFactor: 1.25 }); await espera(400);
    // marca os três carros da venda A1900 e abre a janela de montar
    for (const s of b.S.e) await page.evaluate((n) => { const c = document.querySelector(`input[aria-label="Marcar o serviço ${n}"]`); if (c) c.click(); }, s.numero);
    await espera(300);
    await clicarTexto(page, 'button', 'Montar ordem com 3', false); await espera(800);
    await escolher(page, '#terc-or-prest', 'Eletrostática Sul');
    await preencher(page, '#terc-or-envio', dia(2)); await preencher(page, '#terc-or-ret', dia(7));
    await preencher(page, '#terc-or-obs', 'Cor preto fosco; embalar as peças com papelão.');
    await espera(300);
    await fotoDaJanela(page, '15-montar-ordem');
    await fecharTudo(page);
    // a ordem montada (aguardando a assinatura)
    await page.evaluate((n) => { const tr = [...document.querySelectorAll('tr[data-ordem]')].find(t => t.querySelector('td strong')?.textContent.trim() === n); if (tr) tr.click(); }, b.OM.numero);
    await espera(900);
    await fotoDaJanela(page, '16-ordem-aberta');
    await clicarTexto(page, '[role=dialog] button', 'Enviar as peças', true); await espera(800);
    await fotoDaJanela(page, '17-enviar-pecas');
    await fecharTudo(page);
    // a ordem enviada e atrasada: registrar o retorno
    await page.evaluate((n) => { const tr = [...document.querySelectorAll('tr[data-ordem]')].find(t => t.querySelector('td strong')?.textContent.trim() === n); if (tr) tr.click(); }, b.OE.numero);
    await espera(900);
    await clicarTexto(page, '[role=dialog] button', 'Registrar o retorno', true); await espera(800);
    await preencher(page, '#terc-rt-dia', hoje);
    await preencher(page, '#terc-rt-igual', '400,00'); await espera(300);
    await fotoDaJanela(page, '18-retorno');
    await fecharTudo(page);
  });

  // ═════════════ CONTRATO E FOLHA DA ORDEM ═════════════
  if (quer('contrato')) await comTela(janelaAlta, async (page, b, x) => {
    // modelo aprovado: sem a faixa de MINUTA (a foto mostra como a folha sai de verdade)
    b.config = { ...b.config, aprovada: true, aprovada_por: 'Mariana Souza', aprovada_em: agoraISO(2),
      empresas: [{ id: 'acn', nome: 'ACN', razao_social: 'ACN Sinal Verde Ltda', cnpj: '00.111.222/0001-33', endereco: 'Rua Exemplo, 100, Distrito Industrial, Cidade Exemplo/SC', telefone: '(48) 3000-0000', email: 'contato@acn.exemplo.br' }, { id: 'detech', nome: 'DETECH', razao_social: 'Detech Tecnologia Ltda', cnpj: '00.222.333/0001-44', endereco: 'Rua Exemplo, 200, Distrito Industrial, Cidade Exemplo/SC', telefone: '(48) 3000-0001', email: 'contato@detech.exemplo.br' }] };
    await abrirTerceiros(page);
    const imprimirDaJanela = async () => { await clicarTexto(page, '[role=dialog] button', 'Imprimir', true); await espera(1200); };
    const folha = () => page.evaluate(() => { const w = window.__janelas.at(-1); return w ? w.escritos.at(-1) : null; });
    const fotografar = async (html, nome) => {
      const p2 = await x.browser.newPage();
      await p2.setViewport({ width: 860, height: 1100, deviceScaleFactor: 1.25 });
      await p2.setContent(html, { waitUntil: 'load' }); await espera(500);
      await p2.screenshot({ path: path.join(SAIDA, nome + '.jpg'), type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 860, height: 1100 } });
      console.log('foto', nome);
      await p2.close();
    };
    // o contrato do grupo de película da venda A1673 (três carros) — pelo cartão de grupo
    await abrirCartaoPorTexto(page, '3 carros');
    await clicarTexto(page, '[role=dialog] button', 'Imprimir contrato', false); await espera(700);
    await imprimirDaJanela();
    const htmlC = await folha();
    if (htmlC) await fotografar(htmlC, '19-contrato'); else console.log('SEM folha do contrato');
    await fecharTudo(page);
    // a folha da ordem OT-00001
    await aba(page, 'Ordens de pintura'); await page.waitForSelector('.acn-terc-modelo', { timeout: 15000 }); await espera(600);
    await page.evaluate((n) => { const tr = [...document.querySelectorAll('tr[data-ordem]')].find(t => t.querySelector('td strong')?.textContent.trim() === n); if (tr) tr.click(); }, b.OM.numero);
    await espera(900);
    await clicarTexto(page, '[role=dialog] button', 'Imprimir a ordem', true); await espera(700);
    await imprimirDaJanela();
    const htmlO = await folha();
    if (htmlO) await fotografar(htmlO, '20-folha-da-ordem'); else console.log('SEM folha da ordem');
  });

  // ═════════════ CADASTROS ═════════════
  if (quer('cadastros')) await comTela(GRANDE, async (page, b) => {
    // o modelo como o Admin o encontra (ainda minuta), mas com os dados da ACN já preenchidos; o dado entra ANTES de abrir a tela, porque ela lê o modelo uma vez só
    b.config = { ...b.config, empresas: [{ ...b.config.empresas[0], razao_social: 'ACN Sinal Verde Ltda', cnpj: '00.111.222/0001-33', endereco: 'Rua Exemplo, 100, Distrito Industrial, Cidade Exemplo/SC', telefone: '(48) 3000-0000', email: 'contato@acn.exemplo.br' }, ...b.config.empresas.slice(1)] };
    await abrirTerceiros(page);
    await aba(page, 'Prestadores'); await espera(900);
    await salvar(page, '21-prestadores');
    await aba(page, 'Tipos de serviço'); await espera(900);
    await salvar(page, '22-tipos');
    // a janela fica mais alta só para esta foto, para o texto das cláusulas aparecer junto
    await page.setViewport({ width: 1500, height: 1480, deviceScaleFactor: 1.25 });
    await aba(page, 'Modelo do contrato'); await espera(1500);
    await salvar(page, '23-modelo-contrato');
  });

  // ═════════════ O QUADRO NA OP (Dossiê) ═════════════
  // A OP é uma OP real do sistema (só leitura, só para o Dossiê abrir); os serviços do quadro são os de exemplo, e a foto recorta SÓ o quadro, que não traz nenhum dado do cliente.
  if (quer('op')) {
    const ops = await lerReal('oples?select=id,opl,modelo,cliente_nome,status_geral&status_geral=neq.Cancelado&order=updated_at.desc&limit=60');
    const opReal = Array.isArray(ops) ? ops.find(o => !/\/\d+$/.test(o.opl)) : null;
    if (!opReal) throw new Error('não achei uma OP real sem lote para abrir o Dossiê');
    await comTela(GRANDE, async (page, b) => {
      b.oples.push({ id: opReal.id, opl: opReal.opl, modelo: opReal.modelo, chassi: null, placa: null, cliente_nome: opReal.cliente_nome, status_geral: opReal.status_geral });
      const lig = { ligacao_tipo: 'op', ligacao_id: opReal.id, ligacao_rotulo: opReal.opl, venda_base: opReal.opl };
      const Ana = { solicitante_id: 'u-ana-comercial', solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial' };
      const novo = (o) => b.novoServico({ id: uuid('e'), ...o });
      novo({ tipo_id: T['Película'], descricao: 'Película fumê 35% nos vidros laterais e traseiro', ...lig, data_desejada: dia(7), valor_combinado: 800, diasAtras: 1, ...Ana });
      novo({ tipo_id: T['Plotagem'], descricao: 'Plotagem lateral com a logomarca', ...lig, status: 'agendado', prestador_id: b.P.PA.id, data_agendada: dia(2), periodo: 'tarde', valor_combinado: 600, diasAtras: 2, ...Ana });
      novo({ tipo_id: T['Pintura'], descricao: 'Pintura de dois paralamas', ...lig, status: 'realizado', prestador_id: b.P.PB.id, data_agendada: dia(-3), periodo: 'manha', data_realizada: dia(-2), valor_combinado: 1000, valor_final: 1250, conferido_por: 'Mariana Souza', diasAtras: 3, ...Ana });
      novo({ tipo_id: T['Lavagem'], descricao: 'Lavagem simples', ...lig, status: 'cancelado', cancelado_motivo: 'Cliente desistiu', cancelado_em: agoraISO(1), cancelado_por: 'Mariana Souza', diasAtras: 4, ...Ana });
      await abrirTela(page, 'Adaptação');
      await abrirOpPeloAviso(page, opReal.id);
      await abrirDossie(page);
      await page.waitForFunction(() => { const q = [...document.querySelectorAll('.acn-quadro')].find(x => /^Serviços de terceiros/.test((x.querySelector('.acn-quadro-titulo')?.textContent || '').trim())); return !!q && /\(\d+\)/.test(q.querySelector('.acn-quadro-titulo').textContent); }, { timeout: 30000 });
      await espera(500);
      await page.evaluate(() => { const q = [...document.querySelectorAll('.acn-quadro')].find(x => /^Serviços de terceiros/.test((x.querySelector('.acn-quadro-titulo')?.textContent || '').trim())); q.setAttribute('data-foto-alvo', '1'); q.scrollIntoView({ block: 'center' }); });
      await espera(400);
      await salvar(page, '24-quadro-na-op', { el: '[data-foto-alvo="1"]' });
    });
  }

  console.log('\nfim');
})().catch(e => { console.error('ERRO', e); process.exit(1); });
