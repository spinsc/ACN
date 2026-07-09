// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) =>
  v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

const TIPO_LABEL: Record<string, string> = {
  'documento':         '📄 Documento',
  'foto':              '🖼️ Foto',
  'checklist_entrega': '✅ Checklist Entrega',
};
const TIPO_COR: Record<string, string> = {
  'documento':         '#2563eb',
  'foto':              '#7c3aed',
  'checklist_entrega': '#16a34a',
};

async function uploadOplAnexo(file: File, oplNumero: string): Promise<string | null> {
  const safe = oplNumero.replace(/[^a-zA-Z0-9-]/g, '_');
  const path = `opl-anexos/${safe}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return null;
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE ANEXOS
// ─────────────────────────────────────────────────────────────────────────────
function ModalAnexos({ opl, setor, currentUser, tipo: tipoFixo, onClose }) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('opl_anexos')
      .select('*').eq('opl_id', opl.id)
      .order('criado_em', { ascending: false });
    setAnexos(data || []);
    setLoading(false);
  }, [opl.id]);

  useEffect(() => { reload(); }, [reload]);

  const upload = async (files: FileList) => {
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const url = await uploadOplAnexo(f, opl.opl);
      if (url) {
        const isImg = f.type.startsWith('image/');
        await supabase.from('opl_anexos').insert([{
          opl_id:     opl.id,
          opl_numero: opl.opl,
          setor,
          tipo:       tipoFixo || (isImg ? 'foto' : 'documento'),
          nome:       f.name,
          url,
          criado_por: currentUser?.nome,
        }]);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    reload();
  };

  const excluir = async (id: string) => {
    if (!confirm('Remover este arquivo?')) return;
    await supabase.from('opl_anexos').delete().eq('id', id);
    reload();
  };

  const isChecklistMode = tipoFixo === 'checklist_entrega';

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(580px,96vw)', maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>

        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13 }}>
              {isChecklistMode ? '✅ Checklist de Entrega' : '📎 Arquivos'} — {opl.opl}
            </div>
            <div style={{ fontSize:10, color:'#6b7280' }}>
              {opl.chassi ? `Chassi: ${opl.chassi}` : ''} {opl.tipo_projeto ? `· ${opl.tipo_projeto}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>

        {/* Upload */}
        <div style={{ padding:'10px 16px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc', flexShrink:0 }}>
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer',
            background: isChecklistMode ? '#16a34a' : '#2563eb', color:'#fff',
            border:'none', borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700 }}>
            {uploading ? 'Enviando...' : isChecklistMode ? '📎 Anexar Checklist (PDF)' : '📎 Anexar Arquivo'}
            <input ref={fileRef} type="file" multiple
              accept={isChecklistMode ? '.pdf' : '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt'}
              onChange={e => { if (e.target.files?.length) upload(e.target.files); }}
              style={{ display:'none' }} disabled={uploading} />
          </label>
          {isChecklistMode && (
            <span style={{ marginLeft:10, fontSize:9, color:'#6b7280' }}>Aceita apenas PDF</span>
          )}
        </div>

        {/* Lista de anexos */}
        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#6b7280', fontSize:11, padding:20 }}>Carregando...</div>
          ) : anexos.length === 0 ? (
            <div style={{ textAlign:'center', color:'#9ca3af', fontSize:11, padding:24 }}>
              {isChecklistMode ? 'Nenhum checklist anexado.' : 'Nenhum arquivo anexado.'}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {/* Filtros por tipo (somente modo geral) */}
              {!isChecklistMode && (
                <div style={{ display:'flex', gap:4, marginBottom:6, flexWrap:'wrap' }}>
                  {[...new Set(anexos.map(a => a.tipo))].map(t => (
                    <span key={t} style={{ background: TIPO_COR[t]+'18', color:TIPO_COR[t], border:`1px solid ${TIPO_COR[t]}30`,
                      borderRadius:10, padding:'1px 8px', fontSize:9, fontWeight:700 }}>
                      {TIPO_LABEL[t] || t} ({anexos.filter(a=>a.tipo===t).length})
                    </span>
                  ))}
                </div>
              )}

              {anexos.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                  background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6 }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>
                    {a.tipo === 'foto' ? '🖼️' : a.tipo === 'checklist_entrega' ? '✅' : '📄'}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <a href={a.url} target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:'#2563eb', fontWeight:600, wordBreak:'break-all', textDecoration:'none' }}>
                      {a.nome}
                    </a>
                    <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>
                      {a.setor} · {a.criado_por} · {fmtDT(a.criado_em)}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <a href={a.url} target="_blank" rel="noreferrer"
                      style={{ background:'#2563eb', color:'#fff', borderRadius:4, padding:'3px 8px', fontSize:9, fontWeight:700, textDecoration:'none' }}>
                      Abrir
                    </a>
                    <button onClick={() => excluir(a.id)}
                      style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:4, padding:'3px 6px', fontSize:9, cursor:'pointer' }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding:'8px 16px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:9, color:'#9ca3af' }}>{anexos.length} arquivo{anexos.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} style={{ padding:'5px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE EXPORTADO — botões de anexar + ver arquivos
