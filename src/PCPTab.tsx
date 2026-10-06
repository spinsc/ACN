// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoOuEnvio } from './AcnTabShared';
import { soEnvio, fluxoLabel, fluxoEfetivo, STATUS_EMBALAGEM, SERRALHERIA_SANADO } from './FluxoEntrega';
import { indicePendencias, ChecklistPendencias, travaConclusaoProducao, liberaveisPeloPcp } from './OpPendencias';
import { PinturaCampos } from './PinturaSerralheria';
import { notificarEvento, msg } from './whatsappHelper';
import { horasUteis } from './utils/horasUteis';
import { logChange, useUnreadMap } from './AuditSystem';
import DemandaAvulsaPanel from './DemandaAvulsaPanel';
import { FabricacaoInternaEditor, gerarDemandasFabricacao, fabricacaoVazia, temFabricacao, sugerirFabricacao, itemVazio, SETORES_FABRICACAO } from './DemandaItens';
import { ModalDevolverOp } from './DevolverOp';
import { confirmar } from './Feedback';
import { MenuAcoes, Botao, Faixa, Selo, diaBR } from './Interface';
import Icone from './Icone';
import {
  mdiClipboardTextOutline, mdiCancel, mdiPackageVariantClosed, mdiWrenchOutline, mdiToolboxOutline, mdiTrayArrowUp, mdiEyeOutline, mdiPlus, mdiArrowULeftTop, mdiLinkVariant, mdiFactory, mdiChevronUp, mdiChevronDown, mdiCheckCircleOutline, mdiCheckboxMarkedOutline, mdiCheckboxBlankOutline,
} from '@mdi/js';
import { reservarParaOp, textoPedidosDaReserva } from './Estoque';


// setores que recebem demanda avulsa (cada um tem o seu painel)
const SETORES = ['Chicotes','Serralheria','Laboratorio','Telecom','Compras','Almoxarifado','Engenharia'];
const semDado = (v) => !v || !String(v).trim();

