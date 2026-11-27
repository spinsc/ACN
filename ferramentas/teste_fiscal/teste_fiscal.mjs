// Prova as regras puras do módulo fiscal (src/FiscalRegras.ts e src/FiscalXml.ts) sem abrir o sistema e sem banco.
// Usa só XML INVENTADO (notas sintéticas montadas aqui): nenhum XML real entra no repositório.
// Cada trava é provada nos dois sentidos: a nota certa passa limpa e a nota com o defeito plantado é pega.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../src', import.meta.url));
const R = await import(pathToFileURL(RAIZ + '/FiscalRegras.ts').href);
const X = await import(pathToFileURL(RAIZ + '/FiscalXml.ts').href);
const A = await import(pathToFileURL(RAIZ + '/FiscalArquivo.ts').href);

let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error(`FALHOU: ${nome}\n  ${e.message}`); process.exitCode = 1; } };

// ── montagem de notas inventadas ──
const dv = (base43) => { let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(base43[i]) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return String(r < 2 ? 0 : 11 - r); };
const chaveDe = ({ cnpj, serie, numero }) => { const b = '42' + '2611' + cnpj + '55' + String(serie).padStart(3, '0') + String(numero).padStart(9, '0') + '1' + '12345678'; return b + dv(b); };
const ACN = '73628307000105', DETECH = '33785289000150';

function nota(o = {}) {
  const d = { cnpj: ACN, crt: '3', serie: 3, numero: 100, idDest: '1', indFinal: '0', indIE: '1', destIe: '255123456', finNFe: '1', natOp: 'VENDA DE MERCADORIA', cfop: '5102',
    cst: '00', csosn: '', cBenef: '', orig: '0', pICMS: '17', deson: '', mot: '', pis: '01', pPIS: '1.65', pCOF: '7.6', ibs: true, ufdest: false, tPag: '15', ref: '', prot: '100', ano: 2026, ...o };
  const chave = d.chave || chaveDe(d);
  const icms = d.csosn ? `<ICMSSN102><orig>${d.orig}</orig><CSOSN>${d.csosn}</CSOSN></ICMSSN102>`
    : `<ICMS${d.cst}><orig>${d.orig}</orig><CST>${d.cst}</CST>${d.pICMS ? `<pICMS>${d.pICMS}</pICMS>` : ''}${d.deson ? `<vICMSDeson>${d.deson}</vICMSDeson>` : ''}${d.mot ? `<motDesICMS>${d.mot}</motDesICMS>` : ''}</ICMS${d.cst}>`;
  const pisXml = d.pPIS === '' ? `<PISNT><CST>${d.pis}</CST></PISNT>` : `<PISAliq><CST>${d.pis}</CST><pPIS>${d.pPIS}</pPIS></PISAliq>`;
  const cofXml = d.pCOF === '' ? `<COFINSNT><CST>${d.pis}</CST></COFINSNT>` : `<COFINSAliq><CST>${d.pis}</CST><pCOFINS>${d.pCOF}</pCOFINS></COFINSAliq>`;
  const det = (n) => `<det nItem="${n}"><prod><cProd>${d.codigo || 'P' + n}</cProd><xProd>Item ${n}</xProd><NCM>${d.ncm || '85258929'}</NCM><CFOP>${d.cfop}</CFOP>${d.cBenef ? `<cBenef>${d.cBenef}</cBenef>` : ''}<vProd>100.00</vProd></prod>`
    + `<imposto><ICMS>${icms}</ICMS><PIS>${pisXml}</PIS><COFINS>${cofXml}</COFINS>`
    + `${d.ufdest ? '<ICMSUFDest><vICMSUFDest>1.00</vICMSUFDest></ICMSUFDest>' : ''}${d.ibs ? '<IBSCBS><CST>000</CST></IBSCBS>' : ''}</imposto></det>`;
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00">`
    + `<ide><mod>55</mod><serie>${d.serie}</serie><nNF>${d.numero}</nNF><dhEmi>${d.ano}-11-20T10:00:00-03:00</dhEmi><natOp>${d.natOp}</natOp><idDest>${d.idDest}</idDest><indFinal>${d.indFinal}</indFinal><finNFe>${d.finNFe}</finNFe>`
    + `${d.ref ? `<NFref><refNFe>${d.ref}</refNFe></NFref>` : ''}</ide>`
    + `<emit><CNPJ>${d.cnpj}</CNPJ><xNome>EMPRESA TESTE</xNome><enderEmit><UF>SC</UF></enderEmit><CRT>${d.crt}</CRT></emit>`
    + `<dest><CNPJ>05481897000136</CNPJ><xNome>CLIENTE INVENTADO</xNome><enderDest><UF>${d.idDest === '2' ? 'SP' : 'SC'}</UF></enderDest>${d.destIe ? `<IE>${d.destIe}</IE>` : ''}<indIEDest>${d.indIE}</indIEDest></dest>`
    + det(1) + det(2) + `<total><ICMSTot><vNF>200.00</vNF></ICMSTot></total><pag><detPag><tPag>${d.tPag}</tPag><vPag>200.00</vPag></detPag></pag></infNFe></NFe>`
    + (d.prot ? `<protNFe><infProt><cStat>${d.prot}</cStat><chNFe>${chave}</chNFe></infProt></protNFe>` : '') + `</nfeProc>`;
}
const le = (xml, nome = 'a.xml') => X.lerArquivoFiscal(nome, xml);
const achados = (xml, emitentes = []) => X.conferirNota(le(xml), emitentes);
const regras = (xml, em) => achados(xml, em).map(a => a.regra);
const EMIT = [{ cnpj: ACN, crt: 3, codigo: 'ACN' }, { cnpj: DETECH, crt: 1, codigo: 'DETECH' }];

