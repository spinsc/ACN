// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — avaliação técnica, fornecedor, quem executa e pedido de peça (G2 do PLANO_GARANTIA.md, 19/10/2026)
//
// As quatro seções do detalhe do atendimento. As regras (quem registra, o que falta, a trava do pedido de peça) estão em GarantiaModelo.ts; aqui ficam os campos. Decisão do usuário em
// 19/10/2026: quem registra é o responsável pelo atendimento e a gerência. "Sem avaliação, não segue": o fornecedor e quem executa só se registram depois da avaliação; o pedido de peça ao
// Compras só abre com a avaliação feita e a consulta ao fornecedor respondida (ou a justificativa de que não se aplica).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { lerValorDigitado } from './LerValor';
import { ColaboradorSelect } from './ColaboradorSelect';
import { ModalSolicitarCompra } from './SolicitacaoCompra';
import Icone from './Icone';
import { Botao, Selo, Faixa, hojeISO, diaBR, diaISO, diasAtraso } from './Interface';
import {
  COBERTURAS_GARANTIA, DECISOES_FORNECEDOR, podeConduzirGarantia, bloqueioForaDaGarantia, apoioDeCobertura, fornecedorLiberado, podePedirPeca,
  registrarAvaliacao, registrarFornecedor, registrarExecucao, registrarPedidoDePeca,
} from './GarantiaModelo';
import { SecaoCustos, SecaoCliente, SecaoDirecao } from './GarantiaCustos';
import { SecaoPecasGarantia, SecaoApontamentos } from './GarantiaPecas';
import { mdiClose, mdiCartOutline } from '@mdi/js';

const fmtDtHr = (d: string) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const brl = (v: any) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Secao({ id, titulo, selo, children }: any) {
  return (
    <div className="acn-gar-secao" data-secao={id}>
      <div className="acn-gar-secao-cab"><div className="acn-pdp-rotulo">{titulo}</div>{selo}</div>
      {children}
    </div>
  );
}

/** A frase do apoio de cobertura (a garantia da OP contra o dia da falha). */
function FraseApoio({ apoio }: any) {
  if (!apoio) return null;
  if (apoio.erro) return <div className="acn-ajuda atencao">Não foi possível ler o prazo de garantia da OP ({apoio.erro}). Decida pelo contrato ou pela nota.</div>;
  if (apoio.situacao === 'sem_dados') {
    return <div className="acn-ajuda">Apoio: {apoio.prazo_texto ? `a OP registra garantia de "${apoio.prazo_texto}", mas ` : 'a OP não tem prazo de garantia cadastrado ou '}não há dia de entrega para calcular o fim. Decida pelo contrato ou pela nota.</div>;
  }
  return (
    <div className="acn-ajuda" data-apoio>
      Apoio: garantia da OP de {apoio.meses} meses, entregue em {diaBR(apoio.entrega)}, termina em {diaBR(apoio.fim)}. A falha foi em {diaBR(apoio.ocorrencia)}:{' '}
      <strong>{apoio.situacao === 'dentro' ? `dentro do prazo (faltavam ${apoio.dias} dia${apoio.dias === 1 ? '' : 's'})` : `fora do prazo (${apoio.dias} dia${apoio.dias === 1 ? '' : 's'} depois do fim)`}</strong>.
    </div>
  );
}

