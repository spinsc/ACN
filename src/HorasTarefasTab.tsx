// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// HorasTarefasTab — sub-aba "Horas/Tarefas" da Engenharia
// Controle de tarefas com início/fim; toda pausa exige motivo. Relatório de
// horas e tarefas por período.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';
import { confirmar } from './Feedback';
import { normalizarBusca } from './SearchUtils';
import { segundosUteis } from './utils/horasUteis';

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

// Tempo decorrido líquido (descontando pausas) em segundos
function tempoDecorrido(tarefa: any, agora: number) {
  if (!tarefa.data_inicio) return 0;
  const fim = tarefa.status === 'concluida' && tarefa.data_conclusao
    ? new Date(tarefa.data_conclusao).getTime()
    : agora;
  const bruto = (fim - new Date(tarefa.data_inicio).getTime()) / 1000;
  let pausadoAtual = 0;
  if (tarefa.status === 'pausada') {
    const ultimaPausa = (tarefa.pausas || [])[tarefa.pausas.length - 1];
    if (ultimaPausa && !ultimaPausa.retomado_em) {
      pausadoAtual = (agora - new Date(ultimaPausa.pausado_em).getTime()) / 1000;
    }
  }
  return Math.max(0, bruto - (tarefa.tempo_pausado_segundos || 0) - pausadoAtual);
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
function LinhaTarefa({ tarefa, agora, onAtualizado, currentUser }: any) {
  const [modalPausar, setModalPausar] = useState(false);
  const [verLog, setVerLog] = useState(false);

  const decorrido = tempoDecorrido(tarefa, agora);

  const iniciar = async () => {
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'em_andamento', data_inicio: new Date().toISOString(),
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  const retomar = async () => {
    const pausas = [...(tarefa.pausas || [])];
    const ultima = pausas[pausas.length - 1];
    let acumulado = tarefa.tempo_pausado_segundos || 0;
    if (ultima && !ultima.retomado_em) {
      const agoraIso = new Date().toISOString();
      acumulado += (new Date(agoraIso).getTime() - new Date(ultima.pausado_em).getTime()) / 1000;
      ultima.retomado_em = agoraIso;
    }
    await supabase.from('engenharia_horas_tarefas').update({
      status: 'em_andamento', pausas, tempo_pausado_segundos: acumulado,
    }).eq('id', tarefa.id);
    onAtualizado();
  };

  const concluir = async () => {
    if (!await confirmar('Concluir esta tarefa?')) return;
    const total = tempoDecorrido(tarefa, Date.now());
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
        <td><span className="acn-badge" style={{ background: STATUS_COR[tarefa.status] }}>{STATUS_LABEL[tarefa.status]}</span></td>
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

// ─── Quem vê a equipe inteira ──────────────────────────────────────────────────
// Gerentes (qualquer perfil "Gerente …") e Admins veem horas e tarefas de todos;
// os demais veem só as tarefas em que são o responsável.
export const ehGestorEngenharia = (u: any) => u?.perfil === 'Admin' || String(u?.perfil || '').startsWith('Gerente');
const normNome = (v: any) => normalizarBusca(String(v || '')).replace(/\s+/g, ' ').trim();
function distanciaLetras(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = tmp;
    }
  }
  return d[b.length];
}
// O responsável da tarefa vem do cadastro do RH, que pode estar escrito diferente do login
// (ex.: uma letra trocada no sobrenome). Conta como a mesma pessoa: nome igual, o nome do RH
// ligado ao login (pelo usuário ou pelo e-mail) ou mesmo primeiro nome com até 2 letras de diferença.
function mesmaPessoa(nomeTarefa: any, nomesUsuario: string[]) {
  const n = normNome(nomeTarefa);
  if (!n) return false;
  return nomesUsuario.some(u => u === n || (
    u.split(' ')[0] === n.split(' ')[0] && Math.min(u.length, n.length) >= 12 && distanciaLetras(u, n) <= 2
  ));
}
async function nomesDoUsuario(u: any) {
  const nomes = [u?.nome];
  const { data } = await supabase.from('rh_funcionarios').select('nome, email, usuario_id');
  (data || []).forEach((f: any) => {
    if ((u?.id && f.usuario_id === u.id) || (u?.email && f.email && normNome(f.email) === normNome(u.email))) nomes.push(f.nome);
  });
  return [...new Set(nomes.map(normNome).filter(Boolean))];
}

// ─── Horas úteis das tarefas ───────────────────────────────────────────────────
// O relatório gerencial conta horas úteis (seg–sex 8:00–17:45, o mesmo critério dos
// tempos das OPLs): o expediente em que a tarefa esteve rodando, do início à conclusão
// (ou agora), sem as pausas. Noite, fim de semana e tarefa esquecida aberta de um dia
// para o outro não inflam o total. Tarefas da mesma pessoa rodando ao mesmo tempo contam
// uma vez só nas horas dessa pessoa (união dos intervalos).
function fimDaTarefa(t: any, agora: number) {
  const ini = new Date(t.data_inicio).getTime();
  return t.status !== 'concluida' ? agora
    : t.data_conclusao ? new Date(t.data_conclusao).getTime()
    : ini + (Number(t.tempo_total_segundos) || 0) * 1000;
}
function unirIntervalos(intervalos: number[][]) {
  const ordenados = intervalos.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  const res: number[][] = [];
  for (const [a, b] of ordenados) {
    const ultimo = res[res.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else res.push([a, b]);
  }
  return res;
}
// Intervalos (em ms) em que a tarefa esteve rodando e em que esteve pausada
function intervalosDaTarefa(t: any, agora: number) {
  const vazio = { rodando: [] as number[][], pausada: [] as number[][] };
  if (!t.data_inicio) return vazio;
  const ini = new Date(t.data_inicio).getTime();
  const fim = fimDaTarefa(t, agora);
  if (!(fim > ini)) return vazio;
  const pausada = unirIntervalos((t.pausas || []).filter((p: any) => p.pausado_em).map((p: any) => [
    Math.max(ini, new Date(p.pausado_em).getTime()),
    Math.min(fim, p.retomado_em ? new Date(p.retomado_em).getTime() : fim),
  ]));
  const rodando: number[][] = [];
  let cursor = ini;
  for (const [a, b] of pausada) { if (a > cursor) rodando.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (fim > cursor) rodando.push([cursor, fim]);
  return { rodando, pausada };
}
// Segundos úteis por dia (AAAA-MM-DD) de intervalos que não se sobrepõem
function segundosPorDia(intervalos: number[][]) {
  const res: Record<string, number> = {};
  for (const [x, y] of intervalos) {
    const dia = new Date(x); dia.setHours(0, 0, 0, 0);
    while (dia.getTime() < y) {
      const proximo = new Date(dia); proximo.setDate(proximo.getDate() + 1);
      const s = segundosUteis(new Date(Math.max(x, dia.getTime())), new Date(Math.min(y, proximo.getTime())));
      if (s > 0) { const k = dia.toLocaleDateString('sv-SE'); res[k] = (res[k] || 0) + s; }
      dia.setTime(proximo.getTime());
    }
  }
  return res;
}
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
// Cada tarefa com seus intervalos e as horas úteis dentro do período
function horasDasTarefas(tarefas: any[], periodo: Periodo, agora: number) {
  return tarefas.map(t => {
    const { rodando, pausada } = intervalosDaTarefa(t, agora);
    const trabalho = segundosPorDia(rodando);
    return {
      t, rodando, pausada, trabalho,
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
function porDiaDaPessoa(itens: any[], campo: 'rodando' | 'pausada' = 'rodando') {
  const grupos: Record<string, number[][]> = {};
  itens.forEach(x => { const k = nomeResp(x.t); grupos[k] = (grupos[k] || []).concat(x[campo]); });
  return Object.fromEntries(Object.entries(grupos).map(([k, ints]) => [k, segundosPorDia(unirIntervalos(ints))])) as Record<string, Record<string, number>>;
}
function horasDoGrupo(itens: any[], periodo: Periodo, campo: 'rodando' | 'pausada' = 'rodando') {
  return Object.values(porDiaDaPessoa(itens, campo)).reduce((s, dias) => s + somaDias(dias, periodo.de, periodo.ate), 0);
}

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
    setDados(lista); setClientes(mapa); setPeriodo({ de, ate }); setAgora(Date.now());
    setCarregando(false);
  };
  useEffect(() => { buscar(); }, []);

  const pessoas = [...new Set(dados.map(nomeResp))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const itens = horasDasTarefas(dados.filter(t => !pessoa || nomeResp(t) === pessoa), periodo, agora);
  const soma = (xs: any[], k: string) => xs.reduce((s, x) => s + x[k], 0);
  const media = (xs: any[]) => xs.length ? soma(xs, 'total') / xs.length : 0;

  const concluidas = itens.filter(x => x.concluidaNoPeriodo);
  const totalSeg = horasDoGrupo(itens, periodo);
  const totalPausado = horasDoGrupo(itens, periodo, 'pausada');
  const nPausas = itens.reduce((s, x) => s + x.pausas.length, 0);
  const diasPorPessoa = porDiaDaPessoa(itens);

  const porPessoa = [...new Set(itens.map(x => nomeResp(x.t)))].map(nome => {
    const xs = itens.filter(x => nomeResp(x.t) === nome);
    const conc = xs.filter(x => x.concluidaNoPeriodo);
    return {
      nome, tarefas: xs.length, concluidas: conc.length, abertas: xs.filter(x => x.aberta).length,
      naoIniciadas: xs.filter(x => x.t.status === 'nao_iniciada').length,
      seg: horasDoGrupo(xs, periodo), media: media(conc), pausado: horasDoGrupo(xs, periodo, 'pausada'), pausas: xs.reduce((s, x) => s + x.pausas.length, 0),
    };
  }).sort((a, b) => b.seg - a.seg || a.nome.localeCompare(b.nome, 'pt-BR'));

  const dias = [...new Set(Object.values(diasPorPessoa).flatMap(d => Object.keys(d)))].filter(d => noPeriodo(d, periodo)).sort().reverse();
  const porDia = dias.map(dia => {
    const linha: Record<string, any> = { dia, total: 0 };
    porPessoa.forEach(p => { linha[p.nome] = diasPorPessoa[p.nome]?.[dia] || 0; linha.total += linha[p.nome]; });
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
    const fimTarefa = x.t.data_inicio ? fimDaTarefa(x.t, agora) : agora;
    (x.t.pausas || []).forEach((p: any) => {
      if (!p.pausado_em) return;
      const k = String(p.motivo || '—').trim();
      if (!acc[k]) acc[k] = { motivo: k, vezes: 0, seg: 0 };
      if (x.pausas.includes(p)) acc[k].vezes++;
      const pi = Math.max(new Date(p.pausado_em).getTime(), inicioPeriodo);
      const pf = Math.min(p.retomado_em ? new Date(p.retomado_em).getTime() : fimTarefa, fimPeriodo);
      acc[k].seg += segundosUteis(new Date(pi), new Date(pf));
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
      <div class="sub">${dataBr(periodo.de)} a ${dataBr(periodo.ate)} · ${esc(pessoa || 'equipe inteira')} · horas úteis (seg–sex 8:00–17:45), sem as pausas</div>
      <p>Horas trabalhadas: <b>${fmtHoras(totalSeg)}</b> · Tarefas: ${itens.length} (${concluidas.length} concluídas no período) · Média por tarefa concluída: ${fmtHoras(media(concluidas))} · Média por OP: ${fmtHoras(mediaPorOp)} · Em pausa: ${fmtHoras(totalPausado)}</p>
      <h2>Por pessoa</h2>${tabela(['Pessoa', 'Tarefas', 'Concluídas', 'Em aberto', 'Horas', 'Média/tarefa', 'Em pausa'], porPessoa.map(p => [p.nome, p.tarefas, p.concluidas, p.abertas, fmtHoras(p.seg), fmtHoras(p.media), fmtHoras(p.pausado)]))}
      <h2>Horas por dia</h2>${tabela(['Dia', ...porPessoa.map(p => p.nome), 'Total'], porDia.map(l => [dataBr(l.dia), ...porPessoa.map(p => fmtHoras(l[p.nome])), fmtHoras(l.total)]))}
      <h2>Horas por OP</h2>${tabela(['OP', 'Cliente', 'Tarefas', 'Horas', 'Pessoas'], porOp.map(o => [o.nome, o.cliente, o.tarefas, fmtHoras(o.seg), [...o.pessoas].join(', ')]))}
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
          Horas úteis: segunda a sexta, 8:00–17:45, sem as pausas. Entram as tarefas criadas no período ou em execução em algum momento dele.
        </div>
      </div>

      <div className="acn-kpis">
        {kpi('Horas trabalhadas', fmtHoras(totalSeg), 'horas úteis no período', 'var(--acn-brand)')}
        {kpi('Tarefas', itens.length, `${concluidas.length} concluídas · ${itens.filter(x => x.aberta).length} em aberto`, 'var(--acn-info)')}
        {kpi('Média por tarefa', fmtHoras(media(concluidas)), 'das concluídas no período', 'var(--acn-ok)')}
        {kpi('Tempo em pausa', fmtHoras(totalPausado), `${nPausas} pausa(s) no período`, 'var(--acn-warn)')}
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por pessoa</span></div>
        <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
          {porPessoa.length === 0 ? vazio : (
            <table className="acn-tabela">
              <thead><tr><th>Pessoa</th><th style={direita}>Tarefas</th><th style={direita}>Concluídas</th><th style={direita}>Em aberto</th><th style={direita}>Não iniciadas</th><th style={direita}>Horas</th><th style={direita}>Média/tarefa</th><th style={direita}>Em pausa</th></tr></thead>
              <tbody>
                {porPessoa.map(p => (
                  <tr key={p.nome}>
                    <td className="acn-forte">{p.nome}</td>
                    <td className="acn-num" style={direita}>{p.tarefas}</td>
                    <td className="acn-num" style={direita}>{p.concluidas}</td>
                    <td className="acn-num" style={direita}>{p.abertas}</td>
                    <td className="acn-num" style={direita}>{p.naoIniciadas}</td>
                    <td className="acn-num acn-forte" style={direita}>{fmtHoras(p.seg)}</td>
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
              <thead><tr><th>Dia</th>{porPessoa.map(p => <th key={p.nome} style={direita}>{p.nome}</th>)}<th style={direita}>Total</th></tr></thead>
              <tbody>
                {porDia.map(l => (
                  <tr key={l.dia}>
                    <td className="acn-num">{new Date(l.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    {porPessoa.map(p => <td key={p.nome} className="acn-num" style={direita}>{fmtHoras(l[p.nome])}</td>)}
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

  const buscar = async () => {
    if (!de || !ate || de > ate) { alert('Período inválido: a data inicial precisa ser igual ou anterior à final.'); return; }
    setCarregando(true);
    const { tarefas, error } = await buscarTarefasDoPeriodo(de, ate);
    if (error) { setCarregando(false); alert('Não foi possível carregar as tarefas: ' + error.message); return; }
    // quem não é gerente/admin vê só as tarefas em que é o responsável
    const meusNomes = gestor ? [] : await nomesDoUsuario(currentUser);
    setDados(tarefas.filter(t => gestor || mesmaPessoa(t.responsavel_nome, meusNomes)));
    setPeriodo({ de, ate }); setAgora(Date.now());
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, []);

  const pessoasRel = [...new Set(doPeriodo.map(nomeResp))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // horas úteis com a mesma conta do relatório gerencial
  const itens = horasDasTarefas(doPeriodo.filter(t => !pessoa || nomeResp(t) === pessoa), periodo, agora);
  const concluidas = itens.filter(x => x.concluidaNoPeriodo);
  const tempoTotal = horasDoGrupo(itens, periodo);
  const porResponsavel = [...new Set(itens.map(x => nomeResp(x.t)))].map(nome => {
    const xs = itens.filter(x => nomeResp(x.t) === nome);
    return { nome, total: xs.length, concluidas: xs.filter(x => x.concluidaNoPeriodo).length, seg: horasDoGrupo(xs, periodo) };
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
            Horas úteis: segunda a sexta, 8:00–17:45, sem as pausas. Entram as tarefas criadas no período ou em execução em algum momento dele.
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
              <thead><tr><th>Responsável</th><th>Tarefas</th><th>Concluídas</th><th>Horas</th></tr></thead>
              <tbody>
                {porResponsavel.map(v => (
                  <tr key={v.nome}>
                    <td>{v.nome}</td><td>{v.total}</td><td>{v.concluidas}</td><td>{fmtHoras(v.seg)}</td>
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
export default function HorasTarefasTab({ currentUser }: { currentUser: any }) {
  const [aba, setAba] = useState<'tarefas' | 'relatorio' | 'gerencial'>('tarefas');
  const gestor = ehGestorEngenharia(currentUser);
  const [operador, setOperador] = useState('');
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'nao_iniciada' | 'em_andamento' | 'pausada' | 'concluida'>('todas');
  const [busca, setBusca] = useState('');
  const [modalNova, setModalNova] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('engenharia_horas_tarefas').select('*').order('criado_em', { ascending: false });
    setTarefas(data || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);
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
        {gestor && (
          <button style={{ flex: 1, padding: '8px', background: aba === 'gerencial' ? '#1e293b' : 'white', color: aba === 'gerencial' ? 'white' : '#1e293b', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
            onClick={() => setAba('gerencial')}>📈 Relatório gerencial</button>
        )}
      </div>

      {aba === 'gerencial' && gestor ? <RelatorioGerencial /> : aba === 'relatorio' ? <RelatorioHoras currentUser={currentUser} /> : (
        <>
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
                      <LinhaTarefa key={t.id} tarefa={t} agora={tick} onAtualizado={carregar} currentUser={currentUser} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {modalNova && (
        <ModalNovaTarefa currentUser={currentUser} onClose={() => setModalNova(false)}
          onCriado={() => { setModalNova(false); carregar(); }} />
      )}
    </div>
  );
}
