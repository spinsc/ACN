// Resume um achados.jsonl: node resumo.cjs <perfil> [tipo] — conta por tipo e severidade e lista as telas.
const fs = require('fs'), path = require('path');
const perfil = process.argv[2] || 'celular', so = process.argv[3] || null;
const f = path.join(__dirname, 'auditoria', perfil, 'achados.jsonl');
const linhas = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const porTipo = {};
for (const l of linhas) for (const i of l.issues) { const k = i.t + ' / ' + i.sev; porTipo[k] = (porTipo[k] || 0) + 1; }
console.log('vistas auditadas:', linhas.length, '| com erro da auditoria:', linhas.filter(l => l.erroDaAuditoria).length);
console.log(Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + '  ' + k).join('\n'));
if (so) {
  for (const l of linhas) for (const i of l.issues) if (i.t === so) console.log(`\n[${l.tela}${l.sub ? ' › ' + l.sub : ''}${l.modal ? ' {' + l.modal + '}' : ''}] (${l.titulo}) ${i.sev}: ${i.desc}\n   el: ${i.el}${i.el2 ? '\n   el2: ' + i.el2 : ''}`);
} else {
  console.log('\nvistas:');
  for (const l of linhas) console.log(`  ${l.tela}${l.sub ? ' › ' + l.sub : ''}${l.modal ? ' {' + l.modal + '}' : ''} (titulo="${l.titulo}") achados=${l.issues.length}`);
}
