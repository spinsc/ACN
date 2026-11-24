// Serviços de terceiros, fatia T2 (23/11/2026): o BANCO SIMULADO do teste de navegador. Tudo que é leitura de `terceiros_*` e `oples` é respondido aqui, dentro do navegador, e toda
// gravação (as funções `terceiros_*` e o armazenamento de anexos) também: nada chega ao banco de produção (o lib.cjs aborta ou responde o que não é leitura).
// As funções repetem, de forma simples, o que o SQL de verdade confere (situação de antes, motivo de 5 letras, duplicado em aberto), para a tela ser provada contra respostas realistas.
const fs = require('fs'); const path = require('path');

const dois = (n) => String(n).padStart(2, '0');
const diaISO = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return diaISO(d); };
const agoraISO = (menosDias = 0) => new Date(Date.now() - menosDias * 86400000).toISOString();

let seqId = 0;
const uuid = (pre = '5') => `00000000-0000-4000-8000-${pre}${String(++seqId).padStart(11, '0')}`;

const projetar = (linhas, url) => {
  const m = String(url).match(/[?&]select=([^&]+)/);
  if (!m || m[1] === '*') return linhas;
  const cols = m[1].split(',').map(s => s.trim()).filter(Boolean);
  return linhas.map(l => Object.fromEntries(cols.filter(c => c in l).map(c => [c, l[c]])));
};

const erroDoBanco = (message, code = 'P0001') => ({ status: 400, body: { code, message, details: null, hint: null } });

