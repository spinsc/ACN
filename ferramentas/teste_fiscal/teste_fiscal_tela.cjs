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

  const ctx = await abrir({});
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
    confere('conferidor: diz que é só leitura e que nada é gravado nem enviado', /só leitura/i.test(t) && /nada é gravado nem enviado/i.test(t));
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

    // ═══ Celular ═══
    for (const [rotulo, hash, esperar] of [['cadastros/empresas', '#/fiscal/cadastros', /DETECH/], ['cadastros/itens', '#/fiscal/cadastros/itens', /Itens ativos/], ['conferidor', '#/fiscal/conferidor', /Solte os arquivos/]]) {
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
