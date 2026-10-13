// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import { Faixa, Botao } from './Interface';
import { ParticipantesPicker, ListaParticipantes, participantesDe, ehDonoDoItem, filtroDonoOuParticipante, novosParticipantes, notificarParticipantes } from './Participantes';

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

// Etapa 7.x (12/10/2026): o mínimo do campo de data e hora usava `toISOString()` (hora de Londres, 3 horas à frente de Brasília): às 10h só dava para escolher a partir das 13h.
// Agora é o horário local de quem está usando, no formato do campo (AAAA-MM-DDTHH:mm).
const agoraParaCampo = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
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

// 12e61 (12/10/2026): só o rótulo de cada nível fica aqui; as cores (fundo, borda, faixa da lateral e cor do rótulo) passaram para o design.css, por `data-nivel` no cartão.
const ROTULO_NIVEL = {
  urgente:  '🔴 EM 15 MIN',
  '24h':    '🟡 EM 24H',
  normal:   '',
  expirado: '✓ Expirado',
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
  const [participantes, setParticipantes] = useState<any[]>([]);   // pedido do usuário em 07/10/2026: quem mais participa
  const [salvando, setSalvando] = useState(false);
  const emAndamento = useRef(false);   // Etapa 7.x (12/10/2026): um clique duplo em Salvar gravava o compromisso e os avisos duas vezes

  const salvar = async () => {
    if (!titulo.trim() || !dataHora || emAndamento.current) return;
    emAndamento.current = true;
    setSalvando(true);
    // 07/10/2026: o resultado da gravação não era conferido — com ela recusada, o formulário fechava como se tivesse salvo. Agora avisa e mantém o que foi digitado.
    const { data: novo, error } = await supabase.from('agenda_compromissos').insert([{
      setor,
      usuario_email: currentUser?.email,
      usuario_nome:  currentUser?.nome || currentUser?.email,
      titulo:        titulo.trim(),
      descricao:     descricao.trim() || null,
      data_hora:     new Date(dataHora).toISOString(),
      participantes,
    }]).select('id').single();
    if (error) { alert('Não foi possível salvar o compromisso: ' + error.message); setSalvando(false); emAndamento.current = false; return; }
    // @menção na descrição e aviso aos participantes: o compromisso já existe; se um aviso falhar, o compromisso fica salvo e o aviso diz quem não foi avisado
    await salvarMencoes({ texto: (titulo + ' ' + descricao), mencionanteId: String(currentUser?.id || ''), mencionanteNome: currentUser?.nome || currentUser?.email || 'Usuário',
      contexto: 'agenda', contextoId: String(novo?.id || ''), contextoDescricao: 'Agenda: ' + titulo.trim(), campo: 'descricao', abaDestino: 'calendario' });
    const falhas = await notificarParticipantes({ novos: novosParticipantes([], participantes), autor: currentUser, contexto: 'agenda', contextoId: String(novo?.id || ''),
      descricao: 'Agenda: ' + titulo.trim(), abaDestino: 'calendario', trecho: 'Você foi adicionado ao compromisso "' + titulo.trim() + '" em ' + new Date(dataHora).toLocaleString('pt-BR') });
    if (falhas.length) alert('O compromisso foi salvo, mas não foi possível avisar: ' + falhas.join('; '));
    setSalvando(false);
    emAndamento.current = false;
    onSalvo();
  };

  // 12e61 (12/10/2026): só aparência — o formulário foi para o design.css (`acn-agw-*`) e os dois botões viraram o botão do guia. Medido antes de mexer: o sistema já repintava
  // a letra (9 e 10 px do código saíam com 12 e 13 px) e os botões (o azul virava a cor-marca, o cinza virava o tom neutro), então o CSS dá o valor que a pessoa já via.
  return (
    <div className="acn-agw-form">
      <div className="acn-agw-form-tit">
        📅 Novo Compromisso
      </div>
      <input
        value={titulo} onChange={e => setTitulo(e.target.value)}
        placeholder="Título *"
        className="acn-agw-campo"
      />
      <MencaoTextarea
        value={descricao} onChange={v => setDescricao(v)}
        placeholder="Descrição (opcional) — @Nome para mencionar alguém"
        rows={2}
      />
      <input
        type="datetime-local" value={dataHora}
        onChange={e => setDataHora(e.target.value)}
        min={agoraParaCampo()}
        className="acn-agw-campo data"
      />
      <div className="acn-agw-form-part">
        <ParticipantesPicker value={participantes} onChange={setParticipantes} donoEmail={currentUser?.email} />
      </div>
      <div className="acn-agw-form-bt">
        <Botao variante="secundario" className="acn-agw-bt-form" onClick={onCancel}>
          Cancelar
        </Botao>
        <Botao variante="primario" className="acn-agw-bt-form salvar" onClick={salvar} disabled={salvando || !titulo.trim() || !dataHora}>
          {salvando ? 'Salvando...' : '✅ Salvar'}
        </Botao>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DE COMPROMISSO
// ─────────────────────────────────────────────────────────────────────────────
function CompromissoCard({ item, onConcluir, onExcluir, podeEditar, usuario }) {
  const minutos = minutosRestantes(item.data_hora);
  const nivel = alertLevel(minutos);
  const label = ROTULO_NIVEL[nivel];

  return (
    <div className="acn-agw-card" data-nivel={nivel}>
      <div className="acn-agw-card-linha">
        <div className="acn-agw-card-corpo">
          <div className="acn-agw-card-topo">
            {label && (
              <span className="acn-agw-nivel">
                {label}
              </span>
            )}
            <span className={'acn-agw-card-titulo' + (item.concluido ? ' concluido' : '')}>
              {item.titulo}
            </span>
          </div>
          {item.descricao && (
            <div className="acn-agw-card-desc">{item.descricao}</div>
          )}
          <div className="acn-agw-card-meta">
            📅 {fmtDH(item.data_hora)}
            {item.usuario_nome && (
              <span className="acn-agw-meta-item">👤 {item.usuario_nome}</span>
            )}
            {participantesDe(item).length > 0 && (
              <span className="acn-agw-meta-item"><ListaParticipantes item={item} usuario={usuario} /></span>
            )}
          </div>
        </div>
        {podeEditar && (
          <div className="acn-agw-acoes">
            {!item.concluido && (
              <Botao variante="secundario" className="acn-agw-bt-ok" onClick={() => onConcluir(item.id)}
                title="Marcar como concluído">
                ✓
              </Botao>
            )}
            <Botao variante="perigo-sec" className="acn-agw-bt-x" onClick={() => onExcluir(item.id)}
              title="Excluir">
              ✕
            </Botao>
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
  const [erroLeitura, setErroLeitura]   = useState('');   // Etapa 7.x (12/10/2026): leitura que falha não pode parecer agenda vazia
  const [adicionando, setAdicionando]   = useState(false);
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [modoView, setModoView]         = useState<'meus'|'equipe'|'todos'>('meus');
  // Filtro de período — abre por padrão nos compromissos da semana corrente.
  const [periodo, setPeriodo]           = useState<'hoje'|'semana'|'mes'|'todos'>('semana');
  const [equipeEmails, setEquipeEmails] = useState<string[]|null>(null); // null = ainda não carregou
  // Perfil "gerente" cobre Admin e qualquer variação de Gerente (Gerente,
  // Gerente Comercial, Gerente de Licitações, etc) — antes só comparava
  // com a string exata 'gerente' minúscula, que nunca batia de verdade.
  // Agenda da equipe/todos: só gerentes; os demais veem só a própria
  const isGerente = /gerente|admin/i.test(currentUser?.perfil || '');
  // Agenda pública (todos do setor veem os compromissos de todos) foi desligada
  // em 17/09/2026, inclusive em Licitações: quem não é gerente vê só a própria.
  // Para reabrir num setor, volte a comparar o setor aqui.
  const agendaPublica = false;
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
      // meus = os que criei OU em que fui adicionado como participante (07/10/2026)
      q = q.or(filtroDonoOuParticipante('usuario_email', currentUser?.email));
    }
    if (!mostrarConcluidos) {
      q = q.eq('concluido', false);
    }
    const intervalo = intervaloPeriodo(periodo);
    if (intervalo) {
      q = q.gte('data_hora', intervalo[0]).lte('data_hora', intervalo[1]);
    }

    const { data, error } = await q.limit(50);
    if (error) { setErroLeitura(error.message || 'erro desconhecido'); setLoading(false); return; }   // mantém o que já estava na tela; a próxima leitura (30 s) ou o botão tenta de novo
    setErroLeitura('');
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
    if (!await confirmar('Marcar este compromisso como concluído?')) return;
    const { error } = await supabase.from('agenda_compromissos').update({
      concluido: true, concluido_em: new Date().toISOString(),
    }).eq('id', id);
    if (error) { alert('Não foi possível concluir o compromisso: ' + error.message); return; }   // Etapa 7.x (12/10/2026): antes a tela recarregava sem avisar
    carregar();
  };

  const excluir = async (id: string) => {
    if (!await confirmar('Excluir este compromisso?')) return;
    const { error } = await supabase.from('agenda_compromissos').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir o compromisso: ' + error.message); return; }   // Etapa 7.x (12/10/2026): antes a tela recarregava sem avisar
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
    // 12e61 (12/10/2026): só aparência — nenhum style inline: tudo no design.css (`acn-agw-*`), com os valores que o sistema já mostrava.
    <div className="sec-card acn-agw">
      {/* Header — textTransform/letterSpacing zerados (no CSS) pra não herdar o
          uppercase padrão de .sec-hdr (pensado pra títulos curtos, não
          pros botões/labels normais que este header também tem) */}
      <div className="sec-hdr acn-agw-cab">
        <div className="acn-agw-cab-linha">
          <div className="acn-agw-cab-esq">
            <span className="acn-agw-tit">📅 Agenda</span>
            {alertas.length > 0 && (
              <span className="acn-agw-cont alerta">
                {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
              </span>
            )}
            {compromissos.length > 0 && alertas.length === 0 && (
              <span className="acn-agw-cont info">
                {compromissos.length} compromisso{compromissos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="acn-agw-cab-dir" onClick={e => e.stopPropagation()}>
            <div className="acn-agw-grupo">
              {([
                ['hoje','Hoje'], ['semana','Semana'], ['mes','Mês'], ['todos','Todos'],
              ] as [typeof periodo, string][]).map(([v, label]) => (
                <Botao key={v} variante="discreto" className={'acn-agw-pilula' + (periodo===v ? ' ativa' : '')} onClick={() => setPeriodo(v)}>
                  {label}
                </Botao>
              ))}
            </div>
            {!agendaPublica && isGerente && (
              <div className="acn-agw-grupo">
                {([
                  ['meus',  '👤 Meus'],
                  ...(equipeEmails && equipeEmails.length > 0 ? [['equipe', '👔 Equipe']] : []),
                  ['todos', '👥 Todos'],
                ] as [typeof modoView, string][]).map(([v, label]) => (
                  <Botao key={v} variante="discreto" className={'acn-agw-pilula' + (modoView===v ? ' ativa' : '')} onClick={() => setModoView(v)}>
                    {label}
                  </Botao>
                ))}
              </div>
            )}
            <Botao variante="secundario" className="acn-agw-concl" onClick={() => setMostrarConcluidos(v => !v)}>
              {mostrarConcluidos ? 'Ocultar concluídos' : 'Ver concluídos'}
            </Botao>
            <Botao variante="primario" className="acn-agw-novo" onClick={() => setAdicionando(v => !v)}>
              + Novo
            </Botao>
          </div>
        </div>
      </div>

      <div className="sec-body">
        {agendaPublica && (
          <div className="acn-agw-publica">
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

        {erroLeitura && !loading && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível carregar a agenda ({erroLeitura}).</Faixa>
        )}

        {/* Lista */}
        {loading ? (
          <div className="acn-agw-aviso">
            Carregando agenda...
          </div>
        ) : compromissos.length === 0 ? (erroLeitura ? null : (
          <div className="acn-agw-aviso vazio">
            Nenhum compromisso agendado {periodo !== 'todos' ? 'neste período' : ''}
          </div>
        )) : (
          // maxHeight + scroll próprio (no CSS) -- sem isso, no modo "Todos" (até 50
          // compromissos de todo mundo) a lista crescia sem limite e "engolia"
          // a página: como o container pai é flex:1/overflowY:auto (ver
          // LicitacoesTab.tsx e outras telas que usam este widget), um filho
          // sem min-height/max-height não encolhe (é o comportamento padrão
          // de flex-item), então o resto da página ficava espremido/sem
          // conseguir rolar até o fim. Com isso, o próprio card da Agenda
          // rola internamente e o layout ao redor fica estável.
          <div className="acn-agw-lista">
            {compromissos.map(c => (
              <CompromissoCard key={c.id} item={c} onConcluir={concluir} onExcluir={excluir} usuario={currentUser}
                podeEditar={ehDonoDoItem(c, currentUser) || isGerente} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
