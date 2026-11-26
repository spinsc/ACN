// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// RH › RELÓGIO PONTO (20/11/2026, pedido do usuário): o lugar onde o RH cuida do ponto da equipe — o que a Secullum registrou, o que precisa ser tratado,
// as horas extras e quem está ligado a quem. Só leitura da cópia que a função `ponto-secullum` mantém (8h30, 20h30 e o botão "Atualizar ponto agora");
// o que se corrige (batida esquecida, falta com atestado, abono) se corrige na Secullum e aparece aqui na leitura seguinte.
//
// Seis partes: Hoje · A tratar · Mês · Horas extras · Horas lançadas · Vínculos. As regras de conta estão em PontoSecullum.ts e PontoRh.ts.
// As "Horas lançadas" são as que o RH digita à mão (RHTab.tsx, tabela rh_lancamentos): não se misturam com o ponto da Secullum, por isso vêm de fora (`horasLancadas`).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAbaNoEndereco } from './AbaNoEndereco';   // 26/11/2026 (Fase 5, parte 2): a visão tem endereço (#/<tela>/<visão>)
import { mdiRefresh, mdiDownload, mdiPlus } from '@mdi/js';
import { Chips, Botao, Faixa, Selo, hojeISO } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { departamentosTexto } from './RhDepartamentos';
import { Indicadores, Carregando, PontoDaPessoa } from './PontoTab';
import {
  lerPermissoes, lerMesesComDados, lerTotais, lerDiasDoMesDeTodos, lerUltimasRodadas, lerUsuariosAtivos, ligarUsuarioAFicha, atualizarPontoAgora,
  paresDoDia, situacaoDoDia, resumoDoMes, extrasDoMes, paraTexto, paraMinutos, rotuloDoDia, rotuloDoMes, primeiroDiaDoMes, quandoFoi, horasDesde, ehFimDeSemana,
  COLUNAS_DE_EXTRA, ROTULO_DA_EXTRA, HORAS_PARA_AVISAR_QUE_NAO_RODOU,
} from './PontoSecullum';
import {
  TIPOS_DE_OCORRENCIA, TIPO_DE_OCORRENCIA, ocorrenciasDoMes, contarOcorrencias, diasDoMes, celulaDoDia, diasDaPessoa, deveBaterPonto, cpfMascarado,
  possivelParNaSecullum, ligacaoDoUsuario, usuariosParecidos, situacaoNaSecullum, paraCsv, proximaAtualizacao,
} from './PontoRh';
import './ponto.css';

const nome = (p: any) => String(p?.nome || '(sem nome)');
const porNome = (a: any, b: any) => nome(a).localeCompare(nome(b), 'pt-BR');
const textoDosPares = (pares) => pares.length ? pares.map(p => `${p.entrada || '—'} – ${p.saida || '…'}`).join(' · ') : '—';
const dataBr = (iso: string) => String(iso || '').slice(0, 10).split('-').reverse().join('/');

