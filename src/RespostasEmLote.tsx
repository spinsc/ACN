// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// RESPONDER AS PERGUNTAS SOBRE O CARRO — EM LOTE, PARA OPs QUE JÁ EXISTEM
//
// As perguntas dos itens ("tem hack de teto?") são respondidas pelo vendedor na
// abertura da OP. Só que OP aberta ANTES de a pergunta existir (como o lote das
// 39 Renegade 4x4, pedido do usuário em 29/09/2026) ficava para sempre com a
// pergunta "sem resposta": a conferência da Engenharia só avisava, e não havia
// onde responder.
//
// Esta tela responde por várias OPs de uma vez, com a mesma ideia da abertura da
// OP em lote: um PADRÃO vale para todas, e cada carro que responde diferente vira
// uma EXCEÇÃO. Grava em `op_configuracao_respostas`, o mesmo lugar da abertura, e a
// conferência da BOM passa a calcular o material com essas respostas.
//
// Regras que a tela segue:
//  - só entram OPs com veículo do catálogo e com o Conjunto Elétrico na venda (é o
//    interruptor: sem ele não há material a montar, então não há o que perguntar);
//  - resposta "filha" cuja resposta-pai foi trocada é apagada, senão o material dela
//    continuaria entrando na BOM;
//  - o que o sistema já responde pela combinação de itens vendidos (botão "regra"
//    da Estrutura) fica marcado "o sistema já sabia" e não se muda aqui;
//  - troca de resposta que já estava gravada pede confirmação, e a BOM que a OP já
//    tenha montada NÃO muda sozinha (a tela avisa quantas são).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import {
  perguntasDeVariosItens, respostasAutomaticas, itensConjunto, vendaTemConjunto,
  podarRespostas, respostasDasOps,
} from './ConfigEstrutura';

const idsVendidos = (o) => (o?.itens_vendidos || []).map(v => v.item_id).filter(Boolean).map(String);
const perguntasDaOp = (perguntas, o) => { const ids = new Set(idsVendidos(o)); return perguntas.filter(p => ids.has(String(p.item_id))); };
const restringir = (ps, mapa) => { const ok = new Set(ps.map(p => p.id)); const r = {}; Object.entries(mapa || {}).forEach(([k, v]) => { if (ok.has(k)) r[k] = v; }); return r; };
const rotuloDe = (perguntas, opcaoId) => { for (const p of perguntas) { const o = (p.opcoes || []).find(x => x.id === opcaoId); if (o) return o.rotulo; } return '—'; };

/** Uma linha de OPs para o cabeçalho: "1673.2609/01 … 1673.2609/39 (39 OPs)". */
const resumoOps = (ops) => {
  // em ordem de número (a lista de origem não vem ordenada: apareceu "/31 … /30")
  const o = [...ops].sort((a, b) => String(a.opl).localeCompare(String(b.opl), 'pt-BR', { numeric: true }));
  return o.length <= 4 ? o.map(x => x.opl).join(', ') : `${o[0].opl} … ${o[o.length - 1].opl} (${o.length} OPs)`;
};

// escopo de módulo de propósito: declarado dentro do componente, remontaria os botões a cada clique
function ListaDePerguntas({ perguntas, efetivas, auto, onEscolher, resumo }) {
  const podadas = podarRespostas(perguntas, efetivas);
  const escolhidas = new Set(Object.values(podadas).filter(Boolean));
  const visiveis = perguntas.filter(p => !p.opcao_pai_id || escolhidas.has(p.opcao_pai_id));
  return (
    <>
      {visiveis.map(p => {
        const atual = podadas[p.id];
        const ehAuto = !!auto[p.id] && auto[p.id] === atual;
        const nota = resumo ? resumo(p) : '';
        return (
          <div key={p.id} style={{ marginBottom: 9, marginLeft: p.opcao_pai_id ? 14 : 0,
            borderLeft: p.opcao_pai_id ? '2px solid #e0e7ff' : 'none', paddingLeft: p.opcao_pai_id ? 8 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>
              {p.texto}
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>({p.cadastro_itens?.nome})</span>
              {ehAuto && <span style={{ fontSize: 9, color: '#15803d', fontWeight: 700, marginLeft: 6 }}>o sistema já sabia</span>}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
              {(p.opcoes || []).map(o => (
                <button key={o.id} type="button" disabled={ehAuto} onClick={() => onEscolher(p, o)}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: ehAuto ? 'default' : 'pointer',
                    border: '1px solid ' + (atual === o.id ? '#7c3aed' : '#cbd5e1'),
                    background: atual === o.id ? '#ede9fe' : '#fff',
                    color: atual === o.id ? '#6b21a8' : '#475569', opacity: ehAuto && atual !== o.id ? .45 : 1 }}>
                  {o.rotulo}
                </button>
              ))}
              {!(p.opcoes || []).length && <span style={{ fontSize: 9.5, color: '#f59e0b' }}>pergunta sem respostas cadastradas</span>}
            </div>
            {nota && <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 2 }}>{nota}</div>}
          </div>
        );
      })}
    </>
  );
}

