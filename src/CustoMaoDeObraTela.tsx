// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Relatório "Custo da mão de obra" (aba Relatórios) — horas instaladas e custo da hora por departamento, CLT e terceiros em quadros separados.
// Pedido do diretor, levado pelo usuário em 13/11/2026. As regras (jornada de 8h48, feriados, encargos, departamento) estão em CustoMaoDeObra.ts.
// Lê o cadastro do RH (salário e valor dos serviços): só quem tem a aba RH e a permissão "ver valores" chega aqui (o banco confere de novo: leitura recusada vira aviso, nunca relatório vazio).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { mdiPrinterOutline, mdiFileExcelOutline } from '@mdi/js';
import { supabase } from './supabaseClient';
import { Botao, Faixa, hojeISO } from './Interface';
import { lerDepartamentos, anexarDepartamentos } from './RhDepartamentos';
import {
  montarRelatorio, custoDaHora, custoComEncargos, lerEncargos, fmtHoras, fmtReais, JORNADA_TEXTO, JORNADA_HORAS_POR_DIA,
} from './CustoMaoDeObra';

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rotuloMes = (mes: string) => { const m = /^(\d{4})-(\d{2})$/.exec(mes || ''); return m ? `${NOMES_MES[+m[2] - 1]} de ${m[1]}` : 'o período'; };
const diaBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

