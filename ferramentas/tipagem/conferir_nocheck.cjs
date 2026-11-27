// Trava da diretiva `// @ts-nocheck` (PLANO_TIPAGEM.md, etapa 0, 27/11/2026).
//
// Compara os arquivos de src/ que TÊM a diretiva com a lista guardada em
// ferramentas/tipagem/nocheck.lista.txt. A lista só pode encolher:
//   - arquivo com a diretiva que NÃO está na lista  = arquivo novo nasceu sem checagem (ou alguém pôs a diretiva num
//     arquivo que não tinha): falha;
//   - arquivo na lista que já NÃO tem a diretiva    = esqueceram de tirá-lo da lista: falha (a lista tem de contar a verdade).
// Por que existe: o `tsc` e o `vite build` não reclamam de um `@ts-nocheck` novo, então sem esta trava a dívida voltaria sozinha.
//
// Desde 27/11/2026 (fim da etapa 2) a lista está VAZIA: a diretiva é proibida em src/. A trava segue valendo (arquivo com a diretiva = falha).
//
// uso (da raiz do projeto):  node ferramentas/tipagem/conferir_nocheck.cjs [--gravar]
//   --gravar  reescreve a lista com o estado atual (só para usar depois de TIRAR a diretiva de arquivos; nunca para aceitar um novo).
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');
const arquivoLista = path.join(__dirname, 'nocheck.lista.txt');

// a diretiva só vale para o `tsc` quando é uma linha de comentário no começo do arquivo; por segurança, qualquer linha
// que COMECE com ela conta (um comentário que apenas cita a palavra no meio do texto não conta).
const DIRETIVA = /^\s*\/\/\s*@ts-nocheck\b/m;

function listarFontes(dir, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listarFontes(p, saida);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) saida.push(p);
  }
  return saida;
}

function comDiretiva() {
  return listarFontes(path.join(raiz, 'src'))
    .filter(p => DIRETIVA.test(fs.readFileSync(p, 'utf8')))
    .map(p => path.relative(raiz, p).replace(/\\/g, '/'))
    .sort();
}

const atuais = comDiretiva();

if (process.argv.includes('--gravar')) {
  fs.writeFileSync(arquivoLista, atuais.join('\n') + (atuais.length ? '\n' : ''));
  console.log(`Lista regravada: ${atuais.length} arquivo(s) com @ts-nocheck.`);
  process.exit(0);
}

const guardados = fs.existsSync(arquivoLista)
  ? fs.readFileSync(arquivoLista, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean).sort()
  : [];

const novos = atuais.filter(a => !guardados.includes(a));
const sobrando = guardados.filter(a => !atuais.includes(a));

let ok = true;
if (novos.length) {
  ok = false;
  console.error('FALHA: arquivo com "// @ts-nocheck" que não está na lista (a lista só encolhe, nunca ganha arquivo):');
  novos.forEach(a => console.error('  + ' + a));
  console.error('  -> arquivo novo deve nascer SEM a diretiva: anote o tipo em vez de desligar a checagem.');
}
if (sobrando.length) {
  ok = false;
  console.error('FALHA: arquivo está na lista mas já não tem a diretiva (tire-o da lista: node ferramentas/tipagem/conferir_nocheck.cjs --gravar):');
  sobrando.forEach(a => console.error('  - ' + a));
}
if (ok) console.log(`Diretivas conferidas: ${atuais.length} arquivo(s) com @ts-nocheck, igual à lista.`);
process.exit(ok ? 0 : 1);
