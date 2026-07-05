// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';


const PERFIS = ['Admin','Gerente','Comercial','Engenharia','PCP','Almoxarifado','Producao','CQ','Fiscal','Logistica','Visualizador'];

// ---- USUARIOS ----
const TODAS_ABAS = [
  { id:'dashboard',    label:'Dashboard' },
  { id:'comercial',    label:'1. Comercial' },
  { id:'engenharia',   label:'2. Engenharia' },
  { id:'ajustes',      label:'2b. Ajustes de Projeto' },
  { id:'pcp',          label:'3. PCP' },
  { id:'serralheria',  label:'4b. Serralheria' },
  { id:'chicotes',     label:'4c. Chicotes' },
  { id:'laboratorio',  label:'5. Laboratorio' },
  { id:'compras',      label:'6. Compras' },
  { id:'almoxarifado', label:'7. Almoxarifado' },
  { id:'producao',     label:'8. Producao' },
  { id:'qualidade',    label:'9. CQ & Historico' },
  { id:'logistica',    label:'10. Logistica In/Out' },
  { id:'vistorias',    label:'11. Vistorias Patio' },
  { id:'fiscal',       label:'12. Fiscal' },
  { id:'relatorios',   label:'Relatorios' },
  { id:'admin',        label:'Admin' },
];

