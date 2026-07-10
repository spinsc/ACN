// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';

function imprimirSolicitacao(p: any) {
  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const html = `
    <html><head><title>Solicitação de Compra</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 30px; color: #000; }
      h2 { color: #1a3a52; border-bottom: 2px solid #1a3a52; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #1a3a52; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
      .badge { display:inline-block; padding:2px 8px; border-radius:4px; color:#fff; font-weight:bold; background:#16a34a; }
      .footer { margin-top:30px; font-size:10px; color:#6b7280; }
      @media print { button { display:none; } }
    </style></head>
    <body>
      <h2>🛒 Solicitação de Compra</h2>
      <table>
        <tr><th>Campo</th><th>Informação</th></tr>
        <tr><td><b>Nº Pedido</b></td><td>${p.numero_pedido || '—'}</td></tr>
        <tr><td><b>OP Referência</b></td><td>${p.opl || '—'}</td></tr>
        <tr><td><b>Descrição</b></td><td>${p.descricao_material || '—'}</td></tr>
        <tr><td><b>Quantidade</b></td><td>${p.quantidade || '—'}</td></tr>
        <tr><td><b>Fornecedor</b></td><td>${p.fornecedor || '—'}</td></tr>
        <tr><td><b>Valor Total da Compra</b></td><td>${fmt(p.valor_compra)}</td></tr>
        <tr><td><b>Previsão de Recebimento</b></td><td>${fmtDt(p.prazo_entrega)}</td></tr>
        <tr><td><b>Status</b></td><td><span class="badge">${p.status_solicitacao || '—'}</span></td></tr>
        <tr><td><b>Data da Solicitação</b></td><td>${p.data_prevista ? new Date(p.data_prevista).toLocaleDateString('pt-BR') : '—'}</td></tr>
        ${p.observacoes ? `<tr><td><b>Observações</b></td><td style="white-space:pre-wrap">${p.observacoes}</td></tr>` : ''}
      </table>
      <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>window.print();</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

export default function ComprasTab({ currentUser }) {
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filtro, setFiltro]     = useState('');
  const [modalObs, setModalObs] = useState<any>(null);
  const [obsTexto, setObsTexto] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);

  // Valores inline por pedido: { [id]: { valor, prazo, salvando } }
  const [inline, setInline] = useState<Record<string,{valor:string,prazo:string,salvando:boolean}>>({});

  const canVerValor = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';

  const fmtData = (d: string) => {
    if (!d) return <span style={{color:'#9ca3af'}}>—</span>;
    const dt = new Date(d + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.ceil((dt.getTime()-hoje.getTime())/86400000);
    const str = dt.toLocaleDateString('pt-BR');
    if (diff < 0)   return <span style={{color:'#dc2626',fontWeight:700}}>{str} ⚠️</span>;
    if (diff === 0) return <span style={{color:'#f59e0b',fontWeight:700}}>Hoje!</span>;
    if (diff <= 3)  return <span style={{color:'#f59e0b'}}>{str}</span>;
    return str;
  };

  const COR: Record<string,string> = {
    'Pendente':'#fbbf24','Em Andamento':'#3b82f6','Comprado':'#7c3aed','Concluído':'#22c55e',
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [filtro]);

  const [queryError, setQueryError] = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    setQueryError(null);
    let q = supabase.from('pcp_pedidos_compra').select('*').order('created_at', {ascending:false});
    if (filtro) q = q.eq('status_solicitacao', filtro);
    const { data, error } = await q;
    if (error) { setQueryError(error.message); setLoading(false); setPedidos([]); return; }
    setPedidos(data || []);
    // inicializa inline com valores existentes
    const init: any = {};
    (data||[]).forEach((p:any) => {
      init[p.id] = {
        valor:    p.valor_compra  ? String(p.valor_compra)  : '',
        prazo:    p.prazo_entrega || '',
        salvando: false,
      };
    });
    setInline(init);
    setLoading(false);
  };

  const setInlineField = (id: string, field: string, val: string) =>
    setInline(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const avancarStatus = async (p: any) => {
    const prox: Record<string,string> = {
      'Pendente':'Em Andamento', 'Comprado':'Concluído',
    };
    const novoStatus = prox[p.status_solicitacao];
    if (!novoStatus) return;
    const updates: any = { status_solicitacao: novoStatus };
    if (novoStatus === 'Concluído') updates.data_conclusao = new Date().toISOString();
    const { error } = await supabase.from('pcp_pedidos_compra').update(updates).eq('id', p.id);
    if (error) alert('Erro: ' + error.message);
    else { setFiltro(''); load(); }
  };

  const confirmarCompra = async (p: any) => {
    const row = inline[p.id];
    if (!row?.valor) { alert('Informe o valor total da compra.'); return; }
    if (!row?.prazo)  { alert('Informe a previsão de recebimento.'); return; }
    setInline(prev => ({...prev, [p.id]: {...prev[p.id], salvando:true}}));
    const { error } = await supabase.from('pcp_pedidos_compra').update({
      status_solicitacao: 'Comprado',
      valor_compra:       parseFloat(row.valor.replace(',','.')),
      prazo_entrega:      row.prazo,
    }).eq('id', p.id);
    if (error) { alert('Erro: ' + error.message); setInline(prev => ({...prev, [p.id]:{...prev[p.id],salvando:false}})); return; }
    setFiltro('');
    load();
  };

  const salvarObs = async () => {
    if (!obsTexto.trim() || !modalObs) return;
    setSalvandoObs(true);
    const agora = new Date().toLocaleString('pt-BR');
    const linha = `[${agora} — ${currentUser?.nome||'Sistema'}]: ${obsTexto.trim()}`;
    const atual = modalObs.observacoes || '';
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ observacoes: atual ? `${atual}\n${linha}` : linha }).eq('id', modalObs.id);
    if (!error) { setModalObs(null); setObsTexto(''); load(); }
    else alert('Erro: ' + error.message);
    setSalvandoObs(false);
  };

  const total = pedidos.length;
  const kpis = ['Pendente','Em Andamento','Comprado','Concluído'].map(s => ({
    label: s, n: pedidos.filter(p=>p.status_solicitacao===s).length, cor: COR[s],
  }));

  return (
    <div style={{background:'#fff',borderRadius:8,padding:20,marginTop:16,boxShadow:'0 1px 3px #0001'}}>

      {/* CABEÇALHO */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,color:'#1a3a52',margin:0}}>🛒 Requisições de Compra — OP Vinculada</h2>
        <select value={filtro} onChange={e=>setFiltro(e.target.value)}
          style={{padding:'5px 10px',border:'1px solid #d1d5db',borderRadius:6,fontSize:11}}>
          <option value="">Todos os status</option>
          {['Pendente','Em Andamento','Comprado','Concluído'].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {queryError && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'10px 14px',marginBottom:12,fontSize:11,color:'#dc2626'}}>
          ⚠️ Erro ao carregar dados: <strong>{queryError}</strong>
        </div>
      )}

      {loading ? <div style={{textAlign:'center',padding:30,color:'#9ca3af'}}>Carregando...</div>
        : pedidos.length===0 ? <div style={{textAlign:'center',padding:30,color:'#9ca3af',fontSize:12}}>Nenhuma requisição encontrada. {queryError ? '' : '(tabela vazia ou sem permissão)'}</div>
        : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                <th style={th}>Nº Pedido</th>
                <th style={th}>OP</th>
                <th style={th}>Descrição</th>
                <th style={th}>Qtd</th>
                <th style={th}>Fornecedor</th>
                {canVerValor && <th style={th}>💰 Valor da Compra</th>}
                <th style={th}>📅 Prev. Recebimento</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p:any) => {
                const row   = inline[p.id] || {valor:'',prazo:'',salvando:false};
                const isEM  = p.status_solicitacao === 'Em Andamento';
                return (
                  <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9', background: isEM ? '#f0fdf4' : undefined}}>
                    <td style={td}><strong>{p.numero_pedido}</strong></td>
                    <td style={td}>{p.opl||'—'}</td>
                    <td style={{...td,maxWidth:150}}>
                      <span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {p.descricao_material}
                      </span>
                    </td>
                    <td style={td}>{p.quantidade}</td>
                    <td style={td}>{p.fornecedor||'—'}</td>

                    {/* VALOR — editável direto para itens Em Andamento */}
                    {canVerValor && (
                      <td style={td}>
                        {isEM ? (
                          <input type="number" step="0.01" min="0"
                            value={row.valor}
                            onChange={e => setInlineField(p.id,'valor',e.target.value)}
                            placeholder="R$ 0,00"
                            style={{width:110,padding:'5px 7px',border:'2px solid #16a34a',borderRadius:5,fontSize:12,outline:'none'}}
                          />
                        ) : (
                          p.valor_compra
                            ? <strong style={{color:'#16a34a'}}>{fmt(p.valor_compra)}</strong>
                            : <span style={{color:'#9ca3af'}}>—</span>
                        )}
                      </td>
                    )}

                    {/* PRAZO — editável direto para itens Em Andamento */}
                    <td style={td}>
                      {isEM ? (
                        <input type="date"
                          value={row.prazo}
                          onChange={e => setInlineField(p.id,'prazo',e.target.value)}
                          style={{width:130,padding:'5px 7px',border:'2px solid #16a34a',borderRadius:5,fontSize:12,outline:'none'}}
                        />
                      ) : (
                        fmtData(p.prazo_entrega)
                      )}
                    </td>

                    <td style={td}>
                      <span style={{padding:'3px 9px',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,
                        background:COR[p.status_solicitacao]||'#9ca3af'}}>
                        {p.status_solicitacao}
                      </span>
                    </td>

                    <td style={{...td,whiteSpace:'nowrap'}}>
                      {/* ▶️ Pendente → Em Andamento */}
                      {p.status_solicitacao==='Pendente' && (
                        <button onClick={()=>avancarStatus(p)} style={{...btn,background:'#3b82f6',marginRight:3}}>▶️ Iniciar</button>
                      )}

                      {/* ✅ Em Andamento → Comprado (salva valor + prazo) */}
                      {isEM && (
                        <button onClick={()=>confirmarCompra(p)} disabled={row.salvando}
                          style={{...btn,background:'#16a34a',marginRight:3}}>
                          {row.salvando ? '...' : '✅ Concluir'}
                        </button>
                      )}

                      {/* 📦 Comprado → Concluído */}
                      {p.status_solicitacao==='Comprado' && (
                        <button onClick={()=>avancarStatus(p)} style={{...btn,background:'#0891b2',marginRight:3}}>📦 Recebido</button>
                      )}

                      {/* 💬 Observações */}
                      <button onClick={()=>{setModalObs(p);setObsTexto('');}}
                        style={{...btn,background:p.observacoes?'#0891b2':'#64748b',marginRight:3}}>
                        💬
                      </button>

                      {/* 🖨️ Imprimir */}
                      <button onClick={()=>imprimirSolicitacao(p)}
                        style={{...btn,background:'#475569'}}>🖨️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* KPIs */}
      <div style={{marginTop:16,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10}}>
        <div style={{...kpi,borderColor:'#1e293b'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#1e293b'}}>{total}</div>
          <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>Total</div>
        </div>
        {kpis.map(k=>(
          <div key={k.label} style={{...kpi,borderColor:k.cor}}>
            <div style={{fontSize:20,fontWeight:700,color:k.cor}}>{k.n}</div>
            <div style={{fontSize:9,color:'#6b7280',marginTop:2}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* MODAL OBSERVAÇÕES */}
      {modalObs && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setModalObs(null);setObsTexto('');}}}>
          <div className="modal-box" style={{maxWidth:500}}>
            <div className="modal-title">💬 Observações — {modalObs.numero_pedido}</div>
            <div style={{fontSize:10,color:'#6b7280',marginBottom:10}}>{modalObs.descricao_material}</div>
            {modalObs.observacoes ? (
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:10,
                marginBottom:12,fontSize:10,whiteSpace:'pre-wrap',maxHeight:180,overflowY:'auto',lineHeight:1.8}}>
                {modalObs.observacoes}
              </div>
            ) : (
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:12,fontStyle:'italic'}}>Sem observações anteriores.</div>
            )}
            <label className="acn-label">Nova observação</label>
            <textarea className="acn-input" rows={4} value={obsTexto}
              onChange={e=>setObsTexto(e.target.value)}
              placeholder="Ex: Fornecedor adiou entrega. Aguardando nova data..."
              style={{width:'100%',resize:'vertical',marginBottom:12}} />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setModalObs(null);setObsTexto('');}}>Cancelar</button>
              <button className="acn-btn" style={{background:'#0891b2'}} onClick={salvarObs} disabled={salvandoObs}>
                {salvandoObs?'...':'💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {padding:'8px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'};
const td: React.CSSProperties = {padding:'9px 10px',verticalAlign:'middle'};
const btn: React.CSSProperties = {padding:'5px 9px',border:'none',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'};
const kpi: React.CSSProperties = {background:'#f8fafc',border:'2px solid #e2e8f0',borderRadius:8,padding:'10px 6px',textAlign:'center' as const};
