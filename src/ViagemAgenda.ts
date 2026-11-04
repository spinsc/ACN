// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a agenda: quem está onde (pedido do usuário em 04/11/2026, melhorias 2)
//
// Só regra, sem tela nem banco. Monta o calendário de um período (14 dias a partir de um dia): uma linha para cada veículo da frota e uma para cada pessoa que aparece numa viagem,
// com a barra de cada viagem nos dias que ela ocupa (a mesma conta do aviso de conflito, ViagemConflitos.ts). Serve para enxergar o carro e a equipe livres ANTES de escolher.
//   • Entram as viagens que ainda ocupam equipe e carro: de Aberta até Andamento, com data de saída. Finalizada e Não aprovada ficam de fora.
//   • Duas barras da mesma linha que se sobrepõem são conflito: ficam em "faixas" separadas (uma embaixo da outra) e a linha é marcada.
//   • Viagem sem veículo da frota aparece na linha "Sem veículo definido" (que nunca marca conflito: não se sabe de qual carro se trata).
// ─────────────────────────────────────────────────────────────────────────────
import { periodoDaViagem, seSobrepoem } from './ViagemConflitos';
import { statusDaViagem } from './ViagemFluxo';

export type Barra = { viagem: any; de: number; ate: number; faixa: number; deOntem: boolean; paraDepois: boolean };
export type LinhaDaAgenda = { chave: string; rotulo: string; sub?: string; barras: Barra[]; faixas: number; conflito: boolean };

const OCUPAM = ['aberta', 'em_aprovacao', 'provisionamento', 'andamento'];

export const somarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diferenca = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);

/** A segunda-feira da semana do dia dado (a agenda começa sempre numa segunda). */
export function segundaDaSemana(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();   // 0 = domingo
  return somarDias(iso, dow === 0 ? -6 : 1 - dow);
}

export const diasDaAgenda = (inicio: string, n: number) => Array.from({ length: n }, (_, i) => somarDias(inicio, i));

/** Coloca as barras de uma linha em faixas, de modo que as que se sobrepõem fiquem em faixas diferentes; diz quantas faixas e se houve sobreposição. */
function empilhar(barras: Omit<Barra, 'faixa'>[]): { barras: Barra[]; faixas: number; conflito: boolean } {
  const ordenadas = [...barras].sort((a, b) => a.de - b.de || a.ate - b.ate);
  const fimDaFaixa: number[] = [];
  let conflito = false;
  const saida: Barra[] = ordenadas.map(b => {
    let f = fimDaFaixa.findIndex(fim => fim < b.de);
    if (f === -1) { fimDaFaixa.push(b.ate); f = fimDaFaixa.length - 1; if (f > 0) conflito = true; } else fimDaFaixa[f] = b.ate;
    return { ...b, faixa: f };
  });
  return { barras: saida, faixas: Math.max(1, fimDaFaixa.length), conflito };
}

export function montarAgenda(viagens: any[], frota: any[], inicio: string, dias: number, hoje: string) {
  const fim = somarDias(inicio, dias - 1);
  const janela = { de: inicio, ate: fim };
  const visiveis = (viagens || []).filter(v => OCUPAM.includes(statusDaViagem(v))).map(v => ({ v, per: periodoDaViagem(v, hoje) })).filter((x: any) => x.per && seSobrepoem(x.per, janela));
  const barraDe = (x: any): Omit<Barra, 'faixa'> => {
    const de = Math.max(0, diferenca(inicio, x.per.de)), ate = Math.min(dias - 1, diferenca(inicio, x.per.ate));
    return { viagem: x.v, de, ate, deOntem: x.per.de < inicio, paraDepois: x.per.ate > fim };
  };

  const veiculos: LinhaDaAgenda[] = [];
  for (const f of (frota || []).filter(f => f.ativo || visiveis.some((x: any) => String(x.v.frota_id) === String(f.id)))) {
    const e = empilhar(visiveis.filter((x: any) => String(x.v.frota_id) === String(f.id)).map(barraDe));
    veiculos.push({ chave: 'v' + f.id, rotulo: f.apelido, sub: f.placa, ...e });
  }
  const semVeiculo = visiveis.filter((x: any) => !x.v.frota_id).map(barraDe);
  if (semVeiculo.length) { const e = empilhar(semVeiculo); veiculos.push({ chave: 'sem', rotulo: 'Sem veículo definido', ...e, conflito: false }); }

  const gente = new Map<string, string>();
  for (const x of visiveis as any[]) for (const m of Array.isArray(x.v.equipe) ? x.v.equipe : []) gente.set(String(m.id), String(m.nome || '—'));
  const pessoas: LinhaDaAgenda[] = [...gente.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, nome]) => {
    const e = empilhar(visiveis.filter((x: any) => (Array.isArray(x.v.equipe) ? x.v.equipe : []).some((m: any) => String(m.id) === id)).map(barraDe));
    return { chave: 'p' + id, rotulo: nome, ...e };
  });

  return { dias: diasDaAgenda(inicio, dias), veiculos, pessoas, total: visiveis.length };
}
