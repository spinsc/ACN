// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ehAdminOuGerente, podeEditarParecerDaAnalise } from './utils/permissoes';
import { pedirTexto, confirmar } from './Feedback';
import { diaBR, Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiPencilOutline, mdiClose, mdiCheck, mdiTimerSand, mdiMagnify, mdiPlus, mdiCancel, mdiCheckCircleOutline, mdiNoteTextOutline, mdiPaperclip, mdiFileDocumentOutline, mdiGavel, mdiHandshakeOutline, mdiCalendarClockOutline, mdiLinkVariant, mdiChevronUp, mdiChevronDown, mdiChevronRight } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE SETORES
// ─────────────────────────────────────────────────────────────────────────────
export const ANALISE_GRUPOS = [
  {
    grupo: 'Técnico / Comercial',
    opcoes: [
      { id: 'Comercial',  label: 'Comercial / ADM' },
      { id: 'Telecom',    label: 'Técnica Telecom' },
      { id: 'Engenharia', label: 'Técnica Engenharia' },
    ],
  },
  {
    grupo: 'Orçamento',
    opcoes: [
      { id: 'Orcamento', label: 'Análise Orçamentária' },
    ],
  },
  {
    grupo: 'Departamento',
    opcoes: [
      { id: 'Chicotes',    label: 'Chicotes' },
      { id: 'Serralheria', label: 'Serralheria' },
      { id: 'Producao',    label: 'Produção / Adaptação' },
      { id: 'Laboratorio', label: 'Laboratório' },
    ],
  },
];

export const SETOR_LABEL: Record<string, string> = {
  Comercial:  'Comercial/ADM',
  Telecom:    'Téc. Telecom',
  Engenharia: 'Téc. Engenharia',
  Orcamento:  'Orçamento',
  Chicotes:   'Chicotes',
  Serralheria:'Serralheria',
  Producao:   'Produção',
  Laboratorio:'Laboratório',
};

// 12e46 (09/10/2026): a cor de cada setor saiu daqui para o design.css ([data-setor="…"] define --acn-setor); a aparência vive nas classes acn-ana-*

const BUCKET = 'acn-media';

