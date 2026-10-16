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
import { Botao, Chips } from './Interface';
import Icone from './Icone';
import { mdiLinkVariant, mdiClose } from '@mdi/js';

export interface VinculoValue { tipo: string; id: string; descricao: string; }

const TIPOS = [
  { id: 'op',     label: 'OP' },
  { id: 'os',     label: 'OS' },
  { id: 'pv',     label: 'PV' },
  { id: 'compra', label: 'Compra' },
  { id: 'ofi',    label: 'OFI' },
  { id: 'formacao', label: 'Formação de preço' },
];

// Pedido do usuário em 16/10/2026: a demanda avulsa também se vincula a uma formação de preço. Só a janela de vínculos da demanda avulsa mostra esse tipo
// (TIPOS_DEMANDA_AVULSA); reposição do Almoxarifado, OFI e Compras seguem com os cinco de sempre. O tipo é texto livre no banco (vinculo_tipo / vinculos), nada mudou lá.
export const TIPOS_PADRAO = ['op', 'os', 'pv', 'compra', 'ofi'];
export const TIPOS_DEMANDA_AVULSA = [...TIPOS_PADRAO, 'formacao'];

export const TIPO_LABEL: Record<string, string> = { op: 'OP', os: 'OS', pv: 'PV', compra: 'Compra', ofi: 'OFI', formacao: 'Formação de preço' };

// contexto do deep-link (acn:abrir-registro) e aba de destino por tipo —
// reaproveita os listeners que já existem em ProducaoTab/SacTab/CrmTab/
// ComprasTab, nenhum listener novo fora do que o plano previu.
const TIPO_CONTEXTO: Record<string, string> = { op: 'op', os: 'sac', pv: 'crm', compra: 'compra', ofi: 'ofi', formacao: 'formacao' };
const TIPO_ABA: Record<string, string | null> = { op: 'producao', os: 'sac', pv: 'crm', compra: 'compras', ofi: null, formacao: 'formacao_precos' };
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
// Formação de preços mostra custo e margem. O menu só ESCONDE a aba de quem não a tem, mas não impede de abri-la por um vínculo: por isso o vínculo
// só abre a formação para quem já tem a aba (mesma regra do menu em DashboardTab: Admin, ou sem lista de abas, ou com "formacao_precos" na lista). Decidido em 16/10/2026 — a confirmar.
function podeAbrirFormacao(): boolean {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u) return false;
    if (u.perfil === 'Admin') return true;
    const abas = u.abas_permitidas;
    return !Array.isArray(abas) || abas.length === 0 || abas.includes('formacao_precos');
  } catch { return false; }
}

export async function abrirVinculo(v: VinculoValue | null | undefined) {
  if (!v?.id || !v?.tipo) return;
  const contexto = TIPO_CONTEXTO[v.tipo];
  if (!contexto) return;
  if (v.tipo === 'formacao' && !podeAbrirFormacao()) {
    alert('Você não tem acesso à tela de Formação de preços. Peça a quem tem acesso para abrir esta formação: ' + (v.descricao || ''));
    return;
  }

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
    if (tipo === 'formacao') {
      // o texto digitado vira parte do filtro do banco: vírgula, parênteses e curingas quebram o filtro (e a lista dizia "nada encontrado"), então saem
      const limpo = q.replace(/[,()*%\\]/g, ' ').trim();
      if (limpo.length < 2) return [];
      const lk = `%${limpo}%`;
      const { data } = await supabase.from('cotacoes_precos').select('id,nome,numero_cotacao,versao')
        .or(`nome.ilike.${lk},numero_cotacao.ilike.${lk},empresa.ilike.${lk},orgao_cliente.ilike.${lk}`)
        .order('criado_em', { ascending: false }).limit(8);
      return (data || []).map((r: any) => ({ id: String(r.id), descricao: `${r.numero_cotacao || 'sem nº'} — ${r.nome || 'sem nome'}${Number(r.versao) > 1 ? ' · v' + r.versao : ''}` }));
    }
  } catch (_) { /* tabela pode não existir em algum ambiente antigo — falha silenciosa */ }
  return [];
}

export function VinculoPicker({ value, onSelect, onClear, tipos = TIPOS_PADRAO }: {
  value: VinculoValue | null;
  onSelect: (v: VinculoValue) => void;
  onClear: () => void;
  tipos?: string[];   // quais tipos oferecer; sem dizer, os cinco de sempre
}) {
  // começa sem tipo escolhido: o vínculo é opcional, a pessoa escolhe se precisar
  // com um tipo só (o bloco "Formação de preço" da demanda), ele já vem escolhido e a fileira de tipos some
  const [tipo, setTipo]           = useState(tipos.length === 1 ? tipos[0] : '');
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
    if (!tipo) return;
    timerRef.current = setTimeout(() => buscar(tipo, v), 300);
  };

  // clicar de novo no tipo escolhido desmarca
  const trocarTipo = (t: string) => { setTipo(atual => atual === t ? '' : t); setQ(''); setSugestoes([]); setAberto(false); };

  const selecionar = (item: { id: string; descricao: string }) => {
    onSelect({ tipo, id: item.id, descricao: item.descricao });
    setQ(''); setSugestoes([]); setAberto(false);
  };

  // 12e52 (09/10/2026): só aparência — os cinco tipos viraram o seletor do guia (Chips) e o realce ao passar o mouse nas sugestões passou para o CSS
  if (value) {
    return (
      <div className="acn-vcp-escolhido">
        <span className="acn-vcp-tipo"><Icone path={mdiLinkVariant} size={14} />{TIPO_LABEL[value.tipo] || value.tipo}</span>
        <span className="acn-vcp-desc">{value.descricao}</span>
        <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Remover vínculo" onClick={onClear} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="acn-vcp">
      {tipos.length > 1 && (
        <Chips ativo={tipo} onChange={trocarTipo} rotulo="Tipo de vínculo" className="acn-vcp-tipos"
          itens={TIPOS.filter(t => tipos.includes(t.id)).map(t => ({ id: t.id, rotulo: t.label }))} />
      )}
      {tipo ? (
        <input
          className="acn-input acn-vcp-busca"
          value={q}
          onChange={e => handleChange(e.target.value)}
          placeholder={`Buscar ${TIPO_LABEL[tipo]}...`}
          autoComplete="off"
          autoFocus
        />
      ) : (
        <div className="acn-ajuda">Nenhum vínculo. Escolha o tipo acima se quiser ligar a um processo.</div>
      )}
      {aberto && (
        <div className="acn-vcp-lista">
          {sugestoes.map(item => (
            <div key={item.id} className="acn-vcp-item" onMouseDown={() => selecionar(item)}>
              {item.descricao}
            </div>
          ))}
          {buscando && <div className="acn-vcp-msg">Buscando...</div>}
          {!buscando && sugestoes.length === 0 && q.length >= 2 && (
            <div className="acn-vcp-msg">Nada encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}
