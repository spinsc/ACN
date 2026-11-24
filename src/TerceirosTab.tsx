// @ts-nocheck
// Serviços de terceiros: película, plotagem, pintura, lavagem, funilaria, corte e dobra e os outros serviços feitos por quem é de fora (pedido do usuário em 22/11/2026;
// PLANO_SERVICOS_TERCEIROS.md). Fatia T2: o pedido de serviço, o Quadro (A definir, Agendado, Realizado), a Lista e os filtros de pendência, junto dos dois cadastros da T1 (prestadores e tipos).
// Fatia T3 (23/11/2026): a Agenda (semana e mês, por prestador ou por tipo, com o choque em vermelho) e o aviso do Calendário que abre o serviço atrasado daqui.
// Fatia T4 (23/11/2026): o contrato impresso de todo serviço, a ordem de serviço em lote da pintura eletrostática (aba "Ordens de pintura": montar, enviar com a cópia assinada, registrar o retorno)
// e a aba "Modelo do contrato" (o texto e os dados das empresas, que só o Admin edita).
// Fatia T6 (23/11/2026): a aba "Relatório do mês" (por prestador e por tipo, com planilha do Excel e folha para imprimir; lê o mês escolhido por conta própria).
// Todo usuário entra aqui (todos pedem e todos veem todos os serviços); quem pode mexer em cada um é regra de TerceirosFluxo.ts, conferida de novo pelo banco.
// Esta tela só orquestra: lê, filtra, abre as janelas e junta à lista o que o banco confirmou. As regras estão em TerceirosFluxo.ts (e, da Agenda, em TerceirosAgenda.ts) e a leitura e a gravação em TerceirosServicos.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mdiPlus, mdiRefresh } from '@mdi/js';
import { CabecalhoTela, Abas, Botao, Faixa, hojeISO } from './Interface';
import { mostrarAviso } from './Feedback';
import { intervaloVisivel } from './IntervaloVisivel';
import { lerTipos, lerPrestadores } from './TerceirosModelo';
import { podeGerirPrestadoresDeTerceiros, podeEditarTiposDeTerceiros, podeEditarModeloDoContrato } from './utils/permissoes';
import { PrestadoresDeTerceiros } from './TerceirosPrestadores';
import { TiposDeTerceiros } from './TerceirosTipos';
import { FILTROS_VAZIOS, cartoesDaColuna, choquesDeData, contarPendencias, passaNosFiltros, veValores, rotuloDoPeriodo, estaEmOrdemAtiva } from './TerceirosFluxo';
import { lerServicos, auditarServicos, cancelarServicos, voltarServicos, descreverNumeros, DIAS_DA_JANELA_DE_LEITURA } from './TerceirosServicos';
import { BarraDeFiltros } from './TerceirosFiltros';
import { QuadroDeTerceiros } from './TerceirosQuadro';
import { ListaDeTerceiros } from './TerceirosLista';
import { AgendaDeTerceiros } from './TerceirosAgendaTela';
import { ModalAgendar, ModalRealizar, pedirMotivoValido } from './TerceirosAcoes';
import { ModalSolicitar } from './TerceirosSolicitar';
import { ModalDoServico, ModalDoGrupo } from './TerceirosServicoModal';
import { lerOrdens, anexarOrdens, auditarOrdem, ordemEstaAtiva } from './TerceirosOrdens';
import { lerConfigDoContrato } from './TerceirosConfig';
import { lerDemandasDePagamento, anexarPagamentos, demandaEstaEncerrada, fraseDoPagamentoPedido } from './TerceirosPagamento';
import { lerSaidasPorId, anexarVistorias, saidaEstaEncerrada, desligarSaida, irParaRegistrarSaida, saidaPreenchida } from './TerceirosVistoria';
import { ModalPedirPagamento } from './TerceirosPagamentoTela';
import { ModalLigarSaida } from './TerceirosVistoriaTela';
import { OrdensDeTerceiros } from './TerceirosOrdensTela';
import { ModalDaOrdem } from './TerceirosOrdemModal';
import { ModalMontarOrdem } from './TerceirosOrdemPassos';
import { ModalImprimir } from './TerceirosImprimir';
import { ModeloDoContrato } from './TerceirosModeloContrato';
import { RelatorioDeTerceiros } from './TerceirosRelatorioTela';
import { diaCompleto } from './TerceirosPecas';
import './terceiros.css';

const VAZIO = { lista: [], erro: null, lido: false };
const SERVICOS_VAZIOS = { lista: [], erro: null, lido: false, escondidos: 0, desde: null };
const CONFIG_VAZIA = { config: null, erro: null, lido: false };
const CHAVE_DA_VISAO = 'acn_terceiros_visao';
const UM_MINUTO = 60000;   // a regra do custo do banco: uma consulta por minuto por tela, no máximo (CLAUDE.md, "Custo do banco")

const VISOES_DOS_SERVICOS = ['quadro', 'agenda', 'lista'];   // as três visões dos serviços (as outras abas são cadastros)
const LEITURA_VAZIA = { mapa: new Map<string, any>(), erro: null, lido: false };   // o que se sabe das demandas de pagamento e das saídas da vistoria ligadas aos serviços (T5)

/**
 * T5 (23/11/2026): o que ler de novo das demandas de pagamento e das saídas da vistoria. Na leitura completa (a primeira, "Atualizar", "Mostrar todos") são todas; na atualização de minuto em minuto
 * só as que ainda podem mudar (a demanda ainda aberta, a saída que ainda não voltou) ou que a tela ainda não conhece: o pagamento concluído e a saída que voltou não mudam mais, e
 * a regra do custo do banco (CLAUDE.md) é no máximo uma consulta por minuto por tela sem motivo escrito: este é o motivo.
 */
