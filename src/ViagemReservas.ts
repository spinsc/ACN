// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — reserva do veículo para uso interno (pedido do usuário em 04/11/2026)
//
// O carro da frota às vezes fica ocupado um dia ou mais FORA de viagem (buscar material, levar material, visita, reparo). Essa ocupação entra na Agenda como barra do veículo
// e conta no aviso de conflito: assim a Adaptação enxerga o choque com as viagens e remaneja (outro carro ou outra data). Decidido com o usuário:
//   • quem marca: quem tem a aba Viagens (pela Agenda) e quem abre uma demanda geral (pelo quadro "Veículo" da demanda); a reserva ligada à demanda leva o título dela;
//   • reservar o carro num dia em que ele já está em viagem GRAVA e avisa em vermelho; quem fica TRAVADA é a viagem: "A equipe saiu" não passa enquanto houver reserva ativa do mesmo
//     veículo nos dias da viagem (trava com a mesma lista de "o que falta" de faltaParaMover, ViagemFluxo.ts);
//   • a reserva se CANCELA (quem e quando ficam guardados), nunca se apaga; a da demanda geral cancelada se cancela sozinha (gatilho do banco);
//   • só conta reserva ATIVA; os dois dias (início e fim) valem. A regra de período é a mesma da viagem (ViagemConflitos.ts).
// Este arquivo não é importado pelo ViagemFluxo (para não haver volta de importação): quem precisa da trava calcula `travaPorReserva` aqui e passa o texto para faltaParaMover.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { periodoDaViagem, seSobrepoem, textoDoPeriodo, type Periodo } from './ViagemConflitos';
import { statusDaViagem } from './ViagemFluxo';

export const MOTIVOS_DE_USO = ['Buscar material', 'Levar material', 'Visita ou reunião externa', 'Reparo ou revisão do veículo', 'Outro'];

export type Reserva = {
  id?: string; frota_id: string; data_inicio: string; data_fim: string; motivo: string; observacao?: string | null; responsavel_nome?: string | null;
  demanda_id?: string | null; demanda_titulo?: string | null; status?: string; cancelada_em?: string | null; cancelada_por_nome?: string | null; motivo_cancelamento?: string | null;
  criado_por_nome?: string | null; criado_em?: string | null;
};

const OCUPAM = ['aberta', 'em_aprovacao', 'provisionamento', 'andamento'];
const dia = (v: any) => String(v || '').slice(0, 10);

export const reservaAtiva = (r: any) => !!r && r.status !== 'cancelada';
export const periodoDaReserva = (r: any): Periodo => ({ de: dia(r?.data_inicio), ate: dia(r?.data_fim) });

/** O que aparece na barra da Agenda e nas listas: o motivo (e o título da demanda, quando nasceu de uma). */
export const rotuloDaReserva = (r: any) => `${r?.motivo || 'Uso interno'}${r?.demanda_titulo ? ' — ' + r.demanda_titulo : ''}`;

/** A frase do aviso: qual reserva, quais dias e com quem está o carro. */
export function fraseDaReserva(r: any): string {
  const com = r?.responsavel_nome ? `, com ${r.responsavel_nome}` : '';
  return `O veículo está reservado para uso interno (${rotuloDaReserva(r)}) de ${textoDoPeriodo(periodoDaReserva(r))}${com}.`;
}

/** As reservas ativas do mesmo veículo que caem nos dias da viagem (a viagem como está na tela, não a gravada). */
export function reservasQueConflitam(v: any, reservas: any[], hoje?: string): any[] {
  if (!v?.frota_id) return [];
  const meu = periodoDaViagem(v, hoje);
  if (!meu) return [];
  return (reservas || []).filter(r => reservaAtiva(r) && String(r.frota_id) === String(v.frota_id) && seSobrepoem(meu, periodoDaReserva(r)));
}

/** As viagens que ainda ocupam o carro (Aberta até Andamento) nos dias da reserva. */
export function viagensQueConflitam(r: { frota_id: any; data_inicio: any; data_fim: any }, viagens: any[], hoje?: string): any[] {
  if (!r?.frota_id || !r.data_inicio || !r.data_fim || dia(r.data_fim) < dia(r.data_inicio)) return [];
  const per = periodoDaReserva(r);
  return (viagens || []).filter(v => v && String(v.frota_id || '') === String(r.frota_id) && OCUPAM.includes(statusDaViagem(v)) && (() => { const p = periodoDaViagem(v, hoje); return !!p && seSobrepoem(per, p); })());
}

/** Outras reservas ativas do mesmo veículo que se sobrepõem a esta (a própria, se já gravada, é ignorada). */
export function reservasQueSeSobrepoem(r: { id?: any; frota_id: any; data_inicio: any; data_fim: any }, reservas: any[]): any[] {
  if (!r?.frota_id || !r.data_inicio || !r.data_fim || dia(r.data_fim) < dia(r.data_inicio)) return [];
  const per = periodoDaReserva(r);
  return (reservas || []).filter(o => reservaAtiva(o) && (!r.id || String(o.id) !== String(r.id)) && String(o.frota_id) === String(r.frota_id) && seSobrepoem(per, periodoDaReserva(o)));
}

/** As frases do aviso de conflito da viagem por causa das reservas (vão junto das frases das outras viagens). */
export const frasesDeReserva = (v: any, reservas: any[], hoje?: string): string[] => reservasQueConflitam(v, reservas, hoje).map(fraseDaReserva);

