// Supabase Edge Function — ponto-secullum
// (19/11/2026) Leitura do Ponto Secullum Web para o RH. PLANO_PONTO_SECULLUM.md: P1 (conexão e cruzamento) e P2 (a cópia no nosso banco).
// Só LÊ da Secullum: nada é gravado lá. O que se grava é a cópia no nosso banco (ponto_dias, ponto_totais, ponto_rodadas).
//
// A conta de integração da Secullum (e-mail e senha) fica aqui, como segredo do servidor (SECULLUM_EMAIL e SECULLUM_SENHA, no painel do Supabase em
// Edge Functions → Secrets), e nunca vai ao navegador nem a tabela nenhuma. Quem pode chamar:
//   • quem tem a aba RH (ou é Admin): a função repete, com o crachá de quem chamou, a pergunta `public.pode_ver_rh()` ao banco. O gate "verify_jwt"
//     sozinho não basta: ele também aceita a chave pública do navegador (achado da Etapa 17);
//   • a rotina agendada do banco (8h30 e 20h30), que manda o segredo `ponto_rotina_segredo` no cabeçalho `x-ponto-rotina` — vale só para "sincronizar".
//
// Ações (corpo JSON { acao, ... }):
//   • "bancos"       → { bancos: [{ id, nome }] }
//   • "cruzar"       → os funcionários da Secullum casados com o RH pelo CPF (CPF mascarado). Serve para o RH conferir quem ficou sem par.
//   • "sincronizar"  → lê o mês (e, até o dia 5, o mês anterior) de cada CLT da Detech casado por CPF e grava a cópia. { origem: "botao" | "rotina", meses?: ["2026-10"] }
//                      `meses` traz também meses passados fechados (até 3, dos últimos 6 meses), cada um gasta 1 consulta por pessoa.
//
// Limites da Secullum (laudo de 19/11/2026): o `Calcular` aceita no máximo 1 mês por consulta e 100 consultas por hora por banco. Cada pessoa/mês
// gasta 1. A função conta o que a última hora já gastou (ponto_rodadas) e recusa quando não sobra folga; também para sozinha se a Secullum disser
// que o resto da hora acabou (cabeçalho x-rate-limit-remaining) ou responder 429.
//
// Só os funcionários da DETECH batem ponto na Secullum (informado pelo usuário em 19/11/2026): entram os CLT ativos do RH cuja empresa cita a Detech.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// trim só no e-mail: espaço sobrando ao colar no painel é erro comum; a senha vale exatamente como foi digitada
const EMAIL = (Deno.env.get("SECULLUM_EMAIL") || "").trim();
const SENHA = Deno.env.get("SECULLUM_SENHA") || "";
// só precisa existir se a conta enxergar mais de um banco do Ponto Web; com um só, a função usa esse
const BANCO_FIXO = (Deno.env.get("SECULLUM_BANCO") || "").trim();

const AUTENTICADOR = "https://autenticador.secullum.com.br";
const PONTOWEB = "https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/";
const CLIENT_ID_PONTOWEB = "3"; // valor fixo do manual da Secullum

/** Das 100 consultas por hora do cálculo, nunca passa de 90: sobra margem para quem consultar por fora e para erro de conta. */
const TETO_DE_CONSULTAS_POR_HORA = 90;
/** Rodada aberta há mais de 10 minutos é tratada como interrompida (a função não demora isso). */
const MINUTOS_PARA_DAR_POR_INTERROMPIDA = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ponto-rotina",
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class ErroDeIntegracao extends Error {
  status: number;
  constructor(mensagem: string, status = 502) { super(mensagem); this.status = status; }
}

const banco = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function podeVerRh(autorizacao: string | null): Promise<boolean> {
  if (!autorizacao) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pode_ver_rh`, {
      method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao, "Content-Type": "application/json" }, body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

/** Quem apertou o botão, para a linha da rodada (o nome que o sistema conhece, não o e-mail). */
async function nomeDeQuemChamou(autorizacao: string | null): Promise<string> {
  if (!autorizacao) return "";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nome_do_usuario_atual`, {
      method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao, "Content-Type": "application/json" }, body: "{}",
    });
    return r.ok ? String((await r.json()) || "") : "";
  } catch { return ""; }
}

