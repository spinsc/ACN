// Bateria de carga v2 (13/11/2026), SÓ LEITURA, conta ZZTESTE, com as consultas REAIS das telas (medidas em pesos.cjs).
// Uso: node supabase/teste_de_carga/carga.cjs <usuarios> <segundos> [ritmo=1]. Sem o conector do banco, o sinal de saúde é o tempo que o SERVIDOR gasta
// (cabeçalho x-envoy-upstream-service-time), que não inclui a rede do meu computador: separa "banco lento" de "download lento".
// Para sozinho: sonda lenta (servidor > 400 ms ou resposta > 1,5 s), 2 pedidos sem resposta em 10 s ou erros > 2%. Arquivo PARAR também para.
const fs = require('fs'), path = require('path');
const USUARIOS = +process.argv[2] || 10, SEGUNDOS = +process.argv[3] || 60, RITMO = +process.argv[4] || 1;
const BASE = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';
const PARAR = path.join(require("os").tmpdir(), "acn-carga-PARAR");   // crie este arquivo para parar o teste na hora
const conta = require(path.join(process.env.USERPROFILE, '.acn-teste', 'zzteste.json'));
const IN = (a) => '(' + a.map(x => '"' + x + '"').join(',') + ')';
const COLS_CRM = 'id,opl,cliente_nome,modelo,chassi,placa,tipo_projeto,status_geral,data_entrada,data_prevista_entrega,faturamento_empresa,responsavel_comercial,crm_oportunidade_id,quantidade,cnpj_faturamento,razao_social_faturamento,centro_custo,observacoes_comercial,veiculo,fluxo_entrega,frete_responsavel,destino_cidade,destino_uf,destino_cep,prazo_garantia,obs_devolucao,pendencias_kit,veiculo_id';
// cada "tela" é o conjunto de pedidos que ela faz ao abrir; os mesmos pedidos se repetem no "perguntar de novo" dela (30 s)
const TELAS = {
  pcp:       { peso: 20, poll: 30000, pedidos: [
    `/rest/v1/oples?select=*&status_geral=in.${IN(['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP','Devolvida PCP','Retrabalho'])}&order=data_entrada.desc`,
    `/rest/v1/oples?select=id,opl,chassi,modelo,placa,tipo_projeto,status_almox,obs_almox,responsavel_almox,data_kiting,fluxo_entrega,quantidade&status_almox=in.${IN(['Falta de Material','Liberado com Pendencia'])}` ] },
  producao:  { peso: 20, poll: 30000, pedidos: [
    `/rest/v1/oples?select=*&status_geral=in.${IN(['Aguardando Inicio Producao','Em Producao','Retrabalho','Em Retrabalho'])}&order=data_entrada.desc` ] },
  fiscal:    { peso: 15, poll: 30000, pedidos: [
    `/rest/v1/oples?select=*&status_geral=in.${IN(['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])}&order=data_liberacao_comercial.asc`,
    `/rest/v1/oples?select=id,opl,status_geral,numero_nf,numero_nf_servico,fluxo_entrega,tipo_projeto&opl=like.*/*` ] },
  crm:       { peso: 20, poll: 60000, pedidos: [
    `/rest/v1/oples?select=${COLS_CRM}&status_geral=not.in.("Faturado","Cancelado")&order=data_entrada.desc`,
    `/rest/v1/crm_oportunidades_basico?select=*&limit=1000` ] },
  compras:   { peso: 15, poll: 60000, pedidos: [`/rest/v1/pcp_pedidos_compra?select=*&order=data_criacao.desc&limit=1000`] },
  dashboard: { peso: 10, poll: 120000, pedidos: [`/rest/v1/oples?select=tempo_engenharia_horas,tempo_pcp_horas,tempo_almoxarifado_horas,tempo_producao_horas,tempo_qualidade_horas,tempo_logistica_horas,tempo_fiscal_horas`] },
};
const fundo = (uid) => ({
  chat:    { cada: 30000, url: `/rest/v1/chat_mensagens?select=id,sala_id,texto,criado_em&order=criado_em.desc&limit=500` },
  mencoes: { cada: 90000, head: true, url: `/rest/v1/mencoes?select=id&mencionado_id=eq.${uid}&resolvida=eq.false&contexto=neq.op_adaptacao` },
  analise: { cada: 180000, url: `/rest/v1/analise_setores?select=*&limit=1000` },
});

const medidas = []; let parar = false, motivo = '', token = '', uid = '';
const p = (v, q) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const dorme = (ms) => new Promise(r => setTimeout(r, ms));
async function pedir(nome, url, head, limite) {
  const t0 = Date.now(); let status = 0, bytes = 0, srv = null;
  try {
    const r = await fetch(BASE + url, { method: head ? 'HEAD' : 'GET', headers: { apikey: ANON, Authorization: 'Bearer ' + token, ...(head ? { Prefer: 'count=exact' } : {}) }, signal: AbortSignal.timeout(limite || 12000) });
    status = r.status; srv = +r.headers.get('x-envoy-upstream-service-time') || null;
    if (!head) bytes = (await r.arrayBuffer()).byteLength;
  } catch (e) { status = e.name === 'TimeoutError' ? -2 : -1; }
  medidas.push({ t: Date.now(), nome, ms: Date.now() - t0, status, bytes, srv });
}
function escolhe() { const tot = Object.values(TELAS).reduce((a, b) => a + b.peso, 0); let x = Math.random() * tot; for (const [n, c] of Object.entries(TELAS)) { if ((x -= c.peso) < 0) return [n, c]; } return Object.entries(TELAS)[0]; }

