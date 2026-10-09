// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { resolverMencoesRespondidas } from './MencaoTextarea';
import { Botao, Chips, Tag } from './Interface';
import Icone from './Icone';
import { mdiMessageTextOutline, mdiRefresh, mdiClose, mdiCheck, mdiCheckAll, mdiReply, mdiSend, mdiUndoVariant } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// Painel Inbox de Menções (@usuário)
// Abre via badge 💬 no header — lista menções não lidas do usuário logado
// Permite marcar como lida e navegar para a aba de origem
// ─────────────────────────────────────────────────────────────────────────────

const ABA_LABEL: Record<string, string> = {
  comercial:   'Comercial',
  engenharia:  'Engenharia',
  pcp:         'PCP',
  almoxarifado:'Almoxarifado',
  producao:    'Produção',
  qualidade:   'Qualidade',
  fiscal:      'Fiscal',
  logistica:   'Logística',
  crm:         'CRM',
  licitacoes:  'Licitações',
  sac:         'SAC',
  rh:          'RH',
  compras:     'Compras',
  financeiro:  'Financeiro',
  admin:       'Admin',
};

const CONTEXTO_LABEL: Record<string, string> = {
  op:               'OP',
  os:               'OS',
  crm:              'CRM',
  demanda:          'Demanda',
  demanda_avulsa:   'Demanda Avulsa',
  sac:              'SAC',
  compra:           'Compra',
  centro_custo:     'Centro de custo',
  licitacao:        'Licitação',
  compra_aprovacao: 'Aprovação de Compra',
  hora_extra:       'Hora extra',
  frete_aprovacao:  'Aprovação de Frete',
};

