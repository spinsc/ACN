// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';

const CLIENTE_VAZIO = {
  nome: '', tipo: 'PF', documento: '', nome_contato: '', cargo_contato: '',
  empresa: '', telefones: [{ numero: '', tipo: 'Principal' }],
  emails: [{ email: '', tipo: 'Principal' }],
  endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '', observacoes: '',
};

const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function TelefoneList({ list, setList, readonly }) {
  return (
    <div>
      {list.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="acn-input" style={{ flex: 2 }} placeholder="Telefone / WhatsApp"
            value={t.numero} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, numero: e.target.value } : x))} />
          <select className="acn-input" style={{ flex: 1 }} value={t.tipo} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
            {['Principal','Celular','WhatsApp','Fixo','Comercial','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
              onClick={() => setList(l => l.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
      ))}
      {!readonly && (
        <button className="acn-btn" style={{ background: '#e2e8f0', color: '#1e293b', fontSize: 10 }}
          onClick={() => setList(l => [...l, { numero: '', tipo: 'Celular' }])}>
          + Telefone
        </button>
      )}
    </div>
  );
}

function EmailList({ list, setList, readonly }) {
  return (
    <div>
      {list.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input type="email" className="acn-input" style={{ flex: 2 }} placeholder="email@exemplo.com"
            value={e.email} disabled={readonly}
            onChange={ev => setList(l => l.map((x, j) => j === i ? { ...x, email: ev.target.value } : x))} />
          <select className="acn-input" style={{ flex: 1 }} value={e.tipo} disabled={readonly}
            onChange={ev => setList(l => l.map((x, j) => j === i ? { ...x, tipo: ev.target.value } : x))}>
            {['Principal','Comercial','NFe','Contato','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
              onClick={() => setList(l => l.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
      ))}
      {!readonly && (
        <button className="acn-btn" style={{ background: '#e2e8f0', color: '#1e293b', fontSize: 10 }}
          onClick={() => setList(l => [...l, { email: '', tipo: 'Contato' }])}>
          + Email
        </button>
      )}
    </div>
  );
}

function FormCliente({ initial, onSave, onCancel, readonly }) {
  const [f, setF] = useState({ ...CLIENTE_VAZIO, ...initial });
  const [telefones, setTelefones] = useState(initial?.telefones?.length ? initial.telefones : [{ numero: '', tipo: 'Principal' }]);
  const [emails,    setEmails]    = useState(initial?.emails?.length    ? initial.emails    : [{ email: '', tipo: 'Principal' }]);
  const [salvando, setSalvando]   = useState(false);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const salvar = async () => {
    if (!f.nome.trim()) { alert('Nome obrigatório!'); return; }
    setSalvando(true);
    const payload = {
      nome: f.nome.trim().toUpperCase(),
      tipo: f.tipo,
      documento: f.documento || null,
      nome_contato: f.nome_contato || null,
      cargo_contato: f.cargo_contato || null,
      empresa: f.empresa || null,
      telefones: telefones.filter(t => t.numero.trim()),
      emails:    emails.filter(e => e.email.trim()),
      endereco: f.endereco || null,
      numero: f.numero || null,
      complemento: f.complemento || null,
      bairro: f.bairro || null,
      cidade: f.cidade || null,
      estado: f.estado || null,
      cep: f.cep || null,
      observacoes: f.observacoes || null,
      atualizado_em: new Date().toISOString(),
    };
    if (initial?.id) {
      await supabase.from('clientes').update(payload).eq('id', initial.id);
    } else {
      payload.criado_em = new Date().toISOString();
      await supabase.from('clientes').insert([payload]);
    }
    setSalvando(false);
    onSave();
  };

  const lbl = (txt) => <label className="acn-label">{txt}</label>;
  const inp = (k, placeholder?, type?) => (
    <input type={type || 'text'} className="acn-input" style={{ width: '100%' }}
      value={f[k] || ''} placeholder={placeholder || ''} disabled={readonly}
      onChange={e => set(k, e.target.value)} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tipo */}
      <div>
        {lbl('Tipo de Pessoa')}
        <div style={{ display: 'flex', gap: 8 }}>
          {['PF', 'PJ'].map(t => (
            <button key={t} disabled={readonly}
              style={{ flex: 1, padding: '7px', border: `2px solid ${f.tipo === t ? '#0f766e' : '#e5e7eb'}`,
                borderRadius: 6, background: f.tipo === t ? '#f0fdf4' : 'white',
                fontWeight: 700, fontSize: 12, cursor: readonly ? 'default' : 'pointer',
                color: f.tipo === t ? '#0f766e' : '#6b7280' }}
              onClick={() => !readonly && set('tipo', t)}>
              {t === 'PF' ? '👤 Pessoa Física' : '🏢 Pessoa Jurídica'}
            </button>
          ))}
        </div>
      </div>

      {/* Nome */}
      <div>
        {lbl(f.tipo === 'PJ' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *')}
        {inp('nome', f.tipo === 'PJ' ? 'Razão Social...' : 'Nome completo...')}
      </div>

      {/* PJ: nome contato e empresa */}
      {f.tipo === 'PJ' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{lbl('Nome do Contato')}{inp('nome_contato', 'Responsável...')}</div>
          <div>{lbl('Cargo')}{inp('cargo_contato', 'Cargo...')}</div>
        </div>
      )}

      {/* Documento */}
      <div>
        {lbl(f.tipo === 'PJ' ? 'CNPJ' : 'CPF')}
        {inp('documento', f.tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00')}
      </div>

      {/* Empresa (PF com vínculo) */}
      {f.tipo === 'PF' && (
        <div>{lbl('Empresa / Órgão (opcional)')}{inp('empresa', 'Nome da empresa...')}</div>
      )}

      {/* Telefones */}
      <div>
        {lbl('Telefones')}
        <TelefoneList list={telefones} setList={setTelefones} readonly={readonly} />
      </div>

      {/* Emails */}
      <div>
        {lbl('E-mails')}
        <EmailList list={emails} setList={setEmails} readonly={readonly} />
      </div>

      {/* Endereço */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 10, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>📍 Endereço</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>{lbl('Logradouro')}{inp('endereco', 'Rua, Av...')}</div>
          <div>{lbl('Número')}{inp('numero', '123')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>{lbl('Complemento')}{inp('complemento', 'Apto, Sala...')}</div>
          <div>{lbl('Bairro')}{inp('bairro', 'Bairro...')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <div>{lbl('Cidade')}{inp('cidade', 'Cidade...')}</div>
          <div>
            {lbl('Estado')}
            <select className="acn-input" style={{ width: '100%' }} value={f.estado || ''} disabled={readonly}
              onChange={e => set('estado', e.target.value)}>
              <option value="">UF</option>
              {ESTADOS_BR.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>{lbl('CEP')}{inp('cep', '00000-000')}</div>
        </div>
      </div>

      {/* Observações */}
      <div>
        {lbl('Observações')}
        <textarea className="acn-input" rows={2} style={{ width: '100%', resize: 'vertical' }}
          value={f.observacoes || ''} disabled={readonly}
          onChange={e => set('observacoes', e.target.value)}
          placeholder="Informações adicionais..." />
      </div>

      {/* Botões */}
      {!readonly && (
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : initial?.id ? '✓ Salvar Alterações' : '✓ Cadastrar Cliente'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onCancel}>Cancelar</button>
        </div>
      )}
      {readonly && (
        <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onCancel}>Fechar</button>
      )}
    </div>
  );
}

export default function ClientesTab({ currentUser }) {
  const [clientes, setClientes]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [busca, setBusca]         = useState('');
  const [modalForm, setModalForm] = useState<any>(null); // null | {} | cliente
  const [modoForm, setModoForm]   = useState<'novo'|'editar'|'ver'>('ver');

  const podeEditar = currentUser?.perfil === 'Admin' || currentUser?.pode_editar_clientes === true;

  const load = async () => {
    setLoading(true);
    const q = supabase.from('clientes').select('*').order('nome');
    if (busca.length >= 2) q.or(`nome.ilike.%${busca}%,documento.ilike.%${busca}%,empresa.ilike.%${busca}%,cidade.ilike.%${busca}%`);
    const { data } = await q.limit(200);
    setClientes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [busca]);

  const fmtTel = (t: any[]) => Array.isArray(t) ? t.map(x => x.numero || x).filter(Boolean).join(' / ') : '';
  const fmtEml = (e: any[]) => Array.isArray(e) ? e.map(x => x.email || x).filter(Boolean).join(' / ') : '';

  const excluir = async (c: any) => {
    if (!window.confirm(`Excluir cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('clientes').delete().eq('id', c.id);
    load();
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{ background: '#f0fdf4', borderBottom: '2px solid #0f766e' }}>
          <span style={{ color: '#064e3b', fontWeight: 700 }}>👥 Cadastro de Clientes ({clientes.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {podeEditar && (
              <button className="acn-btn" style={{ background: '#0f766e' }}
                onClick={() => { setModalForm({}); setModoForm('novo'); }}>
                + Novo Cliente
              </button>
            )}
            <button className="acn-btn" style={{ background: '#475569', fontSize: 10 }} onClick={load}>↻</button>
          </div>
        </div>

        <div className="sec-body">
          {/* Busca */}
          <div style={{ marginBottom: 12 }}>
            <input className="acn-input" style={{ width: '100%', maxWidth: 400 }}
              placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
              value={busca} onChange={e => setBusca(e.target.value)} />
          </div>

          {loading ? (
            <div className="acn-empty">Carregando...</div>
          ) : clientes.length === 0 ? (
            <div className="acn-empty">
              {busca ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Empresa / Doc.</th>
                    <th>Contato</th>
                    <th>Telefone(s)</th>
                    <th>Email(s)</th>
                    <th>Cidade / UF</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => (
                    <tr key={c.id}>
                      <td><strong style={{ color: '#0f766e' }}>{c.nome}</strong></td>
                      <td>
                        <span style={{ fontSize: 9, background: c.tipo === 'PJ' ? '#dbeafe' : '#f0fdf4',
                          color: c.tipo === 'PJ' ? '#1e40af' : '#065f46', padding: '2px 6px', borderRadius: 10, fontWeight: 700 }}>
                          {c.tipo}
                        </span>
                      </td>
                      <td style={{ fontSize: 10 }}>
                        {c.empresa && <div style={{ fontWeight: 600 }}>{c.empresa}</div>}
                        {c.documento && <div style={{ color: '#94a3b8' }}>{c.documento}</div>}
                      </td>
                      <td style={{ fontSize: 10 }}>
                        {c.nome_contato && <div>{c.nome_contato}</div>}
                        {c.cargo_contato && <div style={{ color: '#94a3b8' }}>{c.cargo_contato}</div>}
                      </td>
                      <td style={{ fontSize: 10 }}>{fmtTel(c.telefones) || '—'}</td>
                      <td style={{ fontSize: 10, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fmtEml(c.emails) || '—'}
                      </td>
                      <td style={{ fontSize: 10 }}>
                        {c.cidade ? `${c.cidade}${c.estado ? ` / ${c.estado}` : ''}` : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="acn-btn" style={{ background: '#475569', fontSize: 9 }}
                            onClick={() => { setModalForm(c); setModoForm('ver'); }}>
                            👁 Ver
                          </button>
                          {podeEditar && (
                            <>
                              <button className="acn-btn" style={{ background: '#0f766e', fontSize: 9 }}
                                onClick={() => { setModalForm(c); setModoForm('editar'); }}>
                                ✏️ Editar
                              </button>
                              <button className="acn-btn" style={{ background: '#ef4444', fontSize: 9 }}
                                onClick={() => excluir(c)}>
                                🗑
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal form */}
      {modalForm !== null && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalForm(null); }}>
          <div className="modal-box" style={{ maxWidth: 620, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-title">
              {modoForm === 'novo' ? '+ Novo Cliente' : modoForm === 'editar' ? '✏️ Editar Cliente' : '👁 Dados do Cliente'}
            </div>
            {modoForm === 'ver' && !podeEditar && (
              <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 4, padding: '6px 10px', marginBottom: 12, fontSize: 10, color: '#713f12' }}>
                🔒 Você tem acesso somente de visualização. Contate um administrador para editar.
              </div>
            )}
            <FormCliente
              initial={modoForm === 'novo' ? {} : modalForm}
              readonly={modoForm === 'ver'}
              onSave={() => { setModalForm(null); load(); }}
              onCancel={() => setModalForm(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
