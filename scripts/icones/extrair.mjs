// Lê o mapa, valida os nomes contra o pacote @mdi/js e grava os caminhos SVG
// para o gerador da fonte (gerar-fonte.py).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MAPA } from './mapa.mjs';

const require = createRequire(import.meta.url);
const mdi = require('@mdi/js');
const camel = (nome) => 'mdi' + nome.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');

const faltando = [];
const saida = MAPA.map(([simbolo, nome, cor]) => {
  const path = mdi[camel(nome)];
  if (!path) faltando.push(`${simbolo} → ${nome}`);
  return { simbolo, nome, cor: cor || null, path };
});
if (faltando.length) { console.error('Ícones inexistentes no @mdi/js:\n' + faltando.join('\n')); process.exit(1); }
const repetidos = saida.map(x => x.simbolo).filter((s, i, a) => a.indexOf(s) !== i);
if (repetidos.length) { console.error('Símbolos repetidos no mapa: ' + repetidos.join(' ')); process.exit(1); }
writeFileSync(new URL('./icones.json', import.meta.url), JSON.stringify(saida));
console.log(`${saida.length} símbolos mapeados`);
