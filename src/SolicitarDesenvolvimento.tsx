// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAR DESENVOLVIMENTO À ENGENHARIA — pedido do PCP, item por item (Etapa 18c, 13/10/2026)
//
// Decisão do usuário em 12/10/2026: a OP cai direto no PCP; quando algo nunca foi adaptado e precisa de análise e desenvolvimento, o PCP
// solicita à Engenharia — com a OP anexada (todas as informações dela) e os itens que precisam ser desenvolvidos (suporte, peça, chicote ou o
// que for), um por linha. O pedido nasce no mesmo cadastro de Desenvolvimento que a Engenharia já usa (`engenharia_desenvolvimento`, com as
// 8 etapas) com `origem = 'pcp'`; as linhas ficam em `engenharia_desenvolvimento_itens` (migração da 18a). Um pedido vale para a OP ou para
// as unidades de um lote desmembrado (`opl_ids`).
//
// Pedido em aberto vira PENDÊNCIA da OP (OpPendencias.tsx): a OP segue, o kit sai "com pendência" e a Produção só conclui quando a
// Engenharia entregar — igual ao que já vale para Serralheria, Chicotes e Compras (decisão do usuário em 12/10/2026).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { etapasIniciais } from './DesenvolvimentoPecasTab';
import { TIPOS_DESENVOLVIMENTO, rotuloDoTipo } from './DesenvolvimentoTipos';
import { logChange } from './AuditSystem';
import { notificarEvento } from './whatsappHelper';
import { Botao, Faixa } from './Interface';
import Icone from './Icone';
import { mdiCogOutline, mdiPlus, mdiClose } from '@mdi/js';

const linhaVazia = () => ({ tipo: 'suporte', descricao: '', origem: '' });
// a lista de "item vendido de origem": item do cadastro vale pelo id; item digitado à mão (sem id) vale pelo nome
const chaveVendido = (v: any) => (v?.item_id ? String(v.item_id) : `txt:${v?.nome}`);

/**
 * `ops`: a OP (ou as unidades do lote) a que o pedido se aplica. `itensSugeridos`: itens que o painel de estrutura apontou como "nunca
 * adaptados neste carro" — entram já como linhas, para o PCP só confirmar o tipo e a descrição.
 */
