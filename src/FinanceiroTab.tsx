// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { imprimirOrdemCompra } from './ComprasTab';
import { ETAPAS_COMPRA } from './ComprasFluxo';
import { labelHierarquico, ModalLancarMedicao,
  ModalEditarLancamento, ModalEditarPedidoCompra, podeEditarLancamento } from './CentroCustoShared';
import { CentrosCustoManager } from './CentroCustoFicha';
import { ModalComprasSemCentro, FAMILIA_COMPRA } from './CentroCustoUso';
import { PainelCentroCusto, carregarOrcamentoDoAno, normalizarMovimentos, avaliarAlertasDeConsumo } from './CentroCustoPainel';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import ConciliacaoBancaria from './ConciliacaoBancaria';
import FinanceiroKanban from './FinanceiroKanban';
import { hojeISO, diaBR, Abas, Botao, Faixa, Selo } from './Interface';
import Icone from './Icone';
import CustoPorOpTab from './CentroCustoRelatorios';
import ModalFechamentoMes from './CentroCustoFechamentoTela';
import { lerFechamentos, fechamentoVigente, nomeDoMes } from './CentroCustoFechamento';
import { baixarPlanilha } from './ExportarPlanilha';
import { mdiFileExcelOutline, mdiLockOutline, mdiTagOutline, mdiBankOutline, mdiFormatListChecks, mdiReceiptTextOutline,
  mdiCashMultiple, mdiRefresh, mdiChartBar, mdiFolderOutline, mdiFileDocumentOutline, mdiCartOutline, mdiPencilOutline,
  mdiPrinterOutline, mdiCurrencyUsd, mdiAlertOutline } from '@mdi/js';

