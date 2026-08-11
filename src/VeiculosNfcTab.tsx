// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qgemelnuqdilnggxmrdw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcGarantia(dataFim) {
  if (!dataFim) return null;
  const hoje = new Date();
  const fim  = new Date(dataFim + 'T23:59:59');
  return fim >= hoje;
}

function fmtData(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function GarantiaBadge({ dataFim }) {
  const ativa = calcGarantia(dataFim);
  if (ativa === null) return <span style={{ color:'#9ca3af', fontSize:9 }}>Sem data</span>;
  return (
    <span style={{
      background: ativa ? '#dcfce7' : '#fee2e2',
      color:      ativa ? '#16a34a' : '#dc2626',
      border:     `1px solid ${ativa ? '#86efac' : '#fca5a5'}`,
      borderRadius: 10, padding: '2px 8px', fontSize: 9, fontWeight: 700
    }}>
      {ativa ? '✅ Ativa' : '⚠️ Expirada'}
    </span>
  );
}

// ─── Autocomplete de OP/OS ───────────────────────────────────────────────────

const STATUS_COR = {
  'Faturado':           { bg:'#dcfce7', color:'#16a34a' },
  'Aguarda Emissao NF': { bg:'#fef9c3', color:'#92400e' },
  'Em Producao':        { bg:'#dbeafe', color:'#1e40af' },
  'Finalizado':         { bg:'#dcfce7', color:'#16a34a' },
};

function OplAutocomplete({ oplNumero, oplId, onChange }) {
  // onChange(numero, id) — preenche ambos os campos
  const [busca,     setBusca]     = useState(oplNumero || '');
  const [resultados,setResultados]= useState([]);
  const [aberto,    setAberto]    = useState(false);
  const [buscando,  setBuscando]  = useState(false);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pesquisar = (texto) => {
    setBusca(texto);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setResultados([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral, chassi, modelo, data_prevista_entrega')
        .not('status_geral', 'eq', 'Cancelado')
        .or(`opl.ilike.%${texto}%,cliente_nome.ilike.%${texto}%,chassi.ilike.%${texto}%`)
        .order('opl', { ascending: false })
        .limit(10);
      setResultados(data || []);
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
    <div ref={wrapRef} style={{ position:'relative', marginBottom:10 }}>
      <label style={{ fontSize:9, fontWeight:700, color:'#475569', display:'block', marginBottom:3 }}>
        Vincular OP / OS (busca por número ou cliente)
      </label>
      <div style={{ position:'relative' }}>
        <input
          value={busca}
          onChange={e => pesquisar(e.target.value)}
          onFocus={() => busca.length >= 2 && resultados.length > 0 && setAberto(true)}
          placeholder="Ex: OPL-2024-0042 ou Polícia Civil..."
          style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:5,
            padding:'6px 28px 6px 8px', fontSize:10, boxSizing:'border-box', outline:'none' }} />
        {busca && (
          <button onClick={limpar}
            style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:14, lineHeight:1 }}>
            ✕
          </button>
        )}
      </div>

      {/* Seleção atual */}
      {oplId && oplNumero && (
        <div style={{ fontSize:8, color:'#16a34a', fontWeight:700, marginTop:3 }}>
          ✅ Vinculado: {oplNumero} — campos preenchidos automaticamente ↓
        </div>
      )}

      {/* Dropdown */}
      {aberto && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:999,
          background:'#fff', border:'1px solid #e2e8f0', borderRadius:6,
          boxShadow:'0 4px 16px #0002', maxHeight:240, overflowY:'auto' }}>
          {buscando ? (
            <div style={{ padding:'10px 12px', fontSize:10, color:'#9ca3af' }}>Buscando...</div>
          ) : resultados.length === 0 ? (
            <div style={{ padding:'10px 12px', fontSize:10, color:'#9ca3af' }}>Nenhuma OP encontrada.</div>
          ) : resultados.map(r => {
            const cor = STATUS_COR[r.status_geral] || { bg:'#f1f5f9', color:'#475569' };
            return (
              <div key={r.id} onClick={() => selecionar(r)}
                style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}
                onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'}
                onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                <div>
                  <div style={{ fontWeight:700, fontSize:10, color:'#1e293b' }}>{r.opl}</div>
                  <div style={{ fontSize:9, color:'#64748b' }}>{r.cliente_nome}</div>
                  {(r.chassi || r.modelo) && (
                    <div style={{ fontSize:8, color:'#94a3b8', marginTop:1 }}>
                      {[r.chassi && `Chassi: ${r.chassi}`, r.modelo].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span style={{ background:cor.bg, color:cor.color,
                  borderRadius:8, padding:'2px 7px', fontSize:8, fontWeight:700, flexShrink:0, marginLeft:8 }}>
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

  const copiarUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
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
    <div style={{ position:'fixed', inset:0, background:'#0009', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'97vw',
        maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 32px #0004' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#14532d 0%,#16a34a 100%)',
          padding:'14px 16px', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'#86efac', fontSize:9, fontWeight:700 }}>MÓDULO NFC</div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:14 }}>🏷️ Gravar Tag NFC</div>
            <div style={{ color:'#bbf7d0', fontSize:9, marginTop:2 }}>Chassi: {chassi}</div>
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:16 }}>

          {/* URL + QR */}
          <div style={{ background:'#f0fdf4', border:'2px solid #86efac', borderRadius:8,
            padding:'12px 14px', marginBottom:14, display:'flex', gap:12, alignItems:'center' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(url)}`}
              alt="QR Code" width={100} height={100}
              style={{ borderRadius:6, border:'3px solid #16a34a', flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:8, fontWeight:700, color:'#16a34a', marginBottom:4 }}>
                URL A GRAVAR NA ETIQUETA
              </div>
              <div style={{ fontSize:9, color:'#1e293b', wordBreak:'break-all',
                background:'#fff', border:'1px solid #bbf7d0', borderRadius:4, padding:'6px 8px',
                marginBottom:8, fontFamily:'monospace' }}>
                {url}
              </div>
              <button onClick={copiarUrl}
                style={{ background: copiado ? '#16a34a' : '#0369a1', color:'#fff',
                  border:'none', borderRadius:5, padding:'6px 14px', fontSize:9,
                  fontWeight:700, cursor:'pointer', transition:'background .2s' }}>
                {copiado ? '✅ Copiado!' : '📋 Copiar URL'}
              </button>
            </div>
          </div>

          {/* Botão Web NFC API */}
          <div style={{ background:'#1e293b', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
            <div style={{ color:'#94a3b8', fontSize:9, fontWeight:700, marginBottom:6 }}>
              OPÇÃO 1 — GRAVAR DIRETAMENTE (Chrome Android)
            </div>
            <button onClick={gravarViaNfc} disabled={gravando}
              style={{ width:'100%', background: gravando ? '#475569' : '#16a34a',
                color:'#fff', border:'none', borderRadius:6, padding:'12px',
                fontSize:12, fontWeight:800, cursor: gravando ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {gravando
                ? <><span style={{ fontSize:18 }}>📡</span> Aproxime a tag NFC agora...</>
                : <><span style={{ fontSize:18 }}>🏷️</span> Gravar Tag Agora</>}
            </button>
            <div style={{ fontSize:8, color:'#64748b', marginTop:6, textAlign:'center' }}>
              Requer Chrome 89+ no Android · HTTPS · Permissão NFC ativada nas configurações
            </div>

            {resultado === 'ok' && (
              <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:6,
                padding:'8px 12px', marginTop:8, color:'#16a34a', fontWeight:700, fontSize:10 }}>
                ✅ Tag gravada com sucesso! Teste a leitura com o celular.
              </div>
            )}
            {resultado === 'erro' && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6,
                padding:'8px 12px', marginTop:8, color:'#dc2626', fontSize:10 }}>
                ❌ {erroMsg || 'Erro ao gravar. Verifique se o NFC está ativado e tente novamente.'}
              </div>
            )}
            {resultado === 'unsupported' && (
              <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:6,
                padding:'8px 12px', marginTop:8, color:'#92400e', fontSize:10 }}>
                ⚠️ Web NFC não disponível neste navegador. Use o método via NFC Tools abaixo.
              </div>
            )}
          </div>

          {/* Instruções NFC Tools */}
          <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
            <div style={{ background:'#f8fafc', padding:'10px 14px', borderBottom:'1px solid #e2e8f0',
              fontWeight:700, fontSize:11, color:'#1e293b' }}>
              OPÇÃO 2 — Via App NFC Tools (iOS ou Android)
              <span style={{ marginLeft:8, fontSize:9, color:'#64748b', fontWeight:400 }}>
                Download gratuito na App Store / Play Store
              </span>
            </div>
            <div style={{ padding:'12px 14px' }}>
              {passos.map((p, i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start',
                  marginBottom: i < passos.length - 1 ? 10 : 0 }}>
                  <div style={{ width:20, height:20, background:'#16a34a', borderRadius:'50%',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', fontSize:9, fontWeight:800, flexShrink:0, marginTop:1 }}>
                    {p.n}
                  </div>
                  <div style={{ fontSize:10, color:'#374151', lineHeight:1.4 }}>
                    {p.n === 5
                      ? <><span>{p.txt}:</span><br/>
                          <span style={{ fontFamily:'monospace', fontSize:8, color:'#0369a1',
                            wordBreak:'break-all', background:'#eff6ff', padding:'2px 6px',
                            borderRadius:3, display:'inline-block', marginTop:2 }}>
                            {url}
                          </span></>
                      : p.txt}
                  </div>
                </div>
              ))}
              <div style={{ marginTop:12, background:'#fef9c3', border:'1px solid #fde68a',
                borderRadius:5, padding:'6px 10px', fontSize:9, color:'#78350f' }}>
                💡 Dica: Use etiquetas NFC tipo NTAG213 ou NTAG215 — comuns e baratas.
                Capacidade mínima recomendada: 144 bytes (suficiente para a URL).
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding:'0 16px 16px', textAlign:'right' }}>
          <button onClick={onClose}
            style={{ background:'#f1f5f9', border:'none', borderRadius:5,
              padding:'8px 20px', fontSize:10, fontWeight:600, color:'#475569', cursor:'pointer' }}>
            Fechar
          </button>
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

  const calcFimGarantia = (dataEntrega: string, meses: number) => {
    if (!dataEntrega) return '';
    const d = new Date(dataEntrega);
    d.setMonth(d.getMonth() + Number(meses));
    return d.toISOString().slice(0, 10);
  };

  const buscarProdutos = async (q: string) => {
    if (q.length < 2) { setProdResults([]); return; }
    const { data } = await supabase.from('cadastro_produtos')
      .select('id, nome, garantia_meses, codigo')
      .ilike('nome', `%${q}%`)
      .eq('ativo', true)
      .limit(8);
    setProdResults(data || []);
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
    if (!form.chassi.trim()) { alert('Chassi obrigatório.'); return; }
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
      ({ error } = await supabase.from('veiculos_nfc').update(payload).eq('id', veiculo.id));
    } else {
      ({ error } = await supabase.from('veiculos_nfc').insert([payload]));
    }
    setSalvando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    onSalvo();
    onClose();
  };

  const campo = (label, key, type = 'text', extra = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 9, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>
        {label}
      </label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 5,
          padding: '6px 8px', fontSize: 10, boxSizing: 'border-box', outline: 'none' }}
        {...extra} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'95vw',
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background: '#16a34a', borderRadius:'10px 10px 0 0' }}>
          <div style={{ color:'#fff', fontWeight:800, fontSize:13 }}>
            {editando ? '✏️ Editar Veículo' : '➕ Novo Veículo NFC'}
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
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
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <div>{campo('Data de Entrega', 'data_entrega', 'date')}</div>
            <div>{campo('Fim da Garantia (geral)', 'data_fim_garantia', 'date')}</div>
          </div>

          {/* Garantia por produto */}
          <div style={{ marginBottom:12, background:'#f0fdf4', border:'1px solid #86efac', borderRadius:7, padding:10 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'#166534', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
              🛡️ Produtos e Garantias Individuais
            </div>
            {/* Busca de produto */}
            <div style={{ position:'relative', marginBottom:8 }}>
              <input
                value={prodSearch}
                onChange={e => { setProdSearch(e.target.value); buscarProdutos(e.target.value); }}
                placeholder="Buscar produto para adicionar..."
                style={{ width:'100%', border:'1px solid #86efac', borderRadius:5,
                  padding:'5px 8px', fontSize:10, boxSizing:'border-box', outline:'none' }}
              />
              {prodResults.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff',
                  border:'1px solid #d1d5db', borderRadius:5, zIndex:10, boxShadow:'0 4px 12px #0002', maxHeight:160, overflowY:'auto' }}>
                  {prodResults.map(p => (
                    <div key={p.id} onClick={() => addProduto(p)}
                      style={{ padding:'6px 10px', fontSize:10, cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}
                      onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                      <span>{p.nome}</span>
                      <span style={{ color:'#16a34a', fontWeight:700, fontSize:9 }}>{p.garantia_meses || 12} meses</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Lista de produtos com garantia */}
            {prodGar.length === 0 ? (
              <div style={{ fontSize:9, color:'#86efac', textAlign:'center', padding:'6px 0' }}>
                Nenhum produto adicionado ainda
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
                <thead>
                  <tr style={{ background:'#dcfce7' }}>
                    <th style={{ padding:'4px 6px', textAlign:'left', fontWeight:700, color:'#166534' }}>Produto</th>
                    <th style={{ padding:'4px 6px', textAlign:'center', fontWeight:700, color:'#166534', width:90 }}>Garantia</th>
                    <th style={{ padding:'4px 6px', textAlign:'center', fontWeight:700, color:'#166534', width:90 }}>Vence em</th>
                    <th style={{ width:24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {prodGar.map((p, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #d1fae5' }}>
                      <td style={{ padding:'4px 6px', color:'#166534' }}>{p.produto_nome}</td>
                      <td style={{ padding:'4px 6px', textAlign:'center' }}>
                        <select value={p.garantia_meses}
                          onChange={e => updateProdGar(i, Number(e.target.value))}
                          style={{ border:'1px solid #86efac', borderRadius:4, padding:'2px 4px', fontSize:9, color:'#166534', background:'#fff' }}>
                          <option value={6}>6 meses</option>
                          <option value={12}>12 meses</option>
                          <option value={24}>24 meses</option>
                          <option value={60}>60 meses</option>
                        </select>
                      </td>
                      <td style={{ padding:'4px 6px', textAlign:'center', fontWeight:700, color: p.data_fim_garantia ? '#166534' : '#9ca3af' }}>
                        {p.data_fim_garantia ? new Date(p.data_fim_garantia).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding:'2px' }}>
                        <button onClick={() => setProdGar(g => g.filter((_, j) => j !== i))}
                          style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:12, lineHeight:1 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!form.data_entrega && prodGar.length > 0 && (
              <div style={{ fontSize:9, color:'#d97706', marginTop:6 }}>
                ⚠️ Defina a Data de Entrega para calcular os vencimentos automaticamente
              </div>
            )}
          </div>

          {campo('URL do Manual PDF', 'manual_pdf_url', 'url', { placeholder:'https://...' })}
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:9, fontWeight:700, color:'#475569', display:'block', marginBottom:3 }}>
              PIN de Acesso Restrito
            </label>
            <input type="text" maxLength={10} value={form.pin_acesso}
              onChange={e => set('pin_acesso', e.target.value)}
              placeholder="Ex: 123456"
              style={{ width:120, border:'1px solid #d1d5db', borderRadius:5,
                padding:'6px 8px', fontSize:11, fontWeight:700, letterSpacing:4, textAlign:'center' }} />
            <span style={{ marginLeft:8, fontSize:9, color:'#9ca3af' }}>
              Deixe "123456" para usar o PIN global
            </span>
          </div>
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ background:'#f1f5f9', border:'none', borderRadius:5,
              padding:'7px 16px', fontSize:10, color:'#475569', cursor:'pointer', fontWeight:600 }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ background:'#16a34a', color:'#fff', border:'none',
              borderRadius:5, padding:'7px 18px', fontSize:10, fontWeight:700,
              cursor:'pointer', opacity: salvando ? .5 : 1 }}>
            {salvando ? 'Salvando...' : editando ? '✏️ Atualizar' : '✅ Salvar Veículo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Detalhe do Veículo ─────────────────────────────────────────────

function PainelDetalhe({ veiculo, baseUrl, portalBaseUrl, isAdmin, onEditar, onDeletar, onClose, carregarVeiculos }) {
  const [servicos, setServicos] = useState([]);
  const [chamados, setChamados] = useState([]);
  const [novoServ, setNovoServ] = useState({ item_servico:'', descricao_tecnica:'', categoria:'' });
  const [addingServ, setAddingServ] = useState(false);
  const [salvServ,  setSalvServ]  = useState(false);
  const [modalTag, setModalTag] = useState(false);
  const [copiadoPortal, setCopiadoPortal] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [portalToken, setPortalToken] = useState(veiculo.portal_token || '');

  const urlPublica  = `${baseUrl}?chassi=${encodeURIComponent(veiculo.chassi)}`;
  const urlPortal   = portalToken ? `${portalBaseUrl}?token=${portalToken}` : null;

  const copiarPortal = () => {
    if (!urlPortal) return;
    navigator.clipboard.writeText(urlPortal).then(() => {
      setCopiadoPortal(true);
      setTimeout(() => setCopiadoPortal(false), 2000);
    });
  };

  const regenerarToken = async () => {
    if (!confirm('Regenerar o token invalida o link antigo. Confirma?')) return;
    setRegenerando(true);
    const novoToken = crypto.randomUUID();
    const { error } = await supabase.from('veiculos_nfc')
      .update({ portal_token: novoToken }).eq('id', veiculo.id);
    if (!error) {
      setPortalToken(novoToken);
      alert('Novo link gerado! Copie e envie ao cliente.');
    } else {
      alert('Erro ao regenerar token: ' + error.message);
    }
    setRegenerando(false);
  };

  const carregarServicos = useCallback(async () => {
    const { data } = await supabase.from('servicos_executados_nfc')
      .select('*').eq('veiculo_id', veiculo.id).order('ordem').order('criado_em');
    setServicos(data || []);
  }, [veiculo.id]);

  const carregarChamados = useCallback(async () => {
    const { data } = await supabase.from('chamados_suporte')
      .select('*').eq('veiculo_id', veiculo.id).order('created_at', { ascending:false }).limit(5);
    setChamados(data || []);
  }, [veiculo.id]);

  useEffect(() => { carregarServicos(); carregarChamados(); }, [carregarServicos, carregarChamados]);

  const adicionarServico = async () => {
    if (!novoServ.item_servico.trim()) return;
    setSalvServ(true);
    await supabase.from('servicos_executados_nfc').insert([{
      veiculo_id:        veiculo.id,
      item_servico:      novoServ.item_servico.trim(),
      descricao_tecnica: novoServ.descricao_tecnica.trim() || null,
      categoria:         novoServ.categoria.trim() || null,
    }]);
    setNovoServ({ item_servico:'', descricao_tecnica:'', categoria:'' });
    setAddingServ(false);
    setSalvServ(false);
    carregarServicos();
  };

  const deletarServico = async (id) => {
    if (!confirm('Remover este serviço?')) return;
    await supabase.from('servicos_executados_nfc').delete().eq('id', id);
    carregarServicos();
  };

  const copiarUrl = () => {
    navigator.clipboard.writeText(urlPublica);
    alert('URL copiada!');
  };

  const garantiaAtiva = calcGarantia(veiculo.data_fim_garantia);

  return (
    <>
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1900,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:640, maxWidth:'97vw',
        maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 32px #0003' }}>

        {/* Header */}
        <div style={{ background:'#14532d', padding:'14px 16px', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ color:'#86efac', fontSize:10, fontWeight:700, marginBottom:2 }}>
              DOSSIÊ NFC
            </div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:14 }}>{veiculo.modelo || veiculo.chassi}</div>
            <div style={{ color:'#bbf7d0', fontSize:9, marginTop:2 }}>
              Chassi: {veiculo.chassi}
              {veiculo.placa && ` · Placa: ${veiculo.placa}`}
              {veiculo.orgao_cliente && ` · ${veiculo.orgao_cliente}`}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={() => onEditar(veiculo)}
              style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:5,
                padding:'5px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
              ✏️ Editar
            </button>
            {isAdmin && (
              <button onClick={() => onDeletar(veiculo)}
                style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:5,
                  padding:'5px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}
                title="Excluir veículo e invalidar portal do cliente">
                🗑️ Excluir
              </button>
            )}
            <button onClick={onClose}
              style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:16 }}>
          {/* Info principal */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
            {[
              { label:'Garantia', val: <GarantiaBadge dataFim={veiculo.data_fim_garantia} /> },
              { label:'Entrega',  val: fmtData(veiculo.data_entrega) },
              { label:'Fim Garantia', val: fmtData(veiculo.data_fim_garantia) },
              { label:'OPL',      val: veiculo.opl_numero || '—' },
              { label:'PIN Restrita', val: veiculo.pin_acesso || '123456', mono: true },
              { label:'Chamados abertos', val: chamados.filter(c=>c.status==='Aberto').length },
            ].map(({ label, val, mono }) => (
              <div key={label} style={{ background:'#f8fafc', border:'1px solid #e2e8f0',
                borderRadius:6, padding:'8px 10px' }}>
                <div style={{ fontSize:8, color:'#94a3b8', fontWeight:700, marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#1e293b',
                  fontFamily: mono ? 'monospace' : 'inherit', letterSpacing: mono ? 2 : 0 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* Garantias por produto */}
          {(veiculo.produtos_instalados || []).length > 0 && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8,
              padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:800, color:'#166534', textTransform:'uppercase',
                letterSpacing:'.5px', marginBottom:8 }}>🛡️ Garantias por Produto</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
                <thead>
                  <tr style={{ background:'#dcfce7' }}>
                    <th style={{ padding:'3px 6px', textAlign:'left', color:'#166534', fontWeight:700 }}>Produto</th>
                    <th style={{ padding:'3px 6px', textAlign:'center', color:'#166534', fontWeight:700, width:70 }}>Meses</th>
                    <th style={{ padding:'3px 6px', textAlign:'center', color:'#166534', fontWeight:700, width:90 }}>Vence em</th>
                    <th style={{ padding:'3px 6px', textAlign:'center', color:'#166534', fontWeight:700, width:70 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(veiculo.produtos_instalados || []).map((p, i) => {
                    const ativa = p.data_fim_garantia ? new Date(p.data_fim_garantia) > new Date() : null;
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #d1fae5' }}>
                        <td style={{ padding:'4px 6px', color:'#1e293b' }}>{p.produto_nome}</td>
                        <td style={{ padding:'4px 6px', textAlign:'center', color:'#64748b' }}>{p.garantia_meses}m</td>
                        <td style={{ padding:'4px 6px', textAlign:'center', fontWeight:700,
                          color: ativa === false ? '#dc2626' : '#166534' }}>
                          {p.data_fim_garantia ? new Date(p.data_fim_garantia).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td style={{ padding:'4px 6px', textAlign:'center' }}>
                          {ativa === true && <span style={{ background:'#dcfce7', color:'#166534', fontWeight:700, fontSize:8, padding:'1px 6px', borderRadius:10 }}>✅ Ativa</span>}
                          {ativa === false && <span style={{ background:'#fee2e2', color:'#dc2626', fontWeight:700, fontSize:8, padding:'1px 6px', borderRadius:10 }}>⚠️ Expirada</span>}
                          {ativa === null && <span style={{ color:'#9ca3af', fontSize:8 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* QR Code + URL */}
          <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8,
            padding:'12px 14px', marginBottom:14, display:'flex', gap:14, alignItems:'center' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(urlPublica)}`}
              alt="QR Code NFC" width={90} height={90}
              style={{ borderRadius:6, border:'3px solid #16a34a', flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#16a34a', marginBottom:4 }}>
                🔗 URL PÚBLICA NFC
              </div>
              <div style={{ fontSize:9, color:'#374151', wordBreak:'break-all',
                background:'#fff', borderRadius:4, padding:'4px 8px', border:'1px solid #bbf7d0',
                marginBottom:8 }}>
                {urlPublica}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={copiarUrl}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                  📋 Copiar URL
                </button>
                <a href={urlPublica} target="_blank" rel="noreferrer"
                  style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 10px', fontSize:9, fontWeight:700, textDecoration:'none' }}>
                  🔍 Abrir Página
                </a>
                <button onClick={() => setModalTag(true)}
                  style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                  🏷️ Gravar Tag NFC
                </button>
                {veiculo.manual_pdf_url && (
                  <a href={veiculo.manual_pdf_url} target="_blank" rel="noreferrer"
                    style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:4,
                      padding:'5px 10px', fontSize:9, fontWeight:700, textDecoration:'none' }}>
                    📄 Manual PDF
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Portal do Cliente */}
          <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:8,
            padding:'12px 14px', marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#7c3aed', marginBottom:6 }}>
              🔗 PORTAL DO CLIENTE — Link de Acesso Direto
            </div>
            {urlPortal ? (
              <>
                <div style={{ fontSize:9, color:'#374151', wordBreak:'break-all',
                  background:'#fff', borderRadius:4, padding:'4px 8px',
                  border:'1px solid #c4b5fd', marginBottom:8 }}>
                  {urlPortal}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button onClick={copiarPortal}
                    style={{ background: copiadoPortal ? '#7c3aed' : '#6d28d9', color:'#fff',
                      border:'none', borderRadius:4, padding:'5px 10px', fontSize:9,
                      fontWeight:700, cursor:'pointer', transition:'background .2s' }}>
                    {copiadoPortal ? '✅ Copiado!' : '📋 Copiar Link'}
                  </button>
                  <a href={urlPortal} target="_blank" rel="noreferrer"
                    style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
                      padding:'5px 10px', fontSize:9, fontWeight:700, textDecoration:'none' }}>
                    🔍 Abrir Portal
                  </a>
                  <button onClick={regenerarToken} disabled={regenerando}
                    style={{ background:'#f1f5f9', color:'#475569', border:'1px solid #d1d5db',
                      borderRadius:4, padding:'5px 10px', fontSize:9,
                      fontWeight:700, cursor:'pointer', opacity: regenerando ? .5 : 1 }}>
                    {regenerando ? 'Aguarde...' : '🔄 Novo Link'}
                  </button>
                </div>
                <div style={{ fontSize:8, color:'#7c3aed', marginTop:6 }}>
                  💡 Envie este link ao cliente — ele dá acesso a chamados, manual e status do veículo sem precisar ler a tag NFC.
                </div>
              </>
            ) : (
              <div style={{ fontSize:10, color:'#64748b' }}>
                Token de portal não encontrado. Execute o SQL <code>portal_cliente.sql</code> no Supabase para gerar automaticamente.
              </div>
            )}
          </div>

          {/* Serviços Instalados */}
          <div style={{ marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontWeight:700, fontSize:11, color:'#1e293b' }}>
                🔧 Serviços / Componentes Instalados
                <span style={{ marginLeft:6, background:'#e2e8f0', borderRadius:10,
                  padding:'1px 7px', fontSize:9, color:'#475569' }}>
                  {servicos.length}
                </span>
              </div>
              <button onClick={() => setAddingServ(v => !v)}
                style={{ background: addingServ ? '#dc2626' : '#16a34a', color:'#fff',
                  border:'none', borderRadius:5, padding:'5px 10px',
                  fontSize:9, fontWeight:700, cursor:'pointer' }}>
                {addingServ ? '✕ Cancelar' : '+ Adicionar'}
              </button>
            </div>

            {addingServ && (
              <div style={{ background:'#f0fdf4', border:'1px solid #86efac',
                borderRadius:6, padding:10, marginBottom:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:6, marginBottom:6 }}>
                  <input value={novoServ.item_servico} placeholder="Item / Serviço *"
                    onChange={e => setNovoServ(s => ({...s, item_servico: e.target.value}))}
                    style={{ border:'1px solid #d1d5db', borderRadius:4, padding:'5px 8px', fontSize:10 }} />
                  <input value={novoServ.categoria} placeholder="Categoria"
                    onChange={e => setNovoServ(s => ({...s, categoria: e.target.value}))}
                    style={{ border:'1px solid #d1d5db', borderRadius:4, padding:'5px 8px', fontSize:10 }} />
                </div>
                <textarea value={novoServ.descricao_tecnica} placeholder="Descrição técnica (opcional)"
                  rows={2}
                  onChange={e => setNovoServ(s => ({...s, descricao_tecnica: e.target.value}))}
                  style={{ width:'100%', border:'1px solid #d1d5db', borderRadius:4,
                    padding:'5px 8px', fontSize:10, boxSizing:'border-box', resize:'vertical',
                    marginBottom:6, fontFamily:'inherit' }} />
                <button onClick={adicionarServico} disabled={salvServ}
                  style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:4,
                    padding:'5px 12px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                  {salvServ ? 'Salvando...' : '✅ Adicionar Serviço'}
                </button>
              </div>
            )}

            {servicos.length === 0 && !addingServ ? (
              <div style={{ textAlign:'center', padding:16, color:'#9ca3af', fontSize:10 }}>
                Nenhum serviço cadastrado.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {servicos.map(s => (
                  <div key={s.id}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                      background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:'7px 10px' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:10, color:'#1e293b' }}>
                        {s.item_servico}
                        {s.categoria && (
                          <span style={{ marginLeft:6, background:'#dbeafe', color:'#1e40af',
                            borderRadius:8, padding:'1px 7px', fontSize:8, fontWeight:600 }}>
                            {s.categoria}
                          </span>
                        )}
                      </div>
                      {s.descricao_tecnica && (
                        <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>
                          {s.descricao_tecnica}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deletarServico(s.id)}
                      style={{ background:'#fee2e2', color:'#dc2626', border:'none',
                        borderRadius:4, padding:'3px 7px', fontSize:9, cursor:'pointer', marginLeft:8 }}>
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chamados Recentes */}
          {chamados.length > 0 && (
            <div>
              <div style={{ fontWeight:700, fontSize:11, color:'#1e293b', marginBottom:8 }}>
                📞 Últimos Chamados de Suporte
              </div>
              {chamados.map(c => (
                <div key={c.id}
                  style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6,
                    padding:'7px 10px', marginBottom:4 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#1e293b' }}>
                      {c.nome_solicitante || 'Anônimo'}
                      {c.contato_telefone && <span style={{ fontWeight:400, color:'#64748b', marginLeft:6 }}>
                        {c.contato_telefone}
                      </span>}
                    </div>
                    <span style={{
                      background: c.status==='Concluído' ? '#dcfce7' : c.status==='Em Atendimento' ? '#fef9c3' : '#fee2e2',
                      color:      c.status==='Concluído' ? '#16a34a' : c.status==='Em Atendimento' ? '#92400e' : '#dc2626',
                      borderRadius:8, padding:'2px 8px', fontSize:8, fontWeight:700
                    }}>
                      {c.status}
                    </span>
                  </div>
                  {c.descricao_defeito && (
                    <div style={{ fontSize:9, color:'#475569', marginTop:3 }}>
                      {c.descricao_defeito.slice(0, 120)}{c.descricao_defeito.length > 120 ? '...' : ''}
                    </div>
                  )}
                  <div style={{ fontSize:8, color:'#9ca3af', marginTop:2 }}>
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
  const isAdmin = ['Admin', 'Gerente', 'Gerente Comercial'].includes(currentUser?.perfil);

  const carregarVeiculos = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.from('veiculos_nfc')
      .select('*').eq('ativo', true).order('criado_em', { ascending: false });
    setVeiculos(data || []);
    setCarregando(false);
  }, []);

  const deletarVeiculo = async (v) => {
    const confirm1 = window.confirm(
      `⚠️ Excluir o veículo "${v.chassi}"?\n\n` +
      `Isso também irá:\n` +
      `• Excluir todos os serviços cadastrados\n` +
      `• Excluir todos os chamados de suporte\n` +
      `• Invalidar o link do Portal do Cliente\n\n` +
      `Esta ação não pode ser desfeita.`
    );
    if (!confirm1) return;
    const confirm2 = window.confirm(`Confirmar exclusão definitiva do chassi ${v.chassi}?`);
    if (!confirm2) return;

    // Excluir chamados (SET NULL não exclui — apagamos manualmente)
    await supabase.from('chamados_suporte').delete().eq('veiculo_id', v.id);
    // Excluir veículo (cascata para servicos_executados_nfc)
    const { error } = await supabase.from('veiculos_nfc').delete().eq('id', v.id);

    if (error) {
      alert('Erro ao excluir: ' + error.message);
      return;
    }

    // Fechar painel de detalhe se estiver aberto para esse veículo
    setDetalhe(d => (d?.id === v.id ? null : d));
    carregarVeiculos();
  };

  const carregarConfig = useCallback(async () => {
    const { data } = await supabase.from('configuracoes_sistema')
      .select('chave,valor')
      .in('chave', ['nfc_base_url', 'nfc_portal_url']);
    (data || []).forEach(r => {
      if (r.chave === 'nfc_base_url'   && r.valor) setBaseUrl(r.valor);
      if (r.chave === 'nfc_portal_url' && r.valor) setPortalUrl(r.valor);
    });
  }, []);

  useEffect(() => { carregarVeiculos(); carregarConfig(); }, [carregarVeiculos, carregarConfig]);

  const desativarVeiculo = async (id) => {
    if (!confirm('Desativar este veículo? Ele deixará de aparecer na listagem.')) return;
    await supabase.from('veiculos_nfc').update({ ativo: false }).eq('id', id);
    carregarVeiculos();
  };

  const veiculosFiltrados = veiculos.filter(v => {
    const q = busca.toLowerCase();
    const ok_busca = !busca ||
      (v.chassi||'').toLowerCase().includes(q) ||
      (v.placa||'').toLowerCase().includes(q) ||
      (v.modelo||'').toLowerCase().includes(q) ||
      (v.orgao_cliente||'').toLowerCase().includes(q) ||
      (v.opl_numero||'').toLowerCase().includes(q);
    const ativa = calcGarantia(v.data_fim_garantia);
    const ok_gar = !filtroGar ||
      (filtroGar === 'ativa' && ativa === true) ||
      (filtroGar === 'expirada' && ativa === false);
    return ok_busca && ok_gar;
  });

  const totAtiva     = veiculos.filter(v => calcGarantia(v.data_fim_garantia) === true).length;
  const totExpirada  = veiculos.filter(v => calcGarantia(v.data_fim_garantia) === false).length;

  return (
    <div style={{ padding:'0 0 24px', fontFamily:'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#14532d', borderRadius:8, padding:'14px 16px', marginBottom:12,
        display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ color:'#86efac', fontSize:10, fontWeight:700, marginBottom:2 }}>
            ACN SINAL VERDE
          </div>
          <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>
            📱 Dossiê NFC Veicular
          </div>
          <div style={{ color:'#bbf7d0', fontSize:9, marginTop:2 }}>
            {veiculos.length} veículo(s) · {totAtiva} com garantia ativa · {totExpirada} expirada(s)
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setModalForm({})}
            style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6,
              padding:'8px 16px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            ➕ Novo Veículo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8,
        padding:'10px 12px', marginBottom:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por chassi, placa, modelo, órgão, OPL..."
          style={{ flex:'1 1 260px', border:'1px solid #d1d5db', borderRadius:5,
            padding:'6px 10px', fontSize:10, outline:'none' }} />
        <select value={filtroGar} onChange={e => setFiltroGar(e.target.value)}
          style={{ border:'1px solid #d1d5db', borderRadius:5, padding:'6px 10px', fontSize:10 }}>
          <option value="">Todas as garantias</option>
          <option value="ativa">✅ Garantia Ativa</option>
          <option value="expirada">⚠️ Garantia Expirada</option>
        </select>
        <button onClick={carregarVeiculos}
          style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:5,
            padding:'6px 12px', fontSize:9, color:'#475569', cursor:'pointer' }}>
          🔄 Atualizar
        </button>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>Carregando...</div>
      ) : veiculosFiltrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:11 }}>
          Nenhum veículo encontrado.
          {isAdmin && (
            <div style={{ marginTop:12 }}>
              <button onClick={() => setModalForm({})}
                style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6,
                  padding:'8px 18px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                ➕ Cadastrar Primeiro Veículo
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
              <thead>
                <tr style={{ background:'#14532d', color:'#bbf7d0' }}>
                  {['Chassi / Placa','Modelo','Órgão','OPL','Entrega','Garantia','Ação'].map(h => (
                    <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600,
                      whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {veiculosFiltrados.map((v, i) => (
                  <tr key={v.id}
                    style={{ background: i%2===0?'#fff':'#f8fafc', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f0fdf4'}
                    onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#f8fafc'}
                    onClick={() => setDetalhe(v)}>
                    <td style={{ padding:'7px 10px' }}>
                      <div style={{ fontWeight:700, color:'#1e293b', fontSize:10 }}>{v.chassi}</div>
                      {v.placa && <div style={{ fontSize:8, color:'#64748b' }}>{v.placa}</div>}
                    </td>
                    <td style={{ padding:'7px 10px', color:'#374151', maxWidth:180, wordBreak:'break-word' }}>
                      {v.modelo || '—'}
                    </td>
                    <td style={{ padding:'7px 10px', color:'#374151' }}>{v.orgao_cliente || '—'}</td>
                    <td style={{ padding:'7px 10px', color:'#0369a1', fontWeight:600 }}>
                      {v.opl_numero || '—'}
                    </td>
                    <td style={{ padding:'7px 10px', color:'#475569', whiteSpace:'nowrap' }}>
                      {fmtData(v.data_entrega)}
                    </td>
                    <td style={{ padding:'7px 10px' }}>
                      <GarantiaBadge dataFim={v.data_fim_garantia} />
                    </td>
                    <td style={{ padding:'7px 10px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => setDetalhe(v)}
                          style={{ background:'#0369a1', color:'#fff', border:'none', borderRadius:4,
                            padding:'4px 8px', fontSize:8, fontWeight:700, cursor:'pointer' }}>
                          📋 Dossiê
                        </button>
                        {isAdmin && (
                          <button onClick={() => setModalForm(v)}
                            style={{ background:'#f59e0b', color:'#fff', border:'none', borderRadius:4,
                              padding:'4px 8px', fontSize:8, fontWeight:700, cursor:'pointer' }}>
                            ✏️
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => deletarVeiculo(v)}
                            style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:4,
                              padding:'4px 8px', fontSize:8, fontWeight:700, cursor:'pointer' }}
                            title="Excluir veículo e invalidar portal">
                            🗑️
                          </button>
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
