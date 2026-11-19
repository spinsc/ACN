// Junta os achados de todos os perfis e agrupa por problema (tipo + os mesmos elementos de classe), para a leitura e o plano.
// Uso: node consolidar.cjs  -> escreve auditoria/consolidado.json e auditoria/consolidado.txt
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, 'auditoria');
const perfis = ['desktop', 'notebook', 'desktop-meia-tela', 'tablet-paisagem', 'tablet', 'celular', 'celular-pequeno'].filter(p => fs.existsSync(path.join(base, p, 'achados.jsonl')));
const grupos = new Map();
let vistas = 0, vistasComErro = [];
const norm = (s) => String(s || '').replace(/#[\w-]+/g, '').replace(/\d+/g, 'N');
for (const p of perfis) {
  const linhas = fs.readFileSync(path.join(base, p, 'achados.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  for (const l of linhas) {
    vistas++;
    if (l.erroDaAuditoria) { vistasComErro.push(`${p}: ${l.tela} — ${l.erroDaAuditoria}`); continue; }
    for (const i of l.issues) {
      let chave;
      if (i.t === 'sobreposicao') chave = i.t + '|' + [norm(i.el), norm(i.el2)].sort().join(' × ');
      else if (i.t === 'alvo-de-toque-pequeno' || i.t === 'letra-miuda') chave = i.t + '|' + l.tela;
      else if (i.t === 'pagina-rola-para-o-lado') chave = i.t + '|' + l.tela + '|' + (l.sub || '') + '|' + (l.modal || '');
      else chave = i.t + '|' + norm(i.el) + '|' + norm(i.desc).replace(/"[^"]*"/g, '"…"').slice(0, 90);
      let g = grupos.get(chave);
      if (!g) { g = { chave, t: i.t, sev: i.sev, el: i.el, el2: i.el2 || null, desc: i.desc, telas: new Set(), perfis: new Set(), ocorrencias: 0, foto: null, maxSobra: 0 }; grupos.set(chave, g); }
      g.ocorrencias++; g.perfis.add(p);
      g.telas.add(`${l.tela}${l.sub ? ' › ' + l.sub : ''}${l.modal ? ' {' + l.modal + '}' : ''}`);
      const ordem = { alta: 3, media: 2, baixa: 1 }; if (ordem[i.sev] > ordem[g.sev]) g.sev = i.sev;
      if (i.sobra && i.sobra > g.maxSobra) g.maxSobra = i.sobra;
      if (!g.foto && l.foto && i.sev === 'alta') g.foto = `${p}/${l.foto}`;
    }
  }
}
const lista = [...grupos.values()].map(g => ({ ...g, telas: [...g.telas], perfis: [...g.perfis] }));
const ordem = { alta: 3, media: 2, baixa: 1 };
lista.sort((a, b) => ordem[b.sev] - ordem[a.sev] || b.telas.length - a.telas.length || b.ocorrencias - a.ocorrencias);
fs.writeFileSync(path.join(base, 'consolidado.json'), JSON.stringify({ perfis, vistas, vistasComErro, grupos: lista }, null, 1));
let txt = `perfis: ${perfis.join(', ')} | vistas auditadas: ${vistas} | com erro da auditoria: ${vistasComErro.length}\ngrupos de problema: ${lista.length}\n\n`;
const porTipo = {}; for (const g of lista) { const k = g.t + ' / ' + g.sev; porTipo[k] = (porTipo[k] || 0) + 1; }
txt += 'POR TIPO (grupos):\n' + Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([k, v]) => '  ' + v + '  ' + k).join('\n') + '\n\n';
lista.forEach((g, n) => {
  txt += `#${n + 1} [${g.sev}] ${g.t} — ${g.telas.length} tela(s), perfis: ${g.perfis.join(', ')}${g.maxSobra ? ', sobra máx ' + g.maxSobra + 'px' : ''}\n   ${g.desc.slice(0, 260)}\n   el: ${g.el}${g.el2 ? '\n   el2: ' + g.el2 : ''}\n   telas: ${g.telas.slice(0, 7).join(' | ')}${g.telas.length > 7 ? ' … +' + (g.telas.length - 7) : ''}${g.foto ? '\n   foto: ' + g.foto : ''}\n`;
});
if (vistasComErro.length) txt += '\nVISTAS COM ERRO DA AUDITORIA:\n' + vistasComErro.join('\n') + '\n';
fs.writeFileSync(path.join(base, 'consolidado.txt'), txt);
console.log(txt.split('\n').slice(0, 22).join('\n'));
