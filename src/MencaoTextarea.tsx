// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MencaoTextarea — textarea com autocomplete @usuário
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Salva menções no banco após gravar o registro pai
export async function salvarMencoes(opts: {
  texto: string;
  mencionanteId: string;
  mencionanteNome: string;
  contexto: string;
  contextoId: string;
  contextoDescricao: string;
  campo: string;
  abaDestino: string;
}) {
  const { texto, mencionanteId, mencionanteNome, contexto, contextoId, contextoDescricao, campo, abaDestino } = opts;
  if (!texto || !contextoId) return;

  const matches = [...texto.matchAll(/@([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú ]+?)(?=\s|$|[,.;:!?])/g)];
  if (!matches.length) return;

  const nomes = [...new Set(matches.map(m => m[1].trim()))];
  for (const nome of nomes) {
    const { data: usuarios } = await supabase
      .from('auth_usuarios')
      .select('id, nome')
      .ilike('nome', `%${nome}%`)
      .limit(3);

    for (const u of (usuarios || [])) {
      if (u.id === mencionanteId) continue;
      const { count } = await supabase.from('mencoes')
        .select('id', { count: 'exact', head: true })
        .eq('mencionado_id', u.id)
        .eq('contexto_id', contextoId)
        .eq('campo', campo)
        .eq('lida', false);
      if ((count || 0) === 0) {
        await supabase.from('mencoes').insert({
          mencionado_id:      u.id,
          mencionado_nome:    u.nome,
          mencionante_nome:   mencionanteNome,
          mencionante_id:     mencionanteId,
          contexto,
          contexto_id:        contextoId,
          contexto_descricao: contextoDescricao,
          campo,
          texto_trecho:       texto.slice(0, 200),
          aba_destino:        abaDestino,
          lida:               false,
          criado_em:          new Date().toISOString(),
        });
      }
    }
  }
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function MencaoTextarea({ value, onChange, rows = 3, placeholder, style }: Props) {
  const [todos, setTodos]         = useState<any[]>([]);
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [showDrop, setShowDrop]   = useState(false);
  const [atPos, setAtPos]         = useState(-1);
  const [dropTop, setDropTop]     = useState(0);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Carrega todos os usuários uma vez (sem filtro ativo para não excluir ninguém)
  useEffect(() => {
    supabase.from('auth_usuarios').select('id, nome').order('nome')
      .then(({ data }) => setTodos(data || []));
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const verificarMencao = useCallback((val: string, cursorPos: number) => {
    const antes    = val.slice(0, cursorPos);
    const idx      = antes.lastIndexOf('@');

    if (idx === -1) { setShowDrop(false); return; }

    const fragment = antes.slice(idx + 1);

    // Espaço/quebra de linha no fragmento → não é mais uma menção ativa
    if (/\s/.test(fragment)) { setShowDrop(false); return; }

    const filtrados = fragment.length === 0
      ? todos.slice(0, 8)
      : todos.filter(u => u.nome.toLowerCase().includes(fragment.toLowerCase())).slice(0, 8);

    if (filtrados.length === 0) { setShowDrop(false); return; }

    // Posiciona dropdown logo abaixo do textarea
    if (taRef.current) {
      setDropTop(taRef.current.offsetHeight + 2);
    }

    setAtPos(idx);
    setSugestoes(filtrados);
    setShowDrop(true);
  }, [todos]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    // Usa setTimeout para garantir que selectionStart já foi atualizado
    setTimeout(() => {
      if (taRef.current) {
        verificarMencao(val, taRef.current.selectionStart ?? val.length);
      }
    }, 0);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setShowDrop(false); return; }
    const ta = taRef.current;
    if (!ta) return;
    verificarMencao(ta.value, ta.selectionStart ?? ta.value.length);
  };

  const selecionar = (u: any) => {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const antes  = value.slice(0, atPos);
    const depois = value.slice(cursor);
    const novo   = `${antes}@${u.nome} ${depois}`;
    onChange(novo);
    setShowDrop(false);
    setTimeout(() => {
      ta.focus();
      const pos = atPos + u.nome.length + 2;
      ta.setSelectionRange(pos, pos);
    }, 10);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        rows={rows}
        placeholder={placeholder ?? 'Digite aqui... use @Nome para mencionar um usuário'}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          fontSize: 10,
          boxSizing: 'border-box',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          ...style,
        }}
      />

      {showDrop && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute',
          top: dropTop,
          left: 0,
          zIndex: 9999,
          background: 'white',
          border: '1px solid #c7d2fe',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          minWidth: 220,
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '5px 10px',
            fontSize: 9,
            color: '#6366f1',
            fontWeight: 700,
            borderBottom: '1px solid #e0e7ff',
            background: '#f5f3ff',
            borderRadius: '8px 8px 0 0',
          }}>
            👤 Mencionar usuário
          </div>
          {sugestoes.map(u => (
            <div
              key={u.id}
              onMouseDown={e => { e.preventDefault(); selecionar(u); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: '#1e293b',
                borderBottom: '1px solid #f1f5f9',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <span style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#6366f1',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {(u.nome || '?')[0].toUpperCase()}
              </span>
              <span style={{ fontWeight: 600 }}>@{u.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
