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

// ═══ Ligar a OP ao cliente do cadastro (27/11/2026) ═══
const L = await import(pathToFileURL(RAIZ + '/FiscalLigacaoDaOp.ts').href);
const CLI_A = { id: 'c1', nome: 'Prefeitura de Teste', documento: '11222333000181' };
const CLI_B = { id: 'c2', nome: 'Outra Prefeitura', documento: '45723174000110' };

t('acharCliente: o cliente_id gravado na OP manda sobre o nome escrito e sobre o CPF/CNPJ', () => {
  const r = P.acharCliente({ cliente_id: 'c2', cliente_nome: 'Prefeitura de Teste', cnpj_faturamento: '11222333000181' }, [CLI_A, CLI_B]);
  assert.equal(r.situacao, 'achado'); assert.equal(r.cliente.id, 'c2'); assert.equal(r.por, 'id');
});
t('acharCliente: cliente_id que não está na lista lida NÃO cai no nome (nunca fatura para o cliente errado em silêncio)', () => {
  const r = P.acharCliente({ cliente_id: 'zzz', cliente_nome: 'Prefeitura de Teste' }, [CLI_A, CLI_B]);
  assert.equal(r.situacao, 'sem_cadastro'); assert.equal(r.por, 'id'); assert.equal(r.cliente, null);
});
t('prontidaoDaOp: OP ligada pelo id fica pronta mesmo com o nome escrito diferente do cadastro', () => {
  const p = P.prontidaoDaOp({ ...OP_OK, cliente_nome: 'LETICIA - PV A 1741 - AMBIENTAL', cliente_id: 'c1' }, mundo());
  assert.equal(p.situacao, 'pronta');
});
t('prontidaoDaOp: a pendência de cliente sem cadastro aponta o caminho (Cadastros fiscais › OPs sem cliente)', () => {
  const p = P.prontidaoDaOp({ ...OP_OK, cliente_nome: 'NOME QUE NAO EXISTE' }, mundo());
  assert.match(p.pendencias[0].faltas[0], /não achei no cadastro de clientes/); assert.match(p.pendencias[0].faltas[0], /OPs sem cliente/);
});
t('opPrecisaDeLigacao: só a OP viva, sem nota e sem ligação (cancelada, faturada, com nota ou já ligada ficam de fora)', () => {
  assert.equal(L.opPrecisaDeLigacao({ id: 1, cliente_nome: 'X', status_geral: 'Em Producao', numero_nf: '' }), true);
  assert.equal(L.opPrecisaDeLigacao({ id: 1, status_geral: 'Aguarda Emissao NF', numero_nf: null }), true);
  assert.equal(L.opPrecisaDeLigacao({ id: 1, status_geral: 'Cancelado' }), false);
  assert.equal(L.opPrecisaDeLigacao({ id: 1, status_geral: 'Faturado' }), false);
  assert.equal(L.opPrecisaDeLigacao({ id: 1, status_geral: 'Faturado e Disponivel para Entrega', numero_nf: '1679' }), false);
  assert.equal(L.opPrecisaDeLigacao({ id: 1, status_geral: 'Em Producao', cliente_id: 'c1' }), false);
  assert.equal(L.opPrecisaDeLigacao(null), false);
});
t('agruparParaLigar: o mesmo nome (sem acento nem caixa) vira UM grupo, com as OPs em ordem de número', () => {
  const ops = [{ id: 1, opl: 'A10.2611/02', cliente_nome: 'prefeitura de teste', status_geral: 'Em Producao' }, { id: 2, opl: 'A10.2611/01', cliente_nome: ' Prefeitura de Teste ', status_geral: 'Em Producao' }, { id: 3, opl: 'A11.2611', cliente_nome: 'Outro', status_geral: 'Em Producao' }];
  const g = L.agruparParaLigar(ops, [CLI_A, CLI_B]);
  assert.equal(g.length, 2); assert.equal(g[0].ops.length, 2);
  assert.deepEqual(g[0].ops.map(o => o.opl), ['A10.2611/01', 'A10.2611/02']);
  assert.equal(g[0].sugestao.situacao, 'achado'); assert.equal(g[0].sugestao.cliente.id, 'c1'); assert.equal(g[1].sugestao.situacao, 'sem_cadastro');
});
t('agruparParaLigar: dois cadastros com o mesmo nome é ambíguo; se as OPs do grupo apontam para cadastros diferentes (CNPJ), nada é sugerido', () => {
  const dois = [CLI_A, { ...CLI_A, id: 'c9' }];
  assert.equal(L.agruparParaLigar([{ id: 1, opl: 'A1', cliente_nome: 'Prefeitura de Teste', status_geral: 'Em Producao' }], dois)[0].sugestao.situacao, 'ambiguo');
  const ops = [{ id: 1, opl: 'A1', cliente_nome: 'Prefeitura', cnpj_faturamento: '11222333000181', status_geral: 'Em Producao' }, { id: 2, opl: 'A2', cliente_nome: 'Prefeitura', cnpj_faturamento: '45723174000110', status_geral: 'Em Producao' }];
  const s = L.agruparParaLigar(ops, [CLI_A, CLI_B])[0].sugestao;
  assert.notEqual(s.situacao, 'achado'); assert.equal(s.cliente, null);
});
t('agruparParaLigar: OP sem nome de cliente vira grupo "sem_nome" (nada a sugerir) e OP já ligada ou com nota não entra', () => {
  const g = L.agruparParaLigar([{ id: 1, opl: 'A1', cliente_nome: '', status_geral: 'Em Producao' }, { id: 2, opl: 'A2', cliente_nome: 'X', cliente_id: 'c1', status_geral: 'Em Producao' }, { id: 3, opl: 'A3', cliente_nome: 'X', numero_nf: '5', status_geral: 'Em Producao' }], [CLI_A]);
  assert.equal(g.length, 1); assert.equal(g[0].sugestao.situacao, 'sem_nome');
});
t('resumoDasLigacoes e gruposComSugestao: contam OPs e nomes, com e sem cadastro achado', () => {
  const ops = [{ id: 1, opl: 'A1', cliente_nome: 'Prefeitura de Teste', status_geral: 'Em Producao' }, { id: 2, opl: 'A2', cliente_nome: 'Prefeitura de Teste', status_geral: 'Em Producao' }, { id: 3, opl: 'A3', cliente_nome: 'Desconhecido', status_geral: 'Em Producao' }];
  const g = L.agruparParaLigar(ops, [CLI_A]);
  assert.equal(L.gruposComSugestao(g).length, 1);
  assert.deepEqual(L.resumoDasLigacoes(g), { ops: 3, nomes: 2, opsComSugestao: 2, nomesComSugestao: 1, opsSemSugestao: 1 });
});

