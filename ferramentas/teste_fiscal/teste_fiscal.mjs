// Prova as regras puras do módulo fiscal (src/FiscalRegras.ts e src/FiscalXml.ts) sem abrir o sistema e sem banco.
// Usa só XML INVENTADO (notas sintéticas montadas aqui): nenhum XML real entra no repositório.
// Cada trava é provada nos dois sentidos: a nota certa passa limpa e a nota com o defeito plantado é pega.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../src', import.meta.url));
const R = await import(pathToFileURL(RAIZ + '/FiscalRegras.ts').href);
const X = await import(pathToFileURL(RAIZ + '/FiscalXml.ts').href);

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

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS (veja acima)' : ''}.`);
