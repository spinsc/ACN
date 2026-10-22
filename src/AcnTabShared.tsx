// @ts-nocheck
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto } from './Feedback';
import { diaBR, hojeISO, Botao, MenuAcoes, Selo } from './Interface';
import { mdiBookOpenPageVariantOutline, mdiPencilOutline, mdiClose, mdiFormatListNumbered, mdiPencilBoxMultipleOutline, mdiLinkVariant } from '@mdi/js';
import Icone from './Icone';
import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';

// O dossiê importa OplProgressBar deste arquivo; para não fechar um ciclo de
// imports, a volta é por import dinâmico (que de quebra deixa o jsPDF fora do
// pacote principal, só baixando quando alguém abre o dossiê).
const ModalDossieOp = lazy(() => import('./OpDossie').then(m => ({ default: m.ModalDossieOp })));
const ModalLote = lazy(() => import('./OpLote').then(m => ({ default: m.ModalLote })));
import { ColaboradorSelect } from './ColaboradorSelect';
import { departamentosDoSetor } from './RhDepartamentos';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';
import Linkify from './Linkify';
import { horasUteis, dentroDoExpediente } from './utils/horasUteis';
import { combinaBusca } from './SearchUtils';
import { useFieldHighlight, logChange } from './AuditSystem';
import { abrirVinculo } from './VinculoPicker';
import { soEnvio, TIPO_VENDA_ENVIO, terminaEmEnvio, aguardaLiberacaoComercial, fluxoLabel } from './FluxoEntrega';
import { textoVeiculo } from './Veiculos';
import { etapaDaOp } from './EtapasOp';
import { OndeEstaAgoraAuto } from './OndeEstaAgora';
import { podeAlterarNumeroOplPv, podeVerValores } from './utils/permissoes';
import { renomearOpl } from './RenomearOpl';
import { OrigemVendaBadge, ORIGENS, podeEditarOrigem, origemInfo } from './OrigemVenda';
import { ModalEditarOpl, ModalEditarOplLote, podeEditarOplCompleta } from './OplEdicao';
import { SeletorEscopo } from './EscopoDaEdicao';
import { aplicarNoLote, lerOutrasUnidadesDoLote, textoDoResultadoLote } from './EdicaoDeLote';
import { QuadroItensOp, ItensVendidosEditor } from './OpItens';
import { FotosVeiculoVer } from './FotosVeiculo';
import { itensPreenchidos } from './DemandaItens';
import { EquipeDaOpResumo } from './EquipeDaOp';
import { lerValorDigitado } from './LerValor';

// ─── Divisão de valor no desmembramento (1 OP com N veículos → N OPs) ────────
// O resto de arredondamento (centavos) fica todo na última unidade, pra soma
// das partes fechar exatamente com o valor original.
export function dividirValorEmUnidades(valor: number|null|undefined, qtd: number): (number|null)[] {
  if (valor == null || !qtd || qtd < 1) return Array(Math.max(qtd,1)).fill(valor ?? null);
  const centavosTotal = Math.round(valor * 100);
  const base = Math.floor(centavosTotal / qtd);
  const resto = centavosTotal - base * qtd;
  return Array.from({ length: qtd }, (_, i) => (base + (i === qtd - 1 ? resto : 0)) / 100);
}

// ─── Progresso da OP/OS ao longo do pipeline (Comercial → Faturado) ──────────
// Os nomes e percentuais das etapas moraram aqui; agora vêm de EtapasOp.ts, que a faixa
// "Onde está agora" também usa (Etapa 6 do PLANO_UX_FLUXO_TRABALHO.md). A barra é a mesma.
function progressoOpl(status: string, op?: any) {
  const e = etapaDaOp(status, op);
  return { pct: e.pct, label: e.label, retrabalho: !!e.retrabalho };
}

