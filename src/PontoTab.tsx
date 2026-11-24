// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PONTO (PLANO_PONTO_SECULLUM.md, 19/11/2026): o ponto dos CLT da Detech, vindo da Secullum (só leitura).
//
// Cada pessoa vê o próprio ponto ("Meu ponto"); RH, Admin e gerentes veem a equipe: quem está trabalhando agora, o resumo do mês e as horas extras.
// A tela só lê a CÓPIA no nosso banco, atualizada pela rotina das 8h30 e das 20h30 e pelo botão "Atualizar ponto agora" (só RH e Admin): quem decide
// quem vê o quê é o banco (políticas de `ponto_dias` e `ponto_totais`), então uma leitura recusada aparece como aviso, nunca como tela vazia.
// As regras de conta (horas, situação do dia, extras) estão em PontoSecullum.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { mdiRefresh } from '@mdi/js';
import { CabecalhoTela, Chips, Botao, Faixa, Selo, hojeISO } from './Interface';
import {
  lerPermissoes, lerMesesComDados, lerTotais, lerDiasDaPessoa, lerDiaDeTodos, lerPessoas, lerUltimasRodadas, lerPessoasSemUsuario, atualizarPontoAgora,
  paresDoDia, situacaoDoDia, resumoDoMes, extrasDoMes, paraMinutos, paraTexto, rotuloDoDia, rotuloDoMes, primeiroDiaDoMes, quandoFoi, horasDesde,
  ehFimDeSemana, HORAS_PARA_AVISAR_QUE_NAO_RODOU,
} from './PontoSecullum';
import './ponto.css';

const nomeCurto = (n: any) => String(n || '(sem nome)');
const textoDosPares = (pares) => pares.length ? pares.map(p => `${p.entrada || '—'} – ${p.saida || '…'}`).join(' · ') : '—';

// 20/11/2026: a cor do indicador é a família do design system (data-acn-familia), não um estilo escrito à mão; a aba RH › Relógio Ponto usa as mesmas peças
export function Indicadores({ itens }) {
  return (
    <div className="acn-kpis">
      {itens.map(k => (
        <div key={k.l} className="acn-kpi" title={k.dica}>
          <span className="rot"><i data-acn-familia={k.tom || 'neutro'} />{k.l}</span>
          <span className="val acn-num">{k.v}</span>
        </div>
      ))}
    </div>
  );
}
const tom = { ok: 'ok', erro: 'erro', atencao: 'atencao', info: 'info' };

export const Carregando = () => <div className="acn-empty">Carregando…</div>;

