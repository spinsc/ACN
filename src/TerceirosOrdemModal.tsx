// @ts-nocheck
// Serviços de terceiros: a janela da ORDEM DE SERVIÇO em lote da pintura eletrostática (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026).
// Mostra a ordem por inteiro (situação, prestador, datas, cópia assinada, os serviços e o histórico) e dá os passos de cada situação para quem pode mexer nela (Admin, gerentes e Adaptação):
//   Aguardando assinatura → enviar as peças (com a cópia assinada), alterar, incluir ou tirar serviços, cancelar;  Peças no prestador → registrar o retorno, ajustar previsão e cópia.
// Quem só pediu um serviço da ordem vê tudo e imprime, mas não mexe. Quem grava é o banco (TerceirosOrdens.ts); esta janela só deixa de oferecer o que ele recusaria.
// Cada passo que pede dados abre a janela dele (TerceirosOrdemPassos.tsx) POR CIMA desta; o que o banco confirma sobe para a tela (`aoMudou`) e a lista se atualiza sem esperar a próxima leitura.
import React, { useEffect, useMemo, useState } from 'react';
import { mdiClose, mdiOpenInNew, mdiPaperclip, mdiHistory, mdiPrinterOutline, mdiPencilOutline, mdiPlus, mdiSendOutline, mdiCheckBold, mdiCancel, mdiLinkVariantOff } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Tag, MenuAcoes } from './Interface';
import { confirmar } from './Feedback';
import { reaisDoServico, rotuloDaSituacao, rotuloDaLigacao, veValores } from './TerceirosFluxo';
import { pedirMotivoValido } from './TerceirosAcoes';
import { SelosDoServico, diaCompleto, momentoBR, textoDoDia } from './TerceirosPecas';
import { enderecoDoAnexo, tamanhoLegivel, descreverNumeros } from './TerceirosServicos';
import { juntarPecas, textoDasPecas } from './TerceirosContrato';
import { lerHistoricoDaOrdem, rotuloDaOrdem, familiaDaOrdem, ordemEstaAtiva, podeMexerNaOrdem, servicosDaOrdem, tirarDaOrdem, cancelarOrdem } from './TerceirosOrdens';
import { ModalEnviarOrdem, ModalRetornoDaOrdem, ModalEditarOrdem, ModalIncluirNaOrdem } from './TerceirosOrdemPassos';
import { CaixaDoPagamento } from './TerceirosPagamentoTela';
import { CaixaDaSaida } from './TerceirosVistoriaTela';

const ROTULO_NO_HISTORICO: Record<string, string> = {
  montada: 'Ordem montada', incluiu: 'Serviços incluídos', tirou: 'Serviços tirados', alterada: 'Ordem alterada', enviada: 'Peças enviadas', fechada: 'Ordem fechada', cancelada: 'Ordem cancelada',
};

function Item({ rotulo, children, largo = false }: { rotulo: string; children: any; largo?: boolean }) {
  return (
    <div className={'acn-terc-det-item' + (largo ? ' largo' : '')}>
      <span className="acn-terc-det-rot">{rotulo}</span>
      <div className="acn-terc-det-val">{children}</div>
    </div>
  );
}

/**
 * `ordens` e `servicos` são as listas da tela (os serviços já com a situação da ordem anexada). `aoMudou(resposta, ordemDeAntes, servicosDeAntes, frase)` junta o que o banco confirmou;
 * `aoImprimir({ tipo, servicos, ordem })` abre a janela de impressão; `aoAbrirServico(s)` abre a janela do serviço (esta fica por baixo); `aoRecarregar` lê tudo de novo.
 * T5 (23/11/2026): `aoPedirPagamento(servicos)` pede UM pagamento para a ordem (ao fechar, os serviços ficam realizados com o valor final de cada um); `aoRegistrarSaida`, `aoLigarSaida`
 * e `aoDesligarSaida` cuidam da saída da Vistoria de pátio das peças.
 */
