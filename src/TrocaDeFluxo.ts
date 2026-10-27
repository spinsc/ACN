// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TROCAR O FLUXO DE UMA UNIDADE DEPOIS DE CRIADA (fluxo misto, etapa M3 — pedido do usuário em 27/10/2026; PLANO_FLUXO_MISTO.md)
//
// A venda mista nasce com cada unidade no fluxo do seu grupo (FluxoMisto.ts). Quando a realidade muda (o carro que ia ser adaptado aqui passou a ser enviado, ou o contrário),
// trocar só o campo "Fluxo de entrega" na edição deixa a OP incoerente: o envio fica com chassi e mão de obra, a adaptação fica sem destino certo, e ninguém é avisado.
// Esta é a regra da troca com as consequências, decidida com o usuário em 27/10/2026:
//   • só vale até o Almoxarifado fechar o kit (Em Espera PCP, Devolvida PCP e Aguardando Almox): depois a unidade já tem material separado e serial;
//   • a mão de obra SAI com a unidade quando ela passa a ser envio (como na criação: o envio não tem M.O.); na volta para a produção a pessoa informa o valor;
//   • o que a unidade perde (chassi, placa, fotos, M.O.…) é mostrado ANTES e fica no histórico e na auditoria, nunca some calado;
//   • o frete único das unidades de envio NÃO é desta etapa: a Logística já sugere juntar fretes do mesmo destino e da mesma semana (AproveitamentoFrete.ts).
// Este módulo é a regra (planejar) e a gravação (trocar); a janela está em TrocarFluxoModal.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import { FLUXOS, soEnvio, terminaEmEnvio, fluxoLabel, TIPO_VENDA_ENVIO } from './FluxoEntrega';
import { exigeEnderecoCompleto, enderecoQueFalta } from './EnderecoEntrega';
import { CAMPOS_DESTINO, ajustarOpPeloFluxoDoGrupo, fluxoDaOp, ehUnidadeDeProducao, destinoVazio } from './FluxoMisto';
import { cepParaGravar } from './Cep';

/** Etapas em que a unidade ainda pode trocar de fluxo: nada foi separado nem produzido. Decidido com o usuário em 27/10/2026 ("até o Almoxarifado fechar o kit"). */
export const STATUS_QUE_PERMITEM_TROCAR = ['Em Espera PCP', 'Devolvida PCP', 'Aguardando Almox'];

const limpo = (v: any) => String(v ?? '').trim();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const moeda = (v: any) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A unidade pode trocar de fluxo agora? Devolve o motivo em português quando não pode.
 *  `remessasAtivas`: quantas remessas parciais a OP tem (envio com remessa não troca de fluxo no meio); `erroRemessas`: a leitura falhou — na dúvida, não troca.
 */
export function podeTrocarFluxo(op: any, { remessasAtivas = 0, erroRemessas = '' }: { remessasAtivas?: number; erroRemessas?: string } = {}): { pode: boolean; motivo: string } {
  if (!op?.id) return { pode: false, motivo: 'Não consegui identificar a OP.' };
  if (op.tipo_projeto === TIPO_VENDA_ENVIO) return { pode: false, motivo: 'Venda para Envio é sempre envio de material: o fluxo desta OP não muda.' };
  if (!STATUS_QUE_PERMITEM_TROCAR.includes(op.status_geral)) {
    return { pode: false, motivo: `A OP está em "${op.status_geral || 'sem status'}". O fluxo só pode ser trocado até o Almoxarifado fechar o kit (Em Espera PCP, Devolvida PCP e Aguardando Almox): depois disso a unidade já tem material separado ou serial.` };
  }
  if (erroRemessas) return { pode: false, motivo: `Não foi possível conferir as remessas desta OP (${erroRemessas}). Tente de novo.` };
  if (remessasAtivas > 0) return { pode: false, motivo: 'Esta OP já tem remessa de envio registrada; cancele as remessas antes de trocar o fluxo.' };
  const partes = op.envio_partes;
  if (partes && typeof partes === 'object' && Object.keys(partes).length > 0) return { pode: false, motivo: 'Esta OP já tem uma parte embalada (venda composta entre Almoxarifado e Telecom); o fluxo não pode mais ser trocado.' };
  return { pode: true, motivo: '' };
}

