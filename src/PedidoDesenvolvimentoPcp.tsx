// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PEDIDO DO PCP NA ENGENHARIA — os itens a desenvolver, um por linha (Etapa 18d, 13/10/2026)
//
// Decisão do usuário em 12/10/2026: a Engenharia deixa de receber a OP e passa a receber só SOLICITAÇÕES DE DESENVOLVIMENTO. O pedido que o PCP faz
// (SolicitarDesenvolvimento.tsx) chega aqui, na aba Desenvolvimento, com a OP anexada ("Ver OP") e uma linha por item: tipo, descrição e o item vendido de
// origem. A Engenharia dá andamento item a item: pendente → em andamento → entregue (ou cancelado, com motivo).
//
// Entregar um item significa que a composição dele naquele veículo está cadastrada (decisão do usuário: quem desenvolve cadastra a estrutura; o PCP só a
// aplica na OP). Por isso a linha mostra, ao vivo, se a estrutura do veículo × item já existe, e entregar sem ela pede confirmação — não trava: pode haver
// peça avulsa que não entra em estrutura nenhuma.
//
// Quando todos os itens estão entregues ou cancelados o pedido vira "concluído" (`concluida = true`): é isso que fecha a pendência do lado do setor
// (OpPendencias.tsx), e o PCP então a libera para a produção. Reabrir um item reabre o pedido.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { rotuloDoTipo } from './DesenvolvimentoTipos';
import { OplDetalheModal } from './AcnTabShared';
import { logChange } from './AuditSystem';
import { notificarEvento } from './whatsappHelper';
import { confirmar, pedirTexto } from './Feedback';
import { Botao, Faixa, Selo } from './Interface';
import { mdiEyeOutline, mdiPuzzleOutline } from '@mdi/js';

const SITUACAO: Record<string, { rotulo: string; familia: string }> = {
  pendente: { rotulo: 'Pendente', familia: 'atencao' },
  em_andamento: { rotulo: 'Em andamento', familia: 'info' },
  entregue: { rotulo: 'Entregue', familia: 'ok' },
  cancelado: { rotulo: 'Cancelado', familia: 'neutro' },
};
const fechado = (i: any) => i.situacao === 'entregue' || i.situacao === 'cancelado';

