// Prova as regras puras do endereço (src/Rotas.ts) sem abrir o sistema.
// As telas vêm do próprio DashboardTab.tsx (o menu de verdade), não de uma lista copiada: se alguém acrescentar uma tela com nome que colide, o teste pega.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../src', import.meta.url));   // a pasta src deste repositório
const R = await import(pathToFileURL(RAIZ + '/Rotas.ts').href);
const { nomeNoEndereco, idDaTela, lerEndereco, montarEndereco, decidirEndereco, conferirQuadroDeNomes, PALAVRAS_RESERVADAS,
  registroDoEndereco, montarEnderecoDaOp, montarEnderecoDeRegistro, ehCodigoInterno, normalizarChave, mesmaChave,
  REGISTROS_DAS_TELAS, registroDaTelaNoEndereco, montarEnderecoDoRegistroDaTela, registroDoRecado } = R;

// ── as telas do menu, lidas do código ──
const fonte = fs.readFileSync(RAIZ + '/DashboardTab.tsx', 'utf8');
const ini = fonte.indexOf('const SIDEBAR_GROUPS');
const fim = fonte.indexOf('const IDS_DAS_TELAS');
assert.ok(ini > 0 && fim > ini, 'não achei o menu no DashboardTab');
const IDS = [...fonte.slice(ini, fim).matchAll(/\{\s*id:\s*'([a-z0-9_]+)'\s*,\s*label:/g)].map(m => m[1]);
console.log(`telas do menu lidas do código: ${IDS.length}`);
assert.equal(IDS.length, 38, 'o menu tinha 38 telas quando o teste foi escrito; se mudou de propósito, atualize este número');
assert.equal(new Set(IDS).size, IDS.length, 'ids repetidos no menu');

let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { console.error(`FALHOU: ${nome}\n  ${e.message}`); process.exitCode = 1; } };

// ── quadro de nomes ──
t('quadro de nomes sem problema', () => assert.deepEqual(conferirQuadroDeNomes(IDS), []));
t('nenhuma tela usa palavra reservada', () => IDS.forEach(id => assert.ok(!PALAVRAS_RESERVADAS.includes(nomeNoEndereco(id)), id)));
t('painel_tv vira painel-tv', () => assert.equal(nomeNoEndereco('painel_tv'), 'painel-tv'));
t('compras fica compras', () => assert.equal(montarEndereco('compras'), '#/compras'));
t('endereço do Painel TV', () => assert.equal(montarEndereco('painel_tv'), '#/painel-tv'));
t('todo nome é minúsculo, sem espaço e sem símbolo de endereço', () => IDS.forEach(id => assert.match(nomeNoEndereco(id), /^[a-z0-9-]+$/)));
t('os 38 nomes são diferentes entre si', () => assert.equal(new Set(IDS.map(nomeNoEndereco)).size, IDS.length));
t('ida e volta de cada tela', () => IDS.forEach(id => assert.deepEqual(lerEndereco(montarEndereco(id), IDS), { tipo: 'tela', tela: id, resto: [] })));
t('o quadro detecta nome repetido', () => assert.ok(conferirQuadroDeNomes(['a_b', 'a-b']).length >= 1));
t('o quadro detecta palavra reservada', () => assert.ok(conferirQuadroDeNomes(['op']).some(p => p.includes('reservado'))));
t('o quadro detecta símbolo no nome', () => assert.ok(conferirQuadroDeNomes(['a b']).length >= 1));

// ── leitura do endereço: formas aceitas ──
const tela = (hash, id, resto = []) => assert.deepEqual(lerEndereco(hash, IDS), { tipo: 'tela', tela: id, resto });
t('#/compras', () => tela('#/compras', 'compras'));
t('#compras (sem a barra)', () => tela('#compras', 'compras'));
t('#/compras/ (barra no fim)', () => tela('#/compras/', 'compras'));
t('#/COMPRAS (maiúscula)', () => tela('#/COMPRAS', 'compras'));
t('espaços em volta', () => tela('  #/compras  ', 'compras'));
t('com ? depois (filtros são de outra fase)', () => tela('#/compras?x=1&y=2', 'compras'));
t('com o que vier depois da tela', () => tela('#/compras/aba/cotacoes', 'compras', ['aba', 'cotacoes']));
t('resto decodificado', () => tela('#/compras/A1562.2610%2F01', 'compras', ['A1562.2610/01']));
t('painel-tv por endereço', () => tela('#/painel-tv', 'painel_tv'));
t('formacao-precos', () => tela('#/formacao-precos', 'formacao_precos'));
t('comissoes-tecnicos', () => tela('#/comissoes-tecnicos', 'comissoes_tecnicos'));

// ── vazio e desconhecido ──
['', '#', '#/', '#//', '   ', null, undefined, '#?x=1'].forEach(h => t(`vazio: ${JSON.stringify(h)}`, () => assert.deepEqual(lerEndereco(h, IDS), { tipo: 'vazio' })));
t('desconhecido: #/xyz', () => assert.deepEqual(lerEndereco('#/xyz', IDS), { tipo: 'desconhecido', texto: 'xyz' }));
t('#/op sem número continua desconhecido (a palavra é reservada, mas não há OP para abrir)', () => assert.equal(lerEndereco('#/op', IDS).tipo, 'desconhecido'));
t('#/op/ (barra, sem número) continua desconhecido', () => assert.equal(lerEndereco('#/op/', IDS).tipo, 'desconhecido'));
t('#/op/%20 (só espaço no lugar do número) continua desconhecido', () => assert.equal(lerEndereco('#/op/%20', IDS).tipo, 'desconhecido'));
t('desconhecido: nome de tela com sublinhado não vale (o nome público usa hífen)', () => assert.equal(lerEndereco('#/painel_tv', IDS).tipo, 'desconhecido'));
t('% solto não derruba', () => assert.doesNotThrow(() => lerEndereco('#/100%', IDS)));
t('% solto no resto não derruba', () => assert.doesNotThrow(() => lerEndereco('#/compras/%E0%A4%A', IDS)));
t('% solto no resto mantém a tela', () => assert.equal(lerEndereco('#/compras/%E0%A4%A', IDS).tela, 'compras'));
t('idDaTela vazio', () => assert.equal(idDaTela('', IDS), null));
t('idDaTela com ids vazios', () => assert.equal(idDaTela('compras', []), null));

