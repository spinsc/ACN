// @ts-nocheck
// Levantamento do histórico das notas (módulo fiscal, 27/11/2026): dentro do Conferidor de XML, a pessoa vê que operações as notas já emitidas mostram de fato, quanto pesa cada uma e onde o
// MESMO caso saiu de jeitos diferentes. É a lista concreta para levar à contabilidade ("estas são as situações que existem; qual o tratamento certo de cada?"). Só lê o que já está na tela:
// nada é gravado, a não ser que a pessoa peça o rascunho de regras (que entra "a confirmar", não vale para emitir). As regras que a regra de negócio manda confirmar continuam sendo da contabilidade.
import React, { useMemo, useState } from 'react';
import { mdiDownload, mdiFileDocumentEditOutline } from '@mdi/js';
import { Botao, Faixa, Selo, Chips } from './Interface';
import { confirmar } from './Feedback';
import { baixarPlanilha } from './ExportarPlanilha';
import { podeEditarCadastroFiscal } from './utils/permissoes';
import { ORIGENS_DE_NOTA } from './FiscalTiposDeNota';
import { levantar, propostasDoHistorico, coberturaDosMaiores, ROTULO_DO_DESTINO, ROTULO_DA_IE } from './FiscalLevantamento';
import { gravarPropostasNoRascunho } from './FiscalRegrasDados';
import './fiscal.css';

const LIMITE_NA_TELA = 200;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const aliquota = (v: number | null) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);
const nomeDaOperacao = (id: string) => ORIGENS_DE_NOTA.find(o => o.id === id)?.origem || id;

