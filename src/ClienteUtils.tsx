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
  empresa_id:     c.empresa_id || null,
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

// ─── ClienteCriarRapidoModal ─────────────────────────────────────────────────
// Mini-formulário para criar cliente sem sair do fluxo atual.
// Chamado pelo botão "✚ Criar novo" no dropdown do ClienteAutocomplete.
interface CriarRapidoProps {
  nomeInicial?: string;
  tipoInicial?: 'PF' | 'PJ';
  onSelect: (cliente: any) => void;
  onClose: () => void;
}

export function ClienteCriarRapidoModal({ nomeInicial = '', tipoInicial = 'PF', onSelect, onClose }: CriarRapidoProps) {
  const [tipo,       setTipo]       = useState<'PF'|'PJ'>(tipoInicial);
  const [nome,       setNome]       = useState(nomeInicial);
  const [documento,  setDocumento]  = useState('');
  const [telefone,   setTelefone]   = useState('');
  const [email,      setEmail]      = useState('');
  const [empresa,    setEmpresa]    = useState('');   // texto livre (PF: empresa onde trabalha, PJ: nome fantasia)
  const [empresaId,  setEmpresaId]  = useState<string|null>(null);  // PF → vínculo com PJ do cadastro
  const [empresaNome,setEmpresaNome]= useState('');
  const [salvando,   setSalvando]   = useState(false);

  const salvar = async () => {
    if (!nome.trim()) { alert('Nome obrigatório!'); return; }
    setSalvando(true);
    const payload: any = {
      nome: nome.trim().toUpperCase(),
      tipo,
      documento: documento.trim() || null,
      empresa:   empresa.trim() || null,
      empresa_id: tipo === 'PF' ? (empresaId || null) : null,
      telefones: telefone.trim() ? [{ numero: telefone.trim(), tipo: 'Principal' }] : [],
      emails:    email.trim()    ? [{ email:  email.trim(),    tipo: 'Principal' }] : [],
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('clientes').insert([payload]).select().single();
    setSalvando(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    onSelect(data);
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'white', borderRadius:10, width:'min(480px,96vw)',
        padding:'18px 20px', boxShadow:'0 12px 48px #0005' }}>

        <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', marginBottom:14 }}>
          ✚ Cadastrar Novo Cliente
        </div>

        {/* Tipo */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          {(['PF','PJ'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              style={{ flex:1, padding:'7px', border:`2px solid ${tipo===t ? '#0f766e' : '#e5e7eb'}`,
                borderRadius:6, background: tipo===t ? '#f0fdf4' : 'white',
                fontWeight:700, fontSize:11, cursor:'pointer',
                color: tipo===t ? '#0f766e' : '#6b7280' }}>
              {t === 'PF' ? '👤 Pessoa Física' : '🏢 Pessoa Jurídica'}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 12px' }}>
          {/* Nome */}
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
              {tipo === 'PJ' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *'}
            </div>
            <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
              placeholder={tipo === 'PJ' ? 'Razão Social...' : 'Nome completo...'}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}
            />
          </div>

          {/* Documento */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
              {tipo === 'PJ' ? 'CNPJ' : 'CPF'}
            </div>
            <input value={documento} onChange={e => setDocumento(e.target.value)}
              placeholder={tipo === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}
            />
          </div>

          {/* Telefone */}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Telefone / WhatsApp</div>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-0000"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}
            />
          </div>

          {/* Email */}
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>E-mail</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@empresa.com"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}
            />
          </div>

          {/* PF: empresa vinculada (autocomplete PJ) */}
          {tipo === 'PF' && (
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
                Empresa Vinculada <span style={{ color:'#94a3b8', fontWeight:400 }}>(opcional — vínculo com PJ do cadastro)</span>
              </div>
              <ClienteAutocomplete
                value={empresaNome}
                onChange={v => { setEmpresaNome(v); setEmpresaId(null); }}
                onSelect={c => { setEmpresaNome(c.nome); setEmpresaId(c.id); setEmpresa(c.nome); }}
                placeholder="Buscar empresa cadastrada..."
                tipoFilter="PJ"
              />
              {empresaId && (
                <div style={{ fontSize:8, color:'#059669', marginTop:2 }}>✓ Vinculado ao cadastro da empresa</div>
              )}
            </div>
          )}

          {/* PJ: campo de empresa (nome fantasia / complemento) */}
          {tipo === 'PJ' && (
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Nome Fantasia / Marca</div>
              <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome fantasia (opcional)"
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}
              />
            </div>
          )}
        </div>

        <div style={{ fontSize:8, color:'#94a3b8', marginTop:10, marginBottom:14 }}>
          Dados extras (endereço, mais telefones etc.) podem ser completados no Cadastro de Clientes depois.
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'6px 14px', background:'#f1f5f9', border:'none', borderRadius:5, fontSize:10, cursor:'pointer', color:'#64748b', fontWeight:600 }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'6px 16px', background: salvando ? '#94a3b8' : '#0f766e', border:'none', borderRadius:5,
              fontSize:10, cursor:'pointer', color:'white', fontWeight:700, opacity: salvando ? .6 : 1 }}>
            {salvando ? 'Salvando...' : '✓ Criar e Selecionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ClienteAutocomplete ─────────────────────────────────────────────────────
interface AutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (cliente: any) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
  tipoFilter?: 'PF' | 'PJ';        // filtra apenas PF ou PJ no dropdown
  permitirCriar?: boolean;           // default true — mostra opção ✚ Criar no dropdown
}

export function ClienteAutocomplete({
  value, onChange, onSelect,
  placeholder = 'Nome do cliente...',
  inputStyle, disabled,
  tipoFilter,
  permitirCriar = true,
}: AutocompleteProps) {
  const [sugestoes, setSugestoes]   = useState<any[]>([]);
  const [aberto, setAberto]         = useState(false);
  const [buscando, setBuscando]     = useState(false);
  const [erroTabela, setErroTabela] = useState<string|null>(null);
  const [modalBusca, setModalBusca] = useState(false);
  const [modalCriar, setModalCriar] = useState(false);
  const timerRef = useRef<any>(null);
  const wrapRef  = useRef<any>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buscar = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSugestoes([]); setAberto(false); return; }
    setBuscando(true);
    let query = supabase.from('clientes')
      .select('id,nome,tipo,documento,empresa,empresa_id,telefones,emails,cidade')
      .or(`nome.ilike.%${q}%,documento.ilike.%${q}%,empresa.ilike.%${q}%`)
      .order('nome').limit(7);
    if (tipoFilter) query = query.eq('tipo', tipoFilter);
    const { data, error } = await query;
    if (error) { setErroTabela(error.message); setSugestoes([]); setAberto(false); setBuscando(false); return; }
    setErroTabela(null);
    setSugestoes(data || []);
    setAberto(true);
    setBuscando(false);
  }, [tipoFilter]);

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

  const tipoLabel = tipoFilter === 'PJ' ? 'empresa' : tipoFilter === 'PF' ? 'pessoa' : 'cliente';

  return (
    <div ref={wrapRef} style={{ position:'relative', display:'flex', gap:4 }}>
      <input
        className="acn-input"
        style={{ flex:1, ...inputStyle }}
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button type="button" className="acn-btn"
        style={{ background:'#475569', fontSize:11, padding:'0 10px', flexShrink:0 }}
        title="Buscar no cadastro"
        onClick={() => setModalBusca(true)}
        disabled={disabled}>
        🔍
      </button>

      {/* Erro */}
      {erroTabela && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:999,
          background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6,
          padding:'6px 10px', fontSize:10, color:'#dc2626', marginTop:2 }}>
          ⚠️ Erro ao buscar: {erroTabela}
        </div>
      )}

      {/* Dropdown sugestões */}
      {aberto && (sugestoes.length > 0 || (value.length >= 2 && !buscando)) && (
        <div style={{ position:'absolute', top:'100%', left:0, right:32, zIndex:999,
          background:'white', border:'1px solid #d1d5db', borderRadius:6,
          boxShadow:'0 4px 12px #0002', marginTop:2, maxHeight:280, overflowY:'auto' }}>

          {sugestoes.map(c => (
            <div key={c.id}
              style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}
              onMouseDown={() => selecionar(c)}
              onMouseEnter={e => (e.currentTarget.style.background='#f0f9ff')}
              onMouseLeave={e => (e.currentTarget.style.background='white')}>
              <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:9, background: c.tipo==='PJ' ? '#dbeafe' : '#f0fdf4',
                  color: c.tipo==='PJ' ? '#1e40af' : '#065f46',
                  padding:'1px 5px', borderRadius:8, fontWeight:700 }}>{c.tipo}</span>
                {c.nome}
              </div>
              <div style={{ fontSize:10, color:'#64748b', marginTop:1, display:'flex', gap:10, flexWrap:'wrap' }}>
                {c.empresa && <span>🏢 {c.empresa}</span>}
                {c.documento && <span>📄 {c.documento}</span>}
                {fmtTelefones(c.telefones) && <span>📱 {fmtTelefones(c.telefones)}</span>}
                {c.cidade && <span>📍 {c.cidade}</span>}
              </div>
            </div>
          ))}

          {buscando && (
            <div style={{ padding:8, fontSize:10, color:'#94a3b8', textAlign:'center' }}>Buscando...</div>
          )}

          {/* Opção: Criar novo */}
          {permitirCriar && value.trim().length >= 2 && (
            <div
              style={{ padding:'8px 12px', cursor:'pointer', borderTop:'1px solid #e2e8f0',
                background:'#f0fdf4', display:'flex', alignItems:'center', gap:8 }}
              onMouseDown={() => { setAberto(false); setModalCriar(true); }}
              onMouseEnter={e => (e.currentTarget.style.background='#dcfce7')}
              onMouseLeave={e => (e.currentTarget.style.background='#f0fdf4')}>
              <span style={{ fontSize:14, color:'#0f766e', fontWeight:700 }}>✚</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#0f766e' }}>
                  Criar {tipoLabel} "{value}"
                </div>
                <div style={{ fontSize:9, color:'#059669' }}>Cadastrar novo e selecionar automaticamente</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal busca avançada */}
      {modalBusca && (
        <ClienteBuscaModal
          tipoFilter={tipoFilter}
          onSelect={c => { selecionar(c); setModalBusca(false); }}
          onClose={() => setModalBusca(false)}
          permitirCriar={permitirCriar}
          onCriar={() => { setModalBusca(false); setModalCriar(true); }}
        />
      )}

      {/* Modal criar rápido */}
      {modalCriar && (
        <ClienteCriarRapidoModal
          nomeInicial={value}
          tipoInicial={tipoFilter || 'PF'}
          onSelect={c => { selecionar(c); }}
          onClose={() => setModalCriar(false)}
        />
      )}
    </div>
  );
}

