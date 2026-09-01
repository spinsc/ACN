// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDH = (v: string) => {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', {
    day:'2-digit', month:'2-digit', year:'2-digit',
    hour:'2-digit', minute:'2-digit',
  });
};

const fmtDate = (v: string) => {
  if (!v) return '';
  return new Date(v).toLocaleDateString('pt-BR');
};

const minutosRestantes = (v: string) => {
  if (!v) return null;
  return Math.round((new Date(v).getTime() - Date.now()) / 60000);
};

const alertLevel = (minutos: number | null) => {
  if (minutos === null || minutos < 0) return 'expirado';
  if (minutos <= 15) return 'urgente';
  if (minutos <= 1440) return '24h';
  return 'normal';
};

const ALERT_STYLES = {
  urgente:  { bg:'#fef2f2', border:'#fca5a5', dot:'#dc2626', label:'🔴 EM 15 MIN' },
  '24h':    { bg:'#fffbeb', border:'#fcd34d', dot:'#d97706', label:'🟡 EM 24H' },
  normal:   { bg:'#f8fafc', border:'#e2e8f0', dot:'#94a3b8', label:'' },
  expirado: { bg:'#f1f5f9', border:'#cbd5e1', dot:'#cbd5e1', label:'✓ Expirado' },
};

// Intervalo [início, fim] (ISO) para cada opção de período — semana e mês
// seguem o calendário local do usuário (semana começando na segunda-feira).
const intervaloPeriodo = (periodo: 'hoje'|'semana'|'mes'|'todos'): [string,string]|null => {
  if (periodo === 'todos') return null;
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
  if (periodo === 'hoje') return [inicio.toISOString(), fim.toISOString()];
  if (periodo === 'semana') {
    const diaSemana = inicio.getDay(); // 0=domingo..6=sábado
    const deltaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
    inicio.setDate(inicio.getDate() + deltaSegunda);
    fim.setTime(inicio.getTime());
    fim.setDate(fim.getDate() + 6);
    fim.setHours(23,59,59,999);
    return [inicio.toISOString(), fim.toISOString()];
  }
  // mes
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth()+1, 0, 23, 59, 59, 999);
  return [inicioMes.toISOString(), fimMes.toISOString()];
};