// ── o leitor de XML ──
t('lê prefixo, entidade, CDATA e marca vazia', () => {
  const r = X.lerXml('<?xml version="1.0"?><!-- c --><a:raiz xmlns:a="x" id="1"><a:b>um &amp; dois &#65;</a:b><c/><d><![CDATA[<x>]]></d></a:raiz>');
  assert.equal(r.nome, 'raiz'); assert.equal(r.attrs.id, '1');
  assert.equal(X.texto(r, 'b'), 'um & dois A'); assert.ok(X.filho(r, 'c')); assert.equal(X.texto(r, 'd'), '<x>');
});
t('XML mal formado vira "outro", nunca lança', () => {
  for (const ruim of ['<a><b></a>', '<a>', '', 'texto solto', '<a></a><b></b>']) assert.equal(le(ruim).tipo, 'outro', ruim);
});
t('XML que não é fiscal vira "outro" com o motivo', () => { const r = le('<foo><bar/></foo>'); assert.equal(r.tipo, 'outro'); assert.match(r.motivo, /foo/); });

// ── a chave ──
t('chave: dígito verificador', () => {
  const c = chaveDe({ cnpj: ACN, serie: 3, numero: 100 });
  assert.ok(X.chaveValida(c)); assert.ok(!X.chaveValida(c.slice(0, 43) + String((Number(c[43]) + 1) % 10))); assert.ok(!X.chaveValida('123')); assert.ok(!X.chaveValida(c.slice(0, 43) + 'x'));
});

// ── a nota certa passa limpa ──
t('nota da ACN certa não tem nenhum achado', () => assert.deepEqual(achados(nota(), EMIT), []));
t('nota da DETECH certa (Simples) não tem nenhum achado', () => assert.deepEqual(achados(nota({ cnpj: DETECH, crt: '1', serie: 1, csosn: '102', ibs: false, pis: '49', pPIS: '', pCOF: '' }), EMIT), []));
t('o leitor tira os campos da nota', () => {
  const n = le(nota({ numero: 777, serie: 3 }));
  assert.equal(n.tipo, 'nota'); assert.equal(n.numero, '777'); assert.equal(n.serie, '3'); assert.equal(n.crt, '3'); assert.equal(n.itens.length, 2);
  assert.equal(n.itens[0].cfop, '5102'); assert.equal(n.itens[0].temIBSCBS, true); assert.equal(n.valorNF, 200); assert.equal(n.autorizada, true); assert.equal(n.ano, 2026);
});

// ── cada trava pega o seu defeito ──
const pega = (nome, regra, nivel, defeito, em = EMIT) => t(nome, () => {
  const a = achados(nota(defeito), em).find(x => x.regra === regra);
  assert.ok(a, `esperava a regra ${regra}, veio: ${regras(nota(defeito), em).join(',') || 'nada'}`); assert.equal(a.nivel, nivel);
});
const nao = (nome, regra, defeito, em = EMIT) => t(nome, () => assert.ok(!regras(nota(defeito), em).includes(regra), `a regra ${regra} não deveria aparecer`));

pega('CST 40 com SC810010 sem desoneração', 'cst40_sem_desoneracao', 'bloqueia', { cst: '40', cBenef: 'SC810010', pICMS: '' });
nao('CST 40 com SC810010 e desoneração completa passa', 'cst40_sem_desoneracao', { cst: '40', cBenef: 'SC810010', pICMS: '', deson: '10.00', mot: '7' });
pega('CST que exige cBenef sem cBenef', 'cbenef_faltando', 'bloqueia', { cst: '41', pICMS: '' });
nao('CST 00 não pede cBenef', 'cbenef_faltando', { cst: '00' });
pega('PIS/COFINS CST 01 com alíquota errada', 'pis_cofins_aliquota', 'bloqueia', { pPIS: '0.65' });
nao('PIS/COFINS CST 04 (monofásico) não é cobrado de alíquota', 'pis_cofins_aliquota', { pis: '04', pPIS: '', pCOF: '' });
pega('venda com pagamento 90', 'pagamento_90', 'alerta', { tPag: '90' });
nao('remessa com pagamento 90 não alerta', 'pagamento_90', { tPag: '90', cfop: '5949' });
pega('IE com indicador 9', 'ie_com_indicador_9', 'bloqueia', { indIE: '9', destIe: '255123456' });
pega('interestadual a não contribuinte sem DIFAL', 'difal_faltando', 'bloqueia', { idDest: '2', indFinal: '1', indIE: '9', destIe: '', cfop: '6108' });
nao('interestadual a não contribuinte com DIFAL passa', 'difal_faltando', { idDest: '2', indFinal: '1', indIE: '9', destIe: '', cfop: '6108', ufdest: true });
pega('devolução sem referência', 'devolucao_sem_referencia', 'bloqueia', { finNFe: '4', cfop: '5202' });
nao('devolução com referência passa', 'devolucao_sem_referencia', { finNFe: '4', cfop: '5202', ref: chaveDe({ cnpj: ACN, serie: 3, numero: 5 }) });
pega('CFOP 5 para outro estado', 'cfop_destino', 'bloqueia', { idDest: '2', cfop: '5102' });
nao('CFOP 6 para outro estado passa', 'cfop_destino', { idDest: '2', cfop: '6102' });
pega('regime normal com CSOSN', 'csosn_em_regime_normal', 'bloqueia', { csosn: '102' });
pega('Simples com CST', 'cst_em_simples', 'bloqueia', { cnpj: DETECH, crt: '1', serie: 1, cst: '00' });
pega('regime da nota diferente do cadastro', 'crt_diferente', 'bloqueia', { cnpj: DETECH, crt: '3', serie: 1 });
pega('emitente fora do cadastro', 'emitente_nao_cadastrado', 'alerta', { cnpj: '11222333000181', serie: 1 });
pega('ACN sem IBS/CBS em 2026', 'ibscbs_faltando', 'alerta', { ibs: false });
nao('IBS/CBS não é cobrado antes de 2026', 'ibscbs_faltando', { ibs: false, ano: 2025 });
pega('importado interestadual a contribuinte fora de 4%', 'importado_interestadual', 'bloqueia', { idDest: '2', cfop: '6102', orig: '1', pICMS: '12' });
nao('importado interestadual a 4% passa', 'importado_interestadual', { idDest: '2', cfop: '6102', orig: '1', pICMS: '4' });
pega('chave de outro número', 'chave_numero', 'bloqueia', { chave: chaveDe({ cnpj: ACN, serie: 3, numero: 999 }) });
pega('chave de outra série', 'chave_serie', 'bloqueia', { chave: chaveDe({ cnpj: ACN, serie: 4, numero: 100 }) });
pega('chave de outro CNPJ', 'chave_cnpj', 'bloqueia', { chave: chaveDe({ cnpj: DETECH, serie: 3, numero: 100 }) });
t('chave com dígito verificador errado', () => {
  const boa = chaveDe({ cnpj: ACN, serie: 3, numero: 100 });
  const ruim = boa.slice(0, 43) + String((Number(boa[43]) + 1) % 10);
  assert.ok(regras(nota({ chave: ruim }), EMIT).includes('chave_invalida'));
});
t('XML sem protocolo avisa; rejeitada bloqueia', () => {
  assert.ok(regras(nota({ prot: '' }), EMIT).includes('sem_protocolo'));
  const a = achados(nota({ prot: '302' }), EMIT).find(x => x.regra === 'nao_autorizada'); assert.ok(a && a.nivel === 'bloqueia');
});

