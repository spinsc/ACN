// @ts-nocheck
// RH — relatórios personalizados (pedido do usuário em 05/11/2026). As regras estão em RelatorioRhModelo.ts; aqui só a tela: modelos prontos, filtros, colunas, grupos, ordem, tabela,
// impressão e planilha (CSV). Tudo sobre as pessoas que a tela do RH já leu (ativas e desligadas): nenhuma leitura nova ao banco.
import React, { useEffect, useMemo, useState } from 'react';
import Icone from './Icone';
import { Botao, Chips, ChipsMultiplos, Faixa, hojeISO } from './Interface';
import { mdiFileChartOutline, mdiPrinterOutline, mdiDownload, mdiChevronDown, mdiChevronRight, mdiSortAscending, mdiSortDescending, mdiRestore } from '@mdi/js';
import {
  COLUNAS, colunaPorId, FILTROS_VAZIOS, MODELOS, AGRUPAMENTOS, filtrarPessoas, ordenarPessoas, agruparPessoas, paraCsv, nomeDoMes,
} from './RelatorioRhModelo';
import { lerPermissoes, lerMesesComDados, lerTotais, primeiroDiaDoMes, rotuloDoMes } from './PontoSecullum';

const escHtml = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const MODELO_INICIAL = MODELOS[0];
const ehColunaDePonto = (id: string) => id.startsWith('ponto_');
const unicos = (lista: any[]) => [...new Set(lista.filter(Boolean))].sort((a: any, b: any) => String(a).localeCompare(String(b), 'pt-BR'));