// ── montar com resto ──
t('montar com resto codifica a barra', () => assert.equal(montarEndereco('compras', ['A1562.2610/01']), '#/compras/A1562.2610%2F01'));
t('montar e ler com resto (ida e volta)', () => tela(montarEndereco('compras', ['a b', 'c/d', 'ç']), 'compras', ['a b', 'c/d', 'ç']));

// ── a decisão ──
const ctxDe = (podem, conferido, inicial = 'inicio') => ({ ids: IDS, podeVer: id => podem === 'todas' || podem.includes(id), telaInicial: () => inicial, acessoConferido: conferido });
t('vazio abre a tela inicial e manda corrigir a barra', () => assert.deepEqual(decidirEndereco('', ctxDe('todas', false)), { tipo: 'abrir', tela: 'inicio', corrigirEndereco: true }));
t('vazio abre a tela inicial DA PESSOA (não a do menu)', () => assert.deepEqual(decidirEndereco('#', ctxDe('todas', false, 'pcp')), { tipo: 'abrir', tela: 'pcp', corrigirEndereco: true }));
t('tela liberada abre na hora, mesmo sem a releitura do banco', () => assert.deepEqual(decidirEndereco('#/compras', ctxDe(['compras'], false)), { tipo: 'abrir', tela: 'compras', corrigirEndereco: false }));
t('tela NÃO liberada e sem releitura: conferindo (não recusa à toa)', () => assert.deepEqual(decidirEndereco('#/compras', ctxDe(['pcp'], false)), { tipo: 'conferindo', tela: 'compras' }));
t('tela NÃO liberada com a releitura feita: sem acesso', () => assert.deepEqual(decidirEndereco('#/compras', ctxDe(['pcp'], true)), { tipo: 'semAcesso', tela: 'compras' }));
t('endereço desconhecido', () => assert.deepEqual(decidirEndereco('#/xyz', ctxDe('todas', true)), { tipo: 'desconhecido', texto: 'xyz' }));
t('desconhecido vem antes da permissão (não finge "sem acesso")', () => assert.equal(decidirEndereco('#/xyz', ctxDe([], false)).tipo, 'desconhecido'));
t('a mesma tela liberada depois da releitura abre', () => {
  const antes = decidirEndereco('#/admin', ctxDe(['inicio'], false));
  const depois = decidirEndereco('#/admin', ctxDe(['inicio', 'admin'], true));
  assert.equal(antes.tipo, 'conferindo'); assert.equal(depois.tipo, 'abrir');
});
t('liberada pelas permissões velhas e retirada pela releitura: depois vira sem acesso', () => {
  const antes = decidirEndereco('#/rh', ctxDe(['rh'], false));
  const depois = decidirEndereco('#/rh', ctxDe([], true));
  assert.equal(antes.tipo, 'abrir'); assert.equal(depois.tipo, 'semAcesso');
});

// ── Fase 2: o endereço da OP (registro sem tela dona) ──
const op = (hash, chave) => assert.deepEqual(lerEndereco(hash, IDS), { tipo: 'registro', registro: 'op', chave });
t('#/op/A1562.2610 é a OP A1562.2610', () => op('#/op/A1562.2610', 'A1562.2610'));
t('unidade de lote com a barra codificada (o link que o sistema monta)', () => op('#/op/A1562.2610%2F01', 'A1562.2610/01'));
t('unidade de lote com a barra SEM codificar (quem digita)', () => op('#/op/A1562.2610/01', 'A1562.2610/01'));
t('número antigo com espaço codificado', () => op('#/op/A%201435.2607', 'A 1435.2607'));
t('número antigo sem letra: 1274/01', () => op('#/op/1274%2F01', '1274/01'));
t('a palavra op em maiúscula (#/OP/…) vale; o número mantém a grafia', () => op('#/OP/a1750.2611', 'a1750.2611'));
t('sem a barra depois do # (#op/…)', () => op('#op/A1750.2611', 'A1750.2611'));
t('o que vier depois de ? é ignorado', () => op('#/op/A1750.2611?x=1', 'A1750.2611'));
t('o código interno (uuid) também é uma chave', () => op('#/op/0b9f0c3e-2d4a-4a57-9f3e-3a6c6f5a1b11', '0b9f0c3e-2d4a-4a57-9f3e-3a6c6f5a1b11'));
t('% solto no número não derruba', () => assert.doesNotThrow(() => lerEndereco('#/op/A1%', IDS)));
t('montar o endereço da OP codifica a barra', () => assert.equal(montarEnderecoDaOp('A1562.2610/01'), '#/op/A1562.2610%2F01'));
t('montar o endereço da OP codifica o espaço', () => assert.equal(montarEnderecoDaOp('A 1435.2607'), '#/op/A%201435.2607'));
t('montar apara os espaços das pontas', () => assert.equal(montarEnderecoDaOp('  A1750.2611 '), '#/op/A1750.2611'));
t('montarEnderecoDeRegistro("op", …) é o mesmo que montarEnderecoDaOp', () => assert.equal(montarEnderecoDeRegistro('op', 'A1750.2611/02'), montarEnderecoDaOp('A1750.2611/02')));
['A1562.2610', 'A1562.2610/01', 'A 1435.2607', '1274/01', 'D0799.2610/01', 'ç?#&=+%', 'a/b/c'].forEach(n =>
  t(`ida e volta do número ${JSON.stringify(n)}`, () => assert.equal(registroDoEndereco(montarEnderecoDaOp(n)).chave, n)));
