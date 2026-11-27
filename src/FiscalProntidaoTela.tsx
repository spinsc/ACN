// @ts-nocheck
// As peças de tela da prontidão da OP para virar nota e da nota guardada na OP (preparação do módulo fiscal, 26/11/2026). As regras estão em FiscalProntidao.ts e FiscalArquivo.ts, a leitura em
// FiscalDados.ts. Só mostra: nada aqui grava. Leitura recusada nunca vira "pronta" nem "sem nota guardada": a tela diz que não conseguiu conferir.
import React, { useState, useEffect, useMemo } from 'react';
import './fiscal.css';
import { Selo, Faixa, Botao, diaBR } from './Interface';
import { lerContextoDaProntidao, lerNotasDaOp } from './FiscalDados';
import { prontidaoDaOp, oQueAsOpsCitam } from './FiscalProntidao';
import { canceladas, situacaoDaNota, notasDaOp, numerosDaNotaDaOp, ROTULO_DA_SITUACAO, soDigitos } from './FiscalArquivo';
import { podeVerArquivoFiscal } from './utils/permissoes';

const ROTULO_DO_GRUPO = { empresa: 'Empresa', cliente: 'Cliente', item: 'Item' };
const FAMILIA_DA_SITUACAO = { emitida: 'ok', cancelada: 'neutro', sem_protocolo: 'atencao', rejeitada: 'erro' };

/**
 * A conferência de uma lista de OPs. Lê UMA vez quando a lista (ou o que ela vende) muda: a tela do Faturamento reabre a lista de 30 em 30 s e isto não pode acompanhá-la.
 * `mapa` = id da OP → prontidão; `erro` = o banco recusou alguma leitura (nenhuma OP é dada como pronta nem como incompleta); `carregando` = ainda não leu.
 */
export function useProntidaoDasOps(ops) {
  const [estado, setEstado] = useState({ ctx: null, erro: '', lido: false });
  const [tentativa, setTentativa] = useState(0);
  const chave = useMemo(() => {
    const c = oQueAsOpsCitam(ops || []);
    return [(ops || []).map(o => o.id).sort().join(','), c.itemIds.slice().sort().join(','), c.nomes.slice().sort().join(',')].join('|');
  }, [ops]);
  useEffect(() => {
    if (!(ops || []).length) { setEstado({ ctx: null, erro: '', lido: true }); return undefined; }
    let vivo = true;
    lerContextoDaProntidao(ops).then(r => { if (vivo) setEstado({ ctx: r.ctx, erro: r.erro, lido: true }); });
    return () => { vivo = false; };
  }, [chave, tentativa]);
  const mapa = useMemo(() => {
    const m = new Map();
    if (estado.ctx) for (const o of ops || []) m.set(o.id, prontidaoDaOp(o, estado.ctx));
    return m;
  }, [ops, estado.ctx]);
  return { mapa, erro: estado.erro, carregando: !estado.lido, recarregar: () => setTentativa(n => n + 1) };
}

/** O selo da linha: verde quando está pronta, âmbar com a conta do que falta. O clique abre o detalhe. */
export function SeloDaProntidao({ p, onClick }) {
  if (!p) return null;
  const pronta = p.situacao === 'pronta';
  const dica = pronta
    ? 'Cliente, itens e empresa com os dados fiscais completos. Clique para ver o que foi conferido.'
    : p.pendencias.map(x => `${x.titulo}: ${x.faltas.join(', ')}`).join('\n');
  return (
    <Selo familia={pronta ? 'ok' : 'atencao'} ponto={false} title={dica} onClick={onClick}>
      {pronta ? 'Pronta para a nota' : `Faltam dados fiscais (${p.totalDeFaltas})`}
    </Selo>
  );
}

/** O detalhe: o que falta, por empresa, cliente e item, e o que foi conferido. Serve à janela do Faturamento e ao Dossiê. */
export function DetalheDaProntidao({ p, aoIrAosCadastros }) {
  if (!p) return null;
  return (
    <div className="acn-fcad-prontidao">
      {p.situacao === 'pronta'
        ? <div className="acn-fcad-achado"><Selo familia="ok" ponto={false}>Pronta</Selo><span>Empresa, cliente e {p.itensConferidos} item(ns) com os dados fiscais completos.</span></div>
        : p.pendencias.map((x, i) => (
          <div key={i} className="acn-fcad-pend">
            <div className="acn-fcad-pend-tit"><Selo familia="neutro" ponto={false}>{ROTULO_DO_GRUPO[x.grupo]}</Selo><strong>{x.titulo}</strong></div>
            <ul className="acn-fcad-lista">{x.faltas.map(f => <li key={f}>{f}</li>)}</ul>
          </div>
        ))}
      {p.itensIgnorados > 0 && <p className="acn-fcad-dica">{p.itensIgnorados} linha(s) de serviço ou item genérico não entram nesta conferência (não levam NCM, CEST nem origem).</p>}
      {p.situacao !== 'pronta' && aoIrAosCadastros && (
        <div className="acn-fcad-rodape"><Botao pequeno onClick={aoIrAosCadastros}>Abrir Cadastros fiscais</Botao><span className="acn-fcad-dica">Preencha lá e volte a esta tela: a conferência é refeita ao voltar.</span></div>
      )}
    </div>
  );
}

