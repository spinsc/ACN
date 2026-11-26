// @ts-nocheck
// Serviços de terceiros: a LISTA (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026): uma linha por serviço (por carro), com os mesmos filtros e passos do Quadro, para quem prefere tabela
// ou precisa ordenar e somar. A tabela larga vai dentro de `acn-rolagem` e a coluna "Ações" fica fixa à direita (automática, `ColunaAcoesFixa.ts`).
import React, { useMemo, useState } from 'react';
import { MenuAcoes, Selo } from './Interface';
import { rotuloDaSituacao, colunaDoServico, rotuloDaLigacao, selosDoServico, movimentosDoServico, dataDeReferencia, reaisDoServico, textoDaDiferenca, veiculoParaMostrar, veiculoSemDado, textoDasPecas, rotuloDasPecas } from './TerceirosFluxo';
import { itensDoMenu, extrasDoServico } from './TerceirosAcoes';
import { SelosDoServico, textoDoDia } from './TerceirosPecas';

const ORDENS = [
  { id: 'situacao', rotulo: 'Situação e dia' },
  { id: 'recente', rotulo: 'Mexidos há menos tempo' },
  { id: 'dia', rotulo: 'Dia do serviço' },
  { id: 'numero', rotulo: 'Número (mais novo primeiro)' },
  { id: 'prestador', rotulo: 'Prestador' },
  { id: 'tipo', rotulo: 'Tipo de serviço' },
];
const RANK_SITUACAO = { solicitado: 0, agendado: 1, realizado: 2, cancelado: 3 };
const nulosPorUltimo = (a: any, b: any) => (!a && !b ? 0 : !a ? 1 : !b ? -1 : (a < b ? -1 : a > b ? 1 : 0));

function ordenar(lista: any[], ordem: string, mapaTipos: Map<string, any>, mapaPrestadores: Map<string, any>) {
  const nomeDoPrestador = (s: any) => (s.prestador_id ? mapaPrestadores.get(s.prestador_id)?.nome || '' : '');
  const c = [...lista];
  c.sort((a, b) => {
    let r = 0;
    if (ordem === 'situacao') r = (RANK_SITUACAO[a.status] ?? 9) - (RANK_SITUACAO[b.status] ?? 9) || nulosPorUltimo(dataDeReferencia(a), dataDeReferencia(b));
    else if (ordem === 'recente') r = String(b.atualizado_em).localeCompare(String(a.atualizado_em));
    else if (ordem === 'dia') r = nulosPorUltimo(dataDeReferencia(a), dataDeReferencia(b));
    else if (ordem === 'numero') r = String(b.numero).localeCompare(String(a.numero));
    else if (ordem === 'prestador') r = (nomeDoPrestador(a) || '￿').localeCompare(nomeDoPrestador(b) || '￿', 'pt-BR');
    else if (ordem === 'tipo') r = String(mapaTipos.get(a.tipo_id)?.nome || '').localeCompare(String(mapaTipos.get(b.tipo_id)?.nome || ''), 'pt-BR');
    return r || String(a.numero).localeCompare(String(b.numero));
  });
  return c;
}

