// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmarRemocao } from './Feedback';
// 23/10/2026: usa o cliente compartilhado (que leva o crachá de quem entrou). Esta tela tinha um cliente PRÓPRIO só com a chave pública: desde a Etapa 17 (22/10) o banco
// recusa essa chave para gravar em veiculos_nfc e servicos_executados_nfc e para ler oples e cadastro_produtos — salvar, editar, apagar e a busca de OP ficavam sem funcionar.
import { supabase } from './supabaseClient';
import { combinaBusca, buscarPorPalavras } from './SearchUtils';
import { confirmar } from './Feedback';
import { perfilComPoderes } from './utils/permissoes';
import { CabecalhoTela, Botao, Faixa, diaISO } from './Interface';
import { mdiPlus } from '@mdi/js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcGarantia(dataFim) {
  if (!dataFim) return null;
  const hoje = new Date();
  const fim  = new Date(dataFim + 'T23:59:59');
  return fim >= hoje;
}

// 7.x do NFC (23/10/2026): copiar pode falhar (navegador sem permissão, página sem https). Antes a tela dizia "URL copiada!" mesmo assim, ou não dizia nada.
async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch { alert('Não foi possível copiar. Selecione o endereço e copie à mão.'); return false; }
}

function fmtData(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function GarantiaBadge({ dataFim }) {
  const ativa = calcGarantia(dataFim);
  if (ativa === null) return <span className="acn-nfc-s36">Sem data</span>;
  return (
    <span className={'acn-nfc-s38' + (ativa ? ' acn-nfc-s38-2' : ' acn-nfc-s38-3')}>
      {ativa ? '✅ Ativa' : '⚠️ Expirada'}
    </span>
  );
}

// ─── Autocomplete de OP/OS ───────────────────────────────────────────────────

const STATUS_CLASSE = {
  'Faturado':           'ok',
  'Aguarda Emissao NF': 'atencao',
  'Em Producao':        'info',
  'Finalizado':         'ok',
};

function OplAutocomplete({ oplNumero, oplId, onChange }) {
  // onChange(numero, id) — preenche ambos os campos
  const [busca,     setBusca]     = useState(oplNumero || '');
  const [resultados,setResultados]= useState([]);
  const [aberto,    setAberto]    = useState(false);
  const [buscando,  setBuscando]  = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);
  const seqRef   = useRef(0);   // 7.x (23/10/2026): resposta de uma busca antiga não pode sobrescrever a da busca mais nova

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pesquisar = (texto) => {
    setBusca(texto);
    if (timerRef.current) clearTimeout(timerRef.current);
    seqRef.current++;
    // a vírgula e os parênteses quebram o filtro "ou" do banco ("Polícia Civil, SC" dava erro e a lista dizia "Nenhuma OP encontrada"): saem do termo
    const termo = String(texto || '').replace(/[%,()\\*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (termo.length < 2) { setResultados([]); setErroBusca(''); setBuscando(false); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      const minha = ++seqRef.current;
      setBuscando(true);
      const { data, error } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral, chassi, modelo, data_prevista_entrega')
        .not('status_geral', 'eq', 'Cancelado')
        .or(`opl.ilike.%${termo}%,cliente_nome.ilike.%${termo}%,chassi.ilike.%${termo}%`)
        .order('opl', { ascending: false })
        .limit(10);
      if (minha !== seqRef.current) return;   // outra busca começou depois desta
      setErroBusca(error ? (error.message || 'falha na consulta') : '');
      setResultados(error ? [] : (data || []));
      setAberto(true);
      setBuscando(false);
    }, 300);
  };

  const selecionar = (item) => {
    setBusca(item.opl);
    setAberto(false);
    onChange(item); // passa objeto completo
  };

  const limpar = () => {
    setBusca('');
    setResultados([]);
    setAberto(false);
    onChange('', '');
  };

  return (
    <div ref={wrapRef} className="acn-nfc-c114">
      <label className="acn-nfc-lb115">
        Vincular OP / OS (busca por número ou cliente)
      </label>
      <div className="acn-nfc-c118">
        <input
          value={busca}
          onChange={e => pesquisar(e.target.value)}
          onFocus={() => busca.length >= 2 && resultados.length > 0 && setAberto(true)}
          placeholder="Ex: OP-2024-0042 ou Polícia Civil..."
          className="acn-nfc-inp124" />
        {busca && (
          <Botao onClick={limpar}
            className="acn-nfc-bt acn-nfc-b128">
            ✕
          </Botao>
        )}
      </div>

      {/* Seleção atual */}
      {oplId && oplNumero && (
        <div className="acn-nfc-c137">
          ✅ Vinculado: {oplNumero} — campos preenchidos automaticamente ↓
        </div>
      )}

      {/* Dropdown */}
      {aberto && (
        <div className="acn-nfc-c144">
          {buscando ? (
            <div className="acn-nfc-c148">Buscando...</div>
          ) : erroBusca ? (
            <div className="acn-nfc-c150">Não foi possível buscar as OPs ({erroBusca}). Isso não quer dizer que a OP não exista.</div>
          ) : resultados.length === 0 ? (
            <div className="acn-nfc-c148">Nenhuma OP encontrada.</div>
          ) : resultados.map(r => {
            return (
              <div key={r.id} onClick={() => selecionar(r)} className="acn-nfc-hv acn-nfc-c156"
>
                <div>
                  <div className="acn-nfc-c159">{r.opl}</div>
                  <div className="acn-nfc-c160">{r.cliente_nome}</div>
                  {(r.chassi || r.modelo) && (
                    <div className="acn-nfc-c162">
                      {[r.chassi && `Chassi: ${r.chassi}`, r.modelo].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span className={('acn-nfc-sts acn-nfc-sts-' + (STATUS_CLASSE[r.status_geral] || 'padrao')) + ' acn-nfc-s167'}>
                  {r.status_geral}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Gravar Tag NFC ────────────────────────────────────────────────────

function ModalGravarTag({ url, chassi, onClose }) {
  const [gravando,  setGravando]  = useState(false);
  const [resultado, setResultado] = useState(null); // null | 'ok' | 'erro' | 'unsupported'
  const [erroMsg,   setErroMsg]   = useState('');
  const [copiado,   setCopiado]   = useState(false);

  const copiarUrl = async () => {
    if (!await copiarTexto(url)) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const gravarViaNfc = async () => {
    if (!('NDEFReader' in window)) {
      setResultado('unsupported');
      return;
    }
    try {
      setGravando(true);
      setResultado(null);
      const ndef = new (window as any).NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] });
      setResultado('ok');
    } catch (err) {
      setErroMsg(err?.message || 'Erro desconhecido');
      setResultado('erro');
    } finally {
      setGravando(false);
    }
  };

  const passos = [
    { n:1, txt: 'Abra o app NFC Tools no celular' },
    { n:2, txt: 'Toque em "Escrever" (Write)' },
    { n:3, txt: 'Toque em "Adicionar um registro"' },
    { n:4, txt: 'Selecione "URL / URI"' },
    { n:5, txt: 'Cole a URL abaixo no campo' },
    { n:6, txt: 'Toque em "Escrever / Write"' },
    { n:7, txt: 'Aproxime a etiqueta NFC da parte traseira do celular' },
  ];

  return (
    <div className="acn-nfc-fundo acn-nfc-c223"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-nfc-c226">

        {/* Header */}
        <div className="acn-nfc-c230">
          <div>
            <div className="acn-nfc-c234">MÓDULO NFC</div>
            <div className="acn-nfc-c235">🏷️ Gravar Tag NFC</div>
            <div className="acn-nfc-c236">Chassi: {chassi}</div>
          </div>
          <Botao onClick={onClose}
            className="acn-nfc-bt acn-nfc-b239">✕</Botao>
        </div>

        <div className="acn-nfc-c242">

          {/* URL + QR */}
          <div className="acn-nfc-c245">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(url)}`}
              alt="QR Code" width={100} height={100}
              className="acn-nfc-img250" />
            <div className="acn-nfc-c251">
              <div className="acn-nfc-c252">
                URL A GRAVAR NA ETIQUETA
              </div>
              <div className="acn-nfc-c255">
                {url}
              </div>
              <Botao onClick={copiarUrl}
                className={'acn-nfc-bt acn-nfc-b261' + (copiado ? ' acn-nfc-b261-2' : ' acn-nfc-b261-3')}>
                {copiado ? '✅ Copiado!' : '📋 Copiar URL'}
              </Botao>
            </div>
          </div>

          {/* Botão Web NFC API */}
          <div className="acn-nfc-c270">
            <div className="acn-nfc-c271">
              OPÇÃO 1 — GRAVAR DIRETAMENTE (Chrome Android)
            </div>
            <Botao onClick={gravarViaNfc} disabled={gravando}
              className={'acn-nfc-bt acn-nfc-b275' + (gravando ? ' acn-nfc-b275-2' : ' acn-nfc-b275-3')}>
              {gravando
                ? <><span className="acn-nfc-s280">📡</span> Aproxime a tag NFC agora...</>
                : <><span className="acn-nfc-s280">🏷️</span> Gravar Tag Agora</>}
            </Botao>
            <div className="acn-nfc-c283">
              Requer Chrome 89+ no Android · HTTPS · Permissão NFC ativada nas configurações
            </div>

            {resultado === 'ok' && (
              <div className="acn-nfc-c288">
                ✅ Tag gravada com sucesso! Teste a leitura com o celular.
              </div>
            )}
            {resultado === 'erro' && (
              <div className="acn-nfc-c294">
                ❌ {erroMsg || 'Erro ao gravar. Verifique se o NFC está ativado e tente novamente.'}
              </div>
            )}
            {resultado === 'unsupported' && (
              <div className="acn-nfc-c300">
                ⚠️ Web NFC não disponível neste navegador. Use o método via NFC Tools abaixo.
              </div>
            )}
          </div>

          {/* Instruções NFC Tools */}
          <div className="acn-nfc-c308">
            <div className="acn-nfc-c309">
              OPÇÃO 2 — Via App NFC Tools (iOS ou Android)
              <span className="acn-nfc-s312">
                Download gratuito na App Store / Play Store
              </span>
            </div>
            <div className="acn-nfc-c316">
              {passos.map((p, i) => (
                <div key={i} className={'acn-nfc-c318' + (i < passos.length - 1 ? ' acn-nfc-c318-2' : ' acn-nfc-c318-3')}>
                  <div className="acn-nfc-c320">
                    {p.n}
                  </div>
                  <div className="acn-nfc-c325">
                    {p.n === 5
                      ? <><span>{p.txt}:</span><br/>
                          <span className="acn-nfc-s328">
                            {url}
                          </span></>
                      : p.txt}
                  </div>
                </div>
              ))}
              <div className="acn-nfc-c337">
                💡 Dica: Use etiquetas NFC tipo NTAG213 ou NTAG215 — comuns e baratas.
                Capacidade mínima recomendada: 144 bytes (suficiente para a URL).
              </div>
            </div>
          </div>
        </div>

        <div className="acn-nfc-c346">
          <Botao onClick={onClose}
            className="acn-nfc-bt acn-nfc-b348">
            Fechar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Formulário de Veículo ──────────────────────────────────────────────

const FORM_VAZIO = {
  chassi: '', placa: '', modelo: '', orgao_cliente: '',
  opl_numero: '', opl_id: '', data_entrega: '', data_fim_garantia: '',
  manual_pdf_url: '', pin_acesso: '123456',
};

function ModalVeiculo({ veiculo, onClose, onSalvo }) {
  const editando = !!veiculo?.id;
  const [form, setForm] = useState(editando ? {
    chassi:           veiculo.chassi           || '',
    placa:            veiculo.placa             || '',
    modelo:           veiculo.modelo            || '',
    orgao_cliente:    veiculo.orgao_cliente     || '',
    opl_numero:       veiculo.opl_numero        || '',
    opl_id:           veiculo.opl_id            || '',
    data_entrega:     veiculo.data_entrega      || '',
    data_fim_garantia:veiculo.data_fim_garantia || '',
    manual_pdf_url:   veiculo.manual_pdf_url    || '',
    pin_acesso:       veiculo.pin_acesso        || '123456',
  } : { ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);

  // Garantia por produto
  const [prodGar, setProdGar] = useState<any[]>(veiculo?.produtos_instalados || []);
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState<any[]>([]);
  const [erroProd, setErroProd] = useState('');
  const seqProd = useRef(0);        // 7.x: a resposta de uma busca antiga não sobrescreve a da mais nova
  const salvandoRef = useRef(false);   // 7.x: clique duplo gravava duas vezes

  const calcFimGarantia = (dataEntrega: string, meses: number) => {
    if (!dataEntrega) return '';
    // R16 (05/10/2026): a entrega é coluna date ("AAAA-MM-DD"); `new Date(texto)` é a meia-noite de Londres, que no Brasil
    // ainda é o dia anterior — o fim da garantia saía gravado UM DIA ANTES do certo. Com a hora local o dia fica o mesmo.
    const d = new Date(dataEntrega + 'T00:00:00');
    d.setMonth(d.getMonth() + Number(meses));
    return diaISO(d);
  };

  const buscarProdutos = async (q: string) => {
    const minha = ++seqProd.current;
    if (q.length < 2) { setProdResults([]); setErroProd(''); return; }
    const { data, error } = await buscarPorPalavras(supabase.from('cadastro_produtos')
      .select('id, nome, garantia_meses, codigo')
      .eq('ativo', true), ['nome_norm', 'codigo_norm'], q).limit(8);
    if (minha !== seqProd.current) return;
    setErroProd(error ? (error.message || 'falha na consulta') : '');
    setProdResults(error ? [] : (data || []));
  };

  const addProduto = (prod: any) => {
    const meses = prod.garantia_meses || 12;
    setProdGar(g => [...g, {
      produto_id: prod.id,
      produto_nome: prod.nome,
      garantia_meses: meses,
      data_fim_garantia: calcFimGarantia(form.data_entrega, meses),
    }]);
    setProdSearch(''); setProdResults([]);
  };

  const updateProdGar = (idx: number, meses: number) => {
    setProdGar(g => g.map((p, i) => i !== idx ? p : {
      ...p, garantia_meses: meses,
      data_fim_garantia: calcFimGarantia(form.data_entrega, meses),
    }));
  };

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      // Recalcular datas de garantia quando data_entrega muda
      if (k === 'data_entrega') {
        setProdGar(g => g.map(p => ({
          ...p, data_fim_garantia: calcFimGarantia(v, p.garantia_meses),
        })));
      }
      return next;
    });
  };

  const salvar = async () => {
    if (salvandoRef.current) return;
    if (!form.chassi.trim()) { alert('Chassi obrigatório.'); return; }
    salvandoRef.current = true;
    setSalvando(true);
    const payload = {
      chassi:            form.chassi.trim().toUpperCase(),
      placa:             form.placa.trim().toUpperCase() || null,
      modelo:            form.modelo.trim() || null,
      orgao_cliente:     form.orgao_cliente.trim() || null,
      opl_numero:        form.opl_numero.trim() || null,
      opl_id:            form.opl_id.trim() || null,
      data_entrega:       form.data_entrega || null,
      data_fim_garantia:  form.data_fim_garantia || null,
      produtos_instalados: prodGar,
      manual_pdf_url:     form.manual_pdf_url.trim() || null,
      pin_acesso:        form.pin_acesso.trim() || '123456',
      atualizado_em:     new Date().toISOString(),
    };
    let error;
    if (editando) {
      // .select('id'): atualização que o banco recusa sem erro (0 linhas) não pode valer como "atualizado"
      const r = await supabase.from('veiculos_nfc').update(payload).eq('id', veiculo.id).select('id');
      error = r.error || ((r.data || []).length ? null : { message: 'o banco não atualizou nenhum veículo (ele pode ter sido excluído por outra pessoa)' });
    } else {
      ({ error } = await supabase.from('veiculos_nfc').insert([payload]));
    }
    salvandoRef.current = false;
    setSalvando(false);
    if (error) { alert(error.code === '23505' ? 'Já existe um veículo com este chassi. Confira o chassi ou abra o veículo que já está cadastrado.' : 'Não foi possível salvar o veículo: ' + error.message); return; }
    onSalvo();
    onClose();
  };

  const campo = (label, key, type = 'text', extra = {}) => (
    <div className="acn-nfc-c318-2">
      <label className="acn-nfc-lb115">
        {label}
      </label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
        className="acn-nfc-inp481"
        {...extra} />
    </div>
  );

  return (
    <div className="acn-nfc-fundo acn-nfc-c488"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-nfc-c491">
        <div className="acn-nfc-c493">
          <div className="acn-nfc-c496">
            {editando ? '✏️ Editar Veículo' : '➕ Novo Veículo NFC'}
          </div>
          <Botao onClick={onClose}
            className="acn-nfc-bt acn-nfc-b500">✕</Botao>
        </div>
        <div className="acn-nfc-c242">
          <div className="acn-nfc-c503">
            <div>{campo('Chassi *', 'chassi', 'text', { placeholder:'Ex: 9BWZZZ377VT004251' })}</div>
            <div>{campo('Placa', 'placa', 'text', { placeholder:'Ex: ABC-1234' })}</div>
          </div>
          {campo('Modelo / Descrição', 'modelo', 'text', { placeholder:'Ex: Viatura Policial — Ford Ranger 2024' })}
          {campo('Órgão / Cliente', 'orgao_cliente', 'text', { placeholder:'Ex: Polícia Civil SC' })}
          <OplAutocomplete
            oplNumero={form.opl_numero}
            oplId={form.opl_id}
            onChange={(item) => setForm(f => ({
              ...f,
              opl_numero: item.opl,
              opl_id:     item.id,
              // Auto-preenche apenas campos ainda vazios
              chassi:           f.chassi           || item.chassi  || '',
              modelo:           f.modelo           || item.modelo  || '',
              orgao_cliente:    f.orgao_cliente    || item.cliente_nome || '',
              data_entrega:     f.data_entrega     || item.data_prevista_entrega || '',
            }))}
          />
          <div className="acn-nfc-c503">
            <div>{campo('Data de Entrega', 'data_entrega', 'date')}</div>
            <div>{campo('Fim da Garantia (geral)', 'data_fim_garantia', 'date')}</div>
          </div>

          {/* Garantia por produto */}
          <div className="acn-nfc-c529">
            <div className="acn-nfc-c530">
              🛡️ Produtos e Garantias Individuais
            </div>
            {/* Busca de produto */}
            <div className="acn-nfc-c534">
              <input
                value={prodSearch}
                onChange={e => { setProdSearch(e.target.value); buscarProdutos(e.target.value); }}
                placeholder="Buscar produto para adicionar..."
                className="acn-nfc-inp539"
              />
              {prodResults.length > 0 && (
                <div className="acn-nfc-c543">
                  {prodResults.map(p => (
                    <div key={p.id} onClick={() => addProduto(p)} className="acn-nfc-hv acn-nfc-c547"
>
                      <span>{p.nome}</span>
                      <span className="acn-nfc-s550">{p.garantia_meses || 12} meses</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {erroProd && (
              <div className="acn-nfc-c557">
                Não foi possível buscar os produtos ({erroProd}). Isso não quer dizer que o produto não exista.
              </div>
            )}
            {/* Lista de produtos com garantia */}
            {prodGar.length === 0 ? (
              <div className="acn-nfc-c563">
                Nenhum produto adicionado ainda
              </div>
            ) : (
              <table className="acn-nfc-tb567">
                <thead>
                  <tr className="acn-nfc-tr569">
                    <th className="acn-nfc-cel570">Produto</th>
                    <th className="acn-nfc-cel571">Garantia</th>
                    <th className="acn-nfc-cel571">Vence em</th>
                    <th className="acn-nfc-cel573"></th>
                  </tr>
                </thead>
                <tbody>
                  {prodGar.map((p, i) => (
                    <tr key={i} className="acn-nfc-tr578">
                      <td className="acn-nfc-td579">{p.produto_nome}</td>
                      <td className="acn-nfc-td580">
                        <select value={p.garantia_meses}
                          onChange={e => updateProdGar(i, Number(e.target.value))}
                          className="acn-nfc-sel583">
                          <option value={6}>6 meses</option>
                          <option value={12}>12 meses</option>
                          <option value={24}>24 meses</option>
                          <option value={60}>60 meses</option>
                        </select>
                      </td>
                      <td className={'acn-nfc-td590' + (p.data_fim_garantia ? ' acn-nfc-td590-2' : ' acn-nfc-td590-3')}>
                        {fmtData(p.data_fim_garantia)}
                      </td>
                      <td className="acn-nfc-td593">
                        <Botao onClick={async () => { if (!await confirmarRemocao('este produto da garantia')) return; setProdGar(g => g.filter((_, j) => j !== i)); }}
                          className="acn-nfc-bt acn-nfc-b595">✕</Botao>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!form.data_entrega && prodGar.length > 0 && (
              <div className="acn-nfc-c603">
                ⚠️ Defina a Data de Entrega para calcular os vencimentos automaticamente
              </div>
            )}
          </div>

          {campo('URL do Manual PDF', 'manual_pdf_url', 'url', { placeholder:'https://...' })}
          <div className="acn-nfc-c318-2">
            <label className="acn-nfc-lb115">
              PIN de Acesso Restrito
            </label>
            <input type="text" maxLength={10} value={form.pin_acesso}
              onChange={e => set('pin_acesso', e.target.value)}
              placeholder="Ex: 123456"
              className="acn-nfc-inp617" />
            <span className="acn-nfc-s619">
              Deixe "123456" para usar o PIN global
            </span>
          </div>
        </div>
        <div className="acn-nfc-c624">
          <Botao onClick={onClose}
            className="acn-nfc-bt acn-nfc-b626">
            Cancelar
          </Botao>
          <Botao onClick={salvar} disabled={salvando}
            className={'acn-nfc-bt acn-nfc-b631' + (salvando ? ' acn-nfc-b631-2' : ' acn-nfc-b631-3')}>
            {salvando ? 'Salvando...' : editando ? '✏️ Atualizar' : '✅ Salvar Veículo'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Detalhe do Veículo ─────────────────────────────────────────────

function PainelDetalhe({ veiculo, baseUrl, portalBaseUrl, enderecos, isAdmin, onEditar, onDeletar, onClose, carregarVeiculos }) {
  const [servicos, setServicos] = useState([]);
  const [chamados, setChamados] = useState([]);
  const [servLido, setServLido] = useState(false);   // 7.x: a leitura recusada não pode parecer "nenhum serviço"
  const [erroServ, setErroServ] = useState('');
  const [erroCham, setErroCham] = useState('');
  const salvServRef = useRef(false);
  const [novoServ, setNovoServ] = useState({ item_servico:'', descricao_tecnica:'', categoria:'' });
  const [addingServ, setAddingServ] = useState(false);
  const [salvServ,  setSalvServ]  = useState(false);
  const [modalTag, setModalTag] = useState(false);
  const [copiadoPortal, setCopiadoPortal] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [portalToken, setPortalToken] = useState(veiculo.portal_token || '');

  // 7.x (23/10/2026): sem o endereço configurado (ou com a leitura recusada) o link saía com o endereço de exemplo ("seudominio.com.br") — o QR, a etiqueta gravada e o link do cliente ficavam errados sem aviso
  const urlPublica  = enderecos.base ? `${baseUrl}?chassi=${encodeURIComponent(veiculo.chassi)}` : null;
  const urlPortal   = portalToken && enderecos.portal ? `${portalBaseUrl}?token=${portalToken}` : null;

  const copiarPortal = async () => {
    if (!urlPortal) return;
    if (!await copiarTexto(urlPortal)) return;
    setCopiadoPortal(true);
    setTimeout(() => setCopiadoPortal(false), 2000);
  };

  const regenerarToken = async () => {
    if (!await confirmar('Regenerar o token invalida o link antigo. Confirma?')) return;
    setRegenerando(true);
    const novoToken = crypto.randomUUID();
    const { data: trocados, error } = await supabase.from('veiculos_nfc')
      .update({ portal_token: novoToken }).eq('id', veiculo.id).select('id');
    if (!error && (trocados || []).length) {
      setPortalToken(novoToken);
      alert('Novo link gerado! Copie e envie ao cliente.');
    } else {
      alert('Não foi possível gerar o novo link: ' + (error?.message || 'o banco não atualizou o veículo') + '. O link antigo continua valendo.');
    }
    setRegenerando(false);
  };

  const carregarServicos = useCallback(async () => {
    const { data, error } = await supabase.from('servicos_executados_nfc')
      .select('*').eq('veiculo_id', veiculo.id).order('ordem').order('criado_em');
    if (error) { setErroServ(error.message || 'falha na consulta'); return; }   // mantém a última lista lida
    setErroServ(''); setServLido(true);
    setServicos(data || []);
  }, [veiculo.id]);

  const carregarChamados = useCallback(async () => {
    const { data, error } = await supabase.from('chamados_suporte')
      .select('*').eq('veiculo_id', veiculo.id).order('created_at', { ascending:false }).limit(5);
    if (error) { setErroCham(error.message || 'falha na consulta'); return; }
    setErroCham('');
    setChamados(data || []);
  }, [veiculo.id]);

  useEffect(() => { carregarServicos(); carregarChamados(); }, [carregarServicos, carregarChamados]);

  const adicionarServico = async () => {
    if (!novoServ.item_servico.trim() || salvServRef.current) return;
    salvServRef.current = true;
    setSalvServ(true);
    const { error } = await supabase.from('servicos_executados_nfc').insert([{
      veiculo_id:        veiculo.id,
      item_servico:      novoServ.item_servico.trim(),
      descricao_tecnica: novoServ.descricao_tecnica.trim() || null,
      categoria:         novoServ.categoria.trim() || null,
    }]);
    salvServRef.current = false;
    setSalvServ(false);
    // 7.x: com a gravação recusada o formulário era esvaziado e fechado como se tivesse dado certo — o que a pessoa digitou se perdia
    if (error) { alert('Não foi possível adicionar o serviço: ' + error.message); return; }
    setNovoServ({ item_servico:'', descricao_tecnica:'', categoria:'' });
    setAddingServ(false);
    carregarServicos();
  };

  const deletarServico = async (id) => {
    if (!await confirmar('Remover este serviço?')) return;
    const { data: apagados, error } = await supabase.from('servicos_executados_nfc').delete().eq('id', id).select('id');
    if (error || !(apagados || []).length) { alert('Não foi possível remover o serviço: ' + (error?.message || 'o banco não apagou nada') + '.'); carregarServicos(); return; }
    carregarServicos();
  };

  const copiarUrl = async () => {
    if (!urlPublica) return;
    if (await copiarTexto(urlPublica)) alert('URL copiada!');
  };

  const garantiaAtiva = calcGarantia(veiculo.data_fim_garantia);

  return (
    <>
    <div className="acn-nfc-fundo acn-nfc-c738"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-nfc-c741">

        {/* Header */}
        <div className="acn-nfc-c745">
          <div>
            <div className="acn-nfc-c748">
              DOSSIÊ NFC
            </div>
            <div className="acn-nfc-c235">{veiculo.modelo || veiculo.chassi}</div>
            <div className="acn-nfc-c236">
              Chassi: {veiculo.chassi}
              {veiculo.placa && ` · Placa: ${veiculo.placa}`}
              {veiculo.orgao_cliente && ` · ${veiculo.orgao_cliente}`}
            </div>
          </div>
          <div className="acn-nfc-c758">
            <Botao onClick={() => onEditar(veiculo)}
              className="acn-nfc-bt acn-nfc-b760">
              ✏️ Editar
            </Botao>
            {isAdmin && (
              <Botao onClick={() => onDeletar(veiculo)}
                className="acn-nfc-bt acn-nfc-b766"
                title="Excluir veículo e invalidar portal do cliente">
                🗑️ Excluir
              </Botao>
            )}
            <Botao onClick={onClose}
              className="acn-nfc-bt acn-nfc-b239">✕</Botao>
          </div>
        </div>

        <div className="acn-nfc-c242">
          {/* Info principal */}
          <div className="acn-nfc-gr3 acn-nfc-c779">
            {[
              { label:'Garantia', val: <GarantiaBadge dataFim={veiculo.data_fim_garantia} /> },
              { label:'Entrega',  val: fmtData(veiculo.data_entrega) },
              { label:'Fim Garantia', val: fmtData(veiculo.data_fim_garantia) },
              { label:'OP',      val: veiculo.opl_numero || '—' },
              { label:'PIN Restrita', val: veiculo.pin_acesso || '123456', mono: true },
              { label:'Chamados abertos', val: erroCham ? '—' : chamados.filter(c=>c.status==='Aberto').length },
            ].map(({ label, val, mono }) => (
              <div key={label} className="acn-nfc-c788">
                <div className="acn-nfc-c790">{label}</div>
                <div className={'acn-nfc-c791' + (mono ? ' acn-nfc-c791-2' : ' acn-nfc-c791-3')}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Garantias por produto */}
          {(veiculo.produtos_instalados || []).length > 0 && (
            <div className="acn-nfc-c801">
              <div className="acn-nfc-c530">🛡️ Garantias por Produto</div>
              <table className="acn-nfc-tb567">
                <thead>
                  <tr className="acn-nfc-tr569">
                    <th className="acn-nfc-cel808">Produto</th>
                    <th className="acn-nfc-cel809">Meses</th>
                    <th className="acn-nfc-cel810">Vence em</th>
                    <th className="acn-nfc-cel809">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(veiculo.produtos_instalados || []).map((p, i) => {
                    // O fim da garantia vale até o fim do dia (R16, 05/10/2026): a mesma conta do selo da lista (`calcGarantia`).
                    // Antes, `new Date("AAAA-MM-DD")` era a meia-noite de Londres e a garantia virava "Expirada" no último dia.
                    const ativa = calcGarantia(p.data_fim_garantia);
                    return (
                      <tr key={i} className="acn-nfc-tr578">
                        <td className="acn-nfc-td821">{p.produto_nome}</td>
                        <td className="acn-nfc-td822">{p.garantia_meses}m</td>
                        <td className={'acn-nfc-td590' + (ativa === false ? ' acn-nfc-td823' : ' acn-nfc-td590-2')}>
                          {fmtData(p.data_fim_garantia)}
                        </td>
                        <td className="acn-nfc-td580">
                          {ativa === true && <span className="acn-nfc-s828">✅ Ativa</span>}
                          {ativa === false && <span className="acn-nfc-s829">⚠️ Expirada</span>}
                          {ativa === null && <span className="acn-nfc-s830">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* QR Code + URL */}
          {!urlPublica ? (
            <div className="acn-nfc-c842">
              <Faixa tom="atencao">
                {enderecos.erro
                  ? `Não foi possível ler o endereço da página NFC (${enderecos.erro}). Sem ele o QR Code e o link não servem para gravar a etiqueta; tente de novo mais tarde.`
                  : enderecos.lido
                    ? 'O endereço da página NFC ainda não foi configurado (Administração › Configurações do Dossiê NFC). Sem ele o QR Code e o link não servem para gravar a etiqueta.'
                    : 'Lendo o endereço da página NFC…'}
              </Faixa>
            </div>
          ) : (
          <div className="acn-nfc-c852">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(urlPublica)}`}
              alt="QR Code NFC" width={90} height={90}
              className="acn-nfc-img250" />
            <div className="acn-nfc-c858">
              <div className="acn-nfc-c859">
                🔗 URL PÚBLICA NFC
              </div>
              <div className="acn-nfc-c862">
                {urlPublica}
              </div>
              <div className="acn-nfc-c867">
                <Botao onClick={copiarUrl}
                  className="acn-nfc-bt acn-nfc-b869">
                  📋 Copiar URL
                </Botao>
                <a href={urlPublica} target="_blank" rel="noreferrer"
                  className="acn-nfc-a874">
                  🔍 Abrir Página
                </a>
                <Botao onClick={() => setModalTag(true)}
                  className="acn-nfc-bt acn-nfc-b879">
                  🏷️ Gravar Tag NFC
                </Botao>
                {veiculo.manual_pdf_url && (
                  <a href={veiculo.manual_pdf_url} target="_blank" rel="noreferrer"
                    className="acn-nfc-a885">
                    📄 Manual PDF
                  </a>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Portal do Cliente */}
          <div className="acn-nfc-c896">
            <div className="acn-nfc-c898">
              🔗 PORTAL DO CLIENTE — Link de Acesso Direto
            </div>
            {urlPortal ? (
              <>
                <div className="acn-nfc-c903">
                  {urlPortal}
                </div>
                <div className="acn-nfc-c908">
                  <Botao onClick={copiarPortal}
                    className={'acn-nfc-bt acn-nfc-b910' + (copiadoPortal ? ' acn-nfc-b910-2' : ' acn-nfc-b910-3')}>
                    {copiadoPortal ? '✅ Copiado!' : '📋 Copiar Link'}
                  </Botao>
                  <a href={urlPortal} target="_blank" rel="noreferrer"
                    className="acn-nfc-a874">
                    🔍 Abrir Portal
                  </a>
                  <Botao onClick={regenerarToken} disabled={regenerando}
                    className={'acn-nfc-bt acn-nfc-b921' + (regenerando ? ' acn-nfc-b631-2' : ' acn-nfc-b631-3')}>
                    {regenerando ? 'Aguarde...' : '🔄 Novo Link'}
                  </Botao>
                </div>
                <div className="acn-nfc-c927">
                  💡 Envie este link ao cliente — ele dá acesso a chamados, manual e status do veículo sem precisar ler a tag NFC.
                </div>
              </>
            ) : portalToken && !enderecos.portal ? (
              <div className="acn-nfc-c932">
                {enderecos.erro
                  ? `Não foi possível ler o endereço do portal do cliente (${enderecos.erro}); sem ele o link não pode ser montado.`
                  : enderecos.lido
                    ? 'O endereço do portal do cliente ainda não foi configurado (Administração › Configurações do Dossiê NFC); sem ele o link não pode ser montado.'
                    : 'Lendo o endereço do portal do cliente…'}
              </div>
            ) : (
              <div className="acn-nfc-c940">
                Token de portal não encontrado. Execute o SQL <code>portal_cliente.sql</code> no Supabase para gerar automaticamente.
              </div>
            )}
          </div>

          {/* Serviços Instalados */}
          <div className="acn-nfc-c842">
            <div className="acn-nfc-c948">
              <div className="acn-nfc-c949">
                🔧 Serviços / Componentes Instalados
                <span className="acn-nfc-s951">
                  {servicos.length}
                </span>
              </div>
              <Botao onClick={() => setAddingServ(v => !v)}
                className={'acn-nfc-bt acn-nfc-b957' + (addingServ ? ' acn-nfc-b957-2' : ' acn-nfc-b261-2')}>
                {addingServ ? '✕ Cancelar' : '+ Adicionar'}
              </Botao>
            </div>

            {addingServ && (
              <div className="acn-nfc-c965">
                <div className="acn-nfc-c967">
                  <input value={novoServ.item_servico} placeholder="Item / Serviço *"
                    onChange={e => setNovoServ(s => ({...s, item_servico: e.target.value}))}
                    className="acn-nfc-inp970" />
                  <input value={novoServ.categoria} placeholder="Categoria"
                    onChange={e => setNovoServ(s => ({...s, categoria: e.target.value}))}
                    className="acn-nfc-inp970" />
                </div>
                <textarea value={novoServ.descricao_tecnica} placeholder="Descrição técnica (opcional)"
                  rows={2}
                  onChange={e => setNovoServ(s => ({...s, descricao_tecnica: e.target.value}))}
                  className="acn-nfc-ta978" />
                <Botao onClick={adicionarServico} disabled={salvServ}
                  className="acn-nfc-bt acn-nfc-b982">
                  {salvServ ? 'Salvando...' : '✅ Adicionar Serviço'}
                </Botao>
              </div>
            )}

            {erroServ && (
              <div className="acn-nfc-c990">
                <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarServicos()}>Tentar de novo</Botao>}>
                  Não foi possível ler os serviços instalados ({erroServ}). {servLido ? 'A lista abaixo é a última que foi lida.' : 'Isso não quer dizer que não haja serviços cadastrados.'}
                </Faixa>
              </div>
            )}
            {servicos.length === 0 && !addingServ ? (
              servLido ? (
                <div className="acn-nfc-c998">
                  Nenhum serviço cadastrado.
                </div>
              ) : null
            ) : (
              <div className="acn-nfc-c1003">
                {servicos.map(s => (
                  <div key={s.id}
                    className="acn-nfc-c1006">
                    <div className="acn-nfc-c1008">
                      <div className="acn-nfc-c159">
                        {s.item_servico}
                        {s.categoria && (
                          <span className="acn-nfc-s1012">
                            {s.categoria}
                          </span>
                        )}
                      </div>
                      {s.descricao_tecnica && (
                        <div className="acn-nfc-c1019">
                          {s.descricao_tecnica}
                        </div>
                      )}
                    </div>
                    <Botao onClick={() => deletarServico(s.id)}
                      className="acn-nfc-bt acn-nfc-b1025">
                      🗑
                    </Botao>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chamados Recentes */}
          {erroCham && (
            <div className="acn-nfc-c990">
              <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarChamados()}>Tentar de novo</Botao>}>
                Não foi possível ler os chamados de suporte ({erroCham}). O número de chamados abertos acima não pôde ser conferido.
              </Faixa>
            </div>
          )}
          {chamados.length > 0 && (
            <div>
              <div className="acn-nfc-c1045">
                📞 Últimos Chamados de Suporte
              </div>
              {chamados.map(c => (
                <div key={c.id}
                  className="acn-nfc-c1050">
                  <div className="acn-nfc-c1052">
                    <div className="acn-nfc-c1053">
                      {c.nome_solicitante || 'Anônimo'}
                      {c.contato_telefone && <span className="acn-nfc-s1055">
                        {c.contato_telefone}
                      </span>}
                    </div>
                    <span className={('acn-nfc-cst acn-nfc-cst-' + (c.status==='Concluído' ? 'ok' : c.status==='Em Atendimento' ? 'atend' : 'aberto')) + ' acn-nfc-s1059'}>
                      {c.status}
                    </span>
                  </div>
                  {c.descricao_defeito && (
                    <div className="acn-nfc-c1064">
                      {c.descricao_defeito.slice(0, 120)}{c.descricao_defeito.length > 120 ? '...' : ''}
                    </div>
                  )}
                  <div className="acn-nfc-c1068">
                    {new Date(c.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Modal Gravar Tag NFC */}
    {modalTag && (
      <ModalGravarTag
        url={urlPublica}
        chassi={veiculo.chassi}
        onClose={() => setModalTag(false)}
      />
    )}
    </>
  );
}

// ─── MAIN: VeiculosNfcTab ─────────────────────────────────────────────────────

export default function VeiculosNfcTab({ currentUser }) {
  const [veiculos,    setVeiculos]    = useState([]);
  const [carregando,  setCarregando]  = useState(true);
  const [busca,       setBusca]       = useState('');
  const [filtroGar,   setFiltroGar]   = useState(''); // '' | 'ativa' | 'expirada'
  const [detalhe,     setDetalhe]     = useState(null);
  const [modalForm,   setModalForm]   = useState(null); // null | {} (novo) | {...veiculo} (editar)
  const [baseUrl,     setBaseUrl]     = useState('https://seudominio.com.br/veiculo.html');
  const [portalUrl,   setPortalUrl]   = useState('https://seudominio.com.br/portal.html');
  const [enderecos,   setEnderecos]   = useState({ base: false, portal: false, lido: false, erro: '' });   // 7.x: o endereço de exemplo nunca vale como configurado
  const [erroLista,   setErroLista]   = useState('');
  const [listaLida,   setListaLida]   = useState(false);   // 7.x: a leitura recusada não pode parecer "nenhum veículo"
  const isAdmin = ['Admin', 'Gerente', 'Gerente Comercial'].includes(perfilComPoderes(currentUser));

  const carregarVeiculos = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('veiculos_nfc')
      .select('*').eq('ativo', true).order('criado_em', { ascending: false });
    if (error) setErroLista(error.message || 'falha na consulta');   // mantém a última lista lida
    else { setErroLista(''); setListaLida(true); setVeiculos(data || []); }
    setCarregando(false);
  }, []);

  const deletarVeiculo = async (v) => {
    const confirm1 = await confirmar(
      `Excluir o veículo "${v.chassi}"?\n\n` +
      `Isso também irá:\n` +
      `• Excluir todos os serviços cadastrados\n` +
      `• Excluir todos os chamados de suporte\n` +
      `• Invalidar o link do Portal do Cliente\n\n` +
      `Esta ação não pode ser desfeita.`
    );
    if (!confirm1) return;
    const confirm2 = await confirmar(`Confirmar exclusão definitiva do chassi ${v.chassi}?`);
    if (!confirm2) return;

    // Excluir chamados (SET NULL não exclui — apagamos manualmente)
    // 7.x (23/10/2026): se os chamados não saíram, o veículo fica (a confirmação prometeu apagar os dois juntos)
    const { error: erroChamados } = await supabase.from('chamados_suporte').delete().eq('veiculo_id', v.id);
    if (erroChamados) {
      alert('Não foi possível excluir os chamados de suporte do veículo, então o veículo foi mantido: ' + erroChamados.message);
      return;
    }
    // Excluir veículo (cascata para servicos_executados_nfc)
    const { data: apagados, error } = await supabase.from('veiculos_nfc').delete().eq('id', v.id).select('id');

    if (error || !(apagados || []).length) {
      alert('Não foi possível excluir o veículo: ' + (error?.message || 'o banco não apagou nada') + '.');
      carregarVeiculos();
      return;
    }

    // Fechar painel de detalhe se estiver aberto para esse veículo
    setDetalhe(d => (d?.id === v.id ? null : d));
    carregarVeiculos();
  };

  const carregarConfig = useCallback(async () => {
    const { data, error } = await supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['nfc_base_url', 'nfc_portal_url']);
    if (error) { setEnderecos(e => ({ ...e, lido: true, erro: error.message || 'falha na consulta' })); return; }
    let base = false, portal = false;
    (data || []).forEach(r => {
      if (r.chave === 'nfc_base_url'   && r.valor) { setBaseUrl(r.valor); base = true; }
      if (r.chave === 'nfc_portal_url' && r.valor) { setPortalUrl(r.valor); portal = true; }
    });
    setEnderecos({ base, portal, lido: true, erro: '' });
  }, []);

  useEffect(() => { carregarVeiculos(); carregarConfig(); }, [carregarVeiculos, carregarConfig]);

  const desativarVeiculo = async (id) => {
    if (!await confirmar('Desativar este veículo? Ele deixará de aparecer na listagem.')) return;
    await supabase.from('veiculos_nfc').update({ ativo: false }).eq('id', id);
    carregarVeiculos();
  };

  const veiculosFiltrados = veiculos.filter(v => {
    const ok_busca = combinaBusca([v.chassi, v.placa, v.modelo, v.orgao_cliente, v.opl_numero], busca);
    const ativa = calcGarantia(v.data_fim_garantia);
    const ok_gar = !filtroGar ||
      (filtroGar === 'ativa' && ativa === true) ||
      (filtroGar === 'expirada' && ativa === false);
    return ok_busca && ok_gar;
  });

  const totAtiva     = veiculos.filter(v => calcGarantia(v.data_fim_garantia) === true).length;
  const totExpirada  = veiculos.filter(v => calcGarantia(v.data_fim_garantia) === false).length;

  return (
    <div className="acn-nfc-c1184">
      <CabecalhoTela
        titulo="Dossiê NFC veicular"
        subtitulo={<><span className="acn-num">{veiculos.length}</span> veículo(s) · {totAtiva} com garantia ativa · {totExpirada} expirada(s)</>}
        acoes={isAdmin && <Botao variante="primario" icone={mdiPlus} onClick={() => setModalForm({})}>Novo veículo</Botao>}
      />

      {erroLista && (
        <div className="acn-nfc-c1192">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarVeiculos()}>Tentar de novo</Botao>}>
            Não foi possível ler os veículos ({erroLista}). {listaLida ? 'A lista abaixo é a última que foi lida.' : 'Isso não quer dizer que não haja veículos cadastrados.'}
          </Faixa>
        </div>
      )}

      {/* Filtros */}
      <div className="acn-nfc-c1200">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por chassi, placa, modelo, órgão, OP..."
          className="acn-nfc-inp1204" />
        <select value={filtroGar} onChange={e => setFiltroGar(e.target.value)}
          className="acn-nfc-sel1207">
          <option value="">Todas as garantias</option>
          <option value="ativa">Garantia Ativa</option>
          <option value="expirada">Garantia Expirada</option>
        </select>
        <Botao onClick={carregarVeiculos}
          className="acn-nfc-bt acn-nfc-b1213">
          🔄 Atualizar
        </Botao>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div className="acn-nfc-c1221">Carregando...</div>
      ) : veiculosFiltrados.length === 0 ? (
        !listaLida ? null : (
        <div className="acn-nfc-c1224">
          Nenhum veículo encontrado.
          {isAdmin && (
            <div className="acn-nfc-c1227">
              <Botao onClick={() => setModalForm({})}
                className="acn-nfc-bt acn-nfc-b1229">
                ➕ Cadastrar Primeiro Veículo
              </Botao>
            </div>
          )}
        </div>
        )
      ) : (
        <div className="acn-nfc-c1238">
          <div className="acn-nfc-c1239">
            <table className="acn-nfc-tb1240">
              <thead>
                <tr className="acn-nfc-tr1242">
                  {['Chassi / Placa','Modelo','Órgão','OP','Entrega','Garantia','Ação'].map(h => (
                    <th key={h} className="acn-nfc-cel1244">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {veiculosFiltrados.map((v, i) => (
                  <tr key={v.id} className={'acn-nfc-hv acn-nfc-tr1252' + (i%2===0 ? ' acn-nfc-tr1252-2' : ' acn-nfc-tr1252-3')}

                    onClick={() => setDetalhe(v)}>
                    <td className="acn-nfc-td1254">
                      <div className="acn-nfc-c1255">{v.chassi}</div>
                      {v.placa && <div className="acn-nfc-c1256">{v.placa}</div>}
                    </td>
                    <td className="acn-nfc-td1258">
                      {v.modelo || '—'}
                    </td>
                    <td className="acn-nfc-td1261">{v.orgao_cliente || '—'}</td>
                    <td className="acn-nfc-td1262">
                      {v.opl_numero || '—'}
                    </td>
                    <td className="acn-nfc-td1265">
                      {fmtData(v.data_entrega)}
                    </td>
                    <td className="acn-nfc-td1254">
                      <GarantiaBadge dataFim={v.data_fim_garantia} />
                    </td>
                    <td className="acn-nfc-td1254" onClick={e => e.stopPropagation()}>
                      <div className="acn-nfc-c1272">
                        <Botao onClick={() => setDetalhe(v)}
                          className="acn-nfc-bt acn-nfc-b1274">
                          📋 Dossiê
                        </Botao>
                        {isAdmin && (
                          <Botao onClick={() => setModalForm(v)}
                            className="acn-nfc-bt acn-nfc-b1280">
                            ✏️
                          </Botao>
                        )}
                        {isAdmin && (
                          <Botao onClick={() => deletarVeiculo(v)}
                            className="acn-nfc-bt acn-nfc-b1287"
                            title="Excluir veículo e invalidar portal">
                            🗑️
                          </Botao>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modais */}
      {detalhe && (
        <PainelDetalhe
          veiculo={detalhe}
          baseUrl={baseUrl}
          portalBaseUrl={portalUrl}
          enderecos={enderecos}
          isAdmin={isAdmin}
          onEditar={(v) => { setDetalhe(null); setModalForm(v); }}
          onDeletar={(v) => { setDetalhe(null); deletarVeiculo(v); }}
          onClose={() => setDetalhe(null)}
          carregarVeiculos={carregarVeiculos}
        />
      )}
      {modalForm !== null && (
        <ModalVeiculo
          veiculo={modalForm?.id ? modalForm : null}
          onClose={() => setModalForm(null)}
          onSalvo={() => { carregarVeiculos(); }}
        />
      )}
    </div>
  );
}
