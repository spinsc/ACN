// @ts-nocheck
// Peças de tela para arquivo do bucket privado (Etapa 17, onda 5b, 26/11/2026). A regra e o endereço assinado estão em ArquivoPrivado.ts.
import React from 'react';
import { useUrlDoArquivo, abrirArquivo } from './ArquivoPrivado';

/** <img> de um arquivo guardado no banco (privado ou comum). Enquanto o endereço assinado não chega, mostra "…"; se não dá para abrir, "imagem indisponível". */
export function ImagemPrivada({ valor, alt, className }: { valor: string | null | undefined; alt?: string; className?: string }) {
  const url = useUrlDoArquivo(valor);
  if (url === undefined) return <span className="acn-fraco" aria-busy="true">…</span>;
  if (!url) return <span className="acn-fraco">imagem indisponível</span>;
  return <img src={url} alt={alt || ''} className={className} />;
}

/** Link que abre um arquivo (privado ou comum) em aba nova, pedindo o endereço assinado na hora do clique. */
export function LinkDeArquivo({ valor, className, children }: { valor: string | null | undefined; className?: string; children: React.ReactNode }) {
  if (!valor) return null;
  return (
    <a href="#" className={className} onClick={(e) => { e.preventDefault(); abrirArquivo(valor); }}>
      {children}
    </a>
  );
}
