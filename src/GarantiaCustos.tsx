// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — quadro de custos, alinhamento com o cliente e autorização da direção (G3 do PLANO_GARANTIA.md, 19/10/2026)
//
// Decisões do usuário em 19/10/2026: a DIREÇÃO é quem tem o perfil Admin; tudo que é fora da garantia ou cortesia vai para a direção (sem faixa de valor); quem registra custos, alinhamento
// e pedido de autorização é o responsável pelo atendimento e a gerência. O atendimento FORA da garantia não segue (quem executa, pedido de peça) sem o alinhamento aceito pelo cliente e
// sem uma autorização aprovada pela direção. As regras estão em GarantiaModelo.ts; aqui ficam os campos.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { lerValorDigitado } from './LerValor';
import { confirmar, pedirTexto } from './Feedback';
import Icone from './Icone';
import { Botao, Selo, hojeISO, diaBR } from './Interface';
import {
  TIPOS_CUSTO, PAGADORES_GARANTIA, CANAIS_CLIENTE, ACEITES_CLIENTE, TIPOS_AUTORIZACAO, ehDirecaoGarantia, totaisDeCustos, custoConsiderado,
  salvarCustos, lancarCustoDoTerceiro, registrarAlinhamento, pedirAutorizacao, decidirAutorizacao, cancelarAutorizacao, podeConduzirGarantia,
} from './GarantiaModelo';
import { mdiPlus, mdiClose } from '@mdi/js';

const fmtDtHr = (d: string) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const brl = (v: any) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const texto = (n: any) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const novoId = () => 'n' + Math.random().toString(36).slice(2, 8);

function Secao({ id, titulo, selo, children }: any) {
  return (
    <div className="acn-gar-secao" data-secao={id}>
      <div className="acn-gar-secao-cab"><div className="acn-pdp-rotulo">{titulo}</div>{selo}</div>
      {children}
    </div>
  );
}

