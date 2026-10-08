// @ts-nocheck
import { supabase } from './supabaseClient';
import { ColaboradorSelect, useColaboradores } from './ColaboradorSelect';
import { EquipeDaOpModal, inserirResponsaveisSemRepetir } from './EquipeDaOp';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, VeiculoOuEnvio, VeiculoCompacto } from './AcnTabShared';
import { ModalAnexos, useContagemAnexos } from './OplAnexosWidget';
import AnaliseWidget from './AnaliseWidget';
import OplAcompModal from './OplAcompModal';
import { notificarEvento, msg } from './whatsappHelper';
import Linkify from './Linkify';
import { horasUteis } from './utils/horasUteis';
import { combinaBusca } from './SearchUtils';
import { FLUXOS, filaDe, fluxoLabel, temSerralheria, motivoSerralheria, SERRALHERIA_STATUS,
         serralheriaSegueParaAdaptacao, filaDaOp } from './FluxoEntrega';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import ProducaoKanban from './ProducaoKanban';
import { useTempoUtil, BotaoPausar, BadgeForaExpediente, pausarOpl, retomarOpl } from './PausaWidget';
import { logChange, useUnreadMap } from './AuditSystem';
import { confirmar, pedirTexto } from './Feedback';
import { ParticipantesPicker, novosParticipantes, notificarParticipantes } from './Participantes';
import Icone from './Icone';
import { carregarPendencias } from './OpPendencias';
import { CabecalhoTela, Abas, Chips, Botao, MenuAcoes, Faixa, Selo, Tag, rotuloStatus, diasAtraso } from './Interface';
import { mdiTableLarge, mdiViewColumnOutline, mdiCameraOutline, mdiFilterVariant, mdiPlay, mdiTicketPercentOutline, mdiCarWrench,
  mdiCogOutline, mdiTagOutline, mdiCalendarMonthOutline, mdiAccountMultipleOutline, mdiPencilOutline, mdiArrowULeftTop, mdiEyeOutline,
  mdiMessageTextOutline, mdiPause, mdiCheck, mdiChevronDown, mdiChevronUp, mdiTrayArrowDown, mdiHammerWrench, mdiClose,
  mdiAccountGroupOutline, mdiCheckAll, mdiAccount, mdiPaperclip,
  mdiRefresh, mdiCar, mdiCalendarOutline, mdiClipboardListOutline, mdiSendOutline, mdiContentSaveOutline, mdiAlertOutline,
  mdiTrashCanOutline, mdiPlus, mdiTimerOutline, mdiCommentTextOutline, mdiWrench, mdiWeatherSunny, mdiWeatherSunsetDown,
  mdiBellOutline, mdiChevronLeft, mdiChevronRight, mdiFormatListBulleted, mdiPrinterOutline, mdiCrownOutline, mdiCheckboxMarkedOutline,
  mdiLinkVariant, mdiPackageVariantClosed, mdiFolderOutline } from '@mdi/js';


const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
const semDado = (v) => !v || !String(v).trim();
const MODOS_EXECUCAO = [
  { id: 'individual', rotulo: 'Individual', icone: mdiAccount },
  { id: 'dupla',      rotulo: 'Dupla',      icone: mdiAccountMultipleOutline },
  { id: 'equipe',     rotulo: 'Equipe',     icone: mdiTagOutline },
];

// Recados prontos da produção. São as respostas que o vendedor precisa dar ao
// cliente — "e a minha adaptação?" — escritas de um jeito que possa ser
// repassado sem tradução. Um clique registra no histórico da OP e notifica
// quem abriu, a engenharia, quem vendeu e os administradores.
const RECADOS_PRODUCAO = [
  'Em execução, dentro do prazo.',
  'Aguardando peça/material para continuar.',
  'Em acabamento — entrando na reta final.',
  'Serralheria em execução.',
  'Aguardando o veículo chegar.',
  'Atrasado — vou detalhar o motivo em seguida.',
];

// Statuses ativos do fluxo de OS de manutenção veicular (pós-reformulação
// 169d90d, 2026-08-21) — usado tanto pelo Calendário quanto pelo Painel SAC
// Veicular para não divergir quando o fluxo mudar de novo.
const STATUSES_VEICULAR_ATIVAS = ['Em Provisionamento','Aguardando Aceite SAC','Provisionada','Aguardando Início','Verificação e Orçamento','Aguardando Aprovação Cliente','Em Manutenção','Em Execução'];

