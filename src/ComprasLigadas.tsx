// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS LIGADAS A UMA OS OU A UMA OP — pedido do usuário em 26/10/2026:
// "o SAC precisa gerar uma ordem de compra de uma OS ou OP gerada no SAC e vincular essa compra à OS".
//
// Não existe tabela nova: a requisição é a mesma de todo o sistema (SolicitacaoCompra.tsx → criarRequisicaoCompra) e o elo é o vínculo que a compra já tem
// (`vinculo_tipo` 'os' = OS do SAC, 'op' = OP; `vinculo_id`, `vinculo_descricao`). O Compras já mostra esse vínculo e abre a OS/OP por ele (VinculoPicker.abrirVinculo).
// Aqui só se desenha o quadro "Compras desta OS/OP": o que já foi pedido (com o andamento) e o botão que abre a mesma janela de solicitação já ligada ao registro.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo, Faixa } from './Interface';
import { ModalSolicitarCompra } from './SolicitacaoCompra';
import { ehAdminOuGerente } from './utils/permissoes';
import Icone from './Icone';
import { mdiCartOutline, mdiClose } from '@mdi/js';

const COLUNAS = 'id,numero_pedido,descricao_material,status_compra,fornecedor,prazo_entrega,comprador_nome,valor_compra,data_criacao,criado_por_nome,vinculo_tipo,vinculo_id';
const diaBR = (d: any) => !d ? '' : /^\d{4}-\d{2}-\d{2}/.test(String(d)) ? String(d).slice(0, 10).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');
const reais = (v: any) => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const usuarioAtual = () => { try { return JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch { return {}; } };

// o status da compra vira cor: o que ainda anda é neutro, o que chegou é verde, o que foi descartado é vermelho
const familiaDoStatus = (s: any) => {
  const t = String(s || '').toLowerCase();
  if (/recebid|entregue|conclu/.test(t)) return 'ok';
  if (/descart|cancel|recus|reprov/.test(t)) return 'erro';
  return 'neutro';
};

/**
 * Lê as compras ligadas ao registro. Leitura recusada devolve `erro` — nunca "nenhuma compra": quem pede de novo por achar que a lista está vazia abriria compra em dobro.
 * OP: além do vínculo pelo id, entram as compras que só têm o número da OP em texto (como o Dossiê da OP já faz em OpVinculos.ts).
 */
export async function lerComprasLigadas({ vinculoTipo, vinculoId, opl = null }: any) {
  if (!vinculoId) return { lista: [], erro: '' };
  const { data, error } = await supabase.from('pcp_pedidos_compra').select(COLUNAS)
    .eq('vinculo_tipo', vinculoTipo).eq('vinculo_id', String(vinculoId)).order('data_criacao', { ascending: false });
  if (error) return { lista: [], erro: error.message };
  let lista = data || [];
  if (vinculoTipo === 'op' && opl) {
    const { data: texto, error: erroTexto } = await supabase.from('pcp_pedidos_compra').select(COLUNAS).is('vinculo_id', null).eq('opl', opl);
    if (erroTexto) return { lista: [], erro: erroTexto.message };
    lista = [...lista, ...(texto || [])];
  }
  return { lista, erro: '' };
}

/** O quadro: lista das compras do registro + botão "Solicitar compra". `podePedir` esconde só o botão, a lista fica sempre. */
export function QuadroComprasLigadas({ vinculoTipo, vinculoId, descricao, titulo = 'Compras', origemSetor = 'SAC', opl = null, currentUser = null, podePedir = true, ajuda = '', mostrarLista = true }: any) {
  const [estado, setEstado] = useState<any>({ carregando: true, lista: [], erro: '' });
  const [tick, setTick] = useState(0);
  const [abrindo, setAbrindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const usuario = currentUser || usuarioAtual();

  useEffect(() => {
    let vivo = true;
    if (!mostrarLista) { setEstado({ carregando: false, lista: [], erro: '' }); return () => { vivo = false; }; }   // só o botão (a lista já aparece em outro lugar da tela)
    setEstado((e: any) => ({ ...e, carregando: true }));
    lerComprasLigadas({ vinculoTipo, vinculoId, opl }).then(r => { if (vivo) setEstado({ carregando: false, ...r }); });
    return () => { vivo = false; };
  }, [vinculoTipo, vinculoId, opl, tick]);

  const rotulo = vinculoTipo === 'os' ? 'OS' : 'OP';
  const aoCriar = async (r: any) => { setAviso(`Requisição ${r.numero_pedido} enviada ao Compras, ligada à ${rotulo} ${String(descricao || '').split(' — ')[0]}.`); setTick(t => t + 1); };

  return (
    <div className="acn-quadro">
      <div className="acn-quadro-titulo acn-cl-titulo">
        <span>{titulo}{mostrarLista && !estado.carregando && !estado.erro ? ` (${estado.lista.length})` : ''}</span>
        {podePedir && <Botao pequeno variante="secundario" icone={mdiCartOutline} onClick={() => { setAviso(''); setAbrindo(true); }}>Solicitar compra</Botao>}
      </div>
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
      {aviso && <Faixa tom="ok">{aviso}</Faixa>}
      {estado.erro && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={() => setTick(t => t + 1)}>Tentar de novo</Botao>}>
          Não foi possível ler as compras desta {rotulo} ({estado.erro}). Não peça de novo antes de conferir: a compra pode já existir.
        </Faixa>
      )}
      {mostrarLista && !estado.erro && !estado.carregando && estado.lista.length === 0 && <div className="acn-fraco">Nenhuma compra pedida para esta {rotulo} ainda.</div>}
      {estado.lista.length > 0 && (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-compacta">
            <thead><tr><th>Pedido</th><th>O que foi pedido</th><th>Andamento</th><th>Prazo</th><th className="acn-dir">Valor</th></tr></thead>
            <tbody>{estado.lista.map((c: any) => (
              <tr key={c.id}>
                <td className="acn-forte">{c.numero_pedido || '—'}<div className="acn-fraco">{diaBR(c.data_criacao)}{c.criado_por_nome ? ' · ' + c.criado_por_nome : ''}</div></td>
                <td className="acn-texto-longo">{String(c.descricao_material || '').split('\n')[0] || '—'}</td>
                <td><Selo familia={familiaDoStatus(c.status_compra)} ponto={false}>{c.status_compra || 'Pendente'}</Selo>{c.fornecedor && <div className="acn-fraco">{c.fornecedor}</div>}</td>
                <td>{diaBR(c.prazo_entrega) || '—'}</td>
                <td className="acn-dir acn-num">{reais(c.valor_compra) || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {abrindo && (
        <ModalSolicitarCompra currentUser={usuario} titulo={`Solicitar compra — ${String(descricao || '').split(' — ')[0]}`}
          subtitulo={`O pedido vai para o Compras ligado a esta ${rotulo}: ele aparece aqui com o andamento.`}
          valorInicial={{ titulo: `Compra para a ${rotulo} ${descricao || ''}`.trim(), vinculo: { tipo: vinculoTipo, id: String(vinculoId), descricao: descricao || '' } }}
          origemSetor={origemSetor} opl={vinculoTipo === 'op' ? opl : null} contexto={`${origemSetor} — ${rotulo} ${descricao || ''}`}
          onClose={() => setAbrindo(false)} onCriada={aoCriar} />
      )}
    </div>
  );
}

/** Janela "Compras da OS" — aberta pelo menu ⋯ da OS no SAC. */
export function ModalComprasDaOS({ os, currentUser, onClose }: any) {
  const encerrada = ['Entregue', 'Cancelada'].includes(os?.status);
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cl-jan" role="dialog" aria-label={'Compras da OS ' + os?.numero_os}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCartOutline} size={18} /> Compras da OS {os?.numero_os}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo">
          <QuadroComprasLigadas vinculoTipo="os" vinculoId={os?.id} descricao={`${os?.numero_os || ''} — ${os?.cliente_nome || os?.equipamento_nome || ''}`.replace(/ — $/, '')}
            titulo="Compras desta OS" origemSetor="SAC" currentUser={currentUser} podePedir={!encerrada}
            ajuda={encerrada ? 'A OS está encerrada: dá para acompanhar as compras, mas não pedir novas.' : ''} />
        </div>
      </div>
    </div>
  );
}

/** Quem pode pedir compra de uma OP pelo SAC: o próprio SAC e quem gere (Admin/gerente). Ver a lista é de todos. */
export const podePedirCompraDaOp = (u: any) => ehAdminOuGerente(u) || String(u?.perfil || '').trim() === 'SAC';