t('registroDoEndereco de uma tela é nulo', () => assert.equal(registroDoEndereco('#/compras'), null));
t('registroDoEndereco do vazio é nulo', () => assert.equal(registroDoEndereco(''), null));
t('registroDoEndereco de #/op sem número é nulo', () => assert.equal(registroDoEndereco('#/op'), null));
t('registroDoEndereco não depende da lista de telas', () => assert.deepEqual(registroDoEndereco('#/op/X1'), { registro: 'op', chave: 'X1' }));
t('ehCodigoInterno reconhece o uuid (maiúscula também)', () => assert.equal(ehCodigoInterno('0B9F0C3E-2D4A-4A57-9F3E-3A6C6F5A1B11'), true));
t('ehCodigoInterno não confunde número de OP com uuid', () => ['A1750.2611', '1274/01', '', null, undefined, '0b9f0c3e-2d4a'].forEach(x => assert.equal(ehCodigoInterno(x), false, String(x))));
t('normalizarChave: maiúscula e espaços das pontas', () => assert.equal(normalizarChave('  A1750.2611 '), 'a1750.2611'));
t('normalizarChave guarda o espaço de dentro', () => assert.equal(normalizarChave('A 1435.2607'), 'a 1435.2607'));
t('normalizarChave tira o acento (a mesma conta da coluna opl_norm do banco)', () => assert.equal(normalizarChave('A 1396.2606 - CBV ITAIÓPOLIS'), 'a 1396.2606 - cbv itaiopolis'));
t('normalizarChave: o ç, o ã e o ô também', () => assert.equal(normalizarChave('Ação São João Ônibus'), 'acao sao joao onibus'));
t('mesmaChave ignora maiúscula e espaços das pontas', () => assert.equal(mesmaChave('A1750.2611', ' a1750.2611'), true));
t('mesmaChave: números diferentes', () => assert.equal(mesmaChave('A1750.2611', 'A1750.2612'), false));
t('mesmaChave: a unidade do lote não é a base', () => assert.equal(mesmaChave('A1750.2611', 'A1750.2611/01'), false));
t('mesmaChave: vazio nunca é igual a nada', () => { assert.equal(mesmaChave('', ''), false); assert.equal(mesmaChave(null, undefined), false); });
t('mesmaChave: o link sem acento e em minúscula é a mesma OP de número antigo com acento', () => assert.equal(mesmaChave('A 1396.2606 - CBV ITAIÓPOLIS', 'a 1396.2606 - cbv itaiopolis'), true));
t('mesmaChave: o acento não junta números que diferem de verdade', () => assert.equal(mesmaChave('A 1396.2606 - CBV ITAIÓPOLIS', 'a 1396.2607 - cbv itaiopolis'), false));
t('OP no endereço: decisão "registro", mesmo sem permissão e sem a releitura do banco', () => assert.deepEqual(decidirEndereco('#/op/A1750.2611', ctxDe([], false)), { tipo: 'registro', registro: 'op', chave: 'A1750.2611' }));
t('OP no endereço com a releitura feita: continua "registro" (quem decide o acesso à OP é o banco)', () => assert.equal(decidirEndereco('#/op/A1750.2611', ctxDe([], true)).tipo, 'registro'));
t('OP no endereço NÃO pede para corrigir a barra nem escolhe tela', () => { const d = decidirEndereco('#/op/A1750.2611/03', ctxDe('todas', true)); assert.deepEqual(d, { tipo: 'registro', registro: 'op', chave: 'A1750.2611/03' }); });
t('#/op sem número na decisão: desconhecido', () => assert.equal(decidirEndereco('#/op', ctxDe('todas', true)).tipo, 'desconhecido'));
t('uma tela de menu nunca se confunde com a OP', () => IDS.forEach(id => assert.equal(registroDoEndereco(montarEndereco(id)), null, id)));

