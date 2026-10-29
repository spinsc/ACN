// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DA ESTRUTURA NA BOM DA ENGENHARIA
//
// A BOM da Engenharia é CONFERÊNCIA, não montagem (definido com o usuário em
// 28/09/2026). Ela mostra a lista completa — o que foi vendido mais o que é
// usado para instalar — e a Engenharia confere.
//
// E cobra o que falta: numa lista de 5 itens, se 4 já foram adaptados naquele
// carro e 1 não, só o item novo é cobrado. Cadastrou a composição dele para
// aquele modelo e ano, vira automático dali em diante. É assim que o sistema
// fica completo sozinho, um carro de cada vez.
//
// O INTERRUPTOR: nada é montado se o Conjunto Elétrico não estiver na venda.
// Cliente que traz suporte e chicote de terceiros não leva conjunto.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { perguntasPendentes } from './ConfigEstrutura';
import {
  lerBaseDaEstrutura, respostasSalvasDaOp, calcularDaEstrutura, diferencaDeMaterial, textoDaDiferenca,
} from './CalculoDaEstrutura';
import { RespostasEmLote } from './RespostasEmLote';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiCheck, mdiAlertOutline } from '@mdi/js';

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (v) => Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2).replace('.', ',');

/** O que vai faltar, se estas linhas forem separadas. Não reserva nada. */
export async function previsaoDeFalta(linhas) {
  const ids = (linhas || []).map(l => l.item_id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase.from('vw_estoque_disponivel').select('*').in('item_id', ids);
  const porId = new Map((data || []).map(d => [d.item_id, d]));
  const falta = [];
  for (const l of linhas) {
    const e = porId.get(l.item_id);
    if (!e) continue;                                  // sem controle: fora da conta
    const disp = num(e.disponivel);
    if (num(l.quantidade) > disp) {
      falta.push({ nome: l.nome, codigo: l.codigo, precisa: num(l.quantidade),
        disponivel: disp, falta: num(l.quantidade) - disp });
    }
  }
  return falta;
}

/**
 * `opsParaResponder`: as OPs que o botão "Responder agora" atende de uma vez. Na liberação individual é só a própria
 * OP; na liberação em LOTE são todas as marcadas (a tela de resposta em lote existe justamente para elas).
 */
export function PainelConferenciaEstrutura({ opl, onUsar, currentUser, opsParaResponder, onRespondido, onSolicitarDesenvolvimento, onAjustarBom }) {
  const [estado, setEstado] = useState({ carregando: true });
  // etapa 4 (15/10/2026): o material da primeira conta desta janela — o que a BOM em edição representa. `onAjustarBom(diferenca, nomeDoConjunto)` aplica na BOM
  // da janela só o que mudou depois que uma resposta foi trocada (quem abre o painel dentro de um editor de BOM passa esse retorno).
  const linhasBase = useRef(null);
  const [responder, setResponder] = useState(false);
  const [tick, setTick] = useState(0);   // sobe quando as respostas mudam, para o painel recalcular o material

  useEffect(() => {
    (async () => {
      // o cálculo (perguntas, material por item, regras do veículo) mora em CalculoDaEstrutura.ts, para o painel, a tela de respostas e a OP aberta calcularem igual (etapa 4, 15/10/2026)
      const base = await lerBaseDaEstrutura(opl);
      if (!base.aplicavel) {
        setEstado({ carregando: false, temConjunto: base.temConjunto, semVeiculo: base.semVeiculo, conj: base.conj });
        return;
      }
      const { respostas, doRegras, linhas } = calcularDaEstrutura(base, await respostasSalvasDaOp(opl.id));
      const falta = await previsaoDeFalta(linhas);
      const pendentes = perguntasPendentes(base.perguntas, respostas);
      // item vendido que uma regra do veículo usa como condição (ex.: a sirene) já está "adaptado" neste carro: não cobrar de novo
      const nomesSem = base.vendidos.filter(v => base.semEstrutura.includes(String(v.item_id)) && !doRegras.itensCobertos.has(String(v.item_id)));
      // só diz "sem regra" depois que as perguntas foram respondidas: pergunta pendente já tem o seu aviso
      const semRegra = doRegras.semRegra;

      // etapa 4: o que a BOM desta janela representa é o material da PRIMEIRA conta; se uma resposta mudar depois, a diferença aparece e só entra na BOM com confirmação
      if (!linhasBase.current) linhasBase.current = linhas;
      const mudou = diferencaDeMaterial(linhasBase.current, linhas);

      setEstado({ carregando: false, temConjunto: true, conj: base.conj, linhas, falta, pendentes, semRegra, mudou,
        semEstrutura: nomesSem, respondidas: Object.keys(respostas).length, totalPerguntas: base.perguntas.length });
    })().catch((err) => {
      // 15/10/2026: a leitura das perguntas da OP lança erro de propósito; sem este desvio o painel ficaria em "Conferindo…" para sempre
      setEstado({ carregando: false, falhou: err?.message || 'Não foi possível ler as perguntas.' });
    });
  }, [opl?.id, tick, (opl?.itens_vendidos || []).map((v: any) => (v?.sem_estrutura ? 1 : 0)).join('')]);   // a marca "Sem estrutura" do PCP também refaz a conta

  // 12e53 (09/10/2026): só aparência — as caixas coloridas passaram a ter um "tom" (info, neutro, atenção, erro, ok) que o design.css pinta com os
  // tons do guia (já mudam sozinhos no tema escuro); antes cada uma carregava três cores escritas no código
  const e = estado;
  if (e.carregando) {
    return <Caixa tom="info">Conferindo a configuração do veículo…</Caixa>;
  }

  if (e.falhou) {
    return <Caixa tom="erro"><b>Não foi possível conferir a configuração do veículo.</b> {e.falhou} Abra a OP de novo; se persistir, avise o suporte.</Caixa>;
  }

  // Sem conjunto elétrico na venda: a estrutura não se aplica, e isso é normal.
  if (!e.temConjunto) {
    return (
      <Caixa tom="neutro">
        <b>Sem Conjunto Elétrico nesta venda.</b> O material de instalação não é montado —
        é o caso de quem usa suporte e chicote de terceiros. A BOM segue preenchida à mão.
      </Caixa>
    );
  }
  if (e.semVeiculo) {
    return (
      <Caixa tom="atencao">
        Esta venda leva Conjunto Elétrico, mas a OP <b>não tem veículo do catálogo</b>.
        Sem saber o carro não dá para montar o material — escolha o veículo na OP.
      </Caixa>
    );
  }

  return (
    <div className="acn-aep">
      {/* etapa 4: uma resposta foi trocada e o material mudou — "sai este, entra aquele". Só entra na BOM com o clique de quem está configurando. */}
      {e.mudou?.length > 0 && (
        <Caixa tom="atencao">
          <b><Icone path={mdiAlertOutline} size={14} /> As respostas mudaram: o material calculado não é mais o que a BOM desta janela tem.</b>
          <div className="acn-aep-sub">
            {e.mudou.map(d => (
              <div key={d.item_id || d.nome} className="acn-aep-linha">
                • {d.delta < 0 ? 'sai' : 'entra'} {fmt(Math.abs(d.delta))} {d.unidade || 'UN'} — {d.codigo ? d.codigo + ' ' : ''}{d.nome}
              </div>
            ))}
          </div>
          {onAjustarBom ? (
            <>
              <div className="acn-aep-nota">
                Aplicar tira da BOM só o que saiu (até o que ela tem) e põe o que entrou. O resto da lista, inclusive o que foi ajustado à mão, não muda.
              </div>
              <div className="acn-aep-acoes">
                <Botao pequeno variante="primario" onClick={() => {
                  onAjustarBom(e.mudou, e.conj?.[0]?.nome);
                  linhasBase.current = e.linhas;
                  setTick(t => t + 1);
                }}>Aplicar na BOM</Botao>
              </div>
            </>
          ) : (
            <div className="acn-aep-nota">{textoDaDiferenca(e.mudou)}. Ajuste a BOM à mão.</div>
          )}
        </Caixa>
      )}
      {e.semEstrutura?.length > 0 && (
        <Caixa tom="erro">
          <b><Icone path={mdiAlertOutline} size={14} /> {e.semEstrutura.length} item(ns) nunca foram adaptados neste carro.</b>
          <div className="acn-aep-sub">
            {e.semEstrutura.map(v => `• ${v.nome}`).join('  ')}
          </div>
          {/* 18c (13/10/2026): no PCP, quem cadastra a composição é a Engenharia, a pedido — o botão abre o pedido já com estes itens */}
          {onSolicitarDesenvolvimento ? (
            <>
              <div className="acn-aep-nota">
                O material deles não entra sozinho. Peça o desenvolvimento à Engenharia: ela cadastra a composição de cada item neste veículo e,
                a partir daí, toda OP igual sai pronta.
              </div>
              <div className="acn-aep-acoes">
                <Botao pequeno variante="primario" onClick={() => onSolicitarDesenvolvimento(e.semEstrutura)}>
                  Solicitar desenvolvimento
                </Botao>
              </div>
            </>
          ) : (
            <div className="acn-aep-nota">
              O material deles não entra sozinho. Cadastre a composição em
              <b> Administração → Estruturas</b>, escolhendo o item e este veículo — a partir daí
              toda OP igual sai pronta.
            </div>
          )}
        </Caixa>
      )}

      {/* etapa 3 (15/10/2026): "chicote a definir" — resposta dada que nenhuma regra deste veículo usa. O pedido de desenvolvimento é do PCP, como nos itens nunca adaptados. */}
      {e.semRegra?.length > 0 && (
        <Caixa tom="atencao">
          <b><Icone path={mdiAlertOutline} size={14} /> Chicote/suporte a definir: {e.semRegra.length} resposta(s) sem regra neste veículo.</b>
          <div className="acn-aep-sub">
            {e.semRegra.map(s => <div key={s.pergunta_id}>• {s.texto} → <b>{s.resposta}</b></div>)}
          </div>
          {onSolicitarDesenvolvimento ? (
            <>
              <div className="acn-aep-nota">
                Nenhuma regra deste veículo usa essas respostas, então o chicote e o suporte delas não entram sozinhos. Peça o desenvolvimento à Engenharia:
                ela cadastra a regra e, a partir daí, toda OP igual sai pronta.
              </div>
              <div className="acn-aep-acoes">
                <Botao pequeno variante="primario"
                  onClick={() => onSolicitarDesenvolvimento(e.semRegra.map(s => ({ nome: `chicote/suporte para "${s.texto}" = ${s.resposta}`, item_id: null })))}>
                  Solicitar desenvolvimento
                </Botao>
              </div>
            </>
          ) : (
            <div className="acn-aep-nota">
              Nenhuma regra deste veículo usa essas respostas. Cadastre a regra em <b>Administração → Estruturas</b> (regras do veículo) — a partir daí toda OP igual sai pronta.
            </div>
          )}
        </Caixa>
      )}

      {e.pendentes?.length > 0 && (
        <Caixa tom="atencao">
          {e.pendentes.length} pergunta(s) sobre o carro sem resposta — normalmente respondidas
          pelo vendedor na abertura da OP. O material pode sair incompleto.
          <div className="acn-aep-acoes">
            <Botao pequeno variante="primario" onClick={() => setResponder(true)}>
              Responder agora{(opsParaResponder || []).length > 1 ? ` (${opsParaResponder.length} OPs)` : ''}
            </Botao>
          </div>
        </Caixa>
      )}
      {/* já respondidas: continua dando para rever (a OP pode ter mudado de ideia, ou a resposta foi dada com pressa) */}
      {!(e.pendentes?.length > 0) && e.totalPerguntas > 0 && (
        <div className="acn-aep-resp">
          Perguntas sobre o carro: todas respondidas.{' '}
          <Botao variante="discreto" pequeno className="acn-aep-link" onClick={() => setResponder(true)}>
            rever respostas
          </Botao>
        </div>
      )}
      {responder && (
        <RespostasEmLote ops={(opsParaResponder && opsParaResponder.length) ? opsParaResponder : [opl]} currentUser={currentUser}
          onClose={() => setResponder(false)} onSalvo={() => { setTick(t => t + 1); onRespondido?.(); }} />
      )}

      {e.linhas?.length > 0 && (
        <Caixa tom="ok">
          <b>Material de instalação calculado ({e.linhas.length}):</b>
          <div className="acn-aep-sub">
            {e.linhas.map(l => (
              <div key={`${l.pai_item_id || ''}|${l.item_id}`} className="acn-aep-linha">
                • {fmt(l.quantidade)} {l.unidade || 'UN'} — {l.codigo ? l.codigo + ' ' : ''}{l.nome}{l.pai_nome ? <span className="acn-ajuda"> · instala {l.pai_nome}</span> : null}
              </div>
            ))}
          </div>
          {/* Jogar na BOM segue o desenho da Etapa 7.4 do plano do estoque: o Conjunto Elétrico é a caixa, não a peça —
              sai da lista de separação e entra o conteúdo dele, marcado "do CONJUNTO ELETRICO". Quem recebe as linhas
              também recebe os ids do conjunto para tirar a linha dele da BOM (as OPs criadas antes do fluxo automático
              partiam da sugestão antiga, que ainda traz o 1687). */}
          <Botao pequeno variante="primario" icone={mdiCheck} className="acn-aep-bom" onClick={() => onUsar?.(
              e.linhas.map(l => ({ ...l, descricao: l.descricao || (l.pai_item_id ? '' : `do ${e.conj?.[0]?.nome || 'CONJUNTO ELETRICO'}`) })),   // com pai, a árvore da BOM já diz de quem é a linha
              (e.conj || []).map(c => String(c.id)))}>
            Jogar na BOM
          </Botao>
        </Caixa>
      )}

      {e.falta?.length > 0 && (
        <Caixa tom="erro">
          <b><Icone path={mdiAlertOutline} size={14} /> Vai faltar material:</b>
          {e.falta.map(f => (
            <div key={f.codigo + f.nome} className="acn-aep-linha">
              • {f.nome}: precisa de {fmt(f.precisa)}, disponível {fmt(f.disponivel)} — faltam {fmt(f.falta)}
            </div>
          ))}
          <div className="acn-aep-nota">
            Nada foi reservado nem pedido ainda — isso acontece quando o PCP liberar para o
            Almoxarifado. Mas agora já dá tempo de resolver.
          </div>
        </Caixa>
      )}
    </div>
  );
}

const Caixa = ({ tom, children }) => (
  <div className="acn-aep-caixa" data-tom={tom}>
    {children}
  </div>
);
