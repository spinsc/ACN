// Endereços e trava de gravação dos testes de navegador (plano de migração para o servidor interno, B5, 26/11/2026).
//
// Por quê: até aqui as ferramentas bloqueavam a gravação só quando o pedido ia para FORA do computador (qualquer endereço que não fosse localhost)
// e tinham o banco do Supabase escrito no código. No servidor interno o sistema e o banco ficam no MESMO endereço (sistema.<domínio>/rest/v1/…) e,
// no desenvolvimento, o Vite vai repassar esses caminhos à homologação: a trava por "de fora" deixaria a gravação passar.
// Agora a trava olha também o CAMINHO: todo pedido que grava (tudo que não é GET, HEAD ou OPTIONS) para /rest/v1, /storage/v1, /functions/v1,
// /auth/v1, /realtime/v1 ou /api é bloqueado, seja qual for o endereço; e continua bloqueado todo pedido que grava para fora do computador.
//
// Variáveis (opcionais): BASE = o sistema (cada ferramenta tem o seu padrão) e ACN_BANCO = o banco (padrão: o Supabase de hoje).
// Exemplo, quando existir a homologação: set ACN_BANCO=https://homolog.<domínio>  e  set BASE=https://homolog.<domínio>/ACN/
const ENDERECO_DO_BANCO = String(process.env.ACN_BANCO || 'https://qgemelnuqdilnggxmrdw.supabase.co').replace(/\/+$/, '');
const CAMINHOS_DO_BANCO = /^\/(rest|storage|functions|auth|realtime)\/v1\/|^\/api\//;
const METODOS_DE_LEITURA = ['GET', 'HEAD', 'OPTIONS'];

function caminhoDe(url) { try { return new URL(url).pathname; } catch { return ''; } }
/** O pedido fica no próprio computador (o servidor de desenvolvimento). */
function ehLocal(url) { return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(String(url)); }
/** O pedido vai ao banco ou à API, pelo caminho, em qualquer endereço. */
function ehDoBanco(url) { return CAMINHOS_DO_BANCO.test(caminhoDe(url)); }
/** O que as ferramentas chamam de "externo": vai ao banco (em qualquer endereço) ou sai do computador. É sobre ele que valem a trava e as simulações. */
function vaiAoBancoOuParaFora(url) { return !ehLocal(url) || ehDoBanco(url); }
function gravaAlgo(metodo) { return !METODOS_DE_LEITURA.includes(String(metodo || '').toUpperCase()); }
/** true = o pedido grava e o teste tem de bloqueá-lo (ou responder com a simulação dele). */
function deveBloquear(url, metodo) { return gravaAlgo(metodo) && vaiAoBancoOuParaFora(url); }

module.exports = { ENDERECO_DO_BANCO, caminhoDe, ehLocal, ehDoBanco, vaiAoBancoOuParaFora, gravaAlgo, deveBloquear };
