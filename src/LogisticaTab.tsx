// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { notificarEvento } from './whatsappHelper';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { resolverMencoesRespondidas } from './MencaoTextarea';


const TIPOS_MANIFESTO = ['Recebimento','Envio','Transferencia'];
const TIPOS_MERCADORIA = ['Equipamento','Pecas','Materiais','Documentos','Outros'];

const FORM_VAZIO = {
  tipo: 'Recebimento', data: new Date().toISOString().split('T')[0],
  remetente: '', destinatario: '', tipo_mercadoria: 'Equipamento',
  descricao: '', quantidade: '', peso: '', nf_referencia: '', veiculo_placa: '', observacoes: '',
  pedido_compra_id: '',
  seriais: '', volume: '', nf_conferida: false,
};

// ─── Relatório de Movimentação (IN/OUT) por Período e Tipo ───────────────────
function RelatorioLogistica() {
  const [de, setDe]     = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; });
  const [ate, setAte]   = useState(() => new Date().toISOString().split('T')[0]);
  const [tipo, setTipo] = useState('Todos');
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setCarregando(true);
    let q = supabase.from('logistica_manifestos').select('*')
      .gte('data', de).lte('data', ate).order('data', { ascending: false });
    if (tipo !== 'Todos') q = q.eq('tipo', tipo);
    const { data } = await q;
    setDados(data || []);
    setCarregando(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const corTipo = (t) => ({ Recebimento:'#22c55e', Envio:'#3b82f6', Transferencia:'#f59e0b' })[t] || '#94a3b8';

  const recebimentos   = dados.filter(m => m.tipo === 'Recebimento');
  const envios         = dados.filter(m => m.tipo === 'Envio');
  const transferencias = dados.filter(m => m.tipo === 'Transferencia');
  const somaQtd  = (lista) => lista.reduce((a,m)=>a+(Number(m.quantidade)||0),0);
  const somaPeso = (lista) => lista.reduce((a,m)=>a+(Number(m.peso)||0),0);
  const saldoQtd = somaQtd(recebimentos) - somaQtd(envios);

  // Agrupado por tipo de mercadoria
  const porMercadoria = dados.reduce((acc,m) => {
    const k = m.tipo_mercadoria || 'Outros';
    if (!acc[k]) acc[k] = { in:0, out:0, transf:0, qtdIn:0, qtdOut:0 };
    if (m.tipo === 'Recebimento')       { acc[k].in++;    acc[k].qtdIn  += Number(m.quantidade)||0; }
    else if (m.tipo === 'Envio')        { acc[k].out++;   acc[k].qtdOut += Number(m.quantidade)||0; }
    else if (m.tipo === 'Transferencia') acc[k].transf++;
    return acc;
  }, {});

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Filtros do Relatório</span></div>
        <div className="sec-body">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={de} onChange={e=>setDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={ate} onChange={e=>setAte(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Tipo</label>
              <select className="acn-input" style={{width:'100%'}} value={tipo} onChange={e=>setTipo(e.target.value)}>
                <option value="Todos">Todos</option>
                {TIPOS_MANIFESTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button className="acn-btn" style={{background:'#1e293b'}} onClick={buscar}>Filtrar</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Totais do Período</span></div>
        <div className="sec-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[
              {label:'Recebimentos (IN)',    val:recebimentos.length,   sub:`${somaQtd(recebimentos)} un. · ${somaPeso(recebimentos).toFixed(1)} kg`, cor:'#22c55e'},
              {label:'Envios (OUT)',         val:envios.length,         sub:`${somaQtd(envios)} un. · ${somaPeso(envios).toFixed(1)} kg`,             cor:'#3b82f6'},
              {label:'Transferências',       val:transferencias.length, sub:`${somaQtd(transferencias)} un.`,                                          cor:'#f59e0b'},
              {label:'Saldo (IN − OUT)',     val:`${saldoQtd>=0?'+':''}${saldoQtd}`, sub:'unidades',                                                    cor:saldoQtd>=0?'#16a34a':'#dc2626'},
              {label:'Total de Movimentos',  val:dados.length,          sub:`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`, cor:'#1e293b'},
            ].map(c => (
              <div key={c.label} style={{flex:'1 1 160px',minWidth:140,background:'white',border:'1px solid #e2e8f0',borderTop:`3px solid ${c.cor}`,borderRadius:4,padding:'8px 10px'}}>
                <div style={{fontSize:9,color:'#64748b',marginBottom:2}}>{c.label}</div>
                <div style={{fontSize:20,fontWeight:700,color:c.cor}}>{carregando?'...':c.val}</div>
                <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por Tipo de Mercadoria</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> : Object.keys(porMercadoria).length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table>
              <thead><tr><th>Mercadoria</th><th>Recebimentos</th><th>Qtd. Recebida</th><th>Envios</th><th>Qtd. Enviada</th><th>Transferências</th></tr></thead>
              <tbody>
                {Object.entries(porMercadoria).map(([k,v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td style={{color:'#22c55e',fontWeight:700}}>{v.in}</td>
                    <td>{v.qtdIn} un.</td>
                    <td style={{color:'#3b82f6',fontWeight:700}}>{v.out}</td>
                    <td>{v.qtdOut} un.</td>
                    <td style={{color:'#f59e0b',fontWeight:700}}>{v.transf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Movimentos do Período ({dados.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {carregando ? <div className="acn-empty">Carregando...</div> : dados.length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table>
              <thead><tr><th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatário</th><th>Mercadoria</th><th>Qtd</th></tr></thead>
              <tbody>
                {dados.map(m => (
                  <tr key={m.id}>
                    <td>{fmtDt(m.data)}</td>
                    <td><span className="acn-badge" style={{background:corTipo(m.tipo)}}>{m.tipo}</span></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td>{m.tipo_mercadoria}: {m.descricao}</td>
                    <td>{m.quantidade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fretes (Fase 4) — cotação de transportadoras + linha do tempo até Entregue ──
const VAZIO_FRETE = {
  direcao: 'inbound', descricao: '', origem: '', destino: '', data_prevista: '', pedido_compra_id: '',
  // Dados fiscais/logísticos do transporte
  cnpj_cpf_pagador: '', cep_origem: '', cep_destino: '',
  cnpj_cpf_remetente: '', cnpj_cpf_destinatario: '',
  valor_nota: '', quantidade_volumes: '', peso_total: '',
  medida_altura: '', medida_largura: '', medida_comprimento: '',
  // Vínculo a processo (OP/OS ou Licitação) — null = motivo só em texto livre (descricao)
  vinculo_tipo: null, vinculo_id: null, vinculo_desc: '',
};
const VAZIO_COTACAO_FRETE = { transportadora_nome: '', valor: '', condicao_pagamento: '', prazo_entrega: '' };

async function uploadArquivoFrete(file: File, pasta: string): Promise<{ url: string; nome: string; error?: string }> {
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${pasta}/${Date.now()}_${nomeLimpo}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return { url: '', nome: '', error: error?.message || 'Falha desconhecida ao enviar.' };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  if (!pub?.publicUrl) return { url: '', nome: '', error: 'Não foi possível gerar o link público do arquivo.' };
  return { url: pub.publicUrl, nome: file.name };
}

const btn: React.CSSProperties = {padding:'5px 9px',border:'none',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer'};

const COR_FRETE: Record<string,string> = {
  'Cotação':'#94a3b8', 'Aguardando Aprovação':'#ea580c', 'Em Trânsito':'#3b82f6', 'Entregue':'#22c55e', 'Cancelado':'#ef4444',
};

// ─── Autocomplete de OP/OS — vínculo do frete a um processo (mesmo padrão de
// OplAutocomplete em FormacaoPrecosTab.tsx) ──────────────────────────────────
function OplAutocompleteFrete({ value, onSelect }: any) {
  const [query, setQuery]       = useState(value || '');
  const [resultados, setRes]    = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef<any>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const buscar = (texto: string) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .or(`opl.ilike.%${texto}%,cliente_nome.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (op: any) => {
    setQuery(op.opl);
    setAberto(false);
    setRes([]);
    onSelect(op);
  };

  return (
    <div style={{ position:'relative' }}>
      <input className="acn-input" style={{ width:'100%' }}
        placeholder="Buscar OP/OS por número ou cliente..."
        value={query}
        onChange={e => buscar(e.target.value)}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)} />
      {aberto && (
        <div style={{ position:'absolute', zIndex:20, top:'100%', left:0, right:0, background:'#fff',
          border:'1px solid #e2e8f0', borderRadius:6, boxShadow:'0 4px 12px #0002', maxHeight:220, overflowY:'auto' }}>
          {buscando && <div style={{ padding:8, fontSize:10, color:'#94a3b8' }}>Buscando...</div>}
          {!buscando && resultados.length === 0 && <div style={{ padding:8, fontSize:10, color:'#94a3b8' }}>Nada encontrado.</div>}
          {resultados.map(o => (
            <div key={o.id} onMouseDown={() => selecionar(o)}
              style={{ padding:'6px 10px', fontSize:10, cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}>
              <strong>{o.opl}</strong> — {o.cliente_nome} <span style={{ color:'#94a3b8' }}>({o.status_geral})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Autocomplete de Licitação — vínculo do frete a um processo ──────────────
function LicitacaoAutocompleteFrete({ value, onSelect }: any) {
  const [query, setQuery]       = useState(value || '');
  const [resultados, setRes]    = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef<any>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const buscar = (texto: string) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('licitacoes')
        .select('id, numero, nome_projeto, orgao')
        .or(`numero.ilike.%${texto}%,nome_projeto.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (l: any) => {
    setQuery(`${l.numero} — ${l.nome_projeto}`);
    setAberto(false);
    setRes([]);
    onSelect(l);
  };

  return (
    <div style={{ position:'relative' }}>
      <input className="acn-input" style={{ width:'100%' }}
        placeholder="Buscar licitação por número ou nome do projeto..."
        value={query}
        onChange={e => buscar(e.target.value)}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)} />
      {aberto && (
        <div style={{ position:'absolute', zIndex:20, top:'100%', left:0, right:0, background:'#fff',
          border:'1px solid #e2e8f0', borderRadius:6, boxShadow:'0 4px 12px #0002', maxHeight:220, overflowY:'auto' }}>
          {buscando && <div style={{ padding:8, fontSize:10, color:'#94a3b8' }}>Buscando...</div>}
          {!buscando && resultados.length === 0 && <div style={{ padding:8, fontSize:10, color:'#94a3b8' }}>Nada encontrado.</div>}
          {resultados.map(l => (
            <div key={l.id} onMouseDown={() => selecionar(l)}
              style={{ padding:'6px 10px', fontSize:10, cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}>
              <strong>{l.numero}</strong> — {l.nome_projeto} <span style={{ color:'#94a3b8' }}>({l.orgao})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FretesPanel({ currentUser }: any) {
  const [fretes, setFretes] = useState<any[]>([]);
  const { naoLidoSet: fretesNaoLidos } = useUnreadMap('pcp_fretes', fretes.map((f:any)=>f.id), currentUser);
  const [pedidosCompra, setPedidosCompra] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...VAZIO_FRETE });
  const [salvandoFrete, setSalvandoFrete] = useState(false);

  const [modalFrete, setModalFrete] = useState<any>(null);
  const marcarComoLidoFrete = useMarkAsRead('pcp_fretes', modalFrete?.id, currentUser);
  const fecharModalFrete = () => { marcarComoLidoFrete(); setModalFrete(null); };
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({ ...VAZIO_COTACAO_FRETE });
  const [novoAnexoCotacao, setNovoAnexoCotacao] = useState<File|null>(null);
  const [enviandoCotacao, setEnviandoCotacao] = useState(false);
  const [vencedoraId, setVencedoraId] = useState<string|null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [canhotoFile, setCanhotoFile] = useState<File|null>(null);
  const [enviandoCanhoto, setEnviandoCanhoto] = useState(false);
  // CT-e / rastreio — preenchidos depois que a transportadora coleta a carga
  const [numeroCte, setNumeroCte] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [urlRastreio, setUrlRastreio] = useState('');
  const [salvandoRastreio, setSalvandoRastreio] = useState(false);

  // ── Fluxo de aprovação por alçada (Fase 4 — espelha ComprasTab.tsx) ──────
  const [alcadasFrete, setAlcadasFrete]         = useState<any[]>([]);
  const [aprovacoesFrete, setAprovacoesFrete]   = useState<any[]>([]);
  const [respondendoAprovacao, setRespondendoAprovacao] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: fData }, { data: pData }, { data: aData }] = await Promise.all([
      supabase.from('pcp_fretes').select('*').order('criado_em', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material').eq('status_compra', 'Comprado'),
      supabase.from('fretes_alcadas_aprovacao').select('*').eq('ativo', true).order('nivel'),
    ]);
    setFretes(fData || []);
    setPedidosCompra(pData || []);
    setAlcadasFrete(aData || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Deep-link vindo do painel de Menções ("Frete X" clicável, contexto
  // 'frete_aprovacao') — abre o detalhe do frete em vez de só cair na
  // aba de Logística genérica.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'frete_aprovacao') return;
      (window as any).__acnDeepLink = null;
      supabase.from('pcp_fretes').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalFrete(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const criarFrete = async () => {
    if (!form.descricao.trim()) { alert('Descreva o frete.'); return; }
    setSalvandoFrete(true);
    const numOrNull = (v: any) => v === '' || v == null ? null : parseFloat(String(v).replace(',', '.'));
    const { error } = await supabase.from('pcp_fretes').insert([{
      direcao: form.direcao,
      descricao: form.descricao.trim(),
      origem: form.origem.trim() || null,
      destino: form.destino.trim() || null,
      data_prevista: form.data_prevista || null,
      pedido_compra_id: form.pedido_compra_id || null,
      // Dados fiscais/logísticos
      cnpj_cpf_pagador:      form.cnpj_cpf_pagador.trim()      || null,
      cep_origem:            form.cep_origem.trim()            || null,
      cep_destino:           form.cep_destino.trim()           || null,
      cnpj_cpf_remetente:    form.cnpj_cpf_remetente.trim()    || null,
      cnpj_cpf_destinatario: form.cnpj_cpf_destinatario.trim() || null,
      valor_nota:            numOrNull(form.valor_nota),
      quantidade_volumes:    form.quantidade_volumes === '' ? null : parseInt(form.quantidade_volumes, 10),
      peso_total:            numOrNull(form.peso_total),
      medida_altura:         numOrNull(form.medida_altura),
      medida_largura:        numOrNull(form.medida_largura),
      medida_comprimento:    numOrNull(form.medida_comprimento),
      // Vínculo a processo
      vinculo_tipo: form.vinculo_tipo || null,
      vinculo_id:   form.vinculo_id   || null,
      vinculo_desc: form.vinculo_desc || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvandoFrete(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setForm({ ...VAZIO_FRETE }); setShowForm(false); fetchAll();
  };

  const abrirModalFrete = async (f: any) => {
    setModalFrete(f);
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    setVencedoraId(f.vencedora_id || null);
    setJustificativa(f.justificativa_vencedora || '');
    setCanhotoFile(null);
    setNumeroCte(f.numero_cte || '');
    setCodigoRastreio(f.codigo_rastreio || '');
    setUrlRastreio(f.url_rastreio || '');
    setLoadingCotacoes(true);
    const { data } = await supabase.from('pcp_cotacoes_fretes')
      .select('*').eq('frete_id', f.id).order('criado_em', { ascending: true });
    setCotacoes(data || []);
    if (f.status === 'Aguardando Aprovação') {
      const { data: aprov } = await supabase.from('pcp_aprovacoes_fretes')
        .select('*').eq('frete_id', f.id).order('nivel', { ascending: true });
      setAprovacoesFrete(aprov || []);
    } else {
      setAprovacoesFrete([]);
    }
    setLoadingCotacoes(false);
  };

  const adicionarCotacao = async () => {
    if (!modalFrete) return;
    if (!novaCotacao.transportadora_nome.trim() || !novaCotacao.valor) {
      alert('Informe ao menos o nome da transportadora e o valor.'); return;
    }
    if (novoAnexoCotacao && novoAnexoCotacao.size > 10 * 1024 * 1024) {
      alert(`Anexo muito grande (${(novoAnexoCotacao.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCotacao(true);
    let anexo: { url:string; nome:string } | null = null;
    if (novoAnexoCotacao) {
      const res = await uploadArquivoFrete(novoAnexoCotacao, 'pcp-fretes-cotacoes');
      if (res.error) { alert('Erro ao enviar anexo: ' + res.error); setEnviandoCotacao(false); return; }
      anexo = res;
    }
    const { error } = await supabase.from('pcp_cotacoes_fretes').insert([{
      frete_id: modalFrete.id,
      transportadora_nome: novaCotacao.transportadora_nome.trim(),
      valor: parseFloat(String(novaCotacao.valor).replace(/\./g,'').replace(',','.')) || null,
      condicao_pagamento: novaCotacao.condicao_pagamento.trim() || null,
      prazo_entrega: novaCotacao.prazo_entrega.trim() || null,
      anexo_url: anexo?.url || null,
      anexo_nome: anexo?.nome || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setEnviandoCotacao(false);
    if (error) { alert('Erro ao salvar cotação: ' + error.message); return; }
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    abrirModalFrete(modalFrete);
  };

  const excluirCotacao = async (id: string) => {
    if (!confirm('Remover esta cotação?')) return;
    await supabase.from('pcp_cotacoes_fretes').delete().eq('id', id);
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalFrete(modalFrete);
  };

  // ── Notificações do fluxo de aprovação de Fretes (mesmo padrão de
  // notificarAprovadoresNivel/notificarCriadorPedido em ComprasTab.tsx) ──────
  const notificarAprovadoresNivelFrete = async (frete: any, nivelRow: any) => {
    try {
      const perfis = nivelRow.perfis_aprovadores || [];
      if (perfis.length === 0) return;
      const { data: aprovadores } = await supabase.from('auth_usuarios')
        .select('id, nome, email').in('perfil', perfis).eq('ativo', true);
      if (!aprovadores || aprovadores.length === 0) return;
      const valorFmt = fmt(frete.valor_frete);
      const texto = `Aprovação de frete necessária (Nível ${nivelRow.nivel} — ${nivelRow.nome}): ${frete.descricao} — ${valorFmt}`;
      for (const ap of aprovadores) {
        await supabase.from('mencoes').insert({
          mencionado_id: String(ap.id), mencionado_nome: ap.nome,
          mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
          contexto: 'frete_aprovacao', contexto_id: String(frete.id),
          contexto_descricao: frete.descricao,
          campo: 'aprovacao_nivel', texto_trecho: texto,
          aba_destino: 'logistica', lida: false, criado_em: new Date().toISOString(),
        });
      }
      const emails = aprovadores.map((a:any) => a.email).filter(Boolean);
      if (emails.length > 0) {
        const html = `<h3>Aprovação de frete necessária</h3>
          <p><strong>Nível ${nivelRow.nivel} — ${nivelRow.nome}</strong></p>
          <p>Frete: ${frete.descricao}<br>Transportadora: ${frete.transportadora}<br>Valor: ${valorFmt}</p>
          <p>Acesse o sistema (aba Logística → Fretes) para aprovar ou rejeitar.</p>`;
        await supabase.functions.invoke('send-email', {
          body: { to: emails, subject: `Aprovação necessária — Frete ${frete.descricao}`, html },
        });
      }
    } catch (e) { console.warn('Falha ao notificar aprovadores do frete:', e); }
  };

  const notificarCriadorFrete = async (frete: any, mensagem: string) => {
    try {
      if (!frete.criado_por) return;
      const { data: criador } = await supabase.from('auth_usuarios')
        .select('id, nome').eq('email', frete.criado_por).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'frete_aprovacao', contexto_id: String(frete.id),
        contexto_descricao: frete.descricao,
        campo: 'resultado_aprovacao', texto_trecho: mensagem,
        aba_destino: 'logistica', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar criador do frete:', e); }
  };

  const confirmarFreteComVencedora = async () => {
    if (!modalFrete) return;
    // 3 cotações é o recomendado, não mais obrigatório — nem sempre dá pra
    // conseguir 3 transportadoras pro mesmo frete.
    if (!vencedoraId) { alert('Selecione a cotação vencedora.'); return; }
    if (!justificativa.trim()) { alert('Informe a justificativa da cotação vencedora.'); return; }
    const vencedora = cotacoes.find(c => c.id === vencedoraId);
    if (!vencedora) { alert('Cotação vencedora inválida.'); return; }
    setConfirmando(true);

    const niveis = alcadasFrete
      .filter(a => Number(a.valor_minimo) <= Number(vencedora.valor || 0))
      .sort((a,b) => a.nivel - b.nivel);

    if (niveis.length === 0) {
      // Sem alçada aplicável — comportamento de sempre, vai direto pra Em Trânsito.
      const novoRow = {
        transportadora: vencedora.transportadora_nome,
        valor_frete: vencedora.valor,
        vencedora_id: vencedoraId,
        justificativa_vencedora: justificativa.trim(),
        status: 'Em Trânsito',
        data_coleta: new Date().toISOString(),
      };
      const { error } = await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
      setConfirmando(false);
      if (error) { alert('Erro: ' + error.message); return; }
      logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
        oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
      fecharModalFrete();
      fetchAll();
      return;
    }

    // Alçada aplicável — vai pra Aguardando Aprovação e cria as pendências,
    // uma por nível, todas com status 'pendente' (resolvidas em ordem).
    const novoRowAprov = {
      transportadora: vencedora.transportadora_nome,
      valor_frete: vencedora.valor,
      vencedora_id: vencedoraId,
      justificativa_vencedora: justificativa.trim(),
      status: 'Aguardando Aprovação',
    };
    const { error } = await supabase.from('pcp_fretes').update(novoRowAprov).eq('id', modalFrete.id);
    if (error) { setConfirmando(false); alert('Erro: ' + error.message); return; }
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRowAprov }, user: currentUser });
    await supabase.from('pcp_aprovacoes_fretes').insert(niveis.map(n => ({
      frete_id: modalFrete.id, nivel: n.nivel, nivel_nome: n.nome, valor_no_momento: vencedora.valor,
      status: 'pendente', solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
    })));
    const freteAtualizado = { ...modalFrete, transportadora: vencedora.transportadora_nome, valor_frete: vencedora.valor };
    await notificarAprovadoresNivelFrete(freteAtualizado, niveis[0]);
    setConfirmando(false);
    fecharModalFrete();
    fetchAll();
  };

  // Marca o nível pendente de menor número como aprovado e resolve em cascata —
  // notifica o próximo nível se sobrar alçada, ou libera pra "Em Trânsito" se
  // não sobrar nada (mesmo padrão de resolverPendenciaComoAprovada em ComprasTab.tsx).
  const souAprovadorParaFrete = (pendencia: any) => {
    if (!pendencia) return true;
    const alcada = alcadasFrete.find(a => a.nivel === pendencia.nivel);
    return !!(alcada && (alcada.perfis_aprovadores||[]).includes(currentUser?.perfil)) || currentUser?.perfil === 'Admin';
  };

  const aprovarNivelFreteAtivo = async () => {
    if (!modalFrete) return;
    const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
    if (!nivelAtivo) return;
    if (!souAprovadorParaFrete(nivelAtivo)) {
      const quem = (alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para aprovar este frete. Aguardando: ' + (quem || '—'));
      return;
    }
    setRespondendoAprovacao(true);
    await supabase.from('pcp_aprovacoes_fretes').update({
      status: 'aprovado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(),
    }).eq('id', nivelAtivo.id);
    resolverMencoesRespondidas({ contexto: 'frete_aprovacao', contextoId: modalFrete.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    const { data: restantes } = await supabase.from('pcp_aprovacoes_fretes')
      .select('*').eq('frete_id', modalFrete.id).eq('status', 'pendente').order('nivel', { ascending: true });
    if (restantes && restantes.length > 0) {
      const proximaAlcada = alcadasFrete.find(a => a.nivel === restantes[0].nivel);
      if (proximaAlcada) await notificarAprovadoresNivelFrete(modalFrete, proximaAlcada);
    } else {
      const novoRow = { status: 'Em Trânsito', data_coleta: new Date().toISOString() };
      await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
      logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
        oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
      await notificarCriadorFrete(modalFrete, `Frete aprovado e liberado — ${modalFrete.descricao}.`);
    }
    setRespondendoAprovacao(false);
    fecharModalFrete();
    fetchAll();
  };

  const rejeitarNivelFreteAtivo = async () => {
    if (!modalFrete) return;
    const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
    if (!nivelAtivo) return;
    if (!souAprovadorParaFrete(nivelAtivo)) {
      const quem = (alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para rejeitar este frete. Aguardando: ' + (quem || '—'));
      return;
    }
    const motivo = prompt('Motivo da rejeição:');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Informe o motivo.'); return; }
    setRespondendoAprovacao(true);
    await supabase.from('pcp_aprovacoes_fretes').update({
      status: 'rejeitado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(), resposta: motivo.trim(),
    }).eq('id', nivelAtivo.id);
    resolverMencoesRespondidas({ contexto: 'frete_aprovacao', contextoId: modalFrete.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    await supabase.from('pcp_aprovacoes_fretes').update({ status: 'cancelado' })
      .eq('frete_id', modalFrete.id).eq('status', 'pendente');
    const novoRowRej = { status: 'Cotação', vencedora_id: null, justificativa_vencedora: null };
    await supabase.from('pcp_fretes').update(novoRowRej).eq('id', modalFrete.id);
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRowRej }, user: currentUser,
      metadata: { motivo_rejeicao: motivo.trim() } });
    await notificarCriadorFrete(modalFrete, `Frete rejeitado (Nível ${nivelAtivo.nivel} — ${nivelAtivo.nivel_nome}). Motivo: ${motivo.trim()}`);
    setRespondendoAprovacao(false);
    setVencedoraId(null);
    fecharModalFrete();
    fetchAll();
  };

  const salvarRastreio = async () => {
    if (!modalFrete) return;
    setSalvandoRastreio(true);
    const { error } = await supabase.from('pcp_fretes').update({
      numero_cte: numeroCte.trim() || null,
      codigo_rastreio: codigoRastreio.trim() || null,
      url_rastreio: urlRastreio.trim() || null,
    }).eq('id', modalFrete.id);
    setSalvandoRastreio(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setModalFrete((f:any) => ({ ...f, numero_cte: numeroCte.trim() || null, codigo_rastreio: codigoRastreio.trim() || null, url_rastreio: urlRastreio.trim() || null }));
    fetchAll();
  };

  // Ao finalizar o frete (Entregue), se ele estiver vinculado a um processo,
  // anexa automaticamente um registro no "andamento" daquele processo — mesmo
  // padrão que CRM (crm_historico) e Licitações (licitacao_documentos categoria
  // 'andamento') já usam pra timeline; pra OP/OS reaproveita op_acompanhamentos
  // (o mesmo que OplAcompModal.tsx grava).
  const postarAndamentoVinculo = async (frete: any) => {
    if (!frete.vinculo_tipo || !frete.vinculo_id) return;
    const valorFmt = frete.valor_frete
      ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(frete.valor_frete) : '—';
    const texto = `🚚 Frete entregue — ${frete.descricao}\nTransportadora: ${frete.transportadora || '—'} · Valor: ${valorFmt}\nEntregue em: ${new Date().toLocaleString('pt-BR')}`;
    try {
      if (frete.vinculo_tipo === 'op_os') {
        await supabase.from('op_acompanhamentos').insert({
          referencia_id: frete.vinculo_id, referencia_tipo: 'op', referencia_desc: frete.vinculo_desc,
          setor: 'Logística', texto,
          usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema',
          criado_em: new Date().toISOString(),
        });
      } else if (frete.vinculo_tipo === 'licitacao') {
        await supabase.from('licitacao_documentos').insert({
          licitacao_id: frete.vinculo_id, categoria: 'andamento', nome: 'Andamento', conteudo: texto,
          criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, criado_em: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('Falha ao postar andamento do frete:', e); }
  };

  const marcarEntregue = async () => {
    if (!modalFrete || !canhotoFile) return;
    if (canhotoFile.size > 10 * 1024 * 1024) {
      alert(`Canhoto muito grande (${(canhotoFile.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCanhoto(true);
    const res = await uploadArquivoFrete(canhotoFile, 'pcp-fretes-canhotos');
    if (res.error) { alert('Erro ao enviar canhoto: ' + res.error); setEnviandoCanhoto(false); return; }
    const novoRow = {
      status: 'Entregue',
      data_entrega: new Date().toISOString(),
      canhoto_url: res.url,
      canhoto_nome: res.nome,
    };
    const { error } = await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
    setEnviandoCanhoto(false);
    if (error) { alert('Erro: ' + error.message); return; }
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
    await postarAndamentoVinculo(modalFrete);
    fecharModalFrete();
    fetchAll();
  };

  const cancelarFrete = async (f: any) => {
    const motivo = prompt('Motivo do cancelamento:');
    if (motivo === null) return;
    const novoRow = {
      status: 'Cancelado',
      observacoes: [f.observacoes, `Cancelado: ${motivo}`].filter(Boolean).join(' · '),
    };
    await supabase.from('pcp_fretes').update(novoRow).eq('id', f.id);
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: f.id, changeType: 'UPDATE',
      oldRow: f, newRow: { ...f, ...novoRow }, user: currentUser });
    fetchAll();
  };

  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span>🚚 Fretes — Cotação de Transportadoras e Acompanhamento até Entrega</span>
        {!showForm && (
          <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setForm({...VAZIO_FRETE});setShowForm(true);}}>
            + Novo Frete
          </button>
        )}
      </div>

      {showForm && (
        <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,margin:'10px 0'}}>
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Direção</label>
              <select className="acn-input" style={{width:'100%'}} value={form.direcao}
                onChange={e=>setForm({...form,direcao:e.target.value})}>
                <option value="inbound">📥 Inbound (chegando na ACN)</option>
                <option value="outbound">📤 Outbound (saindo da ACN)</option>
              </select>
            </div>
            <div style={{flex:2}}>
              <label className="acn-label">Descrição *</label>
              <input className="acn-input" style={{width:'100%'}} value={form.descricao}
                onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="O que está sendo transportado" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Origem</label>
              <input className="acn-input" style={{width:'100%'}} value={form.origem}
                onChange={e=>setForm({...form,origem:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Destino</label>
              <input className="acn-input" style={{width:'100%'}} value={form.destino}
                onChange={e=>setForm({...form,destino:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Data Prevista</label>
              <input type="date" className="acn-input" style={{width:'100%'}} value={form.data_prevista}
                onChange={e=>setForm({...form,data_prevista:e.target.value})} />
            </div>
          </div>
          {pedidosCompra.length > 0 && (
            <div className="form-row">
              <div style={{flex:1}}>
                <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                <select className="acn-input" style={{width:'100%'}} value={form.pedido_compra_id}
                  onChange={e=>setForm({...form,pedido_compra_id:e.target.value})}>
                  <option value="">— Não vincular —</option>
                  {pedidosCompra.map((p:any) => (
                    <option key={p.id} value={p.id}>
                      {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── MOTIVO DA COTAÇÃO — texto livre (Descrição acima) ou vínculo a um processo ── */}
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:6,padding:10,marginTop:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>🔗 Motivo da Cotação — vincular a um processo (opcional)</div>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              {[
                {v:null,        label:'Só texto livre'},
                {v:'op_os',     label:'🔗 Vincular a OP/OS'},
                {v:'licitacao', label:'🔗 Vincular a Licitação'},
              ].map(opt => (
                <button key={String(opt.v)} type="button"
                  onClick={()=>setForm({...form, vinculo_tipo: opt.v, vinculo_id:null, vinculo_desc:''})}
                  style={{padding:'4px 10px',fontSize:10,fontWeight:700,borderRadius:20,cursor:'pointer',
                    border: form.vinculo_tipo===opt.v ? '1.5px solid #1e293b' : '1px solid #e2e8f0',
                    background: form.vinculo_tipo===opt.v ? '#1e293b' : '#f8fafc',
                    color: form.vinculo_tipo===opt.v ? '#fff' : '#64748b'}}>
                  {opt.label}
                </button>
              ))}
            </div>
            {form.vinculo_tipo === 'op_os' && (
              <OplAutocompleteFrete value={form.vinculo_desc}
                onSelect={(o:any)=> o
                  ? setForm({...form, vinculo_id:o.id, vinculo_desc:`${o.opl} — ${o.cliente_nome}`})
                  : setForm({...form, vinculo_id:null, vinculo_desc:''})} />
            )}
            {form.vinculo_tipo === 'licitacao' && (
              <LicitacaoAutocompleteFrete value={form.vinculo_desc}
                onSelect={(l:any)=> l
                  ? setForm({...form, vinculo_id:l.id, vinculo_desc:`${l.numero} — ${l.nome_projeto}`})
                  : setForm({...form, vinculo_id:null, vinculo_desc:''})} />
            )}
            {form.vinculo_id && (
              <div style={{fontSize:9,color:'#16a34a',marginTop:4}}>✓ Vinculado: {form.vinculo_desc}</div>
            )}
          </div>

          {/* ── DADOS DO TRANSPORTE ── */}
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:6,padding:10,marginTop:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6}}>📋 Dados do Transporte</div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Pagador</label>
                <input className="acn-input" style={{width:'100%'}} value={form.cnpj_cpf_pagador}
                  onChange={e=>setForm({...form,cnpj_cpf_pagador:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">CEP Origem</label>
                <input className="acn-input" style={{width:'100%'}} value={form.cep_origem}
                  onChange={e=>setForm({...form,cep_origem:e.target.value})} placeholder="00000-000" />
              </div>
              <div className="form-group">
                <label className="acn-label">CEP Destino</label>
                <input className="acn-input" style={{width:'100%'}} value={form.cep_destino}
                  onChange={e=>setForm({...form,cep_destino:e.target.value})} placeholder="00000-000" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Remetente</label>
                <input className="acn-input" style={{width:'100%'}} value={form.cnpj_cpf_remetente}
                  onChange={e=>setForm({...form,cnpj_cpf_remetente:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Destinatário</label>
                <input className="acn-input" style={{width:'100%'}} value={form.cnpj_cpf_destinatario}
                  onChange={e=>setForm({...form,cnpj_cpf_destinatario:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Valor da Nota (R$)</label>
                <input className="acn-input" style={{width:'100%'}} value={form.valor_nota}
                  onChange={e=>setForm({...form,valor_nota:e.target.value})} placeholder="Ex: 1500,00" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Quant. de Volumes</label>
                <input type="number" className="acn-input" style={{width:'100%'}} value={form.quantidade_volumes}
                  onChange={e=>setForm({...form,quantidade_volumes:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Peso Total (kg)</label>
                <input className="acn-input" style={{width:'100%'}} value={form.peso_total}
                  onChange={e=>setForm({...form,peso_total:e.target.value})} placeholder="Ex: 12,5" />
              </div>
              <div className="form-group">
                <label className="acn-label">Altura (m)</label>
                <input className="acn-input" style={{width:'100%'}} value={form.medida_altura}
                  onChange={e=>setForm({...form,medida_altura:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Largura (m)</label>
                <input className="acn-input" style={{width:'100%'}} value={form.medida_largura}
                  onChange={e=>setForm({...form,medida_largura:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Comprimento (m)</label>
                <input className="acn-input" style={{width:'100%'}} value={form.medida_comprimento}
                  onChange={e=>setForm({...form,medida_comprimento:e.target.value})} />
              </div>
            </div>
          </div>

          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={criarFrete} disabled={salvandoFrete}>
              {salvandoFrete?'Salvando...':'💾 Registrar Frete'}
            </button>
            <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div style={{textAlign:'center',padding:30,color:'#9ca3af'}}>Carregando...</div>
        : fretes.length===0 ? <div style={{textAlign:'center',padding:30,color:'#9ca3af',fontSize:12}}>Nenhum frete registrado.</div>
        : (
        <div style={{overflowX:'auto',marginTop:10}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                {['Direção','Descrição','Transportadora','Valor','Status','Datas','Ações'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontWeight:700,fontSize:10,color:'#475569'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fretes.map((f:any) => (
                <tr key={f.id} style={fretesNaoLidos.has(String(f.id))
                  ? {borderBottom:'1px solid #f1f5f9',background:'#fffdf0',boxShadow:'inset 3px 0 0 #eab308'}
                  : {borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'9px 10px'}}>{f.direcao==='outbound' ? '📤 Outbound' : '📥 Inbound'}</td>
                  <td style={{padding:'9px 10px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.descricao}</td>
                  <td style={{padding:'9px 10px'}}>
                    {f.transportadora || '—'}
                    {f.transportadora && (f.numero_cte || f.codigo_rastreio) && (
                      <div style={{fontSize:9,color:'#0891b2',marginTop:1}}>
                        {f.numero_cte && '📄 CT-e'}{f.numero_cte && f.codigo_rastreio && ' · '}{f.codigo_rastreio && '📦 rastreio'}
                      </div>
                    )}
                  </td>
                  <td style={{padding:'9px 10px'}}>{fmt(f.valor_frete)}</td>
                  <td style={{padding:'9px 10px'}}>
                    <span style={{padding:'3px 9px',borderRadius:4,color:'#fff',fontSize:10,fontWeight:700,background:COR_FRETE[f.status]||'#9ca3af'}}>
                      {f.status}
                    </span>
                  </td>
                  <td style={{padding:'9px 10px',fontSize:10,color:'#64748b'}}>
                    {f.data_prevista && <div>Prev: {fmtDt(f.data_prevista)}</div>}
                    {f.data_coleta && <div>Coleta: {fmtDtHr(f.data_coleta)}</div>}
                    {f.data_entrega && <div>Entrega: {fmtDtHr(f.data_entrega)}</div>}
                  </td>
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>
                    <button onClick={()=>abrirModalFrete(f)} style={{...btn,background:'#0891b2',marginRight:3}}>
                      {f.status==='Cotação' ? '🏷️ Cotações' : f.status==='Em Trânsito' ? '📎 Canhoto' : '👁️ Ver'}
                    </button>
                    {(f.status==='Cotação' || f.status==='Em Trânsito') && (
                      <button onClick={()=>cancelarFrete(f)} style={{...btn,background:'#ef4444'}}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL GERENCIAR FRETE */}
      {modalFrete && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)fecharModalFrete();}}>
          <div className="modal-box" style={{maxWidth:640}}>
            <div className="modal-title">🚚 Frete — {modalFrete.descricao}</div>
            <div style={{fontSize:10,color:'#64748b',marginBottom:8}}>
              {modalFrete.origem || '—'} → {modalFrete.destino || '—'}
              {modalFrete.status==='Cotação' && ' · recomendado 3 cotações, mas pode confirmar com menos quando não houver 3 transportadoras disponíveis.'}
            </div>

            {modalFrete.vinculo_desc && (
              <div style={{fontSize:9,color:'#1e40af',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:4,padding:'4px 8px',marginBottom:8}}>
                🔗 Vinculado a {modalFrete.vinculo_tipo==='licitacao'?'Licitação':'OP/OS'}: {modalFrete.vinculo_desc}
              </div>
            )}

            {(modalFrete.cnpj_cpf_pagador || modalFrete.cep_origem || modalFrete.cep_destino || modalFrete.cnpj_cpf_remetente ||
              modalFrete.cnpj_cpf_destinatario || modalFrete.valor_nota || modalFrete.quantidade_volumes || modalFrete.peso_total ||
              modalFrete.medida_altura || modalFrete.medida_largura || modalFrete.medida_comprimento) && (
              <div style={{fontSize:9,color:'#475569',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:4,padding:'6px 8px',marginBottom:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 10px'}}>
                {modalFrete.cnpj_cpf_pagador && <div><strong>Pagador:</strong> {modalFrete.cnpj_cpf_pagador}</div>}
                {(modalFrete.cep_origem || modalFrete.cep_destino) && <div><strong>CEP:</strong> {modalFrete.cep_origem||'—'} → {modalFrete.cep_destino||'—'}</div>}
                {modalFrete.cnpj_cpf_remetente && <div><strong>Remetente:</strong> {modalFrete.cnpj_cpf_remetente}</div>}
                {modalFrete.cnpj_cpf_destinatario && <div><strong>Destinatário:</strong> {modalFrete.cnpj_cpf_destinatario}</div>}
                {modalFrete.valor_nota && <div><strong>Valor NF:</strong> {fmt(modalFrete.valor_nota)}</div>}
                {modalFrete.quantidade_volumes && <div><strong>Volumes:</strong> {modalFrete.quantidade_volumes}</div>}
                {modalFrete.peso_total && <div><strong>Peso:</strong> {modalFrete.peso_total} kg</div>}
                {(modalFrete.medida_altura || modalFrete.medida_largura || modalFrete.medida_comprimento) && (
                  <div><strong>Medidas (AxLxC):</strong> {modalFrete.medida_altura||'—'} x {modalFrete.medida_largura||'—'} x {modalFrete.medida_comprimento||'—'} m</div>
                )}
              </div>
            )}

            {modalFrete.status === 'Cotação' && (<>
              {loadingCotacoes ? (
                <div style={{textAlign:'center',padding:20,color:'#9ca3af',fontSize:11}}>Carregando...</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14,maxHeight:220,overflowY:'auto'}}>
                  {cotacoes.length===0 && (
                    <div style={{textAlign:'center',color:'#9ca3af',fontSize:11,padding:14}}>Nenhuma cotação registrada ainda.</div>
                  )}
                  {cotacoes.map((c:any) => (
                    <label key={c.id} style={{
                      display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:6,cursor:'pointer',
                      border: vencedoraId===c.id ? '2px solid #16a34a' : '1.5px solid #e2e8f0',
                      background: vencedoraId===c.id ? '#f0fdf4' : '#fff',
                    }}>
                      <input type="radio" name="vencedoraFrete" checked={vencedoraId===c.id} onChange={()=>setVencedoraId(c.id)} />
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#1e293b'}}>
                          {c.transportadora_nome}
                          {vencedoraId===c.id && <span style={{marginLeft:6,color:'#16a34a',fontSize:9,fontWeight:700}}>✓ VENCEDORA</span>}
                        </div>
                        <div style={{fontSize:9,color:'#64748b',marginTop:2}}>
                          {c.valor ? fmt(c.valor) : '—'}
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                          {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                        </div>
                        {c.anexo_url && (
                          <a href={c.anexo_url} target="_blank" rel="noreferrer" style={{fontSize:9,color:'#2563eb'}}>📎 {c.anexo_nome}</a>
                        )}
                      </div>
                      <button onClick={(e)=>{e.preventDefault();excluirCotacao(c.id);}} title="Remover"
                        style={{...btn,background:'#ef4444',padding:'2px 7px',fontSize:9}}>🗑️</button>
                    </label>
                  ))}
                </div>
              )}

              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>+ Nova Cotação de Transportadora</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div>
                    <label className="acn-label">Transportadora *</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.transportadora_nome}
                      onChange={e=>setNovaCotacao(f=>({...f,transportadora_nome:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Valor (R$) *</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.valor}
                      placeholder="Ex: 350,00"
                      onChange={e=>setNovaCotacao(f=>({...f,valor:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Condição de Pagamento</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.condicao_pagamento}
                      onChange={e=>setNovaCotacao(f=>({...f,condicao_pagamento:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Prazo de Entrega</label>
                    <input className="acn-input" style={{width:'100%'}} value={novaCotacao.prazo_entrega}
                      placeholder="Ex: 3 dias úteis"
                      onChange={e=>setNovaCotacao(f=>({...f,prazo_entrega:e.target.value}))} />
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <label className="acn-label">Anexo (PDF ou imagem)</label>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e=>setNovoAnexoCotacao(e.target.files?.[0]||null)} />
                </div>
                <button className="acn-btn" style={{background:'#d97706',width:'100%'}} onClick={adicionarCotacao} disabled={enviandoCotacao}>
                  {enviandoCotacao?'Enviando...':'+ Adicionar Cotação'}
                </button>
              </div>

              {cotacoes.length >= 1 && (
                <div style={{marginBottom:14}}>
                  <label className="acn-label">Justificativa da cotação vencedora *</label>
                  <textarea className="acn-input" rows={2} style={{width:'100%',resize:'vertical'}}
                    value={justificativa} onChange={e=>setJustificativa(e.target.value)}
                    placeholder="Ex: Melhor prazo, apesar de não ser o menor valor..." />
                </div>
              )}

              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={confirmarFreteComVencedora} disabled={confirmando}>
                  {confirmando?'Confirmando...':'✅ Confirmar Transportadora'}
                </button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>fecharModalFrete()}>Fechar</button>
              </div>
            </>)}

            {modalFrete.status === 'Aguardando Aprovação' && (() => {
              const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
              const historico  = aprovacoesFrete.filter(a => a.status !== 'pendente');
              return (<>
                <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8,padding:12,marginBottom:14,fontSize:11}}>
                  <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                  <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                  <div><strong>Justificativa:</strong> {modalFrete.justificativa_vencedora}</div>
                </div>
                <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>✅ Níveis de Aprovação</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                  {historico.map(a => (
                    <div key={a.id} style={{padding:'8px 10px',borderRadius:6,fontSize:10,
                      background: a.status==='aprovado' ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${a.status==='aprovado' ? '#86efac' : '#fca5a5'}`}}>
                      <strong>Nível {a.nivel} — {a.nivel_nome}</strong>: {a.status==='aprovado' ? '✅ Aprovado' : a.status==='rejeitado' ? '❌ Rejeitado' : a.status}
                      {a.respondido_por_nome && <span style={{color:'#64748b'}}> por {a.respondido_por_nome}</span>}
                      {a.resposta && <div style={{color:'#64748b',marginTop:2}}>Motivo: {a.resposta}</div>}
                    </div>
                  ))}
                  {nivelAtivo && (
                    <div style={{padding:'8px 10px',borderRadius:6,fontSize:10,background:'#fff7ed',border:'1.5px solid #f59e0b'}}>
                      <strong>Nível {nivelAtivo.nivel} — {nivelAtivo.nivel_nome}</strong>: ⏳ Aguardando aprovação de{' '}
                      {(alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ') || '—'}
                    </div>
                  )}
                </div>
                {nivelAtivo && (
                  <div style={{display:'flex',gap:8}}>
                    <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={aprovarNivelFreteAtivo} disabled={respondendoAprovacao}>
                      {respondendoAprovacao?'Processando...':'✅ Aprovar'}
                    </button>
                    <button className="acn-btn" style={{background:'#dc2626',flex:1}} onClick={rejeitarNivelFreteAtivo} disabled={respondendoAprovacao}>
                      ❌ Rejeitar
                    </button>
                    <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>fecharModalFrete()}>Fechar</button>
                  </div>
                )}
              </>);
            })()}

            {modalFrete.status === 'Em Trânsito' && (<>
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12,marginBottom:14,fontSize:11}}>
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Coletado em:</strong> {fmtDtHr(modalFrete.data_coleta)}</div>
              </div>
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:8}}>🚚 CT-e e Rastreio</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div>
                    <label className="acn-label">Número do CT-e</label>
                    <input className="acn-input" style={{width:'100%'}} value={numeroCte}
                      onChange={e=>setNumeroCte(e.target.value)} placeholder="Ex: 35260812345678000199570010000012341234567890" />
                  </div>
                  <div>
                    <label className="acn-label">Código de Rastreio</label>
                    <input className="acn-input" style={{width:'100%'}} value={codigoRastreio}
                      onChange={e=>setCodigoRastreio(e.target.value)} placeholder="Ex: BR123456789BR" />
                  </div>
                </div>
                <label className="acn-label">Link de Rastreio</label>
                <input className="acn-input" style={{width:'100%',marginBottom:8}} value={urlRastreio}
                  onChange={e=>setUrlRastreio(e.target.value)} placeholder="https://..." />
                <button className="acn-btn" style={{background:'#0891b2',fontSize:10}} onClick={salvarRastreio} disabled={salvandoRastreio}>
                  {salvandoRastreio?'Salvando...':'💾 Salvar CT-e/Rastreio'}
                </button>
              </div>
              <div style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9a3412',marginBottom:8}}>
                  📎 Canhoto obrigatório pra marcar como Entregue
                </div>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setCanhotoFile(e.target.files?.[0]||null)} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="acn-btn" style={{background:'#16a34a',flex:1}} onClick={marcarEntregue} disabled={!canhotoFile || enviandoCanhoto}>
                  {enviandoCanhoto?'Enviando...':!canhotoFile?'✅ Marcar como Entregue (anexe o canhoto)':'✅ Marcar como Entregue'}
                </button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>fecharModalFrete()}>Fechar</button>
              </div>
            </>)}

            {modalFrete.status === 'Entregue' && (
              <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:12,fontSize:11}}>
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Entregue em:</strong> {fmtDtHr(modalFrete.data_entrega)}</div>
                {modalFrete.numero_cte && <div><strong>CT-e:</strong> {modalFrete.numero_cte}</div>}
                {modalFrete.codigo_rastreio && <div><strong>Rastreio:</strong> {modalFrete.codigo_rastreio}</div>}
                {modalFrete.url_rastreio && (
                  <div><a href={modalFrete.url_rastreio} target="_blank" rel="noreferrer">🔗 Ver rastreio</a></div>
                )}
                {modalFrete.canhoto_url && (
                  <div style={{marginTop:6}}><a href={modalFrete.canhoto_url} target="_blank" rel="noreferrer">📎 Ver canhoto ({modalFrete.canhoto_nome})</a></div>
                )}
                <button className="acn-btn" style={{background:'#94a3b8',width:'100%',marginTop:10}} onClick={()=>fecharModalFrete()}>Fechar</button>
              </div>
            )}

            {modalFrete.status === 'Cancelado' && (
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,fontSize:11}}>
                <div>{modalFrete.observacoes || 'Frete cancelado.'}</div>
                <button className="acn-btn" style={{background:'#94a3b8',width:'100%',marginTop:10}} onClick={()=>fecharModalFrete()}>Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recebimento de Compras — pedidos com status_compra='Comprado' aguardando
// chegada física. O comprador já preencheu fornecedor/valor/prazo lá em
// ComprasTab; aqui a Logística preenche o que só se sabe ao receber (NF real,
// data de chegada, quantidade recebida, divergência) — usa os campos
// numero_nf/data_recebimento_real/quantidade_recebida/tem_divergencia que já
// existiam em pcp_pedidos_compra mas nunca eram gravados por nenhuma tela. ──
const VAZIO_RECEBIMENTO = {
  numero_nf: '', data_recebimento_real: new Date().toISOString().split('T')[0],
  quantidade_recebida: '', confere: true, observacoes: '', seriais: '', volume: '',
};

function PainelRecebimento({ currentUser }: any) {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalReceber, setModalReceber] = useState<any>(null);
  const [form, setForm] = useState({ ...VAZIO_RECEBIMENTO });
  const [salvando, setSalvando] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('pcp_pedidos_compra')
      .select('id, numero_pedido, numero_oc, descricao_material, fornecedor, quantidade, valor_compra, data_prevista_recebimento, opl, criado_por, criado_por_nome')
      .eq('status_compra', 'Comprado')
      .order('data_prevista_recebimento', { ascending: true, nullsFirst: false });
    setPedidos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const abrirReceber = (p: any) => {
    setModalReceber(p);
    setForm({ ...VAZIO_RECEBIMENTO, quantidade_recebida: p.quantidade != null ? String(p.quantidade) : '' });
  };

  const fmt = (v: any) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—';
  const fmtDt = (d: any) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const atrasado = (p: any) => p.data_prevista_recebimento && new Date(p.data_prevista_recebimento.slice(0, 10)) < new Date(new Date().toISOString().slice(0, 10));

  // Mesmo padrão de notificarCriadorPedido (ComprasTab.tsx) / notificarCriadorFrete
  // (FretesPanel acima) — avisa quem fez a compra que a divergência precisa ser resolvida.
  const notificarComprador = async (pedido: any, mensagem: string) => {
    try {
      if (!pedido.criado_por) return;
      const { data: criador } = await supabase.from('auth_usuarios').select('id, nome').eq('email', pedido.criado_por).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
        contexto_descricao: `Pedido ${pedido.numero_pedido}`,
        campo: 'recebimento', texto_trecho: mensagem,
        aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar comprador:', e); }
  };

  const numOrNull = (v: any) => v === '' || v == null ? null : parseFloat(String(v).replace(',', '.'));

  const confirmarRecebimento = async () => {
    if (!modalReceber) return;
    if (!form.numero_nf.trim()) { alert('Informe o número da NF.'); return; }
    if (!form.confere && !form.observacoes.trim()) { alert('Descreva a divergência.'); return; }
    setSalvando(true);
    const pedido = modalReceber;
    const agora = new Date().toISOString();

    // Registra o recebimento como manifesto de Logística também — mesma tabela/
    // fluxo do "+ Novo Registro", garante que ele apareça no Histórico e possa
    // gerar o PDF de comprovante como qualquer outro manifesto.
    const { error: errManifesto } = await supabase.from('logistica_manifestos').insert([{
      tipo: 'Recebimento', data: form.data_recebimento_real,
      remetente: pedido.fornecedor || 'Fornecedor', destinatario: 'ACN Sinal Verde',
      tipo_mercadoria: 'Materiais', descricao: pedido.descricao_material || '',
      quantidade: numOrNull(form.quantidade_recebida),
      nf_referencia: form.numero_nf.trim(),
      observacoes: form.observacoes.trim() || null,
      pedido_compra_id: pedido.id,
      seriais: form.seriais.trim() || null,
      volume: numOrNull(form.volume),
      nf_conferida: form.confere,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]);
    if (errManifesto) { alert('Erro ao registrar manifesto: ' + errManifesto.message); setSalvando(false); return; }

    const updatePedido: any = {
      numero_nf: form.numero_nf.trim(),
      data_recebimento_real: form.data_recebimento_real,
      quantidade_recebida: numOrNull(form.quantidade_recebida),
      tem_divergencia: !form.confere,
      observacoes: form.observacoes.trim() || null,
    };
    if (form.confere) {
      updatePedido.status_compra = 'Concluído';
      updatePedido.data_conclusao = new Date().toISOString().split('T')[0];
    }
    const { error: errPedido } = await supabase.from('pcp_pedidos_compra').update(updatePedido).eq('id', pedido.id);
    if (errPedido) { alert('Manifesto salvo, mas houve erro ao atualizar o pedido de compra: ' + errPedido.message); setSalvando(false); return; }

    if (form.confere) {
      // Mesmo gate de fechamento/liberação de pagamento já usado no fluxo antigo
      // de "+ Novo Registro" (Fase 3) — sem divergência, libera o faturamento.
      const { error: errFat } = await supabase.from('pcp_pedidos_faturamento').update({
        recebimento_confirmado: true, recebimento_confirmado_em: agora, status_faturamento: 'liberado',
      }).eq('pedido_id', pedido.id);
      if (errFat) console.warn('Falha ao atualizar faturamento:', errFat.message);
      notificarEvento('logistica_recebe_pedido', `📦 *Recebimento confirmado* — Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''}\nNF: ${form.numero_nf.trim()}`, 'Compras');
    } else {
      await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Compras', numero_opl: pedido.opl || null,
        descricao: `[DIVERGÊNCIA NO RECEBIMENTO] Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''} — ${pedido.descricao_material || ''} — Fornecedor: ${pedido.fornecedor || '—'} — NF ${form.numero_nf.trim()}: ${form.observacoes.trim()}`,
        status: 'Pendente', tipo_solicitacao: 'divergencia_recebimento',
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, data_abertura: agora,
        logs_demanda: [{ texto: `Divergência no recebimento: ${form.observacoes.trim()}`, usuario: currentUser?.nome, hora: agora }],
      }]);
      await notificarComprador(pedido, `⚠️ Divergência no recebimento do pedido ${pedido.numero_pedido}: ${form.observacoes.trim()}`);
      notificarEvento('logistica_divergencia_recebimento', `⚠️ *Divergência no recebimento* — Pedido ${pedido.numero_pedido}\n${form.observacoes.trim()}\nPor: ${currentUser?.nome}`, 'Compras');
    }

    setSalvando(false);
    setModalReceber(null);
    fetchAll();
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr"><span>📦 Pedidos Aguardando Recebimento ({pedidos.length})</span></div>
      <div className="sec-body" style={{ overflowX: 'auto' }}>
        {loading ? <div className="acn-empty">Carregando...</div> : pedidos.length === 0 ? (
          <div className="acn-empty">Nenhum pedido comprado aguardando recebimento.</div>
        ) : (
          <table>
            <thead><tr><th>Pedido / OC</th><th>Material</th><th>Fornecedor</th><th>Qtd</th><th>Valor</th><th>Previsão</th><th>Ação</th></tr></thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} style={atrasado(p) ? { background: '#fef2f2' } : undefined}>
                  <td>{p.numero_pedido || '—'}{p.numero_oc ? <div style={{ fontSize: 9, color: '#64748b' }}>{p.numero_oc}</div> : null}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao_material || '—'}</td>
                  <td>{p.fornecedor || '—'}</td>
                  <td>{p.quantidade ?? '—'}</td>
                  <td>{fmt(p.valor_compra)}</td>
                  <td>{fmtDt(p.data_prevista_recebimento)}{atrasado(p) && <span style={{ color: '#dc2626', fontWeight: 700 }}> ⚠ atrasado</span>}</td>
                  <td><button className="acn-btn" style={{ background: '#16a34a', fontSize: 10 }} onClick={() => abrirReceber(p)}>📥 Receber</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalReceber && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) setModalReceber(null); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-title">📥 Receber Pedido — {modalReceber.numero_pedido || modalReceber.numero_oc || '—'}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {modalReceber.descricao_material || '—'} · Fornecedor: {modalReceber.fornecedor || '—'} · Qtd pedida: {modalReceber.quantidade ?? '—'}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Número da NF *</label>
                <input className="acn-input" style={{ width: '100%' }} value={form.numero_nf}
                  onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} placeholder="Ex: 004821" />
              </div>
              <div className="form-group">
                <label className="acn-label">Data de Recebimento</label>
                <input type="date" className="acn-input" style={{ width: '100%' }} value={form.data_recebimento_real}
                  onChange={e => setForm(f => ({ ...f, data_recebimento_real: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Quantidade Recebida</label>
                <input type="number" className="acn-input" style={{ width: '100%' }} value={form.quantidade_recebida}
                  onChange={e => setForm(f => ({ ...f, quantidade_recebida: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="acn-label">Volume (embalagens)</label>
                <input type="number" className="acn-input" style={{ width: '100%' }} value={form.volume}
                  onChange={e => setForm(f => ({ ...f, volume: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="acn-label">Números de Série (opcional)</label>
              <input className="acn-input" style={{ width: '100%' }} value={form.seriais}
                placeholder="Ex: SN12345, SN12346..."
                onChange={e => setForm(f => ({ ...f, seriais: e.target.value }))} />
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, confere: true }))}
                  style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                    border: form.confere ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    background: form.confere ? '#f0fdf4' : '#fff', color: form.confere ? '#16a34a' : '#64748b' }}>
                  ✅ Confere com o pedido
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, confere: false }))}
                  style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                    border: !form.confere ? '2px solid #dc2626' : '1px solid #e2e8f0',
                    background: !form.confere ? '#fef2f2' : '#fff', color: !form.confere ? '#dc2626' : '#64748b' }}>
                  ⚠️ Tem divergência
                </button>
              </div>
              {!form.confere && (
                <textarea className="acn-input" rows={2} style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
                  value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Descreva a divergência (qtd errada, item trocado, avaria...)" />
              )}
            </div>
            {!form.confere && (
              <div style={{ fontSize: 9, color: '#92400e', marginBottom: 8 }}>
                Com divergência, o pedido continua "Comprado" e uma pendência é aberta para o Comprador resolver.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="acn-btn" style={{ background: form.confere ? '#16a34a' : '#dc2626', flex: 1 }} onClick={confirmarRecebimento} disabled={salvando}>
                {salvando ? 'Salvando...' : form.confere ? '✅ Confirmar Recebimento' : '⚠️ Registrar Divergência'}
              </button>
              <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={() => setModalReceber(null)} disabled={salvando}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogisticaTab({ currentUser }) {
  const [abaLog, setAbaLog] = useState('historico');
  const [manifestos, setManifestos] = useState([]);
  const [pedidosCompra, setPedidosCompra] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [modalVer, setModalVer] = useState(null);
  const [modalDetalhes, setModalDetalhes] = useState(null);
  const fileRef = useRef(null);

  const carregarScript = (url) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = url;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const gerarPDF = async (m) => {
    try {
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch(e) { alert('Erro ao carregar biblioteca PDF. Verifique sua conexao com a internet.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

    // Cor do tipo
    const corTipoRGB = { Recebimento:[34,197,94], Envio:[59,130,246], Transferencia:[245,158,11] }[m.tipo] || [148,163,184];

    // Cabecalho principal
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFillColor(...corTipoRGB);
    doc.rect(0, 22, 210, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('ACN SINAL VERDE — CONTROLE LOGISTICO', 14, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 17);

    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`COMPROVANTE DE ${(m.tipo||'MOVIMENTACAO').toUpperCase()}`, 14, 27);
    doc.setTextColor(0, 0, 0);

    // Numero do registro (canto superior direito)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`ID: ${(m.id||'').toString().slice(0,8).toUpperCase()}`, 170, 10);
    doc.setTextColor(0, 0, 0);

    // Dados principais
    doc.autoTable({
      startY: 34,
      head: [['INFORMACOES DA MOVIMENTACAO', '', '', '']],
      body: [
        ['Tipo de Operacao', m.tipo || '—', 'Data', fmtDt(m.data)],
        ['Remetente', m.remetente || '—', 'Destinatario', m.destinatario || '—'],
        ['Tipo de Mercadoria', m.tipo_mercadoria || '—', 'Quantidade', m.quantidade ? `${m.quantidade} un.` : '—'],
        ['Descricao da Mercadoria', { content: m.descricao || '—', colSpan: 3 }, '', ''],
        ['NF de Referencia', m.nf_referencia || '—', 'Placa do Veiculo', m.veiculo_placa || '—'],
        ['Peso (kg)', m.peso ? `${m.peso} kg` : '—', 'Registrado por', m.criado_por_nome || m.criado_por || '—'],
        ['Observacoes', { content: m.observacoes || '—', colSpan: 3 }, '', ''],
      ],
      headStyles: { fillColor: [30,41,59], fontSize: 10, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
      },
      theme: 'grid',
      styles: { lineColor: [203,213,225], lineWidth: 0.3 },
    });

    let y = doc.lastAutoTable.finalY + 8;

    // Fotos
    const fotos = Array.isArray(m.fotos) ? m.fotos : [];
    if (fotos.length > 0) {
      if (y > 200) { doc.addPage(); y = 14; }
      doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('REGISTRO FOTOGRAFICO', 16, y + 5);
      doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
      y += 10;

      const IMG_W = 55; const IMG_H = 40; const GAP = 5;
      let col = 0;
      for (const url of fotos) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = blob.type.includes('png') ? 'PNG' : 'JPEG';
          const dataUrl = await new Promise(r => {
            const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(blob);
          });
          const x = 14 + col * (IMG_W + GAP);
          if (y + IMG_H > 272) { doc.addPage(); y = 14; col = 0; }
          doc.addImage(dataUrl, ext, x, y, IMG_W, IMG_H);
          col++;
          if (col >= 3) { col = 0; y += IMG_H + GAP; }
        } catch(e) {
          console.warn('Falha ao carregar foto:', e);
        }
      }
      if (col > 0) y += IMG_H + GAP;
      y += 4;
    }

    // Bloco de assinaturas
    if (y > 235) { doc.addPage(); y = 14; }

    doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ASSINATURAS', 16, y + 5);
    doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
    y += 10;

    // Caixa Remetente
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.5);
    doc.rect(14, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('REMETENTE / EXPEDIDOR', 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 16, y + 15);
    doc.line(26, y + 15, 96, y + 15);
    doc.text('Assinatura:', 16, y + 25);
    doc.line(34, y + 25, 96, y + 25);
    doc.text('Data: ____/____/________', 16, y + 34);
    doc.setTextColor(0,0,0);

    // Caixa Destinatario/Recebedor
    doc.rect(111, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('DESTINATARIO / RECEBEDOR', 113, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 113, y + 15);
    doc.line(123, y + 15, 193, y + 15);
    doc.text('Assinatura:', 113, y + 25);
    doc.line(131, y + 25, 193, y + 25);
    doc.text('Data: ____/____/________', 113, y + 34);
    doc.setTextColor(0,0,0);

    y += 46;

    // Rodape
    doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('Documento emitido pelo sistema ACN Sinal Verde. Guarde este comprovante.', 14, y + 4);

    const nomeArq = `Comprovante_${m.tipo||'Log'}_${(m.remetente||'').replace(/\s/g,'_').slice(0,15)}_${(m.data||'').toString().slice(0,10)}.pdf`;
    doc.save(nomeArq);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: mData }, { data: pcData }] = await Promise.all([
      supabase.from('logistica_manifestos').select('*').order('data', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material, data_prevista_recebimento').eq('status_compra', 'Comprado').order('data_prevista_recebimento', { ascending: true }),
    ]);
    setManifestos(mData || []);
    setPedidosCompra(pcData || []);
    setLoading(false);
  };

  const handleFotos = (e) => {
    const files = Array.from(e.target.files || []);
    setFotos(prev => [...prev, ...files].slice(0, 6));
  };

  const removerFoto = (i) => setFotos(prev => prev.filter((_,idx)=>idx!==i));

  const salvar = async () => {
    if (!form.descricao || !form.remetente) { alert('Preencha remetente e descricao!'); return; }
    setUploading(true);

    // Upload fotos
    const fotosUrls = [];
    for (const f of fotos) {
      const ext = f.name.split('.').pop();
      const path = `logistica/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { contentType: f.type, upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        fotosUrls.push(pub?.publicUrl || path);
      }
    }

    const payload = {
      ...form,
      volume: form.volume ? parseFloat(String(form.volume).replace(',','.')) : null,
      fotos: fotosUrls,
      pedido_compra_id: form.pedido_compra_id || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    };
    const { error } = await supabase.from('logistica_manifestos').insert([payload]);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      // Recebimento vinculado a pedido de compra: só fecha a compra e libera o
      // faturamento se a NF do fornecedor foi conferida (gate real, Fase 3).
      // Sem conferência, o manifesto fica registrado mas a compra continua
      // 'Comprado' — divergência a resolver antes de fechar.
      if (form.tipo === 'Recebimento' && form.pedido_compra_id && form.nf_conferida) {
        const agora = new Date().toISOString();
        const { error: errCompra } = await supabase.from('pcp_pedidos_compra')
          .update({ status_compra: 'Concluído', data_conclusao: new Date().toISOString().split('T')[0] })
          .eq('id', form.pedido_compra_id);
        const { error: errFat } = await supabase.from('pcp_pedidos_faturamento')
          .update({ recebimento_confirmado: true, recebimento_confirmado_em: agora, status_faturamento: 'liberado' })
          .eq('pedido_id', form.pedido_compra_id);
        if (errCompra || errFat) {
          alert('Manifesto salvo, mas houve erro ao atualizar o pedido de compra/faturamento: ' + (errCompra?.message || errFat?.message) + '. Verifique manualmente.');
        }
      }
      setForm(FORM_VAZIO); setFotos([]); setShowForm(false); fetchAll();
    }
    setUploading(false);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const corTipo = (t) => ({ Recebimento:'#22c55e', Envio:'#3b82f6', Transferencia:'#f59e0b' })[t] || '#94a3b8';

  return (
    <div>
      <div style={{display:'flex',gap:0,marginBottom:10,borderRadius:6,overflow:'hidden',border:'2px solid #1e293b'}}>
        <button style={{flex:1,padding:'8px',background:abaLog==='recebimento'?'#1e293b':'white',color:abaLog==='recebimento'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('recebimento')}>📦 Aguardando Recebimento</button>
        <button style={{flex:1,padding:'8px',background:abaLog==='historico'?'#1e293b':'white',color:abaLog==='historico'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('historico')}>📋 Histórico / Novo Registro</button>
        <button style={{flex:1,padding:'8px',background:abaLog==='relatorio'?'#1e293b':'white',color:abaLog==='relatorio'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('relatorio')}>📊 Relatório IN/OUT</button>
        <button style={{flex:1,padding:'8px',background:abaLog==='fretes'?'#1e293b':'white',color:abaLog==='fretes'?'white':'#1e293b',border:'none',fontWeight:700,fontSize:11,cursor:'pointer'}}
          onClick={()=>setAbaLog('fretes')}>🚚 Fretes</button>
      </div>

      {abaLog === 'recebimento' ? <PainelRecebimento currentUser={currentUser} /> : abaLog === 'relatorio' ? <RelatorioLogistica /> : abaLog === 'fretes' ? <FretesPanel currentUser={currentUser} /> : <>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Logistica — Controle de Envio e Recebimento de Mercadorias</span>
          {!showForm && (
            <button className="acn-btn" style={{background:'#1e293b'}} onClick={()=>{setForm(FORM_VAZIO);setFotos([]);setShowForm(true);}}>
              + Novo Registro
            </button>
          )}
        </div>

        {showForm && (
          <div className="sec-body" style={{borderBottom:'1px solid #e2e8f0'}}>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                  {TIPOS_MANIFESTO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Data</label>
                <input type="date" className="acn-input" style={{width:'100%'}} value={form.data} onChange={e=>setForm({...form,data:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Remetente *</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Quem enviou" value={form.remetente} onChange={e=>setForm({...form,remetente:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Destinatario</label>
                <input className="acn-input" style={{width:'100%'}} placeholder="Quem recebe" value={form.destinatario} onChange={e=>setForm({...form,destinatario:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Mercadoria</label>
                <select className="acn-input" style={{width:'100%'}} value={form.tipo_mercadoria} onChange={e=>setForm({...form,tipo_mercadoria:e.target.value})}>
                  {TIPOS_MERCADORIA.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{flex:2}}>
                <label className="acn-label">Descricao da Mercadoria *</label>
                <input className="acn-input" style={{width:'100%'}} value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Quantidade</label>
                <input type="number" className="acn-input" style={{width:'100%'}} value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Peso (kg)</label>
                <input type="number" step="0.1" className="acn-input" style={{width:'100%'}} value={form.peso} onChange={e=>setForm({...form,peso:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">NF Referencia</label>
                <input className="acn-input" style={{width:'100%'}} value={form.nf_referencia} onChange={e=>setForm({...form,nf_referencia:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Placa do Veiculo</label>
                <input className="acn-input" style={{width:'100%'}} value={form.veiculo_placa} onChange={e=>setForm({...form,veiculo_placa:e.target.value})} />
              </div>
              <div style={{flex:2}}>
                <label className="acn-label">Observacoes</label>
                <input className="acn-input" style={{width:'100%'}} value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} />
              </div>
            </div>

            {/* VINCULAR PEDIDO DE COMPRA — só para Recebimento */}
            {form.tipo === 'Recebimento' && pedidosCompra.length > 0 && (
              <div className="form-row" style={{marginTop:4}}>
                <div style={{flex:1}}>
                  <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                  <select className="acn-input" style={{width:'100%'}} value={form.pedido_compra_id}
                    onChange={e => setForm({...form, pedido_compra_id: e.target.value})}>
                    <option value="">— Não vincular —</option>
                    {pedidosCompra.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                        {p.data_prevista_recebimento ? ` · Prev: ${new Date(p.data_prevista_recebimento.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* CONFERÊNCIA TÉCNICA — só quando há pedido de compra vinculado (Fase 3) */}
            {form.tipo === 'Recebimento' && form.pedido_compra_id && (
              <div style={{marginTop:8,background:'#fff7ed',border:'1px solid #fdba74',borderRadius:6,padding:10}}>
                <div style={{fontSize:10,fontWeight:700,color:'#9a3412',marginBottom:8}}>
                  🔍 Conferência Técnica — necessária pra fechar a compra e liberar o pagamento da NF
                </div>
                <div className="form-row">
                  <div style={{flex:2}}>
                    <label className="acn-label">Números de Série Recebidos</label>
                    <input className="acn-input" style={{width:'100%'}} value={form.seriais}
                      placeholder="Ex: SN12345, SN12346..."
                      onChange={e=>setForm({...form,seriais:e.target.value})} />
                  </div>
                  <div style={{flex:1}}>
                    <label className="acn-label">Volume (embalagens)</label>
                    <input className="acn-input" type="number" style={{width:'100%'}} value={form.volume}
                      onChange={e=>setForm({...form,volume:e.target.value})} />
                  </div>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,marginTop:8,cursor:'pointer',color:form.nf_conferida?'#16a34a':'#78716c'}}>
                  <input type="checkbox" checked={form.nf_conferida} onChange={e=>setForm({...form,nf_conferida:e.target.checked})} />
                  ✅ NF do fornecedor confere com o que chegou
                </label>
                {!form.nf_conferida && (
                  <div style={{fontSize:9,color:'#92400e',marginTop:4}}>
                    Sem marcar isso, o registro fica salvo mas a compra continua "Comprado" — não fecha e não libera o pagamento.
                  </div>
                )}
              </div>
            )}

            {/* FOTOS */}
            <div style={{marginTop:8}}>
              <label className="acn-label">Fotos (max 6)</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4,alignItems:'center'}}>
                {fotos.map((f,i) => (
                  <div key={i} style={{position:'relative'}}>
                    <img src={URL.createObjectURL(f)} alt="foto" style={{width:64,height:64,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                    <button onClick={()=>removerFoto(i)} style={{position:'absolute',top:-4,right:-4,background:'#ef4444',color:'white',border:'none',borderRadius:'50%',width:16,height:16,fontSize:10,cursor:'pointer',padding:0,lineHeight:'16px'}}>x</button>
                  </div>
                ))}
                {fotos.length < 6 && (
                  <button className="acn-btn" style={{background:'#475569',height:44}} onClick={()=>fileRef.current?.click()}>
                    + Foto
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleFotos} />
              </div>
            </div>

            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'7px',opacity:uploading?0.6:1}} onClick={salvar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Registrar'}
              </button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>{setShowForm(false);setFotos([]);}}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORICO */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Historico de Manifestos ({manifestos.length})</span></div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : manifestos.length === 0 ? (
            <div className="acn-empty">Nenhum manifesto registrado.</div>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatario</th>
                <th>Mercadoria</th><th>Qtd</th><th>NF Ref.</th><th>Placa</th><th>Fotos</th><th>Obs.</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {manifestos.map(m => (
                  <tr key={m.id}>
                    <td>{fmtDt(m.data)}</td>
                    <td><span className="acn-badge" style={{background:corTipo(m.tipo)}}>{m.tipo}</span></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.tipo_mercadoria}: {m.descricao}</td>
                    <td>{m.quantidade || '—'}</td>
                    <td>{m.nf_referencia || '—'}</td>
                    <td>{m.veiculo_placa || '—'}</td>
                    <td>
                      {m.fotos && m.fotos.length > 0 ? (
                        <button className="acn-btn" style={{background:'#475569',fontSize:10}} onClick={()=>setModalVer(m)}>
                          {m.fotos.length} foto(s)
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:10}}>{m.observacoes || '—'}</td>
                    <td style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      <button className="acn-btn" style={{background:'#0369a1',fontSize:10}} onClick={()=>setModalDetalhes(m)}>👁 Ver</button>
                      <button className="acn-btn" style={{background:'#1e293b',fontSize:10}} onClick={()=>gerarPDF(m)}>PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </>}

      <DemandaFooter setor="Logistica" />

      {/* MODAL DETALHES */}
      {modalDetalhes && (() => {
        const m = modalDetalhes;
        const cor = corTipo(m.tipo);
        const row = (label, val) => (
          <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:'6px 12px',padding:'6px 0',borderBottom:'1px solid #f1f5f9',alignItems:'start'}}>
            <span style={{fontSize:11,color:'#64748b',fontWeight:600}}>{label}</span>
            <span style={{fontSize:12,color:'#1e293b',wordBreak:'break-word'}}>{val || '—'}</span>
          </div>
        );
        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <span className="acn-badge" style={{background:cor,fontSize:13,padding:'3px 12px'}}>{m.tipo}</span>
                <span style={{fontWeight:700,fontSize:15,color:'#1e293b'}}>Detalhes do Manifesto</span>
                <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>ID: {(m.id||'').slice(0,8).toUpperCase()}</span>
              </div>

              {row('Data', fmtDt(m.data))}
              {row('Remetente', m.remetente)}
              {row('Destinatário', m.destinatario)}
              {row('Tipo de Mercadoria', m.tipo_mercadoria)}
              {row('Descrição', m.descricao)}
              {row('Quantidade', m.quantidade ? `${m.quantidade} un.` : null)}
              {row('Peso', m.peso ? `${m.peso} kg` : null)}
              {row('NF Referência', m.nf_referencia)}
              {row('Placa do Veículo', m.veiculo_placa)}
              {row('Observações', m.observacoes)}
              {row('Registrado por', m.criado_por_nome || m.criado_por)}
              {m.pedido_compra_id && row('Pedido de Compra', `#${m.pedido_compra_id.slice(0,8).toUpperCase()}`)}

              {m.fotos && m.fotos.length > 0 && (
                <div style={{marginTop:12}}>
                  <div style={{fontWeight:700,fontSize:11,color:'#475569',marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>Fotos ({m.fotos.length})</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {m.fotos.map((url,i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`foto ${i+1}`} style={{width:110,height:82,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div style={{display:'flex',gap:8,marginTop:16}}>
                <button className="acn-btn" style={{background:'#1e293b',flex:1}} onClick={()=>{setModalDetalhes(null);gerarPDF(m);}}>📄 Gerar PDF</button>
                <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDetalhes(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL FOTOS */}
      {modalVer && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:600}}>
            <div className="modal-title">Fotos — {modalVer.tipo} {fmtDt(modalVer.data)}</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginBottom:12}}>
              {(modalVer.fotos||[]).map((url,i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`foto ${i+1}`} style={{width:130,height:100,objectFit:'cover',borderRadius:4,border:'1px solid #e2e8f0'}} />
                </a>
              ))}
            </div>
            <button className="acn-btn" style={{background:'#94a3b8',width:'100%'}} onClick={()=>setModalVer(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
