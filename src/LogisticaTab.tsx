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
  seriais: '', volume: '', nf_conferida: false,
};

// ─── Relatório de Movimentação (IN/OUT) por Período e Tipo ───────────────────
function RelatorioLogistica() {
  const [de, setDe]     = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; });
  const [ate, setAte]   = useState(() => new Date().toISOString().split('T')[0]);
  const [tipo, setTipo] = useState('Todos');
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setCarregando(true);
    let q = supabase.from('logistica_manifestos').select('*')
      .gte('data', de).lte('data', ate).order('data', { ascending: false });
    if (tipo !== 'Todos') q = q.eq('tipo', tipo);
    const { data } = await q;
    setDados(data || []);
    setCarregando(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const corTipo = (t) => ({ Recebimento:'#22c55e', Envio:'#3b82f6', Transferencia:'#f59e0b' })[t] || '#94a3b8';

  const recebimentos   = dados.filter(m => m.tipo === 'Recebimento');
  const envios         = dados.filter(m => m.tipo === 'Envio');
  const transferencias = dados.filter(m => m.tipo === 'Transferencia');
  const somaQtd  = (lista) => lista.reduce((a,m)=>a+(Number(m.quantidade)||0),0);
  const somaPeso = (lista) => lista.reduce((a,m)=>a+(Number(m.peso)||0),0);
  const saldoQtd = somaQtd(recebimentos) - somaQtd(envios);

  // Agrupado por tipo de mercadoria
  const porMercadoria = dados.reduce((acc,m) => {
    const k = m.tipo_mercadoria || 'Outros';
    if (!acc[k]) acc[k] = { in:0, out:0, transf:0, qtdIn:0, qtdOut:0 };
    if (m.tipo === 'Recebimento')       { acc[k].in++;    acc[k].qtdIn  += Number(m.quantidade)||0; }
    else if (m.tipo === 'Envio')        { acc[k].out++;   acc[k].qtdOut += Number(m.quantidade)||0; }
    else if (m.tipo === 'Transferencia') acc[k].transf++;
    return acc;
  }, {});

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Filtros do Relatório</span></div>
        <div className="sec-body">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={de} onChange={e=>setDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={ate} onChange={e=>setAte(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Tipo</label>
              <select className="acn-input" style={{width:'100%'}} value={tipo} onChange={e=>setTipo(e.target.value)}>
                <option value="Todos">Todos</option>
                {TIPOS_MANIFESTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Totais do Período</span></div>
        <div className="sec-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[
              {label:'Recebimentos (IN)',    val:recebimentos.length,   sub:`${somaQtd(recebimentos)} un. · ${somaPeso(recebimentos).toFixed(1)} kg`, cor:'#22c55e'},
              {label:'Envios (OUT)',         val:envios.length,         sub:`${somaQtd(envios)} un. · ${somaPeso(envios).toFixed(1)} kg`,             cor:'#3b82f6'},
              {label:'Transferências',       val:transferencias.length, sub:`${somaQtd(transferencias)} un.`,                                          cor:'#f59e0b'},
              {label:'Saldo (IN − OUT)',     val:`${saldoQtd>=0?'+':''}${saldoQtd}`, sub:'unidades',                                                    cor:saldoQtd>=0?'#16a34a':'#dc2626'},
              {label:'Total de Movimentos',  val:dados.length,          sub:`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`, cor:'#1e293b'},
            ].map(c => (
              <div key={c.label} style={{flex:'1 1 160px',minWidth:140,background:'white',border:'1px solid #e2e8f0',borderTop:`3px solid ${c.cor}`,borderRadius:4,padding:'8px 10px'}}>
                <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>{c.label}</div>
                <div style={{fontSize:20,fontWeight:700,color:c.cor}}>{carregando?'...':c.val}</div>
                <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por Tipo de Mercadoria</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> : Object.keys(porMercadoria).length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table>
              <thead><tr><th>Mercadoria</th><th>Recebimentos</th><th>Qtd. Recebida</th><th>Envios</th><th>Qtd. Enviada</th><th>Transferências</th></tr></thead>
              <tbody>
                {Object.entries(porMercadoria).map(([k,v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td style={{color:'#22c55e',fontWeight:700}}>{v.in}</td>
                    <td>{v.qtdIn} un.</td>
                    <td style={{color:'#3b82f6',fontWeight:700}}>{v.out}</td>
                    <td>{v.qtdOut} un.</td>
                    <td style={{color:'#f59e0b',fontWeight:700}}>{v.transf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Movimentos do Período ({dados.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> : dados.length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table>
              <thead><tr><th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatário</th><th>Mercadoria</th><th>Qtd</th></tr></thead>
              <tbody>
                {dados.map(m => (
                  <tr key={m.id}>
                    <td>{fmtDt(m.data)}</td>
                    <td><span className="acn-badge" style={{background:corTipo(m.tipo)}}>{m.tipo}</span></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td>{m.tipo_mercadoria}: {m.descricao}</td>
                    <td>{m.quantidade || '—'}</td>
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

// ─── Fretes (Fase 4) — cotação de transportadoras + linha do tempo até Entregue ──
const VAZIO_FRETE = { direcao: 'inbound', descricao: '', origem: '', destino: '', data_prevista: '', pedido_compra_id: '' };
const VAZIO_COTACAO_FRETE = { transportadora_nome: '', valor: '', condicao_pagamento: '', prazo_entrega: '' };

async function uploadArquivoFrete(file: File, pasta: string): Promise<{ url: string; nome: string; error?: string }> {
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${pasta}/${Date.now()}_${nomeLimpo}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return { url: '', nome: '', error: error?.message || 'Falha desconhecida ao enviar.' };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  if (!pub?.publicUrl) return { url: '', nome: '', error: 'Não foi possível gerar o link público do arquivo.' };
  return { url: pub.publicUrl, nome: file.name };
}

const btn: React.CSSProperties = {padding:'5px 9px',border:'none',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'};

const COR_FRETE: Record<string,string> = {
  'Cotação':'#94a3b8', 'Em Trânsito':'#3b82f6', 'Entregue':'#22c55e', 'Cancelado':'#ef4444',
};

function FretesPanel({ currentUser }: any) {
  const [fretes, setFretes] = useState<any[]>([]);
  const [pedidosCompra, setPedidosCompra] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...VAZIO_FRETE });
  const [salvandoFrete, setSalvandoFrete] = useState(false);

  const [modalFrete, setModalFrete] = useState<any>(null);
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({ ...VAZIO_COTACAO_FRETE });
  const [novoAnexoCotacao, setNovoAnexoCotacao] = useState<File|null>(null);
  const [enviandoCotacao, setEnviandoCotacao] = useState(false);
  const [vencedoraId, setVencedoraId] = useState<string|null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [canhotoFile, setCanhotoFile] = useState<File|null>(null);
  const [enviandoCanhoto, setEnviandoCanhoto] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: fData }, { data: pData }] = await Promise.all([
      supabase.from('pcp_fretes').select('*').order('criado_em', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material').eq('status_compra', 'Comprado'),
    ]);
    setFretes(fData || []);
    setPedidosCompra(pData || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const criarFrete = async () => {
    if (!form.descricao.trim()) { alert('Descreva o frete.'); return; }
    setSalvandoFrete(true);
    const { error } = await supabase.from('pcp_fretes').insert([{
      direcao: form.direcao,
      descricao: form.descricao.trim(),
      origem: form.origem.trim() || null,
      destino: form.destino.trim() || null,
      data_prevista: form.data_prevista || null,
      pedido_compra_id: form.pedido_compra_id || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvandoFrete(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setForm({ ...VAZIO_FRETE }); setShowForm(false); fetchAll();
  };

  const abrirModalFrete = async (f: any) => {
    setModalFrete(f);
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    setVencedoraId(f.vencedora_id || null);
    setJustificativa(f.justificativa_vencedora || '');
    setCanhotoFile(null);
    setLoadingCotacoes(true);
    const { data } = await supabase.from('pcp_cotacoes_fretes')
      .select('*').eq('frete_id', f.id).order('criado_em', { ascending: true });
    setCotacoes(data || []);
    setLoadingCotacoes(false);
  };

  const adicionarCotacao = async () => {
    if (!modalFrete) return;
    if (!novaCotacao.transportadora_nome.trim() || !novaCotacao.valor) {
      alert('Informe ao menos o nome da transportadora e o valor.'); return;
    }
    if (novoAnexoCotacao && novoAnexoCotacao.size > 10 * 1024 * 1024) {
      alert(`Anexo muito grande (${(novoAnexoCotacao.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCotacao(true);
    let anexo: { url:string; nome:string } | null = null;
    if (novoAnexoCotacao) {
      const res = await uploadArquivoFrete(novoAnexoCotacao, 'pcp-fretes-cotacoes');
      if (res.error) { alert('Erro ao enviar anexo: ' + res.error); setEnviandoCotacao(false); return; }
      anexo = res;
    }
    const { error } = await supabase.from('pcp_cotacoes_fretes').insert([{
      frete_id: modalFrete.id,
      transportadora_nome: novaCotacao.transportadora_nome.trim(),
      valor: parseFloat(String(novaCotacao.valor).replace(/\./g,'').replace(',','.')) || null,
      condicao_pagamento: novaCotacao.condicao_pagamento.trim() || null,
      prazo_entrega: novaCotacao.prazo_entrega.trim() || null,
      anexo_url: anexo?.url || null,
      anexo_nome: anexo?.nome || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setEnviandoCotacao(false);
    if (error) { alert('Erro ao salvar cotação: ' + error.message); return; }
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    abrirModalFrete(modalFrete);
  };

  const excluirCotacao = async (id: string) => {
    if (!confirm('Remover esta cotação?')) return;
    await supabase.from('pcp_cotacoes_fretes').delete().eq('id', id);
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalFrete(modalFrete);
  };

  const confirmarFreteComVencedora = async () => {
    if (!modalFrete) return;
    if (cotacoes.length < 3) { alert('Registre pelo menos 3 cotações de transportadoras antes de confirmar.'); return; }
    if (!vencedoraId) { alert('Selecione a cotação vencedora.'); return; }
    if (!justificativa.trim()) { alert('Informe a justificativa da cotação vencedora.'); return; }
    const vencedora = cotacoes.find(c => c.id === vencedoraId);
    if (!vencedora) { alert('Cotação vencedora inválida.'); return; }
    setConfirmando(true);
    const { error } = await supabase.from('pcp_fretes').update({
      transportadora: vencedora.transportadora_nome,
      valor_frete: vencedora.valor,
      vencedora_id: vencedoraId,
      justificativa_vencedora: justificativa.trim(),
      status: 'Em Trânsito',
      data_coleta: new Date().toISOString(),
    }).eq('id', modalFrete.id);
    setConfirmando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setModalFrete(null);
    fetchAll();
  };

  const marcarEntregue = async () => {
    if (!modalFrete || !canhotoFile) return;
    setEnviandoCanhoto(true);
    const res = await uploadArquivoFrete(canhotoFile, 'pcp-fretes-canhotos');
    if (res.error) { alert('Erro ao enviar canhoto: ' + res.error); setEnviandoCanhoto(false); return; }
    const { error } = await supabase.from('pcp_fretes').update({
      status: 'Entregue',
      data_entrega: new Date().toISOString(),
      canhoto_url: res.url,
      canhoto_nome: res.nome,
    }).eq('id', modalFrete.id);
    setEnviandoCanhoto(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setModalFrete(null);
    fetchAll();
  };

  const cancelarFrete = async (f: any) => {
    const motivo = prompt('Motivo do cancelamento:');
    if (motivo === null) return;
    await supabase.from('pcp_fretes').update({
      status: 'Cancelado',
      observacoes: [f.observacoes, `Cancelado: ${motivo}`].filter(Boolean).join(' · '),
    }).eq('id', f.id);
    fetchAll();
  };

  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span>🚚 Fretes — Cotação de Transportadoras e Acompanhamento até Entrega</span>
        {!showForm && (
          <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setForm({...VAZIO_FRETE});setShowForm(true);}}>
            + Novo Frete
          </button>
        )}
      </div>

      {showForm && (
        <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,margin:'10px 0'}}>
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Direção</label>
              <select className="acn-input" style={{width:'100%'}} value={form.direcao}
                onChange={e=>setForm({...form,direcao:e.target.value})}>
                <option value="inbound">📥 Inbound (chegando na ACN)</option>
                <option value="outbound">📤 Outbound (saindo da ACN)</option>
              </select>
            </div>
            <div style={{flex:2}}>
              <label className="acn-label">Descrição *</label>
              <input className="acn-input" style={{width:'100%'}} value={form.descricao}
                onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="O que está sendo transportado" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Origem</label>
              <input className="acn-input" style={{width:'100%'}} value={form.origem}
                onChange={e=>setForm({...form,origem:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Destino</label>
              <input className="acn-input" style={{width:'100%'}} value={form.destino}
                onChange={e=>setForm({...form,destino:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Data Prevista</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={form.data_prevista}
                onChange={e=>setForm({...form,data_prevista:e.target.value})} />
            </div>
          </div>
          {pedidosCompra.length > 0 && (
            <div className="form-row">
              <div style={{flex:1}}>
                <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                <select className="acn-input" style={{width:'100%'}} value={form.pedido_compra_id}
                  onChange={e=>setForm({...form,pedido_compra_id:e.target.value})}>
                  <option value="">— Não vincular —</option>
                  {pedidosCompra.map((p:any) => (
                    <option key={p.id} value={p.id}>
                      {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={criarFrete} disabled={salvandoFrete}>
              {salvandoFrete?'Salvando...':'💾 Registrar Frete'}
            </button>
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div style={{textAlign:'center',padding:30,color:'#9ca3af'}}>Carregando...</div>
        : fretes.length===0 ? <div style={{textAlign:'center',padding:30,color:'#9ca3af',fontSize:12}}>Nenhum frete registrado.</div>
        : (
        <div style={{overflowX:'auto',marginTop:10}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                {['Direção','Descrição','Transportadora','Valor','Status','Datas','Ações'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fretes.map((f:any) => (
                <tr key={f.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'9px 10px'}}>{f.direcao==='outbound' ? '📤 Outbound' : '📥 Inbound'}</td>
                  <td style={{padding:'9px 10px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.descricao}</td>
                  <td style={{padding:'9px 10px'}}>{f.transportadora || '—'}</td>
                  <td style={{padding:'9px 10px'}}>{fmt(f.valor_frete)}</td>
                  <td style={{padding:'9px 10px'}}>
                    <span style={{padding:'3px 9px',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,background:COR_FRETE[f.status]||'#9ca3af'}}>
                      {f.status}
                    </span>
                  </td>
                  <td style={{padding:'9px 10px',fontSize:10,color:'#64748b'}}>
                    {f.data_prevista && <div>Prev: {fmtDt(f.data_prevista)}</div>}
                    {f.data_coleta && <div>Coleta: {fmtDtHr(f.data_coleta)}</div>}
                    {f.data_entrega && <div>Entrega: {fmtDtHr(f.data_entrega)}</div>}
                  </td>
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>
                    <button onClick={()=>abrirModalFrete(f)} style={{...btn,background:'#0891b2',marginRight:3}}>
                      {f.status==='Cotação' ? '🏷️ Cotações' : f.status==='Em Trânsito' ? '📎 Canhoto' : '👁️ Ver'}
                    </button>
                    {(f.status==='Cotação' || f.status==='Em Trânsito') && (
                      <button onClick={()=>cancelarFrete(f)} style={{...btn,background:'#ef4444'}}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL GERENCIAR FRETE */}
      {modalFrete && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalFrete(null);}}>
          <div className="modal-box" style={{maxWidth:640}}>
            <div className="modal-title">🚚 Frete — {modalFrete.descricao}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
              {modalFrete.origem || '—'} → {modalFrete.destino || '—'}
              {modalFrete.status==='Cotação' && ' · mínimo de 3 cotações para confirmar a transportadora.'}
            </div>

            {modalFrete.status === 'Cotação' && (<>
              {loadingCotacoes ? (
                <div style={{textAlign:'center',padding:20,color:'#9ca3af',fontSize:11}}>Carregando...</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14,maxHeight:220,overflowY:'auto'}}>
                  {cotacoes.length===0 && (
                    <div style={{textAlign:'center',color:'#9ca3af',fontSize:11,padding:14}}>Nenhuma cotação registrada ainda.</div>
                  )}
                  {cotacoes.map((c:any) => (
                    <label key={c.id} style={{
                      display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:6,cursor:'pointer',
                      border: vencedoraId===c.id ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                      background: vencedoraId===c.id ? '#f0fdf4' : '#fff',
                    }}>
                      <input type="radio" name="vencedoraFrete" checked={vencedoraId===c.id} onChange={()=>setVencedoraId(c.id)} />
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>
                          {c.transportadora_nome}
                          {vencedoraId===c.id && <span style={{marginLeft:6,color:'#16a34a',fontSize:9,fontWeight:700}}>✓ VENCEDORA</span>}
                        </div>
                        <div style={{fontSize:9,color:'#64748b',marginTop:2}}>
                          {c.valor ? fmt(c.valor) : '—'}
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                          {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                        </div>
                        {c.anexo_url && (
                          <a href={c.anexo_url} target="_blank" rel="noreferrer" style={{fontSize:9,color:'#2563eb'}}>📎 {c.anexo_nome}</a>
                        )}
                      </div>
                      <button onClick={(e)=>{e.preventDefault();excluirCotacao(c.id);}} title="Remover"
                        style={{...btn,background:'#ef4444',padding:'2px 7px',fontSize:9}}>🗑️</button>
                    </label>
                  ))}
                </div>
              )}

              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>+ Nova Cotação de Transportadora</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div>
                    <label className="acn-label">Transportadora *</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.transportadora_nome}
                      onChange={e=>setNovaCotacao(f=>({...f,transportadora_nome:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Valor (R$) *</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.valor}
                      placeholder="Ex: 350,00"
                      onChange={e=>setNovaCotacao(f=>({...f,valor:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Condição de Pagamento</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.condicao_pagamento}
                      onChange={e=>setNovaCotacao(f=>({...f,condicao_pagamento:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Prazo de Entrega</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.prazo_entrega}
                      placeholder="Ex: 3 dias úteis"
                      onChange={e=>setNovaCotacao(f=>({...f,prazo_entrega:e.target.value}))} />
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <label className="acn-label">Anexo (PDF ou imagem)</label>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e=>setNovoAnexoCotacao(e.target.files?.[0]||null)} />
                </div>
                <button className="acn-btn" style={{background:'#d97706',width:'100%'}} onClick={adicionarCotacao} disabled={enviandoCotacao}>
                  {enviandoCotacao?'Enviando...':'+ Adicionar Cotação'}
                </button>
              </div>

              {cotacoes.length >= 3 && (
                <div style={{marginBottom:14}}>
                  <label className="acn-label">Justificativa da cotação vencedora *</label>
                  <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}}
                    value={justificativa} onChange={e=>setJustificativa(e.target.value)}
                    placeholder="Ex: Melhor prazo, apesar de não ser o menor valor..." />
                </div>
              )}

              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={confirmarFreteComVencedora} disabled={confirmando}>
                  {confirmando?'Confirmando...':'✅ Confirmar Transportadora'}
                </button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalFrete(null)}>Fechar</button>
              </div>
            </>)}

            {modalFrete.status === 'Em Trânsito' && (<>
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12,marginBottom:14,fontSize:11}}>
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Coletado em:</strong> {fmtDtHr(modalFrete.data_coleta)}</div>
              </div>
              <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9a3412',marginBottom:8}}>
                  📎 Canhoto obrigatório pra marcar como Entregue
                </div>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setCanhotoFile(e.target.files?.[0]||null)} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={marcarEntregue} disabled={!canhotoFile || enviandoCanhoto}>
                  {enviandoCanhoto?'Enviando...':!canhotoFile?'✅ Marcar como Entregue (anexe o canhoto)':'✅ Marcar como Entregue'}
                </button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalFrete(null)}>Fechar</button>
              </div>
            </>)}

            {modalFrete.status === 'Entregue' && (
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:12,fontSize:11}}>
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Entregue em:</strong> {fmtDtHr(modalFrete.data_entrega)}</div>
                {modalFrete.canhoto_url && (
                  <div style={{marginTop:6}}><a href={modalFrete.canhoto_url} target="_blank" rel="noreferrer">📎 Ver canhoto ({modalFrete.canhoto_nome})</a></div>
                )}
                <button className="acn-btn" style={{background:'#94a3b8',width:'100%',marginTop:10}} onClick={()=>setModalFrete(null)}>Fechar</button>
              </div>
            )}

            {modalFrete.status === 'Cancelado' && (
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,fontSize:11}}>
                <div>{modalFrete.observacoes || 'Frete cancelado.'}</div>
                <button className="acn-btn" style={{background:'#94a3b8',width:'100%',marginTop:10}} onClick={()=>setModalFrete(null)}>Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogisticaTab({ currentUser }) {
  const [abaLog, setAbaLog] = useState('historico');
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
      volume: form.volume ? parseFloat(String(form.volume).replace(',','.')) : null,
      fotos: fotosUrls,
      pedido_compra_id: form.pedido_compra_id || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    };
    const { error } = await supabase.from('logistica_manifestos').insert([payload]);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      // Recebimento vinculado a pedido de compra: só fecha a compra e libera o
      // faturamento se a NF do fornecedor foi conferida (gate real, Fase 3).
      // Sem conferência, o manifesto fica registrado mas a compra continua
      // 'Comprado' — divergência a resolver antes de fechar.
      if (form.tipo === 'Recebimento' && form.pedido_compra_id && form.nf_conferida) {
        const agora = new Date().toISOString();
        await supabase.from('pcp_pedidos_compra')
          .update({ status_compra: 'Concluído', data_conclusao: new Date().toISOString().split('T')[0] })
          .eq('id', form.pedido_compra_id);
        await supabase.from('pcp_pedidos_faturamento')
          .update({ recebimento_confirmado: true, recebimento_confirmado_em: agora, status_faturamento: 'liberado' })
          .eq('pedido_id', form.pedido_compra_id);
      }
      setForm(FORM_VAZIO); setFotos([]); setShowForm(false); fetchAll();
    }
    setUploading(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const corTipo = (t) => ({ Recebimento:'#22c55e', Envio:'#3b82f6', Transferencia:'#f59e0b' })[t] || '#94a3b8';

  return (
    <div>
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:'2px solid #1e293b'}}>
        <button style={{flex:1,padding:'8px',background:abaLog==='historico'?'#1e293b':'white',color:abaLog==='historico'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('historico')}>📦 Histórico / Novo Registro</button>
        <button style={{flex:1,padding:'8px',background:abaLog==='relatorio'?'#1e293b':'white',color:abaLog==='relatorio'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('relatorio')}>📊 Relatório IN/OUT</button>
        <button style={{flex:1,padding:'8px',background:abaLog==='fretes'?'#1e293b':'white',color:abaLog==='fretes'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('fretes')}>🚚 Fretes</button>
      </div>

      {abaLog === 'relatorio' ? <RelatorioLogistica /> : abaLog === 'fretes' ? <FretesPanel currentUser={currentUser} /> : <>
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
                        {p.data_prevista_recebimento ? ` · Prev: ${new Date(p.data_prevista_recebimento.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* CONFERÊNCIA TÉCNICA — só quando há pedido de compra vinculado (Fase 3) */}
            {form.tipo === 'Recebimento' && form.pedido_compra_id && (
              <div style={{marginTop:8,background:'#fff7ed',border:'1px solid #fdba74',borderRadius:6,padding:10}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9a3412',marginBottom:8}}>
                  🔍 Conferência Técnica — necessária pra fechar a compra e liberar o pagamento da NF
                </div>
                <div className="form-row">
                  <div style={{flex:2}}>
                    <label className="acn-label">Números de Série Recebidos</label>
                    <input className="acn-input" style={{width:'100%'}} value={form.seriais}
                      placeholder="Ex: SN12345, SN12346..."
                      onChange={e=>setForm({...form,seriais:e.target.value})} />
                  </div>
                  <div style={{flex:1}}>
                    <label className="acn-label">Volume (embalagens)</label>
                    <input className="acn-input" type="number" style={{width:'100%'}} value={form.volume}
                      onChange={e=>setForm({...form,volume:e.target.value})} />
                  </div>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,marginTop:8,cursor:'pointer',color:form.nf_conferida?'#16a34a':'#78716c'}}>
                  <input type="checkbox" checked={form.nf_conferida} onChange={e=>setForm({...form,nf_conferida:e.target.checked})} />
                  ✅ NF do fornecedor confere com o que chegou
                </label>
                {!form.nf_conferida && (
                  <div style={{fontSize:9,color:'#92400e',marginTop:4}}>
                    Sem marcar isso, o registro fica salvo mas a compra continua "Comprado" — não fecha e não libera o pagamento.
                  </div>
                )}
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
      </>}

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
