// Prova as regras puras do endereço (src/Rotas.ts) sem abrir o sistema.
// As telas vêm do próprio DashboardTab.tsx (o menu de verdade), não de uma lista copiada: se alguém acrescentar uma tela com nome que colide, o teste pega.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../src', import.meta.url));   // a pasta src deste repositório
const R = await import(pathToFileURL(RAIZ + '/Rotas.ts').href);
const { nomeNoEndereco, idDaTela, lerEndereco, montarEndereco, decidirEndereco, conferirQuadroDeNomes, PALAVRAS_RESERVADAS } = R;

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
t('desconhecido: #/op/A1562.2610 (OP é da Fase 2; hoje não é tela)', () => assert.equal(lerEndereco('#/op/A1562.2610', IDS).tipo, 'desconhecido'));
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

console.log(`${ok} conferências passaram${process.exitCode ? ', COM FALHAS' : ''}`);