export default function RelatorioPersonalizadoRH({ funcionarios, desligados, departamentos }: { funcionarios: any[]; desligados: any[]; departamentos: any[] }) {
  const [aberto, setAberto] = useState(false);
  const [modeloId, setModeloId] = useState(MODELO_INICIAL.id);
  const [cfg, setCfg] = useState(() => MODELO_INICIAL.config());
  const hoje = hojeISO();

  // Ponto do mês (P3, 25/11/2026): as colunas de ponto leem `ponto_totais` do mês escolhido, e só para quem pode ver o ponto de todos (RH, Admin e gerentes);
  // quem não pode nem vê o modelo nem as colunas. A leitura só acontece com o relatório aberto e com alguma coluna de ponto escolhida.
  const [podePonto, setPodePonto] = useState(false);
  const [mesesPonto, setMesesPonto] = useState<string[]>([]);
  const [mesPonto, setMesPonto] = useState(primeiroDiaDoMes(hoje));
  const [totaisPonto, setTotaisPonto] = useState<Map<string, any>>(new Map());
  const [erroPonto, setErroPonto] = useState('');
  const [lendoPonto, setLendoPonto] = useState(false);
  const usaPonto = cfg.colunas.some(ehColunaDePonto);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    (async () => {
      const [p, m] = await Promise.all([lerPermissoes(), lerMesesComDados()]);
      if (!vivo) return;
      setPodePonto(p.verTodos === true); setMesesPonto(m.dados);
    })();
    return () => { vivo = false; };
  }, [aberto]);
  useEffect(() => {
    if (!aberto || !podePonto || !usaPonto) return;
    let vivo = true;
    setLendoPonto(true); setErroPonto('');
    (async () => {
      const r = await lerTotais(mesPonto);
      if (!vivo) return;
      setLendoPonto(false);
      if (r.erro) { setErroPonto(r.erro); setTotaisPonto(new Map()); return; }
      setTotaisPonto(new Map((r.dados || []).map((x: any) => [String(x.rh_id), x.valores])));
    })();
    return () => { vivo = false; };
  }, [aberto, podePonto, usaPonto, mesPonto]);

  const base = useMemo(() => {
    const visto = new Set<string>();
    const todas = [...(funcionarios || []), ...(desligados || [])].filter(f => f?.id && !visto.has(f.id) && visto.add(f.id));
    return usaPonto ? todas.map(f => (totaisPonto.has(String(f.id)) ? { ...f, __ponto: totaisPonto.get(String(f.id)) } : f)) : todas;
  }, [funcionarios, desligados, usaPonto, totaisPonto]);
  const colunasEscolhiveis = useMemo(() => COLUNAS.filter(c => podePonto || !ehColunaDePonto(c.id)), [podePonto]);
  const modelosVisiveis = useMemo(() => MODELOS.filter(m => podePonto || !m.config().colunas.some(ehColunaDePonto)), [podePonto]);

  const { lista, semNascimento, semAdmissao } = useMemo(() => filtrarPessoas(base, cfg.filtros, hoje), [base, cfg.filtros, hoje]);
  const grupos = useMemo(() => agruparPessoas(ordenarPessoas(lista, cfg.ordenarPor, cfg.crescente, hoje), cfg.agrupar), [lista, cfg.ordenarPor, cfg.crescente, cfg.agrupar, hoje]);
  const colunas = cfg.colunas.filter(id => podePonto || !ehColunaDePonto(id)).map(colunaPorId).filter(Boolean);
  const semLeituraDoMes = usaPonto && podePonto && !lendoPonto && !erroPonto ? lista.filter(f => !f.__ponto).length : 0;

  const opcoes = useMemo(() => ({
    empresas: unicos(base.map(f => f.empresa)), cargos: unicos(base.map(f => String(f.cargo || '').trim())), sexos: unicos(base.map(f => f.sexo)),
    departamentos: unicos((departamentos || []).map(d => d.nome)),
  }), [base, departamentos]);

  const mudarFiltro = (campo: string, valor: string) => { setModeloId(''); setCfg(c => ({ ...c, filtros: { ...c.filtros, [campo]: valor } })); };
  const mudar = (parte: any) => { setModeloId(''); setCfg(c => ({ ...c, ...parte })); };
  const aplicarModelo = (id: string) => { const m = MODELOS.find(x => x.id === id); if (m) { setModeloId(id); setCfg(m.config()); } };
  const colunaOrdem = colunas.some(c => c.id === cfg.ordenarPor) ? cfg.ordenarPor : (colunas[0]?.id || 'nome');
  const modelo = MODELOS.find(m => m.id === modeloId);

  const descricaoDosFiltros = () => {
    const f = cfg.filtros, partes: string[] = [];
    partes.push(f.situacao === 'ativos' ? 'Ativos' : f.situacao === 'desligados' ? 'Desligados' : 'Ativos e desligados');
    if (f.tipo) partes.push(f.tipo);
    if (f.empresa) partes.push('Empresa ' + f.empresa);
    if (f.departamento) partes.push('Depto. ' + f.departamento);
    if (f.cargo) partes.push('Função ' + f.cargo);
    if (f.sexo) partes.push(f.sexo);
    if (f.mesNascimento) partes.push('Aniversário em ' + (f.mesNascimento === 'este' ? nomeDoMes(Number(hoje.slice(5, 7))) : nomeDoMes(Number(f.mesNascimento))));
    if (f.admissaoDe || f.admissaoAte) partes.push('Admissão ' + (f.admissaoDe ? 'de ' + f.admissaoDe.split('-').reverse().join('/') : '') + (f.admissaoAte ? ' até ' + f.admissaoAte.split('-').reverse().join('/') : ''));
    if (f.busca.trim()) partes.push('Busca "' + f.busca.trim() + '"');
    if (f.soBatemPonto) partes.push('Só quem bate ponto');
    if (usaPonto && podePonto) partes.push('Ponto de ' + rotuloDoMes(mesPonto));
    return partes.join(' · ');
  };
  const tituloDoRelatorio = modelo ? modelo.rotulo : 'Relatório personalizado';

  const imprimir = () => {
    const cab = colunas.map(c => `<th>${escHtml(c.rotulo)}</th>`).join('');
    const linha = (f: any) => `<tr>${colunas.map(c => `<td>${escHtml(c.texto(f, hoje))}</td>`).join('')}</tr>`;
    const corpo = grupos.map(g => (cfg.agrupar ? `<tr class="grp"><td colspan="${colunas.length}">${escHtml(g.titulo)} (${g.pessoas.length})</td></tr>` : '') + g.pessoas.map(linha).join('')).join('');
    const avisos = [semLeituraDoMes ? `${semLeituraDoMes} pessoa(s) sem ponto lido no mês ficam com as colunas de ponto em branco` : '', semNascimento ? `${semNascimento} pessoa(s) sem data de nascimento ficaram de fora` : '', semAdmissao ? `${semAdmissao} pessoa(s) sem data de admissão ficaram de fora` : ''].filter(Boolean).join(' · ');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escHtml(tituloDoRelatorio)}</title>` +
      `<style>body{font-family:Arial,sans-serif;font-size:11px;margin:25px;}h2{text-align:center;font-size:14px;margin-bottom:2px}.sub{text-align:center;font-size:10px;color:#555;margin-bottom:4px;}` +
      `.av{text-align:center;font-size:10px;color:#b91c1c;margin-bottom:12px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}` +
      `td{padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;}tr.grp td{background:#e2e8f0;font-weight:bold;font-size:10px;letter-spacing:.4px}@media print{body{margin:12mm;}}</style></head><body>` +
      `<h2>ACN SINAL VERDE — ${escHtml(tituloDoRelatorio.toUpperCase())}</h2><div class="sub">${escHtml(descricaoDosFiltros())}</div>` +
      `<div class="sub">${lista.length} pessoa(s) · Emitido em ${new Date().toLocaleString('pt-BR')}</div>${avisos ? `<div class="av">${escHtml(avisos)}</div>` : ''}` +
      `<table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>` +
      `<scr` + `ipt>window.onload=function(){window.print()}<\/scr` + `ipt></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const baixarCsv = () => {
    const csv = paraCsv(colunas, grupos, hoje, !!cfg.agrupar, AGRUPAMENTOS.find(a => a.id === cfg.agrupar)?.rotulo || 'Grupo');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `rh_${(modeloId || 'personalizado')}_${hoje}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const f = cfg.filtros;
  const mesesOpc = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className={'sec-card' + (aberto ? '' : ' sec-collapsed')} data-teste="rh-relatorio-personalizado">
      <div className="sec-hdr no-collapse" onClick={() => setAberto(a => !a)}>
        <span className="acn-cab-titulo"><Icone path={mdiFileChartOutline} size={16} /> Relatórios personalizados</span>
        <div className="acn-cab-filtros" onClick={e => e.stopPropagation()}>
          <Botao pequeno variante="discreto" icone={aberto ? mdiChevronDown : mdiChevronRight} aria-label={aberto ? 'Recolher' : 'Abrir'} onClick={() => setAberto(a => !a)} />
        </div>
      </div>
      {aberto && (
        <div className="sec-body acn-rhrel">
          <Chips rotulo="Modelo de relatório" ativo={modeloId} onChange={aplicarModelo} itens={modelosVisiveis.map(m => ({ id: m.id, rotulo: m.rotulo, titulo: m.ajuda }))} />
          <div className="acn-ajuda">{modelo ? modelo.ajuda : 'Relatório montado por você: mude os filtros, as colunas, os grupos e a ordem abaixo. Escolha um modelo para voltar ao começo.'}</div>

          <div className="acn-rhrel-grade">
            <label className="acn-rhrel-campo"><span className="acn-label">Situação</span>
              <select className="acn-input" value={f.situacao} onChange={e => mudarFiltro('situacao', e.target.value)} aria-label="Situação">
                <option value="ativos">Ativos</option><option value="desligados">Desligados</option><option value="todos">Ativos e desligados</option>
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Tipo</span>
              <select className="acn-input" value={f.tipo} onChange={e => mudarFiltro('tipo', e.target.value)} aria-label="Tipo de colaborador">
                <option value="">Todos</option><option value="Funcionário">Funcionário (CLT)</option><option value="Terceiro">Terceiro</option>
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Empresa</span>
              <select className="acn-input" value={f.empresa} onChange={e => mudarFiltro('empresa', e.target.value)} aria-label="Empresa">
                <option value="">Todas</option>{opcoes.empresas.map(x => <option key={x}>{x}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Departamento</span>
              <select className="acn-input" value={f.departamento} onChange={e => mudarFiltro('departamento', e.target.value)} aria-label="Departamento">
                <option value="">Todos</option>{opcoes.departamentos.map(x => <option key={x}>{x}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Função / cargo</span>
              <select className="acn-input" value={f.cargo} onChange={e => mudarFiltro('cargo', e.target.value)} aria-label="Função ou cargo">
                <option value="">Todas</option>{opcoes.cargos.map(x => <option key={x}>{x}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Sexo</span>
              <select className="acn-input" value={f.sexo} onChange={e => mudarFiltro('sexo', e.target.value)} aria-label="Sexo">
                <option value="">Todos</option>{opcoes.sexos.map(x => <option key={x}>{x}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Aniversário em</span>
              <select className="acn-input" value={f.mesNascimento} onChange={e => mudarFiltro('mesNascimento', e.target.value)} aria-label="Mês de aniversário">
                <option value="">Qualquer mês</option><option value="este">Este mês</option>{mesesOpc.map(m => <option key={m} value={String(m)}>{nomeDoMes(m)}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Admitidos de</span>
              <input type="date" className="acn-input" value={f.admissaoDe} onChange={e => mudarFiltro('admissaoDe', e.target.value)} aria-label="Admitidos a partir de" /></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Admitidos até</span>
              <input type="date" className="acn-input" value={f.admissaoAte} onChange={e => mudarFiltro('admissaoAte', e.target.value)} aria-label="Admitidos até" /></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Procurar</span>
              <input className="acn-input" value={f.busca} placeholder="nome, função, e-mail…" onChange={e => mudarFiltro('busca', e.target.value)} aria-label="Procurar no relatório" /></label>
          </div>

          {usaPonto && podePonto && (
            <div className="acn-rhrel-grade">
              <label className="acn-rhrel-campo"><span className="acn-label">Mês do ponto</span>
                <select className="acn-input" value={mesPonto} onChange={e => setMesPonto(e.target.value)} aria-label="Mês do ponto">
                  {[...new Set([primeiroDiaDoMes(hoje), ...mesesPonto])].map(m => <option key={m} value={m}>{rotuloDoMes(m)}</option>)}
                </select></label>
              <label className="acn-rhrel-campo"><span className="acn-label">Quem entra</span>
                <select className="acn-input" value={f.soBatemPonto ? 'sim' : 'todos'} onChange={e => mudarFiltro('soBatemPonto', e.target.value === 'sim')} aria-label="Quem entra no relatório de ponto">
                  <option value="sim">Só quem bate ponto</option><option value="todos">Todas as pessoas do filtro</option>
                </select></label>
            </div>
          )}
          {usaPonto && podePonto && erroPonto && <Faixa tom="erro">Não foi possível ler o ponto de {rotuloDoMes(mesPonto)} ({erroPonto}). As colunas de ponto ficam em branco: tente de novo.</Faixa>}
          {usaPonto && podePonto && lendoPonto && <div className="acn-ajuda">Lendo o ponto de {rotuloDoMes(mesPonto)}…</div>}

          <div className="acn-rhrel-bloco">
            <span className="acn-label">Colunas do relatório</span>
            <ChipsMultiplos rotulo="Colunas" ativos={cfg.colunas}
              onChange={ids => mudar({ colunas: COLUNAS.map(c => c.id).filter(id => ids.includes(id)) })}
              itens={colunasEscolhiveis.map(c => ({ id: c.id, rotulo: c.rotulo }))} />
            {!cfg.colunas.length && <div className="acn-ajuda atencao">Escolha ao menos uma coluna.</div>}
          </div>

          <div className="acn-rhrel-grade">
            <label className="acn-rhrel-campo"><span className="acn-label">Agrupar por</span>
              <select className="acn-input" value={cfg.agrupar} onChange={e => mudar({ agrupar: e.target.value })} aria-label="Agrupar por">
                {AGRUPAMENTOS.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
              </select></label>
            <label className="acn-rhrel-campo"><span className="acn-label">Ordenar por</span>
              <select className="acn-input" value={colunaOrdem} onChange={e => mudar({ ordenarPor: e.target.value })} aria-label="Ordenar por">
                {colunas.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
              </select></label>
            <div className="acn-rhrel-campo"><span className="acn-label">Sentido</span>
              <Botao pequeno icone={cfg.crescente ? mdiSortAscending : mdiSortDescending} title={cfg.crescente ? 'A a Z, do menor para o maior, do mais antigo para o mais novo' : 'Z a A, do maior para o menor, do mais novo para o mais antigo'} onClick={() => mudar({ crescente: !cfg.crescente })}>{cfg.crescente ? 'Crescente' : 'Decrescente'}</Botao></div>
          </div>

          <div className="acn-rhrel-acoes">
            <strong data-teste="rh-rel-total">{lista.length} {lista.length === 1 ? 'pessoa' : 'pessoas'}</strong>
            <span className="acn-ajuda">{descricaoDosFiltros()}</span>
            <span className="acn-rhrel-espaco" />
            <Botao pequeno variante="discreto" icone={mdiRestore} onClick={() => aplicarModelo(modeloId || MODELO_INICIAL.id)} title="Volta ao modelo escolhido, ou ao primeiro se você já mexeu em tudo">Refazer do modelo</Botao>
            <Botao pequeno icone={mdiDownload} disabled={!lista.length || !colunas.length} onClick={baixarCsv} title="Baixa uma planilha que o Excel abre direto">Planilha (CSV)</Botao>
            <Botao pequeno variante="primario" icone={mdiPrinterOutline} disabled={!lista.length || !colunas.length} onClick={imprimir}>Imprimir</Botao>
          </div>

          {semNascimento > 0 && <Faixa tom="erro">{semNascimento} {semNascimento === 1 ? 'pessoa ficou' : 'pessoas ficaram'} de fora porque {semNascimento === 1 ? 'não tem' : 'não têm'} a data de nascimento cadastrada. Preencha na ficha do colaborador para entrar no relatório.</Faixa>}
          {semLeituraDoMes > 0 && <Faixa tom="atencao">{semLeituraDoMes} {semLeituraDoMes === 1 ? 'pessoa não tem' : 'pessoas não têm'} ponto lido em {rotuloDoMes(mesPonto)}: {semLeituraDoMes === 1 ? 'fica' : 'ficam'} com as colunas de ponto em branco (não bate ponto, CPF ainda não achado na Secullum ou mês sem leitura). Veja a parte Vínculos do Relógio Ponto.</Faixa>}
          {semAdmissao > 0 && <Faixa tom="erro">{semAdmissao} {semAdmissao === 1 ? 'pessoa ficou' : 'pessoas ficaram'} de fora porque {semAdmissao === 1 ? 'não tem' : 'não têm'} a data de admissão ou de início cadastrada.</Faixa>}

          {!lista.length ? <div className="acn-ajuda">Nenhuma pessoa com esses filtros.</div> : (
            <div className="acn-rolagem">
              <table className="acn-tabela" data-teste="rh-rel-tabela">
                <thead><tr>{colunas.map(c => <th key={c.id}>{c.rotulo}</th>)}</tr></thead>
                <tbody>
                  {grupos.map(g => (
                    <React.Fragment key={g.titulo || 'todos'}>
                      {cfg.agrupar && <tr className="acn-linha-total"><td colSpan={Math.max(1, colunas.length)}>{g.titulo} ({g.pessoas.length})</td></tr>}
                      {g.pessoas.map(p => (
                        <tr key={p.id}>{colunas.map((c, i) => <td key={c.id} className={i === 0 ? 'acn-forte' : undefined}>{c.texto(p, hoje) || <span className="acn-fraco">—</span>}</td>)}</tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
