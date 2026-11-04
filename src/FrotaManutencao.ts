// ─────────────────────────────────────────────────────────────────────────────
// FROTA — manutenção e histórico de km dos veículos de viagem (pedido do usuário em 04/11/2026, melhorias depois da fatia 3)
//
// Só regra, sem tela nem banco. Cada veículo da frota tem as manutenções que já fez (revisão, óleo, pneus…) e, em cada uma, pode dizer quando vence a próxima (por km, por data
// ou pelos dois). A tela da frota avisa quando a revisão vence: o carro que passou do km ou da data não deveria ser escolhido para uma viagem longa sem a pessoa saber.
//   • "Vencida": o km atual do veículo já passou do km da próxima revisão, ou a data já passou.
//   • "Perto": faltam 1.000 km ou menos, ou 15 dias ou menos (as margens são minhas; o usuário ajusta).
//   • A próxima revisão vale a da manutenção mais recente que a definiu. Sem nenhuma definida, o veículo fica "sem revisão marcada" (não é alerta).
// O histórico de km vem das próprias viagens finalizadas (km de saída e de volta), então não há tabela nova para ele.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_DE_MANUTENCAO = ['Revisão', 'Troca de óleo', 'Pneus', 'Freios', 'Elétrica', 'Funilaria e pintura', 'Outro'];

export const MARGEM_PERTO_KM = 1000;
export const MARGEM_PERTO_DIAS = 15;

export type SituacaoDaRevisao = { estado: 'vencida' | 'perto' | 'ok' | 'sem'; texto: string; proximaKm: number | null; proximaData: string | null };

const diaBR = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
const dias = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
const temValor = (x: any) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));

/** A manutenção mais recente que definiu uma próxima revisão (por km ou por data). */
export function ultimaComProxima(manutencoes: any[]): any | null {
  const l = (manutencoes || []).filter(m => temValor(m.proxima_km) || !!m.proxima_data);
  l.sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
  return l[0] || null;
}

/** Em que pé está a revisão do veículo. `manutencoes` são só as dele. */
export function situacaoDaRevisao(veiculo: any, manutencoes: any[], hoje: string): SituacaoDaRevisao {
  const m = ultimaComProxima(manutencoes);
  if (!m) return { estado: 'sem', texto: 'Sem revisão marcada', proximaKm: null, proximaData: null };
  const proximaKm = temValor(m.proxima_km) ? Number(m.proxima_km) : null;
  const proximaData = m.proxima_data ? String(m.proxima_data).slice(0, 10) : null;
  const kmAtual = temValor(veiculo?.km_atual) ? Number(veiculo.km_atual) : null;
  const motivos: string[] = [];
  let estado: SituacaoDaRevisao['estado'] = 'ok';
  if (proximaKm !== null && kmAtual !== null) {
    const falta = proximaKm - kmAtual;
    if (falta <= 0) { estado = 'vencida'; motivos.push(`passou ${Math.abs(falta).toLocaleString('pt-BR')} km do combinado (${proximaKm.toLocaleString('pt-BR')} km)`); }
    else if (falta <= MARGEM_PERTO_KM) { if (estado === 'ok') estado = 'perto'; motivos.push(`faltam ${falta.toLocaleString('pt-BR')} km (${proximaKm.toLocaleString('pt-BR')} km)`); }
  }
  if (proximaData) {
    const falta = dias(hoje, proximaData);
    if (falta < 0) { estado = 'vencida'; motivos.push(`venceu em ${diaBR(proximaData)}`); }
    else if (falta <= MARGEM_PERTO_DIAS) { if (estado === 'ok') estado = 'perto'; motivos.push(falta === 0 ? 'vence hoje' : `vence em ${falta} dia(s) (${diaBR(proximaData)})`); }
  }
  if (estado === 'ok') {
    const partes = [proximaKm !== null ? `${proximaKm.toLocaleString('pt-BR')} km` : '', proximaData ? diaBR(proximaData) : ''].filter(Boolean);
    return { estado, texto: `Próxima revisão: ${partes.join(' ou ')}`, proximaKm, proximaData };
  }
  return { estado, texto: (estado === 'vencida' ? 'Revisão vencida: ' : 'Revisão perto: ') + motivos.join('; '), proximaKm, proximaData };
}

/** Confere uma manutenção antes de gravar. Devolve a frase do erro, ou '' se está certa. */
export function erroDaManutencao(f: any, hoje: string): string {
  if (!f?.frota_id) return 'Escolha o veículo.';
  if (!f?.data) return 'Informe a data da manutenção.';
  if (String(f.data) > hoje) return 'A data da manutenção não pode ser no futuro (para agendar, use a "próxima revisão").';
  if (!String(f?.tipo || '').trim()) return 'Escolha o tipo da manutenção.';
  for (const [campo, rotulo] of [['km', 'O km'], ['custo', 'O custo'], ['proxima_km', 'O km da próxima revisão']] as const) {
    if (temValor(f[campo]) && Number(f[campo]) < 0) return `${rotulo} não pode ser negativo.`;
  }
  if (f.proxima_data && String(f.proxima_data) < String(f.data)) return 'A data da próxima revisão não pode ser antes da manutenção.';
  if (temValor(f.proxima_km) && temValor(f.km) && Number(f.proxima_km) <= Number(f.km)) return 'O km da próxima revisão tem que ser maior que o km da manutenção.';
  return '';
}

/** A linha que vai ao banco: números ou nulo, textos aparados. */
export function linhaDaManutencao(f: any, por: string | null) {
  const n = (x: any) => (temValor(x) ? Number(x) : null);
  return {
    frota_id: f.frota_id, data: f.data, tipo: String(f.tipo).trim(), descricao: String(f.descricao || '').trim() || null,
    km: n(f.km), custo: n(f.custo), proxima_km: n(f.proxima_km), proxima_data: f.proxima_data || null, criado_por_nome: por,
  };
}

/** As viagens finalizadas do veículo, da mais recente à mais antiga, com o km rodado de cada uma e o total. */
export function historicoDeKm(viagens: any[], frotaId: string) {
  const l = (viagens || [])
    .filter(v => String(v.frota_id) === String(frotaId) && v.status === 'finalizada')
    .map(v => {
      const saida = temValor(v.km_saida) ? Number(v.km_saida) : null;
      const volta = temValor(v.km_volta) ? Number(v.km_volta) : null;
      return { id: v.id, titulo: v.titulo, data: v.data_saida || null, saida, volta, rodado: saida !== null && volta !== null && volta >= saida ? volta - saida : null };
    })
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return { viagens: l, totalRodado: l.reduce((s, x) => s + (x.rodado || 0), 0) };
}
