// @ts-nocheck
/**
 * ColaboradorSelect — dropdown compartilhado para todos os campos de responsável.
 * Carrega rh_funcionarios uma vez por sessão (cache de módulo) e exibe
 * select com nome + cargo + badge Terceiro. Fallback para input de texto
 * se a tabela estiver vazia.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ── Cache de módulo (única requisição por sessão) ──────────────────────────
let _cache: any[] | null = null;
let _promise: Promise<any[]> | null = null;

function loadColaboradores(): Promise<any[]> {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = supabase
      .from('rh_funcionarios')
      .select('id,nome,cargo,departamento,tipo_colaborador')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { _cache = data || []; return _cache; });
  }
  return _promise;
}

export function useColaboradores() {
  const [list, setList] = useState<any[]>(_cache || []);
  useEffect(() => {
    if (!_cache) loadColaboradores().then(setList);
  }, []);
  return list;
}

// ── Componente ─────────────────────────────────────────────────────────────
interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function ColaboradorSelect({
  value, onChange, placeholder = 'Selecione o colaborador',
  style, className, autoFocus, onKeyDown,
}: Props) {
  const list = useColaboradores();

  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 11,
    boxSizing: 'border-box',
    background: '#fff',
    ...style,
  };

  if (list.length === 0) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={baseStyle}
        className={className}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={baseStyle}
      className={className}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    >
      <option value="">— {placeholder} —</option>
      {list.map(c => (
        <option key={c.id} value={c.nome}>
          {c.nome}
          {c.cargo ? ` — ${c.cargo}` : ''}
          {c.tipo_colaborador === 'Terceiro' ? ' (Terceiro)' : ''}
        </option>
      ))}
    </select>
  );
}
