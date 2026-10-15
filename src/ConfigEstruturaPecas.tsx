// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS DA TELA "ESTRUTURA DE INSTALAÇÃO" (16/10/2026, redesenho pedido pelo usuário)
//
// Saíram de ConfigEstruturaTela.tsx para a tela não virar um arquivo só de mil linhas:
//   ItensEscolhidos / EditorDeItens   escolher itens por busca (antes era uma caixa de texto com códigos separados por vírgula)
//   FraseDaRegra                      "SE … E … ENTÃO usa …", a regra lida de uma vez
//   CoberturaDasRegras                toda combinação de respostas tem regra? (usa o mesmo cálculo da OP)
//   SimuladorDaEstrutura              "o que uma OP recebe com estas respostas" (usa o mesmo cálculo da OP; só leitura)
//
// Só componentes do guia (Interface.tsx) e classes `acn-cet-*` do design.css: nenhum estilo solto.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { SelectBusca, Botao, Selo, Faixa } from './Interface';
import Icone from './Icone';
import { mdiClose, mdiPlayCircleOutline, mdiPlus } from '@mdi/js';
import { ehQuantidade, ehPerguntaDaOp, valorDeQuantidade, respostaDeQuantidade, perguntasPendentes, respostasAutomaticas, donaDaPergunta } from './ConfigEstrutura';
import { lerBaseDaEstrutura, calcularDaEstrutura } from './CalculoDaEstrutura';
import { textoDaCombinacao } from './CoberturaDaEstrutura';

export const rotuloDoItem = (itens: any[], id: string) => {
  const i = (itens || []).find(x => x.id === id);
  return i ? `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}` : '(item)';
};
const opcoesDeItem = (itens: any[]) => (itens || []).map(i => ({
  valor: i.id, rotulo: `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}`, busca: [i.codigo, i.nome],
}));

