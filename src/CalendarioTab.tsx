// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Faixa, Botao, Chips, Selo } from './Interface';
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
// 07/10/2026: o calendário também mostra as tarefas (Financeiro, Engenharia) e os agendamentos de manutenção em que a pessoa é dona ou participante — leitura só (editam nas suas telas).
// 12/11/2026 (pedido do usuário, PLANOS CONCLUIDOS/PLANO_CALENDARIO.md): TODA data do sistema chega aqui pela função do banco `calendario_eventos` (prazos de demanda, retorno de cliente,
// limites de licitação, chegada de carro, entrega de compra e de OP...), a mesma que a rotina de alertas lê, para a tela e o aviso não discordarem.
// Cor por fonte (as já existentes mantêm a cor que tinham) e o setor do filtro em que cada fonte aparece; a data que vence hoje ou já passou fica vermelha.
const FAMILIA_POR_FONTE: Record<string, string> = {
  crm_retorno: 'atencao', telecom_retorno: 'atencao', crm_limite: 'atencao', tarefa_financeiro: 'neutro', tarefa_engenharia: 'ok', agendamento: 'atencao',
  licitacao: 'marca', demanda_avulsa: 'info', demanda_etapa: 'info', frete_previsto: 'neutro', viagem_saida: 'neutro', frota_reserva: 'neutro', sac_prazo: 'info', sac_chegada_veiculo: 'atencao', op_chegada_veiculo: 'atencao', op_entrega: 'neutro', vistoria_retorno: 'atencao', compra_entrega: 'atencao',
};
const SETOR_POR_FONTE: Record<string, string> = {
  crm_retorno: 'comercial', telecom_retorno: 'comercial', crm_limite: 'comercial', op_entrega: 'comercial', licitacao: 'licitacoes', tarefa_engenharia: 'engenharia', sac_prazo: 'sac', sac_chegada_veiculo: 'sac',
};   // as demais (demanda, compra, chegada de carro, vistoria, financeiro, manutenção) entram em "Geral"
// aba do sistema para onde o botão "Abrir" leva (a mesma troca de aba das Menções; só troca se a pessoa tem a aba)
const ABA_POR_FONTE: Record<string, string> = {
  crm_retorno: 'crm', telecom_retorno: 'telecom', crm_limite: 'crm', op_entrega: 'crm', licitacao: 'licitacoes', demanda_avulsa: 'ajustes', demanda_etapa: 'ajustes', frete_previsto: 'logistica', viagem_saida: 'viagens', frota_reserva: 'viagens', sac_prazo: 'sac', sac_chegada_veiculo: 'sac',
  op_chegada_veiculo: 'almoxarifado', vistoria_retorno: 'vistorias', compra_entrega: 'compras', tarefa_financeiro: 'financeiro', tarefa_engenharia: 'engenharia', agendamento: 'producao',
};
const ROTULO_FONTE: Record<string, string> = {
  crm_retorno: 'Contato com cliente', telecom_retorno: 'Contato com cliente (Telecom)', crm_limite: 'Prazo do CRM', licitacao: 'Licitação', demanda_avulsa: 'Prazo de demanda', demanda_etapa: 'Prazo de etapa de demanda', frete_previsto: 'Entrega prevista do frete', viagem_saida: 'Saída de viagem', frota_reserva: 'Veículo reservado', sac_prazo: 'Prazo da OS', sac_chegada_veiculo: 'Chegada do veículo (OS)',
  op_chegada_veiculo: 'Chegada do veículo', op_entrega: 'Entrega ao cliente', vistoria_retorno: 'Retorno da vistoria', compra_entrega: 'Recebimento de material',
  tarefa_financeiro: 'Tarefa do Financeiro', tarefa_engenharia: 'Tarefa da Engenharia', agendamento: 'Manutenção agendada', compromisso: 'Compromisso',
};

