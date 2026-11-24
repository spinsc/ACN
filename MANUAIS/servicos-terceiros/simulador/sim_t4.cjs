// Serviços de terceiros, fatia T4 (23/11/2026): o BANCO SIMULADO das ordens de serviço em lote e do modelo do contrato. Estende o simulador da T2 (../terceiros_t2/sim.cjs) sem mexer nele.
// Repete, de forma simples, o que as funções `terceiros_ordem_*` do SQL de verdade conferem (situação de antes, motivo de 5 letras, prestador que faz o tipo, datas, cópia assinada, valor final
// de cada serviço, "a ordem não fica sem serviços") e a trava das cinco funções de serviço para quem está numa ordem em andamento. Nada chega ao banco de produção.
const { criarBanco, diaISO, somarDias, agoraISO, uuid } = require('./sim.cjs');

const erroDoBanco = (message, code = 'P0001') => ({ status: 400, body: { code, message, details: null, hint: null } });
const motivoRuim = (m) => String(m || '').trim().length < 5;

const CLAUSULAS_PADRAO = [
  'Do objeto: o PRESTADOR executa o serviço descrito neste contrato para a CONTRATANTE.',
  'Do preço: o valor combinado é o informado neste documento e só muda com aceite por escrito.',
  'Do prazo: o serviço é entregue na data combinada.',
].join('\n');

