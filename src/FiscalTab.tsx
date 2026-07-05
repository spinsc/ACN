// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';


export default function FiscalTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nfs, setNfs] = useState({});

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll,30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguarda Emissao NF','Faturado e Disponivel para Entrega'])
      .order('data_liberacao_comercial', { ascending: true });
    setOpls(data || []);
    setLoading(false);
  };

  const faturar = async (opl) => {
    const nf = nfs[opl.id];
    if (!nf || !nf.trim()) { alert('Informe o numero da NF-e!'); return; }
    const agora = new Date().toISOString();
    const inicioFiscal = opl.data_liberacao_comercial ? new Date(opl.data_liberacao_comercial) : null;
    const tempoFiscal = inicioFiscal ? (new Date() - inicioFiscal) / 3600000 : null;
    await supabase.from('oples').update({
      status_geral: 'Faturado e Disponivel para Entrega',
      numero_nf: nf.trim(),
      data_emissao_nf: agora,
      responsavel_fiscal: currentUser?.nome,
      ...(tempoFiscal != null ? { tempo_fiscal_horas: tempoFiscal } : {}),
    }).eq('id', opl.id);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Fiscal',
      evento: `NF-e emitida: ${nf.trim()}. Disponivel para entrega.`,
      status_anterior: 'Aguarda Emissao NF', status_novo: 'Faturado e Disponivel para Entrega',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setNfs(prev => { const n={...prev}; delete n[opl.id]; return n; });
    fetchAll();
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const aguardando = opls.filter(o => o.status_geral === 'Aguarda Emissao NF');
  const faturados = opls.filter(o => o.status_geral === 'Faturado e Disponivel para Entrega');

  return (
    <div>
      {/* AGUARDANDO EMISSAO */}
      <div className="sec-card">
        <div className="sec-hdr" style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b'}}>
          <span style={{color:'#92400e'}}>OPLs Aguardando Emissao de NF-e ({aguardando.length})</span>
        </div>
        <div className="sec-body" style={{overflowX:'auto'}}>
          {loading ? <div className="acn-empty">Carregando...</div> : aguardando.length === 0 ? (
            <div className="acn-empty">Nenhuma OPL aguardando emissao de NF-e.</div>
          ) : (
            <table>
              <thead><tr>
                <th>OPL</th><th>Chassi</th><th>Qtd</th><th>Tipo Projeto</th><th>Cliente</th><th>Lib. Comercial</th><th>Numero NF-e</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {aguardando.map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#2563eb'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
                    <td><span style={{fontWeight:700,color:(o.quantidade||1)>1?'#2563eb':'#94a3b8'}}>{o.quantidade||1}</span></td>
                    <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.tipo_projeto}</td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td>{fmtDt(o.data_liberacao_comercial)}</td>
                    <td>
                      <input className="acn-input" style={{width:120}}
                        placeholder="NF-e 000000000"
                        value={nfs[o.id] || ''}
                        onChange={e => setNfs(prev => ({...prev,[o.id]:e.target.value}))}
                        onKeyDown={e => e.key === 'Enter' && faturar(o)}
                      />
                    </td>
                    <td>
                      <button className="acn-btn" style={{background:'#22c55e'}} onClick={()=>faturar(o)}>
                        FATURADO
                      </button>
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
                <th>OPL</th><th>Chassi</th><th>Cliente</th><th>NF-e</th><th>Data Emissao</th><th>Resp. Fiscal</th>
              </tr></thead>
              <tbody>
                {faturados.map(o => (
                  <tr key={o.id}>
                    <td><strong style={{color:'#22c55e'}}>{o.opl}</strong></td>
                    <td>{o.chassi || '—'}</td>
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
    </div>
  );
}
