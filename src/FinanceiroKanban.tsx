// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO — KANBAN DE TAREFAS
//
// Pedido do usuário em 24/09/2026: um quadro por etapas (A Fazer → Em
// Andamento → Concluído), com responsável e aviso de vencimento — no mesmo
// espírito do sistema de avisos do Compras (ver ComprasFluxo.tsx:
// calcularAlertasCompras/JanelaParadasObrigatoria), mas com prazos próprios:
//
//   • 1 dia antes de vencer   → aviso informativo ("vence amanhã")
//   • no dia do vencimento    → aviso informativo ("vence hoje")
//   • depois de vencida       → aviso OBRIGATÓRIO: motivo do atraso + nova
//                                data de conclusão, numa janela que não fecha
//                                sozinha (só depois de responder cada uma)
//
// O quadro inteiro é visível pra quem tem a aba Financeiro — é um controle de
// equipe, não uma caixa de entrada pessoal. Só os avisos (e a trava) são por
// responsável.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { ColaboradorSelect } from './ColaboradorSelect';
import { confirmar } from './Feedback';
import { Faixa, Botao } from './Interface';

const ETAPAS = ['A Fazer', 'Em Andamento', 'Concluído'];
const COR_ETAPA = { 'A Fazer': '#64748b', 'Em Andamento': '#2563eb', 'Concluído': '#16a34a' };

// ─────────────────────────────────────────────────────────────────────────────
// TAREFA QUE SE REPETE (28/09/2026)
//
// O que o Financeiro faz é, em boa parte, trabalho de calendário: guia todo
// mês, conciliação toda semana, balanço todo ano. Cadastrar de novo a cada vez
// dava trabalho e era o que fazia esquecer.
//
// A próxima ocorrência nasce QUANDO A ATUAL É CONCLUÍDA, e não por um relógio
// rodando no servidor. Duas razões: não existe tarefa repetida acumulando na
// fila enquanto ninguém fez a anterior, e a data da próxima parte do vencimento
// combinado, não do dia em que alguém lembrou.
//
// O responsável é herdado, e pode ser trocado em qualquer ocorrência sem
// quebrar a corrente — era o pedido: "deixando o mesmo responsável ou podendo
// alterar depois de um tempo se necessário".
// ─────────────────────────────────────────────────────────────────────────────
export const RECORRENCIAS = [
  { valor: '',          rotulo: 'Não se repete' },
  { valor: 'diaria',    rotulo: 'Todo dia',        dias: 1 },
  { valor: 'semanal',   rotulo: 'Toda semana',     dias: 7 },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias',  dias: 15 },
  { valor: 'mensal',    rotulo: 'Todo mês',        meses: 1 },
  { valor: 'anual',     rotulo: 'Todo ano',        meses: 12 },
];
export const rotuloRecorrencia = (v) => RECORRENCIAS.find(r => r.valor === v)?.rotulo || '';

/**
 * Data da próxima ocorrência.
 *
 * Mês e ano andam por mês, não por 30 dias: a guia do dia 20 cai sempre no 20.
 * Quando o dia não existe no mês de destino (31 de janeiro → fevereiro), cai no
 * último dia do mês, que é o que qualquer calendário faz.
 */
export function proximaData(dataISO, recorrencia) {
  const r = RECORRENCIAS.find(x => x.valor === recorrencia);
  if (!r || (!r.dias && !r.meses)) return null;
  const base = new Date(String(dataISO || hojeISO()).slice(0, 10) + 'T12:00:00');
  if (r.dias) { base.setDate(base.getDate() + r.dias); return base.toLocaleDateString('sv-SE'); }
  const dia = base.getDate();
  const alvo = new Date(base.getFullYear(), base.getMonth() + r.meses, 1, 12, 0, 0);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, ultimo));
  return alvo.toLocaleDateString('sv-SE');
}

