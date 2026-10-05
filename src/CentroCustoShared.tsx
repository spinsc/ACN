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
import { ehAdminOuGerente } from './utils/permissoes';
import { logChange } from './AuditSystem';
import { confirmar, mostrarAviso } from './Feedback';
import { hojeISO } from './Interface';

export async function fetchCentrosCusto(incluirInativos = false) {
  let q = supabase.from('centros_custo').select('*').order('codigo');
  if (!incluirInativos) q = q.eq('ativo', true);
  const { data } = await q;
  return data || [];
}

// CÓDIGO DO CENTRO DE CUSTO — formato decidido com o usuário em 05/10/2026 (pergunta clicável):
//   raiz  = SIGLA-NNN           ex.: PROD-002   (a sigla é a área; NNN é o próximo número livre daquela sigla)
//   filho = CÓDIGO-DO-PAI.NN    ex.: PROD-002.01
// O sistema SUGERE o código ao criar e a pessoa pode editar. Ao trocar o código de um centro que já existe, o banco troca também o texto
// gravado nas compras, faturamentos, demandas e OPs (função renomear_codigo_centro_custo) — os códigos dos filhos NÃO mudam sozinhos.
const escaparRegex = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const siglaDoCodigo = (codigo: string) => (String(codigo || '').match(/^([A-Z]+)-/) || [])[1] || '';
export function sugerirCodigoCentro(centros: any[], parentId: string | null, sigla: string): string {
  if (parentId) {
    const pai = centros.find(c => c.id === parentId);
    if (!pai) return '';
    const re = new RegExp('^' + escaparRegex(pai.codigo) + '\\.(\\d+)$');
    const maior = Math.max(0, ...centros.map(c => Number((String(c.codigo).match(re) || [])[1] || 0)));
    return `${pai.codigo}.${String(maior + 1).padStart(2, '0')}`;
  }
  const s = String(sigla || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const re = new RegExp('^' + s + '-(\\d+)$');
  const maior = Math.max(0, ...centros.map(c => Number((String(c.codigo).match(re) || [])[1] || 0)));
  return `${s}-${String(maior + 1).padStart(3, '0')}`;
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
  // sigla da área (só para centro RAIZ novo) e se a pessoa já mexeu no código — enquanto não mexeu, o sistema continua sugerindo
  const [sigla, setSigla]       = useState('');
  const [codigoManual, setCodigoManual] = useState(false);
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

  // Enquanto a pessoa não digitou o código, ele é sugerido pela regra (pai escolhido → PAI.NN; sem pai → SIGLA-NNN)
  useEffect(() => {
    if (editando || codigoManual || !showForm) return;
    setForm(f => ({ ...f, codigo: sugerirCodigoCentro(centros, f.parent_id || null, sigla) }));
  }, [centros, form.parent_id, sigla, codigoManual, editando, showForm]);

  const abrirNovo = () => { setForm({ codigo:'', nome:'', descricao:'', parent_id:'' }); setSigla(''); setCodigoManual(false); setEditando(null); setShowForm(true); };

  const salvar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) { alert('Informe código e nome.'); return; }
    if (editando && form.parent_id === editando.id) { alert('Um centro não pode ser pai de si mesmo.'); return; }
    const codigo = form.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9./-]*$/.test(codigo)) { alert('Código inválido: use letras maiúsculas, números, ponto, barra ou hífen (ex.: PROD-002.01).'); return; }
    if (centros.some(c => c.codigo === codigo && c.id !== editando?.id)) { alert(`Já existe um centro de custo com o código ${codigo}.`); return; }
    setSalvando(true);
    const payload: any = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      parent_id: form.parent_id || null,
    };
    if (editando) {
      // trocar o código passa pela função do banco, que acompanha o texto gravado nas compras, faturamentos, demandas e OPs
      if (codigo !== editando.codigo) {
        const { data: r, error: errCod } = await supabase.rpc('renomear_codigo_centro_custo', { p_id: editando.id, p_novo: codigo });
        if (errCod) { setSalvando(false); alert('Não foi possível trocar o código: ' + errCod.message); return; }
        const soma = (r?.compras || 0) + (r?.faturamentos || 0) + (r?.demandas_setores || 0) + (r?.demandas_avulsas || 0) + (r?.ops || 0);
        mostrarAviso(`Código trocado: ${editando.codigo} → ${codigo}.${soma ? ` Atualizados ${soma} registro(s) onde ele estava escrito.` : ''}`, 'ok');
        logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: editando.id, changeType: 'UPDATE', oldRow: { codigo: editando.codigo }, newRow: { codigo }, user: currentUser });
      }
      const { error } = await supabase.from('centros_custo').update(payload).eq('id', editando.id);
      if (error) { setSalvando(false); alert('Não foi possível salvar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('centros_custo').insert([{ ...payload, codigo, ativo: true }]);
      if (error) { setSalvando(false); alert('Não foi possível salvar: ' + error.message); return; }
    }
    setForm({ codigo:'', nome:'', descricao:'', parent_id:'' }); setSigla(''); setCodigoManual(false);
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
            onClick={abrirNovo}>
            + Novo Centro de Custo
          </button>
        </div>
      )}

      {showForm && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:12, marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:11, marginBottom:10 }}>
            {editando ? '✏️ Editar Centro de Custo' : '+ Novo Centro de Custo'}
          </div>
          {!editando && !form.parent_id && (
            <div style={{ marginBottom:8 }}>
              <label className="acn-label">Sigla da área (para sugerir o código)</label>
              <input className="acn-input" style={{ width:'100%' }} list="siglas-centro-custo" placeholder="Ex: PROD, ADM, ATV"
                value={sigla} onChange={e => { setSigla(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); setCodigoManual(false); }} autoFocus />
              <datalist id="siglas-centro-custo">
                {[...new Set(centros.map(c => siglaDoCodigo(c.codigo)).filter(Boolean))].sort().map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8, marginBottom:8 }}>
            <div>
              <label className="acn-label">Código *</label>
              <input className="acn-input" style={{ width:'100%' }}
                placeholder={form.parent_id ? 'Sugerido pelo pai' : 'Digite a sigla acima'}
                value={form.codigo}
                onChange={e => { setCodigoManual(true); setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() })); }} />
              <div className="acn-ajuda" style={{ fontSize:9, marginTop:2 }}>
                {editando
                  ? 'Ao trocar o código, o texto gravado nas compras, demandas e OPs acompanha. Os códigos dos filhos não mudam sozinhos.'
                  : 'Gerado pelo sistema — pode editar.'}
              </div>
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
              value={form.parent_id} onChange={e => { setCodigoManual(false); setForm(f => ({ ...f, parent_id: e.target.value })); }}>
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
                <td style={{ padding:'8px 8px', fontWeight:700, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", color:'#0f766e' }}>
                  {'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo}
                  {c.codigo_anterior && <div style={{ fontSize:8, fontWeight:400, color:'#94a3b8' }} title="Código que o centro tinha antes da última troca">antes: {c.codigo_anterior}</div>}
                </td>
                <td style={{ padding:'8px 8px', fontWeight:700 }}>{c.nome}</td>
                <td style={{ padding:'8px 8px', color:'#64748b', maxWidth:220, wordBreak:'break-word' }} title={c.descricao || ''}>
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
                      onClick={() => { setForm({ codigo:c.codigo, nome:c.nome, descricao:c.descricao||'', parent_id:c.parent_id||'' }); setCodigoManual(true); setEditando(c); setShowForm(true); }}>
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
// "Parcelado" grava só o CONTRATO (valor:0, valor_total_negociado:X) — os
// pagamentos parciais em si (medições) são lançados depois, um a um, via
// ModalLancarMedicao (abaixo), a partir da lista de despesas do centro
// (ver ModalComprasCentro em FinanceiroTab.tsx). Ver plano "Pagamentos
// parcelados no Centro de Custo" — soma de despesas do centro já soma
// TODAS as linhas desta tabela, então o contrato (valor:0) não infla nada
// e cada medição conta como o pagamento real que é, sem mexer em nenhuma
// fórmula de totais existente.
// ─── EM QUANTAS VEZES (pedido do usuário em 29/09/2026) ───────────────────
// O contrato parcelado sabia o valor total, mas não em quantas vezes foi combinado — então a lista
// não conseguia dizer "pagas 2 de 6" nem sugerir o valor da próxima parcela. O número fica em
// `num_parcelas` (vazio = ainda não combinado; é o caso de todos os contratos anteriores).
// Não gera cronograma: as parcelas continuam sendo lançadas uma a uma como medições, na data em que
// são pagas — o número só serve de régua para conferir e sugerir o valor.
const lerParcelas = (txt: any): { ok: boolean; n: number | null } => {
  const s = String(txt ?? '').trim();
  if (!s) return { ok: true, n: null };
  const n = Number(s);
  return Number.isInteger(n) && n >= 2 && n <= 120 ? { ok: true, n } : { ok: false, n: null };
};
const MSG_PARCELAS = 'Em quantas vezes: informe um número inteiro de 2 a 120, ou deixe em branco se ainda não foi combinado.';

// escopo de módulo de propósito: declarado dentro de um modal, remontaria o campo a cada tecla
function CampoParcelas({ parcelas, onChange, total, feitas = 0 }: any) {
  const { ok, n } = lerParcelas(parcelas);
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="acn-label">Em quantas vezes?</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="acn-input" style={{ width: 72 }} inputMode="numeric" placeholder="ex: 6" aria-label="Número de parcelas"
          value={parcelas} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        {[2, 3, 4, 6, 10, 12].map(q => (
          <button key={q} type="button" onClick={() => onChange(String(q))}
            style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
              border: `1.5px solid ${n === q ? '#0f766e' : '#d1d5db'}`,
              background: n === q ? '#ccfbf1' : '#fff', color: n === q ? '#0f766e' : '#6b7280' }}>{q}x</button>
        ))}
      </div>
      {!ok && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 4 }}>{MSG_PARCELAS}</div>}
      {ok && n && total > 0 && (
        <div style={{ fontSize: 10, color: '#0f766e', marginTop: 4 }}>
          Cada parcela: <b>{moeda(total / n)}</b> ({moeda(total)} ÷ {n}). As parcelas entram depois, uma a uma, como medições.
        </div>
      )}
      {ok && !n && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Deixe em branco se ainda não foi combinado.</div>}
      {ok && feitas > 0 && (
        <div style={{ fontSize: 10, marginTop: 2, color: n && feitas > n ? '#b91c1c' : '#64748b' }}>
          Já lançadas: <b>{feitas}</b>{n ? ` de ${n}` : ''}{n && feitas > n ? ' — há mais medições do que parcelas combinadas.' : '.'}
        </div>
      )}
    </div>
  );
}

