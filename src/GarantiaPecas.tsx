// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — peças em garantia (envio e retorno) e apontamentos do atendimento (G4 do PLANO_GARANTIA.md, 20/10/2026)
//
// Decisão do usuário em 20/10/2026: quem registra é o responsável pelo atendimento e a gerência. Cada peça tem uma trilha de movimentos (a enviar → enviada ao fornecedor → em análise →
// retornou / reposta / descartada) com data e rastreio; a trilha só se acrescenta e dá para desfazer o último, com motivo. O diário técnico (apontamentos) guarda dia, técnico, horas, falha
// encontrada, solução e peças aplicadas. As regras estão em GarantiaModelo.ts; aqui ficam os campos.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { lerValorDigitado } from './LerValor';
import { ColaboradorSelect } from './ColaboradorSelect';
import { confirmar, pedirTexto } from './Feedback';
import Icone from './Icone';
import { Botao, Selo, hojeISO, diaBR } from './Interface';
import {
  SITUACOES_PECA, seguintesDaPeca, situacaoDaPeca, ultimoMovimento, pecasPendentes, adicionarPeca, moverPeca, desfazerMovimentoDaPeca, tirarPeca,
  salvarApontamentos, totaisDeApontamentos,
} from './GarantiaModelo';
import { mdiPlus, mdiClose } from '@mdi/js';

const FAMILIA_PECA: Record<string, string> = { a_enviar: 'neutro', enviada: 'info', em_analise: 'atencao', retornou: 'ok', reposta: 'ok', descartada: 'neutro' };
const texto = (n: any) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

function Secao({ id, titulo, selo, children }: any) {
  return (
    <div className="acn-gar-secao" data-secao={id}>
      <div className="acn-gar-secao-cab"><div className="acn-pdp-rotulo">{titulo}</div>{selo}</div>
      {children}
    </div>
  );
}