export function ListaDeTerceiros({ servicos, mapaTipos, mapaPrestadores, choques, hoje, currentUser, verValor, aoAbrir, aoAbrirOrdem, aoImprimir, aoMover }) {
  const [ordem, setOrdem] = useState('situacao');
  const linhas = useMemo(() => ordenar(servicos, ordem, mapaTipos, mapaPrestadores), [servicos, ordem, mapaTipos, mapaPrestadores]);
  const totais = useMemo(() => {
    let combinado = 0; let final = 0; let semCombinado = 0;
    for (const s of servicos) {
      if (s.status === 'cancelado') continue;
      if (s.valor_combinado == null) semCombinado++; else combinado += Number(s.valor_combinado);
      if (s.valor_final != null) final += Number(s.valor_final);
    }
    return { combinado: Math.round(combinado * 100) / 100, final: Math.round(final * 100) / 100, semCombinado };
  }, [servicos]);
  const colunas = verValor ? 12 : 11;

  return (
    <div className="acn-terc">
      <div className="acn-terc-lista-cab">
        <span className="acn-ajuda">{servicos.length} serviço{servicos.length === 1 ? '' : 's'}{verValor && servicos.length > 0 ? ` · combinado ${reaisDoServico(totais.combinado)}${totais.semCombinado ? ` (${totais.semCombinado} sem valor)` : ''} · final dos realizados ${reaisDoServico(totais.final)}` : ''}</span>
        <label className="acn-terc-ordem"><span>Ordenar por</span>
          <select className="acn-input acn-select-mini" value={ordem} onChange={e => setOrdem(e.target.value)} aria-label="Ordenar a lista">
            {ORDENS.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
        </label>
      </div>
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead>
            <tr>
              <th>Nº</th><th>Tipo</th><th>Descrição</th><th>Veículo</th><th>Ligação</th><th>Prestador</th><th>Dia</th><th>Situação</th>{verValor && <th>Valor</th>}<th>Pedido por</th><th>Há</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(s => {
              const tipo = mapaTipos.get(s.tipo_id);
              const prestador = s.prestador_id ? mapaPrestadores.get(s.prestador_id) : null;
              const col = colunaDoServico(s);
              const selos = selosDoServico(s, hoje, tipo, choques, verValor);
              const movs = movimentosDoServico(s, tipo, currentUser);
              const dif = verValor && s.status === 'realizado' ? textoDaDiferenca(s) : '';
              return (
                <tr key={s.id} className="acn-terc-linha" data-servico={s.id} onClick={() => aoAbrir(s)}>
                  <td className="acn-num"><strong>{s.numero}</strong></td>
                  <td>{tipo?.nome || '—'}</td>
                  <td className="acn-terc-celula-desc" title={s.descricao}>
                    {s.descricao}
                    {textoDasPecas(s) && <div className="acn-fraco acn-terc-celula-pecas" title={`${rotuloDasPecas(tipo)}: ${textoDasPecas(s)}`}>{rotuloDasPecas(tipo)}: {textoDasPecas(s)}</div>}
                  </td>
                  <td className={'acn-terc-celula-veic' + (s.veiculo_nao_lido ? ' nao-lido' : veiculoSemDado(s) ? ' sem-dado' : '')}>{veiculoParaMostrar(s) || <span className="acn-fraco">—</span>}</td>
                  <td className="acn-terc-nowrap">{rotuloDaLigacao(s)}{s.ordem_id && s.ordem_status !== 'cancelada' && <div className="acn-fraco">Ordem {s.ordem_numero}</div>}</td>
                  <td>{prestador ? prestador.nome : <span className="acn-terc-sem">Sem prestador</span>}</td>
                  <td className="acn-terc-nowrap">{textoDoDia(s)}</td>
                  <td><Selo familia={col.familia}>{rotuloDaSituacao(s.status)}</Selo>{selos.length > 0 && <div className="acn-terc-celula-selos"><SelosDoServico selos={selos} /></div>}</td>
                  {verValor && <td className="acn-num">{s.status === 'realizado' ? reaisDoServico(s.valor_final) : reaisDoServico(s.valor_combinado)}{dif && <div className="acn-fraco">{dif}</div>}</td>}
                  <td className="acn-terc-celula-pedido">{s.solicitante_nome}{s.solicitante_perfil && <div className="acn-fraco">{s.solicitante_perfil}</div>}</td>
                  <td className="acn-num" title="Dias desde que o serviço mudou de coluna">{dias(s)}</td>
                  <td className="acn-dir" onClick={e => e.stopPropagation()}>
                    <MenuAcoes rotulo={`Ações do serviço ${s.numero}`} itens={itensDoMenu(movs, m => aoMover(m, [s]), extrasDoServico([s], { aoAbrir: () => aoAbrir(s), aoAbrirOrdem, aoImprimir }))} />
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && <tr><td colSpan={colunas} className="acn-centro acn-fraco">Nenhum serviço com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function dias(s: any) {
  const t = new Date(s.status_desde || s.atualizado_em || '').getTime();
  if (!Number.isFinite(t)) return '—';
  const d = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  return d === 0 ? 'hoje' : `${d} d`;
}
