// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OplEdicao — edição completa de OP por Admin/Gerente, uma a uma ou em lote
//
// Todos os campos e valores da OP, inclusive o status (a OP muda de fase sem
// passar pelos botões do fluxo). Por isso o motivo é obrigatório e cada
// alteração fica no histórico da OP (logs_movimentacao_opl: campo, antes e
// depois) e na auditoria (logChange). Nada é apagado.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { FLUXOS } from './FluxoEntrega';
import { ehAdminOuGerente } from './utils/permissoes';

export const podeEditarOplCompleta = (u: any) => ehAdminOuGerente(u);

// Fases da OP (mesma ordem do pipeline em AcnTabShared)
export const STATUS_OPL = [
  'Em Espera Engenharia', 'Em Analise Engenharia', 'Devolvida para Engenharia', 'Devolvida Comercial',
  'Em Espera PCP', 'Devolvida PCP', 'Aguardando Almox', 'Kit OK - Aguardando PCP',
  'Aguardando Inicio Producao', 'Aguardando Agendamento Manutenção', 'Manutenção Agendada', 'Em Producao',
  'Retrabalho', 'Aguardando CQ', 'Aguardando Embalagem', 'Aguardando Cotacao Frete',
  'Aprovado CQ - Aguardando Liberacao Comercial', 'Aguarda Emissao NF', 'Faturado',
  'Faturado e Disponivel para Entrega', 'Cancelado',
];
const STATUS_ALMOX = ['', 'Kit OK', 'Falta de Material', 'Liberado com Pendencia'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

type Campo = { campo: string; rotulo: string; tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'select' | 'textarea'; opcoes?: string[]; grupo: string };
export const CAMPOS_OPL: Campo[] = [
  { grupo: 'Identificação', campo: 'cliente_nome', rotulo: 'Cliente', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'tipo_projeto', rotulo: 'Tipo de projeto', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'faturamento_empresa', rotulo: 'Empresa (faturamento)', tipo: 'select', opcoes: ['ACN', 'Detech'] },
  { grupo: 'Identificação', campo: 'quantidade', rotulo: 'Quantidade', tipo: 'numero' },
  { grupo: 'Identificação', campo: 'numero_nf', rotulo: 'NF-e', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'modelo', rotulo: 'Modelo', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'chassi', rotulo: 'Chassi', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'placa', rotulo: 'Placa', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'local_instalacao', rotulo: 'Local de instalação', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'fluxo_entrega', rotulo: 'Fluxo de entrega', tipo: 'select', opcoes: ['', ...FLUXOS.map(f => f.valor)] },
  { grupo: 'Veículo / envio', campo: 'destino_cidade', rotulo: 'Cidade de destino', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_uf', rotulo: 'UF de destino', tipo: 'select', opcoes: ['', ...UFS] },
  { grupo: 'Veículo / envio', campo: 'destino_cep', rotulo: 'CEP de destino', tipo: 'texto' },
  { grupo: 'Datas e prazos', campo: 'data_entrada', rotulo: 'Data de entrada', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_chegada_veiculo', rotulo: 'Recebimento do veículo', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_prevista_entrega', rotulo: 'Previsão de entrega', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_comercial', rotulo: 'Prazo entrega comercial', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_producao', rotulo: 'Prazo entrega produção', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_aceite_cliente', rotulo: 'Aceite do cliente', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_garantia', rotulo: 'Prazo de garantia', tipo: 'texto' },
  { grupo: 'Valores', campo: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'moeda' },
  { grupo: 'Valores', campo: 'valor_mao_de_obra', rotulo: 'Valor M.O. (R$)', tipo: 'moeda' },
  { grupo: 'Valores', campo: 'valor_mao_de_obra_serralheria', rotulo: 'Valor M.O. serralheria (R$)', tipo: 'moeda' },
  { grupo: 'Status', campo: 'status_geral', rotulo: 'Status geral (fase)', tipo: 'select', opcoes: STATUS_OPL },
  { grupo: 'Status', campo: 'status_bom', rotulo: 'Status BOM', tipo: 'texto' },
  { grupo: 'Status', campo: 'status_almox', rotulo: 'Status Almoxarifado', tipo: 'select', opcoes: STATUS_ALMOX },
  { grupo: 'Responsáveis', campo: 'responsavel_comercial', rotulo: 'Comercial', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_engenharia', rotulo: 'Engenharia', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_almox', rotulo: 'Almoxarifado', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_producao', rotulo: 'Produção', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_fiscal', rotulo: 'Fiscal', tipo: 'texto' },
  { grupo: 'Responsáveis', campo: 'responsavel_qualidade', rotulo: 'Qualidade', tipo: 'texto' },
  { grupo: 'Textos', campo: 'resumo_servicos', rotulo: 'Resumo dos serviços', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'seriais_equipamentos', rotulo: 'Seriais dos equipamentos', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'textarea' },
  { grupo: 'Textos', campo: 'observacoes_atencao', rotulo: 'Observações de atenção', tipo: 'textarea' },
];
const GRUPOS = [...new Set(CAMPOS_OPL.map(c => c.grupo))];

// valor do banco → texto do formulário
const paraForm = (c: Campo, v: any) => {
  if (v == null) return '';
  if (c.tipo === 'data') return String(v).slice(0, 10);
  if (c.tipo === 'moeda') return String(v).replace('.', ',');
  return String(v);
};
// texto do formulário → valor do banco
const paraBanco = (c: Campo, t: string) => {
  const s = String(t ?? '').trim();
  if (!s) return null;
  if (c.tipo === 'numero') { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; }
  if (c.tipo === 'moeda') { const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : null; }
  return s;
};
const mostrar = (c: Campo, v: any) => {
  if (v == null || v === '') return '—';
  if (c.tipo === 'data') return new Date(String(v).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  if (c.tipo === 'moeda') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v);
};

function Entrada({ c, valor, onChange }: { c: Campo; valor: string; onChange: (v: string) => void }) {
  const est = { width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11, boxSizing: 'border-box' as const };
  if (c.tipo === 'select') {
    const ops = c.opcoes || [];
    return (
      <select value={valor} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo}>
        {ops.map(o => <option key={o} value={o}>{o || '—'}</option>)}
        {valor && !ops.includes(valor) && <option value={valor}>{valor}</option>}
      </select>
    );
  }
  if (c.tipo === 'textarea') return <textarea value={valor} onChange={e => onChange(e.target.value)} rows={3} style={{ ...est, resize: 'vertical' }} aria-label={c.rotulo} />;
  return (
    <input type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'} inputMode={c.tipo === 'moeda' ? 'decimal' : undefined}
      value={valor} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo} />
  );
}

