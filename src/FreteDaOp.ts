// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// O FRETE E A OP — quando a OP segue para o Comercial e quando o frete vira alerta
//
// Decidido com o usuário em 29/10/2026. Antes, a OP de envio com frete por conta da empresa (CIF) ficava em "Aguardando Cotacao Frete" até a Logística marcar o frete como
// ENTREGUE com o canhoto anexado: o Comercial e o Fiscal só a viam depois que a mercadoria já tinha chegado (em 29/10/2026, 11 OPs estavam paradas ali havia 14 a 24 dias com o frete
// "Em Trânsito"). Agora a OP segue para a liberação comercial assim que o frete SAI (passa a "Em Trânsito"); a entrega com canhoto continua sendo registrada, mas não segura mais a OP.
//
// Duas peças:
//   1) `liberarOpQuandoOFreteSai` — leva a OP de "Aguardando Cotacao Frete" para a liberação comercial (ou direto para o Fiscal, se o faturamento foi antecipado);
//   2) `freteSemEntrega` — o frete que saiu e cuja entrega ninguém confirmou: 5 dias corridos desde a coleta ou a data prevista da entrega já passada (o que vier primeiro).
//      O selo e a faixa da Logística usam esta conta; o aviso na caixa de Menções do vendedor é do banco (função `fretes_avisar_sem_entrega`, rotina de dias úteis às 8h)
//      e repete a MESMA regra — mexeu aqui, mexa lá.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { notificarEvento } from './whatsappHelper';
import { STATUS_COTACAO_FRETE, statusDeLiberacaoComercial } from './FluxoEntrega';
import { opTemRemessas, contarFretesQueNaoSairam, oFreteLiberaAOp } from './Remessas';
import { diaISO, hojeISO } from './Interface';

/** Dias corridos em trânsito, sem entrega confirmada, a partir dos quais o frete vira alerta. */
export const PRAZO_FRETE_SEM_ENTREGA_DIAS = 5;

export type FreteSemEntrega = {
  /** Dias corridos desde a coleta (null se o frete não tem a data da coleta). */
  dias: number | null;
  /** O que disparou o alerta: o prazo desde a coleta ou a data prevista de entrega que já passou. */
  motivo: 'prazo' | 'prevista';
  /** Dias de atraso em relação à data prevista (0 se ela não passou ou não existe). */
  atrasoPrevista: number;
};

const diasEntre = (de: string, ate: string): number => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000);

/** Só o frete de SAÍDA (da venda) que está "Em Trânsito" entra: o que veio de compra tem outro caminho (recebimento). Coluna `data_prevista` é do tipo date: lida direto do texto. */
export function freteSemEntrega(f: any, hoje: string = hojeISO()): FreteSemEntrega | null {
  if (!f || f.direcao !== 'outbound' || f.status !== 'Em Trânsito') return null;
  const dias = f.data_coleta ? diasEntre(diaISO(new Date(f.data_coleta)), hoje) : null;
  const prevista = f.data_prevista ? String(f.data_prevista).slice(0, 10) : null;
  const atrasoPrevista = prevista && prevista < hoje ? diasEntre(prevista, hoje) : 0;
  const passouDoPrazo = dias != null && dias >= PRAZO_FRETE_SEM_ENTREGA_DIAS;
  if (!passouDoPrazo && atrasoPrevista === 0) return null;
  return { dias, motivo: passouDoPrazo ? 'prazo' : 'prevista', atrasoPrevista };
}

/** Frase curta para o selo da linha do frete. */
export function rotuloSemEntrega(a: FreteSemEntrega): string {
  if (a.motivo === 'prazo') return `sem entrega há ${a.dias} dia${a.dias === 1 ? '' : 's'}`;
  return `passou da data prevista (${a.atrasoPrevista} dia${a.atrasoPrevista === 1 ? '' : 's'})`;
}

/** Explicação completa, para a dica do selo. */
export function explicacaoSemEntrega(a: FreteSemEntrega): string {
  const partes: string[] = [];
  if (a.dias != null) partes.push(`Saiu há ${a.dias} dia${a.dias === 1 ? '' : 's'} e a entrega ainda não foi confirmada.`);
  if (a.atrasoPrevista > 0) partes.push(`A data prevista de entrega já passou há ${a.atrasoPrevista} dia${a.atrasoPrevista === 1 ? '' : 's'}.`);
  partes.push('Marque como entregue anexando o canhoto, ou cancele o frete se ele não saiu.');
  return partes.join(' ');
}

