// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CUSTO POR OP (Etapa 15e do ux-fluxo, 05/10/2026) — aba do Financeiro
//
// Quanto custou cada OP: as compras LIGADAS a ela (o "vínculo" do pedido de compra), em qualquer centro de custo — ou sem centro.
// Mesma conta do painel do centro: realizado = o que foi pago; comprometido = aprovado/comprado/recebido e ainda não pago; o que
// ainda não foi aprovado é "previsto" e fica de fora do total. Descartada não conta. A compra entra no mês em que foi criada.
// Só conta o vínculo escolhido no pedido: o texto digitado no campo `opl` não é uma ligação (medido no banco real em 05/10/2026:
// só 1 das 54 compras tinha vínculo com OP, e a tela nasce quase vazia — ela enche conforme os pedidos novos forem ligados a OP).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Icone from './Icone';
import { Botao, Selo, Faixa, diaBR } from './Interface';
import { abrirVinculo } from './VinculoPicker';
import { baixarPlanilha } from './ExportarPlanilha';
import { lerPaginado, normalizarComprasDeOp, agruparPorOp, numeroDaOp, restoDaOp, situacaoDoItem, textoDoLancamento, reais, MESES, TIPOS_VINCULO_DE_OP } from './CentroCustoPainel';
import { mdiClipboardTextOutline, mdiFileExcelOutline, mdiOpenInNew, mdiChevronDown, mdiChevronRight } from '@mdi/js';

const COLUNAS_COMPRA = 'id,numero_pedido,descricao_material,fornecedor,status_compra,valor_compra,centro_custo_id,data_criacao,vinculo_tipo,vinculo_id,vinculo_descricao';
const SEM_CENTRO = '__sem_centro__';

/** As compras ligadas a uma OP e os pagamentos delas. Lança erro se alguma leitura falhar (quem chama avisa). */
export async function carregarComprasDeOp() {
  const compras = await lerPaginado(() => supabase.from('pcp_pedidos_compra').select(COLUNAS_COMPRA).in('vinculo_tipo', TIPOS_VINCULO_DE_OP).not('vinculo_id', 'is', null).order('id'));
  const faturamentos: any[] = [];
  const ids = compras.map((c: any) => c.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('pcp_pedidos_faturamento').select('id,pedido_id,valor,data_pagamento').in('pedido_id', ids.slice(i, i + 150));
    if (error) throw error;
    faturamentos.push(...(data || []));
  }
  const { data: centros, error: errCentros } = await supabase.from('centros_custo').select('id,codigo,nome').order('codigo');
  if (errCentros) throw errCentros;
  return { compras, faturamentos, centros: centros || [] };
}

