// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// HorasTarefasTab — sub-aba "Horas/Tarefas" da Engenharia
// Controle de tarefas com início/fim; toda pausa exige motivo. Relatório de
// horas e tarefas por período.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';
import { confirmar } from './Feedback';
import { Faixa } from './Interface';
import {
  ehGestorEngenharia, mesmaPessoa, normNome, nomesDoUsuario, carregarContextoHorario, extrasAprovadas, horasExtrasDaPessoa,
  textoPeriodo, CONTEXTO_VAZIO, PainelHorasExtras, ModalHoraExtra, type ContextoHorario,
} from './HorasExtras';
import {
  trechosDaTarefa, aplicarHorario, separarNormalExtra, segundosPorDia, unirIntervalos, intersecao, janelasPermitidas,
  janelaNoInstante, segundosContados, pausaAutomaticaPendente, somaMs, MOTIVO_PAUSA_AUTOMATICA, HORARIO_CONTAGEM_TEXTO,
} from './HorarioContagem';

const STATUS_COR: Record<string, string> = {
  nao_iniciada: '#94a3b8', em_andamento: '#3b82f6', pausada: '#f59e0b', concluida: '#22c55e',
};
const STATUS_LABEL: Record<string, string> = {
  nao_iniciada: 'Não Iniciada', em_andamento: 'Em Andamento', pausada: 'Pausada', concluida: 'Concluída',
};

