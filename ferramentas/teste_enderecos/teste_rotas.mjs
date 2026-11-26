// Prova as regras puras do endereço (src/Rotas.ts) sem abrir o sistema.
// As telas vêm do próprio DashboardTab.tsx (o menu de verdade), não de uma lista copiada: se alguém acrescentar uma tela com nome que colide, o teste pega.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../src', import.meta.url));   // a pasta src deste repositório
const R = await import(pathToFileURL(RAIZ + '/Rotas.ts').href);
const { nomeNoEndereco, idDaTela, lerEndereco, montarEndereco, decidirEndereco, conferirQuadroDeNomes, PALAVRAS_RESERVADAS,
  registroDoEndereco, montarEnderecoDaOp, montarEnderecoDeRegistro, ehCodigoInterno, normalizarChave, mesmaChave } = R;

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

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS' : ''}`);