function OplRow({ o, onAction, currentUser, selecionado, onToggleSelecionar, naoLido, onSerralheria }) {
  const emProd       = o.status_geral === 'Em Producao';
  const aguardando   = o.status_geral === 'Aguardando Inicio Producao';
  const retrabalho   = o.status_geral === 'Retrabalho';
  const emRetrab     = o.status_geral === 'Em Retrabalho';

  // Cronômetro em horas úteis (Seg-Sex 8h-17:45) -- já desconta pausa manual
  // (o.pausado/data_pausa/tempo_pausado_horas) e some fora do expediente sem
  // precisar de nenhum código especial (horasUteis não soma essas horas).
  const timerProd   = useTempoUtil(emProd   ? o.data_inicio_producao   : null, o.pausado, o.data_pausa, o.tempo_pausado_horas).texto;
  const timerRetrab = useTempoUtil(emRetrab ? o.data_inicio_retrabalho : null, o.pausado, o.data_pausa, o.tempo_pausado_horas).texto;
  const timer = emProd ? timerProd : emRetrab ? timerRetrab : null;
  const [qtdAnexos, recarregarAnexos] = useContagemAnexos(o.id);
  const [anexosAberto, setAnexosAberto] = useState(false);

  // Linha com filete: vermelho = retrabalho, roxo = autorização de marketing,
  // amarelo = alteração que este usuário ainda não viu (ver AuditSystem.tsx)
  const classeLinha = retrabalho || emRetrab ? 'acn-linha-alerta'
    : o.liberado_divulgacao ? 'acn-linha-marca'
    : naoLido ? 'acn-linha-nova' : '';
  const atraso = diasAtraso(o.data_prevista_entrega);
  const qtd = o.quantidade || 1;

  const responsavel = o.modo_execucao === 'equipe'
    ? (o.equipe_nome ? <div className="acn-duas"><span>{o.equipe_nome}</span><small>Equipe</small></div> : null)
    : o.modo_execucao === 'dupla'
    ? (o.responsavel_producao ? <div className="acn-duas"><span>{o.responsavel_producao}</span>{o.tecnico_producao_2_nome && <small>+ {o.tecnico_producao_2_nome}</small>}</div> : null)
    : o.responsavel_producao || null;

  const acaoPrincipal =
    aguardando ? <Botao pequeno variante="primario" icone={mdiPlay} onClick={()=>onAction('iniciar',o)} title="Inicia agora com você como responsável">Iniciar</Botao>
    : retrabalho ? <Botao pequeno variante="primario" icone={mdiPlay} onClick={()=>onAction('iniciar_retrabalho',o)}>Iniciar retrabalho</Botao>
    : (emProd || emRetrab) && o.pausado ? <Botao pequeno variante="secundario" icone={mdiPlay} onClick={()=>onAction('retomar',o)}>Retomar</Botao>
    : emProd ? <Botao pequeno variante="secundario" icone={mdiCheck} onClick={()=>onAction('checklist',o)}>Concluir</Botao>
    : emRetrab ? <Botao pequeno variante="secundario" icone={mdiCheck} onClick={()=>onAction('concluir_retrabalho',o)}>Concluir → CQ</Botao>
    : null;

  const serralheriaAtual = o.serralheria_status || 'Pendente';
  const menu = [
    { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => onAction('ver', o) },
    { rotulo: 'Acompanhamento', icone: mdiMessageTextOutline, onClick: () => onAction('acomp', o) },
    { rotulo: qtdAnexos ? `Anexos (${qtdAnexos})` : 'Anexos', icone: mdiPaperclip, onClick: () => setAnexosAberto(true) },
    { rotulo: 'Iniciar em dupla ou equipe', icone: mdiAccountGroupOutline, onClick: () => onAction('iniciar_opcoes', o), oculto: !aguardando },
    { rotulo: 'Pausar', icone: mdiPause, onClick: () => onAction('pausar', o), oculto: !((emProd || emRetrab) && !o.pausado) },
    { rotulo: 'Concluir', icone: mdiCheck, onClick: () => onAction('checklist', o), oculto: !(emProd && o.pausado) },
    { rotulo: 'Concluir → CQ', icone: mdiCheck, onClick: () => onAction('concluir_retrabalho', o), oculto: !(emRetrab && o.pausado) },
    { rotulo: 'Editar responsável', icone: mdiPencilOutline, onClick: () => onAction('editar_resp', o), oculto: !(emProd || emRetrab) },
    { rotulo: 'Equipe', icone: mdiAccountMultipleOutline, onClick: () => onAction('gerenciar_equipe', o), oculto: !(emProd || emRetrab) },
    ...(temSerralheria(o) && onSerralheria
      ? SERRALHERIA_STATUS.filter(st => st !== serralheriaAtual).map(st => ({
          rotulo: `Serralheria: ${rotuloStatus(st)}`, icone: mdiHammerWrench, onClick: () => onSerralheria(o, st), titulo: `Marcar serralheria como ${st}`,
        }))
      : []),
    { rotulo: 'Devolver ao PCP', icone: mdiArrowULeftTop, onClick: () => onAction('devolver', o), perigo: true, oculto: !emProd },
  ];

  return (
    <>
      <tr className={classeLinha}>
        {onToggleSelecionar && (
          <td className="acn-centro">
            <input type="checkbox" checked={!!selecionado} onChange={()=>onToggleSelecionar(o.id)} aria-label={`Selecionar ${o.opl}`} />
          </td>
        )}
        <td>
          <div className="acn-duas">
            <span className={(String(o.opl || '').length <= 14 ? 'acn-mono ' : '') + 'acn-forte acn-prod-opl'}>
              <LinkOpl opl={o} currentUser={currentUser} color="var(--acn-brand-ink)" />
            </span>
            {qtd > 1 && <small>{qtd} unidades</small>}
            {qtdAnexos > 0 && <small>{qtdAnexos} anexo{qtdAnexos !== 1 ? 's' : ''}</small>}
            {o.liberado_divulgacao && !retrabalho && !emRetrab && <small data-acn-familia="marca" className="acn-prod-mkt">Autorização de marketing</small>}
            {/* Andamento da serralheria — visível em qualquer fila, porque numa
                adaptação ela é etapa e quem acompanha precisa ver ali mesmo. */}
            {temSerralheria(o) && <span className="acn-eng-selo-linha"><Tag title={motivoSerralheria(o)}>Serralheria · {rotuloStatus(serralheriaAtual)}</Tag></span>}
          </div>
        </td>
        <td className="acn-prod-veic">
          <VeiculoCompacto o={o}>
            <small title={[o.cliente_nome, o.tipo_projeto].filter(Boolean).join(' · ')} className="acn-prod-cli">
              {o.cliente_nome || 'Sem cliente'}{o.tipo_projeto ? ` · ${o.tipo_projeto}` : ''}
            </small>
          </VeiculoCompacto>
        </td>
        <td className="acn-num acn-prod-nowrap">
          {!o.data_prevista_entrega ? <span className="acn-fraco">Sem data</span>
            : isNaN(new Date(o.data_prevista_entrega+'T00:00:00').getTime()) ? <span className="acn-fraco" title={String(o.data_prevista_entrega)}>Data inválida</span>
            : <span className={atraso > 0 ? 'acn-txt-erro' : undefined} title={atraso > 0 ? `${atraso} dia(s) após a entrega prevista` : undefined}>
                {new Date(o.data_prevista_entrega+'T00:00:00').toLocaleDateString('pt-BR')}{atraso > 0 ? ` · ${atraso} d` : ''}
              </span>}
        </td>
        <td className="acn-prod-resp">{responsavel || <span className="acn-fraco">Sem responsável</span>}</td>
        <td>
          <div className="acn-duas acn-prod-duas-ini">
            <Selo status={o.status_geral} />
            {timer && (
              <small className={'acn-mono acn-prod-nowrap' + (o.pausado ? ' acn-txt-atencao' : '')}>
                {o.pausado ? 'Pausado · ' : ''}{timer}
              </small>
            )}
            {timer && <BadgeForaExpediente />}
          </div>
        </td>
        <td>
          <div className="acn-acoes-linha">
            {acaoPrincipal}
            <MenuAcoes itens={menu} />
          </div>
          {anexosAberto && (
            <ModalAnexos opl={o} setor="Producao" currentUser={currentUser} tipo={null}
              onClose={() => { setAnexosAberto(false); recarregarAnexos(); }} />
          )}
        </td>
      </tr>
      {/* Linha extra: motivo da reprovação CQ */}
      {(retrabalho || emRetrab) && o.obs_reprovacao_cq && (
        <tr className="acn-linha-alerta">
          <td colSpan={onToggleSelecionar ? 7 : 6} className="acn-prod-faixa-cel">
            <Faixa tom="erro" acao={o.tempo_retrabalho_horas ? <span className="acn-num acn-prod-nowrap acn-prod-pequeno">Retrabalho anterior: {Number(o.tempo_retrabalho_horas).toFixed(1)} h</span> : null}>
              <b>Motivo da reprovação no CQ</b> · Auditor: {o.cq_auditor || '—'}
              <div className="acn-eng-selo-linha">{o.obs_reprovacao_cq}</div>
            </Faixa>
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO DE MANUTENÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function CalendarioManutencao({ currentUser }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [agendamentos, setAgendamentos] = useState([]);
  const [aguardando, setAguardando] = useState([]);
  const [modalAgendar, setModalAgendar] = useState(null);
  const [formAg, setFormAg] = useState<any>({ data:'', periodo:'Manhã', obs:'', participantes: [] });   // participantes: pedido do usuário em 07/10/2026
  const [salvando, setSalvando] = useState(false);
  const [vistaLista, setVistaLista] = useState(false);
  const [sacOrdens, setSacOrdens]   = useState([]);

  // Etapa 7.56 (06/10/2026): leitura que falha não pode parecer "Nenhum agendamento" nem sumir com o painel de OPs aguardando
  // (a lista que já estava na tela fica); e um clique duplo em agendar/cancelar gravava duas vezes — uma ação por tipo (e agendamento).
  const [erroLeitura, setErroLeitura] = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const load = async () => {
    const [agRes, aguRes, sacRes] = await Promise.all([
      supabase.from('agendamentos_manutencao').select('*').order('data_agendamento', { ascending: true }),
      supabase.from('oples').select('id,opl,chassi,cliente_nome,modelo,data_prevista_entrega,fluxo_entrega,quantidade,tipo_projeto')
        .in('status_geral', ['Aguardando Agendamento Manutenção','Manutenção Agendada'])
        .order('data_entrada', { ascending: false }),
      supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome,veiculo_modelo,numero_serie,data_provisionamento,periodo_provisionamento,status')
        .eq('is_manutencao_veicular', true)
        .in('status', STATUSES_VEICULAR_ATIVAS)
        .not('data_provisionamento', 'is', null),
    ]);
    const erroLer = agRes.error || aguRes.error || sacRes.error;
    setErroLeitura(erroLer ? erroLer.message : '');
    if (!agRes.error) setAgendamentos(agRes.data || []);
    if (!aguRes.error) setAguardando(aguRes.data || []);
    if (sacRes.error) console.error('Erro ao carregar OS veicular no calendário:', sacRes.error);
    else setSacOrdens(sacRes.data || []);
  };
  useEffect(() => { load(); }, []);

  const confirmarAgendamento = umaVez('agendar', async () => {
    if (!formAg.data) { alert('Selecione uma data.'); return; }
    setSalvando(true);
    const opl = modalAgendar;
    const { data: criado, error: errAg } = await supabase.from('agendamentos_manutencao').insert([{
      opl_id: opl.id, numero_opl: opl.opl, chassi: opl.chassi,
      cliente_nome: opl.cliente_nome, modelo: opl.modelo,
      data_agendamento: formAg.data, periodo: formAg.periodo,
      observacoes: formAg.obs, agendado_por: currentUser?.nome, participantes: formAg.participantes || [],
    }]).select('id');
    if (errAg) { alert('Erro ao agendar: ' + errAg.message); setSalvando(false); return; }
    const { error: errOpl } = await supabase.from('oples').update({
      status_geral: 'Manutenção Agendada',
      data_agendamento_manutencao: formAg.data,
      periodo_agendamento: formAg.periodo,
    }).eq('id', opl.id);
    if (errOpl) {
      // 7.56: o agendamento já estava gravado e a OP seguia "Aguardando agendamento" — desfaz o agendamento para tentar de novo sem duplicar.
      const idAg = criado?.[0]?.id;
      let desfez = false;
      if (idAg) { const { error: errDes } = await supabase.from('agendamentos_manutencao').delete().eq('id', idAg); desfez = !errDes; }
      alert(`Não foi possível agendar a OP ${opl.opl}: ${errOpl.message}` + (desfez ? '' : '\n\nO agendamento chegou a ser gravado e não pôde ser desfeito: confira o calendário e cancele-o se aparecer.'));
      setSalvando(false);
      load();
      return;
    }
    const { error: errLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Manutenção agendada para ${new Date(formAg.data+'T00:00:00').toLocaleDateString('pt-BR')} (${formAg.periodo})`,
      status_anterior: 'Aguardando Agendamento Manutenção', status_novo: 'Manutenção Agendada',
      usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    if (errLog) alert('A manutenção foi agendada, mas o histórico de movimentação não foi gravado: ' + errLog.message);
    const falhasAviso = await notificarParticipantes({ novos: novosParticipantes([], formAg.participantes || []), autor: currentUser, contexto: 'agendamento_manutencao', contextoId: String(criado?.[0]?.id || ''),
      descricao: 'Manutenção agendada: OP ' + opl.opl, abaDestino: 'calendario', trecho: 'Você foi adicionado ao agendamento da manutenção da OP ' + opl.opl + ' em ' + new Date(formAg.data + 'T00:00:00').toLocaleDateString('pt-BR') + ' (' + formAg.periodo + ')' });
    if (falhasAviso.length) alert('O agendamento foi gravado, mas não foi possível avisar: ' + falhasAviso.join('; '));
    setModalAgendar(null); setFormAg({ data:'', periodo:'Manhã', obs:'', participantes: [] }); setSalvando(false);
    load();
  });

  const cancelarAgendamento = (ag) => umaVez('cancelar-' + ag.id, async () => {
    if (!await confirmar(`Cancelar agendamento de ${ag.numero_opl}?`)) return;
    const { error: errDel } = await supabase.from('agendamentos_manutencao').delete().eq('id', ag.id);
    if (errDel) { alert(`Não foi possível cancelar o agendamento de ${ag.numero_opl}: ${errDel.message}`); return; }   // 7.56
    const { error: errOpl } = await supabase.from('oples').update({ status_geral: 'Aguardando Agendamento Manutenção' }).eq('id', ag.opl_id);
    if (errOpl) alert(`O agendamento foi cancelado, mas a OP ${ag.numero_opl} não voltou para "Aguardando agendamento": ${errOpl.message}`);
    load();
  })();

  // ── Calendário ──
  const primeiroDia = new Date(ano, mes, 1).getDay(); // 0=Dom
  const diasNoMes   = new Date(ano, mes+1, 0).getDate();
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DIAS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const allEntries = [
    ...agendamentos.map(ag => ({ ...ag, _tipo: 'opl', _data: ag.data_agendamento, _periodo: ag.periodo, _label: ag.numero_opl })),
    ...sacOrdens.map(os => ({ id: os.id, _tipo: 'sac', _data: os.data_provisionamento, _periodo: os.periodo_provisionamento||'Manhã', _label: os.numero_os, numero_opl: os.numero_os, chassi: os.numero_serie||'—', cliente_nome: os.cliente_nome, modelo: os.veiculo_modelo, status: os.status })),
  ];

  const agDoMes = allEntries.filter(ag => {
    if (!ag._data) return false;
    const dt = new Date(ag._data+'T00:00:00');
    return dt.getMonth()===mes && dt.getFullYear()===ano;
  });

  const agPorDia = (d) => agDoMes.filter(ag => new Date(ag._data+'T00:00:00').getDate()===d);

  const imprimirLista = () => {
    const rows = agendamentos.map(ag => `<tr>
      <td>${new Date(ag.data_agendamento+'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td>${ag.periodo}</td>
      <td><strong>${ag.numero_opl||'—'}</strong></td>
      <td>${ag.chassi||'—'}</td>
      <td>${ag.cliente_nome||'—'}</td>
      <td>${ag.modelo||'—'}</td>
      <td>${ag.observacoes||'—'}</td>
      <td>${ag.agendado_por||'—'}</td>
    </tr>`).join('');
    const html = `<html><head><title>Agendamentos Manutenção</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:24px}h2{color:#1a3a52;border-bottom:2px solid #1a3a52;padding-bottom:6px}
    table{width:100%;border-collapse:collapse}th{background:#1a3a52;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
    td{padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:10px}.footer{margin-top:20px;font-size:9px;color:#9ca3af}
    @media print{button{display:none}}</style></head>
    <body><h2>Agendamentos de Manutenção</h2>
    <table><thead><tr><th>Data</th><th>Período</th><th>OP</th><th>Chassi</th><th>Cliente</th><th>Modelo</th><th>Obs.</th><th>Agendado por</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
    <script>window.onload=()=>window.print();</script></body></html>`;
    const w = window.open('','_blank','width=1000,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const aguardandoNovos = aguardando.filter(o=>o.status_geral==='Aguardando Agendamento Manutenção'||!o.status_geral?.includes('Agendada'));

  return (
    <div>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>
          Não foi possível ler os agendamentos ({erroLeitura}). Isso não quer dizer que não haja agendamento nem OP aguardando{(agendamentos.length || aguardando.length) ? '; o que está na tela é da última leitura que deu certo' : ''}.
        </Faixa>
      )}
      {/* PAINEL: OPLs aguardando agendamento */}
      {aguardandoNovos.length > 0 && (
        <div className="acn-quadro tom-atencao">
          <div className="acn-quadro-titulo acn-prod-ic">
            <Icone path={mdiBellOutline} size={14} /> {aguardandoNovos.length} OP(s) de Manutenção aguardando agendamento
          </div>
          <div className="acn-prod-ag-lista">
            {aguardandoNovos.map(o=>(
              <div key={o.id} className="acn-prod-ag-item">
                <div className="acn-prod-ag-info">
                  <LinkOpl opl={o} currentUser={currentUser} />
                  <span className="acn-fraco">·</span>
                  {o.cliente_nome||'—'}
                  <span className="acn-fraco">·</span>
                  {semDado(o.modelo) ? <span className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> sem modelo</span> : o.modelo}
                  <span className="acn-fraco">·</span>
                  {semDado(o.chassi) ? <span className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> sem chassi</span> : <span className="acn-prod-ic"><Icone path={mdiWrench} size={12} /> {o.chassi}</span>}
                </div>
                <Botao variante="primario" icone={mdiCalendarOutline}
                  onClick={()=>{ setModalAgendar(o); setFormAg({ data:'', periodo:'Manhã', obs:'', participantes: [] }); }}>AGENDAR</Botao>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CALENDÁRIO */}
      <div className="sec-card">
        {/* Cabeçalho calendário */}
        <div className="sec-hdr">
          <div className="acn-prod-cal-nav">
            <Botao pequeno variante="discreto" icone={mdiChevronLeft} aria-label="Mês anterior" onClick={()=>{ if(mes===0){setMes(11);setAno(a=>a-1);}else setMes(m=>m-1); }} />
            <strong>{MESES[mes]} {ano}</strong>
            <Botao pequeno variante="discreto" icone={mdiChevronRight} aria-label="Mês seguinte" onClick={()=>{ if(mes===11){setMes(0);setAno(a=>a+1);}else setMes(m=>m+1); }} />
          </div>
          <div className="acn-acoes-linha">
            <Botao pequeno icone={vistaLista ? mdiCalendarMonthOutline : mdiFormatListBulleted} onClick={()=>setVistaLista(!vistaLista)}>
              {vistaLista?'Calendário':'Lista'}
            </Botao>
            <Botao pequeno icone={mdiPrinterOutline} onClick={imprimirLista}>Imprimir</Botao>
          </div>
        </div>

        {!vistaLista ? (
          /* VISTA CALENDÁRIO */
          <div className="sec-body">
            {/* Dias da semana */}
            <div className="acn-prod-cal-grade acn-prod-cal-semana">
              {DIAS.map(d=>(
                <div key={d}>{d}</div>
              ))}
            </div>
            {/* Grid de dias */}
            <div className="acn-prod-cal-grade">
              {/* células vazias antes do primeiro dia */}
              {Array.from({length:primeiroDia}).map((_,i)=>(
                <div key={'e'+i} className="acn-prod-cal-vazio"></div>
              ))}
              {/* dias do mês */}
              {Array.from({length:diasNoMes},(_,i)=>i+1).map(d=>{
                const ags = agPorDia(d);
                const isHoje = d===hoje.getDate()&&mes===hoje.getMonth()&&ano===hoje.getFullYear();
                return (
                  <div key={d} className={'acn-prod-cal-dia' + (isHoje ? ' hoje' : '')}>
                    <div className="acn-prod-cal-num">{d}</div>
                    {ags.map((ag,i)=>{
                      const isSac = ag._tipo==='sac';
                      const manha = ag._periodo==='Manhã';
                      return (
                        <div key={ag.id+(ag._tipo||'')} title={ag._label+' · '+ag.chassi+' · '+ag.cliente_nome+(isSac?' [SAC '+ag.status+']':'')}
                          className={'acn-prod-cal-chip' + (isSac ? '' : ' clicavel')}
                          data-acn-familia={isSac ? (manha ? 'ok' : 'marca') : (manha ? 'info' : 'atencao')}
                          onClick={()=>{ if(!isSac) cancelarAgendamento(ag); }}>
                          <Icone path={isSac ? mdiWrench : mdiPackageVariantClosed} size={11} /> {ag._label}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="acn-prod-cal-legenda acn-ajuda">
              <span className="acn-prod-cal-chip" data-acn-familia="info"><Icone path={mdiPackageVariantClosed} size={11} /> OP Manhã</span>
              <span className="acn-prod-cal-chip" data-acn-familia="atencao"><Icone path={mdiPackageVariantClosed} size={11} /> OP Tarde</span>
              <span className="acn-prod-cal-chip" data-acn-familia="ok"><Icone path={mdiWrench} size={11} /> SAC Manhã</span>
              <span className="acn-prod-cal-chip" data-acn-familia="marca"><Icone path={mdiWrench} size={11} /> SAC Tarde</span>
              <span className="acn-prod-cal-dica">Clique no agendamento OP para cancelar</span>
            </div>
          </div>
        ) : (
          /* VISTA LISTA */
          <div className="sec-body acn-rolagem acn-prod-tabela">
            {agendamentos.length===0 ? <div className="acn-empty">Nenhum agendamento.</div> : (
              <table className="acn-tabela acn-densa">
                <thead><tr>
                  <th>Data</th>
                  <th>Período</th>
                  <th>OP</th>
                  <th>Chassi</th>
                  <th>Cliente</th>
                  <th>Obs.</th>
                  <th>Ações</th>
                </tr></thead>
                <tbody>{agendamentos.map(ag=>(
                  <tr key={ag.id}>
                    <td className="acn-num"><strong>{new Date(ag.data_agendamento+'T00:00:00').toLocaleDateString('pt-BR')}</strong></td>
                    <td>
                      <Selo familia={ag.periodo==='Manhã'?'info':'atencao'} ponto={false}>
                        <Icone path={ag.periodo==='Manhã'?mdiWeatherSunny:mdiWeatherSunsetDown} size={12} /> {ag.periodo}
                      </Selo>
                    </td>
                    <td><strong className="acn-forte acn-prod-os-num">{ag.numero_opl}</strong></td>
                    <td>{ag.chassi||'—'}</td>
                    <td>{ag.cliente_nome||'—'}</td>
                    <td className="acn-fraco">{ag.observacoes||'—'}</td>
                    <td>
                      <Botao pequeno variante="perigo-sec" onClick={()=>cancelarAgendamento(ag)}>Cancelar</Botao>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* MODAL AGENDAR */}
      {modalAgendar && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setModalAgendar(null);}}>
          <div className="modal-box acn-modal-cadastro acn-prod-ag-jan" role="dialog" aria-label="Agendar manutenção">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiCalendarOutline} size={16} /> Agendar Manutenção</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-quadro tom-info">
                <div>
                  <strong>{modalAgendar.opl}</strong> · {modalAgendar.chassi||'—'} · {modalAgendar.cliente_nome||'—'}
                  {modalAgendar.modelo && <div className="acn-ajuda">{modalAgendar.modelo}</div>}
                </div>
              </div>
              <div className="form-group">
                <label className="acn-label">Data de recebimento do carro *</label>
                <input type="date" className="acn-input"
                  value={formAg.data} onChange={e=>setFormAg(f=>({...f,data:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="acn-label">Período</label>
                <Chips rotulo="Período" ativo={formAg.periodo} onChange={p=>setFormAg(f=>({...f,periodo:p}))}
                  itens={[{ id:'Manhã', rotulo:'Manhã', icone: mdiWeatherSunny }, { id:'Tarde', rotulo:'Tarde', icone: mdiWeatherSunsetDown }]} />
              </div>
              <div className="form-group">
                <label className="acn-label">Observações</label>
                <textarea className="acn-input" rows={2}
                  value={formAg.obs} onChange={e=>setFormAg(f=>({...f,obs:e.target.value}))}
                  placeholder="Defeitos relatados, histórico, etc." />
              </div>
              <ParticipantesPicker value={formAg.participantes || []} onChange={v => setFormAg(f => ({ ...f, participantes: v }))} donoEmail={currentUser?.email} />
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalAgendar(null)}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiCheck} onClick={confirmarAgendamento} disabled={salvando}>
                {salvando?'...':'Confirmar Agendamento'}
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Componente reutilizável de tabela de itens/materiais ───────────────────
function ItemTable({ itens, setItens }) {
  const total = itens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
  const set = (idx, k, v) => setItens(p=>p.map((x,i)=>i===idx?{...x,[k]:v}:x));
  const add = () => setItens(p=>[...p,{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]);
  const rem = (idx) => setItens(p=>p.filter((_,i)=>i!==idx));
  return (
    <>
      <table className="acn-tabela acn-densa acn-prod-itens">
        <thead><tr>
          <th className="acn-prod-it-cod">Código</th>
          <th>Descrição</th>
          <th className="acn-centro acn-prod-it-qtd">Qtd</th>
          <th className="acn-dir acn-prod-it-val">Vl. Unit.</th>
          <th className="acn-dir acn-prod-it-val">Total</th>
          <th className="acn-prod-it-rem"></th>
        </tr></thead>
        <tbody>
          {itens.map((item,idx)=>(
            <tr key={idx}>
              <td><input className="acn-input" value={item.codigo} onChange={e=>set(idx,'codigo',e.target.value)} /></td>
              <td><input className="acn-input" value={item.descricao} onChange={e=>set(idx,'descricao',e.target.value)} placeholder="Peça / serviço..." /></td>
              <td><input type="number" min={1} className="acn-input acn-prod-it-num acn-centro" value={item.quantidade} onChange={e=>set(idx,'quantidade',Number(e.target.value)||1)} /></td>
              <td><input type="number" min={0} step="0.01" className="acn-input acn-prod-it-num acn-dir" value={item.valor_unitario} onChange={e=>set(idx,'valor_unitario',Number(e.target.value)||0)} /></td>
              <td className="acn-dir acn-num acn-forte">{((Number(item.quantidade)||1)*(Number(item.valor_unitario)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td><Botao pequeno variante="discreto" icone={mdiClose} aria-label="Remover item" title="Remover item" onClick={()=>rem(idx)} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td colSpan={4} className="acn-dir acn-forte">TOTAL:</td>
          <td className="acn-dir acn-num acn-forte">R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td></td>
        </tr></tfoot>
      </table>
      <div className="acn-prod-it-add"><Botao pequeno icone={mdiPlus} onClick={add}>Adicionar Item</Botao></div>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PAINEL SAC VEICULAR — ações exclusivas da Produção no fluxo de manutenção
// ─────────────────────────────────────────────────────────────────────────────
function PainelSacVeicular({ currentUser }) {
  const [ordens, setOrdens] = useState([]);
  const [loading, setLoading] = useState(false);
  const { list: colaboradoresList } = useColaboradores();

  const [modalProvisionar, setModalProvisionar]             = useState(null);
  const [provisionarForm, setProvisionarForm]               = useState({ data_provisao:'', periodo:'Manhã' });
  const [modalConfirmarChegada, setModalConfirmarChegada]   = useState(null);
  const [modalVerificacao, setModalVerificacao]             = useState(null);
  const [verificacaoItens, setVerificacaoItens]             = useState([]);
  const [modalConcluirManu, setModalConcluirManu]           = useState(null);
  const [concluirManuForm, setConcluirManuForm]             = useState({ observacoes:'', itens_usados:[] });
  const [modalIniciarManu, setModalIniciarManu]             = useState(null);
  const [iniciarManuTecnico, setIniciarManuTecnico]         = useState('');
  const [iniciarManuTecnicoId, setIniciarManuTecnicoId]     = useState<string|null>(null);
  // Modo de execução (individual/dupla/equipe) — mesmo padrão da Produção de OPL
  const [iniciarManuModo, setIniciarManuModo]                 = useState<'individual'|'dupla'|'equipe'>('individual');
  const [iniciarManuTecnico2, setIniciarManuTecnico2]         = useState('');
  const [iniciarManuTecnico2Id, setIniciarManuTecnico2Id]     = useState<string|null>(null);
  const [equipesManu, setEquipesManu]                         = useState<any[]>([]);
  const [iniciarManuEquipeSel, setIniciarManuEquipeSel]       = useState<any>(null);
  const [modalObsProd, setModalObsProd]                     = useState(null);
  const [obsText, setObsText]                               = useState('');
  // Ver diagnóstico/relato da OS antes de provisionar (estimar tempo) — só leitura, sem query nova (registro já em memória)
  const [modalVerOs, setModalVerOs]                         = useState(null);
  const [modalItensExecucao, setModalItensExecucao]         = useState(null);
  const [itensExecucao, setItensExecucao]                   = useState([]);
  // Gerenciar equipe (responsáveis/apoios livres pós-início) — OS
  const [modalGerenciarEquipeOS, setModalGerenciarEquipeOS] = useState<any>(null);
  const [equipeAtualOS, setEquipeAtualOS]                   = useState<any[]>([]);
  const [novoRespNomeOS, setNovoRespNomeOS]                 = useState('');
  const [novoRespIdOS, setNovoRespIdOS]                     = useState<string|null>(null);
  const [novoApoioNomeOS, setNovoApoioNomeOS]               = useState('');
  const [novoApoioIdOS, setNovoApoioIdOS]                   = useState<string|null>(null);

  // Etapa 7.55 (06/10/2026): leitura que falha não pode parecer "Nenhuma OS veicular aguardando ação" nem "Nenhuma equipe cadastrada"
  // (e a releitura de 30 s que falhar não esvazia a fila); e um clique duplo em definir data, chegada, orçamento, iniciar e concluir
  // gravava duas vezes — uma ação por tipo (e OS).
  const [erroLeitura, setErroLeitura]       = useState('');
  const [erroEquipesManu, setErroEquipesManu] = useState('');
  const [erroEquipeOS, setErroEquipeOS]     = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const load = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase.from('sac_ordens_servico').select('*')
      .eq('is_manutencao_veicular', true)
      .in('status', STATUSES_VEICULAR_ATIVAS)
      .order('data_abertura', { ascending: false });
    if (error) { setErroLeitura(error.message); if (!silent) setLoading(false); return; }
    setErroLeitura('');
    setOrdens(data || []);
    if (!silent) setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(()=>load(true), 30000); return () => clearInterval(t); }, []);
  const fetchEquipesManu = async () => {
    const { data, error } = await supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome');
    if (error) { setErroEquipesManu(error.message); return; }
    setErroEquipesManu('');
    setEquipesManu(data || []);
  };
  useEffect(() => { fetchEquipesManu(); }, []);

  const fmtVal = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';

  // Etapa 12e17 (06/10/2026): a cor do status segue a família do sistema (antes, um hexadecimal por status).
  // Suposição minha: "Em Manutenção" deixa de ser vermelho (vermelho é de problema) e fica azul, como "Em Execução".
  const STATUS_FAM_VEI = {
    'Em Provisionamento':           'marca',
    'Aguardando Aceite SAC':        'atencao',
    'Provisionada':                 'ok',
    'Aguardando Início':            'atencao',
    'Verificação e Orçamento':      'marca',
    'Aguardando Aprovação Cliente': 'atencao',
    'Em Manutenção':                'info',
    'Em Execução':                  'info',
  };

  // Produção define data → status: Aguardando Aceite SAC
  const salvarProvisionamento = umaVez('provisionar', async () => {
    if (!provisionarForm.data_provisao) { alert('Informe a data!'); return; }
    const os = modalProvisionar;
    const agora = new Date().toISOString();
    const { error: erroProv } = await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Aceite SAC',
      data_provisionamento: provisionarForm.data_provisao,
      periodo_provisionamento: provisionarForm.periodo,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (erroProv) { alert(`Não foi possível definir a data da OS ${os.numero_os}: ${erroProv.message}`); return; }   // 7.55: fechava a janela e avisava o SAC com a OS sem data
    notificarEvento('sac_data_definida', `Producao definiu data — ${os.numero_os} — Cliente: ${os.cliente_nome} — Data: ${new Date(provisionarForm.data_provisao+'T12:00').toLocaleDateString('pt-BR')} (${provisionarForm.periodo})`);
    setModalProvisionar(null); setProvisionarForm({ data_provisao:'', periodo:'Manhã' }); load();
  });

  // Produção confirma chegada → Verificação e Orçamento.
  // 'Provisionada' só é alcançado pelo caminho Presencial (a Remota já pula
  // direto pra 'Aguardando Início' em confirmarAceiteSAC, em SacTab.tsx, já
  // que a cotação é feita antes de agendar) — então esta função é sempre
  // presencial na prática, sem precisar checar tipo_avaliacao aqui.
  const confirmarChegada = umaVez('chegada', async () => {
    const os = modalConfirmarChegada;
    const agora = new Date().toISOString();
    const novoStatus = 'Verificação e Orçamento';
    const { error: erroCheg } = await supabase.from('sac_ordens_servico').update({
      status: novoStatus,
      data_chegada_veiculo: agora,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (erroCheg) { alert(`Não foi possível confirmar a chegada da OS ${os.numero_os}: ${erroCheg.message}`); return; }   // 7.55
    notificarEvento('sac_veiculo_chegou', `Veiculo chegou — ${os.numero_os} — ${os.cliente_nome} — Status: ${novoStatus}`);
    setModalConfirmarChegada(null); load();
  });

  // Produção insere materiais e envia ao SAC → Aguardando Aprovação Cliente
  const enviarVerificacao = umaVez('verificacao', async () => {
    const os = modalVerificacao;
    if (!verificacaoItens.length) { alert('Adicione pelo menos um item!'); return; }
    const total = verificacaoItens.reduce((s,i)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
    const agora = new Date().toISOString();
    const { error: erroVer } = await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando Aprovação Cliente',
      itens_cotacao: verificacaoItens,
      valor_orcamento: total,
      data_envio_orcamento: agora,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (erroVer) { alert(`Não foi possível enviar o orçamento da OS ${os.numero_os}: ${erroVer.message}`); return; }   // 7.55: perdia os itens digitados e avisava o SAC de um orçamento que não existia
    notificarEvento('sac_verificacao_enviada', `Orcamento de verificacao — ${os.numero_os} — ${os.cliente_nome} — Total: ${fmtVal(total)}`);
    setModalVerificacao(null); setVerificacaoItens([]); load();
  });

  // Avisa o SAC (via menção, mesmo padrão do ComprasTab) que uma OS concluiu
  // com itens diferentes do orçamento aprovado e precisa negociar o novo
  // valor com o cliente — a OS fica parada (não avança pro CQ) até isso ser
  // resolvido em SacTab.tsx (botão "🔁 Resolver Revisão").
  // 7.55: devolve se o aviso saiu — antes o alerta dizia "o SAC foi avisado" mesmo sem aviso (OS sem e-mail do criador, criador não achado, menção recusada).
  const notificarRevisaoOrcamento = async (os: any, novoTotal: number): Promise<boolean> => {
    try {
      if (!os.criado_por_email) return false;
      const { data: criador } = await supabase.from('auth_usuarios')
        .select('id, nome').eq('email', os.criado_por_email).maybeSingle();
      if (!criador) return false;
      const { error: erroMencao } = await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'sac_revisao_orcamento', contexto_id: String(os.id),
        contexto_descricao: `OS ${os.numero_os}`,
        campo: 'revisao_orcamento',
        texto_trecho: `Orçamento revisado na OS ${os.numero_os} (${os.cliente_nome}) — novo total: ${fmtVal(novoTotal)} (aprovado: ${fmtVal(os.valor_orcamento)}). Negocie a aprovação do novo custo com o cliente.`,
        aba_destino: 'sac', lida: false, criado_em: new Date().toISOString(),
      });
      if (erroMencao) { console.warn('Falha ao notificar SAC sobre revisão de orçamento:', erroMencao); return false; }
      return true;
    } catch (e) { console.warn('Falha ao notificar SAC sobre revisão de orçamento:', e); return false; }
  };

  // Produção conclui manutenção → compara o total apurado com o orçamento
  // aprovado (os.valor_orcamento). Se bater, segue pro CQ (Aguardando CQ);
  // se não bater, a OS permanece onde está (não avança) e o SAC é avisado
  // pra negociar o novo valor com o cliente.
  const salvarConclusao = umaVez('concluir-manu', async () => {
    const os = modalConcluirManu;
    const agora = new Date().toISOString();
    const kpi = os.data_inicio_manutencao
      ? Number(horasUteis(os.data_inicio_manutencao, new Date()).toFixed(2))
      : null;
    const novoTotal = concluirManuForm.itens_usados.reduce((s:number,i:any)=>s+(Number(i.quantidade)||1)*(Number(i.valor_unitario)||0), 0);
    const totalAprovado = Number(os.valor_orcamento) || 0;
    const bateu = Math.abs(novoTotal - totalAprovado) < 0.01;

    if (!bateu) {
      const { error: erroRev } = await supabase.from('sac_ordens_servico').update({
        revisao_pendente: true,
        valor_orcamento_revisado: novoTotal,
        itens_revisados: concluirManuForm.itens_usados,
        atualizado_em: agora,
      }).eq('id', os.id);
      if (erroRev) { alert(`Não foi possível registrar a revisão do orçamento da OS ${os.numero_os}: ${erroRev.message}`); return; }   // 7.55: dizia "a OS ficou pendente de revisão" sem ter gravado
      const avisou = await notificarRevisaoOrcamento(os, novoTotal);
      setModalConcluirManu(null); setConcluirManuForm({ observacoes:'', itens_usados:[] }); load();
      alert(avisou
        ? 'Os itens não batem com o orçamento aprovado. A OS ficou pendente de revisão e o SAC foi avisado para negociar o novo valor com o cliente — conclua novamente depois que o SAC resolver.'
        : 'Os itens não batem com o orçamento aprovado e a OS ficou pendente de revisão, mas NÃO foi possível avisar o SAC automaticamente. Avise o SAC diretamente para negociar o novo valor com o cliente — conclua novamente depois que ele resolver.');
      return;
    }

    const { error: erroConc } = await supabase.from('sac_ordens_servico').update({
      status: 'Aguardando CQ',
      data_conclusao_manutencao: agora,
      materiais_utilizados: concluirManuForm.itens_usados,
      observacoes_manutencao: concluirManuForm.observacoes || null,
      kpi_execucao_horas: kpi,
      revisao_pendente: false,
      valor_orcamento_revisado: null,
      itens_revisados: null,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (erroConc) { alert(`Não foi possível concluir a manutenção da OS ${os.numero_os}: ${erroConc.message}`); return; }   // 7.55: fechava a janela e a OS ficava sem ir para o CQ
    setModalConcluirManu(null); setConcluirManuForm({ observacoes:'', itens_usados:[] }); load();
  });

  // Produção inicia manutenção: registra técnico(s)/equipe + inicia KPI —
  // mesmo padrão individual/dupla/equipe da Produção de OPL.
  const iniciarManutencao = umaVez('iniciar-manu', async () => {
    const os = modalIniciarManu;
    const agora = new Date().toISOString();
    let upd: any = { status: 'Em Execução', data_inicio_manutencao: agora, atualizado_em: agora, modo_execucao: iniciarManuModo };

    if (iniciarManuModo === 'individual') {
      if (!iniciarManuTecnico.trim()) { alert('Informe o nome do técnico!'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuTecnico.trim(), tecnico_producao_id: iniciarManuTecnicoId || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
    } else if (iniciarManuModo === 'dupla') {
      if (!iniciarManuTecnico.trim() || !iniciarManuTecnico2.trim()) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuTecnico.trim(), tecnico_producao_id: iniciarManuTecnicoId || null,
               tecnico_producao_2_nome: iniciarManuTecnico2.trim(), tecnico_producao_2_id: iniciarManuTecnico2Id || null,
               equipe_id: null, equipe_nome: null };
    } else if (iniciarManuModo === 'equipe') {
      if (!iniciarManuEquipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, tecnico_responsavel: iniciarManuEquipeSel.head_line_nome, tecnico_producao_id: iniciarManuEquipeSel.head_line_id || null,
               equipe_id: iniciarManuEquipeSel.id, equipe_nome: iniciarManuEquipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
    }

    const { error: erroIniManu } = await supabase.from('sac_ordens_servico').update(upd).eq('id', os.id);
    if (erroIniManu) { alert(`Não foi possível iniciar a manutenção da OS ${os.numero_os}: ${erroIniManu.message}`); return; }   // 7.55: fechava a janela, semeava os responsáveis e a OS seguia "Aguardando Início"
    // Semeia a lista livre de responsáveis, igual acontece em iniciarProducao (OP).
    const seedResponsaveis = [
      upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.tecnico_responsavel } : null,
      upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
    ].filter(Boolean);
    if (seedResponsaveis.length > 0) {
      const { error: erroSeedManu } = await inserirResponsaveisSemRepetir(seedResponsaveis.map((r: any) => ({
        tipo: 'os', referencia_id: os.id, papel: 'responsavel',
        tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
        adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
      })));
      if (erroSeedManu) alert('A manutenção foi iniciada, mas a lista de responsáveis da OS não foi gravada (' + erroSeedManu.message + '). Use "EQUIPE" na linha da OS para incluí-los.');
    }
    setModalIniciarManu(null); setIniciarManuTecnico(''); setIniciarManuTecnicoId(null);
    setIniciarManuModo('individual'); setIniciarManuTecnico2(''); setIniciarManuTecnico2Id(null); setIniciarManuEquipeSel(null);
    load();
  });

  // ── Gerenciar Equipe (responsáveis/apoios livres, pós-início) — OS ─────────
  const carregarEquipeAtualOS = async (os: any) => {
    const { data, error } = await supabase.from('responsaveis_producao')
      .select('*').eq('tipo', 'os').eq('referencia_id', os.id).order('criado_em');
    if (error) { setErroEquipeOS(error.message); return; }   // 7.55: leitura que falha parecia "Nenhum responsável ainda"
    setErroEquipeOS('');
    setEquipeAtualOS(data || []);
  };

  const abrirGerenciarEquipeOS = (os: any) => {
    setModalGerenciarEquipeOS(os);
    setEquipeAtualOS([]); setErroEquipeOS('');   // 7.55: não mostrar a equipe da OS anterior se a leitura desta falhar
    setNovoRespNomeOS(''); setNovoRespIdOS(null);
    setNovoApoioNomeOS(''); setNovoApoioIdOS(null);
    carregarEquipeAtualOS(os);
  };

  const adicionarMembroEquipeOS = (papel: 'responsavel'|'apoio') => umaVez('equipe-add-' + papel, async () => {
    const os = modalGerenciarEquipeOS;
    if (!os) return;
    const nome = papel === 'responsavel' ? novoRespNomeOS : novoApoioNomeOS;
    const id   = papel === 'responsavel' ? novoRespIdOS   : novoApoioIdOS;
    if (!nome.trim()) { alert('Selecione um técnico.'); return; }
    const { error: erroAdd } = await inserirResponsaveisSemRepetir([{
      tipo: 'os', referencia_id: os.id, papel, tecnico_id: id, tecnico_nome: nome,
      adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
    }]);
    if (erroAdd) { alert(`Não foi possível adicionar ${nome} à OS ${os.numero_os}: ${erroAdd.message}`); return; }   // 7.55: limpava o campo e a lista não mudava, sem aviso
    if (papel === 'responsavel') { setNovoRespNomeOS(''); setNovoRespIdOS(null); }
    else { setNovoApoioNomeOS(''); setNovoApoioIdOS(null); }
    carregarEquipeAtualOS(os);
  })();

  const removerMembroEquipeOS = (membro: any) => umaVez('equipe-rem-' + membro.id, async () => {
    if (!await confirmar(`Remover ${membro.tecnico_nome} (${membro.papel})?`)) return;
    const { error: erroRem } = await supabase.from('responsaveis_producao').delete().eq('id', membro.id);
    if (erroRem) { alert(`Não foi possível remover ${membro.tecnico_nome}: ${erroRem.message}`); return; }   // 7.55
    carregarEquipeAtualOS(modalGerenciarEquipeOS);
  })();

  // Salva observação de produção sem concluir (durante execução)
  const salvarObsProducao = umaVez('obs-prod', async () => {
    const { error: erroObs } = await supabase.from('sac_ordens_servico').update({
      observacoes_manutencao: obsText.trim() || null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', modalObsProd.id);
    if (erroObs) { alert(`Não foi possível salvar a observação da OS ${modalObsProd.numero_os}: ${erroObs.message}`); return; }   // 7.55: fechava a janela e perdia o texto
    setModalObsProd(null); setObsText(''); load();
  });

  // Produção salva itens conferidos durante execução (sem concluir)
  const salvarItensExecucao = umaVez('itens-exec', async () => {
    const os = modalItensExecucao;
    const agora = new Date().toISOString();
    const { error: erroItens } = await supabase.from('sac_ordens_servico').update({
      materiais_utilizados: itensExecucao,
      atualizado_em: agora,
    }).eq('id', os.id);
    if (erroItens) { alert(`Não foi possível salvar os itens da OS ${os.numero_os}: ${erroItens.message}`); return; }   // 7.55: fechava a janela e perdia a conferência
    setModalItensExecucao(null); setItensExecucao([]); load();
  });

  const isAtrasada = (os) => {
    if (os.status !== 'Provisionada' || !os.data_provisionamento) return false;
    const limite = new Date(new Date(os.data_provisionamento+'T23:59:59').getTime() + 2*24*60*60*1000);
    return new Date() > limite;
  };



  return (
    <div>
      {ordens.filter(isAtrasada).length > 0 && (
        <Faixa tom="erro">
          <b>{ordens.filter(isAtrasada).length} OS(s) — veículo não chegou há mais de 2 dias após data agendada!</b>{' '}Use o botão "Remarcar" para reagendar.
        </Faixa>
      )}
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>
          Não foi possível ler as OS veiculares ({erroLeitura}). Isso não quer dizer que não haja OS aguardando a Produção{ordens.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}

      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-prod-ic"><Icone path={mdiCarWrench} size={16} /> SAC Veicular — Ações da Produção ({ordens.length})</span>
          <Botao pequeno icone={mdiRefresh} onClick={load}>Atualizar</Botao>
        </div>
        <div className="sec-body acn-rolagem acn-prod-tabela">
          {loading ? <div className="acn-empty">Carregando...</div> : ordens.length === 0 ? (
            <div className="acn-empty">{erroLeitura ? 'Leitura falhou — veja o aviso acima.' : 'Nenhuma OS veicular aguardando ação da Produção.'}</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Tipo</th><th>Data Prov.</th><th>Status</th><th>Ação Produção</th>
              </tr></thead>
              <tbody>
                {ordens.map(os => {
                  const atrasada = isAtrasada(os);
                  return (
                    <tr key={os.id} className={atrasada ? 'acn-linha-alerta' : undefined}>
                      <td>
                        <div className="acn-duas">
                          <strong className="acn-forte acn-prod-os-num">{os.numero_os}</strong>
                          {os.tipo_avaliacao && <span className="acn-eng-selo-linha"><Tag>{os.tipo_avaliacao}</Tag></span>}
                        </div>
                      </td>
                      <td className="acn-prod-os-cli">{os.cliente_nome}</td>
                      <td className="acn-prod-os-veic">
                        <div className="acn-duas">
                          <span className="acn-prod-quebra">{os.equipamento_nome}</span>
                          <small className="acn-prod-ic">{semDado(os.modelo) ? <span className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> sem modelo</span> : os.modelo}</small>
                          <small className="acn-prod-ic">{semDado(os.chassi) ? <span className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> sem chassi</span> : <><Icone path={mdiWrench} size={12} /> {os.chassi}</>}</small>
                        </div>
                      </td>
                      <td><Tag>{os.tipo_avaliacao||'—'}</Tag></td>
                      <td className="acn-num acn-prod-nowrap">
                        {os.data_provisionamento
                          ? <span className={atrasada ? 'acn-prod-ic acn-txt-erro acn-forte' : 'acn-prod-ic'}>
                              {new Date(os.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}
                              {atrasada && <> <Icone path={mdiAlertOutline} size={13} /></>}
                            </span>
                          : '—'}
                      </td>
                      <td>
                        <div className="acn-duas acn-prod-duas-ini">
                          <Selo familia={STATUS_FAM_VEI[os.status]||'neutro'}>{os.status}</Selo>
                          {os.revisao_pendente && (
                            <small className="acn-txt-erro acn-forte acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> Revisão pendente — aguardando SAC</small>
                          )}
                          {os.tecnico_responsavel && (
                            <small className="acn-prod-ic">
                              {os.modo_execucao === 'equipe'
                                ? <><Icone path={mdiTagOutline} size={12} /> <strong>{os.equipe_nome || os.tecnico_responsavel}</strong></>
                                : <><Icone path={mdiAccount} size={12} /> {os.tecnico_responsavel}{os.tecnico_producao_2_nome ? <> + {os.tecnico_producao_2_nome}</> : ''}</>}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="acn-acoes-linha quebra">
                          <Botao pequeno variante="discreto" icone={mdiEyeOutline}
                            onClick={()=>setModalVerOs(os)} title="Ver diagnóstico/relato antes de provisionar">VER</Botao>
                          {os.status === 'Em Provisionamento' && (
                            <Botao pequeno variante="primario" icone={mdiCalendarOutline}
                              onClick={()=>{ setProvisionarForm({data_provisao:'',periodo:'Manhã'}); setModalProvisionar(os); }}>Definir Data</Botao>
                          )}
                          {os.status === 'Provisionada' && (
                            <>
                              <Botao pequeno variante="primario" icone={mdiCar} onClick={()=>setModalConfirmarChegada(os)}>Chegou</Botao>
                              {atrasada && (
                                <Botao pequeno variante="perigo-sec" icone={mdiCalendarOutline}
                                  onClick={()=>{ setProvisionarForm({data_provisao:os.data_provisionamento||'',periodo:os.periodo_provisionamento||'Manhã'}); setModalProvisionar(os); }}>Remarcar</Botao>
                              )}
                            </>
                          )}
                          {os.status === 'Aguardando Início' && (
                            <Botao pequeno variante="primario" icone={mdiPlay}
                              onClick={()=>{ setIniciarManuTecnico(''); setIniciarManuTecnicoId(null);
                                setIniciarManuModo('individual'); setIniciarManuTecnico2(''); setIniciarManuTecnico2Id(null); setIniciarManuEquipeSel(null);
                                setModalIniciarManu(os); }}>Iniciar</Botao>
                          )}
                          {os.status === 'Verificação e Orçamento' && (
                            <Botao pequeno variante="primario" icone={mdiWrench}
                              onClick={()=>{ setVerificacaoItens(Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalVerificacao(os); }}>Inserir Materiais</Botao>
                          )}
                          {os.status === 'Em Manutenção' && (
                            <>
                              <Botao pequeno variante="primario" icone={mdiCheck}
                                onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)?os.materiais_utilizados.map(i=>({...i})):[]}); }}>Concluir</Botao>
                              <Botao pequeno icone={mdiAccountMultipleOutline} onClick={()=>abrirGerenciarEquipeOS(os)}>EQUIPE</Botao>
                            </>
                          )}
                          {os.status === 'Em Execução' && (
                            <>
                              <Botao pequeno icone={mdiMessageTextOutline}
                                onClick={()=>{ setObsText(os.observacoes_manutencao||''); setModalObsProd(os); }}>Obs.</Botao>
                              <Botao pequeno icone={mdiClipboardListOutline}
                                onClick={()=>{ setItensExecucao(Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[{codigo:'',descricao:'',quantidade:1,valor_unitario:0}]); setModalItensExecucao(os); }}>Itens</Botao>
                              <Botao pequeno variante="primario" icone={mdiCheck}
                                onClick={()=>{ setModalConcluirManu(os); setConcluirManuForm({observacoes:'',itens_usados:Array.isArray(os.materiais_utilizados)&&os.materiais_utilizados.length>0?os.materiais_utilizados.map(i=>({...i})):Array.isArray(os.itens_cotacao)&&os.itens_cotacao.length>0?os.itens_cotacao.map(i=>({...i})):[]}); }}>Concluir</Botao>
                              <Botao pequeno icone={mdiAccountMultipleOutline} onClick={()=>abrirGerenciarEquipeOS(os)}>EQUIPE</Botao>
                            </>
                          )}
                          {(os.status === 'Aguardando Aprovação Cliente' || os.status === 'Aguardando Aceite SAC') && (
                            <span className="acn-fraco">Aguardando SAC</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL: Definir / Remarcar Data */}
      {modalProvisionar && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Definir data de recebimento">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiCalendarOutline} size={16} /> {modalProvisionar.data_provisionamento ? 'Remarcar' : 'Definir'} Data — {modalProvisionar.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">Cliente: {modalProvisionar.cliente_nome}</div>
              {modalProvisionar.data_provisionamento && (
                <Faixa tom="erro">
                  Data anterior: <strong>{new Date(modalProvisionar.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}</strong>
                  {' '}({modalProvisionar.periodo_provisionamento||''})
                </Faixa>
              )}
              <div className="form-group">
                <label className="acn-label">Nova Data de Recebimento *</label>
                <input type="date" className="acn-input"
                  value={provisionarForm.data_provisao}
                  onChange={e=>setProvisionarForm(f=>({...f,data_provisao:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="acn-label">Período</label>
                <Chips rotulo="Período" ativo={provisionarForm.periodo} onChange={p=>setProvisionarForm(f=>({...f,periodo:p}))}
                  itens={[{ id:'Manhã', rotulo:'Manhã', icone: mdiWeatherSunny }, { id:'Tarde', rotulo:'Tarde', icone: mdiWeatherSunsetDown }]} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheck} onClick={salvarProvisionamento}>Confirmar</Botao>
              <Botao onClick={()=>setModalProvisionar(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Chegada */}
      {modalConfirmarChegada && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Confirmar chegada">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiCar} size={16} /> Confirmar Chegada — {modalConfirmarChegada.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">Cliente: {modalConfirmarChegada.cliente_nome}</div>
              {modalConfirmarChegada.data_provisionamento && (
                <Faixa tom="info" icone={mdiCalendarOutline}>
                  Data prevista: <strong>{new Date(modalConfirmarChegada.data_provisionamento+'T12:00').toLocaleDateString('pt-BR')}</strong>
                  {' '}({modalConfirmarChegada.periodo_provisionamento||''})
                </Faixa>
              )}
              <Faixa tom="ok">
                Próximo status: <strong>Verificação e Orçamento</strong>
              </Faixa>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCar} onClick={confirmarChegada}>Confirmar Chegada</Botao>
              <Botao onClick={()=>setModalConfirmarChegada(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Verificação e Orçamento */}
      {modalVerificacao && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-larga" role="dialog" aria-label="Verificação e orçamento">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiWrench} size={16} /> Verificação e Orçamento — {modalVerificacao.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">Cliente: {modalVerificacao.cliente_nome}</div>
              <div className="acn-quadro-titulo">Materiais / Itens do Orçamento</div>
              <ItemTable itens={verificacaoItens} setItens={setVerificacaoItens} />
              <Faixa tom="atencao">
                Ao enviar, a OS aguardará aprovação do SAC/Cliente antes de iniciar manutenção.
              </Faixa>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiSendOutline} onClick={enviarVerificacao}>Enviar para Aprovação</Botao>
              <Botao onClick={()=>setModalVerificacao(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Observação de Produção */}
      {modalObsProd && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-obs" role="dialog" aria-label="Observação de produção">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiMessageTextOutline} size={16} /> Observação de Produção — {modalObsProd.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Cliente: <strong>{modalObsProd.cliente_nome}</strong>
              </div>
              <div className="form-group">
                <label className="acn-label">Observação (visível na impressão da OS)</label>
                <textarea className="acn-input" rows={5} autoFocus
                  placeholder="Descreva o andamento, peças utilizadas, observações técnicas..."
                  value={obsText} onChange={e=>setObsText(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarObsProducao}>Salvar</Botao>
              <Botao onClick={()=>setModalObsProd(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver OS (somente leitura) — diagnóstico/relato antes de provisionar */}
      {modalVerOs && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-ver" role="dialog" aria-label="Detalhes da OS">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiEyeOutline} size={16} /> {modalVerOs.numero_os} — {modalVerOs.cliente_nome}</span>
            </div>
            <div className="acn-modal-corpo">
              <div className="acn-prod-ver-selos">
                {modalVerOs.tipo_avaliacao && <Tag>{modalVerOs.tipo_avaliacao}</Tag>}
                <Selo familia={STATUS_FAM_VEI[modalVerOs.status]||'neutro'}>{modalVerOs.status}</Selo>
              </div>
              <div>
                <div className="acn-ficha-linha"><span>Veículo/Equipamento:</span><span>{modalVerOs.equipamento_nome||'—'}</span></div>
                <div className="acn-ficha-linha"><span>Marca/Modelo:</span><span>{[modalVerOs.marca,modalVerOs.modelo].filter(Boolean).join(' / ')||'—'}</span></div>
                <div className="acn-ficha-linha"><span>Chassi/Série:</span><span>{modalVerOs.chassi||modalVerOs.numero_serie||'—'}</span></div>
              </div>
              <div className="acn-quadro-titulo acn-prod-ic"><Icone path={mdiCommentTextOutline} size={13} /> Defeito Reclamado (relato do cliente)</div>
              <div className="acn-quadro tom-erro acn-prod-texto">
                {modalVerOs.defeito_reclamado ? <Linkify text={modalVerOs.defeito_reclamado} /> : <span className="acn-fraco">Nenhum defeito reclamado registrado.</span>}
              </div>
              {modalVerOs.observacoes && (
                <>
                  <div className="acn-quadro-titulo acn-prod-ic"><Icone path={mdiClipboardListOutline} size={13} /> Observações</div>
                  <div className="acn-quadro acn-prod-texto">
                    <Linkify text={modalVerOs.observacoes} />
                  </div>
                </>
              )}
              {Array.isArray(modalVerOs.itens_cotacao) && modalVerOs.itens_cotacao.length > 0 && (
                <>
                  <div className="acn-quadro-titulo acn-prod-ic">
                    <Icone path={mdiWrench} size={13} /> Itens já orçados {modalVerOs.valor_orcamento!=null && `— Total: ${fmtVal(modalVerOs.valor_orcamento)}`}
                  </div>
                  <div>
                    {modalVerOs.itens_cotacao.map((it,i)=>(
                      <div key={i} className="acn-ficha-linha acn-prod-orcado">
                        {it.quantidade||1}x {it.descricao||it.codigo||'—'} {it.valor_unitario ? `— ${fmtVal(it.valor_unitario)}` : ''}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalVerOs(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Iniciar Manutenção */}
      {modalIniciarManu && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Iniciar manutenção">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiPlay} size={16} /> Iniciar Manutenção — {modalIniciarManu.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Cliente: <strong>{modalIniciarManu.cliente_nome}</strong>
                {modalIniciarManu.veiculo_modelo && <> &nbsp;|&nbsp; Veículo: <strong>{modalIniciarManu.veiculo_modelo}</strong></>}
              </div>
              <Faixa tom="atencao" icone={mdiTimerOutline}>
                A contagem do KPI de manutenção inicia ao confirmar.
              </Faixa>
              {/* Seletor de modo — mesmo padrão individual/dupla/equipe da Produção de OPL */}
              <div className="form-group">
                <label className="acn-label">Modo de Execução</label>
                <Chips rotulo="Modo de execução" ativo={iniciarManuModo} onChange={setIniciarManuModo} itens={MODOS_EXECUCAO} />
              </div>

              {iniciarManuModo === 'individual' && (
                <div className="form-group">
                  <label className="acn-label">Técnico Responsável *</label>
                  <ColaboradorSelect
                    value={iniciarManuTecnico} onChange={(nome)=>{ setIniciarManuTecnico(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnicoId(colab?.id||null); }}
                    placeholder="Selecione o técnico responsável"
                    className="acn-input"
                    autoFocus onKeyDown={e=>e.key==='Enter'&&iniciarManutencao()} />
                </div>
              )}

              {iniciarManuModo === 'dupla' && (
                <>
                  <div className="form-group">
                    <label className="acn-label">Head Line (Técnico 1) *</label>
                    <ColaboradorSelect
                      value={iniciarManuTecnico} onChange={(nome)=>{ setIniciarManuTecnico(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnicoId(colab?.id||null); }}
                      placeholder="Selecione o head line"
                      className="acn-input" />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Auxiliar (Técnico 2) *</label>
                    <ColaboradorSelect
                      value={iniciarManuTecnico2} onChange={(nome)=>{ setIniciarManuTecnico2(nome); const colab = colaboradoresList.find(c=>c.nome===nome); setIniciarManuTecnico2Id(colab?.id||null); }}
                      placeholder="Selecione o auxiliar"
                      className="acn-input" />
                  </div>
                </>
              )}

              {iniciarManuModo === 'equipe' && (
                <div className="form-group">
                  <label className="acn-label">Selecione a Equipe (pelo Head Line)</label>
                  {equipesManu.length === 0 ? (
                    erroEquipesManu
                      ? <Faixa tom="erro" acao={<Botao pequeno onClick={fetchEquipesManu}>Tentar de novo</Botao>}>Não foi possível ler as equipes ({erroEquipesManu}). Isso não quer dizer que não haja equipe cadastrada.</Faixa>
                      : <div className="acn-txt-erro">Nenhuma equipe cadastrada. Vá em Equipes para criar.</div>
                  ) : (
                    <div className="acn-prod-equipes">
                      {equipesManu.map(eq => (
                        <div key={eq.id} onClick={()=>setIniciarManuEquipeSel(eq)} className={'acn-prod-equipe' + (iniciarManuEquipeSel?.id===eq.id ? ' sel' : '')}>
                          <strong>{eq.nome}</strong>
                          <span className="acn-ajuda">Head: {eq.head_line_nome}</span>
                          {(eq.membros||[]).length>0 && (
                            <span className="acn-ajuda">+{eq.membros.length} membros</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiPlay} onClick={iniciarManutencao}>Iniciar Manutenção</Botao>
              <Botao onClick={()=>setModalIniciarManu(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR EQUIPE — responsáveis/apoios livres, pós-início (OS) */}
      {modalGerenciarEquipeOS && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-eqos" role="dialog" aria-label="Equipe da OS">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiAccountMultipleOutline} size={16} /> Equipe — OS {modalGerenciarEquipeOS.numero_os}</span>
            </div>
            <div className="acn-modal-corpo">
              <div className="acn-ajuda">
                Responsáveis recebem comissão pelo próprio percentual configurado. Apoios recebem 0,1% fixo
                do valor de mão de obra desta OS, além do que os responsáveis já recebem.
              </div>
              {erroEquipeOS && (
                <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregarEquipeAtualOS(modalGerenciarEquipeOS)}>Tentar de novo</Botao>}>
                  Não foi possível ler a equipe desta OS ({erroEquipeOS}). Os "Nenhum ... ainda" abaixo não são confiáveis.
                </Faixa>
              )}

              <div className="acn-quadro-titulo">RESPONSÁVEIS</div>
              {equipeAtualOS.filter(m=>m.papel==='responsavel').length === 0 ? (
                <div className="acn-fraco">Nenhum responsável ainda.</div>
              ) : (
                <div className="acn-prod-membros">
                  {equipeAtualOS.filter(m=>m.papel==='responsavel').map(m => (
                    <div key={m.id} className="acn-prod-membro resp">
                      <span>{m.tecnico_nome}</span>
                      <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label="Excluir" title="Remover" onClick={()=>removerMembroEquipeOS(m)} />
                    </div>
                  ))}
                </div>
              )}
              <div className="acn-prod-add">
                <ColaboradorSelect value={novoRespNomeOS}
                  onChange={nome=>{ setNovoRespNomeOS(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoRespIdOS(c?.id||null); }}
                  placeholder="Adicionar responsável..." className="acn-input" />
                <Botao pequeno variante="primario" icone={mdiPlus} onClick={()=>adicionarMembroEquipeOS('responsavel')}>Add</Botao>
              </div>

              <div className="acn-quadro-titulo">APOIOS (0,1% da mão de obra)</div>
              {equipeAtualOS.filter(m=>m.papel==='apoio').length === 0 ? (
                <div className="acn-fraco">Nenhum apoio ainda.</div>
              ) : (
                <div className="acn-prod-membros">
                  {equipeAtualOS.filter(m=>m.papel==='apoio').map(m => (
                    <div key={m.id} className="acn-prod-membro apoio">
                      <span>{m.tecnico_nome}</span>
                      <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label="Excluir" title="Remover" onClick={()=>removerMembroEquipeOS(m)} />
                    </div>
                  ))}
                </div>
              )}
              <div className="acn-prod-add">
                <ColaboradorSelect value={novoApoioNomeOS}
                  onChange={nome=>{ setNovoApoioNomeOS(nome); const c=colaboradoresList.find(x=>x.nome===nome); setNovoApoioIdOS(c?.id||null); }}
                  placeholder="Adicionar apoio..." className="acn-input" />
                <Botao pequeno variante="primario" icone={mdiPlus} onClick={()=>adicionarMembroEquipeOS('apoio')}>Add</Botao>
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao onClick={()=>setModalGerenciarEquipeOS(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Concluir Manutenção */}
      {modalConcluirManu && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-larga" role="dialog" aria-label="Concluir manutenção">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiCheck} size={16} /> Concluir Manutenção — {modalConcluirManu.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">Cliente: {modalConcluirManu.cliente_nome}</div>
              <div className="acn-quadro-titulo">Materiais Utilizados</div>
              <ItemTable
                itens={concluirManuForm.itens_usados}
                setItens={(fn) => setConcluirManuForm(f=>({...f, itens_usados: typeof fn === 'function' ? fn(f.itens_usados) : fn}))}
              />
              <div className="form-group">
                <label className="acn-label">Observações</label>
                <textarea className="acn-input" rows={3}
                  value={concluirManuForm.observacoes}
                  onChange={e=>setConcluirManuForm(f=>({...f,observacoes:e.target.value}))} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheck} onClick={salvarConclusao}>CONCLUIR MANUTENÇÃO</Botao>
              <Botao onClick={()=>setModalConcluirManu(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Conferência de Itens (Em Execução — Remota) */}
      {modalItensExecucao && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-larga acn-prod-larguissima" role="dialog" aria-label="Conferência de itens">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiClipboardListOutline} size={16} /> Conferência de Itens — {modalItensExecucao.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">Cliente: {modalItensExecucao.cliente_nome}</div>
              <Faixa tom="info">
                Revise os itens do orçamento: remova os não executados (×) e adicione extras. O SAC visualizará as alterações.
              </Faixa>
              <div className="acn-quadro-titulo">Itens Executados</div>
              <ItemTable itens={itensExecucao} setItens={setItensExecucao} />
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarItensExecucao}>Salvar Itens</Botao>
              <Botao onClick={()=>setModalItensExecucao(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER DE SERVIÇOS
// SQL necessário (rodar uma vez no Supabase):
// CREATE TABLE IF NOT EXISTS vouchers_servico (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tipo_servico text, numero_pvop text, data_servico date,
//   prestador text, autorizado_por text, criado_por text,
//   itens_voucher jsonb, valor_total numeric,
//   criado_em timestamptz DEFAULT now()
// );
// ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS itens_voucher jsonb;
// ALTER TABLE vouchers_servico ADD COLUMN IF NOT EXISTS valor_total numeric;
//
// CREATE TABLE IF NOT EXISTS tipos_servico_voucher (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   nome text NOT NULL UNIQUE,
//   criado_em timestamptz DEFAULT now()
// );
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_VOUCHER_VAZIO = { placa_chassi: '', modelo: '', valor: '' };
const VOUCHER_VAZIO = { tipo_servico:'', numero_pvop:'', data_servico:'', prestador:'', autorizado_por:'', itens:[{ ...ITEM_VOUCHER_VAZIO }] };

function VoucherItemTable({ itens, setItens }) {
  const total = itens.reduce((s,i) => s + (Number(i.valor) || 0), 0);
  const setField = (idx, k, v) => setItens(p => p.map((x,i) => i===idx ? {...x,[k]:v} : x));
  const add = () => setItens(p => [...p, { ...ITEM_VOUCHER_VAZIO }]);
  const rem = (idx) => setItens(p => p.filter((_,i) => i!==idx));
  return (
    <>
      <table className="acn-tabela acn-densa acn-prod-itens">
        <thead><tr>
          <th>Placa / Chassi</th>
          <th>Modelo</th>
          <th className="acn-dir acn-prod-it-valv">Valor do Serviço (R$)</th>
          <th className="acn-prod-it-rem"></th>
        </tr></thead>
        <tbody>
          {itens.map((item,idx) => (
            <tr key={idx}>
              <td>
                <input className="acn-input" value={item.placa_chassi}
                  onChange={e=>setField(idx,'placa_chassi',e.target.value)} placeholder="Ex: ABC-1234" />
              </td>
              <td>
                <input className="acn-input" value={item.modelo}
                  onChange={e=>setField(idx,'modelo',e.target.value)} placeholder="Ex: Fiat Strada 2023" />
              </td>
              <td>
                <input type="number" min={0} step="0.01" className="acn-input acn-prod-it-num acn-dir" value={item.valor}
                  onChange={e=>setField(idx,'valor',e.target.value)} placeholder="0,00" />
              </td>
              <td>
                <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Remover linha" title="Remover linha" onClick={()=>rem(idx)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="acn-dir acn-forte">VALOR TOTAL:</td>
            <td className="acn-dir acn-num acn-forte">
              R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div className="acn-prod-it-add"><Botao pequeno icone={mdiPlus} onClick={add}>Adicionar Veículo</Botao></div>
    </>
  );
}

function VoucherServicos({ currentUser }) {
  const [vouchers, setVouchers]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [form, setForm]                 = useState({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] });
  const [salvando, setSalvando]         = useState(false);
  const [tiposServico, setTiposServico] = useState([]);
  const [novoTipo, setNovoTipo]         = useState('');
  const [addingTipo, setAddingTipo]     = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const base = import.meta.env.BASE_URL;

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItens = (fn) => setForm(f => ({ ...f, itens: typeof fn === 'function' ? fn(f.itens) : fn }));

  // Etapa 7.56 (06/10/2026): leitura que falha não pode parecer "Nenhum voucher" nem lista de tipos vazia (a lista que já estava na tela
  // fica); excluir tipo/voucher ignorava o erro; e um clique duplo em salvar gravava dois vouchers — uma ação por tipo.
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroTipos, setErroTipos]     = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const loadTipos = async () => {
    try {
      const { data, error } = await supabase.from('tipos_servico_voucher').select('*').order('nome');
      if (error) { setErroTipos(error.message); return; }
      setErroTipos('');
      setTiposServico(data || []);
    } catch (e) { setErroTipos(String(e?.message || e)); }
  };

  const salvarTipo = umaVez('tipo', async () => {
    if (!novoTipo.trim()) return;
    setSalvandoTipo(true);
    const { error } = await supabase.from('tipos_servico_voucher').insert([{ nome: novoTipo.trim() }]);
    if (error) { alert(error.code === '23505' ? 'Tipo já existe!' : error.message); setSalvandoTipo(false); return; }
    setForm(f => ({ ...f, tipo_servico: novoTipo.trim() }));
    setNovoTipo(''); setAddingTipo(false); setSalvandoTipo(false);
    loadTipos();
  });

  const excluirTipo = (id) => umaVez('tipo-del-' + id, async () => {
    if (!await confirmar('Remover este tipo de serviço?')) return;
    const { error } = await supabase.from('tipos_servico_voucher').delete().eq('id', id);
    if (error) { alert('Não foi possível remover o tipo de serviço: ' + error.message); return; }   // 7.56
    loadTipos();
  })();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vouchers_servico').select('*').order('criado_em', { ascending: false }).limit(100);
    if (error) { setErroLeitura(error.message); setLoading(false); return; }
    setErroLeitura('');
    setVouchers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); loadTipos(); }, []);

  const salvar = umaVez('salvar', async () => {
    if (!form.tipo_servico || !form.numero_pvop) { alert('Informe ao menos o Tipo de Serviço e Nº PV/OP!'); return; }
    const itens = form.itens.filter(i => i.placa_chassi || i.modelo || Number(i.valor));
    const valor_total = itens.reduce((s,i) => s + (Number(i.valor)||0), 0);
    setSalvando(true);
    const { error } = await supabase.from('vouchers_servico').insert([{
      tipo_servico: form.tipo_servico,
      numero_pvop: form.numero_pvop,
      data_servico: form.data_servico || null,
      prestador: form.prestador || null,
      autorizado_por: form.autorizado_por || null,
      itens_voucher: itens,
      valor_total,
      criado_por: currentUser?.nome || 'Sistema',
    }]);
    if (error) { alert('Erro ao salvar: ' + error.message); setSalvando(false); return; }
    setForm({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] });
    setSalvando(false);
    load();
  });

  const excluir = (id) => umaVez('del-' + id, async () => {
    if (!await confirmar('Excluir este voucher?')) return;
    const { error } = await supabase.from('vouchers_servico').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir o voucher: ' + error.message); return; }   // 7.56: o voucher continuava na lista sem aviso nenhum
    load();
  })();

  const imprimirVoucher = (v) => {
    const w = window.open('', '_blank', 'width=800,height=950,scrollbars=yes');
    if (!w) return;
    const fmtVal = (val) => val != null && val !== '' ? `R$ ${Number(val).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
    const fmtDt  = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR') : '—';
    // Suporte a registros antigos (chassi_placa/modelo_carro) e novos (itens_voucher)
    const itens = Array.isArray(v.itens_voucher) && v.itens_voucher.length > 0
      ? v.itens_voucher
      : (v.chassi_placa || v.modelo_carro ? [{ placa_chassi: v.chassi_placa, modelo: v.modelo_carro, valor: v.valor_voucher }] : []);
    const total = v.valor_total != null ? v.valor_total
      : itens.reduce((s,i) => s + (Number(i.valor)||0), 0);
    const itensRows = itens.map((item, idx) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:center;width:36px;color:#64748b">${idx+1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:600">${item.placa_chassi||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px">${item.modelo||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:right;font-weight:700;color:#0f766e">${fmtVal(item.valor)}</td>
    </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Voucher ${v.numero_pvop}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1e293b; padding: 28px; font-size: 12px; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px; }
      .logo { height: 56px; object-fit: contain; }
      .title { text-align: center; flex: 1; padding: 0 16px; }
      .badge { background: #0f766e; color: white; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; }
      .section { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }
      .sec-title { background: #f8fafc; padding: 7px 12px; font-weight: 700; font-size: 11px; color: #0f766e; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: .4px; }
      .info-table { width: 100%; border-collapse: collapse; }
      .info-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
      .info-table td:first-child { width: 150px; font-weight: 600; color: #64748b; }
      .itens-table { width: 100%; border-collapse: collapse; }
      .itens-table thead th { background: #1e293b; color: #cbd5e1; padding: 7px 10px; font-size: 10px; text-align: left; }
      .itens-table thead th:last-child { text-align: right; }
      .total-row td { background: #f0fdf4; padding: 8px 10px; font-weight: 800; font-size: 13px; color: #166534; }
      .footer { border-top: 2px solid #0f766e; padding-top: 10px; margin-top: 16px; display: flex; align-items: center; justify-content: space-between; }
      .footer-text { font-size: 9.5px; color: #64748b; line-height: 1.7; }
      .footer-logo { height: 50px; object-fit: contain; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div class="header">
      <img src="${window.location.origin}${base}logo.svg" class="logo" alt="ACN" onerror="this.style.display='none'" />
      <div class="title">
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;text-transform:uppercase">Voucher de Serviço</div>
        <div style="font-size:20px;font-weight:800;color:#1e293b">${v.numero_pvop}</div>
      </div>
      <span class="badge">VOUCHER</span>
    </div>

    <div class="section">
      <div class="sec-title">Dados do Serviço</div>
      <table class="info-table"><tbody>
        <tr><td>Tipo de Serviço</td><td>${v.tipo_servico || '—'}</td></tr>
        <tr><td>Nº PV / OP</td><td>${v.numero_pvop || '—'}</td></tr>
        <tr><td>Data do Serviço</td><td>${fmtDt(v.data_servico)}</td></tr>
        <tr><td>Prestador</td><td>${v.prestador || '—'}</td></tr>
        <tr><td>Autorizado por</td><td>${v.autorizado_por || '—'}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <div class="sec-title">Veículos / Itens do Serviço</div>
      <table class="itens-table">
        <thead><tr>
          <th style="width:36px;text-align:center">#</th>
          <th>Placa / Chassi</th>
          <th>Modelo</th>
          <th style="text-align:right">Valor do Serviço</th>
        </tr></thead>
        <tbody>${itensRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:11px">Nenhum item</td></tr>'}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3" style="text-align:right">VALOR TOTAL:</td>
            <td style="text-align:right">${fmtVal(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;text-align:center;margin-bottom:14px;font-size:10px;color:#64748b">
      Este voucher é válido para o(s) serviço(s) especificado(s) acima e deve ser apresentado ao prestador no ato da realização.
    </div>

    <div class="footer">
      <div class="footer-text">
        <strong style="color:#0f766e">ACN Sinal Verde</strong><br/>
        Rua Osvaldo Souza, 104 — Aririu, Palhoça - SC — CEP 88135-028<br/>
        (48) 3240-0336 &nbsp;|&nbsp; acn@acn.com.br<br/>
        @ledflex_br &nbsp;|&nbsp; instagram.com/ledflex_br<br/>
        <span style="color:#94a3b8">Emitido em ${new Date().toLocaleString('pt-BR')} por ${v.criado_por || '—'}</span>
      </div>
      <img src="${window.location.origin}${base}motorola.png" class="footer-logo" alt="Motorola" onerror="this.style.display='none'" />
    </div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div>
      {erroTipos && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={loadTipos}>Tentar de novo</Botao>}>
          Não foi possível ler os tipos de serviço ({erroTipos}). A lista de tipos abaixo pode estar vazia ou incompleta por isso.
        </Faixa>
      )}
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={load}>Tentar de novo</Botao>}>
          Não foi possível ler os vouchers ({erroLeitura}). Isso não quer dizer que não haja voucher emitido{vouchers.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}
      {/* FORMULÁRIO */}
      <div className="sec-card acn-prod-v-form">
        <div className="sec-hdr">
          <span className="acn-prod-ic"><Icone path={mdiTicketPercentOutline} size={16} /> Novo Voucher de Serviço</span>
        </div>
        <div className="sec-body acn-form-cheio">
          {/* Campos gerais */}
          <div className="acn-prod-v-grade">
            <div>
              <label className="acn-label">Tipo de Serviço *</label>
              <div className="acn-prod-add">
                <select className="acn-input" value={form.tipo_servico}
                  onChange={e=>setField('tipo_servico',e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tiposServico.map(t => (
                    <option key={t.id} value={t.nome}>{t.nome}</option>
                  ))}
                </select>
                <Botao pequeno variante="primario" icone={mdiPlus} title="Gerenciar tipos de serviço" aria-label="Gerenciar tipos de serviço"
                  onClick={()=>setAddingTipo(a=>!a)} />
              </div>
              {/* Mini-painel para cadastrar novo tipo */}
              {addingTipo && (
                <div className="acn-quadro">
                  <div className="acn-quadro-titulo">
                    Cadastro de Tipos de Serviço
                  </div>
                  {/* Lista dos existentes */}
                  {tiposServico.length > 0 && (
                    <div className="acn-prod-tipos">
                      {tiposServico.map(t => (
                        <span key={t.id} className="acn-prod-tipo">
                          {t.nome}
                          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Remover tipo" onClick={()=>excluirTipo(t.id)} />
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="acn-prod-add">
                    <input className="acn-input" value={novoTipo}
                      onChange={e=>setNovoTipo(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&salvarTipo()}
                      placeholder="Nome do novo tipo..." autoFocus />
                    <Botao pequeno variante="primario" onClick={salvarTipo} disabled={salvandoTipo||!novoTipo.trim()}>
                      {salvandoTipo?'...':'Salvar'}
                    </Botao>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="acn-label">Nº PV / OP *</label>
              <input className="acn-input" value={form.numero_pvop}
                onChange={e=>setField('numero_pvop',e.target.value)} placeholder="Ex: PV-2024-001" />
            </div>
            <div>
              <label className="acn-label">Data do Serviço</label>
              <input type="date" className="acn-input" value={form.data_servico}
                onChange={e=>setField('data_servico',e.target.value)} />
            </div>
            <div>
              <label className="acn-label">Prestador do Serviço</label>
              <input className="acn-input" value={form.prestador}
                onChange={e=>setField('prestador',e.target.value)} placeholder="Nome do prestador..." />
            </div>
            <div>
              <label className="acn-label">Autorizado por</label>
              <input className="acn-input" value={form.autorizado_por}
                onChange={e=>setField('autorizado_por',e.target.value)} placeholder="Nome do autorizador..." />
            </div>
          </div>

          {/* Tabela de itens */}
          <div className="acn-quadro-titulo">
            Veículos / Itens do Serviço
          </div>
          <VoucherItemTable itens={form.itens} setItens={setItens} />

          <div className="acn-acoes-linha acn-prod-v-acoes">
            <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Voucher'}
            </Botao>
            <Botao onClick={()=>setForm({ ...VOUCHER_VAZIO, itens:[{ ...ITEM_VOUCHER_VAZIO }] })}>
              Limpar
            </Botao>
          </div>
        </div>
      </div>

      {/* LISTA DE VOUCHERS */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-prod-ic"><Icone path={mdiFolderOutline} size={16} /> Vouchers Emitidos ({vouchers.length})</span>
          <Botao pequeno icone={mdiRefresh} aria-label="Atualizar" onClick={load} />
        </div>
        <div className="sec-body acn-rolagem acn-prod-tabela">
          {loading ? <div className="acn-empty">Carregando...</div> : vouchers.length === 0 ? (
            <div className="acn-empty">{erroLeitura ? 'Leitura falhou — veja o aviso acima.' : 'Nenhum voucher emitido ainda.'}</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Nº PV/OP</th><th>Tipo</th><th>Veículos</th>
                <th>Valor Total</th><th>Data</th><th>Prestador</th><th>Autorizado por</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {vouchers.map(v => {
                  const itens = Array.isArray(v.itens_voucher) ? v.itens_voucher : [];
                  const total = v.valor_total != null ? v.valor_total
                    : (v.valor_voucher != null ? v.valor_voucher
                    : itens.reduce((s,i) => s+(Number(i.valor)||0), 0));
                  return (
                    <tr key={v.id}>
                      <td><strong className="acn-forte acn-prod-os-num">{v.numero_pvop}</strong></td>
                      <td>{v.tipo_servico}</td>
                      <td className="acn-fraco">
                        {itens.length > 0
                          ? itens.map(i => i.placa_chassi || i.modelo || '—').filter(Boolean).join(', ')
                          : (v.chassi_placa || v.modelo_carro || '—')}
                      </td>
                      <td className="acn-num acn-forte">
                        {total != null ? `R$ ${Number(total).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                      </td>
                      <td className="acn-num">{v.data_servico ? new Date(v.data_servico+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>{v.prestador || '—'}</td>
                      <td>{v.autorizado_por || '—'}</td>
                      <td>
                        <div className="acn-acoes-linha">
                          <Botao pequeno icone={mdiPrinterOutline} onClick={()=>imprimirVoucher(v)}>Imprimir</Botao>
                          <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} aria-label="Excluir" title="Excluir voucher" onClick={()=>excluir(v.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO DE EQUIPES DE PRODUÇÃO
// ─────────────────────────────────────────────────────────────────────────────
function EquipesSection({ currentUser }) {
  const { list: colabs } = useColaboradores();
  const [equipes, setEquipes]   = useState<any[]>([]);
  const [modal, setModal]       = useState<'nova'|'editar'|null>(null);
  const [editando, setEditando] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const FORM_VAZIO = { nome:'', head_line_id:'', head_line_nome:'', membros:[] as any[] };
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [membroAdd, setMembroAdd] = useState('');

  // Etapa 7.56 (06/10/2026): leitura que falha não pode parecer "Nenhuma equipe cadastrada" (a lista na tela fica); salvar e excluir
  // ignoravam o erro e fechavam a janela; e um clique duplo em "Criar equipe" criava duas equipes iguais — uma ação por tipo.
  const [erroLeitura, setErroLeitura] = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const load = async () => {
    const { data, error } = await supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome');
    if (error) { setErroLeitura(error.message); return; }
    setErroLeitura('');
    setEquipes(data || []);
  };
  useEffect(() => { load(); }, []);

  const abrirNova = () => { setForm({ ...FORM_VAZIO }); setEditando(null); setModal('nova'); };
  const abrirEditar = (eq: any) => {
    setForm({ nome: eq.nome, head_line_id: eq.head_line_id || '', head_line_nome: eq.head_line_nome, membros: eq.membros || [] });
    setEditando(eq);
    setModal('editar');
  };

  const salvar = umaVez('salvar', async () => {
    if (!form.nome.trim() || !form.head_line_nome.trim()) { alert('Informe nome da equipe e Head Line.'); return; }
    setSalvando(true);
    const payload = {
      nome: form.nome.trim(),
      head_line_id: form.head_line_id || null,
      head_line_nome: form.head_line_nome.trim(),
      membros: form.membros,
      ativa: true,
    };
    const { error } = editando
      ? await supabase.from('producao_equipes').update(payload).eq('id', editando.id)
      : await supabase.from('producao_equipes').insert([payload]);
    if (error) { alert(`Não foi possível salvar a equipe: ${error.message}`); setSalvando(false); return; }   // 7.56: fechava a janela e a equipe não existia
    setSalvando(false); setModal(null); setEditando(null); load();
  });

  const excluir = (eq: any) => umaVez('del-' + eq.id, async () => {
    if (!await confirmar(`Excluir equipe "${eq.nome}"?`)) return;
    const { error } = await supabase.from('producao_equipes').update({ ativa: false }).eq('id', eq.id);
    if (error) { alert(`Não foi possível excluir a equipe "${eq.nome}": ${error.message}`); return; }   // 7.56
    load();
  })();

  const addMembro = () => {
    const nome = membroAdd.trim();
    if (!nome) return;
    const colab = colabs.find(c => c.nome === nome);
    if (form.membros.some(m => m.nome === nome)) return;
    setForm(f => ({ ...f, membros: [...f.membros, { id: colab?.id || null, nome }] }));
    setMembroAdd('');
  };

  const remMembro = (nome: string) => setForm(f => ({ ...f, membros: f.membros.filter(m => m.nome !== nome) }));

  return (
    <div>
      <div className="acn-prod-eq-topo">
        <div className="acn-forte acn-prod-ic"><Icone path={mdiTagOutline} size={16} /> Equipes de Produção</div>
        <Botao variante="primario" icone={mdiPlus} onClick={abrirNova}>Nova Equipe</Botao>
      </div>

      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>
          Não foi possível ler as equipes ({erroLeitura}). Isso não quer dizer que não haja equipe cadastrada{equipes.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}
      {equipes.length === 0 ? (
        <div className="acn-empty">{erroLeitura ? 'Leitura falhou — veja o aviso acima.' : 'Nenhuma equipe cadastrada.'}</div>
      ) : (
        <div className="acn-prod-eq-lista">
          {equipes.map(eq => (
            <div key={eq.id} className="acn-prod-eq-card">
              <div className="acn-prod-eq-corpo">
                <div className="acn-forte">{eq.nome}</div>
                <div className="acn-ajuda acn-prod-ic">
                  <Icone path={mdiCrownOutline} size={13} /> Head Line: <strong>{eq.head_line_nome}</strong>
                </div>
                {(eq.membros || []).length > 0 && (
                  <div className="acn-prod-tipos">
                    {(eq.membros || []).map((m: any) => (
                      <span key={m.nome} className="acn-prod-membro-tag">
                        <Icone path={mdiAccount} size={12} /> {m.nome}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="acn-acoes-linha">
                <Botao pequeno icone={mdiPencilOutline} onClick={() => abrirEditar(eq)}>Editar</Botao>
                <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} aria-label="Excluir" title="Excluir equipe" onClick={() => excluir(eq)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL EQUIPE */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-obs" role="dialog" aria-label={modal === 'nova' ? 'Nova equipe' : 'Editar equipe'}>
            <div className="acn-modal-cab">
              <span className="modal-title">{modal === 'nova' ? 'Nova Equipe' : 'Editar Equipe'}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="form-group">
                <label className="acn-label">Nome da Equipe *</label>
                <input className="acn-input"
                  value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Equipe Alpha" />
              </div>

              <div className="form-group">
                <label className="acn-label">Head Line (Técnico Responsável) *</label>
                <ColaboradorSelect
                  value={form.head_line_nome}
                  onChange={nome => { const c = colabs.find(x => x.nome === nome); setForm(f => ({ ...f, head_line_nome: nome, head_line_id: c?.id || '' })); }}
                  placeholder="Selecione o técnico líder"
                  className="acn-input" />
              </div>

              <div className="form-group">
                <label className="acn-label">Membros da Equipe</label>
                <div className="acn-prod-add">
                  <ColaboradorSelect
                    value={membroAdd}
                    onChange={v => setMembroAdd(v)}
                    placeholder="Adicionar técnico..."
                    className="acn-input" />
                  <Botao pequeno variante="primario" icone={mdiPlus} onClick={addMembro}>Adicionar</Botao>
                </div>
              </div>
              {form.membros.length > 0 && (
                <div className="acn-quadro acn-prod-tipos">
                  {form.membros.map(m => (
                    <span key={m.nome} className="acn-prod-membro-tag">
                      <Icone path={mdiAccount} size={12} /> {m.nome}
                      <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Remover membro" onClick={() => remMembro(m.nome)} />
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : modal === 'nova' ? 'Criar Equipe' : 'Salvar Alterações'}
              </Botao>
              <Botao onClick={() => setModal(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Importação em lote de Técnico(s)/Equipe por OP desmembrada (Adaptação) ──
// Cola do Excel (Ctrl+C/Ctrl+V): cada linha identifica a OP pelo chassi e/ou
// placa (já cadastrados nela) e traz o nome do responsável — que pode ser um
// técnico (individual), "Técnico A + Técnico B" (dupla) ou o nome de uma
// equipe já cadastrada (🏷️ Equipes). Não depende da ordem das linhas: casa
// sempre pelo chassi/placa já vinculado à OP, nunca por posição.
const REGEX_PLACA_PROD = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/i;

function resolverResponsavel(texto, equipesList, colaboradoresList) {
  const t = (texto || '').trim();
  if (!t) return null;
  const norm = (s) => s.trim().toUpperCase();
  // Dupla: "Fulano + Beltrano" ou "Fulano / Beltrano"
  if (/[+/]/.test(t)) {
    const partes = t.split(/[+/]/).map(p => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
      const c1 = colaboradoresList.find(c => norm(c.nome) === norm(partes[0]));
      const c2 = colaboradoresList.find(c => norm(c.nome) === norm(partes[1]));
      if (c1 && c2) return { modo: 'dupla', nome: c1.nome, id: c1.id, nome2: c2.nome, id2: c2.id };
    }
  }
  // Nome exato de equipe cadastrada sempre ganha (ex: "Head Line Tiago").
  const eqPorNome = equipesList.find(e => norm(e.nome) === norm(t));
  if (eqPorNome) return { modo: 'equipe', equipe: eqPorNome };
  // Nome de um técnico individual ganha do head_line_nome de uma equipe —
  // "JUNIOR" sozinho deve virar técnico individual, não a equipe dele.
  const c = colaboradoresList.find(x => norm(x.nome) === norm(t));
  if (c) return { modo: 'individual', nome: c.nome, id: c.id };
  // Só cai pra equipe pelo head_line_nome se não bateu como técnico —
  // cobre o caso de o head line não estar cadastrado em rh_funcionarios.
  const eqPorHead = equipesList.find(e => norm(e.head_line_nome) === norm(t));
  if (eqPorHead) return { modo: 'equipe', equipe: eqPorHead };
  return null;
}

function calcularPlanoImportacaoTecnicos(linhasRaw, irmaos, equipesList, colaboradoresList) {
  const linhas = linhasRaw.map(l => l.trim()).filter(Boolean);
  const plano = [];
  const naoReconhecidas = [];
  for (const linha of linhas) {
    const partes = linha.split(/\t|;/).map(p => p.trim()).filter(Boolean);
    if (partes.length < 2) { naoReconhecidas.push({ linha, motivo: 'linha incompleta (faltou chassi/placa ou responsável)' }); continue; }
    const respTexto = partes[partes.length - 1];
    const chaves = partes.slice(0, -1);
    const alvo = irmaos.find(o =>
      chaves.some(k => (o.chassi && o.chassi.trim().toUpperCase() === k.trim().toUpperCase()) ||
                        (o.placa  && o.placa.trim().toUpperCase()  === k.trim().toUpperCase())));
    if (!alvo) { naoReconhecidas.push({ linha, motivo: `nenhuma OP do lote tem chassi/placa "${chaves.join(' / ')}"` }); continue; }
    const resp = resolverResponsavel(respTexto, equipesList, colaboradoresList);
    if (!resp) { naoReconhecidas.push({ linha, motivo: `"${respTexto}" não é um técnico nem equipe cadastrada` }); continue; }
    plano.push({ alvo, resp, respTexto });
  }
  return { plano, naoReconhecidas };
}

function ModalImportarTecnicosEquipe({ base, irmaos, equipes, colaboradoresList, currentUser, onClose, onImportado }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // Etapa 7.56 (06/10/2026): um clique duplo em "Confirmar e aplicar" rodava o lote duas vezes (dois históricos por OP).
  const aplicando = useRef(false);

  const { plano, naoReconhecidas } = calcularPlanoImportacaoTecnicos(texto.split('\n'), irmaos, equipes, colaboradoresList);

  const confirmar = async () => {
    if (aplicando.current) return;
    aplicando.current = true;
    setSalvando(true);
    let ok = 0, falhas = 0, naoTentadas = 0, motivo = '';
    const pendencias = [];
    const agora = new Date().toISOString();
    for (const { alvo, resp } of plano) {
      let upd = { modo_execucao: resp.modo };
      if (resp.modo === 'individual') {
        upd = { ...upd, responsavel_producao: resp.nome, tecnico_producao_id: resp.id,
                 tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      } else if (resp.modo === 'dupla') {
        upd = { ...upd, responsavel_producao: resp.nome, tecnico_producao_id: resp.id,
                 tecnico_producao_2_nome: resp.nome2, tecnico_producao_2_id: resp.id2, equipe_id: null, equipe_nome: null };
      } else if (resp.modo === 'equipe') {
        upd = { ...upd, responsavel_producao: resp.equipe.head_line_nome, tecnico_producao_id: resp.equipe.head_line_id || null,
                 equipe_id: resp.equipe.id, equipe_nome: resp.equipe.nome, tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      }
      // Só inicia a produção (status + data) se ainda não tinha começado —
      // reatribuir uma OP já em produção não mexe no status nem reinicia o KPI.
      if (alvo.status_geral === 'Aguardando Inicio Producao') {
        upd.status_geral = 'Em Producao';
        upd.data_inicio_producao = agora;
      }
      const { error } = await supabase.from('oples').update(upd).eq('id', alvo.id);
      // 7.56: o lote passava para as OPs seguintes depois de uma falha; agora para na primeira que não grava e diz até onde foi.
      if (error) { falhas++; motivo = `${alvo.opl}: ${error.message}`; naoTentadas = plano.length - ok - falhas; break; }
      ok++;
      const seed = [
        upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.responsavel_producao } : null,
        upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
      ].filter(Boolean);
      if (seed.length > 0) {
        const { error: erroSeed } = await inserirResponsaveisSemRepetir(seed.map(r => ({
          tipo: 'op', referencia_id: alvo.id, papel: 'responsavel',
          tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
          adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
        })));
        if (erroSeed) pendencias.push(`${alvo.opl}: lista de responsáveis não gravada (${erroSeed.message})`);
      }
      const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: alvo.id, numero_opl: alvo.opl, setor: 'Producao',
        evento: `Responsável definido via importação em lote — ${upd.responsavel_producao}${upd.equipe_nome ? ` (Equipe ${upd.equipe_nome})` : ''}${upd.tecnico_producao_2_nome ? ` + ${upd.tecnico_producao_2_nome}` : ''}.`,
        status_anterior: alvo.status_geral, status_novo: upd.status_geral || alvo.status_geral,
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
      if (erroLog) pendencias.push(`${alvo.opl}: histórico não gravado (${erroLog.message})`);
    }
    aplicando.current = false;
    setSalvando(false);
    setResultado({ ok, falhas, naoTentadas, motivo, pendencias });
    onImportado();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-prod-larga acn-prod-larguissima" role="dialog" aria-label="Importar técnicos e equipes">
        <div className="acn-modal-cab">
          <span className="modal-title acn-prod-ic"><Icone path={mdiTrayArrowDown} size={16} /> Importar Técnicos/Equipes — {base === 'Seleção' ? <><Icone path={mdiCheckboxMarkedOutline} size={14} /> Seleção</> : <><Icone path={mdiLinkVariant} size={14} /> {base}</>}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            {irmaos.length} unidade(s) {base === 'Seleção' ? 'selecionada(s)' : 'neste lote'}. Cole do Excel (Ctrl+C na planilha, Ctrl+V aqui) — cada linha:
            <strong> Chassi (ou Placa) [tab] Responsável</strong>, ou <strong>Chassi [tab] Placa [tab] Responsável</strong>.
            Responsável pode ser um técnico, "Técnico A + Técnico B" (dupla) ou o nome de uma equipe cadastrada.
            O casamento é sempre pelo chassi/placa já vinculado à OP, nunca pela ordem das linhas.
          </div>

          <textarea className="acn-input acn-mono acn-prod-colar" rows={5}
            placeholder={'Ex:\n9BW1234567890\tJUNIOR\nABC1D23\tHead Line Tiago\n9BW...\tFELIPE + JONATAN'}
            value={texto} onChange={e => setTexto(e.target.value)} />

          {texto.trim() && !resultado && (
            <div className="acn-prod-previa-bloco">
              <div className="acn-forte">
                Prévia — {plano.length} serão aplicadas, {naoReconhecidas.length} sem correspondência.
              </div>
              {plano.length > 0 && (
                <div className="acn-rolagem acn-prod-previa">
                  <table className="acn-tabela acn-densa">
                    <thead>
                      <tr>
                        <th>OP destino</th>
                        <th>Responsável</th>
                        <th>Modo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.map(({ alvo, resp, respTexto }, i) => (
                        <tr key={i}>
                          <td className="acn-forte">{alvo.opl}</td>
                          <td>{respTexto}</td>
                          <td>
                            <Selo familia={resp.modo === 'equipe' ? 'marca' : 'info'} ponto={false}>
                              <Icone path={resp.modo === 'equipe' ? mdiTagOutline : resp.modo === 'dupla' ? mdiAccountMultipleOutline : mdiAccount} size={12} /> {resp.modo === 'equipe' ? 'Equipe' : resp.modo === 'dupla' ? 'Dupla' : 'Individual'}
                            </Selo>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {naoReconhecidas.length > 0 && (
                <div className="acn-quadro tom-erro">
                  {naoReconhecidas.map((n, i) => <div key={i} className="acn-txt-erro acn-prod-ic"><Icone path={mdiAlertOutline} size={12} /> "{n.linha}" — {n.motivo}</div>)}
                </div>
              )}
            </div>
          )}

          {resultado && (
            <Faixa tom="ok">
              {resultado.ok} unidade(s) atualizada(s){resultado.falhas ? `, ${resultado.falhas} falha(s)` : ''}.
            </Faixa>
          )}
          {resultado && resultado.falhas > 0 && (
            <Faixa tom="erro">
              O lote parou na primeira OP que não gravou ({resultado.motivo}). {resultado.naoTentadas} OP(s) não foram tentadas e continuam como estavam.
            </Faixa>
          )}
          {resultado && resultado.pendencias?.length > 0 && (
            <Faixa tom="atencao">
              Atualizadas, mas com pendência: {resultado.pendencias.join(' · ')}. Use "Equipe" no menu da OP para conferir.
            </Faixa>
          )}
        </div>

        <div className="acn-modal-rodape acn-sac-rodape">
          {texto.trim() && !resultado && (
            <Botao variante="primario" icone={mdiCheck} disabled={salvando || plano.length === 0} onClick={confirmar}>
              {salvando ? 'Aplicando...' : `Confirmar e aplicar (${plano.length})`}
            </Botao>
          )}
          <Botao onClick={onClose}>
            {resultado ? 'Fechar' : 'Cancelar'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

export default function ProducaoTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [loading, setLoading] = useState(false);
  const { list: colaboradoresList } = useColaboradores();

  // Filtros da lista de Produção
  const [filtroBusca, setFiltroBusca]     = useState('');
  // Fila padrão = Adaptação: quem trabalha aqui abre a tela e vê só o que de
  // fato é adaptado. Fabricação e Envio ficam em abas próprias.
  const [filaAtiva, setFilaAtiva]         = useState<'adaptacao'|'fabricacao'|'envio'|'serralheria'|'todas'>('adaptacao');
  const [visao, setVisao]                 = useState<'tabela'|'kanban'>('tabela');

  // Prioridade e so desempate entre OPs do MESMO dia (definicao do usuario):
  // a data manda, porque e contratual por causa das licitacoes.
  const definirPrioridade = async (opl: any) => {
    const atual = opl.prioridade_dia == null ? '' : String(opl.prioridade_dia);
    const dia = opl.data_prevista_entrega
      ? opl.data_prevista_entrega.split('-').reverse().join('/')
      : 'sem prazo';
    const txt = await pedirTexto(
      'Prioridade de ' + opl.opl + ' no dia ' + dia + ':' + '\n\n'
      + 'Menor numero vem primeiro (1 = primeira). Deixe vazio para tirar a prioridade.' + '\n'
      + 'Isso so muda a ordem entre OPs que vencem no mesmo dia.', atual);
    if (txt === null) return;
    const limpo = txt.trim();
    let valor: number | null = null;
    if (limpo !== '') {
      valor = parseInt(limpo, 10);
      if (!Number.isFinite(valor) || valor < 1 || valor > 99) { alert('Informe um numero de 1 a 99, ou deixe vazio.'); return; }
    }
    const { error } = await supabase.from('oples').update({ prioridade_dia: valor }).eq('id', opl.id);
    if (error) { alert('Não foi possível gravar a prioridade: ' + error.message); return; }   // Etapa 7.54 (06/10/2026)
    fetchAll(true);
  };
  const [filtroStatus, setFiltroStatus]   = useState('Todos');
  const [filtroTecnico, setFiltroTecnico] = useState('Todos');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEntregaDe, setFiltroEntregaDe]   = useState('');
  const [filtroEntregaAte, setFiltroEntregaAte] = useState('');
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [modalImportarLoteProducao, setModalImportarLoteProducao] = useState<any>(null); // { base, irmaos }
  // Seleção livre por checkbox (não precisa ser do mesmo lote/base) — pra
  // ação em massa: iniciar produção e/ou atribuir técnicos/equipes de uma vez.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const toggleSelecionar = (id: string) => setSelecionados(prev => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const [aplicandoIniciarLote, setAplicandoIniciarLote] = useState(false);
  const [modalDevolver, setModalDevolver] = useState(null);
  const [modalVerOpl, setModalVerOpl]     = useState<any>(null);
  const [modalAcomp,  setModalAcomp]      = useState<any>(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [respNome, setRespNome] = useState('');
  const [respId, setRespId] = useState<string|null>(null);
  // Dupla / Equipe
  const [modoExecucao, setModoExecucao] = useState<'individual'|'dupla'|'equipe'>('individual');
  const [respNome2, setRespNome2] = useState('');
  const [respId2, setRespId2] = useState<string|null>(null);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [equipeSel, setEquipeSel] = useState<any>(null);
  // Editar responsável
  const [modalEditResp, setModalEditResp] = useState<any>(null);
  const [editModo, setEditModo] = useState<'individual'|'dupla'|'equipe'>('individual');
  const [editResp1Nome, setEditResp1Nome] = useState('');
  const [editResp1Id, setEditResp1Id] = useState<string|null>(null);
  const [editResp2Nome, setEditResp2Nome] = useState('');
  const [editResp2Id, setEditResp2Id] = useState<string|null>(null);
  const [editEquipeSel, setEditEquipeSel] = useState<any>(null);
  // Gerenciar equipe (responsáveis/apoios livres pós-início)
  const [modalGerenciarEquipe, setModalGerenciarEquipe] = useState<any>(null);

  // Deep-link vindo de um chip de vínculo (VinculoPicker.tsx) ou de qualquer
  // outro lugar que aponte pra uma OP — abre o OplDetalheModal direto, mesmo
  // padrão já usado em SacTab.tsx/ComprasTab.tsx pros contextos 'sac'/'compra'.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'op') return;
      (window as any).__acnDeepLink = null;
      supabase.from('oples').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalVerOpl(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchEquipes();
    const t = setInterval(()=>fetchAll(true), 30000);
    return () => clearInterval(t);
  }, []);

  // Etapa 7.54 (06/10/2026): leitura que falha não pode parecer "Nenhuma OP em produção" nem "Nenhuma equipe cadastrada" (e a de 30 s
  // que falhar não esvazia a fila); e um clique duplo em iniciar/concluir/devolver gravava duas vezes — uma ação por OP e tipo.
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroEquipes, setErroEquipes] = useState('');
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase.from('oples').select('*')
      .in('status_geral', ['Aguardando Inicio Producao', 'Em Producao', 'Retrabalho', 'Em Retrabalho'])
      .order('data_entrada', { ascending: false });
    if (error) { setErroLeitura(error.message); if (!silent) setLoading(false); return; }
    setErroLeitura('');
    setOpls(data || []);
    if (!silent) setLoading(false);
  };

  const fetchEquipes = async () => {
    const { data, error } = await supabase.from('producao_equipes').select('*').eq('ativa', true).order('nome');
    if (error) { setErroEquipes(error.message); return; }
    setErroEquipes('');
    setEquipes(data || []);
  };

  const iniciarProducao = umaVez('iniciar-modal', async () => {
    const opl = modalIniciar;
    const agora = new Date().toISOString();
    let upd: any = { status_geral: 'Em Producao', data_inicio_producao: agora, modo_execucao: modoExecucao,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0 };
    let logResp = '';

    if (modoExecucao === 'individual') {
      const resp = respNome || currentUser?.nome;
      upd = { ...upd, responsavel_producao: resp, tecnico_producao_id: respId || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      logResp = resp;
    } else if (modoExecucao === 'dupla') {
      if (!respNome || !respNome2) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, responsavel_producao: respNome, tecnico_producao_id: respId || null,
               tecnico_producao_2_nome: respNome2, tecnico_producao_2_id: respId2 || null,
               equipe_id: null, equipe_nome: null };
      logResp = `${respNome} + ${respNome2}`;
    } else if (modoExecucao === 'equipe') {
      if (!equipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, responsavel_producao: equipeSel.head_line_nome,
               tecnico_producao_id: equipeSel.head_line_id || null,
               equipe_id: equipeSel.id, equipe_nome: equipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      logResp = `Equipe ${equipeSel.nome} (Head: ${equipeSel.head_line_nome})`;
    }

    // 7.54: se a OP não gravar, a janela fica aberta com o que foi escolhido (antes fechava como se tivesse iniciado)
    if (!await aplicarInicio(opl, upd, logResp, agora)) return;
    setModalIniciar(null); setRespNome(''); setRespId(null); setRespNome2(''); setRespId2(null);
    setModoExecucao('individual'); setEquipeSel(null);
  });

  // Grava o início da produção. Existe separado porque duas portas levam aqui:
  // o botão INICIAR (1 clique, individual) e o modal de dupla/equipe. Uma
  // função só evita que as duas portas gravem coisas diferentes.
  const aplicarInicio = async (opl: any, upd: any, logResp: string, agora: string) => {
    const { error: erroIni } = await supabase.from('oples').update(upd).eq('id', opl.id);
    // 7.54: gravação recusada seguia como se a produção tivesse começado (sem responsável semeado, sem recado e sem aviso)
    if (erroIni) { alert(`Não foi possível iniciar a produção da OP ${opl.opl}: ${erroIni.message}`); return false; }
    logChange({ module: 'producao', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral, responsavel_producao: opl.responsavel_producao },
      newRow: { status_geral: upd.status_geral, responsavel_producao: upd.responsavel_producao }, user: currentUser });
    // Semeia a lista livre de responsáveis (responsaveis_producao) com quem foi
    // definido ao iniciar — daqui pra frente essa lista é editável livremente
    // via "👥 Equipe", sem mexer mais nesses campos legados.
    const seedResponsaveis = [
      upd.tecnico_producao_id ? { tecnico_id: upd.tecnico_producao_id, tecnico_nome: upd.responsavel_producao } : null,
      upd.tecnico_producao_2_id ? { tecnico_id: upd.tecnico_producao_2_id, tecnico_nome: upd.tecnico_producao_2_nome } : null,
    ].filter(Boolean);
    if (seedResponsaveis.length > 0) {
      const { error: erroSeed } = await inserirResponsaveisSemRepetir(seedResponsaveis.map((r:any) => ({
        tipo: 'op', referencia_id: opl.id, papel: 'responsavel',
        tecnico_id: r.tecnico_id, tecnico_nome: r.tecnico_nome,
        adicionado_por: currentUser?.email, adicionado_por_nome: currentUser?.nome,
      })));
      if (erroSeed) alert('A produção foi iniciada, mas a lista de responsáveis da OP não foi gravada (' + erroSeed.message + '). Use "Equipe" no menu da OP para incluí-los.');
    }
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Inicio da producao. Responsavel: ${logResp}`,
      status_anterior: opl.status_geral, status_novo: 'Em Producao',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    if (erroLog) alert('A produção foi iniciada, mas o histórico de movimentação não foi gravado: ' + erroLog.message);
    await registrarAndamento(opl, `Produção iniciada. Responsável: ${logResp}.`);
    fetchAll();
    return true;
  };

  // INICIAR em 1 clique: assume execução individual com quem clicou. Era um
  // modal com 3 modos + seleção de técnico para toda OP, e o resultado prático
  // disso foi 82 das 89 OPs da fila sem responsável nenhum — o caminho caro
  // não estava sendo percorrido. Quem trabalha em dupla ou equipe usa o botão
  // 👥 ao lado, e trocar depois continua possível por ✏️ RESP. / 👥 EQUIPE.
  const iniciarRapido = (opl: any) => umaVez('iniciar-' + opl.id, async () => {
    const agora = new Date().toISOString();
    const resp = currentUser?.nome || 'Não informado';
    // tecnico_producao_id aponta para `colaboradores`, NÃO para o usuário
    // logado — é o mesmo id que o ColaboradorSelect do modal grava. Quem tem
    // login mas não é colaborador cadastrado fica sem id, e é isso mesmo: o
    // nome, que é o que a tela mostra, continua gravado.
    const colab = colaboradoresList.find((c: any) => c.nome === currentUser?.nome);
    await aplicarInicio(opl, {
      status_geral: 'Em Producao', data_inicio_producao: agora, modo_execucao: 'individual',
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
      responsavel_producao: resp, tecnico_producao_id: colab?.id || null,
      tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null,
    }, resp, agora);
  })();

  // Inicia produção de todas as selecionadas de uma vez, sem definir
  // responsável ainda (fica "Em Producao" sem técnico) — o usuário atribui
  // depois via "📥 Importar Técnicos/Equipes" na mesma seleção. Só afeta as
  // que ainda estão "Aguardando Inicio Producao"; ignora as demais.
  const iniciarProducaoEmLote = async () => {
    const alvos = opls.filter((o: any) => selecionados.has(o.id) && o.status_geral === 'Aguardando Inicio Producao');
    if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está "Aguardando Início Produção".'); return; }
    if (!await confirmar(`Iniciar produção de ${alvos.length} OP(s) selecionada(s)? Você atribui o técnico/equipe depois, na mesma seleção.`)) return;
    setAplicandoIniciarLote(true);
    const agora = new Date().toISOString();
    let iniciadas = 0;
    for (const opl of alvos) {
      const { error: erroLote } = await supabase.from('oples').update({ status_geral: 'Em Producao', data_inicio_producao: agora,
        pausado: false, data_pausa: null, tempo_pausado_horas: 0 }).eq('id', opl.id);
      // 7.54: para na primeira que não grava e diz até onde foi (antes seguia, e gravava o histórico de uma OP que não mudou)
      if (erroLote) { alert(`Não foi possível iniciar a OP ${opl.opl}: ${erroLote.message}\n\nO lote parou aqui: ${iniciadas} OP(s) foram iniciadas e as demais continuam como estavam.`); break; }
      iniciadas++;
      await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
        evento: 'Início da produção em lote (ação em massa por seleção) — responsável a definir.',
        status_anterior: opl.status_geral, status_novo: 'Em Producao',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
    }
    setAplicandoIniciarLote(false);
    setSelecionados(new Set());
    fetchAll();
  };

  // Libera para CQ todas as selecionadas que estão "Em Producao" de uma vez
  // — mesmo cálculo de tempo de produção do botão individual "LIB. CQ".
  const liberarChecklistEmLote = async () => {
    const alvos = opls.filter((o: any) => selecionados.has(o.id) && o.status_geral === 'Em Producao');
    if (alvos.length === 0) { alert('Nenhuma das OPs selecionadas está "Em Produção".'); return; }
    if (!await confirmar(`Liberar ${alvos.length} OP(s) selecionada(s) para o CQ?`)) return;
    setAplicandoIniciarLote(true);
    let liberadas = 0;
    for (const opl of alvos) {
      // 7.54: para na primeira que não libera (o aviso do motivo já foi dado por liberarChecklist)
      if (!await liberarChecklist(opl)) { if (liberadas < alvos.length) alert(`O lote parou na OP ${opl.opl}: ${liberadas} OP(s) foram liberadas para o CQ e as demais continuam como estavam.`); break; }
      liberadas++;
    }
    setAplicandoIniciarLote(false);
    setSelecionados(new Set());
  };

  const editarResponsavel = umaVez('editar-resp', async () => {
    const opl = modalEditResp;
    if (!opl) return;
    const agora = new Date().toISOString();
    let upd: any = { modo_execucao: editModo };
    let logResp = '';

    if (editModo === 'individual') {
      if (!editResp1Nome) { alert('Informe o técnico.'); return; }
      upd = { ...upd, responsavel_producao: editResp1Nome, tecnico_producao_id: editResp1Id || null,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null, equipe_id: null, equipe_nome: null };
      logResp = editResp1Nome;
    } else if (editModo === 'dupla') {
      if (!editResp1Nome || !editResp2Nome) { alert('Informe os dois técnicos.'); return; }
      upd = { ...upd, responsavel_producao: editResp1Nome, tecnico_producao_id: editResp1Id || null,
               tecnico_producao_2_nome: editResp2Nome, tecnico_producao_2_id: editResp2Id || null,
               equipe_id: null, equipe_nome: null };
      logResp = `${editResp1Nome} + ${editResp2Nome}`;
    } else if (editModo === 'equipe') {
      if (!editEquipeSel) { alert('Selecione uma equipe.'); return; }
      upd = { ...upd, responsavel_producao: editEquipeSel.head_line_nome,
               tecnico_producao_id: editEquipeSel.head_line_id || null,
               equipe_id: editEquipeSel.id, equipe_nome: editEquipeSel.nome,
               tecnico_producao_2_nome: null, tecnico_producao_2_id: null };
      logResp = `Equipe ${editEquipeSel.nome} (Head: ${editEquipeSel.head_line_nome})`;
    }

    const { error: erroResp } = await supabase.from('oples').update(upd).eq('id', opl.id);
    if (erroResp) { alert('Não foi possível alterar o responsável: ' + erroResp.message); return; }   // 7.54
    logChange({ module: 'producao', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { responsavel_producao: opl.responsavel_producao }, newRow: { responsavel_producao: upd.responsavel_producao }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Responsavel alterado para: ${logResp}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalEditResp(null); fetchAll();
  });

  // Equipe da OP (responsáveis, apoios e serralheria): a janela mora em EquipeDaOp.tsx desde 30/09/2026,
  // para a Produção, o Fiscal e o detalhe da OP usarem a mesma e a correção valer até o Fiscal faturar.

  const liberarChecklist = (opl) => umaVez('chk-' + opl.id, liberarChecklistReal)(opl);
  const liberarChecklistReal = async (opl) => {
    // A adaptação não fecha a sua etapa com peça de fabricação/compra em aberto:
    // a demanda tem que estar concluída no setor, recebida pelo Almoxarifado e
    // liberada pelo PCP (as três etapas do checklist — ver OpPendencias.tsx).
    const { abertas } = await carregarPendencias(opl);
    if (abertas.length) {
      alert(`Não dá para concluir esta OP: ${abertas.length} pendência(s) de fabricação/compra ainda não fecharam.\n\n${abertas.map(v => `• ${v.setor || '—'}: ${v.titulo}`).join('\n')}\n\nCada uma precisa ser concluída no setor, recebida pelo Almoxarifado e liberada pelo PCP.`);
      return false;
    }
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_producao ? new Date(opl.data_inicio_producao) : null;
    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : null;
    const { error: erroChk } = await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      data_conclusao_producao: agora,
      data_entrada_cq: agora,
      tempo_producao_horas: tempo,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
    }).eq('id', opl.id);
    // 7.54: gravação recusada seguia como "Produção concluída": avisava o CQ e o vendedor com a OP ainda em produção
    if (erroChk) { alert(`Não foi possível liberar a OP ${opl.opl} para o CQ: ${erroChk.message}`); return false; }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Producao concluida. Liberado para CQ. Tempo: ${tempo ? tempo.toFixed(1) + 'h' : '—'}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando CQ',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('producao_finaliza', msg.producaoFinalizada(opl.opl, currentUser?.nome));
    await registrarAndamento(opl, 'Produção concluída. OP liberada para o Controle de Qualidade.');
    fetchAll();
    return true;
  };

  const iniciarRetrabalho = (opl) => umaVez('retr-ini-' + opl.id, async () => {
    const agora = new Date().toISOString();
    const { error: erroRet } = await supabase.from('oples').update({
      status_geral: 'Em Retrabalho',
      data_inicio_retrabalho: agora,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
    }).eq('id', opl.id);
    if (erroRet) { alert(`Não foi possível iniciar o retrabalho da OP ${opl.opl}: ${erroRet.message}`); return; }   // 7.54
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Retrabalho iniciado. Motivo CQ: ${opl.obs_reprovacao_cq || '—'}`,
      status_anterior: 'Retrabalho', status_novo: 'Em Retrabalho',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    await registrarAndamento(opl,
      `Retrabalho iniciado${opl.obs_reprovacao_cq ? '. Motivo apontado pelo CQ: ' + opl.obs_reprovacao_cq : ''}.`);
    fetchAll();
  })();

  const concluirRetrabalho = (opl) => umaVez('retr-fim-' + opl.id, async () => {
    if (!await confirmar(`Concluir o retrabalho da OP ${opl?.opl || ''}? Ela volta para o CQ.`)) return;
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_retrabalho ? new Date(opl.data_inicio_retrabalho) : null;
    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : null;
    const { error: erroRet } = await supabase.from('oples').update({
      status_geral: 'Aguardando CQ',
      tempo_retrabalho_horas: tempo,
      obs_reprovacao_cq: null,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
    }).eq('id', opl.id);
    if (erroRet) { alert(`Não foi possível concluir o retrabalho da OP ${opl.opl}: ${erroRet.message}`); return; }   // 7.54: apagava o motivo do CQ só na tela
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Retrabalho concluido. Liberado novamente para CQ. Tempo retrabalho: ${tempo ? tempo.toFixed(1) + 'h' : '—'}`,
      status_anterior: 'Em Retrabalho', status_novo: 'Aguardando CQ',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    await registrarAndamento(opl, 'Retrabalho concluído. OP voltou para o Controle de Qualidade.');
    fetchAll();
  })();

  const devolverPCP = umaVez('devolver', async () => {
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    const { error: erroDev } = await supabase.from('oples').update({
      status_geral: 'Devolvida PCP',
      obs_devolucao_producao: obsDevolver,
    }).eq('id', opl.id);
    if (erroDev) { alert(`Não foi possível devolver a OP ${opl.opl} ao PCP: ${erroDev.message}`); return; }   // 7.54
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao',
      evento: `Devolvida para PCP. Motivo: ${obsDevolver}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setModalDevolver(null); setObsDevolver(''); fetchAll();
  });

  const handleAction = (tipo, opl) => {
    if (tipo === 'iniciar')            iniciarRapido(opl);
    if (tipo === 'iniciar_opcoes')     {
      setModalIniciar(opl); setRespNome(currentUser?.nome || '');
      setModoExecucao('individual'); setRespNome2(''); setRespId2(null); setEquipeSel(null);
    }
    if (tipo === 'checklist')          liberarChecklist(opl);
    if (tipo === 'pausar')             pausarOpl(supabase, opl).then(fetchAll);
    if (tipo === 'retomar')            retomarOpl(supabase, opl).then(fetchAll);
    if (tipo === 'devolver')           { setModalDevolver(opl); setObsDevolver(''); }
    if (tipo === 'ver')                setModalVerOpl(opl);
    if (tipo === 'acomp')              setModalAcomp(opl);
    if (tipo === 'iniciar_retrabalho') iniciarRetrabalho(opl);
    if (tipo === 'concluir_retrabalho') concluirRetrabalho(opl);
    if (tipo === 'editar_resp') {
      setModalEditResp(opl);
      setEditModo((opl.modo_execucao as any) || 'individual');
      setEditResp1Nome(opl.responsavel_producao || '');
      setEditResp1Id(opl.tecnico_producao_id || null);
      setEditResp2Nome(opl.tecnico_producao_2_nome || '');
      setEditResp2Id(opl.tecnico_producao_2_id || null);
      setEditEquipeSel(opl.equipe_id ? { id: opl.equipe_id, nome: opl.equipe_nome, head_line_nome: opl.responsavel_producao } : null);
    }
    if (tipo === 'gerenciar_equipe') setModalGerenciarEquipe(opl);
  };

  const [abaProducao, setAbaProducao] = useState('producao');
  const [maisFiltros, setMaisFiltros] = useState(false);
  const emRetrabalho = opls.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho');

  // Técnicos únicos presentes na lista atual, para popular o filtro
  const tecnicosDisponiveis = [...new Set(
    opls.map(o => o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao).filter(Boolean)
  )].sort();

  // Fila: separa o que é adaptação do que é fabricação para envio. Antes tudo
  // caía junto aqui, inclusive item que só seria separado e enviado.
  // Fluxo vazio conta como 'adaptacao' (OP anterior à regra) — ver FluxoEntrega.ts.
  const contaFila = (f: string) =>
    f === 'serralheria' ? opls.filter(temSerralheria).length
                        : opls.filter(o => filaDaOp(o) === f).length;

  // ── ANDAMENTO AUTOMÁTICO ────────────────────────────────────────────────
  // O gerente de produção precisa atualizar muita OP em pouco tempo, e o
  // vendedor precisa saber o que dizer ao cliente. Os dois só se resolvem
  // juntos se a informação sair da AÇÃO, não de um texto que alguém tem que
  // lembrar de escrever: quem inicia, conclui ou fecha a serralheria já disse
  // o que aconteceu — o sistema é que registra e avisa.
  //
  // O número que motivou isto: das 89 OPs na fila de produção, ZERO tinham
  // acompanhamento registrado; a produção escreveu 1 acompanhamento na
  // história inteira do sistema. Pedir mais digitação não ia mudar isso.
  const registrarAndamento = async (opl: any, texto: string) => {
    if (!opl?.opl) return;
    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id:   opl.opl,
      referencia_tipo: 'op',
      referencia_desc: `OP ${opl.opl}`,
      setor:           'Producao',
      texto,
      usuario_id:      String(currentUser?.id || ''),
      usuario_nome:    currentUser?.nome || 'Sistema',
      criado_em:       new Date().toISOString(),
    });
    // Falha em silêncio de propósito: a ação principal (iniciar, concluir)
    // já foi gravada, e travar por causa do recado seria pior.
    if (error) { console.warn('[registrarAndamento]', error.message); return; }
    await notificarEnvolvidosOp({
      ref: opl.opl, texto,
      autorId: currentUser?.id ? String(currentUser.id) : null,
      autorNome: currentUser?.nome || null,
    });
  };

  // Marca/avanca o andamento da serralheria naquela OP. Usa a coluna
  // serralheria_status, que ja existia e estava praticamente sem uso (1 linha).
  const setSerralheria = (opl: any, novoStatus: string) => umaVez('serr-' + opl.id, async () => {
    const agora = new Date().toISOString();
    // "Fabricação serralheria com envio": serralheria → ADAPTAÇÃO → CQ →
    // embalagem → frete (decidido com o usuário em 13/09). Concluída a
    // serralheria, a OP passa da fila de Fabricação para a de Adaptação,
    // aguardando INICIAR — e sem responsável, porque quem adapta não é quem
    // soldou (o nome anterior fica no histórico). Quando a serralheria é só
    // uma etapa dentro de uma adaptação, nada disso acontece.
    const vaiAdaptar = novoStatus === 'Concluido' && serralheriaSegueParaAdaptacao(opl);
    if (vaiAdaptar && !await confirmar(
      `Concluir a serralheria da OP ${opl.opl}?\n\n` +
      `Como esta venda é "fabricação serralheria com envio", a OP passa para a fila da ADAPTAÇÃO ` +
      `(aguardando iniciar). Depois da adaptação vai para o CQ e, aprovada, para embalagem e frete.`)) return;

    const upd: any = { serralheria_status: novoStatus };
    if (vaiAdaptar) {
      Object.assign(upd, {
        status_geral: 'Aguardando Inicio Producao',
        responsavel_producao: null, tecnico_producao_id: null,
        tecnico_producao_2_id: null, tecnico_producao_2_nome: null,
        equipe_id: null, equipe_nome: null, modo_execucao: null,
        data_inicio_producao: null, pausado: false, data_pausa: null, tempo_pausado_horas: 0,
      });
    }
    const { error: erroSerr } = await supabase.from('oples').update(upd).eq('id', opl.id);
    // 7.54: gravação recusada seguia como serralheria concluída (e passava a OP para a fila da Adaptação só na tela)
    if (erroSerr) { alert(`Não foi possível atualizar a serralheria da OP ${opl.opl}: ${erroSerr.message}`); return; }

    const logs: any[] = [{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Serralheria',
      evento: `Serralheria: ${novoStatus} (${motivoSerralheria(opl)})`,
      status_anterior: opl.serralheria_status || '—', status_novo: novoStatus,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }];
    if (vaiAdaptar) {
      const quem = (opl.modo_execucao === 'equipe' ? opl.equipe_nome : opl.responsavel_producao) || null;
      logs.push({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Serralheria',
        evento: `Serralheria concluída — OP passou para a fila da Adaptação (aguardando iniciar).${quem ? ' Responsável na serralheria: ' + quem + '.' : ''}`,
        status_anterior: opl.status_geral, status_novo: 'Aguardando Inicio Producao',
        usuario_nome: currentUser?.nome, data_hora: agora,
      });
    }
    await supabase.from('logs_movimentacao_opl').insert(logs);

    if (vaiAdaptar) {
      await registrarAndamento(opl,
        'Serralheria concluída. A OP seguiu para a adaptação; depois passa pelo Controle de Qualidade e vai para embalagem e envio.');
    }
    fetchAll(true);
  })();

  const oplsFiltradas = opls.filter(o => {
    if (filaAtiva === 'serralheria') { if (!temSerralheria(o)) return false; }
    else if (filaAtiva !== 'todas' && filaDaOp(o) !== filaAtiva) return false;
    if (filtroStatus !== 'Todos' && o.status_geral !== filtroStatus) return false;
    if (filtroTecnico !== 'Todos') {
      const tec = o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao;
      if (tec !== filtroTecnico) return false;
    }
    if (filtroCliente.trim() && !combinaBusca(o.cliente_nome, filtroCliente)) return false;
    if (filtroEntregaDe && (!o.data_prevista_entrega || o.data_prevista_entrega < filtroEntregaDe)) return false;
    if (filtroEntregaAte && (!o.data_prevista_entrega || o.data_prevista_entrega > filtroEntregaAte)) return false;
    if (filtroBusca.trim() && !combinaBusca([o.opl, o.chassi, o.cliente_nome], filtroBusca)) return false;
    return true;
  });
  // Mesmo destaque usado em outras telas — linha fica com a lateral amarela
  // quando a OP tem alteração não vista por este usuário (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', oplsFiltradas.map(o => o.id), currentUser);

  const filtrosAtivos = filtroBusca || filtroStatus !== 'Todos' || filtroTecnico !== 'Todos' || filtroCliente || filtroEntregaDe || filtroEntregaAte;
  const limparFiltros = () => {
    setFiltroBusca(''); setFiltroStatus('Todos'); setFiltroTecnico('Todos');
    setFiltroCliente(''); setFiltroEntregaDe(''); setFiltroEntregaAte('');
  };

  const qtdMkt = opls.filter(o => o.liberado_divulgacao && o.status_geral === 'Em Producao').length;

  return (
    <div>
      <CabecalhoTela
        titulo="Adaptação"
        subtitulo={abaProducao === 'producao'
          ? <><span className="acn-num">{opls.length}</span> OPs na fila · {emRetrabalho.length} em retrabalho · {qtdMkt} com autorização de marketing</>
          : undefined}
        acoes={abaProducao === 'producao' && (
          /* Tabela x Kanban — as duas visões olham a MESMA lista já filtrada,
             então trocar de visão não muda o que está sendo mostrado. */
          <Chips rotulo="Visão" ativo={visao} onChange={setVisao}
            itens={[{ id:'tabela', rotulo:'Tabela', icone: mdiTableLarge }, { id:'kanban', rotulo:'Kanban', icone: mdiViewColumnOutline }]} />
        )}
        abas={
          <Abas ativa={abaProducao} onChange={setAbaProducao} itens={[
            { id:'producao', rotulo:'Produção', icone: mdiCogOutline },
            { id:'veicular', rotulo:'SAC veicular', icone: mdiCarWrench },
            { id:'agenda',   rotulo:'Agendamentos', icone: mdiCalendarMonthOutline },
            { id:'voucher',  rotulo:'Voucher', icone: mdiTicketPercentOutline },
            { id:'equipes',  rotulo:'Equipes', icone: mdiTagOutline },
          ]} />
        }
      />

      {abaProducao === 'veicular' && <PainelSacVeicular currentUser={currentUser} />}
      {abaProducao === 'agenda' && <CalendarioManutencao currentUser={currentUser} />}
      {abaProducao === 'voucher' && <VoucherServicos currentUser={currentUser} />}
      {abaProducao === 'equipes' && <EquipesSection currentUser={currentUser} />}
      {abaProducao === 'producao' && <div>
      {erroLeitura && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchAll()}>Tentar de novo</Botao>}>
          Não foi possível ler as OPs da Produção ({erroLeitura}). Isso não quer dizer que não haja OP na fila{opls.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
        </Faixa>
      )}
      {/* ALERTA RETRABALHO */}
      {emRetrabalho.length > 0 && (
        <Faixa tom="erro" acao={<Botao pequeno variante="perigo-sec" onClick={() => handleAction('ver', emRetrabalho[0])}>Ver OP</Botao>}>
          <b>{emRetrabalho.length} OP(s) reprovada(s) pelo CQ</b> — aguardando ou em retrabalho. O motivo está nas linhas com filete vermelho.
        </Faixa>
      )}

      {/* ALERTA MKT */}
      {qtdMkt > 0 && (
        <Faixa tom="marca" icone={mdiCameraOutline}>
          <b>{qtdMkt} OP(s) em produção com autorização do Marketing</b> — momento ideal para registro. Avise o Marketing para agendar foto/vídeo.
        </Faixa>
      )}

      <div className="sec-card">
        <div className="acn-filtros">
          <input className="acn-input acn-prod-f-busca" value={filtroBusca} onChange={e=>setFiltroBusca(e.target.value)}
            placeholder="OP, chassi ou cliente" aria-label="Buscar (OP, chassi, cliente)" />
          <select className="acn-input acn-prod-f-status" value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} aria-label="Status">
            <option value="Todos">Status: Todos</option>
            <option value="Aguardando Inicio Producao">Aguardando Início Produção</option>
            <option value="Em Producao">Em Produção</option>
            <option value="Retrabalho">Retrabalho</option>
            <option value="Em Retrabalho">Em Retrabalho</option>
          </select>
          <select className="acn-input acn-prod-f-tecnico" value={filtroTecnico} onChange={e=>setFiltroTecnico(e.target.value)} aria-label="Técnico / Equipe">
            <option value="Todos">Técnico: Todos</option>
            {tecnicosDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Botao pequeno variante={maisFiltros || filtroCliente || filtroEntregaDe || filtroEntregaAte ? 'secundario' : 'discreto'} icone={mdiFilterVariant}
            onClick={() => setMaisFiltros(v => !v)} aria-expanded={maisFiltros}>Mais filtros</Botao>
          {filtrosAtivos && <Botao pequeno variante="discreto" icone={mdiClose} onClick={limparFiltros}>Limpar filtros</Botao>}
          {oplsFiltradas.length !== opls.length && <span className="acn-fraco acn-num acn-prod-pequeno">{oplsFiltradas.length} de {opls.length}</span>}
          {/* Filas — separam adaptação de fabricação e de envio. Item que só
              será separado e enviado não polui mais a fila de quem adapta. */}
          <Chips rotulo="Fila" className="acn-filtros-dir" ativo={filaAtiva} onChange={setFilaAtiva}
            itens={([
              ['adaptacao',  'Adaptação',  'Veículos adaptados aqui ou pela nossa equipe no local'],
              ['fabricacao', 'Fabricação', 'Serralheria fabricando o item inteiro; ao concluir, passa para a Adaptação, depois CQ, embalagem e frete'],
              ['envio',      'Envio',      'Não passa por produção — só separar, embalar e enviar'],
              ['serralheria','Serralheria','Tudo que passa pela serralheria: carretinhas inteiras e etapa dentro de adaptações'],
              ['todas',      'Todas',      'Mostra as três filas juntas'],
            ] as const).map(([v, rotulo, titulo]) => ({ id: v, rotulo, titulo, contagem: v === 'todas' ? opls.length : contaFila(v) }))} />
        </div>
        {maisFiltros && (
          <div className="acn-filtros acn-prod-filtros-mais">
            <label className="acn-label" htmlFor="prod-f-cliente">Cliente</label>
            <input id="prod-f-cliente" className="acn-input acn-prod-f-cliente" value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} placeholder="Nome do cliente..." />
            <label className="acn-label acn-prod-f-rotulo" htmlFor="prod-f-de">Entrega prevista de</label>
            <input id="prod-f-de" className="acn-input acn-prod-f-data" type="date" value={filtroEntregaDe} onChange={e=>setFiltroEntregaDe(e.target.value)} />
            <label className="acn-label" htmlFor="prod-f-ate">até</label>
            <input id="prod-f-ate" className="acn-input acn-prod-f-data" type="date" value={filtroEntregaAte} onChange={e=>setFiltroEntregaAte(e.target.value)} />
          </div>
        )}

      {visao === 'kanban' && (
          <div className="sec-body">
            <div className="acn-fraco acn-prod-dica">Ordenado por data de entrega · prioridade desempata o mesmo dia</div>
            {loading ? <div className="acn-empty">Carregando...</div>
              : <ProducaoKanban opls={oplsFiltradas} onAction={handleAction}
                  onPrioridade={definirPrioridade} currentUser={currentUser}
                  onImportarLote={(g) => setModalImportarLoteProducao({ base: g.base, irmaos: g.irmaos })} />}
          </div>
      )}

        <div className="sec-body acn-rolagem acn-prod-tabela" hidden={visao !== 'tabela'}>
          {loading ? <div className="acn-empty">Carregando...</div> : oplsFiltradas.length === 0 ? (
            <div className="acn-empty">{opls.length === 0 ? 'Nenhuma OP em produção no momento.' : 'Nenhuma OP encontrada para os filtros aplicados.'}</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr>
                <th className="acn-prod-th-chk"></th><th>OP</th><th>Veículo e cliente</th><th>Entrega</th><th>Responsável</th><th>Status</th><th className="acn-dir">Ações</th>
              </tr></thead>
              <tbody>
                {(() => {
                  const basesJaRenderizadas = new Set();
                  const itens = [];
                  for (const o of oplsFiltradas) {
                    const base = baseOplDe(o.opl);
                    const irmaos = oplsFiltradas.filter(x => baseOplDe(x.opl) === base);
                    if (irmaos.length > 1) {
                      if (basesJaRenderizadas.has(base)) continue;
                      basesJaRenderizadas.add(base);
                      itens.push({ tipo: 'lote', base, irmaos: [...irmaos].sort((a,b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
                    } else {
                      itens.push({ tipo: 'single', row: o });
                    }
                  }
                  return itens.map(item => {
                    if (item.tipo === 'single') {
                      return <OplRow key={item.row.id} o={item.row} onAction={handleAction} currentUser={currentUser}
                        selecionado={selecionados.has(item.row.id)} onToggleSelecionar={toggleSelecionar}
                        naoLido={oplsNaoLidas.has(String(item.row.id))} onSerralheria={setSerralheria} />;
                    }
                    const grupo = item;
                    const expandido = !!lotesExpandidos[grupo.base];
                    const qtdAguardando  = grupo.irmaos.filter(o => o.status_geral === 'Aguardando Inicio Producao').length;
                    const qtdEmProducao  = grupo.irmaos.filter(o => o.status_geral === 'Em Producao').length;
                    const qtdRetrabalho  = grupo.irmaos.filter(o => o.status_geral === 'Retrabalho' || o.status_geral === 'Em Retrabalho').length;
                    const todosSelecionados = grupo.irmaos.every((o:any) => selecionados.has(o.id));
                    const loteNaoLido = grupo.irmaos.some((o:any) => oplsNaoLidas.has(String(o.id)));
                    return (
                      <React.Fragment key={grupo.base}>
                        <tr className={loteNaoLido ? 'acn-linha-nova' : 'acn-linha-marca'}>
                          <td className="acn-centro">
                            <input type="checkbox" checked={todosSelecionados} title="Selecionar todas as unidades deste lote"
                              onChange={()=>setSelecionados(prev => {
                                const novo = new Set(prev);
                                grupo.irmaos.forEach((o:any) => { if (todosSelecionados) novo.delete(o.id); else novo.add(o.id); });
                                return novo;
                              })} />
                          </td>
                          <td>
                            <div className="acn-duas">
                              <span className="acn-mono acn-forte">{grupo.base}</span>
                              <small>Lote · {grupo.irmaos.length} unidades</small>
                            </div>
                          </td>
                          <td colSpan={4}>
                            <div className="acn-selos">
                              {qtdAguardando > 0 && <Selo familia="neutro">{qtdAguardando} aguardando início</Selo>}
                              {qtdEmProducao > 0 && <Selo familia="info">{qtdEmProducao} em produção</Selo>}
                              {qtdRetrabalho > 0 && <Selo familia="erro">{qtdRetrabalho} em retrabalho</Selo>}
                            </div>
                          </td>
                          <td>
                            <div className="acn-acoes-linha">
                              <Botao pequeno variante="secundario" icone={expandido ? mdiChevronUp : mdiChevronDown}
                                onClick={()=>setLotesExpandidos(prev => ({...prev, [grupo.base]: !prev[grupo.base]}))}>
                                {expandido ? 'Ocultar unidades' : 'Ver unidades'}
                              </Botao>
                              <MenuAcoes itens={[{ rotulo: 'Importar técnicos/equipes', icone: mdiTrayArrowDown,
                                onClick: () => setModalImportarLoteProducao({ base: grupo.base, irmaos: grupo.irmaos }) }]} />
                            </div>
                          </td>
                        </tr>
                        {expandido && grupo.irmaos.map(o => (
                          <OplRow key={o.id} o={o} onAction={handleAction} currentUser={currentUser} onSerralheria={setSerralheria}
                            selecionado={selecionados.has(o.id)} onToggleSelecionar={toggleSelecionar}
                            naoLido={oplsNaoLidas.has(String(o.id))} />
                        ))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnaliseWidget setor="Producao" currentUser={currentUser} />
      <DemandasSetorWidget setor="Producao" cor="#7c3aed" currentUser={currentUser} />
      <OplMovimentadas setor="Producao" />
      <DemandaFooter setor="Producao" />

      {/* MODAL INICIAR */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Iniciar produção">
            <div className="acn-modal-cab">
              <span className="modal-title">Iniciar produção — OP {modalIniciar.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Tipo: {modalIniciar.tipo_projeto} | Chassi: {modalIniciar.chassi || '—'}
              </div>
              {modalIniciar.liberado_divulgacao && (
                <Faixa tom="marca" icone={mdiCameraOutline}>
                  <strong>OP liberada para divulgacao pelo Marketing.</strong> Avise o MKT.
                </Faixa>
              )}

              {/* Seletor de modo */}
              <div className="form-group">
                <label className="acn-label">Modo de Execução</label>
                <Chips rotulo="Modo de execução" ativo={modoExecucao} onChange={setModoExecucao} itens={MODOS_EXECUCAO} />
              </div>

              {/* Individual */}
              {modoExecucao === 'individual' && (
                <div className="form-group">
                  <label className="acn-label">Técnico Responsável</label>
                  <ColaboradorSelect value={respNome}
                    onChange={nome=>{ setRespNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId(c?.id||null); }}
                    placeholder="Selecione o técnico"
                    className="acn-input" autoFocus />
                </div>
              )}

              {/* Dupla */}
              {modoExecucao === 'dupla' && (
                <>
                  <div className="form-group">
                    <label className="acn-label">Técnico 1</label>
                    <ColaboradorSelect value={respNome}
                      onChange={nome=>{ setRespNome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId(c?.id||null); }}
                      placeholder="Selecione o 1º técnico"
                      className="acn-input" />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Técnico 2</label>
                    <ColaboradorSelect value={respNome2}
                      onChange={nome=>{ setRespNome2(nome); const c=colaboradoresList.find(x=>x.nome===nome); setRespId2(c?.id||null); }}
                      placeholder="Selecione o 2º técnico"
                      className="acn-input" />
                  </div>
                </>
              )}

              {/* Equipe */}
              {modoExecucao === 'equipe' && (
                <div className="form-group">
                  <label className="acn-label">Selecione a Equipe (pelo Head Line)</label>
                  {erroEquipes && <Faixa tom="erro" acao={<Botao pequeno onClick={fetchEquipes}>Tentar de novo</Botao>}>Não foi possível ler as equipes ({erroEquipes}).</Faixa>}
                  {equipes.length === 0 ? (
                    <div className="acn-txt-erro">Nenhuma equipe cadastrada. Vá em Equipes para criar.</div>
                  ) : (
                    <div className="acn-prod-equipes">
                      {equipes.map(eq => (
                        <div key={eq.id} onClick={()=>setEquipeSel(eq)} className={'acn-prod-equipe' + (equipeSel?.id===eq.id ? ' sel' : '')}>
                          <strong>{eq.nome}</strong>
                          <span className="acn-ajuda">Head: {eq.head_line_nome}</span>
                          {(eq.membros||[]).length>0 && (
                            <span className="acn-ajuda">+{eq.membros.length} membros</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="secundario" onClick={()=>setModalIniciar(null)}>Cancelar</Botao>
              <Botao variante="primario" icone={mdiPlay} onClick={iniciarProducao}>Iniciar produção</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR RESPONSÁVEL */}
      {modalEditResp && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Editar responsável">
            <div className="acn-modal-cab">
              <span className="modal-title">Editar responsável — OP {modalEditResp.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Atual: <strong>{modalEditResp.responsavel_producao || '—'}</strong>
                {modalEditResp.tecnico_producao_2_nome && <> + <strong>{modalEditResp.tecnico_producao_2_nome}</strong></>}
                {modalEditResp.equipe_nome && <> · Equipe: <strong>{modalEditResp.equipe_nome}</strong></>}
              </div>

              <div className="form-group">
                <label className="acn-label">Modo de Execução</label>
                <Chips rotulo="Modo de execução" ativo={editModo} onChange={setEditModo} itens={MODOS_EXECUCAO} />
              </div>

              {editModo === 'individual' && (
                <div className="form-group">
                  <label className="acn-label">Técnico Responsável</label>
                  <ColaboradorSelect value={editResp1Nome}
                    onChange={nome=>{ setEditResp1Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp1Id(c?.id||null); }}
                    placeholder="Selecione o técnico"
                    className="acn-input" />
                </div>
              )}
              {editModo === 'dupla' && (
                <>
                  <div className="form-group">
                    <label className="acn-label">Técnico 1</label>
                    <ColaboradorSelect value={editResp1Nome}
                      onChange={nome=>{ setEditResp1Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp1Id(c?.id||null); }}
                      placeholder="Selecione o 1º técnico"
                      className="acn-input" />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Técnico 2</label>
                    <ColaboradorSelect value={editResp2Nome}
                      onChange={nome=>{ setEditResp2Nome(nome); const c=colaboradoresList.find(x=>x.nome===nome); setEditResp2Id(c?.id||null); }}
                      placeholder="Selecione o 2º técnico"
                      className="acn-input" />
                  </div>
                </>
              )}
              {editModo === 'equipe' && (
                <div className="form-group">
                  <label className="acn-label">Selecione a Equipe</label>
                  {equipes.length === 0 ? (
                    <div className="acn-txt-erro">Nenhuma equipe cadastrada.</div>
                  ) : (
                    <div className="acn-prod-equipes">
                      {equipes.map(eq => (
                        <div key={eq.id} onClick={()=>setEditEquipeSel(eq)} className={'acn-prod-equipe' + (editEquipeSel?.id===eq.id ? ' sel' : '')}>
                          <strong>{eq.nome}</strong>
                          <span className="acn-ajuda">Head: {eq.head_line_nome}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="secundario" onClick={()=>setModalEditResp(null)}>Cancelar</Botao>
              <Botao variante="primario" onClick={editarResponsavel}>Salvar alteração</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EQUIPE DA OP — adaptação e serralheria (EquipeDaOp.tsx) */}
      {modalGerenciarEquipe && (
        <EquipeDaOpModal opl={modalGerenciarEquipe} currentUser={currentUser}
          aoFechar={()=>setModalGerenciarEquipe(null)} />
      )}

      {/* MODAL VER OPL */}
      {modalVerOpl && <OplDetalheModal opl={modalVerOpl} onClose={()=>setModalVerOpl(null)} currentUser={currentUser} />}

      {modalImportarLoteProducao && (
        <ModalImportarTecnicosEquipe
          base={modalImportarLoteProducao.base}
          irmaos={modalImportarLoteProducao.irmaos}
          equipes={equipes}
          colaboradoresList={colaboradoresList}
          currentUser={currentUser}
          onClose={()=>setModalImportarLoteProducao(null)}
          onImportado={()=>{fetchAll();setSelecionados(new Set());}}
        />
      )}

      {/* BARRA DE AÇÃO EM LOTE — seleção livre por checkbox, não precisa ser do mesmo lote/base */}
      {selecionados.size > 0 && (
        <div className="acn-barra-selecao">
          <strong className="acn-num">{selecionados.size} selecionada{selecionados.size!==1?'s':''}</strong>
          <Botao pequeno variante="secundario" icone={mdiTrayArrowDown}
            onClick={()=>setModalImportarLoteProducao({base:'Seleção', irmaos: opls.filter((o:any)=>selecionados.has(o.id))})}>
            Atribuir técnicos/equipes
          </Botao>
          <Botao pequeno variante="secundario" icone={mdiCheckAll} disabled={aplicandoIniciarLote} onClick={liberarChecklistEmLote}>
            {aplicandoIniciarLote ? 'Aplicando...' : 'Liberar checklist (CQ) em lote'}
          </Botao>
          <Botao pequeno variante="primario" icone={mdiPlay} disabled={aplicandoIniciarLote} onClick={iniciarProducaoEmLote}>
            {aplicandoIniciarLote ? 'Aplicando...' : 'Iniciar produção em lote'}
          </Botao>
          <Botao pequeno variante="discreto" icone={mdiClose} onClick={()=>setSelecionados(new Set())}>Limpar seleção</Botao>
        </div>
      )}

      {/* MODAL DEVOLVER PCP */}
      {modalDevolver && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="Devolver ao PCP">
            <div className="acn-modal-cab">
              <span className="modal-title">Devolver para PCP — OP {modalDevolver.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="form-group">
                <label className="acn-label" htmlFor="prod-dev">Motivo / Problema *</label>
                <textarea id="prod-dev" className="acn-input" rows={3}
                  value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape">
              <Botao variante="secundario" onClick={()=>setModalDevolver(null)}>Cancelar</Botao>
              <Botao variante="perigo" onClick={devolverPCP}>Devolver ao PCP</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACOMPANHAMENTO DA OP */}
      {modalAcomp && (
        <OplAcompModal
          referenciaId={modalAcomp.opl || String(modalAcomp.id)}
          referenciaDesc={`OP ${modalAcomp.opl || '—'}`}
          referenciaType="op"
          setor="Producao"
          currentUser={currentUser}
          sugestoes={RECADOS_PRODUCAO}
          onClose={() => setModalAcomp(null)}
        />
      )}
    </div>}
    </div>
  );
}
