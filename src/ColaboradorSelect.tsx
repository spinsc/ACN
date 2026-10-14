// @ts-nocheck
/**
 * ColaboradorSelect — dropdown compartilhado para todos os campos de responsável.
 * Carrega rh_funcionarios uma vez por sessão (cache de módulo).
 * Fallback para input de texto se a tabela estiver vazia ou com erro.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { lerDepartamentos, anexarDepartamentos, chaveDepto } from './RhDepartamentos';
import { ehAdminOuGerente } from './utils/permissoes';

// ── Cache de módulo (única requisição por sessão) ──────────────────────────
let _cache: any[] | null = null;
let _promise: Promise<any[]> | null = null;
// 14/10/2026 (fatia 2 dos departamentos): cada colaborador do cache traz `departamentos` (nomes; sem a propriedade se a leitura falhou); _gerentes = Admin e perfis "Gerente …"
let _gerentes: Promise<any[]> | null = null;

// Reseta o cache para forçar nova busca (ex: após cadastrar novo colaborador ou mexer nos departamentos)
export function resetColaboradoresCache() {
  _cache = null;
  _promise = null;
  _gerentes = null;
}

function lerBase(): Promise<any[]> {
  // Busca apenas colunas que sempre existem; tipo_colaborador é opcional
  // 14/10/2026 (Etapa 17b): lê a visão rh_funcionarios_basico (só nome, cargo, departamento, situação e comissão) em vez da tabela inteira, que traz CPF e salário e vai fechar para quem não é do RH
  return supabase
    .from('rh_funcionarios_basico')
    .select('id,nome,cargo,tipo_colaborador')
    .eq('ativo', true)
    .order('nome')
    .then(({ data, error }) => {
      if (error) {
        // Se falhar com tipo_colaborador (coluna pode não existir ainda), tenta select mínimo
        return supabase
          .from('rh_funcionarios_basico')
          .select('id,nome,cargo')
          .eq('ativo', true)
          .order('nome')
          .then(({ data: d2 }) => d2 || []);
      }
      return data || [];
    });
}

function loadColaboradores(): Promise<any[]> {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = Promise.all([lerBase(), lerDepartamentos()]).then(([lista, dep]) => {
      const deptosOk = !dep.erro && dep.departamentos.length > 0;
      _cache = deptosOk ? anexarDepartamentos(lista, dep.departamentos, dep.vinculos) : lista;
      return _cache;
    });
  }
  return _promise;
}

// Admin e "Gerente …" do sistema (para o seletor filtrado por departamento: o setor + Admin + gerentes)
function loadGerentes(): Promise<any[]> {
  if (!_gerentes) {
    _gerentes = supabase.from('auth_usuarios').select('id,nome,perfil').eq('ativo', true).order('nome')
      .then(({ data }) => (data || []).filter((u: any) => ehAdminOuGerente(u)));
  }
  return _gerentes;
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
  /** só as pessoas destes departamentos (+ Admin e gerentes, + o valor já gravado); sem isso, ou se a lista de departamentos não chegar, lista todo mundo como antes */
  departamentos?: string[];
}

export function ColaboradorSelect({
  value, onChange, placeholder = 'Selecione o colaborador',
  style, className, autoFocus, onKeyDown, incluirUsuariosDaAba, departamentos,
}: Props) {
  const { list: colaboradores, loaded } = useColaboradores();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  useEffect(() => {
    if (incluirUsuariosDaAba) loadUsuariosDaAba(incluirUsuariosDaAba).then(setUsuarios);
  }, [incluirUsuariosDaAba]);
  const [gerentes, setGerentes] = useState<any[]>([]);
  const pedidas = (departamentos || []).map(chaveDepto).filter(Boolean);
  useEffect(() => { if (pedidas.length) loadGerentes().then(setGerentes); }, [pedidas.join('|')]);
  // RH + usuários da aba, sem repetir nome; o valor atual sempre aparece
  // 14/10/2026 (PLANO_RH_DEPARTAMENTOS_ENVIOS.md, fatia 2): com `departamentos`, só as pessoas desses departamentos + Admin e gerentes (e o valor já gravado). Se a lista de departamentos não
  // chegou, se nenhum dos departamentos pedidos existe ou se ninguém está neles, segue como antes: o seletor nunca esconde todo mundo.
  // (lista que não chegou = ninguém tem `departamentos` = doSetor vazio; departamento que não existe = idem — os dois casos caem no "não filtra")
  const doSetor = pedidas.length > 0 ? colaboradores.filter(c => (c.departamentos || []).some((n: string) => pedidas.includes(chaveDepto(n)))) : [];
  const filtrando = doSetor.length > 0;
  const base = filtrando ? doSetor : colaboradores;
  const vistos = new Set(base.map(c => _chaveNome(c.nome)));
  // filtrando: o setor + Admin e gerentes (os usuários com acesso à aba, que não são nada disso, não entram); sem filtro: o que sempre foi (usuários da aba)
  const extras = (filtrando ? gerentes : usuarios).filter(u => !vistos.has(_chaveNome(u.nome)))
    .map(u => ({ id: 'u-' + u.id, nome: u.nome, cargo: u.perfil }));
  extras.forEach(u => vistos.add(_chaveNome(u.nome)));
  if (value && !vistos.has(_chaveNome(value))) extras.push({ id: 'v-atual', nome: value, cargo: '' });
  const list = [...base, ...extras].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  // 12e58 (09/10/2026): só aparência — o estilo que era montado aqui (`baseStyle`: largura cheia, 11 px, borda e fundo) virou a classe do campo do guia com o tamanho
  // pequeno de antes (`acn-cols`, no design.css); o `style` e a `className` de quem chama seguem valendo, repassados como antes.
  const classes = 'acn-input acn-cols' + (className ? ' ' + className : '');

  // Enquanto carrega, mostra input desabilitado brevemente
  if (!loaded) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Carregando colaboradores..."
        style={style}
        className={classes + ' carregando'}
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
        style={style}
        className={classes}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={style}
      className={classes}
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
