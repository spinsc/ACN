// Planta, UM DE CADA VEZ, defeitos de propósito nos arquivos do endereço da OP (Fase 2 do plano de endereços) e roda o cenário que deveria pegá-lo.
// É a "prova de que o teste não é de enfeite": um teste que passa com o defeito plantado não protege nada. Em 25/11/2026 foi assim que se achou que o C24
// olhava cedo demais (o hospedeiro ignorando a janela que o módulo já abriu passava, porque a segunda janela só aparece depois da leitura do banco).
//
// Como usar (na pasta ferramentas/teste_enderecos, com o servidor de desenvolvimento DESTA pasta de trabalho de pé na porta 5199, como nos outros testes):
//   $env:NODE_PATH = "<pasta>\node_modules"      # a mesma do teste_enderecos.cjs (puppeteer-core)
//   node plantar_defeitos.cjs                    # todos os defeitos, em série (cerca de 1 minuto cada)
//   node plantar_defeitos.cjs "^(a|b)$"          # só os defeitos cujo id casa com a expressão
// Cada defeito troca UM trecho de um arquivo de src/ (o trecho precisa aparecer exatamente uma vez), espera o servidor de desenvolvimento servir a versão com o defeito,
// roda os cenários indicados e restaura o arquivo byte a byte (try/finally). Se um defeito NÃO FOR PEGO, o teste está fraco: reforce o cenário, não o apague.
//
// SEGURANÇA: o original de cada arquivo é guardado em saida/originais/ antes de plantar e só é apagado depois de restaurado. Se o programa for morto no meio (queda de luz, janela
// fechada), a próxima execução recusa começar e diz para copiar os arquivos de saida/originais de volta para o lugar. NUNCA dê commit com um defeito plantado: confira `git diff`.
// Quando mexer na regra de um desses pontos, rode o defeito correspondente; quando criar um ponto novo, acrescente o defeito dele à lista.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '../..');
const SAIDA = path.join(__dirname, 'saida');
const ORIGINAIS = path.join(SAIDA, 'originais');
const ARGS = process.argv.slice(2);
const SO_CONFERIR = ARGS.includes('--conferir');   // só confere se cada trecho a trocar ainda aparece UMA vez no código; não planta nada e não precisa do servidor
const FILTRO = ARGS.find(a => !a.startsWith('--'));
const URL_BASE = (process.env.BASE || 'http://localhost:5199/ACN/').replace(/\/?$/, '/');

