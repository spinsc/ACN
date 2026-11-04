// Fotos das telas das Viagens para o manual (04/11/2026). Dados INVENTADOS, toda gravação bloqueada (nada chega ao banco).
//   NODE_PATH=<node_modules do puppeteer-core> node fotos_viagens.cjs [parte]
// Saída: public/manuais/viagens/img no projeto (o manual cita as fotos por "img/NN-nome.jpg").
const fs = require('fs');
const path = require('path');
const { abrir, espera, BASE } = require('./lib2.cjs');
const SAIDA = process.env.SAIDA || 'C:/Users/comp/Documents/Projetos/ACN/.claude/worktrees/distracted-rubin-19e698/public/manuais/viagens/img';
fs.mkdirSync(SAIDA, { recursive: true });
const PARTE = process.argv[2] || 'tudo';
const quer = (p) => PARTE === 'tudo' || PARTE === p;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const ITA = { id: 'o', lat: -23.0, lng: -46.8, texto: 'Fábrica ACN, Itatiba, São Paulo, Brasil' };
const pPOA = { id: 'p1', lat: -30.0, lng: -51.2, dias: 3, texto: 'Porto Alegre, Rio Grande do Sul, Região Sul, Brasil' };
const pFLN = { id: 'p2', lat: -27.6, lng: -48.5, dias: 2, texto: 'Florianópolis, Santa Catarina, Região Sul, Brasil' };
const pCWB = { id: 'p3', lat: -25.4, lng: -49.3, dias: 2, texto: 'Curitiba, Paraná, Região Sul, Brasil' };
const rota = (pernas) => ({ km: pernas.reduce((s, p) => s + p.km, 0), horas: pernas.reduce((s, p) => s + p.horas, 0), pernas, provedor: 'demonstração', calculada_em: '2026-11-03T10:00:00Z', assinatura: null });
const rotaPOA = rota([{ de: 'Itatiba', para: 'Porto Alegre', km: 1130, horas: 14.5 }, { de: 'Porto Alegre', para: 'Itatiba', km: 1130, horas: 14.5 }]);
const rotaSul = rota([{ de: 'Itatiba', para: 'Curitiba', km: 410, horas: 5.5 }, { de: 'Curitiba', para: 'Florianópolis', km: 300, horas: 4 }, { de: 'Florianópolis', para: 'Itatiba', km: 700, horas: 9 }]);
const custos = { consumo_km_l: 9, preco_combustivel: 6.2, custo_km_desgaste: 0.35, horas_por_dia: 8, hora_saida: '08:00', diaria_quarto: 220, quartos: 2, noites: null, alimentacao_pessoa_dia: 60, pedagios: [{ id: 'a', descricao: 'Pedágios da Régis Bittencourt', valor: 190 }, { id: 'b', descricao: 'Pedágios da BR-116', valor: 190 }], outros: [{ id: 'c', descricao: 'Estacionamento do hotel', valor: 90 }], valor_km_rodado: null, margem_pct: 10 };
const base = { pessoas: 2, ida_e_volta: true, otimizar_ordem: false, custos, km_total: 2260, total_orcamento: 6850, criado_em: '2026-11-01T10:00:00Z', historico: [], status_desde: '2026-11-01T10:00:00Z', contrato_anexos: [], comprovantes: [], op_ids: [], origem: ITA, paradas: [pPOA], rota: rotaPOA, vinculos: [], horas_viagem: 29, criado_por_nome: 'Mariana Souza' };
const equipe = [{ id: '1', nome: 'Carlos Lima' }, { id: '2', nome: 'Pedro Alves' }];
const hist = (...e) => e.map(([de, para, nota, por, dias]) => ({ em: new Date(Date.now() - dias * 86400000).toISOString(), por, de, para, nota }));
const V = {
  aberta: { ...base, id: 'v-aberta', titulo: 'Treinamento — Guarda Municipal de Exemplo/RS', status: 'aberta', data_saida: emDias(20), pessoas: 1, paradas: [pPOA], rota: rotaPOA },
  aprov: { ...base, id: 'v-aprov', titulo: 'Instalação de 12 viaturas — Prefeitura de Demonstração/SC', status: 'em_aprovacao', data_saida: emDias(12), paradas: [pCWB, pFLN], rota: rotaSul, km_total: 1410, total_orcamento: 7420, vinculos: [{ tipo: 'op', id: 'op-1', descricao: 'D1012.2611 — Prefeitura de Demonstração' }], op_ids: ['op-1'], sugestao_destino: 'Av. Exemplo, 100, Florianópolis/SC', criado_por_nome: 'Sistema (OP de Adaptação externa)', historico: hist(['aberta', 'em_aprovacao', 'Enviada para aprovação.', 'Mariana Souza', 1]) },
  prov1: { ...base, id: 'v-prov1', titulo: 'Adaptação de viaturas — Defesa Civil de Exemplo/PR', status: 'provisionamento', data_saida: emDias(1), paradas: [pCWB], rota: rota([{ de: 'Itatiba', para: 'Curitiba', km: 410, horas: 5.5 }, { de: 'Curitiba', para: 'Itatiba', km: 410, horas: 5.5 }]), km_total: 820, total_orcamento: 3100, vinculos: [{ tipo: 'op', id: 'op-2', descricao: 'A1830.2611 — Defesa Civil de Exemplo' }], status_desde: new Date(Date.now() - 2 * 86400000).toISOString(), historico: hist(['em_aprovacao', 'provisionamento', 'Aprovada pela direção.', 'Ricardo Gomes', 2]) },
  prov2: { ...base, id: 'v-prov2', titulo: 'Manutenção de barras — Concessionária Exemplo/RS', status: 'provisionamento', data_saida: emDias(9), equipe, frota_id: 'f2', veiculo_nome: 'Van branca', veiculo_placa: 'XYZ9K88', km_saida: 10400, verba_total: 4200, pedagio_modo: 'convenio', servico_descricao: 'Revisar 18 barras sinalizadoras e treinar 6 operadores.', contrato_obs: 'Contrato 0482/2026. Quem assina no local: Sr. Anderson (gerência).', hotel: { nome: 'Hotel Central Porto Alegre', endereco: 'Rua Exemplo, 250', telefone: '(51) 3000-0000', observacao: 'Reserva 77821, café incluso' }, contrato_anexos: [{ nome: 'contrato-0482.pdf', url: 'http://x/c.pdf', path: 'viagens/v/contrato/1-contrato-0482.pdf' }], historico: hist(['em_aprovacao', 'provisionamento', 'Aprovada pela direção.', 'Ricardo Gomes', 3], ['provisionamento', 'provisionamento', 'Adaptação preencheu a equipe, o veículo e o km de saída.', 'Fábio Reis', 2], ['provisionamento', 'provisionamento', 'Financeiro atualizou a verba, o pedágio, o hotel ou o custo real.', 'Joana Prado', 1]) },
  anda: { ...base, id: 'v-anda', titulo: 'Instalação de rádios — Prefeitura de Exemplo/RS', status: 'andamento', data_saida: emDias(-1), equipe, frota_id: 'f1', veiculo_nome: 'Strada branca', veiculo_placa: 'ABC1D23', km_saida: 45000, verba_total: 3500, pedagio_modo: 'reembolso', servico_descricao: 'Instalar 8 rádios veiculares.', hotel: { nome: 'Pousada do Centro', telefone: '(51) 3111-2222' }, historico: hist(['provisionamento', 'andamento', 'A equipe saiu.', 'Fábio Reis', 1]) },
  confl: { ...base, id: 'v-confl', titulo: 'Entrega e treinamento — Guarda de Exemplo/SC', status: 'provisionamento', data_saida: emDias(1), equipe: [equipe[0]], frota_id: 'f1', veiculo_nome: 'Strada branca', veiculo_placa: 'ABC1D23', km_saida: 45000, verba_total: 1800, paradas: [pFLN], rota: rota([{ de: 'Itatiba', para: 'Florianópolis', km: 700, horas: 9 }, { de: 'Florianópolis', para: 'Itatiba', km: 700, horas: 9 }]) },
  fin: { ...base, id: 'v-fin', titulo: 'Instalação — Câmara Municipal de Exemplo/PR', status: 'finalizada', data_saida: emDias(-18), equipe, frota_id: 'f1', veiculo_nome: 'Strada branca', veiculo_placa: 'ABC1D23', km_saida: 43800, km_volta: 44820, verba_total: 2600, paradas: [pCWB], rota: rota([{ de: 'Itatiba', para: 'Curitiba', km: 410, horas: 5.5 }, { de: 'Curitiba', para: 'Itatiba', km: 410, horas: 5.5 }]), km_total: 820, total_orcamento: 2400, custo_real: { combustivel: 610, pedagios: 168, hospedagem: 880, alimentacao: 420, outros: 90, observacao: 'Estacionamento do hotel.' }, comprovantes: [{ item: 'hospedagem', nome: 'nota-hotel.pdf', url: 'http://x/n.pdf', path: 'viagens/v/comprovantes/hospedagem/1-n.pdf' }, { item: 'combustivel', nome: 'cupons-posto.jpg', url: 'http://x/c.jpg', path: 'viagens/v/comprovantes/combustivel/1-c.jpg' }], historico: hist(['andamento', 'finalizada', 'A equipe voltou.', 'Fábio Reis', 12]) },
  fin2: { ...base, id: 'v-fin2', titulo: 'Treinamento — Guarda de Demonstração/RS', status: 'finalizada', data_saida: emDias(-40), equipe, frota_id: 'f2', veiculo_nome: 'Van branca', km_saida: 9200, km_volta: 10400, custo_real: { combustivel: 980, pedagios: 120, hospedagem: 1500, alimentacao: 600, outros: 0, observacao: '' } },
  fin3: { ...base, id: 'v-fin3', titulo: 'Retirada de equipamentos — Prefeitura de Exemplo/SC', status: 'finalizada', data_saida: emDias(-30), equipe, frota_id: 'f1', veiculo_nome: 'Strada branca', km_saida: 42500, km_volta: 43800 },
  nao: { ...base, id: 'v-nao', titulo: 'Visita técnica — Município de Demonstração/MG', status: 'nao_aprovada', data_saida: emDias(25), historico: hist(['em_aprovacao', 'nao_aprovada', 'Sem verba neste mês; refazer em dezembro.', 'Ricardo Gomes', 3]) },
};
const viagens = Object.values(V);
const frota = [
  { id: 'f1', apelido: 'Strada branca', modelo: 'Fiat Strada Endurance', placa: 'ABC1D23', km_atual: 45000, ativo: true },
  { id: 'f2', apelido: 'Van branca', modelo: 'Renault Master', placa: 'XYZ9K88', km_atual: 10400, ativo: true },
  { id: 'f3', apelido: 'Saveiro cinza', modelo: 'VW Saveiro', placa: 'DEF4G56', km_atual: 78200, ativo: false },
];
const manut = [
  { id: 'm1', frota_id: 'f1', data: '2026-06-01', tipo: 'Revisão', descricao: 'Troca de óleo e filtros', km: 40000, custo: 780, proxima_km: 45500, proxima_data: null, criado_em: '2026-06-01T10:00:00Z' },
  { id: 'm2', frota_id: 'f1', data: '2026-09-12', tipo: 'Pneus', descricao: 'Quatro pneus novos', km: 43000, custo: 2100, proxima_km: null, proxima_data: null, criado_em: '2026-09-12T10:00:00Z' },
  { id: 'm3', frota_id: 'f2', data: '2026-08-20', tipo: 'Revisão', descricao: 'Revisão dos 10.000 km', km: 9800, custo: 1450, proxima_km: 20000, proxima_data: emDias(200), criado_em: '2026-08-20T10:00:00Z' },
];
const simular = (url) => {
  if (/\/rest\/v1\/viagens\?/.test(url) && /id=eq\.(v-[a-z0-9]+)/.test(url)) { const id = /id=eq\.(v-[a-z0-9]+)/.exec(url)[1]; return { body: viagens.find(x => x.id === id) || null }; }
  if (/\/rest\/v1\/viagens\?/.test(url)) return { body: viagens };
  if (/\/rest\/v1\/frota_veiculos/.test(url)) return { body: frota };
  if (/\/rest\/v1\/frota_manutencoes/.test(url)) return { body: manut };
  return null;
};
const escritaSimulada = (url) => (/\/rest\/v1\/(viagens|frota_manutencoes|frota_veiculos)/.test(url) ? { body: [{ id: 'x1' }] } : /storage/.test(url) ? { body: { Key: 'x' } } : null);

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
const clicaTexto = (page, sel, re, dentro) => page.evaluate((sel, re, dentro) => {
  const raiz = dentro ? document.querySelector(dentro) : document;
  if (!raiz) return false;
  const r = new RegExp(re, 'i');
  const el = [...raiz.querySelectorAll(sel)].find(x => r.test((x.innerText || x.getAttribute('aria-label') || '').trim()) && x.offsetParent !== null);
  if (el) { el.click(); return true; } return false;
}, sel, re, dentro);
const fecha = async (page) => {
  for (let i = 0; i < 5; i++) {
    const aberto = await page.evaluate(() => !!document.querySelector('.modal-overlay, .acn-dialogo'));
    if (!aberto) break;
    await page.evaluate(() => {
      const dlg = document.querySelector('.acn-dialogo');
      if (dlg) { const b = [...dlg.querySelectorAll('.acn-dialogo-btn')].find(x => /^(cancelar|não|nao|fechar)$/i.test(x.innerText.trim())) || dlg.querySelector('.acn-dialogo-btn'); if (b) b.click(); return; }
      const ov = [...document.querySelectorAll('.modal-overlay')].pop();
      const bs = [...ov.querySelectorAll('button')];
      const b = bs.find(x => /^(cancelar|fechar)$/i.test(x.innerText.trim())) || bs.find(x => /^fechar$/i.test(x.getAttribute('aria-label') || ''));
      if (b) b.click();
    });
    await espera(350);
  }
};
const abreCartao = async (page, trecho) => {
  const ok = await page.evaluate((t) => { const c = [...document.querySelectorAll('.acn-vg-kcard')].find(k => k.innerText.includes(t)); if (!c) return false; (c.querySelector('strong') || c).click(); return true; }, trecho);
  await espera(1300);
  return ok;
};
// foto de uma parte da janela (um .acn-quadro pelo título), com a janela alta para não cortar
const parteDaJanela = async (page, nome, tituloRe) => {
  const ok = await page.evaluate((src) => { const q = [...document.querySelectorAll('.modal-box .acn-quadro')].find(x => new RegExp(src, 'i').test(x.querySelector('.acn-quadro-titulo')?.textContent || '')); if (!q) return false; q.setAttribute('data-foto-alvo', '1'); q.scrollIntoView({ block: 'center' }); return true; }, tituloRe.source);
  if (!ok) { console.log('SEM PARTE', nome, tituloRe); return false; }
  await espera(250);
  const r = await salvar(page, nome, { el: '[data-foto-alvo="1"]' });
  await page.evaluate(() => document.querySelectorAll('[data-foto-alvo]').forEach(e => e.removeAttribute('data-foto-alvo')));
  return r;
};
const irParaViagens = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle2' }); await espera(2500);
  await page.evaluate(() => [...document.querySelectorAll('.sidebar-item')].find(e => /^Viagens$/i.test(e.querySelector('.sidebar-rotulo')?.textContent.trim() || ''))?.click());
  await espera(2500);
};
const visao = async (page, nome) => { await clicaTexto(page, 'button, [role=tab]', '^' + nome + '$'); await espera(900); };