// ═══ Mapa de tipos de nota por origem (27/11/2026) ═══
const N = await import(pathToFileURL(RAIZ + '/FiscalTiposDeNota.ts').href);
const PROD = { id: 'i1', nome: 'SINALIZADOR INTERLED2 VERMELHO', categoria: 'MERCADORIA PARA REVENDA', ativo: true };
const SERV = { id: 's1', nome: 'INSTALACAO DE KIT ADAPTACAO', categoria: 'GENERICO', ativo: true };
const FRETE = { id: 'f1', nome: 'FRETE SOBRE VENDAS', categoria: 'GENERICO', ativo: true };
const CAT = [PROD, SERV, FRETE];
const opCom = (...ids) => ({ itens_vendidos: ids.map(i => ({ item_id: i, nome: 'x', quantidade: 1 })) });

t('notasQueAOpPede: só mercadoria pede a NF-e; só serviço pede a NFS-e; as duas pedem as duas', () => {
  assert.equal(N.notasQueAOpPede(opCom('i1'), CAT).pede, 'material');
  assert.equal(N.notasQueAOpPede(opCom('s1'), CAT).pede, 'servico');
  const p = N.notasQueAOpPede(opCom('i1', 's1'), CAT);
  assert.equal(p.pede, 'material_e_servico'); assert.equal(p.produtos, 1); assert.equal(p.servicos, 1); assert.equal(p.certa, true);
});
t('notasQueAOpPede: frete não conta para nenhum lado (a contabilidade diz onde vai) e é dito nos motivos', () => {
  const p = N.notasQueAOpPede(opCom('i1', 'f1'), CAT);
  assert.equal(p.pede, 'material'); assert.equal(p.fretes, 1); assert.equal(p.servicos, 0);
  assert.ok(p.motivos.some(m => /frete/.test(m)));
  assert.equal(N.notasQueAOpPede(opCom('f1'), CAT).pede, 'indefinida');
});
t('notasQueAOpPede: OP sem itens lançados é "indefinida" e NÃO é certa (nunca se chuta pelo tipo da OP)', () => {
  const p = N.notasQueAOpPede({ itens_vendidos: [] }, CAT);
  assert.equal(p.pede, 'indefinida'); assert.equal(p.certa, false); assert.equal(p.semItens, true);
  assert.equal(N.notasQueAOpPede({ itens_vendidos: null }, CAT).certa, false);
});
t('notasQueAOpPede: linha que não se acha no cadastro tira a certeza (a OP pode vender mais do que se vê)', () => {
  const p = N.notasQueAOpPede({ itens_vendidos: [{ item_id: 'i1', nome: 'x' }, { nome: 'COISA QUE NAO EXISTE' }] }, CAT);
  assert.equal(p.naoSei, 1); assert.equal(p.certa, false); assert.equal(p.pede, 'material');
});
t('notasQueAOpPede: OP só de serviço de terceiro pede a NFS-e mesmo sem item lançado, e é certa', () => {
  const p = N.notasQueAOpPede({ fluxo_entrega: 'somente_servico_terceiro', itens_vendidos: [] }, CAT);
  assert.equal(p.pede, 'servico'); assert.equal(p.certa, true);
  assert.equal(N.notasQueAOpPede({ fluxo_entrega: 'somente_servico_terceiro', ...opCom('i1') }, CAT).pede, 'material_e_servico');
});
t('conferirNotasInformadas: sem nota nenhuma não há o que conferir; sem base, também não', () => {
  const pede = N.notasQueAOpPede(opCom('i1'), CAT);
  assert.equal(N.conferirNotasInformadas(pede, { numero_nf: '', numero_nf_servico: null }).situacao, 'sem_nota');
  assert.equal(N.conferirNotasInformadas(pede, { numero_nf: '  ', numero_nf_servico: ' ' }).situacao, 'sem_nota');   // só espaços não é número de nota
  assert.equal(N.conferirNotasInformadas(N.notasQueAOpPede({ itens_vendidos: [] }, CAT), { numero_nf: '10' }).situacao, 'sem_base');
});
t('conferirNotasInformadas: a nota certa confere; falta a de serviço, falta a de material e nota a mais são pegos nos dois sentidos', () => {
  const dois = N.notasQueAOpPede(opCom('i1', 's1'), CAT), mat = N.notasQueAOpPede(opCom('i1'), CAT), ser = N.notasQueAOpPede(opCom('s1'), CAT);
  assert.equal(N.conferirNotasInformadas(dois, { numero_nf: '1', numero_nf_servico: '2' }).situacao, 'confere');
  assert.match(N.conferirNotasInformadas(dois, { numero_nf: '1' }).divergencias[0], /só a NF-e foi informada/);
  assert.match(N.conferirNotasInformadas(dois, { numero_nf_servico: '2' }).divergencias[0], /só a NFS-e foi informada/);
  assert.equal(N.conferirNotasInformadas(mat, { numero_nf: '1' }).situacao, 'confere');
  assert.match(N.conferirNotasInformadas(mat, { numero_nf: '1', numero_nf_servico: '2' }).divergencias[0], /só vende mercadoria/);
  assert.equal(N.conferirNotasInformadas(ser, { numero_nf_servico: '2' }).situacao, 'confere');
  assert.match(N.conferirNotasInformadas(ser, { numero_nf: '1' }).divergencias.join('|'), /só vende serviço/);
  assert.equal(N.conferirNotasInformadas(ser, { numero_nf: '1' }).situacao, 'diverge');
});
t('resumoDaConferencia: conta confere, diverge e sem base e ignora OP sem nota', () => {
  const c = (situacao) => ({ conferencia: { situacao, divergencias: [], informadas: {} } });
  assert.deepEqual(N.resumoDaConferencia([c('confere'), c('diverge'), c('diverge'), c('sem_base'), c('sem_nota'), null]), { total: 4, confere: 1, diverge: 2, semBase: 1 });
});
t('ORIGENS_DE_NOTA: ids únicos, toda linha diz a base e o que o sistema sabe; o que não existe no sistema nunca é "historico"', () => {
  const ids = N.ORIGENS_DE_NOTA.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const o of N.ORIGENS_DE_NOTA) {
    assert.ok(['historico', 'a_confirmar'].includes(o.base), o.id); assert.ok(['sim', 'em_parte', 'nao'].includes(o.sistemaSabe), o.id);
    assert.ok(o.origem && o.nota && o.quemDiz, o.id);
    if (o.sistemaSabe === 'nao') assert.equal(o.base, 'a_confirmar', o.id);
  }
});

