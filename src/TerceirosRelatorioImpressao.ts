// Serviços de terceiros, fatia T6 (23/11/2026): a FOLHA DO RELATÓRIO DO MÊS para imprimir ou salvar em PDF. Funções puras (testáveis sem janela) em cima da moldura de TerceirosImpressao.ts.
// Mesmas regras da tela: valor (combinado, cobrado, diferença, pago, a pedir) só sai para quem vê valores, e todo texto do cadastro entra escapado (`esc`).
// A janela de impressão abre NA HORA do clique (os dados já estão na tela, não há o que esperar), e se o navegador a barrar quem chamou avisa a pessoa: nunca "imprimiu" sem ter aberto.
import { esc, dataBR, paginaDeImpressao, abrirJanelaDeImpressao } from './TerceirosImpressao';
import { rotuloDoMes, rotuloDoPagamentoNoRelatorio, diferencaDoServico, ligacaoDoServico } from './TerceirosRelatorio';
import type { ResumoDoMes, LinhaDoRelatorio } from './TerceirosRelatorio';

const reais = (v: unknown): string => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const comSinal = (v: number | null): string => (v === null ? '—' : v === 0 ? reais(0) : `${v > 0 ? '+' : '−'}${reais(Math.abs(v))}`);

const ESTILO = `<style>
  .rel th,.rel td{font-size:10.5px;padding:3px 5px}
  .rel tr.total td{font-weight:700;background:#f1f5f9}
  .rel .sub{margin:3px 0 0;font-size:10.5px;color:#64748b}
  .rel h2{font-size:12.5px;margin:0 0 4px}
</style>`;

function tabelaDeLinhas(rotuloDaChave: string, linhas: LinhaDoRelatorio[], total: LinhaDoRelatorio, verValor: boolean): string {
  const cab = `<tr><th>${esc(rotuloDaChave)}</th><th class="num">Realizados</th>${verValor ? '<th class="num">Combinado</th><th class="num">Cobrado</th><th class="num">Diferença</th><th class="num">Pedido (aberto)</th><th class="num">Pago</th><th class="num">A pedir</th>' : ''}<th class="num">Ainda a fazer</th></tr>`;
  const linha = (l: LinhaDoRelatorio, classe = ''): string =>
    `<tr${classe ? ` class="${classe}"` : ''}><td>${esc(l.nome)}</td><td class="num">${l.realizados}</td>${verValor
      ? `<td class="num">${reais(l.combinado)}</td><td class="num">${reais(l.cobrado)}</td><td class="num">${comSinal(l.diferenca)}</td><td class="num">${reais(l.valorPedido)}</td><td class="num">${reais(l.valorPago)}</td><td class="num">${reais(l.valorAPedir)}</td>`
      : ''}<td class="num">${l.aFazer}</td></tr>`;
  return `<table><thead>${cab}</thead><tbody>${linhas.map(l => linha(l)).join('')}${linha(total, 'total')}</tbody></table>`;
}

/** O corpo da folha (já escapado). `geradoPor` e `geradoEm` vão no rodapé. */
export function corpoDoRelatorio(r: ResumoDoMes, verValor: boolean, geradoPor: string, geradoEm: string): string {
  const tipos = new Map(r.porTipo.map(l => [l.chave, l.nome]));
  const partes: string[] = [ESTILO];
  partes.push(`<div class="conteudo rel">`);
  partes.push(`<div class="titulo"><h1>Serviços de terceiros</h1><div class="ref">Relatório de ${esc(rotuloDoMes(r.mes))}<br/>Pelo dia em que o serviço foi realizado</div></div>`);

  if (r.total.realizados === 0 && r.total.aFazer === 0 && r.total.anteriores === 0) {
    partes.push(`<div class="aviso">Nenhum serviço foi dado como realizado em ${esc(rotuloDoMes(r.mes))}.</div>`);
  } else {
    partes.push(`<div class="sec"><div class="sec-t">Por prestador</div>${tabelaDeLinhas('Prestador', r.porPrestador, r.total, verValor)}`
      + `<p class="sub">"Ainda a fazer" são os serviços agendados para o mês que ainda não foram dados como realizados.</p></div>`);
    partes.push(`<div class="sec"><div class="sec-t">Por tipo de serviço</div>${tabelaDeLinhas('Tipo de serviço', r.porTipo, r.total, verValor)}</div>`);
    if (r.total.anteriores > 0) {
      partes.push(`<div class="aviso">${r.total.anteriores} serviço${r.total.anteriores > 1 ? 's' : ''} agendado${r.total.anteriores > 1 ? 's' : ''} em meses anteriores segue${r.total.anteriores > 1 ? 'm' : ''} sem baixa (não entra${r.total.anteriores > 1 ? 'm' : ''} nas contas deste mês).</div>`);
    }
    for (const p of r.porPrestador) {
      const servicos = r.servicosDoPrestador.get(p.chave)?.realizados || [];
      if (!servicos.length) continue;
      const cab = `<tr><th>Nº</th><th>Tipo</th><th>Descrição</th><th>Ligação</th><th>Realizado em</th>${verValor ? '<th class="num">Combinado</th><th class="num">Cobrado</th><th class="num">Diferença</th><th>Pagamento</th>' : ''}</tr>`;
      const linhas = servicos.map(s => `<tr><td>${esc(s.numero)}</td><td>${esc(tipos.get(s.tipo_id) || '')}</td><td>${esc(s.descricao || '')}</td><td>${esc(ligacaoDoServico(s))}</td><td>${esc(dataBR(s.data_realizada))}</td>${verValor
        ? `<td class="num">${reais(s.valor_combinado)}</td><td class="num">${reais(s.valor_final)}</td><td class="num">${comSinal(diferencaDoServico(s))}</td><td>${esc(rotuloDoPagamentoNoRelatorio(s))}</td>`
        : ''}</tr>`).join('');
      partes.push(`<div class="sec"><div class="sec-t">${esc(p.nome)} — ${p.realizados} serviço${p.realizados > 1 ? 's' : ''} realizado${p.realizados > 1 ? 's' : ''}</div><table><thead>${cab}</thead><tbody>${linhas}</tbody></table></div>`);
    }
  }
  partes.push(`</div>`);
  partes.push(`<div class="rodape">Gerado por ${esc(geradoPor || 'usuário do sistema')} em ${esc(geradoEm)}${verValor ? '' : ' · sem valores (quem gerou não vê valores no sistema)'}</div>`);
  return partes.join('');
}

export const tituloDaFolha = (mes: string): string => `Serviços de terceiros — ${rotuloDoMes(mes)}`;

/** Abre a janela de impressão com a folha. Devolve false se o navegador barrou a janela (quem chamou avisa a pessoa). */
export function imprimirRelatorio(r: ResumoDoMes, verValor: boolean, geradoPor: string): boolean {
  const j = abrirJanelaDeImpressao();
  if (!j) return false;
  const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  j.escrever(paginaDeImpressao(tituloDaFolha(r.mes), corpoDoRelatorio(r, verValor, geradoPor, agora)));
  return true;
}
