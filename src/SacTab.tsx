// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { notificarEvento } from './whatsappHelper';

// Fallback enquanto categorias não carregam do banco
const TIPOS_PROJETO_FALLBACK = [
  'Transformacao Veicular Ostensiva','Transformacao Veicular Administrativa',
  'Instalacao Equipamento','Manutencao Preventiva','Manutencao Corretiva',
  'Calibracao','Reforma','Projeto Especial','Servico Externo',
];

const STATUS_COR: Record<string, string> = {
  'Diagnóstico':      '#0891b2',
  'Aberta':           '#3b82f6',
  'Orçamento Pronto': '#7c3aed',
  'Orç. Enviado':     '#f59e0b',
  'Aprovado':         '#22c55e',
  'Reprovado':        '#ef4444',
  'Em Execução':      '#8b5cf6',
  'Concluído':        '#0d9488',
  'Entregue':         '#166534',
};

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

async function gerarNumeroOS(): Promise<string> {
  const ano = new Date().getFullYear();
  const { count } = await supabase.from('sac_ordens_servico').select('*', { count: 'exact', head: true })
    .like('numero_os', `%-${ano}`);
  return `OS-${String((count || 0) + 1).padStart(4, '0')}/${ano}`;
}

const FORM_VAZIO = {
  tipo_servico:'Orçamento', tipo_projeto:'', equipamento_nome:'',
  marca:'', modelo:'', numero_serie:'', quantidade:1,
  defeito_reclamado:'', observacoes:'',
  cliente_nome:'', empresa_orgao:'', endereco:'', cpf_cnpj:'', telefone:'', email:'',
  prazo_orcamento:'', data_prevista_entrega:'',
  acessorios: [] as {descricao:string; presente:boolean}[],
  despesa_deslocamento:'', despesa_hospedagem:'', despesa_alimentacao:'',
};

