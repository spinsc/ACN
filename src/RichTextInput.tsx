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

// Só reconhece como HTML já formatado se tiver uma das tags que este editor
// (ou o execCommand por trás dele) realmente produz — um texto legado tipo
// "cliente <preferencial>" não deve ser confundido com HTML. Exportado pra
// quem PRECISA exibir o valor fora deste componente (dangerouslySetInnerHTML
// em uma lista/card) usar o mesmo critério, sem duplicar a regex por arquivo.
export const pareceHtmlFormatado = (s: string) => /<\/?(b|i|u|strike|span|br|div|p|a|img|font)\b/i.test(s || '');
export const htmlSeguro = (s: string) => {
  const bruto = s || '';
  return pareceHtmlFormatado(bruto) ? bruto : bruto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer',
  fontSize: 11, padding: '5px 8px', borderRadius: 4, lineHeight: 1,
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
      : usuarios.filter((u: any) => u.nome?.toLowerCase().includes(frag.toLowerCase())).slice(0, 10);
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

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={className}
        onInput={handleInput}
        onMouseUp={mostrarToolbarNaSelecao}
        onKeyUp={handleKeyUp}
        onContextMenu={handleContextMenu}
        onBlur={() => setTimeout(() => setToolbar(null), 150)}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        style={{
          minHeight: singleLine ? undefined : minHeight, padding: '5px 8px', border: '1px solid #d1d5db',
          borderRadius: 4, fontSize: 10, outline: 'none', background: disabled ? '#f1f5f9' : '#fff',
          color: '#374151', wordBreak: 'break-word',
          whiteSpace: singleLine ? 'nowrap' : 'pre-wrap', overflow: singleLine ? 'hidden' : 'visible',
          boxSizing: 'border-box', ...style,
        }}
      />
      {toolbar && !disabled && (
        <div
          style={{
            position: 'fixed', left: toolbar.x, top: toolbar.y - 40, transform: 'translateX(-50%)',
            background: '#1e293b', borderRadius: 6, padding: 3, display: 'flex', gap: 1, zIndex: 2000,
            boxShadow: '0 4px 14px rgba(0,0,0,.3)',
          }}
        >
          <button title="Negrito" onMouseDown={e => { e.preventDefault(); aplicar('bold'); }} style={{ ...btnStyle, fontWeight: 700 }}>B</button>
          <button title="Sublinhado" onMouseDown={e => { e.preventDefault(); aplicar('underline'); }} style={{ ...btnStyle, textDecoration: 'underline' }}>S</button>
          <button title="Tachado" onMouseDown={e => { e.preventDefault(); aplicar('strikeThrough'); }} style={{ ...btnStyle, textDecoration: 'line-through' }}>X</button>
          <button title="Cor do texto" onMouseDown={e => { e.preventDefault(); salvarSelecao(); corRef.current?.click(); }} style={btnStyle}>🎨</button>
          <input ref={corRef} type="color" style={{ display: 'none' }} onChange={e => aplicar('foreColor', e.target.value)} />
        </div>
      )}
      {mencoes && showDrop && sugestoes.length > 0 && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={{ ...dropStyle, background: '#fff', border: '1.5px solid #c7d2fe', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(0,0,0,.2)', maxHeight: 240, overflowY: 'auto' }}>
          <div style={{ padding: '5px 10px', fontSize: 9, color: '#6366f1', fontWeight: 700, borderBottom: '1px solid #e0e7ff',
            background: '#f5f3ff', borderRadius: '8px 8px 0 0', letterSpacing: .3 }}>
            👤 MENCIONAR USUÁRIO
          </div>
          {sugestoes.map((u: any) => (
            <div key={u.id} onMouseDown={e => { e.preventDefault(); selecionarMencao(u); }}
              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, borderBottom: '1px solid #f1f5f9', background: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366f1', color: 'white', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                {(u.nome || '?')[0].toUpperCase()}
              </span>
              <span style={{ fontWeight: 600 }}>@{u.nome}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <style>{`[data-placeholder]:empty::before { content: attr(data-placeholder); color:#9ca3af; pointer-events:none; }`}</style>
    </div>
  );
}
