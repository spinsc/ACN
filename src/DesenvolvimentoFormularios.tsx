// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — formulários da Concepção e da Criação (D2 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// Cada entregável destas duas etapas deixa de ser só "feito + anexo + nota" e ganha o formulário do que ele é: briefing, requisitos com prioridade, normas, similares,
// meta de custo e prazo, matriz de escolha entre conceitos e o conceito escolhido. As regras (o que falta para valer como feito, limites, pontuação) estão em
// DesenvolvimentoModelo.ts; aqui ficam só os campos. O que se digita fica no rascunho da tela até "Salvar" — a gravação é a de sempre (DesenvolvimentoPorta.gravarDemanda).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import Icone from './Icone';
import { Botao, Selo, Faixa, hojeISO } from './Interface';
import { ColaboradorSelect } from './ColaboradorSelect';
import { lerValorDigitado } from './LerValor';
import {
  PRIORIDADES, CRITERIOS_SUGERIDOS, NOTA_MAXIMA, ranking, faltaNoEntregavel, dadosDoEntregavel, entregaveisDaEtapa, solicitanteDaDemanda,
  letraDaRevisao, revisaoVigente, custoEstimado, nivelDoRisco, AREAS_REVISAO, CONCLUSOES_REVISAO,
} from './DesenvolvimentoModelo';
import { mdiPlus, mdiClose, mdiContentSaveOutline, mdiPaperclip } from '@mdi/js';

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

