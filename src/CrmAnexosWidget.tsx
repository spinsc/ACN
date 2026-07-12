// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS = [
  { id: 'edital',   label: '📋 Edital',          cor: '#7c3aed', accept: '.pdf,.doc,.docx,.xls,.xlsx' },
  { id: 'proposta', label: '💼 Proposta',         cor: '#0891b2', accept: '.pdf,.doc,.docx,.xls,.xlsx' },
  { id: 'ata',      label: '📝 Ata / Resultado',  cor: '#059669', accept: '.pdf,.doc,.docx' },
  { id: 'contrato', label: '🤝 Contrato',         cor: '#b45309', accept: '.pdf,.doc,.docx' },
  { id: 'foto',     label: '🖼️ Foto / Imagem',   cor: '#be185d', accept: '.png,.jpg,.jpeg,.webp,.gif' },
  { id: 'outro',    label: '📄 Outro',            cor: '#475569', accept: '*' },
];

const getTipo = (id: string) => TIPOS.find(t => t.id === id) || TIPOS[TIPOS.length - 1];

const fmtBytes = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
};

const fmtDT = (v: string) =>
  v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

function sanitize(name: string) {
  const dot  = name.lastIndexOf('.');
  const ext  = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 60) + ext;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL COMPLETO
// ─────────────────────────────────────────────────────────────────────────────
function ModalAnexos({ op, currentUser, onClose }: { op: any; currentUser: any; onClose: () => void }) {
  const [anexos, setAnexos]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [tipoSel, setTipoSel]       = useState('edital');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('crm_anexos')
      .select('*')
      .eq('oportunidade_id', op.id)
      .order('criado_em', { ascending: false });
    setAnexos(data || []);
    setLoading(false);
  }, [op.id]);

  useEffect(() => { reload(); }, [reload]);

  const upload = async (files: FileList) => {
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safe = sanitize(f.name);
      const path = `crm-anexos/${op.id}/${Date.now()}_${safe}`;
      // Office files: force octet-stream para evitar restrições MIME do bucket
      const officeExts = /\.(docx?|xlsx?|pptx?)$/i;
      const ct = officeExts.test(f.name) ? 'application/octet-stream' : f.type;
      const { data: up, error } = await supabase.storage
        .from('acn-media')
        .upload(path, f, { upsert: true, contentType: ct });
      if (error || !up) { console.error('Upload erro:', error?.message); continue; }
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      await supabase.from('crm_anexos').insert({
        oportunidade_id: op.id,
        tipo:            tipoSel,
        nome:            f.name,
        url:             pub?.publicUrl,
        tamanho:         f.size,
        mime_type:       f.type,
        criado_por:      currentUser?.nome,
      });
    }
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    reload();
  };

  const excluir = async (id: string, url: string) => {
    if (!confirm('Remover este arquivo?')) return;
    // Remove do Storage
    try {
      const path = url.split('/acn-media/')[1]?.split('?')[0];
      if (path) await supabase.storage.from('acn-media').remove([path]);
    } catch (_) {}
    await supabase.from('crm_anexos').delete().eq('id', id);
    reload();
  };

  const tipoAtual = getTipo(tipoSel);
  const anexosFiltrados = filtroTipo === 'todos' ? anexos : anexos.filter(a => a.tipo === filtroTipo);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'white', borderRadius:8, width:'min(620px,96vw)',
        maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px #0004' }}>

        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>📎 Documentos e Imagens</div>
              <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>
                {op.titulo} {op.numero_edital ? `· ${op.numero_edital}` : ''}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#94a3b8' }}>✕</button>
          </div>
        </div>

        {/* Upload */}
        <div style={{ padding:'10px 16px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc', flexShrink:0 }}>
          {/* Seletor de tipo */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
            {TIPOS.map(t => (
              <button key={t.id} onClick={() => setTipoSel(t.id)}
                style={{ fontSize:8, padding:'2px 8px', borderRadius:12, fontWeight:700, border:'none', cursor:'pointer',
                  background: tipoSel===t.id ? t.cor : '#e2e8f0',
                  color:      tipoSel===t.id ? 'white' : '#64748b',
                }}>
                {t.label}
              </button>
            ))}
          </div>
          <label style={{
            display:'inline-flex', alignItems:'center', gap:6, cursor: uploading ? 'wait' : 'pointer',
            background: tipoAtual.cor, color:'white', border:'none', borderRadius:6,
            padding:'6px 14px', fontSize:10, fontWeight:700, opacity: uploading ? .6 : 1,
          }}>
            {uploading ? 'Enviando...' : `${tipoAtual.label} — Anexar`}
            <input ref={fileRef} type="file" multiple accept={tipoAtual.accept}
              onChange={e => { if (e.target.files?.length) upload(e.target.files); }}
              style={{ display:'none' }} disabled={uploading} />
          </label>
          <span style={{ marginLeft:10, fontSize:9, color:'#94a3b8' }}>
            {tipoAtual.accept.replace(/\*/g, 'todos os formatos')}
          </span>
        </div>

        {/* Filtro por tipo */}
        {anexos.length > 0 && (
          <div style={{ padding:'6px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:5, flexWrap:'wrap', flexShrink:0 }}>
            <button onClick={() => setFiltroTipo('todos')}
              style={{ fontSize:8, padding:'2px 8px', borderRadius:12, fontWeight:700, border:'none', cursor:'pointer',
                background: filtroTipo==='todos' ? '#1e293b' : '#e2e8f0',
                color:      filtroTipo==='todos' ? 'white' : '#64748b' }}>
              Todos ({anexos.length})
            </button>
            {TIPOS.filter(t => anexos.some(a => a.tipo === t.id)).map(t => {
              const n = anexos.filter(a => a.tipo === t.id).length;
              return (
                <button key={t.id} onClick={() => setFiltroTipo(t.id)}
                  style={{ fontSize:8, padding:'2px 8px', borderRadius:12, fontWeight:700, border:'none', cursor:'pointer',
                    background: filtroTipo===t.id ? t.cor : '#e2e8f0',
                    color:      filtroTipo===t.id ? 'white' : '#64748b' }}>
                  {t.label} ({n})
                </button>
              );
            })}
          </div>
        )}

        {/* Lista */}
        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#94a3b8', fontSize:11, padding:20 }}>Carregando...</div>
          ) : anexosFiltrados.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8', fontSize:11, padding:24 }}>
              {filtroTipo === 'todos' ? 'Nenhum arquivo anexado ainda.' : `Nenhum arquivo do tipo "${getTipo(filtroTipo).label}".`}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {anexosFiltrados.map(a => {
                const t = getTipo(a.tipo);
                const isImg = a.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.nome);
                return (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                    background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6,
                    borderLeft:`3px solid ${t.cor}` }}>
                    {/* Preview imagem */}
                    {isImg && (
                      <img src={a.url} alt={a.nome}
                        style={{ width:32, height:32, objectFit:'cover', borderRadius:4, flexShrink:0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                      />
                    )}
                    {/* Ícone tipo */}
                    {!isImg && (
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 5px', borderRadius:3, flexShrink:0,
                        background:`${t.cor}18`, color:t.cor }}>
                        {t.label.split(' ')[0]}
                      </span>
                    )}
                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <a href={a.url} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:'#2563eb', fontWeight:600, wordBreak:'break-all', textDecoration:'none' }}>
                        {a.nome}
                      </a>
                      <div style={{ fontSize:8, color:'#94a3b8', marginTop:1 }}>
                        {fmtBytes(a.tamanho)} · {a.criado_por} · {fmtDT(a.criado_em)}
                      </div>
                    </div>
                    {/* Ações */}
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <a href={a.url} target="_blank" rel="noreferrer"
                        style={{ background:'#2563eb', color:'white', borderRadius:4, padding:'3px 8px',
                          fontSize:9, fontWeight:700, textDecoration:'none' }}>
                        Abrir
                      </a>
                      <button onClick={() => excluir(a.id, a.url)}
                        style={{ background:'none', border:'1px solid #fca5a5', color:'#dc2626',
                          borderRadius:4, padding:'3px 6px', fontSize:9, cursor:'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 16px', borderTop:'1px solid #e2e8f0', display:'flex',
          justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:9, color:'#94a3b8' }}>{anexos.length} arquivo{anexos.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose}
            style={{ padding:'5px 16px', border:'1px solid #d1d5db', borderRadius:6,
              background:'white', fontSize:11, cursor:'pointer' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET COMPACTO — para usar dentro do card do kanban
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmAnexosWidget({
  op,
  currentUser,
}: {
  op: any;
  currentUser: any;
}) {
  const [count, setCount]   = useState<number | null>(null);
  const [modal, setModal]   = useState(false);

  const loadCount = useCallback(async () => {
    const { count: c } = await supabase
      .from('crm_anexos')
      .select('*', { count: 'exact', head: true })
      .eq('oportunidade_id', op.id);
    setCount(c ?? 0);
  }, [op.id]);

  useEffect(() => { loadCount(); }, [loadCount]);

  const temArquivo = count !== null && count > 0;

  return (
    <>
      <button
        onClick={() => setModal(true)}
        title={temArquivo ? `${count} arquivo${count !== 1 ? 's' : ''} anexado${count !== 1 ? 's' : ''}` : 'Anexar documentos'}
        className="acn-btn"
        style={{
          background: temArquivo ? '#7c3aed' : '#94a3b8',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}
      >
        📎 {count !== null ? count : '…'}
      </button>

      {modal && (
        <ModalAnexos
          op={op}
          currentUser={currentUser}
          onClose={() => { setModal(false); loadCount(); }}
        />
      )}
    </>
  );
}