// ── o lote ──
const ler = (xmls) => X.montarLote(xmls.map((x, i) => le(x, `n${i}.xml`)));
t('número pulado, descontando a inutilização', () => {
  const l = ler([nota({ numero: 10 }), nota({ numero: 11 }), nota({ numero: 14 }), nota({ numero: 20 })]);
  const a = X.conferirLote(l).filter(x => x.regra === 'numero_pulado');
  assert.equal(a.length, 1); assert.match(a[0].texto, /7 números/); assert.match(a[0].texto, /12–13, 15–19/);
  l.inutilizacoes.push({ tipo: 'inutilizacao', arquivo: 'i.xml', cnpj: ACN, serie: '3', modelo: '55', de: 15, ate: 19, ano: '26', cStat: '102' });
  const b = X.conferirLote(l).find(x => x.regra === 'numero_pulado'); assert.match(b.texto, /2 números/); assert.match(b.texto, /12–13/); assert.ok(!/15–19/.test(b.texto));
});
t('sequência completa não gera aviso', () => assert.equal(X.conferirLote(ler([nota({ numero: 1 }), nota({ numero: 2 }), nota({ numero: 3 })])).filter(x => x.regra === 'numero_pulado').length, 0));
t('séries diferentes não se misturam', () => assert.equal(X.conferirLote(ler([nota({ numero: 1 }), nota({ numero: 5, serie: 4 })])).filter(x => x.regra === 'numero_pulado').length, 0));
t('natureza da devolução com grafias diferentes', () => {
  const ref = chaveDe({ cnpj: ACN, serie: 3, numero: 5 });
  const dev = (numero, natOp) => nota({ numero, finNFe: '4', cfop: '5202', ref, natOp });
  const a = X.conferirLote(ler([dev(1, 'DEVOLUCAO DE VENDA'), dev(2, 'Devolução de venda'), dev(3, 'DEVOLUCAO DE VENDA')])).find(x => x.regra === 'natureza_devolucao');
  assert.ok(a); assert.match(a.texto, /2 jeitos/);
  assert.ok(!X.conferirLote(ler([dev(1, 'DEVOLUCAO DE VENDA'), dev(2, 'DEVOLUCAO DE VENDA')])).some(x => x.regra === 'natureza_devolucao'));
});
t('produto com NCM diferente entre notas', () => {
  const l = ler([nota({ numero: 1, codigo: 'SVR-750', ncm: '85258929' }), nota({ numero: 2, codigo: 'SVR-750', ncm: '85176255' })]);
  assert.ok(X.conferirLote(l).some(x => x.regra === 'produto_divergente' && /SVR-750/.test(x.texto)));
  assert.ok(!X.conferirLote(ler([nota({ numero: 1, codigo: 'SVR-750' }), nota({ numero: 2, codigo: 'SVR-750' })])).some(x => x.regra === 'produto_divergente'));
});
t('a mesma nota em dois arquivos', () => assert.ok(X.conferirLote(ler([nota({ numero: 1 }), nota({ numero: 1 })])).some(x => x.regra === 'nota_repetida')));
const evento = (texto, tp = '110110') => `<procEventoNFe><evento><infEvento><chNFe>${chaveDe({ cnpj: ACN, serie: 3, numero: 33 })}</chNFe><tpEvento>${tp}</tpEvento><nSeqEvento>1</nSeqEvento><dhEvento>2026-11-20T10:00:00-03:00</dhEvento><detEvento><xCorrecao>${texto}</xCorrecao></detEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`;
t('carta de correção que muda NCM bloqueia; que muda peso passa', () => {
  assert.equal(le(evento('x'), 'e.xml').tipo, 'evento');
  const a = X.conferirLote(ler([evento('Correção do NCM do item 1 para 85176255')])).find(x => x.regra === 'carta_muda_imposto'); assert.ok(a); assert.equal(a.nivel, 'bloqueia');
  assert.ok(!X.conferirLote(ler([evento('Correção do peso bruto e do número de volumes')])).some(x => x.regra === 'carta_muda_imposto'));
  assert.equal(X.conferirLote(ler([evento('Valor total do item 2 errado')])).find(x => x.regra === 'carta_muda_imposto').nivel, 'alerta');
});
t('cancelamento aceito entra em chavesCanceladas', () => {
  const l = ler([evento('Erro de digitação do pedido', '110111')]);
  assert.ok(X.chavesCanceladas(l.eventos).has(chaveDe({ cnpj: ACN, serie: 3, numero: 33 })));
});
t('inutilização é lida', () => {
  const r = le('<ProcInutNFe><inutNFe><infInut><ano>26</ano><CNPJ>73628307000105</CNPJ><mod>55</mod><serie>3</serie><nNFIni>15</nNFIni><nNFFin>19</nNFFin></infInut></inutNFe><retInutNFe><infInut><cStat>102</cStat></infInut></retInutNFe></ProcInutNFe>');
  assert.equal(r.tipo, 'inutilizacao'); assert.equal(r.de, 15); assert.equal(r.ate, 19);
});

