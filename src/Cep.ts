// ─────────────────────────────────────────────────────────────────────────────
// CEP — formato, consulta e o que ele consegue preencher (cidade e UF)
//
// Pedido do usuário em 01/10/2026 (Etapa 7.13 do PLANO_UX_FLUXO_TRABALHO.md): na
// embalagem do Almoxarifado o CEP passa a ser obrigatório e válido, e a cidade e a
// UF vêm dele. Motivo: 4 das 5 solicitações de frete reais tinham CEP "0000000",
// "000", "0000" e "000000000" e cidade "NAI SEI" / "NAO TEM" — a pessoa não sabia o
// destino e digitou qualquer coisa, o que sujou a cotação e o aproveitamento de
// frete (Etapa 7.12).
//
// Duas fontes públicas, nesta ordem: o ViaCEP e, só se ele não achar ou estiver fora
// do ar, o BrasilAPI. Decisão minha, não confirmada com o usuário: o CEP só é
// declarado INEXISTENTE quando as duas dizem que não conhecem. Se uma fonte cair, a
// fábrica não pode parar de embalar por causa de serviço de terceiro — nesse caso o
// resultado é 'indisponivel' e quem chama segue com o CEP de formato válido.
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoCep =
  | { status: 'ok'; cep: string; cidade: string; uf: string; logradouro: string; bairro: string; fonte: 'viacep' | 'brasilapi' }
  | { status: 'formato' }        // não tem 8 dígitos, ou é só zeros / começa abaixo de 01000-000 (CEP real nenhum)
  | { status: 'inexistente' }    // as duas fontes responderam que não conhecem
  | { status: 'indisponivel' };  // não deu para conferir (rede ou serviço fora do ar)

export function soDigitosCep(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Máscara 00000-000, aplicada enquanto a pessoa digita. */
export function formatarCep(v: unknown): string {
  const d = soDigitosCep(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** 8 dígitos e dentro da faixa dos Correios (o primeiro CEP real é 01000-000): barra "00000-000", "0000000" e parecidos. */
export function cepComFormatoValido(v: unknown): boolean {
  const d = soDigitosCep(v);
  return d.length === 8 && d >= '01000000';
}

// Só guarda resposta definitiva: se o serviço estava fora, a próxima tentativa consulta de novo.
const guardado = new Map<string, ResultadoCep>();

async function pedir(url: string): Promise<{ status: number; json: any } | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 6000);
  try {
    const r = await fetch(url, { signal: controle.signal });
    let json: any = null;
    try { json = await r.json(); } catch { /* corpo que não é JSON conta como sem resposta útil */ }
    return { status: r.status, json };
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

export async function consultarCep(cep: unknown): Promise<ResultadoCep> {
  const d = soDigitosCep(cep);
  if (!cepComFormatoValido(d)) return { status: 'formato' };
  const jaSei = guardado.get(d);
  if (jaSei) return jaSei;
  const definitivo = (r: ResultadoCep) => { guardado.set(d, r); return r; };

  // ViaCEP: para CEP que não conhece, responde 200 com {"erro":"true"} (texto, não booleano)
  const v = await pedir(`https://viacep.com.br/ws/${d}/json/`);
  if (v && v.status === 200 && v.json && !v.json.erro && v.json.localidade && v.json.uf) {
    return definitivo({ status: 'ok', cep: formatarCep(d), cidade: String(v.json.localidade), uf: String(v.json.uf), logradouro: String(v.json.logradouro || ''), bairro: String(v.json.bairro || ''), fonte: 'viacep' });
  }
  const viaCepNaoConhece = !!v && v.status === 200 && !!v.json?.erro;

  // BrasilAPI: segunda opinião — um CEP novo, que o ViaCEP ainda não tem, não pode barrar a embalagem
  const b = await pedir(`https://brasilapi.com.br/api/cep/v2/${d}`);
  if (b && b.status === 200 && b.json?.city && b.json?.state) {
    return definitivo({ status: 'ok', cep: formatarCep(d), cidade: String(b.json.city), uf: String(b.json.state), logradouro: String(b.json.street || ''), bairro: String(b.json.neighborhood || ''), fonte: 'brasilapi' });
  }
  const brasilNaoConhece = !!b && b.status === 404;

  if (viaCepNaoConhece && brasilNaoConhece) return definitivo({ status: 'inexistente' });
  return { status: 'indisponivel' };
}
