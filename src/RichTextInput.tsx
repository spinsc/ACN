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

export default function RichTextInput({
  value, onChange, placeholder, style, className, minHeight = 60, singleLine = false, disabled = false,
}: any) {
  const editorRef = useRef<any>(null);
  const corRef = useRef<any>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);

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

  const handleKeyDown = (e: any) => { if (singleLine && e.key === 'Enter') e.preventDefault(); };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={className}
        onInput={emitChange}
        onMouseUp={mostrarToolbarNaSelecao}
        onKeyUp={mostrarToolbarNaSelecao}
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
      <style>{`[data-placeholder]:empty::before { content: attr(data-placeholder); color:#9ca3af; pointer-events:none; }`}</style>
    </div>
  );
}