function ModalLancarDespesa({ centro, currentUser, onClose }: any) {
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(() => hojeISO());
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!v || v <= 0) { alert(parcelado ? 'Informe o valor total negociado.' : 'Informe um valor válido.'); return; }
    if (!descricao.trim()) { alert('Informe a descrição da despesa.'); return; }
    const p = lerParcelas(parcelas);
    if (parcelado && !p.ok) { alert(MSG_PARCELAS); return; }
    setSalvando(true);
    const payload: any = parcelado
      ? { centro_custo_id: centro.id, valor: 0, valor_total_negociado: v, parcelado: true, num_parcelas: p.n, descricao: descricao.trim(), data }
      : { centro_custo_id: centro.id, valor: v, descricao: descricao.trim(), data };
    const { error } = await supabase.from('centro_custo_despesas').insert([{
      ...payload, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema',
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao lançar despesa: ' + error.message); return; }
    alert(parcelado ? 'Contrato parcelado criado! Lance as medições (pagamentos) depois, na lista de despesas do centro.' : 'Despesa lançada!');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:400 }}>
        <div className="modal-title">💰 Lançar Despesa — {centro.codigo}</div>
        <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>{centro.nome}</div>
        <div style={{ display:'flex', gap:4, marginBottom:12 }}>
          {([[false,'À Vista'],[true,'Parcelado']] as const).map(([v,label]) => (
            <button key={label} type="button" onClick={() => setParcelado(v)}
              style={{ flex:1, padding:'6px', fontSize:10, fontWeight:700, borderRadius:4, cursor:'pointer',
                border:`1.5px solid ${parcelado===v ? '#0f766e' : '#d1d5db'}`,
                background: parcelado===v ? '#ccfbf1' : '#fff', color: parcelado===v ? '#0f766e' : '#6b7280' }}>
              {label}
            </button>
          ))}
        </div>
        <label className="acn-label">{parcelado ? 'Valor Total Negociado (R$) *' : 'Valor (R$) *'}</label>
        <input className="acn-input" style={{ width:'100%', marginBottom:10 }} placeholder="0,00" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        {parcelado && (
          <div style={{ fontSize:9, color:'#0f766e', marginTop:-6, marginBottom:10 }}>
            Isso só registra o valor combinado. Os pagamentos parciais (medições) são lançados depois, um a um.
          </div>
        )}
        {parcelado && <CampoParcelas parcelas={parcelas} onChange={setParcelas} total={parseFloat(String(valor).replace(',', '.')) || 0} />}
        <label className="acn-label">Descrição *</label>
        <textarea className="acn-input" rows={3} style={{ width:'100%', resize:'vertical', marginBottom:10, boxSizing:'border-box' }}
          placeholder="Ex: Manutenção do compressor, material extra..."
          value={descricao} onChange={e => setDescricao(e.target.value)} />
        <label className="acn-label">Data</label>
        <input type="date" className="acn-input" style={{ width:'100%', marginBottom:14 }}
          value={data} onChange={e => setData(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : parcelado ? '💾 Criar Contrato' : '💾 Lançar Despesa'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── LANÇAR MEDIÇÃO (pagamento parcial contra um contrato "Parcelado") ────
export function ModalLancarMedicao({ contrato, currentUser, onClose, onSaved }: any) {
  const [jaPago, setJaPago]   = useState<number | null>(null);
  const [qtdFeitas, setQtdFeitas] = useState(0);
  const [valor, setValor]     = useState('');
  const [obs, setObs]         = useState('');
  const [data, setData]       = useState(() => hojeISO());
  const [salvando, setSalvando] = useState(false);

  const totalNegociado = Number(contrato.valor_total_negociado) || 0;
  const nParcelas = Number(contrato.num_parcelas) || 0;
  // valor sugerido da próxima parcela = o que falta pagar ÷ as parcelas que faltam (só quando o número foi combinado)
  const sugestao = (pago: number, feitas: number) =>
    nParcelas > feitas && totalNegociado > pago ? Math.round((totalNegociado - pago) / (nParcelas - feitas) * 100) / 100 : 0;

  useEffect(() => {
    supabase.from('centro_custo_despesas').select('valor').eq('despesa_pai_id', contrato.id)
      .then(({ data }) => {
        const pago = (data || []).reduce((s: number, r: any) => s + (Number(r.valor) || 0), 0);
        setJaPago(pago); setQtdFeitas((data || []).length);
        const s = sugestao(pago, (data || []).length);
        // só preenche se a pessoa ainda não digitou nada
        if (s > 0) setValor(v => v || s.toFixed(2).replace('.', ','));
      });
  }, [contrato.id]);

  const vNum = parseFloat(String(valor).replace(',', '.')) || 0;
  const somaComEsta = (jaPago || 0) + vNum;
  const excedente = somaComEsta - totalNegociado;
  const numeroDaParcela = qtdFeitas + 1;

  const salvar = async () => {
    if (!vNum || vNum <= 0) { alert('Informe um valor válido.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_despesas').insert([{
      centro_custo_id: contrato.centro_custo_id, despesa_pai_id: contrato.id, valor: vNum,
      descricao: obs.trim() || (nParcelas ? `Parcela ${numeroDaParcela}/${nParcelas} — ${contrato.descricao || ''}` : `Medição — ${contrato.descricao || ''}`), data,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema',
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao lançar medição: ' + error.message); return; }
    onSaved?.();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:400 }}>
        <div className="modal-title">🧾 Lançar Medição — {contrato.descricao}</div>
        <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>
          Total negociado: <strong>R$ {totalNegociado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
          {' · '}Já pago: <strong>{jaPago == null ? '...' : `R$ ${jaPago.toLocaleString('pt-BR',{minimumFractionDigits:2})}`}</strong>
          {nParcelas > 0 && jaPago != null && (
            <div style={{ marginTop: 4, color: qtdFeitas >= nParcelas ? '#b45309' : '#0f766e', fontWeight: 700 }}>
              {qtdFeitas >= nParcelas
                ? `As ${nParcelas} parcelas combinadas já foram lançadas (${qtdFeitas}).`
                : `Parcela ${numeroDaParcela} de ${nParcelas}${sugestao(jaPago, qtdFeitas) > 0 ? ` — sugestão: R$ ${sugestao(jaPago, qtdFeitas).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''}`}
            </div>
          )}
        </div>
        <label className="acn-label">Valor desta Medição (R$) *</label>
        <input className="acn-input" style={{ width:'100%', marginBottom:6 }} placeholder="0,00" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        {vNum > 0 && excedente > 0 && (
          <div style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:4, padding:'6px 8px', marginBottom:10 }}>
            ⚠️ Isso ultrapassa o valor total negociado em R$ {excedente.toLocaleString('pt-BR',{minimumFractionDigits:2})}.
          </div>
        )}
        <label className="acn-label">Observação</label>
        <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical', marginBottom:10, boxSizing:'border-box' }}
          placeholder={nParcelas ? `Ex: referente à etapa X (sem texto, vai como "Parcela ${numeroDaParcela}/${nParcelas}")` : 'Ex: 1ª parcela, referente à etapa X...'}
          value={obs} onChange={e => setObs(e.target.value)} />
        <label className="acn-label">Data</label>
        <input type="date" className="acn-input" style={{ width:'100%', marginBottom:14 }}
          value={data} onChange={e => setData(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '💾 Lançar Medição'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR / EXCLUIR UM LANÇAMENTO DO CENTRO DE CUSTO
//
// Pedido do usuário em 24/09/2026. Até aqui o lançamento era criado e nunca
// mais tocado: erro de valor, descrição trocada ou centro errado ficavam na
// conta para sempre, e o total do centro passava a mentir.
//
// Só Admin e gerentes, porque isto mexe em número que vira relatório e
// conciliação. Toda alteração e toda exclusão vão para a auditoria com o valor
// de antes e o de depois — o histórico é o que permite conferir depois.
//
// Trocar o centro de custo do lançamento é de propósito: "lancei no centro
// errado" é o engano mais comum, e sem isso a correção seria apagar e lançar
// de novo, perdendo quem lançou e quando.
// ─────────────────────────────────────────────────────────────────────────────
export const podeEditarLancamento = (u: any) => ehAdminOuGerente(u);

const moeda = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ModalEditarLancamento({ lancamento, jaPago = 0, medicoes = 0, currentUser, onClose, onSalvo }: any) {
  const eraContrato = !!lancamento?.parcelado;
  const ehMedicao = !!lancamento?.despesa_pai_id;
  // "Em quantas vezes?" abre com o número que já estava combinado (pedido do usuário em 29/09/2026)
  const [parcelas, setParcelas] = useState(String(lancamento?.num_parcelas || ''));
  const [descricao, setDescricao] = useState(lancamento?.descricao || '');
  const [valor, setValor] = useState(String(
    (eraContrato ? lancamento?.valor_total_negociado : lancamento?.valor) ?? '').replace('.', ','));
  const [data, setData] = useState(String(lancamento?.data || '').slice(0, 10));
  const [centroId, setCentroId] = useState(lancamento?.centro_custo_id || '');
  const [salvando, setSalvando] = useState(false);
  /**
   * À VISTA ↔ PARCELADO TAMBÉM NA EDIÇÃO (28/09/2026)
   *
   * A tela de lançar oferece a escolha; a de editar não oferecia. Quem lançava
   * uma despesa à vista e depois descobria que o fornecedor ia parcelar tinha
   * de excluir e lançar de novo — perdendo a data original e o registro de
   * quem lançou.
   *
   * Medição não muda de forma: ela é o pagamento de um contrato, não um
   * lançamento independente.
   */
  const [ehContrato, setEhContrato] = useState(eraContrato);
  const trocouForma = ehContrato !== eraContrato;

  const num = (v: any) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const v = num(valor);
  const abaixoDoPago = ehContrato && Number.isFinite(v) && jaPago > 0 && v < jaPago;
  const trocouCentro = centroId && centroId !== lancamento?.centro_custo_id;

  const salvar = async () => {
    if (!descricao.trim()) { alert('Informe a descrição.'); return; }
    if (!Number.isFinite(v) || v < 0) { alert('Informe um valor válido.'); return; }
    if (!data) { alert('Informe a data.'); return; }
    if (!centroId) { alert('Escolha o centro de custo.'); return; }
    const pp = lerParcelas(parcelas);
    if (ehContrato && !pp.ok) { alert(MSG_PARCELAS); return; }
    // menos parcelas do que as medições já lançadas: pode ser renegociação ou erro de digitação — pergunta
    if (ehContrato && pp.n && medicoes > pp.n && !await confirmar(
      `Já existem ${medicoes} medições lançadas neste contrato, e você combinou ${pp.n} parcelas.\n\n` +
      `A lista vai mostrar "${medicoes} de ${pp.n}". Se foi renegociação, tudo bem. Salvar assim?`)) return;
    // contrato com total abaixo do já pago: avisa, mas deixa seguir — renegociar
    // para menos acontece (decidido com o usuário em 24/09/2026)
    if (abaixoDoPago && !await confirmar(
      `O total negociado (${moeda(v)}) ficou ABAIXO do que já foi pago (${moeda(jaPago)}).\n\n` +
      `O contrato vai aparecer com mais de 100% pago. Se foi renegociação, tudo bem. Salvar assim?`)) return;

    // virar contrato em despesa à vista com medições lançadas deixaria os
    // pagamentos sem contrato e o total do centro contaria o dinheiro duas
    // vezes — uma na despesa, outra em cada medição
    if (trocouForma && eraContrato && jaPago > 0) {
      alert(`Este contrato já tem ${moeda(jaPago)} em medições lançadas.\n\n`
        + `Para voltar a ser à vista, apague as medições primeiro — senão elas ficam sem contrato `
        + `e o centro de custo conta o mesmo dinheiro duas vezes.`);
      return;
    }
    if (trocouForma && !await confirmar(ehContrato
      ? `Transformar esta despesa à vista em CONTRATO PARCELADO?\n\n`
        + `${moeda(v)} passa a ser o total negociado, e os pagamentos entram depois como medições. `
        + `Até a primeira medição, o centro de custo vai mostrar este contrato com 0% pago.`
      : `Transformar este contrato em despesa À VISTA?\n\n`
        + `${moeda(v)} passa a contar direto no total do centro de custo.`)) return;

    setSalvando(true);
    const antes = {
      descricao: lancamento.descricao, data: lancamento.data, centro_custo_id: lancamento.centro_custo_id,
      valor: lancamento.valor, valor_total_negociado: lancamento.valor_total_negociado,
      parcelado: lancamento.parcelado, num_parcelas: lancamento.num_parcelas ?? null,
    };
    // no contrato o dinheiro mora em valor_total_negociado e `valor` fica 0 —
    // é o que faz o contrato não inflar a soma do centro (ver ModalLancarDespesa)
    const depois: any = { descricao: descricao.trim(), data, centro_custo_id: centroId };
    if (ehContrato) { depois.parcelado = true;  depois.valor_total_negociado = v; depois.valor = 0; }
    else            { depois.parcelado = false; depois.valor = v; depois.valor_total_negociado = null; }
    // o número de parcelas é do contrato: a medição não tem, e virar à vista o zera
    if (!ehMedicao) depois.num_parcelas = ehContrato ? pp.n : null;

    const { error } = await supabase.from('centro_custo_despesas').update(depois).eq('id', lancamento.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: lancamento.id,
      changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
    onSalvo?.();
    onClose();
  };

  const excluir = async () => {
    const quanto = ehContrato ? lancamento.valor_total_negociado : lancamento.valor;
    const aviso = ehContrato && jaPago > 0
      ? `\n\nATENÇÃO: este contrato tem ${moeda(jaPago)} em medições lançadas. Elas NÃO são apagadas e vão ficar sem contrato — confira a lista depois.`
      : '';
    if (!await confirmar(
      `Excluir este lançamento?\n\n${lancamento.descricao}\n${moeda(quanto)} · ` +
      `${String(lancamento.data).slice(0, 10).split('-').reverse().join('/')}\n\n` +
      `O total do centro de custo muda na hora. Fica registrado na auditoria quem excluiu.${aviso}`)) return;
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_despesas').delete().eq('id', lancamento.id);
    setSalvando(false);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: lancamento.id,
      changeType: 'DELETE', oldRow: lancamento, newRow: null, user: currentUser });
    onSalvo?.();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2300 }}
      onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="modal-title">
          ✏️ Editar lançamento{eraContrato ? ' — contrato parcelado' : ehMedicao ? ' — medição' : ''}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Lançado por {lancamento.criado_por_nome || '—'}
          {lancamento.criado_em ? ` em ${new Date(lancamento.criado_em).toLocaleDateString('pt-BR')}` : ''}.
          A alteração fica na auditoria com o valor de antes.
        </div>

        {/* Medição é o pagamento de um contrato, não um lançamento que possa
            mudar de forma — por isso a escolha não aparece para ela. */}
        {!ehMedicao && (
          <>
            <label className="acn-label">Forma</label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {([[false, 'À Vista'], [true, 'Parcelado']] as const).map(([v, label]) => (
                <button key={label} type="button" onClick={() => setEhContrato(v)}
                  style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                    border: `1.5px solid ${ehContrato === v ? '#0f766e' : '#d1d5db'}`,
                    background: ehContrato === v ? '#ccfbf1' : '#fff',
                    color: ehContrato === v ? '#0f766e' : '#6b7280' }}>
                  {label}
                </button>
              ))}
            </div>
            {trocouForma && (
              <div style={{ fontSize: 10, color: '#b45309', background: '#fffbeb',
                border: '1px solid #fcd34d', borderRadius: 5, padding: '6px 8px', marginBottom: 10 }}>
                {ehContrato
                  ? 'Vira contrato: o valor passa a ser o total negociado e os pagamentos entram depois como medições.'
                  : 'Vira despesa à vista: o valor passa a contar direto no total do centro de custo.'}
              </div>
            )}
          </>
        )}

        <label className="acn-label">Descrição *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 8 }} autoFocus
          value={descricao} onChange={e => setDescricao(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="acn-label">{ehContrato ? 'Valor total negociado (R$) *' : 'Valor (R$) *'}</label>
            <input className="acn-input" style={{ width: '100%' }} inputMode="decimal"
              value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="acn-label">Data *</label>
            <input type="date" className="acn-input" style={{ width: '100%' }}
              value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        {/* Em quantas vezes: só no contrato parcelado (medição é o pagamento de UMA parcela) */}
        {ehContrato && !ehMedicao && (
          <div style={{ marginTop: 8 }}>
            <CampoParcelas parcelas={parcelas} onChange={setParcelas} total={Number.isFinite(v) ? v : 0} feitas={medicoes} />
          </div>
        )}
        {ehContrato && jaPago > 0 && (
          <div style={{ fontSize: 10, color: abaixoDoPago ? '#b91c1c' : '#64748b', marginTop: 6 }}>
            Já lançado em medições: <b>{moeda(jaPago)}</b>
            {abaixoDoPago ? ' — o novo total fica abaixo disso, e o contrato vai passar de 100% pago.' : ''}
          </div>
        )}

        <label className="acn-label" style={{ marginTop: 8 }}>Centro de custo *</label>
        <CentroCustoSelect value={centroId} onChange={setCentroId} permitirNenhum={false} />
        {trocouCentro && (
          <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>
            O valor sai do centro atual e entra no novo — os dois totais mudam.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="acn-btn" style={{ background: '#dc2626' }} disabled={salvando} onClick={excluir}>
            Excluir
          </button>
          <div style={{ flex: 1 }} />
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="acn-btn" style={{ background: '#16a34a' }} disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR UM PEDIDO DE COMPRA A PARTIR DO CENTRO DE CUSTO (28/09/2026)
//
// A lista de compras de um centro mistura duas coisas: os lançamentos do
// próprio centro (despesa avulsa, contrato, medição) e os PEDIDOS DE COMPRA que
// foram alocados naquele centro. Os primeiros já tinham botão de editar; os
// pedidos não tinham ação nenhuma, e é justamente neles que o erro aparece —
// pedido lançado no centro errado, ou com valor diferente do que foi pago.
//
// Aqui se corrige o que é da conta do Financeiro: o centro, o valor, a
// descrição e a data. Fornecedor, cotação, aprovação e Ordem de Compra
// continuam sendo do módulo de Compras, porque lá eles têm fluxo e histórico
// próprios — duplicar isso aqui criaria duas verdades.
// ─────────────────────────────────────────────────────────────────────────────
export function ModalEditarPedidoCompra({ pedido, currentUser, onClose, onSalvo }: any) {
  const [descricao, setDescricao] = useState(pedido?.descricao_material || '');
  const [valor, setValor] = useState(String(pedido?.valor_compra ?? '').replace('.', ','));
  const [data, setData] = useState(String(pedido?.data_solicitacao || '').slice(0, 10));
  const [centroId, setCentroId] = useState(pedido?.centro_custo_id || '');
  const [salvando, setSalvando] = useState(false);

  const num = (v: any) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const v = num(valor);
  const trocouCentro = (centroId || null) !== (pedido?.centro_custo_id || null);

  const salvar = async () => {
    if (!descricao.trim()) { alert('Informe a descrição do material.'); return; }
    if (valor !== '' && (!Number.isFinite(v) || v < 0)) { alert('Informe um valor válido.'); return; }
    setSalvando(true);
    const antes = {
      descricao_material: pedido.descricao_material, valor_compra: pedido.valor_compra,
      data_solicitacao: pedido.data_solicitacao, centro_custo_id: pedido.centro_custo_id,
    };
    const depois: any = {
      descricao_material: descricao.trim(),
      valor_compra: valor === '' ? null : v,
      centro_custo_id: centroId || null,
    };
    if (data) depois.data_solicitacao = data;
    const { error } = await supabase.from('pcp_pedidos_compra').update(depois).eq('id', pedido.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'pcp_pedidos_compra', entityId: pedido.id,
      changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
    onSalvo?.();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2300 }}
      onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-title">🛒 Editar pedido de compra — {pedido.numero_pedido || '—'}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Fornecedor {pedido.fornecedor || '—'} · status {pedido.status_compra || '—'}
          {pedido.numero_oc ? ` · OC ${pedido.numero_oc}` : ''}.
          A alteração fica na auditoria com o valor de antes.
        </div>

        <label className="acn-label">Descrição do material *</label>
        <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
          value={descricao} onChange={e => setDescricao(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="acn-label">Valor da compra (R$)</label>
            <input className="acn-input" style={{ width: '100%' }} inputMode="decimal"
              value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="acn-label">Data</label>
            <input type="date" className="acn-input" style={{ width: '100%' }}
              value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <label className="acn-label" style={{ marginTop: 8 }}>Centro de custo</label>
        <CentroCustoSelect value={centroId} onChange={setCentroId} permitirNenhum={true} />
        {trocouCentro && (
          <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>
            O valor sai do centro atual e entra no novo — os dois totais mudam.
          </div>
        )}

        <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 10, background: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
          Fornecedor, cotação, aprovação e Ordem de Compra são alterados no módulo de Compras,
          onde cada um tem o seu fluxo e o seu histórico.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="acn-btn" style={{ background: '#16a34a' }} disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
