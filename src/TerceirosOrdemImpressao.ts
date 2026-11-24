// Serviços de terceiros: a ORDEM DE SERVIÇO impressa da pintura eletrostática em lote (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026).
// É o papel que vai com as peças ao prestador: a RELAÇÃO DE PEÇAS (uma linha por peça de cada carro, com a caixinha para conferir na devolução), as datas, as cláusulas e as assinaturas.
// Segue as mesmas regras do contrato (TerceirosContrato.ts): campo que o cadastro não tem sai em branco, a janela abre antes de qualquer espera, todo texto escapado e a faixa "MINUTA"
// enquanto o Admin não aprovar o texto. A cópia ASSINADA volta para o sistema como anexo da ordem (é o que libera o envio).
import { esc, dataBR, emBranco, textoOuBranco, paginaDeImpressao, abrirJanelaDeImpressao, MENSAGEM_JANELA_BLOQUEADA } from './TerceirosImpressao';
import { clausulasEmLista, nomeNoContrato } from './TerceirosConfig';
import { blocoDaEmpresa, blocoDasPartes, itemDaClausula, juntarPecas, distintos } from './TerceirosContrato';
import type { DadosDoContrato } from './TerceirosContrato';
import { lerCarrosDasOps } from './TerceirosServicos';
import { rotuloDaLigacao } from './TerceirosFluxo';
import type { ServicoDeTerceiro } from './TerceirosFluxo';

export type DadosDaOrdemImpressa = Omit<DadosDoContrato, 'ordem'> & { ordem: NonNullable<DadosDoContrato['ordem']> };

/** Uma linha por peça de cada serviço; o serviço sem peça listada ganha uma linha avisando (a pessoa confere à mão). */
export type LinhaDaRelacao = { servico: ServicoDeTerceiro; peca: string; quantidade: number | null; semPecas: boolean };
export function linhasDaRelacao(servicos: ServicoDeTerceiro[]): LinhaDaRelacao[] {
  const l: LinhaDaRelacao[] = [];
  for (const s of servicos) {
    const pecas = (s.pecas || []).filter(p => String(p?.descricao || '').trim());
    if (!pecas.length) { l.push({ servico: s, peca: '(sem peças listadas)', quantidade: null, semPecas: true }); continue; }
    for (const p of pecas) l.push({ servico: s, peca: String(p.descricao).trim().replace(/\s+/g, ' '), quantidade: p.quantidade != null && Number.isFinite(Number(p.quantidade)) ? Number(p.quantidade) : null, semPecas: false });
  }
  return l;
}

function blocoDasDatas(d: DadosDaOrdemImpressa): string {
  const o = d.ordem;
  const linhas: [string, string][] = [
    ['Ordem de serviço', esc(o.numero)],
    [o.data_envio_real ? 'Peças enviadas em' : 'Envio das peças', esc(dataBR(o.data_envio_real || o.data_envio_prevista))],
    ['Retorno previsto', esc(dataBR(o.previsao_retorno))],
    ['Observação', o.observacao ? esc(o.observacao) : '<span class="fraco">—</span>'],
  ];
  return `<div class="sec"><div class="sec-t">Datas</div><table class="campos">${linhas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table></div>`;
}

function blocoDaRelacao(d: DadosDaOrdemImpressa): string {
  const linhas = linhasDaRelacao(d.servicos);
  const corpo = linhas.map((x, i) => {
    const s = x.servico;
    const carro = s.ligacao_tipo === 'op' && s.ligacao_id ? d.carros[s.ligacao_id] : undefined;
    const op = s.ligacao_tipo === 'op' ? (carro?.opl || s.ligacao_rotulo || '') : rotuloDaLigacao(s);
    const modelo = [carro?.modelo, carro?.placa].map(v => String(v || '').trim()).filter(Boolean).join(' · ');
    return `<tr><td class="num">${i + 1}</td><td>${textoOuBranco(op)}<br/><span class="fraco">${esc(s.numero)}</span></td><td>${modelo ? esc(modelo) : emBranco()}</td>`
      + `<td>${x.semPecas ? `<span class="fraco">${esc(x.peca)}</span>` : esc(x.peca)}</td><td class="num">${x.quantidade != null ? esc(x.quantidade) : ''}</td><td class="centro"><span class="caixa"></span></td></tr>`;
  }).join('');
  const total = juntarPecas(d.servicos);
  const soma = total.reduce((t, p) => t + (p.quantidade || 0), 0);
  const algumSemQuantidade = total.some(p => p.quantidade == null);
  const resumo = total.length
    ? `<div class="linha total"><b>Total de peças:</b> ${esc(soma)}${algumSemQuantidade ? ' (mais as que estão sem quantidade na relação)' : ''} · ${esc(d.servicos.length)} serviço(s) de ${esc(distintos(d.servicos.map(s => s.ligacao_rotulo || s.numero)).length)} carro(s) ou ligação(ões)</div>`
    : '<div class="linha total fraco">Nenhum serviço da ordem tem peças listadas: confira as peças à mão na entrega.</div>';
  const aviso = d.erroCarros ? `<div class="aviso">Não foi possível ler os dados dos carros no sistema (${esc(d.erroCarros)}). Preencha à mão o modelo e a placa.</div>` : '';
  return `<div class="sec"><div class="sec-t">Relação de peças</div>${aviso}<table><thead><tr><th class="num">#</th><th>OP / serviço</th><th>Carro</th><th>Peça</th><th class="num">Qtde</th><th class="centro">Conferida</th></tr></thead><tbody>${corpo}</tbody></table>${resumo}</div>`;
}

