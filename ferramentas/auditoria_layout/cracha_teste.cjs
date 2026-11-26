// Crachá REAL da conta de teste ZZTESTE (Etapa 17, 22/10/2026): o banco só aceita quem entrou, então o teste de navegador precisa de uma sessão de verdade para LER.
// A conta (perfil Almoxarifado, sem nenhuma aba) e a senha são do projeto, mas a senha fica FORA do repositório: %USERPROFILE%\.acn-teste\zzteste.json.
// A sessão vem da mesma função de servidor que a tela de entrada usa (`entrar`), dura 1 hora e é pedida uma vez por execução. As gravações continuam bloqueadas pelo teste (lib.cjs).
const fs = require('fs'); const os = require('os'); const path = require('path');
// 26/11/2026 (B5 do plano de migração): o banco vem da variável ACN_BANCO (padrão: o Supabase de hoje), para o mesmo teste rodar contra a homologação do servidor interno
const { ENDERECO_DO_BANCO } = require('../comum/rede_de_teste.cjs');
const URL_BASE = ENDERECO_DO_BANCO;
const ANON = (fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'supabaseClient.ts'), 'utf8').match(/eyJ[A-Za-z0-9_\-.]+/) || [])[0];   // 18/11/2026: caminho relativo ao repositório (a ferramenta mora em ferramentas/auditoria_layout)
let guardado = null;

async function crachaDeTeste() {
  if (guardado && guardado.expires_at - Math.floor(Date.now() / 1000) > 300) return guardado;
  const { email, senha } = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.acn-teste', 'zzteste.json'), 'utf8'));
  const r = await fetch(URL_BASE + '/functions/v1/entrar', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
  const d = await r.json();
  if (!d.ok || !d.sessao) throw new Error('a conta de teste não entrou: ' + JSON.stringify({ ok: d.ok, erro: d.erro, aviso: d.aviso_sessao }));
  guardado = d.sessao;
  return guardado;
}

module.exports = { crachaDeTeste, URL_BASE, ANON };
