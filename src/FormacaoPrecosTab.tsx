// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MOEDAS = ['REAL', 'DOLAR', 'EURO'];

const PARAMS_PADRAO = {
  ptax_dolar:     5.85,
  ptax_euro:      6.40,
  difal_pct:      16,
  imposto_pct:    16,
  custo_fixo_pct: 3,
  lote_qtd:       1,
};

function novoItem() {
  return {
    _id: Math.random().toString(36).slice(2),
    produto:        '',
    marca:          '',
    fornecedor:     '',
    qt:             1,
    moeda:          'REAL',
    custo_unit:     0,
    ipi_pct:        0,
    st_pct:         0,
    markup_pct:     30,
    difal_pct:      16,
    imposto_pct:    16,
    custo_fixo_pct: 3,
  };
}

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────
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

  // 1. Custo unitário BRL (com IPI + ST + câmbio)
  const custoUnitBrl = custo_unit * (1 + ipi_pct / 100) * (1 + st_pct / 100) * fx;

  // 2. Custo total
  const custoTotal = custoUnitBrl * qt;

  // 3. Valor unitário de venda (markup + recuperação de DIFAL)
  const valorUnit = difal_pct < 100
    ? custoUnitBrl * (1 + markup_pct / 100) / (1 - difal_pct / 100)
    : 0;

  // 4. Valor total de venda
  const valorTotal = valorUnit * qt;

  // 5. DIFAL total
  const totalDifal = valorTotal * (difal_pct / 100);

  // 6. Receita bruta (antes de DIFAL)
  const receitaBruta = custoUnitBrl * (1 + markup_pct / 100) * qt;

  // 7. Imposto total
  const totalImposto = receitaBruta * (imposto_pct / 100);

  // 8. Margem real e lucro %
  const margem   = receitaBruta - totalImposto - (custo_fixo_pct / 100 * receitaBruta) - custoTotal;
  const lucroPct = (valorTotal - totalDifal) > 0 ? (margem / (valorTotal - totalDifal)) * 100 : 0;

  return { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct };
}

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const fmtR = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};

// ─── MODAL DE SALVAR TEMPLATE ─────────────────────────────────────────────────
function ModalSalvar({ onSalvar, onClose, salvando }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('licitacao');
  return (
    <div style={{ position:'fixed', inset:0, background:'#0007', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:360, padding:20, boxShadow:'0 8px 32px #0003' }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:12 }}>💾 Salvar Modelo de Cotação</div>
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nome do Modelo *</div>
          <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: PMSC Lote 3 – Nov/2026"
            value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Tipo</div>
          <select className="acn-input" style={{ width:'100%' }} value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="licitacao">Licitação</option>
            <option value="venda_direta">Venda Direta</option>
            <option value="orcamento">Orçamento</option>
          </select>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#16a34a', flex:1 }}
            onClick={() => { if (!nome.trim()) { alert('Informe o nome.'); return; } onSalvar(nome.trim(), tipo); }}
            disabled={salvando}>
            {salvando ? 'Salvando...' : 'SALVAR'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE CARREGAR TEMPLATE ───────────────────────────────────────────────
function ModalCarregar({ modelos, carregando, onCarregar, onExcluir, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#0007', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(520px,95vw)', maxHeight:'70vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:800, fontSize:13 }}>
          📂 Modelos Salvos
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:10 }}>
          {carregando && <div style={{ textAlign:'center', color:'#64748b', fontSize:11, padding:20 }}>Carregando...</div>}
          {!carregando && modelos.length === 0 && (
            <div style={{ textAlign:'center', color:'#9ca3af', fontSize:11, padding:24 }}>Nenhum modelo salvo.</div>
          )}
          {!carregando && modelos.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
              border:'1px solid #e2e8f0', borderRadius:6, marginBottom:6 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:11 }}>{m.nome}</div>
                <div style={{ fontSize:9, color:'#64748b' }}>
                  {m.tipo} · {m.itens?.length || 0} itens · por {m.criado_por} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'3px 10px' }}
                onClick={() => onCarregar(m)}>Carregar</button>
              <button onClick={() => onExcluir(m.id)}
                style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'3px 7px', fontSize:9, cursor:'pointer' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding:'8px 16px', borderTop:'1px solid #e2e8f0' }}>
          <button className="acn-btn" style={{ background:'#94a3b8', float:'right' }} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── CALCULADORA MARKUP REVERSO ───────────────────────────────────────────────
