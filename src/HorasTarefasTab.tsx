// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// HorasTarefasTab — sub-aba "Horas/Tarefas" da Engenharia
// Controle de tarefas com início/fim; toda pausa exige motivo. Relatório de
// horas e tarefas por período.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';

const STATUS_COR: Record<string, string> = {
  nao_iniciada: '#94a3b8', em_andamento: '#3b82f6', pausada: '#f59e0b', concluida: '#22c55e',
};
const STATUS_LABEL: Record<string, string> = {
  nao_iniciada: 'Não Iniciada', em_andamento: 'Em Andamento', pausada: 'Pausada', concluida: 'Concluída',
};

function fmtDtHr(d: string) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fmtDt(d: string) { return d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'; }

function fmtDuracao(segundos: number) {
  const s = Math.max(0, Math.floor(segundos || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Tempo decorrido líquido (descontando pausas) em segundos
function tempoDecorrido(tarefa: any, agora: number) {
  if (!tarefa.data_inicio) return 0;
  const fim = tarefa.status === 'concluida' && tarefa.data_conclusao
    ? new Date(tarefa.data_conclusao).getTime()
    : agora;
  const bruto = (fim - new Date(tarefa.data_inicio).getTime()) / 1000;
  let pausadoAtual = 0;
  if (tarefa.status === 'pausada') {
    const ultimaPausa = (tarefa.pausas || [])[tarefa.pausas.length - 1];
    if (ultimaPausa && !ultimaPausa.retomado_em) {
      pausadoAtual = (agora - new Date(ultimaPausa.pausado_em).getTime()) / 1000;
    }
  }
  return Math.max(0, bruto - (tarefa.tempo_pausado_segundos || 0) - pausadoAtual);
}

// ─── Modal Nova Tarefa ────────────────────────────────────────────────────────
function ModalNovaTarefa({ onClose, onCriado, currentUser }: any) {
  const [titulo, setTitulo] = useState('');
  const [responsavel, setResponsavel] = useState(currentUser?.nome || '');
  const [opBusca, setOpBusca] = useState('');
  const [opResultados, setOpResultados] = useState<any[]>([]);
  const [opSelecionada, setOpSelecionada] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const buscarOps = async (q: string) => {
    setOpBusca(q); setOpSelecionada(null);
    if (!q.trim()) { setOpResultados([]); return; }
    const { data } = await supabase.from('oples').select('id,opl,cliente_nome').ilike('opl', `%${q}%`).limit(8);
    setOpResultados(data || []);
  };

  const criar = async () => {
    if (!titulo.trim()) { alert('Informe o título da tarefa.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('engenharia_horas_tarefas').insert([{
      opl_id: opSelecionada?.id || null,
      numero_opl: opSelecionada?.opl || null,
      titulo: titulo.trim(),
      responsavel_nome: responsavel.trim() || null,
      status: 'nao_iniciada',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    onCriado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="modal-title">+ Nova Tarefa</div>

        <label className="acn-label">Título da Tarefa *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 8 }}
          placeholder="Ex: Revisão de desenho técnico" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />

        <label className="acn-label">Responsável</label>
        <div style={{ marginBottom: 8 }}>
          <ColaboradorSelect value={responsavel} onChange={setResponsavel} placeholder="Selecione o responsável" />
        </div>

        <label className="acn-label">Vincular a uma OP/OS (opcional)</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 4 }}
          placeholder="Buscar por número da OP..." value={opBusca} onChange={e => buscarOps(e.target.value)} />
        {opResultados.length > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 8, maxHeight: 120, overflowY: 'auto' }}>
            {opResultados.map(o => (
              <div key={o.id} onClick={() => { setOpSelecionada(o); setOpBusca(o.opl); setOpResultados([]); }}
                style={{ padding: '5px 8px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                <strong>{o.opl}</strong> — {o.cliente_nome || '—'}
              </div>
            ))}
          </div>
        )}
        {opSelecionada && <div style={{ fontSize: 10, color: '#15803d', marginBottom: 8 }}>✅ Vinculado a {opSelecionada.opl}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} disabled={salvando} onClick={criar}>
            {salvando ? 'Criando...' : '✅ Criar Tarefa'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Pausar (motivo obrigatório) ────────────────────────────────────────
function ModalPausar({ tarefa, onClose, onPausado }: any) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo da pausa.'); return; }
    setSalvando(true);
    const pausas = [...(tarefa.pausas || []), { motivo: motivo.trim(), pausado_em: new Date().toISOString(), retomado_em: null }];
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'pausada', pausas, atualizado_em: new Date().toISOString(),
    }).eq('id', tarefa.id);
    setSalvando(false);
    onPausado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-title">⏸ Pausar Tarefa — {tarefa.titulo}</div>
        <label className="acn-label">Motivo da Pausa *</label>
        <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          placeholder="Ex: Aguardando material, reunião, fim do expediente..."
          value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#f59e0b', flex: 1 }} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Salvando...' : '⏸ Confirmar Pausa'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Linha de tarefa ──────────────────────────────────────────────────────────
function LinhaTarefa({ tarefa, agora, onAtualizado, currentUser }: any) {
  const [modalPausar, setModalPausar] = useState(false);
  const [verLog, setVerLog] = useState(false);

  const decorrido = tempoDecorrido(tarefa, agora);

  const iniciar = async () => {
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'em_andamento', data_inicio: new Date().toISOString(),
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  const retomar = async () => {
    const pausas = [...(tarefa.pausas || [])];
    const ultima = pausas[pausas.length - 1];
    let acumulado = tarefa.tempo_pausado_segundos || 0;
    if (ultima && !ultima.retomado_em) {
      const agoraIso = new Date().toISOString();
      acumulado += (new Date(agoraIso).getTime() - new Date(ultima.pausado_em).getTime()) / 1000;
      ultima.retomado_em = agoraIso;
    }
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'em_andamento', pausas, tempo_pausado_segundos: acumulado,
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  const concluir = async () => {
    if (!confirm('Concluir esta tarefa?')) return;
    const total = tempoDecorrido(tarefa, Date.now());
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'concluida', data_conclusao: new Date().toISOString(), tempo_total_segundos: total,
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  return (
    <>
      <tr>
        <td>
          {tarefa.titulo}
          {tarefa.numero_opl && <div style={{ fontSize: 9, color: '#64748b' }}>OPL: {tarefa.numero_opl}</div>}
        </td>
        <td>{tarefa.responsavel_nome || '—'}</td>
        <td><span className="acn-badge" style={{ background: STATUS_COR[tarefa.status] }}>{STATUS_LABEL[tarefa.status]}</span></td>
        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: tarefa.status === 'pausada' ? '#f59e0b' : '#2563eb' }}>
          {tarefa.data_inicio ? fmtDuracao(decorrido) : '—'}
        </td>
        <td style={{ fontSize: 10 }}>{fmtDtHr(tarefa.data_inicio)}</td>
        <td>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tarefa.status === 'nao_iniciada' && (
              <button className="acn-btn" style={{ background: '#2563eb', fontSize: 9 }} onClick={iniciar}>▶ Iniciar</button>
            )}
            {tarefa.status === 'em_andamento' && (
              <button className="acn-btn" style={{ background: '#f59e0b', fontSize: 9 }} onClick={() => setModalPausar(true)}>⏸ Pausar</button>
            )}
            {tarefa.status === 'pausada' && (
              <button className="acn-btn" style={{ background: '#16a34a', fontSize: 9 }} onClick={retomar}>▶ Retomar</button>
            )}
            {(tarefa.status === 'em_andamento' || tarefa.status === 'pausada') && (
              <button className="acn-btn" style={{ background: '#22c55e', fontSize: 9 }} onClick={concluir}>✅ Concluir</button>
            )}
            {(tarefa.pausas || []).length > 0 && (
              <button className="acn-btn" style={{ background: '#475569', fontSize: 9 }} onClick={() => setVerLog(v => !v)}>
                📋 Pausas ({tarefa.pausas.length})
              </button>
            )}
          </div>
        </td>
      </tr>
      {verLog && (
        <tr>
          <td colSpan={6} style={{ background: '#f8fafc', padding: '8px 12px' }}>
            {(tarefa.pausas || []).map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 10, marginBottom: 4, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                <strong>{fmtDtHr(p.pausado_em)}</strong>{p.retomado_em ? ` → ${fmtDtHr(p.retomado_em)}` : ' (pausa ativa)'}
                <div style={{ color: '#475569' }}>Motivo: {p.motivo}</div>
              </div>
            ))}
          </td>
        </tr>
      )}
      {modalPausar && createPortal(
        <ModalPausar tarefa={tarefa} onClose={() => setModalPausar(false)}
          onPausado={() => { setModalPausar(false); onAtualizado(); }} />,
        document.body,
      )}
    </>
  );
}

