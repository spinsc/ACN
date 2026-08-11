// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIAS_DEFAULT = [
  'Kit Instalação', 'Adaptação Veicular', 'Rastreamento', 'Comunicação',
  'Segurança', 'Câmera', 'Elétrico', 'Mecânico', 'Acessório', 'Serviço', 'Outro',
];

function fmtR(v: number) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number) {
  return `${Number(v || 0).toFixed(1)}%`;
}

/** Calcula custo total e preço de venda estimado do produto a partir do BOM */
function calcProduto(linhas: any[], markup_pct: number, difal_pct: number, imposto_pct: number, custo_fixo_pct: number) {
  const custoTotal = linhas.reduce((acc, l) => {
    const item = l._item || {};
    const qt   = Number(l.quantidade) || 1;
    const cu   = Number(item.custo_unit) || 0;
    // aplica IPI e ST do item
    const cu_c = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
    return acc + cu_c * qt;
  }, 0);

  const mk  = 1 - (Number(markup_pct) || 0) / 100;
  const di  = 1 + (Number(difal_pct) || 0) / 100;
  const imp = 1 - (Number(imposto_pct) || 0) / 100;
  const cf  = 1 - (Number(custo_fixo_pct) || 0) / 100;
  const precoVenda = (mk > 0 && imp > 0 && cf > 0)
    ? (custoTotal * di) / (mk * imp * cf)
    : 0;

  return { custoTotal, precoVenda };
}

