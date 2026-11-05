// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o fechamento: custo real × orçado (pedido do usuário em 04/11/2026, fatia 3)
//
// Depois que a equipe sai, a ADAPTAÇÃO informa o km que o painel marcava na volta (dele sai o km rodado e o km atual do veículo da frota, que o banco atualiza ao finalizar)
// e o FINANCEIRO lança o que foi gasto de fato (decidido com o usuário: é ele quem cuida da verba e da prestação de contas). O quadro compara cada item com o orçamento.
// O desgaste do veículo é um custo calculado, não sai dinheiro: aparece no orçamento, mas fica fora da comparação.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { CampoNumero } from './ViagemCampos';
import { Parte } from './ViagemProvisionamento';
import { fmtReais, fmtKm } from './ViagemCalculo';
import Icone from './Icone';
import { Botao, Faixa } from './Interface';
import { comprovantesDoItem, itensSemComprovante } from './ViagemComprovantes';
import { mdiPaperclip, mdiClose } from '@mdi/js';

const ITENS = [
  { chave: 'combustivel', rotulo: 'Combustível', orcado: (r: any) => r.combustivel },
  { chave: 'pedagios', rotulo: 'Pedágios', orcado: (r: any) => r.pedagios },
  { chave: 'hospedagem', rotulo: 'Hospedagem', orcado: (r: any) => r.hospedagem },
  { chave: 'alimentacao', rotulo: 'Alimentação', orcado: (r: any) => r.alimentacao },
  { chave: 'outros', rotulo: 'Outros custos', orcado: (r: any) => r.outros },
];
const lancado = (x: any) => x !== null && x !== undefined && x !== '';

/** O que a comparação mostra: cada item, os totais, a diferença e o km. Pura, para o teste e a tela usarem a mesma conta. */
export function compararComOOrcado(v: any, r: any) {
  const real = v?.custo_real || {};
  const linhas = ITENS.map(i => ({ chave: i.chave, rotulo: i.rotulo, orcado: Number(i.orcado(r)) || 0, real: lancado(real[i.chave]) ? Number(real[i.chave]) || 0 : null }));
  const lancou = linhas.some(l => l.real !== null);
  const totalOrcado = linhas.reduce((s, l) => s + l.orcado, 0);
  const totalReal = linhas.reduce((s, l) => s + (l.real || 0), 0);
  const saida = lancado(v?.km_saida) ? Number(v.km_saida) : null;
  const volta = lancado(v?.km_volta) ? Number(v.km_volta) : null;
  const kmRodado = saida !== null && volta !== null && volta >= saida ? volta - saida : null;
  const verba = Number(v?.verba_total) > 0 ? Number(v.verba_total) : null;
  return { linhas, lancou, totalOrcado, totalReal, diferenca: lancou ? totalReal - totalOrcado : null, kmRodado, kmOrcado: r?.temRota ? Number(r.km) : null, verba, contraVerba: verba !== null && lancou ? verba - totalReal : null };
}

const dif = (d: number | null) => (d === null ? '—' : <span className={d > 0.004 ? 'acn-txt-erro' : undefined}>{d > 0.004 ? '+' : ''}{fmtReais(d)}</span>);

