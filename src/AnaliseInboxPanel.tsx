// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Botao, Chips, Tag, Selo } from './Interface';
import Icone from './Icone';
import { mdiBellOutline, mdiRefresh, mdiClose, mdiCheck, mdiCheckCircleOutline, mdiTimerSand, mdiCancel, mdiBriefcaseOutline, mdiGavel, mdiNoteTextOutline, mdiChevronUp, mdiChevronDown } from '@mdi/js';
import { SETOR_LABEL, concluirAnaliseSetor, reabrirAnaliseSetor, podeCancelarAnalise, cancelarSolicitacaoAnalise, MarcaEditada, ParecerEditavel, autoriaDoParecer } from './AnaliseWidget';

// ─────────────────────────────────────────────────────────────────────────────
// Painel Inbox de Análises Orçamentárias
// Abre via badge 🔔 no header — mostra todas as solicitações em_andamento
// Permite que o analista finalize setores individualmente
// ─────────────────────────────────────────────────────────────────────────────

// 12e47 (09/10/2026): a cor de cada setor vem do design.css ([data-setor] define --acn-setor, criado na 12e46); a gaveta usa as classes acn-gav-* (comuns às Menções) e acn-ain-*

const fmtDT = (v: string) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return v; }
};

// Setor de análise → aba correspondente em abas_permitidas (mesmas chaves
// usadas no switch de DashboardTab.tsx). 'Orcamento' não tem aba própria —
// quem abre este painel já passou pelo gate de recebe_alerta_analise, então
// fica sempre disponível pra quem o vê. 'Comercial' não tem tab própria
// (a antiga ComercialTab.tsx foi apagada em 29/09/2026) — mapeado pra 'crm', o
// time que mais lida com esse tipo de pedido na prática.
const SETOR_ABA: Record<string, string | null> = {
  Comercial:   'crm',
  Telecom:     'telecom',
  Engenharia:  'engenharia',
  Orcamento:   null,
  Chicotes:    'chicotes',
  Serralheria: 'serralheria',
  Producao:    'producao',
  Laboratorio: 'laboratorio',
};

// Setores que a pessoa pode analisar: os das abas que ela acessa (Admin: todos).
// "Orçamento" não tem aba — fica com quem tem "recebe alerta de análise".
export function setoresQueAnalisa(currentUser: any): string[] {
  const abas = currentUser?.abas_permitidas;
  const admin = currentUser?.perfil === 'Admin';
  const semRestricao = admin || !Array.isArray(abas) || abas.length === 0;
  return Object.keys(SETOR_ABA).filter(s => {
    const aba = SETOR_ABA[s];
    if (aba === null) return admin || !!currentUser?.recebe_alerta_analise;
    return semRestricao || abas.includes(aba);
  });
}

/** Solicitações em andamento com pelo menos um setor DESTA pessoa ainda pendente. */
export async function contarAnalisesDoUsuario(currentUser: any): Promise<number> {
  const meus = setoresQueAnalisa(currentUser);
  if (!meus.length) return 0;
  const { data } = await supabase.from('analise_setores')
    .select('solicitacao_id, analise_solicitacoes!inner(status)')
    .eq('status', 'pendente').eq('analise_solicitacoes.status', 'em_andamento')
    .in('setor', meus);
  return new Set((data || []).map((r: any) => r.solicitacao_id)).size;
}

interface Props {
  currentUser: any;
  onClose: () => void;
  onCountChange?: (n: number) => void;
  onNavigate?: (tab: string) => void;
}

