// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a tela do relatório de custo real × orçado (04/11/2026). A conta está em ViagemRelatorio.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
import { Chips, Faixa, Selo, hojeISO } from './Interface';
import { fmtReais, fmtKm } from './ViagemCalculo';
import { resumoDosCustos, rotuloDoMes } from './ViagemRelatorio';

const pct = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const dif = (d: number) => <span className={d > 0.004 ? 'acn-txt-erro' : undefined}>{d > 0.004 ? '+' : ''}{fmtReais(d)}</span>;
const diaBR = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function RelatorioDeCustos({ viagens, aoAbrir }: any) {
  const [periodo, setPeriodo] = useState('ano');
  const hoje = hojeISO();
  const r = useMemo(() => resumoDosCustos(viagens, periodo, hoje), [viagens, periodo, hoje]);
  const t = r.totais;
  return (
    <div className="acn-vg-relatorio">
      <div className="acn-vg-barra">
        <Chips ativo={periodo} onChange={setPeriodo} rotulo="Período" itens={[{ id: 'ano', rotulo: 'Este ano' }, { id: '90', rotulo: 'Últimos 90 dias' }, { id: 'tudo', rotulo: 'Tudo' }]} />
        <span className="acn-ajuda">Pela data de saída. Só entram viagens com o custo real lançado pelo Financeiro; o desgaste do veículo fica de fora (não sai dinheiro).</span>
      </div>

      {r.semCusto.length > 0 && (
        <Faixa tom="erro">
          <strong>{r.semCusto.length} viagem(ns) finalizada(s) sem custo real lançado.</strong> A prestação de contas ainda não chegou ao Financeiro:{' '}
          {r.semCusto.slice(0, 6).map((v: any, i: number) => <React.Fragment key={v.id}>{i > 0 && ', '}<button type="button" className="acn-vg-vinc-abrir" onClick={() => aoAbrir(v)}>{v.titulo}</button></React.Fragment>)}
          {r.semCusto.length > 6 && ` e mais ${r.semCusto.length - 6}`}.
        </Faixa>
      )}

      {t.viagens === 0 ? <div className="acn-ajuda">Nenhuma viagem com custo real lançado neste período.</div> : (
        <>
          <div className="acn-vg-kpis">
            <div className="acn-vg-kpi"><span>Viagens com custo lançado</span><strong className="acn-num">{t.viagens}</strong></div>
            <div className="acn-vg-kpi"><span>Orçado</span><strong className="acn-num">{fmtReais(t.orcado)}</strong></div>
            <div className="acn-vg-kpi"><span>Gasto de fato</span><strong className="acn-num">{fmtReais(t.real)}</strong></div>
            <div className="acn-vg-kpi"><span>Diferença</span><strong className="acn-num">{dif(t.diferenca)}</strong></div>
            <div className="acn-vg-kpi"><span>Km rodado</span><strong className="acn-num">{t.kmRodado > 0 ? fmtKm(t.kmRodado) : '—'}</strong></div>
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">VIAGENS QUE PASSARAM DO ORÇADO ({r.estouraram.length})</div>
            {!r.estouraram.length ? <div className="acn-ajuda">Nenhuma passou do orçado neste período.</div> : (
              <table className="acn-tabela">
                <thead><tr><th>Viagem</th><th>Saída</th><th className="dir">Orçado</th><th className="dir">Gasto</th><th className="dir">Diferença</th><th className="dir">%</th></tr></thead>
                <tbody>{r.estouraram.map((l: any) => (
                  <tr key={l.id} className="acn-vg-linha-tab" onClick={() => aoAbrir(viagens.find((v: any) => v.id === l.id))}>
                    <td><strong>{l.titulo}</strong><div className="acn-ajuda">{l.veiculo}</div></td><td>{diaBR(l.dia)}</td>
                    <td className="dir acn-num">{fmtReais(l.orcado)}</td><td className="dir acn-num">{fmtReais(l.real)}</td><td className="dir acn-num">{dif(l.diferenca)}</td>
                    <td className="dir acn-num"><Selo familia="erro" ponto={false}>{pct(l.pct)}</Selo></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div className="acn-vg-duas">
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">POR MÊS</div>
              <table className="acn-tabela">
                <thead><tr><th>Mês</th><th className="dir">Viagens</th><th className="dir">Orçado</th><th className="dir">Gasto</th><th className="dir">Diferença</th></tr></thead>
                <tbody>{r.porMes.map((g: any) => (
                  <tr key={g.chave}><td>{rotuloDoMes(g.chave)}</td><td className="dir acn-num">{g.viagens}</td><td className="dir acn-num">{fmtReais(g.orcado)}</td><td className="dir acn-num">{fmtReais(g.real)}</td><td className="dir acn-num">{dif(g.real - g.orcado)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">POR VEÍCULO</div>
              <table className="acn-tabela">
                <thead><tr><th>Veículo</th><th className="dir">Viagens</th><th className="dir">Km rodado</th><th className="dir">Gasto</th><th className="dir">R$/km</th></tr></thead>
                <tbody>{r.porVeiculo.map((g: any) => (
                  <tr key={g.chave}><td>{g.chave}</td><td className="dir acn-num">{g.viagens}</td><td className="dir acn-num">{g.kmRodado > 0 ? fmtKm(g.kmRodado) : '—'}</td><td className="dir acn-num">{fmtReais(g.real)}</td>
                    <td className="dir acn-num">{g.kmRodado > 0 ? fmtReais(g.real / g.kmRodado) : '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
