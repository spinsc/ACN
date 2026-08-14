// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { ColaboradorSelect } from './ColaboradorSelect';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import OplAcompModal from './OplAcompModal';

// ─── Progresso da OP/OS ao longo do pipeline (Comercial → Faturado) ──────────
const OPL_PIPELINE: { match: string[]; pct: number; label: string; retrabalho?: boolean }[] = [
  { match: ['Em Espera Engenharia'], pct: 10, label: 'Aguardando Engenharia' },
  { match: ['Devolvida Comercial', 'Rejeitada - Análise Requerida'], pct: 10, label: 'Devolvida ao Comercial', retrabalho: true },
  { match: ['Em Analise Engenharia'], pct: 20, label: 'Em Análise — Engenharia' },
  { match: ['Devolvida para Engenharia'], pct: 20, label: 'Devolvida à Engenharia', retrabalho: true },
  { match: ['Em Espera PCP'], pct: 35, label: 'Aguardando PCP' },
  { match: ['Devolvida PCP'], pct: 35, label: 'Devolvida ao PCP', retrabalho: true },
  { match: ['Kit OK - Aguardando PCP', 'Aguardando Almox'], pct: 45, label: 'Almoxarifado' },
  { match: ['Aguardando Inicio Producao', 'Aguardando Agendamento Manutenção', 'Manutenção Agendada'], pct: 55, label: 'Aguardando Produção' },
  { match: ['Em Producao'], pct: 70, label: 'Em Produção' },
  { match: ['Em Retrabalho', 'Retrabalho'], pct: 70, label: 'Em Retrabalho', retrabalho: true },
  { match: ['Aguardando CQ'], pct: 80, label: 'Controle de Qualidade' },
  { match: ['Aprovado CQ - Aguardando Liberacao Comercial', 'Aguardando Liberacao Comercial'], pct: 90, label: 'Aguardando Liberação Comercial' },
  { match: ['Aguarda Emissao NF'], pct: 95, label: 'Fiscal — Emissão de NF' },
  { match: ['Faturado', 'Faturado e Disponivel para Entrega'], pct: 100, label: 'Faturado' },
];

function progressoOpl(status: string) {
  const found = OPL_PIPELINE.find(s => s.match.includes(status));
  return found || { pct: 5, label: status || 'Iniciado', retrabalho: false };
}