// ─── Avaliação técnica ──────────────────────────────────────────────────────────────────────────────────────────
function SecaoAvaliacao({ g, conduz, executar, ocupado, currentUser }: any) {
  const a = g.avaliacao;
  const [editando, setEditando] = useState(false);
  const [parecer, setParecer] = useState(a?.parecer || '');
  const [cobertura, setCobertura] = useState(a?.cobertura || '');
  const [apoio, setApoio] = useState<any>(a?.apoio || null);
  // o apoio é lido da OP na hora de avaliar (só quando a origem é uma OP); o que fica gravado é o apoio daquele momento
  useEffect(() => {
    if (!editando || g.origem_tipo !== 'op' || !g.opl_id) return;
    let vivo = true;
    supabase.from('oples').select('prazo_garantia,data_entrega').eq('id', g.opl_id).maybeSingle().then(({ data, error }) => {
      if (!vivo) return;
      if (error || !data) { setApoio({ erro: error?.message || 'OP não encontrada', situacao: 'sem_dados' }); return; }
      const entregaISO = data.data_entrega ? diaISO(new Date(data.data_entrega)) : null;
      setApoio({ ...apoioDeCobertura({ prazoTexto: data.prazo_garantia, entregaISO }, g.data_ocorrencia), prazo_texto: data.prazo_garantia || '', ocorrencia: g.data_ocorrencia, origem: 'op' });
    });
    return () => { vivo = false; };
  }, [editando]);
  const salvar = async () => {
    const r = await executar((x: any, agora: string) => registrarAvaliacao(x, currentUser, { parecer, cobertura }, apoio && !apoio.erro ? apoio : null, agora));
    if (r) setEditando(false);
  };
  return (
    <Secao id="avaliacao" titulo="Avaliação técnica" selo={a ? <Selo familia={a.cobertura === 'dentro' ? 'ok' : a.cobertura === 'fora' ? 'erro' : 'atencao'} ponto={false}>{COBERTURAS_GARANTIA[a.cobertura]}</Selo> : <Selo familia="atencao" ponto={false}>Falta avaliar</Selo>}>
      {a && !editando && (
        <>
          <div className="acn-gar-texto">{a.parecer}</div>
          <div className="acn-ajuda">{a.por} em {fmtDtHr(a.em)}</div>
          <FraseApoio apoio={a.apoio ? { ...a.apoio, ocorrencia: a.apoio.ocorrencia || g.data_ocorrencia } : null} />
        </>
      )}
      {editando && (
        <div className="acn-dev-form">
          <FraseApoio apoio={apoio} />
          <div><label className="acn-label">Parecer técnico *</label>
            <textarea className="acn-input" rows={3} aria-label="Parecer técnico" placeholder="O que foi encontrado, a causa provável e o que precisa ser feito" value={parecer} onChange={e => setParecer(e.target.value)} /></div>
          <div><label className="acn-label">Cobertura *</label>
            <select className="acn-input" aria-label="Cobertura" value={cobertura} onChange={e => setCobertura(e.target.value)}>
              <option value="">Escolha…</option>
              {Object.entries(COBERTURAS_GARANTIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select></div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Registrar avaliação</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !editando && <div><Botao pequeno disabled={ocupado} onClick={() => { setParecer(a?.parecer || ''); setCobertura(a?.cobertura || ''); setEditando(true); }}>{a ? 'Refazer a avaliação' : 'Registrar avaliação'}</Botao></div>}
      {!a && !conduz && <div className="acn-ajuda">Quem registra é o responsável pelo atendimento ({g.responsavel?.nome}) ou a gerência.</div>}
    </Secao>
  );
}

// ─── Fornecedor ──────────────────────────────────────────────────────────────────────────────────────────────────
function SecaoFornecedor({ g, conduz, executar, ocupado, currentUser }: any) {
  const f = g.fornecedor;
  const [editando, setEditando] = useState(false);
  const [c, setC] = useState<any>({});
  const mudar = (k: string, v: any) => setC((x: any) => ({ ...x, [k]: v }));
  const abrir = () => {
    setC(f ? { modo: f.modo, nome: f.nome || '', protocolo: f.protocolo || '', consultado_em: f.consultado_em || hojeISO(), prazo_resposta: f.prazo_resposta || '', resposta: f.resposta || '', decisao: f.decisao || '', resposta_em: f.resposta_em || '', dispensa: f.dispensa || '' }
      : { modo: 'consulta', nome: '', protocolo: '', consultado_em: hojeISO(), prazo_resposta: '', resposta: '', decisao: '', resposta_em: '', dispensa: '' });
    setEditando(true);
  };
  const salvar = async () => { const r = await executar((x: any, agora: string) => registrarFornecedor(x, currentUser, c, agora, hojeISO())); if (r) setEditando(false); };
  const atraso = f?.modo === 'consulta' && !f.resposta && f.prazo_resposta ? diasAtraso(f.prazo_resposta) : 0;
  const selo = !f ? <Selo familia="neutro" ponto={false}>Não registrado</Selo>
    : f.modo === 'dispensa' ? <Selo familia="neutro" ponto={false}>Não se aplica</Selo>
      : fornecedorLiberado(g) ? <Selo familia={f.decisao === 'cobre' ? 'ok' : f.decisao === 'parcial' ? 'atencao' : 'erro'} ponto={false}>{DECISOES_FORNECEDOR[f.decisao]}</Selo>
        : atraso > 0 ? <Selo familia="erro" ponto={false}>Resposta atrasada há {atraso} dia{atraso === 1 ? '' : 's'}</Selo> : <Selo familia="atencao" ponto={false}>Aguardando resposta</Selo>;
  return (
    <Secao id="fornecedor" titulo="Fornecedor (garantia da peça)" selo={selo}>
      {!g.avaliacao && <div className="acn-ajuda">Sem a avaliação técnica o atendimento não segue: registre-a primeiro.</div>}
      {g.avaliacao && f && !editando && (
        f.modo === 'dispensa'
          ? <div className="acn-gar-texto">Consulta não se aplica: {f.dispensa}</div>
          : <>
            <div><strong>{f.nome}</strong>{f.protocolo ? ` — protocolo ${f.protocolo}` : ''}</div>
            <div className="acn-ajuda">Consultado em {diaBR(f.consultado_em)}{f.prazo_resposta ? ` · prazo de resposta ${diaBR(f.prazo_resposta)}` : ''}</div>
            {f.resposta && <div className="acn-gar-texto">Resposta ({diaBR(f.resposta_em)}): {f.resposta}</div>}
          </>
      )}
      {editando && (
        <div className="acn-dev-form">
          <div><label className="acn-label">O que registrar *</label>
            <select className="acn-input" aria-label="Modo da consulta" value={c.modo} onChange={e => mudar('modo', e.target.value)}>
              <option value="consulta">Consulta ao fornecedor</option>
              <option value="dispensa">Não se aplica (justifique)</option>
            </select></div>
          {c.modo === 'dispensa'
            ? <div><label className="acn-label">Por que a consulta não se aplica *</label>
              <textarea className="acn-input" rows={2} aria-label="Por que não se aplica" value={c.dispensa} onChange={e => mudar('dispensa', e.target.value)} /></div>
            : <>
              <div className="acn-gar-grade">
                <div><label className="acn-label">Fornecedor *</label><input className="acn-input" aria-label="Fornecedor" value={c.nome} onChange={e => mudar('nome', e.target.value)} /></div>
                <div><label className="acn-label">Protocolo</label><input className="acn-input" aria-label="Protocolo" value={c.protocolo} onChange={e => mudar('protocolo', e.target.value)} /></div>
                <div><label className="acn-label">Data da consulta *</label><input type="date" className="acn-input" aria-label="Data da consulta" max={hojeISO()} value={c.consultado_em} onChange={e => mudar('consultado_em', e.target.value)} /></div>
                <div><label className="acn-label">Prazo de resposta</label><input type="date" className="acn-input" aria-label="Prazo de resposta" value={c.prazo_resposta} onChange={e => mudar('prazo_resposta', e.target.value)} /></div>
              </div>
              <div><label className="acn-label">Resposta do fornecedor (deixe em branco enquanto não responder)</label>
                <textarea className="acn-input" rows={2} aria-label="Resposta do fornecedor" value={c.resposta} onChange={e => mudar('resposta', e.target.value)} /></div>
              {c.resposta.trim() && (
                <div className="acn-gar-grade">
                  <div><label className="acn-label">O fornecedor... *</label>
                    <select className="acn-input" aria-label="Decisão do fornecedor" value={c.decisao} onChange={e => mudar('decisao', e.target.value)}>
                      <option value="">Escolha…</option>
                      {Object.entries(DECISOES_FORNECEDOR).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select></div>
                  <div><label className="acn-label">Data da resposta *</label><input type="date" className="acn-input" aria-label="Data da resposta" max={hojeISO()} value={c.resposta_em} onChange={e => mudar('resposta_em', e.target.value)} /></div>
                </div>
              )}
            </>}
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Registrar</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && g.avaliacao && !editando && <div><Botao pequeno disabled={ocupado} onClick={abrir}>{!f ? 'Registrar consulta ao fornecedor' : f.modo === 'consulta' && !f.resposta ? 'Registrar a resposta' : 'Alterar o registro'}</Botao></div>}
    </Secao>
  );
}

// ─── Quem executa ──────────────────────────────────────────────────────────────────────────────────────────────
function SecaoExecucao({ g, conduz, executar, ocupado, currentUser }: any) {
  const e = g.execucao;
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState('propria');
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [novo, setNovo] = useState('');
  const [terceiro, setTerceiro] = useState('');
  const [custo, setCusto] = useState('');
  const abrir = () => {
    setTipo(e?.tipo || 'propria'); setTecnicos((e?.tecnicos || []).map((t: any) => ({ ...t }))); setNovo('');
    setTerceiro(e?.terceiro?.nome || ''); setCusto(e?.terceiro?.custo_previsto != null ? String(e.terceiro.custo_previsto).replace('.', ',') : ''); setEditando(true);
  };
  const salvar = async () => {
    const v = lerValorDigitado(custo);
    if (tipo === 'terceiro' && v.invalido) { alert('O custo do terceiro não parece um valor em reais. Escreva, por exemplo, 350,00.'); return; }
    const r = await executar((x: any, agora: string) => registrarExecucao(x, currentUser, { tipo, tecnicos, terceiro_nome: terceiro, terceiro_custo: v.valor ?? null }, agora));
    if (r) setEditando(false);
  };
  return (
    <Secao id="execucao" titulo="Quem executa" selo={e ? <Selo familia="info" ponto={false}>{e.tipo === 'propria' ? 'Equipe própria' : 'Terceiro'}</Selo> : <Selo familia="neutro" ponto={false}>Não definido</Selo>}>
      {!g.avaliacao && <div className="acn-ajuda">Sem a avaliação técnica o atendimento não segue: registre-a primeiro.</div>}
      {g.avaliacao && e && !editando && (e.tipo === 'propria'
        ? <div>Técnicos: {(e.tecnicos || []).map((t: any) => t.nome).join(', ')}</div>
        : <div>{e.terceiro?.nome}{e.terceiro?.custo_previsto != null ? <span className="acn-ajuda"> — custo previsto {brl(e.terceiro.custo_previsto)}</span> : <span className="acn-ajuda"> — custo ainda não informado</span>}</div>)}
      {editando && (
        <div className="acn-dev-form">
          <div><label className="acn-label">Quem executa *</label>
            <select className="acn-input" aria-label="Quem executa" value={tipo} onChange={ev => setTipo(ev.target.value)}>
              <option value="propria">Equipe própria</option>
              <option value="terceiro">Terceiro</option>
            </select></div>
          {tipo === 'propria' ? (
            <>
              {tecnicos.length > 0 && <div className="acn-participantes-chips">{tecnicos.map((t, i) => (
                <span key={i} className="acn-participante-chip">{t.nome}
                  <Botao variante="discreto" pequeno icone={mdiClose} className="acn-ptp-x" aria-label={`Tirar ${t.nome}`} title="Tirar" onClick={() => setTecnicos(l => l.filter((_, k) => k !== i))} /></span>))}</div>}
              <div className="acn-dev-form-linha">
                <div className="acn-dev-campo-resp"><ColaboradorSelect value={novo} onChange={setNovo} placeholder="Escolha o técnico" /></div>
                <Botao pequeno disabled={!novo} onClick={() => { if (novo && !tecnicos.some(t => t.nome === novo)) setTecnicos(l => [...l, { nome: novo }]); setNovo(''); }}>Adicionar técnico</Botao>
              </div>
            </>
          ) : (
            <div className="acn-gar-grade">
              <div><label className="acn-label">Terceiro (empresa ou pessoa) *</label><input className="acn-input" aria-label="Terceiro" value={terceiro} onChange={ev => setTerceiro(ev.target.value)} /></div>
              <div><label className="acn-label">Custo previsto (R$)</label><input className="acn-input" aria-label="Custo previsto do terceiro" inputMode="decimal" placeholder="opcional por enquanto" value={custo} onChange={ev => setCusto(ev.target.value)} /></div>
            </div>
          )}
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Registrar</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && g.avaliacao && !editando && <div><Botao pequeno disabled={ocupado} onClick={abrir}>{e ? 'Alterar' : 'Definir quem executa'}</Botao></div>}
    </Secao>
  );
}

// ─── Pedido de peça ao Compras ────────────────────────────────────────────────────────────────────────────────────
function SecaoPecas({ g, conduz, executar, ocupado, currentUser }: any) {
  const [abrindo, setAbrindo] = useState(false);
  const trava = podePedirPeca(g);
  const pedidos = g.pedidos_compra || [];
  const f = g.fornecedor;
  const contexto = [
    `Garantia ${g.numero} — ${g.cliente_nome} — ${g.veiculo_nome}${g.placa ? ' ' + g.placa : ''}`,
    f?.modo === 'consulta' ? `Fornecedor ${f.nome}${f.protocolo ? ` (protocolo ${f.protocolo})` : ''}: ${DECISOES_FORNECEDOR[f.decisao] || 'sem resposta'}` : f?.modo === 'dispensa' ? 'Consulta ao fornecedor dispensada' : '',
  ].filter(Boolean).join('\n');
  const registrar = async (r: any) => {
    const x = await executar((gg: any, agora: string) => registrarPedidoDePeca(gg, currentUser, { pedido_id: r.id, numero_pedido: r.numero_pedido, titulo: `Peça em garantia — ${g.numero}` }, agora));
    // o pedido já nasceu no Compras: se a ficha não gravou, a pessoa precisa saber o número para não pedir outro
    if (!x) alert(`Não foi possível registrar o pedido na ficha, mas ele JÁ FOI aberto no Compras: ${r.numero_pedido}. Não abra outro; avise a gerência para ligar o pedido ao atendimento.`);
  };
  return (
    <Secao id="pecas" titulo="Peças pedidas ao Compras" selo={pedidos.length ? <Selo familia="info" ponto={false}>{pedidos.length} pedido{pedidos.length === 1 ? '' : 's'}</Selo> : null}>
      {pedidos.length === 0 && <div className="acn-ajuda">Nenhum pedido de peça aberto por este atendimento.</div>}
      {pedidos.map((p: any) => <div key={p.id} className="acn-gar-pedido"><strong>{p.numero}</strong> <span className="acn-ajuda">{p.por}, {fmtDtHr(p.em)}</span></div>)}
      {conduz && (
        <div>
          <Botao pequeno icone={mdiCartOutline} disabled={!trava.ok || ocupado} title={trava.ok ? undefined : trava.motivo} onClick={() => setAbrindo(true)}>Pedir peça ao Compras</Botao>
          {!trava.ok && <div className="acn-ajuda atencao" data-trava>{trava.motivo}</div>}
        </div>
      )}
      {abrindo && (
        <ModalSolicitarCompra currentUser={currentUser} titulo={`Pedir peça — ${g.numero}`} subtitulo="O pedido vai para o Compras ligado a este atendimento de garantia."
          valorInicial={{ titulo: `Peça em garantia — ${g.numero}`, vinculo: g.origem_tipo === 'op' && g.opl_id ? { tipo: 'op', id: g.opl_id, descricao: `${g.origem_ref} — ${g.cliente_nome}` } : null }}
          origemSetor="Garantia" opl={g.origem_tipo === 'op' ? g.origem_ref : null} contexto={contexto}
          onClose={() => setAbrindo(false)} onCriada={registrar} />
      )}
    </Secao>
  );
}

export function SecoesGarantia({ g, currentUser, executar, ocupado }: any) {
  const conduz = g.situacao === 'aberto' && podeConduzirGarantia(g, currentUser);
  const comum = { g, conduz, executar, ocupado, currentUser };
  // G3: fora da garantia o atendimento não segue sem o alinhamento aceito pelo cliente e a autorização da direção; "a confirmar" não trava, mas avisa
  const fora = bloqueioForaDaGarantia(g);
  return (
    <div className="acn-gar-secoes">
      {g.situacao === 'aberto' && fora.bloqueado && <Faixa tom="atencao">Atendimento fora da garantia: para definir quem executa e pedir peça falta {fora.faltas.join(' e ')}.</Faixa>}
      {g.situacao === 'aberto' && g.avaliacao?.cobertura === 'a_confirmar' && <Faixa tom="info">A cobertura ainda está a confirmar. Se ficar fora da garantia, será preciso o alinhamento com o cliente e a autorização da direção para seguir.</Faixa>}
      <SecaoAvaliacao {...comum} />
      <SecaoFornecedor {...comum} />
      <SecaoCustos {...comum} />
      <SecaoCliente {...comum} />
      <SecaoDirecao {...comum} />
      <SecaoExecucao {...comum} />
      <SecaoPecas {...comum} />
      <SecaoPecasGarantia {...comum} />
      <SecaoApontamentos {...comum} />
    </div>
  );
}