// ── os cadastros (FiscalRegras) ──
t('os dois CNPJ das empresas passam na conferência de dígitos', () => { assert.ok(R.cnpjValido(ACN)); assert.ok(R.cnpjValido(DETECH)); });
t('CNPJ e CPF: dígito errado, repetido e tamanho', () => {
  assert.ok(!R.cnpjValido('73628307000106')); assert.ok(!R.cnpjValido('11111111111111')); assert.ok(!R.cnpjValido('123'));
  assert.ok(R.cpfValido('529.982.247-25')); assert.ok(!R.cpfValido('529.982.247-24')); assert.ok(!R.cpfValido('00000000000'));
  assert.ok(R.documentoValido('52998224725')); assert.ok(R.documentoValido('05481897000136')); assert.ok(!R.documentoValido('1234567'));
});
t('NCM e CEST: máscara e validade', () => { assert.equal(R.formatarNcm('85258929'), '8525.89.29'); assert.ok(R.ncmValido('8525.89.29')); assert.ok(!R.ncmValido('8525')); assert.equal(R.formatarCest('2100100'), '21.001.00'); });
t('cliente: inscrição estadual e indicador', () => {
  const f = (o) => ({ ...R.FISCAL_CLIENTE_VAZIO, ...o });
  assert.equal(R.erroDoFiscalCliente(f({})), null);
  assert.match(R.erroDoFiscalCliente(f({ indicador_ie: 'contribuinte' })), /precisa da inscrição/);
  assert.match(R.erroDoFiscalCliente(f({ indicador_ie: 'nao_contribuinte', inscricao_estadual: '255123456' })), /não tem inscrição/);
  assert.match(R.erroDoFiscalCliente(f({ indicador_ie: 'isento', inscricao_estadual: '255123456' })), /não tem inscrição/);
  assert.match(R.erroDoFiscalCliente(f({ codigo_ibge: '42119' })), /7 dígitos/);
  assert.equal(R.erroDoFiscalCliente(f({ indicador_ie: 'contribuinte', inscricao_estadual: '255.123.456', codigo_ibge: '4211900' })), null);
});
t('cliente: o que falta', () => {
  assert.deepEqual(R.faltasDoCliente(null), ['indicador_ie', 'tipo_orgao', 'retem_ir', 'codigo_ibge']);
  assert.deepEqual(R.faltasDoCliente({ indicador_ie: 'contribuinte', tipo_orgao: 'nenhum', retem_ir: false, codigo_ibge: '4211900' }), ['inscricao_estadual']);
  assert.deepEqual(R.faltasDoCliente({ indicador_ie: 'nao_contribuinte', tipo_orgao: 'estadual_sc', retem_ir: true, codigo_ibge: '4211900' }), []);
  assert.deepEqual(R.faltasDoCliente({ indicador_ie: 'isento', tipo_orgao: 'nenhum', retem_ir: false, codigo_ibge: '4211900' }), []);   // retem_ir falso é resposta, não falta
});
t('cliente: ida e volta do formulário', () => {
  const linha = { inscricao_estadual: '255123456', indicador_ie: 'contribuinte', tipo_orgao: 'nenhum', retem_ir: false, codigo_ibge: '4211900', inscricao_municipal: null, inscricao_suframa: null, observacao: null };
  const form = R.formDoFiscalCliente(linha); assert.equal(form.retem_ir, 'nao');
  const g = R.fiscalClienteParaGravar(form, 'u1'); assert.equal(g.retem_ir, false); assert.equal(g.inscricao_estadual, '255123456'); assert.equal(g.atualizado_por_id, 'u1');
  assert.equal(R.fiscalClienteParaGravar(R.FISCAL_CLIENTE_VAZIO, null).retem_ir, null);
});
t('item: o que falta', () => {
  assert.deepEqual(R.faltasDoItem({ ncm: '', ipi_pct: 0 }, null), ['ncm', 'origem_fiscal', 'monofasico', 'cest']);
  assert.deepEqual(R.faltasDoItem({ ncm: '85258929', ipi_pct: 0 }, { origem_fiscal: 0, monofasico: false, cest_nao_se_aplica: true }), []);
  assert.deepEqual(R.faltasDoItem({ ncm: '85258929', ipi_pct: 5 }, { origem_fiscal: 0, monofasico: false, cest_nao_se_aplica: true }), ['enquadramento_ipi']);
  assert.deepEqual(R.faltasDoItem({ ncm: '85258929', ipi_pct: 5 }, { origem_fiscal: 0, monofasico: true, cest: '2100100', enquadramento_ipi: '999' }), []);
  assert.deepEqual(R.faltasDoItem({ ncm: '85258929', ipi_pct: 0 }, { origem_fiscal: 0, monofasico: false }), ['cest']);   // origem 0 é resposta, não falta
});
t('item: validações e gravação', () => {
  const f = (o) => ({ ...R.FISCAL_ITEM_VAZIO, ...o });
  assert.equal(R.erroDoFiscalItem(f({})), null);
  assert.match(R.erroDoFiscalItem(f({ cest: '123' })), /7 dígitos/);
  assert.match(R.erroDoFiscalItem(f({ cest: '2100100', cest_nao_se_aplica: true })), /não os dois/);
  assert.match(R.erroDoFiscalItem(f({ enquadramento_ipi: '99' })), /3 dígitos/);
  assert.match(R.erroDoFiscalItem(f({ origem_fiscal: '9' })), /0 a 8/);
  const g = R.fiscalItemParaGravar(f({ origem_fiscal: '0', monofasico: 'nao', cest_nao_se_aplica: true }), 'u1');
  assert.equal(g.origem_fiscal, 0); assert.equal(g.monofasico, false); assert.equal(g.cest, null);
  assert.equal(R.fiscalItemParaGravar(R.FISCAL_ITEM_VAZIO, null).origem_fiscal, null);
});
t('empresa emitente: série nova não pode repetir a de hoje', () => {
  const f = (o) => ({ ...R.FISCAL_EMITENTE_VAZIO, ...o });
  assert.equal(R.erroDoEmitente(f({ cnpj: ACN, serie_nfe: '3', serie_nfe_nova: '4' })), null);
  assert.match(R.erroDoEmitente(f({ serie_nfe: '3', serie_nfe_nova: '3' })), /colide/);
  assert.match(R.erroDoEmitente(f({ cnpj: '73628307000106' })), /CNPJ/);
  assert.match(R.erroDoEmitente(f({ serie_nfe: 'abc' })), /número/);
  assert.match(R.erroDoEmitente(f({ uf: 'XX' })), /UF/);
  assert.ok(R.faltasDoEmitente({ cnpj: ACN, crt: 3, serie_nfe: 3 }).includes('inscrição estadual'));
  assert.deepEqual(R.faltasDoEmitente({ razao_social: 'X', cnpj: ACN, inscricao_estadual: '1', crt: 3, inscricao_municipal: '1', cep: '1', logradouro: 'r', numero: '1', bairro: 'b', cidade: 'c', uf: 'SC', codigo_ibge: '4211900', serie_nfe: 3 }), []);
});
t('transportadora: validações', () => {
  const f = (o) => ({ ...R.FISCAL_TRANSPORTADORA_VAZIA, ...o });
  assert.match(R.erroDaTransportadora(f({})), /nome/);
  assert.equal(R.erroDaTransportadora(f({ nome: 'TRANSP X' })), null);
  assert.match(R.erroDaTransportadora(f({ nome: 'X', documento: '123' })), /CNPJ ou CPF/);
  assert.equal(R.erroDaTransportadora(f({ nome: 'X', documento: '05.481.897/0001-36', email: 'a@b.com' })), null);
  assert.match(R.erroDaTransportadora(f({ nome: 'X', email: 'sem arroba' })), /e-mail/);
  assert.equal(R.transportadoraParaGravar(f({ nome: ' X ', documento: '05.481.897/0001-36' }), 'u1').documento, '05481897000136');
});

