// O Conferidor de XML do Fiscal (preparação do módulo fiscal, 26/11/2026): a pessoa solta os XMLs de notas já emitidas e a tela diz o que está errado, pelas regras da
// especificação do Fiscal (FiscalXml.ts). Os arquivos são lidos no próprio navegador e NADA sai do computador a menos que a pessoa clique em "Guardar no arquivo" (aba Notas emitidas):
// só aí as notas vão para o banco da empresa (fiscal_guardar), que não regrava o que já estava guardado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mdiMagnify, mdiDownload, mdiFileUploadOutline, mdiDeleteOutline, mdiArchiveArrowDownOutline } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Chips, type Tom } from './Interface';
import { combinaBusca } from './SearchUtils';
import { baixarPlanilha } from './ExportarPlanilha';
import { lerEmitentes, guardarNoArquivo } from './FiscalDados';
import { podeEditarCadastroFiscal, podeVerValores } from './utils/permissoes';
import { lerArquivoFiscal, montarLote, conferirNota, conferirLote, chavesCanceladas, NOMES_DAS_REGRAS } from './FiscalXml';
import FiscalLevantamentoTela from './FiscalLevantamentoTela';
import './fiscal.css';

const LIMITE_NA_TELA = 300;
const BLOCO = 25;           // arquivos lidos por vez, para a tela não congelar com milhares de XMLs

const dinheiro = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataCurta = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—'); };