// ── Fase 3 (26/11/2026): os registros que moram numa tela (licitação, card do CRM, pedido de compra e OS) ──
const U1 = '0b9f0c3e-2d4a-4a57-9f3e-3a6c6f5a1b11';
const U2 = 'A1B2C3D4-0000-4000-8000-00000000AAAA';
const comRegistro = (hash, tela, tipo, chave) => assert.deepEqual(lerEndereco(hash, IDS), { tipo: 'tela', tela, resto: [tipo, chave], registro: { tipo, chave } });
const semRegistro = (hash, tela, resto) => assert.deepEqual(lerEndereco(hash, IDS), { tipo: 'tela', tela, resto });
const REGISTROS_DE_TELA = [['licitacoes', 'licitacao'], ['crm', 'card'], ['compras', 'pedido'], ['sac', 'os'], ['terceiros', 'servico']];   // o serviço de terceiro entrou na Fase 5
t('a tabela dos registros conhece exatamente as cinco telas, cada uma com a sua palavra', () => assert.deepEqual(REGISTROS_DAS_TELAS, { licitacoes: ['licitacao'], crm: ['card'], compras: ['pedido'], sac: ['os'], terceiros: ['servico'] }));
t('toda tela da tabela dos registros existe no menu', () => Object.keys(REGISTROS_DAS_TELAS).forEach(id => assert.ok(IDS.includes(id), id)));
t('as palavras dos registros não são palavras reservadas nem nomes de tela', () => Object.values(REGISTROS_DAS_TELAS).flat().forEach(p => { assert.ok(!PALAVRAS_RESERVADAS.includes(p), p); assert.equal(idDaTela(p, IDS), null, p); }));
REGISTROS_DE_TELA.forEach(([tela, tipo]) => {
  t(`#/${nomeNoEndereco(tela)}/${tipo}/<código> é o ${tipo} da tela ${tela}`, () => comRegistro(`#/${nomeNoEndereco(tela)}/${tipo}/${U1}`, tela, tipo, U1));
  t(`${tela}: ida e volta pelo montarEnderecoDoRegistroDaTela`, () => { const h = montarEnderecoDoRegistroDaTela(tela, tipo, U1); assert.equal(h, `#/${nomeNoEndereco(tela)}/${tipo}/${U1}`); comRegistro(h, tela, tipo, U1); });
  t(`${tela}: registroDaTelaNoEndereco acha o registro e devolve tela, tipo e código`, () => assert.deepEqual(registroDaTelaNoEndereco(`#/${nomeNoEndereco(tela)}/${tipo}/${U1}`, tela), { tela, tipo, chave: U1 }));
  t(`${tela}: sem o código (#/${nomeNoEndereco(tela)}/${tipo}) não é registro`, () => { semRegistro(`#/${nomeNoEndereco(tela)}/${tipo}`, tela, [tipo]); assert.equal(registroDaTelaNoEndereco(`#/${nomeNoEndereco(tela)}/${tipo}`, tela), null); });
  t(`${tela}: barra no fim e sem código (#/${nomeNoEndereco(tela)}/${tipo}/) não é registro`, () => semRegistro(`#/${nomeNoEndereco(tela)}/${tipo}/`, tela, [tipo]));
  t(`${tela}: o código em branco (%20) não é registro`, () => assert.equal(registroDaTelaNoEndereco(`#/${nomeNoEndereco(tela)}/${tipo}/%20`, tela), null));
  t(`${tela}: maiúscula na tela e na palavra vale (o tipo sai em minúscula); o código mantém a grafia`, () => assert.deepEqual(lerEndereco(`#/${nomeNoEndereco(tela).toUpperCase()}/${tipo.toUpperCase()}/${U2}`, IDS),
    { tipo: 'tela', tela, resto: [tipo.toUpperCase(), U2], registro: { tipo, chave: U2 } }));
  t(`${tela}: sem a barra depois do # e com ? depois`, () => comRegistro(`#${nomeNoEndereco(tela)}/${tipo}/${U1}?x=1`, tela, tipo, U1));
  t(`${tela}: o registro de OUTRA tela não vale nesta`, () => REGISTROS_DE_TELA.filter(([, outro]) => outro !== tipo).forEach(([, outro]) => semRegistro(`#/${nomeNoEndereco(tela)}/${outro}/${U1}`, tela, [outro, U1])));
  t(`${tela}: a tela do registro de outra tela não o enxerga`, () => REGISTROS_DE_TELA.filter(([outraTela]) => outraTela !== tela).forEach(([outraTela]) => assert.equal(registroDaTelaNoEndereco(`#/${nomeNoEndereco(tela)}/${tipo}/${U1}`, outraTela), null, outraTela)));
  t(`${tela}: a decisão do endereço do registro é a da TELA (abre com a permissão; sem ela, conferindo e depois sem acesso)`, () => {
    const h = `#/${nomeNoEndereco(tela)}/${tipo}/${U1}`;
    assert.deepEqual(decidirEndereco(h, ctxDe([tela], false)), { tipo: 'abrir', tela, corrigirEndereco: false });
    assert.deepEqual(decidirEndereco(h, ctxDe(['pcp'], false)), { tipo: 'conferindo', tela });
    assert.deepEqual(decidirEndereco(h, ctxDe(['pcp'], true)), { tipo: 'semAcesso', tela });
  });
  t(`${tela}: o endereço do registro não é uma OP (registroDoEndereco)`, () => assert.equal(registroDoEndereco(`#/${nomeNoEndereco(tela)}/${tipo}/${U1}`), null));
});
t('código com barra e símbolo: a ida e volta guarda tudo (a barra vira %2F)', () => { const h = montarEnderecoDoRegistroDaTela('crm', 'card', 'a/b c?#'); assert.equal(h, '#/crm/card/a%2Fb%20c%3F%23'); assert.equal(registroDaTelaNoEndereco(h, 'crm').chave, 'a/b c?#'); });
t('código com a barra SEM codificar (quem digita): o que vier depois da palavra é o código', () => assert.equal(registroDaTelaNoEndereco('#/crm/card/a/b', 'crm').chave, 'a/b'));
t('montarEnderecoDoRegistroDaTela apara os espaços das pontas do código', () => assert.equal(montarEnderecoDoRegistroDaTela('sac', 'os', `  ${U1} `), `#/sac/os/${U1}`));
t('% solto no código não derruba', () => { assert.doesNotThrow(() => lerEndereco('#/crm/card/%E0%A4%A', IDS)); assert.doesNotThrow(() => registroDaTelaNoEndereco('#/crm/card/%E0%A4%A', 'crm')); });
t('palavra de registro numa tela que não tem registros não vale (#/inicio/card/…)', () => IDS.filter(id => !REGISTROS_DAS_TELAS[id]).forEach(id => semRegistro(montarEndereco(id, ['card', U1]), id, ['card', U1])));
t('registroDaTelaNoEndereco: endereço vazio, de outra tela, de OP e desconhecido são nulos', () => ['', '#', '#/crm', '#/op/A1750.2611', '#/xyz/card/' + U1, null, undefined].forEach(h => assert.equal(registroDaTelaNoEndereco(h, 'crm'), null, String(h))));
t('registroDaTelaNoEndereco não depende da lista de telas (a tela é quem pergunta)', () => assert.deepEqual(registroDaTelaNoEndereco('#/crm/card/X1', 'crm'), { tela: 'crm', tipo: 'card', chave: 'X1' }));
t('a palavra de um registro não é tratada como aba nem como OP', () => assert.equal(lerEndereco(`#/crm/card/${U1}`, IDS).tela, 'crm'));
t('a Fase 2 não mudou: a OP continua sendo "registro" e sem tela dona', () => assert.deepEqual(lerEndereco('#/op/A1750.2611', IDS), { tipo: 'registro', registro: 'op', chave: 'A1750.2611' }));
t('uma tela sem registro no endereço continua com `resto` vazio e sem a chave `registro`', () => IDS.forEach(id => assert.deepEqual(lerEndereco(montarEndereco(id), IDS), { tipo: 'tela', tela: id, resto: [] })));

