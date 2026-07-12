// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';
import ContactosSection from './ContactosSection';
import CrmAnexosWidget from './CrmAnexosWidget';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtMoeda = (v: number | null) =>
  v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
const fmtData = (v: string | null) =>
  v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const diasAte = (v: string | null) => {
  if (!v) return null;
  return Math.ceil((new Date(v + 'T12:00:00').getTime() - Date.now()) / 86400000);
};
const isGanho  = (e: any) => e?.nome?.toLowerCase().includes('vencida') || e?.nome?.toLowerCase().includes('convertida');
const isPerdido = (e: any) => e?.is_final && !isGanho(e);

const VAZIO_OP: any = {
  funil: 'licitacao',
  tipo_licitacao: 'ordinaria',
  titulo: '',
  numero_edital: '',
  orgao: '',
  data_sessao: '',
  data_validade_ata: '',
  valor_registrado: '',
  cliente_id: null,
  estagio_id: '',
  responsavel_id: null,
  responsavel_nome: '',
  motivo_perda: '',
  data_prev_fechamento: '',
};

const VAZIO_VENDA: any = {
  orgao_aderente: '',
  cliente_id: null,
  descricao: '',
  quantidade: '',
  valor_unitario: '',
  valor_total: '',
  status_faturamento: 'pendente',
  numero_nf: '',
  data_faturamento: '',
  operador_id: null,
  operador_nome: '',
  opl_id: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmTab({ currentUser }: { currentUser: any }) {
  // ── permissões ──
  const pcrm = currentUser?.permissoes_crm || [];
  const podeVerTotais       = pcrm.includes('totais_vendas')        || currentUser?.perfil === 'Admin';
  const podeVerFaturamentos = pcrm.includes('painel_faturamentos')  || currentUser?.perfil === 'Admin';
  const podeVerRelatorio    = pcrm.includes('relatorio_vendedores') || currentUser?.perfil === 'Admin';

  // ── estado principal ──
  const [secaoCrm, setSecaoCrm]     = useState<'funil'|'contatos'>('funil');
  const [funil, setFunil]           = useState<'licitacao'|'venda_direta'>('licitacao');
  const [estagios, setEstagios]     = useState<any[]>([]);
  const [ops, setOps]               = useState<any[]>([]);
  const [itens, setItens]           = useState<any[]>([]);
  const [progresso, setProgresso]   = useState<any[]>([]);
  const [vendas, setVendas]         = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState('');
  const [abaInterna, setAbaInterna] = useState<'kanban'|'faturamentos'>('kanban');

  // ── drag & drop ──
  const [dragging, setDragging]     = useState<string|null>(null);
  const [dragOver, setDragOver]     = useState<string|null>(null);

  // ── modais ──
  const [modalOp, setModalOp]               = useState<any|null>(null);
  const [modalGate, setModalGate]           = useState<any|null>(null);
  const [modalConverter, setModalConverter] = useState<any|null>(null);
  const [modalMotivo, setModalMotivo]       = useState<any|null>(null);
  const [modalVenda, setModalVenda]         = useState<any|null>(null);
  const [tipoConverter, setTipoConverter]   = useState<'op'|'os'>('op');
  const [numOp, setNumOp]                   = useState('');
  const [motivoTexto, setMotivoTexto]       = useState('');
  const [formOp, setFormOp]                 = useState({ ...VAZIO_OP });
  const [formVenda, setFormVenda]           = useState({ ...VAZIO_VENDA });
  const [salvando, setSalvando]             = useState(false);
  const [filtFat, setFiltFat]               = useState<'todos'|'pendente'|'faturado'>('todos');
  const [filtFunil, setFiltFunil]           = useState<'todos'|'licitacao'|'venda_direta'>('todos');

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('crm_estagios_funil').select('*').order('ordem'),
      supabase.from('crm_oportunidades').select('*').order('criado_em', { ascending: false }),
      supabase.from('crm_checklist_itens').select('*').order('ordem'),
      supabase.from('crm_checklist_progresso').select('*'),
      supabase.from('crm_vendas').select('*').order('criado_em', { ascending: false }),
    ]);
    setEstagios(r1.data || []);
    setOps(r2.data || []);
    setItens(r3.data || []);
    setProgresso(r4.data || []);
    setVendas(r5.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('crm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_oportunidades' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_vendas' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { setAbaInterna('kanban'); }, [funil]);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVADOS
  // ─────────────────────────────────────────────────────────────────────────
  const estagiosFunil = estagios.filter(e => e.funil === funil);
  const opsFunil      = ops.filter(o => o.funil === funil);
  const opsFiltradas  = opsFunil.filter(o =>
    !busca ||
    o.titulo?.toLowerCase().includes(busca.toLowerCase()) ||
    o.orgao?.toLowerCase().includes(busca.toLowerCase()) ||
    o.numero_edital?.toLowerCase().includes(busca.toLowerCase())
  );

  const getEst       = (id: string) => estagios.find(e => e.id === id);
  const getItensEst  = (estagioId: string) => itens.filter(i => i.estagio_id === estagioId);
  const getProgOp    = (opId: string) => progresso.filter(p => p.oportunidade_id === opId);
  const getVendasOp  = (opId: string) => vendas.filter(v => v.oportunidade_id === opId);

  const chkPct = (opId: string, estagioId: string) => {
    const its = getItensEst(estagioId);
    if (!its.length) return null;
    const prog = getProgOp(opId);
    const done = its.filter(i => prog.find(p => p.item_id === i.id && p.concluido)).length;
    return { done, total: its.length };
  };

  const totalVendidoOp = (opId: string) =>
    getVendasOp(opId).reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalFaturadoOp = (opId: string) =>
    getVendasOp(opId).filter(v => v.status_faturamento === 'faturado').reduce((s, v) => s + (v.valor_total || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // DRAG & DROP
  // ─────────────────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => setDragging(id);
  const handleDragEnd   = () => { setDragging(null); setDragOver(null); };

  const handleDrop = async (estagioDestId: string) => {
    setDragOver(null);
    if (!dragging) return;
    const op = ops.find(o => o.id === dragging);
    if (!op || op.estagio_id === estagioDestId) { setDragging(null); return; }

    const estDest = getEst(estagioDestId);
    setDragging(null);

    if (isPerdido(estDest)) {
      setModalMotivo({ op, estagioDestId });
      setMotivoTexto('');
      return;
    }

    const its = getItensEst(op.estagio_id);
    const prog = getProgOp(op.id);
    const obrigPend = its.filter(i => i.obrigatorio && !prog.find(p => p.item_id === i.id && p.concluido));
    if (obrigPend.length > 0) {
      setModalGate({ op, estagioDestId, itens: its, prog });
      return;
    }

    await moverCard(op.id, estagioDestId);
  };

  const moverCard = async (opId: string, estagioId: string) => {
    await supabase.from('crm_oportunidades').update({
      estagio_id: estagioId,
      atualizado_em: new Date().toISOString(),
    }).eq('id', opId);
    await supabase.from('crm_historico').insert({
      oportunidade_id: opId,
      tipo: 'status_change',
      estagio_novo: getEst(estagioId)?.nome,
      usuario_nome: currentUser?.nome || 'Sistema',
    });
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR OP
  // ─────────────────────────────────────────────────────────────────────────
  // converte string vazia → null (evita 400 em colunas date/uuid no Postgres)
  const limpar = (v: any) => (v === '' || v === undefined) ? null : v;

  const salvarOportunidade = async () => {
    if (!formOp.titulo?.trim()) return;
    setSalvando(true);
    const p: any = {
      funil,
      titulo:            formOp.titulo?.trim() || null,
      tipo_licitacao:    formOp.tipo_licitacao  || 'ordinaria',
      numero_edital:     limpar(formOp.numero_edital),
      orgao:             limpar(formOp.orgao),
      data_sessao:       limpar(formOp.data_sessao),
      data_validade_ata: limpar(formOp.data_validade_ata),
      data_prev_fechamento: limpar(formOp.data_prev_fechamento),
      valor_registrado:  formOp.valor_registrado
        ? parseFloat(String(formOp.valor_registrado).replace(/\./g,'').replace(',','.'))
        : null,
      cliente_id:        limpar(formOp.cliente_id),
      estagio_id:        limpar(formOp.estagio_id),
      responsavel_id:    limpar(formOp.responsavel_id),
      responsavel_nome:  limpar(formOp.responsavel_nome),
      motivo_perda:      limpar(formOp.motivo_perda),
    };
    if (!p.estagio_id) {
      const first = estagiosFunil.find(e => !isGanho(e) && !isPerdido(e));
      if (first) p.estagio_id = first.id;
    }
    if (modalOp?.id) {
      await supabase.from('crm_oportunidades').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalOp.id);
    } else {
      await supabase.from('crm_oportunidades').insert(p);
    }
    setSalvando(false);
    setModalOp(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE CHECKLIST
  // ─────────────────────────────────────────────────────────────────────────
  const toggleItem = async (opId: string, itemId: string, atual: boolean) => {
    const ex = progresso.find(p => p.oportunidade_id === opId && p.item_id === itemId);
    if (ex) {
      await supabase.from('crm_checklist_progresso').update({
        concluido: !atual,
        concluido_por: currentUser?.nome,
        concluido_em: !atual ? new Date().toISOString() : null,
      }).eq('id', ex.id);
    } else {
      await supabase.from('crm_checklist_progresso').insert({
        oportunidade_id: opId, item_id: itemId, concluido: true,
        concluido_por: currentUser?.nome, concluido_em: new Date().toISOString(),
      });
    }
    const { data } = await supabase.from('crm_checklist_progresso').select('*').eq('oportunidade_id', opId);
    setProgresso(prev => [...prev.filter(p => p.oportunidade_id !== opId), ...(data || [])]);
    if (modalGate?.op?.id === opId) {
      setModalGate((g: any) => g ? { ...g, prog: data || [] } : null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERTER EM OP / OS
  // ─────────────────────────────────────────────────────────────────────────
  const converterGanho = async () => {
    if (!modalConverter) return;
    if (tipoConverter === 'op' && !numOp.trim()) {
      alert('Informe o número da OP.');
      return;
    }
    setSalvando(true);
    const op = modalConverter;
    const agora = new Date().toISOString();
    try {
      if (tipoConverter === 'op') {
        // Checa duplicata antes de inserir
        const { data: existente } = await supabase.from('oples').select('id').eq('opl', numOp.trim()).maybeSingle();
        if (existente) {
          alert(`OP "${numOp.trim()}" já está cadastrada. Use outro número.`);
          setSalvando(false);
          return;
        }
        const { data: novaOp, error } = await supabase.from('oples').insert({
          opl:                   numOp.trim(),
          modelo:                op.titulo,
          cliente_nome:          op.orgao || op.titulo,
          responsavel_comercial: op.responsavel_nome || null,
          status_geral:          'Em Espera Engenharia',
          data_entrada:          agora.slice(0, 10),
          criado_por_nome:       currentUser?.nome,
          criado_por:            currentUser?.email,
        }).select().single();
        if (error) throw error;
        if (novaOp) {
          await supabase.from('crm_historico').insert({
            oportunidade_id: op.id, tipo: 'conversao_op',
            conteudo: `OP criada: ${numOp.trim()}`, usuario_nome: currentUser?.nome,
          });
        }
      } else {
        // OS: busca dados completos do cliente e redireciona para SAC
        let clienteObj = null;
        if (op.cliente_id) {
          const { data: cli } = await supabase.from('clientes').select('*').eq('id', op.cliente_id).single();
          clienteObj = cli || null;
        }
        // Monta dados para o formulário SAC
        const nomeCliente = clienteObj?.nome || op.orgao || op.titulo;
        const fones = Array.isArray(clienteObj?.telefones) && clienteObj.telefones.length
          ? (clienteObj.telefones[0]?.numero || clienteObj.telefones[0] || '')
          : '';
        const emails = Array.isArray(clienteObj?.emails) && clienteObj.emails.length
          ? (clienteObj.emails[0]?.email || clienteObj.emails[0] || '')
          : '';
        const endereco = [clienteObj?.endereco, clienteObj?.numero, clienteObj?.complemento].filter(Boolean).join(', ');
        sessionStorage.setItem('pendingOsFromCrm', JSON.stringify({
          defeito_reclamado: op.titulo,
          equipamento_nome:  op.titulo,
          cliente_nome:      nomeCliente,
          empresa_orgao:     clienteObj?.empresa || op.orgao || '',
          cpf_cnpj:          clienteObj?.documento || '',
          telefone:          fones,
          email:             emails,
          endereco:          endereco,
          cliente_obj:       clienteObj,
          cliente_id:        op.cliente_id || null,
          responsavel_nome:  op.responsavel_nome || '',
          observacoes:       `[CRM] Vendedor: ${op.responsavel_nome || 'não atribuído'}\nOportunidade: ${op.titulo}${op.numero_edital ? '\nEdital: ' + op.numero_edital : ''}${op.orgao ? '\nÓrgão: ' + op.orgao : ''}`,
        }));
        setModalConverter(null);
        setNumOp('');
        window.dispatchEvent(new CustomEvent('crm:navegar-sac'));
        setSalvando(false);
        return;
      }
      setModalConverter(null);
      setNumOp('');
      alert(`OP ${numOp.trim()} criada! Acesse a aba Engenharia para acompanhar.`);
    } catch (e: any) {
      alert('Erro ao criar: ' + (e?.message || 'Verifique o console.'));
    }
    setSalvando(false);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MOTIVO PERDA
  // ─────────────────────────────────────────────────────────────────────────
  const confirmarPerda = async () => {
    if (!modalMotivo) return;
    await supabase.from('crm_oportunidades').update({
      estagio_id: modalMotivo.estagioDestId,
      motivo_perda: motivoTexto,
      atualizado_em: new Date().toISOString(),
    }).eq('id', modalMotivo.op.id);
    await supabase.from('crm_historico').insert({
      oportunidade_id: modalMotivo.op.id, tipo: 'status_change',
      estagio_novo: getEst(modalMotivo.estagioDestId)?.nome,
      conteudo: motivoTexto, usuario_nome: currentUser?.nome,
    });
    setModalMotivo(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR VENDA
  // ─────────────────────────────────────────────────────────────────────────
  const salvarVenda = async () => {
    if (!modalVenda || !formVenda.valor_total) return;
    setSalvando(true);
    const p: any = {
      oportunidade_id:   modalVenda.op.id,
      orgao_aderente:    limpar(formVenda.orgao_aderente),
      cliente_id:        limpar(formVenda.cliente_id),
      descricao:         limpar(formVenda.descricao),
      quantidade:        formVenda.quantidade || null,
      valor_unitario:    formVenda.valor_unitario
        ? parseFloat(String(formVenda.valor_unitario).replace(/\./g,'').replace(',','.'))
        : null,
      valor_total:       parseFloat(String(formVenda.valor_total).replace(/\./g,'').replace(',','.')),
      status_faturamento: formVenda.status_faturamento || 'pendente',
      numero_nf:         limpar(formVenda.numero_nf),
      data_faturamento:  limpar(formVenda.data_faturamento),
      operador_id:       limpar(formVenda.operador_id),
      operador_nome:     limpar(formVenda.operador_nome),
      opl_id:            limpar(formVenda.opl_id),
    };
    if (modalVenda.venda?.id) {
      await supabase.from('crm_vendas').update(p).eq('id', modalVenda.venda.id);
    } else {
      await supabase.from('crm_vendas').insert(p);
    }
    setSalvando(false);
    setModalVenda(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR OP
  // ─────────────────────────────────────────────────────────────────────────
  const excluirOp = async (op: any) => {
    if (!confirm(`Excluir "${op.titulo}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('crm_oportunidades').delete().eq('id', op.id);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOTAIS
  // ─────────────────────────────────────────────────────────────────────────
  const totalGeral         = vendas.reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalFaturadoGeral = vendas.filter(v => v.status_faturamento === 'faturado').reduce((s, v) => s + (v.valor_total || 0), 0);
  const totalPendenteGeral = vendas.filter(v => v.status_faturamento === 'pendente').reduce((s, v) => s + (v.valor_total || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CARD
  // ─────────────────────────────────────────────────────────────────────────
  const renderCard = (op: any) => {
    const est    = getEst(op.estagio_id);
    const ganho  = isGanho(est);
    const perdido = isPerdido(est);
    const chk    = chkPct(op.id, op.estagio_id);
    const dias   = diasAte(op.data_sessao || op.data_prev_fechamento);
    const vds    = getVendasOp(op.id);
    const tvend  = totalVendidoOp(op.id);
    const tfat   = totalFaturadoOp(op.id);
    const accent = funil === 'licitacao' ? '#7c3aed' : '#0891b2';

    return (
      <div
        key={op.id}
        draggable
        onDragStart={() => handleDragStart(op.id)}
        onDragEnd={handleDragEnd}
        style={{
          background: dragging === op.id ? '#e0f2fe' : 'white',
          borderRadius: 5, padding: '7px 8px',
          boxShadow: '0 1px 3px rgba(0,0,0,.1)',
          cursor: 'grab', marginBottom: 5,
          borderLeft: `3px solid ${accent}`,
          opacity: dragging === op.id ? .6 : 1,
          userSelect: 'none',
        }}
      >
        {op.tipo_licitacao === 'ata' && (
          <span style={{ fontSize:8, fontWeight:700, background:'#f5f3ff', color:'#7c3aed', padding:'1px 5px', borderRadius:3, display:'inline-block', marginBottom:4 }}>
            📋 Ata Reg. Preços
          </span>
        )}

        <div style={{ fontSize:10, fontWeight:700, color:'#1e293b', lineHeight:1.3, marginBottom:3 }}>{op.titulo}</div>

        {(op.orgao || op.numero_edital) && (
          <div style={{ fontSize:8, color:'#64748b', marginBottom:3 }}>
            {op.numero_edital && <span style={{ fontWeight:600 }}>{op.numero_edital} · </span>}
            {op.orgao}
          </div>
        )}

        {op.responsavel_nome && (
          <div style={{ fontSize:8, color:'#94a3b8', marginBottom:3 }}>👤 {op.responsavel_nome}</div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#0f766e' }}>{fmtMoeda(op.valor_registrado)}</span>
          {dias !== null && !ganho && !perdido && (
            <span style={{
              fontSize:8, padding:'1px 5px', borderRadius:3, fontWeight:700,
              background: dias < 0 ? '#fee2e2' : dias <= 3 ? '#fef9c3' : '#dcfce7',
              color:      dias < 0 ? '#991b1b' : dias <= 3 ? '#854d0e' : '#166534',
            }}>
              {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `+${dias}d`}
            </span>
          )}
        </div>

        {chk && !ganho && !perdido && (
          <div style={{ marginTop:4, paddingTop:4, borderTop:'1px dashed #e2e8f0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ flex:1, height:4, background:'#e2e8f0', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:`${(chk.done/chk.total)*100}%`, height:'100%', borderRadius:2,
                  background: chk.done===chk.total ? '#22c55e' : '#f59e0b' }} />
              </div>
              <span style={{ fontSize:8, color:'#64748b', fontWeight:600 }}>{chk.done}/{chk.total}</span>
            </div>
          </div>
        )}

        {ganho && op.tipo_licitacao === 'ata' && (
          <div style={{ marginTop:5, paddingTop:4, borderTop:'2px solid #86efac', fontSize:8, display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ color:'#64748b' }}>Adesões: <strong>{vds.length}</strong></span>
            <span style={{ color:'#0f766e' }}>Vendido: <strong>{fmtMoeda(tvend)}</strong></span>
            {podeVerTotais && <span style={{ color:'#166534' }}>Faturado: <strong>{fmtMoeda(tfat)}</strong></span>}
            {op.data_validade_ata && (
              <span style={{ color: diasAte(op.data_validade_ata)! < 30 ? '#991b1b' : '#64748b' }}>
                Validade: {fmtData(op.data_validade_ata)}
              </span>
            )}
          </div>
        )}

        {perdido && op.motivo_perda && (
          <div style={{ marginTop:4, fontSize:8, color:'#991b1b', fontWeight:600, fontStyle:'italic' }}>
            Motivo: {op.motivo_perda}
          </div>
        )}

        <div style={{ display:'flex', gap:3, marginTop:5, flexWrap:'wrap' }}>
          {ganho && (
            <>
              <button className="acn-btn" style={{ background:'#2563eb' }}
                onClick={() => { setModalConverter(op); setTipoConverter('op'); setNumOp(''); }}>
                📋 Lançar OP
              </button>
              {funil === 'venda_direta' && (
                <button className="acn-btn" style={{ background:'#ea580c' }}
                  onClick={() => { setModalConverter(op); setTipoConverter('os'); setNumOp(''); }}>
                  🔧 Lançar OS
                </button>
              )}
              <button className="acn-btn" style={{ background:'#0f766e' }}
                onClick={() => { setModalVenda({ op, venda: null }); setFormVenda({ ...VAZIO_VENDA, operador_nome: op.responsavel_nome || '' }); }}>
                + Venda
              </button>
            </>
          )}
          {!perdido && (
            <button className="acn-btn" style={{ background:'#475569' }}
              onClick={() => { setFormOp({ ...VAZIO_OP, ...op }); setModalOp(op); }}>
              ✏️ Editar
            </button>
          )}
          {currentUser?.perfil === 'Admin' && (
            <button className="acn-btn" style={{ background:'#ef4444' }} onClick={() => excluirOp(op)}>✕</button>
          )}
          <CrmAnexosWidget op={op} currentUser={currentUser} />
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // KANBAN
  // ─────────────────────────────────────────────────────────────────────────
  const renderKanban = () => (
    <div style={{ display:'flex', gap:8, alignItems:'flex-start', paddingBottom:8, minWidth:'max-content' }}>
      {estagiosFunil.map(est => {
        const cards   = opsFiltradas.filter(o => o.estagio_id === est.id);
        const ganho   = isGanho(est);
        const perdido = isPerdido(est);
        const hdrBg   = perdido ? '#991b1b' : ganho ? '#166534' : (est.cor || '#1e293b');

        return (
          <div key={est.id} style={{ width:200, flexShrink:0 }}>
            <div style={{ background:hdrBg, color:'white', padding:'4px 8px', borderRadius:'5px 5px 0 0',
              fontSize:9, fontWeight:700, display:'flex', justifyContent:'space-between', alignItems:'center',
              textTransform:'uppercase', letterSpacing:'.4px' }}>
              <span>{est.nome}</span>
              <span style={{ background:'rgba(255,255,255,.2)', borderRadius:8, padding:'1px 6px', fontSize:8 }}>
                {cards.length}
              </span>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(est.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(est.id)}
              style={{
                background: dragOver === est.id ? '#dbeafe' : perdido ? '#fee2e260' : ganho ? '#dcfce760' : '#e8ecf0',
                borderRadius:'0 0 5px 5px', padding:5, minHeight:100, transition:'background .15s',
                border: dragOver === est.id ? '2px dashed #3b82f6' : '2px solid transparent',
              }}
            >
              {cards.map(op => renderCard(op))}
              {!perdido && !ganho && (
                <div
                  onClick={() => { setFormOp({ ...VAZIO_OP, funil, estagio_id: est.id }); setModalOp({}); }}
                  style={{ background:'white', border:'1px dashed #cbd5e1', borderRadius:5, padding:'5px 8px',
                    textAlign:'center', color:'#94a3b8', fontSize:9, cursor:'pointer', marginTop: cards.length ? 4 : 0 }}>
                  + Adicionar
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PAINEL FATURAMENTOS
  // ─────────────────────────────────────────────────────────────────────────
  const vendasFiltradas = vendas.filter(v => {
    const op = ops.find(o => o.id === v.oportunidade_id);
    if (filtFunil !== 'todos' && op?.funil !== filtFunil) return false;
    if (filtFat   !== 'todos' && v.status_faturamento !== filtFat) return false;
    return true;
  });

  const renderFaturamentos = () => (
    <div>
      {podeVerTotais && (
        <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { label:'Total Vendido',  val: totalGeral,         cor:'#0f766e', bg:'#f0fdf4' },
            { label:'Faturado',       val: totalFaturadoGeral, cor:'#166534', bg:'#dcfce7' },
            { label:'A Faturar',      val: totalPendenteGeral, cor:'#854d0e', bg:'#fef9c3' },
          ].map(({ label, val, cor, bg }) => (
            <div key={label} style={{ background:bg, border:`1px solid ${cor}30`, borderRadius:6, padding:'7px 14px', minWidth:140 }}>
              <div style={{ fontSize:8, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:14, fontWeight:700, color:cor }}>{fmtMoeda(val)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {(['todos','pendente','faturado'] as const).map(f => (
          <button key={f} className="acn-btn"
            style={{ background: filtFat===f ? '#1e293b' : '#94a3b8' }}
            onClick={() => setFiltFat(f)}>
            {f === 'todos' ? 'Todos' : f === 'pendente' ? '⏳ Pendentes' : '✓ Faturados'}
          </button>
        ))}
        <span style={{ color:'#e2e8f0' }}>|</span>
        {(['todos','licitacao','venda_direta'] as const).map(f => (
          <button key={f} className="acn-btn"
            style={{ background: filtFunil===f ? '#1e293b' : '#94a3b8' }}
            onClick={() => setFiltFunil(f)}>
            {f === 'todos' ? 'Todos' : f === 'licitacao' ? '🏛️ Licitações' : '💼 V. Diretas'}
          </button>
        ))}
      </div>

      <div style={{ background:'white', borderRadius:8, border:'1px solid #e2e8f0', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9 }}>
          <thead>
            <tr>
              {['Funil','Oportunidade','Órgão/Aderente','Operador','Qtd','Valor Total','NF','Data Fat.','Status',''].map(h => (
                <th key={h} style={{ background:'#1e293b', color:'#cbd5e1', padding:'4px 7px', fontWeight:600, textAlign:'left', fontSize:8, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendasFiltradas.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign:'center', padding:'20px', color:'#94a3b8', fontSize:10 }}>Nenhum registro encontrado</td></tr>
            ) : vendasFiltradas.map(v => {
              const opv = ops.find(o => o.id === v.oportunidade_id);
              return (
                <tr key={v.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'5px 7px' }}>
                    <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:3,
                      background: opv?.funil==='licitacao' ? '#f5f3ff' : '#ecfeff',
                      color:      opv?.funil==='licitacao' ? '#7c3aed'  : '#0e7490' }}>
                      {opv?.funil==='licitacao' ? '🏛️ Lic.' : '💼 VD'}
                    </span>
                  </td>
                  <td style={{ padding:'5px 7px', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    <strong title={opv?.titulo}>{opv?.titulo || '—'}</strong>
                  </td>
                  <td style={{ padding:'5px 7px' }}>{v.orgao_aderente || opv?.orgao || '—'}</td>
                  <td style={{ padding:'5px 7px' }}>{v.operador_nome || '—'}</td>
                  <td style={{ padding:'5px 7px', textAlign:'center' }}>{v.quantidade || '—'}</td>
                  <td style={{ padding:'5px 7px', fontWeight:700, color:'#0f766e' }}>{fmtMoeda(v.valor_total)}</td>
                  <td style={{ padding:'5px 7px' }}>{v.numero_nf || <span style={{ color:'#f59e0b' }}>Pendente</span>}</td>
                  <td style={{ padding:'5px 7px' }}>{fmtData(v.data_faturamento)}</td>
                  <td style={{ padding:'5px 7px' }}>
                    <span style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:10,
                      background: v.status_faturamento==='faturado' ? '#dcfce7' : v.status_faturamento==='cancelado' ? '#fee2e2' : '#fef9c3',
                      color:      v.status_faturamento==='faturado' ? '#166534' : v.status_faturamento==='cancelado' ? '#991b1b' : '#854d0e' }}>
                      {v.status_faturamento==='faturado' ? '✓ Faturado' : v.status_faturamento==='cancelado' ? 'Cancelado' : '⏳ Pendente'}
                    </span>
                  </td>
                  <td style={{ padding:'5px 7px' }}>
                    <button className="acn-btn" style={{ background:'#475569' }}
                      onClick={() => { setModalVenda({ op: opv, venda: v }); setFormVenda({ ...VAZIO_VENDA, ...v }); }}>
                      ✏️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vendasFiltradas.length > 0 && (
          <div style={{ padding:'5px 10px', background:'#f8fafc', borderTop:'1px solid #e2e8f0', display:'flex', gap:12, fontSize:9, color:'#64748b' }}>
            <span>{vendasFiltradas.length} registros</span>
            {podeVerTotais && (
              <span>Total: <strong style={{ color:'#0f766e' }}>
                {fmtMoeda(vendasFiltradas.reduce((s,v)=>s+(v.valor_total||0),0))}
              </strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding:20, color:'#64748b', fontSize:11 }}>Carregando CRM...</div>;

  return (
    <div style={{ padding:'8px 12px' }}>

      {/* ── Navegação principal CRM ── */}
      <div style={{ display:'flex', background:'#0f172a', margin:'-8px -12px 0', padding:'0 12px' }}>
        {/* Funis */}
        {([['licitacao','🏛️ Licitações'],['venda_direta','💼 Vendas Diretas']] as const).map(([f, label]) => (
          <div key={f} onClick={() => { setFunil(f); setSecaoCrm('funil'); }} style={{
            padding:'7px 18px', fontSize:11, fontWeight:700, cursor:'pointer',
            color: secaoCrm==='funil' && funil===f ? (f==='licitacao'?'#a78bfa':'#38bdf8') : '#64748b',
            borderBottom: secaoCrm==='funil' && funil===f ? `3px solid ${f==='licitacao'?'#7c3aed':'#0891b2'}` : '3px solid transparent',
          }}>{label}</div>
        ))}
        {/* Contatos */}
        <div onClick={() => setSecaoCrm('contatos')} style={{
          padding:'7px 18px', fontSize:11, fontWeight:700, cursor:'pointer',
          color: secaoCrm==='contatos' ? '#fb923c' : '#64748b',
          borderBottom: secaoCrm==='contatos' ? '3px solid #ea580c' : '3px solid transparent',
        }}>📇 Contatos</div>

        <div style={{ flex:1 }} />
        {secaoCrm === 'funil' && podeVerFaturamentos && (
          <div style={{ display:'flex', alignItems:'center', gap:4, paddingRight:4 }}>
            {(['kanban','faturamentos'] as const).map(a => (
              <div key={a} onClick={() => setAbaInterna(a)} style={{
                padding:'5px 12px', fontSize:10, fontWeight:700, cursor:'pointer',
                color: abaInterna===a ? 'white' : '#64748b',
                background: abaInterna===a ? '#0f766e' : 'transparent',
                borderRadius:4, margin:'4px 0',
              }}>
                {a==='kanban' ? '📋 Kanban' : '💰 Faturamentos'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Seção Contatos ── */}
      {secaoCrm === 'contatos' && (
        <ContactosSection currentUser={currentUser} />
      )}

      {/* ── Seção Funis (Kanban / Faturamentos) ── */}
      {secaoCrm === 'funil' && <>

      {/* ── Toolbar ── */}
      <div style={{ display:'flex', gap:6, alignItems:'center', margin:'8px 0', flexWrap:'wrap' }}>
        <button className="acn-btn" style={{ background:'#0f766e', fontSize:9, padding:'3px 10px' }}
          onClick={() => { setFormOp({ ...VAZIO_OP, funil }); setModalOp({}); }}>
          + Nova {funil==='licitacao' ? 'Licitação' : 'Venda Direta'}
        </button>
        <input
          placeholder={`🔍 Título, órgão ou edital...`}
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ padding:'3px 8px', border:'1px solid #e2e8f0', borderRadius:4, fontSize:9, width:200 }}
        />
        <span style={{ fontSize:9, color:'#94a3b8' }}>
          {opsFunil.length} registros
          {podeVerTotais && ` · Pipeline: ${fmtMoeda(opsFunil.filter(o=>!isPerdido(getEst(o.estagio_id))&&!isGanho(getEst(o.estagio_id))).reduce((s,o)=>s+(o.valor_registrado||0),0))}`}
        </span>
      </div>

      {/* ── Conteúdo ── */}
      {abaInterna === 'kanban' ? (
        <div style={{ overflowX:'auto' }}>{renderKanban()}</div>
      ) : (
        renderFaturamentos()
      )}

      </> /* fim secaoCrm === 'funil' */}

      {/* ══════ MODAL CRIAR/EDITAR OP ══════ */}
      {modalOp !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalOp(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(540px,96vw)', maxHeight:'90vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'#1e293b' }}>
              {modalOp?.id ? '✏️ Editar' : '+ Nova'} {funil==='licitacao' ? 'Licitação' : 'Venda Direta'}
            </div>

            {funil === 'licitacao' && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Tipo de Licitação</div>
                <div style={{ display:'flex', gap:12 }}>
                  {([['ordinaria','📄 Licitação Ordinária'],['ata','📋 Ata de Registro de Preços']] as const).map(([t,label]) => (
                    <label key={t} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, cursor:'pointer' }}>
                      <input type="radio" checked={formOp.tipo_licitacao===t}
                        onChange={() => setFormOp(f => ({...f, tipo_licitacao:t}))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Campos texto */}
            {([
              { label:'Título *', key:'titulo', placeholder:'Ex: Pregão SESP 2025/041' },
              ...(funil==='licitacao' ? [
                { label:'Número do Edital', key:'numero_edital', placeholder:'2025/041' },
                { label:'Órgão', key:'orgao', placeholder:'Secretaria de Segurança Pública' },
                { label:'Data da Sessão', key:'data_sessao', type:'date' },
                ...(formOp.tipo_licitacao==='ata' ? [{ label:'Validade da Ata', key:'data_validade_ata', type:'date' }] : []),
              ] : []),
              { label:'Valor Estimado (R$)', key:'valor_registrado', placeholder:'Ex: 280000' },
              { label:'Previsão de Fechamento', key:'data_prev_fechamento', type:'date' },
            ] as any[]).map(({ label, key, placeholder, type }) => (
              <div key={key} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>{label}</div>
                <input type={type||'text'} value={formOp[key]||''} placeholder={placeholder}
                  onChange={e => setFormOp(f => ({...f, [key]: e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Estágio Inicial</div>
              <select value={formOp.estagio_id||''} onChange={e => setFormOp(f => ({...f, estagio_id: e.target.value}))}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                <option value="">— Selecione —</option>
                {estagiosFunil.filter(e => !isPerdido(e) && !isGanho(e)).map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Responsável / Operador</div>
              <ColaboradorSelect
                value={formOp.responsavel_nome||''}
                onChange={v => setFormOp(f => ({...f, responsavel_nome: v}))}
                placeholder="Selecione o operador"
              />
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalOp(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarOportunidade} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CHECKLIST GATE ══════ */}
      {modalGate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(420px,96vw)', maxHeight:'80vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:4 }}>📋 Gate Lean — Checklist Obrigatório</div>
            <div style={{ fontSize:9, color:'#92400e', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:4, padding:'5px 8px', marginBottom:10 }}>
              ⚠️ Para avançar para <strong>"{getEst(modalGate.estagioDestId)?.nome}"</strong>, conclua os itens obrigatórios:
            </div>

            {modalGate.itens.map((it: any) => {
              const done = !!modalGate.prog?.find((p: any) => p.item_id === it.id && p.concluido);
              return (
                <div key={it.id} onClick={() => toggleItem(modalGate.op.id, it.id, done)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px dashed #f1f5f9', cursor:'pointer' }}>
                  <div style={{
                    width:16, height:16, borderRadius:3, flexShrink:0,
                    border:`2px solid ${done?'#22c55e':'#d1d5db'}`,
                    background: done ? '#22c55e' : 'white',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    {done && <span style={{ color:'white', fontSize:10, fontWeight:900 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:10, color:'#374151', flex:1 }}>{it.item_texto}</span>
                  {it.obrigatorio && <span style={{ fontSize:7, color:'#ef4444', fontWeight:700, flexShrink:0 }}>OBRIG.</span>}
                </div>
              );
            })}

            {(() => {
              const ok = modalGate.itens.filter((i:any)=>i.obrigatorio).every((i:any)=>modalGate.prog?.find((p:any)=>p.item_id===i.id&&p.concluido));
              return (
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:12 }}>
                  <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalGate(null)}>Cancelar</button>
                  <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px',
                    background: ok ? '#22c55e' : '#94a3b8', cursor: ok ? 'pointer' : 'not-allowed' }}
                    onClick={() => { if (ok) { moverCard(modalGate.op.id, modalGate.estagioDestId); setModalGate(null); } }}>
                    {ok ? '✓ Avançar Estágio' : '🔒 Itens pendentes'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════ MODAL MOTIVO PERDA ══════ */}
      {modalMotivo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(380px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#991b1b', marginBottom:8 }}>❌ Registrar como Não Vencida/Perdida</div>
            <div style={{ fontSize:10, color:'#374151', marginBottom:10 }}>
              Informe o motivo para <strong>"{modalMotivo.op.titulo}"</strong>:
            </div>
            <textarea value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)}
              placeholder="Ex: Preço acima do mercado, prazo incompatível, concorrência..."
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, height:80, resize:'vertical', boxSizing:'border-box' }}
            />
            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:10 }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalMotivo(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#991b1b', fontSize:10, padding:'4px 12px' }} onClick={confirmarPerda}>Confirmar Perda</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CONVERTER OP/OS ══════ */}
      {modalConverter && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:8, width:'min(460px,96vw)', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#166534', marginBottom:8 }}>🏆 Negócio Ganho — Lançar no Sistema</div>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'8px 10px', marginBottom:12 }}>
              <div style={{ fontSize:8, fontWeight:700, color:'#166534', marginBottom:2 }}>OPORTUNIDADE</div>
              <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{modalConverter.titulo}</div>
              {modalConverter.orgao && <div style={{ fontSize:9, color:'#64748b' }}>{modalConverter.orgao}</div>}
              <div style={{ fontSize:10, color:'#0f766e', fontWeight:700, marginTop:2 }}>{fmtMoeda(modalConverter.valor_registrado)}</div>
            </div>

            <div style={{ fontSize:10, fontWeight:700, color:'#374151', marginBottom:8 }}>Tipo de lançamento:</div>
            <div style={{ display:'grid', gridTemplateColumns: funil==='venda_direta' ? '1fr 1fr' : '1fr', gap:8, marginBottom:12 }}>
              {([
                { tipo:'op', icon:'📋', title:'Ordem de Produção', desc:'Equipamentos / instalação / fabricação', dest:'→ Aba Engenharia', cor:'#2563eb' },
                ...(funil==='venda_direta' ? [{ tipo:'os', icon:'🔧', title:'Ordem de Serviço', desc:'Manutenção / suporte técnico / garantia', dest:'→ Aba SAC', cor:'#ea580c' }] : []),
              ] as any[]).map(({ tipo, icon, title, desc, dest, cor }) => (
                <div key={tipo} onClick={() => setTipoConverter(tipo)}
                  style={{ border:`2px solid ${tipoConverter===tipo ? cor : '#e2e8f0'}`,
                    borderRadius:6, padding:'10px 8px', textAlign:'center', cursor:'pointer',
                    background: tipoConverter===tipo ? `${cor}12` : 'white', transition:'all .15s' }}>
                  <div style={{ fontSize:24, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:'#1e293b' }}>{title}</div>
                  <div style={{ fontSize:8, color:'#64748b', margin:'3px 0' }}>{desc}</div>
                  <div style={{ fontSize:8, color:cor, fontWeight:700 }}>{dest}</div>
                </div>
              ))}
            </div>

            {tipoConverter === 'op' && (
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:9, fontWeight:700, color:'#374151', display:'block', marginBottom:3 }}>
                  Número da OP *
                </label>
                <input
                  className="acn-input"
                  style={{ width:'100%', fontSize:11 }}
                  placeholder="Ex: 1234"
                  value={numOp}
                  onChange={e => setNumOp(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div style={{ fontSize:9, color:'#64748b', background:'#f8fafc', borderRadius:4, padding:'5px 8px', marginBottom:10 }}>
              {tipoConverter === 'op'
                ? 'Título → Modelo, Órgão → Cliente. Status: Em Espera Engenharia.'
                : 'Número da OS será gerado automaticamente.'}
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => { setModalConverter(null); setNumOp(''); }}>Cancelar</button>
              <button className="acn-btn" style={{ fontSize:10, padding:'4px 12px',
                background: tipoConverter==='op' ? '#2563eb' : '#ea580c', opacity: salvando?.5:1 }}
                onClick={converterGanho} disabled={salvando}>
                {salvando ? 'Criando...' : tipoConverter==='op' ? '📋 Criar OP' : '🔧 Criar OS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL VENDA / ADESÃO ══════ */}
      {modalVenda && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setModalVenda(null); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(500px,96vw)', maxHeight:'88vh', overflow:'auto', padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:8 }}>
              {modalVenda.venda ? '✏️ Editar Venda' : '+ Registrar Venda / Adesão'}
            </div>
            {modalVenda.op && (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, padding:'6px 10px', marginBottom:12, fontSize:9 }}>
                <strong>{modalVenda.op.titulo}</strong>
                {modalVenda.op.tipo_licitacao === 'ata' && (
                  <span style={{ marginLeft:8, fontSize:8, background:'#f5f3ff', color:'#7c3aed', padding:'1px 5px', borderRadius:3, fontWeight:700 }}>Ata</span>
                )}
              </div>
            )}

            {([
              { label:'Órgão Aderente / Comprador', key:'orgao_aderente', placeholder:'Ex: Corpo de Bombeiros / João Silva LTDA' },
              { label:'Descrição do Item / Serviço', key:'descricao', placeholder:'Ex: 50x Rádio DMR Motorola DP4801e' },
              { label:'Quantidade', key:'quantidade', placeholder:'50' },
              { label:'Valor Unitário (R$)', key:'valor_unitario', placeholder:'6400' },
              { label:'Valor Total (R$) *', key:'valor_total', placeholder:'320000' },
            ] as any[]).map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>{label}</div>
                <input value={formVenda[key]||''} placeholder={placeholder}
                  onChange={e => setFormVenda(f => ({...f,[key]:e.target.value}))}
                  style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Status Faturamento</div>
              <select value={formVenda.status_faturamento} onChange={e => setFormVenda(f => ({...f, status_faturamento: e.target.value}))}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
                <option value="pendente">⏳ Pendente</option>
                <option value="faturado">✓ Faturado</option>
                <option value="cancelado">✕ Cancelado</option>
              </select>
            </div>

            {formVenda.status_faturamento === 'faturado' && (
              <>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Número da NF</div>
                  <input value={formVenda.numero_nf||''} placeholder="Ex: 004821"
                    onChange={e => setFormVenda(f => ({...f, numero_nf:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Data do Faturamento</div>
                  <input type="date" value={formVenda.data_faturamento||''}
                    onChange={e => setFormVenda(f => ({...f, data_faturamento:e.target.value}))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
              </>
            )}

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Operador Responsável (Vendedor)</div>
              <ColaboradorSelect
                value={formVenda.operador_nome||''}
                onChange={v => setFormVenda(f => ({...f, operador_nome:v}))}
                placeholder="Selecione o operador"
              />
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }} onClick={() => setModalVenda(null)}>Cancelar</button>
              <button className="acn-btn" style={{ background:'#0f766e', fontSize:10, padding:'4px 12px', opacity: salvando?.5:1 }}
                onClick={salvarVenda} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