export default function ModalSolicitarDesenvolvimento({ ops, base = null, itensSugeridos = [], currentUser, onClose, onEnviado }: any) {
  const ref = ops[0];
  const lote = ops.length > 1;
  const numero = lote ? (base || ref.opl) : ref.opl;
  const vendidos = (ref.itens_vendidos || []).filter((v: any) => v?.nome);
  const [linhas, setLinhas] = useState<any[]>(() => itensSugeridos.length
    ? itensSugeridos.map((i: any) => ({
        tipo: 'outro',
        descricao: `Estrutura de adaptação de ${i.nome}${ref.modelo ? ' no ' + ref.modelo : ''}`,
        origem: i.item_id ? String(i.item_id) : `txt:${i.nome}`,
      }))
    : [linhaVazia()]);
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const emAcao = useRef(false);   // clique duplo em "Enviar" abria dois pedidos (cuidado da 7.51/7.52)
  const set = (i: number, patch: any) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const enviar = async () => {
    if (emAcao.current) return;
    const validas = linhas.filter(l => String(l.descricao || '').trim());
    if (!validas.length) { alert('Descreva pelo menos um item que precisa ser desenvolvido.'); return; }
    emAcao.current = true;
    setEnviando(true);
    try {
      const agora = new Date().toISOString();
      const resolver = (l: any) => {
        const v = vendidos.find((x: any) => chaveVendido(x) === l.origem);
        return { id: v?.item_id || null, nome: v?.nome || null };
      };
      const resumo = validas.map(l => `• ${rotuloDoTipo(l.tipo)}: ${String(l.descricao).trim()}${resolver(l).nome ? ` (de ${resolver(l).nome})` : ''}`).join('\n');
      const { data: criado, error } = await supabase.from('engenharia_desenvolvimento').insert([{
        opl_id: ref.id, numero_opl: numero, opl_ids: ops.map((o: any) => o.id),
        cliente_nome: ref.cliente_nome || null, veiculo_id: ref.veiculo_id || null, veiculo_nome: ref.modelo || null,
        titulo: `Desenvolvimento — ${numero}`,
        descricao: obs.trim() ? `${resumo}\n\n${obs.trim()}` : resumo,
        etapas: etapasIniciais(), origem: 'pcp', solicitado_por_setor: 'PCP',
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      }]).select('id').single();
      if (error || !criado?.id) { alert('Não foi possível enviar o pedido à Engenharia: ' + (error?.message || 'sem resposta do banco')); return; }

      const { error: erroItens } = await supabase.from('engenharia_desenvolvimento_itens').insert(validas.map(l => ({
        desenvolvimento_id: criado.id, tipo: l.tipo, descricao: String(l.descricao).trim(),
        item_vendido_id: resolver(l).id, item_vendido_nome: resolver(l).nome,
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
      })));
      if (erroItens) {
        // o pedido sem as linhas não serve a ninguém: desfaz o que ESTA ação acabou de criar (nada que já existia é apagado)
        const { error: erroDesfazer } = await supabase.from('engenharia_desenvolvimento').delete().eq('id', criado.id);
        alert('Não foi possível gravar os itens do pedido: ' + erroItens.message
          + (erroDesfazer ? '\n\nO pedido ficou criado sem itens — avise o Admin para não duplicar (' + erroDesfazer.message + ').' : '\n\nNada foi enviado; tente de novo.'));
        return;
      }

      logChange({ module: 'pcp', entityType: 'engenharia_desenvolvimento', entityId: criado.id, changeType: 'INSERT',
        oldRow: null, newRow: { numero_opl: numero, itens: validas.length, origem: 'pcp' }, user: currentUser });
      const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert(ops.map((o: any) => ({
        opl_id: o.id, numero_opl: o.opl, setor: 'PCP',
        evento: `PCP solicitou desenvolvimento à Engenharia: ${validas.length} item(ns).\n${resumo}`,
        status_anterior: o.status_geral, status_novo: o.status_geral,
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
      if (erroLog) alert('O pedido foi enviado, mas o histórico da OP não foi gravado: ' + erroLog.message);
      notificarEvento('pcp_solicita_desenvolvimento',
        `*PCP solicitou desenvolvimento* — OP ${numero}${lote ? ` (lote de ${ops.length})` : ''}\n${resumo}\nPor: ${currentUser?.nome}`);
      onEnviado?.(criado.id);
    } finally {
      emAcao.current = false;
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-eng-bom" role="dialog" aria-label="Solicitar desenvolvimento à Engenharia">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCogOutline} size={16} /> Solicitar desenvolvimento — {numero}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            O pedido vai para a aba Desenvolvimento da Engenharia, com a OP anexada (todas as informações dela). A OP segue: o item vira pendência,
            o kit sai "com pendência" e a Produção só conclui quando a Engenharia entregar.
          </div>
          <div className="acn-quadro tom-info">
            <div>
              <strong>{lote ? `${ops.length} OPs do lote ${numero}` : `OP ${ref.opl}`}</strong>
              {ref.cliente_nome ? ` · ${ref.cliente_nome}` : ''}{ref.modelo ? ` · ${ref.modelo}` : ''}
            </div>
            {vendidos.length > 0 && (
              <div><strong>Vendido:</strong> {vendidos.map((v: any) => `${Number(v.quantidade).toLocaleString('pt-BR')}× ${v.nome}`).join(' · ')}</div>
            )}
          </div>
          <div className="acn-sdv-bloco">
            <div className="acn-label">O que precisa ser desenvolvido *</div>
            <div className="acn-sdv-linhas">
              {linhas.map((l, i) => (
                <div key={i} className="acn-sdv-linha">
                  <select className="acn-input acn-sdv-tipo" aria-label="Tipo do item" value={l.tipo} onChange={e => set(i, { tipo: e.target.value })}>
                    {TIPOS_DESENVOLVIMENTO.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </select>
                  <input className="acn-input acn-sdv-desc" aria-label="Descrição do item" placeholder="O que é e para quê (medidas, material, onde fixa...)"
                    value={l.descricao} onChange={e => set(i, { descricao: e.target.value })} />
                  <select className="acn-input acn-sdv-origem" aria-label="Item vendido de origem" value={l.origem} onChange={e => set(i, { origem: e.target.value })}>
                    <option value="">— item vendido de origem —</option>
                    {vendidos.map((v: any) => <option key={chaveVendido(v)} value={chaveVendido(v)}>{v.nome}</option>)}
                  </select>
                  <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Remover linha" title="Remover"
                    onClick={() => setLinhas(ls => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [linhaVazia()]))} />
                </div>
              ))}
            </div>
            <Botao pequeno icone={mdiPlus} onClick={() => setLinhas(ls => [...ls, linhaVazia()])}>+1 item</Botao>
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="pcp-obs-desenv">Contexto para a Engenharia (opcional)</label>
            <textarea id="pcp-obs-desenv" className="acn-input" rows={3}
              placeholder="Prazo, prioridade, referência de outro carro parecido..."
              value={obs} onChange={e => setObs(e.target.value)} />
          </div>
          {lote && (
            <Faixa tom="info">Um pedido só para as {ops.length} unidades do lote: a pendência vale para todas e fecha junto.</Faixa>
          )}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando...' : 'ENVIAR PEDIDO À ENGENHARIA'}</Botao>
          <Botao disabled={enviando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