export default function FiscalLevantamentoTela({ notas, emitentes, canceladas, currentUser }) {
  const [tipoPorNatureza, setTipoPorNatureza] = useState<Record<string, string>>({});
  const [mostrar, setMostrar] = useState('todos');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: string; texto: string } | null>(null);

  const lev = useMemo(() => levantar(notas, { emitentes, canceladas }), [notas, emitentes, canceladas]);
  const prop = useMemo(() => propostasDoHistorico(lev, tipoPorNatureza), [lev, tipoPorNatureza]);
  const escolhidas = Object.values(tipoPorNatureza).filter(Boolean).length;
  const podeCriar = podeEditarCadastroFiscal(currentUser);

  const grupos = useMemo(() => lev.grupos.filter(g => mostrar === 'todos' || g.variacao), [lev, mostrar]);

  const exportar = async () => {
    const dest = (d: string) => ROTULO_DO_DESTINO[d] || d;
    await baixarPlanilha('Levantamento_do_historico_fiscal', [
      { nome: 'Operações', colunas: [{ rotulo: 'Empresa' }, { rotulo: 'Destino', largura: 18 }, { rotulo: 'IE do cliente', largura: 18 }, { rotulo: 'Natureza da operação', largura: 36 }, { rotulo: 'CFOP' }, { rotulo: 'CST/CSOSN' }, { rotulo: 'ICMS %' }, { rotulo: 'Benefício' }, { rotulo: 'Itens', formato: 'inteiro' }, { rotulo: 'Notas', formato: 'inteiro' }, { rotulo: 'Variou no mesmo caso?' }, { rotulo: 'Exemplos (nº da nota)', largura: 24 }, { rotulo: 'NCM mais comuns', largura: 30 }],
        linhas: lev.grupos.map(g => [g.emitente, dest(g.destino), ROTULO_DA_IE[g.indicador_ie] || g.indicador_ie, g.natureza, g.tratamento.cfop, g.tratamento.cst, g.tratamento.pICMS ?? '', g.tratamento.cBenef, g.itens, g.notas, g.variacao ? 'Sim' : 'Não', g.exemplos.join(', '), g.ncms.map(n => `${n.ncm} (${n.itens})`).join(', ')]) },
      { nome: 'Mesmo caso, tratamentos diferentes', colunas: [{ rotulo: 'Empresa' }, { rotulo: 'Destino', largura: 18 }, { rotulo: 'IE do cliente', largura: 18 }, { rotulo: 'Natureza da operação', largura: 36 }, { rotulo: 'CFOP' }, { rotulo: 'CST/CSOSN' }, { rotulo: 'ICMS %' }, { rotulo: 'Benefício' }, { rotulo: 'Itens', formato: 'inteiro' }, { rotulo: 'Notas', formato: 'inteiro' }],
        linhas: lev.variacoes.flatMap(v => v.tratamentos.map(t => [v.emitente, dest(v.destino), ROTULO_DA_IE[v.indicador_ie] || v.indicador_ie, v.natureza, t.cfop, t.cst, t.pICMS ?? '', t.cBenef, t.itens, t.notas])) },
      { nome: 'Naturezas', colunas: [{ rotulo: 'Natureza da operação', largura: 40 }, { rotulo: 'Grafias encontradas', largura: 50 }, { rotulo: 'Notas', formato: 'inteiro' }, { rotulo: 'Itens', formato: 'inteiro' }, { rotulo: 'Operação do sistema (escolhida)', largura: 50 }],
        linhas: lev.naturezas.map(n => [n.nome, n.grafias.join(' / '), n.notas, n.itens, tipoPorNatureza[n.chave] ? nomeDaOperacao(tipoPorNatureza[n.chave]) : '']) },
    ]);
  };

  const criarRascunho = async () => {
    if (ocupado || !podeCriar || !prop.propostas.length) return;
    if (!await confirmar(`Colocar ${prop.propostas.length} proposta(s) de regra num rascunho das regras fiscais?\n\nTodas entram "a confirmar": não valem para emitir e a versão não pode ser aprovada até a contabilidade confirmar cada uma. As que o rascunho já tem (mesmas condições) não são regravadas.\n\nÉ o que as notas antigas fizeram, não necessariamente o que está certo.`)) return;
    setOcupado(true); setAviso(null);
    const r = await gravarPropostasNoRascunho(prop.propostas, currentUser);
    setOcupado(false);
    if (!r.ok) { setAviso({ tom: 'erro', texto: `Falha ao montar o rascunho: ${r.erro}${r.gravadas ? ` Já entraram ${r.gravadas} proposta(s); é só repetir (as que já estão não são regravadas).` : ''}` }); return; }
    setAviso({ tom: 'ok', texto: `Rascunho ${r.criou ? 'aberto' : 'atualizado'}: ${r.gravadas} proposta(s) entraram${r.puladas ? `, ${r.puladas} já estava(m) lá` : ''}. Confira e confirme com a contabilidade em Cadastros fiscais › Regras.` });
  };

  if (!lev.consideradas) {
    return <Faixa tom="atencao">Nenhuma nota válida para levantar: {lev.canceladas ? `${lev.canceladas} cancelada(s)` : ''}{lev.naoAutorizadas ? ` ${lev.naoAutorizadas} não autorizada(s)` : ''}{!lev.canceladas && !lev.naoAutorizadas ? 'solte os XMLs das notas emitidas para começar' : ''}.</Faixa>;
  }

  return (
    <div>
      <div className="acn-ajuda">O que as notas já emitidas <strong>mostram</strong> que foi feito, agrupado por empresa, destino, inscrição do cliente e natureza da operação. Serve para levar à contabilidade uma lista concreta (&ldquo;estas situações existem; qual o tratamento certo de cada?&rdquo;). <strong>É o histórico, não a regra:</strong> nota antiga pode ter erro, e nada daqui vale para emitir. Nada é gravado enquanto você não pedir o rascunho.</div>

      <div className="acn-kpis">
        <div className="acn-kpi"><span className="rot">Notas levantadas</span><span className="val acn-num">{lev.consideradas}</span><span className="sub">{lev.canceladas} cancelada(s) e {lev.naoAutorizadas} não autorizada(s) ficaram de fora</span></div>
        <div className="acn-kpi"><span className="rot">Itens</span><span className="val acn-num">{lev.itens}</span><span className="sub">cada item pesa uma vez</span></div>
        <div className="acn-kpi"><span className="rot">Operações distintas</span><span className="val acn-num">{lev.grupos.length}</span><span className="sub">as 5 maiores cobrem {pct(coberturaDosMaiores(lev, 5))} dos itens</span></div>
        <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Casos que variaram</span><span className="val acn-num">{lev.variacoes.length}</span><span className="sub">o mesmo caso saiu de jeitos diferentes</span></div>
      </div>

      {lev.semEmitenteCadastrado > 0 && <Faixa tom="atencao">{lev.semEmitenteCadastrado} nota(s) são de empresa que não está no cadastro de emitentes: entram no levantamento, mas não viram proposta de regra.</Faixa>}

      <h3 className="acn-fcad-secao-tit">1. Naturezas de operação encontradas</h3>
      <p className="acn-fcad-dica">A natureza vem escrita à mão pelo Fiscal, então a mesma coisa aparece de várias formas (as grafias foram juntadas sem acento nem pontuação). Para cada uma, diga <strong>qual operação do sistema ela é</strong>: sem isso o sistema não propõe regra, porque a regra se liga à operação, não ao texto.</p>
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Natureza da operação</th><th>Notas</th><th>Itens</th><th>Acumulado</th><th>É a operação…</th></tr></thead>
          <tbody>
            {lev.naturezas.slice(0, LIMITE_NA_TELA).map(n => (
              <tr key={n.chave || 'vazia'}>
                <td><strong>{n.nome || '(sem natureza)'}</strong>{n.grafias.length > 1 && <div className="acn-fraco">{n.grafias.length} grafias: {n.grafias.slice(0, 3).join(' / ')}{n.grafias.length > 3 ? '…' : ''}</div>}</td>
                <td className="acn-fcad-num">{n.notas}</td>
                <td className="acn-fcad-num">{n.itens}</td>
                <td className="acn-fcad-num">{pct(n.acumulado)}</td>
                <td>
                  <select className="acn-input acn-flev-sel" aria-label={`Operação do sistema para a natureza ${n.nome || 'sem natureza'}`} value={tipoPorNatureza[n.chave] || ''}
                    onChange={e => { const v = e.target.value; setAviso(null); setTipoPorNatureza(t => ({ ...t, [n.chave]: v })); }}>
                    <option value="">— ainda não sei —</option>
                    {ORIGENS_DE_NOTA.map(o => <option key={o.id} value={o.id}>{o.origem}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="acn-fcad-secao-tit">2. Operações que existem de fato</h3>
      <div className="acn-fcad-barra">
        <Chips rotulo="Mostrar" ativo={mostrar} onChange={setMostrar} itens={[
          { id: 'todos', rotulo: 'Todas', contagem: lev.grupos.length },
          { id: 'variaram', rotulo: 'Só as que variaram', contagem: lev.grupos.filter(g => g.variacao).length },
        ]} />
        <Botao pequeno icone={mdiDownload} onClick={exportar}>Baixar planilha para a contabilidade</Botao>
      </div>
      {grupos.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando as {LIMITE_NA_TELA} maiores de {grupos.length}. A planilha leva todas.</Faixa>}
      <div className="acn-rolagem">
        <table className="acn-tabela acn-densa">
          <thead><tr><th>Empresa</th><th>Caso</th><th>CFOP</th><th>CST/CSOSN</th><th>ICMS</th><th>Benefício</th><th>Itens</th><th>Notas</th><th>Exemplos</th></tr></thead>
          <tbody>
            {grupos.slice(0, LIMITE_NA_TELA).map(g => (
              <tr key={g.chave}>
                <td className="acn-fcad-num"><strong>{g.emitente}</strong>{!g.emitenteCadastrado && <div className="acn-fraco">fora do cadastro</div>}</td>
                <td>{g.natureza || '(sem natureza)'}<div className="acn-fraco">{ROTULO_DO_DESTINO[g.destino] || g.destino} · {ROTULO_DA_IE[g.indicador_ie] || g.indicador_ie}{g.ncms.length ? ` · NCM ${g.ncms.map(n => n.ncm).join(', ')}` : ''}</div></td>
                <td className="acn-fcad-num"><strong>{g.tratamento.cfop || '—'}</strong></td>
                <td className="acn-fcad-num">{g.tratamento.cst || '—'}</td>
                <td className="acn-fcad-num">{aliquota(g.tratamento.pICMS)}</td>
                <td className="acn-fcad-num">{g.tratamento.cBenef || '—'}</td>
                <td className="acn-fcad-num">{g.itens}{g.variacao && <> <Selo familia="atencao" ponto={false} title="O mesmo caso (empresa, destino, IE e natureza) saiu com mais de um tratamento">variou</Selo></>}</td>
                <td className="acn-fcad-num">{g.notas}</td>
                <td className="acn-fcad-num acn-fraco">{g.exemplos.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="acn-fcad-secao-tit">3. Mesmo caso, tratamentos diferentes</h3>
      {!lev.variacoes.length ? <Faixa tom="ok">Nenhum caso saiu de jeitos diferentes: cada situação teve sempre o mesmo tratamento.</Faixa> : (
        <>
          <p className="acn-fcad-dica">Aqui está a pergunta mais valiosa para a contabilidade: em cada caso abaixo houve mais de um tratamento. Pode ser erro de nota, mudança de regra ao longo do tempo ou uma condição que o sistema ainda não conhece (o NCM, o tipo de órgão…).</p>
          <div className="acn-fcad-resultado">
            {lev.variacoes.slice(0, 40).map((v, i) => (
              <div key={i} className="acn-fcad-achado acn-fcad-achado-a">
                <Selo familia="atencao" ponto={false}>{v.tratamentos.length} jeitos</Selo>
                <span><strong>{v.emitente} · {ROTULO_DO_DESTINO[v.destino] || v.destino} · {ROTULO_DA_IE[v.indicador_ie] || v.indicador_ie} · {v.natureza || '(sem natureza)'}</strong>
                  <span className="acn-flev-trat">{v.tratamentos.map((t, j) => <span key={j}>CFOP {t.cfop || '—'} · CST {t.cst || '—'} · ICMS {aliquota(t.pICMS)}{t.cBenef ? ` · ${t.cBenef}` : ''}: <strong>{t.itens}</strong> item(ns)</span>)}</span></span>
              </div>
            ))}
          </div>
          {lev.variacoes.length > 40 && <p className="acn-fcad-dica">Mostrando os 40 maiores de {lev.variacoes.length}; a planilha leva todos.</p>}
        </>
      )}

      <h3 className="acn-fcad-secao-tit">4. Propostas de regra a partir do histórico</h3>
      {!escolhidas ? <Faixa tom="info">Escolha, na tabela 1, a operação do sistema de cada natureza para o sistema propor regras. Só propõe onde todas as notas do caso tiveram o mesmo tratamento.</Faixa> : (
        <>
          <div className="acn-kpis">
            <div className="acn-kpi"><span className="rot">Propostas</span><span className="val acn-num">{prop.propostas.length}</span><span className="sub">o histórico foi sempre igual nestes casos</span></div>
            <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Casos ambíguos</span><span className="val acn-num">{prop.ambiguas.length}</span><span className="sub">não viram proposta: falta uma condição</span></div>
          </div>
          {prop.propostas.length > 0 && (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-densa">
                <thead><tr><th>Quando</th><th>CFOP</th><th>CST/CSOSN</th><th>ICMS</th><th>Itens</th></tr></thead>
                <tbody>
                  {prop.propostas.slice(0, LIMITE_NA_TELA).map(p => (
                    <tr key={p.chave}>
                      <td>{p.form.rotulo.replace(/^Histórico: /, '')}</td>
                      <td className="acn-fcad-num"><strong>{p.resultado.cfop}</strong></td>
                      <td className="acn-fcad-num">{p.resultado.cst}</td>
                      <td className="acn-fcad-num">{aliquota(p.resultado.pICMS)}</td>
                      <td className="acn-fcad-num">{p.itens} em {p.notas} nota(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {prop.ambiguas.length > 0 && <Faixa tom="atencao"><div><strong>Casos ambíguos (o mesmo caso saiu de jeitos diferentes; ficam para a contabilidade decidir):</strong><ul className="acn-freg-lista">{prop.ambiguas.slice(0, 15).map(a => <li key={a.condicoes}>{a.condicoes}: {a.tratamentos} tratamentos em {a.itens} item(ns)</li>)}</ul></div></Faixa>}
          {prop.ignoradas.length > 0 && <p className="acn-fcad-dica">Ficaram de fora: {prop.ignoradas.map(i => `${i.itens} item(ns) — ${i.motivo}`).join('; ')}.</p>}
          {aviso && <Faixa tom={aviso.tom}>{aviso.texto}</Faixa>}
          <div className="acn-fcad-guardar">
            <div>
              <strong>Montar um rascunho das regras com estas propostas</strong>
              <p className="acn-fcad-dica">Entram em Cadastros fiscais › Regras como rascunho, todas &ldquo;a confirmar&rdquo; (sem fonte): não valem para emitir e a versão só pode ser aprovada depois que a contabilidade confirmar cada regra.</p>
            </div>
            <Botao variante="primario" icone={mdiFileDocumentEditOutline} disabled={!podeCriar || ocupado || !prop.propostas.length} onClick={criarRascunho}>{ocupado ? 'Montando…' : `Criar rascunho com ${prop.propostas.length} regra(s)`}</Botao>
          </div>
          {!podeCriar && <Faixa tom="info">Só quem tem a aba Fiscal monta o rascunho. Você pode ver o levantamento e baixar a planilha.</Faixa>}
        </>
      )}
    </div>
  );
}