/**
 * O quadro "Nota fiscal" do Dossiê da OP: se a OP ainda não tem nota, a prontidão (cada OP mostra cedo o que vai travar a nota); se tem, a nota guardada no arquivo do Fiscal
 * (número, série, empresa, dia, situação e chave). O arquivo só é lido por quem tem a aba Fiscal: para os outros a tela não afirma nem "tem" nem "não tem" XML guardado.
 */
export function QuadroFiscalDaOp({ op, currentUser }) {
  const numeros = useMemo(() => [...new Set(numerosDaNotaDaOp(op?.numero_nf))], [op?.numero_nf]);
  const temNota = numeros.length > 0;
  const verArquivo = podeVerArquivoFiscal(currentUser);
  const ops = useMemo(() => [op], [op]);
  const pront = useProntidaoDasOps(temNota ? [] : ops);
  const [arq, setArq] = useState({ lido: false, notas: [], eventos: [], codigoDoCnpj: new Map(), erro: '' });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!temNota || !verArquivo) return undefined;
    let vivo = true;
    lerNotasDaOp(op).then(r => { if (vivo) setArq({ ...r, lido: true }); });
    return () => { vivo = false; };
  }, [op?.id, op?.numero_nf, temNota, verArquivo, tentativa]);

  const p = pront.mapa.get(op?.id);
  const canc = useMemo(() => canceladas(arq.eventos || []), [arq]);
  const guardadas = useMemo(() => (arq.lido && !arq.erro ? notasDaOp(op, arq.notas, arq.codigoDoCnpj) : []), [arq, op]);
  const tentarDeNovo = (aoClicar) => <Botao pequeno onClick={aoClicar}>Tentar de novo</Botao>;

  if (!temNota) {
    if (pront.carregando) return <div className="acn-dos-nada">Conferindo os dados fiscais…</div>;
    if (pront.erro) return <Faixa tom="erro" acao={tentarDeNovo(pront.recarregar)}>Não foi possível conferir os dados fiscais agora: {pront.erro}</Faixa>;
    if (!p) return <div className="acn-dos-nada">Nada a conferir.</div>;
    return (
      <div className="acn-fcad-secao-sem-linha">
        <div className="acn-fcad-secao-tit"><SeloDaProntidao p={p} /><span className="acn-fcad-dica">Prontidão para virar nota: empresa que fatura, cliente e itens vendidos.</span></div>
        <DetalheDaProntidao p={p} />
      </div>
    );
  }

  return (
    <div className="acn-fcad-secao-sem-linha">
      <div className="acn-fcad-dica">Nota informada pelo Fiscal na OP: {numeros.join(', ')}{op.faturamento_empresa ? ` · ${op.faturamento_empresa}` : ''}.</div>
      {!verArquivo
        ? <div className="acn-fcad-dica">O arquivo de notas guardadas só aparece para quem tem a aba Fiscal.</div>
        : !arq.lido
          ? <div className="acn-dos-nada">Procurando a nota no arquivo…</div>
          : arq.erro
            ? <Faixa tom="erro" acao={tentarDeNovo(() => setTentativa(n => n + 1))}>Não foi possível ler o arquivo de notas agora: {arq.erro}</Faixa>
            : guardadas.length === 0
              ? <div className="acn-fcad-achado"><Selo familia="atencao" ponto={false}>Sem XML guardado</Selo><span>Nenhuma nota com este número e esta empresa no arquivo. Solte o XML no Conferidor de XML e use "Guardar no arquivo".</span></div>
              : guardadas.map(n => {
                const sit = situacaoDaNota(n, canc);
                const empresa = arq.codigoDoCnpj.get(soDigitos(n.emitente_cnpj)) || n.emitente_nome || '—';
                return (
                  <div key={n.chave} className="acn-fcad-nota">
                    <div className="acn-fcad-secao-tit"><Selo familia={FAMILIA_DA_SITUACAO[sit]} ponto={false}>{ROTULO_DA_SITUACAO[sit]}</Selo>
                      <span>Nota {n.numero} · série {n.serie ?? '—'} · {empresa} · {diaBR(n.emissao_dia)}</span>
                      {n.bloqueios > 0 && <Selo familia="erro" ponto={false}>{n.bloqueios} bloqueio(s) ao guardar</Selo>}</div>
                    <div className="acn-fcad-chave">{n.chave}</div>
                  </div>
                );
              })}
    </div>
  );
}
