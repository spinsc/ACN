// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — o relatório semanal (G6 do PLANO_GARANTIA.md, 20/10/2026)
//
// Só conta, sem tela e sem banco: GarantiaRelatorioTela.tsx mostra e GarantiaRelatorioPdf.ts desenha o MESMO modelo, então o que a tela soma e o que o PDF soma saem da mesma conta.
// Decisões do usuário em 20/10/2026: o relatório fica dentro da aba Garantia do SAC e é da gerência e do Admin (todos os atendimentos, não só os que a pessoa vê); "parado" é o atendimento
// aberto sem nenhum movimento na ficha há 5 dias ou mais, e a peça que não voltou segue o mesmo prazo.
// Semana = segunda a domingo. O que depende da semana (abertos, encerrados, movimentados, horas) usa os dias da semana; o que é "agora" (em aberto, parados, peças que não voltaram, pedidos
// esperando a direção) é sempre a situação de HOJE, e o relatório diz isso — não dá para reconstruir o que estava parado numa semana passada, porque a ficha só guarda o último estado.
// ─────────────────────────────────────────────────────────────────────────────
import {
  fraseDoEvento, totaisDeCustos, pecasPendentes, diaLocalDoCarimbo, diasParada, estaParada, ultimaMovimentacao, etapaDaGarantia, ROTULOS_ETAPA_GARANTIA, SITUACOES_GARANTIA,
  SITUACOES_PECA, TIPOS_AUTORIZACAO, ehGerenteG, PRAZO_PARADO_DIAS,
} from './GarantiaModelo';

/** Quem vê o relatório: a gerência e o Admin. */
export const podeVerRelatorioGarantia = (u: any) => ehGerenteG(u);

