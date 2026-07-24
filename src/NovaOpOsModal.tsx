// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// NovaOpOsModal — criação centralizada de OP (Ordem de Produção) ou OS
// Pode ser chamado de qualquer aba: Comercial/CRM, card CRM, SAC, etc.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { ClienteAutocomplete } from './ClienteUtils';
import { ColaboradorSelect } from './ColaboradorSelect';

const TIPOS_PROJETO = [
  { emoji:'🚔', label:'Transformacao Veicular Ostensiva' },
  { emoji:'🥷', label:'Transformacao Veicular Discreta' },
  { emoji:'📻', label:'Radio' },
  { emoji:'📦', label:'Modulo Expansivel' },
  { emoji:'⚓', label:'Flutuante' },
  { emoji:'🔧', label:'Manutencao' },
  { emoji:'⚠️', label:'Garantia' },
  { emoji:'📋', label:'Orcamento' },
  { emoji:'🔨', label:'Execucao por Terceiro' },
  { emoji:'📤', label:'Envio de Material para Terceiro' },
  { emoji:'🛒', label:'Envio de Produto Vendido' },
  { emoji:'🔀', label:'Demanda Direta para Engenharia' },
];

const TIPOS_OS = [
  'Manutenção Corretiva',
  'Manutenção Preventiva',
  'Instalação',
  'Visita Técnica',
  'Treinamento',
  'Garantia',
  'Suporte Remoto',
  'Outro',
];

const VAZIO = {
  tipo:          'OP',   // 'OP' | 'OS'
  empresa:       'ACN',  // 'ACN' | 'Detech'

  // ── Campos OP ────────────────────────────────────────────────────────────
  opl:                  '',
  tipo_projeto:         'Transformacao Veicular Ostensiva',
  chassi:               '',
  modelo:               '',
  quantidade:           1,
  valor_total:          '',
  valor_mao_de_obra:    '',
  prazo_entrega:        '',
  observacoes:          '',

  // ── Campos OS ────────────────────────────────────────────────────────────
  tipo_servico:         'Manutenção Corretiva',
  descricao_problema:   '',
  equipamento:          '',
  numero_serie:         '',

  // ── Comum ─────────────────────────────────────────────────────────────────
  cliente_nome:         '',
  _cliente_id:          null,
  responsavel:          '',
  data_entrada:         new Date().toISOString().split('T')[0],
};

interface Props {
  isOpen:            boolean;
  onClose:           () => void;
  onSaved?:          (record: any, tipo: 'op' | 'os') => void;
  currentUser:       any;
  crmCard?:          any; // card CRM para pré-preenchimento e vínculo
}