export default function PedidoDoPcp({ demanda, onAtualizado, currentUser }: any) {
  const [itens, setItens] = useState<any[] | null>(null);       // null = ainda lendo
  const [erro, setErro] = useState('');
  const [estrutura, setEstrutura] = useState<Map<string, boolean> | null>(null);   // item vendido → a estrutura no veículo existe? (null = não dá para saber)
  const [emAcao, setEmAcao] = useState<string | null>(null);   // id do item em gravação (desliga os botões dele)
  const trava = useRef(false);                                 // clique duplo em "Entregar"/"Cancelar" gravava duas vezes (cuidado da 7.51/7.52)
  const [opAberta, setOpAberta] = useState<any>(null);

  const carregar = async () => {
    const { data, error } = await supabase.from('engenharia_desenvolvimento_itens').select('*')
      .eq('desenvolvimento_id', demanda.id).order('criado_em', { ascending: true });
    // leitura que falha não pode parecer "este pedido não tem itens"
    if (error) { setErro(error.message); return null; }
    setErro('');
    setItens(data || []);
    const ids = [...new Set((data || []).map((i: any) => i.item_vendido_id).filter(Boolean).map(String))];
    if (demanda.veiculo_id && ids.length) {
      const { data: com, error: erroEst } = await supabase.from('veiculo_item_materiais').select('item_id')
        .eq('veiculo_id', demanda.veiculo_id).in('item_id', ids);
      if (erroEst) setEstrutura(null);   // sem a resposta do banco, não afirma nada
      else { const tem = new Set((com || []).map((c: any) => String(c.item_id))); setEstrutura(new Map(ids.map(id => [id, tem.has(id)]))); }
    } else setEstrutura(null);
    return data || [];
  };
  useEffect(() => { carregar(); }, [demanda.id]);

  const abrirOp = async () => {
    const { data, error } = await supabase.from('oples').select('*').eq('id', demanda.opl_id).maybeSingle();
    if (error || !data) { alert('Não foi possível abrir a OP' + (error ? ': ' + error.message : ' (não encontrada).')); return; }
    setOpAberta(data);
  };

  // todos os itens entregues ou cancelados = pedido concluído (fecha a pendência do setor); qualquer item aberto o reabre
  const sincronizarPedido = async (frescos: any[]) => {
    const todosFechados = frescos.length > 0 && frescos.every(fechado);
    if (todosFechados === !!demanda.concluida) { onAtualizado?.(); return; }
    const agora = new Date().toISOString();
    const { error } = await supabase.from('engenharia_desenvolvimento').update({ concluida: todosFechados, atualizado_em: agora }).eq('id', demanda.id);
    if (error) {
      alert(`O item foi atualizado, mas o pedido não foi marcado como ${todosFechados ? 'concluído' : 'reaberto'}: ${error.message}\n\nA pendência da OP só fecha com o pedido concluído — tente de novo.`);
      return;
    }
    logChange({ module: 'engenharia', entityType: 'engenharia_desenvolvimento', entityId: demanda.id, changeType: 'UPDATE',
      oldRow: { concluida: !todosFechados }, newRow: { concluida: todosFechados }, user: currentUser });
    const entregues = frescos.filter(i => i.situacao === 'entregue').length;
    const cancelados = frescos.filter(i => i.situacao === 'cancelado').length;
    const resumo = `${entregues} item(ns) entregue(s)${cancelados ? ` e ${cancelados} cancelado(s)` : ''}`;
    const ids = ((demanda.opl_ids || []).length ? demanda.opl_ids : [demanda.opl_id]).filter(Boolean);
    const { data: ops, error: erroOps } = ids.length ? await supabase.from('oples').select('id,opl,status_geral').in('id', ids) : { data: [], error: null };
    if (!erroOps && (ops || []).length) {
      await supabase.from('logs_movimentacao_opl').insert(ops.map((o: any) => ({
        opl_id: o.id, numero_opl: o.opl, setor: 'Engenharia',
        evento: todosFechados ? `Engenharia concluiu o pedido de desenvolvimento: ${resumo}. O PCP já pode liberar a pendência.` : 'Pedido de desenvolvimento reaberto pela Engenharia.',
        status_anterior: o.status_geral, status_novo: o.status_geral,
        usuario_nome: currentUser?.nome, data_hora: agora,
      })));
    }
    if (todosFechados) notificarEvento('engenharia_entrega_desenvolvimento', `*Engenharia entregou o desenvolvimento* — OP ${demanda.numero_opl}\n${resumo}.\nPor: ${currentUser?.nome}`);
    onAtualizado?.();
  };

  const atualizarItem = async (item: any, patch: any) => {
    if (trava.current) return;
    trava.current = true;
    setEmAcao(item.id);
    try {
      const { error } = await supabase.from('engenharia_desenvolvimento_itens').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', item.id);
      if (error) { alert(`Não foi possível atualizar o item: ${error.message}`); return; }
      logChange({ module: 'engenharia', entityType: 'engenharia_desenvolvimento_itens', entityId: item.id, changeType: 'UPDATE',
        oldRow: { situacao: item.situacao }, newRow: patch, user: currentUser });
      // o pedido fecha pela lista ATUAL do banco (outra pessoa pode ter mexido em outro item ao mesmo tempo), não pela que está na tela
      const frescos = await carregar();
      if (!frescos) { alert('O item foi atualizado, mas a lista não recarregou. Atualize a tela antes de seguir.'); return; }
      await sincronizarPedido(frescos);
    } finally {
      trava.current = false;
      setEmAcao(null);
    }
  };

  const iniciar = (i: any) => atualizarItem(i, { situacao: 'em_andamento' });
  const entregar = async (i: any) => {
    if (i.item_vendido_id && estrutura && estrutura.get(String(i.item_vendido_id)) === false) {
      if (!await confirmar(`A estrutura de "${i.item_vendido_nome}" no ${demanda.veiculo_nome || 'veículo'} ainda não foi cadastrada.\n\nSem ela, a próxima OP igual vai precisar de desenvolvimento de novo. Entregar mesmo assim?`)) return;
    }
    atualizarItem(i, { situacao: 'entregue', entregue_em: new Date().toISOString(), entregue_por_nome: currentUser?.nome || null });
  };
  const cancelar = async (i: any) => {
    const motivo = await pedirTexto('Motivo do cancelamento deste item (fica registrado):');
    if (!motivo || !String(motivo).trim()) return;
    atualizarItem(i, { situacao: 'cancelado', observacoes: String(motivo).trim() });
  };
  const reabrir = async (i: any) => {
    if (!await confirmar(`Reabrir o item "${i.descricao}"? O pedido volta a segurar a OP até ser entregue de novo.`)) return;
    atualizarItem(i, { situacao: 'em_andamento', entregue_em: null, entregue_por_nome: null });
  };
  const abrirEstrutura = (i: any) => window.dispatchEvent(new CustomEvent('engenharia:abrir-estruturas', { detail: { item_id: i.item_vendido_id, veiculo_id: demanda.veiculo_id } }));

  const total = (itens || []).length;
  const entregues = (itens || []).filter(i => i.situacao === 'entregue').length;
  const cancelados = (itens || []).filter(i => i.situacao === 'cancelado').length;

  return (
    <div className="acn-pdp">
      <div className="acn-pdp-cab">
        <Selo familia="info" ponto={false}>Pedido do PCP</Selo>
        {demanda.veiculo_nome && <span className="acn-ajuda">Veículo: {demanda.veiculo_nome}</span>}
        {(demanda.opl_ids || []).length > 1 && <span className="acn-ajuda">Vale para {demanda.opl_ids.length} OPs do lote</span>}
        {demanda.opl_id && <Botao pequeno icone={mdiEyeOutline} onClick={abrirOp}>Ver OP</Botao>}
      </div>
      {erro && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
          Não foi possível ler os itens do pedido ({erro}). Isso não quer dizer que ele não tenha itens.
        </Faixa>
      )}
      {itens === null && !erro && <div className="acn-ajuda">Carregando os itens…</div>}
      {itens && total === 0 && <div className="acn-ajuda">Este pedido não tem itens.</div>}
      {itens && total > 0 && (
        <table className="acn-tabela acn-densa">
          <thead><tr>
            <th>Tipo</th><th>O que desenvolver</th><th>Item vendido de origem</th><th>Estrutura no veículo</th><th>Situação</th><th>Ações</th>
          </tr></thead>
          <tbody>
            {itens.map(i => {
              const sit = SITUACAO[i.situacao] || { rotulo: i.situacao, familia: 'neutro' };
              const sabe = i.item_vendido_id && estrutura && estrutura.has(String(i.item_vendido_id));
              const tem = sabe && estrutura!.get(String(i.item_vendido_id));
              return (
                <tr key={i.id}>
                  <td>{rotuloDoTipo(i.tipo)}</td>
                  <td className="acn-pdp-desc">
                    {i.descricao}
                    {i.situacao === 'cancelado' && i.observacoes && <div className="acn-ajuda">Cancelado: {i.observacoes}</div>}
                    {i.situacao === 'entregue' && i.entregue_por_nome && <div className="acn-ajuda">Entregue por {i.entregue_por_nome}</div>}
                  </td>
                  <td>{i.item_vendido_nome || '—'}</td>
                  <td>
                    {sabe
                      ? (tem ? <Selo familia="ok" ponto={false}>cadastrada</Selo> : <Selo familia="erro" ponto={false}>sem estrutura</Selo>)
                      : '—'}
                    {i.item_vendido_id && demanda.veiculo_id && (
                      <div><Botao variante="discreto" pequeno icone={mdiPuzzleOutline} onClick={() => abrirEstrutura(i)}>Cadastrar estrutura</Botao></div>
                    )}
                  </td>
                  <td><Selo familia={sit.familia} ponto={false}>{sit.rotulo}</Selo></td>
                  <td>
                    <div className="acn-acoes-linha quebra">
                      {i.situacao === 'pendente' && <Botao variante="primario" pequeno disabled={emAcao === i.id} onClick={() => iniciar(i)}>Iniciar</Botao>}
                      {i.situacao === 'em_andamento' && <Botao variante="primario" pequeno disabled={emAcao === i.id} onClick={() => entregar(i)}>Entregar</Botao>}
                      {(i.situacao === 'pendente' || i.situacao === 'em_andamento') && <Botao variante="discreto" pequeno disabled={emAcao === i.id} onClick={() => cancelar(i)}>Cancelar</Botao>}
                      {fechado(i) && <Botao variante="discreto" pequeno disabled={emAcao === i.id} onClick={() => reabrir(i)}>Reabrir</Botao>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {itens && total > 0 && (
        <div className="acn-ajuda">{entregues} de {total} item(ns) entregue(s){cancelados ? ` · ${cancelados} cancelado(s)` : ''}</div>
      )}
      {opAberta && <OplDetalheModal opl={opAberta} onClose={() => setOpAberta(null)} currentUser={currentUser} />}
    </div>
  );
}
