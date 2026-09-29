// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PERGUNTAS SOBRE O CARRO, NA ABERTURA DA OPL
//
// Quem responde é o vendedor — ele é quem está com o cliente e sabe se o carro
// tem hack de teto, se tem câmera no para-brisa. A Engenharia não teria como
// (definido com o usuário em 28/09/2026).
//
// As perguntas vêm dos ITENS VENDIDOS: "tem hack?" é pergunta da barra
// sinalizadora e vale em qualquer carro. Só aparecem quando a venda leva o
// Conjunto Elétrico — sem ele não há material de instalação a montar.
//
// No lote, o PRIMEIRO CARRO SERVE DE PADRÃO: os seguintes herdam as respostas e
// o vendedor só mexe no que for diferente. Num lote de 30 isso é a diferença
// entre responder 2 perguntas e responder 60.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
  perguntasDeVariosItens, perguntasPendentes, respostasAutomaticas,
  itensConjunto, vendaTemConjunto,
  materiaisDoVeiculo, montarMaterial,
} from './ConfigEstrutura';
import { supabase } from './supabaseClient';
import { sugerirBom } from './OpItens';

export function PerguntasDaVenda({ itensVendidos, veiculoId, unidades = 1, loteMisto = false,
                                   respostas, onChange }) {
  const [perguntas, setPerguntas] = useState([]);
  const [temConjunto, setTemConjunto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [abertas, setAbertas] = useState({});   // unidades destacadas do padrão

  const ids = (itensVendidos || []).map(v => v.item_id).filter(Boolean);
  const chave = ids.join(',');

  useEffect(() => {
    (async () => {
      if (!ids.length) { setPerguntas([]); setTemConjunto(false); return; }
      setCarregando(true);
      const conj = await itensConjunto();
      const tem = vendaTemConjunto(itensVendidos, conj.map(c => c.id));
      setTemConjunto(tem);
      if (!tem) { setPerguntas([]); setCarregando(false); return; }
      // o próprio conjunto não tem perguntas: ele é o recipiente
      const semConjunto = ids.filter(id => !conj.some(c => c.id === id));
      setPerguntas(await perguntasDeVariosItens(semConjunto));
      setCarregando(false);
    })();
  }, [chave]);

  // o que a própria venda responde, pela combinação de itens
  const auto = respostasAutomaticas(perguntas, ids);

  const respostasDe = (un) => ({ ...auto, ...(respostas?.[un] || respostas?.[0] || {}) });
  const responder = (un, perguntaId, opcaoId) => {
    const base = { ...(respostas?.[un] || (un > 0 ? respostas?.[0] : {}) || {}) };
    base[perguntaId] = opcaoId;
    onChange?.({ ...(respostas || {}), [un]: base });
  };

  if (!ids.length || carregando) return null;
  if (!temConjunto) return null;          // sem conjunto, não há o que perguntar
  if (!perguntas.length) return null;     // nenhum item vendido tem pergunta

  const totalUnidades = Math.max(1, Number(unidades) || 1);
  const mostrarPorUnidade = loteMisto && totalUnidades > 1;

  const Bloco = ({ un, titulo }) => {
    const r = respostasDe(un);
    const pendentes = perguntasPendentes(perguntas, r);
    const respondidas = perguntas.filter(p => r[p.id]);
    return (
      <div style={{ marginBottom: 8 }}>
        {titulo && <div style={{ fontSize: 10, fontWeight: 800, color: '#5b21b6', marginBottom: 4 }}>{titulo}</div>}
        {pendentes.map(p => (
          <div key={p.id} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>
              {p.texto}
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                ({p.cadastro_itens?.nome})
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
              {(p.opcoes || []).map(o => (
                <button key={o.id} type="button" onClick={() => responder(un, p.id, o.id)}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                    border: '1px solid ' + (r[p.id] === o.id ? '#7c3aed' : '#cbd5e1'),
                    background: r[p.id] === o.id ? '#ede9fe' : '#fff',
                    color: r[p.id] === o.id ? '#6b21a8' : '#475569' }}>
                  {o.rotulo}
                </button>
              ))}
            </div>
          </div>
        ))}
        {respondidas.length > 0 && (
          <div style={{ fontSize: 9.5, color: '#475569' }}>
            {respondidas.map(p => {
              const o = (p.opcoes || []).find(x => x.id === r[p.id]);
              const ehAuto = auto[p.id] === r[p.id];
              return (
                <span key={p.id} style={{ marginRight: 10 }}>
                  ✓ {p.texto} <b>{o?.rotulo || '—'}</b>
                  {ehAuto && <span style={{ color: '#15803d' }}> (o sistema já sabia)</span>}
                  {!ehAuto && (
                    <button type="button" onClick={() => {
                      const base = { ...(respostas?.[un] || {}) }; delete base[p.id];
                      onChange?.({ ...(respostas || {}), [un]: base });
                    }} style={{ border: 'none', background: 'none', color: '#7c3aed', fontSize: 9, cursor: 'pointer' }}>
                      trocar
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 12, background: '#faf5ff', border: '1px solid #ddd6fe',
      borderRadius: 7, padding: '9px 11px' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#5b21b6', marginBottom: 6 }}>
        🚗 SOBRE O CARRO — o que muda a instalação
      </div>
      {!veiculoId && (
        <div style={{ fontSize: 10, color: '#b45309', marginBottom: 6 }}>
          Escolha o veículo acima: sem saber o carro, o material da instalação não é calculado.
        </div>
      )}

      <Bloco un={0} titulo={mostrarPorUnidade ? 'CARRO 01' : null} />

      {mostrarPorUnidade && Array.from({ length: totalUnidades - 1 }, (_, k) => k + 1).map(un => (
        <div key={un} style={{ borderTop: '1px solid #ede9fe', paddingTop: 5 }}>
          {abertas[un] ? (
            <Bloco un={un} titulo={`CARRO ${String(un + 1).padStart(2, '0')}`} />
          ) : (
            <div style={{ fontSize: 10, color: '#6b21a8' }}>
              Carro {String(un + 1).padStart(2, '0')}: <b>igual ao 01</b>
              <button type="button" onClick={() => setAbertas(a => ({ ...a, [un]: true }))}
                style={{ border: 'none', background: 'none', color: '#7c3aed', fontSize: 9,
                  fontWeight: 700, cursor: 'pointer' }}>
                responder diferente
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }}>
        Estas respostas montam o material de instalação da OP. A Engenharia confere depois.
      </div>
    </div>
  );
}

/** Respostas de uma unidade, caindo para o padrão do primeiro carro. */
export function respostasDaUnidade(respostas, un) {
  return { ...(respostas?.[0] || {}), ...(respostas?.[un] || {}) };
}

/**
 * Grava as respostas da OP recém-criada e monta a `bom_itens` a partir delas.
 *
 * Roda DEPOIS do insert porque na hora de preencher o formulário a OP ainda
 * não tem id. Não interrompe a criação se algo falhar: a OP existe, e a
 * Engenharia ainda confere a BOM — travar a venda por causa do cálculo seria
 * pior que a OP nascer sem ele.
 */
export async function gravarConfiguracaoDaOp({ opl, respostas, currentUser }) {
  try {
    const vendidos = opl?.itens_vendidos || [];
    const ids = vendidos.map(v => v.item_id).filter(Boolean);
    if (!opl?.veiculo_id || !ids.length) return;

    const conj = await itensConjunto();
    if (!vendaTemConjunto(vendidos, conj.map(c => c.id))) return;   // o interruptor

    const semConjunto = ids.filter(id => !conj.some(c => c.id === id));
    const perguntas = await perguntasDeVariosItens(semConjunto);
    const todas = { ...respostasAutomaticas(perguntas, ids), ...(respostas || {}) };

    const registros = perguntas
      .filter(p => todas[p.id])
      .map(p => ({
        opl_id: opl.id, item_id: p.item_id, pergunta_id: p.id, opcao_id: todas[p.id],
        automatica: !(respostas || {})[p.id],
        respondido_por: currentUser?.nome || currentUser?.email || '—',
      }));
    if (registros.length) {
      await supabase.from('op_configuracao_respostas')
        .upsert(registros, { onConflict: 'opl_id,pergunta_id' });
    }

    const materiais = await materiaisDoVeiculo(opl.veiculo_id, semConjunto);
    if (!materiais.length) return;
    const qtdPorItem = {};
    vendidos.forEach(v => { if (v.item_id) qtdPorItem[v.item_id] = Number(v.quantidade) || 1; });
    const linhas = montarMaterial(materiais, todas, qtdPorItem);
    // nada calculado: a lista continua nascendo vazia e a Engenharia sugere na
    // hora de liberar, exatamente como sempre foi
    if (!linhas.length) return;

    // A LISTA COMPLETA (corrigido em 28/09/2026)
    //
    // O Conjunto Elétrico NÃO vira linha para separar: ele é a caixa, não a
    // peça — não existe "conjunto elétrico" na prateleira. Ele sai da lista e
    // entra no lugar dele o material que representa: o suporte que a resposta
    // escolheu, os parafusos, o chicote. Na nota e no PV ele continua, porque
    // licitação exige tudo especificado; quem perde a linha é só o
    // Almoxarifado, que separa peça de verdade.
    //
    // E os produtos vendidos voltam para a lista: a barra sinalizadora também
    // é separada. Sem isso a OP nascia só com o material de instalação e o
    // produto principal sumia da separação.
    const ehConj = (id) => conj.some(c => String(c.id) === String(id));
    const naVenda = conj.find(c => vendidos.some(v => String(v.item_id) === String(c.id)));
    const base = await sugerirBom(vendidos.filter(v => !ehConj(v.item_id)));
    const conteudo = linhas.map(l => ({
      ...l, descricao: l.descricao || `do ${naVenda?.nome || 'CONJUNTO ELÉTRICO'}`,
    }));

    const mapa = new Map();
    [...base, ...conteudo].forEach(l => {
      const chave = l.item_id || `txt:${l.nome}`;
      const ja = mapa.get(chave);
      if (ja) ja.quantidade = Number(ja.quantidade || 0) + Number(l.quantidade || 0);
      else mapa.set(chave, { ...l });
    });
    await supabase.from('oples').update({ bom_itens: [...mapa.values()] }).eq('id', opl.id);
  } catch (e) {
    // a OP já existe; o cálculo é conveniência, não pode derrubar a venda
    console.warn('Configuração do veículo não pôde ser aplicada na criação:', e);
  }
}
