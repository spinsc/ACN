// @ts-nocheck
// Serviços de terceiros: película, plotagem, pintura, lavagem, funilaria, corte e dobra e os outros serviços feitos por quem é de fora (pedido do usuário em 22/11/2026;
// PLANO_SERVICOS_TERCEIROS.md). Fatia T2: o pedido de serviço, o Quadro (A definir, Agendado, Realizado), a Lista e os filtros de pendência, junto dos dois cadastros da T1 (prestadores e tipos).
// A agenda e o Calendário chegam na T3. Todo usuário entra aqui (todos pedem e todos veem todos os serviços); quem pode mexer em cada um é regra de TerceirosFluxo.ts, conferida de novo pelo banco.
// Esta tela só orquestra: lê, filtra, abre as janelas e junta à lista o que o banco confirmou. As regras estão em TerceirosFluxo.ts e a leitura e a gravação em TerceirosServicos.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mdiPlus, mdiRefresh } from '@mdi/js';
import { CabecalhoTela, Abas, Botao, Faixa, hojeISO } from './Interface';
import { mostrarAviso } from './Feedback';
import { intervaloVisivel } from './IntervaloVisivel';
import { lerTipos, lerPrestadores } from './TerceirosModelo';
import { podeGerirPrestadoresDeTerceiros, podeEditarTiposDeTerceiros } from './utils/permissoes';
import { PrestadoresDeTerceiros } from './TerceirosPrestadores';
import { TiposDeTerceiros } from './TerceirosTipos';
import { FILTROS_VAZIOS, choquesDeData, contarPendencias, passaNosFiltros, veValores, rotuloDoPeriodo } from './TerceirosFluxo';
import { lerServicos, auditarServicos, cancelarServicos, voltarServicos, descreverNumeros, DIAS_DA_JANELA_DE_LEITURA } from './TerceirosServicos';
import { BarraDeFiltros } from './TerceirosFiltros';
import { QuadroDeTerceiros } from './TerceirosQuadro';
import { ListaDeTerceiros } from './TerceirosLista';
import { ModalAgendar, ModalRealizar, pedirMotivoValido } from './TerceirosAcoes';
import { ModalSolicitar } from './TerceirosSolicitar';
import { ModalDoServico, ModalDoGrupo } from './TerceirosServicoModal';
import { diaCompleto } from './TerceirosPecas';
import './terceiros.css';

const VAZIO = { lista: [], erro: null, lido: false };
const SERVICOS_VAZIOS = { lista: [], erro: null, lido: false, escondidos: 0, desde: null };
const CHAVE_DA_VISAO = 'acn_terceiros_visao';
const UM_MINUTO = 60000;   // a regra do custo do banco: uma consulta por minuto por tela, no máximo (CLAUDE.md, "Custo do banco")