export function OplProgressBar({ status }: { status: string }) {
  const { pct, label, retrabalho } = progressoOpl(status);
  const cor = retrabalho ? '#f59e0b' : pct >= 100 ? '#16a34a' : '#2563eb';
  return (
    <div style={{ margin: '10px 0 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>
          {retrabalho && '⚠️ '}Progresso — {label}
        </span>
        <span style={{ fontSize: 9, fontWeight: 800, color: cor }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cor, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

// ─── Lista inline de anexos (para OplDetalheModal) ───────────────────────────
function AnexosOPSection({ oplId }: { oplId: string }) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const TIPO_ICONE: Record<string, string> = { proposta:'📋', orcamento:'💰', documento:'📄', foto:'🖼️', checklist_entrega:'✅' };
  const TIPO_COR:   Record<string, string> = { proposta:'#0891b2', orcamento:'#059669', documento:'#2563eb', foto:'#7c3aed', checklist_entrega:'#16a34a' };

  useEffect(() => {
    if (!oplId) return;
    supabase.from('opl_anexos').select('*').eq('opl_id', oplId).order('criado_em', { ascending: false })
      .then(({ data }) => { setAnexos(data || []); setLoading(false); });
  }, [oplId]);

  if (loading) return <div style={{ fontSize:10, color:'#94a3b8', padding:'6px 0' }}>Carregando documentos...</div>;
  if (anexos.length === 0) return <div style={{ fontSize:10, color:'#94a3b8', padding:'6px 0' }}>Nenhum documento anexado.</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {anexos.map(a => (
        <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
          background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6 }}>
          <span style={{ fontSize:15 }}>{TIPO_ICONE[a.tipo] || '📄'}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <a href={a.url} target="_blank" rel="noreferrer"
              style={{ fontSize:11, color: TIPO_COR[a.tipo] || '#2563eb', fontWeight:600, textDecoration:'none', wordBreak:'break-all' }}>
              {a.nome}
            </a>
            <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>
              {a.setor && <span style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'0 5px', marginRight:4 }}>{a.setor}</span>}
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
export function OplDetalheModal({ opl: oplProp, onClose, currentUser }: { opl: any; onClose: () => void; currentUser?: any }) {
  const [opl, setOpl]       = useState<any>(oplProp);
  const [logs, setLogs]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [liberando, setLiberando] = useState(false);

  // Sincroniza se prop mudar
  useEffect(() => { setOpl(oplProp); }, [oplProp?.id]);

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

  // ── Liberar OP para o Fiscal emitir NF ──────────────────────────────────
  const liberarParaFiscal = async () => {
    if (!window.confirm(`Liberar OP ${opl.opl} para o Fiscal emitir a Nota Fiscal?`)) return;
    setLiberando(true);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('oples').update({
      status_geral: 'Aguarda Emissao NF',
      data_liberacao_comercial: agora,
    }).eq('id', opl.id);
    if (error) { alert('Erro ao liberar: ' + error.message); setLiberando(false); return; }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Comercial',
      evento: 'OPL liberada para emissão de NF pelo Fiscal.',
      status_anterior: opl.status_geral, status_novo: 'Aguarda Emissao NF',
      usuario_nome: currentUser?.nome || null, data_hora: agora,
    }]);
    // Atualiza status local sem fechar o modal
    setOpl((o: any) => ({ ...o, status_geral: 'Aguarda Emissao NF' }));
    setLogs(prev => [{
      id: 'tmp', setor: 'Comercial', evento: 'OPL liberada para emissão de NF pelo Fiscal.',
      status_anterior: opl.status_geral, status_novo: 'Aguarda Emissao NF',
      usuario_nome: currentUser?.nome || '—', data_hora: agora,
    }, ...prev]);
    setLiberando(false);
  };

  const fmtDt  = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDtH = (d: any) => d
    ? new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const fmtR$ = (v: any) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

  const Sec = ({ title }: { title: string }) => (
    <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '.6px', margin: '14px 0 8px', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
      {title}
    </div>
  );

  const Campo = ({ label, value, full = false }: { label: string; value: any; full?: boolean }) =>
    value != null && value !== '' && value !== false ? (
      <div style={{ marginBottom: 8, gridColumn: full ? '1 / -1' : undefined }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{String(value)}</div>
      </div>
    ) : null;

  const temServTerceiro = !!opl.servico_terceiro;
  // Suporte a múltiplos tipos (novo) e fallback ao campo único (legado)
  const tiposServ: string[] = Array.isArray(opl.tipos_servico_terceiro) && opl.tipos_servico_terceiro.length
    ? opl.tipos_servico_terceiro
    : (opl.tipo_servico_terceiro ? [opl.tipo_servico_terceiro] : []);
  const obsServTerceiro = opl.obs_servico_terceiro || '';

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 720, width: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Cabeçalho */}
        <div style={{ background: '#0f172a', color: '#fff', margin: '-14px -14px 0', padding: '12px 16px',
          borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, opacity: .65, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
              {opl.faturamento_empresa || 'ACN'} · {opl.tipo_projeto || 'OP'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>OP {opl.opl}</div>
          </div>
          <span style={{ background: opl.status_geral === 'Faturado' ? '#16a34a' : opl.status_geral === 'Cancelado' ? '#dc2626' : '#334155',
            color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 12, letterSpacing: .3 }}>
            {opl.status_geral || 'Sem status'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', marginLeft: 6 }}>✕</button>
        </div>

        {opl.status_geral !== 'Cancelado' && <OplProgressBar status={opl.status_geral} />}

        {/* ── Botão LIBERAR PARA FISCAL (aparece automaticamente quando aguardando) ── */}
        {(opl.status_geral === 'Aprovado CQ - Aguardando Liberacao Comercial' ||
          opl.status_geral === 'Aguardando Liberacao Comercial') && (
          <div style={{ margin: '12px 0 0', padding: '12px 16px', background: '#f0fdf4',
            border: '2px solid #22c55e', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>✅ APROVADO PELO CQ — AGUARDANDO LIBERAÇÃO COMERCIAL</div>
              <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>
                Esta OP está pronta. Libere para o Fiscal emitir a Nota Fiscal.
              </div>
            </div>
            <button
              onClick={liberarParaFiscal}
              disabled={liberando}
              style={{ background: liberando ? '#94a3b8' : '#f59e0b', color: '#fff', border: 'none',
                borderRadius: 7, padding: '9px 18px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0 }}>
              {liberando ? 'Liberando...' : '🟡 LIBERAR PARA FISCAL'}
            </button>
          </div>
        )}

        {/* Alerta serviço de terceiro */}
        {temServTerceiro && (
          <div style={{ margin: '12px 0 0', padding: '10px 14px', background: '#fffbeb',
            border: '2px solid #f59e0b', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>NECESSITA SERVIÇO DE TERCEIRO</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:5 }}>
                {tiposServ.map(t => (
                  <span key={t} style={{ background:'#f59e0b', color:'#fff', fontSize:10,
                    fontWeight:700, padding:'2px 8px', borderRadius:8 }}>{t}</span>
                ))}
              </div>
              {obsServTerceiro && (
                <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>Obs: {obsServTerceiro}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Identificação ── */}
        <Sec title="🔍 Identificação" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Campo label="Número OP"         value={opl.opl} />
          <Campo label="Empresa"           value={opl.faturamento_empresa} />
          <Campo label="Tipo de Projeto"   value={opl.tipo_projeto} />
          <Campo label="Cliente"           value={opl.cliente_nome} />
          <Campo label="Qtd. Veículos"     value={opl.quantidade} />
          <Campo label="NF-e"              value={opl.numero_nf} />
          <Campo label="Criado por"        value={opl.criado_por_nome || opl.criado_por} />
          <Campo label="Cadastrado em"     value={fmtDtH(opl.criado_em)} />
        </div>

        {/* ── Veículo ── */}
        <Sec title="🚗 Veículo" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Campo label="Modelo"                    value={opl.modelo} />
          <Campo label="Chassi"                    value={opl.chassi} />
          <Campo label="Qtd. Veículos"             value={opl.quantidade} />
          <Campo label="Data Entrada"              value={fmtDt(opl.data_entrada)} />
          <Campo label="Recebimento do Veículo"    value={fmtDt(opl.data_chegada_veiculo)} />
          <Campo label="Previsão de Entrega"       value={fmtDt(opl.data_prevista_entrega)} />
          <Campo label="Prazo Entrega Comercial"   value={fmtDt(opl.prazo_entrega_comercial)} />
          <Campo label="Prazo Entrega Produção"    value={fmtDt(opl.prazo_entrega_producao)} />
          <Campo label="Data Aceite Cliente"       value={fmtDt(opl.data_aceite_cliente)} />
        </div>

        {/* ── Financeiro ── */}
        {(opl.valor_total != null || opl.valor_mao_de_obra != null || opl.valor_mao_de_obra_serralheria != null) && (
          <>
            <Sec title="💰 Financeiro" />
            {currentUser?.ver_valores === false ? (
              <div style={{ padding:'8px 12px', background:'#f1f5f9', borderRadius:6, fontSize:11, color:'#64748b', marginBottom:8 }}>
                🔒 Valores financeiros restritos — sem permissão de visualização.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
                <Campo label="Valor Total"           value={opl.valor_total != null ? fmtR$(opl.valor_total) : null} />
                <Campo label="Valor M.O."            value={opl.valor_mao_de_obra != null ? fmtR$(opl.valor_mao_de_obra) : null} />
                <Campo label="Valor M.O. Serralheria" value={opl.valor_mao_de_obra_serralheria != null ? fmtR$(opl.valor_mao_de_obra_serralheria) : null} />
                <Campo label="Faturamento"           value={opl.faturamento_empresa} />
              </div>
            )}
          </>
        )}

        {/* ── Status por Setor ── */}
        <Sec title="📊 Status por Setor" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Campo label="Status BOM"        value={opl.status_bom} />
          <Campo label="Status Almox"      value={opl.status_almox} />
        </div>

        {/* ── Responsáveis ── */}
        <Sec title="👥 Responsáveis" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Campo label="Comercial"    value={opl.responsavel_comercial || opl.criado_por_nome} />
          <Campo label="Engenharia"   value={opl.responsavel_engenharia} />
          <Campo label="Almoxarifado" value={opl.responsavel_almox} />
          <Campo label="Produção"     value={opl.responsavel_producao} />
          <Campo label="Fiscal"       value={opl.responsavel_fiscal} />
          <Campo label="Qualidade"    value={opl.responsavel_qualidade} />
        </div>

        {/* ── Seriais de Equipamentos ── */}
        {opl.seriais_equipamentos && (
          <>
            <Sec title="🔢 Seriais dos Equipamentos" />
            <div style={{ marginBottom: 8, padding: '8px 12px', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#1e3a8a', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{opl.seriais_equipamentos}</div>
            </div>
          </>
        )}

        {/* ── Resumo dos Serviços ── */}
        {opl.resumo_servicos && (
          <>
            <Sec title="🔧 Resumo dos Serviços a serem executados" />
            <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#14532d', whiteSpace: 'pre-wrap' }}>{opl.resumo_servicos}</div>
            </div>
          </>
        )}

        {/* ── Observações ── */}
        {(opl.observacoes_comercial || opl.observacoes || opl.observacoes_atencao) && (
          <>
            <Sec title="📝 Observações" />
            {opl.observacoes_atencao && (
              <div style={{ marginBottom: 8, padding: '8px 12px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: 3 }}>⚠️ Atenção</div>
                <div style={{ fontSize: 11, color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>{opl.observacoes_atencao}</div>
              </div>
            )}
            {opl.observacoes_comercial && (
              <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Observações Comerciais</div>
                <div style={{ fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap' }}>{opl.observacoes_comercial}</div>
              </div>
            )}
            {opl.observacoes && (
              <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>Observações Gerais</div>
                <div style={{ fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap' }}>{opl.observacoes}</div>
              </div>
            )}
          </>
        )}

        {/* ── Histórico de Movimentações ── */}
        <Sec title="📋 Histórico de Movimentações" />
        {loading ? (
          <div style={{ textAlign: 'center', padding: 12, color: '#94a3b8', fontSize: 11 }}>Carregando...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 12, color: '#94a3b8', fontSize: 11 }}>Nenhum registro de movimentação.</div>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
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

        {/* ── Documentos / Anexos ── */}
        <Sec title="📎 Documentos Anexados" />
        <AnexosOPSection oplId={opl.id} />

        <button className="acn-btn" style={{ background: '#94a3b8', width: '100%', marginTop: 14 }} onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

// ─── Link Clicável de OPL ────────────────────────────────────────────────────
// Usar em qualquer lugar onde o número da OP aparece como texto.
// Recebe o objeto OPL completo OU apenas o número (string) — abre OplDetalheModal ao clicar.
// Quando recebe string, busca o objeto completo no banco ao clicar.
export function LinkOpl({ opl, currentUser, color }: { opl: any; currentUser?: any; color?: string }) {
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
    const { data } = await supabase.from('oples').select('*').eq('opl', numero).maybeSingle();
    setLoading(false);
    if (data) { setFetched(data); setOpen(true); }
  };

  return (
    <>
      <span
        onClick={handleClick}
        style={{
          color: color || '#2563eb', fontWeight: 700,
          cursor: 'pointer',
          textDecoration: 'underline dotted',
          textUnderlineOffset: 2,
          opacity: loading ? 0.6 : 1,
        }}
        title="Abrir detalhes da OPL"
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
  const q = busca.toLowerCase();
  return opls.filter(o =>
    (o.opl            || '').toLowerCase().includes(q) ||
    (o.chassi         || '').toLowerCase().includes(q) ||
    (o.cliente_nome   || '').toLowerCase().includes(q) ||
    (o.tipo_projeto   || '').toLowerCase().includes(q)
  );
}

// ─── Input de busca padrão ────────────────────────────────────────────────────
export function BuscaOplInput({ busca, setBusca }: { busca: string; setBusca: (v: string) => void }) {
  return (
    <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>🔍</span>
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar por OPL, chassi, cliente ou projeto..."
        style={{ flex: 1, border: 'none', outline: 'none', fontSize: 11, background: 'transparent', color: '#1e293b' }}
      />
      {busca && (
        <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
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
  const [modalVer, setModalVer] = useState<any>(null);
  const [modalAcomp, setModalAcomp] = useState<any>(null);   // OP acompanhamento
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
                      <button className="acn-btn" style={{ background: '#0891b2', fontSize: 10 }}
                        onClick={() => setModalVer(d)}>👁 VER</button>
                      {/* Botão de acompanhamento — sempre visível se a demanda tem OP vinculada */}
                      {d.numero_opl && (
                        <button className="acn-btn" style={{ background: '#6366f1', fontSize: 9 }}
                          onClick={() => setModalAcomp(d)}>💬 ACOMP.</button>
                      )}
                      {/* OBS — visível para qualquer status (Pendente ou Em Andamento) */}
                      <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }}
                        onClick={() => { setModalObs(d); setObsTexto(''); }}>OBS</button>
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
            <label className="acn-label">Responsável *</label>
            <ColaboradorSelect
              value={responsavel} onChange={setResponsavel}
              placeholder="Selecione o responsável"
              className="acn-input" style={{ width: '100%', marginBottom: 12 }}
              autoFocus onKeyDown={e => e.key === 'Enter' && iniciar()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={iniciar}>INICIAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalIniciar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-title">Observação — {modalObs.descricao?.replace('[AJUSTE] ', '')}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 6 }}>
              Use @Nome para mencionar um colega
            </div>
            <MencaoTextarea
              value={obsTexto} onChange={setObsTexto} rows={3}
              placeholder="Adicione uma observação... @Nome para mencionar" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="acn-btn" style={{ background: cor || '#1e293b', flex: 1 }} onClick={salvarObs}>SALVAR</button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalObs(null)}>Fechar</button>
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
            <div className="modal-box" style={{ maxWidth: 520, maxHeight: '88vh', overflowY: 'auto' }}>
              <div className="modal-title">
                👁 Detalhes da Demanda
                {isAjuste && <span style={{ marginLeft: 8, fontSize: 10, background: '#f59e0b', color: '#fff', padding: '2px 7px', borderRadius: 10 }}>AJUSTE</span>}
              </div>

              {/* Info principal */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 14 }}>
                {[
                  ['Descrição', desc],
                  ['Status', d.status + (emAndamento && pausado ? ' (Pausado)' : '')],
                  ['OPL', d.numero_opl || '—'],
                  ['Setor', d.setor_destino || '—'],
                  ['Responsável', d.responsavel_nome || 'Não iniciado'],
                  ['Tempo útil', emAndamento && d.data_inicio ? fmtHMS(seg) : d.tempo_execucao_horas ? `${Number(d.tempo_execucao_horas).toFixed(2)}h` : '—'],
                  ['Aberta em', fmt(d.data_abertura)],
                  ['Iniciada em', fmt(d.data_inicio)],
                  ['Concluída em', fmt(d.data_conclusao)],
                  ['Aberto por', d.aberto_por || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#1e293b', fontWeight: 600, marginTop: 1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Observações */}
              {d.observacoes_execucao && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Observações</div>
                  <div style={{ fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap' }}>{d.observacoes_execucao}</div>
                </div>
              )}

              {/* Logs / histórico */}
              {logs.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Histórico de Ações</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {logs.map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                        <div style={{ flexShrink: 0, fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap', minWidth: 100 }}>
                          {l.hora ? new Date(l.hora).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 10, color: '#1e293b' }}>{l.texto}</span>
                          {l.usuario && <span style={{ fontSize: 9, color: '#6366f1', marginLeft: 6 }}>— {l.usuario}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <button className="acn-btn" style={{ background: '#94a3b8', width: '100%' }} onClick={() => setModalVer(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
