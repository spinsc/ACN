// Tira a linha `// @ts-nocheck` dos arquivos de uma lista e PROVA que mais nada mudou (PLANO_TIPAGEM.md, etapa 1).
//
// uso (da raiz):  node ferramentas/tipagem/tirar_diretiva.cjs lista.txt
//   lista.txt = um caminho (relativo à raiz) por linha, de arquivo que já passa no `tsc` sem a diretiva
//   (gerada por listar_limpos.cjs). Depois de tirar, o script:
//     1. confere, para cada arquivo, que o conteúdo novo = o antigo SEM aquela única linha (nenhum outro byte mudou);
//     2. tira os arquivos de nocheck.lista.txt (a lista só encolhe).
// Não faz commit: quem roda confere `npm run conferir` e o build antes.
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');
const entrada = process.argv[2];
if (!entrada) { console.error('Passe o arquivo com a lista de caminhos.'); process.exit(2); }

const alvos = fs.readFileSync(entrada, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const arquivoLista = path.join(__dirname, 'nocheck.lista.txt');
const guardados = fs.readFileSync(arquivoLista, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

const DIRETIVA = /^(﻿)?([ \t]*\/\/[ \t]*@ts-nocheck[^\r\n]*(\r?\n))/m;

let falhas = 0;
for (const rel of alvos) {
  if (!guardados.includes(rel)) { console.error('Não está na lista de diretivas: ' + rel); falhas++; continue; }
  const f = path.join(raiz, rel);
  const antes = fs.readFileSync(f, 'utf8');
  const m = antes.match(DIRETIVA);
  if (!m) { console.error('Sem a diretiva no começo de uma linha: ' + rel); falhas++; continue; }
  const depois = antes.replace(DIRETIVA, '$1');
  // prova: antes === (trecho antes da linha) + linha + (resto); depois === trecho + resto
  const i = m.index + (m[1] ? m[1].length : 0);
  const linha = m[2];
  if (antes.slice(0, i) + linha + antes.slice(i + linha.length) !== antes || depois !== antes.slice(0, i) + antes.slice(i + linha.length)) {
    console.error('Mudou mais que a diretiva: ' + rel); falhas++; continue;
  }
  if (antes.length - depois.length !== linha.length) { console.error('Tamanho inesperado: ' + rel); falhas++; continue; }
  fs.writeFileSync(f, depois);
}
if (falhas) { console.error(`${falhas} arquivo(s) com problema; nada foi gravado na lista. Confira com git status/diff.`); process.exit(1); }

const restantes = guardados.filter(a => !alvos.includes(a));
fs.writeFileSync(arquivoLista, restantes.join('\n') + (restantes.length ? '\n' : ''));
console.log(`Diretiva tirada de ${alvos.length} arquivo(s). Restam ${restantes.length} com @ts-nocheck.`);
