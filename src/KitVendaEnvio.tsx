// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// KIT DA "VENDA PARA ENVIO"
// Na abertura da OP, quando o Tipo de Projeto é "Venda para Envio", escolhe-se
// o kit vendido — ou cria-se um novo com os itens que o compõem.
//
// O kit NÃO é um cadastro novo: é um produto do cadastro_produtos ("Produto e
// Mercadorias"), que já existia justamente como "produto montado a partir de
// itens" (cadastro_produtos_itens → cadastro_itens). Criar um kit aqui cria o
// produto lá, e ele fica disponível para as próximas vendas.
//
// Valor que sobe para a OP: { produto_id, nome, garantia_meses, itens: [{ item_id,
// codigo, nome, unidade, qtd }] } — `qtd` é POR KIT. A OP grava uma fotografia
// disso (oples.kit_itens), para que editar o kit depois não mude o que foi vendido.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';

export const CATEGORIA_KIT = 'Kit para Envio';

const box = { background:'#f0fdfa', border:'1px solid #99f6e4', borderRadius:7, padding:10, marginBottom:10 };
const rotulo = { fontSize:9, fontWeight:800, color:'#0f766e', textTransform:'uppercase', marginBottom:6 } as const;
const btn = (cor, cheio = true) => ({
  fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:4, cursor:'pointer',
  border:`1px solid ${cor}`, background: cheio ? cor : '#fff', color: cheio ? '#fff' : cor,
});

/** Carrega os itens de um produto/kit do cadastro. */
async function itensDoProduto(produtoId: string) {
  const { data } = await supabase.from('cadastro_produtos_itens')
    .select('item_id,item_codigo,item_nome,quantidade,unidade,ordem')
    .eq('produto_id', produtoId).order('ordem', { ascending: true });
  return (data || []).map(l => ({
    item_id: l.item_id, codigo: l.item_codigo || '', nome: l.item_nome,
    unidade: l.unidade || 'UN', qtd: Number(l.quantidade) || 1,
  }));
}

