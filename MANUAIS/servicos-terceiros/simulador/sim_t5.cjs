// Serviços de terceiros, fatia T5 (23/11/2026): o BANCO SIMULADO do pedido de pagamento ao Financeiro e da ligação com a Vistoria de pátio. Estende o simulador da T4 (../terceiros_t4/sim_t4.cjs),
// que por sua vez estende o da T2, sem mexer em nenhum dos dois. Repete, de forma simples, o que as funções `terceiros_pagamento_pedir`, `terceiros_vistoria_ligar` e `terceiros_vistoria_desligar`
// do SQL de verdade conferem (o SQL de verdade foi provado à parte: 40 conferências desfeitas no fim, supabase/sql/terceiros_servicos_t5_teste.sql). Nada chega ao banco de produção.
const { estender: estenderT4, criarBanco, diaISO, somarDias, agoraISO, uuid, CLAUSULAS_PADRAO } = require('./sim_t4.cjs');

const erroDoBanco = (message, code = 'P0001') => ({ status: 400, body: { code, message, details: null, hint: null } });
const motivoRuim = (m) => String(m || '').trim().length < 5;

function estender(b, T) {
  estenderT4(b, T);
  b.demandas = [];            // as demandas do Financeiro que existem: { id, status, valor, ... }
  b.vistorias = [];           // as saídas da Vistoria de pátio
  b.pedidosDePagamento = [];  // o que a tela mandou a `terceiros_pagamento_pedir` (para provar que o VALOR nunca vai da tela)
  b.chamadasDeVistoria = [];  // as chamadas a `terceiros_vistoria_ligar` e `_desligar`
  b.falharDemandas = false; b.falharSaidas = false;
  b.leiturasDeDemandas = []; b.leiturasDeSaidas = []; b.leiturasDeSaidasAbertas = 0;
  b.insercoesDeVistoria = [];

  const baseNovo = b.novoServico;
  // todo serviço nasce com as colunas novas da T5, como no banco (nulas)
  b.novoServico = (o) => {
    const s = baseNovo(o);
    for (const k of ['pagamento_demanda_id', 'pagamento_pedido_em', 'pagamento_pedido_por', 'vistoria_id', 'vistoria_ligada_em', 'vistoria_ligada_por']) if (!(k in s)) s[k] = null;
    if (o.pagamento_demanda_id) s.pagamento_demanda_id = o.pagamento_demanda_id;
    if (o.pagamento_pedido_em) s.pagamento_pedido_em = o.pagamento_pedido_em;
    if (o.pagamento_pedido_por) s.pagamento_pedido_por = o.pagamento_pedido_por;
    if (o.vistoria_id) s.vistoria_id = o.vistoria_id;
    return s;
  };

  b.novaDemanda = (o = {}) => { const d = { id: o.id || uuid('9'), status: o.status || 'Pendente', setor: 'Financeiro', titulo: o.titulo || 'Pagamento de terceiro', valor: o.valor ?? null, pagamento_terceiro: o.pagamento_terceiro || null }; b.demandas.push(d); return d; };
  b.novaSaida = (o = {}) => {
    const v = {
      id: o.id || uuid('8'), status: o.status || 'Saiu', data_saida: o.data_saida || agoraISO(3), data_retorno: o.data_retorno || null, previsao_retorno: o.previsao_retorno || null, destino: o.destino || 'Prestador',
      tipo_servico: o.tipo_servico || 'Pecas para Pintura', veiculo_placa: o.veiculo_placa || 'ABC1D23', tipo_documento: o.tipo_documento || 'OPL', numero_documento: o.numero_documento || '', responsavel_envio: o.responsavel_envio || 'Carlos',
    };
    b.vistorias.push(v); return v;
  };

  const ator = () => b.quem;
  const diretoria = () => /^(Admin|Gerente)/.test(b.quem.perfil || '');
  const abas = () => b.quem.abas_permitidas || [];
  const adaptacao = () => abas().includes('producao') || !abas().length;
  const podeOrdem = () => diretoria() || adaptacao();
  const tipoDe = (s) => b.tipos.find(t => t.id === s.tipo_id);
  const podeMexer = (s) => diretoria() || (s.solicitante_id && s.solicitante_id === b.quem.id) || (tipoDe(s)?.quem_marca_data === 'adaptacao' && adaptacao()) || (s.ordem_id && podeOrdem());
  const registrar = (s, acao, detalhe) => { (b.historico[s.id] = b.historico[s.id] || []).push({ em: agoraISO(0), por: ator().nome, acao, detalhe: detalhe || undefined }); };
  const carimbar = (s) => { s.atualizado_em = agoraISO(0); s.atualizado_por = ator().nome; };
  const sem = (o) => { const { ...x } = o; return x; };
  const demandaViva = (s) => { const d = s.pagamento_demanda_id && b.demandas.find(x => x.id === s.pagamento_demanda_id); return !!d && !/^cancel/i.test(String(d.status).normalize('NFD').replace(/[̀-ͯ]/g, '')); };

  // ───────── LEITURAS ─────────
  const lerBase = b.simular;
  b.simular = (url, r) => {
    if (/\/rest\/v1\/demandas_avulsas\?/.test(url)) {
      if (b.falharDemandas) return { status: 500, body: { message: 'falha simulada nas demandas do Financeiro' } };
      const ids = ((url.match(/[?&]id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
      b.leiturasDeDemandas.push(ids);
      return { body: b.demandas.filter(d => ids.includes(d.id)).map(d => ({ id: d.id, status: d.status })) };
    }
    if (/\/rest\/v1\/vistorias_patio\?/.test(url)) {
      if (b.falharSaidas) return { status: 500, body: { message: 'falha simulada nas saídas da vistoria' } };
      const ids = ((url.match(/[?&]id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
      if (ids.length) { b.leiturasDeSaidas.push(ids); return { body: b.vistorias.filter(v => ids.includes(v.id)).map(sem) }; }
      if (/status\.is\.null,status\.neq\.Retornou/.test(url)) {
        b.leiturasDeSaidasAbertas++;
        return { body: b.vistorias.filter(v => v.status !== 'Retornou').sort((x, y) => String(y.data_saida).localeCompare(String(x.data_saida))).slice(0, 200).map(sem) };
      }
      // a tela da própria Vistoria (select=*)
      return { body: [...b.vistorias].sort((x, y) => String(y.data_saida).localeCompare(String(x.data_saida))).map(sem) };
    }
    return lerBase(url, r);
  };

  // ───────── GRAVAÇÕES ─────────
  const baseRpc = b.rpc;
  const baseEscrita = b.escrita;
  b.rpc = (nome, a) => {
    if (b.falharProxima && b.falharProxima[nome]) { const e = b.falharProxima[nome]; delete b.falharProxima[nome]; return e; }

    if (nome === 'terceiros_pagamento_pedir') {
      b.pedidosDePagamento.push(JSON.parse(JSON.stringify(a)));
      const ids = [...new Set(a.p_ids || [])];
      if (ids.length < 1) return erroDoBanco('Escolha pelo menos um serviço.');
      if (ids.length > 100) return erroDoBanco('Peça o pagamento de no máximo 100 serviços de uma vez.');
      const ss = ids.map(id => b.servicos.find(s => s.id === id));
      if (ss.some(s => !s)) return erroDoBanco('Algum serviço não foi encontrado. Atualize a tela.');
      const p = a.p_pagamento || {};
      if (!String(p.favorecido || '').trim()) return erroDoBanco('Diga quem vai receber o pagamento (o favorecido).');
      for (const s of ss) {
        if (!podeMexer(s)) return { status: 403, body: { code: '42501', message: 'Só quem pediu o serviço, a Adaptação (nos tipos dela), os gerentes e o Admin pedem o pagamento.', details: null, hint: null } };
        if (s.status !== 'realizado') return erroDoBanco(`O serviço ${s.numero} ainda não foi dado como realizado.`);
        if (!(Number(s.valor_final) > 0)) return erroDoBanco(`O serviço ${s.numero} não tem valor final maior que zero.`);
        if (!s.prestador_id) return erroDoBanco(`O serviço ${s.numero} não tem prestador.`);
        if (demandaViva(s)) return erroDoBanco(`O pagamento do serviço ${s.numero} já foi pedido ao Financeiro.`);
      }
      if (new Set(ss.map(s => s.prestador_id)).size > 1) return erroDoBanco('Um pedido de pagamento é de um prestador só.');
      const total = Math.round(ss.reduce((t, s) => t + Number(s.valor_final), 0) * 100) / 100;
      const d = b.novaDemanda({ status: 'Pendente', valor: total, pagamento_terceiro: { ...p, valor: total } });
      for (const s of ss) { s.pagamento_demanda_id = d.id; s.pagamento_pedido_em = agoraISO(0); s.pagamento_pedido_por = ator().nome; carimbar(s); registrar(s, 'pagamento_pedido', `demanda ${d.id.slice(-4)} · total ${total}`); }
      return { status: 200, body: { demanda_id: d.id, total, quantidade: ss.length, servicos: ss.map(sem) } };
    }

    if (nome === 'terceiros_vistoria_ligar' || nome === 'terceiros_vistoria_desligar') {
      b.chamadasDeVistoria.push({ nome, a: JSON.parse(JSON.stringify(a)) });
      const ids = [...new Set(a.p_ids || [])];
      if (ids.length < 1) return erroDoBanco('Escolha pelo menos um serviço.');
      const ss = ids.map(id => b.servicos.find(s => s.id === id));
      if (ss.some(s => !s)) return erroDoBanco('Algum serviço não foi encontrado. Atualize a tela.');
      for (const s of ss) if (!podeMexer(s)) return { status: 403, body: { code: '42501', message: 'Só quem pediu o serviço, a Adaptação (nos tipos dela), os gerentes e o Admin ligam o serviço a uma saída.', details: null, hint: null } };
      if (nome === 'terceiros_vistoria_ligar') {
        const v = b.vistorias.find(x => x.id === a.p_vistoria_id);
        if (!v) return erroDoBanco('A saída da vistoria não foi encontrada. Atualize a tela.');
        for (const s of ss) {
          if (s.status === 'cancelado') return erroDoBanco(`O serviço ${s.numero} está cancelado.`);
          if (s.vistoria_id && s.vistoria_id !== v.id) return erroDoBanco(`O serviço ${s.numero} já está ligado a outra saída da vistoria: desligue antes.`);
        }
        for (const s of ss) { if (s.vistoria_id === v.id) continue; s.vistoria_id = v.id; s.vistoria_ligada_em = agoraISO(0); s.vistoria_ligada_por = ator().nome; carimbar(s); registrar(s, 'vistoria_ligada', `${v.veiculo_placa} · ${v.destino}`); }
        return { status: 200, body: ss.map(sem) };
      }
      if (motivoRuim(a.p_motivo)) return erroDoBanco('Informe o motivo (pelo menos 5 letras).');
      for (const s of ss) if (!s.vistoria_id) return erroDoBanco(`O serviço ${s.numero} não está ligado a nenhuma saída.`);
      for (const s of ss) { s.vistoria_id = null; s.vistoria_ligada_em = null; s.vistoria_ligada_por = null; carimbar(s); registrar(s, 'vistoria_desligada', a.p_motivo); }
      return { status: 200, body: ss.map(sem) };
    }
    return baseRpc(nome, a);
  };

  b.escrita = (url, metodo, corpo, cabecalhos) => {
    // a Vistoria de pátio grava a saída nova (a tela da Vistoria é a de antes, com um gancho só): a resposta simulada devolve o id
    if (/\/rest\/v1\/vistorias_patio/.test(url) && metodo === 'POST') {
      let linhas = []; try { linhas = JSON.parse(corpo || '[]'); } catch { /* corpo ilegível */ }
      const nova = (Array.isArray(linhas) ? linhas : [linhas])[0] || {};
      b.insercoesDeVistoria.push(nova);
      const v = b.novaSaida({ ...nova, status: 'Saiu' });
      const quer = String((cabecalhos && (cabecalhos.accept || cabecalhos.Accept)) || '');
      return { status: 201, body: /pgrst\.object/.test(quer) ? { id: v.id } : [{ id: v.id }] };
    }
    return baseEscrita(url, metodo, corpo);
  };

  return b;
}

module.exports = { estender, criarBanco, diaISO, somarDias, agoraISO, uuid, CLAUSULAS_PADRAO };
