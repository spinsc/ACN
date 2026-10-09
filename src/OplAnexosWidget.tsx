// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { EXT_PLANILHAS, contentTypeUpload } from './FormatosArquivo';
import { confirmar } from './Feedback';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiPaperclip, mdiClose, mdiClipboardTextOutline, mdiCurrencyUsd, mdiFileDocumentOutline, mdiImageOutline, mdiCheckCircleOutline, mdiFolderOutline } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string) =>
  v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

// 12e49 (09/10/2026): o ícone vem de TIPO_ICONE (antes era um emoji dentro do rótulo) e a cor de cada tipo saiu daqui para o design.css ([data-anx-opl] define --acn-anx-cor)
const TIPO_LABEL: Record<string, string> = {
  'proposta':          'Proposta',
  'orcamento':         'Orçamento',
  'documento':         'Documento',
  'foto':              'Foto',
  'checklist_entrega': 'Checklist Entrega',
};
const TIPO_ICONE: Record<string, string> = {
  'proposta':          mdiClipboardTextOutline,
  'orcamento':         mdiCurrencyUsd,
  'documento':         mdiFileDocumentOutline,
  'foto':              mdiImageOutline,
  'checklist_entrega': mdiCheckCircleOutline,
};

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  const ext  = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  return safeBase + ext;
}

