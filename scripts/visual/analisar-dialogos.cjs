// Levanta as chamadas alert/confirm/prompt e em que tipo de função estão.
// Uso: node scripts/visual/analisar-dialogos.cjs
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const arquivos = fs.readdirSync(SRC).filter(f => /\.(tsx|ts)$/.test(f)).map(f => path.join(SRC, f));
const cont = { alert: 0, confirm: 0, prompt: 0 };
const cat = {};
const exemplos = {};

function nomeChamada(n) {
  const e = n.expression;
  if (ts.isIdentifier(e) && ['alert', 'confirm', 'prompt'].includes(e.text)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'window' && ['alert', 'confirm', 'prompt'].includes(e.name.text)) return e.name.text;
  return null;
}
function funcaoEnvolvente(n) {
  let p = n.parent;
  while (p) {
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) return p;
    p = p.parent;
  }
  return null;
}
function ehAsync(f) { return !!(f.modifiers && f.modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)); }
function usoDoRetorno(f) {
  // a função devolve valor em algum return? (se sim, virar async muda o tipo)
  let devolve = false;
  function visita(n) {
    if (n !== f && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))) return;
    if (ts.isReturnStatement(n) && n.expression) devolve = true;
    ts.forEachChild(n, visita);
  }
  if (ts.isArrowFunction(f) && !ts.isBlock(f.body)) return 'expressao';
  ts.forEachChild(f, visita);
  return devolve ? 'devolve' : 'sem-retorno';
}
function ondeEsta(f) {
  const p = f.parent;
  if (p && ts.isJsxExpression(p)) return 'jsx-evento';
  if (p && ts.isVariableDeclaration(p)) return 'const';
  if (ts.isFunctionDeclaration(f)) return 'function';
  if (p && ts.isCallExpression(p)) return 'callback';
  if (p && ts.isPropertyAssignment(p)) return 'propriedade';
  return 'outro';
}

for (const arq of arquivos) {
  const src = fs.readFileSync(arq, 'utf8');
  const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, arq.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visita(n) {
    if (ts.isCallExpression(n)) {
      const nome = nomeChamada(n);
      if (nome) {
        cont[nome]++;
        if (nome !== 'alert') {
          const f = funcaoEnvolvente(n);
          const chave = !f ? 'topo' : `${ehAsync(f) ? 'async' : 'sync'}/${ondeEsta(f)}/${usoDoRetorno(f)}`;
          cat[chave] = (cat[chave] || 0) + 1;
          if (!exemplos[chave]) exemplos[chave] = [];
          if (exemplos[chave].length < 3) {
            const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
            exemplos[chave].push(`${path.basename(arq)}:${line + 1}`);
          }
        }
      }
    }
    ts.forEachChild(n, visita);
  }
  visita(sf);
}
console.log(cont);
console.log(Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}\t${exemplos[k].join(', ')}`).join('\n'));
