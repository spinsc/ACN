// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ProdutoArquivos — arquivos de projeto da estrutura de um produto (desenho,
// esquema elétrico, DXF, PDF...). Ficam com o produto e aparecem em quem usa a
// estrutura: cadastro, visualização da estrutura e itens das demandas.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiPaperclip, mdiClose, mdiPencilRulerOutline, mdiLoading } from '@mdi/js';

export async function arquivosDoProduto(produtoId: string) {
  if (!produtoId) return [];
  const { data } = await supabase.from('cadastro_produtos_anexos').select('*')
    .eq('produto_id', produtoId).order('criado_em', { ascending: false });
  return data || [];
}

export function ProdutoArquivos({ produtoId, currentUser, somenteLeitura = false, compacto = false }: {
  produtoId: string; currentUser?: any; somenteLeitura?: boolean; compacto?: boolean;
}) {
  const [lista, setLista] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const carregar = useCallback(async () => setLista(await arquivosDoProduto(produtoId)), [produtoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (files: FileList) => {
    setEnviando(true);
    const falhas: string[] = [];
    for (const f of Array.from(files)) {
      const path = `produtos/${produtoId}/projeto/${Date.now()}_${f.name.replace(/\s/g, '_')}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: false });
      if (error) { falhas.push(f.name); continue; }
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      const { error: e2 } = await supabase.from('cadastro_produtos_anexos').insert([{
        produto_id: produtoId, nome: f.name, url: pub.publicUrl, criado_por: currentUser?.nome || null,
      }]);
      if (e2) falhas.push(f.name);
    }
    setEnviando(false);
    if (falhas.length) alert('Não foi possível enviar: ' + falhas.join(', '));
    carregar();
  };
  const remover = async (a: any) => {
    if (!await confirmar(`Remover o arquivo "${a.nome}" do produto?`)) return;
    await supabase.from('cadastro_produtos_anexos').delete().eq('id', a.id);
    carregar();
  };

  if (somenteLeitura && !lista.length) return null;
  // 12e50 (09/10/2026): só aparência — a cor roxa dos arquivos de projeto mora no design.css (--acn-par-cor), com tom mais claro no tema escuro
  return (
    <div className={'acn-par' + (compacto ? ' compacto' : '')}>
      {!compacto && (
        <div className="acn-par-tit">
          <Icone path={mdiPencilRulerOutline} size={13} />Arquivos de projeto ({lista.length})
        </div>
      )}
      {!somenteLeitura && (
        <label className={'acn-par-anexar' + (enviando ? ' ocupado' : '')}>
          <input type="file" multiple hidden disabled={enviando}
            onChange={async e => { if (e.target.files?.length) await enviar(e.target.files); e.target.value = ''; }} />
          {enviando ? <><Icone path={mdiLoading} size={13} />Enviando...</> : <><Icone path={mdiPaperclip} size={13} />Anexar desenho, esquema, PDF...</>}
        </label>
      )}
      <div className="acn-par-lista">
        {lista.map(a => (
          <div key={a.id} className="acn-par-item">
            <a href={a.url} target="_blank" rel="noreferrer" className="acn-par-nome">
              <Icone path={mdiPencilRulerOutline} size={12} /> {a.nome}
            </a>
            {!compacto && a.criado_por && <span className="acn-par-quem">{a.criado_por}</span>}
            {!somenteLeitura && (
              <Botao variante="discreto" pequeno icone={mdiClose} className="acn-par-x" aria-label={`Remover ${a.nome}`} onClick={() => remover(a)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
