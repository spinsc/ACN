// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Avisos de OP — painel próprio (botão "Avisos" no topo).
//
// As atualizações automáticas de uma OP (iniciar, concluir, retrabalho,
// acompanhamento da adaptação, embalagem/frete — ver NotificarEnvolvidos.ts)
// iam para Menções e se misturavam com as menções de verdade. Agora ficam aqui:
// uma lista simples, sem "resolver" nem histórico — "Limpar" apaga o aviso.
// Continuam gravados em `mencoes` com contexto 'op_adaptacao' (Menções os ignora).
// Menção feita com @ no texto do acompanhamento continua indo para Menções.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { OplDetalheModal } from './AcnTabShared';

export const CONTEXTO_AVISO_OP = 'op_adaptacao';

function filtroDoUsuario(currentUser: any) {
  const uid = String(currentUser?.id || '');
  const nome = String(currentUser?.nome || '');
  // mesmo critério de Menções: por id e, de reserva, por nome
  return nome ? `mencionado_id.eq.${uid},mencionado_nome.ilike.%${nome}%` : `mencionado_id.eq.${uid}`;
}

export async function contarAvisosOp(currentUser: any): Promise<number> {
  if (!currentUser?.id) return 0;
  const { count } = await supabase.from('mencoes')
    .select('id', { count: 'exact', head: true })
    .or(filtroDoUsuario(currentUser))
    .eq('contexto', CONTEXTO_AVISO_OP);
  return count || 0;
}

const fmtDT = (v: string) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
};

export default function AvisosOpPanel({ currentUser, onClose, onCountChange }: any) {
  const [avisos, setAvisos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limpando, setLimpando] = useState(false);
  const [opAberta, setOpAberta] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('mencoes').select('*')
      .or(filtroDoUsuario(currentUser))
      .eq('contexto', CONTEXTO_AVISO_OP)
      .order('criado_em', { ascending: false })
      .limit(300);
    setAvisos(data || []);
    onCountChange?.((data || []).length);
    setLoading(false);
  }, [currentUser?.id, currentUser?.nome, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const limparUm = async (a: any) => {
    setAvisos(prev => prev.filter(x => x.id !== a.id));
    await supabase.from('mencoes').delete().eq('id', a.id).eq('contexto', CONTEXTO_AVISO_OP);
    load();
  };

  const limparTodos = async () => {
    if (!avisos.length) return;
    if (!confirm(`Limpar os ${avisos.length} avisos de OP? Eles saem da lista e não ficam guardados.`)) return;
    setLimpando(true);
    await supabase.from('mencoes').delete()
      .or(filtroDoUsuario(currentUser))
      .eq('contexto', CONTEXTO_AVISO_OP);
    setLimpando(false);
    load();
  };

  const abrirOp = async (a: any) => {
    if (!a.contexto_id) return;
    const { data } = await supabase.from('oples').select('*').eq('id', a.contexto_id).maybeSingle();
    if (data) setOpAberta(data);
    else alert('Esta OP não foi encontrada (pode ter sido excluída).');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} onClick={onClose} />

      <div style={{ position: 'relative', zIndex: 1, width: 440, maxWidth: '95vw', height: '100vh', background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ background: '#0e7490', color: '#fff', padding: '14px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>📢 Avisos de OP</div>
              <div style={{ fontSize: 10, opacity: .85, marginTop: 2 }}>
                {avisos.length ? `${avisos.length} aviso(s) de andamento das OPs` : 'Nenhum aviso no momento'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={limparTodos} disabled={!avisos.length || limpando}
                style={{ background: '#fff', color: '#0e7490', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 10, fontWeight: 800,
                  cursor: avisos.length ? 'pointer' : 'default', opacity: avisos.length ? 1 : .5 }}>
                {limpando ? 'Limpando…' : '🗑 Limpar todos'}
              </button>
              <button onClick={onClose}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                ✕
              </button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 11 }}>Carregando...</div>}
          {!loading && avisos.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📢</div>
              <div style={{ fontSize: 11 }}>Quando uma OP que envolve você andar (início, conclusão, retrabalho, recados da adaptação), o aviso aparece aqui.</div>
            </div>
          )}
          {avisos.map(a => (
            <div key={a.id} style={{ border: '1px solid #e2e8f0', borderLeft: '3px solid #0891b2', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#0e7490' }}>{a.contexto_descricao || 'OP'}</span>
                <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 'auto' }}>{fmtDT(a.criado_em)}</span>
                <button onClick={() => limparUm(a)} title="Limpar este aviso"
                  style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#1e293b', marginTop: 3, lineHeight: 1.4 }}>{a.texto_trecho}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                <span style={{ fontSize: 9, color: '#64748b' }}>por {a.mencionante_nome || 'Sistema'}</span>
                {a.contexto_id && (
                  <button onClick={() => abrirOp(a)}
                    style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, border: 'none', background: '#0891b2', color: '#fff', cursor: 'pointer' }}>
                    🔧 Abrir OP
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {opAberta && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          <OplDetalheModal opl={opAberta} onClose={() => setOpAberta(null)} currentUser={currentUser} />
        </div>
      )}
    </div>
  );
}