// o recado interno ("abra este registro") que as Menções, o chat, os avisos e os vínculos gravam
const recado = (contexto, contextoId) => ({ contexto, contextoId });
const ALVOS = [['crm', 'crm', 'card'], ['licitacao', 'licitacoes', 'licitacao'], ['compra', 'compras', 'pedido'], ['compra_aprovacao', 'compras', 'pedido'], ['sac', 'sac', 'os'], ['sac_revisao_orcamento', 'sac', 'os'], ['terceiro_servico', 'terceiros', 'servico']];
ALVOS.forEach(([contexto, tela, tipo]) => {
  t(`recado "${contexto}" para a tela ${tela}: vira o registro ${tipo}`, () => {
    const r = registroDoRecado(recado(contexto, U1), tela);
    assert.equal(r.tela, tela); assert.equal(r.tipo, tipo); assert.equal(r.chave, U1);
    assert.equal(r.dica, contexto.startsWith('sac') ? 'acompanhamento' : undefined);   // só a OS do SAC abre o Acompanhamento
  });
  t(`recado "${contexto}" para OUTRA tela não vale`, () => IDS.filter(id => id !== tela).forEach(id => assert.equal(registroDoRecado(recado(contexto, U1), id), null, id)));
  t(`recado "${contexto}" com um código que não é código (número, texto) não vira endereço`, () => ['123', 'A1750.2611', '', null, undefined, 12].forEach(x => assert.equal(registroDoRecado(recado(contexto, x), tela), null, String(x))));
});
t('recado de contexto que a Fase 3 não conhece (garantia, op, viagem) não vira endereço de registro de tela', () => ['garantia', 'op', 'viagem', 'demanda_avulsa', 'formacao'].forEach(c => assert.equal(registroDoRecado(recado(c, U1), 'sac'), null, c)));
t('recado com contexto que é nome de propriedade do objeto (toString, constructor, __proto__) não derruba nem vale', () => ['toString', 'constructor', '__proto__', 'hasOwnProperty'].forEach(c => assert.equal(registroDoRecado(recado(c, U1), 'crm'), null, c)));
t('recado vazio, texto ou número não derrubam', () => [null, undefined, '', 'crm', 7, [], {}].forEach(x => assert.equal(registroDoRecado(x, 'crm'), null, JSON.stringify(x))));
t('o recado do card do CRM não carrega dica (a Menção de CRM usa o caminho das Análises)', () => assert.equal('dica' in registroDoRecado(recado('crm', U1), 'crm'), false));
t('o recado com o código em maiúscula e espaço nas pontas vale', () => assert.equal(registroDoRecado(recado('crm', `  ${U2} `), 'crm').chave, U2));

// ── Fase 4 (26/11/2026): as abas de dentro de cada tela ──
const { ABAS_DAS_TELAS, nomeDaAba, abasDoNivel, abaDoNome, abaNoEndereco, montarEnderecoDaAba, enderecoEhDaTela, conferirQuadroDeAbas } = R;
const NOME_DAS_TELAS_COM_ABAS = Object.keys(ABAS_DAS_TELAS);
console.log(`telas com abas no endereço: ${NOME_DAS_TELAS_COM_ABAS.length} (${NOME_DAS_TELAS_COM_ABAS.join(', ')})`);