// ─── O QUE PEDE O PCP AGORA (Etapa 9 do plano de UX, 30/09/2026) ─────────────
// A tela empilhava a Triagem e cinco blocos de alerta com o mesmo peso: com o dado real de 30/09 eram
// ~6.400 px, e os dois blocos mais altos (Serralheria, ~1.400 px, e Pendências de fabricação, ~3.900 px)
// não tinham NENHUMA linha esperando o PCP — só aguardavam a Serralheria e os setores. Por isso cada
// bloco agora separa o que pede ação DO PCP do que é só acompanhamento: quem tem ação abre sozinho, quem
// só acompanha abre recolhido (um clique abre), e a faixa do topo diz onde agir e leva até lá.
// O abrir/recolher é o global do DashboardTab (a classe `sec-collapsed` no cartão); o estado inicial
// vem do className, e só muda de novo se o bloco passar a pedir (ou deixar de pedir) ação.
const irParaBloco = (id: string) => {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.remove('sec-collapsed');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function ChipPrioridade({ icone, nome, total, acao, alvo, textoAcao, textoAcomp }: any) {
  const pede = acao > 0;
  return (
    <button type="button" onClick={() => irParaBloco(alvo)} data-pcp-chip={alvo} className="acn-pcp-chip" data-acn-familia={pede ? 'atencao' : 'neutro'}>
      <Icone path={icone} size={18} />
      <span>
        <span className="acn-pcp-chip-nome">{nome} · {total}</span>
        <span className={'acn-pcp-chip-sub' + (pede ? ' pede' : '')}>
          {pede ? `${acao} ${textoAcao}` : textoAcomp}
        </span>
      </span>
    </button>
  );
}

// aparece no cabeçalho do bloco, que continua visível quando ele está recolhido
function PilulaAcao({ acao, textoAcao, textoAcomp }: any) {
  const pede = acao > 0;
  return (
    <span className="acn-pcp-pilula">
      <Selo familia={pede ? 'atencao' : 'neutro'} ponto={false}>{pede ? `${acao} ${textoAcao}` : textoAcomp}</Selo>
    </span>
  );
}

export default function PCPTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [oplsFalta, setOplsFalta] = useState([]);
  const [loading, setLoading] = useState(false);
  // Linhas com alteração não vista por este usuário ganham borda amarela —
  // mesmo padrão usado nas outras telas de OP (ver AuditSystem.tsx).
  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', opls.map((o: any) => o.id), currentUser);
  const [modalDevolver, setModalDevolver] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [obsDevolver, setObsDevolver] = useState('');
  const [busca, setBusca] = useState('');
  // Vínculo pronto pra abrir a Nova Demanda Avulsa já ligada àquela OP — ver
  // botão "+Demanda" por linha da tabela e o painel montado mais abaixo.
  const [pendingVinculoOP, setPendingVinculoOP] = useState(null);
  // OPs desmembradas (mesmo numero base, sufixo /01../NN) agrupadas numa
  // linha de lote — mesmo padrao da Engenharia (EngenhariaTab.tsx).
  const [lotesExpandidos, setLotesExpandidos] = useState({});
  const [processandoLote, setProcessandoLote] = useState(false);
  // Liberar kiting abre esta janela: dá para pedir chicotes/serralheria junto
  const [modalKiting, setModalKiting] = useState<any>(null);   // { ops, grupo? }
  const [fabKiting, setFabKiting] = useState<any>(fabricacaoVazia());
  const [liberandoKiting, setLiberandoKiting] = useState(false);
  // Controle de liberação parcial p/ Serralheria — Engenharia pode antecipar
  // a parte metálica/estrutural sem esperar o resto do BOM, então essas OPs
  // aparecem aqui mesmo antes de "Em Espera PCP" (a trilha é independente do
  // status_geral normal). PCP acompanha e "sana" a pendência quando a
  // Serralheria termina.
  const [oplsSerralheria, setOplsSerralheria] = useState([]);
  const [sanandoSerralheria, setSanandoSerralheria] = useState(null);
  // (o abrir/recolher do painel de Serralheria era um estado próprio; foi para o recolhimento global do
  // cartão — dois controles para a mesma coisa brigariam com o estado inicial da Etapa 9)
  // Solicitações de reposição do Almoxarifado aguardando liberação do PCP —
  // ver AlmoxarifadoTab.tsx (onde são criadas) e a rota de liberarSolicitacaoAlmox
  // abaixo (roteia pra OFI se fabricação interna, senão pra Compras).
  const [solicitacoesAlmox, setSolicitacoesAlmox] = useState([]);
  const [liberandoSolic, setLiberandoSolic] = useState(null);

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  // Etapa 7.52 (06/10/2026): leitura que falha não pode parecer "nenhuma OP em triagem" nem "nada em falta" (e a atualização de
  // 30 s que falha não pode esvaziar a tela): cada bloco só troca o que já tinha quando a leitura dele deu certo.
  const [erroLeitura, setErroLeitura] = useState('');
  // 7.52: um clique duplo em "Liberar …" gravava duas vezes (duas linhas de histórico, dois avisos, duas reservas de estoque).
  // Uma ação por vez, por OP e tipo.
  const emAcao = useRef(new Set());
  const umaVez = (chave, fn) => async (...args) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, faltaRes, serralheriaRes, solicRes] = await Promise.all([
      supabase.from('oples').select('*')
        .in('status_geral', ['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP','Devolvida PCP','Retrabalho'])
        .order('data_entrada', { ascending: false }),
      supabase.from('oples').select('id,opl,chassi,modelo,placa,tipo_projeto,status_almox,obs_almox,responsavel_almox,data_kiting,fluxo_entrega,quantidade')
        .in('status_almox', ['Falta de Material','Liberado com Pendencia']),
      supabase.from('oples').select('id,opl,chassi,modelo,cliente_nome,status_geral,serralheria_status,fluxo_entrega,quantidade,tipo_projeto')
        .in('serralheria_status', ['Pendente','Concluido']).order('data_entrada', { ascending: false }),
      supabase.from('almoxarifado_solicitacoes_reposicao').select('*')
        .eq('status', 'Aguardando Liberação PCP').order('criado_em', { ascending: false }),
    ]);
    const falhas = [oplsRes, faltaRes, serralheriaRes, solicRes].map(r => r.error).filter(Boolean);
    setErroLeitura(falhas.length ? falhas[0].message : '');
    if (!oplsRes.error) setOpls(oplsRes.data || []);
    if (!faltaRes.error) setOplsFalta(faltaRes.data || []);
    carregarPendenciasAbertas();
    if (!serralheriaRes.error) setOplsSerralheria(serralheriaRes.data || []);
    if (!solicRes.error) setSolicitacoesAlmox(solicRes.data || []);
    if (!silent) setLoading(false);
  };

  // Libera a solicitação de reposição do Almoxarifado — roteia sozinho pra
  // uma OFI (se o item é fabricado internamente) ou pra Compras (senão),
  // reaproveitando o vínculo opcional que veio junto do pedido.
  const liberarSolicitacaoAlmox = async (sol) => {
    setLiberandoSolic(sol.id);
    const agora = new Date().toISOString();
    const nome = currentUser?.nome || currentUser?.email || 'PCP';
    const { data: itemRow, error: erroItem } = await supabase.from('cadastro_itens')
      .select('origem_producao,setor_fabricante').eq('id', sol.item_id).maybeSingle();
    // 7.52: sem ler o cadastro do item a solicitação ia sempre para Compras, mesmo quando o item é fabricado aqui dentro (OFI)
    if (erroItem) { alert('Não foi possível ler o cadastro do item (' + erroItem.message + '). A solicitação não foi liberada.'); setLiberandoSolic(null); return; }

    if (itemRow?.origem_producao === 'interna' && itemRow?.setor_fabricante) {
      const { data: ofi, error } = await supabase.from('ofis').insert([{
        numero_ofi: `OFI-${Date.now()}`,
        setor_destino: itemRow.setor_fabricante,
        descricao: `${sol.item_nome}${sol.motivo ? ' — ' + sol.motivo : ''}`,
        quantidade: sol.quantidade, item_id: sol.item_id,
        origem: 'almoxarifado', origem_id: String(sol.id),
        vinculo_tipo: sol.vinculo_tipo, vinculo_id: sol.vinculo_id, vinculo_descricao: sol.vinculo_descricao,
        criado_por: sol.criado_por, criado_por_nome: sol.criado_por_nome,
      }]).select('id').single();
      if (error) { alert('Erro ao criar OFI: ' + error.message); setLiberandoSolic(null); return; }
      const { error: erroSol } = await supabase.from('almoxarifado_solicitacoes_reposicao').update({
        status: 'Roteado OFI', ofi_id: ofi.id, liberado_por_nome: nome, liberado_em: agora,
      }).eq('id', sol.id);
      // 7.52: a OFI já nasceu; se a solicitação não for marcada, ela continua na fila e liberar de novo abriria uma segunda OFI
      if (erroSol) alert('A OFI foi aberta, mas a solicitação não foi marcada como liberada (' + erroSol.message + '). NÃO libere de novo: abriria uma segunda OFI.');
      notificarEvento('pcp_libera_reposicao', `PCP liberou reposição de "${sol.item_nome}" — OFI aberta para ${itemRow.setor_fabricante}. Liberado por: ${nome}`);
    } else {
      const { data: pedido, error } = await supabase.from('pcp_pedidos_compra').insert([{
        numero_pedido: `PC-ALX-${Date.now()}`,
        descricao_material: `${sol.item_nome}${sol.motivo ? ' — ' + sol.motivo : ''}`,
        quantidade: sol.quantidade, status_compra: 'Pendente',
        // a lista de material vai junto, como em toda solicitação de compra (05/10/2026)
        itens: [{ nome: sol.item_nome, quantidade: Number(sol.quantidade) || 1, descricao: sol.motivo || '', item_id: sol.item_id || null }],
        criado_por: sol.criado_por, criado_por_nome: sol.criado_por_nome, criado_por_setor: 'Almoxarifado',
        data_criacao: agora,
      }]).select('id').single();
      if (error) { alert('Erro ao criar pedido de compra: ' + error.message); setLiberandoSolic(null); return; }
      const { error: erroSol } = await supabase.from('almoxarifado_solicitacoes_reposicao').update({
        status: 'Roteado Compras', pedido_compra_id: pedido.id, liberado_por_nome: nome, liberado_em: agora,
      }).eq('id', sol.id);
      // 7.52: o pedido de compra já nasceu; liberar de novo abriria um segundo pedido
      if (erroSol) alert('O pedido de compra foi aberto, mas a solicitação não foi marcada como liberada (' + erroSol.message + '). NÃO libere de novo: abriria um segundo pedido.');
      notificarEvento('pcp_libera_reposicao', `PCP liberou reposição de "${sol.item_nome}" — pedido enviado a Compras. Liberado por: ${nome}`);
    }
    setLiberandoSolic(null);
    fetchAll();
  };

  const sanarPendenciaSerralheria = async (opl) => {
    setSanandoSerralheria(opl.id);
    const agora = new Date().toISOString();
    // 'Sanado' é o passo final da liberação parcial de BOM (ver SERRALHERIA_SANADO em FluxoEntrega.ts)
    const { error: erroSan } = await supabase.from('oples').update({ serralheria_status: SERRALHERIA_SANADO }).eq('id', opl.id);
    if (erroSan) { alert(`Não foi possível sanar a pendência de Serralheria da OP ${opl.opl}: ${erroSan.message}`); setSanandoSerralheria(null); return; }   // 7.52
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `PCP sanou a pendência de Serralheria (serviço concluído e conferido).`,
      status_anterior: opl.status_geral, status_novo: opl.status_geral,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    setSanandoSerralheria(null);
    fetchAll();
  };

  // ── Pendências de fabricação/compra que o PCP precisa liberar ─────────────
  // Depois que o setor conclui e o Almoxarifado confirma o recebimento, é o PCP
  // que solta aquela peça para a produção. Sem isso a produção não fecha a OP.
  const [oplsPendencia, setOplsPendencia] = useState([]);
  const [pendPorOp, setPendPorOp] = useState(new Map());
  const carregarPendenciasAbertas = async () => {
    const mapa = await indicePendencias();
    setPendPorOp(mapa);
    const ids = [...mapa.keys()];
    if (!ids.length) { setOplsPendencia([]); return; }
    const { data, error } = await supabase.from('oples')
      .select('id,opl,cliente_nome,modelo,chassi,placa,status_geral,status_almox,pendencias_kit,quantidade,fluxo_entrega,tipo_projeto')
      .in('id', ids)
      .not('status_geral', 'in', '("Faturado","Faturado e Disponivel para Entrega","Cancelado")');
    if (error) { setErroLeitura(error.message); return; }   // 7.52: fica o bloco que já estava na tela
    // só as que realmente têm etapa faltando
    setOplsPendencia((data || []).filter(o => travaConclusaoProducao(mapa.get(String(o.id)) || [], o).length));
  };

  const liberarProducao = async (opl) => {
    const agora = new Date().toISOString();
    const inicioPcp = opl.data_liberacao_bom ? new Date(opl.data_liberacao_bom) : null;
    const tempoPcp = inicioPcp ? horasUteis(inicioPcp, new Date()) : null;
    const { error: erroLib } = await supabase.from('oples').update({
      status_geral: 'Aguardando Inicio Producao',
      data_liberacao_pcp: agora,
      liberado_producao_por: currentUser?.nome,
      ...(tempoPcp != null ? { tempo_pcp_horas: tempoPcp } : {}),
    }).eq('id', opl.id);
    // 7.52: a gravação recusada seguia como se a OP tivesse ido para a Produção (WhatsApp enviado, linha sumindo só na tela)
    if (erroLib) { alert(`Não foi possível liberar a OP ${opl.opl} para a Produção: ${erroLib.message}`); return; }
    logChange({ module: 'pcp', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: 'Aguardando Inicio Producao' }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `OP liberada para Producao por ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando Inicio Producao',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('pcp_libera_producao', msg.oplEnviada(opl.opl,'Produção',currentUser?.nome));
    fetchAll();
  };
  const liberarProducaoUmaVez = (opl) => umaVez('producao-' + opl.id, liberarProducao)(opl);

  // OP de envio não passa por produção: do PCP ela vai para a embalagem no
  // Almoxarifado, que pesa, mede e abre a cotação de frete (ver FluxoEntrega.ts).
  // Sem esta ação a OP ficava parada em "Kit OK - Aguardando PCP": o botão de
  // produção é barrado de propósito e a tela do Almoxarifado já não a lista.
  const liberarEmbalagem = async (opl) => {
    const agora = new Date().toISOString();
    const inicioPcp = opl.data_liberacao_bom ? new Date(opl.data_liberacao_bom) : null;
    const tempoPcp = inicioPcp ? horasUteis(inicioPcp, new Date()) : null;
    const { error: erroEmb } = await supabase.from('oples').update({
      status_geral: STATUS_EMBALAGEM,
      data_liberacao_pcp: agora,
      liberado_producao_por: currentUser?.nome,
      ...(tempoPcp != null ? { tempo_pcp_horas: tempoPcp } : {}),
    }).eq('id', opl.id);
    if (erroEmb) { alert(`Não foi possível liberar a embalagem da OP ${opl.opl}: ${erroEmb.message}`); return; }   // 7.52
    logChange({ module: 'pcp', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: STATUS_EMBALAGEM }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `OP de envio liberada para embalagem no Almoxarifado por ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: STATUS_EMBALAGEM,
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    notificarEvento('pcp_libera_almox', msg.oplEnviada(opl.opl, 'Almoxarifado (embalagem)', currentUser?.nome));
    fetchAll();
  };
  const liberarEmbalagemUmaVez = (opl) => umaVez('embalagem-' + opl.id, liberarEmbalagem)(opl);

  const liberarEmbalagemLote = async (grupo) => {
    const pendentes = grupo.irmaos.filter(o => prontoParaEmbalagem(o));
    if (pendentes.length === 0) { alert('Nenhuma unidade de envio deste lote está pronta para embalagem.'); return; }
    if (!await confirmar(`Liberar embalagem de ${pendentes.length} unidade(s) de ${grupo.base}?`)) return;
    setProcessandoLote(true);
    const agora = new Date().toISOString();
    try {
      // 7.52: para na primeira que não grava; histórico e WhatsApp valem só para as que gravaram
      const liberadas = [];
      for (const opl of pendentes) {
        const { error } = await supabase.from('oples').update({
          status_geral: STATUS_EMBALAGEM, data_liberacao_pcp: agora, liberado_producao_por: currentUser?.nome,
        }).eq('id', opl.id);
        if (error) { alert(`Não foi possível liberar a embalagem da OP ${opl.opl}: ${error.message}\n\nO lote parou aqui: ${liberadas.length} unidade(s) foram liberadas e as demais continuam como estavam.`); break; }
        liberadas.push(opl);
      }
      if (liberadas.length) {
      await supabase.from('logs_movimentacao_opl').insert(liberadas.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
        evento: `OP de envio liberada para embalagem em lote (${liberadas.length} OPs do grupo ${grupo.base}) por ${currentUser?.nome}.`,
        status_anterior: opl.status_geral, status_novo: STATUS_EMBALAGEM,
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
      notificarEvento('pcp_libera_almox', `*Embalagem liberada em lote* — ${grupo.base}\n${liberadas.length} OPs de envio no Almoxarifado.\nPor: ${currentUser?.nome}`);
      }
    } finally {
      setProcessandoLote(false);
      fetchAll();
    }
  };

  // Devolução (Almoxarifado ou Engenharia): ver DevolverOp.tsx


  // Data de entrada e previsão de entrega da OP são colunas do tipo date: o dia vem do texto (R16, 05/10/2026). Antes era `new Date(d)`, que mostrava o dia anterior (0 de 6 batiam com o banco).
  const fmtDt = (d) => diaBR(d);
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const liberarAlmox = async (opl) => {
    const agora = new Date().toISOString();
    const { error: erroAlm } = await supabase.from('oples').update({
      status_geral: 'Aguardando Almox',
      data_liberacao_pcp: agora,
      liberado_producao_por: currentUser?.nome,
    }).eq('id', opl.id);
    // 7.52: a gravação recusada seguia: o material era RESERVADO para uma OP que não saiu do PCP e o Almoxarifado era avisado
    if (erroAlm) { alert(`Não foi possível liberar a OP ${opl.opl} para o Kiting: ${erroAlm.message}`); return false; }
    logChange({ module: 'pcp', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: 'Aguardando Almox' }, user: currentUser });
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `Liberado para Kiting — Almoxarifado. PCP: ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Aguardando Almox',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    // A partir daqui o material daquela OP tem dono: reserva o que estiver sob
    // controle de estoque. Não mexe no saldo — mexe no disponível, para a
    // próxima OP não contar com a mesma peça (regra do usuário em 25/09/2026).
    const res = await reservarParaOp({ oplId: opl.id, currentUser });
    if (res?.erro) alert('A OP foi liberada, mas a reserva de estoque falhou: ' + res.erro);
    else if (res?.pedidos?.length) alert(textoPedidosDaReserva(res.pedidos));
    notificarEvento('pcp_libera_almox', msg.oplEnviada(opl.opl,'Almoxarifado (Kiting)',currentUser?.nome));
    fetchAll();
    return true;
  };

  // Numero base de uma OP desmembrada: "A1419.2607/02" -> "A1419.2607".
  const baseOplDe = (opl) => (opl || '').replace(/\/\d+$/, '');
  const sufixoNum = (opl) => { const m = (opl || '').match(/\/(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

  // Ao abrir o kiting, o sistema mostra o que naquela OP é fabricado aqui
  // dentro (lendo a BOM e o cadastro de cada item: origem_producao/
  // setor_fabricante). É só SUGESTÃO: nem todo chicote precisa ser feito, boa
  // parte já está no estoque. Nada vem marcado — o PCP escolhe o que solicitar,
  // e OP sem nada marcado sai sem demanda nenhuma (regra de 21/09/2026).
  // Quando o estoque estiver controlado, com saldo e estoque mínimo, a marcação
  // passa a ser automática para o que faltar.
  const [sugestaoFab, setSugestaoFab] = useState(null);
  const [fabPedidos, setFabPedidos] = useState(new Set());
  const [pinturaKiting, setPinturaKiting] = useState({ pintura: false, pintura_tipo: '' });
  const abrirKiting = async (ops, grupo = null) => {
    if (!ops.length) { alert('Nenhuma unidade deste lote esta aguardando liberacao de kiting.'); return; }
    setFabKiting(fabricacaoVazia());
    setSugestaoFab(null);
    setFabPedidos(new Set());
    setPinturaKiting({ pintura: false, pintura_tipo: '' });
    setModalKiting({ ops, grupo });
    const { achados, origem } = await sugerirFabricacao(ops);
    if (achados.length) setSugestaoFab({ achados, origem });
  };

  // Marcar/desmarcar sugestões: entram ou saem da lista de fabricação, sem mexer no que a pessoa
  // tenha digitado à mão nem na quantidade que ela tenha ajustado nas outras já marcadas.
  // Etapa 10 do plano de UX (30/09/2026): o clique numa sugestão só e os botões "marcar todos" /
  // "todos de <setor>" / "desmarcar todos" passam pelo MESMO caminho. Nada vem marcado sozinho
  // (regra de 21/09/2026): é sempre um clique da pessoa, agora podendo ser um clique para vários.
  // Se a mesma peça aparece em duas linhas da lista, marcar as duas SOMA a quantidade (antes a segunda
  // trocava a primeira e o pedido saía menor do que a BOM pede); desmarcar uma tira só a parte dela.
  const aplicarSugestoes = (indices: number[], marcar: boolean) => {
    const achados = sugestaoFab?.achados || [];
    const alvo = indices.filter(i => marcar ? !fabPedidos.has(i) : fabPedidos.has(i));
    if (!alvo.length) return;
    const depois = new Set(fabPedidos);
    alvo.forEach(i => { if (marcar) depois.add(i); else depois.delete(i); });
    const mesmaPeca = (x, a) => x.nome === a.nome && (x.item_id || null) === (a.item_id || null);
    setFabKiting(prev => {
      const novo = { ...prev };
      const atual = new Set(fabPedidos);              // as marcas, uma a uma, na ordem em que são aplicadas
      for (const i of alvo) {
        const a = achados[i];
        const irmaMarcada = achados.some((b, j) => j !== i && atual.has(j) && b.setor === a.setor && mesmaPeca(b, a));
        const lista = (novo[a.setor] || []).filter(x => String(x.nome || '').trim());
        let nova;
        const linhaExiste = lista.some(x => mesmaPeca(x, a));      // a pessoa pode ter apagado a linha à mão
        if (marcar) {
          nova = irmaMarcada && linhaExiste
            ? lista.map(x => mesmaPeca(x, a) ? { ...x, quantidade: Number(x.quantidade) + Number(a.quantidade) } : x)
            : [...lista.filter(x => !mesmaPeca(x, a)), { nome: a.nome, quantidade: a.quantidade, descricao: a.descricao || '', item_id: a.item_id }];
          atual.add(i);
        } else {
          nova = irmaMarcada
            ? lista.map(x => mesmaPeca(x, a) ? { ...x, quantidade: Number(x.quantidade) - Number(a.quantidade) } : x)
                .filter(x => !mesmaPeca(x, a) || Number(x.quantidade) > 0)
            : lista.filter(x => !mesmaPeca(x, a));
          atual.delete(i);
        }
        novo[a.setor] = [...nova, itemVazio()];
      }
      return novo;
    });
    setFabPedidos(depois);
  };
  const alternarSugestao = (a, i) => aplicarSugestoes([i], !fabPedidos.has(i));
  const confirmarKiting = umaVez('kiting', async () => {
    const { ops, grupo } = modalKiting;
    if (liberandoKiting) return;   // 7.52: clique duplo
    setLiberandoKiting(true);
    try {
      const liberou = grupo ? await liberarKitingLote(grupo, true) : await liberarAlmox(ops[0]);
      // 7.52: se a liberação não gravou, não abre demanda de fabricação e a janela fica aberta para tentar de novo
      if (!liberou) { setLiberandoKiting(false); return; }
      if (temFabricacao(fabKiting)) {
        const { criadas, falhas } = await gerarDemandasFabricacao({ valor: fabKiting, ops, origem: 'pcp_kiting', currentUser, pintura: pinturaKiting });
        if (criadas.length) await supabase.from('logs_movimentacao_opl').insert(ops.map(opl => ({
          opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
          evento: `Demanda de fabricação aberta na liberação do kiting: ${criadas.join(', ')}.`,
          status_anterior: 'Aguardando Almox', status_novo: 'Aguardando Almox',
          usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
        })));
        if (falhas.length) alert('Kiting liberado, mas não foi possível abrir a demanda de fabricação:\n' + falhas.join('\n'));
      }
    } finally {
      setLiberandoKiting(false);
      setModalKiting(null);
      fetchAll();
    }
  });

  const liberarKitingLote = async (grupo, jaConfirmado = false) => {
    const pendentes = grupo.irmaos.filter(o => o.status_geral === 'Em Espera PCP');
    if (pendentes.length === 0) { alert('Nenhuma unidade deste lote esta aguardando liberacao de kiting.'); return; }
    if (!jaConfirmado && !await confirmar(`Liberar kiting (Almoxarifado) para ${pendentes.length} unidade(s) de ${grupo.base}?`)) return;
    setProcessandoLote(true);
    const agora = new Date().toISOString();
    let liberouAlguma = false;
    try {
      const falhasReserva: string[] = [], pedidosDoLote: string[] = [];
      // 7.52: para na primeira que não grava; reserva, histórico e WhatsApp valem só para as que gravaram
      const liberadas = [];
      for (const opl of pendentes) {
        const { error: erroKit } = await supabase.from('oples').update({
          status_geral: 'Aguardando Almox',
          data_liberacao_pcp: agora,
          liberado_producao_por: currentUser?.nome,
        }).eq('id', opl.id);
        if (erroKit) { alert(`Não foi possível liberar a OP ${opl.opl} para o Kiting: ${erroKit.message}\n\nO lote parou aqui: ${liberadas.length} unidade(s) foram liberadas e as demais continuam como estavam.`); break; }
        liberadas.push(opl);
        // mesma reserva da liberação individual — o lote não pode ser um
        // caminho por onde o material escapa sem dono
        const res = await reservarParaOp({ oplId: opl.id, currentUser });
        if (res?.erro) falhasReserva.push(`${opl.opl}: ${res.erro}`);
        (res?.pedidos || []).forEach(p => pedidosDoLote.push(`${opl.opl} — ${p.nome}: ${p.quantidade}`));
      }
      // num lote de 90 carros isso pode ser muita linha: resume em vez de
      // despejar um alerta por OP
      if (pedidosDoLote.length) {
        alert(`Faltou material e ${pedidosDoLote.length} pedido(s) foram abertos sozinhos:\n\n`
          + pedidosDoLote.slice(0, 15).join('\n')
          + (pedidosDoLote.length > 15 ? `\n… e mais ${pedidosDoLote.length - 15}.` : '')
          + `\n\nAcompanhe pelo Compras ou pelo setor que fabrica.`);
      }
      if (falhasReserva.length) {
        alert(`As OPs foram liberadas, mas a reserva de estoque falhou em:\n${falhasReserva.join('\n')}`);
      }
      if (liberadas.length) {
        await supabase.from('logs_movimentacao_opl').insert(liberadas.map(opl => ({
          opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
          evento: `Liberado para Kiting em lote (${liberadas.length} OPs do grupo ${grupo.base}). PCP: ${currentUser?.nome}.`,
          status_anterior: opl.status_geral, status_novo: 'Aguardando Almox',
          usuario_nome: currentUser?.nome, data_hora: agora,
        })));
        notificarEvento('pcp_libera_almox', `*Kiting liberado em lote* — ${grupo.base}\n${liberadas.length} OPs enviadas para o Almoxarifado.\nPor: ${currentUser?.nome}`);
      }
      liberouAlguma = liberadas.length > 0;
    } finally {
      setProcessandoLote(false);
      fetchAll();
    }
    return liberouAlguma;
  };

  const liberarProducaoLote = async (grupo) => {
    const pendentes = grupo.irmaos.filter(o => podeLiberar(o));
    if (pendentes.length === 0) { alert('Nenhuma unidade deste lote esta pronta para liberar producao (falta kit).'); return; }
    if (!await confirmar(`Liberar producao para ${pendentes.length} unidade(s) de ${grupo.base}?`)) return;
    setProcessandoLote(true);
    const agora = new Date().toISOString();
    try {
      // 7.52: para na primeira que não grava; histórico e WhatsApp valem só para as que gravaram
      const liberadas = [];
      for (const opl of pendentes) {
        const inicioPcp = opl.data_liberacao_bom ? new Date(opl.data_liberacao_bom) : null;
        const tempoPcp = inicioPcp ? horasUteis(inicioPcp, new Date()) : null;
        const { error } = await supabase.from('oples').update({
          status_geral: 'Aguardando Inicio Producao',
          data_liberacao_pcp: agora,
          liberado_producao_por: currentUser?.nome,
          ...(tempoPcp != null ? { tempo_pcp_horas: tempoPcp } : {}),
        }).eq('id', opl.id);
        if (error) { alert(`Não foi possível liberar a OP ${opl.opl} para a Produção: ${error.message}\n\nO lote parou aqui: ${liberadas.length} unidade(s) foram liberadas e as demais continuam como estavam.`); break; }
        liberadas.push(opl);
      }
      if (liberadas.length) {
      await supabase.from('logs_movimentacao_opl').insert(liberadas.map(opl => ({
        opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
        evento: `OP liberada para Producao em lote (${liberadas.length} OPs do grupo ${grupo.base}) por ${currentUser?.nome}.`,
        status_anterior: opl.status_geral, status_novo: 'Aguardando Inicio Producao',
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
      notificarEvento('pcp_libera_producao', `*Produção liberada em lote* — ${grupo.base}\n${liberadas.length} OPs enviadas para Produção.\nPor: ${currentUser?.nome}`);
      }
    } finally {
      setProcessandoLote(false);
      fetchAll();
    }
  };

  const sanarPendenciaPCP = async (opl) => {
    const agora = new Date().toISOString();
    const { error: erroSanar } = await supabase.from('oples').update({
      status_almox: 'Kit OK',
      status_geral: 'Kit OK - Aguardando PCP',
      obs_almox: 'Pendencia/falta sanada pelo PCP.',
    }).eq('id', opl.id);
    if (erroSanar) { alert(`Não foi possível sanar a pendência da OP ${opl.opl}: ${erroSanar.message}`); return; }   // 7.52
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'PCP',
      evento: `Pendencia/falta de material sanada. Kit liberado. PCP: ${currentUser?.nome}`,
      status_anterior: opl.status_geral, status_novo: 'Kit OK - Aguardando PCP',
      usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    fetchAll();
  };
  const sanarPendenciaPCPUmaVez = (opl) => umaVez('sanar-' + opl.id, sanarPendenciaPCP)(opl);


  // PCP só pode liberar quando Almox concluiu (100% OK ou com pendência aceita)
  // Falta de Material = PCP vê o alerta mas NÃO pode liberar — aguarda reposição
  // OP de fluxo de envio NUNCA vai pra linha de producao, nem pela porta dos
  // fundos do "Liberado com Pendencia": ela e separada, embalada e enviada.
  // Sem esta guarda, faltar material num envio permitia o PCP mandar pra
  // Adaptacao assim mesmo -- exatamente o que o fluxo_entrega existe pra evitar.
  // O tipo de projeto "Venda para Envio" já diz a rota: vale como envio mesmo se o
  // campo Fluxo de Entrega tiver ficado em branco. Sem isso, unidades do mesmo lote
  // se dividiam entre produção e envio conforme o campo estivesse preenchido ou não.
  const ehEnvio = (o) => soEnvio(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega));
  const podeLiberar = (o) =>
    !ehEnvio(o) && (
      o.status_geral === 'Kit OK - Aguardando PCP' ||         // Almox liberou 100%
      o.status_almox === 'Liberado com Pendencia'             // Almox liberou c/ pendência
    );
  // OP de envio que o Almoxarifado devolveu como "Kit OK": segue para a embalagem
  const prontoParaEmbalagem = (o) => ehEnvio(o) && o.status_geral === 'Kit OK - Aguardando PCP';

  // Criterio unico de "nao tem linha de producao": vale o fluxo_entrega quando
  // estiver preenchido. O casamento por texto do tipo_projeto (criterio antigo,
  // frágil) fica so como reserva pras OPs anteriores a esta regra, que estao
  // sem fluxo -- senao os dois criterios discordariam entre si.
  const TIPOS_ENVIO_DIRETO = ['Envio de Material para Terceiro','Envio de Produto Vendido','Demanda Direta para Engenharia'];
  const isEnvioDireto = (o) =>
    ehEnvio(o) || o.item_envio === true || TIPOS_ENVIO_DIRETO.some(t => (o.tipo_projeto||'').includes(t));

  // ── Etapa 9 (30/09/2026): em cada bloco, o que pede ação DO PCP e o que só acompanha ──
  // "Pede ação" segue o botão que o PCP tem na linha (sanar, liberar, kiting, embalar); o resto é
  // trabalho de outro setor que o PCP só precisa enxergar.
  const pendenciasDe = (o) => pendPorOp.get(String(o.id)) || [];
  const pcpLibera = (o) => liberaveisPeloPcp(pendenciasDe(o), o).length > 0;
  const serralheriaPedeSanar = (o) => o.serralheria_status === 'Concluido';
  const nSerralheriaSanar = oplsSerralheria.filter(serralheriaPedeSanar).length;
  const nPendenciasLiberar = oplsPendencia.filter(pcpLibera).length;
  const enviosDiretos = opls.filter(isEnvioDireto);
  const nEnvioEmbalar = enviosDiretos.filter(prontoParaEmbalagem).length;
  const nTriagemAgir = opls.filter(o => o.status_geral === 'Em Espera PCP' || podeLiberar(o) || prontoParaEmbalagem(o)).length;
  const temBlocoDeAlerta = oplsFalta.length + solicitacoesAlmox.length + oplsSerralheria.length + oplsPendencia.length + enviosDiretos.length > 0;
  // bloco que só acompanha abre recolhido; se passar a pedir ação, o className muda e ele abre sozinho
  const classeBloco = (temAcao) => 'sec-card' + (temAcao ? '' : ' sec-collapsed');

  // Etapa 12e14 (06/10/2026): a tela inteira no molde do guia (faixa de prioridades, tabelas, selos, botões, janela do kiting). Nenhum
  // campo, texto, consulta, gravação ou regra foi mexido: só a aparência. A cor de cada situação vem da família do guia.
  const FAMILIA_STATUS_PCP = {
    'Em Espera PCP': 'atencao', 'Aguardando Almox': 'info', 'Kit OK - Aguardando PCP': 'ok', 'Devolvida PCP': 'erro', 'Retrabalho': 'atencao',
  };
  const FAMILIA_STATUS_KIT = { 'Kit OK': 'ok', 'Falta de Material': 'erro', 'Liberado com Pendencia': 'atencao' };
  const ROTULO_STATUS_KIT = { 'Kit OK': 'Kit 100%', 'Falta de Material': 'Falta Mat.', 'Liberado com Pendencia': 'Com Pendencia' };
  const SeloKit = ({ o }) => (<>
    {!o.status_almox && <Selo familia="neutro" ponto={false}>Pendente</Selo>}
    {FAMILIA_STATUS_KIT[o.status_almox] && <Selo familia={FAMILIA_STATUS_KIT[o.status_almox]} ponto={false}>{ROTULO_STATUS_KIT[o.status_almox]}</Selo>}
  </>);

  return (
    <div>
      {erroLeitura && (
        <div className="acn-pcp-espaco">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => fetchAll()}>Tentar de novo</Botao>}>
            Não foi possível ler tudo do PCP ({erroLeitura}). Isso não quer dizer que não haja OP em triagem, material em falta ou solicitação; os blocos abaixo mostram a última leitura que deu certo.
          </Faixa>
        </div>
      )}
      {temBlocoDeAlerta && (
        <div data-pcp-faixa className="acn-pcp-espaco">
          <div className="acn-quadro-titulo">O que pede o PCP agora</div>
          <div className="acn-pcp-chips">
            <ChipPrioridade icone={mdiClipboardTextOutline} nome="Triagem de OPs" total={opls.length} acao={nTriagemAgir} alvo="pcp-bloco-triagem"
              textoAcao="pedem ação" textoAcomp="nada a liberar agora" />
            {oplsFalta.length > 0 && <ChipPrioridade icone={mdiCancel} nome="Material em falta / com pendência" total={oplsFalta.length} acao={oplsFalta.length}
              alvo="pcp-bloco-falta" textoAcao="para sanar" textoAcomp="" />}
            {solicitacoesAlmox.length > 0 && <ChipPrioridade icone={mdiPackageVariantClosed} nome="Reposição de estoque" total={solicitacoesAlmox.length} acao={solicitacoesAlmox.length}
              alvo="pcp-bloco-reposicao" textoAcao="para liberar" textoAcomp="" />}
            {oplsSerralheria.length > 0 && <ChipPrioridade icone={mdiWrenchOutline} nome="Serralheria (liberação parcial)" total={oplsSerralheria.length} acao={nSerralheriaSanar}
              alvo="pcp-bloco-serralheria" textoAcao="para sanar" textoAcomp="aguardando a Serralheria" />}
            {oplsPendencia.length > 0 && <ChipPrioridade icone={mdiToolboxOutline} nome="Pendências de fabricação/compra" total={oplsPendencia.length} acao={nPendenciasLiberar}
              alvo="pcp-bloco-pendencias" textoAcao="OP(s) para liberar" textoAcomp="aguardando os setores" />}
            {enviosDiretos.length > 0 && <ChipPrioridade icone={mdiTrayArrowUp} nome="Envio direto" total={enviosDiretos.length} acao={nEnvioEmbalar}
              alvo="pcp-bloco-envio" textoAcao="pronta(s) para embalar" textoAcomp="o Almoxarifado separa e embala" />}
          </div>
        </div>
      )}

      {/* TRIAGEM OPLs — PRIMEIRA COISA DA TELA (28/09/2026)
          É o trabalho do PCP: a fila de OPs esperando decisão. Ficava em sexto
          lugar, depois de quatro blocos de alerta que só aparecem quando há
          problema — em dia cheio de pendência era preciso rolar a tela para
          chegar no que se faz o dia inteiro. Os alertas seguem logo abaixo. */}
      <div className="sec-card" id="pcp-bloco-triagem">
        <div className="sec-hdr"><span>Triagem de OPs — PCP ({filtrarOpls(opls, busca).length})
          {!loading && opls.length > 0 && <PilulaAcao acao={nTriagemAgir} textoAcao="pedem ação" textoAcomp="nada a liberar agora" />}</span></div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            <div className="acn-empty">Nenhuma OP em triagem PCP.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data</th><th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>BOM</th>
                <th>Kit Almox</th><th>Pendencia/Falta</th><th>Status</th><th>Prev. Entrega</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {(() => {
                  // Agrupa OPs desmembradas (mesmo numero base) numa unica
                  // linha "LOTE" colapsavel — mesmo padrao de EngenhariaTab.tsx.
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

                  const renderLinhaOpl = (o) => (
                    <tr key={o.id} className={isEnvioDireto(o) ? 'acn-linha-envio' : oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : undefined}>
                      <td>{fmtDt(o.data_entrada)}</td>
                      <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                      <td className="acn-eng-veic">
                        <VeiculoOuEnvio o={o} />
                      </td>
                      <td><span className={(o.quantidade||1)>1 ? 'acn-txt-info' : 'acn-ajuda'}>{o.quantidade||1}</span></td>
                      <td className="acn-eng-tipo">{o.tipo_projeto}</td>
                      <td>
                        {o.status_bom === 'BOM Liberado'
                          ? <Selo familia="ok" ponto={false}>BOM OK</Selo>
                          : <Selo familia="atencao" ponto={false}>Aguard. BOM</Selo>}
                      </td>
                      <td><SeloKit o={o} /></td>
                      <td className="acn-texto-medio"><span className={o.obs_almox ? 'acn-txt-erro' : undefined}>{o.obs_almox || '—'}</span></td>
                      <td><Selo familia={FAMILIA_STATUS_PCP[o.status_geral] || 'neutro'} ponto={false}>{o.status_geral}</Selo></td>
                      <td>{fmtDt(o.data_prevista_entrega)}</td>
                      <td className="acn-eng-celula-acoes">
                        <div className="acn-acoes-linha quebra">
                          {o.status_geral === 'Em Espera PCP' && (
                            <Botao variante="primario" pequeno onClick={()=>abrirKiting([o])}>
                              LIBERAR KITING
                            </Botao>
                          )}
                          {podeLiberar(o) && (
                            <Botao variante={o.status_almox==='Kit OK' ? 'primario' : 'secundario'} pequeno
                              onClick={()=>liberarProducaoUmaVez(o)}>
                              {o.status_almox==='Kit OK' ? 'LIBERAR PRODUCAO' : 'LIBERAR C/ PENDENCIA'}
                            </Botao>
                          )}
                          {prontoParaEmbalagem(o) && (
                            <Botao variante="primario" pequeno icone={mdiPackageVariantClosed}
                              title="OP de envio não passa por produção: vai para a embalagem no Almoxarifado"
                              onClick={()=>liberarEmbalagemUmaVez(o)}>
                              LIBERAR EMBALAGEM
                            </Botao>
                          )}
                          {o.status_geral === 'Aguardando Almox' && !o.status_almox && (
                            <Selo familia="neutro" ponto={false}>AGUARD. KITING</Selo>
                          )}
                          {o.status_almox === 'Falta de Material' && (
                            <Selo familia="erro" ponto={false}><Icone path={mdiCancel} size={13} /> FALTA MATERIAL</Selo>
                          )}
                          <MenuAcoes rotulo="Mais ações da OP" itens={[
                            { rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) },
                            { rotulo: 'Nova demanda para esta OP', icone: mdiPlus, onClick: () => setPendingVinculoOP({ tipo:'op', id:String(o.id), descricao:`${o.opl} — ${o.cliente_nome||o.modelo||''}`.replace(/ — $/, '') }) },
                            { rotulo: 'Devolver (Almoxarifado ou Engenharia)', icone: mdiArrowULeftTop, perigo: true, onClick: () => { setModalDevolver(o); setObsDevolver(''); } },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );

                  return itens.map(item => {
                    if (item.tipo === 'single') return renderLinhaOpl(item.row);

                    const { base, irmaos } = item;
                    const expandido = !!lotesExpandidos[base];
                    const rep = irmaos[0];
                    const qtdEspera = irmaos.filter(o => o.status_geral === 'Em Espera PCP').length;
                    const qtdAguardAlmox = irmaos.filter(o => o.status_geral === 'Aguardando Almox').length;
                    const qtdProntoProducao = irmaos.filter(o => podeLiberar(o)).length;
                    const qtdProntoEmbalagem = irmaos.filter(o => prontoParaEmbalagem(o)).length;
                    const qtdOutros = irmaos.length - qtdEspera - qtdAguardAlmox - qtdProntoProducao - qtdProntoEmbalagem;
                    return (
                      <React.Fragment key={base}>
                        <tr className="acn-linha-marca">
                          <td>{fmtDt(rep.data_entrada)}</td>
                          <td>
                            <strong className="acn-alm-lote"><Icone path={mdiLinkVariant} size={14} /> {base}</strong>
                            <div className="acn-eng-selo-linha">
                              <Selo familia="marca" ponto={false}>
                                LOTE — {irmaos.length} unidades
                              </Selo>
                            </div>
                          </td>
                          <td>—</td>
                          <td><span className="acn-txt-info">{irmaos.length}</span></td>
                          <td className="acn-eng-tipo">{rep.tipo_projeto}</td>
                          <td colSpan={3}>
                            <div className="acn-selos">
                              {qtdEspera > 0 && <Selo familia="atencao" ponto={false}>{qtdEspera} aguard. BOM/kiting</Selo>}
                              {qtdAguardAlmox > 0 && <Selo familia="info" ponto={false}>{qtdAguardAlmox} no Almox</Selo>}
                              {qtdProntoProducao > 0 && <Selo familia="ok" ponto={false}>{qtdProntoProducao} prontas p/ Produção</Selo>}
                              {qtdProntoEmbalagem > 0 && <Selo familia="ok" ponto={false}>{qtdProntoEmbalagem} prontas p/ Embalagem</Selo>}
                              {qtdOutros > 0 && <Selo familia="erro" ponto={false}>{qtdOutros} devolvida/retrabalho</Selo>}
                            </div>
                          </td>
                          <td>{fmtDt(rep.data_prevista_entrega)}</td>
                          <td className="acn-eng-celula-acoes">
                            <div className="acn-acoes-linha quebra">
                              {qtdEspera > 0 && (
                                <Botao variante="primario" pequeno icone={mdiPackageVariantClosed} disabled={processandoLote} onClick={()=>abrirKiting(item.irmaos.filter(x => x.status_geral === 'Em Espera PCP'), item)}>
                                  KITING EM LOTE ({qtdEspera})
                                </Botao>
                              )}
                              {qtdProntoProducao > 0 && (
                                <Botao variante="primario" pequeno icone={mdiFactory} disabled={processandoLote} onClick={()=>liberarProducaoLote(item)}>
                                  PRODUÇÃO EM LOTE ({qtdProntoProducao})
                                </Botao>
                              )}
                              {qtdProntoEmbalagem > 0 && (
                                <Botao variante="primario" pequeno icone={mdiPackageVariantClosed} disabled={processandoLote} onClick={()=>liberarEmbalagemLote(item)}>
                                  EMBALAGEM EM LOTE ({qtdProntoEmbalagem})
                                </Botao>
                              )}
                              <Botao variante="discreto" pequeno icone={expandido ? mdiChevronUp : mdiChevronDown} onClick={()=>setLotesExpandidos(s=>({...s,[base]:!expandido}))}>
                                {expandido ? 'Ocultar unidades' : `Ver ${irmaos.length} unidades`}
                              </Botao>
                            </div>
                          </td>
                        </tr>
                        {expandido && irmaos.map(o => renderLinhaOpl(o))}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* ALERTA: MATERIAIS EM FALTA / COM PENDENCIA */}
      {oplsFalta.length > 0 && (
        <div className="sec-card" id="pcp-bloco-falta">
          <div className="sec-hdr acn-eng-hdr-erro">
            <span className="acn-alm-titulo">Alertas Almoxarifado — Materiais em Falta / Com Pendencia ({oplsFalta.length})
              <PilulaAcao acao={oplsFalta.length} textoAcao="para sanar" textoAcomp="" /></span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>OP</th><th>Veículo</th><th>Tipo Projeto</th><th>Situacao</th>
                <th>Detalhamento da Pendencia / Falta</th><th>Resp. Almox</th><th>Data Apontamento</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {oplsFalta.map(o => (
                  <tr key={o.id} className={o.status_almox==='Falta de Material' ? 'acn-linha-alerta' : 'acn-linha-envio'}>
                    <td><strong className="acn-txt-erro">{o.opl}</strong></td>
                    <td className="acn-eng-veic">
                      <VeiculoOuEnvio o={o} />
                    </td>
                    <td className="acn-eng-tipo">{o.tipo_projeto}</td>
                    <td>
                      <Selo familia={o.status_almox==='Falta de Material' ? 'erro' : 'atencao'} ponto={false}>
                        {o.status_almox}
                      </Selo>
                    </td>
                    <td className="acn-texto-medio"><span className="acn-txt-erro">{o.obs_almox || '—'}</span></td>
                    <td>{o.responsavel_almox || '—'}</td>
                    <td>{fmtDtHr(o.data_kiting)}</td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao variante="primario" pequeno
                          onClick={()=>sanarPendenciaPCPUmaVez(o)}>
                          SANAR PENDENCIA
                        </Botao>
                        <MenuAcoes rotulo="Mais ações da OP" itens={[{ rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) }]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LIBERAÇÃO DE REPOSIÇÃO DO ALMOXARIFADO — vira OFI (fabricação interna)
          ou pedido de Compras, conforme o item, assim que liberado aqui.
          Subiu para logo abaixo do "material em falta" na Etapa 9 (30/09/2026): os dois são sempre
          trabalho do PCP, e ficavam depois dos blocos que só acompanham. */}
      {solicitacoesAlmox.length > 0 && (
        <div className="sec-card" id="pcp-bloco-reposicao">
          <div className="sec-hdr acn-alm-hdr-atencao">
            <span className="acn-alm-titulo"><Icone path={mdiPackageVariantClosed} size={16} /> Reposição de Estoque — Aguardando Liberação PCP ({solicitacoesAlmox.length})
              <PilulaAcao acao={solicitacoesAlmox.length} textoAcao="para liberar" textoAcomp="" /></span>
          </div>
          <div className="sec-body acn-alm-solic-corpo">
            {solicitacoesAlmox.map((sol: any) => (
              <div key={sol.id} className="acn-alm-solic">
                <div className="acn-alm-solic-texto">
                  <strong>{sol.item_nome}</strong> — {sol.quantidade}
                  {sol.motivo && <div className="acn-ajuda">{sol.motivo}</div>}
                  {sol.vinculo_descricao && <div className="acn-sub-info"><Icone path={mdiLinkVariant} size={12} /> {sol.vinculo_descricao}</div>}
                  <div className="acn-ajuda">Solicitado por {sol.criado_por_nome || '—'}</div>
                </div>
                <Botao variante="primario" pequeno icone={liberandoSolic === sol.id ? undefined : mdiCheckCircleOutline}
                  onClick={() => liberarSolicitacaoAlmox(sol)} disabled={liberandoSolic === sol.id}>
                  {liberandoSolic === sol.id ? '...' : 'Liberar'}
                </Botao>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalKiting && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-pcp-kiting" role="dialog" aria-label="Liberar kiting">
            <div className="acn-modal-cab">
              <span className="modal-title">
                Liberar kiting — {modalKiting.grupo ? `${modalKiting.grupo.base} (${modalKiting.ops.length} OPs)` : modalKiting.ops[0].opl}
              </span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalKiting.ops.length > 1 ? `${modalKiting.ops.length} unidades vão` : 'A OP vai'} para o Almoxarifado separar o kit.
              </div>
              {sugestaoFab && (
                <div className="acn-quadro">
                  <div className="acn-quadro-titulo">
                    <Icone path={mdiFactory} size={14} /> {sugestaoFab.achados.length} item(ns) desta OP são fabricados aqui dentro
                  </div>
                  <div className="acn-ajuda">
                    Encontrados na {sugestaoFab.origem}. <strong>Marque só o que precisa ser fabricado</strong> —
                    o que já tem no estoque não precisa de demanda. Sem marcar nada, nenhuma demanda é aberta.
                  </div>
                  {/* Etapa 10 (30/09/2026): marcar vários de uma vez. Continua sendo um clique da pessoa — nada vem marcado sozinho. */}
                  {(() => {
                    const achados = sugestaoFab.achados;
                    const todos = achados.map((_, i) => i);
                    const setoresDaLista = SETORES_FABRICACAO.filter(s => achados.some(a => a.setor === s));
                    return (
                      <div data-kiting-acoes className="acn-acoes-linha quebra">
                        <span data-kiting-contagem className="acn-txt-info">
                          {fabPedidos.size} de {achados.length} marcados
                        </span>
                        {todos.some(i => !fabPedidos.has(i)) && (
                          <Botao pequeno icone={mdiCheckboxMarkedOutline} onClick={() => aplicarSugestoes(todos, true)}>Marcar todos ({achados.length})</Botao>
                        )}
                        {setoresDaLista.length > 1 && setoresDaLista.map(s => {
                          const doSetor = todos.filter(i => achados[i].setor === s);
                          if (doSetor.every(i => fabPedidos.has(i))) return null;
                          return <Botao key={s} pequeno icone={mdiCheckboxMarkedOutline} onClick={() => aplicarSugestoes(doSetor, true)}>Todos de {s} ({doSetor.length})</Botao>;
                        })}
                        {fabPedidos.size > 0 && (
                          <Botao pequeno variante="discreto" icone={mdiCheckboxBlankOutline} onClick={() => aplicarSugestoes(todos, false)}>Desmarcar todos</Botao>
                        )}
                      </div>
                    );
                  })()}
                  {sugestaoFab.achados.map((a, i) => (
                    <label key={`${a.item_id}-${i}`} className="acn-pcp-sugestao">
                      <input type="checkbox" checked={fabPedidos.has(i)} onChange={() => alternarSugestao(a, i)} />
                      <span>
                        <span className="acn-pcp-setor">{a.setor}</span> · {a.nome}
                        <span className="acn-ajuda"> — {a.quantidade}{modalKiting.ops.length > 1 ? ' por OP' : ''}</span>
                      </span>
                    </label>
                  ))}
                  <div className="acn-ajuda">
                    Quando o estoque estiver controlado, o sistema vai marcar sozinho só o que faltar para esta OP.
                  </div>
                </div>
              )}
              <FabricacaoInternaEditor valor={fabKiting} onChange={setFabKiting} qtdOps={modalKiting.ops.length}
                pinturaSlot={<PinturaCampos valor={pinturaKiting} onChange={v => setPinturaKiting(p => ({ ...p, ...v }))} />} />
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" disabled={liberandoKiting} onClick={confirmarKiting}>
                {liberandoKiting ? 'Liberando...' : temFabricacao(fabKiting) ? 'LIBERAR KITING E ABRIR DEMANDAS' : 'LIBERAR KITING'}
              </Botao>
              <Botao disabled={liberandoKiting} onClick={()=>setModalKiting(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}

      {/* CONTROLE DE LIBERAÇÃO PARCIAL — SERRALHERIA (Engenharia antecipa a
          parte metálica/estrutural sem esperar o resto do BOM; aparece aqui
          mesmo antes de "Em Espera PCP", trilha independente do status_geral) */}
      {oplsSerralheria.length > 0 && (
        <div className={classeBloco(nSerralheriaSanar > 0)} id="pcp-bloco-serralheria">
          <div className="sec-hdr acn-pcp-hdr-marca">
            <span className="acn-alm-titulo"><Icone path={mdiWrenchOutline} size={16} /> Controle de Serralheria — Liberação Parcial ({oplsSerralheria.length})
              <PilulaAcao acao={nSerralheriaSanar} textoAcao="para sanar" textoAcomp="só aguardando a Serralheria terminar" /></span>
          </div>
          <div className="sec-body acn-rolagem">
              <table className="acn-tabela acn-densa">
                <thead><tr>
                  <th>OP</th><th>Veículo</th><th>Cliente</th><th>Status Geral</th><th>Serralheria</th><th>Ação</th>
                </tr></thead>
                <tbody>
                  {/* as que pedem "sanar" primeiro (a ordem de chegada se mantém dentro de cada grupo) */}
                  {[...oplsSerralheria].sort((a, b) => Number(serralheriaPedeSanar(b)) - Number(serralheriaPedeSanar(a))).map(o => (
                    <tr key={o.id} className={o.serralheria_status==='Concluido' ? undefined : 'acn-linha-marca'}>
                      <td><strong className="acn-alm-lote">{o.opl}</strong></td>
                      <td className="acn-eng-veic">
                        <VeiculoOuEnvio o={o} semPlaca />
                      </td>
                      <td>{o.cliente_nome || '—'}</td>
                      <td><span className="acn-ajuda">{o.status_geral}</span></td>
                      <td>
                        <Selo familia={o.serralheria_status==='Concluido' ? 'ok' : 'marca'} ponto={false}>
                          {o.serralheria_status==='Concluido'
                            ? <><Icone path={mdiCheckCircleOutline} size={13} /> Concluída</>
                            : <><Icone path={mdiWrenchOutline} size={13} /> Em Serralheria</>}
                        </Selo>
                      </td>
                      <td>
                        <div className="acn-acoes-linha">
                          {o.serralheria_status==='Concluido' ? (
                            <Botao variante="primario" pequeno icone={sanandoSerralheria===o.id ? undefined : mdiCheckCircleOutline} disabled={sanandoSerralheria===o.id}
                              onClick={()=>sanarPendenciaSerralheria(o)}>
                              {sanandoSerralheria===o.id ? '...' : 'SANAR PENDÊNCIA'}
                            </Botao>
                          ) : (
                            <span className="acn-ajuda">Aguardando Serralheria terminar</span>
                          )}
                          <MenuAcoes rotulo="Mais ações da OP" itens={[{ rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) }]} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      )}


      {/* PENDÊNCIAS DE FABRICAÇÃO/COMPRA — checklist até 100%
          o ▾/▸ e o mostra/esconde do corpo são só do collapse global (clique em
          qualquer .sec-hdr, ver DashboardTab.tsx) — um estado próprio aqui
          brigava com ele e o painel nunca aparecia, mesmo com dado carregado
          (achado em 23/09/2026: o botão "Liberar" nunca esteve acessível). */}
      {oplsPendencia.length > 0 && (
        <div className={classeBloco(nPendenciasLiberar > 0)} id="pcp-bloco-pendencias">
          <div className="sec-hdr acn-alm-hdr-atencao">
            <span className="acn-alm-titulo"><Icone path={mdiToolboxOutline} size={16} /> Pendências de fabricação/compra ({oplsPendencia.length})
              <PilulaAcao acao={nPendenciasLiberar} textoAcao="OP(s) para você liberar" textoAcomp="só aguardando os setores" /></span>
          </div>
          <div className="sec-body">
            <div className="acn-ajuda acn-alm-espaco">
              Cada pendência fecha em três etapas: o setor conclui, o Almoxarifado confirma o recebimento
              e o PCP libera para a produção. A produção não conclui a OP enquanto faltar alguma.
            </div>
            {/* as OPs em que o PCP pode liberar algo agora vêm primeiro */}
            {[...oplsPendencia].sort((a, b) => Number(pcpLibera(b)) - Number(pcpLibera(a))).map(o => (
              <div key={o.id} className="acn-alm-pend">
                <div className="acn-alm-pend-titulo">
                  <LinkOpl opl={o} currentUser={currentUser} />
                  <span className="acn-ajuda">{o.cliente_nome || '—'} · {o.status_geral}</span>
                </div>
                <ChecklistPendencias op={o} vinculos={(pendPorOp.get(String(o.id)) || []).map(p => ({ ...p, grupo: 'demanda' }))}
                  modo="pcp" currentUser={currentUser} compacto
                  onMudou={() => carregarPendenciasAbertas()} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENVIO DIRETO ALERT */}
      {opls.filter(isEnvioDireto).length > 0 && (
        <div className={classeBloco(nEnvioEmbalar > 0)} id="pcp-bloco-envio">
          <div className="sec-hdr acn-alm-hdr-atencao">
            <span className="acn-alm-titulo"><Icone path={mdiTrayArrowUp} size={16} /> Itens de Envio Direto — Sem Linha de Producao ({opls.filter(isEnvioDireto).length})
              <PilulaAcao acao={nEnvioEmbalar} textoAcao="pronta(s) para embalar" textoAcomp="só aguardando o Almoxarifado" /></span>
            <Selo familia="atencao" ponto={false}>
              Apenas separacao Almox + Chicotes / Serralheria / Lab se necessario
            </Selo>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data</th><th>OP</th><th>Cliente</th><th>Tipo</th><th>Kit Almox</th><th>Pendencia</th><th>Prev. Entrega</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {opls.filter(isEnvioDireto).map(o => (
                  <tr key={o.id} className="acn-linha-envio">
                    <td>{fmtDt(o.data_entrada)}</td>
                    <td>
                      <strong>{o.opl}</strong>
                      <div><Selo familia="atencao" ponto={false}>ENVIO DIRETO</Selo></div>
                    </td>
                    <td>{o.cliente_nome || '—'}</td>
                    <td className="acn-eng-tipo">{o.tipo_projeto}</td>
                    <td><SeloKit o={o} /></td>
                    <td className="acn-texto-medio"><span className={o.obs_almox ? 'acn-txt-erro' : undefined}>{o.obs_almox || '—'}</span></td>
                    <td>{fmtDt(o.data_prevista_entrega)}</td>
                    <td>
                      <div className="acn-acoes-linha quebra">
                        {prontoParaEmbalagem(o) && (
                          <Botao variante="primario" pequeno icone={mdiPackageVariantClosed}
                            title="Kit conferido: segue para o Almoxarifado pesar, medir, embalar e abrir a cotação de frete"
                            onClick={()=>liberarEmbalagemUmaVez(o)}>
                            LIBERAR EMBALAGEM
                          </Botao>
                        )}
                        {o.status_geral === 'Aguardando Almox' && (
                          <span className="acn-ajuda">Almoxarifado separa e embala</span>
                        )}
                        <MenuAcoes rotulo="Mais ações da OP" itens={[{ rotulo: 'Ver detalhes', icone: mdiEyeOutline, onClick: () => setModalVer(o) }, { rotulo: 'Nova demanda para esta OP', icone: mdiPlus, onClick: () => setPendingVinculoOP({ tipo:'op', id:String(o.id), descricao:`${o.opl} — ${o.cliente_nome||o.modelo||''}`.replace(/ — $/, '') }) }]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      <OplMovimentadas setor="PCP" />
      <DemandaAvulsaPanel currentUser={currentUser} setor="PCP" setoresDestino={['PCP', ...SETORES]}
        abrirComVinculo={pendingVinculoOP} onAbrirComVinculoConsumido={() => setPendingVinculoOP(null)} />
      <DemandaFooter setor="PCP" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL DEVOLVER — escolhe o destino: Almoxarifado (refazer kit) ou Engenharia (reanalisar) */}
      {modalDevolver && (
        <ModalDevolverOp opl={modalDevolver} setorOrigem="PCP" currentUser={currentUser}
          onClose={() => setModalDevolver(null)} onFeito={() => { setModalDevolver(null); setObsDevolver(''); fetchAll(); }} />
      )}
    </div>
  );
}
