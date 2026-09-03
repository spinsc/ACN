// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// AuditSystem — infraestrutura global de auditoria/colaboração, reutilizável
// por qualquer módulo (não recriar isso por módulo — ver plano em
// C:\Users\fisca\.claude\plans\eager-whistling-tome.md).
//
// Peças:
//   logChange()        — grava o diff de uma alteração em audit_log
//   useAuditHistory()  — histórico paginado de um registro
//   useUnreadChanges() — o que mudou desde a última vez que ESTE usuário viu
//                        este registro (watermark em entity_views + Realtime)
//   useMarkAsRead()    — marca como visto (chamar ao FECHAR a tela, nunca no mount)
//   <ChangeHighlight>  — destaque visual sutil em torno de um valor não-lido
//   <AuditHistory>     — painel de histórico formatado, pronto pra usar
//
// Modelo de segurança: mesma convenção de confiança já usada no resto do
// sistema (RLS desligado, permissão só no frontend via abas_permitidas) — o
// sistema usa auth própria (auth_usuarios + localStorage), não Supabase Auth,
// então o Postgres nunca vê "qual usuário" está por trás de uma query.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Campos técnicos que nunca fazem sentido auditar (timestamps de "atualizado
// em", geridos pelo próprio salvamento, não são "uma alteração" em si).
const CAMPOS_IGNORADOS = new Set(['atualizado_em', 'updated_at', 'criado_em', 'created_at', 'id']);

const fmtValor = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (v instanceof Date) return v.toLocaleString('pt-BR');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// ─────────────────────────────────────────────────────────────────────────────
// logChange — grava em audit_log o diff entre oldRow/newRow.
// changeType: 'CREATE' | 'UPDATE' | 'DELETE'.
// formatters (opcional): { campo: (valorCru) => 'texto legível' } — usar
// sempre que o valor bruto (ex: um uuid de estagio_id) não for legível por si
// só; o histórico grava o texto já resolvido, não o valor bruto.
// metadata (opcional): objeto livre extra (ex: snapshot completo em CREATE).
// ─────────────────────────────────────────────────────────────────────────────
export async function logChange({ module, entityType, entityId, changeType, oldRow, newRow, user, formatters, metadata }) {
  if (!entityId || !user) return;
  const userNome = user.nome || user.email || 'Sistema';
  const base = { user_id: user.id || null, user_nome: userNome, module, entity_type: entityType, entity_id: String(entityId) };

  if (changeType === 'CREATE') {
    await supabase.from('audit_log').insert([{ ...base, change_type: 'CREATE', metadata: metadata || newRow || null }]);
    return;
  }
  if (changeType === 'DELETE') {
    await supabase.from('audit_log').insert([{ ...base, change_type: 'DELETE', metadata: metadata || oldRow || null }]);
    return;
  }

  // UPDATE — um registro por campo que realmente mudou
  const linhas = [];
  const campos = new Set([...Object.keys(oldRow || {}), ...Object.keys(newRow || {})]);
  for (const campo of campos) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    if (!Object.prototype.hasOwnProperty.call(newRow || {}, campo)) continue; // só campos que o form realmente gerencia
    const antes = oldRow ? oldRow[campo] : undefined;
    const depois = newRow[campo];
    const antesNorm = antes === undefined ? null : antes;
    const depoisNorm = depois === undefined ? null : depois;
    if (JSON.stringify(antesNorm) === JSON.stringify(depoisNorm)) continue;
    const format = formatters?.[campo];
    linhas.push({
      ...base, change_type: 'UPDATE', field_name: campo,
      old_value: format ? format(antesNorm) : fmtValor(antesNorm),
      new_value: format ? format(depoisNorm) : fmtValor(depoisNorm),
      metadata: metadata || null,
    });
  }
  if (linhas.length === 0) return;
  await supabase.from('audit_log').insert(linhas);
}

