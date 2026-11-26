// Fotos das telas da Adaptação para o manual (26/11/2026). Dados INVENTADOS, toda gravação bloqueada (nada chega ao banco).
// Como rodar (a partir da raiz do projeto, com o servidor de desenvolvimento ligado em http://localhost:5173/ACN/):
//   NODE_PATH=<node_modules com puppeteer-core> BASE=http://localhost:5173/ACN/ node MANUAIS/adaptacao/fotos.cjs [parte]
// Partes: tela, filtros, linha, menus, kanban, lote, retrabalho, iniciar, andamento, box, equipe, recado, concluir, devolver, lote_acoes, importar,
//         detalhes, veicular, agenda, voucher, equipes. Sem argumento: todas. Saída: public/manuais/adaptacao/img (o manual cita "img/NN-nome.jpg").
// Toda leitura que não é simulada aqui volta VAZIA (nunca o banco de verdade), para nenhuma foto sair com dado real; o usuário que aparece é inventado.
const fs = require('fs');
const path = require('path');
const { abrir, espera, BASE } = require('../../ferramentas/auditoria_layout/lib.cjs');
const SAIDA = process.env.SAIDA || path.join(__dirname, '..', '..', 'public', 'manuais', 'adaptacao', 'img');
fs.mkdirSync(SAIDA, { recursive: true });
const PARTE = process.argv[2] || 'tudo';
const quer = (p) => PARTE === 'tudo' || PARTE === p;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const emHoras = (n) => new Date(Date.now() + n * 3600000).toISOString();

// ───────────────────────── dados inventados ─────────────────────────
const op = (o) => ({ quantidade: 1, tipo_projeto: 'Transformação Veicular', fluxo_entrega: 'adaptacao_matriz', modo_execucao: null, responsavel_producao: null, equipe_nome: null, equipe_id: null,
  tecnico_producao_2_nome: null, boxes: [], boxes_historico: [], pausado: false, data_pausa: null, tempo_pausado_horas: 0, liberado_divulgacao: false, serralheria_status: null,
  prioridade_dia: null, placa: null, origem_venda: 'licitacao', data_entrada: '2026-11-10T12:00:00Z', ...o });
