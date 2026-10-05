// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { ClienteAutocomplete, fmtTelefones, fmtEmails } from './ClienteUtils';
import RichTextInput from './RichTextInput';
import { buscarPorPalavras } from './SearchUtils';
import { confirmar } from './Feedback';
import { Faixa, Botao, Selo, Chips } from './Interface';
import Icone from './Icone';
import { mdiAccountGroupOutline, mdiAccountOutline, mdiDomain, mdiEyeOutline, mdiLinkVariant, mdiMapMarkerOutline } from '@mdi/js';
import { temPoderDeGerente, podeDeletarRegistro } from './utils/permissoes';

// Etapa 12e7 (04/10/2026): a parte visual desta tela passou para as peças do design system (Botao, Selo, Chips, Faixa, a janela do
// sistema, o quadro e as classes acn-tabela / acn-cli-*), no lugar do estilo pintado à mão em cada elemento. Só aparência: os
// campos, os textos, os filtros, as consultas, as gravações e a regra de quem pode o quê são os de antes.

// A tela lê no máximo este tanto de clientes por vez (a busca e o filtro afinam). Antes o corte era silencioso.
const LIMITE_LISTA = 200;

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
        <div key={i} className="acn-cli-linha">
          <input className="acn-input acn-cli-in2" placeholder="Telefone / WhatsApp"
            value={t.numero} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j===i ? {...x, numero:e.target.value} : x))} />
          <select className="acn-input acn-cli-in1" value={t.tipo} disabled={readonly}
            onChange={e => setList(l => l.map((x, j) => j===i ? {...x, tipo:e.target.value} : x))}>
            {['Principal','Celular','WhatsApp','Fixo','Comercial','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <Botao pequeno variante="perigo-sec"
              onClick={() => setList(l => l.filter((_,j) => j!==i))}>×</Botao>
          )}
        </div>
      ))}
      {!readonly && (
        <Botao pequeno
          onClick={() => setList(l => [...l, { numero:'', tipo:'Celular' }])}>
          + Telefone
        </Botao>
      )}
    </div>
  );
}

// ─── EmailList ────────────────────────────────────────────────────────────────
function EmailList({ list, setList, readonly }) {
  return (
    <div>
      {list.map((e, i) => (
        <div key={i} className="acn-cli-linha">
          <input type="email" className="acn-input acn-cli-in2" placeholder="email@exemplo.com"
            value={e.email} disabled={readonly}
            onChange={ev => setList(l => l.map((x,j) => j===i ? {...x, email:ev.target.value} : x))} />
          <select className="acn-input acn-cli-in1" value={e.tipo} disabled={readonly}
            onChange={ev => setList(l => l.map((x,j) => j===i ? {...x, tipo:ev.target.value} : x))}>
            {['Principal','Comercial','NFe','Contato','Outro'].map(o => <option key={o}>{o}</option>)}
          </select>
          {!readonly && list.length > 1 && (
            <Botao pequeno variante="perigo-sec"
              onClick={() => setList(l => l.filter((_,j) => j!==i))}>×</Botao>
          )}
        </div>
      ))}
      {!readonly && (
        <Botao pequeno
          onClick={() => setList(l => [...l, { email:'', tipo:'Contato' }])}>
          + Email
        </Botao>
      )}
    </div>
  );
}