/** Aplica as alterações em cada OP, com histórico e auditoria. Devolve as falhas. */
async function aplicar(ops: any[], mudancas: (op: any) => Record<string, any>, motivo: string, currentUser: any, origem: string) {
  const falhas: string[] = [];
  const agora = new Date().toISOString();
  for (const op of ops) {
    const upd = mudancas(op);
    const campos = Object.keys(upd).filter(k => String(op[k] ?? '') !== String(upd[k] ?? ''));
    if (!campos.length) continue;
    const alteracao = Object.fromEntries(campos.map(k => [k, upd[k]]));
    const { error } = await supabase.from('oples').update(alteracao).eq('id', op.id);
    if (error) { falhas.push(`${op.opl}: ${error.message}`); continue; }
    logChange({ module: 'oples', entityType: 'oples', entityId: op.id, changeType: 'UPDATE',
      oldRow: Object.fromEntries(campos.map(k => [k, op[k]])), newRow: alteracao, user: currentUser });
    const texto = campos.map(k => {
      const c = CAMPOS_OPL.find(x => x.campo === k);
      return `${c?.rotulo || k}: ${c ? mostrar(c, op[k]) : op[k]} → ${c ? mostrar(c, upd[k]) : upd[k]}`;
    }).join('; ');
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: op.id, numero_opl: op.opl, setor: currentUser?.perfil || 'Admin',
      evento: `${origem} por ${currentUser?.nome || '—'} — ${texto}. Motivo: ${motivo}`,
      status_anterior: op.status_geral, status_novo: alteracao.status_geral ?? op.status_geral,
      usuario_nome: currentUser?.nome || null, usuario_email: currentUser?.email || null, data_hora: agora,
    }]);
  }
  return falhas;
}