/** A rotina agendada prova quem é com o segredo guardado no banco (só o servidor o lê). Comparação sem pressa para não vazar por tempo. */
async function ehARotinaDoBanco(segredoRecebido: string | null): Promise<boolean> {
  if (!segredoRecebido) return false;
  const { data } = await banco().from("ponto_rotina_segredo").select("segredo").eq("id", 1).maybeSingle();
  const esperado = String(data?.segredo || "");
  if (!esperado || esperado.length !== segredoRecebido.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ segredoRecebido.charCodeAt(i);
  return dif === 0;
}

async function pedir(url: string, init: RequestInit, rotulo: string, limiteMs = 25000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), limiteMs);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  catch (e) { throw new ErroDeIntegracao((e as Error).name === "AbortError" ? `a Secullum demorou demais para responder (${rotulo})` : `não foi possível falar com a Secullum (${rotulo})`); }
  finally { clearTimeout(t); }
}

/** Entra na conta de integração a cada rodada (o login custa ~60 ms: não há token guardado, então não há o que vazar nem renovar). */
async function entrarNaSecullum(): Promise<string> {
  if (!EMAIL || !SENHA) throw new ErroDeIntegracao("a conta da Secullum não está cadastrada: crie os segredos SECULLUM_EMAIL e SECULLUM_SENHA nas Edge Functions do Supabase", 412);
  const corpo = new URLSearchParams({ grant_type: "password", username: EMAIL, password: SENHA, client_id: CLIENT_ID_PONTOWEB });
  const r = await pedir(`${AUTENTICADOR}/Token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo.toString() }, "login");
  if (!r.ok) {
    // a senha nunca aparece na mensagem: só o motivo em português, o que a Secullum disse e o e-mail mascarado (para achar erro de digitação no segredo)
    const motivo = await r.text().catch(() => "");
    let resumo = "";
    try { const m = JSON.parse(motivo); resumo = String(m?.error_description || m?.error || m?.message || "").slice(0, 160); } catch { resumo = motivo.slice(0, 160); }
    const [usuario, dominio] = EMAIL.split("@");
    const mascarado = `${(usuario || "").slice(0, 2)}***@${dominio || "?"}`;
    if (r.status === 400 || r.status === 401) throw new ErroDeIntegracao(`a Secullum recusou o login (HTTP ${r.status}${resumo ? `: ${resumo}` : ""}); e-mail cadastrado: ${mascarado}. Confira os segredos SECULLUM_EMAIL e SECULLUM_SENHA`);
    throw new ErroDeIntegracao(`a Secullum respondeu com erro ${r.status} no login${resumo ? `: ${resumo}` : ""}`);
  }
  const j = await r.json().catch(() => null);
  const token = j?.access_token;
  if (!token) throw new ErroDeIntegracao("a Secullum não devolveu o token de acesso");
  return String(token);
}

async function listarBancos(token: string): Promise<{ id: string; nome: string }[]> {
  const r = await pedir(`${AUTENTICADOR}/ContasSecullumExterno/ListarBancos/`, { method: "GET", headers: { Authorization: `Bearer ${token}` } }, "lista de bancos");
  if (!r.ok) throw new ErroDeIntegracao(`a Secullum respondeu com erro ${r.status} ao listar os bancos`);
  const lista = await r.json().catch(() => null);
  if (!Array.isArray(lista)) throw new ErroDeIntegracao("a lista de bancos da Secullum veio em formato inesperado");
  // clienteId 3 = Ponto Web (valor fixo do manual)
  return lista.filter((b: any) => String(b?.clienteId) === CLIENT_ID_PONTOWEB).map((b: any) => ({ id: String(b.id), nome: String(b.nome || "") }));
}

/** O banco do Ponto Web que vale: o único que a conta enxerga, ou o indicado no segredo SECULLUM_BANCO quando houver mais de um. */
async function escolherBanco(token: string): Promise<string> {
  const bancos = await listarBancos(token);
  if (BANCO_FIXO) {
    if (!bancos.some((b) => b.id === BANCO_FIXO)) throw new ErroDeIntegracao("o banco indicado em SECULLUM_BANCO não está entre os que a conta enxerga");
    return BANCO_FIXO;
  }
  if (bancos.length === 1) return bancos[0].id;
  throw new ErroDeIntegracao(bancos.length ? "a conta enxerga mais de um banco do Ponto Web: crie o segredo SECULLUM_BANCO com o id do que vale" : "a conta não enxerga nenhum banco do Ponto Web");
}

async function lerDoPontoWeb(token: string, bancoId: string, rota: string, init: RequestInit = {}, aoReceber?: (h: Headers) => void): Promise<any> {
  const r = await pedir(PONTOWEB + rota, {
    method: "GET", ...init,
    headers: { Authorization: `Bearer ${token}`, secullumidbancoselecionado: bancoId, "Accept-Language": "pt-BR", "Content-Type": "application/json; charset=utf-8", ...(init.headers || {}) },
  }, rota.split("?")[0]);
  if (aoReceber) aoReceber(r.headers);
  const texto = await r.text();
  if (r.status === 401) throw new ErroDeIntegracao("o banco do Ponto Web não autorizou esta conta (confira se a integração está ligada em Manutenção > Integração com Sistemas e se o suporte liberou o acesso)", 401);
  if (r.status === 403) throw new ErroDeIntegracao("a Secullum negou o acesso a estes dados (a rota de funcionários exige a autorização do administrador para dados protegidos pela LGPD)", 403);
  if (r.status === 429) throw new ErroDeIntegracao("o limite de consultas da Secullum foi atingido (100 por hora no cálculo); tente de novo daqui a pouco", 429);
  if (!r.ok) throw new ErroDeIntegracao(`a Secullum respondeu com erro ${r.status} em ${rota.split("?")[0]}${texto ? `: ${texto.slice(0, 200)}` : ""}`);
  try { return JSON.parse(texto); } catch { throw new ErroDeIntegracao(`a resposta de ${rota.split("?")[0]} veio em formato inesperado`); }
}

const soDigitos = (s: any) => String(s ?? "").replace(/\D/g, "");
/** CPF sem os dígitos do meio e dos extremos: dá para distinguir duas pessoas na tela sem expor o número. */
const mascararCpf = (s: any) => { const d = soDigitos(s); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : (d ? "(CPF incompleto)" : "(sem CPF)"); };
/** O dia de hoje em Brasília (UTC−3, sem horário de verão). */
const hojeBr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const ehDetech = (empresa: any) => /detech/i.test(String(empresa || ""));

async function acaoCruzar(token: string, bancoId: string) {
  const [doPonto, rhResp] = await Promise.all([
    lerDoPontoWeb(token, bancoId, "Funcionarios?pis="),
    banco().from("rh_funcionarios").select("id, nome, cpf, ativo, tipo_colaborador, empresa, data_admissao, data_desligamento"),
  ]);
  if (rhResp.error) throw new ErroDeIntegracao(`não foi possível ler o cadastro do RH: ${rhResp.error.message}`, 500);
  if (!Array.isArray(doPonto)) throw new ErroDeIntegracao("a lista de funcionários da Secullum veio em formato inesperado");

  const rh = (rhResp.data || []) as any[];
  const porCpfRh = new Map<string, any[]>();
  for (const p of rh) { const c = soDigitos(p.cpf); if (c.length === 11) porCpfRh.set(c, [...(porCpfRh.get(c) || []), p]); }
  const cpfsDaSecullum = new Set<string>();

  const achados: any[] = [], soNaSecullum: any[] = [], cpfRepetidoNoRh: any[] = [];
  for (const f of doPonto) {
    const c = soDigitos(f?.Cpf);
    if (c.length === 11) cpfsDaSecullum.add(c);
    const candidatos = c.length === 11 ? (porCpfRh.get(c) || []) : [];
    const resumoSecullum = { nome: f?.Nome ?? null, cpf: mascararCpf(f?.Cpf), admissao: f?.Admissao ?? null, demissao: f?.Demissao ?? null };
    if (candidatos.length === 1) {
      const p = candidatos[0];
      achados.push({ ...resumoSecullum, rh: { id: p.id, nome: p.nome, ativo: p.ativo, tipo: p.tipo_colaborador, empresa: p.empresa } });
    } else if (candidatos.length > 1) {
      cpfRepetidoNoRh.push({ ...resumoSecullum, rh: candidatos.map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo })) });
    } else {
      soNaSecullum.push(resumoSecullum);
    }
  }
  // quem deveria estar na Secullum: CLT ativo da Detech
  const devemBater = rh.filter((p) => p.ativo && p.tipo_colaborador === "Funcionário" && ehDetech(p.empresa));
  const cltSemPar = devemBater.filter((p) => !cpfsDaSecullum.has(soDigitos(p.cpf))).map((p) => ({ id: p.id, nome: p.nome, cpf: mascararCpf(p.cpf) }));
  return {
    resumo: { naSecullum: doPonto.length, cltDetechAtivosNoRh: devemBater.length, achados: devemBater.length - cltSemPar.length, semPar: cltSemPar.length, soNaSecullum: soNaSecullum.length, cpfRepetidoNoRh: cpfRepetidoNoRh.length },
    achados, cltSemPar, soNaSecullum, cpfRepetidoNoRh,
  };
}

// ─── Sincronização: a cópia do ponto no nosso banco ──────────────────────────────────────────────────────────────────────────────────────

type Periodo = { ini: string; fim: string; mes: string };

/** O mês em andamento (do dia 1 até hoje) e, até o dia 5, o mês passado inteiro: é quando a folha dele ainda recebe acerto. */
function periodosDaRodada(hoje: string): Periodo[] {
  const mes = hoje.slice(0, 8) + "01";
  const lista: Periodo[] = [{ ini: mes, fim: hoje, mes }];
  if (Number(hoje.slice(8, 10)) <= 5) {
    const fimAnterior = somaDias(mes, -1);
    const mesAnterior = fimAnterior.slice(0, 8) + "01";
    lista.push({ ini: mesAnterior, fim: fimAnterior, mes: mesAnterior });
  }
  return lista;
}

const ehHoraTxt = (v: string) => /^-?\d{1,4}:\d{2}$/.test(v);
const paraMin = (v: string) => { const neg = v.startsWith("-"); const [h, m] = v.replace("-", "").split(":").map(Number); return (neg ? -1 : 1) * (h * 60 + m); };
const paraHoraTxt = (min: number) => { const a = Math.abs(min); return `${min < 0 ? "-" : ""}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; };

/**
 * O dia de HOJE ainda não terminou, e a Secullum o calcula como se terminasse agora: em 19/11/2026, às 9h, 17 das 20 pessoas já tinham batido a entrada e mesmo
 * assim vinham com "Faltas 08:48" (e atrasos, banco de horas e horas normais parciais). Do dia corrente guardamos só o que é fato — as batidas, a jornada prevista
 * e as marcas do dia — e o resto só entra depois que o dia passa.
 */
const COLUNAS_FIRMES_DE_HOJE = /^(Entrada \d|Saída \d|Carga$|Ajuste$|Abono\d$|JustPa\.$|Folga$)/;

/**
 * Totais do mês em andamento = a soma dos dias que já terminaram (até ontem). Conferido em 19/11/2026 com o mês de outubro inteiro: para as 20 pessoas, a soma
 * dos dias bate exatamente com o `Totais` da Secullum em Normais, Faltas, Atrasos, extras, adicional noturno, DSR, crédito e débito do banco. O saldo do banco
 * (BSaldo) não soma: vale o do último dia fechado.
 */
function totaisDosDias(dias: { dia: string; valores: Record<string, string> }[], hoje: string): Record<string, string> {
  const soma: Record<string, number> = {}; let saldo = "";
  for (const d of [...dias].filter((x) => x.dia < hoje).sort((a, b) => a.dia.localeCompare(b.dia))) {
    for (const [k, v] of Object.entries(d.valores)) {
      if (!ehHoraTxt(v) || /^(Entrada|Saída)/.test(k)) continue;
      // BTotal do dia é o movimento do dia, mas o BTotal do MÊS na Secullum é o saldo final (igual ao BSaldo; conferido em outubro): nenhum dos dois soma
      if (k === "BSaldo") { saldo = v; continue; }
      if (k === "BTotal") continue;
      soma[k] = (soma[k] || 0) + paraMin(v);
    }
  }
  const o: Record<string, string> = {};
  for (const [k, m] of Object.entries(soma)) o[k] = paraHoraTxt(m);
  if (saldo) { o["BSaldo"] = saldo; o["BTotal"] = saldo; }
  return o;
}

/** Transforma o que o `Calcular` devolve em dias e totais por NOME de coluna (as colunas variam por pessoa; só as preenchidas são guardadas). */
function lerCalculo(corpo: any, hoje: string): { dias: { dia: string; valores: Record<string, string> }[]; totais: Record<string, string> } {
  const colunas: string[] = Array.isArray(corpo?.Colunas) ? corpo.Colunas : [];
  const preenchidas = (valores: any[]) => {
    const o: Record<string, string> = {};
    // a coluna 0 é a "Data" em texto ("01/10/2026 - Qui"): o dia vem da chave da linha
    for (let i = 1; i < colunas.length; i++) { const v = valores?.[i]; if (v !== null && v !== undefined && String(v) !== "") o[colunas[i]] = String(v); }
    return o;
  };
  const dias = (Array.isArray(corpo?.Linhas) ? corpo.Linhas : [])
    .map((l: any) => ({ dia: String(l?.Key || "").slice(0, 10), valores: preenchidas(l?.Value || []) }))
    .filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d.dia))
    .map((d: any) => d.dia === hoje ? { dia: d.dia, valores: Object.fromEntries(Object.entries(d.valores).filter(([k]) => COLUNAS_FIRMES_DE_HOJE.test(k))) } : d);
  // mês em andamento: totais pelos dias fechados; mês passado: os totais da própria Secullum
  const ehMesEmAndamento = dias.some((d: any) => d.dia === hoje);
  return { dias, totais: ehMesEmAndamento ? totaisDosDias(dias, hoje) : preenchidas(Array.isArray(corpo?.Totais) ? corpo.Totais : []) };
}