// ─── ClienteBuscaModal ───────────────────────────────────────────────────────
export function ClienteBuscaModal({
  onSelect, onClose, tipoFilter, permitirCriar = true, onCriar,
}: {
  onSelect: (c: any) => void;
  onClose: () => void;
  tipoFilter?: 'PF' | 'PJ';
  permitirCriar?: boolean;
  onCriar?: () => void;
}) {
  const [busca, setBusca]     = useState('');
  const [lista, setLista]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (q: string) => {
    setLoading(true);
    let query = supabase.from('clientes').select('*').order('nome').limit(50);
    if (q.length >= 2) query = query.or(`nome.ilike.%${q}%,documento.ilike.%${q}%,empresa.ilike.%${q}%,cidade.ilike.%${q}%`);
    if (tipoFilter) query = query.eq('tipo', tipoFilter);
    const { data } = await query;
    setLista(data || []);
    setLoading(false);
  };

  useEffect(() => { load(''); }, []);
  useEffect(() => { const t = setTimeout(() => load(busca), 300); return () => clearTimeout(t); }, [busca]);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:680, width:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        <div className="modal-title">
          🔍 Buscar {tipoFilter === 'PJ' ? 'Empresa (PJ)' : tipoFilter === 'PF' ? 'Pessoa Física (PF)' : 'Cliente'}
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input className="acn-input" style={{ flex:1 }}
            placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
            value={busca} onChange={e => setBusca(e.target.value)} autoFocus
          />
          {permitirCriar && onCriar && (
            <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 14px', flexShrink:0 }}
              onClick={onCriar}>
              ✚ Criar novo
            </button>
          )}
        </div>

        <div style={{ flex:1, overflowY:'auto', marginBottom:12 }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>
              {busca.length > 0 ? 'Nenhum resultado. Use o botão "Criar novo" para cadastrar.' : 'Nenhum cliente encontrado.'}
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#f1f5f9' }}>
                  {['Tipo','Nome','Empresa / Doc.','Telefone','Email','Cidade',''].map(h => (
                    <th key={h} style={{ padding:'7px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'8px 9px' }}>
                      <span style={{ fontSize:9, background: c.tipo==='PJ' ? '#dbeafe' : '#f0fdf4',
                        color: c.tipo==='PJ' ? '#1e40af' : '#065f46',
                        padding:'2px 6px', borderRadius:10, fontWeight:700 }}>{c.tipo}</span>
                    </td>
                    <td style={{ padding:'8px 9px', fontWeight:700, color:'#1e293b' }}>{c.nome}</td>
                    <td style={{ padding:'8px 9px', color:'#475569', fontSize:10 }}>
                      {c.empresa && <div>{c.empresa}</div>}
                      {c.documento && <div style={{ color:'#94a3b8' }}>{c.documento}</div>}
                    </td>
                    <td style={{ padding:'8px 9px', color:'#475569' }}>{fmtTelefones(c.telefones) || '—'}</td>
                    <td style={{ padding:'8px 9px', color:'#475569', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {fmtEmails(c.emails) || '—'}
                    </td>
                    <td style={{ padding:'8px 9px', color:'#475569' }}>{c.cidade || '—'}</td>
                    <td style={{ padding:'8px 9px' }}>
                      <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }} onClick={() => onSelect(c)}>
                        Selecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <button className="acn-btn" style={{ background:'#94a3b8', alignSelf:'flex-end' }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

// ─── salvarClienteAuto ──────────────────────────────────────────────────────
export async function salvarClienteAuto(formData: any, clienteId?: string | null): Promise<void> {
  const nome = (formData.cliente_nome || formData.nome_cliente || formData.nome || '').trim();
  if (!nome) return;

  let existente: any = null;
  if (clienteId) {
    const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
    existente = data;
  } else {
    const { data } = await supabase.from('clientes').select('*').ilike('nome', nome).limit(1);
    existente = data?.[0] || null;
  }

  const tel = (formData.telefone || '').trim();
  const eml = (formData.email || '').trim();
  const agora = new Date().toISOString();

  if (!existente) {
    await supabase.from('clientes').insert([{
      nome: nome.toUpperCase(),
      tipo: (formData.cpf_cnpj || '').replace(/\D/g,'').length > 11 ? 'PJ' : 'PF',
      documento: formData.cpf_cnpj || null,
      empresa: formData.empresa_orgao || formData.empresa || null,
      empresa_id: formData.empresa_id || null,
      nome_contato: formData.nome_contato || null,
      cargo_contato: formData.cargo || null,
      telefones: tel ? [{ numero: tel, tipo: 'Principal' }] : [],
      emails: eml ? [{ email: eml, tipo: 'Principal' }] : [],
      endereco: formData.endereco || null,
      bairro: formData.bairro || null,
      cidade: formData.cidade || null,
      estado: formData.estado || null,
      cep: formData.cep || null,
      atualizado_em: agora,
    }]);
  } else {
    const telExist: any[] = existente.telefones || [];
    const emlExist: any[] = existente.emails || [];
    const telNovos = tel && !telExist.some((t: any) => (t.numero || t) === tel)
      ? [...telExist, { numero: tel, tipo: 'Adicional' }] : telExist;
    const emlNovos = eml && !emlExist.some((e: any) => (e.email || e) === eml)
      ? [...emlExist, { email: eml, tipo: 'Adicional' }] : emlExist;
    const update: any = { atualizado_em: agora, telefones: telNovos, emails: emlNovos };
    if (!existente.documento && formData.cpf_cnpj)      update.documento = formData.cpf_cnpj;
    if (!existente.empresa && (formData.empresa_orgao || formData.empresa)) update.empresa = formData.empresa_orgao || formData.empresa;
    if (!existente.empresa_id && formData.empresa_id)   update.empresa_id = formData.empresa_id;
    if (!existente.endereco && formData.endereco)        update.endereco = formData.endereco;
    if (!existente.cidade && formData.cidade)            update.cidade = formData.cidade;
    if (!existente.estado && formData.estado)            update.estado = formData.estado;
    if (!existente.cep && formData.cep)                  update.cep = formData.cep;
    await supabase.from('clientes').update(update).eq('id', existente.id);
  }
}

// ─── ClienteSalvarModal ──────────────────────────────────────────────────────
interface SalvarProps {
  formData: any;
  clienteId?: string;
  onClose: () => void;
}

export function ClienteSalvarModal({ formData, clienteId, onClose }: SalvarProps) {
  const [modo, setModo]                 = useState<'loading'|'novo'|'atualizar'|'nada'>('loading');
  const [clienteExist, setClienteExist] = useState<any>(null);
  const [diffs, setDiffs]               = useState<any[]>([]);
  const [salvando, setSalvando]         = useState(false);

  const nome = formData.cliente_nome || formData.nome_cliente || '';

  useEffect(() => {
    const check = async () => {
      if (!nome.trim()) { onClose(); return; }
      let existente: any = null;
      if (clienteId) {
        const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
        existente = data;
      } else {
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
      empresa_id: formData.empresa_id || null,
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
      <div className="modal-box" style={{ maxWidth:500 }}>
        {modo === 'novo' ? (
          <>
            <div className="modal-title">💾 Salvar Cliente no Cadastro?</div>
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:6, padding:'10px 14px', marginBottom:16, fontSize:12 }}>
              <strong>{nome}</strong> não está no cadastro de clientes.<br />
              <span style={{ color:'#475569', fontSize:11 }}>Deseja salvar para agilizar futuros lançamentos?</span>
            </div>
            <div style={{ fontSize:11, color:'#475569', marginBottom:14 }}>
              {formData.cpf_cnpj && <div>📄 {formData.cpf_cnpj}</div>}
              {formData.telefone && <div>📱 {formData.telefone}</div>}
              {formData.email    && <div>✉️ {formData.email}</div>}
              {formData.endereco && <div>📍 {formData.endereco}</div>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#0f766e', flex:1 }} onClick={salvarNovo} disabled={salvando}>
                {salvando ? 'Salvando...' : '✓ Salvar no cadastro'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Não salvar</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">🔄 Atualizar Cadastro do Cliente?</div>
            <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>
              Foram detectadas diferenças em <strong>{clienteExist?.nome}</strong>:
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, marginBottom:14 }}>
              <thead>
                <tr style={{ background:'#f1f5f9' }}>
                  <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700, color:'#475569' }}>Campo</th>
                  <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700, color:'#ef4444' }}>Atual</th>
                  <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:700, color:'#0f766e' }}>Novo</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'6px 8px', fontWeight:600, color:'#374151' }}>{d.campo}</td>
                    <td style={{ padding:'6px 8px', color:'#9ca3af', textDecoration:'line-through' }}>{d.antigo}</td>
                    <td style={{ padding:'6px 8px', color:'#0f766e', fontWeight:600 }}>{d.novo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:4, padding:'7px 10px', fontSize:10, color:'#92400e', marginBottom:14 }}>
              ℹ️ Telefones e emails novos serão adicionados (não substituídos) na lista do cliente.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="acn-btn" style={{ background:'#0f766e', flex:1 }} onClick={atualizarExistente} disabled={salvando}>
                {salvando ? 'Atualizando...' : '✓ Atualizar cadastro'}
              </button>
              <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Não atualizar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
