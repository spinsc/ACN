// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { resolverMencoesRespondidas } from './MencaoTextarea';

// ─────────────────────────────────────────────────────────────────────────────
// Painel Inbox de Menções (@usuário)
// Abre via badge 💬 no header — lista menções não lidas do usuário logado
// Permite marcar como lida e navegar para a aba de origem
// ─────────────────────────────────────────────────────────────────────────────

const ABA_LABEL: Record<string, string> = {
  comercial:   '🏭 Comercial',
  engenharia:  '⚙️ Engenharia',
  pcp:         '📋 PCP',
  almoxarifado:'📦 Almoxarifado',
  producao:    '🔧 Produção',
  qualidade:   '✅ Qualidade',
  fiscal:      '🧾 Fiscal',
  logistica:   '🚚 Logística',
  crm:         '💼 CRM',
  licitacoes:  '🏛️ Licitações',
  sac:         '🎧 SAC',
  rh:          '👥 RH',
  compras:     '🛒 Compras',
  admin:       '⚙️ Admin',
};

const CONTEXTO_LABEL: Record<string, string> = {
  op:               'OP',
  os:               'OS',
  crm:              'CRM',
  demanda:          'Demanda',
  demanda_avulsa:   'Demanda Avulsa',
  sac:              'SAC',
  compra:           'Compra',
  licitacao:        'Licitação',
  compra_aprovacao: 'Aprovação de Compra',
  frete_aprovacao:  'Aprovação de Frete',
};

// Contextos sem "aprovação pendente" real — nesses a menção É o pedido de
// aprovação em si; ela se resolve sozinha quando alguém aprova/rejeita
// (ComprasTab.tsx/LogisticaTab.tsx chamam resolverMencoesRespondidas na
// hora). Não faz sentido oferecer uma caixa de resposta de texto aqui.
const CONTEXTOS_SEM_RESPOSTA = new Set(['compra_aprovacao', 'frete_aprovacao']);

// Responder uma menção — grava a resposta EXATAMENTE no mesmo lugar que a
// tela de origem gravaria (então ela aparece lá também, não só aqui), e em
// seguida resolverMencoesRespondidas() cuida de marcar a(s) menção(ões)
// pendente(s) do autor naquele registro como resolvidas. Um `null` de
// retorno sinaliza "sem alvo conhecido pra esse contexto" — o chamador cai
// pro botão manual de "Marcar como resolvida" nesse caso.
async function responderMencao(m: any, texto: string, currentUser: any): Promise<boolean> {
  const contextoId = m.contexto_id;
  const nome = currentUser?.nome || currentUser?.email || 'Usuário';
  const agora = new Date().toISOString();
  if (!contextoId || !texto.trim()) return false;

  if (m.contexto === 'crm') {
    const { error } = await supabase.from('crm_historico').insert({
      oportunidade_id: contextoId, tipo: 'observacao', texto: texto.trim(),
      usuario_nome: nome, criado_em: agora,
    });
    if (error) return false;
  } else if (m.contexto === 'licitacao') {
    const { error } = await supabase.from('licitacao_documentos').insert({
      licitacao_id: contextoId, categoria: 'andamento', nome: 'Andamento', conteudo: texto.trim(),
      criado_por: currentUser?.email, criado_por_nome: nome, criado_em: agora,
    });
    if (error) return false;
  } else if (m.contexto === 'compra' && m.campo === 'observacoes_compra') {
    const { data: pedido } = await supabase.from('pcp_pedidos_compra')
      .select('observacoes_compra').eq('id', contextoId).maybeSingle();
    const linha = `[${new Date().toLocaleString('pt-BR')} — ${nome}]: ${texto.trim()}`;
    const atual = pedido?.observacoes_compra || '';
    const { error } = await supabase.from('pcp_pedidos_compra')
      .update({ observacoes_compra: atual ? `${atual}\n${linha}` : linha }).eq('id', contextoId);
    if (error) return false;
  } else if (m.contexto === 'sac') {
    const { data: os } = await supabase.from('sac_ordens_servico')
      .select('observacoes').eq('id', contextoId).maybeSingle();
    const linha = `[${new Date().toLocaleString('pt-BR')} — ${nome}]: ${texto.trim()}`;
    const atual = os?.observacoes || '';
    const { error } = await supabase.from('sac_ordens_servico')
      .update({ observacoes: atual ? `${atual}\n${linha}` : linha }).eq('id', contextoId);
    if (error) return false;
  } else if (m.contexto === 'demanda_avulsa') {
    const { data: d } = await supabase.from('demandas_avulsas')
      .select('informacoes').eq('id', contextoId).maybeSingle();
    const lista = [...(d?.informacoes || []), { texto: texto.trim(), usuario: nome, data: agora }];
    const { error } = await supabase.from('demandas_avulsas')
      .update({ informacoes: lista, atualizado_em: agora }).eq('id', contextoId);
    if (error) return false;
  } else if (m.contexto === 'demanda') {
    const { data: d } = await supabase.from('demandas_setoriais')
      .select('logs_demanda').eq('id', contextoId).maybeSingle();
    const logs = [...(d?.logs_demanda || []), { texto: texto.trim(), usuario: nome, hora: agora }];
    const { error } = await supabase.from('demandas_setoriais')
      .update({ logs_demanda: logs, observacoes_execucao: texto.trim() }).eq('id', contextoId);
    if (error) return false;
  } else if (['op', 'os', 'compra'].includes(m.contexto) && m.campo === 'acompanhamento') {
    const setorLabel = (ABA_LABEL[m.aba_destino] || 'Sistema').replace(/^\S+\s/, ''); // tira o emoji
    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id: contextoId, referencia_tipo: m.contexto, referencia_desc: m.contexto_descricao,
      setor: setorLabel, texto: texto.trim(),
      usuario_id: String(currentUser?.id || ''), usuario_nome: nome, criado_em: agora,
    });
    if (error) return false;
  } else {
    return false; // contexto sem alvo de resposta conhecido
  }

  await resolverMencoesRespondidas({
    contexto: m.contexto, contextoId, autorId: currentUser?.id, autorNome: nome,
  });
  return true;
}