function Indicadores({ itens }) {
  return (
    <div className="acn-kpis">
      {itens.map(k => (
        <div key={k.l} className="acn-kpi">
          <span className="rot"><i style={{ background: k.tom || 'var(--acn-neutral)' }} />{k.l}</span>
          <span className="val acn-num">{k.v}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustoMaoDeObraTela() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [encargosTxt, setEncargosTxt] = useState('0');
  const [funcs, setFuncs] = useState<any[]>([]);
  const [ordemDeptos, setOrdemDeptos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mostrarPessoas, setMostrarPessoas] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true); setErro('');
      const [r, d] = await Promise.all([supabase.from('rh_funcionarios').select('*').order('nome'), lerDepartamentos()]);
      if (!vivo) return;
      if (r.error) { setErro(r.error.message || 'o banco não respondeu'); setFuncs([]); setLoading(false); return; }
      // o cadastro do RH vem vazio para quem não tem a aba RH: aviso claro em vez de um relatório zerado
      if (!(r.data || []).length) { setErro('o cadastro do RH veio vazio (você precisa ter a aba RH para ver este relatório)'); setFuncs([]); setLoading(false); return; }
      if (d.erro) setErro('os departamentos não puderam ser lidos (' + d.erro + '): as pessoas aparecem no texto antigo do cadastro ou sem departamento');
      setOrdemDeptos((d.departamentos || []).map(x => x.nome));
      setFuncs(anexarDepartamentos(r.data || [], d.departamentos || [], d.vinculos || []));
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, []);

  const encargos = lerEncargos(encargosTxt);
  const pct = encargos ?? 0;
  const rel = useMemo(() => montarRelatorio(funcs, mes, ordemDeptos), [funcs, mes, ordemDeptos]);
  const labelMes = rotuloMes(mes);

  const baixarPlanilha = () => {
    if (!rel) return;
    const clt = rel.departamentos.filter(d => d.clt.pessoas).map(d => ({
      Departamento: d.departamento, Pessoas: d.clt.pessoas, 'Horas instaladas': Number(d.clt.horas.toFixed(1)),
      'Custo da folha (R$)': Number(d.clt.custo.toFixed(2)), 'R$/hora (folha)': custoDaHora(d.clt) === null ? '' : Number(custoDaHora(d.clt).toFixed(2)),
      [`Custo com ${pct}% de encargos (R$)`]: Number(custoComEncargos(d.clt, pct).toFixed(2)), 'R$/hora (com encargos)': custoDaHora(d.clt, pct) === null ? '' : Number(custoDaHora(d.clt, pct).toFixed(2)),
    }));
    const ter = rel.departamentos.filter(d => d.terceiro.pessoas).map(d => ({
      Departamento: d.departamento, Pessoas: d.terceiro.pessoas, 'Horas instaladas': Number(d.terceiro.horas.toFixed(1)),
      'Custo dos serviços (R$)': Number(d.terceiro.custo.toFixed(2)), 'R$/hora': custoDaHora(d.terceiro) === null ? '' : Number(custoDaHora(d.terceiro).toFixed(2)),
    }));
    const pes = rel.pessoas.map(l => ({
      Nome: l.nome, Tipo: l.tipo, Departamento: l.departamento, 'De': diaBR(l.de), 'Até': diaBR(l.ate), 'Dias úteis': l.diasUteis, 'Horas instaladas': Number(l.horas.toFixed(1)),
      'Custo do mês cheio (R$)': l.custoDoMes === null ? '' : l.custoDoMes, 'Custo no período (R$)': l.custoNoPeriodo === null ? '' : Number(l.custoNoPeriodo.toFixed(2)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clt), 'CLT');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ter), 'Terceiros');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pes), 'Pessoas');
    XLSX.writeFile(wb, `Custo_mao_de_obra_${mes}.xlsx`);
  };

  const totalHoras = rel ? rel.totalClt.horas + rel.totalTerceiro.horas : 0;
  const custoGeral = rel ? custoComEncargos(rel.totalClt, pct) + rel.totalTerceiro.custo : 0;
  const horasComCustoGeral = rel ? rel.totalClt.horasComCusto + rel.totalTerceiro.horasComCusto : 0;

  return (
    <div>
      <div className="sec-card">
        <div className="acn-filtros acn-filtros-campos">
          <div className="form-group">
            <label className="acn-label">Mês de referência</label>
            <input type="month" className="acn-input" value={mes} onChange={e => setMes(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="acn-label">Encargos sobre a folha CLT (%)</label>
            <input className="acn-input" inputMode="decimal" value={encargosTxt} onChange={e => setEncargosTxt(e.target.value)} placeholder="Ex.: 35" style={{ maxWidth: 140 }} />
          </div>
          <Botao variante="secundario" icone={mdiPrinterOutline} onClick={() => window.print()}>Imprimir</Botao>
          <Botao variante="secundario" icone={mdiFileExcelOutline} onClick={baixarPlanilha} disabled={!rel || loading || !!erro && !funcs.length}>Baixar planilha</Botao>
        </div>
      </div>

      {encargos === null && <Faixa tom="erro">O percentual de encargos precisa ser um número entre 0 e 300. Enquanto isso o relatório usa 0%.</Faixa>}
      {erro && <Faixa tom="erro">Não foi possível montar o relatório completo: {erro}.</Faixa>}

      {loading ? <div className="acn-empty">Carregando...</div> : !rel ? <div className="acn-empty">Escolha o mês de referência.</div> : !funcs.length ? null : (
        <>
          <Faixa tom="info">
            <strong>Horas instaladas</strong> são as horas que cada pessoa fica à disposição da empresa, pela jornada — não as horas apontadas em tarefa. Jornada: {JORNADA_TEXTO}.
            Em {labelMes} são <strong>{rel.diasUteisDoMes} dias úteis</strong> (sem feriados nacionais), ou seja, <strong>{fmtHoras(rel.horasPorPessoaNoMes)}</strong> por pessoa que ficou o mês inteiro.
            Quem entrou ou saiu no meio do mês conta só os dias em que esteve na empresa. Quem está em mais de um departamento conta inteiro no primeiro.
          </Faixa>

          {rel.semCusto.length > 0 && (
            <Faixa tom="erro">
              <strong>{rel.semCusto.length} pessoa(s) sem salário ou valor de serviços cadastrado no RH:</strong> {rel.semCusto.map(l => `${l.nome} (${l.tipo})`).join(', ')}.
              As horas delas aparecem no relatório, mas ficam FORA do custo da hora (senão o valor da hora cairia sem motivo). Preencha em RH → editar o colaborador.
            </Faixa>
          )}
          {rel.terceiroComSalario.length > 0 && (
            <Faixa tom="atencao">
              Terceiro(s) sem "Valor dos serviços", usei o salário que está no cadastro: {rel.terceiroComSalario.map(l => l.nome).join(', ')}.
            </Faixa>
          )}
          {rel.semDataDeEntrada.length > 0 && (
            <Faixa tom="atencao">
              {rel.semDataDeEntrada.length} pessoa(s) sem data de admissão foram contadas desde o começo do mês: {rel.semDataDeEntrada.map(l => l.nome).join(', ')}.
            </Faixa>
          )}
          {rel.desligadosSemData > 0 && (
            <Faixa tom="atencao">{rel.desligadosSemData} pessoa(s) desligada(s) sem data de desligamento ficaram de fora (não dá para saber até quando contar).</Faixa>
          )}

          <Indicadores itens={[
            { l: 'Horas instaladas (total)', v: fmtHoras(totalHoras), tom: 'var(--acn-brand)' },
            { l: 'Pessoas no mês', v: `${rel.totalClt.pessoas} CLT · ${rel.totalTerceiro.pessoas} terceiros` },
            { l: `Custo total (CLT com ${pct}% de encargos + terceiros)`, v: fmtReais(custoGeral) },
            { l: 'Custo da hora geral', v: horasComCustoGeral > 0 ? fmtReais(custoGeral / horasComCustoGeral) : '—', tom: 'var(--acn-ok)' },
          ]} />

          {/* CLT */}
          <div className="sec-card">
            <div className="sec-hdr"><span className="acn-forte">Funcionários (CLT) — {labelMes}</span></div>
            <div className="sec-body acn-rolagem">
              <table className="acn-tabela">
                <thead><tr>
                  <th>Departamento</th><th className="acn-dir">Pessoas</th><th className="acn-dir">Horas instaladas</th>
                  <th className="acn-dir">Custo da folha</th><th className="acn-dir">R$/hora (folha)</th>
                  <th className="acn-dir">Custo com {pct}% de encargos</th><th className="acn-dir">R$/hora (com encargos)</th>
                </tr></thead>
                <tbody>
                  {rel.departamentos.filter(d => d.clt.pessoas).map(d => (
                    <tr key={d.departamento}>
                      <td className="acn-forte">{d.departamento}</td>
                      <td className="acn-dir acn-num">{d.clt.pessoas}</td>
                      <td className="acn-dir acn-num">{fmtHoras(d.clt.horas)}</td>
                      <td className="acn-dir acn-num">{fmtReais(d.clt.custo)}</td>
                      <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(d.clt))}</td>
                      <td className="acn-dir acn-num">{fmtReais(custoComEncargos(d.clt, pct))}</td>
                      <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(d.clt, pct))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="acn-forte">Total CLT</td>
                    <td className="acn-dir acn-num acn-forte">{rel.totalClt.pessoas}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtHoras(rel.totalClt.horas)}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(rel.totalClt.custo)}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(rel.totalClt))}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(custoComEncargos(rel.totalClt, pct))}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(rel.totalClt, pct))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="acn-ajuda">A folha soma salário base, adicional de cargo de confiança, insalubridade, ajuda de custo e alimentação. Os encargos (INSS, FGTS, férias, 13º) não estão no cadastro: valem o percentual digitado acima.</div>
          </div>

          {/* Terceiros */}
          <div className="sec-card">
            <div className="sec-hdr"><span className="acn-forte">Terceiros — {labelMes}</span></div>
            <div className="sec-body acn-rolagem">
              <table className="acn-tabela">
                <thead><tr>
                  <th>Departamento</th><th className="acn-dir">Pessoas</th><th className="acn-dir">Horas instaladas</th>
                  <th className="acn-dir">Custo dos serviços</th><th className="acn-dir">R$/hora</th>
                </tr></thead>
                <tbody>
                  {rel.departamentos.filter(d => d.terceiro.pessoas).map(d => (
                    <tr key={d.departamento}>
                      <td className="acn-forte">{d.departamento}</td>
                      <td className="acn-dir acn-num">{d.terceiro.pessoas}</td>
                      <td className="acn-dir acn-num">{fmtHoras(d.terceiro.horas)}</td>
                      <td className="acn-dir acn-num">{fmtReais(d.terceiro.custo)}</td>
                      <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(d.terceiro))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="acn-forte">Total terceiros</td>
                    <td className="acn-dir acn-num acn-forte">{rel.totalTerceiro.pessoas}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtHoras(rel.totalTerceiro.horas)}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(rel.totalTerceiro.custo)}</td>
                    <td className="acn-dir acn-num acn-forte">{fmtReais(custoDaHora(rel.totalTerceiro))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="acn-ajuda">O custo do terceiro é o "Valor dos serviços" do cadastro, tratado como valor do mês, sem encargos.</div>
          </div>

          {/* Pessoas */}
          <div className="sec-card">
            <div className="sec-hdr">
              <span className="acn-forte">Pessoas contadas ({rel.pessoas.length})</span>
              <Botao pequeno variante="discreto" onClick={() => setMostrarPessoas(v => !v)}>{mostrarPessoas ? 'Esconder' : 'Mostrar'}</Botao>
            </div>
            {mostrarPessoas && (
              <div className="sec-body acn-rolagem">
                <table className="acn-tabela">
                  <thead><tr><th>Nome</th><th>Tipo</th><th>Departamento</th><th>De</th><th>Até</th><th className="acn-dir">Dias úteis</th><th className="acn-dir">Horas</th><th className="acn-dir">Custo do mês cheio</th><th className="acn-dir">Custo no período</th></tr></thead>
                  <tbody>
                    {rel.pessoas.map(l => (
                      <tr key={l.id}>
                        <td className="acn-forte">{l.nome}</td><td>{l.tipo}</td><td>{l.departamento}</td>
                        <td className="acn-fraco">{diaBR(l.de)}</td><td className="acn-fraco">{diaBR(l.ate)}</td>
                        <td className="acn-dir acn-num">{l.diasUteis}</td><td className="acn-dir acn-num">{fmtHoras(l.horas)}</td>
                        <td className="acn-dir acn-num">{fmtReais(l.custoDoMes)}</td><td className="acn-dir acn-num">{fmtReais(l.custoNoPeriodo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
