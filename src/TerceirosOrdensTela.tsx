// @ts-nocheck
// Serviços de terceiros: a aba "Ordens de pintura" (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): as ordens de serviço em lote e, em cima delas, a fila dos serviços que esperam uma ordem.
// Montar a ordem é de quem pode mexer nela (Admin, gerentes e Adaptação); os outros veem as ordens, abrem e imprimem. A lógica está em TerceirosOrdens.ts; a janela da ordem, em TerceirosOrdemModal.tsx.
import React, { useMemo, useState } from 'react';
import { mdiMagnify, mdiOpenInNew, mdiPlus } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Chips, Tag, MenuAcoes } from './Interface';
import { rotuloDaLigacao, rotuloDaSituacao } from './TerceirosFluxo';
import { candidatosParaOrdem, familiaDaOrdem, ordemEstaAtiva, podeMexerNaOrdem, rotuloDaOrdem } from './TerceirosOrdens';
import { diaCompleto, textoDoDia } from './TerceirosPecas';
import { juntarPecas, textoDasPecas } from './TerceirosContrato';

const SITUACOES = [
  { id: 'andamento', rotulo: 'Em andamento', titulo: 'Aguardando assinatura e com as peças no prestador' },
  { id: 'fechadas', rotulo: 'Fechadas' },
  { id: 'canceladas', rotulo: 'Canceladas' },
  { id: 'todas', rotulo: 'Todas' },
];
const passaNaSituacao = (o: any, f: string): boolean => (f === 'todas' ? true : f === 'andamento' ? ordemEstaAtiva(o) : f === 'fechadas' ? o.status === 'fechada' : o.status === 'cancelada');

const semAcento = (t: unknown): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * `ordens` = a lista lida; `erro` = a falha da leitura das ordens (a lista de antes continua na tela). `aoMontar(servicosMarcados)` abre a janela de montar.
 * `aoAbrirOrdem(id)` e `aoAbrirServico(s)` abrem as janelas por cima desta aba.
 */