const UM_DIA = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (d: string) => Date.parse(d + 'T00:00:00Z');
export const somarDias = (d: string, n: number) => iso(ms(d) + n * UM_DIA);
/** A semana (segunda a domingo) que contém o dia. */
export function semanaDe(dia: string) {
  const dow = new Date(ms(dia)).getUTCDay();            // 0 = domingo
  const inicio = somarDias(dia, -((dow + 6) % 7));
  return { inicio, fim: somarDias(inicio, 6) };
}
export const dataBR = (d: any) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
export const reais = (v: any) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horasBR = (h: number) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`;
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const lista = (v: any) => (Array.isArray(v) ? v : []);

/**
 * O modelo do relatório. `fichas` = todos os atendimentos; `qualquerDia` = um dia da semana escolhida; `hoje` = AAAA-MM-DD.
 * Devolve o resumo em números e as seções (cada uma com cabeçalho, linhas e um texto explicando o critério).
 */
export function montarRelatorio(fichas: any[], qualquerDia: string, hoje: string, { emitidoPor = '', agora = new Date() }: any = {}) {
  const { inicio, fim } = semanaDe(qualquerDia);
  const naSemana = (d: string) => !!d && d >= inicio && d <= fim;
  const todas = lista(fichas);
  const doEvento = (e: any) => diaLocalDoCarimbo(e?.em);
  const eventosDaSemana = (g: any) => lista(g.historico).filter((e: any) => naSemana(doEvento(e)));

  const abertosNaSemana = todas.filter(g => naSemana(diaLocalDoCarimbo(g.criado_em)));
  const encerradosNaSemana = todas.filter(g => g.situacao === 'encerrado' && naSemana(diaLocalDoCarimbo(g.encerramento?.em)));
  const canceladosNaSemana = todas.filter(g => g.situacao === 'cancelado' && lista(g.historico).some((e: any) => e.tipo === 'cancelado' && naSemana(doEvento(e))));
  const movimentados = todas.filter(g => eventosDaSemana(g).length > 0).sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
  const emAberto = todas.filter(g => g.situacao === 'aberto');
  const parados = emAberto.filter(g => estaParada(g, hoje)).sort((a, b) => diasParada(b, hoje) - diasParada(a, hoje));

  const pecas = emAberto.flatMap(g => pecasPendentes(g, hoje).map((p: any) => ({ g, p }))).sort((a, b) => b.p.dias - a.p.dias);
  const pedidos = emAberto.flatMap(g => lista(g.autorizacoes).filter((a: any) => a.status === 'pedida').map((a: any) => ({ g, a })))
    .map(x => ({ ...x, dias: Math.max(0, Math.floor((ms(hoje) - ms(diaLocalDoCarimbo(x.a.pedida_em) || hoje)) / UM_DIA)) })).sort((a, b) => b.dias - a.dias);

  // horas apontadas com o dia dentro da semana (todos os atendimentos que não foram cancelados)
  const horasPorTecnico: Record<string, number> = {};
  todas.filter(g => g.situacao !== 'cancelado').forEach(g => lista(g.apontamentos).filter((a: any) => naSemana(String(a.data || ''))).forEach((a: any) => {
    horasPorTecnico[a.tecnico] = r2((horasPorTecnico[a.tecnico] || 0) + Number(a.horas));
  }));
  const tecnicos = Object.keys(horasPorTecnico).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const totalHoras = r2(tecnicos.reduce((s, t) => s + horasPorTecnico[t], 0));

  const custoDe = (g: any) => totaisDeCustos(g);
  const custoConsiderado = r2(movimentados.filter(g => g.situacao !== 'cancelado').reduce((s, g) => s + custoDe(g).considerado, 0));
  const custoEmpresa = r2(movimentados.filter(g => g.situacao !== 'cancelado').reduce((s, g) => s + custoDe(g).porPagador.empresa, 0));
  const horasDaFicha = (g: any) => r2(lista(g.apontamentos).reduce((s: number, a: any) => s + Number(a.horas || 0), 0));
  const etapaTxt = (g: any) => (g.situacao === 'aberto' ? ROTULOS_ETAPA_GARANTIA[etapaDaGarantia(g)] : '—');
  const ultimo = (g: any) => { const u = ultimaMovimentacao(g); return u.evento ? `${fraseDoEvento(u.evento)} (${dataBR(u.dia)})` : dataBR(u.dia); };

  const resumo = [
    { rotulo: 'Abertos na semana', valor: String(abertosNaSemana.length) },
    { rotulo: 'Encerrados na semana', valor: String(encerradosNaSemana.length) },
    { rotulo: 'Cancelados na semana', valor: String(canceladosNaSemana.length) },
    { rotulo: 'Em aberto hoje', valor: String(emAberto.length) },
    { rotulo: `Parados há ${PRAZO_PARADO_DIAS} dias ou mais`, valor: String(parados.length), tom: parados.length ? 'atencao' : '' },
    { rotulo: 'Peças que não voltaram', valor: String(pecas.length), tom: pecas.length ? 'atencao' : '' },
    { rotulo: 'Esperando a direção', valor: String(pedidos.length), tom: pedidos.length ? 'atencao' : '' },
    { rotulo: 'Horas apontadas na semana', valor: horasBR(totalHoras) },
    { rotulo: 'Custo considerado (movimentados)', valor: reais(custoConsiderado) },
  ];

  const secoes = [
    {
      id: 'movimentados', titulo: `Atendimentos movimentados na semana (${movimentados.length})`,
      info: 'Tiveram ao menos um registro na semana. Situação e etapa são as de hoje; custo e horas são os totais da ficha (os cancelados não entram na soma de custos).',
      head: ['Número', 'Cliente', 'Veículo', 'Responsável', 'Situação hoje', 'Movimentos na semana', 'Custo considerado', 'Pago pela empresa', 'Horas'],
      body: movimentados.map(g => [g.numero, g.cliente_nome, g.veiculo_nome, g.responsavel?.nome || '—', g.situacao === 'aberto' ? `${SITUACOES_GARANTIA[g.situacao]} — ${etapaTxt(g)}` : SITUACOES_GARANTIA[g.situacao], String(eventosDaSemana(g).length),
        reais(custoDe(g).considerado), reais(custoDe(g).porPagador.empresa), horasBR(horasDaFicha(g))]),
      rodape: ['TOTAL', '', '', '', '', String(movimentados.reduce((s, g) => s + eventosDaSemana(g).length, 0)), reais(custoConsiderado), reais(custoEmpresa), horasBR(r2(movimentados.reduce((s, g) => s + horasDaFicha(g), 0)))],
      colunasDir: [5, 6, 7, 8], vazio: 'Nenhum atendimento teve registro nesta semana.',
    },
    {
      id: 'encerrados', titulo: `Encerrados na semana (${encerradosNaSemana.length})`, info: 'O texto de fechamento é o que o responsável escreveu ao encerrar.',
      head: ['Número', 'Cliente', 'Veículo', 'Encerrado por', 'Dia', 'Texto de fechamento'],
      body: encerradosNaSemana.map(g => [g.numero, g.cliente_nome, g.veiculo_nome, g.encerramento?.por || '—', dataBR(diaLocalDoCarimbo(g.encerramento?.em)), g.encerramento?.texto || '—']),
      vazio: 'Nenhum atendimento foi encerrado nesta semana.',
    },
    {
      id: 'parados', titulo: `Parados há ${PRAZO_PARADO_DIAS} dias ou mais (${parados.length})`,
      info: `Atendimentos abertos sem nenhum movimento na ficha. A situação é a de hoje (${dataBR(hoje)}), qualquer que seja a semana escolhida.`,
      head: ['Número', 'Cliente', 'Responsável', 'Etapa', 'Último movimento', 'Dias parado'],
      body: parados.map(g => [g.numero, g.cliente_nome, g.responsavel?.nome || '—', etapaTxt(g), ultimo(g), String(diasParada(g, hoje))]),
      colunasDir: [5], vazio: 'Nenhum atendimento parado.',
    },
    {
      id: 'pecas', titulo: `Peças em garantia que ainda não voltaram (${pecas.length})`,
      info: `Peças de atendimentos abertos que não chegaram a "retornou", "reposta" ou "descartada". Os dias contam desde o último movimento da peça; a partir de ${PRAZO_PARADO_DIAS} dias ficam em atenção.`,
      head: ['Número', 'Cliente', 'Peça', 'Qtd', 'Situação', 'Rastreio', 'Dias parada'],
      body: pecas.map(({ g, p }) => [g.numero, g.cliente_nome, p.descricao, String(p.quantidade ?? 1), SITUACOES_PECA[p.situacao] || p.situacao, [...lista(p.movimentos)].reverse().find((m: any) => m.rastreio)?.rastreio || '—', String(p.dias)]),
      colunasDir: [3, 6], atencaoColuna: 6, vazio: 'Nenhuma peça pendente.',
    },
    {
      id: 'direcao', titulo: `Esperando a decisão da direção (${pedidos.length})`, info: 'Pedidos de autorização sem decisão, de atendimentos abertos.',
      head: ['Número', 'Cliente', 'O que', 'Valor', 'Pedida por', 'Pedida em', 'Dias esperando'],
      body: pedidos.map(({ g, a, dias }) => [g.numero, g.cliente_nome, TIPOS_AUTORIZACAO[a.tipo] || a.tipo, reais(a.valor), a.pedida_por || '—', dataBR(diaLocalDoCarimbo(a.pedida_em)), String(dias)]),
      colunasDir: [3, 6], vazio: 'Nenhum pedido esperando a direção.',
    },
    {
      id: 'horas', titulo: `Horas técnicas apontadas na semana (${horasBR(totalHoras)})`, info: 'Soma dos apontamentos com o dia dentro da semana, de todos os atendimentos que não foram cancelados.',
      head: ['Técnico', 'Horas'], body: tecnicos.map(t => [t, horasBR(horasPorTecnico[t])]), rodape: ['TOTAL', horasBR(totalHoras)], colunasDir: [1], vazio: 'Nenhum apontamento nesta semana.',
    },
  ];

  const periodo = `Semana de ${dataBR(inicio)} a ${dataBR(fim)}`;
  return {
    titulo: 'RELATÓRIO SEMANAL DE ATENDIMENTOS EM GARANTIA', periodo, inicio, fim,
    emitido: `Emitido em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${emitidoPor ? ` por ${emitidoPor}` : ''}`,
    criterio: [
      'Semana de segunda a domingo. Abertos, encerrados, cancelados, movimentados e horas contam os dias da semana escolhida.',
      `Em aberto, parados (${PRAZO_PARADO_DIAS} dias ou mais sem movimento), peças que não voltaram e pedidos esperando a direção são a situação de HOJE (${dataBR(hoje)}).`,
    ],
    resumo, secoes, prazoParado: PRAZO_PARADO_DIAS,
    totais: { abertos: abertosNaSemana.length, encerrados: encerradosNaSemana.length, cancelados: canceladosNaSemana.length, emAberto: emAberto.length, parados: parados.length, pecas: pecas.length, direcao: pedidos.length, horas: totalHoras, custoConsiderado, custoEmpresa },
    arquivo: `Garantia_semana_${inicio}.pdf`,
  };
}