export default function AnaliseInboxPanel({ currentUser, onClose, onCountChange, onNavigate }: Props) {
  const [analises, setAnalises]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState<Record<string, boolean>>({});
  const [notas, setNotas]           = useState<Record<string, string>>({});   // setorId → nota
  const [expandido, setExpandido]   = useState<Record<string, boolean>>({});  // solicitacaoId → bool
  const [filtro, setFiltro]         = useState<'pendente' | 'concluidas' | 'tudo'>('pendente');
  const [setorFiltro, setSetorFiltro] = useState('todos'); // setor de analise_setores selecionado, ou 'todos'
  const [pendentesGlobal, setPendentesGlobal] = useState(0); // total real, independe do filtro selecionado

  // Opções do filtro de setor — só os setores cuja aba correspondente o
  // usuário tem permissão de ver (mesmo critério de isVisible() em
  // DashboardTab.tsx: Admin ou sem abas_permitidas configuradas vê tudo).
  const setorOpcoes = React.useMemo(() => setoresQueAnalisa(currentUser),
    [currentUser?.abas_permitidas, currentUser?.perfil, currentUser?.recebe_alerta_analise]);
  // Admin vê a solicitação inteira; os demais só a parte do próprio setor.
  const veTodosSetores = currentUser?.perfil === 'Admin';

  // Filtra por setor no cliente — um card (solicitação) pode ter vários
  // setores, então "filtrar por setor" mantém o card se PELO MENOS um dos
  // setores dele bater, sem esconder os outros setores do mesmo card.
  const analisesFiltradas = React.useMemo(() => {
    // só solicitações que pedem análise de algum setor desta pessoa
    // (em "Pendentes", quem não é Admin só vê o que o seu setor ainda não analisou)
    const minhas = analises.filter(sol => (sol.analise_setores || []).some((s: any) =>
      setorOpcoes.includes(s.setor) && (veTodosSetores || filtro !== 'pendente' || s.status === 'pendente')));
    if (setorFiltro === 'todos') return minhas;
    return minhas.filter(sol => (sol.analise_setores || []).some((s: any) => s.setor === setorFiltro));
  }, [analises, setorFiltro, setorOpcoes, filtro, veTodosSetores]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = supabase
      .from('analise_solicitacoes')
      .select('*, analise_setores(*)')
      .order('criado_em', { ascending: false });
    if (filtro === 'pendente') q.eq('status', 'em_andamento');
    if (filtro === 'concluidas') q.eq('status', 'finalizada');

    const { data } = await q;
    const lista = data || [];
    setAnalises(lista);
    setLoading(false);
  }, [filtro]);

  // Contagem do badge do header é sempre "pendentes de verdade", independente
  // do filtro selecionado na tela — senão o badge some ao trocar de aba.
  const refreshCount = useCallback(async () => {
    const n = await contarAnalisesDoUsuario(currentUser);
    setPendentesGlobal(n);
    onCountChange?.(n);
  }, [onCountChange, currentUser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshCount(); }, [refreshCount]);

  const concluirSetor = async (solicitacao: any, setor: any) => {
    if (!await confirmar(`Concluir a análise do setor ${setor?.setor || setor?.nome || ''}?`)) return;
    const key = setor.id;
    setSalvando(prev => ({ ...prev, [key]: true }));
    try {
      await concluirAnaliseSetor(setor, solicitacao, { notas: notas[key], usuario: currentUser?.nome || 'Sistema' });
      await load();
      await refreshCount();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    }
    setSalvando(prev => ({ ...prev, [key]: false }));
  };

  const reabrirSetor = async (setor: any) => {
    await reabrirAnaliseSetor(setor);
    await load();
    await refreshCount();
  };


  return (
    <div className="acn-gav acn-gav-analise"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Backdrop semitransparente */}
      <div className="acn-gav-fundo" onClick={onClose} />

      {/* Painel lateral direito */}
      <div className="acn-gav-painel" role="dialog" aria-label="Análises">

        {/* Cabeçalho */}
        <div className="acn-gav-cab">
          <div className="acn-gav-cab-linha">
            <div>
              <div className="acn-gav-tit"><Icone path={mdiBellOutline} size={18} />Análises</div>
              <div className="acn-gav-sub">
                {pendentesGlobal > 0
                  ? `${pendentesGlobal} solicitação(ões) aguardando análise`
                  : 'Nenhuma pendência no momento'}
              </div>
            </div>
            <Botao variante="discreto" pequeno icone={mdiClose} className="acn-gav-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
          </div>

          {/* Filtro */}
          <div className="acn-gav-filtros">
            <Chips ativo={filtro} onChange={id => setFiltro(id as any)} rotulo="Situação das análises"
              itens={[{ id: 'pendente', rotulo: 'Pendentes' }, { id: 'concluidas', rotulo: 'Concluídas' }, { id: 'tudo', rotulo: 'Todas' }]} />
            {setorOpcoes.length > 1 && (
              <select value={setorFiltro} onChange={e => setSetorFiltro(e.target.value)} className="acn-input acn-gav-sel">
                {/* Popup de opções é renderizado pelo SO com fundo claro, não
                    pelo nosso CSS — sem cor própria aqui herdaria o branco do
                    <select> fechado e ficaria ilegível. O design.css fixa
                    escuro-sobre-claro nas próprias <option> (.acn-gav-sel option),
                    independente da cor do controle fechado. */}
                <option value="todos">Todos os setores</option>
                {setorOpcoes.map(s => (
                  <option key={s} value={s}>{SETOR_LABEL[s] || s}</option>
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
          {!loading && analisesFiltradas.length === 0 && (
            <div className="acn-empty acn-gav-vazio">
              <Icone path={mdiCheckCircleOutline} size={32} />
              <div>
                {setorFiltro !== 'todos' ? `Nenhuma análise de ${SETOR_LABEL[setorFiltro] || setorFiltro} aqui.`
                  : filtro === 'pendente' ? 'Nenhuma análise pendente!'
                  : filtro === 'concluidas' ? 'Nenhuma análise concluída ainda.'
                  : 'Nenhuma análise registrada.'}
              </div>
            </div>
          )}

          {analisesFiltradas.map(sol => {
            const setores: any[] = sol.analise_setores || [];
            const pendentes = setores.filter(s => s.status !== 'analisado').length;
            const exp = expandido[sol.id] !== false; // padrão expandido
            const origem = sol.origem === 'licitacao' ? 'Licitação' : sol.origem === 'crm' ? 'CRM' : sol.origem;
            const solConcluida = sol.status === 'finalizada';
            const solCancelada = sol.status === 'cancelada';

            return (
              <div key={sol.id} className={'acn-ain-sol ' + (solCancelada ? 'cancelada' : solConcluida ? 'concluida' : 'andamento')}>

                {/* Cabeçalho do card */}
                <div className="acn-ain-sol-cab"
                  onClick={() => setExpandido(prev => ({ ...prev, [sol.id]: !exp }))}>
                  <div className="acn-ain-sol-corpo">
                    <div className="acn-ain-sol-tags">
                      <Tag><Icone path={sol.origem === 'licitacao' ? mdiGavel : mdiBriefcaseOutline} size={11} /> {origem}</Tag>
                      {sol.origem_numero && (
                        <span className="acn-ajuda">#{sol.origem_numero}</span>
                      )}
                      <Selo familia={solCancelada ? 'erro' : solConcluida ? 'ok' : 'atencao'} ponto={false}>
                        <Icone path={solCancelada ? mdiCancel : solConcluida ? mdiCheckCircleOutline : mdiTimerSand} size={11} />{solCancelada ? 'Cancelada' : solConcluida ? 'Concluída' : `${pendentes} pendente(s)`}
                      </Selo>
                    </div>
                    <div className="acn-ain-sol-tit">
                      {sol.origem_titulo || '(sem título)'}
                    </div>
                    <div className="acn-ain-sol-acoes">
                      <span className="acn-ajuda">
                        Solicitado em {fmtDT(sol.criado_em)} por {sol.criado_por || '—'}
                      </span>
                      {onNavigate && (
                        <Botao pequeno icone={sol.origem === 'crm' ? mdiBriefcaseOutline : mdiGavel}
                          onClick={e => {
                            e.stopPropagation();
                            // Deep-link — mesmo mecanismo usado em Menções e no
                            // AnaliseWidget embutido: troca a aba E já abre o
                            // card específico (não só a aba genérica).
                            if (sol.origem_id) {
                              window.dispatchEvent(new CustomEvent('analise:abrir-origem', { detail: { origem: sol.origem, origemId: sol.origem_id } }));
                            }
                            onNavigate(sol.origem === 'crm' ? 'crm' : 'licitacoes');
                          }}>
                          {sol.origem === 'crm' ? 'Abrir no CRM' : 'Abrir Licitações'}
                        </Botao>
                      )}
                      {podeCancelarAnalise(sol, currentUser) && (
                        <Botao pequeno variante="perigo-sec" icone={mdiCancel}
                          onClick={async e => {
                            e.stopPropagation();
                            if (await cancelarSolicitacaoAnalise(sol, currentUser)) { await load(); await refreshCount(); }
                          }}
                          title="Cancelar esta solicitação (pede o motivo)">
                          Cancelar
                        </Botao>
                      )}
                    </div>
                    {solCancelada && (
                      <div className="acn-ain-canc">
                        Cancelada por <strong>{sol.cancelada_por || '—'}</strong>{sol.cancelada_em ? ' em ' + fmtDT(sol.cancelada_em) : ''}
                        {sol.motivo_cancelamento ? ' — ' + sol.motivo_cancelamento : ''}
                      </div>
                    )}
                  </div>
                  <span className="acn-ain-seta"><Icone path={exp ? mdiChevronUp : mdiChevronDown} size={16} /></span>
                </div>

                {/* Setores */}
                {exp && (
                  <div className="acn-ain-setores">
                    {setores.length === 0 && (
                      <div className="acn-ajuda">Nenhum setor cadastrado para esta análise.</div>
                    )}
                    {setores.filter(s => veTodosSetores || setorOpcoes.includes(s.setor)).map(setor => {
                      const concluido = setor.status === 'analisado';
                      const cancelado = setor.status === 'cancelado' || (solCancelada && !concluido);
                      const salvandoSetor = salvando[setor.id];
                      const label = SETOR_LABEL[setor.setor] || setor.setor;

                      return (
                        <div key={setor.id} data-setor={setor.setor} className={'acn-ain-setor' + (concluido ? ' feito' : '')}>
                          <div className="acn-ain-setor-cab">
                            <span className="acn-ain-setor-nome">
                              <Icone path={concluido ? mdiCheckCircleOutline : cancelado ? mdiCancel : mdiTimerSand} size={13} /> {label}{cancelado ? ' (cancelado)' : ''}
                            </span>
                            {concluido && setor.analisado_por && (
                              <span className="acn-ajuda">
                                por {autoriaDoParecer(setor).quem} · {fmtDT(autoriaDoParecer(setor).quando)}
                              </span>
                            )}
                            {concluido && <MarcaEditada setor={setor} />}
                            {concluido && !solCancelada && (
                              <Botao variante="discreto" pequeno className="acn-ain-reabrir" onClick={() => reabrirSetor(setor)}>
                                Reabrir
                              </Botao>
                            )}
                          </div>

                          {/* Nota do setor concluído */}
                          {concluido && (
                            <ParecerEditavel setor={setor} solicitacao={sol} currentUser={currentUser} onSaved={() => load()}>
                              {setor.notas && (
                                <div className="acn-ain-parecer">
                                  <Icone path={mdiNoteTextOutline} size={13} /> {setor.notas}
                                </div>
                              )}
                            </ParecerEditavel>
                          )}

                          {/* Campo nota + botão concluir (apenas pendentes) */}
                          {!concluido && !cancelado && (
                            <div className="acn-ain-obs">
                              <textarea className="acn-input"
                                value={notas[setor.id] || ''}
                                onChange={e => setNotas(prev => ({ ...prev, [setor.id]: e.target.value }))}
                                placeholder="Observação / resultado da análise (opcional)..."
                                rows={4}
                              />
                              <Botao variante="primario" pequeno icone={salvandoSetor ? mdiTimerSand : mdiCheckCircleOutline}
                                onClick={() => concluirSetor(sol, setor)}
                                disabled={salvandoSetor}>
                                {salvandoSetor ? 'Salvando...' : 'Concluir este setor'}
                              </Botao>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="acn-gav-rodape">
          <span className="acn-ajuda">
            {analisesFiltradas.length} registro(s) exibido(s)
          </span>
          <Botao variante="primario" pequeno icone={mdiRefresh} onClick={load}>Atualizar</Botao>
        </div>
      </div>
    </div>
  );
}
