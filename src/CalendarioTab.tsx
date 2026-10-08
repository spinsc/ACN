// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Faixa, Botao, Chips } from './Interface';
import Icone from './Icone';
import { mdiCalendarMonthOutline, mdiAccountGroupOutline, mdiAccountOutline } from '@mdi/js';
import { ehAdminOuGerente } from './utils/permissoes';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import { ParticipantesPicker, ListaParticipantes, participantesDe, ehDonoDoItem, filtroDonoOuParticipante, novosParticipantes, notificarParticipantes } from './Participantes';

// Etapa 12e5 (04/10/2026): a parte visual desta tela passou para as peças do design system (Chips, Botao, Faixa, a janela do sistema
// e as classes acn-cal-*), no lugar do estilo pintado à mão em cada elemento. Só aparência: os cliques, as gravações, as leituras,
// os textos, os filtros e a conta de onde cada evento cai (mês, semana, hora) são os de antes.

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// A cor de cada setor passou das cores soltas (cinza, azul, roxo, ciano, vermelho e âmbar do CRM) para as famílias do design system:
// seis cores que valem em todas as telas. O roxo e o ciano saíram (o sistema não os tem); Licitações ficou na cor da marca e
// Engenharia no verde. Cada setor continua com uma cor só dele, igual nos eventos, na lista do dia e no filtro.
const SETORES = [
  { id: 'geral',       label: 'Geral',       familia: 'neutro' },
  { id: 'comercial',   label: 'Comercial',   familia: 'info' },
  { id: 'licitacoes',  label: 'Licitações',  familia: 'marca' },
  { id: 'engenharia',  label: 'Engenharia',  familia: 'ok' },
  { id: 'sac',         label: 'SAC',         familia: 'erro' },
];
const SETOR_FAMILIA: Record<string, string> = SETORES.reduce((a, s) => ({ ...a, [s.id]: s.familia }), {} as any);
const FAMILIA_CRM = 'atencao';
// 07/10/2026: o calendário também mostra as tarefas (Financeiro, Engenharia) e os agendamentos de manutenção em que a pessoa é dona ou participante — leitura só (editam nas suas telas).
const FAMILIA_FIN = 'neutro', FAMILIA_ENG_TAREFA = 'ok', FAMILIA_AGEND = 'atencao';

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
function ModalDia({ data, horaInicial, eventos, leituraFalhou, currentUser, onClose, onChanged }: any) {
  const [criando, setCriando] = useState(eventos.length === 0);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [setor, setSetor] = useState('geral');
  const [hora, setHora] = useState(horaInicial || '09:00');
  const [salvando, setSalvando] = useState(false);
  const [participantes, setParticipantes] = useState<any[]>([]);          // pedido do usuário em 07/10/2026
  const [participantesAntes, setParticipantesAntes] = useState<any[]>([]); // para avisar só quem entrou agora

  const limparForm = () => { setTitulo(''); setDescricao(''); setSetor('geral'); setHora('09:00'); setEditandoId(null); setParticipantes([]); setParticipantesAntes([]); };

  const salvar = async () => {
    if (!titulo.trim() || !hora) return;
    setSalvando(true);
    const dataHoraISO = new Date(`${isoDate(data)}T${hora}:00`).toISOString();
    // Etapa 7.39 (04/10/2026): o resultado da gravação não era conferido. Com ela recusada, o formulário fechava, o que foi
    // digitado se perdia e o calendário recarregava como se o compromisso tivesse sido salvo. Agora avisa o erro e o formulário
    // continua aberto com o texto.
    const { data: gravado, error } = editandoId
      ? await supabase.from('agenda_compromissos').update({
          titulo: titulo.trim(), descricao: descricao.trim() || null,
          setor, data_hora: dataHoraISO, participantes,
        }).eq('id', editandoId).select('id').single()
      : await supabase.from('agenda_compromissos').insert([{
          setor,
          usuario_email: currentUser?.email,
          usuario_nome:  currentUser?.nome || currentUser?.email,
          titulo:        titulo.trim(),
          descricao:     descricao.trim() || null,
          data_hora:     dataHoraISO,
          participantes,
        }]).select('id').single();
    if (error) { alert('Não foi possível salvar o compromisso: ' + error.message); setSalvando(false); return; }
    // @menção na descrição e aviso aos participantes que entraram agora (o compromisso já está salvo: se o aviso falhar, diz quem não foi avisado)
    const idItem = String(gravado?.id || editandoId || '');
    await salvarMencoes({ texto: (titulo + ' ' + descricao), mencionanteId: String(currentUser?.id || ''), mencionanteNome: currentUser?.nome || currentUser?.email || 'Usuário',
      contexto: 'agenda', contextoId: idItem, contextoDescricao: 'Agenda: ' + titulo.trim(), campo: 'descricao', abaDestino: 'calendario' });
    const falhas = await notificarParticipantes({ novos: novosParticipantes(participantesAntes, participantes), autor: currentUser, contexto: 'agenda', contextoId: idItem,
      descricao: 'Agenda: ' + titulo.trim(), abaDestino: 'calendario', trecho: 'Você foi adicionado ao compromisso "' + titulo.trim() + '" em ' + data.toLocaleDateString('pt-BR') + ' às ' + hora });
    if (falhas.length) alert('O compromisso foi salvo, mas não foi possível avisar: ' + falhas.join('; '));
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
    setParticipantes(participantesDe(ev.raw)); setParticipantesAntes(participantesDe(ev.raw));
    setCriando(true);
  };

  const concluir = async (id: string) => {
    if (!await confirmar('Marcar este compromisso como concluído?')) return;
    const { error } = await supabase.from('agenda_compromissos').update({
      concluido: true, concluido_em: new Date().toISOString(),
    }).eq('id', id);
    if (error) { alert('Não foi possível concluir o compromisso: ' + error.message); return; }
    onChanged();
  };

  const excluir = async (id: string) => {
    if (!await confirmar('Excluir este compromisso?')) return;
    const { error } = await supabase.from('agenda_compromissos').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir o compromisso: ' + error.message); return; }
    onChanged();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCalendarMonthOutline} size={18} /> {fmtDiaLongo(data)}</span>
          <Botao variante="discreto" pequeno onClick={onClose}>✕</Botao>
        </div>

        <div className="acn-modal-corpo acn-form-cheio">
          {eventos.length === 0 && !criando && (
            <div className="acn-ajuda acn-centro">
              {leituraFalhou ? 'Não foi possível ler os eventos deste período (veja o aviso na tela).' : 'Nenhum evento neste dia.'}
            </div>
          )}

          {eventos.map((ev: any) => (
            <div key={ev.tipo + ev.id} className="acn-cal-item" data-acn-familia={ev.familia}>
              <div className="acn-cal-item-corpo">
                <div className={'acn-cal-item-titulo' + (ev.raw?.concluido ? ' feito' : '')}>
                  {ev.hora && <span className="acn-cal-item-hora">{ev.hora}</span>}
                  {ev.titulo}
                </div>
                {ev.tipo === 'compromisso' && ev.raw.descricao && (
                  <div className="acn-ajuda">{ev.raw.descricao}</div>
                )}
                <div className="acn-ajuda">
                  {ev.tipo === 'compromisso'
                    ? <>🏷️ {SETORES.find(s => s.id === ev.raw.setor)?.label || ev.raw.setor} · 👤 {ev.raw.usuario_nome || ev.raw.usuario_email}{participantesDe(ev.raw).length > 0 && <> · <ListaParticipantes item={ev.raw} usuario={currentUser} /></>}</>
                    : ev.tipo === 'crm'
                      ? <>📇 Contato CRM · 👤 {ev.raw.responsavel_nome || '—'} {ev.raw.nome_contato ? `· ${ev.raw.nome_contato}` : ''}{participantesDe(ev.raw).length > 0 && <> · <ListaParticipantes item={ev.raw} usuario={currentUser} /></>}</>
                      : ev.detalhe}
                </div>
              </div>
              {ev.tipo === 'compromisso' && (ehDonoDoItem(ev.raw, currentUser) || ehAdminOuGerente(currentUser)) && (
                <div className="acn-acoes-linha">
                  <Botao pequeno onClick={() => iniciarEdicao(ev)} title="Editar">✎</Botao>
                  {!ev.raw.concluido && (
                    <Botao pequeno variante="primario" onClick={() => concluir(ev.id)} title="Concluir">✓</Botao>
                  )}
                  <Botao pequeno variante="perigo-sec" onClick={() => excluir(ev.id)} title="Excluir">✕</Botao>
                </div>
              )}
            </div>
          ))}

          {criando ? (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">
                {editandoId ? '✎ Editar Compromisso' : '📅 Novo Compromisso'}
              </div>
              <input className="acn-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título *" />
              <MencaoTextarea value={descricao} onChange={v => setDescricao(v)} placeholder="Descrição (opcional) — @Nome para mencionar alguém" rows={2} />
              <ParticipantesPicker value={participantes} onChange={setParticipantes} donoEmail={currentUser?.email} />
              <div className="acn-cal-linha-form">
                <select className="acn-input" value={setor} onChange={e => setSetor(e.target.value)}>
                  {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input className="acn-input acn-cal-hora-campo" type="time" value={hora} onChange={e => setHora(e.target.value)} />
              </div>
              <div className="acn-acoes-linha">
                <Botao onClick={() => { limparForm(); setCriando(eventos.length === 0); }}>Cancelar</Botao>
                <Botao variante="primario" onClick={salvar} disabled={salvando || !titulo.trim() || !hora}>
                  {salvando ? 'Salvando...' : '✅ Salvar'}
                </Botao>
              </div>
            </div>
          ) : (
            <Botao className="acn-cal-novo" onClick={() => setCriando(true)}>
              + Novo compromisso
            </Botao>
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
  const [tarefasFin, setTarefasFin]       = useState<any[]>([]);
  const [tarefasEng, setTarefasEng]       = useState<any[]>([]);
  const [agendManut, setAgendManut]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [diaAberto, setDiaAberto] = useState<{ data: Date; hora?: string } | null>(null);

  // O que a tela não conseguiu ler (Etapa 7.39, 04/10/2026): mensagem do banco por lista; vazio = leu.
  const [falhas, setFalhas] = useState({ comp: '', crm: '', fin: '', eng: '', agm: '' });

  // Compromissos de todos: só gerentes; os demais veem só os próprios.
  // Regra do usuário em 04/10/2026 (Etapa 7.39): Admin e qualquer perfil "Gerente …". A lista antiga tinha só 'Admin',
  // 'Gerente' (nome que nenhum cadastro tem) e 'Gerente Comercial': os gerentes de Administrativo (2), Produção e Licitações
  // ficavam sem o botão "Todos os usuários" (o setor de Licitações tem 17 dos 21 compromissos do banco).
  const isGerente = ehAdminOuGerente(currentUser);

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
    // meus = os que criei OU em que fui adicionado como participante (07/10/2026)
    if (!isGerente || !verTodos) qComp = qComp.or(filtroDonoOuParticipante('usuario_email', currentUser?.email));
    if (setorFiltro !== 'todos') qComp = qComp.eq('setor', setorFiltro);

    let qCrm = supabase.from('crm_oportunidades')
      .select('id,titulo,nome_contato,prox_contato,hora_prox_contato,responsavel_nome')
      .eq('funil', 'venda_direta')
      .not('prox_contato', 'is', null)
      .gte('prox_contato', isoDate(rangeInicio)).lte('prox_contato', isoDate(rangeFim))
      .order('prox_contato', { ascending: true });
    // meus = os que sou responsável OU em que fui adicionado como participante (07/10/2026); o nome vai entre aspas para vírgula/ponto no nome não quebrar o filtro
    const comoParticipante = 'participantes.cs.' + JSON.stringify([{ email: currentUser?.email }]);
    const meuNomeFiltro = '"' + String(currentUser?.nome || '').replace(/"/g, '') + '"';
    if (!isGerente || !verTodos) qCrm = qCrm.or('responsavel_nome.eq.' + meuNomeFiltro + ',' + comoParticipante);
    // Contatos de CRM só entram na visão "Todos os setores" ou "Comercial"
    const incluirCrm = setorFiltro === 'todos' || setorFiltro === 'comercial';

    // tarefas do Financeiro (vencimento), tarefas da Engenharia (início, ou criação se ainda não começou) e agendamentos de manutenção (data do agendamento) — só na visão "Todos os setores"
    // (Engenharia também no filtro Engenharia); as concluídas não entram
    const todos = setorFiltro === 'todos';
    let qFin = supabase.from('financeiro_tarefas').select('id,titulo,data_vencimento,etapa,responsavel_nome,criado_por,participantes')
      .not('data_vencimento', 'is', null).gte('data_vencimento', isoDate(rangeInicio)).lte('data_vencimento', isoDate(rangeFim)).neq('etapa', 'Concluído');
    if (!isGerente || !verTodos) qFin = qFin.or('responsavel_nome.eq.' + meuNomeFiltro + ',' + comoParticipante);
    let qEng = supabase.from('engenharia_horas_tarefas').select('id,titulo,status,responsavel_nome,criado_por,criado_em,data_inicio,numero_opl,participantes')
      .neq('status', 'concluida').gte('criado_em', new Date(rangeInicio.getFullYear(), rangeInicio.getMonth() - 2, 1).toISOString());
    if (!isGerente || !verTodos) qEng = qEng.or('responsavel_nome.eq.' + meuNomeFiltro + ',' + comoParticipante);
    let qAgm = supabase.from('agendamentos_manutencao').select('id,numero_opl,cliente_nome,modelo,data_agendamento,periodo,agendado_por,participantes')
      .gte('data_agendamento', isoDate(rangeInicio)).lte('data_agendamento', isoDate(rangeFim));
    if (!isGerente || !verTodos) qAgm = qAgm.or('agendado_por.eq.' + meuNomeFiltro + ',' + comoParticipante);
    const vazio = { data: [], error: null };
    const [rComp, rCrm, rFin, rEng, rAgm] = await Promise.all([
      qComp.limit(500), incluirCrm ? qCrm.limit(500) : Promise.resolve({ data: [] }),
      todos ? qFin.limit(500) : Promise.resolve(vazio), (todos || setorFiltro === 'engenharia') ? qEng.limit(500) : Promise.resolve(vazio), todos ? qAgm.limit(500) : Promise.resolve(vazio),
    ]);
    // Leitura que falha não pode virar "calendário vazio" (Etapa 7.39): antes o erro era ignorado e o mês aparecia sem nenhum
    // evento, sem aviso. Os eventos dependem do período mostrado, então os da leitura que falhou saem da grade (não ficam os
    // de outro mês) e uma faixa vermelha diz o que não foi lido.
    setCompromissos(rComp.error ? [] : (rComp.data || []));
    setContatosCrm(rCrm.error ? [] : (rCrm.data || []));
    setTarefasFin(rFin.error ? [] : (rFin.data || []));
    // tarefa da Engenharia cai no dia do início (ou da criação, se ainda não começou); só entra o que cai no período mostrado
    const diaTarefaEng = (x: any) => isoDate(new Date(x.data_inicio || x.criado_em));
    setTarefasEng(rEng.error ? [] : (rEng.data || []).filter((x: any) => diaTarefaEng(x) >= isoDate(rangeInicio) && diaTarefaEng(x) <= isoDate(rangeFim)));
    setAgendManut(rAgm.error ? [] : (rAgm.data || []));
    setFalhas({ comp: rComp.error?.message || '', crm: rCrm.error?.message || '', fin: rFin.error?.message || '', eng: rEng.error?.message || '', agm: rAgm.error?.message || '' });
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
        familia: SETOR_FAMILIA[c.setor] || SETOR_FAMILIA.geral, raw: c,
      });
    });
    contatosCrm.forEach(o => {
      const key = o.prox_contato;
      (map[key] ||= []).push({
        tipo: 'crm', id: o.id, titulo: o.titulo,
        hora: o.hora_prox_contato ? String(o.hora_prox_contato).slice(0, 5) : null,
        horaOrdem: o.hora_prox_contato ? (parseInt(o.hora_prox_contato.slice(0,2)) * 60 + parseInt(o.hora_prox_contato.slice(3,5))) : -1,
        familia: FAMILIA_CRM, raw: o,
      });
    });
    tarefasFin.forEach(x => {
      (map[x.data_vencimento] ||= []).push({
        tipo: 'tarefa_financeiro', id: x.id, titulo: x.titulo, hora: null, horaOrdem: -1, familia: FAMILIA_FIN, raw: x,
        detalhe: <>💲 Tarefa do Financeiro · vence neste dia · 👤 {x.responsavel_nome || '—'}{participantesDe(x).length > 0 && <> · <ListaParticipantes item={x} usuario={currentUser} /></>}</>,
      });
    });
    tarefasEng.forEach(x => {
      const d = new Date(x.data_inicio || x.criado_em);
      (map[isoDate(d)] ||= []).push({
        tipo: 'tarefa_engenharia', id: x.id, titulo: x.titulo, hora: x.data_inicio ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : null,
        horaOrdem: x.data_inicio ? d.getHours() * 60 + d.getMinutes() : -1, familia: FAMILIA_ENG_TAREFA, raw: x,
        detalhe: <>🛠️ Tarefa da Engenharia · {x.data_inicio ? 'iniciada neste dia' : 'criada neste dia'}{x.numero_opl ? ` · OP ${x.numero_opl}` : ''} · 👤 {x.responsavel_nome || '—'}{participantesDe(x).length > 0 && <> · <ListaParticipantes item={x} usuario={currentUser} /></>}</>,
      });
    });
    agendManut.forEach(x => {
      (map[String(x.data_agendamento).slice(0, 10)] ||= []).push({
        tipo: 'agendamento', id: x.id, titulo: 'Manutenção — OP ' + (x.numero_opl || '—') + (x.cliente_nome ? ' · ' + x.cliente_nome : ''), hora: null, horaOrdem: -1, familia: FAMILIA_AGEND, raw: x,
        detalhe: <>🔧 Agendamento de manutenção · {x.periodo || ''}{x.modelo ? ' · ' + x.modelo : ''} · 👤 {x.agendado_por || '—'}{participantesDe(x).length > 0 && <> · <ListaParticipantes item={x} usuario={currentUser} /></>}</>,
      });
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.horaOrdem - b.horaOrdem));
    return map;
  }, [compromissos, contatosCrm, tarefasFin, tarefasEng, agendManut, currentUser?.email]);

  const totalEventos = compromissos.length + contatosCrm.length + tarefasFin.length + tarefasEng.length + agendManut.length;

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

  return (
    <div className="sec-card">
      <div className="sec-hdr no-collapse">
        <span className="acn-cab-titulo"><Icone path={mdiCalendarMonthOutline} size={16} /> Calendário {loading ? '· carregando…' : totalEventos > 0 ? `· ${totalEventos} evento${totalEventos !== 1 ? 's' : ''}` : ''}</span>
        <div className="acn-cab-filtros">
          {isGerente && (
            <Botao pequeno variante={verTodos ? 'primario' : 'secundario'} icone={verTodos ? mdiAccountGroupOutline : mdiAccountOutline}
              onClick={() => setVerTodos(v => !v)}>
              {verTodos ? 'Todos os usuários' : 'Meus compromissos'}
            </Botao>
          )}
          <Chips rotulo="Visão" ativo={modo} onChange={setModo as any}
            itens={[{ id: 'mes', rotulo: 'Mês' }, { id: 'semana', rotulo: 'Semana' }]} />
        </div>
      </div>

      <div className="sec-body">
        {(falhas.comp || falhas.crm || falhas.fin || falhas.eng || falhas.agm) && (
          <Faixa tom="erro">
            Não foi possível ler {[falhas.comp && `os compromissos (${falhas.comp})`, falhas.crm && `os contatos do CRM (${falhas.crm})`, falhas.fin && `as tarefas do Financeiro (${falhas.fin})`, falhas.eng && `as tarefas da Engenharia (${falhas.eng})`, falhas.agm && `os agendamentos de manutenção (${falhas.agm})`].filter(Boolean).join('; ')}. O calendário abaixo pode estar incompleto.
          </Faixa>
        )}
        {/* Filtro de setor */}
        {/* Mesmo desenho do `Chips` do sistema, com um ponto na cor de cada setor (a legenda das cores dos eventos). */}
        <div className="acn-chips acn-cal-setores" role="group" aria-label="Setor">
          <button type="button" className={setorFiltro === 'todos' ? 'on' : ''} aria-pressed={setorFiltro === 'todos'} onClick={() => setSetorFiltro('todos')}>Todos</button>
          {SETORES.map(s => (
            <button key={s.id} type="button" className={setorFiltro === s.id ? 'on' : ''} aria-pressed={setorFiltro === s.id} onClick={() => setSetorFiltro(s.id)}>
              <i className="acn-cal-ponto" data-acn-familia={s.familia} />{s.label}
            </button>
          ))}
        </div>

        {/* Navegação */}
        <div className="acn-cal-nav">
          <div className="acn-cal-nav-esq">
            <Botao pequeno onClick={irAnterior}>‹</Botao>
            <Botao pequeno onClick={irHoje}>Hoje</Botao>
            <Botao pequeno onClick={irProximo}>›</Botao>
            <span className="acn-cal-titulo">{tituloTopo}</span>
          </div>
          <Botao variante="primario" onClick={() => setDiaAberto({ data: new Date() })}>
            + Novo Compromisso
          </Botao>
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
          leituraFalhou={!!(falhas.comp || falhas.crm)}
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
      <div className="acn-cal-mes acn-cal-mes-cab">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="acn-cal-cab">{d}</div>
        ))}
      </div>
      <div className="acn-cal-mes">
        {dias.map((d: Date, i: number) => {
          const key = isoDate(d);
          const eventos = eventosPorDia[key] || [];
          const foraDoMes = d.getMonth() !== cursor.getMonth();
          const isHoje = key === hoje;
          return (
            <div key={i} onClick={() => onDiaClick(d)}
              className={'acn-cal-dia' + (isHoje ? ' hoje' : '') + (foraDoMes ? ' fora' : '')}>
              <div className="acn-cal-num">{d.getDate()}</div>
              {eventos.slice(0, 3).map((ev: any) => (
                <div key={ev.tipo + ev.id} className={'acn-cal-ev' + (ev.raw?.concluido ? ' feito' : '')} data-acn-familia={ev.familia}>
                  {ev.hora ? `${ev.hora} ` : ''}{ev.titulo}
                </div>
              ))}
              {eventos.length > 3 && (
                <div className="acn-cal-mais">+{eventos.length - 3} mais</div>
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

  // A altura de cada hora (ROW_H) tem de ser a mesma de .acn-cal-hora e .acn-cal-slot no design.css: é com ela que a posição do
  // evento na coluna é calculada (o único estilo escrito aqui é essa posição, que depende da hora do evento).
  return (
    <div className="acn-cal-sem">
      {/* Cabeçalho dos dias */}
      <div className="acn-cal-sem-linha acn-cal-sem-cab">
        <div />
        {dias.map((d: Date, i: number) => {
          const isHoje = isoDate(d) === hoje;
          return (
            <div key={i} className={'acn-cal-sem-dia' + (isHoje ? ' hoje' : '')}>
              <div className="acn-cal-sem-nome">{DIAS_SEMANA[d.getDay()]}</div>
              <div className="acn-cal-sem-num">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Linha "dia inteiro" — eventos sem horário (contatos CRM sem hora) */}
      <div className="acn-cal-sem-linha acn-cal-sem-diainteiro">
        <div className="acn-cal-sem-rotulo">dia</div>
        {dias.map((d: Date, i: number) => {
          const eventos = (eventosPorDia[isoDate(d)] || []).filter((e: any) => !e.hora);
          return (
            <div key={i} onClick={() => onSlotClick(d, '09:00')} className="acn-cal-sem-celula">
              {eventos.map((ev: any) => (
                <div key={ev.tipo + ev.id} className="acn-cal-ev" data-acn-familia={ev.familia}>{ev.titulo}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Grade horária */}
      <div className="acn-cal-sem-linha acn-cal-sem-grade">
        <div>
          {HORAS_GRID.map(h => (
            <div key={h} className="acn-cal-hora">
              {pad2(h)}h
            </div>
          ))}
        </div>
        {dias.map((d: Date, i: number) => {
          const eventos = (eventosPorDia[isoDate(d)] || []).filter((e: any) => e.hora);
          return (
            <div key={i} className="acn-cal-col">
              {HORAS_GRID.map(h => (
                <div key={h} onClick={() => onSlotClick(d, `${pad2(h)}:00`)} className="acn-cal-slot" />
              ))}
              {eventos.map((ev: any) => {
                const top = (ev.horaOrdem / 60 - HORAS_GRID[0]) * ROW_H;
                if (top < 0 || top > HORAS_GRID.length * ROW_H) return null;
                return (
                  <div key={ev.tipo + ev.id} onClick={(e) => { e.stopPropagation(); onSlotClick(d, ev.hora); }}
                    className={'acn-cal-evsem' + (ev.raw?.concluido ? ' feito' : '')} data-acn-familia={ev.familia} style={{ top }}>
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
