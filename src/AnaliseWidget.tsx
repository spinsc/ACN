// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE SETORES
// ─────────────────────────────────────────────────────────────────────────────
export const ANALISE_GRUPOS = [
  {
    grupo: 'Técnico / Comercial',
    opcoes: [
      { id: 'Comercial',  label: 'Comercial / ADM' },
      { id: 'Telecom',    label: 'Técnica Telecom' },
      { id: 'Engenharia', label: 'Técnica Engenharia' },
    ],
  },
  {
    grupo: 'Departamento',
    opcoes: [
      { id: 'Chicotes',    label: 'Chicotes' },
      { id: 'Serralheria', label: 'Serralheria' },
      { id: 'Producao',    label: 'Produção / Adaptação' },
      { id: 'Laboratorio', label: 'Laboratório' },
    ],
  },
];

export const SETOR_LABEL: Record<string, string> = {
  Comercial:  'Comercial/ADM',
  Telecom:    'Téc. Telecom',
  Engenharia: 'Téc. Engenharia',
  Chicotes:   'Chicotes',
  Serralheria:'Serralheria',
  Producao:   'Produção',
  Laboratorio:'Laboratório',
};

const SETOR_COR: Record<string, string> = {
  Comercial:  '#2563eb',
  Telecom:    '#0891b2',
  Engenharia: '#16a34a',
  Chicotes:   '#7c3aed',
  Serralheria:'#ea580c',
  Producao:   '#d97706',
  Laboratorio:'#dc2626',
};

const BUCKET = 'acn-media';