// Props:
//   opl        — objeto da OPL (id, opl, chassi, tipo_projeto)
//   setor      — nome do setor que está fazendo o upload
//   currentUser
//   tipoFixo   — (opcional) força um tipo: 'checklist_entrega'
//   compact    — (opcional) modo compacto para tabelas
// ─────────────────────────────────────────────────────────────────────────────
export default function OplAnexosWidget({ opl, setor, currentUser, tipoFixo = null, compact = true }) {
  const [count, setCount] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const loadCount = useCallback(async () => {
    const { count: c } = await supabase.from('opl_anexos')
      .select('*', { count:'exact', head:true }).eq('opl_id', opl.id);
    setCount(c ?? 0);
  }, [opl.id]);

  useEffect(() => { loadCount(); }, [loadCount]);

  const uploadDireto = async (files: FileList) => {
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const url = await uploadOplAnexo(f, opl.opl);
      if (url) {
        const isImg = f.type.startsWith('image/');
        await supabase.from('opl_anexos').insert([{
          opl_id:     opl.id,
          opl_numero: opl.opl,
          setor,
          tipo:       tipoFixo || (isImg ? 'foto' : 'documento'),
          nome:       f.name,
          url,
          criado_por: currentUser?.nome,
        }]);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    loadCount();
  };

  const isChecklist = tipoFixo === 'checklist_entrega';

  return (
    <>
      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
        {/* Botão Anexar */}
        <label title={isChecklist ? 'Anexar Checklist PDF' : 'Anexar arquivo'}
          style={{ display:'inline-flex', alignItems:'center', gap:3, cursor: uploading ? 'wait' : 'pointer',
            background: isChecklist ? '#16a34a' : '#475569',
            color:'#fff', border:'none', borderRadius:4,
            padding: compact ? '3px 7px' : '5px 10px',
            fontSize: compact ? 9 : 10, fontWeight:700, opacity: uploading ? .6 : 1 }}>
          {uploading ? '...' : isChecklist ? '✅ PDF' : '📎'}
          <input ref={fileRef} type="file" multiple
            accept={isChecklist ? '.pdf' : '.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.txt'}
            onChange={e => { if (e.target.files?.length) uploadDireto(e.target.files); }}
            style={{ display:'none' }} disabled={uploading} />
        </label>

        {/* Botão Ver arquivos */}
        <button onClick={() => setModal(true)} title="Ver arquivos"
          style={{ background: count && count > 0 ? '#2563eb' : '#e2e8f0',
            color: count && count > 0 ? '#fff' : '#6b7280',
            border:'none', borderRadius:4,
            padding: compact ? '3px 7px' : '5px 10px',
            fontSize: compact ? 9 : 10, fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', gap:3 }}>
          📂 {count !== null ? count : '…'}
        </button>
      </div>

      {modal && (
        <ModalAnexos
          opl={opl}
          setor={setor}
          currentUser={currentUser}
          tipo={tipoFixo}
          onClose={() => { setModal(false); loadCount(); }}
        />
      )}
    </>
  );
}
