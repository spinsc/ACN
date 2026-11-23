// Serviços de terceiros: o CONTRATO SIMPLES impresso (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): um contrato por VISITA, com a lista dos carros (decidido com o usuário).
// "Visita" = os serviços do mesmo grupo do Quadro (mesma venda, tipo, prestador e dia) ou todos os de uma ordem de serviço em lote; um serviço avulso é uma visita de um serviço.
// O que não se quebra aqui:
//  • o texto das cláusulas e os dados das empresas vêm do MODELO (TerceirosConfig.ts); enquanto o Admin não aprovar, a folha sai com a faixa vermelha "MINUTA";
//  • o que o cadastro não tem (CNPJ do prestador, placa e chassi do carro, valor) sai como linha em branco para escrever à mão, nunca "undefined" nem um traço enganoso;
//  • quem não vê valores no sistema imprime o contrato com a linha do valor em branco (o valor combinado não vaza pela folha);
//  • a leitura dos carros falhou? A folha sai com as linhas dos carros em branco e um aviso em âmbar dizendo isso, nunca como "carro sem dados";
//  • a janela abre ANTES de qualquer espera (TerceirosImpressao.ts) e todo texto vem escapado.
import { esc, dataBR, emBranco, textoOuBranco, paginaDeImpressao, abrirJanelaDeImpressao, MENSAGEM_JANELA_BLOQUEADA } from './TerceirosImpressao';
import { clausulasEmLista, nomeNoContrato } from './TerceirosConfig';
import type { EmpresaDoContrato } from './TerceirosConfig';
import { lerCarrosDasOps, descreverNumeros } from './TerceirosServicos';
import type { UnidadeDaVenda } from './TerceirosServicos';
import { rotuloDaLigacao, rotuloDoPeriodo, reaisDoServico } from './TerceirosFluxo';
import type { ServicoDeTerceiro } from './TerceirosFluxo';
import type { PrestadorDeTerceiros, TipoDeServico } from './TerceirosModelo';
import { formatarDocumento } from './TerceirosModelo';
import type { OrdemDeServico } from './TerceirosOrdens';

export type PecaJuntada = { descricao: string; quantidade: number | null };

/** Soma as peças iguais (mesma descrição, sem diferenciar maiúscula nem espaço) de vários serviços; peça sem quantidade em algum serviço fica sem quantidade (não se inventa número). */
export function juntarPecas(servicos: Pick<ServicoDeTerceiro, 'pecas'>[]): PecaJuntada[] {
  const mapa = new Map<string, PecaJuntada>();
  for (const s of servicos) {
    for (const p of s.pecas || []) {
      const nome = String(p?.descricao || '').trim().replace(/\s+/g, ' ');
      if (!nome) continue;
      const k = nome.toLowerCase();
      const q = p.quantidade != null && Number.isFinite(Number(p.quantidade)) ? Number(p.quantidade) : null;
      const ja = mapa.get(k);
      if (!ja) { mapa.set(k, { descricao: nome, quantidade: q }); continue; }
      ja.quantidade = ja.quantidade != null && q != null ? ja.quantidade + q : null;
    }
  }
  return [...mapa.values()];
}

/** "3× bandeja; 2× suporte; tampa" (a peça sem quantidade vai só com o nome). */
export const textoDasPecas = (pecas: PecaJuntada[]): string => pecas.map(p => (p.quantidade != null ? `${p.quantidade}× ${p.descricao}` : p.descricao)).join('; ');

/** O endereço do prestador em uma linha, só com o que o cadastro tem. */
export function enderecoDoPrestador(p: Partial<PrestadorDeTerceiros> | null | undefined): string {
  if (!p) return '';
  const rua = [p.logradouro, p.numero].map(x => String(x || '').trim()).filter(Boolean).join(', ');
  const cidade = [p.cidade, p.uf].map(x => String(x || '').trim()).filter(Boolean).join(' - ');
  return [rua, p.complemento, p.bairro, cidade, p.cep ? `CEP ${p.cep}` : ''].map(x => String(x || '').trim()).filter(Boolean).join(' — ');
}