/** Os fluxos para onde a unidade pode ir (todos, menos o de hoje). */
export const fluxosDeDestino = (op: any) => FLUXOS.filter(f => f.valor !== fluxoDaOp(op));

/** A mão de obra que as outras unidades de produção do lote levam (sugestão para a unidade que volta à produção). Vazio quando nenhuma tem. */
export function moSugerida(irmas: any[]): number | null {
  const com = (irmas || []).find(o => ehUnidadeDeProducao(o) && num(o.valor_mao_de_obra) > 0);
  return com ? num(com.valor_mao_de_obra) : null;
}

/** O destino e o frete que o formulário já traz preenchidos: o das irmãs que já estão no fluxo escolhido (mesmo destino do grupo) ou, na falta delas, o da própria unidade. */
export function destinoInicial(op: any, irmas: any[], novoFluxo: string) {
  const irma = (irmas || []).find(o => fluxoDaOp(o) === novoFluxo && (limpo(o.destino_cidade) || limpo(o.destino_cep) || limpo(o.frete_responsavel)));
  const fonte = irma || op || {};
  const d: any = destinoVazio();
  for (const c of CAMPOS_DESTINO) d[c] = limpo(fonte[c]);
  d.frete_responsavel = fonte.frete_responsavel === 'CIF' || fonte.frete_responsavel === 'FOB' ? fonte.frete_responsavel : '';
  return d;
}

export type Perda = { campo: string; rotulo: string; texto: string };
export type PlanoDaTroca = {
  erro?: string;                         // impede a troca (a frase diz o que falta)
  patch: Record<string, any>;            // o que será gravado na OP
  perde: Perda[];                        // o que a unidade tinha e fica em branco
  moQueSai: number;                      // R$ de mão de obra que sai com a unidade (soma das duas)
  avisos: string[];
};

/**
 * Planeja a troca: o que a OP passa a gravar, o que ela perde e o que impede. NÃO grava nada.
 *  • para um fluxo que termina em envio: exige CIF ou FOB, e o endereço completo no envio de material com CIF (a mesma regra da criação);
 *  • para um fluxo de envio puro: a unidade fica sem chassi, placa, data de chegada, fotos, M.O. e serviço de terceiro (FluxoMisto.ajustarOpPeloFluxoDoGrupo);
 *  • de envio puro para a produção: a M.O. vem de `moNova` (em branco = a unidade fica sem M.O.);
 *  • de um fluxo que termina em envio para um que não termina: o destino volta a ser o da venda (o de uma irmã de produção), se há; sem irmã, fica como está e a janela avisa;
 *  • o veículo obrigatório segue a configuração da Administração para o fluxo novo (`veiculoObrigatorio`).
 */
