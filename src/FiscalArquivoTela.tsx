// @ts-nocheck
// A aba "Notas emitidas" do Fiscal (preparação do módulo fiscal, 26/11/2026): o arquivo das notas que o Conferidor guardou. Acha a nota, mostra a situação (emitida ou cancelada),
// liga à OP pelo número que o Fiscal digitou, vigia a numeração (buraco, repetida, inutilizada) e diz quais OPs ainda não têm o XML guardado.
// As regras puras estão em FiscalArquivo.ts, a leitura em FiscalDados.ts e as tabelas em supabase/sql/fiscal_arquivo_de_notas.sql. Só leitura: nada aqui emite nota.
import React, { useEffect, useMemo, useState } from 'react';
import { mdiMagnify, mdiRefresh, mdiDownload, mdiContentCopy } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo, Chips } from './Interface';
import { combinaBusca } from './SearchUtils';
import { baixarPlanilha } from './ExportarPlanilha';
import { copiarTexto } from './CopiarTexto';
import { mostrarAviso } from './Feedback';
import { podeVerValores } from './utils/permissoes';
import { useAbaNoEndereco } from './AbaNoEndereco';
import { formatarDocumento } from './ComprasFornecedores';
import { lerArquivoDeNotas, lerEmitentes, lerXmlGuardado } from './FiscalDados';
import { lerArquivoFiscal, conferirNota, NOMES_DAS_REGRAS } from './FiscalXml';
import { canceladas, situacaoDaNota, ROTULO_DA_SITUACAO, lacunasDaNumeracao, textoDaFaixa, opsDaNota, opsSemXml, soDigitos } from './FiscalArquivo';
import { Janela } from './FiscalCadastrosTela';
import './fiscal.css';

const LIMITE_NA_TELA = 200;
const dinheiro = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataCurta = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—'); };
const FAMILIA_DA_SITUACAO = { emitida: 'ok', cancelada: 'neutro', sem_protocolo: 'atencao', rejeitada: 'erro' };

