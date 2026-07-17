// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';


const TIPOS_MANIFESTO = ['Recebimento','Envio','Transferencia'];
const TIPOS_MERCADORIA = ['Equipamento','Pecas','Materiais','Documentos','Outros'];

const FORM_VAZIO = {
  tipo: 'Recebimento', data: new Date().toISOString().split('T')[0],
  remetente: '', destinatario: '', tipo_mercadoria: 'Equipamento',
  descricao: '', quantidade: '', peso: '', nf_referencia: '', veiculo_placa: '', observacoes: '',
  pedido_compra_id: '',
};

export default function LogisticaTab({ currentUser }) {
  const [manifestos, setManifestos] = useState([]);
  const [pedidosCompra, setPedidosCompra] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [modalVer, setModalVer] = useState(null);
  const [modalDetalhes, setModalDetalhes] = useState(null);
  const fileRef = useRef(null);

  const carregarScript = (url) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = url;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const gerarPDF = async (m) => {
    try {
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch(e) { alert('Erro ao carregar biblioteca PDF. Verifique sua conexao com a internet.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

    // Cor do tipo
    const corTipoRGB = { Recebimento:[34,197,94], Envio:[59,130,246], Transferencia:[245,158,11] }[m.tipo] || [148,163,184];

    // Cabecalho principal
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFillColor(...corTipoRGB);
    doc.rect(0, 22, 210, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('ACN SINAL VERDE — CONTROLE LOGISTICO', 14, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 17);

    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`COMPROVANTE DE ${(m.tipo||'MOVIMENTACAO').toUpperCase()}`, 14, 27);
    doc.setTextColor(0, 0, 0);

    // Numero do registro (canto superior direito)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`ID: ${(m.id||'').toString().slice(0,8).toUpperCase()}`, 170, 10);
    doc.setTextColor(0, 0, 0);

    // Dados principais
    doc.autoTable({
      startY: 34,
      head: [['INFORMACOES DA MOVIMENTACAO', '', '', '']],
      body: [
        ['Tipo de Operacao', m.tipo || '—', 'Data', fmtDt(m.data)],
        ['Remetente', m.remetente || '—', 'Destinatario', m.destinatario || '—'],
        ['Tipo de Mercadoria', m.tipo_mercadoria || '—', 'Quantidade', m.quantidade ? `${m.quantidade} un.` : '—'],
        ['Descricao da Mercadoria', { content: m.descricao || '—', colSpan: 3 }, '', ''],
        ['NF de Referencia', m.nf_referencia || '—', 'Placa do Veiculo', m.veiculo_placa || '—'],
        ['Peso (kg)', m.peso ? `${m.peso} kg` : '—', 'Registrado por', m.criado_por_nome || m.criado_por || '—'],
        ['Observacoes', { content: m.observacoes || '—', colSpan: 3 }, '', ''],
      ],
      headStyles: { fillColor: [30,41,59], fontSize: 10, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
      },
      theme: 'grid',
      styles: { lineColor: [203,213,225], lineWidth: 0.3 },
    });

    let y = doc.lastAutoTable.finalY + 8;

    // Fotos
    const fotos = Array.isArray(m.fotos) ? m.fotos : [];
    if (fotos.length > 0) {
      if (y > 200) { doc.addPage(); y = 14; }
      doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('REGISTRO FOTOGRAFICO', 16, y + 5);
      doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
      y += 10;

      const IMG_W = 55; const IMG_H = 40; const GAP = 5;
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
          if (y + IMG_H > 272) { doc.addPage(); y = 14; col = 0; }
          doc.addImage(dataUrl, ext, x, y, IMG_W, IMG_H);
          col++;
          if (col >= 3) { col = 0; y += IMG_H + GAP; }
        } catch(e) {
          console.warn('Falha ao carregar foto:', e);
        }
      }
      if (col > 0) y += IMG_H + GAP;
      y += 4;
    }

    // Bloco de assinaturas
    if (y > 235) { doc.addPage(); y = 14; }

    doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ASSINATURAS', 16, y + 5);
    doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
    y += 10;

    // Caixa Remetente
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.5);
    doc.rect(14, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('REMETENTE / EXPEDIDOR', 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 16, y + 15);
    doc.line(26, y + 15, 96, y + 15);
    doc.text('Assinatura:', 16, y + 25);
    doc.line(34, y + 25, 96, y + 25);
    doc.text('Data: ____/____/________', 16, y + 34);
    doc.setTextColor(0,0,0);

    // Caixa Destinatario/Recebedor
    doc.rect(111, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('DESTINATARIO / RECEBEDOR', 113, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 113, y + 15);
    doc.line(123, y + 15, 193, y + 15);
    doc.text('Assinatura:', 113, y + 25);
    doc.line(131, y + 25, 193, y + 25);
    doc.text('Data: ____/____/________', 113, y + 34);
    doc.setTextColor(0,0,0);

    y += 46;

    // Rodape
    doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('Documento emitido pelo sistema ACN Sinal Verde. Guarde este comprovante.', 14, y + 4);

    const nomeArq = `Comprovante_${m.tipo||'Log'}_${(m.remetente||'').replace(/\s/g,'_').slice(0,15)}_${(m.data||'').toString().slice(0,10)}.pdf`;
    doc.save(nomeArq);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: mData }, { data: pcData }] = await Promise.all([
      supabase.from('logistica_manifestos').select('*').order('data', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material, data_prevista_recebimento').eq('status_compra', 'Comprado').order('data_prevista_recebimento', { ascending: true }),
    ]);
    setManifestos(mData || []);
    setPedidosCompra(pcData || []);
    setLoading(false);
  };

  const handleFotos = (e) => {
    const files = Array.from(e.target.files || []);
    setFotos(prev => [...prev, ...files].slice(0, 6));
  };

  const removerFoto = (i) => setFotos(prev => prev.filter((_,idx)=>idx!==i));

  const salvar = async () => {
    if (!form.descricao || !form.remetente) { alert('Preencha remetente e descricao!'); return; }
    setUploading(true);

    // Upload fotos
    const fotosUrls = [];
    for (const f of fotos) {
      const ext = f.name.split('.').pop();
      const path = `logistica/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { contentType: f.type, upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        fotosUrls.push(pub?.publicUrl || path);
      }
    }

    const payload = {
      ...form,
      fotos: fotosUrls,
      pedido_compra_id: form.pedido_compra_id || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    };
    const { error } = await supabase.from('logistica_manifestos').insert([payload]);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      // Se recebimento vinculado a pedido de compra, avança status para Concluído
      if (form.tipo === 'Recebimento' && form.pedido_compra_id) {
        await supabase.from('pcp_pedidos_compra')
          .update({ status_compra: 'Concluído', data_conclusao: new Date().toISOString().split('T')[0] })
          .eq('id', form.pedido_compra_id);
      }
      setForm(FORM_VAZIO); setFotos([]); setShowForm(false); fetchAll();
    }
    setUploading(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const corTipo = (t) => ({ Recebimento:'#22c55e', Envio:'#3b82f6', Transferencia:'#f59e0b' })[t] || '#94a3b8';

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Logistica — Controle de Envio e Recebimento de Mercadorias</span>
          {!showForm && (
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setForm(FORM_VAZIO);setFotos([]);setShowForm(true);}}>
              + Novo Registro
            </button>
          )}
        </div>

        {showForm && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                  {TIPOS_MANIFESTO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Data</label>
                <input type="date" className="acn-input" style={{width:'100%'}} value={form.data} onChange={e=>setForm({...form,data:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Remetente *</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Quem enviou" value={form.remetente} onChange={e=>setForm({...form,remetente:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Destinatario</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Quem recebe" value={form.destinatario} onChange={e=>setForm({...form,destinatario:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Mercadoria</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo_mercadoria} onChange={e=>setForm({...form,tipo_mercadoria:e.target.value})}>
                  {TIPOS_MERCADORIA.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{flex:2}}>
                <label className="acn-label">Descricao da Mercadoria *</label>
                <input className="acn-input" style={{width:'100%'}} value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Quantidade</label>
                <input type="number" className="acn-input" style={{width:'100%'}} value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Peso (kg)</label>
                <input type="number" step="0.1" className="acn-input" style={{width:'100%'}} value={form.peso} onChange={e=>setForm({...form,peso:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">NF Referencia</label>
                <input className="acn-input" style={{width:'100%'}} value={form.nf_referencia} onChange={e=>setForm({...form,nf_referencia:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Placa do Veiculo</label>
                <input className="acn-input" style={{width:'100%'}} value={form.veiculo_placa} onChange={e=>setForm({...form,veiculo_placa:e.target.value})} />
              </div>
              <div style={{flex:2}}>
                <label className="acn-label">Observacoes</label>
                <input className="acn-input" style={{width:'100%'}} value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} />
              </div>
            </div>

            {/* VINCULAR PEDIDO DE COMPRA — só para Recebimento */}
            {form.tipo === 'Recebimento' && pedidosCompra.length > 0 && (
              <div className="form-row" style={{marginTop:4}}>
                <div style={{flex:1}}>
                  <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.pedido_compra_id}
                    onChange={e => setForm({...form, pedido_compra_id: e.target.value})}>
                    <option value="">— Não vincular —</option>
                    {pedidosCompra.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                        {p.data_prevista_recebimento ? ` · Prev: ${new Date(p.data_prevista_recebimento + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* FOTOS */}
            <div style={{marginTop:8}}>
              <label className="acn-label">Fotos (max 6)</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4,alignItems:'center'}}>
                {fotos.map((f,i) => (
                  <div key={i} style={{position:'relative'}}>
                    <img src={URL.createObjectURL(f)} alt="foto" style={{width:64,height:64,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                    <button onClick={()=>removerFoto(i)} style={{position:'absolute',top:-4,right:-4,background:'#ef4444',color:'white',border:'none',borderRadius:'50%',width:16,height:16,fontSize:10,cursor:'pointer',padding:0,lineHeight:'16px'}}>x</button>
                  </div>
                ))}
                {fotos.length < 6 && (
                  <button className="acn-btn" style={{background:'#475569',height:44}} onClick={()=>fileRef.current?.click()}>
                    + Foto
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleFotos} />
              </div>
            </div>

            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px',opacity:uploading?0.6:1}} onClick={salvar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Registrar'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setShowForm(false);setFotos([]);}}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORICO */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Historico de Manifestos ({manifestos.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : manifestos.length === 0 ? (
            <div className="acn-empty">Nenhum manifesto registrado.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatario</th>
                <th>Mercadoria</th><th>Qtd</th><th>NF Ref.</th><th>Placa</th><th>Fotos</th><th>Obs.</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {manifestos.map(m => (
                  <tr key={m.id}>
                    <td>{fmtDt(m.data)}</td>
                    <td><span className="acn-badge" style={{background:corTipo(m.tipo)}}>{m.tipo}</span></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.tipo_mercadoria}: {m.descricao}</td>
                    <td>{m.quantidade || '—'}</td>
                    <td>{m.nf_referencia || '—'}</td>
                    <td>{m.veiculo_placa || '—'}</td>
                    <td>
                      {m.fotos && m.fotos.length > 0 ? (
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>setModalVer(m)}>
                          {m.fotos.length} foto(s)
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:10}}>{m.observacoes || '—'}</td>
                    <td style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      <button className="acn-btn" style={{background:'#0369a1',fontSize:10}} onClick={()=>setModalDetalhes(m)}>👁 Ver</button>
                      <button className="acn-btn" style={{background:'#1e293b',fontSize:10}} onClick={()=>gerarPDF(m)}>PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandaFooter setor="Logistica" />

      {/* MODAL DETALHES */}
      {modalDetalhes && (() => {
        const m = modalDetalhes;
        const cor = corTipo(m.tipo);
        const row = (label, val) => (
          <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:'6px 12px',padding:'6px 0',borderBottom:'1px solid #f1f5f9',alignItems:'start'}}>
            <span style={{fontSize:11,color:'#64748b',fontWeight:600}}>{label}</span>
            <span style={{fontSize:12,color:'#1e293b',wordBreak:'break-word'}}>{val || '—'}</span>
          </div>
        );
        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <span className="acn-badge" style={{background:cor,fontSize:13,padding:'3px 12px'}}>{m.tipo}</span>
                <span style={{fontWeight:700,fontSize:15,color:'#1e293b'}}>Detalhes do Manifesto</span>
                <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>ID: {(m.id||'').slice(0,8).toUpperCase()}</span>
              </div>

              {row('Data', fmtDt(m.data))}
              {row('Remetente', m.remetente)}
              {row('Destinatário', m.destinatario)}
              {row('Tipo de Mercadoria', m.tipo_mercadoria)}
              {row('Descrição', m.descricao)}
              {row('Quantidade', m.quantidade ? `${m.quantidade} un.` : null)}
              {row('Peso', m.peso ? `${m.peso} kg` : null)}
              {row('NF Referência', m.nf_referencia)}
              {row('Placa do Veículo', m.veiculo_placa)}
              {row('Observações', m.observacoes)}
              {row('Registrado por', m.criado_por_nome || m.criado_por)}
              {m.pedido_compra_id && row('Pedido de Compra', `#${m.pedido_compra_id.slice(0,8).toUpperCase()}`)}

              {m.fotos && m.fotos.length > 0 && (
                <div style={{marginTop:12}}>
                  <div style={{fontWeight:700,fontSize:11,color:'#475569',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Fotos ({m.fotos.length})</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {m.fotos.map((url,i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`foto ${i+1}`} style={{width:110,height:82,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{display:'flex',gap:8,marginTop:16}}>
                <button className="acn-btn" style={{background:'#1e293b',flex:1}} onClick={()=>{setModalDetalhes(null);gerarPDF(m);}}>📄 Gerar PDF</button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDetalhes(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL FOTOS */}
      {modalVer && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:600}}>
            <div className="modal-title">Fotos — {modalVer.tipo} {fmtDt(modalVer.data)}</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginBottom:12}}>
              {(modalVer.fotos||[]).map((url,i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`foto ${i+1}`} style={{width:130,height:100,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                </a>
              ))}
            </div>
            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalVer(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
