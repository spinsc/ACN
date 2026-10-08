// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { NovaDemandaModal } from './DemandaAvulsaPanel';
import { escopoDeDemandas } from './utils/permissoes';
import { Botao, Selo, Faixa } from './Interface';
import Icone from './Icone';
import { mdiClipboardTextOutline, mdiPlus, mdiContentSaveOutline, mdiHistory } from '@mdi/js';

// Ajustes registrados ANTES desta unificação vivem em demandas_setoriais
// com descricao prefixada [AJUSTE] — a tabela abaixo ("Ajustes em Aberto" /
// "Histórico") continua lendo/agindo sobre eles exatamente como antes, sem
// mudança, pra não perder o que já existia. A partir de agora, "+ Nova
// Demanda" abre o formulário unificado de Demandas Avulsas (com vínculo
// real a OP/OS/PV/Compra/OFI e um setor de destino escolhido no ato) —
// os novos registros passam a aparecer na tela do setor que recebeu, não
// mais nesta lista (mesma filosofia do sistema antigo: quem acompanha o
// andamento é o setor receptor). Campos do formulário antigo sem
// equivalente direto (Requerente, Tipo de Solicitação, Centro de Custo)
// saem — o criador já é registrado (currentUser), igual em todo o resto do
// sistema unificado; Tipo de Solicitação já não era gravado há tempos
// (sempre null no insert antigo).
const SETORES_DESTINO = ['Comercial','Serralheria','Chicotes','Laboratorio','Telecom','Compras','Almoxarifado','Engenharia','Producao','PCP'];

