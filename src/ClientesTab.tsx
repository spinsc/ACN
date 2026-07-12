// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { ClienteAutocomplete, fmtTelefones, fmtEmails } from './ClienteUtils';

const CLIENTE_VAZIO = {
  nome: '', tipo: 'PF', documento: '', nome_contato: '', cargo_contato: '',
  empresa: '', empresa_id: null, _empresa_nome: '',
  telefones: [{ numero: '', tipo: 'Principal' }],
  emails: [{ email: '', tipo: 'Principal' }],
  endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '', observacoes: '',
};

const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// ─── TelefoneList ─────────────────────────────────────────────────────────────
function TelefoneList({ list, setList, readonly }) {
  return (
    <div>
      {list.map((t, i) => (
        <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
          <input className="acn-input" style={{ flex:2 }} placeholder="Telefone / WhatsApp"
            value={t.numero} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j===i ? {...x, numero:e.target.value} : x))} />
          <select className="acn-input" style={{ flex:1 }} value={t.tipo} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j===i ? {...x, tipo:e.target.value} : x))}>
            {['Principal','Celular','WhatsApp','Fixo','Comercial','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <button style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:16 }}
              onClick={() => setList(l => l.filter((_,j) => j!==i))}>×</button>
          )}
        </div>
      ))}
      {!readonly && (
        <button className="acn-btn" style={{ background:'#e2e8f0', color:'#1e293b', fontSize:10 }}
          onClick={() => setList(l => [...l, { numero:'', tipo:'Celular' }])}>
          + Telefone
        </button>
      )}
    </div>
  );
}

// ─── EmailList ────────────────────────────────────────────────────────────────
function EmailList({ list, setList, readonly }) {
  return (
    <div>
      {list.map((e, i) => (
        <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
          <input type="email" className="acn-input" style={{ flex:2 }} placeholder="email@exemplo.com"
            value={e.email} disabled={readonly}
            onChange={ev => setList(l => l.map((x,j) => j===i ? {...x, email:ev.target.value} : x))} />
          <select className="acn-input" style={{ flex:1 }} value={e.tipo} disabled={readonly}
            onChange={ev => setList(l => l.map((x,j) => j===i ? {...x, tipo:ev.target.value} : x))}>
            {['Principal','Comercial','NFe','Contato','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <button style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:16 }}
              onClick={() => setList(l => l.filter((_,j) => j!==i))}>×</button>
          )}
        </div>
      ))}
      {!readonly && (
        <button className="acn-btn" style={{ background:'#e2e8f0', color:'#1e293b', fontSize:10 }}
          onClick={() => setList(l => [...l, { email:'', tipo:'Contato' }])}>
          + Email
        </button>
      )}
    </div>
  );
}