// id, o que o defeito faz (em português de processo), o cenário que deve pegá-lo e a troca. `de` precisa aparecer UMA vez no arquivo.
const DEFEITOS = [
  { id: 'a', nome: 'CSS do cabeçalho da janela da OP no celular removido (o título volta a ficar espremido sob o botão Dossiê)', cenarios: '^C29', trocas: [
    { arquivo: 'src/design.css', de: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-acoes { order: -1; flex: 0 0 100%; justify-content: flex-end; }', para: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-acoes { justify-content: flex-end; }' },
    { arquivo: 'src/design.css', de: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-txt { flex: 1 1 100%; }', para: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-txt { }' },
  ] },
  { id: 'b', nome: 'a janela fechada deixa de tirar o endereço da OP da barra (o X não volta um passo)', cenarios: '^C16', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (c !== null && janelaEhDe(j, c)) tirarEnderecoDaOp();', para: 'if (false && c !== null && janelaEhDe(j, c)) tirarEnderecoDaOp();' },
  ] },
  { id: 'c', nome: 'fechar a OP de um link colado volta um passo do navegador mesmo sem passo anterior (sairia do sistema)', cenarios: '^C18', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (temPassoAnterior()) { voltarUmPasso(); return; }', para: '{ voltarUmPasso(); return; }' },
  ] },
  { id: 'd', nome: 'o hospedeiro ignora que um módulo já abriu a OP (abriria uma segunda janela por cima, depois da leitura do banco)', cenarios: '^C24', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: 'if (janelaDaOpEstaAberta(chave)) { setCarregando(false); return; }', para: 'if (false && janelaDaOpEstaAberta(chave)) { setCarregando(false); return; }' },
  ] },
  { id: 'e', nome: 'a Menção de OP deixa de abrir a janela pelo endereço', cenarios: '^C23', trocas: [
    { arquivo: 'src/MencoesInboxPanel.tsx', de: "if (m.contexto === 'op' && m.contexto_id) { abrirOpPeloEndereco(m.contexto_id); onClose?.(); return; }", para: "if (false && m.contexto === 'op' && m.contexto_id) { abrirOpPeloEndereco(m.contexto_id); onClose?.(); return; }" },
  ] },
  { id: 'f', nome: 'o "Copiar link" copia só a parte do endereço (sem o endereço do sistema)', cenarios: '^C22', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: "return window.location.href.split('#')[0] + montarEnderecoDaOp(chaveDaOp(op));", para: 'return montarEnderecoDaOp(chaveDaOp(op));' },
  ] },
  { id: 'g', nome: 'leitura recusada pelo banco passa a valer como "não achei"', cenarios: '^C27', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "if (r.error) return { op: null, erro: r.error.message || 'sem resposta' };", para: "if (r.error) return { op: null, erro: '' };" },
  ] },
  { id: 'h', nome: 'o número alterado com a janela aberta não chega ao endereço', cenarios: '^C28', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (c !== null && mesmaChave(c, antes)) irParaEndereco(', para: 'if (false && c !== null && mesmaChave(c, antes)) irParaEndereco(' },
  ] },
  { id: 'i', nome: 'a leitura que chega depois de um Voltar ainda abre a janela', cenarios: '^C26', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: 'if (!vivo) return;   // o endereço mudou enquanto lia', para: '// o endereço mudou enquanto lia' },
  ] },
  { id: 'j', nome: 'a janela aberta por um módulo nunca se fecha quando o endereço deixa de ser o dela (Voltar, ou outra OP)', cenarios: '^C(24|30) ', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (devoFechar(j)) { j.fechando = true; j.fechar(); }', para: 'if (false && devoFechar(j)) { j.fechando = true; j.fechar(); }' },
  ] },
  { id: 'k', nome: 'a janela de cima passa a achar que a de baixo é dela (o Voltar não a fecha)', cenarios: '^C30', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'for (let i = Math.max(0, janelas.indexOf(j)); i < janelas.length; i++)', para: 'for (let i = 0; i < janelas.length; i++)' },
  ] },
  { id: 'l', nome: 'a janela de baixo se fecha quando a de cima escreve o endereço dela (o lote perde a primeira OP)', cenarios: '^C30', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'for (let i = Math.max(0, janelas.indexOf(j)); i < janelas.length; i++) if (janelaEhDe(janelas[i], chave)) return false;', para: 'if (janelaEhDe(j, chave)) return false;' },
  ] },
  { id: 'm', nome: 'o link em minúscula ou sem acento deixa de achar a OP (some o plano B pela coluna opl_norm)', cenarios: '^C31', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "if (!r.error && !r.data) r = await supabase.from('oples').select('*').eq('opl_norm'", para: "if (false && !r.error && !r.data) r = await supabase.from('oples').select('*').eq('opl_norm'" },
  ] },
  { id: 'n', nome: 'OP que não existe: o endereço não é limpo (fica #/op/… na barra)', cenarios: '^C19', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "não a encontrei, ou você não tem acesso a ela.`);\r\n      tirarEnderecoDaOp();", para: "não a encontrei, ou você não tem acesso a ela.`);\r\n      // tirarEnderecoDaOp();" },
  ] },
  { id: 'o', nome: 'a chave do endereço deixa de ignorar o acento (o link sem acento não reconhece a janela e o X reabre a OP)', cenarios: '^C31', trocas: [
    { arquivo: 'src/Rotas.ts', de: ".trim().normalize('NFD')", para: ".trim()" },   // a regex seguinte tem os acentos "crus" no arquivo: o trecho não pode depender de como se escreve a barra invertida
  ] },
];

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const ARQUIVOS = [...new Set(DEFEITOS.flatMap(d => d.trocas.map(t => t.arquivo)))];
const resumoDosArquivos = () => Object.fromEntries(ARQUIVOS.map(a => [a, md5(fs.readFileSync(path.join(RAIZ, a)))]));
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const moduloNoServidor = async (arquivo) => {
  try { const r = await fetch(URL_BASE + arquivo + '?t=' + Date.now()); return md5(Buffer.from(await r.arrayBuffer())); } catch (e) { return 'erro:' + e.message; }
};
// espera o servidor de desenvolvimento servir uma versão DIFERENTE da de `referencia` (ou igual, se `igual`): a troca precisa estar no ar de verdade antes do teste
async function esperarServidor(arquivo, referencia, igual) {
  for (let i = 0; i < 40; i++) {
    const m = await moduloNoServidor(arquivo);
    if (igual ? m === referencia : (m !== referencia && !m.startsWith('erro:'))) return true;
    await espera(500);
  }
  return false;
}
const guardarOriginal = (arquivo, conteudo) => { const destino = path.join(ORIGINAIS, arquivo); fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, conteudo); };
const apagarOriginal = (arquivo) => { try { fs.rmSync(path.join(ORIGINAIS, arquivo)); } catch { /* já não estava */ } };