function ModalPermissoes({ usuario, onClose, onSalvo }) {
  const [selecionadas, setSelecionadas] = useState(
    Array.isArray(usuario.abas_permitidas) && usuario.abas_permitidas.length > 0
      ? usuario.abas_permitidas
      : TODAS_ABAS.map(a => a.id) // padrão: todas liberadas
  );
  const [salvando, setSalvando] = useState(false);

  const toggle = (id) => setSelecionadas(prev =>
    prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
  );
  const todasOn = selecionadas.length === TODAS_ABAS.length;

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from('auth_usuarios')
      .update({ abas_permitidas: selecionadas }).eq('id', usuario.id);
    if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
    onSalvo();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:480}}>
        <div className="modal-title">Permissões de Acesso — {usuario.nome}</div>
        <div style={{fontSize:10,color:'#64748b',marginBottom:10}}>
          Marque as abas que este usuário pode visualizar. Dashboard é sempre visível.
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <button className="acn-btn" style={{background:'#1e293b',fontSize:9}}
            onClick={()=>setSelecionadas(TODAS_ABAS.map(a=>a.id))}>Marcar Todas</button>
          <button className="acn-btn" style={{background:'#94a3b8',fontSize:9}}
            onClick={()=>setSelecionadas(['dashboard'])}>Limpar</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:14}}>
          {TODAS_ABAS.map(aba => (
            <label key={aba.id} style={{
              display:'flex',alignItems:'center',gap:6,padding:'5px 8px',
              border:'1px solid',borderRadius:3,cursor:'pointer',
              borderColor: selecionadas.includes(aba.id) ? '#1e293b' : '#e5e7eb',
              background: selecionadas.includes(aba.id) ? '#f0f9ff' : 'transparent',
              fontSize:10,fontWeight: selecionadas.includes(aba.id)?700:400,
            }}>
              <input type="checkbox" checked={selecionadas.includes(aba.id)}
                onChange={()=>aba.id!=='dashboard'&&toggle(aba.id)}
                style={{accentColor:'#1e293b'}} disabled={aba.id==='dashboard'} />
              {aba.label}
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px'}} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'SALVAR PERMISSÕES'}
          </button>
          <button className="acn-btn" style={{background:'#94a3b8'}} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function PainelUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ nome:'', email:'', senha:'', perfil:'Operador', abas_permitidas: TODAS_ABAS.map(a=>a.id) });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalPerm, setModalPerm] = useState(null);

  useEffect(() => { fetchUsuarios(); }, []);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data } = await supabase.from('auth_usuarios').select('*').order('nome');
    setUsuarios(data || []);
    setLoading(false);
  };

  const toggleAba = (id) => setForm(f => ({
    ...f,
    abas_permitidas: f.abas_permitidas.includes(id)
      ? f.abas_permitidas.filter(a => a !== id)
      : [...f.abas_permitidas, id]
  }));

  const salvar = async () => {
    if (!form.nome || !form.email || !form.senha) { alert('Preencha nome, email e senha!'); return; }
    const { error } = await supabase.from('auth_usuarios').insert([{ ...form, ativo: true }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setForm({ nome:'', email:'', senha:'', perfil:'Operador', abas_permitidas: TODAS_ABAS.map(a=>a.id) });
    setShowForm(false); fetchUsuarios();
  };

  const toggleAtivo = async (u) => {
    await supabase.from('auth_usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
    fetchUsuarios();
  };

  const alterarPerfil = async (u, perfil) => {
    await supabase.from('auth_usuarios').update({ perfil }).eq('id', u.id);
    fetchUsuarios();
  };

  const resetarSenha = async (u) => {
    const nova = prompt(`Nova senha para ${u.nome}:`);
    if (!nova || nova.length < 4) { alert('Senha muito curta!'); return; }
    await supabase.from('auth_usuarios').update({ senha: nova }).eq('id', u.id);
    alert('Senha alterada com sucesso!');
  };

  return (
    <div>
      {modalPerm && (
        <ModalPermissoes
          usuario={modalPerm}
          onClose={() => setModalPerm(null)}
          onSalvo={fetchUsuarios}
        />
      )}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Usuarios do Sistema ({usuarios.length})</span>
          <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>setShowForm(s=>!s)}>
            {showForm ? 'Cancelar' : '+ Novo Usuario'}
          </button>
        </div>
        {showForm && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group"><label className="acn-label">Nome Completo *</label>
                <input className="acn-input" style={{width:'100%'}} value={form.nome}
                  onChange={e=>setForm({...form,nome:e.target.value.toUpperCase()})} /></div>
              <div className="form-group"><label className="acn-label">E-mail (login) *</label>
                <input type="email" className="acn-input" style={{width:'100%'}} value={form.email}
                  onChange={e=>setForm({...form,email:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Senha *</label>
                <input type="password" className="acn-input" style={{width:'100%'}} value={form.senha}
                  onChange={e=>setForm({...form,senha:e.target.value})} /></div>
              <div className="form-group"><label className="acn-label">Perfil</label>
                <select className="acn-input" style={{width:'100%'}} value={form.perfil}
                  onChange={e=>setForm({...form,perfil:e.target.value})}>
                  {PERFIS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {/* Seleção de abas */}
            <div style={{marginTop:8}}>
              <label className="acn-label" style={{marginBottom:6}}>Abas com Acesso</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:4}}>
                {TODAS_ABAS.map(aba => (
                  <label key={aba.id} style={{
                    display:'flex',alignItems:'center',gap:5,padding:'4px 7px',
                    border:'1px solid',borderRadius:3,cursor:'pointer',fontSize:10,
                    borderColor: form.abas_permitidas.includes(aba.id)?'#1e293b':'#e5e7eb',
                    background: form.abas_permitidas.includes(aba.id)?'#f0f9ff':'transparent',
                    fontWeight: form.abas_permitidas.includes(aba.id)?700:400,
                  }}>
                    <input type="checkbox" checked={form.abas_permitidas.includes(aba.id)}
                      onChange={()=>aba.id!=='dashboard'&&toggleAba(aba.id)}
                      style={{accentColor:'#1e293b'}} disabled={aba.id==='dashboard'} />
                    {aba.label}
                  </label>
                ))}
              </div>
            </div>
            <button className="acn-btn" style={{background:'#22c55e',width:'100%',padding:'7px',marginTop:10}} onClick={salvar}>
              Criar Usuario
            </button>
          </div>
        )}
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : (
            <table>
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Abas</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {usuarios.length === 0
                  ? <tr><td colSpan={6} className="acn-empty">Nenhum usuario cadastrado.</td></tr>
                  : usuarios.map(u => {
                    const abas = Array.isArray(u.abas_permitidas) ? u.abas_permitidas : TODAS_ABAS.map(a=>a.id);
                    return (
                      <tr key={u.id} style={{opacity: u.ativo ? 1 : 0.5}}>
                        <td><strong>{u.nome}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          <select className="acn-input" style={{padding:'2px 6px'}} value={u.perfil||'Operador'}
                            onChange={e=>alterarPerfil(u,e.target.value)}>
                            {PERFIS.map(p=><option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td>
                          <span style={{fontSize:9,color:'#64748b'}}>
                            {abas.length === TODAS_ABAS.length
                              ? <span style={{color:'#22c55e',fontWeight:700}}>Todas ({abas.length})</span>
                              : <span style={{color:'#3b82f6',fontWeight:700}}>{abas.length} abas</span>
                            }
                          </span>
                        </td>
                        <td>
                          <span className="acn-badge" style={{background: u.ativo?'#22c55e':'#ef4444'}}>
                            {u.ativo?'Ativo':'Inativo'}
                          </span>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            <button className="acn-btn" style={{background:'#6366f1',fontSize:9}}
                              onClick={()=>setModalPerm(u)}>Permissões</button>
                            <button className="acn-btn" style={{background:'#475569',fontSize:9}}
                              onClick={()=>resetarSenha(u)}>Reset Senha</button>
                            <button className="acn-btn"
                              style={{background: u.ativo?'#ef4444':'#22c55e',fontSize:9}}
                              onClick={()=>toggleAtivo(u)}>
                              {u.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- CHECKLIST CQ ----
function PainelChecklist() {
  const [itens, setItens] = useState([]);
  const [novoItem, setNovoItem] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchItens(); }, []);

  const fetchItens = async () => {
    setLoading(true);
    const { data } = await supabase.from('cq_checklist_itens').select('*').order('ordem');
    setItens(data || []);
    setLoading(false);
  };

  const addItem = async () => {
    if (!novoItem.trim()) return;
    const maxOrdem = itens.length > 0 ? Math.max(...itens.map(i => i.ordem || 0)) + 1 : 1;
    const { error } = await supabase.from('cq_checklist_itens').insert([{
      item_texto: novoItem.trim(),
      ativo: true,
      ordem: maxOrdem,
    }]);
    if (error) {
      alert('Erro ao adicionar item: ' + error.message + '\n\nCertifique-se de ter executado o SQL acn_fix_usuarios_tecnicos.sql no Supabase.');
      return;
    }
    setNovoItem('');
    fetchItens();
  };

  const toggleItem = async (item) => {
    await supabase.from('cq_checklist_itens').update({ ativo: !item.ativo }).eq('id', item.id);
    fetchItens();
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Remover item: "${item.item_texto}"?`)) return;
    await supabase.from('cq_checklist_itens').delete().eq('id', item.id);
    fetchItens();
  };

  const moverItem = async (item, direcao) => {
    const idx = itens.findIndex(i=>i.id===item.id);
    const outro = itens[idx + direcao];
    if (!outro) return;
    await Promise.all([
      supabase.from('cq_checklist_itens').update({ ordem: outro.ordem }).eq('id', item.id),
      supabase.from('cq_checklist_itens').update({ ordem: item.ordem }).eq('id', outro.id),
    ]);
    fetchItens();
  };

  const ativos = itens.filter(i=>i.ativo);
  const inativos = itens.filter(i=>!i.ativo);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Itens do Checklist de CQ ({ativos.length} ativos)</span>
        </div>
        <div className="sec-body">
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            <input className="acn-input" style={{flex:1}} placeholder="Novo item de checklist..."
              value={novoItem} onChange={e=>setNovoItem(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addItem()} />
            <button className="acn-btn" style={{background:'#22c55e'}} onClick={addItem}>+ Adicionar</button>
          </div>
          {loading ? <div className="acn-empty">Carregando...</div> : (
            <div>
              {ativos.map((item, idx) => (
                <div key={item.id} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'#f8fafc',borderRadius:4,marginBottom:4,border:'1px solid #e2e8f0'}}>
                  <span style={{color:'#94a3b8',fontSize:10,minWidth:20,textAlign:'right'}}>{item.ordem||idx+1}.</span>
                  <span style={{flex:1,fontSize:11}}>{item.item_texto}</span>
                  <button style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,padding:'0 2px'}} onClick={()=>moverItem(item,-1)} title="Mover para cima">↑</button>
                  <button style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,padding:'0 2px'}} onClick={()=>moverItem(item,1)} title="Mover para baixo">↓</button>
                  <button className="acn-btn" style={{background:'#f59e0b',fontSize:9,padding:'2px 6px'}} onClick={()=>toggleItem(item)}>Desativar</button>
                  <button className="acn-btn" style={{background:'#ef4444',fontSize:9,padding:'2px 6px'}} onClick={()=>deleteItem(item)}>Remover</button>
                </div>
              ))}
              {itens.length === 0 && <div className="acn-empty">Nenhum item cadastrado. Adicione o primeiro acima.</div>}
            </div>
          )}
        </div>
      </div>
      {inativos.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span style={{color:'#94a3b8'}}>Itens Desativados ({inativos.length})</span></div>
          <div className="sec-body">
            {inativos.map(item => (
              <div key={item.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 8px',opacity:0.5,marginBottom:2}}>
                <span style={{flex:1,fontSize:11,textDecoration:'line-through'}}>{item.item_texto}</span>
                <button className="acn-btn" style={{background:'#22c55e',fontSize:9,padding:'2px 6px'}} onClick={()=>toggleItem(item)}>Reativar</button>
                <button className="acn-btn" style={{background:'#ef4444',fontSize:9,padding:'2px 6px'}} onClick={()=>deleteItem(item)}>Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- LOGS DO SISTEMA ----
function PainelLogs() {
  const [logs, setLogs] = useState([]);
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroOpl, setFiltroOpl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    let q = supabase.from('logs_movimentacao_opl').select('*').order('data_hora', { ascending: false }).limit(200);
    if (filtroSetor) q = q.eq('setor', filtroSetor);
    if (filtroOpl) q = q.ilike('numero_opl', `%${filtroOpl}%`);
    const { data } = await q;
    setLogs(data || []);
    setLoading(false);
  };

  const SETORES_LOG = ['Comercial','Engenharia','PCP','Almoxarifado','Producao','CQ','Fiscal','Logistica'];
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const corSetor = (s) => ({
    Comercial:'#2563eb',Engenharia:'#7c3aed',PCP:'#f59e0b',Almoxarifado:'#0891b2',
    Producao:'#16a34a',CQ:'#dc2626',Fiscal:'#f97316',Logistica:'#475569',
  })[s] || '#94a3b8';

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Log de Movimentacoes de OPLs ({logs.length})</span>
          <button className="acn-btn" style={{background:'#475569'}} onClick={fetchLogs}>Atualizar</button>
        </div>
        <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
          <div className="form-row">
            <div className="form-group"><label className="acn-label">Filtrar por Setor</label>
              <select className="acn-input" style={{width:'100%'}} value={filtroSetor} onChange={e=>{setFiltroSetor(e.target.value);}}>
                <option value="">Todos os setores</option>
                {SETORES_LOG.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="acn-label">Filtrar por OPL</label>
              <input className="acn-input" style={{width:'100%'}} placeholder="ex: 1324" value={filtroOpl} onChange={e=>setFiltroOpl(e.target.value)} />
            </div>
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button className="acn-btn" style={{background:'#1e293b'}} onClick={fetchLogs}>Filtrar</button>
            </div>
          </div>
        </div>
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : logs.length === 0 ? (
            <div className="acn-empty">Nenhum log encontrado.</div>
          ) : (
            <table>
              <thead><tr><th>Data/Hora</th><th>OPL</th><th>Setor</th><th>Evento</th><th>Status Anterior</th><th>Status Novo</th><th>Usuario</th></tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={{whiteSpace:'nowrap'}}>{fmtDtHr(l.data_hora)}</td>
                    <td><strong style={{color:'#2563eb'}}>{l.numero_opl}</strong></td>
                    <td><span className="acn-badge" style={{background:corSetor(l.setor)}}>{l.setor}</span></td>
                    <td style={{maxWidth:250,fontSize:10}}>{l.evento}</td>
                    <td style={{fontSize:10,color:'#94a3b8'}}>{l.status_anterior||'—'}</td>
                    <td style={{fontSize:10,color:'#22c55e',fontWeight:600}}>{l.status_novo||'—'}</td>
                    <td style={{fontSize:10}}>{l.usuario_nome||l.usuario_email||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- PAINEL KPI ----
const METRICAS_PADRAO = [
  { nome:'ENGENHARIA',   desc:'Lead Time Liberacao BOM',            meta:8,   tol:16,  campo:'tempo_engenharia_horas' },
  { nome:'PCP',          desc:'BOM x Liberacao Producao',           meta:24,  tol:48,  campo:'tempo_pcp_horas' },
  { nome:'COMPRAS',      desc:'Solicitacao x Efetivacao Pedido',    meta:24,  tol:72,  campo:'tempo_compras_horas' },
  { nome:'ALMOXARIFADO', desc:'Kiting Solicitado x Concluido',      meta:8,   tol:24,  campo:'tempo_almoxarifado_horas' },
  { nome:'CHICOTES',     desc:'Pedido x Entrega',                   meta:48,  tol:96,  campo:'tempo_chicotes_horas' },
  { nome:'LABORATORIO',  desc:'Solicitacao x Devolucao',            meta:24,  tol:72,  campo:'tempo_laboratorio_horas' },
  { nome:'PRODUCAO',     desc:'Lead Time Execucao',                 meta:16,  tol:48,  campo:'tempo_producao_horas' },
  { nome:'CQ',           desc:'Fila Checklist x Liberacao',         meta:1,   tol:3,   campo:'tempo_qualidade_horas' },
  { nome:'LOGISTICA',    desc:'Despacho x Retorno',                 meta:48,  tol:120, campo:'tempo_logistica_horas' },
  { nome:'SERRALHERIA',  desc:'Mobilizacao + Execucao',             meta:24,  tol:72,  campo:'tempo_serralheria_horas' },
  { nome:'FISCAL',       desc:'Lib. Comercial x Emissao NF',        meta:2,   tol:6,   campo:'tempo_fiscal_horas' },
];

function PainelKPI() {
  const [metricas, setMetricas] = useState(METRICAS_PADRAO);
  const [medias, setMedias] = useState({});
  const [contagens, setContagens] = useState({});
  const [editando, setEditando] = useState(null); // campo sendo editado
  const [editVals, setEditVals] = useState({ meta:'', tol:'' });

  const SETOR_MAP = {
    CHICOTES:'Chicotes', SERRALHERIA:'Serralheria', LABORATORIO:'Laboratorio',
    COMPRAS:'Compras', ALMOXARIFADO:'Almoxarifado',
  };
  const OPL_CAMPOS = ['ENGENHARIA','PCP','PRODUCAO','CQ','LOGISTICA','FISCAL'];

  useEffect(() => { fetchMedias(); }, []);

  const fetchMedias = async () => {
    const camposOpl = metricas
      .filter(m => OPL_CAMPOS.includes(m.nome))
      .map(m => m.campo).join(', ');

    const [oplsRes, demandasRes] = await Promise.all([
      supabase.from('oples').select(camposOpl),
      supabase.from('demandas_setoriais')
        .select('setor_destino, tempo_execucao_horas')
        .eq('status', 'Concluido')
        .gt('tempo_execucao_horas', 0),
    ]);

    const m = {};
    const c = {};
    // OPL-based
    if (oplsRes.data) {
      metricas.filter(mt => OPL_CAMPOS.includes(mt.nome)).forEach(mt => {
        const vals = oplsRes.data.map(r => r[mt.campo]).filter(v => v != null && v > 0);
        m[mt.nome] = vals.length > 0 ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        c[mt.nome] = vals.length;
      });
    }
    // Setor-based
    const dd = demandasRes.data || [];
    Object.entries(SETOR_MAP).forEach(([key, setorNome]) => {
      const vals = dd.filter(d => d.setor_destino === setorNome).map(d => Number(d.tempo_execucao_horas)).filter(v => v > 0);
      m[key] = vals.length > 0 ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      c[key] = vals.length;
    });
    setMedias(m);
    setContagens(c);
  };

  const iniciarEdicao = (m) => {
    setEditando(m.nome);
    setEditVals({ meta: String(m.meta), tol: String(m.tol) });
  };

  const salvarEdicao = () => {
    const meta = parseFloat(editVals.meta);
    const tol  = parseFloat(editVals.tol);
    if (isNaN(meta) || isNaN(tol) || meta <= 0 || tol <= meta) {
      alert('Tolerância deve ser maior que a Meta e ambos > 0.');
      return;
    }
    setMetricas(prev => prev.map(m => m.nome === editando ? { ...m, meta, tol } : m));
    setEditando(null);
  };

  const getStatus = (real, meta, tol) => {
    if (real == null) return { label:'Sem dados', color:'#9ca3af' };
    if (real <= meta)  return { label:'NO PRAZO',  color:'#22c55e' };
    if (real <= tol)   return { label:'ATENCAO',   color:'#f59e0b' };
    return { label:'CRITICO', color:'#ef4444' };
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Metas de Lead Time por Setor</span>
          <button className="acn-btn" style={{background:'#475569'}} onClick={fetchMedias}>↺ Recalcular</button>
        </div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          <table>
            <thead><tr>
              <th>Setor</th><th>Indicador</th>
              <th style={{textAlign:'center'}}>Meta (h)</th>
              <th style={{textAlign:'center'}}>Tolerância (h)</th>
              <th style={{textAlign:'center'}}>Realizado (h)</th>
              <th style={{textAlign:'center'}}>Qtd</th>
              <th>Status</th>
              <th>Ação</th>
            </tr></thead>
            <tbody>
              {metricas.map(m => {
                const real = medias[m.nome] ?? null;
                const cnt  = contagens[m.nome] ?? 0;
                const st   = getStatus(real, m.meta, m.tol);
                const isEd = editando === m.nome;
                return (
                  <tr key={m.nome}>
                    <td><strong>{m.nome}</strong></td>
                    <td style={{fontSize:9,color:'#64748b',maxWidth:180}}>{m.desc}</td>
                    <td style={{textAlign:'center'}}>
                      {isEd
                        ? <input className="acn-input" style={{width:60,textAlign:'center'}} value={editVals.meta} onChange={e=>setEditVals(v=>({...v,meta:e.target.value}))} />
                        : <strong style={{color:'#16a34a'}}>{m.meta}h</strong>}
                    </td>
                    <td style={{textAlign:'center'}}>
                      {isEd
                        ? <input className="acn-input" style={{width:60,textAlign:'center'}} value={editVals.tol} onChange={e=>setEditVals(v=>({...v,tol:e.target.value}))} />
                        : <strong style={{color:'#d97706'}}>{m.tol}h</strong>}
                    </td>
                    <td style={{textAlign:'center',fontFamily:'monospace',fontWeight:700,color:'#3b82f6'}}>
                      {real != null ? real.toFixed(1)+'h' : '—'}
                    </td>
                    <td style={{textAlign:'center',color:'#94a3b8',fontSize:10}}>{cnt > 0 ? cnt : '—'}</td>
                    <td>
                      <span className="acn-badge" style={{background:st.color}}>{st.label}</span>
                    </td>
                    <td>
                      {isEd ? (
                        <div style={{display:'flex',gap:4}}>
                          <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={salvarEdicao}>OK</button>
                          <button className="acn-btn" style={{background:'#94a3b8',fontSize:9}} onClick={()=>setEditando(null)}>✕</button>
                        </div>
                      ) : (
                        <button className="acn-btn" style={{background:'#1e293b',fontSize:9}} onClick={()=>iniciarEdicao(m)}>Editar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- PAINEL DADOS / LIMPEZA ----
const TABELAS_CONFIG = [
  { id:'oples',                 label:'OPLs',               desc:'Ordens de Produção',         cor:'#2563eb' },
  { id:'demandas_setoriais',    label:'Demandas Setoriais',  desc:'Demandas e Ajustes',         cor:'#f59e0b' },
  { id:'crm_clientes',          label:'CRM — Clientes',      desc:'Prospects e clientes',       cor:'#16a34a' },
  { id:'crm_historico_contatos',label:'CRM — Histórico',     desc:'Contatos e interações',      cor:'#0891b2' },
  { id:'logs_movimentacao_opl', label:'Logs de OPL',         desc:'Histórico de movimentações', cor:'#475569' },
  { id:'cq_auditorias',         label:'Auditorias CQ',       desc:'Registros de qualidade',     cor:'#7c3aed' },
];

function PainelDados() {
  const [tabelaAtiva, setTabelaAtiva] = useState('oples');
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contagens, setContagens] = useState({});
  const [selecionados, setSelecionados] = useState(new Set());
  const [confirmLimpar, setConfirmLimpar] = useState(null);
  const [deletando, setDeletando] = useState(false);

  useEffect(() => { fetchContagens(); }, []);
  useEffect(() => { fetchRegistros(); setSelecionados(new Set()); }, [tabelaAtiva]);

  const fetchContagens = async () => {
    const counts = {};
    for (const t of TABELAS_CONFIG) {
      const { count } = await supabase.from(t.id).select('*', { count:'exact', head:true });
      counts[t.id] = count ?? 0;
    }
    setContagens(counts);
  };

  const fetchRegistros = async () => {
    setLoading(true);
    const orderCol = tabelaAtiva === 'logs_movimentacao_opl' ? 'data_hora'
      : tabelaAtiva === 'demandas_setoriais' ? 'data_abertura'
      : tabelaAtiva === 'crm_historico_contatos' ? 'data_contato'
      : 'created_at';
    const { data, error } = await supabase.from(tabelaAtiva).select('*')
      .order(orderCol, { ascending: false }).limit(200);
    if (error) console.error('[PainelDados] fetchRegistros error:', error);
    setRegistros(data || []);
    setLoading(false);
  };

  const toggleSelecionado = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === registros.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(registros.map(r => r.id)));
    }
  };

  const deletarSelecionados = async () => {
    if (selecionados.size === 0) return;
    if (!window.confirm(`Deletar ${selecionados.size} registro(s) selecionado(s)?`)) return;
    setDeletando(true);
    const ids = Array.from(selecionados);
    const { error } = await supabase.from(tabelaAtiva).delete().in('id', ids);
    if (error) {
      console.error('[PainelDados] deletarSelecionados error:', error);
      alert(`Erro ao deletar: ${error.message}`);
    }
    setSelecionados(new Set());
    setDeletando(false);
    fetchRegistros(); fetchContagens();
  };

  const limparTabela = async (tabelaId) => {
    setDeletando(true);
    // Para tabelas com id uuid usa neq com uuid nulo; para bigint usa gt(0)
    const { error } = await supabase.from(tabelaId).delete().gte('id', 0);
    if (error) {
      // fallback para uuid
      await supabase.from(tabelaId).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    setConfirmLimpar(null);
    setDeletando(false);
    fetchRegistros(); fetchContagens();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const tabelaInfo = TABELAS_CONFIG.find(t => t.id === tabelaAtiva);

  const getResumo = (r) => {
    if (tabelaAtiva === 'oples')
      return `OPL ${r.opl || r.numero_opl || r.id} — ${r.cliente_nome || r.cliente || '?'} — ${r.status_geral || '?'}`;
    if (tabelaAtiva === 'demandas_setoriais')
      return `[${r.setor_destino}] ${r.descricao?.substring(0,60) || '?'} — ${r.status}`;
    if (tabelaAtiva === 'crm_clientes')
      return `${r.nome_empresa || r.nome || '?'} — ${r.contato_nome || '?'} — ${r.status_crm || r.estagio || '?'}`;
    if (tabelaAtiva === 'crm_historico_contatos')
      return `${r.nome_empresa || '?'} — ${r.tipo_contato || '?'}: ${r.descricao?.substring(0,50) || '?'}`;
    if (tabelaAtiva === 'logs_movimentacao_opl')
      return `OPL ${r.numero_opl} → ${r.setor}: ${r.evento?.substring(0,50)}`;
    if (tabelaAtiva === 'cq_auditorias')
      return `OPL ${r.numero_opl} — ${r.resultado} — ${r.auditor_nome}`;
    return r.id;
  };

  const getDataCol = (r) => r.created_at || r.data_abertura || r.data_hora || r.data_contato;
  const todosSelecionados = registros.length > 0 && selecionados.size === registros.length;
  const algumSelecionado = selecionados.size > 0;

  return (
    <div>
      {/* CARDS DE CONTAGEM */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        {TABELAS_CONFIG.map(t => (
          <div key={t.id} onClick={() => setTabelaAtiva(t.id)} style={{
            flex:'1 1 140px', minWidth:130, cursor:'pointer',
            background:'white', border:`2px solid ${tabelaAtiva===t.id ? t.cor : '#e2e8f0'}`,
            borderTop:`4px solid ${t.cor}`, borderRadius:6, padding:'8px 12px', transition:'border .1s',
          }}>
            <div style={{fontSize:9,color:'#64748b',textTransform:'uppercase',letterSpacing:'.3px'}}>{t.label}</div>
            <div style={{fontSize:22,fontWeight:700,color:t.cor,margin:'2px 0'}}>{contagens[t.id] ?? '...'}</div>
            <div style={{fontSize:9,color:'#94a3b8'}}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* BARRA DE AÇÕES */}
      <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
        {algumSelecionado ? (
          <button className="acn-btn" style={{background:'#ef4444'}} onClick={deletarSelecionados} disabled={deletando}>
            {deletando ? 'Deletando...' : `🗑 Deletar ${selecionados.size} selecionado(s)`}
          </button>
        ) : (
          <span style={{fontSize:10,color:'#94a3b8'}}>Selecione registros para deletar</span>
        )}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={fetchRegistros}>↺ Atualizar</button>
          <button className="acn-btn" style={{background:'#ef4444',fontSize:10}} onClick={() => setConfirmLimpar(tabelaAtiva)}>
            ⚠️ Limpar Tabela Toda
          </button>
        </div>
      </div>

      {/* TABELA */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background: tabelaInfo?.cor || '#1e293b', color:'white'}}>
          <span>{tabelaInfo?.label} — {registros.length} exibidos / {contagens[tabelaAtiva] ?? 0} total</span>
          {algumSelecionado && (
            <span style={{background:'rgba(255,255,255,.2)',padding:'2px 8px',borderRadius:4,fontSize:10}}>
              {selecionados.size} selecionado(s)
            </span>
          )}
        </div>
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : registros.length === 0 ? (
            <div className="acn-empty">Nenhum registro nesta tabela.</div>
          ) : (
            <table>
              <thead><tr>
                <th style={{width:36,textAlign:'center'}}>
                  <input type="checkbox" checked={todosSelecionados}
                    onChange={toggleTodos} style={{cursor:'pointer',accentColor:'#ef4444'}} />
                </th>
                <th style={{width:145}}>Data</th>
                <th>Resumo</th>
              </tr></thead>
              <tbody>
                {registros.map(r => {
                  const sel = selecionados.has(r.id);
                  return (
                    <tr key={r.id} style={{background: sel ? '#fef2f2' : undefined, cursor:'pointer'}}
                      onClick={() => toggleSelecionado(r.id)}>
                      <td style={{textAlign:'center'}} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={sel}
                          onChange={() => toggleSelecionado(r.id)}
                          style={{cursor:'pointer',accentColor:'#ef4444'}} />
                      </td>
                      <td style={{whiteSpace:'nowrap',color:'#64748b',fontSize:10}}>{fmtDt(getDataCol(r))}</td>
                      <td style={{fontSize:10,maxWidth:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                        title={getResumo(r)}>{getResumo(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL CONFIRMAR LIMPEZA TOTAL */}
      {confirmLimpar && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title" style={{color:'#dc2626'}}>⚠️ Limpar Tabela Inteira</div>
            <p style={{fontSize:12,color:'#374151',marginBottom:16}}>
              Isso vai deletar <strong>TODOS os {contagens[confirmLimpar]} registros</strong> da tabela{' '}
              <strong>{TABELAS_CONFIG.find(t=>t.id===confirmLimpar)?.label}</strong>.<br/>
              Esta ação <strong>não pode ser desfeita</strong>.
            </p>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1,padding:'8px'}}
                onClick={() => limparTabela(confirmLimpar)} disabled={deletando}>
                {deletando ? 'Deletando...' : 'SIM, LIMPAR TUDO'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8',flex:1,padding:'8px'}}
                onClick={() => setConfirmLimpar(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ADMINTAB PRINCIPAL ----
const ABAS_ADMIN = [
  { id:'usuarios',  label:'Usuários' },
  { id:'checklist', label:'Checklist CQ' },
  { id:'kpis',      label:'Metas KPI' },
  { id:'logs',      label:'Logs do Sistema' },
  { id:'dados',     label:'🗑 Dados / Limpeza' },
];

export default function AdminTab() {
  const [abaAtiva, setAbaAtiva] = useState('usuarios');

  return (
    <div>
      <div className="sec-card" style={{marginBottom:10}}>
        <div className="sec-body" style={{padding:'6px 10px',display:'flex',gap:4}}>
          {ABAS_ADMIN.map(a => (
            <button
              key={a.id}
              className="acn-btn"
              style={{
                background: abaAtiva === a.id ? '#1e293b' : '#f1f5f9',
                color: abaAtiva === a.id ? '#fff' : '#475569',
              }}
              onClick={() => setAbaAtiva(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {abaAtiva === 'usuarios'  && <PainelUsuarios />}
      {abaAtiva === 'checklist' && <PainelChecklist />}
      {abaAtiva === 'kpis'      && <PainelKPI />}
      {abaAtiva === 'logs'      && <PainelLogs />}
      {abaAtiva === 'dados'     && <PainelDados />}
    </div>
  );
}