// ── Tabela do kit escolhido: por kit e total da venda ─────────────────────────
function TabelaKit({ itens, qtdKits }) {
  const n = Math.max(1, parseInt(qtdKits) || 1);
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
      <thead>
        <tr style={{ color:'#0f766e', textAlign:'left' }}>
          <th style={{ padding:'3px 4px' }}>Item</th>
          <th style={{ padding:'3px 4px', textAlign:'right' }}>Por kit</th>
          <th style={{ padding:'3px 4px', textAlign:'right' }}>Total ({n} kit{n > 1 ? 's' : ''})</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((it, i) => (
          <tr key={i} style={{ borderTop:'1px solid #ccfbf1' }}>
            <td style={{ padding:'3px 4px' }}>
              {it.codigo && <span style={{ color:'#64748b' }}>{it.codigo} · </span>}{it.nome}
            </td>
            <td style={{ padding:'3px 4px', textAlign:'right' }}>{it.qtd} {it.unidade}</td>
            <td style={{ padding:'3px 4px', textAlign:'right', fontWeight:800 }}>{it.qtd * n} {it.unidade}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Criar um kit novo ─────────────────────────────────────────────────────────
function CriarKit({ currentUser, onCriado, onCancelar }) {
  const [nome, setNome] = useState('');
  const [linhas, setLinhas] = useState([]);   // [{item_id,codigo,nome,unidade,qtd}]
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const timer = useRef(null);

  // Busca no servidor: o Cadastro de Itens tem ~4.400 itens, não dá para
  // trazer tudo. nome_norm/codigo_norm já vêm sem acento e em minúsculas.
  useEffect(() => {
    clearTimeout(timer.current);
    // tira o que quebra a sintaxe do filtro .or() do PostgREST
    const q = normalizarBusca(busca).replace(/[,()%*]/g, ' ').trim();
    if (q.length < 2) { setResultados([]); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('cadastro_itens')
        .select('id,codigo,nome,unidade')
        .eq('ativo', true)
        .or(`nome_norm.ilike.%${q}%,codigo_norm.ilike.%${q}%`)
        .order('nome').limit(15);
      setResultados(data || []);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [busca]);

  const adicionar = (it) => {
    setLinhas(p => p.some(l => l.item_id === it.id)
      ? p.map(l => l.item_id === it.id ? { ...l, qtd: l.qtd + 1 } : l)
      : [...p, { item_id: it.id, codigo: it.codigo || '', nome: it.nome, unidade: it.unidade || 'UN', qtd: 1 }]);
    setBusca(''); setResultados([]);
  };

  const salvar = async () => {
    if (!nome.trim()) { alert('Dê um nome ao kit.'); return; }
    if (linhas.length === 0) { alert('Adicione pelo menos um item ao kit.'); return; }
    if (linhas.some(l => !(Number(l.qtd) > 0))) { alert('Toda quantidade por kit precisa ser maior que zero.'); return; }
    setSalvando(true);
    const { data: prod, error } = await supabase.from('cadastro_produtos').insert([{
      nome: nome.trim(), categoria: CATEGORIA_KIT, unidade: 'KIT', ativo: true,
      // null explícito: a coluna tem padrão 12, e aí todo kit criado aqui
      // "teria" 12 meses de garantia que ninguém escolheu — e isso viraria
      // sugestão de garantia na OP. Garantia se define no cadastro do produto.
      garantia_meses: null,
      criado_por: currentUser?.email || null,
      observacoes: 'Criado na abertura de OP (Venda para Envio).',
    }]).select('id,nome,garantia_meses').single();
    if (error || !prod) { setSalvando(false); alert('Não foi possível criar o kit: ' + (error?.message || '')); return; }
    const { error: errItens } = await supabase.from('cadastro_produtos_itens').insert(
      linhas.map((l, i) => ({
        produto_id: prod.id, item_id: l.item_id, item_nome: l.nome, item_codigo: l.codigo || null,
        quantidade: Number(l.qtd), unidade: l.unidade, ordem: i,
      })));
    setSalvando(false);
    if (errItens) {
      // não deixa um kit vazio perdido no cadastro
      await supabase.from('cadastro_produtos').delete().eq('id', prod.id);
      alert('Não foi possível salvar os itens do kit: ' + errItens.message);
      return;
    }
    onCriado({ produto_id: prod.id, nome: prod.nome, garantia_meses: prod.garantia_meses, itens: linhas.map(l => ({ ...l, qtd: Number(l.qtd) })) });
  };

  return (
    <div>
      <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nome do kit *</div>
      <input className="acn-input" style={{ width:'100%', marginBottom:8 }} value={nome}
        onChange={e => setNome(e.target.value)} placeholder="Ex: Kit Sinalização Viatura Padrão" />

      <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Adicionar item do cadastro</div>
      <input className="acn-input" style={{ width:'100%' }} value={busca}
        onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código (mín. 2 letras)" />
      {(buscando || resultados.length > 0) && (
        <div style={{ border:'1px solid #cbd5e1', borderTop:'none', borderRadius:'0 0 4px 4px', background:'#fff', maxHeight:180, overflowY:'auto' }}>
          {buscando && <div style={{ fontSize:10, color:'#94a3b8', padding:6 }}>Buscando...</div>}
          {resultados.map(r => (
            <div key={r.id} onClick={() => adicionar(r)}
              style={{ fontSize:10, padding:'5px 8px', cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdfa')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              {r.codigo && <span style={{ color:'#64748b' }}>{r.codigo} · </span>}{r.nome}
              <span style={{ color:'#94a3b8' }}> ({r.unidade || 'UN'})</span>
            </div>
          ))}
        </div>
      )}

      {linhas.length > 0 && (
        <div style={{ marginTop:8 }}>
          {linhas.map((l, i) => (
            <div key={l.item_id} style={{ display:'grid', gridTemplateColumns:'1fr 70px auto', gap:6, alignItems:'center', marginBottom:4 }}>
              <div style={{ fontSize:10 }}>
                {l.codigo && <span style={{ color:'#64748b' }}>{l.codigo} · </span>}{l.nome}
              </div>
              <input className="acn-input" type="number" min={0.01} step="any" title="Quantidade por kit"
                style={{ width:'100%', textAlign:'right' }} value={l.qtd}
                onChange={e => setLinhas(p => p.map((x, j) => j === i ? { ...x, qtd: e.target.value } : x))} />
              <button type="button" onClick={() => setLinhas(p => p.filter((_, j) => j !== i))}
                style={{ ...btn('#dc2626', false), padding:'2px 7px' }}>✕</button>
            </div>
          ))}
          <div style={{ fontSize:9, color:'#64748b' }}>Quantidades acima são <strong>por kit</strong>.</div>
        </div>
      )}

      <div style={{ display:'flex', gap:6, marginTop:10 }}>
        <button type="button" onClick={salvar} disabled={salvando} style={btn('#0f766e')}>
          {salvando ? 'Salvando...' : '💾 Salvar kit'}
        </button>
        <button type="button" onClick={onCancelar} style={btn('#64748b', false)}>Cancelar</button>
      </div>
    </div>
  );
}

// Quantidade de kits vendidos — mora DENTRO do bloco do kit: na Venda para
// Envio ela substitui a "Qtd. Veículos", que não se aplica.
function CampoQtdKits({ qtdKits, onQtdKits }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <span style={{ fontSize:9, fontWeight:700, color:'#475569' }}>Quantidade de kits vendidos *</span>
      <input className="acn-input" type="number" min={1} max={9999} style={{ width:90, textAlign:'right' }}
        value={qtdKits} onChange={e => onQtdKits(e.target.value)} />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function KitVendaEnvio({ kit, onChange, qtdKits, onQtdKits, currentUser }) {
  const [modo, setModo] = useState('escolher');   // 'escolher' | 'criar'
  const [kits, setKits] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (kit) return;
    supabase.from('cadastro_produtos').select('id,codigo,nome,categoria,garantia_meses')
      .eq('ativo', true).order('nome')
      .then(({ data }) => setKits(data || []));
  }, [kit]);

  const escolher = async (p) => {
    setCarregando(true);
    const itens = await itensDoProduto(p.id);
    setCarregando(false);
    if (itens.length === 0) {
      alert(`"${p.nome}" não tem itens cadastrados. Cadastre os itens em Produto e Mercadorias, ou crie um kit novo aqui.`);
      return;
    }
    onChange({ produto_id: p.id, nome: p.nome, garantia_meses: p.garantia_meses, itens });
  };

  // Kit já escolhido: mostra o que vai ser separado e deixa trocar
  if (kit) {
    return (
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <div style={rotulo}>🧰 Kit vendido: {kit.nome}</div>
          <button type="button" onClick={() => onChange(null)} style={btn('#0f766e', false)}>Trocar kit</button>
        </div>
        <CampoQtdKits qtdKits={qtdKits} onQtdKits={onQtdKits} />
        <TabelaKit itens={kit.itens} qtdKits={qtdKits} />
      </div>
    );
  }

  const f = normalizarBusca(filtro);
  const visiveis = kits.filter(k => !f || normalizarBusca(k.nome).includes(f) || normalizarBusca(k.codigo).includes(f));

  return (
    <div style={box}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={rotulo}>🧰 Kit vendido *</div>
        {modo === 'escolher'
          ? <button type="button" onClick={() => setModo('criar')} style={btn('#0f766e')}>+ Criar novo kit</button>
          : null}
      </div>
      <CampoQtdKits qtdKits={qtdKits} onQtdKits={onQtdKits} />
      <div style={{ fontSize:9, color:'#64748b', marginBottom:6 }}>
        Escolha um kit pré-configurado abaixo, ou crie e configure um agora.
      </div>

      {modo === 'criar' ? (
        <CriarKit currentUser={currentUser}
          onCriado={(k) => { setModo('escolher'); onChange(k); }}
          onCancelar={() => setModo('escolher')} />
      ) : (
        <>
          <input className="acn-input" style={{ width:'100%' }} value={filtro}
            onChange={e => setFiltro(e.target.value)} placeholder="Buscar kit já cadastrado..." />
          <div style={{ maxHeight:160, overflowY:'auto', marginTop:4 }}>
            {carregando && <div style={{ fontSize:10, color:'#94a3b8', padding:6 }}>Carregando itens do kit...</div>}
            {visiveis.length === 0 && !carregando && (
              <div style={{ fontSize:10, color:'#64748b', padding:6 }}>
                Nenhum kit encontrado. Use <strong>+ Criar novo kit</strong>.
              </div>
            )}
            {visiveis.map(k => (
              <div key={k.id} onClick={() => escolher(k)}
                style={{ fontSize:10, padding:'5px 8px', cursor:'pointer', background:'#fff', border:'1px solid #e2e8f0', borderRadius:4, marginBottom:3 }}>
                {k.codigo && <span style={{ color:'#64748b' }}>{k.codigo} · </span>}<strong>{k.nome}</strong>
                {k.categoria && <span style={{ color:'#94a3b8' }}> · {k.categoria}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** O kit da OP para telas que só leem. `compacto` = uma linha por item com o
 *  TOTAL a separar (Almoxarifado, onde a coluna é estreita); sem ele, a tabela
 *  com "por kit" e "total" (detalhe da OP). */
export function ResumoKit({ opl, compacto = false }) {
  const itens = Array.isArray(opl?.kit_itens) ? opl.kit_itens : [];
  if (!itens.length) return null;
  const n = Math.max(1, parseInt(opl.quantidade) || 1);
  return (
    <div style={{ marginTop:4 }}>
      <div style={{ fontSize:9, fontWeight:800, color:'#0f766e' }}>
        🧰 {opl.kit_nome || 'Kit'} × {n}
      </div>
      {compacto ? (
        <div style={{ fontSize:9, color:'#334155', lineHeight:1.45 }}>
          {itens.map((it, i) => (
            <div key={i}><strong>{it.qtd * n} {it.unidade}</strong> · {it.nome}</div>
          ))}
        </div>
      ) : (
        <TabelaKit itens={itens} qtdKits={n} />
      )}
    </div>
  );
}
