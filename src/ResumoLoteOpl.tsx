// @ts-nocheck
import React, { useMemo } from 'react';
import { Botao, Selo } from './Interface';
import { mdiClose, mdiPackageVariantClosed, mdiSendOutline } from '@mdi/js';
import { STATUS_AGUARDANDO_LIBERACAO_COMERCIAL } from './FluxoEntrega';

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO DO LOTE — pedido do usuário em 08/10/2026
// Lote de OPs (A1560.2608/01 … /15) é UMA venda de vários carros: em vez de abrir uma por uma, este cartão mostra o lote como uma coisa só — cliente, quantas unidades, em que etapa
// cada uma está, valor por veículo e do lote, os itens vendidos (e se são os mesmos em todas as unidades) e o que falta cadastrar. Abrir unidade por unidade continua existindo para quem
// precisa (Almoxarifado, Adaptação). As ações do lote inteiro (pedido de compra, liberar para o Fiscal) saem daqui também.
// ─────────────────────────────────────────────────────────────────────────────
const reais = (v: any) => (v == null || Number.isNaN(Number(v))) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (d: any) => !d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).split('-').reverse().join('/') : new Date(d).toLocaleDateString('pt-BR');
const vazio = (v: any) => v == null || String(v).trim() === '' || String(v).trim() === '—';

/** Assinatura dos itens vendidos de uma unidade: dois carros com a mesma assinatura têm exatamente os mesmos itens (nome, código e quantidade). */
export const assinaturaDeItens = (o: any): string => JSON.stringify(
  (Array.isArray(o?.itens_vendidos) ? o.itens_vendidos : [])
    .map((i: any) => [String(i.produto_codigo || i.item_id || '').trim(), String(i.nome || '').trim().toLowerCase(), Number(i.quantidade) || 0])
    .sort((a: any, b: any) => String(a[0] + a[1]).localeCompare(String(b[0] + b[1]))));

/** Todas as unidades têm os mesmos itens vendidos? (usado também pelo Engenharia/PCP para tratar o lote como uma coisa só) */
export const lotePedidoIgual = (irmaos: any[]): boolean => {
  if (!irmaos?.length) return false;
  const a = assinaturaDeItens(irmaos[0]);
  return irmaos.every(o => assinaturaDeItens(o) === a);
};

