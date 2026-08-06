// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ─── Constantes ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';

const fmtR = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};

function calcItem(item, params) {
  const qt             = Number(item.qt)             || 1;
  const custo_unit     = Number(item.custo_unit)     || 0;
  const ipi_pct        = Number(item.ipi_pct)        || 0;
  const st_pct         = Number(item.st_pct)         || 0;
  const markup_pct     = Number(item.markup_pct)     || 0;
  const difal_pct      = Number(item.difal_pct)      || 0;
  const imposto_pct    = Number(item.imposto_pct)    || 0;
  const custo_fixo_pct = Number(item.custo_fixo_pct) || 0;
  const fx = item.moeda === 'DOLAR' ? (Number(params.ptax_dolar) || 5.85)
           : item.moeda === 'EURO'  ? (Number(params.ptax_euro)  || 6.40)
           : 1;
  const custoUnitBrl = custo_unit * (1 + ipi_pct / 100) * (1 + st_pct / 100) * fx;
  const custoTotal   = custoUnitBrl * qt;
  const valorUnit    = difal_pct < 100
    ? custoUnitBrl * (1 + markup_pct / 100) / (1 - difal_pct / 100)
    : 0;
  const valorTotal   = valorUnit * qt;
  const totalDifal   = valorTotal * (difal_pct / 100);
  const receitaBruta = custoUnitBrl * (1 + markup_pct / 100) * qt;
  const totalImposto = receitaBruta * (imposto_pct / 100);
  const margem       = receitaBruta - totalImposto - (custo_fixo_pct / 100 * receitaBruta) - custoTotal;
  const lucroPct     = (valorTotal - totalDifal) > 0 ? (margem / (valorTotal - totalDifal)) * 100 : 0;
  return { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct };
}

const STATUS_CORES = {
  rascunho:          { bg:'#f1f5f9', color:'#475569', label:'Rascunho' },
  ativa:             { bg:'#dbeafe', color:'#1d4ed8', label:'Ativa' },
  aprovada:          { bg:'#dcfce7', color:'#16a34a', label:'Aprovada' },
  proposta_gerada:   { bg:'#fef9c3', color:'#92400e', label:'Proposta Gerada' },
  vinculada:         { bg:'#ede9fe', color:'#6d28d9', label:'Vinculada' },
  cancelada:         { bg:'#fee2e2', color:'#dc2626', label:'Cancelada' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CORES[status] || { bg:'#f1f5f9', color:'#475569', label: status || '—' };
  return (
    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:3, padding:'2px 7px',
      fontSize:9, fontWeight:700, letterSpacing:.2 }}>
      {cfg.label}
    </span>
  );
}