// ── motor das regras fiscais versionadas (27/11/2026, src/FiscalMotor.ts): regras INVENTADAS, nenhuma regra fiscal real mora no repositório ──
const M = await import(pathToFileURL(RAIZ + '/FiscalMotor.ts').href);
const rg = (rotulo, cond = {}, res = {}) => ({ id: rotulo, rotulo, emitente: null, tipo_operacao: null, destino: null, tipo_orgao: null, indicador_ie: null, ncm_prefixo: null, origem_fiscal: null, monofasico: null,
  cfop: '5102', cst_csosn: '00', aliquota_icms_pct: null, cbenef: null, informacao_complementar: null, exige_nota_referenciada: false, confirmada: true, fonte: 'teste', ...cond, ...res });
const GERAL = rg('Geral', {}, { cfop: '5000' });
const INTERNA = rg('Interna', { destino: 'dentro_uf' }, { cfop: '5102' });
const INTERESTADUAL = rg('Interestadual', { destino: 'fora_uf' }, { cfop: '6102' });
const INTERNA_NCM = rg('Interna NCM 8512', { destino: 'dentro_uf', ncm_prefixo: '8512' }, { cfop: '5101' });

t('compativeis / refina / maisEspecifica: "qualquer" é compatível com tudo, a regra com mais condições refina a de menos e NCM é por prefixo', () => {
  assert.ok(M.compativeis(GERAL, INTERNA)); assert.ok(M.compativeis(INTERNA, INTERNA_NCM));
  assert.ok(!M.compativeis(INTERNA, INTERESTADUAL));
  assert.ok(M.refina(INTERNA_NCM, INTERNA)); assert.ok(!M.refina(INTERNA, INTERNA_NCM));
  assert.ok(M.maisEspecifica(INTERNA_NCM, INTERNA)); assert.ok(!M.maisEspecifica(INTERNA, INTERNA_NCM)); assert.ok(!M.maisEspecifica(INTERNA, INTERNA));
  assert.ok(M.compativeis(rg('a', { ncm_prefixo: '8512' }), rg('b', { ncm_prefixo: '851220' })));
  assert.ok(!M.compativeis(rg('a', { ncm_prefixo: '8512' }), rg('b', { ncm_prefixo: '8517' })));
  assert.ok(M.refina(rg('a', { ncm_prefixo: '851220' }), rg('b', { ncm_prefixo: '8512' })));
  assert.ok(!M.refina(rg('a', { ncm_prefixo: '8512' }), rg('b', { ncm_prefixo: '851220' })));
  assert.ok(M.refina(rg('a', { origem_fiscal: 0 }), rg('b', { origem_fiscal: 0 })));   // 0 é uma origem (nacional), não "vazio"
  assert.ok(!M.compativeis(rg('a', { monofasico: true }), rg('b', { monofasico: false })));
  assert.equal(M.especificidade(INTERNA_NCM), 2);
});
t('conflitosDaVersao: duas regras que valem juntas, sem uma mais específica e com resultados diferentes são conflito; resultado igual ou uma contida na outra não', () => {
  const A = rg('A', { emitente: 'ACN', destino: 'dentro_uf' }, { cfop: '5102' }), B = rg('B', { ncm_prefixo: '8512', destino: 'dentro_uf' }, { cfop: '5101' });
  assert.equal(M.conflitosDaVersao([A, B]).length, 1);
  assert.equal(M.conflitosDaVersao([A, { ...B, cfop: '5102' }]).length, 0);            // mesmo resultado: não faz mal
  assert.equal(M.conflitosDaVersao([GERAL, INTERNA, INTERNA_NCM]).length, 0);           // cada uma contida na seguinte
  assert.equal(M.conflitosDaVersao([INTERNA, INTERESTADUAL]).length, 0);                // nunca valem juntas
  assert.equal(M.conflitosDaVersao([rg('A', { destino: 'dentro_uf' }, { aliquota_icms_pct: 12 }), rg('B', { destino: 'dentro_uf', tipo_orgao: 'municipal' }, { aliquota_icms_pct: 17 }), rg('C', { destino: 'dentro_uf', ncm_prefixo: '85' }, { aliquota_icms_pct: 7 })]).length, 1);   // B e C se pisam; A contém as duas
});
t('escolherRegra: acha a regra, a mais específica ganha e o resultado vem junto', () => {
  const regras = [GERAL, INTERNA, INTERESTADUAL, INTERNA_NCM];
  let e = M.escolherRegra({ destino: 'dentro_uf', ncm: '85122011' }, regras);
  assert.equal(e.situacao, 'achou'); assert.equal(e.regra.rotulo, 'Interna NCM 8512'); assert.equal(e.confirmada, true);
  e = M.escolherRegra({ destino: 'dentro_uf', ncm: '85258929' }, regras);
  assert.equal(e.situacao, 'achou'); assert.equal(e.regra.rotulo, 'Interna');
  e = M.escolherRegra({ destino: 'fora_uf', ncm: '85122011' }, regras);
  assert.equal(e.regra.rotulo, 'Interestadual');
  e = M.escolherRegra({ destino: 'exterior', ncm: '85122011' }, regras);
  assert.equal(e.regra.rotulo, 'Geral');
});
t('escolherRegra: sem regra é resposta (nunca um valor inventado) e versão vazia também', () => {
  let e = M.escolherRegra({ destino: 'exterior' }, [INTERNA, INTERESTADUAL]);
  assert.equal(e.situacao, 'sem_regra'); assert.equal(e.regra, null); assert.match(e.porque, /contabilidade ainda não disse/);
  e = M.escolherRegra({ destino: 'dentro_uf' }, []);
  assert.equal(e.situacao, 'sem_regra'); assert.match(e.porque, /não tem regra nenhuma/);
});
t('escolherRegra: dado que falta e poderia mudar a resposta vira "faltam dados" (nos dois casos: nenhuma serve ainda, ou uma mais específica poderia valer)', () => {
  let e = M.escolherRegra({}, [INTERNA, INTERESTADUAL]);
  assert.equal(e.situacao, 'faltam_dados'); assert.deepEqual(e.faltam, ['destino']);
  e = M.escolherRegra({ destino: 'dentro_uf' }, [INTERNA, INTERNA_NCM]);                   // sem NCM não dá para dizer se vale a mais específica
  assert.equal(e.situacao, 'faltam_dados'); assert.equal(e.regra.rotulo, 'Interna'); assert.deepEqual(e.faltam, ['ncm_prefixo']);
  e = M.escolherRegra({ destino: 'dentro_uf', ncm: '85' }, [INTERNA, INTERNA_NCM]);        // NCM curto demais para decidir
  assert.equal(e.situacao, 'faltam_dados');
  e = M.escolherRegra({ destino: 'dentro_uf', ncm: '8517' }, [INTERNA, INTERNA_NCM]);      // NCM que a mais específica descarta: a geral basta
  assert.equal(e.situacao, 'achou'); assert.equal(e.regra.rotulo, 'Interna');
});
t('escolherRegra: conflito é resposta (e regras sobrepostas com o MESMO resultado não são conflito)', () => {
  const A = rg('A', { emitente: 'ACN' }, { cfop: '5102' }), B = rg('B', { ncm_prefixo: '8512' }, { cfop: '5101' });
  let e = M.escolherRegra({ emitente: 'ACN', ncm: '85122011' }, [A, B]);
  assert.equal(e.situacao, 'conflito'); assert.equal(e.regra, null); assert.equal(e.candidatas.length, 2);
  e = M.escolherRegra({ emitente: 'ACN', ncm: '85122011' }, [A, { ...B, cfop: '5102' }]);
  assert.equal(e.situacao, 'achou');
  e = M.escolherRegra({ emitente: 'DETECH', ncm: '85122011' }, [A, B]);                    // só a B serve
  assert.equal(e.regra.rotulo, 'B');
});
t('escolherRegra: regra não confirmada é achada, mas marcada: não vale para emitir', () => {
  const e = M.escolherRegra({ destino: 'dentro_uf' }, [{ ...INTERNA, confirmada: false, fonte: '' }]);
  assert.equal(e.situacao, 'achou'); assert.equal(e.confirmada, false); assert.match(e.porque, /NÃO vale para emitir/);
});
t('escolherRegra: monofásico, origem 0 e NCM com pontuação são lidos do contexto sem erro', () => {
  const regras = [rg('Mono', { monofasico: true }, { cst_csosn: '04' }), rg('Nacional', { origem_fiscal: 0, monofasico: false }, { cst_csosn: '00' })];
  assert.equal(M.escolherRegra({ monofasico: true }, regras).regra.rotulo, 'Mono');
  assert.equal(M.escolherRegra({ monofasico: 'nao', origem_fiscal: 0 }, regras).regra.rotulo, 'Nacional');
  assert.equal(M.escolherRegra({ monofasico: false, origem_fiscal: '0' }, regras).regra.rotulo, 'Nacional');
  assert.equal(M.escolherRegra({ ncm: '8512.20.11' }, [rg('N', { ncm_prefixo: '8512' })]).situacao, 'achou');
});
t('problemasParaAprovar: versão vazia, regra a confirmar, sem fonte, mesmas condições e conflito barram; versão em ordem não tem problema', () => {
  assert.deepEqual(M.problemasParaAprovar([INTERNA, INTERESTADUAL]), []);
  assert.match(M.problemasParaAprovar([])[0], /nenhuma regra/);
  assert.match(M.problemasParaAprovar([{ ...INTERNA, confirmada: false }]).join('|'), /a confirmar com a contabilidade/);
  assert.match(M.problemasParaAprovar([{ ...INTERNA, fonte: '  ' }]).join('|'), /sem dizer a fonte/);
  assert.match(M.problemasParaAprovar([INTERNA, { ...INTERNA, rotulo: 'Repetida' }]).join('|'), /mesmas condições/);
  assert.match(M.problemasParaAprovar([rg('A', { emitente: 'ACN' }, { cfop: '5102' }), rg('B', { ncm_prefixo: '8512' }, { cfop: '5101' })]).join('|'), /nenhuma é mais específica/);
});
t('erroDaRegra / regraParaGravar: exige nome, CFOP de 4 números, CST/CSOSN, alíquota válida, cBenef de 8 a 10 e fonte quando confirmada; grava só dígitos e vazio vira nulo', () => {
  const ok = { ...M.FORM_DA_REGRA_VAZIO, rotulo: 'Venda interna', cfop: '5102', cst_csosn: '00' };
  assert.equal(M.erroDaRegra(ok), null);
  assert.match(M.erroDaRegra({ ...ok, rotulo: 'ab' }), /nome/);
  assert.match(M.erroDaRegra({ ...ok, cfop: '51' }), /CFOP/);
  assert.match(M.erroDaRegra({ ...ok, cst_csosn: '' }), /CST/);
  assert.match(M.erroDaRegra({ ...ok, aliquota_icms_pct: '130' }), /alíquota/);
  assert.match(M.erroDaRegra({ ...ok, aliquota_icms_pct: 'abc' }), /alíquota/);
  assert.equal(M.erroDaRegra({ ...ok, aliquota_icms_pct: '12,5' }), null);
  assert.match(M.erroDaRegra({ ...ok, cbenef: 'SC81' }), /cBenef/);
  assert.equal(M.erroDaRegra({ ...ok, cbenef: 'SC810010' }), null);
  assert.match(M.erroDaRegra({ ...ok, confirmada: true, fonte: '' }), /fonte/);
  assert.equal(M.erroDaRegra({ ...ok, confirmada: true, fonte: 'e-mail de 27/11' }), null);
  assert.match(M.erroDaRegra({ ...ok, ncm_prefixo: '8' }), /NCM/);
  const g = M.regraParaGravar({ ...ok, ncm_prefixo: '8512.2', aliquota_icms_pct: '12,5', cbenef: 'sc810010', origem_fiscal: '0', monofasico: 'nao', destino: 'dentro_uf' }, 'V');
  assert.equal(g.versao_id, 'V'); assert.equal(g.ncm_prefixo, '85122'); assert.equal(g.aliquota_icms_pct, 12.5); assert.equal(g.cbenef, 'SC810010');
  assert.equal(g.origem_fiscal, 0); assert.equal(g.monofasico, false); assert.equal(g.emitente, null); assert.equal(g.tipo_operacao, null); assert.equal(g.confirmada, false);
  assert.equal(M.regraParaGravar(ok, 'V').monofasico, null); assert.equal(M.regraParaGravar(ok, 'V').origem_fiscal, null);
});
t('formDaRegra: a regra gravada volta ao formulário sem perder o que é 0, falso ou vírgula', () => {
  const linha = rg('X', { origem_fiscal: 0, monofasico: false, destino: 'fora_uf' }, { aliquota_icms_pct: '12.50' });
  const f = M.formDaRegra(linha);
  assert.equal(f.origem_fiscal, '0'); assert.equal(f.monofasico, 'nao'); assert.equal(f.aliquota_icms_pct, '12,50'); assert.equal(f.destino, 'fora_uf');
  assert.deepEqual(M.formDaRegra(null), M.FORM_DA_REGRA_VAZIO);
});
t('compararVersoes: nova, tirada e mudou (campo a campo), casando pelas condições e não pelo nome', () => {
  const antes = [INTERNA, INTERESTADUAL, rg('Só antes', { destino: 'exterior' })];
  const agora = [{ ...INTERNA, rotulo: 'Interna (renomeada)', cfop: '5101' }, INTERESTADUAL, rg('Nova', { tipo_orgao: 'municipal' })];
  const m = M.compararVersoes(antes, agora);
  assert.equal(m.length, 3);
  const mudou = m.find(x => x.tipo === 'mudou'); assert.deepEqual(mudou.campos.sort(), ['CFOP', 'nome']);
  assert.equal(m.find(x => x.tipo === 'nova').regra.rotulo, 'Nova'); assert.equal(m.find(x => x.tipo === 'tirada').regra.rotulo, 'Só antes');
  assert.deepEqual(M.compararVersoes(antes, antes), []);
});
t('resumoDasCondicoes: diz só o que a regra restringe', () => {
  assert.deepEqual(M.resumoDasCondicoes(GERAL), []);
  const r = M.resumoDasCondicoes(rg('x', { emitente: 'ACN', destino: 'fora_uf', ncm_prefixo: '8512', origem_fiscal: 0, monofasico: false }), id => 'OP ' + id);
  assert.ok(r.includes('Empresa ACN') && r.includes('NCM 8512…') && r.includes('Origem 0') && r.includes('Não monofásico') && r.some(x => /interestadual/.test(x)), r.join('|'));
});

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS (veja acima)' : ''}.`);
