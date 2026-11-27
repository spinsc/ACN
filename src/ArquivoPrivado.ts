// @ts-nocheck
// Arquivos do bucket privado (Etapa 17, onda 5b, 26/11/2026): enviar, resolver o endereço assinado e abrir. As regras de "o que é privado" estão em ArquivoPrivadoRegras.ts.
// Endereço assinado vale 1 hora e é guardado em memória por 50 minutos (nada é gravado no navegador). Valor que não é de arquivo privado (foto, anexo de outra pasta) passa direto.
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { BUCKET_PRIVADO, caminhoDoValor, valorParaGravar } from './ArquivoPrivadoRegras';

export { BUCKET_PRIVADO, MARCA_PRIVADA, caminhoDoValor, caminhoEhPrivado, valorParaGravar } from './ArquivoPrivadoRegras';

const VALIDADE_S = 3600;
const GUARDA_MS = 50 * 60 * 1000;      // reaproveita o endereço por 50 min (vale 60)
const GUARDA_FALHA_MS = 5 * 60 * 1000; // arquivo antigo que ainda não foi copiado: não perguntar de novo a cada desenho da tela
const guardados = new Map<string, { url: string | null; ate: number }>();
const pedidos = new Map<string, Promise<string | null>>();

/** Envia ao bucket privado. Devolve o valor que se grava no banco ("privado:<caminho>") ou o erro do armazenamento (quem chama explica com explicarErroDeEnvio). */
export async function enviarArquivoPrivado(caminho: string, corpo: Blob | File, contentType?: string) {
  const opcoes: any = { upsert: false };
  if (contentType) opcoes.contentType = contentType;
  const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).upload(caminho, corpo, opcoes);
  if (error || !data) return { valor: null, erro: error || new Error('o armazenamento não respondeu') };
  return { valor: valorParaGravar(caminho), erro: null };
}

/**
 * O endereço para mostrar ou abrir o arquivo guardado em `valor`. Valor comum devolve igual; valor de arquivo privado vira endereço assinado.
 * Registro antigo (endereço público de uma pasta que passou a ser privada): tenta o privado e, se o arquivo ainda não foi copiado, devolve o endereço velho.
 * `fresco` ignora a guarda (o clique de "abrir" sempre pede um endereço novo). Devolve null quando o arquivo não pode ser aberto.
 */
export function urlDoArquivo(valor: string | null | undefined, fresco = false): Promise<string | null> {
  const r = caminhoDoValor(valor);
  if (!r) return Promise.resolve(valor ? String(valor) : null);
  const agora = Date.now();
  const g = guardados.get(r.caminho);
  if (!fresco && g && g.ate > agora) return Promise.resolve(g.url);
  const andando = pedidos.get(r.caminho);
  if (!fresco && andando) return andando;
  const p = (async () => {
    let url: string | null = null;
    try {
      const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(r.caminho, VALIDADE_S);
      if (!error && data?.signedUrl) url = data.signedUrl;
    } catch { /* cai no antigo, se houver */ }
    if (url) { guardados.set(r.caminho, { url, ate: Date.now() + GUARDA_MS }); return url; }
    const reserva = r.antigo ? String(valor) : null;
    guardados.set(r.caminho, { url: reserva, ate: Date.now() + GUARDA_FALHA_MS });
    return reserva;
  })();
  pedidos.set(r.caminho, p);
  p.finally(() => { if (pedidos.get(r.caminho) === p) pedidos.delete(r.caminho); });
  return p;
}

/** O endereço para um <img> ou <a>: undefined enquanto carrega, null se não dá para abrir, ou o endereço. */
export function useUrlDoArquivo(valor: string | null | undefined) {
  const direto = valor && !caminhoDoValor(valor) ? String(valor) : undefined;
  const [url, setUrl] = useState<string | null | undefined>(direto);
  useEffect(() => {
    let vivo = true;
    if (!valor) { setUrl(null); return; }
    if (!caminhoDoValor(valor)) { setUrl(String(valor)); return; }
    urlDoArquivo(valor).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [valor]);
  return url;
}

/**
 * Abre o arquivo numa aba nova. A aba é aberta NA HORA do clique (senão o navegador a barra) e só depois recebe o endereço assinado, sempre novo.
 * Devolve false quando não deu para abrir (a pessoa já foi avisada).
 */
export async function abrirArquivo(valor: string | null | undefined): Promise<boolean> {
  if (!valor) return false;
  if (!caminhoDoValor(valor)) { window.open(String(valor), '_blank', 'noopener'); return true; }
  const aba = window.open('', '_blank');
  const url = await urlDoArquivo(valor, true);
  if (!url) {
    if (aba) aba.close();
    alert('Não foi possível abrir o arquivo agora. Verifique a conexão e tente de novo; se continuar, avise a TI.');
    return false;
  }
  if (!aba) { alert('Permita pop-ups neste site para abrir o arquivo.'); return false; }
  try { aba.opener = null; } catch { /* sem efeito */ }
  aba.location.href = url;
  return true;
}
