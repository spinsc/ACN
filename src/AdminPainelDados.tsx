// ─────────────────────────────────────────────────────────────────────────────
// Painel "Dados / Limpeza" do Admin — ver, deletar e limpar registros de 35 tabelas, sempre com a cópia na Lixeira por 24 horas (12e90, 27/11/2026). Saiu do AdminTab.tsx já no padrão
// do design system (`Chips` para as tabelas, `Botao`, `Faixa`, `Selo`, `confirmar`, `mostrarAviso`, a tabela do guia, classes `acn-dados-*` do design.css, sem `style` solto). É o painel que mais
// apaga dado de verdade do sistema, então a 7.x pesou mais aqui.
//
// A regra é a de antes: o Admin escolhe a tabela, seleciona registros e os deleta (a cópia vai para a Lixeira, que restaura por 24 horas), ou limpa a tabela inteira.
//
// Achados da 7.x que esta versão corrige:
//  • a cópia na Lixeira não era conferida: se ela falhasse, os registros eram APAGADOS do mesmo jeito e a "Lixeira" não tinha nada para restaurar. Agora a cópia vem primeiro e, sem ela, nada é apagado;
//  • o apagamento não era conferido: o banco responde "ok, 0 linhas" a um apagamento negado e a tela seguia como se tivesse dado certo (e a cópia ficava na Lixeira de um registro que continuava vivo).
//    Agora diz quantos foram apagados de verdade e retira da Lixeira a cópia do que não saiu;
//  • "Limpar Tabela Toda" guardava na Lixeira só as 500 primeiras linhas e apagava TODAS, sem avisar (a tabela de Menções tem milhares): a pergunta agora diz o total real e que o resto não volta;
//  • a pergunta usava a contagem como se fosse certa: contagem recusada virava "TODOS os 0 registros". Agora a contagem recusada aparece como "—", com faixa vermelha e "Tentar de novo";
//  • lista recusada virava "Nenhum registro nesta tabela" (e deixava limpar e deletar ligados): agora faixa vermelha com "Tentar de novo" e os dois desligados;
//  • trocar de tabela com uma leitura lenta ainda a caminho mostrava a lista da tabela errada: só vale a última pedida;
//  • o contador de selecionados continuava contando registros que já tinham sumido da lista; o clique duplo em "Deletar" fazia duas cópias e duas exclusões;
//  • o "Limpar" tentava primeiro um apagamento que sempre falha (as tabelas usam id uuid) e só depois o que vale; o erro vinha num `alert()` do navegador, com texto técnico em inglês.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiAlertOutline, mdiDeleteOutline, mdiRefresh } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { anexarValoresDosFretes, anexarValoresDasCotacoesDeFrete, anexarValoresDoFaturamento } from './FreteValores';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Chips, Faixa, Selo } from './Interface';

const LIMITE_LISTA = 200;        // quantos registros a lista mostra
const LIMITE_LIXEIRA = 500;      // quantos registros "Limpar tabela" consegue guardar na Lixeira (regra de antes)
const UUID_ZERO = '00000000-0000-0000-0000-000000000000';
const num = (n: number) => n.toLocaleString('pt-BR');