function estender(b, T) {
  b.ordens = []; b.histOrdem = {}; b.proxOrdem = 1;
  b.config = {
    empresas: [
      { id: 'acn', nome: 'ACN', razao_social: '', cnpj: '', endereco: '', telefone: '', email: '' },
      { id: 'detech', nome: 'DETECH', razao_social: '', cnpj: '', endereco: '', telefone: '', email: '' },
    ],
    clausulas: CLAUSULAS_PADRAO, aprovada: false, aprovada_por: null, aprovada_em: null, atualizado_em: null, atualizado_por: null,
  };
  b.falharOrdens = false; b.falharConfig = false; b.leiturasDeOrdens = []; b.chamadasDeOrdem = [];
  const base = { simular: b.simular, rpc: b.rpc };
  const ator = () => b.quem;
  const podeOrdem = () => /^(Admin|Gerente)/.test(b.quem.perfil || '') || (b.quem.abas_permitidas || ['producao']).includes('producao') || !(b.quem.abas_permitidas || []).length;
  const registrarServico = (s, acao, detalhe) => { (b.historico[s.id] = b.historico[s.id] || []).push({ em: agoraISO(0), por: ator().nome, acao, detalhe: detalhe || undefined }); };
  const registrarOrdem = (o, acao, detalhe) => { (b.histOrdem[o.id] = b.histOrdem[o.id] || []).push({ em: agoraISO(0), por: ator().nome, acao, detalhe: detalhe || undefined }); };
  const sem = (o) => { const { ...x } = o; return x; };
  const ordemDe = (s) => (s.ordem_id ? b.ordens.find(o => o.id === s.ordem_id) : null);
  const ativa = (o) => !!o && (o.status === 'montada' || o.status === 'enviada');
  const resposta = (o, ids) => ({ status: 200, body: { ordem: sem(o), servicos: b.servicos.filter(s => ids.includes(s.id)).map(sem) } });
  const carimbar = (x) => { x.atualizado_em = agoraISO(0); x.atualizado_por = ator().nome; };
  const tipoDe = (s) => b.tipos.find(t => t.id === s.tipo_id);
  const prestadorFaz = (p, tipoId) => !p.tipos_ids || !p.tipos_ids.length || p.tipos_ids.includes(tipoId);
  const parar = (o, esperado) => (o.status !== esperado ? erroDoBanco(`A ordem ${o.numero} mudou de situação enquanto a janela estava aberta (agora: ${o.status}). Atualize a tela.`) : null);

  /** Cria uma ordem já pronta (para os cenários que começam no meio do caminho). */
  b.criarOrdem = ({ status = 'montada', prestador, servicos, envio, previsao, retornoReal, copias, observacao = null, id }) => {
    const o = {
      id: id || uuid('f'), numero: `OT-${String(b.proxOrdem++).padStart(5, '0')}`, prestador_id: prestador.id, status, status_desde: agoraISO(1),
      data_envio_prevista: envio, previsao_retorno: previsao, data_envio_real: status === 'enviada' || status === 'fechada' ? envio : null, data_retorno_real: retornoReal || null,
      copias: copias || (status === 'enviada' || status === 'fechada' ? [{ caminho: `terceiros/ordens/x/assinada.pdf`, nome: 'ordem assinada.pdf', tamanho: 12000, por: 'ZZTESTE', em: agoraISO(2) }] : []), observacao,
      cancelado_motivo: null, cancelado_em: null, cancelado_por: null, enviada_em: status === 'enviada' || status === 'fechada' ? agoraISO(2) : null, enviada_por: status === 'enviada' || status === 'fechada' ? 'ZZTESTE' : null,
      fechada_em: status === 'fechada' ? agoraISO(1) : null, fechada_por: status === 'fechada' ? 'ZZTESTE' : null, criado_em: agoraISO(3), criado_por: 'ZZTESTE', atualizado_em: agoraISO(1), atualizado_por: 'ZZTESTE',
    };
    b.ordens.push(o);
    b.histOrdem[o.id] = [{ em: agoraISO(3), por: 'ZZTESTE', acao: 'montada', detalhe: `${servicos.length} serviço(s)` }];
    for (const s of servicos) { s.ordem_id = o.id; s.prestador_id = prestador.id; if (status === 'montada' || status === 'enviada') { s.status = 'agendado'; s.periodo = 'dia_todo'; s.data_agendada = status === 'enviada' ? previsao : envio; } }
    return o;
  };

  // ───────── LEITURAS ─────────
  b.simular = (url, r) => {
    const metodo = r && r.method ? r.method() : 'GET';
    if (/\/rest\/v1\/terceiros_ordens\?/.test(url)) {
      if (b.falharOrdens) return { status: 500, body: { message: 'falha simulada nas ordens' } };
      if (/select=historico/.test(url)) {
        const id = (url.match(/id=eq\.([^&]+)/) || [])[1];
        const o = b.ordens.find(x => x.id === id);
        return { body: o ? [{ historico: b.histOrdem[id] || [] }] : [] };
      }
      b.leiturasDeOrdens.push(url);
      const ids = ((url.match(/[?&]id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
      if (ids.length) return { body: b.ordens.filter(o => ids.includes(o.id)).map(sem) };
      const offset = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
      if (offset > 0) return { body: [] };
      const desde = (url.match(/atualizado_em\.gte\.(\d{4}-\d{2}-\d{2})/) || [])[1];
      let linhas = b.ordens;
      if (desde) linhas = linhas.filter(o => ativa(o) || o.atualizado_em.slice(0, 10) >= desde);
      return { body: [...linhas].sort((x, y) => x.id.localeCompare(y.id)).map(sem) };
    }
    if (/\/rest\/v1\/terceiros_config\?/.test(url)) {
      if (b.falharConfig) return { status: 500, body: { message: 'falha simulada no modelo do contrato' } };
      return { body: [{ ...b.config }] };
    }
    if (/\/rest\/v1\/oples\?/.test(url) && /[?&]id=in\./.test(url)) {
      const ids = ((url.match(/[?&]id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
      if (b.falharCarros) return { status: 500, body: { message: 'falha simulada nos carros' } };
      return { body: b.oples.filter(o => ids.includes(o.id)) };
    }
    return base.simular(url, r);
  };

  // ───────── GRAVAÇÕES ─────────
  const servicoDaOrdemAtiva = (ids) => ids.map(id => b.servicos.find(s => s.id === id)).filter(Boolean).find(s => ativa(ordemDe(s)));
  b.rpc = (nome, a) => {
    if (b.falharProxima && b.falharProxima[nome]) { const e = b.falharProxima[nome]; delete b.falharProxima[nome]; return e; }
    if (nome.startsWith('terceiros_ordem_')) b.chamadasDeOrdem.push({ nome, a: JSON.parse(JSON.stringify(a)) });

    // as cinco funções de serviço recusam o serviço que está numa ordem em andamento
    if (['terceiros_atualizar', 'terceiros_atualizar_varios', 'terceiros_agendar', 'terceiros_realizar', 'terceiros_voltar', 'terceiros_cancelar'].includes(nome)) {
      const ids = a.p_ids || (a.p_id ? [a.p_id] : []);
      const preso = servicoDaOrdemAtiva(ids);
      if (preso) return erroDoBanco(`O serviço ${preso.numero} está na ordem ${ordemDe(preso).numero}: mexa nele pela ordem de serviço.`);
    }

    if (nome === 'terceiros_config_salvar') {
      if (b.quem.perfil !== 'Admin') return erroDoBanco('Só o Admin altera o modelo do contrato.', '42501');
      b.config = { empresas: a.p_empresas, clausulas: a.p_clausulas, aprovada: !!a.p_aprovar, aprovada_por: a.p_aprovar ? ator().nome : null, aprovada_em: a.p_aprovar ? agoraISO(0) : null, atualizado_em: agoraISO(0), atualizado_por: ator().nome };
      return { status: 200, body: { id: 1, ...b.config } };
    }
    if (!nome.startsWith('terceiros_ordem_')) return base.rpc(nome, a);

    if (!podeOrdem()) return erroDoBanco('Só o Admin, os gerentes e a Adaptação mexem na ordem de serviço em lote.', '42501');
    if (nome === 'terceiros_ordem_montar') {
      const ids = [...new Set(a.p_servicos || [])];
      if (ids.length < 1) return erroDoBanco('Marque pelo menos um serviço para a ordem.');
      const ss = ids.map(id => b.servicos.find(s => s.id === id));
      if (ss.some(s => !s)) return erroDoBanco('Algum serviço não foi encontrado. Atualize a tela.');
      const p = b.prestadores.find(x => x.id === a.p_prestador_id);
      if (!p || !p.ativo) return erroDoBanco('O prestador escolhido não existe ou está inativo.');
      for (const s of ss) {
        if (!['solicitado', 'agendado'].includes(s.status)) return erroDoBanco(`O serviço ${s.numero} não está em A definir nem Agendado.`);
        if (!tipoDe(s)?.usa_ordem_em_lote) return erroDoBanco(`O tipo do serviço ${s.numero} não usa ordem em lote.`);
        if (ativa(ordemDe(s))) return erroDoBanco(`O serviço ${s.numero} já está na ordem ${ordemDe(s).numero}.`);
        if (!prestadorFaz(p, s.tipo_id)) return erroDoBanco(`O prestador escolhido não faz o tipo "${tipoDe(s).nome}" (serviço ${s.numero}).`);
      }
      if (!a.p_data_envio || a.p_data_envio < b.hoje) return erroDoBanco('O dia do envio não pode ser anterior a hoje.');
      if (!a.p_previsao_retorno || a.p_previsao_retorno < a.p_data_envio) return erroDoBanco('A previsão de retorno não pode ser anterior ao dia do envio.');
      const o = b.criarOrdem({ status: 'montada', prestador: p, servicos: ss, envio: a.p_data_envio, previsao: a.p_previsao_retorno, observacao: a.p_observacao || null });
      o.criado_por = ator().nome; o.copias = [];
      for (const s of ss) { carimbar(s); registrarServico(s, 'em_ordem', `ordem ${o.numero}`); }
      return resposta(o, ids);
    }
    const o = b.ordens.find(x => x.id === a.p_id);
    if (!o) return erroDoBanco('Ordem não encontrada. Atualize a tela.');
    const esperado = parar(o, a.p_status_esperado); if (esperado) return esperado;
    const doBanco = () => b.servicos.filter(s => s.ordem_id === o.id);

    if (nome === 'terceiros_ordem_incluir') {
      if (o.status !== 'montada') return erroDoBanco(`Só se inclui serviço antes de a ordem ser enviada (a ordem ${o.numero} está "${o.status}").`);
      const ids = [...new Set(a.p_servicos || [])]; const p = b.prestadores.find(x => x.id === o.prestador_id);
      for (const id of ids) {
        const s = b.servicos.find(x => x.id === id);
        if (!s || !['solicitado', 'agendado'].includes(s.status) || ativa(ordemDe(s))) return erroDoBanco('Algum serviço não pode entrar na ordem. Atualize a tela.');
        if (!prestadorFaz(p, s.tipo_id)) return erroDoBanco(`O prestador da ordem não faz o tipo "${tipoDe(s).nome}" (serviço ${s.numero}).`);
        s.ordem_id = o.id; s.prestador_id = o.prestador_id; s.status = 'agendado'; s.periodo = 'dia_todo'; s.data_agendada = o.data_envio_prevista; carimbar(s); registrarServico(s, 'em_ordem', `ordem ${o.numero}`);
      }
      carimbar(o); registrarOrdem(o, 'incluiu', `${ids.length} serviço(s)`);
      return resposta(o, ids);
    }
    if (nome === 'terceiros_ordem_tirar') {
      if (motivoRuim(a.p_motivo)) return erroDoBanco('Informe o motivo (pelo menos 5 letras).');
      if (o.status !== 'montada') return erroDoBanco(`Só se tira serviço da ordem antes de ela ser enviada (a ordem ${o.numero} está "${o.status}").`);
      const ids = [...new Set(a.p_servicos || [])];
      if (ids.some(id => !doBanco().some(s => s.id === id))) return erroDoBanco('Algum serviço escolhido não está nesta ordem. Atualize a tela.');
      if (doBanco().filter(s => !ids.includes(s.id)).length === 0) return erroDoBanco('A ordem não pode ficar sem serviços. Para desfazer tudo, cancele a ordem.');
      for (const s of b.servicos.filter(x => ids.includes(x.id))) { s.ordem_id = null; s.status = 'solicitado'; s.data_agendada = null; s.periodo = null; carimbar(s); registrarServico(s, 'saiu_da_ordem', a.p_motivo); }
      carimbar(o); registrarOrdem(o, 'tirou', `${ids.length} serviço(s). Motivo: ${a.p_motivo}`);
      return resposta(o, ids);
    }
    if (nome === 'terceiros_ordem_atualizar') {
      const d = a.p_dados || {};
      if (!['montada', 'enviada'].includes(o.status)) return erroDoBanco(`A ordem ${o.numero} já está encerrada (${o.status}).`);
      if ('prestador_id' in d) {
        if (o.status !== 'montada') return erroDoBanco('O prestador só muda enquanto a ordem espera a assinatura.');
        const p = b.prestadores.find(x => x.id === d.prestador_id);
        if (!p || !p.ativo) return erroDoBanco('O prestador escolhido não existe ou está inativo.');
        for (const s of doBanco()) if (!prestadorFaz(p, s.tipo_id)) return erroDoBanco(`O prestador escolhido não faz o tipo "${tipoDe(s).nome}" (serviço ${s.numero}).`);
        o.prestador_id = p.id; for (const s of doBanco()) { s.prestador_id = p.id; carimbar(s); }
      }
      if ('data_envio_prevista' in d) {
        if (o.status !== 'montada') return erroDoBanco('O dia do envio só muda enquanto a ordem espera a assinatura (depois do envio vale o dia real).');
        if (!d.data_envio_prevista || d.data_envio_prevista < b.hoje) return erroDoBanco('O dia do envio não pode ser anterior a hoje.');
        o.data_envio_prevista = d.data_envio_prevista; for (const s of doBanco()) { s.data_agendada = d.data_envio_prevista; carimbar(s); }
      }
      if ('previsao_retorno' in d) { o.previsao_retorno = d.previsao_retorno; if (o.status === 'enviada') for (const s of doBanco()) { s.data_agendada = d.previsao_retorno; carimbar(s); } }
      if ('observacao' in d) o.observacao = d.observacao || null;
      if ('copias' in d) {
        if (o.status !== 'enviada') return erroDoBanco('A cópia assinada só se troca na ordem enviada.');
        if (!Array.isArray(d.copias) || d.copias.length < 1) return erroDoBanco('A ordem enviada precisa de pelo menos uma cópia assinada.');
        o.copias = d.copias.map(c => ({ por: ator().nome, em: agoraISO(0), ...c }));
      }
      carimbar(o); registrarOrdem(o, 'alterada', Object.keys(d).join(', '));
      return resposta(o, []);
    }
    if (nome === 'terceiros_ordem_enviar') {
      if (o.status !== 'montada') return erroDoBanco(`A ordem ${o.numero} já foi enviada.`);
      if (!Array.isArray(a.p_copias) || a.p_copias.length < 1) return erroDoBanco('Anexe a cópia assinada pelo prestador: sem ela a ordem não é enviada.');
      if (!a.p_data_envio_real || a.p_data_envio_real > b.hoje) return erroDoBanco('O dia do envio não pode ser no futuro.');
      if (a.p_data_envio_real < somarDias(b.hoje, -60)) return erroDoBanco('O dia do envio está a mais de 60 dias.');
      const previsao = a.p_previsao_retorno || o.previsao_retorno;
      if (previsao < a.p_data_envio_real) return erroDoBanco('A previsão de retorno não pode ser anterior ao dia do envio.');
      o.status = 'enviada'; o.status_desde = agoraISO(0); o.data_envio_real = a.p_data_envio_real; o.previsao_retorno = previsao; o.enviada_em = agoraISO(0); o.enviada_por = ator().nome;
      o.copias = a.p_copias.map(c => ({ por: ator().nome, em: agoraISO(0), ...c }));
      for (const s of doBanco()) { s.data_agendada = previsao; carimbar(s); registrarServico(s, 'ordem_enviada', `ordem ${o.numero}`); }
      carimbar(o); registrarOrdem(o, 'enviada', `peças enviadas em ${a.p_data_envio_real}`);
      return resposta(o, doBanco().map(s => s.id));
    }
    if (nome === 'terceiros_ordem_realizar') {
      if (o.status !== 'enviada') return erroDoBanco(`A ordem ${o.numero} ainda não foi enviada.`);
      if (!a.p_data_retorno || a.p_data_retorno > b.hoje) return erroDoBanco('O dia do retorno não pode ser no futuro.');
      if (o.data_envio_real && a.p_data_retorno < o.data_envio_real) return erroDoBanco('O dia do retorno não pode ser anterior ao do envio.');
      const valores = a.p_valores || [];
      for (const s of doBanco()) {
        const v = valores.find(x => x.servico_id === s.id);
        if (!v || v.valor_final == null || Number(v.valor_final) < 0) return erroDoBanco(`Informe o valor final do serviço ${s.numero} (pode ser zero).`);
      }
      for (const s of doBanco()) {
        const v = valores.find(x => x.servico_id === s.id);
        s.status = 'realizado'; s.status_desde = agoraISO(0); s.data_realizada = a.p_data_retorno; s.valor_final = Number(v.valor_final); s.conferido_por = ator().nome; s.conferido_em = agoraISO(0); carimbar(s);
        registrarServico(s, 'realizado', `feito em ${a.p_data_retorno}, final ${v.valor_final}`);
      }
      o.status = 'fechada'; o.status_desde = agoraISO(0); o.data_retorno_real = a.p_data_retorno; o.fechada_em = agoraISO(0); o.fechada_por = ator().nome; carimbar(o); registrarOrdem(o, 'fechada', `peças voltaram em ${a.p_data_retorno}`);
      return resposta(o, doBanco().map(s => s.id));
    }
    if (nome === 'terceiros_ordem_cancelar') {
      if (motivoRuim(a.p_motivo)) return erroDoBanco('Informe o motivo (pelo menos 5 letras).');
      if (o.status !== 'montada') return erroDoBanco(`Só se cancela a ordem antes de ela ser enviada (a ordem ${o.numero} está "${o.status}").`);
      const ids = doBanco().map(s => s.id);
      for (const s of doBanco()) { s.ordem_id = null; s.status = 'solicitado'; s.data_agendada = null; s.periodo = null; carimbar(s); registrarServico(s, 'saiu_da_ordem', a.p_motivo); }
      o.status = 'cancelada'; o.status_desde = agoraISO(0); o.cancelado_motivo = a.p_motivo; o.cancelado_em = agoraISO(0); o.cancelado_por = ator().nome; carimbar(o); registrarOrdem(o, 'cancelada', a.p_motivo);
      return resposta(o, ids);
    }
    return erroDoBanco('função de ordem desconhecida no teste: ' + nome, '42883');
  };
  return b;
}

module.exports = { estender, CLAUSULAS_PADRAO, diaISO, somarDias, agoraISO, uuid, criarBanco };