function baixarTexto(nome: string, texto: string) {
  const u = URL.createObjectURL(new Blob([texto], { type: 'application/xml' }));
  const a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

// ═══ A janela de uma nota ═════════════════════════════════════════════════════════════════════
function NotaModal({ linha, eventos, emitentes, verValores, onClose }) {
  const { n, sit, valor, ops, empresa } = linha;
  const [xml, setXml] = useState<{ texto: string; erro: string; lido: boolean }>({ texto: '', erro: '', lido: !verValores });
  useEffect(() => {
    if (!verValores) return;
    let vivo = true;
    lerXmlGuardado(n.chave).then(r => { if (vivo) setXml({ texto: r.xml, erro: r.erro, lido: true }); });
    return () => { vivo = false; };
  }, [n.chave, verValores]);
  // a conferência é refeita AO VIVO sobre o XML guardado (as regras podem ter mudado desde o dia em que a nota foi guardada)
  const achados = useMemo(() => {
    if (!xml.texto) return null;
    const a = lerArquivoFiscal(n.chave + '.xml', xml.texto);
    return a.tipo === 'nota' ? conferirNota(a, emitentes) : [];
  }, [xml.texto, emitentes, n.chave]);
  const copiar = async () => { const ok = await copiarTexto(n.chave); mostrarAviso(ok ? 'Chave copiada.' : 'Não foi possível copiar: selecione a chave e copie à mão.', ok ? 'ok' : 'erro'); };
  const dele = eventos.filter(e => e.chave === n.chave);
  return (
    <Janela titulo={`Nota ${n.numero} · série ${n.serie ?? '—'} · ${empresa}`} onClose={onClose}
      rodape={<>{xml.texto && <Botao icone={mdiDownload} onClick={() => baixarTexto(`NFe${n.chave}.xml`, xml.texto)}>Baixar o XML</Botao>}<Botao onClick={onClose}>Fechar</Botao></>}>
      <div className="acn-fcad-secao-tit"><Selo familia={FAMILIA_DA_SITUACAO[sit]} ponto={false}>{ROTULO_DA_SITUACAO[sit]}</Selo>
        {n.bloqueios > 0 && <Selo familia="erro" ponto={false}>{n.bloqueios} bloqueio(s) ao guardar</Selo>}
        {n.alertas > 0 && <Selo familia="atencao" ponto={false}>{n.alertas} alerta(s) ao guardar</Selo>}</div>
      <dl className="acn-fcad-dados">
        <div><dt>Emissão</dt><dd>{dataCurta(n.emissao_dia)}</dd></div>
        <div><dt>Emitente</dt><dd>{n.emitente_nome || '—'} ({formatarDocumento(n.emitente_cnpj)})</dd></div>
        <div><dt>Cliente</dt><dd>{n.destinatario_nome || '—'}{n.destinatario_doc ? ` · ${formatarDocumento(n.destinatario_doc)}` : ''}{n.destinatario_uf ? ` · ${n.destinatario_uf}` : ''}</dd></div>
        {verValores && <div><dt>Valor da nota</dt><dd>{dinheiro(valor)}</dd></div>}
        <div><dt>Natureza da operação</dt><dd>{n.natureza || '—'}</dd></div>
        <div><dt>Itens</dt><dd>{n.qtd_itens}</dd></div>
        <div><dt>OP ligada (pelo número digitado)</dt><dd>{ops.length ? ops.map(o => o.opl).join(', ') : 'nenhuma'}</dd></div>
        <div><dt>Veio do arquivo</dt><dd>{n.arquivo || '—'}</dd></div>
      </dl>
      <div><span className="acn-fcad-dica">Chave de acesso</span> <Botao pequeno variante="discreto" icone={mdiContentCopy} aria-label="Copiar a chave" onClick={copiar} />
        <div className="acn-fcad-chave">{n.chave}</div></div>
      {dele.length > 0 && (
        <div className="acn-fcad-resultado"><h3 className="acn-fcad-secao-tit">Eventos</h3>
          {dele.map((e, i) => <div key={i} className="acn-fcad-achado"><Selo familia="neutro" ponto={false}>{e.tp_evento === '110111' ? 'Cancelamento' : e.tp_evento === '110110' ? 'Carta de correção' : e.tp_evento}</Selo><span>{dataCurta(e.data_dia)}{e.texto ? ` — ${e.texto}` : ''}{e.cstat ? ` (situação ${e.cstat})` : ''}</span></div>)}
        </div>
      )}
      <div className="acn-fcad-resultado"><h3 className="acn-fcad-secao-tit">Conferência (refeita agora sobre o XML guardado)</h3>
        {!verValores ? <p className="acn-fcad-dica">O XML traz os valores: quem não vê valores não o abre.</p>
          : !xml.lido ? <p className="acn-fcad-dica">Lendo o XML…</p>
          : xml.erro ? <Faixa tom="erro">{xml.erro}</Faixa>
          : !achados.length ? <Selo familia="ok" ponto={false}>Nenhum achado</Selo>
          : achados.map((a, i) => (
            <div key={i} className={'acn-fcad-achado ' + (a.nivel === 'bloqueia' ? 'acn-fcad-achado-b' : 'acn-fcad-achado-a')}>
              <Selo familia={a.nivel === 'bloqueia' ? 'erro' : 'atencao'} ponto={false}>{a.nivel === 'bloqueia' ? 'Bloqueia' : 'Alerta'}</Selo>
              <span><strong>{NOMES_DAS_REGRAS[a.regra] || a.regra}.</strong> {a.texto}</span>
            </div>))}
      </div>
    </Janela>
  );
}

// ═══ A aba ════════════════════════════════════════════════════════════════════════════════════
export default function FiscalArquivoTela({ currentUser, aoIrAoConferidor }) {
  const verValores = podeVerValores(currentUser);
  const [visao, setVisao] = useAbaNoEndereco({ tela: 'fiscal', nivel: 1, pai: 'arquivo' }) as [string, (v: any) => void];
  const [d, setD] = useState<any>(null);
  const [emitentes, setEmitentes] = useState<any[]>([]);
  const [erroEmit, setErroEmit] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [ano, setAno] = useState('');
  const [serie, setSerie] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [aberta, setAberta] = useState<any>(null);

  const carregar = async () => {
    setCarregando(true);
    const [r, em] = await Promise.all([lerArquivoDeNotas(verValores), lerEmitentes()]);
    setD(r); setEmitentes((em.lista || []).map((e: any) => ({ cnpj: e.cnpj, crt: e.crt, codigo: e.codigo }))); setErroEmit(em.erro || '');
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const codigos = useMemo(() => new Map(emitentes.map(e => [soDigitos(e.cnpj), e.codigo])), [emitentes]);
  const canc = useMemo(() => canceladas(d?.eventos || []), [d]);
  const linhas = useMemo(() => (d?.notas || []).map((n: any) => ({
    n, sit: situacaoDaNota(n, canc), valor: d.valores.get(n.chave), ops: opsDaNota(n, d.ops, codigos),
    empresa: codigos.get(soDigitos(n.emitente_cnpj)) || formatarDocumento(n.emitente_cnpj),
  })), [d, canc, codigos]);
  const empresas = useMemo(() => [...new Set(linhas.map(l => l.empresa))].sort(), [linhas]);
  const anos = useMemo(() => [...new Set(linhas.map(l => (l.n.emissao_dia || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [linhas]);
  const series = useMemo(() => [...new Set(linhas.map(l => l.n.serie).filter(s => s != null))].sort((a, b) => a - b), [linhas]);

  const filtradas = useMemo(() => linhas.filter(l => {
    if (empresa && l.empresa !== empresa) return false;
    if (ano && (l.n.emissao_dia || '').slice(0, 4) !== ano) return false;
    if (serie && String(l.n.serie) !== serie) return false;
    if (situacao === 'bloqueio' && !l.n.bloqueios) return false;
    if (situacao === 'alerta' && !(l.n.alertas > 0)) return false;
    if (situacao === 'sem_op' && l.ops.length) return false;
    if (['emitida', 'cancelada', 'sem_protocolo', 'rejeitada'].includes(situacao) && l.sit !== situacao) return false;
    return !busca.trim() || combinaBusca([l.n.numero, l.n.chave, l.n.destinatario_nome, l.n.destinatario_doc, l.n.emitente_nome, l.n.natureza, l.ops.map(o => o.opl).join(' ')].join(' '), busca);
  }), [linhas, empresa, ano, serie, situacao, busca]);

  const resumo = useMemo(() => ({
    total: linhas.length, canceladas: linhas.filter(l => l.sit === 'cancelada').length, bloqueio: linhas.filter(l => l.n.bloqueios > 0).length,
    semProtocolo: linhas.filter(l => l.sit === 'sem_protocolo').length,
    valor: filtradas.filter(l => l.sit !== 'cancelada').reduce((s, l) => s + (l.valor || 0), 0),
  }), [linhas, filtradas]);

  const grupos = useMemo(() => lacunasDaNumeracao(d?.notas || [], d?.inutilizacoes || []), [d]);
  const semXml = useMemo(() => opsSemXml(d?.ops || [], d?.notas || [], codigos), [d, codigos]);
  const totalDeBuracos = grupos.reduce((s, g) => s + g.faltam.length, 0);
  const nomeDaEmpresa = (cnpj: string) => codigos.get(soDigitos(cnpj)) || formatarDocumento(cnpj);

  const erros = d ? Object.entries(d.erros).map(([k, v]) => `${{ notas: 'as notas', eventos: 'os cancelamentos e cartas', inutilizacoes: 'as inutilizações', valores: 'os valores', ops: 'as OPs' }[k] || k} (${v})`) : [];

  const exportarNotas = () => baixarPlanilha('Notas_emitidas', [{ nome: 'Notas', colunas: [{ rotulo: 'Empresa' }, { rotulo: 'Número' }, { rotulo: 'Série' }, { rotulo: 'Emissão', largura: 12 }, { rotulo: 'Cliente', largura: 34 }, { rotulo: 'CNPJ/CPF', largura: 20 }, ...(verValores ? [{ rotulo: 'Valor', formato: 'moeda' }] : []), { rotulo: 'Situação', largura: 14 }, { rotulo: 'Bloqueios', formato: 'inteiro' }, { rotulo: 'Alertas', formato: 'inteiro' }, { rotulo: 'OP', largura: 20 }, { rotulo: 'Chave', largura: 46 }],
    linhas: filtradas.map(l => [l.empresa, l.n.numero, l.n.serie, dataCurta(l.n.emissao_dia), l.n.destinatario_nome || '', l.n.destinatario_doc || '', ...(verValores ? [l.valor ?? 0] : []), ROTULO_DA_SITUACAO[l.sit], l.n.bloqueios, l.n.alertas, l.ops.map(o => o.opl).join(', '), l.n.chave]) }]);
  const exportarNumeracao = () => baixarPlanilha('Numeracao_das_notas', [{ nome: 'Numeração', colunas: [{ rotulo: 'Empresa' }, { rotulo: 'Série' }, { rotulo: 'Primeiro' }, { rotulo: 'Último' }, { rotulo: 'Guardadas' }, { rotulo: 'Inutilizadas' }, { rotulo: 'Faltam', formato: 'inteiro' }, { rotulo: 'Números que faltam', largura: 70 }],
    linhas: grupos.map(g => [nomeDaEmpresa(g.cnpj), g.serie, g.primeiro, g.ultimo, g.guardadas, g.inutilizadas, g.faltam.length, g.faixasQueFaltam.map(textoDaFaixa).join(', ')]) }]);
  const exportarSemXml = () => baixarPlanilha('OPs_sem_XML', [{ nome: 'OPs sem XML', colunas: [{ rotulo: 'OP', largura: 16 }, { rotulo: 'Empresa' }, { rotulo: 'Número da nota digitado' }],
    linhas: semXml.map(x => [x.opl, x.empresa, x.numero]) }]);

  const vazio = !carregando && d && !d.erros.notas && d.notas.length === 0;

  return (
    <div>
      <Chips ativo={visao} onChange={setVisao} rotulo="Visão" itens={[
        { id: 'notas', rotulo: 'Notas', contagem: d ? resumo.total : null },
        { id: 'numeracao', rotulo: 'Numeração', contagem: d ? totalDeBuracos : null, titulo: 'Números que faltam entre a menor e a maior nota guardada' },
        { id: 'sem_xml', rotulo: 'OPs sem XML', contagem: d ? semXml.length : null, titulo: 'OPs com número de nota digitado cuja nota não está no arquivo' },
      ]} />
      {erros.length > 0 && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler {erros.join('; ')}. {d.erros.notas ? 'A lista está incompleta e os números abaixo estão errados.' : 'O que depende disso aparece incompleto.'}</Faixa>}
      {erroEmit && <Faixa tom="atencao">Não foi possível ler as empresas emitentes ({erroEmit}): a empresa de cada nota aparece pelo CNPJ e a ligação com a OP fica mais frouxa.</Faixa>}

      {vazio && visao === 'notas' ? (
        <div className="acn-fcad-guardar">
          <div><strong>Nenhuma nota guardada ainda.</strong><p className="acn-fcad-dica">Solte os XMLs no Conferidor de XML e clique em "Guardar no arquivo": as notas aparecem aqui, ligadas às OPs, com a numeração vigiada.</p></div>
          <Botao variante="primario" onClick={aoIrAoConferidor}>Ir ao Conferidor de XML</Botao>
        </div>
      ) : (
        <>
          {visao === 'notas' && (
            <>
              <div className="acn-kpis">
                <div className="acn-kpi"><span className="rot">Notas guardadas</span><span className="val acn-num">{resumo.total}</span><span className="sub">{resumo.canceladas} cancelada(s)</span></div>
                <div className="acn-kpi"><span className="rot"><i data-acn-familia="erro" />Com bloqueio</span><span className="val acn-num">{resumo.bloqueio}</span><span className="sub">quando foram guardadas</span></div>
                <div className="acn-kpi"><span className="rot"><i data-acn-familia="atencao" />Sem protocolo</span><span className="val acn-num">{resumo.semProtocolo}</span><span className="sub">o XML não trouxe a resposta da SEFAZ</span></div>
                {verValores && <div className="acn-kpi"><span className="rot">Valor da lista</span><span className="val acn-num">{dinheiro(resumo.valor)}</span><span className="sub">sem as canceladas, com os filtros de baixo</span></div>}
              </div>
              <div className="acn-fcad-barra">
                <div className="acn-cmp-busca-geral"><Icone path={mdiMagnify} size={14} /><input className="acn-input" type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar nota" placeholder="Número, cliente, chave, OP…" /></div>
                <select className="acn-input acn-select-mini" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa"><option value="">Todas as empresas</option>{empresas.map(x => <option key={x}>{x}</option>)}</select>
                <select className="acn-input acn-select-mini" value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano"><option value="">Todos os anos</option>{anos.map(x => <option key={x}>{x}</option>)}</select>
                <select className="acn-input acn-select-mini" value={serie} onChange={e => setSerie(e.target.value)} aria-label="Série"><option value="">Todas as séries</option>{series.map(x => <option key={x} value={String(x)}>Série {x}</option>)}</select>
                <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
                <Botao pequeno icone={mdiDownload} onClick={exportarNotas} disabled={carregando || !filtradas.length}>Baixar planilha</Botao>
              </div>
              <div className="acn-fcad-barra"><Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[
                { id: 'todas', rotulo: 'Todas' }, { id: 'emitida', rotulo: 'Emitidas' }, { id: 'cancelada', rotulo: 'Canceladas' }, { id: 'bloqueio', rotulo: 'Com bloqueio' }, { id: 'alerta', rotulo: 'Com alerta' }, { id: 'sem_protocolo', rotulo: 'Sem protocolo' }, { id: 'sem_op', rotulo: 'Sem OP ligada' },
              ]} /></div>
              {filtradas.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando as primeiras {LIMITE_NA_TELA} de {filtradas.length} notas. Use a busca ou os filtros; a planilha leva todas.</Faixa>}
              <div className="acn-rolagem">
                <table className="acn-tabela acn-densa">
                  <thead><tr><th>Nota</th><th>Emissão</th><th>Cliente</th>{verValores && <th>Valor</th>}<th>Situação</th><th>OP</th><th>Conferência</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filtradas.slice(0, LIMITE_NA_TELA).map(l => (
                      <tr key={l.n.chave}>
                        <td className="acn-fcad-num"><strong>{l.n.numero}</strong> / série {l.n.serie ?? '—'}<div className="acn-fraco">{l.empresa}</div></td>
                        <td className="acn-fcad-num">{dataCurta(l.n.emissao_dia)}</td>
                        <td>{l.n.destinatario_nome || '—'}<div className="acn-fraco acn-fcad-num">{formatarDocumento(l.n.destinatario_doc)}{l.n.destinatario_uf ? ` · ${l.n.destinatario_uf}` : ''}</div></td>
                        {verValores && <td className="acn-fcad-num">{dinheiro(l.valor)}</td>}
                        <td><Selo familia={FAMILIA_DA_SITUACAO[l.sit]} ponto={false}>{ROTULO_DA_SITUACAO[l.sit]}</Selo></td>
                        <td>{l.ops.length ? l.ops.map(o => o.opl).join(', ') : <span className="acn-fraco">—</span>}</td>
                        <td><div className="acn-fcad-faltas">{l.n.bloqueios > 0 && <Selo familia="erro" ponto={false}>{l.n.bloqueios} bloqueio(s)</Selo>}{l.n.alertas > 0 && <Selo familia="atencao" ponto={false}>{l.n.alertas} alerta(s)</Selo>}{!l.n.bloqueios && !l.n.alertas && <Selo familia="ok" ponto={false}>Nenhum</Selo>}</div></td>
                        <td><div className="acn-fcad-acoes"><Botao pequeno onClick={() => setAberta(l)}>Abrir</Botao></div></td>
                      </tr>
                    ))}
                    {!filtradas.length && <tr><td colSpan={verValores ? 8 : 7} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : d?.erros.notas ? 'Não foi possível ler.' : 'Nenhuma nota com esse filtro.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {visao === 'numeracao' && (
            <>
              <div className="acn-ajuda">Para cada empresa e série, os números que faltam entre a menor e a maior nota guardada, já descontando o que foi inutilizado (cancelada tem XML, então não é buraco). <strong>O arquivo só enxerga o que está dentro dele:</strong> se faltam XMLs antes da primeira nota ou depois da última, esta conta não sabe.</div>
              <div className="acn-fcad-barra"><Botao pequeno icone={mdiDownload} onClick={exportarNumeracao} disabled={!grupos.length}>Baixar planilha</Botao></div>
              <div className="acn-rolagem">
                <table className="acn-tabela acn-densa">
                  <thead><tr><th>Empresa</th><th>Série</th><th>Guardadas</th><th>Primeiro → último</th><th>Inutilizadas</th><th>Faltam</th><th>Repetidas</th></tr></thead>
                  <tbody>
                    {grupos.map(g => (
                      <tr key={`${g.cnpj}|${g.serie}|${g.modelo}`}>
                        <td><strong>{nomeDaEmpresa(g.cnpj)}</strong></td>
                        <td className="acn-fcad-num">{g.serie}</td>
                        <td className="acn-fcad-num">{g.guardadas}</td>
                        <td className="acn-fcad-num">{g.primeiro} → {g.ultimo}</td>
                        <td className="acn-fcad-num">{g.inutilizadas}</td>
                        <td>{g.faltam.length ? <div className="acn-fcad-faltas"><Selo familia="atencao" ponto={false}>{g.faltam.length} número(s)</Selo><span className="acn-fcad-num">{g.faixasQueFaltam.slice(0, 20).map(textoDaFaixa).join(', ')}{g.faixasQueFaltam.length > 20 ? ' e mais' : ''}</span></div> : <Selo familia="ok" ponto={false}>Nenhum</Selo>}</td>
                        <td>{g.repetidas.length ? <Selo familia="erro" ponto={false} title={g.repetidas.map(r => `nº ${r.numero}`).join(', ')}>{g.repetidas.length} número(s)</Selo> : <span className="acn-fraco">—</span>}</td>
                      </tr>
                    ))}
                    {!grupos.length && <tr><td colSpan={7} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : 'Nenhuma nota guardada para vigiar.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {visao === 'sem_xml' && (
            <>
              <div className="acn-ajuda">As OPs em que o Fiscal digitou o número da nota e que NÃO têm essa nota guardada no arquivo (mesma empresa e mesmo número): são os XMLs que ainda faltam. Quando o Focco sair, esta lista tem de estar vazia.</div>
              <div className="acn-fcad-barra"><Botao pequeno icone={mdiDownload} onClick={exportarSemXml} disabled={!semXml.length}>Baixar planilha</Botao>{aoIrAoConferidor && <Botao pequeno onClick={aoIrAoConferidor}>Ir ao Conferidor de XML</Botao>}</div>
              {semXml.length > LIMITE_NA_TELA && <Faixa tom="atencao">Mostrando as primeiras {LIMITE_NA_TELA} de {semXml.length}. A planilha leva todas.</Faixa>}
              <div className="acn-rolagem">
                <table className="acn-tabela acn-densa">
                  <thead><tr><th>OP</th><th>Empresa que faturou</th><th>Nota digitada</th></tr></thead>
                  <tbody>
                    {semXml.slice(0, LIMITE_NA_TELA).map(x => <tr key={x.opl + '|' + x.numero}><td><strong>{x.opl}</strong></td><td>{x.empresa || '—'}</td><td className="acn-fcad-num">{x.numero}</td></tr>)}
                    {!semXml.length && <tr><td colSpan={3} className="acn-centro acn-fraco">{carregando ? 'Carregando…' : d?.erros.ops || d?.erros.notas ? 'Não foi possível ler.' : 'Toda OP com nota digitada tem o XML no arquivo.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {aberta && <NotaModal linha={aberta} eventos={d?.eventos || []} emitentes={emitentes} verValores={verValores} onClose={() => setAberta(null)} />}
    </div>
  );
}
