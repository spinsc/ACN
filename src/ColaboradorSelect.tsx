// @ts-nocheck
/**
 * ColaboradorSelect — dropdown compartilhado para todos os campos de responsável.
 * Carrega rh_funcionarios uma vez por sessão (cache de módulo).
 * Fallback para input de texto se a tabela estiver vazia ou com erro.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';

// ── Cache de módulo (única requisição por sessão) ──────────────────────────
let _cache: any[] | null = null;
let _promise: Promise<any[]> | null = null;

// Reseta o cache para forçar nova busca (ex: após cadastrar novo colaborador)
export function resetColaboradoresCache() {
  _cache = null;
  _promise = null;
}

function loadColaboradores(): Promise<any[]> {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    // Busca apenas colunas que sempre existem; tipo_colaborador é opcional
    _promise = supabase
      .from('rh_funcionarios')
      .select('id,nome,cargo,tipo_colaborador')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          // Se falhar com tipo_colaborador (coluna pode não existir ainda), tenta select mínimo
          return supabase
            .from('rh_funcionarios')
            .select('id,nome,cargo')
            .eq('ativo', true)
            .order('nome')
            .then(({ data: d2 }) => { _cache = d2 || []; return _cache; });
        }
        _cache = data || [];
        return _cache;
      });
  }
  return _promise;
}

// Usuários do sistema com acesso a uma aba (ex.: Admin que executa tarefa de
// Engenharia sem estar no cadastro do RH). Cache por aba.
const _usuariosPorAba: Record<string, Promise<any[]>> = {};
function loadUsuariosDaAba(aba: string): Promise<any[]> {
  if (!_usuariosPorAba[aba]) {
    _usuariosPorAba[aba] = supabase.from('auth_usuarios')
      .select('id,nome,perfil,abas_permitidas')
      .eq('ativo', true).order('nome')
      .then(({ data }) => (data || []).filter((u: any) =>
        u.perfil === 'Admin' || (Array.isArray(u.abas_permitidas) && u.abas_permitidas.includes(aba))));
  }
  return _usuariosPorAba[aba];
}
const _chaveNome = (n: string) => normalizarBusca(String(n || '').trim());

export function useColaboradores() {
  const [list, setList] = useState<any[]>(_cache || []);
  const [loaded, setLoaded] = useState(!!_cache);

  useEffect(() => {
    if (!_cache) {
      loadColaboradores().then(result => {
        setList(result);
        setLoaded(true);
      });
    }
  }, []);

  return { list, loaded };
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
  /** também lista os usuários do sistema com acesso a esta aba (e os Admin) */
  incluirUsuariosDaAba?: string;
}

export function ColaboradorSelect({
  value, onChange, placeholder = 'Selecione o colaborador',
  style, className, autoFocus, onKeyDown, incluirUsuariosDaAba,
}: Props) {
  const { list: colaboradores, loaded } = useColaboradores();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  useEffect(() => {
    if (incluirUsuariosDaAba) loadUsuariosDaAba(incluirUsuariosDaAba).then(setUsuarios);
  }, [incluirUsuariosDaAba]);
  // RH + usuários da aba, sem repetir nome; o valor atual sempre aparece
  const vistos = new Set(colaboradores.map(c => _chaveNome(c.nome)));
  const extras = usuarios.filter(u => !vistos.has(_chaveNome(u.nome)))
    .map(u => ({ id: 'u-' + u.id, nome: u.nome, cargo: u.perfil }));
  extras.forEach(u => vistos.add(_chaveNome(u.nome)));
  if (value && !vistos.has(_chaveNome(value))) extras.push({ id: 'v-atual', nome: value, cargo: '' });
  const list = [...colaboradores, ...extras].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

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

  // Enquanto carrega, mostra input desabilitado brevemente
  if (!loaded) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Carregando colaboradores..."
        style={{ ...baseStyle, color: '#9ca3af' }}
        className={className}
      />
    );
  }

  // Se não há colaboradores cadastrados, cai para input livre
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
