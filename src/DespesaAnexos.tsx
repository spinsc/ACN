// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ANEXOS DA DESPESA DO CENTRO DE CUSTO (Etapa 15d do ux-fluxo, 05/10/2026)
// O comprovante (NF, recibo, foto) fica no armazenamento acn-media, no mesmo desenho dos anexos das compras
// (pcp_pedidos_compra_anexos): o arquivo sobe UMA vez e a referência vai para cada despesa que o usa (um rateio gera várias
// despesas com o mesmo comprovante). Limite de 20 MB por arquivo, como nas compras.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiTrashCanOutline, mdiPaperclip } from '@mdi/js';

/** Sobe os arquivos e liga cada um a todas as despesas de `despesaIds`. Devolve a lista de erros (vazia = tudo certo). */
export async function enviarAnexosDespesa(despesaIds: string[], arquivos: File[], user: any): Promise<string[]> {
  const erros: string[] = [];
  if (!despesaIds.length) return erros;
  for (const f of arquivos) {
    if (f.size > 20 * 1024 * 1024) { erros.push(`${f.name}: maior que 20 MB`); continue; }
    const nomeLimpo = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `centro-custo-despesas/${despesaIds[0]}/${Date.now()}_${nomeLimpo}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: f.type || undefined });
    if (error) { erros.push(`${f.name}: ${error.message}`); continue; }
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    const { error: erroLinha } = await supabase.from('centro_custo_despesas_anexos').insert(despesaIds.map(id => ({
      despesa_id: id, nome: f.name, url: pub?.publicUrl || path, tipo: f.type || null, tamanho: f.size,
      criado_por: user?.email || null, criado_por_nome: user?.nome || null,
    })));
    if (erroLinha) erros.push(`${f.name}: ${erroLinha.message}`);
  }
  return erros;
}

/** Lista, abre, acrescenta e remove os anexos de UMA despesa (usado na janela de editar o lançamento). */
export function AnexosDespesa({ despesaId, currentUser, podeEditar }: any) {
  const [anexos, setAnexos] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('centro_custo_despesas_anexos').select('*').eq('despesa_id', despesaId).order('criado_em');
    if (error) { setErro(error.message); setAnexos([]); return; }
    setErro(''); setAnexos(data || []);
  }, [despesaId]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    const erros = await enviarAnexosDespesa([despesaId], Array.from(files), currentUser);
    setEnviando(false);
    if (erros.length) mostrarAviso('Alguns arquivos não foram enviados: ' + erros.join(' · '), 'erro');
    carregar();
  };
  const remover = async (a: any) => {
    if (!await confirmar(`Remover o anexo "${a.nome}"?`)) return;
    const { error } = await supabase.from('centro_custo_despesas_anexos').delete().eq('id', a.id);
    if (error) { mostrarAviso('Não foi possível remover o anexo: ' + error.message, 'erro'); return; }
    carregar();
  };
  return (
    <div className="acn-dsa">
      {erro && <div className="acn-dsa-erro">Não foi possível ler os anexos: {erro}</div>}
      {anexos === null ? <div className="acn-dsa-msg">Carregando…</div>
        : anexos.length === 0 ? <div className="acn-dsa-msg">Nenhum anexo.</div>
        : anexos.map(a => (
          <div key={a.id} className="acn-dsa-item">
            <a href={a.url} target="_blank" rel="noreferrer" className="acn-dsa-nome"><Icone path={mdiPaperclip} size={13} /> {a.nome}</a>
            {podeEditar && <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Remover ${a.nome}`} title="Remover" onClick={() => remover(a)} />}
          </div>
        ))}
      {podeEditar && (
        <label className={'acn-b acn-b-secundario acn-b-p acn-dsa-anexar' + (enviando ? ' ocupado' : '')}>
          <input type="file" multiple hidden disabled={enviando} onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
          {enviando ? 'Enviando…' : <><Icone path={mdiPaperclip} size={14} />Adicionar anexos</>}
        </label>
      )}
    </div>
  );
}
