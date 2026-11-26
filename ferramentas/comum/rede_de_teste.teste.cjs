// Conferência da trava de gravação dos testes (B5 do plano de migração, 26/11/2026). Uso: node ferramentas/comum/rede_de_teste.teste.cjs
// Roda também na verificação automática da main (.github/workflows/verificacao.yml). Não abre navegador nem fala com o banco.
const assert = require('assert');
const { deveBloquear, vaiAoBancoOuParaFora, ehDoBanco, ehLocal } = require('./rede_de_teste.cjs');

const casos = [
  // [url, método, deve bloquear?, por quê]
  ['https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/oples?select=id', 'GET', false, 'leitura do banco passa'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/oples', 'POST', true, 'gravação no banco de hoje'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/oples?id=eq.1', 'PATCH', true, 'alteração no banco de hoje'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/oples?id=eq.1', 'DELETE', true, 'exclusão no banco de hoje'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/oples', 'OPTIONS', false, 'pedido de licença do navegador passa'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/storage/v1/object/acn-media/x.png', 'POST', true, 'envio de arquivo'],
  ['https://qgemelnuqdilnggxmrdw.supabase.co/functions/v1/send-email', 'POST', true, 'função de servidor'],
  ['http://localhost:5173/rest/v1/oples', 'POST', true, 'NOVO: banco repassado pelo servidor de desenvolvimento'],
  ['http://localhost:5173/api/contadores', 'POST', true, 'NOVO: API própria no mesmo endereço'],
  ['https://sistema.exemplo.com.br/rest/v1/oples', 'PATCH', true, 'NOVO: servidor interno, sistema e banco no mesmo endereço'],
  ['https://sistema.exemplo.com.br/storage/v1/object/x', 'PUT', true, 'NOVO: arquivos no servidor interno'],
  ['https://sistema.exemplo.com.br/auth/v1/token', 'POST', true, 'NOVO: entrada no servidor interno'],
  ['https://api.open-meteo.com/v1/forecast', 'POST', true, 'gravação para fora do computador'],
  ['https://api.open-meteo.com/v1/forecast?x=1', 'GET', false, 'leitura de fora passa'],
  ['http://localhost:5173/ACN/src/main.tsx', 'GET', false, 'arquivo do próprio sistema'],
  ['http://localhost:5173/ACN/@vite/client', 'POST', false, 'servidor de desenvolvimento, fora do banco'],
];
let n = 0;
for (const [url, metodo, esperado, porque] of casos) {
  assert.strictEqual(deveBloquear(url, metodo), esperado, `${metodo} ${url}: esperado ${esperado ? 'bloquear' : 'passar'} (${porque})`);
  n++;
}
assert.ok(ehLocal('http://127.0.0.1:5199/ACN/') && ehLocal('http://[::1]:5173/') && !ehLocal('http://localhost.exemplo.com/'), 'o que é "local"');
assert.ok(ehDoBanco('https://x.y/rest/v1/a') && !ehDoBanco('https://x.y/ACN/rest/v1/a') && !ehDoBanco('https://x.y/restante/v1/a'), 'o caminho do banco começa na raiz');
assert.ok(vaiAoBancoOuParaFora('https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/a') && !vaiAoBancoOuParaFora('http://localhost:5173/ACN/'), 'o "externo" das ferramentas');
n += 3;

// a variável ACN_BANCO troca o banco (relê o módulo com a variável ligada)
process.env.ACN_BANCO = 'https://homolog.exemplo.com.br/';
delete require.cache[require.resolve('./rede_de_teste.cjs')];
assert.strictEqual(require('./rede_de_teste.cjs').ENDERECO_DO_BANCO, 'https://homolog.exemplo.com.br', 'ACN_BANCO sem a barra do fim');
n++;
console.log(`trava de gravação dos testes: ${n} conferências, todas certas`);