export default function NovaOpOsModal({ isOpen, onClose, onSaved, currentUser, crmCard }: Props) {
  const [form, setForm]       = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]       = useState('');

  // Pré-preenche quando crmCard muda
  useEffect(() => {
    if (!isOpen) return;
    if (crmCard) {
      setForm(f => ({
        ...f,
        cliente_nome: crmCard.orgao || crmCard.titulo || '',
        _cliente_id:  crmCard.cliente_id || null,
        responsavel:  crmCard.responsavel_nome || '',
        observacoes:  crmCard.titulo || '',
      }));
    } else {
      setForm({ ...VAZIO, data_entrada: new Date().toISOString().split('T')[0] });
    }
    setErro('');
  }, [isOpen, crmCard?.id]);

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    setErro('');
    if (!form.cliente_nome.trim()) { setErro('Informe o cliente.'); return; }
    if (form.tipo === 'OP' && !form.opl.trim()) { setErro('Informe o número da OP.'); return; }
    if (form.tipo === 'OS' && !form.descricao_problema.trim()) { setErro('Descreva o problema/serviço.'); return; }
    if (!form.prazo_entrega) { setErro('Informe o prazo de entrega.'); return; }
    if (!form.responsavel.trim()) { setErro('Informe o responsável.'); return; }

    setSalvando(true);
    try {
      if (form.tipo === 'OP') {
        // Verificar duplicata
        const { data: existente } = await supabase.from('oples').select('id').eq('opl', form.opl.trim()).maybeSingle();
        if (existente) {
          alert(`OP "${form.opl.trim()}" já está cadastrada. Use um número diferente.`);
          setSalvando(false);
          return;
        }
        const payload: any = {
          opl:                    form.opl.trim(),
          tipo_op:                'OPL',
          faturamento_empresa:    form.empresa,
          tipo_projeto:           form.tipo_projeto,
          chassi:                 form.chassi || null,
          modelo:                 form.modelo || null,
          quantidade:             Number(form.quantidade) || 1,
          valor_total:            form.valor_total ? parseFloat(String(form.valor_total).replace(/\./g,'').replace(',','.')) : null,
          valor_mao_de_obra:      form.valor_mao_de_obra ? parseFloat(String(form.valor_mao_de_obra).replace(/\./g,'').replace(',','.')) : null,
          data_entrada:           form.data_entrada,
          data_prevista_entrega:  form.prazo_entrega || null,
          cliente_nome:           form.cliente_nome.trim(),
          responsavel_comercial:  form.responsavel.trim(),
          observacoes_comercial:  form.observacoes || null,
          status_geral:           'Em Espera Engenharia',
          criado_por:             currentUser?.email,
          criado_por_nome:        currentUser?.nome,
          crm_oportunidade_id:    crmCard?.id || null,
        };
        const { data, error } = await supabase.from('oples').insert([payload]).select().single();
        if (error) throw error;
        onSaved?.(data, 'op');
      } else {
        const payload: any = {
          tipo_servico:         form.tipo_servico,
          descricao_problema:   form.descricao_problema.trim(),
          equipamento:          form.equipamento || null,
          numero_serie:         form.numero_serie || null,
          empresa:              form.empresa,
          cliente_nome:         form.cliente_nome.trim(),
          responsavel_nome:     form.responsavel.trim(),
          data_abertura:        form.data_entrada,
          data_prevista:        form.prazo_entrega || null,
          observacoes:          form.observacoes || null,
          status:               'Aberta',
          criado_por:           currentUser?.id,
          criado_por_nome:      currentUser?.nome,
          crm_oportunidade_id:  crmCard?.id || null,
        };
        const { data, error } = await supabase.from('sac_ordens_servico').insert([payload]).select().single();
        if (error) throw error;
        onSaved?.(data, 'os');
      }
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  const isOP = form.tipo === 'OP';

  return (
    <div style={{ position:'fixed', inset:0, background:'#0009', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:10, width:'min(640px,96vw)', maxHeight:'90vh',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px #0003' }}>

        {/* Header */}
        <div style={{ padding:'14px 18px', background:'#0f172a', color:'#fff', borderRadius:'10px 10px 0 0',
          display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:20 }}>{isOP ? '🔧' : '📋'}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, opacity:.7, fontWeight:700, letterSpacing:.5 }}>
              {crmCard ? `VINCULADO: ${crmCard.titulo}` : 'GERAÇÃO CENTRALIZADA'}
            </div>
            <div style={{ fontSize:14, fontWeight:700 }}>Nova {isOP ? 'Ordem de Produção (OP)' : 'Ordem de Serviço (OS)'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>

          {/* Tipo + Empresa */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Tipo de Documento *</div>
              <div style={{ display:'flex', gap:8 }}>
                {(['OP','OS'] as const).map(t => (
                  <label key={t} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11,
                    background: form.tipo===t ? '#0f172a' : '#f1f5f9', color: form.tipo===t ? '#fff' : '#475569',
                    padding:'5px 14px', borderRadius:6, cursor:'pointer', fontWeight:700, border:'1.5px solid',
                    borderColor: form.tipo===t ? '#0f172a' : '#e2e8f0', transition:'all .15s' }}>
                    <input type="radio" name="tipo" value={t} checked={form.tipo===t}
                      onChange={() => setF('tipo', t)} style={{ display:'none' }} />
                    {t === 'OP' ? '🔧' : '📋'} {t}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:4 }}>Empresa *</div>
              <div style={{ display:'flex', gap:8 }}>
                {(['ACN','Detech'] as const).map(e => (
                  <label key={e} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11,
                    background: form.empresa===e ? '#0369a1' : '#f1f5f9', color: form.empresa===e ? '#fff' : '#475569',
                    padding:'5px 14px', borderRadius:6, cursor:'pointer', fontWeight:700, border:'1.5px solid',
                    borderColor: form.empresa===e ? '#0369a1' : '#e2e8f0', transition:'all .15s' }}>
                    <input type="radio" name="empresa" value={e} checked={form.empresa===e}
                      onChange={() => setF('empresa', e)} style={{ display:'none' }} />
                    {e}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Cliente */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Cliente *</div>
            <ClienteAutocomplete
              value={form.cliente_nome}
              onChange={v => setF('cliente_nome', v)}
              onSelect={c => setForm(f => ({ ...f, cliente_nome: c.nome, _cliente_id: c.id }))}
              placeholder="Nome do cliente..."
            />
          </div>

          {/* Campos OP */}
          {isOP && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Número da OP *</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: 2025.001"
                    value={form.opl} onChange={e => setF('opl', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Tipo de Projeto *</div>
                  <select className="acn-input" style={{ width:'100%' }} value={form.tipo_projeto}
                    onChange={e => setF('tipo_projeto', e.target.value)}>
                    {TIPOS_PROJETO.map(t => (
                      <option key={t.label} value={t.label}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Qtd. Veículos</div>
                  <input className="acn-input" style={{ width:'100%' }} type="number" min={1}
                    value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Chassi</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Opcional"
                    value={form.chassi} onChange={e => setF('chassi', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Modelo</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Opcional"
                    value={form.modelo} onChange={e => setF('modelo', e.target.value)} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Valor Total (R$)</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: 45000"
                    value={form.valor_total} onChange={e => setF('valor_total', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Valor M.O. (R$)</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: 12000"
                    value={form.valor_mao_de_obra} onChange={e => setF('valor_mao_de_obra', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Campos OS */}
          {!isOP && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Tipo de Serviço *</div>
                  <select className="acn-input" style={{ width:'100%' }} value={form.tipo_servico}
                    onChange={e => setF('tipo_servico', e.target.value)}>
                    {TIPOS_OS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Equipamento</div>
                  <input className="acn-input" style={{ width:'100%' }} placeholder="Ex: Rádio Motorola APX"
                    value={form.equipamento} onChange={e => setF('equipamento', e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Descrição do problema / serviço *</div>
                <textarea className="acn-input" rows={3} style={{ width:'100%', resize:'vertical' }}
                  placeholder="Descreva o que precisa ser feito..."
                  value={form.descricao_problema} onChange={e => setF('descricao_problema', e.target.value)} />
              </div>
            </>
          )}

          {/* Campos comuns */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Data de Entrada *</div>
              <input type="date" className="acn-input" style={{ width:'100%' }}
                value={form.data_entrada} onChange={e => setF('data_entrada', e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Prazo de Entrega *</div>
              <input type="date" className="acn-input" style={{ width:'100%' }}
                value={form.prazo_entrega} onChange={e => setF('prazo_entrega', e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Responsável *</div>
            <ColaboradorSelect
              value={form.responsavel}
              onChange={v => setF('responsavel', v)}
              placeholder="Selecione o responsável..."
            />
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Observações</div>
            <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical' }}
              placeholder="Observações adicionais..."
              value={form.observacoes} onChange={e => setF('observacoes', e.target.value)} />
          </div>

          {/* Vínculo CRM */}
          {crmCard && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:6,
              padding:'8px 10px', fontSize:10, color:'#15803d' }}>
              🔗 Esta {isOP ? 'OP' : 'OS'} será vinculada ao card CRM: <strong>{crmCard.titulo}</strong>
            </div>
          )}

          {erro && (
            <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:5,
              padding:'8px 10px', fontSize:10, color:'#dc2626', marginTop:8 }}>
              ⚠️ {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 18px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1',
              borderRadius:6, padding:'7px 16px', fontSize:11, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ background: isOP ? '#0f766e' : '#7c3aed', color:'#fff', border:'none',
              borderRadius:6, padding:'7px 20px', fontSize:11, fontWeight:700, cursor:'pointer',
              opacity: salvando ? .6 : 1 }}>
            {salvando ? 'Salvando...' : `✅ Criar ${isOP ? 'OP' : 'OS'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