t('nomeDaAba: minúscula, sem acento e com hífen', () => {
  assert.equal(nomeDaAba('horas_extras'), 'horas-extras');
  assert.equal(nomeDaAba('Relatórios'), 'relatorios');
  assert.equal(nomeDaAba('  Vendas  '), 'vendas');
  assert.equal(nomeDaAba('a  b__c'), 'a-b-c');
  assert.equal(nomeDaAba('--x--'), 'x');
  assert.equal(nomeDaAba(''), '');
  assert.equal(nomeDaAba(null), '');
});
t('o quadro de abas real passa na conferência (e a conferência geral continua limpa)', () => { assert.deepEqual(conferirQuadroDeAbas(IDS), []); assert.deepEqual(conferirQuadroDeNomes(IDS), []); });
t('a conferência do quadro pega: tela que não existe', () => assert.ok(conferirQuadroDeAbas(IDS, { xyz: { padrao: 'a', abas: ['a'] } }).some(p => p.includes('não é uma tela do menu'))));
t('a conferência do quadro pega: lista de abas vazia', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'a', abas: [] } }).some(p => p.includes('nenhuma aba'))));
t('a conferência do quadro pega: aba padrão fora da lista', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'z', abas: ['a', 'b'] } }).some(p => p.includes('aba padrão'))));
t('a conferência do quadro pega: dois ids com o mesmo nome no endereço (a_b e a-b)', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'a_b', abas: ['a_b', 'a-b'] } }).some(p => p.includes('mesmo nome'))));
t('a conferência do quadro pega: id que fica sem nome no endereço', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'a', abas: ['a', '--'] } }).some(p => p.includes('sem nome'))));
t('a conferência do quadro pega: abas de dentro de uma aba que não existe', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'a', abas: ['a'], filhas: { z: { padrao: 'x', abas: ['x'] } } } }).some(p => p.includes('não é uma aba dela'))));
t('a conferência do quadro pega: aba de dentro com a padrão fora da lista', () => assert.ok(conferirQuadroDeAbas(IDS, { compras: { padrao: 'a', abas: ['a'], filhas: { a: { padrao: 'z', abas: ['x'] } } } }).some(p => p.includes('aba padrão'))));
t('a conferência do quadro pega: aba com nome de registro da tela E abas de dentro (ambíguo)', () => assert.ok(conferirQuadroDeAbas(IDS, { sac: { padrao: 'os', abas: ['os', 'x'], filhas: { os: { padrao: 'a', abas: ['a', 'b'] } } } }, { sac: ['os'] }).some(p => p.includes('ambíguo'))));
t('a conferência do quadro NÃO reclama de aba com nome de registro quando ela não tem abas de dentro (SAC: aba "os" e registro "os")', () => assert.deepEqual(conferirQuadroDeAbas(IDS, { sac: { padrao: 'os', abas: ['os', 'x'] } }, { sac: ['os'] }), []));

// o quadro real, tabela por tabela: cada aba de cada tela
NOME_DAS_TELAS_COM_ABAS.forEach(telaId => {
  const q = ABAS_DAS_TELAS[telaId];
  const nome = nomeNoEndereco(telaId);
  t(`${telaId}: a padrão (${q.padrao}) é o endereço da tela, sem aba`, () => {
    assert.equal(montarEnderecoDaAba(telaId, [q.padrao]), `#/${nome}`);
    assert.deepEqual(abaNoEndereco(`#/${nome}`, telaId), { tipo: 'aba', aba: null, invalida: false });
  });
  q.abas.forEach(aba => {
    t(`${telaId}/${aba}: ida e volta do endereço da aba`, () => {
      const h = montarEnderecoDaAba(telaId, [aba]);
      assert.equal(h, aba === q.padrao ? `#/${nome}` : `#/${nome}/${nomeDaAba(aba)}`);
      const lido = abaNoEndereco(h, telaId);
      assert.deepEqual(lido, { tipo: 'aba', aba: aba === q.padrao ? null : aba, invalida: false });
    });
    t(`${telaId}/${aba}: o endereço com o nome da aba escrito por extenso (também a padrão) é lido; maiúscula e acento não atrapalham`, () => {
      assert.deepEqual(abaNoEndereco(`#/${nome}/${nomeDaAba(aba)}`, telaId), { tipo: 'aba', aba, invalida: false });
      assert.deepEqual(abaNoEndereco(`#/${nome.toUpperCase()}/${nomeDaAba(aba).toUpperCase()}`, telaId), { tipo: 'aba', aba, invalida: false });
      assert.equal(abaDoNome(telaId, 0, null, nomeDaAba(aba)), aba);
    });
    t(`${telaId}/${aba}: a decisão do endereço da aba é a da TELA (abre com a permissão; sem ela, conferindo e depois sem acesso)`, () => {
      const h = `#/${nome}/${nomeDaAba(aba)}`;
      assert.deepEqual(decidirEndereco(h, ctxDe([telaId], false)), { tipo: 'abrir', tela: telaId, corrigirEndereco: false });
      assert.deepEqual(decidirEndereco(h, ctxDe(['pcp'], false)), { tipo: 'conferindo', tela: telaId });
      assert.deepEqual(decidirEndereco(h, ctxDe(['pcp'], true)), { tipo: 'semAcesso', tela: telaId });
    });
    t(`${telaId}/${aba}: o endereço da aba não é registro nem OP`, () => {
      const h = `#/${nome}/${nomeDaAba(aba)}`;
      assert.equal(lerEndereco(h, IDS).registro, undefined);
      assert.equal(registroDaTelaNoEndereco(h, telaId), null);
      assert.equal(registroDoEndereco(h), null);
    });
  });
  t(`${telaId}: aba que a tela não tem é "inválida", sem aba`, () => assert.deepEqual(abaNoEndereco(`#/${nome}/aba-que-nao-existe`, telaId), { tipo: 'aba', aba: null, invalida: true }));
  t(`${telaId}: o endereço de outra tela, de uma OP, vazio ou desconhecido não é desta tela (fora)`, () => {
    const outra = IDS.find(id => id !== telaId);
    ['', '#', '#/op/A1750.2611', montarEndereco(outra), '#/xyz', null, undefined].forEach(h => assert.deepEqual(abaNoEndereco(h, telaId), { tipo: 'fora' }, String(h)));
  });
  t(`${telaId}: a janela de um registro da própria tela (se ela tem) não diz aba (fora)`, () => (REGISTROS_DAS_TELAS[telaId] || []).forEach(tipo => assert.deepEqual(abaNoEndereco(montarEnderecoDoRegistroDaTela(telaId, tipo, U1), telaId), { tipo: 'fora' }, tipo)));
  t(`${telaId}: enderecoEhDaTela vale para a tela, as abas dela e os registros dela, e para mais nada`, () => {
    assert.equal(enderecoEhDaTela(`#/${nome}`, telaId), true);
    q.abas.forEach(aba => assert.equal(enderecoEhDaTela(`#/${nome}/${nomeDaAba(aba)}`, telaId), true, aba));
    (REGISTROS_DAS_TELAS[telaId] || []).forEach(tipo => assert.equal(enderecoEhDaTela(montarEnderecoDoRegistroDaTela(telaId, tipo, U1), telaId), true, tipo));
    assert.equal(enderecoEhDaTela('#/op/A1750.2611', telaId), false);
    assert.equal(enderecoEhDaTela(montarEndereco(IDS.find(id => id !== telaId)), telaId), false);
    assert.equal(enderecoEhDaTela('', telaId), false);
  });
  t(`${telaId}: os nomes das abas não colidem com os registros da tela (só a aba SEM abas de dentro pode ter o nome de um registro)`, () => {
    (REGISTROS_DAS_TELAS[telaId] || []).forEach(tipo => { if (q.filhas && q.filhas[tipo]) assert.fail(`a aba ${tipo} tem abas de dentro e o nome de um registro`); });
  });
});
t('tela sem quadro de abas: nada de aba (fora) e o endereço montado é o da tela', () => { assert.deepEqual(abaNoEndereco('#/inicio/x', 'inicio'), { tipo: 'fora' }); assert.equal(montarEnderecoDaAba('inicio', ['x']), '#/inicio'); assert.equal(abasDoNivel('inicio', 0), null); });
t('enderecoEhDaTela não precisa de quadro: vale para qualquer tela do menu', () => IDS.forEach(id => { assert.equal(enderecoEhDaTela(montarEndereco(id), id), true, id); assert.equal(enderecoEhDaTela(montarEndereco(id), IDS.find(x => x !== id)), false, id); }));