// ── D3: desenhos com revisão (só se acrescenta) ─────────────────────────────────────────────────────────────────
function EditorDesenhos({ inicial, onSalvar, onCancelar, ocupado, enviar }: any) {
  const revisoes = inicial?.revisoes || [];
  const [descricao, setDescricao] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const proxima = letraDaRevisao(revisoes.length);
  const registrar = async () => {
    if (enviando) return;
    if (!descricao.trim()) { alert('Escreva o que mudou nesta revisão.'); return; }
    if (!arquivos.length) { alert('Anexe ao menos um arquivo do desenho desta revisão.'); return; }
    setEnviando(true);
    try {
      const { enviados, falhas } = await enviar(arquivos);
      // revisão com arquivo faltando seria uma revisão incompleta guardada para sempre: só registra se TODOS subiram
      if (falhas.length) { alert('Não foi possível anexar estes arquivos, e a revisão não foi registrada:\n\n' + falhas.join('\n')); return; }
      await onSalvar({ revisoes: [...revisoes, { id: novoId(), descricao, anexos: enviados.map((a: any) => ({ nome: a.nome, url: a.url })) }] });
    } finally { setEnviando(false); }
  };
  return (
    <div className="acn-dev-form">
      <div className="acn-ajuda">As revisões só se acrescentam: o que já foi registrado não se reescreve. Mudou o desenho, registre a próxima revisão.</div>
      {[...revisoes].reverse().map((r: any) => <LinhaDeRevisao key={r.id} r={r} />)}
      <div className="acn-dev-porta-tit">Nova revisão (Rev {proxima})</div>
      <textarea className="acn-input" rows={2} aria-label="O que mudou nesta revisão" placeholder={revisoes.length ? 'O que mudou em relação à revisão anterior' : 'Primeira versão do desenho'} value={descricao} onChange={e => setDescricao(e.target.value)} />
      <div className="acn-dev-acoes">
        <input ref={ref} type="file" multiple hidden onChange={e => { setArquivos(Array.from(e.target.files || [])); }} />
        <Botao pequeno icone={mdiPaperclip} onClick={() => ref.current?.click()}>{arquivos.length ? `${arquivos.length} arquivo(s) escolhido(s)` : 'Escolher arquivos do desenho'}</Botao>
        {arquivos.length > 0 && <span className="acn-ajuda">{arquivos.map(a => a.name).join(', ')}</span>}
      </div>
      <div className="acn-dev-acoes">
        <Botao variante="primario" pequeno icone={mdiContentSaveOutline} disabled={ocupado || enviando} onClick={registrar}>{enviando ? 'Enviando…' : `Registrar Rev ${proxima}`}</Botao>
        <Botao pequeno onClick={onCancelar}>Fechar</Botao>
      </div>
    </div>
  );
}
function LinhaDeRevisao({ r }: any) {
  return (
    <div className="acn-dev-revisao" data-revisao={r.rev}>
      <Selo familia="marca" ponto={false}>Rev {r.rev}</Selo>
      <div className="acn-dev-revisao-corpo">
        <div>{r.descricao}</div>
        <div className="acn-ajuda">{r.por} em {r.em ? new Date(r.em).toLocaleString('pt-BR') : '—'}</div>
        <div className="acn-dev-anexos-lista">
          {(r.anexos || []).map((a: any, i: number) => a.url
            ? <a key={i} href={a.url} target="_blank" rel="noreferrer" className="acn-dev-anexo"><Icone path={mdiPaperclip} size={13} /> {a.nome}</a>
            : <span key={i} className="acn-dev-anexo sem-link"><Icone path={mdiPaperclip} size={13} /> {a.nome}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── D3: lista de materiais preliminar e custo estimado ──────────────────────────────────────────────────────
const comoTexto = (n: any) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
function EditorBom({ demanda, inicial, onSalvar, onCancelar, ocupado }: any) {
  const [linhas, setLinhas] = useState<any[]>((inicial?.linhas || []).map((l: any) => ({ id: l.id, item: l.item, unidade: l.unidade || '', quantidade: comoTexto(l.quantidade), custo_unit: comoTexto(l.custo_unit) })));
  const [just, setJust] = useState(inicial?.justificativa || '');
  const meta = Number(dadosDoEntregavel(demanda, 'meta_custo')?.custo_alvo) || 0;
  const lido = (v: string) => { const r = lerValorDigitado(v); return r.valor ?? null; };
  const total = custoEstimado({ linhas: linhas.map(l => ({ quantidade: lido(l.quantidade), custo_unit: lido(l.custo_unit) })) });
  const acima = meta > 0 && total > meta;
  const mudar = (n: number, campo: string, v: string) => setLinhas(l => l.map((x, i) => (i === n ? { ...x, [campo]: v } : x)));
  const salvar = () => {
    const convertidas: any[] = [];
    for (const [n, l] of linhas.entries()) {
      if (!l.item.trim()) continue;
      const q = lerValorDigitado(l.quantidade), c = lerValorDigitado(l.custo_unit);
      if (q.invalido || c.invalido) { alert(`Na linha ${n + 1} ("${l.item}") a quantidade ou o custo não parecem números. Escreva, por exemplo, 2,5 ou 1.250,00.`); return; }
      convertidas.push({ id: l.id, item: l.item, unidade: l.unidade, quantidade: q.valor ?? null, custo_unit: c.valor ?? null });
    }
    onSalvar({ linhas: convertidas, justificativa: just });
  };
  return (
    <div className="acn-dev-form">
      <div className="acn-ajuda">Custo de UMA unidade do produto: o que leva de material e o custo de cada um.</div>
      {linhas.map((l, n) => (
        <div key={l.id} className="acn-dev-form-linha acn-dev-bom-linha">
          <input className="acn-input" aria-label={`Material ${n + 1}`} placeholder="Material ou componente" value={l.item} onChange={e => mudar(n, 'item', e.target.value)} />
          <input className="acn-input acn-dev-bom-num" aria-label={`Quantidade do material ${n + 1}`} inputMode="decimal" placeholder="Qtd" value={l.quantidade} onChange={e => mudar(n, 'quantidade', e.target.value)} />
          <input className="acn-input acn-dev-bom-un" aria-label={`Unidade do material ${n + 1}`} placeholder="un" value={l.unidade} onChange={e => mudar(n, 'unidade', e.target.value)} />
          <input className="acn-input acn-dev-bom-num" aria-label={`Custo unitário do material ${n + 1}`} inputMode="decimal" placeholder="R$ un." value={l.custo_unit} onChange={e => mudar(n, 'custo_unit', e.target.value)} />
          <span className="acn-ajuda acn-dev-bom-sub">{brl((lido(l.quantidade) || 0) * (lido(l.custo_unit) || 0))}</span>
          <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar material ${n + 1}`} title="Tirar" onClick={() => setLinhas(ls => ls.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
        </div>
      ))}
      <div><Botao pequeno icone={mdiPlus} onClick={() => setLinhas(ls => [...ls, { id: novoId(), item: '', unidade: '', quantidade: '', custo_unit: '' }])}>Adicionar material</Botao></div>
      <div className="acn-dev-bom-total">Custo estimado: <strong>{brl(total)}</strong> por unidade</div>
      {meta > 0 && total > 0 && (
        <Faixa tom={acima ? 'atencao' : 'ok'}>
          Meta de custo: {brl(meta)}. O estimado está {Math.abs(Math.round(((total - meta) / meta) * 1000) / 10).toLocaleString('pt-BR')}% {acima ? 'ACIMA' : 'abaixo'} da meta ({brl(Math.abs(total - meta))}).
        </Faixa>
      )}
      {acima && (
        <div><label className="acn-label">Por que o custo ficou acima da meta *</label>
          <textarea className="acn-input" rows={2} aria-label="Justificativa do custo acima da meta" value={just} onChange={e => setJust(e.target.value)} /></div>
      )}
      {!meta && <div className="acn-ajuda">Esta demanda não tem meta de custo na Concepção; o estimado não é comparado com nada.</div>}
      <Rodape ocupado={ocupado} onSalvar={salvar} onCancelar={onCancelar} />
    </div>
  );
}

// ── D3: riscos ──────────────────────────────────────────────────────────────────────────────────────────────────
const FAMILIA_RISCO: Record<string, string> = { alto: 'erro', medio: 'atencao', baixo: 'ok' };
const ROTULO_RISCO: Record<string, string> = { alto: 'Risco alto', medio: 'Risco médio', baixo: 'Risco baixo' };
function EditorRiscos({ inicial, onSalvar, onCancelar, ocupado }: any) {
  const [itens, setItens] = useState<any[]>((inicial?.itens || []).map((i: any) => ({ ...i })));
  const [nenhum, setNenhum] = useState(!!inicial?.nenhum);
  const mudar = (n: number, campo: string, v: any) => setItens(l => l.map((x, i) => (i === n ? { ...x, [campo]: v } : x)));
  return (
    <div className="acn-dev-form">
      <div className="acn-ajuda">Gravidade (o estrago se acontecer) × probabilidade (a chance de acontecer), de 1 a 5. Risco médio ou alto precisa de uma ação.</div>
      {itens.map((r, n) => {
        const { pontos, nivel } = nivelDoRisco(r.gravidade, r.probabilidade);
        return (
          <div key={r.id} className="acn-dev-conceito" data-risco={r.id}>
            <div className="acn-dev-form-linha">
              <input className="acn-input" aria-label={`Risco ${n + 1}`} placeholder="O que pode dar errado" value={r.descricao} onChange={e => mudar(n, 'descricao', e.target.value)} />
              <Selo familia={FAMILIA_RISCO[nivel]} ponto={false}>{ROTULO_RISCO[nivel]} ({pontos})</Selo>
              <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar risco ${n + 1}`} title="Tirar" onClick={() => setItens(l => l.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
            </div>
            <div className="acn-dev-notas">
              <label className="acn-dev-nota-campo"><span className="acn-ajuda">Gravidade</span>
                <select className="acn-input" aria-label={`Gravidade do risco ${n + 1}`} value={r.gravidade} onChange={e => mudar(n, 'gravidade', Number(e.target.value))}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="acn-dev-nota-campo"><span className="acn-ajuda">Probabilidade</span>
                <select className="acn-input" aria-label={`Probabilidade do risco ${n + 1}`} value={r.probabilidade} onChange={e => mudar(n, 'probabilidade', Number(e.target.value))}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
            </div>
            <input className="acn-input" aria-label={`Ação para o risco ${n + 1}`} placeholder={nivel === 'baixo' ? 'Ação (opcional)' : 'O que fazer a respeito *'} value={r.acao || ''} onChange={e => mudar(n, 'acao', e.target.value)} />
            <input className="acn-input" aria-label={`Responsável pelo risco ${n + 1}`} placeholder="Responsável (opcional)" value={r.responsavel || ''} onChange={e => mudar(n, 'responsavel', e.target.value)} />
          </div>
        );
      })}
      <div><Botao pequeno icone={mdiPlus} onClick={() => setItens(l => [...l, { id: novoId(), descricao: '', gravidade: 3, probabilidade: 3, acao: '', responsavel: '' }])}>Adicionar risco</Botao></div>
      <label className="acn-dev-form-nenhum"><input type="checkbox" checked={nenhum} onChange={e => setNenhum(e.target.checked)} /> Não vi risco relevante neste projeto</label>
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar({ itens, nenhum })} onCancelar={onCancelar} />
    </div>
  );
}

// ── D3: revisão de projeto ──────────────────────────────────────────────────────────────────────────────────────
function EditorRevisao({ demanda, inicial, onSalvar, onCancelar, ocupado }: any) {
  const [data, setData] = useState(inicial?.data || hojeISO());
  const [participantes, setParticipantes] = useState<any[]>((inicial?.participantes || []).map((p: any) => ({ ...p })));
  const [pontos, setPontos] = useState<any[]>((inicial?.pontos || []).map((p: any) => ({ ...p })));
  const [conclusao, setConclusao] = useState(inicial?.conclusao || '');
  const [ata, setAta] = useState(inicial?.ata || '');
  const vigente = revisaoVigente(demanda);
  const obrigatorias = demanda.tipo_desenvolvimento === 'produto_novo' ? ['Produção', 'Compras', 'Qualidade'] : [];
  return (
    <div className="acn-dev-form">
      <div className="acn-ajuda">
        {vigente ? <>Esta revisão vale para o desenho na <strong>Rev {vigente.rev}</strong>. Se o desenho mudar depois, será preciso repetir.</> : 'Registre antes uma revisão do desenho.'}
        {obrigatorias.length > 0 && <> Para produto novo precisa ter alguém de {obrigatorias.join(', ')}.</>}
      </div>
      <div className="acn-dev-campos">
        <div className="acn-dev-campo-data"><label className="acn-label">Data da revisão *</label>
          <input type="date" className="acn-input" aria-label="Data da revisão" value={data} onChange={e => setData(e.target.value)} /></div>
        <div className="acn-dev-campo-data"><label className="acn-label">Conclusão *</label>
          <select className="acn-input" aria-label="Conclusão da revisão" value={conclusao} onChange={e => setConclusao(e.target.value)}>
            <option value="">Escolha…</option>
            {Object.entries(CONCLUSOES_REVISAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select></div>
      </div>
      <div className="acn-dev-porta-tit">Participantes</div>
      {participantes.map((p, n) => (
        <div key={p.id} className="acn-dev-form-linha">
          <div className="acn-dev-campo-resp"><ColaboradorSelect value={p.nome} onChange={v => setParticipantes(l => l.map((x, i) => (i === n ? { ...x, nome: v } : x)))} placeholder="Quem participou" /></div>
          <select className="acn-input acn-dev-form-prio" aria-label={`Área do participante ${n + 1}`} value={p.area} onChange={e => setParticipantes(l => l.map((x, i) => (i === n ? { ...x, area: e.target.value } : x)))}>
            {AREAS_REVISAO.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar participante ${n + 1}`} title="Tirar" onClick={() => setParticipantes(l => l.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
        </div>
      ))}
      <div><Botao pequeno icone={mdiPlus} onClick={() => setParticipantes(l => [...l, { id: novoId(), nome: '', area: obrigatorias.find(a => !l.some(x => x.area === a)) || 'Engenharia' }])}>Adicionar participante</Botao></div>
      <div className="acn-dev-porta-tit">Pontos levantados (o que precisa ajustar)</div>
      {pontos.map((p, n) => (
        <div key={p.id} className="acn-dev-form-linha">
          <input className="acn-input" aria-label={`Ponto ${n + 1}`} placeholder="Ex: trocar o parafuso por um de aço inox" value={p.texto} onChange={e => setPontos(l => l.map((x, i) => (i === n ? { ...x, texto: e.target.value } : x)))} />
          <label className="acn-dev-form-nenhum"><input type="checkbox" aria-label={`Ponto ${n + 1} resolvido`} checked={!!p.resolvido} onChange={e => setPontos(l => l.map((x, i) => (i === n ? { ...x, resolvido: e.target.checked } : x)))} /> Resolvido</label>
          <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar ponto ${n + 1}`} title="Tirar" onClick={() => setPontos(l => l.filter((_, i) => i !== n))}><Icone path={mdiClose} size={15} /></button>
        </div>
      ))}
      <div><Botao pequeno icone={mdiPlus} onClick={() => setPontos(l => [...l, { id: novoId(), texto: '', resolvido: false }])}>Adicionar ponto</Botao></div>
      <div><label className="acn-label">Ata (resumo do que foi decidido)</label>
        <textarea className="acn-input" rows={3} aria-label="Ata da revisão" value={ata} onChange={e => setAta(e.target.value)} /></div>
      <Rodape ocupado={ocupado} onSalvar={() => onSalvar({ data, participantes, pontos, conclusao, ata })} onCancelar={onCancelar} />
    </div>
  );
}

/** O formulário do entregável (abre ao clicar em Preencher/Editar). */
export function FormularioDoEntregavel({ id, demanda, dados, onSalvar, onCancelar, ocupado, enviar }: any) {
  const comum = { onSalvar, onCancelar, ocupado, inicial: dados, demanda, enviar };
  if (id === 'desenhos') return <EditorDesenhos {...comum} />;
  if (id === 'bom_prelim') return <EditorBom {...comum} />;
  if (id === 'riscos') return <EditorRiscos {...comum} />;
  if (id === 'revisao_projeto') return <EditorRevisao {...comum} />;
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
  if (id === 'desenhos' && (x.revisoes || []).length) return (
    <div className="acn-dev-resumo">
      {[...x.revisoes].reverse().map((r: any) => <LinhaDeRevisao key={r.id} r={r} />)}
    </div>
  );
  if (id === 'bom_prelim' && (x.linhas || []).length) {
    const total = custoEstimado(x);
    const meta = Number(dadosDoEntregavel(demanda, 'meta_custo')?.custo_alvo) || 0;
    const pct = meta ? Math.round(((total - meta) / meta) * 1000) / 10 : null;
    return (
      <div className="acn-dev-resumo">
        <ul className="acn-dev-resumo-lista">
          {x.linhas.map((l: any) => <li key={l.id}>{l.item} — {l.quantidade ?? '?'} {l.unidade} × {l.custo_unit === null ? '?' : brl(l.custo_unit)}</li>)}
        </ul>
        <div>Custo estimado: <strong>{brl(total)}</strong> por unidade
          {pct !== null && <> <Selo familia={pct > 0 ? 'atencao' : 'ok'} ponto={false}>{pct > 0 ? `${pct.toLocaleString('pt-BR')}% acima da meta` : `${Math.abs(pct).toLocaleString('pt-BR')}% abaixo da meta`} ({brl(meta)})</Selo></>}
        </div>
        {x.justificativa && <div className="acn-ajuda">Justificativa: {x.justificativa}</div>}
      </div>
    );
  }
  if (id === 'riscos' && ((x.itens || []).length || x.nenhum)) return (
    <ul className="acn-dev-resumo acn-dev-resumo-lista">
      {(x.itens || []).map((r: any) => {
        const { pontos, nivel } = nivelDoRisco(r.gravidade, r.probabilidade);
        return <li key={r.id}><Selo familia={FAMILIA_RISCO[nivel]} ponto={false}>{ROTULO_RISCO[nivel]} ({pontos})</Selo> {r.descricao}{r.acao && <span className="acn-ajuda"> — ação: {r.acao}{r.responsavel ? ` (${r.responsavel})` : ''}</span>}</li>;
      })}
      {x.nenhum && !(x.itens || []).length && <li className="acn-ajuda">Nenhum risco relevante identificado.</li>}
    </ul>
  );
  if (id === 'revisao_projeto' && (x.data || x.conclusao)) {
    const vigente = revisaoVigente(demanda)?.rev;
    const velha = vigente && x.revisao_analisada && vigente !== x.revisao_analisada;
    return (
      <div className="acn-dev-resumo">
        <div>Revisão de {dataBR(x.data)}: <strong>{CONCLUSOES_REVISAO[x.conclusao] || 'sem conclusão'}</strong>{x.revisao_analisada && <> · desenho na Rev {x.revisao_analisada}</>}</div>
        {(x.participantes || []).length > 0 && <div className="acn-ajuda">Participantes: {x.participantes.map((p: any) => `${p.nome} (${p.area})`).join(', ')}</div>}
        {(x.pontos || []).length > 0 && <ul className="acn-dev-resumo-lista">{x.pontos.map((p: any) => <li key={p.id}>{p.texto} <Selo familia={p.resolvido ? 'ok' : 'atencao'} ponto={false}>{p.resolvido ? 'Resolvido' : 'Em aberto'}</Selo></li>)}</ul>}
        {x.ata && <div className="acn-ajuda">{x.ata}</div>}
        {velha && <div className="acn-ajuda atencao">O desenho mudou depois desta revisão (agora está na Rev {vigente}): repita a revisão de projeto.</div>}
      </div>
    );
  }
  return null;
}

/** Resumo do que a Concepção e a Criação definiram, para consulta nas etapas seguintes. */
export function ResumoDoProjeto({ demanda }: any) {
  const ids = ['briefing', 'meta_custo', 'requisitos', 'normas', 'conceito_escolhido', 'desenhos', 'bom_prelim', 'riscos', 'revisao_projeto'];
  const rotulos: Record<string, string> = { briefing: 'Briefing', meta_custo: 'Meta de custo e prazo', requisitos: 'Requisitos', normas: 'Normas aplicáveis', conceito_escolhido: 'Conceito escolhido', desenhos: 'Desenhos (revisões)', bom_prelim: 'Lista de materiais e custo estimado', riscos: 'Riscos', revisao_projeto: 'Revisão de projeto' };
  const com = ids.filter(id => dadosDoEntregavel(demanda, id) && faltaNoEntregavel(id, dadosDoEntregavel(demanda, id), demanda).length === 0);
  if (!com.length) return null;
  return (
    <details className="acn-dev-historico acn-dev-resumo-projeto">
      <summary>Resumo do projeto (o que as etapas já definiram)</summary>
      {com.map(id => (
        <div key={id} className="acn-dev-resumo-bloco">
          <div className="acn-pdp-rotulo">{rotulos[id]}</div>
          <ResumoDoEntregavel id={id} dados={dadosDoEntregavel(demanda, id)} demanda={demanda} />
        </div>
      ))}
    </details>
  );
}