// Vence hoje / atrasado (só para o que é prazo e ainda não foi resolvido): o mesmo critério da rotina de alertas
const diasEntre = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000);
function situacaoDoPrazo(dia: string, hoje: string, alerta: boolean, concluido: boolean): { tipo: 'hoje' | 'atrasado'; dias: number; rotulo: string } | null {
  if (!alerta || concluido) return null;
  if (dia === hoje) return { tipo: 'hoje', dias: 0, rotulo: 'Vence hoje' };
  if (dia < hoje) { const n = diasEntre(dia, hoje); return { tipo: 'atrasado', dias: n, rotulo: 'Atrasado há ' + n + (n === 1 ? ' dia' : ' dias') }; }
  return null;
}

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

// 10/11/2026 (pedido do usuário): o calendário diz quem criou cada compromisso — quem recebe um compromisso criado por outra pessoa não tinha como saber de quem veio.
const nomeDoCriador = (c: any, usuario: any) =>
  (c.usuario_email && usuario?.email && c.usuario_email === usuario.email) ? 'você' : (c.usuario_nome || c.usuario_email || '—');
const dicaDoEvento = (ev: any, usuario: any) => ev.tipo === 'compromisso' ? ev.titulo + ' — criado por ' + nomeDoCriador(ev.raw, usuario) : ev.titulo;