function CalcMarkupReverso() {
  const [precoVenda, setPrecoVenda] = useState('');
  const [custoFob, setCustoFob]     = useState('');
  const [difal, setDifal]           = useState('16');
  const [resultado, setResultado]   = useState(null);

  const calcular = () => {
    const pv = parseFloat(precoVenda) || 0;
    const cf = parseFloat(custoFob) || 0;
    const d  = parseFloat(difal) / 100 || 0;
    if (pv <= 0 || cf <= 0) { alert('Informe preço de venda e custo.'); return; }
    // precoVenda = custo * (1 + markup) / (1 - difal)
    // markup = precoVenda * (1 - difal) / custo - 1
    const markup = pv * (1 - d) / cf - 1;
    setResultado(markup * 100);
  };

  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:12 }}>
      <div style={{ fontWeight:800, fontSize:11, marginBottom:8, color:'#0891b2' }}>🔄 Markup Reverso</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Preço de Venda (R$)</div>
          <input className="acn-input" style={{ width:110 }} placeholder="Ex: 15000" value={precoVenda} onChange={e=>setPrecoVenda(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Custo c/Impostos BRL</div>
          <input className="acn-input" style={{ width:110 }} placeholder="Ex: 8000" value={custoFob} onChange={e=>setCustoFob(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>DIFAL %</div>
          <input className="acn-input" style={{ width:70 }} value={difal} onChange={e=>setDifal(e.target.value)} />
        </div>
        <button className="acn-btn" style={{ background:'#0891b2' }} onClick={calcular}>Calcular</button>
        {resultado != null && (
          <div style={{ fontWeight:800, fontSize:13, color: resultado >= 0 ? '#16a34a' : '#dc2626', marginLeft:4 }}>
            Markup = {fmtPct(resultado)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CALCULADORA IMPOSTO REVERSO ──────────────────────────────────────────────
function CalcImpostoReverso() {
  const [precoComImposto, setPrecoComImposto] = useState('');
  const [imposto, setImposto]                 = useState('16');
  const [resultado, setResultado]             = useState(null);

  const calcular = () => {
    const p = parseFloat(precoComImposto) || 0;
    const i = parseFloat(imposto) / 100 || 0;
    if (p <= 0) { alert('Informe o preço com imposto.'); return; }
    // precoSemImposto = p / (1 + i)
    const semImposto = p / (1 + i);
    const valorImposto = p - semImposto;
    setResultado({ semImposto, valorImposto });
  };

  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:12 }}>
      <div style={{ fontWeight:800, fontSize:11, marginBottom:8, color:'#7c3aed' }}>🧮 Imposto Reverso</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Preço com Imposto (R$)</div>
          <input className="acn-input" style={{ width:120 }} placeholder="Ex: 18600" value={precoComImposto} onChange={e=>setPrecoComImposto(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Imposto %</div>
          <input className="acn-input" style={{ width:70 }} value={imposto} onChange={e=>setImposto(e.target.value)} />
        </div>
        <button className="acn-btn" style={{ background:'#7c3aed' }} onClick={calcular}>Calcular</button>
        {resultado != null && (
          <div style={{ fontWeight:700, fontSize:11, color:'#7c3aed', marginLeft:4 }}>
            Sem imposto: <strong>{fmtR(resultado.semImposto)}</strong> &nbsp;|&nbsp; Imposto: <strong>{fmtR(resultado.valorImposto)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LINHA DE ITEM ────────────────────────────────────────────────────────────
function ItemRow({ item, result, onSet, onRemove, usarParamsGlobais, params, isVendedor }) {
  const { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct } = result;
  const lucroColor = lucroPct >= 10 ? '#16a34a' : lucroPct >= 5 ? '#d97706' : '#dc2626';
  // Estilo de ocultar colunas sensíveis para vendedor
  const H = isVendedor ? { display:'none' } : {};

  return (
    <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
      {/* Produto */}
      <td style={{ padding:'4px 6px', minWidth:140 }}>
        <input className="acn-input" style={{ width:'100%', fontSize:9, padding:'2px 4px' }}
          placeholder="Descrição do item" value={item.produto} onChange={e=>onSet('produto',e.target.value)} />
      </td>
      {/* Marca */}
      <td style={{ padding:'4px 6px', minWidth:80 }}>
        <input className="acn-input" style={{ width:'100%', fontSize:9, padding:'2px 4px' }}
          placeholder="Marca" value={item.marca} onChange={e=>onSet('marca',e.target.value)} />
      </td>
      {/* Qt */}
      <td style={{ padding:'4px 4px', minWidth:55 }}>
        <input type="number" className="acn-input" style={{ width:50, fontSize:9, padding:'2px 4px', textAlign:'right' }}
          min={1} value={item.qt} onChange={e=>onSet('qt', e.target.value)} />
      </td>
      {/* Moeda */}
      <td style={{ padding:'4px 4px', minWidth:70 }}>
        <select className="acn-input" style={{ width:68, fontSize:9, padding:'2px 3px' }}
          value={item.moeda} onChange={e=>onSet('moeda', e.target.value)}>
          {MOEDAS.map(m=><option key={m}>{m}</option>)}
        </select>
      </td>
      {/* Custo Unit — OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:80, ...H }}>
        <input type="number" className="acn-input" style={{ width:76, fontSize:9, padding:'2px 4px', textAlign:'right' }}
          min={0} step="0.01" value={item.custo_unit} onChange={e=>onSet('custo_unit', e.target.value)} />
      </td>
      {/* IPI% — OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:55, ...H }}>
        <input type="number" className="acn-input" style={{ width:50, fontSize:9, padding:'2px 4px', textAlign:'right' }}
          min={0} step="0.1" value={item.ipi_pct} onChange={e=>onSet('ipi_pct', e.target.value)} />
      </td>
      {/* ST% — OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:55, ...H }}>
        <input type="number" className="acn-input" style={{ width:50, fontSize:9, padding:'2px 4px', textAlign:'right' }}
          min={0} step="0.1" value={item.st_pct} onChange={e=>onSet('st_pct', e.target.value)} />
      </td>
      {/* Markup% — OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:60, ...H }}>
        <input type="number" className="acn-input" style={{ width:56, fontSize:9, padding:'2px 4px', textAlign:'right', background: item.markup_pct < 0 ? '#fee2e2' : undefined }}
          step="0.1" value={item.markup_pct} onChange={e=>onSet('markup_pct', e.target.value)} />
      </td>
      {/* DIFAL% — se usar globais, cinza; OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:55, ...H }}>
        <input type="number" className="acn-input" style={{ width:50, fontSize:9, padding:'2px 4px', textAlign:'right', background: usarParamsGlobais ? '#f1f5f9' : undefined, color: usarParamsGlobais ? '#94a3b8' : undefined }}
          step="0.1" value={usarParamsGlobais ? params.difal_pct : item.difal_pct} onChange={e=>{ if(!usarParamsGlobais) onSet('difal_pct', e.target.value); }} readOnly={usarParamsGlobais} />
      </td>
      {/* Imposto% por linha — se usar globais, cinza; OCULTO para vendedor */}
      <td style={{ padding:'4px 4px', minWidth:55, ...H }}>
        <input type="number" className="acn-input" style={{ width:50, fontSize:9, padding:'2px 4px', textAlign:'right', background: usarParamsGlobais ? '#f1f5f9' : undefined, color: usarParamsGlobais ? '#94a3b8' : undefined }}
          step="0.1" value={usarParamsGlobais ? params.imposto_pct : item.imposto_pct} onChange={e=>{ if(!usarParamsGlobais) onSet('imposto_pct', e.target.value); }} readOnly={usarParamsGlobais} />
      </td>
      {/* ── CALCULADOS ── */}
      {/* Custo c/Imp. Unit — OCULTO para vendedor */}
      <td style={{ padding:'4px 6px', minWidth:100, textAlign:'right', fontSize:9, color:'#0f766e', fontWeight:600, ...H }}>{fmtR(custoUnitBrl)}</td>
      {/* Custo Total — OCULTO para vendedor */}
      <td style={{ padding:'4px 6px', minWidth:100, textAlign:'right', fontSize:9, color:'#0f766e', ...H }}>{fmtR(custoTotal)}</td>
      {/* Valor Unit. — visível para todos */}
      <td style={{ padding:'4px 6px', minWidth:100, textAlign:'right', fontSize:9, color:'#1d4ed8', fontWeight:600 }}>{fmtR(valorUnit)}</td>
      {/* Valor Total — visível para todos */}
      <td style={{ padding:'4px 6px', minWidth:100, textAlign:'right', fontSize:9, color:'#1d4ed8', fontWeight:700 }}>{fmtR(valorTotal)}</td>
      {/* DIFAL Total — OCULTO para vendedor */}
      <td style={{ padding:'4px 6px', minWidth:80, textAlign:'right', fontSize:9, color:'#b45309', ...H }}>{fmtR(totalDifal)}</td>
      {/* Imposto — OCULTO para vendedor */}
      <td style={{ padding:'4px 6px', minWidth:80, textAlign:'right', fontSize:9, color:'#9d174d', ...H }}>{fmtR(totalImposto)}</td>
      {/* Lucro% — OCULTO para vendedor */}
      <td style={{ padding:'4px 6px', minWidth:80, textAlign:'right', fontSize:9, fontWeight:800, color: lucroColor, ...H }}>{fmtPct(lucroPct)}</td>
      {/* Remover */}
      <td style={{ padding:'4px 4px', textAlign:'center' }}>
        <button onClick={onRemove}
          style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'2px 6px', fontSize:9, cursor:'pointer' }}>
          ✕
        </button>
      </td>
    </tr>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function FormacaoPrecosTab({ currentUser }) {
  const [params, setParams]       = useState({ ...PARAMS_PADRAO });
  const [itens, setItens]         = useState([novoItem()]);
  const [usarGlobais, setUsarGlobais] = useState(true);
  const [modelos, setModelos]     = useState([]);
  const [modalSalvar, setModalSalvar]     = useState(false);
  const [modalCarregar, setModalCarregar] = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [nomeCotacao, setNomeCotacao] = useState('');
  const [empresa, setEmpresa]             = useState('ACN');
  const [plataformas, setPlataformas]     = useState([]);
  const [plataformaSelecionada, setPlataformaSelecionada] = useState(null);

  // Perfil vendedor — vê versão simplificada (sem custos, markup, margem)
  const isVendedor = ['Comercial', 'Licitações', 'CRM'].includes(currentUser?.perfil);

  const setP = (k, v) => setParams(p => ({ ...p, [k]: v }));

  // Carrega plataformas ativas da tabela plataformas_licitacao
  useEffect(() => {
    supabase.from('plataformas_licitacao').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => setPlataformas(data || []));
  }, []);

  // Computed results per item (apply global DIFAL/Imposto when usarGlobais=true)
  const paramEfetivo = (item) => usarGlobais
    ? { ...item, difal_pct: params.difal_pct, imposto_pct: params.imposto_pct, custo_fixo_pct: params.custo_fixo_pct }
    : item;

  const results = itens.map(it => calcItem(paramEfetivo(it), params));

  // Totals
  const lote       = Number(params.lote_qtd) || 1;
  const totVendas  = results.reduce((s, r) => s + r.valorTotal,    0);
  const totCustos  = results.reduce((s, r) => s + r.custoTotal,    0);
  const totDifal   = results.reduce((s, r) => s + r.totalDifal,    0);
  const totImposto = results.reduce((s, r) => s + r.totalImposto,  0);
  const totMargem  = results.reduce((s, r) => s + r.margem,        0);
  const lucroGeral = (totVendas - totDifal) > 0 ? totMargem / (totVendas - totDifal) * 100 : 0;

  // Plataforma
  const descontoPlatPct  = Number(plataformaSelecionada?.desconto_pct) || 0;
  const retencaoPlatPct  = Number(plataformaSelecionada?.retencao_pct) || 0;
  const descontoPlat     = totVendas * descontoPlatPct / 100;
  const retencaoPlat     = totVendas * retencaoPlatPct / 100;
  const totalLiquidoPlat = totVendas - descontoPlat - retencaoPlat;

  const addItem  = () => setItens(p => [...p, novoItem()]);
  const remItem  = (id) => setItens(p => p.filter(x => x._id !== id));
  const setItem  = (id, k, v) => setItens(p => p.map(x => x._id === id ? { ...x, [k]: v } : x));

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    setModelos(data || []);
    setCarregando(false);
  }, []);

  const salvarModelo = async (nome, tipo) => {
    setSalvando(true);
    const { error } = await supabase.from('cotacoes_precos').insert([{
      nome,
      tipo,
      empresa,
      plataforma_id: plataformaSelecionada?.id || null,
      parametros_globais: params,
      itens: itens.map(({ _id, ...rest }) => rest),
      criado_por: currentUser?.nome || 'Sistema',
    }]);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      alert('✅ Modelo salvo!');
      setModalSalvar(false);
      carregarModelos();
    }
    setSalvando(false);
  };

  const carregarModelo = (m) => {
    setParams(m.parametros_globais || { ...PARAMS_PADRAO });
    setItens((m.itens || []).map(x => ({ ...x, _id: Math.random().toString(36).slice(2) })));
    setNomeCotacao(m.nome);
    if (m.empresa) setEmpresa(m.empresa);
    if (m.plataforma_id && plataformas.length > 0) {
      setPlataformaSelecionada(plataformas.find(x => x.id === m.plataforma_id) || null);
    } else {
      setPlataformaSelecionada(null);
    }
    setModalCarregar(false);
  };

  const excluirModelo = async (id) => {
    if (!confirm('Excluir este modelo?')) return;
    await supabase.from('cotacoes_precos').delete().eq('id', id);
    carregarModelos();
  };

  const novaQuotacao = () => {
    if (!confirm('Limpar cotação atual e iniciar nova?')) return;
    setParams({ ...PARAMS_PADRAO });
    setItens([novoItem()]);
    setNomeCotacao('');
    setEmpresa('ACN');
    setPlataformaSelecionada(null);
  };

  const duplicarItem = (id) => {
    const idx = itens.findIndex(x => x._id === id);
    if (idx === -1) return;
    const clone = { ...itens[idx], _id: Math.random().toString(36).slice(2) };
    const novos = [...itens];
    novos.splice(idx + 1, 0, clone);
    setItens(novos);
  };

  const thStyle = {
    padding: '5px 6px', background: '#1e293b', color: '#fff',
    fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center',
  };
  const lucroGeralColor = lucroGeral >= 10 ? '#16a34a' : lucroGeral >= 5 ? '#d97706' : '#dc2626';

  return (
    <div style={{ padding:14, fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#f8fafc' }}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>📊 Formação de Preços</div>
          {nomeCotacao && <div style={{ fontSize:10, color:'#64748b', marginTop:2 }}>Modelo: <strong>{nomeCotacao}</strong></div>}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className="acn-btn" style={{ background:'#0891b2', fontSize:10 }}
            onClick={() => { setModalCarregar(true); carregarModelos(); }}>
            📂 Carregar Modelo
          </button>
          <button className="acn-btn" style={{ background:'#16a34a', fontSize:10 }}
            onClick={() => setModalSalvar(true)}>
            💾 Salvar Modelo
          </button>
          <button className="acn-btn" style={{ background:'#7c3aed', fontSize:10 }}
            onClick={addItem}>
            + Adicionar Item
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10 }}
            onClick={novaQuotacao}>
            🗒️ Nova Cotação
          </button>
        </div>
      </div>

      {/* ── EMPRESA + PLATAFORMA ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12, marginBottom:12, display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-end' }}>
        {/* Empresa (ACN / DETECH) */}
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4, textTransform:'uppercase' }}>🏢 Empresa</div>
          <div style={{ display:'flex', gap:4 }}>
            {['ACN', 'DETECH'].map(emp => (
              <button key={emp} className="acn-btn"
                style={{ background: empresa===emp ? '#1e293b' : '#e2e8f0', color: empresa===emp ? '#fff' : '#374151', fontSize:10, minWidth:64 }}
                onClick={() => setEmpresa(emp)}>
                {emp}
              </button>
            ))}
          </div>
        </div>
        {/* Plataforma */}
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4, textTransform:'uppercase' }}>🏪 Plataforma</div>
          <select className="acn-input" style={{ minWidth:200, fontSize:10 }}
            value={plataformaSelecionada?.id || ''}
            onChange={e => setPlataformaSelecionada(plataformas.find(x => x.id === e.target.value) || null)}>
            <option value="">— Sem Plataforma —</option>
            {plataformas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome}{p.desconto_pct ? ` (desc: ${p.desconto_pct}%)` : ''}{p.retencao_pct ? ` (ret: ${p.retencao_pct}%)` : ''}
              </option>
            ))}
          </select>
        </div>
        {/* Resumo plataforma selecionada */}
        {plataformaSelecionada && (
          <div style={{ fontSize:10, background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'6px 12px', display:'flex', gap:12 }}>
            <span style={{ color:'#059669', fontWeight:700 }}>Desconto: {descontoPlatPct}% = {fmtR(descontoPlat)}</span>
            <span style={{ color:'#dc2626', fontWeight:700 }}>Retenção: {retencaoPlatPct}% = {fmtR(retencaoPlat)}</span>
            <span style={{ color:'#0f766e', fontWeight:800 }}>Líquido: {fmtR(totalLiquidoPlat)}</span>
          </div>
        )}
      </div>

      {/* ── PARÂMETROS GLOBAIS ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12, marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:10, color:'#475569', marginBottom:8, textTransform:'uppercase' }}>
          ⚙️ Parâmetros Globais
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          {[
            { label:'PTAX USD (R$)',  k:'ptax_dolar',     w:90,  step:'0.0001' },
            { label:'PTAX EUR (R$)',  k:'ptax_euro',      w:90,  step:'0.0001' },
            { label:'DIFAL %',        k:'difal_pct',      w:70,  step:'0.1' },
            { label:'Imposto %',      k:'imposto_pct',    w:70,  step:'0.1' },
            { label:'Custo Fixo %',  k:'custo_fixo_pct', w:80,  step:'0.1' },
            { label:'Qtd. Lote',      k:'lote_qtd',       w:70,  step:'1' },
          ].map(({ label, k, w, step }) => (
            <div key={k}>
              <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>{label}</div>
              <input type="number" className="acn-input" style={{ width:w, fontSize:10, textAlign:'right' }}
                step={step} value={params[k]}
                onChange={e => setP(k, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2 }}>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
              <input type="checkbox" checked={usarGlobais} onChange={e=>setUsarGlobais(e.target.checked)}
                style={{ accentColor:'#0891b2' }} />
              Aplicar DIFAL/Imposto/CF globais a todos
            </label>
          </div>
        </div>
      </div>

      {/* ── TABELA DE ITENS ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:12, overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1100 }}>
          <thead>
            <tr>
              <th style={{...thStyle, textAlign:'left', minWidth:140}}>Produto / Descrição</th>
              <th style={{...thStyle, minWidth:80}}>Marca</th>
              <th style={{...thStyle, minWidth:50}}>Qt</th>
              <th style={{...thStyle, minWidth:68}}>Moeda</th>
              <th style={{...thStyle, minWidth:76, display: isVendedor ? 'none' : undefined}}>Custo Unit.</th>
              <th style={{...thStyle, minWidth:50, display: isVendedor ? 'none' : undefined}}>IPI%</th>
              <th style={{...thStyle, minWidth:50, display: isVendedor ? 'none' : undefined}}>ST%</th>
              <th style={{...thStyle, minWidth:56, display: isVendedor ? 'none' : undefined}}>Markup%</th>
              <th style={{...thStyle, minWidth:50, background: usarGlobais ? '#334155' : '#1e293b', display: isVendedor ? 'none' : undefined}}>DIFAL%</th>
              <th style={{...thStyle, minWidth:50, background: usarGlobais ? '#334155' : '#1e293b', display: isVendedor ? 'none' : undefined}}>Imposto%</th>
              <th style={{...thStyle, minWidth:100, background:'#065f46', display: isVendedor ? 'none' : undefined}}>Custo c/Imp. Unit</th>
              <th style={{...thStyle, minWidth:100, background:'#065f46', display: isVendedor ? 'none' : undefined}}>Custo Total</th>
              <th style={{...thStyle, minWidth:100, background:'#1e40af'}}>Valor Unit.</th>
              <th style={{...thStyle, minWidth:100, background:'#1e40af'}}>Valor Total</th>
              <th style={{...thStyle, minWidth:80, background:'#92400e', display: isVendedor ? 'none' : undefined}}>DIFAL Total</th>
              <th style={{...thStyle, minWidth:80, background:'#831843', display: isVendedor ? 'none' : undefined}}>Imposto</th>
              <th style={{...thStyle, minWidth:70, display: isVendedor ? 'none' : undefined}}>Lucro%</th>
              <th style={{...thStyle, minWidth:36}}>✕</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 && (
              <tr>
                <td colSpan={isVendedor ? 7 : 18} style={{ textAlign:'center', color:'#9ca3af', fontSize:11, padding:24 }}>
                  Nenhum item. Clique em <strong>+ Adicionar Item</strong>.
                </td>
              </tr>
            )}
            {itens.map((item, idx) => (
              <ItemRow
                key={item._id}
                item={paramEfetivo(item)}
                result={results[idx]}
                onSet={(k, v) => setItem(item._id, k, v)}
                onRemove={() => remItem(item._id)}
                usarParamsGlobais={usarGlobais}
                params={params}
                isVendedor={isVendedor}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── PAINEL DE TOTAIS ── */}
      {itens.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8, marginBottom:12 }}>
          {[
            { label:'Total de Vendas',                        value: fmtR(totVendas),    bg:'#1e40af', color:'#fff', hide: false },
            { label:'Total de Custos',                        value: fmtR(totCustos),    bg:'#065f46', color:'#fff', hide: isVendedor },
            { label:'Total DIFAL',                            value: fmtR(totDifal),     bg:'#92400e', color:'#fff', hide: isVendedor },
            { label:'Total Impostos',                         value: fmtR(totImposto),   bg:'#831843', color:'#fff', hide: false },
            { label:'Margem Real Total',                      value: fmtR(totMargem),    bg: totMargem >= 0 ? '#166534' : '#991b1b', color:'#fff', hide: isVendedor },
            { label:'Lucro % Geral',                          value: fmtPct(lucroGeral), bg: lucroGeralColor, color:'#fff', hide: isVendedor },
            ...(plataformaSelecionada ? [
              { label:`Desconto ${plataformaSelecionada.nome} (${descontoPlatPct}%)`, value: fmtR(descontoPlat),     bg:'#0891b2', color:'#fff', hide: false },
              { label:`Retenção ${plataformaSelecionada.nome} (${retencaoPlatPct}%)`, value: fmtR(retencaoPlat),     bg:'#7c3aed', color:'#fff', hide: false },
              { label:'Valor Líquido c/ Plataforma',                                  value: fmtR(totalLiquidoPlat), bg:'#0f766e', color:'#fff', hide: false },
            ] : []),
          ].filter(x => !x.hide).map(({ label, value, bg, color }) => (
            <div key={label} style={{ background:bg, color, borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:9, opacity:.85, marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:14, fontWeight:800 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TOTAIS POR LOTE ── */}
      {itens.length > 0 && lote > 1 && (
        <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:12, marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:11, color:'#0369a1', marginBottom:6 }}>
            📦 Totais para {lote} unidade{lote !== 1 ? 's' : ''} (Lote)
          </div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:11 }}>Vendas: <strong>{fmtR(totVendas * lote)}</strong></span>
            <span style={{ fontSize:11 }}>Custos: <strong>{fmtR(totCustos * lote)}</strong></span>
            <span style={{ fontSize:11 }}>DIFAL: <strong>{fmtR(totDifal * lote)}</strong></span>
            <span style={{ fontSize:11 }}>Margem: <strong style={{ color: totMargem >= 0 ? '#16a34a' : '#dc2626' }}>{fmtR(totMargem * lote)}</strong></span>
          </div>
        </div>
      )}

      {/* ── CALCULADORAS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        <CalcMarkupReverso />
        <CalcImpostoReverso />
      </div>

      {/* ── OBSERVAÇÕES / NOTAS DA COTAÇÃO ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12 }}>
        <div style={{ fontWeight:700, fontSize:10, color:'#475569', marginBottom:6, textTransform:'uppercase' }}>
          📝 Observações da Cotação
        </div>
        <textarea className="acn-input" style={{ width:'100%', height:80, resize:'vertical', fontSize:10 }}
          placeholder="Condições comerciais, validade da proposta, notas sobre o lote..."
          value={nomeCotacao !== '' ? '' : ''}
        />
      </div>

      {/* ── MODAIS ── */}
      {modalSalvar && (
        <ModalSalvar
          onSalvar={salvarModelo}
          onClose={() => setModalSalvar(false)}
          salvando={salvando}
        />
      )}
      {modalCarregar && (
        <ModalCarregar
          modelos={modelos}
          carregando={carregando}
          onCarregar={carregarModelo}
          onExcluir={excluirModelo}
          onClose={() => setModalCarregar(false)}
        />
      )}
    </div>
  );
}
