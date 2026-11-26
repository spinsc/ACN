// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// RichTextInput — campo de texto com formatação (negrito/sublinhado/tachado/
// cor) via toolbar CONTEXTUAL: só aparece depois que o usuário seleciona um
// trecho do texto (ou seleciona e clica com o botão direito). Sem barra fixa
// — pensado pra substituir <textarea>/<input> de texto livre pelo sistema
// todo sem tomar espaço permanente na tela.
//
// Diferente do padrão de toolbar SEMPRE VISÍVEL já usado em "Área Livre"
// (AreaLivre, LicitacoesTab.tsx) — aquele continua exatamente como está, não
// foi tocado. Os dois padrões coexistem por escolha: Área Livre é uma área
// grande de notas onde a barra fixa faz sentido; este componente é pra
// campos de formulário comuns (observações, descrições) espalhados pelo
// sistema, onde uma barra permanente pesaria demais na tela.
//
// Armazena/retorna o conteúdo como HTML (innerHTML do contentEditable) — ao
// trocar um campo de <textarea>/<input> por este componente, quem exibe esse
// valor em outro lugar (lista, PDF, mensagem de WhatsApp) precisa passar a
// tratar como HTML, não mais como texto puro.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUsers } from './MencaoTextarea';
import { combinaBusca } from './SearchUtils';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiAccountOutline, mdiPalette } from '@mdi/js';

// Só reconhece como HTML já formatado se tiver uma das tags que este editor
// (ou o execCommand por trás dele) realmente produz — um texto legado tipo
// "cliente <preferencial>" não deve ser confundido com HTML. Exportado pra
// quem PRECISA exibir o valor fora deste componente (dangerouslySetInnerHTML
// em uma lista/card) usar o mesmo critério, sem duplicar a regex por arquivo.
export const pareceHtmlFormatado = (s: string) => /<\/?(b|i|u|strike|span|br|div|p|a|img|font)\b/i.test(s || '');
// 26/11/2026 (pacote de segurança da migração, S5): antes, o texto que "parecia formatado" passava inteiro, inclusive uma imagem ou um
// link com código escondido (atributos como onerror rodam um programa no navegador de quem abre a tela, com a sessão dele). Agora o HTML
// é desmontado e só ficam as marcas de formatação que o editor produz, sem nenhum atributo que rode código; link só http, https, mailto,
// âncora ou caminho do próprio sistema; imagem só http, https ou data:image. Texto comum continua só "escapado", como antes.
const escaparHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MARCAS_PERMITIDAS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'DIV', 'P', 'A', 'IMG', 'FONT', 'UL', 'OL', 'LI',
  'SUB', 'SUP', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
const MARCAS_REMOVIDAS_COM_CONTEUDO = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH',
  'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'AUDIO', 'VIDEO', 'SOURCE', 'TITLE', 'HEAD']);