// ═══ O arquivo de notas emitidas (src/FiscalArquivo.ts) ═══
t('emissaoDia: o dia como a nota escreve, sem fuso', () => {
  assert.equal(A.emissaoDia('2026-11-20T23:30:00-03:00'), '2026-11-20');
  assert.equal(A.emissaoDia('2026-11-20'), '2026-11-20');
  assert.equal(A.emissaoDia(''), ''); assert.equal(A.emissaoDia('20/11/2026'), ''); assert.equal(A.emissaoDia(null), '');
});
t('numeroInteiro: zeros à esquerda saem; letra e vazio viram nulo', () => {
  assert.equal(A.numeroInteiro('000123'), 123); assert.equal(A.numeroInteiro('7'), 7);
  assert.equal(A.numeroInteiro(''), null); assert.equal(A.numeroInteiro('12a'), null); assert.equal(A.numeroInteiro(undefined), null);
});
const lida = (o = {}) => { const n = le(nota(o)); return { ...n, arquivo: 'a.xml' }; };
t('registroDaNota leva os campos e conta bloqueios e alertas', () => {
  const n = lida({ numero: 321 });
  const r = A.registroDaNota(n, [{ regra: 'cfop_destino', nivel: 'bloqueia' }, { regra: 'ibscbs_faltando', nivel: 'alerta' }, { regra: 'ibscbs_faltando', nivel: 'alerta' }], '<xml/>');
  assert.equal(r.numero, 321); assert.equal(r.serie, 3); assert.equal(r.emitente_cnpj, ACN); assert.equal(r.emissao_dia, '2026-11-20'); assert.equal(r.qtd_itens, 2);
  assert.equal(r.bloqueios, 1); assert.equal(r.alertas, 2); assert.deepEqual(r.regras, ['cfop_destino', 'ibscbs_faltando']); assert.equal(r.valor_nf, 200); assert.equal(r.xml, '<xml/>'); assert.equal(r.autorizada, true);
});
t('registroDaNota recusa nota sem chave de 44 dígitos, sem número ou sem CNPJ (nunca vai ao banco)', () => {
  const n = lida();
  assert.equal(A.registroDaNota({ ...n, chave: '123' }, [], 'x'), null);
  assert.equal(A.registroDaNota({ ...n, numero: '' }, [], 'x'), null);
  assert.equal(A.registroDaNota({ ...n, emitCnpj: '' }, [], 'x'), null);
});
t('registroDoEvento e registroDaInutilizacao: o que falta recusa', () => {
  const chave = chaveDe({ cnpj: ACN, serie: 3, numero: 5 });
  assert.equal(A.registroDoEvento({ chave, tpEvento: '110111', sequencia: '1', texto: 'x', data: '2026-11-21T10:00:00-03:00', cStat: '135', arquivo: 'e.xml' }, '<e/>').data_dia, '2026-11-21');
  assert.equal(A.registroDoEvento({ chave: '12', tpEvento: '110111', sequencia: '1', texto: '', data: '', cStat: '', arquivo: '' }, 'x'), null);
  assert.equal(A.registroDoEvento({ chave, tpEvento: '', sequencia: '1', texto: '', data: '', cStat: '', arquivo: '' }, 'x'), null);
  assert.equal(A.registroDaInutilizacao({ cnpj: ACN, serie: '3', modelo: '55', de: 5, ate: 7, ano: '26', cStat: '102', arquivo: 'i.xml' }, '<i/>').ate, 7);
  assert.equal(A.registroDaInutilizacao({ cnpj: ACN, serie: '3', modelo: '55', de: 8, ate: 7, ano: '26', cStat: '102', arquivo: 'i.xml' }, 'x'), null);
  assert.equal(A.registroDaInutilizacao({ cnpj: '', serie: '3', modelo: '55', de: 1, ate: 1, ano: '', cStat: '', arquivo: '' }, 'x'), null);
});
t('situacaoDaNota: cancelada vale mais que o protocolo; sem protocolo e rejeitada são distintas', () => {
  const canc = A.canceladas([{ chave: 'A', tp_evento: '110111', cstat: '135' }, { chave: 'B', tp_evento: '110111', cstat: '573' }, { chave: 'C', tp_evento: '110110', cstat: '135' }, { chave: 'D', tp_evento: '110111', cstat: null }]);
  assert.deepEqual([...canc].sort(), ['A', 'D']);   // B foi rejeitado, C é carta de correção
  assert.equal(A.situacaoDaNota({ chave: 'A', autorizada: true }, canc), 'cancelada');
  assert.equal(A.situacaoDaNota({ chave: 'B', autorizada: true }, canc), 'emitida');
  assert.equal(A.situacaoDaNota({ chave: 'X', autorizada: false }, canc), 'rejeitada');
  assert.equal(A.situacaoDaNota({ chave: 'X', autorizada: null }, canc), 'sem_protocolo');
});
t('faixas: números seguidos viram uma faixa', () => {
  assert.deepEqual(A.faixas([5, 6, 7, 10, 12, 11, 7]).map(A.textoDaFaixa), ['5–7', '10–12']);
  assert.deepEqual(A.faixas([]), []); assert.deepEqual(A.faixas([4]).map(A.textoDaFaixa), ['4']);
});
const nn = (numero, serie = 3, cnpj = ACN, chave = `${cnpj}-${serie}-${numero}`) => ({ chave, emitente_cnpj: cnpj, serie, modelo: '55', numero });
t('lacunasDaNumeracao: o buraco aparece; inutilizado e cancelado (que tem XML) não contam', () => {
  const g = A.lacunasDaNumeracao([nn(1), nn(2), nn(3), nn(8), nn(9), nn(12)], [{ cnpj: ACN, serie: 3, modelo: '55', de: 4, ate: 6 }])[0];
  assert.equal(g.primeiro, 1); assert.equal(g.ultimo, 12); assert.equal(g.guardadas, 6);
  assert.deepEqual(g.faltam, [7, 10, 11]); assert.deepEqual(g.faixasQueFaltam.map(A.textoDaFaixa), ['7', '10–11']); assert.equal(g.inutilizadas, 3);
});
t('lacunasDaNumeracao: cada empresa e cada série têm a sua conta; inutilização de outra série não vale', () => {
  const r = A.lacunasDaNumeracao([nn(1), nn(3), nn(1, 1, DETECH), nn(2, 1, DETECH)], [{ cnpj: ACN, serie: 1, modelo: '55', de: 2, ate: 2 }]);
  assert.equal(r.length, 2);
  const acn = r.find(g => g.cnpj === ACN), det = r.find(g => g.cnpj === DETECH);
  assert.deepEqual(acn.faltam, [2]); assert.deepEqual(det.faltam, []);
});
t('lacunasDaNumeracao: número repetido com chaves diferentes aparece como repetido; mesmo número com a mesma chave não', () => {
  const g = A.lacunasDaNumeracao([nn(1), nn(2, 3, ACN, 'k1'), nn(2, 3, ACN, 'k2')], [])[0];
  assert.deepEqual(g.repetidas.map(x => x.numero), [2]); assert.deepEqual(g.repetidas[0].chaves, ['k1', 'k2']);
  assert.deepEqual(A.lacunasDaNumeracao([nn(1), nn(2)], [])[0].repetidas, []);
});
t('lacunasDaNumeracao: nota sem série, sem número ou sem CNPJ fica de fora, nunca lança', () => {
  assert.deepEqual(A.lacunasDaNumeracao([{ chave: 'x', emitente_cnpj: ACN, serie: null, numero: 1 }, { chave: 'y', emitente_cnpj: '', serie: 3, numero: 1 }, { chave: 'z', emitente_cnpj: ACN, serie: 3, numero: 0 }], []), []);
  assert.deepEqual(A.lacunasDaNumeracao([], []), []);
});
t('numerosDaNotaDaOp: cada sequência de dígitos é uma nota', () => {
  assert.deepEqual(A.numerosDaNotaDaOp('11197'), [11197]); assert.deepEqual(A.numerosDaNotaDaOp('1670 / 1671'), [1670, 1671]); assert.deepEqual(A.numerosDaNotaDaOp(' '), []); assert.deepEqual(A.numerosDaNotaDaOp(null), []);
});
const CODIGOS = new Map([[ACN, 'ACN'], [DETECH, 'DETECH']]);
t('opsDaNota: casa pelo número e pela empresa (acento e caixa não contam); empresa vazia casa com qualquer uma', () => {
  const ops = [{ opl: 'A1', numero_nf: '1679', faturamento_empresa: 'Detech' }, { opl: 'A2', numero_nf: '1679', faturamento_empresa: 'ACN' }, { opl: 'A3', numero_nf: '1679 / 1680', faturamento_empresa: '' }, { opl: 'A4', numero_nf: '9', faturamento_empresa: 'ACN' }];
  assert.deepEqual(A.opsDaNota({ emitente_cnpj: DETECH, numero: 1679 }, ops, CODIGOS).map(o => o.opl), ['A1', 'A3']);
  assert.deepEqual(A.opsDaNota({ emitente_cnpj: ACN, numero: '1679' }, ops, CODIGOS).map(o => o.opl), ['A2', 'A3']);
  assert.deepEqual(A.opsDaNota({ emitente_cnpj: ACN, numero: 5 }, ops, CODIGOS), []);
  // emitente desconhecido: o número basta
  assert.deepEqual(A.opsDaNota({ emitente_cnpj: '11111111000191', numero: 9 }, ops, CODIGOS).map(o => o.opl), ['A4']);
});
t('opsSemXml: a OP cuja nota não está guardada aparece; a que está, não; a nota de OUTRA empresa com o mesmo número não conta', () => {
  const ops = [{ opl: 'A1', numero_nf: '10', faturamento_empresa: 'ACN' }, { opl: 'A2', numero_nf: '11', faturamento_empresa: 'ACN' }, { opl: 'A3', numero_nf: '10', faturamento_empresa: 'Detech' }, { opl: 'A4', numero_nf: '', faturamento_empresa: 'ACN' }];
  const notas = [{ emitente_cnpj: ACN, numero: 10 }];
  const r = A.opsSemXml(ops, notas, CODIGOS);
  assert.deepEqual(r.map(x => x.opl + ':' + x.numero), ['A2:11', 'A3:10']);
});

