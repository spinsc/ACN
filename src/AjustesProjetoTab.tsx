// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { NovaDemandaModal } from './DemandaAvulsaPanel';
import { escopoDeDemandas } from './utils/permissoes';

// Ajustes registrados ANTES desta unificação vivem em demandas_setoriais
// com descricao prefixada [AJUSTE] — a tabela abaixo ("Ajustes em Aberto" /
// "Histórico") continua lendo/agindo sobre eles exatamente como antes, sem
// mudança, pra não perder o que já existia. A partir de agora, "+ Nova
// Demanda" abre o formulário unificado de Demandas Avulsas (com vínculo
// real a OP/OS/PV/Compra/OFI e um setor de destino escolhido no ato) —
// os novos registros passam a aparecer na tela do setor que recebeu, não
// mais nesta lista (mesma filosofia do sistema antigo: quem acompanha o
// andamento é o setor receptor). Campos do formulário antigo sem
// equivalente direto (Requerente, Tipo de Solicitação, Centro de Custo)
// saem — o criador já é registrado (currentUser), igual em todo o resto do
// sistema unificado; Tipo de Solicitação já não era gravado há tempos
// (sempre null no insert antigo).
const SETORES_DESTINO = ['Comercial','Serralheria','Chicotes','Laboratorio','Telecom','Compras','Almoxarifado','Engenharia','Producao','PCP'];

