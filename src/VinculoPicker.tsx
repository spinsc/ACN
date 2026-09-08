// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VinculoPicker — seletor compartilhado de "vínculo opcional a um processo já
// em andamento" (OP / OS / PV / Compra / OFI). Usado por qualquer tela que
// grave um vinculo_tipo/vinculo_id/vinculo_descricao (Demandas Avulsas,
// Solicitação de Reposição do Almoxarifado, OFIs...).
//
// Mesma forma de props de ClienteAutocomplete (ClienteUtils.tsx): entrega o
// registro escolhido via onSelect, quem chama decide o que fazer com ele.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

export interface VinculoValue { tipo: string; id: string; descricao: string; }

const TIPOS = [
  { id: 'op',     label: 'OP' },
  { id: 'os',     label: 'OS' },
  { id: 'pv',     label: 'PV' },
  { id: 'compra', label: 'Compra' },
  { id: 'ofi',    label: 'OFI' },
];

export const TIPO_LABEL: Record<string, string> = { op: 'OP', os: 'OS', pv: 'PV', compra: 'Compra', ofi: 'OFI' };

// contexto do deep-link (acn:abrir-registro) e aba de destino por tipo —
// reaproveita os listeners que já existem em ProducaoTab/SacTab/CrmTab/
// ComprasTab, nenhum listener novo fora do que o plano previu.
const TIPO_CONTEXTO: Record<string, string> = { op: 'op', os: 'sac', pv: 'crm', compra: 'compra', ofi: 'ofi' };
const TIPO_ABA: Record<string, string | null> = { op: 'producao', os: 'sac', pv: 'crm', compra: 'compras', ofi: null };
const SETOR_DESTINO_ABA: Record<string, string> = { Chicotes: 'chicotes', Serralheria: 'serralheria', Laboratorio: 'laboratorio' };

// Dispara o deep-link já estabelecido no app pra abrir o registro vinculado —
// evento 'acn:abrir-registro' (visto pela tela de destino) + evento
// 'acn:trocar-aba' (visto por DashboardTab.tsx, que faz setActiveTab).
// Usa eventos globais em vez de um callback onNavigate prop-drilled porque o
// vínculo pode ser clicado de dentro de qualquer painel de Demandas Avulsas
// aninhado bem fundo (Almoxarifado/PCP/Compras/Engenharia) — sem precisar
// passar onNavigate por 3-4 níveis de componente até cada um deles.
// 'ofi' precisa de uma consulta rápida pra saber o setor_destino (a aba não
// é fixa como as demais) antes de decidir pra onde trocar.
export async function abrirVinculo(v: VinculoValue | null | undefined) {
  if (!v?.id || !v?.tipo) return;
  const contexto = TIPO_CONTEXTO[v.tipo];
  if (!contexto) return;

  let aba: string | null = TIPO_ABA[v.tipo];
  if (v.tipo === 'ofi') {
    const { data } = await supabase.from('ofis').select('setor_destino').eq('id', v.id).maybeSingle();
    aba = data?.setor_destino ? (SETOR_DESTINO_ABA[data.setor_destino] || null) : null;
  }

  (window as any).__acnDeepLink = { contexto, contextoId: v.id };
  window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail: { contexto, contextoId: v.id } }));
  if (aba) window.dispatchEvent(new CustomEvent('acn:trocar-aba', { detail: { aba } }));
}