// duas camadas (a aba de dentro de uma aba): provado com uma tela de mentira, para a regra não depender do que o quadro real tiver
ABAS_DAS_TELAS.tela_teste = { padrao: 'a', abas: ['a', 'b', 'horas_extras'], filhas: { a: { padrao: 'x', abas: ['x', 'y'] }, b: { padrao: 'p', abas: ['p', 'q'] } } };
const T = 'tela_teste';
const aba0 = h => abaNoEndereco(h, T, 0);
const aba1 = (h, pai) => abaNoEndereco(h, T, 1, pai);
t('duas camadas: o endereço montado de cada combinação', () => {
  const caso = (caminho, esperado) => assert.equal(montarEnderecoDaAba(T, caminho), esperado, JSON.stringify(caminho));
  caso(['a'], '#/tela-teste');                    // as duas padrão: some tudo
  caso(['a', 'x'], '#/tela-teste');
  caso(['a', 'y'], '#/tela-teste/a/y');            // a aba de fora fica no endereço, mesmo sendo a padrão, porque há aba de dentro a dizer
  caso(['b'], '#/tela-teste/b');
  caso(['b', 'p'], '#/tela-teste/b');              // a de dentro padrão some
  caso(['b', 'q'], '#/tela-teste/b/q');
  caso(['horas_extras'], '#/tela-teste/horas-extras');
  caso(['horas_extras', 'z'], '#/tela-teste/horas-extras');   // aba sem abas de dentro: o que vier a mais é ignorado
  caso([], '#/tela-teste');
});
t('duas camadas: o nível 0 lê só a aba de fora, o nível 1 lê a de dentro (e só se o pai bate)', () => {
  assert.deepEqual(aba0('#/tela-teste/a/y'), { tipo: 'aba', aba: 'a', invalida: false });
  assert.deepEqual(aba1('#/tela-teste/a/y', 'a'), { tipo: 'aba', aba: 'y', invalida: false });
  assert.deepEqual(aba1('#/tela-teste/b/q', 'b'), { tipo: 'aba', aba: 'q', invalida: false });
  assert.deepEqual(aba1('#/tela-teste/b/q', 'a'), { tipo: 'fora' });          // a aba de fora do endereço é outra: o grupo de dentro de "a" não existe agora
  assert.deepEqual(aba1('#/tela-teste/a/y', 'b'), { tipo: 'fora' });
});
t('duas camadas: sem aba de fora no endereço, o grupo de dentro da aba padrão vale (e o das outras não)', () => {
  assert.deepEqual(aba1('#/tela-teste', 'a'), { tipo: 'aba', aba: null, invalida: false });
  assert.deepEqual(aba1('#/tela-teste', 'b'), { tipo: 'fora' });
});
t('duas camadas: a aba de fora sem a de dentro diz "nenhuma" à de dentro', () => { assert.deepEqual(aba1('#/tela-teste/b', 'b'), { tipo: 'aba', aba: null, invalida: false }); assert.deepEqual(aba1('#/tela-teste/a', 'a'), { tipo: 'aba', aba: null, invalida: false }); });
t('duas camadas: aba de dentro que não existe é "inválida"', () => assert.deepEqual(aba1('#/tela-teste/a/zzz', 'a'), { tipo: 'aba', aba: null, invalida: true }));
t('duas camadas: o nome só de dentro (#/tela-teste/y, sem a de fora) não vale para a de dentro: seria ambíguo', () => { assert.deepEqual(aba1('#/tela-teste/y', 'a'), { tipo: 'fora' }); assert.deepEqual(aba0('#/tela-teste/y'), { tipo: 'aba', aba: null, invalida: true }); });
t('duas camadas: nível 1 sem pai ou com pai que não tem abas de dentro é "fora"', () => { assert.deepEqual(abaNoEndereco('#/tela-teste/a/y', T, 1), { tipo: 'fora' }); assert.deepEqual(abaNoEndereco('#/tela-teste/horas-extras/x', T, 1, 'horas_extras'), { tipo: 'fora' }); });
t('duas camadas: ida e volta de todas as combinações', () => {
  for (const [fora, q] of Object.entries(ABAS_DAS_TELAS[T].filhas)) {
    for (const dentro of q.abas) {
      const h = montarEnderecoDaAba(T, [fora, dentro]);
      assert.deepEqual(aba0(h), { tipo: 'aba', aba: fora === 'a' ? (dentro === 'x' ? null : 'a') : (fora), invalida: false }, h);
      const lido = aba1(h, fora);
      assert.equal(lido.tipo, 'aba', h);
      assert.equal(lido.aba ?? q.padrao, dentro, h);
    }
  }
});
t('duas camadas: a conferência do quadro de mentira passa', () => assert.deepEqual(conferirQuadroDeAbas([...IDS, T]), []));
delete ABAS_DAS_TELAS.tela_teste;

