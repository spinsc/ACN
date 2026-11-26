// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LICITAÇÃO VENCIDA — ENDEREÇOS, CONTRATO E ENTREGAS
// Ganhar "10 adaptações" não significa entregar 10 de uma vez: o órgão pede
// 1 agora, 2 depois, 6 depois (e pode nunca pedir as 10), ou pede as 10 e ainda
// faz um aditivo para mais. Aqui fica esse controle, decidido com o usuário:
//  • POR ITEM DO EDITAL: cada item tem quantidade contratada, aditivos, pedidos
//    e saldo (contratado + aditivos − pedidos);
//  • cada PEDIDO de entrega (empenho / ordem de fornecimento) gera a sua OP;
//  • um endereço por pedido — a licitação pode ter vários endereços.
// Tudo grava direto no banco (tabelas licitacao_*), fora do "Salvar Alterações"
// do formulário, como os documentos e a Área Livre.
//
// 12e79 (25/11/2026): a 7.x e a migração para o design system. O banco responde "ok, 0 linhas" a uma gravação que não pôde
// fazer (permissão, registro que sumiu): toda gravação daqui confere a linha devolvida (.select('id')); leitura recusada nunca
// vale como "contrato vazio" (a tela oferecia importar de novo e duplicava os itens); a OP criada que não conseguiu ser ligada
// ao pedido avisa em vermelho (o pedido seguia oferecendo "Gerar OP" e dava para criar uma segunda).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { quantidadesDosItens } from './FormacaoCalculo';
import { UFS, soEnvio } from './FluxoEntrega';
import NovaOpOsModal from './NovaOpOsModal';
import { confirmar, mostrarAviso } from './Feedback';
import { hojeISO, Botao, Faixa, Selo } from './Interface';
import { CampoCep } from './CampoCep';
import { conferirCepAntesDeSalvar, cepParaGravar } from './Cep';
import { explicarErroDoBanco } from './ErroDoBanco';

const n = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const fmtQ = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hoje = () => hojeISO();

