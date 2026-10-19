// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — formulários da Concepção e da Criação (D2 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// Cada entregável destas duas etapas deixa de ser só "feito + anexo + nota" e ganha o formulário do que ele é: briefing, requisitos com prioridade, normas, similares,
// meta de custo e prazo, matriz de escolha entre conceitos e o conceito escolhido. As regras (o que falta para valer como feito, limites, pontuação) estão em
// DesenvolvimentoModelo.ts; aqui ficam só os campos. O que se digita fica no rascunho da tela até "Salvar" — a gravação é a de sempre (DesenvolvimentoPorta.gravarDemanda).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import Icone from './Icone';
import { Botao, Selo } from './Interface';
import { lerValorDigitado } from './LerValor';
import {
  PRIORIDADES, CRITERIOS_SUGERIDOS, NOTA_MAXIMA, ranking, faltaNoEntregavel, dadosDoEntregavel, entregaveisDaEtapa, solicitanteDaDemanda,
} from './DesenvolvimentoModelo';
import { mdiPlus, mdiClose, mdiContentSaveOutline } from '@mdi/js';

const novoId = () => Math.random().toString(36).slice(2, 8);
const brl = (v: any) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

// ── Lista de linhas (requisitos, normas, similares) ───────────────────────────────────────────────────────────
function EditorLista({ id, inicial, onSalvar, onCancelar, ocupado }: any) {
  const [itens, setItens] = useState<any[]>((inicial?.itens || []).map((i: any) => ({ ...i })));
  const [nenhum, setNenhum] = useState(!!inicial?.nenhum);
  const rotulo = { requisitos: 'Requisito', normas: 'Norma ou exigência', similares: 'Produto similar' }[id];
  const placeholder = { requisitos: 'Ex: resistir a chuva e poeira', normas: 'Ex: Resolução CONTRAN (número) — o que exige', similares: 'Ex: barra do fabricante X, modelo Y' }[id];
  const mudar = (n: number, campo: string, valor: any) => setItens(l => l.map((x, i) => (i === n ? { ...x, [campo]: valor } : x)));
  return (
    <div className="acn-dev-form">
      {itens.map((it, n) => (
        <div key={it.id} className="acn-dev-form-linha">
          <input className="acn-input" aria-label={`${rotulo} ${n + 1}`} placeholder={placeholder} value={it.texto} onChange={e => mudar(n, 'texto', e.target.value)} />
          {id === 'requisitos' && (
            <select className="acn-input acn-dev-form-prio" aria-label={`Prioridade do requisito ${n + 1}`} value={it.prioridade} onChange={e => mudar(n, 'prioridade', e.target.value)}>
              {Object.entries(PRIORIDADES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          )}
          {id === 'similares' && <input className="acn-input acn-dev-form-link" aria-label={`Link do similar ${n + 1}`} placeholder="Link (opcional)" value={it.link || ''} onChange={e => mudar(n, 'link', e.target.value)} />}
          <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar ${rotulo.toLowerCase()} ${n + 1}`} title="Tirar" onClick={() => setItens(l => l.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
        </div>
      ))}
      <div><Botao pequeno icone={mdiPlus} onClick={() => setItens(l => [...l, { id: novoId(), texto: '', prioridade: 'obrigatorio', link: '' }])}>Adicionar {rotulo.toLowerCase()}</Botao></div>
      {(id === 'normas' || id === 'similares') && (
        <label className="acn-dev-form-nenhum"><input type="checkbox" checked={nenhum} onChange={e => setNenhum(e.target.checked)} /> {id === 'normas' ? 'Nenhuma norma se aplica a este produto' : 'Não achei produto similar'}</label>
      )}
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar({ itens, nenhum })} onCancelar={onCancelar} />
    </div>
  );
}

function Rodape({ ocupado, onSalvar, onCancelar }: any) {
  return (
    <div className="acn-dev-acoes">
      <Botao variante="primario" pequeno icone={mdiContentSaveOutline} disabled={ocupado} onClick={onSalvar}>Salvar formulário</Botao>
      <Botao pequeno onClick={onCancelar}>Cancelar</Botao>
    </div>
  );
}

// ── Briefing ──────────────────────────────────────────────────────────────────────────────────────────────────────
function EditorBriefing({ demanda, inicial, onSalvar, onCancelar, ocupado }: any) {
  const [x, setX] = useState({ problema: inicial?.problema || '', aplicacao: inicial?.aplicacao || (demanda.numero_opl ? `OP ${demanda.numero_opl}` : ''), pedido_por: inicial?.pedido_por || solicitanteDaDemanda(demanda).nome });
  return (
    <div className="acn-dev-form">
      <div><label className="acn-label">Problema a resolver *</label>
        <textarea className="acn-input" rows={3} aria-label="Problema a resolver" placeholder="O que precisa ser resolvido e por quê" value={x.problema} onChange={e => setX({ ...x, problema: e.target.value })} /></div>
      <div className="acn-dev-campos">
        <div className="acn-dev-campo-resp"><label className="acn-label">OP ou veículo de aplicação</label>
          <input className="acn-input" aria-label="Aplicação" value={x.aplicacao} onChange={e => setX({ ...x, aplicacao: e.target.value })} /></div>
        <div className="acn-dev-campo-resp"><label className="acn-label">Quem pediu</label>
          <input className="acn-input" aria-label="Quem pediu" value={x.pedido_por} onChange={e => setX({ ...x, pedido_por: e.target.value })} /></div>
      </div>
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar(x)} onCancelar={onCancelar} />
    </div>
  );
}

// ── Meta de custo e prazo ─────────────────────────────────────────────────────────────────────────────────────────
function EditorMeta({ inicial, onSalvar, onCancelar, ocupado }: any) {
  const [custo, setCusto] = useState(inicial?.custo_alvo ? String(inicial.custo_alvo).replace('.', ',') : '');
  const [prazo, setPrazo] = useState(inicial?.prazo || '');
  const [qtd, setQtd] = useState(inicial?.quantidade ? String(inicial.quantidade) : '');
  const salvar = () => {
    const c = lerValorDigitado(custo);
    if (c.invalido) { alert('O custo alvo não parece um valor em reais. Escreva, por exemplo, 1.250,00.'); return; }
    onSalvar({ custo_alvo: c.valor ?? null, prazo, quantidade: qtd.trim() ? Number(qtd.replace(/\D/g, '')) || null : null });
  };
  return (
    <div className="acn-dev-form">
      <div className="acn-dev-campos">
        <div className="acn-dev-campo-data"><label className="acn-label">Custo alvo por unidade (R$) *</label>
          <input className="acn-input" inputMode="decimal" aria-label="Custo alvo" placeholder="0,00" value={custo} onChange={e => setCusto(e.target.value)} /></div>
        <div className="acn-dev-campo-data"><label className="acn-label">Prazo *</label>
          <input type="date" className="acn-input" aria-label="Prazo" value={prazo} onChange={e => setPrazo(e.target.value)} /></div>
        <div className="acn-dev-campo-data"><label className="acn-label">Quantidade prevista</label>
          <input className="acn-input" inputMode="numeric" aria-label="Quantidade prevista" placeholder="opcional" value={qtd} onChange={e => setQtd(e.target.value)} /></div>
      </div>
      <div className="acn-ajuda">O custo alvo é o que o produto pode custar para fazer sentido; ele é comparado com o custo estimado (lista de materiais) e com o custo real da primeira unidade.</div>
      <Rodape ocupado={ocupado} onSalvar={salvar} onCancelar={onCancelar} />
    </div>
  );
}

// ── Matriz de escolha entre conceitos ─────────────────────────────────────────────────────────────────────────────
function EditorConceitos({ inicial, onSalvar, onCancelar, ocupado }: any) {
  const [criterios, setCriterios] = useState<any[]>((inicial?.criterios || []).map((k: any) => ({ ...k })));
  const [conceitos, setConceitos] = useState<any[]>((inicial?.conceitos || []).map((c: any) => ({ ...c, notas: { ...(c.notas || {}) } })));
  const pontos = ranking({ criterios: criterios.filter(k => k.nome.trim()), conceitos: conceitos.map(c => ({ ...c, notas: c.notas })) });
  const pontosDe = (id: string) => pontos.find(p => p.id === id);
  const melhor = pontos[0]?.pontos;
  const mudarCrit = (n: number, campo: string, v: any) => setCriterios(l => l.map((k, i) => (i === n ? { ...k, [campo]: v } : k)));
  const mudarConc = (n: number, campo: string, v: any) => setConceitos(l => l.map((c, i) => (i === n ? { ...c, [campo]: v } : c)));
  const nota = (n: number, critId: string, v: string) => setConceitos(l => l.map((c, i) => {
    if (i !== n) return c;
    const notas = { ...c.notas };
    if (v === '') delete notas[critId]; else notas[critId] = Number(v);
    return { ...c, notas };
  }));
  return (
    <div className="acn-dev-form">
      <div className="acn-dev-porta-tit">Critérios (o peso diz o quanto importa, de 1 a 5)</div>
      {criterios.map((k, n) => (
        <div key={k.id} className="acn-dev-form-linha">
          <input className="acn-input" aria-label={`Critério ${n + 1}`} placeholder="Ex: custo" value={k.nome} onChange={e => mudarCrit(n, 'nome', e.target.value)} />
          <select className="acn-input acn-dev-form-prio" aria-label={`Peso do critério ${n + 1}`} value={k.peso} onChange={e => mudarCrit(n, 'peso', Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>Peso {p}</option>)}
          </select>
          <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar critério ${n + 1}`} title="Tirar" onClick={() => { setCriterios(l => l.filter((_, i) => i !== n)); }}><Icone path={mdiClose} size={15} /></button>
        </div>
      ))}
      <div className="acn-dev-acoes">
        <Botao pequeno icone={mdiPlus} onClick={() => setCriterios(l => [...l, { id: novoId(), nome: '', peso: 3 }])}>Adicionar critério</Botao>
        {criterios.length === 0 && <Botao pequeno onClick={() => setCriterios(CRITERIOS_SUGERIDOS.map(([nome, peso]) => ({ id: novoId(), nome, peso })))}>Usar critérios sugeridos</Botao>}
      </div>

      <div className="acn-dev-porta-tit">Conceitos (nota de 0 a {NOTA_MAXIMA} em cada critério)</div>
      {conceitos.map((c, n) => {
        const p = pontosDe(c.id);
        return (
          <div key={c.id} className="acn-dev-conceito" data-conceito={c.id}>
            <div className="acn-dev-form-linha">
              <input className="acn-input" aria-label={`Nome do conceito ${n + 1}`} placeholder="Ex: chapa dobrada e soldada" value={c.nome} onChange={e => mudarConc(n, 'nome', e.target.value)} />
              {p && criterios.length > 0 && <Selo familia={p.pontos === melhor && conceitos.length > 1 ? 'ok' : 'neutro'} ponto={false}>{p.pontos} de {p.maximo} pontos</Selo>}
              <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar conceito ${n + 1}`} title="Tirar" onClick={() => setConceitos(l => l.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
            </div>
            <textarea className="acn-input" rows={2} aria-label={`Descrição do conceito ${n + 1}`} placeholder="Como seria, prós e contras" value={c.descricao || ''} onChange={e => mudarConc(n, 'descricao', e.target.value)} />
            {criterios.filter(k => k.nome.trim()).length > 0 && (
              <div className="acn-dev-notas">
                {criterios.filter(k => k.nome.trim()).map(k => (
                  <label key={k.id} className="acn-dev-nota-campo">
                    <span className="acn-ajuda">{k.nome}</span>
                    <select className="acn-input" aria-label={`Nota de ${c.nome || 'conceito ' + (n + 1)} em ${k.nome}`} value={c.notas?.[k.id] ?? ''} onChange={e => nota(n, k.id, e.target.value)}>
                      <option value="">—</option>
                      {Array.from({ length: NOTA_MAXIMA + 1 }, (_, v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div><Botao pequeno icone={mdiPlus} disabled={conceitos.length >= 8} onClick={() => setConceitos(l => [...l, { id: novoId(), nome: '', descricao: '', notas: {} }])}>Adicionar conceito</Botao></div>
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar({ criterios, conceitos })} onCancelar={onCancelar} />
    </div>
  );
}

// ── Conceito escolhido ────────────────────────────────────────────────────────────────────────────────────────────
function EditorEscolhido({ demanda, inicial, onSalvar, onCancelar, ocupado }: any) {
  const matriz = dadosDoEntregavel(demanda, 'conceitos');
  const usaMatriz = entregaveisDaEtapa('Criação', demanda.tipo_desenvolvimento).some(e => e.id === 'conceitos');
  const rk = usaMatriz ? ranking(matriz) : [];
  const [conceitoId, setConceitoId] = useState(inicial?.conceito_id || '');
  const [nome, setNome] = useState(inicial?.nome || '');
  const [just, setJust] = useState(inicial?.justificativa || '');
  const escolhido = rk.find(r => r.id === conceitoId);
  const naoEOMelhor = escolhido && rk[0] && escolhido.pontos < rk[0].pontos;
  return (
    <div className="acn-dev-form">
      {usaMatriz ? (
        <div>
          <label className="acn-label">Conceito escolhido *</label>
          <select className="acn-input" aria-label="Conceito escolhido" value={conceitoId} onChange={e => setConceitoId(e.target.value)}>
            <option value="">{rk.length ? 'Escolha o conceito…' : 'Preencha antes a matriz de conceitos'}</option>
            {rk.map(r => <option key={r.id} value={r.id}>{r.nome} — {r.pontos} de {r.maximo} pontos</option>)}
          </select>
          {naoEOMelhor && <div className="acn-ajuda atencao">Este não é o conceito de maior pontuação ({rk[0].nome}, {rk[0].pontos} pontos). Explique abaixo por que foi escolhido mesmo assim.</div>}
        </div>
      ) : (
        <div>
          <label className="acn-label">Nome do conceito escolhido *</label>
          <input className="acn-input" aria-label="Nome do conceito escolhido" placeholder="Ex: suporte em chapa dobrada" value={nome} onChange={e => setNome(e.target.value)} />
        </div>
      )}
      <div>
        <label className="acn-label">Por que esse caminho *</label>
        <textarea className="acn-input" rows={3} aria-label="Por que esse caminho" value={just} onChange={e => setJust(e.target.value)} />
      </div>
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar({ conceito_id: conceitoId || null, nome, justificativa: just })} onCancelar={onCancelar} />
    </div>
  );
}

/** O formulário do entregável (abre ao clicar em Preencher/Editar). */
export function FormularioDoEntregavel({ id, demanda, dados, onSalvar, onCancelar, ocupado }: any) {
  const comum = { onSalvar, onCancelar, ocupado, inicial: dados, demanda };
  if (id === 'briefing') return <EditorBriefing {...comum} />;
  if (id === 'requisitos' || id === 'normas' || id === 'similares') return <EditorLista id={id} {...comum} />;
  if (id === 'meta_custo') return <EditorMeta {...comum} />;
  if (id === 'conceitos') return <EditorConceitos {...comum} />;
  if (id === 'conceito_escolhido') return <EditorEscolhido {...comum} />;
  return null;
}

/** O conteúdo já preenchido, só para ler. */
export function ResumoDoEntregavel({ id, dados, demanda }: any) {
  const x = dados || {};
  if (id === 'briefing' && x.problema) return (
    <div className="acn-dev-resumo">
      <div>{x.problema}</div>
      {(x.aplicacao || x.pedido_por) && <div className="acn-ajuda">{x.aplicacao && <>Aplicação: {x.aplicacao}</>}{x.aplicacao && x.pedido_por && ' · '}{x.pedido_por && <>Pediu: {x.pedido_por}</>}</div>}
    </div>
  );
  if ((id === 'requisitos' || id === 'normas' || id === 'similares') && ((x.itens || []).length || x.nenhum)) return (
    <ul className="acn-dev-resumo acn-dev-resumo-lista">
      {(x.itens || []).map((i: any) => (
        <li key={i.id}>
          {id === 'requisitos' && <Selo familia={i.prioridade === 'obrigatorio' ? 'marca' : 'neutro'} ponto={false}>{PRIORIDADES[i.prioridade]}</Selo>} {i.texto}
          {i.link && <> — <a href={i.link} target="_blank" rel="noreferrer">link</a></>}
        </li>
      ))}
      {x.nenhum && !(x.itens || []).length && <li className="acn-ajuda">{id === 'normas' ? 'Nenhuma norma se aplica.' : 'Nenhum similar encontrado.'}</li>}
    </ul>
  );
  if (id === 'meta_custo' && (x.custo_alvo || x.prazo)) return (
    <div className="acn-dev-resumo">
      {x.custo_alvo ? <>Custo alvo: <strong>{brl(x.custo_alvo)}</strong> por unidade</> : 'Sem custo alvo'} · Prazo: <strong>{dataBR(x.prazo)}</strong>{x.quantidade ? <> · Quantidade: {x.quantidade}</> : null}
    </div>
  );
  if (id === 'conceitos' && (x.conceitos || []).length) {
    const rk = ranking(x);
    return (
      <ol className="acn-dev-resumo acn-dev-resumo-lista">
        {rk.map((r, i) => <li key={r.id}><strong>{r.nome}</strong> — {r.pontos} de {r.maximo} pontos {i === 0 && rk.length > 1 && <Selo familia="ok" ponto={false}>Maior pontuação</Selo>}</li>)}
      </ol>
    );
  }
  if (id === 'conceito_escolhido' && (x.conceito_id || x.nome)) {
    const nome = x.conceito_id ? (dadosDoEntregavel(demanda, 'conceitos')?.conceitos || []).find((c: any) => c.id === x.conceito_id)?.nome : x.nome;
    return (
      <div className="acn-dev-resumo">
        {nome ? <>Escolhido: <strong>{nome}</strong></> : <span className="acn-ajuda atencao">O conceito escolhido não está mais na matriz: escolha de novo.</span>}
        {x.justificativa && <div className="acn-ajuda">{x.justificativa}</div>}
      </div>
    );
  }
  return null;
}

/** Resumo do que a Concepção e a Criação definiram, para consulta nas etapas seguintes. */
export function ResumoDoProjeto({ demanda }: any) {
  const ids = ['briefing', 'meta_custo', 'requisitos', 'normas', 'conceito_escolhido'];
  const rotulos: Record<string, string> = { briefing: 'Briefing', meta_custo: 'Meta de custo e prazo', requisitos: 'Requisitos', normas: 'Normas aplicáveis', conceito_escolhido: 'Conceito escolhido' };
  const com = ids.filter(id => dadosDoEntregavel(demanda, id) && faltaNoEntregavel(id, dadosDoEntregavel(demanda, id), demanda).length === 0);
  if (!com.length) return null;
  return (
    <details className="acn-dev-historico acn-dev-resumo-projeto">
      <summary>Resumo do projeto (o que a Concepção e a Criação definiram)</summary>
      {com.map(id => (
        <div key={id} className="acn-dev-resumo-bloco">
          <div className="acn-pdp-rotulo">{rotulos[id]}</div>
          <ResumoDoEntregavel id={id} dados={dadosDoEntregavel(demanda, id)} demanda={demanda} />
        </div>
      ))}
    </details>
  );
}
