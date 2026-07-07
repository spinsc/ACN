// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { notificarEvento } from './whatsappHelper';

// ─── Tipos de projeto (mesmo do OPL) ─────────────────────────────────────────
const TIPOS_PROJETO = [
  'Transformacao Veicular Ostensiva','Transformacao Veicular Administrativa',
  'Instalacao Equipamento','Manutencao Preventiva','Manutencao Corretiva',
  'Calibracao','Reforma','Projeto Especial',
];

const STATUS_COR: Record<string, string> = {
  'Aberta':           '#3b82f6',
  'Orç. Enviado':     '#f59e0b',
  'Aprovado':         '#22c55e',
  'Reprovado':        '#ef4444',
  'Em Execução':      '#8b5cf6',
  'Concluído':        '#0d9488',
  'Entregue':         '#166534',
};

const SETORES_EXEC = ['Serralheria','Chicotes','Laboratorio','Almoxarifado','Producao','Engenharia','PCP','Compras'];

// ─── Canvas de Assinatura ────────────────────────────────────────────────────
function SignCanvas({ onSave }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);

  const xy = (e) => {
    const r = ref.current.getBoundingClientRect();
    return e.touches
      ? { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
      : { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const {x,y}=xy(e); const c=ref.current.getContext('2d'); c.beginPath(); c.moveTo(x,y); };
  const move  = (e) => { e.preventDefault(); if (!drawing.current) return; const {x,y}=xy(e); const c=ref.current.getContext('2d'); c.lineTo(x,y); c.stroke(); setHas(true); };
  const end   = () => { drawing.current = false; };
  const clear = () => { ref.current.getContext('2d').clearRect(0,0,460,130); setHas(false); };

  useEffect(() => {
    const c = ref.current.getContext('2d');
    c.strokeStyle='#1e293b'; c.lineWidth=2; c.lineCap='round';
  }, []);

  return (
    <div style={{textAlign:'center'}}>
      <canvas ref={ref} width={460} height={120}
        style={{border:'2px dashed #94a3b8',borderRadius:4,cursor:'crosshair',background:'white',display:'block',margin:'0 auto',maxWidth:'100%'}}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:5}}>
        <button className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={clear}>Limpar</button>
        <button className="acn-btn" style={{background:'#22c55e',fontSize:10,opacity:has?1:0.5}} onClick={()=>has&&onSave(ref.current.toDataURL())} disabled={!has}>Confirmar Assinatura</button>
      </div>
    </div>
  );
}

