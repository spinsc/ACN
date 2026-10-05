// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { imprimirOrdemCompra } from './ComprasTab';
import { ETAPAS_COMPRA, COR_ETAPA_COMPRA } from './ComprasFluxo';
import { labelHierarquico, ModalLancarMedicao,
  ModalEditarLancamento, ModalEditarPedidoCompra, podeEditarLancamento } from './CentroCustoShared';
import { CentrosCustoManager } from './CentroCustoFicha';
import { ModalComprasSemCentro } from './CentroCustoUso';
import { PainelCentroCusto, carregarOrcamentoDoAno, normalizarMovimentos, avaliarAlertasDeConsumo } from './CentroCustoPainel';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import ConciliacaoBancaria from './ConciliacaoBancaria';
import FinanceiroKanban from './FinanceiroKanban';
import { hojeISO } from './Interface';

// Abas do Financeiro: centros de custo (o que já existia), conciliação bancária e o kanban de tarefas
function AbasFinanceiro({ aba, setAba }: any) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 0, marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '2px solid #0f172a', maxWidth: 680 }}>
      {[['centros', '🏷️ Centros de custo'], ['conciliacao', '🏦 Conciliação bancária'], ['kanban', '📋 Tarefas']].map(([id, rotulo]) => (
        <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
          style={{ flex: 1, padding: '8px', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
            background: aba === id ? '#0f172a' : '#fff', color: aba === id ? '#fff' : '#0f172a' }}>
          {rotulo}
        </button>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// new Date('2026-09-25') é lido como meia-noite UTC, que no Brasil vira 21h do
// dia ANTERIOR — todo lançamento aparecia um dia mais cedo do que foi gravado.
// Fatiar e fixar meio-dia tira o fuso do caminho (corrigido em 24/09/2026).
const fmtDt = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

// As cores das etapas da compra vêm de ComprasFluxo (COR_ETAPA_COMPRA), a mesma
// da tela de Compras. Aqui havia uma cópia própria que ficou com a chave
// 'Concluído' — nome antigo, trocado por 'Recebido' em 22/09/2026 — e sem a cor
// de 'Recebido': as compras recebidas apareciam em cinza (corrigido em
// 29/09/2026, Etapa 5.2 do PLANO_UX_FLUXO_TRABALHO.md).

// ─── Modal CRUD de Centros de Custo ──────────────────────────────────────────
function ModalCentros({ onClose, onAtualizar, currentUser }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) { onAtualizar(); onClose(); } }}>
      {/* 1080, não 560: a lista de centros tem código, nome, hierarquia e ações
          na mesma linha, e em 560 tudo se amassava (28/09/2026). */}
      <div style={{ background: '#fff', borderRadius: 10, width: 1080, maxWidth: '95vw',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#0f766e', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🏷️ Gerenciar Centros de Custo</div>
          <button onClick={() => { onAtualizar(); onClose(); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <CentrosCustoManager embutido currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}

// ─── Modal: compras de um centro de custo ─────────────────────────────────────
/** Duas linhas e reticências: o texto inteiro fica no rótulo do mouse. */
const celaTexto: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', maxWidth: 250, lineHeight: 1.35,
};

function ModalComprasCentro({ centro, compras, todasDespesas, onClose, currentUser, onAtualizar }: any) {
  const total = compras.reduce((s: number, p: any) => s + (Number(p.despesaAvulsa ? p.valor : p.valor_compra) || 0), 0);
  const [modalMedicao, setModalMedicao] = useState<any>(null); // contrato "Parcelado" selecionado
  const [modalEditar, setModalEditar] = useState<any>(null);   // lançamento sendo corrigido
  const [modalPedido, setModalPedido] = useState<any>(null);   // pedido de compra sendo corrigido
  // soma de medições por contrato — feito no cliente. Antes somava só as medições que estavam nesta lista, e a
  // lista respeita o filtro de mês: um contrato com parcelas pagas em outros meses aparecia com o "pago" menor
  // (e o aviso de "total abaixo do já pago" ao editar também). Agora soma TODAS as medições do contrato, em
  // qualquer mês (corrigido em 29/09/2026, junto com o "pagas x de N", que precisa da contagem certa).
  const pagoPorContrato: Record<string, number> = {};
  const medicoesPorContrato: Record<string, number> = {};   // quantas parcelas já foram lançadas (29/09/2026)
  (todasDespesas || compras.filter((p: any) => p.despesaAvulsa)).forEach((p: any) => {
    if (p.despesa_pai_id) {
      pagoPorContrato[p.despesa_pai_id] = (pagoPorContrato[p.despesa_pai_id] || 0) + (Number(p.valor) || 0);
      medicoesPorContrato[p.despesa_pai_id] = (medicoesPorContrato[p.despesa_pai_id] || 0) + 1;
    }
  });
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2100,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* 1180, não 700: são 8 colunas e em 700 a tabela rolava na horizontal
          (28/09/2026). */}
      <div style={{ background: '#fff', borderRadius: 10, width: 1180, maxWidth: '96vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#1e3a5f', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🛒 Compras — {centro.nome || centro}</div>
            <div style={{ fontSize: 9, opacity: .8 }}>{compras.length} lançamento(s) · Total: {fmtR(total)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {compras.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 11 }}>
              Nenhuma compra neste centro de custo.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                  {['Nº Pedido', 'Descrição', 'Fornecedor', 'Status', 'Ordem de Compra', 'Valor', 'Data', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compras.map((p: any, i: number) => p.despesaAvulsa ? (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, color: '#1e3a5f' }}>—</td>
                    {/* A DESCRIÇÃO NÃO PODE ESTICAR A LINHA (28/09/2026)
                        Uma despesa com texto longo quebrava uma palavra por
                        linha, a linha ficava mais alta que o modal inteiro e o
                        cabeçalho parecia travado no topo. Agora mostra duas
                        linhas e o resto vem no rótulo, passando o mouse. */}
                    <td style={{ padding: '5px 8px', fontSize: 10 }}
                        title={[p.despesa_pai_id ? 'Medição —' : '', p.descricao || 'Despesa avulsa'].filter(Boolean).join(' ')}>
                      <div style={celaTexto}>
                        {p.despesa_pai_id ? <span style={{ color:'#94a3b8' }}>↳ medição — </span> : null}
                        {p.descricao || 'Despesa avulsa'}
                      </div>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>{p.criado_por_nome || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>
                      {p.parcelado ? (
                        (() => {
                          const totalNeg = Number(p.valor_total_negociado) || 0;
                          const pago = pagoPorContrato[p.id] || 0;
                          const pct = totalNeg > 0 ? Math.min(100, Math.round(pago / totalNeg * 100)) : 0;
                          return (
                            <div style={{ minWidth:130 }}>
                              <div style={{ fontSize:9, fontWeight:700, color: pago > totalNeg ? '#dc2626' : '#0f766e', marginBottom:2 }}>
                                🧾 Pago {fmtR(pago)} de {fmtR(totalNeg)} ({pct}%)
                              </div>
                              <div style={{ background:'#e2e8f0', borderRadius:4, height:5, overflow:'hidden' }}>
                                <div style={{ width:`${pct}%`, background: pago > totalNeg ? '#dc2626' : '#0f766e', height:'100%' }} />
                              </div>
                              {/* "pagas x de N" — só quando o número de parcelas foi combinado (29/09/2026) */}
                              {(Number(p.num_parcelas) > 0 || medicoesPorContrato[p.id] > 0) && (
                                <div style={{ fontSize:9, color: Number(p.num_parcelas) > 0 && medicoesPorContrato[p.id] > Number(p.num_parcelas) ? '#dc2626' : '#64748b', marginTop:2 }}>
                                  {Number(p.num_parcelas) > 0
                                    ? `${medicoesPorContrato[p.id] || 0} de ${p.num_parcelas} parcelas`
                                    : `${medicoesPorContrato[p.id]} medição(ões)`}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : p.despesa_pai_id ? (
                        <span style={{ background:'#f1f5f9', color:'#64748b',
                          padding:'2px 7px', borderRadius:10, fontSize:9, fontWeight:700 }}>
                          Medição
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c722', color: '#b45309',
                          padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                          💰 Despesa avulsa
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }}>
                      <span style={{ color: '#9ca3af' }}>—</span>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#15803d', textAlign: 'right', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                      {p.parcelado ? '—' : fmtR(Number(p.valor) || 0)}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>
                      {fmtDt(p.data)}
                    </td>
                    <td style={{ padding: '5px 8px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {p.parcelado && (
                          <button onClick={() => setModalMedicao(p)}
                            style={{ background:'#0f766e', color:'#fff', border:'none', borderRadius:4,
                              padding:'3px 8px', fontSize:9, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                            + Medição
                          </button>
                        )}
                        {/* corrigir valor, descrição, data ou centro errado —
                            só Admin e gerente, e tudo vai para a auditoria */}
                        {podeEditarLancamento(currentUser) && (
                          <button onClick={() => setModalEditar(p)} title="Editar ou excluir este lançamento"
                            style={{ background:'#fff', color:'#334155', border:'1px solid #cbd5e1', borderRadius:4,
                              padding:'3px 8px', fontSize:9, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                            ✏️ Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, color: '#1e3a5f' }}>{p.numero_pedido || '—'}</td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }} title={p.descricao_material || ''}>
                      <div style={celaTexto}>{p.descricao_material || '—'}</div>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>{p.fornecedor || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <span style={{ background: (COR_ETAPA_COMPRA[p.status_compra]||'#6b7280') + '22',
                        color: COR_ETAPA_COMPRA[p.status_compra] || '#6b7280',
                        padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                        {p.status_compra || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }}>
                      {p.numero_oc ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#7c3aed', fontWeight: 700, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>✓ {p.numero_oc}</span>
                          <button onClick={() => imprimirOrdemCompra(p)} title="Imprimir Ordem de Compra"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>🖨️</button>
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>— aguardando aprovação</span>
                      )}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#15803d', textAlign: 'right', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                      {p.valor_compra ? fmtR(Number(p.valor_compra)) : '—'}
                    </td>
                    <td style={{ padding: '5px 8px', fontSize: 10, color: '#6b7280' }}>
                      {fmtDt(p.data_criacao)}
                    </td>
                    {/* O pedido de compra também precisa de ação: é nele que
                        aparece o erro de centro errado ou valor diferente do
                        pago, e até 28/09/2026 esta célula ficava vazia. */}
                    <td style={{ padding: '5px 8px' }}>
                      {podeEditarLancamento(currentUser) && (
                        <button onClick={() => setModalPedido(p)} title="Corrigir centro, valor, descrição ou data"
                          style={{ background:'#fff', color:'#334155', border:'1px solid #cbd5e1', borderRadius:4,
                            padding:'3px 8px', fontSize:9, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                          ✏️ Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* TOTAL LEGÍVEL (28/09/2026)
                  A faixa era azul-escura com a cor do texto vinda do `tr`. Só
                  que `.acn-main table td` fixa a cor do td em cinza-escuro, e
                  o td ganha do tr — texto escuro sobre fundo escuro. O valor
                  só aparecia ao passar o mouse, quando o fundo da linha muda.
                  Agora é faixa clara com texto escuro, e a cor vai em cada td. */}
              <tfoot>
                <tr style={{ background: '#f1f5f9' }}>
                  <td colSpan={5} style={{ padding: '8px', fontWeight: 700, fontSize: 11, textAlign: 'right',
                    color: '#475569', borderTop: '2px solid #cbd5e1' }}>TOTAL</td>
                  <td style={{ padding: '8px', fontWeight: 800, fontSize: 14, textAlign: 'right',
                    color: '#0f172a', borderTop: '2px solid #cbd5e1',
                    fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(total)}</td>
                  <td style={{ borderTop: '2px solid #cbd5e1' }} />
                  <td style={{ borderTop: '2px solid #cbd5e1' }} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
      {modalMedicao && (
        <ModalLancarMedicao contrato={modalMedicao} currentUser={currentUser}
          onClose={() => setModalMedicao(null)}
          onSaved={() => { setModalMedicao(null); onAtualizar?.(); onClose(); }} />
      )}
      {modalEditar && (
        <ModalEditarLancamento lancamento={modalEditar} currentUser={currentUser}
          jaPago={pagoPorContrato[modalEditar.id] || 0} medicoes={medicoesPorContrato[modalEditar.id] || 0}
          onClose={() => setModalEditar(null)}
          // fecha a lista junto: o valor ou o centro podem ter mudado, e a
          // lista aberta mostraria número velho até alguém reabrir
          onSalvo={() => { setModalEditar(null); onAtualizar?.(); onClose(); }} />
      )}
      {modalPedido && (
        <ModalEditarPedidoCompra pedido={modalPedido} currentUser={currentUser}
          onClose={() => setModalPedido(null)}
          onSalvo={() => { setModalPedido(null); onAtualizar?.(); onClose(); }} />
      )}
    </div>
  );
}

// ─── Faturamento de Compras (Fase 3 — Conferência Técnica) ───────────────────
const STATUS_FAT_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  aguardando_recebimento: { label: '🔒 Aguardando recebimento', cor: '#78716c', bg: '#f5f5f4' },
  liberado:                { label: '🔓 Liberado p/ pagamento',  cor: '#0369a1', bg: '#f0f9ff' },
  pago:                    { label: '✅ Pago',                   cor: '#15803d', bg: '#f0fdf4' },
};

async function uploadNfFornecedor(file: File): Promise<{ url: string; error?: string }> {
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `pcp-nf-fornecedor/${Date.now()}_${nomeLimpo}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return { url: '', error: error?.message || 'Falha desconhecida ao enviar.' };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  return { url: pub?.publicUrl || '' };
}

function LinhaFaturamento({ f, onAtualizar, currentUser, naoLido, marcarLidoLocal }: any) {
  const [nfNumero, setNfNumero] = useState(f.nf_fornecedor_numero || '');
  const [arquivo, setArquivo]   = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const marcarComoLido = useMarkAsRead('pcp_pedidos_faturamento', f.id, currentUser);
  // Não há tela de detalhe pra este registro (tudo é feito inline na linha),
  // então "visto" aqui significa "o usuário interagiu com a linha" — clicar em
  // qualquer lugar dela (exceto o próprio clique no botão/campo, que já conta
  // como interação também) marca como lido, sem precisar de um modal pra fechar.
  const marcarVisto = () => { if (naoLido) { marcarComoLido(); marcarLidoLocal?.(f.id); } };

  const marcarPago = async () => {
    if (!nfNumero.trim()) { alert('Informe o número da NF do fornecedor.'); return; }
    // Trava real, não só o botão escondido na tela — sem isso dava pra marcar
    // como pago direto pela API sem o recebimento físico ter sido confirmado.
    if (!f.recebimento_confirmado) { alert('Recebimento ainda não confirmado na Logística. Não é possível marcar como pago.'); return; }
    setSalvando(true);
    let nfUrl = f.nf_fornecedor_url || null;
    if (arquivo) {
      const res = await uploadNfFornecedor(arquivo);
      if (res.error) { alert('Erro ao enviar NF: ' + res.error); setSalvando(false); return; }
      nfUrl = res.url;
    }
    const novoRow = {
      nf_fornecedor_numero: nfNumero.trim(),
      nf_fornecedor_url: nfUrl,
      status_faturamento: 'pago',
      data_pagamento: hojeISO(),
    };
    const { error } = await supabase.from('pcp_pedidos_faturamento').update(novoRow).eq('id', f.id);
    setSalvando(false);
    if (error) { alert('Erro: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'pcp_pedidos_faturamento', entityId: f.id, changeType: 'UPDATE',
      oldRow: f, newRow: { ...f, ...novoRow }, user: currentUser });
    onAtualizar();
  };

  const st = STATUS_FAT_LABEL[f.status_faturamento] || STATUS_FAT_LABEL.aguardando_recebimento;

  return (
    <tr onClick={marcarVisto} style={{ borderBottom: '1px solid #f1f5f9',
      background: naoLido ? '#fffdf0' : 'transparent',
      boxShadow: naoLido ? 'inset 3px 0 0 #eab308' : 'none' }}>
      <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#7c3aed', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{f.numero_oc || '—'}</td>
      <td style={{ padding: '6px 8px', fontSize: 10 }}>{f.numero_pedido || '—'}</td>
      <td style={{ padding: '6px 8px', fontSize: 10, color: '#6b7280' }}>{f.fornecedor || '—'}</td>
      <td style={{ padding: '6px 8px', fontSize: 10, color: '#6b7280' }}>{f.centro_custo || '—'}</td>
      <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, textAlign: 'right', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", color: '#15803d' }}>{fmtR(f.valor)}</td>
      <td style={{ padding: '6px 8px' }}>
        <span style={{ background: st.bg, color: st.cor, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{st.label}</span>
      </td>
      <td style={{ padding: '6px 8px', minWidth: 220 }}>
        {!f.recebimento_confirmado ? (
          <span style={{ fontSize: 9, color: '#9ca3af' }}>—</span>
        ) : f.status_faturamento === 'pago' ? (
          <span style={{ fontSize: 9, color: '#15803d' }}>
            NF {f.nf_fornecedor_numero} · pago em {fmtDt(f.data_pagamento)}
            {f.nf_fornecedor_url && <> · <a href={f.nf_fornecedor_url} target="_blank" rel="noreferrer">ver</a></>}
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={nfNumero} onChange={e => setNfNumero(e.target.value)} placeholder="Nº NF fornecedor"
              style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 9, width: 100 }} />
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setArquivo(e.target.files?.[0] || null)}
              style={{ fontSize: 9, width: 90 }} />
            <button onClick={marcarPago} disabled={salvando}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
              {salvando ? '...' : '💰 Pago'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SecaoFaturamentoCompras({ faturamentos, onAtualizar, currentUser }: any) {
  const [filtro, setFiltro] = useState('');
  const { naoLidoSet, marcarLidoLocal } = useUnreadMap('pcp_pedidos_faturamento', faturamentos.map((f: any) => f.id), currentUser);
  const filtrados = filtro ? faturamentos.filter((f: any) => f.status_faturamento === filtro) : faturamentos;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>📑 Faturamento de Compras — NF do Fornecedor</div>
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os status</option>
          <option value="aguardando_recebimento">Aguardando recebimento</option>
          <option value="liberado">Liberado p/ pagamento</option>
          <option value="pago">Pago</option>
        </select>
      </div>
      {filtrados.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>Nenhum registro de faturamento.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                {['OC', 'Nº Pedido', 'Fornecedor', 'Centro de Custo', 'Valor', 'Status', 'Ação'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, textAlign: h === 'Valor' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f: any) => <LinhaFaturamento key={f.id} f={f} onAtualizar={onAtualizar} currentUser={currentUser}
                naoLido={naoLidoSet.has(String(f.id))} marcarLidoLocal={marcarLidoLocal} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanceiroTab({ currentUser }: { currentUser: any }) {
  const [centros,  setCentros]  = useState<any[]>([]);
  const [compras,  setCompras]  = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [faturamentos, setFaturamentos] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modalCentros, setModalCentros] = useState(false);
  const [modalCompras, setModalCompras] = useState<any>(null);
  const [abaFin, setAbaFin] = useState('centros');
  const [painelCentro, setPainelCentro] = useState<string | null>(null); // Etapa 15b: id do centro com o painel aberto
  const [semCentroAberto, setSemCentroAberto] = useState(false);            // Etapa 15c: tela "Compras sem centro"

  // Filtros
  const now = new Date();
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroStatus, setFiltroStatus] = useState('');

  const isAdmin = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: pData }, { data: fData }, { data: dData }] = await Promise.all([
      supabase.from('centros_custo').select('*').order('codigo'),
      supabase.from('pcp_pedidos_compra').select('*').order('data_criacao', { ascending: false }),
      supabase.from('pcp_pedidos_faturamento').select('*').order('criado_em', { ascending: false }),
      supabase.from('centro_custo_despesas').select('*').order('data', { ascending: false }),
    ]);
    setCentros(cData || []);
    setCompras(pData || []);
    setFaturamentos(fData || []);
    setDespesas(dData || []);
    setLoading(false);
    // Etapa 15b (05/10/2026): centro com responsável e orçamento no mês, a partir de 80% / 100% → menção, uma vez por faixa e mês.
    // Só avisa. Falha aqui não pode atrapalhar a tela: o aviso tenta de novo na próxima vez que o Financeiro abrir.
    try {
      const hoje = new Date();
      if ((cData || []).some((c: any) => c.ativo && c.responsavel_email)) {
        const orcLinhas = await carregarOrcamentoDoAno(hoje.getFullYear());
        const itens = normalizarMovimentos({ compras: pData || [], faturamentos: fData || [], despesas: dData || [] });
        await avaliarAlertasDeConsumo({ centros: cData || [], itens, orcLinhas, ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
      }
    } catch (e) { console.warn('Aviso de consumo do orçamento não avaliado:', e); }
  }, []);

  // a menção "orçamento do centro" abre o painel do centro (a caixa de menções guarda o destino no global e dispara este evento)
  useEffect(() => {
    const abrir = (d: any) => { if (d?.contexto === 'centro_custo' && d?.contextoId) setPainelCentro(String(d.contextoId)); };
    abrir((window as any).__acnDeepLink);
    const ouvir = (e: any) => abrir(e?.detail);
    window.addEventListener('acn:abrir-registro', ouvir);
    return () => window.removeEventListener('acn:abrir-registro', ouvir);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Filtra compras pelo período + status
  const comprasFiltradas = compras.filter(p => {
    const dt = p.data_criacao ? new Date(p.data_criacao) : null;
    const okMes = !filtroMes || !dt || String(dt.getMonth() + 1).padStart(2, '0') === filtroMes;
    const okAno = !filtroAno || !dt || String(dt.getFullYear()) === filtroAno;
    const okStatus = !filtroStatus || p.status_compra === filtroStatus;
    return okMes && okAno && okStatus;
  });

  // Despesas avulsas do mesmo período (data, não data_criacao)
  const despesasFiltradas = despesas.filter(d => {
    const dt = d.data ? new Date(d.data + 'T12:00:00') : null;
    const okMes = !filtroMes || !dt || String(dt.getMonth() + 1).padStart(2, '0') === filtroMes;
    const okAno = !filtroAno || !dt || String(dt.getFullYear()) === filtroAno;
    return okMes && okAno;
  });

  // Agrupa por centro de custo — prioriza a FK real (centro_custo_id, com
  // cadeia hierárquica no rótulo) sobre o texto livre legado. Soma tanto
  // pedidos de compra quanto despesas avulsas, e propaga cada valor também
  // para todos os ANCESTRAIS do centro (um pedido/despesa de um centro
  // filho conta também no total do pai, do avô, etc — até a raiz).
  const centrosPorId = Object.fromEntries(centros.map((c: any) => [c.id, c]));
  const ancestraisEDe = (centroId: string) => {
    const cadeia: any[] = [];
    let atual = centrosPorId[centroId];
    let guarda = 0;
    while (atual && guarda++ < 10) { cadeia.push(atual); atual = atual.parent_id ? centrosPorId[atual.parent_id] : null; }
    return cadeia;
  };
  const porCentro: Record<string, { nome: string; total: number; count: number; compras: any[]; centroId?: string }> = {};
  const addAoCentro = (centro: any, valor: number, item: any) => {
    const key = labelHierarquico(centro, centros) + ' — ' + centro.nome;
    if (!porCentro[key]) porCentro[key] = { nome: key, total: 0, count: 0, compras: [], centroId: centro.id };
    porCentro[key].total += valor;
    porCentro[key].count++;
    porCentro[key].compras.push(item);
  };
  for (const p of comprasFiltradas) {
    if (p.centro_custo_id && centrosPorId[p.centro_custo_id]) {
      ancestraisEDe(p.centro_custo_id).forEach(c => addAoCentro(c, Number(p.valor_compra) || 0, p));
    } else {
      const key = p.centro_custo || '(Sem Centro)';
      if (!porCentro[key]) porCentro[key] = { nome: key, total: 0, count: 0, compras: [] };
      porCentro[key].total += Number(p.valor_compra) || 0;
      porCentro[key].count++;
      porCentro[key].compras.push(p);
    }
  }
  for (const d of despesasFiltradas) {
    if (centrosPorId[d.centro_custo_id]) {
      ancestraisEDe(d.centro_custo_id).forEach(c => addAoCentro(c, Number(d.valor) || 0, { ...d, despesaAvulsa: true }));
    }
  }
  const listacentros = Object.entries(porCentro)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.total - a.total);

  // KPIs — total gasto soma compras + despesas avulsas do período
  const totalGastoCompras  = comprasFiltradas.reduce((s, p) => s + (Number(p.valor_compra) || 0), 0);
  const totalGastoDespesas = despesasFiltradas.reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const totalGasto    = totalGastoCompras + totalGastoDespesas;
  // 'Recebido' é o nome da última etapa da compra desde 22/09/2026 (era
  // 'Concluído'). Este contador tinha ficado com o nome antigo e por isso
  // mostrava zero enquanto havia compras recebidas (corrigido em 24/09/2026).
  // O rótulo na tela também passou a dizer "Recebidas" (29/09/2026): "Concluídas"
  // era o mesmo conceito com o nome antigo, e ainda se confundia com o
  // "Concluído" das tarefas do Kanban desta mesma aba, que é outra coisa.
  const totalRecebidas = comprasFiltradas.filter(p => p.status_compra === 'Recebido').length;
  const totalPendentes  = comprasFiltradas.filter(p => p.status_compra === 'Pendente').length;
  // Etapa 15c (05/10/2026): "sem centro" passa a ser o que a tela de correção lista — compra SEM VÍNCULO com centro (centro_custo_id), em qualquer período,
  // sem as descartadas. Antes contava o texto vazio, dentro do período, e misturava compras que têm centro com compras que não têm.
  const totalSemCentro  = compras.filter(p => !p.centro_custo_id && p.status_compra !== 'Descartada').length;

  // Bar chart simples (SVG)
  const maxBarVal = listacentros.length > 0 ? Math.max(...listacentros.map(c => c.total)) : 1;
  const BAR_COLORS = ['#0f766e', '#0369a1', '#7c3aed', '#b45309', '#16a34a', '#dc2626', '#0891b2', '#9333ea'];

  const anos = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  if (abaFin === 'conciliacao') {
    return (
      <div style={{ padding: 10, fontFamily: "'ACN Icones', 'IBM Plex Sans', system-ui, sans-serif" }}>
        <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />
        <ConciliacaoBancaria currentUser={currentUser} />
      </div>
    );
  }

  if (abaFin === 'kanban') {
    return (
      <div style={{ padding: 10, fontFamily: "'ACN Icones', 'IBM Plex Sans', system-ui, sans-serif" }}>
        <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />
        <FinanceiroKanban currentUser={currentUser} />
      </div>
    );
  }

  return (
    <div style={{ padding: 10, fontFamily: "'ACN Icones', 'IBM Plex Sans', system-ui, sans-serif" }}>
      <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />

      {/* Header */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '10px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>💰 Financeiro — Centro de Custos</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
            Controle de despesas de compras por centro de custo
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => setModalCentros(true)}
              style={{ padding: '6px 14px', background: '#0f766e', color: '#fff', border: 'none',
                borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
              🏷️ Gerenciar Centros
            </button>
          )}
          <button onClick={carregar}
            style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0',
              borderRadius: 5, cursor: 'pointer', fontSize: 9, color: '#64748b' }}>
            🔄
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '8px 12px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Filtrar por:</div>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os meses</option>
          {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
            <option key={m} value={m}>{new Date(2000, Number(m)-1, 1).toLocaleString('pt-BR',{month:'long'})}</option>
          ))}
        </select>
        <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os anos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todos os status</option>
          {/* lista vinda de ComprasFluxo em vez de copiada: era a cópia que
              ficava para trás quando uma etapa mudava de nome (24/09/2026) */}
          {ETAPAS_COMPRA.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>
          {comprasFiltradas.length} compra(s) no período
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 11 }}>Carregando...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total Gasto', value: fmtR(totalGasto), sub: 'no período filtrado', cor: '#0f766e', bg: '#f0fdf4', border: '#86efac', icon: '💰' },
              { label: 'Centros Ativos', value: String(centros.filter(c => c.ativo).length), sub: 'centros de custo', cor: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', icon: '🏷️' },
              { label: 'Recebidas', value: String(totalRecebidas), sub: 'compras recebidas', cor: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '✅' },
              { label: 'Pendentes', value: String(totalPendentes), sub: 'aguardando', cor: '#b45309', bg: '#fef9c3', border: '#fde68a', icon: '⏳' },
              { label: 'Sem Centro', value: String(totalSemCentro), sub: 'sem centro vinculado — clique para corrigir', cor: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '⚠️', onClick: () => setSemCentroAberto(true) },
            ].map((k: any) => (
              <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`,
                borderRadius: 8, padding: '10px 14px', cursor: k.onClick ? 'pointer' : undefined }}
                {...(k.onClick ? { onClick: k.onClick, role: 'button', tabIndex: 0, 'aria-label': `${k.label}: ${k.value}. ${k.sub}`, onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.onClick(); } } } : {})}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{k.icon}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: k.cor, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.value}</div>
                <div style={{ fontSize: 8, color: '#6b7280', marginTop: 1 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Gráfico de barras */}
          {listacentros.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                📊 Despesas por Centro de Custo
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {listacentros.slice(0, 10).map((c, i) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 120, fontSize: 10, fontWeight: 600, color: '#374151',
                      textAlign: 'right', wordBreak: 'break-word',
                      flexShrink: 0 }}>
                      {c.nome}
                    </div>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                      <div style={{
                        width: `${maxBarVal > 0 ? (c.total / maxBarVal * 100) : 0}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                        height: '100%', borderRadius: 4,
                        transition: 'width .4s',
                        minWidth: c.total > 0 ? 4 : 0,
                      }} />
                    </div>
                    <div style={{ width: 110, fontWeight: 700, fontSize: 10, color: '#15803d',
                      fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", textAlign: 'right', flexShrink: 0 }}>
                      {fmtR(c.total)}
                    </div>
                    <div style={{ width: 30, fontSize: 9, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
                      {c.count}pc
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de centros */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>
                🗂️ Consolidado por Centro de Custo
              </div>
              <div style={{ fontSize: 9, color: '#64748b' }}>
                Clique em um centro para ver o painel (orçado × realizado × comprometido); "Ver" abre as compras
              </div>
            </div>

            {listacentros.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                Nenhuma compra encontrada no período.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                      {['Centro de Custo', 'Qtd. Compras', 'Total Gasto', 'Recebidas', 'Pendentes', 'Ver'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', fontSize: 9, fontWeight: 700,
                          textAlign: h === 'Total Gasto' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listacentros.map((c, i) => {
                      const recebidas = c.compras.filter(p => p.status_compra === 'Recebido').length;
                      const pend  = c.compras.filter(p => p.status_compra === 'Pendente').length;
                      const semCC = c.key === '(Sem Centro)';
                      return (
                        <tr key={c.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa',
                          cursor: 'pointer', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                          title={c.centroId ? 'Abrir o painel deste centro' : undefined}
                          onClick={() => (c.centroId ? setPainelCentro(c.centroId) : setModalCompras({ centro: { nome: c.nome }, compras: c.compras }))}>
                          <td style={{ padding: '7px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {semCC && <span style={{ color: '#dc2626' }}>⚠️</span>}
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 11, color: semCC ? '#dc2626' : '#0f766e' }}>
                                  {c.nome}
                                </div>
                                {semCC && <div style={{ fontSize: 9, color: '#9ca3af' }}>Sem centro de custo alocado</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 11, color: '#475569', textAlign: 'center' }}>
                            {c.count}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#15803d',
                            textAlign: 'right', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                            {fmtR(c.total)}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            {recebidas > 0 && (
                              <span style={{ background: '#dcfce7', color: '#15803d',
                                padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                                {recebidas}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            {pend > 0 && (
                              <span style={{ background: '#fef9c3', color: '#92400e',
                                padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                                {pend}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); setModalCompras({ centro: { nome: c.nome }, compras: c.compras }); }}
                              style={{ background: '#0369a1', color: '#fff', border: 'none',
                                borderRadius: 4, padding: '3px 10px', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e293b', color: '#fff' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11 }}>TOTAL GERAL</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {comprasFiltradas.length + despesasFiltradas.length}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: 13, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                        {fmtR(totalGasto)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <SecaoFaturamentoCompras faturamentos={faturamentos} onAtualizar={carregar} currentUser={currentUser} />
        </>
      )}

      {/* Modais */}
      {modalCentros && (
        <ModalCentros
          currentUser={currentUser}
          onClose={() => setModalCentros(false)}
          onAtualizar={carregar}
        />
      )}

      {semCentroAberto && <ModalComprasSemCentro currentUser={currentUser} onClose={() => setSemCentroAberto(false)} onGravou={carregar} />}

      {painelCentro && (
        <PainelCentroCusto centroId={painelCentro} centros={centros} onClose={() => setPainelCentro(null)}
          onVerLancamentos={(centro: any) => {
            const chave = labelHierarquico(centro, centros) + ' — ' + centro.nome;
            const linha = porCentro[chave];
            setPainelCentro(null);
            setModalCompras({ centro: { nome: chave }, compras: linha?.compras || [] });
          }} />
      )}

      {modalCompras && (
        <ModalComprasCentro
          centro={modalCompras.centro}
          compras={modalCompras.compras}
          todasDespesas={despesas}
          currentUser={currentUser}
          onAtualizar={carregar}
          onClose={() => setModalCompras(null)}
        />
      )}
    </div>
  );
}
