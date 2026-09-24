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
import { FLUXOS, soEnvio, terminaEmEnvio } from './FluxoEntrega';
import { ehAdminOuGerente } from './utils/permissoes';
import { ORIGENS } from './OrigemVenda';
import { ColaboradorSelect } from './ColaboradorSelect';
import { TIPOS_SERVICO_TERCEIRO } from './NovaOpOsModal';

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

// ─────────────────────────────────────────────────────────────────────────────
// EDIÇÃO DA OP NO COMERCIAL — antes era feita dentro da própria linha da lista
//
// A linha virava formulário e abria uma faixa extra embaixo: os campos ficavam
// espremidos e boa parte dos dados da OP não tinha onde ser corrigida. Pedido
// do usuário em 24/09/2026: tirar da linha e trazer para um modal com tudo que
// dá para ajustar. Decidido no mesmo dia:
//   • quem edita continua sendo quem já editava na linha (sem trava nova);
//   • o status/fase NÃO entra — continua mudando só pelos botões do fluxo;
//     para corrigir fase existe o "✏️ Editar OP" (Admin/Gerente) acima;
//   • os valores aparecem, mas somem para quem tem `ver_valores` desligado.
//
// Quem grava continua sendo a tela do CRM (salvarOplEdit): é lá que mora a
// regra de desmembrar o lote quando a quantidade aumenta. Aqui é só o
// formulário — por isso o componente é controlado (form + onCampo).
// ─────────────────────────────────────────────────────────────────────────────
type TipoCampoCom = 'texto' | 'textarea' | 'numero' | 'moeda' | 'data' | 'select' | 'centro' | 'colaborador' | 'bool' | 'multi';
type CampoCom = {
  campo: string; rotulo: string; tipo: TipoCampoCom; grupo: string;
  opcoes?: { valor: string; label: string }[];
  dica?: string;
  /** ocupa a linha inteira da grade */
  cheio?: boolean;
  /** só aparece para quem pode ver valores */
  financeiro?: boolean;
  /** só faz sentido quando a OP é envio (ou quando não é) */
  soEnvio?: boolean; soVeiculo?: boolean;
  /** só para OP que em algum momento sai daqui embalada (ver terminaEmEnvio) */
  soFrete?: boolean;
};

const OPC = (lista: string[]) => lista.map(v => ({ valor: v, label: v || '—' }));