// ─── Peças em garantia: envio e retorno ──────────────────────────────────────────────────────────────────────
export function SecaoPecasGarantia({ g, conduz, executar, ocupado, currentUser }: any) {
  const pecas = Array.isArray(g.pecas) ? g.pecas : [];
  const pendentes = pecasPendentes(g, hojeISO());
  const [adicionando, setAdicionando] = useState(false);
  const [nova, setNova] = useState<any>({});
  const [movendo, setMovendo] = useState<string | null>(null);
  const [mov, setMov] = useState<any>({});
  const salvarNova = async () => {
    const r = await executar((x: any, agora: string) => adicionarPeca(x, currentUser, { ...nova, quantidade: Number(String(nova.quantidade || '1').replace(/\D/g, '')) || 0 }, agora, hojeISO()));
    if (r) setAdicionando(false);
  };
  const abrirMov = (p: any) => { setMovendo(p.id); setMov({ situacao: seguintesDaPeca(situacaoDaPeca(p))[0] || '', data: hojeISO(), rastreio: '', nota: '' }); };
  const salvarMov = async (p: any) => {
    const r = await executar((x: any, agora: string) => moverPeca(x, p.id, currentUser, mov, agora, hojeISO()));
    if (r) setMovendo(null);
  };
  return (
    <Secao id="pecasgar" titulo="Peças em garantia (envio e retorno)"
      selo={pecas.length === 0 ? <Selo familia="neutro" ponto={false}>Sem peças</Selo> : pendentes.length ? <Selo familia="atencao" ponto={false}>{pendentes.length} ainda não {pendentes.length === 1 ? 'voltou' : 'voltaram'}</Selo> : <Selo familia="ok" ponto={false}>Todas resolvidas</Selo>}>
      {pecas.length === 0 && !adicionando && <div className="acn-ajuda">Nenhuma peça em garantia cadastrada. A peça defeituosa que vai ao fornecedor é acompanhada aqui, do envio ao retorno.</div>}
      {pecas.map((p: any) => {
        const sit = situacaoDaPeca(p), ult = ultimoMovimento(p), pend = pendentes.find((x: any) => x.id === p.id);
        const seguintes = seguintesDaPeca(sit);
        return (
          <div key={p.id} className="acn-gar-pedido" data-peca={p.id}>
            <div><strong>{p.quantidade}× {p.descricao}</strong>{p.numero_serie ? <span className="acn-ajuda"> (série {p.numero_serie})</span> : null} <Selo familia={FAMILIA_PECA[sit]} ponto={false}>{SITUACOES_PECA[sit]}</Selo></div>
            <div className="acn-ajuda">Último movimento em {diaBR(ult?.data)}{pend ? ` — há ${pend.dias} dia${pend.dias === 1 ? '' : 's'}` : ''}{ult?.rastreio ? ` · rastreio ${ult.rastreio}` : ''}{ult?.nota ? ` · ${ult.nota}` : ''}</div>
            <details className="acn-dev-historico">
              <summary>Trilha da peça ({p.movimentos.length})</summary>
              <ul>{[...p.movimentos].reverse().map((m: any, i: number) => (
                <li key={i}><span className="acn-ajuda">{diaBR(m.data)} · {m.por}</span><div>{SITUACOES_PECA[m.situacao]}{m.rastreio ? ` — rastreio ${m.rastreio}` : ''}{m.nota ? ` — ${m.nota}` : ''}</div></li>
              ))}</ul>
            </details>
            {movendo === p.id && (
              <div className="acn-dev-form">
                <div className="acn-gar-grade">
                  <div><label className="acn-label">Agora a peça está *</label>
                    <select className="acn-input" aria-label="Nova situação da peça" value={mov.situacao} onChange={e => setMov({ ...mov, situacao: e.target.value })}>
                      {seguintes.map(s => <option key={s} value={s}>{SITUACOES_PECA[s]}</option>)}
                    </select></div>
                  <div><label className="acn-label">Data *</label>
                    <input type="date" className="acn-input" aria-label="Data do movimento" max={hojeISO()} value={mov.data} onChange={e => setMov({ ...mov, data: e.target.value })} /></div>
                  <div><label className="acn-label">Rastreio</label>
                    <input className="acn-input" aria-label="Rastreio" placeholder="código ou transportadora" value={mov.rastreio} onChange={e => setMov({ ...mov, rastreio: e.target.value })} /></div>
                  <div><label className="acn-label">{mov.situacao === 'descartada' ? 'Por que foi descartada *' : 'Observação'}</label>
                    <input className="acn-input" aria-label="Observação do movimento" value={mov.nota} onChange={e => setMov({ ...mov, nota: e.target.value })} /></div>
                </div>
                <div className="acn-dev-acoes">
                  <Botao variante="primario" pequeno disabled={ocupado} onClick={() => salvarMov(p)}>Registrar movimento</Botao>
                  <Botao pequeno onClick={() => setMovendo(null)}>Cancelar</Botao>
                </div>
              </div>
            )}
            {conduz && movendo !== p.id && (
              <div className="acn-dev-acoes">
                {seguintes.length > 0 && <Botao pequeno disabled={ocupado} onClick={() => abrirMov(p)}>Registrar movimento</Botao>}
                {p.movimentos.length > 1 && <Botao pequeno variante="discreto" disabled={ocupado} onClick={async () => {
                  const m = await pedirTexto('Por que desfazer o último movimento desta peça? (fica no histórico)');
                  if (!m || !String(m).trim()) return;
                  executar((x: any, agora: string) => desfazerMovimentoDaPeca(x, p.id, currentUser, m, agora));
                }}>Desfazer o último movimento</Botao>}
                {p.movimentos.length === 1 && <Botao pequeno variante="discreto" disabled={ocupado} onClick={async () => {
                  if (!await confirmar(`Tirar "${p.descricao}" da ficha? (só é possível porque ela ainda não teve movimento)`)) return;
                  executar((x: any, agora: string) => tirarPeca(x, p.id, currentUser, agora));
                }}>Tirar a peça</Botao>}
              </div>
            )}
          </div>
        );
      })}
      {adicionando && (
        <div className="acn-dev-form">
          <div className="acn-gar-grade">
            <div><label className="acn-label">Peça *</label><input className="acn-input" aria-label="Descrição da peça em garantia" placeholder="Ex: fonte 12V da barra" value={nova.descricao || ''} onChange={e => setNova({ ...nova, descricao: e.target.value })} /></div>
            <div><label className="acn-label">Quantidade *</label><input className="acn-input" aria-label="Quantidade da peça" inputMode="numeric" value={nova.quantidade ?? '1'} onChange={e => setNova({ ...nova, quantidade: e.target.value })} /></div>
            <div><label className="acn-label">Número de série</label><input className="acn-input" aria-label="Número de série da peça" value={nova.numero_serie || ''} onChange={e => setNova({ ...nova, numero_serie: e.target.value })} /></div>
          </div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvarNova}>Cadastrar peça</Botao>
            <Botao pequeno onClick={() => setAdicionando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !adicionando && <div><Botao pequeno icone={mdiPlus} disabled={ocupado} onClick={() => { setNova({ descricao: '', quantidade: '1', numero_serie: '' }); setAdicionando(true); }}>Cadastrar peça em garantia</Botao></div>}
    </Secao>
  );
}

// ─── Apontamentos do atendimento ─────────────────────────────────────────────────────────────────────────────────
export function SecaoApontamentos({ g, conduz, executar, ocupado, currentUser }: any) {
  const lista = Array.isArray(g.apontamentos) ? g.apontamentos : [];
  const tot = totaisDeApontamentos(g);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<any[]>([]);
  const abrir = () => { setRascunho(lista.map((a: any) => ({ ...a, horas: texto(a.horas) }))); setEditando(true); };
  const mudar = (n: number, k: string, v: any) => setRascunho(l => l.map((x, i) => (i === n ? { ...x, [k]: v } : x)));
  const tecnicoPadrao = g.execucao?.tipo === 'propria' ? (g.execucao.tecnicos?.[0]?.nome || '') : '';
  const salvar = async () => {
    const prontas: any[] = [];
    for (const [n, a] of rascunho.entries()) {
      const h = lerValorDigitado(a.horas);
      if (h.invalido) { alert(`No apontamento ${n + 1} as horas não parecem um número. Escreva, por exemplo, 2,5.`); return; }
      prontas.push({ ...a, horas: h.valor ?? null });
    }
    const r = await executar((x: any, agora: string) => salvarApontamentos(x, currentUser, prontas, agora, hojeISO()));
    if (r) setEditando(false);
  };
  return (
    <Secao id="apontamentos" titulo="Apontamentos do atendimento" selo={lista.length ? <Selo familia="info" ponto={false}>{String(tot.total).replace('.', ',')} h</Selo> : <Selo familia="neutro" ponto={false}>Sem apontamentos</Selo>}>
      {lista.length === 0 && !editando && <div className="acn-ajuda">O diário técnico: dia, técnico, horas, a falha encontrada, a solução adotada e as peças aplicadas.</div>}
      {lista.length > 0 && !editando && (
        <>
          {[...lista].reverse().map((a: any) => (
            <div key={a.id} className="acn-gar-pedido" data-apontamento>
              <div><strong>{diaBR(a.data)}</strong> · {a.tecnico} · {String(a.horas).replace('.', ',')} h</div>
              <div className="acn-gar-texto"><strong>Falha:</strong> {a.falha}</div>
              <div className="acn-gar-texto"><strong>Solução:</strong> {a.solucao || <span className="acn-ajuda">ainda não registrada</span>}</div>
              {a.pecas_aplicadas && <div className="acn-ajuda">Peças aplicadas: {a.pecas_aplicadas}</div>}
            </div>
          ))}
          <div className="acn-ajuda" data-horas>Total: {String(tot.total).replace('.', ',')} h — {Object.entries(tot.porTecnico).map(([n, h]) => `${n} ${String(h).replace('.', ',')} h`).join(' · ')}</div>
        </>
      )}
      {editando && (
        <div className="acn-dev-form">
          {rascunho.map((a, n) => (
            <div key={a.id || n} className="acn-dev-conceito" data-apt={n}>
              <div className="acn-dev-form-linha">
                <input type="date" className="acn-input acn-dev-form-prio" aria-label={`Dia do apontamento ${n + 1}`} max={hojeISO()} value={a.data} onChange={e => mudar(n, 'data', e.target.value)} />
                <div className="acn-dev-campo-resp"><ColaboradorSelect value={a.tecnico} onChange={v => mudar(n, 'tecnico', v)} placeholder="Técnico" /></div>
                <input className="acn-input acn-dev-bom-num" aria-label={`Horas do apontamento ${n + 1}`} inputMode="decimal" placeholder="Horas *" value={a.horas} onChange={e => mudar(n, 'horas', e.target.value)} />
                <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar apontamento ${n + 1}`} title="Tirar" onClick={() => setRascunho(r => r.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
              </div>
              <textarea className="acn-input" rows={2} aria-label={`Falha encontrada ${n + 1}`} placeholder="Falha encontrada *" value={a.falha} onChange={e => mudar(n, 'falha', e.target.value)} />
              <textarea className="acn-input" rows={2} aria-label={`Solução adotada ${n + 1}`} placeholder="Solução adotada (pode ficar para depois)" value={a.solucao || ''} onChange={e => mudar(n, 'solucao', e.target.value)} />
              <input className="acn-input" aria-label={`Peças aplicadas ${n + 1}`} placeholder="Peças aplicadas (opcional)" value={a.pecas_aplicadas || ''} onChange={e => mudar(n, 'pecas_aplicadas', e.target.value)} />
            </div>
          ))}
          <div><Botao pequeno icone={mdiPlus} onClick={() => setRascunho(r => [...r, { id: '', data: hojeISO(), tecnico: tecnicoPadrao, horas: '', falha: '', solucao: '', pecas_aplicadas: '' }])}>Adicionar apontamento</Botao></div>
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvar}>Salvar apontamentos</Botao>
            <Botao pequeno onClick={() => setEditando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
      {conduz && !editando && <div><Botao pequeno disabled={ocupado} onClick={abrir}>{lista.length ? 'Editar os apontamentos' : 'Registrar apontamento'}</Botao></div>}
    </Secao>
  );
}
