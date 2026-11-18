// Roda a auditoria de layout em vários tamanhos ao mesmo tempo (em levas de 4) e deixa a saída em auditoria/log_<perfil>.txt.
// Uso: node rodar_todos.cjs ["filtro da tela"]      (PERFIS="desktop celular" para rodar só alguns)
// As partidas são ESCALONADAS (20 s): o login da conta de teste (função `entrar`) falha com "Email link is invalid or has expired"
// quando várias execuções pedem o crachá no mesmo instante (descoberto em 18/11/2026: 5 dos 7 tamanhos falharam na 1ª rodada).
// Feito em Node (e não em .sh) porque o repositório converte o fim de linha para CRLF no Windows, e o bash não lê script com CRLF.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const perfis = (process.env.PERFIS || 'desktop notebook desktop-meia-tela tablet-paisagem tablet celular celular-pequeno').split(/\s+/).filter(Boolean);
const filtro = process.argv[2];
const saida = path.join(__dirname, 'auditoria'); fs.mkdirSync(saida, { recursive: true });
try { fs.rmSync(path.join(saida, 'fim_todos.txt')); } catch {}
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const rodar = (p) => new Promise((res) => {
  const log = fs.openSync(path.join(saida, 'log_' + p + '.txt'), 'w');
  const f = spawn(process.execPath, [path.join(__dirname, 'auditoria_layout.cjs'), p, ...(filtro ? [filtro] : [])], { stdio: ['ignore', log, log], env: process.env });
  f.on('close', (codigo) => { fs.closeSync(log); res(codigo); });
});
(async () => {
  for (let i = 0; i < perfis.length; i += 4) {
    const leva = [];
    for (const p of perfis.slice(i, i + 4)) { leva.push(rodar(p)); await espera(20000); }
    await Promise.all(leva);
  }
  fs.writeFileSync(path.join(saida, 'fim_todos.txt'), 'FIM-TODOS\n');
})();
