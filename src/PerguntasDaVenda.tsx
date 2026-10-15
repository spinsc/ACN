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
  perguntasDaVenda, donaDaPergunta, perguntasPendentes, respostasAutomaticas,
  itensConjunto, vendaTemConjunto,
  materiaisDoVeiculo, montarMaterial,
  ehQuantidade, valorDeQuantidade, respostaDeQuantidade, camposDaResposta,
  regrasDoVeiculo, avaliarRegras, podarRespostas,
} from './ConfigEstrutura';
import { supabase } from './supabaseClient';
import { sugerirBom } from './OpItens';
import { Botao, Chips } from './Interface';
import Icone from './Icone';
import { mdiCarOutline, mdiCheck } from '@mdi/js';

export function PerguntasDaVenda({ itensVendidos, veiculoId, unidades = 1, loteMisto = false,
                                   respostas, onChange, onPendentes }) {
  const [perguntas, setPerguntas] = useState([]);
  const [temConjunto, setTemConjunto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [abertas, setAbertas] = useState({});   // unidades destacadas do padrão
  const [falhaLeitura, setFalhaLeitura] = useState('');

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
      // as da OP (caracterizada, bateria…) vêm junto com as dos itens vendidos (15/10/2026)
      // falha de leitura NÃO pode parecer "sem perguntas": o vendedor criaria a OP sem responder e ninguém saberia
      // `ids` (a venda inteira) filtra as perguntas com a condição "só quando estes itens foram vendidos juntos" (etapa 2, 15/10/2026)
      try { setPerguntas(await perguntasDaVenda(semConjunto, ids)); setFalhaLeitura(''); }
      catch (e) { console.warn('Perguntas da venda: falha ao ler', e); setPerguntas([]); setFalhaLeitura(e?.message || 'falha ao ler'); }
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
  const limpar = (un, perguntaId) => {
    const base = { ...(respostas?.[un] || (un > 0 ? respostas?.[0] : {}) || {}) };
    delete base[perguntaId];
    onChange?.({ ...(respostas || {}), [un]: base });
  };

  const totalUnidades = Math.max(1, Number(unidades) || 1);
  const mostrarPorUnidade = loteMisto && totalUnidades > 1;

  // R8 (13/10/2026, decisão do usuário de 01/10/2026: quem abre a OP é quem sabe a resposta, e as perguntas do carro entram nos obrigatórios): avisa o formulário quantas
  // perguntas dos blocos que aparecem ainda estão sem resposta (o carro 01 e, no lote misto, os carros que foram abertos para responder diferente; os outros herdam o 01).
  const pendentesAgora = (carregando || !temConjunto || !perguntas.length) ? 0
    : perguntasPendentes(perguntas, respostasDe(0)).length
      + (mostrarPorUnidade ? Array.from({ length: totalUnidades - 1 }, (_, k) => k + 1).filter(un => abertas[un])
          .reduce((s, un) => s + perguntasPendentes(perguntas, respostasDe(un)).length, 0) : 0);
  useEffect(() => { onPendentes?.(pendentesAgora); }, [pendentesAgora]);

  if (!ids.length || carregando) return null;
  if (!temConjunto) return null;          // sem conjunto, não há o que perguntar
  if (falhaLeitura) {
    return (
      <div className="acn-pdv">
        <div className="acn-pdv-aviso">
          Não foi possível ler as perguntas sobre o carro ({falhaLeitura}). Feche e abra a criação da OP de novo antes de salvar; se salvar assim, a Engenharia responde na conferência da BOM.
        </div>
      </div>
    );
  }
  if (!perguntas.length) return null;     // nenhum item vendido tem pergunta

  // 12e54 (09/10/2026): só aparência — as respostas de cada pergunta viraram o seletor do guia (Chips) e o roxo do bloco mora no design.css (--acn-pdv-cor)
  const Bloco = ({ un, titulo }) => {
    const r = respostasDe(un);
    const pendentes = perguntasPendentes(perguntas, r);
    // pergunta de quantidade fica sempre no campo, mesmo respondida: se saísse para a lista de "respondidas" a cada número digitado, o campo sumiria no meio da digitação
    const quantidades = perguntas.filter(p => ehQuantidade(p) && r[p.id] && !pendentes.includes(p));
    const campos = perguntas.filter(p => pendentes.includes(p) || quantidades.includes(p));
    const respondidas = perguntas.filter(p => r[p.id] && !ehQuantidade(p));
    return (
      <div className="acn-pdv-bloco">
        {titulo && <div className="acn-pdv-tit">{titulo}</div>}
        {campos.map(p => (
          <div key={p.id} className="acn-pdv-pergunta">
            <div className="acn-pdv-texto">
              {p.texto}
              <span className="acn-pdv-item">
                ({donaDaPergunta(p)})
              </span>
            </div>
            {ehQuantidade(p) && (
              <input className="acn-input acn-pdv-qtd" type="text" inputMode="numeric" aria-label={p.texto} placeholder="quantidade"
                value={valorDeQuantidade(r[p.id]) ?? ''}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                  if (d === '') limpar(un, p.id); else responder(un, p.id, respostaDeQuantidade(Number(d)));
                }} />
            )}
            {!ehQuantidade(p) && (p.opcoes || []).length > 0 && (
              <Chips ativo={r[p.id] || ''} onChange={(id) => responder(un, p.id, id)} rotulo={p.texto}
                itens={(p.opcoes || []).map(o => ({ id: o.id, rotulo: o.rotulo }))} />
            )}
          </div>
        ))}
        {respondidas.length > 0 && (
          <div className="acn-pdv-resp">
            {respondidas.map(p => {
              const o = (p.opcoes || []).find(x => x.id === r[p.id]);
              const ehAuto = auto[p.id] === r[p.id];
              return (
                <span key={p.id} className="acn-pdv-resp-item">
                  <Icone path={mdiCheck} size={12} /> {p.texto} <b>{o?.rotulo || '—'}</b>
                  {ehAuto && <span className="acn-pdv-auto"> (o sistema já sabia)</span>}
                  {!ehAuto && (
                    <Botao variante="discreto" pequeno className="acn-pdv-link" onClick={() => {
                      const base = { ...(respostas?.[un] || {}) }; delete base[p.id];
                      onChange?.({ ...(respostas || {}), [un]: base });
                    }}>
                      trocar
                    </Botao>
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
    <div className="acn-pdv">
      <div className="acn-pdv-cab">
        <Icone path={mdiCarOutline} size={14} /> SOBRE O CARRO — o que muda a instalação
      </div>
      {!veiculoId && (
        <div className="acn-pdv-aviso">
          Escolha o veículo acima: sem saber o carro, o material da instalação não é calculado.
        </div>
      )}

      {/* chamado como função (não como <Bloco/>) de propósito: o Bloco é declarado aqui dentro e remontaria a cada tecla, tirando o foco do campo de quantidade */}
      {Bloco({ un: 0, titulo: mostrarPorUnidade ? 'CARRO 01' : null })}

      {mostrarPorUnidade && Array.from({ length: totalUnidades - 1 }, (_, k) => k + 1).map(un => (
        <div key={un} className="acn-pdv-unidade">
          {abertas[un] ? (
            Bloco({ un, titulo: `CARRO ${String(un + 1).padStart(2, '0')}` })
          ) : (
            <div className="acn-pdv-igual">
              Carro {String(un + 1).padStart(2, '0')}: <b>igual ao 01</b>
              <Botao variante="discreto" pequeno className="acn-pdv-link" onClick={() => setAbertas(a => ({ ...a, [un]: true }))}>
                responder diferente
              </Botao>
            </div>
          )}
        </div>
      ))}

      <div className="acn-pdv-nota">
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
// 7.x do NovaOpOsModal (14/10/2026): devolve null quando deu certo (ou quando não havia o que gravar) e um texto com o que NÃO foi gravado quando uma gravação foi recusada — antes
// os erros das duas gravações eram ignorados e a OP nascia sem as respostas do carro e sem a lista de material, sem ninguém saber. A OP continua valendo: nunca derruba a venda.
export async function gravarConfiguracaoDaOp({ opl, respostas, currentUser }): Promise<string | null> {
  const falhas: string[] = [];
  try {
    const vendidos = opl?.itens_vendidos || [];
    const ids = vendidos.map(v => v.item_id).filter(Boolean);
    if (!opl?.veiculo_id || !ids.length) return;

    const conj = await itensConjunto();
    if (!vendaTemConjunto(vendidos, conj.map(c => c.id))) return;   // o interruptor

    const semConjunto = ids.filter(id => !conj.some(c => c.id === id));
    const perguntas = await perguntasDaVenda(semConjunto, ids);   // já sem as que a condição de itens vendidos juntos descarta
    const todas = { ...respostasAutomaticas(perguntas, ids), ...(respostas || {}) };

    const registros = perguntas
      .filter(p => todas[p.id])
      .map(p => ({
        opl_id: opl.id, item_id: p.item_id, pergunta_id: p.id, ...camposDaResposta(todas[p.id]),
        automatica: !(respostas || {})[p.id],
        respondido_por: currentUser?.nome || currentUser?.email || '—',
      }));
    if (registros.length) {
      const { error: errRespostas } = await supabase.from('op_configuracao_respostas')
        .upsert(registros, { onConflict: 'opl_id,pergunta_id' });
      if (errRespostas) falhas.push(`as respostas sobre o carro não foram gravadas (${errRespostas.message})`);
    }

    const materiais = await materiaisDoVeiculo(opl.veiculo_id, semConjunto);
    // Regras "se… então…" do veículo (etapa 3, 15/10/2026): chicote e suporte pelas respostas, itens vendidos juntos e quantidades. Somam ao material por item.
    // Respostas podadas: a de uma pergunta-filha cuja resposta-pai foi trocada não pode escolher chicote.
    // Se a leitura das regras falhar, o material por item continua sendo calculado e a falha é dita — sem o chicote, a OP não pode parecer completa.
    let doRegras: any = { linhas: [] };
    try {
      doRegras = avaliarRegras(await regrasDoVeiculo(opl.veiculo_id), { respostas: podarRespostas(perguntas, todas), vendidosIds: ids, perguntas });
    } catch (e: any) {
      falhas.push(`as regras de chicote e suporte do veículo não puderam ser lidas (${e?.message || e}); a lista de material saiu sem elas`);
    }
    if (!materiais.length && !doRegras.linhas.length) return falhas.length ? falhas.join('; ') : null;
    const qtdPorItem = {};
    vendidos.forEach(v => { if (v.item_id) qtdPorItem[v.item_id] = Number(v.quantidade) || 1; });
    const linhas = montarMaterial([...materiais, ...doRegras.linhas], todas, qtdPorItem);
    // nada calculado: a lista continua nascendo vazia e a Engenharia sugere na
    // hora de liberar, exatamente como sempre foi
    if (!linhas.length) return falhas.length ? falhas.join('; ') : null;

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
    const { error: errBom } = await supabase.from('oples').update({ bom_itens: [...mapa.values()] }).eq('id', opl.id);
    if (errBom) falhas.push(`a lista de material não foi gravada (${errBom.message})`);
  } catch (e: any) {
    // a OP já existe; o cálculo é conveniência, não pode derrubar a venda
    console.warn('Configuração do veículo não pôde ser aplicada na criação:', e);
    falhas.push(`a configuração do carro não pôde ser aplicada (${e?.message || e})`);
  }
  return falhas.length ? falhas.join('; ') : null;
}