export function OrdensDeTerceiros({ ordens, erro, servicos, mapaTipos, mapaPrestadores, hoje, currentUser, aoAbrirOrdem, aoAbrirServico, aoMontar, aoRecarregar }) {
  const podeMexer = podeMexerNaOrdem(currentUser);
  const [situacao, setSituacao] = useState('andamento');
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const candidatos = useMemo(() => candidatosParaOrdem(servicos, mapaTipos), [servicos, mapaTipos]);
  const algumTipoComOrdem = useMemo(() => [...mapaTipos.values()].some((t: any) => t.ativo && t.usa_ordem_em_lote), [mapaTipos]);
  // quem saiu da fila (entrou numa ordem, foi cancelado, mudou de coluna) sai também dos marcados
  const marcadosValidos = useMemo(() => new Set([...marcados].filter(id => candidatos.some((s: any) => s.id === id))), [marcados, candidatos]);
  const escolhidos = candidatos.filter((s: any) => marcadosValidos.has(s.id));
  const todosMarcados = candidatos.length > 0 && escolhidos.length === candidatos.length;

  const contagemPorOrdem = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of servicos) if (s.ordem_id) m.set(s.ordem_id, (m.get(s.ordem_id) || 0) + 1);
    return m;
  }, [servicos]);

  const q = semAcento(busca).trim();
  const lista = useMemo(() => {
    const atrasada = (o: any) => o.status === 'enviada' && !!o.previsao_retorno && o.previsao_retorno < hoje;
    return ordens
      .filter((o: any) => passaNaSituacao(o, situacao))
      .filter((o: any) => !q || semAcento(`${o.numero} ${mapaPrestadores.get(o.prestador_id)?.nome || ''} ${rotuloDaOrdem(o.status)} ${o.observacao || ''}`).includes(q))
      .sort((a: any, b: any) => {
        if (ordemEstaAtiva(a) && ordemEstaAtiva(b)) return Number(atrasada(b)) - Number(atrasada(a)) || String(a.previsao_retorno).localeCompare(String(b.previsao_retorno)) || a.numero.localeCompare(b.numero);
        return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
      });
  }, [ordens, situacao, q, mapaPrestadores, hoje]);

  const alternar = (id: string) => setMarcados(m => { const n = new Set([...m].filter(x => candidatos.some((s: any) => s.id === x))); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="acn-terc">
      {erro && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={aoRecarregar}>Tentar de novo</Botao>}>
          Não foi possível ler as ordens de serviço ({erro}). {ordens.length > 0 ? 'A lista abaixo é a da última leitura que deu certo.' : 'Nada foi carregado ainda.'}
        </Faixa>
      )}

      <section className="acn-terc-modelo">
        <h3 className="acn-terc-modelo-t">Serviços esperando uma ordem</h3>
        {!algumTipoComOrdem
          ? <Faixa tom="info">Nenhum tipo de serviço está marcado para a ordem em lote. O Admin marca o tipo (por exemplo, "Pintura eletrostática") na aba "Tipos de serviço".</Faixa>
          : candidatos.length === 0
            ? <p className="acn-terc-dica">Nenhum serviço de pintura espera uma ordem agora. Os pedidos novos aparecem aqui; um serviço que já está numa ordem, ou que não é de um tipo com ordem em lote, não entra.</p>
            : (
              <>
                <p className="acn-terc-dica">
                  Marque os serviços que vão juntos ao prestador e use "Montar ordem". {podeMexer ? 'A ordem junta todos numa só ida: prestador e dia valem para todos.' : 'Só o Admin, os gerentes e a Adaptação montam a ordem; você vê a fila.'}
                </p>
                <div className="acn-terc-grupo-barra">
                  <label className="acn-terc-marca">
                    {podeMexer && <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(candidatos.map((s: any) => s.id)))} aria-label="Marcar todos os serviços" />}
                    <span>{candidatos.length} serviço{candidatos.length === 1 ? '' : 's'} na fila{podeMexer && escolhidos.length ? ` · ${escolhidos.length} marcado${escolhidos.length === 1 ? '' : 's'}` : ''}</span>
                  </label>
                  {podeMexer && (
                    <Botao pequeno variante="primario" icone={mdiPlus} disabled={escolhidos.length === 0} onClick={() => aoMontar(escolhidos)}>
                      Montar ordem{escolhidos.length ? ` com ${escolhidos.length}` : ''}
                    </Botao>
                  )}
                </div>
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-densa">
                    <thead><tr>{podeMexer && <th aria-label="Marcar"></th>}<th>Nº</th><th>Ligação</th><th>Peças</th><th>Prestador</th><th>Dia</th><th>Situação</th></tr></thead>
                    <tbody>
                      {candidatos.map((s: any) => {
                        const p = s.prestador_id ? mapaPrestadores.get(s.prestador_id) : null;
                        return (
                          <tr key={s.id} className="acn-terc-linha" data-servico={s.id} onClick={() => aoAbrirServico(s)}>
                            {podeMexer && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={marcadosValidos.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Marcar o serviço ${s.numero}`} /></td>}
                            <td className="acn-num"><strong>{s.numero}</strong></td>
                            <td>{rotuloDaLigacao(s)}</td>
                            <td>{textoDasPecas(juntarPecas([s])) || <span className="acn-fraco">—</span>}</td>
                            <td>{p ? p.nome : <span className="acn-terc-sem">Sem prestador</span>}</td>
                            <td>{textoDoDia(s)}</td>
                            <td><Tag>{rotuloDaSituacao(s.status)}</Tag></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
      </section>

      <section className="acn-terc-modelo">
        <h3 className="acn-terc-modelo-t">Ordens de serviço</h3>
        <div className="acn-terc-filtros">
          <Chips rotulo="Ver" ativo={situacao} onChange={setSituacao} itens={SITUACOES.map(x => ({ ...x, contagem: ordens.filter((o: any) => passaNaSituacao(o, x.id)).length }))} />
          <div className="acn-cmp-busca-geral">
            <Icone path={mdiMagnify} size={14} />
            <input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar ordem" placeholder="Número da ordem, prestador…" />
          </div>
        </div>
        {lista.length === 0
          ? <p className="acn-terc-dica">{ordens.length === 0 ? 'Ainda não há ordem de serviço. Monte a primeira marcando serviços na fila acima.' : 'Nenhuma ordem nesta visão.'}</p>
          : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-densa">
                <thead><tr><th>Ordem</th><th>Prestador</th><th>Situação</th><th>Serviços</th><th>Envio</th><th>Retorno</th><th>Ações</th></tr></thead>
                <tbody>
                  {lista.map((o: any) => {
                    const p = mapaPrestadores.get(o.prestador_id);
                    const atrasada = o.status === 'enviada' && !!o.previsao_retorno && o.previsao_retorno < hoje;
                    const n = contagemPorOrdem.get(o.id) || 0;
                    return (
                      <tr key={o.id} className="acn-terc-linha" data-ordem={o.id} onClick={() => aoAbrirOrdem(o.id)}>
                        <td className="acn-num"><strong>{o.numero}</strong></td>
                        <td>{p ? p.nome : <span className="acn-fraco">Prestador removido</span>}</td>
                        <td>
                          <div className="acn-terc-celula-selos">
                            <Selo familia={familiaDaOrdem(o.status)}>{rotuloDaOrdem(o.status)}</Selo>
                            {atrasada && <Selo familia="erro" title={`A previsão de retorno era ${diaCompleto(o.previsao_retorno)}`}>Retorno atrasado</Selo>}
                          </div>
                        </td>
                        <td className="acn-num">{n || '—'}</td>
                        <td>{diaCompleto(o.data_envio_real || o.data_envio_prevista)}{!o.data_envio_real && o.status === 'montada' ? <span className="acn-fraco"> (previsto)</span> : null}</td>
                        <td>{diaCompleto(o.data_retorno_real || o.previsao_retorno)}{!o.data_retorno_real && o.previsao_retorno && o.status === 'enviada' ? <span className="acn-fraco"> (previsto)</span> : null}</td>
                        <td className="acn-dir" onClick={e => e.stopPropagation()}>
                          <MenuAcoes rotulo={`Ações da ordem ${o.numero}`} itens={[{ rotulo: 'Abrir a ordem', icone: mdiOpenInNew, onClick: () => aoAbrirOrdem(o.id) }]} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        {situacao === 'andamento' && lista.length > 0 && <p className="acn-terc-dica">{lista.length === 1 ? '1 ordem em andamento' : `${lista.length} ordens em andamento`}{n(lista, contagemPorOrdem)}.</p>}
      </section>
    </div>
  );
}

/** ", com 41 serviços" na soma de todas as ordens da lista (só os serviços lidos). */
function n(lista: any[], contagem: Map<string, number>): string {
  const total = lista.reduce((t, o) => t + (contagem.get(o.id) || 0), 0);
  return total ? `, com ${total} serviço${total === 1 ? '' : 's'}` : '';
}