// ─── Quadro de custos ─────────────────────────────────────────────────────────────────────────────────────────────
export function SecaoCustos({ g, conduz, executar, ocupado, currentUser }: any) {
  const linhas = Array.isArray(g.custos) ? g.custos : [];
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<any[]>([]);
  const tot = totaisDeCustos(g);
  const abrir = () => { setRascunho(linhas.map((l: any) => ({ ...l, previsto: texto(l.previsto), negociado: texto(l.negociado) }))); setEditando(true); };
  const mudar = (n: number, k: string, v: any) => setRascunho(l => l.map((x, i) => (i === n ? { ...x, [k]: v } : x)));
  const salvar = async () => {
    const prontas: any[] = [];
    for (const [n, l] of rascunho.entries()) {
      const p = lerValorDigitado(l.previsto), ng = lerValorDigitado(l.negociado);
      if (p.invalido || ng.invalido) { alert(`Na linha ${n + 1} o valor não parece um número em reais. Escreva, por exemplo, 350,00.`); return; }
      prontas.push({ ...l, previsto: p.valor ?? null, negociado: ng.valor ?? null });
    }
    const r = await executar((x: any, agora: string) => salvarCustos(x, currentUser, prontas, agora));
    if (r) setEditando(false);
  };
  const t = g.execucao?.tipo === 'terceiro' ? g.execucao.terceiro : null;
  const podeLancar = conduz && t && t.custo_previsto != null && !linhas.some((l: any) => l.origem === 'execucao');
  return (
    <Secao id="custos" titulo="Quadro de custos" selo={linhas.length ? <Selo familia="info" ponto={false}>Considerado {brl(tot.considerado)}</Selo> : <Selo familia="neutro" ponto={false}>Sem custos</Selo>}>
      {linhas.length > 0 && !editando && (
        <>
          <div className="acn-gar-tabela">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Tipo</th><th>Descrição</th><th>Previsto</th><th>Negociado</th><th>Quem paga</th><th>Aprovado</th></tr></thead>
              <tbody>
                {linhas.map((l: any) => (
                  <tr key={l.id}>
                    <td>{TIPOS_CUSTO[l.tipo]}</td><td>{l.descricao || '—'}</td><td>{brl(l.previsto)}</td>
                    <td>{l.negociado !== null && l.negociado !== undefined ? <>{brl(l.negociado)} <span className="acn-ajuda">({l.negociado_por})</span></> : '—'}</td>
                    <td>{PAGADORES_GARANTIA[l.pagador || 'empresa']}</td>
                    <td>{l.aprovado ? <Selo familia="ok" ponto={false}>{l.aprovado_por}</Selo> : <Selo familia="neutro" ponto={false}>Não</Selo>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acn-ajuda" data-totais>
            Previsto {brl(tot.previsto)} · Considerado {brl(tot.considerado)} · Aprovado {brl(tot.aprovado)} — paga a empresa {brl(tot.porPagador.empresa)}, o cliente {brl(tot.porPagador.cliente)}, o fornecedor {brl(tot.porPagador.fornecedor)}
          </div>
        </>
      )}
      {linhas.length === 0 && !editando && <div className="acn-ajuda">Nenhum custo lançado. Diagnóstico, deslocamento, frete e outros, previstos e negociados, entram aqui.</div>}
      {editando && (
        <div className="acn-dev-form">
          <div className="acn-ajuda">Valor negociado em branco = vale o previsto. Se negociou, diga quem negociou.</div>
          {rascunho.map((l, n) => (
            <div key={l.id || n} className="acn-dev-conceito" data-custo={n}>
              <div className="acn-dev-form-linha">
                <select className="acn-input acn-dev-form-prio" aria-label={`Tipo do custo ${n + 1}`} value={l.tipo} onChange={e => mudar(n, 'tipo', e.target.value)}>
                  {Object.entries(TIPOS_CUSTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
                <input className="acn-input" aria-label={`Descrição do custo ${n + 1}`} placeholder="Descrição (opcional)" value={l.descricao || ''} onChange={e => mudar(n, 'descricao', e.target.value)} />
                <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar custo ${n + 1}`} title="Tirar" onClick={() => setRascunho(r => r.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
              </div>
              <div className="acn-dev-form-linha">
                <input className="acn-input acn-dev-bom-num" aria-label={`Valor previsto ${n + 1}`} inputMode="decimal" placeholder="Previsto R$ *" value={l.previsto} onChange={e => mudar(n, 'previsto', e.target.value)} />
                <input className="acn-input acn-dev-bom-num" aria-label={`Valor negociado ${n + 1}`} inputMode="decimal" placeholder="Negociado R$" value={l.negociado} onChange={e => mudar(n, 'negociado', e.target.value)} />
                <input className="acn-input" aria-label={`Quem negociou ${n + 1}`} placeholder="Quem negociou" value={l.negociado_por || ''} onChange={e => mudar(n, 'negociado_por', e.target.value)} />
              </div>
              <div className="acn-dev-form-linha">
                <select className="acn-input acn-dev-form-prio" aria-label={`Quem paga ${n + 1}`} value={l.pagador || 'empresa'} onChange={e => mudar(n, 'pagador', e.target.value)}>
                  {Object.entries(PAGADORES_GARANTIA).map(([v, r]) => <option key={v} value={v}>Paga: {r}</option>)}
                </select>
                <label className="acn-dev-form-nenhum"><input type="checkbox" aria-label={`Custo ${n + 1} aprovado`} checked={!!l.aprovado} onChange={e => mudar(n, 'aprovado', e.target.checked)} /> Aprovado</label>
              </div>
            </div>
          ))}
          <div><Botao pequeno icone={mdiPlus} onClick={() => setRascunho(r => [...r, { id: '', tipo: 'diagnostico', descricao: '', previsto: '', negociado: '', negociado_por: '', pagador: 'empresa', aprovado: false }])}>Adicionar custo</Botao></div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Salvar quadro de custos</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !editando && (
        <div className="acn-dev-acoes">
          <Botao pequeno disabled={ocupado} onClick={abrir}>{linhas.length ? 'Editar o quadro' : 'Lançar custos'}</Botao>
          {podeLancar && <Botao pequeno variante="discreto" disabled={ocupado} onClick={() => executar((x: any, agora: string) => lancarCustoDoTerceiro(x, currentUser, agora))}>Lançar o custo do terceiro ({brl(t.custo_previsto)})</Botao>}
        </div>
      )}
    </Secao>
  );
}

// ─── Alinhamento com o cliente ────────────────────────────────────────────────────────────────────────────────────
export function SecaoCliente({ g, conduz, executar, ocupado, currentUser }: any) {
  const lista = [...(Array.isArray(g.alinhamentos) ? g.alinhamentos : [])].reverse();
  const atual = lista[0];
  const [editando, setEditando] = useState(false);
  const [c, setC] = useState<any>({});
  const abrir = () => { setC({ quem_falou: g.cliente_nome || '', quando: hojeISO(), canal: 'telefone', combinado: '', aceitou: 'aguardando' }); setEditando(true); };
  const mudar = (k: string, v: any) => setC((x: any) => ({ ...x, [k]: v }));
  const salvar = async () => { const r = await executar((x: any, agora: string) => registrarAlinhamento(x, currentUser, c, agora, hojeISO())); if (r) setEditando(false); };
  const fora = g.avaliacao?.cobertura === 'fora';
  return (
    <Secao id="cliente" titulo="Alinhamento com o cliente" selo={atual ? <Selo familia={atual.aceitou === 'sim' ? 'ok' : atual.aceitou === 'nao' ? 'erro' : 'atencao'} ponto={false}>{ACEITES_CLIENTE[atual.aceitou]}</Selo> : <Selo familia={fora ? 'erro' : 'neutro'} ponto={false}>{fora ? 'Obrigatório (fora da garantia)' : 'Não registrado'}</Selo>}>
      {lista.length === 0 && !editando && <div className="acn-ajuda">{fora ? 'Atendimento fora da garantia: sem o alinhamento aceito pelo cliente ele não segue.' : 'Registre o que ficou combinado com o cliente, principalmente quem paga o que não for do nosso fornecimento.'}</div>}
      {lista.map((a: any) => (
        <div key={a.id} className="acn-gar-pedido" data-alinhamento>
          <div><strong>{diaBR(a.quando)}</strong> · {CANAIS_CLIENTE[a.canal]} · com {a.quem_falou} — <Selo familia={a.aceitou === 'sim' ? 'ok' : a.aceitou === 'nao' ? 'erro' : 'atencao'} ponto={false}>{ACEITES_CLIENTE[a.aceitou]}</Selo></div>
          <div className="acn-gar-texto">{a.combinado}</div>
          <div className="acn-ajuda">Registrado por {a.por} em {fmtDtHr(a.em)}</div>
        </div>
      ))}
      {editando && (
        <div className="acn-dev-form">
          <div className="acn-ajuda">Cada conversa é um registro novo (o que já foi registrado não se reescreve); vale o último.</div>
          <div className="acn-gar-grade">
            <div><label className="acn-label">Com quem do cliente falou *</label><input className="acn-input" aria-label="Com quem falou" value={c.quem_falou} onChange={e => mudar('quem_falou', e.target.value)} /></div>
            <div><label className="acn-label">Dia da conversa *</label><input type="date" className="acn-input" aria-label="Dia da conversa" max={hojeISO()} value={c.quando} onChange={e => mudar('quando', e.target.value)} /></div>
            <div><label className="acn-label">Por onde *</label>
              <select className="acn-input" aria-label="Canal da conversa" value={c.canal} onChange={e => mudar('canal', e.target.value)}>{Object.entries(CANAIS_CLIENTE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
            <div><label className="acn-label">O cliente... *</label>
              <select className="acn-input" aria-label="Aceite do cliente" value={c.aceitou} onChange={e => mudar('aceitou', e.target.value)}>{Object.entries(ACEITES_CLIENTE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
          </div>
          <div><label className="acn-label">O que ficou combinado (condições e quem paga) *</label>
            <textarea className="acn-input" rows={3} aria-label="O que ficou combinado" value={c.combinado} onChange={e => mudar('combinado', e.target.value)} /></div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Registrar alinhamento</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !editando && <div><Botao pequeno disabled={ocupado} onClick={abrir}>Registrar alinhamento</Botao></div>}
    </Secao>
  );
}

// ─── Autorização da direção ───────────────────────────────────────────────────────────────────────────────────
export function SecaoDirecao({ g, conduz, executar, ocupado, currentUser }: any) {
  const lista = [...(Array.isArray(g.autorizacoes) ? g.autorizacoes : [])].reverse();
  const direcao = ehDirecaoGarantia(currentUser) && g.situacao === 'aberto';
  const [editando, setEditando] = useState(false);
  const [c, setC] = useState<any>({});
  const fora = g.avaliacao?.cobertura === 'fora';
  const aprovada = lista.some((a: any) => a.status === 'aprovada');
  const pendente = lista.some((a: any) => a.status === 'pedida');
  const abrir = () => { setC({ tipo: fora ? 'fora_da_garantia' : 'cortesia', valor: texto(totaisDeCustos(g).porPagador.empresa || ''), motivo: '' }); setEditando(true); };
  const mudar = (k: string, v: any) => setC((x: any) => ({ ...x, [k]: v }));
  const salvar = async () => {
    const v = lerValorDigitado(c.valor);
    if (v.invalido) { alert('O valor não parece um número em reais. Escreva, por exemplo, 530,00.'); return; }
    const r = await executar((x: any, agora: string) => pedirAutorizacao(x, currentUser, { tipo: c.tipo, valor: v.valor ?? null, motivo: c.motivo }, agora));
    if (r) setEditando(false);
  };
  const FAM: any = { pedida: 'atencao', aprovada: 'ok', negada: 'erro', cancelada: 'neutro' };
  const ROT: any = { pedida: 'Esperando a direção', aprovada: 'Aprovada pela direção', negada: 'Negada pela direção', cancelada: 'Cancelado' };
  return (
    <Secao id="direcao" titulo="Autorização da direção" selo={aprovada ? <Selo familia="ok" ponto={false}>Aprovada</Selo> : pendente ? <Selo familia="atencao" ponto={false}>Esperando a direção</Selo> : <Selo familia={fora ? 'erro' : 'neutro'} ponto={false}>{fora ? 'Obrigatória (fora da garantia)' : 'Não pedida'}</Selo>}>
      <div className="acn-ajuda">Despesa fora da garantia ou cortesia: só a direção (perfil Admin) autoriza. Fica gravado quem decidiu e quando.</div>
      {lista.map((a: any) => (
        <div key={a.id} className="acn-gar-pedido" data-autorizacao={a.status}>
          <div><strong>{TIPOS_AUTORIZACAO[a.tipo]}</strong> — {brl(a.valor)} <Selo familia={FAM[a.status]} ponto={false}>{ROT[a.status]}</Selo></div>
          <div className="acn-gar-texto">{a.motivo}</div>
          <div className="acn-ajuda">Pedida por {a.pedida_por} em {fmtDtHr(a.pedida_em)}</div>
          {a.decisao && <div className="acn-ajuda">{a.status === 'aprovada' ? 'Aprovada' : 'Negada'} por {a.decisao.por} em {fmtDtHr(a.decisao.em)}{a.decisao.texto ? ` — ${a.decisao.texto}` : ''}</div>}
          {a.status === 'cancelada' && a.cancelada_motivo && <div className="acn-ajuda">Cancelado: {a.cancelada_motivo}</div>}
          {a.status === 'pedida' && direcao && (
            <div className="acn-dev-acoes">
              <Botao variante="primario" pequeno disabled={ocupado} onClick={async () => {
                if (!await confirmar(`Autorizar ${TIPOS_AUTORIZACAO[a.tipo].toLowerCase()} de ${brl(a.valor)}?`)) return;
                executar((x: any, agora: string) => decidirAutorizacao(x, a.id, currentUser, { decisao: 'aprovou' }, agora));
              }}>Aprovar</Botao>
              <Botao variante="perigo-sec" pequeno disabled={ocupado} onClick={async () => {
                const t = await pedirTexto('Por que a autorização foi negada? (fica registrado)');
                if (!t || !String(t).trim()) return;
                executar((x: any, agora: string) => decidirAutorizacao(x, a.id, currentUser, { decisao: 'negou', texto: t }, agora));
              }}>Negar</Botao>
            </div>
          )}
          {a.status === 'pedida' && (podeConduzirGarantia(g, currentUser) || a.pedida_por === currentUser?.nome) && g.situacao === 'aberto' && (
            <div><Botao variante="discreto" pequeno disabled={ocupado} onClick={async () => {
              const t = await pedirTexto('Motivo do cancelamento deste pedido:');
              if (!t || !String(t).trim()) return;
              executar((x: any, agora: string) => cancelarAutorizacao(x, a.id, currentUser, t, agora));
            }}>Cancelar o pedido</Botao></div>
          )}
        </div>
      ))}
      {editando && (
        <div className="acn-dev-form">
          <div className="acn-gar-grade">
            <div><label className="acn-label">O que está sendo pedido *</label>
              <select className="acn-input" aria-label="Tipo de autorização" value={c.tipo} onChange={e => mudar('tipo', e.target.value)}>{Object.entries(TIPOS_AUTORIZACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
            <div><label className="acn-label">Valor (R$) *</label>
              <input className="acn-input" aria-label="Valor da autorização" inputMode="decimal" value={c.valor} onChange={e => mudar('valor', e.target.value)} />
              <div className="acn-ajuda">Já vem o que a empresa paga no quadro de custos.</div></div>
          </div>
          <div><label className="acn-label">Motivo *</label>
            <textarea className="acn-input" rows={2} aria-label="Motivo da autorização" value={c.motivo} onChange={e => mudar('motivo', e.target.value)} /></div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Pedir à direção</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !editando && !pendente && <div><Botao pequeno disabled={ocupado} onClick={abrir}>Pedir autorização à direção</Botao></div>}
    </Secao>
  );
}