export type DadosDoContrato = {
  empresa: EmpresaDoContrato; clausulas: string; aprovada: boolean;
  prestador: PrestadorDeTerceiros | null; tipos: TipoDeServico[];
  /** os serviços da visita, sem os cancelados */
  servicos: ServicoDeTerceiro[];
  /** a ordem em lote, se a visita é uma */
  ordem?: OrdemDeServico | null;
  carros: Record<string, UnidadeDaVenda>; erroCarros: string | null;
  veValores: boolean;
  /** o dia da emissão, AAAA-MM-DD */
  emitidoEm: string;
};

export const distintos = (l: (string | null | undefined)[]): string[] => [...new Set(l.map(x => String(x ?? '').trim()).filter(Boolean))];

function linhaDoOnde(servicos: ServicoDeTerceiro[]): string {
  const ondes = distintos(servicos.map(s => s.onde));
  if (ondes.length !== 1) return emBranco();
  return ondes[0] === 'fabrica' ? 'Nas instalações da CONTRATANTE' : 'Nas instalações do PRESTADOR';
}

/** O dia do serviço: o agendado (com o período, se for o mesmo para todos), o realizado, ou em branco quando ainda não há dia. */
function linhaDoDia(servicos: ServicoDeTerceiro[]): string {
  const dias = distintos(servicos.map(s => s.data_realizada || s.data_agendada)).sort();
  if (!dias.length) return emBranco();
  const periodos = distintos(servicos.filter(s => s.status === 'agendado').map(s => s.periodo));
  const sufixo = dias.length === 1 && periodos.length === 1 && periodos[0] !== 'dia_todo' ? ` (${rotuloDoPeriodo(periodos[0]).toLowerCase()})` : '';
  return esc(dias.map(dataBR).join(', ') + sufixo);
}

function linhaDoValor(servicos: ServicoDeTerceiro[], veValores: boolean): string {
  if (!veValores) return emBranco();
  const com = servicos.filter(s => s.valor_combinado != null);
  if (!com.length) return emBranco();
  const total = Math.round(com.reduce((t, s) => t + Number(s.valor_combinado), 0) * 100) / 100;
  if (com.length === servicos.length) return esc(servicos.length > 1 ? `${reaisDoServico(total)} no total (${servicos.length} serviços)` : reaisDoServico(total));
  return `${esc(reaisDoServico(total))} (só ${com.length} de ${servicos.length} serviços têm valor combinado) ${emBranco()}`;
}

/** "Do objeto: …" → o título em negrito (se o começo até os dois pontos for curto) e o resto do texto. */
export function itemDaClausula(linha: string): string {
  const i = linha.indexOf(': ');
  if (i > 0 && i <= 28) return `<li><b>${esc(linha.slice(0, i))}:</b> ${esc(linha.slice(i + 2))}</li>`;
  return `<li>${esc(linha)}</li>`;
}

export function blocoDaEmpresa(e: EmpresaDoContrato): string {
  const dados = [e.cnpj ? `CNPJ ${e.cnpj}` : '', e.endereco, e.telefone, e.email].map(x => String(x || '').trim()).filter(Boolean).join(' · ');
  return `<div class="cab"><div class="empresa">${esc(nomeNoContrato(e))}</div>${dados ? `<div class="dados">${esc(dados)}</div>` : ''}</div>`;
}

export function blocoDasPartes(d: DadosDoContrato): string {
  const e = d.empresa; const p = d.prestador;
  const contratante = [
    `<div class="linha"><b>${esc(nomeNoContrato(e))}</b></div>`,
    `<div class="linha">CNPJ: ${textoOuBranco(e.cnpj)}</div>`,
    `<div class="linha">Endereço: ${textoOuBranco(e.endereco, true)}</div>`,
    e.telefone ? `<div class="linha">Telefone: ${esc(e.telefone)}</div>` : '',
  ].join('');
  const doc = p?.cnpj_cpf ? formatarDocumento(p.cnpj_cpf) : '';
  const prestador = [
    `<div class="linha"><b>${p ? esc(p.razao_social?.trim() || p.nome) : emBranco(true)}</b></div>`,
    `<div class="linha">CNPJ/CPF: ${textoOuBranco(doc)}</div>`,
    `<div class="linha">Endereço: ${textoOuBranco(enderecoDoPrestador(p), true)}</div>`,
    `<div class="linha">Contato: ${textoOuBranco([p?.contato_nome, p?.telefone].map(x => String(x || '').trim()).filter(Boolean).join(' · '))}</div>`,
  ].join('');
  return `<div class="sec"><div class="sec-t">Partes</div><table class="partes"><tr><td><div class="quem">Contratante</div>${contratante}</td><td><div class="quem">Prestador</div>${prestador}</td></tr></table></div>`;
}

