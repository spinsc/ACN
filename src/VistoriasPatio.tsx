// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { DemandaFooter } from './AcnTabShared';


const TIPOS_SERVICO = [
  'Mecanica','Eletrica','Funilaria/Pintura','Lavagem','Plotagem','Servico Externo (Terceiro)','Pecas para Pintura','Outros'
];
const FORM_VAZIO = {
  tipo_servico: 'Mecanica', veiculo_placa: '', veiculo_modelo: '', km_saida: '',
  numero_documento: '', tipo_documento: 'OPL', solicitante: '',
  destino: '', responsavel_envio: '', data_saida: new Date().toISOString().slice(0,16),
  previsao_retorno: '', observacoes: '',
};

function SignatureCanvas({ label, onSave, savedUrl }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  }, []);

  const getXY = (e) => {
    const r = ref.current.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing.current=true; const {x,y}=getXY(e); ref.current.getContext('2d').beginPath(); ref.current.getContext('2d').moveTo(x,y); };
  const move = (e) => { e.preventDefault(); if(!drawing.current)return; const{x,y}=getXY(e); const ctx=ref.current.getContext('2d'); ctx.lineTo(x,y); ctx.stroke(); setHas(true); };
  const end = () => { drawing.current=false; };
  const clear = () => { ref.current.getContext('2d').clearRect(0,0,ref.current.width,ref.current.height); setHas(false); };
  const save = () => { if(has) onSave(ref.current.toDataURL('image/png')); };

  if (savedUrl) {
    return (
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:10,color:'#64748b',marginBottom:4}}>{label}</div>
        <img src={savedUrl} alt="assinatura" style={{border:'1px solid #e2e8f0',borderRadius:4,maxWidth:300,height:80,objectFit:'contain',background:'white'}} />
      </div>
    );
  }

  return (
    <div style={{flex:1,minWidth:200}}>
      <div style={{fontSize:10,fontWeight:600,color:'#1e293b',marginBottom:4}}>{label}</div>
      <canvas ref={ref} width={280} height={90}
        style={{border:'2px dashed #94a3b8',borderRadius:4,cursor:'crosshair',background:'white',display:'block'}}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div style={{display:'flex',gap:4,marginTop:4}}>
        <button className="acn-btn" style={{background:'#94a3b8',fontSize:10}} onClick={clear}>Limpar</button>
        <button className="acn-btn" style={{background:'#22c55e',fontSize:10,opacity:has?1:0.5}} onClick={save} disabled={!has}>Salvar</button>
      </div>
    </div>
  );
}