(async () => {
  if (SO_CONFERIR) {
    // roda antes de uma rodada longa (ou depois de mexer no código): um trecho que mudou de lugar ou de texto faz o defeito "não rodar", e isso não é o mesmo que "o teste pegou"
    let ruins = 0;
    for (const d of DEFEITOS) {
      if (FILTRO && !new RegExp(FILTRO).test(d.id)) continue;
      for (const t of d.trocas) {
        const txt = fs.readFileSync(path.join(RAIZ, t.arquivo), 'utf8');
        const n = txt.split(t.de).length - 1;
        if (n !== 1) ruins++;
        console.log(`${n === 1 ? 'ok  ' : 'RUIM'} ${d.id}) ${t.arquivo}: o trecho aparece ${n} vez(es)`);
      }
    }
    console.log(ruins ? `${ruins} trecho(s) para atualizar na lista DEFEITOS` : 'todos os trechos aparecem uma vez só');
    process.exit(ruins ? 1 : 0);
  }
  fs.mkdirSync(SAIDA, { recursive: true });
  if (fs.existsSync(ORIGINAIS) && fs.readdirSync(ORIGINAIS, { recursive: true }).some(f => fs.statSync(path.join(ORIGINAIS, f)).isFile())) {
    console.error('Um plantio anterior NÃO terminou: há arquivos em ' + ORIGINAIS + '. Eles são os originais; copie-os de volta para o lugar (mesmo caminho dentro de src/) e apague a pasta antes de rodar de novo.');
    process.exit(3);
  }
  const antes = resumoDosArquivos();
  const resultado = [];
  for (const d of DEFEITOS) {
    if (FILTRO && !new RegExp(FILTRO).test(d.id)) continue;
    console.log(`\n══ defeito ${d.id}) ${d.nome}\n   cenário: ${d.cenarios}`);
    const originais = new Map();
    const arquivosDoDefeito = [...new Set(d.trocas.map(t => t.arquivo))];
    const noServidorAntes = {};
    for (const a of arquivosDoDefeito) { const b = fs.readFileSync(path.join(RAIZ, a)); originais.set(a, b); guardarOriginal(a, b); noServidorAntes[a] = await moduloNoServidor(a); }
    let falhas = null, resumoLinhas = [], motivoDeNaoRodar = '';
    try {
      for (const a of arquivosDoDefeito) {
        let txt = originais.get(a).toString('utf8');
        for (const t of d.trocas.filter(x => x.arquivo === a)) {
          const n = txt.split(t.de).length - 1;
          if (n !== 1) throw new Error(`o trecho não aparece exatamente 1 vez em ${a} (aparece ${n}): ${t.de.slice(0, 60)}. O código mudou: atualize a lista de defeitos.`);
          txt = txt.replace(t.de, () => t.para);
        }
        fs.writeFileSync(path.join(RAIZ, a), txt, 'utf8');
      }
      for (const a of arquivosDoDefeito) if (!(await esperarServidor(a, noServidorAntes[a], false))) throw new Error('o servidor de desenvolvimento não passou a servir a versão com o defeito (ele está de pé em ' + URL_BASE + '?)');
      const r = spawnSync('node', ['teste_enderecos.cjs', d.cenarios], { cwd: __dirname, env: process.env, encoding: 'utf8', timeout: 8 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
      const saida = (r.stdout || '') + (r.stderr || '');
      fs.writeFileSync(path.join(SAIDA, `defeito_${d.id}.log`), saida);
      const linhas = saida.split(/\r?\n/);
      falhas = linhas.filter(l => /^FALHOU/.test(l));
      resumoLinhas = linhas.filter(l => /de \d+ conferências/.test(l));
    } catch (e) {
      motivoDeNaoRodar = e.message;
      console.log('   NÃO RODOU: ' + e.message);
    } finally {
      for (const a of arquivosDoDefeito) { fs.writeFileSync(path.join(RAIZ, a), originais.get(a)); }   // volta ao byte original
      for (const a of arquivosDoDefeito) await esperarServidor(a, noServidorAntes[a], true);
      for (const a of arquivosDoDefeito) if (md5(fs.readFileSync(path.join(RAIZ, a))) === md5(originais.get(a))) apagarOriginal(a);
    }
    const pegou = falhas !== null && falhas.length > 0;
    console.log(`   ${falhas === null ? 'sem resultado' : (pegou ? `PEGOU: ${falhas.length} conferência(s) reprovaram` : 'NÃO PEGOU: o teste passou com o defeito plantado (o teste está fraco)')}`);
    (falhas || []).slice(0, 6).forEach(l => console.log('     · ' + l.slice(0, 190)));
    resumoLinhas.forEach(l => console.log('   ' + l));
    resultado.push({ id: d.id, nome: d.nome, pegou, falhas: falhas ? falhas.length : null, motivoDeNaoRodar });
  }
  const depois = resumoDosArquivos();
  const iguais = ARQUIVOS.every(a => antes[a] === depois[a]);
  console.log('\n══ RESUMO');
  resultado.forEach(r => console.log(`  ${r.id}) ${r.pegou ? 'PEGOU    ' : 'NÃO PEGOU'} (${r.falhas === null ? 'sem rodar: ' + r.motivoDeNaoRodar : r.falhas + ' falha(s)'}) — ${r.nome}`));
  console.log(`  arquivos restaurados byte a byte: ${iguais ? 'SIM' : 'NÃO!!! confira saida/originais e git diff'}`);
  process.exitCode = iguais && resultado.every(r => r.pegou) ? 0 : 1;
})();
