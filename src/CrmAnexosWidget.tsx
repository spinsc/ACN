// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { enviarArquivoPrivado } from './ArquivoPrivado';   // 26/11/2026 (plano do bucket privado, B3)
import { ImagemPrivada, LinkDeArquivo } from './ArquivoPrivadoTela';   // 26/11/2026 (plano do bucket privado, B3)
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { contentTypeUpload } from './FormatosArquivo';
import { confirmar } from './Feedback';
import { Botao, Chips } from './Interface';
import Icone from './Icone';
import { mdiPaperclip, mdiClose, mdiClipboardTextOutline, mdiBriefcaseOutline, mdiNoteTextOutline, mdiHandshakeOutline, mdiImageOutline, mdiFileDocumentOutline } from '@mdi/js';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// `accept` é só um rótulo pra UI (mostrado embaixo do botão) — o input
// aceita qualquer tipo/versão de arquivo em todas as categorias, sem
// restrição real nenhuma (usuário pediu explicitamente depois de um docx
// mais novo ter "falhado" — a causa real era o limite de 10MB do bucket,
// já corrigido pra 50MB; nunca houve de fato uma restrição de formato).
// 12e49 (09/10/2026): o ícone vem do campo `icone` (antes era um emoji dentro do rótulo) e a cor de cada tipo saiu daqui para o design.css ([data-anx-crm] define --acn-anx-cor)
const TIPOS = [
  { id: 'edital',   label: 'Edital',          icone: mdiClipboardTextOutline, accept: '*' },
  { id: 'proposta', label: 'Proposta',        icone: mdiBriefcaseOutline,     accept: '*' },
  { id: 'ata',      label: 'Ata / Resultado', icone: mdiNoteTextOutline,      accept: '*' },
  { id: 'contrato', label: 'Contrato',        icone: mdiHandshakeOutline,     accept: '*' },
  { id: 'foto',     label: 'Foto / Imagem',   icone: mdiImageOutline,         accept: '*' },
  { id: 'outro',    label: 'Outro',           icone: mdiFileDocumentOutline,  accept: '*' },
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

  // Arrastar e soltar (pedido do Comercial, 27/11/2026, o mesmo da janela de arquivos da OP): soltar arquivos em qualquer ponto da janela anexa, como o botão "Anexar",
  // e o arquivo entra com o tipo escolhido nas fichas de cima. Aqui qualquer formato vale (ver o comentário da CONFIG). O contador evita que a marca de
  // "solte aqui" pisque quando o arquivo passa por cima dos elementos de dentro da janela.
  const [arrastando, setArrastando] = useState(false);
  const sobreJanela = useRef(0);
  const temArquivos = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const aoEntrar = (e: React.DragEvent) => { if (!temArquivos(e)) return; e.preventDefault(); sobreJanela.current++; setArrastando(true); };
  const aoSair = (e: React.DragEvent) => { if (!temArquivos(e)) return; sobreJanela.current = Math.max(0, sobreJanela.current - 1); if (!sobreJanela.current) setArrastando(false); };
  const aoPassar = (e: React.DragEvent) => { if (!temArquivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = uploading ? 'none' : 'copy'; };
  const aoSoltar = (e: React.DragEvent) => {
    if (!temArquivos(e)) return;
    e.preventDefault(); sobreJanela.current = 0; setArrastando(false);
    if (uploading) return;   // já tem um envio andando: não mistura
    const lista = Array.from(e.dataTransfer.files || []);
    if (lista.length) upload(lista);
  };

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    const falhas: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safe = sanitize(f.name);
      const path = `crm-anexos/${op.id}/${Date.now()}_${safe}`;
      // Office/planilhas sobem como octet-stream — ver FormatosArquivo.ts
      const ct = contentTypeUpload(f);
      // bucket privado (plano do bucket privado, B3, 26/11/2026): o banco guarda "privado:<caminho>";
      // o nome leva Date.now() e o bucket não aceita sobrescrever, então cada envio é um arquivo novo
      const { valor, erro: error } = await enviarArquivoPrivado(path, f, ct);
      if (error || !valor) {
        console.error('Upload erro:', error?.message);
        falhas.push(`${f.name} — ${explicarErroDeEnvio(error, f)}`);
        continue;
      }
      const { error: errIns } = await supabase.from('crm_anexos').insert({
        oportunidade_id: op.id,
        tipo:            tipoSel,
        nome:            f.name,
        url:             valor,
        tamanho:         f.size,
        mime_type:       f.type,
        criado_por:      currentUser?.nome,
      });
      // o arquivo já subiu: se a ligação com o card não gravar, a pessoa precisa saber (antes ficava calado)
      if (errIns) falhas.push(`${f.name} — o arquivo subiu, mas não foi possível ligá-lo a este card (${errIns.message})`);
    }
    if (falhas.length > 0) {
      alert(`Falha ao enviar ${falhas.length} arquivo${falhas.length>1?'s':''}:\n\n${falhas.join('\n')}`);
    }
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    reload();
  };

  const excluir = async (id: string, url: string) => {
    if (!await confirmar('Remover este arquivo?')) return;
    // Remove do Storage só o que ainda é endereço público antigo; o arquivo do bucket privado não tem
    // política de apagar para o navegador (B3, 26/11/2026): só se desliga a ligação e o arquivo fica solto.
    if (!String(url || '').startsWith('privado:')) {
      try {
        const path = url.split('/acn-media/')[1]?.split('?')[0];
        if (path) await supabase.storage.from('acn-media').remove([path]);
      } catch (_) {}
    }
    await supabase.from('crm_anexos').delete().eq('id', id);
    reload();
  };

  const tipoAtual = getTipo(tipoSel);
  const anexosFiltrados = filtroTipo === 'todos' ? anexos : anexos.filter(a => a.tipo === filtroTipo);

  return (
    <div className="modal-overlay acn-anx-ov"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal-box acn-modal-cadastro acn-anx-jan' + (arrastando ? ' arrastando' : '')} role="dialog" aria-label="Documentos e imagens"
        onDragEnter={aoEntrar} onDragOver={aoPassar} onDragLeave={aoSair} onDrop={aoSoltar}>

        {/* Header */}
        <div className="acn-modal-cab">
          <div className="acn-anx-cab-txt">
            <span className="modal-title"><Icone path={mdiPaperclip} size={18} />Documentos e Imagens</span>
            <div className="acn-ajuda">
              {op.titulo} {op.numero_edital ? `· ${op.numero_edital}` : ''}
            </div>
          </div>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>

        {/* Upload */}
        <div className="acn-anx-upload">
          {/* Seletor de tipo */}
          <Chips ativo={tipoSel} onChange={setTipoSel} rotulo="Tipo do arquivo a anexar"
            itens={TIPOS.map(t => ({ id: t.id, rotulo: t.label, icone: t.icone }))} />
          <div className="acn-anx-envio">
            <label className={'acn-b acn-b-primario acn-anx-anexar' + (uploading ? ' ocupado' : '')} data-anx-crm={tipoSel}>
              {uploading ? 'Enviando...' : `${tipoAtual.label} — Anexar`}
              <input ref={fileRef} type="file" multiple
                onChange={e => { if (e.target.files?.length) upload(e.target.files); }}
                hidden disabled={uploading} />
            </label>
            <span className="acn-ajuda">
              {tipoAtual.accept.replace(/\*/g, 'todos os formatos')}
            </span>
            <span className="acn-ajuda">{arrastando ? `Solte os arquivos para anexar como ${tipoAtual.label}.` : 'Ou arraste os arquivos para dentro desta janela.'}</span>
          </div>
        </div>

        {/* Filtro por tipo */}
        {anexos.length > 0 && (
          <div className="acn-anx-filtro">
            <Chips ativo={filtroTipo} onChange={setFiltroTipo} rotulo="Filtrar por tipo"
              itens={[{ id: 'todos', rotulo: `Todos (${anexos.length})` },
                ...TIPOS.filter(t => anexos.some(a => a.tipo === t.id)).map(t => ({ id: t.id, rotulo: `${t.label} (${anexos.filter(a => a.tipo === t.id).length})`, icone: t.icone }))]} />
          </div>
        )}

        {/* Lista */}
        <div className="acn-modal-corpo acn-anx-lista">
          {loading ? (
            <div className="acn-empty">Carregando...</div>
          ) : anexosFiltrados.length === 0 ? (
            <div className="acn-empty">
              {filtroTipo === 'todos' ? 'Nenhum arquivo anexado ainda.' : `Nenhum arquivo do tipo "${getTipo(filtroTipo).label}".`}
            </div>
          ) : (
            <div className="acn-anx-itens">
              {anexosFiltrados.map(a => {
                const t = getTipo(a.tipo);
                const isImg = a.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.nome);
                return (
                  <div key={a.id} className="acn-anx-item" data-anx-crm={t.id}>
                    {/* Preview imagem */}
                    {isImg && (
                      <ImagemPrivada valor={a.url} alt={a.nome} className="acn-anx-img"
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                      />
                    )}
                    {/* Ícone tipo */}
                    {!isImg && (
                      <span className="acn-anx-tag"><Icone path={t.icone} size={14} /></span>
                    )}
                    {/* Info */}
                    <div className="acn-anx-info">
                      <LinkDeArquivo valor={a.url} className="acn-anx-nome">
                        {a.nome}
                      </LinkDeArquivo>
                      <div className="acn-ajuda">
                        {fmtBytes(a.tamanho)} · {a.criado_por} · {fmtDT(a.criado_em)}
                      </div>
                    </div>
                    {/* Ações */}
                    <div className="acn-anx-acoes">
                      <LinkDeArquivo valor={a.url} className="acn-b acn-b-primario acn-b-p">
                        Abrir
                      </LinkDeArquivo>
                      <Botao variante="perigo-sec" pequeno icone={mdiClose} aria-label="Remover arquivo" onClick={() => excluir(a.id, a.url)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="acn-modal-rodape acn-anx-rodape">
          <span className="acn-ajuda">{anexos.length} arquivo{anexos.length !== 1 ? 's' : ''}</span>
          <Botao onClick={onClose}>Fechar</Botao>
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
      <Botao pequeno variante={temArquivo ? 'primario' : 'secundario'} icone={mdiPaperclip} className="acn-anx-contagem"
        onClick={() => setModal(true)}
        title={temArquivo ? `${count} arquivo${count !== 1 ? 's' : ''} anexado${count !== 1 ? 's' : ''}` : 'Anexar documentos'}>
        {count !== null ? count : '…'}
      </Botao>

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