const TABELAS_CONFIG = [
  { id:'oples',                 label:'OPs',                    desc:'Ordens de Produção' },
  { id:'sac_ordens_servico',    label:'SAC — OS',                desc:'Ordens de Serviço SAC' },
  { id:'demandas_setoriais',    label:'Demandas Setoriais',       desc:'Demandas e Ajustes' },
  { id:'demandas_avulsas',      label:'Demandas Avulsas',         desc:'Engenharia — tarefas livres' },
  { id:'logistica_manifestos',  label:'Logística In/Out',         desc:'Manifestos de envio/recebimento' },
  { id:'rh_autorizacoes',       label:'Autorizações RH',          desc:'Autorizações de saída/entrada antecipada' },
  // ── CRM / Licitações ──────────────────────────────────────────────────────
  { id:'licitacoes',            label:'Licitações',                desc:'Base de licitações cadastradas' },
  { id:'crm_oportunidades',     label:'CRM — Oportunidades',      desc:'Licitações e Vendas Diretas' },
  { id:'crm_historico',         label:'CRM — Histórico',          desc:'Movimentações e auditoria do funil' },
  { id:'crm_vendas',            label:'CRM — Vendas Fechadas',    desc:'OPs/OSs geradas a partir do CRM' },
  { id:'crm_contatos',          label:'CRM — Contatos',           desc:'Pessoas físicas e leads do CRM' },
  { id:'crm_interacoes',        label:'CRM — Interações',         desc:'Ligações, WA, reuniões registradas' },
  { id:'crm_anexos',            label:'CRM — Anexos',             desc:'Arquivos anexados às oportunidades' },
  // ── Compras / Financeiro ─────────────────────────────────────────────────
  { id:'pcp_pedidos_compra',       label:'Compras — Pedidos',        desc:'Requisições de compra e status' },
  { id:'pcp_cotacoes_fornecedores',label:'Compras — Cotações',       desc:'Cotações de fornecedores (Mesa)' },
  { id:'pcp_aprovacoes',           label:'Compras — Aprovações',     desc:'Alçadas e aprovações por departamento' },
  { id:'pcp_pedidos_faturamento',  label:'Financeiro — Faturamento', desc:'Conferência técnica e faturamento de compras' },
  // ── Fretes / Chicotes / Serralheria ─────────────────────────────────────
  { id:'pcp_fretes',               label:'Fretes',                   desc:'Cotações e contratação de frete' },
  { id:'pcp_cotacoes_fretes',      label:'Fretes — Cotações',        desc:'Cotações de transportadoras' },
  { id:'pcp_pedidos_chicotes',     label:'Chicotes — Pedidos',       desc:'Pedidos internos de chicotes' },
  { id:'pcp_pedidos_serralheria',  label:'Serralheria — Pedidos',    desc:'Pedidos internos de serralheria' },
  // ── Outros ───────────────────────────────────────────────────────────────
  { id:'clientes',              label:'Cadastro Clientes',         desc:'Base unificada de clientes PF/PJ' },
  { id:'logs_movimentacao_opl', label:'Logs de OP',              desc:'Histórico de movimentações' },
  { id:'cq_auditorias',         label:'Auditorias CQ',            desc:'Registros de qualidade' },
  { id:'vistorias_patio',       label:'Vistorias de Pátio',       desc:'Vistorias de veículos no pátio' },
  { id:'vouchers_servico',      label:'Vouchers de Serviço',      desc:'Vouchers autorizados (terceiros)' },
  { id:'ajustes_trabalhos',     label:'Ajustes/Retrabalhos',      desc:'Registros de ajuste pós-entrega' },
  { id:'analise_solicitacoes',  label:'Análise entre Setores',    desc:'Solicitações de análise técnica' },
  { id:'agenda_compromissos',   label:'Agenda',                   desc:'Compromissos agendados' },
  { id:'agendamentos_manutencao',label:'Agend. Manutenção',       desc:'Agenda de manutenção veicular' },
  { id:'chamados_suporte',      label:'Chamados de Suporte',      desc:'Chamados abertos pelos usuários' },
  { id:'mencoes',               label:'Menções (@)',              desc:'Notificações de menção entre usuários' },
  { id:'op_acompanhamentos',    label:'Acompanhamentos de OP',   desc:'Comentários/andamento nas OPs' },
  { id:'licitacao_documentos',  label:'Licitações — Documentos',  desc:'Notas e documentos anexados a licitações' },
  { id:'veiculos_nfc',          label:'Dossiê NFC — Veículos',    desc:'Veículos cadastrados no dossiê NFC' },
];

// a coluna de data que ordena cada tabela (as 35 existem no banco, conferido em 27/11/2026)
function colunaDeOrdem(tabela: string): string {
  const orderCol = tabela === 'oples'               ? 'data_entrada'
    : tabela === 'logs_movimentacao_opl'             ? 'data_hora'
    : tabela === 'demandas_setoriais'                ? 'data_abertura'
    : tabela === 'sac_ordens_servico'                ? 'data_abertura'
    : tabela === 'cq_auditorias'                     ? 'created_at'
    : tabela === 'logistica_manifestos'              ? 'data'
    : tabela === 'rh_autorizacoes'                   ? 'data'
    : tabela === 'crm_interacoes'                    ? 'data_interacao'
    : tabela === 'licitacoes'                        ? 'criado_em'
    // tabelas com data_criacao
    : ['pcp_pedidos_compra','pcp_pedidos_chicotes','pcp_pedidos_serralheria','vistorias_patio']
      .includes(tabela) ? 'data_criacao'
    : tabela === 'ajustes_trabalhos'                 ? 'data_abertura'
    // tabelas com criado_em
    : ['demandas_avulsas','crm_oportunidades','crm_historico','crm_vendas',
       'crm_contatos','crm_anexos','clientes','pcp_cotacoes_fornecedores','pcp_aprovacoes',
       'pcp_pedidos_faturamento','pcp_fretes','pcp_cotacoes_fretes','analise_solicitacoes',
       'agenda_compromissos','mencoes','op_acompanhamentos','licitacao_documentos',
       'veiculos_nfc','vouchers_servico'].includes(tabela) ? 'criado_em'
    : 'created_at';
  return orderCol;
}