const fmtDT = (v: string) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return v; }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SOLICITAR ANÁLISE  (usado em Licitações e CRM)
// ─────────────────────────────────────────────────────────────────────────────
export function ModalSolicitarAnalise({
  origem,         // 'licitacao' | 'crm'
  origemId,
  origemTitulo,
  origemNumero,
  currentUser,
  onClose,
  onSaved,
}: any) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando]         = useState(false);
  const [existentes, setExistentes]     = useState<string[]>([]); // setores já solicitados ativos

  useEffect(() => {
    // carrega setores já solicitados e pendentes/em_andamento
    supabase
      .from('analise_solicitacoes')
      .select('id, analise_setores(setor, status)')
      .eq('origem_id', origemId)
      .eq('status', 'em_andamento')
      .then(({ data }) => {
        const already: string[] = [];
        (data || []).forEach((sol: any) => {
          (sol.analise_setores || []).forEach((s: any) => {
            if (s.status === 'pendente') already.push(s.setor);
          });
        });
        setExistentes(already);
      });
  }, [origemId]);

  const toggle = (id: string) =>
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const salvar = async () => {
    const novos = selecionados.filter(s => !existentes.includes(s));
    if (!novos.length) { alert('Selecione ao menos um setor que ainda não foi solicitado.'); return; }
    setSalvando(true);
    // criar solicitação
    const { data: sol, error } = await supabase
      .from('analise_solicitacoes')
      .insert({
        origem,
        origem_id: origemId,
        origem_titulo: origemTitulo,
        origem_numero: origemNumero || null,
        setores: novos,
        criado_por: currentUser?.nome || currentUser?.email || 'Usuário',
      })
      .select()
      .single();
    if (error || !sol) { alert('Erro ao criar solicitação: ' + (error?.message || 'unknown')); setSalvando(false); return; }

    // criar um registro por setor
    const rows = novos.map(s => ({ solicitacao_id: sol.id, setor: s, status: 'pendente' }));
    await supabase.from('analise_setores').insert(rows);

    setSalvando(false);
    onSaved?.();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:10, width:'min(520px,96vw)', padding:'20px 22px',
        boxShadow:'0 12px 40px #0005', maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color:'#1e293b' }}>🔍 Solicitar Análise</div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>{origemTitulo}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#94a3b8', cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize:11, color:'#374151', marginBottom:12 }}>
          Selecione os setores que devem analisar este processo. Cada setor receberá a demanda em sua aba correspondente.
        </div>

        {ANALISE_GRUPOS.map(g => (
          <div key={g.grupo} style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:8 }}>{g.grupo}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {g.opcoes.map(op => {
                const jaAtivo = existentes.includes(op.id);
                const sel = selecionados.includes(op.id);
                return (
                  <label key={op.id} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                    border:`1.5px solid ${sel ? SETOR_COR[op.id] : jaAtivo ? '#e2e8f0' : '#e2e8f0'}`,
                    borderRadius:6, cursor: jaAtivo ? 'not-allowed' : 'pointer',
                    background: sel ? SETOR_COR[op.id]+'12' : jaAtivo ? '#f8fafc' : '#fff',
                    opacity: jaAtivo ? .55 : 1,
                  }}>
                    <input type="checkbox" checked={sel || jaAtivo} disabled={jaAtivo}
                      onChange={() => !jaAtivo && toggle(op.id)}
                      style={{ width:15, height:15, accentColor: SETOR_COR[op.id] }} />
                    <span style={{ fontSize:11, fontWeight:600, color: sel ? SETOR_COR[op.id] : '#374151' }}>{op.label}</span>
                    {jaAtivo && <span style={{ marginLeft:'auto', fontSize:9, color:'#f59e0b', fontWeight:700 }}>⏳ Já solicitado</span>}
                    {!jaAtivo && (
                      <span style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%', background: SETOR_COR[op.id], opacity: sel?.5:0 }} />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={onClose} style={{ padding:'7px 18px', border:'1px solid #d1d5db', borderRadius:6, background:'#f8fafc', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || selecionados.filter(s=>!existentes.includes(s)).length===0}
            style={{ padding:'7px 20px', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:6,
              fontWeight:700, fontSize:11, cursor:'pointer',
              opacity: selecionados.filter(s=>!existentes.includes(s)).length ? 1 : .45 }}>
            {salvando ? 'Solicitando...' : `✓ Solicitar Análise (${selecionados.filter(s=>!existentes.includes(s)).length} setor${selecionados.filter(s=>!existentes.includes(s)).length!==1?'es':''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE  (para LicitCard e CRM card — mostra progresso da análise)
// ─────────────────────────────────────────────────────────────────────────────
export function AnaliseStatusBadge({ origemId }: { origemId: string }) {
  const [info, setInfo] = useState<{ total:number; feitos:number } | null>(null);

  useEffect(() => {
    supabase
      .from('analise_solicitacoes')
      .select('id, analise_setores(status)')
      .eq('origem_id', origemId)
      .eq('status', 'em_andamento')
      .then(({ data }) => {
        if (!data || !data.length) { setInfo(null); return; }
        let total = 0, feitos = 0;
        data.forEach((sol: any) => {
          (sol.analise_setores || []).forEach((s: any) => {
            total++;
            if (s.status === 'analisado') feitos++;
          });
        });
        setInfo({ total, feitos });
      });
  }, [origemId]);

  if (!info || !info.total) return null;

  const done = info.feitos === info.total;
  return (
    <span style={{
      fontSize:8, fontWeight:700, padding:'1px 6px', borderRadius:3,
      background: done ? '#dcfce7' : '#fef9c3',
      color: done ? '#166534' : '#92400e',
      border: `1px solid ${done ? '#86efac' : '#fde047'}`,
    }}>
      {done ? '✅ Análise OK' : `🔍 Análise ${info.feitos}/${info.total}`}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE STATUS DA ANÁLISE  (aba Análise no modal de Licitação/CRM)
// ─────────────────────────────────────────────────────────────────────────────
export function AnaliseStatusPanel({ origemId, origemTitulo, origemNumero, origem, currentUser, onSolicitarNova }: any) {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('analise_solicitacoes')
      .select('*, analise_setores(*)')
      .eq('origem_id', origemId)
      .order('criado_em', { ascending: false });
    setSolicitacoes(data || []);
    setLoading(false);
  }, [origemId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color:'#9ca3af', fontSize:11, padding:20, textAlign:'center' }}>Carregando...</div>;

  const ativas = solicitacoes.filter(s => s.status === 'em_andamento');
  const finalizadas = solicitacoes.filter(s => s.status === 'finalizada');

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Nova solicitação */}
      <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:11, color:'#0369a1' }}>🔍 Solicitar Análise Técnica/Comercial</div>
          <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>Demande a análise para os setores necessários.</div>
        </div>
        <button onClick={onSolicitarNova}
          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:5, padding:'6px 14px', fontWeight:700, fontSize:10, cursor:'pointer' }}>
          + Solicitar
        </button>
      </div>

      {/* Solicitações ativas */}
      {ativas.map(sol => {
        const setores = sol.analise_setores || [];
        const qtdFeita = setores.filter((s:any) => s.status === 'analisado').length;
        const pct = setores.length ? Math.round((qtdFeita/setores.length)*100) : 0;
        return (
          <div key={sol.id} style={{ border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden' }}>
            <div style={{ background:'#f8fafc', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f1f5f9' }}>
              <div>
                <span style={{ fontSize:10, fontWeight:700, color:'#1e293b' }}>Solicitação em andamento</span>
                <span style={{ fontSize:9, color:'#64748b', marginLeft:8 }}>por {sol.criado_por} · {fmtDT(sol.criado_em)}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:9, color:'#374151', fontWeight:700 }}>{qtdFeita}/{setores.length} setores</div>
                <div style={{ width:60, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background: pct===100?'#16a34a':'#f59e0b', borderRadius:3 }} />
                </div>
              </div>
            </div>
            <div style={{ padding:'8px 12px', display:'flex', gap:8, flexWrap:'wrap' }}>
              {setores.map((s:any) => (
                <div key={s.id} style={{
                  display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20,
                  background: s.status==='analisado' ? '#dcfce7' : '#fef9c3',
                  border: `1px solid ${s.status==='analisado' ? '#86efac' : '#fde047'}`,
                }}>
                  <span style={{ fontSize:9 }}>{s.status==='analisado' ? '✅' : '⏳'}</span>
                  <span style={{ fontSize:10, fontWeight:700, color: s.status==='analisado'?'#166534':'#92400e' }}>
                    {SETOR_LABEL[s.setor] || s.setor}
                  </span>
                  {s.status==='analisado' && s.analisado_por && (
                    <span style={{ fontSize:8, color:'#4ade80' }}>· {s.analisado_por}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Histórico finalizado */}
      {finalizadas.length > 0 && (
        <details>
          <summary style={{ fontSize:10, color:'#6b7280', cursor:'pointer', userSelect:'none' }}>
            ✅ {finalizadas.length} análise{finalizadas.length>1?'s':''} finalizada{finalizadas.length>1?'s':''}
          </summary>
          {finalizadas.map(sol => (
            <div key={sol.id} style={{ marginTop:6, border:'1px solid #dcfce7', borderRadius:5, padding:'6px 10px', background:'#f0fdf4' }}>
              <div style={{ fontSize:9, color:'#166534', marginBottom:4 }}>Solicitado por {sol.criado_por} · {fmtDT(sol.criado_em)}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {(sol.analise_setores||[]).map((s:any) => (
                  <span key={s.id} style={{ fontSize:9, background:'#dcfce7', color:'#166534', borderRadius:10, padding:'1px 7px', border:'1px solid #86efac' }}>
                    ✅ {SETOR_LABEL[s.setor]||s.setor}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}

      {!ativas.length && !finalizadas.length && (
        <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:20 }}>
          Nenhuma análise solicitada ainda para este processo.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALISE WIDGET  (embutido nas abas de destino — Comercial, Engenharia, etc.)
// ─────────────────────────────────────────────────────────────────────────────
export default function AnaliseWidget({ setor, currentUser }: { setor: string; currentUser: any }) {
  const [analises, setAnalises]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandido, setExpandido]   = useState<string|null>(null);
  const [notas, setNotas]           = useState<Record<string,string>>({});
  const [aprovando, setAprovando]   = useState<string|null>(null);
  const [uploadando, setUploadando] = useState<string|null>(null); // solicitacao_id sendo uploadado
  const [anexos, setAnexos]         = useState<Record<string,any[]>>({});
  const [collapsed, setCollapsed]   = useState(false);

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    // busca setores pendentes para este setor, com join na solicitacao
    const { data } = await supabase
      .from('analise_setores')
      .select('*, analise_solicitacoes(id, origem, origem_titulo, origem_numero, criado_por, criado_em, status)')
      .eq('setor', setor)
      .eq('status', 'pendente')
      .order('id', { ascending: false });
    const items = (data || []).filter(i => i.analise_solicitacoes?.status === 'em_andamento');
    setAnalises(items);
    if (!silent) setLoading(false);
    // carrega anexos para cada solicitação
    if (items.length) {
      const ids = [...new Set(items.map((i:any) => i.analise_solicitacoes?.id).filter(Boolean))];
      const { data: anx } = await supabase.from('analise_anexos').select('*').in('solicitacao_id', ids);
      const grouped: Record<string,any[]> = {};
      (anx || []).forEach((a:any) => {
        if (!grouped[a.solicitacao_id]) grouped[a.solicitacao_id] = [];
        grouped[a.solicitacao_id].push(a);
      });
      setAnexos(grouped);
    }
  }, [setor]);

  useEffect(() => { load(); const t = setInterval(()=>load(true), 60000); return ()=>clearInterval(t); }, [load]);

  const marcarAnalisado = async (item: any) => {
    setAprovando(item.id);
    const nota = notas[item.id] || item.notas || null;
    await supabase.from('analise_setores').update({
      status: 'analisado',
      analisado_por: currentUser?.nome || currentUser?.email || 'Sistema',
      analisado_em: new Date().toISOString(),
      notas: nota,
    }).eq('id', item.id);

    // verifica se todos os setores da solicitacao foram analisados
    const solId = item.analise_solicitacoes?.id;
    if (solId) {
      const { data: todos } = await supabase.from('analise_setores').select('status').eq('solicitacao_id', solId);
      const todosOk = (todos || []).every((s:any) => s.status === 'analisado');
      if (todosOk) {
        await supabase.from('analise_solicitacoes').update({ status: 'finalizada' }).eq('id', solId);
      }
    }
    setAprovando(null);
    load();
  };

  const uploadAnexo = async (solicitacaoId: string, file: File) => {
    setUploadando(solicitacaoId);
    const path = `analise/${solicitacaoId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const { data: up, error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (up) {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      await supabase.from('analise_anexos').insert({
        solicitacao_id: solicitacaoId,
        nome: file.name,
        url: pub?.publicUrl || '',
        criado_por: currentUser?.nome || 'Sistema',
        setor,
      });
      // reload anexos
      const { data: anx } = await supabase.from('analise_anexos').select('*').eq('solicitacao_id', solicitacaoId);
      setAnexos(prev => ({ ...prev, [solicitacaoId]: anx || [] }));
    } else if (error) {
      alert('Erro ao enviar arquivo: ' + error.message);
    }
    setUploadando(null);
  };

  const cor = SETOR_COR[setor] || '#374151';

  return (
    <div style={{ margin:'0 0 16px 0', border:`1px solid ${cor}30`, borderLeft:`4px solid ${cor}`, borderRadius:6, background:'#fff', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:`${cor}08`, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', borderBottom:`1px solid ${cor}20` }}
        onClick={()=>setCollapsed(c=>!c)}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:700, fontSize:11, color:cor }}>🔍 Análise de Licitações / CRM</span>
          {analises.length > 0 && !collapsed && (
            <span style={{ background:cor, color:'#fff', borderRadius:10, padding:'1px 8px', fontSize:9, fontWeight:800 }}>
              {analises.length} pendente{analises.length>1?'s':''}
            </span>
          )}
          {analises.length > 0 && collapsed && (
            <span style={{ background:'#fef9c3', color:'#92400e', borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700, border:'1px solid #fde047' }}>
              ⏳ {analises.length}
            </span>
          )}
        </div>
        <button onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#94a3b8', padding:'0 2px' }}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding:'10px 14px' }}>
          {loading ? (
            <div style={{ color:'#9ca3af', fontSize:11, padding:'8px 0' }}>Carregando análises...</div>
          ) : analises.length === 0 ? (
            <div style={{ color:'#9ca3af', fontSize:11, padding:'8px 0', textAlign:'center' }}>
              Nenhuma análise pendente para {SETOR_LABEL[setor]||setor}.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {analises.map(item => {
                const sol = item.analise_solicitacoes;
                const solId = sol?.id;
                const isExp = expandido === item.id;
                const isLicit = sol?.origem === 'licitacao';
                const anx = (solId && anexos[solId]) || [];

                return (
                  <div key={item.id} style={{ border:`1px solid ${cor}30`, borderRadius:5, overflow:'hidden' }}>
                    {/* Card header */}
                    <div onClick={()=>setExpandido(isExp ? null : item.id)}
                      style={{ background:`${cor}08`, padding:'8px 12px', cursor:'pointer',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ minWidth:0 }}>
                        <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:3, marginRight:6,
                          background: isLicit ? '#1e3a5f' : '#7c3aed', color:'#fff' }}>
                          {isLicit ? '🏛️ Licitação' : '🤝 CRM'}
                        </span>
                        <span style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>
                          {sol?.origem_numero && <span style={{ color:'#6b7280', marginRight:4 }}>{sol.origem_numero}</span>}
                          {sol?.origem_titulo || '—'}
                        </span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:8 }}>
                        <span style={{ fontSize:9, color:'#9ca3af' }}>
                          {sol?.criado_em ? new Date(sol.criado_em).toLocaleDateString('pt-BR') : ''}
                        </span>
                        <span style={{ fontSize:11, color:'#94a3b8' }}>{isExp ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Card body */}
                    {isExp && (
                      <div style={{ padding:'12px 14px', background:'#fff', borderTop:`1px solid ${cor}15` }}>

                        {/* ── ARQUIVOS COMUNS ── */}
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:6 }}>📎 Arquivos (comuns a todos os setores)</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                            {anx.length === 0 && (
                              <span style={{ fontSize:10, color:'#9ca3af' }}>Nenhum arquivo ainda.</span>
                            )}
                            {anx.map((a:any) => (
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                style={{ fontSize:9, background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe',
                                  borderRadius:4, padding:'3px 8px', textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}>
                                📄 {a.nome}
                                {a.criado_por && <span style={{ color:'#94a3b8', fontSize:8 }}>· {a.criado_por}</span>}
                              </a>
                            ))}
                          </div>
                          <label style={{ fontSize:10, color:cor, cursor:'pointer', fontWeight:600,
                            opacity: uploadando===solId ? .5 : 1 }}>
                            {uploadando===solId ? '⏳ Enviando...' : '+ Adicionar arquivo'}
                            <input type="file" hidden disabled={uploadando===solId}
                              onChange={e => { if (e.target.files?.[0] && solId) uploadAnexo(solId, e.target.files[0]); e.target.value=''; }} />
                          </label>
                        </div>

                        {/* ── NOTAS ── */}
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:4 }}>📝 Notas / Observações</div>
                          <textarea
                            value={notas[item.id] ?? (item.notas || '')}
                            onChange={e => setNotas(n => ({ ...n, [item.id]: e.target.value }))}
                            placeholder="Adicione observações da sua análise..."
                            rows={3}
                            style={{ width:'100%', boxSizing:'border-box', padding:'6px 8px',
                              border:`1px solid ${cor}40`, borderRadius:4, fontSize:11,
                              resize:'vertical', fontFamily:'inherit' }} />
                        </div>

                        {/* ── BOTÃO ANALISADO ── */}
                        <button onClick={() => marcarAnalisado(item)} disabled={aprovando===item.id}
                          style={{ background:cor, color:'#fff', border:'none', borderRadius:5,
                            padding:'8px 22px', fontWeight:800, fontSize:11, cursor:'pointer', width:'100%',
                            opacity: aprovando===item.id ? .6 : 1 }}>
                          {aprovando===item.id ? '⏳ Salvando...' : '✅ Marcar como Analisado'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
