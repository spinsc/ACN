// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';


// Todos os ajustes vivem em demandas_setoriais com descricao prefixada [AJUSTE]
// Nao existe dependencia de ajustes_trabalhos

export default function AjustesProjetoTab({ currentUser }) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    opl_referencia: '', requerente: '', descricao: '',
    prioridade: 'Normal', data_limite: '', setor: 'Serralheria',
  });
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [oplesLista, setOplesLista] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => { fetchAll(); fetchOples(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchOples = async () => {
    const { data } = await supabase
      .from('oples').select('id, opl, cliente_nome, status_geral')
      .not('status_geral', 'in', '("Faturado","Cancelado","Entregue")')
      .order('data_entrada', { ascending: false }).limit(200);
    setOplesLista(data || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .ilike('descricao', '[AJUSTE]%')
      .order('data_abertura', { ascending: false });
    if (error) console.error('AjustesProjetoTab fetchAll:', error);
    setAjustes(data || []);
    setLoading(false);
  };

  const salvar = async () => {
    if (!form.descricao.trim()) { alert('Preencha a descricao!'); return; }
    const agora = new Date().toISOString();
    const requerente = form.requerente || currentUser?.nome || currentUser?.email || 'Usuario';
    const { error } = await supabase.from('demandas_setoriais').insert([{
      setor_destino: form.setor,
      descricao: `[AJUSTE] ${form.descricao.trim()}`,
      numero_opl: form.opl_referencia || null,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: requerente,
      data_abertura: agora,
      logs_demanda: [{
        texto: `Ajuste de Projeto registrado. Requerente: ${requerente}. Prioridade: ${form.prioridade}.${form.data_limite ? ' Data limite: ' + new Date(form.data_limite).toLocaleDateString('pt-BR') : ''}`,
        usuario: currentUser?.nome || currentUser?.email,
        hora: agora,
        origem: 'ajuste',
      }],
    }]);
    if (error) {
      alert('Erro ao registrar ajuste: ' + error.message);
      console.error('salvar ajuste error:', error);
      return;
    }
    // Notifica o setor destino — evento específico para Compras, genérico para outros
    const eventoNotif = form.setor === 'Compras' ? 'demanda_criada_compras' : 'demanda_criada_setor';
    const mensagemNotif = msg.demandaCriada(form.setor, form.opl_referencia, form.descricao.trim(), requerente);
    notificarEvento(eventoNotif, mensagemNotif, form.setor);
    setForm({ opl_referencia: '', requerente: '', descricao: '', prioridade: 'Normal', data_limite: '', setor: 'Serralheria' });
    setShowForm(false);
    fetchAll();
  };

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const a = modalObs;
    const logs = a.logs_demanda || [];
    logs.push({ texto: novaObs, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({ logs_demanda: logs }).eq('id', a.id);
    setNovaObs(''); setModalObs(null); fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h != null ? Number(h).toFixed(1) + 'h' : '—';
  const tempoDecorrido = (inicio) => {
    if (!inicio) return '—';
    const diff = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    const hh = Math.floor(diff / 3600).toString().padStart(2, '0');
    const mm = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const ss = (diff % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const corPrioridade = (logs) => {
    const txt = (logs?.[0]?.texto || '').toLowerCase();
    if (txt.includes('prioridade: alta')) return '#ef4444';
    if (txt.includes('prioridade: media')) return '#f59e0b';
    if (txt.includes('prioridade: baixa')) return '#22c55e';
    return '#94a3b8';
  };

  const getPrioridade = (logs) => {
    const txt = logs?.[0]?.texto || '';
    const m = txt.match(/Prioridade:\s*(\w+)/);
    return m ? m[1] : 'Normal';
  };

  const abertos = ajustes.filter(a => a.status !== 'Concluido');
  const concluidos = ajustes.filter(a => a.status === 'Concluido');

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b' }}>
          <span style={{ color: '#92400e' }}>Registro de Ajustes de Projeto</span>
          {!showForm && (
            <button className="acn-btn" style={{ background: '#1e293b' }} onClick={() => setShowForm(true)}>
              + Novo Ajuste
            </button>
          )}
        </div>
        {showForm && (
          <div className="sec-body" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">OPL / Ref. (opcional)</label>
                <input className="acn-input" style={{ width: '100%' }} list="opl-datalist"
                  placeholder="Busque ou digite uma OP..."
                  value={form.opl_referencia}
                  onChange={e => setForm({ ...form, opl_referencia: e.target.value })} />
                <datalist id="opl-datalist">
                  {oplesLista.map(o => (
                    <option key={o.id} value={o.opl}>
                      {o.opl} — {o.cliente_nome || ''} ({o.status_geral || ''})
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="acn-label">Requerente</label>
                <input className="acn-input" style={{ width: '100%' }}
                  value={form.requerente || currentUser?.nome || ''}
                  onChange={e => setForm({ ...form, requerente: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="acn-label">Setor Responsavel</label>
                <select className="acn-input" style={{ width: '100%' }}
                  value={form.setor}
                  onChange={e => setForm({ ...form, setor: e.target.value })}>
                  <option>Comercial</option>
                  <option>Serralheria</option>
                  <option>Chicotes</option>
                  <option>Laboratorio</option>
                  <option>Compras</option>
                  <option>Almoxarifado</option>
                  <option>Engenharia</option>
                  <option>Producao</option>
                  <option>PCP</option>
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Prioridade</label>
                <select className="acn-input" style={{ width: '100%' }}
                  value={form.prioridade}
                  onChange={e => setForm({ ...form, prioridade: e.target.value })}>
                  <option>Normal</option><option>Baixa</option><option>Media</option><option>Alta</option>
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Data Limite</label>
                <input type="date" className="acn-input" style={{ width: '100%' }}
                  value={form.data_limite}
                  onChange={e => setForm({ ...form, data_limite: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <label className="acn-label">Descricao do Ajuste *</label>
                <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical' }}
                  placeholder="Descreva detalhadamente o ajuste necessario..."
                  value={form.descricao}
                  onChange={e => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="acn-btn" style={{ background: '#22c55e', flex: 1 }} onClick={salvar}>
                + Registrar Ajuste
              </button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AJUSTES ABERTOS */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Ajustes em Aberto ({abertos.length})</span></div>
        <div className="sec-body" style={{ overflowX: 'auto' }}>
          {loading ? <div className="acn-empty">Carregando...</div> : abertos.length === 0 ? (
            <div className="acn-empty">Nenhum ajuste em aberto.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>OPL Ref.</th><th>Requerente</th><th>Descricao</th>
                <th>Setor</th><th>Prioridade</th><th>Status</th><th>Responsavel</th><th>Tempo</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {abertos.map(a => {
                  const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                  const prio = getPrioridade(a.logs_demanda);
                  return (
                    <tr key={a.id} style={{ background: a.status === 'Em Andamento' ? '#fefce8' : '#fffbeb' }}>
                      <td>{fmtDt(a.data_abertura)}</td>
                      <td>{a.numero_opl || '—'}</td>
                      <td>{a.criado_por_nome || '—'}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>{desc}</td>
                      <td>{a.setor_destino || '—'}</td>
                      <td><span className="acn-badge" style={{ background: corPrioridade(a.logs_demanda) }}>{prio}</span></td>
                      <td>
                        <span className="acn-badge" style={{ background: a.status === 'Em Andamento' ? '#3b82f6' : '#f59e0b' }}>
                          {a.status}
                        </span>
                      </td>
                      <td>{a.responsavel_nome || '—'}</td>
                      <td>
                        {a.status === 'Em Andamento' && a.data_inicio
                          ? <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700 }}>{tempoDecorrido(a.data_inicio)}</span>
                          : fmtH(a.tempo_execucao_horas)
                        }
                      </td>
                      <td>
                        <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }}
                          onClick={() => { setModalObs(a); setNovaObs(''); }}>
                          VER / OBS
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* HISTORICO */}
      {concluidos.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Historico de Ajustes Concluidos ({concluidos.length})</span></div>
          <div className="sec-body" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Data</th><th>OPL Ref.</th><th>Requerente</th><th>Descricao</th>
              <th>Setor</th><th>Responsavel</th><th>Conclusao</th><th>Tempo</th>
            </tr></thead>
            <tbody>
              {concluidos.map(a => {
                const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                return (
                  <tr key={a.id}>
                    <td>{fmtDt(a.data_abertura)}</td>
                    <td>{a.numero_opl || '—'}</td>
                    <td>{a.criado_por_nome || '—'}</td>
                    <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={desc}>{desc}</td>
                    <td>{a.setor_destino || '—'}</td>
                    <td>{a.responsavel_nome || '—'}</td>
                    <td>{fmtDt(a.data_conclusao)}</td>
                    <td>{fmtH(a.tempo_execucao_horas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* MODAL OBS */}
    {modalObs && (
      <div className="modal-overlay">
        <div className="modal-box" style={{maxWidth:500}}>
          <div className="modal-title">Historico — {modalObs.descricao?.replace('[AJUSTE] ','')}</div>
          <div style={{maxHeight:180,overflowY:'auto',marginBottom:12,background:'#f8fafc',borderRadius:4,padding:'8px 10px',border:'1px solid #e2e8f0'}}>
            {(modalObs.logs_demanda||[]).length === 0
              ? <div style={{fontSize:10,color:'#94a3b8'}}>Sem historico de logs.</div>
              : (modalObs.logs_demanda||[]).map((l,i) => (
                <div key={i} style={{marginBottom:6,fontSize:10,borderBottom:'1px solid #e2e8f0',paddingBottom:4}}>
                  <span style={{color:'#94a3b8',fontSize:9}}>{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                  <div style={{color:'#374151',marginTop:2}}>{l.texto}</div>
                </div>
              ))
            }
          </div>
          <label className="acn-label">Nova Observacao</label>
          <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:8}}
            placeholder="Adicione uma observacao..." value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
          <div style={{display:'flex',gap:8}}>
            <button className="acn-btn" style={{background:'#1e293b',flex:1}} onClick={addObs}>SALVAR</button>
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalObs(null)}>Fechar</button>
          </div>
        </div>
      </div>
    )}

    <OplMovimentadas setor="Ajustes" />
    <DemandaFooter setor="Ajustes de Projeto" />
  </div>
);
}