const fmtDT = (v: string) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return v; }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONCLUIR / REABRIR SETOR — helpers compartilhados
// Existem 3 lugares que finalizam a análise de um setor (este arquivo, em 2
// pontos, e AnaliseInboxPanel.tsx). Cada um reimplementava a mesma lógica com
// valores de status diferentes ('analisado' vs 'concluido' no setor,
// 'finalizada' vs 'concluido' na solicitação) — um setor concluído por um
// caminho não era reconhecido como concluído pelos outros (badge de
// progresso, painel de análise no card, aba "Todas" do inbox). Centralizando
// aqui pra garantir uma única verdade, igual fizemos com
// resolverMencoesRespondidas em MencaoTextarea.tsx.
// ─────────────────────────────────────────────────────────────────────────────
export async function concluirAnaliseSetor(setor: any, solicitacao: any, opts: { notas?: string | null; usuario: string }) {
  const agora = new Date().toISOString();
  const notas = opts.notas?.trim() || null;
  await supabase.from('analise_setores').update({
    status: 'analisado',
    analisado_por: opts.usuario,
    analisado_em: agora,
    notas,
    // concluir (de novo) recomeça o parecer: sem a marca de "editada" de uma conclusão anterior (07/10/2026)
    notas_editado_em: null,
    notas_editado_por: null,
  }).eq('id', setor.id);

  const { data: todos } = await supabase.from('analise_setores')
    .select('status').eq('solicitacao_id', solicitacao.id);
  const todosOk = (todos || []).every((s: any) => s.status === 'analisado');
  if (todosOk) {
    await supabase.from('analise_solicitacoes').update({ status: 'finalizada' }).eq('id', solicitacao.id);
  }

  try {
    await supabase.from('analise_logs').insert([{
      solicitacao_id: solicitacao.id,
      setor_id: setor.id,
      setor: setor.setor,
      origem: solicitacao.origem,
      origem_titulo: solicitacao.origem_titulo,
      origem_numero: solicitacao.origem_numero,
      acao: 'analise_finalizada',
      usuario: opts.usuario,
      notas,
      criado_em: agora,
    }]);
  } catch (_) { /* tabela pode não existir ainda */ }

  return { todosOk, agora };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCELAR SOLICITAÇÃO
// Manual: quem pediu, Admin ou Gerente. Automático (processo em Perdida /
// Perdido / Desistência) é feito por gatilho no banco — ver
// cancelar_analises_origem (migration analise_cancelamento).
// Setores já analisados ficam como estão: o parecer continua como registro.
// ─────────────────────────────────────────────────────────────────────────────
export function podeCancelarAnalise(sol: any, usuario: any): boolean {
  if (!sol || sol.status !== 'em_andamento' || !usuario) return false;
  if (ehAdminOuGerente(usuario)) return true;
  const quem = String(sol.criado_por || '').trim().toLowerCase();
  return !!quem && (quem === String(usuario.nome || '').trim().toLowerCase()
                 || quem === String(usuario.email || '').trim().toLowerCase());
}

/** Pergunta o motivo e cancela. Devolve true se cancelou. */
export async function cancelarSolicitacaoAnalise(sol: any, usuario: any): Promise<boolean> {
  if (!podeCancelarAnalise(sol, usuario)) {
    alert('Só quem pediu a análise, administradores e gerentes podem cancelá-la.');
    return false;
  }
  const motivo = await pedirTexto('Motivo do cancelamento desta solicitação de análise:');
  if (motivo == null) return false;
  if (!motivo.trim()) { alert('Informe o motivo do cancelamento.'); return false; }
  const agora = new Date().toISOString();
  const nome = usuario?.nome || usuario?.email || 'Usuário';
  // .eq('status','em_andamento'): se alguém concluiu nesse meio-tempo, não sobrescreve
  const { data, error } = await supabase.from('analise_solicitacoes')
    .update({ status: 'cancelada', cancelada_por: nome, cancelada_em: agora, motivo_cancelamento: motivo.trim() })
    .eq('id', sol.id).eq('status', 'em_andamento').select('id');
  if (error) { alert('Erro ao cancelar: ' + error.message); return false; }
  if (!data?.length) { alert('Esta solicitação não está mais em andamento (foi concluída ou cancelada por outra pessoa).'); return false; }
  await supabase.from('analise_setores').update({ status: 'cancelado' })
    .eq('solicitacao_id', sol.id).eq('status', 'pendente');
  try {
    await supabase.from('analise_logs').insert([{
      solicitacao_id: sol.id, origem: sol.origem, origem_titulo: sol.origem_titulo, origem_numero: sol.origem_numero,
      acao: 'solicitacao_cancelada', usuario: nome, notas: motivo.trim(), criado_em: agora,
    }]);
  } catch (_) { /* log é complementar */ }
  return true;
}

/** Pendências de análise por setor (só solicitações em andamento). */
export async function contarAnalisesPendentesPorSetor(): Promise<Record<string, number>> {
  const { data } = await supabase.from('analise_setores')
    .select('setor, analise_solicitacoes!inner(status)')
    .eq('status', 'pendente').eq('analise_solicitacoes.status', 'em_andamento');
  const cont: Record<string, number> = {};
  (data || []).forEach((r: any) => { cont[r.setor] = (cont[r.setor] || 0) + 1; });
  return cont;
}

export async function reabrirAnaliseSetor(setor: any) {
  await supabase.from('analise_setores').update({
    status: 'pendente', analisado_por: null, analisado_em: null, notas: null, notas_editado_em: null, notas_editado_por: null,
  }).eq('id', setor.id);
  await supabase.from('analise_solicitacoes').update({ status: 'em_andamento' }).eq('id', setor.solicitacao_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR O PARECER DE UMA ANÁLISE JÁ CONCLUÍDA  (pedido do usuário em 07/10/2026)
// Só o autor da análise (analisado_por) edita — ver podeEditarParecerDaAnalise. Antes o único caminho era "Reabrir", que APAGAVA o parecer e a assinatura.
// A edição guarda quem e quando (notas_editado_*) para a tela mostrar a marca discreta "editada", e deixa uma linha 'analise_editada' no histórico (analise_logs);
// o texto original continua na linha 'analise_finalizada'. Não muda o status, o autor nem a data da análise.
// ─────────────────────────────────────────────────────────────────────────────
export async function editarParecerAnalise(setor: any, solicitacao: any, novoTexto: string, usuario: any): Promise<{ ok: boolean; motivo?: string }> {
  if (!podeEditarParecerDaAnalise(usuario, setor)) return { ok: false, motivo: 'Só quem fez a análise pode editar o parecer.' };
  const notas = String(novoTexto ?? '').trim() || null;
  if (notas === (String(setor.notas || '').trim() || null)) return { ok: false, motivo: 'O texto não mudou.' };
  const agora = new Date().toISOString();
  const nome = usuario?.nome || usuario?.email || 'Usuário';
  // status e autor na condição: se alguém reabriu ou concluiu de novo nesse meio-tempo, a edição não sobrescreve o parecer novo
  const { data, error } = await supabase.from('analise_setores')
    .update({ notas, notas_editado_em: agora, notas_editado_por: nome })
    .eq('id', setor.id).eq('status', 'analisado').eq('analisado_por', setor.analisado_por).select('id');
  if (error) return { ok: false, motivo: 'Erro ao salvar: ' + error.message };
  if (!data?.length) return { ok: false, motivo: 'Esta análise foi reaberta ou concluída de novo por outra pessoa. Atualize a tela e confira.' };
  try {
    await supabase.from('analise_logs').insert([{
      solicitacao_id: setor.solicitacao_id, setor_id: setor.id, setor: setor.setor,
      origem: solicitacao?.origem, origem_titulo: solicitacao?.origem_titulo, origem_numero: solicitacao?.origem_numero,
      acao: 'analise_editada', usuario: nome, notas, criado_em: agora,
    }]);
  } catch (_) { /* o histórico é complementar */ }
  return { ok: true };
}

const fmtDTAno = (v: string) => {
  try { return new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return v; }
};

/** Quem e quando do parecer. Pedido do usuário em 07/10/2026: depois de uma edição, o autor, a data e a hora mostrados são os da EDIÇÃO (e não os da criação da análise).
 *  `outraPessoa` só é verdadeiro se quem editou não é quem fez a análise — hoje só o autor edita (regra de 07/10/2026), então isso só acontece se a regra mudar; fica pronto. */
export function autoriaDoParecer(setor: any) {
  const editada = !!setor?.notas_editado_em;
  const autor = String(setor?.analisado_por || '');
  const editor = String(setor?.notas_editado_por || '');
  return {
    editada,
    autor,
    // mesma pessoa que fez a análise: vale o nome como ele foi gravado na análise (a edição pode ter vindo com outra caixa de letras)
    quem: (editada && editor && autor && editor.trim().toLowerCase() !== autor.trim().toLowerCase()) ? editor : (autor || editor),
    quando: editada ? setor.notas_editado_em : setor?.analisado_em,
    outraPessoa: editada && !!editor && !!autor && editor.trim().toLowerCase() !== autor.trim().toLowerCase(),
  };
}

/** Marca discreta ao lado de "por Fulano · data": só aparece se o parecer foi editado depois de concluído; o mouse em cima diz quem e quando.
 *  Se quem editou NÃO é o autor da análise, acrescenta (bem de leve) de quem foi a análise original. */
export function MarcaEditada({ setor }: any) {
  const a = autoriaDoParecer(setor);
  if (!a.editada) return null;
  return (
    <span title={`Parecer editado por ${a.quem || '—'} em ${fmtDTAno(setor.notas_editado_em)}${a.outraPessoa ? ` · análise feita por ${a.autor}` : ''}`}
      className="acn-ana-marca">
      · editada{a.outraPessoa && <span className="acn-ana-marca-outra"> · análise de {a.autor}</span>}
    </span>
  );
}

/** Mostra o parecer (children) e, só para o autor da análise, o atalho discreto de editar. */
export function ParecerEditavel({ setor, solicitacao, currentUser, onSaved, children }: any) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = podeEditarParecerDaAnalise(currentUser, setor);

  if (!editando) {
    return (
      <>
        {children}
        {pode && (
          <Botao variante="discreto" pequeno icone={mdiPencilOutline} className="acn-ana-editar"
            onClick={() => { setTexto(setor.notas || ''); setEditando(true); }}
            title="Só quem fez esta análise pode editar o parecer">
            {setor.notas ? 'Editar parecer' : 'Adicionar observação'}
          </Botao>
        )}
      </>
    );
  }

  const igual = (texto.trim() || null) === (String(setor.notas || '').trim() || null);
  const salvar = async () => {
    setSalvando(true);
    const r = await editarParecerAnalise(setor, solicitacao, texto, currentUser);
    setSalvando(false);
    if (!r.ok) { alert(r.motivo); return; }
    setEditando(false);
    onSaved?.();
  };
  return (
    <div className="acn-ana-edicao">
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} autoFocus className="acn-input"
        aria-label="Editar o parecer da análise" />
      <div className="acn-ana-edicao-botoes">
        <Botao variante="primario" pequeno onClick={salvar} disabled={salvando || igual}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Botao>
        <Botao pequeno onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Botao>
        <span className="acn-ajuda">O parecer fica marcado como editado.</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SOLICITAR ANÁLISE  (usado em Licitações e CRM)
// ─────────────────────────────────────────────────────────────────────────────
export function ModalSolicitarAnalise({
  origem,         // 'licitacao' | 'crm'
  origemId,
  origemTitulo,
  origemNumero,
  currentUser,
  onClose,
  onSaved,
}: any) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando]         = useState(false);
  const [existentes, setExistentes]     = useState<string[]>([]); // setores já solicitados ativos

  useEffect(() => {
    // carrega setores já solicitados e pendentes/em_andamento
    supabase
      .from('analise_solicitacoes')
      .select('id, analise_setores(setor, status)')
      .eq('origem_id', origemId)
      .eq('status', 'em_andamento')
      .then(({ data }) => {
        const already: string[] = [];
        (data || []).forEach((sol: any) => {
          (sol.analise_setores || []).forEach((s: any) => {
            if (s.status === 'pendente') already.push(s.setor);
          });
        });
        setExistentes(already);
      });
  }, [origemId]);

  const toggle = (id: string) =>
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const salvar = async () => {
    const novos = selecionados.filter(s => !existentes.includes(s));
    if (!novos.length) { alert('Selecione ao menos um setor que ainda não foi solicitado.'); return; }
    setSalvando(true);
    // criar solicitação
    const { data: sol, error } = await supabase
      .from('analise_solicitacoes')
      .insert({
        origem,
        origem_id: origemId,
        origem_titulo: origemTitulo,
        origem_numero: origemNumero || null,
        setores: novos,
        criado_por: currentUser?.nome || currentUser?.email || 'Usuário',
      })
      .select()
      .single();
    if (error || !sol) { alert('Erro ao criar solicitação: ' + (error?.message || 'unknown')); setSalvando(false); return; }

    // criar um registro por setor
    const rows = novos.map(s => ({ solicitacao_id: sol.id, setor: s, status: 'pendente' }));
    await supabase.from('analise_setores').insert(rows);

    setSalvando(false);
    onSaved?.();
    onClose();
  };

  const qtdNovos = selecionados.filter(s => !existentes.includes(s)).length;
  return (
    <div className="modal-overlay acn-ana-ov" onClick={onClose}>
      <div className="modal-box acn-modal-cadastro acn-ana-jan" role="dialog" aria-label="Solicitar análise" onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="acn-modal-cab">
          <div className="acn-ana-cab-txt">
            <span className="modal-title"><Icone path={mdiMagnify} size={18} />Solicitar Análise</span>
            <div className="acn-ajuda">{origemTitulo}</div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
        </div>

        <div className="acn-modal-corpo">
          <div className="acn-ajuda acn-ana-intro">
            Selecione os setores que devem analisar este processo. Cada setor receberá a demanda em sua aba correspondente.
          </div>

          {ANALISE_GRUPOS.map(g => (
            <div key={g.grupo} className="acn-ana-grupo">
              <div className="acn-quadro-titulo">{g.grupo}</div>
              <div className="acn-ana-ops">
                {g.opcoes.map(op => {
                  const jaAtivo = existentes.includes(op.id);
                  const sel = selecionados.includes(op.id);
                  return (
                    <label key={op.id} data-setor={op.id} className={'acn-ana-op' + (sel ? ' sel' : '') + (jaAtivo ? ' ja' : '')}>
                      <input type="checkbox" checked={sel || jaAtivo} disabled={jaAtivo}
                        onChange={() => !jaAtivo && toggle(op.id)} />
                      <span className="acn-ana-op-nome">{op.label}</span>
                      {jaAtivo && <span className="acn-ana-ja"><Icone path={mdiTimerSand} size={12} /> Já solicitado</span>}
                      {!jaAtivo && <span className="acn-ana-ponto" />}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={salvando ? undefined : mdiCheck} onClick={salvar} disabled={salvando || qtdNovos === 0}>
            {salvando ? 'Solicitando...' : `Solicitar Análise (${qtdNovos} setor${qtdNovos !== 1 ? 'es' : ''})`}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE  (para LicitCard e CRM card — mostra progresso da análise)
// ─────────────────────────────────────────────────────────────────────────────
export function AnaliseStatusBadge({ origemId }: { origemId: string }) {
  const [info, setInfo] = useState<{ total:number; feitos:number } | null>(null);

  useEffect(() => {
    supabase
      .from('analise_solicitacoes')
      .select('id, analise_setores(status)')
      .eq('origem_id', origemId)
      .eq('status', 'em_andamento')
      .then(({ data }) => {
        if (!data || !data.length) { setInfo(null); return; }
        let total = 0, feitos = 0;
        data.forEach((sol: any) => {
          (sol.analise_setores || []).forEach((s: any) => {
            total++;
            if (s.status === 'analisado') feitos++;
          });
        });
        setInfo({ total, feitos });
      });
  }, [origemId]);

  if (!info || !info.total) return null;

  const done = info.feitos === info.total;
  return (
    <Selo familia={done ? 'ok' : 'atencao'} ponto={false}>
      <Icone path={done ? mdiCheckCircleOutline : mdiMagnify} size={11} />{done ? 'Análise OK' : `Análise ${info.feitos}/${info.total}`}
    </Selo>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE STATUS DA ANÁLISE  (aba Análise no modal de Licitação/CRM)
// ─────────────────────────────────────────────────────────────────────────────
export function AnaliseStatusPanel({ origemId, origemTitulo, origemNumero, origem, currentUser, onSolicitarNova }: any) {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [obsSetor, setObsSetor] = useState<Record<string, string>>({});
  const [finalizando, setFinalizando] = useState<string|null>(null);

  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const { data } = await supabase
      .from('analise_solicitacoes')
      .select('*, analise_setores(*)')
      .eq('origem_id', origemId)
      .order('criado_em', { ascending: false });
    setSolicitacoes(data || []);
    setLoading(false);
  }, [origemId]);

  // Tempo real: nova solicitação (modal), conclusão ou cancelamento por outra
  // pessoa aparecem sem fechar e abrir o card. Silencioso: não pisca a tela nem
  // tira o foco de quem está escrevendo o parecer.
  useEffect(() => {
    load();
    const ch = supabase.channel(`analise-painel-${origemId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_solicitacoes', filter:`origem_id=eq.${origemId}` }, () => load(true))
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_setores' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const concluirSetor = async (setor: any, sol: any) => {
    if (!await confirmar(`Concluir a análise do setor ${setor?.setor || setor?.nome || ''}?`)) return;
    setFinalizando(setor.id);
    const usuario = currentUser?.nome || currentUser?.email || 'Sistema';
    await concluirAnaliseSetor(setor, sol, { notas: obsSetor[setor.id], usuario });
    setFinalizando(null);
    setObsSetor(p => { const n = { ...p }; delete n[setor.id]; return n; });
    load();
  };

  if (loading) return <div className="acn-empty">Carregando...</div>;

  const ativas = solicitacoes.filter(s => s.status === 'em_andamento');
  const finalizadas = solicitacoes.filter(s => s.status === 'finalizada');
  const canceladas = solicitacoes.filter(s => s.status === 'cancelada');
  const cancelar = async (sol: any) => { if (await cancelarSolicitacaoAnalise(sol, currentUser)) load(); };

  return (
    <div className="acn-ana-painel">
      {/* Nova solicitação */}
      <div className="acn-quadro tom-info acn-ana-nova">
        <div>
          <div className="acn-ana-nova-tit"><Icone path={mdiMagnify} size={15} />Solicitar Análise Técnica/Comercial</div>
          <div className="acn-ajuda">Demande a análise para os setores necessários.</div>
        </div>
        <Botao variante="primario" pequeno icone={mdiPlus} onClick={onSolicitarNova}>Solicitar</Botao>
      </div>

      {/* Solicitações ativas */}
      {ativas.map(sol => {
        const setores = sol.analise_setores || [];
        const qtdFeita = setores.filter((s:any) => s.status === 'analisado').length;
        const pct = setores.length ? Math.round((qtdFeita/setores.length)*100) : 0;
        return (
          <div key={sol.id} className="acn-ana-sol">
            <div className="acn-ana-sol-cab">
              <div>
                <span className="acn-forte">Solicitação em andamento</span>
                <span className="acn-ajuda acn-ana-sol-quem">por {sol.criado_por} · {fmtDT(sol.criado_em)}</span>
              </div>
              <div className="acn-ana-sol-prog">
                <div className="acn-ana-sol-qtd">{qtdFeita}/{setores.length} setores</div>
                <div className="acn-ana-barra"><i className={pct === 100 ? 'ok' : undefined} style={{ width: `${pct}%` }} /></div>
                {podeCancelarAnalise(sol, currentUser) && (
                  <Botao variante="perigo-sec" pequeno icone={mdiCancel} onClick={() => cancelar(sol)} title="Cancelar esta solicitação (pede o motivo)">
                    Cancelar
                  </Botao>
                )}
              </div>
            </div>

            {/* Setores com botão de finalizar para os pendentes */}
            <div className="acn-ana-setores">
              {setores.map((s:any) => (
                <div key={s.id} className={'acn-ana-setor ' + (s.status==='analisado' ? 'feito' : 'pend')}>
                  <div className="acn-ana-setor-cab">
                    <Icone path={s.status==='analisado' ? mdiCheckCircleOutline : mdiTimerSand} size={14} />
                    <span className="acn-ana-setor-nome">
                      {SETOR_LABEL[s.setor] || s.setor}
                    </span>
                    {s.status==='analisado' && autoriaDoParecer(s).quem && (
                      <span className="acn-ana-quem"><Icone path={mdiCheck} size={11} /> {autoriaDoParecer(s).quem}</span>
                    )}
                    {s.status==='analisado' && autoriaDoParecer(s).quando && (
                      <span className="acn-ana-quando">{fmtDT(autoriaDoParecer(s).quando)}</span>
                    )}
                    {s.status==='analisado' && <MarcaEditada setor={s} />}
                  </div>
                  {s.status==='analisado' && (
                    <ParecerEditavel setor={s} solicitacao={sol} currentUser={currentUser} onSaved={() => load(true)}>
                      {s.notas && (
                        <div className="acn-ana-parecer"><Icone path={mdiNoteTextOutline} size={13} /> {s.notas}</div>
                      )}
                    </ParecerEditavel>
                  )}
                  {s.status !== 'analisado' && (
                    <div className="acn-ana-obs">
                      <textarea className="acn-input"
                        value={obsSetor[s.id] || ''}
                        onChange={e => setObsSetor(p => ({ ...p, [s.id]: e.target.value }))}
                        placeholder="Observações da análise (opcional)..."
                        rows={4}
                      />
                      <Botao variante="primario" pequeno icone={finalizando === s.id ? mdiTimerSand : mdiCheckCircleOutline}
                        onClick={() => concluirSetor(s, sol)}
                        disabled={finalizando === s.id}>
                        {finalizando === s.id ? 'Salvando...' : 'Análise Finalizada'}
                      </Botao>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Histórico finalizado */}
      {finalizadas.length > 0 && (
        <details open className="acn-ana-det">
          <summary><Icone path={mdiCheckCircleOutline} size={13} /> {finalizadas.length} análise{finalizadas.length>1?'s':''} finalizada{finalizadas.length>1?'s':''}</summary>
          {finalizadas.map(sol => (
            <div key={sol.id} className="acn-ana-fin">
              <div className="acn-ana-fin-quem">Solicitado por {sol.criado_por} · {fmtDT(sol.criado_em)}</div>
              <div className="acn-ana-fin-lista">
                {(sol.analise_setores||[]).map((s:any) => (
                  <div key={s.id} className="acn-ana-fin-setor">
                    <div className="acn-ana-fin-cab">
                      <span className="acn-ana-fin-nome"><Icone path={mdiCheckCircleOutline} size={13} /> {SETOR_LABEL[s.setor]||s.setor}</span>
                      {autoriaDoParecer(s).quem && <span className="acn-ana-fin-meta">por {autoriaDoParecer(s).quem}</span>}
                      {autoriaDoParecer(s).quando && <span className="acn-ana-fin-meta">{fmtDT(autoriaDoParecer(s).quando)}</span>}
                      <MarcaEditada setor={s} />
                    </div>
                    {/* O parecer e o que interessa ler aqui: fundo branco, corpo de
                        texto legivel e quebras de linha preservadas. Antes saia em
                        9px italico, do mesmo tamanho do rotulo do setor. */}
                    <ParecerEditavel setor={s} solicitacao={sol} currentUser={currentUser} onSaved={() => load(true)}>
                      {s.notas ? (
                        <div className="acn-ana-fin-txt">
                          {s.notas}
                        </div>
                      ) : (
                        <div className="acn-ana-fin-sem">
                          Este setor concluiu sem escrever observação.
                        </div>
                      )}
                    </ParecerEditavel>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}

      {canceladas.length > 0 && (
        <details className="acn-ana-det">
          <summary><Icone path={mdiCancel} size={13} /> {canceladas.length === 1 ? '1 solicitação cancelada' : canceladas.length + ' solicitações canceladas'}</summary>
          {canceladas.map(sol => (
            <div key={sol.id} className="acn-ana-canc">
              <div className="acn-ana-canc-quem">
                Solicitado por {sol.criado_por} · {fmtDT(sol.criado_em)} — cancelada por <strong>{sol.cancelada_por || '—'}</strong>{sol.cancelada_em ? ' em ' + fmtDT(sol.cancelada_em) : ''}
              </div>
              {sol.motivo_cancelamento && (
                <div className="acn-ana-canc-motivo">Motivo: {sol.motivo_cancelamento}</div>
              )}
              <div className="acn-ana-chips">
                {(sol.analise_setores||[]).map((s:any) => (
                  <span key={s.id} className={'acn-ana-chip ' + (s.status==='analisado' ? 'feito' : 'cancel')}>
                    <Icone path={s.status==='analisado' ? mdiCheckCircleOutline : mdiCancel} size={11} /> {SETOR_LABEL[s.setor]||s.setor}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}

      {!ativas.length && !finalizadas.length && !canceladas.length && (
        <div className="acn-empty">
          Nenhuma análise solicitada ainda para este processo.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALISE WIDGET  (embutido nas abas de destino — Comercial, Engenharia, etc.)
// ─────────────────────────────────────────────────────────────────────────────
export default function AnaliseWidget({ setor, currentUser, onAbrirOrigem }: { setor: string; currentUser: any; onAbrirOrigem?: (origem: string, origemId: string) => void }) {
  const [analises, setAnalises]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandido, setExpandido]   = useState<string|null>(null);
  const [notas, setNotas]           = useState<Record<string,string>>({});
  const [aprovando, setAprovando]   = useState<string|null>(null);
  const [uploadando, setUploadando] = useState<string|null>(null); // solicitacao_id sendo uploadado
  const [anexos, setAnexos]         = useState<Record<string,any[]>>({});
  const [collapsed, setCollapsed]   = useState(false);
  // Pedido do usuário em 05/10/2026 (só a tela do Telecom): ordenar as análises pela data de disputa do processo de origem.
  // "Mais recente" = a data mais nova primeiro; "menos recente" = a mais antiga primeiro. A escolha fica lembrada neste computador.
  const [ordem, setOrdem] = useState(() => { try { return localStorage.getItem('acn-analise-ordem') || 'padrao'; } catch { return 'padrao'; } });
  const [disputas, setDisputas] = useState<Record<string, any>>({});   // origem_id → { quando, texto }

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    // busca setores pendentes para este setor, com join na solicitacao
    const { data } = await supabase
      .from('analise_setores')
      .select('*, analise_solicitacoes(id, origem, origem_id, origem_titulo, origem_numero, criado_por, criado_em, status)')
      .eq('setor', setor)
      .eq('status', 'pendente')
      .order('id', { ascending: false });
    const items = (data || []).filter(i => i.analise_solicitacoes?.status === 'em_andamento');
    setAnalises(items);
    if (!silent) setLoading(false);
    // Data de disputa do processo de origem, só para ordenar a lista do Telecom: licitação = `licitacoes.data_disputa` (com hora);
    // processo do CRM = `crm_oportunidades.data_sessao` (só o dia) + `hora_sessao` (texto). Sem data = vai para o fim da lista, nas duas ordens.
    if (setor === 'Telecom' && items.length) {
      const idsDe = (o: string) => [...new Set(items.map((i: any) => i.analise_solicitacoes).filter((s: any) => s?.origem === o && s?.origem_id).map((s: any) => s.origem_id))];
      const lic = idsDe('licitacao'), crm = idsDe('crm');
      const [rl, rc] = await Promise.all([
        lic.length ? supabase.from('licitacoes').select('id,data_disputa').in('id', lic) : Promise.resolve({ data: [] }),
        crm.length ? supabase.from('crm_oportunidades').select('id,data_sessao,hora_sessao').in('id', crm) : Promise.resolve({ data: [] }),
      ]);
      const mapa: Record<string, any> = {};
      (rl.data || []).forEach((l: any) => { if (l.data_disputa) mapa[l.id] = { quando: new Date(l.data_disputa), texto: new Date(l.data_disputa).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }; });
      (rc.data || []).forEach((c: any) => { if (c.data_sessao) mapa[c.id] = { quando: new Date(String(c.data_sessao).slice(0, 10) + 'T00:00:00'), texto: diaBR(c.data_sessao) + (c.hora_sessao ? ' ' + c.hora_sessao : '') }; });
      setDisputas(mapa);
    }
    // carrega anexos para cada solicitação
    if (items.length) {
      const ids = [...new Set(items.map((i:any) => i.analise_solicitacoes?.id).filter(Boolean))];
      const { data: anx } = await supabase.from('analise_anexos').select('*').in('solicitacao_id', ids);
      const grouped: Record<string,any[]> = {};
      (anx || []).forEach((a:any) => {
        if (!grouped[a.solicitacao_id]) grouped[a.solicitacao_id] = [];
        grouped[a.solicitacao_id].push(a);
      });
      setAnexos(grouped);
    }
  }, [setor]);

  // Tempo real: a pendência aparece (ou some, se cancelada/concluída) na hora.
  // O intervalo continua como rede de segurança se a conexão cair.
  useEffect(() => {
    load();
    const t = setInterval(()=>load(true), 60000);
    const ch = supabase.channel(`analise-widget-${setor}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_setores' }, () => load(true))
      .on('postgres_changes', { event:'*', schema:'public', table:'analise_solicitacoes' }, () => load(true))
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [load]);

  const marcarAnalisado = async (item: any) => {
    setAprovando(item.id);
    const nota = notas[item.id] || item.notas || null;
    const sol = item.analise_solicitacoes;
    if (sol) {
      await concluirAnaliseSetor(item, sol, { notas: nota, usuario: currentUser?.nome || currentUser?.email || 'Sistema' });
    }
    setAprovando(null);
    load();
  };

  const uploadAnexo = async (solicitacaoId: string, files: FileList | File[]) => {
    setUploadando(solicitacaoId);
    const lista = Array.from(files);
    for (const file of lista) {
      const path = `analise/${solicitacaoId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const { data: up } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (up) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        await supabase.from('analise_anexos').insert({
          solicitacao_id: solicitacaoId,
          nome: file.name,
          url: pub?.publicUrl || '',
          criado_por: currentUser?.nome || 'Sistema',
          setor,
        });
      }
    }
    // reload anexos após enviar todos
    const { data: anx } = await supabase.from('analise_anexos').select('*').eq('solicitacao_id', solicitacaoId);
    setAnexos(prev => ({ ...prev, [solicitacaoId]: anx || [] }));
    setUploadando(null);
  };

  // Lista na ordem escolhida (só Telecom; nos outros setores segue a ordem de sempre)
  const lista = (() => {
    if (setor !== 'Telecom' || ordem === 'padrao') return analises;
    const quando = (i: any) => disputas[i.analise_solicitacoes?.origem_id]?.quando?.getTime();
    return [...analises].sort((a: any, b: any) => {
      const ta = quando(a), tb = quando(b);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ordem === 'disputa_recente' ? tb - ta : ta - tb;
    });
  })();

  return (
    <div className="acn-ana-widget" data-setor={setor}>
      {/* Header */}
      <div className="acn-ana-w-cab" onClick={()=>setCollapsed(c=>!c)}>
        <div className="acn-ana-w-esq">
          <span className="acn-ana-w-tit"><Icone path={mdiMagnify} size={15} /> Análise de Licitações / CRM</span>
          {analises.length > 0 && !collapsed && (
            <span className="acn-ana-w-pill">
              {analises.length} pendente{analises.length>1?'s':''}
            </span>
          )}
          {analises.length > 0 && collapsed && (
            <span className="acn-ana-w-pill amarelo">
              <Icone path={mdiTimerSand} size={11} /> {analises.length}
            </span>
          )}
        </div>
        <Botao variante="discreto" pequeno icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-expanded={!collapsed}
          onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
      </div>

      {!collapsed && (
        <div className="acn-ana-w-corpo">
          {loading ? (
            <div className="acn-ana-w-vazio">Carregando análises...</div>
          ) : analises.length === 0 ? (
            <div className="acn-ana-w-vazio centro">
              Nenhuma análise pendente para {SETOR_LABEL[setor]||setor}.
            </div>
          ) : (
            <div className="acn-ana-w-lista">
              {setor === 'Telecom' && analises.length > 1 && (
                <div className="acn-ana-ordenar">
                  <label htmlFor="analise-ordem" className="acn-forte">Ordenar por</label>
                  <select id="analise-ordem" value={ordem} className="acn-input"
                    onChange={e => { setOrdem(e.target.value); try { localStorage.setItem('acn-analise-ordem', e.target.value); } catch {} }}>
                    <option value="padrao">Padrão</option>
                    <option value="disputa_recente">Data de disputa — mais recente primeiro</option>
                    <option value="disputa_antiga">Data de disputa — menos recente primeiro</option>
                  </select>
                </div>
              )}
              {lista.map(item => {
                const sol = item.analise_solicitacoes;
                const solId = sol?.id;
                const isExp = expandido === item.id;
                const isLicit = sol?.origem === 'licitacao';
                const anx = (solId && anexos[solId]) || [];
                const abre = !!(onAbrirOrigem && sol?.origem_id);

                return (
                  <div key={item.id} className="acn-ana-item">
                    {/* Card header */}
                    <div className="acn-ana-item-cab">
                      <div className="acn-ana-item-esq" onClick={()=>setExpandido(isExp ? null : item.id)}>
                        <span
                          onClick={e => { e.stopPropagation(); onAbrirOrigem && sol?.origem_id && onAbrirOrigem(sol.origem, sol.origem_id); }}
                          className={'acn-ana-tag ' + (isLicit ? 'licit' : 'crm') + (abre ? ' link' : '')}>
                          <Icone path={isLicit ? mdiGavel : mdiHandshakeOutline} size={12} /> {isLicit ? 'Licitação' : 'CRM'}
                        </span>
                        {/* Título clicável abre o processo correspondente */}
                        <span
                          onClick={e => { e.stopPropagation(); onAbrirOrigem && sol?.origem_id && onAbrirOrigem(sol.origem, sol.origem_id); }}
                          className={'acn-ana-titulo' + (abre ? ' link' : '')}>
                          {sol?.origem_numero && <span className="acn-ana-numero">{sol.origem_numero}</span>}
                          {sol?.origem_titulo || '—'}
                        </span>
                      </div>
                      <div className="acn-ana-item-dir">
                        {setor === 'Telecom' && disputas[sol?.origem_id] && (
                          <span className="acn-ana-disputa" title="Data de disputa do processo"><Icone path={mdiCalendarClockOutline} size={12} /> Disputa {disputas[sol.origem_id].texto}</span>
                        )}
                        <span className="acn-ajuda">
                          {sol?.criado_em ? new Date(sol.criado_em).toLocaleDateString('pt-BR') : ''}
                        </span>
                        {abre && (
                          <Botao pequeno icone={mdiLinkVariant} onClick={e => { e.stopPropagation(); onAbrirOrigem(sol.origem, sol.origem_id); }}>
                            Abrir
                          </Botao>
                        )}
                        <span className="acn-ana-seta" onClick={()=>setExpandido(isExp ? null : item.id)}><Icone path={isExp ? mdiChevronUp : mdiChevronDown} size={14} /></span>
                      </div>
                    </div>

                    {/* Card body */}
                    {isExp && (
                      <div className="acn-ana-item-corpo">

                        {/* ── ARQUIVOS COMUNS ── */}
                        <div className="acn-ana-bloco">
                          <div className="acn-ana-bloco-tit"><Icone path={mdiPaperclip} size={13} /> Arquivos (comuns a todos os setores)</div>
                          <div className="acn-ana-arqs">
                            {anx.length === 0 && (
                              <span className="acn-ajuda">Nenhum arquivo ainda.</span>
                            )}
                            {anx.map((a:any) => (
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="acn-ana-arq">
                                <Icone path={mdiFileDocumentOutline} size={13} /> {a.nome}
                                {a.criado_por && <span className="acn-ana-arq-por">· {a.criado_por}</span>}
                              </a>
                            ))}
                          </div>
                          <label className={'acn-ana-upload' + (uploadando===solId ? ' ocupado' : '')}>
                            {uploadando===solId ? 'Enviando...' : '+ Adicionar arquivo'}
                            <input type="file" hidden multiple disabled={uploadando===solId}
                              onChange={e => { if (e.target.files?.length && solId) uploadAnexo(solId, e.target.files); e.target.value=''; }} />
                          </label>
                        </div>

                        {/* ── NOTAS ── */}
                        <div className="acn-ana-bloco">
                          <div className="acn-ana-bloco-tit"><Icone path={mdiNoteTextOutline} size={13} /> Notas / Observações</div>
                          <textarea className="acn-input"
                            value={notas[item.id] ?? (item.notas || '')}
                            onChange={e => setNotas(n => ({ ...n, [item.id]: e.target.value }))}
                            placeholder="Adicione observações da sua análise..."
                            rows={3} />
                        </div>

                        {/* ── BOTÃO ANALISADO ── */}
                        <Botao variante="primario" className="acn-ana-marcar" icone={aprovando===item.id ? mdiTimerSand : mdiCheckCircleOutline}
                          onClick={() => marcarAnalisado(item)} disabled={aprovando===item.id}>
                          {aprovando===item.id ? 'Salvando...' : 'Marcar como Analisado'}
                        </Botao>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
