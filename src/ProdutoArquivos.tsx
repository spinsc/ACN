// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ProdutoArquivos — arquivos de projeto da estrutura de um produto (desenho,
// esquema elétrico, DXF, PDF...). Ficam com o produto e aparecem em quem usa a
// estrutura: cadastro, visualização da estrutura e itens das demandas.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';

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
  return (
    <div style={{ marginTop: compacto ? 4 : 8 }}>
      {!compacto && (
        <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>
          📐 Arquivos de projeto ({lista.length})
        </div>
      )}
      {!somenteLeitura && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', border: '1px dashed #c4b5fd', borderRadius: 5,
          cursor: enviando ? 'wait' : 'pointer', background: '#faf5ff', fontSize: 10, color: '#7c3aed', marginBottom: 4 }}>
          <input type="file" multiple style={{ display: 'none' }} disabled={enviando}
            onChange={async e => { if (e.target.files?.length) await enviar(e.target.files); e.target.value = ''; }} />
          {enviando ? '⏳ Enviando...' : '📎 Anexar desenho, esquema, PDF...'}
        </label>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lista.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
            <a href={a.url} target="_blank" rel="noreferrer" style={{ color: '#6d28d9', textDecoration: 'underline', flex: 1, wordBreak: 'break-all' }}>
              📐 {a.nome}
            </a>
            {!compacto && a.criado_por && <span style={{ color: '#94a3b8', fontSize: 9 }}>{a.criado_por}</span>}
            {!somenteLeitura && (
              <button onClick={() => remover(a)} aria-label={`Remover ${a.nome}`}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
