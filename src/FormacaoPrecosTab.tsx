// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MOEDAS = ['REAL', 'DOLAR', 'EURO'];

const PARAMS_PADRAO = {
  ptax_dolar:     5.85,
  ptax_euro:      6.40,
  difal_pct:      16,
  imposto_pct:    16,
  custo_fixo_pct: 3,
  lote_qtd:       1,
  markup_pct:     100,
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
    markup_pct:     100,
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

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const fmtR = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};

// ─── OP AUTOCOMPLETE ──────────────────────────────────────────────────────────
function OplAutocomplete({ value, onSelect }) {
  const [query, setQuery]       = useState(value?.opl || '');
  const [resultados, setRes]    = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef(null);

  useEffect(() => {
    if (value) setQuery(value.opl);
    else setQuery('');
  }, [value]);

  const buscar = (texto) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .or(`opl.ilike.%${texto}%,cliente_nome.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (op) => {
    setQuery(op.opl);
    setAberto(false);
    setRes([]);
    onSelect(op);
  };

  const limpar = () => {
    setQuery('');
    setRes([]);
    setAberto(false);
    onSelect(null);
  };

  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <input className="acn-input" style={{ fontSize:10, width:200 }}
          placeholder="Buscar OP/OS por número ou cliente..."
          value={query}
          onChange={e => buscar(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 180)} />
        {value && (
          <button onClick={limpar}
            style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'2px 6px', fontSize:9, cursor:'pointer' }}>
            ✕
          </button>
        )}
        {buscando && <span style={{ fontSize:9, color:'#64748b' }}>...</span>}
      </div>
      {aberto && resultados.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, zIndex:500, background:'#fff',
          border:'1px solid #e2e8f0', borderRadius:6, boxShadow:'0 4px 12px #0002',
          minWidth:280, maxHeight:220, overflowY:'auto' }}>
          {resultados.map(op => (
            <div key={op.id}
              onMouseDown={() => selecionar(op)}
              style={{ padding:'6px 10px', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:10 }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseOut={e  => (e.currentTarget.style.background = '')}>
              <strong style={{ color:'#2563eb' }}>{op.opl}</strong>
              <span style={{ marginLeft:8, color:'#475569' }}>{op.cliente_nome}</span>
              <span style={{ marginLeft:6, fontSize:9, color:'#94a3b8' }}>{op.status_geral}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MODAL DE SALVAR TEMPLATE ─────────────────────────────────────────────────
const NOVO_TIPO_SENTINEL = '___NOVO___';

function ModalSalvar({ onSalvar, onClose, salvando, nomeInicial, tipoInicial, editando }) {
  const [nome, setNome] = useState(nomeInicial || '');
  const [tipo, setTipo] = useState(tipoInicial || '');
  const [tipos, setTipos] = useState([]);
  const [carregandoTipos, setCarregandoTipos] = useState(true);
  const [novoTipoTexto, setNovoTipoTexto] = useState('');
  const [salvandoNovoTipo, setSalvandoNovoTipo] = useState(false);

  // Refresh simples da lista (usado depois de criar um tipo novo) — não mexe
  // na seleção atual, só atualiza as opções disponíveis.
  const carregarTipos = () => {
    supabase.from('formacao_precos_tipos').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => setTipos(data || []));
  };
  // Carga inicial — essa sim escolhe um padrão (o 1º do catálogo) quando é
  // um modelo novo sem tipo pré-definido. Roda só uma vez, no mount.
  useEffect(() => {
    supabase.from('formacao_precos_tipos').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setTipos(data || []);
        setCarregandoTipos(false);
        if (!tipoInicial && (data || []).length > 0) setTipo(data[0].nome);
      });
  }, []);

  const salvarNovoTipo = async () => {
    const nomeNovo = novoTipoTexto.trim();
    if (!nomeNovo) return;
    setSalvandoNovoTipo(true);
    const { data, error } = await supabase.from('formacao_precos_tipos').insert([{ nome: nomeNovo }]).select().single();
    setSalvandoNovoTipo(false);
    if (error) { alert('Erro ao criar tipo: ' + error.message); return; }
    setNovoTipoTexto('');
    setTipo(data.nome);
    carregarTipos();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0007', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:360, padding:20, boxShadow:'0 8px 32px #0003' }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:12 }}>
          {editando ? '✏️ Atualizar Cotação' : '💾 Salvar Modelo de Cotação'}
        </div>
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nome do Modelo *</div>
          <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: PMSC Lote 3 – Nov/2026"
            value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Tipo</div>
          {novoTipoTexto !== '' || tipo === NOVO_TIPO_SENTINEL ? (
            <div style={{ display:'flex', gap:6 }}>
              <input className="acn-input" style={{ flex:1 }} placeholder="Nome do novo tipo"
                value={novoTipoTexto} onChange={e => setNovoTipoTexto(e.target.value)} autoFocus
                onKeyDown={e => e.key === 'Enter' && salvarNovoTipo()} />
              <button className="acn-btn" style={{ background:'#16a34a', padding:'0 10px' }}
                onClick={salvarNovoTipo} disabled={salvandoNovoTipo}>✓</button>
              <button className="acn-btn" style={{ background:'#94a3b8', padding:'0 10px' }}
                onClick={() => { setNovoTipoTexto(''); setTipo(tipos[0]?.nome || ''); }}>✕</button>
            </div>
          ) : (
            <select className="acn-input" style={{ width:'100%' }} value={tipo} disabled={carregandoTipos}
              onChange={e => setTipo(e.target.value)}>
              {carregandoTipos && <option>Carregando...</option>}
              {tipos.map((t: any) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
              <option value={NOVO_TIPO_SENTINEL}>➕ Novo tipo...</option>
            </select>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background: editando ? '#f59e0b' : '#16a34a', flex:1 }}
            onClick={() => { if (!nome.trim()) { alert('Informe o nome.'); return; } if (!tipo || tipo === NOVO_TIPO_SENTINEL) { alert('Informe/selecione o tipo.'); return; } onSalvar(nome.trim(), tipo); }}
            disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'ATUALIZAR' : 'SALVAR'}
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
                  {m.opl_numero ? ` · OP: ${m.opl_numero}` : ''}
                  {m.desconto_maximo_pct > 0 ? ` · Desc.máx: ${m.desconto_maximo_pct}%` : ''}
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

// Aceita tanto "15000" quanto o formato brasileiro "15.000,50" — sem isso,
// parseFloat("15.000") vira 15 (trunca no ponto de milhar) e o resultado
// sai errado por um fator de 1000, sem nenhum aviso ao usuário.
const parseNumBr = (v) => parseFloat(String(v).trim().replace(/\./g, '').replace(',', '.')) || 0;

// ─── CALCULADORA MARKUP REVERSO ───────────────────────────────────────────────
function CalcMarkupReverso() {
  const [precoVenda, setPrecoVenda] = useState('');
  const [custoFob, setCustoFob]     = useState('');
  const [difal, setDifal]           = useState('16');
  const [resultado, setResultado]   = useState(null);

  const calcular = () => {
    const pv = parseNumBr(precoVenda);
    const cf = parseNumBr(custoFob);
    const d  = parseNumBr(difal) / 100;
    if (pv <= 0 || cf <= 0) { alert('Informe preço de venda e custo.'); return; }
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
    const p = parseNumBr(precoComImposto);
    const i = parseNumBr(imposto) / 100;
    if (p <= 0) { alert('Informe o preço com imposto.'); return; }
    const semImposto  = p / (1 + i);
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

// ─── MODAL RÁPIDO: CRIAR NOVO ITEM NO CATÁLOGO ───────────────────────────────
function CriarItemModal({ nomeInicial, onSalvo, onClose }) {
  const [form, setForm] = useState({
    nome: nomeInicial || '', marca: '', fornecedor: '', moeda: 'REAL',
    custo_unit: 0, ipi_pct: 0, st_pct: 0, markup_pct: 30,
    difal_pct: 16, imposto_pct: 16, custo_fixo_pct: 3, unidade: 'UN', ativo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { width:'100%', padding:'4px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:8, fontWeight:700, color:'#6b7280', marginBottom:2, textTransform:'uppercase' };

  const salvar = async () => {
    if (!form.nome?.trim()) return;
    setSalvando(true);
    const { data } = await supabase.from('cadastro_itens').insert([{
      nome: form.nome.trim(), marca: form.marca?.trim() || '', fornecedor: form.fornecedor?.trim() || '',
      moeda: form.moeda || 'REAL', custo_unit: Number(form.custo_unit) || 0,
      ipi_pct: Number(form.ipi_pct) || 0, st_pct: Number(form.st_pct) || 0,
      markup_pct: Number(form.markup_pct) || 30, difal_pct: Number(form.difal_pct) || 16,
      imposto_pct: Number(form.imposto_pct) || 16, custo_fixo_pct: Number(form.custo_fixo_pct) || 3,
      unidade: form.unidade || 'UN', ativo: true,
    }]).select().single();
    setSalvando(false);
    if (data) onSalvo(data);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:480, maxWidth:'96vw', boxShadow:'0 16px 48px rgba(0,0,0,.28)', overflow:'hidden' }}>
        <div style={{ background:'#0f766e', color:'#fff', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:12 }}>➕ Novo Item no Catálogo</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'14px 16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <span style={lbl}>Nome / Produto *</span>
              <input style={{ ...inp, borderColor: !form.nome ? '#f87171' : '#d1d5db' }}
                value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do item" autoFocus />
            </div>
            <div><span style={lbl}>Marca</span><input style={inp} value={form.marca} onChange={e=>set('marca',e.target.value)} placeholder="Ex: Schneider" /></div>
            <div><span style={lbl}>Fornecedor</span><input style={inp} value={form.fornecedor} onChange={e=>set('fornecedor',e.target.value)} placeholder="Fornecedor" /></div>
            <div>
              <span style={lbl}>Moeda</span>
              <select style={inp} value={form.moeda} onChange={e=>set('moeda',e.target.value)}>
                {['REAL','DOLAR','EURO'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><span style={lbl}>Custo Unitário</span><input style={inp} type="number" min={0} step="0.01" value={form.custo_unit} onChange={e=>set('custo_unit',e.target.value)} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
            {[['IPI%','ipi_pct'],['ST%','st_pct'],['Markup%','markup_pct'],['DIFAL%','difal_pct'],['Imposto%','imposto_pct']].map(([l,k])=>(
              <div key={k}><span style={lbl}>{l}</span><input style={inp} type="number" min={0} step="0.5" value={form[k]} onChange={e=>set(k,e.target.value)} /></div>
            ))}
          </div>
        </div>
        <div style={{ padding:'8px 16px 12px', display:'flex', justifyContent:'flex-end', gap:8, borderTop:'1px solid #f1f5f9' }}>
          <button onClick={onClose} style={{ padding:'5px 12px', border:'1px solid #d1d5db', borderRadius:5, background:'#fff', cursor:'pointer', fontSize:10 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !form.nome?.trim()}
            style={{ padding:'5px 14px', border:'none', borderRadius:5, background: form.nome?.trim() ? '#0f766e' : '#9ca3af', color:'#fff', cursor: form.nome?.trim() ? 'pointer' : 'not-allowed', fontSize:10, fontWeight:700, opacity: salvando ? .6 : 1 }}>
            {salvando ? 'Salvando...' : '✅ Salvar e Usar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AUTOCOMPLETE: BUSCA EM CADASTRO_ITENS + CADASTRO_PRODUTOS ────────────────
function ProdutoAutocomplete({ value, onFill, onExpand, params }) {
  const [q, setQ]           = useState(value || '');
  const [res, setRes]       = useState({ itens: [], produtos: [] });
  const [open, setOpen]     = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando]   = useState(false);
  const ref   = useRef(null);
  const deb   = useRef(null);

  // mantém o campo sincronizado quando o item é preenchido externamente (load de modelo)
  useEffect(() => { setQ(value || ''); }, [value]);

  const buscar = (termo) => {
    clearTimeout(deb.current);
    if (!termo.trim()) { setRes({ itens:[], produtos:[] }); setOpen(false); return; }
    deb.current = setTimeout(async () => {
      setBuscando(true);
      const [{ data: itens }, { data: produtos }] = await Promise.all([
        supabase.from('cadastro_itens')
          .select('id,codigo,nome,marca,fornecedor,unidade,moeda,custo_unit,ipi_pct,st_pct,markup_pct,difal_pct,imposto_pct,custo_fixo_pct')
          .eq('ativo', true).ilike('nome', `%${termo}%`).limit(8),
        supabase.from('cadastro_produtos')
          .select('id,codigo,nome,categoria,unidade,preco_venda,markup_pct,difal_pct,imposto_pct,custo_fixo_pct')
          .eq('ativo', true).ilike('nome', `%${termo}%`).limit(5),
      ]);
      setRes({ itens: itens || [], produtos: produtos || [] });
      setOpen(true);
      setBuscando(false);
    }, 260);
  };

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // normaliza moeda do catálogo (USD/EUR) para o padrão do FormacaoPrecos (DOLAR/EURO)
  const normMoeda = (m) => m === 'USD' ? 'DOLAR' : m === 'EUR' ? 'EURO' : m || 'REAL';

  const selecionarItem = (it) => {
    onFill({
      produto: it.nome, marca: it.marca || '', fornecedor: it.fornecedor || '',
      moeda: normMoeda(it.moeda), custo_unit: it.custo_unit || 0,
      ipi_pct: it.ipi_pct || 0, st_pct: it.st_pct || 0,
      markup_pct: it.markup_pct ?? 30, difal_pct: it.difal_pct ?? 16,
      imposto_pct: it.imposto_pct ?? 16, custo_fixo_pct: it.custo_fixo_pct ?? 3,
    });
    setQ(it.nome); setOpen(false);
  };

  const selecionarProdutoKit = (p) => {
    onFill({
      produto: p.nome, marca: '', fornecedor: '', moeda: 'REAL',
      custo_unit: p.preco_venda || 0, ipi_pct: 0, st_pct: 0,
      markup_pct: 0, difal_pct: p.difal_pct ?? 16,
      imposto_pct: p.imposto_pct ?? 16, custo_fixo_pct: p.custo_fixo_pct ?? 3,
    });
    setQ(p.nome); setOpen(false);
  };

  const expandirBom = async (p) => {
    const { data: bom } = await supabase
      .from('cadastro_produtos_itens')
      .select('*, cadastro_itens(nome,marca,fornecedor,moeda,custo_unit,ipi_pct,st_pct,markup_pct,difal_pct,imposto_pct,custo_fixo_pct)')
      .eq('produto_id', p.id).order('ordem');
    setOpen(false);
    if (!bom || bom.length === 0) { selecionarProdutoKit(p); return; }
    const linhas = bom.map(l => {
      const it = l.cadastro_itens || {};
      return {
        produto: l.item_nome || it.nome || '', marca: it.marca || '', fornecedor: it.fornecedor || '',
        moeda: normMoeda(it.moeda), qt: Number(l.quantidade) || 1,
        custo_unit: it.custo_unit || 0, ipi_pct: it.ipi_pct || 0, st_pct: it.st_pct || 0,
        markup_pct: it.markup_pct ?? p.markup_pct ?? 30,
        difal_pct: it.difal_pct ?? p.difal_pct ?? 16,
        imposto_pct: it.imposto_pct ?? p.imposto_pct ?? 16,
        custo_fixo_pct: it.custo_fixo_pct ?? p.custo_fixo_pct ?? 3,
      };
    });
    onExpand(linhas);
  };

  const temResultados = res.itens.length > 0 || res.produtos.length > 0;

  return (
    <div ref={ref} style={{ position:'relative', width:'100%' }}>
      <input
        className="acn-input"
        style={{ width:'100%', fontSize:9, padding:'2px 4px' }}
        placeholder="Descrição do item"
        value={q}
        onChange={e => { setQ(e.target.value); onFill({ produto: e.target.value }); buscar(e.target.value); }}
        onFocus={() => { if (temResultados) setOpen(true); }}
      />
      {buscando && (
        <div style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', fontSize:8, color:'#9ca3af' }}>⏳</div>
      )}
      {open && (
        <div style={{
          position:'absolute', top:'100%', left:0, zIndex:2000, minWidth:320, maxWidth:420,
          background:'#fff', border:'1px solid #e2e8f0', borderRadius:8,
          boxShadow:'0 8px 28px rgba(0,0,0,.18)', maxHeight:320, overflowY:'auto',
        }}>
          {/* ── Itens do catálogo ── */}
          {res.itens.length > 0 && (
            <>
              <div style={{ padding:'4px 8px', fontSize:8, fontWeight:800, color:'#0f766e', background:'#f0fdf4', textTransform:'uppercase', letterSpacing:'.5px' }}>
                📦 Itens do Catálogo
              </div>
              {res.itens.map(it => (
                <div key={it.id}
                  onClick={() => selecionarItem(it)}
                  style={{ padding:'6px 10px', cursor:'pointer', borderBottom:'1px solid #f8fafc', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff'}
                >
                  <div>
                    <div style={{ fontWeight:600, fontSize:10 }}>{it.nome}</div>
                    <div style={{ fontSize:8, color:'#9ca3af' }}>
                      {[it.marca, it.fornecedor].filter(Boolean).join(' · ')} {it.codigo ? `· ${it.codigo}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#0f766e' }}>
                      R$ {Number(it.custo_unit||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </div>
                    <div style={{ fontSize:8, color:'#9ca3af' }}>{it.moeda} · {it.unidade}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Produtos compostos ── */}
          {res.produtos.length > 0 && (
            <>
              <div style={{ padding:'4px 8px', fontSize:8, fontWeight:800, color:'#7c3aed', background:'#faf5ff', textTransform:'uppercase', letterSpacing:'.5px' }}>
                🏭 Produtos Compostos (BOM)
              </div>
              {res.produtos.map(p => (
                <div key={p.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                  <div style={{ padding:'6px 10px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:10 }}>{p.nome}</div>
                      <div style={{ fontSize:8, color:'#9ca3af' }}>{p.categoria || ''} {p.codigo ? `· ${p.codigo}` : ''}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {p.preco_venda > 0 && (
                        <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed' }}>
                          R$ {Number(p.preco_venda||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* botões de ação para produto */}
                  <div style={{ display:'flex', gap:0, borderTop:'1px solid #f3f4f6' }}>
                    <button
                      onClick={() => selecionarProdutoKit(p)}
                      style={{ flex:1, padding:'4px 6px', border:'none', background:'#faf5ff', cursor:'pointer', fontSize:8, fontWeight:700, color:'#7c3aed', borderRight:'1px solid #ede9fe' }}
                    >
                      📦 Inserir como kit (1 linha)
                    </button>
                    <button
                      onClick={() => expandirBom(p)}
                      style={{ flex:1, padding:'4px 6px', border:'none', background:'#faf5ff', cursor:'pointer', fontSize:8, fontWeight:700, color:'#6d28d9' }}
                    >
                      🔩 Expandir componentes BOM
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Nenhum resultado ── */}
          {!buscando && !temResultados && q.trim() && (
            <div style={{ padding:'8px 10px', fontSize:9, color:'#9ca3af', textAlign:'center' }}>
              Nenhum item encontrado para "{q}"
            </div>
          )}

          {/* ── Criar novo ── */}
          <div
            onClick={() => { setOpen(false); setCriando(true); }}
            style={{ padding:'7px 10px', cursor:'pointer', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:6, background:'#fafafa' }}
            onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
            onMouseLeave={e=>e.currentTarget.style.background='#fafafa'}
          >
            <span style={{ fontSize:12 }}>➕</span>
            <span style={{ fontSize:9, fontWeight:700, color:'#0f766e' }}>
              Criar "{q.trim() || 'novo item'}" no catálogo
            </span>
          </div>
        </div>
      )}

      {/* Modal criar novo item */}
      {criando && (
        <CriarItemModal
          nomeInicial={q}
          onSalvo={(item) => { selecionarItem(item); setCriando(false); }}
          onClose={() => setCriando(false)}
        />
      )}
    </div>
  );
}

// ─── LINHA DE ITEM ────────────────────────────────────────────────────────────
function ItemRow({ item, result, onSet, onFill, onExpand, onRemove, usarParamsGlobais, usarMarkupGlobal, params, isVendedor }) {
  const { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct } = result;
  const lucroColor = lucroPct >= 10 ? '#16a34a' : lucroPct >= 5 ? '#d97706' : '#dc2626';
  const [aberto, setAberto] = useState(false);

  // estilos base reutilizáveis
  const inp11 = { fontSize:11, padding:'5px 7px' };
  const inp11r = { ...inp11, textAlign:'right' as const };
  const globStyle = (extra={}) => ({
    ...inp11r, ...extra,
    background: usarParamsGlobais ? '#f1f5f9' : undefined,
    color:      usarParamsGlobais ? '#94a3b8' : undefined,
  });

  // Vendedor não vê custo/impostos/markup — não há nada pra expandir.
  const temDetalhe = !isVendedor;

  return (
    <>
      <tr style={{ borderBottom: aberto ? 'none' : '1px solid #e8ecf0' }}>
        {/* Produto */}
        <td style={{ padding:'6px 8px', minWidth:180, position:'relative' }}>
          <ProdutoAutocomplete
            value={item.produto}
            params={params}
            onFill={dados => onFill(dados)}
            onExpand={linhas => onExpand(linhas)}
          />
        </td>
        {/* Marca */}
        <td style={{ padding:'6px 6px', minWidth:90 }}>
          <input className="acn-input" style={{ width:'100%', ...inp11 }}
            placeholder="Marca" value={item.marca} onChange={e=>onSet('marca',e.target.value)} />
        </td>
        {/* Qt */}
        <td style={{ padding:'6px 6px', width:54 }}>
          <input type="number" className="acn-input" style={{ width:48, ...inp11r }}
            min={1} value={item.qt} onChange={e=>onSet('qt', e.target.value)} />
        </td>
        {/* Valor Unit (calculado) */}
        <td style={{ padding:'6px 8px', width:100, textAlign:'right', fontSize:11, color:'#1d4ed8', fontWeight:600 }}>{fmtR(valorUnit)}</td>
        {/* Valor Total (calculado) */}
        <td style={{ padding:'6px 8px', width:110, textAlign:'right', fontSize:12, color:'#1d4ed8', fontWeight:800 }}>{fmtR(valorTotal)}</td>
        {/* Toggle detalhe */}
        <td style={{ padding:'6px 4px', width:28, textAlign:'center' }}>
          {temDetalhe && (
            <button onClick={() => setAberto(v => !v)} title="Custo, impostos e markup"
              style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', padding:2 }}>
              {aberto ? '▾' : '▸'}
            </button>
          )}
        </td>
        {/* Remover */}
        <td style={{ padding:'6px 6px', width:32, textAlign:'center' }}>
          <button onClick={onRemove}
            style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'4px 7px', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            ✕
          </button>
        </td>
      </tr>
      {aberto && temDetalhe && (
        <tr style={{ borderBottom:'1px solid #e8ecf0', background:'#f8fafc' }}>
          <td colSpan={7} style={{ padding:'8px 12px' }}>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>Moeda</div>
                <select className="acn-input" style={{ width:78, ...inp11 }}
                  value={item.moeda} onChange={e=>onSet('moeda', e.target.value)}>
                  {MOEDAS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>Custo Unit.</div>
                <input type="number" className="acn-input" style={{ width:88, ...inp11r }}
                  min={0} step="0.01" value={item.custo_unit} onChange={e=>onSet('custo_unit', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>IPI%</div>
                <input type="number" className="acn-input" style={{ width:56, ...inp11r }}
                  min={0} step="0.1" value={item.ipi_pct} onChange={e=>onSet('ipi_pct', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>ST%</div>
                <input type="number" className="acn-input" style={{ width:56, ...inp11r }}
                  min={0} step="0.1" value={item.st_pct} onChange={e=>onSet('st_pct', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>Markup%</div>
                <input type="number" className="acn-input"
                  style={{ width:60, ...inp11r,
                    background: usarMarkupGlobal ? '#f3e8ff' : item.markup_pct < 0 ? '#fee2e2' : undefined,
                    color: usarMarkupGlobal ? '#7c3aed' : undefined }}
                  step="0.1" value={item.markup_pct}
                  onChange={e=>{ if(!usarMarkupGlobal) onSet('markup_pct', e.target.value); }}
                  readOnly={!!usarMarkupGlobal} />
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>DIFAL%</div>
                <input type="number" className="acn-input"
                  style={{ width:56, ...globStyle() }}
                  step="0.1" value={usarParamsGlobais ? params.difal_pct : item.difal_pct}
                  onChange={e=>{ if(!usarParamsGlobais) onSet('difal_pct', e.target.value); }}
                  readOnly={usarParamsGlobais} />
              </div>
              <div>
                <div style={{ fontSize:8, color:'#64748b', marginBottom:2 }}>Imposto%</div>
                <input type="number" className="acn-input"
                  style={{ width:60, ...globStyle() }}
                  step="0.1" value={usarParamsGlobais ? params.imposto_pct : item.imposto_pct}
                  onChange={e=>{ if(!usarParamsGlobais) onSet('imposto_pct', e.target.value); }}
                  readOnly={usarParamsGlobais} />
              </div>
              <div style={{ borderLeft:'1px solid #e2e8f0', paddingLeft:14, display:'flex', gap:14, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:8, color:'#64748b' }}>Custo c/Imp. Unit</div>
                  <div style={{ fontSize:11, color:'#0f766e', fontWeight:600 }}>{fmtR(custoUnitBrl)}</div>
                </div>
                <div>
                  <div style={{ fontSize:8, color:'#64748b' }}>Custo Total</div>
                  <div style={{ fontSize:11, color:'#0f766e' }}>{fmtR(custoTotal)}</div>
                </div>
                <div>
                  <div style={{ fontSize:8, color:'#64748b' }}>DIFAL Total</div>
                  <div style={{ fontSize:11, color:'#b45309' }}>{fmtR(totalDifal)}</div>
                </div>
                <div>
                  <div style={{ fontSize:8, color:'#64748b' }}>Imposto Total</div>
                  <div style={{ fontSize:11, color:'#9d174d' }}>{fmtR(totalImposto)}</div>
                </div>
                <div>
                  <div style={{ fontSize:8, color:'#64748b' }}>Lucro%</div>
                  <div style={{ fontSize:12, fontWeight:800, color: lucroColor }}>{fmtPct(lucroPct)}</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── ABA PREÇOS FORMADOS (Vendedores + Todos) ─────────────────────────────────
function AbaPrecoFormados({ currentUser, isVendedor, onEditar, onClonar }) {
  const [cotacoes, setCotacoes]         = useState([]);
  const [carregando, setCarregando]     = useState(true);
  const [cotacaoAberta, setAberta]      = useState(null);
  const [desconto, setDesconto]         = useState(0);
  const [obs, setObs]                   = useState('');
  const [salvando, setSalvando]         = useState(false);
  const [propostas, setPropostas]       = useState([]);

  const carregarCotacoes = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    setCotacoes(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => { carregarCotacoes(); }, [carregarCotacoes]);

  const abrirCotacao = async (m) => {
    setAberta(m);
    setDesconto(0);
    setObs('');
    const { data } = await supabase.from('cotacoes_propostas')
      .select('*').eq('cotacao_id', m.id).order('criado_em', { ascending: false });
    setPropostas(data || []);
  };

  const salvarProposta = async () => {
    if (!cotacaoAberta) return;
    const maxDesc = Number(cotacaoAberta.desconto_maximo_pct) || 0;
    if (desconto > maxDesc) { alert(`Desconto máximo permitido é ${maxDesc}%.`); return; }
    setSalvando(true);
    const prms  = cotacaoAberta.parametros_globais || {};
    const items = (cotacaoAberta.itens || []);
    const results = items.map(it => calcItem(it, prms));
    const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);
    const valorComDesconto = totVendas * (1 - desconto / 100);
    const { error } = await supabase.from('cotacoes_propostas').insert([{
      cotacao_id:          cotacaoAberta.id,
      cotacao_nome:        cotacaoAberta.nome,
      opl_numero:          cotacaoAberta.opl_numero || null,
      desconto_pct:        desconto,
      valor_total:         totVendas,
      valor_com_desconto:  valorComDesconto,
      criado_por:          currentUser?.nome,
      observacoes:         obs,
    }]);
    if (error) { alert('Erro: ' + error.message); }
    else {
      alert('✅ Proposta salva!');
      const { data } = await supabase.from('cotacoes_propostas')
        .select('*').eq('cotacao_id', cotacaoAberta.id).order('criado_em', { ascending: false });
      setPropostas(data || []);
    }
    setSalvando(false);
  };

  // ── Detalhe de cotação aberta ──
  if (cotacaoAberta) {
    const prms  = cotacaoAberta.parametros_globais || {};
    const items = (cotacaoAberta.itens || []).map(it => ({ ...it, _id: Math.random().toString(36).slice(2) }));
    const results  = items.map(it => calcItem(it, prms));
    const totVendas  = results.reduce((s, r) => s + r.valorTotal, 0);
    const totImposto = results.reduce((s, r) => s + r.totalImposto, 0);
    const totDifal   = results.reduce((s, r) => s + r.totalDifal, 0);
    const maxDesc    = Number(cotacaoAberta.desconto_maximo_pct) || 0;
    const descontoValor    = totVendas * desconto / 100;
    const valorComDesconto = totVendas * (1 - desconto / 100);

    return (
      <div style={{ padding:14, fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#f8fafc' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button className="acn-btn" style={{ background:'#64748b', fontSize:10 }} onClick={() => setAberta(null)}>← Voltar</button>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:'#1e293b' }}>{cotacaoAberta.nome}</div>
            <div style={{ fontSize:10, color:'#64748b' }}>
              {cotacaoAberta.tipo} · {cotacaoAberta.empresa}
              {cotacaoAberta.opl_numero ? ` · OP: ${cotacaoAberta.opl_numero}` : ''}
              {' '}· por {cotacaoAberta.criado_por}
              {maxDesc > 0 ? <span style={{ marginLeft:8, color:'#dc2626', fontWeight:700 }}>Desc.máx: {maxDesc}%</span> : ''}
            </div>
          </div>
        </div>

        {/* Tabela de itens */}
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:12, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding:'5px 8px', background:'#1e293b', color:'#fff', fontSize:9, textAlign:'left' }}>Produto / Descrição</th>
                <th style={{ padding:'5px 8px', background:'#1e293b', color:'#fff', fontSize:9, textAlign:'center' }}>Qt</th>
                {!isVendedor && <th style={{ padding:'5px 8px', background:'#065f46', color:'#fff', fontSize:9, textAlign:'right' }}>Custo Unit.</th>}
                {!isVendedor && <th style={{ padding:'5px 8px', background:'#065f46', color:'#fff', fontSize:9, textAlign:'right' }}>Custo Total</th>}
                {!isVendedor && <th style={{ padding:'5px 8px', background:'#92400e', color:'#fff', fontSize:9, textAlign:'right' }}>DIFAL</th>}
                <th style={{ padding:'5px 8px', background:'#1e40af', color:'#fff', fontSize:9, textAlign:'right' }}>Valor Unit.</th>
                <th style={{ padding:'5px 8px', background:'#1e40af', color:'#fff', fontSize:9, textAlign:'right' }}>Valor Total</th>
                <th style={{ padding:'5px 8px', background:'#831843', color:'#fff', fontSize:9, textAlign:'right' }}>Imposto</th>
                {!isVendedor && <th style={{ padding:'5px 8px', background:'#1e293b', color:'#fff', fontSize:9, textAlign:'right' }}>Lucro%</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const r = results[idx];
                const lucroColor = r.lucroPct >= 10 ? '#16a34a' : r.lucroPct >= 5 ? '#d97706' : '#dc2626';
                return (
                  <tr key={item._id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'5px 8px', fontSize:10 }}>
                      {item.produto || '—'}{item.marca ? <span style={{ color:'#94a3b8' }}> ({item.marca})</span> : ''}
                    </td>
                    <td style={{ padding:'5px 8px', fontSize:10, textAlign:'center' }}>{item.qt}</td>
                    {!isVendedor && <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#0f766e' }}>{fmtR(r.custoUnitBrl)}</td>}
                    {!isVendedor && <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#0f766e' }}>{fmtR(r.custoTotal)}</td>}
                    {!isVendedor && <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#b45309' }}>{fmtR(r.totalDifal)}</td>}
                    <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#1d4ed8', fontWeight:600 }}>{fmtR(r.valorUnit)}</td>
                    <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#1d4ed8', fontWeight:700 }}>{fmtR(r.valorTotal)}</td>
                    <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', color:'#9d174d' }}>{fmtR(r.totalImposto)}</td>
                    {!isVendedor && <td style={{ padding:'5px 8px', fontSize:10, textAlign:'right', fontWeight:800, color:lucroColor }}>{fmtPct(r.lucroPct)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totais + simulação de desconto */}
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:14, marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:11, color:'#475569', marginBottom:10, textTransform:'uppercase' }}>💰 Simulação de Desconto</div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>Total de Vendas</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#1e40af' }}>{fmtR(totVendas)}</div>
            </div>
            <div>
              <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>Total Impostos</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#831843' }}>{fmtR(totImposto)}</div>
            </div>
            {!isVendedor && (
              <div>
                <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>Total DIFAL</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#92400e' }}>{fmtR(totDifal)}</div>
              </div>
            )}
            <div style={{ borderLeft:'1px solid #e2e8f0', paddingLeft:20 }}>
              <div style={{ fontSize:9, color:'#64748b', marginBottom:4 }}>
                Desconto % &nbsp;
                {maxDesc > 0
                  ? <span>(máx autorizado: <strong style={{ color:'#dc2626' }}>{maxDesc}%</strong>)</span>
                  : <span style={{ color:'#94a3b8' }}>(sem desconto definido)</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="number" className="acn-input" style={{ width:80, fontSize:12, textAlign:'right' }}
                  min={0} max={maxDesc > 0 ? maxDesc : 100} step="0.1" value={desconto}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setDesconto(maxDesc > 0 ? Math.min(v, maxDesc) : v);
                  }} />
                <span style={{ fontSize:11, color:'#64748b' }}>%</span>
              </div>
            </div>
            {desconto > 0 && (
              <>
                <div>
                  <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>Desconto (R$)</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#dc2626' }}>- {fmtR(descontoValor)}</div>
                </div>
                <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6, padding:'8px 14px' }}>
                  <div style={{ fontSize:9, color:'#166534', marginBottom:2 }}>Total c/ Desconto</div>
                  <div style={{ fontSize:20, fontWeight:800, color:'#16a34a' }}>{fmtR(valorComDesconto)}</div>
                </div>
              </>
            )}
          </div>
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>Observações da proposta</div>
            <textarea className="acn-input" style={{ width:'100%', height:60, resize:'vertical', fontSize:10 }}
              placeholder="Condições especiais, validade da proposta, notas..."
              value={obs} onChange={e => setObs(e.target.value)} />
          </div>
          <div style={{ marginTop:8 }}>
            <button className="acn-btn" style={{ background:'#16a34a' }} onClick={salvarProposta} disabled={salvando}>
              {salvando ? 'Salvando...' : '💾 Salvar Proposta'}
            </button>
          </div>
        </div>

        {/* Histórico de propostas */}
        {propostas.length > 0 && (
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:14 }}>
            <div style={{ fontWeight:700, fontSize:11, color:'#475569', marginBottom:8, textTransform:'uppercase' }}>📋 Propostas Salvas</div>
            {propostas.map(p => (
              <div key={p.id} style={{ display:'flex', gap:12, alignItems:'center', padding:'6px 0',
                borderBottom:'1px solid #f1f5f9', flexWrap:'wrap', fontSize:10 }}>
                <span style={{ color:'#64748b' }}>{new Date(p.criado_em).toLocaleDateString('pt-BR')}</span>
                <span>Desc.: <strong>{p.desconto_pct}%</strong></span>
                <span>Total: <strong style={{ color:'#1e40af' }}>{fmtR(p.valor_total)}</strong></span>
                <span>c/ Desc.: <strong style={{ color:'#16a34a' }}>{fmtR(p.valor_com_desconto)}</strong></span>
                <span style={{ color:'#64748b' }}>por {p.criado_por}</span>
                {p.observacoes && <span style={{ fontSize:9, color:'#94a3b8', fontStyle:'italic' }}><Linkify text={p.observacoes} /></span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Lista de cotações ──
  return (
    <div style={{ padding:14, fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#f8fafc' }}>
      <div style={{ fontWeight:800, fontSize:15, color:'#1e293b', marginBottom:14 }}>📋 Preços Formados</div>
      {carregando && <div style={{ textAlign:'center', color:'#64748b', padding:30 }}>Carregando...</div>}
      {!carregando && cotacoes.length === 0 && (
        <div style={{ textAlign:'center', color:'#9ca3af', fontSize:12, padding:40 }}>Nenhuma cotação salva.</div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {cotacoes.map(m => {
          const prms    = m.parametros_globais || {};
          const items   = m.itens || [];
          const results = items.map(it => calcItem(it, prms));
          const totVendas = results.reduce((s, r) => s + r.valorTotal, 0);
          return (
            <div key={m.id}
              style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px',
                display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:12 }}>{m.nome}</div>
                <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>
                  {m.tipo} · {m.empresa} · {items.length} {items.length === 1 ? 'item' : 'itens'}
                  {m.opl_numero ? ` · OP: ${m.opl_numero}` : ''}
                  {m.desconto_maximo_pct > 0 ? ` · Desc.máx: ${m.desconto_maximo_pct}%` : ''}
                  {' '}· por {m.criado_por} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div style={{ textAlign:'right', minWidth:100 }}>
                <div style={{ fontSize:9, color:'#64748b' }}>Total de Vendas</div>
                <div style={{ fontSize:13, fontWeight:800, color:'#1e40af' }}>{fmtR(totVendas)}</div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                {!isVendedor && onEditar && (
                  <button className="acn-btn" style={{ background:'#f59e0b', fontSize:9 }}
                    onClick={() => onEditar(m)}>
                    ✏️ Editar
                  </button>
                )}
                {!isVendedor && onClonar && (
                  <button className="acn-btn" style={{ background:'#7c3aed', fontSize:9 }}
                    onClick={() => onClonar(m)}>
                    ⎘ Clonar
                  </button>
                )}
                <button className="acn-btn" style={{ background:'#0891b2', fontSize:9 }}
                  onClick={() => abrirCotacao(m)}>
                  Abrir →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// `vinculo` — { tipo:'crm'|'licitacao', id, label? } — quando informado, o
// componente roda "embutido" dentro do processo (CrmTab.tsx/LicitacoesTab.tsx):
// mostra só a aba de edição (sem o navegador de abas/Preços Formados), lista
// as formações já vinculadas àquele processo pra carregar, e ao salvar grava
// o vínculo automaticamente (crm_oportunidade_id/licitacao_id), sem precisar
// procurar manualmente na tela cheia.
export default function FormacaoPrecosTab({ currentUser, vinculo, embutido }: any = {}) {
  const [params, setParams]           = useState({ ...PARAMS_PADRAO });
  const [itens, setItens]             = useState([novoItem()]);
  const [usarGlobais, setUsarGlobais]             = useState(true);
  const [usarMarkupGlobal, setUsarMarkupGlobal]   = useState(false);
  const [modelos, setModelos]         = useState([]);
  const [modalSalvar, setModalSalvar]     = useState(false);
  const [modalCarregar, setModalCarregar] = useState(false);
  const [salvando, setSalvando]       = useState(false);
  const [carregando, setCarregando]   = useState(false);
  const [nomeCotacao, setNomeCotacao] = useState('');
  const [empresa, setEmpresa]         = useState('ACN');
  const [plataformas, setPlataformas]                 = useState([]);
  const [plataformaSelecionada, setPlataformaSelecionada] = useState(null);

  // Novos estados
  const [abaAtiva, setAbaAtiva]             = useState('formacao');
  const [oplVinculada, setOplVinculada]     = useState(null);
  const [descontoMaximoPct, setDescontoMax] = useState(0);
  const [finalizando, setFinalizando]       = useState(false);
  const [editandoId, setEditandoId]         = useState(null); // id da cotação em edição

  // ── Formações já vinculadas a este processo (modo embutido) ──
  const [formacoesVinculo, setFormacoesVinculo]     = useState<any[]>([]);
  const [carregandoVinculo, setCarregandoVinculo]   = useState(!!vinculo);

  const carregarFormacoesVinculo = useCallback(async () => {
    if (!vinculo?.id) return;
    setCarregandoVinculo(true);
    const col = vinculo.tipo === 'licitacao' ? 'licitacao_id' : 'crm_oportunidade_id';
    const { data } = await supabase.from('cotacoes_precos').select('*').eq(col, vinculo.id).order('criado_em', { ascending: false });
    setFormacoesVinculo(data || []);
    setCarregandoVinculo(false);
  }, [vinculo?.tipo, vinculo?.id]);

  useEffect(() => { carregarFormacoesVinculo(); }, [carregarFormacoesVinculo]);

  // Se só existe 1 formação vinculada a este processo, já carrega ela
  // direto pra edição — evita o usuário ter que clicar no seletor.
  useEffect(() => {
    if (formacoesVinculo.length === 1 && !editandoId) {
      carregarModelo(formacoesVinculo[0]);
      setEditandoId(formacoesVinculo[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formacoesVinculo]);

  const isVendedor = ['Comercial', 'Licitações', 'CRM'].includes(currentUser?.perfil);
  const setP = (k, v) => setParams(p => ({ ...p, [k]: v }));

  // ── Resize da tabela de itens ─────────────────────────────────────────────
  const [tableHeight, setTableHeight] = useState(320);
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = tableHeight;
    const onMove = (me) => setTableHeight(Math.max(160, startH + me.clientY - startY));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    supabase.from('plataformas_licitacao').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => setPlataformas(data || []));
  }, []);

  const paramEfetivo = (item) => {
    let it = { ...item };
    if (usarGlobais)       { it.difal_pct = params.difal_pct; it.imposto_pct = params.imposto_pct; it.custo_fixo_pct = params.custo_fixo_pct; }
    if (usarMarkupGlobal)  { it.markup_pct = params.markup_pct; }
    return it;
  };

  const results    = itens.map(it => calcItem(paramEfetivo(it), params));
  const lote       = Number(params.lote_qtd) || 1;
  const totVendas  = results.reduce((s, r) => s + r.valorTotal,    0);
  const totCustos  = results.reduce((s, r) => s + r.custoTotal,    0);
  const totDifal   = results.reduce((s, r) => s + r.totalDifal,    0);
  const totImposto = results.reduce((s, r) => s + r.totalImposto,  0);
  const totMargem  = results.reduce((s, r) => s + r.margem,        0);
  const lucroGeral = (totVendas - totDifal) > 0 ? totMargem / (totVendas - totDifal) * 100 : 0;

  const descontoPlatPct  = Number(plataformaSelecionada?.desconto_pct) || 0;
  const retencaoPlatPct  = Number(plataformaSelecionada?.retencao_pct) || 0;
  const descontoPlat     = totVendas * descontoPlatPct / 100;
  const retencaoPlat     = totVendas * retencaoPlatPct / 100;
  const totalLiquidoPlat = totVendas - descontoPlat - retencaoPlat;

  const addItem  = () => setItens(p => [...p, {
    ...novoItem(),
    difal_pct:      params.difal_pct,
    imposto_pct:    params.imposto_pct,
    custo_fixo_pct: params.custo_fixo_pct,
  }]);
  const remItem  = (id) => setItens(p => p.filter(x => x._id !== id));
  const setItem  = (id, k, v) => setItens(p => p.map(x => x._id === id ? { ...x, [k]: v } : x));

  // Preenche múltiplos campos de uma só vez (ao selecionar do catálogo)
  const fillItem = (id, dados) => setItens(p => p.map(x => x._id === id ? { ...x, ...dados } : x));

  // Expande produto BOM: substitui a linha atual por todas as linhas do BOM
  const expandItem = (id, linhas) => setItens(prev => {
    const idx = prev.findIndex(x => x._id === id);
    if (idx < 0) return prev;
    const novas = linhas.map(l => ({
      ...novoItem(),
      difal_pct:      params.difal_pct,
      imposto_pct:    params.imposto_pct,
      custo_fixo_pct: params.custo_fixo_pct,
      ...l,
    }));
    return [...prev.slice(0, idx), ...novas, ...prev.slice(idx + 1)];
  });

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    setModelos(data || []);
    setCarregando(false);
  }, []);

  const salvarModelo = async (nome, tipo) => {
    setSalvando(true);
    const payload: any = {
      nome,
      tipo,
      empresa,
      plataforma_id:       plataformaSelecionada?.id || null,
      parametros_globais:  params,
      itens:               itens.map(({ _id, ...rest }) => rest),
      opl_id:              oplVinculada?.id   || null,
      opl_numero:          oplVinculada?.opl  || null,
      desconto_maximo_pct: descontoMaximoPct  || 0,
    };
    // Modo embutido — grava o vínculo com o processo automaticamente.
    if (vinculo?.tipo === 'crm')       payload.crm_oportunidade_id = vinculo.id;
    if (vinculo?.tipo === 'licitacao') payload.licitacao_id        = vinculo.id;
    let error;
    if (editandoId) {
      // Atualiza a cotação existente
      ({ error } = await supabase.from('cotacoes_precos').update(payload).eq('id', editandoId));
    } else {
      // Cria nova cotação
      ({ error } = await supabase.from('cotacoes_precos').insert([{ ...payload, criado_por: currentUser?.nome || 'Sistema' }]));
    }
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      alert(editandoId ? '✅ Cotação atualizada!' : '✅ Modelo salvo!');
      setModalSalvar(false);
      setEditandoId(null);
      carregarModelos();
      if (vinculo?.id) carregarFormacoesVinculo();
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
    // Restaurar campos novos
    setDescontoMax(Number(m.desconto_maximo_pct) || 0);
    if (m.opl_numero) {
      // Busca o objeto completo da OP para vincular
      supabase.from('oples').select('id, opl, cliente_nome, status_geral')
        .eq('opl', m.opl_numero).maybeSingle()
        .then(({ data }) => setOplVinculada(data || null));
    } else {
      setOplVinculada(null);
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
    setOplVinculada(null);
    setDescontoMax(0);
    setEditandoId(null);
  };

  // Carrega cotação para edição e muda para a aba de formação
  const editarCotacao = (m) => {
    carregarModelo(m);
    setEditandoId(m.id);
    setAbaAtiva('formacao');
  };

  // Clona cotação: salva nova cópia no banco (sem OP vinculada) e abre para edição
  const clonarCotacao = async (m) => {
    const novoNome = `Cópia de ${m.nome}`;
    const { data, error } = await supabase.from('cotacoes_precos').insert([{
      nome:                novoNome,
      tipo:                m.tipo,
      empresa:             m.empresa,
      plataforma_id:       m.plataforma_id || null,
      parametros_globais:  m.parametros_globais,
      itens:               m.itens,
      criado_por:          currentUser?.nome || currentUser?.email || 'Sistema',
      desconto_maximo_pct: m.desconto_maximo_pct || 0,
      // Sem opl_id / opl_numero — para vincular na nova OP após editar
    }]).select().single();
    if (error) { alert('Erro ao clonar: ' + error.message); return; }
    // Carrega o clone no formulário para edição imediata
    carregarModelo({ ...m, nome: novoNome, id: data.id });
    setEditandoId(data.id);
    setAbaAtiva('formacao');
    carregarModelos();
  };

  // ─── FINALIZAR: gerar PDF e anexar na OP ───────────────────────────────────
  const finalizar = async () => {
    if (!oplVinculada) { alert('Vincule uma OP/OS primeiro para gerar o PDF.'); return; }
    if (itens.length === 0) { alert('Adicione itens antes de finalizar.'); return; }
    setFinalizando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable  = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ── Cabeçalho ──
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('FORMAÇÃO DE PREÇOS', 105, 18, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const linhas = [
        [`Empresa: ${empresa}`,  `Data: ${new Date().toLocaleDateString('pt-BR')}`],
        [`OP/OS: ${oplVinculada.opl}`,  `Cliente: ${oplVinculada.cliente_nome || '—'}`],
        [`Modelo: ${nomeCotacao || '—'}`, plataformaSelecionada ? `Plataforma: ${plataformaSelecionada.nome}` : ''],
      ];
      let y = 28;
      linhas.forEach(([esq, dir]) => {
        doc.text(esq, 14, y);
        if (dir) doc.text(dir, 130, y);
        y += 6;
      });

      // ── Tabela de itens ──
      const head = [isVendedor
        ? ['Produto / Descrição', 'Marca', 'Qt', 'Valor Unit.', 'Valor Total', 'Imposto']
        : ['Produto / Descrição', 'Marca', 'Qt', 'Custo Unit.', 'Valor Unit.', 'Valor Total', 'DIFAL', 'Imposto', 'Lucro%']
      ];
      const body = itens.map((item, idx) => {
        const r = results[idx];
        if (isVendedor) {
          return [item.produto || '—', item.marca || '—', item.qt, fmtR(r.valorUnit), fmtR(r.valorTotal), fmtR(r.totalImposto)];
        }
        return [
          item.produto || '—', item.marca || '—', item.qt,
          fmtR(r.custoUnitBrl), fmtR(r.valorUnit), fmtR(r.valorTotal),
          fmtR(r.totalDifal), fmtR(r.totalImposto), fmtPct(r.lucroPct),
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY: y + 4,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7, textColor: 255 },
        bodyStyles: { fontSize: 7 },
        columnStyles: isVendedor
          ? { 0: { cellWidth: 60 }, 4: { halign: 'right' }, 5: { halign: 'right' } }
          : { 0: { cellWidth: 50 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;

      // ── Resumo financeiro ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('RESUMO FINANCEIRO', 14, finalY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let ry = finalY + 6;
      doc.text(`Total de Vendas: ${fmtR(totVendas)}`, 14, ry); ry += 5;
      doc.text(`Total Impostos: ${fmtR(totImposto)}`, 14, ry); ry += 5;
      if (!isVendedor) {
        doc.text(`Total DIFAL: ${fmtR(totDifal)}`, 14, ry); ry += 5;
        doc.text(`Margem Real: ${fmtR(totMargem)}`, 14, ry); ry += 5;
        doc.text(`Lucro % Geral: ${fmtPct(lucroGeral)}`, 14, ry); ry += 5;
      }
      if (plataformaSelecionada) {
        doc.text(`Desconto Plataforma (${descontoPlatPct}%): ${fmtR(descontoPlat)}`, 14, ry); ry += 5;
        doc.text(`Retenção Plataforma (${retencaoPlatPct}%): ${fmtR(retencaoPlat)}`, 14, ry); ry += 5;
        doc.text(`Líquido c/ Plataforma: ${fmtR(totalLiquidoPlat)}`, 14, ry); ry += 5;
      }

      // ── Campo de desconto máximo ──
      ry += 4;
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.rect(12, ry - 4, 186, 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 38, 38);
      doc.text(`Desconto máximo autorizado para negociação: ${descontoMaximoPct}%`, 15, ry + 2);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 60, 60);
      doc.text('Referência para o vendedor durante a negociação. Não ultrapassar este percentual.', 15, ry + 7);
      doc.setTextColor(0, 0, 0);

      // ── Upload para Supabase Storage ──
      const pdfBlob = doc.output('blob');
      const safeOpl  = (oplVinculada.opl || '').replace(/[^a-zA-Z0-9-]/g, '_');
      const safeName = `formacao-precos_${(nomeCotacao || 'sem-nome').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      const path     = `opl-anexos/${safeOpl}/${safeName}`;

      const { data: upData, error: upErr } = await supabase.storage
        .from('acn-media')
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });

      if (upErr || !upData) throw new Error('Erro no upload: ' + (upErr?.message || 'desconhecido'));

      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);

      await supabase.from('opl_anexos').insert([{
        opl_id:     oplVinculada.id,
        opl_numero: oplVinculada.opl,
        setor:      'Preços',
        tipo:       'documento',
        nome:       safeName,
        url:        pub?.publicUrl || '',
        criado_por: currentUser?.nome,
      }]);

      alert(`✅ PDF gerado e anexado à OP ${oplVinculada.opl}!\n\nO arquivo está disponível nos anexos da OP.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao finalizar: ' + err.message);
    } finally {
      setFinalizando(false);
    }
  };

  const thStyle = {
    padding: '7px 8px', background: '#1e293b', color: '#fff',
    fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center',
    position: 'sticky' as const, top: 0, zIndex: 2,
  };
  const lucroGeralColor = lucroGeral >= 10 ? '#16a34a' : lucroGeral >= 5 ? '#d97706' : '#dc2626';

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:'system-ui,sans-serif', minHeight: embutido ? undefined : '100vh', background: embutido ? undefined : '#f8fafc' }}>

      {/* ── NAVEGAÇÃO DE ABAS — some no modo embutido, só a edição importa ── */}
      {!embutido && (
        <div style={{ display:'flex', borderBottom:'2px solid #e2e8f0', background:'#fff', paddingLeft:14, paddingTop:8 }}>
          {[
            { id:'formacao',       label:'📊 Formação de Preços' },
            { id:'precos_formados', label:'📋 Preços Formados' },
          ].map(tab => (
            <button key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              style={{
                padding:'8px 18px', fontSize:11, fontWeight: abaAtiva === tab.id ? 800 : 500,
                border:'none', borderBottom: abaAtiva === tab.id ? '3px solid #2563eb' : '3px solid transparent',
                background:'none', cursor:'pointer',
                color: abaAtiva === tab.id ? '#2563eb' : '#64748b',
                marginBottom:-2,
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── ABA PREÇOS FORMADOS ── */}
      {!embutido && abaAtiva === 'precos_formados' && (
        <AbaPrecoFormados currentUser={currentUser} isVendedor={isVendedor} onEditar={editarCotacao} onClonar={clonarCotacao} />
      )}

      {/* ── ABA FORMAÇÃO DE PREÇOS ── */}
      {(embutido || abaAtiva === 'formacao') && (
        <div style={{ padding: embutido ? 0 : 14 }}>

          {/* ── SELETOR DE FORMAÇÕES VINCULADAS (modo embutido) ── */}
          {vinculo && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
              {carregandoVinculo ? (
                <span style={{ fontSize:10, color:'#94a3b8' }}>Carregando formações vinculadas...</span>
              ) : (
                <>
                  {formacoesVinculo.map((m: any) => (
                    <button key={m.id} onClick={() => { carregarModelo(m); setEditandoId(m.id); }}
                      style={{ padding:'5px 12px', fontSize:10, fontWeight:700, borderRadius:20, cursor:'pointer', border:'none',
                        background: editandoId === m.id ? '#1e40af' : '#eff6ff',
                        color: editandoId === m.id ? '#fff' : '#1e40af' }}>
                      {m.nome}
                    </button>
                  ))}
                  <button onClick={novaQuotacao}
                    style={{ padding:'5px 12px', fontSize:10, fontWeight:700, borderRadius:20, cursor:'pointer', border:'1px dashed #94a3b8',
                      background:'#f8fafc', color:'#64748b' }}>
                    + Nova formação
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── HEADER ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>📊 Formação de Preços</div>
              {nomeCotacao && (
                <div style={{ fontSize:10, color:'#64748b', marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
                  {editandoId
                    ? <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:3, padding:'1px 6px', fontWeight:700, fontSize:9 }}>✏️ EDITANDO</span>
                    : null}
                  Modelo: <strong>{nomeCotacao}</strong>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button className="acn-btn" style={{ background:'#0891b2', fontSize:10 }}
                onClick={() => { setModalCarregar(true); carregarModelos(); }}>
                📂 Carregar Modelo
              </button>
              <button className="acn-btn" style={{ background: editandoId ? '#f59e0b' : '#16a34a', fontSize:10 }}
                onClick={() => setModalSalvar(true)}>
                {editandoId ? '✏️ Atualizar Cotação' : '💾 Salvar Modelo'}
              </button>
              <button className="acn-btn" style={{ background:'#7c3aed', fontSize:10 }}
                onClick={addItem}>
                + Adicionar Item
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10 }}
                onClick={novaQuotacao}>
                🗒️ Nova Cotação
              </button>
              {oplVinculada && (
                <button className="acn-btn"
                  style={{ background: finalizando ? '#94a3b8' : '#dc2626', fontSize:10 }}
                  onClick={finalizar}
                  disabled={finalizando}>
                  {finalizando ? '⏳ Gerando PDF...' : '📎 Finalizar & Anexar PDF'}
                </button>
              )}
            </div>
          </div>

          {/* ── OP/OS + DESCONTO MÁXIMO ── */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12, marginBottom:12,
            display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-end' }}>
            {/* OP Vinculada */}
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4, textTransform:'uppercase' }}>🔗 OP/OS Vinculada</div>
              <OplAutocomplete value={oplVinculada} onSelect={setOplVinculada} />
              {oplVinculada && (
                <div style={{ fontSize:9, color:'#16a34a', marginTop:3 }}>
                  ✓ {oplVinculada.opl} — {oplVinculada.cliente_nome}
                </div>
              )}
            </div>
            {/* Desconto máximo */}
            {!isVendedor && (
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4, textTransform:'uppercase' }}>🔒 Desconto Máx. (%)</div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="number" className="acn-input" style={{ width:80, fontSize:11, textAlign:'right' }}
                    min={0} max={100} step="0.5" value={descontoMaximoPct}
                    onChange={e => setDescontoMax(parseFloat(e.target.value) || 0)} />
                  <span style={{ fontSize:10, color:'#64748b' }}>%</span>
                </div>
                <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>Limite para o vendedor negociar</div>
              </div>
            )}
          </div>

          {/* ── EMPRESA + PLATAFORMA ── */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12, marginBottom:12, display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-end' }}>
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
                { label:'Markup Global %',k:'markup_pct',     w:80,  step:'0.1' },
                { label:'Qtd. Lote',      k:'lote_qtd',       w:70,  step:'1' },
              ].map(({ label, k, w, step }) => (
                <div key={k}>
                  <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>{label}</div>
                  <input type="number" className="acn-input" style={{ width:w, fontSize:10, textAlign:'right' }}
                    step={step} value={params[k]}
                    onChange={e => setP(k, parseFloat(e.target.value) || 0)} />
                </div>
              ))}
              <div style={{ display:'flex', flexDirection:'column', gap:6, paddingBottom:2 }}>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={usarGlobais} onChange={e=>setUsarGlobais(e.target.checked)}
                    style={{ accentColor:'#0891b2' }} />
                  Usar globais (DIFAL/Imp/CF)
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={usarMarkupGlobal} onChange={e=>setUsarMarkupGlobal(e.target.checked)}
                    style={{ accentColor:'#7c3aed' }} />
                  <span style={{ color: usarMarkupGlobal ? '#7c3aed' : undefined, fontWeight: usarMarkupGlobal ? 700 : undefined }}>
                    Markup Global (sem impostos)
                  </span>
                </label>
                <button
                  onClick={() => { setItens(p => p.map(x => ({
                    ...x,
                    difal_pct:      params.difal_pct,
                    imposto_pct:    params.imposto_pct,
                    custo_fixo_pct: params.custo_fixo_pct,
                  }))); setUsarGlobais(false); }}
                  style={{ fontSize:9, fontWeight:700, padding:'4px 10px', background:'#0891b2', color:'#fff',
                    border:'none', borderRadius:4, cursor:'pointer' }}
                  title="Copia os globais para cada linha e desbloqueia edição individual">
                  ↻ Copiar globais → linhas
                </button>
              </div>
            </div>
          </div>

          {/* ── TABELA DE ITENS ── */}
          <div style={{ marginBottom:12 }}>
            {/* Container — sem overflow-x, colunas essenciais só; custo/impostos/markup
                ficam num painel expansível por linha (ver ItemRow) */}
            <div style={{
              background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px 8px 0 0',
              overflowY:'auto', height: tableHeight,
            }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{...thStyle, textAlign:'left'}}>Produto / Descrição</th>
                  <th style={{...thStyle, fontSize:10}}>Marca</th>
                  <th style={{...thStyle, fontSize:10}}>Qt</th>
                  <th style={{...thStyle, fontSize:10, background:'#1e40af'}}>Valor Unit.</th>
                  <th style={{...thStyle, fontSize:10, background:'#1e40af'}}>Valor Total</th>
                  <th style={{...thStyle, fontSize:9}} />
                  <th style={{...thStyle, fontSize:10}}>✕</th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign:'center', color:'#9ca3af', fontSize:11, padding:24 }}>
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
                    onFill={(dados) => fillItem(item._id, dados)}
                    onExpand={(linhas) => expandItem(item._id, linhas)}
                    onRemove={() => remItem(item._id)}
                    usarParamsGlobais={usarGlobais}
                    usarMarkupGlobal={usarMarkupGlobal}
                    params={params}
                    isVendedor={isVendedor}
                  />
                ))}
              </tbody>
            </table>
            </div>{/* fim scroll */}

            {/* ── Alça de resize ── */}
            <div
              onMouseDown={startResize}
              title="Arraste para redimensionar"
              style={{
                height: 12, background: '#e8ecf0',
                borderRadius: '0 0 8px 8px',
                border: '1px solid #e2e8f0', borderTop: 'none',
                cursor: 'ns-resize',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              <div style={{ display:'flex', gap:3 }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ width:20, height:2, background:'#94a3b8', borderRadius:2 }} />
                ))}
              </div>
            </div>

            {/* Contador + botão add abaixo da alça */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4, marginBottom:6 }}>
              <span style={{ fontSize:9, color:'#9ca3af' }}>
                {itens.length} item{itens.length !== 1 ? 'ns' : ''} · arraste a barra cinza para redimensionar
              </span>
            </div>
          </div>{/* fim wrapper resize */}

          {/* ── PAINEL DE TOTAIS ── */}
          {itens.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8, marginBottom:12 }}>
              {[
                { label:'Total de Vendas',    value: fmtR(totVendas),    bg:'#1e40af', color:'#fff', hide: false },
                { label:'Total de Custos',    value: fmtR(totCustos),    bg:'#065f46', color:'#fff', hide: isVendedor },
                { label:'Total DIFAL',        value: fmtR(totDifal),     bg:'#92400e', color:'#fff', hide: isVendedor },
                { label:'Total Impostos',     value: fmtR(totImposto),   bg:'#831843', color:'#fff', hide: false },
                { label:'Margem Real Total',  value: fmtR(totMargem),    bg: totMargem >= 0 ? '#166534' : '#991b1b', color:'#fff', hide: isVendedor },
                { label:'Lucro % Geral',      value: fmtPct(lucroGeral), bg: lucroGeralColor, color:'#fff', hide: isVendedor },
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

          {/* ── OBSERVAÇÕES ── */}
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:12 }}>
            <div style={{ fontWeight:700, fontSize:10, color:'#475569', marginBottom:6, textTransform:'uppercase' }}>
              📝 Observações da Cotação
            </div>
            <textarea className="acn-input" style={{ width:'100%', height:80, resize:'vertical', fontSize:10 }}
              placeholder="Condições comerciais, validade da proposta, notas sobre o lote..." />
          </div>

          {/* ── MODAIS ── */}
          {modalSalvar && (
            <ModalSalvar
              onSalvar={salvarModelo}
              onClose={() => setModalSalvar(false)}
              salvando={salvando}
              nomeInicial={nomeCotacao}
              tipoInicial={undefined}
              editando={!!editandoId}
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
      )}
    </div>
  );
}
