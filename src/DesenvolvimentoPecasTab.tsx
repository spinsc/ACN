// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DesenvolvimentoPecasTab — sub-aba "Desenvolvimento" da Engenharia
// Controle de peças em desenvolvimento por etapas (Concepção → Entrega).
// Demandas podem ser lançadas automaticamente (ao iniciar uma tarefa de
// Engenharia marcando "Precisa de Desenvolvimento") ou manualmente aqui.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';
import Linkify from './Linkify';

export const ETAPAS_DEV = [
  'Concepção', 'Criação', 'Desenvolvimento', 'Prototipagem',
  'Validação', 'Produção', 'Acabamento', 'Entrega',
];

export function etapasIniciais() {
  return ETAPAS_DEV.map(nome => ({
    nome, status: 'pendente', // pendente | em_andamento | concluida
    responsavel: '', data_prevista: '',
    data_inicio: null, data_conclusao: null,
    observacoes: [] as { texto: string; usuario: string; hora: string }[],
  }));
}

// Chamado pelo EngenhariaTab quando "Precisa de Desenvolvimento" é marcado
// ao iniciar a análise de uma OP/OS.
export async function criarDemandaDesenvolvimento({ opl, descricao, currentUser }: any) {
  return supabase.from('engenharia_desenvolvimento').insert([{
    opl_id: opl?.id || null,
    numero_opl: opl?.opl || null,
    cliente_nome: opl?.cliente_nome || null,
    titulo: opl ? `Desenvolvimento — ${opl.opl}` : 'Nova demanda de desenvolvimento',
    descricao: descricao || null,
    etapas: etapasIniciais(),
    origem: 'automatico',
    criado_por: currentUser?.email,
    criado_por_nome: currentUser?.nome,
  }]);
}

function fmtDt(d: string) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
function fmtDtHr(d: string) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }

function corEtapa(status: string) {
  if (status === 'concluida') return '#22c55e';
  if (status === 'em_andamento') return '#3b82f6';
  return '#cbd5e1';
}