// ─── FormCliente ──────────────────────────────────────────────────────────────
function FormCliente({ initial, onSave, onCancel, readonly, onEditarVinculado, topo }) {
  const [f, setF]               = useState({ ...CLIENTE_VAZIO, ...initial });
  const [telefones, setTelefones] = useState(initial?.telefones?.length ? initial.telefones : [{ numero:'', tipo:'Principal' }]);
  const [emails,    setEmails]    = useState(initial?.emails?.length    ? initial.emails    : [{ email:'', tipo:'Principal' }]);
  const [salvando,  setSalvando]  = useState(false);

  // Contatos PF vinculados (só para PJ com id)
  const [contatosVinculados, setContatosVinculados] = useState<any[]>([]);
  const [loadingContatos, setLoadingContatos] = useState(false);
  // Etapa 7.40 (04/10/2026): leitura que falha não pode virar "nenhum contato vinculado".
  const [erroContatos, setErroContatos] = useState('');

  useEffect(() => {
    if (f.tipo === 'PJ' && initial?.id) {
      setLoadingContatos(true);
      supabase.from('clientes').select('id,nome,documento,cargo_contato,telefones,emails')
        .eq('empresa_id', initial.id)
        .order('nome')
        .then(({ data, error }) => {
          setContatosVinculados(data || []);
          setErroContatos(error ? error.message : '');
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
    // Etapa 7.40 (04/10/2026): o resultado da gravação não era conferido. Com ela recusada, a janela fechava, o que foi digitado se
    // perdia e a lista recarregava como se o cliente tivesse sido salvo. Agora avisa o erro e a janela continua aberta com os dados.
    let error;
    if (initial?.id) {
      ({ error } = await supabase.from('clientes').update(payload).eq('id', initial.id));
    } else {
      payload.criado_em = new Date().toISOString();
      ({ error } = await supabase.from('clientes').insert([payload]));
    }
    setSalvando(false);
    if (error) { alert('Não foi possível salvar o cliente: ' + error.message); return; }
    onSave();
  };

  const lbl = (txt) => <label className="acn-label">{txt}</label>;
  const inp = (k, placeholder?, type?) => (
    <input type={type||'text'} className="acn-input"
      value={f[k]||''} placeholder={placeholder||''} disabled={readonly}
      onChange={e => set(k, e.target.value)} />
  );

  // O corpo rola e os botões ficam fixos no rodapé da janela (a janela é a do sistema); o aviso e o botão "Editar este cadastro"
  // do modo "ver" chegam em `topo` e ficam no começo do corpo, como antes.
  return (
    <>
    <div className="acn-modal-corpo acn-form-cheio">
      {topo}

      {/* Tipo */}
      <div>
        {lbl('Tipo de Pessoa')}
        <div className="acn-cli-tipo">
          {['PF','PJ'].map(t => (
            <Botao key={t} disabled={readonly} variante={f.tipo===t ? 'primario' : 'secundario'} aria-pressed={f.tipo===t}
              icone={t === 'PF' ? mdiAccountOutline : mdiDomain}
              onClick={() => !readonly && set('tipo', t)}>
              {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
            </Botao>
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
        <div className="acn-cli-g11">
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
        <div className="acn-quadro tom-info">
          <div className="acn-quadro-titulo acn-cab-titulo">
            <Icone path={mdiLinkVariant} size={14} /> Empresa Vinculada no Cadastro
          </div>
          {readonly ? (
            f.empresa_id ? (
              <div className="acn-cli-vinc">
                <span className="acn-forte"><Icone path={mdiDomain} size={14} /> {f._empresa_nome || f.empresa}</span>
                {onEditarVinculado && (
                  <Botao pequeno onClick={() => onEditarVinculado(f.empresa_id)}>
                    Ver empresa →
                  </Botao>
                )}
              </div>
            ) : (
              <span className="acn-ajuda">Nenhuma empresa vinculada</span>
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
                <div className="acn-cli-vinc acn-txt-ok">
                  ✓ Vinculado ao cadastro da empresa
                  <Botao pequeno variante="perigo-sec"
                    onClick={() => { set('empresa_id', null); set('_empresa_nome', ''); }}>
                    ✕ Remover vínculo
                  </Botao>
                </div>
              )}
              <div className="acn-ajuda">
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
      <div className="acn-cli-secao">
        <div className="acn-quadro-titulo acn-cab-titulo"><Icone path={mdiMapMarkerOutline} size={14} /> Endereço</div>
        <div className="acn-cli-g21">
          <div>{lbl('Logradouro')}{inp('endereco', 'Rua, Av...')}</div>
          <div>{lbl('Número')}{inp('numero', '123')}</div>
        </div>
        <div className="acn-cli-g11">
          <div>{lbl('Complemento')}{inp('complemento', 'Apto, Sala...')}</div>
          <div>{lbl('Bairro')}{inp('bairro', 'Bairro...')}</div>
        </div>
        <div className="acn-cli-g211">
          <div>{lbl('Cidade')}{inp('cidade', 'Cidade...')}</div>
          <div>
            {lbl('Estado')}
            <select className="acn-input" value={f.estado||''} disabled={readonly}
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
        <RichTextInput value={f.observacoes||''} disabled={readonly}
          onChange={html => set('observacoes', html)}
          placeholder="Informações adicionais... (selecione um trecho pra formatar)" minHeight={44} />
      </div>

      {/* ── PJ: Contatos vinculados (PF) ── */}
      {f.tipo === 'PJ' && initial?.id && (
        <div className="acn-cli-secao">
          <div className="acn-quadro-titulo acn-cab-titulo">
            <Icone path={mdiAccountGroupOutline} size={14} /> Contatos Pessoas Físicas Vinculados
          </div>
          {loadingContatos ? (
            <div className="acn-ajuda">Carregando...</div>
          ) : erroContatos ? (
            <div className="acn-ajuda">
              Não foi possível ler os contatos vinculados ({erroContatos}).
            </div>
          ) : contatosVinculados.length === 0 ? (
            <div className="acn-ajuda">
              Nenhum contato PF vinculado a esta empresa ainda.
              <br />Para vincular, edite um cadastro PF e selecione esta empresa no campo "Empresa Vinculada".
            </div>
          ) : (
            <div className="acn-cli-pfs">
              {contatosVinculados.map(pf => (
                <div key={pf.id} className="acn-cli-pf">
                  <Icone path={mdiAccountOutline} size={18} />
                  <div className="acn-cli-pf-corpo">
                    <div className="acn-forte">{pf.nome}</div>
                    <div className="acn-ajuda acn-cli-pf-dados">
                      {pf.cargo_contato && <span>{pf.cargo_contato}</span>}
                      {fmtTelefones(pf.telefones) && <span>📱 {fmtTelefones(pf.telefones)}</span>}
                      {fmtEmails(pf.emails) && <span>✉️ {fmtEmails(pf.emails)}</span>}
                      {pf.documento && <span>📄 {pf.documento}</span>}
                    </div>
                  </div>
                  {onEditarVinculado && (
                    <Botao pequeno onClick={() => onEditarVinculado(pf.id)}>
                      Ver →
                    </Botao>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Botões */}
    {!readonly && (
      <div className="acn-modal-rodape acn-sac-rodape">
        <Botao variante="primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : initial?.id ? '✓ Salvar Alterações' : '✓ Cadastrar Cliente'}
        </Botao>
        <Botao onClick={onCancel}>Cancelar</Botao>
      </div>
    )}
    {readonly && (
      <div className="acn-modal-rodape acn-sac-rodape">
        <Botao onClick={onCancel}>Fechar</Botao>
      </div>
    )}
    </>
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

  // Quem cria e edita: Admin, gerentes e a equipe de Comercial/CRM e Licitações (a regra do sistema de 17/09/2026, escolha do
  // usuário em 04/10/2026, Etapa 7.40). Antes só Admin: a tela lia uma marca `pode_editar_clientes` que não existe no cadastro
  // de usuários nem é gravada em lugar nenhum. Excluir continua só com o Admin.
  const podeEditar = temPoderDeGerente(currentUser);
  const podeExcluir = podeDeletarRegistro(currentUser);
  const [erroLista, setErroLista] = useState('');

  const load = async () => {
    setLoading(true);
    // Carrega clientes + nome da empresa vinculada (self-join via empresa_id)
    // Alias "empresa_vinculada" para não conflitar com a coluna de texto "empresa"
    let q = supabase.from('clientes').select('*, empresa_vinculada:empresa_id(id,nome)').order('nome');
    if (busca.length >= 2) q = buscarPorPalavras(q, ['nome_norm', 'documento_norm', 'empresa_norm', 'cidade_norm'], busca);
    if (filtroTipo) q = q.eq('tipo', filtroTipo);
    const { data, error } = await q.limit(LIMITE_LISTA);
    // Etapa 7.40: leitura que falha não pode virar "Nenhum cliente cadastrado ainda"; a faixa diz o que aconteceu.
    setClientes(error ? [] : (data || []));
    setErroLista(error ? error.message : '');
    setLoading(false);
  };

  useEffect(() => { load(); }, [busca, filtroTipo]);

  const fmtTel = (t: any[]) => Array.isArray(t) ? t.map(x => x.numero||x).filter(Boolean).join(' / ') : '';
  const fmtEml = (e: any[]) => Array.isArray(e) ? e.map(x => x.email||x).filter(Boolean).join(' / ') : '';

  const excluir = async (c: any) => {
    if (!await confirmar(`Excluir cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('clientes').delete().eq('id', c.id);
    // Etapa 7.40: o resultado não era conferido. Cliente com oportunidade ou venda no CRM (119 oportunidades apontam para clientes)
    // é recusado pelo banco (chave estrangeira); a tela recarregava como se tivesse excluído e o cliente seguia na lista, sem aviso.
    if (error) {
      alert(error.code === '23503'
        ? `O cliente "${c.nome}" não pode ser excluído: está ligado a oportunidades ou vendas do CRM.`
        : 'Não foi possível excluir o cliente: ' + error.message);
      return;
    }
    load();
  };

  // Abre cliente pelo id (para "Ver empresa →" e "Ver contato →" dos vínculos)
  const abrirPorId = async (id: string) => {
    const { data, error } = await supabase.from('clientes').select('*, empresa_vinculada:empresa_id(id,nome)').eq('id', id).single();
    if (error || !data) { alert('Não foi possível abrir o cadastro: ' + (error?.message || 'cadastro não encontrado')); return; }
    setModalForm({ ...data, _empresa_nome: data.empresa_vinculada?.nome || '' });
    setModoForm('ver');
  };

  const abrirModal = (c: any, modo: 'novo'|'editar'|'ver') => {
    setModalForm({ ...c, _empresa_nome: c.empresa_vinculada?.nome || '' });
    setModoForm(modo);
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiAccountGroupOutline} size={16} /> Cadastro de Clientes ({clientes.length}{clientes.length >= LIMITE_LISTA ? '+' : ''})</span>
          <div className="acn-cab-filtros">
            {podeEditar && (
              <Botao variante="primario" pequeno
                onClick={() => { setModalForm({}); setModoForm('novo'); }}>
                + Novo Cliente
              </Botao>
            )}
            <Botao pequeno onClick={load}>↻</Botao>
          </div>
        </div>

        <div className="sec-body">
          {/* Filtros */}
          <div className="acn-cli-filtros">
            <input className="acn-input acn-cli-busca"
              placeholder="Buscar por nome, CNPJ/CPF, empresa, cidade..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            {/* Filtro tipo */}
            <Chips rotulo="Tipo" ativo={filtroTipo} onChange={setFiltroTipo as any} itens={[
              { id: '', rotulo: 'Todos' },
              { id: 'PF', rotulo: 'PF', icone: mdiAccountOutline },
              { id: 'PJ', rotulo: 'PJ', icone: mdiDomain },
            ]} />
          </div>

          {erroLista && <Faixa tom="erro">Não foi possível ler os clientes ({erroLista}).</Faixa>}
          {clientes.length >= LIMITE_LISTA && (
            <Faixa tom="atencao">Mostrando só os primeiros {LIMITE_LISTA} clientes. Use a busca ou o filtro para achar os outros.</Faixa>
          )}
          {loading ? (
            <div className="acn-empty">Carregando...</div>
          ) : clientes.length === 0 ? (
            erroLista ? null : <div className="acn-empty">
              {busca ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda.'}
            </div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
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
                        <Selo familia={c.tipo === 'PJ' ? 'info' : 'ok'} ponto={false}>
                          <Icone path={c.tipo === 'PJ' ? mdiDomain : mdiAccountOutline} size={14} /> {c.tipo === 'PJ' ? 'PJ' : 'PF'}
                        </Selo>
                      </td>
                      <td><strong className="acn-forte">{c.nome}</strong>
                        {c.nome_contato && <div className="acn-fraco">{c.nome_contato}{c.cargo_contato && ` · ${c.cargo_contato}`}</div>}
                      </td>
                      <td>
                        {c.empresa && <div className="acn-forte">{c.empresa}</div>}
                        {c.documento && <div className="acn-fraco">{c.documento}</div>}
                      </td>
                      {/* Coluna vínculo */}
                      <td>
                        {c.tipo === 'PF' && c.empresa_id && (
                          <Botao pequeno variante="discreto" icone={mdiDomain}
                            onClick={() => abrirPorId(c.empresa_id)}
                            title="Ver empresa vinculada">
                            {c.empresa_vinculada?.nome || '—'}
                          </Botao>
                        )}
                        {c.tipo === 'PJ' && (
                          <span className="acn-fraco acn-cab-titulo">
                            {/* contador de PFs vinculados é carregado somente na abertura do card */}
                            <Icone path={mdiAccountGroupOutline} size={14} /> ver contatos
                          </span>
                        )}
                        {c.tipo === 'PF' && !c.empresa_id && (
                          <span className="acn-fraco">—</span>
                        )}
                      </td>
                      <td>{fmtTel(c.telefones) || '—'}</td>
                      <td className="acn-cli-email">
                        {fmtEml(c.emails) || '—'}
                      </td>
                      <td>
                        {c.cidade ? `${c.cidade}${c.estado ? ` / ${c.estado}` : ''}` : '—'}
                      </td>
                      <td>
                        <div className="acn-acoes-linha">
                          <Botao pequeno icone={mdiEyeOutline}
                            onClick={() => abrirModal(c, 'ver')}>
                            Ver
                          </Botao>
                          {podeEditar && (
                            <>
                              <Botao pequeno
                                onClick={() => abrirModal(c, 'editar')}>
                                ✏️
                              </Botao>
                              {podeExcluir && (
                                <Botao pequeno variante="perigo-sec"
                                  onClick={() => excluir(c)}>
                                  🗑
                                </Botao>
                              )}
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
          <div className="modal-box acn-modal-cadastro acn-cli-jan">
            <div className="acn-modal-cab">
              <span className="modal-title">
                {modoForm==='novo' ? '+ Novo Cliente' : modoForm==='editar' ? '✏️ Editar Cliente' : <><Icone path={mdiEyeOutline} size={18} /> Dados do Cliente</>}
              </span>
            </div>
            <FormCliente
              initial={modoForm==='novo' ? {} : modalForm}
              readonly={modoForm==='ver'}
              onSave={() => { setModalForm(null); load(); }}
              onCancel={() => setModalForm(null)}
              onEditarVinculado={id => abrirPorId(id)}
              topo={<>
                {modoForm==='ver' && !podeEditar && (
                  <Faixa tom="atencao">Acesso somente de visualização. Contate um administrador para editar.</Faixa>
                )}
                {/* Botão editar no modo ver (para quem pode) */}
                {modoForm==='ver' && podeEditar && (
                  <div>
                    <Botao pequeno onClick={() => setModoForm('editar')}>
                      ✏️ Editar este cadastro
                    </Botao>
                  </div>
                )}
              </>}
            />
          </div>
        </div>
      )}
    </div>
  );
}