export function RespostasEmLote({ ops, currentUser, onClose, onSalvo }) {
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState('');
  const [perguntas, setPerguntas] = useState([]);
  const [salvas, setSalvas] = useState({});          // opl_id → { pergunta_id → { opcao_id, automatica } }
  const [aplicaveis, setAplicaveis] = useState([]);
  const [ignoradas, setIgnoradas] = useState({ semVeiculo: 0, semConjunto: 0 });
  const [padrao, setPadrao] = useState({});          // pergunta_id → opcao_id, vale para todas
  const [excecoes, setExcecoes] = useState({});      // opl_id → { pergunta_id → opcao_id }
  const [abertas, setAbertas] = useState({});        // opl_id → mostrando as perguntas do carro
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const chave = (ops || []).map(o => o.id).join(',');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        setCarregando(true); setFalha('');
        const conj = await itensConjunto();
        const idsConj = conj.map(c => c.id);
        const comVeiculo = (ops || []).filter(o => o.veiculo_id);
        const ok = comVeiculo.filter(o => vendaTemConjunto(o.itens_vendidos || [], idsConj));
        const idsItens = [...new Set(ok.flatMap(idsVendidos))].filter(id => !idsConj.includes(id));
        const [ps, gravadas] = await Promise.all([
          perguntasDeVariosItens(idsItens),
          respostasDasOps(ok.map(o => o.id)),
        ]);
        if (!vivo) return;
        setAplicaveis(ok); setPerguntas(ps); setSalvas(gravadas);
        setIgnoradas({ semVeiculo: (ops || []).length - comVeiculo.length, semConjunto: comVeiculo.length - ok.length });
        // já vem preenchido o que TODAS as OPs que têm a pergunta já respondem igual (e não foi o sistema que respondeu)
        const pre = {};
        for (const p of ps) {
          const donas = ok.filter(o => perguntasDaOp(ps, o).some(x => x.id === p.id));
          if (!donas.length) continue;
          const regs = donas.map(o => gravadas[o.id]?.[p.id]);
          if (regs.every(r => r && !r.automatica) && new Set(regs.map(r => r.opcao_id)).size === 1) pre[p.id] = regs[0].opcao_id;
        }
        setPadrao(pre); setExcecoes({}); setAbertas({});
      } catch (e) {
        if (vivo) setFalha(e?.message || 'Não foi possível ler as perguntas.');
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [chave]);

  // o que o sistema já responde pela combinação de itens: só vale como "já sabia" na tela do padrão se for igual em todas
  const autoDaOp = (o) => respostasAutomaticas(perguntasDaOp(perguntas, o), idsVendidos(o));
  const autoComum = (() => {
    const comum = {};
    for (const p of perguntas) {
      const valores = aplicaveis.filter(o => perguntasDaOp(perguntas, o).some(x => x.id === p.id)).map(o => autoDaOp(o)[p.id]);
      if (valores.length && valores.every(v => v && v === valores[0])) comum[p.id] = valores[0];
    }
    return comum;
  })();

  const escolherPadrao = (p, o) => setPadrao(r => ({ ...r, [p.id]: o.id }));
  const escolherExcecao = (op, p, o) => setExcecoes(r => ({ ...r, [op.id]: { ...(r[op.id] || {}), [p.id]: o.id } }));
  const voltarAoPadrao = (op) => { setExcecoes(r => { const c = { ...r }; delete c[op.id]; return c; }); setAbertas(a => ({ ...a, [op.id]: false })); };

  // quantas OPs já respondem a pergunta e como — só informação, para não trocar às cegas
  const resumoSalvo = (p) => {
    const donas = aplicaveis.filter(o => perguntasDaOp(perguntas, o).some(x => x.id === p.id));
    if (!donas.length) return '';
    const cont = {}; let sem = 0;
    donas.forEach(o => { const r = salvas[o.id]?.[p.id]; if (!r) sem++; else cont[r.opcao_id] = (cont[r.opcao_id] || 0) + 1; });
    const partes = Object.entries(cont).map(([id, n]) => `${n} com "${rotuloDe(perguntas, id)}"`);
    if (sem) partes.push(`${sem} sem resposta`);
    return `Hoje, em ${donas.length} OP(s): ${partes.join(', ')}.`;
  };

  /** Monta o que seria gravado, sem gravar. */
  const montarPlano = () => {
    const linhas = [], apagar = [], historico = [];
    const agora = new Date().toISOString();
    const por = currentUser?.nome || currentUser?.email || '—';
    let trocadas = 0; const opsComTroca = new Set(); const opsComBom = new Set();
    for (const o of aplicaveis) {
      const ps = perguntasDaOp(perguntas, o);
      const auto = autoDaOp(o);
      const explicitas = { ...restringir(ps, padrao), ...restringir(ps, excecoes[o.id] || {}) };
      const jaSalvas = {}; Object.entries(salvas[o.id] || {}).forEach(([pid, v]) => { jaSalvas[pid] = v.opcao_id; });
      const finais = podarRespostas(ps, { ...jaSalvas, ...auto, ...explicitas });
      const desta = [];
      for (const p of ps) {
        const nova = finais[p.id]; const antes = salvas[o.id]?.[p.id];
        if (!nova || (antes && antes.opcao_id === nova)) continue;
        linhas.push({ opl_id: o.id, item_id: p.item_id, pergunta_id: p.id, opcao_id: nova,
          automatica: !(p.id in explicitas), respondido_por: por, respondido_em: agora });
        desta.push(`${p.texto} → ${rotuloDe(perguntas, nova)}`);
        if (antes) { trocadas++; opsComTroca.add(o.id); }
      }
      const podadas = Object.keys(jaSalvas).filter(pid => ps.some(p => p.id === pid) && !finais[pid]);
      if (podadas.length) { apagar.push({ opl_id: o.id, perguntas: podadas }); desta.push(`${podadas.length} resposta(s) que dependiam de uma resposta trocada foram removidas`); }
      if (desta.length) {
        historico.push({ o, texto: desta.join('; ') });
        if ((o.bom_itens || []).length) opsComBom.add(o.id);
      }
    }
    return { linhas, apagar, historico, trocadas, opsComTroca, opsComBom };
  };

  const salvar = async () => {
    setErro('');
    const plano = montarPlano();
    if (!plano.linhas.length && !plano.apagar.length) { setErro('Nada mudou: escolha uma resposta antes de salvar.'); return; }
    let aviso = `Gravar as respostas em ${plano.historico.length} OP(s)?`;
    if (plano.trocadas) aviso += `\n\n${plano.trocadas} resposta(s) que ${plano.opsComTroca.size} OP(s) já tinham vão ser TROCADAS.`;
    if (plano.opsComBom.size) aviso += `\n\n${plano.opsComBom.size} destas OPs já têm a BOM montada: a BOM delas não muda sozinha. A resposta vale para a próxima conferência.`;
    if (!await confirmar(aviso)) return;
    setSalvando(true);
    try {
      for (let i = 0; i < plano.linhas.length; i += 500) {
        const { error } = await supabase.from('op_configuracao_respostas')
          .upsert(plano.linhas.slice(i, i + 500), { onConflict: 'opl_id,pergunta_id' });
        if (error) throw new Error(error.message);
      }
      for (const a of plano.apagar) {
        const { error } = await supabase.from('op_configuracao_respostas').delete().eq('opl_id', a.opl_id).in('pergunta_id', a.perguntas);
        if (error) throw new Error(error.message);
      }
      // histórico de cada OP (mesmo padrão dos outros eventos sem mudança de etapa: status antes = status depois)
      const agora = new Date().toISOString();
      const { error: eh } = await supabase.from('logs_movimentacao_opl').insert(plano.historico.map(({ o, texto }) => ({
        opl_id: o.id, numero_opl: o.opl, setor: currentUser?.perfil || 'Engenharia',
        evento: `Respostas sobre o carro registradas: ${texto}`.slice(0, 900),
        status_anterior: o.status_geral, status_novo: o.status_geral,
        usuario_nome: currentUser?.nome || null, usuario_email: currentUser?.email || null, data_hora: agora,
      })));
      if (eh) console.warn('Histórico das respostas não gravado:', eh.message);
      onSalvo?.();
      onClose?.();
    } catch (e) {
      // gravar é idempotente (upsert por OP + pergunta): repetir o clique completa o que faltou
      setErro('Não foi possível gravar tudo: ' + (e?.message || e) + '. Clique em salvar de novo — o que já entrou não duplica.');
    } finally { setSalvando(false); }
  };

  const efetivaPadrao = { ...autoComum, ...padrao };
  const total = aplicaveis.length;

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 2400 }}>
      <div className="modal-box" style={{ maxWidth: 780, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-title">🚗 Responder as perguntas sobre o carro</div>
        <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 8 }}>
          {resumoOps(ops || [])}. Estas respostas escolhem o material de instalação que a conferência da BOM calcula
          para o carro. Quem responde é, normalmente, o vendedor na abertura da OP; esta tela serve para as OPs abertas antes de a pergunta existir.
        </div>

        {carregando && <div style={{ fontSize: 11, color: '#4338ca' }}>Lendo as perguntas dos itens vendidos…</div>}
        {falha && <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 8 }}>{falha}</div>}

        {!carregando && !falha && (
          <>
            {(ignoradas.semVeiculo > 0 || ignoradas.semConjunto > 0) && (
              <div style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '6px 9px', marginBottom: 8 }}>
                {ignoradas.semVeiculo > 0 && <div>{ignoradas.semVeiculo} OP(s) ficam de fora: sem veículo do catálogo.</div>}
                {ignoradas.semConjunto > 0 && <div>{ignoradas.semConjunto} OP(s) ficam de fora: a venda não leva o Conjunto Elétrico (sem ele não há material a montar).</div>}
              </div>
            )}

            {!total && <div style={{ fontSize: 11, color: '#64748b' }}>Nenhuma das OPs tem veículo do catálogo e Conjunto Elétrico na venda.</div>}

            {total > 0 && !perguntas.length && (
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Nenhum item vendido destas OPs tem pergunta cadastrada. Cadastre em Administração → Estruturas (Passo 3 do manual).
              </div>
            )}

            {total > 0 && perguntas.length > 0 && (
              <>
                <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 7, padding: '9px 11px', marginBottom: 10 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#5b21b6', marginBottom: 6 }}>
                    PARA TODAS AS {total} OPs
                  </div>
                  <ListaDePerguntas perguntas={perguntas} efetivas={efetivaPadrao} auto={autoComum}
                    onEscolher={escolherPadrao} resumo={resumoSalvo} />
                </div>

                <details style={{ marginBottom: 10 }} open={Object.keys(excecoes).length > 0}>
                  <summary style={{ fontSize: 10.5, fontWeight: 700, color: '#4338ca', cursor: 'pointer' }}>
                    Algum carro responde diferente? {Object.keys(excecoes).length > 0 && `(${Object.keys(excecoes).length} exceção(ões))`}
                  </summary>
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px' }}>
                    {aplicaveis.map(o => {
                      const ps = perguntasDaOp(perguntas, o);
                      const ex = excecoes[o.id];
                      return (
                        <div key={o.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5 }}>
                            <span style={{ flex: 1 }}><b>{o.opl}</b> <span style={{ color: ex ? '#7c3aed' : '#64748b' }}>{ex ? 'responde diferente' : 'igual ao padrão'}</span></span>
                            {ex && <button type="button" onClick={() => voltarAoPadrao(o)}
                              style={{ border: 'none', background: 'none', color: '#7c3aed', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>voltar ao padrão</button>}
                            {!abertas[o.id] && <button type="button" onClick={() => setAbertas(a => ({ ...a, [o.id]: true }))}
                              style={{ border: 'none', background: 'none', color: '#7c3aed', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>responder diferente</button>}
                          </div>
                          {abertas[o.id] && (
                            <div style={{ margin: '6px 0 4px 10px' }}>
                              <ListaDePerguntas perguntas={ps}
                                efetivas={{ ...autoDaOp(o), ...restringir(ps, padrao), ...restringir(ps, ex || {}) }}
                                auto={autoDaOp(o)} onEscolher={(p, op) => escolherExcecao(o, p, op)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </>
            )}
          </>
        )}

        {erro && <div style={{ fontSize: 10.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 9px', marginBottom: 8 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="acn-btn" style={{ background: '#7c3aed', flex: 1, opacity: salvando ? .6 : 1 }}
            onClick={salvar} disabled={salvando || carregando || !total || !perguntas.length}>
            {salvando ? 'Gravando…' : `Salvar as respostas em ${total} OP(s)`}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} onClick={onClose} disabled={salvando}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Aviso para a liberação de BOM em LOTE: a mesma BOM vai para todas as OPs marcadas, então
 * respostas diferentes entre elas fariam uma receber material que não é o dela.
 */
export function AvisoRespostasDiferentes({ ops, refOpl, versao = 0 }) {
  const [grupos, setGrupos] = useState(0);
  const chave = (ops || []).map(o => o.id).join(',') + '|' + versao;   // `versao` sobe quando as respostas mudam
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if ((ops || []).length < 2) { setGrupos(0); return; }
        const r = await respostasDasOps(ops.map(o => o.id));
        const assinaturas = new Set(ops.map(o => Object.entries(r[o.id] || {}).map(([p, v]) => `${p}:${v.opcao_id}`).sort().join('|')));
        if (vivo) setGrupos(assinaturas.size);
      } catch { if (vivo) setGrupos(0); }
    })();
    return () => { vivo = false; };
  }, [chave]);
  if (grupos < 2) return null;
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '7px 10px', marginBottom: 6, fontSize: 10.5, color: '#92400e' }}>
      ⚠ As OPs marcadas têm <b>respostas diferentes sobre o carro</b> ({grupos} combinações). O material calculado abaixo é o da <b>{refOpl}</b>,
      e a mesma BOM vai para todas — desmarque as que respondem diferente e libere-as à parte.
    </div>
  );
}