// Contextos sem "aprovação pendente" real — nesses a menção É o pedido de
// aprovação em si; ela se resolve sozinha quando alguém aprova/rejeita
// (ComprasTab.tsx/LogisticaTab.tsx chamam resolverMencoesRespondidas na
// hora). Não faz sentido oferecer uma caixa de resposta de texto aqui.
const CONTEXTOS_SEM_RESPOSTA = new Set(['compra_aprovacao', 'frete_aprovacao', 'hora_extra']);

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
    const setorLabel = ABA_LABEL[m.aba_destino] || 'Sistema';
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
    contexto: m.contexto, contextoId, autorId: currentUser?.id, autorNome: nome, resposta: texto,
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
  const [setorFiltro, setSetorFiltro] = useState('todos'); // aba_destino selecionado, ou 'todos'
  const [pendentesGlobal, setPendentesGlobal] = useState(0); // total real, independe dos filtros da tela
  const [marcando, setMarcando] = useState<Record<string, boolean>>({});

  // Opções do filtro de setor — só as abas que o usuário tem permissão de
  // ver (mesmo critério de isVisible() em DashboardTab.tsx: Admin ou sem
  // abas_permitidas configuradas enxerga tudo; senão, só o que está na lista).
  const setorOpcoes = React.useMemo(() => {
    const abas = currentUser?.abas_permitidas;
    const semRestricao = currentUser?.perfil === 'Admin' || !Array.isArray(abas) || abas.length === 0;
    return Object.keys(ABA_LABEL).filter(k => semRestricao || abas.includes(k));
  }, [currentUser?.abas_permitidas, currentUser?.perfil]);
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
        .neq('contexto', 'op_adaptacao')   // avisos automáticos de OP ficam no botão "Avisos"
        .order('criado_em', { ascending: false })
        .limit(100);
      if (filtro === 'pendentes') q = q.eq('resolvida', false);
      if (filtro === 'resolvidas') q = q.eq('resolvida', true);
      if (setorFiltro !== 'todos') q = q.eq('aba_destino', setorFiltro);
      const { data, error } = await q;
      if (error) {
        console.error('[MencoesInbox] erro ao carregar:', error.message);
      }
      setMencoes(data || []);
    } catch (e) {
      console.error('[MencoesInbox] exceção:', e);
    }
    setLoading(false);
  }, [currentUser?.id, currentUser?.nome, filtro, setorFiltro]);

  // Contagem do badge do header — sempre o total real pendente, independente
  // dos filtros de status/setor selecionados na tela (senão o badge cai a
  // zero só por trocar de aba de filtro, mesmo com pendências reais restando).
  const refreshBadgeCount = useCallback(async () => {
    const uid  = String(currentUser?.id   || '');
    const nome = String(currentUser?.nome || '');
    let orFilter = `mencionado_id.eq.${uid}`;
    if (nome) orFilter += `,mencionado_nome.ilike.%${nome}%`;
    const { count } = await supabase
      .from('mencoes')
      .select('id', { count: 'exact', head: true })
      .or(orFilter)
      .neq('contexto', 'op_adaptacao')
      .eq('resolvida', false);
    setPendentesGlobal(count || 0);
    onCountChange?.(count || 0);
  }, [currentUser?.id, currentUser?.nome, onCountChange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshBadgeCount(); }, [refreshBadgeCount]);

  const marcarLida = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({ lida: true }).eq('id', m.id);
    await load();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const marcarTodasLidas = async () => {
    // Respeita o filtro de setor ativo — "todas" aqui significa "todas as
    // visíveis nesta tela", não todas as menções do usuário em qualquer setor.
    let q = supabase.from('mencoes').update({ lida: true }).eq('mencionado_id', currentUser?.id).eq('lida', false).neq('contexto', 'op_adaptacao');
    if (setorFiltro !== 'todos') q = q.eq('aba_destino', setorFiltro);
    await q;
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
    await refreshBadgeCount();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const reabrirMencao = async (m: any) => {
    setMarcando(prev => ({ ...prev, [m.id]: true }));
    await supabase.from('mencoes').update({
      resolvida: false, resolvida_em: null, resolvida_por: null,
    }).eq('id', m.id);
    await load();
    await refreshBadgeCount();
    setMarcando(prev => ({ ...prev, [m.id]: false }));
  };

  const marcarTodasResolvidas = async () => {
    // Idem — só resolve o que está filtrado/visível na tela agora.
    let q = supabase.from('mencoes').update({
      resolvida: true, resolvida_em: new Date().toISOString(),
      resolvida_por: currentUser?.nome || currentUser?.email || null,
      lida: true,
    }).eq('mencionado_id', currentUser?.id).eq('resolvida', false).neq('contexto', 'op_adaptacao');
    if (setorFiltro !== 'todos') q = q.eq('aba_destino', setorFiltro);
    await q;
    await load();
    await refreshBadgeCount();
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
    await refreshBadgeCount();
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

  // 12e47 (09/10/2026): só a aparência — a gaveta usa as classes acn-gav-* (comuns às Análises) e acn-men-*
  return (
    <div className="acn-gav acn-gav-mencao"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Backdrop */}
      <div className="acn-gav-fundo" onClick={onClose} />

      {/* Painel lateral direito */}
      <div className="acn-gav-painel" role="dialog" aria-label="Minhas menções">

        {/* Cabeçalho */}
        <div className="acn-gav-cab">
          <div className="acn-gav-cab-linha">
            <div>
              <div className="acn-gav-tit"><Icone path={mdiMessageTextOutline} size={18} />Minhas Menções</div>
              <div className="acn-gav-sub">
                {pendentesGlobal > 0
                  ? `${pendentesGlobal} pendente(s) — ainda não resolvida(s)`
                  : 'Nenhuma menção pendente'}
              </div>
            </div>
            <Botao variante="discreto" pequeno icone={mdiClose} className="acn-gav-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
          </div>

          {/* Ações em massa */}
          {(naoLidasCount > 0 || pendentesCount > 0) && (
            <div className="acn-gav-massa">
              {pendentesCount > 0 && (
                <Botao pequeno variante="primario" icone={mdiCheck} onClick={marcarTodasResolvidas}>Marcar todas como resolvidas</Botao>
              )}
              {naoLidasCount > 0 && (
                <Botao pequeno icone={mdiCheckAll} onClick={marcarTodasLidas}>Todas lidas</Botao>
              )}
            </div>
          )}

          {/* Filtro */}
          <div className="acn-gav-filtros">
            <Chips ativo={filtro} onChange={id => setFiltro(id as any)} rotulo="Situação das menções"
              itens={[{ id: 'pendentes', rotulo: 'Pendentes' }, { id: 'resolvidas', rotulo: 'Resolvidas' }, { id: 'todas', rotulo: 'Todas' }]} />
            {setorOpcoes.length > 1 && (
              <select value={setorFiltro} onChange={e => setSetorFiltro(e.target.value)} className="acn-input acn-gav-sel">
                {/* O popup de opções é renderizado pelo navegador/SO com fundo
                    claro, não pelo nosso CSS — sem cor própria aqui, herdaria o
                    branco do <select> fechado e ficaria ilegível (texto branco
                    em fundo claro). O design.css fixa escuro-sobre-claro nas
                    próprias <option> (.acn-gav-sel option), independente da
                    cor do controle fechado. */}
                <option value="todos">Todos os setores</option>
                {setorOpcoes.map(k => (
                  <option key={k} value={k}>{ABA_LABEL[k]}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="acn-gav-lista">
          {loading && (
            <div className="acn-empty">Carregando...</div>
          )}
          {!loading && mencoes.length === 0 && (
            <div className="acn-empty acn-gav-vazio">
              <Icone path={mdiMessageTextOutline} size={32} />
              <div>
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
              <div key={m.id} className={'acn-men-card ' + (m.resolvida ? 'resolvida' : m.lida ? 'lida' : 'nova')}>
                {/* Linha 1: quem mencionou + quando */}
                <div className="acn-men-l1">
                  <div className="acn-men-quem">
                    <span className="acn-men-avatar">
                      {(m.mencionante_nome || '?')[0]}
                    </span>
                    <span className="acn-men-voce">
                      @você
                    </span>
                    <span className="acn-ajuda">
                      por <strong>{m.mencionante_nome || '—'}</strong>
                    </span>
                  </div>
                  <span className="acn-ajuda">{fmtDT(m.criado_em)}</span>
                </div>

                {/* Linha 2: contexto + descrição */}
                <div className="acn-men-l2">
                  <Tag>{ctxLabel}</Tag>
                  {m.contexto_descricao && (
                    m.contexto_id ? (
                      <span onClick={() => abrirRegistro(m)} className="acn-men-desc link">
                        {m.contexto_descricao}
                      </span>
                    ) : (
                      <span className="acn-men-desc">{m.contexto_descricao}</span>
                    )
                  )}
                  {m.campo && (
                    <span className="acn-ajuda">campo: {m.campo}</span>
                  )}
                </div>

                {/* Trecho do texto */}
                {m.texto_trecho && (
                  <div className="acn-men-trecho">
                    {m.texto_trecho.length > 200 ? m.texto_trecho.slice(0, 200) + '…' : m.texto_trecho}
                  </div>
                )}

                {/* Ações */}
                <div className="acn-men-acoes">
                  {m.aba_destino && onNavigate && (
                    <Botao pequeno variante="primario" onClick={() => abrirRegistro(m)}>
                      {abaLabel} →
                    </Botao>
                  )}
                  {!m.lida && !m.resolvida && (
                    <Botao pequeno icone={isMarcando ? undefined : mdiCheck} onClick={() => marcarLida(m)} disabled={isMarcando}>
                      {isMarcando ? '...' : 'Marcar lida'}
                    </Botao>
                  )}
                  {m.lida && !m.resolvida && (
                    <span className="acn-ajuda acn-men-lida"><Icone path={mdiCheck} size={12} /> Lida</span>
                  )}
                  {!m.resolvida && !CONTEXTOS_SEM_RESPOSTA.has(m.contexto) && (
                    <Botao pequeno icone={mdiReply} onClick={() => setRespondendoId(id => id === m.id ? null : m.id)}>
                      {respondendoId===m.id ? 'Cancelar resposta' : 'Responder'}
                    </Botao>
                  )}
                  {!m.resolvida ? (
                    <Botao pequeno variante="primario" icone={isMarcando ? undefined : mdiCheck} onClick={() => marcarResolvida(m)} disabled={isMarcando}>
                      {isMarcando ? '...' : 'Marcar como resolvida'}
                    </Botao>
                  ) : (
                    <>
                      <span className="acn-men-resolvida">
                        <Icone path={mdiCheck} size={12} /> Resolvida{m.resolvida_por ? ` por ${m.resolvida_por}` : ''}
                      </span>
                      <Botao pequeno variante="discreto" icone={isMarcando ? undefined : mdiUndoVariant} onClick={() => reabrirMencao(m)} disabled={isMarcando}>
                        {isMarcando ? '...' : 'Reabrir'}
                      </Botao>
                    </>
                  )}
                </div>

                {/* Compositor de resposta — grava na tela de origem (CRM,
                    Licitação, Compras, SAC...) e resolve a menção sozinho. */}
                {respondendoId === m.id && (
                  <div className="acn-men-resposta">
                    <textarea className="acn-input"
                      autoFocus
                      value={textosResposta[m.id] || ''}
                      onChange={e => setTextosResposta(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Escreva sua resposta... ela vai aparecer direto na tela de origem"
                      rows={2}
                    />
                    <div>
                      <Botao variante="primario" pequeno icone={enviando[m.id] ? undefined : mdiSend}
                        onClick={() => enviarResposta(m)}
                        disabled={enviando[m.id] || !(textosResposta[m.id] || '').trim()}>
                        {enviando[m.id] ? 'Enviando...' : 'Enviar resposta'}
                      </Botao>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="acn-gav-rodape">
          <span className="acn-ajuda">
            {mencoes.length} menção(ões) exibida(s)
          </span>
          <Botao variante="primario" pequeno icone={mdiRefresh} onClick={load}>Atualizar</Botao>
        </div>
      </div>
    </div>
  );
}