export const CAMPOS_OPL_COMERCIAL: CampoCom[] = [
  // ── Identificação ──
  { grupo: 'Identificação', campo: 'cliente_nome', rotulo: 'Cliente', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'cliente_final', rotulo: 'Cliente final', tipo: 'texto', dica: 'quando quem recebe não é quem compra' },
  { grupo: 'Identificação', campo: 'tipo_projeto', rotulo: 'Tipo de projeto', tipo: 'select' },
  { grupo: 'Identificação', campo: 'faturamento_empresa', rotulo: 'Empresa', tipo: 'select', opcoes: OPC(['ACN', 'Detech']) },
  { grupo: 'Identificação', campo: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', dica: 'aumentar oferece desmembrar em unidades /02../NN' },
  { grupo: 'Identificação', campo: 'origem_venda', rotulo: 'Origem da venda', tipo: 'select',
    opcoes: [{ valor: '', label: '— informar —' }, ...ORIGENS.map(o => ({ valor: o.valor, label: `${o.emoji} ${o.label}` }))] },
  { grupo: 'Identificação', campo: 'canal_venda', rotulo: 'Canal de venda', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'vendedor', rotulo: 'Vendedor', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'edital', rotulo: 'Edital', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'proposta', rotulo: 'Proposta', tipo: 'texto' },
  { grupo: 'Identificação', campo: 'numero_nf', rotulo: 'NF-e', tipo: 'texto' },

  // ── Veículo / envio ──
  { grupo: 'Veículo / envio', campo: 'fluxo_entrega', rotulo: '🚦 Fluxo de entrega', tipo: 'select',
    opcoes: [{ valor: '', label: '— Fluxo de entrega —' }, ...FLUXOS.map(f => ({ valor: f.valor, label: f.label }))],
    dica: 'define em qual fila a OP aparece na Produção' },
  { grupo: 'Veículo / envio', campo: 'modelo', rotulo: 'Modelo', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'veiculo', rotulo: 'Equipamento / Veículo', tipo: 'texto', dica: 'Ex.: Rádio Motorola APX' },
  { grupo: 'Veículo / envio', campo: 'chassi', rotulo: 'Chassi', tipo: 'texto', soVeiculo: true },
  { grupo: 'Veículo / envio', campo: 'placa', rotulo: 'Placa', tipo: 'texto', soVeiculo: true },
  { grupo: 'Veículo / envio', campo: 'local_instalacao', rotulo: 'Local de instalação', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_cidade', rotulo: 'Cidade de entrega', tipo: 'texto' },
  { grupo: 'Veículo / envio', campo: 'destino_uf', rotulo: 'UF', tipo: 'select', opcoes: OPC(['', ...UFS]) },
  { grupo: 'Veículo / envio', campo: 'destino_cep', rotulo: 'CEP de entrega', tipo: 'texto', dica: '00000-000' },
  // CIF/FOB não é texto livre: o Almoxarifado compara com 'FOB' na hora de
  // embalar para decidir se abre cotação de frete. Qualquer outra grafia faz
  // a OP cair no caminho do CIF calada (ver AlmoxarifadoTab.tsx).
  { grupo: 'Veículo / envio', campo: 'frete_responsavel', rotulo: '🚚 Frete (CIF/FOB)', tipo: 'select', soFrete: true,
    opcoes: [{ valor: '', label: '— não informado —' },
             { valor: 'CIF', label: 'CIF — a empresa paga o frete' },
             { valor: 'FOB', label: 'FOB — o cliente paga o frete' }],
    dica: 'FOB pula a cotação da Logística: ao embalar, a OP vai direto para a liberação comercial' },
  { grupo: 'Veículo / envio', campo: 'envio_obs', rotulo: 'Observações do envio', tipo: 'textarea', cheio: true, soEnvio: true },

  // ── Datas e prazos ──
  { grupo: 'Datas e prazos', campo: 'data_entrada', rotulo: 'Data de entrada', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_chegada_veiculo', rotulo: 'Recebimento do veículo', tipo: 'data', soVeiculo: true },
  { grupo: 'Datas e prazos', campo: 'data_prevista_entrega', rotulo: 'Previsão de entrega', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_comercial', rotulo: 'Prazo entrega comercial', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_entrega_producao', rotulo: 'Prazo entrega produção', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'data_aceite_cliente', rotulo: 'Aceite do cliente', tipo: 'data' },
  { grupo: 'Datas e prazos', campo: 'prazo_garantia', rotulo: '🛡️ Prazo de garantia', tipo: 'texto', cheio: true,
    dica: 'Ex.: 12 meses a partir da entrega' },

  // ── Faturamento ──
  { grupo: 'Faturamento', campo: 'cnpj_faturamento', rotulo: 'CNPJ / CPF de faturamento', tipo: 'texto', dica: 'pode diferir do cliente' },
  { grupo: 'Faturamento', campo: 'razao_social_faturamento', rotulo: 'Razão social de faturamento', tipo: 'texto' },
  { grupo: 'Faturamento', campo: 'centro_custo', rotulo: '🏷️ Centro de custo', tipo: 'centro' },
  { grupo: 'Faturamento', campo: 'observacoes_faturamento', rotulo: 'Observações de faturamento', tipo: 'textarea', cheio: true },

  // ── Valores ──
  { grupo: 'Valores', campo: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'moeda', financeiro: true },
  { grupo: 'Valores', campo: 'valor_mao_de_obra', rotulo: 'Valor M.O. (R$)', tipo: 'moeda', financeiro: true },
  { grupo: 'Valores', campo: 'valor_mao_de_obra_serralheria', rotulo: 'Valor M.O. serralheria (R$)', tipo: 'moeda', financeiro: true },

  // ── Responsáveis ──
  { grupo: 'Responsáveis', campo: 'responsavel_comercial', rotulo: 'Comercial', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_engenharia', rotulo: 'Engenharia', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_producao', rotulo: 'Produção', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_qualidade', rotulo: 'Qualidade', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_fiscal', rotulo: 'Fiscal', tipo: 'colaborador' },
  { grupo: 'Responsáveis', campo: 'responsavel_almox', rotulo: 'Almoxarifado', tipo: 'colaborador' },

  // ── Serviço de terceiro ──
  // não se aplica a venda de envio (não há veículo para pelicular, blindar...),
  // mesma regra da criação da OP em NovaOpOsModal.tsx
  { grupo: 'Serviço de terceiro', campo: 'servico_terceiro', rotulo: 'Precisa de serviço de terceiro', tipo: 'bool', soVeiculo: true },
  { grupo: 'Serviço de terceiro', campo: 'tipos_servico_terceiro', rotulo: 'Tipos de serviço', tipo: 'multi', cheio: true, soVeiculo: true,
    opcoes: TIPOS_SERVICO_TERCEIRO.map(t => ({ valor: t, label: t })) },
  { grupo: 'Serviço de terceiro', campo: 'obs_servico_terceiro', rotulo: 'Observações do serviço de terceiro', tipo: 'textarea', cheio: true, soVeiculo: true },

  // ── Textos ──
  { grupo: 'Textos e observações', campo: 'resumo_servicos', rotulo: 'Resumo dos serviços', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'especificacoes', rotulo: 'Especificações', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'observacoes_atencao', rotulo: '⚠️ Observações de atenção', tipo: 'textarea', cheio: true },
  { grupo: 'Textos e observações', campo: 'seriais_equipamentos', rotulo: 'Seriais dos equipamentos', tipo: 'textarea', cheio: true },
];
const GRUPOS_COM = [...new Set(CAMPOS_OPL_COMERCIAL.map(c => c.grupo))];

/** Campo do formulário. Controlado: quem guarda o estado é a tela do CRM. */
function EntradaCom({ c, valor, onChange, centrosCusto, tiposProjeto }) {
  const est = { width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
    fontSize: 11, boxSizing: 'border-box' as const, fontFamily: 'inherit' };
  const txt = valor == null ? '' : String(valor);

  if (c.tipo === 'colaborador') {
    return <ColaboradorSelect value={txt} onChange={(v: string) => onChange(v)} placeholder="Selecione..." />;
  }
  if (c.tipo === 'bool') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', cursor: 'pointer', padding: '5px 0' }}>
        <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
        {c.rotulo}
      </label>
    );
  }
  if (c.tipo === 'multi') {
    // o banco guarda uma lista (jsonb); marcar e desmarcar monta a lista
    const marcados: string[] = Array.isArray(valor) ? valor : [];
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '3px 0' }}>
        {(c.opcoes || []).map(o => {
          const sel = marcados.includes(o.valor);
          return (
            <label key={o.valor} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
              color: sel ? '#1d4ed8' : '#334155', fontWeight: sel ? 700 : 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={sel} style={{ cursor: 'pointer' }}
                onChange={() => onChange(sel ? marcados.filter(x => x !== o.valor) : [...marcados, o.valor])} />
              {o.label}
            </label>
          );
        })}
      </div>
    );
  }
  if (c.tipo === 'centro') {
    return (
      <select value={txt} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo}>
        <option value="">— Não definido —</option>
        {(centrosCusto || []).map((x: any) => <option key={x.codigo} value={x.codigo}>{x.codigo} — {x.nome}</option>)}
        {txt && !(centrosCusto || []).some((x: any) => x.codigo === txt) && <option value={txt}>{txt}</option>}
      </select>
    );
  }
  if (c.tipo === 'select') {
    // tipo de projeto é a única lista que vem da tela (cadastro do CRM)
    const ops = c.campo === 'tipo_projeto'
      ? [{ valor: '', label: '— Tipo de projeto —' }, ...(tiposProjeto || []).map((t: string) => ({ valor: t, label: t }))]
      : (c.opcoes || []);
    const conhecido = ops.some(o => o.valor === txt);
    return (
      <select value={txt} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo}>
        {ops.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        {/* valor antigo que saiu da lista continua visível, para não sumir sozinho */}
        {txt && !conhecido && <option value={txt}>{txt} (descontinuado)</option>}
      </select>
    );
  }
  if (c.tipo === 'textarea') {
    return <textarea value={txt} onChange={e => onChange(e.target.value)} rows={3}
      style={{ ...est, resize: 'vertical' }} placeholder={c.dica} aria-label={c.rotulo} />;
  }
  if (c.tipo === 'data') {
    return <input type="date" value={txt.slice(0, 10)} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo} />;
  }
  if (c.tipo === 'numero') {
    return <input type="number" min={1} value={txt} onChange={e => onChange(e.target.value)} style={est} aria-label={c.rotulo} />;
  }
  if (c.tipo === 'moeda') {
    return <input type="number" step="0.01" min={0} inputMode="decimal" value={txt}
      onChange={e => onChange(e.target.value)} style={est} placeholder="0,00" aria-label={c.rotulo} />;
  }
  return <input type="text" value={txt} onChange={e => onChange(e.target.value)} style={est}
    placeholder={c.dica} aria-label={c.rotulo} />;
}