// ─── Anexos inline (armazenados no próprio registro, coluna `anexos`) ────────
function AnexosDev({ demanda, onAtualizado }: any) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const anexos = demanda.anexos || [];

  const upload = async (files: FileList) => {
    setUploading(true);
    const novos = [...anexos];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safeName = f.name.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 100);
      const path = `desenvolvimento/${demanda.id}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: f.type });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        novos.push({ nome: f.name, url: pub?.publicUrl || '' });
      }
    }
    await supabase.from('engenharia_desenvolvimento').update({ anexos: novos, atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
    if (ref.current) ref.current.value = '';
    setUploading(false);
    onAtualizado();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        {anexos.map((a: any, i: number) => (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{
            fontSize: 10, background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d',
            borderRadius: 4, padding: '3px 8px', textDecoration: 'none', fontWeight: 600,
          }}>📎 {a.nome}</a>
        ))}
      </div>
      <input ref={ref} type="file" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) upload(e.target.files); }} />
      <button className="acn-btn" style={{ background: '#475569', fontSize: 9, padding: '3px 8px', opacity: uploading ? .6 : 1 }}
        disabled={uploading} onClick={() => ref.current?.click()}>
        {uploading ? 'Enviando...' : '📎 Anexar Arquivo'}
      </button>
    </div>
  );
}

// ─── Área livre (texto/links/anotações, com botão salvar) ────────────────────
function AreaLivreDev({ demanda, onAtualizado }: any) {
  const [texto, setTexto] = useState(demanda.area_livre || '');
  const [salvando, setSalvando] = useState(false);
  const alterado = texto !== (demanda.area_livre || '');

  const salvar = async () => {
    setSalvando(true);
    await supabase.from('engenharia_desenvolvimento').update({ area_livre: texto, atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
    setSalvando(false);
    onAtualizado();
  };

  return (
    <div>
      <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
        placeholder="Área livre — anotações, links, referências..."
        value={texto} onChange={e => setTexto(e.target.value)} />
      {alterado && (
        <button className="acn-btn" style={{ background: '#0f766e', fontSize: 9, padding: '3px 10px', marginTop: 4 }}
          disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando...' : '💾 Salvar Área Livre'}
        </button>
      )}
    </div>
  );
}

// ─── Painel de uma etapa (expandido quando é a etapa ativa) ──────────────────
function PainelEtapa({ demanda, etapa, idx, onAtualizado, currentUser }: any) {
  const [responsavel, setResponsavel] = useState(etapa.responsavel || currentUser?.nome || '');
  const [dataPrevista, setDataPrevista] = useState(etapa.data_prevista || '');
  const [obsTexto, setObsTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  const atualizarEtapas = async (mutar: (e: any) => void) => {
    setSalvando(true);
    const etapas = (demanda.etapas || []).map((e: any, i: number) => {
      if (i !== idx) return e;
      const copia = { ...e };
      mutar(copia);
      return copia;
    });
    await supabase.from('engenharia_desenvolvimento').update({ etapas, atualizado_em: new Date().toISOString() }).eq('id', demanda.id);
    setSalvando(false);
    onAtualizado();
  };

  const iniciar = () => {
    if (!responsavel.trim()) { alert('Informe o responsável.'); return; }
    atualizarEtapas(e => {
      e.status = 'em_andamento';
      e.responsavel = responsavel.trim();
      e.data_prevista = dataPrevista || null;
      e.data_inicio = new Date().toISOString();
    });
  };

  const addObs = () => {
    if (!obsTexto.trim()) return;
    atualizarEtapas(e => {
      e.observacoes = [...(e.observacoes || []), { texto: obsTexto.trim(), usuario: currentUser?.nome || '', hora: new Date().toISOString() }];
    });
    setObsTexto('');
  };

  const concluir = () => {
    if (!confirm(`Concluir etapa "${etapa.nome}"?`)) return;
    atualizarEtapas(e => {
      e.status = 'concluida';
      e.data_conclusao = new Date().toISOString();
    });
  };

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 11, color: corEtapa(etapa.status), marginBottom: 8 }}>
        {etapa.status === 'em_andamento' ? '▶' : '○'} Etapa: {etapa.nome}
      </div>

      {etapa.status === 'pendente' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="acn-label">Responsável *</label>
              <ColaboradorSelect value={responsavel} onChange={setResponsavel} placeholder="Selecione o responsável" />
            </div>
            <div style={{ width: 150 }}>
              <label className="acn-label">Data Prevista</label>
              <input type="date" className="acn-input" style={{ width: '100%' }} value={dataPrevista} onChange={e => setDataPrevista(e.target.value)} />
            </div>
          </div>
          <button className="acn-btn" style={{ background: '#2563eb', fontSize: 10 }} disabled={salvando} onClick={iniciar}>
            ▶ Iniciar Etapa
          </button>
        </div>
      )}

      {etapa.status === 'em_andamento' && (
        <div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
            Responsável: <strong>{etapa.responsavel || '—'}</strong>
            {etapa.data_prevista && <> · Previsão: <strong>{fmtDt(etapa.data_prevista)}</strong></>}
            {etapa.data_inicio && <> · Iniciado em {fmtDtHr(etapa.data_inicio)}</>}
          </div>

          {(etapa.observacoes || []).length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: 8, marginBottom: 8, maxHeight: 140, overflowY: 'auto' }}>
              {etapa.observacoes.map((o: any, i: number) => (
                <div key={i} style={{ fontSize: 10, borderBottom: '1px solid #f1f5f9', paddingBottom: 4, marginBottom: 4 }}>
                  <span style={{ color: '#94a3b8', fontSize: 9 }}>{fmtDtHr(o.hora)} · {o.usuario}</span>
                  <div style={{ color: '#374151', marginTop: 1 }}>{o.texto}</div>
                </div>
              ))}
            </div>
          )}

          <textarea className="acn-input" rows={2} style={{ width: '100%', resize: 'vertical', marginBottom: 6, fontSize: 11 }}
            placeholder="Nova observação / nota desta etapa..."
            value={obsTexto} onChange={e => setObsTexto(e.target.value)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="acn-btn" style={{ background: '#475569', fontSize: 9 }} disabled={salvando || !obsTexto.trim()} onClick={addObs}>
              📝 Salvar Observação
            </button>
            <button className="acn-btn" style={{ background: '#22c55e', fontSize: 9, fontWeight: 700 }} disabled={salvando} onClick={concluir}>
              ✅ Concluir Etapa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card de uma demanda ──────────────────────────────────────────────────────
function DemandaDevCard({ demanda, onAtualizado, currentUser }: any) {
  const etapas = demanda.etapas || [];
  const concluidas = etapas.filter((e: any) => e.status === 'concluida').length;
  const pct = etapas.length ? Math.round((concluidas / etapas.length) * 100) : 0;
  const idxAtiva = etapas.findIndex((e: any) => e.status !== 'concluida');
  const finalizada = idxAtiva === -1;

  return (
    <div className="sec-card">
      <div className="sec-hdr" style={{ background: finalizada ? '#166534' : '#1e293b' }}>
        <span>
          {demanda.numero_opl ? <>OPL {demanda.numero_opl} — </> : ''}{demanda.titulo}
          {demanda.origem === 'automatico' && (
            <span style={{ marginLeft: 6, fontSize: 8, background: '#7c3aed', padding: '1px 6px', borderRadius: 8 }}>AUTO</span>
          )}
        </span>
        <span style={{ fontSize: 10 }}>{finalizada ? '✅ Concluída' : `${concluidas}/${etapas.length} etapas`}</span>
      </div>
      <div className="sec-body">
        {(demanda.cliente_nome || demanda.descricao) && (
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>
            {demanda.cliente_nome && <div><strong>Cliente:</strong> {demanda.cliente_nome}</div>}
            {demanda.descricao && <div style={{ marginTop: 2 }}><Linkify text={demanda.descricao} /></div>}
          </div>
        )}

        {/* Bargraph de andamento — logo abaixo da descrição */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: finalizada ? '#16a34a' : '#3b82f6', transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{pct}% concluído</div>
        </div>

        {/* Stepper de etapas */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {etapas.map((e: any, i: number) => (
            <span key={e.nome} title={`${e.nome} — ${e.status}`} style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
              background: corEtapa(e.status), color: e.status === 'pendente' ? '#475569' : '#fff',
              border: i === idxAtiva ? '2px solid #1e293b' : 'none',
            }}>
              {i + 1}. {e.nome}
            </span>
          ))}
        </div>

        {!finalizada && (
          <PainelEtapa demanda={demanda} etapa={etapas[idxAtiva]} idx={idxAtiva} onAtualizado={onAtualizado} currentUser={currentUser} />
        )}

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>Anexos</div>
          <AnexosDev demanda={demanda} onAtualizado={onAtualizado} />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>Área Livre</div>
          <AreaLivreDev demanda={demanda} onAtualizado={onAtualizado} />
        </div>
      </div>
    </div>
  );
}

// ─── Modal de criação manual ──────────────────────────────────────────────────
function ModalNovaDemanda({ onClose, onCriado, currentUser }: any) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
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
    if (!titulo.trim()) { alert('Informe o título/peça em desenvolvimento.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('engenharia_desenvolvimento').insert([{
      opl_id: opSelecionada?.id || null,
      numero_opl: opSelecionada?.opl || null,
      cliente_nome: opSelecionada?.cliente_nome || null,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      etapas: etapasIniciais(),
      origem: 'manual',
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    onCriado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-title">+ Nova Demanda de Desenvolvimento</div>

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
        {opSelecionada && (
          <div style={{ fontSize: 10, color: '#15803d', marginBottom: 8 }}>✅ Vinculado a {opSelecionada.opl}</div>
        )}

        <label className="acn-label">Título / Peça em Desenvolvimento *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 8 }}
          placeholder="Ex: Suporte de fixação da barra sinalizadora" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />

        <label className="acn-label">Descrição</label>
        <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          placeholder="Detalhes do que precisa ser desenvolvido..." value={descricao} onChange={e => setDescricao(e.target.value)} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} disabled={salvando} onClick={criar}>
            {salvando ? 'Criando...' : '✅ Criar Demanda'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DesenvolvimentoPecasTab({ currentUser, buscaInicial }: { currentUser: any; buscaInicial?: string }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'andamento' | 'concluidas'>('todas');
  const [busca, setBusca] = useState(buscaInicial || '');
  const [modalNova, setModalNova] = useState(false);

  // Deep-link da busca global (DashboardTab.tsx) — chega depois da
  // montagem inicial (a aba Engenharia troca de sub-aba e só então
  // dispara o evento), então precisa reagir a mudanças, não só ao mount.
  useEffect(() => { if (buscaInicial) setBusca(buscaInicial); }, [buscaInicial]);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from('engenharia_desenvolvimento').select('*').order('criado_em', { ascending: false });
    setDemandas(data || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const filtradas = demandas.filter(d => {
    const etapas = d.etapas || [];
    const finalizada = etapas.length > 0 && etapas.every((e: any) => e.status === 'concluida');
    if (filtro === 'andamento' && finalizada) return false;
    if (filtro === 'concluidas' && !finalizada) return false;
    if (busca.trim()) {
      const t = busca.trim().toLowerCase();
      const alvo = `${d.titulo||''} ${d.descricao||''} ${d.numero_opl||''} ${d.cliente_nome||''}`.toLowerCase();
      if (!alvo.includes(t)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>🔩 Desenvolvimento de Peças ({filtradas.length})</span>
          <button className="acn-btn" style={{ background: '#0f766e', fontSize: 10 }} onClick={() => setModalNova(true)}>
            + Nova Demanda
          </button>
        </div>
        <div className="sec-body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['todas', 'andamento', 'concluidas'] as const).map(f => (
            <button key={f} className="acn-btn"
              style={{ background: filtro === f ? '#1e293b' : '#e2e8f0', color: filtro === f ? '#fff' : '#475569', fontSize: 10 }}
              onClick={() => setFiltro(f)}>
              {f === 'todas' ? 'Todas' : f === 'andamento' ? 'Em Andamento' : 'Concluídas'}
            </button>
          ))}
          <input placeholder="🔍 Buscar por título, OPL ou cliente..." value={busca} onChange={e => setBusca(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10, minWidth: 220 }} />
        </div>
      </div>

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : filtradas.length === 0 ? (
        <div className="acn-empty">Nenhuma demanda de desenvolvimento {filtro !== 'todas' ? 'nesse filtro' : 'cadastrada ainda'}.</div>
      ) : (
        filtradas.map(d => (
          <DemandaDevCard key={d.id} demanda={d} onAtualizado={carregar} currentUser={currentUser} />
        ))
      )}

      {modalNova && (
        <ModalNovaDemanda currentUser={currentUser} onClose={() => setModalNova(false)}
          onCriado={() => { setModalNova(false); carregar(); }} />
      )}
    </div>
  );
}