const OPS = [
  op({ id: 'op-01', opl: 'D1060.2611', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Prefeitura de Exemplo/SC', modelo: 'Fiat Toro Endurance', chassi: '9BD1234EXEMPLO0001', placa: 'ABC1D23', data_prevista_entrega: emDias(9) }),
  op({ id: 'op-02', opl: 'A1844.2611/01', status_geral: 'Em Producao', cliente_nome: 'Defesa Civil de Demonstração/PR', modelo: 'Chevrolet S10 LT', chassi: '9BG1234EXEMPLO0011', placa: 'DEF4G56', data_prevista_entrega: emDias(4), modo_execucao: 'individual', responsavel_producao: 'Pedro Alves', boxes: ['BOX 04'], data_inicio_producao: emHoras(-30) }),
  op({ id: 'op-03', opl: 'A1844.2611/02', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Defesa Civil de Demonstração/PR', modelo: 'Chevrolet S10 LT', chassi: '9BG1234EXEMPLO0012', placa: 'DEF4G57', data_prevista_entrega: emDias(4) }),
  op({ id: 'op-04', opl: 'A1844.2611/03', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Defesa Civil de Demonstração/PR', modelo: 'Chevrolet S10 LT', chassi: '9BG1234EXEMPLO0013', placa: 'DEF4G58', data_prevista_entrega: emDias(4) }),
  op({ id: 'op-05', opl: 'D1051.2611', status_geral: 'Em Producao', cliente_nome: 'Guarda Municipal de Exemplo/RS', modelo: 'VW Amarok V6', chassi: '8AW1234EXEMPLO0021', placa: 'GHI7J89', data_prevista_entrega: emDias(0), modo_execucao: 'equipe', equipe_nome: 'Equipe Alfa', responsavel_producao: 'Carlos Lima',
    boxes: ['BOX 03'], boxes_historico: [{ boxes: ['BOX 02'], entrou_em: emHoras(-52), saiu_em: emHoras(-20), por: 'Fábio Reis' }, { boxes: ['BOX 03'], entrou_em: emHoras(-20), saiu_em: null, por: 'Carlos Lima' }], data_inicio_producao: emHoras(-52), liberado_divulgacao: true, tem_mo_serralheria: true, serralheria_status: 'Em Execucao', prioridade_dia: 1 }),
  op({ id: 'op-06', opl: 'A1832.2611', status_geral: 'Em Producao', cliente_nome: 'Polícia Militar de Demonstração/SC', modelo: 'Toyota Hilux SRX', chassi: '9BR1234EXEMPLO0031', placa: 'JKL0M12', data_prevista_entrega: emDias(1), modo_execucao: 'dupla',
    responsavel_producao: 'Pedro Alves', tecnico_producao_2_nome: 'João Matos', boxes: ['BOX 01', 'BOX 02'], data_inicio_producao: emHoras(-80), pausado: true, data_pausa: emHoras(-3), prioridade_dia: 2 }),
  op({ id: 'op-07', opl: 'D1039.2611', origem_venda: 'venda_direta', status_geral: 'Em Producao', cliente_nome: 'Prefeitura de Modelo/PR', modelo: 'Fiat Strada Endurance', chassi: '9BD1234EXEMPLO0041', placa: 'NOP3Q45', data_prevista_entrega: emDias(-3), modo_execucao: 'individual', responsavel_producao: 'Roberto Dias', data_inicio_producao: emHoras(-120) }),
  op({ id: 'op-08', opl: 'A1801.2610', status_geral: 'Retrabalho', cliente_nome: 'Guarda Civil de Exemplo/SP', modelo: 'Ford Ranger XLS', chassi: '9BF1234EXEMPLO0051', placa: 'RST6U78', data_prevista_entrega: emDias(-2), modo_execucao: 'individual', responsavel_producao: 'Roberto Dias',
    obs_reprovacao_cq: 'Chicote da sirene sem identificação nos dois lados. Refazer a etiqueta e conferir o aperto dos terminais.', cq_auditor: 'Marina Costa', tempo_retrabalho_horas: null }),
  op({ id: 'op-09', opl: 'D1048.2611', status_geral: 'Em Retrabalho', cliente_nome: 'Prefeitura de Exemplo/SC', modelo: 'Fiat Strada Endurance', chassi: '9BD1234EXEMPLO0061', placa: 'VWX9Y01', data_prevista_entrega: emDias(2), modo_execucao: 'individual', responsavel_producao: 'João Matos',
    boxes: ['BOX 05'], data_inicio_producao: emHoras(-200), data_inicio_retrabalho: emHoras(-6), obs_reprovacao_cq: 'Barra sinalizadora com folga no suporte direito.', cq_auditor: 'Marina Costa' }),
  op({ id: 'op-10', opl: 'A1850.2611', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Defesa Civil de Exemplo/MG', modelo: 'Mitsubishi L200 Triton', chassi: '93X1234EXEMPLO0071', placa: 'ZAB2C34', data_prevista_entrega: emDias(15), fluxo_entrega: 'adaptacao_externa' }),
  op({ id: 'op-11', opl: 'A1855.2611', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Guarda Municipal de Demonstração/SC', modelo: 'Fiat Toro Endurance', chassi: '9BD1234EXEMPLO0081', data_prevista_entrega: emDias(20), fluxo_entrega: 'adaptacao_externa' }),
  op({ id: 'op-12', opl: 'A1700.2611', status_geral: 'Aguardando Inicio Producao', tipo_projeto: 'Reboque', cliente_nome: 'Prefeitura de Exemplo/RS', modelo: 'Carretinha de resgate', data_prevista_entrega: emDias(7), fluxo_entrega: 'fabricacao_serralheria_envio', tem_mo_serralheria: true, serralheria_status: 'Pendente' }),
  op({ id: 'op-13', opl: 'D1066.2611', origem_venda: 'venda_direta', status_geral: 'Aguardando Inicio Producao', cliente_nome: 'Câmara Municipal de Demonstração/PR', modelo: 'VW Saveiro Robust', chassi: '9BW1234EXEMPLO0091', data_prevista_entrega: null }),
];
const viagemDe = (id, titulo, status, opIds) => ({ id, titulo, status, op_ids: opIds, vinculos: [], paradas: [], equipe: [], historico: [], data_saida: emDias(12), criado_em: '2026-11-20T10:00:00Z', status_desde: '2026-11-22T10:00:00Z', criado_por_nome: 'Sistema (OP de Adaptação externa)', sugestao_destino: 'Av. Exemplo, 100, Belo Horizonte/MG' });
const VIAGENS = [viagemDe('v-1', 'Adaptação de viaturas — Defesa Civil de Exemplo/MG', 'provisionamento', ['op-10']), viagemDe('v-2', 'Adaptação — Guarda Municipal de Demonstração/SC', 'em_aprovacao', ['op-11'])];
const DEMANDAS_OP02 = [{ id: 'dm1', numero_demanda: 'DS-0412', setor_destino: 'Chicotes', descricao: 'Chicote da sirene (2 peças)', status: 'Pendente', opl_id: 'op-02', numero_opl: 'A1844.2611/01', tipo_solicitacao: 'fabricacao', criado_em: emHoras(-60) }];
const EQUIPES = [
  { id: 'e1', nome: 'Equipe Alfa', head_line_nome: 'Carlos Lima', head_line_id: 'c1', membros: [{ nome: 'Pedro Alves' }, { nome: 'João Matos' }, { nome: 'Rafael Gomes' }], ativa: true },
  { id: 'e2', nome: 'Equipe Beta', head_line_nome: 'Roberto Dias', head_line_id: 'c4', membros: [{ nome: 'Tiago Rocha' }, { nome: 'Lucas Nunes' }], ativa: true },
  { id: 'e3', nome: 'Equipe Gama', head_line_nome: 'Fábio Reis', head_line_id: 'c6', membros: [{ nome: 'Marcos Silva' }], ativa: true },
];
const PESSOAS = [['c1', 'Carlos Lima'], ['c2', 'Pedro Alves'], ['c3', 'João Matos'], ['c4', 'Roberto Dias'], ['c5', 'Rafael Gomes'], ['c6', 'Fábio Reis'], ['c7', 'Tiago Rocha'], ['c8', 'Lucas Nunes'], ['c9', 'Marcos Silva']]
  .map(([id, nome]) => ({ id, nome, cargo: 'Técnico de adaptação', tipo_colaborador: 'CLT', ativo: true }));
const OS = [
  { id: 'os-1', numero_os: 'OS-2611-014', is_manutencao_veicular: true, status: 'Em Provisionamento', tipo_avaliacao: 'Presencial', cliente_nome: 'Prefeitura de Exemplo/SC', equipamento_nome: 'Viatura Fiat Toro', marca: 'Fiat', modelo: 'Toro Endurance', chassi: '9BD1234EXEMPLO0101', data_provisionamento: null, defeito_reclamado: 'Barra sinalizadora não liga após lavagem.', cobranca: 'cobrada', data_abertura: '2026-11-20T10:00:00Z' },
  { id: 'os-2', numero_os: 'OS-2611-012', is_manutencao_veicular: true, status: 'Provisionada', tipo_avaliacao: 'Presencial', cliente_nome: 'Guarda Municipal de Exemplo/RS', equipamento_nome: 'Viatura VW Amarok', marca: 'VW', modelo: 'Amarok V6', chassi: '8AW1234EXEMPLO0111', data_provisionamento: emDias(0), periodo_provisionamento: 'Manhã', cobranca: 'cobrada', data_abertura: '2026-11-18T10:00:00Z' },
  { id: 'os-3', numero_os: 'OS-2611-009', is_manutencao_veicular: true, status: 'Provisionada', tipo_avaliacao: 'Presencial', cliente_nome: 'Defesa Civil de Demonstração/PR', equipamento_nome: 'Viatura Chevrolet S10', marca: 'Chevrolet', modelo: 'S10 LT', chassi: '9BG1234EXEMPLO0121', data_provisionamento: emDias(-5), periodo_provisionamento: 'Tarde', cobranca: 'cobrada', data_abertura: '2026-11-12T10:00:00Z' },
  { id: 'os-4', numero_os: 'OS-2611-011', is_manutencao_veicular: true, status: 'Verificação e Orçamento', tipo_avaliacao: 'Presencial', cliente_nome: 'Polícia Militar de Demonstração/SC', equipamento_nome: 'Viatura Toyota Hilux', marca: 'Toyota', modelo: 'Hilux SRX', chassi: '9BR1234EXEMPLO0131', data_provisionamento: emDias(-1), periodo_provisionamento: 'Manhã', defeito_reclamado: 'Sirene sem som e comando da barra falhando.', cobranca: 'cobrada', itens_cotacao: [{ codigo: '412', descricao: 'Sirene eletrônica 100W', quantidade: 1, valor_unitario: 690 }, { codigo: '88', descricao: 'Mão de obra de diagnóstico e troca', quantidade: 1, valor_unitario: 350 }], data_abertura: '2026-11-14T10:00:00Z' },
  { id: 'os-5', numero_os: 'OS-2611-007', is_manutencao_veicular: true, status: 'Aguardando Aprovação Cliente', tipo_avaliacao: 'Presencial', cliente_nome: 'Prefeitura de Modelo/PR', equipamento_nome: 'Viatura Fiat Strada', marca: 'Fiat', modelo: 'Strada Endurance', chassi: '9BD1234EXEMPLO0141', data_provisionamento: emDias(-4), periodo_provisionamento: 'Manhã', cobranca: 'cobrada', valor_orcamento: 1850, data_abertura: '2026-11-08T10:00:00Z' },
  { id: 'os-6', numero_os: 'OS-2611-005', is_manutencao_veicular: true, status: 'Aguardando Início', tipo_avaliacao: 'Presencial', cliente_nome: 'Guarda Civil de Exemplo/SP', equipamento_nome: 'Viatura Ford Ranger', marca: 'Ford', modelo: 'Ranger XLS', chassi: '9BF1234EXEMPLO0151', data_provisionamento: emDias(-6), periodo_provisionamento: 'Tarde', cobranca: 'garantia', tipo_servico: 'Garantia', data_abertura: '2026-11-05T10:00:00Z' },
  { id: 'os-7', numero_os: 'OS-2611-003', is_manutencao_veicular: true, status: 'Em Execução', tipo_avaliacao: 'Presencial', cliente_nome: 'Defesa Civil de Exemplo/MG', equipamento_nome: 'Viatura Mitsubishi L200', marca: 'Mitsubishi', modelo: 'L200 Triton', chassi: '93X1234EXEMPLO0161', data_provisionamento: emDias(-8), periodo_provisionamento: 'Manhã', cobranca: 'cobrada', valor_orcamento: 2400, modo_execucao: 'dupla', tecnico_responsavel: 'Pedro Alves', tecnico_producao_2_nome: 'João Matos', data_inicio_manutencao: emHoras(-20),
    itens_cotacao: [{ codigo: '225', descricao: 'Interled2 vermelho', quantidade: 2, valor_unitario: 420 }, { codigo: '305', descricao: 'Parafuso M6 inox', quantidade: 8, valor_unitario: 2.5 }, { codigo: '88', descricao: 'Mão de obra de instalação', quantidade: 1, valor_unitario: 1540 }],
    materiais_utilizados: [{ codigo: '225', descricao: 'Interled2 vermelho', quantidade: 2, valor_unitario: 420 }, { codigo: '305', descricao: 'Parafuso M6 inox', quantidade: 8, valor_unitario: 2.5 }, { codigo: '88', descricao: 'Mão de obra de instalação', quantidade: 1, valor_unitario: 1540 }], data_abertura: '2026-11-03T10:00:00Z' },
  { id: 'os-8', numero_os: 'OS-2611-002', is_manutencao_veicular: true, status: 'Em Manutenção', tipo_avaliacao: 'Presencial', cliente_nome: 'Prefeitura de Exemplo/RS', equipamento_nome: 'Viatura VW Saveiro', marca: 'VW', modelo: 'Saveiro Robust', chassi: '9BW1234EXEMPLO0171', data_provisionamento: emDias(-9), periodo_provisionamento: 'Manhã', cobranca: 'cobrada', valor_orcamento: 980, modo_execucao: 'individual', tecnico_responsavel: 'Roberto Dias', revisao_pendente: true, data_abertura: '2026-11-02T10:00:00Z' },
];
OS.forEach(o => { o.veiculo_modelo = o.equipamento_nome; o.numero_serie = o.chassi; });
const AGENDAMENTOS = [
  { id: 'ag1', opl_id: 'op-x1', numero_opl: 'D1022.2611', chassi: '9BD1234EXEMPLO0201', cliente_nome: 'Prefeitura de Exemplo/SC', modelo: 'Fiat Toro Endurance', data_agendamento: emDias(2), periodo: 'Manhã', observacoes: 'Revisar a barra sinalizadora e trocar o chicote.', agendado_por_nome: 'Fábio Reis', participantes: [] },
  { id: 'ag2', opl_id: 'op-x2', numero_opl: 'A1790.2611', chassi: '9BG1234EXEMPLO0202', cliente_nome: 'Defesa Civil de Demonstração/PR', modelo: 'Chevrolet S10 LT', data_agendamento: emDias(5), periodo: 'Tarde', observacoes: '', agendado_por_nome: 'Fábio Reis', participantes: [] },
];
const AGUARDANDO_AG = [
  { id: 'op-x3', opl: 'D1031.2611', chassi: '9BD1234EXEMPLO0203', cliente_nome: 'Guarda Municipal de Exemplo/RS', modelo: 'Fiat Strada Endurance', data_prevista_entrega: emDias(10), fluxo_entrega: 'adaptacao_matriz', quantidade: 1, tipo_projeto: 'Manutenção', status_geral: 'Aguardando Agendamento Manutenção' },
  { id: 'op-x4', opl: 'A1811.2611', chassi: '', cliente_nome: 'Polícia Militar de Demonstração/SC', modelo: '', data_prevista_entrega: emDias(14), fluxo_entrega: 'adaptacao_matriz', quantidade: 1, tipo_projeto: 'Manutenção', status_geral: 'Aguardando Agendamento Manutenção' },
];
const TIPOS_VOUCHER = [{ id: 't1', nome: 'Lavagem' }, { id: 't2', nome: 'Película' }, { id: 't3', nome: 'Plotagem' }, { id: 't4', nome: 'Funilaria e pintura' }];
const VOUCHERS = [
  { id: 'vc1', tipo_servico: 'Lavagem', numero_pvop: 'PV-2611-0128', data_servico: emDias(-3), prestador: 'Lava Rápido Exemplo', autorizado_por: 'Ricardo Gomes', criado_em: emHoras(-80), valor_total: 180, itens_voucher: [{ placa_chassi: 'ABC-1D23', modelo: 'Fiat Toro Endurance', valor: '90' }, { placa_chassi: 'DEF-4G56', modelo: 'Chevrolet S10 LT', valor: '90' }] },
  { id: 'vc2', tipo_servico: 'Película', numero_pvop: 'D1051.2611', data_servico: emDias(-6), prestador: 'Insulfilm Demonstração', autorizado_por: 'Ricardo Gomes', criado_em: emHoras(-150), valor_total: 480, itens_voucher: [{ placa_chassi: 'GHI-7J89', modelo: 'VW Amarok V6', valor: '480' }] },
];
const ANDAMENTOS = [
  { id: 'a1', referencia_id: 'D1051.2611', referencia_tipo: 'op', setor: 'Producao', texto: 'Produção iniciada. Responsável: Equipe Alfa (Head: Carlos Lima). BOX: BOX 03.', usuario_nome: 'Fábio Reis', criado_em: emHoras(-52) },
  { id: 'a2', referencia_id: 'D1051.2611', referencia_tipo: 'op', setor: 'Producao', texto: 'Aguardando peça/material para continuar.', usuario_nome: 'Carlos Lima', criado_em: emHoras(-26) },
];
const RESP_OP = [
  { id: 'r4', tipo: 'os', referencia_id: 'os-7', papel: 'responsavel', tecnico_id: 'c2', tecnico_nome: 'Pedro Alves', criado_em: emHoras(-20) },
  { id: 'r5', tipo: 'os', referencia_id: 'os-7', papel: 'responsavel', tecnico_id: 'c3', tecnico_nome: 'João Matos', criado_em: emHoras(-20) },
  { id: 'r6', tipo: 'os', referencia_id: 'os-7', papel: 'apoio', tecnico_id: 'c5', tecnico_nome: 'Rafael Gomes', criado_em: emHoras(-10) },
  { id: 'r1', tipo: 'op', referencia_id: 'op-05', papel: 'responsavel', tecnico_id: 'c1', tecnico_nome: 'Carlos Lima', criado_em: emHoras(-52) },
  { id: 'r2', tipo: 'op', referencia_id: 'op-05', papel: 'responsavel', tecnico_id: 'c2', tecnico_nome: 'Pedro Alves', criado_em: emHoras(-52) },
  { id: 'r3', tipo: 'op', referencia_id: 'op-05', papel: 'apoio', tecnico_id: 'c5', tecnico_nome: 'Rafael Gomes', criado_em: emHoras(-30) },
];

const simular = (urlOriginal, r) => {
  const url = (() => { try { return decodeURIComponent(urlOriginal.replace(/\+/g, ' ')); } catch (e) { return urlOriginal; } })();
  const quer1 = /pgrst\.object/.test(r?.headers?.().accept || '');
  const tabela = (/\/rest\/v1\/([a-z_]+)/.exec(url) || [])[1];
  const lista = (l) => ({ body: l });
  const um = (l) => ({ body: quer1 ? (l[0] || null) : l });
  const porId = (l) => { const m = /[?&]id=eq\.([^&]+)/.exec(url); return m ? l.filter(x => String(x.id) === m[1]) : l; };
  switch (tabela) {
    case 'oples':
      if (/Aguardando Agendamento/.test(url)) return lista(AGUARDANDO_AG);
      if (/[?&]id=eq\./.test(url) || /[?&]opl=eq\./.test(url)) { const m = /[?&](?:id|opl)=eq\.([^&]+)/.exec(url); return um(OPS.filter(o => o.id === m[1] || o.opl === m[1])); }
      if (/status_geral=in/.test(url)) return lista(OPS);
      return lista([]);
    case 'demandas_setoriais': return lista(/opl_id=eq.op-02/.test(url) ? DEMANDAS_OP02 : []);
    case 'viagens': return lista(VIAGENS);
    case 'producao_equipes': return lista(EQUIPES);
    case 'rh_funcionarios': return lista(PESSOAS);
    case 'sac_ordens_servico': return lista(OS);
    case 'agendamentos_manutencao': return lista(AGENDAMENTOS);
    case 'tipos_servico_voucher': return lista(TIPOS_VOUCHER);
    case 'vouchers_servico': return lista(VOUCHERS);
    case 'op_acompanhamentos': return lista(ANDAMENTOS);
    case 'responsaveis_producao': return lista(porId(RESP_OP).filter(x => !/referencia_id=eq\./.test(url) || new RegExp('referencia_id=eq\\.' + x.referencia_id).test(url)));
    default:
      if (tabela) return um([]);   // todo o resto volta vazio: nenhuma foto leva dado real
      return null;
  }
};
const escritaSimulada = (url, metodo) => (/\/rest\/v1\//.test(url) ? { body: [{ id: 'x1' }] } : /storage/.test(url) ? { body: { Key: 'x' } } : { body: {} });

// ───────────────────────── ajudantes de foto ─────────────────────────
const esconderFlutuantes = (page) => page.evaluate(() => {
  document.querySelectorAll('body *').forEach(e => { const c = getComputedStyle(e); if (c.position === 'fixed' && e.offsetWidth > 0 && e.offsetWidth < 90 && e.offsetHeight < 90 && !e.closest('.modal-overlay')) e.style.display = 'none'; });
  document.querySelectorAll('.acn-toast, [role=alert].acn-toast').forEach(e => { e.style.display = 'none'; });
});
const salvar = async (page, nome, opcoes = {}) => {
  await esconderFlutuantes(page);
  const arq = path.join(SAIDA, nome + '.jpg');
  const base = { path: arq, type: 'jpeg', quality: 84 };
  if (opcoes.el) {
    const todos = await page.$$(opcoes.el);
    const h = opcoes.ultimo ? todos[todos.length - 1] : (opcoes.indice != null ? todos[opcoes.indice] : todos[0]);
    if (!h) { console.log('SEM ELEMENTO para', nome, opcoes.el); return false; }
    await h.screenshot(base);
  } else if (opcoes.clip) await page.screenshot({ ...base, clip: opcoes.clip, captureBeyondViewport: false });
  else await page.screenshot(base);
  console.log('foto', nome);
  return true;
};
const clicaTexto = (page, sel, re, dentro) => page.evaluate((sel, re, dentro) => {
  const raiz = dentro ? document.querySelector(dentro) : document;
  if (!raiz) return false;
  const r = new RegExp(re, 'i');
  const el = [...raiz.querySelectorAll(sel)].find(x => r.test((x.innerText || x.getAttribute('aria-label') || x.title || '').trim()) && x.offsetParent !== null);
  if (el) { el.click(); return true; } return false;
}, sel, re, dentro);
const fecha = async (page) => {
  for (let i = 0; i < 6; i++) {
    const aberto = await page.evaluate(() => !!document.querySelector('.modal-overlay, .acn-dialogo'));
    if (!aberto) break;
    await page.evaluate(() => {
      const dlg = document.querySelector('.acn-dialogo');
      if (dlg) { const b = [...dlg.querySelectorAll('.acn-dialogo-btn')].find(x => /^(cancelar|não|nao|fechar)$/i.test(x.innerText.trim())) || dlg.querySelector('.acn-dialogo-btn'); if (b) b.click(); return; }
      const ov = [...document.querySelectorAll('.modal-overlay')].pop();
      const bs = [...ov.querySelectorAll('button')];
      const b = bs.find(x => /^(cancelar|fechar)$/i.test(x.innerText.trim())) || bs.find(x => /^fechar$/i.test(x.getAttribute('aria-label') || ''));
      if (b) b.click();
    });
    await espera(350);
  }
};
const preparar = async (opcoes = {}) => {
  const ctx = await abrir({ largura: opcoes.largura || 1500, altura: opcoes.altura || 900, simular, escritaSimulada });
  // o nome que aparece no topo e nos registros é inventado; as chamadas ao banco seguem com o crachá de teste (todas simuladas ou vazias)
  await ctx.page.evaluateOnNewDocument(() => { try { const u = JSON.parse(localStorage.getItem('user')); u.nome = 'Fábio Reis'; u.email = 'fabio.reis@exemplo.invalid'; localStorage.setItem('user', JSON.stringify(u)); } catch (e) {} });
  return ctx;
};
const irParaAdaptacao = async (page, aba) => {
  await page.goto(BASE + '#/producao' + (aba ? '/' + aba : ''), { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.length > 300, { timeout: 40000 });
  await espera(2800);
};
// abre o ⋯ da linha que tem o texto e devolve se achou
const abreMenuDaLinha = async (page, texto) => {
  const ok = await page.evaluate((t) => {
    const l = [...document.querySelectorAll('table tbody tr')].find(x => x.innerText.includes(t));
    const b = l && l.querySelector('button[aria-label="Mais ações"]');
    if (!b) return false; b.click(); return true;
  }, texto);
  await espera(450);
  return ok;
};
const botaoDaLinha = async (page, texto, rotulo) => {
  const ok = await page.evaluate((t, rot) => {
    const l = [...document.querySelectorAll('table tbody tr')].find(x => x.innerText.includes(t));
    const b = l && [...l.querySelectorAll('button')].find(x => x.innerText.trim().toLowerCase() === rot.toLowerCase());
    if (!b) return false; b.click(); return true;
  }, texto, rotulo);
  await espera(900);
  return ok;
};
const itemDoMenu = async (page, rotulo) => {
  const ok = await page.evaluate((rot) => {
    const it = [...document.querySelectorAll('[role=menuitem], .acn-menu button, .acn-menu-item')].find(x => x.innerText.trim().toLowerCase().startsWith(rot.toLowerCase()));
    if (!it) return false; it.click(); return true;
  }, rotulo);
  await espera(1100);
  return ok;
};
// foto da janela aberta (a última), com a janela alta para não cortar
const fotoDaJanela = (page, nome) => salvar(page, nome, { el: '.modal-box', ultimo: true });

module.exports = { fs, path, abrir, espera, BASE, SAIDA, quer, preparar, irParaAdaptacao, salvar, clicaTexto, fecha, abreMenuDaLinha, botaoDaLinha, itemDoMenu, fotoDaJanela, OPS, emDias, emHoras, simular, escritaSimulada };

if (require.main === module) {
  (async () => {
    const partes = require('./fotos_partes.cjs');
    for (const [nome, fn] of Object.entries(partes)) { if (quer(nome)) { console.log('== parte', nome); try { await fn(module.exports); } catch (e) { console.log('ERRO na parte', nome, e.message); } } }
  })();
}
