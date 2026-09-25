// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ANEXOS DA TAREFA DE ENGENHARIA
//
// Pedido do usuário em 24/09/2026. O que circula numa tarefa de engenharia é
// desenho, foto de referência e documento do que foi feito — hoje isso ia por
// fora do sistema e se perdia.
//
// Segue o caminho que o resto do sistema já usa: arquivo no bucket `acn-media`
// e a linha em `engenharia_tarefas_anexos` guardando nome, url e quem subiu.
//
// Duas regras combinadas no mesmo dia:
//   • apagar é de quem anexou e do gestor da Engenharia, e mais ninguém —
//     quem subiu sabe se errou o arquivo, os outros não;
//   • tarefa concluída continua aceitando anexo, porque o desenho e a foto do
//     resultado costumam aparecer depois que ela fecha, e obrigar a reabrir só
//     para anexar sujaria a contagem de horas.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { contentTypeUpload } from './FormatosArquivo';
import { confirmar } from './Feedback';
import { ehGestorEngenharia } from './HorasExtras';

const fmtDT = (v: string) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtTam = (n: any) => {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

/** Nome de arquivo que o storage aceita sem reclamar de acento e espaço. */
function nomeSeguro(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  const ext = ponto >= 0 ? nome.slice(ponto).toLowerCase() : '';
  const base = ponto >= 0 ? nome.slice(0, ponto) : nome;
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80) + ext;
}

async function subirArquivo(file: File, tarefaId: string): Promise<string | null> {
  const caminho = `engenharia-tarefas/${tarefaId}/${Date.now()}_${nomeSeguro(file.name)}`;
  // Office e planilha sobem como octet-stream — ver FormatosArquivo.ts
  const { data, error } = await supabase.storage.from('acn-media')
    .upload(caminho, file, { upsert: true, contentType: contentTypeUpload(file) });
  if (error || !data) { console.error('Upload do anexo falhou:', error?.message); return null; }
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(caminho);
  return pub?.publicUrl || null;
}

/** Quem pode tirar o arquivo: quem subiu, ou o gestor da Engenharia. */
export const podeApagarAnexo = (anexo: any, u: any) =>
  ehGestorEngenharia(u) ||
  (!!anexo?.criado_por && String(anexo.criado_por).toLowerCase() === String(u?.email || '').toLowerCase());

/** Quantos anexos cada tarefa tem, numa consulta só — para o selo na lista. */
export async function contarAnexosDasTarefas(ids: string[]) {
  const mapa = new Map<string, number>();
  const limpos = (ids || []).filter(Boolean);
  if (!limpos.length) return mapa;
  const { data } = await supabase.from('engenharia_tarefas_anexos')
    .select('tarefa_id').in('tarefa_id', limpos);
  (data || []).forEach((a: any) => mapa.set(a.tarefa_id, (mapa.get(a.tarefa_id) || 0) + 1));
  return mapa;
}

export function ModalAnexosTarefa({ tarefa, currentUser, onClose, onMudou }: any) {
  const [anexos, setAnexos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [subindo, setSubindo] = useState(0);      // quantos faltam subir
  const [arrastando, setArrastando] = useState(false);
  const refArquivo = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.from('engenharia_tarefas_anexos')
      .select('*').eq('tarefa_id', tarefa.id).order('criado_em', { ascending: false });
    setAnexos(data || []);
    setCarregando(false);
  }, [tarefa.id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  const enviar = async (lista: FileList | File[]) => {
    const arquivos = Array.from(lista || []);
    if (!arquivos.length) return;
    setSubindo(arquivos.length);
    const falhas: string[] = [];
    for (const f of arquivos) {
      const url = await subirArquivo(f, tarefa.id);
      if (!url) { falhas.push(f.name); setSubindo(n => n - 1); continue; }
      const { error } = await supabase.from('engenharia_tarefas_anexos').insert([{
        tarefa_id: tarefa.id,
        nome: f.name,
        url,
        tipo: f.type || null,
        tamanho: f.size || null,
        criado_por: currentUser?.email || null,
        criado_por_nome: currentUser?.nome || null,
      }]);
      if (error) falhas.push(f.name);
      setSubindo(n => n - 1);
    }
    if (refArquivo.current) refArquivo.current.value = '';
    if (falhas.length) alert('Não foi possível anexar:\n' + falhas.join('\n'));
    await recarregar();
    onMudou?.();
  };

  const apagar = async (a: any) => {
    if (!podeApagarAnexo(a, currentUser)) {
      alert(`Só quem anexou (${a.criado_por_nome || a.criado_por || '—'}) ou o gestor da Engenharia pode remover este arquivo.`);
      return;
    }
    if (!await confirmar(`Remover "${a.nome}" desta tarefa?\n\nO arquivo sai da lista e ninguém mais acessa por aqui.`)) return;
    const { error } = await supabase.from('engenharia_tarefas_anexos').delete().eq('id', a.id);
    if (error) { alert('Não foi possível remover: ' + error.message); return; }
    await recarregar();
    onMudou?.();
  };

  const ehImagem = (a: any) => String(a.tipo || '').startsWith('image/');

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }}
      onClick={e => { if (e.target === e.currentTarget && !subindo) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 560, width: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">📎 Anexos — {tarefa.titulo}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Desenho, foto de referência, documento do que foi feito. Remover é de quem anexou
          ou do gestor da Engenharia.
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}
          onClick={() => !subindo && refArquivo.current?.click()}
          style={{ border: `1.5px dashed ${arrastando ? '#0f766e' : '#cbd5e1'}`, borderRadius: 8,
            background: arrastando ? '#f0fdfa' : '#f8fafc', padding: '14px 12px', textAlign: 'center',
            cursor: subindo ? 'wait' : 'pointer', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
            {subindo ? `Enviando... (${subindo} restante${subindo > 1 ? 's' : ''})` : '＋ Anexar arquivo'}
          </div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>
            Clique para escolher, ou arraste os arquivos aqui. Dá para mandar vários de uma vez.
          </div>
          <input ref={refArquivo} type="file" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && enviar(e.target.files)} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {carregando ? (
            <div className="acn-empty">Carregando...</div>
          ) : !anexos.length ? (
            <div className="acn-empty">Nenhum arquivo anexado ainda.</div>
          ) : anexos.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
              borderBottom: '1px solid #f1f5f9' }}>
              {ehImagem(a) ? (
                <img src={a.url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 34, textAlign: 'center', fontSize: 18, flexShrink: 0 }}>📄</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={a.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textDecoration: 'none',
                    display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.nome}
                </a>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>
                  {a.criado_por_nome || a.criado_por || '—'} · {fmtDT(a.criado_em)}
                  {fmtTam(a.tamanho) ? ` · ${fmtTam(a.tamanho)}` : ''}
                </div>
              </div>
              {podeApagarAnexo(a, currentUser) && (
                <button onClick={() => apagar(a)} title="Remover este arquivo"
                  style={{ border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 4,
                    padding: '2px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="acn-btn" style={{ background: '#94a3b8', marginLeft: 'auto' }}
            disabled={!!subindo} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