/** O que a trava de saída da viagem lista por causa das reservas (vazio = nenhuma reserva em cima). Vai como 3º argumento de faltaParaMover / saidaPertoComFalta. */
export function travaPorReserva(v: any, reservas: any[], hoje?: string): string[] {
  return reservasQueConflitam(v, reservas, hoje).map(r => `liberar o veículo, que está reservado para uso interno (${rotuloDaReserva(r)}) de ${textoDoPeriodo(periodoDaReserva(r))} (Adaptação: trocar o veículo ou a data)`);
}

/** O que falta para a reserva poder ser gravada; vazio = pode. Reserva nova não nasce já vencida (o último dia já passou). */
export function erroDaReserva(f: any, hoje: string, nova: boolean): string {
  if (!f?.frota_id) return 'Escolha o veículo.';
  if (!dia(f.data_inicio) || !dia(f.data_fim)) return 'Informe o primeiro e o último dia de uso.';
  if (dia(f.data_fim) < dia(f.data_inicio)) return 'O último dia não pode ser antes do primeiro.';
  if (nova && dia(f.data_fim) < hoje) return 'O último dia já passou: informe um período a partir de hoje.';
  if (!MOTIVOS_DE_USO.includes(String(f.motivo || ''))) return 'Escolha o motivo do uso.';
  if (f.motivo === 'Outro' && !String(f.observacao || '').trim()) return 'Em "Outro", conte na observação para que o veículo vai ser usado.';
  if (!String(f.responsavel_nome || '').trim()) return 'Diga quem vai estar com o veículo.';
  return '';
}

// ── banco ────────────────────────────────────────────────────────────────────
const somarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** As reservas ativas que ainda interessam (as que terminaram há mais de 60 dias ficam de fora). Leitura recusada devolve o erro, nunca "sem reserva" calado. */
export async function lerReservas(hoje: string): Promise<{ lista: any[]; erro: string }> {
  const { data, error } = await supabase.from('frota_reservas').select('*').eq('status', 'ativa').gte('data_fim', somarDias(hoje, -60)).order('data_inicio');
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}

/** Todas as reservas de uma demanda geral (as canceladas também, para a lista contar o que houve). */
export async function lerReservasDaDemanda(demandaId: string): Promise<{ lista: any[]; erro: string }> {
  const { data, error } = await supabase.from('frota_reservas').select('*').eq('demanda_id', demandaId).order('data_inicio', { ascending: false });
  if (error) return { lista: [], erro: error.message };
  return { lista: data || [], erro: '' };
}

/** Grava a reserva (nova ou editada). A editada só vale se ainda estiver ativa. */
export async function gravarReserva(f: any, usuario: any): Promise<{ erro: string; id?: string }> {
  const agora = new Date().toISOString();
  const por = usuario?.nome || usuario?.email || null;
  const linha = {
    frota_id: f.frota_id, data_inicio: dia(f.data_inicio), data_fim: dia(f.data_fim), motivo: f.motivo, observacao: String(f.observacao || '').trim() || null,
    responsavel_nome: String(f.responsavel_nome || '').trim() || null, demanda_id: f.demanda_id || null, demanda_titulo: f.demanda_titulo || null,
  };
  if (f.id) {
    const { data, error } = await supabase.from('frota_reservas').update({ ...linha, atualizado_em: agora, atualizado_por_nome: por }).eq('id', f.id).eq('status', 'ativa').select('id').maybeSingle();
    if (error || !data) return { erro: 'Não foi possível salvar a reserva: ' + (error?.message || 'ela foi cancelada ou mudou enquanto você olhava; feche e abra de novo.') };
    logChange({ module: 'viagens', entityType: 'frota_reservas', entityId: f.id, changeType: 'UPDATE', oldRow: null, newRow: linha, user: usuario });
    return { erro: '', id: f.id };
  }
  const { data, error } = await supabase.from('frota_reservas').insert([{ ...linha, criado_por_nome: por, atualizado_por_nome: por }]).select('id').single();
  if (error || !data) return { erro: 'Não foi possível salvar a reserva: ' + (error?.message || 'o banco não confirmou a gravação') };
  logChange({ module: 'viagens', entityType: 'frota_reservas', entityId: data.id, changeType: 'INSERT', oldRow: null, newRow: linha, user: usuario });
  return { erro: '', id: data.id };
}

/** Cancela a reserva (nada se apaga): guarda quem, quando e o porquê. Só cancela se ainda estiver ativa. */
export async function cancelarReserva(r: any, motivo: string, usuario: any): Promise<{ erro: string }> {
  const agora = new Date().toISOString();
  const por = usuario?.nome || usuario?.email || null;
  const { data, error } = await supabase.from('frota_reservas').update({ status: 'cancelada', cancelada_em: agora, cancelada_por_nome: por, motivo_cancelamento: motivo || null, atualizado_em: agora, atualizado_por_nome: por })
    .eq('id', r.id).eq('status', 'ativa').select('id').maybeSingle();
  if (error || !data) return { erro: 'Não foi possível cancelar a reserva: ' + (error?.message || 'ela já foi cancelada; feche e abra de novo.') };
  logChange({ module: 'viagens', entityType: 'frota_reservas', entityId: r.id, changeType: 'UPDATE', field: 'status', oldRow: { status: 'ativa' }, newRow: { status: 'cancelada', motivo_cancelamento: motivo || null }, user: usuario });
  return { erro: '' };
}
