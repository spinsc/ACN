// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { logChange, useFieldHighlight, useUnreadMap } from './AuditSystem';
import { combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import { baseOplDe, lerDivisorPorBaseDeLote } from './OpLotes';
import { montarModeloTecnicos, emitirDocumento, dataBR as dataDocBR } from './ComissaoDocumento';
import { calcularComissaoTecnicos, rotuloComissaoTecnicos } from './ComissaoCalculo';
import { tratarFalhaDeArquivoNovo } from './VersaoNova';
import { hojeISO, diaISO, Botao, Selo, Chips, Faixa } from './Interface';
import Icone from './Icone';
import { mdiFilePdfBox, mdiPlus, mdiClipboardTextOutline, mdiPrinterOutline, mdiChevronDown, mdiChevronRight, mdiChevronUp, mdiPencilOutline, mdiTrashCanOutline, mdiAccountGroupOutline, mdiAccountOffOutline, mdiTimerOutline, mdiChartBoxOutline, mdiClose, mdiCheck, mdiInformationOutline, mdiTshirtCrewOutline, mdiFileDocumentOutline, mdiCalendarRange, mdiAccountOutline, mdiAccountWrenchOutline, mdiCashMultiple, mdiMagnify, mdiCheckCircleOutline, mdiClockOutline, mdiAccountMultipleOutline } from '@mdi/js';

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

// Quadros recolhíveis (Etapa 7.16, 01/10/2026): o sistema tem um clique GLOBAL no cabeçalho que alterna a classe `sec-collapsed` do cartão (DashboardTab),
// e estes quadros têm também o estado próprio (`collapsed`). Os dois começavam fora de sincronia (o KPI nasce recolhido, sem a classe): clicar no
// cabeçalho "abria" pelo estado e a classe escondia o corpo ao mesmo tempo. A classe agora segue o estado do quadro, nos dois caminhos (cabeçalho e seta).
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
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
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
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')} data-rh-desligados>
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
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
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
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
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
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
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
  // Etapa 12c3 (01/10/2026): só aparência. Contas, colunas e textos são os de antes. Cada contagem vira o selo da família do tipo de
  // lançamento (a mesma de FAMILIA_LANCAMENTO: Faltas erro, Atestados neutro, Declarações e Saídas Ant. atenção, Entradas Ant. ok) e os
  // valores em hora usam a cor de crédito/débito das outras tabelas do RH.
  const contagem = (n: number, tipo: string) => n > 0 ? <Selo familia={FAMILIA_LANCAMENTO[tipo]} ponto={false}>{n}</Selo> : '—';
  return (
    <div className="acn-rolagem">
      <table className="acn-tabela acn-densa">
        <thead><tr>
          <th>Funcionário</th>
          <th className="acn-centro">Créditos</th>
          <th className="acn-centro">Débitos</th>
          <th className="acn-centro">Saldo</th>
          <th className="acn-centro">Faltas</th>
          <th className="acn-centro">Atestados</th>
          <th className="acn-centro">Declarações</th>
          <th className="acn-centro">Saídas Ant.</th>
          <th className="acn-centro">Entradas Ant.</th>
        </tr></thead>
        <tbody>
          {linhas.map((l,i) => (
            <tr key={i}>
              <td className="acn-forte">{l.nome}</td>
              <td className="acn-centro acn-num acn-txt-ok">{fmtMin(l.credito)}</td>
              <td className="acn-centro acn-num acn-txt-erro">{l.debito>0?fmtMin(-l.debito):'—'}</td>
              <td className={'acn-centro acn-num ' + (l.saldo>=0 ? 'acn-txt-ok' : 'acn-txt-erro')}>{fmtMin(l.saldo)}</td>
              <td className="acn-centro">{contagem(l.faltas, 'Falta')}</td>
              <td className="acn-centro">{contagem(l.atestados, 'Atestado')}</td>
              <td className="acn-centro">{contagem(l.declaracoes, 'Declaração')}</td>
              <td className="acn-centro">{contagem(l.saidasAnt, 'Saída Antecipada')}</td>
              <td className="acn-centro">{contagem(l.entradasAnt, 'Entrada Antecipada')}</td>
            </tr>
          ))}
          {linhas.length > 1 && (
            <tr className="acn-linha-total">
              <td>TOTAL</td>
              <td className="acn-centro acn-num acn-txt-ok">{fmtMin(totais.credito)}</td>
              <td className="acn-centro acn-num acn-txt-erro">{totais.debito>0?fmtMin(-totais.debito):'—'}</td>
              <td className={'acn-centro acn-num ' + (totais.saldo>=0 ? 'acn-txt-ok' : 'acn-txt-erro')}>{fmtMin(totais.saldo)}</td>
              <td className="acn-centro">{totais.faltas||'—'}</td>
              <td className="acn-centro">{totais.atestados||'—'}</td>
              <td className="acn-centro">{totais.declaracoes||'—'}</td>
              <td className="acn-centro">{totais.saidasAnt||'—'}</td>
              <td className="acn-centro">{totais.entradasAnt||'—'}</td>
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

  // Etapa 12c3 (01/10/2026): o quadro vira cartão como os outros do RH (a classe de recolhido segue o estado, como na Etapa 7.16). Só aparência:
  // o filtro, o resumo por tamanho, a lista e o HTML da impressão são os de antes.
  return (
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiTshirtCrewOutline} size={16} /> Relatório de Uniformes</span>
        <div className="acn-cab-filtros" onClick={e=>e.stopPropagation()}>
          <select className="acn-input acn-select-mini" value={tipo} onChange={e=>setTipo(e.target.value)} aria-label="Tipo de colaborador">
            <option value="todos">Todos</option><option value="Funcionário">Funcionários</option><option value="Terceiro">Terceiros</option>
          </select>
          <Botao pequeno icone={mdiPrinterOutline} onClick={imprimir}>Imprimir</Botao>
          <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
            onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
        </div>
      </div>
      {!collapsed && (
        <div className="sec-body">
          {/* resumo no topo: quantos de cada tamanho */}
          <div className="acn-pecas">
            {totais.map(([peca, t]) => (
              <div key={peca} className="acn-peca">
                <strong>{peca}</strong>{' '}
                {t.length ? t.map(([tam, n]) => <span key={tam}>{tam}: <b>{n}</b></span>) : <span className="acn-fraco">—</span>}
              </div>
            ))}
            {semTamanho > 0 && (
              <span className="acn-ajuda atencao">{semTamanho} sem tamanho cadastrado</span>
            )}
          </div>
          <div className="acn-rolagem">
            <table className="acn-tabela">
              <thead><tr><th>Nome</th><th>Cargo</th><th>Camiseta</th><th>Calça</th><th>Sapato</th></tr></thead>
              <tbody>
                {lista.map(f => (
                  <tr key={f.id}>
                    <td className="acn-forte">{f.nome}</td><td>{f.cargo || '—'}</td>
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

  // Etapa 12c3 (01/10/2026): só aparência. As abas viram o seletor em pílulas do sistema, os filtros usam os campos padrão e o "Imprimir" é o
  // botão principal da linha. As validações (funcionário / período) e o que cada impressão gera são os de antes.
  const selectMesAno = () => (
    <div className="acn-cab-filtros">
      <select className="acn-input acn-select-mini" aria-label="Mês" value={mes} onChange={e=>setMes(Number(e.target.value))}>
        {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
      </select>
      <select className="acn-input acn-select-mini" aria-label="Ano" value={ano} onChange={e=>setAno(Number(e.target.value))}>
        {anos.map(y=><option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );

  const selectFuncionario = (label='Funcionário') => (
    <select className="acn-input acn-select-mini" aria-label="Funcionário" value={funcId} onChange={e=>setFuncId(e.target.value)}>
      <option value="">{label}</option>
      {funcionarios.filter(f=>f.ativo).map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
    </select>
  );


  return (
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiFileDocumentOutline} size={16} /> Relatórios de Horas</span>
        <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
          onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
      </div>
      {!collapsed && <div className="sec-body">
        {/* Abas */}
        <div className="acn-rel-abas">
          <Chips ativo={aba} onChange={id=>setAba(id as any)} rotulo="Tipo de relatório" itens={[
            { id:'individual',  rotulo:'Individual',          icone:mdiAccountOutline },
            { id:'parcial',     rotulo:'Parcial por Período', icone:mdiCalendarRange },
            { id:'consolidado', rotulo:'Consolidado',         icone:mdiChartBoxOutline },
          ]} />
        </div>

        {/* ── INDIVIDUAL ── */}
        {aba === 'individual' && (
          <div>
            <div className="acn-rel-filtros">
              {selectFuncionario('Selecione o funcionário...')}
              {selectMesAno()}
              <Botao variante="primario" pequeno icone={mdiPrinterOutline}
                onClick={() => {
                  if (!funcId) { alert('Selecione um funcionário!'); return; }
                  const f = funcionarios.find(f=>f.id===funcId);
                  imprimirRelatorio(
                    `Fechamento Individual — ${f?.nome}`,
                    `${mesNome(mes)}/${ano}`,
                    linhasIndividual
                  );
                }}>
                Imprimir
              </Botao>
            </div>
            <TabelaPreview linhas={linhasIndividual} />
          </div>
        )}

        {/* ── PARCIAL POR PERÍODO ── */}
        {aba === 'parcial' && (
          <div>
            <div className="acn-rel-filtros">
              {selectFuncionario('Todos os funcionários')}
              <div className="acn-cab-filtros">
                <span className="acn-fraco">De</span>
                <input type="date" className="acn-input acn-select-mini" aria-label="Data inicial" value={dtInicio} onChange={e=>setDtInicio(e.target.value)} />
                <span className="acn-fraco">até</span>
                <input type="date" className="acn-input acn-select-mini" aria-label="Data final" value={dtFim} onChange={e=>setDtFim(e.target.value)} />
              </div>
              <Botao variante="primario" pequeno icone={mdiPrinterOutline}
                onClick={() => {
                  if (!dtInicio || !dtFim) { alert('Selecione o período!'); return; }
                  const f = funcId ? funcionarios.find(f=>f.id===funcId) : null;
                  imprimirRelatorio(
                    `Fechamento Parcial${f?` — ${f.nome}`:''}`,
                    `${fmtDate(dtInicio)} a ${fmtDate(dtFim)}`,
                    linhasParcial
                  );
                }}>
                Imprimir
              </Botao>
            </div>
            <TabelaPreview linhas={linhasParcial} />
          </div>
        )}

        {/* ── CONSOLIDADO ── */}
        {aba === 'consolidado' && (
          <div>
            <div className="acn-rel-filtros">
              {selectMesAno()}
              <Botao variante="primario" pequeno icone={mdiPrinterOutline}
                onClick={() => imprimirRelatorio(
                  'Fechamento Consolidado — Todos os Funcionários',
                  `${mesNome(mes)}/${ano}`,
                  linhasConsolidado
                )}>
                Imprimir
              </Botao>
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
  const [erro, setErro] = useState('');
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

      // R13 (resposta do usuário em 01/10/2026): TODAS as OPs, sem o corte de 200 (o relatório mostrava, por exemplo, 119 das 234 da Tatiana). O servidor devolve no máximo 1.000 linhas
      // por consulta, então a leitura é em páginas (.range) até acabar; a ordem leva o id como desempate — sem ele a mesma linha pode cair em duas páginas ou em nenhuma.
      // R14: as OPs sem responsável (nulo, vazio ou só espaços) não ficam mais de fora: entram numa linha "Sem responsável" que pede para informar o responsável (o cadastro não é mexido).
      let opData: any[] = [];
      setErro('');
      try {
        const PAGINA = 1000;
        for (let de = 0; ; de += PAGINA) {
          const { data: opD, error: opErr } = await supabase
            .from('oples')
            .select('id,opl,cliente_nome,status_geral,responsavel_comercial,data_entrada')
            .order('data_entrada', { ascending: false })
            .order('id', { ascending: false })
            .range(de, de + PAGINA - 1);
          if (opErr) throw opErr;
          opData = opData.concat(opD || []);
          if (!opD || opD.length < PAGINA) break;
        }
      } catch (e: any) {
        // sem as OPs o relatório sairia incompleto sem ninguém saber: a leitura que falhou é avisada, e as OPs não aparecem pela metade
        opData = [];
        setErro('Não foi possível ler as OPs' + (e?.message ? ' (' + e.message + ')' : '') + '. Só as OS aparecem no relatório até a leitura funcionar.');
      }

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
      const opsSemResponsavel: any[] = [];
      opData.forEach(op => {
        const entrada = { tipo:'op', id:op.id, numero:op.opl, cliente:op.cliente_nome, status:op.status_geral, inicio:op.data_entrada };
        if (!String(op.responsavel_comercial ?? '').trim()) opsSemResponsavel.push(entrada);
        else addEntry(op.responsavel_comercial, entrada);
      });

      const result = Object.values(mapa).map((tec) => {
        const func = funcionarios.find(f => f.nome.trim().toLowerCase() === tec.nome.toLowerCase());
        return { ...tec, func, totalOS: tec.os.length, totalOP: tec.op.length };
      });
      result.sort((a,b) => (b.totalOS+b.totalOP) - (a.totalOS+a.totalOP));
      // a linha "Sem responsável" vem primeiro: é a que pede ação
      if (opsSemResponsavel.length) result.unshift({ nome: 'Sem responsável', semResp: true, os: [], op: opsSemResponsavel, func: null, totalOS: 0, totalOP: opsSemResponsavel.length });
      setDados(result);
      setLoading(false);
    };
    load();
  }, [funcionarios]);

  // Etapa 7.15 (01/10/2026): oples.data_entrada é do tipo DATE ("2026-09-30"). new Date("2026-09-30") é meia-noite de Londres, que no Brasil
  // ainda é o dia anterior: as 200 OPs do relatório (e o HTML da impressão) mostravam um dia a menos. Texto só com a data: o dia sai direto
  // do texto. Data com hora (as OS têm) continua pelo fuso de quem usa. Mesmo erro já corrigido na Logística (Etapa 7.10).
  const fmtDt = (d) => !d ? '—' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');
  // Etapa 12c3 (01/10/2026): a cor do status da OS vem da família do selo. O jeito de reconhecer o status (pela primeira palavra) é o de antes.
  const FAMILIA_STATUS_OS = { 'Em Execucao':'info', 'Manutencao Concluida':'ok', 'Aguardando Inicio':'atencao' };
  const familiaStatusOS = (s) => { for (const k of Object.keys(FAMILIA_STATUS_OS)) if (s && s.includes(k.split(' ')[0])) return FAMILIA_STATUS_OS[k]; return 'neutro'; };

  const filtrado = dados.filter(t => combinaBusca(t.nome, filtroNome));

  const imprimir = () => {
    const rows = filtrado.map(tec =>
      `<tr style="background:#f0f9ff"><td colspan="5" style="padding:8px 10px;font-weight:700;font-size:12px;border-top:2px solid #bfdbfe">` +
      `${tec.semResp ? 'SEM RESPONSÁVEL — informar o responsável nestas OPs' : tec.nome + ' ' + (tec.func ? '— ' + (tec.func.cargo||'') : '(nao cadastrado)')}` +
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

  // Etapa 12c3 (01/10/2026): o quadro vira cartão como os outros do RH (a classe de recolhido segue o estado, como na Etapa 7.16). Só aparência:
  // a busca, o que cada técnico mostra, as tabelas de OS e de OP e o HTML da impressão são os de antes. Cada cor feita à mão virou o selo da família.
  return (
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiAccountWrenchOutline} size={16} /> Relatório de Técnicos</span>
        <div className="acn-cab-filtros" onClick={e=>e.stopPropagation()}>
          <input className="acn-input acn-input-filtro" value={filtroNome} onChange={e=>setFiltroNome(e.target.value)}
            placeholder="Filtrar por nome..." aria-label="Filtrar técnicos por nome" />
          <Botao pequeno icone={mdiPrinterOutline} onClick={imprimir}>Imprimir</Botao>
          <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
            onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
        </div>
      </div>
      {!collapsed && <div className="sec-body">
        {erro && <Faixa tom="erro">{erro}</Faixa>}
        {loading ? (
          <div className="acn-empty">Carregando...</div>
        ) : filtrado.length === 0 ? (
          <div className="acn-empty">Nenhum técnico designado encontrado.</div>
        ) : filtrado.map(tec => (
          <div key={tec.nome} className="acn-tec">
            <div className={'acn-tec-cab' + (tec.func ? '' : ' sem-cadastro') + (tec.semResp ? ' sem-responsavel' : '') + (expandido===tec.nome ? ' aberto' : '')}
              role="button" aria-expanded={expandido===tec.nome}
              onClick={()=>setExpandido(expandido===tec.nome?null:tec.nome)}>
              <div className="acn-tec-avatar">{tec.semResp ? '!' : tec.nome[0].toUpperCase()}</div>
              <div className="acn-tec-info">
                <div className="acn-forte">{tec.nome}</div>
                {tec.func && (
                  <div className="acn-tec-sub">
                    {tec.func.cargo||'—'} · {tec.func.departamento||'—'}
                    <Selo familia={tec.func.tipo_colaborador==='Terceiro' ? 'atencao' : 'info'} ponto={false}>{tec.func.tipo_colaborador||'Funcionário'}</Selo>
                  </div>
                )}
                {!tec.func && <div className="acn-ajuda atencao">{tec.semResp ? 'Informar o responsável nestas OPs' : 'Nao cadastrado no RH'}</div>}
              </div>
              <div className="acn-tec-contagem">
                {tec.totalOS > 0 && <Selo familia="info" ponto={false}>{tec.totalOS} OS</Selo>}
                {tec.totalOP > 0 && <Selo familia={tec.semResp ? 'atencao' : 'ok'} ponto={false}>{tec.totalOP} OP</Selo>}
                <Icone path={expandido===tec.nome ? mdiChevronUp : mdiChevronDown} size={16} />
              </div>
            </div>
            {expandido === tec.nome && (
              <div className="acn-tec-corpo">
                {tec.semResp && (
                  <Faixa tom="atencao">Estas OPs estão sem responsável comercial. Abra cada OP e informe quem é o responsável; o cadastro de pessoas não foi alterado.</Faixa>
                )}
                {tec.os.length > 0 && (
                  <>
                    <div className="acn-quadro-titulo">Ordens de Serviço</div>
                    <div className="acn-rolagem">
                      <table className="acn-tabela acn-compacta">
                        <thead><tr>
                          <th>OS</th>
                          <th>Cliente / Veículo</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Início</th>
                          <th>Conclusão</th>
                        </tr></thead>
                        <tbody>
                          {tec.os.map((o,i)=>(
                            <tr key={i}>
                              <td className="acn-forte">{o.numero}</td>
                              <td>{o.cliente}{o.veiculo ? ' — '+o.veiculo : ''}</td>
                              <td><Selo familia={o.avaliacao==='Remota' ? 'info' : 'marca'} ponto={false}>{o.avaliacao||'—'}</Selo></td>
                              <td>{o.status ? <Selo familia={familiaStatusOS(o.status)} ponto={false}>{o.status}</Selo> : ''}</td>
                              <td className="acn-num">{fmtDt(o.inicio)}</td>
                              <td className="acn-num">{fmtDt(o.fim)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {tec.op.length > 0 && (
                  <>
                    <div className="acn-quadro-titulo">Ordens de Produção</div>
                    <div className="acn-rolagem">
                      <table className="acn-tabela acn-compacta">
                        <thead><tr>
                          <th>OP</th>
                          <th>Cliente</th>
                          <th>Status</th>
                          <th>Data</th>
                        </tr></thead>
                        <tbody>
                          {tec.op.map((o,i)=>(
                            <tr key={i}>
                              <td className="acn-forte">{o.numero||'—'}</td>
                              <td>{o.cliente||'—'}</td>
                              <td>{o.status||'—'}</td>
                              <td className="acn-num">{fmtDt(o.inicio)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>}
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
  // Documento detalhado (05/10/2026): OP/OS do período SEM técnico apontado (antes sumiam da tela, e parecia que a nota não vinha) e o que foi calculado (para o PDF dizer
  // exatamente o período, a situação e a origem DO CÁLCULO, mesmo que a pessoa mexa nos filtros depois)
  const [semTecnico, setSemTecnico] = useState<any[]>([]);
  const [rotuloCalculo, setRotuloCalculo] = useState<any>(null);
  const [emitindo, setEmitindo] = useState(false);
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

    const r = await calcularComissaoTecnicos({ funcionarios, inicio, fim, modoFatura, filtroOrigem, fechamento: modoPeriodo === 'mes' ? { mes, ano } : null });
    setFechamentos(r.fechamentos);
    setSemTecnico(r.semTecnico);
    setRotuloCalculo({
      periodo: modoPeriodo === 'mes' ? `${mesNome(mes)}/${ano}` : `${dataDocBR(dataDe)} a ${dataDocBR(dataAte)}`,
      ...rotuloComissaoTecnicos({ modoFatura, filtroOrigem }),
    });
    setDados(r.dados);
    setGrupos(r.grupos);
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

  // Documento detalhado em PDF (pedido do usuário em 05/10/2026), do que está calculado na tela
  const emitirDocumentoPdf = async () => {
    setEmitindo(true);
    try {
      const aprovados: Record<string, any> = {};
      fechamentos.filter((f: any) => f.status === 'aprovado').forEach((f: any) => { aprovados[f.tecnico_id] = f; });
      const modelo = montarModeloTecnicos({ ...rotuloCalculo, tecnicos: dados, grupos, semTecnico, aprovados, emitidoPor: currentUser?.nome });
      await emitirDocumento(modelo);
    } catch (e: any) { if (!tratarFalhaDeArquivoNovo(e)) alert('Não foi possível gerar o documento: ' + (e?.message || e)); }
    setEmitindo(false);
  };

  // Etapa 12c4 (01/10/2026): o quadro vira cartão como os outros do RH (a classe de recolhido segue o estado, regra da Etapa 7.16) e as peças pintadas
  // à mão viram as do sistema. Só aparência: o cálculo, o período, os filtros, o "Aprovar" e a gravação são os de antes. O número, o selo de apoio / serralheria /
  // lote e o valor de cada linha continuam saindo do mesmo dado; as cores vêm das famílias (OP verde, OS azul, apoio âmbar, serralheria na cor da marca).
  return (
    <div className={'sec-card' + (collapsed ? ' sec-collapsed' : '')}>
      <div className="sec-hdr no-collapse" onClick={()=>setCollapsed(c=>!c)}>
        <span className="acn-cab-titulo"><Icone path={mdiCashMultiple} size={16} /> Comissões de Técnicos</span>
        <div className="acn-cab-filtros" onClick={e=>e.stopPropagation()}>
          <Chips ativo={abaComissao} onChange={id=>setAbaComissao(id as any)} rotulo="Parte das comissões" itens={[
            { id:'calculo',   rotulo:'Cálculo' },
            { id:'relatorio', rotulo:'Histórico' },
          ]} />
          <Botao pequeno variante="discreto" icone={collapsed ? mdiChevronRight : mdiChevronDown} aria-label={collapsed ? 'Abrir' : 'Recolher'}
            onClick={e=>{e.stopPropagation();setCollapsed(c=>!c);}} />
        </div>
      </div>

      {!collapsed && abaComissao === 'calculo' && (
        <div className="sec-body">
          <div className="acn-com-barra">
            <Chips ativo={modoFatura} onChange={id=>setModoFatura(id as any)} rotulo="Situação da nota fiscal" itens={[
              { id:'faturada',  rotulo:'Faturada',  icone:mdiCheckCircleOutline, titulo:'OPs/OSs com NF emitida dentro do período' },
              { id:'a_faturar', rotulo:'A Faturar', icone:mdiClockOutline,       titulo:'Produção concluída dentro do período, NF ainda não emitida' },
            ]} />
            <Chips ativo={modoPeriodo} onChange={id=>setModoPeriodo(id as any)} rotulo="Tipo de período" itens={[
              { id:'mes',       rotulo:'Mês/Ano' },
              { id:'intervalo', rotulo:'Período (De/Até)' },
            ]} />
            {modoPeriodo === 'mes' ? (
              <>
                <select className="acn-input acn-select-mini" aria-label="Mês" value={mes} onChange={e=>setMes(Number(e.target.value))}>
                  {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
                </select>
                <select className="acn-input acn-select-mini" aria-label="Ano" value={ano} onChange={e=>setAno(Number(e.target.value))}>
                  {anos.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </>
            ) : (
              <>
                <input type="date" className="acn-input acn-select-mini" aria-label="Data inicial" value={dataDe} onChange={e=>setDataDe(e.target.value)} />
                <span className="acn-fraco">até</span>
                <input type="date" className="acn-input acn-select-mini" aria-label="Data final" value={dataAte} onChange={e=>setDataAte(e.target.value)} />
              </>
            )}
            <select className="acn-input acn-select-mini" aria-label="Origem" value={filtroOrigem} onChange={e=>setFiltroOrigem(e.target.value as any)}>
              <option value="todos">Todas as origens</option>
              <option value="adaptacao">Só Adaptação (veículos)</option>
            </select>
            <Botao variante="primario" pequeno icone={mdiMagnify} onClick={calcular} disabled={loading}>
              {loading ? 'Calculando...' : 'Calcular'}
            </Botao>
            <Botao pequeno icone={mdiFilePdfBox} onClick={emitirDocumentoPdf} disabled={emitindo || loading || !rotuloCalculo || (dados.length === 0 && semTecnico.length === 0)}
              title="PDF com cada OP/OS, as datas, a base e a comissão de cada técnico do período calculado">
              {emitindo ? 'Gerando…' : 'Emitir documento (PDF)'}
            </Botao>
          </div>
          <div className="acn-ajuda acn-com-resumo">
            Período: {modoPeriodo==='mes' ? `${mesNome(mes)}/${ano}` : `${dataDe||'—'} até ${dataAte||'—'}`} ·{' '}
            {modoFatura==='faturada'
              ? 'OPs/OSs com NF emitida no período'
              : 'OPs/OSs concluídas no período, NF ainda não emitida'}
            {filtroOrigem==='adaptacao' && <> · só OPs (transformação veicular) + OS de manutenção veicular</>}
            {modoPeriodo==='intervalo' && <> · aprovação de fechamento fica disponível só no modo Mês/Ano</>}
            {modoFatura==='a_faturar' && <> · valores estimados — aprovação de fechamento fica disponível só em Faturada</>}
          </div>

          {grupos.length > 0 && (
            <div className="acn-com-pipeline">
              <div className="acn-quadro-titulo"><Icone path={mdiChartBoxOutline} size={14} /> Pipeline — OP/OS por Técnico, Dupla e Equipe</div>
              <div className="acn-pipeline">
                {grupos.map((g:any) => (
                  <div key={g.chave} className="acn-pipe-card">
                    <Selo familia={g.tipo==='equipe' ? 'marca' : g.tipo==='dupla' ? 'info' : 'neutro'} ponto={false}>
                      <Icone path={g.tipo==='equipe' ? mdiAccountGroupOutline : g.tipo==='dupla' ? mdiAccountMultipleOutline : mdiAccountOutline} size={13} />
                      {g.tipo==='equipe' ? 'Equipe' : g.tipo==='dupla' ? 'Dupla' : 'Individual'}
                    </Selo>
                    <div className="acn-pipe-nome">{g.label}</div>
                    <div className="acn-pipe-qtd">{g.qtdTotal} <span>OP/OS</span></div>
                    <div className="acn-pipe-apoio">
                      {g.qtdComApoio>0 && <span className="acn-txt-atencao">{g.qtdComApoio} c/ apoio</span>}
                      {g.qtdComApoio>0 && g.qtdSemApoio>0 && ' · '}
                      {g.qtdSemApoio>0 && <span>{g.qtdSemApoio} sem apoio</span>}
                    </div>
                    <div className="acn-txt-ok">{fmtMoeda(g.totalComissao)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {semTecnico.length > 0 && (
            <Faixa tom="atencao">
              <strong>{semTecnico.length} OP/OS com faturamento no período SEM técnico apontado (não geram comissão de produção):</strong>{' '}
              {semTecnico.slice(0, 12).map((i: any) => i.numero).join(', ')}{semTecnico.length > 12 ? ` e mais ${semTecnico.length - 12}` : ''}.
              {' '}Aponte quem trabalhou em "Equipe" da OP/OS (Produção) e calcule de novo.
            </Faixa>
          )}

          {dados.length === 0 && !loading && (
            <div className="acn-empty">Clique em Calcular para carregar as comissões do período.</div>
          )}
          {dados.map(tec => {
            const aprov = jaAprovado(tec.tecnicoId);
            const allItems = [...tec.ops, ...tec.oss];
            return (
              <div key={tec.tecnicoId} className={'acn-com-tec' + (aprov ? ' aprovado' : '')}>
                {/* Cabeçalho técnico */}
                <div className="acn-com-cab">
                  <div className="acn-com-id">
                    <div className="acn-forte">{tec.tecnicoNome}</div>
                    <div className="acn-ajuda">
                      Incide em: <strong>{tec.incideEm}</strong> ·
                      Percentual: <strong className="acn-txt-info">{tec.percentual}%</strong> ·
                      {tec.ops.length > 0 && <> {tec.ops.length} OP</>}
                      {tec.oss.length > 0 && <> · {tec.oss.length} OS</>}
                    </div>
                  </div>
                  <div className="acn-com-valores">
                    <div>Base: <strong>{fmtMoeda(tec.totalBase)}</strong></div>
                    <div className={'acn-com-total' + (aprov ? ' ok' : '')}>
                      Comissão: {fmtMoeda(tec.totalComissao)}
                    </div>
                    {aprov && <div className="acn-aprovado"><Icone path={mdiCheckCircleOutline} size={13} /> Aprovado por {aprov.aprovado_por}</div>}
                  </div>
                  {podeAutorizar && !aprov && modoPeriodo === 'mes' && modoFatura === 'faturada' && (
                    <Botao variante="primario" pequeno icone={mdiCheck} onClick={()=>aprovar(tec)} disabled={aprovando===tec.tecnicoId}>
                      {aprovando===tec.tecnicoId ? '...' : 'Aprovar'}
                    </Botao>
                  )}
                </div>
                {/* Lista de itens */}
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-compacta">
                    <thead><tr>
                      <th>Tipo</th>
                      <th>Nº</th>
                      <th>Cliente</th>
                      <th className="acn-dir">Valor Total</th>
                      <th className="acn-dir">Mão de Obra</th>
                      <th className="acn-dir">Base Cálculo</th>
                      <th className="acn-dir">Comissão</th>
                      <th className="acn-centro">{modoFatura==='faturada' ? 'Fat.' : 'Concl.'}</th>
                    </tr></thead>
                    <tbody>
                      {allItems.map((item: any, i: number) => {
                        const mdo = item.papel==='serralheria' ? item.valor_mao_de_obra_serralheria : item.valor_mao_de_obra;
                        return (
                          <tr key={i}>
                            <td>
                              <Selo familia={item.tipo==='OP' ? 'ok' : 'info'} ponto={false}>{item.tipo}</Selo>
                              {item.papel==='apoio' && <Selo familia="atencao" ponto={false}>APOIO</Selo>}
                              {item.papel==='serralheria' && <Selo familia="marca" ponto={false}>SERRALHERIA</Selo>}
                            </td>
                            <td className="acn-forte">
                              {item.numero||'—'}
                              {item.qtdVeiculosLote > 1 && (
                                <Selo familia="neutro" ponto={false} title={`Lote de ${item.qtdVeiculosLote} veículos — valor unitário (total do lote ÷ ${item.qtdVeiculosLote})`}>
                                  lote/{item.qtdVeiculosLote}
                                </Selo>
                              )}
                            </td>
                            <td className="acn-texto-longo">{item.cliente||'—'}</td>
                            <td className="acn-dir acn-num">{item.valor_total != null ? fmtMoeda(item.valor_total) : '—'}</td>
                            <td className="acn-dir acn-num">{mdo != null ? fmtMoeda(mdo) : '—'}</td>
                            <td className="acn-dir acn-num acn-forte">{fmtMoeda(item.base)}</td>
                            <td className="acn-dir acn-num acn-txt-info">
                              {fmtMoeda(item.papel==='apoio' ? item.base * 0.001 : item.base * tec.percentual / 100)}
                            </td>
                            <td className="acn-centro acn-num">{fmtDt(item.data_faturamento)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && abaComissao === 'relatorio' && <div className="sec-body"><HistoricoComissoes funcionarios={funcionarios} /></div>}
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
  // Etapa 7.26 (R20, 01/10/2026): a mensagem "Nenhum fechamento encontrado para o período." aparecia ao abrir, antes de a pessoa buscar. Agora só depois do Buscar; antes, a tela pede o período.
  // Trocar o mês ou o ano volta a "ainda não busquei" (a mensagem de uma busca vazia era do período ANTERIOR); a tabela de uma busca com resultado continua na tela, como sempre.
  const [buscou, setBuscou] = useState(false);
  const meses = [1,2,3,4,5,6,7,8,9,10,11,12];
  const anos = [hoje.getFullYear()-1, hoje.getFullYear(), hoje.getFullYear()+1];
  const fmtMoeda = (v: number) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const fmtDt = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  const buscar = async () => {
    setLoading(true);
    const { data } = await supabase.from('rh_comissoes_fechamento').select('*').eq('mes', mes).eq('ano', ano).order('tecnico_nome');
    setDados(data || []);
    setBuscou(true);
    setLoading(false);
  };

  // Etapa 12c4 (01/10/2026): só aparência (o espaçamento de dentro vem do quadro que o contém). A busca e as colunas são as de antes.
  return (
    <div>
      <div className="acn-com-barra">
        <select className="acn-input acn-select-mini" aria-label="Mês" value={mes} onChange={e=>{ setMes(Number(e.target.value)); setBuscou(false); }}>
          {meses.map(m=><option key={m} value={m}>{mesNome(m)}</option>)}
        </select>
        <select className="acn-input acn-select-mini" aria-label="Ano" value={ano} onChange={e=>{ setAno(Number(e.target.value)); setBuscou(false); }}>
          {anos.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <Botao pequeno icone={mdiMagnify} onClick={buscar} disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </Botao>
      </div>
      {dados.length === 0 && !loading && (buscou
        ? <div className="acn-empty">Nenhum fechamento encontrado para o período.</div>
        : <div className="acn-empty">Escolha o mês e o ano e clique em Buscar.</div>)}
      {dados.length > 0 && (
        <div className="acn-rolagem">
          <table className="acn-tabela">
            <thead><tr>
              <th>Técnico</th>
              <th className="acn-centro">Incide em</th>
              <th className="acn-centro">%</th>
              <th className="acn-dir">OPs</th>
              <th className="acn-dir">OSs</th>
              <th className="acn-dir">Base</th>
              <th className="acn-dir">Comissão</th>
              <th className="acn-centro">Status</th>
              <th>Aprovado por</th>
              <th>Data</th>
            </tr></thead>
            <tbody>
              {dados.map((d:any) => (
                <tr key={d.id}>
                  <td className="acn-forte">{d.tecnico_nome}</td>
                  <td className="acn-centro">{d.incide_em}</td>
                  <td className="acn-centro acn-num">{d.percentual}%</td>
                  <td className="acn-dir acn-num">{d.qtd_ops}</td>
                  <td className="acn-dir acn-num">{d.qtd_oss}</td>
                  <td className="acn-dir acn-num">{fmtMoeda(d.total_base)}</td>
                  <td className="acn-dir acn-num acn-txt-ok">{fmtMoeda(d.total_comissao)}</td>
                  <td className="acn-centro">
                    <Selo familia={d.status==='aprovado' ? 'ok' : 'atencao'} ponto={false}>{d.status==='aprovado' ? 'Aprovado' : 'Pendente'}</Selo>
                  </td>
                  <td>{d.aprovado_por||'—'}</td>
                  <td className="acn-num">{fmtDt(d.aprovado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
