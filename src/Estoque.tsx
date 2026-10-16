// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE — controle ligado item a item, para adotar aos poucos
//
// Regra definida com o usuário em 24/09/2026. O cadastro tem 4.436 itens e
// contar todos de uma vez é impossível, então o controle é OPT-IN: só vale
// para o item com `controla_estoque` marcado. Numa OP com 20 itens, se 2
// estiverem marcados, só esses 2 dão baixa, conferem mínimo e podem travar —
// os outros 18 seguem o fluxo de sempre. Assim dá para contar o estoque
// começando pelos mais usados e testar a compra automática com pouco volume,
// sem parar a fábrica por causa de item que ainda não foi contado.
//
// Quem mexe no saldo é SEMPRE a função `estoque_movimentar` no banco, nunca a
// tela: ler o saldo, somar e gravar de volta perde movimentação quando duas
// pessoas dão baixa ao mesmo tempo. A função trava a linha do item, grava
// saldo e extrato juntos, ignora item sem controle e ainda devolve se caiu
// abaixo do mínimo e quanto comprar para repor.
//
// Reposição: mínimo dispara, ideal diz até onde repor. Mínimo 10, ideal 50,
// saldo caiu para 8 → pede 42. Evita pedir de novo na semana seguinte.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import { ehAdminOuGerente } from './utils/permissoes';
import { combinaBusca, buscarPorPalavras } from './SearchUtils';
import { lerValorDigitado } from './LerValor';
import { confirmar } from './Feedback';
import { criarRequisicaoCompra } from './ComprasFluxo';
import { SelectBusca, MenuAcoes, Botao } from './Interface';
import { itensAtivosDoCatalogo } from './ConfigEstrutura';
import { centroDisponivel } from './CentroCustoShared';
import { mdiPencilOutline, mdiCloseCircleOutline } from '@mdi/js';

/** Requisição de reposição aberta = ainda não virou material na prateleira.
 *  'Concluído' era o nome antigo de 'Recebido' e foi unificado em 24/09/2026
 *  (código e os 5 registros que restavam). Continua na lista de propósito: se
 *  algum caminho esquecido voltar a gravar o nome velho, o pior que acontece é
 *  o item não pedir reposição nunca mais — e isso falharia em silêncio. */
const COMPRA_ENCERRADA = ['Recebido', 'Concluído', 'Descartada'];

/** Quem conta é quem tem o material na mão: o Almoxarifado, mais a gerência. */
export const podeGerirEstoque = (u: any) =>
  String(u?.perfil || '').trim() === 'Almoxarifado' || ehAdminOuGerente(u);

/** De onde veio o movimento. Texto curto, aparece no extrato. */
export const MOTIVO = {
  CONTAGEM: 'contagem',
  KITING: 'kiting',
  RETIRADA: 'retirada',
  COMPRA_RECEBIDA: 'compra_recebida',
  FABRICACAO_RECEBIDA: 'fabricacao_recebida',
  CONSUMO_ESTRUTURA: 'consumo_estrutura',
  AJUSTE: 'ajuste',
};

const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const fmtQtd = (v: any) => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
};

/**
 * Abre a requisição de reposição — ou não abre, se já existe uma em aberto.
 *
 * A trava contra repetição é essencial: sem ela, cada saída abaixo do mínimo
 * empilharia um pedido novo do mesmo item, e o Compras acordaria com vinte
 * requisições do mesmo parafuso. Uma requisição aberta já significa "material
 * a caminho"; só depois de recebida (ou descartada) é que cabe pedir de novo.
 */
/** Demanda de fabricação ainda não entregue = peça a caminho. */
const FABRICACAO_ENCERRADA = ['Concluido', 'Concluída', 'Cancelada'];

/** O item é feito aqui dentro? Então quem repõe é o setor, não o Compras. */
export const ehFabricacaoInterna = (item: any) =>
  String(item?.origem_producao || '').trim() === 'interna' && !!String(item?.setor_fabricante || '').trim();

/**
 * Já existe reposição a caminho deste item? Olha os DOIS caminhos.
 *
 * Antes só olhava compra. Com a fabricação interna entrando no jogo, um chicote
 * abaixo do mínimo podia ganhar uma demanda nova a cada varredura, porque a
 * demanda anterior não era enxergada por ninguém.
 */
export async function reposicaoEmAberto(item: any, op?: any) {
  // A trava é POR TIPO. Um item pode ter, ao mesmo tempo, um pedido urgente da
  // OP e um de reposição da prateleira — são dois pedidos legítimos, com
  // prioridades diferentes. O que não pode é dois do mesmo tipo.
  let qc = supabase.from('pcp_pedidos_compra')
    .select('id,numero_pedido,status_compra')
    .eq('vinculo_tipo', 'estoque').eq('vinculo_id', String(item.id))
    .not('status_compra', 'in', `(${COMPRA_ENCERRADA.map(s => `"${s}"`).join(',')})`);
  qc = op?.opl ? qc.eq('opl', op.opl) : qc.is('opl', null);
  const { data: compras, error: erroCompras } = await qc;
  // 7.x (15/10/2026): leitura recusada valia como "nada em aberto" e o pedido de reposição nascia em dobro — exatamente o que esta trava existe para impedir
  if (erroCompras) return { erro: `não foi possível conferir as compras em aberto (${erroCompras.message})` };
  if (compras?.length) {
    return { caminho: 'compra', referencia: compras[0].numero_pedido, status: compras[0].status_compra };
  }

  let qf = supabase.from('demandas_setoriais')
    .select('id,numero_demanda,status,setor_destino')
    .eq('item_id', String(item.id))
    .not('status', 'in', `(${FABRICACAO_ENCERRADA.map(s => `"${s}"`).join(',')})`);
  qf = op?.id ? qf.eq('opl_id', op.id) : qf.is('opl_id', null);
  const { data: fabricacoes, error: erroFabricacoes } = await qf;
  if (erroFabricacoes) return { erro: `não foi possível conferir as fabricações em aberto (${erroFabricacoes.message})` };
  if (fabricacoes?.length) {
    return { caminho: 'fabricacao', referencia: fabricacoes[0].numero_demanda || fabricacoes[0].setor_destino,
             status: fabricacoes[0].status };
  }
  return null;
}

/**
 * Abre a demanda de fabricação para o setor que faz a peça.
 *
 * Nasce sem OP amarrada de propósito: é reposição de prateleira, não material
 * de uma OP específica. Quando a Etapa 4 do plano chegar, a falta provocada por
 * uma OP vai nascer amarrada a ela.
 */
async function abrirFabricacaoReposicao({ item, quantidade, saldo, reservado, disponivel, op, currentUser }: any) {
  const agora = new Date().toISOString();
  const texto = `${op ? `FALTA PARA A OP ${op.opl}` : 'Reposição de estoque'} — ${item.nome}${item.codigo ? ` (${item.codigo})` : ''}`;
  const porque = motivoDaReposicao({ item, saldo, reservado, disponivel, op });
  const { data, error } = await supabase.from('demandas_setoriais').insert([{
    setor_destino: item.setor_fabricante, setor_origem: 'Estoque (automático)',
    tipo_solicitacao: op ? 'falta_op' : 'reposicao_estoque', item_id: item.id,
    descricao: `${texto}\n${porque}`, quantidade, unidade: item.unidade || 'un',
    status: 'Pendente', criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    data_abertura: agora,
    // a OP que provocou a falta fica amarrada: quem vai fabricar precisa saber
    // que tem carro esperando, e não é só reposição de prateleira
    ...(op ? { opl_id: op.id, numero_opl: op.opl } : {}),
    logs_demanda: [{ texto: `${porque} Demanda aberta automaticamente pelo controle de estoque — ninguém digitou.`,
                     usuario: currentUser?.nome, hora: agora }],
  }]).select('id,numero_demanda').single();
  if (error) return { erro: error.message };
  return { criada: true, caminho: 'fabricacao', setor: item.setor_fabricante,
           referencia: data?.numero_demanda || item.setor_fabricante, quantidade };
}