export default function FiscalConferidorTela({ currentUser }) {
  const [arquivos, setArquivos] = useState<any[]>([]);       // o que foi lido (nota, evento, inutilização, outro)
  const [emitentes, setEmitentes] = useState<any[]>([]);
  const [erroEmit, setErroEmit] = useState('');
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [sobre, setSobre] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [visao, setVisao] = useState('conferencia');   // Conferência das notas ou Levantamento do histórico (27/11/2026)
  const [guardando, setGuardando] = useState<{ feitas: number; total: number } | null>(null);
  const [guardou, setGuardou] = useState<{ tom: Tom; texto: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const cancelar = useRef(false);

  useEffect(() => {
    lerEmitentes().then(r => { setEmitentes((r.lista || []).filter((e: any) => e.ativo !== false).map((e: any) => ({ cnpj: e.cnpj, crt: e.crt, codigo: e.codigo }))); setErroEmit(r.erro || ''); });
  }, []);

  const ler = async (lista: File[]) => {
    const xmls = lista.filter(f => /\.xml$/i.test(f.name));
    if (!xmls.length) return;
    cancelar.current = false;
    setProgresso({ feitos: 0, total: xmls.length });
    const lidos: any[] = [];
    for (let i = 0; i < xmls.length; i += BLOCO) {
      if (cancelar.current) break;
      const bloco = xmls.slice(i, i + BLOCO);
      const textos = await Promise.all(bloco.map(f => f.text().then(t => ({ f, t })).catch(() => ({ f, t: null }))));
      for (const { f, t } of textos) lidos.push(t == null ? { tipo: 'outro', arquivo: f.name, motivo: 'não foi possível ler o arquivo' } : { ...lerArquivoFiscal(f.name, t), xml: t });   // o texto fica junto: é o que "Guardar no arquivo" envia
      setProgresso({ feitos: Math.min(i + BLOCO, xmls.length), total: xmls.length });
      await new Promise(r => setTimeout(r, 0));   // devolve a vez à tela entre um bloco e outro
    }
    setArquivos(a => [...a, ...lidos]);
    setProgresso(null);
    setGuardou(null);
  };

  const soltar = (e: React.DragEvent) => { e.preventDefault(); setSobre(false); ler([...e.dataTransfer.files]); };

  // a conferência é derivada: nada é guardado além dos arquivos lidos
  const lote = useMemo(() => montarLote(arquivos), [arquivos]);
  const canceladas = useMemo(() => chavesCanceladas(lote.eventos), [lote]);
  const achadosDoLote = useMemo(() => (arquivos.length ? conferirLote(lote) : []), [lote, arquivos.length]);
  const linhas = useMemo(() => lote.notas.map(n => {
    const achados = conferirNota(n, emitentes);
    return { n, achados, bloqueios: achados.filter(a => a.nivel === 'bloqueia').length, alertas: achados.filter(a => a.nivel === 'alerta').length, cancelada: canceladas.has(n.chave) };
  }), [lote, emitentes, canceladas]);

  const resumo = useMemo(() => ({
    arquivos: arquivos.length, notas: linhas.length,
    comBloqueio: linhas.filter(l => l.bloqueios).length,
    soAlerta: linhas.filter(l => !l.bloqueios && l.alertas).length,
    limpas: linhas.filter(l => !l.bloqueios && !l.alertas).length,
    eventos: lote.eventos.length, ilegiveis: lote.outros.length,
  }), [arquivos.length, linhas, lote]);

  const filtradas = useMemo(() => linhas.filter(l => {
    if (filtro === 'bloqueio' && !l.bloqueios) return false;
    if (filtro === 'alerta' && (l.bloqueios || !l.alertas)) return false;
    if (filtro === 'limpas' && (l.bloqueios || l.alertas)) return false;
    return !busca.trim() || combinaBusca([l.n.numero, l.n.chave, l.n.destNome, l.n.destDoc, l.n.emitNome, l.n.natOp, l.achados.map(a => a.texto).join(' ')].join(' '), busca);
  }), [linhas, filtro, busca]);

  const exportar = async () => {
    await baixarPlanilha('Conferencia_de_XML', [
      { nome: 'Notas', colunas: [{ rotulo: 'Número' }, { rotulo: 'Série' }, { rotulo: 'Emissão', largura: 12 }, { rotulo: 'Emitente', largura: 30 }, { rotulo: 'Destinatário', largura: 34 }, { rotulo: 'Valor', formato: 'moeda' }, { rotulo: 'Situação', largura: 14 }, { rotulo: 'Bloqueios', formato: 'inteiro' }, { rotulo: 'Alertas', formato: 'inteiro' }, { rotulo: 'Chave', largura: 46 }],
        linhas: linhas.map(l => [l.n.numero, l.n.serie, dataCurta(l.n.emissao), l.n.emitNome, l.n.destNome, l.n.valorNF ?? 0, l.cancelada ? 'Cancelada' : (l.n.autorizada === false ? 'Não autorizada' : 'Emitida'), l.bloqueios, l.alertas, l.n.chave]) },
      { nome: 'Achados', colunas: [{ rotulo: 'Nota' }, { rotulo: 'Série' }, { rotulo: 'Nível' }, { rotulo: 'Regra', largura: 34 }, { rotulo: 'O que foi achado', largura: 90 }],
        linhas: [
          ...achadosDoLote.map(a => ['(lote)', '', a.nivel === 'bloqueia' ? 'Bloqueia' : 'Alerta', NOMES_DAS_REGRAS[a.regra] || a.regra, a.texto]),
          ...linhas.flatMap(l => l.achados.map(a => [l.n.numero, l.n.serie, a.nivel === 'bloqueia' ? 'Bloqueia' : 'Alerta', NOMES_DAS_REGRAS[a.regra] || a.regra, a.texto])),
        ] },
    ]);
  };

  const limpar = () => { cancelar.current = true; setArquivos([]); setProgresso(null); setBusca(''); setFiltro('todas'); setGuardou(null); };

  const podeGuardar = podeEditarCadastroFiscal(currentUser) && podeVerValores(currentUser);
  const guardar = async () => {
    if (guardando || !podeGuardar) return;
    setGuardou(null); setGuardando({ feitas: 0, total: 1 });
    const r = await guardarNoArquivo(lote, emitentes, currentUser, (feitas, total) => setGuardando({ feitas, total }));
    setGuardando(null);
    const t = r.totais;
    const partes = [t.novas && `${t.novas} nota(s) nova(s)`, t.atualizadas && `${t.atualizadas} atualizada(s) com o protocolo`, t.repetidas && `${t.repetidas} já estava(m) guardada(s)`,
      t.eventos_novos && `${t.eventos_novos} evento(s)`, t.inutilizacoes_novas && `${t.inutilizacoes_novas} inutilização(ões)`, t.semDado && `${t.semDado} arquivo(s) sem chave ou número que não puderam ser guardados`].filter(Boolean);
    if (!r.ok) setGuardou({ tom: 'erro', texto: `${r.parcial ? 'A gravação parou no meio: ' : 'Falha ao guardar: '}${r.erro}${r.parcial ? ' O que já foi guardado fica; é só repetir (o que já está no arquivo não é regravado).' : ''} ${partes.length ? 'Até aqui: ' + partes.join(', ') + '.' : ''}` });
    else setGuardou({ tom: t.semDado ? 'atencao' : 'ok', texto: partes.length ? 'Guardado no arquivo: ' + partes.join(', ') + '.' : 'Nada novo para guardar.' });
  };

  return (
    <div>
      <div className="acn-ajuda">Solte aqui os XMLs das notas já emitidas (de qualquer mês, vários de uma vez). A tela confere cada uma pelas regras do Fiscal (CFOP, ICMS, PIS/COFINS, chave, numeração…) e mostra o que está errado. <strong>Os arquivos são lidos neste computador; nada é gravado nem enviado enquanto você não clicar em "Guardar no arquivo".</strong></div>
      {erroEmit && <Faixa tom="atencao">Não foi possível ler as empresas emitentes ({erroEmit}). A conferência do regime (CRT) da nota fica de fora.</Faixa>}

      <div className="acn-fcad-soltar" data-sobre={sobre ? '1' : '0'}
        onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
        <Icone path={mdiFileUploadOutline} size={28} />
        <div><strong>Solte os arquivos .xml aqui</strong> ou escolha no computador</div>
        <input ref={entrada} className="acn-fcad-arquivo" type="file" accept=".xml,text/xml,application/xml" multiple aria-label="Escolher arquivos XML"
          onChange={e => { ler([...(e.target.files || [])]); e.target.value = ''; }} />
        <div className="acn-fcad-acoes">
          <Botao variante="primario" disabled={!!progresso} onClick={() => entrada.current?.click()}>Escolher arquivos</Botao>
          {(arquivos.length > 0 || progresso) && <Botao icone={mdiDeleteOutline} onClick={limpar}>Limpar</Botao>}
        </div>
        {progresso && (
          <div role="status" className="acn-fcad-prog">
            <div className="acn-fcad-barra-prog"><i style={{ width: `${Math.round(progresso.feitos / progresso.total * 100)}%` }} /></div>
            <div className="acn-fcad-dica">Lendo {progresso.feitos} de {progresso.total}…</div>
          </div>
        )}
      </div>

      {arquivos.length > 0 && (
        <>
          <div className="acn-fcad-barra">
            <Chips rotulo="Ver" ativo={visao} onChange={setVisao} itens={[{ id: 'conferencia', rotulo: 'Conferência das notas' }, { id: 'levantamento', rotulo: 'Levantamento do histórico' }]} />
          </div>
          {visao === 'levantamento' && <FiscalLevantamentoTela notas={lote.notas} emitentes={emitentes} canceladas={canceladas} currentUser={currentUser} />}
          {visao === 'conferencia' && (<>
          <div className="acn-kpis">
            <div className="acn-kpi"><span className="rot">Arquivos lidos</span><span className="val acn-num">{resumo.arquivos}</span><span className="sub">{resumo.eventos} evento(s) · {resumo.ilegiveis} ilegível(is)</span></div>
            <div className="acn-kpi"><span className="rot">Notas</span><span className="val acn-num">{resumo.notas}</span><span className="sub">{resumo.limpas} sem nenhum achado</span></div>
            <div className="acn-kpi"><span className="rot"><i data-acn-familia="erro" />Com bloqueio</span><span className="val acn-num">{resumo.comBloqueio}</span><span className="sub">a nota não deveria sair assim</span></div>
            <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Só alerta</span><span className="val acn-num">{resumo.soAlerta}</span><span className="sub">conferir com o Fiscal</span></div>
          </div>

          <div className="acn-fcad-guardar">
            <div>
              <strong>Guardar no arquivo da empresa</strong>
              <p className="acn-fcad-dica">Grava {resumo.notas} nota(s), {resumo.eventos} evento(s) e {lote.inutilizacoes.length} inutilização(ões) no banco do sistema, para a aba Notas emitidas achar, ligar à OP e vigiar a numeração. O que já estava guardado não é regravado.</p>
            </div>
            <Botao variante="primario" icone={mdiArchiveArrowDownOutline} disabled={!podeGuardar || !!guardando || !!progresso || (!resumo.notas && !resumo.eventos && !lote.inutilizacoes.length)} onClick={guardar}>
              {guardando ? `Guardando… ${guardando.feitas} de ${guardando.total}` : 'Guardar no arquivo'}
            </Botao>
          </div>
          {!podeGuardar && <Faixa tom="info">Só guarda quem tem a aba Fiscal e vê valores (o XML traz os valores). Você pode conferir os arquivos normalmente.</Faixa>}
          {guardou && <Faixa tom={guardou.tom}>{guardou.texto}</Faixa>}

          {lote.outros.length > 0 && (
            <Faixa tom="atencao">{lote.outros.length} arquivo(s) não foram lidos como nota, evento ou inutilização: {lote.outros.slice(0, 5).map(o => `${o.arquivo} (${o.motivo})`).join('; ')}{lote.outros.length > 5 ? '…' : ''}</Faixa>
          )}

          {achadosDoLote.length > 0 && (
            <div className="acn-fcad-lote">
              <h3 className="acn-fcad-secao-tit">Achados do conjunto de notas</h3>
              <div className="acn-fcad-resultado">
                {achadosDoLote.map((a, i) => (
                  <div key={i} className={'acn-fcad-achado ' + (a.nivel === 'bloqueia' ? 'acn-fcad-achado-b' : 'acn-fcad-achado-a')}>
                    <Selo familia={a.nivel === 'bloqueia' ? 'erro' : 'atencao'} ponto={false}>{a.nivel === 'bloqueia' ? 'Bloqueia' : 'Alerta'}</Selo>
                    <span><strong>{NOMES_DAS_REGRAS[a.regra] || a.regra}.</strong> {a.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="acn-fcad-barra">
            <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar nota" placeholder="Número, cliente, chave, achado…" /></div>
            <Chips rotulo="Mostrar" ativo={filtro} onChange={setFiltro} itens={[
              { id: 'todas', rotulo: 'Todas', contagem: resumo.notas },
              { id: 'bloqueio', rotulo: 'Com bloqueio', contagem: resumo.comBloqueio },
              { id: 'alerta', rotulo: 'Só alerta', contagem: resumo.soAlerta },
              { id: 'limpas', rotulo: 'Sem achados', contagem: resumo.limpas },
            ]} />
            <Botao pequeno icone={mdiDownload} onClick={exportar} disabled={!linhas.length}>Baixar planilha</Botao>
          </div>
          {filtradas.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando as primeiras {LIMITE_NA_TELA} de {filtradas.length} notas. Use a busca ou os filtros; a planilha leva todas.</Faixa>}

          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Nota</th><th>Emissão</th><th>Destinatário</th><th>Valor</th><th>Situação</th><th>Achados</th></tr></thead>
              <tbody>
                {filtradas.slice(0, LIMITE_NA_TELA).map(l => (
                  <tr key={l.n.chave || l.n.arquivo}>
                    <td className="acn-fcad-num"><strong>{l.n.numero || '—'}</strong>{l.n.serie ? ` / série ${l.n.serie}` : ''}<div className="acn-fraco">{l.n.emitNome}</div></td>
                    <td className="acn-fcad-num">{dataCurta(l.n.emissao)}</td>
                    <td>{l.n.destNome || '—'}<div className="acn-fraco acn-fcad-num">{l.n.destDoc}{l.n.destUf ? ` · ${l.n.destUf}` : ''}</div></td>
                    <td className="acn-fcad-num">{dinheiro(l.n.valorNF)}</td>
                    <td>{l.cancelada ? <Selo familia="neutro" ponto={false}>Cancelada</Selo> : l.n.autorizada === false ? <Selo familia="atencao" ponto={false}>Não autorizada</Selo> : <Selo familia="ok" ponto={false}>Emitida</Selo>}</td>
                    <td>
                      {!l.achados.length ? <Selo familia="ok" ponto={false}>Nenhum</Selo> : (
                        <div className="acn-fcad-resultado">
                          {l.achados.map((a, i) => (
                            <div key={i} className={'acn-fcad-achado ' + (a.nivel === 'bloqueia' ? 'acn-fcad-achado-b' : 'acn-fcad-achado-a')}>
                              <Selo familia={a.nivel === 'bloqueia' ? 'erro' : 'atencao'} ponto={false}>{a.nivel === 'bloqueia' ? 'Bloqueia' : 'Alerta'}</Selo>
                              <span><strong>{NOMES_DAS_REGRAS[a.regra] || a.regra}.</strong> {a.texto}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!filtradas.length && <tr><td colSpan={6} className="acn-centro acn-fraco">{lote.notas.length ? 'Nenhuma nota com esse filtro.' : 'Nenhuma nota entre os arquivos lidos (só eventos ou inutilizações).'}</td></tr>}
              </tbody>
            </table>
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