async function buscarPorTipo(tipo: string, q: string): Promise<{ id: string; descricao: string }[]> {
  const like = `%${q}%`;
  try {
    if (tipo === 'op') {
      const { data } = await supabase.from('oples').select('id,opl,chassi,modelo,cliente_nome')
        .or(`opl.ilike.${like},chassi.ilike.${like},modelo.ilike.${like}`)
        .order('opl', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.opl || '—'} — ${r.cliente_nome || r.modelo || ''}`.replace(/ — $/, '') }));
    }
    if (tipo === 'os') {
      const { data } = await supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome,equipamento_nome')
        .or(`numero_os.ilike.${like},cliente_nome.ilike.${like}`)
        .order('numero_os', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.numero_os || '—'} — ${r.cliente_nome || r.equipamento_nome || ''}`.replace(/ — $/, '') }));
    }
    if (tipo === 'pv') {
      const { data } = await supabase.from('crm_oportunidades').select('id,numero_pv,titulo,cliente_final')
        .or(`numero_pv.ilike.${like},titulo.ilike.${like}`)
        .order('criado_em', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.numero_pv || r.titulo || '—'} — ${r.cliente_final || ''}`.replace(/ — $/, '') }));
    }
    if (tipo === 'compra') {
      const { data } = await supabase.from('pcp_pedidos_compra').select('id,numero_pedido,descricao_material')
        .or(`numero_pedido.ilike.${like},descricao_material.ilike.${like}`)
        .order('data_criacao', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.numero_pedido || '—'} — ${r.descricao_material || ''}`.replace(/ — $/, '') }));
    }
    if (tipo === 'ofi') {
      const { data } = await supabase.from('ofis').select('id,numero_ofi,descricao')
        .or(`numero_ofi.ilike.${like},descricao.ilike.${like}`)
        .order('criado_em', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.numero_ofi || '—'} — ${r.descricao || ''}`.replace(/ — $/, '') }));
    }
  } catch (_) { /* tabela pode não existir em algum ambiente antigo — falha silenciosa */ }
  return [];
}

export function VinculoPicker({ value, onSelect, onClear }: {
  value: VinculoValue | null;
  onSelect: (v: VinculoValue) => void;
  onClear: () => void;
}) {
  const [tipo, setTipo]           = useState('op');
  const [q, setQ]                 = useState('');
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [aberto, setAberto]       = useState(false);
  const [buscando, setBuscando]   = useState(false);
  const timerRef = useRef<any>(null);
  const wrapRef  = useRef<any>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buscar = useCallback(async (tipoAtual: string, texto: string) => {
    if (!texto || texto.length < 2) { setSugestoes([]); setAberto(false); return; }
    setBuscando(true);
    const res = await buscarPorTipo(tipoAtual, texto);
    setSugestoes(res);
    setAberto(true);
    setBuscando(false);
  }, []);

  const handleChange = (v: string) => {
    setQ(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(tipo, v), 300);
  };

  const trocarTipo = (t: string) => { setTipo(t); setQ(''); setSugestoes([]); setAberto(false); };

  const selecionar = (item: { id: string; descricao: string }) => {
    onSelect({ tipo, id: item.id, descricao: item.descricao });
    setQ(''); setSugestoes([]); setAberto(false);
  };

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: 6, fontSize: 11 }}>
        <span style={{ fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>🔗 {TIPO_LABEL[value.tipo] || value.tipo}</span>
        <span style={{ color: '#1e293b', flex: 1, wordBreak: 'break-word' }}>{value.descricao}</span>
        <button type="button" onClick={onClear}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <button key={t.id} type="button" onClick={() => trocarTipo(t.id)}
            style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
              border: `1.5px solid ${tipo === t.id ? '#2563eb' : '#d1d5db'}`,
              background: tipo === t.id ? '#dbeafe' : '#fff',
              color: tipo === t.id ? '#1d4ed8' : '#6b7280' }}>
            {t.label}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={e => handleChange(e.target.value)}
        placeholder={`Buscar ${TIPO_LABEL[tipo]}...`}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #d1d5db',
          borderRadius: 4, fontSize: 11 }}
        autoComplete="off"
      />
      {aberto && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'white', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 12px #0002', marginTop: 2, maxHeight: 220, overflowY: 'auto' }}>
          {sugestoes.map(item => (
            <div key={item.id}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#1e293b' }}
              onMouseDown={() => selecionar(item)}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              {item.descricao}
            </div>
          ))}
          {buscando && <div style={{ padding: 8, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>Buscando...</div>}
          {!buscando && sugestoes.length === 0 && q.length >= 2 && (
            <div style={{ padding: 8, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>Nada encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}
