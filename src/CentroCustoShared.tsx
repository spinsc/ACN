// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE CUSTO — componente único compartilhado (Fase 7)
// Antes existiam 3 implementações duplicadas de CRUD (AdminTab.tsx
// PainelCentrosCusto, ComprasTab.tsx modalGerCentros, FinanceiroTab.tsx
// ModalCentros), todas em lista plana, sem hierarquia. Este arquivo
// centraliza: helpers de árvore/hierarquia, um <select> reutilizável com
// indentação (CentroCustoSelect) para usar em formulários, e o painel de
// gestão completo (CentrosCustoManager) reaproveitado nos 3 lugares.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export async function fetchCentrosCusto(incluirInativos = false) {
  let q = supabase.from('centros_custo').select('*').order('codigo');
  if (!incluirInativos) q = q.eq('ativo', true);
  const { data } = await q;
  return data || [];
}

// Retorna a lista em ordem de árvore (pai imediatamente antes dos filhos),
// cada item com `nivel` (0 = raiz) para indentação visual.
export function ordenarArvore(centros: any[]) {
  const porPai: Record<string, any[]> = {};
  centros.forEach(c => { const p = c.parent_id || 'raiz'; (porPai[p] ||= []).push(c); });
  const resultado: any[] = [];
  const visitar = (paiId: string | null, nivel: number, visitados: Set<string>) => {
    (porPai[paiId || 'raiz'] || []).forEach(c => {
      if (visitados.has(c.id)) return; // guarda contra ciclo acidental
      resultado.push({ ...c, nivel });
      visitar(c.id, nivel + 1, new Set(visitados).add(c.id));
    });
  };
  visitar(null, 0, new Set());
  // Sobra: centros cujo parent_id aponta para algo fora da lista (órfão) —
  // mostra como raiz em vez de desaparecer silenciosamente.
  const idsColocados = new Set(resultado.map(c => c.id));
  centros.forEach(c => { if (!idsColocados.has(c.id)) resultado.push({ ...c, nivel: 0 }); });
  return resultado;
}

// "FLUTUANTE > PIER" — cadeia completa até a raiz, para exibir em badges e
// nos textos gravados como fallback (centro_custo texto livre).
export function labelHierarquico(centro: any, todosCentros: any[]) {
  const porId = Object.fromEntries(todosCentros.map(c => [c.id, c]));
  const cadeia: string[] = [];
  let atual = centro;
  let guarda = 0;
  while (atual && guarda++ < 10) {
    cadeia.unshift(atual.codigo);
    atual = atual.parent_id ? porId[atual.parent_id] : null;
  }
  return cadeia.join(' > ');
}

// Todos os ids de descendentes de um centro (filhos, netos, ...) — usado
// para "um pedido/despesa de um centro filho também conta no total do pai"
// nos relatórios (Financeiro, RelatoriosTab).
export function idsComDescendentes(centroId: string, todosCentros: any[]): string[] {
  const resultado = [centroId];
  const filhos = todosCentros.filter(c => c.parent_id === centroId);
  filhos.forEach(f => { idsComDescendentes(f.id, todosCentros).forEach(id => resultado.push(id)); });
  return resultado;
}

// ─── SELECT REUTILIZÁVEL (formulários de pedido/demanda) ──────────────────
export function CentroCustoSelect({ value, onChange, permitirNenhum = true, style, className }: any) {
  const [centros, setCentros] = useState<any[]>([]);
  useEffect(() => { fetchCentrosCusto().then(setCentros); }, []);
  const arvore = ordenarArvore(centros);
  return (
    <select className={className} value={value || ''} onChange={e => onChange(e.target.value || null)}
      style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, ...style }}>
      {permitirNenhum && <option value="">— Não informar —</option>}
      {arvore.map(c => (
        <option key={c.id} value={c.id}>{'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo} — {c.nome}</option>
      ))}
    </select>
  );
}