export function planejarTroca({ op, irmas = [], novoFluxo, destino, moNova = null, veiculoObrigatorio = false }:
  { op: any; irmas?: any[]; novoFluxo: string; destino?: any; moNova?: number | null; veiculoObrigatorio?: boolean }): PlanoDaTroca {
  const vazio = (erro: string): PlanoDaTroca => ({ erro, patch: {}, perde: [], moQueSai: 0, avisos: [] });
  const atual = fluxoDaOp(op);
  if (!novoFluxo || !FLUXOS.some(f => f.valor === novoFluxo)) return vazio('Escolha o novo fluxo da unidade.');
  if (novoFluxo === atual) return vazio('A unidade já está nesse fluxo.');
  const d = destino || destinoVazio();

  if (terminaEmEnvio(novoFluxo)) {
    if (d.frete_responsavel !== 'CIF' && d.frete_responsavel !== 'FOB') return vazio('Informe quem paga o frete: CIF (a empresa) ou FOB (o cliente).');
    if (exigeEnderecoCompleto('', novoFluxo, d.frete_responsavel)) {
      const falta = enderecoQueFalta(d);
      if (falta.length) return vazio(`Envio de material com frete por conta da empresa: informe o endereço de entrega. Falta: ${falta.join(', ')}.`);
    }
  }
  if (veiculoObrigatorio && !soEnvio(novoFluxo) && !op?.veiculo_id) {
    return vazio(`O fluxo "${fluxoLabel(novoFluxo)}" exige o veículo cadastrado e esta unidade não tem. Informe o veículo em "Editar OP" e tente de novo.`);
  }

  const patch: Record<string, any> = ajustarOpPeloFluxoDoGrupo({}, { fluxo: novoFluxo, destino: d }, cepParaGravar);
  const perde: Perda[] = [];
  const avisos: string[] = [];
  let moQueSai = 0;

  if (soEnvio(novoFluxo) && !soEnvio(atual)) {
    // vira envio puro: o que só existe na produção sai, e a M.O. sai junto (decidido em 27/10/2026)
    patch.tipos_servico_terceiro = [];
    const fotos = Array.isArray(op?.fotos_veiculo) ? op.fotos_veiculo.length : 0;
    const registra = (campo: string, rotulo: string, texto: string | null) => { if (texto) perde.push({ campo, rotulo, texto }); };
    registra('chassi', 'Chassi', limpo(op?.chassi) ? `chassi ${limpo(op.chassi)}` : null);
    registra('placa', 'Placa', limpo(op?.placa) ? `placa ${limpo(op.placa)}` : null);
    registra('data_chegada_veiculo', 'Chegada do veículo', limpo(op?.data_chegada_veiculo) ? `chegada do veículo em ${String(op.data_chegada_veiculo).slice(0, 10).split('-').reverse().join('/')}` : null);
    registra('fotos_veiculo', 'Fotos de entrada', fotos > 0 ? `${fotos} foto(s) de entrada do veículo` : null);
    registra('valor_mao_de_obra', 'Mão de obra', num(op?.valor_mao_de_obra) > 0 ? `mão de obra de ${moeda(op.valor_mao_de_obra)}` : null);
    registra('valor_mao_de_obra_serralheria', 'Mão de obra da serralheria', num(op?.valor_mao_de_obra_serralheria) > 0 ? `mão de obra da serralheria de ${moeda(op.valor_mao_de_obra_serralheria)}` : null);
    registra('servico_terceiro', 'Serviço de terceiro', op?.servico_terceiro ? 'a marca de serviço de terceiro' : null);
    moQueSai = num(op?.valor_mao_de_obra) + num(op?.valor_mao_de_obra_serralheria);
  } else if (!soEnvio(novoFluxo) && soEnvio(atual)) {
    // volta para a produção: a M.O. é informada na troca (as irmãs de produção dão a sugestão); chassi e placa se lançam depois, como em qualquer unidade
    patch.valor_mao_de_obra = moNova != null && moNova > 0 ? moNova : null;
    if (patch.valor_mao_de_obra == null) avisos.push('A unidade volta para a produção sem mão de obra: a comissão não a conta até alguém lançar o valor.');
    avisos.push('Chassi, placa e data de chegada do veículo ficam em branco: lance depois, como em qualquer unidade de produção.');
  }

  if (terminaEmEnvio(atual) && !terminaEmEnvio(novoFluxo)) {
    // sai de um fluxo de envio para a produção sem envio: o destino volta a ser o da venda (o de uma irmã que não envia); o frete deixa de valer
    const irma = (irmas || []).find(o => ehUnidadeDeProducao(o) && !terminaEmEnvio(fluxoDaOp(o)));
    if (irma) {
      for (const c of CAMPOS_DESTINO) patch[c] = limpo(irma[c]) || null;
      patch.destino_cep = cepParaGravar(irma.destino_cep);
      avisos.push(`O destino de entrega volta a ser o da venda (o da ${irma.opl}), porque a unidade deixa de ser enviada.`);
    } else if (CAMPOS_DESTINO.some(c => limpo(op?.[c]))) {
      avisos.push('Nenhuma outra unidade do lote fica na produção para servir de modelo: o destino de entrega desta unidade continua como estava. Ajuste em "Editar OP" se for outro.');
    }
    if (op?.frete_responsavel) perde.push({ campo: 'frete_responsavel', rotulo: 'Frete', texto: `frete ${op.frete_responsavel}` });
  }

  if (op?.kit_conferencia?.linhas?.some?.((l: any) => limpo(l?.seriais))) {
    avisos.push('O Almoxarifado já salvou parte da separação (seriais) desta unidade; ela continua valendo.');
  }
  return { patch, perde, moQueSai, avisos };
}