/** Itens já escolhidos como etiquetas com ✕, e a busca para acrescentar mais um. `ids` e `aoMudar` são controlados por quem chama. */
export function ItensEscolhidos({ ids, itens, aoMudar, placeholder = 'Acrescentar item (nome ou código)', somenteLeitura = false }) {
  const jaTem = new Set((ids || []).map(String));
  return (
    <div className="acn-cet-itens">
      {(ids || []).length > 0 && (
        <div className="acn-cet-chips">
          {ids.map(id => (
            <span key={id} className="acn-cet-chip">
              <Selo familia="info" ponto={false}>{rotuloDoItem(itens, id)}</Selo>
              {!somenteLeitura && (
                <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Tirar ${rotuloDoItem(itens, id)}`}
                  onClick={() => aoMudar(ids.filter(x => x !== id))} />
              )}
            </span>
          ))}
        </div>
      )}
      {!somenteLeitura && (
        <SelectBusca opcoes={opcoesDeItem((itens || []).filter(i => !jaTem.has(String(i.id))))} valor=""
          onChange={(v) => { if (v) aoMudar([...(ids || []), v]); }} placeholder={placeholder} />
      )}
    </div>
  );
}

/**
 * Painel que abre embaixo de uma pergunta ou resposta para escolher os itens da condição. `aoSalvar(ids)` devolve um texto de erro (ou vazio se gravou).
 * Salvar sem itens apaga a condição — como o texto vazio apagava antes.
 */
export function EditorDeItens({ titulo, ajuda, idsIniciais, itens, aoSalvar, aoCancelar }) {
  const [ids, setIds] = useState((idsIniciais || []).map(String));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const e = await aoSalvar(ids);
    setOcupado(false);
    if (e) setErro(e);
  };
  return (
    <div className="acn-cet-editor" role="group" aria-label={titulo}>
      <div className="acn-cet-editor-tit">{titulo}</div>
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
      <ItensEscolhidos ids={ids} itens={itens} aoMudar={setIds} />
      {erro && <Faixa tom="erro">{erro}</Faixa>}
      <div className="acn-cet-editor-acoes">
        <Botao pequeno variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Gravando…' : (ids.length ? 'Salvar' : 'Salvar sem itens (apaga a condição)')}</Botao>
        <Botao pequeno variante="discreto" disabled={ocupado} onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

/** A regra em uma frase: SE [condições] ENTÃO [material]. */
export function FraseDaRegra({ condicoes, saidas, textoCondicao, rotuloMaterial }) {
  return (
    <div className="acn-cet-frase">
      <span className="acn-cet-pal">SE</span>
      {(condicoes || []).length === 0 && <span className="acn-ajuda">(ainda sem condição)</span>}
      {(condicoes || []).map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="acn-cet-pal">E</span>}
          <Selo familia="info" ponto={false}>{textoCondicao(c)}</Selo>
        </React.Fragment>
      ))}
      <span className="acn-cet-pal">ENTÃO</span>
      {(saidas || []).length === 0 && <span className="acn-ajuda">(ainda sem material)</span>}
      {(saidas || []).map((s, i) => (
        <Selo key={i} familia={s.acao === 'remover' ? 'erro' : 'ok'} ponto={false}>
          {s.acao === 'remover' ? 'tira' : 'usa'} {s.quantidade} · {rotuloMaterial(s)}
        </Selo>
      ))}
    </div>
  );
}

/**
 * COBERTURA: para cada combinação de respostas das perguntas que as regras usam, o que a OP recebe — e onde ela mostraria "chicote/suporte a definir".
 * `cobertura` vem de coberturaDoVeiculo(), `semRegra` de perguntasSemRegra().
 */
export function CoberturaDasRegras({ cobertura, semRegra, totalDeRegras, pode, aoSimular, aoCriarRegra }) {
  const { eixos, linhas, total, truncado, condicionais } = cobertura;
  const faltando = linhas.filter(l => l.estado === 'definir').length;
  const perguntasDaOp = semRegra.filter(p => ehPerguntaDaOp(p));
  const perguntasDeQuantidade = semRegra.filter(p => !ehPerguntaDaOp(p));
  return (
    <div className="acn-cet-cob">
      {/* pergunta da OP é feita em toda venda com Conjunto Elétrico: sem regra, a OP mostra "a definir" sempre. Pergunta de quantidade de um item só importa se o item for vendido */}
      {perguntasDaOp.length > 0 && (
        <Faixa tom="atencao">
          {perguntasDaOp.length === 1 ? 'Uma pergunta da OP' : `${perguntasDaOp.length} perguntas da OP`} que nenhuma regra deste veículo usa — a OP mostra "chicote/suporte a definir" para qualquer resposta:{' '}
          <b>{perguntasDaOp.map(p => p.texto).join('; ')}</b>.
        </Faixa>
      )}
      {perguntasDeQuantidade.length > 0 && (
        <div className="acn-ajuda">
          Pergunta de quantidade que nenhuma regra usa (só importa se o item for vendido com quantidade acima de zero): <b>{perguntasDeQuantidade.map(p => p.texto).join('; ')}</b>.
        </div>
      )}
      {totalDeRegras === 0 && <div className="acn-ajuda">Nenhuma regra neste veículo ainda: não há combinação para conferir.</div>}
      {totalDeRegras > 0 && !eixos.length && !truncado && (
        <div className="acn-ajuda">As regras deste veículo só dependem de item vendido junto ou de quantidade: não há combinação de respostas para conferir.</div>
      )}
      {truncado && <Faixa tom="info">São {total} combinações de respostas — muitas para listar. Use o simulador abaixo para conferir uma de cada vez.</Faixa>}
      {eixos.length > 0 && !truncado && (
        <>
          <div className="acn-cet-cob-resumo">
            {faltando === 0
              ? <Selo familia="ok">Todas as {total} combinações têm regra</Selo>
              : <Selo familia="atencao">{faltando} de {total} combinações sem regra (a definir)</Selo>}
          </div>
          <div className="acn-cet-cob-linha cab" data-colunas={Math.min(eixos.length, 6)}>
            {eixos.map(p => <span key={p.id} title={p.texto}>{p.texto}</span>)}
            <span>O que a OP recebe</span>
            <span />
          </div>
          {linhas.map((l, i) => (
            <div key={i} className="acn-cet-cob-linha" data-colunas={Math.min(eixos.length, 6)} data-estado={l.estado}>
              {eixos.map(p => <span key={p.id}>{(p.opcoes || []).find(o => o.id === l.respostas[p.id])?.rotulo || '—'}</span>)}
              <span>
                {l.estado === 'ok'
                  ? <Selo familia="ok" ponto={false}>{l.aplicadas.length === 1 ? '1 regra' : `${l.aplicadas.length} regras (o material soma)`}</Selo>
                  : <Selo familia="atencao" ponto={false} title={`Sem regra para: ${l.faltam.map(p => p.texto).join('; ')}`}>a definir</Selo>}
              </span>
              <span className="acn-cet-cob-acoes">
                <Botao pequeno variante="discreto" icone={mdiPlayCircleOutline} onClick={() => aoSimular(l.respostas)} title={`Simular: ${textoDaCombinacao(l, eixos)}`}>Simular</Botao>
                {pode && l.estado === 'definir' && (
                  <Botao pequeno variante="secundario" icone={mdiPlus} onClick={() => aoCriarRegra(l.respostas, eixos)}>Criar regra</Botao>
                )}
              </span>
            </div>
          ))}
        </>
      )}
      {condicionais.length > 0 && (
        <div className="acn-ajuda">
          {condicionais.length === 1 ? '1 regra depende' : `${condicionais.length} regras dependem`} de item vendido junto ou de quantidade e {condicionais.length === 1 ? 'fica' : 'ficam'} fora desta conta: só a venda diz se valem.
        </div>
      )}
    </div>
  );
}

/**
 * SIMULADOR: monta uma OP de mentira (o veículo escolhido, o Conjunto Elétrico e os itens vendidos que a pessoa marcar), deixa responder as perguntas e mostra o que a
 * conta oficial (`calcularDaEstrutura`, a mesma da OP) devolveria. Só lê; nada é gravado.
 */
export function SimuladorDaEstrutura({ veiculo, itens, combinacao, sinal }) {
  const [vendidos, setVendidos] = useState([]);          // itens vendidos além do Conjunto Elétrico
  const [respostas, setRespostas] = useState({});        // pergunta_id → opcao_id | "q:N"
  const [base, setBase] = useState(null);
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const conjunto = (itens || []).find(i => i.eh_conjunto_instalacao);

  // "Simular" na tabela da cobertura entra por aqui; `sinal` muda a cada clique, mesmo repetindo a mesma combinação
  useEffect(() => { if (combinacao) setRespostas(r => ({ ...r, ...combinacao })); }, [sinal]);

  useEffect(() => {
    if (!veiculo?.id || !conjunto) { setBase(null); return; }
    let vivo = true;
    setLendo(true); setErro('');
    const opl = { veiculo_id: veiculo.id, itens_vendidos: [{ item_id: conjunto.id, quantidade: 1 }, ...vendidos.map(id => ({ item_id: id, quantidade: 1 }))] };
    lerBaseDaEstrutura(opl)
      .then(b => { if (vivo) setBase(b); })
      .catch(e => { if (vivo) { setBase(null); setErro(e?.message || 'falha ao ler'); } })
      .finally(() => { if (vivo) setLendo(false); });
    return () => { vivo = false; };
  }, [veiculo?.id, conjunto?.id, vendidos.join(',')]);

  const calc = useMemo(() => (base?.aplicavel ? calcularDaEstrutura(base, respostas) : null), [base, respostas]);
  const auto = useMemo(() => (base?.aplicavel ? respostasAutomaticas(base.perguntas, base.idsVendidos) : {}), [base]);
  const pendentes = useMemo(() => new Set(calc ? perguntasPendentes(base.perguntas, calc.respostas).map(p => p.id) : []), [calc]);
  const visiveis = calc ? base.perguntas.filter(p => calc.respostas[p.id] || pendentes.has(p.id)) : [];

  const mudar = (p, valor) => setRespostas(r => {
    const n = { ...r };
    if (!valor) delete n[p.id]; else n[p.id] = valor;
    return n;
  });

  if (!veiculo?.id) return <div className="acn-ajuda">Escolha o veículo no alto da tela para simular.</div>;
  if (!conjunto && (itens || []).length) return <Faixa tom="info">O Conjunto Elétrico não foi encontrado no cadastro: sem ele a estrutura não se aplica a nenhuma venda.</Faixa>;

  return (
    <div className="acn-cet-sim">
      <div className="acn-ajuda">
        Simula uma OP de <b>{veiculo.nome || 'este veículo'}</b> com o Conjunto Elétrico. Marque os itens vendidos junto (se houver) e responda as perguntas: o resultado é o que a OP receberia (1 unidade de cada item). Nada é gravado.
      </div>
      <label className="acn-label">ITENS VENDIDOS JUNTO</label>
      <ItensEscolhidos ids={vendidos} itens={(itens || []).filter(i => !i.eh_conjunto_instalacao)} aoMudar={setVendidos} placeholder="Acrescentar item vendido (nome ou código)" />
      {erro && <Faixa tom="erro">Não foi possível montar a simulação ({erro}).</Faixa>}
      {lendo && !base && <div className="acn-ajuda">Lendo…</div>}
      {base && !base.aplicavel && !erro && <Faixa tom="info">A estrutura não se aplica a esta simulação (sem Conjunto Elétrico ou sem veículo).</Faixa>}
      {calc && (
        <>
          {visiveis.length === 0 && <div className="acn-ajuda">Este veículo e estes itens não têm perguntas.</div>}
          {visiveis.length > 0 && <div className="acn-cet-sec espaco">RESPOSTAS</div>}
          {visiveis.map(p => {
            const ehAuto = !!auto[p.id] && calc.respostas[p.id] === auto[p.id] && !respostas[p.id];
            return (
              <div key={p.id} className="acn-cet-sim-linha">
                <span className="acn-cet-sim-perg">{p.texto} <span className="acn-ajuda">({donaDaPergunta(p) || 'item'})</span></span>
                {ehQuantidade(p)
                  ? <input className="acn-input" inputMode="numeric" aria-label={p.texto} placeholder="Nº" value={valorDeQuantidade(respostas[p.id]) ?? ''}
                      onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); mudar(p, v === '' ? '' : respostaDeQuantidade(Number(v))); }} />
                  : <select className="acn-input" aria-label={p.texto} value={calc.respostas[p.id] || ''} disabled={ehAuto} onChange={e => mudar(p, e.target.value)}>
                      <option value="">— sem resposta —</option>
                      {(p.opcoes || []).map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                    </select>}
                {ehAuto && <Selo familia="ok" ponto={false} title="A venda já responde sozinha (itens vendidos juntos)">automática</Selo>}
              </div>
            );
          })}

          <div className="acn-cet-sec espaco">O QUE ENTRA NA LISTA DE MATERIAL ({calc.linhas.length})</div>
          {!calc.linhas.length && <div className="acn-ajuda">Nada entra com estas respostas.</div>}
          {calc.linhas.map((l, i) => (
            <div key={i} className="acn-cet-linha">
              <span className="acn-cet-acao">+ {Number.isInteger(l.quantidade) ? l.quantidade : String(l.quantidade).replace('.', ',')} {l.unidade}</span>
              <span className="acn-cet-mat-nome">{l.codigo ? <b>{l.codigo} — </b> : null}{l.nome}</span>
            </div>
          ))}
          {calc.doRegras.aplicadas.length > 0 && (
            <div className="acn-ajuda">Regras do veículo que valeram: {calc.doRegras.aplicadas.map(r => r.nome || 'regra sem nome').join('; ')}.</div>
          )}
          {calc.doRegras.semRegra.length > 0 && (
            <Faixa tom="atencao">
              Chicote/suporte a definir: {calc.doRegras.semRegra.map(s => `${s.texto} → ${s.resposta}`).join('; ')}.
            </Faixa>
          )}
          {(base.semEstrutura || []).length > 0 && (
            <Faixa tom="info">Sem material cadastrado neste veículo: {base.semEstrutura.map(id => rotuloDoItem(itens, id)).join('; ')}.</Faixa>
          )}
        </>
      )}
    </div>
  );
}