const ATRIBUTOS_POR_MARCA: Record<string, string[]> = { A: ['href', 'target', 'title'], IMG: ['src', 'alt', 'title', 'width', 'height'], FONT: ['color', 'face', 'size'] };
const ATRIBUTOS_DE_TODAS = ['style', 'align', 'class'];
function limparHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return escaparHtml(html);
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const raiz = doc.body.firstChild as HTMLElement;
  if (!raiz) return escaparHtml(html);
  const visitar = (no: Node) => {
    for (const filho of Array.from(no.childNodes)) {
      if (filho.nodeType === 3) continue;                       // texto
      if (filho.nodeType !== 1) { (filho as any).remove(); continue; }   // comentário e o resto
      const el = filho as HTMLElement;
      const marca = el.tagName.toUpperCase();
      if (MARCAS_REMOVIDAS_COM_CONTEUDO.has(marca)) { el.remove(); continue; }
      if (!MARCAS_PERMITIDAS.has(marca)) {                      // marca desconhecida: fica o conteúdo, sem a marca
        visitar(el);
        el.replaceWith(...Array.from(el.childNodes));
        continue;
      }
      for (const atr of Array.from(el.attributes)) {
        const nome = atr.name.toLowerCase();
        const valor = (atr.value || '').trim();
        const permitido = (ATRIBUTOS_POR_MARCA[marca] || []).includes(nome) || ATRIBUTOS_DE_TODAS.includes(nome);
        if (!permitido
          || (nome === 'href' && !/^(https?:|mailto:|#|\/)/i.test(valor))
          || (nome === 'src' && !/^(https?:|data:image\/(png|jpe?g|gif|webp);)/i.test(valor))
          || (nome === 'style' && /url\s*\(|expression|javascript:|behavior|@import/i.test(valor))) {
          el.removeAttribute(atr.name);
        }
      }
      if (marca === 'A') el.setAttribute('rel', 'noopener noreferrer');
      visitar(el);
    }
  };
  visitar(raiz);
  return raiz.innerHTML;
}
export const htmlSeguro = (s: string) => {
  const bruto = s || '';
  return pareceHtmlFormatado(bruto) ? limparHtml(bruto) : escaparHtml(bruto);
};

// Acha o {node, offset} do DOM correspondente a um offset de texto plano
// contado desde o início de `root` — caminha os nós de texto na ordem do
// documento (funciona atravessando tags como <b>/<u> já aplicadas).
function posicaoDoOffset(root: Node, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let node = walker.nextNode();
  while (node) {
    const len = (node.textContent || '').length;
    if (acc + len >= offset) return { node, offset: offset - acc };
    acc += len;
    node = walker.nextNode();
  }
  return root.lastChild ? { node: root, offset: root.childNodes.length } : { node: root, offset: 0 };
}

export default function RichTextInput({
  value, onChange, placeholder, style, className, minHeight = 60, singleLine = false, disabled = false, mencoes = false,
}: any) {
  const editorRef = useRef<any>(null);
  const corRef = useRef<any>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);

  // ── @menção (opcional, mencoes=true) — mesma UX do MencaoTextarea, só que
  // usando Range/TreeWalker em vez de selectionStart/setSelectionRange
  // (contentEditable não tem essas APIs de <textarea>). ──────────────────────
  const usuarios = useUsers();
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const dropRef = useRef<any>(null);
  const atRangeRef = useRef<Range | null>(null); // do '@' até o cursor atual (o que será substituído)

  useEffect(() => {
    if (!mencoes) return;
    const fn = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (editorRef.current?.contains(e.target as Node)) return;
      setShowDrop(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [mencoes]);

  const verificarMencao = () => {
    if (!mencoes || !usuarios.length || !editorRef.current) { setShowDrop(false); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).startContainer == null) { setShowDrop(false); return; }
    const cursorRange = sel.getRangeAt(0);
    if (!editorRef.current.contains(cursorRange.startContainer)) { setShowDrop(false); return; }
    const pre = document.createRange();
    pre.selectNodeContents(editorRef.current);
    pre.setEnd(cursorRange.startContainer, cursorRange.startOffset);
    const antes = pre.toString();
    const idx = antes.lastIndexOf('@');
    if (idx === -1) { setShowDrop(false); return; }
    const frag = antes.slice(idx + 1);
    if (/[\s\n]/.test(frag)) { setShowDrop(false); return; }
    const filtrados = frag.length === 0
      ? usuarios.slice(0, 10)
      : usuarios.filter((u: any) => combinaBusca(u.nome, frag)).slice(0, 10);
    if (!filtrados.length) { setShowDrop(false); return; }

    const pos = posicaoDoOffset(editorRef.current, idx);
    if (!pos) { setShowDrop(false); return; }
    const atRange = document.createRange();
    atRange.setStart(pos.node, pos.offset);
    atRange.setEnd(cursorRange.startContainer, cursorRange.startOffset);
    atRangeRef.current = atRange.cloneRange();

    const rect = cursorRange.getBoundingClientRect();
    setDropStyle({ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: 240, zIndex: 999999 });
    setSugestoes(filtrados);
    setShowDrop(true);
  };

  const selecionarMencao = (u: any) => {
    if (!atRangeRef.current) return;
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(atRangeRef.current); }
    editorRef.current?.focus();
    document.execCommand('insertText', false, `@${u.nome} `);
    setShowDrop(false);
    emitChange();
  };

  // Sincroniza o HTML externo -> DOM só quando muda de verdade (evita
  // sobrescrever o cursor enquanto o usuário está digitando). Campos que
  // existiam antes deste componente guardaram texto puro (sem tag nenhuma)
  // — se for o caso, escapa < > & antes de jogar em innerHTML, senão um
  // "<fulano>" digitado por alguém vira HTML quebrado.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const bruto = value || '';
    const html = pareceHtmlFormatado(bruto) ? bruto : htmlSeguro(bruto).replace(/\n/g, '<br>');
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value]);

  const emitChange = () => { if (editorRef.current) onChange(editorRef.current.innerHTML); };

  const salvarSelecao = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const mostrarToolbarNaSelecao = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setToolbar(null); return; }
    if (!editorRef.current || !sel.anchorNode || !editorRef.current.contains(sel.anchorNode)) { setToolbar(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setToolbar(null); return; }
    salvarSelecao();
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleContextMenu = (e: any) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode)) {
      e.preventDefault(); // troca o menu nativo do botão direito pela nossa toolbar
      mostrarToolbarNaSelecao();
    }
  };

  // Restaura a seleção salva (pode ter se perdido, ex: o picker de cor rouba
  // foco) e aplica o comando — mesmo padrão já usado e testado em AreaLivre.
  const aplicar = (cmd: string, valor?: string) => {
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
    emitChange();
  };

  const handleKeyDown = (e: any) => {
    if (singleLine && e.key === 'Enter') e.preventDefault();
    if (mencoes && e.key === 'Escape') setShowDrop(false);
  };
  const handleInput = () => { emitChange(); verificarMencao(); };
  const handleKeyUp = (e: any) => { mostrarToolbarNaSelecao(); if (mencoes && e.key !== 'Escape') verificarMencao(); };

  // 12e56 (09/10/2026): só aparência — o campo, a barra de formatação e a lista de @menção ganharam classes no design.css (a dica "placeholder" também saiu
  // do <style> embutido). `minHeight` (parâmetro), `style` (de quem chama) e as posições da barra e da lista (calculadas na hora) continuam inline, de propósito
  return (
    <div className="acn-rti-raiz">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={'acn-rti' + (singleLine ? ' uma-linha' : '') + (disabled ? ' desativado' : '') + (className ? ' ' + className : '')}
        onInput={handleInput}
        onMouseUp={mostrarToolbarNaSelecao}
        onKeyUp={handleKeyUp}
        onContextMenu={handleContextMenu}
        onBlur={() => setTimeout(() => setToolbar(null), 150)}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        style={{ minHeight: singleLine ? undefined : minHeight, ...style }}
      />
      {toolbar && !disabled && (
        <div className="acn-rti-barra" style={{ left: toolbar.x, top: toolbar.y - 40 }}>
          <Botao variante="discreto" pequeno className="acn-rti-bt negrito" title="Negrito" onMouseDown={e => { e.preventDefault(); aplicar('bold'); }}>B</Botao>
          <Botao variante="discreto" pequeno className="acn-rti-bt sublinhado" title="Sublinhado" onMouseDown={e => { e.preventDefault(); aplicar('underline'); }}>S</Botao>
          <Botao variante="discreto" pequeno className="acn-rti-bt tachado" title="Tachado" onMouseDown={e => { e.preventDefault(); aplicar('strikeThrough'); }}>X</Botao>
          <Botao variante="discreto" pequeno className="acn-rti-bt" icone={mdiPalette} title="Cor do texto" onMouseDown={e => { e.preventDefault(); salvarSelecao(); corRef.current?.click(); }} />
          <input ref={corRef} type="color" hidden onChange={e => aplicar('foreColor', e.target.value)} />
        </div>
      )}
      {mencoes && showDrop && sugestoes.length > 0 && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} className="acn-sug" style={dropStyle}>
          <div className="acn-sug-tit">
            <Icone path={mdiAccountOutline} size={12} /> MENCIONAR USUÁRIO
          </div>
          {sugestoes.map((u: any) => (
            <div key={u.id} className="acn-sug-item" onMouseDown={e => { e.preventDefault(); selecionarMencao(u); }}>
              <span className="acn-sug-av">
                {(u.nome || '?')[0].toUpperCase()}
              </span>
              <span className="acn-sug-nome">@{u.nome}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