/** O texto do histórico da OP: o fluxo de antes e de depois, o que ficou em branco e o motivo. */
export function textoDaTroca(op: any, plano: PlanoDaTroca, novoFluxo: string, motivo: string, quem: string): string {
  const partes = [`Fluxo de entrega trocado por ${quem || '—'}: ${fluxoLabel(fluxoDaOp(op) || null)} → ${fluxoLabel(novoFluxo)}.`];
  if (terminaEmEnvio(novoFluxo)) partes.push(`Frete ${plano.patch.frete_responsavel || '—'}${plano.patch.destino_cidade ? `, destino ${plano.patch.destino_cidade}${plano.patch.destino_uf ? '/' + plano.patch.destino_uf : ''}` : ''}.`);
  if (plano.perde.length) partes.push(`Ficaram em branco: ${plano.perde.map(p => p.texto).join('; ')}.`);
  if (plano.patch.valor_mao_de_obra != null && soEnvio(fluxoDaOp(op))) partes.push(`Mão de obra da unidade: ${moeda(plano.patch.valor_mao_de_obra)}.`);
  partes.push(`Motivo: ${limpo(motivo)}`);
  return partes.join(' ');
}

export type ResultadoTroca = { ok: boolean; erro?: string; semHistorico?: string; notificados?: number };

/**
 * Grava a troca. A atualização só pega se a unidade AINDA estiver numa etapa que permite e no mesmo fluxo de quando a janela abriu (outra pessoa pode ter mexido nesse meio-tempo):
 * a linha devolvida confirma que gravou. Depois vêm a auditoria, o histórico da OP, o recado no acompanhamento e o aviso na caixa de Menções de quem acompanha.
 */
export async function trocarFluxoDaUnidade({ op, plano, novoFluxo, motivo, usuario }: { op: any; plano: PlanoDaTroca; novoFluxo: string; motivo: string; usuario: any }): Promise<ResultadoTroca> {
  if (plano.erro) return { ok: false, erro: plano.erro };
  if (limpo(motivo).length < 3) return { ok: false, erro: 'Escreva o motivo da troca: ele vai no histórico e no aviso a quem acompanha a OP.' };
  const agora = new Date().toISOString();
  let q = supabase.from('oples').update({ ...plano.patch, data_atualizacao: agora }).eq('id', op.id).in('status_geral', STATUS_QUE_PERMITEM_TROCAR);
  q = op.fluxo_entrega ? q.eq('fluxo_entrega', op.fluxo_entrega) : q.is('fluxo_entrega', null);
  const { data, error } = await q.select('id');
  if (error) return { ok: false, erro: `Não foi possível trocar o fluxo (${error.message}). Nada foi alterado.` };
  if (!data || data.length !== 1) return { ok: false, erro: 'A OP mudou de etapa ou de fluxo enquanto a janela estava aberta. Nada foi alterado: feche, abra a OP de novo e tente outra vez.' };

  logChange({ module: 'oples', entityType: 'oples', entityId: op.id, changeType: 'UPDATE',
    oldRow: Object.fromEntries(Object.keys(plano.patch).map(k => [k, op[k] ?? null])), newRow: plano.patch, user: usuario });

  const texto = textoDaTroca(op, plano, novoFluxo, motivo, usuario?.nome);
  const r: ResultadoTroca = { ok: true, notificados: 0 };
  const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: op.id, numero_opl: op.opl, setor: usuario?.perfil || 'PCP', evento: texto,
    status_anterior: op.status_geral, status_novo: op.status_geral,
    usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: agora,
  }]);
  if (erroLog) r.semHistorico = erroLog.message;
  // o recado no acompanhamento da OP e o aviso na caixa de Menções (quem abriu, quem vendeu, a Engenharia e os administradores); falha aqui não desfaz a troca
  try {
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: op.opl, referencia_tipo: 'op', referencia_desc: `OP ${op.opl}`, setor: usuario?.perfil || 'PCP', texto,
      usuario_id: String(usuario?.id || ''), usuario_nome: usuario?.nome || 'Sistema', criado_em: agora,
    });
    r.notificados = await notificarEnvolvidosOp({ ref: op.opl, texto, assunto: 'Fluxo da unidade trocado', autorId: usuario?.id ? String(usuario.id) : null, autorNome: usuario?.nome || null });
  } catch (e: any) { /* o histórico da OP já guarda a troca */ }
  return r;
}
