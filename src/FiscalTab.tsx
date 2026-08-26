// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';
import Linkify from './Linkify';

const semDado = (v) => !v || !String(v).trim();
const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [ordensOS, setOrdensOS] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});
  const [modalVer, setModalVer] = useState(null);
  const [busca, setBusca] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalEntregue, setModalEntregue] = useState(null);
  const [nomeRecebeu, setNomeRecebeu] = useState('');

  // ── Faturamento em grupo (OPs desmembradas — mesmo lote, 1 NF-e cobrindo todas) ─
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [nfLote, setNfLote] = useState('');
  const [faturandoLote, setFaturandoLote] = useState(false);
  const [faturandoId, setFaturandoId] = useState(null);
  const jaPreselecionou = React.useRef(false);

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, osRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
        .order('data_liberacao_comercial', { ascending: true }),
      supabase.from('sac_ordens_servico').select('*')
        .in('status', ['Aguardando Emissão NF','Faturada - Aguardando Entrega'])
        .eq('is_manutencao_veicular', true)
        .order('data_cq', { ascending: true }),
    ]);
    setOpls(oplsRes.data || []);
    setOrdensOS(osRes.data || []);
    if (!silent) setLoading(false);
  };

  // Pré-marca automaticamente, só na primeira carga, as OPs cujo lote (mesmo
  // número base) tem mais de 1 unidade aguardando NF-e ao mesmo tempo — nos
  // refreshes automáticos de 30s não mexe mais na seleção, pra não atropelar
  // um ajuste manual do usuário.
  useEffect(() => {
    if (jaPreselecionou.current) return;
    const aguardandoAgora = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
    if (aguardandoAgora.length === 0) return;
    jaPreselecionou.current = true;
    const porBase = {};
    aguardandoAgora.forEach(o => { const b = baseOplDe(o.opl); (porBase[b] = porBase[b] || []).push(o); });
    const novo = new Set();
    Object.values(porBase).forEach(irmaos => { if (irmaos.length > 1) irmaos.forEach(o => novo.add(o.id)); });
    setSelecionados(novo);
  }, [opls]);

  // ── Faturar em grupo — 1 NF-e cobrindo todas as OPs marcadas ────────────────
  // Trava contra faturar 2x o mesmo chassi (cada linha oples = 1 veículo):
  // o .eq('status_geral','Aguarda Emissao NF') vai junto no UPDATE, então só
  // "pega" quem ainda estiver de fato aguardando NF-e naquele instante — se
  // outra aba/usuário já faturou entre o carregamento da lista e o clique
  // aqui, o update não afeta a linha (retorna vazio) e ela é pulada, em vez
  // de sobrescrever um numero_nf que já existe.
  const faturarSelecionados = async () => {
    const nf = nfLote.trim();
    if (!nf) { alert('Informe o numero da NF-e!'); return; }
    const itens = opls.filter(o => selecionados.has(o.id) && o.status_geral === 'Aguarda Emissao NF');
    if (itens.length === 0) return;
    setFaturandoLote(true);
    const agora = new Date().toISOString();
    const obsCombinado = itens.length > 1
      ? itens.map(o => {
          const partes = [];
          if (!semDado(o.chassi)) partes.push(`Chassi ${o.chassi}`);
          if (!semDado(o.placa)) partes.push(`Placa ${o.placa}`);
          if (!semDado(o.seriais_equipamentos)) partes.push(`Serial ${o.seriais_equipamentos}`);
          return `${o.opl}${partes.length ? ' — ' + partes.join(' | ') : ''}`;
        }).join('\n')
      : null;
    const faturadas = [];
    const jaFaturadasPorOutro = [];
    for (const o of itens) {
      const inicioFiscal = o.data_liberacao_comercial ? new Date(o.data_liberacao_comercial) : null;
      const tempoFiscal = inicioFiscal ? (new Date() - inicioFiscal) / 3600000 : null;
      const { data: upd } = await supabase.from('oples').update({
        status_geral: 'Faturado e Disponivel para Entrega',
        numero_nf: nf,
        data_emissao_nf: agora,
        responsavel_fiscal: currentUser?.nome,
        observacoes_faturamento: obsCombinado,
        ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      }).eq('id', o.id).eq('status_geral', 'Aguarda Emissao NF').select();
      if (!upd || upd.length === 0) { jaFaturadasPorOutro.push(o.opl); continue; }
      faturadas.push(o);
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: o.id, numero_opl: o.opl, setor: 'Fiscal',
        evento: itens.length > 1
          ? `NF-e emitida em lote: ${nf} (junto com ${itens.length - 1} outra(s) unidade(s): ${itens.map(x=>x.opl).filter(n=>n!==o.opl).join(', ')}).`
          : `NF-e emitida: ${nf}. Disponivel para entrega.`,
        status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    if (faturadas.length > 0) {
      notificarEvento('fiscal_nf_emitida', msg.nfEmitida(faturadas.map(o=>o.opl).join(', '), nf, currentUser?.nome));
    }
    if (jaFaturadasPorOutro.length > 0) {
      alert(`Atenção: ${jaFaturadasPorOutro.join(', ')} já ${jaFaturadasPorOutro.length>1?'foram faturadas':'foi faturada'} por outra sessão enquanto você selecionava — não foram faturadas de novo. Confira a lista atualizada.`);
    }
    setSelecionados(new Set());
    setNfLote('');
    setFaturandoLote(false);
    fetchAll();
  };

  const faturar = async (opl) => {
    const nf = nfs[opl.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    setFaturandoId(opl.id);
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? (new Date() - inicioFiscal) / 3600000 : null;
    const { data: upd } = await supabase.from('oples').update({
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
    }).eq('id', opl.id).eq('status_geral', 'Aguarda Emissao NF').select();
    if (!upd || upd.length === 0) {
      setFaturandoId(null);
      alert(`Esta OP já foi faturada por outra sessão enquanto você digitava. Atualizando a lista.`);
      fetchAll();
      return;
    }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `NF-e emitida: ${nf.trim()}. Disponivel para entrega.`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(opl.opl, nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    setFaturandoId(null);
    fetchAll();
  };

  const faturarOS = async (os) => {
    const nf = nfs[os.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    const agora = new Date().toISOString();
    const inicioFiscal = os.data_cq ? new Date(os.data_cq) : null;
    const tempoFiscal = inicioFiscal ? (new Date() - inicioFiscal) / 3600000 : null;
    await supabase.from('sac_ordens_servico').update({
      status: 'Faturada - Aguardando Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
      atualizado_em: agora,
    }).eq('id', os.id);
    notificarEvento('fiscal_nf_emitida', msg.nfEmitida(os.numero_os, nf.trim(), currentUser?.nome));
    setNfs(prev => { const n={...prev}; delete n[os.id]; return n; });
    fetchAll();
  };

  // ── Devolver ao Comercial (inconsistência na OP/OS) ──────────────────────
  const devolverComercial = async () => {
    if (!obsDevolver.trim()) { alert('Descreva a inconsistência encontrada.'); return; }
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    await supabase.from('oples').update({
      status_geral: 'Devolvida Comercial',
      obs_devolucao: obsDevolver.trim(),
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `OPL devolvida para Comercial. Inconsistência: ${obsDevolver.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('fiscal_devolve_comerc', msg.oplDevolvida(opl.opl, 'Comercial', obsDevolver.trim(), currentUser?.nome));
    setModalDevolver(null); setObsDevolver('');
    fetchAll();
  };

  // ── Confirmar Entrega (fecha o ciclo: OP passa a status_geral='Faturado') ──
  const confirmarEntrega = async () => {
    if (!nomeRecebeu.trim()) { alert('Informe o nome de quem recebeu!'); return; }
    const opl = modalEntregue;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('oples').update({
      status_geral: 'Faturado', cliente_recebeu_nome: nomeRecebeu.trim(), data_entrega: agora,
    }).eq('id', opl.id);
    if (error) { alert('Erro ao confirmar entrega: ' + error.message); return; }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `Equipamento entregue. Recebeu: ${nomeRecebeu.trim()}`,
      status_anterior: opl.status_geral, status_novo: 'Faturado',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('comercial_entregue', msg.entregue(opl.opl, opl.cliente_nome||'—', nomeRecebeu.trim()));
    setModalEntregue(null); setNomeRecebeu('');
    fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const aguardando = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
  const faturados = opls.filter(o => o.status_geral === 'Faturado e Disponivel para Entrega');

  const contagemPorBase = {};
  aguardando.forEach(o => { const b = baseOplDe(o.opl); contagemPorBase[b] = (contagemPorBase[b]||0) + 1; });
  const ehLote = (o) => contagemPorBase[baseOplDe(o.opl)] > 1;
  const toggleSelecionado = (id) => setSelecionados(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div>
      {/* AGUARDANDO EMISSAO */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}>
          <span style={{color:'#92400e'}}>OPLs Aguardando Emissao de NF-e ({filtrarOpls(aguardando, busca).length})</span>
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />

        {selecionados.size > 0 && (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#ede9fe',borderBottom:'2px solid #7c3aed',flexWrap:'wrap'}}>
            <span style={{fontWeight:700,fontSize:11,color:'#5b21b6'}}>🔗 {selecionados.size} selecionada(s)</span>
            <input className="acn-input" style={{width:140}} placeholder="NF-e 000000000"
              value={nfLote} onChange={e=>setNfLote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && faturarSelecionados()} />
            <button className="acn-btn" style={{background:'#7c3aed'}} disabled={faturandoLote} onClick={faturarSelecionados}>
              {faturandoLote ? 'Faturando...' : `FATURAR ${selecionados.size} SELECIONADA(S)`}
            </button>
            <button className="acn-btn" style={{background:'#94a3b8',fontSize:9}} onClick={()=>setSelecionados(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}

        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : aguardando.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando emissao de NF-e.</div>
          ) : (
            <table>
              <thead><tr>
                <th></th><th>OPL</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>Cliente</th><th>Lib. Comercial</th>
                <th>Seriais / Nº Equipamentos</th><th>Numero NF-e</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {filtrarOpls(aguardando, busca).map(o => (
                  <tr key={o.id} style={ehLote(o) ? {background:'#faf5ff',borderLeft:'3px solid #7c3aed'} : undefined}>
                    <td>
                      <input type="checkbox" checked={selecionados.has(o.id)} onChange={()=>toggleSelecionado(o.id)} />
                    </td>
                    <td>
                      <LinkOpl opl={o} currentUser={currentUser} />
                      {ehLote(o) && <div><span style={{fontSize:8,fontWeight:700,background:'#7c3aed',color:'white',padding:'1px 5px',borderRadius:10}}>🔗 LOTE</span></div>}
                    </td>
                    <td style={{fontSize:10}}>
                      <div>{semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}</div>
                      <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
                      <div style={{color:'#94a3b8'}}>{semDado(o.placa) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem placa</span> : `🚘 ${o.placa}`}</div>
                    </td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>{fmtDt(o.data_liberacao_comercial)}</td>
                    <td>
                      {o.seriais_equipamentos ? (
                        <div style={{width:180,fontSize:10,fontFamily:'monospace',whiteSpace:'pre-wrap',color:'#1e3a8a',background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:4,padding:'4px 7px'}}>
                          <Linkify text={o.seriais_equipamentos} />
                        </div>
                      ) : (
                        <span style={{fontSize:9,color:'#dc2626',fontStyle:'italic'}}>⚠️ Não informado pelo Almoxarifado no kiting</span>
                      )}
                    </td>
                    <td>
                      <input className="acn-input" style={{width:120}}
                        placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#22c55e'}} disabled={faturandoId===o.id} onClick={()=>faturar(o)}>
                          {faturandoId===o.id ? '...' : 'FATURADO'}
                        </button>
                        <button className="acn-btn" style={{background:'#ef4444',fontSize:9}} onClick={()=>{setModalDevolver(o);setObsDevolver('');}}>
                          ↩ Devolver
                        </button>
                        <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* JA FATURADOS */}
      {faturados.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0fdf4',borderBottom:'2px solid #22c55e'}}>
            <span style={{color:'#166534'}}>Faturados — Aguardando Retirada/Entrega ({faturados.length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr>
                <th>OPL</th><th>Veículo</th><th>Cliente</th><th>NF-e</th><th>Data Emissao</th><th>Resp. Fiscal</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {faturados.map(o => (
                  <tr key={o.id}>
                    <td><LinkOpl opl={o} currentUser={currentUser} color="#22c55e" /></td>
                    <td style={{fontSize:10}}>
                      <div>{semDado(o.modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.modelo}</div>
                      <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
                      <div style={{color:'#94a3b8'}}>{semDado(o.placa) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem placa</span> : `🚘 ${o.placa}`}</div>
                    </td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>
                      <strong style={{color:'#22c55e'}}>#{o.numero_nf}</strong>
                      {o.observacoes_faturamento && (
                        <div style={{marginTop:3,width:200,fontSize:9,fontFamily:'monospace',whiteSpace:'pre-wrap',color:'#5b21b6',background:'#faf5ff',border:'1px solid #d8b4fe',borderRadius:4,padding:'4px 6px'}}>
                          🔗 NF em lote:<br/>{o.observacoes_faturamento}
                        </div>
                      )}
                    </td>
                    <td>{fmtDt(o.data_emissao_nf)}</td>
                    <td>{o.responsavel_fiscal || '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="acn-btn" style={{background:'#475569',fontSize:9}} onClick={()=>setModalVer(o)}>👁 Ver</button>
                        <button className="acn-btn" style={{background:'#22c55e',fontSize:9}} onClick={()=>{setModalEntregue(o);setNomeRecebeu('');}}>✅ Confirmar Entrega</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OS DE MANUTENÇÃO VEICULAR — AGUARDANDO EMISSAO */}
      {ordensOS.filter(o=>o.status==='Aguardando Emissão NF').length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}>
            <span style={{color:'#92400e'}}>OS Veiculares Aguardando Emissao de NF-e ({ordensOS.filter(o=>o.status==='Aguardando Emissão NF').length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Numero NF-e</th><th>Ação</th></tr></thead>
              <tbody>
                {ordensOS.filter(o=>o.status==='Aguardando Emissão NF').map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#0f766e'}}>{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td style={{fontSize:10}}>
                      <div>{semDado(o.veiculo_modelo) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem modelo</span> : o.veiculo_modelo}</div>
                      <div style={{color:'#94a3b8'}}>{semDado(o.chassi) ? <span style={{color:'#dc2626',fontWeight:700}}>⚠️ sem chassi</span> : `🔧 ${o.chassi}`}</div>
                    </td>
                    <td>
                      <input className="acn-input" style={{width:120}} placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturarOS(o)} />
                    </td>
                    <td><button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>faturarOS(o)}>FATURADO</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OS DE MANUTENÇÃO VEICULAR — JA FATURADAS */}
      {ordensOS.filter(o=>o.status==='Faturada - Aguardando Entrega').length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr" style={{background:'#f0fdf4',borderBottom:'2px solid #22c55e'}}>
            <span style={{color:'#166534'}}>OS Veiculares Faturadas — Aguardando Entrega ({ordensOS.filter(o=>o.status==='Faturada - Aguardando Entrega').length})</span>
          </div>
          <div className="sec-body" style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>NF-e</th><th>Data Emissao</th><th>Resp. Fiscal</th></tr></thead>
              <tbody>
                {ordensOS.filter(o=>o.status==='Faturada - Aguardando Entrega').map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#0f766e'}}>{o.numero_os}</strong></td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td><strong style={{color:'#22c55e'}}>#{o.numero_nf}</strong></td>
                    <td>{fmtDt(o.data_emissao_nf)}</td>
                    <td>{o.responsavel_fiscal || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OplMovimentadas setor="Fiscal" />
      <DemandaFooter setor="Fiscal" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL DEVOLVER AO COMERCIAL */}
      {modalDevolver && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalDevolver(null);}}>
          <div className="modal-box">
            <div className="modal-title">↩ Devolver para Comercial — {modalDevolver.opl}</div>
            <label className="acn-label">Inconsistência encontrada *</label>
            <textarea className="acn-input" rows={3} style={{width:'100%',resize:'vertical',marginBottom:10}}
              placeholder="Descreva o que precisa ser corrigido pelo Comercial..."
              value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} autoFocus />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#ef4444',flex:1}} onClick={devolverComercial}>CONFIRMAR DEVOLUÇÃO</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalDevolver(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ENTREGA */}
      {modalEntregue && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalEntregue(null);}}>
          <div className="modal-box">
            <div className="modal-title">✅ Confirmar Entrega — {modalEntregue.opl}</div>
            <div style={{fontSize:11,color:'#64748b',marginBottom:12}}>NF: <strong>#{modalEntregue.numero_nf}</strong></div>
            <label className="acn-label">Nome completo de quem recebeu o equipamento</label>
            <input className="acn-input" style={{width:'100%',marginBottom:14,fontSize:13,padding:'8px'}}
              autoFocus placeholder="Nome do receptor" value={nomeRecebeu} onChange={e=>setNomeRecebeu(e.target.value)} onKeyDown={e=>e.key==='Enter'&&confirmarEntrega()} />
            <div style={{display:'flex',gap:8}}>
              <button className="acn-btn" style={{background:'#22c55e',flex:1,padding:'8px'}} onClick={confirmarEntrega}>CONFIRMAR ENTREGA</button>
              <button className="acn-btn" style={{background:'#94a3b8'}} onClick={()=>setModalEntregue(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
