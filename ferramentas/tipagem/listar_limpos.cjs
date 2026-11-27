// Descobre quais arquivos com `// @ts-nocheck` JÁ PASSARIAM na checagem sem a diretiva (PLANO_TIPAGEM.md, etapa 1).
//
// Como funciona: tira a diretiva de TODOS os arquivos da lista, roda o `tsc` do projeto, devolve os arquivos que não
// tiveram nenhum erro e RESTAURA tudo no fim (mesmo se o `tsc` falhar). A diretiva só silencia mensagens, os tipos que cada
// arquivo exporta são os mesmos, então "limpo sozinho" = "limpo com os outros sem diretiva".
//
// uso (da raiz, com a árvore de trabalho SEM alteração nos arquivos de src/):
//   node ferramentas/tipagem/listar_limpos.cjs [saida.txt] [--rigor=noImplicitAny|strict]
// Escreve um caminho por linha em `saida.txt` (ou na tela) e um resumo por tipo no stderr.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.resolve(__dirname, '..', '..');
const argSaida = process.argv.slice(2).find(a => !a.startsWith('--'));
const rigor = (process.argv.find(a => a.startsWith('--rigor=')) || '').split('=')[1];

const lista = fs.readFileSync(path.join(__dirname, 'nocheck.lista.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const DIRETIVA = /^(﻿)?[ \t]*\/\/[ \t]*@ts-nocheck[^\r\n]*(\r?\n)/m;

const original = new Map();
try {
  for (const rel of lista) {
    const f = path.join(raiz, rel);
    const txt = fs.readFileSync(f, 'utf8');
    original.set(f, txt);
    fs.writeFileSync(f, txt.replace(DIRETIVA, '$1'));
  }
  const args = ['tsc', '--noEmit', '-p', 'tsconfig.app.json', '--pretty', 'false'];
  if (rigor === 'noImplicitAny') args.push('--noImplicitAny');
  if (rigor === 'strict') args.push('--strict', '--noImplicitAny');
  const r = spawnSync('npx', args, { cwd: raiz, encoding: 'utf8', shell: true, maxBuffer: 1 << 28 });
  const saida = (r.stdout || '') + (r.stderr || '');
  const comErro = new Set();
  for (const l of saida.split(/\r?\n/)) {
    const m = l.match(/^(src\/[^(]+)\(\d+,\d+\): error TS/);
    if (m) comErro.add(m[1]);
  }
  const limpos = lista.filter(a => !comErro.has(a));
  console.error(`Com diretiva: ${lista.length}. Passam limpos sem ela: ${limpos.length}. Com erro: ${lista.length - limpos.length}.`);
  if (argSaida) fs.writeFileSync(argSaida, limpos.join('\n') + '\n'); else console.log(limpos.join('\n'));
} finally {
  for (const [f, txt] of original) fs.writeFileSync(f, txt);
}
