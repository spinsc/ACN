// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — painel de atenção (D6 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// No alto da aba: o que precisa de alguém agora — esperando a MINHA decisão, esperando decisão de alguém, atrasadas, paradas há 7 dias ou mais, com o custo acima da meta e com ressalva em aberto.
// Cada cartão é também um filtro da lista (clicar de novo desliga). A conta de cada alerta é uma só (alertasDaDemanda, em DesenvolvimentoModelo.ts), a mesma dos selos que aparecem no cartão da demanda.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Selo } from './Interface';
import { DIAS_PARADA, alertasDaDemanda, dadosDoEntregavel, custoEstimado, modeloGuiado } from './DesenvolvimentoModelo';

const brl = (v: any) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ALERTAS: { id: string; rotulo: string; tom: string; vale: (a: any) => boolean }[] = [
  { id: 'minha', rotulo: 'Esperando a minha decisão', tom: 'atencao', vale: a => a.esperandoMinha },
  { id: 'decisao', rotulo: 'Esperando decisão', tom: 'info', vale: a => a.esperandoDecisao },
  { id: 'atrasada', rotulo: 'Atrasadas', tom: 'erro', vale: a => a.atrasadaEtapa > 0 || a.prazoVencido > 0 },
  { id: 'parada', rotulo: `Paradas há ${DIAS_PARADA}+ dias`, tom: 'atencao', vale: a => a.parada > 0 },
  { id: 'custo', rotulo: 'Custo acima da meta', tom: 'erro', vale: a => a.custoAcima },
  { id: 'ressalva', rotulo: 'Com ressalva em aberto', tom: 'marca', vale: a => a.ressalvas > 0 },
];
export const passaNoAlerta = (al: any, alerta: string) => alerta === 'todos' || !!ALERTAS.find(a => a.id === alerta)?.vale(al);

const SUB: Record<string, (n: number, itens: any[]) => string> = {
  minha: (n, itens) => (n ? 'esperam você decidir' : 'nada esperando você'),
  decisao: (n) => (n ? 'portas ou mudanças pedidas' : 'nenhuma porta pedida'),
  atrasada: (n) => (n ? 'etapa ou prazo do projeto vencido' : 'tudo no prazo'),
  parada: (n) => (n ? 'sem ninguém mexer' : 'todas andando'),
  custo: (n) => (n ? 'estimado ou real acima da meta' : 'dentro da meta'),
  ressalva: (n, itens) => (n ? `${itens.reduce((s, i) => s + i.al.ressalvas, 0)} ressalva(s) no total` : 'nenhuma em aberto'),
};

export function PainelDaEngenharia({ itens, alerta, onAlerta }: any) {
  if (!itens.length) return null;
  return (
    <div className="acn-kpis acn-dev-painel-kpis" data-painel>
      {ALERTAS.map(a => {
        const n = itens.filter((i: any) => a.vale(i.al)).length;
        const ativo = alerta === a.id;
        const alternar = () => onAlerta(ativo ? 'todos' : a.id);
        return (
          <div key={a.id} role="button" tabIndex={0} aria-pressed={ativo} data-alerta={a.id}
            className={'acn-kpi clicavel' + (ativo ? ' ativo' : '') + (n === 0 && !ativo ? ' apagado' : '')}
            onClick={alternar} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}>
            <span className="rot"><i data-acn-familia={a.tom} />{a.rotulo}</span>
            <span className="val acn-num">{n}</span>
            <span className="sub">{SUB[a.id](n, itens.filter((i: any) => a.vale(i.al)))}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Os selos de alerta no alto do cartão de uma demanda. */
export function SelosDeAlerta({ al }: any) {
  const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  const itens: any[] = [];
  if (al.atrasadaEtapa > 0) itens.push(['erro', `Etapa atrasada há ${pl(al.atrasadaEtapa, 'dia', 'dias')}`]);
  if (al.prazoVencido > 0) itens.push(['erro', `Prazo do projeto vencido há ${pl(al.prazoVencido, 'dia', 'dias')}`]);
  if (al.parada > 0) itens.push(['atencao', `Parada há ${al.parada} dias`]);
  if (al.esperandoMinha) itens.push(['atencao', 'Esperando a sua decisão']);
  else if (al.esperandoDecisao) itens.push(['info', 'Esperando decisão']);
  if (al.mudancaPendente && !al.esperandoDecisao) itens.push(['info', 'Mudança aprovada: falta a nova revisão']);
  if (al.custoAcima) itens.push(['erro', 'Custo acima da meta']);
  if (al.ressalvas > 0) itens.push(['atencao', pl(al.ressalvas, 'ressalva em aberto', 'ressalvas em aberto')]);
  if (!itens.length) return null;
  return <div className="acn-dev-alertas" data-alertas>{itens.map(([f, t], i) => <Selo key={i} familia={f} ponto={false}>{t}</Selo>)}</div>;
}

/** Meta × estimado × real, uma linha por demanda que já tenha algum desses números. */
export function TabelaDeCustos({ itens }: any) {
  const linhas = itens.filter((i: any) => modeloGuiado(i.d)).map((i: any) => {
    const meta = Number(dadosDoEntregavel(i.d, 'meta_custo')?.custo_alvo) || 0;
    const bom = dadosDoEntregavel(i.d, 'bom_prelim');
    const estimado = bom?.linhas?.length ? custoEstimado(bom) : 0;
    const real = Number(dadosDoEntregavel(i.d, 'custo_real')?.custo_real) || 0;
    return { d: i.d, meta, estimado, real };
  }).filter((l: any) => l.meta || l.estimado || l.real);
  if (!linhas.length) return null;
  const pct = (a: number, meta: number) => { if (!a || !meta) return null; const p = Math.round(((a - meta) / meta) * 1000) / 10; return <Selo familia={p > 0 ? 'erro' : 'ok'} ponto={false}>{p > 0 ? '+' : ''}{p.toLocaleString('pt-BR')}%</Selo>; };
  return (
    <details className="acn-dev-historico acn-dev-custos">
      <summary>Custo estimado × meta por demanda ({linhas.length})</summary>
      <table className="acn-tabela acn-densa">
        <thead><tr><th>Demanda</th><th>Meta</th><th>Estimado</th><th>Real</th></tr></thead>
        <tbody>
          {linhas.map((l: any) => (
            <tr key={l.d.id}>
              <td>{l.d.numero_opl ? `OP ${l.d.numero_opl} — ` : ''}{l.d.titulo}</td>
              <td>{l.meta ? brl(l.meta) : '—'}</td>
              <td>{l.estimado ? <>{brl(l.estimado)} {pct(l.estimado, l.meta)}</> : '—'}</td>
              <td>{l.real ? <>{brl(l.real)} {pct(l.real, l.meta)}</> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
