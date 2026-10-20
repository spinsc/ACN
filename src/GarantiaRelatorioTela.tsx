// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — a tela do relatório semanal (G6 do PLANO_GARANTIA.md, 20/10/2026)
// Dentro da aba Garantia do SAC, para a gerência e o Admin (decisão do usuário). Mostra e baixa em PDF o mesmo modelo de GarantiaRelatorio.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
import Icone from './Icone';
import { mostrarAviso } from './Feedback';
import { Botao, hojeISO } from './Interface';
import { montarRelatorio, semanaDe, somarDias } from './GarantiaRelatorio';
import { emitirRelatorioGarantia } from './GarantiaRelatorioPdf';
import { mdiFileChartOutline, mdiChevronLeft, mdiChevronRight, mdiFilePdfBox } from '@mdi/js';

export default function GarantiaRelatorioTela({ fichas, currentUser, onFechar }: any) {
  const hoje = hojeISO();
  const [dia, setDia] = useState(hoje);
  const [gerando, setGerando] = useState(false);
  const { inicio } = semanaDe(dia);
  const modelo = useMemo(() => montarRelatorio(fichas || [], dia, hoje, { emitidoPor: currentUser?.nome }), [fichas, dia, hoje, currentUser?.nome]);

  const baixar = async () => {
    if (gerando) return;
    setGerando(true);
    try { await emitirRelatorioGarantia(modelo); }
    catch (e: any) { mostrarAviso(`Não foi possível gerar o PDF (${e?.message || e}).`, 'erro'); }
    finally { setGerando(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-gar-jan acn-gar-rel" role="dialog" aria-label="Relatório semanal de garantia">
        <div className="acn-modal-cab"><span className="modal-title"><Icone path={mdiFileChartOutline} size={18} /> Relatório semanal de garantia</span></div>
        <div className="acn-modal-corpo">
          <div className="acn-gar-rel-semana">
            <Botao pequeno icone={mdiChevronLeft} aria-label="Semana anterior" onClick={() => setDia(somarDias(inicio, -7))}>Semana anterior</Botao>
            <strong data-rel-periodo>{modelo.periodo}</strong>
            <Botao pequeno aria-label="Semana seguinte" onClick={() => setDia(somarDias(inicio, 7))}>Semana seguinte <Icone path={mdiChevronRight} size={16} /></Botao>
            <Botao pequeno disabled={semanaDe(hoje).inicio === inicio} onClick={() => setDia(hoje)}>Esta semana</Botao>
            <input type="date" className="acn-input acn-gar-rel-dia" aria-label="Escolher um dia da semana" value={dia} onChange={e => { if (e.target.value) setDia(e.target.value); }} />
          </div>
          {modelo.criterio.map((c: string, i: number) => <div key={i} className="acn-ajuda">{c}</div>)}

          <div className="acn-kpis" data-rel-resumo>
            {modelo.resumo.map((r: any) => (
              <div key={r.rotulo} className={`acn-kpi${r.tom ? ' ' + r.tom : ''}`}>
                <div className="rot">{r.rotulo}</div>
                <div className="val">{r.valor}</div>
              </div>
            ))}
          </div>

          {modelo.secoes.map((s: any) => (
            <div key={s.id} className="acn-gar-secao" data-rel-secao={s.id}>
              <div className="acn-pdp-rotulo">{s.titulo}</div>
              {s.info && <div className="acn-ajuda">{s.info}</div>}
              {s.body.length === 0 ? <div className="acn-ajuda">{s.vazio}</div> : (
                <div className="acn-gar-tabela">
                  <table className="acn-tabela acn-densa">
                    <thead><tr>{s.head.map((h: string, i: number) => <th key={i} className={(s.colunasDir || []).includes(i) ? 'acn-dir' : ''}>{h}</th>)}</tr></thead>
                    <tbody>
                      {s.body.map((linha: any[], i: number) => (
                        <tr key={i}>{linha.map((c, j) => <td key={j} className={(s.colunasDir || []).includes(j) ? 'acn-dir' : ''}>{c}</td>)}</tr>
                      ))}
                      {s.rodape && <tr className="acn-gar-rel-total">{s.rodape.map((c: any, j: number) => <td key={j} className={(s.colunasDir || []).includes(j) ? 'acn-dir' : ''}><strong>{c}</strong></td>)}</tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="acn-modal-rodape">
          <Botao icone={mdiFilePdfBox} disabled={gerando} onClick={baixar}>{gerando ? 'Gerando…' : 'Baixar PDF'}</Botao>
          <Botao variante="primario" onClick={onFechar}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