// `op` (opcional, 22/10/2026): com a OP em mãos a etapa de separar/embalar mostra o setor certo (rádio em envio é do Telecom)
export function OplProgressBar({ status, op }: { status: string; op?: any }) {
  const { pct, label, retrabalho } = progressoOpl(status, op);
  const tom = retrabalho ? 'retrab' : pct >= 100 ? 'ok' : 'and';
  return (
    <div className="acn-ats-prog">
      <div className="acn-ats-prog-lin">
        <span className="acn-ats-prog-rot">
          {retrabalho && '⚠️ '}Progresso — {label}
        </span>
        <span className={'acn-ats-prog-pct ' + tom}>{pct}%</span>
      </div>
      <div className="acn-ats-prog-trilho">
        <div className={'acn-ats-prog-barra ' + tom} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Lista inline de anexos (para OplDetalheModal) ───────────────────────────
function AnexosOPSection({ oplId }: { oplId: string }) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const TIPO_ICONE: Record<string, string> = { proposta:'📋', orcamento:'💰', documento:'📄', foto:'🖼️', checklist_entrega:'✅' };

  useEffect(() => {
    if (!oplId) return;
    let vivo = true;
    supabase.from('opl_anexos').select('*').eq('opl_id', oplId).order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return;
        // 7.x (15/10/2026): leitura que falha não pode parecer "nenhum documento anexado"
        setErro(error ? error.message : ''); if (!error) setAnexos(data || []); setLoading(false);
      });
    return () => { vivo = false; };
  }, [oplId]);

  if (loading) return <div className="acn-ats-anx-msg">Carregando documentos...</div>;
  if (erro) return <div className="acn-opl-aviso erro">Não foi possível ler os documentos anexados ({erro}). Isso não quer dizer que não existam.</div>;
  if (anexos.length === 0) return <div className="acn-ats-anx-msg">Nenhum documento anexado.</div>;

  return (
    <div className="acn-ats-anx">
      {anexos.map(a => (
        <div key={a.id} className="acn-ats-anx-item">
          <span className="acn-ats-anx-ic">{TIPO_ICONE[a.tipo] || '📄'}</span>
          <div className="acn-ats-anx-meio">
            {/* a cor do link vem do tipo do documento; tipo desconhecido usa a do "documento" */}
            <a href={a.url} target="_blank" rel="noreferrer" className="acn-ats-anx-lnk" data-tipo={TIPO_ICONE[a.tipo] ? a.tipo : 'documento'}>
              {a.nome}
            </a>
            <div className="acn-ats-anx-meta">
              {a.setor && <span className="acn-ats-anx-setor">{a.setor}</span>}
              {a.criado_por && <span>{a.criado_por}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ─── Botão de Pendências por OPL ─────────────────────────────────────────────
export function BotaoPendencias({ opl, opl_id }: { opl: string; opl_id?: any }) {
  const [open, setOpen] = useState(false);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const buscar = async () => {
    setLoading(true); setErro('');
    const { data, error } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('numero_opl', opl)
      .in('status', ['Pendente', 'Em Andamento'])
      .order('data_abertura', { ascending: false });
    // 7.x (15/10/2026): leitura que falhava mostrava "✓ Nenhuma pendência aberta" — um aval falso; agora a falha aparece
    if (error) { setErro(error.message); setPendencias([]); } else setPendencias(data || []);
    setLoading(false);
  };

  const abrir = () => { setOpen(true); buscar(); };

  return (
    <>
      <Botao className="acn-ats-b acn-ats-pend-bt" onClick={abrir} title="Ver pendências desta OP">
        📋 Pendências
      </Botao>

      {open && (
        <div className="modal-overlay">
          <div className="modal-box acn-ats-pend-box">
            <div className="modal-title">Pendências — OP {opl}</div>
            {loading ? (
              <div className="acn-ats-pend-msg">Carregando...</div>
            ) : erro ? (
              <div>
                <div className="acn-opl-aviso erro">Não foi possível ler as pendências desta OP ({erro}). Isso não quer dizer que não existam.</div>
                <div className="acn-ats-pend-novo"><Botao pequeno onClick={buscar}>Tentar de novo</Botao></div>
              </div>
            ) : pendencias.length === 0 ? (
              <div className="acn-ats-pend-ok">
                ✓ Nenhuma pendência aberta para esta OP.
              </div>
            ) : (
              <>
                <div className="acn-ats-pend-sub">
                  {pendencias.length} pendência(s) em aberto em {[...new Set(pendencias.map(p => p.setor_destino))].join(', ')}
                </div>
                <table className="acn-ats-pend-tab">
                  <thead>
                    <tr className="acn-ats-pend-cab">
                      <th className="acn-ats-pend-th">Setor</th>
                      <th className="acn-ats-pend-th">Descrição</th>
                      <th className="acn-ats-pend-th">Status</th>
                      <th className="acn-ats-pend-th">Responsável</th>
                      <th className="acn-ats-pend-th">Abertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendencias.map(p => {
                      const isAjuste = p.descricao?.startsWith('[AJUSTE]');
                      const desc = isAjuste ? p.descricao.replace('[AJUSTE] ', '') : (p.descricao || '—');
                      return (
                        <tr key={p.id} className={'acn-ats-pend-tr' + (isAjuste ? ' ajuste' : '')}>
                          <td className="acn-ats-pend-td set">{p.setor_destino || '—'}</td>
                          <td className="acn-ats-pend-td desc" title={desc}>
                            {isAjuste && <span className="acn-ats-selo-ajuste">AJUSTE</span>}
                            {desc}
                          </td>
                          <td className="acn-ats-pend-td">
                            <span className="acn-ats-pend-st" data-status={p.status === 'Em Andamento' ? 'and' : 'pend'}>{p.status}</span>
                          </td>
                          <td className="acn-ats-pend-td resp">{p.responsavel_nome || '—'}</td>
                          <td className="acn-ats-pend-td data">
                            {p.data_abertura ? new Date(p.data_abertura).toLocaleDateString('pt-BR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
            <div className="acn-ats-pend-rod">
              <Botao className="acn-ats-b acn-ats-mbt" onClick={() => setOpen(false)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OplMovimentadas({ setor }: { setor: string }) {
  const [open, setOpen]     = useState(false);
  const [aba, setAba]       = useState<'logs'|'processo'>('logs');
  const [logs, setLogs]     = useState<any[]>([]);
  const [opls, setOpls]     = useState<any[]>([]);
  const [operadores, setOperadores] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // 7.x (15/10/2026): cada leitura que falha aparece, em vez de virar "Nenhum registro encontrado" / lista vazia
  const [erroLogs, setErroLogs] = useState('');
  const [erroOpls, setErroOpls] = useState('');
  const [erroOperadores, setErroOperadores] = useState('');

  // Filtros
  const [fOperador, setFOperador]       = useState('');
  const [fDataInicio, setFDataInicio]   = useState('');
  const [fDataFim, setFDataFim]         = useState('');

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  // Os filtros entram por parâmetro: o "Limpar" zerava os campos e chamava esta função logo em seguida, mas ela ainda enxergava os valores da tela de antes e lia com os filtros antigos (7.x, 15/10/2026)
  const fetchData = async (f = { operador: fOperador, ini: fDataInicio, fim: fDataFim }) => {
    setLoading(true);
    try {
      // Logs com filtros
      let q = supabase
        .from('logs_movimentacao_opl')
        .select('*')
        .order('data_hora', { ascending: false })
        .limit(200);

      if (f.operador)  q = q.ilike('usuario_nome', `%${f.operador}%`);
      if (f.ini)       q = q.gte('data_hora', f.ini + 'T00:00:00');
      if (f.fim)       q = q.lte('data_hora', f.fim + 'T23:59:59');

      const [logsRes, oplsRes, opersRes] = await Promise.all([
        q,
        supabase.from('oples')
          .select('id,opl,cliente_nome,tipo_projeto,status_geral')
          .not('status_geral', 'in', '("Faturado","Cancelado")')
          .order('data_entrada', { ascending: false })
          .limit(50),
        supabase.from('logs_movimentacao_opl')
          .select('usuario_nome')
          .not('usuario_nome', 'is', null)
          .limit(500),
      ]);

      setErroLogs(logsRes.error ? logsRes.error.message : ''); if (!logsRes.error) setLogs(logsRes.data || []); else setLogs([]);
      setErroOpls(oplsRes.error ? oplsRes.error.message : ''); if (!oplsRes.error) setOpls(oplsRes.data || []); else setOpls([]);
      setErroOperadores(opersRes.error ? opersRes.error.message : '');
      if (!opersRes.error) {
        const uniq = [...new Set((opersRes.data || []).map((r: any) => r.usuario_nome).filter(Boolean))].sort() as string[];
        setOperadores(uniq);
      }
    } catch (e: any) {
      // falha de rede: as três leituras contam como recusadas
      const m = e?.message || String(e); setErroLogs(m); setErroOpls(m); setErroOperadores(m);
    } finally {
      setLoading(false);
    }
  };

  const limparFiltros = () => {
    setFOperador(''); setFDataInicio(''); setFDataFim('');
  };

  const fmtDt = (d: any) => d
    ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const temFiltro = fOperador || fDataInicio || fDataFim;

  return (
    <div className="acn-ats-mv">
      <div className="opl-mov-hdr" onClick={() => setOpen(o => !o)}>
        <span>📋 Histórico de Movimentações OP</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="opl-mov-body">
          {/* ── FILTROS ── */}
          <div className="acn-ats-mv-fil">
            <div>
              <div className="acn-ats-mv-rot">Operador</div>
              <select
                value={fOperador} onChange={e => setFOperador(e.target.value)}
                className="acn-ats-mv-campo sel">
                <option value="">Todos</option>
                {operadores.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
            <div>
              <div className="acn-ats-mv-rot">Data início</div>
              <input type="date" value={fDataInicio} onChange={e => setFDataInicio(e.target.value)}
                className="acn-ats-mv-campo" />
            </div>
            <div>
              <div className="acn-ats-mv-rot">Data fim</div>
              <input type="date" value={fDataFim} onChange={e => setFDataFim(e.target.value)}
                className="acn-ats-mv-campo" />
            </div>
            <Botao className="acn-ats-b acn-ats-mv-buscar" onClick={() => fetchData()}>
              🔍 Buscar
            </Botao>
            {temFiltro && (
              <Botao className="acn-ats-b acn-ats-mv-limpar" onClick={() => { limparFiltros(); fetchData({ operador: '', ini: '', fim: '' }); }}>
                ✕ Limpar
              </Botao>
            )}
            <span className="acn-ats-mv-cont">
              {loading ? 'Carregando...' : erroLogs ? '—' : `${logs.length} registro(s)`}
            </span>
          </div>
          {erroOperadores && <div className="acn-opl-aviso erro">Não foi possível ler a lista de operadores ({erroOperadores}); o filtro por operador pode estar incompleto.</div>}

          {/* ── ABAS ── */}
          <div className="acn-ats-mv-abas">
            {(['logs','processo'] as const).map(a => (
              <Botao key={a} className={'acn-ats-b acn-ats-mv-aba' + (aba===a ? ' ativa' : '')} onClick={() => setAba(a)}>
                {a === 'logs' ? '📝 Logs de Movimentação' : '⚙️ Em Processo'}
              </Botao>
            ))}
          </div>

          {/* ── ABA LOGS ── */}
          {aba === 'logs' && (
            <div className="acn-ats-mv-rol">
              {loading ? (
                <div className="acn-ats-mv-msg">Carregando...</div>
              ) : erroLogs ? (
                <div className="acn-opl-aviso erro">Não foi possível ler os registros de movimentação ({erroLogs}). Isso não quer dizer que não existam.</div>
              ) : logs.length === 0 ? (
                <div className="acn-ats-mv-msg">Nenhum registro encontrado.</div>
              ) : (
                <table className="acn-ats-mv-tab">
                  <thead><tr className="acn-ats-mv-cab">
                    <th className="acn-ats-mv-th">Data/Hora</th>
                    <th className="acn-ats-mv-th">OP</th>
                    <th className="acn-ats-mv-th">Setor</th>
                    <th className="acn-ats-mv-th">Evento</th>
                    <th className="acn-ats-mv-th">Operador</th>
                    <th className="acn-ats-mv-th">Status anterior → novo</th>
                  </tr></thead>
                  <tbody>
                    {logs.map((l, i) => (
                      <tr key={l.id || i} className="acn-ats-mv-tr">
                        <td className="acn-ats-mv-td data">{fmtDt(l.data_hora)}</td>
                        <td className="acn-ats-mv-td"><strong className="acn-ats-mv-opnum">{l.numero_opl || '—'}</strong></td>
                        <td className="acn-ats-mv-td setor">{l.setor || '—'}</td>
                        <td className="acn-ats-mv-td evento" title={l.evento}>
                          {l.evento || '—'}
                        </td>
                        <td className="acn-ats-mv-td">
                          {l.usuario_nome
                            ? <span className="acn-ats-mv-chip">{l.usuario_nome}</span>
                            : <span className="acn-ats-mv-traco">—</span>}
                        </td>
                        <td className="acn-ats-mv-td status">
                          {l.status_anterior && l.status_novo
                            ? <>{l.status_anterior} <span className="acn-ats-mv-seta">→</span> {l.status_novo}</>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loading && !erroLogs && logs.length >= 200 && <div className="acn-ajuda acn-ats-mv-nota">Mostrando os 200 registros mais recentes; use os filtros para ver os mais antigos.</div>}
            </div>
          )}

          {/* ── ABA EM PROCESSO ── */}
          {aba === 'processo' && (
            <div className="acn-ats-mv-rol">
              {erroOpls && <div className="acn-opl-aviso erro">Não foi possível ler as OPs em processo ({erroOpls}). Isso não quer dizer que não existam.</div>}
              <table className="acn-ats-mv-tab">
                <thead><tr className="acn-ats-mv-cab">
                  <th className="acn-ats-mv-th">OP</th>
                  <th className="acn-ats-mv-th">Cliente</th>
                  <th className="acn-ats-mv-th">Tipo</th>
                  <th className="acn-ats-mv-th">Status</th>
                  <th className="acn-ats-mv-th">Último Registro</th>
                  <th className="acn-ats-mv-th">Pendências</th>
                </tr></thead>
                <tbody>
                  {opls.length === 0 ? (
                    <tr><td colSpan={6} className="acn-ats-mv-vazio">{erroOpls ? '—' : 'Nenhuma OP em processo.'}</td></tr>
                  ) : opls.map((o, i) => {
                    const ultimoLog = logs.find(l => l.opl_id === o.id);
                    return (
                      <tr key={o.id} className="acn-ats-mv-tr">
                        <td className="acn-ats-mv-td"><strong className="acn-ats-mv-opnum">{o.opl}</strong></td>
                        <td className="acn-ats-mv-td cli">{o.cliente_nome || '—'}</td>
                        <td className="acn-ats-mv-td tipo">{o.tipo_projeto || '—'}</td>
                        <td className="acn-ats-mv-td">
                          <span className="acn-ats-mv-st">{o.status_geral}</span>
                        </td>
                        <td className="acn-ats-mv-td ult">
                          {ultimoLog ? `${ultimoLog.evento} — ${fmtDt(ultimoLog.data_hora)}` : '—'}
                        </td>
                        <td className="acn-ats-mv-td"><BotaoPendencias opl={o.opl} opl_id={o.id} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!erroOpls && opls.length >= 50 && <div className="acn-ajuda acn-ats-mv-nota">Mostrando as 50 OPs em processo mais recentes.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VEÍCULO OU ENVIO — a célula "Veículo" das listas de OP.
// Venda para Envio (e envio de material em geral) não tem veículo: mostrar
// "⚠️ sem modelo / sem chassi / sem placa" em vermelho seria falso alarme em
// toda tela por onde a OP passa. No lugar, o que ela é e a quantidade.
// Uma implementação só, para as telas não divergirem.
// ─────────────────────────────────────────────────────────────────────────────
/** Quem paga o frete desta OP, e o que isso faz acontecer depois da embalagem.
 *  Até 24/09/2026 a resposta ficava guardada no banco sem aparecer em lugar
 *  nenhum: nem no detalhe da OP, nem no dossiê, nem para quem embalava. Aqui
 *  ela é só mostrada; quem responde e corrige são o modal de edição da OP
 *  (OplEdicao.tsx) e a tela de embalagem (AlmoxarifadoTab.tsx). */
export function SeloFrete({ o, compacto = false }: { o: any; compacto?: boolean }) {
  if (!terminaEmEnvio(o?.fluxo_entrega) && o?.tipo_projeto !== TIPO_VENDA_ENVIO) return null;
  const v = o?.frete_responsavel;
  const tom = v === 'FOB' ? 'fob' : v === 'CIF' ? 'cif' : 'nada';
  const rotulo = v === 'FOB' ? 'FOB — cliente paga o frete'
               : v === 'CIF' ? 'CIF — a empresa paga o frete'
               :               'Frete não informado';
  const efeito = v === 'FOB' ? 'não vai para cotação: depois de embalada segue direto para liberação comercial'
               : v === 'CIF' ? 'depois de embalada, abre pedido de frete para a Logística cotar'
               :               'sem resposta, a OP é tratada como CIF e vai para cotação';
  return (
    <span title={efeito} className={'acn-ats-frete ' + tom}>
      🚚 {rotulo}
    </span>
  );
}

/** Alerta de frete por conta do cliente (FOB), para todo mundo que olha a OP saber de relance (pedido do usuário em 15/10/2026): a OP não passa por cotação de
 *  frete e, depois de embalada, segue para a liberação comercial e o faturamento. Só aparece em FOB; em CIF a informação está no detalhe da OP (SeloFrete). */
export function SeloFreteCliente({ o }: { o: any }) {
  if (o?.frete_responsavel !== 'FOB') return null;
  return (
    <div className="acn-ats-fob">
      <Selo familia="atencao" ponto={false} title="O cliente paga o frete (FOB): esta OP não vai para cotação de frete; depois de embalada segue direto para a liberação comercial e o faturamento.">
        🚚 FRETE DO CLIENTE (FOB)
      </Selo>
    </div>
  );
}

export function VeiculoOuEnvio(props: { o: any; semPlaca?: boolean }) {
  return (<><VeiculoOuEnvioBase {...props} /><SeloFreteCliente o={props.o} /></>);
}

function VeiculoOuEnvioBase({ o, semPlaca = false }: { o: any; semPlaca?: boolean }) {
  const vazio = (v: any) => !v || !String(v).trim();
  const alerta = (t: string) => <span className="acn-ats-alerta">⚠️ {t}</span>;
  if (o?.tipo_projeto === TIPO_VENDA_ENVIO) {
    return <div className="acn-ats-envio">📦 Venda para envio · {o.quantidade || 1} un.</div>;
  }
  if (soEnvio(o?.fluxo_entrega)) {
    return <div className="acn-ats-apoio">— sem veículo (envio)</div>;
  }
  return (
    <>
      <div>{vazio(o?.modelo) ? alerta('sem modelo') : o.modelo}</div>
      <div className="acn-ats-apoio">{vazio(o?.chassi) ? alerta('sem chassi') : `🔧 ${o.chassi}`}</div>
      {!semPlaca && <div className="acn-ats-apoio">{vazio(o?.placa) ? alerta('sem placa') : `🚘 ${o.placa}`}</div>}
    </>
  );
}

// Mesma informação do VeiculoOuEnvio em duas linhas (tabelas do guia visual):
// modelo em destaque com o que falta ao lado; chassi e placa na linha de apoio.
export function VeiculoCompacto({ o, semPlaca = false, children }: { o: any; semPlaca?: boolean; children?: React.ReactNode }) {
  const vazio = (v: any) => !v || !String(v).trim();
  if (o?.tipo_projeto === TIPO_VENDA_ENVIO) {
    return <div className="acn-duas"><span className="acn-forte">Venda para envio · {o.quantidade || 1} un.</span>{children}</div>;
  }
  if (soEnvio(o?.fluxo_entrega)) {
    return <div className="acn-duas"><span className="acn-fraco">Sem veículo (envio)</span>{children}</div>;
  }
  const falta = [vazio(o?.modelo) && 'sem modelo', vazio(o?.chassi) && 'sem chassi', !semPlaca && vazio(o?.placa) && 'sem placa'].filter(Boolean);
  const dados = [!vazio(o?.chassi) && o.chassi, !semPlaca && !vazio(o?.placa) && o.placa].filter(Boolean);
  return (
    <div className="acn-duas">
      <span className="acn-forte">
        {vazio(o?.modelo) ? '' : o.modelo}
        {falta.length > 0 && <span className={'acn-aviso-mini' + (vazio(o?.modelo) ? ' acn-ats-sem-margem' : '')}>⚠ {falta.join(' · ')}</span>}
      </span>
      {dados.length > 0 && <small className="acn-mono">{dados.join(' · ')}</small>}
      {children}
    </div>
  );
}

// ─── RESUMO DO LOTE ─────────────────────────────────────────────────────────
// OP com lote (BASE/01, /02...): visão da OPL inteira numa tabela só — status,
// progresso, veículo, técnico, serviços e prazo de cada unidade, contagem por
// status e valor total. Aberto pelo detalhe de qualquer unidade.
const baseDoLote = (opl: string) => String(opl || '').trim().replace(/\/\d+$/, '');
const escLike = (v: string) => v.replace(/[\\%_]/g, m => '\\' + m);

// 7.x (15/10/2026): devolve também o erro da leitura — antes uma falha virava lista vazia e a tela dizia "0 unidade(s)" ou escondia o resumo do lote sem avisar
async function lerUnidadesDoLote(opl: string): Promise<{ lista: any[]; erro: string }> {
  const base = baseDoLote(opl);
  if (!base) return { lista: [], erro: '' };
  const { data, error } = await supabase.from('oples')
    .select('id,opl,status_geral,chassi,placa,modelo,responsavel_producao,equipe_nome,modo_execucao,resumo_servicos,data_prevista_entrega,valor_total,cliente_nome,origem_venda')
    .like('opl', escLike(base) + '/%');
  if (error) return { lista: [], erro: error.message };
  return { erro: '', lista: (data || [])
    .filter((o: any) => /^\/\d+$/.test(String(o.opl).slice(base.length)))
    .sort((a: any, b: any) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true })) };
}
async function buscarUnidadesDoLote(opl: string) { return (await lerUnidadesDoLote(opl)).lista; }

const fmtBRL = (v: any) => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtDataCurta = (d: any) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const escHtml = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' } as any)[c]);

// R7 (13/10/2026): `verValores` falso (marca "ver valores" desligada no Admin) tira o valor de cada unidade, o valor total e a coluna Valor, na tela e na impressão
export function ResumoLoteModal({ opl, onClose, verValores = true }: { opl: string; onClose: () => void; verValores?: boolean }) {
  const [unidades, setUnidades] = useState<any[] | null>(null);
  const [erroLote, setErroLote] = useState('');
  const [tentativaLote, setTentativaLote] = useState(0);
  const base = baseDoLote(opl);
  useEffect(() => { setUnidades(null); setErroLote(''); lerUnidadesDoLote(opl).then(r => { setErroLote(r.erro); setUnidades(r.lista); }); }, [opl, tentativaLote]);

  const lista = unidades || [];
  const porStatus: Record<string, number> = {};
  lista.forEach(u => { const k = u.status_geral || 'Sem status'; porStatus[k] = (porStatus[k] || 0) + 1; });
  const total = lista.reduce((s, u) => s + (Number(u.valor_total) || 0), 0);
  const tecnico = (u: any) => (u.modo_execucao === 'equipe' ? u.equipe_nome : u.responsavel_producao) || '';
  const pctMedio = lista.length ? Math.round(lista.reduce((s, u) => s + progressoOpl(u.status_geral).pct, 0) / lista.length) : 0;

  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão.'); return; }
    const linhas = lista.map(u => `<tr>
      <td><b>${escHtml(u.opl)}</b></td><td>${escHtml(u.status_geral)}</td><td>${progressoOpl(u.status_geral).pct}%</td>
      <td>${escHtml([u.modelo, u.chassi, u.placa].filter(Boolean).join(' · ') || '—')}</td>
      <td>${escHtml(tecnico(u) || '—')}</td><td>${escHtml(u.resumo_servicos || '—')}</td>
      <td>${fmtDataCurta(u.data_prevista_entrega)}</td>${verValores ? `<td style="text-align:right">${fmtBRL(u.valor_total)}</td>` : ''}</tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumo do lote ${escHtml(base)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:18px}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top}th{background:#0f172a;color:#fff;font-size:10px;text-align:left}</style></head><body>
      <h2>Resumo do lote — OP ${escHtml(base)}</h2>
      <div>${escHtml(lista[0]?.cliente_nome || '')} · ${lista.length} unidade(s) · progresso médio ${pctMedio}%${verValores ? ` · valor total ${fmtBRL(total)}` : ''}</div>
      <div style="margin-top:4px">${Object.entries(porStatus).map(([k, n]) => escHtml(k) + ': ' + n).join(' · ')}</div>
      <table><thead><tr><th>Unidade</th><th>Status</th><th>Progresso</th><th>Veículo</th><th>Técnico</th><th>Serviços</th><th>Prazo</th>${verValores ? '<th>Valor</th>' : ''}</tr></thead>
      <tbody>${linhas}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="modal-overlay acn-ats-rl-ov">
      <div className="modal-box acn-ats-rl-box">
        <div className="acn-ats-rl-cab">
          <div className="acn-ats-rl-tit">
            <div className="acn-ats-rl-nome">📋 Resumo do lote — OP {base}</div>
            {unidades && !erroLote && (
              <div className="acn-ats-rl-sub">
                {lista[0]?.cliente_nome || '—'} · {lista.length} unidade(s) · progresso médio {pctMedio}%{verValores && <> · valor total <b>{fmtBRL(total)}</b></>}
              </div>
            )}
          </div>
          <Botao className="acn-ats-b acn-ats-rl-imp" onClick={imprimir} disabled={!lista.length}>
            🖨️ Imprimir
          </Botao>
          <Botao className="acn-ats-b acn-ats-rl-fechar" onClick={onClose} title="Fechar resumo">
            Fechar
          </Botao>
        </div>
        {!unidades ? (
          <div className="acn-ats-rl-msg">Carregando...</div>
        ) : erroLote ? (
          <div>
            <div className="acn-opl-aviso erro">Não foi possível ler as unidades do lote ({erroLote}). Isso não quer dizer que não existam.</div>
            <div className="acn-ats-pend-novo"><Botao pequeno onClick={() => setTentativaLote(n => n + 1)}>Tentar de novo</Botao></div>
          </div>
        ) : (
          <>
            <div className="acn-ats-rl-stats">
              {Object.entries(porStatus).map(([k, n]) => (
                <span key={k} className="acn-ats-rl-stat">
                  {k}: {n}
                </span>
              ))}
            </div>
            <div className="acn-ats-rl-rol">
              <table className="acn-ats-rl-tab">
                <thead>
                  <tr className="acn-ats-rl-cab-tr">
                    {['Unidade', 'Status', 'Progresso', 'Veículo', 'Técnico', 'Serviços', 'Prazo', ...(verValores ? ['Valor'] : [])].map(h => (
                      <th key={h} className={'acn-ats-rl-th' + (h === 'Valor' ? ' dir' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(u => {
                    const pr = progressoOpl(u.status_geral);
                    return (
                      <tr key={u.id} className={'acn-ats-rl-tr' + (u.opl === opl ? ' atual' : '')}>
                        <td className="acn-ats-rl-td uni">{u.opl}</td>
                        <td className="acn-ats-rl-td">{u.status_geral || '—'}</td>
                        <td className="acn-ats-rl-td prog">
                          <div className="acn-ats-rl-trilho">
                            <div className={'acn-ats-rl-barra ' + (pr.retrabalho ? 'retrab' : pr.pct >= 100 ? 'ok' : 'and')} style={{ width: pr.pct + '%' }} />
                          </div>
                          <div className="acn-ats-rl-pct">{pr.pct}%</div>
                        </td>
                        <td className="acn-ats-rl-td">{[u.modelo, u.chassi, u.placa].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="acn-ats-rl-td">{tecnico(u) || <span className="acn-ats-rl-sem">sem responsável</span>}</td>
                        <td className="acn-ats-rl-td serv">{u.resumo_servicos || '—'}</td>
                        <td className="acn-ats-rl-td prazo">{fmtDataCurta(u.data_prevista_entrega)}</td>
                        {verValores && <td className="acn-ats-rl-td val">{fmtBRL(u.valor_total)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal de Detalhes da OPL ────────────────────────────────────────────────
export function OplDetalheModal({ opl: oplProp, onClose, currentUser }: { opl: any; onClose: () => void; currentUser?: any }) {
  const [opl, setOpl]       = useState<any>(oplProp);
  const [logs, setLogs]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const [comprasVinculadas, setComprasVinculadas] = useState<any[]>([]);
  const [erroCompras, setErroCompras] = useState('');
  // 7.x (15/10/2026): releitura da OP e do histórico que falham aparecem; antes a tela ficava com a linha velha da lista ou com "Nenhum registro de movimentação"
  const [erroOpl, setErroOpl] = useState('');
  const [erroLogs, setErroLogs] = useState('');
  const liberandoRef = useRef(false);
  // Seriais dos itens instalados, registrados pelo CQ na auditoria aprovada mais recente (pedido do usuário em 07/10/2026) — migração cq_seriais_dos_itens_instalados
  const [seriaisCq, setSeriaisCq] = useState<any>(null);
  const [erroSeriaisCq, setErroSeriaisCq] = useState('');
  const [historicoAberto, setHistoricoAberto] = useState(false);
  /**
   * A OP é lida do banco toda vez que o modal abre (28/09/2026).
   *
   * A lista que abre este modal foi carregada uma vez e não sabe do que foi
   * gravado depois — nem por outro setor, nem pela própria pessoa num acesso
   * anterior. Como o modal desmonta ao fechar, reabrir remontava com a linha
   * velha da lista e mostrava o valor antigo.
   *
   * Foi exatamente o que aconteceu na OP 1668: a origem da venda foi salva
   * três vezes seguidas porque, a cada reabertura, a tela dizia "não
   * informada". Estava gravado no banco todas as vezes; quem estava usando é
   * que não tinha como saber.
   *
   * A prop continua servindo para o primeiro desenho, sem piscar a tela.
   */
  const recarregarOpl = async () => {
    if (!oplProp?.id) return;
    const { data, error } = await supabase.from('oples').select('*').eq('id', oplProp.id).maybeSingle();
    setErroOpl(error ? error.message : '');
    if (data) setOpl(data);
  };
  useEffect(() => { setOpl(oplProp); recarregarOpl(); }, [oplProp?.id]);

  // Pedidos de compra ligados a esta OP — por vínculo direto (oportunidade_id,
  // quando a compra nasceu com vínculo real) ou por número da OP em texto
  // (opl não tem FK pra oples — ver VinculoPicker.tsx/plano de navegação cruzada).
  useEffect(() => {
    if (!opl?.opl && !opl?.crm_oportunidade_id) { setComprasVinculadas([]); return; }
    const filtros = [
      opl?.opl ? `opl.eq.${opl.opl}` : null,
      opl?.crm_oportunidade_id ? `oportunidade_id.eq.${opl.crm_oportunidade_id}` : null,
    ].filter(Boolean).join(',');
    if (!filtros) { setComprasVinculadas([]); return; }
    // Pedido do usuário em 07/10/2026: o status da compra e a previsão de chegada da mercadoria aparecem dentro do card da OP (a previsão é a data_prevista_recebimento que o Compras preenche).
    supabase.from('pcp_pedidos_compra').select('id,numero_pedido,descricao_material,status_compra,valor_compra,data_prevista_recebimento')
      .or(filtros).order('data_criacao', { ascending: false })
      .then(({ data, error }) => {
        // leitura que falha não pode parecer "sem compras vinculadas"
        setErroCompras(error ? error.message : '');
        if (!error) setComprasVinculadas(data || []);
      });
  }, [opl?.id, opl?.opl, opl?.crm_oportunidade_id]);

  useEffect(() => {
    if (!opl?.id) { setSeriaisCq(null); return; }
    let vivo = true;
    supabase.from('cq_auditorias').select('seriais_instalados, data_auditoria, auditor_nome').eq('opl_id', opl.id).eq('resultado', 'Aprovado')
      .not('seriais_instalados', 'is', null).order('data_auditoria', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (!vivo) return; setErroSeriaisCq(error ? error.message : ''); if (!error) setSeriaisCq((data || [])[0] || null); });
    return () => { vivo = false; };
  }, [opl?.id]);

  // A ficha do veículo do catálogo (marca, nome e faixa de anos) — a OP guarda só o código dela.
  // Lida por id, e não pela lista de fichas ativas, para aparecer mesmo se a ficha for desativada.
  const [fichaVeiculo, setFichaVeiculo] = useState<any>(null);
  useEffect(() => {
    if (!opl?.veiculo_id) { setFichaVeiculo(null); return; }
    let vivo = true;
    supabase.from('veiculos').select('*').eq('id', opl.veiculo_id).maybeSingle()
      .then(({ data }) => { if (vivo) setFichaVeiculo(data || null); });
    return () => { vivo = false; };
  }, [opl?.veiculo_id]);

  // Auditoria/colaboração (infra global — ver AuditSystem.tsx): este é o modal
  // de "👁 Ver" reutilizado por praticamente todos os módulos (Engenharia, PCP,
  // Almoxarifado, Produção, Comercial/CRM...) — instrumentar aqui uma vez cobre
  // o destaque visual em todos eles de uma vez, sem duplicar por módulo. Cada
  // módulo ainda precisa chamar logChange() nos próprios pontos de gravação
  // (rollout em andamento) — aqui só cobre a gravação que este modal faz.
  const { campoDestaque, marcarComoLido } = useFieldHighlight('oples', opl?.id, currentUser);
  const fecharEMarcarLido = () => { marcarComoLido(); onClose(); };

  // Nem toda tela que abre este modal passa currentUser — cai na sessão salva.
  const usuario = currentUser || (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const podeTrocarNumero = podeAlterarNumeroOplPv(usuario);
  // Admin/Gerente: todos os campos e valores da OP (inclusive status), uma ou o lote
  const podeEditarTudo = podeEditarOplCompleta(usuario);
  // Itens vendidos: o Comercial ajusta até o PCP fechar a BOM (era a Engenharia até a Etapa 18, de 13/10/2026); depois só Admin/Gerente
  const perfilComercial = /comercial|crm|licita/i.test(String(usuario?.perfil || ''));
  const podeEditarVendido = podeEditarTudo || (opl?.status_bom !== 'BOM Liberado'
    && (perfilComercial || (!!usuario?.nome && usuario.nome === opl?.responsavel_comercial)));
  const [editandoVendido, setEditandoVendido] = useState<any[] | null>(null);
  // 7.x (15/10/2026): a alteração já foi gravada; se o registro dela no histórico falhar, a pessoa precisa saber (antes ficava sem rastro e sem aviso)
  const registrarNoHistorico = async (registro: any) => {
    const { error } = await supabase.from('logs_movimentacao_opl').insert([registro]);
    if (error) alert('A alteração foi salva, mas não ficou registrada no histórico da OP: ' + error.message);
  };
  // "Esta alteração vale para" (16/10/2026): só esta unidade (padrão) ou o lote inteiro — os itens vendidos valem por carro e costumam ser iguais em todos
  const [escopoVendido, setEscopoVendido] = useState<'unidade' | 'lote'>('unidade');
  const salvarVendido = async () => {
    const itens = itensPreenchidos(editandoVendido || []);
    if (!itens.length) { alert('A OP precisa de pelo menos 1 item vendido.'); return; }
    const noLote = escopoVendido === 'lote' && qtdLote > 1;
    if (noLote && !await confirmar(`Aplicar estes itens vendidos nas ${qtdLote} unidades do lote?\n\n${itens.map((v: any) => `• ${v.quantidade}× ${v.nome}`).join('\n')}\n\nCada unidade fica com esta lista (por carro). Unidade já faturada ou cancelada não é mexida.`)) return;
    const { error } = await supabase.from('oples').update({ itens_vendidos: itens }).eq('id', opl.id);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    await registrarNoHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: usuario?.perfil || 'Comercial',
      evento: `Itens vendidos alterados: ${itens.map((v: any) => `${v.quantidade}× ${v.nome}`).join('; ')}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: usuario?.nome || null, usuario_email: usuario?.email || null, data_hora: new Date().toISOString(),
    });
    if (noLote) {
      const r = await aplicarNoLote({ op: opl, mudados: { itens_vendidos: itens }, usuario, ehGerente: podeEditarTudo, origem: 'Itens vendidos alterados (vale para o lote inteiro)' });
      const outras = r.erroLeitura ? 0 : (r.atualizadas.length + r.iguais + r.puladas.length + r.falhas.length);
      alert(textoDoResultadoLote(r, outras));
    }
    setEscopoVendido('unidade');
    setEditandoVendido(null);
    await recarregarOpl();      // mostra o que ficou gravado, não o que eu achei que gravei
    recarregarLogs();
  };
  const [editando, setEditando] = useState(false);
  const [verDossie, setVerDossie] = useState(false);
  const [editandoLote, setEditandoLote] = useState<any[] | null>(null);
  const recarregarLogs = () => supabase.from('logs_movimentacao_opl').select('*').eq('opl_id', opl.id)
    .order('data_hora', { ascending: false }).limit(50).then(({ data, error }) => { setErroLogs(error ? error.message : ''); if (!error) setLogs(data || []); setLoading(false); });
  const abrirEdicaoLote = async () => {
    const lote = await lerUnidadesDoLote(opl.opl);
    if (lote.erro) { alert('Não foi possível ler as unidades do lote: ' + lote.erro); return; }
    const ids = lote.lista.map((u: any) => u.id);
    if (!ids.length) return;
    const { data, error: erroLote } = await supabase.from('oples').select('*').in('id', ids);
    if (erroLote) { alert('Não foi possível ler as unidades do lote: ' + erroLote.message); return; }
    setEditandoLote([...(data || [])].sort((a: any, b: any) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true })));
  };

  // Lote: só mostra o "Resumo do lote" se houver unidades /NN desta base
  const [qtdLote, setQtdLote] = useState(0);
  const [verResumoLote, setVerResumoLote] = useState(false);
  const [abrirLote, setAbrirLote] = useState(false);   // a janela do lote inteiro (OpLote.tsx), aberta do detalhe de uma unidade
  useEffect(() => {
    if (!opl?.opl) { setQtdLote(0); return; }
    buscarUnidadesDoLote(opl.opl).then(u => setQtdLote(u.length));
  }, [opl?.opl]);

  // Origem da venda (Licitação / Venda direta) — completar nas OPs antigas
  const trocarOrigem = async (nova: string) => {
    if (!nova || nova === opl.origem_venda) return;
    const { error } = await supabase.from('oples').update({ origem_venda: nova }).eq('id', opl.id);
    if (error) { alert('Erro ao salvar a origem: ' + error.message); return; }
    const antes = origemInfo(opl.origem_venda)?.label || 'não informada';
    const depois = origemInfo(nova)?.label || nova;
    await registrarNoHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: usuario?.perfil || 'Comercial',
      evento: `Origem da venda: ${antes} → ${depois}.`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: usuario?.nome || usuario?.email || '—', usuario_email: usuario?.email || null,
      data_hora: new Date().toISOString(),
    });
    await recarregarOpl();
    recarregarLogs();
  };
  const trocarNumero = async () => {
    const novo = await renomearOpl(opl, usuario);
    if (novo) setOpl((o: any) => ({ ...o, opl: novo }));   // o efeito dos logs recarrega pelo opl.opl
  };

  useEffect(() => {
    if (!opl?.id) return;
    setLoading(true);
    recarregarLogs();
  }, [opl?.id, opl?.opl]);

  // ── Liberar OP para o Fiscal emitir NF ──────────────────────────────────
  // Os números de série agora são informados pelo Almoxarifado no kiting
  // (antes de liberar para o PCP), não mais aqui — o Comercial só confirma
  // a liberação e dispara o email automático ao Fiscal com os dados da OP/OS.
  const confirmarLiberarParaFiscal = async () => {
    // 7.x (15/10/2026): dois cliques seguidos gravavam duas vezes (duas linhas no histórico e dois e-mails) — o botão só desabilitava depois de redesenhar
    if (liberandoRef.current) return;
    liberandoRef.current = true;
    try { await liberarParaFiscal(); } finally { liberandoRef.current = false; }
  };
  const liberarParaFiscal = async () => {
    setLiberando(true);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('oples').update({
      status_geral: 'Aguarda Emissao NF',
      data_liberacao_comercial: agora,
    }).eq('id', opl.id);
    if (error) { alert('Erro ao liberar: ' + error.message); setLiberando(false); return; }
    await registrarNoHistorico({
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial',
      evento: 'OP liberada para emissão de NF pelo Fiscal.',
      status_anterior: opl.status_geral, status_novo: 'Aguarda Emissao NF',
      usuario_nome: currentUser?.nome || null, data_hora: agora,
    });
    logChange({ module: 'comercial', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: 'Aguarda Emissao NF' }, user: currentUser });
    // Atualiza status local sem fechar o modal
    setOpl((o: any) => ({ ...o, status_geral: 'Aguarda Emissao NF' }));
    setLogs(prev => [{
      id: 'tmp', setor: 'Comercial', evento: 'OP liberada para emissão de NF pelo Fiscal.',
      status_anterior: opl.status_geral, status_novo: 'Aguarda Emissao NF',
      usuario_nome: currentUser?.nome || '—', data_hora: agora,
    }, ...prev]);
    setLiberando(false);

    // Email automático ao Fiscal — não bloqueia a liberação se falhar
    try {
      const { data: cfgRows } = await supabase.from('configuracoes_sistema')
        .select('valor').eq('chave', 'email_fiscal_destino').maybeSingle();
      const destino = cfgRows?.valor || 'fiscal@acn.com.br';
      const fmtDtBr = (d: any) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const html = `
        <h2>OP/OS liberada para emissão de NF</h2>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><strong>Número OP/OS</strong></td><td>${opl.opl}</td></tr>
          <tr><td><strong>Cliente</strong></td><td>${opl.cliente_nome || '—'}</td></tr>
          <tr><td><strong>Data de Entrega Prevista</strong></td><td>${fmtDtBr(opl.data_prevista_entrega)}</td></tr>
          <tr><td><strong>Números de Série</strong></td><td>${(opl.seriais_equipamentos || '—').replace(/\n/g, '<br>')}</td></tr>
          <tr><td><strong>Valor Total</strong></td><td>${opl.valor_total != null ? `R$ ${Number(opl.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td></tr>
          <tr><td><strong>Liberado por</strong></td><td>${currentUser?.nome || '—'}</td></tr>
        </table>
        <p>Esta OP/OS está pronta para emissão da Nota Fiscal.</p>`;
      const { data, error: fnError } = await supabase.functions.invoke('send-email', {
        body: { to: destino, subject: `OP/OS ${opl.opl} liberada para emissão de NF`, html },
      });
      if (fnError || data?.error) {
        console.warn('Falha ao enviar email ao Fiscal:', fnError || data?.error);
        avisarEmailDoFiscal(fnError?.message || data?.error);
      }
    } catch (e) {
      console.warn('Falha ao enviar email ao Fiscal:', e);
      avisarEmailDoFiscal((e as any)?.message || e);
    }
  };
  // 7.x (15/10/2026): o e-mail não bloqueia a liberação, mas a falha dele não pode passar em branco (só ia para o console do navegador e o Fiscal nunca era avisado)
  const avisarEmailDoFiscal = (motivo: any) => alert(`A OP foi liberada, mas o e-mail automático ao Fiscal não foi enviado (${String(motivo || 'sem detalhe')}). Avise o Fiscal por outro meio.`);

  // Só colunas do tipo date (entrada, recebimento do veículo, previsão, prazos, aceite): o dia vem do texto (R16, 05/10/2026).
  // Antes era `new Date(d)`, que mostrava o dia anterior em 95 de 95 datas conferidas com o banco.
  const fmtDt  = (d: any) => diaBR(d);
  const fmtDtH = (d: any) => d
    ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const fmtR$ = (v: any) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

  // Campo depende de campoDestaque (vem do hook useFieldHighlight), entao nao
  // da pra subir pro escopo de modulo como o Sec. O useMemo resolve o mesmo
  // problema: mantem a MESMA identidade de componente entre renders, senao o
  // React trataria cada render como um tipo novo e remontaria os 30 campos do
  // modal a cada mudanca de estado. campoDestaque ja e estavel (useCallback).
  const Campo = useMemo(() =>
    ({ label, value, full = false, field }: { label: string; value: any; full?: boolean; field?: string }) =>
      value != null && value !== '' && value !== false ? (
        <div className={'acn-opl-campo' + (full ? ' cheio' : '')} style={field ? campoDestaque(field) : undefined}>
          <div className="acn-opl-rot">{label}</div>
          <div className="acn-opl-val">{String(value)}</div>
        </div>
      ) : null,
  [campoDestaque]);

  const temServTerceiro = !!opl.servico_terceiro;
  // Suporte a múltiplos tipos (novo) e fallback ao campo único (legado)
  const tiposServ: string[] = Array.isArray(opl.tipos_servico_terceiro) && opl.tipos_servico_terceiro.length
    ? opl.tipos_servico_terceiro
    : (opl.tipo_servico_terceiro ? [opl.tipo_servico_terceiro] : []);
  const obsServTerceiro = opl.obs_servico_terceiro || '';

  // ── Prazos: a lista de datas da OP, com a previsão de entrega em vermelho se já passou e a OP ainda não terminou ──
  const previsaoEntrega = String(opl.data_prevista_entrega || '').slice(0, 10);
  const entregaAtrasada = !!previsaoEntrega && previsaoEntrega < hojeISO() && !['Faturado', 'Cancelado'].includes(opl.status_geral);
  const prazo = (label: string, valor: any, field: string, alerta = false) => {
    const v = fmtDt(valor);
    if (!valor || v === '—') return null;
    return (
      <div className={'acn-opl-prazo' + (alerta ? ' atrasado' : '')} style={campoDestaque(field)}>
        <span className="acn-opl-rot">{label}</span><span className="acn-opl-val">{v}{alerta ? ' · atrasada' : ''}</span>
      </div>
    );
  };
  const mostrarFinanceiro = opl.valor_total != null || opl.valor_mao_de_obra != null || opl.valor_mao_de_obra_serralheria != null;
  const mostrarFaturamento = !!(opl.cnpj_faturamento || opl.razao_social_faturamento || opl.centro_custo || opl.observacoes_faturamento);
  const logsVisiveis = historicoAberto ? logs : logs.slice(0, 5);
  const fatos = [opl.cliente_nome, opl.modelo || opl.veiculo, opl.quantidade ? `${opl.quantidade} ${soEnvio(opl.fluxo_entrega) ? 'un' : 'veíc.'}` : null].filter(Boolean);

  return (
    <div className="acn-opl-overlay">
      {abrirLote && (
        <Suspense fallback={null}>
          <ModalLote base={baseDoLote(opl.opl)} currentUser={usuario} onClose={() => setAbrirLote(false)} />
        </Suspense>
      )}
      {verResumoLote && <ResumoLoteModal opl={opl.opl} onClose={() => setVerResumoLote(false)} verValores={podeVerValores(usuario)} />}
      {editando && (
        <ModalEditarOpl opl={opl} currentUser={usuario} onClose={() => setEditando(false)}
          onSalvo={(nova: any) => { setOpl(nova); setEditando(false); recarregarLogs(); }} />
      )}
      {editandoLote && (
        <ModalEditarOplLote ops={editandoLote} currentUser={usuario} onClose={() => setEditandoLote(null)}
          onSalvo={async () => {
            setEditandoLote(null);
            const { data } = await supabase.from('oples').select('*').eq('id', opl.id).maybeSingle();
            if (data) setOpl(data);
            recarregarLogs();
          }} />
      )}
      {verDossie && (
        <Suspense fallback={null}>
          <ModalDossieOp op={opl} onClose={() => setVerDossie(false)} />
        </Suspense>
      )}
      <div className="acn-opl" role="dialog" aria-label={`OP ${opl.opl}`}>

        {/* ── Cabeçalho: quem é a OP, o essencial em uma linha, o status e as ações agrupadas ── */}
        <header className="acn-opl-cab">
          <div className="acn-opl-cab-txt">
            <div className="acn-opl-cab-sup">{opl.faturamento_empresa || 'ACN'} · {opl.tipo_projeto || 'OP'}</div>
            <div className="acn-opl-cab-tit">
              <span>OP {opl.opl}</span>
              <OrigemVendaBadge origem={opl.origem_venda} />
              <Selo status={opl.status_geral || 'Sem status'} />
            </div>
            {fatos.length > 0 && <div className="acn-opl-cab-fatos">{fatos.join(' · ')}{previsaoEntrega && <span className={entregaAtrasada ? 'acn-txt-erro' : undefined}> · entrega {fmtDt(opl.data_prevista_entrega)}{entregaAtrasada ? ' (atrasada)' : ''}</span>}</div>}
          </div>
          <div className="acn-opl-cab-acoes">
            <Botao variante="primario" icone={mdiBookOpenPageVariantOutline} onClick={() => setVerDossie(true)}
              title="Tudo que está ligado a esta OP: demandas, compras, frete, engenharia, qualidade e linha do tempo — com PDF">Dossiê</Botao>
            <MenuAcoes rotulo="Mais ações da OP" itens={[
              { rotulo: 'Editar OP', icone: mdiPencilOutline, onClick: () => setEditando(true), oculto: !podeEditarTudo },
              { rotulo: 'Editar lote', icone: mdiPencilBoxMultipleOutline, onClick: abrirEdicaoLote, oculto: !(podeEditarTudo && qtdLote > 1) },
              { rotulo: `Abrir o lote (${qtdLote})`, icone: mdiLinkVariant, onClick: () => setAbrirLote(true), oculto: qtdLote <= 1 },
              { rotulo: `Resumo do lote (${qtdLote})`, icone: mdiFormatListNumbered, onClick: () => setVerResumoLote(true), oculto: qtdLote <= 1 },
              { rotulo: 'Alterar o número da OP', icone: mdiPencilOutline, onClick: trocarNumero, oculto: !podeTrocarNumero },
            ]} />
            <button type="button" className="acn-opl-x" onClick={fecharEMarcarLido} aria-label="Fechar" title="Fechar"><Icone path={mdiClose} size={20} /></button>
          </div>
        </header>

        <div className="acn-opl-corpo">
        {/* ── Situação: onde está agora, o andamento e o que pede ação (rola junto com o resto; o cabeçalho é que fica fixo) ── */}
        <div className="acn-opl-situacao">
          {erroOpl && <div className="acn-opl-aviso erro">Não foi possível atualizar os dados desta OP ({erroOpl}). Estão aparecendo os da lista, que podem estar desatualizados.</div>}
          <OndeEstaAgoraAuto op={opl} onAbrirDossie={() => setVerDossie(true)} />
          {opl.status_geral !== 'Cancelado' && <OplProgressBar status={opl.status_geral} op={opl} />}

          {/* LIBERAR PARA FISCAL (aparece automaticamente quando aguardando) */}
          {aguardaLiberacaoComercial(opl.status_geral) && (
            <div className="acn-opl-aviso ok">
              <div className="acn-opl-aviso-txt">
                {/* "Aprovado pelo CQ" só quando passou pelo CQ: OP de envio não passa (Etapa 5.1, 29/09/2026) */}
                <strong>✅ {opl.resultado_cq === 'Aprovado' ? 'APROVADO PELO CQ — ' : ''}AGUARDANDO LIBERAÇÃO COMERCIAL</strong>
                <span>Esta OP está pronta. Libere para o Fiscal emitir a Nota Fiscal.</span>
                {!opl.seriais_equipamentos && <span className="acn-txt-atencao">⚠️ Números de série ainda não informados pelo Almoxarifado no kiting.</span>}
              </div>
              <Botao variante="primario" onClick={confirmarLiberarParaFiscal} disabled={liberando}>{liberando ? 'Liberando...' : '🟡 LIBERAR PARA FISCAL'}</Botao>
            </div>
          )}

          {/* Alerta serviço de terceiro */}
          {temServTerceiro && (
            <div className="acn-opl-aviso atencao">
              <span className="acn-opl-aviso-ico">⚠️</span>
              <div className="acn-opl-aviso-txt">
                <strong>NECESSITA SERVIÇO DE TERCEIRO</strong>
                <span className="acn-opl-chips">{tiposServ.map(t => <span key={t} className="acn-opl-chip">{t}</span>)}</span>
                {obsServTerceiro && <span>Obs: {obsServTerceiro}</span>}
              </div>
            </div>
          )}
        </div>

          {/* ═════════ Coluna principal: o que é e o que tem que ser feito ═════════ */}
          <div className="acn-opl-col">

            {/* ── Itens: vendido × BOM × separado, fotos de chegada e seriais ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>📦 Itens da OP — vendido × BOM × separado no kit</span></header>
              <div className="acn-opl-card-corpo">
                {editandoVendido ? (
                  <div>
                    <SeletorEscopo opl={opl.opl} tamanho={qtdLote} valor={escopoVendido} onChange={setEscopoVendido} />
                    <ItensVendidosEditor itens={editandoVendido} onChange={setEditandoVendido} crmId={opl.crm_oportunidade_id || null} unidades={qtdLote > 1 ? qtdLote : 1} />
                    <div className="acn-opl-botoes">
                      <Botao variante="primario" onClick={salvarVendido}>{escopoVendido === 'lote' && qtdLote > 1 ? `Salvar nas ${qtdLote} unidades` : 'Salvar itens vendidos'}</Botao>
                      <Botao onClick={() => { setEscopoVendido('unidade'); setEditandoVendido(null); }}>Cancelar</Botao>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Como o carro chegou — tirado na abertura da OP. É o que resolve discussão de avaria no fim do serviço (28/09/2026). */}
                    {(opl.fotos_veiculo || []).length > 0 && (
                      <div className="acn-opl-bloco">
                        <div className="acn-opl-rot">📷 Como o carro chegou ({opl.fotos_veiculo.length})</div>
                        <FotosVeiculoVer fotos={opl.fotos_veiculo} tamanho={72} />
                      </div>
                    )}
                    <QuadroItensOp opl={opl} />
                    {!(opl.itens_vendidos || []).length && !(opl.bom_itens || []).length && (
                      <div className="acn-ajuda">Sem itens vendidos nem BOM registrados.</div>
                    )}
                    {podeEditarVendido && (
                      <div className="acn-opl-botoes">
                        <Botao pequeno icone={mdiPencilOutline} onClick={() => setEditandoVendido((opl.itens_vendidos || []).length ? opl.itens_vendidos : [])}>
                          {(opl.itens_vendidos || []).length ? 'Editar itens vendidos' : 'Informar itens vendidos'}
                        </Botao>
                      </div>
                    )}
                  </>
                )}

                {/* Seriais de Equipamentos (informados pelo Almoxarifado no kiting) */}
                {opl.seriais_equipamentos && (
                  <div className="acn-opl-bloco">
                    <div className="acn-opl-rot">🔢 Seriais dos equipamentos (Almoxarifado)</div>
                    <div className="acn-opl-texto azul"><Linkify text={opl.seriais_equipamentos} /></div>
                  </div>
                )}

                {/* Seriais dos itens instalados (informados pelo CQ na auditoria aprovada) */}
                {erroSeriaisCq && <div className="acn-opl-aviso erro">Não foi possível ler os seriais do CQ ({erroSeriaisCq}).</div>}
                {seriaisCq && Array.isArray(seriaisCq.seriais_instalados) && seriaisCq.seriais_instalados.length > 0 && (
                  <div className="acn-opl-bloco">
                    <div className="acn-opl-rot">🔎 Seriais dos itens instalados (CQ · {seriaisCq.auditor_nome || '—'} · {fmtDtH(seriaisCq.data_auditoria)})</div>
                    <table className="acn-opl-tab">
                      <thead><tr><th>Item</th><th>Qtd</th><th>Seriais</th></tr></thead>
                      <tbody>
                        {seriaisCq.seriais_instalados.map((s: any, k: number) => (
                          <tr key={k}>
                            <td>{s.item}</td><td>{s.quantidade}</td>
                            <td>{s.sem_serial ? <span className="acn-fraco">sem serial — {s.motivo || 'sem motivo'}</span> : (s.seriais || []).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* ── Compras ligadas a esta OP: material que vai chegar ── */}
            {erroCompras && <div className="acn-opl-aviso erro">Não foi possível ler as compras vinculadas ({erroCompras}). Isso não quer dizer que não existam.</div>}
            {comprasVinculadas.length > 0 && (
              <section className="acn-opl-card">
                <header className="acn-opl-card-cab"><span>🛒 Compras vinculadas ({comprasVinculadas.length})</span></header>
                <div className="acn-opl-card-corpo acn-opl-compras">
                  {comprasVinculadas.map(c => (
                    <button key={c.id} type="button" className="acn-opl-compra" onClick={() => abrirVinculo({ tipo: 'compra', id: c.id, descricao: c.numero_pedido })}>
                      <span className="acn-opl-compra-nome">🔗 {c.numero_pedido} — {c.descricao_material}</span>
                      <span className="acn-opl-compra-meta">
                        {currentUser?.ver_valores !== false && c.valor_compra != null && <span className="acn-txt-ok">{fmtR$(c.valor_compra)}</span>}
                        {(() => {
                          // Recebida ou descartada não tem mais "chegada" a esperar; nas demais, a previsão vira data (vermelha se já passou) ou "sem previsão"
                          const encerrada = c.status_compra === 'Recebido' || c.status_compra === 'Descartada';
                          if (encerrada) return null;
                          const prev = c.data_prevista_recebimento ? String(c.data_prevista_recebimento).slice(0, 10) : '';
                          const atrasada = !!prev && prev < hojeISO();
                          return (
                            <span title="Previsão de chegada da mercadoria" className={!prev ? 'acn-fraco' : atrasada ? 'acn-txt-erro' : undefined}>
                              {prev ? `Chega ${prev.split('-').reverse().join('/')}${atrasada ? ' (atrasada)' : ''}` : 'sem previsão'}
                            </span>
                          );
                        })()}
                        <Selo status={c.status_compra} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── O que fazer e como: serviços, especificações e observações ── */}
            {(opl.resumo_servicos || opl.especificacoes || opl.observacoes_comercial || opl.observacoes || opl.observacoes_atencao) && (
              <section className="acn-opl-card">
                <header className="acn-opl-card-cab"><span>🔧 Serviços, especificações e observações</span></header>
                <div className="acn-opl-card-corpo">
                  {opl.observacoes_atencao && (
                    <div className="acn-opl-bloco"><div className="acn-opl-rot acn-txt-erro">⚠️ Atenção</div><div className="acn-opl-texto vermelho"><Linkify text={opl.observacoes_atencao} /></div></div>
                  )}
                  {opl.resumo_servicos && (
                    <div className="acn-opl-bloco"><div className="acn-opl-rot">🔧 Resumo dos serviços a serem executados</div><div className="acn-opl-texto verde"><Linkify text={opl.resumo_servicos} /></div></div>
                  )}
                  {opl.especificacoes && (
                    <div className="acn-opl-bloco"><div className="acn-opl-rot">📐 Especificações</div><div className="acn-opl-texto"><Linkify text={opl.especificacoes} /></div></div>
                  )}
                  {opl.observacoes_comercial && (
                    <div className="acn-opl-bloco"><div className="acn-opl-rot">Observações comerciais</div><div className="acn-opl-texto"><Linkify text={opl.observacoes_comercial} /></div></div>
                  )}
                  {opl.observacoes && (
                    <div className="acn-opl-bloco"><div className="acn-opl-rot">Observações gerais</div><div className="acn-opl-texto"><Linkify text={opl.observacoes} /></div></div>
                  )}
                </div>
              </section>
            )}

            {/* ── Documentos anexados ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>📎 Documentos anexados</span></header>
              <div className="acn-opl-card-corpo"><AnexosOPSection oplId={opl.id} /></div>
            </section>

            {/* ── Histórico de movimentações: as 5 últimas à vista, o resto sob demanda ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab">
                <span>📋 Histórico de movimentações{logs.length ? ` (${logs.length})` : ''}</span>
                {logs.length > 5 && <Botao pequeno variante="discreto" onClick={() => setHistoricoAberto(v => !v)}>{historicoAberto ? 'Mostrar só as últimas 5' : `Ver todas (${logs.length})`}</Botao>}
              </header>
              <div className="acn-opl-card-corpo">
                {loading ? (
                  <div className="acn-ajuda acn-centro">Carregando...</div>
                ) : erroLogs ? (
                  <div className="acn-opl-aviso erro">Não foi possível ler o histórico de movimentações ({erroLogs}). Isso não quer dizer que não exista.</div>
                ) : logs.length === 0 ? (
                  <div className="acn-ajuda acn-centro">Nenhum registro de movimentação.</div>
                ) : (
                  <table className="acn-opl-tab">
                    <thead><tr><th>Data/Hora</th><th>Setor</th><th>Evento</th><th>Operador</th></tr></thead>
                    <tbody>
                      {logsVisiveis.map((l, k) => (
                        <tr key={l.id || k}>
                          <td className="acn-opl-nowrap">{fmtDtH(l.data_hora)}</td>
                          <td>{l.setor || '—'}</td>
                          <td title={l.evento}>{l.evento || '—'}</td>
                          <td>{l.usuario_nome ? <span className="acn-opl-chip claro">{l.usuario_nome}</span> : <span className="acn-fraco">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          {/* ═════════ Coluna lateral: quem, quando, onde e quanto ═════════ */}
          <aside className="acn-opl-col lateral">

            {/* ── Identificação ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>🔍 Identificação</span></header>
              <div className="acn-opl-card-corpo acn-opl-campos">
                <Campo label="Número OP"         value={opl.opl} />
                <div className="acn-opl-campo">
                  <div className="acn-opl-rot">Origem da venda</div>
                  {podeEditarOrigem(usuario) ? (
                    <select className={'acn-input acn-opl-sel' + (opl.origem_venda ? '' : ' pendente')} value={opl.origem_venda || ''} onChange={e => trocarOrigem(e.target.value)}>
                      {!opl.origem_venda && <option value="">— informar —</option>}
                      {ORIGENS.map(o => <option key={o.valor} value={o.valor}>{o.emoji} {o.label}</option>)}
                    </select>
                  ) : (
                    <OrigemVendaBadge origem={opl.origem_venda} />
                  )}
                </div>
                <Campo label="Empresa"           value={opl.faturamento_empresa} />
                <Campo label="Tipo de Projeto"   value={opl.tipo_projeto} />
                <Campo label="Cliente"           value={opl.cliente_nome} full />
                <Campo label="Cliente final"     value={opl.cliente_final} field="cliente_final" />
                <Campo label="Vendedor"          value={opl.vendedor} field="vendedor" />
                <Campo label="Canal de venda"    value={opl.canal_venda} field="canal_venda" />
                <Campo label="Edital"            value={opl.edital} field="edital" />
                <Campo label="Nº da proposta"    value={opl.proposta} field="proposta" />
                {opl.crm_oportunidade_id && (
                  <div className="acn-opl-campo">
                    <div className="acn-opl-rot">Proposta</div>
                    <button type="button" className="acn-opl-link" onClick={() => abrirVinculo({ tipo: 'pv', id: opl.crm_oportunidade_id, descricao: opl.opl })}>🔗 Proposta CRM</button>
                  </div>
                )}
                <Campo label="NF-e (material)"   value={opl.numero_nf} />
                {opl.numero_nf_servico && <Campo label="NFS-e (serviço)" value={opl.numero_nf_servico} />}
                <Campo label="Criado por"        value={opl.criado_por_nome || opl.criado_por} />
                {/* a coluna é data_criacao; "criado_em" não existe em oples e o campo saía sempre vazio (29/09/2026) */}
                <Campo label="Cadastrado em"     value={fmtDtH(opl.data_criacao || opl.criado_em)} />
              </div>
            </section>

            {/* ── Prazos ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>📅 Prazos</span></header>
              <div className="acn-opl-card-corpo acn-opl-prazos">
                {prazo('Data de entrada', opl.data_entrada, 'data_entrada')}
                {prazo('Recebimento do veículo', opl.data_chegada_veiculo, 'data_chegada_veiculo')}
                {prazo('Aceite do cliente', opl.data_aceite_cliente, 'data_aceite_cliente')}
                {prazo('Prazo entrega produção', opl.prazo_entrega_producao, 'prazo_entrega_producao')}
                {prazo('Prazo entrega comercial', opl.prazo_entrega_comercial, 'prazo_entrega_comercial')}
                {prazo('Previsão de entrega', opl.data_prevista_entrega, 'data_prevista_entrega', entregaAtrasada)}
                {!opl.data_entrada && !opl.data_chegada_veiculo && !opl.data_aceite_cliente && !opl.prazo_entrega_producao && !opl.prazo_entrega_comercial && !opl.data_prevista_entrega && (
                  <div className="acn-ajuda">Nenhum prazo registrado.</div>
                )}
                <Campo label="🛡️ Prazo de Garantia" value={opl.prazo_garantia} field="prazo_garantia" />
              </div>
            </section>

            {/* ── Veículo (ou envio) e rota da entrega ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>{soEnvio(opl.fluxo_entrega) ? '📦 Envio' : '🚗 Veículo e entrega'}</span></header>
              <div className="acn-opl-card-corpo">
                {/* quem paga o frete só aparece em OP que sai daqui embalada */}
                {(terminaEmEnvio(opl.fluxo_entrega) || opl.tipo_projeto === TIPO_VENDA_ENVIO) && (
                  <div className="acn-opl-bloco"><SeloFrete o={opl} /></div>
                )}
                <div className="acn-opl-campos">
                  <Campo label="Veículo (catálogo)"        value={fichaVeiculo ? textoVeiculo(fichaVeiculo) : null} field="veiculo_id" full />
                  <Campo label="Modelo"                    value={opl.modelo} field="modelo" />
                  <Campo label="Chassi"                    value={opl.chassi} field="chassi" />
                  <Campo label="Placa"                     value={opl.placa} field="placa" />
                  <Campo label="Equipamento / Veículo"     value={opl.veiculo} field="veiculo" />
                  <Campo label="Local de instalação"       value={opl.local_instalacao} field="local_instalacao" />
                  <Campo label={soEnvio(opl.fluxo_entrega) ? "Quantidade" : "Qtd. Veículos"} value={opl.quantidade} field="quantidade" />
                  {/* Rota da entrega: fluxo, destino e frete (cadastrados na criação e na edição) */}
                  <Campo label="🚦 Fluxo de entrega"       value={opl.fluxo_entrega ? fluxoLabel(opl.fluxo_entrega) : null} field="fluxo_entrega" />
                  <Campo label="Cidade / UF de entrega"    value={[opl.destino_cidade, opl.destino_uf].filter(Boolean).join(' / ') || null} field="destino_cidade" />
                  <Campo label="CEP de entrega"            value={opl.destino_cep} field="destino_cep" />
                  <Campo label="🚚 Frete (CIF/FOB)"        value={opl.frete_responsavel} field="frete_responsavel" />
                  <Campo label="Observações do envio"      value={opl.envio_obs} field="envio_obs" full />
                </div>
              </div>
            </section>

            {/* ── Quem cuida: responsáveis, equipe e status por setor ── */}
            <section className="acn-opl-card">
              <header className="acn-opl-card-cab"><span>👥 Responsáveis e situação por setor</span></header>
              <div className="acn-opl-card-corpo">
                <div className="acn-opl-campos">
                  <Campo label="Comercial"    value={opl.responsavel_comercial || opl.criado_por_nome} field="responsavel_comercial" />
                  <Campo label="Engenharia"   value={opl.responsavel_engenharia} field="responsavel_engenharia" />
                  <Campo label="Almoxarifado" value={opl.responsavel_almox} field="responsavel_almox" />
                  <Campo label="Produção"     value={opl.responsavel_producao} field="responsavel_producao" />
                  <Campo label="Fiscal"       value={opl.responsavel_fiscal} field="responsavel_fiscal" />
                  <Campo label="Qualidade"    value={opl.responsavel_qualidade} field="responsavel_qualidade" />
                </div>
                <div className="acn-opl-campos acn-opl-status-setor">
                  <Campo label="Status geral" value={opl.status_geral} field="status_geral" />
                  <Campo label="Status BOM"   value={opl.status_bom} field="status_bom" />
                  <Campo label="Status Almox" value={opl.status_almox} field="status_almox" />
                </div>
                {/* Quem trabalhou na adaptação e na serralheria (30/09/2026): é o apontamento em que a comissão dos técnicos se apoia; pode ser corrigido daqui até o Fiscal faturar (ver EquipeDaOp.tsx). */}
                <div className="acn-opl-bloco"><div className="acn-opl-rot">🛠 Quem trabalhou na OP</div><EquipeDaOpResumo opl={opl} currentUser={usuario} /></div>
              </div>
            </section>

            {/* ── Dinheiro: valores e faturamento ── */}
            {(mostrarFinanceiro || mostrarFaturamento) && (
              <section className="acn-opl-card">
                <header className="acn-opl-card-cab"><span>💰 Financeiro e faturamento</span></header>
                <div className="acn-opl-card-corpo">
                  {mostrarFinanceiro && (currentUser?.ver_valores === false ? (
                    <div className="acn-opl-aviso neutro">🔒 Valores financeiros restritos — sem permissão de visualização.</div>
                  ) : (
                    <div className="acn-opl-campos">
                      <Campo label="Valor Total"            value={opl.valor_total != null ? fmtR$(opl.valor_total) : null} field="valor_total" />
                      <Campo label="Valor M.O."             value={opl.valor_mao_de_obra != null ? fmtR$(opl.valor_mao_de_obra) : null} field="valor_mao_de_obra" />
                      <Campo label="Valor M.O. Serralheria" value={opl.valor_mao_de_obra_serralheria != null ? fmtR$(opl.valor_mao_de_obra_serralheria) : null} field="valor_mao_de_obra_serralheria" />
                      <Campo label="Faturamento"            value={opl.faturamento_empresa} field="faturamento_empresa" />
                    </div>
                  ))}
                  {mostrarFaturamento && (
                    <div className="acn-opl-campos">
                      <Campo label="CNPJ / CPF de faturamento"   value={opl.cnpj_faturamento} field="cnpj_faturamento" />
                      <Campo label="Razão social de faturamento" value={opl.razao_social_faturamento} field="razao_social_faturamento" />
                      <Campo label="🏷️ Centro de custo"          value={opl.centro_custo} field="centro_custo" />
                      <Campo label="Observações de faturamento"  value={opl.observacoes_faturamento} field="observacoes_faturamento" full />
                    </div>
                  )}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Link Clicável de OPL ────────────────────────────────────────────────────
// Usar em qualquer lugar onde o número da OP aparece como texto.
// Recebe o objeto OPL completo OU apenas o número (string) — abre OplDetalheModal ao clicar.
// Quando recebe string, busca o objeto completo no banco ao clicar.
export function LinkOpl({ opl, currentUser, color, discreto = false }: { opl: any; currentUser?: any; color?: string; discreto?: boolean }) {
  const [open, setOpen]       = useState(false);
  const [fetched, setFetched] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  if (!opl) return null;
  const numero = typeof opl === 'string' ? opl : opl?.opl;
  const obj    = fetched || (typeof opl === 'object' ? opl : null);

  const handleClick = async (e: any) => {
    e.stopPropagation();
    if (obj) { setOpen(true); return; }
    // string-only: busca o objeto no banco
    if (!numero) return;
    setLoading(true);
    const { data, error } = await supabase.from('oples').select('*').eq('opl', numero).maybeSingle();
    setLoading(false);
    // 7.x (15/10/2026): clicar no número e não abrir nada, sem dizer por quê, deixava a pessoa sem saber se era erro ou se a OP não existia
    if (error) { alert(`Não foi possível abrir a OP ${numero}: ${error.message}`); return; }
    if (!data) { alert(`A OP ${numero} não foi encontrada.`); return; }
    setFetched(data); setOpen(true);
  };

  return (
    <>
      <span
        onClick={handleClick}
        className={'acn-ats-link' + (discreto ? ' discreto' : '') + (loading ? ' carregando' : '') + (String(numero || '').length <= 22 ? ' curto' : '')}
        style={color ? { color } : undefined}
        title="Abrir detalhes da OP"
      >
        {loading ? '...' : numero}
      </span>
      {open && obj && (
        <OplDetalheModal opl={obj} onClose={() => setOpen(false)} currentUser={currentUser} />
      )}
    </>
  );
}

// ─── Busca padrão de OPLs ─────────────────────────────────────────────────────
// Filtro comum: OPL, chassi, cliente, tipo_projeto
export function filtrarOpls(opls: any[], busca: string): any[] {
  if (!busca) return opls;
  return opls.filter(o => combinaBusca([o.opl, o.chassi, o.cliente_nome, o.tipo_projeto], busca));
}

// ─── Input de busca padrão ────────────────────────────────────────────────────
export function BuscaOplInput({ busca, setBusca }: { busca: string; setBusca: (v: string) => void }) {
  return (
    <div className="acn-ats-busca">
      <span className="acn-ats-busca-ic">🔍</span>
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar por OP, chassi, cliente ou projeto..."
        className="acn-ats-busca-campo"
      />
      {busca && (
        <Botao className="acn-ats-b acn-ats-busca-x" onClick={() => setBusca('')}>✕</Botao>
      )}
    </div>
  );
}

export function DemandaFooter({ setor }: { setor: string }) {
  return (
    <div className="acn-footer-setor">
      <span>Demandas Recebidas — <strong>{setor}</strong></span>
      <span>Mostrando demandas para este setor.</span>
    </div>
  );
}

// ─── Utilitários de horário comercial ────────────────────────────────────────
// Seg-Sex 08:00–17:45 (ver src/utils/horasUteis.ts — fonte única desse cálculo
// no sistema todo). Retorna segundos úteis decorridos desde `startISO`. Se
// `pausadoSince` informado, para de contar naquele instante. Subtrai
// `segundosPausados` acumulados.
function bhElapsed(
  startISO: string,
  segundosPausados: number = 0,
  pausadoSince: string | null = null,
): number {
  const fim = pausadoSince ? new Date(pausadoSince) : new Date();
  const totalSeg = Math.floor(horasUteis(startISO, fim) * 3600);
  return Math.max(0, totalSeg - segundosPausados);
}

function fmtHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function dentroHorarioComercial(): boolean {
  return dentroDoExpediente();
}

export function DemandasSetorWidget({ setor, cor, currentUser }: { setor: string; cor?: string; currentUser: any }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [modalIniciar, setModalIniciar] = useState<any>(null);
  const [modalObs, setModalObs] = useState<any>(null);
  const [modalVer, setModalVer] = useState<any>(null);
  const [modalAcomp, setModalAcomp] = useState<any>(null);   // OP acompanhamento
  const [responsavel, setResponsavel] = useState('');
  const [obsTexto, setObsTexto] = useState('');
  const [tick, setTick] = useState(0);
  // 7.x (15/10/2026): leitura da lista que falha aparece (antes a lista sumia ou ficava velha, sem aviso) e as gravações passam a conferir o erro
  const [erroDemandas, setErroDemandas] = useState('');
  const gravandoRef = useRef(false);

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(fetchDemandas, 30000);
    return () => clearInterval(t);
  }, [setor]);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Deep-link vindo do painel de Menções ("Demanda X" clicável) — abre o
  // detalhe da demanda em vez de só cair na aba do setor genérica.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'demanda') return;
      (window as any).__acnDeepLink = null;
      supabase.from('demandas_setoriais').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalVer(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const fetchDemandas = async () => {
    const { data, error } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('setor_destino', setor)
      .in('status', ['Pendente', 'Em Andamento'])
      .order('data_abertura', { ascending: false });
    // leitura que falha mantém a última lista lida e mostra a faixa; antes virava lista vazia e o quadro inteiro sumia
    if (error) { setErroDemandas(error.message); return; }
    setErroDemandas(''); setDemandas(data || []);
  };

  // Uma gravação por vez, e conferida: o clique duplo gravava o histórico em dobro, e a gravação recusada passava como feita.
  const exclusivo = async (fn: () => Promise<void>) => {
    if (gravandoRef.current) return;
    gravandoRef.current = true;
    try { await fn(); } finally { gravandoRef.current = false; }
  };
  const gravarDemanda = async (id: any, campos: any): Promise<boolean> => {
    const { error } = await supabase.from('demandas_setoriais').update(campos).eq('id', id);
    if (error) { alert('Não foi possível gravar: ' + error.message); return false; }
    return true;
  };
  // A linha de verdade, lida na hora de gravar: a da lista pode ter até 30 s e outra pessoa pode ter mexido nesse meio-tempo — gravar o histórico em cima da cópia velha apagava o que ela escreveu.
  // Se a releitura falhar, segue com a linha da lista (como era antes).
  const linhaAtual = async (d: any) => {
    const { data, error } = await supabase.from('demandas_setoriais').select('*').eq('id', d.id).maybeSingle();
    return !error && data ? data : d;
  };
  const mudouDeSituacao = (acao: string) => { alert(`Esta demanda já mudou de situação (outra pessoa mexeu nela). Não deu para ${acao}; a lista foi atualizada.`); fetchDemandas(); };

  const iniciar = () => exclusivo(async () => {
    if (!responsavel.trim()) { alert('Informe o responsavel!'); return; }
    const d = await linhaAtual(modalIniciar);
    if (d.status !== 'Pendente') { setModalIniciar(null); setResponsavel(''); mudouDeSituacao('iniciar'); return; }
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda || []), { texto: `Iniciado. Responsavel: ${responsavel}`, usuario: currentUser?.nome, hora: agora }];
    if (!await gravarDemanda(d.id, {
      status: 'Em Andamento', data_inicio: agora,
      responsavel_nome: responsavel, logs_demanda: logs,
      pausado: false, segundos_pausados: 0,
    })) return;     // a janela fica aberta para tentar de novo
    setModalIniciar(null); setResponsavel('');
    fetchDemandas();
  });

  const pausar = (d0: any) => exclusivo(async () => {
    const d = await linhaAtual(d0);
    if (d.status !== 'Em Andamento' || d.pausado) { mudouDeSituacao('pausar'); return; }
    const agora = new Date().toISOString();
    const logs = [...(d.logs_demanda || []), { texto: 'Atividade PAUSADA manualmente.', usuario: currentUser?.nome, hora: agora }];
    if (!await gravarDemanda(d.id, { pausado: true, data_pausa: agora, logs_demanda: logs })) return;
    fetchDemandas();
  });

  const retomar = (d0: any) => exclusivo(async () => {
    const d = await linhaAtual(d0);
    if (d.status !== 'Em Andamento' || !d.pausado) { mudouDeSituacao('retomar'); return; }
    const agora = new Date().toISOString();
    const tempoPausadoAgora = d.data_pausa
      ? Math.floor((new Date(agora).getTime() - new Date(d.data_pausa).getTime()) / 1000)
      : 0;
    const totalPausado = (d.segundos_pausados || 0) + tempoPausadoAgora;
    const logs = [...(d.logs_demanda || []), { texto: `Atividade RETOMADA. Pausa: ${fmtHMS(tempoPausadoAgora)}`, usuario: currentUser?.nome, hora: agora }];
    if (!await gravarDemanda(d.id, { pausado: false, data_pausa: null, segundos_pausados: totalPausado, logs_demanda: logs })) return;
    fetchDemandas();
  });

  const concluir = async (d: any) => {
    // Demanda que aponta para um item do cadastro vira saldo na prateleira, e
    // para isso precisamos saber quanto saiu da bancada de verdade — pediram 44
    // e o setor pode ter feito 40 porque acabou o fio. Demanda de texto livre
    // (desenvolvimento) não pergunta nada e segue como sempre foi.
    // Regra definida com o usuário em 25/09/2026.
    let produzida: number | null = null;
    if (d?.item_id) {
      const resposta = await pedirTexto(
        `Quanto foi produzido de verdade?\n\nPedido: ${d.quantidade || 0} ${d.unidade || 'un'}. ` +
        `Esta quantidade entra no estoque quando o Almoxarifado conferir.`,
        String(d.quantidade ?? ''));
      if (resposta === null) return;
      // mesma leitura do valor digitado da Nova OP: "1.000" é mil (antes virava 1), "12,5" é doze e meio, texto é recusado
      const lido = lerValorDigitado(resposta);
      if (!(lido.valor > 0)) { alert('Informe uma quantidade maior que zero.'); return; }     // em branco e ilegível voltam sem valor
      produzida = lido.valor;
    } else if (!await confirmar(`Concluir a demanda${d?.numero_opl ? ` da OP ${d.numero_opl}` : ''}? Ela sai da lista de pendentes.`)) {
      return;
    }
    await exclusivo(async () => {
      const f = await linhaAtual(d);
      if (f.status !== 'Em Andamento') { mudouDeSituacao('concluir'); return; }
      const agora = new Date().toISOString();
      const seg = f.data_inicio ? bhElapsed(f.data_inicio, f.segundos_pausados || 0, null) : 0;
      const tempo = seg / 3600;
      const logs = [...(f.logs_demanda || []), {
        texto: `Concluido. Tempo util: ${fmtHMS(seg)}`
          + (produzida != null ? ` Produzido: ${produzida} ${d.unidade || 'un'} (pedido: ${d.quantidade || 0}).` : ''),
        usuario: currentUser?.nome, hora: agora,
      }];
      const campos: any = {
        status: 'Concluido', data_conclusao: agora,
        tempo_execucao_horas: tempo, logs_demanda: logs,
      };
      if (produzida != null) campos.quantidade_produzida = produzida;
      // o aviso de "concluída com N" só sai se a gravação deu certo (antes saía mesmo com a gravação recusada)
      if (!await gravarDemanda(f.id, campos)) return;
      if (produzida != null) {
        alert(`Demanda concluída com ${produzida} ${d.unidade || 'un'}. ` +
          `O estoque sobe quando o Almoxarifado conferir o recebimento.`);
      }
      fetchDemandas();
    });
  };

  const salvarObs = () => exclusivo(async () => {
    if (!obsTexto.trim()) return;
    const d = await linhaAtual(modalObs);
    const logs = [...(d.logs_demanda || []), { texto: obsTexto, usuario: currentUser?.nome, hora: new Date().toISOString() }];
    if (!await gravarDemanda(d.id, { observacoes_execucao: obsTexto, logs_demanda: logs })) return;     // a janela e o texto ficam para tentar de novo
    // Salva @menções da observação
    await salvarMencoes({
      texto:             obsTexto,
      mencionanteId:     String(currentUser?.id || ''),
      mencionanteNome:   currentUser?.nome || 'Sistema',
      contexto:          'demanda',
      contextoId:        String(d.id),
      contextoDescricao: `Demanda ${setor}: ${(d.descricao || '').replace('[AJUSTE] ','').slice(0,50)}`,
      campo:             'observacoes_execucao',
      abaDestino:        setor.toLowerCase().replace('ção','cao').replace('ística','istica'),
    });
    setObsTexto(''); setModalObs(null);
    fetchDemandas();
  });

  const fora = !dentroHorarioComercial();

  if (demandas.length === 0 && !erroDemandas) return null;

  return (
    <div className="sec-card acn-ats-dm">
      <div className="sec-hdr" style={{ background: cor || '#1e293b' }}>   {/* a cor do setor é dado da tela e fica no style: o sistema pinta o cabeçalho (branco com um ponto da cor) olhando esse fundo */}
        <span>Demandas / Ajustes para {setor} ({demandas.length})</span>
        {fora && (
          <span className="acn-ats-dm-fora">
            ⏸ Fora do horário comercial — timers pausados
          </span>
        )}
      </div>
      {erroDemandas && <div className="acn-opl-aviso erro">Não foi possível atualizar as demandas de {setor} ({erroDemandas}).{demandas.length > 0 ? ' Está aparecendo a última lista lida.' : ''}</div>}
      <div className="sec-body acn-ats-dm-rol">
        <table>
          <thead><tr>
            <th>Data</th><th>OP</th><th>Descricao</th><th>Status</th>
            <th>Responsavel</th><th>Tempo Útil</th><th>Acoes</th>
          </tr></thead>
          <tbody>
            {demandas.map(d => {
              const isAjuste = d.descricao?.startsWith('[AJUSTE]');
              const desc = isAjuste ? d.descricao.replace('[AJUSTE] ', '') : (d.descricao || '—');
              const emAndamento = d.status === 'Em Andamento';
              const pausado = !!d.pausado || fora; // auto-pausa fora do horário
              const seg = emAndamento && d.data_inicio
                ? bhElapsed(d.data_inicio, d.segundos_pausados || 0, (d.pausado || fora) ? (d.data_pausa || new Date().toISOString()) : null)
                : 0;
              // Dos botões "de destaque" da linha (ver, acompanhar, iniciar, pausar/retomar, concluir) só o ÚLTIMO fica no tom principal (verde-água); os outros ficam no tom neutro — era o que o
              // ajuste de cores do sistema fazia ao ler as cores soltas de cada botão. O OBS é sempre neutro.
              const destaques = ['ver', d.numero_opl && 'acomp', d.status === 'Pendente' && 'iniciar', emAndamento && !fora && (!d.pausado ? 'pausar' : 'retomar'), emAndamento && !fora && !d.pausado && 'concluir'].filter(Boolean);
              const principal = destaques[destaques.length - 1];
              const cls = (k: string) => 'acn-ats-b acn-ats-dm-bt' + (k === principal ? ' pri' : '');
              return (
                <tr key={d.id} className={isAjuste ? 'acn-ats-dm-tr ajuste' : 'acn-ats-dm-tr'}>
                  <td>{d.data_abertura ? new Date(d.data_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{d.numero_opl || '—'}</td>
                  <td className="acn-ats-dm-desc" title={desc}>
                    {isAjuste && <span className="acn-ats-selo-ajuste dm">AJUSTE</span>}
                    {desc}
                  </td>
                  <td><span className={'acn-badge acn-ats-dm-st ' + (emAndamento ? (pausado ? 'paus' : 'and') : 'pend')}>
                    {emAndamento && pausado ? 'PAUSADO' : d.status}
                  </span></td>
                  <td>{d.responsavel_nome || '—'}</td>
                  <td>
                    {emAndamento && d.data_inicio ? (
                      <span className={'acn-ats-dm-tempo' + (pausado ? ' paus' : '')}>
                        {pausado ? '⏸ ' : ''}{fmtHMS(seg)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="acn-ats-dm-acoes">
                      <Botao className={cls('ver')} onClick={() => setModalVer(d)}>👁 VER</Botao>
                      {/* Botão de acompanhamento — sempre visível se a demanda tem OP vinculada */}
                      {d.numero_opl && (
                        <Botao className={cls('acomp')} onClick={() => setModalAcomp(d)}>💬 ACOMP.</Botao>
                      )}
                      {/* OBS — visível para qualquer status (Pendente ou Em Andamento) */}
                      <Botao className="acn-ats-b acn-ats-dm-bt"
                        onClick={() => { setModalObs(d); setObsTexto(''); }}>OBS</Botao>
                      {d.status === 'Pendente' && (
                        <Botao className={cls('iniciar')}
                          onClick={() => { setModalIniciar(d); setResponsavel(currentUser?.nome || ''); }}>INICIAR</Botao>
                      )}
                      {emAndamento && !fora && (
                        <>
                          {!d.pausado ? (
                            <Botao className={cls('pausar')} onClick={() => pausar(d)}>⏸ PAUSAR</Botao>
                          ) : (
                            <Botao className={cls('retomar')} onClick={() => retomar(d)}>▶ RETOMAR</Botao>
                          )}
                          {!d.pausado && (
                            <Botao className={cls('concluir')} onClick={() => concluir(d)}>CONCLUIR</Botao>
                          )}
                        </>
                      )}
                      {emAndamento && fora && (
                        <span className="acn-ats-dm-aguard">Aguard. horário</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box acn-ats-dm-m1">
            <div className="modal-title">Iniciar — {modalIniciar.descricao?.replace('[AJUSTE] ', '')}</div>
            <label className="acn-label">Responsável *</label>
            <ColaboradorSelect departamentos={departamentosDoSetor(setor)}
              value={responsavel} onChange={setResponsavel}
              placeholder="Selecione o responsável"
              className="acn-input acn-ats-dm-resp"
              autoFocus onKeyDown={e => e.key === 'Enter' && iniciar()} />
            <div className="acn-ats-dm-mrod">
              <Botao className="acn-ats-b acn-ats-mbt pri grande" onClick={iniciar}>INICIAR</Botao>
              <Botao className="acn-ats-b acn-ats-mbt" onClick={() => setModalIniciar(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box acn-ats-dm-m2">
            <div className="modal-title">Observação — {modalObs.descricao?.replace('[AJUSTE] ', '')}</div>
            <div className="acn-ats-dm-dica">
              Use @Nome para mencionar um colega
            </div>
            <MencaoTextarea
              value={obsTexto} onChange={setObsTexto} rows={3}
              placeholder="Adicione uma observação... @Nome para mencionar" />
            <div className="acn-ats-dm-mrod obs">
              <Botao className="acn-ats-b acn-ats-mbt pri grande" onClick={salvarObs}>SALVAR</Botao>
              <Botao className="acn-ats-b acn-ats-mbt" onClick={() => setModalObs(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACOMPANHAMENTO DA OP */}
      {modalAcomp && (
        <OplAcompModal
          referenciaId={modalAcomp.numero_opl || String(modalAcomp.id)}
          referenciaDesc={`OP ${modalAcomp.numero_opl || '—'}`}
          referenciaType="op"
          setor={setor}
          currentUser={currentUser}
          onClose={() => setModalAcomp(null)}
        />
      )}

      {/* MODAL VER DETALHES */}
      {modalVer && (() => {
        const d = modalVer;
        const isAjuste = d.descricao?.startsWith('[AJUSTE]');
        const desc = isAjuste ? d.descricao.replace('[AJUSTE] ', '') : (d.descricao || '—');
        const logs: any[] = d.logs_demanda || [];
        const fmt = (v: any) => v ? new Date(v).toLocaleString('pt-BR') : '—';
        const emAndamento = d.status === 'Em Andamento';
        const pausado = !!d.pausado || fora;
        const seg = emAndamento && d.data_inicio
          ? bhElapsed(d.data_inicio, d.segundos_pausados || 0, (d.pausado || fora) ? (d.data_pausa || new Date().toISOString()) : null)
          : 0;
        return (
          <div className="modal-overlay">
            <div className="modal-box acn-ats-dm-m3">
              <div className="modal-title">
                👁 Detalhes da Demanda
                {isAjuste && <span className="acn-ats-dm-tit-ajuste">AJUSTE</span>}
              </div>

              {/* Info principal */}
              <div className="acn-ats-dm-grade">
                {[
                  ['Descrição', desc],
                  ['Status', d.status + (emAndamento && pausado ? ' (Pausado)' : '')],
                  ['OP', d.numero_opl || '—'],
                  ['Setor', d.setor_destino || '—'],
                  ['Responsável', d.responsavel_nome || 'Não iniciado'],
                  ['Tempo útil', emAndamento && d.data_inicio ? fmtHMS(seg) : d.tempo_execucao_horas ? `${Number(d.tempo_execucao_horas).toFixed(2)}h` : '—'],
                  ['Aberta em', fmt(d.data_abertura)],
                  ['Iniciada em', fmt(d.data_inicio)],
                  ['Concluída em', fmt(d.data_conclusao)],
                  ['Aberto por', d.aberto_por || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="acn-ats-dm-rot">{label}</div>
                    <div className="acn-ats-dm-val">{value}</div>
                  </div>
                ))}
              </div>

              {/* Observações */}
              {d.observacoes_execucao && (
                <div className="acn-ats-dm-obs">
                  <div className="acn-ats-dm-obs-rot">Observações</div>
                  <div className="acn-ats-dm-obs-txt"><Linkify text={d.observacoes_execucao} /></div>
                </div>
              )}

              {/* Logs / histórico */}
              {logs.length > 0 && (
                <div>
                  <div className="acn-ats-dm-hist-rot">Histórico de Ações</div>
                  <div className="acn-ats-dm-hist">
                    {logs.map((l: any, i: number) => (
                      <div key={i} className="acn-ats-dm-hist-it">
                        <div className="acn-ats-dm-hist-hora">
                          {l.hora ? new Date(l.hora).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                        </div>
                        <div className="acn-ats-dm-hist-corpo">
                          <span className="acn-ats-dm-hist-txt">{l.texto}</span>
                          {l.usuario && <span className="acn-ats-dm-hist-usu">— {l.usuario}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="acn-ats-dm-ver-rod">
                <Botao className="acn-ats-b acn-ats-mbt larga" onClick={() => setModalVer(null)}>Fechar</Botao>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