function fmtDtHr(d: string) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function fmtDt(d: string) { return d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'; }

function fmtDuracao(segundos: number) {
  const s = Math.max(0, Math.floor(segundos || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Iniciar e retomar gravam atualizado_em: a pausa automática só é gravada se a
// tarefa não mudou desde que foi lida.
async function iniciarTarefa(tarefa: any) {
  const agora = new Date().toISOString();
  await supabase.from('engenharia_horas_tarefas').update({
    status: 'em_andamento', data_inicio: agora, atualizado_em: agora,
  }).eq('id', tarefa.id);
}

async function retomarTarefa(tarefa: any) {
  const pausas = [...(tarefa.pausas || [])];
  const ultima = pausas[pausas.length - 1];
  let acumulado = tarefa.tempo_pausado_segundos || 0;
  const agoraIso = new Date().toISOString();
  if (ultima && !ultima.retomado_em) {
    acumulado += (new Date(agoraIso).getTime() - new Date(ultima.pausado_em).getTime()) / 1000;
    pausas[pausas.length - 1] = { ...ultima, retomado_em: agoraIso };
  }
  await supabase.from('engenharia_horas_tarefas').update({
    status: 'em_andamento', pausas, tempo_pausado_segundos: acumulado, atualizado_em: agoraIso,
  }).eq('id', tarefa.id);
}

// ─── Modal Nova Tarefa ────────────────────────────────────────────────────────
function ModalNovaTarefa({ onClose, onCriado, currentUser }: any) {
  const [titulo, setTitulo] = useState('');
  const [responsavel, setResponsavel] = useState(currentUser?.nome || '');
  const [opBusca, setOpBusca] = useState('');
  const [opResultados, setOpResultados] = useState<any[]>([]);
  const [opSelecionada, setOpSelecionada] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const buscarOps = async (q: string) => {
    setOpBusca(q); setOpSelecionada(null);
    if (!q.trim()) { setOpResultados([]); return; }
    const { data } = await supabase.from('oples').select('id,opl,cliente_nome').ilike('opl', `%${q}%`).limit(8);
    setOpResultados(data || []);
  };

  const criar = async () => {
    if (!titulo.trim()) { alert('Informe o título da tarefa.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('engenharia_horas_tarefas').insert([{
      opl_id: opSelecionada?.id || null,
      numero_opl: opSelecionada?.opl || null,
      titulo: titulo.trim(),
      responsavel_nome: responsavel.trim() || null,
      status: 'nao_iniciada',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    onCriado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div className="modal-title">+ Nova Tarefa</div>

        <label className="acn-label">Título da Tarefa *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 8 }}
          placeholder="Ex: Revisão de desenho técnico" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />

        <label className="acn-label">Responsável</label>
        <div style={{ marginBottom: 8 }}>
          <ColaboradorSelect value={responsavel} onChange={setResponsavel} placeholder="Selecione o responsável" />
        </div>

        <label className="acn-label">Vincular a uma OP/OS (opcional)</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 4 }}
          placeholder="Buscar por número da OP..." value={opBusca} onChange={e => buscarOps(e.target.value)} />
        {opResultados.length > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 8, maxHeight: 120, overflowY: 'auto' }}>
            {opResultados.map(o => (
              <div key={o.id} onClick={() => { setOpSelecionada(o); setOpBusca(o.opl); setOpResultados([]); }}
                style={{ padding: '5px 8px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                <strong>{o.opl}</strong> — {o.cliente_nome || '—'}
              </div>
            ))}
          </div>
        )}
        {opSelecionada && <div style={{ fontSize: 10, color: '#15803d', marginBottom: 8 }}>✅ Vinculado a {opSelecionada.opl}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} disabled={salvando} onClick={criar}>
            {salvando ? 'Criando...' : '✅ Criar Tarefa'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Pausar (motivo obrigatório) ────────────────────────────────────────
function ModalPausar({ tarefa, onClose, onPausado }: any) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo da pausa.'); return; }
    setSalvando(true);
    const pausas = [...(tarefa.pausas || []), { motivo: motivo.trim(), pausado_em: new Date().toISOString(), retomado_em: null }];
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'pausada', pausas, atualizado_em: new Date().toISOString(),
    }).eq('id', tarefa.id);
    setSalvando(false);
    onPausado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-title">⏸ Pausar Tarefa — {tarefa.titulo}</div>
        <label className="acn-label">Motivo da Pausa *</label>
        <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          placeholder="Ex: Aguardando material, reunião, fim do expediente..."
          value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#f59e0b', flex: 1 }} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Salvando...' : '⏸ Confirmar Pausa'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Linha de tarefa ──────────────────────────────────────────────────────────
function LinhaTarefa({ tarefa, agora, onAtualizado, currentUser, ctx, onForaDoHorario }: any) {
  const [modalPausar, setModalPausar] = useState(false);
  const [verLog, setVerLog] = useState(false);

  // o tempo só conta no horário de contagem ou em hora extra aprovada da pessoa
  const extras = extrasAprovadas(ctx, tarefa.responsavel_nome || '');
  const decorrido = segundosContados(tarefa, agora, ctx.feriados, extras);
  const liberadoAgora = () => !!janelaNoInstante(Date.now(), ctx.feriados, extras);
  const ultimaPausa = (tarefa.pausas || [])[(tarefa.pausas || []).length - 1];
  const pausaAutomatica = tarefa.status === 'pausada' && ultimaPausa?.automatica && !ultimaPausa?.retomado_em;
  const extraAgora = extras.find(([a, b]) => a <= agora && agora < b);
  const pedidoPendente = horasExtrasDaPessoa(ctx.extras, tarefa.responsavel_nome || '', 'pendente')
    .find((x: any) => new Date(x.fim).getTime() > agora);

  const iniciar = async () => {
    if (!liberadoAgora()) { onForaDoHorario(tarefa, 'iniciar'); return; }
    await iniciarTarefa(tarefa);
    onAtualizado();
  };

  const retomar = async () => {
    if (!liberadoAgora()) { onForaDoHorario(tarefa, 'retomar'); return; }
    await retomarTarefa(tarefa);
    onAtualizado();
  };

  const concluir = async () => {
    if (!await confirmar('Concluir esta tarefa?')) return;
    const total = segundosContados(tarefa, Date.now(), ctx.feriados, extras);
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'concluida', data_conclusao: new Date().toISOString(), tempo_total_segundos: total,
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  return (
    <>
      <tr>
        <td>
          {tarefa.titulo}
          {tarefa.numero_opl && <div style={{ fontSize: 9, color: '#64748b' }}>OPL: {tarefa.numero_opl}</div>}
        </td>
        <td>{tarefa.responsavel_nome || '—'}</td>
        <td>
          <span className="acn-badge" style={{ background: STATUS_COR[tarefa.status] }}>{STATUS_LABEL[tarefa.status]}</span>
          {pausaAutomatica && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>automática · fim do horário</div>}
          {tarefa.status !== 'concluida' && extraAgora && (
            <div style={{ fontSize: 10, color: '#15803d', marginTop: 2 }}>
              hora extra até {new Date(extraAgora[1]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {tarefa.status !== 'concluida' && !extraAgora && pedidoPendente && (
            <div style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>hora extra aguardando aprovação</div>
          )}
        </td>
        <td style={{ fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", fontWeight: 700, color: tarefa.status === 'pausada' ? '#f59e0b' : '#2563eb' }}>
          {tarefa.data_inicio ? fmtDuracao(decorrido) : '—'}
        </td>
        <td style={{ fontSize: 10 }}>{fmtDtHr(tarefa.data_inicio)}</td>
        <td>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {tarefa.status === 'nao_iniciada' && (
              <button className="acn-btn" style={{ background: '#2563eb', fontSize: 9 }} onClick={iniciar}>▶ Iniciar</button>
            )}
            {tarefa.status === 'em_andamento' && (
              <button className="acn-btn" style={{ background: '#f59e0b', fontSize: 9 }} onClick={() => setModalPausar(true)}>⏸ Pausar</button>
            )}
            {tarefa.status === 'pausada' && (
              <button className="acn-btn" style={{ background: '#16a34a', fontSize: 9 }} onClick={retomar}>▶ Retomar</button>
            )}
            {(tarefa.status === 'em_andamento' || tarefa.status === 'pausada') && (
              <button className="acn-btn" style={{ background: '#22c55e', fontSize: 9 }} onClick={concluir}>✅ Concluir</button>
            )}
            {(tarefa.pausas || []).length > 0 && (
              <button className="acn-btn" style={{ background: '#475569', fontSize: 9 }} onClick={() => setVerLog(v => !v)}>
                📋 Pausas ({tarefa.pausas.length})
              </button>
            )}
          </div>
        </td>
      </tr>
      {verLog && (
        <tr>
          <td colSpan={6} style={{ background: '#f8fafc', padding: '8px 12px' }}>
            {(tarefa.pausas || []).map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 10, marginBottom: 4, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                <strong>{fmtDtHr(p.pausado_em)}</strong>{p.retomado_em ? ` → ${fmtDtHr(p.retomado_em)}` : ' (pausa ativa)'}
                <div style={{ color: '#475569' }}>Motivo: {p.motivo}</div>
              </div>
            ))}
          </td>
        </tr>
      )}
      {modalPausar && createPortal(
        <ModalPausar tarefa={tarefa} onClose={() => setModalPausar(false)}
          onPausado={() => { setModalPausar(false); onAtualizado(); }} />,
        document.body,
      )}
    </>
  );
}

// ─── Horas das tarefas nos relatórios ──────────────────────────────────────────
// Mesma regra do cronômetro (HorarioContagem.ts): conta de segunda a sexta, das 6:00 às
// 19:45, fora dos feriados, ou dentro de hora extra aprovada; sem as pausas. Tarefa
// esquecida rodando para de contar no fim do horário. Tarefas da mesma pessoa rodando ao
// mesmo tempo contam uma vez só nas horas dessa pessoa (união dos intervalos).
const somaDias = (porDia: Record<string, number>, de?: string, ate?: string) =>
  Object.entries(porDia).reduce((s, [d, v]) => (!de || (d >= de && d <= ate!)) ? s + v : s, 0);
const diaISO = (d: any) => d ? new Date(d).toLocaleDateString('sv-SE') : '';
const fmtHoras = (seg: number) => {
  if (!seg || seg < 60) return '—';
  if (seg < 3600) return Math.round(seg / 60) + ' min';
  const h = seg / 3600;
  return (h < 10 ? h.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(h).toLocaleString('pt-BR')) + ' h';
};
const nomeResp = (t: any) => t.responsavel_nome || 'Sem responsável';

// Tarefas criadas no período ou em execução em algum momento dele (mesma seleção nos dois relatórios)
async function buscarTarefasDoPeriodo(de: string, ate: string) {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ini = iso(new Date(de + 'T00:00:00')), fim = iso(new Date(ate + 'T23:59:59'));
  const { data, error } = await supabase.from('engenharia_horas_tarefas').select('*')
    .or(`and(criado_em.gte.${ini},criado_em.lte.${fim}),and(data_inicio.lte.${fim},data_conclusao.gte.${ini}),and(data_inicio.lte.${fim},data_conclusao.is.null)`)
    .order('criado_em', { ascending: false });
  return { tarefas: data || [], error };
}
type Periodo = { de: string; ate: string };
const noPeriodo = (d: string, periodo: Periodo) => !!d && d >= periodo.de && d <= periodo.ate;
// Cada tarefa com o tempo contado (normal e hora extra) e as pausas no horário
function horasDasTarefas(tarefas: any[], periodo: Periodo, agora: number, ctx: ContextoHorario) {
  return tarefas.map(t => {
    const extras = extrasAprovadas(ctx, t.responsavel_nome || '');
    const { rodando: trechos, pausada: pausasRegistradas } = trechosDaTarefa(t, agora);
    const { contados, cortes } = aplicarHorario(trechos, ctx.feriados, extras);
    const { extra } = separarNormalExtra(contados, ctx.feriados);
    // parada = pausas registradas + tempo depois da pausa automática, só dentro do horário
    const paradas = unirIntervalos([...pausasRegistradas, ...cortes]);
    const pausada = paradas.length
      ? intersecao(paradas, janelasPermitidas(paradas[0][0], paradas[paradas.length - 1][1], ctx.feriados, extras))
      : [];
    const trabalho = segundosPorDia(contados);
    return {
      t, rodando: contados, pausada, extra, extras, trabalho,
      concluidaNoPeriodo: t.status === 'concluida' && noPeriodo(diaISO(t.data_conclusao), periodo),
      seg: somaDias(trabalho, periodo.de, periodo.ate),
      total: somaDias(trabalho),
      pausas: (t.pausas || []).filter((p: any) => noPeriodo(diaISO(p.pausado_em), periodo)),
      aberta: t.status === 'em_andamento' || t.status === 'pausada',
    };
  });
}
// Horas de um grupo de tarefas: por pessoa, a união dos intervalos (tarefas em paralelo
// não contam em dobro); entre pessoas diferentes, soma.
function porDiaDaPessoa(itens: any[], campo: 'rodando' | 'pausada' | 'extra' = 'rodando') {
  const grupos: Record<string, number[][]> = {};
  itens.forEach(x => { const k = nomeResp(x.t); grupos[k] = (grupos[k] || []).concat(x[campo]); });
  return Object.fromEntries(Object.entries(grupos).map(([k, ints]) => [k, segundosPorDia(unirIntervalos(ints))])) as Record<string, Record<string, number>>;
}
function horasDoGrupo(itens: any[], periodo: Periodo, campo: 'rodando' | 'pausada' | 'extra' = 'rodando') {
  return Object.values(porDiaDaPessoa(itens, campo)).reduce((s, dias) => s + somaDias(dias, periodo.de, periodo.ate), 0);
}

const SITUACAO_EXTRA: Record<string, string> = { pendente: 'Aguardando aprovação', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };

// ─── Relatório gerencial (Gerentes e Admin) ─────────────────────────────────────
function RelatorioGerencial() {
  const [de, setDe] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('sv-SE'); });
  const [ate, setAte] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [periodo, setPeriodo] = useState({ de: '', ate: '' });
  const [pessoa, setPessoa] = useState('');
  const [dados, setDados] = useState<any[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [ctx, setCtx] = useState<ContextoHorario>(CONTEXTO_VAZIO);
  const [pedidos, setPedidos] = useState<any[]>([]);

  const buscar = async () => {
    if (!de || !ate || de > ate) { alert('Período inválido: a data inicial precisa ser igual ou anterior à final.'); return; }
    setCarregando(true);
    const { tarefas: lista, error } = await buscarTarefasDoPeriodo(de, ate);
    if (error) { setCarregando(false); alert('Não foi possível carregar as tarefas: ' + error.message); return; }
    const ids = [...new Set(lista.map(t => t.opl_id).filter(Boolean))];
    let mapa: Record<string, string> = {};
    if (ids.length) {
      const { data: ops } = await supabase.from('oples').select('id, cliente_nome').in('id', ids);
      mapa = Object.fromEntries((ops || []).map(o => [o.id, o.cliente_nome || '—']));
    }
    const [contexto, { data: pedidosDoPeriodo }] = await Promise.all([
      carregarContextoHorario(),
      supabase.from('horas_extras').select('*')
        .lt('inicio', new Date(ate + 'T23:59:59').toISOString()).gt('fim', new Date(de + 'T00:00:00').toISOString())
        .order('inicio', { ascending: false }),
    ]);
    setDados(lista); setClientes(mapa); setCtx(contexto); setPedidos(pedidosDoPeriodo || []);
    setPeriodo({ de, ate }); setAgora(Date.now());
    setCarregando(false);
  };
  useEffect(() => { buscar(); }, []);

  const pessoas = [...new Set(dados.map(nomeResp))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const itens = horasDasTarefas(dados.filter(t => !pessoa || nomeResp(t) === pessoa), periodo, agora, ctx);
  const soma = (xs: any[], k: string) => xs.reduce((s, x) => s + x[k], 0);
  const media = (xs: any[]) => xs.length ? soma(xs, 'total') / xs.length : 0;

  const concluidas = itens.filter(x => x.concluidaNoPeriodo);
  const totalSeg = horasDoGrupo(itens, periodo);
  const totalPausado = horasDoGrupo(itens, periodo, 'pausada');
  const totalExtra = horasDoGrupo(itens, periodo, 'extra');
  const nPausas = itens.reduce((s, x) => s + x.pausas.length, 0);
  const diasPorPessoa = porDiaDaPessoa(itens);
  const extrasPorPessoa = porDiaDaPessoa(itens, 'extra');
  const pedidosVisiveis = pedidos.filter(x => !pessoa || mesmaPessoa(x.pessoa_nome, [normNome(pessoa)]));

  const porPessoa = [...new Set(itens.map(x => nomeResp(x.t)))].map(nome => {
    const xs = itens.filter(x => nomeResp(x.t) === nome);
    const conc = xs.filter(x => x.concluidaNoPeriodo);
    return {
      nome, tarefas: xs.length, concluidas: conc.length, abertas: xs.filter(x => x.aberta).length,
      naoIniciadas: xs.filter(x => x.t.status === 'nao_iniciada').length,
      seg: horasDoGrupo(xs, periodo), extra: horasDoGrupo(xs, periodo, 'extra'), media: media(conc),
      pausado: horasDoGrupo(xs, periodo, 'pausada'), pausas: xs.reduce((s, x) => s + x.pausas.length, 0),
    };
  }).sort((a, b) => b.seg - a.seg || a.nome.localeCompare(b.nome, 'pt-BR'));

  const dias = [...new Set(Object.values(diasPorPessoa).flatMap(d => Object.keys(d)))].filter(d => noPeriodo(d, periodo)).sort().reverse();
  const porDia = dias.map(dia => {
    const linha: Record<string, any> = { dia, total: 0, extra: 0 };
    porPessoa.forEach(p => {
      linha[p.nome] = diasPorPessoa[p.nome]?.[dia] || 0;
      linha.total += linha[p.nome];
      linha.extra += extrasPorPessoa[p.nome]?.[dia] || 0;
    });
    return linha;
  });

  const agrupar = (chave: (x: any) => string | null) => (Object.values(itens.reduce((acc: any, x) => {
    const k = chave(x);
    if (k == null) return acc;
    if (!acc[k]) acc[k] = { nome: k, cliente: x.t.opl_id ? (clientes[x.t.opl_id] || '—') : '—', itens: [], ops: new Set(), pessoas: new Set() };
    acc[k].itens.push(x); acc[k].pessoas.add(nomeResp(x.t));
    if (x.t.numero_opl) acc[k].ops.add(x.t.numero_opl);
    return acc;
  }, {})) as any[]).map(g => ({ ...g, tarefas: g.itens.length, seg: horasDoGrupo(g.itens, periodo) })).sort((a, b) => b.seg - a.seg);
  const porOp = agrupar(x => x.t.numero_opl || 'Sem OP');
  const opsComHoras = porOp.filter(o => o.nome !== 'Sem OP' && o.seg > 0);
  const mediaPorOp = opsComHoras.length ? soma(opsComHoras, 'seg') / opsComHoras.length : 0;
  const porCliente = agrupar(x => x.t.opl_id ? (clientes[x.t.opl_id] || '—') : null);

  const inicioPeriodo = periodo.de ? new Date(periodo.de + 'T00:00:00').getTime() : 0;
  const fimPeriodo = periodo.ate ? new Date(periodo.ate + 'T00:00:00').getTime() + 86400000 : 0;
  const motivos = Object.values(itens.reduce((acc: any, x) => {
    const fimTarefa = x.t.status === 'concluida' && x.t.data_conclusao ? new Date(x.t.data_conclusao).getTime() : agora;
    (x.t.pausas || []).forEach((p: any) => {
      if (!p.pausado_em) return;
      const k = String(p.motivo || '—').trim();
      if (!acc[k]) acc[k] = { motivo: k, vezes: 0, seg: 0 };
      if (x.pausas.includes(p)) acc[k].vezes++;
      const pi = Math.max(new Date(p.pausado_em).getTime(), inicioPeriodo);
      const pf = Math.min(p.retomado_em ? new Date(p.retomado_em).getTime() : fimTarefa, fimPeriodo);
      // só o tempo parado dentro do horário de contagem (ou de hora extra aprovada)
      if (pf > pi) acc[k].seg += Math.round(somaMs(intersecao([[pi, pf]], janelasPermitidas(pi, pf, ctx.feriados, x.extras))) / 1000);
    });
    return acc;
  }, {})).filter((m: any) => m.vezes > 0 || m.seg > 0).sort((a: any, b: any) => b.vezes - a.vezes || b.seg - a.seg) as any[];

  const dataBr = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.'); return; }
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    const tabela = (cab: string[], linhas: any[][]) => `<table><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório gerencial da Engenharia</title>
      <style>body{font:12px Arial,sans-serif;color:#17212b;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px}
      .sub{color:#6b7886}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #dee4ea;padding:4px 6px;text-align:left;vertical-align:top}
      th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7886}</style></head><body>
      <h1>Relatório gerencial da Engenharia</h1>
      <div class="sub">${dataBr(periodo.de)} a ${dataBr(periodo.ate)} · ${esc(pessoa || 'equipe inteira')} · o tempo conta ${HORARIO_CONTAGEM_TEXTO}, sem as pausas; fora disso, só hora extra aprovada</div>
      <p>Horas trabalhadas: <b>${fmtHoras(totalSeg)}</b> (${fmtHoras(totalExtra)} de hora extra) · Tarefas: ${itens.length} (${concluidas.length} concluídas no período) · Média por tarefa concluída: ${fmtHoras(media(concluidas))} · Média por OP: ${fmtHoras(mediaPorOp)} · Em pausa: ${fmtHoras(totalPausado)}</p>
      <h2>Por pessoa</h2>${tabela(['Pessoa', 'Tarefas', 'Concluídas', 'Em aberto', 'Horas', 'Hora extra', 'Média/tarefa', 'Em pausa'], porPessoa.map(p => [p.nome, p.tarefas, p.concluidas, p.abertas, fmtHoras(p.seg), fmtHoras(p.extra), fmtHoras(p.media), fmtHoras(p.pausado)]))}
      <h2>Horas por dia</h2>${tabela(['Dia', ...porPessoa.map(p => p.nome), 'Hora extra', 'Total'], porDia.map(l => [dataBr(l.dia), ...porPessoa.map(p => fmtHoras(l[p.nome])), fmtHoras(l.extra), fmtHoras(l.total)]))}
      <h2>Horas por OP</h2>${tabela(['OP', 'Cliente', 'Tarefas', 'Horas', 'Pessoas'], porOp.map(o => [o.nome, o.cliente, o.tarefas, fmtHoras(o.seg), [...o.pessoas].join(', ')]))}
      ${pedidosVisiveis.length ? `<h2>Pedidos de hora extra</h2>${tabela(['Pessoa', 'Quando', 'Motivo', 'Situação', 'Decidido por'], pedidosVisiveis.map(x => [x.pessoa_nome, textoPeriodo(x.inicio, x.fim), x.motivo, (SITUACAO_EXTRA[x.status] || x.status) + (x.registro_direto ? ' (direto)' : ''), x.decidido_por_nome || '—']))}` : ''}
      ${motivos.length ? `<h2>Motivos de pausa</h2>${tabela(['Motivo', 'Vezes', 'Horas em pausa'], motivos.map(m => [m.motivo, m.vezes, fmtHoras(m.seg)]))}` : ''}
      </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const kpi = (rot: string, val: any, sub: string, cor: string) => (
    <div key={rot} className="acn-kpi">
      <span className="rot"><i style={{ background: cor }} />{rot}</span>
      <span className="val acn-num">{carregando ? '…' : val}</span>
      <span className="sub">{sub}</span>
    </div>
  );
  const direita = { textAlign: 'right' } as const;
  const vazio = <div className="acn-empty">Nenhuma tarefa com atividade no período.</div>;

  return (
    <div>
      <div className="sec-card">
        <div className="acn-filtros" style={{ alignItems: 'flex-end' }}>
          <div><label className="acn-label">De</label><input type="date" className="acn-input" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div><label className="acn-label">Até</label><input type="date" className="acn-input" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div><label className="acn-label">Pessoa</label>
            <select className="acn-input" value={pessoa} onChange={e => setPessoa(e.target.value)}>
              <option value="">Equipe inteira</option>
              {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button className="acn-b acn-b-primario" onClick={buscar} disabled={carregando}>{carregando ? 'Carregando…' : 'Atualizar'}</button>
          <button className="acn-b acn-b-secundario acn-filtros-dir" onClick={imprimir} disabled={carregando || !itens.length}>Imprimir</button>
        </div>
        <div className="sec-body acn-fraco" style={{ fontSize: 12 }}>
          O tempo conta {HORARIO_CONTAGEM_TEXTO}, sem as pausas; fora disso, só com hora extra aprovada. Entram as tarefas criadas no período ou em execução em algum momento dele.
        </div>
      </div>

      <div className="acn-kpis">
        {kpi('Horas trabalhadas', fmtHoras(totalSeg), totalExtra ? `${fmtHoras(totalExtra)} de hora extra` : 'no período, sem hora extra', 'var(--acn-brand)')}
        {kpi('Tarefas', itens.length, `${concluidas.length} concluídas · ${itens.filter(x => x.aberta).length} em aberto`, 'var(--acn-info)')}
        {kpi('Média por tarefa', fmtHoras(media(concluidas)), 'das concluídas no período', 'var(--acn-ok)')}
        {kpi('Tempo em pausa', fmtHoras(totalPausado), `${nPausas} pausa(s) no período`, 'var(--acn-warn)')}
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por pessoa</span></div>
        <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
          {porPessoa.length === 0 ? vazio : (
            <table className="acn-tabela">
              <thead><tr><th>Pessoa</th><th style={direita}>Tarefas</th><th style={direita}>Concluídas</th><th style={direita}>Em aberto</th><th style={direita}>Não iniciadas</th><th style={direita}>Horas</th><th style={direita}>Hora extra</th><th style={direita}>Média/tarefa</th><th style={direita}>Em pausa</th></tr></thead>
              <tbody>
                {porPessoa.map(p => (
                  <tr key={p.nome}>
                    <td className="acn-forte">{p.nome}</td>
                    <td className="acn-num" style={direita}>{p.tarefas}</td>
                    <td className="acn-num" style={direita}>{p.concluidas}</td>
                    <td className="acn-num" style={direita}>{p.abertas}</td>
                    <td className="acn-num" style={direita}>{p.naoIniciadas}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(p.seg)}</td>
                    <td className="acn-num" style={direita}>{fmtHoras(p.extra)}</td>
                    <td className="acn-num" style={direita}>{fmtHoras(p.media)}</td>
                    <td className="acn-num" style={direita}>{fmtHoras(p.pausado)}{p.pausas ? ` (${p.pausas})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {porDia.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Horas por dia</span></div>
          <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="acn-tabela">
              <thead><tr><th>Dia</th>{porPessoa.map(p => <th key={p.nome} style={direita}>{p.nome}</th>)}<th style={direita}>Hora extra</th><th style={direita}>Total</th></tr></thead>
              <tbody>
                {porDia.map(l => (
                  <tr key={l.dia}>
                    <td className="acn-num">{new Date(l.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    {porPessoa.map(p => <td key={p.nome} className="acn-num" style={direita}>{fmtHoras(l[p.nome])}</td>)}
                    <td className="acn-num" style={direita}>{fmtHoras(l.extra)}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr">
          <span>Horas por OP</span>
          {opsComHoras.length > 0 && <span className="acn-fraco" style={{ fontWeight: 400 }}>média de {fmtHoras(mediaPorOp)} por OP</span>}
        </div>
        <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
          {porOp.length === 0 ? vazio : (
            <table className="acn-tabela">
              <thead><tr><th>OP</th><th>Cliente</th><th style={direita}>Tarefas</th><th style={direita}>Horas</th><th>Pessoas</th></tr></thead>
              <tbody>
                {porOp.map(o => (
                  <tr key={o.nome}>
                    <td className="acn-mono acn-forte">{o.nome}</td>
                    <td>{o.cliente}</td>
                    <td className="acn-num" style={direita}>{o.tarefas}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(o.seg)}</td>
                    <td className="acn-fraco">{[...o.pessoas].join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {porCliente.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Horas por cliente</span></div>
          <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="acn-tabela">
              <thead><tr><th>Cliente</th><th style={direita}>OPs</th><th style={direita}>Tarefas</th><th style={direita}>Horas</th></tr></thead>
              <tbody>
                {porCliente.map(c => (
                  <tr key={c.nome}>
                    <td className="acn-forte">{c.nome}</td>
                    <td className="acn-num" style={direita}>{c.ops.size}</td>
                    <td className="acn-num" style={direita}>{c.tarefas}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(c.seg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {motivos.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Motivos de pausa</span></div>
          <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="acn-tabela">
              <thead><tr><th>Motivo</th><th style={direita}>Vezes</th><th style={direita}>Horas em pausa</th></tr></thead>
              <tbody>{motivos.map(m => <tr key={m.motivo}><td style={{ whiteSpace: 'pre-wrap' }}>{m.motivo}</td><td className="acn-num" style={direita}>{m.vezes}</td><td className="acn-num" style={direita}>{fmtHoras(m.seg)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {pedidosVisiveis.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Pedidos de hora extra ({pedidosVisiveis.length})</span></div>
          <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
            <table className="acn-tabela">
              <thead><tr><th>Pessoa</th><th>Quando</th><th>Motivo</th><th>Situação</th><th>Decidido por</th></tr></thead>
              <tbody>
                {pedidosVisiveis.map(x => (
                  <tr key={x.id}>
                    <td className="acn-forte">{x.pessoa_nome}</td>
                    <td className="acn-num" style={{ whiteSpace: 'nowrap' }}>{textoPeriodo(x.inicio, x.fim)}</td>
                    <td style={{ minWidth: 200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{x.motivo}</td>
                    <td>{SITUACAO_EXTRA[x.status] || x.status}{x.registro_direto ? ' (direto)' : ''}</td>
                    <td>
                      {x.decidido_por_nome || (x.status === 'pendente' ? `com ${x.aprovador_nome || '—'}` : '—')}
                      {x.resposta && <div className="acn-fraco" style={{ fontSize: 12 }}>{x.resposta}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="sec-hdr"><span>Atividades do período ({itens.length})</span></div>
        <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
          {itens.length === 0 ? vazio : (
            <table className="acn-tabela">
              <thead><tr><th>Tarefa</th><th>Pessoa</th><th>OP</th><th>Status</th><th>Início</th><th>Conclusão</th><th style={direita}>No período</th><th style={direita}>Total</th></tr></thead>
              <tbody>
                {itens.map(({ t, seg, total }) => (
                  <tr key={t.id}>
                    <td style={{ minWidth: 200 }}>{t.titulo}</td>
                    <td>{nomeResp(t)}</td>
                    <td className="acn-mono">{t.numero_opl || '—'}</td>
                    <td>{STATUS_LABEL[t.status] || t.status}</td>
                    <td className="acn-num">{fmtDtHr(t.data_inicio)}</td>
                    <td className="acn-num">{fmtDtHr(t.data_conclusao)}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(seg)}</td>
                    <td className="acn-num" style={direita}>{fmtHoras(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Relatório por Período ─────────────────────────────────────────────────────
// Gerentes e Admin: equipe inteira (com filtro por pessoa). Demais: só as próprias horas.
function RelatorioHoras({ currentUser }: any) {
  const gestor = ehGestorEngenharia(currentUser);
  const [pessoa, setPessoa] = useState('');
  const [de, setDe] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('sv-SE'); });
  const [ate, setAte] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [periodo, setPeriodo] = useState({ de: '', ate: '' });
  const [doPeriodo, setDados] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [ctx, setCtx] = useState<ContextoHorario>(CONTEXTO_VAZIO);

  const buscar = async () => {
    if (!de || !ate || de > ate) { alert('Período inválido: a data inicial precisa ser igual ou anterior à final.'); return; }
    setCarregando(true);
    const { tarefas, error } = await buscarTarefasDoPeriodo(de, ate);
    if (error) { setCarregando(false); alert('Não foi possível carregar as tarefas: ' + error.message); return; }
    // quem não é gerente/admin vê só as tarefas em que é o responsável
    const [meusNomes, contexto] = await Promise.all([
      gestor ? Promise.resolve([] as string[]) : nomesDoUsuario(currentUser),
      carregarContextoHorario(),
    ]);
    setDados(tarefas.filter(t => gestor || mesmaPessoa(t.responsavel_nome, meusNomes)));
    setCtx(contexto); setPeriodo({ de, ate }); setAgora(Date.now());
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, []);

  const pessoasRel = [...new Set(doPeriodo.map(nomeResp))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // mesma conta do relatório gerencial
  const itens = horasDasTarefas(doPeriodo.filter(t => !pessoa || nomeResp(t) === pessoa), periodo, agora, ctx);
  const concluidas = itens.filter(x => x.concluidaNoPeriodo);
  const tempoTotal = horasDoGrupo(itens, periodo);
  const tempoExtra = horasDoGrupo(itens, periodo, 'extra');
  const porResponsavel = [...new Set(itens.map(x => nomeResp(x.t)))].map(nome => {
    const xs = itens.filter(x => nomeResp(x.t) === nome);
    return { nome, total: xs.length, concluidas: xs.filter(x => x.concluidaNoPeriodo).length, seg: horasDoGrupo(xs, periodo), extra: horasDoGrupo(xs, periodo, 'extra') };
  }).sort((a, b) => b.seg - a.seg || a.nome.localeCompare(b.nome, 'pt-BR'));
  const motivosPausa: Record<string, number> = {};
  itens.forEach(x => x.pausas.forEach((p: any) => { motivosPausa[p.motivo] = (motivosPausa[p.motivo] || 0) + 1; }));

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>{gestor ? 'Filtros do Relatório' : `Suas horas — ${currentUser?.nome || ''}`}</span></div>
        <div className="sec-body">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" style={{ width: '100%' }} value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" style={{ width: '100%' }} value={ate} onChange={e => setAte(e.target.value)} />
            </div>
            {gestor && (
              <div className="form-group">
                <label className="acn-label">Pessoa</label>
                <select className="acn-input" style={{ width: '100%' }} value={pessoa} onChange={e => setPessoa(e.target.value)}>
                  <option value="">Equipe inteira</option>
                  {pessoasRel.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="acn-btn" style={{ background: '#1e293b' }} onClick={buscar}>Filtrar</button>
            </div>
          </div>
          <div className="acn-fraco" style={{ fontSize: 12, marginTop: 6 }}>
            O tempo conta {HORARIO_CONTAGEM_TEXTO}, sem as pausas; fora disso, só com hora extra aprovada. Entram as tarefas criadas no período ou em execução em algum momento dele.
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Totais do Período</span></div>
        <div className="sec-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Tarefas no Período', val: itens.length, cor: '#1e293b' },
              { label: 'Concluídas no Período', val: concluidas.length, cor: '#22c55e' },
              { label: 'Em Andamento/Pausadas', val: itens.filter(x => x.aberta).length, cor: '#3b82f6' },
              { label: 'Horas Trabalhadas', val: fmtHoras(tempoTotal), cor: '#7c3aed' },
              { label: 'Horas Extras', val: fmtHoras(tempoExtra), cor: '#b45309' },
            ].map(c => (
              <div key={c.label} style={{ flex: '1 1 150px', minWidth: 130, background: 'white', border: '1px solid #e2e8f0', borderTop: `3px solid ${c.cor}`, borderRadius: 4, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.cor }}>{carregando ? '...' : c.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por Responsável</span></div>
        <div className="sec-body" style={{ overflowX: 'auto' }}>
          {porResponsavel.length === 0 ? <div className="acn-empty">Nenhuma tarefa no período.</div> : (
            <table>
              <thead><tr><th>Responsável</th><th>Tarefas</th><th>Concluídas</th><th>Horas</th><th>Hora extra</th></tr></thead>
              <tbody>
                {porResponsavel.map(v => (
                  <tr key={v.nome}>
                    <td>{v.nome}</td><td>{v.total}</td><td>{v.concluidas}</td><td>{fmtHoras(v.seg)}</td><td>{fmtHoras(v.extra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {Object.keys(motivosPausa).length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Motivos de Pausa Mais Frequentes</span></div>
          <div className="sec-body" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Motivo</th><th>Ocorrências</th></tr></thead>
              <tbody>
                {Object.entries(motivosPausa).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => (
                  <tr key={motivo}><td>{motivo}</td><td>{n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function HorasTarefasTab({ currentUser, abaInicial }: { currentUser: any; abaInicial?: string }) {
  const [aba, setAba] = useState<string>(abaInicial || 'tarefas');
  const gestor = ehGestorEngenharia(currentUser);
  const [operador, setOperador] = useState('');
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'nao_iniciada' | 'em_andamento' | 'pausada' | 'concluida'>('todas');
  const [busca, setBusca] = useState('');
  const [modalNova, setModalNova] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const [ctx, setCtx] = useState<ContextoHorario>(CONTEXTO_VAZIO);
  const [ctxPronto, setCtxPronto] = useState(false);
  const [horaExtra, setHoraExtra] = useState<{ tarefa: any; acao: 'iniciar' | 'retomar' } | null>(null);
  const tentativasPausa = useRef<Record<string, number>>({});

  // tarefas + feriados e horas extras; a cada minuto em silêncio
  const carregar = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const [{ data }, contexto] = await Promise.all([
      supabase.from('engenharia_horas_tarefas').select('*').order('criado_em', { ascending: false }),
      carregarContextoHorario(),
    ]);
    setTarefas(data || []);
    setCtx(contexto); setCtxPronto(true);
    if (!silencioso) setLoading(false);
  };

  useEffect(() => {
    carregar();
    const t = setInterval(() => carregar(true), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const abrir = () => setAba('extras');
    window.addEventListener('engenharia:abrir-horas-extras', abrir);
    return () => window.removeEventListener('engenharia:abrir-horas-extras', abrir);
  }, []);

  // Pausa automática: a tarefa que segue rodando depois do fim do horário (ou da hora
  // extra) fica registrada como pausada no instante em que o horário acabou.
  const minuto = Math.floor(tick / 60000);
  useEffect(() => {
    if (!ctxPronto) return;
    const agoraMs = Date.now();
    const pendentes = tarefas
      .map(t => ({ t, corte: pausaAutomaticaPendente(t, agoraMs, ctx.feriados, extrasAprovadas(ctx, t.responsavel_nome || '')) }))
      .filter(x => x.corte != null && tentativasPausa.current[x.t.id] !== x.corte);
    if (!pendentes.length) return;
    (async () => {
      let gravou = false;
      for (const { t, corte } of pendentes) {
        tentativasPausa.current[t.id] = corte as number;
        const pausas = [...(t.pausas || []), { motivo: MOTIVO_PAUSA_AUTOMATICA, pausado_em: new Date(corte as number).toISOString(), retomado_em: null, automatica: true }];
        let q = supabase.from('engenharia_horas_tarefas').update({ status: 'pausada', pausas, atualizado_em: new Date().toISOString() })
          .eq('id', t.id).eq('status', 'em_andamento');
        q = t.atualizado_em ? q.eq('atualizado_em', t.atualizado_em) : q.is('atualizado_em', null);
        const { data } = await q.select('id');
        if (data?.length) gravou = true;
      }
      if (gravou) carregar(true);
    })();
  }, [tarefas, ctx, ctxPronto, minuto]);

  // Iniciar/retomar fora do horário: pede (ou registra) hora extra
  const foraDoHorario = (tarefa: any, acao: 'iniciar' | 'retomar') => {
    const pendente = horasExtrasDaPessoa(ctx.extras, tarefa.responsavel_nome || '', 'pendente')
      .find((x: any) => new Date(x.fim).getTime() > Date.now());
    if (pendente && !gestor) {
      alert(`Fora do horário de contagem. O pedido de hora extra (${textoPeriodo(pendente.inicio, pendente.fim)}) ainda aguarda a aprovação de ${pendente.aprovador_nome || 'seu gestor'}.`);
      return;
    }
    setHoraExtra({ tarefa, acao });
  };
  const horaExtraRegistrada = async (registro: any) => {
    const alvo = horaExtra;
    setHoraExtra(null);
    const agoraMs = Date.now();
    // gerente/admin: a hora extra já vale, então a tarefa inicia ou retoma na hora
    if (alvo && registro?.status === 'aprovada' && new Date(registro.inicio).getTime() <= agoraMs && agoraMs < new Date(registro.fim).getTime()) {
      if (alvo.acao === 'iniciar') await iniciarTarefa(alvo.tarefa); else await retomarTarefa(alvo.tarefa);
    }
    carregar(true);
  };
  const admin = currentUser?.perfil === 'Admin';
  const aguardandoMinhaAprovacao = ctx.extras.filter(x => x.status === 'pendente'
    && (admin || (!!x.aprovador_id && String(x.aprovador_id) === String(currentUser?.id)))).length;
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(t); }, []);

  const operadores = [...new Set(tarefas.map(t => t.responsavel_nome || 'Sem responsável'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtradas = tarefas.filter(t => {
    if (filtro !== 'todas' && t.status !== filtro) return false;
    if (gestor && operador && (t.responsavel_nome || 'Sem responsável') !== operador) return false;
    if (busca.trim()) {
      const alvo = `${t.titulo||''} ${t.numero_opl||''} ${t.responsavel_nome||''}`.toLowerCase();
      if (!alvo.includes(busca.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '2px solid #1e293b' }}>
        <button style={{ flex: 1, padding: '8px', background: aba === 'tarefas' ? '#1e293b' : 'white', color: aba === 'tarefas' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          onClick={() => setAba('tarefas')}>⏱️ Tarefas</button>
        <button style={{ flex: 1, padding: '8px', background: aba === 'relatorio' ? '#1e293b' : 'white', color: aba === 'relatorio' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          onClick={() => setAba('relatorio')}>📊 Relatório por Período</button>
        <button style={{ flex: 1, padding: '8px', background: aba === 'extras' ? '#1e293b' : 'white', color: aba === 'extras' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          onClick={() => setAba('extras')}>🕒 Horas extras{aguardandoMinhaAprovacao ? ` (${aguardandoMinhaAprovacao})` : ''}</button>
        {gestor && (
          <button style={{ flex: 1, padding: '8px', background: aba === 'gerencial' ? '#1e293b' : 'white', color: aba === 'gerencial' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
            onClick={() => setAba('gerencial')}>📈 Relatório gerencial</button>
        )}
      </div>

      {aba === 'extras' ? <PainelHorasExtras currentUser={currentUser} onAtualizado={() => carregar(true)} />
        : aba === 'gerencial' && gestor ? <RelatorioGerencial /> : aba === 'relatorio' ? <RelatorioHoras currentUser={currentUser} /> : (
        <>
          {aguardandoMinhaAprovacao > 0 && (
            <div style={{ marginBottom: 10 }}>
              <Faixa tom="atencao" acao={<button className="acn-b acn-b-secundario acn-b-p" onClick={() => setAba('extras')}>Ver pedidos</button>}>
                {aguardandoMinhaAprovacao === 1 ? '1 pedido de hora extra aguarda' : `${aguardandoMinhaAprovacao} pedidos de hora extra aguardam`} sua aprovação.
              </Faixa>
            </div>
          )}
          <div className="sec-card">
            <div className="sec-hdr">
              <span>⏱️ Controle de Horas/Tarefas ({filtradas.length})</span>
              <button className="acn-btn" style={{ background: '#0f766e', fontSize: 10 }} onClick={() => setModalNova(true)}>+ Nova Tarefa</button>
            </div>
            <div className="sec-body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {(['todas', 'nao_iniciada', 'em_andamento', 'pausada', 'concluida'] as const).map(f => (
                <button key={f} className="acn-btn"
                  style={{ background: filtro === f ? '#1e293b' : '#e2e8f0', color: filtro === f ? '#fff' : '#475569', fontSize: 10 }}
                  onClick={() => setFiltro(f)}>
                  {f === 'todas' ? 'Todas' : STATUS_LABEL[f]}
                </button>
              ))}
              <input placeholder="🔍 Buscar por título, OPL ou responsável..." value={busca} onChange={e => setBusca(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10, minWidth: 220 }} />
              <span className="acn-fraco" style={{ fontSize: 12, flexBasis: '100%' }}>
                O tempo conta {HORARIO_CONTAGEM_TEXTO}. Às 19:45 a tarefa pausa sozinha; fora do horário, só com hora extra.
              </span>
              {gestor && (
                <select className="acn-input" value={operador} onChange={e => setOperador(e.target.value)} aria-label="Operador" style={{ width: 'auto', minWidth: 180 }}>
                  <option value="">Operador: todos</option>
                  {operadores.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </div>
            <div className="sec-body" style={{ overflowX: 'auto', paddingTop: 0 }}>
              {loading ? <div className="acn-empty">Carregando...</div> : filtradas.length === 0 ? (
                <div className="acn-empty">Nenhuma tarefa {filtro !== 'todas' ? 'nesse filtro' : 'cadastrada ainda'}.</div>
              ) : (
                <table>
                  <thead><tr><th>Tarefa</th><th>Responsável</th><th>Status</th><th>Tempo</th><th>Início</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filtradas.map(t => (
                      <LinhaTarefa key={t.id} tarefa={t} agora={tick} onAtualizado={() => carregar(true)} currentUser={currentUser}
                        ctx={ctx} onForaDoHorario={foraDoHorario} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {horaExtra && (
        <ModalHoraExtra currentUser={currentUser} pessoaNome={horaExtra.tarefa.responsavel_nome || currentUser?.nome}
          tarefa={horaExtra.tarefa} acao={horaExtra.acao} onClose={() => setHoraExtra(null)} onFeito={horaExtraRegistrada} />
      )}
      {modalNova && (
        <ModalNovaTarefa currentUser={currentUser} onClose={() => setModalNova(false)}
          onCriado={() => { setModalNova(false); carregar(); }} />
      )}
    </div>
  );
}
