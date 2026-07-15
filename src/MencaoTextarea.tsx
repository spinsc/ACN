// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MencaoTextarea — textarea com autocomplete @usuário
//
// CACHE DE MÓDULO: usuários carregados 1x para TODAS as instâncias do sistema
// DROPDOWN FIXED: escapa de qualquer overflow:hidden nos containers pais
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ── Cache singleton – carrega 1x e compartilha entre todas as instâncias ─────
let _cache: any[]         = [];
let _loaded               = false;
let _callbacks: Function[] = [];

async function loadUsers() {
  if (_loaded) return;
  console.log('[MencaoTextarea] iniciando carga de usuários...');
  try {
    const { data, error } = await supabase
      .from('auth_usuarios')
      .select('id, nome')
      .order('nome')
      .limit(500);
    if (error) {
      console.error('[MencaoTextarea] erro Supabase:', error.message, error);
    }
    _cache  = (data || []).filter((u: any) => u.nome?.trim());
    _loaded = true;
    console.log('[MencaoTextarea] usuários carregados:', _cache.length, _cache.map((u:any)=>u.nome));
    _callbacks.forEach(cb => cb(_cache));
    _callbacks = [];
  } catch (err) {
    console.error('[MencaoTextarea] exceção ao carregar usuários:', err);
    _loaded = false; // permite nova tentativa
  }
}

function useUsers(): any[] {
  const [users, setUsers] = useState<any[]>(_cache);
  useEffect(() => {
    if (_loaded) { setUsers(_cache); return; }
    _callbacks.push(setUsers);
    loadUsers();
    return () => { _callbacks = _callbacks.filter(cb => cb !== setUsers); };
  }, []);
  return users;
}

// ── salvarMencoes: chamar após salvar o registro pai ─────────────────────────
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
  const { texto, mencionanteId, mencionanteNome, contexto, contextoId,
          contextoDescricao, campo, abaDestino } = opts;
  if (!texto || !contextoId) return;

  // Extrai todos os @Nome do texto
  const matches = [...texto.matchAll(/@([^\s]{2,})/g)];
  if (!matches.length) return;
  const nomes = [...new Set(matches.map(m => m[1]))];

  for (const nome of nomes) {
    const { data: us } = await supabase
      .from('auth_usuarios').select('id, nome').ilike('nome', `%${nome}%`).limit(3);
    for (const u of (us || [])) {
      if (u.id === mencionanteId) continue;
      const { count } = await supabase.from('mencoes')
        .select('id', { count: 'exact', head: true })
        .eq('mencionado_id', u.id).eq('contexto_id', contextoId)
        .eq('campo', campo).eq('lida', false);
      if ((count || 0) === 0) {
        await supabase.from('mencoes').insert({
          mencionado_id: u.id, mencionado_nome: u.nome,
          mencionante_id: mencionanteId, mencionante_nome: mencionanteNome,
          contexto, contexto_id: contextoId, contexto_descricao: contextoDescricao,
          campo, texto_trecho: texto.slice(0, 200),
          aba_destino: abaDestino, lida: false, criado_em: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Componente principal ──────────────────────────────────────────────────────
interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function MencaoTextarea({ value, onChange, rows = 3, placeholder, style }: Props) {
  const users = useUsers();  // lista de usuários (cache singleton)

  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [showDrop,  setShowDrop]  = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const [atPos,     setAtPos]     = useState(0);

  const taRef   = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown se clicar fora
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (taRef.current?.contains(e.target as Node)) return;
      setShowDrop(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function verificar(val: string, cursor: number) {
    if (!users.length) return; // usuários ainda não carregaram
    const antes = val.slice(0, cursor);
    const idx   = antes.lastIndexOf('@');
    if (idx === -1) { setShowDrop(false); return; }
    const frag = antes.slice(idx + 1);
    if (/[\s\n]/.test(frag)) { setShowDrop(false); return; }

    const filtrados = frag.length === 0
      ? users.slice(0, 10)
      : users.filter(u => u.nome?.toLowerCase().includes(frag.toLowerCase())).slice(0, 10);

    if (!filtrados.length) { setShowDrop(false); return; }

    // Calcula posição fixed do dropdown logo abaixo do textarea
    const rect = taRef.current?.getBoundingClientRect();
    if (rect) {
      setDropStyle({
        position: 'fixed',
        top:      rect.bottom + 2,
        left:     rect.left,
        width:    Math.max(rect.width, 240),
        zIndex:   999999,
      });
    }
    setAtPos(idx);
    setSugestoes(filtrados);
    setShowDrop(true);
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    verificar(val, e.target.selectionStart ?? val.length);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setShowDrop(false); return; }
    const ta = taRef.current;
    if (ta) verificar(ta.value, ta.selectionStart ?? ta.value.length);
  };

  const selecionar = (u: any) => {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const novo   = `${value.slice(0, atPos)}@${u.nome} ${value.slice(cursor)}`;
    onChange(novo);
    setShowDrop(false);
    setTimeout(() => {
      ta.focus();
      const pos = atPos + u.nome.length + 2;
      ta.setSelectionRange(pos, pos);
    }, 10);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        rows={rows}
        placeholder={placeholder ?? 'Digite... use @Nome para mencionar alguém'}
        style={{
          width: '100%', padding: '6px 8px',
          border: '1px solid #d1d5db', borderRadius: 4,
          fontSize: 10, boxSizing: 'border-box',
          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
          ...style,
        }}
      />

      {/* Dropdown — renderizado via portal em fixed para escapar de overflow:hidden */}
      {showDrop && sugestoes.length > 0 && typeof document !== 'undefined' &&
        (() => {
          const el = (
            <div
              ref={dropRef}
              style={{
                ...dropStyle,
                background: '#fff',
                border: '1.5px solid #c7d2fe',
                borderRadius: 8,
                boxShadow: '0 8px 28px rgba(0,0,0,.2)',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              <div style={{
                padding: '5px 10px', fontSize: 9, color: '#6366f1', fontWeight: 700,
                borderBottom: '1px solid #e0e7ff', background: '#f5f3ff',
                borderRadius: '8px 8px 0 0', letterSpacing: .3,
              }}>
                👤 MENCIONAR USUÁRIO
              </div>
              {sugestoes.map(u => (
                <div
                  key={u.id}
                  onMouseDown={e => { e.preventDefault(); selecionar(u); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 11, borderBottom: '1px solid #f1f5f9',
                    background: '#fff',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#6366f1', color: 'white', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {(u.nome || '?')[0].toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 600 }}>@{u.nome}</span>
                </div>
              ))}
            </div>
          );
          // Renderiza via portal para escapar de overflow:hidden
          try {
            const { createPortal } = require('react-dom');
            return createPortal(el, document.body);
          } catch {
            return el; // fallback inline se portal falhar
          }
        })()
      }
    </div>
  );
}