const fmtDiaLongo = (d: Date) => d.toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
});

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: DETALHE DO DIA + NOVO COMPROMISSO
// ─────────────────────────────────────────────────────────────────────────────
function ModalDia({ data, horaInicial, eventos, leituraFalhou, currentUser, onClose, onChanged }: any) {
  // na lateral, dia vazio mostra "Nenhum evento" e o botão de novo compromisso; o formulário só abre direto quando se clica numa hora da semana (08/10/2026)
  const [criando, setCriando] = useState(!!horaInicial && eventos.length === 0);
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
    // 08/10/2026 (pedido do usuário): clicar no dia mostra a lista dos compromissos NA LATERAL da tela, sem janela no meio e sem tampar o calendário — dá para clicar em outro dia com a lista aberta.
    <div className="acn-cal-lateral" role="complementary" aria-label={'Compromissos de ' + fmtDiaLongo(data)}>
      <div className="acn-cal-lateral-caixa">
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
                    ? <>🏷️ {SETORES.find(s => s.id === ev.raw.setor)?.label || ev.raw.setor} · 👤 <strong>Criado por {nomeDoCriador(ev.raw, currentUser)}</strong>{participantesDe(ev.raw).length > 0 && <> · <ListaParticipantes item={ev.raw} usuario={currentUser} /></>}</>
                    : <>🗓️ {ROTULO_FONTE[ev.tipo] || ev.tipo}{ev.detalhe ? ' · ' + ev.detalhe : ''}{ev.responsavel ? ' · 👤 ' + ev.responsavel : ''}</>}
                </div>
                {ev.situacao && <div><Selo familia="erro" title={ev.situacao.rotulo}>{ev.situacao.rotulo}</Selo></div>}
              </div>
              {ev.tipo !== 'compromisso' && ABA_POR_FONTE[ev.tipo] && (
                <div className="acn-acoes-linha">
                  <Botao pequeno onClick={() => window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: ABA_POR_FONTE[ev.tipo] } }))} title="Abrir a tela de origem desta data">Abrir</Botao>
                </div>
              )}
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
                <Botao onClick={() => { limparForm(); setCriando(false); }}>Cancelar</Botao>
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
  const [linhas, setLinhas] = useState<any[]>([]);   // as datas do período, vindas da função do banco `calendario_eventos` (12/11/2026)
  const [loading, setLoading]     = useState(true);
  const [diaAberto, setDiaAberto] = useState<{ data: Date; hora?: string } | null>(null);

  // O que a tela não conseguiu ler (Etapa 7.39, 04/10/2026): mensagem do banco; vazio = leu.
  const [falha, setFalha] = useState('');

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
    // 12/11/2026: uma leitura só. A função do banco devolve as datas de TODAS as fontes (compromissos, retorno de cliente, limites de licitação, prazos de demanda e de OS,
    // chegada de carro, entrega de compra e de OP, tarefas, manutenção) já limitadas ao que esta pessoa pode ver (responsável, participante ou do perfil que age);
    // Admin e gerentes veem tudo quando ligam "Todos os usuários". Leitura que falha nunca vira "calendário vazio": a faixa vermelha diz o motivo.
    const { data, error } = await supabase.rpc('calendario_eventos', { p_inicio: isoDate(rangeInicio), p_fim: isoDate(rangeFim), p_todos: !!(isGerente && verTodos) });
    setLinhas(error ? [] : (data || []));
    setFalha(error ? (error.message || 'erro desconhecido') : '');
    setLoading(false);
  }, [rangeInicio.getTime(), rangeFim.getTime(), verTodos, isGerente, currentUser?.email]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Monta mapa dia → eventos unificados ──────────────────────────────────
  const eventosPorDia = useMemo(() => {
    const map: Record<string, any[]> = {};
    const hoje = hojeStr();
    linhas.forEach((r: any) => {
      const tipo = r.fonte;
      const setorDoEvento = tipo === 'compromisso' ? (r.extra?.setor || 'geral') : (SETOR_POR_FONTE[tipo] || 'geral');
      if (setorFiltro !== 'todos' && setorDoEvento !== setorFiltro) return;
      const hora = r.hora ? String(r.hora).slice(0, 5) : null;
      const sit = situacaoDoPrazo(r.dia, hoje, !!r.alerta, !!r.concluido);
      const raw = tipo === 'compromisso' ? { ...(r.extra || {}), concluido: !!r.concluido } : r;
      const ev: any = {
        tipo, id: r.ref_id, titulo: r.titulo, hora,
        horaOrdem: hora ? parseInt(hora.slice(0, 2)) * 60 + parseInt(hora.slice(3, 5)) : -1,
        familia: sit ? 'erro' : (tipo === 'compromisso' ? (SETOR_FAMILIA[raw.setor] || SETOR_FAMILIA.geral) : (FAMILIA_POR_FONTE[tipo] || 'neutro')),
        raw, detalhe: r.detalhe, responsavel: r.responsavel, situacao: sit,
      };
      if (tipo === 'compromisso') {
        // na grade, o compromisso de OUTRA pessoa leva o primeiro nome de quem criou (o seu próprio não precisa); o texto inteiro vai na dica
        ev.criador = nomeDoCriador(raw, currentUser) === 'você' ? '' : String(nomeDoCriador(raw, currentUser)).split(' ')[0];
        ev.dica = dicaDoEvento({ tipo: 'compromisso', titulo: raw.titulo, raw }, currentUser);
      } else {
        ev.dica = r.titulo + (sit ? ' — ' + sit.rotulo : '') + (r.detalhe ? ' — ' + r.detalhe : '');
      }
      (map[r.dia] ||= []).push(ev);
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.horaOrdem - b.horaOrdem));
    return map;
  }, [linhas, setorFiltro, currentUser?.email]);

  const totalEventos = Object.values(eventosPorDia).reduce((n: number, l: any) => n + l.length, 0);

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
    <div className={'sec-card' + (diaAberto ? ' acn-cal-com-lateral' : '')}>
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
        {falha && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
            Não foi possível ler as datas do calendário ({falha}). O calendário abaixo está incompleto.
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
          key={isoDate(diaAberto.data) + '|' + (diaAberto.hora || '')}
          data={diaAberto.data}
          horaInicial={diaAberto.hora}
          eventos={eventosPorDia[isoDate(diaAberto.data)] || []}
          leituraFalhou={!!falha}
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
                <div key={ev.tipo + ev.id} className={'acn-cal-ev' + (ev.raw?.concluido ? ' feito' : '')} data-acn-familia={ev.familia} title={ev.dica || ev.titulo}>
                  {ev.hora ? `${ev.hora} ` : ''}{ev.titulo}{ev.criador ? ` · ${ev.criador}` : ''}
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
                <div key={ev.tipo + ev.id} className="acn-cal-ev" data-acn-familia={ev.familia} title={ev.dica || ev.titulo}>{ev.titulo}{ev.criador ? ` · ${ev.criador}` : ''}</div>
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
                    className={'acn-cal-evsem' + (ev.raw?.concluido ? ' feito' : '')} data-acn-familia={ev.familia} style={{ top }} title={ev.dica || ev.titulo}>
                    {ev.hora} {ev.titulo}{ev.criador ? ` · ${ev.criador}` : ''}
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