export default function CustoPorOpTab({ currentUser }: any) {
  const agora = new Date();
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [mes, setMes] = useState('');
  const [centro, setCentro] = useState('');
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const carregar = useCallback(() => {
    setCarregando(true); setErro('');
    carregarComprasDeOp()
      .then(setDados)
      .catch((e: any) => setErro(e?.message || String(e)))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const centrosPorId = useMemo(() => Object.fromEntries((dados?.centros || []).map((c: any) => [c.id, c])), [dados]);
  const codigoDe = (id: string | null) => (id ? (centrosPorId[id]?.codigo || '(centro removido)') : 'sem centro');
  const itens = useMemo(() => (dados ? normalizarComprasDeOp(dados) : []), [dados]);
  const filtrados = useMemo(() => itens.filter((it: any) =>
    (!ano || String(it.ano) === ano) && (!mes || String(it.mes) === mes)
    && (!centro || (centro === SEM_CENTRO ? !it.centroId : it.centroId === centro))), [itens, ano, mes, centro]);
  const ops = useMemo(() => agruparPorOp(filtrados), [filtrados]);
  const total = useMemo(() => {
    const s = { compras: 0, realizado: 0, comprometido: 0, previsto: 0 };
    ops.forEach((o: any) => { s.compras += o.compras; s.realizado += o.realizado; s.comprometido += o.comprometido; s.previsto += o.previsto; });
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { compras: s.compras, realizado: r2(s.realizado), comprometido: r2(s.comprometido), previsto: r2(s.previsto), total: r2(s.realizado + s.comprometido) };
  }, [ops]);
  const anos = Array.from({ length: 5 }, (_, i) => String(agora.getFullYear() - i));
  const centrosDasOps = (o: any) => [...o.centroIds].map(codigoDe).sort().join(', ');
  const periodoTexto = (mes ? MESES[Number(mes) - 1] + ' de ' : '') + (ano || 'todos os anos');

  const alternar = (id: string) => setAbertas(a => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // A planilha: a mesma tabela da tela (com o total) e, em outra folha, as compras de cada OP.
  const exportar = () => {
    try {
      baixarPlanilha(`Custo_por_OP_${ano || 'todos'}${mes ? '-' + String(mes).padStart(2, '0') : ''}`, [
        {
          nome: 'Custo por OP',
          colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Cliente / modelo', largura: 32 }, { rotulo: 'Compras', formato: 'inteiro' }, { rotulo: 'Realizado', formato: 'moeda' },
            { rotulo: 'Comprometido', formato: 'moeda' }, { rotulo: 'Total gasto', formato: 'moeda' }, { rotulo: 'Previsto (sem aprovação)', formato: 'moeda', largura: 24 }, { rotulo: 'Centros', largura: 28 }],
          linhas: [
            ...ops.map((o: any) => [numeroDaOp(o.rotulo) || '(sem número)', restoDaOp(o.rotulo), o.compras, o.realizado, o.comprometido, o.total, o.previsto, centrosDasOps(o)]),
            ['TOTAL', '', total.compras, total.realizado, total.comprometido, total.total, total.previsto, ''],
          ],
        },
        {
          nome: 'Compras',
          colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Data', largura: 12 }, { rotulo: 'Pedido', largura: 16 }, { rotulo: 'Descrição', largura: 40 }, { rotulo: 'Fornecedor', largura: 28 }, { rotulo: 'Situação', largura: 22 },
            { rotulo: 'Valor', formato: 'moeda' }, { rotulo: 'Realizado', formato: 'moeda' }, { rotulo: 'Comprometido', formato: 'moeda' }, { rotulo: 'Previsto', formato: 'moeda' }, { rotulo: 'Centro', largura: 14 }],
          linhas: ops.flatMap((o: any) => o.itens.map((it: any) => [numeroDaOp(o.rotulo) || '(sem número)', diaBR(it.data), it.numero, it.descricao || 'Compra', it.fornecedor || '', situacaoDoItem(it).texto, it.valor, it.realizado, it.comprometido, it.previsto, codigoDe(it.centroId)])),
        },
      ]);
    } catch (e: any) { alert('Não foi possível gerar a planilha: ' + (e?.message || e)); }
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span className="acn-cab-titulo"><Icone path={mdiClipboardTextOutline} size={16} /> Custo por OP ({ops.length})</span>
        <div className="acn-cab-filtros">
          <Botao pequeno icone={mdiFileExcelOutline} onClick={exportar} disabled={!dados || ops.length === 0}>Exportar para Excel</Botao>
          <Botao pequeno onClick={carregar} title="Ler de novo">↻</Botao>
        </div>
      </div>
      <div className="sec-body">
        <div className="acn-cc-op-filtros">
          <select className="acn-input acn-cc-filtro" value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano">
            <option value="">Todos os anos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="acn-input acn-cc-filtro" value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
          <select className="acn-input acn-cc-filtro" value={centro} onChange={e => setCentro(e.target.value)} aria-label="Centro de custo">
            <option value="">Todos os centros</option>
            <option value={SEM_CENTRO}>Compras sem centro</option>
            {(dados?.centros || []).map((c: any) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
          </select>
        </div>

        {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as compras ligadas a OP: {erro}.</Faixa>}
        {carregando && !dados && <div className="acn-empty">Carregando…</div>}

        {dados && (<>
          <div className="acn-cc-op-kpis">
            <div className="acn-cc-kpi"><span>OPs com compra</span><strong>{ops.length}</strong><em>{periodoTexto}</em></div>
            <div className="acn-cc-kpi"><span>Total gasto</span><strong>{reais(total.total)}</strong><em>realizado + comprometido</em></div>
            <div className="acn-cc-kpi"><span>Realizado</span><strong>{reais(total.realizado)}</strong><em>pago</em></div>
            <div className="acn-cc-kpi"><span>Comprometido</span><strong>{reais(total.comprometido)}</strong><em>aprovado, ainda não pago</em></div>
          </div>

          {ops.length === 0 ? (
            <div className="acn-empty">
              Nenhuma compra ligada a uma OP em {periodoTexto}{centro ? ' neste centro' : ''}.
              {itens.length === 0 && <> A ligação é feita no pedido de compra (campo "vínculo": escolher a OP); só as compras ligadas aparecem aqui.</>}
            </div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr><th /><th>OP</th><th>Compras</th><th>Realizado</th><th>Comprometido</th><th>Total gasto</th><th>Centros</th><th /></tr></thead>
                <tbody>
                  {ops.map((o: any) => {
                    const aberta = abertas.has(o.opId);
                    return (
                      <React.Fragment key={o.opId}>
                        <tr>
                          <td><Botao pequeno icone={aberta ? mdiChevronDown : mdiChevronRight} onClick={() => alternar(o.opId)} aria-expanded={aberta} aria-label={`${aberta ? 'Esconder' : 'Mostrar'} as compras da OP ${numeroDaOp(o.rotulo)}`} title="Compras desta OP" /></td>
                          <td className="acn-texto-longo"><strong className="acn-forte">{numeroDaOp(o.rotulo) || '(sem número)'}</strong>{restoDaOp(o.rotulo) && <div className="acn-fraco">{restoDaOp(o.rotulo)}</div>}</td>
                          <td className="acn-nowrap">{o.compras}</td>
                          <td className="acn-nowrap">{reais(o.realizado)}</td>
                          <td className="acn-nowrap">{reais(o.comprometido)}</td>
                          <td className="acn-nowrap"><strong className="acn-forte">{reais(o.total)}</strong>{o.previsto > 0 && <div className="acn-fraco">+ {reais(o.previsto)} previsto</div>}</td>
                          <td className="acn-texto-longo">{centrosDasOps(o)}</td>
                          <td><div className="acn-acoes-linha"><Botao pequeno icone={mdiOpenInNew} onClick={() => abrirVinculo({ tipo: 'op', id: o.opId, descricao: o.rotulo })}>Abrir OP</Botao></div></td>
                        </tr>
                        {aberta && (
                          <tr className="acn-cc-op-detalhe">
                            <td />
                            <td colSpan={7}>
                              <table className="acn-tabela acn-compacta">
                                <thead><tr><th>Data</th><th>Pedido</th><th>Compra</th><th>Centro</th><th>Situação</th><th>Valor</th></tr></thead>
                                <tbody>
                                  {o.itens.map((it: any) => (
                                    <tr key={it.chave}>
                                      <td className="acn-nowrap">{diaBR(it.data)}</td>
                                      <td className="acn-nowrap">{it.numero}</td>
                                      <td className="acn-texto-longo"><strong className="acn-forte">{textoDoLancamento(it)}</strong>{it.fornecedor && <div className="acn-fraco">{it.fornecedor}</div>}</td>
                                      <td className="acn-nowrap">{codigoDe(it.centroId)}</td>
                                      <td><Selo familia={situacaoDoItem(it).familia} ponto={false}>{situacaoDoItem(it).texto}</Selo></td>
                                      <td className="acn-nowrap">{reais(it.valor)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr className="acn-linha-total">
                    <td /><td>TOTAL</td><td className="acn-nowrap">{total.compras}</td><td className="acn-nowrap">{reais(total.realizado)}</td>
                    <td className="acn-nowrap">{reais(total.comprometido)}</td><td className="acn-nowrap">{reais(total.total)}</td><td /><td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="acn-ajuda">
            Custo da OP = realizado + comprometido das compras ligadas a ela, em qualquer centro (ou sem centro). Compras ainda sem aprovação ficam como previsto e não entram no total; descartadas não contam.
            A compra entra no mês em que foi criada. Só vale a ligação escolhida no pedido de compra.
          </div>
        </>)}
      </div>
    </div>
  );
}
