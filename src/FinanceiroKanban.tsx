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
import { Faixa, Botao, Selo, Tag } from './Interface';
import Icone from './Icone';
import {
  mdiClipboardTextOutline, mdiCalendarMonthOutline, mdiTagOutline, mdiBellOutline, mdiRepeat,
  mdiAccountOutline, mdiCommentOutline, mdiCalendarOutline, mdiAlertOutline, mdiArrowLeft, mdiArrowRight,
  mdiTrashCanOutline, mdiPaperclip, mdiClose,
} from '@mdi/js';

const ETAPAS = ['A Fazer', 'Em Andamento', 'Concluído'];
// Etapa 12e11 (06/10/2026): a cor de cada coluna sai do guia (uma família por etapa), não mais de hex escrito à mão.
const FAMILIA_ETAPA = { 'A Fazer': 'neutro', 'Em Andamento': 'info', 'Concluído': 'ok' };

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
    <div className="acn-quadro tom-erro">
      <div className="acn-kb-nome">{tarefa.titulo}</div>
      <div className="acn-txt-erro">
        Venceu em {fmtDt(tarefa.data_vencimento)} — {diasAte(tarefa.data_vencimento) * -1} dia(s) de atraso
      </div>
      <textarea className="acn-input acn-kb-largo" rows={2} aria-label="Motivo do atraso"
        placeholder="Motivo do atraso *" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <div className="acn-kb-linha">
        <label className="acn-label" htmlFor={`kb-nova-${tarefa.id}`}>Nova data de conclusão *</label>
        <input id={`kb-nova-${tarefa.id}`} type="date" className="acn-input acn-kb-data" min={hojeISO()}
          value={novaData} onChange={e => setNovaData(e.target.value)} />
        <Botao variante="perigo" onClick={salvar} disabled={salvando} className="acn-kb-empurra">
          {salvando ? 'Salvando...' : 'Registrar e replanejar'}
        </Botao>
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
      <div className="modal-box acn-modal-cadastro acn-kb-jan acn-kb-jan-vencidas" role="dialog" aria-label="Tarefas vencidas">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiAlertOutline} size={16} /> {minhas.length} tarefa(s) sua(s) vencida(s) no Financeiro</span>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">
            Antes de continuar, registre o motivo do atraso e uma nova data de conclusão de cada uma.
          </div>
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
  const FAMILIA = { amanha: 'atencao', hoje: 'atencao', vencida: 'erro' };
  return (
    <div className="acn-kb-lateral" role="dialog" aria-label="Avisos — Financeiro">
      <div className="acn-kb-lateral-fundo" onClick={onClose} />
      <div className="acn-kb-lateral-caixa">
        <div className="acn-kb-lateral-cab">
          <div className="acn-kb-cresce">
            <div className="acn-kb-lateral-titulo">Avisos — Financeiro</div>
            <div className="acn-ajuda">
              {isAdmin ? 'Toda a equipe' : 'Suas tarefas'} · {listaBase.length ? `${listaBase.length} aviso(s)` : 'nada pendente'}
            </div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
        </div>
        <div className="acn-kb-lateral-corpo">
          {listaBase.length === 0 && (
            <div className="acn-kb-vazio">Nada por aqui.</div>
          )}
          {['vencida', 'hoje', 'amanha'].map(tipo => porTipo(tipo).length > 0 && (
            <div key={tipo} className="acn-kb-aviso-grupo">
              <div className="acn-quadro-titulo" data-acn-familia={FAMILIA[tipo]}>{LABEL[tipo]}</div>
              {porTipo(tipo).map(a => (
                <div key={a.tarefa.id} className="acn-kb-aviso" data-acn-familia={FAMILIA[tipo]}>
                  <div className="acn-kb-nome">{a.tarefa.titulo}</div>
                  <div className="acn-ajuda">
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
    <div className="acn-quadro">
      <div className="acn-quadro-titulo">
        Anexos ({lista.length})
      </div>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
          Não foi possível ler os anexos desta tarefa ({erroLeitura}).
        </Faixa>
      )}
      {lista.map(a => (
        <div key={a.id} className="acn-kb-anexo">
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="acn-kb-anexo-link">
            <Icone path={mdiPaperclip} size={14} /> {a.nome} <span className="acn-ajuda">{fmtTam(a.tamanho)}</span>
          </a>
          <span className="acn-ajuda">{a.criado_por_nome}</span>
          {a.criado_por === currentUser?.email && (
            <Botao variante="perigo-sec" pequeno icone={mdiClose} onClick={() => apagar(a)} title="Apagar" aria-label="Apagar" />
          )}
        </div>
      ))}
      <input ref={entrada} type="file" multiple onChange={subir} disabled={subindo} className="acn-kb-arquivo"
        aria-label="Anexar arquivos" />
      {subindo && <div className="acn-txt-ok">Subindo...</div>}
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
      <div className="modal-box acn-modal-cadastro acn-kb-jan acn-kb-tarefa" role="dialog" aria-label={editando ? 'Editar tarefa' : 'Nova tarefa'}>
        <div className="acn-modal-cab">
          <span className="modal-title">{editando ? 'Editar tarefa' : '+ Nova tarefa'}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="form-group">
            <label className="acn-label" htmlFor="kb-titulo">Título *</label>
            <input id="kb-titulo" className="acn-input" value={titulo}
              onChange={e => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="kb-desc">Descrição</label>
            <textarea id="kb-desc" className="acn-input" rows={3}
              value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
          <div className="acn-kb-grade">
            <div className="form-group">
              <label className="acn-label">Responsável</label>
              <ColaboradorSelect value={responsavel} onChange={setResponsavel} incluirUsuariosDaAba="financeiro" />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="kb-venc">Vencimento</label>
              <input id="kb-venc" type="date" className="acn-input"
                value={vencimento || ''} onChange={e => setVencimento(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="kb-tipo">Tipo</label>
              <select id="kb-tipo" className="acn-input"
                value={tipoId} onChange={e => setTipoId(e.target.value)}>
                <option value="">— sem tipo —</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="kb-rep">Repete</label>
              <select id="kb-rep" className="acn-input"
                value={recorrencia} onChange={e => setRecorrencia(e.target.value)}>
                {RECORRENCIAS.map(r => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
              </select>
            </div>
          </div>

          {recorrencia && (
            <div className="acn-quadro tom-info">
              <div>
                Ao concluir esta tarefa, a próxima nasce sozinha
                {vencimento ? <> para <b>{fmtDt(proximaData(vencimento, recorrencia))}</b></> : null},
                com o mesmo responsável. Dá para trocar o responsável em qualquer ocorrência.
              </div>
              {editando && (
                <label className="acn-cad-check">
                  <input type="checkbox" checked={recAtiva} onChange={e => setRecAtiva(e.target.checked)} />
                  Continuar repetindo — desmarque para encerrar a corrente depois desta
                </label>
              )}
            </div>
          )}

          {/* Observações e anexos só depois que a tarefa existe: precisam do id */}
          {editando && (
            <>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">
                  Observações ({obs.length})
                </div>
                <div className="acn-kb-obs-lista">
                  {obs.length === 0 && <div className="acn-ajuda">Nenhuma anotação ainda.</div>}
                  {obs.map((o, i) => (
                    <div key={i} className="acn-kb-obs">
                      <div>{o.texto}</div>
                      <div className="acn-ajuda">
                        {o.usuario} · {o.hora ? new Date(o.hora).toLocaleString('pt-BR') : ''}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="acn-kb-linha">
                  <input className="acn-input acn-kb-cresce" value={novaObs}
                    onChange={e => setNovaObs(e.target.value)} onKeyDown={e => e.key === 'Enter' && anotar()}
                    aria-label="Nova anotação" placeholder="anotar alguma coisa nesta tarefa" />
                  <Botao onClick={anotar} disabled={!novaObs.trim()}>Anotar</Botao>
                </div>
              </div>
              <AnexosTarefaFinanceiro tarefaId={tarefa.id} currentUser={currentUser} />
            </>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar tarefa'}
          </Botao>
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
      <div className="modal-box acn-modal-cadastro acn-kb-jan acn-kb-tipos" role="dialog" aria-label="Tipos de tarefa do Financeiro">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTagOutline} size={16} /> Tipos de tarefa do Financeiro</span>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">
            Guia, conciliação, folha, balanço — o que o setor precisar. Serve para agrupar e achar depois.
          </div>
          <div className="acn-kb-linha">
            <input className="acn-input acn-kb-cresce" value={novo} autoFocus
              onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()}
              aria-label="Novo tipo" placeholder="ex.: Guia de imposto" />
            <Botao variante="primario" onClick={criar} disabled={salvando || !novo.trim()}>Adicionar</Botao>
          </div>
          {tipos.length === 0
            ? <div className="acn-kb-vazio">Nenhum tipo cadastrado ainda.</div>
            : tipos.map(t => (
              <div key={t.id} className="acn-kb-tipo-linha">
                <span className="acn-kb-cresce">{t.nome}</span>
                <Botao variante="perigo-sec" pequeno onClick={() => desligar(t)}>tirar</Botao>
              </div>
            ))}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Fechar</Botao>
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
    return <div className="acn-kb-vazio">Nada em aberto na agenda.</div>;
  }
  return (
    <div>
      {[...grupos.entries()].map(([mes, lista]) => (
        <div key={mes} className="acn-kb-mes">
          <div className="acn-kb-mes-titulo">
            {nomeMes(mes)} <span className="acn-ajuda">({lista.length})</span>
          </div>
          {lista.map(t => {
            const dias = diasAte(t.data_vencimento);
            const familia = dias < 0 ? 'erro' : dias <= 1 ? 'atencao' : 'neutro';
            return (
              <div key={t.id} onClick={() => onEditar(t)} className="acn-kb-agenda-item" data-acn-familia={familia}>
                <div className={'acn-kb-agenda-data ' + (dias < 0 ? 'acn-txt-erro' : dias <= 1 ? 'acn-txt-atencao' : 'acn-ajuda')}>{fmtDt(t.data_vencimento)}</div>
                <div className="acn-kb-cresce">
                  <div className="acn-kb-nome">{t.titulo}</div>
                  <div className="acn-ajuda">
                    {[nomeTipo(t.tipo_id), t.responsavel_nome, rotuloRecorrencia(t.recorrencia)].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <span className="acn-ajuda">{t.etapa}</span>
              </div>
            );
          })}
        </div>
      ))}
      {semData.length > 0 && (
        <div>
          <div className="acn-kb-mes-titulo acn-ajuda">Sem data marcada ({semData.length})</div>
          {semData.map(t => (
            <div key={t.id} onClick={() => onEditar(t)} className="acn-kb-agenda-item sem-data">
              {t.titulo} <span className="acn-ajuda">· {t.responsavel_nome || 'sem responsável'}</span>
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
  // a lateral do cartão: vermelha se vencida, âmbar se vence hoje ou amanhã, senão a cor da etapa
  const familia = vencida ? 'erro' : urgente ? 'atencao' : FAMILIA_ETAPA[tarefa.etapa];
  return (
    <div className="acn-kb-card" data-acn-familia={familia} onClick={() => onEditar(tarefa)}>
      <div className="acn-kb-nome">{tarefa.titulo}</div>
      {tarefa.descricao && <div className="acn-ajuda">{tarefa.descricao.slice(0, 90)}</div>}
      <div className="acn-kb-meta">
        {tipo && (
          <Selo familia="marca" ponto={false}><Icone path={mdiTagOutline} size={12} /> {tipo}</Selo>
        )}
        {tarefa.recorrencia && (
          <Selo familia="ok" ponto={false} title={`Ao concluir, a próxima já nasce (${rotuloRecorrencia(tarefa.recorrencia).toLowerCase()})`}>
            <Icone path={mdiRepeat} size={12} /> {rotuloRecorrencia(tarefa.recorrencia)}
          </Selo>
        )}
        {tarefa.responsavel_nome && (
          <Tag><Icone path={mdiAccountOutline} size={12} /> {tarefa.responsavel_nome}</Tag>
        )}
        {(tarefa.observacoes?.length > 0) && (
          <span className="acn-ajuda acn-kb-icone-texto"><Icone path={mdiCommentOutline} size={13} /> {tarefa.observacoes.length}</span>
        )}
        {tarefa.data_vencimento && (
          <span className={'acn-kb-icone-texto ' + (vencida ? 'acn-txt-erro' : urgente ? 'acn-txt-atencao' : 'acn-ajuda')}>
            {vencida
              ? <><Icone path={mdiAlertOutline} size={13} /> {`venceu ${fmtDt(tarefa.data_vencimento)}`}</>
              : <><Icone path={mdiCalendarOutline} size={13} /> {fmtDt(tarefa.data_vencimento)}</>}
          </span>
        )}
      </div>
      <div className="acn-kb-acoes" onClick={e => e.stopPropagation()}>
        {idx > 0 && (
          <Botao pequeno icone={mdiArrowLeft} onClick={() => onMover(tarefa, ETAPAS[idx - 1])}>
            {ETAPAS[idx - 1]}
          </Botao>
        )}
        {idx < ETAPAS.length - 1 && (
          <Botao pequeno variante="primario" onClick={() => onMover(tarefa, ETAPAS[idx + 1])}>
            {ETAPAS[idx + 1]} <Icone path={mdiArrowRight} size={15} />
          </Botao>
        )}
        {podeExcluir && (
          <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} className="acn-kb-empurra"
            title="Excluir" aria-label="Excluir" onClick={() => onExcluir(tarefa)} />
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
      <div className="acn-kb-cab">
        <div className="acn-kb-titulo"><Icone path={mdiClipboardTextOutline} size={18} /> Tarefas do Financeiro</div>
        <span className="acn-ajuda acn-kb-cresce">
          {veTudo ? 'você vê o quadro inteiro' : 'você vê as tarefas de que é responsável'}
        </span>
        {veTudo && responsaveis.length > 1 && (
          <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)} aria-label="Filtrar por responsável"
            className="acn-input acn-cc-filtro">
            <option value="">Responsável: todos</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <Botao icone={vista === 'quadro' ? mdiCalendarMonthOutline : mdiClipboardTextOutline}
          onClick={() => setVista(v => v === 'quadro' ? 'agenda' : 'quadro')}>
          {vista === 'quadro' ? 'Agenda' : 'Quadro'}
        </Botao>
        <Botao icone={mdiTagOutline} onClick={() => setModalTipos(true)}>Tipos</Botao>
        <Botao icone={mdiBellOutline} className={totalAvisos ? 'acn-kb-avisos-tem' : ''} onClick={() => setPainelAvisos(true)}>
          Avisos{totalAvisos ? ` (${totalAvisos})` : ''}
        </Botao>
        <Botao variante="primario" onClick={() => setModalTarefa({})}>
          + Nova tarefa
        </Botao>
      </div>

      {(erroLeitura || erroPermissao) && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
          {erroLeitura
            ? `Não foi possível carregar as tarefas (${erroLeitura}). O quadro pode estar incompleto.`
            : `Não foi possível conferir a sua permissão (${erroPermissao}). Você pode estar vendo só as suas tarefas.`}
        </Faixa>
      )}

      {loading ? (
        <div className="acn-kb-vazio">Carregando...</div>
      ) : vista === 'agenda' ? (
        <AgendaTarefas tarefas={visiveis} nomeTipo={nomeTipo} onEditar={setModalTarefa} />
      ) : (
        <div className="acn-kb-quadro">
          {ETAPAS.map(etapa => {
            const doEtapa = visiveis.filter(t => t.etapa === etapa);
            return (
              <div key={etapa} className="acn-kb-col" data-acn-familia={FAMILIA_ETAPA[etapa]}>
                <div className="acn-kb-col-cab">
                  <span className="acn-kb-ponto" />
                  <span className="acn-kb-col-nome">{etapa}</span>
                  <span className="acn-ajuda">({doEtapa.length})</span>
                </div>
                {doEtapa.length === 0 && <div className="acn-kb-vazio">Vazio</div>}
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