// ─── PAINEL DE GESTÃO COMPLETO ─────────────────────────────────────────────
// `embutido` — quando true, renderiza sem o wrapper "sec-card" (uso dentro
// de um modal já existente em Compras/Financeiro); quando false (padrão),
// monta como card de página inteira (uso no Admin).
export function CentrosCustoManager({ embutido = false, currentUser }: any = {}) {
  const [centros, setCentros]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [form, setForm]         = useState({ codigo:'', nome:'', descricao:'', parent_id:'' });
  const [editando, setEditando] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [modalDespesa, setModalDespesa] = useState<any>(null); // centro selecionado para lançar despesa

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('centros_custo').select('*').order('codigo');
    setCentros(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) { alert('Informe código e nome.'); return; }
    if (editando && form.parent_id === editando.id) { alert('Um centro não pode ser pai de si mesmo.'); return; }
    setSalvando(true);
    const payload: any = {
      codigo: form.codigo.trim().toUpperCase(),
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      parent_id: form.parent_id || null,
    };
    if (editando) {
      await supabase.from('centros_custo').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('centros_custo').insert([{ ...payload, ativo: true }]);
    }
    setForm({ codigo:'', nome:'', descricao:'', parent_id:'' });
    setEditando(null); setShowForm(false); setSalvando(false);
    load();
  };

  const toggleAtivo = async (c: any) => {
    await supabase.from('centros_custo').update({ ativo: !c.ativo }).eq('id', c.id);
    load();
  };

  const arvore = ordenarArvore(centros);
  // Ao editar, um centro não pode virar filho de si mesmo nem de um dos
  // seus próprios descendentes (evitaria ciclo).
  const descendentesDe = (id: string): Set<string> => {
    const s = new Set<string>();
    const filhos = centros.filter(c => c.parent_id === id);
    filhos.forEach(f => { s.add(f.id); descendentesDe(f.id).forEach(x => s.add(x)); });
    return s;
  };
  const paisDisponiveis = editando
    ? arvore.filter(c => c.id !== editando.id && !descendentesDe(editando.id).has(c.id))
    : arvore;

  const conteudo = (
    <>
      <p style={{ fontSize:10, color:'#64748b', marginBottom:12 }}>
        Usados para classificar pedidos de compra e apontar custos. Um centro pode ter um "pai"
        (ex: FLUTUANTE {'>'}  PIER {'>'} ILHA) — o filho aparece indentado abaixo do pai na lista.
      </p>

      {!showForm && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
          <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
            onClick={() => { setForm({ codigo:'', nome:'', descricao:'', parent_id:'' }); setEditando(null); setShowForm(true); }}>
            + Novo Centro de Custo
          </button>
        </div>
      )}

      {showForm && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
            {editando ? '✏️ Editar Centro de Custo' : '+ Novo Centro de Custo'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8, marginBottom:8 }}>
            <div>
              <label className="acn-label">Código *</label>
              <input className="acn-input" style={{ width:'100%' }}
                placeholder="Ex: RH, TI, PROD"
                value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                autoFocus />
            </div>
            <div>
              <label className="acn-label">Nome *</label>
              <input className="acn-input" style={{ width:'100%' }}
                placeholder="Nome completo do centro"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <label className="acn-label">Centro de Custo Pai (opcional)</label>
            <select className="acn-input" style={{ width:'100%' }}
              value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}>
              <option value="">— Nenhum (é um centro raiz) —</option>
              {paisDisponiveis.map(c => (
                <option key={c.id} value={c.id}>{'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo} — {c.nome}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom:10 }}>
            <label className="acn-label">Descrição</label>
            <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical' }}
              placeholder="Observações sobre o uso deste centro de custo (opcional)"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'SALVAR'}
            </button>
            <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={() => { setShowForm(false); setEditando(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:20, color:'#64748b', fontSize:11 }}>Carregando...</div>}
      {!loading && centros.length === 0 && (
        <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:11 }}>
          Nenhum centro de custo cadastrado. Clique em <strong>+ Novo Centro de Custo</strong> para começar.
        </div>
      )}

      {centros.length > 0 && (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Código</th>
              <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Nome</th>
              <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Descrição</th>
              <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, fontSize:9, color:'#475569', borderBottom:'1px solid #e2e8f0' }}>Status</th>
              <th style={{ padding:'6px 8px', borderBottom:'1px solid #e2e8f0' }}></th>
            </tr>
          </thead>
          <tbody>
            {arvore.map(c => (
              <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9', opacity: c.ativo ? 1 : 0.45 }}>
                <td style={{ padding:'8px 8px', fontWeight:700, fontFamily:'monospace', color:'#0f766e' }}>
                  {'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo}
                </td>
                <td style={{ padding:'8px 8px', fontWeight:700 }}>{c.nome}</td>
                <td style={{ padding:'8px 8px', color:'#64748b', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.descricao || ''}>
                  {c.descricao || '—'}
                </td>
                <td style={{ padding:'8px 8px', textAlign:'center' }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:10,
                    background: c.ativo ? '#dcfce7' : '#f1f5f9',
                    color:      c.ativo ? '#16a34a'  : '#94a3b8' }}>
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td style={{ padding:'8px 6px' }}>
                  <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                    <button className="acn-btn" style={{ background:'#16a34a', fontSize:9, padding:'2px 8px' }}
                      onClick={() => setModalDespesa(c)} title="Lançar despesa avulsa neste centro">
                      💰
                    </button>
                    <button className="acn-btn" style={{ background: c.ativo ? '#f59e0b' : '#16a34a', fontSize:9, padding:'2px 8px' }}
                      onClick={() => toggleAtivo(c)}>
                      {c.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="acn-btn" style={{ background:'#0891b2', fontSize:9, padding:'2px 8px' }}
                      onClick={() => { setForm({ codigo:c.codigo, nome:c.nome, descricao:c.descricao||'', parent_id:c.parent_id||'' }); setEditando(c); setShowForm(true); }}>
                      ✏️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  const modalDespesaEl = modalDespesa && (
    <ModalLancarDespesa centro={modalDespesa} currentUser={currentUser}
      onClose={() => setModalDespesa(null)} />
  );

  if (embutido) return <div>{conteudo}{modalDespesaEl}</div>;

  return (
    <div className="sec-card">
      <div className="sec-header">
        <span>🏷️ Centros de Custo</span>
      </div>
      <div className="sec-body">{conteudo}</div>
      {modalDespesaEl}
    </div>
  );
}

// ─── LANÇAR DESPESA AVULSA ─────────────────────────────────────────────────
function ModalLancarDespesa({ centro, currentUser, onClose }: any) {
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0,10));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!v || v <= 0) { alert('Informe um valor válido.'); return; }
    if (!descricao.trim()) { alert('Informe a descrição da despesa.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_despesas').insert([{
      centro_custo_id: centro.id, valor: v, descricao: descricao.trim(), data,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema',
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao lançar despesa: ' + error.message); return; }
    alert('✅ Despesa lançada!');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:400 }}>
        <div className="modal-title">💰 Lançar Despesa — {centro.codigo}</div>
        <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>{centro.nome}</div>
        <label className="acn-label">Valor (R$) *</label>
        <input className="acn-input" style={{ width:'100%', marginBottom:10 }} placeholder="0,00" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        <label className="acn-label">Descrição *</label>
        <textarea className="acn-input" rows={3} style={{ width:'100%', resize:'vertical', marginBottom:10, boxSizing:'border-box' }}
          placeholder="Ex: Manutenção do compressor, material extra..."
          value={descricao} onChange={e => setDescricao(e.target.value)} />
        <label className="acn-label">Data</label>
        <input type="date" className="acn-input" style={{ width:'100%', marginBottom:14 }}
          value={data} onChange={e => setData(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '💾 Lançar Despesa'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