export function BlocoFechamento({ v, set, pode, r, aoAnexarComprovante, aoTirarComprovante, subindoComprovante }: any) {
  const real = v.custo_real || {};
  const setReal = (chave: string, valor: any) => set('custo_real', { ...real, [chave]: valor });
  const c = compararComOOrcado(v, r);
  const semComprovante = itensSemComprovante(v);
  const rotuloDe = (k: string) => ITENS.find(i => i.chave === k)?.rotulo || k;
  return (
    <>
      <Parte titulo="VOLTA DA EQUIPE" quem="Adaptação" pode={pode.adaptacao}>
        <div className="acn-vg-grade">
          <CampoNumero rotulo="Km do carro na volta *" valor={v.km_volta} vazioNulo sufixo="km" ajuda="O km que o painel marca na chegada. É obrigatório para finalizar a viagem." onChange={(n: number | null) => set('km_volta', n)} />
          <div className="acn-vg-campo"><label className="acn-label">Km rodado</label>
            <div className="acn-vg-valor">{c.kmRodado !== null ? fmtKm(c.kmRodado) : '—'}</div>
            <div className="acn-ajuda">{c.kmOrcado !== null ? `A rota orçada tem ${fmtKm(c.kmOrcado)}.` : 'Sem rota calculada para comparar.'}</div></div>
        </div>
      </Parte>

      <Parte titulo="CUSTO REAL × ORÇADO" quem="Financeiro" pode={pode.financeiro}>
        <div className="acn-vg-grade">
          {ITENS.map(i => (
            <CampoNumero key={i.chave} rotulo={i.rotulo} valor={real[i.chave]} vazioNulo sufixo="R$" onChange={(n: number | null) => setReal(i.chave, n)} />
          ))}
          <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">Observações da prestação de contas</label>
            <input className="acn-input" aria-label="Observações da prestação de contas" placeholder="Ex.: pedágio pago em dinheiro, nota do hotel em anexo" value={real.observacao || ''} onChange={e => setReal('observacao', e.target.value)} /></div>
        </div>
        <table className="acn-tabela acn-vg-comparacao">
          <thead><tr><th>Item</th><th className="dir">Orçado</th><th className="dir">Real</th><th className="dir">Diferença</th><th>Comprovantes</th></tr></thead>
          <tbody>
            {c.linhas.map(l => (
              <tr key={l.chave}><td>{l.rotulo}</td><td className="dir acn-num">{fmtReais(l.orcado)}</td><td className="dir acn-num">{l.real === null ? '—' : fmtReais(l.real)}</td><td className="dir acn-num">{l.real === null ? '—' : dif(l.real - l.orcado)}</td>
                <td className="acn-vg-comprov">
                  {comprovantesDoItem(v, l.chave).map((cp: any) => {
                    const indice = (v.comprovantes || []).indexOf(cp);
                    return (
                      <span key={cp.path || indice} className="acn-vg-comprov-item">
                        <a href={cp.url} target="_blank" rel="noreferrer" title={cp.nome}><Icone path={mdiPaperclip} size={13} /> {cp.nome}</a>
                        {pode.financeiro && <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar o comprovante ${cp.nome}`} title="Tirar o comprovante" onClick={() => aoTirarComprovante(indice)} />}
                      </span>
                    );
                  })}
                  {pode.financeiro && v.id && <label className="acn-vg-anexar"><input type="file" multiple aria-label={`Anexar comprovante de ${l.rotulo}`} disabled={subindoComprovante} onChange={e => aoAnexarComprovante(l.chave, e)} /><span className="acn-b acn-b-secundario acn-b-p"><Icone path={mdiPaperclip} size={14} />{subindoComprovante ? 'Enviando…' : 'Anexar'}</span></label>}
                </td></tr>
            ))}
            <tr className="total"><td><strong>Total</strong></td><td className="dir acn-num"><strong>{fmtReais(c.totalOrcado)}</strong></td><td className="dir acn-num"><strong>{c.lancou ? fmtReais(c.totalReal) : '—'}</strong></td><td className="dir acn-num"><strong>{dif(c.diferenca)}</strong></td><td /></tr>
          </tbody>
        </table>
        {semComprovante.length > 0 && <Faixa tom="erro">Falta comprovante de: {semComprovante.map(rotuloDe).join(', ')}. Anexe a nota ou o recibo na linha de cada item.</Faixa>}
        <div className="acn-ajuda">O desgaste do veículo ({fmtReais(r.desgaste)}) é custo calculado, não sai dinheiro: fica fora desta comparação.
          {c.verba !== null && c.contraVerba !== null && <> Verba liberada: {fmtReais(c.verba)} — {c.contraVerba >= 0 ? `sobra ${fmtReais(c.contraVerba)}` : <span className="acn-txt-erro">faltou {fmtReais(-c.contraVerba)}</span>}.</>}</div>
      </Parte>
    </>
  );
}