const idsParaLer = (ids: any[], conhecidos: Map<string, any>, encerrado: (v: any) => boolean, tudo: boolean): string[] => {
  const unicos = [...new Set(ids.filter(Boolean))] as string[];
  return tudo ? unicos : unicos.filter(id => !conhecidos.has(id) || !encerrado(conhecidos.get(id)));
};
/** Junta o que a leitura trouxe ao que a tela já sabia. Leitura recusada mantém o de antes e guarda o erro; o que foi pedido e não voltou (demanda apagada) sai do mapa. */
const mesclarLeitura = (antes: any, lida: any, pedidos: string[], tudo: boolean) => {
  if (lida.erro) return { mapa: antes.mapa, erro: lida.erro, lido: true };
  const mapa = tudo ? new Map<string, any>() : new Map<string, any>(antes.mapa);
  for (const id of pedidos) mapa.delete(id);
  for (const [id, v] of lida.mapa) mapa.set(id, v);
  return { mapa, erro: null, lido: true };
};
/** Nada a ler desta vez: a leitura completa zera o que se sabia; a de minuto em minuto só tira o erro de antes (o que está guardado já é o último estado de cada um). */
const semNadaParaLer = (antes: any, tudo: boolean) => (tudo ? { mapa: new Map<string, any>(), erro: null, lido: true } : (antes.erro || !antes.lido ? { ...antes, erro: null, lido: true } : antes));

/** A última visão que a pessoa usou (Quadro, Agenda ou Lista); o módulo abre sempre no Quadro quando não há nada guardado. O armazenamento pode falhar: aí vale o Quadro. */
function visaoGuardada(): string {
  try { const v = localStorage.getItem(CHAVE_DA_VISAO) || ''; return VISOES_DOS_SERVICOS.includes(v) ? v : 'quadro'; } catch { return 'quadro'; }
}
function guardarVisao(v: string) {
  try { localStorage.setItem(CHAVE_DA_VISAO, v); } catch { /* sem armazenamento: na próxima vez abre no Quadro */ }
}

const fraseDoAgendamento = (linhas: any[], statusAntes: string): string => {
  const d = linhas[0];
  const varios = linhas.length > 1;
  const verbo = statusAntes === 'agendado' ? (varios ? 'reagendados' : 'reagendado') : (varios ? 'agendados' : 'agendado');
  return `${descreverNumeros(linhas)} ${verbo} para ${diaCompleto(d.data_agendada)}, ${rotuloDoPeriodo(d.periodo).toLowerCase()}.`;
};
const fraseDaConclusao = (linhas: any[]): string => `${descreverNumeros(linhas)} dado${linhas.length > 1 ? 's' : ''} como realizado${linhas.length > 1 ? 's' : ''}.`;

