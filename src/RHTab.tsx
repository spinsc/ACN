// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { logChange, useFieldHighlight, useUnreadMap } from './AuditSystem';
import { combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import { hojeISO, diaISO, Botao, Selo, Chips, Faixa } from './Interface';
import Icone from './Icone';
import { mdiPlus, mdiClipboardTextOutline, mdiPrinterOutline, mdiChevronDown, mdiChevronRight, mdiChevronUp, mdiPencilOutline, mdiTrashCanOutline, mdiAccountGroupOutline, mdiAccountOffOutline, mdiTimerOutline, mdiChartBoxOutline, mdiClose, mdiCheck, mdiInformationOutline } from '@mdi/js';

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
  'Desligado':  '#6b7280',
};

// ─── Peças visuais do RH (Etapa 12c1, 01/10/2026) ────────────────────────────
// Só aparência: as contas, os filtros e o que cada quadro mostra são os de antes. A cor do status de presença e a do tipo de
// lançamento vêm do `Selo` / da família (uma cor por família, igual às outras telas). Os hex de STATUS_COR e de TIPOS_LANCAMENTO
// continuam valendo para as janelas e os relatórios que ainda não foram migrados (12c2 a 12c4).
const FAMILIA_PRESENCA = { 'Ativo': 'ok', 'Em Viagem': 'info', 'Folga': 'info', 'Férias': 'marca', 'Afastado': 'erro', 'Desligado': 'neutro' };
const FAMILIA_LANCAMENTO = {
  'Hora Extra': 'ok', 'Entrada Antecipada': 'ok', 'Atraso': 'atencao', 'Saída Antecipada': 'atencao', 'Falta': 'erro',
  'Declaração': 'atencao', 'Atestado': 'neutro', 'Férias': 'marca', 'Folga': 'info', 'Viagem': 'info',
};
function Indicadores({ itens, compacto = false }) {
  return (
    <div className={'acn-kpis' + (compacto ? ' acn-kpis-compactos' : '')}>
      {itens.map(k => (
        <div key={k.l} className="acn-kpi">
          <span className="rot"><i data-acn-familia={k.tom || 'neutro'} />{k.l}</span>
          <span className="val acn-num">{k.v}</span>
        </div>
      ))}
    </div>
  );
}

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
  // isTerceiro: verifica pelo cadastro do colaborador OU pelo tipo já gravado no banco
  const isTerceiro = func?.tipo_colaborador === 'Terceiro'
    || (aut.tipo||'').startsWith('Comunicação');
  const isSaida = (aut.tipo||'').includes('Saída');
  // Para reimpressão de registros antigos (tipo = 'Saída Antecipada'), normaliza o label
  const tipoBaseLabel = isTerceiro && !(aut.tipo||'').startsWith('Comunicação')
    ? (isSaida ? 'Comunicação de Saída Antecipada' : 'Comunicação de Entrada Antecipada')
    : (aut.tipo || '—');
  const tipoLabel = tipoBaseLabel;
  // Título do documento: Autorização (funcionário) ou Comunicação (terceiro)
  const tituloDoc = isTerceiro
    ? `COMUNICAÇÃO DE ${(isSaida ? 'SAÍDA ANTECIPADA' : 'ENTRADA ANTECIPADA')}`
    : `AUTORIZAÇÃO DE ${(isSaida ? 'SAÍDA ANTECIPADA' : 'ENTRADA ANTECIPADA')}`;
  const obsDoc = isTerceiro
    ? 'ℹ️ Este documento registra a comunicação de saída/entrada antecipada do prestador de serviços.'
    : '⚠️ Este documento deve ser assinado pelo Gerente Responsável antes da saída/entrada antecipada do funcionário.';
  const labelColaborador = isTerceiro ? 'Prestador / Terceiro' : 'Funcionário';
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>${tituloDoc}</title>
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
  <h2>ACN SINAL VERDE — ${tituloDoc}</h2>
  <div class="sub">Formulário de controle de ponto — ${new Date(aut.data+'T00:00:00').toLocaleDateString('pt-BR', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  <table>
    <tr><td class="label">${labelColaborador}</td><td>${func?.nome || '—'}</td></tr>
    <tr><td class="label">Cargo / Depto.</td><td>${[func?.cargo, func?.departamento].filter(Boolean).join(' — ') || '—'}</td></tr>
    <tr><td class="label">Tipo</td><td><strong>${tipoLabel}</strong></td></tr>
    <tr><td class="label">Data</td><td>${new Date(aut.data+'T00:00:00').toLocaleDateString('pt-BR')}</td></tr>
    <tr><td class="label">${isSaida ? 'Horário de Saída' : 'Horário de Entrada'}</td><td>${aut.hora_saida || '—'}</td></tr>
    <tr><td class="label">${isSaida ? 'Horário de Retorno' : 'Horário de Saída Normal'}</td><td>${aut.hora_retorno || '—'}</td></tr>
    <tr><td class="label">Motivo</td><td>${aut.motivo || '—'}</td></tr>
    <tr><td class="label">${isTerceiro ? 'Ciente por' : 'Aprovado por'}</td><td>${aut.aprovado_por || '—'}</td></tr>
  </table>
  <div class="obs">${obsDoc}</div>
  <div class="assinatura">
    <div><div class="linha"></div>Assinatura do ${isTerceiro ? 'Prestador' : 'Funcionário'}<br/><small>${func?.nome || ''}</small></div>
    <div><div class="linha"></div>${isTerceiro ? 'Ciente — Gerente / Responsável' : 'Assinatura do Gerente'}<br/><small>${aut.aprovado_por || 'Gerente Responsável'}</small></div>
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — CADASTRAR FUNCIONÁRIO
// ─────────────────────────────────────────────────────────────────────────────
// ─── Uniforme, endereço e contato de emergência ─────────────────────────────
const TAMANHOS_CAMISETA = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
const TAMANHOS_CALCA = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];
const TAMANHOS_SAPATO = Array.from({ length: 14 }, (_, i) => String(33 + i));   // 33 a 46
const PARENTESCOS = ['Cônjuge', 'Companheiro(a)', 'Pai', 'Mãe', 'Filho(a)', 'Irmão(ã)', 'Avô/Avó', 'Tio(a)', 'Amigo(a)', 'Outro'];
const UFS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const CAMPOS_EXTRAS_FUNC = ['tamanho_camiseta', 'tamanho_calca', 'tamanho_sapato', 'cep', 'endereco_logradouro', 'endereco_numero', 'endereco_complemento', 'endereco_bairro', 'endereco_cidade', 'endereco_uf', 'emergencia_nome', 'emergencia_parentesco', 'emergencia_telefone'];

// Consulta o CEP (ViaCEP) e devolve rua, bairro, cidade e UF, ou null
async function consultarCep(cep: string) {
  const num = String(cep || '').replace(/\D/g, '');
  if (num.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${num}/json/`);
    const j = await r.json();
    if (j?.erro) return null;
    return { endereco_logradouro: j.logradouro || '', endereco_bairro: j.bairro || '', endereco_cidade: j.localidade || '', endereco_uf: j.uf || '' };
  } catch { return null; }
}

function ModalFuncionario({ func, onClose, onSaved, currentUser }) {
  const { campoDestaque, marcarComoLido } = useFieldHighlight('rh_funcionarios', func?.id, currentUser);
  const fecharModal = () => { marcarComoLido(); onClose(); };
  const vazio = {
    nome:'', email:'', cpf:'', cnpj:'', cargo:'', departamento:'', data_admissao:'',
    tipo_colaborador:'Funcionário',
    salario:'', valor_servicos:'',
    recebe_comissao: false, percentual_comissao:'', incide_em:'Faturamento',
    ...Object.fromEntries(CAMPOS_EXTRAS_FUNC.map(k => [k, ''])),
  };
  const [form, setForm] = useState(func ? {
    nome: func.nome||'', email: func.email||'', cpf: func.cpf||'', cnpj: func.cnpj||'',
    cargo: func.cargo||'', departamento: func.departamento||'',
    data_admissao: func.data_admissao||'',
    tipo_colaborador: func.tipo_colaborador||'Funcionário',
    salario: func.salario!=null ? String(func.salario) : '',
    valor_servicos: func.valor_servicos!=null ? String(func.valor_servicos) : '',
    recebe_comissao: func.recebe_comissao||false,
    percentual_comissao: func.percentual_comissao!=null ? String(func.percentual_comissao) : '',
    incide_em: func.incide_em||'Faturamento',
    ...Object.fromEntries(CAMPOS_EXTRAS_FUNC.map(k => [k, func[k] || ''])),
  } : vazio);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState('');
  const preencherPeloCep = async (cep: string) => {
    if (String(cep).replace(/\D/g, '').length !== 8) { setAvisoCep(''); return; }
    setBuscandoCep(true);
    const achado = await consultarCep(cep);
    setBuscandoCep(false);
    if (!achado) { setAvisoCep('CEP não encontrado. Preencha o endereço à mão.'); return; }
    setAvisoCep('');
    setForm(f => ({ ...f, ...achado }));
  };
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setForm(f=>({...f,[k]:v}));

  const lbl = (txt) => (
    <label className="acn-label">{txt}</label>
  );
  const inp = (k, placeholder='', type='text') => (
    <input className="acn-input" type={type} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={placeholder} />
  );
  // Etapa 12c2 (01/10/2026): a fileira de botões coloridos virou o `Chips` do design system (mesmas opções, mesmo valor gravado).
  const toggle = (options, key) => (
    <Chips ativo={String(form[key])} onChange={v => set(key, v)} itens={options.map(([val, label]) => ({ id: val, rotulo: label }))} />
  );

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Informe o nome!'); return; }
    setSalvando(true);
    const payload = {
      nome: form.nome.trim(), email: form.email.trim(), cpf: form.cpf.trim(), cnpj: form.cnpj.trim()||null,
      cargo: form.cargo.trim(), departamento: form.departamento.trim(),
      data_admissao: form.data_admissao || null,
      tipo_colaborador: form.tipo_colaborador,
      salario: form.salario ? Number(form.salario) : null,
      valor_servicos: form.valor_servicos ? Number(form.valor_servicos) : null,
      recebe_comissao: form.recebe_comissao,
      percentual_comissao: form.recebe_comissao && form.percentual_comissao ? Number(form.percentual_comissao) : null,
      incide_em: form.recebe_comissao ? form.incide_em : null,
      ...Object.fromEntries(CAMPOS_EXTRAS_FUNC.map(k => [k, String(form[k] || '').trim() || null])),
    };
    if (func) {
      await supabase.from('rh_funcionarios').update(payload).eq('id', func.id);
      logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: func.id, changeType: 'UPDATE',
        oldRow: func, newRow: { ...func, ...payload }, user: currentUser });
    } else {
      const { data: novo } = await supabase.from('rh_funcionarios')
        .insert([{ ...payload, status_presenca:'Ativo', ativo:true }]).select('id').single();
      if (novo?.id) logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: novo.id, changeType: 'CREATE',
        newRow: payload, user: currentUser });
    }
    setSalvando(false); onSaved(); fecharModal();
  };

  const isFuncionario = form.tipo_colaborador === 'Funcionário';

  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) fecharModal(); }}>
      <div className="modal-box acn-modal-cadastro">
        <div className="acn-modal-cab">
          <span className="modal-title">{func ? 'Editar Colaborador' : 'Novo Colaborador'}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={fecharModal} />
        </div>

        <div className="acn-modal-corpo acn-form-cheio">

          {/* TIPO DE VÍNCULO */}
          <div className="acn-quadro" style={campoDestaque('tipo_colaborador')}>
            {lbl('Tipo de Vínculo')}
            {toggle([['Funcionário','Funcionário'],['Terceiro','Terceiro']], 'tipo_colaborador')}
          </div>

          {/* DADOS PESSOAIS */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Dados do Colaborador</div>
            {[['nome','Nome completo *'],['email','E-mail'],
              ['cargo','Cargo / Função'],['departamento','Departamento / Empresa']].map(([k,l])=>(
              <div key={k} style={campoDestaque(k)}>{lbl(l)}{inp(k)}</div>
            ))}
            <div className={isFuncionario ? undefined : 'acn-grade-2'}>
              <div style={campoDestaque('cpf')}>{lbl('CPF')}{inp('cpf','000.000.000-00')}</div>
              {!isFuncionario && (
                <div style={campoDestaque('cnpj')}>{lbl('CNPJ da Empresa')}{inp('cnpj','00.000.000/0001-00')}</div>
              )}
            </div>
            <div style={campoDestaque('data_admissao')}>
              {lbl(isFuncionario ? 'Data de Admissão' : 'Data de Início')}
              <input type="date" className="acn-input" value={form.data_admissao} onChange={e=>set('data_admissao',e.target.value)} />
            </div>
          </div>

          {/* UNIFORME */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Tamanhos do uniforme</div>
            <div className="acn-grade-3">
              {[['tamanho_camiseta','Camiseta',TAMANHOS_CAMISETA],['tamanho_calca','Calça',TAMANHOS_CALCA],['tamanho_sapato','Sapato',TAMANHOS_SAPATO]].map(([k, l, ops]: any) => (
                <div key={k} style={campoDestaque(k)}>
                  {lbl(l)}
                  <select className="acn-input" value={form[k]} onChange={e=>set(k, e.target.value)} aria-label={`Tamanho ${l}`}>
                    <option value="">—</option>
                    {ops.map((o: string) => <option key={o} value={o}>{o}</option>)}
                    {form[k] && !ops.includes(form[k]) && <option value={form[k]}>{form[k]}</option>}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* ENDEREÇO */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Endereço</div>
            <div className="acn-grade-cep">
              <div style={campoDestaque('cep')}>
                {lbl('CEP')}
                <input className="acn-input" value={form.cep} placeholder="00000-000" inputMode="numeric"
                  onChange={e => { set('cep', e.target.value); if (e.target.value.replace(/\D/g, '').length === 8) preencherPeloCep(e.target.value); }} />
              </div>
              <div style={campoDestaque('endereco_logradouro')}>{lbl('Rua / Logradouro')}{inp('endereco_logradouro')}</div>
            </div>
            {(buscandoCep || avisoCep) && (
              <div className={'acn-ajuda' + (avisoCep ? ' atencao' : '')}>{buscandoCep ? 'Buscando o CEP...' : avisoCep}</div>
            )}
            <div className="acn-grade-num">
              <div style={campoDestaque('endereco_numero')}>{lbl('Número')}{inp('endereco_numero')}</div>
              <div style={campoDestaque('endereco_complemento')}>{lbl('Complemento')}{inp('endereco_complemento','Apto, bloco...')}</div>
              <div style={campoDestaque('endereco_bairro')}>{lbl('Bairro')}{inp('endereco_bairro')}</div>
            </div>
            <div className="acn-grade-uf">
              <div style={campoDestaque('endereco_cidade')}>{lbl('Cidade')}{inp('endereco_cidade')}</div>
              <div style={campoDestaque('endereco_uf')}>
                {lbl('UF')}
                <select className="acn-input" value={form.endereco_uf} onChange={e=>set('endereco_uf', e.target.value)} aria-label="UF">
                  <option value="">—</option>
                  {UFS_BR.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* CONTATO DE EMERGÊNCIA */}
          <div className="acn-quadro tom-erro">
            <div className="acn-quadro-titulo">Contato de emergência</div>
            <div style={campoDestaque('emergencia_nome')}>{lbl('Nome')}{inp('emergencia_nome')}</div>
            <div className="acn-grade-2">
              <div style={campoDestaque('emergencia_parentesco')}>
                {lbl('Parentesco')}
                <select className="acn-input" value={form.emergencia_parentesco} onChange={e=>set('emergencia_parentesco', e.target.value)} aria-label="Parentesco">
                  <option value="">—</option>
                  {PARENTESCOS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={campoDestaque('emergencia_telefone')}>{lbl('Telefone')}{inp('emergencia_telefone','(00) 00000-0000','tel')}</div>
            </div>
          </div>

          {/* REMUNERAÇÃO */}
          <div className="acn-quadro tom-ok">
            <div className="acn-quadro-titulo">Remuneração</div>
            {isFuncionario ? (
              <div style={campoDestaque('salario')}>
                {lbl('Salário (R$)')}
                <input type="number" min="0" step="0.01" className="acn-input" value={form.salario} onChange={e=>set('salario',e.target.value)}
                  placeholder="Ex: 3500.00" />
              </div>
            ) : (
              <div style={campoDestaque('valor_servicos')}>
                {lbl('Valor dos Serviços (R$)')}
                <input type="number" min="0" step="0.01" className="acn-input" value={form.valor_servicos} onChange={e=>set('valor_servicos',e.target.value)}
                  placeholder="Ex: 5000.00" />
                <div className="acn-ajuda">Valor do contrato ou por serviço prestado</div>
              </div>
            )}
          </div>

          {/* COMISSÃO */}
          <div className="acn-quadro tom-atencao">
            <div className="acn-quadro-titulo">Comissão</div>
            {/* Etapa 7.14 (01/10/2026): aqui havia um segundo par de botões "Sim / Não" que gravava em recebe_comissao_str, um campo que
                ninguém lê — clicar "Sim" parecia ligar a comissão e não ligava (a pessoa era salva sem comissão). Ficou só o par que funciona. */}
            {lbl('Recebe Comissão?')}
            <div style={campoDestaque('recebe_comissao')}>
              <Chips ativo={form.recebe_comissao ? 'sim' : 'nao'} onChange={v => set('recebe_comissao', v === 'sim')}
                itens={[{ id: 'sim', rotulo: 'Recebe Comissão' }, { id: 'nao', rotulo: 'Sem Comissão' }]} />
            </div>
            {form.recebe_comissao && (
              <>
                <div style={campoDestaque('percentual_comissao')}>
                  {lbl('Percentual de Comissão (%)')}
                  <input type="number" min="0" max="100" step="0.1" className="acn-input" value={form.percentual_comissao}
                    onChange={e=>set('percentual_comissao',e.target.value)} placeholder="Ex: 5.0" />
                </div>
                <div style={campoDestaque('incide_em')}>
                  {lbl('Comissão Incide Sobre')}
                  {toggle([['Faturamento','Faturamento'],['Mão de Obra','MO Adaptação'],['Serralheria','MO Serralheria']], 'incide_em')}
                </div>
                <Faixa tom="info" icone={mdiInformationOutline}>
                  Estes dados serão usados para cálculo automático de comissões nos relatórios futuros.
                </Faixa>
              </>
            )}
          </div>

        </div>

        <div className="acn-modal-rodape">
          <Botao onClick={fecharModal}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={salvar} disabled={salvando}>
            {salvando ? '...' : 'Salvar Colaborador'}
          </Botao>
        </div>
      </div>
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — LANÇAR HORAS
// ─────────────────────────────────────────────────────────────────────────────
function ModalLancamento({ funcionarios, onClose, onSaved, lancEdit }) {
  const hoje = hojeISO();
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
    let erro = null;
    if (lancEdit) {
      const { error } = await supabase.from('rh_lancamentos').update(payload).eq('id', lancEdit.id);
      erro = error;
    } else {
      const { error } = await supabase.from('rh_lancamentos').insert([payload]);
      erro = error;
    }
    setSalvando(false);
    if (erro) { alert('Erro ao salvar lançamento: ' + erro.message); return; }
    onSaved(); onClose();
  };

  const tipoSelecionado = TIPO_MAP[form.tipo];
  const semDuracao = ['Falta','Atestado','Férias','Folga','Viagem'].includes(form.tipo);

  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro menor">
        <div className="acn-modal-cab">
          <span className="modal-title">{lancEdit ? 'Editar' : 'Novo'} Lançamento</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div>
            <label className="acn-label">Funcionário *</label>
            <select className="acn-input" value={form.funcionario_id} onChange={e=>set('funcionario_id',e.target.value)}>
              <option value="">Selecione...</option>
              {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="acn-label">Data *</label>
            <input type="date" className="acn-input" value={form.data} onChange={e=>set('data',e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Tipo *</label>
            <Chips ativo={form.tipo} onChange={v=>set('tipo',v)} itens={TIPOS_LANCAMENTO.map(t => ({ id: t.v, rotulo: t.v }))} />
            {tipoSelecionado && (
              <div className="acn-ajuda" data-acn-familia={FAMILIA_LANCAMENTO[form.tipo] || 'neutro'}>
                {tipoSelecionado.grupo === 'Crédito' ? '↑ Crédito no banco de horas' :
                 tipoSelecionado.grupo === 'Débito'  ? '↓ Débito no banco de horas' :
                 '— Sem efeito no banco de horas'}
              </div>
            )}
          </div>
          {!semDuracao && (
            <div>
              <label className="acn-label">Duração</label>
              <div className="acn-duracao">
                <input type="number" min="0" max="23" className="acn-input acn-input-curto" value={form.horas} onChange={e=>set('horas',e.target.value)} />
                <span className="acn-fraco">h</span>
                <input type="number" min="0" max="59" className="acn-input acn-input-curto" value={form.minutos_rest} onChange={e=>set('minutos_rest',e.target.value)} />
                <span className="acn-fraco">min</span>
                {totalMin > 0 && <span className="acn-duracao-total">{fmtMin(sinalDoTipo(form.tipo)*totalMin)}</span>}
              </div>
            </div>
          )}
          {semDuracao && (
            <Faixa tom={form.tipo === 'Falta' ? 'atencao' : form.tipo === 'Atestado' ? 'ok' : 'info'}>
              {form.tipo === 'Falta' ? 'Será descontado 1 dia (8h47min) do banco de horas.' :
               form.tipo === 'Atestado' ? 'Falta abonada — sem desconto no banco de horas.' :
               'Lançado como ausência programada — sem efeito no banco.'}
            </Faixa>
          )}
          <div>
            <label className="acn-label">Observação</label>
            <textarea className="acn-input" value={form.obs} onChange={e=>set('obs',e.target.value)} rows={2} />
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={salvar} disabled={salvando}>
            {salvando ? '...' : 'Salvar'}
          </Botao>
        </div>
      </div>
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL — AUTORIZAÇÃO DE SAÍDA/ENTRADA
// ─────────────────────────────────────────────────────────────────────────────
function ModalAutorizacao({ funcionarios, onClose, onSaved }) {
  const hoje = hojeISO();
  const [form, setForm] = useState({ funcionario_id:'', tipo:'Saída Antecipada', data:hoje, hora_saida:'', hora_retorno:'', motivo:'', aprovado_por:'' });
  const [salvando, setSalvando] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  // Determina se o colaborador selecionado é Terceiro
  const funcSelecionado = funcionarios.find(f => f.id === form.funcionario_id);
  const isTerceiro = funcSelecionado?.tipo_colaborador === 'Terceiro';

  // Opções de tipo e labels conforme vínculo
  const tipoSaida   = isTerceiro ? 'Comunicação de Saída Antecipada'   : 'Saída Antecipada';
  const tipoEntrada = isTerceiro ? 'Comunicação de Entrada Antecipada' : 'Entrada Antecipada';
  const tiposDisponiveis = [tipoSaida, tipoEntrada];

  // Ao trocar colaborador, ajusta o tipo automaticamente
  const onChangeFuncionario = (e: any) => {
    const novoId = e.target.value;
    const novoFunc = funcionarios.find(f => f.id === novoId);
    const novoTerceiro = novoFunc?.tipo_colaborador === 'Terceiro';
    const novoTipo = form.tipo.includes('Entrada')
      ? (novoTerceiro ? 'Comunicação de Entrada Antecipada' : 'Entrada Antecipada')
      : (novoTerceiro ? 'Comunicação de Saída Antecipada'  : 'Saída Antecipada');
    setForm(f => ({ ...f, funcionario_id: novoId, tipo: novoTipo }));
  };

  const isSaida = form.tipo.includes('Saída');
  const tituloModal = isTerceiro
    ? 'Comunicação de Saída / Entrada'
    : 'Autorização de Saída / Entrada';
  const labelAprovado = isTerceiro ? 'Ciente por (Gerente)' : 'Aprovado por (Gerente)';

  const salvarEImprimir = async () => {
    if (!form.funcionario_id) { alert('Selecione o colaborador!'); return; }
    if (!form.hora_saida) { alert('Informe o horário!'); return; }
    if (!form.motivo.trim()) { alert('Informe o motivo!'); return; }
    setSalvando(true);
    const { data: aut } = await supabase.from('rh_autorizacoes').insert([{ ...form }]).select().single();
    setSalvando(false);
    imprimirAutorizacao(aut || form, funcSelecionado);
    onSaved(); onClose();
  };

  return (
    <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro menor">
        <div className="acn-modal-cab">
          <span className="modal-title">{tituloModal}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {/* Badge indicador quando Terceiro */}
          {isTerceiro && (
            <Faixa tom="atencao">
              Terceiro — documento gerado como Comunicação (sem necessidade de assinatura de autorização)
            </Faixa>
          )}
          <div>
            <label className="acn-label">Colaborador *</label>
            <select className="acn-input" value={form.funcionario_id} onChange={onChangeFuncionario}>
              <option value="">Selecione...</option>
              {funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome} {f.tipo_colaborador==='Terceiro'?'(Terceiro)':''}</option>)}
            </select>
          </div>
          <div>
            <label className="acn-label">Tipo</label>
            <Chips ativo={form.tipo} onChange={v=>set('tipo',v)} itens={tiposDisponiveis.map(t => ({ id: t, rotulo: t }))} />
          </div>
          <div>
            <label className="acn-label">Data</label>
            <input type="date" className="acn-input" value={form.data} onChange={e=>set('data',e.target.value)} />
          </div>
          <div className="acn-grade-2">
            <div>
              <label className="acn-label">
                {isSaida ? 'Horário de Saída *' : 'Horário de Entrada *'}
              </label>
              <input type="time" className="acn-input" value={form.hora_saida} onChange={e=>set('hora_saida',e.target.value)} />
            </div>
            <div>
              <label className="acn-label">
                {isSaida ? 'Horário de Retorno' : 'Horário de Saída Normal'}
              </label>
              <input type="time" className="acn-input" value={form.hora_retorno} onChange={e=>set('hora_retorno',e.target.value)} />
            </div>
          </div>
          <div>
            <label className="acn-label">Motivo *</label>
            <textarea className="acn-input" value={form.motivo} onChange={e=>set('motivo',e.target.value)} rows={2} />
          </div>
          <div>
            <label className="acn-label">{labelAprovado}</label>
            <input className="acn-input" value={form.aprovado_por} onChange={e=>set('aprovado_por',e.target.value)}
              placeholder="Nome do gerente responsável" />
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiPrinterOutline} onClick={salvarEImprimir} disabled={salvando}>
            {salvando ? '...' : 'Salvar e Imprimir'}
          </Botao>
        </div>
      </div>
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — PAINEL DE STATUS
// ─────────────────────────────────────────────────────────────────────────────
function PainelStatus({ funcionarios, onRefresh, onEdit, onDelete, onDesligar, currentUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const ativos = funcionarios.filter(f => f.ativo);
  const { naoLidoSet } = useUnreadMap('rh_funcionarios', ativos.map(f => f.id), currentUser);

  const alterarStatus = async (f: any, status: string) => {
    // Desligado pede data e motivo e tira a pessoa das listas de trabalho: tem janela própria (ModalDesligar)
    if (status === 'Desligado') { onDesligar?.(f); return; }
    await supabase.from('rh_funcionarios').update({ status_presenca: status }).eq('id', f.id);
    logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: f.id, changeType: 'UPDATE',
      oldRow: f, newRow: { ...f, status_presenca: status }, user: currentUser });
    onRefresh();
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr no-collapse" onClick={() => setCollapsed(c => !c)}>
        <span className="acn-cab-titulo"><Icone path={mdiAccountGroupOutline} size={16} /> Status dos Colaboradores ({ativos.length})</span>
        <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }} />
      </div>
      {!collapsed && <div className="sec-body acn-rolagem acn-sem-recuo">
        {ativos.length === 0 ? (
          <div className="acn-empty">Nenhum colaborador cadastrado.</div>
        ) : (
          <table className="acn-tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Cargo / Depto.</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {ativos.map(f => (
                <tr key={f.id} className={naoLidoSet.has(String(f.id)) ? 'acn-linha-nova' : undefined}>
                  <td className="acn-forte">{f.nome}</td>
                  <td>
                    <Selo familia={f.tipo_colaborador==='Terceiro' ? 'atencao' : 'info'} ponto={false}>
                      {f.tipo_colaborador || 'Funcionário'}
                    </Selo>
                  </td>
                  <td>
                    {[f.cargo, f.departamento].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>
                    <select className="acn-sel-status" data-acn-familia={FAMILIA_PRESENCA[f.status_presenca] || 'neutro'}
                      aria-label={`Status de ${f.nome}`}
                      value={f.status_presenca}
                      onChange={e => alterarStatus(f, e.target.value)}>
                      {['Ativo','Em Viagem','Folga','Férias','Afastado','Desligado'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="acn-acoes-linha">
                      <Botao pequeno icone={mdiPencilOutline} title="Editar" aria-label={`Editar ${f.nome}`} onClick={() => onEdit(f)} />
                      <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} title="Excluir" aria-label={`Excluir ${f.nome}`} onClick={() => onDelete(f)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — DESLIGADOS (30/09/2026, pedido do usuário)
//
// Até aqui o RH não tinha como dizer que uma pessoa foi demitida ou pediu demissão: a única saída era a
// lixeira, que só esconde o cadastro (ativo = false), sem data e sem motivo. "Desligado" é um status de
// verdade: guarda a data e o motivo (demissão pela empresa ou pedido de demissão).
//
// A pessoa desligada fica com ativo = false — assim sai sozinha de tudo que lista gente para trabalhar
// (seletor de responsável, Lançar Horas, Autorização) — mas NÃO some: continua neste bloco, com o nome
// preservado nas comissões, nos lançamentos de horas e nas autorizações que já existem (lançamentos e
// autorizações apagam em cascata se o cadastro for excluído, por isso nada aqui exclui). Pode ser
// reativada. O login do sistema (Admin › Usuários) é outra coisa e não é mexido aqui.
// ─────────────────────────────────────────────────────────────────────────────
const MOTIVOS_DESLIGAMENTO = [
  { v: 'Demissão',           rotulo: 'Demissão (pela empresa)' },
  { v: 'Pedido de demissão', rotulo: 'Pedido de demissão (da pessoa)' },
];
const diaBR = (d: any) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';

function ModalDesligar({ func, corrigindo, onClose, onSalvo, currentUser }) {
  const [data, setData] = useState(func.data_desligamento ? String(func.data_desligamento).slice(0, 10) : hojeISO());
  const [motivo, setMotivo] = useState(func.motivo_desligamento || '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!data) { alert('Informe a data do desligamento.'); return; }
    if (!motivo) { alert('Escolha o motivo: demissão ou pedido de demissão.'); return; }
    const admissao = func.data_admissao ? String(func.data_admissao).slice(0, 10) : '';
    if (admissao && data < admissao) { alert(`A data do desligamento não pode ser anterior à da admissão (${diaBR(admissao)}).`); return; }
    setSalvando(true);
    const novo = { status_presenca: 'Desligado', ativo: false, data_desligamento: data, motivo_desligamento: motivo };
    const { error } = await supabase.from('rh_funcionarios').update(novo).eq('id', func.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: func.id, changeType: 'UPDATE',
      oldRow: func, newRow: { ...func, ...novo }, user: currentUser });
    onSalvo();
  };

  return (
    <div className="modal-overlay" onClick={() => !salvando && onClose()}>
      <div className="modal-box acn-modal-estreita" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{corrigindo ? 'Corrigir desligamento' : 'Desligar colaborador'} — {func.nome}</div>
        {!corrigindo && (
          <div className="acn-modal-sub">
            A pessoa sai das listas de trabalho (seletor de responsável, Lançar Horas, Autorização) e passa para
            "Desligados". O histórico, as horas e as comissões já calculadas continuam com o nome dela.
            O login do sistema não é alterado — se ela tinha acesso, desative em Admin › Usuários.
          </div>
        )}
        <div className="form-group">
          <label className="acn-label">Data do desligamento *</label>
          <input type="date" className="acn-input" value={data} onChange={e => setData(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="acn-label">Motivo *</label>
          <select className="acn-input" value={motivo} onChange={e => setMotivo(e.target.value)}>
            <option value="">— escolha —</option>
            {MOTIVOS_DESLIGAMENTO.map(m => <option key={m.v} value={m.v}>{m.rotulo}</option>)}
          </select>
        </div>
        <div className="acn-modal-acoes">
          <Botao variante="primario" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando...' : corrigindo ? 'Salvar' : 'Confirmar desligamento'}
          </Botao>
          <Botao variante="secundario" disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );

}

function PainelDesligados({ desligados, onCorrigir, onReativar }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sec-card" data-rh-desligados>
      <div className="sec-hdr no-collapse" onClick={() => setCollapsed(c => !c)}>
        <span className="acn-cab-titulo"><Icone path={mdiAccountOffOutline} size={16} /> Desligados <Selo familia="neutro" ponto={false}>{desligados.length}</Selo></span>
        <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }} />
      </div>
      {!collapsed && <div className="sec-body acn-rolagem acn-sem-recuo">
        {desligados.length === 0 ? (
          <div className="acn-empty">Nenhum colaborador desligado. Para desligar alguém, escolha "Desligado" no status dele, acima.</div>
        ) : (
          <table className="acn-tabela">
            <thead>
              <tr>
                <th>Nome</th><th>Tipo</th><th>Cargo / Depto.</th><th>Desligado em</th><th>Motivo</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {desligados.map(f => (
                <tr key={f.id}>
                  <td className="acn-forte">{f.nome}</td>
                  <td>{f.tipo_colaborador || 'Funcionário'}</td>
                  <td>{[f.cargo, f.departamento].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="acn-num">{diaBR(f.data_desligamento)}</td>
                  <td>{f.motivo_desligamento || '—'}</td>
                  <td>
                    <div className="acn-acoes-linha">
                      <Botao pequeno variante="secundario" onClick={() => onCorrigir(f)}>Corrigir</Botao>
                      <Botao pequeno variante="secundario" onClick={() => onReativar(f)}>Reativar</Botao>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
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
  const [collapsed, setCollapsed] = useState(false);

  // Calcula saldo para cada funcionário no mês/ano selecionado
  const lancsMes = lancamentos.filter(l => Number(l.mes) === mes && Number(l.ano) === ano);

  const calcSaldo = (funcId: string) => {
    const lancs = lancsMes.filter(l => l.funcionario_id === funcId);
    return lancs.reduce((acc, l) => acc + sinalDoTipo(l.tipo) * l.minutos, 0);
  };

  const fecharMes = async (funcId: string, saldo: number) => {
    if (!await confirmar(`Fechar banco de horas de ${mesNome(mes)}/${ano} para este funcionário? Saldo atual: ${fmtMin(saldo)}`)) return;
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
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiTimerOutline} size={16} /> Banco de Horas</span>
        <div className="acn-cab-filtros" onClick={e=>e.stopPropagation()}>
          <select className="acn-input acn-select-mini" aria-label="Mês" value={mes} onChange={e=>setMes(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{mesNome(i+1)}</option>)}
          </select>
          <select className="acn-input acn-select-mini" aria-label="Ano" value={ano} onChange={e=>setAno(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
            onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
        </div>
      </div>
      {!collapsed && <div className="sec-body acn-rolagem">
        <table className="acn-tabela">
          <thead><tr>
            <th>Funcionário</th><th>Cargo</th>
            <th className="acn-dir">Hora Extra</th>
            <th className="acn-dir">Atrasos/Débitos</th>
            <th className="acn-dir">Saldo</th>
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
                  <td className="acn-forte">{f.nome}</td>
                  <td className="acn-fraco">{f.cargo||'—'}</td>
                  <td className="acn-dir acn-txt-ok acn-num">{fmtMin(credito)}</td>
                  <td className="acn-dir acn-txt-erro acn-num">{fmtMin(-debito)}</td>
                  <td className={'acn-dir acn-num ' + (saldo>=0 ? 'acn-txt-ok' : 'acn-txt-erro')}>
                    {fmtMin(saldo)}
                  </td>
                  <td>
                    <Botao pequeno onClick={()=>fecharMes(f.id, saldo)} disabled={fechando===f.id}>
                      {fechando===f.id ? '...' : 'Fechar'}
                    </Botao>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
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
  // no topo da tela: começa só com os totais; gráfico e lista abrem no clique
  const [collapsed, setCollapsed] = useState(true);

  const filtered = lancamentos.filter(l =>
    (!filtroFunc || l.funcionario_id === filtroFunc) &&
    (!filtroTipo || l.tipo === filtroTipo) &&
    (Number(l.mes) === filtroMes && Number(l.ano) === filtroAno)
  );

  // Absenteísmo = faltas + declarações (como % dos dias úteis estimados ~22 dias)
  const DIAS_UTEIS_MES = 22;
  const MINUTOS_MES = DIAS_UTEIS_MES * JORNADA_MIN;

  // Agrupado por funcionário para gráfico
  const porFunc = funcionarios.filter(f=>f.ativo).map(f=>{
    const ls = lancamentos.filter(l=>l.funcionario_id===f.id && Number(l.mes)===filtroMes && Number(l.ano)===filtroAno);
    return {
      nome: f.nome, // nome completo conforme cadastro
      faltas: ls.filter(l=>l.tipo==='Falta').reduce((a,l)=>a+l.minutos,0),
      atestados: ls.filter(l=>l.tipo==='Atestado').reduce((a,l)=>a+l.minutos,0),
      atrasos: ls.filter(l=>l.tipo==='Atraso').reduce((a,l)=>a+l.minutos,0),
      extras: ls.filter(l=>l.tipo==='Hora Extra').reduce((a,l)=>a+l.minutos,0),
    };
  });

  const maxMin = Math.max(...porFunc.map(p=>Math.max(p.faltas+p.atestados+p.atrasos, p.extras)), 1);

  // Etapa 12c1 (01/10/2026): as cores do gráfico vêm das classes acn-barra-seg (famílias do design system), não de hex na tela.

  return (
    <div className="sec-card">
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiChartBoxOutline} size={16} /> KPI — Absenteísmo & Horas</span>
        <div className="acn-cab-filtros" onClick={e=>e.stopPropagation()}>
          <select className="acn-input acn-select-mini" aria-label="Funcionário" value={filtroFunc} onChange={e=>setFiltroFunc(e.target.value)}>
            <option value="">Todos os funcionários</option>
            {funcionarios.filter(f=>f.ativo).map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select className="acn-input acn-select-mini" aria-label="Tipo de lançamento" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS_LANCAMENTO.map(t=><option key={t.v} value={t.v}>{t.v}</option>)}
          </select>
          <select className="acn-input acn-select-mini" aria-label="Mês" value={filtroMes} onChange={e=>setFiltroMes(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{mesNome(i+1)}</option>)}
          </select>
          <select className="acn-input acn-select-mini" aria-label="Ano" value={filtroAno} onChange={e=>setFiltroAno(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
            onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
        </div>
      </div>

      {/* Totais do mês — sempre visíveis */}
      {(() => {
        const soma = (k: string) => (filtroFunc ? porFunc.filter(p => funcionarios.find(f => f.id === filtroFunc)?.nome === p.nome) : porFunc).reduce((a, p) => a + p[k], 0);
        const ausencia = soma('faltas') + soma('atestados');
        const base = MINUTOS_MES * (filtroFunc ? 1 : Math.max(1, porFunc.length));
        const cards = [
          ['Faltas', fmtMin(soma('faltas')), 'erro'],
          ['Atestados', fmtMin(soma('atestados')), 'neutro'],
          ['Atrasos', fmtMin(soma('atrasos')), 'atencao'],
          ['Horas extras', fmtMin(soma('extras')), 'ok'],
          ['Absenteísmo', `${((ausencia / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 'marca'],
        ];
        return (
          <div className="acn-kpi-faixa">
            <Indicadores compacto itens={cards.map(([l, v, tom]) => ({ l, v: v || '0', tom }))} />
            <Botao pequeno icone={collapsed ? mdiChevronDown : mdiChevronUp} onClick={()=>setCollapsed(c=>!c)}>
              {collapsed ? 'Ver gráfico e lançamentos' : 'Recolher detalhes'}
            </Botao>
          </div>
        );
      })()}

      {/* Gráfico de barras simples (as larguras vêm do dado; as cores, das famílias do design system) */}
      {!collapsed && porFunc.length > 0 && (
        <div className="acn-grafico">
          <div className="acn-grafico-titulo">
            Gráfico — {mesNome(filtroMes)}/{filtroAno}
          </div>
          <div className="acn-grafico-leg">
            {['faltas', 'atestados', 'atrasos', 'extras'].map(k => (
              <span key={k}>
                <i className={'acn-barra-seg ' + k}></i>
                {k.charAt(0).toUpperCase()+k.slice(1)}
              </span>
            ))}
          </div>
          <div className="acn-grafico-linhas">
            {porFunc.map(p=>(
              <div key={p.nome} className="acn-grafico-linha">
                <div className="acn-grafico-nome">{p.nome}</div>
                <div className="acn-grafico-barras">
                  {/* Débitos */}
                  <div className="acn-barra-trilho">
                    {['faltas', 'atestados', 'atrasos'].map(k => (
                      p[k]>0 ? <div key={k} className={'acn-barra-seg ' + k} style={{ width:`${(p[k]/maxMin)*100}%` }} title={`${k}: ${fmtMin(p[k])}`}></div> : null
                    ))}
                  </div>
                  {/* Extras */}
                  <div className="acn-barra-trilho">
                    {p.extras > 0 && <div className="acn-barra-seg extras" style={{ width:`${(p.extras/maxMin)*100}%` }} title={`Hora Extra: ${fmtMin(p.extras)}`}></div>}
                  </div>
                </div>
                <div className="acn-grafico-resumo">
                  {p.faltas+p.atestados+p.atrasos > 0 && <div className="acn-txt-erro">↓ {fmtMin(p.faltas+p.atestados+p.atrasos)}</div>}
                  {p.extras > 0 && <div className="acn-txt-ok">↑ {fmtMin(p.extras)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de lançamentos filtrados */}
      {!collapsed && <div className="sec-body acn-rolagem">
        {filtered.length === 0 ? (
          <div className="acn-empty">Nenhum lançamento encontrado.</div>
        ) : (
          <table className="acn-tabela">
            <thead><tr>
              <th>Data</th><th>Funcionário</th><th>Tipo</th><th className="acn-dir">Duração</th><th>Observação</th>
            </tr></thead>
            <tbody>
              {filtered.map(l=>{
                const func = funcionarios.find(f=>f.id===l.funcionario_id);
                const sinal = sinalDoTipo(l.tipo);
                return (
                  <tr key={l.id}>
                    <td className="acn-num">{fmtDate(l.data)}</td>
                    <td>{func?.nome||'—'}</td>
                    <td><Selo familia={FAMILIA_LANCAMENTO[l.tipo] || 'neutro'} ponto={false}>{l.tipo}</Selo></td>
                    <td className={'acn-dir acn-num ' + (sinal>0 ? 'acn-txt-ok' : sinal<0 ? 'acn-txt-erro' : 'acn-fraco')}>
                      {sinal!==0 ? fmtMin(sinal*l.minutos) : '—'}
                    </td>
                    <td className="acn-fraco">{l.obs||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — AUTORIZAÇÕES REGISTRADAS
// ─────────────────────────────────────────────────────────────────────────────
function ListaAutorizacoes({ funcionarios, autorizacoes, onImprimir }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sec-card">
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiPrinterOutline} size={16} /> Autorizações de Saída / Entrada ({autorizacoes.length})</span>
        <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
          onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
      </div>
      {!collapsed && <div className="sec-body acn-rolagem">
        {autorizacoes.length === 0 ? (
          <div className="acn-empty">Nenhuma autorização registrada.</div>
        ) : (
          <table className="acn-tabela acn-densa">
            <thead><tr>
              <th>Data</th><th>Funcionário</th><th>Tipo</th><th>Saída</th><th>Retorno</th><th>Motivo</th><th>Aprovado por</th><th></th>
            </tr></thead>
            <tbody>
              {autorizacoes.slice(0,50).map(a=>{
                const func = funcionarios.find(f=>f.id===a.funcionario_id);
                return (
                  <tr key={a.id}>
                    <td className="acn-num">{fmtDate(a.data)}</td>
                    <td>{func?.nome||'—'}</td>
                    <td><Selo familia={(a.tipo||'').includes('Saída') ? 'atencao' : 'info'} ponto={false}>{a.tipo}</Selo></td>
                    <td>{a.hora_saida||'—'}</td>
                    <td>{a.hora_retorno||'—'}</td>
                    <td className="acn-texto-longo acn-texto-medio acn-fraco">{a.motivo||'—'}</td>
                    <td>{a.aprovado_por||'—'}</td>
                    <td>
                      <Botao pequeno icone={mdiPrinterOutline} title="Imprimir" aria-label={`Imprimir autorização de ${func?.nome || 'colaborador'}`} onClick={()=>onImprimir(a, func)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  );

}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIO DE IMPRESSÃO DE RELATÓRIO DE HORAS
// ─────────────────────────────────────────────────────────────────────────────
function gerarHtmlRelatorio(titulo: string, periodoLabel: string, linhas: any[], totais: any) {
  const badge = (txt: string, cor: string) =>
    `<span style="background:${cor};color:white;border-radius:3px;padding:1px 7px;font-size:10px;font-weight:700;">${txt}</span>`;

  const rows = linhas.map(l => `
    <tr>
      <td>${l.nome}</td>
      <td style="text-align:center;color:#16a34a;font-weight:700">${fmtMin(l.credito)}</td>
      <td style="text-align:center;color:#dc2626;font-weight:700">${fmtMin(-l.debito)}</td>
      <td style="text-align:center;font-weight:800;color:${l.saldo>=0?'#16a34a':'#dc2626'}">${fmtMin(l.saldo)}</td>
      <td style="text-align:center">${l.faltas > 0 ? badge(String(l.faltas),'#dc2626') : '—'}</td>
      <td style="text-align:center">${l.atestados > 0 ? badge(String(l.atestados),'#6b7280') : '—'}</td>
      <td style="text-align:center">${l.declaracoes > 0 ? badge(String(l.declaracoes),'#d97706') : '—'}</td>
      <td style="text-align:center">${l.saidasAnt > 0 ? badge(String(l.saidasAnt),'#ef4444') : '—'}</td>
      <td style="text-align:center">${l.entradasAnt > 0 ? badge(String(l.entradasAnt),'#22c55e') : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:25px;color:#111;}
    h2{font-size:14px;text-align:center;margin:0 0 2px;}
    .sub{text-align:center;font-size:10px;color:#555;margin-bottom:18px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th{background:#1e293b;color:#cbd5e1;padding:6px 8px;text-align:left;font-size:10px;}
    td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;vertical-align:middle;}
    tr:nth-child(even) td{background:#f9fafb;}
    .totais td{background:#f1f5f9!important;font-weight:700;border-top:2px solid #334155;}
    .destaques{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;margin-top:12px;font-size:10px;}
    .destaques h3{margin:0 0 8px;font-size:11px;color:#92400e;}
    .chip{display:inline-block;margin:2px 4px;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;}
    @media print{body{margin:12mm;}}
  </style></head><body>
  <h2>ACN SINAL VERDE — ${titulo.toUpperCase()}</h2>
  <div class="sub">Período: ${periodoLabel} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
  <table>
    <thead><tr>
      <th>Funcionário</th><th style="text-align:center">Créditos</th><th style="text-align:center">Débitos</th>
      <th style="text-align:center">Saldo</th>
      <th style="text-align:center">Faltas</th><th style="text-align:center">Atestados</th>
      <th style="text-align:center">Declarações</th><th style="text-align:center">Saídas Ant.</th><th style="text-align:center">Entradas Ant.</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="totais">
        <td>TOTAL GERAL</td>
        <td style="text-align:center;color:#16a34a">${fmtMin(totais.credito)}</td>
        <td style="text-align:center;color:#dc2626">${fmtMin(-totais.debito)}</td>
        <td style="text-align:center;color:${totais.saldo>=0?'#16a34a':'#dc2626'}">${fmtMin(totais.saldo)}</td>
        <td style="text-align:center">${totais.faltas||0}</td>
        <td style="text-align:center">${totais.atestados||0}</td>
        <td style="text-align:center">${totais.declaracoes||0}</td>
        <td style="text-align:center">${totais.saidasAnt||0}</td>
        <td style="text-align:center">${totais.entradasAnt||0}</td>
      </tr>
    </tbody>
  </table>
  ${(totais.faltas||totais.atestados||totais.declaracoes||totais.saidasAnt||totais.entradasAnt) ? `
  <div class="destaques">
    <h3>Destaques do Período</h3>
    ${totais.faltas ? `<span class="chip" style="background:#fde8e8;color:#dc2626">${totais.faltas} falta(s)</span>` : ''}
    ${totais.atestados ? `<span class="chip" style="background:#f1f5f9;color:#6b7280">${totais.atestados} atestado(s)</span>` : ''}
    ${totais.declaracoes ? `<span class="chip" style="background:#fffbeb;color:#d97706">${totais.declaracoes} declaração(ões)</span>` : ''}
    ${totais.saidasAnt ? `<span class="chip" style="background:#fef2f2;color:#ef4444">${totais.saidasAnt} saída(s) antecipada(s)</span>` : ''}
    ${totais.entradasAnt ? `<span class="chip" style="background:#f0fdf4;color:#16a34a">↪ ${totais.entradasAnt} entrada(s) antecipada(s)</span>` : ''}
  </div>` : ''}
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;
}

function calcLinhas(funcs: any[], lancs: any[]) {
  return funcs.filter(f=>f.ativo).map(f => {
    const ls = lancs.filter(l => l.funcionario_id === f.id);
    const credito  = ls.filter(l=>sinalDoTipo(l.tipo)>0).reduce((a,l)=>a+l.minutos,0);
    const debito   = ls.filter(l=>sinalDoTipo(l.tipo)<0).reduce((a,l)=>a+l.minutos,0);
    return {
      nome:         f.nome,
      credito,
      debito,
      saldo:        credito - debito,
      faltas:       ls.filter(l=>l.tipo==='Falta').length,
      atestados:    ls.filter(l=>l.tipo==='Atestado').length,
      declaracoes:  ls.filter(l=>l.tipo==='Declaração').length,
      saidasAnt:    ls.filter(l=>l.tipo==='Saída Antecipada').length,
      entradasAnt:  ls.filter(l=>l.tipo==='Entrada Antecipada').length,
    };
  });
}

function somarTotais(linhas: any[]) {
  return linhas.reduce((acc, l) => ({
    credito:     (acc.credito||0)    + l.credito,
    debito:      (acc.debito||0)     + l.debito,
    saldo:       (acc.saldo||0)      + l.saldo,
    faltas:      (acc.faltas||0)     + l.faltas,
    atestados:   (acc.atestados||0)  + l.atestados,
    declaracoes: (acc.declaracoes||0)+ l.declaracoes,
    saidasAnt:   (acc.saidasAnt||0)  + l.saidasAnt,
    entradasAnt: (acc.entradasAnt||0)+ l.entradasAnt,
  }), {});
}

// TabelaPreview fica em escopo de MODULO: dentro do componente, cada render
// criava uma funcao nova e o React remontava a tabela inteira em vez de
// atualiza-la. So depende de props e de helpers de modulo (somarTotais,
// fmtMin), entao subir e a correcao certa.
const TabelaPreview = ({ linhas }: { linhas: any[] }) => {
  if (linhas.length === 0) return <div className="acn-empty">Selecione os filtros acima.</div>;
  const totais = somarTotais(linhas);
  return (
    <div style={{overflowX:'auto'}}>
      <table>
        <thead><tr>
          <th>Funcionário</th>
          <th style={{textAlign:'center'}}>Créditos</th>
          <th style={{textAlign:'center'}}>Débitos</th>
          <th style={{textAlign:'center'}}>Saldo</th>
          <th style={{textAlign:'center',color:'#fca5a5'}}>Faltas</th>
          <th style={{textAlign:'center'}}>Atestados</th>
          <th style={{textAlign:'center',color:'#fde68a'}}>Declarações</th>
          <th style={{textAlign:'center'}}>Saídas Ant.</th>
          <th style={{textAlign:'center'}}>Entradas Ant.</th>
        </tr></thead>
        <tbody>
          {linhas.map((l,i) => (
            <tr key={i}>
              <td><strong>{l.nome}</strong></td>
              <td style={{textAlign:'center',color:'#16a34a',fontWeight:700}}>{fmtMin(l.credito)}</td>
              <td style={{textAlign:'center',color:'#dc2626',fontWeight:700}}>{l.debito>0?fmtMin(-l.debito):'—'}</td>
              <td style={{textAlign:'center',fontWeight:800,color:l.saldo>=0?'#16a34a':'#dc2626'}}>{fmtMin(l.saldo)}</td>
              <td style={{textAlign:'center'}}>{l.faltas>0?<span style={{background:'#fde8e8',color:'#dc2626',borderRadius:10,padding:'1px 8px',fontWeight:700,fontSize:9}}>{l.faltas}</span>:'—'}</td>
              <td style={{textAlign:'center'}}>{l.atestados>0?<span style={{background:'#f1f5f9',color:'#6b7280',borderRadius:10,padding:'1px 8px',fontWeight:700,fontSize:9}}>{l.atestados}</span>:'—'}</td>
              <td style={{textAlign:'center'}}>{l.declaracoes>0?<span style={{background:'#fffbeb',color:'#d97706',borderRadius:10,padding:'1px 8px',fontWeight:700,fontSize:9}}>{l.declaracoes}</span>:'—'}</td>
              <td style={{textAlign:'center'}}>{l.saidasAnt>0?<span style={{background:'#fef2f2',color:'#ef4444',borderRadius:10,padding:'1px 8px',fontWeight:700,fontSize:9}}>{l.saidasAnt}</span>:'—'}</td>
              <td style={{textAlign:'center'}}>{l.entradasAnt>0?<span style={{background:'#f0fdf4',color:'#16a34a',borderRadius:10,padding:'1px 8px',fontWeight:700,fontSize:9}}>{l.entradasAnt}</span>:'—'}</td>
            </tr>
          ))}
          {linhas.length > 1 && (
            <tr style={{background:'#f1f5f9',fontWeight:700}}>
              <td>TOTAL</td>
              <td style={{textAlign:'center',color:'#16a34a'}}>{fmtMin(totais.credito)}</td>
              <td style={{textAlign:'center',color:'#dc2626'}}>{totais.debito>0?fmtMin(-totais.debito):'—'}</td>
              <td style={{textAlign:'center',color:totais.saldo>=0?'#16a34a':'#dc2626'}}>{fmtMin(totais.saldo)}</td>
              <td style={{textAlign:'center'}}>{totais.faltas||'—'}</td>
              <td style={{textAlign:'center'}}>{totais.atestados||'—'}</td>
              <td style={{textAlign:'center'}}>{totais.declaracoes||'—'}</td>
              <td style={{textAlign:'center'}}>{totais.saidasAnt||'—'}</td>
              <td style={{textAlign:'center'}}>{totais.entradasAnt||'—'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

function imprimirRelatorio(titulo: string, periodoLabel: string, linhas: any[]) {
  const totais = somarTotais(linhas);
  const html = gerarHtmlRelatorio(titulo, periodoLabel, linhas, totais);
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — RELATÓRIO DE UNIFORMES (nomes e tamanhos, para compra/entrega)
// ─────────────────────────────────────────────────────────────────────────────
const escHtml = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
function contarTamanhos(funcs: any[], campo: string, ordem: string[]) {
  const cont: Record<string, number> = {};
  funcs.forEach(f => { const t = f[campo]; if (t) cont[t] = (cont[t] || 0) + 1; });
  return Object.entries(cont).sort((a, b) => {
    const ia = ordem.indexOf(a[0]), ib = ordem.indexOf(b[0]);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
  });
}
function RelatorioUniformes({ funcionarios }) {
  const [collapsed, setCollapsed] = useState(true);
  const [tipo, setTipo] = useState('todos');
  const lista = funcionarios.filter(f => tipo === 'todos' || (f.tipo_colaborador || 'Funcionário') === tipo);
  const semTamanho = lista.filter(f => !f.tamanho_camiseta && !f.tamanho_calca && !f.tamanho_sapato).length;
  const totais = [
    ['Camiseta', contarTamanhos(lista, 'tamanho_camiseta', TAMANHOS_CAMISETA)],
    ['Calça', contarTamanhos(lista, 'tamanho_calca', TAMANHOS_CALCA)],
    ['Sapato', contarTamanhos(lista, 'tamanho_sapato', TAMANHOS_SAPATO)],
  ] as [string, [string, number][]][];

  const imprimir = () => {
    const rows = lista.map(f =>
      `<tr><td>${escHtml(f.nome)}</td><td>${escHtml(f.cargo || '')}</td><td class="c">${escHtml(f.tamanho_camiseta || '—')}</td>` +
      `<td class="c">${escHtml(f.tamanho_calca || '—')}</td><td class="c">${escHtml(f.tamanho_sapato || '—')}</td><td class="ass"></td></tr>`).join('');
    const resumo = totais.map(([peca, t]) =>
      `<div class="bloco"><strong>${peca}</strong> ${t.length ? t.map(([tam, n]) => `${escHtml(tam)}: <b>${n}</b>`).join(' · ') : '—'}</div>`).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatorio de Uniformes</title>` +
      `<style>body{font-family:Arial,sans-serif;font-size:11px;margin:25px;}h2{text-align:center;font-size:14px;margin-bottom:2px}` +
      `.sub{text-align:center;font-size:10px;color:#555;margin-bottom:14px;}.bloco{margin:3px 0;font-size:11px}.resumo{border:1px solid #cbd5e1;padding:8px 10px;margin-bottom:14px}` +
      `table{width:100%;border-collapse:collapse;}th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}` +
      `td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;}.c{text-align:center}th.c{text-align:center}.ass{width:160px}` +
      `@media print{body{margin:12mm;}}</style></head><body>` +
      `<h2>ACN SINAL VERDE — TAMANHOS DE UNIFORME</h2>` +
      `<div class="sub">${lista.length} colaborador(es)${tipo !== 'todos' ? ' · ' + escHtml(tipo) : ''} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>` +
      `<div class="resumo">${resumo}</div>` +
      `<table><thead><tr><th>Nome</th><th>Cargo</th><th class="c">Camiseta</th><th class="c">Calça</th><th class="c">Sapato</th><th>Assinatura (recebido)</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<scr` + `ipt>window.onload=function(){window.print()}<\/scr` + `ipt></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div style={{ marginTop:20, border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
      <div className="sec-hdr" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6, cursor:'pointer' }}
        onClick={()=>setCollapsed(c=>!c)}>
        <span>👕 Relatório de Uniformes</span>
        <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
          <select value={tipo} onChange={e=>setTipo(e.target.value)} aria-label="Tipo de colaborador"
            style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10 }}>
            <option value="todos">Todos</option><option value="Funcionário">Funcionários</option><option value="Terceiro">Terceiros</option>
          </select>
          <button onClick={imprimir}
            style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:4, padding:'3px 12px', fontSize:10, cursor:'pointer' }}>
            🖨️ Imprimir
          </button>
          <button onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} aria-label={collapsed ? 'Expandir' : 'Recolher'}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#94a3b8',lineHeight:1,padding:'0 2px'}}>
            {collapsed?'▸':'▾'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div style={{ padding:12 }}>
          {/* resumo no topo: quantos de cada tamanho */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
            {totais.map(([peca, t]) => (
              <div key={peca} style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:11, background:'#f8fafc' }}>
                <strong style={{ color:'#0f766e' }}>{peca}</strong>{' '}
                {t.length ? t.map(([tam, n]) => <span key={tam} style={{ marginLeft:6 }}>{tam}: <b>{n}</b></span>) : <span style={{ color:'#94a3b8' }}>—</span>}
              </div>
            ))}
            {semTamanho > 0 && (
              <div style={{ fontSize:10, color:'#b45309', alignSelf:'center' }}>{semTamanho} sem tamanho cadastrado</div>
            )}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead><tr><th>Nome</th><th>Cargo</th><th>Camiseta</th><th>Calça</th><th>Sapato</th></tr></thead>
              <tbody>
                {lista.map(f => (
                  <tr key={f.id}>
                    <td>{f.nome}</td><td>{f.cargo || '—'}</td>
                    <td>{f.tamanho_camiseta || '—'}</td><td>{f.tamanho_calca || '—'}</td><td>{f.tamanho_sapato || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — RELATÓRIOS DE HORAS
// ─────────────────────────────────────────────────────────────────────────────
function RelatoriosRH({ funcionarios, lancamentos }) {
  const hoje = new Date();
  const [aba, setAba]           = useState<'individual'|'parcial'|'consolidado'>('individual');
  const [mes, setMes]           = useState(hoje.getMonth()+1);
  const [ano, setAno]           = useState(hoje.getFullYear());
  const [funcId, setFuncId]     = useState('');
  const [dtInicio, setDtInicio] = useState('');
  const [dtFim, setDtFim]       = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const meses = Array.from({length:12},(_,i)=>i+1);
  const anos  = [2024,2025,2026,2027];

  // ── Filtros por aba ──────────────────────────────────────────────────────
  const lancsMenoAno = lancamentos.filter(l => Number(l.mes)===mes && Number(l.ano)===ano);

  const lancsPeriodo = (inicio: string, fim: string) => {
    if (!inicio || !fim) return lancamentos;
    return lancamentos.filter(l => l.data >= inicio && l.data <= fim);
  };

  // ── Preview em tela ──────────────────────────────────────────────────────
  const linhasIndividual = (() => {
    if (!funcId) return [];
    const f = funcionarios.find(f=>f.id===funcId);
    if (!f) return [];
    const ls = lancsMenoAno.filter(l=>l.funcionario_id===funcId || l.funcionario_id==funcId);
    return calcLinhas([f], ls);
  })();

  const linhasParcial = (() => {
    const ls = funcId
      ? lancsPeriodo(dtInicio,dtFim).filter(l=>l.funcionario_id===funcId)
      : lancsPeriodo(dtInicio,dtFim);
    const funcs = funcId ? funcionarios.filter(f=>f.id===funcId) : funcionarios;
    return calcLinhas(funcs, ls);
  })();

  const linhasConsolidado = calcLinhas(funcionarios, lancsMenoAno);

  const btnAba = (id: string, label: string) => (
    <button key={id} onClick={()=>setAba(id as any)}
      className={`acn-btn acn-tab-btn${aba===id?' ativo':''}`}
      style={{fontSize:10,padding:'5px 14px'}}>
      {label}
    </button>
  );

  const selectMesAno = () => (
    <div style={{display:'flex',gap:6,alignItems:'center'}}>
      <select value={mes} onChange={e=>setMes(Number(e.target.value))}
        style={{padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
        {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
      </select>
      <select value={ano} onChange={e=>setAno(Number(e.target.value))}
        style={{padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
        {anos.map(y=><option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );

  const selectFuncionario = (label='Funcionário') => (
    <select value={funcId} onChange={e=>setFuncId(e.target.value)}
      style={{padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
      <option value="">{label}</option>
      {funcionarios.filter(f=>f.ativo).map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
    </select>
  );


  return (
    <div className="sec-card">
      <div className="sec-hdr" style={{ cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
        onClick={()=>setCollapsed(c=>!c)}>
        <span>📄 Relatórios de Horas</span>
        <button onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#94a3b8',lineHeight:1,padding:'0 2px'}}>
          {collapsed?'▸':'▾'}
        </button>
      </div>
      {!collapsed && <div className="sec-body">
        {/* Abas */}
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {btnAba('individual','👤 Individual')}
          {btnAba('parcial','📅 Parcial por Período')}
          {btnAba('consolidado','📊 Consolidado')}
        </div>

        {/* ── INDIVIDUAL ── */}
        {aba === 'individual' && (
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
              {selectFuncionario('Selecione o funcionário...')}
              {selectMesAno()}
              <button
                onClick={() => {
                  if (!funcId) { alert('Selecione um funcionário!'); return; }
                  const f = funcionarios.find(f=>f.id===funcId);
                  imprimirRelatorio(
                    `Fechamento Individual — ${f?.nome}`,
                    `${mesNome(mes)}/${ano}`,
                    linhasIndividual
                  );
                }}
                style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                🖨️ Imprimir
              </button>
            </div>
            <TabelaPreview linhas={linhasIndividual} />
          </div>
        )}

        {/* ── PARCIAL POR PERÍODO ── */}
        {aba === 'parcial' && (
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
              {selectFuncionario('Todos os funcionários')}
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:10,color:'#6b7280'}}>De</span>
                <input type="date" value={dtInicio} onChange={e=>setDtInicio(e.target.value)}
                  style={{padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}} />
                <span style={{fontSize:10,color:'#6b7280'}}>até</span>
                <input type="date" value={dtFim} onChange={e=>setDtFim(e.target.value)}
                  style={{padding:'3px 6px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}} />
              </div>
              <button
                onClick={() => {
                  if (!dtInicio || !dtFim) { alert('Selecione o período!'); return; }
                  const f = funcId ? funcionarios.find(f=>f.id===funcId) : null;
                  imprimirRelatorio(
                    `Fechamento Parcial${f?` — ${f.nome}`:''}`,
                    `${fmtDate(dtInicio)} a ${fmtDate(dtFim)}`,
                    linhasParcial
                  );
                }}
                style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                🖨️ Imprimir
              </button>
            </div>
            <TabelaPreview linhas={linhasParcial} />
          </div>
        )}

        {/* ── CONSOLIDADO ── */}
        {aba === 'consolidado' && (
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
              {selectMesAno()}
              <button
                onClick={() => imprimirRelatorio(
                  'Fechamento Consolidado — Todos os Funcionários',
                  `${mesNome(mes)}/${ano}`,
                  linhasConsolidado
                )}
                style={{background:'#dc2626',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                🖨️ Imprimir
              </button>
            </div>
            <TabelaPreview linhas={linhasConsolidado} />
          </div>
        )}
      </div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — RELATÓRIO DE TÉCNICOS
// ─────────────────────────────────────────────────────────────────────────────
function RelatorioTecnicos({ funcionarios }) {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // OS de manutenção por técnico — colunas tecnico_responsavel e data_inicio_manutencao
      // são novas (ALTER TABLE) — usar fallback se não existirem ainda
      let osData: any[] = [];
      try {
        const { data: osD, error: osErr } = await supabase
          .from('sac_ordens_servico')
          .select('id,numero_os,cliente_nome,status,tecnico_responsavel,data_inicio_manutencao,data_conclusao_manutencao,tipo_avaliacao,veiculo_modelo')
          .not('tecnico_responsavel','is',null)
          .order('data_inicio_manutencao', { ascending: false });
        if (!osErr) osData = osD || [];
        else {
          // fallback sem colunas novas
          const { data: osD2 } = await supabase
            .from('sac_ordens_servico')
            .select('id,numero_os,cliente_nome,status')
            .order('id', { ascending: false })
            .limit(100);
          osData = osD2 || [];
        }
      } catch { osData = []; }

      // OPs com responsável comercial ordenadas por data_entrada (sempre existe)
      let opData: any[] = [];
      try {
        const { data: opD } = await supabase
          .from('oples')
          .select('id,opl,cliente_nome,status_geral,responsavel_comercial,data_entrada')
          .not('responsavel_comercial','is',null)
          .order('data_entrada', { ascending: false })
          .limit(200);
        opData = opD || [];
      } catch { opData = []; }

      const mapa = {};
      const addEntry = (nome, entry) => {
        if (!nome) return;
        const key = nome.trim().toLowerCase();
        if (!mapa[key]) mapa[key] = { nome: nome.trim(), os: [], op: [] };
        if (entry.tipo === 'os') mapa[key].os.push(entry);
        else mapa[key].op.push(entry);
      };

      osData.forEach(os => addEntry(os.tecnico_responsavel, {
        tipo:'os', id:os.id, numero:os.numero_os, cliente:os.cliente_nome,
        status:os.status, inicio:os.data_inicio_manutencao, fim:os.data_conclusao_manutencao,
        avaliacao:os.tipo_avaliacao, veiculo:os.veiculo_modelo,
      }));
      opData.forEach(op => addEntry(op.responsavel_comercial, {
        tipo:'op', id:op.id, numero:op.opl,
        cliente:op.cliente_nome, status:op.status_geral, inicio:op.data_entrada,
      }));

      const result = Object.values(mapa).map((tec) => {
        const func = funcionarios.find(f => f.nome.trim().toLowerCase() === tec.nome.toLowerCase());
        return { ...tec, func, totalOS: tec.os.length, totalOP: tec.op.length };
      });
      result.sort((a,b) => (b.totalOS+b.totalOP) - (a.totalOS+a.totalOP));
      setDados(result);
      setLoading(false);
    };
    load();
  }, [funcionarios]);

  // Etapa 7.15 (01/10/2026): oples.data_entrada é do tipo DATE ("2026-09-30"). new Date("2026-09-30") é meia-noite de Londres, que no Brasil
  // ainda é o dia anterior: as 200 OPs do relatório (e o HTML da impressão) mostravam um dia a menos. Texto só com a data: o dia sai direto
  // do texto. Data com hora (as OS têm) continua pelo fuso de quem usa. Mesmo erro já corrigido na Logística (Etapa 7.10).
  const fmtDt = (d) => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');
  const STC = { 'Em Execucao':'#8b5cf6','Manutencao Concluida':'#0d9488','Aguardando Inicio':'#f59e0b' };
  const stcOf = (s) => { for (const k of Object.keys(STC)) if (s && s.includes(k.split(' ')[0])) return STC[k]; return '#94a3b8'; };

  const filtrado = dados.filter(t => combinaBusca(t.nome, filtroNome));

  const imprimir = () => {
    const rows = filtrado.map(tec =>
      `<tr style="background:#f0f9ff"><td colspan="5" style="padding:8px 10px;font-weight:700;font-size:12px;border-top:2px solid #bfdbfe">` +
      `${tec.nome} ${tec.func ? '— ' + (tec.func.cargo||'') : '(nao cadastrado)'}` +
      ` <span style="font-size:10px;color:#64748b">${tec.totalOS} OS · ${tec.totalOP} OP</span></td></tr>` +
      tec.os.map(o =>
        `<tr><td style="padding:4px 10px 4px 24px">${o.numero}</td><td>OS</td>` +
        `<td>${o.cliente}</td><td>${o.status}</td><td>${fmtDt(o.inicio)}${o.fim ? ' > ' + fmtDt(o.fim) : ''}</td></tr>`
      ).join('') +
      tec.op.map(o =>
        `<tr><td style="padding:4px 10px 4px 24px">${o.numero||'—'}</td><td>OP</td>` +
        `<td>${o.cliente||'—'}</td><td>${o.status||'—'}</td><td>${fmtDt(o.inicio)}</td></tr>`
      ).join('')
    ).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatorio Tecnicos</title>` +
      `<style>body{font-family:Arial,sans-serif;font-size:11px;margin:25px;}h2{text-align:center;font-size:14px;}` +
      `.sub{text-align:center;font-size:10px;color:#555;margin-bottom:18px;}` +
      `table{width:100%;border-collapse:collapse;}th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}` +
      `td{padding:3px 8px;border-bottom:1px solid #f1f5f9;font-size:10px;}@media print{body{margin:12mm;}}</style></head><body>` +
      `<h2>ACN SINAL VERDE — RELATORIO DE TECNICOS</h2>` +
      `<div class="sub">Emitido em ${new Date().toLocaleString('pt-BR')}</div>` +
      `<table><thead><tr><th>Nr</th><th>Tipo</th><th>Cliente</th><th>Status</th><th>Periodo</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<scr` + `ipt>window.onload=function(){window.print()}<\/scr` + `ipt></body></html>`;
    const w = window.open('','_blank'); w.document.write(html); w.document.close();
  };

  return (
    <div style={{ marginTop:20, border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
      <div className="sec-hdr" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6, cursor:'pointer' }}
        onClick={()=>setCollapsed(c=>!c)}>
        <span>📊 Relatório de Técnicos</span>
        <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
          <input value={filtroNome} onChange={e=>setFiltroNome(e.target.value)}
            placeholder="Filtrar por nome..."
            style={{ padding:'3px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, width:150 }} />
          <button onClick={imprimir}
            style={{ background:'#1e293b', color:'#fff', border:'none', borderRadius:4, padding:'3px 12px', fontSize:10, cursor:'pointer' }}>
            🖨️ Imprimir
          </button>
          <button onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#94a3b8',lineHeight:1,padding:'0 2px'}}>
            {collapsed?'▸':'▾'}
          </button>
        </div>
      </div>
      {!collapsed && (loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : filtrado.length === 0 ? (
        <div className="acn-empty">Nenhum técnico designado encontrado.</div>
      ) : (
        <div style={{ padding:10 }}>
          {filtrado.map(tec => (
            <div key={tec.nome} style={{ marginBottom:8, border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden' }}>
              <div onClick={()=>setExpandido(expandido===tec.nome?null:tec.nome)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                  background: tec.func ? '#f0f9ff' : '#fafafa', cursor:'pointer',
                  borderBottom: expandido===tec.nome ? '1px solid #bfdbfe' : 'none' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center',
                  justifyContent:'center', fontWeight:800, fontSize:13,
                  background: tec.func ? '#2563eb' : '#94a3b8', color:'white' }}>
                  {tec.nome[0].toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'#1e293b' }}>{tec.nome}</div>
                  {tec.func && (
                    <div style={{ fontSize:10, color:'#64748b' }}>
                      {tec.func.cargo||'—'} · {tec.func.departamento||'—'}
                      <span style={{ marginLeft:6, fontSize:9, padding:'1px 5px', borderRadius:8,
                        background: tec.func.tipo_colaborador==='Terceiro'?'#fef3c7':'#eff6ff',
                        color: tec.func.tipo_colaborador==='Terceiro'?'#92400e':'#1d4ed8',
                        fontWeight:700, border:'1px solid currentColor' }}>
                        {tec.func.tipo_colaborador||'Funcionário'}
                      </span>
                    </div>
                  )}
                  {!tec.func && <div style={{ fontSize:10, color:'#f59e0b', fontWeight:600 }}>Nao cadastrado no RH</div>}
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {tec.totalOS > 0 && <span style={{ background:'#ede9fe', color:'#5b21b6', borderRadius:12, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{tec.totalOS} OS</span>}
                  {tec.totalOP > 0 && <span style={{ background:'#dcfce7', color:'#166534', borderRadius:12, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{tec.totalOP} OP</span>}
                  <span style={{ fontSize:12, color:'#94a3b8' }}>{expandido===tec.nome?'▲':'▼'}</span>
                </div>
              </div>
              {expandido === tec.nome && (
                <div style={{ padding:'8px 12px', background:'#fafafa' }}>
                  {tec.os.length > 0 && (
                    <>
                      <div style={{ fontSize:10, fontWeight:700, color:'#5b21b6', marginBottom:4, textTransform:'uppercase' }}>Ordens de Serviço</div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, marginBottom:8 }}>
                        <thead><tr style={{ background:'#ede9fe' }}>
                          <th style={{ padding:'4px 6px' }}>OS</th>
                          <th style={{ padding:'4px 6px' }}>Cliente / Veículo</th>
                          <th style={{ padding:'4px 6px' }}>Tipo</th>
                          <th style={{ padding:'4px 6px' }}>Status</th>
                          <th style={{ padding:'4px 6px' }}>Início</th>
                          <th style={{ padding:'4px 6px' }}>Conclusão</th>
                        </tr></thead>
                        <tbody>
                          {tec.os.map((o,i)=>(
                            <tr key={i} style={{ background:i%2===0?'white':'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                              <td style={{ padding:'4px 6px', fontWeight:700, color:'#5b21b6' }}>{o.numero}</td>
                              <td style={{ padding:'4px 6px' }}>{o.cliente}{o.veiculo ? ' — '+o.veiculo : ''}</td>
                              <td style={{ padding:'4px 6px' }}>
                                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8,
                                  background:o.avaliacao==='Remota'?'#e0f2fe':'#ede9fe',
                                  color:o.avaliacao==='Remota'?'#0369a1':'#5b21b6', fontWeight:700 }}>
                                  {o.avaliacao||'—'}
                                </span>
                              </td>
                              <td style={{ padding:'4px 6px' }}>
                                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:8, fontWeight:700,
                                  background:(stcOf(o.status))+'22', color:stcOf(o.status) }}>
                                  {o.status}
                                </span>
                              </td>
                              <td style={{ padding:'4px 6px' }}>{fmtDt(o.inicio)}</td>
                              <td style={{ padding:'4px 6px' }}>{fmtDt(o.fim)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {tec.op.length > 0 && (
                    <>
                      <div style={{ fontSize:10, fontWeight:700, color:'#166534', marginBottom:4, textTransform:'uppercase' }}>Ordens de Produção</div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                        <thead><tr style={{ background:'#dcfce7' }}>
                          <th style={{ padding:'4px 6px' }}>OP</th>
                          <th style={{ padding:'4px 6px' }}>Cliente</th>
                          <th style={{ padding:'4px 6px' }}>Status</th>
                          <th style={{ padding:'4px 6px' }}>Data</th>
                        </tr></thead>
                        <tbody>
                          {tec.op.map((o,i)=>(
                            <tr key={i} style={{ background:i%2===0?'white':'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                              <td style={{ padding:'4px 6px', fontWeight:700, color:'#166534' }}>{o.numero||'—'}</td>
                              <td style={{ padding:'4px 6px' }}>{o.cliente||'—'}</td>
                              <td style={{ padding:'4px 6px' }}>{o.status||'—'}</td>
                              <td style={{ padding:'4px 6px' }}>{fmtDt(o.inicio)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO — COMISSÕES DE TÉCNICOS
// ─────────────────────────────────────────────────────────────────────────────
function ComissoesRH({ funcionarios, currentUser }) {
  const hoje = new Date();
  const [mes, setMes]     = useState(hoje.getMonth() + 1);
  const [ano, setAno]     = useState(hoje.getFullYear());
  // Período — Mês/Ano (padrão) ou um intervalo de datas livre
  const [modoPeriodo, setModoPeriodo] = useState<'mes'|'intervalo'>('mes');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  // Faturada (padrão, comportamento de sempre — data_emissao_nf/data_faturamento
  // dentro do período) ou A Faturar (já concluído na produção dentro do
  // período, mas o Fiscal ainda não emitiu a NF — visão do que vem pela frente).
  const [modoFatura, setModoFatura] = useState<'faturada'|'a_faturar'>('faturada');
  // Origem — Adaptação = OPs (fabricação/transformação veicular) + OS de
  // manutenção veicular; exclui só as demais OS de SAC (rádio/equipamento
  // avulso, não é "carro").
  const [filtroOrigem, setFiltroOrigem] = useState<'todos'|'adaptacao'>('todos');
  const [dados, setDados] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]); // pipeline por técnico/dupla/equipe
  const [fechamentos, setFechamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aprovando, setAprovando] = useState<string|null>(null);
  const [abaComissao, setAbaComissao] = useState<'calculo'|'relatorio'>('calculo');
  const [collapsed, setCollapsed] = useState(false);

  const meses = [1,2,3,4,5,6,7,8,9,10,11,12];
  const anos = [hoje.getFullYear()-1, hoje.getFullYear(), hoje.getFullYear()+1];
  const fmtMoeda = (v: number) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  // Aqui a data pode vir tanto como 'date' puro (ex: sac_ordens_servico.data_faturamento,
  // "2026-08-15") quanto timestamptz completo (data_emissao_nf, data_conclusao_producao/
  // _manutencao, "2026-08-15T14:32:10+00:00") -- concatenar 'T00:00:00' cegamente nesse
  // segundo caso gerava uma string inválida ("Invalid Date"). Só completa quando falta o T.
  const fmtDt = (d: any) => d ? new Date(String(d).includes('T') ? d : d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const podeAutorizar = currentUser?.perfil === 'Admin' || currentUser?.pode_autorizar_rh === true;

  const calcular = async () => {
    setLoading(true);
    // Período: Mês/Ano (calendário) ou intervalo de datas livre
    let inicio: string, fim: string;
    if (modoPeriodo === 'intervalo') {
      if (!dataDe || !dataAte) { alert('Informe as duas datas do período.'); setLoading(false); return; }
      inicio = dataDe; fim = dataAte;
    } else {
      const mesStr = String(mes).padStart(2,'0');
      inicio = `${ano}-${mesStr}-01`;
      fim    = diaISO(new Date(ano, mes, 0));
    }

    // Faturada: comportamento de sempre (data_emissao_nf/data_faturamento
    // dentro do período). A Faturar: já concluído na produção dentro do
    // período, mas ainda sem NF emitida — dá visão do que vem pela frente.
    let opQuery = supabase.from('oples')
      .select('id,opl,cliente_nome,tecnico_producao_id,responsavel_producao,valor_total,valor_mao_de_obra,valor_mao_de_obra_serralheria,data_emissao_nf,data_conclusao_producao,modo_execucao,equipe_id,equipe_nome,tecnico_producao_2_id,tecnico_producao_2_nome');
    // Antes havia aqui `.not('tecnico_producao_id','is',null)`: OP sem o técnico principal nem entrava na
    // conta. Desde 30/09/2026 a equipe pode ser apontada ou corrigida depois (EquipeDaOp.tsx), inclusive
    // numa OP que nunca teve técnico principal — e quem manda é a lista em `responsaveis_producao`, não
    // o campo da OP. Conferido no banco antes de tirar: nenhuma linha de equipe existia em OP sem técnico
    // principal, então o resultado de hoje não muda (fotografia da tela antes e depois: compara_rh.cjs).
    opQuery = modoFatura === 'faturada'
      ? opQuery.gte('data_emissao_nf', inicio).lte('data_emissao_nf', fim)
      : opQuery.gte('data_conclusao_producao', inicio).lte('data_conclusao_producao', fim).is('data_emissao_nf', null);

    let osQuery = supabase.from('sac_ordens_servico')
      .select('id,numero_os,cliente_nome,tecnico_producao_id,tecnico_responsavel,valor_total,valor_mao_de_obra,data_faturamento,data_conclusao_manutencao,modo_execucao,equipe_id,equipe_nome,tecnico_producao_2_id,tecnico_producao_2_nome,is_manutencao_veicular')
      .not('tecnico_producao_id','is',null);
    osQuery = modoFatura === 'faturada'
      ? osQuery.gte('data_faturamento', inicio).lte('data_faturamento', fim)
      : osQuery.gte('data_conclusao_manutencao', inicio).lte('data_conclusao_manutencao', fim).is('data_faturamento', null);

    const [opRes, osRes, fechRes] = await Promise.all([
      opQuery,
      osQuery,
      modoPeriodo === 'mes' && modoFatura === 'faturada'
        ? supabase.from('rh_comissoes_fechamento').select('*').eq('mes', mes).eq('ano', ano)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const ops: any[] = opRes.data || [];
    // Origem "Adaptação": OPs (toda fabricação/transformação de veículo) +
    // só as OS de manutenção veicular — exclui SAC de equipamento/rádio avulso.
    const oss: any[] = (osRes.data || []).filter((os: any) => filtroOrigem === 'todos' || os.is_manutencao_veicular === true);
    setFechamentos(fechRes.data || []);

    // OP "mãe" com vários veículos (ex.: OPL A1419.2607/01..90, 90 carros):
    // cada veículo vira um registro em `oples` (opl = "BASE" ou "BASE/NN"),
    // mas o valor_total/valor_mao_de_obra lançado é o do LOTE inteiro,
    // repetido igual em todos os registros — não o valor unitário. Buscamos
    // a tabela toda (só id/opl/valores, ~poucas centenas de linhas) pra
    // detectar esses lotes (mesma base, >1 veículo, mesmo valor repetido) e
    // dividir pelo nº de veículos antes de usar como base de comissão.
    const { data: todasOpsRaw } = await supabase.from('oples')
      .select('id,opl,valor_total,valor_mao_de_obra,valor_mao_de_obra_serralheria');
    const baseOplDe = (opl: string) => String(opl || '').replace(/\/\d+$/, '');
    const gruposBase: Record<string, any[]> = {};
    (todasOpsRaw || []).forEach((o: any) => { (gruposBase[baseOplDe(o.opl)] ||= []).push(o); });
    const divisorPorBase: Record<string, number> = {};
    Object.entries(gruposBase).forEach(([base, itens]) => {
      if (itens.length <= 1) return;
      const mdoVals = new Set(itens.map((i: any) => i.valor_mao_de_obra).filter((v: any) => v != null));
      const totVals = new Set(itens.map((i: any) => i.valor_total).filter((v: any) => v != null));
      // Só divide quando TODOS os veículos do lote compartilham exatamente o
      // mesmo valor (indício claro de lançamento único pro lote inteiro) —
      // se já vierem com valores distintos por veículo, respeita como está.
      if (mdoVals.size <= 1 && totVals.size <= 1) divisorPorBase[base] = itens.length;
    });

    // Mapa auxiliar id -> dados do item (OP ou OS), pra resolver cada linha de
    // responsaveis_producao de volta pro item de onde ela veio.
    const itemById: Record<string, any> = {};
    ops.forEach(op => {
      const divisor = divisorPorBase[baseOplDe(op.opl)] || 1;
      const unit = (v: any) => v != null ? Number(v) / divisor : v;
      itemById[op.id] = {
        tipo:'OP', id:op.id, numero:op.opl, cliente:op.cliente_nome,
        valor_total:unit(op.valor_total), valor_mao_de_obra:unit(op.valor_mao_de_obra),
        valor_mao_de_obra_serralheria:unit(op.valor_mao_de_obra_serralheria),
        qtdVeiculosLote: divisor > 1 ? divisor : undefined,
        data_faturamento: modoFatura === 'faturada' ? op.data_emissao_nf : op.data_conclusao_producao,
        modo_execucao:op.modo_execucao, equipe_id:op.equipe_id, equipe_nome:op.equipe_nome,
        tecnico_producao_id:op.tecnico_producao_id, tecnico_producao_2_id:op.tecnico_producao_2_id, tecnico_producao_2_nome:op.tecnico_producao_2_nome,
      };
    });
    oss.forEach(os => { itemById[os.id] = {
      tipo:'OS', id:os.id, numero:os.numero_os, cliente:os.cliente_nome,
      valor_total:os.valor_total, valor_mao_de_obra:os.valor_mao_de_obra,
      data_faturamento: modoFatura === 'faturada' ? os.data_faturamento : os.data_conclusao_manutencao,
      modo_execucao:os.modo_execucao, equipe_id:os.equipe_id, equipe_nome:os.equipe_nome,
      tecnico_producao_id:os.tecnico_producao_id, tecnico_producao_2_id:os.tecnico_producao_2_id, tecnico_producao_2_nome:os.tecnico_producao_2_nome,
    }; });

    // Fonte única de crédito: responsaveis_producao (semeada com o técnico
    // principal/dupla ao iniciar a OP/OS — ver ProducaoTab.tsx — e editável
    // livremente depois via "👥 Equipe"). Não usa mais oples.tecnico_producao_id
    // direto aqui, pra não contar o técnico principal duas vezes.
    const idsRelevantes = [...ops.map((o:any)=>o.id), ...oss.map((o:any)=>o.id)];
    const { data: respData } = idsRelevantes.length > 0
      // ordem fixa (30/09/2026): sem ela a ordem dos técnicos e das OPs na tela era a que o banco
      // devolvesse naquele momento, e mudava sozinha quando a consulta mudava
      ? await supabase.from('responsaveis_producao').select('*').in('referencia_id', idsRelevantes).order('criado_em').order('id')
      : { data: [] as any[] };
    const responsaveis: any[] = respData || [];

    const mapa: Record<string, any> = {};
    const addItem = (tecId: string, item: any) => {
      if (!mapa[tecId]) {
        const func = funcionarios.find((f:any) => f.id === tecId);
        mapa[tecId] = {
          tecnicoId: tecId,
          tecnicoNome: func?.nome || '—',
          func,
          incideEm: func?.incide_em || 'Faturamento',
          percentual: func?.percentual_comissao || 0,
          ops: [], oss: [], totalBase: 0, totalComissao: 0, totalComissaoApoio: 0,
        };
      }
      if (item.tipo === 'OP') mapa[tecId].ops.push(item);
      else mapa[tecId].oss.push(item);
    };

    responsaveis.forEach((r:any) => {
      const item = itemById[r.referencia_id];
      if (!item || !r.tecnico_id) return;
      addItem(r.tecnico_id, { ...item, papel: r.papel });
    });

    // Recalcular totais com incideEm correto. Responsáveis usam a fórmula normal
    // (base * percentual configurado do técnico); apoios sempre 0,1% fixo de
    // valor_mao_de_obra, independente do incide_em/percentual configurado.
    Object.values(mapa).forEach((tec: any) => {
      const allItems = [...tec.ops, ...tec.oss];
      const getBase = (i: any) => {
        // Quem trabalhou na serralheria (30/09/2026, regra do usuário): comissão em cima da mão de obra de
        // SERRALHERIA da OP, qualquer que seja o "incide em" do cadastro — o que vale é em que lista da
        // OP a pessoa foi apontada. Usa o percentual dela, como o responsável.
        if (i.papel === 'serralheria') return Number(i.valor_mao_de_obra_serralheria || 0);
        if (i.papel === 'apoio') return Number(i.valor_mao_de_obra || 0);
        if (tec.incideEm === 'Mão de Obra') return Number(i.valor_mao_de_obra || 0);
        if (tec.incideEm === 'Serralheria') return Number(i.valor_mao_de_obra_serralheria || 0);
        return Number(i.valor_total || 0);
      };
      allItems.forEach((i: any) => { i.base = getBase(i); });
      const responsavelItems = allItems.filter((i:any) => i.papel !== 'apoio');
      const apoioItems       = allItems.filter((i:any) => i.papel === 'apoio');
      tec.totalBase = responsavelItems.reduce((s: number, i: any) => s + i.base, 0);
      tec.totalComissaoApoio = apoioItems.reduce((s: number, i: any) => s + i.base * 0.001, 0);
      tec.totalComissao = (tec.totalBase * (tec.percentual / 100)) + tec.totalComissaoApoio;
    });

    // ── Pipeline agrupado por Técnico individual / Dupla / Equipe ──────────
    // Usa o mesmo item.base/comissão já calculado acima (por técnico), só
    // reagrupa pela "chave de execução" do item (modo_execucao do
    // OP/OS) em vez de por técnico isolado — uma dupla/equipe vira 1 grupo
    // com a soma dos dois, sem contar o mesmo OP/OS duas vezes na contagem.
    const chaveGrupo = (item: any) => {
      if (item.modo_execucao === 'equipe' && item.equipe_id) {
        return { chave: `equipe:${item.equipe_id}`, label: item.equipe_nome || '—', tipo: 'equipe' as const };
      }
      if (item.modo_execucao === 'dupla' && item.tecnico_producao_2_id) {
        const nome1 = mapa[item.tecnico_producao_id]?.tecnicoNome || '—';
        const nome2 = item.tecnico_producao_2_nome || '—';
        const chave = ['dupla', item.tecnico_producao_id, item.tecnico_producao_2_id].sort().join(':');
        return { chave, label: `${nome1} + ${nome2}`, tipo: 'dupla' as const };
      }
      if (item.tecnico_producao_id) {
        return { chave: `individual:${item.tecnico_producao_id}`, label: mapa[item.tecnico_producao_id]?.tecnicoNome || '—', tipo: 'individual' as const };
      }
      return null;
    };

    const mapaGrupos: Record<string, any> = {};
    Object.values(mapa).forEach((tec: any) => {
      [...tec.ops, ...tec.oss].forEach((item: any) => {
        if (item.papel === 'apoio' || item.papel === 'serralheria') return; // apoio e serralheria não definem o grupo, só são contabilizados dentro dele
        const g = chaveGrupo(item);
        if (!g) return;
        if (!mapaGrupos[g.chave]) {
          mapaGrupos[g.chave] = { chave: g.chave, label: g.label, tipo: g.tipo, itensVistos: new Set<string>(), qtdComApoio: 0, qtdSemApoio: 0, totalComissao: 0 };
        }
        const grupo = mapaGrupos[g.chave];
        if (grupo.itensVistos.has(item.id)) { grupo.totalComissao += item.base * tec.percentual / 100; return; } // 2º membro da dupla/equipe no mesmo item — só soma a comissão dele
        grupo.itensVistos.add(item.id);
        grupo.totalComissao += item.base * tec.percentual / 100;
      });
    });
    // Marca com/sem apoio (feito num 2º passo, olhando responsaveis_producao
    // diretamente por item, já que "apoio" não passa pela chaveGrupo acima).
    const apoiosPorItem: Record<string, boolean> = {};
    responsaveis.forEach((r: any) => { if (r.papel === 'apoio') apoiosPorItem[r.referencia_id] = true; });
    Object.values(mapaGrupos).forEach((grupo: any) => {
      grupo.itensVistos.forEach((itemId: string) => {
        if (apoiosPorItem[itemId]) grupo.qtdComApoio++; else grupo.qtdSemApoio++;
      });
      grupo.qtdTotal = grupo.itensVistos.size;
    });
    // Soma a comissão dos apoios de cada item no total do grupo dono do item
    Object.values(mapa).forEach((tec: any) => {
      [...tec.ops, ...tec.oss].filter((i: any) => i.papel === 'apoio').forEach((item: any) => {
        const grupoDono = Object.values(mapaGrupos).find((gr: any) => gr.itensVistos.has(item.id));
        if (grupoDono) grupoDono.totalComissao += item.base * 0.001;
      });
      // quem trabalhou na serralheria entra no total do grupo da OP com o percentual próprio
      [...tec.ops, ...tec.oss].filter((i: any) => i.papel === 'serralheria').forEach((item: any) => {
        const grupoDono = Object.values(mapaGrupos).find((gr: any) => gr.itensVistos.has(item.id));
        if (grupoDono) grupoDono.totalComissao += item.base * tec.percentual / 100;
      });
    });

    setDados(Object.values(mapa));
    // Empate em nº de OP/OS: desempata pelo nome (30/09/2026). Antes a ordem dos cartões empatados era a
    // ordem em que o banco devolvia as linhas da equipe — que muda sozinha quando a consulta muda — e
    // dois cartões com a mesma contagem trocavam de lugar entre uma abertura e outra.
    setGrupos(Object.values(mapaGrupos).sort((a: any, b: any) =>
      b.qtdTotal - a.qtdTotal || String(a.label).localeCompare(String(b.label), 'pt-BR')));
    setLoading(false);
  };

  const aprovar = async (tec: any) => {
    if (!podeAutorizar) { alert('Sem permissão para aprovar comissões.'); return; }
    setAprovando(tec.tecnicoId);
    const payload = {
      mes, ano,
      tecnico_id: tec.tecnicoId,
      tecnico_nome: tec.tecnicoNome,
      incide_em: tec.incideEm,
      percentual: tec.percentual,
      total_base: tec.totalBase,
      total_comissao: tec.totalComissao,
      qtd_ops: tec.ops.length,
      qtd_oss: tec.oss.length,
      detalhes: [...tec.ops, ...tec.oss],
      status: 'aprovado',
      aprovado_por: currentUser?.nome,
      aprovado_em: new Date().toISOString(),
    };
    const { error } = await supabase.from('rh_comissoes_fechamento').upsert([payload], { onConflict: 'mes,ano,tecnico_id' });
    if (error) { alert('Erro: ' + error.message); setAprovando(null); return; }
    const { data: newFech } = await supabase.from('rh_comissoes_fechamento').select('*').eq('mes', mes).eq('ano', ano);
    setFechamentos(newFech || []);
    setAprovando(null);
  };

  const jaAprovado = (tecId: string) => fechamentos.find((f:any) => f.tecnico_id === tecId && f.status === 'aprovado');

  return (
    <div style={{marginTop:20,border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden'}}>
      <div className="sec-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6,cursor:'pointer'}}
        onClick={()=>setCollapsed(c=>!c)}>
        <span>💰 Comissões de Técnicos</span>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}} onClick={e=>e.stopPropagation()}>
          <button className={`acn-btn acn-tab-btn${abaComissao==='calculo'?' ativo':''}`}
            style={{fontSize:10,padding:'4px 12px'}} onClick={()=>setAbaComissao('calculo')}>Cálculo</button>
          <button className={`acn-btn acn-tab-btn${abaComissao==='relatorio'?' ativo':''}`}
            style={{fontSize:10,padding:'4px 12px'}} onClick={()=>setAbaComissao('relatorio')}>Histórico</button>
          <button onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:14,color:'#94a3b8',lineHeight:1,padding:'0 2px'}}>
            {collapsed?'▸':'▾'}
          </button>
        </div>
      </div>

      {!collapsed && abaComissao === 'calculo' && (
        <div style={{padding:'10px 12px'}}>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
            <div style={{display:'flex',borderRadius:4,overflow:'hidden',border:'1px solid #d1d5db'}}>
              <button onClick={()=>setModoFatura('faturada')} title="OPs/OSs com NF emitida dentro do período" style={{padding:'4px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
                background:modoFatura==='faturada'?'#16a34a':'#fff',color:modoFatura==='faturada'?'#fff':'#475569'}}>✅ Faturada</button>
              <button onClick={()=>setModoFatura('a_faturar')} title="Produção concluída dentro do período, NF ainda não emitida" style={{padding:'4px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
                background:modoFatura==='a_faturar'?'#d97706':'#fff',color:modoFatura==='a_faturar'?'#fff':'#475569'}}>⏳ A Faturar</button>
            </div>
            <div style={{display:'flex',borderRadius:4,overflow:'hidden',border:'1px solid #d1d5db'}}>
              <button onClick={()=>setModoPeriodo('mes')} style={{padding:'4px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
                background:modoPeriodo==='mes'?'#2563eb':'#fff',color:modoPeriodo==='mes'?'#fff':'#475569'}}>Mês/Ano</button>
              <button onClick={()=>setModoPeriodo('intervalo')} style={{padding:'4px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
                background:modoPeriodo==='intervalo'?'#2563eb':'#fff',color:modoPeriodo==='intervalo'?'#fff':'#475569'}}>Período (De/Até)</button>
            </div>
            {modoPeriodo === 'mes' ? (
              <>
                <select value={mes} onChange={e=>setMes(Number(e.target.value))}
                  style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
                  {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
                </select>
                <select value={ano} onChange={e=>setAno(Number(e.target.value))}
                  style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
                  {anos.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </>
            ) : (
              <>
                <input type="date" value={dataDe} onChange={e=>setDataDe(e.target.value)}
                  style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}} />
                <span style={{fontSize:10,color:'#94a3b8'}}>até</span>
                <input type="date" value={dataAte} onChange={e=>setDataAte(e.target.value)}
                  style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}} />
              </>
            )}
            <select value={filtroOrigem} onChange={e=>setFiltroOrigem(e.target.value as any)}
              style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
              <option value="todos">Todas as origens</option>
              <option value="adaptacao">Só Adaptação (veículos)</option>
            </select>
            <button onClick={calcular} disabled={loading}
              style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:4,padding:'4px 14px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
              {loading ? 'Calculando...' : '🔍 Calcular'}
            </button>
          </div>
          <div style={{fontSize:10,color:'#64748b',marginBottom:12}}>
            Período: {modoPeriodo==='mes' ? `${mesNome(mes)}/${ano}` : `${dataDe||'—'} até ${dataAte||'—'}`} ·{' '}
            {modoFatura==='faturada'
              ? 'OPs/OSs com NF emitida no período'
              : 'OPs/OSs concluídas no período, NF ainda não emitida'}
            {filtroOrigem==='adaptacao' && <> · 🚗 só OPs (transformação veicular) + OS de manutenção veicular</>}
            {modoPeriodo==='intervalo' && <> · aprovação de fechamento fica disponível só no modo Mês/Ano</>}
            {modoFatura==='a_faturar' && <> · valores estimados — aprovação de fechamento fica disponível só em Faturada</>}
          </div>

          {grupos.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:'#475569',marginBottom:6,textTransform:'uppercase'}}>
                📊 Pipeline — OP/OS por Técnico, Dupla e Equipe
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {grupos.map((g:any) => (
                  <div key={g.chave} style={{minWidth:170,border:'1px solid #e2e8f0',borderRadius:6,padding:'8px 10px',
                    background: g.tipo==='equipe' ? '#faf5ff' : g.tipo==='dupla' ? '#eff6ff' : '#f8fafc'}}>
                    <div style={{fontSize:9,fontWeight:700,color: g.tipo==='equipe' ? '#7c3aed' : g.tipo==='dupla' ? '#2563eb' : '#475569',marginBottom:3}}>
                      {g.tipo==='equipe' ? '🏷️ Equipe' : g.tipo==='dupla' ? '👥 Dupla' : '👤 Individual'}
                    </div>
                    <div style={{fontWeight:700,fontSize:12,color:'#1e293b',marginBottom:5}}>{g.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:'#1e293b'}}>{g.qtdTotal} <span style={{fontSize:9,fontWeight:600,color:'#94a3b8'}}>OP/OS</span></div>
                    <div style={{fontSize:9,color:'#64748b',marginBottom:4}}>
                      {g.qtdComApoio>0 && <span style={{color:'#b45309',fontWeight:600}}>{g.qtdComApoio} c/ apoio</span>}
                      {g.qtdComApoio>0 && g.qtdSemApoio>0 && ' · '}
                      {g.qtdSemApoio>0 && <span>{g.qtdSemApoio} sem apoio</span>}
                    </div>
                    <div style={{fontSize:12,fontWeight:800,color:'#16a34a'}}>{fmtMoeda(g.totalComissao)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dados.length === 0 && !loading && (
            <div className="acn-empty">Clique em Calcular para carregar as comissões do período.</div>
          )}
          {dados.map(tec => {
            const aprov = jaAprovado(tec.tecnicoId);
            const allItems = [...tec.ops, ...tec.oss];
            return (
              <div key={tec.tecnicoId} style={{marginBottom:10,border:`1px solid ${aprov?'#86efac':'#e2e8f0'}`,borderRadius:6,overflow:'hidden'}}>
                {/* Cabeçalho técnico */}
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',
                  background:aprov?'#f0fdf4':'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:12,color:'#1e293b'}}>{tec.tecnicoNome}</div>
                    <div style={{fontSize:10,color:'#64748b'}}>
                      Incide em: <strong>{tec.incideEm}</strong> ·
                      Percentual: <strong style={{color:'#2563eb'}}>{tec.percentual}%</strong> ·
                      {tec.ops.length > 0 && <> {tec.ops.length} OP</>}
                      {tec.oss.length > 0 && <> · {tec.oss.length} OS</>}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#475569'}}>Base: <strong>{fmtMoeda(tec.totalBase)}</strong></div>
                    <div style={{fontSize:14,fontWeight:800,color:aprov?'#16a34a':'#2563eb'}}>
                      Comissão: {fmtMoeda(tec.totalComissao)}
                    </div>
                    {aprov && <div style={{fontSize:9,color:'#16a34a',fontWeight:600}}>✅ Aprovado por {aprov.aprovado_por}</div>}
                  </div>
                  {podeAutorizar && !aprov && modoPeriodo === 'mes' && modoFatura === 'faturada' && (
                    <button onClick={()=>aprovar(tec)} disabled={aprovando===tec.tecnicoId}
                      style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:4,padding:'5px 12px',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                      {aprovando===tec.tecnicoId ? '...' : 'Aprovar'}
                    </button>
                  )}
                </div>
                {/* Lista de itens */}
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                  <thead><tr style={{background:'#f1f5f9'}}>
                    <th style={{padding:'4px 8px',textAlign:'left'}}>Tipo</th>
                    <th style={{padding:'4px 8px',textAlign:'left'}}>Nº</th>
                    <th style={{padding:'4px 8px',textAlign:'left'}}>Cliente</th>
                    <th style={{padding:'4px 8px',textAlign:'right'}}>Valor Total</th>
                    <th style={{padding:'4px 8px',textAlign:'right'}}>Mão de Obra</th>
                    <th style={{padding:'4px 8px',textAlign:'right'}}>Base Cálculo</th>
                    <th style={{padding:'4px 8px',textAlign:'right',color:'#2563eb'}}>Comissão</th>
                    <th style={{padding:'4px 8px',textAlign:'center'}}>{modoFatura==='faturada' ? 'Fat.' : 'Concl.'}</th>
                  </tr></thead>
                  <tbody>
                    {allItems.map((item: any, i: number) => (
                      <tr key={i} style={{background:i%2===0?'white':'#f8fafc',borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'4px 8px'}}>
                          <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,fontWeight:700,
                            background:item.tipo==='OP'?'#dcfce7':'#ede9fe',
                            color:item.tipo==='OP'?'#166534':'#5b21b6'}}>{item.tipo}</span>
                          {item.papel==='apoio' && (
                            <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,fontWeight:700,
                              background:'#fef3c7',color:'#92400e',marginLeft:4}}>APOIO</span>
                          )}
                          {item.papel==='serralheria' && (
                            <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,fontWeight:700,
                              background:'#ffedd5',color:'#9a3412',marginLeft:4}}>SERRALHERIA</span>
                          )}
                        </td>
                        <td style={{padding:'4px 8px',fontWeight:700}}>
                          {item.numero||'—'}
                          {item.qtdVeiculosLote > 1 && (
                            <span title={`Lote de ${item.qtdVeiculosLote} veículos — valor unitário (total do lote ÷ ${item.qtdVeiculosLote})`}
                              style={{fontSize:8,padding:'1px 5px',borderRadius:8,fontWeight:700,background:'#e0e7ff',color:'#3730a3',marginLeft:4}}>
                              lote/{item.qtdVeiculosLote}
                            </span>
                          )}
                        </td>
                        <td style={{padding:'4px 8px'}}>{item.cliente||'—'}</td>
                        <td style={{padding:'4px 8px',textAlign:'right'}}>{item.valor_total != null ? fmtMoeda(item.valor_total) : '—'}</td>
                        <td style={{padding:'4px 8px',textAlign:'right'}}>{(item.papel==='serralheria' ? item.valor_mao_de_obra_serralheria : item.valor_mao_de_obra) != null ? fmtMoeda(item.papel==='serralheria' ? item.valor_mao_de_obra_serralheria : item.valor_mao_de_obra) : '—'}</td>
                        <td style={{padding:'4px 8px',textAlign:'right',fontWeight:700}}>{fmtMoeda(item.base)}</td>
                        <td style={{padding:'4px 8px',textAlign:'right',fontWeight:700,color:'#2563eb'}}>
                          {fmtMoeda(item.papel==='apoio' ? item.base * 0.001 : item.base * tec.percentual / 100)}
                        </td>
                        <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtDt(item.data_faturamento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && abaComissao === 'relatorio' && <HistoricoComissoes funcionarios={funcionarios} />}
    </div>
  );
}

function HistoricoComissoes({ funcionarios }) {
  const [collapsed, setCollapsed] = useState(false);
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth()+1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const meses = [1,2,3,4,5,6,7,8,9,10,11,12];
  const anos = [hoje.getFullYear()-1, hoje.getFullYear(), hoje.getFullYear()+1];
  const fmtMoeda = (v: number) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const fmtDt = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const buscar = async () => {
    setLoading(true);
    const { data } = await supabase.from('rh_comissoes_fechamento').select('*').eq('mes', mes).eq('ano', ano).order('tecnico_nome');
    setDados(data || []);
    setLoading(false);
  };

  return (
    <div style={{padding:'10px 12px'}}>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <select value={mes} onChange={e=>setMes(Number(e.target.value))}
          style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
          {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
        </select>
        <select value={ano} onChange={e=>setAno(Number(e.target.value))}
          style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:4,fontSize:10}}>
          {anos.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={buscar} disabled={loading}
          style={{background:'#475569',color:'#fff',border:'none',borderRadius:4,padding:'4px 14px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
          {loading ? 'Buscando...' : '📋 Buscar'}
        </button>
      </div>
      {dados.length === 0 && !loading && <div className="acn-empty">Nenhum fechamento encontrado para o período.</div>}
      {dados.length > 0 && (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
          <thead><tr style={{background:'#1e293b',color:'#fff'}}>
            <th style={{padding:'6px 8px',textAlign:'left'}}>Técnico</th>
            <th style={{padding:'6px 8px',textAlign:'center'}}>Incide em</th>
            <th style={{padding:'6px 8px',textAlign:'center'}}>%</th>
            <th style={{padding:'6px 8px',textAlign:'right'}}>OPs</th>
            <th style={{padding:'6px 8px',textAlign:'right'}}>OSs</th>
            <th style={{padding:'6px 8px',textAlign:'right'}}>Base</th>
            <th style={{padding:'6px 8px',textAlign:'right'}}>Comissão</th>
            <th style={{padding:'6px 8px',textAlign:'center'}}>Status</th>
            <th style={{padding:'6px 8px',textAlign:'left'}}>Aprovado por</th>
            <th style={{padding:'6px 8px',textAlign:'left'}}>Data</th>
          </tr></thead>
          <tbody>
            {dados.map((d:any,i:number) => (
              <tr key={d.id} style={{background:i%2===0?'white':'#f8fafc',borderBottom:'1px solid #f1f5f9'}}>
                <td style={{padding:'5px 8px',fontWeight:700}}>{d.tecnico_nome}</td>
                <td style={{padding:'5px 8px',textAlign:'center'}}>{d.incide_em}</td>
                <td style={{padding:'5px 8px',textAlign:'center'}}>{d.percentual}%</td>
                <td style={{padding:'5px 8px',textAlign:'right'}}>{d.qtd_ops}</td>
                <td style={{padding:'5px 8px',textAlign:'right'}}>{d.qtd_oss}</td>
                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmtMoeda(d.total_base)}</td>
                <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700,color:'#16a34a'}}>{fmtMoeda(d.total_comissao)}</td>
                <td style={{padding:'5px 8px',textAlign:'center'}}>
                  <span style={{fontSize:9,padding:'2px 7px',borderRadius:8,fontWeight:700,
                    background:d.status==='aprovado'?'#dcfce7':'#fef3c7',
                    color:d.status==='aprovado'?'#166534':'#92400e'}}>
                    {d.status==='aprovado'?'✅ Aprovado':'Pendente'}
                  </span>
                </td>
                <td style={{padding:'5px 8px'}}>{d.aprovado_por||'—'}</td>
                <td style={{padding:'5px 8px'}}>{fmtDt(d.aprovado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACESSO RESTRITO — só "💰 Comissões de Técnicos", sem o resto do RH.
// Usado quando o usuário tem permissoes_rh.includes('comissoes_tecnicos') mas
// não a aba "rh" inteira liberada (ver isVisible/SIDEBAR_GROUPS em
// DashboardTab.tsx e a seção "RH — Acesso Restrito" em AdminTab.tsx).
// ─────────────────────────────────────────────────────────────────────────────
export function ComissoesTecnicosStandalone({ currentUser }) {
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('rh_funcionarios').select('*').or('ativo.eq.true,status_presenca.eq.Desligado').order('nome')
      .then(({ data }) => { setFuncionarios(data || []); setLoading(false); });
  }, []);

  if (loading) return <div className="acn-empty">Carregando...</div>;
  return <ComissoesRH funcionarios={funcionarios} currentUser={currentUser} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function RHTab({ currentUser }) {
  const [funcionarios, setFuncionarios]   = useState<any[]>([]);
  const [desligados, setDesligados]       = useState<any[]>([]);
  const [modalDesligar, setModalDesligar] = useState<any>(null);
  const [lancamentos, setLancamentos]     = useState<any[]>([]);
  const [autorizacoes, setAutorizacoes]   = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);

  const [modalFunc, setModalFunc]         = useState<'new'|any|null>(null);
  const [modalLanc, setModalLanc]         = useState(false);
  const [modalAut, setModalAut]           = useState(false);

  const isAdmin = true; // acesso já controlado pelo dashboard (abas_permitidas)
  const podeAutorizar = currentUser?.perfil === 'Admin' || currentUser?.pode_autorizar_rh === true;

  const fetch = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const [fRes, lRes, aRes, dRes] = await Promise.all([
      supabase.from('rh_funcionarios').select('*').eq('ativo', true).order('nome'),
      supabase.from('rh_lancamentos').select('*').order('data', { ascending: false }),
      supabase.from('rh_autorizacoes').select('*').order('data', { ascending: false }),
      supabase.from('rh_funcionarios').select('*').eq('status_presenca', 'Desligado')
        .order('data_desligamento', { ascending: false, nullsFirst: false }).order('nome'),
    ]);
    setFuncionarios(fRes.data || []);
    setDesligados(dRes.data || []);
    setLancamentos(lRes.data || []);
    setAutorizacoes(aRes.data || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { fetch(); const t = setInterval(()=>fetch(true), 60000); return () => clearInterval(t); }, [fetch]);

  // Horas, autorizações e comissões antigas apontam para gente que já saiu: para mostrar o nome (e o percentual)
  // delas, essas telas recebem os desligados junto. As listas de trabalho usam só `funcionarios` (ativo).
  const comDesligados = [...funcionarios, ...desligados];
  const reativar = async (f: any) => {
    if (!await confirmar(`Reativar "${f.nome}"?\n\nEla volta para as listas de trabalho com o status Ativo.`)) return;
    const novo = { status_presenca: 'Ativo', ativo: true, data_desligamento: null, motivo_desligamento: null };
    const { error } = await supabase.from('rh_funcionarios').update(novo).eq('id', f.id);
    if (error) { alert('Não foi possível reativar: ' + error.message); return; }
    logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: f.id, changeType: 'UPDATE',
      oldRow: f, newRow: { ...f, ...novo }, user: currentUser });
    fetch();
  };

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
      <div className="acn-rh-topo">
        <Indicadores compacto itens={[
          { l: 'Ativos',     v: resumo.ativos,    tom: 'ok' },
          { l: 'Viagem',     v: resumo.viagem,    tom: 'info' },
          { l: 'Folga',      v: resumo.folga,     tom: 'info' },
          { l: 'Férias',     v: resumo.ferias,    tom: 'marca' },
          { l: 'Afastados',  v: resumo.afastados, tom: 'erro' },
        ]} />
        <div className="acn-rh-acoes">
          {isAdmin && (
            <>
              <Botao variante="primario" icone={mdiPlus} onClick={()=>setModalFunc('new')}>Colaborador</Botao>
              <Botao icone={mdiClipboardTextOutline} onClick={()=>setModalLanc(true)}>Lançar Horas</Botao>
              {podeAutorizar && (
                <Botao icone={mdiPrinterOutline} onClick={()=>setModalAut(true)}>Autorização</Botao>
              )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : (
        <>
          {/* Resumo (KPIs de absenteísmo e horas) no topo, antes das listas */}
          <KpiRH funcionarios={comDesligados} lancamentos={lancamentos} />
          <PainelStatus
            funcionarios={funcionarios}
            onRefresh={fetch}
            onEdit={(f)=>setModalFunc(f)}
            onDesligar={(f)=>setModalDesligar({ func: f, corrigindo: false })}
            currentUser={currentUser}
            onDelete={async (f)=>{
              if (!await confirmar(`Excluir o funcionário "${f.nome}"?\n\nEsta ação irá desativá-lo do sistema.`)) return;
              await supabase.from('rh_funcionarios').update({ ativo: false }).eq('id', f.id);
              logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: f.id, changeType: 'DELETE', oldRow: f, user: currentUser });
              fetch();
            }}
          />
          <PainelDesligados desligados={desligados}
            onCorrigir={(f)=>setModalDesligar({ func: f, corrigindo: true })}
            onReativar={reativar} />
          <BancoHoras funcionarios={comDesligados} lancamentos={lancamentos} currentUser={currentUser} onRefresh={fetch} />
          <RelatoriosRH funcionarios={funcionarios} lancamentos={lancamentos} />
          <RelatorioTecnicos funcionarios={funcionarios} />
          <RelatorioUniformes funcionarios={funcionarios} />
          <ComissoesRH funcionarios={comDesligados} currentUser={currentUser} />
          <ListaAutorizacoes
            funcionarios={comDesligados}
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
          currentUser={currentUser}
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
      {modalDesligar && (
        <ModalDesligar
          func={modalDesligar.func}
          corrigindo={modalDesligar.corrigindo}
          onClose={()=>setModalDesligar(null)}
          onSalvo={()=>{ setModalDesligar(null); fetch(); }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
