// @ts-nocheck
import { supabase } from './supabaseClient';
import ResumoLoteOpl, { lotePedidoIgual } from './ResumoLoteOpl';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, DemandasSetorWidget, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import { ColaboradorSelect } from './ColaboradorSelect';
import DemandaAvulsaPanel, { NovaDemandaModal } from './DemandaAvulsaPanel';
import { FabricacaoInternaEditor, gerarDemandasFabricacao, fabricacaoVazia, temFabricacao, SETORES_FABRICACAO } from './DemandaItens';
import { PinturaCampos } from './PinturaSerralheria';
import OplAnexosWidget from './OplAnexosWidget';
import { notificarEvento, msg } from './whatsappHelper';
import AgendaWidget from './AgendaWidget';
import DesenvolvimentoPecasTab, { criarDemandaDesenvolvimento } from './DesenvolvimentoPecasTab';
import HorasTarefasTab from './HorasTarefasTab';
import { horasUteis } from './utils/horasUteis';
import { BotaoPausar, BadgeForaExpediente, pausarOpl, retomarOpl } from './PausaWidget';
import { logChange, useUnreadMap } from './AuditSystem';
import { confirmar } from './Feedback';
import { OrigemVendaBadge } from './OrigemVenda';
import { fluxoLabel } from './FluxoEntrega';
import { BomEditor, CopiarBomDeOutraOp, bomPreenchida, sugerirBom } from './OpItens';
import { PainelConferenciaEstrutura } from './AplicarEstrutura';
import { AvisoRespostasDiferentes } from './RespostasEmLote';
import { indicePendencias } from './OpPendencias';
import { MenuAcoes, Faixa, Botao, Abas, Selo, Tag, diaBR } from './Interface';
import Icone from './Icone';
import {
  mdiRulerSquareCompass, mdiCogOutline, mdiTimerOutline, mdiTrayArrowUp, mdiWrenchOutline, mdiCheckCircleOutline, mdiClockAlertOutline,
  mdiPauseCircleOutline, mdiEyeOutline, mdiNoteTextOutline, mdiPowerPlugOutline, mdiArrowULeftTop, mdiLinkVariant, mdiPlayOutline, mdiClipboardTextOutline,
  mdiChevronUp, mdiChevronDown, mdiCarOutline, mdiAlertOutline, mdiTagOutline,
} from '@mdi/js';

const semDado = (v) => !v || !String(v).trim();

// ─── Informações comerciais da OPL (logo abaixo de cada linha) ──────────────────
// Quem projeta precisa saber sem abrir o detalhe: para quem é, de onde veio a venda
// e quem vendeu, quando tem que ser entregue, por qual fluxo, o que foi vendido e o
// que o comercial pediu atenção.
const CAMPOS_INFO_COMERCIAL = ['cliente_nome', 'origem_venda', 'responsavel_comercial', 'vendedor', 'data_prevista_entrega',
  'prazo_entrega_comercial', 'fluxo_entrega', 'destino_cidade', 'destino_uf', 'kit_nome', 'faturamento_empresa',
  'resumo_servicos', 'observacoes_comercial', 'observacoes_atencao'];
// Unidade de lote com as mesmas informações da linha do lote não repete o bloco
const mesmaInfoComercial = (a, b) => CAMPOS_INFO_COMERCIAL.every(k => String(a?.[k] ?? '').trim() === String(b?.[k] ?? '').trim());