// ── Edição completa de uma OP ────────────────────────────────────────────────
export function ModalEditarOpl({ opl, currentUser, onClose, onSalvo }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS_OPL.map(c => [c.campo, paraForm(c, opl[c.campo])])));
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const alterados = CAMPOS_OPL.filter(c => String(paraBanco(c, form[c.campo]) ?? '') !== String(opl[c.campo] ?? '').slice(0, c.tipo === 'data' ? 10 : undefined));
  const salvar = async () => {
    if (!alterados.length) { alert('Nenhum campo foi alterado.'); return; }
    if (!motivo.trim()) { alert('Informe o motivo da alteração.'); return; }
    setSalvando(true);
    const falhas = await aplicar([opl], () => Object.fromEntries(alterados.map(c => [c.campo, paraBanco(c, form[c.campo])])),
      motivo.trim(), currentUser, 'Edição completa');
    setSalvando(false);
    if (falhas.length) { alert('Não foi possível salvar:\n' + falhas.join('\n')); return; }
    const { data } = await supabase.from('oples').select('*').eq('id', opl.id).maybeSingle();
    onSalvo(data || { ...opl });
  };
  return (
    <div className="modal-overlay" style={{ zIndex: 2200 }}>
      <div className="modal-box" style={{ maxWidth: 760, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">✏️ Editar OP {opl.opl}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
          Edição completa (Admin/Gerente). O status muda a fase da OP sem passar pelos botões do fluxo: use com cuidado.
          Cada campo alterado fica no histórico da OP com o valor anterior.
        </div>
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {GRUPOS.map(g => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', marginBottom: 6, paddingBottom: 2 }}>{g}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {CAMPOS_OPL.filter(c => c.grupo === g).map(c => {
                  const mudou = alterados.includes(c);
                  return (
                    <div key={c.campo} style={{ gridColumn: c.tipo === 'textarea' ? '1 / -1' : undefined }}>
                      <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: mudou ? '#b45309' : '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>
                        {c.rotulo}{mudou ? ' • alterado' : ''}
                      </label>
                      <Entrada c={c} valor={form[c.campo]} onChange={v => setForm(f => ({ ...f, [c.campo]: v }))} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 6 }}>
          <label className="acn-label">Motivo da alteração * {alterados.length ? `(${alterados.length} campo${alterados.length > 1 ? 's' : ''} alterado${alterados.length > 1 ? 's' : ''})` : ''}</label>
          <input className="acn-input" style={{ width: '100%', marginBottom: 8 }} value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: correção do prazo combinado com o cliente" aria-label="Motivo da alteração" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="acn-btn" style={{ background: '#2563eb', flex: 1, opacity: salvando ? .6 : 1 }} disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edição em lote: um campo, um valor, várias OPs ───────────────────────────
export function ModalEditarOplLote({ ops, currentUser, onClose, onSalvo }) {
  const [campo, setCampo] = useState(CAMPOS_OPL[0].campo);
  const c = CAMPOS_OPL.find(x => x.campo === campo)!;
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setValor(c.tipo === 'select' ? (c.opcoes?.[0] ?? '') : ''); }, [campo]);
  const salvar = async () => {
    if (!motivo.trim()) { alert('Informe o motivo da alteração.'); return; }
    const novo = paraBanco(c, valor);
    if (novo == null && !confirm(`Deixar "${c.rotulo}" em branco nas ${ops.length} OPs?`)) return;
    setSalvando(true);
    const falhas = await aplicar(ops, () => ({ [c.campo]: novo }), motivo.trim(), currentUser, `Edição em lote (${ops.length} OPs)`);
    setSalvando(false);
    if (falhas.length) alert('Algumas OPs não foram alteradas:\n' + falhas.join('\n'));
    onSalvo();
  };
  const iguais = ops.filter(o => String(o[c.campo] ?? '').slice(0, c.tipo === 'data' ? 10 : undefined) === String(paraBanco(c, valor) ?? '')).length;
  return (
    <div className="modal-overlay" style={{ zIndex: 2200 }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-title">✏️ Editar {ops.length} OPs de uma vez</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, maxHeight: 60, overflowY: 'auto' }}>
          {ops.map(o => o.opl).join(' · ')}
        </div>
        <label className="acn-label">Campo</label>
        <select className="acn-input" style={{ width: '100%', marginBottom: 8 }} value={campo} onChange={e => setCampo(e.target.value)} aria-label="Campo a alterar">
          {GRUPOS.map(g => (
            <optgroup key={g} label={g}>
              {CAMPOS_OPL.filter(x => x.grupo === g).map(x => <option key={x.campo} value={x.campo}>{x.rotulo}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="acn-label">Novo valor</label>
        <div style={{ marginBottom: 4 }}><Entrada c={c} valor={valor} onChange={setValor} /></div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
          {iguais ? `${iguais} de ${ops.length} já estão com este valor e não mudam.` : `Muda nas ${ops.length} OPs.`}
          {c.campo === 'status_geral' && ' Mudar o status tira as OPs da fase atual sem passar pelo fluxo.'}
        </div>
        <label className="acn-label">Motivo da alteração *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 10 }} value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ex.: cliente adiou a entrega de todo o lote" aria-label="Motivo da alteração em lote" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#2563eb', flex: 1, opacity: salvando ? .6 : 1 }} disabled={salvando} onClick={salvar}>
            {salvando ? 'Aplicando...' : `Aplicar em ${ops.length - iguais} OP${ops.length - iguais === 1 ? '' : 's'}`}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