async function uploadOplAnexo(file: File, oplNumero: string): Promise<string | null> {
  const safe = oplNumero.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeName = sanitizeFileName(file.name);
  const path = `opl-anexos/${safe}/${Date.now()}_${safeName}`;
  // Office/planilhas sobem como octet-stream — ver FormatosArquivo.ts
  const contentType = contentTypeUpload(file);
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true, contentType });
  if (error || !data) { console.error('Upload erro Supabase:', error?.message); return null; }
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return pub?.publicUrl || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE ANEXOS
// ─────────────────────────────────────────────────────────────────────────────
export function ModalAnexos({ opl, setor, currentUser, tipo: tipoFixo, onClose }) {
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
    if (!await confirmar('Remover este arquivo?')) return;
    await supabase.from('opl_anexos').delete().eq('id', id);
    reload();
  };

  const isChecklistMode = tipoFixo === 'checklist_entrega';

  const tituloModal = isChecklistMode ? 'Checklist de Entrega' : tipoFixo === 'proposta' ? 'Propostas' : tipoFixo === 'orcamento' ? 'Orçamentos' : 'Arquivos';
  const iconeModal = isChecklistMode ? mdiCheckCircleOutline : tipoFixo === 'proposta' ? mdiClipboardTextOutline : tipoFixo === 'orcamento' ? mdiCurrencyUsd : mdiPaperclip;
  return (
    <div className="modal-overlay acn-anx-ov"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-anx-jan" role="dialog" aria-label={tituloModal}>

        {/* Header */}
        <div className="acn-modal-cab">
          <div className="acn-anx-cab-txt">
            <span className="modal-title">
              <Icone path={iconeModal} size={18} />{tituloModal} — {opl.opl}
            </span>
            <div className="acn-ajuda">
              {opl.chassi ? `Chassi: ${opl.chassi}` : ''} {opl.tipo_projeto ? `· ${opl.tipo_projeto}` : ''}
            </div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>

        {/* Upload */}
        <div className="acn-anx-upload">
          <div className="acn-anx-envio">
            <label className={'acn-b acn-b-primario acn-anx-anexar' + (uploading ? ' ocupado' : '')} data-anx-opl={tipoFixo || 'documento'}>
              {uploading ? 'Enviando...'
                : isChecklistMode ? <><Icone path={mdiPaperclip} size={14} />Anexar Checklist (PDF)</>
                : tipoFixo === 'proposta' ? <><Icone path={mdiClipboardTextOutline} size={14} />Anexar Proposta (Word / planilha)</>
                : tipoFixo === 'orcamento' ? <><Icone path={mdiCurrencyUsd} size={14} />Anexar Orçamento (Word / planilha)</>
                : <><Icone path={mdiPaperclip} size={14} />Anexar Arquivo</>}
              <input ref={fileRef} type="file" multiple
                accept={isChecklistMode ? '.pdf' : (tipoFixo === 'proposta' || tipoFixo === 'orcamento') ? `.doc,.docx,${EXT_PLANILHAS},.pdf,.txt` : `.pdf,.doc,.docx,${EXT_PLANILHAS},.png,.jpg,.jpeg,.gif,.webp,.txt`}
                onChange={e => { if (e.target.files?.length) upload(e.target.files); }}
                hidden disabled={uploading} />
            </label>
            {isChecklistMode && (
              <span className="acn-ajuda">Aceita apenas PDF</span>
            )}
            {(tipoFixo === 'proposta' || tipoFixo === 'orcamento') && (
              <span className="acn-ajuda">Word (.doc/.docx), PDF e planilhas (.xlsx, .xlsm, .xlsb, .xls, .ods, .csv...)</span>
            )}
          </div>
        </div>

        {/* Lista de anexos */}
        <div className="acn-modal-corpo acn-anx-lista">
          {loading ? (
            <div className="acn-empty">Carregando...</div>
          ) : anexos.length === 0 ? (
            <div className="acn-empty">
              {isChecklistMode ? 'Nenhum checklist anexado.' : 'Nenhum arquivo anexado.'}
            </div>
          ) : (
            <div className="acn-anx-itens">
              {/* Filtros por tipo (somente modo geral) */}
              {!isChecklistMode && (
                <div className="acn-anx-pills">
                  {[...new Set(anexos.map(a => a.tipo))].map(t => (
                    <span key={t} className="acn-anx-pill" data-anx-opl={t}>
                      <Icone path={TIPO_ICONE[t] || mdiFileDocumentOutline} size={11} /> {TIPO_LABEL[t] || t} ({anexos.filter(a=>a.tipo===t).length})
                    </span>
                  ))}
                </div>
              )}

              {anexos.map(a => (
                <div key={a.id} className="acn-anx-item">
                  <span className="acn-anx-tag grande">
                    <Icone path={TIPO_ICONE[a.tipo] || mdiFileDocumentOutline} size={18} />
                  </span>
                  <div className="acn-anx-info">
                    <a href={a.url} target="_blank" rel="noreferrer" className="acn-anx-nome">
                      {a.nome}
                    </a>
                    <div className="acn-ajuda">
                      {a.setor} · {a.criado_por} · {fmtDT(a.criado_em)}
                    </div>
                  </div>
                  <div className="acn-anx-acoes">
                    <a href={a.url} target="_blank" rel="noreferrer" className="acn-b acn-b-primario acn-b-p">
                      Abrir
                    </a>
                    <Botao variante="perigo-sec" pequeno icone={mdiClose} aria-label="Remover arquivo" onClick={() => excluir(a.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="acn-modal-rodape acn-anx-rodape">
          <span className="acn-ajuda">{anexos.length} arquivo{anexos.length !== 1 ? 's' : ''}</span>
          <Botao onClick={onClose}>Fechar</Botao>
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
// Só a contagem de anexos da OP (para mostrar "3 anexos" onde o botão foi para o menu ⋯)
export function useContagemAnexos(oplId: any): [number | null, () => void] {
  const [count, setCount] = useState<number | null>(null);
  const recarregar = useCallback(async () => {
    if (!oplId) return;
    const { count: c } = await supabase.from('opl_anexos')
      .select('*', { count:'exact', head:true }).eq('opl_id', oplId);
    setCount(c ?? 0);
  }, [oplId]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return [count, recarregar];
}

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
  const isProposta  = tipoFixo === 'proposta';
  const isOrcamento = tipoFixo === 'orcamento';

  const btnIcone   = isChecklist ? mdiCheckCircleOutline : isProposta ? mdiClipboardTextOutline : isOrcamento ? mdiCurrencyUsd : mdiPaperclip;
  const btnTexto   = uploading ? '...' : isChecklist ? 'PDF' : isProposta ? 'Prop.' : isOrcamento ? 'Orc.' : '';
  const acceptAttr = isChecklist ? '.pdf'
    : (isProposta || isOrcamento) ? `.doc,.docx,${EXT_PLANILHAS},.pdf,.txt`
    : `.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,${EXT_PLANILHAS},.txt`;

  return (
    <>
      <div className="acn-anx-mini">
        {/* Botão Anexar */}
        <label title={TIPO_LABEL[tipoFixo || 'documento'] || 'Anexar arquivo'}
          className={'acn-b acn-b-primario acn-anx-anexar' + (compact ? ' acn-b-p' : '') + (uploading ? ' ocupado' : '')} data-anx-opl={tipoFixo || 'documento'}>
          {!uploading && <Icone path={btnIcone} size={compact ? 13 : 15} />}{btnTexto}
          <input ref={fileRef} type="file" multiple
            accept={acceptAttr}
            onChange={e => { if (e.target.files?.length) uploadDireto(e.target.files); }}
            hidden disabled={uploading} />
        </label>

        {/* Botão Ver arquivos */}
        <Botao pequeno={compact} variante={count && count > 0 ? 'primario' : 'secundario'} className="acn-anx-ver" data-anx-opl={tipoFixo || ''}
          icone={TIPO_ICONE[tipoFixo || ''] || mdiFolderOutline} onClick={() => setModal(true)} title="Ver arquivos">
          {count !== null ? count : '…'}
        </Botao>
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
