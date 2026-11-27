// Imagem colada dentro de um texto formatado (Área Livre das licitações, nota do CRM, Área Livre da cotação do Compras) no bucket PRIVADO
// (plano do bucket privado, B4b, 26/11/2026).
// Por que existe: nesses textos o endereço da imagem mora DENTRO do HTML que o editor grava (`<img src="https://…/acn-media/…">`). Um <img> não pode pedir o endereço
// assinado (que vale 1 hora) por conta própria, e gravar o endereço assinado no texto o deixaria morto depois de uma hora. O desenho:
//  - o texto GUARDADO leva `<img data-arquivo="privado:<caminho>">`, sem `src`;
//  - ao DESENHAR o texto (no editor ou só para ler) `hidratarImagens` pede o endereço assinado de cada imagem e o põe no `src`;
//  - ao GRAVAR, `limparParaGravar` tira de volta o `src` e deixa só a marca (e, de passagem, troca o endereço público antigo pela marca: o texto antigo migra quando alguém o edita);
//  - texto antigo ainda não editado continua com o endereço público inteiro no `src` e é lido igual (o ajudante tenta o privado e cai no endereço velho se a cópia ainda não foi feita).
// A marca só vale para o caminho de uma imagem de texto (`marcaDeImagemValida`), porque o texto vem de quem edita e não pode apontar para outro arquivo privado.
import React, { useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { enviarArquivoPrivado, urlDoArquivo, caminhoDoValor, valorParaGravar } from './ArquivoPrivado';
import { marcaDeImagemValida } from './ArquivoPrivadoRegras';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { htmlSeguro } from './RichTextInput';

/** A marca ("privado:<caminho>") de uma <img> de texto, ou null se ela não é de arquivo nosso (imagem da internet, `data:`…). */
export function marcaDaImagem(img: Element): string | null {
  const m = img.getAttribute('data-arquivo');
  if (m && marcaDeImagemValida(m)) return m.trim();
  const r = caminhoDoValor(img.getAttribute('src'));
  if (r) {
    const v = valorParaGravar(r.caminho);
    if (marcaDeImagemValida(v)) return v;
  }
  return null;
}

/**
 * O endereço para mostrar a imagem de uma marca. Enquanto a cópia para o bucket privado não foi feita (o arquivo ainda está só no público), cai no endereço público do
 * mesmo caminho: o texto antigo, já com a marca depois de editado, não pode ficar sem imagem até alguém rodar a cópia.
 */
async function urlDaImagem(marca: string): Promise<string | null> {
  const assinado = await urlDoArquivo(marca);
  if (assinado) return assinado;
  const r = caminhoDoValor(marca);
  return r ? supabase.storage.from('acn-media').getPublicUrl(r.caminho).data.publicUrl : null;
}

/** Pede o endereço assinado de cada imagem nossa dentro de `raiz` e o põe no `src`. Não grava nada e não dispara `input` do editor. */
export function hidratarImagens(raiz: HTMLElement | null) {
  if (!raiz) return;
  raiz.querySelectorAll('img').forEach((img) => {
    const marca = marcaDaImagem(img);
    if (!marca) return;
    img.setAttribute('data-arquivo', marca);
    urlDaImagem(marca).then((url) => {
      if (!raiz.contains(img)) return;   // o texto foi trocado enquanto o endereço vinha
      if (url) img.setAttribute('src', url);
      else { img.removeAttribute('src'); if (!img.getAttribute('alt')) img.setAttribute('alt', 'imagem indisponível'); }
    });
  });
}

/** O HTML do editor para guardar no banco: cada imagem nossa fica só com a marca, sem o endereço assinado (que expira em 1 hora). Sem imagem nossa, devolve o texto igual. */
export function limparParaGravar(html: string): string {
  if (!html || !/<img\b/i.test(html) || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const raiz = doc.body.firstChild as HTMLElement;
  if (!raiz) return html;
  let mudou = false;
  raiz.querySelectorAll('img').forEach((img) => {
    const marca = marcaDaImagem(img);
    if (!marca) return;
    img.setAttribute('data-arquivo', marca);
    img.removeAttribute('src');
    mudou = true;
  });
  return mudou ? raiz.innerHTML : html;
}

/**
 * Envia a imagem ao bucket privado e devolve o <img> para o editor (`insertHTML`): a marca para gravar e o endereço assinado só para a imagem aparecer agora.
 * `pasta` é o caminho até a pasta de imagens do texto, ex.: `licitacoes/<id>/area-livre`. O nome leva Date.now() (o privado não sobrescreve) e a extensão é só letras e números.
 */
export async function enviarImagemDeTexto(file: File, pasta: string, estiloExtra = ''): Promise<{ html: string | null; erro: string | null }> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'png';
  const caminho = `${pasta}/${Date.now()}.${ext}`;
  const { valor, erro } = await enviarArquivoPrivado(caminho, file, file.type || undefined);
  if (erro || !valor) return { html: null, erro: explicarErroDeEnvio(erro, file) };
  const url = await urlDoArquivo(valor, true);
  const src = url ? ` src="${url}"` : '';
  return { html: `<img data-arquivo="${valor}"${src} style="max-width:100%;border-radius:4px;margin:4px 0;${estiloExtra}" />`, erro: null };
}

/** Texto formatado só para LER (sem editar), com as imagens nossas já pelo endereço assinado. */
export function HtmlComImagens({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seguro = useMemo(() => htmlSeguro(html || ''), [html]);
  useEffect(() => { hidratarImagens(ref.current); }, [seguro]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: seguro }} />;
}