// ─── Relatório por Período ─────────────────────────────────────────────────────
function RelatorioHoras() {
  const [de, setDe] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [ate, setAte] = useState(() => new Date().toISOString().split('T')[0]);
  const [dados, setDados] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);

  const buscar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('engenharia_horas_tarefas').select('*')
      .gte('criado_em', de + 'T00:00:00').lte('criado_em', ate + 'T23:59:59')
      .order('criado_em', { ascending: false });
    setDados(data || []);
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, []);

  const concluidas = dados.filter(t => t.status === 'concluida');
  const tempoTotal = concluidas.reduce((a, t) => a + (t.tempo_total_segundos || 0), 0);
  const porResponsavel = dados.reduce((acc: any, t) => {
    const k = t.responsavel_nome || 'Sem responsável';
    if (!acc[k]) acc[k] = { total: 0, concluidas: 0, tempoSegundos: 0 };
    acc[k].total++;
    if (t.status === 'concluida') { acc[k].concluidas++; acc[k].tempoSegundos += (t.tempo_total_segundos || 0); }
    return acc;
  }, {});
  const motivosPausa: Record<string, number> = {};
  dados.forEach(t => (t.pausas || []).forEach((p: any) => { motivosPausa[p.motivo] = (motivosPausa[p.motivo] || 0) + 1; }));

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Filtros do Relatório</span></div>
        <div className="sec-body">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" style={{ width: '100%' }} value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" style={{ width: '100%' }} value={ate} onChange={e => setAte(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="acn-btn" style={{ background: '#1e293b' }} onClick={buscar}>Filtrar</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Totais do Período</span></div>
        <div className="sec-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Tarefas no Período', val: dados.length, cor: '#1e293b' },
              { label: 'Concluídas', val: concluidas.length, cor: '#22c55e' },
              { label: 'Em Andamento/Pausadas', val: dados.filter(t => t.status === 'em_andamento' || t.status === 'pausada').length, cor: '#3b82f6' },
              { label: 'Horas Trabalhadas (concluídas)', val: fmtDuracao(tempoTotal), cor: '#7c3aed' },
            ].map(c => (
              <div key={c.label} style={{ flex: '1 1 150px', minWidth: 130, background: 'white', border: '1px solid #e2e8f0', borderTop: `3px solid ${c.cor}`, borderRadius: 4, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.cor }}>{carregando ? '...' : c.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por Responsável</span></div>
        <div className="sec-body" style={{ overflowX: 'auto' }}>
          {Object.keys(porResponsavel).length === 0 ? <div className="acn-empty">Nenhuma tarefa no período.</div> : (
            <table>
              <thead><tr><th>Responsável</th><th>Tarefas</th><th>Concluídas</th><th>Horas (concluídas)</th></tr></thead>
              <tbody>
                {Object.entries(porResponsavel).map(([nome, v]: any) => (
                  <tr key={nome}>
                    <td>{nome}</td><td>{v.total}</td><td>{v.concluidas}</td><td>{fmtDuracao(v.tempoSegundos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {Object.keys(motivosPausa).length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Motivos de Pausa Mais Frequentes</span></div>
          <div className="sec-body" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Motivo</th><th>Ocorrências</th></tr></thead>
              <tbody>
                {Object.entries(motivosPausa).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => (
                  <tr key={motivo}><td>{motivo}</td><td>{n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function HorasTarefasTab({ currentUser }: { currentUser: any }) {
  const [aba, setAba] = useState<'tarefas' | 'relatorio'>('tarefas');
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'nao_iniciada' | 'em_andamento' | 'pausada' | 'concluida'>('todas');
  const [modalNova, setModalNova] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('engenharia_horas_tarefas').select('*').order('criado_em', { ascending: false });
    setTarefas(data || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(t); }, []);

  const filtradas = filtro === 'todas' ? tarefas : tarefas.filter(t => t.status === filtro);

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '2px solid #1e293b' }}>
        <button style={{ flex: 1, padding: '8px', background: aba === 'tarefas' ? '#1e293b' : 'white', color: aba === 'tarefas' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          onClick={() => setAba('tarefas')}>⏱️ Tarefas</button>
        <button style={{ flex: 1, padding: '8px', background: aba === 'relatorio' ? '#1e293b' : 'white', color: aba === 'relatorio' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          onClick={() => setAba('relatorio')}>📊 Relatório por Período</button>
      </div>

      {aba === 'relatorio' ? <RelatorioHoras /> : (
        <>
          <div className="sec-card">
            <div className="sec-hdr">
              <span>⏱️ Controle de Horas/Tarefas ({filtradas.length})</span>
              <button className="acn-btn" style={{ background: '#0f766e', fontSize: 10 }} onClick={() => setModalNova(true)}>+ Nova Tarefa</button>
            </div>
            <div className="sec-body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['todas', 'nao_iniciada', 'em_andamento', 'pausada', 'concluida'] as const).map(f => (
                <button key={f} className="acn-btn"
                  style={{ background: filtro === f ? '#1e293b' : '#e2e8f0', color: filtro === f ? '#fff' : '#475569', fontSize: 10 }}
                  onClick={() => setFiltro(f)}>
                  {f === 'todas' ? 'Todas' : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
            <div className="sec-body" style={{ overflowX: 'auto', paddingTop: 0 }}>
              {loading ? <div className="acn-empty">Carregando...</div> : filtradas.length === 0 ? (
                <div className="acn-empty">Nenhuma tarefa {filtro !== 'todas' ? 'nesse filtro' : 'cadastrada ainda'}.</div>
              ) : (
                <table>
                  <thead><tr><th>Tarefa</th><th>Responsável</th><th>Status</th><th>Tempo</th><th>Início</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filtradas.map(t => (
                      <LinhaTarefa key={t.id} tarefa={t} agora={tick} onAtualizado={carregar} currentUser={currentUser} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {modalNova && (
        <ModalNovaTarefa currentUser={currentUser} onClose={() => setModalNova(false)}
          onCriado={() => { setModalNova(false); carregar(); }} />
      )}
    </div>
  );
}