// ─────────────────────────────────────────────────────────────────────────────
// useAuditHistory — histórico paginado de um registro específico.
// ─────────────────────────────────────────────────────────────────────────────
export function useAuditHistory(entityType, entityId, { pageSize = 20 } = {}) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const paginaRef = useRef(0);

  const carregar = useCallback(async (reset = false) => {
    if (!entityType || !entityId) return;
    setLoading(true);
    const pagina = reset ? 0 : paginaRef.current;
    const { data } = await supabase.from('audit_log').select('*')
      .eq('entity_type', entityType).eq('entity_id', String(entityId))
      .order('created_at', { ascending: false })
      .range(pagina * pageSize, pagina * pageSize + pageSize - 1);
    const novos = data || [];
    setItens(prev => reset ? novos : [...prev, ...novos]);
    setTemMais(novos.length === pageSize);
    paginaRef.current = pagina + 1;
    setLoading(false);
  }, [entityType, entityId, pageSize]);

  useEffect(() => { paginaRef.current = 0; carregar(true); }, [entityType, entityId]); // eslint-disable-line

  return { itens, loading, temMais, carregarMais: () => carregar(false), recarregar: () => carregar(true) };
}

// ─────────────────────────────────────────────────────────────────────────────
// useUnreadChanges — o que mudou desde a última vez que este usuário viu este
// registro. Sem watermark ainda (nunca visitou) = tudo é considerado não-lido,
// pra sinalizar "existe histórico pendente" mesmo no primeiro acesso.
// Assina Realtime em audit_log filtrado por entity_id — outros usuários
// editando o mesmo registro atualizam isso ao vivo, sem precisar recarregar.
// ─────────────────────────────────────────────────────────────────────────────
export function useUnreadChanges(entityType, entityId, currentUser) {
  const [naoLidos, setNaoLidos] = useState([]); // linhas de audit_log não vistas
  const [loading, setLoading] = useState(true);

  const buscar = useCallback(async () => {
    if (!entityType || !entityId || !currentUser?.id) { setLoading(false); return; }
    setLoading(true);
    const { data: watermark } = await supabase.from('entity_views').select('last_seen_at')
      .eq('user_id', currentUser.id).eq('entity_type', entityType).eq('entity_id', String(entityId)).maybeSingle();
    let q = supabase.from('audit_log').select('*')
      .eq('entity_type', entityType).eq('entity_id', String(entityId))
      .neq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (watermark?.last_seen_at) q = q.gt('created_at', watermark.last_seen_at);
    const { data } = await q;
    setNaoLidos(data || []);
    setLoading(false);
  }, [entityType, entityId, currentUser?.id]);

  useEffect(() => { buscar(); }, [buscar]);

  useEffect(() => {
    if (!entityType || !entityId) return;
    const ch = supabase.channel(`audit-${entityType}-${entityId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log', filter: `entity_id=eq.${entityId}` }, (payload) => {
        if (payload.new?.entity_type !== entityType) return;
        if (payload.new?.user_id === currentUser?.id) return; // própria alteração não gera "não lido" pra mim mesmo
        setNaoLidos(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [entityType, entityId, currentUser?.id]);

  const camposNaoLidos = new Set(naoLidos.filter(n => n.change_type === 'UPDATE').map(n => n.field_name));
  return { naoLidos, camposNaoLidos, temNaoLidos: naoLidos.length > 0, loading, recarregar: buscar };
}

// ─────────────────────────────────────────────────────────────────────────────
// useUnreadMap — versão em lote de useUnreadChanges, pra listas/quadros
// (Kanban, tabelas) onde N cards precisam saber se têm pendência sem fazer N
// consultas — 2 consultas no total, independente de quantos itens existem.
// Retorna um Set<entityId> com os registros que têm alteração não vista pelo
// usuário atual. Assina Realtime uma única vez (não um canal por card).
// ─────────────────────────────────────────────────────────────────────────────
export function useUnreadMap(entityType, entityIds, currentUser) {
  const [naoLidoSet, setNaoLidoSet] = useState(() => new Set());
  const idsKey = (entityIds || []).filter(Boolean).map(String).sort().join(',');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!entityType || !currentUser?.id || !idsKey) { setNaoLidoSet(new Set()); return; }
      const ids = idsKey.split(',');
      const { data: watermarks } = await supabase.from('entity_views').select('entity_id,last_seen_at')
        .eq('user_id', currentUser.id).eq('entity_type', entityType).in('entity_id', ids);
      const watermarkMap = new Map((watermarks || []).map(w => [w.entity_id, w.last_seen_at]));
      const { data: mudancas } = await supabase.from('audit_log').select('entity_id,created_at')
        .eq('entity_type', entityType).in('entity_id', ids).neq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      const resultado = new Set();
      for (const m of mudancas || []) {
        if (resultado.has(m.entity_id)) continue;
        const marca = watermarkMap.get(m.entity_id);
        if (!marca || m.created_at > marca) resultado.add(m.entity_id);
      }
      if (!cancelado) setNaoLidoSet(resultado);
    })();
    return () => { cancelado = true; };
  }, [entityType, idsKey, currentUser?.id]);

  useEffect(() => {
    if (!entityType || !currentUser?.id) return;
    const ch = supabase.channel(`audit-map-${entityType}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, (payload) => {
        if (payload.new?.entity_type !== entityType) return;
        if (payload.new?.user_id === currentUser.id) return;
        setNaoLidoSet(prev => new Set(prev).add(String(payload.new.entity_id)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [entityType, currentUser?.id]);

  // Atualização otimista: chamar depois de marcarComoLido() (useMarkAsRead) pra
  // sumir com o destaque do card/linha na hora, sem esperar um refetch/reload.
  const marcarLidoLocal = useCallback((entityId) => {
    setNaoLidoSet(prev => { const next = new Set(prev); next.delete(String(entityId)); return next; });
  }, []);

  return { naoLidoSet, marcarLidoLocal };
}

// ─────────────────────────────────────────────────────────────────────────────
// useMarkAsRead — expõe marcarComoLido(), pra chamar explicitamente ao SAIR da
// tela (fechar modal) — nunca automaticamente só porque os dados carregaram.
// ─────────────────────────────────────────────────────────────────────────────
export function useMarkAsRead(entityType, entityId, currentUser) {
  const marcarComoLido = useCallback(async () => {
    if (!entityType || !entityId || !currentUser?.id) return;
    await supabase.from('entity_views').upsert({
      user_id: currentUser.id, entity_type: entityType, entity_id: String(entityId), last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,entity_type,entity_id' });
  }, [entityType, entityId, currentUser?.id]);
  return marcarComoLido;
}

// ─────────────────────────────────────────────────────────────────────────────
// <ChangeHighlight> — destaque sutil (sem popup) em torno de um valor que
// mudou e ainda não foi visto por este usuário.
// ─────────────────────────────────────────────────────────────────────────────
export function ChangeHighlight({ field, camposNaoLidos, children, title }) {
  const unread = camposNaoLidos?.has?.(field);
  if (!unread) return children;
  return (
    <span title={title || 'Alterado — ainda não visualizado'} style={{
      background: '#fef9c3', borderLeft: '2px solid #eab308', borderRadius: 3,
      padding: '1px 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
    }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// <AuditHistory> — painel de histórico formatado, paginado.
// fieldLabels (opcional): { campo: 'Rótulo amigável' } — sem isso usa o nome
// bruto da coluna.
// ─────────────────────────────────────────────────────────────────────────────
export function AuditHistory({ entityType, entityId, fieldLabels = {} }) {
  const { itens, loading, temMais, carregarMais } = useAuditHistory(entityType, entityId);
  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  if (itens.length === 0 && !loading) {
    return <div style={{ fontSize: 10, color: '#94a3b8', padding: '8px 0' }}>Nenhuma alteração registrada ainda.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {itens.map(item => (
        <div key={item.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '7px 10px', fontSize: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 9, marginBottom: 3 }}>
            <span>{fmtDt(item.created_at)}</span>
            <span style={{ fontWeight: 700 }}>{item.user_nome}</span>
          </div>
          {item.change_type === 'CREATE' && <div style={{ color: '#16a34a', fontWeight: 600 }}>✚ Registro criado</div>}
          {item.change_type === 'DELETE' && <div style={{ color: '#dc2626', fontWeight: 600 }}>🗑 Registro excluído</div>}
          {item.change_type === 'UPDATE' && (
            <div>
              <strong>{fieldLabels[item.field_name] || item.field_name}</strong>
              <div style={{ color: '#475569', marginTop: 2 }}>
                <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{item.old_value || '—'}</span>
                {' → '}
                <span style={{ fontWeight: 600 }}>{item.new_value || '—'}</span>
              </div>
            </div>
          )}
        </div>
      ))}
      {temMais && (
        <button onClick={carregarMais} disabled={loading}
          style={{ background: '#f1f5f9', border: '1px solid #d1d5db', borderRadius: 4, padding: '5px', fontSize: 9, color: '#64748b', cursor: 'pointer' }}>
          {loading ? 'Carregando...' : 'Ver mais'}
        </button>
      )}
    </div>
  );
}
