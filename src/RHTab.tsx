// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const JORNADA_MIN = 527; // 8h47min por dia (8:00–17:47 com 1h almoço)

const TIPOS_LANCAMENTO = [
  { v:'Hora Extra',          grupo:'Crédito',  cor:'#16a34a' },
  { v:'Entrada Antecipada',  grupo:'Crédito',  cor:'#22c55e' },
  { v:'Atraso',              grupo:'Débito',   cor:'#dc2626' },
  { v:'Saída Antecipada',    grupo:'Débito',   cor:'#ef4444' },
  { v:'Falta',               grupo:'Débito',   cor:'#b91c1c' },
  { v:'Declaração',          grupo:'Débito',   cor:'#d97706' },
  { v:'Atestado',            grupo:'Neutro',   cor:'#6b7280' },
  { v:'Férias',              grupo:'Neutro',   cor:'#7c3aed' },
  { v:'Folga',               grupo:'Neutro',   cor:'#2563eb' },
  { v:'Viagem',              grupo:'Neutro',   cor:'#0891b2' },
];

const TIPO_MAP = Object.fromEntries(TIPOS_LANCAMENTO.map(t => [t.v, t]));

const STATUS_COR: Record<string,string> = {
  'Ativo':      '#16a34a',
  'Em Viagem':  '#0891b2',
  'Folga':      '#2563eb',
  'Férias':     '#7c3aed',
  'Afastado':   '#dc2626',
};

// Efeito no banco de horas por tipo
function sinalDoTipo(tipo: string): number {
  const t = TIPO_MAP[tipo];
  if (!t) return 0;
  if (t.grupo === 'Crédito') return 1;
  if (t.grupo === 'Débito')  return -1;
  return 0; // Neutro
}

const fmtMin = (m: number) => {
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const sinal = m < 0 ? '-' : m > 0 ? '+' : '';
  return `${sinal}${h}h${String(min).padStart(2,'0')}`;
};

const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const mesNome = (m: number) => ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m-1];

// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DE PDF DE AUTORIZAÇÃO (abre janela de impressão)
// ─────────────────────────────────────────────────────────────────────────────
function imprimirAutorizacao(aut: any, func: any) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Autorização</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 30px; color: #000; }
    h2 { text-align: center; font-size: 15px; margin-bottom: 4px; }
    .sub { text-align: center; font-size: 11px; margin-bottom: 20px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    td { padding: 6px 10px; border: 1px solid #999; vertical-align: top; }
    .label { font-weight: bold; width: 38%; background: #f5f5f5; }
    .assinatura { display: flex; justify-content: space-between; margin-top: 40px; }
    .assinatura div { width: 45%; text-align: center; }
    .linha { border-top: 1px solid #000; margin-bottom: 4px; }
    .obs { background: #fffbe6; border: 1px solid #ccc; padding: 8px; margin-bottom: 16px; font-size: 11px; }
    @media print { body { margin: 15mm; } }
  </style></head><body>
  <h2>ACN SINAL VERDE — AUTORIZAÇÃO DE ${(aut.tipo||'').toUpperCase()}</h2>
  <div class="sub">Formulário de controle de ponto — ${new Date(aut.data+'T00:00:00').toLocaleDateString('pt-BR', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  <table>
    <tr><td class="label">Funcionário</td><td>${func?.nome || '—'}</td></tr>
    <tr><td class="label">Cargo / Depto.</td><td>${[func?.cargo, func?.departamento].filter(Boolean).join(' — ') || '—'}</td></tr>
    <tr><td class="label">Tipo</td><td><strong>${aut.tipo}</strong></td></tr>
    <tr><td class="label">Data</td><td>${new Date(aut.data+'T00:00:00').toLocaleDateString('pt-BR')}</td></tr>
    <tr><td class="label">Horário de Saída</td><td>${aut.hora_saida || '—'}</td></tr>
    <tr><td class="label">Horário de Retorno</td><td>${aut.hora_retorno || '—'}</td></tr>
    <tr><td class="label">Motivo</td><td>${aut.motivo || '—'}</td></tr>
    <tr><td class="label">Aprovado por</td><td>${aut.aprovado_por || '—'}</td></tr>
  </table>
  <div class="obs">⚠️ Este documento deve ser assinado pelo Gerente Responsável antes da saída/entrada antecipada do funcionário.</div>
  <div class="assinatura">
    <div><div class="linha"></div>Assinatura do Funcionário<br/><small>${func?.nome || ''}</small></div>
    <div><div class="linha"></div>Assinatura do Gerente<br/><small>${aut.aprovado_por || 'Gerente Responsável'}</small></div>
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — CADASTRAR FUNCIONÁRIO
// ─────────────────────────────────────────────────────────────────────────────
function ModalFuncionario({ func, onClose, onSaved }) {
  const vazio = { nome:'', email:'', cpf:'', cargo:'', departamento:'', data_admissao:'' };
  const [form, setForm] = useState(func ? { nome:func.nome, email:func.email||'', cpf:func.cpf||'', cargo:func.cargo||'', departamento:func.departamento||'', data_admissao:func.data_admissao||'' } : vazio);
  const [salvando, setSalvando] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Informe o nome!'); return; }
    setSalvando(true);
    if (func) {
      await supabase.from('rh_funcionarios').update({ ...form }).eq('id', func.id);
    } else {
      await supabase.from('rh_funcionarios').insert([{ ...form, status_presenca:'Ativo', ativo:true }]);
    }
    setSalvando(false); onSaved(); onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(440px,95vw)', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
          <span>{func ? 'Editar Funcionário' : '+ Novo Funcionário'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {[['nome','Nome completo *'],['email','E-mail'],['cpf','CPF'],['cargo','Cargo'],['departamento','Departamento']].map(([k,l])=>(
            <div key={k}>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>{l}</label>
              <input value={form[k]} onChange={e=>set(k,e.target.value)}
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Data de Admissão</label>
            <input type="date" value={form.data_admissao} onChange={e=>set('data_admissao',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? '...' : '✓ Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — LANÇAR HORAS
// ─────────────────────────────────────────────────────────────────────────────
function ModalLancamento({ funcionarios, onClose, onSaved, lancEdit }) {
  const hoje = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(lancEdit ? {
    funcionario_id: lancEdit.funcionario_id,
    data: lancEdit.data,
    tipo: lancEdit.tipo,
    horas: String(Math.floor(lancEdit.minutos/60)),
    minutos_rest: String(lancEdit.minutos%60),
    obs: lancEdit.obs||'',
  } : { funcionario_id:'', data:hoje, tipo:'Hora Extra', horas:'0', minutos_rest:'0', obs:'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  const totalMin = (parseInt(form.horas)||0)*60 + (parseInt(form.minutos_rest)||0);

  const salvar = async () => {
    if (!form.funcionario_id) { alert('Selecione o funcionário!'); return; }
    if (totalMin === 0 && !['Falta','Atestado','Férias','Folga','Viagem'].includes(form.tipo)) {
      alert('Informe horas/minutos!'); return;
    }
    const d = new Date(form.data + 'T00:00:00');
    const payload = {
      funcionario_id: form.funcionario_id,
      data: form.data,
      mes: d.getMonth()+1,
      ano: d.getFullYear(),
      tipo: form.tipo,
      minutos: form.tipo === 'Falta' ? JORNADA_MIN : (totalMin || JORNADA_MIN),
      obs: form.obs,
      criado_por: 'sistema',
    };
    setSalvando(true);
    if (lancEdit) {
      await supabase.from('rh_lancamentos').update(payload).eq('id', lancEdit.id);
    } else {
      await supabase.from('rh_lancamentos').insert([payload]);
    }
    setSalvando(false); onSaved(); onClose();
  };

  const tipoSelecionado = TIPO_MAP[form.tipo];
  const semDuracao = ['Falta','Atestado','Férias','Folga','Viagem'].includes(form.tipo);

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(460px,95vw)', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
          <span>📋 {lancEdit ? 'Editar' : 'Novo'} Lançamento</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Funcionário *</label>
            <select value={form.funcionario_id} onChange={e=>set('funcionario_id',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}>
              <option value="">Selecione...</option>
              {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Data *</label>
            <input type="date" value={form.data} onChange={e=>set('data',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4, textTransform:'uppercase' }}>Tipo *</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {TIPOS_LANCAMENTO.map(t=>(
                <button key={t.v} onClick={()=>set('tipo',t.v)}
                  style={{ padding:'4px 10px', fontSize:10, fontWeight:700, borderRadius:12, cursor:'pointer', border:'none',
                    background: form.tipo===t.v ? t.cor : '#f1f5f9',
                    color: form.tipo===t.v ? '#fff' : '#374151' }}>
                  {t.v}
                </button>
              ))}
            </div>
            {tipoSelecionado && (
              <div style={{ marginTop:4, fontSize:9, color: tipoSelecionado.cor, fontWeight:700 }}>
                {tipoSelecionado.grupo === 'Crédito' ? '↑ Crédito no banco de horas' :
                 tipoSelecionado.grupo === 'Débito'  ? '↓ Débito no banco de horas' :
                 '— Sem efeito no banco de horas'}
              </div>
            )}
          </div>
          {!semDuracao && (
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4, textTransform:'uppercase' }}>Duração</label>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="number" min="0" max="23" value={form.horas} onChange={e=>set('horas',e.target.value)}
                    style={{ width:55, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:12, textAlign:'center' }} />
                  <span style={{ fontSize:10, color:'#6b7280' }}>h</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input type="number" min="0" max="59" value={form.minutos_rest} onChange={e=>set('minutos_rest',e.target.value)}
                    style={{ width:55, padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:12, textAlign:'center' }} />
                  <span style={{ fontSize:10, color:'#6b7280' }}>min</span>
                </div>
                {totalMin > 0 && <span style={{ fontSize:10, color:'#2563eb', fontWeight:700 }}>{fmtMin(sinalDoTipo(form.tipo)*totalMin)}</span>}
              </div>
            </div>
          )}
          {semDuracao && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:4, padding:'6px 10px', fontSize:10, color:'#6b7280' }}>
              {form.tipo === 'Falta' ? '🔴 Será descontado 1 dia (8h47min) do banco de horas.' :
               form.tipo === 'Atestado' ? '✅ Falta abonada — sem desconto no banco de horas.' :
               '📅 Lançado como ausência programada — sem efeito no banco.'}
            </div>
          )}
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Observação</label>
            <textarea value={form.obs} onChange={e=>set('obs',e.target.value)} rows={2}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{ padding:'7px 20px', background:'#2563eb', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? '...' : '✓ Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — AUTORIZAÇÃO DE SAÍDA/ENTRADA
// ─────────────────────────────────────────────────────────────────────────────
function ModalAutorizacao({ funcionarios, onClose, onSaved }) {
  const hoje = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ funcionario_id:'', tipo:'Saída Antecipada', data:hoje, hora_saida:'', hora_retorno:'', motivo:'', aprovado_por:'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  const salvarEImprimir = async () => {
    if (!form.funcionario_id) { alert('Selecione o funcionário!'); return; }
    if (!form.hora_saida) { alert('Informe o horário!'); return; }
    if (!form.motivo.trim()) { alert('Informe o motivo!'); return; }
    setSalvando(true);
    const { data: aut } = await supabase.from('rh_autorizacoes').insert([{ ...form }]).select().single();
    setSalvando(false);
    const func = funcionarios.find(f=>f.id===form.funcionario_id);
    imprimirAutorizacao(aut || form, func);
    onSaved(); onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:8, width:'min(460px,95vw)', boxShadow:'0 8px 32px #0004' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
          <span>🖨️ Autorização de Saída / Entrada</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:16, cursor:'pointer', color:'#6b7280' }}>✕</button>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Funcionário *</label>
            <select value={form.funcionario_id} onChange={e=>set('funcionario_id',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }}>
              <option value="">Selecione...</option>
              {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4, textTransform:'uppercase' }}>Tipo</label>
            <div style={{ display:'flex', gap:8 }}>
              {['Saída Antecipada','Entrada Antecipada'].map(t=>(
                <button key={t} onClick={()=>set('tipo',t)}
                  style={{ flex:1, padding:'6px', border:`1.5px solid ${form.tipo===t?'#2563eb':'#d1d5db'}`,
                    background: form.tipo===t?'#eff6ff':'#fff',
                    color: form.tipo===t?'#1d4ed8':'#374151',
                    borderRadius:4, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Data</label>
            <input type="date" value={form.data} onChange={e=>set('data',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>
                {form.tipo === 'Saída Antecipada' ? 'Horário de Saída *' : 'Horário de Entrada *'}
              </label>
              <input type="time" value={form.hora_saida} onChange={e=>set('hora_saida',e.target.value)}
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>
                {form.tipo === 'Saída Antecipada' ? 'Horário de Retorno' : 'Horário de Saída Normal'}
              </label>
              <input type="time" value={form.hora_retorno} onChange={e=>set('hora_retorno',e.target.value)}
                style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Motivo *</label>
            <textarea value={form.motivo} onChange={e=>set('motivo',e.target.value)} rows={2}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:700, color:'#6b7280', display:'block', marginBottom:2, textTransform:'uppercase' }}>Aprovado por (Gerente)</label>
            <input value={form.aprovado_por} onChange={e=>set('aprovado_por',e.target.value)}
              placeholder="Nome do gerente responsável"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:11, boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 16px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer' }}>Cancelar</button>
          <button onClick={salvarEImprimir} disabled={salvando}
            style={{ padding:'7px 20px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer' }}>
            {salvando ? '...' : '🖨️ Salvar e Imprimir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — PAINEL DE STATUS
// ─────────────────────────────────────────────────────────────────────────────
function PainelStatus({ funcionarios, onRefresh }) {
  const alterarStatus = async (id: string, status: string) => {
    await supabase.from('rh_funcionarios').update({ status_presenca: status }).eq('id', id);
    onRefresh();
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr">👥 Status dos Funcionários</div>
      <div style={{ padding:12, display:'flex', flexWrap:'wrap', gap:10 }}>
        {funcionarios.filter(f=>f.ativo).map(f=>(
          <div key={f.id} style={{ background:'#f8fafc', border:`1.5px solid ${STATUS_COR[f.status_presenca]||'#e2e8f0'}`,
            borderRadius:8, padding:'10px 14px', minWidth:160 }}>
            <div style={{ fontWeight:700, fontSize:12, color:'#1f2937' }}>{f.nome}</div>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:6 }}>{f.cargo || f.departamento || '—'}</div>
            <select value={f.status_presenca}
              onChange={e=>alterarStatus(f.id, e.target.value)}
              style={{ width:'100%', padding:'3px 6px', border:`1px solid ${STATUS_COR[f.status_presenca]||'#d1d5db'}`,
                borderRadius:4, fontSize:10, fontWeight:700,
                background: STATUS_COR[f.status_presenca]+'18',
                color: STATUS_COR[f.status_presenca]||'#374151', cursor:'pointer' }}>
              {['Ativo','Em Viagem','Folga','Férias','Afastado'].map(s=>(
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        ))}
        {funcionarios.filter(f=>f.ativo).length === 0 && (
          <div className="acn-empty">Nenhum funcionário cadastrado.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — BANCO DE HORAS
// ─────────────────────────────────────────────────────────────────────────────
function BancoHoras({ funcionarios, lancamentos, currentUser, onRefresh }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth()+1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [fechando, setFechando] = useState<string|null>(null);

  // Calcula saldo para cada funcionário no mês/ano selecionado
  const lancsMes = lancamentos.filter(l => l.mes === mes && l.ano === ano);

  const calcSaldo = (funcId: string) => {
    const lancs = lancsMes.filter(l => l.funcionario_id === funcId);
    return lancs.reduce((acc, l) => acc + sinalDoTipo(l.tipo) * l.minutos, 0);
  };

  const fecharMes = async (funcId: string, saldo: number) => {
    if (!confirm(`Fechar banco de horas de ${mesNome(mes)}/${ano} para este funcionário? Saldo atual: ${fmtMin(saldo)}`)) return;
    setFechando(funcId);
    await supabase.from('rh_fechamentos').upsert([{
      funcionario_id: funcId, ano, mes, saldo_minutos: saldo,
      fechado_por: currentUser?.nome, fechado_em: new Date().toISOString(),
    }], { onConflict: 'funcionario_id,ano,mes' });
    setFechando(null);
    onRefresh();
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span>⏱️ Banco de Horas</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <select value={mes} onChange={e=>setMes(Number(e.target.value))}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{mesNome(i+1)}</option>)}
          </select>
          <select value={ano} onChange={e=>setAno(Number(e.target.value))}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="sec-body" style={{ overflowX:'auto' }}>
        <table>
          <thead><tr>
            <th>Funcionário</th><th>Cargo</th>
            <th style={{textAlign:'right'}}>Hora Extra</th>
            <th style={{textAlign:'right'}}>Atrasos/Débitos</th>
            <th style={{textAlign:'right'}}>Saldo</th>
            <th>Fechar Mês</th>
          </tr></thead>
          <tbody>
            {funcionarios.filter(f=>f.ativo).map(f=>{
              const lancs = lancsMes.filter(l=>l.funcionario_id===f.id);
              const credito = lancs.filter(l=>sinalDoTipo(l.tipo)>0).reduce((a,l)=>a+l.minutos,0);
              const debito  = lancs.filter(l=>sinalDoTipo(l.tipo)<0).reduce((a,l)=>a+l.minutos,0);
              const saldo   = credito - debito;
              return (
                <tr key={f.id}>
                  <td><strong>{f.nome}</strong></td>
                  <td style={{color:'#6b7280',fontSize:10}}>{f.cargo||'—'}</td>
                  <td style={{textAlign:'right',color:'#16a34a',fontWeight:700}}>{fmtMin(credito)}</td>
                  <td style={{textAlign:'right',color:'#dc2626',fontWeight:700}}>{fmtMin(-debito)}</td>
                  <td style={{textAlign:'right',fontWeight:700,color:saldo>=0?'#16a34a':'#dc2626'}}>
                    {fmtMin(saldo)}
                  </td>
                  <td>
                    <button onClick={()=>fecharMes(f.id, saldo)} disabled={fechando===f.id}
                      style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'3px 10px', fontSize:9, fontWeight:700, cursor:'pointer' }}>
                      {fechando===f.id ? '...' : 'Fechar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — KPI / RELATÓRIO COM GRÁFICO
// ─────────────────────────────────────────────────────────────────────────────
function KpiRH({ funcionarios, lancamentos }) {
  const hoje = new Date();
  const [filtroFunc, setFiltroFunc] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth()+1);
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear());

  const filtered = lancamentos.filter(l =>
    (!filtroFunc || l.funcionario_id === filtroFunc) &&
    (!filtroTipo || l.tipo === filtroTipo) &&
    (l.mes === filtroMes && l.ano === filtroAno)
  );

  // Absenteísmo = faltas + declarações (como % dos dias úteis estimados ~22 dias)
  const DIAS_UTEIS_MES = 22;
  const MINUTOS_MES = DIAS_UTEIS_MES * JORNADA_MIN;

  // Agrupado por funcionário para gráfico
  const porFunc = funcionarios.filter(f=>f.ativo).map(f=>{
    const ls = lancamentos.filter(l=>l.funcionario_id===f.id && l.mes===filtroMes && l.ano===filtroAno);
    return {
      nome: f.nome.split(' ')[0], // primeiro nome
      faltas: ls.filter(l=>l.tipo==='Falta').reduce((a,l)=>a+l.minutos,0),
      atestados: ls.filter(l=>l.tipo==='Atestado').reduce((a,l)=>a+l.minutos,0),
      atrasos: ls.filter(l=>l.tipo==='Atraso').reduce((a,l)=>a+l.minutos,0),
      extras: ls.filter(l=>l.tipo==='Hora Extra').reduce((a,l)=>a+l.minutos,0),
    };
  });

  const maxMin = Math.max(...porFunc.map(p=>Math.max(p.faltas+p.atestados+p.atrasos, p.extras)), 1);

  const CORES = { faltas:'#dc2626', atestados:'#6b7280', atrasos:'#f59e0b', extras:'#16a34a' };

  const BAR_H = 16;

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span>📊 KPI — Absenteísmo & Horas</span>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <select value={filtroFunc} onChange={e=>setFiltroFunc(e.target.value)}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:9 }}>
            <option value="">Todos os funcionários</option>
            {funcionarios.filter(f=>f.ativo).map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:9 }}>
            <option value="">Todos os tipos</option>
            {TIPOS_LANCAMENTO.map(t=><option key={t.v} value={t.v}>{t.v}</option>)}
          </select>
          <select value={filtroMes} onChange={e=>setFiltroMes(Number(e.target.value))}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:9 }}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{mesNome(i+1)}</option>)}
          </select>
          <select value={filtroAno} onChange={e=>setFiltroAno(Number(e.target.value))}
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:9 }}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Gráfico de barras simples em SVG */}
      {porFunc.length > 0 && (
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>
            Gráfico — {mesNome(filtroMes)}/{filtroAno}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            {Object.entries(CORES).map(([k,c])=>(
              <span key={k} style={{ fontSize:9, display:'flex', alignItems:'center', gap:3 }}>
                <span style={{ width:10, height:10, background:c, borderRadius:2, display:'inline-block' }}></span>
                {k.charAt(0).toUpperCase()+k.slice(1)}
              </span>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {porFunc.map(p=>(
              <div key={p.nome} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:60, fontSize:9, color:'#374151', fontWeight:700, textAlign:'right', flexShrink:0 }}>{p.nome}</div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
                  {/* Débitos */}
                  <div style={{ display:'flex', height:BAR_H, borderRadius:3, overflow:'hidden', background:'#f1f5f9' }}>
                    {[['faltas','dc2626'],['atestados','6b7280'],['atrasos','f59e0b']].map(([k,c])=>(
                      p[k]>0 ? <div key={k} style={{ width:`${(p[k]/maxMin)*100}%`, background:`#${c}`, transition:'width .3s' }} title={`${k}: ${fmtMin(p[k])}`}></div> : null
                    ))}
                  </div>
                  {/* Extras */}
                  <div style={{ display:'flex', height:BAR_H, borderRadius:3, overflow:'hidden', background:'#f1f5f9' }}>
                    {p.extras > 0 && <div style={{ width:`${(p.extras/maxMin)*100}%`, background:'#16a34a', transition:'width .3s' }} title={`Hora Extra: ${fmtMin(p.extras)}`}></div>}
                  </div>
                </div>
                <div style={{ width:80, fontSize:9, color:'#6b7280', flexShrink:0 }}>
                  {p.faltas+p.atestados+p.atrasos > 0 && <div style={{color:'#dc2626'}}>↓ {fmtMin(p.faltas+p.atestados+p.atrasos)}</div>}
                  {p.extras > 0 && <div style={{color:'#16a34a'}}>↑ {fmtMin(p.extras)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de lançamentos filtrados */}
      <div className="sec-body" style={{ overflowX:'auto' }}>
        {filtered.length === 0 ? (
          <div className="acn-empty">Nenhum lançamento encontrado.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Data</th><th>Funcionário</th><th>Tipo</th><th style={{textAlign:'right'}}>Duração</th><th>Observação</th>
            </tr></thead>
            <tbody>
              {filtered.map(l=>{
                const func = funcionarios.find(f=>f.id===l.funcionario_id);
                const tipo = TIPO_MAP[l.tipo];
                const sinal = sinalDoTipo(l.tipo);
                return (
                  <tr key={l.id}>
                    <td style={{whiteSpace:'nowrap'}}>{fmtDate(l.data)}</td>
                    <td>{func?.nome||'—'}</td>
                    <td>
                      <span style={{ background:(tipo?.cor||'#6b7280')+'18', color:tipo?.cor||'#6b7280',
                        border:`1px solid ${tipo?.cor||'#6b7280'}30`, borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700 }}>
                        {l.tipo}
                      </span>
                    </td>
                    <td style={{ textAlign:'right', fontWeight:700, color: sinal>0?'#16a34a':sinal<0?'#dc2626':'#6b7280' }}>
                      {sinal!==0 ? fmtMin(sinal*l.minutos) : '—'}
                    </td>
                    <td style={{ fontSize:10, color:'#6b7280' }}>{l.obs||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — AUTORIZAÇÕES REGISTRADAS
// ─────────────────────────────────────────────────────────────────────────────
function ListaAutorizacoes({ funcionarios, autorizacoes, onImprimir }) {
  return (
    <div className="sec-card">
      <div className="sec-hdr">🖨️ Autorizações de Saída / Entrada ({autorizacoes.length})</div>
      <div className="sec-body" style={{ overflowX:'auto' }}>
        {autorizacoes.length === 0 ? (
          <div className="acn-empty">Nenhuma autorização registrada.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Data</th><th>Funcionário</th><th>Tipo</th><th>Saída</th><th>Retorno</th><th>Motivo</th><th>Aprovado por</th><th></th>
            </tr></thead>
            <tbody>
              {autorizacoes.slice(0,50).map(a=>{
                const func = funcionarios.find(f=>f.id===a.funcionario_id);
                return (
                  <tr key={a.id}>
                    <td style={{whiteSpace:'nowrap'}}>{fmtDate(a.data)}</td>
                    <td>{func?.nome||'—'}</td>
                    <td><span style={{ background: a.tipo==='Saída Antecipada'?'#fef2f2':'#eff6ff',
                      color: a.tipo==='Saída Antecipada'?'#dc2626':'#2563eb',
                      borderRadius:10, padding:'1px 7px', fontSize:9, fontWeight:700 }}>{a.tipo}</span></td>
                    <td>{a.hora_saida||'—'}</td>
                    <td>{a.hora_retorno||'—'}</td>
                    <td style={{fontSize:10,color:'#6b7280',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.motivo||'—'}</td>
                    <td style={{fontSize:10}}>{a.aprovado_por||'—'}</td>
                    <td>
                      <button onClick={()=>onImprimir(a, func)}
                        style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:4, padding:'3px 8px', fontSize:9, cursor:'pointer' }}>
                        🖨️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function RHTab({ currentUser }) {
  const [funcionarios, setFuncionarios]   = useState<any[]>([]);
  const [lancamentos, setLancamentos]     = useState<any[]>([]);
  const [autorizacoes, setAutorizacoes]   = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);

  const [modalFunc, setModalFunc]         = useState<'new'|any|null>(null);
  const [modalLanc, setModalLanc]         = useState(false);
  const [modalAut, setModalAut]           = useState(false);

  const isAdmin = true; // acesso já controlado pelo dashboard (abas_permitidas)

  const fetch = useCallback(async () => {
    setLoading(true);
    const [fRes, lRes, aRes] = await Promise.all([
      supabase.from('rh_funcionarios').select('*').eq('ativo', true).order('nome'),
      supabase.from('rh_lancamentos').select('*').order('data', { ascending: false }),
      supabase.from('rh_autorizacoes').select('*').order('data', { ascending: false }),
    ]);
    setFuncionarios(fRes.data || []);
    setLancamentos(lRes.data || []);
    setAutorizacoes(aRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); const t = setInterval(fetch, 60000); return () => clearInterval(t); }, [fetch]);

  const resumo = {
    ativos:    funcionarios.filter(f=>f.status_presenca==='Ativo').length,
    viagem:    funcionarios.filter(f=>f.status_presenca==='Em Viagem').length,
    folga:     funcionarios.filter(f=>f.status_presenca==='Folga').length,
    ferias:    funcionarios.filter(f=>f.status_presenca==='Férias').length,
    afastados: funcionarios.filter(f=>f.status_presenca==='Afastado').length,
  };

  return (
    <div>
      {/* ── Header / KPI cards ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
        {[
          ['👥 Ativos',    resumo.ativos,    '#16a34a'],
          ['✈️ Viagem',    resumo.viagem,    '#0891b2'],
          ['🛋️ Folga',    resumo.folga,     '#2563eb'],
          ['🌴 Férias',   resumo.ferias,    '#7c3aed'],
          ['🏥 Afastados',resumo.afastados, '#dc2626'],
        ].map(([l,v,c])=>(
          <div key={String(l)} style={{ background:'#fff', border:`1px solid ${c}30`, borderLeft:`3px solid ${c}`,
            borderRadius:6, padding:'8px 14px', minWidth:100, boxShadow:'0 1px 3px #0001' }}>
            <div style={{ fontSize:9, color:'#6b7280', textTransform:'uppercase' }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:800, color:c as string, lineHeight:1.2 }}>{v}</div>
          </div>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          {isAdmin && (
            <>
              <button onClick={()=>setModalFunc('new')}
                style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                + Funcionário
              </button>
              <button onClick={()=>setModalLanc(true)}
                style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                📋 Lançar Horas
              </button>
              <button onClick={()=>setModalAut(true)}
                style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                🖨️ Autorização
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : (
        <>
          <PainelStatus funcionarios={funcionarios} onRefresh={fetch} />
          <BancoHoras funcionarios={funcionarios} lancamentos={lancamentos} currentUser={currentUser} onRefresh={fetch} />
          <KpiRH funcionarios={funcionarios} lancamentos={lancamentos} />
          <ListaAutorizacoes
            funcionarios={funcionarios}
            autorizacoes={autorizacoes}
            onImprimir={(a, f) => imprimirAutorizacao(a, f)}
          />
        </>
      )}

      {/* Modais */}
      {modalFunc && (
        <ModalFuncionario
          func={modalFunc === 'new' ? null : modalFunc}
          onClose={()=>setModalFunc(null)}
          onSaved={fetch}
        />
      )}
      {modalLanc && (
        <ModalLancamento
          funcionarios={funcionarios}
          lancEdit={null}
          onClose={()=>setModalLanc(false)}
          onSaved={fetch}
        />
      )}
      {modalAut && (
        <ModalAutorizacao
          funcionarios={funcionarios}
          onClose={()=>setModalAut(false)}
          onSaved={fetch}
        />
      )}
    </div>
  );
}
