// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Botao, Chips, Selo, Faixa } from './Interface';
import Icone from './Icone';
import { mdiMagnify, mdiPlus, mdiAccountOutline, mdiDomain, mdiCheck, mdiAlertOutline, mdiFileDocumentOutline, mdiCellphone, mdiMapMarkerOutline, mdiEmailOutline, mdiContentSaveOutline, mdiRefresh } from '@mdi/js';

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

  // 12e45 (09/10/2026): só a aparência (classes acn-clu-* em design.css); os campos, a validação e a gravação são os de antes
  return (
    <div className="modal-overlay acn-clu-ov"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-clu-jan" role="dialog" aria-label="Cadastrar novo cliente">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPlus} size={18} />Cadastrar Novo Cliente</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">

          {/* Tipo */}
          <Chips ativo={tipo} onChange={id => setTipo(id as 'PF' | 'PJ')} rotulo="Tipo de cliente"
            itens={[{ id: 'PF', rotulo: 'Pessoa Física', icone: mdiAccountOutline }, { id: 'PJ', rotulo: 'Pessoa Jurídica', icone: mdiDomain }]} />

          <div className="acn-clu-grade">
            {/* Nome */}
            <div className="acn-clu-cheio">
              <div className="acn-label">
                {tipo === 'PJ' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *'}
              </div>
              <input className="acn-input" value={nome} onChange={e => setNome(e.target.value)} autoFocus
                placeholder={tipo === 'PJ' ? 'Razão Social...' : 'Nome completo...'} />
            </div>

            {/* Documento */}
            <div>
              <div className="acn-label">
                {tipo === 'PJ' ? 'CNPJ' : 'CPF'}
              </div>
              <input className="acn-input" value={documento} onChange={e => setDocumento(e.target.value)}
                placeholder={tipo === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'} />
            </div>

            {/* Telefone */}
            <div>
              <div className="acn-label">Telefone / WhatsApp</div>
              <input className="acn-input" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-0000" />
            </div>

            {/* Email */}
            <div className="acn-clu-cheio">
              <div className="acn-label">E-mail</div>
              <input className="acn-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>

            {/* PF: empresa vinculada (autocomplete PJ) */}
            {tipo === 'PF' && (
              <div className="acn-clu-cheio">
                <div className="acn-label">
                  Empresa Vinculada <span className="acn-clu-opcional">(opcional — vínculo com PJ do cadastro)</span>
                </div>
                <ClienteAutocomplete
                  value={empresaNome}
                  onChange={v => { setEmpresaNome(v); setEmpresaId(null); }}
                  onSelect={c => { setEmpresaNome(c.nome); setEmpresaId(c.id); setEmpresa(c.nome); }}
                  placeholder="Buscar empresa cadastrada..."
                  tipoFilter="PJ"
                />
                {empresaId && (
                  <div className="acn-txt-ok acn-clu-vinculado"><Icone path={mdiCheck} size={12} />Vinculado ao cadastro da empresa</div>
                )}
              </div>
            )}

            {/* PJ: campo de empresa (nome fantasia / complemento) */}
            {tipo === 'PJ' && (
              <div className="acn-clu-cheio">
                <div className="acn-label">Nome Fantasia / Marca</div>
                <input className="acn-input" value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome fantasia (opcional)" />
              </div>
            )}
          </div>

          <div className="acn-ajuda">
            Dados extras (endereço, mais telefones etc.) podem ser completados no Cadastro de Clientes depois.
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={salvando ? undefined : mdiCheck} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar e Selecionar'}
          </Botao>
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
    <div ref={wrapRef} className="acn-clu-auto">
      <input
        className="acn-input acn-clu-campo"
        style={inputStyle}
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <Botao type="button" icone={mdiMagnify} className="acn-clu-lupa"
        title="Buscar no cadastro"
        onClick={() => setModalBusca(true)}
        disabled={disabled} />

      {/* Erro */}
      {erroTabela && (
        <div className="acn-clu-erro">
          <Icone path={mdiAlertOutline} size={14} />Erro ao buscar: {erroTabela}
        </div>
      )}

      {/* Dropdown sugestões */}
      {aberto && (sugestoes.length > 0 || (value.length >= 2 && !buscando)) && (
        <div className="acn-clu-sugestoes">

          {sugestoes.map(c => (
            <div key={c.id} className="acn-clu-sug" onMouseDown={() => selecionar(c)}>
              <div className="acn-clu-sug-nome">
                <Selo familia={c.tipo === 'PJ' ? 'info' : 'ok'} ponto={false}>{c.tipo}</Selo>
                {c.nome}
              </div>
              <div className="acn-ajuda acn-clu-sug-det">
                {c.empresa && <span><Icone path={mdiDomain} size={12} /> {c.empresa}</span>}
                {c.documento && <span><Icone path={mdiFileDocumentOutline} size={12} /> {c.documento}</span>}
                {fmtTelefones(c.telefones) && <span><Icone path={mdiCellphone} size={12} /> {fmtTelefones(c.telefones)}</span>}
                {c.cidade && <span><Icone path={mdiMapMarkerOutline} size={12} /> {c.cidade}</span>}
              </div>
            </div>
          ))}

          {buscando && (
            <div className="acn-ajuda acn-clu-buscando">Buscando...</div>
          )}

          {/* Opção: Criar novo */}
          {permitirCriar && value.trim().length >= 2 && (
            <div className="acn-clu-sug criar"
              onMouseDown={() => { setAberto(false); setModalCriar(true); }}>
              <Icone path={mdiPlus} size={16} />
              <div>
                <div className="acn-clu-criar-tit">
                  Criar {tipoLabel} "{value}"
                </div>
                <div className="acn-clu-criar-sub">Cadastrar novo e selecionar automaticamente</div>
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
      <div className="modal-box acn-modal-cadastro acn-clu-busca-jan" role="dialog" aria-label="Buscar cliente">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiMagnify} size={18} />Buscar {tipoFilter === 'PJ' ? 'Empresa (PJ)' : tipoFilter === 'PF' ? 'Pessoa Física (PF)' : 'Cliente'}</span>
        </div>
        <div className="acn-modal-corpo acn-clu-busca-corpo">
          <div className="acn-clu-busca-barra">
            <input className="acn-input acn-clu-campo"
              placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
              value={busca} onChange={e => setBusca(e.target.value)} autoFocus
            />
            {permitirCriar && onCriar && (
              <Botao variante="primario" icone={mdiPlus} onClick={onCriar}>Criar novo</Botao>
            )}
          </div>

          <div className="acn-clu-busca-lista">
            {loading ? (
              <div className="acn-empty">Carregando...</div>
            ) : lista.length === 0 ? (
              <div className="acn-empty">
                {busca.length > 0 ? 'Nenhum resultado. Use o botão "Criar novo" para cadastrar.' : 'Nenhum cliente encontrado.'}
              </div>
            ) : (
              <table className="acn-tabela">
                <thead>
                  <tr>
                    {['Tipo','Nome','Empresa / Doc.','Telefone','Email','Cidade',''].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(c => (
                    <tr key={c.id}>
                      <td><Selo familia={c.tipo === 'PJ' ? 'info' : 'ok'} ponto={false}>{c.tipo}</Selo></td>
                      <td className="acn-forte">{c.nome}</td>
                      <td className="acn-clu-busca-emp">
                        {c.empresa && <div>{c.empresa}</div>}
                        {c.documento && <div className="acn-fraco">{c.documento}</div>}
                      </td>
                      <td>{fmtTelefones(c.telefones) || '—'}</td>
                      <td className="acn-clu-busca-email">{fmtEmails(c.emails) || '—'}</td>
                      <td>{c.cidade || '—'}</td>
                      <td>
                        <Botao pequeno variante="primario" onClick={() => onSelect(c)}>Selecionar</Botao>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
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
      <div className="modal-box acn-modal-cadastro acn-clu-salvar-jan" role="dialog" aria-label={modo === 'novo' ? 'Salvar cliente no cadastro' : 'Atualizar cadastro do cliente'}>
        {modo === 'novo' ? (
          <>
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiContentSaveOutline} size={18} />Salvar Cliente no Cadastro?</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-quadro tom-info acn-clu-quadro">
                <div><strong>{nome}</strong> não está no cadastro de clientes.</div>
                <div className="acn-ajuda">Deseja salvar para agilizar futuros lançamentos?</div>
              </div>
              <div className="acn-clu-dados">
                {formData.cpf_cnpj && <div><Icone path={mdiFileDocumentOutline} size={14} /> {formData.cpf_cnpj}</div>}
                {formData.telefone && <div><Icone path={mdiCellphone} size={14} /> {formData.telefone}</div>}
                {formData.email    && <div><Icone path={mdiEmailOutline} size={14} /> {formData.email}</div>}
                {formData.endereco && <div><Icone path={mdiMapMarkerOutline} size={14} /> {formData.endereco}</div>}
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="primario" icone={salvando ? undefined : mdiCheck} onClick={salvarNovo} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar no cadastro'}
              </Botao>
              <Botao onClick={onClose}>Não salvar</Botao>
            </div>
          </>
        ) : (
          <>
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiRefresh} size={18} />Atualizar Cadastro do Cliente?</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Foram detectadas diferenças em <strong>{clienteExist?.nome}</strong>:
              </div>
              <table className="acn-tabela">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th className="acn-clu-atual">Atual</th>
                    <th className="acn-clu-novo">Novo</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d, i) => (
                    <tr key={i}>
                      <td className="acn-forte">{d.campo}</td>
                      <td className="acn-clu-antigo">{d.antigo}</td>
                      <td className="acn-clu-novo-valor">{d.novo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Faixa tom="atencao">Telefones e emails novos serão adicionados (não substituídos) na lista do cliente.</Faixa>
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="primario" icone={salvando ? undefined : mdiCheck} onClick={atualizarExistente} disabled={salvando}>
                {salvando ? 'Atualizando...' : 'Atualizar cadastro'}
              </Botao>
              <Botao onClick={onClose}>Não atualizar</Botao>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