export default function ResumoLoteOpl({ base, irmaos, onClose, onCompra, onLiberarFiscal, onAbrirUnidade, desde }: any) {
  const dados = useMemo(() => {
    const n = irmaos.length;
    const porStatus: Record<string, number> = {};
    irmaos.forEach((o: any) => { const s = o.status_geral || '—'; porStatus[s] = (porStatus[s] || 0) + 1; });
    // o valor lançado em cada unidade costuma ser o do LOTE inteiro, repetido (ver OpLotes.ts); se vierem valores diferentes por unidade, soma
    const vals = irmaos.map((o: any) => o.valor_total).filter((v: any) => v != null).map(Number);
    const iguais = vals.length > 0 && vals.every(v => v === vals[0]);
    const totalLote = vals.length ? (iguais ? vals[0] : vals.reduce((s, v) => s + v, 0)) : null;
    const porVeiculo = totalLote != null ? (iguais ? totalLote / n : totalLote / n) : null;
    const grupos: Record<string, any[]> = {};
    irmaos.forEach((o: any) => { (grupos[assinaturaDeItens(o)] ||= []).push(o); });
    const gruposOrdenados = Object.values(grupos).sort((a, b) => b.length - a.length);
    const previsoes = irmaos.map((o: any) => o.data_prevista_entrega).filter(Boolean).sort();
    return {
      n, porStatus, totalLote, porVeiculo, gruposOrdenados,
      semChassi: irmaos.filter((o: any) => vazio(o.chassi)).length, semPlaca: irmaos.filter((o: any) => vazio(o.placa)).length, semModelo: irmaos.filter((o: any) => vazio(o.modelo)).length,
      prevMin: previsoes[0], prevMax: previsoes[previsoes.length - 1],
      prontasFiscal: irmaos.filter((o: any) => o.status_geral === STATUS_AGUARDANDO_LIBERACAO_COMERCIAL).length,
    };
  }, [irmaos]);
  const rep = irmaos[0] || {};
  const principal = dados.gruposOrdenados[0] || [];
  const itensPrincipal = Array.isArray(principal[0]?.itens_vendidos) ? principal[0].itens_vendidos : [];
  const modelos = [...new Set(irmaos.map((o: any) => String(o.modelo || '').trim()).filter(Boolean))];
  const tecnicos = [...new Set(irmaos.map((o: any) => o.tecnico || o.tecnico_producao_2_nome).filter(Boolean))];

  const linha = (rot: string, v: any) => (vazio(v) ? null : <div className="acn-ficha-linha"><span>{rot}</span><span>{v}</span></div>);
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-rlo-jan" role="dialog" aria-label={'Resumo do lote ' + base}>
        <div className="acn-modal-cab">
          <span className="modal-title">Lote {base} <Selo familia="marca" ponto={false}>{dados.n} unidades</Selo></span>
          <span className="acn-rlo-acoes">
            {onCompra && <Botao pequeno icone={mdiPackageVariantClosed} onClick={onCompra} title="Um pedido de compra para o lote inteiro">Pedido de compra do lote</Botao>}
            {onLiberarFiscal && dados.prontasFiscal > 0 && <Botao pequeno variante="primario" icone={mdiSendOutline} onClick={onLiberarFiscal} title="Libera para o Fiscal as unidades que aguardam a liberação comercial">Liberar {dados.prontasFiscal} ao Fiscal</Botao>}
            <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
          </span>
        </div>
        <div className="acn-modal-corpo acn-rlo-corpo">
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">O lote</div>
            {linha('Cliente', rep.cliente_nome)}
            {linha('Faturamento', rep.faturamento_empresa || 'ACN')}
            {linha('Modelo(s)', modelos.join(' · '))}
            {linha('Valor por veículo', dados.porVeiculo != null ? reais(dados.porVeiculo) : '')}
            {linha('Valor do lote', dados.totalLote != null ? reais(dados.totalLote) : '')}
            {linha('Previsão de entrega', dados.prevMin ? (dados.prevMin === dados.prevMax ? dia(dados.prevMin) : dia(dados.prevMin) + ' a ' + dia(dados.prevMax)) : '')}
            {linha('Técnico(s)', tecnicos.join(', '))}
            {desde && <div className="acn-ficha-linha"><span>Parada</span><span>a unidade mais parada: {desde}</span></div>}
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Em que etapa está</div>
            <div className="acn-rlo-selos">
              {Object.entries(dados.porStatus).sort((a: any, b: any) => b[1] - a[1]).map(([s, q]: any) => <Selo key={s} familia="neutro" ponto={false}>{q}× {s}</Selo>)}
            </div>
            <div className="acn-ficha-linha"><span>Cadastro dos veículos</span>
              <span>{(dados.semModelo + dados.semChassi + dados.semPlaca) === 0 ? <span className="acn-txt-ok">✓ dados completos</span>
                : <span className="acn-txt-erro">{[dados.semModelo && dados.semModelo + ' sem modelo', dados.semChassi && dados.semChassi + ' sem chassi', dados.semPlaca && dados.semPlaca + ' sem placa'].filter(Boolean).join(' · ')}</span>}</span>
            </div>
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Itens vendidos {dados.gruposOrdenados.length === 1 ? '(os mesmos em todas as ' + dados.n + ' unidades)' : ''}</div>
            {dados.gruposOrdenados.length > 1 && (
              <div className="acn-txt-atencao">As unidades NÃO têm todas os mesmos itens: {dados.gruposOrdenados.map(g => g.length + ' unidade(s)').join(' · ')}. Abaixo, o grupo maior ({principal.length} unidades); abra as outras uma a uma.</div>
            )}
            {itensPrincipal.length === 0 ? <div className="acn-fraco">Nenhum item vendido registrado.</div> : (
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr><th>Código</th><th>Item</th><th className="acn-dir">Qtd. por veículo</th><th className="acn-dir">Qtd. no lote</th></tr></thead>
                  <tbody>{itensPrincipal.map((i: any, k: number) => (
                    <tr key={k}><td>{i.produto_codigo || '—'}</td><td className="acn-texto-longo">{i.nome}{i.descricao ? <span className="acn-fraco"> — {i.descricao}</span> : null}</td>
                      <td className="acn-dir acn-num">{Number(i.quantidade) || 0}</td><td className="acn-dir acn-num acn-forte">{(Number(i.quantidade) || 0) * principal.length}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Unidades</div>
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr><th>OP</th><th>Etapa</th><th>Modelo</th><th>Chassi</th><th>Placa</th></tr></thead>
                <tbody>{[...irmaos].sort((a: any, b: any) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true })).map((o: any) => (
                  <tr key={o.id}>
                    <td className="acn-forte">{onAbrirUnidade ? <Botao variante="discreto" pequeno className="acn-rlo-abrir" onClick={() => onAbrirUnidade(o)}>{o.opl}</Botao> : o.opl}</td>
                    <td>{o.status_geral}</td><td>{o.modelo || <span className="acn-txt-erro">—</span>}</td><td>{o.chassi || <span className="acn-txt-erro">—</span>}</td><td>{o.placa || <span className="acn-txt-erro">—</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