function baixarPlanilha(arquivo: string, cabecalho: string[], linhas: any[][]) {
  const url = URL.createObjectURL(new Blob([paraCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = arquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** O mês de todos: totais por pessoa + o dia a dia, lidos uma vez e usados pelas partes Mês, A tratar e Horas extras. */
function usePontoDoMes(mes: string, versao: number) {
  const [e, setE] = useState({ carregando: true, erro: '', totais: new Map(), dias: [], porPessoa: new Map() });
  useEffect(() => {
    let vivo = true;
    setE(x => ({ ...x, carregando: true }));
    (async () => {
      const [t, d] = await Promise.all([lerTotais(mes), lerDiasDoMesDeTodos(mes)]);
      if (!vivo) return;
      const porPessoa = new Map();
      for (const x of d.dados) { const m = porPessoa.get(x.rh_id) || new Map(); m.set(String(x.dia).slice(0, 10), x.valores); porPessoa.set(x.rh_id, m); }
      setE({ carregando: false, erro: t.erro || d.erro || '', totais: new Map(t.dados.map(x => [x.rh_id, x])), dias: d.dados, porPessoa });
    })();
    return () => { vivo = false; };
  }, [mes, versao]);
  return e;
}

const LinkPessoa = ({ p, onClick }) => <button type="button" className="acn-ponto-link" onClick={onClick}>{nome(p)}</button>;
const SecaoTitulo = ({ children, dica }) => <h3 className="acn-ponto-secao" title={dica}>{children}</h3>;

// ── Hoje ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PESO = { ainda_nao_bateu: 0, incompleto: 1, sem_batida: 1, falta: 1, sem_leitura: 1, trabalhando: 2, saiu: 3, completo: 3, justificado: 4, marcado: 5, sem_jornada: 6, sem_dados: 7 };
function VisaoHoje({ devem, dados, hoje, semParIds, abrir }) {
  const [filtro, setFiltro] = useState('todos');
  const linhas = useMemo(() => devem.map(p => {
    const v = dados.porPessoa.get(p.id)?.get(hoje);
    const sit = v ? situacaoDoDia(v, hoje, hoje)
      : semParIds.includes(p.id) ? { id: 'sem_leitura', rotulo: 'CPF não achado na Secullum', familia: 'erro', dica: 'Sem o CPF achado na Secullum não há ponto para ler: ver a parte Vínculos.' }
      : { id: 'sem_dados', rotulo: 'Sem dados do dia', familia: 'neutro', dica: 'A Secullum ainda não devolveu o dia de hoje para esta pessoa (vale depois da próxima leitura).' };
    return { p, v, sit };
  }).sort((a, b) => (PESO[a.sit.id] ?? 8) - (PESO[b.sit.id] ?? 8) || porNome(a.p, b.p)), [devem, dados, hoje, semParIds]);
  const grupo = (l) => ['trabalhando'].includes(l.sit.id) ? 'trabalhando' : ['saiu', 'completo'].includes(l.sit.id) ? 'saiu' : l.sit.id === 'ainda_nao_bateu' ? 'nao_bateu' : 'outros';
  const conta = (g) => linhas.filter(l => grupo(l) === g).length;
  const vistas = filtro === 'todos' ? linhas : linhas.filter(l => grupo(l) === filtro);
  if (!devem.length) return <Faixa tom="info">Nenhum CLT da Detech ativo no cadastro do RH.</Faixa>;
  return (
    <>
      <Indicadores itens={[
        { l: 'Trabalhando agora', v: conta('trabalhando'), tom: 'info', dica: 'Bateram a entrada e ainda não a saída' },
        { l: 'Já saíram', v: conta('saiu'), tom: 'ok' },
        { l: 'Ainda não bateram', v: conta('nao_bateu'), tom: conta('nao_bateu') ? 'atencao' : undefined, dica: 'Têm jornada prevista hoje e ainda não bateram o ponto' },
        { l: 'Folga, férias, sem jornada ou sem leitura', v: conta('outros') },
      ]} />
      <Chips ativo={filtro} onChange={setFiltro} rotulo="Quem mostrar" itens={[
        { id: 'todos', rotulo: 'Todos', contagem: linhas.length }, { id: 'nao_bateu', rotulo: 'Ainda não bateram', contagem: conta('nao_bateu') },
        { id: 'trabalhando', rotulo: 'Trabalhando', contagem: conta('trabalhando') }, { id: 'saiu', rotulo: 'Já saíram', contagem: conta('saiu') }, { id: 'outros', rotulo: 'Outros', contagem: conta('outros') },
      ]} />
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela">
          <thead><tr><th>Pessoa</th><th>Departamento</th><th className="num">Jornada de hoje</th><th>Batidas de hoje</th><th>Situação</th></tr></thead>
          <tbody>
            {vistas.map(({ p, v, sit }) => (
              <tr key={p.id} className={sit.familia === 'erro' ? 'acn-linha-alerta' : ''}>
                <td><LinkPessoa p={p} onClick={() => abrir(p)} /></td>
                <td>{departamentosTexto(p) || '—'}</td>
                <td className="num">{v?.['Carga'] || '—'}</td>
                <td className="num">{v ? textoDosPares(paresDoDia(v)) : '—'}</td>
                <td><Selo familia={sit.familia} title={sit.dica}>{sit.rotulo}</Selo></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="acn-ponto-rodape">A Secullum só entrega o que foi batido até a última leitura. Hoje nunca conta como falta: o dia ainda não acabou.</p>
    </>
  );
}

// ── A tratar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function VisaoTratar({ ocorrencias, pessoas, mes, abrir }) {
  const [filtro, setFiltro] = useState('ajusta');
  const [pessoaId, setPessoaId] = useState('');
  const c = useMemo(() => contarOcorrencias(ocorrencias), [ocorrencias]);
  const daPessoa = pessoaId ? ocorrencias.filter(o => o.rhId === pessoaId) : ocorrencias;
  const vistas = daPessoa.filter(o => filtro === 'todas' ? true : filtro === 'ajusta' ? TIPO_DE_OCORRENCIA[o.tipo].ajusta : o.tipo === filtro);
  const quem = useMemo(() => [...new Set(ocorrencias.map(o => o.rhId))].map(id => pessoas.get(id)).filter(Boolean).sort(porNome), [ocorrencias, pessoas]);
  const baixar = () => baixarPlanilha(`ocorrencias_ponto_${mes.slice(0, 7)}.csv`, ['Data', 'Pessoa', 'Departamento', 'Ocorrência', 'Detalhe'],
    vistas.map(o => [dataBr(o.dia), nome(pessoas.get(o.rhId)), departamentosTexto(pessoas.get(o.rhId) || {}), TIPO_DE_OCORRENCIA[o.tipo].rotulo, o.detalhe]));
  return (
    <>
      <Indicadores itens={[
        { l: 'A ajustar na Secullum', v: c.ajusta, tom: c.ajusta ? 'erro' : 'ok', dica: 'Batida incompleta, sem batida e falta: alguém precisa corrigir ou justificar' },
        { l: 'Batidas incompletas', v: c.incompleto, tom: c.incompleto ? 'erro' : undefined },
        { l: 'Sem batida', v: c.sem_batida, tom: c.sem_batida ? 'erro' : undefined },
        { l: 'Faltas', v: c.falta, tom: c.falta ? 'erro' : undefined },
        { l: 'Atrasos', v: c.atraso, tom: c.atraso ? 'atencao' : undefined },
        { l: 'Dias com hora extra', v: c.extra, tom: c.extra ? 'info' : undefined },
      ]} />
      <Faixa tom="info">
        Como tratar: o sistema só mostra o ponto, a correção é feita na Secullum — incluir a batida que faltou, lançar o atestado ou o abono, ou aceitar a falta. Depois da próxima leitura
        (8h30, 20h30 ou "Atualizar ponto agora") a ocorrência some desta lista. O dia de hoje não entra: só os dias que já terminaram.
      </Faixa>
      <div className="acn-ponto-filtros">
        <Chips ativo={filtro} onChange={setFiltro} rotulo="Tipo de ocorrência" itens={[
          { id: 'ajusta', rotulo: 'Precisam de ajuste', contagem: c.ajusta },
          ...TIPOS_DE_OCORRENCIA.map(t => ({ id: t.id, rotulo: t.rotulo, contagem: c[t.id], titulo: t.dica })),
          { id: 'todas', rotulo: 'Todas', contagem: ocorrencias.length },
        ]} />
        <select className="acn-input acn-ponto-pessoa" value={pessoaId} onChange={e => setPessoaId(e.target.value)} aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {quem.map(p => <option key={p.id} value={p.id}>{nome(p)}</option>)}
        </select>
        <Botao pequeno icone={mdiDownload} onClick={baixar} disabled={!vistas.length}>Baixar planilha</Botao>
      </div>
      {!vistas.length ? (
        <Faixa tom="ok">{ocorrencias.length ? 'Nada neste filtro.' : `Nenhuma ocorrência em ${rotuloDoMes(mes)}.`}</Faixa>
      ) : (
        <div className="acn-ponto-rolagem">
          <table className="acn-tabela acn-compacta">
            <thead><tr><th>Data</th><th>Pessoa</th><th>Departamento</th><th>Ocorrência</th><th>Detalhe</th></tr></thead>
            <tbody>
              {vistas.map((o, i) => {
                const p = pessoas.get(o.rhId), t = TIPO_DE_OCORRENCIA[o.tipo];
                return (
                  <tr key={`${o.rhId}${o.dia}${o.tipo}${i}`} className={t.ajusta ? 'acn-linha-alerta' : ''}>
                    <td className="acn-ponto-dia">{rotuloDoDia(o.dia)}</td>
                    <td><LinkPessoa p={p} onClick={() => abrir(p)} /></td>
                    <td>{departamentosTexto(p || {}) || '—'}</td>
                    <td><Selo familia={t.familia} title={t.dica}>{t.rotulo}</Selo></td>
                    <td>{o.detalhe}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Mês: a grade e os totais ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const LETRA_DO_DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
function VisaoMes({ devem, dados, ocorrencias, mes, hoje, abrir }) {
  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const linhas = useMemo(() => devem.filter(p => dados.totais.has(p.id) || dados.porPessoa.has(p.id)).map(p => {
    const t = dados.totais.get(p.id);
    const lista = [...(dados.porPessoa.get(p.id) || new Map()).entries()].map(([dia, valores]) => ({ dia, valores }));
    return { p, r: resumoDoMes(t?.valores), d: diasDaPessoa(lista, hoje), ajustes: ocorrencias.filter(o => o.rhId === p.id && TIPO_DE_OCORRENCIA[o.tipo].ajusta).length };
  }), [devem, dados, ocorrencias, hoje]);
  if (!linhas.length) return <Faixa tom="info">Não há ponto guardado de {rotuloDoMes(mes)}.</Faixa>;
  const soma = (f) => linhas.reduce((s, l) => s + f(l), 0);
  const ate = [...dados.totais.values()].reduce((m, t) => (t.ate_dia > m ? t.ate_dia : m), '');
  const baixar = () => baixarPlanilha(`ponto_equipe_${mes.slice(0, 7)}.csv`,
    ['Pessoa', 'Departamento', 'Dias trabalhados', 'Horas normais', 'Horas extras', 'Faltas', 'Atrasos', 'Saldo do banco de horas', 'Ocorrências a ajustar'],
    linhas.map(l => [nome(l.p), departamentosTexto(l.p), l.d.trabalhados, paraTexto(l.r.normais), paraTexto(l.r.extras), paraTexto(l.r.faltas), paraTexto(l.r.atrasos), paraTexto(l.r.bancoSaldo, true), l.ajustes]));
  return (
    <>
      <Indicadores itens={[
        { l: 'Pessoas com ponto', v: linhas.length },
        { l: 'Horas normais', v: paraTexto(soma(l => l.r.normais)), tom: 'ok' },
        { l: 'Horas extras', v: paraTexto(soma(l => l.r.extras)), tom: soma(l => l.r.extras) ? 'atencao' : undefined },
        { l: 'Faltas', v: paraTexto(soma(l => l.r.faltas)), tom: soma(l => l.r.faltas) ? 'erro' : undefined },
        { l: 'Atrasos', v: paraTexto(soma(l => l.r.atrasos)), tom: soma(l => l.r.atrasos) ? 'atencao' : undefined },
        { l: 'Dias a ajustar', v: soma(l => l.ajustes), tom: soma(l => l.ajustes) ? 'erro' : 'ok' },
      ]} />
      <p className="acn-ponto-rodape acn-ponto-topo">{rotuloDoMes(mes)}, totais até {dataBr(ate)}.</p>

      <SecaoTitulo dica="Uma linha por pessoa, uma coluna por dia. Passe o mouse numa célula para ver o dia; clique para abrir o mês da pessoa.">Mês dia a dia</SecaoTitulo>
      <div className="acn-ponto-legenda" aria-hidden="true">
        <span><i className="acn-ponto-cel" data-acn-familia="ok" />Completo (hora da entrada)</span>
        <span><i className="acn-ponto-cel" data-acn-familia="erro" />A ajustar (!)</span>
        <span><i className="acn-ponto-cel" data-acn-familia="info" />Hoje</span>
        <span><i className="acn-ponto-cel" data-acn-familia="neutro" />Folga, férias ou abono</span>
        <span><i className="acn-ponto-cel vazio" />Sem jornada ou dia que ainda vem</span>
      </div>
      <div className="acn-ponto-rolagem">
        <table className="acn-ponto-grade">
          <thead>
            <tr>
              <th className="acn-ponto-grade-nome">Pessoa</th>
              {dias.map(d => {
                const w = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))).getDay();
                return <th key={d} className={(ehFimDeSemana(d) ? 'fds ' : '') + (d === hoje ? 'hoje' : '')} title={rotuloDoDia(d)}><span>{d.slice(8)}</span><em>{LETRA_DO_DIA[w]}</em></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ p }) => (
              <tr key={p.id}>
                <th className="acn-ponto-grade-nome"><LinkPessoa p={p} onClick={() => abrir(p)} /></th>
                {dias.map(d => {
                  const c = celulaDoDia(d, dados.porPessoa.get(p.id)?.get(d) || null, hoje);
                  return (
                    <td key={d}>
                      <button type="button" className={'acn-ponto-cel' + (c.familia === 'vazio' ? ' vazio' : '') + (d === hoje ? ' hoje' : '')} data-acn-familia={c.familia === 'vazio' ? undefined : c.familia}
                        title={`${rotuloDoDia(d)} · ${nome(p)} · ${c.titulo}`} onClick={() => abrir(p)}>{c.texto}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="acn-ponto-secao-linha">
        <SecaoTitulo>Totais do mês por pessoa</SecaoTitulo>
        <Botao pequeno icone={mdiDownload} onClick={baixar}>Baixar planilha</Botao>
      </div>
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela">
          <thead><tr><th>Pessoa</th><th>Departamento</th><th className="num">Dias trabalhados</th><th className="num">Normais</th><th className="num">Extras</th><th className="num">Faltas</th><th className="num">Atrasos</th><th className="num">Banco de horas</th><th className="num">A ajustar</th></tr></thead>
          <tbody>
            {linhas.map(({ p, r, d, ajustes }) => (
              <tr key={p.id}>
                <td><LinkPessoa p={p} onClick={() => abrir(p)} /></td>
                <td>{departamentosTexto(p) || '—'}</td>
                <td className="num">{d.trabalhados}</td>
                <td className="num">{paraTexto(r.normais)}</td>
                <td className="num">{r.extras ? paraTexto(r.extras) : '—'}</td>
                <td className={'num' + (r.faltas ? ' acn-ponto-negativo' : '')}>{r.faltas ? paraTexto(r.faltas) : '—'}</td>
                <td className="num">{r.atrasos ? paraTexto(r.atrasos) : '—'}</td>
                <td className={'num' + (r.bancoSaldo < 0 ? ' acn-ponto-negativo' : '')}>{paraTexto(r.bancoSaldo, true)}</td>
                <td className={'num' + (ajustes ? ' acn-ponto-negativo' : '')}>{ajustes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="acn-ponto-rodape">Os valores são os que a Secullum calculou: o sistema não refaz a conta. No mês em andamento os totais somam os dias até ontem.</p>
    </>
  );
}

// ── Horas extras ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function VisaoExtras({ devem, dados, mes, hoje, abrir }) {
  const [aberta, setAberta] = useState('');
  const linhas = useMemo(() => devem.map(p => {
    const t = dados.totais.get(p.id);
    const dias = [...(dados.porPessoa.get(p.id) || new Map()).entries()].filter(([dia, v]) => dia < hoje && extrasDoMes(v).total > 0).map(([dia, v]) => ({ dia, v, ex: extrasDoMes(v), pares: paresDoDia(v) })).sort((a, b) => a.dia.localeCompare(b.dia));
    return { p, ex: extrasDoMes(t?.valores), dias };
  }).filter(l => l.ex.total !== 0).sort((a, b) => b.ex.total - a.ex.total), [devem, dados, hoje]);
  const colunas = COLUNAS_DE_EXTRA.filter(c => linhas.some(l => l.ex.partes.some(x => x.coluna === c)));
  const total = linhas.reduce((s, l) => s + l.ex.total, 0);
  const porDepto = useMemo(() => {
    const m = new Map();
    for (const l of linhas) { const d = departamentosTexto(l.p) || 'Sem departamento'; m.set(d, (m.get(d) || 0) + l.ex.total); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [linhas]);
  if (dados.totais.size === 0) return <Faixa tom="info">Não há ponto guardado de {rotuloDoMes(mes)}.</Faixa>;
  if (!linhas.length) return <Faixa tom="ok">Ninguém tem hora extra em {rotuloDoMes(mes)}.</Faixa>;
  const baixar = () => baixarPlanilha(`horas_extras_${mes.slice(0, 7)}.csv`, ['Pessoa', 'Departamento', ...colunas.map(c => ROTULO_DA_EXTRA[c] || c), 'Total', 'Dias com extra'],
    linhas.map(l => [nome(l.p), departamentosTexto(l.p), ...colunas.map(c => { const x = l.ex.partes.find(y => y.coluna === c); return x ? paraTexto(x.min) : ''; }), paraTexto(l.ex.total), l.dias.length]));
  return (
    <>
      <Indicadores itens={[
        { l: 'Total de horas extras', v: paraTexto(total), tom: 'atencao' },
        { l: 'Pessoas com extra', v: linhas.length },
        { l: 'Maior total', v: paraTexto(linhas[0].ex.total), dica: nome(linhas[0].p) },
        { l: 'Dias com extra', v: linhas.reduce((s, l) => s + l.dias.length, 0), dica: 'Soma dos dias que já terminaram' },
      ]} />
      <div className="acn-ponto-secao-linha">
        <SecaoTitulo>{rotuloDoMes(mes)}</SecaoTitulo>
        <Botao pequeno icone={mdiDownload} onClick={baixar}>Baixar planilha</Botao>
      </div>
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela">
          <thead><tr><th>Pessoa</th><th>Departamento</th>{colunas.map(c => <th key={c} className="num">{ROTULO_DA_EXTRA[c] || c}</th>)}<th className="num">Total</th><th className="num">Dias</th><th></th></tr></thead>
          <tbody>
            {linhas.flatMap(l => {
              const abertaAqui = aberta === l.p.id;
              const base = (
                <tr key={l.p.id}>
                  <td><LinkPessoa p={l.p} onClick={() => abrir(l.p)} /></td>
                  <td>{departamentosTexto(l.p) || '—'}</td>
                  {colunas.map(c => { const x = l.ex.partes.find(y => y.coluna === c); return <td key={c} className="num">{x ? paraTexto(x.min) : '—'}</td>; })}
                  <td className="num"><strong>{paraTexto(l.ex.total)}</strong></td>
                  <td className="num">{l.dias.length}</td>
                  <td><Botao pequeno variante="discreto" onClick={() => setAberta(abertaAqui ? '' : l.p.id)} disabled={!l.dias.length}>{abertaAqui ? 'Fechar dias' : 'Ver dias'}</Botao></td>
                </tr>
              );
              if (!abertaAqui) return [base];
              return [base, (
                <tr key={l.p.id + 'd'} className="acn-linha-inativa-detalhe">
                  <td colSpan={colunas.length + 5}>
                    <ul className="acn-ponto-dias-extra">
                      {l.dias.map(d => <li key={d.dia}><strong>{rotuloDoDia(d.dia)}</strong> · {paraTexto(d.ex.total)}{d.ex.partes.length > 1 ? ` (${d.ex.partes.map(p => `${p.rotulo} ${paraTexto(p.min)}`).join(', ')})` : ''} · batidas {textoDosPares(d.pares)}</li>)}
                    </ul>
                  </td>
                </tr>
              )];
            })}
            <tr className="acn-linha-total"><td>Total da equipe</td><td></td>{colunas.map(c => <td key={c} className="num">{paraTexto(linhas.reduce((s, l) => s + (l.ex.partes.find(y => y.coluna === c)?.min || 0), 0))}</td>)}<td className="num">{paraTexto(total)}</td><td className="num">{linhas.reduce((s, l) => s + l.dias.length, 0)}</td><td></td></tr>
          </tbody>
        </table>
      </div>
      {porDepto.length > 1 && (
        <>
          <SecaoTitulo>Por departamento</SecaoTitulo>
          <div className="acn-ponto-rolagem acn-ponto-estreita">
            <table className="acn-tabela acn-compacta">
              <thead><tr><th>Departamento</th><th className="num">Horas extras</th></tr></thead>
              <tbody>{porDepto.map(([d, m]) => <tr key={d}><td>{d}</td><td className="num">{paraTexto(m)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <p className="acn-ponto-rodape">São as horas extras que a Secullum calculou pelas batidas. Não são as horas lançadas à mão (parte "Horas lançadas") nem o pedido de hora extra das tarefas: os três ainda são separados.</p>
    </>
  );
}

// ── Vínculos: quem está ligado a quem ────────────────────────────────────────────────────────────────────────────────────────────────────
function VisaoVinculos({ funcionarios, devem, dados, rodadas, usuarios, abrirFicha, aoMudar, usuario }) {
  const [gravando, setGravando] = useState('');
  const [aviso, setAviso] = useState(null);
  const ultima = rodadas.find(r => r.terminada_em && r.detalhes);
  const semParIds = ultima?.detalhes?.sem_par || [];
  const paresDaSecullum = new Map((ultima?.detalhes?.pares || []).map(x => [x.rh_id, x.nome]));
  const soNaLista = Array.isArray(ultima?.detalhes?.so_na_secullum_lista) ? ultima.detalhes.so_na_secullum_lista : null;
  const idsComPonto = useMemo(() => new Set([...dados.totais.keys()]), [dados]);
  const naoDetech = funcionarios.filter(f => f.ativo && f.tipo_colaborador === 'Funcionário' && !deveBaterPonto(f) && !f.nao_bate_ponto);
  const naoBatem = funcionarios.filter(f => f.ativo && f.tipo_colaborador === 'Funcionário' && f.nao_bate_ponto);   // 25/11/2026: marcados pelo RH na ficha

  const linhas = useMemo(() => devem.map(p => ({
    p, sec: situacaoNaSecullum(p, semParIds, idsComPonto), lig: ligacaoDoUsuario(p, usuarios), nomeNaSecullum: paresDaSecullum.get(p.id) || '',
    pista: semParIds.includes(p.id) && soNaLista ? possivelParNaSecullum(p.nome, soNaLista) : null,
  })), [devem, usuarios, semParIds, idsComPonto, ultima]);
  // quem usa cada usuário, para não ligar duas fichas ao mesmo usuário (o banco só abre o "Meu ponto" quando há uma ficha só)
  const usadoPor = useMemo(() => { const m = new Map(); linhas.forEach(l => { if (l.lig.usuario) m.set(l.lig.usuario.id, l.p); }); return m; }, [linhas]);
  const pendentes = linhas.filter(l => l.sec.id !== 'ok' || !l.lig.usuario).length;

  const ligar = async (l, usuarioId) => {
    const alvo = usuarios.find(u => u.id === usuarioId);
    if (!alvo) return;
    const outra = usadoPor.get(alvo.id);
    if (outra && outra.id !== l.p.id) { setAviso({ tom: 'erro', texto: `${alvo.nome} já está ligado(a) à ficha de ${nome(outra)}: o "Meu ponto" só abre quando há uma ficha por usuário. Desfaça a outra ligação antes.` }); return; }
    if (!await confirmar(`Ligar a ficha de "${nome(l.p)}" ao usuário "${alvo.nome}"?\n\nÉ com essa ligação que ${nome(l.p).split(' ')[0]} abre o próprio ponto na tela Ponto. Dá para desfazer depois.`)) return;
    setGravando(l.p.id); setAviso(null);
    const r = await ligarUsuarioAFicha(l.p.id, alvo.id);
    setGravando('');
    if (!r.ok) { setAviso({ tom: 'erro', texto: `Não foi possível ligar: ${r.erro}` }); return; }
    logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: l.p.id, changeType: 'UPDATE', oldRow: l.p, newRow: { ...l.p, usuario_id: alvo.id }, user: usuario });
    setAviso({ tom: 'ok', texto: `${nome(l.p)} agora está ligado(a) ao usuário ${alvo.nome}.` });
    aoMudar();
  };
  const desligar = async (l) => {
    if (!await confirmar(`Desfazer a ligação manual de "${nome(l.p)}" com o usuário?\n\nO sistema volta a procurar pelo e-mail e pelo nome da ficha.`)) return;
    setGravando(l.p.id); setAviso(null);
    const r = await ligarUsuarioAFicha(l.p.id, null);
    setGravando('');
    if (!r.ok) { setAviso({ tom: 'erro', texto: `Não foi possível desfazer: ${r.erro}` }); return; }
    logChange({ module: 'rh', entityType: 'rh_funcionarios', entityId: l.p.id, changeType: 'UPDATE', oldRow: l.p, newRow: { ...l.p, usuario_id: null }, user: usuario });
    setAviso({ tom: 'ok', texto: `A ligação manual de ${nome(l.p)} foi desfeita.` });
    aoMudar();
  };

  return (
    <>
      <Faixa tom="info">
        <strong>Como o sistema liga cada pessoa.</strong> (1) <em>Ficha do RH ↔ Secullum:</em> pelo <strong>CPF</strong> (11 dígitos, igual nos dois lados); nome, e-mail e matrícula não entram nessa conta,
        por isso a pessoa certa só é achada se o CPF da ficha estiver certo. (2) <em>Ficha do RH ↔ usuário do sistema</em> (é o que abre o "Meu ponto"): primeiro a ligação feita à mão aqui, depois o
        <strong> e-mail</strong> da ficha, depois o <strong>nome inteiro</strong>; só vale quando acha um único usuário. (3) Só entram os <strong>CLT ativos da Detech</strong>; os da ACN não batem ponto na Secullum.
      </Faixa>
      {aviso && <Faixa tom={aviso.tom}>{aviso.texto}</Faixa>}
      <Indicadores itens={[
        { l: 'CLT da Detech', v: linhas.length },
        { l: 'Ligadas à Secullum', v: linhas.filter(l => l.sec.id === 'ok').length, tom: 'ok' },
        { l: 'Com problema no CPF', v: linhas.filter(l => l.sec.id === 'sem_cpf' || l.sec.id === 'sem_par').length, tom: linhas.some(l => l.sec.id === 'sem_cpf' || l.sec.id === 'sem_par') ? 'erro' : undefined },
        { l: 'Sem usuário ligado', v: linhas.filter(l => !l.lig.usuario).length, tom: linhas.some(l => !l.lig.usuario) ? 'atencao' : undefined, dica: 'Quem não tem usuário ligado não consegue abrir o próprio "Meu ponto"' },
      ]} />
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela">
          <thead><tr><th>Pessoa (ficha do RH)</th><th>CPF da ficha</th><th>Na Secullum</th><th>Usuário do sistema</th><th>Ligar ao usuário</th></tr></thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.p.id} className={l.sec.familia === 'erro' ? 'acn-linha-alerta' : ''}>
                <td>
                  <button type="button" className="acn-ponto-link" onClick={() => abrirFicha(l.p)} title="Abrir a ficha para corrigir CPF, e-mail ou nome">{nome(l.p)}</button>
                  <div className="acn-ponto-sub">{l.p.empresa || 'empresa não informada'}{l.p.email ? '' : ' · sem e-mail na ficha'}</div>
                </td>
                <td className="num">{cpfMascarado(l.p.cpf)}</td>
                <td>
                  <Selo familia={l.sec.familia} title={l.sec.dica}>{l.sec.rotulo}</Selo>
                  {l.nomeNaSecullum && <div className="acn-ponto-sub" title="O nome que a Secullum tem para este CPF: confira se é a mesma pessoa">Lá: {l.nomeNaSecullum}</div>}
                  {l.pista && <div className="acn-ponto-sub acn-ponto-pista">Possível par na Secullum: {l.pista.nome} ({l.pista.cpf}). Confira o CPF da ficha.</div>}
                </td>
                <td>
                  {l.lig.usuario
                    ? <><strong>{l.lig.usuario.nome}</strong><div className="acn-ponto-sub">{l.lig.como === 'marca' ? 'ligado à mão' : `pelo ${l.lig.como} da ficha`}</div></>
                    : <><Selo familia="atencao" title={l.lig.observacao}>Sem usuário</Selo><div className="acn-ponto-sub">{l.lig.observacao}</div></>}
                </td>
                <td>
                  {l.lig.como === 'marca'
                    ? <Botao pequeno variante="discreto" disabled={gravando === l.p.id} onClick={() => desligar(l)}>Desfazer ligação</Botao>
                    : (
                      <select className="acn-input acn-ponto-pessoa" value="" disabled={gravando === l.p.id} aria-label={`Ligar ${nome(l.p)} a um usuário`} onChange={e => ligar(l, e.target.value)}>
                        <option value="">{l.lig.usuario ? 'Trocar por outro usuário…' : 'Escolher o usuário…'}</option>
                        {usuariosParecidos(l.p, usuarios).map(u => { const outra = usadoPor.get(u.id); return <option key={u.id} value={u.id} disabled={!!outra && outra.id !== l.p.id}>{u.nome}{outra && outra.id !== l.p.id ? ` (já é de ${nome(outra)})` : ''}</option>; })}
                      </select>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pendentes === 0 && <Faixa tom="ok">Todos os CLT da Detech estão ligados à Secullum e a um usuário do sistema.</Faixa>}

      <SecaoTitulo dica="Cadastros ativos da Secullum cujo CPF não existe em nenhuma ficha do RH">Na Secullum, sem ficha no RH</SecaoTitulo>
      {soNaLista === null ? (
        <p className="acn-ponto-rodape">{Number.isFinite(Number(ultima?.detalhes?.so_na_secullum)) ? `${ultima.detalhes.so_na_secullum} cadastro(s) ativo(s) da Secullum não têm ficha no RH. Os nomes aparecem depois da próxima atualização.` : 'Aparece depois da próxima atualização.'}</p>
      ) : !soNaLista.length ? (
        <Faixa tom="ok">Todo cadastro ativo da Secullum tem ficha no RH.</Faixa>
      ) : (
        <div className="acn-ponto-rolagem acn-ponto-estreita">
          <table className="acn-tabela acn-compacta">
            <thead><tr><th>Nome na Secullum</th><th>CPF</th><th>Admissão</th></tr></thead>
            <tbody>{soNaLista.map((s, i) => <tr key={i}><td>{s.nome || '—'}</td><td className="num">{s.cpf}</td><td>{s.admissao ? dataBr(s.admissao) : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="acn-ponto-rodape">
        {naoDetech.length ? `${naoDetech.length} CLT ativo(s) de outra empresa (ACN) ficam fora do ponto, como combinado. ` : ''}
        {naoBatem.length ? `${naoBatem.length} CLT marcado(s) como "Não bate ponto" na ficha (${naoBatem.map(nome).join(', ')}) também ficam fora. ` : ''}
        {ultima ? `Conferência da leitura de ${quandoFoi(ultima.iniciada_em)}.` : 'Ainda não houve leitura.'}
      </p>
    </>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function RelogioPonto({ funcionarios, desligados, currentUser, onAbrirFicha, onMudou, horasLancadas, onLancarHoras, visaoInicial = '' }) {
  const hoje = hojeISO();
  const mesAtual = primeiroDiaDoMes(hoje);
  const [perm, setPerm] = useState(null);
  // as partes do Relógio Ponto têm endereço (#/rh/ponto/mes); o pedido que vem de um aviso (visaoInicial) só vale quando o endereço não traz a parte
  const [visao, setVisao] = useAbaNoEndereco({ tela: 'rh', nivel: 1, pai: 'ponto', inicial: () => visaoInicial }) as [string, (v: any) => void];
  const [mes, setMes] = useState(mesAtual);
  const [meses, setMeses] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [rodadas, setRodadas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [erroUsuarios, setErroUsuarios] = useState('');
  const [versao, setVersao] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const mesEfetivo = visao === 'hoje' || visao === 'vinculos' ? mesAtual : (aberta ? mes : mes);
  const dados = usePontoDoMes(aberta ? mes : mesEfetivo, versao);
  const dadosAtuais = usePontoDoMes(mesAtual, versao);
  const base = (visao === 'hoje' || visao === 'vinculos') && !aberta ? dadosAtuais : dados;

  const carregarGeral = useCallback(async () => {
    const [p, m, r, u] = await Promise.all([lerPermissoes(), lerMesesComDados(), lerUltimasRodadas(8), lerUsuariosAtivos()]);
    setPerm(p); setMeses(m.dados); setRodadas(r.dados); setUsuarios(u.dados); setErroUsuarios(u.erro || '');
  }, []);
  useEffect(() => { carregarGeral(); }, [carregarGeral, versao]);

  const atualizar = async () => {
    setAtualizando(true); setAviso(null);
    const r = await atualizarPontoAgora();
    setAviso(r); setAtualizando(false);
    if (r.ok) { setAberta(null); setVersao(v => v + 1); }
  };

  const devem = useMemo(() => funcionarios.filter(deveBaterPonto).sort(porNome), [funcionarios]);
  const pessoas = useMemo(() => new Map([...funcionarios, ...(desligados || [])].map(f => [f.id, f])), [funcionarios, desligados]);
  // 25/11/2026: quem o RH marcou "Não bate ponto" não gera ocorrência (a mesma regra do aviso do Calendário, que o ignora no banco)
  const ocorrencias = useMemo(() => ocorrenciasDoMes(base.dias, hoje).filter(o => !pessoas.get(o.rhId)?.nao_bate_ponto), [base.dias, hoje, pessoas]);
  const contagem = useMemo(() => contarOcorrencias(ocorrencias), [ocorrencias]);

  const ultimaBoa = rodadas.find(r => r.terminada_em && r.ok);
  const falhouAgora = rodadas[0] && rodadas[0].terminada_em && !rodadas[0].ok;
  const naoRodou = rodadas.length > 0 ? (!ultimaBoa || horasDesde(ultimaBoa.iniciada_em) > HORAS_PARA_AVISAR_QUE_NAO_RODOU) : false;
  const ultimaComDetalhe = rodadas.find(r => r.terminada_em && r.detalhes);
  const semParIds = ultimaComDetalhe?.detalhes?.sem_par || [];
  const idsComPonto = useMemo(() => new Set([...dadosAtuais.totais.keys()]), [dadosAtuais]);
  const pendenciasVinculo = useMemo(() => devem.filter(p => situacaoNaSecullum(p, semParIds, idsComPonto).id !== 'ok' && situacaoNaSecullum(p, semParIds, idsComPonto).id !== 'sem_leitura' || !ligacaoDoUsuario(p, usuarios).usuario).length, [devem, semParIds, idsComPonto, usuarios]);

  if (!perm) return <Carregando />;
  if (perm.erro) return <Faixa tom="erro">Não foi possível conferir as suas permissões do ponto: {perm.erro}</Faixa>;

  if (!perm.verTodos) return <Faixa tom="atencao">O Relógio Ponto da equipe é de quem tem a permissão de ver o ponto de todos (RH, Admin e gerentes). O seu próprio ponto está na tela Ponto.</Faixa>;
  const listaDeMeses = [...new Set([mesAtual, ...meses])].sort().reverse().slice(0, 4);
  const mostraMes = (visao === 'tratar' || visao === 'mes' || visao === 'extras') || !!aberta;
  const abrir = (p) => { if (p) setAberta({ id: p.id, nome: nome(p), ficha: p }); };
  const mudarVisao = (v) => { setVisao(v); setAberta(null); };
  const itens = [
    { id: 'hoje', rotulo: 'Hoje' },
    { id: 'tratar', rotulo: 'A tratar', contagem: !base.carregando && mesEfetivo === mesAtual ? contagem.ajusta : undefined, titulo: 'Batidas incompletas, dias sem batida e faltas do mês, para o RH ajustar na Secullum' },
    { id: 'mes', rotulo: 'Mês' },
    { id: 'extras', rotulo: 'Horas extras' },
    { id: 'horas', rotulo: 'Horas lançadas', titulo: 'As horas que o RH lança à mão e o banco de horas manual' },
    { id: 'vinculos', rotulo: 'Vínculos', contagem: pendenciasVinculo || undefined, titulo: 'Quem está ligado a quem: ficha do RH, Secullum (CPF) e usuário do sistema' },
  ];

  return (
    <div className="acn-ponto">
      <div className="acn-ponto-barra">
        <div className="acn-ponto-barra-texto">
          <strong>Relógio Ponto</strong>
          <span>
            {ultimaBoa ? `Última leitura da Secullum: ${quandoFoi(ultimaBoa.iniciada_em)}` : 'Ainda não houve leitura da Secullum'} · próxima automática {proximaAtualizacao(new Date())}
          </span>
        </div>
        <Botao variante="primario" icone={mdiRefresh} onClick={atualizar} disabled={atualizando} title="Lê a Secullum agora e atualiza o ponto de todos (a Secullum deixa 100 consultas por hora: cada leitura gasta cerca de 20)">
          {atualizando ? 'Atualizando…' : 'Atualizar ponto agora'}
        </Botao>
      </div>

      {aviso && <Faixa tom={aviso.ok ? 'ok' : 'erro'}>{aviso.mensagem}</Faixa>}
      {naoRodou && <Faixa tom="erro">A atualização automática do ponto não rodou há mais de {HORAS_PARA_AVISAR_QUE_NAO_RODOU} horas{ultimaBoa ? ` (a última boa foi em ${quandoFoi(ultimaBoa.iniciada_em)})` : ''}. {falhouAgora && rodadas[0].erro ? `Último erro: ${rodadas[0].erro}` : 'Use "Atualizar ponto agora" e, se o erro continuar, avise o desenvolvimento.'}</Faixa>}
      {!naoRodou && falhouAgora && <Faixa tom="atencao">A última atualização falhou: {rodadas[0].erro || 'sem detalhe'}. Os dados mostrados são os da atualização anterior.</Faixa>}
      {erroUsuarios && <Faixa tom="atencao">Não foi possível ler a lista de usuários do sistema ({erroUsuarios}): a parte Vínculos fica incompleta.</Faixa>}
      {base.erro && <Faixa tom="erro">Não foi possível ler o ponto: {base.erro}</Faixa>}

      <Chips ativo={aberta ? '' : visao} onChange={mudarVisao} rotulo="Parte do relógio ponto" itens={itens} />
      {mostraMes && listaDeMeses.length > 1 && (
        <div className="acn-ponto-meses"><Chips ativo={mes} onChange={setMes} rotulo="Mês" itens={listaDeMeses.map(m => ({ id: m, rotulo: rotuloDoMes(m) }))} /></div>
      )}

      {aberta ? (
        <>
          <div className="acn-ponto-voltar">
            <Botao pequeno variante="discreto" onClick={() => setAberta(null)}>← Voltar</Botao>
            <strong>{aberta.nome}</strong>
            <span className="acn-ponto-sub">{[aberta.ficha?.cargo, departamentosTexto(aberta.ficha || {}), aberta.ficha?.empresa].filter(Boolean).join(' · ')}</span>
            <Botao pequeno onClick={() => onAbrirFicha(aberta.ficha)}>Abrir ficha</Botao>
          </div>
          <PontoDaPessoa rhId={aberta.id} mes={mes} versao={versao} />
        </>
      ) : base.carregando && visao !== 'horas' ? (
        <Carregando />
      ) : visao === 'hoje' ? (
        <VisaoHoje devem={devem} dados={dadosAtuais} hoje={hoje} semParIds={semParIds} abrir={abrir} />
      ) : visao === 'tratar' ? (
        <VisaoTratar ocorrencias={ocorrencias} pessoas={pessoas} mes={mesEfetivo} abrir={abrir} />
      ) : visao === 'mes' ? (
        <VisaoMes devem={devem} dados={dados} ocorrencias={ocorrencias} mes={mesEfetivo} hoje={hoje} abrir={abrir} />
      ) : visao === 'extras' ? (
        <VisaoExtras devem={devem} dados={dados} mes={mesEfetivo} hoje={hoje} abrir={abrir} />
      ) : visao === 'horas' ? (
        <>
          <Faixa tom="info" acao={<Botao pequeno variante="primario" icone={mdiPlus} onClick={onLancarHoras}>Lançar horas</Botao>}>
            Aqui ficam as horas que o RH lança à mão (hora extra, atraso, falta, atestado…) e o banco de horas manual. Elas não alteram o ponto da Secullum, nem o contrário.
          </Faixa>
          {horasLancadas}
        </>
      ) : (
        <VisaoVinculos funcionarios={funcionarios} devem={devem} dados={dadosAtuais} rodadas={rodadas} usuarios={usuarios} abrirFicha={onAbrirFicha} aoMudar={() => { onMudou(); setVersao(v => v + 1); }} usuario={currentUser} />
      )}

      {rodadas.length > 0 && (
        <details className="acn-ponto-rodadas">
          <summary>Últimas atualizações</summary>
          <ul>
            {rodadas.map(r => (
              <li key={r.id}>
                {quandoFoi(r.iniciada_em)} · {r.origem === 'rotina' ? 'automática' : `pedida por ${r.por || '—'}`} ·{' '}
                {!r.terminada_em ? 'em andamento' : r.ok ? `${r.pessoas} pessoa(s), ${r.consultas_calculo} consulta(s)` : `falhou: ${r.erro || 'sem detalhe'}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
