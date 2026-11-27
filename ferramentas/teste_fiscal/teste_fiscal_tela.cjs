// Teste de NAVEGADOR das telas novas do Fiscal (preparação do módulo fiscal, 26/11/2026): Cadastros fiscais (empresas, transportadoras, clientes e itens que faltam),
// os campos fiscais dentro do cliente e do item, e o Conferidor de XML. TODA gravação é abortada pelo teste (padrão do projeto); só se confere o que SERIA gravado.
// Só XML INVENTADO. Como rodar: ver LEIA-ME.md ao lado (servidor de desenvolvimento de pé, BASE, NODE_PATH com puppeteer-core).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { abrir, espera, esperarSistema, BASE } = require('../teste_enderecos/lib_enderecos.cjs');

let ok = 0, falhas = 0;
const confere = (nome, cond, extra) => { if (cond) { ok++; console.log('OK    ' + nome); } else { falhas++; console.log('FALHOU ' + nome + (extra ? '  → ' + extra : '')); } };

// ── notas inventadas ──
const dv = (b) => { let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(b[i]) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return String(r < 2 ? 0 : 11 - r); };
const chaveDe = (cnpj, serie, numero) => { const b = '42' + '2611' + cnpj + '55' + String(serie).padStart(3, '0') + String(numero).padStart(9, '0') + '1' + '12345678'; return b + dv(b); };
function nota({ cnpj = '73628307000105', crt = '3', serie = 3, numero = 100, idDest = '1', cfop = '5102' } = {}) {
  const chave = chaveDe(cnpj, serie, numero);
  const det = (n) => `<det nItem="${n}"><prod><cProd>P${n}</cProd><xProd>Item ${n}</xProd><NCM>85258929</NCM><CFOP>${cfop}</CFOP><vProd>100.00</vProd></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><pICMS>17</pICMS></ICMS00></ICMS><PIS><PISAliq><CST>01</CST><pPIS>1.65</pPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><pCOFINS>7.6</pCOFINS></COFINSAliq></COFINS><IBSCBS><CST>000</CST></IBSCBS></imposto></det>`;
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>${serie}</serie><nNF>${numero}</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><natOp>VENDA DE MERCADORIA</natOp><idDest>${idDest}</idDest><indFinal>0</indFinal><finNFe>1</finNFe></ide><emit><CNPJ>${cnpj}</CNPJ><xNome>EMPRESA TESTE</xNome><enderEmit><UF>SC</UF></enderEmit><CRT>${crt}</CRT></emit><dest><CNPJ>05481897000136</CNPJ><xNome>CLIENTE INVENTADO</xNome><enderDest><UF>SC</UF></enderDest><IE>255123456</IE><indIEDest>1</indIEDest></dest>${det(1)}${det(2)}<total><ICMSTot><vNF>200.00</vNF></ICMSTot></total><pag><detPag><tPag>15</tPag><vPag>200.00</vPag></detPag></pag></infNFe></NFe><protNFe><infProt><cStat>100</cStat><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`;
}

// ── o arquivo de notas SIMULADO (o banco real ainda não tem nota guardada): 4 notas, 1 cancelamento, 1 inutilização e 3 OPs ──
const ACN = '73628307000105', DETECH = '33785289000150';
const cabecalho = (cnpj, serie, numero, extra = {}) => ({ id: cnpj + serie + numero, chave: chaveDe(cnpj, serie, numero), emitente_cnpj: cnpj, emitente_nome: 'EMPRESA TESTE', modelo: '55', serie, numero, emissao_dia: '2026-11-20', destinatario_doc: '05481897000136', destinatario_nome: 'CLIENTE INVENTADO', destinatario_uf: 'SC', natureza: 'VENDA', fin_nfe: '1', autorizada: true, cstat: '100', qtd_itens: 2, bloqueios: 0, alertas: 0, regras: [], arquivo: 'x.xml', ...extra });
const NOTAS = [cabecalho(ACN, 3, 100), cabecalho(ACN, 3, 102, { bloqueios: 1, regras: ['cfop_destino'] }), cabecalho(DETECH, 1, 1679, { autorizada: null, cstat: '' }), cabecalho(ACN, 3, 105)];
const simularArquivo = (url) => {
  const ok = (body) => ({ status: 200, body });
  if (/\/rest\/v1\/fiscal_notas\?/.test(url)) return ok(NOTAS);
  if (/\/rest\/v1\/fiscal_notas_valores\?/.test(url)) return ok(NOTAS.map(n => ({ chave: n.chave, valor_nf: '200.00' })));
  if (/\/rest\/v1\/fiscal_eventos\?/.test(url)) return ok([{ chave: chaveDe(ACN, 3, 105), tp_evento: '110111', sequencia: 1, data_dia: '2026-11-21', texto: 'Erro de digitacao', cstat: '135', arquivo: 'e.xml' }]);
  if (/\/rest\/v1\/fiscal_inutilizacoes\?/.test(url)) return ok([{ id: 'i1', cnpj: ACN, serie: 3, modelo: '55', de: 103, ate: 103, ano: '26', cstat: '102', arquivo: 'i.xml' }]);
  if (/\/rest\/v1\/fiscal_arquivos\?/.test(url)) return ok({ xml: nota({ numero: 102, idDest: '2' }) });   // .maybeSingle() pede um objeto só
  if (/\/rest\/v1\/oples\?.*numero_nf/.test(url)) return ok([{ opl: 'A1679.2611', numero_nf: '1679', faturamento_empresa: 'Detech', data_emissao_nf: null }, { opl: 'A9.2611', numero_nf: '100', faturamento_empresa: 'ACN', data_emissao_nf: null }, { opl: 'A8.2611', numero_nf: '555', faturamento_empresa: 'ACN', data_emissao_nf: null }]);
  return null;
};

// ── a prontidão da OP (dados SIMULADOS; só vale com `modoProntidao` ligado, para não atrapalhar os outros cenários) ──
let modoProntidao = false;
let modoFiscalClientes = 'ok';
const uid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const opBase = (n, o) => ({ id: uid(n), status_geral: 'Aguarda Emissao NF', tipo_projeto: 'Adaptacao', quantidade: 1, cliente_nome: 'Prefeitura de Teste', faturamento_empresa: 'ACN', data_liberacao_comercial: '2026-11-20', fluxo_entrega: 'adaptacao', itens_vendidos: [{ nome: 'SINALIZADOR INTERLED2 VERMELHO', item_id: ITEM_ID, quantidade: 2 }], ...o });
const ITEM_ID = '00000000-0000-4000-8000-0000000000aa';
const OPS_PRONTIDAO = [
  opBase(1, { opl: 'A100.2611' }),
  opBase(2, { opl: 'A101.2611', cliente_nome: 'Cliente Sumido' }),
  opBase(3, { opl: 'A102.2611/01' }),
  opBase(4, { opl: 'A102.2611/02', cliente_nome: 'Cliente Sumido' }),
  opBase(5, { opl: 'A200.2611', status_geral: 'Faturado e Disponivel para Entrega', numero_nf: '100', data_emissao_nf: '2026-11-20T12:00:00Z' }),
  opBase(6, { opl: 'A201.2611', status_geral: 'Faturado e Disponivel para Entrega', numero_nf: '555', data_emissao_nf: '2026-11-20T12:00:00Z' }),
];
const simularProntidao = (url) => {
  const ok = (body) => ({ status: 200, body });
  if (/\/rest\/v1\/oples\?.*status_geral=in/.test(url)) return ok(OPS_PRONTIDAO);
  if (/\/rest\/v1\/oples\?.*opl=like\.%\/%(&|$)/.test(url)) return ok(OPS_PRONTIDAO.filter(o => /\/\d+$/.test(o.opl)).map(o => ({ id: o.id, opl: o.opl, status_geral: o.status_geral, numero_nf: null, numero_nf_servico: null, fluxo_entrega: o.fluxo_entrega, tipo_projeto: o.tipo_projeto })));
  if (/\/rest\/v1\/sac_ordens_servico\?/.test(url)) return ok([]);
  if (/\/rest\/v1\/clientes\?.*select=id%2Cnome%2Cdocumento|\/rest\/v1\/clientes\?select=id,nome,documento/.test(url)) return ok([{ id: 'c1', nome: 'Prefeitura de Teste', documento: '11222333000181' }]);
  if (/\/rest\/v1\/fiscal_clientes\?/.test(url)) return modoFiscalClientes === 'erro' ? { status: 500, body: { message: 'boom', code: 'XX000' } } : ok([{ cliente_id: 'c1', indicador_ie: 'isento', tipo_orgao: 'municipal', retem_ir: true, codigo_ibge: '4205407' }]);
  if (/\/rest\/v1\/cadastro_itens\?/.test(url)) return /nome_norm=in/.test(url) ? ok([]) : ok([{ id: ITEM_ID, codigo: '225', nome: 'SINALIZADOR INTERLED2 VERMELHO', ncm: '85122011', ipi_pct: 0, ativo: true, categoria: 'MERCADORIA PARA REVENDA' }]);
  if (/\/rest\/v1\/fiscal_itens\?/.test(url)) return ok([{ item_id: ITEM_ID, origem_fiscal: 0, monofasico: false, cest_nao_se_aplica: true }]);
  if (/\/rest\/v1\/fiscal_emitentes\?/.test(url)) return ok([
    { id: 'e1', codigo: 'ACN', razao_social: 'ACN SINAL VERDE LTDA', cnpj: ACN, inscricao_estadual: '255123456', crt: 3, inscricao_municipal: '123', cep: '88132000', logradouro: 'RUA A', numero: '1', bairro: 'CENTRO', cidade: 'PALHOCA', uf: 'SC', codigo_ibge: '4211900', serie_nfe: 3 },
    { id: 'e2', codigo: 'DETECH', razao_social: 'DETECH', cnpj: DETECH, inscricao_estadual: null, crt: 1, serie_nfe: 1 },
  ]);
  return null;
};

let modoDaGravacao = 'ok';
const respostaDaGravacao = (url) => /rpc\/fiscal_guardar/.test(url)
  ? (modoDaGravacao === 'ok' ? { status: 200, body: { novas: 1, atualizadas: 0, repetidas: 1, eventos_novos: 0, eventos_repetidos: 0, inutilizacoes_novas: 0, inutilizacoes_repetidas: 0 } } : { status: 400, body: { message: 'canceling statement due to statement timeout', code: '57014' } })
  : null;

const clicarTexto = (page, seletor, texto) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(e => (e.innerText || e.textContent || '').trim() === t || (e.getAttribute('aria-label') || '') === t); if (!el) return false; el.click(); return true; }, seletor, texto);
const textoDaTela = (page) => page.evaluate(() => (document.querySelector('.acn-main') || document.body).innerText.replace(/\s+/g, ' ').trim());
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const confirmaDialogo = async (page) => { await page.waitForSelector('.acn-dialogo', { timeout: 5000 }); const t = await page.evaluate(() => document.querySelector('.acn-dialogo').innerText.replace(/\s+/g, ' ')); await page.evaluate(() => document.querySelector('.acn-dialogo-btn.primario, .acn-dialogo-btn.perigo').click()); return t; };

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-fiscal-'));
  const arqs = {
    certa: path.join(pasta, 'certa.xml'), errada: path.join(pasta, 'errada.xml'), lixo: path.join(pasta, 'lixo.xml'),
  };
  fs.writeFileSync(arqs.certa, nota({ numero: 100 }));
  fs.writeFileSync(arqs.errada, nota({ numero: 102, idDest: '2', cfop: '5102' }));   // interestadual (idDest 2) com CFOP de dentro do estado
  fs.writeFileSync(arqs.lixo, '<isto nao e uma nota>');

  const ctx = await abrir({ simular: (url) => (modoProntidao ? simularProntidao(url) : null) || simularArquivo(url), escritaSimulada: (url) => respostaDaGravacao(url) });
  const { page, gravacoes, consoleErros, falhasDePagina } = ctx;
  try {
    // ═══ Cadastros: empresas ═══
    await page.goto(BASE + '#/fiscal/cadastros', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => /ACN/.test(document.body.innerText) && /DETECH/.test(document.body.innerText), { timeout: 20000 });
    let t = await textoDaTela(page);
    confere('empresas: ACN e DETECH aparecem na lista', /ACN/.test(t) && /DETECH/.test(t), t.slice(0, 200));
    confere('empresas: CNPJs formatados', /73\.628\.307\/0001-05/.test(t) && /33\.785\.289\/0001-50/.test(t));
    confere('empresas: aponta o que falta preencher (IE, IM, endereço)', /Faltam \d+/.test(t));
    confere('empresas: regime de cada uma (Lucro/Normal e Simples)', /Simples/i.test(t) && /(Normal|Lucro)/i.test(t), t.slice(0, 300));
    confere('empresas: a visão é a primeira, o endereço é #/fiscal/cadastros', (await page.evaluate(() => location.hash)) === '#/fiscal/cadastros');

    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Editar ACN"]'); b && b.click(); });
    await page.waitForSelector('.acn-fcad-box', { timeout: 5000 });
    t = await page.evaluate(() => document.querySelector('.acn-fcad-box').innerText.replace(/\s+/g, ' '));
    confere('empresas: a janela avisa que o certificado digital não mora no sistema', /certificado digital/i.test(t) && /n[ãa]o se cadastram/i.test(t));
    await page.evaluate(() => { const i = document.querySelector('#em-ie'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '255123456'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    const antes = gravacoes.length;
    await clicarTexto(page, '.acn-fcad-box button', 'Salvar');
    await espera(1500);
    const g = gravacoes.slice(antes).filter(x => /fiscal_emitentes/.test(x.url));
    confere('empresas: salvar tenta gravar em fiscal_emitentes (abortado pelo teste)', g.length >= 1, JSON.stringify(gravacoes.slice(antes).map(x => x.url)));
    t = await page.evaluate(() => (document.querySelector('.acn-fcad-box') || { innerText: '' }).innerText.replace(/\s+/g, ' '));
    confere('empresas: gravação que falha mostra erro em vermelho e a janela NÃO fecha como se tivesse salvo', /acn-faixa/.test(await page.evaluate(() => document.querySelector('.acn-fcad-box .acn-faixa.tom-erro') ? 'acn-faixa' : '')) && t.length > 0);
    await page.evaluate(() => document.querySelector('.acn-fcad-box button[aria-label="Fechar"]').click());

    // ═══ Transportadoras ═══
    await clicarTexto(page, '.acn-chips button', 'Transportadoras');
    await page.waitForFunction(() => /Cadastrar transportadora/.test(document.body.innerText), { timeout: 10000 });
    confere('transportadoras: endereço da visão', (await page.evaluate(() => location.hash)) === '#/fiscal/cadastros/transportadoras');
    await clicarTexto(page, 'button', 'Cadastrar transportadora');
    await page.waitForSelector('#tr-nome', { timeout: 5000 });
    const antes2 = gravacoes.length;
    await clicarTexto(page, '.acn-fcad-box-p button, .acn-fcad-box button', 'Cadastrar');
    await espera(800);
    confere('transportadoras: sem nome não grava e diz por quê', gravacoes.length === antes2 && /nome/i.test(await page.evaluate(() => document.querySelector('.acn-faixa.tom-erro')?.innerText || '')), String(gravacoes.length - antes2));
    await page.type('#tr-nome', 'TRANSPORTADORA ZZTESTE');
    await page.type('#tr-doc', '05481897000136');
    await clicarTexto(page, '.acn-fcad-box button', 'Cadastrar');
    await espera(1500);
    confere('transportadoras: com nome e CNPJ válido tenta gravar em fiscal_transportadoras', gravacoes.slice(antes2).some(x => /fiscal_transportadoras/.test(x.url)), JSON.stringify(gravacoes.slice(antes2).map(x => x.url)));
    await page.evaluate(() => document.querySelector('.acn-fcad-box button[aria-label="Fechar"]')?.click());

    // ═══ Clientes: o que falta ═══
    await clicarTexto(page, '.acn-chips button', 'Clientes: o que falta');
    await page.waitForFunction(() => /Clientes/.test(document.body.innerText) && document.querySelectorAll('.acn-main table tbody tr').length > 0 && !/Carregando/.test(document.querySelector('.acn-main table tbody').innerText), { timeout: 40000 });
    t = await textoDaTela(page);
    confere('clientes: mostra o total e quantos faltam', /Clientes \d+/.test(t) && /Faltam dados \d+/.test(t), t.slice(0, 250));
    const linhasC = await page.evaluate(() => document.querySelectorAll('.acn-main table tbody tr').length);
    confere('clientes: a lista é limitada na tela (até 200 linhas)', linhasC > 0 && linhasC <= 200, String(linhasC));
    await page.evaluate(() => { const b = [...document.querySelectorAll('.acn-main table tbody button')].find(x => /Preencher|Ver/.test(x.innerText)); b && b.click(); });
    await page.waitForSelector('[data-testid="fiscal-cliente"]', { timeout: 10000 });
    await page.waitForFunction(() => !!document.querySelector('#fcli-ind'), { timeout: 10000 });
    await page.select('#fcli-ind', 'contribuinte');
    await page.type('#fcli-ie', '255123456');
    await page.type('#fcli-ibge', '4211900');
    await page.select('#fcli-org', 'nenhum');
    await page.select('#fcli-ir', 'nao');
    const antes3 = gravacoes.length;
    await clicarTexto(page, '[data-testid="fiscal-cliente"] button', 'Salvar dados fiscais');
    await espera(1500);
    const gc = gravacoes.slice(antes3).filter(x => /fiscal_clientes/.test(x.url));
    confere('clientes: salvar os dados fiscais tenta gravar SÓ em fiscal_clientes', gc.length >= 1 && gravacoes.slice(antes3).every(x => /fiscal_clientes|audit_log|historico/.test(x.url)), JSON.stringify(gravacoes.slice(antes3).map(x => x.url)));
    const corpo = gc[0] && gc[0].corpo || '';
    confere('clientes: o corpo leva o indicador, a IE e o IBGE digitados', /contribuinte/.test(corpo) && /255123456/.test(corpo) && /4211900/.test(corpo), corpo.slice(0, 300));
    confere('clientes: gravação abortada NÃO vira "salvo"', !/Dados fiscais salvos/.test(await page.evaluate(() => document.querySelector('[data-testid="fiscal-cliente"]').innerText)));
    await page.evaluate(() => [...document.querySelectorAll('.acn-fcad-box-p button')].find(b => b.innerText.trim() === 'Fechar')?.click());

    // ═══ Itens: o que falta e a ação em lote ═══
    await clicarTexto(page, '.acn-chips button', 'Itens: o que falta');
    await page.waitForFunction(() => /Itens ativos/.test(document.body.innerText) && document.querySelectorAll('.acn-main table tbody tr').length > 0 && !/Carregando/.test(document.querySelector('.acn-main table tbody').innerText), { timeout: 40000 });
    t = await textoDaTela(page);
    confere('itens: mostra o total e quantos faltam', /Itens ativos \d+/.test(t) && /Faltam dados \d+/.test(t), t.slice(0, 250));
    await page.evaluate(() => { const c = [...document.querySelectorAll('.acn-main table tbody input[type="checkbox"]')].slice(0, 2); c.forEach(x => x.click()); });
    await espera(300);
    t = await textoDaTela(page);
    confere('itens: marcar duas linhas mostra "2 marcados"', /2 marcados/.test(t), t.slice(0, 200));
    const antes4 = gravacoes.length;
    await clicarTexto(page, '.acn-fcad-barra-lote button', 'Não é monofásico');
    const pergunta = await confirmaDialogo(page);
    confere('itens: a pergunta diz o campo e a quantidade e que o resto não muda', /Não é monofásico/.test(pergunta) && /2 itens/.test(pergunta) && /fica como est/.test(pergunta), pergunta);
    await espera(1500);
    const gi = gravacoes.slice(antes4);
    confere('itens: o lote tenta gravar só em fiscal_itens, uma única chamada', gi.length >= 1 && gi.filter(x => /fiscal_itens/.test(x.url)).length === 1, JSON.stringify(gi.map(x => x.url)));
    const corpoI = gi.find(x => /fiscal_itens/.test(x.url))?.corpo || '';
    confere('itens: o corpo leva SÓ a coluna monofasico (nenhuma outra resposta é sobrescrita)', /"monofasico":false/.test(corpoI) && !/origem_fiscal|cest|enquadramento/.test(corpoI), corpoI.slice(0, 300));
    t = await textoDaTela(page);
    confere('itens: o lote que falha mostra o erro e NÃO diz que atualizou', !/itens? atualizados?/.test(t), t.slice(0, 300));

    // ═══ O campo fiscal dentro do cliente e do item ═══
    await page.goto(BASE + '#/clientes', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.acn-main table tbody button')].some(x => x.innerText.trim() === 'Ver'), { timeout: 60000 }).catch(() => {});
    const abriuCliente = await page.evaluate(() => { const b = [...document.querySelectorAll('.acn-main table tbody button')].find(x => x.innerText.trim() === 'Ver'); if (b) { b.click(); return true; } return false; });
    if (abriuCliente) {
      await page.waitForSelector('[data-testid="fiscal-cliente"]', { timeout: 15000 }).catch(() => {});
      confere('cliente: a ficha tem a seção "Dados fiscais (para emitir a nota)"', await page.evaluate(() => /Dados fiscais \(para emitir a nota\)/.test(document.body.innerText)));
    } else confere('cliente: achou o botão de abrir a ficha', false, 'sem botão na lista');

    // ═══ Conferidor de XML ═══
    await page.goto(BASE + '#/fiscal/conferidor', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForSelector('input[type="file"][aria-label="Escolher arquivos XML"]', { timeout: 20000 });
    t = await textoDaTela(page);
    confere('conferidor: diz que nada é gravado nem enviado enquanto não clicar em Guardar no arquivo', /nada é gravado nem enviado/i.test(t) && /Guardar no arquivo/.test(t));
    const antes5 = gravacoes.length;
    const entrada = await page.$('input[type="file"][aria-label="Escolher arquivos XML"]');
    await entrada.uploadFile(arqs.certa, arqs.errada, arqs.lixo);
    await page.waitForFunction(() => /Arquivos lidos\s*3/.test(document.body.innerText), { timeout: 15000 });
    t = await textoDaTela(page);
    confere('conferidor: leu 3 arquivos, 2 notas', /Arquivos lidos 3/.test(t) && /Notas 2/.test(t), t.slice(0, 300));
    confere('conferidor: o arquivo que não é nota vira faixa de aviso com o nome dele', /lixo\.xml/.test(t));
    confere('conferidor: a nota certa sai sem achados e a errada com bloqueio', /Com bloqueio 1/.test(t) && /Nenhum/.test(t), t.slice(0, 400));
    confere('conferidor: o achado do CFOP × destino aparece em português', /CFOP/i.test(t), t.slice(0, 600));
    confere('conferidor: NENHUMA gravação nem envio durante a leitura', gravacoes.length === antes5, JSON.stringify(gravacoes.slice(antes5).map(x => x.url)));
    await page.evaluate(() => [...document.querySelectorAll('.acn-chips button')].find(x => x.innerText.trim().startsWith('Com bloqueio'))?.click());
    await espera(300);
    const linhasX = await page.evaluate(() => document.querySelectorAll('.acn-main table tbody tr').length);
    confere('conferidor: o filtro "Com bloqueio" deixa só 1 nota', linhasX === 1, String(linhasX));
    await page.type('input[aria-label="Buscar nota"]', 'zzzz-nao-existe');
    await espera(300);
    t = await textoDaTela(page);
    confere('conferidor: busca sem resultado diz que nenhuma nota combina', /Nenhuma nota com esse filtro/.test(t));
    await clicarTexto(page, 'button', 'Limpar');
    await espera(300);
    confere('conferidor: "Limpar" zera os arquivos', !/Arquivos lidos/.test(await textoDaTela(page)));

    // ── Guardar no arquivo (a gravação é simulada: o teste vê o que SERIA enviado) ──
    await page.goto(BASE + '#/fiscal/conferidor', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForSelector('input[type="file"][aria-label="Escolher arquivos XML"]', { timeout: 20000 });
    const entrada2 = await page.$('input[type="file"][aria-label="Escolher arquivos XML"]');
    await entrada2.uploadFile(arqs.certa, arqs.errada, arqs.lixo);
    await page.waitForFunction(() => /Arquivos lidos\s*3/.test(document.body.innerText), { timeout: 15000 });
    const botao = await page.evaluate(() => { const b = [...document.querySelectorAll('.acn-fcad-guardar button')].find(x => /Guardar no arquivo/.test(x.innerText)); return b ? { desligado: b.disabled } : null; });
    confere('guardar: o botão existe e está ligado para quem tem a aba Fiscal e vê valores', !!botao && !botao.desligado, JSON.stringify(botao));
    const antes6 = gravacoes.length;
    await clicarTexto(page, '.acn-fcad-guardar button', 'Guardar no arquivo');
    await page.waitForFunction(() => /Guardado no arquivo/.test(document.body.innerText), { timeout: 10000 });
    const env = gravacoes.slice(antes6).filter(x => /rpc\/fiscal_guardar/.test(x.url));
    confere('guardar: UMA chamada à função fiscal_guardar', env.length === 1, JSON.stringify(gravacoes.slice(antes6).map(x => x.url)));
    const corpoG = JSON.parse(env[0].corpo || '{}');
    confere('guardar: leva as 2 notas (a que não é nota fica de fora) com chave de 44 dígitos e o XML', corpoG.p_notas.length === 2 && corpoG.p_notas.every(n => /^\d{44}$/.test(n.chave) && n.xml && n.xml.includes('<nfeProc')), JSON.stringify(corpoG.p_notas.map(n => [n.chave && n.chave.length, !!n.xml])));
    const errada = corpoG.p_notas.find(n => String(n.numero) === '102');
    confere('guardar: a nota errada vai com o bloqueio contado e a regra', !!errada && errada.bloqueios >= 1 && errada.regras.includes('cfop_destino'), JSON.stringify(errada && [errada.bloqueios, errada.regras]));
    confere('guardar: o valor, o dia da emissão e o CNPJ vão como a nota escreve', !!errada && errada.valor_nf === 200 && errada.emissao_dia === '2026-11-20' && errada.emitente_cnpj === ACN, JSON.stringify(errada && [errada.valor_nf, errada.emissao_dia]));
    t = await textoDaTela(page);
    confere('guardar: a resposta mostra o que entrou e o que já estava', /1 nota\(s\) nova\(s\)/.test(t) && /1 já estava/.test(t), t.slice(0, 500));
    modoDaGravacao = 'erro';
    await clicarTexto(page, '.acn-fcad-guardar button', 'Guardar no arquivo');
    await page.waitForFunction(() => /Falha ao guardar/.test(document.body.innerText), { timeout: 10000 });
    confere('guardar: falha do banco aparece em vermelho, em português, e não diz que guardou', !/Guardado no arquivo/.test(await textoDaTela(page)) && await page.evaluate(() => !!document.querySelector('.acn-faixa.tom-erro')));
    modoDaGravacao = 'ok';

    // ═══ Notas emitidas (o arquivo, com os dados simulados) ═══
    await page.goto(BASE + '#/fiscal/arquivo', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => /Notas guardadas\s*4/.test(document.body.innerText), { timeout: 30000 });
    t = await textoDaTela(page);
    confere('arquivo: 4 notas guardadas, 1 cancelada', /Notas guardadas 4/.test(t) && /1 cancelada/.test(t), t.slice(0, 300));
    confere('arquivo: 1 nota com bloqueio e 1 sem protocolo', /Com bloqueio 1/.test(t) && /Sem protocolo 1/.test(t));
    const linhaCom = (re) => page.evaluate((r) => [...document.querySelectorAll('.acn-main table tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(x => new RegExp(r).test(x)), re);
    confere('arquivo: a nota 1679 da DETECH aparece ligada à OP A1679.2611', (await linhaCom('^1679.*DETECH.*A1679\\.2611')).length === 1 || (await linhaCom('1679')).some(x => /A1679\.2611/.test(x) && /DETECH/.test(x)), JSON.stringify(await linhaCom('1679')));
    confere('arquivo: a nota 100 da ACN fica com a OP A9.2611 e NÃO com a da DETECH', (await linhaCom('^100 ')).every(x => /A9\.2611/.test(x) && !/A1679/.test(x)) && (await linhaCom('^100 ')).length === 1, JSON.stringify(await linhaCom('^100 ')));
    confere('arquivo: a 105 mostra "Cancelada"', (await linhaCom('^105 ')).some(x => /Cancelada/.test(x)), JSON.stringify(await linhaCom('^105 ')));
    confere('arquivo: o valor aparece (a conta de teste vê valores)', /R\$\s?200,00/.test(t));
    await page.evaluate(() => [...document.querySelectorAll('.acn-chips button')].find(x => x.innerText.trim().startsWith('Com bloqueio'))?.click());
    await espera(300);
    const so1 = await linhaCom('.');
    confere('arquivo: o filtro "Com bloqueio" deixa só a nota 102', so1.length === 1 && /^102 /.test(so1[0]), JSON.stringify(so1));
    await page.evaluate(() => [...document.querySelectorAll('.acn-chips button')].find(x => x.innerText.trim() === 'Todas')?.click());
    await espera(300);
    // abrir a nota 102: o XML guardado é lido e a conferência é refeita ao vivo
    await page.evaluate(() => { const tr = [...document.querySelectorAll('.acn-main table tbody tr')].find(x => /^102 /.test(x.innerText.replace(/\s+/g, ' '))); [...tr.querySelectorAll('button')].find(b => b.innerText.trim() === 'Abrir').click(); });
    await page.waitForSelector('.acn-fcad-box', { timeout: 8000 });
    await page.waitForFunction(() => /Conferência/.test(document.querySelector('.acn-fcad-box').innerText) && !/Lendo o XML/.test(document.querySelector('.acn-fcad-box').innerText), { timeout: 8000 });
    t = await page.evaluate(() => document.querySelector('.acn-fcad-box').innerText.replace(/\s+/g, ' '));
    confere('arquivo: a janela da nota mostra a chave, o cliente e o achado do CFOP refeito sobre o XML', t.includes(chaveDe(ACN, 3, 102)) && /CLIENTE INVENTADO/.test(t) && /CFOP/i.test(t), t.slice(0, 600));
    confere('arquivo: a janela oferece baixar o XML', /Baixar o XML/.test(t));
    await page.evaluate(() => document.querySelector('.acn-fcad-box button[aria-label="Fechar"]').click());
    // numeração: 100..105 na ACN série 3 = faltam 101 e 104 (a 103 foi inutilizada, a 102 e a 105 existem)
    await page.evaluate(() => [...document.querySelectorAll('.acn-chips button')].find(x => x.innerText.trim().startsWith('Numeração'))?.click());
    await page.waitForFunction(() => /Primeiro → último/i.test(document.body.innerText), { timeout: 8000 });
    t = await textoDaTela(page);
    confere('numeração: endereço da visão', (await page.evaluate(() => location.hash)) === '#/fiscal/arquivo/numeracao');
    confere('numeração: ACN série 3 vai de 100 a 105 e faltam 101 e 104 (a 103 foi inutilizada)', /100 → 105/.test(t) && /2 número\(s\)/.test(t) && /101, 104/.test(t), t.slice(0, 500));
    // OPs sem XML: a A8.2611 (nota 555) não tem XML; a A9 e a A1679 têm
    await page.evaluate(() => [...document.querySelectorAll('.acn-chips button')].find(x => x.innerText.trim().startsWith('OPs sem XML'))?.click());
    await page.waitForFunction(() => /Empresa que faturou/i.test(document.body.innerText), { timeout: 8000 });
    t = await textoDaTela(page);
    confere('OPs sem XML: só a A8.2611 aparece', /A8\.2611/.test(t) && !/A9\.2611/.test(t) && !/A1679\.2611/.test(t), t.slice(0, 400));
    confere('OPs sem XML: endereço da visão', (await page.evaluate(() => location.hash)) === '#/fiscal/arquivo/sem-xml');

    // ═══ Prontidão da OP para virar nota (Faturamento) e nota guardada no Dossiê da OP — dados SIMULADOS ═══
    modoProntidao = true;
    await page.setViewport({ width: 1500, height: 900 });
    await page.goto(BASE + '#/fiscal', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => /Pronta para a nota/.test(document.body.innerText), { timeout: 30000 });
    const antesP = gravacoes.length;
    t = await textoDaTela(page);
    const linhasDe = (re) => page.evaluate((r) => [...document.querySelectorAll('.acn-main table tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(x => new RegExp(r).test(x)), re);
    confere('prontidão: a OP com tudo completo mostra "Pronta para a nota"', (await linhasDe('A100\\.2611')).some(x => /Pronta para a nota/.test(x)), JSON.stringify(await linhasDe('A100')));
    confere('prontidão: a OP cujo cliente não está no cadastro mostra "Faltam dados fiscais (1)"', (await linhasDe('A101\\.2611')).some(x => /Faltam dados fiscais \(1\)/.test(x)), JSON.stringify(await linhasDe('A101')));
    confere('prontidão: o cartão do alto conta 2 prontas de 4 OPs, 2 com dado faltando', /Dados fiscais completos 2 de 4 OPs aguardando nota · 2 com dado faltando/.test(t), t.slice(0, 400));
    confere('prontidão: o cabeçalho do lote diz "1 de 2 com dado fiscal faltando"', /1 de 2 com dado fiscal faltando/.test(t), t.slice(0, 500));
    confere('prontidão: as duas OPs já faturadas NÃO ganham selo de prontidão', (await linhasDe('A200\\.2611|A201\\.2611')).every(x => !/Pronta para a nota|Faltam dados fiscais/.test(x)));
    // o detalhe de uma OP incompleta
    await page.evaluate(() => { const tr = [...document.querySelectorAll('.acn-main table tbody tr')].find(x => /A101\.2611/.test(x.innerText)); [...tr.querySelectorAll('.acn-selo')].find(b => /Faltam dados fiscais/.test(b.innerText)).click(); });
    await page.waitForSelector('.acn-fcad-box-p', { timeout: 5000 });
    t = await page.evaluate(() => document.querySelector('.acn-fcad-box-p').innerText.replace(/\s+/g, ' '));
    confere('prontidão: a janela diz o que falta, com o nome do cliente da OP', /Cliente "Cliente Sumido"/.test(t) && /não achei no cadastro de clientes/.test(t), t.slice(0, 400));
    await clicarTexto(page, '.acn-fcad-box-p button', 'Abrir Cadastros fiscais');
    await espera(600);
    confere('prontidão: "Abrir Cadastros fiscais" leva à aba de cadastros (#/fiscal/cadastros)', (await page.evaluate(() => location.hash)) === '#/fiscal/cadastros', await page.evaluate(() => location.hash));
    confere('prontidão: NENHUMA gravação em toda a conferência', gravacoes.length === antesP, JSON.stringify(gravacoes.slice(antesP).map(x => x.url)));

    // leitura recusada: nenhuma OP é dada como pronta nem como incompleta, e a faixa vermelha avisa
    modoFiscalClientes = 'erro';
    await page.goto(BASE + '#/fiscal', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => /Notas pendentes/.test(document.body.innerText) && /Não foi possível conferir os dados fiscais/.test(document.body.innerText), { timeout: 30000 });
    t = await textoDaTela(page);
    const selosNaTabela = await page.evaluate(() => [...document.querySelectorAll('.acn-main table .acn-selo')].map(x => x.innerText).filter(x => /Pronta para a nota|Faltam dados fiscais/.test(x)));
    confere('prontidão: leitura recusada → faixa vermelha e NENHUM selo de pronta ou de falta na tabela', await page.evaluate(() => !!document.querySelector('.acn-faixa.tom-erro')) && selosNaTabela.length === 0, JSON.stringify(selosNaTabela));
    modoFiscalClientes = 'ok';
    await page.goto(BASE + '#/fiscal/conferidor', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="file"][aria-label="Escolher arquivos XML"]', { timeout: 20000 });

    // o Dossiê: a OP sem nota mostra a prontidão; a OP com nota mostra a guardada; a OP cuja nota não está no arquivo diz isso
    await page.goto(BASE + '#/fiscal', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.acn-main table .acn-selo')].some(x => /Pronta para a nota/.test(x.innerText)), { timeout: 30000 });
    const abrirDossie = async (opl) => {
      await page.evaluate((o) => { const tr = [...document.querySelectorAll('.acn-main table tbody tr')].find(x => new RegExp(o.replace('.', '\\.')).test(x.innerText)); const menu = tr.querySelector('button[aria-label="Mais ações da OP"]'); menu.click(); }, opl);
      await espera(300);
      await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"], .acn-menu button, .acn-menu-item')].find(x => /Ver detalhes/.test(x.innerText))?.click());
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Dossiê'), { timeout: 15000 });
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Dossiê').click());
      await page.waitForSelector('#dossie-op', { timeout: 30000 });
      await page.waitForFunction(() => [...document.querySelectorAll('.acn-dos-sec-titulo')].some(x => /nota fiscal/i.test(x.innerText)), { timeout: 30000 });
      await page.waitForFunction(() => { const s = [...document.querySelectorAll('.acn-dos-sec')].find(x => /nota fiscal/i.test(x.querySelector('.acn-dos-sec-titulo').innerText)); return s && !/Conferindo|Procurando/.test(s.innerText); }, { timeout: 20000 }).catch(() => {});   // se não terminar, o texto que ficou na tela é o que o confere mostra
      return page.evaluate(() => [...document.querySelectorAll('.acn-dos-sec')].find(x => /nota fiscal/i.test(x.querySelector('.acn-dos-sec-titulo').innerText)).innerText.replace(/\s+/g, ' '));
    };
    const fecharTudo = async () => { await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelectorAll('button[aria-label="Fechar"], .modal-close, .acn-opl-x').forEach(b => b.click())); await espera(400); };
    t = await abrirDossie('A100.2611');
    confere('dossiê: OP sem nota mostra "Pronta para a nota" e o que foi conferido', /Pronta para a nota/.test(t) && /1 item\(ns\)/.test(t), t.slice(0, 300));
    await fecharTudo();
    t = await abrirDossie('A101.2611');
    confere('dossiê: OP incompleta lista o que falta', /Faltam dados fiscais/.test(t) && /não achei no cadastro de clientes/.test(t), t.slice(0, 300));
    await fecharTudo();
    t = await abrirDossie('A200.2611');
    confere('dossiê: OP com nota mostra a nota guardada (nº, série, empresa e a chave)', /Nota 100/.test(t) && /série 3/.test(t) && t.includes(chaveDe(ACN, 3, 100)) && !/Sem XML guardado/.test(t), t.slice(0, 400));
    await fecharTudo();
    t = await abrirDossie('A201.2611');
    confere('dossiê: OP cuja nota não está no arquivo diz "Sem XML guardado" e como guardar', /Sem XML guardado/.test(t) && /Guardar no arquivo/.test(t), t.slice(0, 300));
    await fecharTudo();
    // abrir a janela de uma OP grava a marca de "visto" (entity_views): é do próprio sistema, não da conferência fiscal
    const gravouAlgoFiscal = gravacoes.slice(antesP).filter(x => !/entity_views/.test(x.url));
    confere('dossiê e prontidão: nenhuma gravação da conferência (só a marca de "visto" da janela da OP)', gravouAlgoFiscal.length === 0, JSON.stringify(gravouAlgoFiscal.map(x => x.url)));
    // o Faturamento com os selos e a janela do detalhe, em celular
    await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '#/fiscal/conferidor', { waitUntil: 'domcontentloaded' });
    await page.goto(BASE + '#/fiscal', { waitUntil: 'domcontentloaded' });
    await esperarSistema(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.acn-main table .acn-selo')].some(x => /Faltam dados fiscais/.test(x.innerText)), { timeout: 30000 });
    confere('celular 390: o Faturamento com os selos de prontidão não estoura a largura da página', await semRolagemLateral(page), String(await page.evaluate(() => document.documentElement.scrollWidth)));
    await page.evaluate(() => [...document.querySelectorAll('.acn-main table .acn-selo')].find(x => /Faltam dados fiscais/.test(x.innerText)).click());
    await page.waitForSelector('.acn-fcad-box-p', { timeout: 5000 });
    confere('celular 390: a janela do detalhe cabe na tela', await page.evaluate(() => { const r = document.querySelector('.acn-fcad-box-p').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }));
    await page.setViewport({ width: 1500, height: 900 });
    modoProntidao = false;

    // ═══ Celular ═══
    for (const [rotulo, hash, esperar] of [['cadastros/empresas', '#/fiscal/cadastros', /DETECH/], ['cadastros/itens', '#/fiscal/cadastros/itens', /Itens ativos/], ['conferidor', '#/fiscal/conferidor', /Solte os arquivos/], ['arquivo/notas', '#/fiscal/arquivo', /Notas guardadas/], ['arquivo/numeracao', '#/fiscal/arquivo/numeracao', /Primeiro/]]) {
      await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
      await esperarSistema(page);
      await page.waitForFunction((r) => new RegExp(r).test(document.body.innerText), { timeout: 40000 }, esperar.source).catch(() => {});
      await espera(800);
      confere(`celular 390: ${rotulo} não estoura a largura da página`, await semRolagemLateral(page), String(await page.evaluate(() => document.documentElement.scrollWidth)));
    }
  } catch (e) {
    confere('terminou sem erro inesperado', false, (e && e.stack) || String(e));
  } finally {
    confere('nenhuma exceção de JavaScript na página', falhasDePagina.length === 0, falhasDePagina.join(' | '));
    const errosReais = consoleErros.filter(x => !/Failed to load resource|net::ERR_FAILED|status of 4\d\d|status of 5\d\d/.test(x));
    confere('nenhum erro de console (fora as gravações abortadas)', errosReais.length === 0, errosReais.slice(0, 3).join(' | '));
    await ctx.browser.close();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* o sistema limpa a pasta temporária mais tarde */ }
  }
  console.log(`\n${ok} de ${ok + falhas} conferências passaram; ${falhas} falharam`);
  process.exit(falhas ? 1 : 0);
})();