function blocoDoServico(d: DadosDoContrato): string {
  const nomesDosTipos = distintos(d.servicos.map(s => d.tipos.find(t => t.id === s.tipo_id)?.nome));
  const descricoes = distintos(d.servicos.map(s => s.descricao));
  const linhas: [string, string][] = [
    ['Tipo de serviço', nomesDosTipos.length ? esc(nomesDosTipos.join(', ')) : emBranco()],
    ['O que será feito', descricoes.length ? esc(descricoes.join('; ')) : emBranco(true)],
    ['Onde', linhaDoOnde(d.servicos)],
  ];
  if (d.ordem) {
    linhas.push(['Ordem de serviço', esc(d.ordem.numero)]);
    linhas.push(['Envio das peças', esc(dataBR(d.ordem.data_envio_real || d.ordem.data_envio_prevista))]);
    linhas.push(['Retorno previsto', esc(dataBR(d.ordem.previsao_retorno))]);
  } else linhas.push(['Dia do serviço', linhaDoDia(d.servicos)]);
  linhas.push(['Valor combinado', linhaDoValor(d.servicos, d.veValores)]);
  return `<div class="sec"><div class="sec-t">Serviço</div><table class="campos">${linhas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table></div>`;
}

function blocoDosCarros(d: DadosDoContrato): string {
  const linhas = d.servicos.map(s => {
    const carro = s.ligacao_tipo === 'op' && s.ligacao_id ? d.carros[s.ligacao_id] : undefined;
    // a OP do serviço dá o rótulo; para o que não é OP (OS, demanda, projeto) o carro não existe e as colunas ficam em branco
    const op = s.ligacao_tipo === 'op' ? (carro?.opl || s.ligacao_rotulo || '') : rotuloDaLigacao(s);
    return `<tr><td>${textoOuBranco(op)}</td><td>${textoOuBranco(carro?.modelo)}</td><td>${textoOuBranco(carro?.placa)}</td><td>${textoOuBranco(carro?.chassi)}</td><td>${esc(textoDasPecas(juntarPecas([s]))) || '<span class="fraco">—</span>'}</td></tr>`;
  });
  const total = juntarPecas(d.servicos);
  const totalHtml = d.servicos.length > 1 && total.length ? `<div class="linha total"><b>Total das peças:</b> ${esc(textoDasPecas(total))}</div>` : '';
  const aviso = d.erroCarros ? `<div class="aviso">Não foi possível ler os dados dos carros no sistema (${esc(d.erroCarros)}). Preencha à mão o modelo, a placa e o chassi.</div>` : '';
  return `<div class="sec"><div class="sec-t">Carros e peças</div>${aviso}<table><thead><tr><th>OP / ligação</th><th>Modelo</th><th>Placa</th><th>Chassi</th><th>Peças</th></tr></thead><tbody>${linhas.join('')}</tbody></table>${totalHtml}</div>`;
}

/** O corpo do contrato (a folha inteira, sem a moldura do documento): função pura, testável sem janela. */
export function corpoDoContrato(d: DadosDoContrato): string {
  const numeros = descreverNumeros(d.servicos);
  const p = d.prestador;
  const clausulas = clausulasEmLista(d.clausulas);
  const minuta = d.aprovada ? '' : '<div class="minuta">MINUTA — o texto deste contrato ainda não foi aprovado. Não assine sem a revisão do Admin.</div>';
  return minuta
    + '<div class="conteudo">'
    + blocoDaEmpresa(d.empresa)
    + `<div class="titulo"><h1>Contrato de prestação de serviço</h1><div class="ref">${esc(numeros)}<br/>Emitido em ${esc(dataBR(d.emitidoEm))}</div></div>`
    + blocoDasPartes(d) + blocoDoServico(d) + blocoDosCarros(d)
    + `<div class="sec"><div class="sec-t">Cláusulas</div><ol class="clausulas">${clausulas.map(itemDaClausula).join('')}</ol></div>`
    + '<div class="local-data">Local e data: ' + emBranco(true) + '</div>'
    + '</div>'
    + `<div class="assinaturas"><div class="ass">CONTRATANTE<br/>${esc(nomeNoContrato(d.empresa))}</div><div class="ass">PRESTADOR<br/>${p ? esc(p.razao_social?.trim() || p.nome) : '&nbsp;'}</div></div>`
    + `<div class="rodape">${esc(numeros)} · emitido pelo sistema em ${esc(dataBR(d.emitidoEm))}</div>`;
}