(async () => {
  const r = await abrir({ largura: 1500, altura: 950, simular, escritaSimulada });
  const { browser, page } = r;
  try {
    await page.evaluateOnNewDocument(() => { window.__fichas = []; window.open = () => ({ document: { write: (h) => window.__fichas.push(h), close() {} }, focus() {}, print() {} }); });
    // as contas do orçamento e a assinatura da rota vêm do próprio código do sistema (para o cartão e a janela dizerem o mesmo e a rota não aparecer como desatualizada)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await espera(1500);
    const prontas = await page.evaluate(async (vs) => {
      const calc = await import('/ACN/src/ViagemCalculo.ts'); const rt = await import('/ACN/src/ViagemRota.ts');
      return vs.map(v => { const c = calc.calcularViagem(v); return { id: v.id, assinatura: rt.assinaturaDoRoteiro(v.origem, v.paradas, v.ida_e_volta, v.otimizar_ordem), total: c.orcamento, km: c.km, horas: c.horasDirecao }; });
    }, viagens);
    for (const p of prontas) { const v = viagens.find(x => x.id === p.id); v.rota = { ...v.rota, assinatura: p.assinatura }; v.total_orcamento = p.total; v.km_total = p.km; v.horas_viagem = p.horas; }
    console.log('orçamentos:', prontas.map(p => p.id + '=' + p.total).join(' '));
    await irParaViagens(page);
    if (quer('quadro')) {
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
      await salvar(page, '01-tela-inicial');
      await salvar(page, '02-barra-do-alto', { clip: { x: 0, y: 55, width: 1500, height: 130 } });
      await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-vg-kcard')].find(k => k.innerText.includes('Adaptação de viaturas')); c?.setAttribute('data-foto-alvo', '1'); });
      await salvar(page, '03-cartao-saida-proxima', { el: '[data-foto-alvo="1"]' });
      await page.evaluate(() => document.querySelectorAll('[data-foto-alvo]').forEach(e => e.removeAttribute('data-foto-alvo')));
      // menu ⋯ do cartão
      await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-vg-kcard')].find(k => k.innerText.includes('Manutenção de barras')); c?.setAttribute('data-foto-alvo', '1'); c?.querySelector('button[aria-haspopup], button[aria-label*="ção"], button[aria-label*="Mais"]')?.click(); });
      await espera(500);
      await page.screenshot({ path: path.join(SAIDA, '04-menu-do-cartao.jpg'), type: 'jpeg', quality: 84 }); console.log('foto 04-menu-do-cartao (tela inteira, conferir)');
      await page.keyboard.press('Escape'); await espera(300);
      await visao(page, 'Lista');
      await salvar(page, '05-lista');
      await visao(page, 'Quadro');
    }
    if (quer('nova')) {
      await clicaTexto(page, 'button', '^Nova viagem$'); await espera(1200);
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '06-nova-viagem-vazia', { el: '.modal-box', ultimo: true });
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('aberta')) {
      await abreCartao(page, 'Treinamento — Guarda Municipal');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '07-viagem-aberta-inteira', { el: '.modal-box', ultimo: true });
      await parteDaJanela(page, '08-roteiro', /^ROTEIRO$/i);
      await parteDaJanela(page, '09-roteiro-dia-a-dia', /DIA A DIA/i);
      await parteDaJanela(page, '10-custos', /^CUSTOS$/i);
      await parteDaJanela(page, '11-orcamento', /ORÇAMENTO/i);
      await parteDaJanela(page, '12-dados-da-viagem', /DADOS DA VIAGEM/i);
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('aprovacao')) {
      await abreCartao(page, 'Instalação de 12 viaturas');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '13-em-aprovacao-janela', { el: '.modal-box', ultimo: true });
      await page.evaluate(() => { const f = document.querySelector('.modal-box:last-of-type .acn-modal-rodape') || [...document.querySelectorAll('.acn-modal-rodape')].pop(); f?.setAttribute('data-foto-alvo', '1'); });
      await salvar(page, '14-botoes-da-aprovacao', { el: '[data-foto-alvo="1"]' });
      await page.evaluate(() => document.querySelectorAll('[data-foto-alvo]').forEach(e => e.removeAttribute('data-foto-alvo')));
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('prov')) {
      await abreCartao(page, 'Manutenção de barras');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '15-provisionamento-janela', { el: '.modal-box', ultimo: true });
      await parteDaJanela(page, '16-parte-adaptacao', /EQUIPE E VE[IÍ]CULO/i);
      await parteDaJanela(page, '17-parte-comercial', /SERVI[CÇ]O E CONTRATO/i);
      await parteDaJanela(page, '18-parte-financeiro', /VERBA, PED[AÁ]GIO E HOTEL/i);
      await fecha(page);
      // a saída marcada para amanhã sem nada: faixa de "falta para sair"
      await abreCartao(page, 'Adaptação de viaturas');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '19-provisionamento-faltando', { el: '.modal-box', ultimo: true });
      await fecha(page);
      // conflito de veículo e equipe
      await abreCartao(page, 'Entrega e treinamento');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await page.evaluate(() => { const f = [...document.querySelectorAll('.modal-box .acn-faixa.tom-erro')][0]; f?.setAttribute('data-foto-alvo', '1'); });
      await salvar(page, '20-aviso-de-conflito', { el: '[data-foto-alvo="1"]' });
      await page.evaluate(() => document.querySelectorAll('[data-foto-alvo]').forEach(e => e.removeAttribute('data-foto-alvo')));
      await clicaTexto(page, '.acn-modal-corpo button', 'Ficha da equipe'); await espera(500);
      const ficha = await page.evaluate(() => window.__fichas[0] || '');
      if (ficha) { fs.writeFileSync(path.join(__dirname, 'ficha_exemplo.html'), ficha); console.log('ficha guardada', ficha.length); }
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('andamento')) {
      await abreCartao(page, 'Instalação de rádios');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '21-andamento-janela', { el: '.modal-box', ultimo: true });
      await parteDaJanela(page, '22-volta-da-equipe', /VOLTA DA EQUIPE/i);
      await fecha(page);
      await abreCartao(page, 'Câmara Municipal de Exemplo');
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(500);
      await salvar(page, '23-finalizada-janela', { el: '.modal-box', ultimo: true });
      await parteDaJanela(page, '24-custo-real-e-comprovantes', /CUSTO REAL/i);
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('menu')) {
      await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-vg-kcard')].find(k => k.innerText.includes('Manutenção de barras')); const b = c?.querySelector('button[aria-haspopup]'); b?.click(); });
      await espera(500);
    }
    if (quer('agenda')) {
      await visao(page, 'Agenda');
      await salvar(page, '25-agenda');
      await visao(page, 'Quadro');
    }
    if (quer('custos')) {
      await visao(page, 'Custos');
      await page.setViewport({ width: 1500, height: 1500, deviceScaleFactor: 1 }); await espera(400);
      await salvar(page, '26-custos', { clip: { x: 0, y: 55, width: 1500, height: 660 } });
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
      await visao(page, 'Quadro');
    }
    if (quer('frota')) {
      await clicaTexto(page, 'button', '^Frota$'); await espera(1500);
      await page.setViewport({ width: 1500, height: 1600, deviceScaleFactor: 1 }); await espera(400);
      await salvar(page, '27-frota', { el: '.modal-box', ultimo: true });
      await page.evaluate(() => document.querySelector('button[aria-label="Histórico de Strada branca"]')?.click()); await espera(700);
      await salvar(page, '28-historico-e-manutencao', { el: '.modal-box', ultimo: true });
      await fecha(page);
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1.25 });
    }
    if (quer('extras')) {
      // duplicar: a janela da nova viagem já preenchida
      await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-vg-kcard')].find(k => k.innerText.includes('Manutenção de barras')); c?.querySelector('button[aria-haspopup]')?.click(); });
      await espera(400);
      await clicaTexto(page, '[role=menuitem], button', 'Duplicar a viagem'); await espera(1200);
      await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 }); await espera(400);
      await salvar(page, '29-duplicar-viagem', { el: '.modal-box', ultimo: true });
      await fecha(page);
      // a ficha da equipe (a folha que se imprime)
      const f = path.join(__dirname, 'ficha_exemplo.html');
      if (fs.existsSync(f)) {
        const p2 = await browser.newPage(); await p2.setViewport({ width: 900, height: 1250, deviceScaleFactor: 1 });
        await p2.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'load' }); await espera(300);
        await p2.screenshot({ path: path.join(SAIDA, '30-ficha-da-equipe.jpg'), type: 'jpeg', quality: 84 }); console.log('foto 30-ficha-da-equipe'); await p2.close();
      }
    }
    console.log('erros:', JSON.stringify(r.consoleErros.filter(e => !/403|406|ERR_FAILED/.test(e)).slice(0, 4)));
  } finally { await browser.close(); }
})();