export default function AjustesProjetoTab({ currentUser }) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [tick, setTick] = useState(0);

  // ── MINHAS DEMANDAS (28/09/2026) ───────────────────────────────────────────
  // Quem abria uma demanda aqui não tinha como acompanhá-la: ela caía na tela
  // do setor de destino e sumia da vista de quem pediu. Agora esta tela mostra
  // o que a pessoa abriu — e, para gerente e Admin, também o que a equipe abriu.
  const [minhas, setMinhas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [filtroUsuario, setFiltroUsuario] = useState('');   // '' = todos do meu alcance
  const [verConcluidas, setVerConcluidas] = useState(false);
  const escopo = escopoDeDemandas(currentUser);

  /** De quem esta pessoa pode ver demandas. null = de todo mundo. */
  const emailsVisiveis = () => {
    if (escopo.modo === 'todas') return null;
    if (escopo.modo === 'setor') {
      const doSetor = usuarios.filter(u => escopo.perfis.includes(String(u.perfil || '').trim()));
      return [...new Set([currentUser?.email, ...doSetor.map(u => u.email)].filter(Boolean))];
    }
    return [currentUser?.email].filter(Boolean);
  };

  const carregarMinhas = async () => {
    let q = supabase.from('demandas_avulsas')
      .select('id,titulo,setor,status,prioridade,prazo,criado_em,criado_por,criado_por_nome,responsavel_nome,vinculo_descricao')
      .order('criado_em', { ascending: false }).limit(300);
    const alcance = emailsVisiveis();
    if (filtroUsuario) q = q.eq('criado_por', filtroUsuario);
    else if (alcance) q = q.in('criado_por', alcance.length ? alcance : ['—sem—']);
    const { data } = await q;
    setMinhas(data || []);
  };

  useEffect(() => {
    if (escopo.modo === 'proprias') { setUsuarios([]); return; }
    supabase.from('auth_usuarios').select('email,nome,perfil').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios(data || []));
  }, [currentUser?.email]);

  useEffect(() => { carregarMinhas(); }, [filtroUsuario, usuarios.length, currentUser?.email]);

  // no filtro, um Admin vê todo mundo; o gerente, só a equipe dele
  const usuariosDoFiltro = escopo.modo === 'todas' ? usuarios
    : usuarios.filter(u => escopo.perfis?.includes(String(u.perfil || '').trim()) || u.email === currentUser?.email);

  const minhasVisiveis = minhas.filter(d => verConcluidas
    || !/conclu|cancel/i.test(String(d.status || '')));

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const a = modalObs;
    const logs = a.logs_demanda || [];
    logs.push({ texto: novaObs, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() });
    await supabase.from('demandas_setoriais').update({ logs_demanda: logs }).eq('id', a.id);
    logChange({ module: 'demandas_gerais', entityType: 'demandas_setoriais', entityId: a.id, changeType: 'UPDATE',
      oldRow: { observacao: null }, newRow: { observacao: novaObs.slice(0, 120) }, user: currentUser });
    setNovaObs(''); fecharModalObs(); fetchAll();
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

  const corDoStatus = (s) => {
    const t = String(s || '').toLowerCase();
    if (/conclu/.test(t)) return '#16a34a';
    if (/cancel/.test(t)) return '#94a3b8';
    if (/andamento|execu/.test(t)) return '#2563eb';
    return '#f59e0b';
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
  const { naoLidoSet: ajustesNaoLidos, marcarLidoLocal: marcarAjusteLidoLocal } = useUnreadMap('demandas_setoriais', ajustes.map(a => a.id), currentUser);
  const marcarAjusteLido = useMarkAsRead('demandas_setoriais', modalObs?.id, currentUser);
  const fecharModalObs = () => { marcarAjusteLido(); if (modalObs?.id) marcarAjusteLidoLocal(modalObs.id); setModalObs(null); };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b' }}>
          <span style={{ color: '#92400e' }}>Demandas Gerais</span>
          <button className="acn-btn" style={{ background: '#1e293b' }} onClick={() => setModalNova(true)}>
            + Nova Demanda
          </button>
        </div>
        <div className="sec-body" style={{ fontSize: 10, color: '#92400e' }}>
          Vincule a uma OP/OS/PV/Compra/OFI se for o caso, escolha o setor de destino e a demanda já cai
          direto na tela daquele setor — mesmo formulário rico usado em Engenharia/Almoxarifado/PCP/Compras.
        </div>
      </div>

      {modalNova && (
        <NovaDemandaModal currentUser={currentUser} setoresDestino={SETORES_DESTINO}
          onClose={() => setModalNova(false)}
          onSaved={() => { setModalNova(false); carregarMinhas(); }} />
      )}

      {/* ACOMPANHAMENTO — o que eu pedi, e para onde foi */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>
            {escopo.modo === 'todas' ? 'Demandas abertas por todos' :
             escopo.modo === 'setor' ? 'Demandas do meu setor' : 'Demandas que eu abri'}
            {' '}({minhasVisiveis.length})
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {usuariosDoFiltro.length > 1 && (
              <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
                aria-label="Filtrar por quem abriu"
                style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }}>
                <option value="">Quem abriu: todos</option>
                {usuariosDoFiltro.map(u => <option key={u.email} value={u.email}>{u.nome}</option>)}
              </select>
            )}
            <button className="acn-btn" style={{ background: verConcluidas ? '#0f766e' : '#94a3b8', fontSize: 10 }}
              onClick={() => setVerConcluidas(v => !v)}>
              {verConcluidas ? 'Escondendo nada' : 'Ver concluídas'}
            </button>
          </div>
        </div>
        <div className="sec-body" style={{ overflowX: 'auto' }}>
          {minhasVisiveis.length === 0 ? (
            <div className="acn-empty">
              {filtroUsuario ? 'Esta pessoa não tem demandas em aberto.' : 'Nenhuma demanda em aberto.'}
            </div>
          ) : (
            <table>
              <thead><tr>
                <th>Aberta em</th><th>Quem abriu</th><th>Demanda</th><th>Setor</th>
                <th>Vínculo</th><th>Responsável</th><th>Prazo</th><th>Status</th>
              </tr></thead>
              <tbody>
                {minhasVisiveis.map(d => (
                  <tr key={d.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDt(d.criado_em)}</td>
                    <td>{d.criado_por_nome || '—'}</td>
                    <td style={{ maxWidth: 220, wordBreak: 'break-word' }}>{d.titulo || '—'}</td>
                    <td>{d.setor || '—'}</td>
                    <td style={{ fontSize: 9, color: '#64748b' }}>{d.vinculo_descricao || '—'}</td>
                    <td>{d.responsavel_nome || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{d.prazo ? fmtDt(d.prazo) : '—'}</td>
                    <td><span className="acn-badge" style={{ background: corDoStatus(d.status) }}>{d.status || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* AJUSTES ABERTOS — histórico do sistema antigo, registrado antes desta unificação */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Ajustes em Aberto (histórico) ({abertos.length})</span></div>
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
                  const naoLida = ajustesNaoLidos.has(String(a.id));
                  return (
                    <tr key={a.id} style={naoLida
                      ? { background:'#fffdf0', boxShadow:'inset 3px 0 0 #eab308' }
                      : { background: a.status === 'Em Andamento' ? '#fefce8' : '#fffbeb' }}>
                      <td>{fmtDt(a.data_abertura)}</td>
                      <td>{a.numero_opl || '—'}</td>
                      <td>{a.criado_por_nome || '—'}</td>
                      <td style={{ maxWidth: 180, wordBreak:'break-word' }} title={desc}>{desc}</td>
                      <td>
                        {a.setor_destino || '—'}
                        {a.setor_destino === 'Compras' && a.tipo_solicitacao && (
                          <div style={{ fontSize: 8, fontWeight: 700, color: a.tipo_solicitacao === 'cotacao' ? '#7c3aed' : '#0891b2', marginTop: 1 }}>
                            {a.tipo_solicitacao === 'cotacao' ? '📋 Cotação' : '🛒 Compra'}
                          </div>
                        )}
                      </td>
                      <td><span className="acn-badge" style={{ background: corPrioridade(a.logs_demanda) }}>{prio}</span></td>
                      <td>
                        <span className="acn-badge" style={{ background: a.status === 'Em Andamento' ? '#3b82f6' : '#f59e0b' }}>
                          {a.status}
                        </span>
                      </td>
                      <td>{a.responsavel_nome || '—'}</td>
                      <td>
                        {a.status === 'Em Andamento' && a.data_inicio
                          ? <span style={{ fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", color: '#2563eb', fontWeight: 700 }}>{tempoDecorrido(a.data_inicio)}</span>
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
                    <td style={{ maxWidth:200, wordBreak:'break-word' }} title={desc}>{desc}</td>
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
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={fecharModalObs}>Fechar</button>
          </div>
        </div>
      </div>
    )}

    <OplMovimentadas setor="Ajustes" />
    <DemandaFooter setor="Ajustes de Projeto" />
  </div>
);
}