export default function SacTab({ currentUser }) {
  const [abaAtiva, setAbaAtiva]         = useState<'os'|'cadastros'>('os');
  const [ordens, setOrdens]             = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  const [categorias, setCategorias]     = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo]     = useState('');
  const [busca, setBusca]               = useState('');

  // Cadastros estados
  const [abaCad, setAbaCad]             = useState<'equipamentos'|'categorias'>('equipamentos');
  const [novoEquipCad, setNovoEquipCad] = useState('');
  const [novaCat, setNovaCat]           = useState({ nome:'', tem_despesas: false });
  const [editCat, setEditCat]           = useState<any>(null);

  const [modalNova, setModalNova]       = useState(false);
  const [modalOrc, setModalOrc]         = useState(null);
  const [modalAprov, setModalAprov]     = useState(null);
  const [modalRepr, setModalRepr]       = useState(null);
  const [modalSaida, setModalSaida]     = useState(null);
  const [modalPrint, setModalPrint]     = useState(null);
  const [modalNovoEquip, setModalNovoEquip] = useState(false);

  const [form, setForm]                 = useState<typeof FORM_VAZIO>({ ...FORM_VAZIO });
  const [acessInput, setAcessInput]     = useState('');
  const [fotosEntradaFiles, setFotosEntradaFiles] = useState([]);
  const [salvando, setSalvando]         = useState(false);

  const [orcForm, setOrcForm]           = useState({ valor:'', condicoes:'' });
  const [aprovForm, setAprovForm]       = useState({ nome:'', sig: null as string|null, data_entrega:'' });
  const [reprForm, setReprForm]         = useState({ motivo:'', data_retirada:'', nome_retirada:'' });
  const [saidaForm, setSaidaForm]       = useState({ nome:'', sig: null as string|null });
  const [fotosSaidaFiles, setFotosSaidaFiles] = useState([]);
  const [novoEquip, setNovoEquip]       = useState('');

  // Lista de equipamentos por item (cresce/diminui conforme quantidade)
  const EQUIP_VAZIO = { marca:'', modelo:'', numero_serie:'', defeito:'' };
  const [equipLista, setEquipLista]     = useState([{ ...EQUIP_VAZIO }]);

  useEffect(() => { fetchOrdens(); fetchEquipamentos(); fetchCategorias(); }, []);

  const fetchCategorias = async () => {
    const { data } = await supabase.from('sac_categorias').select('*').order('nome');
    setCategorias(data || []);
  };

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

  // ── Computados ────────────────────────────────────────────────────────────
  const categoriasAtivas = categorias.filter(c => c.ativo);
  const tiposProjeto = categoriasAtivas.length > 0 ? categoriasAtivas.map(c => c.nome) : TIPOS_PROJETO_FALLBACK;
  const catSelecionada = categorias.find(c => c.nome === form.tipo_projeto);
  const hasDespesas = catSelecionada?.tem_despesas || form.tipo_projeto?.toLowerCase().includes('externo');

  // Redimensiona equipLista conforme quantidade
  const handleQtdChange = (n: number) => {
    const newN = Math.max(1, n || 1);
    setForm(f => ({ ...f, quantidade: newN }));
    setEquipLista(prev => {
      const cur = [...prev];
      while (cur.length < newN) cur.push({ ...EQUIP_VAZIO });
      return cur.slice(0, newN);
    });
  };

  // ── CRIAR OS ──────────────────────────────────────────────────────────────
  const criarOS = async () => {
    if (!form.cliente_nome.trim()) { alert('Nome do cliente obrigatório!'); return; }
    if (!form.equipamento_nome.trim()) { alert('Informe o equipamento!'); return; }
    setSalvando(true);
    const numero = await gerarNumeroOS();
    const agora = new Date().toISOString();
    const isGarantia = form.tipo_servico === 'Garantia';

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
      marca: equipLista[0]?.marca || null,
      modelo: equipLista[0]?.modelo || null,
      numero_serie: equipLista[0]?.numero_serie || null,
      quantidade: form.quantidade || 1,
      defeito_reclamado: equipLista[0]?.defeito || null,
      equipamentos_lista: equipLista,
      observacoes: form.observacoes || null,
      cliente_nome: form.cliente_nome,
      empresa_orgao: form.empresa_orgao || null,
      endereco: form.endereco || null,
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      prazo_orcamento: !isGarantia ? (form.prazo_orcamento || null) : null,
      data_prevista_entrega: isGarantia ? (form.data_prevista_entrega || null) : null,
      // Garantia entra direto como Aprovado; outros como Diagnóstico
      status: isGarantia ? 'Aprovado' : 'Diagnóstico',
      aprovado: isGarantia ? true : null,
      acessorios: form.acessorios,
      fotos_entrada: urlsFotos,
      data_abertura: agora,
      criado_por_nome: currentUser?.nome,
      criado_por_email: currentUser?.email,
      atualizado_em: agora,
      // Despesas (Serviço Externo)
      despesa_deslocamento: hasDespesas && form.despesa_deslocamento ? parseFloat(form.despesa_deslocamento.replace(',','.')) : null,
      despesa_hospedagem:   hasDespesas && form.despesa_hospedagem   ? parseFloat(form.despesa_hospedagem.replace(',','.'))   : null,
      despesa_alimentacao:  hasDespesas && form.despesa_alimentacao  ? parseFloat(form.despesa_alimentacao.replace(',','.'))  : null,
      total_despesas: hasDespesas ? (
        (parseFloat(form.despesa_deslocamento.replace(',','.')) || 0) +
        (parseFloat(form.despesa_hospedagem.replace(',','.'))   || 0) +
        (parseFloat(form.despesa_alimentacao.replace(',','.'))  || 0)
      ) : null,
    };

    const { data: osData, error } = await supabase.from('sac_ordens_servico').insert([payload]).select('id').single();
    if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }

    // Auto-criar demanda para Laboratório
    const sac_fase = isGarantia ? 'execucao' : 'diagnostico';
    const descDemanda = isGarantia
      ? `[SAC-EXEC] ${numero} — ${form.equipamento_nome} | ${form.defeito_reclamado || 'Ver OS'}`
      : `[SAC-DIAG] ${numero} — ${form.equipamento_nome} | ${form.defeito_reclamado || 'Ver OS'}`;
    await supabase.from('demandas_setoriais').insert([{
      setor_destino: 'Laboratorio',
      descricao: descDemanda,
      numero_opl: numero,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      sac_os_id: osData?.id,
      sac_fase,
      logs_demanda: [{
        texto: isGarantia
          ? `OS Garantia — aprovada automaticamente. Encaminhada para execução.`
          : `OS aberta para diagnóstico e elaboração de orçamento.`,
        usuario: currentUser?.nome, hora: agora,
      }],
    }]);

    notificarEvento('sac_os_aberta', `📋 *Nova OS ${numero}*\nCliente: ${form.cliente_nome}\nEquip: ${form.equipamento_nome}\nTipo: ${form.tipo_servico}\nPor: ${currentUser?.nome}`);

    setForm({ ...FORM_VAZIO }); setFotosEntradaFiles([]); setAcessInput('');
    setEquipLista([{ ...EQUIP_VAZIO }]);
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
  const salvarAprovacao = async () => {
    if (!aprovForm.nome.trim()) { alert('Informe o nome do aprovador!'); return; }
    if (!aprovForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(aprovForm.sig, `os_${modalAprov.numero_os.replace('/','_')}`);
    const agora = new Date().toISOString();

    await supabase.from('sac_ordens_servico').update({
      status: 'Aprovado',
      aprovado: true,
      aprovador_nome: aprovForm.nome,
      data_aprovacao: agora,
      assinatura_aprovacao_url: url || '',
      data_prevista_pos_aprovacao: aprovForm.data_entrega || null,
      atualizado_em: agora,
    }).eq('id', modalAprov.id);

    // Auto-criar demanda de EXECUÇÃO para Laboratório
    await supabase.from('demandas_setoriais').insert([{
      setor_destino: 'Laboratorio',
      descricao: `[SAC-EXEC] ${modalAprov.numero_os} — ${modalAprov.equipamento_nome} | Aguarda execução do reparo`,
      numero_opl: modalAprov.numero_os,
      status: 'Pendente',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      sac_os_id: modalAprov.id,
      sac_fase: 'execucao',
      logs_demanda: [{
        texto: `Cliente aprovou orçamento ${fmtVal(modalAprov.valor_orcamento)}. Aprovador: ${aprovForm.nome}. Data prevista: ${aprovForm.data_entrega || 'não definida'}.`,
        usuario: currentUser?.nome, hora: agora,
      }],
    }]);

    notificarEvento('sac_os_aprovada', `✅ *OS ${modalAprov.numero_os} APROVADA*\nCliente: ${modalAprov.cliente_nome}\nAprovador: ${aprovForm.nome}\nPor: ${currentUser?.nome}`);
    setModalAprov(null); setAprovForm({ nome:'', sig:null, data_entrega:'' }); fetchOrdens();
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

  // ── SAÍDA / ENTREGA ───────────────────────────────────────────────────────
  const salvarSaida = async () => {
    if (!saidaForm.nome.trim()) { alert('Informe o nome de quem retirou!'); return; }
    if (!saidaForm.sig) { alert('Assinatura obrigatória!'); return; }
    const url = await uploadAssinatura(saidaForm.sig, `os_${modalSaida.numero_os.replace('/','_')}_saida`);
    const agora = new Date().toISOString();
    const urlsFotos: string[] = [];
    for (const f of fotosSaidaFiles) {
      const u = await uploadFoto(f, `os_${modalSaida.numero_os.replace('/','_')}/saida`);
      if (u) urlsFotos.push(u);
    }
    await supabase.from('sac_ordens_servico').update({
      status: 'Entregue',
      nome_retirada_saida: saidaForm.nome,
      assinatura_saida_url: url || '',
      data_saida: agora,
      fotos_saida: urlsFotos,
      atualizado_em: agora,
    }).eq('id', modalSaida.id);
    notificarEvento('sac_os_entregue', `🚚 *OS ${modalSaida.numero_os} ENTREGUE*\nCliente: ${modalSaida.cliente_nome}\nRetirado por: ${saidaForm.nome}`);
    setModalSaida(null); setSaidaForm({ nome:'', sig:null }); setFotosSaidaFiles([]); fetchOrdens();
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

    // Orçamento finalizado pelo Lab → SAC envia ao cliente
    if (os.status === 'Orçamento Pronto')
      btns.push(
        <button key="enviar" className="acn-btn" style={{background:'#7c3aed',fontSize:9}}
          onClick={()=>{ setModalOrc(os); setOrcForm({ valor: os.valor_orcamento ? String(os.valor_orcamento) : '', condicoes: os.condicoes_pagamento || '' }); }}>
          📤 Enviar
        </button>
      );

    // Cliente respondendo o orçamento enviado
    if (os.status === 'Orç. Enviado')
      btns.push(
        <button key="aprov" className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={()=>{setModalAprov(os);setAprovForm({nome:'',sig:null,data_entrega:''});}}>✅ Aprovar</button>,
        <button key="repr"  className="acn-btn" style={{background:'#ef4444',fontSize:9}} onClick={()=>{setModalRepr(os);setReprForm({motivo:'',data_retirada:'',nome_retirada:''});}}>❌ Reprovar</button>
      );

    // Reprovado — reagendar / reavaliar
    if (os.status === 'Reprovado')
      btns.push(
        <button key="reaval" className="acn-btn" style={{background:'#f59e0b',fontSize:9}}
          onClick={()=>{ if(window.confirm(`Reabrir OS ${os.numero_os} para novo orçamento?`)) supabase.from('sac_ordens_servico').update({status:'Diagnóstico',aprovado:null,motivo_reprovacao:null,atualizado_em:new Date().toISOString()}).eq('id',os.id).then(()=>fetchOrdens()); }}>
          🔄 Reavaliar
        </button>
      );

    // Lab concluiu o reparo → SAC faz a entrega
    if (os.status === 'Concluído')
      btns.push(
        <button key="saida" className="acn-btn" style={{background:'#166534',fontSize:9}} onClick={()=>{setModalSaida(os);setSaidaForm({nome:'',sig:null});setFotosSaidaFiles([]);}}>🚚 Entrega</button>
      );

    btns.push(<button key="print" className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalPrint(os)}>🖨️ PDF</button>);
    return btns;
  };

  // ── CADASTROS: salvar equipamento ─────────────────────────────────────────
  const salvarEquipamentoCad = async () => {
    if (!novoEquipCad.trim()) return;
    const { error } = await supabase.from('sac_equipamentos').insert([{ nome: novoEquipCad.trim() }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setNovoEquipCad('');
    fetchEquipamentos();
  };

  const toggleEquipamento = async (e) => {
    await supabase.from('sac_equipamentos').update({ ativo: !e.ativo }).eq('id', e.id);
    fetchEquipamentos();
  };

  const salvarCategoria = async () => {
    if (!novaCat.nome.trim()) return;
    const { error } = await supabase.from('sac_categorias').insert([{ nome: novaCat.nome.trim(), tem_despesas: novaCat.tem_despesas }]);
    if (error) { alert('Erro: ' + error.message); return; }
    setNovaCat({ nome:'', tem_despesas:false });
    fetchCategorias();
  };

  const salvarEdicaoCategoria = async () => {
    if (!editCat?.nome?.trim()) return;
    await supabase.from('sac_categorias').update({ nome: editCat.nome.trim(), tem_despesas: editCat.tem_despesas }).eq('id', editCat.id);
    setEditCat(null);
    fetchCategorias();
  };

  const toggleCategoria = async (c) => {
    await supabase.from('sac_categorias').update({ ativo: !c.ativo }).eq('id', c.id);
    fetchCategorias();
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── SELETOR DE ABA ── */}
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:'2px solid #0f766e'}}>
        <button style={{flex:1,padding:'8px',background:abaAtiva==='os'?'#0f766e':'white',color:abaAtiva==='os'?'white':'#0f766e',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaAtiva('os')}>Ordens de Serviço</button>
        <button style={{flex:1,padding:'8px',background:abaAtiva==='cadastros'?'#0f766e':'white',color:abaAtiva==='cadastros'?'white':'#0f766e',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaAtiva('cadastros')}>⚙️ Cadastros</button>
      </div>

      {/* ── ABA CADASTROS ── */}
      {abaAtiva === 'cadastros' && (
        <div>
          {/* Sub-abas */}
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            {[{id:'equipamentos',label:'Equipamentos'},{id:'categorias',label:'Categorias (Tipo Projeto)'}].map(a=>(
              <button key={a.id} className="acn-btn"
                style={{background:abaCad===a.id?'#0f766e':'#94a3b8'}}
                onClick={()=>setAbaCad(a.id as any)}>{a.label}</button>
            ))}
          </div>

          {/* ── Equipamentos ── */}
          {abaCad === 'equipamentos' && (
            <div className="sec-card">
              <div className="sec-hdr"><span>Tipos de Equipamento</span></div>
              <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input className="acn-input" style={{flex:1}} placeholder="Nome do equipamento..."
                    value={novoEquipCad} onChange={e=>setNovoEquipCad(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&salvarEquipamentoCad()} />
                  <button className="acn-btn" style={{background:'#0f766e'}} onClick={salvarEquipamentoCad}>+ Adicionar</button>
                </div>
              </div>
              <div className="sec-body" style={{overflowX:'auto',padding:0}}>
                <table>
                  <thead><tr><th>Nome</th><th>Status</th><th>Ação</th></tr></thead>
                  <tbody>
                    {equipamentos.length === 0 && <tr><td colSpan={3}><div className="acn-empty">Nenhum equipamento cadastrado.</div></td></tr>}
                    {[...equipamentos, ...supabase && []].map ? equipamentos.map((e: any) => (
                      <tr key={e.id} style={{opacity:e.ativo?1:0.5}}>
                        <td><strong>{e.nome}</strong></td>
                        <td><span className="acn-badge" style={{background:e.ativo?'#22c55e':'#94a3b8'}}>{e.ativo?'Ativo':'Inativo'}</span></td>
                        <td>
                          <button className="acn-btn" style={{background:e.ativo?'#ef4444':'#22c55e',fontSize:9}}
                            onClick={()=>toggleEquipamento(e)}>{e.ativo?'Desativar':'Ativar'}</button>
                        </td>
                      </tr>
                    )) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Categorias ── */}
          {abaCad === 'categorias' && (
            <div className="sec-card">
              <div className="sec-hdr"><span>Categorias (Tipos de Projeto)</span></div>
              <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
                <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                  <div>
                    <label className="acn-label">Nome da Categoria</label>
                    <input className="acn-input" style={{width:250}} placeholder="Ex: Serviço de Emergência..."
                      value={novaCat.nome} onChange={e=>setNovaCat(f=>({...f,nome:e.target.value}))} />
                  </div>
                  <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,cursor:'pointer',padding:'4px 0'}}>
                    <input type="checkbox" checked={novaCat.tem_despesas}
                      onChange={e=>setNovaCat(f=>({...f,tem_despesas:e.target.checked}))} />
                    <span>Exibe despesas de campo (Serviço Externo)</span>
                  </label>
                  <button className="acn-btn" style={{background:'#0f766e'}} onClick={salvarCategoria}>+ Adicionar</button>
                </div>
              </div>
              <div className="sec-body" style={{overflowX:'auto',padding:0}}>
                <table>
                  <thead><tr><th>Nome</th><th>Despesas de Campo</th><th>Status</th><th>Ações</th></tr></thead>
                  <tbody>
                    {categorias.length === 0 && <tr><td colSpan={4}><div className="acn-empty">Nenhuma categoria.</div></td></tr>}
                    {categorias.map((c: any) => (
                      <tr key={c.id} style={{opacity:c.ativo?1:0.5}}>
                        <td>
                          {editCat?.id === c.id ? (
                            <input className="acn-input" value={editCat.nome} onChange={e=>setEditCat(f=>({...f,nome:e.target.value}))} />
                          ) : <strong>{c.nome}</strong>}
                        </td>
                        <td>
                          {editCat?.id === c.id ? (
                            <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,cursor:'pointer'}}>
                              <input type="checkbox" checked={editCat.tem_despesas} onChange={e=>setEditCat(f=>({...f,tem_despesas:e.target.checked}))} />
                              Sim
                            </label>
                          ) : (
                            c.tem_despesas
                              ? <span className="acn-badge" style={{background:'#f59e0b',fontSize:8}}>🚗 SIM</span>
                              : <span style={{fontSize:10,color:'#94a3b8'}}>—</span>
                          )}
                        </td>
                        <td><span className="acn-badge" style={{background:c.ativo?'#22c55e':'#94a3b8'}}>{c.ativo?'Ativa':'Inativa'}</span></td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            {editCat?.id === c.id ? (
                              <>
                                <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={salvarEdicaoCategoria}>Salvar</button>
                                <button className="acn-btn" style={{background:'#94a3b8',fontSize:9}} onClick={()=>setEditCat(null)}>Cancel</button>
                              </>
                            ) : (
                              <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setEditCat({...c})}>✏️ Editar</button>
                            )}
                            <button className="acn-btn" style={{background:c.ativo?'#ef4444':'#22c55e',fontSize:9}}
                              onClick={()=>toggleCategoria(c)}>{c.ativo?'Desativar':'Ativar'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA OS (condicional) ── */}
      {abaAtiva === 'os' && <div>

      {/* ── HEADER ── */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>SAC — Ordens de Serviço ({ordensFiltradas.length})</span>
          <button className="acn-btn" style={{background:'#0f766e'}} onClick={()=>{setForm({...FORM_VAZIO});setFotosEntradaFiles([]);setAcessInput('');setEquipLista([{...EQUIP_VAZIO}]);setModalNova(true);}}>
            + Nova OS
          </button>
        </div>

        {/* Legenda de fluxo */}
        <div className="sec-body" style={{padding:'6px 12px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:9,color:'#64748b',marginRight:4}}>Fluxo:</span>
          {['Diagnóstico','Orçamento Pronto','Orç. Enviado','Aprovado','Em Execução','Concluído','Entregue'].map((s,i,arr) => (
            <React.Fragment key={s}>
              <span className="acn-badge" style={{background:STATUS_COR[s]||'#94a3b8',fontSize:8}}>{s}</span>
              {i < arr.length-1 && <span style={{color:'#94a3b8',fontSize:9}}>→</span>}
            </React.Fragment>
          ))}
          <span style={{marginLeft:8,fontSize:9,color:'#94a3b8'}}>(Lab executa diagnóstico e reparo)</span>
        </div>

        {/* Filtros */}
        <div className="sec-body" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'8px 12px',borderBottom:'1px solid #e2e8f0'}}>
          <input className="acn-input" style={{width:200}} placeholder="Buscar OS / cliente / equip."
            value={busca} onChange={e=>setBusca(e.target.value)} />
          <select className="acn-input" style={{width:150}} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
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
                <th>Abertura</th><th>Prazo Orç.</th><th>Valor</th>
                <th>KPI Orç.</th><th>KPI Exec.</th><th>Status</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {ordensFiltradas.map(o => (
                  <tr key={o.id} style={{
                    background: o.status==='Reprovado' ? '#fef2f2'
                              : o.status==='Aprovado'  ? '#eff6ff'
                              : o.status==='Entregue'  ? '#f0fdf4'
                              : undefined
                  }}>
                    <td><strong style={{color:'#0f766e'}}>{o.numero_os}</strong></td>
                    <td><span className="acn-badge" style={{background:'#e2e8f0',color:'#1e293b',fontSize:9}}>{o.tipo_servico}</span></td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.equipamento_nome}</td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.cliente_nome}</td>
                    <td style={{fontSize:10}}>{fmtDt(o.data_abertura)}</td>
                    <td style={{fontSize:10,color: o.prazo_orcamento && new Date(o.prazo_orcamento)<new Date() && ['Diagnóstico','Aberta'].includes(o.status) ? '#ef4444':'inherit'}}>
                      {fmtDt(o.prazo_orcamento)}
                    </td>
                    <td style={{fontSize:10}}>{fmtVal(o.valor_orcamento)}</td>
                    <td style={{fontSize:10,color:'#0891b2',fontWeight:o.kpi_orcamento_horas?700:400}}>
                      {o.kpi_orcamento_horas ? `${Number(o.kpi_orcamento_horas).toFixed(1)}h` : '—'}
                    </td>
                    <td style={{fontSize:10,color:'#8b5cf6',fontWeight:o.kpi_execucao_horas?700:400}}>
                      {o.kpi_execucao_horas ? `${Number(o.kpi_execucao_horas).toFixed(1)}h` : '—'}
                    </td>
                    <td><span className="acn-badge" style={{background: STATUS_COR[o.status]||'#94a3b8'}}>{o.status}</span></td>
                    <td><div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{renderAcoes(o)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ════════ MODAL NOVA OS ════════ */}
      {modalNova && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:700,width:'95vw',maxHeight:'92vh',overflowY:'auto',padding:0}}>

            {/* Header */}
            <div style={{background:'#0f766e',padding:'14px 20px',borderRadius:'8px 8px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'white',letterSpacing:.3}}>📋 Nova Ordem de Serviço</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,.7)',marginTop:2}}>Preencha os dados para abertura da OS</div>
              </div>
              <button style={{background:'rgba(255,255,255,.15)',border:'none',color:'white',borderRadius:4,cursor:'pointer',padding:'4px 10px',fontSize:12}} onClick={()=>setModalNova(false)}>✕</button>
            </div>

            <div style={{padding:'16px 20px 20px'}}>

            {/* CLASSIFICAÇÃO */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Classificação</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="acn-label">Tipo de Serviço *</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.tipo_servico} onChange={e=>setForm(f=>({...f,tipo_servico:e.target.value}))}>
                    <option>Orçamento</option><option>Conserto</option><option>Troca</option><option>Garantia</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="acn-label">Categoria (Tipo Projeto)</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.tipo_projeto}
                    onChange={e=>setForm(f=>({...f,tipo_projeto:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {tiposProjeto.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
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
                <div className="form-group" style={{maxWidth:90}}>
                  <label className="acn-label">Qtd</label>
                  <input type="number" min={1} max={20} className="acn-input" style={{width:'100%'}} value={form.quantidade}
                    onChange={e=>handleQtdChange(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* EQUIPAMENTOS — um card por unidade */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>
                Dados do{equipLista.length > 1 ? 's' : ''} Equipamento{equipLista.length > 1 ? 's' : ''} ({equipLista.length})
              </div>
              {equipLista.map((eq, idx) => (
                <div key={idx} style={{border:'1px solid var(--border)',borderRadius:6,padding:'10px 12px',marginBottom:8}}>
                  {equipLista.length > 1 && (
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <span style={{background:'#0f766e',color:'white',fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10}}>#{idx+1}</span>
                      <span style={{fontSize:10,opacity:.6}}>Equipamento {idx+1} de {equipLista.length}</span>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="acn-label">Marca</label>
                      <input className="acn-input" style={{width:'100%'}} value={eq.marca}
                        onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,marca:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="acn-label">Modelo</label>
                      <input className="acn-input" style={{width:'100%'}} value={eq.modelo}
                        onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,modelo:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="acn-label">Nº de Série</label>
                      <input className="acn-input" style={{width:'100%'}} value={eq.numero_serie}
                        onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,numero_serie:e.target.value}:x))} />
                    </div>
                  </div>
                  <div className="form-group" style={{marginTop:4}}>
                    <label className="acn-label">Defeito Reclamado *</label>
                    <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}} value={eq.defeito}
                      onChange={e=>setEquipLista(l=>l.map((x,i)=>i===idx?{...x,defeito:e.target.value}:x))} />
                  </div>
                </div>
              ))}
            </div>

            {/* OBSERVAÇÕES GERAIS */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Observações Gerais</div>
              <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}} placeholder="Observações adicionais..."
                value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} />
            </div>

            {/* DADOS DO CLIENTE */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Dados do Cliente</div>
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

            {/* PRAZOS */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Prazos</div>
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

            {/* Despesas — Serviço Externo */}
            {hasDespesas && (
              <div style={{border:'1px solid rgba(245,158,11,.35)',borderRadius:6,padding:'10px 12px',marginBottom:12,background:'rgba(245,158,11,.06)'}}>
                <div style={{fontWeight:700,fontSize:9,color:'#b45309',letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>🚗 Despesas de Campo</div>
                <div className="form-row">
                  <div className="form-group"><label className="acn-label">Deslocamento (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_deslocamento} onChange={e=>setForm(f=>({...f,despesa_deslocamento:e.target.value}))} /></div>
                  <div className="form-group"><label className="acn-label">Hospedagem (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_hospedagem} onChange={e=>setForm(f=>({...f,despesa_hospedagem:e.target.value}))} /></div>
                  <div className="form-group"><label className="acn-label">Alimentação (R$)</label>
                    <input className="acn-input" style={{width:'100%'}} placeholder="0,00"
                      value={form.despesa_alimentacao} onChange={e=>setForm(f=>({...f,despesa_alimentacao:e.target.value}))} /></div>
                  <div className="form-group" style={{alignSelf:'flex-end'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#b45309',padding:'4px 8px',background:'rgba(245,158,11,.15)',borderRadius:4,border:'1px solid rgba(245,158,11,.3)'}}>
                      Total: R$ {(
                        (parseFloat(form.despesa_deslocamento.replace(',','.')||'0')||0) +
                        (parseFloat(form.despesa_hospedagem.replace(',','.')||'0')||0) +
                        (parseFloat(form.despesa_alimentacao.replace(',','.')||'0')||0)
                      ).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Acessórios */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Checklist de Acessórios</div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                <input className="acn-input" style={{flex:1}} placeholder="Ex: Carregador, Manual, Cabo USB..."
                  value={acessInput} onChange={e=>setAcessInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}} />
                <button className="acn-btn" style={{background:'#0f766e',fontSize:10}} onClick={()=>{ if(acessInput.trim()){ setForm(f=>({...f,acessorios:[...f.acessorios,{descricao:acessInput.trim(),presente:true}]})); setAcessInput(''); }}}>+ Add</button>
              </div>
              {form.acessorios.length === 0 ? (
                <div style={{fontSize:10,opacity:.5}}>Nenhum acessório adicionado.</div>
              ) : (
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {form.acessorios.map((a,i) => (
                    <label key={i} style={{display:'flex',alignItems:'center',gap:4,border:'1px solid var(--border)',borderRadius:4,padding:'3px 8px',fontSize:10,cursor:'pointer'}}>
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

            {/* Fotos entrada */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:9,color:'#0f766e',letterSpacing:1,textTransform:'uppercase',marginBottom:6,paddingBottom:4,borderBottom:'2px solid #0f766e'}}>Fotos de Entrada</div>
              <input type="file" accept="image/*" multiple
                onChange={e=>setFotosEntradaFiles(Array.from(e.target.files||[]))} />
              {fotosEntradaFiles.length > 0 && (
                <div style={{fontSize:10,color:'#22c55e',marginTop:4}}>{fotosEntradaFiles.length} foto(s) selecionada(s)</div>
              )}
            </div>

            {/* Info */}
            {form.tipo_servico !== 'Garantia' && (
              <div style={{border:'1px solid rgba(59,130,246,.3)',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:11,background:'rgba(59,130,246,.06)'}}>
                ℹ️ A OS será encaminhada automaticamente para o <strong>Laboratório</strong> para diagnóstico e elaboração do orçamento.
              </div>
            )}
            {form.tipo_servico === 'Garantia' && (
              <div style={{border:'1px solid rgba(34,197,94,.3)',borderRadius:6,padding:'8px 12px',marginBottom:12,fontSize:11,background:'rgba(34,197,94,.06)'}}>
                ✅ Garantia é <strong>aprovada automaticamente</strong>. O Laboratório receberá a OS para execução direta.
              </div>
            )}

            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button className="acn-btn" style={{background:'#0f766e',flex:1,padding:'10px',fontSize:11,opacity:salvando?0.6:1}}
                onClick={criarOS} disabled={salvando}>{salvando?'Salvando...':'ABRIR OS'}</button>
              <button className="acn-btn" style={{background:'#64748b',padding:'10px'}} onClick={()=>setModalNova(false)}>Cancelar</button>
            </div>

            </div>{/* fim padding wrapper */}
          </div>
        </div>
      )}

      {/* ════════ MODAL ORÇAMENTO (confirmar/editar antes de enviar) ════════ */}
      {modalOrc && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-title">📤 Enviar Orçamento ao Cliente — {modalOrc.numero_os}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>Cliente: {modalOrc.cliente_nome} | {modalOrc.equipamento_nome}</div>
            {modalOrc.observacoes_lab && (
              <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:4,padding:'8px 10px',marginBottom:12,fontSize:11}}>
                <strong>Diagnóstico do Lab:</strong> {modalOrc.observacoes_lab}
              </div>
            )}
            <label className="acn-label">Valor do Orçamento (R$) *</label>
            <input className="acn-input" style={{width:'100%',marginBottom:10}} placeholder="Ex: 1.500,00"
              value={orcForm.valor} onChange={e=>setOrcForm(f=>({...f,valor:e.target.value}))} />
            <label className="acn-label">Condições de Pagamento</label>
            <textarea className="acn-input" rows={2} style={{width:'100%',marginBottom:12,resize:'vertical'}}
              placeholder="Ex: 50% entrada + 50% na retirada"
              value={orcForm.condicoes} onChange={e=>setOrcForm(f=>({...f,condicoes:e.target.value}))} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#7c3aed',flex:1}} onClick={enviarOrcamento}>ENVIAR AO CLIENTE</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalOrc(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL APROVAÇÃO ════════ */}
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

      {/* ════════ MODAL REPROVAÇÃO ════════ */}
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

      {/* ════════ MODAL SAÍDA / ENTREGA ════════ */}
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

      {/* ════════ MODAL NOVO EQUIPAMENTO ════════ */}
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

      {/* ════════ MODAL PDF ════════ */}
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
      </div>}  {/* fim abaAtiva === 'os' */}
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

      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <span style={{background: STATUS_COR[os.status]||'#94a3b8',color:'white',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>{os.status}</span>
        <span style={{background:'#e2e8f0',padding:'3px 10px',borderRadius:20,fontSize:11}}>{os.tipo_servico}</span>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
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

      <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
        <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>DEFEITO / OBSERVAÇÕES</div>
        <div style={{padding:'8px 10px',fontSize:11}}>
          <div><strong>Defeito:</strong> {os.defeito_reclamado || '—'}</div>
          {os.observacoes && <div style={{marginTop:4}}><strong>Obs:</strong> {os.observacoes}</div>}
          {os.observacoes_lab && <div style={{marginTop:4,color:'#0891b2'}}><strong>Diagnóstico Lab:</strong> {os.observacoes_lab}</div>}
        </div>
      </div>

      {Array.isArray(os.acessorios) && os.acessorios.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>ACESSÓRIOS</div>
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

      {os.valor_orcamento && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>ORÇAMENTO</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {row('Valor', fmtVal(os.valor_orcamento))}
              {row('Condições', os.condicoes_pagamento)}
              {row('Enviado em', fmtDt(os.data_envio_orcamento))}
              {row('KPI Elaboração', os.kpi_orcamento_horas ? `${Number(os.kpi_orcamento_horas).toFixed(1)}h úteis` : '—')}
              {row('Situação', os.aprovado===true?'✅ APROVADO':os.aprovado===false?'❌ REPROVADO':'Aguardando')}
            </tbody>
          </table>
        </div>
      )}

      {os.aprovado && (
        <div style={{border:'1px solid #86efac',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f0fdf4',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#166534',borderBottom:'1px solid #86efac'}}>APROVAÇÃO</div>
          <div style={{padding:'10px',display:'flex',alignItems:'center',gap:16}}>
            <div style={{flex:1,fontSize:11}}>
              <div><strong>Aprovado por:</strong> {os.aprovador_nome}</div>
              <div><strong>Data:</strong> {fmtDt(os.data_aprovacao)}</div>
              {os.data_prevista_pos_aprovacao && <div><strong>Entrega prevista:</strong> {fmtDt(os.data_prevista_pos_aprovacao)}</div>}
              {os.kpi_execucao_horas && <div><strong>KPI Execução:</strong> {Number(os.kpi_execucao_horas).toFixed(1)}h úteis</div>}
            </div>
            {os.assinatura_aprovacao_url && (
              <img src={os.assinatura_aprovacao_url} alt="Assinatura" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
            )}
          </div>
        </div>
      )}

      {os.data_saida && (
        <div style={{border:'1px solid #86efac',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f0fdf4',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#166534',borderBottom:'1px solid #86efac'}}>RETIRADA</div>
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

      {Array.isArray(os.fotos_entrada) && os.fotos_entrada.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>FOTOS DE ENTRADA</div>
          <div style={{padding:8,display:'flex',flexWrap:'wrap',gap:6}}>
            {os.fotos_entrada.map((u,i)=><img key={i} src={u} alt={`Foto ${i+1}`} style={{height:80,borderRadius:4,objectFit:'cover',border:'1px solid #e2e8f0'}} />)}
          </div>
        </div>
      )}

      {Array.isArray(os.fotos_saida) && os.fotos_saida.length > 0 && (
        <div style={{border:'1px solid #e2e8f0',borderRadius:4,marginBottom:10}}>
          <div style={{background:'#f8fafc',padding:'6px 10px',fontWeight:700,fontSize:11,color:'#0f766e',borderBottom:'1px solid #e2e8f0'}}>FOTOS DE SAÍDA</div>
          <div style={{padding:8,display:'flex',flexWrap:'wrap',gap:6}}>
            {os.fotos_saida.map((u,i)=><img key={i} src={u} alt={`Foto ${i+1}`} style={{height:80,borderRadius:4,objectFit:'cover',border:'1px solid #e2e8f0'}} />)}
          </div>
        </div>
      )}

      <div style={{borderTop:'1px solid #e2e8f0',paddingTop:8,marginTop:8,fontSize:10,color:'#94a3b8',textAlign:'center'}}>
        ACN Sinal Verde — Documento gerado em {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
