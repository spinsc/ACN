// Serviços de terceiros, fatia T6 (23/11/2026): a aba "Relatório do mês": por prestador (quantos serviços fez, quanto estava combinado, quanto cobrou, o que falta pedir ao Financeiro) e por tipo,
// com a lista dos serviços de cada prestador, a planilha do Excel e a folha para imprimir. As contas e a leitura estão em TerceirosRelatorio.ts; a folha, em TerceirosRelatorioImpressao.ts.
// O relatório lê por demanda (abrir a aba, trocar de mês, "Atualizar"); não há consulta de minuto em minuto. O serviço conta no mês em que foi REALIZADO (decidido com o usuário em 23/11/2026).
// Valor (combinado, cobrado, diferença, pedido, pago, a pedir) só aparece para quem já vê valores no sistema; quem não vê tem as quantidades.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mdiChevronDown, mdiChevronLeft, mdiChevronRight, mdiChevronUp, mdiFileExcelOutline, mdiPrinterOutline, mdiRefresh } from '@mdi/js';
import { Botao, Faixa, Selo, type Familia } from './Interface';
import { mostrarAviso } from './Feedback';
import { MENSAGEM_JANELA_BLOQUEADA, dataBR } from './TerceirosImpressao';
import {
  lerServicosDoMes, resumoDoMes, mesDaData, rotuloDoMes, somarMeses, folhasDaPlanilha, nomeDaPlanilha, rotuloDoPagamentoNoRelatorio, diferencaDoServico, ligacaoDoServico, reais,
} from './TerceirosRelatorio';
import { imprimirRelatorio } from './TerceirosRelatorioImpressao';

const LEITURA_VAZIA = { lista: [], erro: null, erroDosPagamentos: null, lido: false, mes: '' };
const FAMILIA_DO_PAGAMENTO: Record<string, Familia> = { 'Pago': 'ok', 'Pedido ao Financeiro': 'info', 'A pedir': 'atencao', 'Não conferido': 'neutro', 'Sem valor a pagar': 'neutro' };