export default function VistoriasPatio({ currentUser }) {
  const [vistorias, setVistorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [fotos, setFotos] = useState([]);
  const [sigEnvio, setSigEnvio] = useState(null);
  const [sigRecebimento, setSigRecebimento] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalVer, setModalVer] = useState(null);
  const [modalRetorno, setModalRetorno] = useState(null);
  const [retornoForm, setRetornoForm] = useState({ km_retorno:'', obs_retorno:'', responsavel_recebimento:'' });
  const [sigRet, setSigRet] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('vistorias_patio').select('*').order('data_saida',{ascending:false});
    setVistorias(data || []);
    setLoading(false);
  };

  const uploadFotos = async (files, prefix) => {
    const urls = [];
    for (const f of files) {
      const ext = f.name.split('.').pop();
      const path = `vistorias/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { contentType: f.type, upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        urls.push(pub?.publicUrl || path);
      }
    }
    return urls;
  };

  const uploadSig = async (dataUrl, name) => {
    if (!dataUrl) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `assinaturas/vistoria_${name}_${Date.now()}.png`;
      const { error } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert:true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        return pub?.publicUrl;
      }
    } catch(e) { console.warn(e); }
    return null;
  };

  const salvar = async () => {
    const respEnvio = form.responsavel_envio || currentUser?.nome || '';
    if (!form.veiculo_placa || !respEnvio) { alert('Preencha placa e responsavel!'); return; }
    setUploading(true);
    const fotosUrls = await uploadFotos(fotos, 'saida');
    const sigEnvioUrl = await uploadSig(sigEnvio, 'envio');
    const sigRecebUrl = await uploadSig(sigRecebimento, 'recebimento_inicial');

    const { error } = await supabase.from('vistorias_patio').insert([{
      ...form,
      responsavel_envio: respEnvio,
      fotos_saida: fotosUrls,
      assinatura_envio_url: sigEnvioUrl,
      assinatura_recebimento_url: sigRecebUrl,
      status: 'Saiu',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    if (error) { alert('Erro ao salvar: ' + error.message); setUploading(false); return; }
    setForm(FORM_VAZIO); setFotos([]); setSigEnvio(null); setSigRecebimento(null);
    setShowForm(false); fetchAll();
    setUploading(false);
  };

  const registrarRetorno = async () => {
    const v = modalRetorno;
    const sigRetUrl = await uploadSig(sigRet, 'retorno');
    await supabase.from('vistorias_patio').update({
      status: 'Retornou',
      km_retorno: retornoForm.km_retorno,
      obs_retorno: retornoForm.obs_retorno,
      responsavel_recebimento: retornoForm.responsavel_recebimento,
      data_retorno: new Date().toISOString(),
      assinatura_retorno_url: sigRetUrl,
    }).eq('id', v.id);
    setModalRetorno(null); setSigRet(null); setRetornoForm({km_retorno:'',obs_retorno:'',responsavel_recebimento:''}); fetchAll();
  };

  const carregarScript = (url) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = url;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const gerarPDF = async (v) => {
    try {
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch(e) { alert('Erro ao carregar biblioteca PDF. Verifique sua conexao.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fmtD = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
    const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

    // Cabecalho
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('VISTORIA DE PATIO — ACN SINAL VERDE', 14, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 27);
    doc.setTextColor(0, 0, 0);

    // Dados principais
    doc.autoTable({
      startY: 32,
      head: [['DADOS DO VEICULO / SERVICO', '', '', '']],
      body: [
        ['Tipo de Servico', v.tipo_servico||'—', 'Placa', v.veiculo_placa||'—'],
        ['Modelo/Descricao', v.veiculo_modelo||'—', 'KM Saida', v.km_saida||'—'],
        [v.tipo_documento||'Documento', v.numero_documento||'—', 'Solicitante', v.solicitante||'—'],
        ['Destino / Oficina', v.destino||'—', 'Data/Hora Saida', fmtD(v.data_saida)],
        ['Resp. Envio', v.responsavel_envio||'—', 'Prev. Retorno', fmtData(v.previsao_retorno)],
        ['Observacoes', { content: v.observacoes||'—', colSpan: 3 }, '', ''],
      ],
      headStyles: { fillColor: [30,41,59], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle:'bold', cellWidth:38 }, 2: { fontStyle:'bold', cellWidth:38 } },
      theme: 'grid',
    });

    // Retorno (se houver)
    if (v.status === 'Retornou') {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 4,
        head: [['RETORNO', '', '', '']],
        body: [
          ['Data Retorno', fmtD(v.data_retorno), 'KM Retorno', v.km_retorno||'—'],
          ['Resp. Recebimento', { content: v.responsavel_recebimento||'—', colSpan: 3 }, '', ''],
          ['Obs. Retorno', { content: v.obs_retorno||'—', colSpan: 3 }, '', ''],
        ],
        headStyles: { fillColor: [34,197,94], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle:'bold', cellWidth:38 }, 2: { fontStyle:'bold', cellWidth:38 } },
        theme: 'grid',
      });
    }

    // Assinaturas como imagem (se existirem)
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ASSINATURAS', 14, y); y += 4;
    doc.setFont('helvetica', 'normal');

    const addSig = async (url, label, x, yPos) => {
      doc.setFontSize(8); doc.text(label, x, yPos);
      if (url) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload=e=>r(e.target.result); fr.readAsDataURL(blob); });
          doc.addImage(dataUrl, 'PNG', x, yPos+2, 80, 22);
        } catch { doc.text('(imagem indisponivel)', x, yPos+8); }
      } else {
        doc.setDrawColor(150); doc.rect(x, yPos+2, 80, 22);
        doc.setFontSize(7); doc.text('Sem assinatura', x+2, yPos+13);
      }
    };

    await addSig(v.assinatura_envio_url, 'Responsavel pelo Envio:', 14, y);
    await addSig(v.assinatura_recebimento_url, 'Responsavel pelo Recebimento:', 105, y);
    y += 28;
    if (v.assinatura_retorno_url) {
      await addSig(v.assinatura_retorno_url, 'Assinatura de Retorno:', 14, y);
      y += 28;
    }

    // Fotos de saida
    const fotos = Array.isArray(v.fotos_saida) ? v.fotos_saida : [];
    if (fotos.length > 0) {
      // Verifica espaco restante na pagina (A4 = 297mm)
      if (y > 230) { doc.addPage(); y = 14; }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(255,255,255); doc.text('FOTOS DE SAIDA', 16, y+5);
      doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
      y += 10;

      const IMG_W = 58; const IMG_H = 42; const GAP = 4;
      let col = 0;
      for (const url of fotos) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = blob.type.includes('png') ? 'PNG' : 'JPEG';
          const dataUrl = await new Promise(r => {
            const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(blob);
          });
          const x = 14 + col * (IMG_W + GAP);
          if (y + IMG_H > 280) { doc.addPage(); y = 14; col = 0; }
          doc.addImage(dataUrl, ext, x, y, IMG_W, IMG_H);
          col++;
          if (col >= 3) { col = 0; y += IMG_H + GAP; }
        } catch { /* foto indisponivel, pula */ }
      }
      if (col > 0) y += IMG_H + GAP;
    }

    doc.save(`Vistoria_${v.veiculo_placa||'patio'}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const corStatus = (s) => ({ 'Saiu':'#f59e0b', 'Retornou':'#22c55e' })[s] || '#94a3b8';
  const pendentes = vistorias.filter(v => v.status !== 'Retornou');
  const concluidas = vistorias.filter(v => v.status === 'Retornou');

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Vistoria de Patio — Envio/Retorno de Veiculos e Servicos</span>
          {!showForm && (
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setForm(FORM_VAZIO);setFotos([]);setSigEnvio(null);setSigRecebimento(null);setShowForm(true);}}>
              + Novo Envio
            </button>
          )}
        </div>

        {showForm && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Servico</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo_servico} onChange={e=>setForm({...form,tipo_servico:e.target.value})}>
                  {TIPOS_SERVICO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Placa *</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="ABC-1234" value={form.veiculo_placa} onChange={e=>setForm({...form,veiculo_placa:e.target.value.toUpperCase()})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Modelo/Descricao</label>
                <input className="acn-input" style={{width:'100%'}} value={form.veiculo_modelo} onChange={e=>setForm({...form,veiculo_modelo:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">KM Saida</label>
                <input type="number" className="acn-input" style={{width:'100%'}} value={form.km_saida} onChange={e=>setForm({...form,km_saida:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Documento</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo_documento} onChange={e=>setForm({...form,tipo_documento:e.target.value})}>
                  <option>OPL</option>
                  <option>OPD</option>
                  <option>PV</option>
                  <option>Sem Documento</option>
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Nº OPL / OPD / PV</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Ex: 1230" value={form.numero_documento} onChange={e=>setForm({...form,numero_documento:e.target.value.toUpperCase()})} />
              </div>
              <div className="form-group" style={{flex:2}}>
                <label className="acn-label">Solicitante do Envio</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Nome do solicitante..." value={form.solicitante} onChange={e=>setForm({...form,solicitante:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{flex:2}}>
                <label className="acn-label">Destino / Oficina</label>
                <input className="acn-input" style={{width:'100%'}} value={form.destino} onChange={e=>setForm({...form,destino:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Responsavel pelo Envio *</label>
                <input className="acn-input" style={{width:'100%'}} value={form.responsavel_envio||currentUser?.nome} onChange={e=>setForm({...form,responsavel_envio:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Data/Hora Saida</label>
                <input type="datetime-local" className="acn-input" style={{width:'100%'}} value={form.data_saida} onChange={e=>setForm({...form,data_saida:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Previsao de Retorno</label>
                <input type="date" className="acn-input" style={{width:'100%'}} value={form.previsao_retorno} onChange={e=>setForm({...form,previsao_retorno:e.target.value})} />
              </div>
            </div>
            <div style={{marginBottom:8}}>
              <label className="acn-label">Observacoes</label>
              <input className="acn-input" style={{width:'100%'}} value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} />
            </div>

            {/* FOTOS */}
            <div style={{marginBottom:10}}>
              <label className="acn-label">Fotos de Saida (max 6)</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4,alignItems:'center'}}>
                {fotos.map((f,i) => (
                  <div key={i} style={{position:'relative'}}>
                    <img src={URL.createObjectURL(f)} alt="foto" style={{width:64,height:64,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                    <button onClick={()=>setFotos(p=>p.filter((_,j)=>j!==i))} style={{position:'absolute',top:-4,right:-4,background:'#ef4444',color:'white',border:'none',borderRadius:'50%',width:16,height:16,fontSize:10,cursor:'pointer',padding:0,lineHeight:'16px'}}>x</button>
                  </div>
                ))}
                {fotos.length < 6 && (
                  <button className="acn-btn" style={{background:'#475569',height:44}} onClick={()=>fileRef.current?.click()}>+ Foto</button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>setFotos(p=>[...p,...Array.from(e.target.files||[])].slice(0,6))} />
              </div>
            </div>

            {/* ASSINATURAS */}
            <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:12}}>
              <SignatureCanvas label="Assinatura — Responsavel pelo Envio" onSave={setSigEnvio} savedUrl={sigEnvio} />
              <SignatureCanvas label="Assinatura — Responsavel pelo Recebimento (Destino)" onSave={setSigRecebimento} savedUrl={sigRecebimento} />
            </div>

            <div style={{display:'flex',gap:6}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px',opacity:uploading?0.6:1}} onClick={salvar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Registrar Saida'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setShowForm(false);setFotos([]);}}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* PENDENTES */}
      {pendentes.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}>
            <span style={{color:'#92400e'}}>Veiculos/Servicos em Campo ({pendentes.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>Tipo Servico</th><th>Documento</th><th>Solicitante</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Saida</th>
                <th>Prev. Retorno</th><th>Status</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {pendentes.map(v => (
                  <tr key={v.id}>
                    <td>{v.tipo_servico}</td>
                    <td>{v.tipo_documento}: <strong>{v.numero_documento||'—'}</strong></td>
                    <td>{v.solicitante||'—'}</td>
                    <td><strong>{v.veiculo_placa}</strong></td>
                    <td>{v.veiculo_modelo||'—'}</td>
                    <td>{v.destino||'—'}</td>
                    <td>{fmtDt(v.data_saida)}</td>
                    <td style={{color: v.previsao_retorno && new Date(v.previsao_retorno)<new Date() ? '#ef4444' : undefined}}>
                      {v.previsao_retorno ? new Date(v.previsao_retorno).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td><span className="acn-badge" style={{background:corStatus(v.status)}}>{v.status}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#2563eb',fontSize:10}} onClick={()=>setModalVer(v)}>VER</button>
                        <button className="acn-btn" style={{background:'#22c55e',fontSize:10}} onClick={()=>{setModalRetorno(v);setRetornoForm({km_retorno:'',obs_retorno:'',responsavel_recebimento:currentUser?.nome||''});setSigRet(null);}}>RETORNO</button>
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>gerarPDF(v)}>PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORICO */}
      {concluidas.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0fdf4',borderBottom:'2px solid #22c55e'}}>
            <span style={{color:'#166534'}}>Historico — Retornados ({concluidas.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>Tipo Servico</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Saida</th><th>Retorno</th><th>Resp. Retorno</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {concluidas.slice(0,30).map(v => (
                  <tr key={v.id} style={{opacity:0.8}}>
                    <td>{v.tipo_servico}</td>
                    <td><strong>{v.veiculo_placa}</strong></td>
                    <td>{v.veiculo_modelo||'—'}</td>
                    <td>{v.destino||'—'}</td>
                    <td>{fmtDt(v.data_saida)}</td>
                    <td>{fmtDt(v.data_retorno)}</td>
                    <td>{v.responsavel_recebimento||'—'}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>setModalVer(v)}>VER</button>
                        <button className="acn-btn" style={{background:'#2563eb',fontSize:10}} onClick={()=>gerarPDF(v)}>PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DemandaFooter setor="Vistorias de Patio" />

      {/* MODAL VER */}
      {modalVer && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:560,width:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-title">Vistoria — {modalVer.veiculo_placa}</div>
            <table style={{fontSize:11,marginBottom:10}}>
              <tbody>
                {[
                  ['Tipo de Servico', modalVer.tipo_servico],
                  ['Placa', modalVer.veiculo_placa],
                  ['Modelo', modalVer.veiculo_modelo||'—'],
                  ['KM Saida', modalVer.km_saida||'—'],
                  [modalVer.tipo_documento||'Documento', modalVer.numero_documento||'—'],
                  ['Solicitante', modalVer.solicitante||'—'],
                  ['Destino', modalVer.destino||'—'],
                  ['Resp. Envio', modalVer.responsavel_envio||'—'],
                  ['Data Saida', fmtDt(modalVer.data_saida)],
                  ['Prev. Retorno', modalVer.previsao_retorno ? new Date(modalVer.previsao_retorno).toLocaleDateString('pt-BR') : '—'],
                  ['Status', modalVer.status],
                  ...(modalVer.status==='Retornou' ? [
                    ['Data Retorno', fmtDt(modalVer.data_retorno)],
                    ['KM Retorno', modalVer.km_retorno||'—'],
                    ['Resp. Recebimento', modalVer.responsavel_recebimento||'—'],
                    ['Obs. Retorno', modalVer.obs_retorno||'—'],
                  ] : []),
                  ['Observacoes', modalVer.observacoes||'—'],
                ].map(([k,v],i) => (
                  <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{fontWeight:600,color:'#64748b',padding:'4px 8px',whiteSpace:'nowrap'}}>{k}</td>
                    <td style={{padding:'4px 8px'}}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Fotos */}
            {Array.isArray(modalVer.fotos_saida) && modalVer.fotos_saida.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:600,marginBottom:6}}>Fotos de Saida:</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {modalVer.fotos_saida.map((url,i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="foto" style={{width:80,height:60,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {/* Assinaturas */}
            <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:10}}>
              {modalVer.assinatura_envio_url && (
                <div>
                  <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>Assinatura Envio:</div>
                  <img src={modalVer.assinatura_envio_url} alt="sig envio" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
                </div>
              )}
              {modalVer.assinatura_recebimento_url && (
                <div>
                  <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>Assinatura Recebimento:</div>
                  <img src={modalVer.assinatura_recebimento_url} alt="sig receb" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
                </div>
              )}
              {modalVer.assinatura_retorno_url && (
                <div>
                  <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>Assinatura Retorno:</div>
                  <img src={modalVer.assinatura_retorno_url} alt="sig retorno" style={{height:60,border:'1px solid #e2e8f0',borderRadius:4,background:'white'}} />
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#2563eb',flex:1}} onClick={()=>gerarPDF(modalVer)}>Gerar PDF</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalVer(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RETORNO */}
      {modalRetorno && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:480}}>
            <div className="modal-title">Registrar Retorno — {modalRetorno.veiculo_placa}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:10,background:'#f8fafc',padding:'8px',borderRadius:4}}>
              Saiu: {fmtDt(modalRetorno.data_saida)} | Destino: {modalRetorno.destino||'—'}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">KM Retorno</label>
                <input type="number" className="acn-input" style={{width:'100%'}} value={retornoForm.km_retorno}
                  onChange={e=>setRetornoForm({...retornoForm,km_retorno:e.target.value})} />
              </div>
              <div className="form-group" style={{flex:2}}>
                <label className="acn-label">Responsavel pelo Recebimento *</label>
                <input className="acn-input" style={{width:'100%'}} value={retornoForm.responsavel_recebimento}
                  onChange={e=>setRetornoForm({...retornoForm,responsavel_recebimento:e.target.value})} />
              </div>
            </div>
            <label className="acn-label">Observacoes de Retorno</label>
            <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical',marginBottom:10}}
              value={retornoForm.obs_retorno} onChange={e=>setRetornoForm({...retornoForm,obs_retorno:e.target.value})} />
            <div style={{marginBottom:12}}>
              <SignatureCanvas label="Assinatura de Retorno" onSave={setSigRet} savedUrl={sigRet} />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'9px'}} onClick={registrarRetorno}>
                CONFIRMAR RETORNO
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalRetorno(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