const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const diasAte = (dataISO) => {
  if (!dataISO) return null;
  const hoje = new Date(hojeISO() + 'T12:00:00');
  const alvo = new Date(String(dataISO).slice(0, 10) + 'T12:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};
const fmtDt = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

/** Avisos calculados a partir das tarefas ainda não concluídas. */
export function calcularAvisosFinanceiro(tarefas) {
  const avisos = [];
  for (const t of tarefas) {
    if (t.etapa === 'Concluído' || !t.data_vencimento) continue;
    const dias = diasAte(t.data_vencimento);
    if (dias === 1) avisos.push({ tipo: 'amanha', tarefa: t, dias });
    else if (dias === 0) avisos.push({ tipo: 'hoje', tarefa: t, dias });
    else if (dias < 0) avisos.push({ tipo: 'vencida', tarefa: t, dias: -dias });
  }
  return avisos;
}

const avisosDoUsuario = (avisos, u) =>
  avisos.filter(a => a.tarefa.responsavel_nome && a.tarefa.responsavel_nome === u?.nome);

// ─── Cartão de justificativa (aviso obrigatório de tarefa vencida) ────────────
function CartaoVencida({ tarefa, currentUser, onResolvida }) {
  const [motivo, setMotivo] = useState('');
  const [novaData, setNovaData] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo do atraso.'); return; }
    if (!novaData) { alert('Informe a nova data de conclusão.'); return; }
    if (novaData < hojeISO()) { alert('A nova data não pode ser no passado.'); return; }
    setSalvando(true);
    const patch = {
      data_vencimento: novaData,
      atraso_motivo: motivo.trim(),
      atraso_registrado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    const { error } = await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
      oldRow: { data_vencimento: tarefa.data_vencimento }, newRow: patch, user: currentUser });
    onResolvida?.();
  };

  return (
    <div style={{ border: '1px solid #fca5a5', borderLeft: '3px solid #dc2626', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{tarefa.titulo}</div>
      <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2, fontWeight: 700 }}>
        Venceu em {fmtDt(tarefa.data_vencimento)} — {diasAte(tarefa.data_vencimento) * -1} dia(s) de atraso
      </div>
      <textarea className="acn-input" rows={2} style={{ width: '100%', marginTop: 6, resize: 'vertical', boxSizing: 'border-box' }}
        placeholder="Motivo do atraso *" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 9, fontWeight: 700, color: '#475569' }}>Nova data de conclusão *</label>
        <input type="date" className="acn-input" style={{ width: 150 }} min={hojeISO()}
          value={novaData} onChange={e => setNovaData(e.target.value)} />
        <button onClick={salvar} disabled={salvando}
          style={{ marginLeft: 'auto', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5,
            padding: '6px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {salvando ? 'Salvando...' : 'Registrar e replanejar'}
        </button>
      </div>
    </div>
  );
}