// ═══ Prontidão da OP para virar nota e nota guardada na OP (26/11/2026) ═══
const P = await import(pathToFileURL(RAIZ + '/FiscalProntidao.ts').href);

// um mundo pequeno e COMPLETO: a OP deste mundo está pronta; cada teste estraga UMA coisa e confere que só ela é pega
const EMITENTE_OK = { codigo: 'ACN', razao_social: 'ACN SINAL VERDE LTDA', cnpj: ACN, inscricao_estadual: '255123456', crt: 3, inscricao_municipal: '123', cep: '88132000', logradouro: 'RUA A', numero: '1', bairro: 'CENTRO', cidade: 'PALHOCA', uf: 'SC', codigo_ibge: '4211900', serie_nfe: 3 };
const CLIENTE_OK = { id: 'c1', nome: 'Prefeitura de Teste', documento: '11222333000181' };
const FISCAL_CLIENTE_OK = { indicador_ie: 'isento', tipo_orgao: 'municipal', retem_ir: true, codigo_ibge: '4205407' };
const ITEM_OK = { id: 'i1', codigo: '225', nome: 'SINALIZADOR INTERLED2 VERMELHO', ncm: '85122011', ipi_pct: 0, ativo: true, categoria: 'MERCADORIA PARA REVENDA' };
const FISCAL_ITEM_OK = { origem_fiscal: 0, monofasico: false, cest_nao_se_aplica: true };
const mundo = (alt = {}) => ({
  clientes: [CLIENTE_OK], fiscaisDosClientes: new Map([['c1', FISCAL_CLIENTE_OK]]),
  catalogo: [ITEM_OK], fiscaisDosItens: new Map([['i1', FISCAL_ITEM_OK]]), emitentes: [EMITENTE_OK], ...alt,
});
const OP_OK = { id: 'o1', opl: 'A1.2611', cliente_nome: ' prefeitura de TESTE ', faturamento_empresa: 'Acn', itens_vendidos: [{ nome: 'SINALIZADOR INTERLED2 VERMELHO', item_id: 'i1', quantidade: 2 }] };