// ─────────────────────────────────────────────────────────────────────────────
// FORM NOVO COMPROMISSO
// ─────────────────────────────────────────────────────────────────────────────
function NovoCompromissoForm({ setor, currentUser, onSalvo, onCancel }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!titulo.trim() || !dataHora) return;
    setSalvando(true);
    await supabase.from('agenda_compromissos').insert([{
      setor,
      usuario_email: currentUser?.email,
      usuario_nome:  currentUser?.nome || currentUser?.email,
      titulo:        titulo.trim(),
      descricao:     descricao.trim() || null,
      data_hora:     new Date(dataHora).toISOString(),
    }]);
    setSalvando(false);
    onSalvo();
  };

  return (
    <div style={{ background:'#fff', border:'1.5px solid #3b82f6', borderRadius:8,
      padding:12, marginBottom:10 }}>
      <div style={{ fontSize:9, fontWeight:800, color:'#1d4ed8', marginBottom:8, textTransform:'uppercase' }}>
        📅 Novo Compromisso
      </div>
      <input
        value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Título *"
        style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5,
          padding:'5px 8px', fontSize:10, marginBottom:6, boxSizing:'border-box', outline:'none' }}
      />
      <textarea
        value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Descrição (opcional)"
        rows={2}
        style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5,
          padding:'5px 8px', fontSize:10, marginBottom:6, boxSizing:'border-box',
          resize:'none', outline:'none', fontFamily:'inherit' }}
      />
      <input
        type="datetime-local" value={dataHora}
        onChange={e => setDataHora(e.target.value)}
        min={new Date().toISOString().slice(0,16)}
        style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5,
          padding:'5px 8px', fontSize:10, marginBottom:8, boxSizing:'border-box', outline:'none' }}
      />
      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
        <button onClick={onCancel}
          style={{ background:'#f1f5f9', border:'none', borderRadius:4,
            padding:'5px 12px', fontSize:9, fontWeight:700, cursor:'pointer', color:'#475569' }}>
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !titulo.trim() || !dataHora}
          style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:4,
            padding:'5px 14px', fontSize:9, fontWeight:700, cursor:'pointer',
            opacity: (salvando || !titulo.trim() || !dataHora) ? .5 : 1 }}>
          {salvando ? 'Salvando...' : '✅ Salvar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE COMPROMISSO
// ─────────────────────────────────────────────────────────────────────────────
function CompromissoCard({ item, onConcluir, onExcluir, podeEditar }) {
  const minutos = minutosRestantes(item.data_hora);
  const nivel = alertLevel(minutos);
  const style = ALERT_STYLES[nivel];

  const label = nivel === 'urgente' ? style.label
    : nivel === '24h' ? style.label
    : nivel === 'expirado' ? style.label
    : '';

  return (
    <div style={{ background: style.bg, border:`1.5px solid ${style.border}`,
      borderLeft:`4px solid ${style.dot}`, borderRadius:7, padding:'8px 10px', marginBottom:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
            {label && (
              <span style={{ fontSize:8, fontWeight:800, color:
                nivel==='urgente' ? '#dc2626' : nivel==='24h' ? '#d97706' : '#9ca3af' }}>
                {label}
              </span>
            )}
            <span style={{ fontSize:10, fontWeight:700, color: item.concluido ? '#94a3b8' : '#1e293b',
              textDecoration: item.concluido ? 'line-through' : 'none' }}>
              {item.titulo}
            </span>
          </div>
          {item.descricao && (
            <div style={{ fontSize:9, color:'#64748b', marginBottom:3 }}>{item.descricao}</div>
          )}
          <div style={{ fontSize:9, color:'#94a3b8' }}>
            📅 {fmtDH(item.data_hora)}
            {item.usuario_nome && (
              <span style={{ marginLeft:8, color:'#94a3b8' }}>👤 {item.usuario_nome}</span>
            )}
          </div>
        </div>
        {podeEditar && (
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            {!item.concluido && (
              <button onClick={() => onConcluir(item.id)}
                title="Marcar como concluído"
                style={{ background:'#dcfce7', border:'none', borderRadius:4,
                  padding:'3px 8px', fontSize:9, cursor:'pointer', color:'#166534', fontWeight:700 }}>
                ✓
              </button>
            )}
            <button onClick={() => onExcluir(item.id)}
              title="Excluir"
              style={{ background:'#fee2e2', border:'none', borderRadius:4,
                padding:'3px 6px', fontSize:9, cursor:'pointer', color:'#dc2626', fontWeight:700 }}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA WIDGET PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function AgendaWidget({ setor, currentUser }: { setor: string; currentUser: any }) {
  const [compromissos, setCompromissos] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [adicionando, setAdicionando]   = useState(false);
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [modoView, setModoView]         = useState<'meus'|'equipe'|'todos'>('meus');
  // Filtro de período — abre por padrão nos compromissos da semana corrente.
  const [periodo, setPeriodo]           = useState<'hoje'|'semana'|'mes'|'todos'>('semana');
  const [equipeEmails, setEquipeEmails] = useState<string[]|null>(null); // null = ainda não carregou
  // Perfil "gerente" cobre Admin e qualquer variação de Gerente (Gerente,
  // Gerente Comercial, Gerente de Licitações, etc) — antes só comparava
  // com a string exata 'gerente' minúscula, que nunca batia de verdade.
  const isGerente = /gerente|admin/i.test(currentUser?.perfil || '');
  // Agenda de Licitações é pública: todos os usuários do setor veem os
  // compromissos de todo mundo (sem precisar ser gerente), mas só
  // concluem/excluem os próprios — ver CompromissoCard/podeEditar abaixo.
  // Os demais setores continuam com a regra original (só o gerente pode
  // ver "Equipe"/"Todos").
  const agendaPublica = setor === 'licitacoes';
  const timerRef = useRef<any>(null);

  // Equipe = usuários que têm este usuário como gestor (auth_usuarios.gestor_id)
  useEffect(() => {
    if (!currentUser?.id) return;
    supabase.from('auth_usuarios').select('email').eq('gestor_id', currentUser.id)
      .then(({ data }) => setEquipeEmails((data || []).map((u: any) => u.email).filter(Boolean)));
  }, [currentUser?.id]);

  const carregar = useCallback(async () => {
    let q = supabase.from('agenda_compromissos')
      .select('*')
      .eq('setor', setor)
      .order('data_hora', { ascending: true });

    if (agendaPublica) {
      // pública: sem filtro de usuário, todo mundo vê tudo
    } else if (modoView === 'equipe' && isGerente) {
      q = q.in('usuario_email', (equipeEmails && equipeEmails.length) ? equipeEmails : ['__nenhum__']);
    } else if (!(modoView === 'todos' && isGerente)) {
      q = q.eq('usuario_email', currentUser?.email);
    }
    if (!mostrarConcluidos) {
      q = q.eq('concluido', false);
    }
    const intervalo = intervaloPeriodo(periodo);
    if (intervalo) {
      q = q.gte('data_hora', intervalo[0]).lte('data_hora', intervalo[1]);
    }

    const { data } = await q.limit(50);
    setCompromissos(data || []);
    setLoading(false);
  }, [setor, currentUser?.email, isGerente, agendaPublica, modoView, equipeEmails, mostrarConcluidos, periodo]);

  useEffect(() => {
    carregar();
    // Polling a cada 30s para detectar novos alertas
    timerRef.current = setInterval(carregar, 30000);
    return () => clearInterval(timerRef.current);
  }, [carregar]);

  const concluir = async (id: string) => {
    await supabase.from('agenda_compromissos').update({
      concluido: true, concluido_em: new Date().toISOString(),
    }).eq('id', id);
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este compromisso?')) return;
    await supabase.from('agenda_compromissos').delete().eq('id', id);
    carregar();
  };

  // Contar alertas ativos (urgentes + 24h)
  const alertas = compromissos.filter(c => {
    const min = minutosRestantes(c.data_hora);
    return min !== null && min >= 0 && min <= 1440 && !c.concluido;
  });

  return (
    // .sec-card/.sec-hdr/.sec-body -- mesmo sistema de recolher usado no
    // resto do app (DashboardTab.tsx tem um listener global de clique em
    // qualquer .sec-hdr que colapsa o .sec-card pai): clicar no cabeçalho
    // recolhe a agenda pra ganhar espaço na tela quando ela não é
    // necessária, sem precisar de estado/lógica própria aqui.
    <div className="sec-card" style={{ marginBottom:12 }}>
      {/* Header — textTransform/letterSpacing zerados pra não herdar o
          uppercase padrão de .sec-hdr (pensado pra títulos curtos, não
          pros botões/labels normais que este header também tem) */}
      <div className="sec-hdr" style={{ padding:'10px 14px', textTransform:'none', letterSpacing:'normal' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flex:1, minWidth:0, flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:800, color:'#1e3a5f' }}>📅 Agenda</span>
            {alertas.length > 0 && (
              <span style={{ background:'#dc2626', color:'#fff', borderRadius:10,
                padding:'1px 8px', fontSize:9, fontWeight:800 }}>
                {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
              </span>
            )}
            {compromissos.length > 0 && alertas.length === 0 && (
              <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:10,
                padding:'1px 8px', fontSize:9, fontWeight:700 }}>
                {compromissos.length} compromisso{compromissos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', gap:2, background:'#f1f5f9', borderRadius:4, padding:2 }}>
              {([
                ['hoje','Hoje'], ['semana','Semana'], ['mes','Mês'], ['todos','Todos'],
              ] as [typeof periodo, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setPeriodo(v)}
                  style={{ background: periodo===v ? '#1e3a5f' : 'transparent',
                    color: periodo===v ? '#fff' : '#475569',
                    border:'none', borderRadius:3, padding:'3px 9px', fontSize:9,
                    fontWeight:700, cursor:'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            {!agendaPublica && isGerente && (
              <div style={{ display:'flex', gap:2, background:'#f1f5f9', borderRadius:4, padding:2 }}>
                {([
                  ['meus',  '👤 Meus'],
                  ...(equipeEmails && equipeEmails.length > 0 ? [['equipe', '👔 Equipe']] : []),
                  ['todos', '👥 Todos'],
                ] as [typeof modoView, string][]).map(([v, label]) => (
                  <button key={v} onClick={() => setModoView(v)}
                    style={{ background: modoView===v ? '#1e3a5f' : 'transparent',
                      color: modoView===v ? '#fff' : '#475569',
                      border:'none', borderRadius:3, padding:'3px 9px', fontSize:9,
                      fontWeight:700, cursor:'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setMostrarConcluidos(v => !v)}
              style={{ background:'#f1f5f9', border:'none', borderRadius:4,
                padding:'3px 10px', fontSize:9, color:'#475569', cursor:'pointer', fontWeight:600 }}>
              {mostrarConcluidos ? 'Ocultar concluídos' : 'Ver concluídos'}
            </button>
            <button onClick={() => setAdicionando(v => !v)}
              style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:5,
                padding:'4px 12px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              + Novo
            </button>
          </div>
        </div>
      </div>

      <div className="sec-body">
        {agendaPublica && (
          <div style={{ fontSize:9, color:'#94a3b8', marginBottom:8 }}>
            👥 Agenda pública do setor — todos veem os compromissos de todos; cada um só conclui/exclui os próprios.
          </div>
        )}

        {/* Form novo compromisso */}
        {adicionando && (
          <NovoCompromissoForm
            setor={setor} currentUser={currentUser}
            onSalvo={() => { setAdicionando(false); carregar(); }}
            onCancel={() => setAdicionando(false)}
          />
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', padding:'12px 0' }}>
            Carregando agenda...
          </div>
        ) : compromissos.length === 0 ? (
          <div style={{ fontSize:10, color:'#cbd5e1', textAlign:'center', padding:'12px 0' }}>
            Nenhum compromisso agendado {periodo !== 'todos' ? 'neste período' : ''}
          </div>
        ) : (
          // maxHeight + scroll próprio -- sem isso, no modo "Todos" (até 50
          // compromissos de todo mundo) a lista crescia sem limite e "engolia"
          // a página: como o container pai é flex:1/overflowY:auto (ver
          // LicitacoesTab.tsx e outras telas que usam este widget), um filho
          // sem min-height/max-height não encolhe (é o comportamento padrão
          // de flex-item), então o resto da página ficava espremido/sem
          // conseguir rolar até o fim. Com isso, o próprio card da Agenda
          // rola internamente e o layout ao redor fica estável.
          <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
            {compromissos.map(c => (
              <CompromissoCard key={c.id} item={c} onConcluir={concluir} onExcluir={excluir}
                podeEditar={!agendaPublica || c.usuario_email === currentUser?.email} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