function PrazoEntregaOpl({ o }) {
  const data = o.data_prevista_entrega || o.prazo_entrega_comercial;
  if (!data) return <span className="acn-ajuda">sem data</span>;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(String(data).slice(0, 10) + 'T00:00:00').getTime() - hoje.getTime()) / 86400000);
  const situacao = dias < 0 ? `${-dias} dia${dias === -1 ? '' : 's'} em atraso`
    : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`;
  return (
    <span className={'acn-eng-prazo' + (dias < 0 ? ' atrasado' : dias <= 7 ? ' perto' : '')}>
      {String(data).slice(0, 10).split('-').reverse().join('/')} · {situacao}
    </span>
  );
}

function InfoOplEngenharia({ o, colunas, className }) {
  const [servicosAbertos, setServicosAbertos] = useState(false);
  const comercial = o.responsavel_comercial || o.vendedor;
  const outroVendedor = o.vendedor && o.responsavel_comercial && o.vendedor.trim().toUpperCase() !== o.responsavel_comercial.trim().toUpperCase() ? o.vendedor : null;
  const destino = [o.destino_cidade, o.destino_uf].filter(Boolean).join('/');
  const servicos = String(o.resumo_servicos || '').trim();
  const servicosLongos = servicos.length > 180 || servicos.split('\n').length > 2;
  return (
    <tr className={'acn-eng-info' + (className ? ' ' + className : '')}>
      <td colSpan={colunas}>
        <div className="acn-eng-fatos">
          <span><b>Cliente</b><strong>{o.cliente_nome || '—'}</strong></span>
          <OrigemVendaBadge origem={o.origem_venda} />
          <span><b>Comercial</b>{comercial || '—'}{outroVendedor && ` · vendedor ${outroVendedor}`}</span>
          <span><b>Entrega</b><PrazoEntregaOpl o={o} /></span>
          <span><b>Fluxo</b>{fluxoLabel(o.fluxo_entrega)}</span>
          {destino && <span><b>Destino</b>{destino}</span>}
          {o.kit_nome && <span><b>Kit</b>{o.kit_nome}</span>}
          {o.faturamento_empresa && <span><b>Faturamento</b>{o.faturamento_empresa}</span>}
        </div>
        {(o.itens_vendidos || []).length > 0 && (
          <div className="acn-eng-texto"><b>Vendido:</b>{' '}
            {o.itens_vendidos.map((v: any) => `${Number(v.quantidade).toLocaleString('pt-BR')}× ${v.nome}`).join(' · ')}
          </div>
        )}
        {o.observacoes_atencao && <div className="acn-eng-texto acn-eng-atencao"><b>⚠ Atenção:</b> {o.observacoes_atencao}</div>}
        {o.observacoes_comercial && <div className="acn-eng-texto"><b>Obs. comercial:</b> {o.observacoes_comercial}</div>}
        {servicos && (
          <div className={'acn-eng-texto' + (servicosLongos && !servicosAbertos ? ' fechado' : '')}>
            <b>Serviços:</b> {servicos}
          </div>
        )}
        {servicosLongos && (
          <Botao variante="discreto" pequeno onClick={() => setServicosAbertos(v => !v)}>
            {servicosAbertos ? 'Recolher serviços' : 'Ver todos os serviços'}
          </Botao>
        )}
      </td>
    </tr>
  );
}

export default function EngenhariaTab({ currentUser }) {
  const [abaEng, setAbaEng] = useState('analise');
  // Deep-link da busca global do topo (DashboardTab.tsx) — clicar num
  // resultado de "Desenvolvimento (Engenharia)" troca pra essa sub-aba e
  // pré-preenche a busca local com o mesmo termo digitado.
  const [buscaDeepLink, setBuscaDeepLink] = useState('');
  useEffect(() => {
    const handler = (e) => {
      setAbaEng('desenvolvimento');
      setBuscaDeepLink(e.detail?.termo || '');
    };
    window.addEventListener('engenharia:abrir-desenvolvimento', handler);
    return () => window.removeEventListener('engenharia:abrir-desenvolvimento', handler);
  }, []);
  // Menção de hora extra (painel de Menções) abre Horas/Tarefas › Horas extras. Usa o
  // global __acnDeepLink porque a aba pode montar depois do clique (mesmo padrão de Compras).
  const [horasAbaInicial, setHorasAbaInicial] = useState(undefined);
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'hora_extra') return;
      (window as any).__acnDeepLink = null;
      setHorasAbaInicial('extras');
      setAbaEng('horas');
      window.dispatchEvent(new CustomEvent('engenharia:abrir-horas-extras'));
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);
  const [opls, setOpls] = useState([]);
  // Linhas com alteração não vista por este usuário ganham borda amarela —
  // mesmo padrão usado nas outras telas de OP (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', opls.map((o: any) => o.id), currentUser);
  const [loading, setLoading] = useState(false);
  const [modalBom, setModalBom] = useState(null);
  // chicotes/serralheria indicados na liberação da BOM (viram demandas dos setores)
  const [fabBom, setFabBom] = useState<any>(fabricacaoVazia());
  const [pinturaBom, setPinturaBom] = useState({ pintura: false, pintura_tipo: '' });
  // BOM estruturada (material por unidade) — obrigatória para liberar
  const [bomLinhas, setBomLinhas] = useState<any[]>([]);
  const [bomLote, setBomLote] = useState<any[]>([]);
  const prepararBom = async (o: any, setter: (v: any[]) => void) => {
    if ((o?.bom_itens || []).length) { setter(o.bom_itens); return; }
    setter([]);
    if ((o?.itens_vendidos || []).length) {
      const sugerida = await sugerirBom(o.itens_vendidos);
      // A sugestão chega DEPOIS de a janela abrir (uma consulta por item vendido). Antes ela SUBSTITUÍA a lista: quem
      // clicasse em "Jogar na BOM" nesse intervalo, ou já tivesse digitado uma linha, via o material sumir quando a
      // sugestão terminava de carregar (visto em 29/09/2026, máquina lenta). Agora ela só soma o que ainda não está na lista.
      setter((atuais: any[]) => {
        const chave = (l: any) => l?.item_id || `txt:${l?.nome}`;
        const ja = new Set((atuais || []).map(chave));
        return [...(atuais || []), ...sugerida.filter((l: any) => !ja.has(chave(l)))];
      });
    }
  };
  const abrirLiberarBom = (o: any) => {
    setModalBom(o); setObsBom(''); setFabBom(fabricacaoVazia());
    prepararBom(o, setBomLinhas);
  };
  const [fabBomLote, setFabBomLote] = useState<any>(fabricacaoVazia());
  const [pinturaBomLote, setPinturaBomLote] = useState({ pintura: false, pintura_tipo: '' });
  // "+ Chicote/Serralheria" a qualquer momento (várias demandas por OP)
  const [modalFabricacao, setModalFabricacao] = useState<any>(null);
  const [obsBom, setObsBom] = useState('');
  // Liberação parcial de BOM p/ Serralheria — Engenharia antecipa a parte
  // metálica/estrutural sem esperar terminar o resto do BOM. Trilha própria
  // (oples.serralheria_status), não mexe no status_geral normal.
  const [modalSerralheria, setModalSerralheria] = useState(null);
  const [obsSerralheria, setObsSerralheria] = useState('');
  const [enviandoSerralheria, setEnviandoSerralheria] = useState(false);
  // Liberação de BOM em lote — OPs desmembradas (mesmo número base, sufixo
  // /01../NN) costumam compartilhar o mesmo BOM, então liberar uma por uma
  // é retrabalho. selecionadosLote guarda os ids marcados no modal (todos
  // marcados por padrão, dá pra desmarcar exceções antes de confirmar).
  const [modalBomLote, setModalBomLote] = useState(null); // { base, irmaos: [] }
  const [obsBomLote, setObsBomLote] = useState('');
  const [selecionadosLote, setSelecionadosLote] = useState({});
  const [liberandoLote, setLiberandoLote] = useState(false);
  const [versaoRespostas, setVersaoRespostas] = useState(0);   // sobe quando as respostas do lote mudam (refaz o aviso de respostas diferentes)
  const [iniciandoLote, setIniciandoLote] = useState(false);
  // Grupos desmembrados aparecem colapsados numa única linha "LOTE" na
  // tabela — expande[base]=true mostra as unidades individuais por baixo.
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [modalObs, setModalObs] = useState(null);
  const [novaObs, setNovaObs] = useState('');
  const [modalDevolver, setModalDevolver] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [modalIniciar, setModalIniciar] = useState(null);
  const [responsavelEng, setResponsavelEng] = useState('');
  const [precisaDesenvolvimento, setPrecisaDesenvolvimento] = useState(false);
  const [descDesenvolvimento, setDescDesenvolvimento] = useState('');

  // Acompanhamento SAC Veicular
  const [osAcomp, setOsAcomp] = useState([]);
  const [modalObsAcomp, setModalObsAcomp] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [resumoLote, setResumoLote] = useState<any>(null);   // { base, irmaos }: cartão de resumo do lote como uma coisa só (08/10/2026)
  const [novaObsAcomp, setNovaObsAcomp] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => { fetchAll(); fetchOsAcomp(); const t = setInterval(()=>{ fetchAll(true); fetchOsAcomp(); }, 30000); return () => clearInterval(t); }, []);

  // Etapa 7.51 (06/10/2026): leitura que falha não pode parecer "nenhuma OP aguardando Engenharia" (e a atualização de 30 s que
  // falha não pode esvaziar a lista que já estava na tela).
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroOsAcomp, setErroOsAcomp] = useState('');
  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase.from('oples').select('*')
      .in('status_geral', ['Em Espera Engenharia', 'Em Analise Engenharia', 'Devolvida para Engenharia'])
      .order('data_entrada', { ascending: false });
    if (error) { setErroLeitura(error.message); if (!silent) setLoading(false); return; }
    setErroLeitura('');
    setOpls(data || []);
    if (!silent) setLoading(false);
  };

  const fetchOsAcomp = async () => {
    const { data, error } = await supabase.from('sac_ordens_servico').select('*')
      .eq('acompanhamento_engenharia', true)
      .not('status', 'in', '("Entregue","Reprovado")')
      .order('data_abertura', { ascending: false });
    if (error) { setErroOsAcomp(error.message); return; }
    setErroOsAcomp('');
    setOsAcomp(data || []);
  };

  // 7.51: um clique duplo em "Confirmar", "Liberar BOM" ou "Devolver" gravava duas vezes (duas linhas de histórico e dois
  // avisos no WhatsApp). Uma ação por vez, por tipo.
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const addObsAcompanhamento = async () => {
    if (!novaObsAcomp.trim()) return;
    const os = modalObsAcomp;
    const logs = Array.isArray(os.logs_acompanhamento_eng) ? [...os.logs_acompanhamento_eng] : [];
    logs.push({ texto: novaObsAcomp, usuario: currentUser?.nome || currentUser?.email, hora: new Date().toISOString() });
    const { error } = await supabase.from('sac_ordens_servico').update({ logs_acompanhamento_eng: logs }).eq('id', os.id);
    if (error) { alert('Não foi possível salvar a observação: ' + error.message); return; }   // 7.51: seguia como se tivesse salvo
    setNovaObsAcomp(''); setModalObsAcomp(null); fetchOsAcomp();
  };

  const abrirIniciarEng = (opl) => {
    setModalIniciar(opl);
    setResponsavelEng(currentUser?.nome || '');
    setPrecisaDesenvolvimento(false);
    setDescDesenvolvimento('');
  };

  const confirmarIniciarEng = umaVez('iniciar', async () => {
    if (!responsavelEng.trim()) { alert('Informe o responsavel pela execucao!'); return; }
    if (precisaDesenvolvimento && !descDesenvolvimento.trim()) { alert('Descreva o que precisa ser desenvolvido!'); return; }
    const opl = modalIniciar;
    const agora = new Date().toISOString();
    const { error: erroIni } = await supabase.from('oples').update({
      status_geral: 'Em Analise Engenharia',
      responsavel_engenharia: responsavelEng,
      data_inicio_engenharia: agora,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
    }).eq('id', opl.id);
    // 7.51: gravação recusada seguia como se a análise tivesse começado (janela fechada, demanda de desenvolvimento aberta)
    if (erroIni) { alert(`Não foi possível iniciar a análise da OP ${opl.opl}: ${erroIni.message}`); return; }
    logChange({ module: 'engenharia', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral, responsavel_engenharia: opl.responsavel_engenharia },
      newRow: { status_geral: 'Em Analise Engenharia', responsavel_engenharia: responsavelEng }, user: currentUser });
    const { error: erroLogIni } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `Inicio da analise de engenharia. Responsavel: ${responsavelEng}`,
      status_anterior: opl.status_geral, status_novo: 'Em Analise Engenharia',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    if (erroLogIni) alert(`A análise foi iniciada, mas o histórico de movimentação não foi gravado: ${erroLogIni.message}`);
    if (precisaDesenvolvimento) {
      await criarDemandaDesenvolvimento({ opl, descricao: descDesenvolvimento.trim(), currentUser });
    }
    setModalIniciar(null); setResponsavelEng(''); setPrecisaDesenvolvimento(false); setDescDesenvolvimento('');
    fetchAll();
  });

  const addObs = async () => {
    if (!novaObs.trim()) return;
    const opl = modalObs;
    const logs = opl.logs_engenharia || [];
    logs.push({ texto: novaObs, usuario: currentUser?.nome, hora: new Date().toISOString() });
    const { error } = await supabase.from('oples').update({ logs_engenharia: logs }).eq('id', opl.id);
    if (error) { alert('Não foi possível salvar a observação: ' + error.message); return; }   // 7.51
    setNovaObs(''); setModalObs(null); fetchAll();
  };

  // Aviso de pendência em aberto ao liberar a BOM (achado A6 do
  // PLANO_UX_FLUXO_TRABALHO.md, 29/09/2026). Antes a Engenharia liberava sem
  // saber que a OP já tinha demanda de Serralheria, Chicotes ou Compras aberta,
  // e quem esbarrava nisso era o Almoxarifado, na hora de fechar o kit. É
  // aviso, não trava: liberar com demanda aberta é normal (a liberação parcial
  // da Serralheria, por exemplo, abre uma de propósito). Devolve true para
  // seguir. Se a consulta falhar, segue: um aviso que não carregou não pode
  // impedir a Engenharia de trabalhar.
  const confirmarComPendenciasAbertas = async (ops) => {
    let abertas = [];
    try {
      const indice = await indicePendencias();
      ops.forEach(o => (indice.get(String(o.id)) || []).filter(p => p.aberto)
        .forEach(p => abertas.push({ ...p, opl: o.opl })));
    } catch (e) {
      console.error('Não consegui checar as pendências antes de liberar a BOM:', e);
      return true;
    }
    if (!abertas.length) return true;
    const varias = ops.length > 1;
    const linhas = abertas.slice(0, 10).map(p => `• ${varias ? p.opl + ' — ' : ''}${p.setor}: ${p.titulo}`).join('\n');
    const resto = abertas.length > 10 ? `\n… e mais ${abertas.length - 10}` : '';
    return confirmar(
      `${varias ? 'Estas OPs já têm' : 'Esta OP já tem'} ${abertas.length} demanda(s) de fabricação/compra em aberto:\n\n${linhas}${resto}\n\n` +
      'Liberar a BOM mesmo assim? As demandas seguem abertas, e o Almoxarifado vai encontrá-las na hora de fechar o kit.');
  };

  const liberarBOM = umaVez('liberar-bom', async () => {
    const opl = modalBom;
    const bom = bomPreenchida(bomLinhas);
    if (!bom.length) { alert('Preencha a BOM com pelo menos 1 item: o material que será usado nesta OP.'); return; }
    if (!await confirmarComPendenciasAbertas([opl])) return;
    const agora = new Date().toISOString();
    const inicio = opl.data_inicio_engenharia ? new Date(opl.data_inicio_engenharia) : null;
    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : null;
    const { error: erroBom } = await supabase.from('oples').update({
      status_geral: 'Em Espera PCP',
      status_bom: 'BOM Liberado',
      obs_liberacao_bom: obsBom,
      bom_itens: bom,
      data_liberacao_bom: agora,
      tempo_engenharia_horas: tempo,
      pausado: false, data_pausa: null, tempo_pausado_horas: 0,
    }).eq('id', opl.id);
    // 7.51: a gravação recusada seguia como se a BOM tivesse sido liberada: aviso ao PCP no WhatsApp, demandas de fabricação abertas e
    // a janela fechada com a OP ainda na Engenharia. Agora para aqui e a janela fica aberta com a BOM digitada.
    if (erroBom) { alert(`Não foi possível liberar a BOM da OP ${opl.opl}: ${erroBom.message}`); return; }
    logChange({ module: 'engenharia', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral, status_bom: opl.status_bom, obs_liberacao_bom: opl.obs_liberacao_bom },
      newRow: { status_geral: 'Em Espera PCP', status_bom: 'BOM Liberado', obs_liberacao_bom: obsBom }, user: currentUser });
    const { error: erroLogBom } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `BOM liberado para PCP/Almoxarifado (${bom.length} item(ns)). Qtd: ${opl.quantidade||1} un. Obs: ${obsBom || 'Sem observacoes'}.`,
      status_anterior: opl.status_geral, status_novo: 'Em Espera PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    if (erroLogBom) alert(`A BOM foi liberada, mas o histórico de movimentação não foi gravado: ${erroLogBom.message}`);
    notificarEvento('engenharia_libera_pcp', msg.oplEnviada(opl.opl,'PCP',currentUser?.nome));
    if (temFabricacao(fabBom)) {
      const { criadas, falhas } = await gerarDemandasFabricacao({ valor: fabBom, ops: [opl], origem: 'engenharia_bom', currentUser, pintura: pinturaBom });
      if (criadas.length) await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
        evento: `Demanda de fabricação aberta na liberação da BOM: ${criadas.join(', ')}.`,
        status_anterior: 'Em Espera PCP', status_novo: 'Em Espera PCP', usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
      if (falhas.length) alert('BOM liberada, mas não foi possível abrir a demanda de fabricação:\n' + falhas.join('\n'));
    }
    setModalBom(null); setObsBom(''); setFabBom(fabricacaoVazia()); fetchAll();
  });

  // Libera só a parte da Serralheria (metálica/estrutural), antecipando o
  // serviço sem esperar o resto do BOM ficar pronto. Não mexe no
  // status_geral — a OP continua "Em Analise Engenharia" normalmente, e o
  // "LIBERAR BOM" (saldo completo) segue disponível a qualquer momento,
  // independente de a Serralheria já ter terminado ou não.
  const liberarParcialSerralheria = async () => {
    if (!obsSerralheria.trim()) { alert('Descreva o que a Serralheria precisa fazer!'); return; }
    const opl = modalSerralheria;
    setEnviandoSerralheria(true);
    const agora = new Date().toISOString();
    // Usa a mesma tabela/tela que a Serralheria já usa de verdade
    // (demandas_setoriais + SetorDemandaTab.tsx) — tipo_solicitacao marca
    // essa demanda como liberação parcial de BOM, pra SetorDemandaTab.tsx
    // saber que precisa sincronizar oples.serralheria_status ao concluir.
    const { error: errDemanda } = await supabase.from('demandas_setoriais').insert([{
      setor_destino: 'Serralheria', setor_origem: 'Engenharia', tipo_solicitacao: 'liberacao_parcial_bom',
      numero_opl: opl.opl, chassi: opl.chassi || null, descricao: obsSerralheria.trim(),
      status: 'Pendente', criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      data_abertura: agora,
      logs_demanda: [{ texto: `Liberação parcial de BOM (Engenharia): ${obsSerralheria.trim()}`, usuario: currentUser?.nome, hora: agora }],
    }]);
    if (errDemanda) { alert('Erro ao criar demanda para Serralheria: ' + errDemanda.message); setEnviandoSerralheria(false); return; }
    // 7.51: a demanda já nasceu; se a marca na OP não gravar, o selo "Liberado Parcial" não aparece e a conclusão da Serralheria não sincroniza
    const { error: erroMarca } = await supabase.from('oples').update({ serralheria_status: 'Pendente' }).eq('id', opl.id);
    if (erroMarca) alert(`A demanda foi aberta para a Serralheria, mas a OP não foi marcada como "Liberado Parcial": ${erroMarca.message}\n\nAvise o PCP/Admin: não envie de novo (abriria uma segunda demanda).`);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `Liberação parcial de BOM para Serralheria. Obs: ${obsSerralheria.trim()}`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('engenharia_libera_serralheria', `*Liberação parcial p/ Serralheria* — OP ${opl.opl}\n${obsSerralheria.trim()}\nPor: ${currentUser?.nome}`, 'Serralheria');
    setEnviandoSerralheria(false);
    setModalSerralheria(null); setObsSerralheria(''); fetchAll();
  };

  // Número base de uma OP desmembrada: "A1419.2607/02" -> "A1419.2607".
  // A unidade "01" fica sem sufixo (não renomeada, ver CrmTab/NovaOpOsModal),
  // então o próprio número original também serve de base do grupo.
  const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
  const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

  const abrirBomLote = (opl) => {
    const base = baseOplDe(opl.opl);
    // em ordem de número (/01, /02…): antes vinha na ordem da lista, e a "OP de referência" da estrutura (a primeira marcada)
    // caía numa unidade qualquer, como a /31 (29/09/2026)
    const irmaos = opls.filter(o => baseOplDe(o.opl) === base).sort((a, b) => sufixoNum(a.opl) - sufixoNum(b.opl));
    const marcados = {};
    irmaos.forEach(o => { marcados[o.id] = true; });
    setSelecionadosLote(marcados);
    setObsBomLote('');
    setFabBomLote(fabricacaoVazia());
    setModalBomLote({ base, irmaos });
    prepararBom(irmaos.find(o => (o.bom_itens || []).length) || irmaos.find(o => (o.itens_vendidos || []).length) || irmaos[0], setBomLote);
  };

  // Inicia de uma vez a analise de todas as unidades ainda nao iniciadas
  // de um lote (status "Em Espera Engenharia" ou "Devolvida para
  // Engenharia") — responsavel = quem clicou. As ja iniciadas ficam como
  // estao (podem ter responsaveis/observacoes diferentes).
  const iniciarLote = async (grupo) => {
    const pendentes = grupo.irmaos.filter(o => o.status_geral === 'Em Espera Engenharia' || o.status_geral === 'Devolvida para Engenharia');
    if (pendentes.length === 0) { alert('Todas as unidades deste lote ja foram iniciadas.'); return; }
    if (!await confirmar(`Iniciar a analise de engenharia para ${pendentes.length} unidade(s) de ${grupo.base}?\n\nResponsavel: ${currentUser?.nome}.`)) return;
    setIniciandoLote(true);
    const agora = new Date().toISOString();
    try {
      // 7.51: para na primeira que não grava e diz até onde foi (antes seguia para as outras e gravava o histórico de todas)
      const iniciadas = [];
      for (const opl of pendentes) {
        const { error } = await supabase.from('oples').update({
          status_geral: 'Em Analise Engenharia',
          responsavel_engenharia: currentUser?.nome,
          data_inicio_engenharia: agora,
        }).eq('id', opl.id);
        if (error) {
          alert(`Não foi possível iniciar a OP ${opl.opl}: ${error.message}\n\nO lote parou aqui: ${iniciadas.length} unidade(s) foram iniciadas e as demais continuam como estavam.`);
          break;
        }
        iniciadas.push(opl);
      }
      if (iniciadas.length) await supabase.from('logs_movimentacao_opl').insert(iniciadas.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
        evento: `Inicio de analise em lote (${iniciadas.length} OPs do grupo ${grupo.base}). Responsavel: ${currentUser?.nome}.`,
        status_anterior: opl.status_geral, status_novo: 'Em Analise Engenharia',
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
    } finally {
      setIniciandoLote(false);
      fetchAll();
    }
  };

  const liberarBomLote = async () => {
    const { irmaos } = modalBomLote;
    const selecionados = irmaos.filter(o => selecionadosLote[o.id]);
    if (selecionados.length === 0) { alert('Selecione ao menos uma OP.'); return; }
    const bom = bomPreenchida(bomLote);
    if (!bom.length) { alert('Preencha a BOM com pelo menos 1 item: o material de cada unidade.'); return; }
    if (!await confirmarComPendenciasAbertas(selecionados)) return;
    setLiberandoLote(true);
    const agora = new Date().toISOString();
    try {
      // 7.51: para na primeira OP que não grava; histórico, WhatsApp e demandas de fabricação só valem para as que gravaram
      const liberadas = [];
      for (const opl of selecionados) {
        const inicio = opl.data_inicio_engenharia ? new Date(opl.data_inicio_engenharia) : null;
        const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(opl.tempo_pausado_horas) || 0)) : 0;
        const { error: erroLib } = await supabase.from('oples').update({
          status_geral: 'Em Espera PCP',
          status_bom: 'BOM Liberado',
          obs_liberacao_bom: obsBomLote,
          bom_itens: bom,
          data_liberacao_bom: agora,
          tempo_engenharia_horas: tempo,
          responsavel_engenharia: opl.responsavel_engenharia || currentUser?.nome,
          data_inicio_engenharia: opl.data_inicio_engenharia || agora,
          pausado: false, data_pausa: null, tempo_pausado_horas: 0,
        }).eq('id', opl.id);
        if (erroLib) {
          alert(`Não foi possível liberar a BOM da OP ${opl.opl}: ${erroLib.message}\n\nO lote parou aqui: ${liberadas.length} unidade(s) foram liberadas e as demais continuam na Engenharia.`);
          break;
        }
        liberadas.push(opl);
      }
      if (liberadas.length) {
      await supabase.from('logs_movimentacao_opl').insert(liberadas.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
        evento: `BOM liberado em lote (${liberadas.length} OPs do grupo ${modalBomLote.base}). Obs: ${obsBomLote || 'Sem observacoes'}.`,
        status_anterior: opl.status_geral, status_novo: 'Em Espera PCP',
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
      notificarEvento('engenharia_libera_pcp', `*BOM liberado em lote* — ${modalBomLote.base}\n${liberadas.length} OPs enviadas para PCP.\nPor: ${currentUser?.nome}`);
      if (temFabricacao(fabBomLote)) {
        const { falhas } = await gerarDemandasFabricacao({ valor: fabBomLote, ops: liberadas, origem: 'engenharia_bom', currentUser, pintura: pinturaBomLote });
        if (falhas.length) alert('BOM liberada, mas não foi possível abrir a demanda de fabricação:\n' + falhas.join('\n'));
      }
      }
    } finally {
      setLiberandoLote(false);
      setModalBomLote(null); setObsBomLote(''); setSelecionadosLote({}); setFabBomLote(fabricacaoVazia());
      fetchAll();
    }
  };

  const devolverComercial = umaVez('devolver', async () => {
    const opl = modalDevolver;
    const agora = new Date().toISOString();
    const { error: erroDev } = await supabase.from('oples').update({
      status_geral: 'Devolvida Comercial',
      obs_devolucao: obsDevolver,
    }).eq('id', opl.id);
    // 7.51: gravação recusada seguia como se a OP tivesse voltado ao Comercial (WhatsApp enviado, janela fechada)
    if (erroDev) { alert(`Não foi possível devolver a OP ${opl.opl}: ${erroDev.message}`); return; }
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Engenharia',
      evento: `OP devolvida para Comercial. Motivo: ${obsDevolver}`,
      status_anterior: opl.status_geral, status_novo: 'Devolvida Comercial',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('engenharia_devolve_comerc', msg.oplDevolvida(opl.opl,'Comercial',obsDevolver,currentUser?.nome));
    setModalDevolver(null); setObsDevolver(''); fetchAll();
  });

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  // R16 (06/10/2026): `data_entrada` é coluna do tipo *date*; `new Date('2026-09-30')` vira 29/09 às 21h em Brasília. O dia vem do texto.
  const fmtDia = (d) => diaBR(d);
  const fmtH = (h) => h ? `${Number(h).toFixed(1)}h` : '—';

  const TIPOS_ENVIO_DIRETO = ['Envio de Material para Terceiro','Envio de Produto Vendido','Demanda Direta para Engenharia'];
  const isEnvioDireto = (o) => o.item_envio === true || TIPOS_ENVIO_DIRETO.some(t => (o.tipo_projeto||'').includes(t));


  // Etapa 12e13 (06/10/2026): a tela inteira no molde do guia (abas, tabela, selos, botões, janelas). Nenhum campo, texto, consulta,
  // gravação ou regra foi mexido: só a aparência. A cor de cada situação vem da família do guia, não de hex escrito à mão.
  const FAMILIA_OS = {
    'Em Cotação': 'info', 'Aguardando Aprovação Cliente': 'atencao', 'Em Provisionamento': 'marca', 'Aguardando Aceite SAC': 'atencao',
    'Provisionada': 'ok', 'Verificação e Orçamento': 'marca', 'Em Manutenção': 'erro', 'Manutenção Concluída': 'ok',
  };
  const trocarAba = (id) => { if (id === 'horas') setHorasAbaInicial(undefined); setAbaEng(id); };

  return (
    <div>
      {/* Análises pedidas à Engenharia ficam no botão "Análise" do topo (cada
          pessoa vê as do seu setor) — o quadro daqui saiu a pedido. */}
      {/* SELETOR DE SUB-ABAS */}
      <Abas className="acn-eng-abas" ativa={abaEng} onChange={trocarAba} itens={[
        { id: 'analise', rotulo: 'Análise', icone: mdiRulerSquareCompass },
        { id: 'desenvolvimento', rotulo: 'Desenvolvimento', icone: mdiCogOutline },
        { id: 'horas', rotulo: 'Horas/Tarefas', icone: mdiTimerOutline },
      ]} />

      {abaEng === 'desenvolvimento' ? (
        <div className="acn-eng-sub">
          <DesenvolvimentoPecasTab currentUser={currentUser} buscaInicial={buscaDeepLink} />
        </div>
      ) : abaEng === 'horas' ? (
        <div className="acn-eng-sub">
          <HorasTarefasTab currentUser={currentUser} abaInicial={horasAbaInicial} />
        </div>
      ) : <>
      {/* AGENDA */}
      <div className="acn-eng-topo">
        <AgendaWidget setor="engenharia" currentUser={currentUser} />
      </div>
      {erroLeitura && (
        <div className="acn-eng-topo">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchAll()}>Tentar de novo</Botao>}>
            Não foi possível ler as OPs da Engenharia ({erroLeitura}). Isso não quer dizer que não haja OP aguardando{opls.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
          </Faixa>
        </div>
      )}
      {erroOsAcomp && (
        <div className="acn-eng-topo">
          <Faixa tom="erro" acao={<Botao pequeno onClick={fetchOsAcomp}>Tentar de novo</Botao>}>
            Não foi possível ler o acompanhamento de OS veiculares ({erroOsAcomp}).
          </Faixa>
        </div>
      )}
      {/* OPLs em Espera ou Devolvidas */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span>OPs Aguardando Engenharia ({filtrarOpls(opls, busca).length})</span>
          {opls.filter(isEnvioDireto).length > 0 && (
            <Selo familia="atencao" ponto={false}>
              <Icone path={mdiTrayArrowUp} size={13} /> {opls.filter(isEnvioDireto).length} envio(s) direto(s) — sem producao
            </Selo>
          )}
        </div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OP aguardando Engenharia.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data Entrada</th><th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>Status</th>
                <th>Responsavel</th><th>Inicio</th><th>Tempo</th><th>Arquivos</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {(() => {
                  // Agrupa por número base (antes do sufixo /NN) — grupos com
                  // mais de 1 unidade colapsam numa única linha "LOTE" com
                  // ações em lote, ao invés de poluir a tabela com dezenas de
                  // linhas idênticas. Individual continua linha normal.
                  const listaFiltrada = filtrarOpls(opls, busca);
                  const basesJaRenderizadas = new Set();
                  const itens = [];
                  for (const o of listaFiltrada) {
                    const base = baseOplDe(o.opl);
                    const irmaos = opls.filter(x => baseOplDe(x.opl) === base);
                    if (irmaos.length > 1) {
                      if (basesJaRenderizadas.has(base)) continue;
                      basesJaRenderizadas.add(base);
                      itens.push({ tipo: 'lote', base, irmaos: [...irmaos].sort((a,b) => sufixoNum(a.opl) - sufixoNum(b.opl)) });
                    } else {
                      itens.push({ tipo: 'single', row: o });
                    }
                  }

                  const renderLinhaOpl = (o, comInfo = true) => {
                    const emAndamento = o.status_geral === 'Em Analise Engenharia';
                    const inicio = o.data_inicio_engenharia ? new Date(o.data_inicio_engenharia) : null;
                    const tempo = inicio ? Math.max(0, horasUteis(inicio, new Date()) - (Number(o.tempo_pausado_horas) || 0)) : null;
                    const envioDireto = isEnvioDireto(o);
                    const emEspera = o.status_geral === 'Em Espera Engenharia';
                    const horasSemIniciar = emEspera && !o.data_inicio_engenharia && o.data_entrada
                      ? horasUteis(o.data_entrada, new Date())
                      : 0;
                    const kpi48h = emEspera && horasSemIniciar > 48;
                    const naoLida = oplsNaoLidas.has(String(o.id));
                    // a marca da linha: vermelha se parada há mais de 48 h, âmbar se é envio direto, amarela se há alteração não vista
                    const marcaLinha = kpi48h ? 'acn-linha-alerta' : envioDireto ? 'acn-linha-envio' : naoLida ? 'acn-linha-nova' : '';
                    return (
                      <React.Fragment key={o.id}>
                      <tr className={[comInfo ? 'acn-eng-linha' : '', marcaLinha].filter(Boolean).join(' ') || undefined}>
                        <td>{fmtDia(o.data_entrada)}</td>
                        <td>
                          <LinkOpl opl={o} currentUser={currentUser} />
                          {envioDireto && (
                            <div className="acn-eng-selo-linha">
                              <Selo familia="atencao" ponto={false}><Icone path={mdiTrayArrowUp} size={13} /> ENVIO DIRETO</Selo>
                            </div>
                          )}
                        </td>
                        <td className="acn-eng-veic">
                          <VeiculoOuEnvio o={o} />
                        </td>
                        <td><span className={(o.quantidade||1)>1 ? 'acn-txt-info' : 'acn-ajuda'}>{o.quantidade||1}</span></td>
                        <td className="acn-eng-tipo">{o.tipo_projeto}</td>
                        <td>
                          <Selo familia={emAndamento ? 'info' : kpi48h ? 'erro' : 'atencao'} ponto={false}>
                            {o.status_geral}
                            {o.status_geral==='Devolvida para Engenharia' && <span className="acn-eng-revisao" title={o.obs_devolucao_pcp ? `Motivo: ${o.obs_devolucao_pcp}` : undefined}>REVISAO</span>}
                          </Selo>
                          {o.serralheria_status && (
                            <div className="acn-eng-selo-linha">
                              <Selo familia={o.serralheria_status==='Pendente' ? 'marca' : 'ok'} ponto={false}>
                                {o.serralheria_status==='Pendente'
                                  ? <><Icone path={mdiWrenchOutline} size={13} /> Liberado Parcial (Serralheria)</>
                                  : <><Icone path={mdiCheckCircleOutline} size={13} /> Serralheria concluída</>}
                              </Selo>
                            </div>
                          )}
                          {kpi48h && (
                            <div className="acn-eng-selo-linha">
                              <Selo familia="erro" ponto={false}><Icone path={mdiClockAlertOutline} size={13} /> {Math.floor(horasSemIniciar)}h sem iniciar</Selo>
                            </div>
                          )}
                        </td>
                        <td>{o.responsavel_engenharia || '—'}</td>
                        <td>{fmtDt(o.data_inicio_engenharia)}</td>
                        <td>
                          {emAndamento && tempo != null && (
                            <div>
                              <span className={o.pausado ? 'acn-txt-atencao' : undefined}>
                                {o.pausado && <Icone path={mdiPauseCircleOutline} size={13} />}{o.pausado && ' '}{fmtH(tempo)}
                              </span>
                              <div><BadgeForaExpediente /></div>
                            </div>
                          )}
                          {!(emAndamento && tempo != null) && '—'}
                        </td>
                        <td>
                          <div className="acn-acoes-linha">
                            <OplAnexosWidget opl={o} setor="Engenharia" currentUser={currentUser} tipoFixo="proposta" compact={true} />
                            <OplAnexosWidget opl={o} setor="Engenharia" currentUser={currentUser} compact={true} />
                          </div>
                        </td>
                        <td className="acn-eng-celula-acoes">
                          <div className="acn-acoes-linha quebra">
                            {!emAndamento && (
                              <Botao variante="primario" pequeno onClick={()=>abrirIniciarEng(o)}>
                                INICIAR
                              </Botao>
                            )}
                            {emAndamento && (
                              <>
                                <BotaoPausar pausado={o.pausado}
                                  onPausar={()=>pausarOpl(supabase,o).then(fetchAll)}
                                  onRetomar={()=>retomarOpl(supabase,o).then(fetchAll)} />
                                <Botao variante="primario" pequeno onClick={()=>abrirLiberarBom(o)}>
                                  LIBERAR BOM
                                </Botao>
                              </>
                            )}
                            {/* Só as ações rápidas ficam à vista; o resto no ⋯ */}
                            <MenuAcoes rotulo="Mais ações da OP" itens={[
                              { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) },
                              { rotulo: 'Observação', icone: mdiNoteTextOutline, onClick: () => { setModalObs(o); setNovaObs(''); }, oculto: !emAndamento },
                              { rotulo: 'Pedir chicote/serralheria', icone: mdiPowerPlugOutline, titulo: 'Pode abrir quantas demandas precisar', onClick: () => setModalFabricacao(o), oculto: !emAndamento },
                              { rotulo: 'Liberação parcial p/ Serralheria', icone: mdiWrenchOutline, titulo: 'Antecipar a parte metálica/estrutural sem esperar o resto do BOM',
                                onClick: () => { setModalSerralheria(o); setObsSerralheria(''); }, oculto: !emAndamento || !!o.serralheria_status },
                              { rotulo: 'Devolver ao Comercial', icone: mdiArrowULeftTop, onClick: () => { setModalDevolver(o); setObsDevolver(''); }, perigo: true, oculto: !emAndamento },
                            ]} />
                          </div>
                        </td>
                      </tr>
                      {comInfo && <InfoOplEngenharia o={o} colunas={11} className={marcaLinha} />}
                      </React.Fragment>
                    );
                  };

                  return itens.map(item => {
                    if (item.tipo === 'single') return renderLinhaOpl(item.row);

                    const { base, irmaos } = item;
                    const expandido = !!lotesExpandidos[base];
                    const qtdEspera = irmaos.filter(o => o.status_geral === 'Em Espera Engenharia' || o.status_geral === 'Devolvida para Engenharia').length;
                    const qtdAndamento = irmaos.filter(o => o.status_geral === 'Em Analise Engenharia').length;
                    const rep = irmaos[0];
                    const envioDireto = isEnvioDireto(rep);
                    return (
                      <React.Fragment key={base}>
                        <tr className="acn-eng-linha acn-linha-marca">
                          <td>{fmtDia(rep.data_entrada)}</td>
                          <td>
                            <strong className="acn-alm-lote"><Icone path={mdiLinkVariant} size={14} /> {base}</strong>
                            <div className="acn-eng-selo-linha acn-selos">
                              <Selo familia="marca" ponto={false}>
                                LOTE — {irmaos.length} unidades
                              </Selo>
                              {envioDireto && (
                                <Selo familia="atencao" ponto={false}><Icone path={mdiTrayArrowUp} size={13} /> ENVIO DIRETO</Selo>
                              )}
                              {lotePedidoIgual(irmaos)
                                ? <Selo familia="ok" ponto={false} title="Todas as unidades têm os mesmos itens vendidos: dá para tratar o lote como uma coisa só">carros iguais</Selo>
                                : <Selo familia="atencao" ponto={false} title="As unidades NÃO têm todas os mesmos itens vendidos — confira unidade por unidade">itens diferentes</Selo>}
                            </div>
                          </td>
                          <td>—</td>
                          <td><span className="acn-txt-info">{irmaos.length}</span></td>
                          <td className="acn-eng-tipo">{rep.tipo_projeto}</td>
                          <td>
                            {qtdEspera > 0 && <div><Selo familia="atencao" ponto={false}>{qtdEspera} aguardando</Selo></div>}
                            {qtdAndamento > 0 && <div className="acn-eng-selo-linha"><Selo familia="info" ponto={false}>{qtdAndamento} em análise</Selo></div>}
                          </td>
                          <td colSpan={3} className="acn-ajuda">Ver unidades para detalhes individuais</td>
                          <td className="acn-eng-celula-acoes">
                            <div className="acn-acoes-linha quebra">
                              {qtdEspera > 0 && (
                                <Botao variante="primario" pequeno icone={mdiPlayOutline} disabled={iniciandoLote} onClick={()=>iniciarLote(item)}>
                                  INICIAR EM LOTE ({qtdEspera})
                                </Botao>
                              )}
                              <Botao variante="primario" pequeno icone={mdiCheckCircleOutline} onClick={()=>abrirBomLote(rep)}>
                                LIBERAR BOM EM LOTE
                              </Botao>
                              <Botao pequeno icone={mdiClipboardTextOutline} title="Resumo do lote como uma coisa só: etapas, valores e itens vendidos" onClick={()=>setResumoLote({ base, irmaos })}>
                                Resumo
                              </Botao>
                              <Botao variante="discreto" pequeno icone={expandido ? mdiChevronUp : mdiChevronDown} onClick={()=>setLotesExpandidos(s=>({...s,[base]:!expandido}))}>
                                {expandido ? 'Ocultar unidades' : `Ver ${irmaos.length} unidades`}
                              </Botao>
                            </div>
                          </td>
                        </tr>
                        <InfoOplEngenharia o={rep} colunas={11} className="acn-linha-marca" />
                        {expandido && irmaos.map(o => renderLinhaOpl(o, !mesmaInfoComercial(o, rep)))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DemandaAvulsaPanel currentUser={currentUser} setor="Engenharia" />

      {/* ── ACOMPANHAMENTO SAC VEICULAR ── */}
      {osAcomp.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr acn-eng-hdr-erro">
            <span className="acn-alm-titulo"><Icone path={mdiCarOutline} size={16} /> Acompanhamento de OS Veiculares ({osAcomp.length})</span>
            <span className="acn-ajuda">Somente observações — agendamento é exclusivo da Produção</span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Ação</th>
              </tr></thead>
              <tbody>
                {osAcomp.map(os => (
                  <tr key={os.id}>
                    <td><strong>{os.numero_os}</strong></td>
                    <td className="acn-texto-medio">{os.cliente_nome}</td>
                    <td className="acn-texto-medio">
                      <div>{semDado(os.modelo) ? <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={13} /> sem modelo</span> : os.modelo}</div>
                      <div className="acn-ajuda">{semDado(os.chassi) ? <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={13} /> sem chassi</span> : <><Icone path={mdiWrenchOutline} size={13} /> {os.chassi}</>}</div>
                    </td>
                    <td><Tag>{os.tipo_avaliacao||'—'}</Tag></td>
                    <td><Selo familia={FAMILIA_OS[os.status] || 'neutro'} ponto={false}>{os.status}</Selo></td>
                    <td>{os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      <Botao variante="primario" pequeno icone={mdiNoteTextOutline}
                        onClick={()=>{ setModalObsAcomp(os); setNovaObsAcomp(''); }}>
                        Obs.
                      </Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Observação de Acompanhamento */}
      {modalObsAcomp && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Acompanhamento da OS">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiNoteTextOutline} size={16} /> Acompanhamento — {modalObsAcomp.numero_os}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Cliente: {modalObsAcomp.cliente_nome} · Status: <strong>{modalObsAcomp.status}</strong>
              </div>
              {Array.isArray(modalObsAcomp.logs_acompanhamento_eng) && modalObsAcomp.logs_acompanhamento_eng.length > 0 && (
                <div className="acn-quadro acn-eng-logs">
                  {modalObsAcomp.logs_acompanhamento_eng.map((l,i) => (
                    <div key={i} className="acn-eng-log">
                      <span className="acn-ajuda">{l.hora ? new Date(l.hora).toLocaleString('pt-BR') : ''} · {l.usuario||''}</span>
                      <div>{l.texto}</div>
                    </div>
                  ))}
                </div>
              )}
              <Faixa tom="atencao">
                Engenharia pode adicionar observações técnicas. Agendamento é exclusivo da Produção.
              </Faixa>
              <div className="form-group">
                <label className="acn-label" htmlFor="eng-obs-os">Nova Observação</label>
                <textarea id="eng-obs-os" className="acn-input" rows={3}
                  placeholder="Observação técnica, pontos de atenção..."
                  value={novaObsAcomp} onChange={e=>setNovaObsAcomp(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={addObsAcompanhamento}>SALVAR OBS.</Botao>
              <Botao onClick={()=>setModalObsAcomp(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      <DemandasSetorWidget setor="Engenharia" cor="#2563eb" currentUser={currentUser} />
      <OplMovimentadas setor="Engenharia" />
      <DemandaFooter setor="Engenharia" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}
      {resumoLote && <ResumoLoteOpl base={resumoLote.base} irmaos={opls.filter(x => baseOplDe(x.opl) === resumoLote.base)} onClose={() => setResumoLote(null)} onAbrirUnidade={(u: any) => { setResumoLote(null); setModalVer(u); }} />}

      {/* MODAL INICIAR ENGENHARIA */}
      {modalIniciar && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Iniciar análise">
            <div className="acn-modal-cab">
              <span className="modal-title">Iniciar Analise — Engenharia</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-quadro">
                <div><strong>OP:</strong> {modalIniciar.opl} | <strong>Chassi:</strong> {modalIniciar.chassi || '—'}</div>
                <div><strong>Tipo:</strong> {modalIniciar.tipo_projeto}</div>
                {isEnvioDireto(modalIniciar) && (
                  <Faixa tom="atencao" icone={mdiTrayArrowUp}>
                    ENVIO DIRETO — sem producao na linha principal
                  </Faixa>
                )}
              </div>
              <div className="form-group">
                <label className="acn-label">Responsável pela Execução *</label>
                <ColaboradorSelect
                  value={responsavelEng} onChange={setResponsavelEng}
                  incluirUsuariosDaAba="engenharia"
                  placeholder="Selecione o responsável"
                  className="acn-input"
                  autoFocus onKeyDown={e=>e.key==='Enter'&&confirmarIniciarEng()} />
                <div className="acn-ajuda">
                  Pre-preenchido com seu nome. Altere se outra pessoa vai executar.
                </div>
              </div>

              <div className={'acn-quadro' + (precisaDesenvolvimento ? ' tom-atencao' : '')}>
                <label className="acn-check">
                  <input type="checkbox" checked={precisaDesenvolvimento}
                    onChange={e=>setPrecisaDesenvolvimento(e.target.checked)} />
                  <span><Icone path={mdiCogOutline} size={14} /> Precisa de Desenvolvimento</span>
                </label>
                {precisaDesenvolvimento && (
                  <textarea className="acn-input" rows={2} aria-label="O que precisa ser desenvolvido"
                    placeholder="O que precisa ser desenvolvido? (gera demanda automática na aba Desenvolvimento)"
                    value={descDesenvolvimento} onChange={e=>setDescDesenvolvimento(e.target.value)} />
                )}
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={confirmarIniciarEng}>
                CONFIRMAR INICIO
              </Botao>
              <Botao onClick={()=>setModalIniciar(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOM */}
      {modalBom && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-bom" role="dialog" aria-label="Liberar BOM">
            <div className="acn-modal-cab">
              <span className="modal-title">Liberar BOM — {modalBom.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                Tipo: {modalBom.tipo_projeto} | Chassi: {modalBom.chassi || '—'}
              </div>
              {isEnvioDireto(modalBom) && (
                <Faixa tom="atencao" icone={mdiTrayArrowUp}>
                  <strong>ENVIO DIRETO AO CLIENTE</strong>
                  <div>
                    Este item nao requer linha de producao. Apos BOM, PCP fara apenas a separacao no Almoxarifado
                    e o despacho direto. Chicotes / Serralheria / Lab somente se indicado no BOM.
                  </div>
                </Faixa>
              )}
              {(modalBom.itens_vendidos || []).length > 0 && (
                <div className="acn-quadro tom-info">
                  <div>
                    <strong>Vendido:</strong>{' '}
                    {modalBom.itens_vendidos.map((v: any) => `${Number(v.quantidade).toLocaleString('pt-BR')}× ${v.nome}`).join(' · ')}
                  </div>
                </div>
              )}
              {/* Conferência da estrutura: mostra o material de instalação já
                  calculado, avisa o que vai faltar e — o mais importante — cobra
                  o cadastro dos itens que nunca foram adaptados neste carro. */}
              <PainelConferenciaEstrutura opl={modalBom} currentUser={currentUser}
                onUsar={(linhas, idsConj = []) => setBomLinhas(atuais => {
                  const mapa = new Map();
                  [...(atuais || []).filter(l => (l?.item_id || String(l?.nome || '').trim()) && !idsConj.includes(String(l?.item_id))), ...linhas]
                    .forEach(l => {
                      const chave = l.item_id || `txt:${l.nome}`;
                      const ja = mapa.get(chave);
                      if (ja) ja.quantidade = Number(ja.quantidade || 0) + Number(l.quantidade || 0);
                      else mapa.set(chave, { ...l });
                    });
                  return [...mapa.values()];
                })} />
              {/* Carro parecido já adaptado antes tem a lista pronta — redigitar
                  item por item é onde nasce a diferença entre duas OPs que
                  deviam ser iguais (28/09/2026). */}
              <CopiarBomDeOutraOp oplAtual={modalBom} onCopiar={(linhas, modo) => setBomLinhas(atuais => {
                if (modo === 'substituir') return linhas;
                const mapa = new Map();
                [...(atuais || []).filter(l => l?.item_id || String(l?.nome || '').trim()), ...linhas]
                  .forEach(l => {
                    const chave = l.item_id || `txt:${l.nome}`;
                    const ja = mapa.get(chave);
                    if (ja) ja.quantidade = Number(ja.quantidade || 0) + Number(l.quantidade || 0);
                    else mapa.set(chave, { ...l });
                  });
                return [...mapa.values()];
              })} />
              <BomEditor linhas={bomLinhas} onChange={setBomLinhas} vendidos={modalBom.itens_vendidos || []} />
              <FabricacaoInternaEditor valor={fabBom} onChange={setFabBom}
                pinturaSlot={<PinturaCampos valor={pinturaBom} onChange={v => setPinturaBom(p => ({ ...p, ...v }))} />} />
              <div className="form-group">
                <label className="acn-label" htmlFor="eng-obs-bom">Observacoes para PCP/Almoxarifado</label>
                <textarea id="eng-obs-bom" className="acn-input" rows={4}
                  placeholder="Detalhes do BOM, itens especiais, pendencias..."
                  value={obsBom} onChange={e=>setObsBom(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={liberarBOM}>LIBERAR BOM</Botao>
              <Botao onClick={()=>setModalBom(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {modalFabricacao && (
        <NovaDemandaModal currentUser={currentUser} setoresDestino={SETORES_FABRICACAO} origem="engenharia"
          vinculoInicial={{ tipo:'op', id:String(modalFabricacao.id), descricao:`${modalFabricacao.opl} — ${modalFabricacao.cliente_nome||modalFabricacao.modelo||''}`.replace(/ — $/, '') }}
          onClose={()=>setModalFabricacao(null)} onSaved={fetchAll} />
      )}

      {/* MODAL LIBERAÇÃO PARCIAL SERRALHERIA — antecipa a parte metálica/estrutural sem esperar o resto do BOM */}
      {modalSerralheria && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Liberação parcial para a Serralheria">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiWrenchOutline} size={16} /> Liberar Parcial p/ Serralheria — {modalSerralheria.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                A Serralheria começa essa parte já; você continua a análise e libera o saldo do BOM pro PCP
                normalmente quando terminar (essa liberação parcial não interfere na liberação do BOM completo).
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="eng-serr">O que a Serralheria precisa fazer *</label>
                <textarea id="eng-serr" className="acn-input" rows={4}
                  placeholder="Descreva a parte metálica/estrutural a ser feita..."
                  value={obsSerralheria} onChange={e=>setObsSerralheria(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" disabled={enviandoSerralheria} onClick={liberarParcialSerralheria}>
                {enviandoSerralheria ? 'Enviando...' : 'ENVIAR PARA SERRALHERIA'}
              </Botao>
              <Botao disabled={enviandoSerralheria} onClick={()=>{setModalSerralheria(null);setObsSerralheria('');}}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BOM EM LOTE — OPs desmembradas (mesmo numero base) */}
      {modalBomLote && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-bom" role="dialog" aria-label="Liberar BOM em lote">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiTagOutline} size={16} /> Liberar BOM em Lote — {modalBomLote.base}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalBomLote.irmaos.length} OPs desmembradas deste número. Desmarque as que não devem receber este BOM
                (ex: alguma unidade com especificação diferente das demais).
              </div>
              <div className="acn-quadro acn-eng-selecao">
                {modalBomLote.irmaos.map(o => (
                  <label key={o.id} className="acn-eng-selecao-linha">
                    <input type="checkbox" checked={!!selecionadosLote[o.id]}
                      onChange={e=>setSelecionadosLote(s=>({...s,[o.id]:e.target.checked}))} />
                    <span className="acn-kb-cresce">{o.opl}</span>
                    <span className="acn-ajuda">{o.status_geral}</span>
                  </label>
                ))}
              </div>
              {/* Estrutura automática também no lote (29/09/2026): o painel só existia na liberação individual, então um lote
                  como o das 39 Renegade não usava o material calculado. A referência é a primeira OP marcada; se as marcadas
                  não têm o mesmo veículo e os mesmos itens vendidos, avisa — a mesma BOM vai para todas. */}
              {(() => {
                const marcadas = modalBomLote.irmaos.filter(o => selecionadosLote[o.id]);
                const ref = marcadas.find(o => (o.itens_vendidos || []).length);
                if (!ref) return null;
                const chave = (o) => `${o.veiculo_id || ''}|${(o.itens_vendidos || []).map(v => `${v.item_id}x${Number(v.quantidade) || 1}`).sort().join(',')}`;
                const iguais = marcadas.every(o => chave(o) === chave(ref));
                return (
                  <>
                    {!iguais && (
                      <Faixa tom="atencao">
                        As OPs marcadas <b>não têm o mesmo veículo e os mesmos itens vendidos</b>. O material calculado abaixo é o da <b>{ref.opl}</b>,
                        e a mesma BOM vai para todas — desmarque as diferentes e libere-as à parte.
                      </Faixa>
                    )}
                    {/* respostas diferentes entre as marcadas: a mesma BOM iria para todas (29/09/2026) */}
                    <AvisoRespostasDiferentes ops={marcadas} refOpl={ref.opl} versao={versaoRespostas} />
                    <div className="acn-ajuda">Estrutura calculada com base na OP <b>{ref.opl}</b>.</div>
                    <PainelConferenciaEstrutura opl={ref} currentUser={currentUser} opsParaResponder={marcadas}
                      onRespondido={() => setVersaoRespostas(v => v + 1)}
                      onUsar={(linhas, idsConj = []) => setBomLote(atuais => {
                        const mapa = new Map();
                        [...(atuais || []).filter(l => (l?.item_id || String(l?.nome || '').trim()) && !idsConj.includes(String(l?.item_id))), ...linhas]
                          .forEach(l => {
                            const c = l.item_id || `txt:${l.nome}`;
                            const ja = mapa.get(c);
                            if (ja) ja.quantidade = Number(ja.quantidade || 0) + Number(l.quantidade || 0);
                            else mapa.set(c, { ...l });
                          });
                        return [...mapa.values()];
                      })} />
                  </>
                );
              })()}
              <BomEditor linhas={bomLote} onChange={setBomLote}
                vendidos={(modalBomLote.irmaos.find(o => (o.itens_vendidos || []).length) || {}).itens_vendidos || []} />
              <div className="acn-ajuda">A mesma BOM (por unidade) vai para todas as OPs selecionadas; ajuste uma unidade diferente depois, no detalhe dela.</div>
              <FabricacaoInternaEditor valor={fabBomLote} onChange={setFabBomLote} qtdOps={Object.values(selecionadosLote).filter(Boolean).length}
                pinturaSlot={<PinturaCampos valor={pinturaBomLote} onChange={v => setPinturaBomLote(p => ({ ...p, ...v }))} />} />
              <div className="form-group">
                <label className="acn-label" htmlFor="eng-obs-lote">Observações para PCP/Almoxarifado (aplicadas a todas as selecionadas)</label>
                <textarea id="eng-obs-lote" className="acn-input" rows={4}
                  placeholder="Detalhes do BOM, itens especiais, pendencias..."
                  value={obsBomLote} onChange={e=>setObsBomLote(e.target.value)} />
              </div>
              <Faixa tom="atencao">
                OPs que ainda não foram iniciadas na Engenharia serão marcadas como iniciadas agora mesmo (responsável: você),
                já que a liberação em lote pula a etapa individual de "Iniciar".
              </Faixa>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={liberarBomLote} disabled={liberandoLote}>
                {liberandoLote ? 'Liberando...' : `LIBERAR BOM PARA ${Object.values(selecionadosLote).filter(Boolean).length} OPs`}
              </Botao>
              <Botao onClick={()=>setModalBomLote(null)} disabled={liberandoLote}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBS */}
      {modalObs && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Observações da OP">
            <div className="acn-modal-cab">
              <span className="modal-title">Observacoes — {modalObs.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              {(modalObs.logs_engenharia||[]).length > 0 && (
                <div className="acn-quadro acn-eng-logs">
                  {(modalObs.logs_engenharia||[]).map((l,i) => (
                    <div key={i} className="acn-eng-log">
                      <strong>{l.usuario}</strong> — {new Date(l.hora).toLocaleString('pt-BR')}<br/>{l.texto}
                    </div>
                  ))}
                </div>
              )}
              <textarea className="acn-input" rows={3} aria-label="Nova observação"
                placeholder="Nova observacao..."
                value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={addObs}>SALVAR</Botao>
              <Botao onClick={()=>setModalObs(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVOLVER */}
      {modalDevolver && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-eng-jan" role="dialog" aria-label="Devolver para o Comercial">
            <div className="acn-modal-cab">
              <span className="modal-title">Devolver para Comercial — {modalDevolver.opl}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="form-group">
                <label className="acn-label" htmlFor="eng-dev">Motivo / Observacao *</label>
                <textarea id="eng-dev" className="acn-input" rows={3}
                  placeholder="Descreva o motivo da devolucao..."
                  value={obsDevolver} onChange={e=>setObsDevolver(e.target.value)} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="perigo" onClick={devolverComercial}>CONFIRMAR DEVOLUCAO</Botao>
              <Botao onClick={()=>setModalDevolver(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