export function ModalDaOrdem({ ordemId, ordens, servicos, mapaTipos, mapaPrestadores, prestadores, hoje, currentUser, verValor, onClose, aoAbrirServico, aoImprimir, aoMudou, aoRecarregar, aoPedirPagamento, aoRegistrarSaida, aoLigarSaida, aoDesligarSaida }) {
  const ordem = ordens.find((o: any) => o.id === ordemId) || null;
  const doBanco = useMemo(() => (ordem ? servicosDaOrdem(servicos, ordem.id) : []), [servicos, ordem?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const podeMexer = podeMexerNaOrdem(currentUser);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [passo, setPasso] = useState<string | null>(null);   // enviar | retorno | editar | incluir
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<any>({ aberto: false, lista: [], erro: null, lendo: false });

  // a ordem que sumiu da lista (relida sem ela) fecha a janela: nada mais a mostrar
  useEffect(() => { if (!ordem) onClose(); }, [ordem]);   // eslint-disable-line react-hooks/exhaustive-deps
  // quem saiu da ordem sai também dos marcados
  useEffect(() => {
    setMarcados(m => { const n = new Set([...m].filter(id => doBanco.some((s: any) => s.id === id))); return n.size === m.size ? m : n; });
  }, [doBanco]);
  // o histórico só é lido quando a pessoa o abre, e de novo a cada mudança da ordem com ele aberto
  useEffect(() => {
    if (!historico.aberto || !ordem) return;
    let vivo = true;
    setHistorico((h: any) => ({ ...h, lendo: true }));
    lerHistoricoDaOrdem(ordem.id).then(r => { if (vivo) setHistorico((h: any) => ({ ...h, lista: r.erro ? h.lista : r.historico, erro: r.erro, lendo: false })); });
    return () => { vivo = false; };
  }, [historico.aberto, ordem?.id, ordem?.atualizado_em]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!ordem) return null;
  const prestador = mapaPrestadores.get(ordem.prestador_id) || null;
  const ativa = ordemEstaAtiva(ordem);
  const montada = ordem.status === 'montada';
  const enviada = ordem.status === 'enviada';
  const atrasada = enviada && !!ordem.previsao_retorno && ordem.previsao_retorno < hoje;
  const veV = veValores(currentUser);
  const marcadas = doBanco.filter((s: any) => marcados.has(s.id));
  const todosMarcados = doBanco.length > 0 && marcadas.length === doBanco.length;
  const pecas = juntarPecas(doBanco);
  const tiposDaOrdem = [...new Set(doBanco.map((s: any) => mapaTipos.get(s.tipo_id)?.nome).filter(Boolean))];

  const alternar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const comErro = (r: any) => { setErro(r.erro); if (r.reler) aoRecarregar?.(); };
  /** Junta o que o banco confirmou (a ordem e os serviços tocados) e fecha a janela do passo. */
  const gravou = (r: any, antesServicos: any[], frase: string) => { setPasso(null); setErro(''); aoMudou(r, ordem, antesServicos, frase); };

  const tirarOsMarcados = async () => {
    if (ocupado || !marcadas.length) return;
    if (todosMarcados) { setErro('A ordem não pode ficar sem serviços. Para desfazer tudo, cancele a ordem.'); return; }
    const quem = descreverNumeros(marcadas);
    const motivo = await pedirMotivoValido(`Tirar ${quem} da ordem ${ordem.numero}?\n\nO serviço volta para "A definir" (o prestador fica; o dia marcado sai) e a ordem segue com os outros. Escreva o motivo (pelo menos 5 letras):`);
    if (motivo === null) return;
    setErro(''); setOcupado(true);
    const r = await tirarDaOrdem(ordem.id, marcadas.map((s: any) => s.id), motivo, ordem.status);
    setOcupado(false);
    if (!r.ok) { comErro(r); return; }
    gravou(r.dados, marcadas, `${quem} ${marcadas.length > 1 ? 'saíram' : 'saiu'} da ordem ${ordem.numero} e ${marcadas.length > 1 ? 'voltaram' : 'voltou'} para "A definir".`);
  };

  const cancelar = async () => {
    if (ocupado) return;
    const motivo = await pedirMotivoValido(`Cancelar a ordem ${ordem.numero}?\n\nOs ${doBanco.length} serviços voltam para "A definir" (o prestador fica; o dia marcado sai) e a ordem fica em "Canceladas", com o motivo no histórico. Escreva o motivo (pelo menos 5 letras):`);
    if (motivo === null) return;
    if (!(await confirmar(`Confirma o cancelamento da ordem ${ordem.numero}?`))) return;
    setErro(''); setOcupado(true);
    const r = await cancelarOrdem(ordem.id, motivo, doBanco.map((s: any) => s.id), ordem.status);
    setOcupado(false);
    if (!r.ok) { comErro(r); return; }
    gravou(r.dados, doBanco, `Ordem ${ordem.numero} cancelada: os ${doBanco.length} serviços voltaram para "A definir".`);
  };

  const imprimirOrdem = () => aoImprimir({ tipo: 'ordem', servicos: doBanco, ordem });
  const imprimirContrato = () => aoImprimir({ tipo: 'contrato', servicos: doBanco, ordem });

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-box acn-modal-cadastro acn-terc-box-g" role="dialog" aria-label={`Ordem de serviço ${ordem.numero}`}>
          <div className="acn-modal-cab">
            <span className="modal-title">Ordem {ordem.numero}{tiposDaOrdem.length ? ` · ${tiposDaOrdem.join(', ')}` : ''}</span>
            <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
          </div>
          <div className="acn-modal-corpo acn-form-cheio">
            <div className="acn-terc-det-topo">
              <Selo familia={familiaDaOrdem(ordem.status)}>{rotuloDaOrdem(ordem.status)}</Selo>
              {atrasada && <Selo familia="erro" title={`A previsão de retorno era ${diaCompleto(ordem.previsao_retorno)} e as peças ainda não voltaram`}>Retorno atrasado</Selo>}
              <span className="acn-fraco" title="Desde quando a ordem está nesta situação">desde {momentoBR(ordem.status_desde || ordem.atualizado_em)}</span>
            </div>

            {montada && <Faixa tom="atencao">A ordem espera a assinatura do prestador. Imprima, leve as peças e a ordem ao prestador e, com a cópia assinada em mãos, use "Enviar as peças". Enquanto isso os serviços não andam sozinhos.</Faixa>}
            {atrasada && <Faixa tom="erro">As peças deviam ter voltado em {diaCompleto(ordem.previsao_retorno)}. Fale com {prestador?.nome || 'o prestador'}{prestador?.telefone ? ` (${prestador.telefone})` : ''} e, se combinar outro dia, ajuste a previsão em "Alterar".</Faixa>}
            {!podeMexer && ativa && <p className="acn-terc-dica">Só o Admin, os gerentes e a Adaptação mexem na ordem de serviço em lote. Você pode ver tudo e imprimir.</p>}

            <div className="acn-terc-passos" role="group" aria-label="Passos da ordem">
              {podeMexer && montada && <Botao pequeno variante="primario" icone={mdiSendOutline} onClick={() => { setErro(''); setPasso('enviar'); }}>Enviar as peças</Botao>}
              {podeMexer && enviada && <Botao pequeno variante="primario" icone={mdiCheckBold} onClick={() => { setErro(''); setPasso('retorno'); }}>Registrar o retorno</Botao>}
              {podeMexer && ativa && <Botao pequeno variante="secundario" icone={mdiPencilOutline} onClick={() => { setErro(''); setPasso('editar'); }}>Alterar</Botao>}
              {podeMexer && montada && <Botao pequeno variante="secundario" icone={mdiPlus} onClick={() => { setErro(''); setPasso('incluir'); }}>Incluir serviços</Botao>}
              {podeMexer && montada && <Botao pequeno variante="secundario" icone={mdiLinkVariantOff} disabled={ocupado || marcadas.length === 0} onClick={tirarOsMarcados}>Tirar os marcados{marcadas.length ? ` (${marcadas.length})` : ''}</Botao>}
              {ordem.status !== 'cancelada' && <Botao pequeno variante="secundario" icone={mdiPrinterOutline} onClick={imprimirOrdem}>Imprimir a ordem</Botao>}
              {ordem.status !== 'cancelada' && <Botao pequeno variante="discreto" icone={mdiPrinterOutline} onClick={imprimirContrato}>Imprimir contrato</Botao>}
              {podeMexer && montada && <Botao pequeno variante="perigo-sec" icone={mdiCancel} disabled={ocupado} onClick={cancelar}>Cancelar a ordem</Botao>}
            </div>

            <div className="acn-terc-det-grade">
              <Item rotulo="Prestador">
                {prestador ? <>{prestador.nome}{prestador.telefone && <span className="acn-fraco"> · {prestador.telefone}</span>}</> : <span className="acn-terc-sem">Prestador removido</span>}
              </Item>
              <Item rotulo={ordem.data_envio_real ? 'Peças enviadas em' : 'Envio das peças (previsto)'}>{diaCompleto(ordem.data_envio_real || ordem.data_envio_prevista)}</Item>
              <Item rotulo={ordem.data_retorno_real ? 'Peças voltaram em' : 'Retorno previsto'}>
                {diaCompleto(ordem.data_retorno_real || ordem.previsao_retorno)}
                {ordem.data_retorno_real && ordem.previsao_retorno && <div className="acn-fraco">Previsto para {diaCompleto(ordem.previsao_retorno)}</div>}
              </Item>
              <Item rotulo="Montada por"><>{ordem.criado_por || '—'}<div className="acn-fraco">em {momentoBR(ordem.criado_em)}</div></></Item>
              {ordem.enviada_em && <Item rotulo="Enviada por"><>{ordem.enviada_por || '—'}<div className="acn-fraco">em {momentoBR(ordem.enviada_em)}</div></></Item>}
              {ordem.fechada_em && <Item rotulo="Fechada por"><>{ordem.fechada_por || '—'}<div className="acn-fraco">em {momentoBR(ordem.fechada_em)}</div></></Item>}
              {ordem.status === 'cancelada' && <Item rotulo="Cancelada por"><>{ordem.cancelado_por || '—'}<div className="acn-fraco">em {ordem.cancelado_em ? momentoBR(ordem.cancelado_em) : '—'}</div></></Item>}
            </div>
            {ordem.status === 'cancelada' && ordem.cancelado_motivo && <Faixa tom="atencao">Motivo do cancelamento: {ordem.cancelado_motivo}</Faixa>}
            {ordem.observacao && <Item rotulo="Observação" largo><span className="acn-terc-det-texto">{ordem.observacao}</span></Item>}

            <Item rotulo={`Cópia assinada${(ordem.copias || []).length ? ` (${ordem.copias.length})` : ''}`} largo>
              {(ordem.copias || []).length > 0
                ? (
                  <ul className="acn-terc-anexos">
                    {ordem.copias.map((a: any) => (
                      <li key={a.caminho}>
                        <Icone path={mdiPaperclip} size={14} />
                        <a className="acn-terc-anexo-nome" href={enderecoDoAnexo(a.caminho)} target="_blank" rel="noopener noreferrer">{a.nome}</a>
                        <span className="acn-fraco">{[tamanhoLegivel(a.tamanho), a.por ? `por ${a.por}` : ''].filter(Boolean).join(' · ')}</span>
                      </li>
                    ))}
                  </ul>
                )
                : <span className="acn-fraco">{montada ? 'Ainda não anexada: é ela que libera o envio das peças.' : 'Nenhuma.'}</span>}
            </Item>

            {pecas.length > 0 && <Item rotulo="Peças da ordem" largo><span className="acn-terc-det-texto">{textoDasPecas(pecas)}</span></Item>}

            {/* T5: o pagamento só aparece depois que a ordem fecha (os serviços viram realizados) e a saída da vistoria só depois que a ordem sai da fase de assinatura, ou se já há uma ligada */}
            {ordem.status !== 'cancelada' && doBanco.length > 0 && (
              <>
                {doBanco.some((s: any) => s.status === 'realizado') && (
                  <Item rotulo="Pagamento ao prestador" largo>
                    <CaixaDoPagamento servicos={doBanco} currentUser={currentUser} tipoDe={(s: any) => mapaTipos.get(s.tipo_id)} aoPedir={aoPedirPagamento} />
                  </Item>
                )}
                {(!montada || doBanco.some((s: any) => s.vistoria_id)) && (
                  <Item rotulo="Saída da vistoria de pátio" largo>
                    <CaixaDaSaida servicos={doBanco} currentUser={currentUser} tipoDe={(s: any) => mapaTipos.get(s.tipo_id)} hoje={hoje} aoRegistrar={aoRegistrarSaida} aoLigar={aoLigarSaida} aoDesligar={aoDesligarSaida} />
                  </Item>
                )}
              </>
            )}

            {erro && <Faixa tom="erro">{erro}</Faixa>}

            <div className="acn-terc-grupo-barra">
              <label className="acn-terc-marca">
                {podeMexer && montada && <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(doBanco.map((l: any) => l.id)))} aria-label="Marcar todos os serviços" />}
                <span>{doBanco.length} serviço{doBanco.length === 1 ? '' : 's'} na ordem{podeMexer && montada && marcadas.length ? ` · ${marcadas.length} marcado${marcadas.length === 1 ? '' : 's'}` : ''}</span>
              </label>
            </div>
            <div className="acn-rolagem">
              <table className="acn-tabela acn-densa">
                <thead>
                  <tr>{podeMexer && montada && <th aria-label="Marcar"></th>}<th>Nº</th><th>Ligação</th><th>Peças</th><th>Situação</th>{verValor && <th>Valor</th>}<th>Ações</th></tr>
                </thead>
                <tbody>
                  {doBanco.map((s: any) => {
                    const valor = s.status === 'realizado' ? s.valor_final : s.valor_combinado;
                    return (
                      <tr key={s.id} className="acn-terc-linha" data-servico={s.id} onClick={() => aoAbrirServico(s)}>
                        {podeMexer && montada && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Marcar o serviço ${s.numero}`} /></td>}
                        <td className="acn-num"><strong>{s.numero}</strong></td>
                        <td>{rotuloDaLigacao(s)}</td>
                        <td>{textoDasPecas(juntarPecas([s])) || <span className="acn-fraco">—</span>}</td>
                        <td><Tag>{rotuloDaSituacao(s.status)}</Tag>{s.status === 'realizado' && s.data_realizada ? <span className="acn-fraco"> · {diaCompleto(s.data_realizada)}</span> : null}</td>
                        {verValor && <td className="acn-num">{reaisDoServico(valor)}</td>}
                        <td className="acn-dir" onClick={e => e.stopPropagation()}>
                          <MenuAcoes rotulo={`Ações do serviço ${s.numero}`} itens={[{ rotulo: 'Abrir o serviço', icone: mdiOpenInNew, onClick: () => aoAbrirServico(s) }]} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {doBanco.length === 0 && <p className="acn-terc-dica">Nenhum serviço aponta para esta ordem na lista lida. Use "Atualizar" e confira.</p>}

            <div className="acn-terc-det-hist">
              <Botao pequeno variante="discreto" icone={mdiHistory} onClick={() => setHistorico((h: any) => ({ ...h, aberto: !h.aberto }))}>{historico.aberto ? 'Esconder o histórico' : 'Ver o histórico'}</Botao>
              {historico.aberto && (
                <>
                  {historico.lendo && historico.lista.length === 0 && <p className="acn-terc-dica">Lendo o histórico…</p>}
                  {historico.erro && <Faixa tom="erro">Não foi possível ler o histórico da ordem ({historico.erro}).</Faixa>}
                  {!historico.erro && !historico.lendo && historico.lista.length === 0 && <p className="acn-terc-dica">Nenhum registro no histórico.</p>}
                  <ol className="acn-terc-historico">
                    {[...historico.lista].reverse().map((ev: any, i: number) => (
                      <li key={i}>
                        <span className="acn-terc-hist-quando">{momentoBR(ev.em)}</span>
                        <strong>{ROTULO_NO_HISTORICO[ev.acao] || ev.acao}</strong>
                        <span className="acn-fraco"> por {ev.por || '—'}</span>
                        {ev.detalhe && <div className="acn-terc-hist-detalhe">{ev.detalhe}</div>}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </div>
          <div className="acn-modal-rodape">
            <Botao variante="primario" onClick={onClose}>Fechar</Botao>
          </div>
        </div>
      </div>

      {passo === 'enviar' && (
        <ModalEnviarOrdem ordem={ordem} servicos={doBanco} onClose={() => setPasso(null)} aoRecarregar={aoRecarregar}
          aoGravar={(r: any) => gravou(r, doBanco, `Ordem ${ordem.numero} enviada: ${doBanco.length} serviço${doBanco.length === 1 ? '' : 's'} com as peças no prestador, com retorno previsto para ${diaCompleto(r.ordem.previsao_retorno)}.`)} />
      )}
      {passo === 'retorno' && (
        <ModalRetornoDaOrdem ordem={ordem} servicos={doBanco} currentUser={currentUser} onClose={() => setPasso(null)} aoRecarregar={aoRecarregar}
          aoGravar={(r: any) => gravou(r, doBanco, `Ordem ${ordem.numero} fechada: ${doBanco.length} serviço${doBanco.length === 1 ? '' : 's'} dado${doBanco.length === 1 ? '' : 's'} como realizado${doBanco.length === 1 ? '' : 's'}.`)} />
      )}
      {passo === 'editar' && (
        <ModalEditarOrdem ordem={ordem} servicos={doBanco} prestadores={prestadores} onClose={() => setPasso(null)} aoRecarregar={aoRecarregar}
          aoGravar={(r: any) => gravou(r, doBanco, `Ordem ${ordem.numero} alterada.`)} />
      )}
      {passo === 'incluir' && (
        <ModalIncluirNaOrdem ordem={ordem} todos={servicos} mapaTipos={mapaTipos} prestador={prestador} onClose={() => setPasso(null)} aoRecarregar={aoRecarregar}
          aoGravar={(r: any, escolhidos: any[]) => gravou(r, escolhidos, `${descreverNumeros(escolhidos)} incluído${escolhidos.length > 1 ? 's' : ''} na ordem ${ordem.numero}.`)} />
      )}
    </>
  );
}
