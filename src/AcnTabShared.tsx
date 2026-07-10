// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


// ─── Botão de Pendências por OPL ─────────────────────────────────────────────
export function BotaoPendencias({ opl, opl_id }: { opl: string; opl_id?: any }) {
  const [open, setOpen] = useState(false);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buscar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('numero_opl', opl)
      .in('status', ['Pendente', 'Em Andamento'])
      .order('data_abertura', { ascending: false });
    setPendencias(data || []);
    setLoading(false);
  };

  const abrir = () => { setOpen(true); buscar(); };

  const corStatus = (s: string) => s === 'Em Andamento' ? '#3b82f6' : '#f59e0b';

  return (
    <>
      <button
        onClick={abrir}
        title="Ver pendências desta OPL"
        style={{
          fontSize: 10, padding: '2px 7px', border: '1px solid #e2e8f0',
          borderRadius: 3, cursor: 'pointer', background: '#f1f5f9',
          color: '#475569', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
        📋 Pendências
      </button>

      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 600, width: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-title">Pendências — OPL {opl}</div>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Carregando...</div>
            ) : pendencias.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#22c55e', padding: 20, fontWeight: 700 }}>
                ✓ Nenhuma pendência aberta para esta OPL.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                  {pendencias.length} pendência(s) em aberto em {[...new Set(pendencias.map(p => p.setor_destino))].join(', ')}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Setor</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Descrição</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Responsável</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Abertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendencias.map(p => {
                      const isAjuste = p.descricao?.startsWith('[AJUSTE]');
                      const desc = isAjuste ? p.descricao.replace('[AJUSTE] ', '') : (p.descricao || '—');
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isAjuste ? '#fffbeb' : undefined }}>
                          <td style={{ padding: '5px 8px', fontWeight: 700, color: '#1e293b' }}>{p.setor_destino || '—'}</td>
                          <td style={{ padding: '5px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>
                            {isAjuste && <span style={{ background: '#f59e0b', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 2, marginRight: 3 }}>AJUSTE</span>}
                            {desc}
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: corStatus(p.status), color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>{p.status}</span>
                          </td>
                          <td style={{ padding: '5px 8px', color: '#64748b' }}>{p.responsavel_nome || '—'}</td>
                          <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {p.data_abertura ? new Date(p.data_abertura).toLocaleDateString('pt-BR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setOpen(false)}>Fechar</button>
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

  // Filtros
  const [fOperador, setFOperador]       = useState('');
  const [fDataInicio, setFDataInicio]   = useState('');
  const [fDataFim, setFDataFim]         = useState('');

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Logs com filtros
      let q = supabase
        .from('logs_movimentacao_opl')
        .select('*')
        .order('data_hora', { ascending: false })
        .limit(200);

      if (fOperador)    q = q.ilike('usuario_nome', `%${fOperador}%`);
      if (fDataInicio)  q = q.gte('data_hora', fDataInicio + 'T00:00:00');
      if (fDataFim)     q = q.lte('data_hora', fDataFim + 'T23:59:59');

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

      setLogs(logsRes.data || []);
      setOpls(oplsRes.data || []);

      const uniq = [...new Set((opersRes.data || []).map((r: any) => r.usuario_nome).filter(Boolean))].sort() as string[];
      setOperadores(uniq);
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
    <div style={{ marginTop: 10 }}>
      <div className="opl-mov-hdr" onClick={() => setOpen(o => !o)}>
        <span>📋 Histórico de Movimentações OPL</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="opl-mov-body">
          {/* ── FILTROS ── */}
          <div style={{ display:'flex', gap:6, alignItems:'flex-end', flexWrap:'wrap', padding:'10px 12px', background:'#f8fafc', borderBottom:'1px solid #fde68a' }}>
            <div>
              <div style={{ fontSize:8, fontWeight:700, color:'#92400e', textTransform:'uppercase', marginBottom:2 }}>Operador</div>
              <select
                value={fOperador} onChange={e => setFOperador(e.target.value)}
                style={{ fontSize:10, padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, background:'white', color:'#374151', minWidth:140 }}>
                <option value="">Todos</option>
                {operadores.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:8, fontWeight:700, color:'#92400e', textTransform:'uppercase', marginBottom:2 }}>Data início</div>
              <input type="date" value={fDataInicio} onChange={e => setFDataInicio(e.target.value)}
                style={{ fontSize:10, padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, background:'white', color:'#374151' }} />
            </div>
            <div>
              <div style={{ fontSize:8, fontWeight:700, color:'#92400e', textTransform:'uppercase', marginBottom:2 }}>Data fim</div>
              <input type="date" value={fDataFim} onChange={e => setFDataFim(e.target.value)}
                style={{ fontSize:10, padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, background:'white', color:'#374151' }} />
            </div>
            <button onClick={fetchData}
              style={{ fontSize:10, fontWeight:700, padding:'4px 12px', background:'#92400e', color:'white', border:'none', borderRadius:4, cursor:'pointer' }}>
              🔍 Buscar
            </button>
            {temFiltro && (
              <button onClick={() => { limparFiltros(); setTimeout(fetchData, 50); }}
                style={{ fontSize:10, padding:'4px 8px', background:'#f1f5f9', color:'#64748b', border:'1px solid #d1d5db', borderRadius:4, cursor:'pointer' }}>
                ✕ Limpar
              </button>
            )}
            <span style={{ marginLeft:'auto', fontSize:9, color:'#92400e', fontStyle:'italic' }}>
              {loading ? 'Carregando...' : `${logs.length} registro(s)`}
            </span>
          </div>

          {/* ── ABAS ── */}
          <div style={{ display:'flex', borderBottom:'1px solid #fde68a' }}>
            {(['logs','processo'] as const).map(a => (
              <button key={a} onClick={() => setAba(a)}
                style={{ flex:1, padding:'6px', fontSize:10, fontWeight:700, cursor:'pointer', border:'none',
                  background: aba===a ? '#92400e' : '#fffbeb',
                  color: aba===a ? 'white' : '#92400e',
                  borderBottom: aba===a ? '2px solid #92400e' : '2px solid transparent' }}>
                {a === 'logs' ? '📝 Logs de Movimentação' : '⚙️ Em Processo'}
              </button>
            ))}
          </div>

          {/* ── ABA LOGS ── */}
          {aba === 'logs' && (
            <div style={{ overflowX:'auto' }}>
              {loading ? (
                <div style={{ textAlign:'center', padding:20, color:'#94a3b8', fontSize:11 }}>Carregando...</div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:'#94a3b8', fontSize:11 }}>Nenhum registro encontrado.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                  <thead><tr style={{ background:'#1e293b' }}>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Data/Hora</th>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>OPL</th>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Setor</th>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Evento</th>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Operador</th>
                    <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Status anterior → novo</th>
                  </tr></thead>
                  <tbody>
                    {logs.map((l, i) => (
                      <tr key={l.id || i} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding:'5px 8px', whiteSpace:'nowrap', color:'#64748b' }}>{fmtDt(l.data_hora)}</td>
                        <td style={{ padding:'5px 8px' }}><strong style={{ color:'#2563eb' }}>{l.numero_opl || '—'}</strong></td>
                        <td style={{ padding:'5px 8px', color:'#475569' }}>{l.setor || '—'}</td>
                        <td style={{ padding:'5px 8px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={l.evento}>
                          {l.evento || '—'}
                        </td>
                        <td style={{ padding:'5px 8px' }}>
                          {l.usuario_nome
                            ? <span style={{ background:'#eff6ff', color:'#1d4ed8', padding:'1px 6px', borderRadius:10, fontSize:9, fontWeight:700 }}>{l.usuario_nome}</span>
                            : <span style={{ color:'#94a3b8', fontSize:9 }}>—</span>}
                        </td>
                        <td style={{ padding:'5px 8px', fontSize:9, color:'#64748b' }}>
                          {l.status_anterior && l.status_novo
                            ? <>{l.status_anterior} <span style={{ color:'#0f766e', fontWeight:700 }}>→</span> {l.status_novo}</>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── ABA EM PROCESSO ── */}
          {aba === 'processo' && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead><tr style={{ background:'#1e293b' }}>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>OPL</th>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Cliente</th>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Tipo</th>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Status</th>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Último Registro</th>
                  <th style={{ padding:'6px 8px', color:'#cbd5e1', textAlign:'left', fontWeight:600, fontSize:9 }}>Pendências</th>
                </tr></thead>
                <tbody>
                  {opls.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:16, color:'#94a3b8', fontSize:11 }}>Nenhuma OPL em processo.</td></tr>
                  ) : opls.map((o, i) => {
                    const ultimoLog = logs.find(l => l.opl_id === o.id);
                    return (
                      <tr key={o.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding:'5px 8px' }}><strong style={{ color:'#2563eb' }}>{o.opl}</strong></td>
                        <td style={{ padding:'5px 8px', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.cliente_nome || '—'}</td>
                        <td style={{ padding:'5px 8px', color:'#64748b' }}>{o.tipo_projeto || '—'}</td>
                        <td style={{ padding:'5px 8px' }}>
                          <span style={{ background:'#3b82f6', color:'white', fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:10 }}>{o.status_geral}</span>
                        </td>
                        <td style={{ padding:'5px 8px', fontSize:9, color:'#64748b', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ultimoLog ? `${ultimoLog.evento} — ${fmtDt(ultimoLog.data_hora)}` : '—'}
                        </td>
                        <td style={{ padding:'5px 8px' }}><BotaoPendencias opl={o.opl} opl_id={o.id} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Modal de Detalhes da OPL ────────────────────────────────────────────────
export function OplDetalheModal({ opl, onClose }: { opl: any; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opl?.id) return;
    setLoading(true);
    supabase.from('logs_movimentacao_opl')
      .select('*')
      .eq('opl_id', opl.id)
      .order('data_hora', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, [opl?.id]);

  const fmtDt  = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtH = (d: any) => d
    ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const Campo = ({ label, value }: { label: string; value: any }) => value != null && value !== '' ? (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{String(value)}</div>
    </div>
  ) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 680, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title">👁 Detalhes — OPL {opl.opl}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 14 }}>
          <Campo label="Número OPL"       value={opl.opl} />
          <Campo label="Status"           value={opl.status_geral} />
          <Campo label="Cliente"          value={opl.cliente_nome} />
          <Campo label="Tipo de Projeto"  value={opl.tipo_projeto} />
          <Campo label="Chassi"           value={opl.chassi} />
          <Campo label="Modelo"           value={opl.modelo} />
          <Campo label="Quantidade"       value={opl.quantidade} />
          <Campo label="NF-e"             value={opl.numero_nf} />
          <Campo label="Data Entrada"     value={fmtDt(opl.data_entrada)} />
          <Campo label="Prev. Entrega"    value={fmtDt(opl.data_prevista_entrega)} />
          <Campo label="Resp. Comercial"  value={opl.responsavel_comercial || opl.criado_por_nome} />
          <Campo label="Resp. Engenharia" value={opl.responsavel_engenharia} />
          <Campo label="Resp. Almox"      value={opl.responsavel_almox} />
          <Campo label="Resp. Producao"   value={opl.responsavel_producao} />
          <Campo label="Resp. Fiscal"     value={opl.responsavel_fiscal} />
          <Campo label="Cadastrado em"    value={fmtDtH(opl.criado_em)} />
        </div>

        {opl.observacoes && (
          <div style={{ marginBottom: 14, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Observações</div>
            <div style={{ fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap' }}>{opl.observacoes}</div>
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          📋 Histórico de Movimentações
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 12, color: '#94a3b8', fontSize: 11 }}>Carregando...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 12, color: '#94a3b8', fontSize: 11 }}>Nenhum registro de movimentação.</div>
        ) : (
          <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead><tr style={{ background: '#1e293b', position: 'sticky', top: 0 }}>
                <th style={{ padding: '5px 8px', color: '#cbd5e1', textAlign: 'left', fontSize: 9, fontWeight: 600 }}>Data/Hora</th>
                <th style={{ padding: '5px 8px', color: '#cbd5e1', textAlign: 'left', fontSize: 9, fontWeight: 600 }}>Setor</th>
                <th style={{ padding: '5px 8px', color: '#cbd5e1', textAlign: 'left', fontSize: 9, fontWeight: 600 }}>Evento</th>
                <th style={{ padding: '5px 8px', color: '#cbd5e1', textAlign: 'left', fontSize: 9, fontWeight: 600 }}>Operador</th>
              </tr></thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDtH(l.data_hora)}</td>
                    <td style={{ padding: '4px 8px', color: '#475569' }}>{l.setor || '—'}</td>
                    <td style={{ padding: '4px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.evento}>
                      {l.evento || '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      {l.usuario_nome
                        ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{l.usuario_nome}</span>
                        : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button className="acn-btn" style={{ background: '#94a3b8', width: '100%', marginTop: 14 }} onClick={onClose}>
          Fechar
        </button>
      </div>
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
// Seg-Sex 08:00–17:30. Retorna segundos úteis decorridos desde `startISO`.
// Se `pausadoSince` informado, para de contar naquele instante.
// Subtrai `segundosPausados` acumulados.
function bhElapsed(
  startISO: string,
  segundosPausados: number = 0,
  pausadoSince: string | null = null,
): number {
  const start = new Date(startISO);
  const end   = pausadoSince ? new Date(pausadoSince) : new Date();
  if (end <= start) return 0;

  let total = 0;
  let cur   = new Date(start.getTime());

  while (cur < end) {
    const dow = cur.getDay(); // 0=Dom, 6=Sab
    // Fim-de-semana: pula para segunda 08:00
    if (dow === 0 || dow === 6) {
      const daysAhead = dow === 0 ? 1 : 2;
      cur.setDate(cur.getDate() + daysAhead);
      cur.setHours(8, 0, 0, 0);
      continue;
    }
    const bhStart = new Date(cur); bhStart.setHours(8,  0, 0, 0);
    const bhEnd   = new Date(cur); bhEnd.setHours(17, 30, 0, 0);

    if (cur < bhStart) { cur.setHours(8, 0, 0, 0); continue; }
    if (cur >= bhEnd)  { cur.setDate(cur.getDate() + 1); cur.setHours(8, 0, 0, 0); continue; }

    const segEnd = new Date(Math.min(end.getTime(), bhEnd.getTime()));
    total += (segEnd.getTime() - cur.getTime()) / 1000;
    cur    = new Date(segEnd.getTime());
    if (cur >= bhEnd && cur < end) { cur.setDate(cur.getDate() + 1); cur.setHours(8, 0, 0, 0); }
  }
  return Math.max(0, Math.floor(total) - segundosPausados);
}

function fmtHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function dentroHorarioComercial(): boolean {
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return false;
  const h = now.getHours(), mn = now.getMinutes();
  const mins = h * 60 + mn;
  return mins >= 8 * 60 && mins < 17 * 60 + 30;
}

export function DemandasSetorWidget({ setor, cor, currentUser }: { setor: string; cor?: string; currentUser: any }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [modalIniciar, setModalIniciar] = useState<any>(null);
  const [modalObs, setModalObs] = useState<any>(null);
  const [responsavel, setResponsavel] = useState('');
  const [obsTexto, setObsTexto] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchDemandas();
    const t = setInterval(fetchDemandas, 30000);
    return () => clearInterval(t);
  }, [setor]);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchDemandas = async () => {
    const { data } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .eq('setor_destino', setor)
      .in('status', ['Pendente', 'Em Andamento'])
      .order('data_abertura', { ascending: false });
    setDemandas(data || []);
  };

  const iniciar = async () => {
    if (!responsavel.trim()) { alert('Informe o responsavel!'); return; }
    const d = modalIniciar;
    const agora = new Date().toISOString();
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Iniciado. Responsavel: ${responsavel}`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Em Andamento', data_inicio: agora,
      responsavel_nome: responsavel, logs_demanda: logs,
      pausado: false, segundos_pausados: 0,
    }).eq('id', d.id);
    setModalIniciar(null); setResponsavel('');
    fetchDemandas();
  };

  const pausar = async (d: any) => {
    const agora = new Date().toISOString();
    const logs = d.logs_demanda || [];
    logs.push({ texto: 'Atividade PAUSADA manualmente.', usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      pausado: true, data_pausa: agora, logs_demanda: logs,
    }).eq('id', d.id);
    fetchDemandas();
  };

  const retomar = async (d: any) => {
    const agora = new Date().toISOString();
    const tempoPausadoAgora = d.data_pausa
      ? Math.floor((new Date(agora).getTime() - new Date(d.data_pausa).getTime()) / 1000)
      : 0;
    const totalPausado = (d.segundos_pausados || 0) + tempoPausadoAgora;
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Atividade RETOMADA. Pausa: ${fmtHMS(tempoPausadoAgora)}`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      pausado: false, data_pausa: null, segundos_pausados: totalPausado, logs_demanda: logs,
    }).eq('id', d.id);
    fetchDemandas();
  };

  const concluir = async (d: any) => {
    const agora = new Date().toISOString();
    const seg = d.data_inicio ? bhElapsed(d.data_inicio, d.segundos_pausados || 0, null) : 0;
    const tempo = seg / 3600;
    const logs = d.logs_demanda || [];
    logs.push({ texto: `Concluido. Tempo util: ${fmtHMS(seg)}`, usuario: currentUser?.nome, hora: agora });
    await supabase.from('demandas_setoriais').update({
      status: 'Concluido', data_conclusao: agora,
      tempo_execucao_horas: tempo, logs_demanda: logs,
    }).eq('id', d.id);
    fetchDemandas();
  };

  const salvarObs = async () => {
    if (!obsTexto.trim()) return;
    const d = modalObs;
    const logs = d.logs_demanda || [];
    logs.push({ texto: obsTexto, usuario: currentUser?.nome, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({ observacoes_execucao: obsTexto, logs_demanda: logs }).eq('id', d.id);
    setObsTexto(''); setModalObs(null);
    fetchDemandas();
  };

  const fora = !dentroHorarioComercial();

  if (demandas.length === 0) return null;

  return (
    <div className="sec-card" style={{ marginTop: 10 }}>
      <div className="sec-hdr" style={{ background: cor || '#1e293b', color: 'white' }}>
        <span>Demandas / Ajustes para {setor} ({demandas.length})</span>
        {fora && (
          <span style={{ fontSize: 9, background: 'rgba(0,0,0,.3)', padding: '2px 7px', borderRadius: 3 }}>
            ⏸ Fora do horário comercial — timers pausados
          </span>
        )}
      </div>
      <div className="sec-body" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th>Data</th><th>OPL</th><th>Descricao</th><th>Status</th>
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
              return (
                <tr key={d.id} style={{ background: isAjuste ? '#fffbeb' : undefined }}>
                  <td>{d.data_abertura ? new Date(d.data_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{d.numero_opl || '—'}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>
                    {isAjuste && <span style={{ background: '#f59e0b', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, marginRight: 4 }}>AJUSTE</span>}
                    {desc}
                  </td>
                  <td><span className="acn-badge" style={{ background: emAndamento ? (pausado ? '#f59e0b' : '#3b82f6') : '#f59e0b' }}>
                    {emAndamento && pausado ? 'PAUSADO' : d.status}
                  </span></td>
                  <td>{d.responsavel_nome || '—'}</td>
                  <td>
                    {emAndamento && d.data_inicio ? (
                      <span style={{ fontFamily: 'monospace', color: pausado ? '#f59e0b' : '#2563eb', fontWeight: 700 }}>
                        {pausado ? '⏸ ' : ''}{fmtHMS(seg)}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {d.status === 'Pendente' && (
                        <button className="acn-btn" style={{ background: cor || '#1e293b' }}
                          onClick={() => { setModalIniciar(d); setResponsavel(currentUser?.nome || ''); }}>INICIAR</button>
                      )}
                      {emAndamento && !fora && (
                        <>
                          {!d.pausado ? (
                            <button className="acn-btn" style={{ background: '#f59e0b', fontSize: 9 }} onClick={() => pausar(d)}>⏸ PAUSAR</button>
                          ) : (
                            <button className="acn-btn" style={{ background: '#16a34a', fontSize: 9 }} onClick={() => retomar(d)}>▶ RETOMAR</button>
                          )}
                          <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }}
                            onClick={() => { setModalObs(d); setObsTexto(''); }}>OBS</button>
                          {!d.pausado && (
                            <button className="acn-btn" style={{ background: '#22c55e' }} onClick={() => concluir(d)}>CONCLUIR</button>
                          )}
                        </>
                      )}
                      {emAndamento && fora && (
                        <span style={{ fontSize: 9, color: '#f59e0b', fontStyle: 'italic' }}>Aguard. horário</span>
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
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-title">Iniciar — {modalIniciar.descricao?.replace('[AJUSTE] ', '')}</div>
            <label className="acn-label">Responsavel *</label>
            <input className="acn-input" style={{ width: '100%', marginBottom: 12 }}
              value={responsavel} onChange={e => setResponsavel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && iniciar()} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={iniciar}>INICIAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-title">Observacao — {modalObs.descricao?.replace('[AJUSTE] ', '')}</div>
            <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
              placeholder="Adicione uma observacao..." value={obsTexto} onChange={e => setObsTexto(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={salvarObs}>SALVAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalObs(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
