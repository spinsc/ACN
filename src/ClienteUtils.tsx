// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Helpers ────────────────────────────────────────────────────────────────
export const fmtTelefones = (t: any[]) =>
  Array.isArray(t) ? t.map(x => x.numero || x).filter(Boolean).join(' / ') : (t || '');

export const fmtEmails = (e: any[]) =>
  Array.isArray(e) ? e.map(x => x.email || x).filter(Boolean).join(' / ') : (e || '');

// Constrói objeto "plano" com primeiro telefone/email para preencher forms legados
export const clienteToForm = (c: any) => ({
  cliente_nome:   c.nome || '',
  nome_cliente:   c.nome || '',
  empresa_orgao:  c.empresa || '',
  empresa:        c.empresa || '',
  nome_contato:   c.nome_contato || '',
  cargo:          c.cargo_contato || '',
  cpf_cnpj:       c.documento || '',
  telefone:       Array.isArray(c.telefones) && c.telefones.length ? (c.telefones[0].numero || c.telefones[0]) : '',
  email:          Array.isArray(c.emails)    && c.emails.length    ? (c.emails[0].email    || c.emails[0])    : '',
  endereco:       [c.endereco, c.numero, c.complemento].filter(Boolean).join(', '),
  bairro:         c.bairro  || '',
  cidade:         c.cidade  || '',
  estado:         c.estado  || '',
  cep:            c.cep     || '',
  _cliente_id:    c.id,
  _cliente_obj:   c,
});

// Detecta diferenças entre dados do form e cadastro existente
export const diffCliente = (form: any, clienteObj: any) => {
  if (!clienteObj) return null;
  const diffs: {campo: string; antigo: string; novo: string}[] = [];
  const fmtEnd = (c: any) => [c.endereco, c.numero, c.complemento, c.bairro, c.cidade, c.estado, c.cep].filter(Boolean).join(', ');
  const pairs = [
    ['Nome',     clienteObj.nome,     form.cliente_nome || form.nome_cliente],
    ['Empresa',  clienteObj.empresa,  form.empresa_orgao || form.empresa],
    ['CPF/CNPJ', clienteObj.documento, form.cpf_cnpj],
    ['Telefone', fmtTelefones(clienteObj.telefones), form.telefone],
    ['Email',    fmtEmails(clienteObj.emails),        form.email],
    ['Endereço', fmtEnd(clienteObj),                 form.endereco],
  ] as [string, string, string][];
  for (const [campo, antigo, novo] of pairs) {
    if ((novo || '').trim() && (antigo || '').trim() !== (novo || '').trim()) {
      diffs.push({ campo, antigo: antigo || '—', novo: novo || '' });
    }
  }
  return diffs.length ? diffs : null;
};

// ─── ClienteAutocomplete ─────────────────────────────────────────────────────
interface AutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (cliente: any) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
}

export function ClienteAutocomplete({ value, onChange, onSelect, placeholder = 'Nome do cliente...', inputStyle, disabled }: AutocompleteProps) {
  const [sugestoes, setSugestoes]       = useState<any[]>([]);
  const [aberto, setAberto]             = useState(false);
  const [buscando, setBuscando]         = useState(false);
  const [modalBusca, setModalBusca]     = useState(false);
  const timerRef = useRef<any>(null);
  const wrapRef  = useRef<any>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Busca com debounce
  const buscar = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSugestoes([]); setAberto(false); return; }
    setBuscando(true);
    const { data } = await supabase.from('clientes').select('id,nome,tipo,documento,empresa,telefones,emails,cidade')
      .or(`nome.ilike.%${q}%,documento.ilike.%${q}%,empresa.ilike.%${q}%`)
      .order('nome').limit(6);
    setSugestoes(data || []);
    setAberto(true);
    setBuscando(false);
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => buscar(v), 300);
  };

  const selecionar = (c: any) => {
    onChange(c.nome);
    onSelect(c);
    setSugestoes([]);
    setAberto(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', gap: 4 }}>
      <input
        className="acn-input"
        style={{ flex: 1, ...inputStyle }}
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        className="acn-btn"
        style={{ background: '#475569', fontSize: 11, padding: '0 10px', flexShrink: 0 }}
        title="Buscar cliente no cadastro"
        onClick={() => setModalBusca(true)}
        disabled={disabled}
      >🔍</button>

      {/* Dropdown sugestões */}
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 32, zIndex: 999,
          background: 'white', border: '1px solid #d1d5db', borderRadius: 6,
          boxShadow: '0 4px 12px #0002', marginTop: 2, maxHeight: 260, overflowY: 'auto',
        }}>
          {sugestoes.map(c => (
            <div key={c.id}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
              onMouseDown={() => selecionar(c)}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>
                {c.nome}
                {c.tipo === 'PJ' && c.empresa && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6, fontSize: 10 }}>({c.empresa})</span>}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, display: 'flex', gap: 10 }}>
                {c.documento && <span>📄 {c.documento}</span>}
                {fmtTelefones(c.telefones) && <span>📱 {fmtTelefones(c.telefones)}</span>}
                {c.cidade && <span>📍 {c.cidade}</span>}
              </div>
            </div>
          ))}
          {buscando && <div style={{ padding: 8, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>Buscando...</div>}
        </div>
      )}

      {/* Modal busca avançada */}
      {modalBusca && (
        <ClienteBuscaModal
          onSelect={c => { selecionar(c); setModalBusca(false); }}
          onClose={() => setModalBusca(false)}
        />
      )}
    </div>
  );
}