/** A última visão que a pessoa usou (Quadro ou Lista); o módulo abre sempre no Quadro quando não há nada guardado. O armazenamento pode falhar: aí vale o Quadro. */
function visaoGuardada(): string {
  try { return localStorage.getItem(CHAVE_DA_VISAO) === 'lista' ? 'lista' : 'quadro'; } catch { return 'quadro'; }
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
  const [todos, setTodos] = useState(false);
  const [filtros, setFiltros] = useState<any>({ ...FILTROS_VAZIOS });
  const [solicitando, setSolicitando] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<any>(null);
  const [agendar, setAgendar] = useState<any>(null);
  const [realizar, setRealizar] = useState<any>(null);
  const todosRef = useRef(false);
  const versaoLocal = useRef(0);   // sobe a cada gravação nossa: a leitura que começou antes dela não pode desfazê-la
  const montada = useRef(true);
  todosRef.current = todos;

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
      if (tentativas > 0) carregarServicos(todosOsDias, contar, tentativas - 1);
      return;
    }
    setServicos((antes: any) => (r.erro
      ? { ...antes, erro: r.erro, lido: true }
      : { lista: r.lista, erro: null, lido: true, escondidos: r.escondidos === undefined ? antes.escondidos : r.escondidos, desde: r.desde }));
  }, []);

  useEffect(() => {
    montada.current = true;
    carregarCadastros();
    carregarServicos(false);
    // atualização de minuto em minuto, só com a aba à vista, e sem a contagem dos antigos (seria uma segunda consulta por minuto)
    const id = intervaloVisivel(() => { carregarServicos(todosRef.current, false); }, UM_MINUTO);
    return () => { montada.current = false; clearInterval(id); };
  }, [carregarCadastros, carregarServicos]);

  const mapaTipos = useMemo(() => new Map(tipos.lista.map((t: any) => [t.id, t])), [tipos.lista]);
  const mapaPrestadores = useMemo(() => new Map(prestadores.lista.map((p: any) => [p.id, p])), [prestadores.lista]);
  const nomesDosPrestadores = useMemo(() => Object.fromEntries(prestadores.lista.map((p: any) => [p.id, p.nome])), [prestadores.lista]);
  const choques = useMemo(() => choquesDeData(servicos.lista), [servicos.lista]);
  const hoje = hojeISO();
  const verValor = veValores(currentUser);

  const visiveis = useMemo(
    () => servicos.lista.filter((s: any) => passaNosFiltros(s, filtros, { u: currentUser, hoje, tipos: mapaTipos, prestadores: mapaPrestadores, choques })),
    [servicos.lista, filtros, mapaTipos, mapaPrestadores, choques, hoje, currentUser],
  );
  const contagens = useMemo(
    () => contarPendencias(servicos.lista, filtros, { u: currentUser, hoje, tipos: mapaTipos, prestadores: mapaPrestadores, choques }),
    [servicos.lista, filtros, mapaTipos, mapaPrestadores, choques, hoje, currentUser],
  );
  const abertos = useMemo(() => servicos.lista.filter((s: any) => s.status === 'solicitado' || s.status === 'agendado').length, [servicos.lista]);

  const mudarFiltros = useCallback((parte: any) => setFiltros((f: any) => ({ ...f, ...parte })), []);
  const mudarAba = (id: string) => { setAba(id); if (id === 'quadro' || id === 'lista') guardarVisao(id); };
  const verTodos = (valor: boolean) => { todosRef.current = valor; setTodos(valor); carregarServicos(valor, true); };
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

  const abrirServico = useCallback((s: any) => setDetalheId(s.id), []);
  const abrirGrupo = useCallback((cartao: any) => setGrupo({ ids: cartao.servicos.map((s: any) => s.id), status: cartao.base.status }), []);

  const detalhe = detalheId ? servicos.lista.find((s: any) => s.id === detalheId) : null;
  useEffect(() => { if (detalheId && servicos.lido && !detalhe) setDetalheId(null); }, [detalheId, detalhe, servicos.lido]);

  const lido = tipos.lido && prestadores.lido && servicos.lido;
  const semTipos = tipos.lido && tipos.lista.length === 0;
  const mostraServicos = aba === 'quadro' || aba === 'lista';

  return (
    <div className="acn-terc">
      <CabecalhoTela
        titulo="Serviços de terceiros"
        subtitulo="Película, plotagem, pintura, lavagem e os outros serviços feitos por quem é de fora: peça, agende e confira aqui. Todo mundo pede e todo mundo vê; cada um mexe no que é seu."
        acoes={(
          <>
            <Botao variante="secundario" icone={mdiRefresh} onClick={() => { carregarCadastros(); reler(); }}>Atualizar</Botao>
            <Botao variante="primario" icone={mdiPlus} disabled={!tipos.lido || semTipos} onClick={() => setSolicitando(true)}>Solicitar serviço</Botao>
          </>
        )}
        abas={(
          <Abas ativa={aba} onChange={mudarAba} itens={[
            { id: 'quadro', rotulo: 'Quadro', contagem: servicos.lido ? abertos : null, titulo: 'Serviços em aberto: A definir e Agendado' },
            { id: 'lista', rotulo: 'Lista' },
            { id: 'prestadores', rotulo: 'Prestadores', contagem: prestadores.lido ? prestadores.lista.filter((p: any) => p.ativo).length : null },
            { id: 'tipos', rotulo: 'Tipos de serviço', contagem: tipos.lido ? tipos.lista.filter((t: any) => t.ativo).length : null },
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
      {semTipos && mostraServicos && !tipos.erro && (
        <Faixa tom="atencao">Ainda não há tipos de serviço cadastrados, e sem eles ninguém consegue pedir. Quem cadastra os tipos é o Admin, na aba "Tipos de serviço".</Faixa>
      )}

      {!lido && !servicos.erro && !tipos.erro && !prestadores.erro && <div className="acn-ajuda">Carregando…</div>}

      {lido && mostraServicos && (
        <>
          <BarraDeFiltros filtros={filtros} mudar={mudarFiltros} contagens={contagens} tipos={tipos.lista} prestadores={prestadores.lista} servicos={servicos.lista} />
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
          {servicos.lista.length === 0 && !servicos.erro && (
            <Faixa tom="info">Ainda não há serviços de terceiros pedidos. Use "Solicitar serviço" aqui no alto ou o botão da própria OP, da OS, da Engenharia, da Serralheria e do Almoxarifado.</Faixa>
          )}
          {aba === 'quadro'
            ? (
              <QuadroDeTerceiros servicos={visiveis} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} choques={choques} hoje={hoje} currentUser={currentUser}
                verValor={verValor} ver={filtros.ver} aoAbrir={abrirServico} aoAbrirGrupo={abrirGrupo} aoMover={mover} />
            )
            : (
              <ListaDeTerceiros servicos={visiveis} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} choques={choques} hoje={hoje} currentUser={currentUser}
                verValor={verValor} aoAbrir={abrirServico} aoMover={mover} />
            )}
        </>
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
      {grupo && (
        <ModalDoGrupo ids={grupo.ids} statusInicial={grupo.status} servicos={servicos.lista} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} prestadores={prestadores.lista}
          choques={choques} hoje={hoje} currentUser={currentUser} verValor={verValor} onClose={() => setGrupo(null)} aoAbrir={abrirServico} aoMover={mover} aoMudou={gravou} aoRecarregar={reler} />
      )}
      {detalhe && (
        <ModalDoServico servico={detalhe} mapaTipos={mapaTipos} mapaPrestadores={mapaPrestadores} prestadores={prestadores.lista} choques={choques} hoje={hoje} currentUser={currentUser}
          verValor={verValor} onClose={() => setDetalheId(null)} aoMover={mover} aoMudou={gravou} aoRecarregar={reler} aoIrParaRegistro={() => { setDetalheId(null); setGrupo(null); }} />
      )}
      {agendar && (
        <ModalAgendar servicos={agendar.servicos} statusAtual={agendar.statusAtual} todos={servicos.lista} tipos={tipos.lista} prestadores={prestadores.lista} onClose={() => setAgendar(null)} aoRecarregar={reler}
          aoGravar={(linhas: any[], antes: any[]) => { setAgendar(null); gravou(linhas, antes, fraseDoAgendamento(linhas, agendar.statusAtual)); }} />
      )}
      {realizar && (
        <ModalRealizar servicos={realizar.servicos} statusAtual={realizar.statusAtual} tipos={tipos.lista} prestadores={prestadores.lista} currentUser={currentUser} onClose={() => setRealizar(null)} aoRecarregar={reler}
          aoGravar={(linhas: any[], antes: any[]) => { setRealizar(null); gravou(linhas, antes, fraseDaConclusao(linhas)); }} />
      )}
    </div>
  );
}