// Abas do Financeiro: centros de custo (o que já existia), conciliação bancária, o kanban de tarefas e (Etapa 15e) o custo por OP.
// Etapa 12e9 (05/10/2026): o seletor escuro escrito à mão virou as abas do guia (`Abas`); os nomes e a ordem são os de antes.
function AbasFinanceiro({ aba, setAba }: any) {
  return (
    <Abas ativa={aba} onChange={setAba} itens={[
      { id: 'centros', rotulo: 'Centros de custo', icone: mdiTagOutline },
      { id: 'conciliacao', rotulo: 'Conciliação bancária', icone: mdiBankOutline },
      { id: 'kanban', rotulo: 'Tarefas', icone: mdiFormatListChecks },
      { id: 'custoop', rotulo: 'Custo por OP', icone: mdiReceiptTextOutline },
    ]} />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// new Date('2026-09-25') é lido como meia-noite UTC, que no Brasil vira 21h do
// dia ANTERIOR — todo lançamento aparecia um dia mais cedo do que foi gravado.
// Fatiar e fixar meio-dia tira o fuso do caminho (corrigido em 24/09/2026).
// Etapa 7.46 (05/10/2026): a mesma conta errava do outro lado para a data COM hora
// (`data_criacao` da compra é timestamptz): fatiar o texto UTC mostrava o dia seguinte para
// quem criou depois das 21h em Brasília (10 de 54 compras reais). `diaBR` separa os dois
// casos: data pura sai do texto, data com hora sai no dia de quem está olhando.
const fmtDt = (d: string) => diaBR(d);

// As cores das etapas da compra vêm de ComprasFluxo (COR_ETAPA_COMPRA), a mesma
// da tela de Compras. Aqui havia uma cópia própria que ficou com a chave
// 'Concluído' — nome antigo, trocado por 'Recebido' em 22/09/2026 — e sem a cor
// de 'Recebido': as compras recebidas apareciam em cinza (corrigido em
// 29/09/2026, Etapa 5.2 do PLANO_UX_FLUXO_TRABALHO.md).
// Etapa 12e9 (05/10/2026): a etapa agora é um `Selo` do guia, na família de `FAMILIA_COMPRA`
// (CentroCustoUso), a mesma da tela "Compras sem centro".

// ─── Modal CRUD de Centros de Custo ──────────────────────────────────────────
function ModalCentros({ onClose, onAtualizar, currentUser }: any) {
  const fechar = () => { onAtualizar(); onClose(); };
  return (
    <div className="modal-overlay acn-fin-sobre-centros" onClick={e => { if (e.target === e.currentTarget) fechar(); }}>
      {/* 1080, não 560: a lista de centros tem código, nome, hierarquia e ações
          na mesma linha, e em 560 tudo se amassava (28/09/2026). */}
      <div className="modal-box acn-modal-cadastro acn-fin-centros" role="dialog" aria-label="Gerenciar Centros de Custo">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTagOutline} size={16} /> Gerenciar Centros de Custo</span>
        </div>
        <div className="acn-modal-corpo">
          <CentrosCustoManager embutido currentUser={currentUser} />
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao onClick={fechar}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: compras de um centro de custo ─────────────────────────────────────
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
    <div className="modal-overlay acn-fin-sobre-compras" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* 1180, não 700: são 8 colunas e em 700 a tabela rolava na horizontal
          (28/09/2026). */}
      <div className="modal-box acn-modal-cadastro acn-fin-compras" role="dialog" aria-label="Compras do centro de custo">
        <div className="acn-modal-cab">
          <div>
            <span className="modal-title"><Icone path={mdiCartOutline} size={16} /> Compras — {centro.nome || centro}</span>
            <div className="acn-ajuda">{compras.length} lançamento(s) · Total: {fmtR(total)}</div>
          </div>
        </div>
        <div className="acn-modal-corpo">
          {compras.length === 0 ? (
            <div className="acn-empty">Nenhuma compra neste centro de custo.</div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead>
                  <tr>
                    {['Nº Pedido', 'Descrição', 'Fornecedor', 'Status', 'Ordem de Compra', 'Valor', 'Data', 'Ações'].map(h => (
                      <th key={h} className={h === 'Valor' ? 'acn-dir' : undefined}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compras.map((p: any) => p.despesaAvulsa ? (
                    <tr key={p.id}>
                      <td className="acn-forte">—</td>
                      {/* A DESCRIÇÃO NÃO PODE ESTICAR A LINHA (28/09/2026)
                          Uma despesa com texto longo quebrava uma palavra por
                          linha, a linha ficava mais alta que o modal inteiro e o
                          cabeçalho parecia travado no topo. Agora mostra duas
                          linhas e o resto vem no rótulo, passando o mouse. */}
                      <td title={[p.despesa_pai_id ? 'Medição —' : '', p.descricao || 'Despesa avulsa'].filter(Boolean).join(' ')}>
                        <div className="acn-fin-2linhas">
                          {p.despesa_pai_id ? <span className="acn-fraco">↳ medição — </span> : null}
                          {p.descricao || 'Despesa avulsa'}
                        </div>
                      </td>
                      <td className="acn-fraco">{p.criado_por_nome || '—'}</td>
                      <td>
                        {p.parcelado ? (
                          (() => {
                            const totalNeg = Number(p.valor_total_negociado) || 0;
                            const pago = pagoPorContrato[p.id] || 0;
                            const pct = totalNeg > 0 ? Math.min(100, Math.round(pago / totalNeg * 100)) : 0;
                            const estouro = pago > totalNeg;
                            return (
                              <div className="acn-fin-contrato">
                                <div className={estouro ? 'acn-txt-erro' : 'acn-txt-ok'}>
                                  Pago {fmtR(pago)} de {fmtR(totalNeg)} ({pct}%)
                                </div>
                                <div className="acn-fin-progresso"><i className={estouro ? 'estouro' : ''} style={{ width: `${pct}%` }} /></div>
                                {/* "pagas x de N" — só quando o número de parcelas foi combinado (29/09/2026) */}
                                {(Number(p.num_parcelas) > 0 || medicoesPorContrato[p.id] > 0) && (
                                  <div className={Number(p.num_parcelas) > 0 && medicoesPorContrato[p.id] > Number(p.num_parcelas) ? 'acn-txt-erro' : 'acn-fraco'}>
                                    {Number(p.num_parcelas) > 0
                                      ? `${medicoesPorContrato[p.id] || 0} de ${p.num_parcelas} parcelas`
                                      : `${medicoesPorContrato[p.id]} medição(ões)`}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : p.despesa_pai_id ? (
                          <Selo familia="neutro" ponto={false}>Medição</Selo>
                        ) : (
                          <Selo familia="atencao" ponto={false}>Despesa avulsa</Selo>
                        )}
                      </td>
                      <td className="acn-fraco">—</td>
                      <td className="acn-dir acn-nowrap acn-num">
                        {p.parcelado ? '—' : fmtR(Number(p.valor) || 0)}
                      </td>
                      <td className="acn-nowrap">{fmtDt(p.data)}</td>
                      <td>
                        <div className="acn-acoes-linha">
                          {p.parcelado && (
                            <Botao pequeno variante="primario" onClick={() => setModalMedicao(p)}>+ Medição</Botao>
                          )}
                          {/* corrigir valor, descrição, data ou centro errado —
                              só Admin e gerente, e tudo vai para a auditoria */}
                          {podeEditarLancamento(currentUser) && (
                            <Botao pequeno icone={mdiPencilOutline} onClick={() => setModalEditar(p)} title="Editar ou excluir este lançamento">Editar</Botao>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td className="acn-forte">{p.numero_pedido || '—'}</td>
                      <td title={p.descricao_material || ''}>
                        <div className="acn-fin-2linhas">{p.descricao_material || '—'}</div>
                      </td>
                      <td className="acn-fraco">{p.fornecedor || '—'}</td>
                      <td><Selo familia={FAMILIA_COMPRA[p.status_compra] || 'neutro'} ponto={false}>{p.status_compra || '—'}</Selo></td>
                      <td>
                        {p.numero_oc ? (
                          <div className="acn-fin-oc">
                            <span className="acn-forte">✓ {p.numero_oc}</span>
                            <Botao pequeno variante="discreto" icone={mdiPrinterOutline} onClick={() => imprimirOrdemCompra(p)} title="Imprimir Ordem de Compra" aria-label="Imprimir Ordem de Compra" />
                          </div>
                        ) : (
                          <span className="acn-fraco">— aguardando aprovação</span>
                        )}
                      </td>
                      <td className="acn-dir acn-nowrap acn-num">
                        {p.valor_compra ? fmtR(Number(p.valor_compra)) : '—'}
                      </td>
                      <td className="acn-nowrap">{fmtDt(p.data_criacao)}</td>
                      {/* O pedido de compra também precisa de ação: é nele que
                          aparece o erro de centro errado ou valor diferente do
                          pago, e até 28/09/2026 esta célula ficava vazia. */}
                      <td>
                        {podeEditarLancamento(currentUser) && (
                          <div className="acn-acoes-linha">
                            <Botao pequeno icone={mdiPencilOutline} onClick={() => setModalPedido(p)} title="Corrigir centro, valor, descrição ou data">Editar</Botao>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* TOTAL LEGÍVEL (28/09/2026) — o valor só aparecia ao passar o mouse (texto escuro sobre faixa escura).
                    Etapa 12e9: a linha de total é a do guia (`acn-linha-total`), clara nos dois modos. */}
                <tfoot>
                  <tr className="acn-linha-total">
                    <td colSpan={5} className="acn-dir">TOTAL</td>
                    <td className="acn-dir acn-nowrap acn-num">{fmtR(total)}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao onClick={onClose}>Fechar</Botao>
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
// Etapa 12e9: cada situação é um `Selo` do guia (o emoji decorativo de antes saiu; o texto é o mesmo)
const STATUS_FAT_LABEL: Record<string, { label: string; familia: string }> = {
  aguardando_recebimento: { label: 'Aguardando recebimento', familia: 'neutro' },
  liberado:                { label: 'Liberado p/ pagamento',  familia: 'info' },
  pago:                    { label: 'Pago',                   familia: 'ok' },
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
    <tr onClick={marcarVisto} className={naoLido ? 'acn-linha-nova' : undefined}>
      <td className="acn-nowrap acn-forte">{f.numero_oc || '—'}</td>
      <td className="acn-nowrap">{f.numero_pedido || '—'}</td>
      <td className="acn-fraco">{f.fornecedor || '—'}</td>
      <td className="acn-fraco">{f.centro_custo || '—'}</td>
      <td className="acn-dir acn-nowrap acn-num">{fmtR(f.valor)}</td>
      <td><Selo familia={st.familia} ponto={false}>{st.label}</Selo></td>
      <td className="acn-fin-acao">
        {!f.recebimento_confirmado ? (
          <span className="acn-fraco">—</span>
        ) : f.status_faturamento === 'pago' ? (
          <span className="acn-txt-ok">
            NF {f.nf_fornecedor_numero} · pago em {fmtDt(f.data_pagamento)}
            {f.nf_fornecedor_url && <> · <a href={f.nf_fornecedor_url} target="_blank" rel="noreferrer">ver</a></>}
          </span>
        ) : (
          <div className="acn-fin-nf">
            <input className="acn-input" value={nfNumero} onChange={e => setNfNumero(e.target.value)} placeholder="Nº NF fornecedor" />
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setArquivo(e.target.files?.[0] || null)} />
            <Botao pequeno variante="primario" icone={mdiCurrencyUsd} onClick={marcarPago} disabled={salvando}>
              {salvando ? '...' : 'Pago'}
            </Botao>
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
    <div className="sec-card">
      <div className="sec-hdr no-collapse">
        <span className="acn-cab-titulo"><Icone path={mdiFileDocumentOutline} size={16} /> Faturamento de Compras — NF do Fornecedor</span>
        <select className="acn-input acn-select-mini" value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Situação do faturamento">
          <option value="">Todos os status</option>
          <option value="aguardando_recebimento">Aguardando recebimento</option>
          <option value="liberado">Liberado p/ pagamento</option>
          <option value="pago">Pago</option>
        </select>
      </div>
      {filtrados.length === 0 ? (
        <div className="acn-empty">Nenhum registro de faturamento.</div>
      ) : (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-compacta">
            <thead>
              <tr>
                {['OC', 'Nº Pedido', 'Fornecedor', 'Centro de Custo', 'Valor', 'Status', 'Ação'].map(h => (
                  <th key={h} className={h === 'Valor' ? 'acn-dir' : undefined}>{h}</th>
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
  const [modalFechamento, setModalFechamento] = useState(false);            // Etapa 15e-2: janela "Fechamento do mês"
  const [fechamentos, setFechamentos] = useState<any[]>([]);                // Etapa 15e-2: para a faixa "mês fechado" (a trava de verdade é conferida no banco, ao gravar)
  const [erroCarga, setErroCarga] = useState('');                           // Etapa 7.46: mensagem da leitura que falhou ('' = a última deu certo)
  const [carregouUmaVez, setCarregouUmaVez] = useState(false);              // Etapa 7.46: já houve uma leitura boa? (sem ela, não se mostram zeros no lugar dos números)

  // Filtros
  const now = new Date();
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroStatus, setFiltroStatus] = useState('');

  const isAdmin = ['Admin', 'Gerente', 'Compras'].includes(currentUser?.perfil);

  const carregar = useCallback(async () => {
    setLoading(true);
    // Etapa 7.46 (05/10/2026): a leitura que falhava era tratada como "não tem nada" — a tela zerava os
    // quatro números e dizia "Nenhuma compra encontrada no período". Agora, se QUALQUER das quatro falhar,
    // a tela mantém o que já tinha, avisa e oferece "Tentar de novo" (meia leitura daria um total errado).
    let leituras: any[] = [];
    try {
      leituras = await Promise.all([
        supabase.from('centros_custo').select('*').order('codigo'),
        supabase.from('pcp_pedidos_compra').select('*').order('data_criacao', { ascending: false }),
        supabase.from('pcp_pedidos_faturamento').select('*').order('criado_em', { ascending: false }),
        supabase.from('centro_custo_despesas').select('*').order('data', { ascending: false }),
      ]);
    } catch (e: any) { leituras = [{ error: { message: e?.message || 'sem conexão' } }]; }
    const falha = leituras.find((r: any) => r?.error);
    if (falha) {
      setErroCarga(falha.error.message || 'erro desconhecido');
      setLoading(false);
      return;
    }
    const [{ data: cData }, { data: pData }, { data: fData }, { data: dData }] = leituras;
    setErroCarga('');
    setCarregouUmaVez(true);
    setCentros(cData || []);
    setCompras(pData || []);
    setFaturamentos(fData || []);
    setDespesas(dData || []);
    setLoading(false);
    // Etapa 15e-2: a faixa "mês fechado" — se a leitura falhar, só não mostra a faixa (a trava é conferida no banco ao gravar)
    lerFechamentos().then(setFechamentos).catch(() => setFechamentos([]));
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

  // Despesas avulsas do mesmo período: pela COMPETÊNCIA (o mês a que a despesa pertence — Etapa 15d, 05/10/2026); sem competência (as de antes), pela data
  const despesasFiltradas = despesas.filter(d => {
    const ref = d.competencia || d.data;
    const dt = ref ? new Date(String(ref).slice(0, 10) + 'T12:00:00') : null;
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

  // Barras do gráfico: o comprimento é o total do centro em relação ao maior (Etapa 12e9: todas na cor da marca;
  // as 8 cores de antes só diferenciavam uma barra da outra, e o nome do centro já faz isso)
  const maxBarVal = listacentros.length > 0 ? Math.max(...listacentros.map(c => c.total)) : 1;

  const anos = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  if (abaFin === 'conciliacao') {
    return (
      <div className="acn-fin">
        <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />
        <ConciliacaoBancaria currentUser={currentUser} />
      </div>
    );
  }

  if (abaFin === 'kanban') {
    return (
      <div className="acn-fin">
        <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />
        <FinanceiroKanban currentUser={currentUser} />
      </div>
    );
  }

  if (abaFin === 'custoop') {
    return (
      <div className="acn-fin">
        <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />
        <CustoPorOpTab currentUser={currentUser} />
      </div>
    );
  }

  // Etapa 15e (05/10/2026): a tabela "Consolidado por Centro" como está na tela (com o total) numa planilha
  const exportarConsolidado = () => {
    try {
      baixarPlanilha(`Consolidado_por_centro_${filtroAno || 'todos'}${filtroMes ? '-' + filtroMes : ''}`, [{
        nome: 'Consolidado por centro',
        colunas: [{ rotulo: 'Centro de Custo', largura: 48 }, { rotulo: 'Qtd. Compras', formato: 'inteiro' }, { rotulo: 'Total Gasto', formato: 'moeda' }, { rotulo: 'Recebidas', formato: 'inteiro' }, { rotulo: 'Pendentes', formato: 'inteiro' }],
        linhas: [
          ...listacentros.map(c => [c.nome, c.count, c.total, c.compras.filter((p: any) => p.status_compra === 'Recebido').length, c.compras.filter((p: any) => p.status_compra === 'Pendente').length]),
          ['TOTAL GERAL', comprasFiltradas.length + despesasFiltradas.length, totalGasto, null, null],
        ],
      }]);
    } catch (e: any) { alert('Não foi possível gerar a planilha: ' + (e?.message || e)); }
  };

  const kpis = [
    { label: 'Total Gasto', value: fmtR(totalGasto), sub: 'no período filtrado', tom: 'ok' },
    { label: 'Centros Ativos', value: String(centros.filter(c => c.ativo).length), sub: 'centros de custo', tom: 'info' },
    { label: 'Recebidas', value: String(totalRecebidas), sub: 'compras recebidas', tom: 'ok' },
    { label: 'Pendentes', value: String(totalPendentes), sub: 'aguardando', tom: 'atencao' },
    { label: 'Sem Centro', value: String(totalSemCentro), sub: 'sem centro vinculado — clique para corrigir', tom: 'erro', onClick: () => setSemCentroAberto(true) },
  ];

  return (
    <div className="acn-fin">
      <AbasFinanceiro aba={abaFin} setAba={setAbaFin} />

      {/* Header */}
      <div className="sec-card">
        <div className="sec-hdr no-collapse">
          <div>
            <span className="acn-cab-titulo"><Icone path={mdiCashMultiple} size={16} /> Financeiro — Centro de Custos</span>
            <div className="acn-ajuda">Controle de despesas de compras por centro de custo</div>
          </div>
          <div className="acn-cab-filtros">
            {isAdmin && (
              <Botao pequeno variante="primario" icone={mdiTagOutline} onClick={() => setModalCentros(true)}>Gerenciar Centros</Botao>
            )}
            <Botao pequeno icone={mdiLockOutline} onClick={() => setModalFechamento(true)} title="Fechar o mês (trava despesas e a correção de compras) ou ver o que já foi fechado">Fechamento do mês</Botao>
            <Botao pequeno icone={mdiRefresh} onClick={carregar} title="Atualizar" aria-label="Atualizar" />
          </div>
        </div>
      </div>

      {/* Etapa 15e-2: o mês que o filtro mostra está fechado? */}
      {(() => {
        const f = filtroMes && filtroAno ? fechamentoVigente(fechamentos, { ano: Number(filtroAno), mes: Number(filtroMes) }) : null;
        return f ? (
          <div className="acn-fin-espaco">
            <Faixa tom="info">{nomeDoMes({ ano: f.ano, mes: f.mes })} está <strong>fechado</strong>{f.fechado_por_nome ? ` (por ${f.fechado_por_nome}, em ${new Date(f.fechado_em).toLocaleDateString('pt-BR')})` : ''}: despesas avulsas e a correção das compras criadas nele estão travadas. Só o Admin reabre (Fechamento do mês).</Faixa>
          </div>
        ) : null;
      })()}

      {/* Filtros */}
      <div className="sec-card">
        <div className="acn-filtros">
          <span className="acn-label">Filtrar por:</span>
          <select className="acn-input acn-select-mini" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
              <option key={m} value={m}>{new Date(2000, Number(m)-1, 1).toLocaleString('pt-BR',{month:'long'})}</option>
            ))}
          </select>
          <select className="acn-input acn-select-mini" value={filtroAno} onChange={e => setFiltroAno(e.target.value)} aria-label="Ano">
            <option value="">Todos os anos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="acn-input acn-select-mini" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Etapa da compra">
            <option value="">Todos os status</option>
            {/* lista vinda de ComprasFluxo em vez de copiada: era a cópia que
                ficava para trás quando uma etapa mudava de nome (24/09/2026) */}
            {ETAPAS_COMPRA.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* Etapa 7.46: sem nenhuma leitura boa, "0 compra(s)" seria mentira */}
          {!(erroCarga && !carregouUmaVez) && (
            <span className="acn-ajuda acn-filtros-dir">
              {comprasFiltradas.length} compra(s) no período
            </span>
          )}
        </div>
      </div>

      {/* Etapa 7.46: a leitura falhou — avisa em vez de mostrar zeros */}
      {erroCarga && (
        <div className="acn-fin-espaco">
          <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
            Não foi possível ler o Financeiro ({erroCarga}). Isso não quer dizer que não haja compras ou despesas.{carregouUmaVez ? ' Os números abaixo são os da última leitura que deu certo.' : ''}
          </Faixa>
        </div>
      )}

      {loading ? (
        <div className="acn-empty">Carregando...</div>
      ) : (erroCarga && !carregouUmaVez) ? null : (
        <>
          {/* KPI Cards */}
          <div className="acn-kpis">
            {kpis.map((k: any) => (
              <div key={k.label} className={'acn-kpi' + (k.onClick ? ' clicavel' : '')}
                {...(k.onClick ? { onClick: k.onClick, role: 'button', tabIndex: 0, 'aria-label': `${k.label}: ${k.value}. ${k.sub}`, onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.onClick(); } } } : {})}>
                <span className="rot"><i data-acn-familia={k.tom} />{k.label}</span>
                <span className="val acn-num">{k.value}</span>
                <span className="sub">{k.sub}</span>
              </div>
            ))}
          </div>

          {/* Gráfico de barras */}
          {listacentros.length > 0 && (
            <div className="sec-card">
              <div className="sec-hdr no-collapse">
                <span className="acn-cab-titulo"><Icone path={mdiChartBar} size={16} /> Despesas por Centro de Custo</span>
              </div>
              <div className="sec-body">
                <div className="acn-fin-barras">
                  {listacentros.slice(0, 10).map(c => (
                    <div key={c.key} className="acn-fin-barra">
                      <div className="acn-fin-barra-nome">{c.nome}</div>
                      <div className="acn-fin-barra-trilho">
                        <i className={c.total > 0 ? 'tem' : ''} style={{ width: `${maxBarVal > 0 ? (c.total / maxBarVal * 100) : 0}%` }} />
                      </div>
                      <div className="acn-fin-barra-valor acn-num">{fmtR(c.total)}</div>
                      <div className="acn-fin-barra-qtd">{c.count}pc</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tabela de centros */}
          <div className="sec-card">
            <div className="sec-hdr no-collapse">
              <span className="acn-cab-titulo"><Icone path={mdiFolderOutline} size={16} /> Consolidado por Centro de Custo</span>
              <div className="acn-cab-filtros">
                <span className="acn-ajuda">
                  Clique em um centro para ver o painel (orçado × realizado × comprometido); "Ver" abre as compras
                </span>
                <Botao pequeno icone={mdiFileExcelOutline} onClick={exportarConsolidado} disabled={listacentros.length === 0}>Exportar para Excel</Botao>
              </div>
            </div>

            {listacentros.length === 0 ? (
              <div className="acn-empty">Nenhuma compra encontrada no período.</div>
            ) : (
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead>
                    <tr>
                      {['Centro de Custo', 'Qtd. Compras', 'Total Gasto', 'Recebidas', 'Pendentes', 'Ver'].map(h => (
                        <th key={h} className={h === 'Total Gasto' ? 'acn-dir' : (h === 'Centro de Custo' ? undefined : 'acn-fin-c')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listacentros.map(c => {
                      const recebidas = c.compras.filter(p => p.status_compra === 'Recebido').length;
                      const pend  = c.compras.filter(p => p.status_compra === 'Pendente').length;
                      const semCC = c.key === '(Sem Centro)';
                      return (
                        <tr key={c.key} className="acn-fin-linha"
                          title={c.centroId ? 'Abrir o painel deste centro' : undefined}
                          onClick={() => (c.centroId ? setPainelCentro(c.centroId) : setModalCompras({ centro: { nome: c.nome }, compras: c.compras }))}>
                          <td>
                            <div className="acn-fin-centro">
                              {semCC && <span className="acn-txt-erro"><Icone path={mdiAlertOutline} size={16} /></span>}
                              <div>
                                <div className={semCC ? 'acn-txt-erro' : 'acn-cc-codigo'}>
                                  {c.nome}
                                </div>
                                {semCC && <div className="acn-fraco">Sem centro de custo alocado</div>}
                              </div>
                            </div>
                          </td>
                          <td className="acn-fin-c">{c.count}</td>
                          <td className="acn-dir acn-nowrap acn-num"><strong className="acn-forte">{fmtR(c.total)}</strong></td>
                          <td className="acn-fin-c">
                            {recebidas > 0 && <Selo familia="ok" ponto={false}>{recebidas}</Selo>}
                          </td>
                          <td className="acn-fin-c">
                            {pend > 0 && <Selo familia="atencao" ponto={false}>{pend}</Selo>}
                          </td>
                          <td className="acn-fin-c">
                            <Botao pequeno onClick={e => { e.stopPropagation(); setModalCompras({ centro: { nome: c.nome }, compras: c.compras }); }}>Ver</Botao>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="acn-linha-total">
                      <td>TOTAL GERAL</td>
                      <td className="acn-fin-c">{comprasFiltradas.length + despesasFiltradas.length}</td>
                      <td className="acn-dir acn-nowrap acn-num">{fmtR(totalGasto)}</td>
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

      {modalFechamento && <ModalFechamentoMes currentUser={currentUser} onClose={() => setModalFechamento(false)} onMudou={carregar} />}

      {semCentroAberto && <ModalComprasSemCentro currentUser={currentUser} onClose={() => setSemCentroAberto(false)} onGravou={carregar} />}

      {painelCentro && (
        <PainelCentroCusto centroId={painelCentro} centros={centros} currentUser={currentUser} onClose={() => setPainelCentro(null)}
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