// ─── FormCliente ──────────────────────────────────────────────────────────────
function FormCliente({ initial, onSave, onCancel, readonly, onEditarVinculado }) {
  const [f, setF]               = useState({ ...CLIENTE_VAZIO, ...initial });
  const [telefones, setTelefones] = useState(initial?.telefones?.length ? initial.telefones : [{ numero:'', tipo:'Principal' }]);
  const [emails,    setEmails]    = useState(initial?.emails?.length    ? initial.emails    : [{ email:'', tipo:'Principal' }]);
  const [salvando,  setSalvando]  = useState(false);

  // Contatos PF vinculados (só para PJ com id)
  const [contatosVinculados, setContatosVinculados] = useState<any[]>([]);
  const [loadingContatos, setLoadingContatos] = useState(false);

  useEffect(() => {
    if (f.tipo === 'PJ' && initial?.id) {
      setLoadingContatos(true);
      supabase.from('clientes').select('id,nome,documento,cargo_contato,telefones,emails')
        .eq('empresa_id', initial.id)
        .order('nome')
        .then(({ data }) => {
          setContatosVinculados(data || []);
          setLoadingContatos(false);
        });
    }
  }, [f.tipo, initial?.id]);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const salvar = async () => {
    if (!f.nome.trim()) { alert('Nome obrigatório!'); return; }
    setSalvando(true);
    const payload = {
      nome:          f.nome.trim().toUpperCase(),
      tipo:          f.tipo,
      documento:     f.documento || null,
      nome_contato:  f.nome_contato || null,
      cargo_contato: f.cargo_contato || null,
      empresa:       f.empresa || null,
      empresa_id:    f.tipo === 'PF' ? (f.empresa_id || null) : null,
      telefones:     telefones.filter(t => t.numero.trim()),
      emails:        emails.filter(e => e.email.trim()),
      endereco:      f.endereco || null,
      numero:        f.numero   || null,
      complemento:   f.complemento || null,
      bairro:        f.bairro   || null,
      cidade:        f.cidade   || null,
      estado:        f.estado   || null,
      cep:           f.cep      || null,
      observacoes:   f.observacoes || null,
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
    <input type={type||'text'} className="acn-input" style={{ width:'100%' }}
      value={f[k]||''} placeholder={placeholder||''} disabled={readonly}
      onChange={e => set(k, e.target.value)} />
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Tipo */}
      <div>
        {lbl('Tipo de Pessoa')}
        <div style={{ display:'flex', gap:8 }}>
          {['PF','PJ'].map(t => (
            <button key={t} disabled={readonly}
              style={{ flex:1, padding:'7px', border:`2px solid ${f.tipo===t ? '#0f766e' : '#e5e7eb'}`,
                borderRadius:6, background: f.tipo===t ? '#f0fdf4' : 'white',
                fontWeight:700, fontSize:12, cursor: readonly ? 'default' : 'pointer',
                color: f.tipo===t ? '#0f766e' : '#6b7280' }}
              onClick={() => !readonly && set('tipo', t)}>
              {t === 'PF' ? '👤 Pessoa Física' : '🏢 Pessoa Jurídica'}
            </button>
          ))}
        </div>
      </div>

      {/* Nome */}
      <div>
        {lbl(f.tipo==='PJ' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *')}
        {inp('nome', f.tipo==='PJ' ? 'Razão Social...' : 'Nome completo...')}
      </div>

      {/* PJ: nome do contato e cargo */}
      {f.tipo === 'PJ' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>{lbl('Nome do Contato Principal')}{inp('nome_contato', 'Responsável...')}</div>
          <div>{lbl('Cargo')}{inp('cargo_contato', 'Cargo...')}</div>
        </div>
      )}

      {/* Documento */}
      <div>
        {lbl(f.tipo==='PJ' ? 'CNPJ' : 'CPF')}
        {inp('documento', f.tipo==='PJ' ? '00.000.000/0000-00' : '000.000.000-00')}
      </div>

      {/* PF: empresa onde trabalha (texto livre) */}
      {f.tipo === 'PF' && (
        <div>
          {lbl('Empresa / Órgão (texto livre, opcional)')}
          {inp('empresa', 'Nome da empresa ou órgão...')}
        </div>
      )}

      {/* PJ: nome fantasia */}
      {f.tipo === 'PJ' && (
        <div>
          {lbl('Nome Fantasia / Marca (opcional)')}
          {inp('empresa', 'Nome fantasia...')}
        </div>
      )}

      {/* ── PF: Vínculo com empresa PJ do cadastro ── */}
      {f.tipo === 'PF' && (
        <div style={{ padding:'10px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8 }}>
          <div style={{ fontWeight:700, fontSize:10, color:'#0369a1', marginBottom:8, textTransform:'uppercase' }}>
            🔗 Empresa Vinculada no Cadastro
          </div>
          {readonly ? (
            f.empresa_id ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'#0369a1' }}>🏢 {f._empresa_nome || f.empresa}</span>
                {onEditarVinculado && (
                  <button className="acn-btn" style={{ background:'#0891b2', fontSize:9 }}
                    onClick={() => onEditarVinculado(f.empresa_id)}>
                    Ver empresa →
                  </button>
                )}
              </div>
            ) : (
              <span style={{ fontSize:10, color:'#94a3b8' }}>Nenhuma empresa vinculada</span>
            )
          ) : (
            <>
              <ClienteAutocomplete
                value={f._empresa_nome || ''}
                onChange={v => set('_empresa_nome', v)}
                onSelect={c => set('empresa_id', c.id) || set('_empresa_nome', c.nome) || set('empresa', c.nome)}
                placeholder="Buscar empresa cadastrada (PJ)..."
                tipoFilter="PJ"
                permitirCriar={true}
              />
              {f.empresa_id && (
                <div style={{ fontSize:8, color:'#059669', marginTop:4, display:'flex', gap:6, alignItems:'center' }}>
                  ✓ Vinculado ao cadastro da empresa
                  <button style={{ fontSize:8, color:'#ef4444', background:'none', border:'none', cursor:'pointer' }}
                    onClick={() => { set('empresa_id', null); set('_empresa_nome', ''); }}>
                    ✕ Remover vínculo
                  </button>
                </div>
              )}
              <div style={{ fontSize:8, color:'#64748b', marginTop:4 }}>
                Opcional. Conecta este contato PF à empresa PJ correspondente no cadastro.
              </div>
            </>
          )}
        </div>
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
      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:10 }}>
        <div style={{ fontWeight:700, fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:8 }}>📍 Endereço</div>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8, marginBottom:8 }}>
          <div>{lbl('Logradouro')}{inp('endereco', 'Rua, Av...')}</div>
          <div>{lbl('Número')}{inp('numero', '123')}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
          <div>{lbl('Complemento')}{inp('complemento', 'Apto, Sala...')}</div>
          <div>{lbl('Bairro')}{inp('bairro', 'Bairro...')}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8 }}>
          <div>{lbl('Cidade')}{inp('cidade', 'Cidade...')}</div>
          <div>
            {lbl('Estado')}
            <select className="acn-input" style={{ width:'100%' }} value={f.estado||''} disabled={readonly}
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
        <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical' }}
          value={f.observacoes||''} disabled={readonly}
          onChange={e => set('observacoes', e.target.value)}
          placeholder="Informações adicionais..." />
      </div>

      {/* ── PJ: Contatos vinculados (PF) ── */}
      {f.tipo === 'PJ' && initial?.id && (
        <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:12 }}>
          <div style={{ fontWeight:700, fontSize:10, color:'#475569', textTransform:'uppercase', marginBottom:8 }}>
            👥 Contatos Pessoas Físicas Vinculados
          </div>
          {loadingContatos ? (
            <div style={{ fontSize:10, color:'#94a3b8' }}>Carregando...</div>
          ) : contatosVinculados.length === 0 ? (
            <div style={{ fontSize:10, color:'#94a3b8', fontStyle:'italic' }}>
              Nenhum contato PF vinculado a esta empresa ainda.
              <br />Para vincular, edite um cadastro PF e selecione esta empresa no campo "Empresa Vinculada".
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {contatosVinculados.map(pf => (
                <div key={pf.id} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'7px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6 }}>
                  <span style={{ fontSize:14 }}>👤</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{pf.nome}</div>
                    <div style={{ fontSize:9, color:'#64748b', display:'flex', gap:8 }}>
                      {pf.cargo_contato && <span>{pf.cargo_contato}</span>}
                      {fmtTelefones(pf.telefones) && <span>📱 {fmtTelefones(pf.telefones)}</span>}
                      {fmtEmails(pf.emails) && <span>✉️ {fmtEmails(pf.emails)}</span>}
                      {pf.documento && <span>📄 {pf.documento}</span>}
                    </div>
                  </div>
                  {onEditarVinculado && (
                    <button className="acn-btn" style={{ background:'#475569', fontSize:9 }}
                      onClick={() => onEditarVinculado(pf.id)}>
                      Ver →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botões */}
      {!readonly && (
        <div style={{ display:'flex', gap:8, paddingTop:4 }}>
          <button className="acn-btn" style={{ background:'#0f766e', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : initial?.id ? '✓ Salvar Alterações' : '✓ Cadastrar Cliente'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onCancel}>Cancelar</button>
        </div>
      )}
      {readonly && (
        <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onCancel}>Fechar</button>
      )}
    </div>
  );
}

// ─── ClientesTab ──────────────────────────────────────────────────────────────
export default function ClientesTab({ currentUser }) {
  const [clientes, setClientes]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [busca, setBusca]         = useState('');
  const [filtroTipo, setFiltroTipo] = useState<''|'PF'|'PJ'>('');
  const [modalForm, setModalForm] = useState<any>(null); // null | {} | cliente
  const [modoForm, setModoForm]   = useState<'novo'|'editar'|'ver'>('ver');

  const podeEditar = currentUser?.perfil === 'Admin' || currentUser?.pode_editar_clientes === true;

  const load = async () => {
    setLoading(true);
    // Carrega clientes + nome da empresa vinculada (self-join via empresa_id)
    // Alias "empresa_vinculada" para não conflitar com a coluna de texto "empresa"
    let q = supabase.from('clientes').select('*, empresa_vinculada:empresa_id(id,nome)').order('nome');
    if (busca.length >= 2) q = q.or(`nome.ilike.%${busca}%,documento.ilike.%${busca}%,empresa.ilike.%${busca}%,cidade.ilike.%${busca}%`);
    if (filtroTipo) q = q.eq('tipo', filtroTipo);
    const { data } = await q.limit(200);
    setClientes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [busca, filtroTipo]);

  const fmtTel = (t: any[]) => Array.isArray(t) ? t.map(x => x.numero||x).filter(Boolean).join(' / ') : '';
  const fmtEml = (e: any[]) => Array.isArray(e) ? e.map(x => x.email||x).filter(Boolean).join(' / ') : '';

  const excluir = async (c: any) => {
    if (!window.confirm(`Excluir cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('clientes').delete().eq('id', c.id);
    load();
  };

  // Abre cliente pelo id (para "Ver empresa →" e "Ver contato →" dos vínculos)
  const abrirPorId = async (id: string) => {
    const { data } = await supabase.from('clientes').select('*, empresa_vinculada:empresa_id(id,nome)').eq('id', id).single();
    if (data) {
      setModalForm({ ...data, _empresa_nome: data.empresa_vinculada?.nome || '' });
      setModoForm('ver');
    }
  };

  const abrirModal = (c: any, modo: 'novo'|'editar'|'ver') => {
    setModalForm({ ...c, _empresa_nome: c.empresa_vinculada?.nome || '' });
    setModoForm(modo);
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr" style={{ background:'#f0fdf4', borderBottom:'2px solid #0f766e' }}>
          <span style={{ color:'#064e3b', fontWeight:700 }}>👥 Cadastro de Clientes ({clientes.length})</span>
          <div style={{ display:'flex', gap:8 }}>
            {podeEditar && (
              <button className="acn-btn" style={{ background:'#0f766e' }}
                onClick={() => { setModalForm({}); setModoForm('novo'); }}>
                + Novo Cliente
              </button>
            )}
            <button className="acn-btn" style={{ background:'#475569', fontSize:10 }} onClick={load}>↻</button>
          </div>
        </div>

        <div className="sec-body">
          {/* Filtros */}
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            <input className="acn-input" style={{ flex:1, minWidth:220, maxWidth:400 }}
              placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            {/* Filtro tipo */}
            {[
              { label:'Todos', val:'' },
              { label:'👤 PF', val:'PF' },
              { label:'🏢 PJ', val:'PJ' },
            ].map(opt => (
              <button key={opt.val} onClick={() => setFiltroTipo(opt.val as any)}
                style={{ padding:'4px 12px', border:`1.5px solid ${filtroTipo===opt.val ? '#0f766e' : '#e2e8f0'}`,
                  borderRadius:16, fontSize:10, fontWeight:700, cursor:'pointer',
                  background: filtroTipo===opt.val ? '#0f766e' : 'white',
                  color: filtroTipo===opt.val ? 'white' : '#64748b' }}>
                {opt.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="acn-empty">Carregando...</div>
          ) : clientes.length === 0 ? (
            <div className="acn-empty">
              {busca ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Nome</th>
                    <th>Empresa / CNPJ</th>
                    <th>Vínculo PF↔PJ</th>
                    <th>Telefone(s)</th>
                    <th>Email(s)</th>
                    <th>Cidade / UF</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => (
                    <tr key={c.id}>
                      <td>
                        <span style={{ fontSize:9, background: c.tipo==='PJ' ? '#dbeafe' : '#f0fdf4',
                          color: c.tipo==='PJ' ? '#1e40af' : '#065f46',
                          padding:'2px 6px', borderRadius:10, fontWeight:700 }}>
                          {c.tipo === 'PJ' ? '🏢 PJ' : '👤 PF'}
                        </span>
                      </td>
                      <td><strong style={{ color:'#0f766e' }}>{c.nome}</strong>
                        {c.nome_contato && <div style={{ fontSize:9, color:'#94a3b8' }}>{c.nome_contato}{c.cargo_contato && ` · ${c.cargo_contato}`}</div>}
                      </td>
                      <td style={{ fontSize:10 }}>
                        {c.empresa && <div style={{ fontWeight:600 }}>{c.empresa}</div>}
                        {c.documento && <div style={{ color:'#94a3b8' }}>{c.documento}</div>}
                      </td>
                      {/* Coluna vínculo */}
                      <td style={{ fontSize:10 }}>
                        {c.tipo === 'PF' && c.empresa_id && (
                          <button style={{ background:'none', border:'none', cursor:'pointer',
                            color:'#0369a1', fontSize:10, fontWeight:700, padding:0, textAlign:'left' }}
                            onClick={() => abrirPorId(c.empresa_id)}
                            title="Ver empresa vinculada">
                            🏢 {c.empresa_vinculada?.nome || '—'}
                          </button>
                        )}
                        {c.tipo === 'PJ' && (
                          <span style={{ fontSize:9, color:'#64748b' }}>
                            {/* contador de PFs vinculados é carregado somente na abertura do card */}
                            👥 ver contatos
                          </span>
                        )}
                        {c.tipo === 'PF' && !c.empresa_id && (
                          <span style={{ color:'#cbd5e1', fontSize:9 }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize:10 }}>{fmtTel(c.telefones) || '—'}</td>
                      <td style={{ fontSize:10, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {fmtEml(c.emails) || '—'}
                      </td>
                      <td style={{ fontSize:10 }}>
                        {c.cidade ? `${c.cidade}${c.estado ? ` / ${c.estado}` : ''}` : '—'}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="acn-btn" style={{ background:'#475569', fontSize:9 }}
                            onClick={() => abrirModal(c, 'ver')}>
                            👁 Ver
                          </button>
                          {podeEditar && (
                            <>
                              <button className="acn-btn" style={{ background:'#0f766e', fontSize:9 }}
                                onClick={() => abrirModal(c, 'editar')}>
                                ✏️
                              </button>
                              <button className="acn-btn" style={{ background:'#ef4444', fontSize:9 }}
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
        <div className="modal-overlay" onClick={e => { if (e.target===e.currentTarget) setModalForm(null); }}>
          <div className="modal-box" style={{ maxWidth:640, width:'96vw', maxHeight:'92vh', overflowY:'auto' }}>
            <div className="modal-title">
              {modoForm==='novo' ? '+ Novo Cliente' : modoForm==='editar' ? '✏️ Editar Cliente' : '👁 Dados do Cliente'}
            </div>
            {modoForm==='ver' && !podeEditar && (
              <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:4, padding:'6px 10px', marginBottom:12, fontSize:10, color:'#713f12' }}>
                🔒 Acesso somente de visualização. Contate um administrador para editar.
              </div>
            )}
            {/* Botão editar no modo ver (para quem pode) */}
            {modoForm==='ver' && podeEditar && (
              <div style={{ marginBottom:10 }}>
                <button className="acn-btn" style={{ background:'#0f766e', fontSize:10 }}
                  onClick={() => setModoForm('editar')}>
                  ✏️ Editar este cadastro
                </button>
              </div>
            )}
            <FormCliente
              initial={modoForm==='novo' ? {} : modalForm}
              readonly={modoForm==='ver'}
              onSave={() => { setModalForm(null); load(); }}
              onCancel={() => setModalForm(null)}
              onEditarVinculado={id => abrirPorId(id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