const fmtDT = (v: string) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });
  } catch { return v; }
};

interface Props {
  currentUser: any;
  onClose: () => void;
  onCountChange?: (n: number) => void;
  onNavigate?: (tab: string) => void;
}

export default function MencoesInboxPanel({ currentUser, onClose, onCountChange, onNavigate }: Props) {
  const [mencoes, setMencoes]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState<'pendentes' | 'resolvidas' | 'todas'>('pendentes');
  const [marcando, setMarcando] = useState<Record<string, boolean>>({});
  // Compositor de resposta inline — só um aberto por vez, texto por menção
  // (assim trocar de card sem enviar não perde o que já foi digitado nos outros).
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [textosResposta, setTextosResposta] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid  = String(currentUser?.id   || '');
      const nome = String(currentUser?.nome || '');

      // Busca por id E por nome (fallback para usuários com id trocado após recriação)
      let orFilter = `mencionado_id.eq.${uid}`;
      if (nome) orFilter += `,mencionado_nome.ilike.%${nome}%`;

      let q = supabase
        .from('mencoes')
        .select('*')
        .or(orFilter)
        .order('criado_em', { ascending: false })
        .limit(100);
      if (filtro === 'pendentes') q = q.eq('resolvida', false);
      if (filtro === 'resolvidas') q = q.eq('resolvida', true);
      const { data, error } = await q;
      if (error) {
        console.error('[MencoesInbox] erro ao carregar:', error.message);
      }
      const lista = data || [];
      setMencoes(lista);
      // "Pendente" é o que de fato importa pro badge/contador — "lida" só
      // significa "vista", não que foi resolvida/respondida.
      const pendentes = lista.filter(m => !m.resolvida).length;
      onCountChange?.(filtro === 'pendentes' ? lista.length : pendentes);
    } catch (e) {
      console.error('[MencoesInbox] exceção:', e);
    }
    setLoading(false);
  }, [currentUser?.id, currentUser?.nome, filtro]);

  useEffect(() => { load(); }, [load]);

  const marcarLida = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({ lida: true }).eq('id', m.id);
    await load();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const marcarTodasLidas = async () => {
    await supabase.from('mencoes')
      .update({ lida: true })
      .eq('mencionado_id', currentUser?.id)
      .eq('lida', false);
    await load();
  };

  // "Resolvida" é o estado que de fato tira a menção do caminho do usuário —
  // marcar resolvida também marca como lida (resolver implica ter visto).
  // Nunca apaga nada — só muda o status, sempre reversível via "Reabrir".
  const marcarResolvida = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({
      resolvida: true, resolvida_em: new Date().toISOString(),
      resolvida_por: currentUser?.nome || currentUser?.email || null,
      lida: true,
    }).eq('id', m.id);
    await load();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const reabrirMencao = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({
      resolvida: false, resolvida_em: null, resolvida_por: null,
    }).eq('id', m.id);
    await load();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const marcarTodasResolvidas = async () => {
    await supabase.from('mencoes')
      .update({
        resolvida: true, resolvida_em: new Date().toISOString(),
        resolvida_por: currentUser?.nome || currentUser?.email || null,
        lida: true,
      })
      .eq('mencionado_id', currentUser?.id)
      .eq('resolvida', false);
    await load();
  };

  // Envia a resposta direto pro lugar de origem daquela menção (CRM, Licitação,
  // Compras, SAC, etc.) — some de lá pra cá igual um comentário normal, e
  // resolverMencoesRespondidas() (chamado dentro de responderMencao) já marca
  // a menção como resolvida. Se o contexto não tiver um alvo de resposta
  // conhecido, avisa e deixa o botão manual de "Marcar como resolvida" cuidar.
  const enviarResposta = async (m: any) => {
    const texto = (textosResposta[m.id] || '').trim();
    if (!texto) return;
    setEnviando(prev => ({ ...prev, [m.id]: true }));
    const ok = await responderMencao(m, texto, currentUser);
    setEnviando(prev => ({ ...prev, [m.id]: false }));
    if (!ok) { alert('Não foi possível enviar a resposta por aqui — use o botão "Marcar como resolvida" ou responda direto na tela de origem.'); return; }
    setTextosResposta(prev => ({ ...prev, [m.id]: '' }));
    setRespondendoId(null);
    await load();
  };

  const naoLidasCount   = mencoes.filter(m => !m.lida).length;
  const pendentesCount  = mencoes.filter(m => !m.resolvida).length;

  // Navega pra aba de destino E pede pra ela abrir o registro específico (não só
  // a aba genérica). Guarda num global além de disparar o evento porque, se a aba
  // ainda não estiver montada, o listener do componente de destino só existe DEPOIS
  // que ele montar — o global é lido no mount pra cobrir esse caso.
  const abrirRegistro = (m: any) => {
    if (!m.lida) marcarLida(m);
    if (m.contexto_id) {
      // CRM/Licitação já têm um mecanismo de deep-link próprio e testado
      // (analise:abrir-origem, ouvido em DashboardTab.tsx — já troca a aba E
      // abre o card) — reaproveita em vez de duplicar.
      if (m.contexto === 'crm' || m.contexto === 'licitacao') {
        window.dispatchEvent(new CustomEvent('analise:abrir-origem', { detail: { origem: m.contexto, origemId: m.contexto_id } }));
      } else {
        const detail = { contexto: m.contexto, contextoId: m.contexto_id };
        (window as any).__acnDeepLink = detail;
        window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail }));
      }
    }
    if (m.aba_destino && onNavigate) onNavigate(m.aba_destino);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Backdrop */}
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.35)' }} onClick={onClose} />

      {/* Painel lateral direito */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 480, maxWidth: '95vw', height: '100vh',
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{ background:'#6366f1', color:'white', padding:'14px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>💬 Minhas Menções</div>
              <div style={{ fontSize:10, opacity:.85, marginTop:2 }}>
                {pendentesCount > 0
                  ? `${pendentesCount} pendente(s) — ainda não resolvida(s)`
                  : 'Nenhuma menção pendente'}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,.2)', border:'none', color:'white',
                borderRadius:4, width:28, height:28, cursor:'pointer', fontSize:14, fontWeight:700, flexShrink:0 }}>
              ✕
            </button>
          </div>

          {/* Ações em massa */}
          {(naoLidasCount > 0 || pendentesCount > 0) && (
            <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
              {pendentesCount > 0 && (
                <button onClick={marcarTodasResolvidas}
                  style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4,
                    background:'#22c55e', color:'white', border:'none', cursor:'pointer' }}>
                  ✓ Marcar todas como resolvidas
                </button>
              )}
              {naoLidasCount > 0 && (
                <button onClick={marcarTodasLidas}
                  style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4,
                    background:'rgba(255,255,255,.2)', color:'white', border:'none', cursor:'pointer' }}>
                  ✓ Todas lidas
                </button>
              )}
            </div>
          )}

          {/* Filtro */}
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {(['pendentes','resolvidas','todas'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                style={{
                  fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                  background: filtro===f ? 'white' : 'rgba(255,255,255,.2)',
                  color:      filtro===f ? '#6366f1' : 'white',
                  border: 'none',
                }}>
                {f === 'pendentes' ? 'Pendentes' : f === 'resolvidas' ? 'Resolvidas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:32, color:'#94a3b8', fontSize:11 }}>Carregando...</div>
          )}
          {!loading && mencoes.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
              <div style={{ fontSize:11 }}>
                {filtro === 'pendentes' ? 'Nenhuma menção pendente — tudo resolvido!'
                  : filtro === 'resolvidas' ? 'Nenhuma menção resolvida ainda.'
                  : 'Nenhuma menção registrada.'}
              </div>
            </div>
          )}

          {mencoes.map(m => {
            const abaLabel = ABA_LABEL[m.aba_destino] || m.aba_destino || '—';
            const ctxLabel = CONTEXTO_LABEL[m.contexto] || m.contexto || '—';
            const isMarcando = marcando[m.id];

            return (
              <div key={m.id} style={{
                border: `1px solid ${m.resolvida ? '#86efac' : m.lida ? '#e2e8f0' : '#c7d2fe'}`,
                borderLeft: `3px solid ${m.resolvida ? '#22c55e' : m.lida ? '#cbd5e1' : '#6366f1'}`,
                borderRadius: 8, marginBottom: 8, padding:'10px 12px',
                background: m.resolvida ? '#f0fdf4' : m.lida ? '#f8fafc' : '#f5f3ff',
                opacity: m.resolvida ? .75 : 1,
              }}>
                {/* Linha 1: quem mencionou + quando */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{
                      width:24, height:24, borderRadius:'50%',
                      background: m.lida ? '#94a3b8' : '#6366f1',
                      color:'white', display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:9, fontWeight:700, flexShrink:0,
                    }}>
                      {(m.mencionante_nome || '?')[0]}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, color: m.lida ? '#64748b' : '#4338ca' }}>
                      @você
                    </span>
                    <span style={{ fontSize:9, color:'#94a3b8' }}>
                      por <strong>{m.mencionante_nome || '—'}</strong>
                    </span>
                  </div>
                  <span style={{ fontSize:9, color:'#94a3b8' }}>{fmtDT(m.criado_em)}</span>
                </div>

                {/* Linha 2: contexto + descrição */}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap' }}>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3,
                    background: m.lida ? '#e2e8f0' : '#e0e7ff', color: m.lida ? '#64748b' : '#4338ca',
                  }}>
                    {ctxLabel}
                  </span>
                  {m.contexto_descricao && (
                    m.contexto_id ? (
                      <span onClick={() => abrirRegistro(m)}
                        style={{ fontSize:9, color:'#4338ca', fontWeight:700, textDecoration:'underline', cursor:'pointer' }}>
                        {m.contexto_descricao}
                      </span>
                    ) : (
                      <span style={{ fontSize:9, color:'#475569', fontWeight:600 }}>{m.contexto_descricao}</span>
                    )
                  )}
                  {m.campo && (
                    <span style={{ fontSize:9, color:'#94a3b8' }}>campo: {m.campo}</span>
                  )}
                </div>

                {/* Trecho do texto */}
                {m.texto_trecho && (
                  <div style={{
                    fontSize:10, color:'#1e293b', background: m.lida ? '#f1f5f9' : '#ede9fe',
                    borderRadius:4, padding:'5px 8px', marginBottom:6,
                    borderLeft:'2px solid #818cf8', fontStyle:'italic',
                    whiteSpace:'pre-wrap', wordBreak:'break-word',
                  }}>
                    {m.texto_trecho.length > 200 ? m.texto_trecho.slice(0, 200) + '…' : m.texto_trecho}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  {m.aba_destino && onNavigate && (
                    <button
                      onClick={() => abrirRegistro(m)}
                      style={{
                        fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4,
                        background:'#6366f1', color:'white', border:'none', cursor:'pointer',
                      }}>
                      {abaLabel} →
                    </button>
                  )}
                  {!m.lida && !m.resolvida && (
                    <button
                      onClick={() => marcarLida(m)}
                      disabled={isMarcando}
                      style={{
                        fontSize:9, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                        background:'none', color:'#6366f1', border:'1px solid #c7d2fe',
                        opacity: isMarcando ? .6 : 1,
                      }}>
                      {isMarcando ? '...' : '✓ Marcar lida'}
                    </button>
                  )}
                  {m.lida && !m.resolvida && (
                    <span style={{ fontSize:9, color:'#94a3b8' }}>✓ Lida</span>
                  )}
                  {!m.resolvida && !CONTEXTOS_SEM_RESPOSTA.has(m.contexto) && (
                    <button
                      onClick={() => setRespondendoId(id => id === m.id ? null : m.id)}
                      style={{
                        fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                        background: respondendoId===m.id ? '#e0e7ff' : 'none', color:'#4338ca', border:'1px solid #c7d2fe',
                      }}>
                      ↩ {respondendoId===m.id ? 'Cancelar resposta' : 'Responder'}
                    </button>
                  )}
                  {!m.resolvida ? (
                    <button
                      onClick={() => marcarResolvida(m)}
                      disabled={isMarcando}
                      style={{
                        fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                        background:'#22c55e', color:'white', border:'none',
                        opacity: isMarcando ? .6 : 1,
                      }}>
                      {isMarcando ? '...' : '✓ Marcar como resolvida'}
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize:9, color:'#16a34a', fontWeight:700 }}>
                        ✓ Resolvida{m.resolvida_por ? ` por ${m.resolvida_por}` : ''}
                      </span>
                      <button
                        onClick={() => reabrirMencao(m)}
                        disabled={isMarcando}
                        style={{
                          fontSize:9, padding:'3px 10px', borderRadius:4, cursor:'pointer',
                          background:'none', color:'#94a3b8', border:'1px solid #e2e8f0',
                          opacity: isMarcando ? .6 : 1,
                        }}>
                        {isMarcando ? '...' : '↺ Reabrir'}
                      </button>
                    </>
                  )}
                </div>

                {/* Compositor de resposta — grava na tela de origem (CRM,
                    Licitação, Compras, SAC...) e resolve a menção sozinho. */}
                {respondendoId === m.id && (
                  <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #e0e7ff' }}>
                    <textarea
                      autoFocus
                      value={textosResposta[m.id] || ''}
                      onChange={e => setTextosResposta(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Escreva sua resposta... ela vai aparecer direto na tela de origem"
                      rows={2}
                      style={{ width:'100%', padding:'6px 8px', border:'1px solid #c7d2fe', borderRadius:4,
                        fontSize:10, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}
                    />
                    <div style={{ display:'flex', gap:6, marginTop:6 }}>
                      <button
                        onClick={() => enviarResposta(m)}
                        disabled={enviando[m.id] || !(textosResposta[m.id] || '').trim()}
                        style={{
                          fontSize:9, fontWeight:700, padding:'4px 12px', borderRadius:4, cursor:'pointer',
                          background:'#4338ca', color:'white', border:'none',
                          opacity: enviando[m.id] || !(textosResposta[m.id]||'').trim() ? .6 : 1,
                        }}>
                        {enviando[m.id] ? 'Enviando...' : '➤ Enviar resposta'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{
          borderTop:'1px solid #e2e8f0', padding:'10px 14px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f8fafc',
        }}>
          <span style={{ fontSize:9, color:'#94a3b8' }}>
            {mencoes.length} menção(ões) exibida(s)
          </span>
          <button onClick={load}
            style={{ fontSize:9, fontWeight:700, padding:'4px 12px', borderRadius:4,
              background:'#6366f1', color:'white', border:'none', cursor:'pointer' }}>
            🔄 Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
