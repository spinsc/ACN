// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MencaoTextarea — textarea com autocomplete @usuário
// Portal via position:fixed para escapar de overflow:hidden em qualquer pai
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from './supabaseClient';

// ─── salvarMencoes: chame após gravar o registro pai ────────────────────────
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
  const matches = [...texto.matchAll(/@([^\s@]{2,40})/g)];
  if (!matches.length) return;
  const nomes = [...new Set(matches.map(m => m[1].trim()))];
  for (const nome of nomes) {
    const { data: usuarios } = await supabase
      .from('auth_usuarios').select('id, nome').ilike('nome', `%${nome}%`).limit(3);
    for (const u of (usuarios || [])) {
      if (u.id === mencionanteId) continue;
      const { count } = await supabase.from('mencoes')
        .select('id', { count: 'exact', head: true })
        .eq('mencionado_id', u.id).eq('contexto_id', contextoId).eq('campo', campo).eq('lida', false);
      if ((count || 0) === 0) {
        await supabase.from('mencoes').insert({
          mencionado_id: u.id, mencionado_nome: u.nome,
          mencionante_nome: mencionanteNome, mencionante_id: mencionanteId,
          contexto, contexto_id: contextoId, contexto_descricao: contextoDescricao,
          campo, texto_trecho: texto.slice(0, 200),
          aba_destino: abaDestino, lida: false, criado_em: new Date().toISOString(),
        });
      }
    }
  }
}

// ─── Componente ──────────────────────────────────────────────────────────────
interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function MencaoTextarea({ value, onChange, rows = 3, placeholder, style }: Props) {
  // Usa ref para a lista de usuários para NÃO criar closure stale
  const todosRef = useRef<any[]>([]);
  const [, forceRender] = useState(0);

  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [showDrop, setShowDrop]   = useState(false);
  const [dropRect, setDropRect]   = useState<DOMRect | null>(null);
  const [atPos, setAtPos]         = useState(0);

  const taRef      = useRef<HTMLTextAreaElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false); // evita race entre blur e mousedown

  // Carrega usuários
  useEffect(() => {
    supabase.from('auth_usuarios').select('id, nome').order('nome')
      .then(({ data }) => {
        todosRef.current = data || [];
        forceRender(n => n + 1); // garante re-render se necessário
      })
      .catch(console.error);
  }, []);

  // Fecha se clicar fora do dropdown E fora do textarea
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const ta = taRef.current;
      const dr = dropRef.current;
      if (ta && ta.contains(e.target as Node)) return;
      if (dr && dr.contains(e.target as Node)) return;
      setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Verifica se há menção ativa na posição do cursor ──
  function verificar(val: string, cursor: number) {
    const antes    = val.slice(0, cursor);
    const idx      = antes.lastIndexOf('@');
    if (idx === -1) { setShowDrop(false); return; }

    const frag = antes.slice(idx + 1);
    // Espaço ou nova linha → menção encerrada
    if (/[\s\n]/.test(frag)) { setShowDrop(false); return; }

    const lista = todosRef.current;
    if (!lista.length) return; // usuários ainda não carregaram

    const filtrados = frag.length === 0
      ? lista.slice(0, 8)
      : lista.filter(u => u.nome.toLowerCase().includes(frag.toLowerCase())).slice(0, 8);

    if (!filtrados.length) { setShowDrop(false); return; }

    // Posição do textarea na tela (fixed)
    if (taRef.current) setDropRect(taRef.current.getBoundingClientRect());
    setAtPos(idx);
    setSugestoes(filtrados);
    setShowDrop(true);
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    const pos = e.target.selectionStart ?? val.length;
    verificar(val, pos);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setShowDrop(false); return; }
    const ta = taRef.current;
    if (ta) verificar(ta.value, ta.selectionStart ?? ta.value.length);
  };

  // Insere o usuário selecionado no texto
  const selecionar = (u: any) => {
    closingRef.current = true;
    const ta = taRef.current;
    if (!ta) return;
    const cursor  = ta.selectionStart ?? value.length;
    const antes   = value.slice(0, atPos);
    const depois  = value.slice(cursor);
    const novo    = `${antes}@${u.nome} ${depois}`;
    onChange(novo);
    setShowDrop(false);
    setTimeout(() => {
      ta.focus();
      const pos = atPos + u.nome.length + 2;
      ta.setSelectionRange(pos, pos);
      closingRef.current = false;
    }, 10);
  };

  // Dropdown portal
  const dropdown = showDrop && dropRect && sugestoes.length > 0
    ? ReactDOM.createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top:   dropRect.bottom + 2,
            left:  dropRect.left,
            width: Math.max(dropRect.width, 230),
            zIndex: 99999,
            background: '#fff',
            border: '1.5px solid #c7d2fe',
            borderRadius: 8,
            boxShadow: '0 8px 28px rgba(0,0,0,.2)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          <div style={{
            padding: '5px 10px', fontSize: 9, color: '#6366f1', fontWeight: 700,
            borderBottom: '1px solid #e0e7ff', background: '#f5f3ff',
            borderRadius: '8px 8px 0 0',
          }}>
            👤 Mencionar usuário
          </div>
          {sugestoes.map(u => (
            <div
              key={u.id}
              // onMouseDown com preventDefault impede blur no textarea
              onMouseDown={e => { e.preventDefault(); selecionar(u); }}
              style={{
                padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, borderBottom: '1px solid #f1f5f9',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: '#6366f1', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {(u.nome || '?')[0].toUpperCase()}
              </span>
              <span style={{ fontWeight: 600 }}>@{u.nome}</span>
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        rows={rows}
        placeholder={placeholder ?? 'Digite aqui... use @Nome para mencionar alguém'}
        style={{
          width: '100%', padding: '6px 8px',
          border: '1px solid #d1d5db', borderRadius: 4,
          fontSize: 10, boxSizing: 'border-box',
          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
          ...style,
        }}
      />
      {dropdown}
    </>
  );
}