function criarBanco({ hoje, tiposReais, quem }) {
  const b = {
    hoje,
    tipos: tiposReais.map(t => ({ ...t })),
    prestadores: [],
    servicos: [],
    oples: [],
    historico: {},          // id do serviço → eventos
    quem: quem || { id: '00000000-0000-0000-0000-000000000000', nome: 'ZZTESTE', perfil: 'Admin' },
    proxNumero: 1,
    lerFalha: false,        // true = a leitura de serviços responde 500
    tiposFalha: false,
    esconderAbertas: false, // true = a conferência "já tem serviço em aberto" volta vazia (para o banco ser o único a barrar o duplicado)
    contadorDeLeituras: 0,
    leiturasDaLista: [],    // as URLs lidas da lista principal (para conferir o "Mostrar todos" e a janela de 120 dias)
    storage: [],            // o que foi enviado/retirado do armazenamento
    falharUploadNoN: 0,     // n-ésimo envio do armazenamento que falha (1 = o primeiro)
    envios: 0,
    tipoPorNome: (nome) => b.tipos.find(t => t.nome === nome),
  };

  const numero = () => `TS-${String(b.proxNumero++).padStart(5, '0')}`;

  b.novoServico = (o) => {
    const id = o.id || uuid('a');
    const num = o.numero || numero();
    const criado = o.criado_em || agoraISO(o.diasAtras || 10);
    const l = {
      id, numero: num, tipo_id: o.tipo_id, descricao: o.descricao || 'Serviço de teste', status: o.status || 'solicitado', status_desde: o.status_desde || agoraISO(o.naColuna ?? 1),
      solicitante_id: o.solicitante_id ?? b.quem.id, solicitante_nome: o.solicitante_nome ?? b.quem.nome, solicitante_perfil: o.solicitante_perfil ?? b.quem.perfil,
      ligacao_tipo: o.ligacao_tipo ?? null, ligacao_id: o.ligacao_id ?? null, ligacao_rotulo: o.ligacao_rotulo ?? null, venda_base: o.venda_base ?? null,
      prestador_id: o.prestador_id ?? null, onde: o.onde ?? null, valor_combinado: o.valor_combinado ?? null, valor_final: o.valor_final ?? null,
      data_desejada: o.data_desejada ?? null, data_agendada: o.data_agendada ?? null, periodo: o.periodo ?? null, data_realizada: o.data_realizada ?? null,
      conferido_por: o.conferido_por ?? null, conferido_em: o.conferido_em ?? null, pecas: o.pecas || [], anexos: o.anexos || [], observacao: o.observacao ?? null,
      cancelado_motivo: o.cancelado_motivo ?? null, cancelado_em: o.cancelado_em ?? null, cancelado_por: o.cancelado_por ?? null,
      criado_em: criado, criado_por: o.solicitante_nome ?? b.quem.nome, atualizado_em: o.atualizado_em || agoraISO(o.naColuna ?? 1), atualizado_por: o.solicitante_nome ?? b.quem.nome,
    };
    b.servicos.push(l);
    b.historico[id] = o.historico || [{ em: criado, por: l.solicitante_nome, acao: 'solicitado', detalhe: 'Pedido de ' + (b.tipos.find(t => t.id === l.tipo_id)?.nome || 'serviço') }];
    return l;
  };

  const registrar = (s, acao, detalhe) => {
    (b.historico[s.id] = b.historico[s.id] || []).push({ em: agoraISO(0), por: b.quem.nome, acao, detalhe: detalhe || undefined });
  };

  const rotuloLigacao = (tipo, id) => {
    if (tipo === 'op') { const o = b.oples.find(x => x.id === id); return o ? { rotulo: o.opl, venda: o.opl.replace(/\/\d+$/, '') } : null; }
    if (tipo === 'os') return { rotulo: id, venda: null };
    return { rotulo: id, venda: null };
  };

  // ───────── LEITURAS (GET e HEAD) ─────────
  b.simular = (url, r) => {
    const metodo = r && r.method ? r.method() : 'GET';
    if (/\/rest\/v1\/terceiros_tipos\?/.test(url)) {
      if (b.tiposFalha) return { status: 500, body: { message: 'falha simulada nos tipos' } };
      return { body: projetar(b.tipos, url) };
    }
    if (/\/rest\/v1\/terceiros_prestadores\?/.test(url)) {
      return { body: projetar([...b.prestadores].sort((x, y) => x.nome.localeCompare(y.nome, 'pt')), url) };
    }
    if (/\/rest\/v1\/terceiros_servicos\?/.test(url)) {
      if (metodo === 'HEAD') {
        const desde = (url.match(/atualizado_em=lt\.(\d{4}-\d{2}-\d{2})/) || [])[1];
        const n = b.servicos.filter(s => ['realizado', 'cancelado'].includes(s.status) && desde && s.atualizado_em.slice(0, 10) < desde).length;
        return { count: n };
      }
      if (b.lerFalha && /select=id,numero,tipo_id/.test(url)) return { status: 500, body: { message: 'falha simulada na leitura' } };
      // a leitura de UM histórico
      if (/select=historico/.test(url)) {
        const id = (url.match(/id=eq\.([^&]+)/) || [])[1];
        const s = b.servicos.find(x => x.id === id);
        return { body: s ? [{ historico: b.historico[id] || [] }] : [] };
      }
      // a conferência "este carro já tem serviço em aberto"
      if (/select=numero,ligacao_id/.test(url)) {
        if (b.esconderAbertas) return { body: [] };
        const tipoId = (url.match(/tipo_id=eq\.([^&]+)/) || [])[1];
        const ids = ((url.match(/ligacao_id=in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
        return { body: b.servicos.filter(s => s.tipo_id === tipoId && ['solicitado', 'agendado'].includes(s.status) && ids.includes(s.ligacao_id)).map(s => ({ numero: s.numero, ligacao_id: s.ligacao_id })) };
      }
      // a contagem por prestador da aba Prestadores
      if (/select=prestador_id/.test(url)) return { body: b.servicos.filter(s => s.prestador_id).map(s => ({ prestador_id: s.prestador_id })) };
      // a leitura principal da lista (paginada)
      b.contadorDeLeituras++;
      b.leiturasDaLista.push(url);
      const offset = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
      if (offset > 0) return { body: [] };
      const desde = (url.match(/atualizado_em\.gte\.(\d{4}-\d{2}-\d{2})/) || [])[1];
      let linhas = b.servicos;
      if (desde) linhas = linhas.filter(s => ['solicitado', 'agendado'].includes(s.status) || s.atualizado_em.slice(0, 10) >= desde);
      return { body: projetar([...linhas].sort((x, y) => x.id.localeCompare(y.id)), url) };
    }
    if (/\/rest\/v1\/oples\?/.test(url)) {
      if (/[?&]id=eq\./.test(url)) {
        const id = (url.match(/id=eq\.([^&]+)/) || [])[1];
        return { body: projetar(b.oples.filter(o => o.id === id), url) };
      }
      // a busca do seletor de vínculo (limit=8): opl.ilike.%texto%
      const q = ((url.match(/opl\.ilike\.%([^%]*)%/) || [])[1] || '').toLowerCase();
      if (q) return { body: projetar(b.oples.filter(o => o.opl.toLowerCase().includes(q)).sort((x, y) => y.opl.localeCompare(x.opl)).slice(0, 8), url) };
      // as OPs do mesmo lote: opl.eq.<base>,opl.like.<base>/%
      const base = (url.match(/opl\.eq\.([^,)]+)/) || [])[1];
      if (base) return { body: projetar(b.oples.filter(o => o.opl === base || o.opl.startsWith(base + '/')).sort((x, y) => x.opl.localeCompare(y.opl)), url) };
      return { body: [] };
    }
    return null;
  };

  // ───────── GRAVAÇÕES (as funções terceiros_* e o armazenamento) ─────────
  const lote = (ids, statusEsperado) => {
    const linhas = [];
    for (const id of ids) {
      const s = b.servicos.find(x => x.id === id);
      if (!s) return { erro: erroDoBanco('O serviço não foi encontrado.') };
      if (s.status !== statusEsperado) return { erro: erroDoBanco(`O serviço ${s.numero} mudou de situação enquanto a janela estava aberta (agora está em ${s.status}). Atualize a tela.`) };
      linhas.push(s);
    }
    return { linhas };
  };
  const saida = (s) => { const { ...l } = s; return l; };
  const carimbo = (s) => { s.atualizado_em = agoraISO(0); s.atualizado_por = b.quem.nome; };
  const motivoRuim = (m) => String(m || '').trim().length < 5;

  b.rpc = (nome, a) => {
    if (b.falharProxima && b.falharProxima[nome]) { const e = b.falharProxima[nome]; delete b.falharProxima[nome]; return e; }
    if (nome === 'terceiros_solicitar') {
      const tipo = b.tipos.find(t => t.id === a.p_tipo_id);
      if (!tipo || !tipo.ativo) return erroDoBanco('Escolha um tipo de serviço ativo.');
      if (String(a.p_descricao || '').trim().length < 3) return erroDoBanco('Descreva o serviço (pelo menos 3 letras).');
      const ligacoes = Array.isArray(a.p_ligacoes) && a.p_ligacoes.length ? a.p_ligacoes : [null];
      if (ligacoes.length > 100) return erroDoBanco('Peça no máximo 100 unidades de uma vez.');
      if (!a.p_permitir_duplicado) {
        for (const l of ligacoes) {
          if (!l) continue;
          const igual = b.servicos.find(s => s.tipo_id === a.p_tipo_id && s.ligacao_id === l.id && ['solicitado', 'agendado'].includes(s.status));
          if (igual) return { status: 400, body: { code: 'TS001', message: `Já existe o serviço ${igual.numero} deste tipo em aberto para ${igual.ligacao_rotulo}. Marque "Pedir mesmo assim" se for outro serviço.`, details: null, hint: null } };
        }
      }
      const criados = [];
      for (const l of ligacoes) {
        const lig = l ? rotuloLigacao(l.tipo, l.id) : null;
        const s = b.novoServico({
          tipo_id: a.p_tipo_id, descricao: String(a.p_descricao).trim(), ligacao_tipo: l ? l.tipo : null, ligacao_id: l ? l.id : null, ligacao_rotulo: lig ? lig.rotulo : null, venda_base: lig ? lig.venda : null,
          data_desejada: a.p_data_desejada, observacao: a.p_observacao, pecas: a.p_pecas || [], prestador_id: a.p_prestador_id, valor_combinado: a.p_valor_combinado, onde: a.p_onde,
          anexos: (a.p_anexos || []).map(x => ({ ...x, por: b.quem.nome, em: agoraISO(0) })), naColuna: 0, diasAtras: 0,
        });
        criados.push({ id: s.id, numero: s.numero, ligacao_rotulo: s.ligacao_rotulo });
      }
      return { status: 200, body: { servicos: criados } };
    }
    if (nome === 'terceiros_atualizar') {
      const r = lote([a.p_id], a.p_status_esperado); if (r.erro) return r.erro;
      const s = r.linhas[0];
      if (!['solicitado', 'agendado'].includes(s.status)) return erroDoBanco('Só se alteram serviços em A definir ou Agendado.');
      const d = a.p_dados || {};
      const antes = JSON.stringify(s);
      const mudou = [];
      for (const k of ['descricao', 'prestador_id', 'valor_combinado', 'onde', 'data_desejada', 'observacao', 'pecas', 'anexos']) {
        if (!(k in d)) continue;
        if (k === 'prestador_id' && d[k] === null && s.status === 'agendado') return erroDoBanco('Para tirar o prestador, volte o serviço para "A definir".');
        if (JSON.stringify(s[k]) !== JSON.stringify(d[k])) { s[k] = d[k]; mudou.push(k); }
      }
      if (JSON.stringify(s) !== antes) { carimbo(s); registrar(s, 'alterado', 'mudou: ' + mudou.join(', ')); }
      return { status: 200, body: saida(s) };
    }
    if (nome === 'terceiros_atualizar_varios') {
      const r = lote(a.p_ids, a.p_status_esperado); if (r.erro) return r.erro;
      const d = a.p_dados || {};
      for (const s of r.linhas) {
        for (const k of ['prestador_id', 'valor_combinado', 'onde', 'data_desejada', 'observacao']) if (k in d) s[k] = d[k];
        carimbo(s); registrar(s, 'alterado', 'ajuste em lote: ' + Object.keys(d).join(', '));
      }
      return { status: 200, body: r.linhas.map(saida) };
    }
    if (nome === 'terceiros_agendar') {
      const r = lote(a.p_ids, a.p_status_esperado); if (r.erro) return r.erro;
      if (!a.p_data || !a.p_periodo) return erroDoBanco('Informe o dia e o período.');
      for (const s of r.linhas) {
        if (a.p_prestador_id) s.prestador_id = a.p_prestador_id;
        if (!s.prestador_id) return erroDoBanco('Escolha o prestador que vai fazer o serviço.');
        const reag = s.status === 'agendado';
        s.status = 'agendado'; s.status_desde = agoraISO(0); s.data_agendada = a.p_data; s.periodo = a.p_periodo; carimbo(s);
        registrar(s, reag ? 'reagendado' : 'agendado', `${a.p_data} · ${a.p_periodo}${a.p_motivo ? ' · ' + a.p_motivo : ''}`);
      }
      return { status: 200, body: r.linhas.map(saida) };
    }
    if (nome === 'terceiros_realizar') {
      const r = lote(a.p_ids, a.p_status_esperado); if (r.erro) return r.erro;
      if (a.p_valor_final == null) return erroDoBanco('Informe o valor final cobrado pelo prestador (pode ser zero).');
      for (const s of r.linhas) {
        if (!s.prestador_id) return erroDoBanco(`O serviço ${s.numero} ainda não tem prestador.`);
        s.status = 'realizado'; s.status_desde = agoraISO(0); s.data_realizada = a.p_data_realizada; s.valor_final = a.p_valor_final;
        s.conferido_por = b.quem.nome; s.conferido_em = agoraISO(0); carimbo(s);
        registrar(s, 'realizado', `feito em ${a.p_data_realizada}, final ${a.p_valor_final}${a.p_observacao ? ' · ' + a.p_observacao : ''}`);
      }
      return { status: 200, body: r.linhas.map(saida) };
    }
    if (nome === 'terceiros_voltar') {
      if (motivoRuim(a.p_motivo)) return erroDoBanco('Escreva o motivo (pelo menos 5 letras).');
      const r = lote(a.p_ids, a.p_status_esperado); if (r.erro) return r.erro;
      for (const s of r.linhas) {
        if (a.p_para === 'solicitado') { s.data_agendada = null; s.periodo = null; registrar(s, 'voltou', a.p_motivo); }
        else { s.data_realizada = null; s.valor_final = null; s.conferido_por = null; s.conferido_em = null; registrar(s, 'reaberto', a.p_motivo); }
        s.status = a.p_para; s.status_desde = agoraISO(0); carimbo(s);
      }
      return { status: 200, body: r.linhas.map(saida) };
    }
    if (nome === 'terceiros_cancelar') {
      if (motivoRuim(a.p_motivo)) return erroDoBanco('Escreva o motivo (pelo menos 5 letras).');
      const r = lote(a.p_ids, a.p_status_esperado); if (r.erro) return r.erro;
      for (const s of r.linhas) {
        s.status = 'cancelado'; s.status_desde = agoraISO(0); s.cancelado_motivo = a.p_motivo; s.cancelado_em = agoraISO(0); s.cancelado_por = b.quem.nome; carimbo(s);
        registrar(s, 'cancelado', a.p_motivo);
      }
      return { status: 200, body: r.linhas.map(saida) };
    }
    return erroDoBanco('função desconhecida no teste: ' + nome, '42883');
  };

  b.escrita = (url, metodo, corpo) => {
    const rpc = (url.match(/\/rest\/v1\/rpc\/(terceiros_\w+)/) || [])[1];
    if (rpc) { let a = {}; try { a = JSON.parse(corpo || '{}'); } catch { /* corpo ilegível */ } return b.rpc(rpc, a); }
    if (/\/storage\/v1\/object\/acn-media\/terceiros\//.test(url) && metodo === 'POST') {
      b.envios++;
      if (b.falharUploadNoN && b.envios === b.falharUploadNoN) return { status: 500, body: { statusCode: '500', error: 'Internal', message: 'falha simulada no envio' } };
      const caminho = decodeURIComponent(url.split('/storage/v1/object/acn-media/')[1] || '');
      b.storage.push({ op: 'enviou', caminho });
      return { status: 200, body: { Key: 'acn-media/' + caminho, Id: uuid('b') } };
    }
    if (/\/storage\/v1\/object\/acn-media$/.test(url) && metodo === 'DELETE') {
      let a = {}; try { a = JSON.parse(corpo || '{}'); } catch { /* ilegível */ }
      for (const p of a.prefixes || []) b.storage.push({ op: 'retirou', caminho: p });
      return { status: 200, body: [] };
    }
    if (/\/rest\/v1\/(audit_log|historico_alteracoes)/.test(url)) return { status: 201, body: [] };
    return null;
  };

  return b;
}

// ───────── os dados de cada cenário ─────────
function semear(b, T) {
  const dia = (n) => somarDias(b.hoje, n);
  const U_ANA = 'u-ana-comercial', U_BRUNO = 'u-bruno-sac', U_ZZ = '00000000-0000-0000-0000-000000000000';   // o ZZTESTE é sempre o mesmo "outro": com outra pessoa logada, S9 e S11 NÃO são dela
  b.ids = { U_ANA, U_BRUNO, U_ZZ };

  const P = (nome, extra = {}) => {
    const p = { id: uuid('c'), nome, nome_norm: nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), razao_social: null, cnpj_cpf: null, contato_nome: null, telefone: null, email: null,
      cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, tipos_ids: [], observacao: null, ativo: true, ...extra };
    b.prestadores.push(p); return p;
  };
  const PA = P('Auto Película Sul', { tipos_ids: [T['Película'], T['Plotagem']], telefone: '(48) 99999-0001', contato_nome: 'Marcos' });
  const PB = P('Pintura Rápida', { tipos_ids: [T['Pintura'], T['Pintura eletrostática']] });
  const PC = P('Lava Jato Centro', { tipos_ids: [T['Lavagem']] });
  const PD = P('Serralheria Antiga', { tipos_ids: [T['Corte e dobra']], ativo: false });
  b.P = { PA, PB, PC, PD };

  const op = (opl, extra = {}) => { const o = { id: uuid('d'), opl, modelo: 'HILUX', chassi: null, placa: null, cliente_nome: 'PM de Palhoça', status_geral: 'Em Produção', ...extra }; b.oples.push(o); return o; };
  const O = {
    a1: op('A1673.2609/01', { placa: 'ABC1D23' }), a2: op('A1673.2609/02', { placa: 'ABC1D24' }), a3: op('A1673.2609/03', { chassi: '9BRKZ3BF0M0123456' }), a4: op('A1673.2609/04', { status_geral: 'Cancelado' }),
    s5: op('A1700.2610/01', { modelo: 'RANGER' }), s5b: op('A1700.2610/02', { modelo: 'RANGER' }),
    s6: op('A1650.2608/01'), s7: op('A1710.2610/01'), s8: op('A1720.2610/01'),
    n1: op('A1750.2610/01', { modelo: 'S10' }), n2: op('A1750.2610/02', { modelo: 'S10' }), n3: op('A1750.2610/03', { modelo: 'S10' }),
    solo: op('A1800.2611', { modelo: 'SPRINTER' }),
  };
  b.O = O;
  const lig = (o) => ({ ligacao_tipo: 'op', ligacao_id: o.id, ligacao_rotulo: o.opl, venda_base: o.opl.replace(/\/\d+$/, '') });

  const S = {};
  // S1..S3: a mesma venda, película, sem prestador, pedida pela Ana (Comercial) → um cartão de grupo com 3 carros
  for (const [k, o] of [['S1', O.a1], ['S2', O.a2], ['S3', O.a3]]) {
    S[k] = b.novoServico({ id: uuid('e'), tipo_id: T['Película'], descricao: 'Película fumê 35% nos vidros laterais e traseiro', ...lig(o), data_desejada: dia(7), solicitante_id: U_ANA, solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial', naColuna: 2 });
  }
  // S4: lavagem de uma OS, com prestador e data desejada que já passou, pedida pelo Bruno (SAC)
  S.S4 = b.novoServico({ id: uuid('e'), tipo_id: T['Lavagem'], descricao: 'Lavagem completa com polimento', ligacao_tipo: 'os', ligacao_id: 'os-2611-021', ligacao_rotulo: '2611-021', prestador_id: PC.id, data_desejada: dia(-2),
    solicitante_id: U_BRUNO, solicitante_nome: 'Bruno SAC', solicitante_perfil: 'SAC', naColuna: 5 });
  // S5: película agendada para HOJE de manhã, com o prestador PA
  S.S5 = b.novoServico({ id: uuid('e'), tipo_id: T['Película'], descricao: 'Película fumê 20% no para-brisa', ...lig(O.s5), status: 'agendado', prestador_id: PA.id, data_agendada: dia(0), periodo: 'manha', data_desejada: dia(0),
    valor_combinado: 800, solicitante_id: U_ANA, solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial', naColuna: 1,
    historico: [{ em: agoraISO(3), por: 'Ana Comercial', acao: 'solicitado', detalhe: 'Pedido de Película' }, { em: agoraISO(1), por: 'ZZTESTE', acao: 'agendado', detalhe: 'hoje · manhã' }] });
  // S6: plotagem agendada há 3 dias (atrasada)
  S.S6 = b.novoServico({ id: uuid('e'), tipo_id: T['Plotagem'], descricao: 'Plotagem lateral com a logomarca da prefeitura', ...lig(O.s6), status: 'agendado', prestador_id: PA.id, data_agendada: dia(-3), periodo: 'tarde',
    valor_combinado: 600, solicitante_id: U_ANA, solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial', naColuna: 4 });
  // S7 e S8: visitas diferentes do mesmo prestador, no mesmo dia e período → choque de data
  S.S7 = b.novoServico({ id: uuid('e'), tipo_id: T['Película'], descricao: 'Película fumê nos vidros', ...lig(O.s7), status: 'agendado', prestador_id: PA.id, data_agendada: dia(2), periodo: 'manha', solicitante_id: U_ANA, solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial', naColuna: 1 });
  S.S8 = b.novoServico({ id: uuid('e'), tipo_id: T['Plotagem'], descricao: 'Plotagem do capô', ...lig(O.s8), status: 'agendado', prestador_id: PA.id, data_agendada: dia(2), periodo: 'manha', solicitante_id: U_ANA, solicitante_nome: 'Ana Comercial', solicitante_perfil: 'Comercial', naColuna: 1 });
  // S9: pintura realizada, avulsa, valor final acima do combinado, pedida pelo ZZTESTE
  S.S9 = b.novoServico({ id: uuid('e'), tipo_id: T['Pintura'], descricao: 'Pintura de dois paralamas', status: 'realizado', prestador_id: PB.id, data_agendada: dia(-6), periodo: 'manha', data_realizada: dia(-5), valor_combinado: 1000, valor_final: 1250,
    conferido_por: 'ZZTESTE', conferido_em: agoraISO(5), solicitante_id: U_ZZ, solicitante_nome: 'ZZTESTE', solicitante_perfil: 'Admin', naColuna: 5 });
  // S10: lavagem cancelada (some do quadro; só aparece em "Cancelados")
  S.S10 = b.novoServico({ id: uuid('e'), tipo_id: T['Lavagem'], descricao: 'Lavagem simples', status: 'cancelado', cancelado_motivo: 'Cliente desistiu da lavagem', cancelado_em: agoraISO(1), cancelado_por: 'Bruno SAC',
    solicitante_id: U_BRUNO, solicitante_nome: 'Bruno SAC', solicitante_perfil: 'SAC', naColuna: 1 });
  // S11: corte e dobra com prestador INATIVO e peça, pedido pelo ZZTESTE
  S.S11 = b.novoServico({ id: uuid('e'), tipo_id: T['Corte e dobra'], descricao: 'Corte e dobra do suporte da barra', prestador_id: PD.id, valor_combinado: 500, pecas: [{ descricao: 'Chapa 3 mm', quantidade: 4 }],
    observacao: 'Levar o desenho impresso', solicitante_id: U_ZZ, solicitante_nome: 'ZZTESTE', solicitante_perfil: 'Admin', naColuna: 0 });
  b.S = S;
  return b;
}

// ───────── arquivos de teste ─────────
function arquivosDeTeste(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = (nome, conteudo) => { const p = path.join(dir, nome); fs.writeFileSync(p, conteudo); return p; };
  return {
    pdf: f('desenho.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')),
    png: f('foto.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001', 'hex')),
    vazio: f('vazio.txt', Buffer.alloc(0)),
    muitos: Array.from({ length: 11 }, (_, i) => f(`arquivo_${String(i + 1).padStart(2, '0')}.txt`, Buffer.from('conteudo ' + (i + 1)))),
  };
}

module.exports = { criarBanco, semear, arquivosDeTeste, diaISO, somarDias, agoraISO, projetar, uuid };