// ─── Buscador de itens do catálogo ───────────────────────────────────────────
function ItemBuscador({ onSelect, excluirIds = [] }: { onSelect: (item: any) => void; excluirIds?: string[] }) {
  const [q, setQ]           = useState('');
  const [itens, setItens]   = useState<any[]>([]);
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setItens([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('cadastro_itens')
        .select('id, codigo, nome, marca, fornecedor, unidade, custo_unit, ipi_pct, st_pct, moeda')
        .eq('ativo', true)
        .ilike('nome', `%${q}%`)
        .limit(20);
      setItens((data || []).filter(i => !excluirIds.includes(i.id)));
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="🔍 Buscar item do catálogo para adicionar..."
        style={{
          width: '100%', padding: '6px 9px', border: '1px solid #d1d5db',
          borderRadius: 5, fontSize: 11, color: '#374151', boxSizing: 'border-box',
        }}
        onFocus={() => { if (itens.length) setOpen(true); }}
      />
      {open && itens.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 240, overflowY: 'auto',
        }}>
          {itens.map(it => (
            <div
              key={it.id}
              onClick={() => { onSelect(it); setQ(''); setOpen(false); }}
              style={{
                padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                display: 'flex', gap: 8, alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>{it.nome}</div>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>
                  {[it.marca, it.fornecedor].filter(Boolean).join(' · ')} · {it.unidade}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                R$ {Number(it.custo_unit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal de criação/edição de produto ──────────────────────────────────────
function ProdutoModal({ produto, onSave, onClose, currentUser }: any) {
  const isEdit = !!produto?.id;

  const [form, setForm] = useState<any>({
    codigo: '', nome: '', descricao: '', categoria: '', unidade: 'UN', ncm: '',
    markup_pct: 30, custo_fixo_pct: 3, imposto_pct: 16, difal_pct: 16,
    garantia_meses: 12,
    preco_manual: false, preco_venda: 0, observacoes: '', ativo: true,
    ...produto,
  });
  const [linhas, setLinhas]       = useState<any[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [loadingBom, setLoadingBom] = useState(false);
  // Fotos e catálogo
  const [fotos, setFotos]         = useState<string[]>(produto?.fotos || []);
  const [catalogoUrl, setCatalogoUrl] = useState<string>(produto?.catalogo_url || '');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCatalogo, setUploadingCatalogo] = useState(false);

  // ID pré-gerado para novos produtos (permite upload antes do save)
  const [produtoIdLocal] = useState<string>(() => produto?.id || crypto.randomUUID());

  const uploadFoto = async (file: File) => {
    setUploadingFoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `produtos/${produtoIdLocal}/fotos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: false });
    if (!error) {
      const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
      setFotos(prev => [...prev, urlData.publicUrl]);
    } else {
      alert('Erro ao enviar foto: ' + error.message);
    }
    setUploadingFoto(false);
  };

  const removeFoto = (idx: number) => setFotos(prev => prev.filter((_, i) => i !== idx));

  const uploadCatalogo = async (file: File) => {
    setUploadingCatalogo(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `produtos/${produtoIdLocal}/catalogo/catalogo.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
      setCatalogoUrl(urlData.publicUrl);
    } else {
      alert('Erro ao enviar catálogo: ' + error.message);
    }
    setUploadingCatalogo(false);
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Carrega BOM existente ao editar
  useEffect(() => {
    if (!produto?.id) return;
    setLoadingBom(true);
    supabase
      .from('cadastro_produtos_itens')
      .select('*, cadastro_itens(*)')
      .eq('produto_id', produto.id)
      .order('ordem')
      .then(({ data }) => {
        setLinhas((data || []).map(l => ({
          ...l,
          _item: l.cadastro_itens || { nome: l.item_nome, custo_unit: 0 },
        })));
        setLoadingBom(false);
      });
  }, [produto?.id]);

  const addItem = (item: any) => {
    setLinhas(prev => [...prev, {
      _tmpId: Math.random().toString(36).slice(2),
      item_id:    item.id,
      item_nome:  item.nome,
      item_codigo: item.codigo,
      quantidade: 1,
      unidade:    item.unidade || 'UN',
      observacoes: '',
      ordem:      prev.length,
      _item:      item,
    }]);
  };

  const removeItem = (idx: number) => setLinhas(prev => prev.filter((_, i) => i !== idx));

  const setLinha = (idx: number, k: string, v: any) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));

  const { custoTotal, precoVenda } = calcProduto(
    linhas, form.markup_pct, form.difal_pct, form.imposto_pct, form.custo_fixo_pct,
  );

  const handleSave = async () => {
    if (!form.nome?.trim()) return;
    setSalvando(true);

    const payload: any = {
      codigo:        form.codigo?.trim() || null,
      nome:          form.nome.trim(),
      descricao:     form.descricao?.trim() || null,
      categoria:     form.categoria?.trim() || null,
      unidade:       form.unidade || 'UN',
      ncm:           form.ncm?.trim() || null,
      markup_pct:    Number(form.markup_pct) || 30,
      custo_fixo_pct: Number(form.custo_fixo_pct) || 3,
      imposto_pct:   Number(form.imposto_pct) || 16,
      difal_pct:     Number(form.difal_pct) || 16,
      garantia_meses: Number(form.garantia_meses) || 12,
      fotos:         fotos,
      catalogo_url:  catalogoUrl || null,
      preco_manual:  !!form.preco_manual,
      preco_venda:   form.preco_manual ? (Number(form.preco_venda) || 0) : precoVenda,
      observacoes:   form.observacoes?.trim() || null,
      ativo:         form.ativo !== false,
    };

    let produtoId = produtoIdLocal;
    if (isEdit) {
      await supabase.from('cadastro_produtos').update(payload).eq('id', produtoId);
    } else {
      payload.id = produtoIdLocal;
      payload.criado_por = currentUser?.email;
      await supabase.from('cadastro_produtos').insert([payload]);
    }

    if (produtoId) {
      // Recria BOM
      await supabase.from('cadastro_produtos_itens').delete().eq('produto_id', produtoId);
      if (linhas.length > 0) {
        await supabase.from('cadastro_produtos_itens').insert(
          linhas.map((l, idx) => ({
            produto_id:  produtoId,
            item_id:     l.item_id || null,
            item_nome:   l.item_nome,
            item_codigo: l.item_codigo || null,
            quantidade:  Number(l.quantidade) || 1,
            unidade:     l.unidade || 'UN',
            observacoes: l.observacoes || null,
            ordem:       idx,
          }))
        );
      }
    }

    setSalvando(false);
    onSave();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 7px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 11, boxSizing: 'border-box', color: '#374151',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700, color: '#6b7280',
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.4px',
  };

  const excluirIds = linhas.map(l => l.item_id).filter(Boolean);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: 760, maxWidth: '97vw',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)',
      }}>
        {/* Header */}
        <div style={{
          background: '#7c3aed', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>
              {isEdit ? '✏️ Editar Produto' : '➕ Novo Produto'}
            </div>
            <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 1 }}>
              Produto composto de itens do catálogo (BOM)
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Coluna esquerda — dados do produto */}
          <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 14px 16px', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
              📦 Identificação
            </div>

            {[
              { label: 'CODPRODUTO', k: 'codigo', ph: 'Ex: PROD-001' },
              { label: 'Nome do Produto *', k: 'nome', ph: 'Nome do produto final' },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 8 }}>
                <span style={lbl}>{f.label}</span>
                <input style={{ ...inp, borderColor: f.k === 'nome' && !form.nome ? '#f87171' : '#d1d5db' }}
                  value={form[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.ph} />
              </div>
            ))}

            <div style={{ marginBottom: 8 }}>
              <span style={lbl}>Descrição</span>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 46 }}
                value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Especificações, observações..." />
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={lbl}>Categoria</span>
                <select style={inp} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                  <option value="">— Selecionar —</option>
                  {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 0.6 }}>
                <span style={lbl}>Unidade</span>
                <select style={inp} value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                  {['UN', 'PC', 'KG', 'M', 'KIT', 'JG', 'VB'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={lbl}>NCM</span>
              <input style={inp} value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="0000.00.00" />
            </div>

            <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
              📊 Tributação e Markup
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              {[
                { label: 'Markup (%)', k: 'markup_pct' },
                { label: 'Custo Fixo (%)', k: 'custo_fixo_pct' },
                { label: 'Impostos s/Venda (%)', k: 'imposto_pct' },
                { label: 'DIFAL (%)', k: 'difal_pct' },
              ].map(f => (
                <div key={f.k}>
                  <span style={lbl}>{f.label}</span>
                  <input style={inp} type="number" min={0} max={200} step="0.5"
                    value={form[f.k]} onChange={e => set(f.k, e.target.value)} />
                </div>
              ))}
            </div>

            {/* Garantia */}
            <div style={{ marginBottom: 10 }}>
              <span style={lbl}>🛡️ Garantia Padrão</span>
              <select style={{ ...inp, cursor: 'pointer' }}
                value={form.garantia_meses} onChange={e => set('garantia_meses', Number(e.target.value))}>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
                <option value={24}>24 meses</option>
                <option value={60}>60 meses</option>
              </select>
            </div>

            {/* Resumo financeiro */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6,
              padding: '8px 10px', marginTop: 10,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                💰 Resumo Financeiro
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Custo total BOM:</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{fmtR(custoTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Itens na estrutura:</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>{linhas.length}</span>
              </div>
              <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Preço venda est.:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#15803d' }}>{fmtR(form.preco_manual ? form.preco_venda : precoVenda)}</span>
              </div>
            </div>

            {/* Preço manual */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 10, color: '#374151' }}>
              <input type="checkbox" checked={form.preco_manual} onChange={e => set('preco_manual', e.target.checked)}
                style={{ accentColor: '#7c3aed', width: 13, height: 13 }} />
              Definir preço de venda manualmente
            </label>
            {form.preco_manual && (
              <div style={{ marginTop: 6 }}>
                <span style={lbl}>Preço de Venda (R$)</span>
                <input style={inp} type="number" min={0} step="0.01"
                  value={form.preco_venda} onChange={e => set('preco_venda', e.target.value)} />
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#374151' }}>
                <input type="checkbox" checked={form.ativo !== false} onChange={e => set('ativo', e.target.checked)}
                  style={{ accentColor: '#0f766e', width: 13, height: 13 }} />
                Produto ativo
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <span style={lbl}>Observações</span>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 40 }}
                value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
                placeholder="Notas adicionais..." />
            </div>

            {/* ── Fotos e Catálogo ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
                📸 Fotos e Catálogo
              </div>

              {/* Fotos */}
              <span style={lbl}>Fotos do Produto</span>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                padding: '6px 9px', border: '1px dashed #c4b5fd', borderRadius: 5,
                cursor: uploadingFoto ? 'wait' : 'pointer', background: '#faf5ff', fontSize: 10, color: '#7c3aed',
              }}>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  disabled={uploadingFoto}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) await uploadFoto(f);
                    e.target.value = '';
                  }} />
                {uploadingFoto ? '⏳ Enviando...' : '📎 Selecionar fotos (múltiplas)'}
              </label>

              {fotos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {fotos.map((url, i) => (
                    <div key={i} style={{ position: 'relative', width: 56, height: 56 }}>
                      <img src={url} alt={`foto-${i}`} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 5, border: '1px solid #d1d5db' }} />
                      <button onClick={() => removeFoto(i)} title="Remover"
                        style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, background: '#ef4444', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 9, cursor: 'pointer', lineHeight: '16px', textAlign: 'center', padding: 0 }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Catálogo PDF */}
              <span style={{ ...lbl, marginTop: 6 }}>Catálogo PDF</span>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 9px', border: '1px dashed #c4b5fd', borderRadius: 5,
                cursor: uploadingCatalogo ? 'wait' : 'pointer', background: '#faf5ff', fontSize: 10, color: '#7c3aed',
              }}>
                <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                  disabled={uploadingCatalogo}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) await uploadCatalogo(f);
                    e.target.value = '';
                  }} />
                {uploadingCatalogo ? '⏳ Enviando...' : '📄 Selecionar PDF'}
              </label>
              {catalogoUrl && (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <a href={catalogoUrl} target="_blank" rel="noreferrer"
                    style={{ color: '#7c3aed', textDecoration: 'underline', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📄 Ver catálogo
                  </a>
                  <button onClick={() => setCatalogoUrl('')}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita — BOM */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 14px 8px', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
                🔩 Estrutura do Produto (BOM — {linhas.length} item{linhas.length !== 1 ? 'ns' : ''})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ItemBuscador onSelect={addItem} excluirIds={excluirIds} />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
              {loadingBom ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 11 }}>Carregando estrutura...</div>
              ) : linhas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 11, fontStyle: 'italic', border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
                  Nenhum item na estrutura.<br />
                  <span style={{ fontSize: 10 }}>Busque e adicione itens do catálogo acima.</span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                  <thead>
                    <tr>
                      {['#', 'Item', 'Qtd', 'Un.', 'Custo Unit.', 'Total', 'Obs.', ''].map(h => (
                        <th key={h} style={{ background: '#1e293b', color: '#cbd5e1', padding: '5px 7px', fontSize: 9, fontWeight: 700, textAlign: h === 'Total' || h === 'Custo Unit.' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, idx) => {
                      const item   = l._item || {};
                      const cu     = Number(item.custo_unit) || 0;
                      const cu_c   = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
                      const total  = cu_c * (Number(l.quantidade) || 1);
                      return (
                        <tr key={l._tmpId || l.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '4px 7px', fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, fontWeight: 600 }}>
                            <div>{l.item_nome}</div>
                            {l.item_codigo && <div style={{ fontSize: 8, color: '#9ca3af' }}>{l.item_codigo}</div>}
                          </td>
                          <td style={{ padding: '4px 7px' }}>
                            <input
                              type="number" min={0.001} step="0.001"
                              value={l.quantidade}
                              onChange={e => setLinha(idx, 'quantidade', e.target.value)}
                              style={{ width: 56, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 10, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '4px 7px', fontSize: 10, color: '#6b7280' }}>{l.unidade}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{fmtR(cu_c)}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontFamily: 'monospace' }}>{fmtR(total)}</td>
                          <td style={{ padding: '4px 7px' }}>
                            <input
                              value={l.observacoes || ''}
                              onChange={e => setLinha(idx, 'observacoes', e.target.value)}
                              placeholder="obs."
                              style={{ width: 80, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 9 }}
                            />
                          </td>
                          <td style={{ padding: '4px 7px', textAlign: 'center' }}>
                            <button onClick={() => removeItem(idx)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} style={{ padding: '6px 7px', fontWeight: 700, fontSize: 10, color: '#6b7280', textAlign: 'right', borderTop: '2px solid #e2e8f0' }}>
                        Total custo BOM:
                      </td>
                      <td style={{ padding: '6px 7px', fontWeight: 800, fontSize: 12, color: '#0f766e', textAlign: 'right', borderTop: '2px solid #e2e8f0', fontFamily: 'monospace' }}>
                        {fmtR(custoTotal)}
                      </td>
                      <td colSpan={2} style={{ borderTop: '2px solid #e2e8f0' }} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0, background: '#fafafa', borderRadius: '0 0 10px 10px',
        }}>
          <button onClick={onClose} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151' }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={salvando || !form.nome?.trim()}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 5,
              background: !form.nome?.trim() ? '#9ca3af' : '#7c3aed', color: '#fff',
              cursor: !form.nome?.trim() ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 700, opacity: salvando ? .6 : 1,
            }}
          >
            {salvando ? 'Salvando...' : isEdit ? '💾 Salvar Produto' : '✅ Cadastrar Produto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de visualização de estrutura ──────────────────────────────────────
function BomViewer({ produto, onClose }: any) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('cadastro_produtos_itens')
      .select('*, cadastro_itens(custo_unit, ipi_pct, st_pct)')
      .eq('produto_id', produto.id)
      .order('ordem')
      .then(({ data }) => { setLinhas(data || []); setLoading(false); });
  }, [produto.id]);

  const custoTotal = linhas.reduce((acc, l) => {
    const item = l.cadastro_itens || {};
    const cu   = Number(item.custo_unit) || 0;
    const cu_c = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
    return acc + cu_c * (Number(l.quantidade) || 1);
  }, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 560, maxWidth: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#7c3aed', color: '#fff', padding: '10px 14px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🔩 Estrutura: {produto.nome}</div>
            <div style={{ fontSize: 10, color: '#ddd6fe' }}>{produto.categoria} · {produto.unidade}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 14 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>Carregando...</div>
          ) : linhas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontStyle: 'italic' }}>Nenhum item na estrutura.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'Item', 'Qtd', 'Un.', 'Total', 'Obs.'].map(h => (
                    <th key={h} style={{ background: '#1e293b', color: '#cbd5e1', padding: '5px 8px', fontSize: 9, fontWeight: 700, textAlign: h === 'Total' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const item  = l.cadastro_itens || {};
                  const cu    = Number(item.custo_unit) || 0;
                  const cu_c  = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
                  const total = cu_c * (Number(l.quantidade) || 1);
                  return (
                    <tr key={l.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '4px 8px', fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600 }}>{l.item_nome}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, textAlign: 'right' }}>{l.quantidade}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, color: '#6b7280' }}>{l.unidade}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontFamily: 'monospace' }}>{fmtR(total)}</td>
                      <td style={{ padding: '4px 8px', fontSize: 9, color: '#6b7280' }}>{l.observacoes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: '#6b7280', borderTop: '2px solid #e2e8f0' }}>Custo total BOM:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f766e', borderTop: '2px solid #e2e8f0', fontFamily: 'monospace' }}>{fmtR(custoTotal)}</td>
                  <td style={{ borderTop: '2px solid #e2e8f0' }} />
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: '#7c3aed' }}>Preço de venda ({produto.preco_manual ? 'manual' : 'calculado'}):</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#7c3aed', fontFamily: 'monospace' }}>{fmtR(produto.preco_venda)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CadastroProdutosTab({ currentUser }: { currentUser: any }) {
  const [produtos, setProdutos]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState('');
  const [filtCat, setFiltCat]         = useState('');
  const [filtAtivo, setFiltAtivo]     = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const [modal, setModal]             = useState<any>(null);
  const [bomView, setBomView]         = useState<any>(null);
  const [deletando, setDeletando]     = useState<string | null>(null);
  const [ordenar, setOrdenar]         = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'nome', dir: 'asc' });

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cadastro_produtos')
      .select('*')
      .order(ordenar.col, { ascending: ordenar.dir === 'asc' });
    setProdutos(data || []);
    setLoading(false);
  }, [ordenar]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = produtos.filter(p => {
    if (filtAtivo === 'ativo'   && !p.ativo) return false;
    if (filtAtivo === 'inativo' &&  p.ativo) return false;
    if (filtCat && p.categoria !== filtCat) return false;
    if (busca.trim()) {
      const t = busca.toLowerCase();
      return p.nome?.toLowerCase().includes(t) || p.codigo?.toLowerCase().includes(t) || p.categoria?.toLowerCase().includes(t);
    }
    return true;
  });

  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort();

  const sortBy = (col: string) =>
    setOrdenar(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const SortIcon = ({ col }: { col: string }) =>
    ordenar.col !== col ? <span style={{ opacity: .3 }}>⇅</span> : <span>{ordenar.dir === 'asc' ? '↑' : '↓'}</span>;

  const excluir = async (id: string) => {
    if (!window.confirm('Excluir este produto? A estrutura BOM também será removida.')) return;
    setDeletando(id);
    await supabase.from('cadastro_produtos').delete().eq('id', id);
    setProdutos(prev => prev.filter(p => p.id !== id));
    setDeletando(null);
  };

  const stats = {
    total:  produtos.length,
    ativos: produtos.filter(p => p.ativo).length,
    cats:   new Set(produtos.filter(p => p.categoria).map(p => p.categoria)).size,
  };

  const thStyle: React.CSSProperties = {
    background: '#1e293b', color: '#cbd5e1', padding: '6px 8px',
    fontSize: 9, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', borderRight: '1px solid #334155',
  };
  const tdStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 10 }}>
      {/* Cabeçalho */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>🏭 Produto e Mercadorias</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Produtos compostos de itens do catálogo (BOM — Bill of Materials)</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {[
            { label: 'Total', value: stats.total, cor: '#7c3aed' },
            { label: 'Ativos', value: stats.ativos, cor: '#16a34a' },
            { label: 'Categorias', value: stats.cats, cor: '#0f766e' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 6, padding: '5px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.cor }}>{s.value}</div>
              <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
          <button
            onClick={() => setModal({})}
            style={{ padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
          >
            ➕ Novo Produto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="🔍 Buscar por nome, código, categoria..."
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '5px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}
        />
        <select value={filtCat} onChange={e => setFiltCat(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['todos', 'ativo', 'inativo'] as const).map(v => (
          <button key={v} onClick={() => setFiltAtivo(v)}
            style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: filtAtivo === v ? '#7c3aed' : '#fff', color: filtAtivo === v ? '#fff' : '#374151' }}>
            {v === 'todos' ? 'Todos' : v === 'ativo' ? '✅ Ativos' : '⛔ Inativos'}
          </button>
        ))}
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>{filtrados.length} produto{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>Carregando produtos...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
            {produtos.length === 0
              ? 'Nenhum produto cadastrado. Clique em "Novo Produto" para começar.'
              : 'Nenhum produto encontrado para os filtros aplicados.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => sortBy('codigo')}>Código <SortIcon col="codigo" /></th>
                  <th style={thStyle} onClick={() => sortBy('nome')}>Nome do Produto <SortIcon col="nome" /></th>
                  <th style={thStyle} onClick={() => sortBy('categoria')}>Categoria <SortIcon col="categoria" /></th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Un.</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Custo BOM</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Markup%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => sortBy('preco_venda')}>Preço Venda <SortIcon col="preco_venda" /></th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ativo</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p, idx) => (
                  <tr key={p.id} style={{ background: p.ativo ? (idx % 2 === 0 ? '#fff' : '#fafafa') : '#fdf4ff' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', fontFamily: 'monospace', fontSize: 9 }}>{p.codigo || '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 240 }}>
                      <div>{p.nome}</div>
                      {p.descricao && <div style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230 }}>{p.descricao}</div>}
                    </td>
                    <td style={tdStyle}>
                      {p.categoria ? (
                        <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{p.categoria}</span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{p.unidade}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#374151', fontFamily: 'monospace', fontSize: 10 }}>—</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmtPct(p.markup_pct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#0f766e', fontSize: 11, fontFamily: 'monospace' }}>
                      {p.preco_venda ? fmtR(p.preco_venda) : <span style={{ color: '#d1d5db' }}>—</span>}
                      {p.preco_manual && <span style={{ fontSize: 8, color: '#9ca3af', marginLeft: 4 }}>(M)</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ background: p.ativo ? '#dcfce7' : '#fee2e2', color: p.ativo ? '#15803d' : '#991b1b', padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                        {p.ativo ? '✅ Ativo' : '⛔ Inativo'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => setBomView(p)} title="Ver estrutura BOM"
                          style={{ padding: '3px 7px', border: '1px solid #ddd6fe', background: '#ede9fe', borderRadius: 4, cursor: 'pointer', fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>
                          🔩
                        </button>
                        <button onClick={() => setModal(p)} title="Editar"
                          style={{ padding: '3px 8px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                          ✏️
                        </button>
                        <button onClick={() => excluir(p.id)} disabled={deletando === p.id} title="Excluir"
                          style={{ padding: '3px 8px', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4, cursor: 'pointer', fontSize: 10, opacity: deletando === p.id ? .5 : 1 }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modais */}
      {modal !== null && (
        <ProdutoModal
          produto={modal}
          onSave={() => { setModal(null); carregar(); }}
          onClose={() => setModal(null)}
          currentUser={currentUser}
        />
      )}
      {bomView && <BomViewer produto={bomView} onClose={() => setBomView(null)} />}
    </div>
  );
}