// ─── Modal de Desconto / Proposta ────────────────────────────────────────────
function ModalDesconto({ cotacao, currentUser, onClose, onSalvo, verCustos, verMarkup, pedirAprovacao }) {
  const [desconto, setDesconto] = useState(0);
  const [obs,      setObs]      = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo]         = useState('proposta'); // 'proposta' | 'aprovacao'

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const results   = itens.map(it => calcItem(it, prms));
  const totVendas  = results.reduce((s, r) => s + r.valorTotal,   0);
  const totImposto = results.reduce((s, r) => s + r.totalImposto, 0);
  const maxDesc    = Number(cotacao.desconto_maximo_pct) || 0;
  const valorDesc  = totVendas * desconto / 100;
  const valorFinal = totVendas - valorDesc;

  const precisaAprovacao = desconto > maxDesc && maxDesc > 0;

  const salvar = async () => {
    setSalvando(true);
    if (precisaAprovacao) {
      // Envia para aprovação
      const { error } = await supabase.from('cotacoes_aprovacoes').insert([{
        cotacao_id:          cotacao.id,
        cotacao_nome:        cotacao.nome,
        numero_cotacao:      cotacao.numero_cotacao,
        solicitado_por:      currentUser?.email,
        desconto_pct:        desconto,
        motivo:              obs,
        status:              'pendente',
        crm_oportunidade_id: cotacao.crm_oportunidade_id || null,
      }]);
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
      alert(`✅ Solicitação de aprovação enviada! Desconto de ${desconto}% aguardando aprovação.`);
      onSalvo && onSalvo();
      onClose();
    } else {
      // Salva proposta diretamente
      const { error } = await supabase.from('cotacoes_propostas').insert([{
        cotacao_id:          cotacao.id,
        cotacao_nome:        cotacao.nome,
        opl_numero:          cotacao.opl_numero || null,
        desconto_pct:        desconto,
        valor_total:         totVendas,
        valor_com_desconto:  valorFinal,
        criado_por:          currentUser?.email,
        observacoes:         obs,
      }]);
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return; }
      // Atualiza status
      await supabase.from('cotacoes_precos').update({ status: 'proposta_gerada' }).eq('id', cotacao.id);
      alert('✅ Proposta salva!');
      onSalvo && onSalvo();
      onClose();
    }
    setSalvando(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:420, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color:'#1e293b' }}>📄 Gerar Proposta</div>
            <div style={{ fontSize:9, color:'#64748b' }}>{cotacao.numero_cotacao} · {cotacao.nome}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#6b7280', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:16 }}>
          {/* Resumo de valor — valor de venda + impostos */}
          <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Valor de Venda</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{fmtR(totVendas)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid #bae6fd' }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Impostos</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>{fmtR(totImposto)}</span>
            </div>
            {maxDesc > 0 && (
              <div style={{ fontSize:9, color:'#0369a1', fontWeight:700, marginTop:8,
                background:'#e0f2fe', borderRadius:4, padding:'4px 8px', display:'inline-block' }}>
                🔒 Desconto máximo permitido: {maxDesc}%
              </div>
            )}
          </div>

          {/* Slider de desconto — limitado ao maxDesc configurado */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
              <span>Desconto (%)</span>
              <span style={{ color:'#0f766e', fontWeight:800 }}>{desconto}%</span>
            </div>
            <input type="range" min={0}
              max={maxDesc > 0 ? maxDesc : 50}
              step={maxDesc > 0 ? Math.min(0.5, maxDesc / 10) : 0.5}
              value={desconto}
              onChange={e => setDesconto(Number(e.target.value))}
              style={{ width:'100%', accentColor:'#0f766e' }} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#9ca3af' }}>
              <span>0%</span>
              {maxDesc > 0
                ? <><span>{(maxDesc / 2).toFixed(1)}%</span><span>{maxDesc}%</span></>
                : <><span>25%</span><span>50%</span></>}
            </div>
          </div>

          {/* Resultado */}
          <div style={{ background: precisaAprovacao ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${precisaAprovacao ? '#fca5a5' : '#86efac'}`,
            borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Desconto</span>
              <span style={{ fontSize:10, color:'#dc2626', fontWeight:700 }}>- {fmtR(valorDesc)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#374151' }}>Valor Final</span>
              <span style={{ fontSize:13, fontWeight:800, color: precisaAprovacao ? '#dc2626' : '#16a34a' }}>{fmtR(valorFinal)}</span>
            </div>
            {precisaAprovacao && (
              <div style={{ marginTop:8, padding:'6px 10px', background:'#fee2e2', borderRadius:5, fontSize:9, color:'#991b1b' }}>
                ⚠️ Desconto acima do limite. Esta proposta precisará de <strong>aprovação do gestor</strong>.
              </div>
            )}
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:9, fontWeight:700, color:'#475569', display:'block', marginBottom:4 }}>
              {precisaAprovacao ? 'Justificativa (obrigatória)' : 'Observações (opcional)'}
            </label>
            <textarea value={obs} onChange={e => setObs(e.target.value)}
              placeholder={precisaAprovacao ? 'Explique o motivo do desconto extra...' : 'Observações para o cliente...'}
              rows={3}
              style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 8px', fontSize:10, boxSizing:'border-box', fontFamily:'inherit', resize:'vertical' }} />
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:5,
              padding:'7px 16px', fontSize:10, color:'#475569', cursor:'pointer', fontWeight:600 }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || (precisaAprovacao && !obs.trim())}
              style={{ background: precisaAprovacao ? '#dc2626' : '#0f766e', color:'#fff', border:'none',
                borderRadius:5, padding:'7px 18px', fontSize:10, fontWeight:700, cursor:'pointer',
                opacity: (salvando || (precisaAprovacao && !obs.trim())) ? .5 : 1 }}>
              {salvando ? 'Salvando...' : precisaAprovacao ? '📤 Enviar para Aprovação' : '💾 Gerar Proposta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Detalhe de Cotação ─────────────────────────────────────────────────
function ModalDetalhe({ cotacao, currentUser, verCustos, verFornec, verMarkup,
  onClose, onAbrirDesconto, onVincularOp, onOpenCrm, recarregar }) {
  const [propostas,   setPropostas]   = useState([]);
  const [aprovacoes,  setAprovacoes]  = useState([]);
  const [opBusca,     setOpBusca]     = useState('');
  const [opOpts,      setOpOpts]      = useState([]);
  const [buscandoOp,  setBuscandoOp]  = useState(false);
  const [vinculando,  setVinculando]  = useState(false);
  const timerRef = useRef(null);

  const isAdmin  = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);

  useEffect(() => {
    supabase.from('cotacoes_propostas').select('*')
      .eq('cotacao_id', cotacao.id).order('criado_em', { ascending: false })
      .then(({ data }) => setPropostas(data || []));
    supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false })
      .then(({ data }) => setAprovacoes(data || []));
  }, [cotacao.id]);

  const buscarOp = (texto) => {
    setOpBusca(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setOpOpts([]); return; }
    timerRef.current = setTimeout(async () => {
      setBuscandoOp(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .ilike('opl', `%${texto}%`).limit(8);
      setOpOpts(data || []);
      setBuscandoOp(false);
    }, 260);
  };

  const vincularOp = async (op) => {
    setVinculando(true);
    await supabase.from('cotacoes_precos').update({
      opl_id:     op.id,
      opl_numero: op.opl,
      status:     'vinculada',
    }).eq('id', cotacao.id);
    setOpBusca('');
    setOpOpts([]);
    setVinculando(false);
    recarregar && recarregar();
    onClose();
  };

  const aprovarSolicitacao = async (aprov) => {
    if (!isAdmin) return;
    const resposta = prompt('Resposta (aprovado/rejeitado):');
    if (!resposta) return;
    const status = resposta.toLowerCase().includes('rej') ? 'rejeitado' : 'aprovado';
    await supabase.from('cotacoes_aprovacoes').update({
      status, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(), resposta: resposta,
    }).eq('id', aprov.id);
    if (status === 'aprovado') {
      await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', cotacao.id);
    }
    const { data } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('cotacao_id', cotacao.id).order('solicitado_em', { ascending: false });
    setAprovacoes(data || []);
    recarregar && recarregar();
  };

  const prms      = cotacao.parametros_globais || {};
  const itens     = cotacao.itens || [];
  const results   = itens.map(it => calcItem(it, prms));
  const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);
  const totCusto  = results.reduce((s, r) => s + r.custoTotal, 0);
  const margem    = totVendas - totCusto;

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1900, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:700, maxWidth:'95vw', maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 8px 32px #0003', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px', background:'#1e3a5f', color:'#fff', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, opacity:.75, fontWeight:700, letterSpacing:.5, marginBottom:2 }}>
              COTAÇÃO · {cotacao.numero_cotacao || '—'}
            </div>
            <div style={{ fontSize:14, fontWeight:800 }}>{cotacao.nome}</div>
            <div style={{ fontSize:9, opacity:.85, marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
              <span>{cotacao.tipo} · {cotacao.empresa}</span>
              {cotacao.opl_numero && <span>🔗 OP: {cotacao.opl_numero}</span>}
              {cotacao.crm_oportunidade_id && (
                <button onClick={() => onOpenCrm && onOpenCrm(cotacao.crm_oportunidade_id)}
                  style={{ background:'none', border:'none', color:'#93c5fd', fontSize:9,
                    cursor:'pointer', textDecoration:'underline', padding:0 }}>
                  🏛️ Ver no CRM
                </button>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <StatusBadge status={cotacao.status} />
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:16, flex:1, overflowY:'auto' }}>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns: verCustos ? '1fr 1fr 1fr' : '1fr', gap:10, marginBottom:14 }}>
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#16a34a', fontWeight:700, marginBottom:3 }}>PREÇO DE VENDA</div>
              <div style={{ fontSize:16, fontWeight:800, color:'#15803d' }}>{fmtR(totVendas)}</div>
            </div>
            {verCustos && (
              <>
                <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#92400e', fontWeight:700, marginBottom:3 }}>CUSTO TOTAL</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#78350f' }}>{fmtR(totCusto)}</div>
                </div>
                <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#6d28d9', fontWeight:700, marginBottom:3 }}>MARGEM</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#5b21b6' }}>{fmtR(margem)} ({fmtPct(totVendas > 0 ? margem/totVendas*100 : 0)})</div>
                </div>
              </>
            )}
          </div>

          {/* Tabela de itens */}
          <div style={{ overflowX:'auto', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'#1e293b', color:'#cbd5e1' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>Item</th>
                  <th style={{ padding:'6px 8px', textAlign:'center' }}>Qt</th>
                  {verFornec && <th style={{ padding:'6px 8px', textAlign:'left' }}>Fornecedor</th>}
                  {verFornec && <th style={{ padding:'6px 8px', textAlign:'left' }}>Marca</th>}
                  {verCustos && <th style={{ padding:'6px 8px', textAlign:'right' }}>Custo</th>}
                  {verMarkup && <th style={{ padding:'6px 8px', textAlign:'right' }}>Markup</th>}
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Preço Unit.</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => {
                  const r = results[i];
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding:'5px 8px', maxWidth:220, wordBreak:'break-word' }}>
                        <div style={{ fontWeight:600, color:'#1e293b' }}>{it.produto || '—'}</div>
                        {it.unidade && <div style={{ fontSize:8, color:'#9ca3af' }}>{it.unidade}</div>}
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center', color:'#374151' }}>{it.qt || 1}</td>
                      {verFornec && <td style={{ padding:'5px 8px', color:'#374151' }}>{it.fornecedor || '—'}</td>}
                      {verFornec && <td style={{ padding:'5px 8px', color:'#374151' }}>{it.marca || '—'}</td>}
                      {verCustos && <td style={{ padding:'5px 8px', textAlign:'right', color:'#92400e' }}>{fmtR(r.custoTotal)}</td>}
                      {verMarkup && <td style={{ padding:'5px 8px', textAlign:'right', color:'#6d28d9' }}>{fmtPct(it.markup_pct)}</td>}
                      <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600 }}>{fmtR(r.valorUnit)}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#15803d' }}>{fmtR(r.valorTotal)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background:'#1e293b', color:'#fff' }}>
                  <td colSpan={2 + (verFornec?2:0) + (verCustos?1:0) + (verMarkup?1:0)}
                    style={{ padding:'7px 8px', fontWeight:700, fontSize:11, textAlign:'right' }}>
                    TOTAL
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:800, fontSize:12 }}>{fmtR(totVendas)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Vincular OP/OS */}
          <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>🔗 Vincular OP/OS</div>
            {cotacao.opl_numero ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:10, color:'#16a34a', fontWeight:700 }}>✅ OP Vinculada: {cotacao.opl_numero}</span>
                {isAdmin && (
                  <button onClick={async () => {
                    await supabase.from('cotacoes_precos').update({ opl_id: null, opl_numero: null }).eq('id', cotacao.id);
                    recarregar && recarregar();
                    onClose();
                  }} style={{ fontSize:8, background:'#fee2e2', border:'1px solid #fca5a5', color:'#dc2626',
                    borderRadius:3, padding:'2px 6px', cursor:'pointer' }}>
                    Desvincular
                  </button>
                )}
              </div>
            ) : (
              <div style={{ position:'relative' }}>
                <input value={opBusca} onChange={e => buscarOp(e.target.value)}
                  placeholder="Buscar OP pelo número..."
                  style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 8px',
                    fontSize:10, boxSizing:'border-box' }} />
                {buscandoOp && <div style={{ fontSize:9, color:'#6b7280', padding:'4px 0' }}>Buscando...</div>}
                {opOpts.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff',
                    border:'1px solid #e2e8f0', borderRadius:5, boxShadow:'0 4px 12px #0002', zIndex:10 }}>
                    {opOpts.map(op => (
                      <div key={op.id} onClick={() => vincularOp(op)}
                        style={{ padding:'7px 10px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                          fontSize:10, display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontWeight:600 }}>{op.opl}</span>
                        <span style={{ color:'#6b7280' }}>{op.cliente_nome}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Histórico de aprovações */}
          {aprovacoes.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>📋 Solicitações de Aprovação</div>
              {aprovacoes.map(a => (
                <div key={a.id} style={{ background: a.status==='aprovado' ? '#f0fdf4' : a.status==='rejeitado' ? '#fef2f2' : '#fef9c3',
                  border:`1px solid ${a.status==='aprovado'?'#86efac':a.status==='rejeitado'?'#fca5a5':'#fde68a'}`,
                  borderRadius:6, padding:'8px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700 }}>
                      {a.status==='aprovado'?'✅':a.status==='rejeitado'?'❌':'⏳'} Desconto: {a.desconto_pct}%
                    </span>
                    <span style={{ fontSize:9, color:'#6b7280' }}>{a.status}</span>
                  </div>
                  <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Por: {a.solicitado_por} · {new Date(a.solicitado_em).toLocaleString('pt-BR')}</div>
                  {a.motivo && <div style={{ fontSize:9, color:'#374151' }}>Motivo: {a.motivo}</div>}
                  {a.resposta && <div style={{ fontSize:9, color:'#374151', marginTop:3 }}>Resposta: {a.resposta} (por {a.aprovado_por})</div>}
                  {isAdmin && a.status === 'pendente' && (
                    <button onClick={() => aprovarSolicitacao(a)}
                      style={{ marginTop:8, background:'#0f766e', color:'#fff', border:'none', borderRadius:4,
                        padding:'4px 12px', fontSize:9, cursor:'pointer', fontWeight:700 }}>
                      ✅ Responder
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Propostas geradas */}
          {propostas.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#475569', marginBottom:8 }}>📄 Propostas Geradas</div>
              {propostas.map(p => (
                <div key={p.id} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6,
                  padding:'8px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <span style={{ fontSize:11, fontWeight:700, color:'#15803d' }}>{fmtR(p.valor_com_desconto)}</span>
                      {p.desconto_pct > 0 && (
                        <span style={{ fontSize:9, color:'#dc2626', marginLeft:8 }}>({p.desconto_pct}% de desconto)</span>
                      )}
                    </div>
                    <span style={{ fontSize:9, color:'#9ca3af' }}>{new Date(p.criado_em).toLocaleString('pt-BR')}</span>
                  </div>
                  <div style={{ fontSize:9, color:'#475569', marginTop:3 }}>
                    Total sem desconto: {fmtR(p.valor_total)} · por {p.criado_por}
                  </div>
                  {p.observacoes && <div style={{ fontSize:9, color:'#374151', marginTop:3 }}>Obs: {p.observacoes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer de ações */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => onAbrirDesconto && onAbrirDesconto()}
            style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:5,
              padding:'7px 16px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            💰 Gerar Proposta / Desconto
          </button>
          <button onClick={onClose}
            style={{ background:'#f1f5f9', color:'#475569', border:'none', borderRadius:5,
              padding:'7px 14px', fontSize:10, cursor:'pointer' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Aprovações Pendentes (para Admin/Gestor) ───────────────────────
function PainelAprovacoes({ currentUser, onClose }) {
  const [lista, setLista]   = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('cotacoes_aprovacoes').select('*')
      .eq('status', 'pendente').order('solicitado_em', { ascending: false });
    setLista(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (aprov, decisao) => {
    const resposta = decisao === 'aprovado'
      ? 'Aprovado pelo gestor.'
      : prompt('Motivo da rejeição:') || 'Rejeitado.';
    await supabase.from('cotacoes_aprovacoes').update({
      status: decisao, aprovado_por: currentUser?.email,
      aprovado_em: new Date().toISOString(), resposta,
    }).eq('id', aprov.id);
    if (decisao === 'aprovado') {
      await supabase.from('cotacoes_precos').update({ status: 'aprovada' }).eq('id', aprov.cotacao_id);
    }
    carregar();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:560, maxWidth:'95vw', maxHeight:'80vh',
        overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:13, color:'#1e293b' }}>⏳ Aprovações Pendentes</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#6b7280', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:16 }}>
          {loading && <div style={{ textAlign:'center', color:'#9ca3af', padding:20 }}>Carregando...</div>}
          {!loading && lista.length === 0 && (
            <div style={{ textAlign:'center', color:'#9ca3af', padding:24, fontSize:11 }}>
              ✅ Nenhuma aprovação pendente.
            </div>
          )}
          {lista.map(a => (
            <div key={a.id} style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:8,
              padding:'10px 14px', marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:11, color:'#1e293b', marginBottom:4 }}>
                {a.cotacao_nome || a.numero_cotacao || a.cotacao_id}
              </div>
              <div style={{ fontSize:10, color:'#475569', marginBottom:6 }}>
                Desconto solicitado: <strong style={{ color:'#dc2626' }}>{a.desconto_pct}%</strong>
                {' '}por <strong>{a.solicitado_por}</strong>
                {' '}· {new Date(a.solicitado_em).toLocaleString('pt-BR')}
              </div>
              {a.motivo && <div style={{ fontSize:9, color:'#374151', marginBottom:8 }}>Motivo: {a.motivo}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => responder(a, 'aprovado')}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 16px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  ✅ Aprovar
                </button>
                <button onClick={() => responder(a, 'rejeitado')}
                  style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  ❌ Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN: CotacoesTab ────────────────────────────────────────────────────────
export default function CotacoesTab({ currentUser, onAbrirCrmCard }) {
  const [cotacoes,    setCotacoes]    = useState([]);
  const [carregando,  setCarregando]  = useState(true);
  const [busca,       setBusca]       = useState('');
  const [filtroStatus,setFiltroStatus]= useState('');
  const [modalDetalhe,setModalDetalhe]= useState(null);
  const [modalDesc,   setModalDesc]   = useState(null);
  const [modalAprovs, setModalAprovs] = useState(false);
  const [pendCount,   setPendCount]   = useState(0);

  // Visibilidade controlada pelo admin
  const [cfg, setCfg] = useState({
    verCustos:  false,
    verFornec:  false,
    verMarkup:  false,
  });

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);
  const isVendedor = !isAdmin;

  // Carregar configurações de visibilidade
  const carregarConfig = useCallback(async () => {
    const { data } = await supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['cotacoes_ver_custos_margens','cotacoes_ver_fornecedores','cotacoes_ver_markup']);
    if (data) {
      const m = Object.fromEntries(data.map(r => [r.chave, r.valor === 'true']));
      setCfg({
        verCustos: isAdmin || m['cotacoes_ver_custos_margens'] || false,
        verFornec: isAdmin || m['cotacoes_ver_fornecedores']   || false,
        verMarkup: isAdmin || m['cotacoes_ver_markup']         || false,
      });
    } else {
      // Se tabela não existe ainda, admin vê tudo
      setCfg({ verCustos: isAdmin, verFornec: isAdmin, verMarkup: isAdmin });
    }
  }, [isAdmin]);

  const carregarCotacoes = useCallback(async () => {
    setCarregando(true);
    let q = supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    // Vendedores só veem cotações ativas ou acima de rascunho
    if (isVendedor) {
      q = q.neq('status', 'rascunho');
    }
    const { data } = await q;
    setCotacoes(data || []);
    setCarregando(false);
  }, [isVendedor]);

  const carregarPendentes = useCallback(async () => {
    if (!isAdmin) return;
    const { count } = await supabase.from('cotacoes_aprovacoes')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    setPendCount(count || 0);
  }, [isAdmin]);

  useEffect(() => {
    carregarConfig();
    carregarCotacoes();
    carregarPendentes();
  }, [carregarConfig, carregarCotacoes, carregarPendentes]);

  const cotacoesFiltradas = cotacoes.filter(c => {
    const ok_busca = !busca ||
      (c.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.numero_cotacao || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.opl_numero || '').toLowerCase().includes(busca.toLowerCase()) ||
      (c.criado_por || '').toLowerCase().includes(busca.toLowerCase());
    const ok_status = !filtroStatus || c.status === filtroStatus;
    return ok_busca && ok_status;
  });

  const statusOpcoes = [...new Set(cotacoes.map(c => c.status).filter(Boolean))];

  return (
    <div style={{ padding:'0 0 24px', fontFamily:'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>📋 Cotações</div>
            <div style={{ fontSize:9, color:'#64748b', marginTop:1 }}>
              {cotacoesFiltradas.length} cotação(ões) · {cotacoes.filter(c=>c.status==='ativa').length} ativas
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {isAdmin && pendCount > 0 && (
              <button onClick={() => setModalAprovs(true)}
                style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:5,
                  padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:5 }}>
                ⏳ Aprovações Pendentes
                <span style={{ background:'#fff', color:'#dc2626', borderRadius:10, padding:'0 5px', fontSize:9, fontWeight:800 }}>
                  {pendCount}
                </span>
              </button>
            )}
            <button onClick={() => { carregarCotacoes(); carregarPendentes(); }}
              style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:5,
                padding:'6px 12px', fontSize:9, color:'#475569', cursor:'pointer' }}>
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, número, OP..."
            style={{ flex:'1 1 220px', border:'1px solid #d1d5db', borderRadius:5, padding:'6px 10px',
              fontSize:10, outline:'none' }} />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ border:'1px solid #d1d5db', borderRadius:5, padding:'6px 10px', fontSize:10 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CORES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso de campos ocultos */}
      {isVendedor && (!cfg.verCustos || !cfg.verFornec || !cfg.verMarkup) && (
        <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:6,
          padding:'8px 12px', marginBottom:10, fontSize:9, color:'#78350f' }}>
          ℹ️ Alguns campos desta cotação estão ocultos por configuração do administrador.
        </div>
      )}

      {/* Tabela */}
      {carregando ? (
        <div style={{ textAlign:'center', padding:32, color:'#9ca3af' }}>Carregando...</div>
      ) : cotacoesFiltradas.length === 0 ? (
        <div style={{ textAlign:'center', padding:32, color:'#9ca3af', fontSize:11 }}>
          Nenhuma cotação encontrada.
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'#1e293b', color:'#cbd5e1' }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Número</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Nome</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Status</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Tipo</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Empresa</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>OP</th>
                  <th style={{ padding:'8px 10px', textAlign:'right', fontWeight:600 }}>Valor Total</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>Criado em</th>
                  <th style={{ padding:'8px 10px', textAlign:'center', fontWeight:600 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {cotacoesFiltradas.map((c, i) => {
                  const itens   = c.itens || [];
                  const prms    = c.parametros_globais || {};
                  const results = itens.map(it => calcItem(it, prms));
                  const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);

                  return (
                    <tr key={c.id} style={{ background: i%2===0?'#fff':'#f8fafc',
                      cursor:'pointer', transition:'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'}
                      onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#f8fafc'}>
                      <td style={{ padding:'7px 10px', fontWeight:700, color:'#0369a1' }}>
                        {c.crm_oportunidade_id && onAbrirCrmCard ? (
                          <button onClick={() => onAbrirCrmCard(c.crm_oportunidade_id)}
                            style={{ background:'none', border:'none', color:'#0369a1', cursor:'pointer',
                              fontWeight:700, fontSize:10, padding:0, textDecoration:'underline' }}>
                            {c.numero_cotacao || '—'}
                          </button>
                        ) : (
                          <span>{c.numero_cotacao || '—'}</span>
                        )}
                      </td>
                      <td style={{ padding:'7px 10px', maxWidth:200, wordBreak:'break-word' }}>
                        <div style={{ fontWeight:600, color:'#1e293b' }}>{c.nome}</div>
                        {c.criado_por && <div style={{ fontSize:8, color:'#9ca3af' }}>{c.criado_por}</div>}
                      </td>
                      <td style={{ padding:'7px 10px' }}><StatusBadge status={c.status} /></td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{c.tipo || '—'}</td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{c.empresa || '—'}</td>
                      <td style={{ padding:'7px 10px' }}>
                        {c.opl_numero
                          ? <span style={{ fontWeight:700, color:'#16a34a' }}>🔗 {c.opl_numero}</span>
                          : <span style={{ color:'#9ca3af', fontSize:9 }}>—</span>}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#15803d' }}>
                        {totVendas > 0 ? fmtR(totVendas) : '—'}
                      </td>
                      <td style={{ padding:'7px 10px', color:'#6b7280', fontSize:9 }}>
                        {c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'center' }}>
                        <button onClick={() => setModalDetalhe(c)}
                          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
                            padding:'4px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalDetalhe && (
        <ModalDetalhe
          cotacao={modalDetalhe}
          currentUser={currentUser}
          verCustos={cfg.verCustos}
          verFornec={cfg.verFornec}
          verMarkup={cfg.verMarkup}
          onClose={() => setModalDetalhe(null)}
          onAbrirDesconto={() => { setModalDesc(modalDetalhe); setModalDetalhe(null); }}
          onOpenCrm={(opId) => {
            setModalDetalhe(null);
            onAbrirCrmCard && onAbrirCrmCard(opId);
          }}
          recarregar={() => carregarCotacoes()}
        />
      )}

      {modalDesc && (
        <ModalDesconto
          cotacao={modalDesc}
          currentUser={currentUser}
          verCustos={cfg.verCustos}
          verMarkup={cfg.verMarkup}
          onClose={() => setModalDesc(null)}
          onSalvo={() => { carregarCotacoes(); carregarPendentes(); }}
        />
      )}

      {modalAprovs && (
        <PainelAprovacoes
          currentUser={currentUser}
          onClose={() => { setModalAprovs(false); carregarPendentes(); carregarCotacoes(); }}
        />
      )}
    </div>
  );
}

// ─── Componente embutido para uso dentro do card CRM ─────────────────────────
export function CotacoesCrmPanel({ oportunidadeId, currentUser, verCustos, verFornec, verMarkup }) {
  const [cotacoes,   setCotacoes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modalDesc,  setModalDesc]  = useState(null);

  const isAdmin = ['Admin','Gerente','Gerente Comercial'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('cotacoes_precos').select('*')
      .eq('crm_oportunidade_id', oportunidadeId)
      .order('criado_em', { ascending: false });
    setCotacoes(data || []);
    setLoading(false);
  }, [oportunidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div style={{ color:'#9ca3af', fontSize:10, padding:10 }}>Carregando cotações...</div>;

  if (cotacoes.length === 0) return (
    <div style={{ textAlign:'center', color:'#9ca3af', padding:24, fontSize:10 }}>
      Nenhuma cotação vinculada a este card.
    </div>
  );

  return (
    <div>
      {cotacoes.map(c => {
        const itens = c.itens || [];
        const prms  = c.parametros_globais || {};
        const results = itens.map(it => calcItem(it, prms));
        const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);
        const totCusto  = results.reduce((s, r) => s + r.custoTotal, 0);
        return (
          <div key={c.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8,
            padding:'10px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <div>
                <span style={{ fontWeight:700, color:'#0369a1', fontSize:10, marginRight:8 }}>
                  {c.numero_cotacao || '—'}
                </span>
                <StatusBadge status={c.status} />
                <div style={{ fontSize:10, fontWeight:600, color:'#1e293b', marginTop:3 }}>{c.nome}</div>
                <div style={{ fontSize:9, color:'#6b7280' }}>
                  {c.tipo} · {c.empresa}
                  {c.opl_numero ? ` · OP: ${c.opl_numero}` : ''}
                  {` · Criado: ${c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—'}`}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#15803d' }}>{fmtR(totVendas)}</div>
                {verCustos && <div style={{ fontSize:9, color:'#92400e' }}>Custo: {fmtR(totCusto)}</div>}
              </div>
            </div>

            {/* Itens resumidos */}
            {itens.length > 0 && (
              <div style={{ overflowX:'auto', marginBottom:8 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
                  <thead>
                    <tr style={{ background:'#f1f5f9' }}>
                      <th style={{ padding:'3px 6px', textAlign:'left', fontWeight:600 }}>Item</th>
                      <th style={{ padding:'3px 6px', textAlign:'center' }}>Qt</th>
                      {verFornec && <th style={{ padding:'3px 6px', textAlign:'left' }}>Fornecedor</th>}
                      {verMarkup && <th style={{ padding:'3px 6px', textAlign:'right' }}>Markup</th>}
                      {verCustos && <th style={{ padding:'3px 6px', textAlign:'right' }}>Custo</th>}
                      <th style={{ padding:'3px 6px', textAlign:'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.slice(0, 5).map((it, i) => {
                      const r = results[i] || {};
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'3px 6px', color:'#374151' }}>{it.produto || '—'}</td>
                          <td style={{ padding:'3px 6px', textAlign:'center' }}>{it.qt || 1}</td>
                          {verFornec && <td style={{ padding:'3px 6px', color:'#475569' }}>{it.fornecedor||'—'}</td>}
                          {verMarkup && <td style={{ padding:'3px 6px', textAlign:'right', color:'#6d28d9' }}>{fmtPct(it.markup_pct)}</td>}
                          {verCustos && <td style={{ padding:'3px 6px', textAlign:'right', color:'#92400e' }}>{fmtR(r.custoTotal)}</td>}
                          <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:600 }}>{fmtR(r.valorTotal)}</td>
                        </tr>
                      );
                    })}
                    {itens.length > 5 && (
                      <tr><td colSpan={5} style={{ padding:'3px 6px', color:'#9ca3af', fontStyle:'italic' }}>
                        + {itens.length - 5} itens adicionais...
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setModalDesc(c)}
              style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:4,
                padding:'4px 12px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              💰 Gerar Proposta
            </button>
          </div>
        );
      })}

      {modalDesc && (
        <ModalDesconto
          cotacao={modalDesc}
          currentUser={currentUser}
          verCustos={verCustos}
          verMarkup={verMarkup}
          onClose={() => setModalDesc(null)}
          onSalvo={() => carregar()}
        />
      )}
    </div>
  );
}