async function usuario() {
  await dorme(Math.random() * 4000);
  let tela = escolhe(); let proxPoll = 0, proxTroca = Date.now() + (25000 + Math.random() * 30000) / RITMO;
  const f = fundo(uid), prox = {}; for (const k of Object.keys(f)) prox[k] = Date.now() + Math.random() * f[k].cada;
  const abrir = async () => { for (const u of tela[1].pedidos) { if (parar) return; await pedir(tela[0], u); } proxPoll = Date.now() + tela[1].poll; };
  await abrir();
  while (!parar) {
    const agora = Date.now();
    for (const k of Object.keys(f)) if (agora >= prox[k]) { prox[k] = agora + f[k].cada; await pedir(k, f[k].url, f[k].head); }
    if (agora >= proxTroca) { proxTroca = agora + (25000 + Math.random() * 30000) / RITMO; tela = escolhe(); await abrir(); }
    else if (agora >= proxPoll) await abrir();
    await dorme(500);
  }
}

(async () => {
  const r = await fetch(BASE + '/functions/v1/entrar', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: conta.email, senha: conta.senha }) });
  const d = await r.json().catch(() => null);
  if (!d || !d.ok || !d.sessao) { console.log('Não consegui entrar com a conta de teste'); process.exit(2); }
  token = d.sessao.access_token; uid = d.usuario && (d.usuario.auth_id || d.usuario.id) || '';
  if (fs.existsSync(PARAR)) fs.unlinkSync(PARAR);
  console.log(`Entrou. ${USUARIOS} usuários simulados, ${SEGUNDOS}s, ritmo ${RITMO}.`);
  const inicio = Date.now();
  const ts = Array.from({ length: USUARIOS }, () => usuario());
  (async () => { const m = fundo(uid).mencoes; while (!parar) { await pedir('SONDA', m.url, true, 6000); await dorme(2000); } })();
  const vigia = setInterval(() => {
    const j = medidas.filter(m => m.t > Date.now() - 12000), seg = Math.round((Date.now() - inicio) / 1000);
    const erros = j.filter(m => m.status < 200 || m.status >= 300), sem = j.filter(m => m.status === -2);
    const sonda = j.filter(m => m.nome === 'SONDA'), srvSonda = sonda.map(m => m.srv).filter(x => x != null);
    console.log(`[${seg}s] pedidos(12s)=${j.length} erros=${erros.length} servidor(p50/p95)=${p(j.map(m => m.srv).filter(x => x != null), .5)}/${p(j.map(m => m.srv).filter(x => x != null), .95)}ms sonda: ${p(sonda.map(m => m.ms), .5)}ms (servidor ${p(srvSonda, .5)}ms)`);
    if (sonda.length >= 3 && p(srvSonda, .5) > 400) { parar = true; motivo = 'a sonda gastou mais de 400 ms no servidor (banco lento)'; }
    else if (sonda.length >= 3 && p(sonda.map(m => m.ms), .5) > 1500) { parar = true; motivo = 'a sonda levou mais de 1,5 s'; }
    else if (sem.length >= 2) { parar = true; motivo = `${sem.length} pedidos sem resposta em 12 s`; }
    else if (j.length >= 30 && erros.length / j.length > 0.02) { parar = true; motivo = `erros acima de 2% (${erros.length}/${j.length}; status ${[...new Set(erros.map(e => e.status))]})`; }
    else if (fs.existsSync(PARAR)) { parar = true; motivo = 'arquivo PARAR'; }
    else if (Date.now() - inicio > SEGUNDOS * 1000) { parar = true; motivo = 'tempo cumprido'; }
    if (parar) clearInterval(vigia);
  }, 3000);
  await Promise.all(ts);
  const dur = (Date.now() - inicio) / 1000;
  console.log(`\nFIM (${motivo}) em ${dur.toFixed(0)} s. ${medidas.length} pedidos (${(medidas.length / dur * 60).toFixed(0)}/min), ${(medidas.reduce((a, m) => a + m.bytes, 0) / 1e6).toFixed(1)} MB (já descomprimido).`);
  console.log('consulta        n  erros | total ms p50/p95/max | servidor ms p50/p95/max');
  for (const n of [...new Set(medidas.map(m => m.nome))]) {
    const a = medidas.filter(m => m.nome === n), ms = a.map(m => m.ms), sv = a.map(m => m.srv).filter(x => x != null);
    console.log(`${n.padEnd(12)} ${String(a.length).padStart(4)} ${String(a.filter(m => m.status < 200 || m.status >= 300).length).padStart(5)} | ${p(ms, .5)}/${p(ms, .95)}/${Math.max(...ms)} | ${p(sv, .5)}/${p(sv, .95)}/${Math.max(0, ...sv)}`);
  }
  const st = {}; medidas.forEach(m => st[m.status] = (st[m.status] || 0) + 1); console.log('status:', JSON.stringify(st));
  process.exit(0);
})();