export const textoEndereco = (e) => e
  ? [e.identificacao, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ') || '(endereço sem nome)'
  : '—';

const SEM_LINHA = 'o banco não alterou nenhuma linha (o registro pode ter sido removido por outra pessoa ou você não tem permissão para mudá-lo). Atualize a tela e confira.';

// ═════════════════════════════════════════════════════════════════════════════
// ENDEREÇOS DE ENTREGA
// ═════════════════════════════════════════════════════════════════════════════
const END_VAZIO = { identificacao:'', endereco:'', cidade:'', uf:'', cep:'' };

export function EnderecosEntrega({ licitacaoId }) {
  const [lista, setLista] = useState([]);
  const [leu, setLeu] = useState(false);            // já leu ao menos uma vez com sucesso
  const [erroLeitura, setErroLeitura] = useState('');
  const [editando, setEditando] = useState(null);   // null | 'novo' | id
  const [form, setForm] = useState(END_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const ocupado = useRef(false);                     // dois cliques no mesmo instante: o estado só muda depois do desenho

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('licitacao_enderecos').select('*')
      .eq('licitacao_id', licitacaoId).order('ordem').order('criado_em');
    if (error) { setErroLeitura(`Não foi possível ler os endereços de entrega: ${explicarErroDoBanco(error)}`); return; }
    setErroLeitura(''); setLeu(true); setLista(data || []);
  }, [licitacaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (e) => { setEditando(e ? e.id : 'novo'); setForm(e ? { ...END_VAZIO, ...e } : END_VAZIO); };

  const salvar = async () => {
    if (ocupado.current) return;
    if (!form.cidade?.trim() || !form.uf) { mostrarAviso('Informe ao menos a cidade e a UF.', 'atencao'); return; }
    ocupado.current = true; setSalvando(true);
    try {
      // R17 (13/10/2026): o CEP, quando informado e mexido, precisa ser válido (a conferência da embalagem); continua opcional
      const recusaCep = await conferirCepAntesDeSalvar(form.cep, 'CEP', editando === 'novo' ? undefined : lista.find((x: any) => x.id === editando)?.cep);
      if (recusaCep) { mostrarAviso(recusaCep, 'atencao'); return; }
      const payload = {
        identificacao: form.identificacao?.trim() || null, endereco: form.endereco?.trim() || null,
        cidade: form.cidade.trim(), uf: form.uf, cep: cepParaGravar(form.cep),
      };
      const { data, error } = editando === 'novo'
        ? await supabase.from('licitacao_enderecos').insert([{ ...payload, licitacao_id: licitacaoId, ordem: lista.length }]).select('id')
        : await supabase.from('licitacao_enderecos').update(payload).eq('id', editando).select('id');
      if (error) { mostrarAviso(`Não foi possível salvar o endereço: ${explicarErroDoBanco(error)}`, 'erro'); return; }
      if (!data?.length) { mostrarAviso(`Não foi possível salvar o endereço: ${SEM_LINHA}`, 'erro'); return; }
      setEditando(null); carregar();
    } catch (e) {
      mostrarAviso(`Não foi possível salvar o endereço: ${explicarErroDoBanco(e)}`, 'erro');
    } finally { ocupado.current = false; setSalvando(false); }
  };

  const remover = async (e) => {
    // pedido que usava este endereço fica sem endereço (on delete set null), não some
    if (!await confirmar(`Remover o endereço "${textoEndereco(e)}"?`)) return;
    const { data, error } = await supabase.from('licitacao_enderecos').delete().eq('id', e.id).select('id');
    if (error) { mostrarAviso(`Não foi possível remover o endereço: ${explicarErroDoBanco(error)}`, 'erro'); return; }
    if (!data?.length) { mostrarAviso(`Não foi possível remover o endereço: ${SEM_LINHA}`, 'erro'); carregar(); return; }
    carregar();
  };

  return (
    <div className="acn-ce-end">
      <div className="acn-ce-end-cab">
        <span className="acn-ce-end-titulo">Endereços de Entrega</span>
        {editando === null && leu && <Botao pequeno onClick={() => abrir(null)}>+ Endereço</Botao>}
      </div>
      {erroLeitura && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>{erroLeitura}</Faixa>}
      {leu && lista.length === 0 && editando === null && (
        <div className="acn-ce-mudo">Nenhum endereço. Cadastre um ou mais — cada pedido de entrega escolhe o seu.</div>
      )}
      {lista.map(e => editando === e.id ? null : (
        <div key={e.id} className="acn-ce-end-linha">
          <div className="acn-ce-end-texto">
            <strong>{e.identificacao || '(sem nome)'}</strong>
            <span className="acn-ce-fraco"> · {[e.endereco, e.cidade && `${e.cidade}/${e.uf || ''}`, e.cep].filter(Boolean).join(' · ')}</span>
          </div>
          <Botao pequeno onClick={() => abrir(e)} title="Editar">✏️</Botao>
          <Botao pequeno variante="perigo-sec" onClick={() => remover(e)} title="Remover endereço">🗑</Botao>
        </div>
      ))}
      {editando !== null && (
        <div className="acn-ce-end-form">
          <div className="acn-ce-grade end1">
            <div><label className="acn-ce-rot">Identificação</label>
              <input className="acn-input acn-ce-campo" value={form.identificacao || ''} onChange={e => setForm(f => ({ ...f, identificacao: e.target.value }))} placeholder="Ex: Base Chapecó" /></div>
            <div><label className="acn-ce-rot">Endereço</label>
              <input className="acn-input acn-ce-campo" value={form.endereco || ''} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, complemento" /></div>
          </div>
          <div className="acn-ce-grade end2">
            <div><label className="acn-ce-rot">Cidade *</label>
              <input className="acn-input acn-ce-campo" value={form.cidade || ''} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} /></div>
            <div><label className="acn-ce-rot">UF *</label>
              <select className="acn-input acn-ce-campo" value={form.uf || ''} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}>
                <option value="">—</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><label className="acn-ce-rot">CEP</label>
              <CampoCep valor={form.cep || ''} onChange={v => setForm(f => ({ ...f, cep: v }))} className="acn-input acn-ce-campo" rotulo="CEP"
                onResultado={(r) => { if (r.status === 'ok') setForm(f => ({ ...f, cidade: r.cidade, uf: r.uf })); }} /></div>
          </div>
          <div className="acn-ce-acoes">
            <Botao variante="primario" pequeno onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : '💾 Salvar endereço'}</Botao>
            <Botao pequeno onClick={() => setEditando(null)}>Cancelar</Botao>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRATO E ENTREGAS
// ═════════════════════════════════════════════════════════════════════════════

/** Formação de preço de onde importar os itens do edital: a vencedora; senão a
 *  finalizada mais recente; senão a mais recente. Devolve { formacao, erro }: leitura recusada NÃO é "sem formação". */
async function formacaoDaLicitacao(licitacaoId) {
  const { data: vinc, error: erroVinc } = await supabase.from('cotacoes_precos_vinculos').select('cotacao_id')
    .eq('tipo', 'licitacao').eq('processo_id', licitacaoId);
  if (erroVinc) return { formacao: null, erro: erroVinc };
  const ids = (vinc || []).map(v => v.cotacao_id);
  let q = supabase.from('cotacoes_precos').select('id,nome,versao,vencedora,status,itens,parametros_globais,criado_em');
  q = ids.length ? q.or(`licitacao_id.eq.${licitacaoId},id.in.(${ids.join(',')})`) : q.eq('licitacao_id', licitacaoId);
  const { data, error } = await q.order('criado_em', { ascending: false });
  if (error) return { formacao: null, erro: error };
  const lista = data || [];
  return { formacao: lista.find(c => c.vencedora) || lista.find(c => c.status === 'finalizada') || lista[0] || null, erro: null };
}

/** Liga o pedido à OP que acabou de ser criada. Devolve { ok, erro }; "0 linhas" conta como falha: o pedido continuaria
 *  oferecendo "Gerar OP" e uma segunda OP seria criada para o mesmo pedido. */
export async function ligarPedidoAOp(pedidoId, op) {
  const base = String(op?.opl || '').replace(/\/\d+$/, '');   // lote: liga ao número base
  const { data, error } = await supabase.from('licitacao_pedidos').update({ opl_id: op.id, opl: base }).eq('id', pedidoId).select('id');
  if (error) return { ok: false, erro: explicarErroDoBanco(error) };
  if (!data?.length) return { ok: false, erro: 'o banco não alterou o pedido (ele pode ter sido removido ou você não tem permissão para mudá-lo)' };
  return { ok: true, erro: '' };
}

function Linha({ children, adit = false }) {
  return <div className={`acn-ce-linha${adit ? ' adit' : ''}`}>{children}</div>;
}

export function ContratoEntregas({ licit, currentUser }) {
  const [itens, setItens] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [aditivos, setAditivos] = useState([]);
  const [enderecos, setEnderecos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [leu, setLeu] = useState(false);             // as quatro leituras já deram certo ao menos uma vez
  const [erroLeitura, setErroLeitura] = useState('');
  const [form, setForm] = useState(null);      // { tipo:'item'|'pedido'|'aditivo', itemId?, ...campos }
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [opPara, setOpPara] = useState(null);  // pedido em "Gerar OP"
  const ocupado = useRef(false);                 // dois cliques no mesmo instante: o estado só muda depois do desenho

  const carregar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('licitacao_contrato_itens').select('*').eq('licitacao_id', licit.id).order('ordem').order('criado_em'),
      supabase.from('licitacao_pedidos').select('*').eq('licitacao_id', licit.id).order('data_pedido').order('criado_em'),
      supabase.from('licitacao_aditivos').select('*').eq('licitacao_id', licit.id).order('data').order('criado_em'),
      supabase.from('licitacao_enderecos').select('*').eq('licitacao_id', licit.id).order('ordem').order('criado_em'),
    ]);
    // leitura recusada nunca vale como "vazio": o saldo de cada item soma pedidos e aditivos, e o botão de importar duplicaria os itens
    const falhou = [[a, 'os itens'], [b, 'os pedidos'], [c, 'os aditivos'], [d, 'os endereços']].filter(([r]) => r.error);
    if (falhou.length) {
      setErroLeitura(`Não foi possível ler ${falhou.map(([, o]) => o).join(', ')} do contrato: ${explicarErroDoBanco(falhou[0][0].error)}${leu ? ' O que aparece abaixo pode estar desatualizado.' : ''}`);
      setCarregando(false);
      return;
    }
    setItens(a.data || []); setPedidos(b.data || []); setAditivos(c.data || []); setEnderecos(d.data || []);
    setErroLeitura(''); setLeu(true); setCarregando(false);
  }, [licit.id, leu]);
  useEffect(() => { carregar(); }, [licit.id]);

  const saldoDe = (item) => {
    const adit = aditivos.filter(x => x.item_id === item.id).reduce((s, x) => s + n(x.quantidade), 0);
    const ped  = pedidos.filter(x => x.item_id === item.id).reduce((s, x) => s + n(x.quantidade), 0);
    return { adit, ped, total: n(item.quantidade_contratada) + adit, saldo: n(item.quantidade_contratada) + adit - ped };
  };
  const autor = { criado_por: currentUser?.email || null, criado_por_nome: currentUser?.nome || null };

  // ── importar itens do edital da formação de preço ──
  const importar = async () => {
    if (ocupado.current) return;
    ocupado.current = true; setImportando(true);
    try {
      const { formacao: c, erro } = await formacaoDaLicitacao(licit.id);
      if (erro) { mostrarAviso(`Não foi possível ler a Formação de Preço: ${explicarErroDoBanco(erro)}`, 'erro'); return; }
      if (!c || !Array.isArray(c.itens) || c.itens.length === 0) {
        mostrarAviso('Esta licitação não tem Formação de Preço com itens para importar. Adicione os itens com "+ Item".', 'atencao'); return;
      }
      // outra pessoa pode ter importado enquanto esta tela estava aberta: importar de novo duplicaria todos os itens
      const { data: jaTem, error: erroTem } = await supabase.from('licitacao_contrato_itens').select('id').eq('licitacao_id', licit.id).limit(1);
      if (erroTem) { mostrarAviso(`Não foi possível conferir os itens do contrato: ${explicarErroDoBanco(erroTem)}`, 'erro'); return; }
      if (jaTem?.length) { mostrarAviso('Este contrato já tem itens (talvez outra pessoa os tenha importado agora). Nada foi importado; a tela foi atualizada.', 'atencao'); carregar(); return; }
      // A formação é Lote → Item → (Subgrupo) → Produtos; a quantidade de cada
      // item já considera os subgrupos — ver FormacaoCalculo.ts.
      const itensF = quantidadesDosItens(c.itens, c.parametros_globais || {});
      const variosLotes = new Set(itensF.map(x => x.lote)).size > 1;
      const linhas = itensF.map(({ lote, grupo, qtd, produtos }, i) => ({
        licitacao_id: licit.id, ordem: i, unidade: 'UN',
        descricao: `${variosLotes ? lote + ' › ' : ''}${grupo}${produtos.length ? ' — ' + [...new Set(produtos)].slice(0, 3).join(', ') + (new Set(produtos).size > 3 ? '…' : '') : ''}`,
        // vem como sugestão: o aviso abaixo pede conferência da quantidade contratada
        quantidade_contratada: qtd > 0 ? qtd : 1,
      }));
      const { data, error } = await supabase.from('licitacao_contrato_itens').insert(linhas).select('id');
      if (error) { mostrarAviso(`Não foi possível importar os itens: ${explicarErroDoBanco(error)}`, 'erro'); return; }
      if (!data?.length) { mostrarAviso(`Não foi possível importar os itens: ${SEM_LINHA}`, 'erro'); return; }
      mostrarAviso(`${linhas.length} item(ns) importado(s) de "${c.nome || 'Formação'}" v${c.versao || 1}.\n\nConfira a QUANTIDADE CONTRATADA de cada item — a formação nem sempre traz esse número.`, 'atencao');
      carregar();
    } catch (e) {
      mostrarAviso(`Não foi possível importar os itens: ${explicarErroDoBanco(e)}`, 'erro');
    } finally { ocupado.current = false; setImportando(false); }
  };

  // ── gravações ──
  const salvarForm = async () => {
    if (ocupado.current) return;
    const f = form;
    ocupado.current = true; setSalvando(true);
    try {
      let r;
      if (f.tipo === 'item') {
        if (!f.descricao?.trim()) { mostrarAviso('Descreva o item.', 'atencao'); return; }
        const payload = { descricao: f.descricao.trim(), unidade: f.unidade || 'UN', quantidade_contratada: n(f.quantidade_contratada) };
        r = f.id ? await supabase.from('licitacao_contrato_itens').update(payload).eq('id', f.id).select('id')
                 : await supabase.from('licitacao_contrato_itens').insert([{ ...payload, licitacao_id: licit.id, ordem: itens.length }]).select('id');
      } else if (f.tipo === 'aditivo') {
        if (!n(f.quantidade)) { mostrarAviso('Informe a quantidade do aditivo (use negativo para supressão).', 'atencao'); return; }
        r = await supabase.from('licitacao_aditivos').insert([{ licitacao_id: licit.id, item_id: f.itemId,
          quantidade: n(f.quantidade), data: f.data || null, documento: f.documento?.trim() || null,
          observacao: f.observacao?.trim() || null, ...autor }]).select('id');
      } else if (f.tipo === 'pedido') {
        const q = n(f.quantidade);
        if (!(q > 0)) { mostrarAviso('Informe a quantidade do pedido.', 'atencao'); return; }
        const item = itens.find(i => i.id === f.itemId);
        const { saldo } = saldoDe(item);
        if (q > saldo && !await confirmar(`Este pedido (${fmtQ(q)}) é maior que o saldo do item (${fmtQ(saldo)}).\n\nSe houve aditivo, registre-o primeiro. Registrar o pedido mesmo assim?`)) return;
        r = await supabase.from('licitacao_pedidos').insert([{ licitacao_id: licit.id, item_id: f.itemId, quantidade: q,
          data_pedido: f.data || null, prazo_entrega: f.prazo || null, documento: f.documento?.trim() || null,
          endereco_id: f.enderecoId || null, observacao: f.observacao?.trim() || null, ...autor }]).select('id');
      }
      if (r?.error) { mostrarAviso(`Não foi possível salvar: ${explicarErroDoBanco(r.error)}`, 'erro'); return; }
      if (!r?.data?.length) { mostrarAviso(`Não foi possível salvar: ${SEM_LINHA}`, 'erro'); return; }
      setForm(null); carregar();
    } catch (e) {
      mostrarAviso(`Não foi possível salvar: ${explicarErroDoBanco(e)}`, 'erro');
    } finally { ocupado.current = false; setSalvando(false); }
  };

  const remover = async (tabela, reg, descricao, pergunta) => {
    if (tabela === 'licitacao_pedidos' && reg.opl && !await confirmar(`Este pedido já gerou a OP ${reg.opl}. Remover o pedido NÃO apaga a OP.\n\nRemover o pedido mesmo assim?`)) return;
    if (tabela !== 'licitacao_pedidos' || !reg.opl) { if (!await confirmar(pergunta || `Remover ${descricao}?`)) return; }
    const { data, error } = await supabase.from(tabela).delete().eq('id', reg.id).select('id');
    if (error) { mostrarAviso(`Não foi possível remover: ${explicarErroDoBanco(error)}`, 'erro'); return; }
    if (!data?.length) { mostrarAviso(`Não foi possível remover: ${SEM_LINHA}`, 'erro'); carregar(); return; }
    carregar();
  };
  // o item some com todos os pedidos e aditivos: a pergunta diz quantos são, e se algum pedido já virou OP (a OP não é apagada)
  const removerItem = (item) => {
    const peds = pedidos.filter(p => p.item_id === item.id), adits = aditivos.filter(a => a.item_id === item.id);
    const comOp = peds.filter(p => p.opl).map(p => p.opl);
    const contagem = `${peds.length} pedido(s) e ${adits.length} aditivo(s)`;
    const aviso = comOp.length ? ` Os pedidos que já geraram OP (${[...new Set(comOp)].join(', ')}) saem da lista, mas as OPs NÃO são apagadas.` : '';
    return remover('licitacao_contrato_itens', item, '', `Remover o item "${item.descricao}" com todos os seus ${contagem}?${aviso}`);
  };

  // ── pedido → OP (abre a Nova OP já preenchida; ao salvar, liga a OP ao pedido) ──
  const gerarOp = (pedido) => {
    const item = itens.find(i => i.id === pedido.item_id);
    const end = enderecos.find(e => e.id === pedido.endereco_id);
    const qtd = Math.max(1, Math.round(n(pedido.quantidade)));
    const prefill = {
      cliente_nome:   licit.nome_projeto || '',          // coluna legada: é o NOME DO ÓRGÃO
      quantidade:     qtd,
      veiculos:       Array.from({ length: qtd }, () => ({ chassi:'', placa:'' })),
      prazo_entrega:  pedido.prazo_entrega || '',
      origem_venda:   'licitacao',
      fluxo_entrega:  licit.fluxo_entrega || '',
      destino_cidade: end?.cidade || '', destino_uf: end?.uf || '', destino_cep: end?.cep || '',
      resumo_servicos: `${item?.descricao || ''} — ${fmtQ(pedido.quantidade)} ${item?.unidade || 'UN'}`,
      licitacao_id:   licit.id,
      // o item do edital pedido já é o vendido: 1 por unidade quando vira lote
      itens_vendidos: item?.descricao ? [{
        nome: item.descricao,
        quantidade: qtd > 1 && !soEnvio(licit.fluxo_entrega) ? 1 : n(pedido.quantidade),
        descricao: [licit.numero && `Licitação ${licit.numero}`, pedido.documento && `pedido ${pedido.documento}`].filter(Boolean).join(' · '),
      }] : [],
      observacoes: [
        `Licitação ${licit.numero || ''}`,
        pedido.documento ? `Pedido/empenho ${pedido.documento}` : null,
        end ? `Entrega: ${[end.identificacao, end.endereco, end.cidade && `${end.cidade}/${end.uf || ''}`, end.cep].filter(Boolean).join(', ')}` : null,
      ].filter(Boolean).join(' · '),
    };
    try { localStorage.setItem('acn_nova_op_prefill', JSON.stringify(prefill)); } catch {}
    setOpPara(pedido);
  };
  const aoCriarOp = async (op, tipo) => {
    if (!opPara) return;
    if (tipo && tipo !== 'op') {
      mostrarAviso(`Foi criada uma ${String(tipo).toUpperCase()}, e não uma OP: o pedido continua sem OP. Se queria a OP, use "Gerar OP" de novo.`, 'atencao');
      return;
    }
    if (!op?.id) {
      mostrarAviso('A OP foi criada, mas não foi possível ligá-la ao pedido (a resposta veio sem o código dela). NÃO gere outra OP para este pedido: avise a TI com o número da OP.', 'erro');
      return;
    }
    const r = await ligarPedidoAOp(opPara.id, op);
    if (!r.ok) mostrarAviso(`A OP ${op.opl || ''} foi criada, mas não foi possível ligá-la ao pedido: ${r.erro}. O pedido ainda aparece sem OP: NÃO gere outra OP para ele, avise a TI com o número ${op.opl || 'da OP'}.`, 'erro');
    carregar();
  };

  if (carregando) return <div className="acn-ce-mudo acn-ce-carregando">Carregando contrato...</div>;

  const F = form;
  const campo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const falhouTudo = !leu;   // a primeira leitura não deu certo: nada de mostrar "contrato vazio" nem oferecer importar ou + Item

  return (
    <div className="acn-ce">
      {erroLeitura && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>{erroLeitura}</Faixa>}
      <div className="acn-ce-cab">
        <div className="acn-ce-cab-linha">
          <div>
            <div className="acn-ce-titulo">📦 Contrato e Entregas</div>
            <div className="acn-ce-sub">
              Por item do edital: contratado + aditivos − pedidos = saldo. Cada pedido gera a sua OP.
              {licit.prazo_entrega && <> · Prazo de entrega do edital: <strong>{licit.prazo_entrega}</strong></>}
            </div>
          </div>
          {!falhouTudo && (
            <div className="acn-ce-acoes">
              {itens.length === 0 && <Botao pequeno onClick={importar} disabled={importando}>{importando ? 'Importando...' : '📥 Importar itens da Formação de Preço'}</Botao>}
              <Botao variante="primario" pequeno onClick={() => setForm({ tipo:'item', unidade:'UN', quantidade_contratada:'' })}>+ Item</Botao>
            </div>
          )}
        </div>
        {!falhouTudo && enderecos.length === 0 && (
          <div className="acn-ce-alerta">⚠️ Nenhum endereço de entrega cadastrado — cadastre no formulário (lado esquerdo) para escolher em cada pedido.</div>
        )}
      </div>

      {/* formulário único: item / pedido / aditivo */}
      {F && (
        <div className="acn-ce-form">
          <div className="acn-ce-form-titulo">
            {F.tipo === 'item' ? (F.id ? 'Editar item' : 'Novo item do edital')
              : F.tipo === 'pedido' ? `Novo pedido de entrega — ${itens.find(i => i.id === F.itemId)?.descricao || ''}`
              : `Aditivo / supressão — ${itens.find(i => i.id === F.itemId)?.descricao || ''}`}
          </div>
          {F.tipo === 'item' && (
            <div className="acn-ce-grade item">
              <div><label className="acn-ce-rot">Descrição *</label><input className="acn-input acn-ce-campo" value={F.descricao || ''} onChange={e => campo('descricao', e.target.value)} placeholder="Ex: Item 1 — Adaptação viatura ostensiva" /></div>
              <div><label className="acn-ce-rot">Unidade</label><input className="acn-input acn-ce-campo" value={F.unidade || ''} onChange={e => campo('unidade', e.target.value.toUpperCase())} /></div>
              <div><label className="acn-ce-rot">Qtd. contratada</label><input className="acn-input acn-ce-campo" type="number" min={0} value={F.quantidade_contratada ?? ''} onChange={e => campo('quantidade_contratada', e.target.value)} /></div>
            </div>
          )}
          {F.tipo === 'pedido' && (
            <div className="acn-ce-grade pedido">
              <div><label className="acn-ce-rot">Quantidade *</label><input className="acn-input acn-ce-campo" type="number" min={1} value={F.quantidade ?? ''} onChange={e => campo('quantidade', e.target.value)} /></div>
              <div><label className="acn-ce-rot">Data do pedido</label><input className="acn-input acn-ce-campo" type="date" value={F.data || ''} onChange={e => campo('data', e.target.value)} /></div>
              <div><label className="acn-ce-rot">Prazo de entrega</label><input className="acn-input acn-ce-campo" type="date" value={F.prazo || ''} onChange={e => campo('prazo', e.target.value)} /></div>
              <div><label className="acn-ce-rot">Nº empenho / AF</label><input className="acn-input acn-ce-campo" value={F.documento || ''} onChange={e => campo('documento', e.target.value)} /></div>
              <div className="acn-ce-esq"><label className="acn-ce-rot">Endereço de entrega</label>
                <select className="acn-input acn-ce-campo" value={F.enderecoId || ''} onChange={e => campo('enderecoId', e.target.value)}>
                  <option value="">— escolha —</option>
                  {enderecos.map(e => <option key={e.id} value={e.id}>{textoEndereco(e)}</option>)}
                </select></div>
              <div className="acn-ce-dir"><label className="acn-ce-rot">Observação</label><input className="acn-input acn-ce-campo" value={F.observacao || ''} onChange={e => campo('observacao', e.target.value)} /></div>
            </div>
          )}
          {F.tipo === 'aditivo' && (
            <div className="acn-ce-grade aditivo">
              <div><label className="acn-ce-rot">Quantidade (+ / −) *</label><input className="acn-input acn-ce-campo" type="number" value={F.quantidade ?? ''} onChange={e => campo('quantidade', e.target.value)} placeholder="Ex: 3 ou -2" /></div>
              <div><label className="acn-ce-rot">Data</label><input className="acn-input acn-ce-campo" type="date" value={F.data || ''} onChange={e => campo('data', e.target.value)} /></div>
              <div><label className="acn-ce-rot">Nº termo aditivo</label><input className="acn-input acn-ce-campo" value={F.documento || ''} onChange={e => campo('documento', e.target.value)} /></div>
              <div><label className="acn-ce-rot">Observação</label><input className="acn-input acn-ce-campo" value={F.observacao || ''} onChange={e => campo('observacao', e.target.value)} /></div>
            </div>
          )}
          <div className="acn-ce-acoes acn-ce-acoes-form">
            <Botao variante="primario" pequeno onClick={salvarForm} disabled={salvando}>{salvando ? 'Salvando...' : '💾 Salvar'}</Botao>
            <Botao pequeno onClick={() => setForm(null)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {itens.length === 0 && !F && !falhouTudo && (
        <div className="acn-ce-vazio">
          Nenhum item do contrato ainda. Importe da Formação de Preço ou adicione com <strong>+ Item</strong>.
        </div>
      )}

      {itens.map(item => {
        const s = saldoDe(item);
        const peds = pedidos.filter(p => p.item_id === item.id);
        const adits = aditivos.filter(a => a.item_id === item.id);
        const tom = s.saldo < 0 ? 'neg' : s.saldo === 0 ? 'zero' : 'ok';
        return (
          <div key={item.id} className="acn-ce-item">
            <div className="acn-ce-item-cab">
              <div className="acn-ce-item-info">
                <div className="acn-ce-item-nome">{item.descricao}</div>
                <div className="acn-ce-item-nums">
                  Contratado <strong>{fmtQ(item.quantidade_contratada)}</strong>
                  {s.adit !== 0 && <> · Aditivos <strong>{s.adit > 0 ? '+' : ''}{fmtQ(s.adit)}</strong></>}
                  {' '}· Pedidos <strong>{fmtQ(s.ped)}</strong> {item.unidade}
                </div>
              </div>
              <div className="acn-ce-saldo" data-tom={tom}>
                <div className="acn-ce-saldo-rot">SALDO</div>
                <div className="acn-ce-saldo-val">{fmtQ(s.saldo)} <span className="acn-ce-saldo-un">{item.unidade}</span></div>
              </div>
              <div className="acn-ce-item-acoes">
                <Botao variante="primario" pequeno onClick={() => setForm({ tipo:'pedido', itemId:item.id, data:hoje(), prazo:'', enderecoId: enderecos.length === 1 ? enderecos[0].id : '' })}>+ Pedido</Botao>
                <Botao pequeno onClick={() => setForm({ tipo:'aditivo', itemId:item.id, data:hoje() })}>+ Aditivo</Botao>
                <Botao pequeno onClick={() => setForm({ tipo:'item', ...item })} title="Editar item">✏️</Botao>
                <Botao pequeno variante="perigo-sec" onClick={() => removerItem(item)} title="Remover item">🗑</Botao>
              </div>
            </div>

            {peds.map(p => {
              const end = enderecos.find(e => e.id === p.endereco_id);
              return (
                <Linha key={p.id}>
                  <span className="acn-ce-qtd">📋 {fmtQ(p.quantidade)} {item.unidade}</span>
                  <span>pedido {fmtD(p.data_pedido)}{p.documento ? ` · ${p.documento}` : ''}</span>
                  <span className="acn-ce-fraco">→ {end ? textoEndereco(end) : <em className="acn-ce-sem-end">sem endereço</em>}</span>
                  {p.prazo_entrega && <span className="acn-ce-fraco">· entrega até {fmtD(p.prazo_entrega)}</span>}
                  {p.observacao && <span className="acn-ce-mudo">· {p.observacao}</span>}
                  <span className="acn-ce-fim">
                    {p.opl
                      ? <Selo familia="ok" ponto={false}>OP {p.opl}</Selo>
                      : <Botao variante="primario" pequeno onClick={() => gerarOp(p)}>🏭 Gerar OP</Botao>}
                    <Botao pequeno variante="perigo-sec" onClick={() => remover('licitacao_pedidos', p, 'este pedido')} title="Remover pedido">🗑</Botao>
                  </span>
                </Linha>
              );
            })}
            {adits.map(a => (
              <Linha key={a.id} adit>
                <span className="acn-ce-qtd adit">{n(a.quantidade) > 0 ? '➕' : '➖'} {fmtQ(Math.abs(n(a.quantidade)))} {item.unidade}</span>
                <span>{n(a.quantidade) > 0 ? 'aditivo' : 'supressão'} {fmtD(a.data)}{a.documento ? ` · ${a.documento}` : ''}</span>
                {a.observacao && <span className="acn-ce-mudo">· {a.observacao}</span>}
                <span className="acn-ce-fim">
                  <Botao pequeno variante="perigo-sec" onClick={() => remover('licitacao_aditivos', a, 'este aditivo')} title="Remover aditivo">🗑</Botao>
                </span>
              </Linha>
            ))}
            {peds.length === 0 && adits.length === 0 && (
              <div className="acn-ce-sem-pedido">Nenhum pedido ainda.</div>
            )}
          </div>
        );
      })}

      {opPara && (
        <NovaOpOsModal isOpen currentUser={currentUser}
          onClose={() => { setOpPara(null); carregar(); }}
          onSaved={(op, tipo) => aoCriarOp(op, tipo)} />
      )}
    </div>
  );
}