export type ResultadoLiberacaoPeloFrete = {
  /** A OP andou de "Aguardando Cotacao Frete" para a etapa nova. */
  avancou: boolean;
  /** Número da OP, quando ela foi encontrada (serve ao recado de acompanhamento). */
  opl?: string;
  /** Etapa nova, quando avancou. */
  status?: string;
  /** 'outros' = a OP tem outro frete que ainda não saiu (remessas): ela espera todos saírem. `abertos` diz quantos faltam. */
  motivo?: 'outros';
  abertos?: number;
  /** Texto do erro, quando não deu para ler ou gravar. Sem erro e sem avanço = nada a fazer (a OP não estava esperando o frete). */
  erro?: string;
};

/**
 * Leva a OP para a liberação comercial quando o frete dela sai ('saida', ao passar a "Em Trânsito") ou, para a OP que ainda estava esperando (frete anterior a esta regra), quando é entregue ('entrega').
 * Só mexe em OP que está em "Aguardando Cotacao Frete"; OP de outra etapa, frete de OS ou de licitação passam sem efeito. A gravação confere a etapa de antes: duas pessoas não passam a mesma OP.
 * OP com envio em remessas: só segue quando NENHUM outro frete dela ficar sem sair (cotação ou aprovação). Se a conferência das remessas falhar, segue mesmo assim (melhor adiantar
 * do que deixar a OP presa sem ninguém para destravar — regra da fatia 5 das remessas, 14/10/2026).
 */
export async function liberarOpQuandoOFreteSai({ frete, quando, usuario }: { frete: any; quando: 'saida' | 'entrega'; usuario: any }): Promise<ResultadoLiberacaoPeloFrete> {
  if (!frete || (frete.vinculo_tipo !== 'op_os' && frete.vinculo_tipo !== 'opl') || !frete.vinculo_id) return { avancou: false };
  // fat_antecipado_em e data_emissao_nf: com o faturamento antecipado a OP não espera o Comercial (statusDeLiberacaoComercial lê esses dois campos)
  const { data: opl, error: erroLeitura } = await supabase.from('oples').select('id,opl,status_geral,fat_antecipado_em,data_emissao_nf').eq('id', frete.vinculo_id).maybeSingle();
  if (erroLeitura) return { avancou: false, erro: erroLeitura.message };
  if (!opl) return { avancou: false };
  if (opl.status_geral !== STATUS_COTACAO_FRETE) return { avancou: false, opl: opl.opl };

  const temRemessas = await opTemRemessas(opl.id);
  const outros = temRemessas ? await contarFretesQueNaoSairam(opl.id, frete.id) : { abertos: 0, erro: null };
  if (temRemessas && !outros.erro && !oFreteLiberaAOp({ temRemessas, outrosFretesAbertos: outros.abertos })) {
    return { avancou: false, opl: opl.opl, motivo: 'outros', abertos: outros.abertos };
  }

  const statusNovo = statusDeLiberacaoComercial(opl);
  // .eq('status_geral', …).select('id'): só pega se a OP ainda estiver esperando o frete naquele instante
  const { data: gravou, error: erroGravacao } = await supabase.from('oples').update({ status_geral: statusNovo }).eq('id', opl.id).eq('status_geral', STATUS_COTACAO_FRETE).select('id');
  if (erroGravacao) return { avancou: false, opl: opl.opl, erro: erroGravacao.message };
  if (!gravou || gravou.length === 0) return { avancou: false, opl: opl.opl };

  logChange({ module: 'logistica', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE', oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: statusNovo }, user: usuario });
  const evento = quando === 'saida' ? 'Frete saiu (em trânsito) — segue para liberação comercial' : 'Frete entregue — segue para liberação comercial';
  const { error: erroHistorico } = await supabase.from('logs_movimentacao_opl').insert({
    opl_id: opl.id, numero_opl: opl.opl, setor: 'Logística', evento,
    status_anterior: opl.status_geral, status_novo: statusNovo,
    usuario_nome: usuario?.nome, data_hora: new Date().toISOString(),
  });
  if (erroHistorico) console.warn('Falha ao gravar o histórico da OP', opl.opl, erroHistorico.message);
  notificarEvento('frete_entregue', quando === 'saida' ? `🚚 Frete da OP ${opl.opl} saiu (em trânsito) — liberada para o Comercial.` : `🚚 Frete da OP ${opl.opl} entregue — liberada para o Comercial.`);
  return { avancou: true, opl: opl.opl, status: statusNovo };
}
