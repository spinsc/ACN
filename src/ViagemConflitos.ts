// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — conflito de veículo e de equipe (pedido do usuário em 04/11/2026, melhorias depois da fatia 3)
//
// Só regra, sem tela nem banco. A mesma pessoa ou o mesmo veículo não pode estar em duas viagens ao mesmo tempo: a Adaptação escolhe a equipe e o veículo na hora de preparar a
// viagem e não via que o carro já estava reservado. Aqui se confere o período de cada viagem (data de saída + os dias do roteiro) e se diz quem se sobrepõe.
// É AVISO, não trava: às vezes a equipe volta de manhã e sai à tarde, e quem decide é a Adaptação.
//   • Contam as viagens que ainda ocupam a equipe e o carro: de Aberta até Andamento. Finalizada e Não aprovada não contam.
//   • Viagem sem data de saída não tem período, então não conflita (a janela da viagem já pede a data para ir à aprovação).
//   • A viagem em Andamento continua ocupando até ser finalizada, mesmo que a data prevista da volta já tenha passado.
// ─────────────────────────────────────────────────────────────────────────────

import { montarRoteiro } from './ViagemRoteiro';
import { statusDaViagem } from './ViagemFluxo';

export type Periodo = { de: string; ate: string };   // dias no formato AAAA-MM-DD, os dois inclusive
export type ConflitoDePessoa = { nome: string; viagem: any; periodo: Periodo };
export type ConflitoDeVeiculo = { viagem: any; periodo: Periodo };

const somarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Quantos dias a viagem ocupa: os do roteiro calculado; sem rota, um dia só (é o que se sabe com certeza). */
export function diasDaViagem(v: any): number {
  try {
    const r = montarRoteiro(v);
    const n = Number(r?.totalDias);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  } catch { return 1; }
}

/** De que dia a que dia a viagem ocupa a equipe e o carro. Nulo = sem data de saída. */
export function periodoDaViagem(v: any, hoje?: string): Periodo | null {
  if (!v?.data_saida) return null;
  const de = String(v.data_saida).slice(0, 10);
  let ate = somarDias(de, diasDaViagem(v) - 1);
  // a viagem que está na estrada ocupa até ser finalizada, mesmo passada da volta prevista
  if (statusDaViagem(v) === 'andamento' && hoje && hoje > ate) ate = hoje;
  return { de, ate };
}

export const seSobrepoem = (a: Periodo, b: Periodo) => a.de <= b.ate && b.de <= a.ate;

const OCUPAM = ['aberta', 'em_aprovacao', 'provisionamento', 'andamento'];

/**
 * Os conflitos de UMA viagem com as outras (a lista pode trazer a própria viagem: ela é ignorada).
 * `equipe` e `frota_id` são os da viagem como está na tela, não os gravados: a pessoa vê o aviso na hora de escolher.
 */
export function conflitosDaViagem(v: any, outras: any[], hoje?: string): { veiculo: ConflitoDeVeiculo[]; pessoas: ConflitoDePessoa[] } {
  const meu = periodoDaViagem(v, hoje);
  const vazio = { veiculo: [] as ConflitoDeVeiculo[], pessoas: [] as ConflitoDePessoa[] };
  if (!meu) return vazio;
  const ids = new Map<string, string>((Array.isArray(v?.equipe) ? v.equipe : []).map((m: any) => [String(m.id), String(m.nome || '—')]));
  const veiculo: ConflitoDeVeiculo[] = [];
  const pessoas: ConflitoDePessoa[] = [];
  for (const o of outras || []) {
    if (!o || (v?.id && String(o.id) === String(v.id))) continue;
    if (!OCUPAM.includes(statusDaViagem(o))) continue;
    const per = periodoDaViagem(o, hoje);
    if (!per || !seSobrepoem(meu, per)) continue;
    if (v?.frota_id && o.frota_id && String(o.frota_id) === String(v.frota_id)) veiculo.push({ viagem: o, periodo: per });
    for (const m of Array.isArray(o.equipe) ? o.equipe : []) {
      if (ids.has(String(m.id))) pessoas.push({ nome: ids.get(String(m.id)) as string, viagem: o, periodo: per });
    }
  }
  return { veiculo, pessoas };
}

const dia = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const textoDoPeriodo = (p: Periodo) => (p.de === p.ate ? dia(p.de) : `${dia(p.de)} a ${dia(p.ate)}`);

/** As frases do aviso, uma por conflito (o veículo primeiro). Vazio = sem conflito. */
export function frasesDosConflitos(c: { veiculo: ConflitoDeVeiculo[]; pessoas: ConflitoDePessoa[] }): string[] {
  const l: string[] = [];
  for (const x of c.veiculo) l.push(`O veículo já está na viagem «${x.viagem.titulo}» (${textoDoPeriodo(x.periodo)}).`);
  // uma frase por pessoa, juntando as viagens em que ela aparece
  const porPessoa = new Map<string, string[]>();
  for (const p of c.pessoas) porPessoa.set(p.nome, [...(porPessoa.get(p.nome) || []), `«${p.viagem.titulo}» (${textoDoPeriodo(p.periodo)})`]);
  for (const [nome, viagens] of porPessoa) l.push(`${nome} já está em ${viagens.join(' e em ')}.`);
  return l;
}