function resumoDoRegistro(tabela: string, r: any) {
    if (tabela === 'oples')
      return `OP ${r.opl || r.numero_opl || r.id} — ${r.cliente_nome || r.cliente || '?'} — ${r.status_geral || '?'}`;
    if (tabela === 'demandas_setoriais')
      return `[${r.setor_destino}] ${r.descricao?.substring(0,60) || '?'} — ${r.status}`;
    if (tabela === 'demandas_avulsas')
      return `[${r.status || '?'}] ${r.titulo?.substring(0,70) || '?'} — ${r.criado_por_nome || r.criado_por || '?'} · Prioridade: ${r.prioridade || '?'}`;
    if (tabela === 'logistica_manifestos')
      return `${r.tipo || '?'} — ${r.descricao?.substring(0,60) || r.transportadora || '?'} — ${r.criado_por_nome || r.criado_por || '?'}`;
    if (tabela === 'licitacoes')
      return `[${r.status || '?'}] ${r.numero || '?'} — ${r.nome_projeto || '?'} — ${r.orgao || '?'} — ${r.classificacao || '?'}`;
    if (tabela === 'crm_oportunidades')
      return `[${r.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda'}] ${r.titulo || '?'} — ${r.orgao || '?'} — Etapa: ${r.estagio_id ? '✓' : '?'} — R$ ${r.valor_estimado ? Number(r.valor_estimado).toLocaleString('pt-BR') : '—'}`;
    if (tabela === 'crm_historico')
      return `${r.tipo || '?'}: ${r.conteudo?.substring(0,60) || '?'} — por ${r.usuario_nome || '?'}`;
    if (tabela === 'crm_vendas')
      return `${r.tipo || '?'} — Número: ${r.numero || '?'} — ${r.cliente_nome || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'}`;
    if (tabela === 'crm_contatos')
      return `${r.nome || '?'} — ${r.empresa || '?'} — ${r.whatsapp || r.email || '?'} — op: ${r.operador_nome || '?'}`;
    if (tabela === 'crm_interacoes')
      return `[${r.tipo || '?'}] ${r.resultado || '?'}: ${r.descricao?.substring(0,60) || '?'} — ${r.operador_nome || '?'}`;
    if (tabela === 'crm_anexos')
      return `${r.tipo || '?'} — ${r.nome || '?'} — ${r.criado_por || '?'}`;
    if (tabela === 'clientes')
      return `[${r.tipo || '?'}] ${r.nome || '?'} — ${r.documento || '?'} — ${r.cidade || '?'}${r.estado ? '/' + r.estado : ''}`;
    if (tabela === 'logs_movimentacao_opl')
      return `OP ${r.numero_opl} → ${r.setor}: ${r.evento?.substring(0,50)}`;
    if (tabela === 'cq_auditorias')
      return `OP ${r.numero_opl} — ${r.resultado} — ${r.auditor_nome}`;
    if (tabela === 'sac_ordens_servico')
      return `OS ${r.numero_os || r.id} — ${r.cliente_nome || '?'} — ${r.status || '?'} — ${r.tipo_servico || '?'}`;
    if (tabela === 'rh_autorizacoes')
      return `[${r.tipo || '?'}] ${r.data || '?'} — Saída: ${r.hora_saida || '—'} — ${r.motivo || '?'}`.substring(0,100);
    if (tabela === 'pcp_pedidos_compra')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_material?.substring(0,50) || '?'} — ${r.fornecedor || '?'} — ${r.status_compra || '?'}`;
    if (tabela === 'pcp_cotacoes_fornecedores')
      return `Cotação — ${r.fornecedor_nome || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabela === 'pcp_aprovacoes')
      return `[${r.tipo || '?'}] Nível ${r.nivel ?? '?'} (${r.nivel_nome || r.aprovador_nome || '?'}) — ${r.status || '?'}`;
    if (tabela === 'pcp_pedidos_faturamento')
      return `${r.numero_oc || r.numero_pedido || r.id} — ${r.fornecedor || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'} — ${r.status_faturamento || '?'}`;
    if (tabela === 'pcp_fretes')
      return `${r.descricao?.substring(0,60) || '?'} — ${r.status || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabela === 'pcp_cotacoes_fretes')
      return `Cotação Frete — ${r.transportadora_nome || '?'} — R$ ${r.valor ? Number(r.valor).toLocaleString('pt-BR') : '—'}`;
    if (tabela === 'pcp_pedidos_chicotes')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_chicote?.substring(0,50) || '?'} — OP ${r.opl || '?'} — ${r.status_chicote || '?'}`;
    if (tabela === 'pcp_pedidos_serralheria')
      return `Pedido ${r.numero_pedido || r.id} — ${r.descricao_trabalho?.substring(0,50) || '?'} — OP ${r.opl || '?'} — ${r.status_serralheria || '?'}`;
    if (tabela === 'vistorias_patio')
      return `Chassi ${r.chassi || '?'} — ${r.status || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabela === 'vouchers_servico')
      return `${r.tipo_servico || '?'} — PV/OP ${r.numero_pvop || '?'} — ${r.prestador || '?'} — R$ ${r.valor_total ? Number(r.valor_total).toLocaleString('pt-BR') : '—'}`;
    if (tabela === 'ajustes_trabalhos')
      return `Chassi ${r.chassi || '?'} — ${r.descricao?.substring(0,60) || '?'} — ${r.status || '?'}`;
    if (tabela === 'analise_solicitacoes')
      return `[${r.origem || '?'}] ${r.origem_titulo || r.origem_numero || '?'} — Setores: ${Array.isArray(r.setores) ? r.setores.join(', ') : r.setores || '?'} — ${r.status || '?'}`;
    if (tabela === 'agenda_compromissos')
      return `${r.titulo?.substring(0,60) || '?'} — ${r.usuario_nome || '?'}`;
    if (tabela === 'agendamentos_manutencao')
      return `OP ${r.numero_opl || '?'} — ${r.cliente_nome || '?'} — ${r.data_agendamento || '?'} (${r.periodo || '?'})`;
    if (tabela === 'chamados_suporte')
      return `${r.placa || r.chassi || '?'} — ${r.orgao_cliente || '?'} — ${r.descricao_defeito?.substring(0,50) || '?'} — ${r.status || '?'}`;
    if (tabela === 'mencoes')
      return `${r.mencionante_nome || '?'} → @${r.mencionado_nome || '?'} — ${r.contexto_descricao?.substring(0,50) || r.contexto || '?'}`;
    if (tabela === 'op_acompanhamentos')
      return `${r.usuario_nome || '?'}: ${r.texto?.substring(0,70) || '?'}`;
    if (tabela === 'licitacao_documentos')
      return `${r.nome || '?'} — por ${r.criado_por_nome || '?'}`;
    if (tabela === 'veiculos_nfc')
      return `Placa ${r.placa || '?'} — Chassi ${r.chassi || '?'}`;
    return r.id;
}

const fmtDt = (d: any) => d ? new Date(d).toLocaleString('pt-BR') : '—';
const getDataCol = (r: any) => r.data_abertura || r.criado_em || r.data_interacao || r.data_msg || r.data || r.created_at || r.data_hora || r.data_contato || r.data_criacao;

// 26/11/2026 (V4d do "ver valores no banco"): as colunas de dinheiro destas três tabelas ficam sempre nulas; o valor mora nas tabelas `*_valores`. Sem recolocá-lo a lista mostraria "—"
// e o JSON do registro, nulo. A cópia na Lixeira do que se deleta pela seleção leva o valor junto.
async function recolocarValores(tabela: string, linhas: any[]) {
  const r = tabela === 'pcp_pedidos_faturamento' ? await anexarValoresDoFaturamento(linhas).then(x => ({ linhas: x.faturamentos, erro: x.erro }))
    : tabela === 'pcp_cotacoes_fretes' ? await anexarValoresDasCotacoesDeFrete(linhas).then(x => ({ linhas: x.cotacoes, erro: x.erro }))
    : tabela === 'pcp_fretes' ? await anexarValoresDosFretes(linhas).then(x => ({ linhas: x.fretes, erro: x.erro }))
    : null;
  return r || { linhas, erro: '' };
}

// A cópia vai para a Lixeira ANTES de qualquer apagamento; sem ela nada é apagado (devolve os itens gravados, com o id da cópia).
async function guardarNaLixeira(tabela: string, linhas: any[]) {
  if (!linhas.length) return { ok: true, itens: [], erro: '' };
  const { data, error } = await supabase.from('lixeira')
    .insert(linhas.map(r => ({ tabela, registro_id: String(r.id), dados: r })))
    .select('id, registro_id');
  if (error || (data || []).length !== linhas.length) return { ok: false, itens: [], erro: error ? explicarErroDoBanco(error) : 'o banco não confirmou a gravação' };
  return { ok: true, itens: data || [], erro: '' };
}

// Retira da Lixeira a cópia de quem NÃO foi apagado (restaurar uma cópia de registro vivo só daria conflito). Em blocos, para o endereço do pedido não ficar enorme.
async function tirarDaLixeira(itens: any[]) {
  for (let i = 0; i < itens.length; i += 100) {
    const { error } = await supabase.from('lixeira').delete().in('id', itens.slice(i, i + 100).map(x => x.id));
    if (error) return false;
  }
  return true;
}

export function PainelDados() {
  const [tabelaAtiva, setTabelaAtiva] = useState('oples');
  const [registros, setRegistros] = useState<any[]>([]);
  const [erroLista, setErroLista] = useState('');
  const [avisoValores, setAvisoValores] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [contagens, setContagens] = useState<Record<string, number | null>>({});   // número, ou null = não foi possível contar
  const [selecionados, setSelecionados] = useState<Set<any>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);        // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedidoLista = useRef(0);
  const pedidoContagem = useRef(0);

  // 35 contagens exatas, uma de cada vez (como sempre foi); contagem recusada vira null, nunca zero
  const contar = useCallback(async () => {
    const meu = ++pedidoContagem.current;
    const counts: Record<string, number | null> = {};
    for (const t of TABELAS_CONFIG) {
      const { count, error } = await supabase.from(t.id).select('*', { count: 'exact', head: true });
      counts[t.id] = error || count == null ? null : count;
      if (meu !== pedidoContagem.current) return;
    }
    setContagens(counts);
  }, []);

  const lerLista = useCallback(async () => {
    const meu = ++pedidoLista.current;
    setCarregando(true);
    const { data, error } = await supabase.from(tabelaAtiva).select('*').order(colunaDeOrdem(tabelaAtiva), { ascending: false }).limit(LIMITE_LISTA);
    if (meu !== pedidoLista.current) return;   // chegou depois de uma leitura mais nova (ou de outra tabela): não vale
    if (error) { setErroLista(explicarErroDoBanco(error)); setRegistros([]); setAvisoValores(''); setCarregando(false); return; }
    let linhas = data || [];
    let falhaValores = '';
    if (linhas.length) {
      const r = await recolocarValores(tabelaAtiva, linhas);
      if (meu !== pedidoLista.current) return;
      if (r.erro) falhaValores = r.erro; else linhas = r.linhas;
    }
    setErroLista('');
    setAvisoValores(falhaValores ? `Não foi possível ler os valores desta tabela (${falhaValores}). Os campos de dinheiro aparecem vazios, mas isso não quer dizer que não existam.` : '');
    setRegistros(linhas);
    const ids = new Set(linhas.map(r => r.id));
    setSelecionados(prev => new Set([...prev].filter(id => ids.has(id))));   // não conta registro que já saiu da lista
    setCarregando(false);
  }, [tabelaAtiva]);

  useEffect(() => { contar(); }, [contar]);
  useEffect(() => { setSelecionados(new Set()); setRegistros([]); lerLista(); }, [lerLista]);

  const info = TABELAS_CONFIG.find(t => t.id === tabelaAtiva);
  const total = contagens[tabelaAtiva];
  const travado = ocupado || carregando || !!erroLista;
  const algumSelecionado = selecionados.size > 0;
  const todosSelecionados = registros.length > 0 && selecionados.size === registros.length;
  const faltaContar = TABELAS_CONFIG.filter(t => contagens[t.id] === null).length;

  const alternar = (id: any) => setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const alternarTodos = () => setSelecionados(todosSelecionados ? new Set() : new Set(registros.map(r => r.id)));

  const deletarSelecionados = async () => {
    if (trava.current || travado || selecionados.size === 0) return;
    trava.current = true;   // vale já para a pergunta: dois cliques seguidos não abrem duas perguntas
    const ids = Array.from(selecionados);
    if (!await confirmar(`Deletar ${ids.length} registro(s) selecionado(s)?\n\nVocê poderá restaurar por até 24h na aba Lixeira.`)) { trava.current = false; return; }
    setOcupado(true);
    try {
      const linhas = registros.filter(r => ids.includes(r.id));
      const bk = await guardarNaLixeira(tabelaAtiva, linhas);
      if (!bk.ok) { mostrarAviso(`Nada foi deletado: não foi possível guardar a cópia na Lixeira (${bk.erro}).`, 'erro'); return; }
      const { error, data } = await supabase.from(tabelaAtiva).delete().in('id', ids).select('id');
      const apagados = new Set((data || []).map((x: any) => String(x.id)));
      if (error || apagados.size === 0) {
        await tirarDaLixeira(bk.itens);
        mostrarAviso(`Não foi possível deletar: ${error ? explicarErroDoBanco(error) : 'o banco não apagou nenhum registro (você não tem permissão ou eles já não existem)'}. Nada foi deletado.`, 'erro');
        return;
      }
      const sobras = bk.itens.filter((b: any) => !apagados.has(String(b.registro_id)));
      if (sobras.length) await tirarDaLixeira(sobras);
      setSelecionados(new Set());
      if (apagados.size < ids.length) mostrarAviso(`Só ${apagados.size} de ${ids.length} registro(s) foram deletados; os outros continuam na tabela.`, 'erro');
      else mostrarAviso(`${apagados.size} registro(s) deletado(s). A cópia fica na Lixeira por 24 horas.`, 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await Promise.all([lerLista(), contar()]);
      trava.current = false; setOcupado(false);
    }
  };

  const limparTabela = async () => {
    if (trava.current || travado) return;
    trava.current = true;
    const nome = info?.label || tabelaAtiva;
    const quanto = total == null ? 'todos os registros' : `TODOS os ${num(total)} registros`;
    const cabe = total != null && total <= LIMITE_LIXEIRA;
    if (!await confirmar(`Limpar a tabela inteira "${nome}"?\n\nIsso vai deletar ${quanto} da tabela ${nome}.${total == null ? ' Não foi possível contar quantos são.' : ''} ${cabe ? 'Uma cópia fica na Lixeira por 24 horas.' : `Só os ${LIMITE_LIXEIRA} primeiros vão para a Lixeira (24 horas); o resto NÃO poderá ser restaurado.`} Esta ação não pode ser desfeita.`)) { trava.current = false; return; }
    setOcupado(true);
    try {
      const { data: todos, error: erroLer } = await supabase.from(tabelaAtiva).select('*').limit(LIMITE_LIXEIRA);
      if (erroLer) { mostrarAviso(`Nada foi deletado: não foi possível ler os registros para guardar a cópia na Lixeira (${explicarErroDoBanco(erroLer)}).`, 'erro'); return; }
      const bk = await guardarNaLixeira(tabelaAtiva, todos || []);
      if (!bk.ok) { mostrarAviso(`Nada foi deletado: não foi possível guardar a cópia na Lixeira (${bk.erro}).`, 'erro'); return; }
      // as tabelas usam id uuid: um só pedido, que confere quantas linhas saíram (a resposta traz só a contagem, não as milhares de linhas)
      const { error, count } = await supabase.from(tabelaAtiva).delete({ count: 'exact' }).neq('id', UUID_ZERO);
      if (error || !count) {
        if (!(todos || []).length && !error) { mostrarAviso(`A tabela "${nome}" já estava vazia.`, 'atencao'); return; }
        await tirarDaLixeira(bk.itens);
        mostrarAviso(`Não foi possível limpar: ${error ? explicarErroDoBanco(error) : 'o banco não apagou nenhum registro (você não tem permissão)'}. Nada foi deletado.`, 'erro');
        return;
      }
      const copiados = bk.itens.length;
      if (total != null && count < total) mostrarAviso(`Só ${num(count)} de ${num(total)} registro(s) de "${nome}" foram deletados; os outros continuam na tabela.`, 'erro');
      else mostrarAviso(`${num(count)} registro(s) de "${nome}" deletado(s). ${num(copiados)} foram para a Lixeira (24 horas)${count > copiados ? `; os outros ${num(count - copiados)} NÃO podem ser restaurados` : ''}.`, 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      setSelecionados(new Set());
      await Promise.all([lerLista(), contar()]);
      trava.current = false; setOcupado(false);
    }
  };

  return (
    <div className="acn-dados">
      {faltaContar > 0 && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={contar}>Tentar de novo</Botao>}>
          Não foi possível contar {faltaContar === 1 ? '1 tabela' : `${faltaContar} tabelas`} (aparecem com —). Isso não quer dizer que estejam vazias.
        </Faixa>
      )}
      <Chips className="acn-dados-chips" rotulo="Tabelas" ativo={tabelaAtiva} onChange={setTabelaAtiva}
        itens={TABELAS_CONFIG.map(t => ({ id: t.id, rotulo: t.label, titulo: t.desc, contagem: contagens[t.id] === undefined ? '…' : contagens[t.id] === null ? '—' : num(contagens[t.id] as number) }))} />

      <div className="acn-dados-barra">
        {algumSelecionado
          ? <Botao variante="perigo" icone={mdiDeleteOutline} disabled={travado} onClick={deletarSelecionados}>{ocupado ? 'Aguarde…' : `Deletar ${selecionados.size} selecionado(s)`}</Botao>
          : <span className="acn-fraco">Selecione registros para deletar</span>}
        <div className="acn-dados-barra-dir">
          <Botao pequeno icone={mdiRefresh} disabled={ocupado} onClick={lerLista}>Atualizar</Botao>
          <Botao pequeno variante="perigo-sec" icone={mdiAlertOutline} disabled={travado} onClick={limparTabela}>Limpar tabela toda</Botao>
        </div>
      </div>

      {avisoValores && <Faixa tom="erro">{avisoValores}</Faixa>}
      {erroLista && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={lerLista}>Tentar de novo</Botao>}>
          Não foi possível ler os registros desta tabela ({erroLista}). Isso não quer dizer que ela esteja vazia. Enquanto não forem lidos, não dá para deletar nem limpar.
        </Faixa>
      )}
      {!erroLista && !carregando && total != null && total > registros.length && registros.length >= LIMITE_LISTA && (
        <Faixa tom="info">A lista mostra os {LIMITE_LISTA} mais recentes de {num(total)}. Os outros não aparecem aqui e não podem ser selecionados (só "Limpar tabela toda" os alcança).</Faixa>
      )}

      <div className="sec-card">
        <div className="sec-hdr no-collapse">
          <span>{info?.label} — {registros.length} exibidos / {total == null ? '—' : num(total)} total</span>
          {algumSelecionado && <Selo familia="erro" ponto={false}>{selecionados.size} selecionado(s)</Selo>}
        </div>
        <div className="acn-dados-desc acn-fraco">{info?.desc}</div>
        {carregando ? <div className="acn-empty">Carregando…</div> : erroLista ? null : registros.length === 0 ? (
          <div className="acn-empty">Nenhum registro nesta tabela.</div>
        ) : (
          <div className="acn-rolagem">
            <table className="acn-tabela">
              <thead><tr>
                <th className="acn-dados-col-chk"><input type="checkbox" className="acn-dados-chk" aria-label="Selecionar todos os registros" checked={todosSelecionados} onChange={alternarTodos} /></th>
                <th>Data</th>
                <th>Resumo</th>
              </tr></thead>
              <tbody>
                {registros.map(r => {
                  const sel = selecionados.has(r.id);
                  const resumo = resumoDoRegistro(tabelaAtiva, r);
                  return (
                    <tr key={r.id} className={'acn-dados-linha' + (sel ? ' acn-dados-sel' : '')} onClick={() => alternar(r.id)}>
                      <td className="acn-dados-col-chk" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="acn-dados-chk" aria-label="Selecionar este registro" checked={sel} onChange={() => alternar(r.id)} />
                      </td>
                      <td className="acn-nowrap acn-fraco">{fmtDt(getDataCol(r))}</td>
                      <td className="acn-texto-longo" title={String(resumo)}>{resumo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