// ─── Upload de foto ───────────────────────────────────────────────────────────
async function uploadFoto(file: File, pasta: string): Promise<string | null> {
  const path = `sac/${pasta}/${Date.now()}_${file.name.replace(/\s/g,'_')}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

async function uploadAssinatura(dataUrl: string, pasta: string): Promise<string | null> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `sac/${pasta}/assinatura_${Date.now()}.png`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

// ─── Numeração automática ─────────────────────────────────────────────────────
async function gerarNumeroOS(): Promise<string> {
  const ano = new Date().getFullYear();
  const { count } = await supabase.from('sac_ordens_servico').select('*', { count: 'exact', head: true })
    .like('numero_os', `%-${ano}`);
  return `OS-${String((count || 0) + 1).padStart(4, '0')}/${ano}`;
}

// ─── Formulário em branco ─────────────────────────────────────────────────────
const FORM_VAZIO = {
  tipo_servico:'Orçamento', tipo_projeto:'', equipamento_nome:'',
  marca:'', modelo:'', numero_serie:'', quantidade:1,
  defeito_reclamado:'', observacoes:'',
  cliente_nome:'', empresa_orgao:'', endereco:'', cpf_cnpj:'', telefone:'', email:'',
  prazo_orcamento:'', data_prevista_entrega:'',
  acessorios: [] as {descricao:string; presente:boolean}[],
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function SacTab({ currentUser }) {
  const [ordens, setOrdens]           = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo]   = useState('');
  const [busca, setBusca]             = useState('');

  // Modais
  const [modalNova, setModalNova]         = useState(false);
  const [modalDetalhe, setModalDetalhe]   = useState(null);
  const [modalOrc, setModalOrc]           = useState(null);
  const [modalAprov, setModalAprov]       = useState(null);
  const [modalRepr, setModalRepr]         = useState(null);
  const [modalSaida, setModalSaida]       = useState(null);
  const [modalPrint, setModalPrint]       = useState(null);
  const [modalNovoEquip, setModalNovoEquip] = useState(false);

  // Formulário nova OS
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [acessInput, setAcessInput] = useState('');
  const [fotosEntradaFiles, setFotosEntradaFiles] = useState([]);
  const [salvando, setSalvando] = useState(false);

  // Orçamento
  const [orcForm, setOrcForm] = useState({ valor:'', condicoes:'' });

  // Aprovação
  const [aprovForm, setAprovForm] = useState({ nome:'', sig: null as string|null, data_entrega:'' });

  // Reprovação
  const [reprForm, setReprForm] = useState({ motivo:'', data_retirada:'', nome_retirada:'' });

  // Saída
  const [saidaForm, setSaidaForm] = useState({ nome:'', sig: null as string|null });
  const [fotosSaidaFiles, setFotosSaidaFiles] = useState([]);

  // Novo equipamento
  const [novoEquip, setNovoEquip] = useState('');

  // Setor execução (após aprovação)
  const [setorExec, setSetorExec] = useState('Serralheria');

  useEffect(() => { fetchOrdens(); fetchEquipamentos(); }, []);

  const fetchOrdens = async () => {
    setLoading(true);
    const { data } = await supabase.from('sac_ordens_servico').select('*').order('data_abertura', { ascending: false });
    setOrdens(data || []);
    setLoading(false);
  };

  const fetchEquipamentos = async () => {
    const { data } = await supabase.from('sac_equipamentos').select('*').eq('ativo', true).order('nome');
    setEquipamentos(data || []);
  };

  // ── CRIAR OS ──────────────────────────────────────────────────────────────
  const criarOS = async () => {
    if (!form.cliente_nome.trim()) { alert('Nome do cliente obrigatório!'); return; }
    if (!form.equipamento_nome.trim()) { alert('Informe o equipamento!'); return; }
    setSalvando(true);
    const numero = await gerarNumeroOS();
    const agora = new Date().toISOString();

    // Upload fotos de entrada
    const urlsFotos: string[] = [];
    for (const f of fotosEntradaFiles) {
      const url = await uploadFoto(f, `os_${numero.replace('/','_')}/entrada`);
      if (url) urlsFotos.push(url);
    }

    const payload = {
      numero_os: numero,
      tipo_servico: form.tipo_servico,
      tipo_projeto: form.tipo_projeto || null,
      equipamento_nome: form.equipamento_nome,
      marca: form.marca || null, modelo: form.modelo || null,
      numero_serie: form.numero_serie || null,
      quantidade: form.quantidade || 1,
      defeito_reclamado: form.defeito_reclamado || null,
      observacoes: form.observacoes || null,
      cliente_nome: form.cliente_nome,
      empresa_orgao: form.empresa_orgao || null,
      endereco: form.endereco || null,
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      prazo_orcamento: form.prazo_orcamento || null,
      data_prevista_entrega: form.tipo_servico === 'Garantia' ? (form.data_prevista_entrega || null) : null,
      status: 'Aberta',
      acessorios: form.acessorios,
      fotos_entrada: urlsFotos,
      data_abertura: agora,
      criado_por_nome: currentUser?.nome,
      criado_por_email: currentUser?.email,
      atualizado_em: agora,
    };

    const { error } = await supabase.from('sac_ordens_servico').insert([payload]);
    if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }

    notificarEvento('sac_os_aberta', `📋 *Nova OS ${numero}*\nCliente: ${form.cliente_nome}\nEquip: ${form.equipamento_nome}\nTipo: ${form.tipo_servico}\nPor: ${currentUser?.nome}`);

    setForm({ ...FORM_VAZIO }); setFotosEntradaFiles([]); setAcessInput('');
    setModalNova(false); setSalvando(false); fetchOrdens();
  };

  // ── ENVIAR ORÇAMENTO ──────────────────────────────────────────────────────
  const enviarOrcamento = async () => {
    if (!orcForm.valor) { alert('Informe o valor do orçamento!'); return; }
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Orç. Enviado',
      valor_orcamento: parseFloat(orcForm.valor.replace(',','.')),
      condicoes_pagamento: orcForm.condicoes || null,
      data_envio_orcamento: agora,
      atualizado_em: agora,
    }).eq('id', modalOrc.id);
    notificarEvento('sac_orcamento_enviado', `💰 *Orçamento enviado — ${modalOrc.numero_os}*\nCliente: ${modalOrc.cliente_nome}\nValor: R$ ${orcForm.valor}\nPor: ${currentUser?.nome}`);
    setModalOrc(null); setOrcForm({ valor:'', condicoes:'' }); fetchOrdens();
  };

  // ── APROVAÇÃO ─────────────────────────────────────────────────────────────
  const aprovar = async (sigUrl: string) => {
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Aprovado',
      aprovado: true,
      aprovador_nome: aprovForm.nome,
      data_aprovacao: agora,
      assinatura_aprovacao_url: sigUrl,
      data_prevista_pos_aprovacao: aprovForm.data_entrega || null,
      atualizado_em: agora,
    }).eq('id', modalAprov.id);
    notificarEvento('sac_os_aprovada', `✅ *OS ${modalAprov.numero_os} APROVADA*\nCliente: ${modalAprov.cliente_nome}\nAprovador: ${aprovForm.nome}\nPor: ${currentUser?.nome}`);
    setModalAprov(null); setAprovForm({ nome:'', sig:null, data_entrega:'' }); fetchOrdens();
  };

  const salvarAprovacao = async () => {
    if (!aprovForm.nome.trim()) { alert('Informe o nome do aprovador!'); return; }
    if (!aprovForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(aprovForm.sig, `os_${modalAprov.numero_os.replace('/','_')}`);
    await aprovar(url || '');
  };

  // ── REPROVAÇÃO ────────────────────────────────────────────────────────────
  const reprovar = async () => {
    if (!reprForm.motivo.trim()) { alert('Informe o motivo!'); return; }
    const agora = new Date().toISOString();
    await supabase.from('sac_ordens_servico').update({
      status: 'Reprovado', aprovado: false,
      motivo_reprovacao: reprForm.motivo,
      data_retirada_reprovacao: reprForm.data_retirada || null,
      nome_retirada_reprovacao: reprForm.nome_retirada || null,
      atualizado_em: agora,
    }).eq('id', modalRepr.id);
    notificarEvento('sac_os_reprovada', `❌ *OS ${modalRepr.numero_os} REPROVADA*\nCliente: ${modalRepr.cliente_nome}\nMotivo: ${reprForm.motivo}`);
    setModalRepr(null); setReprForm({ motivo:'', data_retirada:'', nome_retirada:'' }); fetchOrdens();
  };

  // ── GERAR DEMANDA (após aprovação) ────────────────────────────────────────
  const gerarDemanda = async (os) => {
    const agora = new Date().toISOString();
    const { data: dem } = await supabase.from('demandas_setoriais').insert([{
      setor_destino: setorExec,
      descricao: `[SAC] ${os.numero_os} — ${os.equipamento_nome} | ${os.defeito_reclamado || 'Ver OS'}`,
      numero_opl: os.numero_os,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      logs_demanda: [{ texto: `OS SAC aprovada. Encaminhado para ${setorExec}.`, usuario: currentUser?.nome, hora: agora }],
    }]).select('id').single();
    await supabase.from('sac_ordens_servico').update({
      status: 'Em Execução',
      setor_execucao: setorExec,
      demanda_id: dem?.id || null,
      atualizado_em: agora,
    }).eq('id', os.id);
    alert(`Demanda criada para ${setorExec}!`);
    setModalDetalhe(null); fetchOrdens();
  };

  // ── CONCLUIR ──────────────────────────────────────────────────────────────
  const concluir = async (os) => {
    if (!window.confirm(`Marcar OS ${os.numero_os} como Concluída?`)) return;
    await supabase.from('sac_ordens_servico').update({ status: 'Concluído', atualizado_em: new Date().toISOString() }).eq('id', os.id);
    setModalDetalhe(null); fetchOrdens();
  };

  // ── SAÍDA / ENTREGA ───────────────────────────────────────────────────────
  const registrarSaida = async (sigUrl: string) => {
    const agora = new Date().toISOString();
    const urlsFotos: string[] = [];
    for (const f of fotosSaidaFiles) {
      const url = await uploadFoto(f, `os_${modalSaida.numero_os.replace('/','_')}/saida`);
      if (url) urlsFotos.push(url);
    }
    await supabase.from('sac_ordens_servico').update({
      status: 'Entregue',
      nome_retirada_saida: saidaForm.nome,
      assinatura_saida_url: sigUrl,
      data_saida: agora,
      fotos_saida: urlsFotos,
      atualizado_em: agora,
    }).eq('id', modalSaida.id);
    notificarEvento('sac_os_entregue', `🚚 *OS ${modalSaida.numero_os} ENTREGUE*\nCliente: ${modalSaida.cliente_nome}\nRetirado por: ${saidaForm.nome}`);
    setModalSaida(null); setSaidaForm({ nome:'', sig:null }); setFotosSaidaFiles([]); fetchOrdens();
  };

  const salvarSaida = async () => {
    if (!saidaForm.nome.trim()) { alert('Informe o nome de quem retirou!'); return; }
    if (!saidaForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(saidaForm.sig, `os_${modalSaida.numero_os.replace('/','_')}_saida`);
    await registrarSaida(url || '');
  };

  // ── NOVO EQUIPAMENTO ──────────────────────────────────────────────────────
  const salvarEquipamento = async () => {
    if (!novoEquip.trim()) return;
    const { error } = await supabase.from('sac_equipamentos').insert([{ nome: novoEquip.trim() }]);
    if (error) { alert('Erro: ' + error.message); return; }
    await fetchEquipamentos();
    setForm(f => ({ ...f, equipamento_nome: novoEquip.trim() }));
    setNovoEquip(''); setModalNovoEquip(false);
  };

  // ── FILTROS ───────────────────────────────────────────────────────────────
  const ordensFiltradas = ordens.filter(o => {
    if (filtroStatus && o.status !== filtroStatus) return false;
    if (filtroTipo && o.tipo_servico !== filtroTipo) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return o.numero_os?.toLowerCase().includes(b) || o.cliente_nome?.toLowerCase().includes(b) || o.equipamento_nome?.toLowerCase().includes(b);
    }
    return true;
  });

  const fmtDt  = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}` : '—';

  // ── AÇÕES POR STATUS ──────────────────────────────────────────────────────
  const renderAcoes = (os) => {
    const btns = [];
    if (['Orçamento','Conserto','Troca'].includes(os.tipo_servico) && os.status === 'Aberta')
      btns.push(<button key="orc" className="acn-btn" style={{background:'#f59e0b',fontSize:9}} onClick={()=>{setModalOrc(os);setOrcForm({valor:'',condicoes:''});}}>💰 Orçamento</button>);
    if (os.tipo_servico === 'Garantia' && os.status === 'Aberta')
      btns.push(<button key="exec" className="acn-btn" style={{background:'#8b5cf6',fontSize:9}} onClick={()=>{setModalDetalhe(os);}}>⚙️ Executar</button>);
    if (os.status === 'Orç. Enviado')
      btns.push(<button key="aprov" className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={()=>{setModalAprov(os);setAprovForm({nome:'',sig:null,data_entrega:''});}}>✅ Aprovação</button>,
                <button key="repr" className="acn-btn" style={{background:'#ef4444',fontSize:9}} onClick={()=>{setModalRepr(os);setReprForm({motivo:'',data_retirada:'',nome_retirada:''});}}>❌ Reprovar</button>);
    if (os.status === 'Aprovado')
      btns.push(<button key="dem" className="acn-btn" style={{background:'#8b5cf6',fontSize:9}} onClick={()=>setModalDetalhe(os)}>⚙️ Exec./Demanda</button>);
    if (['Em Execução'].includes(os.status))
      btns.push(<button key="conc" className="acn-btn" style={{background:'#0d9488',fontSize:9}} onClick={()=>concluir(os)}>✔ Concluir</button>);
    if (os.status === 'Concluído')
      btns.push(<button key="saida" className="acn-btn" style={{background:'#166534',fontSize:9}} onClick={()=>{setModalSaida(os);setSaidaForm({nome:'',sig:null});setFotosSaidaFiles([]);}}>🚚 Entrega</button>);
    btns.push(<button key="print" className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalPrint(os)}>🖨️ PDF</button>);
    return btns;
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── HEADER ── */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>SAC — Ordens de Serviço ({ordensFiltradas.length})</span>
          <button className="acn-btn" style={{background:'#0f766e'}} onClick={()=>{setForm({...FORM_VAZIO});setFotosEntradaFiles([]);setAcessInput('');setModalNova(true);}}>
            + Nova OS
          </button>
        </div>
        {/* Filtros */}
        <div className="sec-body" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'8px 12px',borderBottom:'1px solid #e2e8f0'}}>
          <input className="acn-input" style={{width:200}} placeholder="Buscar OS / cliente / equip."
            value={busca} onChange={e=>setBusca(e.target.value)} />
          <select className="acn-input" style={{width:140}} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.keys(STATUS_COR).map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="acn-input" style={{width:140}} value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {['Orçamento','Conserto','Troca','Garantia'].map(t=><option key={t}>{t}</option>)}
          </select>
          <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>{setFiltroStatus('');setFiltroTipo('');setBusca('');}}>Limpar</button>
        </div>

        {/* ── TABELA ── */}
        <div className="sec-body" style={{overflowX:'auto',padding:0}}>
          {loading ? <div className="acn-empty">Carregando...</div> : ordensFiltradas.length === 0 ? (
            <div className="acn-empty">Nenhuma OS encontrada.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Nº OS</th><th>Tipo</th><th>Equipamento</th><th>Cliente</th>
                <th>Abertura</th><th>Prazo Orç.</th><th>Valor</th><th>Status</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {ordensFiltradas.map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#0f766e'}}>{o.numero_os}</strong></td>
                    <td><span className="acn-badge" style={{background:'#e2e8f0',color:'#1e293b',fontSize:9}}>{o.tipo_servico}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.equipamento_nome}</td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.cliente_nome}</td>
                    <td style={{fontSize:10}}>{fmtDt(o.data_abertura)}</td>
                    <td style={{fontSize:10,color: o.prazo_orcamento && new Date(o.prazo_orcamento)<new Date() && o.status==='Aberta' ? '#ef4444':'inherit'}}>
                      {fmtDt(o.prazo_orcamento)}
                    </td>
                    <td style={{fontSize:10}}>{fmtVal(o.valor_orcamento)}</td>
                    <td><span className="acn-badge" style={{background: STATUS_COR[o.status]||'#94a3b8'}}>{o.status}</span></td>
                    <td><div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{renderAcoes(o)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL NOVA OS
      ════════════════════════════════════════════════════════════════════ */}
      {modalNova && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:680,width:'95vw',maxHeight:'92vh',overflowY:'auto'}}>
            <div className="modal-title">📋 Nova Ordem de Serviço</div>

            {/* Seção 1 — Tipo */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>CLASSIFICAÇÃO</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="acn-label">Tipo de Serviço *</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.tipo_servico} onChange={e=>setForm(f=>({...f,tipo_servico:e.target.value}))}>
                    <option>Orçamento</option><option>Conserto</option><option>Troca</option><option>Garantia</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="acn-label">Categoria (Tipo Projeto)</label>
                  <input list="tipos-proj-sac" className="acn-input" style={{width:'100%'}} value={form.tipo_projeto}
                    onChange={e=>setForm(f=>({...f,tipo_projeto:e.target.value}))} placeholder="Selecione ou digite..." />
                  <datalist id="tipos-proj-sac">{TIPOS_PROJETO.map(t=><option key={t} value={t}/>)}</datalist>
                </div>
                <div className="form-group">
                  <label className="acn-label">Tipo de Equipamento *
                    <button type="button" style={{marginLeft:6,fontSize:9,padding:'1px 6px',background:'#0f766e',color:'white',border:'none',borderRadius:3,cursor:'pointer'}}
                      onClick={()=>setModalNovoEquip(true)}>+ novo</button>
                  </label>
                  <select className="acn-input" style={{width:'100%'}} value={form.equipamento_nome}
                    onChange={e=>setForm(f=>({...f,equipamento_nome:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {equipamentos.map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="acn-label">Quantidade</label>
                  <input type="number" min={1} className="acn-input" style={{width:'100%'}} value={form.quantidade}
                    onChange={e=>setForm(f=>({...f,quantidade:Number(e.target.value)}))} />
                </div>
              </div>
            </div>

            {/* Seção 2 — Equipamento */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>DADOS DO EQUIPAMENTO</div>
              <div className="form-row">
                <div className="form-group"><label className="acn-label">Marca</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.marca} onChange={e=>setForm(f=>({...f,marca:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">Modelo</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.modelo} onChange={e=>setForm(f=>({...f,modelo:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">Número de Série</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.numero_serie} onChange={e=>setForm(f=>({...f,numero_serie:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{flex:2}}><label className="acn-label">Defeito Reclamado *</label>
                  <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}} value={form.defeito_reclamado}
                    onChange={e=>setForm(f=>({...f,defeito_reclamado:e.target.value}))} /></div>
                <div className="form-group" style={{flex:1}}><label className="acn-label">Observações</label>
                  <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}} value={form.observacoes}
                    onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} /></div>
              </div>
            </div>

            {/* Seção 3 — Cliente */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>DADOS DO CLIENTE</div>
              <div className="form-row">
                <div className="form-group"><label className="acn-label">Nome do Cliente *</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.cliente_nome} onChange={e=>setForm(f=>({...f,cliente_nome:e.target.value.toUpperCase()}))} /></div>
                <div className="form-group"><label className="acn-label">Empresa / Órgão</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.empresa_orgao} onChange={e=>setForm(f=>({...f,empresa_orgao:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">CPF / CNPJ</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.cpf_cnpj} onChange={e=>setForm(f=>({...f,cpf_cnpj:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{flex:2}}><label className="acn-label">Endereço</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.endereco} onChange={e=>setForm(f=>({...f,endereco:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">Telefone</label>
                  <input className="acn-input" style={{width:'100%'}} value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} /></div>
                <div className="form-group"><label className="acn-label">E-mail</label>
                  <input type="email" className="acn-input" style={{width:'100%'}} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
            </div>

            {/* Seção 4 — Prazos */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>PRAZOS</div>
              <div className="form-row">
                {form.tipo_servico !== 'Garantia' && (
                  <div className="form-group"><label className="acn-label">Prazo para Orçamento</label>
                    <input type="date" className="acn-input" style={{width:'100%'}} value={form.prazo_orcamento}
                      onChange={e=>setForm(f=>({...f,prazo_orcamento:e.target.value}))} /></div>
                )}
                {form.tipo_servico === 'Garantia' && (
                  <div className="form-group"><label className="acn-label">Data Prevista de Entrega</label>
                    <input type="date" className="acn-input" style={{width:'100%'}} value={form.data_prevista_entrega}
                      onChange={e=>setForm(f=>({...f,data_prevista_entrega:e.target.value}))} /></div>
                )}
              </div>
            </div>

            {/* Seção 5 — Acessórios */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>CHECKLIST DE ACESSÓRIOS</div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                <input className="acn-input" style={{flex:1}} placeholder="Ex: Carregador, Manual, Cabo USB..."
                  value={acessInput} onChange={e=>setAcessInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}} />
                <button className="acn-btn" style={{background:'#0f766e',fontSize:10}} onClick={()=>{ if(acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}}>+ Add</button>
              </div>
              {form.acessorios.length === 0 ? (
                <div style={{fontSize:10,color:'#94a3b8'}}>Nenhum acessório adicionado.</div>
              ) : (
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {form.acessorios.map((a,i) => (
                    <label key={i} style={{display:'flex',alignItems:'center',gap:4,background:'white',border:'1px solid #e2e8f0',borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer'}}>
                      <input type="checkbox" checked={a.presente}
                        onChange={()=>setForm(f=>({...f,acessorios:f.acessorios.map((x,j)=>j===i?{...x,presente:!x.presente}:x)}))} />
                      {a.descricao}
                      <button type="button" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:11,lineHeight:1,padding:'0 2px'}}
                        onClick={()=>setForm(f=>({...f,acessorios:f.acessorios.filter((_,j)=>j!==i)}))}>×</button>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Seção 6 — Fotos entrada */}
            <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:10,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:10,color:'#0f766e',marginBottom:8}}>FOTOS DE ENTRADA</div>
              <input type="file" accept="image/*" multiple
                onChange={e=>setFotosEntradaFiles(Array.from(e.target.files||[]))} />
              {fotosEntradaFiles.length > 0 && (
                <div style={{fontSize:10,color:'#22c55e',marginTop:4}}>{fotosEntradaFiles.length} foto(s) selecionada(s)</div>
              )}
            </div>

            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0f766e',flex:1,padding:'9px',opacity:salvando?0.6:1}}
                onClick={criarOS} disabled={salvando}>{salvando?'Salvando...':'ABRIR OS'}</button>
              <button className="acn-btn" style={{background:'#94a3b8',padding:'9px'}} onClick={()=>setModalNova(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL ORÇAMENTO ════════════ */}
      {modalOrc && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">💰 Registrar Orçamento — {modalOrc.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>Cliente: {modalOrc.cliente_nome} | {modalOrc.equipamento_nome}</div>
            <label className="acn-label">Valor do Orçamento (R$) *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}} placeholder="Ex: 1.500,00"
              value={orcForm.valor} onChange={e=>setOrcForm(f=>({...f,valor:e.target.value}))} />
            <label className="acn-label">Condições de Pagamento</label>
            <textarea className="acn-input" rows={2} style={{width:'100%',marginBottom:12,resize:'vertical'}}
              placeholder="Ex: 50% entrada + 50% na retirada"
              value={orcForm.condicoes} onChange={e=>setOrcForm(f=>({...f,condicoes:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#f59e0b',flex:1}} onClick={enviarOrcamento}>ENVIAR ORÇAMENTO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalOrc(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL APROVAÇÃO ════════════ */}
      {modalAprov && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">✅ Aprovação de Orçamento — {modalAprov.numero_os}</div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:4,padding:8,marginBottom:12,fontSize:11}}>
              <strong>Valor:</strong> {fmtVal(modalAprov.valor_orcamento)} &nbsp;|&nbsp;
              <strong>Condições:</strong> {modalAprov.condicoes_pagamento || '—'}
            </div>
            <label className="acn-label">Nome do Aprovador *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}}
              value={aprovForm.nome} onChange={e=>setAprovForm(f=>({...f,nome:e.target.value}))} />
            <label className="acn-label">Data Prevista de Entrega</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={aprovForm.data_entrega} onChange={e=>setAprovForm(f=>({...f,data_entrega:e.target.value}))} />
            <label className="acn-label">Assinatura do Aprovador *</label>
            {aprovForm.sig ? (
              <div style={{textAlign:'center',marginBottom:8}}>
                <img src={aprovForm.sig} alt="Assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:'100%',height:90,objectFit:'contain',background:'white'}} />
                <button className="acn-btn" style={{background:'#94a3b8',marginTop:4,fontSize:10}} onClick={()=>setAprovForm(f=>({...f,sig:null}))}>Limpar</button>
              </div>
            ) : <SignCanvas onSave={(d)=>setAprovForm(f=>({...f,sig:d}))} />}
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1}} onClick={salvarAprovacao}>CONFIRMAR APROVAÇÃO</button>
              <button className="acn-btn" style={{background:'#ef4444'}} onClick={()=>{setModalRepr(modalAprov);setReprForm({motivo:'',data_retirada:'',nome_retirada:''});setModalAprov(null);}}>REPROVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalAprov(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL REPROVAÇÃO ════════════ */}
      {modalRepr && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:400}}>
            <div className="modal-title">❌ Reprovação — {modalRepr.numero_os}</div>
            <label className="acn-label">Motivo da Reprovação *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              value={reprForm.motivo} onChange={e=>setReprForm(f=>({...f,motivo:e.target.value}))} />
            <label className="acn-label">Data de Retirada do Equipamento</label>
            <input type="date" className="acn-input" style={{width:'100%',marginBottom:10}}
              value={reprForm.data_retirada} onChange={e=>setReprForm(f=>({...f,data_retirada:e.target.value}))} />
            <label className="acn-label">Nome de Quem Retirou</label>
            <input className="acn-input" style={{width:'100%',marginBottom:12}}
              value={reprForm.nome_retirada} onChange={e=>setReprForm(f=>({...f,nome_retirada:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={reprovar}>CONFIRMAR REPROVAÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalRepr(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL EXECUÇÃO / DEMANDA ════════════ */}
      {modalDetalhe && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">⚙️ Execução — {modalDetalhe.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>
              {modalDetalhe.cliente_nome} | {modalDetalhe.equipamento_nome} | {modalDetalhe.tipo_servico}
              {modalDetalhe.aprovado && <div style={{color:'#22c55e',fontWeight:700,marginTop:4}}>✅ Aprovado por {modalDetalhe.aprovador_nome}</div>}
            </div>
            {modalDetalhe.status !== 'Em Execução' && (
              <>
                <label className="acn-label">Encaminhar execução para o setor:</label>
                <select className="acn-input" style={{width:'100%',marginBottom:12}} value={setorExec} onChange={e=>setSetorExec(e.target.value)}>
                  {SETORES_EXEC.map(s=><option key={s}>{s}</option>)}
                </select>
                <button className="acn-btn" style={{background:'#8b5cf6',width:'100%',marginBottom:8}} onClick={()=>gerarDemanda(modalDetalhe)}>
                  ⚙️ GERAR DEMANDA E INICIAR EXECUÇÃO
                </button>
              </>
            )}
            {modalDetalhe.status === 'Em Execução' && (
              <button className="acn-btn" style={{background:'#0d9488',width:'100%',marginBottom:8}} onClick={()=>concluir(modalDetalhe)}>
                ✔ MARCAR COMO CONCLUÍDO
              </button>
            )}
            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalDetalhe(null)}>Fechar</button>
          </div>
        </div>
      )}

      {/* ════════════ MODAL SAÍDA / ENTREGA ════════════ */}
      {modalSaida && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">🚚 Entrega — {modalSaida.numero_os}</div>
            <label className="acn-label">Nome de Quem Retirou *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}}
              value={saidaForm.nome} onChange={e=>setSaidaForm(f=>({...f,nome:e.target.value}))} />
            <label className="acn-label">Fotos de Saída</label>
            <input type="file" accept="image/*" multiple style={{marginBottom:10}}
              onChange={e=>setFotosSaidaFiles(Array.from(e.target.files||[]))} />
            <label className="acn-label">Assinatura de Retirada *</label>
            {saidaForm.sig ? (
              <div style={{textAlign:'center',marginBottom:8}}>
                <img src={saidaForm.sig} alt="Assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:'100%',height:90,objectFit:'contain',background:'white'}} />
                <button className="acn-btn" style={{background:'#94a3b8',marginTop:4,fontSize:10}} onClick={()=>setSaidaForm(f=>({...f,sig:null}))}>Limpar</button>
              </div>
            ) : <SignCanvas onSave={(d)=>setSaidaForm(f=>({...f,sig:d}))} />}
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="acn-btn" style={{background:'#166534',flex:1}} onClick={salvarSaida}>CONFIRMAR ENTREGA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalSaida(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL NOVO EQUIPAMENTO ════════════ */}
      {modalNovoEquip && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:360}}>
            <div className="modal-title">+ Novo Tipo de Equipamento</div>
            <label className="acn-label">Nome do Equipamento *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:12}} value={novoEquip}
              onChange={e=>setNovoEquip(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&salvarEquipamento()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#0f766e',flex:1}} onClick={salvarEquipamento}>SALVAR</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalNovoEquip(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL IMPRESSÃO / PDF ════════════ */}
      {modalPrint && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:700,width:'95vw',maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div className="modal-title" style={{margin:0}}>🖨️ {modalPrint.numero_os}</div>
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#0f766e'}} onClick={()=>window.print()}>Imprimir / PDF</button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalPrint(null)}>Fechar</button>
              </div>
            </div>
            <PrintOS os={modalPrint} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente de Impressão ──────────────────────────────────────────────────
function PrintOS({ os }) {
  const fmtDt  = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';

  const row = (label, value) => (
    <tr>
      <td style={{fontWeight:600,color:'#64748b',width:160,padding:'4px 8px',fontSize:11,borderBottom:'1px solid #f1f5f9'}}>{label}</td>
      <td style={{padding:'4px 8px',fontSize:11,borderBottom:'1px solid #f1f5f9'}}>{value||'—'}</td>
    </tr>
  );

  return (
    <div style={{fontFamily:'Arial,sans-serif',color:'#1e293b'}}>
      {/* Cabeçalho */}
      <div style={{background:'#0f766e',color:'white',padding:'12px 16px',borderRadius:4,marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:16}}>ACN SINAL VERDE</div>
          <div style={{fontSize:11,opacity:.85}}>Ordem de Serviço</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontWeight:700,fontSize:18}}>{os.numero_os}</div>
          <div style={{fontSize:10}}>Abertura: {fmtDt(os.data_abertura)}</div>
        </div>
      </div>

      {/* Status */}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <span style={{background: STATUS_COR[os.status]||'#94a3b8',color:'white',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>{os.status}</span>
        <span style={{background:'#e2e8f0',padding:'3px 10px',borderRadius:20,fontSize:11}}>{os.tipo_servico}</span>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        {/* Equipamento */}
        <div style={{border:'1px solid #e2e8f0',borderRadius:4}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>EQUIPAMENTO</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {row('Tipo', os.equipamento_nome)}
              {row('Marca', os.marca)}
              {row('Modelo', os.modelo)}
              {row('Nº Série', os.numero_serie)}
              {row('Quantidade', os.quantidade)}
              {row('Categoria', os.tipo_projeto)}
            </tbody>
          </table>
        </div>

        {/* Cliente */}
        <div style={{border:'1px solid #e2e8f0',borderRadius:4}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>CLIENTE</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {row('Nome', os.cliente_nome)}
              {row('Empresa', os.empresa_orgao)}
              {row('CPF/CNPJ', os.cpf_cnpj)}
              {row('Telefone', os.telefone)}
              {row('E-mail', os.email)}
              {row('Endereço', os.endereco)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Defeito */}
      <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
        <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>DEFEITO / OBSERVAÇÕES</div>
        <div style={{padding:'8px 10px',fontSize:11}}>
          <div><strong>Defeito:</strong> {os.defeito_reclamado || '—'}</div>
          {os.observacoes && <div style={{marginTop:4}}><strong>Obs:</strong> {os.observacoes}</div>}
        </div>
      </div>

      {/* Acessórios */}
      {Array.isArray(os.acessorios) && os.acessorios.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>ACESSÓRIOS RECEBIDOS</div>
          <div style={{padding:'8px 10px',display:'flex',flexWrap:'wrap',gap:6}}>
            {os.acessorios.map((a,i) => (
              <span key={i} style={{fontSize:10,padding:'2px 8px',borderRadius:20,
                background: a.presente?'#dcfce7':'#fee2e2',
                color: a.presente?'#166534':'#991b1b',border:'1px solid',
                borderColor: a.presente?'#86efac':'#fca5a5'}}>
                {a.presente?'✓':'✗'} {a.descricao}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Orçamento */}
      {os.valor_orcamento && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>ORÇAMENTO</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {row('Valor', fmtVal(os.valor_orcamento))}
              {row('Condições', os.condicoes_pagamento)}
              {row('Enviado em', fmtDt(os.data_envio_orcamento))}
              {row('Situação', os.aprovado===true?'✅ APROVADO':os.aprovado===false?'❌ REPROVADO':'Aguardando')}
            </tbody>
          </table>
        </div>
      )}

      {/* Aprovação */}
      {os.aprovado && (
        <div style={{border:'1px solid #86efac',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f0fdf4',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#166534',borderBottom:'1px solid #86efac'}}>APROVAÇÃO DO CLIENTE</div>
          <div style={{padding:'10px',display:'flex',alignItems:'center',gap:16}}>
            <div style={{flex:1,fontSize:11}}>
              <div><strong>Aprovado por:</strong> {os.aprovador_nome}</div>
              <div><strong>Data:</strong> {fmtDt(os.data_aprovacao)}</div>
              {os.data_prevista_pos_aprovacao && <div><strong>Entrega prevista:</strong> {fmtDt(os.data_prevista_pos_aprovacao)}</div>}
            </div>
            {os.assinatura_aprovacao_url && (
              <img src={os.assinatura_aprovacao_url} alt="Assinatura" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
            )}
          </div>
        </div>
      )}

      {/* Saída */}
      {os.data_saida && (
        <div style={{border:'1px solid #86efac',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f0fdf4',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#166534',borderBottom:'1px solid #86efac'}}>RETIRADA / ENTREGA</div>
          <div style={{padding:'10px',display:'flex',alignItems:'center',gap:16}}>
            <div style={{flex:1,fontSize:11}}>
              <div><strong>Retirado por:</strong> {os.nome_retirada_saida}</div>
              <div><strong>Data:</strong> {fmtDt(os.data_saida)}</div>
            </div>
            {os.assinatura_saida_url && (
              <img src={os.assinatura_saida_url} alt="Assinatura saída" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
            )}
          </div>
        </div>
      )}

      {/* Fotos entrada */}
      {Array.isArray(os.fotos_entrada) && os.fotos_entrada.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>FOTOS DE ENTRADA</div>
          <div style={{padding:8,display:'flex',flexWrap:'wrap',gap:6}}>
            {os.fotos_entrada.map((u,i)=><img key={i} src={u} alt={`Foto ${i+1}`} style={{height:80,borderRadius:4,objectFit:'cover',border:'1px solid #e2e8f0'}} />)}
          </div>
        </div>
      )}

      {/* Fotos saída */}
      {Array.isArray(os.fotos_saida) && os.fotos_saida.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>FOTOS DE SAÍDA</div>
          <div style={{padding:8,display:'flex',flexWrap:'wrap',gap:6}}>
            {os.fotos_saida.map((u,i)=><img key={i} src={u} alt={`Foto ${i+1}`} style={{height:80,borderRadius:4,objectFit:'cover',border:'1px solid #e2e8f0'}} />)}
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div style={{borderTop:'1px solid #e2e8f0',paddingTop:8,marginTop:8,fontSize:10,color:'#94a3b8',textAlign:'center'}}>
        ACN Sinal Verde — Documento gerado em {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