t('prontidaoDaOp: o mundo completo está pronto (cliente por nome sem acento nem caixa, empresa em qualquer caixa)', () => {
  const p = P.prontidaoDaOp(OP_OK, mundo());
  assert.equal(p.situacao, 'pronta'); assert.equal(p.totalDeFaltas, 0); assert.equal(p.itensConferidos, 1); assert.deepEqual(p.pendencias, []);
});
t('prontidaoDaOp: falta dado do cliente → só o cliente é pego, com o nome do campo em português', () => {
  const p = P.prontidaoDaOp(OP_OK, mundo({ fiscaisDosClientes: new Map([['c1', { ...FISCAL_CLIENTE_OK, codigo_ibge: null, retem_ir: null }]]) }));
  assert.equal(p.situacao, 'faltam'); assert.equal(p.pendencias.length, 1); assert.equal(p.pendencias[0].grupo, 'cliente');
  assert.deepEqual(p.pendencias[0].faltas, ['Retém IR', 'Código IBGE']);
});
t('prontidaoDaOp: cliente sem linha fiscal (ninguém respondeu) NÃO é pronto', () => {
  const p = P.prontidaoDaOp(OP_OK, mundo({ fiscaisDosClientes: new Map() }));
  assert.equal(p.situacao, 'faltam'); assert.equal(p.pendencias[0].grupo, 'cliente'); assert.ok(p.pendencias[0].faltas.length >= 4);
});
t('prontidaoDaOp: CPF/CNPJ inválido no cadastro do cliente é pego', () => {
  const p = P.prontidaoDaOp(OP_OK, mundo({ clientes: [{ ...CLIENTE_OK, documento: '11222333000182' }] }));
  assert.equal(p.situacao, 'faltam'); assert.ok(p.pendencias[0].faltas.includes('CPF/CNPJ do cadastro'));
});
t('prontidaoDaOp: nome do cliente que não está no cadastro é dito, nunca vira pronta', () => {
  const p = P.prontidaoDaOp({ ...OP_OK, cliente_nome: 'LETICIA - PV A 1741 - AMBIENTAL' }, mundo());
  assert.equal(p.situacao, 'faltam'); assert.match(p.pendencias[0].faltas[0], /não achei no cadastro de clientes/);
});
t('prontidaoDaOp: dois clientes com o mesmo nome é ambíguo: não se chuta', () => {
  const p = P.prontidaoDaOp(OP_OK, mundo({ clientes: [CLIENTE_OK, { ...CLIENTE_OK, id: 'c2' }] }));
  assert.equal(p.situacao, 'faltam'); assert.match(p.pendencias[0].faltas[0], /mais de um cadastro/);
});
t('acharCliente: o CPF/CNPJ da OP manda sobre o nome; documento que não está no cadastro cai no nome', () => {
  const dois = [CLIENTE_OK, { id: 'c9', nome: 'Outro Nome', documento: '45.723.174/0001-10' }];
  assert.equal(P.acharCliente({ cliente_nome: 'Prefeitura de Teste', cnpj_faturamento: '45723174000110' }, dois).cliente.id, 'c9');
  assert.equal(P.acharCliente({ cliente_nome: 'Prefeitura de Teste', cnpj_faturamento: '99999999000199' }, dois).cliente.id, 'c1');
  assert.equal(P.acharCliente({ cliente_nome: '' }, dois).situacao, 'sem_nome');
});
t('prontidaoDaOp: falta dado do item (CEST, NCM) → só o item é pego, e o item repetido em duas linhas conta uma vez', () => {
  const op = { ...OP_OK, itens_vendidos: [...OP_OK.itens_vendidos, { nome: 'OUTRA LINHA DO MESMO', item_id: 'i1', quantidade: 1 }] };
  const p = P.prontidaoDaOp(op, mundo({ fiscaisDosItens: new Map([['i1', { origem_fiscal: 0, monofasico: false }]]), catalogo: [{ ...ITEM_OK, ncm: '' }] }));
  assert.equal(p.situacao, 'faltam'); assert.equal(p.pendencias.length, 1); assert.equal(p.pendencias[0].grupo, 'item');
  assert.deepEqual(p.pendencias[0].faltas, ['NCM', 'CEST']);
  assert.equal(p.itensConferidos, 1);
});
t('prontidaoDaOp: item que paga IPI sem enquadramento é pego (e o que não paga, não)', () => {
  const comIpi = P.prontidaoDaOp(OP_OK, mundo({ catalogo: [{ ...ITEM_OK, ipi_pct: 5 }] }));
  assert.deepEqual(comIpi.pendencias[0].faltas, ['Enquadramento IPI']);
  assert.equal(P.prontidaoDaOp(OP_OK, mundo()).situacao, 'pronta');
});
t('prontidaoDaOp: linha sem item_id acha o item pelo nome idêntico entre os ATIVOS; inativo e duplicado não valem', () => {
  const op = { ...OP_OK, itens_vendidos: [{ nome: 'sinalizador interled2 vermelho', quantidade: 1 }] };
  assert.equal(P.prontidaoDaOp(op, mundo()).situacao, 'pronta');
  assert.match(P.prontidaoDaOp(op, mundo({ catalogo: [{ ...ITEM_OK, ativo: false }] })).pendencias[0].faltas[0], /não achei este item/);
  assert.match(P.prontidaoDaOp(op, mundo({ catalogo: [ITEM_OK, { ...ITEM_OK, id: 'i2' }] })).pendencias[0].faltas[0], /mais de um item/);
});
t('prontidaoDaOp: serviço e item genérico não entram na conferência; venda SÓ de serviço não vira "pronta"', () => {
  const generico = { id: 'g1', nome: 'INSTALAÇÃO', categoria: 'GENERICO', ativo: true };
  const op = { ...OP_OK, itens_vendidos: [...OP_OK.itens_vendidos, { nome: 'INSTALAÇÃO', item_id: 'g1', quantidade: 1 }] };
  const p = P.prontidaoDaOp(op, mundo({ catalogo: [ITEM_OK, generico] }));
  assert.equal(p.situacao, 'pronta'); assert.equal(p.itensIgnorados, 1); assert.equal(p.itensConferidos, 1);
  const so = P.prontidaoDaOp({ ...OP_OK, itens_vendidos: [{ nome: 'INSTALAÇÃO', item_id: 'g1', quantidade: 1 }] }, mundo({ catalogo: [generico] }));
  assert.equal(so.situacao, 'faltam'); assert.match(so.pendencias[0].faltas[0], /só tem serviço/);
});
t('prontidaoDaOp: OP sem nenhum item vendido lançado NÃO está pronta ("ninguém respondeu" nunca vale como pronta)', () => {
  for (const itens of [[], null, undefined, 'lixo']) {
    const p = P.prontidaoDaOp({ ...OP_OK, itens_vendidos: itens }, mundo());
    assert.equal(p.situacao, 'faltam'); assert.match(p.pendencias[0].faltas[0], /não tem itens vendidos/);
  }
  // o texto de JSON também é lido
  assert.equal(P.prontidaoDaOp({ ...OP_OK, itens_vendidos: JSON.stringify(OP_OK.itens_vendidos) }, mundo()).situacao, 'pronta');
});
t('prontidaoDaOp: empresa que fatura — em branco, desconhecida ou com o cadastro incompleto é pega', () => {
  assert.match(P.prontidaoDaOp({ ...OP_OK, faturamento_empresa: '' }, mundo()).pendencias[0].faltas[0], /não diz qual empresa/);
  assert.match(P.prontidaoDaOp({ ...OP_OK, faturamento_empresa: 'XYZ' }, mundo()).pendencias[0].faltas[0], /não existe em Cadastros fiscais/);
  const p = P.prontidaoDaOp(OP_OK, mundo({ emitentes: [{ ...EMITENTE_OK, inscricao_estadual: null, crt: null }] }));
  assert.equal(p.pendencias[0].grupo, 'empresa'); assert.deepEqual(p.pendencias[0].faltas, ['inscrição estadual', 'regime (CRT)']);
});
t('prontidaoDaOp: o total soma tudo (empresa + cliente + item) e a ordem é empresa, cliente, item', () => {
  const p = P.prontidaoDaOp({ ...OP_OK, faturamento_empresa: '' }, mundo({ fiscaisDosClientes: new Map(), fiscaisDosItens: new Map() }));
  assert.deepEqual(p.pendencias.map(x => x.grupo), ['empresa', 'cliente', 'item']);
  assert.equal(p.totalDeFaltas, p.pendencias.reduce((s, x) => s + x.faltas.length, 0));
});
t('oQueAsOpsCitam: ids de item (sem repetir) e os nomes das linhas sem vínculo', () => {
  const r = P.oQueAsOpsCitam([{ itens_vendidos: [{ item_id: 'a', nome: 'X' }, { item_id: 'a', nome: 'X' }, { nome: 'Sem Vínculo' }, { nome: '' }] }, { itens_vendidos: [{ item_id: 'b' }] }, { itens_vendidos: null }]);
  assert.deepEqual(r.itemIds.sort(), ['a', 'b']); assert.deepEqual(r.nomes, ['SEM VINCULO']);
});
t('resumoDasProntidoes: conta as prontas e as que faltam e ignora o que não foi conferido', () => {
  const r = P.resumoDasProntidoes([{ situacao: 'pronta' }, { situacao: 'faltam' }, { situacao: 'faltam' }, undefined, null]);
  assert.deepEqual(r, { prontas: 1, faltam: 2, total: 3 });
});
t('notasDaOp: as notas que a OP cita, pelo número e pela empresa, da mais nova para a mais antiga', () => {
  const notas = [
    { chave: 'a', emitente_cnpj: ACN, numero: 1679, emissao_dia: '2026-11-10' }, { chave: 'b', emitente_cnpj: DETECH, numero: 1679, emissao_dia: '2026-11-11' },
    { chave: 'c', emitente_cnpj: ACN, numero: 1680, emissao_dia: '2026-11-12' }, { chave: 'd', emitente_cnpj: ACN, numero: 5, emissao_dia: '2026-11-13' },
  ];
  assert.deepEqual(A.notasDaOp({ opl: 'X', numero_nf: '1679 / 1680', faturamento_empresa: 'ACN' }, notas, CODIGOS).map(n => n.chave), ['c', 'a']);
  assert.deepEqual(A.notasDaOp({ opl: 'X', numero_nf: '1679', faturamento_empresa: 'Detech' }, notas, CODIGOS).map(n => n.chave), ['b']);
  assert.deepEqual(A.notasDaOp({ opl: 'X', numero_nf: '', faturamento_empresa: 'ACN' }, notas, CODIGOS), []);
});

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS (veja acima)' : ''}.`);