const Diferenca = ({ valor }: { valor: number | null }) => {
  if (valor === null) return <>—</>;
  if (valor === 0) return <>{reais(0)}</>;
  return <span className={valor > 0 ? 'acn-txt-erro' : undefined} title={valor > 0 ? 'O prestador cobrou mais do que o combinado' : 'O prestador cobrou menos do que o combinado'}>{valor > 0 ? '+' : '−'}{reais(Math.abs(valor))}</span>;
};
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export function RelatorioDeTerceiros({ mapaTipos, mapaPrestadores, verValor, currentUser, hoje, aoAbrirServico }) {
  const mesDeHoje = mesDaData(hoje);
  const [mes, setMes] = useState<string>(mesDeHoje);
  const [leitura, setLeitura] = useState<any>(LEITURA_VAZIA);
  const [carregando, setCarregando] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const sequencia = useRef(0);   // a leitura que chega depois de outra mais nova não vale (a pessoa trocou de mês no meio)
  const montada = useRef(true);

  const carregar = useCallback(async (m: string) => {
    const v = ++sequencia.current;
    setCarregando(true);
    const r = await lerServicosDoMes(m);
    if (!montada.current || v !== sequencia.current) return;
    // leitura que falha NÃO põe a lista de outro mês no lugar da deste: só o erro (nunca "nenhum serviço")
    setLeitura((antes: any) => (r.erro ? { ...antes, erro: r.erro, lido: true } : { lista: r.lista, erro: null, erroDosPagamentos: r.erroDosPagamentos, lido: true, mes: m }));
    setCarregando(false);
  }, []);
  useEffect(() => { montada.current = true; return () => { montada.current = false; }; }, []);
  useEffect(() => { setAbertos(new Set()); carregar(mes); }, [mes, carregar]);

  const temDados = leitura.lido && !leitura.erro && leitura.mes === mes;
  const resumo = useMemo(
    () => (temDados ? resumoDoMes(leitura.lista, mes, (id: string) => mapaPrestadores.get(id)?.nome, (id: string) => mapaTipos.get(id)?.nome, verValor) : null),
    [temDados, leitura.lista, mes, mapaPrestadores, mapaTipos, verValor],
  );
  const tipoDe = (id: string) => mapaTipos.get(id)?.nome || 'Tipo não encontrado';
  const t = resumo?.total;
  const nadaNoMes = !!resumo && t.realizados === 0 && t.aFazer === 0 && t.anteriores === 0;

  const alternar = (chave: string) => setAbertos((a: Set<string>) => { const n = new Set(a); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  const baixar = async () => {
    if (!resumo) return;
    try {
      const { baixarPlanilha } = await import('./ExportarPlanilha');
      const nome = await baixarPlanilha(nomeDaPlanilha(mes), folhasDaPlanilha(resumo, verValor));
      mostrarAviso(`Planilha ${nome} gerada.`, 'ok');
    } catch (e: any) {
      mostrarAviso(`Não foi possível gerar a planilha: ${e?.message || e}`, 'erro');
    }
  };
  const imprimir = () => {
    if (!resumo) return;
    if (!imprimirRelatorio(resumo, verValor, currentUser?.nome || '')) mostrarAviso(MENSAGEM_JANELA_BLOQUEADA, 'erro');
  };

  const colunasDoPrestador = verValor ? 9 : 3;

  return (
    <div className="acn-terc-rel">
      <div className="acn-terc-rel-barra">
        <div className="acn-terc-rel-mes">
          <Botao pequeno icone={mdiChevronLeft} aria-label="Mês anterior" title="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))} />
          <strong className="acn-terc-rel-mes-nome" aria-live="polite">{rotuloDoMes(mes)}</strong>
          <Botao pequeno icone={mdiChevronRight} aria-label="Mês seguinte" title="Mês seguinte" disabled={mes >= mesDeHoje} onClick={() => setMes(somarMeses(mes, 1))} />
          <Botao pequeno variante="discreto" disabled={mes === mesDeHoje} onClick={() => setMes(mesDeHoje)}>Este mês</Botao>
        </div>
        <div className="acn-terc-rel-acoes">
          <Botao pequeno icone={mdiRefresh} disabled={carregando} onClick={() => carregar(mes)}>Atualizar</Botao>
          <Botao pequeno icone={mdiFileExcelOutline} disabled={!resumo || nadaNoMes} onClick={baixar} title="Baixa uma planilha do Excel com o que o relatório mostra">Baixar planilha</Botao>
          <Botao pequeno icone={mdiPrinterOutline} disabled={!resumo} onClick={imprimir} title="Abre a folha A4 do mês para imprimir ou salvar em PDF">Imprimir</Botao>
        </div>
      </div>
      <p className="acn-ajuda acn-terc-rel-regra">
        Cada serviço conta no mês em que foi dado como realizado. "Ainda a fazer" são os agendados para o mês que ainda não foram dados como realizados. Cancelados e pedidos sem dia marcado não entram.
        {!verValor && ' Você vê as quantidades; os valores aparecem só para quem vê valores no sistema.'}
      </p>

      {leitura.erro && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={() => carregar(mes)}>Tentar de novo</Botao>}>
          Não foi possível ler os serviços de {rotuloDoMes(mes)} ({leitura.erro}). {temDados ? 'Os números abaixo são os da última leitura que deu certo.' : 'Nada foi carregado ainda.'}
        </Faixa>
      )}
      {!leitura.lido && !leitura.erro && <div className="acn-ajuda">Carregando…</div>}
      {leitura.lido && !leitura.erro && leitura.mes !== mes && carregando && <div className="acn-ajuda">Carregando {rotuloDoMes(mes)}…</div>}

      {resumo && (
        <>
          {leitura.erroDosPagamentos && (
            <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={() => carregar(mes)}>Tentar de novo</Botao>}>
              Não foi possível conferir a situação dos pagamentos pedidos ao Financeiro ({leitura.erroDosPagamentos}). {t.naoConferidos > 0 ? `${plural(t.naoConferidos, 'serviço aparece', 'serviços aparecem')} como "não conferido" e não ${t.naoConferidos === 1 ? 'entra' : 'entram'} em "pedido", "pago" nem "a pedir".` : ''}
            </Faixa>
          )}
          {t.anteriores > 0 && (
            <Faixa tom="atencao">
              {plural(t.anteriores, 'serviço agendado em mês anterior segue', 'serviços agendados em meses anteriores seguem')} sem baixa e não {t.anteriores === 1 ? 'entra' : 'entram'} nas contas de {rotuloDoMes(mes)}.
              Confira na Lista, no filtro "Atrasados".
            </Faixa>
          )}

          {nadaNoMes ? (
            <Faixa tom="info">Nenhum serviço foi dado como realizado nem está agendado em {rotuloDoMes(mes)}.</Faixa>
          ) : (
            <>
              <div className="acn-kpis">
                <div className="acn-kpi"><div className="rot">Serviços realizados</div><div className="val acn-num">{t.realizados}</div><div className="sub">{plural(resumo.porPrestador.filter((l: any) => l.realizados > 0).length, 'prestador', 'prestadores')}</div></div>
                {verValor && <div className="acn-kpi"><div className="rot">Combinado</div><div className="val acn-num">{reais(t.combinado)}</div><div className="sub">{t.semCombinado > 0 ? `${plural(t.semCombinado, 'serviço', 'serviços')} sem valor combinado` : 'dos realizados'}</div></div>}
                {verValor && <div className="acn-kpi"><div className="rot">Cobrado</div><div className="val acn-num">{reais(t.cobrado)}</div><div className="sub">{t.semFinal > 0 ? `${plural(t.semFinal, 'serviço', 'serviços')} sem valor final` : 'valor final dos realizados'}</div></div>}
                {verValor && <div className="acn-kpi"><div className="rot">Diferença</div><div className="val acn-num"><Diferenca valor={t.diferenca} /></div><div className="sub">cobrado menos combinado</div></div>}
                {verValor && <div className="acn-kpi"><div className="rot">A pedir ao Financeiro</div><div className="val acn-num">{reais(t.valorAPedir)}</div><div className="sub">{plural(t.aPedir, 'serviço', 'serviços')} sem pedido de pagamento</div></div>}
                <div className="acn-kpi"><div className="rot">Ainda a fazer</div><div className="val acn-num">{t.aFazer}</div><div className="sub">{verValor && t.aFazerCombinado > 0 ? `combinado ${reais(t.aFazerCombinado)}` : 'agendados no mês'}</div></div>
              </div>

              <div className="acn-quadro">
                <div className="acn-quadro-titulo">POR PRESTADOR ({resumo.porPrestador.length})</div>
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-densa">
                    <thead>
                      <tr>
                        <th>Prestador</th><th className="dir">Realizados</th>
                        {verValor && <><th className="dir">Combinado</th><th className="dir">Cobrado</th><th className="dir">Diferença</th><th className="dir">Pedido (aberto)</th><th className="dir">Pago</th><th className="dir">A pedir</th></>}
                        <th className="dir">Ainda a fazer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.porPrestador.map((l: any) => {
                        const aberto = abertos.has(l.chave);
                        const dele = resumo.servicosDoPrestador.get(l.chave) || { realizados: [], aFazer: [], anteriores: [] };
                        return (
                          <React.Fragment key={l.chave}>
                            <tr>
                              <td>
                                <Botao pequeno variante="discreto" className="acn-terc-rel-nome" icone={aberto ? mdiChevronUp : mdiChevronDown} aria-expanded={aberto} onClick={() => alternar(l.chave)}
                                  title={aberto ? 'Esconder os serviços' : 'Ver os serviços deste prestador'}>{l.nome}</Botao>
                              </td>
                              <td className="dir acn-num">{l.realizados}</td>
                              {verValor && (
                                <>
                                  <td className="dir acn-num">{reais(l.combinado)}</td>
                                  <td className="dir acn-num">{reais(l.cobrado)}</td>
                                  <td className="dir acn-num"><Diferenca valor={l.diferenca} /></td>
                                  <td className="dir acn-num">{reais(l.valorPedido)}</td>
                                  <td className="dir acn-num">{reais(l.valorPago)}</td>
                                  <td className="dir acn-num">{l.aPedir > 0 ? <Selo familia="atencao" ponto={false}>{reais(l.valorAPedir)}</Selo> : reais(0)}</td>
                                </>
                              )}
                              <td className="dir acn-num">{l.aFazer}</td>
                            </tr>
                            {aberto && (
                              <tr className="acn-terc-rel-detalhe">
                                <td colSpan={colunasDoPrestador}>
                                  <DetalheDoPrestador dele={dele} tipoDe={tipoDe} verValor={verValor} aoAbrirServico={aoAbrirServico} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <tr className="acn-terc-rel-total">
                        <td><strong>Total</strong></td><td className="dir acn-num"><strong>{t.realizados}</strong></td>
                        {verValor && (
                          <>
                            <td className="dir acn-num"><strong>{reais(t.combinado)}</strong></td><td className="dir acn-num"><strong>{reais(t.cobrado)}</strong></td>
                            <td className="dir acn-num"><strong><Diferenca valor={t.diferenca} /></strong></td><td className="dir acn-num"><strong>{reais(t.valorPedido)}</strong></td>
                            <td className="dir acn-num"><strong>{reais(t.valorPago)}</strong></td><td className="dir acn-num"><strong>{reais(t.valorAPedir)}</strong></td>
                          </>
                        )}
                        <td className="dir acn-num"><strong>{t.aFazer}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="acn-quadro">
                <div className="acn-quadro-titulo">POR TIPO DE SERVIÇO ({resumo.porTipo.length})</div>
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-densa">
                    <thead>
                      <tr>
                        <th>Tipo de serviço</th><th className="dir">Realizados</th>
                        {verValor && <><th className="dir">Combinado</th><th className="dir">Cobrado</th><th className="dir">Diferença</th></>}
                        <th className="dir">Ainda a fazer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.porTipo.map((l: any) => (
                        <tr key={l.chave}>
                          <td>{l.nome}</td><td className="dir acn-num">{l.realizados}</td>
                          {verValor && <><td className="dir acn-num">{reais(l.combinado)}</td><td className="dir acn-num">{reais(l.cobrado)}</td><td className="dir acn-num"><Diferenca valor={l.diferenca} /></td></>}
                          <td className="dir acn-num">{l.aFazer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** A lista de um prestador: o que ele fez no mês e, abaixo, o que ainda está agendado (e o que ficou sem baixa de meses anteriores). */
function DetalheDoPrestador({ dele, tipoDe, verValor, aoAbrirServico }) {
  const linhaDoRealizado = (s: any) => {
    const pag = rotuloDoPagamentoNoRelatorio(s);
    return (
      <tr key={s.id}>
        <td><Botao pequeno variante="discreto" onClick={() => aoAbrirServico(s.id)} title="Abrir o serviço">{s.numero}</Botao></td>
        <td>{tipoDe(s.tipo_id)}</td>
        <td className="acn-terc-rel-desc">{s.descricao}<div className="acn-ajuda">{ligacaoDoServico(s)}</div></td>
        <td>{dataBR(s.data_realizada)}</td>
        {verValor && (
          <>
            <td className="dir acn-num">{reais(s.valor_combinado)}</td><td className="dir acn-num">{reais(s.valor_final)}</td>
            <td className="dir acn-num"><Diferenca valor={diferencaDoServico(s)} /></td>
            <td><Selo familia={FAMILIA_DO_PAGAMENTO[pag] || 'neutro'} ponto={false}>{pag}</Selo></td>
          </>
        )}
      </tr>
    );
  };
  const linhaDoAgendado = (s: any) => (
    <tr key={s.id}>
      <td><Botao pequeno variante="discreto" onClick={() => aoAbrirServico(s.id)} title="Abrir o serviço">{s.numero}</Botao></td>
      <td>{tipoDe(s.tipo_id)}</td>
      <td className="acn-terc-rel-desc">{s.descricao}<div className="acn-ajuda">{ligacaoDoServico(s)}</div></td>
      <td>{dataBR(s.data_agendada)}</td>
      {verValor && <td className="dir acn-num">{reais(s.valor_combinado)}</td>}
    </tr>
  );
  return (
    <div className="acn-terc-rel-lista">
      {dele.realizados.length > 0 && (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-densa">
            <thead><tr><th>Nº</th><th>Tipo</th><th>Descrição</th><th>Realizado em</th>{verValor && <><th className="dir">Combinado</th><th className="dir">Cobrado</th><th className="dir">Diferença</th><th>Pagamento</th></>}</tr></thead>
            <tbody>{dele.realizados.map(linhaDoRealizado)}</tbody>
          </table>
        </div>
      )}
      {dele.aFazer.length > 0 && (
        <div className="acn-rolagem">
          <div className="acn-terc-rel-sub">Ainda a fazer neste mês ({dele.aFazer.length})</div>
          <table className="acn-tabela acn-densa">
            <thead><tr><th>Nº</th><th>Tipo</th><th>Descrição</th><th>Agendado para</th>{verValor && <th className="dir">Combinado</th>}</tr></thead>
            <tbody>{dele.aFazer.map(linhaDoAgendado)}</tbody>
          </table>
        </div>
      )}
      {dele.anteriores.length > 0 && (
        <div className="acn-rolagem">
          <div className="acn-terc-rel-sub">Agendados em meses anteriores, ainda sem baixa ({dele.anteriores.length})</div>
          <table className="acn-tabela acn-densa">
            <thead><tr><th>Nº</th><th>Tipo</th><th>Descrição</th><th>Agendado para</th>{verValor && <th className="dir">Combinado</th>}</tr></thead>
            <tbody>{dele.anteriores.map(linhaDoAgendado)}</tbody>
          </table>
        </div>
      )}
      {dele.realizados.length === 0 && dele.aFazer.length === 0 && dele.anteriores.length === 0 && <div className="acn-ajuda">Nenhum serviço deste prestador neste mês.</div>}
    </div>
  );
}