export default function TerceirosTab({ currentUser }) {
  const [aba, setAba] = useState<string>(visaoGuardada);
  const [tipos, setTipos] = useState<any>(VAZIO);
  const [prestadores, setPrestadores] = useState<any>(VAZIO);
  const [servicos, setServicos] = useState<any>(SERVICOS_VAZIOS);
  const [ordens, setOrdens] = useState<any>(VAZIO);
  const [config, setConfig] = useState<any>(CONFIG_VAZIA);   // o modelo do contrato (empresas e cláusulas); lido uma vez, não de minuto em minuto
  const [todos, setTodos] = useState(false);
  const [filtros, setFiltros] = useState<any>({ ...FILTROS_VAZIOS });
  const [solicitando, setSolicitando] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<any>(null);
  const [agendar, setAgendar] = useState<any>(null);
  const [realizar, setRealizar] = useState<any>(null);
  const [pendente, setPendente] = useState<any>(null);   // o serviço que o aviso do Calendário quer abrir: { id, tentouTodos }
  const [ordemAbertaId, setOrdemAbertaId] = useState<string | null>(null);
  const [montando, setMontando] = useState<any[] | null>(null);   // os serviços escolhidos para a janela de montar a ordem
  const [imprimindo, setImprimindo] = useState<any>(null);   // { tipo: 'contrato' | 'ordem', servicos, ordem }
  const [trocandoJanela, setTrocandoJanela] = useState(false);   // true enquanto a leitura de "todos os dias" (ou a volta aos últimos 120) não terminou
  const [demandas, setDemandas] = useState<any>(LEITURA_VAZIA);   // T5: id da demanda de pagamento → status (lido do Financeiro; o serviço só guarda o id)
  const [saidas, setSaidas] = useState<any>(LEITURA_VAZIA);   // T5: id da saída da vistoria → a saída (lida da Vistoria; o serviço só guarda o id)
  const [pagando, setPagando] = useState<any>(null);   // T5: os serviços do pedido de pagamento que a janela está montando
  const [ligandoSaida, setLigandoSaida] = useState<any>(null);   // T5: os serviços que a janela "Ligar a uma saída" está ligando
  const todosRef = useRef(false);
  const ordensRef = useRef<any>(VAZIO);
  const demandasRef = useRef<any>(LEITURA_VAZIA);
  const saidasRef = useRef<any>(LEITURA_VAZIA);
  const versaoLocal = useRef(0);   // sobe a cada gravação nossa: a leitura que começou antes dela não pode desfazê-la
  const montada = useRef(true);
  todosRef.current = todos;
  ordensRef.current = ordens;
  demandasRef.current = demandas;
  saidasRef.current = saidas;

  // Releitura que falha NÃO esvazia a lista que já está na tela: mantém a de antes e mostra o aviso (a leitura recusada nunca vale como "não há nada").
  const carregarCadastros = useCallback(async () => {
    const [t, p] = await Promise.all([lerTipos(), lerPrestadores()]);
    if (!montada.current) return;
    setTipos((antes: any) => (t.erro ? { ...antes, erro: t.erro, lido: true } : { ...t, lido: true }));
    setPrestadores((antes: any) => (p.erro ? { ...antes, erro: p.erro, lido: true } : { ...p, lido: true }));
  }, []);

  const carregarServicos = useCallback(async (todosOsDias: boolean, contar = true, tentativas = 1) => {
    const v = versaoLocal.current;
    const r = await lerServicos(hojeISO(), todosOsDias, contar);
    if (!montada.current) return;
    if (!r.erro && v !== versaoLocal.current) {
      // uma gravação nossa terminou enquanto a leitura corria: ela pode ter lido o serviço de antes dela. Lê de novo (uma vez) em vez de trocar o que a tela já mostra.
      if (tentativas > 0) return carregarServicos(todosOsDias, contar, tentativas - 1);   // devolve a promessa: quem espera a leitura (o aviso do Calendário) só segue depois da segunda
      return;
    }
    // As ordens de serviço vêm junto (T4, 23/11/2026): o serviço só sabe em que ordem está pelo id, e a situação dela (que o trava) está na ordem. Na atualização de minuto em minuto (`contar` falso)
    // a segunda consulta só roda quando há o que atualizar: algum serviço lido está numa ordem ou a tela já tinha uma ordem em andamento (que outra pessoa pode ter fechado ou cancelado).
    // Leitura que falha NÃO esvazia as ordens: mantém as de antes e avisa; o serviço de uma ordem desconhecida vale como preso a ela (mais seguro).
    let o: any = null;
    // T5 (23/11/2026): o pagamento pedido ao Financeiro e a saída da vistoria de pátio ligada ao serviço são lidos de onde moram (a demanda e a Vistoria): o serviço guarda só o id.
    // Leitura que falha NÃO apaga o que a tela já sabia: o serviço de uma demanda ou saída que não foi lida mostra "situação não lida", nunca "a pagar" nem "voltou".
    let d: any = null, sa: any = null;
    let idsDemandas: string[] = [], idsSaidas: string[] = [];
    if (!r.erro) {
      const idsDasOrdens = r.lista.map((s: any) => s.ordem_id).filter(Boolean);
      if (contar || idsDasOrdens.length > 0 || ordensRef.current.lista.some(ordemEstaAtiva)) {
        o = await lerOrdens(hojeISO(), todosOsDias, idsDasOrdens);
        if (!montada.current) return;
        if (!o.erro && v !== versaoLocal.current) {
          if (tentativas > 0) return carregarServicos(todosOsDias, contar, tentativas - 1);
          return;
        }
      }
      idsDemandas = idsParaLer(r.lista.map((s: any) => s.pagamento_demanda_id), demandasRef.current.mapa, demandaEstaEncerrada, contar);
      idsSaidas = idsParaLer(r.lista.map((s: any) => s.vistoria_id), saidasRef.current.mapa, saidaEstaEncerrada, contar);
      if (idsDemandas.length) { d = await lerDemandasDePagamento(idsDemandas); if (!montada.current) return; }
      if (idsSaidas.length) { sa = await lerSaidasPorId(idsSaidas); if (!montada.current) return; }
      if ((d || sa) && v !== versaoLocal.current) {
        if (tentativas > 0) return carregarServicos(todosOsDias, contar, tentativas - 1);
        return;
      }
    }
    setServicos((antes: any) => (r.erro
      ? { ...antes, erro: r.erro, lido: true }
      : { lista: r.lista, erro: null, lido: true, escondidos: r.escondidos === undefined ? antes.escondidos : r.escondidos, desde: r.desde }));
    if (o) setOrdens((antes: any) => (o.erro ? { ...antes, erro: o.erro, lido: true } : { lista: o.lista, erro: null, lido: true }));
    else if (!r.erro) setOrdens((antes: any) => (antes.lido ? antes : { ...antes, lido: true }));
    if (!r.erro) {
      setDemandas((antes: any) => (d ? mesclarLeitura(antes, d, idsDemandas, contar) : semNadaParaLer(antes, contar)));
      setSaidas((antes: any) => (sa ? mesclarLeitura(antes, sa, idsSaidas, contar) : semNadaParaLer(antes, contar)));
    }
  }, []);

  const carregarConfig = useCallback(async () => {
    const r = await lerConfigDoContrato();
    if (!montada.current) return;
    setConfig((antes: any) => (r.erro ? { ...antes, erro: r.erro, lido: true } : { config: r.config, erro: null, lido: true }));
  }, []);

  useEffect(() => {
    montada.current = true;
    carregarCadastros();
    carregarConfig();
    carregarServicos(false);
    // atualização de minuto em minuto, só com a aba à vista, e sem a contagem dos antigos (seria uma segunda consulta por minuto)
    const id = intervaloVisivel(() => { carregarServicos(todosRef.current, false); }, UM_MINUTO);
    return () => { montada.current = false; clearInterval(id); };
  }, [carregarCadastros, carregarConfig, carregarServicos]);

  // os serviços que a tela mostra: os lidos, já com o número e a situação da ordem em que cada um está, a situação do pagamento pedido e a da saída da vistoria ligada (campos derivados, T4 e T5).
  // Enquanto uma das leituras não aconteceu (`lido` falso) vale `null`: o serviço com pedido ou saída ligados mostra "situação não lida", nunca um palpite.
  const lista = useMemo(
    () => anexarVistorias(anexarPagamentos(anexarOrdens(servicos.lista, ordens.lista), demandas.lido ? demandas : null), saidas.lido ? saidas : null),
    [servicos.lista, ordens.lista, demandas, saidas],
  );

  const mapaTipos = useMemo(() => new Map(tipos.lista.map((t: any) => [t.id, t])), [tipos.lista]);
  const mapaPrestadores = useMemo(() => new Map(prestadores.lista.map((p: any) => [p.id, p])), [prestadores.lista]);
  const nomesDosPrestadores = useMemo(() => Object.fromEntries(prestadores.lista.map((p: any) => [p.id, p.nome])), [prestadores.lista]);
  const choques = useMemo(() => choquesDeData(lista), [lista]);
  const hoje = hojeISO();
  const verValor = veValores(currentUser);

  const visiveis = useMemo(
    () => lista.filter((s: any) => passaNosFiltros(s, filtros, { u: currentUser, hoje, tipos: mapaTipos, prestadores: mapaPrestadores, choques })),
    [lista, filtros, mapaTipos, mapaPrestadores, choques, hoje, currentUser],
  );
  const contagens = useMemo(
    () => contarPendencias(lista, filtros, { u: currentUser, hoje, tipos: mapaTipos, prestadores: mapaPrestadores, choques }),
    [lista, filtros, mapaTipos, mapaPrestadores, choques, hoje, currentUser],
  );
  const abertos = useMemo(() => lista.filter((s: any) => s.status === 'solicitado' || s.status === 'agendado').length, [lista]);
  const ordensAndando = useMemo(() => ordens.lista.filter(ordemEstaAtiva).length, [ordens.lista]);

  const mudarFiltros = useCallback((parte: any) => setFiltros((f: any) => ({ ...f, ...parte })), []);
  const mudarAba = (id: string) => { setAba(id); if (VISOES_DOS_SERVICOS.includes(id)) guardarVisao(id); };
  const verTodos = (valor: boolean) => {
    todosRef.current = valor; setTodos(valor); setTrocandoJanela(true);
    carregarServicos(valor, true).finally(() => { if (montada.current) setTrocandoJanela(false); });
  };
  const reler = useCallback(() => carregarServicos(todosRef.current, true), [carregarServicos]);

  /** Junta à lista o que o banco confirmou (sem esperar a próxima leitura), registra no histórico geral e diz o que foi feito. */
  const gravou = useCallback((linhas: any[], antes: any[], frase?: string) => {
    versaoLocal.current++;
    const novas = new Map(linhas.map((l: any) => { const { historico, ...resto } = l; return [l.id, resto]; }));
    setServicos((a: any) => ({ ...a, lista: a.lista.map((s: any) => (novas.has(s.id) ? { ...s, ...novas.get(s.id) } : s)) }));
    auditarServicos(antes, linhas, currentUser, nomesDosPrestadores);
    if (frase) mostrarAviso(frase, 'ok');
  }, [currentUser, nomesDosPrestadores]);

  /** O passo escolhido (menu do cartão, botão da janela ou arrastar para outra coluna). Agendar e realizar pedem dados, então só abrem a janela; voltar, reabrir e cancelar pedem o motivo aqui. */
  const mover = useCallback(async (m: any, alvos: any[]) => {
    if (!alvos?.length) return;
    const statusAtual = alvos[0].status;
    if (!alvos.every((s: any) => s.status === statusAtual)) { mostrarAviso('Os serviços escolhidos não estão todos na mesma coluna. Atualize a tela e tente de novo.', 'atencao'); return; }
    if (m.acao === 'agendar' || m.acao === 'reagendar') { setAgendar({ servicos: alvos, statusAtual }); return; }
    if (m.acao === 'realizar') { setRealizar({ servicos: alvos, statusAtual }); return; }
    const quem = descreverNumeros(alvos);
    const varios = alvos.length > 1;
    const pergunta = m.acao === 'cancelar'
      ? `Cancelar ${quem}?\n\nO pedido sai do quadro e fica em "Cancelados", com o motivo no histórico. Escreva o motivo (pelo menos 5 letras):`
      : m.acao === 'voltar_a_definir'
        ? `Voltar ${quem} para "A definir"?\n\nO dia e o período marcados saem; o prestador fica. Escreva o motivo (pelo menos 5 letras):`
        : `Reabrir ${quem}?\n\nO serviço volta para "Agendado". O dia em que foi feito, o valor final e quem conferiu saem, e o histórico guarda os de antes. Escreva o motivo (pelo menos 5 letras):`;
    const motivo = await pedirMotivoValido(pergunta);
    if (motivo === null) return;
    const ids = alvos.map((s: any) => s.id);
    const r = m.acao === 'cancelar' ? await cancelarServicos(ids, motivo, statusAtual) : await voltarServicos(ids, m.para, motivo, statusAtual);
    if (!r.ok) {
      mostrarAviso(r.erro, 'erro');
      if (r.reler) reler();   // alguém mexeu antes: a tela de trás ainda mostra a coluna de antes
      return;
    }
    const frase = m.acao === 'cancelar' ? `${quem} cancelad${varios ? 'os' : 'o'}.`
      : m.acao === 'voltar_a_definir' ? `${quem} ${varios ? 'voltaram' : 'voltou'} para "A definir".`
        : `${quem} reaberto${varios ? 's' : ''}: ${varios ? 'voltaram' : 'voltou'} para "Agendado".`;
    gravou(r.dados, alvos, frase);
  }, [gravou, reler]);

  /** Junta o que o banco confirmou de uma ordem (a ordem e os serviços tocados), sem esperar a próxima leitura; registra no histórico geral e diz o que foi feito. */
  const gravouOrdem = useCallback((r: any, ordemAntes: any, antes: any[], frase?: string) => {
    versaoLocal.current++;
    setOrdens((a: any) => ({ ...a, lista: a.lista.some((o: any) => o.id === r.ordem.id) ? a.lista.map((o: any) => (o.id === r.ordem.id ? r.ordem : o)) : [...a.lista, r.ordem] }));
    if (r.servicos?.length) gravou(r.servicos, antes, undefined);
    auditarOrdem(ordemAntes, r.ordem, currentUser);
    if (frase) mostrarAviso(frase, 'ok');
  }, [currentUser, gravou]);

  const abrirServico = useCallback((s: any) => setDetalheId(s.id), []);
  // a janela da ordem fica POR BAIXO da do serviço e da do grupo (desenhadas depois): quem abre a ordem a partir delas as fecha, e quem abre um serviço de dentro da ordem o vê por cima dela
  const abrirOrdem = useCallback((id: string) => { setDetalheId(null); setGrupo(null); setOrdemAbertaId(id); }, []);
  const comecarOrdem = useCallback((escolhidos: any[]) => setMontando(escolhidos), []);
  const imprimirContrato = useCallback((escolhidos: any[]) => {
    const ordemId = escolhidos[0]?.ordem_id;
    const ordem = ordemId && escolhidos.every((s: any) => s.ordem_id === ordemId) ? ordens.lista.find((o: any) => o.id === ordemId && o.status !== 'cancelada') || null : null;
    setImprimindo({ tipo: 'contrato', servicos: escolhidos, ordem });
  }, [ordens.lista]);
  const imprimirDaOrdem = useCallback((p: any) => setImprimindo(p), []);
  const abrirGrupo = useCallback((cartao: any) => setGrupo({ ids: cartao.servicos.map((s: any) => s.id), status: cartao.base.status }), []);

  // ── T5 (23/11/2026): o pagamento ao prestador e a saída da vistoria de pátio ──
  const tipoDoServico = useCallback((s: any) => mapaTipos.get(s.tipo_id), [mapaTipos]);
  const pedirPagamentoDe = useCallback((escolhidos: any[]) => setPagando({ servicos: escolhidos }), []);
  /** O banco abriu a demanda e ligou os serviços: a tela já sabe que ela está aberta (o Financeiro ainda não concluiu) e junta as linhas confirmadas, sem esperar a próxima leitura. */
  const aoPediuPagamento = useCallback((p: any, antes: any[]) => {
    setPagando(null);
    setDemandas((a: any) => ({ mapa: new Map<string, any>(a.mapa).set(p.demanda_id, 'Pendente'), erro: a.erro, lido: true }));
    gravou(p.servicos, antes, fraseDoPagamentoPedido(p, verValor));
  }, [gravou, verValor]);
  /** Leva à Vistoria já preenchida: lá, ao salvar a saída, ela é ligada aos serviços (a Vistoria é quem chama `ligarSaida`). */
  const registrarSaidaDe = useCallback((escolhidos: any[]) => {
    const prestador = mapaPrestadores.get(escolhidos[0].prestador_id) || null;
    irParaRegistrarSaida(saidaPreenchida(escolhidos, prestador, tipoDoServico, currentUser));
  }, [mapaPrestadores, tipoDoServico, currentUser]);
  const ligarSaidaDe = useCallback((escolhidos: any[]) => setLigandoSaida({ servicos: escolhidos }), []);
  /** Ligou: lê a saída escolhida antes de mostrar (senão o serviço apareceria um instante como "situação não lida") e junta as linhas confirmadas. */
  const aoLigouSaida = useCallback(async (linhas: any[], antes: any[]) => {
    setLigandoSaida(null);
    const lida = await lerSaidasPorId([...new Set(linhas.map((l: any) => l.vistoria_id).filter(Boolean))] as string[]);
    if (!montada.current) return;
    if (!lida.erro) setSaidas((a: any) => ({ mapa: new Map<string, any>([...a.mapa, ...lida.mapa]), erro: a.erro, lido: true }));
    gravou(linhas, antes, `${descreverNumeros(linhas)} ligad${linhas.length > 1 ? 'os' : 'o'} à saída da vistoria de pátio.${lida.erro ? ' Não foi possível ler a situação da saída agora: ela aparece na próxima atualização.' : ''}`);
  }, [gravou]);
  const desligarSaidaDe = useCallback(async (escolhidos: any[]) => {
    const quem = descreverNumeros(escolhidos);
    const motivo = await pedirMotivoValido(`Desligar ${quem} da saída da vistoria de pátio?\n\nA saída continua na Vistoria como está; só deixa de estar ligada ao serviço, e o histórico do serviço guarda o motivo. Escreva o motivo (pelo menos 5 letras):`);
    if (motivo === null) return;
    const r = await desligarSaida(escolhidos.map((s: any) => s.id), motivo);
    if (!r.ok) { mostrarAviso(r.erro, 'erro'); if (r.reler) reler(); return; }
    gravou(r.dados, escolhidos, `${quem} desligad${escolhidos.length > 1 ? 'os' : 'o'} da saída da vistoria de pátio.`);
  }, [gravou, reler]);
  // as quatro peças que as janelas do serviço, do grupo e da ordem recebem
  const aoPagamentoESaida = { aoPedirPagamento: pedirPagamentoDe, aoRegistrarSaida: registrarSaidaDe, aoLigarSaida: ligarSaidaDe, aoDesligarSaida: desligarSaidaDe };
  const erroDaLeituraAuxiliar = demandas.erro || saidas.erro
    ? `${demandas.erro ? 'a situação dos pagamentos pedidos ao Financeiro' : ''}${demandas.erro && saidas.erro ? ' e ' : ''}${saidas.erro ? 'as saídas da vistoria de pátio' : ''} (${demandas.erro || saidas.erro})`
    : '';

  const detalhe = detalheId ? lista.find((s: any) => s.id === detalheId) : null;
  useEffect(() => { if (detalheId && servicos.lido && !detalhe) setDetalheId(null); }, [detalheId, detalhe, servicos.lido]);

  // O aviso do Calendário (serviço atrasado) e o botão "Abrir" dele chegam por aqui (T3, 23/11/2026): o recado fica em window.__acnDeepLink e o evento cobre a tela já aberta, como nas Viagens.
  // O id é o do primeiro serviço da visita: o serviço sozinho abre a janela dele, e o que está num cartão de grupo (vários carros da mesma venda) abre a janela do grupo.
  useEffect(() => {
    const pegar = (e?: any) => {
      const pend = (window as any).__acnDeepLink || e?.detail;
      if (!pend || pend.contexto !== 'terceiro_servico' || !pend.contextoId) return;
      (window as any).__acnDeepLink = null;
      setPendente({ id: String(pend.contextoId), tentouTodos: false });
    };
    pegar();
    window.addEventListener('acn:abrir-registro', pegar);
    return () => window.removeEventListener('acn:abrir-registro', pegar);
  }, []);
  useEffect(() => {
    if (!pendente || !servicos.lido || trocandoJanela) return;
    const s = lista.find((x: any) => x.id === pendente.id);
    if (s) {
      if (estaEmOrdemAtiva(s)) { abrirOrdem(s.ordem_id); setPendente(null); return; }   // a visita de uma ordem em lote é a própria ordem
      const cartao = cartoesDaColuna(lista, s.status).find((c: any) => (c.tipo === 'grupo' ? c.servicos.some((y: any) => y.id === s.id) : c.servico.id === s.id));
      if (cartao?.tipo === 'grupo') abrirGrupo(cartao); else setDetalheId(s.id);
      setPendente(null);
      return;
    }
    // não está na lista: pode ser mais antigo que a janela de 120 dias, então lê uma vez com todos os dias antes de desistir (leitura recusada nunca vale como "não existe")
    if (!todosRef.current && !pendente.tentouTodos && !servicos.erro) { setPendente({ ...pendente, tentouTodos: true }); verTodos(true); return; }
    mostrarAviso(servicos.erro
      ? 'Não foi possível abrir o serviço do aviso: a leitura dos serviços falhou. Atualize a tela e tente de novo.'
      : 'Não encontrei o serviço deste aviso. Confira na Lista, em "Todos" (ele pode ter sido cancelado).', 'atencao');
    setPendente(null);
  }, [pendente, servicos.lido, lista, servicos.erro, trocandoJanela, abrirGrupo, abrirOrdem]);   // eslint-disable-line react-hooks/exhaustive-deps

  const lido = tipos.lido && prestadores.lido && servicos.lido;
  const semTipos = tipos.lido && tipos.lista.length === 0;
  const mostraServicos = VISOES_DOS_SERVICOS.includes(aba);

  return (
    <div className="acn-terc">
      <CabecalhoTela
        titulo="Serviços de terceiros"
        subtitulo="Película, plotagem, pintura, lavagem e os outros serviços feitos por quem é de fora: peça, agende e confira aqui. Todo mundo pede e todo mundo vê; cada um mexe no que é seu."
        acoes={(
          <>
            <Botao variante="secundario" icone={mdiRefresh} onClick={() => { carregarCadastros(); carregarConfig(); reler(); }}>Atualizar</Botao>
            <Botao variante="primario" icone={mdiPlus} disabled={!tipos.lido || semTipos} onClick={() => setSolicitando(true)}>Solicitar serviço</Botao>
          </>
        )}
        abas={(
          <Abas ativa={aba} onChange={mudarAba} itens={[
            { id: 'quadro', rotulo: 'Quadro', contagem: servicos.lido ? abertos : null, titulo: 'Serviços em aberto: A definir e Agendado' },
            { id: 'agenda', rotulo: 'Agenda', titulo: 'Quem está onde em cada dia: a semana e o mês, por prestador ou por tipo' },
            { id: 'lista', rotulo: 'Lista' },
            { id: 'relatorio', rotulo: 'Relatório do mês', titulo: 'Por prestador, no mês: quantos serviços fez, quanto estava combinado, quanto cobrou e o que falta pedir ao Financeiro' },
            { id: 'ordens', rotulo: 'Ordens de pintura', contagem: ordens.lido ? ordensAndando : null, titulo: 'Ordens de serviço em lote da pintura eletrostática: montar, enviar as peças e registrar o retorno' },
            { id: 'prestadores', rotulo: 'Prestadores', contagem: prestadores.lido ? prestadores.lista.filter((p: any) => p.ativo).length : null },
            { id: 'tipos', rotulo: 'Tipos de serviço', contagem: tipos.lido ? tipos.lista.filter((t: any) => t.ativo).length : null },
            { id: 'modelo', rotulo: 'Modelo do contrato', titulo: 'O texto e os dados das empresas que saem no contrato e na ordem de serviço impressos' },
          ]} />
        )}
      />

      {servicos.erro && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={reler}>Tentar de novo</Botao>}>
          Não foi possível ler os serviços ({servicos.erro}). {servicos.lista.length > 0 ? 'A lista abaixo é a da última leitura que deu certo.' : 'Nada foi carregado ainda.'}
        </Faixa>
      )}
      {(tipos.erro || prestadores.erro) && mostraServicos && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={carregarCadastros}>Tentar de novo</Botao>}>
          Não foi possível ler {tipos.erro ? 'os tipos de serviço' : 'os prestadores'} ({tipos.erro || prestadores.erro}). Os nomes podem aparecer incompletos até a próxima leitura.
        </Faixa>
      )}
      {erroDaLeituraAuxiliar && mostraServicos && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={reler}>Tentar de novo</Botao>}>
          Não foi possível conferir {erroDaLeituraAuxiliar}. Os serviços ligados a elas mostram "situação não lida" até a próxima leitura que der certo.
        </Faixa>
      )}
      {semTipos && mostraServicos && !tipos.erro && (
        <Faixa tom="atencao">Ainda não há tipos de serviço cadastrados, e sem eles ninguém consegue pedir. Quem cadastra os tipos é o Admin, na aba "Tipos de serviço".</Faixa>
      )}

      {!lido && !servicos.erro && !tipos.erro && !prestadores.erro && <div className="acn-ajuda">Carregando…</div>}

      {lido && mostraServicos && (
        <>
          <BarraDeFiltros filtros={filtros} mudar={mudarFiltros} contagens={contagens} tipos={tipos.lista} prestadores={prestadores.lista} servicos={servicos.lista} verValor={verValor} />
          {!todos && servicos.desde && (servicos.escondidos > 0 || servicos.escondidos === null) && (
            <p className="acn-terc-janela acn-ajuda">
              Mostrando o que está em aberto e o que terminou nos últimos {DIAS_DA_JANELA_DE_LEITURA} dias.{' '}
              {servicos.escondidos > 0
                ? (servicos.escondidos === 1 ? '1 serviço mais antigo fica de fora.' : `${servicos.escondidos} serviços mais antigos ficam de fora.`)
                : 'Não deu para contar os mais antigos.'}{' '}
              <Botao pequeno variante="discreto" className="acn-cmp-link" onClick={() => verTodos(true)}>Mostrar todos</Botao>
            </p>
          )}
          {todos && (
            <p className="acn-terc-janela acn-ajuda">
              Mostrando todos os serviços, de qualquer data.{' '}
              <Botao pequeno variante="discreto" className="acn-cmp-link" onClick={() => verTodos(false)}>Voltar aos últimos {DIAS_DA_JANELA_DE_LEITURA} dias</Botao>
            </p>
          )}
          {lista.length === 0 && !servicos.erro && (
            <Faixa tom="info">Ainda não há serviços de terceiros pedidos. Use "Solicitar serviço" aqui no alto ou o botão da própria OP, da OS, da Engenharia, da Serralheria e do Almoxarifado.</Faixa>
          )}
          {aba === 'quadro' && (
            <QuadroDeTerceiros servicos={visiveis} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} choques={choques} hoje={hoje} currentUser={currentUser}
              verValor={verValor} ver={filtros.ver} aoAbrir={abrirServico} aoAbrirGrupo={abrirGrupo} aoAbrirOrdem={abrirOrdem} aoImprimir={imprimirContrato} aoMover={mover} />
          )}
          {aba === 'agenda' && (
            <AgendaDeTerceiros servicos={visiveis} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} choques={choques} hoje={hoje}
              verValor={verValor} ver={filtros.ver} aoAbrir={abrirServico} aoAbrirGrupo={abrirGrupo} />
          )}
          {aba === 'lista' && (
            <ListaDeTerceiros servicos={visiveis} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} choques={choques} hoje={hoje} currentUser={currentUser}
              verValor={verValor} aoAbrir={abrirServico} aoAbrirOrdem={abrirOrdem} aoImprimir={imprimirContrato} aoMover={mover} />
          )}
        </>
      )}

      {/* T6 (23/11/2026): o relatório lê sozinho o mês escolhido (não depende da janela de 120 dias da lista); o "Abrir" de um serviço usa o mesmo caminho do aviso do Calendário, que lê todos os dias se preciso */}
      {lido && aba === 'relatorio' && (
        <RelatorioDeTerceiros mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} verValor={verValor} currentUser={currentUser} hoje={hoje}
          aoAbrirServico={(id: string) => setPendente({ id: String(id), tentouTodos: false })} />
      )}
      {lido && aba === 'ordens' && (
        <OrdensDeTerceiros ordens={ordens.lista} erro={ordens.erro} servicos={lista} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} hoje={hoje} currentUser={currentUser}
          aoAbrirOrdem={abrirOrdem} aoAbrirServico={abrirServico} aoMontar={comecarOrdem} aoRecarregar={reler} />
      )}
      {aba === 'modelo' && (
        <ModeloDoContrato config={config} podeEditar={podeEditarModeloDoContrato(currentUser)} currentUser={currentUser}
          aoSalvar={(dados: any) => setConfig({ config: dados, erro: null, lido: true })} aoRecarregar={carregarConfig} />
      )}
      {lido && aba === 'tipos' && (
        <TiposDeTerceiros tipos={tipos.lista} prestadores={prestadores.lista} erro={tipos.erro} onMudou={carregarCadastros} podeEditar={podeEditarTiposDeTerceiros(currentUser)} currentUser={currentUser} />
      )}
      {lido && aba === 'prestadores' && (
        <PrestadoresDeTerceiros prestadores={prestadores.lista} tipos={tipos.lista} erro={prestadores.erro || tipos.erro} onMudou={carregarCadastros}
          podeCadastrar={podeGerirPrestadoresDeTerceiros(currentUser)} currentUser={currentUser} />
      )}

      {/* as janelas: as de ação vêm depois (ficam por cima da janela do serviço e da do grupo, que ficam abertas por baixo) */}
      {solicitando && (
        <ModalSolicitar tipos={tipos.lista} prestadores={prestadores.lista} currentUser={currentUser} onClose={() => setSolicitando(false)}
          aoPedido={() => { setSolicitando(false); reler(); }} aoCadastrarPrestador={carregarCadastros} />
      )}
      {ordemAbertaId && (
        <ModalDaOrdem ordemId={ordemAbertaId} ordens={ordens.lista} servicos={lista} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} prestadores={prestadores.lista} hoje={hoje}
          currentUser={currentUser} verValor={verValor} onClose={() => setOrdemAbertaId(null)} aoAbrirServico={abrirServico} aoImprimir={imprimirDaOrdem} aoRecarregar={reler}
          aoMudou={(r: any, ordemAntes: any, antes: any[], frase: string) => gravouOrdem(r, ordemAntes, antes, frase)} {...aoPagamentoESaida} />
      )}
      {grupo && (
        <ModalDoGrupo ids={grupo.ids} statusInicial={grupo.status} servicos={lista} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} prestadores={prestadores.lista}
          choques={choques} hoje={hoje} currentUser={currentUser} verValor={verValor} onClose={() => setGrupo(null)} aoAbrir={abrirServico} aoMover={mover} aoMudou={gravou} aoRecarregar={reler}
          aoAbrirOrdem={abrirOrdem} aoImprimir={imprimirContrato} aoMontarOrdem={comecarOrdem} {...aoPagamentoESaida} />
      )}
      {detalhe && (
        <ModalDoServico servico={detalhe} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} prestadores={prestadores.lista} choques={choques} hoje={hoje} currentUser={currentUser}
          verValor={verValor} onClose={() => setDetalheId(null)} aoMover={mover} aoMudou={gravou} aoRecarregar={reler} aoIrParaRegistro={() => { setDetalheId(null); setGrupo(null); }}
          aoAbrirOrdem={abrirOrdem} aoImprimir={imprimirContrato} aoMontarOrdem={comecarOrdem} {...aoPagamentoESaida} />
      )}
      {agendar && (
        <ModalAgendar servicos={agendar.servicos} statusAtual={agendar.statusAtual} todos={lista} tipos={tipos.lista} prestadores={prestadores.lista} onClose={() => setAgendar(null)} aoRecarregar={reler}
          aoGravar={(linhas: any[], antes: any[]) => { setAgendar(null); gravou(linhas, antes, fraseDoAgendamento(linhas, agendar.statusAtual)); }} />
      )}
      {realizar && (
        <ModalRealizar servicos={realizar.servicos} statusAtual={realizar.statusAtual} tipos={tipos.lista} prestadores={prestadores.lista} currentUser={currentUser} onClose={() => setRealizar(null)} aoRecarregar={reler}
          aoGravar={(linhas: any[], antes: any[]) => { setRealizar(null); gravou(linhas, antes, fraseDaConclusao(linhas)); }} />
      )}
      {pagando && (
        <ModalPedirPagamento servicos={pagando.servicos} prestador={mapaPrestadores.get(pagando.servicos[0].prestador_id) || null} tipos={tipos.lista} currentUser={currentUser}
          onClose={() => setPagando(null)} aoRecarregar={reler} aoGravar={aoPediuPagamento} />
      )}
      {ligandoSaida && (
        <ModalLigarSaida servicos={ligandoSaida.servicos} tipos={tipos.lista} onClose={() => setLigandoSaida(null)} aoRecarregar={reler} aoGravar={aoLigouSaida} />
      )}
      {montando && (
        <ModalMontarOrdem servicos={montando} tipos={tipos.lista} prestadores={prestadores.lista} onClose={() => setMontando(null)} aoRecarregar={reler}
          aoGravar={(r: any, antes: any[]) => {
            setMontando(null); setDetalheId(null); setGrupo(null);
            gravouOrdem(r, null, antes, `Ordem ${r.ordem.numero} montada com ${r.servicos.length} serviço${r.servicos.length === 1 ? '' : 's'}. Imprima a ordem, leve ao prestador para assinar e anexe a cópia para enviar as peças.`);
            setOrdemAbertaId(r.ordem.id);
          }} />
      )}
      {imprimindo && (
        <ModalImprimir tipo={imprimindo.tipo} servicos={imprimindo.servicos} ordem={imprimindo.ordem} config={config} tipos={tipos.lista} prestadores={prestadores.lista}
          currentUser={currentUser} onClose={() => setImprimindo(null)} />
      )}
    </div>
  );
}
