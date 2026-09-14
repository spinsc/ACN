// Troca confirm()/prompt() do navegador pelas janelas do sistema (src/Feedback.tsx):
//   confirm(x) → await confirmar(x)      prompt(x, y) → await pedirTexto(x, y)
// e marca como async a função onde a chamada está (quando ainda não é).
// Uso: node scripts/visual/trocar-dialogos.cjs [--aplicar]
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const APLICAR = process.argv.includes('--aplicar');
const SRC = path.join(__dirname, '..', '..', 'src');
const arquivos = fs.readdirSync(SRC).filter(f => /\.(tsx|ts)$/.test(f) && f !== 'Feedback.tsx').map(f => path.join(SRC, f));
const NOVO = { confirm: 'confirmar', prompt: 'pedirTexto' };
let total = 0, asyncs = 0;
const avisos = [];

function nomeChamada(n) {
  const e = n.expression;
  if (ts.isIdentifier(e) && NOVO[e.text]) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'window' && NOVO[e.name.text]) return e.name.text;
  return null;
}
function funcaoEnvolvente(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) return p;
  }
  return null;
}
const ehAsync = f => !!(f.modifiers && f.modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword));

for (const arq of arquivos) {
  const src = fs.readFileSync(arq, 'utf8');
  const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, arq.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edicoes = []; // { pos, fim, texto }
  const funcoesAsync = new Set();
  const usados = new Set();
  const visita = (n) => {
    if (ts.isCallExpression(n)) {
      const nome = nomeChamada(n);
      if (nome) {
        const f = funcaoEnvolvente(n);
        const linha = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        if (!f) { avisos.push(`${path.basename(arq)}:${linha} fora de função — não trocado`); ts.forEachChild(n, visita); return; }
        if (ts.isArrowFunction(f) && f.parent && ts.isCallExpression(f.parent) && !ehAsync(f)) {
          avisos.push(`${path.basename(arq)}:${linha} dentro de callback — conferir`);
        }
        usados.add(NOVO[nome]);
        const p = n.parent;
        const precisaParenteses = p && (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p) || (ts.isCallExpression(p) && p.expression === n) || ts.isNonNullExpression(p));
        // troca só o nome chamado; os argumentos ficam intactos
        edicoes.push({ pos: n.expression.getStart(), fim: n.expression.getEnd(), texto: (precisaParenteses ? '(await ' : 'await ') + NOVO[nome] });
        if (precisaParenteses) edicoes.push({ pos: n.getEnd(), fim: n.getEnd(), texto: ')' });
        if (!ehAsync(f)) funcoesAsync.add(f);
        total++;
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  if (!edicoes.length) continue;
  for (const f of funcoesAsync) {
    let pos;
    if (ts.isArrowFunction(f)) pos = f.getStart();
    else if (ts.isFunctionExpression(f) || ts.isFunctionDeclaration(f)) {
      const kw = f.getChildren().find(c => c.kind === ts.SyntaxKind.FunctionKeyword);
      pos = kw.getStart();
    } else pos = f.name.getStart();
    edicoes.push({ pos, fim: pos, texto: 'async ' });
    asyncs++;
    const linha = sf.getLineAndCharacterOfPosition(pos).line + 1;
    console.log(`  async: ${path.basename(arq)}:${linha}  ${src.slice(pos, pos + 70).split('\n')[0]}`);
  }
  // import depois do último import do arquivo
  const imports = sf.statements.filter(s => ts.isImportDeclaration(s));
  const posImport = imports.length ? imports[imports.length - 1].getEnd() : 0;
  edicoes.push({ pos: posImport, fim: posImport, texto: `\nimport { ${[...usados].sort().join(', ')} } from './Feedback';` });
  edicoes.sort((a, b) => b.pos - a.pos || b.fim - a.fim);
  let novo = src;
  for (const e of edicoes) novo = novo.slice(0, e.pos) + e.texto + novo.slice(e.fim);
  console.log(`${path.basename(arq)}: ${edicoes.length} edições`);
  if (APLICAR) { fs.writeFileSync(arq + '.tmp', novo, 'utf8'); fs.renameSync(arq + '.tmp', arq); }
}
console.log({ total, asyncs, aplicado: APLICAR });
avisos.forEach(a => console.log('AVISO', a));