export function corpoDaOrdemImpressa(d: DadosDaOrdemImpressa): string {
  const clausulas = clausulasEmLista(d.clausulas);
  const minuta = d.aprovada ? '' : '<div class="minuta">MINUTA — o texto desta ordem ainda não foi aprovado. Não assine sem a revisão do Admin.</div>';
  const nomesDosTipos = distintos(d.servicos.map(s => d.tipos.find(t => t.id === s.tipo_id)?.nome));
  const p = d.prestador;
  return minuta
    + '<div class="conteudo">'
    + blocoDaEmpresa(d.empresa)
    + `<div class="titulo"><h1>Ordem de serviço — ${esc(nomesDosTipos.length ? nomesDosTipos.join(', ').toLowerCase() : 'serviço em lote')}</h1><div class="ref">${esc(d.ordem.numero)}<br/>Emitida em ${esc(dataBR(d.emitidoEm))}</div></div>`
    + blocoDasPartes(d) + blocoDasDatas(d) + blocoDaRelacao(d)
    + `<div class="sec"><div class="sec-t">Cláusulas</div><ol class="clausulas">${clausulas.map(itemDaClausula).join('')}</ol></div>`
    + `<div class="local-data">Peças recebidas pelo prestador em ${emBranco()} · Peças conferidas na devolução por ${emBranco(true)} em ${emBranco()}</div>`
    + '</div>'
    + `<div class="assinaturas"><div class="ass">CONTRATANTE<br/>${esc(nomeNoContrato(d.empresa))}</div><div class="ass">PRESTADOR (recebimento das peças)<br/>${p ? esc(p.razao_social?.trim() || p.nome) : '&nbsp;'}</div></div>`
    + `<div class="rodape">${esc(d.ordem.numero)} · ${esc(d.servicos.length)} serviço(s) · emitida pelo sistema em ${esc(dataBR(d.emitidoEm))}</div>`;
}

export const documentoDaOrdemImpressa = (d: DadosDaOrdemImpressa): string => paginaDeImpressao(`Ordem de serviço ${d.ordem.numero}`, corpoDaOrdemImpressa(d));

export type PedidoDeOrdemImpressa = Omit<DadosDaOrdemImpressa, 'carros' | 'erroCarros'>;

/** Imprime a ordem (a janela abre antes de ler os carros; mesma devolução de `imprimirContrato`). */
export async function imprimirOrdemDeServico(p: PedidoDeOrdemImpressa): Promise<{ ok: boolean; erro?: string; aviso?: string }> {
  const servicos = p.servicos.filter(s => s.status !== 'cancelado');
  if (!servicos.length) return { ok: false, erro: 'A ordem não tem serviço ativo para imprimir.' };
  if (!String(p.clausulas || '').trim()) return { ok: false, erro: 'O modelo do contrato está sem cláusulas: peça ao Admin para preenchê-lo.' };
  const janela = abrirJanelaDeImpressao();
  if (!janela) return { ok: false, erro: MENSAGEM_JANELA_BLOQUEADA };
  const { mapa, erro } = await lerCarrosDasOps(servicos.filter(s => s.ligacao_tipo === 'op' && s.ligacao_id).map(s => s.ligacao_id as string));
  janela.escrever(documentoDaOrdemImpressa({ ...p, servicos, carros: mapa, erroCarros: erro }));
  return { ok: true, aviso: erro ? `Não foi possível ler os dados dos carros (${erro}). A ordem saiu com modelo e placa em branco, para preencher à mão.` : undefined };
}