export function ModalOplComercial({ opl, form, onCampo, currentUser, centrosCusto = [], tiposProjeto = [],
                                    salvando = false, onSalvar, onCancelar, onAlterarNumero = null }) {
  const envio = soEnvio(form?.fluxo_entrega ?? opl?.fluxo_entrega);
  // quem não vê valores não vê o grupo inteiro — mesmo tratamento da tela de
  // detalhe da OP, para o valor de venda não vazar por uma tela nova
  const podeVerValores = currentUser?.ver_valores !== false;
  const saiEmbalado = terminaEmEnvio(form?.fluxo_entrega ?? opl?.fluxo_entrega);
  const visivel = (c: CampoCom) => {
    if (c.financeiro && !podeVerValores) return false;
    if (c.soEnvio && !envio) return false;
    if (c.soVeiculo && envio) return false;
    // CIF/FOB só interessa a quem embala e despacha — inclui a serralheria
    // com envio, que não é fila de "envio" mas termina saindo daqui
    if (c.soFrete && !saiEmbalado) return false;
    return true;
  };
  const mudou = (c: CampoCom) => {
    const antes = opl?.[c.campo];
    const agora = form?.[c.campo];
    const norm = (v: any) => v == null ? '' : (c.tipo === 'data' ? String(v).slice(0, 10) : String(v));
    return norm(antes) !== norm(agora);
  };
  const qtdAlterados = CAMPOS_OPL_COMERCIAL.filter(c => visivel(c) && mudou(c)).length;

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }}>
      <div className="modal-box" style={{ maxWidth: 900, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          ✏️ Editar OP {opl?.opl}
          {onAlterarNumero && (
            <button type="button" onClick={onAlterarNumero}
              title="Alterar o número desta OP (só administradores e gerentes)"
              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4,
                padding: '1px 7px', fontSize: 9, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
              ✏️ Alterar nº
            </button>
          )}
          <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b' }}>
            {opl?.cliente_nome || '—'} · {opl?.status_geral || 'sem status'}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
          A fase da OP não se muda por aqui: ela anda pelos botões do fluxo de cada setor.
          {!podeVerValores && ' Os valores estão ocultos para o seu acesso.'}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {GRUPOS_COM.map(g => {
            const campos = CAMPOS_OPL_COMERCIAL.filter(c => c.grupo === g && visivel(c));
            if (!campos.length) return null;
            return (
              <div key={g} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase',
                  borderBottom: '1px solid #e2e8f0', marginBottom: 6, paddingBottom: 2 }}>{g}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                  {campos.map(c => (
                    <div key={c.campo} style={{ gridColumn: (c.cheio || c.tipo === 'textarea') ? '1 / -1' : undefined }}>
                      {c.tipo !== 'bool' && (
                        <label style={{ display: 'block', fontSize: 9, fontWeight: 700, marginBottom: 2,
                          color: mudou(c) ? '#b45309' : '#6b7280', textTransform: 'uppercase' }}>
                          {c.rotulo}{mudou(c) ? ' • alterado' : ''}
                        </label>
                      )}
                      <EntradaCom c={c} valor={form?.[c.campo]} centrosCusto={centrosCusto} tiposProjeto={tiposProjeto}
                        onChange={(v: any) => onCampo(c.campo, v)} />
                      {c.dica && c.tipo !== 'texto' && c.tipo !== 'textarea' && (
                        <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 2 }}>{c.dica}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: qtdAlterados ? '#b45309' : '#94a3b8', fontWeight: 700 }}>
            {qtdAlterados ? `${qtdAlterados} campo${qtdAlterados > 1 ? 's' : ''} alterado${qtdAlterados > 1 ? 's' : ''}` : 'Nada alterado ainda'}
          </span>
          <div style={{ flex: 1 }} />
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onCancelar}>Cancelar</button>
          <button className="acn-btn" style={{ background: '#16a34a', opacity: salvando ? .6 : 1 }} disabled={salvando} onClick={onSalvar}>
            {salvando ? 'Salvando...' : '💾 Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