/** Por que este pedido existe. Vai para a tela de quem vai atender. */
function motivoDaReposicao({ item, saldo, reservado, disponivel, op }: any) {
  const un = item.unidade || 'UN';
  const partes: string[] = [];
  if (num(reservado) > 0) {
    // dizer só "saldo 20, mínimo 30" quando 15 já têm dono esconde o problema
    partes.push(`Saldo de ${fmtQtd(saldo)} ${un}, mas ${fmtQtd(reservado)} já reservado para OPs — `
      + `sobram ${fmtQtd(disponivel)}, no mínimo de ${fmtQtd(item.estoque_minimo)}.`);
  } else {
    partes.push(`Saldo chegou a ${fmtQtd(saldo)} ${un}, no mínimo de ${fmtQtd(item.estoque_minimo)}.`);
  }
  if (op?.opl) {
    partes.push(`É o que falta para fazer a OP ${op.opl} — tem carro esperando, esta vem primeiro.`);
  } else if (item.estoque_ideal != null) {
    partes.push(`Repor a prateleira até o ideal de ${fmtQtd(item.estoque_ideal)}.`);
  }
  return partes.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM COM DOIS ESTOQUES — ACABADO E INACABADO (28/09/2026)
//
// O caso do suporte, na descrição do usuário: o acabado já foi cortado,
// dobrado e pintado, e é o que a produção usa. O inacabado só foi cortado e
// dobrado — falta a pintura.
//
// Os dois estoques existem porque os dois serviços têm economias diferentes: a
// pintura só compensa em grande quantidade, e o corte se aproveita quando já se
// está cortando outra coisa. Por isso a fábrica guarda peça bruta de propósito.
//
// A cadeia é: corte e dobra → peça inacabada → pintura → peça acabada.
// Cada ponta tem o seu mínimo, e cada mínimo dispara o serviço que o alimenta.
// ─────────────────────────────────────────────────────────────────────────────

/** Item guardado em dois estados. */
export const temDoisEstados = (item: any) => !!item?.tem_inacabado;

const SERVICOS = {
  acabamento: { vinculo: 'estoque_acabamento', rotulo: 'acabamento',
                campo: 'servico_acabamento', padrao: 'Pintura' },
  bruto:      { vinculo: 'estoque_bruto', rotulo: 'corte e dobra',
                campo: 'servico_bruto', padrao: 'Corte e dobra' },
};

/** Requisição deste serviço já aberta para este item? Evita pedir duas vezes. */
async function servicoEmAberto(item: any, servico: 'acabamento' | 'bruto') {
  const { data, error } = await supabase.from('pcp_pedidos_compra')
    .select('id,numero_pedido,status_compra')
    .eq('vinculo_tipo', SERVICOS[servico].vinculo).eq('vinculo_id', String(item.id))
    .not('status_compra', 'in', `(${COMPRA_ENCERRADA.map(s => `"${s}"`).join(',')})`);
  // 7.x (15/10/2026): mesma trava do pedido de reposição — leitura recusada não pode valer como "nenhum serviço pedido"
  if (error) return { erro: `não foi possível conferir os serviços em aberto (${error.message})` };
  return data?.length ? { referencia: data[0].numero_pedido, status: data[0].status_compra } : null;
}

/**
 * Abre a requisição de um dos dois serviços, para o Compras.
 *
 * Vai como requisição comum do quadro, sem responsável fixo — decidido com o
 * usuário em 28/09/2026. O texto do serviço vem do cadastro do item e é o que
 * o comprador lê para cotar, no mesmo espírito do tipo de pintura da
 * Serralheria.
 */
export async function pedirServicoDoItem({ item, servico, quantidade, motivo, currentUser }: any) {
  const s = SERVICOS[servico];
  const jaTem = await servicoEmAberto(item, servico);
  if (jaTem?.erro) return { erro: `${jaTem.erro}. Nada foi pedido, para não pedir em dobro.`, servico };
  if (jaTem) return { jaExistia: true, servico, ...jaTem };

  const qtd = Math.max(1, Math.ceil(num(quantidade)));
  const oQue = String(item[s.campo] || '').trim() || s.padrao;
  const r = await criarRequisicaoCompra({
    titulo: `${oQue} — ${item.nome}`,
    descricao: motivo,
    itens: [{ nome: `${item.nome} — ${oQue}`, quantidade: qtd, descricao: item.codigo || '' }],
    observacoes: 'Requisição aberta automaticamente pelo controle de estoque — ninguém digitou. '
      + (servico === 'acabamento'
        ? 'A peça bruta já está aqui e sai do estoque inacabado quando o serviço voltar.'
        : 'É peça bruta: quando voltar, entra no estoque inacabado, ainda sem acabamento.'),
    vinculo: { tipo: s.vinculo, id: item.id, descricao: `${item.codigo ? item.codigo + ' · ' : ''}${item.nome}` },
    origemSetor: 'Estoque (automático)',
    currentUser,
  });
  if (r?.erro) return { erro: r.erro, servico };
  return { criada: true, servico, caminho: 'compra', numero_pedido: r.numero_pedido, quantidade: qtd, oQue };
}

/**
 * Confere os dois mínimos e abre o que precisar.
 *
 * Acabado no mínimo: pinta o que houver de inacabado. Se o inacabado não cobrir
 * a falta, sai TAMBÉM o pedido de corte e dobra do que falta — as duas de uma
 * vez, decidido com o usuário em 28/09/2026. Esperar a peça bruta chegar para
 * só então pedir a pintura somaria os dois prazos em fila.
 *
 * Inacabado no mínimo: pede corte e dobra para repor a peça bruta.
 */
export async function conferirDoisEstados({ item, reservado = 0, currentUser }: any) {
  if (!temDoisEstados(item)) return [];
  const pedidos: any[] = [];
  const un = item.unidade || 'UN';
  const acabado = num(item.estoque_atual) - num(reservado);
  const inacabado = num(item.estoque_inacabado);

  // 1) falta peça pronta para usar
  if (item.estoque_minimo != null && acabado <= num(item.estoque_minimo)) {
    const alvo = item.estoque_ideal != null ? num(item.estoque_ideal) : num(item.estoque_minimo);
    const precisa = Math.max(0, alvo - acabado);
    const podePintar = Math.min(precisa, inacabado);
    const semPecaBruta = precisa - podePintar;
    if (podePintar > 0) {
      pedidos.push(await pedirServicoDoItem({
        item, servico: 'acabamento', quantidade: podePintar, currentUser,
        motivo: `Pronto para uso em ${fmtQtd(acabado)} ${un}, no mínimo de ${fmtQtd(item.estoque_minimo)}. `
          + `Há ${fmtQtd(inacabado)} ${un} de peça bruta parada — ${fmtQtd(podePintar)} vão para o acabamento.`,
      }));
    }
    if (semPecaBruta > 0) {
      pedidos.push(await pedirServicoDoItem({
        item, servico: 'bruto', quantidade: semPecaBruta, currentUser,
        motivo: `Faltam ${fmtQtd(precisa)} ${un} para repor a prateleira e só há ${fmtQtd(inacabado)} de peça bruta. `
          + `Estes ${fmtQtd(semPecaBruta)} precisam ser cortados e dobrados antes de ir para o acabamento.`,
      }));
    }
  }

  // 2) falta peça bruta na prateleira — independente do acabado
  if (item.inacabado_minimo != null && inacabado <= num(item.inacabado_minimo)) {
    const alvo = item.inacabado_ideal != null ? num(item.inacabado_ideal) : num(item.inacabado_minimo);
    const precisa = Math.max(0, alvo - inacabado);
    if (precisa > 0) {
      pedidos.push(await pedirServicoDoItem({
        item, servico: 'bruto', quantidade: precisa, currentUser,
        motivo: `Peça bruta em ${fmtQtd(inacabado)} ${un}, no mínimo de ${fmtQtd(item.inacabado_minimo)}. `
          + `Repor até ${fmtQtd(alvo)} — o corte se aproveita quando já se está cortando outra coisa.`,
      }));
    }
  }
  return pedidos.filter(p => p?.criada || p?.erro);
}

export async function garantirRequisicaoReposicao({ item, quantidade, saldo, reservado, disponivel, op, currentUser }: any) {
  const jaTem = await reposicaoEmAberto(item, op);
  if (jaTem?.erro) return { erro: `${jaTem.erro}. Nada foi pedido, para não pedir em dobro.` };
  if (jaTem) {
    return { jaExistia: true, caminho: jaTem.caminho, status: jaTem.status,
             referencia: jaTem.referencia, setor: item.setor_fabricante,
             numero_pedido: jaTem.referencia };
  }

  const qtd = Math.max(1, Math.ceil(num(quantidade)));

  // Chicote que a gente mesmo faz não se compra: vira demanda para o setor.
  // Sem isso, o Compras recebia requisição de fornecedor para uma peça que sai
  // da bancada aqui dentro (regra definida com o usuário em 25/09/2026).
  if (ehFabricacaoInterna(item)) {
    return await abrirFabricacaoReposicao({ item, quantidade: qtd, saldo, reservado, disponivel, op, currentUser });
  }

  const r = await criarRequisicaoCompra({
    titulo: `Reposição de estoque — ${item.nome}`,
    descricao: motivoDaReposicao({ item, saldo, reservado, disponivel, op }),
    itens: [{ nome: item.nome, quantidade: qtd, descricao: item.codigo || '' }],
    observacoes: 'Requisição aberta automaticamente pelo controle de estoque — ninguém digitou.',
    vinculo: { tipo: 'estoque', id: item.id, descricao: `${item.codigo ? item.codigo + ' · ' : ''}${item.nome}` },
    origemSetor: 'Estoque (automático)',
    currentUser,
  });
  if (r?.erro) return { erro: r.erro };
  return { criada: true, caminho: 'compra', numero_pedido: r.numero_pedido, quantidade: qtd };
}

/**
 * Varredura de mínimos — olha TODOS os itens controlados, não só os que se
 * moveram.
 *
 * Por que precisa existir: a reposição automática nasce dentro do movimento de
 * estoque, então ela só enxerga o item no instante em que alguém tira ou põe
 * material. Quem definiu um mínimo e nunca mais mexeu no item ficava calado
 * para sempre. Em 25/09/2026, ao montar este plano, os 3 chicotes controlados
 * estavam abaixo do mínimo (6/30, 11/30 e 14/30) e nenhum pedido existia —
 * ninguém tinha sido avisado.
 *
 * Só abre o que falta: item que já tem compra ou fabricação a caminho é pulado.
 */
/**
 * Quanto pedir de um item, olhando o DISPONÍVEL — não o que está na prateleira.
 *
 * A diferença é o coração da Etapa 4. Um item com 20 na prateleira e 20 já
 * prometidos a OPs tem disponível zero: está sem material, por mais que o saldo
 * diga 20. Antes disso a conta usava o saldo físico e o item aparecia "ok".
 *
 * A quantidade NÃO é limitada pelo ideal. Um lote de 90 carros precisa dos 90,
 * mesmo que o ideal de prateleira seja 30 — repor até o ideal é o piso, não o
 * teto (regra do usuário em 25/09/2026).
 */
export function necessidadeDeReposicao({ saldo, reservado, minimo, ideal }: any) {
  const disponivel = num(saldo) - num(reservado);
  const min = num(minimo);
  const alvo = num(ideal) > 0 ? num(ideal) : min;

  // O que falta AGORA para dar conta do que já foi prometido às OPs. Esta é a
  // parte urgente: tem carro esperando.
  const faltaOp = disponivel < 0 ? Math.ceil(-disponivel) : 0;

  // O que falta para a prateleira voltar ao ideal DEPOIS de atendidas as OPs.
  // Parte de zero quando o disponível está negativo, porque as OPs vão levar
  // tudo que existe.
  const sobraria = Math.max(0, disponivel);
  const reposicao = (min > 0 && sobraria <= min) ? Math.max(0, Math.ceil(alvo - sobraria)) : 0;

  return { disponivel, faltaOp, reposicao, precisa: faltaOp > 0 || reposicao > 0 };
}

/** Campos do item que o caminho dos dois estados (pronta e bruta) precisa. A varredura e a reserva da OP não os liam: um item guardado nos dois
 *  estados caía no pedido de compra comum — a peça que a fábrica manda fazer era pedida a um fornecedor (regra de 28/09/2026, ver conferirDoisEstados). */
const CAMPOS_DOIS_ESTADOS = 'estoque_atual,tem_inacabado,estoque_inacabado,inacabado_minimo,inacabado_ideal,servico_acabamento,servico_bruto';

export async function varrerMinimos({ currentUser }: any) {
  // Lê a view, que já entrega saldo, reservado e disponível prontos.
  const { data, error: erroView } = await supabase.from('vw_estoque_disponivel').select('*').order('nome');
  // 7.x (15/10/2026): leitura recusada virava "Nenhum item abaixo do mínimo. 0 item(ns) conferido(s)" — um "tudo certo" que ninguém conferiu
  if (erroView) return { erro: erroView.message };
  const itens = data || [];

  const abertos: any[] = [], pulados: any[] = [], falhas: any[] = [];
  let abaixo = 0;
  for (const linha of itens) {
    const n = necessidadeDeReposicao({
      saldo: linha.estoque_atual, reservado: linha.reservado,
      minimo: linha.estoque_minimo, ideal: linha.estoque_ideal,
    });
    if (!n.precisa) continue;
    abaixo++;
    // garantirRequisicaoReposicao precisa do cadastro para saber o caminho
    const { data: item, error: erroItem } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,unidade,estoque_minimo,estoque_ideal,origem_producao,setor_fabricante,' + CAMPOS_DOIS_ESTADOS)
      .eq('id', linha.item_id).maybeSingle();
    // 7.x: o item que não vinha do cadastro era contado como "abaixo do mínimo" e sumia do relatório (nem aberto, nem pulado, nem falha)
    if (erroItem || !item) { falhas.push({ item: { nome: linha.nome || 'item sem nome' }, erro: erroItem ? erroItem.message : 'item não encontrado no cadastro' }); continue; }
    // Item guardado nos dois estados: o que repõe a prateleira é um dos dois serviços da cadeia, não a compra da peça (mesma regra do movimento de estoque)
    if (temDoisEstados(item)) {
      const feitos = await conferirDoisEstados({ item, reservado: linha.reservado, currentUser });
      feitos.filter((p: any) => p?.erro).forEach((p: any) => falhas.push({ item, erro: p.erro }));
      feitos.filter((p: any) => p?.criada).forEach((p: any) => abertos.push({ item, ...p }));
      if (!feitos.length) pulados.push({ item, caminho: 'compra', status: 'o serviço já está pedido' });
      continue;
    }
    // A varredura é da prateleira: ela cuida da reposição. A falta de uma OP
    // específica nasce na hora em que a OP é liberada, amarrada àquela OP.
    const quantidade = n.reposicao > 0 ? n.reposicao : n.faltaOp;
    const r = await garantirRequisicaoReposicao({
      item, quantidade, saldo: linha.estoque_atual,
      reservado: linha.reservado, disponivel: n.disponivel, currentUser,
    });
    if (r?.erro) falhas.push({ item, erro: r.erro });
    else if (r?.jaExistia) pulados.push({ item, ...r });
    else abertos.push({ item, ...r, quantidade });
  }
  return { olhados: itens.length, abaixo, abertos, pulados, falhas };
}

/** Texto do resultado da varredura, para mostrar a quem clicou. */
export function textoDaVarredura(r: any) {
  if (r?.erro) return `Não foi possível conferir os mínimos: ${r.erro}.\n\nNada foi pedido. Tente de novo.`;
  if (!r?.abaixo) return `Nenhum item abaixo do mínimo. ${r?.olhados || 0} item(ns) conferido(s).`;
  const linhas: string[] = [`${r.abaixo} item(ns) abaixo do mínimo, de ${r.olhados} conferido(s).`, ''];
  if (r.abertos.length) {
    linhas.push(`Pedidos abertos agora (${r.abertos.length}):`);
    r.abertos.forEach((a: any) => linhas.push(
      `  • ${a.item.nome} — ${fmtQtd(a.quantidade)} ${a.item.unidade || 'UN'} por ${a.caminho === 'fabricacao' ? `fabricação (${a.setor})` : a.oQue ? `compra de ${a.oQue}` : 'compra'}`));
    linhas.push('');
  }
  if (r.pulados.length) {
    linhas.push(`Já tinham reposição a caminho (${r.pulados.length}):`);
    r.pulados.forEach((p: any) => linhas.push(`  • ${p.item.nome} — ${p.caminho === 'fabricacao' ? 'fabricação' : 'compra'} ${p.numero_pedido || ''} (${p.status})`));
    linhas.push('');
  }
  if (r.falhas.length) {
    linhas.push(`Não deu para abrir (${r.falhas.length}):`);
    r.falhas.forEach((f: any) => linhas.push(`  • ${f.item.nome} — ${f.erro}`));
  }
  return linhas.join('\n');
}

/**
 * Credita o estoque quando a compra chega.
 *
 * Entra a quantidade REALMENTE recebida, não a pedida: a requisição automática
 * pode ter pedido 100 e o Compras ter sido autorizado a comprar 50, ou ter
 * comprado 200 por causa do lote do fornecedor. Quem manda é o que desceu do
 * caminhão (regra do usuário em 24/09/2026).
 *
 * Só vale para requisição de reposição (vinculo_tipo 'estoque'), porque é ela
 * que sabe a qual item pertence. Compra de OP ou geral não credita nada — a
 * lista dela é texto livre e adivinhar o item seria pior que não creditar.
 *
 * Se mesmo com a entrada o saldo continuar no mínimo (comprou 50 dos 100 que
 * faltavam), a própria movimentação abre uma requisição nova — que é o certo.
 */
export async function creditarCompraRecebida({ pedido, quantidade, currentUser }: any) {
  const tipoVinc = pedido?.vinculo_tipo;
  const ehEstoque = ['estoque', 'estoque_bruto', 'estoque_acabamento'].includes(String(tipoVinc));
  if (!ehEstoque || !pedido?.vinculo_id) return { naoSeAplica: true };
  const qtd = num(quantidade);
  if (qtd <= 0) return { naoSeAplica: true, motivo: 'Sem quantidade recebida.' };

  const base = {
    motivo: MOTIVO.COMPRA_RECEBIDA,
    observacoes: `Recebimento do pedido ${pedido.numero_pedido || pedido.numero_oc || '—'}`
      + (num(pedido.quantidade) !== qtd ? ` — pedido de ${fmtQtd(pedido.quantidade)}, recebido ${fmtQtd(qtd)}.` : ''),
    vinculo: { tipo: 'compra', id: pedido.id, descricao: pedido.numero_pedido || pedido.numero_oc || 'Pedido de compra' },
    currentUser,
  };

  // CORTE E DOBRA: a peça bruta chega e entra no estoque inacabado. Ainda não
  // serve para a produção — falta o acabamento.
  if (tipoVinc === 'estoque_bruto') {
    return await movimentarEstoque({ itemId: pedido.vinculo_id, tipo: 'entrada', quantidade: qtd,
      estado: 'inacabado', ...base });
  }

  // ACABAMENTO: a peça é a MESMA, só mudou de estado. Sai do inacabado e entra
  // no acabado — se só entrasse, a peça existiria duas vezes no estoque.
  if (tipoVinc === 'estoque_acabamento') {
    const saida = await movimentarEstoque({ itemId: pedido.vinculo_id, tipo: 'saida', quantidade: qtd,
      estado: 'inacabado', ...base,
      observacoes: base.observacoes + ' Peça bruta que foi para o acabamento.' });
    if (saida?.erro) return saida;
    const entrada = await movimentarEstoque({ itemId: pedido.vinculo_id, tipo: 'entrada', quantidade: qtd,
      estado: 'acabado', ...base,
      observacoes: base.observacoes + ' Voltou pronta para uso.' });
    // 7.x (15/10/2026): se a entrada falhava depois da saída, a peça sumia do estoque (saiu da bruta e não entrou na pronta) e o aviso nem dizia isso;
    // uma nova tentativa ainda tiraria a bruta de novo. Agora a saída é desfeita com um estorno registrado no extrato.
    if (entrada?.erro) {
      const volta = await movimentarEstoque({ itemId: pedido.vinculo_id, tipo: 'entrada', quantidade: qtd,
        estado: 'inacabado', ...base, motivo: MOTIVO.AJUSTE,
        observacoes: base.observacoes + ' Estorno automático: a entrada da peça pronta falhou depois da saída da peça bruta.' });
      return { erro: (/[.!?]$/.test(entrada.erro) ? entrada.erro : entrada.erro + '.') + (volta?.erro
        ? ` ATENÇÃO: a peça bruta já tinha saído do estoque e NÃO voltou (${volta.erro}) — confira o saldo sem acabamento e acerte pelo painel de estoque.`
        : ' A saída da peça bruta foi desfeita: nada mudou no estoque.') };
    }
    return { ...entrada, inacabado_depois: saida?.saldo_depois };
  }

  return await movimentarEstoque({ itemId: pedido.vinculo_id, tipo: 'entrada', quantidade: qtd, ...base });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESERVA — material da prateleira que já tem dono
//
// Reservar não tira nada do saldo: a peça continua lá e continua contada. O que
// a reserva muda é o DISPONÍVEL — saldo menos o que está prometido a outras OPs.
// Sem isso, duas OPs enxergam os mesmos 20 chicotes e as duas acham que têm
// material; a segunda só descobre no kiting.
//
// A baixa de verdade continua no kiting, manual, feita pelo Almoxarifado. Lá a
// reserva é CONSUMIDA junto com a saída — senão o material sairia duas vezes da
// conta do disponível.
// ─────────────────────────────────────────────────────────────────────────────

/** Quanto de cada item está reservado agora. Mapa item_id → quantidade. */
// 7.x (15/10/2026): leitura recusada devolvia um mapa vazio — "nada reservado" — e a conta de disponível ficava mais folgada do que é, sem aviso. As versões "ler…" devolvem também o erro.
export async function lerReservadoPorItem(itemIds?: string[]) {
  let q = supabase.from('estoque_reservas').select('item_id,quantidade').eq('situacao', 'reservada');
  if (itemIds?.length) q = q.in('item_id', itemIds);
  const { data, error } = await q;
  const mapa = new Map<string, number>();
  (data || []).forEach((r: any) => mapa.set(r.item_id, (mapa.get(r.item_id) || 0) + num(r.quantidade)));
  return { mapa, erro: error ? error.message : '' };
}
export async function reservadoPorItem(itemIds?: string[]) {
  return (await lerReservadoPorItem(itemIds)).mapa;
}

/** O que a OP reservou, por item. Serve para não descontar a OP dela mesma. */
export async function lerReservaDaOp(oplId: string) {
  const { data, error } = await supabase.from('estoque_reservas')
    .select('id,item_id,quantidade').eq('opl_id', oplId).eq('situacao', 'reservada');
  const mapa = new Map<string, number>();
  (data || []).forEach((r: any) => mapa.set(r.item_id, (mapa.get(r.item_id) || 0) + num(r.quantidade)));
  return { mapa, erro: error ? error.message : '' };
}
export async function reservaDaOp(oplId: string) {
  return (await lerReservaDaOp(oplId)).mapa;
}

/** Linhas da BOM da OP que apontam para item sob controle. */
async function linhasControladasDaOp(oplId: string) {
  const { data: op, error: erroOp } = await supabase.from('oples').select('id,opl,bom_itens').eq('id', oplId).maybeSingle();
  // 7.x: leitura recusada da OP ou do cadastro virava "nada sob controle nesta OP" e a reserva simplesmente não acontecia, sem aviso
  if (erroOp) return { op: null, linhas: [], erro: `não foi possível ler a lista de material da OP (${erroOp.message})` };
  const linhas = Array.isArray(op?.bom_itens) ? op.bom_itens : [];
  const comItem = linhas.filter((l: any) => l?.item_id);
  if (!comItem.length) return { op, linhas: [] };
  const { data: itens, error: erroItens } = await supabase.from('cadastro_itens')
    .select('id,nome,controla_estoque').in('id', comItem.map((l: any) => l.item_id));
  if (erroItens) return { op, linhas: [], erro: `não foi possível ler o cadastro dos itens da OP (${erroItens.message})` };
  const controlados = new Set((itens || []).filter((i: any) => i.controla_estoque).map((i: any) => i.id));
  // a mesma peça pode aparecer em mais de uma linha da BOM; soma antes de reservar
  const somado = new Map<string, number>();
  comItem.forEach((l: any) => {
    if (!controlados.has(l.item_id)) return;
    somado.set(l.item_id, (somado.get(l.item_id) || 0) + num(l.quantidade));
  });
  return { op, linhas: [...somado.entries()].map(([item_id, quantidade]) => ({ item_id, quantidade })) };
}

/**
 * Reserva o material da OP. Chamado quando o PCP libera para o Almoxarifado —
 * o momento escolhido pelo usuário em 25/09/2026, porque é aí que o material
 * passa a ter dono e ainda dá tempo de comprar ou fabricar o que faltar.
 *
 * Idempotente: liberar a mesma OP de novo não reserva em dobro (há índice único
 * no banco garantindo isso, mas a checagem aqui evita o erro feio na tela).
 */
export async function reservarParaOp({ oplId, currentUser }: any) {
  const { op, linhas, erro: erroLeitura } = await linhasControladasDaOp(oplId);
  if (erroLeitura) return { erro: `${erroLeitura}. A reserva não foi feita` };
  if (!linhas.length) return { nada: true };

  const lida = await lerReservaDaOp(oplId);
  if (lida.erro) return { erro: `não foi possível conferir o que a OP já reservou (${lida.erro}). A reserva não foi feita` };
  const jaTem = lida.mapa;
  const novas = linhas.filter(l => !jaTem.has(l.item_id));
  if (!novas.length) return { jaEstava: true, itens: jaTem.size };

  const { error } = await supabase.from('estoque_reservas').insert(
    novas.map(l => ({
      item_id: l.item_id, opl_id: oplId, numero_opl: op?.opl || null,
      quantidade: l.quantidade, situacao: 'reservada',
      criado_por_nome: currentUser?.nome || currentUser?.email || '—',
    })));
  if (error) return { erro: error.message };

  // Reservar pode ter deixado o disponível no vermelho: é aqui que a falta vira
  // pedido, com o tempo ainda a favor. Este é o caso que o usuário descreveu —
  // 20 chicotes em estoque e uma OP com lote de 30 carros: o sistema vê que
  // faltam 10 e pede sozinho, sem esperar o kiting descobrir.
  const { abertos: pedidos, falhas: falhasPedidos } = await pedirOQueFaltou({ itemIds: novas.map(l => l.item_id), op, currentUser });
  return { reservou: novas.length, itens: novas.length, pedidos, falhasPedidos };
}

/**
 * Abre o que falta, em DOIS pedidos separados quando for o caso.
 *
 * Decisão do usuário em 25/09/2026: faltando material para uma OP e para a
 * prateleira, saem duas demandas — uma com o número exato para fazer o trabalho
 * da OP, outra para repor o estoque. Assim o setor prioriza a da OP primeiro,
 * que tem carro parado esperando, e faz a da prateleira depois.
 *
 * Um pedido só, somando tudo, obrigaria o setor a terminar os 40 antes de
 * liberar os 10 de que a OP precisa.
 */
async function pedirOQueFaltou({ itemIds, op, currentUser }: any) {
  const abertos: any[] = [], falhas: string[] = [];
  if (!itemIds?.length) return { abertos, falhas };
  const { data: linhas, error: erroView } = await supabase.from('vw_estoque_disponivel')
    .select('*').in('item_id', itemIds);
  // 7.x (15/10/2026): nada disto era avisado — leitura recusada, item que não vinha do cadastro e pedido recusado simplesmente não apareciam,
  // e a OP era liberada achando que o que faltava já tinha sido pedido. Agora cada falha volta em `falhas`.
  if (erroView) { falhas.push(`não foi possível conferir a falta de material (${erroView.message})`); return { abertos, falhas }; }
  for (const linha of linhas || []) {
    const n = necessidadeDeReposicao({
      saldo: linha.estoque_atual, reservado: linha.reservado,
      minimo: linha.estoque_minimo, ideal: linha.estoque_ideal,
    });
    if (!n.precisa) continue;
    const { data: item, error: erroItem } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,unidade,estoque_minimo,estoque_ideal,origem_producao,setor_fabricante,' + CAMPOS_DOIS_ESTADOS)
      .eq('id', linha.item_id).maybeSingle();
    if (erroItem || !item) { falhas.push(`${linha.nome || 'item sem nome'}: ${erroItem ? erroItem.message : 'item não encontrado no cadastro'}`); continue; }

    // Item guardado nos dois estados: o que repõe é um dos dois serviços da cadeia, não a compra da peça (mesma regra do movimento de estoque)
    if (temDoisEstados(item)) {
      const feitos = await conferirDoisEstados({ item, reservado: linha.reservado, currentUser });
      feitos.filter((p: any) => p?.erro).forEach((p: any) => falhas.push(`${item.nome}: ${p.erro}`));
      feitos.filter((p: any) => p?.criada).forEach((p: any) => abertos.push({ nome: item.nome, para: n.faltaOp > 0 ? 'OP' : 'estoque', ...p }));
      continue;
    }

    const comum = { item, saldo: linha.estoque_atual, reservado: linha.reservado,
                    disponivel: n.disponivel, currentUser };

    // 1) o que a OP precisa para andar — urgente, amarrada à OP
    if (n.faltaOp > 0 && op) {
      const r = await garantirRequisicaoReposicao({ ...comum, quantidade: n.faltaOp, op });
      if (r?.criada) abertos.push({ nome: item.nome, quantidade: n.faltaOp, para: 'OP', ...r });
      else if (r?.erro) falhas.push(`${item.nome} (para a OP): ${r.erro}`);
    }
    // 2) o que a prateleira precisa para voltar ao ideal — sem OP amarrada
    if (n.reposicao > 0) {
      const r = await garantirRequisicaoReposicao({ ...comum, quantidade: n.reposicao });
      if (r?.criada) abertos.push({ nome: item.nome, quantidade: n.reposicao, para: 'estoque', ...r });
      else if (r?.erro) falhas.push(`${item.nome} (para a prateleira): ${r.erro}`);
    }
  }
  return { abertos, falhas };
}

/**
 * Consome a reserva da OP NA MEDIDA do que saiu da prateleira.
 *
 * Até 28/09/2026 encerrava a reserva inteira do item, porque a baixa acontecia
 * uma vez só ao fechar o Kit 100%. Agora que o Almoxarifado pode salvar a
 * separação pela metade, encerrar tudo faria o disponível mentir para mais:
 * saldo caindo 2, reservado caindo 6. O que ainda não saiu continua prometido.
 */
async function consumirReserva({ oplId, itemId, quantidade, currentUser }: any) {
  let resta = num(quantidade);
  if (resta <= 0) return {};
  const { data, error } = await supabase.from('estoque_reservas')
    .select('id,quantidade,quantidade_consumida')
    .eq('opl_id', oplId).eq('item_id', itemId).eq('situacao', 'reservada')
    .order('criado_em');
  // 7.x (15/10/2026): leitura ou gravação recusada passava em branco — o saldo baixava e a reserva continuava de pé, e o disponível descontava a mesma peça duas vezes
  if (error) return { erro: error.message };
  for (const r of data || []) {
    if (resta <= 0) break;
    const aberto = num(r.quantidade) - num(r.quantidade_consumida);
    if (aberto <= 0) continue;
    const leva = Math.min(aberto, resta);
    const consumida = num(r.quantidade_consumida) + leva;
    // margem de centésimo: quantidade é numérica e item por metro não fecha exato
    const fechou = consumida >= num(r.quantidade) - 0.0001;
    const { error: erroGrava } = await supabase.from('estoque_reservas').update({
      quantidade_consumida: consumida,
      ...(fechou ? {
        situacao: 'consumida', encerrada_em: new Date().toISOString(),
        encerrada_por: currentUser?.nome || '—', motivo_encerramento: 'Baixa no kiting',
      } : {}),
    }).eq('id', r.id);
    if (erroGrava) return { erro: erroGrava.message };
    resta -= leva;
  }
  return {};
}

/**
 * Devolve para a reserva o que voltou para a prateleira.
 *
 * Acontece quando a conferência diminui: o Almoxarifado tinha marcado 6,
 * corrige para 4, e 2 peças voltam. Sem isto a reserva ficaria consumida por
 * material que está de volta na prateleira, e a OP perderia a fila dele.
 */
async function devolverReserva({ oplId, itemId, quantidade }: any) {
  let resta = num(quantidade);
  if (resta <= 0) return {};
  const { data, error } = await supabase.from('estoque_reservas')
    .select('id,quantidade,quantidade_consumida')
    .eq('opl_id', oplId).eq('item_id', itemId).in('situacao', ['reservada', 'consumida'])
    .gt('quantidade_consumida', 0)
    .order('criado_em', { ascending: false });   // desfaz a partir da mais recente
  if (error) return { erro: error.message };
  for (const r of data || []) {
    if (resta <= 0) break;
    const volta = Math.min(num(r.quantidade_consumida), resta);
    const { error: erroGrava } = await supabase.from('estoque_reservas').update({
      quantidade_consumida: num(r.quantidade_consumida) - volta,
      situacao: 'reservada', encerrada_em: null, encerrada_por: null, motivo_encerramento: null,
    }).eq('id', r.id);
    if (erroGrava) return { erro: erroGrava.message };
    resta -= volta;
  }
  return {};
}

/**
 * Solta o que a OP estava segurando. Usado quando a OP é cancelada ou quando a
 * BOM volta para a Engenharia revisar — nos dois casos a lista de material
 * daquela OP deixou de valer.
 *
 * Devolução ao Almoxarifado para refazer o kit NÃO solta: a OP continua de pé e
 * o material continua prometido a ela.
 */
export async function liberarReservaDaOp({ oplId, motivo, currentUser }: any) {
  const { data, error } = await supabase.from('estoque_reservas').update({
    situacao: 'liberada', encerrada_em: new Date().toISOString(),
    encerrada_por: currentUser?.nome || '—', motivo_encerramento: motivo || 'Reserva liberada',
  }).eq('opl_id', oplId).eq('situacao', 'reservada').select('id');
  if (error) return { erro: error.message };
  return { liberadas: (data || []).length };
}

/**
 * ESTRUTURA DO CHICOTE (Etapa 9 do plano) — metros de fio por cor, conexões,
 * terminais que 1 unidade do chicote consome ao ser fabricada.
 *
 * "Só faz sentido depois que o chicote inteiro já entra e sai do estoque
 * direito" (o próprio plano) — por isso mora ao lado da fabricação, não antes
 * dela. É opcional por chicote: sem estrutura cadastrada, nada é consumido —
 * mesmo princípio de opt-in de sempre.
 */
export async function lerMateriaisDoChicote(chicoteItemId: string) {
  if (!chicoteItemId) return { materiais: [] as any[], erro: '' };
  const { data, error } = await supabase.from('chicote_materiais')
    .select('id,quantidade,material_item_id,material:cadastro_itens!chicote_materiais_material_item_id_fkey(id,codigo,nome,unidade,controla_estoque,estoque_atual)')
    .eq('chicote_item_id', chicoteItemId)
    .order('criado_em');
  // 7.x (15/10/2026): leitura recusada valia como "chicote sem estrutura" — a entrada creditava o chicote e não descontava fio, conexão e terminal, sem aviso
  return { materiais: (data || []) as any[], erro: error ? error.message : '' };
}
export async function materiaisDoChicote(chicoteItemId: string) {
  return (await lerMateriaisDoChicote(chicoteItemId)).materiais;
}

export async function adicionarMaterialChicote({ chicoteItemId, materialItemId, quantidade, currentUser }: any) {
  const { error } = await supabase.from('chicote_materiais').insert({
    chicote_item_id: chicoteItemId, material_item_id: materialItemId,
    quantidade: num(quantidade), criado_por: currentUser?.email || null,
  });
  if (error) return { erro: error.code === '23505' ? 'Este material já está na estrutura deste chicote.' : error.message };
  return { ok: true };
}

export async function removerMaterialChicote(id: string) {
  const { error } = await supabase.from('chicote_materiais').delete().eq('id', id);
  return error ? { erro: error.message } : { ok: true };
}

/** O que fabricar `quantidade` chicotes vai consumir — usado tanto para
 *  mostrar a prévia na tela quanto para de fato dar baixa (mesma conta). */
export function materiaisAConsumir(estrutura: any[], quantidade: number) {
  const qtd = num(quantidade);
  return (estrutura || [])
    .filter(m => m.material)
    .map(m => ({ ...m, aConsumir: num(m.quantidade) * qtd }));
}

/**
 * Demandas de fabricação prontas, esperando o Almoxarifado conferir.
 *
 * É a fila do balcão: a peça já foi feita, o setor disse quanto produziu, e o
 * saldo só sobe quando alguém do Almoxarifado confirma que ela chegou de fato.
 * Conferir com o olho antes de creditar é o que impede o estoque de virar
 * ficção — foi assim que fizemos com a compra recebida.
 */
export async function lerFabricacoesAguardandoCredito() {
  const { data, error } = await supabase.from('demandas_setoriais')
    .select('id,numero_demanda,descricao,setor_destino,quantidade,quantidade_produzida,unidade,data_conclusao,item_id,numero_opl')
    .not('item_id', 'is', null)
    .is('estoque_creditado_em', null)
    .in('status', ['Concluido', 'Concluída'])
    .order('data_conclusao', { ascending: true });
  // 7.x (15/10/2026): leitura recusada virava fila vazia e o painel inteiro sumia — o Almoxarifado achava que não havia peça pronta esperando entrada
  return { fila: (data || []) as any[], erro: error ? error.message : '' };
}
export async function fabricacoesAguardandoCredito() {
  return (await lerFabricacoesAguardandoCredito()).fila;
}

/**
 * Credita o estoque quando a peça fabricada aqui dentro chega ao Almoxarifado.
 *
 * Entra a quantidade REALMENTE produzida, não a pedida — mesma regra da compra:
 * a reposição pode ter pedido 44 e o setor ter feito 40 porque acabou o fio.
 *
 * Se mesmo com a entrada o saldo continuar no mínimo, a própria movimentação
 * abre a próxima reposição, que é o certo.
 */
export async function creditarFabricacaoRecebida({ demanda, quantidade, currentUser }: any) {
  if (!demanda?.item_id) return { naoSeAplica: true, motivo: 'Demanda sem item do cadastro.' };
  const qtd = num(quantidade);
  if (qtd <= 0) return { naoSeAplica: true, motivo: 'Sem quantidade recebida.' };

  // 7.x (15/10/2026): duas conferências ANTES de creditar. (1) a demanda ainda está na fila? — outra pessoa (ou outra janela aberta) podia já ter dado a entrada,
  // e a lista da tela só se atualiza ao recarregar: o saldo subia duas vezes. (2) a estrutura do chicote foi lida? — leitura recusada creditava o chicote sem descontar o material.
  const { data: fresca, error: erroFresca } = await supabase.from('demandas_setoriais')
    .select('id,estoque_creditado_em,estoque_creditado_por').eq('id', demanda.id).maybeSingle();
  if (erroFresca) return { erro: `não foi possível conferir se esta fabricação já deu entrada (${erroFresca.message}); nada foi creditado` };
  if (!fresca) return { erro: 'esta demanda não foi encontrada; nada foi creditado' };
  if (fresca.estoque_creditado_em) {
    return { erro: `esta fabricação já deu entrada no estoque${fresca.estoque_creditado_por ? ` (por ${fresca.estoque_creditado_por})` : ''}; nada foi creditado de novo. Atualize a lista` };
  }
  const lidaEstrutura = await lerMateriaisDoChicote(demanda.item_id);
  if (lidaEstrutura.erro) {
    return { erro: `não foi possível ler a estrutura do chicote (${lidaEstrutura.erro}); nada foi creditado, para não dar entrada sem descontar o material` };
  }

  const r = await movimentarEstoque({
    itemId: demanda.item_id, tipo: 'entrada', quantidade: qtd,
    motivo: MOTIVO.FABRICACAO_RECEBIDA,
    observacoes: `Fabricação do setor ${demanda.setor_destino || '—'}`
      + (demanda.numero_demanda ? ` (${demanda.numero_demanda})` : '')
      + (num(demanda.quantidade) !== qtd ? ` — pedido de ${fmtQtd(demanda.quantidade)}, recebido ${fmtQtd(qtd)}.` : '.'),
    vinculo: { tipo: 'fabricacao', id: demanda.id, descricao: demanda.numero_demanda || `Demanda ${demanda.setor_destino}` },
    currentUser,
  });
  if (r?.erro || r?.ignorado) return r;

  // Estrutura do chicote (Etapa 9): se este chicote tem material cadastrado,
  // fabricar `qtd` unidades consome esse material também — na quantidade
  // PRODUZIDA, mesma regra do chicote em si. Passa pelo mesmo
  // movimentarEstoque, então material que cair no mínimo já pede reposição
  // sozinho, sem nada novo a disparar aqui.
  const estrutura = lidaEstrutura.materiais;
  if (estrutura.length) {
    const avisosEstrutura: string[] = [];
    const requisicoesEstrutura: any[] = [];
    for (const m of materiaisAConsumir(estrutura, qtd)) {
      const rm = await movimentarEstoque({
        itemId: m.material.id, tipo: 'saida', quantidade: m.aConsumir,
        motivo: MOTIVO.CONSUMO_ESTRUTURA,
        observacoes: `Consumido pela fabricação de ${fmtQtd(qtd)} ${demanda.unidade || 'un'} do chicote`
          + (demanda.numero_demanda ? ` (${demanda.numero_demanda})` : '') + '.',
        vinculo: { tipo: 'fabricacao', id: demanda.id, descricao: demanda.numero_demanda || `Demanda ${demanda.setor_destino}` },
        currentUser,
      });
      if (rm?.erro) avisosEstrutura.push(`${m.material.nome}: ${rm.erro}`);
      else if (rm?.requisicao?.criada) requisicoesEstrutura.push({ material: m.material.nome, ...rm.requisicao });
    }
    if (avisosEstrutura.length) r.avisosEstrutura = avisosEstrutura;
    if (requisicoesEstrutura.length) r.requisicoesEstrutura = requisicoesEstrutura;
  }

  // Marca depois de creditar: se a movimentação falhar, a demanda continua na
  // fila e alguém tenta de novo. O contrário deixaria peça fora do saldo.
  const { error } = await supabase.from('demandas_setoriais').update({
    estoque_creditado_em: new Date().toISOString(),
    estoque_creditado_por: currentUser?.nome || currentUser?.email || '—',
    quantidade_produzida: qtd,
  }).eq('id', demanda.id);
  if (error) return { ...r, avisoMarcacao: error.message };
  return r;
}

/**
 * Único caminho para mexer no estoque — chama a função do banco.
 * Devolve o que ela responder:
 *   { ignorado: true }  → item sem controle, nada aconteceu (é o esperado)
 *   { ok: true, saldo_depois, abaixo_do_minimo, sugestao_compra, negativo }
 *   { erro: '...' }
 */
export async function movimentarEstoque({
  itemId, tipo, quantidade, motivo = null, observacoes = null,
  vinculo = null, retiradoPor = null, currentUser = null,
  estado = 'acabado',
}: any) {
  if (!itemId) return { ignorado: true, motivo: 'Sem item cadastrado.' };
  const { data, error } = await supabase.rpc('estoque_movimentar', {
    p_item_id: itemId,
    p_tipo: tipo,
    p_quantidade: num(quantidade),
    p_motivo: motivo,
    p_observacoes: observacoes,
    p_vinculo_tipo: vinculo?.tipo || null,
    p_vinculo_id: vinculo?.id ? String(vinculo.id) : null,
    p_vinculo_descricao: vinculo?.descricao || null,
    p_retirado_por_nome: retiradoPor || null,
    p_criado_por: currentUser?.email || null,
    p_criado_por_nome: currentUser?.nome || null,
    p_estado: estado || 'acabado',
  });
  if (error) return { erro: error.message };
  const r = data || { erro: 'Resposta vazia do banco.' };

  // A compra automática mora aqui dentro de propósito: assim toda saída que
  // fura o mínimo pede reposição, venha ela do kiting, do balcão ou de uma
  // contagem que revelou menos do que se pensava. Nenhuma tela pode esquecer.
  //
  // A conta de "precisa repor" é refeita aqui, no disponível, em vez de confiar
  // no abaixo_do_minimo que o banco devolve — aquele olha só a prateleira e não
  // sabe o que já foi prometido a OPs. Item com 20 no saldo e 20 reservados
  // está sem material, e o banco diria que está tudo bem (Etapa 4).
  if (r.ok) {
    const lidaReservas = await lerReservadoPorItem([String(itemId)]);
    const reservado = lidaReservas.mapa.get(String(itemId)) || 0;
    const { data: item, error: erroItem } = await supabase.from('cadastro_itens')
      .select('id,codigo,nome,unidade,estoque_atual,estoque_minimo,estoque_ideal,origem_producao,setor_fabricante,'
        + 'tem_inacabado,estoque_inacabado,inacabado_minimo,inacabado_ideal,servico_acabamento,servico_bruto')
      .eq('id', itemId).maybeSingle();
    // 7.x (15/10/2026): leitura recusada aqui cancelava a conferência do mínimo em silêncio — a saída era gravada e o pedido de reposição nunca nascia.
    // O movimento já está gravado (e não se desfaz); o que volta é o aviso, que as telas mostram com avisosDaReposicao().
    if (lidaReservas.erro || erroItem) {
      r.avisoReposicao = `O movimento foi gravado, mas não foi possível conferir se o item precisa de reposição (${lidaReservas.erro || erroItem.message}).`;
    }
    // Item de dois estados tem regra própria: o que repõe a prateleira não é
    // uma compra, é um dos dois serviços da cadeia (corte e dobra → pintura).
    // Pedir a peça a um fornecedor aqui seria comprar o que a fábrica manda fazer.
    else if (item && temDoisEstados(item)) {
      r.reservado = reservado;
      r.disponivel = num(item.estoque_atual) - reservado;
      r.servicos = await conferirDoisEstados({ item, reservado, currentUser });
    } else if (item) {
      const n = necessidadeDeReposicao({
        saldo: r.saldo_depois, reservado,
        minimo: item.estoque_minimo, ideal: item.estoque_ideal,
      });
      r.reservado = reservado;
      r.disponivel = n.disponivel;
      // movimento é da prateleira: repõe o estoque. A falta de OP tem dono e
      // nasce na liberação, não aqui.
      const quantidade = n.reposicao > 0 ? n.reposicao : n.faltaOp;
      if (quantidade > 0) {
        r.requisicao = await garantirRequisicaoReposicao({
          item, quantidade, saldo: r.saldo_depois,
          reservado, disponivel: n.disponivel, currentUser,
        });
      }
    }
  }
  return r;
}

/** O que deu errado na reposição automática que acompanha um movimento (7.x, 15/10/2026). O movimento em si já está gravado; sem isto, o pedido que não nasceu
 *  não era avisado a ninguém — a tela dizia "registrada" e a prateleira ficava no mínimo sem pedido aberto. Lista vazia = nada a avisar. */
export function avisosDaReposicao(r: any): string[] {
  const avisos: string[] = [];
  const comPonto = (t: string) => (/[.!?]$/.test(t) ? t : t + '.');
  if (r?.avisoReposicao) avisos.push(comPonto(r.avisoReposicao));
  if (r?.requisicao?.erro) avisos.push(comPonto(`A reposição automática não foi aberta: ${r.requisicao.erro}`));
  for (const s of r?.servicos || []) if (s?.erro) avisos.push(comPonto(`O pedido de ${SERVICOS[s.servico]?.rotulo || 'serviço'} não foi aberto: ${s.erro}`));
  if (avisos.length) avisos[avisos.length - 1] += ' Use "Conferir mínimos" no painel de estoque, ou peça ao Compras.';
  return avisos;
}

/**
 * Baixa do kit de uma OP, a partir das linhas da conferência.
 *
 * Baixa a DIFERENÇA, não o valor cheio: o kit é conferido mais de uma vez
 * quando sai "liberado com pendência" e a pendência é sanada depois, e baixar
 * tudo de novo contaria o material duas vezes. Então soma o que esta OP já
 * consumiu no extrato e movimenta só o que falta — se a conferência diminuiu
 * (material voltou para a prateleira), devolve ao estoque.
 *
 * Linha sem `item_id` (item fora do cadastro) e item sem controle passam
 * batido, de propósito: é o controle progressivo combinado em 24/09/2026.
 */
/** Quanto cada item desta OP já saiu do estoque, pelo extrato. */
async function lerJaBaixadoNaOp(oplId: string) {
  const { data, error } = await supabase.from('estoque_movimentos')
    .select('item_id,tipo,quantidade')
    .eq('vinculo_tipo', 'op').eq('vinculo_id', String(oplId)).eq('motivo', MOTIVO.KITING);
  const mapa = new Map<string, number>();
  (data || []).forEach((m: any) => {
    const sinal = m.tipo === 'saida' ? 1 : -1;
    mapa.set(m.item_id, (mapa.get(m.item_id) || 0) + sinal * num(m.quantidade));
  });
  // 7.x (15/10/2026): extrato ilegível valia como "nada baixado ainda" — e a baixa do kit, que trabalha pela diferença, tirava tudo de novo do estoque
  return { mapa, erro: error ? error.message : '' };
}

/**
 * Saldo de cada item da lista, para o checklist do Almoxarifado saber o que dá
 * para marcar como separado (Etapa 8, 28/09/2026).
 *
 * Vem o saldo FÍSICO, não o disponível — pelo mesmo motivo da trava do Kit
 * 100%: na prateleira vale quem chega primeiro. E vem o que esta OP já baixou,
 * porque numa separação salva pela metade o que falta tirar é a diferença.
 */
export async function saldosDoKit({ opl, linhas }: any) {
  const ids = [...new Set((linhas || []).map((l: any) => l?.item_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data: itens } = await supabase.from('cadastro_itens')
    .select('id,estoque_atual,controla_estoque,unidade').in('id', ids);
  const jaBaixado = (await lerJaBaixadoNaOp(opl.id)).mapa;
  const mapa: any = {};
  (itens || []).forEach((i: any) => {
    mapa[i.id] = {
      controla: !!i.controla_estoque, saldo: num(i.estoque_atual),
      jaBaixado: jaBaixado.get(i.id) || 0, unidade: i.unidade || 'UN',
    };
  });
  return mapa;
}

/**
 * Itens controlados que não têm saldo para o que o kit ainda precisa tirar.
 *
 * Olha a DIFERENÇA, pelo mesmo motivo da baixa: conferir de novo um kit já
 * baixado não pede material nenhum, e acusar falta aí seria mentira.
 * Devolve [] quando está tudo certo — inclusive quando não há item controlado.
 */
export async function faltaDeEstoqueNoKit({ opl, linhas }: any) {
  const comItem = (linhas || []).filter((l: any) => l?.item_id);
  if (!comItem.length) return [];
  const { data: itens, error: erroItens } = await supabase.from('cadastro_itens')
    .select('id,codigo,nome,unidade,estoque_atual,controla_estoque')
    .in('id', comItem.map((l: any) => l.item_id));
  // 7.x (15/10/2026): esta é a TRAVA do Kit 100%. Leitura recusada devolvia "nenhum item controlado" e a trava abria sozinha. Agora devolve uma linha de erro,
  // que o chamador mostra na lista do que impede o fechamento (textoFaltaEstoque) — e o kit não fecha sem a conferência.
  if (erroItens) return [{ erro: `não foi possível conferir o estoque (${erroItens.message}); tente de novo` }];
  const controlados = new Map((itens || []).filter((i: any) => i.controla_estoque).map((i: any) => [i.id, i]));
  if (!controlados.size) return [];

  const lidoBaixado = await lerJaBaixadoNaOp(opl.id);
  if (lidoBaixado.erro) return [{ erro: `não foi possível conferir o que a OP já baixou (${lidoBaixado.erro}); tente de novo` }];
  const jaBaixado = lidoBaixado.mapa;
  // A trava olha o SALDO FÍSICO, não o disponível. Na hora do kiting o que vale
  // é o que dá para tirar da prateleira: se há 20 peças e esta OP quer 15, ela
  // pode ser separada, mesmo que outra OP também esteja contando com elas —
  // quem chega primeiro leva, e a outra vira falta a ser comprada ou fabricada.
  //
  // Travar pelo disponível (descontando a reserva alheia) prendia as DUAS OPs
  // quando havia material para uma. Erro pego no teste da Etapa 3, em
  // 25/09/2026, antes de subir.
  //
  // A reserva das outras entra só como AVISO, para o Almoxarifado saber que
  // levar este material deixa outra OP a descoberto.
  const reservadoTotal = await reservadoPorItem([...controlados.keys()]);
  const reservadoDestaOp = await reservaDaOp(opl.id);
  const faltando: any[] = [];
  for (const l of comItem) {
    const item: any = controlados.get(l.item_id);
    if (!item) continue;                                   // sem controle: passa batido
    const precisa = num(l.separado) - (jaBaixado.get(l.item_id) || 0);
    const saldo = num(item.estoque_atual);
    if (precisa > saldo) {
      const deOutras = Math.max(0, (reservadoTotal.get(l.item_id) || 0) - (reservadoDestaOp.get(l.item_id) || 0));
      faltando.push({ nome: item.nome, codigo: item.codigo, unidade: item.unidade,
        precisa, saldo, reservadoOutras: deOutras, falta: precisa - saldo });
    }
  }
  return faltando;
}

/**
 * Aviso (não trava): levar este material deixa outra OP a descoberto.
 *
 * Existe porque a trava passou a olhar só o saldo físico. Sem este aviso, o
 * Almoxarifado separaria o kit sem saber que acabou de furar o material de
 * outra OP já liberada.
 */
export async function reservaDeOutrasNoKit({ opl, linhas }: any) {
  const comItem = (linhas || []).filter((l: any) => l?.item_id);
  if (!comItem.length) return [];
  const lidoTotal = await lerReservadoPorItem(comItem.map((l: any) => l.item_id));
  // 7.x (15/10/2026): é um AVISO (não trava). Leitura recusada o fazia sumir, e o kit levava o material de outra OP sem ninguém saber; agora volta uma linha de erro,
  // que a tela mostra na pergunta "fechar o kit assim mesmo?" (textoReservaDeOutras).
  if (lidoTotal.erro) return [{ erro: `não foi possível conferir as reservas de outras OPs (${lidoTotal.erro})` }];
  const reservadoTotal = lidoTotal.mapa;
  if (!reservadoTotal.size) return [];
  const lidoDaOp = await lerReservaDaOp(opl.id);
  if (lidoDaOp.erro) return [{ erro: `não foi possível conferir as reservas desta OP (${lidoDaOp.erro})` }];
  const reservadoDestaOp = lidoDaOp.mapa;
  const { data: itens } = await supabase.from('cadastro_itens')
    .select('id,nome,unidade,estoque_atual,controla_estoque').in('id', comItem.map((l: any) => l.item_id));
  const porId = new Map((itens || []).filter((i: any) => i.controla_estoque).map((i: any) => [i.id, i]));
  const avisos: any[] = [];
  for (const l of comItem) {
    const item: any = porId.get(l.item_id);
    if (!item) continue;
    const deOutras = Math.max(0, (reservadoTotal.get(l.item_id) || 0) - (reservadoDestaOp.get(l.item_id) || 0));
    if (!deOutras) continue;
    const sobra = num(item.estoque_atual) - num(l.separado);
    if (sobra < deOutras) {
      avisos.push({ nome: item.nome, unidade: item.unidade, reservadoOutras: deOutras,
        sobra: Math.max(0, sobra), descoberto: deOutras - Math.max(0, sobra) });
    }
  }
  return avisos;
}

export const textoReservaDeOutras = (avisos: any[]) =>
  (avisos || []).map(a => a.erro ? `• ${a.erro}` : `• ${a.nome}: outra(s) OP(s) contam com ${fmtQtd(a.reservadoOutras)} ${a.unidade || 'UN'}, `
    + `mas sobram ${fmtQtd(a.sobra)} — ficam ${fmtQtd(a.descoberto)} a descoberto`).join('\n');

/** Texto do que falta, para a mensagem da trava. */
export const textoFaltaEstoque = (faltando: any[]) =>
  (faltando || []).map(f => f.erro ? `• ${f.erro}` : `• ${f.codigo ? f.codigo + ' — ' : ''}${f.nome}: precisa de ${fmtQtd(f.precisa)}, `
    + `tem ${fmtQtd(f.saldo)} ${f.unidade || 'UN'} (faltam ${fmtQtd(f.falta)})`
    + (num(f.reservadoOutras) > 0 ? ` — e ${fmtQtd(f.reservadoOutras)} já está reservado para outra OP` : '')).join('\n');

export async function baixarKitDaOp({ opl, linhas, currentUser }: any) {
  const resumo = { movimentados: [] as any[], ignorados: 0, semCadastro: 0, negativos: [] as any[], erros: [] as string[], requisicoes: [] as any[] };
  const comItem = (linhas || []).filter((l: any) => l?.item_id);
  resumo.semCadastro = (linhas || []).length - comItem.length;
  if (!comItem.length) return resumo;

  const lidoBaixado = await lerJaBaixadoNaOp(opl.id);
  // 7.x (15/10/2026): sem saber o que a OP já baixou, não se baixa nada — a baixa é pela diferença, e o mapa vazio fazia o kit inteiro sair do estoque de novo
  if (lidoBaixado.erro) {
    resumo.erros.push(`não foi possível conferir o que esta OP já baixou (${lidoBaixado.erro}); nenhuma baixa foi feita — confira o estoque antes de tentar de novo, para não baixar em dobro`);
    return resumo;
  }
  const jaBaixado = lidoBaixado.mapa;
  const vinculo = { tipo: 'op', id: opl.id, descricao: `OP ${opl.opl}` };
  for (const l of comItem) {
    const delta = num(l.separado) - (jaBaixado.get(l.item_id) || 0);
    if (delta === 0) continue;
    const r = await movimentarEstoque({
      itemId: l.item_id,
      tipo: delta > 0 ? 'saida' : 'entrada',
      quantidade: Math.abs(delta),
      motivo: MOTIVO.KITING,
      observacoes: delta < 0 ? 'Devolução: a conferência do kit diminuiu.' : null,
      vinculo, currentUser,
    });
    if (r?.erro) { resumo.erros.push(`${l.nome}: ${r.erro}`); continue; }
    if (r?.ignorado) { resumo.ignorados++; continue; }
    resumo.movimentados.push({ nome: l.nome, delta, ...r });
    if (r?.negativo) resumo.negativos.push({ nome: l.nome, saldo: r.saldo_depois });
    if (r?.requisicao?.criada) resumo.requisicoes.push({ nome: l.nome, ...r.requisicao });
    // 7.x: a reposição que não nasceu aparece junto do que deu errado na baixa (textoDaBaixa → "erro em: …")
    avisosDaReposicao(r).forEach(a => resumo.erros.push(`${l.nome}: ${a}`));

    // O material saiu de verdade: a reserva cumpriu o papel dela, na medida em
    // que cumpriu. Se ficasse de pé, o disponível descontaria a mesma peça duas
    // vezes — uma pelo saldo que baixou, outra pela reserva que continuaria
    // segurando. E se fosse encerrada inteira numa baixa parcial, mentiria para
    // o outro lado (ver consumirReserva).
    const ajusteReserva = delta > 0
      ? await consumirReserva({ oplId: opl.id, itemId: l.item_id, quantidade: delta, currentUser })
      : await devolverReserva({ oplId: opl.id, itemId: l.item_id, quantidade: -delta });
    if (ajusteReserva?.erro) resumo.erros.push(`${l.nome}: o estoque ${delta > 0 ? 'baixou' : 'recebeu a devolução'}, mas a reserva da OP não foi atualizada (${ajusteReserva.erro})`);
  }
  return resumo;
}

/** Aviso do que NÃO foi possível pedir ao liberar a OP (7.x, 15/10/2026): antes a OP era liberada achando que o que faltava já estava pedido. '' quando não houve falha. */
export function textoFalhasDosPedidos(falhas: string[]) {
  if (!falhas?.length) return '';
  return `A OP foi liberada e o material reservado, mas o que faltava NÃO foi pedido por completo:\n\n${falhas.map(f => `  • ${f}`).join('\n')}\n\nUse "Conferir mínimos" no painel de estoque, ou peça ao Compras.`;
}

/** Aviso do que foi pedido sozinho ao liberar a OP. */
export function textoPedidosDaReserva(pedidos: any[]) {
  if (!pedidos?.length) return '';
  const daOp = pedidos.filter(p => p.para === 'OP');
  const doEstoque = pedidos.filter(p => p.para !== 'OP');
  const linhas: string[] = ['Faltou material e os pedidos já foram abertos sozinhos:', ''];
  if (daOp.length) {
    linhas.push('PARA ESTA OP ANDAR (prioridade):');
    daOp.forEach(p => linhas.push(`  • ${p.nome}: ${fmtQtd(p.quantidade)} → ${paraQuem(p)}`));
    linhas.push('');
  }
  if (doEstoque.length) {
    linhas.push('PARA REPOR A PRATELEIRA (depois):');
    doEstoque.forEach(p => linhas.push(`  • ${p.nome}: ${fmtQtd(p.quantidade)} → ${paraQuem(p)}`));
    linhas.push('');
  }
  linhas.push('São dois pedidos separados de propósito: o da OP pode ser atendido primeiro.');
  return linhas.join('\n');
}

/** Para quem foi o pedido de reposição — o Compras ou a bancada de um setor. */
export function paraQuem(req: any) {
  if (!req) return '—';
  return req.caminho === 'fabricacao'
    ? `fabricação no setor de ${req.setor || 'origem'}${req.referencia ? ` (${req.referencia})` : ''}`
    : `Compras${req.numero_pedido ? ` (${req.numero_pedido})` : ''}`;
}

/** Frase curta do que a baixa fez, para o aviso na tela. '' quando não houve nada. */
export function textoDaBaixa(resumo: any) {
  if (!resumo) return '';
  const partes: string[] = [];
  if (resumo.movimentados?.length) partes.push(`${resumo.movimentados.length} item(ns) deram baixa no estoque`);
  if (resumo.ignorados) partes.push(`${resumo.ignorados} sem controle (seguiram normal)`);
  if (resumo.negativos?.length) partes.push(`⚠️ saldo negativo em: ${resumo.negativos.map((n: any) => n.nome).join(', ')}`);
  if (resumo.requisicoes?.length) partes.push(`reposição pedida: ${resumo.requisicoes.map((r: any) => `${r.nome} → ${paraQuem(r)}`).join(', ')}`);
  if (resumo.erros?.length) partes.push(`erro em: ${resumo.erros.join(' · ')}`);
  return partes.join(' · ');
}

/** Carrega os itens que estão sob controle, com saldo e mínimo.
 *  origem_producao e setor_fabricante vêm junto porque decidem por onde a
 *  reposição sai: compra lá fora ou bancada aqui dentro. */
export async function lerItensControlados() {
  const { data, error } = await supabase.from('cadastro_itens')
    .select('id,codigo,nome,unidade,estoque_atual,estoque_minimo,estoque_ideal,ativo,origem_producao,setor_fabricante,'
      + 'tem_inacabado,estoque_inacabado,inacabado_minimo,inacabado_ideal,servico_acabamento,servico_bruto,categoria_estoque_id')
    .eq('controla_estoque', true).order('nome');
  // 7.x (15/10/2026): leitura recusada virava lista vazia — o painel dizia "Nenhum item sob controle ainda" e a janela de retirada, "nenhum item"
  return { itens: (data || []) as any[], erro: error ? error.message : '' };
}
export async function carregarItensControlados() {
  return (await lerItensControlados()).itens;
}

/** Situação do item: só para pintar a tela, a conta que vale é a do banco. */
export function situacaoEstoque(item: any) {
  const saldo = num(item?.estoque_atual);
  const minimo = item?.estoque_minimo == null ? null : num(item.estoque_minimo);
  // 12e66 (16/10/2026): a cor do selo saiu daqui — quem pinta é a classe com o nome da situação (`acn-est-selo` e `acn-est-pe-sit` + `chave`), no `design.css`
  if (saldo < 0) return { chave: 'negativo', texto: 'saldo negativo' };
  if (saldo === 0) return { chave: 'zerado', texto: 'sem saldo' };
  if (minimo != null && saldo <= minimo) return { chave: 'abaixo', texto: 'abaixo do mínimo' };
  return { chave: 'ok', texto: 'ok' };
}

/** Selo de saldo, para as telas que mostram item controlado. */
export function SeloEstoque({ item, compacto = false }: any) {
  if (!item?.controla_estoque) return null;
  const s = situacaoEstoque(item);
  return (
    <span title={`Saldo ${fmtQtd(item.estoque_atual)}${item.estoque_minimo != null ? ` · mínimo ${fmtQtd(item.estoque_minimo)}` : ''}`}
      className={'acn-est-selo ' + s.chave + (compacto ? ' compacto' : '')}>
      📦 {fmtQtd(item.estoque_atual)} {item.unidade || 'UN'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS NO CADASTRO DO ITEM — o checkbox que liga tudo
// ─────────────────────────────────────────────────────────────────────────────
export function CamposEstoqueItem({ form, set, currentUser }: any) {
  const pode = podeGerirEstoque(currentUser);
  const ligado = !!form.controla_estoque;
  const dois = !!form.tem_inacabado;

  return (
    <div className={'acn-est-ce-box' + (ligado ? ' ligado' : '')}>
      <label className={'acn-est-ce-chk' + (ligado ? ' ligado' : '') + (pode ? '' : ' bloq')}>
        <input type="checkbox" checked={ligado} disabled={!pode}
          onChange={e => set('controla_estoque', e.target.checked)} className={'acn-est-ce-cb' + (pode ? '' : ' bloq')} />
        📦 Controlar o estoque deste item
      </label>
      <div className="acn-est-ce-ajuda">
        {ligado
          ? 'Ligado: este item dá baixa quando sai, confere o mínimo, pede compra sozinho quando falta e trava a liberação se não houver saldo.'
          : 'Desligado: o item circula normalmente, sem baixa, sem mínimo e sem travar nada. Ligue só depois de contar o que existe na prateleira.'}
      </div>
      {!pode && (
        <div className="acn-est-ce-so-gerencia">
          Só o Almoxarifado e a gerência ligam ou desligam o controle.
        </div>
      )}

      {ligado && (
        <div className="acn-est-ce-grade">
          <div>
            <div className="acn-est-ce-lbl">Saldo atual</div>
            <div className="acn-est-ce-inp fixo">
              {fmtQtd(form.estoque_atual)} {form.unidade || 'UN'}
            </div>
            <div className="acn-est-ce-nota">
              muda só por contagem, baixa ou entrada — não se digita aqui
            </div>
          </div>
          <div>
            <div className="acn-est-ce-lbl">Estoque mínimo</div>
            <input type="number" min={0} step="any" className="acn-est-ce-inp" value={form.estoque_minimo ?? ''}
              disabled={!pode} onChange={e => set('estoque_minimo', e.target.value)} placeholder="ex.: 10" />
            <div className="acn-est-ce-nota">quando chegar aqui, pede compra</div>
          </div>
          <div>
            <div className="acn-est-ce-lbl">Estoque ideal</div>
            <input type="number" min={0} step="any" className="acn-est-ce-inp" value={form.estoque_ideal ?? ''}
              disabled={!pode} onChange={e => set('estoque_ideal', e.target.value)} placeholder="ex.: 50" />
            <div className="acn-est-ce-nota">até onde repor na compra</div>
          </div>
        </div>
      )}
      {ligado && form.estoque_minimo != null && form.estoque_ideal != null
        && num(form.estoque_ideal) > 0 && num(form.estoque_ideal) <= num(form.estoque_minimo) && (
        <div className="acn-est-ce-aviso-ideal">
          ⚠️ O ideal precisa ser maior que o mínimo, senão a compra automática pede zero.
        </div>
      )}

      {/* DOIS ESTADOS — o caso do suporte (28/09/2026).
          A peça é a mesma; o que muda é se ela já passou pelo acabamento. */}
      {ligado && (
        <div className="acn-est-ce-dois">
          <label className={'acn-est-ce-chk' + (dois ? ' dois' : '') + (pode ? '' : ' bloq')}>
            <input type="checkbox" checked={dois} disabled={!pode}
              onChange={e => set('tem_inacabado', e.target.checked)} />
            🔧 Esta peça é guardada em dois estados (pronta e sem acabamento)
          </label>
          <div className="acn-est-ce-ajuda">
            {dois
              ? 'A produção usa só a pronta. A bruta espera na prateleira porque o acabamento só compensa em quantidade.'
              : 'É o caso do suporte: cortado e dobrado de um lado, já pintado do outro. Ligue só se a fábrica guardar os dois.'}
          </div>

          {dois && (
            <>
              <div className="acn-est-ce-grade">
                <div>
                  <div className="acn-est-ce-lbl">Saldo sem acabamento</div>
                  <div className="acn-est-ce-inp fixo">
                    {fmtQtd(form.estoque_inacabado)} {form.unidade || 'UN'}
                  </div>
                  <div className="acn-est-ce-nota">muda quando o serviço volta</div>
                </div>
                <div>
                  <div className="acn-est-ce-lbl">Mínimo sem acabamento</div>
                  <input type="number" min={0} step="any" className="acn-est-ce-inp" value={form.inacabado_minimo ?? ''}
                    disabled={!pode} onChange={e => set('inacabado_minimo', e.target.value)} placeholder="ex.: 20" />
                  <div className="acn-est-ce-nota">aqui pede corte e dobra</div>
                </div>
                <div>
                  <div className="acn-est-ce-lbl">Ideal sem acabamento</div>
                  <input type="number" min={0} step="any" className="acn-est-ce-inp" value={form.inacabado_ideal ?? ''}
                    disabled={!pode} onChange={e => set('inacabado_ideal', e.target.value)} placeholder="ex.: 100" />
                  <div className="acn-est-ce-nota">até onde repor de peça bruta</div>
                </div>
              </div>

              <div className="acn-est-ce-linha9">
                <div className="acn-est-ce-lbl">O que falta para ficar pronta — o comprador lê isto para cotar</div>
                <input className="acn-est-ce-inp" value={form.servico_acabamento || ''} disabled={!pode}
                  onChange={e => set('servico_acabamento', e.target.value)}
                  placeholder="ex.: pintura eletrostática preta" />
              </div>
              <div className="acn-est-ce-linha7">
                <div className="acn-est-ce-lbl">Como a peça bruta nasce</div>
                <input className="acn-est-ce-inp" value={form.servico_bruto || ''} disabled={!pode}
                  onChange={e => set('servico_bruto', e.target.value)}
                  placeholder="ex.: corte a laser e dobra, chapa 3mm" />
              </div>
              <div className="acn-est-ce-fluxo">
                Pronta no mínimo → pede o acabamento da peça bruta que houver.
                Se não houver bruta suficiente, sai junto o pedido de corte e dobra do que falta.
                Bruta no mínimo → pede corte e dobra. As duas vão para o Compras.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRUTURA DO CHICOTE — editor embutido no Cadastro de Itens (Etapa 9)
//
// Aparece só no chicote (fabricação interna do setor Chicotes) que já foi
// salvo — precisa do id para pendurar os materiais nele. Cadastrar aqui não
// obriga nada: chicote sem estrutura continua funcionando como sempre
// (crédito de estoque sem baixar material nenhum).
// ─────────────────────────────────────────────────────────────────────────────
function useTodosOsItens() {
  const [itens, setItens] = useState<any[]>([]);
  useEffect(() => {
    // paginado: o servidor corta em 1.000 linhas e o material (fio, terminal…)
    // ficava restrito ao começo do alfabeto (achado A8, 29/09/2026)
    itensAtivosDoCatalogo('id,codigo,nome,unidade')
      .then(setItens);
  }, []);
  return itens;
}

export function CamposEstruturaChicote({ item, currentUser }: any) {
  const pode = podeGerirEstoque(currentUser);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [materialId, setMaterialId] = useState('');
  const [qtdNova, setQtdNova] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroLeitura, setErroLeitura] = useState('');
  const todosOsItens = useTodosOsItens();

  const carregar = async () => {
    setCarregando(true);
    const lida = await lerMateriaisDoChicote(item.id);
    // 7.x (15/10/2026): leitura recusada virava "Nenhum material cadastrado ainda" — e a pessoa cadastrava de novo o que já existia
    if (lida.erro) setErroLeitura(lida.erro); else { setErroLeitura(''); setMateriais(lida.materiais); }
    setCarregando(false);
  };
  useEffect(() => { if (item?.id) carregar(); }, [item?.id]);

  const jaTem = new Set(materiais.map(m => m.material_item_id));
  const opcoes = todosOsItens
    .filter(i => i.id !== item.id && !jaTem.has(i.id))
    .map(i => ({ valor: i.id, rotulo: `${i.codigo ? i.codigo + ' · ' : ''}${i.nome}`, detalhe: i.unidade || 'UN', busca: [i.codigo, i.nome] }));

  const adicionar = async () => {
    if (!materialId) { alert('Escolha o material.'); return; }
    if (!(num(qtdNova) > 0)) { alert('Informe a quantidade por unidade do chicote.'); return; }
    setSalvando(true);
    const r = await adicionarMaterialChicote({ chicoteItemId: item.id, materialItemId: materialId, quantidade: qtdNova, currentUser });
    setSalvando(false);
    if (r?.erro) { alert('Não foi possível adicionar: ' + r.erro); return; }
    setMaterialId(''); setQtdNova('');
    carregar();
  };

  const remover = async (m: any) => {
    if (!await confirmar(`Remover "${m.material?.nome || 'este material'}" da estrutura deste chicote?`)) return;
    const r = await removerMaterialChicote(m.id);
    if (r?.erro) { alert('Não foi possível remover: ' + r.erro); return; }
    carregar();
  };

  if (!item?.id) return (
    <div className="acn-est-ch-nota-i">
      Salve o item primeiro para cadastrar a estrutura de material.
    </div>
  );

  return (
    <div className="acn-est-ch-caixa">
      <div className="acn-est-ch-titulo">🧵 Estrutura deste chicote</div>
      <div className="acn-est-ch-ajuda">
        Quanto de cada material 1 unidade deste chicote consome ao ser fabricada — fio por cor, conexão,
        terminal. Ao dar entrada no estoque desta fabricação, o sistema desconta isto sozinho, na quantidade
        que o setor de fato produziu. Sem nada aqui, a entrada credita só o chicote, como sempre foi.
      </div>

      {erroLeitura && !carregando && (
        <div className="acn-est-erro">
          Não foi possível ler a estrutura deste chicote ({erroLeitura}).{materiais.length ? ' A lista abaixo pode estar desatualizada.' : ' Não dá para saber o que já está cadastrado.'}{' '}
          <Botao className="acn-est-b acn-est-erro-bt" onClick={carregar}>Tentar de novo</Botao>
        </div>
      )}
      {carregando ? (
        <div className="acn-est-ch-dim">Carregando...</div>
      ) : materiais.length === 0 ? (
        !erroLeitura && <div className="acn-est-ch-vazio">Nenhum material cadastrado ainda.</div>
      ) : (
        <div className="acn-est-ch-lista">
          {materiais.map(m => (
            <div className="acn-est-ch-linha" key={m.id}>
              <span className="acn-est-ch-nome">
                {m.material?.codigo ? m.material.codigo + ' · ' : ''}{m.material?.nome}
                {!m.material?.controla_estoque && (
                  <span className="acn-est-ch-un">(sem controle de estoque ligado)</span>
                )}
              </span>
              <span className="acn-est-ch-qtd">
                {fmtQtd(m.quantidade)} {m.material?.unidade || 'UN'} / chicote
              </span>
              {pode && (
                <Botao className="acn-est-b acn-est-ch-remover" onClick={() => remover(m)} title="Remover">
                  ✕
                </Botao>
              )}
            </div>
          ))}
        </div>
      )}

      {pode && (
        <div className="acn-est-ch-form">
          <div className="acn-est-ch-campo">
            <div className="acn-est-ch-rotulo">Material</div>
            <SelectBusca valor={materialId} onChange={setMaterialId} opcoes={opcoes}
              placeholder="— escolha o material —" vazio="— nenhum material —" />
          </div>
          <div className="acn-est-ch-campo-qtd">
            <div className="acn-est-ch-rotulo">Qtd / chicote</div>
            <input className="acn-est-ch-entrada" type="number" min={0} step="any" value={qtdNova} onChange={e => setQtdNova(e.target.value)} />
          </div>
          <Botao className="acn-est-b acn-est-ch-adicionar" onClick={adicionar} disabled={salvando}>
            {salvando ? '...' : '+ Adicionar'}
          </Botao>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RETIRADA — alguém veio pedir material no balcão
//
// A lista é do que saiu, com quantidade e quem levou. Só aparecem itens sob
// controle: item sem controle não tem saldo para baixar, e registrar a saída
// dele aqui criaria um extrato que não movimenta nada — meia verdade pior que
// silêncio. Para passar a controlar um item, use o painel de estoque.
// ─────────────────────────────────────────────────────────────────────────────
// `chave` identifica a linha: a retirada registrada pela metade tira da lista só as linhas que saíram (7.x, 15/10/2026), e para isso a linha precisa de um nome que não mude quando a pessoa digita
let contadorLinhaRetirada = 0;
const linhaRetiradaVazia = () => ({ chave: ++contadorLinhaRetirada, item: null, quantidade: '' });

export function ModalRetirada({ currentUser, onClose, onFeito }: any) {
  const [linhas, setLinhas] = useState<any[]>([linhaRetiradaVazia()]);
  const [quemRetirou, setQuemRetirou] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [disponiveis, setDisponiveis] = useState<any[]>([]);
  // PARA ONDE FOI O MATERIAL (28/09/2026)
  //
  // Saber quem levou não diz para que serviu. Sem isso, o material que sai
  // pelo balcão some da conta: não aparece no custo da OP nem no do setor, e
  // no fim do mês ninguém sabe explicar o consumo. Amarrar a retirada a uma OP
  // ou a um centro de custo é o que fecha essa conta.
  //
  // Continua opcional: material de uso geral (fita, pano, parafuso avulso)
  // sai sem destino, como sempre saiu.
  const [destino, setDestino] = useState<'nenhum' | 'op' | 'centro'>('nenhum');
  const [opls, setOpls] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [oplId, setOplId] = useState('');
  const [centroId, setCentroId] = useState('');

  // 7.x (15/10/2026): as três leituras desta janela (itens, OPs e centros) ignoravam o erro — a lista vinha vazia e a janela dizia "nenhum item" ou deixava
  // o destino sem opção, sem explicar. Agora a falha aparece com "Tentar de novo".
  const [erroDestino, setErroDestino] = useState('');
  const [erroItens, setErroItens] = useState('');
  const carregarDestino = async (qual: string) => {
    setErroDestino('');
    if (qual === 'op') {
      const { data, error } = await supabase.from('oples').select('id,opl,cliente_nome,status_geral')
        .not('status_geral', 'in', '("Faturado","Cancelado")')
        .order('opl', { ascending: false }).limit(400);
      if (error) setErroDestino(`Não foi possível ler as OPs (${error.message}).`); else setOpls(data || []);
    }
    if (qual === 'centro') {
      // Etapa 15a (05/10/2026): só os que recebem lançamento e estão na vigência
      const { data, error } = await supabase.from('centros_custo').select('id,codigo,nome,ativo,recebe_lancamento,vigencia_inicio,vigencia_fim').eq('ativo', true).order('nome');
      if (error) setErroDestino(`Não foi possível ler os centros de custo (${error.message}).`); else setCentros((data || []).filter(centroDisponivel));
    }
  };
  useEffect(() => {
    setErroDestino('');
    if (destino === 'op' && !opls.length) carregarDestino('op');
    if (destino === 'centro' && !centros.length) carregarDestino('centro');
  }, [destino]);

  /** O vínculo que vai junto com cada linha da retirada. */
  const vinculoDaRetirada = () => {
    if (destino === 'op') {
      const o = opls.find(x => x.id === oplId);
      return o ? { tipo: 'op', id: o.id, descricao: `OP ${o.opl}` } : null;
    }
    if (destino === 'centro') {
      const c = centros.find(x => x.id === centroId);
      return c ? { tipo: 'centro_custo', id: c.id, descricao: `${c.codigo ? c.codigo + ' · ' : ''}${c.nome}` } : null;
    }
    return null;
  };
  // Baixa de estoque não tem desfazer: o saldo muda e o extrato registra. Por
  // isso o botão não grava direto — mostra a lista do que vai sair e pede
  // confirmação (pedido do usuário em 24/09/2026). Dizer "não" volta para a
  // lista do jeito que estava, para ajustar.
  const [conferindo, setConferindo] = useState(false);

  const carregarItens = async () => {
    const lida = await lerItensControlados();
    if (lida.erro) setErroItens(lida.erro); else { setErroItens(''); setDisponiveis(lida.itens); }
  };
  useEffect(() => { carregarItens(); }, []);

  const set = (i: number, patch: any) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const preenchidas = linhas.filter(l => l.item && num(l.quantidade) > 0);

  /** Confere antes de gravar: valida o que é obrigatório e abre a revisão. */
  const revisar = () => {
    if (!quemRetirou.trim()) { alert('Informe quem retirou o material.'); return; }
    if (!preenchidas.length) { alert('Informe ao menos um item e a quantidade.'); return; }
    if (destino === 'op' && !oplId) { alert('Escolha a OP para onde o material foi.'); return; }
    if (destino === 'centro' && !centroId) { alert('Escolha o centro de custo.'); return; }
    const repetidos = preenchidas.map(l => l.item.id).filter((id, i, a) => a.indexOf(id) !== i);
    if (repetidos.length) {
      const nomes = [...new Set(repetidos)].map(id => disponiveis.find(d => d.id === id)?.nome).join(', ');
      if (!confirm(`O mesmo item aparece em mais de uma linha (${nomes}).\n\nAs quantidades vão somar. Seguir assim?`)) return;
    }
    setConferindo(true);
  };

  const gravar = async () => {
    setSalvando(true);
    const falhas: string[] = [];
    const negativos: string[] = [];
    const pedidos: string[] = [];
    const semReposicao: string[] = [];
    const registradas: any[] = [];
    const vinculo = vinculoDaRetirada();
    for (const l of preenchidas) {
      const r = await movimentarEstoque({
        itemId: l.item.id, tipo: 'saida', quantidade: l.quantidade,
        motivo: MOTIVO.RETIRADA, observacoes: observacoes.trim() || null,
        vinculo, retiradoPor: quemRetirou.trim(), currentUser,
      });
      if (r?.erro) { falhas.push(`${l.item.nome}: ${r.erro}`); continue; }
      // 7.x (15/10/2026): o item que deixou de ser controlado entre a lista e o registro volta "ignorado" — nada foi movimentado, mas passava por registrado
      if (r?.ignorado) { falhas.push(`${l.item.nome}: o item não está mais sob controle de estoque — nada foi movimentado`); continue; }
      registradas.push(l);
      if (r?.negativo) negativos.push(`${l.item.nome} (saldo ${fmtQtd(r.saldo_depois)})`);
      if (r?.requisicao?.criada) pedidos.push(`${l.item.nome}: ${fmtQtd(r.requisicao.quantidade)} → ${paraQuem(r.requisicao)}`);
      avisosDaReposicao(r).forEach(a => semReposicao.push(`${l.item.nome}: ${a}`));
    }
    setSalvando(false);
    setConferindo(false);
    // 7.x: com falha numa linha, as que já saíram do estoque ficavam na lista — tentar de novo as retirava em dobro. Agora saem da lista, e o painel é atualizado.
    if (registradas.length) {
      const chaves = new Set(registradas.map(l => l.chave));
      setLinhas(ls => { const resto = ls.filter(l => !chaves.has(l.chave)); return resto.length ? resto : [linhaRetiradaVazia()]; });
      carregarItens();
      onFeito?.();
    }
    if (falhas.length) {
      alert('Nem tudo foi registrado.\n\n'
        + (registradas.length ? `Já registrado (saiu da lista, não registre de novo):\n${registradas.map(l => l.item.nome).join('\n')}\n\n` : '')
        + `Não registrado (continua na lista, para tentar de novo):\n${falhas.join('\n')}`
        + (semReposicao.length ? `\n\n⚠️ ${semReposicao.join('\n⚠️ ')}` : ''));
      return;
    }
    const avisos = [
      negativos.length ? `Ficou com saldo negativo em:\n${negativos.join('\n')}\n\nVale conferir a prateleira e fazer uma contagem.` : '',
      pedidos.length ? `O estoque bateu no mínimo e a reposição foi pedida ao Compras sozinha:\n${pedidos.join('\n')}` : '',
      semReposicao.length ? `⚠️ ${semReposicao.join('\n⚠️ ')}` : '',
    ].filter(Boolean);
    if (avisos.length) alert('Retirada registrada.\n\n' + avisos.join('\n\n'));
    onClose();
  };

  return (
    <div className="modal-overlay acn-est-sobre">
      <div className="modal-box acn-est-mr-caixa">
        <div className="modal-title">📤 Registrar retirada de material</div>
        <div className="acn-est-dica">
          Só aparecem itens sob controle de estoque. O que não está sob controle sai como sempre, sem registro.
        </div>

        <label className="acn-label">Quem retirou *</label>
        <input className="acn-input acn-est-mr-campo" value={quemRetirou} autoFocus
          onChange={e => setQuemRetirou(e.target.value)} placeholder="Nome de quem levou o material" />

        <label className="acn-label">Para onde foi</label>
        <div className="acn-est-mr-chips">
          {[{ v: 'nenhum', r: 'Uso geral' }, { v: 'op', r: 'Uma OP' }, { v: 'centro', r: 'Centro de custo' }].map(o => (
            <Botao key={o.v} type="button" onClick={() => setDestino(o.v as any)}
              className={'acn-est-b ' + ('acn-est-mr-chip' + (destino === o.v ? ' on' : ''))}>
              {o.r}
            </Botao>
          ))}
        </div>
        {destino === 'op' && (
          <div className="acn-est-mr-bloco">
            <SelectBusca valor={oplId} onChange={setOplId} placeholder="— procure a OP —" vazio="— nenhuma OP —"
              opcoes={opls.map(o => ({ valor: o.id, rotulo: `OP ${o.opl}`,
                detalhe: o.cliente_nome || '', busca: [o.opl, o.cliente_nome] }))} />
          </div>
        )}
        {destino === 'centro' && (
          <div className="acn-est-mr-bloco">
            <SelectBusca valor={centroId} onChange={setCentroId} placeholder="— procure o centro de custo —" vazio="— nenhum —"
              opcoes={centros.map(c => ({ valor: c.id, rotulo: `${c.codigo ? c.codigo + ' · ' : ''}${c.nome}`,
                busca: [c.codigo, c.nome] }))} />
          </div>
        )}
        {destino !== 'nenhum' && erroDestino && (
          <div className="acn-est-mr-erro">
            {erroDestino}{' '}
            <Botao className="acn-est-b acn-est-erro-bt" type="button" onClick={() => carregarDestino(destino)}>Tentar de novo</Botao>
          </div>
        )}
        {destino === 'nenhum' && (
          <div className="acn-est-mr-sem-destino">
            Sem destino o material sai do saldo mas não entra no custo de nenhuma OP nem de nenhum setor.
          </div>
        )}

        {erroItens && (
          <div className="acn-est-erro">
            Não foi possível ler os itens sob controle ({erroItens}). {disponiveis.length ? 'A lista de itens e os saldos podem estar desatualizados.' : 'Sem a lista não dá para escolher o item.'}{' '}
            <Botao className="acn-est-b acn-est-erro-bt" type="button" onClick={carregarItens}>Tentar de novo</Botao>
          </div>
        )}

        <div className="acn-est-mr-rolagem">
          {linhas.map((l, i) => {
            const saldo = l.item ? num(l.item.estoque_atual) : null;
            const pedido = num(l.quantidade);
            const passaDoSaldo = l.item && pedido > saldo;
            return (
              <div className="acn-est-mr-linha" key={l.chave}>
                <div className="acn-est-mr-item">
                  {/* select com busca: hoje são poucos itens sob controle, mas o
                      cadastro tem 4.436 e a lista vai crescer — rolar não serve,
                      tem que dar para digitar (pedido de 24/09/2026) */}
                  <SelectBusca
                    valor={l.item?.id || ''}
                    onChange={(v: string) => set(i, { item: disponiveis.find(d => d.id === v) || null })}
                    placeholder="— escolha o item —" vazio="— nenhum item —"
                    opcoes={disponiveis.map(d => ({
                      valor: d.id,
                      rotulo: `${d.codigo ? d.codigo + ' · ' : ''}${d.nome}`,
                      detalhe: `saldo ${fmtQtd(d.estoque_atual)} ${d.unidade || 'UN'}`,
                      busca: [d.codigo, d.nome],
                    }))} />
                  {passaDoSaldo && (
                    <div className="acn-est-mr-aviso-saldo">
                      Pedido maior que o saldo ({fmtQtd(saldo)}): o saldo vai ficar negativo.
                    </div>
                  )}
                </div>
                <div className="acn-est-cresce">
                  <input type="number" min={0} step="any" className="acn-est-mr-inp" value={l.quantidade}
                    onChange={e => set(i, { quantidade: e.target.value })} placeholder="Qtd" />
                </div>
                <Botao className="acn-est-b acn-est-mr-remover" onClick={async () => { if (!await confirmarRemocao('esta linha da retirada')) return; setLinhas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [linhaRetiradaVazia()]); }}
                  title="Remover linha">✕</Botao>
              </div>
            );
          })}
          <Botao className="acn-est-b acn-est-mr-mais" onClick={() => setLinhas(ls => [...ls, linhaRetiradaVazia()])}>
            ＋ Mais um item
          </Botao>
        </div>

        <label className="acn-label acn-est-mr-obs">Observação</label>
        <input className="acn-input acn-est-mr-campo" value={observacoes}
          onChange={e => setObservacoes(e.target.value)} placeholder="Ex.: para a manutenção da prensa" />

        <div className="acn-est-botoes">
          <Botao className={'acn-est-b ' + ('acn-est-bt teal cresce' + (salvando ? ' ocupado' : ''))}
            disabled={salvando} onClick={revisar}>
            {salvando ? 'Registrando...' : `Conferir e registrar (${preenchidas.length} item${preenchidas.length === 1 ? '' : 's'})`}
          </Botao>
          <Botao className="acn-est-b acn-est-bt cinza" disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>

      {/* Conferência antes da baixa. Fica por cima do formulário, que continua
          intacto atrás: dizer "não" é só fechar isto e voltar a ajustar. */}
      {conferindo && (
        <div className="modal-overlay acn-est-mr-sobre2">
          <div className="modal-box acn-est-mr-caixa-conf">
            <div className="modal-title">Confirmar a baixa no estoque</div>
            <div className="acn-est-mr-resumo">
              Retirado por <b className="acn-est-mr-forte">{quemRetirou.trim()}</b>
              {vinculoDaRetirada() ? <> · para <b className="acn-est-mr-forte">{vinculoDaRetirada()?.descricao}</b></> : <> · uso geral</>}
              {observacoes.trim() ? <> · {observacoes.trim()}</> : null}
            </div>

            <div className="acn-est-mr-rolagem">
              <table className="acn-est-mr-tab">
                <thead>
                  <tr className="acn-est-tr-cab">
                    {['Item', 'Sai', 'Saldo hoje', 'Fica com'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preenchidas.map((l, i) => {
                    const saldo = num(l.item.estoque_atual);
                    const sai = num(l.quantidade);
                    const fica = saldo - sai;
                    const minimo = l.item.estoque_minimo == null ? null : num(l.item.estoque_minimo);
                    return (
                      <tr className="acn-est-tr" key={i}>
                        <td>
                          {l.item.codigo ? <b>{l.item.codigo}</b> : null} {l.item.nome}
                        </td>
                        <td className="acn-est-td-forte">
                          −{fmtQtd(sai)} {l.item.unidade || 'UN'}
                        </td>
                        <td className="acn-est-mr-td-saldo">{fmtQtd(saldo)}</td>
                        <td className={'acn-est-mr-fica ' + (fica < 0 ? 'neg' : (minimo != null && fica <= minimo) ? 'min' : 'ok')}>
                          {fmtQtd(fica)}
                          {fica < 0 ? ' · negativo' : (minimo != null && fica <= minimo) ? ' · no mínimo' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {preenchidas.some(l => num(l.item.estoque_atual) - num(l.quantidade) < 0) && (
                <div className="acn-est-mr-aviso-neg">
                  Algum saldo vai ficar negativo. Isso é permitido — só quer dizer que a prateleira
                  tinha mais do que o sistema achava. Vale fazer uma contagem depois.
                </div>
              )}
              {preenchidas.some(l => { const m = l.item.estoque_minimo; return m != null && num(l.item.estoque_atual) - num(l.quantidade) <= num(m); }) && (
                <div className="acn-est-mr-aviso-min">
                  Item chegando no mínimo: a reposição vai ser pedida ao Compras sozinha ao confirmar.
                </div>
              )}
            </div>

            <div className="acn-est-mr-nota">
              Baixa não tem desfazer: o saldo muda e fica registrado no extrato. Se algo estiver errado,
              volte e ajuste a lista.
            </div>
            <div className="acn-est-botoes">
              <Botao className={'acn-est-b ' + ('acn-est-bt teal cresce' + (salvando ? ' ocupado' : ''))}
                disabled={salvando} onClick={gravar}>
                {salvando ? 'Registrando...' : 'Confirmar baixa'}
              </Botao>
              <Botao className="acn-est-b acn-est-bt cinza" disabled={salvando}
                onClick={() => setConferindo(false)}>Voltar e ajustar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO ALMOXARIFADO — os itens sob controle e a contagem
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fila do Almoxarifado: peça fabricada aqui dentro, pronta, esperando a
 * conferência que faz o saldo subir.
 *
 * Fica separado do painel de pendência de OP de propósito. Aquele trata de
 * material de uma OP específica, que vai direto para o kit; este trata de
 * reposição de prateleira, que não tem OP nenhuma amarrada.
 */
export function PainelFabricacaoRecebimento({ currentUser, onCreditou }: any) {
  const [fila, setFila] = useState<any[]>([]);
  const [conferindo, setConferindo] = useState<any>(null);
  const [qtd, setQtd] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Estrutura do chicote (Etapa 9): mostra ANTES de confirmar o que também vai
  // ser descontado, na mesma proporção da quantidade digitada.
  const [estrutura, setEstrutura] = useState<any[]>([]);
  const [erroEstrutura, setErroEstrutura] = useState('');
  const [erroFila, setErroFila] = useState('');
  const pode = podeGerirEstoque(currentUser);

  const recarregar = async () => {
    const lida = await lerFabricacoesAguardandoCredito();
    // 7.x (15/10/2026): leitura recusada virava fila vazia e o painel inteiro sumia; agora mantém a última fila lida e mostra a faixa de erro
    if (lida.erro) setErroFila(lida.erro); else { setErroFila(''); setFila(lida.fila); }
  };
  useEffect(() => { recarregar(); }, []);

  // a quantidade vai para o campo com vírgula ("0,125"): com ponto, o mesmo número seria lido como milhar
  const textoDaQuantidade = (v: any) => (v == null ? '' : String(v).replace('.', ','));
  const abrir = async (d: any) => {
    setQtd(textoDaQuantidade(d.quantidade_produzida ?? d.quantidade));
    const lida = await lerMateriaisDoChicote(d.item_id);
    setErroEstrutura(lida.erro);
    setEstrutura(lida.erro ? [] : lida.materiais);
    setConferindo(d);
  };

  // 7.x (15/10/2026): a quantidade era lida tirando só a vírgula — "1.000" virava 1, e "1.234,5" virava zero; agora vale a mesma leitura da Nova OP e do quadro de demandas (1.000 é mil)
  const lidaQtd = lerValorDigitado(qtd);
  const consumoPrevisto = materiaisAConsumir(estrutura, lidaQtd.valor || 0);

  const confirmar_ = async () => {
    if (lidaQtd.invalido) { alert('Quantidade inválida. Digite só números, por exemplo 12 ou 12,5 (mil é 1.000).'); return; }
    const n = lidaQtd.valor || 0;
    if (n <= 0) { alert('Informe quanto chegou de verdade.'); return; }
    setSalvando(true);
    const r = await creditarFabricacaoRecebida({ demanda: conferindo, quantidade: n, currentUser });
    setSalvando(false);
    if (r?.erro) { alert('Não foi possível creditar: ' + r.erro); return; }
    if (r?.ignorado) { alert('Este item não está mais sob controle de estoque. Nada foi movimentado.'); return; }
    let msg = `Estoque atualizado: entraram ${fmtQtd(n)}, saldo agora ${fmtQtd(r.saldo_depois)}.`;
    if (r?.requisicao?.criada) msg += `\n\nMesmo assim o saldo seguiu no mínimo, então já pedi mais — ${paraQuem(r.requisicao)}.`;
    if (r?.avisoMarcacao) msg += `\n\n⚠️ O saldo subiu, mas a demanda não saiu da fila: ${r.avisoMarcacao}`;
    if (r?.requisicoesEstrutura?.length) {
      msg += `\n\nMaterial da estrutura também no mínimo, já pedi:\n`
        + r.requisicoesEstrutura.map((q: any) => `• ${q.material} — ${paraQuem(q)}`).join('\n');
    }
    if (r?.avisosEstrutura?.length) {
      msg += `\n\n⚠️ Não deu para descontar todo o material da estrutura:\n` + r.avisosEstrutura.join('\n');
    }
    const semReposicao = avisosDaReposicao(r);
    if (semReposicao.length) msg += `\n\n⚠️ ${semReposicao.join('\n⚠️ ')}`;
    alert(msg);
    setConferindo(null);
    recarregar();
    onCreditou?.();
  };

  if (!pode || (!fila.length && !erroFila)) return null;

  return (
    <div className="sec-card">
      <div className="sec-hdr acn-est-pf-cab">
        <span className="acn-est-pf-tit">🔧 Fabricação pronta para conferir ({fila.length || (erroFila ? '?' : 0)})</span>
      </div>
      <div className="sec-body">
        {erroFila && (
          <div className="acn-est-erro">
            Não foi possível ler a fila de fabricação ({erroFila}). {fila.length ? 'A lista abaixo pode estar desatualizada.' : 'Pode haver peça pronta esperando entrada.'}{' '}
            <Botao className="acn-est-b acn-est-erro-bt" type="button" onClick={recarregar}>Tentar de novo</Botao>
          </div>
        )}
        <div className="acn-est-pf-ajuda">
          O setor terminou e informou quanto produziu. Confira na prateleira e confirme —
          é a confirmação que faz o saldo subir, não a conclusão do setor.
        </div>
        {fila.map(d => (
          <div className="acn-est-pf-linha" key={d.id}>
            <span className="acn-est-pf-desc">
              {String(d.descricao || '').split('\n')[0]}
              <span className="acn-est-pf-det">
                {d.setor_destino}{d.numero_demanda ? ` · ${d.numero_demanda}` : ''}
                {d.numero_opl ? ` · OP ${d.numero_opl}` : ''}
              </span>
            </span>
            <span className="acn-est-pf-prod">
              produziu <b>{fmtQtd(d.quantidade_produzida ?? d.quantidade)}</b> {d.unidade || 'un'}
              {d.quantidade_produzida != null && num(d.quantidade_produzida) !== num(d.quantidade) && (
                <span className="acn-est-pf-traco"> · pedido {fmtQtd(d.quantidade)}</span>
              )}
            </span>
            <Botao className="acn-est-b acn-est-pf-entrada" onClick={() => abrir(d)}>
              Conferir e dar entrada
            </Botao>
          </div>
        ))}
      </div>

      {conferindo && (
        <div className="modal-overlay" onClick={() => !salvando && setConferindo(null)}>
          <div className="modal-box acn-est-pf-caixa" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔧 Dar entrada no estoque</div>
            <div className="acn-est-pf-texto">
              {String(conferindo.descricao || '').split('\n')[0]}
            </div>
            <label className="acn-est-pf-rotulo">
              QUANTO CHEGOU DE VERDADE
            </label>
            <input className="acn-est-pf-campo" inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus />
            <div className="acn-est-pf-dica">
              O setor informou {fmtQtd(conferindo.quantidade_produzida ?? conferindo.quantidade)} {conferindo.unidade || 'un'}.
              Se chegou menos, corrija aqui — vale o que está na prateleira.
            </div>

            {erroEstrutura && (
              <div className="acn-est-pf-erro">
                ⚠️ Não foi possível ler a estrutura do chicote ({erroEstrutura}). A entrada só é feita com a estrutura lida, para não creditar o chicote sem descontar o material — feche e abra de novo.
              </div>
            )}
            {consumoPrevisto.length > 0 && (
              <div className="acn-est-pf-aviso">
                🧵 Esta entrada também vai descontar da estrutura do chicote:
                <ul className="acn-est-pf-lista">
                  {consumoPrevisto.map((m: any) => (
                    <li key={m.id}>{fmtQtd(m.aConsumir)} {m.material?.unidade || 'UN'} de {m.material?.nome}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="acn-est-pf-botoes">
              <Botao className="acn-est-b acn-est-pf-confirma" onClick={confirmar_} disabled={salvando}>
                {salvando ? '...' : '✓ Dar entrada'}
              </Botao>
              <Botao className="acn-est-b acn-est-pf-volta" onClick={() => setConferindo(null)} disabled={salvando}>
                Cancelar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Janela das categorias do estoque (Almoxarifado): criar, renomear, mudar a ordem e apagar. Apagar uma categoria não apaga item nenhum: os itens dela ficam "sem categoria". */
function ModalCategoriasEstoque({ categorias, itens, currentUser, onClose, onMudou }: any) {
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nomeJaExiste = (nome: string, ignorarId?: string) => categorias.some((c: any) => c.id !== ignorarId && c.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  const criar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    if (nomeJaExiste(nome)) { alert('Já existe uma categoria com esse nome.'); return; }
    setOcupado(true);
    const ordem = Math.max(0, ...categorias.map((c: any) => c.ordem || 0)) + 1;
    const { error } = await supabase.from('estoque_categorias').insert([{ nome, ordem, criado_por_nome: currentUser?.nome || currentUser?.email || null }]);
    setOcupado(false);
    if (error) { alert('Não foi possível criar a categoria: ' + error.message); return; }
    setNovo(''); onMudou();
  };
  const renomear = async () => {
    if (!editando) return;
    const nome = editando.nome.trim();
    if (!nome) return;
    if (nomeJaExiste(nome, editando.id)) { alert('Já existe uma categoria com esse nome.'); return; }
    setOcupado(true);
    const { error } = await supabase.from('estoque_categorias').update({ nome }).eq('id', editando.id);
    setOcupado(false);
    if (error) { alert('Não foi possível renomear: ' + error.message); return; }
    setEditando(null); onMudou();
  };
  // troca a ordem com a vizinha: regrava as duas
  const mover = async (idx: number, delta: number) => {
    const a = categorias[idx], b = categorias[idx + delta];
    if (!a || !b) return;
    setOcupado(true);
    const ordA = a.ordem ?? idx, ordB = b.ordem ?? (idx + delta);
    const r1 = await supabase.from('estoque_categorias').update({ ordem: ordB === ordA ? ordA + delta : ordB }).eq('id', a.id);
    const r2 = await supabase.from('estoque_categorias').update({ ordem: ordA }).eq('id', b.id);
    setOcupado(false);
    if (r1.error || r2.error) { alert('Não foi possível mudar a ordem: ' + (r1.error || r2.error).message); }
    onMudou();
  };
  const apagar = async (c: any) => {
    const n = itens.filter((i: any) => i.categoria_estoque_id === c.id).length;
    if (!await confirmar(`Apagar a categoria "${c.nome}"?\n\n${n ? `${n} item(ns) dela ficam sem categoria (nenhum item é apagado).` : 'Nenhum item usa esta categoria.'}`)) return;
    setOcupado(true);
    const { error } = await supabase.from('estoque_categorias').delete().eq('id', c.id);
    setOcupado(false);
    if (error) { alert('Não foi possível apagar a categoria: ' + error.message); return; }
    onMudou();
  };

  return (
    <div className="modal-overlay acn-est-sobre" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-est-mc-caixa" role="dialog" aria-label="Categorias do estoque">
        <div className="modal-title">🗂️ Categorias do estoque</div>
        <div className="acn-est-dica">
          Só para organizar a lista de itens sob controle (não é a categoria fiscal do cadastro de itens). A categoria de cada item é escolhida na própria lista.
        </div>
        {categorias.length === 0 && <div className="acn-empty">Nenhuma categoria ainda. Crie a primeira abaixo.</div>}
        {categorias.map((c: any, idx: number) => (
          <div className="acn-est-mc-linha" key={c.id}>
            {editando?.id === c.id ? (<>
              <input className="acn-input acn-est-cresce" autoFocus value={editando.nome} onChange={e => setEditando({ id: c.id, nome: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') renomear(); }} />
              <Botao className="acn-est-b acn-est-bt verde" disabled={ocupado} onClick={renomear}>Salvar</Botao>
              <Botao className="acn-est-b acn-est-bt cinza" onClick={() => setEditando(null)}>Cancelar</Botao>
            </>) : (<>
              <span className="acn-est-mc-nome">{c.nome} <span className="acn-est-mc-qtd">· {itens.filter((i: any) => i.categoria_estoque_id === c.id).length} itens</span></span>
              <Botao className="acn-est-b acn-est-mc-icone" title="Subir" aria-label={'Subir ' + c.nome} disabled={ocupado || idx === 0} onClick={() => mover(idx, -1)}>▲</Botao>
              <Botao className="acn-est-b acn-est-mc-icone" title="Descer" aria-label={'Descer ' + c.nome} disabled={ocupado || idx === categorias.length - 1} onClick={() => mover(idx, 1)}>▼</Botao>
              <Botao className="acn-est-b acn-est-mc-icone" title="Renomear" aria-label={'Renomear ' + c.nome} onClick={() => setEditando({ id: c.id, nome: c.nome })}>✎</Botao>
              <Botao className="acn-est-b acn-est-mc-apagar" title="Apagar" aria-label={'Apagar ' + c.nome} disabled={ocupado} onClick={() => apagar(c)}>✕</Botao>
            </>)}
          </div>
        ))}
        <div className="acn-est-mc-nova">
          <input className="acn-input acn-est-cresce" placeholder="Nova categoria (ex.: Parafusos)" value={novo} onChange={e => setNovo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') criar(); }} />
          <Botao className="acn-est-b acn-est-bt verde" disabled={ocupado || !novo.trim()} onClick={criar}>Criar</Botao>
        </div>
        <div className="acn-est-mc-fecha">
          <Botao className="acn-est-b acn-est-bt cinza" onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

export function PainelEstoque({ currentUser }: any) {
  const [itens, setItens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [contando, setContando] = useState<any>(null);   // item em contagem
  const [valorContagem, setValorContagem] = useState('');
  const [obsContagem, setObsContagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [procurarNovo, setProcurarNovo] = useState('');
  const [achados, setAchados] = useState<any[]>([]);
  const [retirando, setRetirando] = useState(false);
  const [varrendo, setVarrendo] = useState(false);
  const [definindo, setDefinindo] = useState<any>(null);   // item ajustando mínimo/ideal
  const [formLimites, setFormLimites] = useState({ minimo: '', ideal: '' });
  const [movimentos, setMovimentos] = useState<any[]>([]);
  const [verExtrato, setVerExtrato] = useState(false);
  const [reservas, setReservas] = useState<Map<string, number>>(new Map());
  // Categorias do estoque (pedido do usuário em 07/10/2026): lista própria do Almoxarifado, separada da categoria fiscal do cadastro de itens.
  const [categorias, setCategorias] = useState<any[]>([]);
  const [erroCategorias, setErroCategorias] = useState('');
  const [filtroCat, setFiltroCat] = useState('');          // '' = todas · 'sem' = sem categoria · senão o id da categoria
  const [gerindoCats, setGerindoCats] = useState(false);
  // 7.x (15/10/2026): as três leituras do painel (itens, reservas e extrato) ignoravam o erro — a tabela vinha vazia com "Nenhum item sob controle ainda", ou as colunas
  // Reservado e Disponível mostravam um número folgado demais. Agora cada falha aparece, a última lista lida fica na tela e há "Tentar de novo".
  const [erroLeitura, setErroLeitura] = useState<{ itens: string; reservas: string; extrato: string }>({ itens: '', reservas: '', extrato: '' });
  const [erroBusca, setErroBusca] = useState('');
  const [buscou, setBuscou] = useState(false);
  const pode = podeGerirEstoque(currentUser);

  const recarregar = async () => {
    setCarregando(true);
    const falhou = { itens: '', reservas: '', extrato: '' };
    const lidaItens = await lerItensControlados();
    if (lidaItens.erro) falhou.itens = lidaItens.erro; else setItens(lidaItens.itens);
    const lidaReservas = await lerReservadoPorItem();
    if (lidaReservas.erro) falhou.reservas = lidaReservas.erro; else setReservas(lidaReservas.mapa);
    const { data: cats, error: errCats } = await supabase.from('estoque_categorias').select('*').eq('ativo', true).order('ordem').order('nome');
    if (errCats) setErroCategorias(errCats.message); else { setErroCategorias(''); setCategorias(cats || []); }
    const { data, error: errMov } = await supabase.from('estoque_movimentos')
      .select('id,item_nome,tipo,quantidade,saldo_depois,motivo,retirado_por_nome,vinculo_descricao,criado_por_nome,criado_em')
      .order('criado_em', { ascending: false }).limit(15);
    if (errMov) falhou.extrato = errMov.message; else setMovimentos(data || []);
    setErroLeitura(falhou);
    setCarregando(false);
  };
  useEffect(() => { recarregar(); }, []);

  // busca no cadastro inteiro para COLOCAR um item sob controle — é assim que
  // o controle cresce aos poucos, um item de cada vez
  useEffect(() => {
    let vale = true;   // a resposta de uma busca antiga não pode sobrescrever a da busca mais nova
    const t = setTimeout(async () => {
      const termo = procurarNovo.trim();
      if (termo.length < 3) { setAchados([]); setErroBusca(''); setBuscou(false); return; }
      // 7.x (15/10/2026): o termo ia cru para dentro do filtro do banco — uma vírgula ou parêntese ("fio 2,5") quebrava a consulta e a busca vinha vazia, sem aviso;
      // e o termo inteiro era procurado como uma frase só ("suporte slimled" não achava "slimled suporte"). Agora é a busca por palavras de sempre (SearchUtils).
      const { data, error } = await buscarPorPalavras(
        supabase.from('cadastro_itens').select('id,codigo,nome,unidade,controla_estoque').eq('ativo', true).eq('controla_estoque', false),
        ['nome_norm', 'codigo_norm'], termo.replace(/[,()]/g, ' ')).limit(8);   // "fio 2,5" vira as palavras "fio", "2" e "5" (o utilitário descartaria a vírgula e juntaria "25")
      if (!vale) return;
      if (error) { setErroBusca(error.message); setAchados([]); setBuscou(false); return; }
      setErroBusca(''); setAchados(data || []); setBuscou(true);
    }, 350);
    return () => { vale = false; clearTimeout(t); };
  }, [procurarNovo]);

  const ligarControle = async (item: any) => {
    if (!await confirmar(`Colocar "${item.nome}" sob controle de estoque?\n\nEle começa com saldo zero — conte a prateleira logo em seguida, senão a primeira saída já vai acusar falta.`)) return;
    const { error } = await supabase.from('cadastro_itens').update({ controla_estoque: true }).eq('id', item.id);
    // 7.x: o erro era ignorado — a lista de resultados sumia como se o item tivesse entrado no controle
    if (error) { alert('Não foi possível colocar o item sob controle: ' + error.message); return; }
    setProcurarNovo(''); setAchados([]); setBuscou(false);
    recarregar();
  };

  /** Conferência sob demanda dos mínimos.
   *
   *  A reposição automática mora dentro do movimento de estoque, então ela só
   *  enxerga o item quando alguém tira ou põe material. Item parado abaixo do
   *  mínimo ficava calado. Este botão passa os olhos em todos e abre o que
   *  estiver faltando — pedido de compra ou demanda de fabricação, conforme o
   *  item (pedido do usuário em 25/09/2026). */
  const rodarVarredura = async () => {
    if (!await confirmar(
      'Conferir todos os itens sob controle e abrir a reposição do que estiver abaixo do mínimo?\n\n' +
      'Item que já tem compra ou fabricação a caminho é pulado — nada é pedido em dobro.')) return;
    setVarrendo(true);
    const r = await varrerMinimos({ currentUser });
    setVarrendo(false);
    alert(textoDaVarredura(r));
    recarregar();
  };

  const abrirLimites = (item: any) => {
    setFormLimites({ minimo: item.estoque_minimo ?? '', ideal: item.estoque_ideal ?? '' });
    setDefinindo(item);
  };

  const gravarLimites = async () => {
    const min = formLimites.minimo === '' ? null : num(formLimites.minimo);
    const ideal = formLimites.ideal === '' ? null : num(formLimites.ideal);
    // 7.x (15/10/2026): o campo aceitava digitar valor negativo e gravava — um mínimo de −5 nunca dispara a reposição
    if ((min != null && min < 0) || (ideal != null && ideal < 0)) { alert('Mínimo e ideal não podem ser negativos.'); return; }
    if (min != null && ideal != null && ideal <= min) {
      alert('O ideal precisa ser maior que o mínimo, senão a compra automática pediria zero.');
      return;
    }
    const { error } = await supabase.from('cadastro_itens')
      .update({ estoque_minimo: min, estoque_ideal: ideal }).eq('id', definindo.id);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    setDefinindo(null);
    recarregar();
  };

  /** Desligar o controle não apaga o saldo: se o item voltar para o controle
   *  depois, o número anterior continua lá — mas provavelmente estará velho,
   *  e por isso o aviso pede uma contagem na volta. */
  const desabilitarControle = async (item: any) => {
    if (!await confirmar(
      `Tirar "${item.nome}" do controle de estoque?\n\n` +
      `Ele volta a circular como qualquer outro item: não dá mais baixa, não confere mínimo, ` +
      `não pede compra sozinho e não trava liberação.\n\n` +
      `O saldo de ${fmtQtd(item.estoque_atual)} e o extrato ficam guardados. Se um dia voltar ao controle, ` +
      `conte a prateleira antes de confiar nesse número.`)) return;
    const { error } = await supabase.from('cadastro_itens')
      .update({ controla_estoque: false }).eq('id', item.id);
    if (error) { alert('Não foi possível desabilitar: ' + error.message); return; }
    recarregar();
  };

  const gravarContagem = async () => {
    if (valorContagem === '' || !Number.isFinite(Number(valorContagem)) || Number(valorContagem) < 0) { alert('Informe a quantidade contada.'); return; }
    setSalvando(true);
    const r = await movimentarEstoque({
      itemId: contando.id, tipo: 'contagem', quantidade: valorContagem,
      motivo: MOTIVO.CONTAGEM, observacoes: obsContagem.trim() || null, currentUser,
    });
    setSalvando(false);
    if (r?.erro) { alert('Não foi possível gravar a contagem: ' + r.erro); return; }
    if (r?.ignorado) { alert('Este item não está sob controle de estoque.'); return; }
    // contagem que revela menos do que se pensava também pede reposição
    let aviso = '';
    if (r?.requisicao?.criada) {
      aviso = `Contagem gravada. O saldo ficou em ${fmtQtd(r.saldo_depois)}, no mínimo ou abaixo dele, então a reposição de ${fmtQtd(r.requisicao.quantidade)} foi pedida sozinha — ${paraQuem(r.requisicao)}.`;
    } else if (r?.requisicao?.jaExistia) {
      aviso = `Contagem gravada. O saldo está no mínimo, mas já existe reposição em aberto — ${paraQuem(r.requisicao)}. Nenhum pedido novo foi criado.`;
    }
    // 7.x (15/10/2026): a reposição que não nasceu (pedido recusado, conferência dos pedidos abertos ou do mínimo que falhou) não era avisada — a contagem fechava como se tudo tivesse ido bem
    const semReposicao = avisosDaReposicao(r);
    if (semReposicao.length) aviso += `${aviso ? '\n\n' : 'Contagem gravada.\n\n'}⚠️ ${semReposicao.join('\n⚠️ ')}`;
    if (aviso) alert(aviso);
    setContando(null); setValorContagem(''); setObsContagem('');
    recarregar();
  };

  // Muda a categoria de estoque de um item (só quem gere o estoque). Confere o erro e só atualiza a tela se gravou.
  const trocarCategoria = async (item: any, categoriaId: string) => {
    const novo = categoriaId || null;
    const { error } = await supabase.from('cadastro_itens').update({ categoria_estoque_id: novo }).eq('id', item.id);
    if (error) { alert('Não foi possível trocar a categoria: ' + error.message); return; }
    setItens(lista => lista.map(x => x.id === item.id ? { ...x, categoria_estoque_id: novo } : x));
  };

  const filtradaPorBusca = itens.filter(i => combinaBusca([i.nome, i.codigo], busca));
  const lista = filtradaPorBusca.filter(i => !filtroCat || (filtroCat === 'sem' ? !i.categoria_estoque_id : i.categoria_estoque_id === filtroCat));
  // grupos da tabela: cada categoria na ordem escolhida pelo Almoxarifado, e "Sem categoria" por último; sem nenhuma categoria criada, a tabela segue sem cabeçalhos de grupo como antes
  const nomeDaCategoria = (id: string) => categorias.find(c => c.id === id)?.nome;
  const grupos = categorias.length === 0 ? [{ id: '', nome: '', itens: lista }] : [
    ...categorias.map(c => ({ id: c.id, nome: c.nome, itens: lista.filter(i => i.categoria_estoque_id === c.id) })),
    { id: 'sem', nome: 'Sem categoria', itens: lista.filter(i => !i.categoria_estoque_id || !nomeDaCategoria(i.categoria_estoque_id)) },
  ].filter(g => g.itens.length > 0);
  const abaixo = itens.filter(i => ['abaixo', 'zerado', 'negativo'].includes(situacaoEstoque(i).chave));

  return (
    <div className="sec-card acn-est-pe-cartao">
      <div className="sec-hdr acn-est-pe-cab">
        <span className="acn-est-pe-tit">📦 Estoque sob controle ({itens.length})</span>
        <div className="acn-est-pe-acoes">
          {abaixo.length > 0 && (
            <span className="acn-est-pe-selo-baixo">
              {abaixo.length} precisando de reposição
            </span>
          )}
          {pode && itens.length > 0 && (
            <Botao onClick={e => { e.stopPropagation(); rodarVarredura(); }} disabled={varrendo}
              title="Conferir todos os itens controlados e abrir o que estiver faltando"
              className={'acn-est-b ' + ('acn-est-pe-varre' + (varrendo ? ' espera' : ''))}>
              {varrendo ? 'Conferindo…' : '🔎 Conferir mínimos'}
            </Botao>
          )}
          {pode && (
            <Botao className="acn-est-b acn-est-pe-categorias" onClick={e => { e.stopPropagation(); setGerindoCats(true); }}
              title="Criar, renomear, ordenar e apagar as categorias do estoque">
              🗂️ Categorias
            </Botao>
          )}
          {pode && itens.length > 0 && (
            <Botao className="acn-est-b acn-est-pe-retirada" onClick={e => { e.stopPropagation(); setRetirando(true); }}
              title="Registrar o que alguém veio buscar no balcão">
              📤 Registrar retirada
            </Botao>
          )}
        </div>
      </div>
      <div className="sec-body">
        <div className="acn-est-pe-intro">
          Só os itens desta lista têm controle. Os demais circulam normalmente, sem baixa e sem travar nada —
          é assim que dá para contar a prateleira aos poucos, começando pelos itens mais usados.
        </div>

        {pode && (
          <div className="acn-est-pe-novo">
            <div className="acn-est-pe-novo-tit">
              ＋ Colocar mais um item sob controle
            </div>
            <input className="acn-est-pe-busca" value={procurarNovo} onChange={e => setProcurarNovo(e.target.value)}
              placeholder="Procure pelo nome ou código do item (3 letras ou mais)" />
            {achados.map(a => (
              <div className="acn-est-pe-achado" key={a.id}>
                <span className="acn-est-pe-achado-nome">
                  {a.codigo ? <b>{a.codigo}</b> : null} {a.nome}
                </span>
                <Botao className="acn-est-b acn-est-pe-controlar" onClick={() => ligarControle(a)}>
                  Controlar
                </Botao>
              </div>
            ))}
            {erroBusca && <div className="acn-est-pe-busca-erro">Não foi possível procurar ({erroBusca}).</div>}
            {buscou && !achados.length && <div className="acn-est-pe-busca-vazia">Nenhum item encontrado entre os que ainda não estão sob controle.</div>}
          </div>
        )}

        {(erroLeitura.itens || erroLeitura.reservas || erroLeitura.extrato) && (
          <div className="acn-est-erro">
            Não foi possível ler {[erroLeitura.itens && `a lista de itens (${erroLeitura.itens})`, erroLeitura.reservas && `as reservas (${erroLeitura.reservas})`, erroLeitura.extrato && `o extrato (${erroLeitura.extrato})`].filter(Boolean).join(', ')}.
            {erroLeitura.reservas ? ' As colunas Reservado e Disponível podem estar erradas.' : ''}{erroLeitura.itens && itens.length ? ' A tabela mostra a última lista lida.' : ''}{' '}
            <Botao className="acn-est-b acn-est-erro-bt" type="button" onClick={recarregar}>Tentar de novo</Botao>
          </div>
        )}
        {erroCategorias && (
          <div className="acn-est-erro">
            Não foi possível ler as categorias do estoque ({erroCategorias}). A lista abaixo aparece sem separação por categoria.{' '}
            <Botao className="acn-est-b acn-est-erro-bt" onClick={recarregar}>Tentar de novo</Botao>
          </div>
        )}
        {categorias.length > 0 && itens.length > 0 && (
          <div className="acn-est-pe-filtro">
            <span className="acn-est-pe-filtro-rot">Categoria</span>
            <select className="acn-est-pe-filtro-sel" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} aria-label="Filtrar por categoria">
              <option value="">Todas ({filtradaPorBusca.length})</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome} ({filtradaPorBusca.filter(i => i.categoria_estoque_id === c.id).length})</option>)}
              {filtradaPorBusca.some(i => !i.categoria_estoque_id) && <option value="sem">Sem categoria ({filtradaPorBusca.filter(i => !i.categoria_estoque_id).length})</option>}
            </select>
            {filtroCat && <Botao className="acn-est-b acn-est-pe-limpar" onClick={() => setFiltroCat('')}>✕ limpar</Botao>}
          </div>
        )}
        {itens.length > 6 && (
          <input className="acn-est-pe-filtra" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar a lista..." />
        )}

        {carregando ? (
          <div className="acn-empty">Carregando...</div>
        ) : !itens.length ? (
          !erroLeitura.itens && (
            <div className="acn-empty">
              Nenhum item sob controle ainda. Comece pelos que mais saem — um ou dois já bastam para testar o caminho inteiro.
            </div>
          )
        ) : (
          <table className="acn-est-pe-tab">
            <thead>
              <tr className="acn-est-tr-cab">
                {['Código', 'Item', ...(pode && categorias.length ? ['Categoria'] : []), 'Saldo', 'Reservado', 'Disponível', 'Mínimo', 'Ideal', 'Situação', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr><td className="acn-est-pe-vazio-td" colSpan={10}>Nenhum item nesta categoria{busca.trim() ? ' com esse filtro' : ''}.</td></tr>
              )}
              {grupos.map(g => (<React.Fragment key={g.id || 'todos'}>
              {g.nome && (
                <tr>
                  <td className="acn-est-pe-grupo" colSpan={10}>
                    {g.nome} <span className="acn-est-pe-grupo-n">· {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                      {g.itens.filter(x => ['abaixo', 'zerado', 'negativo'].includes(situacaoEstoque(x).chave)).length > 0
                        && <b className="acn-est-pe-grupo-rep"> · {g.itens.filter(x => ['abaixo', 'zerado', 'negativo'].includes(situacaoEstoque(x).chave)).length} precisando de reposição</b>}
                    </span>
                  </td>
                </tr>
              )}
              {g.itens.map(i => {
                const s = situacaoEstoque(i);
                return (
                  <tr className="acn-est-tr" key={i.id}>
                    <td className="acn-est-pe-cod">{i.codigo || '—'}</td>
                    <td>
                      {i.nome}
                      {/* peça guardada em dois estados: a bruta espera o
                          acabamento e não serve para a produção ainda */}
                      {i.tem_inacabado && (
                        <div className="acn-est-pe-inacab">
                          🔧 {fmtQtd(i.estoque_inacabado)} sem acabamento
                          {i.inacabado_minimo != null && ` (mín. ${fmtQtd(i.inacabado_minimo)})`}
                          {num(i.inacabado_minimo) > 0 && num(i.estoque_inacabado) <= num(i.inacabado_minimo)
                            && <b> · no mínimo</b>}
                        </div>
                      )}
                    </td>
                    {pode && categorias.length > 0 && (
                      <td>
                        <select className="acn-est-pe-cat-sel" value={i.categoria_estoque_id || ''} onChange={e => trocarCategoria(i, e.target.value)} aria-label={'Categoria de ' + i.nome}>
                          <option value="">— sem categoria —</option>
                          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="acn-est-td-forte">{fmtQtd(i.estoque_atual)} {i.unidade || 'UN'}</td>
                    {/* saldo é o que está na prateleira; disponível é o que ainda
                        não tem dono. A diferença é o que outra OP já levou no papel. */}
                    <td className={'acn-est-pe-reserv' + (num(reservas.get(i.id)) > 0 ? ' tem' : '')}>
                      {num(reservas.get(i.id)) > 0 ? fmtQtd(reservas.get(i.id)) : '—'}
                    </td>
                    <td className={'acn-est-pe-disp' + (num(i.estoque_atual) - num(reservas.get(i.id)) < 0 ? ' neg' : '')}>
                      {fmtQtd(num(i.estoque_atual) - num(reservas.get(i.id)))}
                    </td>
                    <td className="acn-est-pe-td-dim">{i.estoque_minimo == null ? '—' : fmtQtd(i.estoque_minimo)}</td>
                    <td className="acn-est-pe-td-dim">{i.estoque_ideal == null ? '—' : fmtQtd(i.estoque_ideal)}</td>
                    <td>
                      <span className={'acn-est-pe-sit ' + s.chave}>
                        {s.texto}
                      </span>
                    </td>
                    <td className="acn-est-pe-td-dir">
                      {pode && (
                        <div className="acn-est-pe-acoes-linha">
                          <Botao className="acn-est-b acn-est-pe-contar" onClick={() => { setContando(i); setValorContagem(String(i.estoque_atual ?? '')); setObsContagem(''); }}>
                            Contar
                          </Botao>
                          <MenuAcoes itens={[
                            { rotulo: 'Definir mínimo e ideal', icone: mdiPencilOutline, onClick: () => abrirLimites(i) },
                            { rotulo: 'Tirar do controle de estoque', icone: mdiCloseCircleOutline, perigo: true,
                              onClick: () => desabilitarControle(i) },
                          ]} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              </React.Fragment>))}
            </tbody>
          </table>
        )}

        {/* extrato recente: é o que dá confiança de que o saldo não muda sozinho */}
        {movimentos.length > 0 && (
          <div className="acn-est-pe-extrato">
            <Botao className="acn-est-b acn-est-pe-extrato-bt" onClick={() => setVerExtrato(v => !v)}>
              {verExtrato ? '▾' : '▸'} Últimos movimentos ({movimentos.length})
            </Botao>
            {verExtrato && (
              <table className="acn-est-pe-extrato-tab">
                <tbody>
                  {movimentos.map(m => {
                    const sinal = m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : '=';
                    const tom = m.tipo === 'saida' ? 'saida' : m.tipo === 'entrada' ? 'entrada' : 'outro';
                    return (
                      <tr className="acn-est-tr" key={m.id}>
                        <td className="acn-est-pe-mov-data">
                          {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                        <td>{m.item_nome}</td>
                        <td className={'acn-est-pe-mov-q ' + tom}>
                          {sinal}{fmtQtd(m.quantidade)}
                        </td>
                        <td className="acn-est-pe-mov-saldo">
                          saldo {fmtQtd(m.saldo_depois)}
                        </td>
                        <td className="acn-est-pe-mov-motivo">
                          {/* o destino da retirada entra no extrato: é ele que
                              diz para qual OP ou setor o material foi */}
                          {m.motivo === MOTIVO.RETIRADA && m.retirado_por_nome
                            ? `retirada — ${m.retirado_por_nome}${m.vinculo_descricao ? ` → ${m.vinculo_descricao}` : ''}`
                            : m.motivo === MOTIVO.KITING ? `kiting — ${m.vinculo_descricao || ''}`
                            : m.motivo === MOTIVO.CONTAGEM ? `contagem — ${m.criado_por_nome || ''}`
                            : m.motivo || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {retirando && (
        <ModalRetirada currentUser={currentUser} onClose={() => setRetirando(false)} onFeito={recarregar} />
      )}

      {gerindoCats && (
        <ModalCategoriasEstoque categorias={categorias} itens={itens} currentUser={currentUser}
          onClose={() => setGerindoCats(false)} onMudou={recarregar} />
      )}

      {definindo && (
        <div className="modal-overlay acn-est-sobre">
          <div className="modal-box acn-est-pe-modal">
            <div className="modal-title">🎯 Mínimo e ideal — {definindo.nome}</div>
            <div className="acn-est-dica">
              O mínimo é onde a compra dispara. O ideal é até onde repor: o pedido é a diferença entre
              o saldo e o ideal, para não pedir de novo na semana seguinte.
            </div>
            <div className="acn-est-pe-limites-grade">
              <div>
                <label className="acn-label">Estoque mínimo</label>
                <input type="number" min={0} step="any" autoFocus className="acn-input acn-est-pe-largo"
                  value={formLimites.minimo} onChange={e => setFormLimites(f => ({ ...f, minimo: e.target.value }))}
                  placeholder="ex.: 10" />
              </div>
              <div>
                <label className="acn-label">Estoque ideal</label>
                <input type="number" min={0} step="any" className="acn-input acn-est-pe-largo"
                  value={formLimites.ideal} onChange={e => setFormLimites(f => ({ ...f, ideal: e.target.value }))}
                  placeholder="ex.: 50" />
              </div>
            </div>
            <div className="acn-est-pe-saldo-hoje">
              Saldo de hoje: <b>{fmtQtd(definindo.estoque_atual)} {definindo.unidade || 'UN'}</b>.
              {formLimites.minimo !== '' && formLimites.ideal !== '' && num(formLimites.ideal) > num(formLimites.minimo) && (
                <> Batendo o mínimo, o pedido sairia com {fmtQtd(Math.max(num(formLimites.ideal) - num(formLimites.minimo), 0))} ou mais.</>
              )}
              {formLimites.minimo === '' && <> Sem mínimo, este item não pede compra sozinho.</>}
            </div>
            <div className="acn-est-botoes">
              <Botao className="acn-est-b acn-est-bt verde cresce" onClick={gravarLimites}>Salvar</Botao>
              <Botao className="acn-est-b acn-est-bt cinza" onClick={() => setDefinindo(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {contando && (
        <div className="modal-overlay acn-est-sobre">
          <div className="modal-box acn-est-pe-modal">
            <div className="modal-title">📦 Contagem — {contando.nome}</div>
            <div className="acn-est-dica">
              O saldo passa a ser exatamente o que você contar. A diferença fica registrada no extrato,
              com o saldo de antes e o de depois — nada é apagado.
            </div>
            <label className="acn-label">Quantidade contada na prateleira *</label>
            <input type="number" min={0} step="any" autoFocus className="acn-input acn-est-pe-obs-campo"
              value={valorContagem} onChange={e => setValorContagem(e.target.value)} />
            <div className="acn-est-pe-contagem-nota">
              Sistema diz {fmtQtd(contando.estoque_atual)} {contando.unidade || 'UN'}
              {valorContagem !== '' && Number(valorContagem) !== Number(contando.estoque_atual || 0) && (
                <b className="acn-est-pe-diferenca">
                  {' '}· diferença de {fmtQtd(Number(valorContagem) - Number(contando.estoque_atual || 0))}
                </b>
              )}
            </div>
            <label className="acn-label">Observação</label>
            <input className="acn-input acn-est-pe-obs" value={obsContagem}
              onChange={e => setObsContagem(e.target.value)} placeholder="Ex.: sobrou caixa fechada no fundo" />
            <div className="acn-est-botoes">
              <Botao className={'acn-est-b ' + ('acn-est-bt verde cresce' + (salvando ? ' ocupado' : ''))}
                disabled={salvando} onClick={gravarContagem}>
                {salvando ? 'Gravando...' : 'Gravar contagem'}
              </Botao>
              <Botao className="acn-est-b acn-est-bt cinza" disabled={salvando}
                onClick={() => setContando(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