export default function AjustesProjetoTab({ currentUser }) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [tick, setTick] = useState(0);
  // Etapa 7.34 (02/10/2026): leitura que falha avisa em vez de parecer "Nenhuma demanda em aberto" (antes só ia para o console, ou nem isso)
  const [erroMinhas, setErroMinhas] = useState('');
  const [erroAjustes, setErroAjustes] = useState('');

  // ── MINHAS DEMANDAS (28/09/2026) ───────────────────────────────────────────
  // Quem abria uma demanda aqui não tinha como acompanhá-la: ela caía na tela
  // do setor de destino e sumia da vista de quem pediu. Agora esta tela mostra
  // o que a pessoa abriu — e, para gerente e Admin, também o que a equipe abriu.
  const [minhas, setMinhas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [filtroUsuario, setFiltroUsuario] = useState('');   // '' = todos do meu alcance
  const [verConcluidas, setVerConcluidas] = useState(false);
  const escopo = escopoDeDemandas(currentUser);

  /** De quem esta pessoa pode ver demandas. null = de todo mundo. */
  const emailsVisiveis = () => {
    if (escopo.modo === 'todas') return null;
    if (escopo.modo === 'setor') {
      const doSetor = usuarios.filter(u => escopo.perfis.includes(String(u.perfil || '').trim()));
      return [...new Set([currentUser?.email, ...doSetor.map(u => u.email)].filter(Boolean))];
    }
    return [currentUser?.email].filter(Boolean);
  };

  const carregarMinhas = async () => {
    let q = supabase.from('demandas_avulsas')
      .select('id,titulo,setor,status,prioridade,prazo,criado_em,criado_por,criado_por_nome,responsavel_nome,vinculo_descricao,membros,grupo_id')
      .order('criado_em', { ascending: false }).limit(300);
    const alcance = emailsVisiveis();
    if (filtroUsuario) q = q.eq('criado_por', filtroUsuario);
    else if (alcance) q = q.in('criado_por', alcance.length ? alcance : ['—sem—']);
    const { data, error } = await q;
    if (error) { setErroMinhas('Não foi possível ler as demandas (' + error.message + '). A lista abaixo pode estar desatualizada.'); return; }
    setErroMinhas('');
    let lista = data || [];
    // 08/10/2026: quem foi marcado como ENVOLVIDO numa demanda (de qualquer setor) a vê aqui, mesmo sem ter aberto — como os membros de um card do Trello
    if (!filtroUsuario && currentUser?.email) {
      const { data: env, error: erroEnv } = await supabase.from('demandas_avulsas')
        .select('id,titulo,setor,status,prioridade,prazo,criado_em,criado_por,criado_por_nome,responsavel_nome,vinculo_descricao,membros,grupo_id').contains('membros', [{ email: currentUser.email }])
        .order('criado_em', { ascending: false }).limit(300);
      if (erroEnv) { setErroMinhas('Não foi possível ler as demandas em que você é envolvido (' + erroEnv.message + ').'); }
      const ja = new Set(lista.map((x: any) => x.id));
      lista = [...lista, ...(env || []).filter((x: any) => !ja.has(x.id)).map((x: any) => ({ ...x, _envolvido: true }))]
        .sort((a: any, b: any) => String(b.criado_em).localeCompare(String(a.criado_em)));
    }
    setMinhas(lista);
  };

  useEffect(() => {
    if (escopo.modo === 'proprias') { setUsuarios([]); return; }
    supabase.from('auth_usuarios').select('email,nome,perfil').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios(data || []));
  }, [currentUser?.email]);

  useEffect(() => { carregarMinhas(); }, [filtroUsuario, usuarios.length, currentUser?.email]);

  // no filtro, um Admin vê todo mundo; o gerente, só a equipe dele
  const usuariosDoFiltro = escopo.modo === 'todas' ? usuarios
    : usuarios.filter(u => escopo.perfis?.includes(String(u.perfil || '').trim()) || u.email === currentUser?.email);

  const minhasVisiveis = minhas.filter(d => verConcluidas
    || !/conclu|cancel/i.test(String(d.status || '')));

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('demandas_setoriais')
      .select('*')
      .ilike('descricao', '[AJUSTE]%')
      .order('data_abertura', { ascending: false });
    if (error) { console.error('AjustesProjetoTab fetchAll:', error); setErroAjustes('Não foi possível ler os ajustes (' + error.message + '). A lista abaixo pode estar desatualizada.'); }
    else { setErroAjustes(''); setAjustes(data || []); }
    setLoading(false);
  };

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const a = modalObs;
    // Etapa 7.34 (02/10/2026): o histórico novo é uma CÓPIA (antes o push mexia na lista da própria janela, e a observação aparecia mesmo sem gravar) e o erro do banco é avisado:
    // com a gravação recusada a janela continua aberta com o texto, e nada vai para o histórico de alterações.
    const logs = [...(a.logs_demanda || []), { texto: novaObs, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() }];
    const { error } = await supabase.from('demandas_setoriais').update({ logs_demanda: logs }).eq('id', a.id);
    if (error) { alert('Erro ao salvar a observação: ' + error.message); return; }
    logChange({ module: 'demandas_gerais', entityType: 'demandas_setoriais', entityId: a.id, changeType: 'UPDATE',
      oldRow: { observacao: null }, newRow: { observacao: novaObs.slice(0, 120) }, user: currentUser });
    setNovaObs(''); fecharModalObs(); fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const fmtH = (h) => h != null ? Number(h).toFixed(1) + 'h' : '—';
  const tempoDecorrido = (inicio) => {
    if (!inicio) return '—';
    const diff = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
    const hh = Math.floor(diff / 3600).toString().padStart(2, '0');
    const mm = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const ss = (diff % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // as mesmas faixas de cor de antes (concluída verde, cancelada cinza, em andamento azul, o resto âmbar; prioridade alta vermelha, média âmbar, baixa verde), agora pela família do selo
  const familiaDoStatus = (s) => {
    const t = String(s || '').toLowerCase();
    if (/conclu/.test(t)) return 'ok';
    if (/cancel/.test(t)) return 'neutro';
    if (/andamento|execu/.test(t)) return 'info';
    return 'atencao';
  };

  const familiaPrioridade = (logs) => {
    const txt = (logs?.[0]?.texto || '').toLowerCase();
    if (txt.includes('prioridade: alta')) return 'erro';
    if (txt.includes('prioridade: media')) return 'atencao';
    if (txt.includes('prioridade: baixa')) return 'ok';
    return 'neutro';
  };

  const getPrioridade = (logs) => {
    const txt = logs?.[0]?.texto || '';
    const m = txt.match(/Prioridade:\s*(\w+)/);
    return m ? m[1] : 'Normal';
  };

  const abertos = ajustes.filter(a => a.status !== 'Concluido');
  const concluidos = ajustes.filter(a => a.status === 'Concluido');
  const { naoLidoSet: ajustesNaoLidos, marcarLidoLocal: marcarAjusteLidoLocal } = useUnreadMap('demandas_setoriais', ajustes.map(a => a.id), currentUser);
  const marcarAjusteLido = useMarkAsRead('demandas_setoriais', modalObs?.id, currentUser);
  const fecharModalObs = () => { marcarAjusteLido(); if (modalObs?.id) marcarAjusteLidoLocal(modalObs.id); setModalObs(null); };

  // Etapa 12e1 (02/10/2026): só a aparência — no molde das telas já migradas (quadros, tabela do guia, selos por família, botões e janela do sistema). Textos, colunas, ordem dos botões e lógica são os de antes.
  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiClipboardTextOutline} size={16} /> Demandas Gerais</span>
          <Botao variante="primario" pequeno icone={mdiPlus} onClick={() => setModalNova(true)}>Nova Demanda</Botao>
        </div>
        <div className="sec-body">
          <div className="acn-ajuda">
            Vincule a uma OP/OS/PV/Compra/OFI se for o caso, escolha o setor de destino e a demanda já cai
            direto na tela daquele setor — mesmo formulário rico usado em Engenharia/Almoxarifado/PCP/Compras.
          </div>
        </div>
      </div>

      {modalNova && (
        <NovaDemandaModal currentUser={currentUser} setoresDestino={SETORES_DESTINO}
          onClose={() => setModalNova(false)}
          onSaved={() => { setModalNova(false); carregarMinhas(); }} />
      )}

      {/* ACOMPANHAMENTO — o que eu pedi, e para onde foi */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>
            {escopo.modo === 'todas' ? 'Demandas abertas por todos' :
             escopo.modo === 'setor' ? 'Demandas do meu setor' : 'Demandas que eu abri ou em que sou envolvido'}
            {' '}({minhasVisiveis.length})
          </span>
          <div className="acn-cab-filtros">
            {usuariosDoFiltro.length > 1 && (
              <select className="acn-input acn-input-filtro" value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
                aria-label="Filtrar por quem abriu">
                <option value="">Quem abriu: todos</option>
                {usuariosDoFiltro.map(u => <option key={u.email} value={u.email}>{u.nome}</option>)}
              </select>
            )}
            <Botao pequeno variante={verConcluidas ? 'primario' : 'secundario'}
              onClick={() => setVerConcluidas(v => !v)}>
              {verConcluidas ? 'Escondendo nada' : 'Ver concluídas'}
            </Botao>
          </div>
        </div>
        <div className="sec-body">
          {erroMinhas && <Faixa tom="erro">{erroMinhas}</Faixa>}
          {minhasVisiveis.length === 0 ? (
            erroMinhas ? null : <div className="acn-empty">
              {filtroUsuario ? 'Esta pessoa não tem demandas em aberto.' : 'Nenhuma demanda em aberto.'}
            </div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr>
                  <th>Aberta em</th><th>Quem abriu</th><th>Demanda</th><th>Setor</th>
                  <th>Vínculo</th><th>Responsável</th><th>Prazo</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {minhasVisiveis.map(d => (
                    <tr key={d.id}>
                      <td className="acn-nowrap">{fmtDt(d.criado_em)}</td>
                      <td>{d.criado_por_nome || '—'}</td>
                      <td className="acn-texto-longo acn-dg-texto">
                        {d.titulo || '—'}
                        {d._envolvido && <> <Selo familia="info" ponto={false} title="Você foi marcado como envolvido nesta demanda">envolvido</Selo></>}
                        {d.grupo_id && <> <Selo familia="marca" ponto={false} title="Demanda composta: cada setor tem a sua parte (esta linha é a parte deste setor)">composta</Selo></>}
                        {Array.isArray(d.membros) && d.membros.length > 0 && <span className="acn-fraco" title={'Envolvidos: ' + d.membros.map((m: any) => m.nome || m.email).join(', ')}> 👥 {d.membros.length}</span>}
                      </td>
                      <td>{d.setor || '—'}</td>
                      <td className="acn-fraco">{d.vinculo_descricao || '—'}</td>
                      <td>{d.responsavel_nome || '—'}</td>
                      <td className="acn-nowrap">{d.prazo ? fmtDt(d.prazo) : '—'}</td>
                      <td><Selo familia={familiaDoStatus(d.status)} ponto={false}>{d.status || '—'}</Selo></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* AJUSTES ABERTOS — histórico do sistema antigo, registrado antes desta unificação */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Ajustes em Aberto (histórico) ({abertos.length})</span></div>
        <div className="sec-body">
          {erroAjustes && <Faixa tom="erro">{erroAjustes}</Faixa>}
          {loading ? <div className="acn-empty">Carregando...</div> : abertos.length === 0 ? (
            erroAjustes ? null : <div className="acn-empty">Nenhum ajuste em aberto.</div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr>
                  <th>Data</th><th>OP Ref.</th><th>Requerente</th><th>Descricao</th>
                  <th>Setor</th><th>Prioridade</th><th>Status</th><th>Responsavel</th><th>Tempo</th><th>Acoes</th>
                </tr></thead>
                <tbody>
                  {abertos.map(a => {
                    const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                    const prio = getPrioridade(a.logs_demanda);
                    const naoLida = ajustesNaoLidos.has(String(a.id));
                    return (
                      <tr key={a.id} className={naoLida ? 'acn-linha-nova' : ''}>
                        <td className="acn-nowrap">{fmtDt(a.data_abertura)}</td>
                        <td className="acn-nowrap">{a.numero_opl || '—'}</td>
                        <td>{a.criado_por_nome || '—'}</td>
                        <td className="acn-texto-longo acn-dg-texto" title={desc}>{desc}</td>
                        <td>
                          {a.setor_destino || '—'}
                          {a.setor_destino === 'Compras' && a.tipo_solicitacao && (
                            <div>
                              <Selo familia={a.tipo_solicitacao === 'cotacao' ? 'marca' : 'info'} ponto={false}>
                                {a.tipo_solicitacao === 'cotacao' ? 'Cotação' : 'Compra'}
                              </Selo>
                            </div>
                          )}
                        </td>
                        <td><Selo familia={familiaPrioridade(a.logs_demanda)} ponto={false}>{prio}</Selo></td>
                        <td><Selo familia={a.status === 'Em Andamento' ? 'info' : 'atencao'} ponto={false}>{a.status}</Selo></td>
                        <td>{a.responsavel_nome || '—'}</td>
                        <td className="acn-nowrap">
                          {a.status === 'Em Andamento' && a.data_inicio
                            ? <span className="acn-num acn-forte">{tempoDecorrido(a.data_inicio)}</span>
                            : fmtH(a.tempo_execucao_horas)
                          }
                        </td>
                        <td>
                          <Botao pequeno onClick={() => { setModalObs(a); setNovaObs(''); }}>VER / OBS</Botao>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* HISTORICO */}
      {concluidos.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Historico de Ajustes Concluidos ({concluidos.length})</span></div>
          <div className="sec-body">
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr>
                  <th>Data</th><th>OP Ref.</th><th>Requerente</th><th>Descricao</th>
                  <th>Setor</th><th>Responsavel</th><th>Conclusao</th><th>Tempo</th>
                </tr></thead>
                <tbody>
                  {concluidos.map(a => {
                    const desc = a.descricao?.replace('[AJUSTE] ', '') || '—';
                    return (
                      <tr key={a.id}>
                        <td className="acn-nowrap">{fmtDt(a.data_abertura)}</td>
                        <td className="acn-nowrap">{a.numero_opl || '—'}</td>
                        <td>{a.criado_por_nome || '—'}</td>
                        <td className="acn-texto-longo acn-dg-texto" title={desc}>{desc}</td>
                        <td>{a.setor_destino || '—'}</td>
                        <td>{a.responsavel_nome || '—'}</td>
                        <td className="acn-nowrap">{fmtDt(a.data_conclusao)}</td>
                        <td>{fmtH(a.tempo_execucao_horas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBS */}
      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-sac-jan">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiHistory} size={18} /> Historico — {modalObs.descricao?.replace('[AJUSTE] ','')}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-quadro acn-dg-historico">
                {(modalObs.logs_demanda||[]).length === 0
                  ? <div className="acn-ajuda">Sem historico de logs.</div>
                  : (modalObs.logs_demanda||[]).map((l,i) => (
                    <div key={i} className="acn-dg-log">
                      <span className="acn-ajuda">{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                      <div>{l.texto}</div>
                    </div>
                  ))
                }
              </div>
              <div className="form-group">
                <label className="acn-label">Nova Observacao</label>
                <textarea className="acn-input" rows={3}
                  placeholder="Adicione uma observacao..." value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={addObs}>SALVAR</Botao>
              <Botao onClick={fecharModalObs}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      <OplMovimentadas setor="Ajustes" />
      <DemandaFooter setor="Ajustes de Projeto" />
    </div>
  );
}