/** Janela bloqueada: não fecha sozinha enquanto sobrar tarefa vencida do usuário. */
function JanelaVencidasObrigatoria({ tarefas, currentUser, onMudou }) {
  const minhas = avisosDoUsuario(calcularAvisosFinanceiro(tarefas), currentUser).filter(a => a.tipo === 'vencida');
  if (!minhas.length) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, width: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title" style={{ color: '#dc2626' }}>
          ⚠️ {minhas.length} tarefa(s) sua(s) vencida(s) no Financeiro
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          Antes de continuar, registre o motivo do atraso e uma nova data de conclusão de cada uma.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {minhas.map(a => <CartaoVencida key={a.tarefa.id} tarefa={a.tarefa} currentUser={currentUser} onResolvida={onMudou} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Painel de avisos (informativo — amanhã / hoje / vencidas de todo mundo) ──
function PainelAvisos({ tarefas, currentUser, isAdmin, onClose }) {
  const todos = calcularAvisosFinanceiro(tarefas);
  const meus = avisosDoUsuario(todos, currentUser);
  const listaBase = isAdmin ? todos : meus;
  const porTipo = (tipo) => listaBase.filter(a => a.tipo === tipo);
  const LABEL = { amanha: 'Vencem amanhã', hoje: 'Vencem hoje', vencida: 'Vencidas' };
  const COR = { amanha: '#b45309', hoje: '#b45309', vencida: '#dc2626' };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.35)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 440, maxWidth: '100vw', height: '100%', background: '#f8fafc',
        boxShadow: '-4px 0 20px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Avisos — Financeiro</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {isAdmin ? 'Toda a equipe' : 'Suas tarefas'} · {listaBase.length ? `${listaBase.length} aviso(s)` : 'nada pendente'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listaBase.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 20 }}>Nada por aqui.</div>
          )}
          {['vencida', 'hoje', 'amanha'].map(tipo => porTipo(tipo).length > 0 && (
            <div key={tipo}>
              <div style={{ fontSize: 10, fontWeight: 800, color: COR[tipo], textTransform: 'uppercase', marginBottom: 4 }}>{LABEL[tipo]}</div>
              {porTipo(tipo).map(a => (
                <div key={a.tarefa.id} style={{ border: '1px solid #e2e8f0', borderLeft: `3px solid ${COR[tipo]}`, borderRadius: 6,
                  padding: '6px 10px', background: '#fff', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{a.tarefa.titulo}</div>
                  <div style={{ fontSize: 9, color: '#64748b' }}>
                    {a.tarefa.responsavel_nome || 'sem responsável'} · vencimento {fmtDt(a.tarefa.data_vencimento)}
                    {tipo === 'vencida' ? ` · ${a.dias} dia(s) de atraso` : ''}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Anexos da tarefa ───────────────────────────────────────────────────────
// Mesmo caminho do resto do sistema: arquivo no bucket `acn-media`, a linha em
// `financeiro_tarefa_anexos` guardando nome, url e quem subiu. O que circula
// numa tarefa do Financeiro é boleto, guia e comprovante — ia por fora e se
// perdia (28/09/2026).
function AnexosTarefaFinanceiro({ tarefaId, currentUser }) {
  const [lista, setLista] = useState([]);
  const [subindo, setSubindo] = useState(false);
  const entrada = useRef(null);

  // Etapa 7.48 (06/10/2026): leitura que falha não pode parecer "Anexos (0)" — a pessoa
  // acharia que o boleto não foi anexado e subiria de novo.
  const [erroLeitura, setErroLeitura] = useState('');
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('financeiro_tarefa_anexos')
      .select('*').eq('tarefa_id', tarefaId).order('criado_em', { ascending: false });
    if (error) { setErroLeitura(error.message); return; }
    setErroLeitura('');
    setLista(data || []);
  }, [tarefaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeSeguro = (nome) => {
    const p = nome.lastIndexOf('.');
    const ext = p >= 0 ? nome.slice(p).toLowerCase() : '';
    const base = (p >= 0 ? nome.slice(0, p) : nome)
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
    return `${Date.now()}-${base || 'arquivo'}${ext}`;
  };

  const subir = async (e) => {
    const arquivos = [...(e.target.files || [])];
    if (!arquivos.length) return;
    setSubindo(true);
    for (const f of arquivos) {
      const caminho = `financeiro-tarefas/${tarefaId}/${nomeSeguro(f.name)}`;
      const { error } = await supabase.storage.from('acn-media').upload(caminho, f, { upsert: false });
      if (error) { alert(`Não subiu "${f.name}": ${error.message}`); continue; }
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(caminho);
      // 7.48: se a linha não grava, o arquivo subiu mas não aparece na lista — a pessoa precisa saber
      const { error: erroLinha } = await supabase.from('financeiro_tarefa_anexos').insert([{
        tarefa_id: tarefaId, nome: f.name, url: pub.publicUrl, tamanho: f.size,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]);
      if (erroLinha) alert(`"${f.name}" subiu, mas não foi registrado na tarefa: ${erroLinha.message}`);
    }
    setSubindo(false);
    if (entrada.current) entrada.current.value = '';
    carregar();
  };

  // apagar é de quem anexou e de quem vê o quadro inteiro — quem subiu sabe se
  // errou o arquivo, os outros não (mesma regra dos anexos de Engenharia)
  const apagar = async (a) => {
    if (!await confirmar(`Apagar o anexo "${a.nome}"?`)) return;
    const { error } = await supabase.from('financeiro_tarefa_anexos').delete().eq('id', a.id);
    if (error) { alert('Não foi possível apagar o anexo: ' + error.message); return; }
    carregar();
  };
  const fmtTam = (n) => {
    const b = Number(n) || 0;
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  return (
    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 9, marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
        Anexos ({lista.length})
      </label>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
          Não foi possível ler os anexos desta tarefa ({erroLeitura}).
        </Faixa>
      )}
      {lista.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, marginBottom: 3 }}>
          <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: '#0f766e', textDecoration: 'none' }}>
            📎 {a.nome} <span style={{ color: '#94a3b8' }}>{fmtTam(a.tamanho)}</span>
          </a>
          <span style={{ fontSize: 8.5, color: '#94a3b8' }}>{a.criado_por_nome}</span>
          {a.criado_por === currentUser?.email && (
            <button onClick={() => apagar(a)} title="Apagar"
              style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 10 }}>✕</button>
          )}
        </div>
      ))}
      <input ref={entrada} type="file" multiple onChange={subir} disabled={subindo}
        style={{ fontSize: 10, marginTop: 5 }} />
      {subindo && <div style={{ fontSize: 9, color: '#0f766e' }}>Subindo...</div>}
    </div>
  );
}

// ─── Modal de nova tarefa / edição ─────────────────────────────────────────────
function ModalTarefa({ tarefa, tipos = [], currentUser, onClose, onSalvo }) {
  const editando = !!tarefa?.id;
  const [titulo, setTitulo] = useState(tarefa?.titulo || '');
  const [descricao, setDescricao] = useState(tarefa?.descricao || '');
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel_nome || '');
  const [vencimento, setVencimento] = useState(tarefa?.data_vencimento || '');
  const [tipoId, setTipoId] = useState(tarefa?.tipo_id || '');
  const [recorrencia, setRecorrencia] = useState(tarefa?.recorrencia || '');
  const [recAtiva, setRecAtiva] = useState(tarefa?.recorrencia_ativa !== false);
  const [salvando, setSalvando] = useState(false);
  // diário da tarefa: cada anotação fica com quem escreveu e quando
  const [obs, setObs] = useState(Array.isArray(tarefa?.observacoes) ? tarefa.observacoes : []);
  const [novaObs, setNovaObs] = useState('');

  const anotar = async () => {
    const texto = novaObs.trim();
    if (!texto || !editando) return;
    const lista = [...obs, { texto, usuario: currentUser?.nome || '—', hora: new Date().toISOString() }];
    const { error } = await supabase.from('financeiro_tarefas')
      .update({ observacoes: lista, atualizado_em: new Date().toISOString() }).eq('id', tarefa.id);
    if (error) { alert('Não foi possível anotar: ' + error.message); return; }
    setObs(lista); setNovaObs('');
  };

  const salvar = async () => {
    if (!titulo.trim()) { alert('Informe o título da tarefa.'); return; }
    if (recorrencia && !vencimento) {
      alert('Tarefa que se repete precisa de vencimento: é dele que sai a data da próxima.'); return;
    }
    setSalvando(true);
    const comum = {
      titulo: titulo.trim(), descricao: descricao.trim() || null,
      responsavel_nome: responsavel.trim() || null, data_vencimento: vencimento || null,
      tipo_id: tipoId || null, recorrencia: recorrencia || null,
      recorrencia_ativa: recorrencia ? recAtiva : true,
    };
    if (editando) {
      const patch = { ...comum, atualizado_em: new Date().toISOString() };
      const { error } = await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
      setSalvando(false);
      if (error) { alert('Não foi possível salvar: ' + error.message); return; }
      logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
        oldRow: tarefa, newRow: { ...tarefa, ...patch }, user: currentUser });
    } else {
      const { error } = await supabase.from('financeiro_tarefas').insert([{
        ...comum, etapa: 'A Fazer', observacoes: [],
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]);
      setSalvando(false);
      if (error) { alert('Não foi possível criar: ' + error.message); return; }
    }
    onSalvo();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 460, width: '95vw' }}>
        <div className="modal-title">{editando ? 'Editar tarefa' : '+ Nova tarefa'}</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Título *</label>
          <input className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }} value={titulo}
            onChange={e => setTitulo(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Descrição</label>
          <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
            value={descricao} onChange={e => setDescricao(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Responsável</label>
            <ColaboradorSelect value={responsavel} onChange={setResponsavel} incluirUsuariosDaAba="financeiro" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Vencimento</label>
            <input type="date" className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={vencimento || ''} onChange={e => setVencimento(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Tipo</label>
            <select className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={tipoId} onChange={e => setTipoId(e.target.value)}>
              <option value="">— sem tipo —</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Repete</label>
            <select className="acn-input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={recorrencia} onChange={e => setRecorrencia(e.target.value)}>
              {RECORRENCIAS.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
          </div>
        </div>

        {recorrencia && (
          <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 6, padding: '7px 10px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#0f766e' }}>
              Ao concluir esta tarefa, a próxima nasce sozinha
              {vencimento ? <> para <b>{fmtDt(proximaData(vencimento, recorrencia))}</b></> : null},
              com o mesmo responsável. Dá para trocar o responsável em qualquer ocorrência.
            </div>
            {editando && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 10, cursor: 'pointer', color: '#0f766e' }}>
                <input type="checkbox" checked={recAtiva} onChange={e => setRecAtiva(e.target.checked)} />
                Continuar repetindo — desmarque para encerrar a corrente depois desta
              </label>
            )}
          </div>
        )}

        {/* Observações e anexos só depois que a tarefa existe: precisam do id */}
        {editando && (
          <>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 9, marginBottom: 9 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Observações ({obs.length})
              </label>
              <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 6 }}>
                {obs.length === 0 && <div style={{ fontSize: 10, color: '#94a3b8' }}>Nenhuma anotação ainda.</div>}
                {obs.map((o, i) => (
                  <div key={i} style={{ fontSize: 10, borderLeft: '2px solid #e2e8f0', paddingLeft: 7, marginBottom: 5 }}>
                    <div style={{ color: '#0f172a' }}>{o.texto}</div>
                    <div style={{ fontSize: 8.5, color: '#94a3b8' }}>
                      {o.usuario} · {o.hora ? new Date(o.hora).toLocaleString('pt-BR') : ''}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="acn-input" style={{ flex: 1 }} value={novaObs}
                  onChange={e => setNovaObs(e.target.value)} onKeyDown={e => e.key === 'Enter' && anotar()}
                  placeholder="anotar alguma coisa nesta tarefa" />
                <button onClick={anotar} disabled={!novaObs.trim()}
                  style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 5,
                    padding: '6px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Anotar</button>
              </div>
            </div>
            <AnexosTarefaFinanceiro tarefaId={tarefa.id} currentUser={currentUser} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #d1d5db',
            borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ background: '#0f766e', color: '#fff', border: 'none',
            borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tipos de tarefa — cadastrados pelo próprio setor ───────────────────────
// Sem isto, "tipo" viraria texto livre e cada pessoa escreveria de um jeito.
function ModalTiposTarefa({ tipos, currentUser, onClose, onMudou }) {
  const [novo, setNovo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const criar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    setSalvando(true);
    const { error } = await supabase.from('financeiro_tipos_tarefa')
      .insert([{ nome, criado_por_nome: currentUser?.nome }]);
    setSalvando(false);
    if (error) { alert(/duplicat|unique/i.test(error.message) ? `Já existe um tipo "${nome}".` : error.message); return; }
    setNovo(''); onMudou();
  };
  // desligar em vez de apagar: tarefa antiga continua sabendo o seu tipo
  const desligar = async (t) => {
    if (!await confirmar(`Tirar "${t.nome}" da lista? As tarefas que já usam continuam como estão.`)) return;
    const { error } = await supabase.from('financeiro_tipos_tarefa').update({ ativo: false }).eq('id', t.id);
    if (error) { alert('Não foi possível tirar o tipo: ' + error.message); return; }
    onMudou();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 420, width: '95vw' }}>
        <div className="modal-title">🏷️ Tipos de tarefa do Financeiro</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Guia, conciliação, folha, balanço — o que o setor precisar. Serve para agrupar e achar depois.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input className="acn-input" style={{ flex: 1 }} value={novo} autoFocus
            onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()}
            placeholder="ex.: Guia de imposto" />
          <button onClick={criar} disabled={salvando || !novo.trim()}
            style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 5,
              padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Adicionar</button>
        </div>
        {tipos.length === 0
          ? <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Nenhum tipo cadastrado ainda.</div>
          : tipos.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ flex: 1, fontSize: 11 }}>{t.nome}</span>
              <button onClick={() => desligar(t)} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
                border: '1px solid #fca5a5', borderRadius: 4, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>tirar</button>
            </div>
          ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #d1d5db',
            borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Agenda — as mesmas tarefas, na ordem do calendário ─────────────────────
// O quadro responde "em que pé está"; a agenda responde "o que vem primeiro".
function AgendaTarefas({ tarefas, nomeTipo, onEditar }) {
  const pendentes = tarefas.filter(t => t.etapa !== 'Concluído' && t.data_vencimento)
    .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)));
  const semData = tarefas.filter(t => t.etapa !== 'Concluído' && !t.data_vencimento);
  const grupos = new Map();
  for (const t of pendentes) {
    const mes = String(t.data_vencimento).slice(0, 7);
    if (!grupos.has(mes)) grupos.set(mes, []);
    grupos.get(mes).push(t);
  }
  const nomeMes = (m) => new Date(m + '-01T12:00:00')
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (!pendentes.length && !semData.length) {
    return <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 11 }}>Nada em aberto na agenda.</div>;
  }
  return (
    <div>
      {[...grupos.entries()].map(([mes, lista]) => (
        <div key={mes} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'capitalize', marginBottom: 6 }}>
            {nomeMes(mes)} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({lista.length})</span>
          </div>
          {lista.map(t => {
            const dias = diasAte(t.data_vencimento);
            const cor = dias < 0 ? '#dc2626' : dias <= 1 ? '#b45309' : '#64748b';
            return (
              <div key={t.id} onClick={() => onEditar(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#fff',
                  border: '1px solid #e2e8f0', borderLeft: `3px solid ${cor}`, borderRadius: 6, marginBottom: 5, cursor: 'pointer' }}>
                <div style={{ width: 62, fontSize: 10, fontWeight: 800, color: cor }}>{fmtDt(t.data_vencimento)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{t.titulo}</div>
                  <div style={{ fontSize: 9, color: '#64748b' }}>
                    {[nomeTipo(t.tipo_id), t.responsavel_nome, rotuloRecorrencia(t.recorrencia)].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: '#94a3b8' }}>{t.etapa}</span>
              </div>
            );
          })}
        </div>
      ))}
      {semData.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>Sem data marcada ({semData.length})</div>
          {semData.map(t => (
            <div key={t.id} onClick={() => onEditar(t)}
              style={{ padding: '6px 10px', background: '#fff', border: '1px dashed #e2e8f0', borderRadius: 6,
                marginBottom: 5, cursor: 'pointer', fontSize: 11 }}>
              {t.titulo} <span style={{ fontSize: 9, color: '#94a3b8' }}>· {t.responsavel_nome || 'sem responsável'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cartão do quadro ───────────────────────────────────────────────────────
function CartaoTarefa({ tarefa, tipo, onEditar, onMover, onExcluir, podeExcluir }) {
  const dias = diasAte(tarefa.data_vencimento);
  const vencida = tarefa.etapa !== 'Concluído' && dias != null && dias < 0;
  const urgente = tarefa.etapa !== 'Concluído' && dias != null && dias <= 1 && dias >= 0;
  const idx = ETAPAS.indexOf(tarefa.etapa);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${vencida ? '#dc2626' : urgente ? '#f59e0b' : COR_ETAPA[tarefa.etapa]}`,
      borderRadius: 6, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' }}
      onClick={() => onEditar(tarefa)}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#0f172a' }}>{tarefa.titulo}</div>
      {tarefa.descricao && <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{tarefa.descricao.slice(0, 90)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {tipo && (
          <span style={{ fontSize: 9, background: '#eef2ff', color: '#4338ca', borderRadius: 8, padding: '1px 7px', fontWeight: 700 }}>
            🏷️ {tipo}
          </span>
        )}
        {tarefa.recorrencia && (
          <span title={`Ao concluir, a próxima já nasce (${rotuloRecorrencia(tarefa.recorrencia).toLowerCase()})`}
            style={{ fontSize: 9, background: '#f0fdfa', color: '#0f766e', borderRadius: 8, padding: '1px 7px', fontWeight: 700 }}>
            🔁 {rotuloRecorrencia(tarefa.recorrencia)}
          </span>
        )}
        {tarefa.responsavel_nome && (
          <span style={{ fontSize: 9, background: '#f1f5f9', color: '#475569', borderRadius: 8, padding: '1px 7px' }}>
            👤 {tarefa.responsavel_nome}
          </span>
        )}
        {(tarefa.observacoes?.length > 0) && (
          <span style={{ fontSize: 9, color: '#64748b' }}>💬 {tarefa.observacoes.length}</span>
        )}
        {tarefa.data_vencimento && (
          <span style={{ fontSize: 9, fontWeight: 700, color: vencida ? '#dc2626' : urgente ? '#b45309' : '#64748b' }}>
            {vencida ? `⚠️ venceu ${fmtDt(tarefa.data_vencimento)}` : `📅 ${fmtDt(tarefa.data_vencimento)}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
        {idx > 0 && (
          <button onClick={() => onMover(tarefa, ETAPAS[idx - 1])}
            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
            ← {ETAPAS[idx - 1]}
          </button>
        )}
        {idx < ETAPAS.length - 1 && (
          <button onClick={() => onMover(tarefa, ETAPAS[idx + 1])}
            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', border: 'none', borderRadius: 4, background: COR_ETAPA[ETAPAS[idx + 1]], color: '#fff', cursor: 'pointer' }}>
            {ETAPAS[idx + 1]} →
          </button>
        )}
        {podeExcluir && (
          <button onClick={() => onExcluir(tarefa)}
            style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 8px', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function FinanceiroKanban({ currentUser }) {
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalTarefa, setModalTarefa] = useState(null); // {} = nova; objeto = editar
  const [painelAvisos, setPainelAvisos] = useState(false);
  const [tipos, setTipos] = useState([]);
  const [modalTipos, setModalTipos] = useState(false);
  const [vista, setVista] = useState('quadro');          // quadro | agenda
  const [filtroResp, setFiltroResp] = useState('');
  // QUEM VÊ O QUADRO INTEIRO (28/09/2026)
  //
  // O padrão passa a ser: cada um vê as tarefas de que é responsável. Quem
  // coordena o setor vê tudo — e isso é uma permissão POR PESSOA, marcada em
  // Administração, não um perfil fixo no código: quem coordena muda, e mudar
  // isso não pode exigir uma publicação nova.
  const [veTudo, setVeTudo] = useState(false);
  const isAdmin = veTudo;

  // Etapa 7.48 (06/10/2026): leitura que falha não pode parecer "nenhuma tarefa" nem "você só vê as suas".
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroPermissao, setErroPermissao] = useState('');

  useEffect(() => {
    if (!currentUser?.email) return;
    supabase.from('auth_usuarios').select('ve_todas_tarefas_financeiro,perfil')
      .eq('email', currentUser.email).maybeSingle()
      .then(({ data, error }) => {
        if (error) { setErroPermissao(error.message); return; }
        setErroPermissao('');
        setVeTudo(!!data?.ve_todas_tarefas_financeiro || data?.perfil === 'Admin');
      });
  }, [currentUser?.email]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: tp, error: erroTipos }] = await Promise.all([
      supabase.from('financeiro_tarefas').select('*').order('data_vencimento', { ascending: true, nullsFirst: false }),
      supabase.from('financeiro_tipos_tarefa').select('*').eq('ativo', true).order('nome'),
    ]);
    const falha = error || erroTipos;
    setErroLeitura(falha ? falha.message : '');
    // se a leitura falhou, fica o que já estava na tela em vez de esvaziar o quadro
    if (!error) setTarefas(data || []);
    if (!erroTipos) setTipos(tp || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // o recorte da vista: quem não vê tudo só enxerga o que é seu
  const visiveis = tarefas
    .filter(t => veTudo || (t.responsavel_nome && t.responsavel_nome === currentUser?.nome))
    .filter(t => !filtroResp || t.responsavel_nome === filtroResp);
  const responsaveis = [...new Set(tarefas.map(t => t.responsavel_nome).filter(Boolean))].sort();
  const nomeTipo = (id) => tipos.find(t => t.id === id)?.nome || '';

  // 7.48: um clique duplo em "Concluído →" de uma tarefa que se repete criava DUAS próximas
  // ocorrências (o cartão só muda de coluna depois da resposta do banco). Uma tarefa por vez.
  const movendo = useRef(new Set());

  const mover = async (tarefa, novaEtapa) => {
    if (movendo.current.has(tarefa.id)) return;
    movendo.current.add(tarefa.id);
    try {
      await moverTarefa(tarefa, novaEtapa);
    } finally {
      movendo.current.delete(tarefa.id);
    }
  };

  const moverTarefa = async (tarefa, novaEtapa) => {
    const patch = { etapa: novaEtapa, atualizado_em: new Date().toISOString(),
      ...(novaEtapa === 'Concluído' ? { concluido_em: new Date().toISOString() } : {}) };
    const { error: erroMover } = await supabase.from('financeiro_tarefas').update(patch).eq('id', tarefa.id);
    // 7.48: gravação recusada seguia como se tivesse movido (o cartão trocava de coluna só na tela)
    if (erroMover) { alert('Não foi possível mover a tarefa: ' + erroMover.message); return; }
    logChange({ module: 'financeiro', entityType: 'financeiro_tarefas', entityId: tarefa.id, changeType: 'UPDATE',
      oldRow: { etapa: tarefa.etapa }, newRow: patch, user: currentUser });
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, ...patch } : t));

    // concluiu uma tarefa que se repete: a próxima já nasce, com o mesmo
    // responsável e o vencimento andado pelo período
    if (novaEtapa === 'Concluído' && tarefa.recorrencia && tarefa.recorrencia_ativa !== false) {
      const venc = proximaData(tarefa.data_vencimento, tarefa.recorrencia);
      const { error } = await supabase.from('financeiro_tarefas').insert([{
        titulo: tarefa.titulo, descricao: tarefa.descricao, etapa: 'A Fazer',
        tipo_id: tarefa.tipo_id || null,
        responsavel_nome: tarefa.responsavel_nome, responsavel_email: tarefa.responsavel_email,
        data_vencimento: venc, recorrencia: tarefa.recorrencia, recorrencia_ativa: true,
        gerada_de_id: tarefa.id,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
        observacoes: [],
      }]);
      if (error) alert('A tarefa foi concluída, mas a próxima ocorrência não pôde ser criada: ' + error.message);
      else { carregar(); alert(`Tarefa concluída. A próxima "${tarefa.titulo}" já está no quadro, para ${fmtDt(venc)}.`); }
    }
  };

  const excluir = async (tarefa) => {
    if (!await confirmar(`Excluir a tarefa "${tarefa.titulo}"?`)) return;
    const { error } = await supabase.from('financeiro_tarefas').delete().eq('id', tarefa.id);
    if (error) { alert('Não foi possível excluir a tarefa: ' + error.message); return; }
    setTarefas(prev => prev.filter(t => t.id !== tarefa.id));
  };

  const meusAvisos = avisosDoUsuario(calcularAvisosFinanceiro(tarefas), currentUser);
  const totalAvisos = isAdmin ? calcularAvisosFinanceiro(visiveis).length : meusAvisos.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>📋 Tarefas do Financeiro</div>
        <span style={{ fontSize: 10, color: '#64748b', flex: 1 }}>
          {veTudo ? 'você vê o quadro inteiro' : 'você vê as tarefas de que é responsável'}
        </span>
        {veTudo && responsaveis.length > 1 && (
          <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)} aria-label="Filtrar por responsável"
            style={{ fontSize: 10, padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 6 }}>
            <option value="">Responsável: todos</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <button onClick={() => setVista(v => v === 'quadro' ? 'agenda' : 'quadro')}
          style={{ background: '#fff', color: '#475569', border: '1px solid #d1d5db', borderRadius: 6,
            padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {vista === 'quadro' ? '📅 Agenda' : '📋 Quadro'}
        </button>
        <button onClick={() => setModalTipos(true)}
          style={{ background: '#fff', color: '#475569', border: '1px solid #d1d5db', borderRadius: 6,
            padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          🏷️ Tipos
        </button>
        <button onClick={() => setPainelAvisos(true)}
          style={{ background: totalAvisos ? '#fef3c7' : '#fff', color: totalAvisos ? '#b45309' : '#475569',
            border: `1px solid ${totalAvisos ? '#fcd34d' : '#d1d5db'}`, borderRadius: 6, padding: '6px 12px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          🔔 Avisos{totalAvisos ? ` (${totalAvisos})` : ''}
        </button>
        <button onClick={() => setModalTarefa({})}
          style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + Nova tarefa
        </button>
      </div>

      {(erroLeitura || erroPermissao) && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
          {erroLeitura
            ? `Não foi possível carregar as tarefas (${erroLeitura}). O quadro pode estar incompleto.`
            : `Não foi possível conferir a sua permissão (${erroPermissao}). Você pode estar vendo só as suas tarefas.`}
        </Faixa>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Carregando...</div>
      ) : vista === 'agenda' ? (
        <AgendaTarefas tarefas={visiveis} nomeTipo={nomeTipo} onEditar={setModalTarefa} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, 1fr)`, gap: 12 }}>
          {ETAPAS.map(etapa => {
            const doEtapa = visiveis.filter(t => t.etapa === etapa);
            return (
              <div key={etapa} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, minHeight: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: COR_ETAPA[etapa] }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>{etapa}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>({doEtapa.length})</span>
                </div>
                {doEtapa.length === 0 && <div style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', padding: 10 }}>Vazio</div>}
                {doEtapa.map(t => (
                  <CartaoTarefa key={t.id} tarefa={t} tipo={nomeTipo(t.tipo_id)} onEditar={setModalTarefa}
                    onMover={mover} onExcluir={excluir} podeExcluir={isAdmin} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {modalTipos && <ModalTiposTarefa tipos={tipos} currentUser={currentUser}
        onClose={() => setModalTipos(false)} onMudou={carregar} />}
      {modalTarefa && (
        <ModalTarefa tarefa={modalTarefa.id ? modalTarefa : null} tipos={tipos} currentUser={currentUser}
          onClose={() => setModalTarefa(null)}
          onSalvo={() => { setModalTarefa(null); carregar(); }} />
      )}
      {painelAvisos && (
        <PainelAvisos tarefas={tarefas} currentUser={currentUser} isAdmin={isAdmin} onClose={() => setPainelAvisos(false)} />
      )}
      {!loading && <JanelaVencidasObrigatoria tarefas={tarefas} currentUser={currentUser} onMudou={carregar} />}
    </div>
  );
}