// ── Fase 5 (26/11/2026): a viagem (registro sem tela dona, como a OP) e o serviço de terceiro (registro de tela, nas conferências acima) ──
const viagem = (hash, chave) => assert.deepEqual(lerEndereco(hash, IDS), { tipo: 'registro', registro: 'viagem', chave });
t('#/viagem/<código> é a viagem', () => viagem('#/viagem/' + U1, U1));
t('a palavra viagem em maiúscula vale; o código mantém a grafia', () => viagem('#/VIAGEM/' + U2, U2));
t('sem a barra depois do # e com ? depois', () => viagem('#viagem/' + U1 + '?x=1', U1));
t('montarEnderecoDaViagem monta #/viagem/<código> e apara os espaços', () => assert.equal(R.montarEnderecoDaViagem('  ' + U1 + ' '), '#/viagem/' + U1));
t('montarEnderecoDeRegistro("viagem", …) é o mesmo que montarEnderecoDaViagem', () => assert.equal(montarEnderecoDeRegistro('viagem', U1), R.montarEnderecoDaViagem(U1)));
t('registroDoEndereco acha a viagem e diz que é de viagem, não de OP', () => assert.deepEqual(registroDoEndereco('#/viagem/' + U1), { registro: 'viagem', chave: U1 }));
t('#/viagem sem código não é registro (decisão: desconhecido)', () => { assert.equal(registroDoEndereco('#/viagem'), null); assert.equal(registroDoEndereco('#/viagem/'), null); assert.equal(decidirEndereco('#/viagem', ctxDe('todas', true)).tipo, 'desconhecido'); });
t('a decisão do endereço da viagem é "registro", mesmo sem permissão e sem a releitura (quem decide é o banco)', () => { assert.deepEqual(decidirEndereco('#/viagem/' + U1, ctxDe([], false)), { tipo: 'registro', registro: 'viagem', chave: U1 }); assert.equal(decidirEndereco('#/viagem/' + U1, ctxDe([], true)).tipo, 'registro'); });
t('a tela Viagens (#/viagens) não se confunde com a viagem (#/viagem/…)', () => { assert.equal(registroDoEndereco('#/viagens'), null); assert.equal(registroDoEndereco('#/viagens/' + U1), null); assert.equal(lerEndereco('#/viagens', IDS).tela, 'viagens'); });
t('viagem e OP não se confundem: cada uma é lida pela palavra dela', () => { assert.equal(registroDoEndereco('#/op/A1750.2611').registro, 'op'); assert.equal(registroDoEndereco('#/viagem/' + U1).registro, 'viagem'); });
t('o endereço de uma viagem não é de nenhuma tela nem de uma aba (a aba não muda por causa dele)', () => IDS.forEach(id => { assert.equal(R.enderecoEhDaTela('#/viagem/' + U1, id), false, id); assert.equal(R.abaNoEndereco('#/viagem/' + U1, id).tipo, 'fora', id); }));
t('registroDaTelaNoEndereco não enxerga a viagem como registro de tela', () => IDS.forEach(id => assert.equal(registroDaTelaNoEndereco('#/viagem/' + U1, id), null, id)));
t('% solto no código da viagem não derruba', () => assert.doesNotThrow(() => lerEndereco('#/viagem/%E0%A4%A', IDS)));
t('viagem está entre as palavras reservadas e nenhuma tela a usa', () => { assert.ok(PALAVRAS_RESERVADAS.includes('viagem')); IDS.forEach(id => assert.notEqual(nomeNoEndereco(id), 'viagem')); });
t('o serviço de terceiro: #/terceiros/servico/<código> é o registro da tela terceiros', () => comRegistro('#/terceiros/servico/' + U1, 'terceiros', 'servico', U1));
t('o serviço de terceiro: nenhuma aba de terceiros se chama "servico" (o endereço ficaria ambíguo)', () => assert.ok(!R.ABAS_DAS_TELAS.terceiros.abas.some(a => R.nomeDaAba(a) === 'servico')));
t('o serviço de terceiro aberto por cima de uma aba não muda a aba', () => assert.equal(R.abaNoEndereco('#/terceiros/servico/' + U1, 'terceiros').tipo, 'fora'));

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS' : ''}`);