/** Meses fechados a trazer de uma vez ("AAAA-MM", até 3, nenhum mais velho que 6 meses): serve para o RH ter um mês passado completo sem esperar a virada. */
function periodosExtras(pedidos: any, hoje: string): Periodo[] {
  const lista: Periodo[] = [];
  const atual = hoje.slice(0, 8) + "01";
  const seisMesesAtras = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - 6, 1)).toISOString().slice(0, 10);
  for (const p of (Array.isArray(pedidos) ? pedidos : []).slice(0, 3)) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(p || ""));
    if (!m) throw new ErroDeIntegracao(`mês inválido: ${p} (use AAAA-MM)`, 400);
    const mes = `${m[1]}-${m[2]}-01`;
    if (mes >= atual) throw new ErroDeIntegracao("o mês em andamento já é atualizado sempre: peça só meses passados", 400);
    if (mes < seisMesesAtras) throw new ErroDeIntegracao("só dá para trazer os últimos 6 meses", 400);
    const fim = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
    lista.push({ ini: mes, fim, mes });
  }
  return lista;
}

async function acaoSincronizar(origem: "rotina" | "botao", por: string, mesesPedidos: any = []) {
  const sb = banco();
  const agora = Date.now();

  // 1. uma rodada por vez; a que ficou aberta há muito tempo é dada por interrompida
  const limiteInterrompida = new Date(agora - MINUTOS_PARA_DAR_POR_INTERROMPIDA * 60e3).toISOString();
  await sb.from("ponto_rodadas").update({ terminada_em: new Date().toISOString(), ok: false, erro: "a atualização foi interrompida antes de terminar" }).is("terminada_em", null).lt("iniciada_em", limiteInterrompida);
  const { data: abertas } = await sb.from("ponto_rodadas").select("id").is("terminada_em", null).limit(1);
  if (abertas?.length) throw new ErroDeIntegracao("já existe uma atualização do ponto em andamento: espere ela terminar", 409);

  // 2. a conta das consultas da última hora: a Secullum dá 100 por hora ao cálculo e cada pessoa/mês gasta 1
  const { data: recentes } = await sb.from("ponto_rodadas").select("consultas_calculo, iniciada_em, pessoas, ok").gte("iniciada_em", new Date(agora - 3600e3).toISOString()).order("iniciada_em");
  const usadas = (recentes || []).reduce((s: number, r: any) => s + Number(r.consultas_calculo || 0), 0);
  const { data: ultimaBoa } = await sb.from("ponto_rodadas").select("pessoas").eq("ok", true).order("iniciada_em", { ascending: false }).limit(1);
  const periodos = periodosDaRodada(hojeBr());
  for (const extra of periodosExtras(mesesPedidos, hojeBr())) if (!periodos.some((p) => p.mes === extra.mes)) periodos.push(extra);
  const estimativa = Math.max(Number(ultimaBoa?.[0]?.pessoas || 0), 30) * periodos.length;
  if (usadas + estimativa > TETO_DE_CONSULTAS_POR_HORA) {
    const maisAntiga = (recentes || []).find((r: any) => Number(r.consultas_calculo || 0) > 0);
    const minutos = maisAntiga ? Math.max(1, Math.ceil((new Date(maisAntiga.iniciada_em).getTime() + 3600e3 - agora) / 60e3)) : 1;
    throw new ErroDeIntegracao(`a Secullum só deixa 100 consultas de cálculo por hora e a última hora já usou ${usadas}: tente de novo em cerca de ${minutos} minuto(s)`, 429);
  }

  const { data: rodada, error: erroRodada } = await sb.from("ponto_rodadas").insert({ origem, por: por || (origem === "rotina" ? "rotina" : null) }).select("id").single();
  if (erroRodada || !rodada) throw new ErroDeIntegracao(`não foi possível registrar a rodada: ${erroRodada?.message || "sem resposta"}`, 500);

  let consultas = 0, restante: number | null = null, pessoas = 0;
  const erros: { rh_id: string; erro: string }[] = [];
  let semPar: string[] = [], soNaSecullum = 0, fatal = "";
  try {
    const token = await entrarNaSecullum();
    const bancoId = await escolherBanco(token);
    const [doPonto, rhResp] = await Promise.all([
      lerDoPontoWeb(token, bancoId, "Funcionarios?pis="),
      sb.from("rh_funcionarios").select("id, nome, cpf, ativo, tipo_colaborador, empresa"),
    ]);
    if (rhResp.error) throw new ErroDeIntegracao(`não foi possível ler o cadastro do RH: ${rhResp.error.message}`, 500);
    if (!Array.isArray(doPonto)) throw new ErroDeIntegracao("a lista de funcionários da Secullum veio em formato inesperado");

    const rh = (rhResp.data || []) as any[];
    const cpfsDoRh = new Set(rh.map((p) => soDigitos(p.cpf)).filter((c) => c.length === 11));
    // a Secullum por CPF; se o mesmo CPF aparece duas vezes (readmissão), vale o cadastro sem demissão
    const porCpf = new Map<string, any>();
    for (const f of doPonto) {
      const c = soDigitos(f?.Cpf); if (c.length !== 11) continue;
      const atual = porCpf.get(c);
      if (!atual || (atual.Demissao && !f.Demissao)) porCpf.set(c, f);
    }
    soNaSecullum = doPonto.filter((f: any) => !f?.Demissao && !cpfsDoRh.has(soDigitos(f?.Cpf))).length;

    const devem = rh.filter((p) => p.ativo && p.tipo_colaborador === "Funcionário" && ehDetech(p.empresa) && soDigitos(p.cpf).length === 11);
    const semPar_ = rh.filter((p) => p.ativo && p.tipo_colaborador === "Funcionário" && ehDetech(p.empresa) && !porCpf.has(soDigitos(p.cpf)));
    semPar = semPar_.map((p) => p.id);

    parada: for (const p of devem) {
      const f = porCpf.get(soDigitos(p.cpf));
      if (!f) continue;
      let gravouAlgo = false;
      for (const per of periodos) {
        // quem saiu antes do período não tem o que calcular
        if (f.Demissao && String(f.Demissao).slice(0, 10) < per.ini) continue;
        if (restante !== null && restante <= 2) { fatal = "a Secullum avisou que o limite de consultas da hora está no fim: o resto fica para a próxima atualização"; break parada; }
        try {
          consultas++;
          const corpo = await lerDoPontoWeb(token, bancoId, "Calcular", { method: "POST", body: JSON.stringify({ FuncionarioCpf: soDigitos(p.cpf), DataInicial: per.ini, DataFinal: per.fim }) },
            (h) => { const n = Number(h.get("x-rate-limit-remaining")); if (Number.isFinite(n) && h.get("x-rate-limit-remaining") !== null) restante = n; });
          const hoje = hojeBr();
          const { dias, totais } = lerCalculo(corpo, hoje);
          // até que dia os totais valem: ontem, no mês em andamento (hoje ainda não fechou); o último dia, no mês passado
          const ateDia = per.fim === hoje ? (somaDias(hoje, -1) < per.mes ? per.mes : somaDias(hoje, -1)) : per.fim;
          const agoraIso = new Date().toISOString();
          if (dias.length) {
            const { error } = await sb.from("ponto_dias").upsert(dias.map((d) => ({ rh_id: p.id, dia: d.dia, valores: d.valores, atualizado_em: agoraIso })), { onConflict: "rh_id,dia" });
            if (error) throw new ErroDeIntegracao(`não foi possível gravar os dias: ${error.message}`, 500);
          }
          const { error: erroTotais } = await sb.from("ponto_totais").upsert({ rh_id: p.id, mes: per.mes, ate_dia: ateDia, valores: totais, atualizado_em: agoraIso }, { onConflict: "rh_id,mes" });
          if (erroTotais) throw new ErroDeIntegracao(`não foi possível gravar os totais: ${erroTotais.message}`, 500);
          gravouAlgo = true;
        } catch (e) {
          if (e instanceof ErroDeIntegracao && (e.status === 429 || e.status === 401 || e.status === 403 || e.status === 500)) { fatal = e.message; break parada; }
          erros.push({ rh_id: p.id, erro: String((e as Error).message || e).slice(0, 240) });
        }
      }
      if (gravouAlgo) pessoas++;
    }
  } catch (e) {
    fatal = String((e as Error).message || e);
  }

  const ok = !fatal && erros.length === 0;
  await sb.from("ponto_rodadas").update({
    terminada_em: new Date().toISOString(), ok: !fatal, pessoas, consultas_calculo: consultas, restante_na_hora: restante, erro: fatal || null,
    detalhes: { sem_par: semPar, so_na_secullum: soNaSecullum, erros, periodos: periodos.map((p) => p.mes) },
  }).eq("id", rodada.id);
  if (fatal) throw new ErroDeIntegracao(fatal, 502);
  return { rodada: rodada.id, ok, pessoas, consultas, restanteNaHora: restante, semPar: semPar.length, soNaSecullum, erros: erros.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    let corpo: any;
    try { corpo = await req.json(); } catch { return json({ erro: "o pedido veio sem corpo válido" }, 400); }
    const acao = String(corpo?.acao || "");
    if (!["bancos", "cruzar", "sincronizar"].includes(acao)) return json({ erro: "ação desconhecida (use bancos, cruzar ou sincronizar)" }, 400);

    const autorizacao = req.headers.get("Authorization");
    const daRotina = acao === "sincronizar" && await ehARotinaDoBanco(req.headers.get("x-ponto-rotina"));
    if (!daRotina && !(await podeVerRh(autorizacao))) return json({ erro: "só quem tem a aba RH pode consultar o ponto" }, 401);

    if (acao === "sincronizar") {
      const origem = daRotina ? "rotina" : "botao";
      return json(await acaoSincronizar(origem, daRotina ? "rotina" : await nomeDeQuemChamou(autorizacao), corpo?.meses));
    }
    const token = await entrarNaSecullum();
    if (acao === "bancos") return json({ bancos: await listarBancos(token) });
    return json(await acaoCruzar(token, await escolherBanco(token)));
  } catch (e) {
    if (e instanceof ErroDeIntegracao) return json({ erro: e.message }, e.status);
    return json({ erro: String((e as Error)?.message || e) }, 500);
  }
});