export const documentoDoContrato = (d: DadosDoContrato): string => paginaDeImpressao(`Contrato — ${descreverNumeros(d.servicos)}`, corpoDoContrato(d));

export type PedidoDeContrato = Omit<DadosDoContrato, 'carros' | 'erroCarros' | 'servicos'> & { servicos: ServicoDeTerceiro[] };

/**
 * Imprime o contrato da visita. A janela abre AGORA (dentro do clique) e só depois se leem os carros no banco; devolve `{ ok:false, erro }` se não há o que imprimir ou se o navegador barrou a janela,
 * e `aviso` quando a folha saiu mas os carros não puderam ser lidos (a folha já traz o aviso; a tela repete).
 */
export async function imprimirContrato(p: PedidoDeContrato): Promise<{ ok: boolean; erro?: string; aviso?: string }> {
  const servicos = p.servicos.filter(s => s.status !== 'cancelado');
  if (!servicos.length) return { ok: false, erro: 'Não há serviço ativo para imprimir o contrato (o pedido foi cancelado).' };
  if (!String(p.clausulas || '').trim()) return { ok: false, erro: 'O modelo do contrato está sem cláusulas: peça ao Admin para preenchê-lo.' };
  const janela = abrirJanelaDeImpressao();
  if (!janela) return { ok: false, erro: MENSAGEM_JANELA_BLOQUEADA };
  const { mapa, erro } = await lerCarrosDasOps(servicos.filter(s => s.ligacao_tipo === 'op' && s.ligacao_id).map(s => s.ligacao_id as string));
  janela.escrever(documentoDoContrato({ ...p, servicos, carros: mapa, erroCarros: erro }));
  return { ok: true, aviso: erro ? `Não foi possível ler os dados dos carros (${erro}). O contrato saiu com modelo, placa e chassi em branco, para preencher à mão.` : undefined };
}

/**
 * Imprime um contrato de EXEMPLO com o texto que o Admin está editando (sem ler nada do banco, então abre na hora): serve para ele ver como a folha fica antes de aprovar.
 * Os dados do serviço são inventados e dizem isso; o prestador e o carro ficam em branco.
 */
export function imprimirExemploDoContrato(empresa: EmpresaDoContrato, clausulas: string, aprovada: boolean, hoje: string): { ok: boolean; erro?: string } {
  if (!String(clausulas || '').trim()) return { ok: false, erro: 'Escreva o texto do contrato antes de imprimir o exemplo.' };
  const janela = abrirJanelaDeImpressao();
  if (!janela) return { ok: false, erro: MENSAGEM_JANELA_BLOQUEADA };
  const servico = {
    id: 'exemplo', numero: 'TS-00000', tipo_id: 'exemplo', descricao: 'EXEMPLO — serviço inventado, só para ler o texto do contrato', status: 'solicitado', ligacao_tipo: null, ligacao_id: null, ligacao_rotulo: null,
    prestador_id: null, onde: 'prestador', valor_combinado: null, valor_final: null, data_agendada: null, data_realizada: null, periodo: null, pecas: [{ descricao: 'Peça de exemplo', quantidade: 2 }],
  } as unknown as ServicoDeTerceiro;
  const tipo = { id: 'exemplo', nome: 'Serviço de exemplo', nome_norm: 'servico de exemplo', quem_marca_data: 'solicitante', onde_padrao: null, usa_ordem_em_lote: false, ativo: true, ordem: 0 } as TipoDeServico;
  janela.escrever(documentoDoContrato({ empresa, clausulas, aprovada, prestador: null, tipos: [tipo], servicos: [servico], carros: {}, erroCarros: null, veValores: false, emitidoEm: hoje }));
  return { ok: true };
}
