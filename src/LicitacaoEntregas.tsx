// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LICITAÇÃO VENCIDA — ENDEREÇOS, CONTRATO E ENTREGAS
// Ganhar "10 adaptações" não significa entregar 10 de uma vez: o órgão pede
// 1 agora, 2 depois, 6 depois (e pode nunca pedir as 10), ou pede as 10 e ainda
// faz um aditivo para mais. Aqui fica esse controle, decidido com o usuário:
//  • POR ITEM DO EDITAL: cada item tem quantidade contratada, aditivos, pedidos
//    e saldo (contratado + aditivos − pedidos);
//  • cada PEDIDO de entrega (empenho / ordem de fornecimento) gera a sua OP;
//  • um endereço por pedido — a licitação pode ter vários endereços.
// Tudo grava direto no banco (tabelas licitacao_*), fora do "Salvar Alterações"
// do formulário, como os documentos e a Área Livre.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { UFS } from './FluxoEntrega';
import NovaOpOsModal from './NovaOpOsModal';

const n = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const fmtQ = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const lbl = { display:'block', fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:2 } as const;
const inp = { width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' } as const;
const btn = (cor, cheio = true) => ({ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:4, cursor:'pointer',
  border:`1px solid ${cor}`, background: cheio ? cor : '#fff', color: cheio ? '#fff' : cor });

export const textoEndereco = (e) => e
  ? [e.identificacao, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ') || '(endereço sem nome)'
  : '—';

// ═════════════════════════════════════════════════════════════════════════════
// ENDEREÇOS DE ENTREGA
// ═════════════════════════════════════════════════════════════════════════════
const END_VAZIO = { identificacao:'', endereco:'', cidade:'', uf:'', cep:'' };

export function EnderecosEntrega({ licitacaoId }) {
  const [lista, setLista] = useState([]);
  const [editando, setEditando] = useState(null);   // null | 'novo' | id
  const [form, setForm] = useState(END_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('licitacao_enderecos').select('*')
      .eq('licitacao_id', licitacaoId).order('ordem').order('criado_em');
    setLista(data || []);
  }, [licitacaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (e) => { setEditando(e ? e.id : 'novo'); setForm(e ? { ...END_VAZIO, ...e } : END_VAZIO); };

  const salvar = async () => {
    if (!form.cidade?.trim() || !form.uf) { alert('Informe ao menos a cidade e a UF.'); return; }
    setSalvando(true);
    const payload = {
      identificacao: form.identificacao?.trim() || null, endereco: form.endereco?.trim() || null,
      cidade: form.cidade.trim(), uf: form.uf, cep: form.cep?.trim() || null,
    };
    const { error } = editando === 'novo'
      ? await supabase.from('licitacao_enderecos').insert([{ ...payload, licitacao_id: licitacaoId, ordem: lista.length }])
      : await supabase.from('licitacao_enderecos').update(payload).eq('id', editando);
    setSalvando(false);
    if (error) { alert('Erro ao salvar endereço: ' + error.message); return; }
    setEditando(null); carregar();
  };

  const remover = async (e) => {
    // pedido que usava este endereço fica sem endereço (on delete set null), não some
    if (!confirm(`Remover o endereço "${textoEndereco(e)}"?`)) return;
    await supabase.from('licitacao_enderecos').delete().eq('id', e.id);
    carregar();
  };

  return (
    <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'7px 9px', marginBottom:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <label style={{ ...lbl, color:'#0369a1', marginBottom:0 }}>Endereços de Entrega</label>
        {editando === null && <button type="button" onClick={() => abrir(null)} style={btn('#0369a1', false)}>+ Endereço</button>}
      </div>
      {lista.length === 0 && editando === null && (
        <div style={{ fontSize:10, color:'#64748b' }}>Nenhum endereço. Cadastre um ou mais — cada pedido de entrega escolhe o seu.</div>
      )}
      {lista.map(e => editando === e.id ? null : (
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #e0f2fe', borderRadius:4, padding:'4px 7px', marginBottom:3 }}>
          <div style={{ flex:1, fontSize:10, minWidth:0 }}>
            <strong>{e.identificacao || '(sem nome)'}</strong>
            <span style={{ color:'#475569' }}> · {[e.endereco, e.cidade && `${e.cidade}/${e.uf || ''}`, e.cep].filter(Boolean).join(' · ')}</span>
          </div>
          <button type="button" onClick={() => abrir(e)} title="Editar" style={{ ...btn('#0369a1', false), padding:'1px 6px' }}>✏️</button>
          <button type="button" onClick={() => remover(e)} title="Remover endereço" style={{ ...btn('#dc2626', false), padding:'1px 6px' }}>🗑</button>
        </div>
      ))}
      {editando !== null && (
        <div style={{ background:'#fff', border:'1px solid #7dd3fc', borderRadius:4, padding:8, marginTop:4 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
            <div><label style={lbl}>Identificação</label>
              <input style={inp} value={form.identificacao || ''} onChange={e => setForm(f => ({ ...f, identificacao: e.target.value }))} placeholder="Ex: Base Chapecó" /></div>
            <div><label style={lbl}>Endereço</label>
              <input style={inp} value={form.endereco || ''} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, complemento" /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:6, marginBottom:6 }}>
            <div><label style={lbl}>Cidade *</label>
              <input style={inp} value={form.cidade || ''} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} /></div>
            <div><label style={lbl}>UF *</label>
              <select style={inp} value={form.uf || ''} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}>
                <option value="">—</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><label style={lbl}>CEP</label>
              <input style={inp} value={form.cep || ''} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} placeholder="00000-000" /></div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button type="button" onClick={salvar} disabled={salvando} style={btn('#0369a1')}>{salvando ? 'Salvando...' : '💾 Salvar endereço'}</button>
            <button type="button" onClick={() => setEditando(null)} style={btn('#64748b', false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRATO E ENTREGAS
// ═════════════════════════════════════════════════════════════════════════════

/** Formação de preço de onde importar os itens do edital: a vencedora; senão a
 *  finalizada mais recente; senão a mais recente. */
async function formacaoDaLicitacao(licitacaoId) {
  const { data: vinc } = await supabase.from('cotacoes_precos_vinculos').select('cotacao_id')
    .eq('tipo', 'licitacao').eq('processo_id', licitacaoId);
  const ids = (vinc || []).map(v => v.cotacao_id);
  let q = supabase.from('cotacoes_precos').select('id,nome,versao,vencedora,status,itens,parametros_globais,criado_em');
  q = ids.length ? q.or(`licitacao_id.eq.${licitacaoId},id.in.(${ids.join(',')})`) : q.eq('licitacao_id', licitacaoId);
  const { data } = await q.order('criado_em', { ascending: false });
  const lista = data || [];
  return lista.find(c => c.vencedora) || lista.find(c => c.status === 'finalizada') || lista[0] || null;
}

function Linha({ children, cor = '#e2e8f0' }) {
  return <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', fontSize:10, padding:'4px 6px',
    borderTop:`1px solid ${cor}` }}>{children}</div>;
}

export function ContratoEntregas({ licit, currentUser }) {
  const [itens, setItens] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [aditivos, setAditivos] = useState([]);
  const [enderecos, setEnderecos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);      // { tipo:'item'|'pedido'|'aditivo', itemId?, ...campos }
  const [salvando, setSalvando] = useState(false);
  const [opPara, setOpPara] = useState(null);  // pedido em "Gerar OP"

  const carregar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('licitacao_contrato_itens').select('*').eq('licitacao_id', licit.id).order('ordem').order('criado_em'),
      supabase.from('licitacao_pedidos').select('*').eq('licitacao_id', licit.id).order('data_pedido').order('criado_em'),
      supabase.from('licitacao_aditivos').select('*').eq('licitacao_id', licit.id).order('data').order('criado_em'),
      supabase.from('licitacao_enderecos').select('*').eq('licitacao_id', licit.id).order('ordem').order('criado_em'),
    ]);
    setItens(a.data || []); setPedidos(b.data || []); setAditivos(c.data || []); setEnderecos(d.data || []);
    setCarregando(false);
  }, [licit.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const saldoDe = (item) => {
    const adit = aditivos.filter(x => x.item_id === item.id).reduce((s, x) => s + n(x.quantidade), 0);
    const ped  = pedidos.filter(x => x.item_id === item.id).reduce((s, x) => s + n(x.quantidade), 0);
    return { adit, ped, total: n(item.quantidade_contratada) + adit, saldo: n(item.quantidade_contratada) + adit - ped };
  };
  const autor = { criado_por: currentUser?.email || null, criado_por_nome: currentUser?.nome || null };

  // ── importar itens do edital da formação de preço ──
  const importar = async () => {
    const c = await formacaoDaLicitacao(licit.id);
    if (!c || !Array.isArray(c.itens) || c.itens.length === 0) {
      alert('Esta licitação não tem Formação de Preço com itens para importar. Adicione os itens com "+ Item".'); return;
    }
    const grupos = [];
    for (const it of c.itens) { const g = it.grupo_nome || 'Item 1'; if (!grupos.includes(g)) grupos.push(g); }
    const lotes = c.parametros_globais?.lote_por_grupo || {};
    const linhas = grupos.map((g, i) => {
      const produtos = c.itens.filter(it => (it.grupo_nome || 'Item 1') === g).map(it => it.produto).filter(Boolean);
      return {
        licitacao_id: licit.id, ordem: i, unidade: 'UN',
        descricao: `${g}${produtos.length ? ' — ' + produtos.slice(0, 3).join(', ') + (produtos.length > 3 ? '…' : '') : ''}`,
        // o "lote" da formação costuma ficar 1 com a quantidade dentro das
        // linhas; por isso vem como sugestão e o aviso abaixo pede conferência
        quantidade_contratada: Number(lotes[g]) > 0 ? Number(lotes[g]) : 1,
      };
    });
    const { error } = await supabase.from('licitacao_contrato_itens').insert(linhas);
    if (error) { alert('Erro ao importar: ' + error.message); return; }
    alert(`${linhas.length} item(ns) importado(s) de "${c.nome || 'Formação'}" v${c.versao || 1}.\n\nConfira a QUANTIDADE CONTRATADA de cada item — a formação nem sempre traz esse número.`);
    carregar();
  };

  // ── gravações ──
  const salvarForm = async () => {
    const f = form;
    setSalvando(true);
    let r;
    if (f.tipo === 'item') {
      if (!f.descricao?.trim()) { setSalvando(false); alert('Descreva o item.'); return; }
      const payload = { descricao: f.descricao.trim(), unidade: f.unidade || 'UN', quantidade_contratada: n(f.quantidade_contratada) };
      r = f.id ? await supabase.from('licitacao_contrato_itens').update(payload).eq('id', f.id)
               : await supabase.from('licitacao_contrato_itens').insert([{ ...payload, licitacao_id: licit.id, ordem: itens.length }]);
    } else if (f.tipo === 'aditivo') {
      if (!n(f.quantidade)) { setSalvando(false); alert('Informe a quantidade do aditivo (use negativo para supressão).'); return; }
      r = await supabase.from('licitacao_aditivos').insert([{ licitacao_id: licit.id, item_id: f.itemId,
        quantidade: n(f.quantidade), data: f.data || null, documento: f.documento?.trim() || null,
        observacao: f.observacao?.trim() || null, ...autor }]);
    } else if (f.tipo === 'pedido') {
      const q = n(f.quantidade);
      if (!(q > 0)) { setSalvando(false); alert('Informe a quantidade do pedido.'); return; }
      const item = itens.find(i => i.id === f.itemId);
      const { saldo } = saldoDe(item);
      if (q > saldo && !confirm(`Este pedido (${fmtQ(q)}) é maior que o saldo do item (${fmtQ(saldo)}).\n\nSe houve aditivo, registre-o primeiro. Registrar o pedido mesmo assim?`)) {
        setSalvando(false); return;
      }
      r = await supabase.from('licitacao_pedidos').insert([{ licitacao_id: licit.id, item_id: f.itemId, quantidade: q,
        data_pedido: f.data || null, prazo_entrega: f.prazo || null, documento: f.documento?.trim() || null,
        endereco_id: f.enderecoId || null, observacao: f.observacao?.trim() || null, ...autor }]);
    }
    setSalvando(false);
    if (r?.error) { alert('Erro ao salvar: ' + r.error.message); return; }
    setForm(null); carregar();
  };

  const remover = async (tabela, reg, descricao) => {
    if (tabela === 'licitacao_pedidos' && reg.opl && !confirm(`Este pedido já gerou a OP ${reg.opl}. Remover o pedido NÃO apaga a OP.\n\nRemover o pedido mesmo assim?`)) return;
    if (tabela !== 'licitacao_pedidos' || !reg.opl) { if (!confirm(`Remover ${descricao}?`)) return; }
    await supabase.from(tabela).delete().eq('id', reg.id);
    carregar();
  };

  // ── pedido → OP (abre a Nova OP já preenchida; ao salvar, liga a OP ao pedido) ──
  const gerarOp = (pedido) => {
    const item = itens.find(i => i.id === pedido.item_id);
    const end = enderecos.find(e => e.id === pedido.endereco_id);
    const qtd = Math.max(1, Math.round(n(pedido.quantidade)));
    const prefill = {
      cliente_nome:   licit.nome_projeto || '',          // coluna legada: é o NOME DO ÓRGÃO
      quantidade:     qtd,
      veiculos:       Array.from({ length: qtd }, () => ({ chassi:'', placa:'' })),
      prazo_entrega:  pedido.prazo_entrega || licit.prazo_entrega || '',
      fluxo_entrega:  licit.fluxo_entrega || '',
      destino_cidade: end?.cidade || '', destino_uf: end?.uf || '', destino_cep: end?.cep || '',
      resumo_servicos: `${item?.descricao || ''} — ${fmtQ(pedido.quantidade)} ${item?.unidade || 'UN'}`,
      observacoes: [
        `Licitação ${licit.numero || ''}`,
        pedido.documento ? `Pedido/empenho ${pedido.documento}` : null,
        end ? `Entrega: ${[end.identificacao, end.endereco, end.cidade && `${end.cidade}/${end.uf || ''}`, end.cep].filter(Boolean).join(', ')}` : null,
      ].filter(Boolean).join(' · '),
    };
    try { localStorage.setItem('acn_nova_op_prefill', JSON.stringify(prefill)); } catch {}
    setOpPara(pedido);
  };
  const aoCriarOp = async (op) => {
    if (!op?.id || !opPara) return;
    const base = String(op.opl || '').replace(/\/\d+$/, '');   // lote: liga ao número base
    await supabase.from('licitacao_pedidos').update({ opl_id: op.id, opl: base }).eq('id', opPara.id);
    carregar();
  };

  if (carregando) return <div style={{ fontSize:11, color:'#94a3b8', padding:12 }}>Carregando contrato...</div>;

  const F = form;
  const campo = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:12, color:'#1e293b' }}>📦 Contrato e Entregas</div>
            <div style={{ fontSize:9, color:'#64748b' }}>
              Por item do edital: contratado + aditivos − pedidos = saldo. Cada pedido gera a sua OP.
              {licit.prazo_entrega && <> · Prazo de entrega do edital: <strong>{fmtD(licit.prazo_entrega)}</strong></>}
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {itens.length === 0 && <button type="button" onClick={importar} style={btn('#7c3aed', false)}>📥 Importar itens da Formação de Preço</button>}
            <button type="button" onClick={() => setForm({ tipo:'item', unidade:'UN', quantidade_contratada:'' })} style={btn('#0f766e')}>+ Item</button>
          </div>
        </div>
        {enderecos.length === 0 && (
          <div style={{ fontSize:9, color:'#b45309', marginTop:6 }}>⚠️ Nenhum endereço de entrega cadastrado — cadastre no formulário (lado esquerdo) para escolher em cada pedido.</div>
        )}
      </div>

      {/* formulário único: item / pedido / aditivo */}
      {F && (
        <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:10 }}>
          <div style={{ fontWeight:800, fontSize:11, color:'#92400e', marginBottom:6 }}>
            {F.tipo === 'item' ? (F.id ? 'Editar item' : 'Novo item do edital')
              : F.tipo === 'pedido' ? `Novo pedido de entrega — ${itens.find(i => i.id === F.itemId)?.descricao || ''}`
              : `Aditivo / supressão — ${itens.find(i => i.id === F.itemId)?.descricao || ''}`}
          </div>
          {F.tipo === 'item' && (
            <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr 1fr', gap:6 }}>
              <div><label style={lbl}>Descrição *</label><input style={inp} value={F.descricao || ''} onChange={e => campo('descricao', e.target.value)} placeholder="Ex: Item 1 — Adaptação viatura ostensiva" /></div>
              <div><label style={lbl}>Unidade</label><input style={inp} value={F.unidade || ''} onChange={e => campo('unidade', e.target.value.toUpperCase())} /></div>
              <div><label style={lbl}>Qtd. contratada</label><input style={inp} type="number" min={0} value={F.quantidade_contratada ?? ''} onChange={e => campo('quantidade_contratada', e.target.value)} /></div>
            </div>
          )}
          {F.tipo === 'pedido' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6 }}>
              <div><label style={lbl}>Quantidade *</label><input style={inp} type="number" min={1} value={F.quantidade ?? ''} onChange={e => campo('quantidade', e.target.value)} /></div>
              <div><label style={lbl}>Data do pedido</label><input style={inp} type="date" value={F.data || ''} onChange={e => campo('data', e.target.value)} /></div>
              <div><label style={lbl}>Prazo de entrega</label><input style={inp} type="date" value={F.prazo || ''} onChange={e => campo('prazo', e.target.value)} /></div>
              <div><label style={lbl}>Nº empenho / AF</label><input style={inp} value={F.documento || ''} onChange={e => campo('documento', e.target.value)} /></div>
              <div style={{ gridColumn:'1 / span 2' }}><label style={lbl}>Endereço de entrega</label>
                <select style={inp} value={F.enderecoId || ''} onChange={e => campo('enderecoId', e.target.value)}>
                  <option value="">— escolha —</option>
                  {enderecos.map(e => <option key={e.id} value={e.id}>{textoEndereco(e)}</option>)}
                </select></div>
              <div style={{ gridColumn:'3 / span 2' }}><label style={lbl}>Observação</label><input style={inp} value={F.observacao || ''} onChange={e => campo('observacao', e.target.value)} /></div>
            </div>
          )}
          {F.tipo === 'aditivo' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 2fr', gap:6 }}>
              <div><label style={lbl}>Quantidade (+ / −) *</label><input style={inp} type="number" value={F.quantidade ?? ''} onChange={e => campo('quantidade', e.target.value)} placeholder="Ex: 3 ou -2" /></div>
              <div><label style={lbl}>Data</label><input style={inp} type="date" value={F.data || ''} onChange={e => campo('data', e.target.value)} /></div>
              <div><label style={lbl}>Nº termo aditivo</label><input style={inp} value={F.documento || ''} onChange={e => campo('documento', e.target.value)} /></div>
              <div><label style={lbl}>Observação</label><input style={inp} value={F.observacao || ''} onChange={e => campo('observacao', e.target.value)} /></div>
            </div>
          )}
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            <button type="button" onClick={salvarForm} disabled={salvando} style={btn('#0f766e')}>{salvando ? 'Salvando...' : '💾 Salvar'}</button>
            <button type="button" onClick={() => setForm(null)} style={btn('#64748b', false)}>Cancelar</button>
          </div>
        </div>
      )}

      {itens.length === 0 && !F && (
        <div style={{ fontSize:11, color:'#64748b', textAlign:'center', padding:16, background:'#fff', border:'1px dashed #cbd5e1', borderRadius:6 }}>
          Nenhum item do contrato ainda. Importe da Formação de Preço ou adicione com <strong>+ Item</strong>.
        </div>
      )}

      {itens.map(item => {
        const s = saldoDe(item);
        const peds = pedidos.filter(p => p.item_id === item.id);
        const adits = aditivos.filter(a => a.item_id === item.id);
        const corSaldo = s.saldo < 0 ? '#dc2626' : s.saldo === 0 ? '#64748b' : '#16a34a';
        return (
          <div key={item.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden' }}>
            <div style={{ padding:'8px 10px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', background:'#f8fafc' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontWeight:800, fontSize:11, color:'#1e293b' }}>{item.descricao}</div>
                <div style={{ fontSize:10, color:'#475569' }}>
                  Contratado <strong>{fmtQ(item.quantidade_contratada)}</strong>
                  {s.adit !== 0 && <> · Aditivos <strong>{s.adit > 0 ? '+' : ''}{fmtQ(s.adit)}</strong></>}
                  {' '}· Pedidos <strong>{fmtQ(s.ped)}</strong> {item.unidade}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:'#64748b', fontWeight:700 }}>SALDO</div>
                <div style={{ fontSize:16, fontWeight:900, color:corSaldo }}>{fmtQ(s.saldo)} <span style={{ fontSize:10 }}>{item.unidade}</span></div>
              </div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                <button type="button" onClick={() => setForm({ tipo:'pedido', itemId:item.id, data:hoje(), prazo:licit.prazo_entrega || '', enderecoId: enderecos.length === 1 ? enderecos[0].id : '' })} style={btn('#0369a1')}>+ Pedido</button>
                <button type="button" onClick={() => setForm({ tipo:'aditivo', itemId:item.id, data:hoje() })} style={btn('#7c3aed', false)}>+ Aditivo</button>
                <button type="button" onClick={() => setForm({ tipo:'item', ...item })} title="Editar item" style={{ ...btn('#475569', false), padding:'4px 7px' }}>✏️</button>
                <button type="button" onClick={() => remover('licitacao_contrato_itens', item, `o item "${item.descricao}" com todos os seus pedidos e aditivos`)} title="Remover item" style={{ ...btn('#dc2626', false), padding:'4px 7px' }}>🗑</button>
              </div>
            </div>

            {peds.map(p => {
              const end = enderecos.find(e => e.id === p.endereco_id);
              return (
                <Linha key={p.id}>
                  <span style={{ fontWeight:800, color:'#0369a1', minWidth:70 }}>📋 {fmtQ(p.quantidade)} {item.unidade}</span>
                  <span>pedido {fmtD(p.data_pedido)}{p.documento ? ` · ${p.documento}` : ''}</span>
                  <span style={{ color:'#475569' }}>→ {end ? textoEndereco(end) : <em style={{ color:'#b45309' }}>sem endereço</em>}</span>
                  {p.prazo_entrega && <span style={{ color:'#475569' }}>· entrega até {fmtD(p.prazo_entrega)}</span>}
                  {p.observacao && <span style={{ color:'#94a3b8' }}>· {p.observacao}</span>}
                  <span style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
                    {p.opl
                      ? <span style={{ fontWeight:800, color:'#166534', background:'#dcfce7', borderRadius:4, padding:'1px 7px' }}>OP {p.opl}</span>
                      : <button type="button" onClick={() => gerarOp(p)} style={btn('#16a34a')}>🏭 Gerar OP</button>}
                    <button type="button" onClick={() => remover('licitacao_pedidos', p, 'este pedido')} title="Remover pedido" style={{ ...btn('#dc2626', false), padding:'1px 6px' }}>🗑</button>
                  </span>
                </Linha>
              );
            })}
            {adits.map(a => (
              <Linha key={a.id} cor="#ede9fe">
                <span style={{ fontWeight:800, color:'#7c3aed', minWidth:70 }}>{n(a.quantidade) > 0 ? '➕' : '➖'} {fmtQ(Math.abs(n(a.quantidade)))} {item.unidade}</span>
                <span>{n(a.quantidade) > 0 ? 'aditivo' : 'supressão'} {fmtD(a.data)}{a.documento ? ` · ${a.documento}` : ''}</span>
                {a.observacao && <span style={{ color:'#94a3b8' }}>· {a.observacao}</span>}
                <span style={{ marginLeft:'auto' }}>
                  <button type="button" onClick={() => remover('licitacao_aditivos', a, 'este aditivo')} title="Remover aditivo" style={{ ...btn('#dc2626', false), padding:'1px 6px' }}>🗑</button>
                </span>
              </Linha>
            ))}
            {peds.length === 0 && adits.length === 0 && (
              <div style={{ fontSize:10, color:'#94a3b8', padding:'6px 10px', borderTop:'1px solid #e2e8f0' }}>Nenhum pedido ainda.</div>
            )}
          </div>
        );
      })}

      {opPara && (
        <NovaOpOsModal isOpen currentUser={currentUser}
          onClose={() => { setOpPara(null); carregar(); }}
          onSaved={(op) => aoCriarOp(op)} />
      )}
    </div>
  );
}
