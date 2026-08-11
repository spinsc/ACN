// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SETORES = [
  { id: 'geral',       label: 'Geral',       cor: '#64748b' },
  { id: 'comercial',   label: 'Comercial',   cor: '#2563eb' },
  { id: 'licitacoes',  label: 'Licitações',  cor: '#7c3aed' },
  { id: 'engenharia',  label: 'Engenharia',  cor: '#0891b2' },
  { id: 'sac',         label: 'SAC',         cor: '#dc2626' },
];
const SETOR_COR: Record<string, string> = SETORES.reduce((a, s) => ({ ...a, [s.id]: s.cor }), {} as any);
const COR_CRM = '#f59e0b';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const HORAS_GRID = Array.from({ length: 15 }, (_, i) => i + 6); // 06h–20h

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isSameDay = (a: Date, b: Date) => isoDate(a) === isoDate(b);
const hojeStr = () => isoDate(new Date());

function getMonthGrid(ref: Date) {
  const year = ref.getFullYear(), month = ref.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function getWeekDays(ref: Date) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const fmtDiaLongo = (d: Date) => d.toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
});

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: DETALHE DO DIA + NOVO COMPROMISSO
// ─────────────────────────────────────────────────────────────────────────────
function ModalDia({ data, horaInicial, eventos, currentUser, onClose, onChanged }: any) {
  const [criando, setCriando] = useState(eventos.length === 0);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [setor, setSetor] = useState('geral');
  const [hora, setHora] = useState(horaInicial || '09:00');
  const [salvando, setSalvando] = useState(false);

  const limparForm = () => { setTitulo(''); setDescricao(''); setSetor('geral'); setHora('09:00'); setEditandoId(null); };

  const salvar = async () => {
    if (!titulo.trim() || !hora) return;
    setSalvando(true);
    const dataHoraISO = new Date(`${isoDate(data)}T${hora}:00`).toISOString();
    if (editandoId) {
      await supabase.from('agenda_compromissos').update({
        titulo: titulo.trim(), descricao: descricao.trim() || null,
        setor, data_hora: dataHoraISO,
      }).eq('id', editandoId);
    } else {
      await supabase.from('agenda_compromissos').insert([{
        setor,
        usuario_email: currentUser?.email,
        usuario_nome:  currentUser?.nome || currentUser?.email,
        titulo:        titulo.trim(),
        descricao:     descricao.trim() || null,
        data_hora:     dataHoraISO,
      }]);
    }
    setSalvando(false);
    limparForm();
    setCriando(false);
    onChanged();
  };

  const iniciarEdicao = (ev: any) => {
    setEditandoId(ev.id);
    setTitulo(ev.raw.titulo);
    setDescricao(ev.raw.descricao || '');
    setSetor(ev.raw.setor || 'geral');
    setHora(ev.hora || '09:00');
    setCriando(true);
  };

  const concluir = async (id: string) => {
    await supabase.from('agenda_compromissos').update({
      concluido: true, concluido_em: new Date().toISOString(),
    }).eq('id', id);
    onChanged();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este compromisso?')) return;
    await supabase.from('agenda_compromissos').delete().eq('id', id);
    onChanged();
  };

  const inp: React.CSSProperties = {
    width: '100%', border: '1px solid #d1d5db', borderRadius: 5,
    padding: '6px 9px', fontSize: 11, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 460, maxWidth: '94vw',
        maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#0f766e', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'capitalize' }}>📅 {fmtDiaLongo(data)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {eventos.length === 0 && !criando && (
            <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}>
              Nenhum evento neste dia.
            </div>
          )}

          {eventos.map((ev: any) => (
            <div key={ev.tipo + ev.id} style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `4px solid ${ev.cor}`,
              borderRadius: 6, padding: '7px 10px', marginBottom: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ev.raw?.concluido ? '#94a3b8' : '#1e293b',
                    textDecoration: ev.raw?.concluido ? 'line-through' : 'none' }}>
                    {ev.hora && <span style={{ color: ev.cor, marginRight: 5 }}>{ev.hora}</span>}
                    {ev.titulo}
                  </div>
                  {ev.tipo === 'compromisso' && ev.raw.descricao && (
                    <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{ev.raw.descricao}</div>
                  )}
                  <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>
                    {ev.tipo === 'compromisso'
                      ? <>🏷️ {SETORES.find(s => s.id === ev.raw.setor)?.label || ev.raw.setor} · 👤 {ev.raw.usuario_nome || ev.raw.usuario_email}</>
                      : <>📇 Contato CRM · 👤 {ev.raw.responsavel_nome || '—'} {ev.raw.nome_contato ? `· ${ev.raw.nome_contato}` : ''}</>}
                  </div>
                </div>
                {ev.tipo === 'compromisso' && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => iniciarEdicao(ev)} title="Editar"
                      style={{ background: '#e0f2fe', border: 'none', borderRadius: 4, padding: '3px 7px',
                        fontSize: 9, cursor: 'pointer', color: '#0369a1', fontWeight: 700 }}>✎</button>
                    {!ev.raw.concluido && (
                      <button onClick={() => concluir(ev.id)} title="Concluir"
                        style={{ background: '#dcfce7', border: 'none', borderRadius: 4, padding: '3px 7px',
                          fontSize: 9, cursor: 'pointer', color: '#166534', fontWeight: 700 }}>✓</button>
                    )}
                    <button onClick={() => excluir(ev.id)} title="Excluir"
                      style={{ background: '#fee2e2', border: 'none', borderRadius: 4, padding: '3px 6px',
                        fontSize: 9, cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>✕</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {criando ? (
            <div style={{ background: '#fff', border: '1.5px solid #3b82f6', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase' }}>
                {editandoId ? '✎ Editar Compromisso' : '📅 Novo Compromisso'}
              </div>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título *" style={{ ...inp, marginBottom: 6 }} />
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)"
                rows={2} style={{ ...inp, marginBottom: 6, resize: 'none' }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <select value={setor} onChange={e => setSetor(e.target.value)} style={{ ...inp, flex: 1 }}>
                  {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={{ ...inp, width: 100 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { limparForm(); setCriando(eventos.length === 0); }}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, padding: '5px 12px',
                    fontSize: 9, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>Cancelar</button>
                <button onClick={salvar} disabled={salvando || !titulo.trim() || !hora}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px',
                    fontSize: 9, fontWeight: 700, cursor: 'pointer', opacity: (salvando || !titulo.trim() || !hora) ? .5 : 1 }}>
                  {salvando ? 'Salvando...' : '✅ Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCriando(true)}
              style={{ width: '100%', marginTop: 8, background: '#eff6ff', border: '1px dashed #93c5fd',
                borderRadius: 6, padding: '8px 0', fontSize: 10, fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}>
              + Novo compromisso
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO TAB
// ─────────────────────────────────────────────────────────────────────────────
export default function CalendarioTab({ currentUser }: { currentUser: any }) {
  const [modo, setModo]           = useState<'mes' | 'semana'>('mes');
  const [cursor, setCursor]       = useState(new Date());
  const [setorFiltro, setSetorFiltro] = useState('todos');
  const [verTodos, setVerTodos]   = useState(false);
  const [compromissos, setCompromissos] = useState<any[]>([]);
  const [contatosCrm, setContatosCrm]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [diaAberto, setDiaAberto] = useState<{ data: Date; hora?: string } | null>(null);

  const isGerente = ['Admin', 'Gerente', 'Gerente Comercial'].includes(currentUser?.perfil);

  const dias = useMemo(() => (modo === 'mes' ? getMonthGrid(cursor) : getWeekDays(cursor)), [modo, cursor]);
  const rangeInicio = dias[0];
  const rangeFim = dias[dias.length - 1];

  const carregar = useCallback(async () => {
    setLoading(true);
    const inicioISO = new Date(rangeInicio.getFullYear(), rangeInicio.getMonth(), rangeInicio.getDate(), 0, 0, 0).toISOString();
    const fimISO     = new Date(rangeFim.getFullYear(), rangeFim.getMonth(), rangeFim.getDate(), 23, 59, 59).toISOString();

    let qComp = supabase.from('agenda_compromissos').select('*')
      .gte('data_hora', inicioISO).lte('data_hora', fimISO)
      .order('data_hora', { ascending: true });
    if (!isGerente || !verTodos) qComp = qComp.eq('usuario_email', currentUser?.email);
    if (setorFiltro !== 'todos') qComp = qComp.eq('setor', setorFiltro);

    let qCrm = supabase.from('crm_oportunidades')
      .select('id,titulo,nome_contato,prox_contato,hora_prox_contato,responsavel_nome')
      .eq('funil', 'venda_direta')
      .not('prox_contato', 'is', null)
      .gte('prox_contato', isoDate(rangeInicio)).lte('prox_contato', isoDate(rangeFim))
      .order('prox_contato', { ascending: true });
    if (!isGerente || !verTodos) qCrm = qCrm.eq('responsavel_nome', currentUser?.nome);
    // Contatos de CRM só entram na visão "Todos os setores" ou "Comercial"
    const incluirCrm = setorFiltro === 'todos' || setorFiltro === 'comercial';

    const [rComp, rCrm] = await Promise.all([qComp.limit(500), incluirCrm ? qCrm.limit(500) : Promise.resolve({ data: [] })]);
    setCompromissos(rComp.data || []);
    setContatosCrm(rCrm.data || []);
    setLoading(false);
  }, [rangeInicio.getTime(), rangeFim.getTime(), setorFiltro, verTodos, isGerente, currentUser?.email, currentUser?.nome]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Monta mapa dia → eventos unificados ──────────────────────────────────
  const eventosPorDia = useMemo(() => {
    const map: Record<string, any[]> = {};
    compromissos.forEach(c => {
      const d = new Date(c.data_hora);
      const key = isoDate(d);
      (map[key] ||= []).push({
        tipo: 'compromisso', id: c.id, titulo: c.titulo,
        hora: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        horaOrdem: d.getHours() * 60 + d.getMinutes(),
        cor: SETOR_COR[c.setor] || SETOR_COR.geral, raw: c,
      });
    });
    contatosCrm.forEach(o => {
      const key = o.prox_contato;
      (map[key] ||= []).push({
        tipo: 'crm', id: o.id, titulo: o.titulo,
        hora: o.hora_prox_contato ? String(o.hora_prox_contato).slice(0, 5) : null,
        horaOrdem: o.hora_prox_contato ? (parseInt(o.hora_prox_contato.slice(0,2)) * 60 + parseInt(o.hora_prox_contato.slice(3,5))) : -1,
        cor: COR_CRM, raw: o,
      });
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.horaOrdem - b.horaOrdem));
    return map;
  }, [compromissos, contatosCrm]);

  const totalEventos = compromissos.length + contatosCrm.length;

  // ── Navegação ─────────────────────────────────────────────────────────────
  const irHoje = () => setCursor(new Date());
  const irAnterior = () => setCursor(d => modo === 'mes'
    ? new Date(d.getFullYear(), d.getMonth() - 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
  const irProximo = () => setCursor(d => modo === 'mes'
    ? new Date(d.getFullYear(), d.getMonth() + 1, 1)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));

  const tituloTopo = modo === 'mes'
    ? `${MESES[cursor.getMonth()]} de ${cursor.getFullYear()}`
    : `${dias[0].getDate()} ${MESES[dias[0].getMonth()].slice(0,3)} – ${dias[6].getDate()} ${MESES[dias[6].getMonth()].slice(0,3)} de ${dias[6].getFullYear()}`;

  const btnFiltro = (ativo: boolean): React.CSSProperties => ({
    background: ativo ? '#0f766e' : '#f1f5f9', color: ativo ? '#fff' : '#475569',
    border: 'none', borderRadius: 5, padding: '3px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <div className="sec-card">
      <div className="sec-hdr no-collapse">
        <span>📅 Calendário {loading ? '· carregando…' : totalEventos > 0 ? `· ${totalEventos} evento${totalEventos !== 1 ? 's' : ''}` : ''}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {isGerente && (
            <button onClick={() => setVerTodos(v => !v)} style={btnFiltro(verTodos)}>
              {verTodos ? '👥 Todos os usuários' : '👤 Meus compromissos'}
            </button>
          )}
          <button onClick={() => setModo('mes')} style={btnFiltro(modo === 'mes')}>Mês</button>
          <button onClick={() => setModo('semana')} style={btnFiltro(modo === 'semana')}>Semana</button>
        </div>
      </div>

      <div className="sec-body">
        {/* Filtro de setor */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setSetorFiltro('todos')} style={btnFiltro(setorFiltro === 'todos')}>Todos</button>
          {SETORES.map(s => (
            <button key={s.id} onClick={() => setSetorFiltro(s.id)}
              style={{ ...btnFiltro(setorFiltro === s.id), ...(setorFiltro !== s.id ? { boxShadow: `inset 0 -2px 0 ${s.cor}` } : {}) }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Navegação */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={irAnterior} style={{ ...btnFiltro(false), padding: '3px 9px' }}>‹</button>
            <button onClick={irHoje} style={{ ...btnFiltro(false), padding: '3px 9px' }}>Hoje</button>
            <button onClick={irProximo} style={{ ...btnFiltro(false), padding: '3px 9px' }}>›</button>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#1e3a5f', marginLeft: 6, textTransform: 'capitalize' }}>{tituloTopo}</span>
          </div>
          <button onClick={() => setDiaAberto({ data: new Date() })}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5,
              padding: '5px 14px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
            + Novo Compromisso
          </button>
        </div>

        {modo === 'mes' ? (
          <MesGrid dias={dias} cursor={cursor} eventosPorDia={eventosPorDia} onDiaClick={d => setDiaAberto({ data: d })} />
        ) : (
          <SemanaGrid dias={dias} eventosPorDia={eventosPorDia}
            onSlotClick={(d, h) => setDiaAberto({ data: d, hora: h })} />
        )}
      </div>

      {diaAberto && (
        <ModalDia
          data={diaAberto.data}
          horaInicial={diaAberto.hora}
          eventos={eventosPorDia[isoDate(diaAberto.data)] || []}
          currentUser={currentUser}
          onClose={() => setDiaAberto(null)}
          onChanged={() => { carregar(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE MENSAL
// ─────────────────────────────────────────────────────────────────────────────
function MesGrid({ dias, cursor, eventosPorDia, onDiaClick }: any) {
  const hoje = hojeStr();
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
        {DIAS_SEMANA.map(d => (
          <div key={d} style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textAlign: 'center', padding: '3px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {dias.map((d: Date, i: number) => {
          const key = isoDate(d);
          const eventos = eventosPorDia[key] || [];
          const foraDoMes = d.getMonth() !== cursor.getMonth();
          const isHoje = key === hoje;
          return (
            <div key={i} onClick={() => onDiaClick(d)}
              style={{
                minHeight: 78, background: isHoje ? '#f0fdfa' : foraDoMes ? '#fafbfc' : '#fff',
                border: isHoje ? '1.5px solid #0f766e' : '1px solid #e8ecf0', borderRadius: 6,
                padding: '4px 5px', cursor: 'pointer', opacity: foraDoMes ? .5 : 1,
              }}>
              <div style={{ fontSize: 9, fontWeight: isHoje ? 800 : 600, color: isHoje ? '#0f766e' : '#475569', marginBottom: 3 }}>
                {d.getDate()}
              </div>
              {eventos.slice(0, 3).map((ev: any) => (
                <div key={ev.tipo + ev.id} style={{
                  fontSize: 8, color: '#fff', background: ev.cor, borderRadius: 3, padding: '1px 4px',
                  marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: ev.raw?.concluido ? 'line-through' : 'none', opacity: ev.raw?.concluido ? .6 : 1,
                }}>
                  {ev.hora ? `${ev.hora} ` : ''}{ev.titulo}
                </div>
              ))}
              {eventos.length > 3 && (
                <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 700 }}>+{eventos.length - 3} mais</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE SEMANAL (estilo agenda por hora)
// ─────────────────────────────────────────────────────────────────────────────
function SemanaGrid({ dias, eventosPorDia, onSlotClick }: any) {
  const hoje = hojeStr();
  const ROW_H = 32;

  return (
    <div style={{ border: '1px solid #e8ecf0', borderRadius: 6, overflow: 'hidden' }}>
      {/* Cabeçalho dos dias */}
      <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)', background: '#fafbfc', borderBottom: '1px solid #e8ecf0' }}>
        <div />
        {dias.map((d: Date, i: number) => {
          const isHoje = isoDate(d) === hoje;
          return (
            <div key={i} style={{ textAlign: 'center', padding: '5px 2px', borderLeft: '1px solid #e8ecf0' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8' }}>{DIAS_SEMANA[d.getDay()]}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: isHoje ? '#0f766e' : '#374151' }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Linha "dia inteiro" — eventos sem horário (contatos CRM sem hora) */}
      <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)', borderBottom: '1px solid #e8ecf0' }}>
        <div style={{ fontSize: 7, color: '#cbd5e1', textAlign: 'right', paddingRight: 4, paddingTop: 3 }}>dia</div>
        {dias.map((d: Date, i: number) => {
          const eventos = (eventosPorDia[isoDate(d)] || []).filter((e: any) => !e.hora);
          return (
            <div key={i} onClick={() => onSlotClick(d, '09:00')}
              style={{ borderLeft: '1px solid #e8ecf0', padding: 3, minHeight: 22, cursor: 'pointer' }}>
              {eventos.map((ev: any) => (
                <div key={ev.tipo + ev.id} style={{
                  fontSize: 7.5, color: '#fff', background: ev.cor, borderRadius: 3, padding: '1px 4px', marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{ev.titulo}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Grade horária */}
      <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)', position: 'relative', maxHeight: 480, overflowY: 'auto' }}>
        <div>
          {HORAS_GRID.map(h => (
            <div key={h} style={{ height: ROW_H, fontSize: 8, color: '#cbd5e1', textAlign: 'right', paddingRight: 4, borderTop: '1px solid #f1f5f9' }}>
              {pad2(h)}h
            </div>
          ))}
        </div>
        {dias.map((d: Date, i: number) => {
          const eventos = (eventosPorDia[isoDate(d)] || []).filter((e: any) => e.hora);
          return (
            <div key={i} style={{ position: 'relative', borderLeft: '1px solid #e8ecf0' }}>
              {HORAS_GRID.map(h => (
                <div key={h} onClick={() => onSlotClick(d, `${pad2(h)}:00`)}
                  style={{ height: ROW_H, borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} />
              ))}
              {eventos.map((ev: any) => {
                const top = (ev.horaOrdem / 60 - HORAS_GRID[0]) * ROW_H;
                if (top < 0 || top > HORAS_GRID.length * ROW_H) return null;
                return (
                  <div key={ev.tipo + ev.id} onClick={(e) => { e.stopPropagation(); onSlotClick(d, ev.hora); }}
                    style={{
                      position: 'absolute', top, left: 2, right: 2, background: ev.cor, color: '#fff',
                      borderRadius: 3, padding: '1px 4px', fontSize: 7.5, overflow: 'hidden', whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.15)',
                      textDecoration: ev.raw?.concluido ? 'line-through' : 'none', opacity: ev.raw?.concluido ? .6 : 1,
                    }}>
                    {ev.hora} {ev.titulo}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