// ─── ClienteBuscaModal ───────────────────────────────────────────────────────
export function ClienteBuscaModal({ onSelect, onClose }: { onSelect: (c: any) => void; onClose: () => void }) {
  const [busca, setBusca]   = useState('');
  const [lista, setLista]   = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (q: string) => {
    setLoading(true);
    const query = supabase.from('clientes').select('*').order('nome').limit(50);
    if (q.length >= 2) query.or(`nome.ilike.%${q}%,documento.ilike.%${q}%,empresa.ilike.%${q}%,cidade.ilike.%${q}%`);
    const { data } = await query;
    setLista(data || []);
    setLoading(false);
  };

  useEffect(() => { load(''); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 680, width: '96vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">🔍 Buscar Cliente</div>
        <input
          className="acn-input"
          style={{ marginBottom: 12 }}
          placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          autoFocus
        />
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
              Nenhum cliente encontrado.{busca.length > 0 && ' Tente um termo diferente.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Nome', 'Empresa / Doc.', 'Telefone', 'Email', 'Cidade', ''].map(h => (
                    <th key={h} style={{ padding: '7px 9px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 9px', fontWeight: 700, color: '#1e293b' }}>
                      {c.nome}
                      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400 }}>{c.tipo}</div>
                    </td>
                    <td style={{ padding: '8px 9px', color: '#475569', fontSize: 10 }}>
                      {c.empresa && <div>{c.empresa}</div>}
                      {c.documento && <div style={{ color: '#94a3b8' }}>{c.documento}</div>}
                    </td>
                    <td style={{ padding: '8px 9px', color: '#475569' }}>{fmtTelefones(c.telefones) || '—'}</td>
                    <td style={{ padding: '8px 9px', color: '#475569', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtEmails(c.emails) || '—'}</td>
                    <td style={{ padding: '8px 9px', color: '#475569' }}>{c.cidade || '—'}</td>
                    <td style={{ padding: '8px 9px' }}>
                      <button className="acn-btn" style={{ background: '#0f766e', fontSize: 10 }} onClick={() => onSelect(c)}>
                        Selecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <button className="acn-btn" style={{ background: '#94a3b8', alignSelf: 'flex-end' }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

// ─── ClienteSalvarModal ──────────────────────────────────────────────────────
// Exibido após salvar um form, para oferecer salvar/atualizar o cadastro
interface SalvarProps {
  formData: any;        // dados do formulário que foi salvo
  clienteId?: string;   // se veio de autocomplete, uuid do cliente
  onClose: () => void;
}

export function ClienteSalvarModal({ formData, clienteId, onClose }: SalvarProps) {
  const [modo, setModo]           = useState<'loading'|'novo'|'atualizar'|'nada'>('loading');
  const [clienteExist, setClienteExist] = useState<any>(null);
  const [diffs, setDiffs]         = useState<any[]>([]);
  const [salvando, setSalvando]   = useState(false);

  const nome = formData.cliente_nome || formData.nome_cliente || '';

  useEffect(() => {
    const check = async () => {
      if (!nome.trim()) { onClose(); return; }
      let existente: any = null;
      if (clienteId) {
        const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
        existente = data;
      } else {
        // Busca por nome exato (case-insensitive)
        const { data } = await supabase.from('clientes').select('*').ilike('nome', nome.trim()).limit(1);
        existente = data?.[0] || null;
      }
      if (!existente) {
        setModo('novo');
      } else {
        const d = diffCliente(formData, existente);
        if (d && d.length > 0) { setDiffs(d); setClienteExist(existente); setModo('atualizar'); }
        else setModo('nada');
      }
    };
    check();
  }, []);

  const salvarNovo = async () => {
    setSalvando(true);
    const tel = (formData.telefone || '').trim();
    const eml = (formData.email || '').trim();
    await supabase.from('clientes').insert([{
      nome: nome.trim().toUpperCase(),
      tipo: formData.cpf_cnpj?.replace(/\D/g,'').length > 11 ? 'PJ' : 'PF',
      documento: formData.cpf_cnpj || null,
      empresa: formData.empresa_orgao || formData.empresa || null,
      nome_contato: formData.nome_contato || null,
      telefones: tel ? [{ numero: tel, tipo: 'Principal' }] : [],
      emails: eml ? [{ email: eml, tipo: 'Principal' }] : [],
      endereco: formData.endereco || null,
      cidade: formData.cidade || null,
      estado: formData.estado || null,
      cep: formData.cep || null,
      atualizado_em: new Date().toISOString(),
    }]);
    setSalvando(false);
    onClose();
  };

  const atualizarExistente = async () => {
    if (!clienteExist) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    const tel = (formData.telefone || '').trim();
    const eml = (formData.email || '').trim();
    // Mescla telefones/emails: adiciona se não existir
    const telExist: any[] = clienteExist.telefones || [];
    const emlExist: any[] = clienteExist.emails || [];
    const telNovos = tel && !telExist.some(t => (t.numero||t) === tel) ? [...telExist, { numero: tel, tipo: 'Adicional' }] : telExist;
    const emlNovos = eml && !emlExist.some(e => (e.email||e) === eml) ? [...emlExist, { email: eml, tipo: 'Adicional' }] : emlExist;
    await supabase.from('clientes').update({
      nome: (formData.cliente_nome || formData.nome_cliente || clienteExist.nome).trim().toUpperCase(),
      documento: formData.cpf_cnpj || clienteExist.documento,
      empresa: formData.empresa_orgao || formData.empresa || clienteExist.empresa,
      telefones: telNovos,
      emails: emlNovos,
      endereco: formData.endereco || clienteExist.endereco,
      atualizado_em: agora,
    }).eq('id', clienteExist.id);
    setSalvando(false);
    onClose();
  };

  if (modo === 'loading') return null;
  if (modo === 'nada') { onClose(); return null; }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        {modo === 'novo' ? (
          <>
            <div className="modal-title">💾 Salvar Cliente no Cadastro?</div>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
              <strong>{nome}</strong> não está no cadastro de clientes.<br />
              <span style={{ color: '#475569', fontSize: 11 }}>Deseja salvar para agilizar futuros lançamentos?</span>
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 14 }}>
              {formData.cpf_cnpj && <div>📄 {formData.cpf_cnpj}</div>}
              {formData.telefone && <div>📱 {formData.telefone}</div>}
              {formData.email    && <div>✉️ {formData.email}</div>}
              {formData.endereco && <div>📍 {formData.endereco}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} onClick={salvarNovo} disabled={salvando}>
                {salvando ? 'Salvando...' : '✓ Salvar no cadastro'}
              </button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Não salvar</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">🔄 Atualizar Cadastro do Cliente?</div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
              Foram detectadas diferenças em <strong>{clienteExist?.nome}</strong>:
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 14 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Campo</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#ef4444' }}>Atual</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#0f766e' }}>Novo</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#374151' }}>{d.campo}</td>
                    <td style={{ padding: '6px 8px', color: '#9ca3af', textDecoration: 'line-through' }}>{d.antigo}</td>
                    <td style={{ padding: '6px 8px', color: '#0f766e', fontWeight: 600 }}>{d.novo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 4, padding: '7px 10px', fontSize: 10, color: '#92400e', marginBottom: 14 }}>
              ℹ️ Telefones e emails novos serão adicionados (não substituídos) na lista do cliente.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} onClick={atualizarExistente} disabled={salvando}>
                {salvando ? 'Atualizando...' : '✓ Atualizar cadastro'}
              </button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose}>Não atualizar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