// ── O mês de UMA pessoa: totais e dia a dia ──────────────────────────────────────────────────────────────────────────────────────────────
export function PontoDaPessoa({ rhId, mes, versao, ehMeu = false }) {
  const hoje = hojeISO();
  const [estado, setEstado] = useState({ carregando: true, erro: '', totais: null, dias: [] });
  useEffect(() => {
    let vivo = true;
    setEstado(e => ({ ...e, carregando: true }));
    (async () => {
      const [t, d] = await Promise.all([lerTotais(mes, rhId), lerDiasDaPessoa(rhId, mes)]);
      if (!vivo) return;
      setEstado({ carregando: false, erro: t.erro || d.erro || '', totais: t.dados[0] || null, dias: d.dados });
    })();
    return () => { vivo = false; };
  }, [rhId, mes, versao]);

  if (estado.carregando) return <Carregando />;
  if (estado.erro) return <Faixa tom="erro">Não foi possível ler o ponto: {estado.erro}</Faixa>;
  if (!estado.totais && !estado.dias.length) {
    return ehMeu
      ? <Faixa tom="info">Não há ponto seu guardado em {rotuloDoMes(mes)}. Só os funcionários da Detech batem ponto na Secullum; se você é da Detech e deveria aparecer, peça ao RH para conferir o seu CPF no cadastro (ele é o que liga o seu cadastro à Secullum). O ponto novo aparece depois da próxima atualização (8h30 e 20h30).</Faixa>
      : <Faixa tom="info">Ainda não há ponto guardado de {rotuloDoMes(mes)} para esta pessoa. Ele aparece depois da próxima atualização (8h30 e 20h30).</Faixa>;
  }
  const r = resumoDoMes(estado.totais?.valores);
  const extras = extrasDoMes(estado.totais?.valores);
  const usaTerceiroPar = estado.dias.some(d => (paresDoDia(d.valores).length > 2));
  const colunasDePares = usaTerceiroPar ? 3 : 2;
  const falhas = estado.dias.filter(d => situacaoDoDia(d.valores, String(d.dia).slice(0, 10), hoje).familia === 'erro').length;
  const trabalhados = estado.dias.filter(d => paresDoDia(d.valores).length > 0).length;

  return (
    <>
      <Indicadores itens={[
        { l: 'Dias trabalhados', v: trabalhados, tom: tom.info, dica: 'Dias do mês com pelo menos uma batida' },
        { l: 'Horas normais', v: paraTexto(r.normais), tom: tom.ok },
        { l: 'Horas extras', v: paraTexto(r.extras), tom: extras.total ? tom.atencao : undefined, dica: extras.partes.map(p => `${p.rotulo}: ${paraTexto(p.min)}`).join('\n') || 'Sem hora extra no mês' },
        { l: 'Faltas', v: paraTexto(r.faltas), tom: r.faltas ? tom.erro : undefined },
        { l: 'Atrasos', v: paraTexto(r.atrasos), tom: r.atrasos ? tom.atencao : undefined },
        { l: 'Banco de horas', v: paraTexto(r.bancoSaldo, true), tom: r.bancoSaldo < 0 ? tom.erro : tom.info, dica: `Crédito no mês ${paraTexto(r.bancoCredito)} · débito ${paraTexto(r.bancoDebito)}` },
        { l: 'Dias com problema', v: falhas, tom: falhas ? tom.erro : tom.ok, dica: 'Dias que já passaram com batida incompleta ou sem nenhuma batida' },
      ]} />
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela acn-compacta">
          <thead>
            <tr>
              <th>Dia</th>
              {Array.from({ length: colunasDePares }).flatMap((_, i) => [<th key={`e${i}`}>Entrada {i + 1}</th>, <th key={`s${i}`}>Saída {i + 1}</th>])}
              <th className="num">Normais</th><th className="num">Extras</th><th className="num">Banco do dia</th><th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {estado.dias.map(d => {
              const dia = String(d.dia).slice(0, 10), v = d.valores || {};
              const pares = paresDoDia(v), sit = situacaoDoDia(v, dia, hoje), ex = extrasDoMes(v).total, banco = paraMinutos(v['BTotal']);
              return (
                <tr key={dia} className={sit.familia === 'erro' ? 'acn-linha-alerta' : (sit.id === 'sem_jornada' || ehFimDeSemana(dia) && !pares.length ? 'acn-linha-inativa' : '')}>
                  <td className="acn-ponto-dia">{rotuloDoDia(dia)}{dia === hoje && <b className="acn-ponto-hoje">hoje</b>}</td>
                  {Array.from({ length: colunasDePares }).flatMap((_, i) => [<td key={`e${i}`} className="num">{pares[i]?.entrada || ''}</td>, <td key={`s${i}`} className="num">{pares[i]?.saida || ''}</td>])}
                  <td className="num">{v['Normais'] || ''}</td>
                  <td className="num">{ex ? paraTexto(ex) : ''}</td>
                  <td className={'num' + (banco < 0 ? ' acn-ponto-negativo' : '')}>{banco ? paraTexto(banco, true) : ''}</td>
                  <td><Selo familia={sit.familia} title={sit.dica}>{sit.rotulo}</Selo></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="acn-ponto-rodape">Os valores são os que a Secullum calculou (o sistema não refaz a conta). Atualizado em {quandoFoi(estado.totais?.atualizado_em)}.</p>
    </>
  );
}

// ── Equipe hoje ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PESO_DA_SITUACAO = { ainda_nao_bateu: 0, incompleto: 1, sem_batida: 1, falta: 1, trabalhando: 2, saiu: 3, completo: 3, justificado: 4, marcado: 5, sem_jornada: 6 };

function EquipeHoje({ versao, abrirPessoa }) {
  const hoje = hojeISO();
  const [estado, setEstado] = useState({ carregando: true, erro: '', linhas: [], atualizadoEm: null });
  useEffect(() => {
    let vivo = true;
    setEstado(e => ({ ...e, carregando: true }));
    (async () => {
      const [t, d] = await Promise.all([lerTotais(primeiroDiaDoMes(hoje)), lerDiaDeTodos(hoje)]);
      const ids = [...new Set([...t.dados.map(x => x.rh_id), ...d.dados.map(x => x.rh_id)])];
      const p = await lerPessoas(ids);
      if (!vivo) return;
      const doDia = new Map(d.dados.map(x => [x.rh_id, x]));
      const linhas = ids.map(id => {
        const dia = doDia.get(id);
        return { id, pessoa: p.dados.get(id), dia, sit: dia ? situacaoDoDia(dia.valores, hoje, hoje) : { id: 'sem_dados', rotulo: 'Sem dados do dia', familia: 'neutro' } };
      });
      linhas.sort((a, b) => (PESO_DA_SITUACAO[a.sit.id] ?? 7) - (PESO_DA_SITUACAO[b.sit.id] ?? 7) || nomeCurto(a.pessoa?.nome).localeCompare(nomeCurto(b.pessoa?.nome), 'pt-BR'));
      const quando = t.dados.reduce((m, x) => (x.atualizado_em > m ? x.atualizado_em : m), '');
      setEstado({ carregando: false, erro: t.erro || d.erro || p.erro || '', linhas, atualizadoEm: quando });
    })();
    return () => { vivo = false; };
  }, [versao]);

  if (estado.carregando) return <Carregando />;
  if (estado.erro) return <Faixa tom="erro">Não foi possível ler o ponto da equipe: {estado.erro}</Faixa>;
  if (!estado.linhas.length) return <Faixa tom="info">Ainda não há ponto guardado. A primeira atualização é às 8h30 ou pelo botão "Atualizar ponto agora".</Faixa>;
  const conta = (ids) => estado.linhas.filter(l => ids.includes(l.sit.id)).length;
  return (
    <>
      <Indicadores itens={[
        { l: 'Trabalhando', v: conta(['trabalhando']), tom: tom.info },
        { l: 'Já saíram', v: conta(['saiu', 'completo']), tom: tom.ok },
        { l: 'Ainda não bateram', v: conta(['ainda_nao_bateu']), tom: conta(['ainda_nao_bateu']) ? tom.atencao : undefined, dica: 'Têm jornada prevista hoje e ainda não bateram o ponto' },
        { l: 'Folga, férias ou sem jornada', v: conta(['marcado', 'sem_jornada', 'justificado']) },
      ]} />
      <div className="acn-ponto-rolagem">
        <table className="acn-tabela">
          <thead><tr><th>Pessoa</th><th>Departamento</th><th>Batidas de hoje</th><th>Situação</th></tr></thead>
          <tbody>
            {estado.linhas.map(l => (
              <tr key={l.id} className={l.sit.familia === 'erro' ? 'acn-linha-alerta' : ''}>
                <td><button type="button" className="acn-ponto-link" onClick={() => abrirPessoa(l.id, l.pessoa?.nome)}>{nomeCurto(l.pessoa?.nome)}</button></td>
                <td>{l.pessoa?.departamento || '—'}</td>
                <td className="num">{l.dia ? textoDosPares(paresDoDia(l.dia.valores)) : '—'}</td>
                <td><Selo familia={l.sit.familia} title={l.sit.dica}>{l.sit.rotulo}</Selo></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="acn-ponto-rodape">Dados da última atualização: {quandoFoi(estado.atualizadoEm) || '—'}. A Secullum só entrega o que foi batido até esse momento.</p>
    </>
  );
}

// ── Resumo do mês e horas extras (a mesma leitura, duas tabelas) ──────────────────────────────────────────────────────────────────────────
function EquipeNoMes({ mes, versao, abrirPessoa, soExtras }) {
  const [estado, setEstado] = useState({ carregando: true, erro: '', linhas: [] });
  useEffect(() => {
    let vivo = true;
    setEstado(e => ({ ...e, carregando: true }));
    (async () => {
      const t = await lerTotais(mes);
      const p = await lerPessoas(t.dados.map(x => x.rh_id));
      if (!vivo) return;
      const linhas = t.dados.map(x => ({ id: x.rh_id, pessoa: p.dados.get(x.rh_id), valores: x.valores, ateDia: x.ate_dia, atualizadoEm: x.atualizado_em, r: resumoDoMes(x.valores), extras: extrasDoMes(x.valores) }));
      setEstado({ carregando: false, erro: t.erro || p.erro || '', linhas });
    })();
    return () => { vivo = false; };
  }, [mes, versao]);

  const linhas = useMemo(() => {
    const base = soExtras ? estado.linhas.filter(l => l.extras.total !== 0) : estado.linhas;
    return [...base].sort((a, b) => soExtras ? b.extras.total - a.extras.total : nomeCurto(a.pessoa?.nome).localeCompare(nomeCurto(b.pessoa?.nome), 'pt-BR'));
  }, [estado.linhas, soExtras]);

  if (estado.carregando) return <Carregando />;
  if (estado.erro) return <Faixa tom="erro">Não foi possível ler os totais do mês: {estado.erro}</Faixa>;
  if (!estado.linhas.length) return <Faixa tom="info">Não há ponto guardado de {rotuloDoMes(mes)}.</Faixa>;
  const ate = estado.linhas.reduce((m, l) => (l.ateDia > m ? l.ateDia : m), '');
  const somaExtras = linhas.reduce((s, l) => s + l.extras.total, 0);

  return (
    <>
      <p className="acn-ponto-rodape acn-ponto-topo">{rotuloDoMes(mes)}, até {String(ate).split('-').reverse().join('/')}.</p>
      {soExtras && !linhas.length ? (
        <Faixa tom="ok">Ninguém tem hora extra em {rotuloDoMes(mes)} (até o dia {String(ate).split('-').reverse().join('/')}).</Faixa>
      ) : (
        <div className="acn-ponto-rolagem">
          <table className="acn-tabela">
            <thead>
              {soExtras ? (
                <tr><th>Pessoa</th><th>Departamento</th><th className="num">Total de extras</th><th>De que tipo</th></tr>
              ) : (
                <tr><th>Pessoa</th><th>Departamento</th><th className="num">Normais</th><th className="num">Extras</th><th className="num">Faltas</th><th className="num">Atrasos</th><th className="num">Banco de horas</th></tr>
              )}
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id}>
                  <td><button type="button" className="acn-ponto-link" onClick={() => abrirPessoa(l.id, l.pessoa?.nome)}>{nomeCurto(l.pessoa?.nome)}</button></td>
                  <td>{l.pessoa?.departamento || '—'}</td>
                  {soExtras ? (
                    <>
                      <td className="num">{paraTexto(l.extras.total)}</td>
                      <td>{l.extras.partes.map(p => `${p.rotulo} ${paraTexto(p.min)}`).join(' · ')}</td>
                    </>
                  ) : (
                    <>
                      <td className="num">{paraTexto(l.r.normais)}</td>
                      <td className="num">{l.r.extras ? paraTexto(l.r.extras) : '—'}</td>
                      <td className={'num' + (l.r.faltas ? ' acn-ponto-negativo' : '')}>{l.r.faltas ? paraTexto(l.r.faltas) : '—'}</td>
                      <td className="num">{l.r.atrasos ? paraTexto(l.r.atrasos) : '—'}</td>
                      <td className={'num' + (l.r.bancoSaldo < 0 ? ' acn-ponto-negativo' : '')}>{paraTexto(l.r.bancoSaldo, true)}</td>
                    </>
                  )}
                </tr>
              ))}
              {soExtras && (
                <tr className="acn-linha-total"><td>Total da equipe</td><td></td><td className="num">{paraTexto(somaExtras)}</td><td></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="acn-ponto-rodape">Banco de horas é o saldo acumulado que a Secullum informa. O total de extras soma as colunas de hora extra que vierem preenchidas.</p>
    </>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function PontoTab({ currentUser }) {
  const hoje = hojeISO();
  const [perm, setPerm] = useState(null);
  const [meses, setMeses] = useState([]);
  const [mes, setMes] = useState(primeiroDiaDoMes(hoje));
  const [visao, setVisao] = useState('');
  const [aberta, setAberta] = useState(null); // { id, nome }: a equipe abre o mês de uma pessoa
  const [rodadas, setRodadas] = useState([]);
  const [semPar, setSemPar] = useState([]);
  const [semUsuario, setSemUsuario] = useState([]);
  const [ultima, setUltima] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const p0 = await lerPermissoes();
    // 20/11/2026: quem tem a aba RH cuida do ponto da equipe em RH › Relógio Ponto; aqui fica o "Meu ponto" (e a equipe, para o gerente que não é do RH)
    const p = { ...p0, verTodos: p0.verTodos && !p0.ehRh };
    setPerm(p);
    setVisao(v => v || (p.verTodos ? 'hoje' : 'meu'));
    const [m, t] = await Promise.all([lerMesesComDados(), lerTotais(primeiroDiaDoMes(hoje))]);
    setMeses(m.dados);
    setUltima(t.dados.reduce((mx, x) => (x.atualizado_em > mx ? x.atualizado_em : mx), ''));
    if (p.verTodos) {
      const r = await lerUltimasRodadas(5);
      setRodadas(r.dados);
      const ult = r.dados.find(x => x.terminada_em);
      const ids = ult?.detalhes?.sem_par || [];
      if (ids.length) { const n = await lerPessoas(ids); setSemPar(ids.map(id => nomeCurto(n.dados.get(id)?.nome))); } else setSemPar([]);
    }
  }, [hoje]);
  useEffect(() => { carregar(); }, [carregar]);

  const atualizar = async () => {
    setAtualizando(true); setAviso(null);
    const r = await atualizarPontoAgora();
    setAviso(r); setAtualizando(false);
    if (r.ok) { setAberta(null); setVersao(v => v + 1); carregar(); }
  };

  if (!perm) return <div className="acn-ponto"><CabecalhoTela titulo="Ponto" /><Carregando /></div>;

  const opcoes = [
    ...(perm.verTodos ? [{ id: 'hoje', rotulo: 'Equipe hoje' }, { id: 'mes', rotulo: 'Resumo do mês' }, { id: 'extras', rotulo: 'Horas extras' }] : []),
    { id: 'meu', rotulo: 'Meu ponto' },
  ];
  const mostraMes = visao !== 'hoje' || aberta;
  const listaDeMeses = [...new Set([primeiroDiaDoMes(hoje), ...meses])].sort().reverse().slice(0, 4);
  const ultimaOk = rodadas.find(r => r.terminada_em && r.ok);
  const falhouAgora = rodadas[0] && rodadas[0].terminada_em && !rodadas[0].ok;
  const naoRodou = perm.verTodos && (!ultimaOk || horasDesde(ultimaOk.iniciada_em) > HORAS_PARA_AVISAR_QUE_NAO_RODOU);

  return (
    <div className="acn-ponto">
      <CabecalhoTela
        titulo="Ponto"
        subtitulo={ultima ? `Atualizado em ${quandoFoi(ultima)} · a Secullum é lida às 8h30 e às 20h30` : 'Ponto dos funcionários da Detech, vindo da Secullum (só leitura)'}
        acoes={perm.ehRh && (
          <Botao variante="primario" onClick={() => { window.__acnDeepLink = { rhAba: 'ponto' }; window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'rh' } })); }}
            title="O ponto da equipe, as ocorrências a tratar, as horas extras e o botão de atualizar ficam na aba RH">
            Abrir RH › Relógio Ponto
          </Botao>
        )}
        abas={<Chips ativo={visao} onChange={(v) => { setVisao(v); setAberta(null); }} itens={opcoes} rotulo="Parte do ponto" />}
      />

      {aviso && <Faixa tom={aviso.ok ? 'ok' : 'erro'}>{aviso.mensagem}</Faixa>}
      {perm.erro && <Faixa tom="erro">Não foi possível conferir as suas permissões do ponto: {perm.erro}</Faixa>}
      {naoRodou && <Faixa tom="erro">A atualização automática do ponto não rodou há mais de {HORAS_PARA_AVISAR_QUE_NAO_RODOU} horas{ultimaOk ? ` (a última boa foi em ${quandoFoi(ultimaOk.iniciada_em)})` : ''}. {falhouAgora && rodadas[0].erro ? `Último erro: ${rodadas[0].erro}` : 'Use "Atualizar ponto agora" e, se o erro continuar, avise o desenvolvimento.'}</Faixa>}
      {!naoRodou && falhouAgora && <Faixa tom="atencao">A última atualização falhou: {rodadas[0].erro || 'sem detalhe'}. Os dados mostrados são os da atualização anterior.</Faixa>}
      {perm.verTodos && semPar.length > 0 && (
        <Faixa tom="atencao">Não foram achadas na Secullum, pelo CPF, {semPar.length} pessoa(s) do RH (CLT da Detech): {semPar.join(', ')}. Confira o CPF no cadastro do RH ou na Secullum; enquanto isso elas ficam sem ponto aqui.</Faixa>
      )}
      {perm.ehRh && <Faixa tom="info">Esta é a sua folha de ponto. A equipe toda, as ocorrências a tratar, as horas extras e a conferência de quem está ligado a quem ficam em RH › Relógio Ponto.</Faixa>}

      {mostraMes && listaDeMeses.length > 1 && (
        <div className="acn-ponto-meses"><Chips ativo={mes} onChange={setMes} rotulo="Mês" itens={listaDeMeses.map(m => ({ id: m, rotulo: rotuloDoMes(m) }))} /></div>
      )}

      {aberta ? (
        <>
          <div className="acn-ponto-voltar">
            <Botao pequeno variante="discreto" onClick={() => setAberta(null)}>← Voltar para a equipe</Botao>
            <strong>{aberta.nome}</strong>
          </div>
          <PontoDaPessoa rhId={aberta.id} mes={mes} versao={versao} />
        </>
      ) : visao === 'hoje' ? (
        <EquipeHoje versao={versao} abrirPessoa={(id, nome) => { setMes(primeiroDiaDoMes(hoje)); setAberta({ id, nome: nomeCurto(nome) }); }} />
      ) : visao === 'mes' ? (
        <EquipeNoMes mes={mes} versao={versao} abrirPessoa={(id, nome) => setAberta({ id, nome: nomeCurto(nome) })} />
      ) : visao === 'extras' ? (
        <EquipeNoMes mes={mes} versao={versao} soExtras abrirPessoa={(id, nome) => setAberta({ id, nome: nomeCurto(nome) })} />
      ) : perm.meuRhId ? (
        <PontoDaPessoa rhId={perm.meuRhId} mes={mes} versao={versao} ehMeu />
      ) : (
        <Faixa tom="atencao">
          O sistema não achou a sua ficha do RH, ou você não bate ponto na Secullum (só os funcionários da Detech batem). Se deveria aparecer aqui, peça ao RH para conferir
          se o seu nome (ou e-mail) na ficha do RH é igual ao do seu usuário.
        </Faixa>
      )}

      {perm.verTodos && rodadas.length > 0 && (
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
