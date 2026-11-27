// @ts-nocheck
// Peças de tela para arquivo do bucket privado (Etapa 17, onda 5b e fatias do plano do bucket privado, 26/11/2026). A regra e o endereço assinado estão em ArquivoPrivado.ts.
import React from 'react';
import { useUrlDoArquivo, abrirArquivo } from './ArquivoPrivado';

/** <img> de um arquivo guardado no banco (privado ou comum). Enquanto o endereço assinado não chega, mostra "…"; se não dá para abrir, "imagem indisponível". */
export function ImagemPrivada({ valor, alt, className }: { valor: string | null | undefined; alt?: string; className?: string }) {
  const url = useUrlDoArquivo(valor);
  if (url === undefined) return <span className="acn-fraco" aria-busy="true">…</span>;
  if (!url) return <span className="acn-fraco">imagem indisponível</span>;
  return <img src={url} alt={alt || ''} className={className} />;
}

/** Link que abre um arquivo (privado ou comum) em aba nova, pedindo o endereço assinado na hora do clique. Aceita className, style, title, aria-label e o resto dos atributos de <a>. */
export function LinkDeArquivo({ valor, children, ...resto }: { valor: string | null | undefined; children: React.ReactNode; [k: string]: any }) {
  if (!valor) return null;
  return (
    <a href="#" {...resto} onClick={(e) => { e.preventDefault(); abrirArquivo(valor); }}>
      {children}
    </a>
  );
}
