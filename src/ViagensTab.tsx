// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a tela (pedido do usuário em 22/10/2026)
//
// Módulo para montar o roteiro de uma viagem (várias cidades e endereços), calcular km de ida e volta, tempo de viagem, a melhor ordem das paradas, hospedagem quando precisa,
// pedágios e km rodado, e fechar o ORÇAMENTO e o CUSTO. A conta está em ViagemCalculo.ts e o mapa/rota em ViagemRota.ts; aqui só ficam a lista e o editor.
//
// Limites desta primeira versão (a confirmar com o usuário): a rota vem de serviços gratuitos de mapa (sem pedágio), então o pedágio é lançado à mão; a data da viagem e a
// ligação com OP/PV/licitação são só informativas (texto).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { lerValorDigitado } from './LerValor';
import { ehAdminOuGerente } from './utils/permissoes';
import { CabecalhoTela, Botao, Selo, Faixa, Chips } from './Interface';
import Icone from './Icone';
import { buscarEndereco, buscarVariosEnderecos, linhasDeEnderecos, calcularRota, nomeCurto, assinaturaDoRoteiro } from './ViagemRota';
import { CUSTOS_PADRAO, calcularViagem, fmtKm, fmtHoras, fmtReais, textoDoOrcamento, textoDoRoteiro, dataComDiaDaSemana } from './ViagemCalculo';
import { montarRoteiro } from './ViagemRoteiro';
import {
  mdiPlus, mdiClose, mdiArrowUp, mdiArrowDown, mdiMagnify, mdiContentSaveOutline, mdiContentCopy, mdiPrinterOutline,
  mdiTrashCanOutline, mdiMapMarkerPath, mdiMapMarker, mdiRefresh,
} from '@mdi/js';

const STATUS_VIAGEM: Record<string, [string, string]> = {
  rascunho: ['Rascunho', 'neutro'], orcada: ['Orçada', 'info'], aprovada: ['Aprovada', 'ok'], realizada: ['Realizada', 'ok'], cancelada: ['Cancelada', 'erro'],
};
const novoId = () => Math.random().toString(36).slice(2, 8);
const diaBR = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const viagemVazia = () => ({ titulo: '', status: 'rascunho', data_saida: '', pessoas: 1, vinculo: '', origem: null, paradas: [], ida_e_volta: true, otimizar_ordem: true, rota: null, custos: { ...CUSTOS_PADRAO } });

// ── peças pequenas ───────────────────────────────────────────────────────────

/** Campo de número: aceita "1.500,50" e "12,5" (LerValor.ts); texto que não é número fica marcado e NÃO muda o valor. `vazioNulo`: campo em branco vira nulo (ex.: noites automáticas). */
function CampoNumero({ rotulo, valor, onChange, sufixo, ajuda, vazioNulo = false, inteiro = false, placeholder }: any) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? '' : String(valor).replace('.', ','));
  const [ruim, setRuim] = useState(false);
  const mudar = (t: string) => {
    setTexto(t);
    const r = lerValorDigitado(t);
    if (r.vazio) { setRuim(false); onChange(vazioNulo ? null : 0); return; }
    if (r.invalido) { setRuim(true); return; }
    setRuim(false);
    onChange(inteiro ? Math.floor(r.valor) : r.valor);
  };
  return (
    <div className="acn-vg-campo">
      {rotulo && <label className="acn-label">{rotulo}</label>}
      <div className="acn-vg-campo-in">
        <input className="acn-input" inputMode="decimal" aria-label={rotulo} aria-invalid={ruim || undefined} placeholder={placeholder} value={texto} onChange={e => mudar(e.target.value)} />
        {sufixo && <span className="acn-vg-suf">{sufixo}</span>}
      </div>
      {ruim && <div className="acn-vg-erro">Não parece um número.</div>}
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
    </div>
  );
}

/**
 * Pergunta à função de servidor `viagem-rota` o km, o tempo e o pedágio da rota já ordenada (23/10/2026). A chave do provedor fica lá, como segredo. 404 = a função ainda não foi
 * publicada: vale como "desligado" (a viagem segue com o mapa gratuito e o pedágio à mão).
 */
async function pedirPedagioAoServidor(pontos: any[]) {
  const corpo = { pontos: pontos.map((p: any) => ({ lat: p.lat, lng: p.lng })) };
  const espera = new Promise((_, recusa) => setTimeout(() => recusa(new Error('o serviço de pedágio demorou demais para responder')), 30000));
  const { data, error } = (await Promise.race([supabase.functions.invoke('viagem-rota', { body: corpo }), espera])) as any;
  if (error) {
    const resposta = error.context;
    if (resposta?.status === 404) return { configurado: false };
    let texto = '';
    try { texto = (await resposta.json())?.erro || ''; } catch { /* sem corpo legível */ }
    throw new Error(texto || error.message || 'falha ao falar com o serviço de pedágio');
  }
  return data;
}

/** Procura um endereço ou cidade e deixa escolher entre os candidatos. */
function BuscaDeEndereco({ rotulo, placeholder, onEscolher }: any) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const buscar = async () => {
    if (buscando) return;
    setBuscando(true); setErro(''); setLista(null);
    try {
      const r = await buscarEndereco(q);
      if (!r.length) setErro('Nada encontrado. Tente a cidade e o estado, por exemplo "Sorocaba, SP".');
      setLista(r);
    } catch (e: any) { setErro('Não foi possível buscar: ' + (e?.message || e)); }
    finally { setBuscando(false); }
  };
  return (
    <div className="acn-vg-busca">
      <div className="acn-vg-busca-linha">
        <input className="acn-input" aria-label={rotulo} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscar(); }} />
        <Botao pequeno variante="secundario" icone={mdiMagnify} disabled={buscando || q.trim().length < 3} onClick={buscar}>{buscando ? 'Buscando…' : 'Buscar'}</Botao>
      </div>
      {erro && <div className="acn-vg-erro">{erro}</div>}
      {lista && lista.length > 0 && (
        <div className="acn-vg-cands" role="listbox" aria-label="Resultados da busca">
          {lista.map((c, i) => (
            <button key={i} type="button" role="option" className="acn-vg-cand" onClick={() => { onEscolher({ id: novoId(), texto: c.texto, lat: c.lat, lng: c.lng }); setQ(''); setLista(null); }}>
              <Icone path={mdiMapMarker} size={14} /> {c.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Cola vários endereços de uma vez (um por linha): cada linha é procurada, a pessoa confere o resultado escolhido (pode trocar entre os candidatos) e acrescenta todos às paradas.
 * As linhas que não foram achadas voltam para a caixa, para corrigir e buscar de novo sem perder as que já deram certo.
 */
function ColarEnderecos({ onAdicionar }: any) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [achados, setAchados] = useState<any[]>([]);   // { linha, candidatos, idx }
  const [falhas, setFalhas] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const cancelar = React.useRef(false);
  const linhas = linhasDeEnderecos(texto);
  const buscando = !!progresso;

  const buscar = async () => {
    if (buscando || !linhas.length) return;
    cancelar.current = false; setFalhas([]); setProgresso({ feitos: 0, total: linhas.length });
    const rs = await buscarVariosEnderecos(linhas, { aoAndar: (feitos, total) => setProgresso({ feitos, total }), cancelado: () => cancelar.current });
    const ok = rs.filter(r => !r.erro).map(r => ({ linha: r.linha, candidatos: r.candidatos, idx: 0 }));
    const ruins = rs.filter(r => r.erro);
    const naoFeitas = linhas.slice(rs.length);   // se a pessoa cancelou no meio, o que não foi procurado continua na caixa
    setAchados(a => [...a, ...ok]);
    setFalhas(ruins.map(r => `${r.linha} — ${r.erro}`));
    setTexto([...ruins.map(r => r.linha), ...naoFeitas].join('\n'));
    setProgresso(null);
  };
  const adicionar = () => {
    onAdicionar(achados.map(a => { const c = a.candidatos[a.idx]; return { id: novoId(), texto: c.texto, lat: c.lat, lng: c.lng, dias: 0 }; }));
    setAchados([]); setFalhas([]); setTexto(''); setAberto(false);
  };
  if (!aberto) return <div><Botao pequeno icone={mdiPlus} onClick={() => setAberto(true)}>Colar vários endereços</Botao></div>;
  return (
    <div className="acn-vg-colar">
      <label className="acn-label" htmlFor="vg-colar-texto">Vários endereços ou cidades, um por linha</label>
      <textarea id="vg-colar-texto" className="acn-input" rows={5} disabled={buscando} placeholder={'Campinas, SP\nRua das Flores 100, Sorocaba, SP\nRibeirão Preto, SP'} value={texto} onChange={e => setTexto(e.target.value)} />
      <div className="acn-vg-acoes">
        <Botao pequeno variante="secundario" icone={mdiMagnify} disabled={buscando || !linhas.length} onClick={buscar}>{buscando ? `Buscando ${progresso!.feitos} de ${progresso!.total}…` : `Buscar ${linhas.length || ''} endereço(s)`}</Botao>
        {buscando && <Botao pequeno onClick={() => { cancelar.current = true; }}>Parar</Botao>}
        <Botao pequeno variante="discreto" disabled={buscando} onClick={() => { setAberto(false); setTexto(''); setAchados([]); setFalhas([]); }}>Fechar</Botao>
      </div>
      {falhas.length > 0 && <Faixa tom="atencao">Não achei estas linhas (elas voltaram para a caixa acima; escreva a cidade e o estado, por exemplo "Sorocaba, SP", e busque de novo):<ul className="acn-vg-colar-falhas">{falhas.map((f, i) => <li key={i}>{f}</li>)}</ul></Faixa>}
      {achados.length > 0 && (
        <div className="acn-vg-colar-achados">
          <div className="acn-quadro-titulo">ACHADOS ({achados.length}) — confira o local escolhido</div>
          {achados.map((a, i) => (
            <div key={i} className="acn-vg-colar-it">
              <span className="acn-vg-colar-linha" title={a.linha}>{a.linha}</span>
              <select className="acn-input" aria-label={`Local escolhido para "${a.linha}"`} value={a.idx} onChange={e => setAchados(l => l.map((x, j) => (j === i ? { ...x, idx: Number(e.target.value) } : x)))}>
                {a.candidatos.map((c: any, k: number) => <option key={k} value={k}>{c.texto}</option>)}
              </select>
              <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar "${a.linha}"`} title="Tirar" onClick={() => setAchados(l => l.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="acn-ajuda">O mapa devolve o primeiro resultado como o mais provável, mas pode ser de outra cidade com o mesmo nome: confira o texto do local escolhido.</div>
          <div className="acn-vg-acoes"><Botao pequeno variante="primario" icone={mdiPlus} disabled={buscando} onClick={adicionar}>Adicionar {achados.length} parada(s)</Botao></div>
        </div>
      )}
    </div>
  );
}

/** Lista de linhas "descrição + valor" (pedágios, outros custos). */
function ListaDeLinhas({ titulo, linhas, onChange, placeholder, ajuda }: any) {
  const mudar = (id: string, campo: string, v: any) => onChange(linhas.map((l: any) => (l.id === id ? { ...l, [campo]: v } : l)));
  return (
    <div className="acn-vg-linhas">
      <div className="acn-quadro-titulo">{titulo}</div>
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
      {linhas.map((l: any) => (
        <div key={l.id} className="acn-vg-linha">
          <input className="acn-input" aria-label={`${titulo}: descrição`} placeholder={placeholder} value={l.descricao} onChange={e => mudar(l.id, 'descricao', e.target.value)} />
          <CampoNumero rotulo="" valor={l.valor} sufixo="R$" onChange={(n: number) => mudar(l.id, 'valor', n)} />
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Tirar esta linha" title="Tirar" onClick={() => onChange(linhas.filter((x: any) => x.id !== l.id))} />
        </div>
      ))}
      <div><Botao pequeno icone={mdiPlus} onClick={() => onChange([...linhas, { id: novoId(), descricao: '', valor: 0 }])}>Adicionar linha</Botao></div>
    </div>
  );
}

// ── impressão ────────────────────────────────────────────────────────────────
function abrirImpressao(v: any, r: any) {
  const esc = (t: any) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const texto = esc(textoDoOrcamento(v, r)).replace(/\n/g, '<br>');
  const roteiroTexto = esc(textoDoRoteiro(v, montarRoteiro(v))).replace(/\n/g, '<br>').replace(/ {2}/g, '&nbsp;&nbsp;');
  const comPedagio = (v.rota?.pernas || []).some((p: any) => p.pedagio !== undefined);
  const pernas = (v.rota?.pernas || []).map((p: any) => `<tr><td>${esc(nomeCurto(p.de))}</td><td>${esc(nomeCurto(p.para))}</td><td style="text-align:right">${fmtKm(p.km)}</td><td style="text-align:right">${fmtHoras(p.horas)}</td>${comPedagio ? `<td style="text-align:right">${p.pedagio === null || p.pedagio === undefined ? '—' : fmtReais(p.pedagio)}</td>` : ''}</tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento de viagem</title>
    <style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:24px}h2{margin:0 0 12px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f1f5f9}</style></head>
    <body><h2>Orçamento de viagem</h2><div>${texto}</div>${roteiroTexto ? `<h3>Roteiro dia a dia</h3><div>${roteiroTexto}</div>` : ''}${pernas ? `<h3>Trechos</h3><table><thead><tr><th>De</th><th>Para</th><th>Distância</th><th>Tempo</th>${comPedagio ? '<th>Pedágio</th>' : ''}</tr></thead><tbody>${pernas}</tbody></table>` : ''}
    <script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=820,height=700');
  if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.'); return; }
  w.document.write(html); w.document.close();
}

// ── o editor ─────────────────────────────────────────────────────────────────
function EditorDeViagem({ inicial, currentUser, aoFechar, aoSalvar }: any) {
  const [v, setV] = useState(() => ({ ...viagemVazia(), ...inicial, custos: { ...CUSTOS_PADRAO, ...(inicial?.custos || {}) }, paradas: inicial?.paradas || [], data_saida: inicial?.data_saida || '', vinculo: inicial?.vinculo || '' }));
  const [salvando, setSalvando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erroRota, setErroRota] = useState('');
  const set = (campo: string, valor: any) => setV((x: any) => ({ ...x, [campo]: valor }));
  const setCusto = (campo: string, valor: any) => setV((x: any) => ({ ...x, custos: { ...x.custos, [campo]: valor } }));
  const r = useMemo(() => calcularViagem(v), [v]);
  const roteiro = useMemo(() => montarRoteiro(v), [v]);
  const pedagioDaRota = v.rota?.pedagio;
  const temPedagioPorTrecho = !!v.rota && (v.rota.pernas || []).some((p: any) => p.pedagio !== undefined);
  const assinaturaAtual = assinaturaDoRoteiro(v.origem, v.paradas, v.ida_e_volta, v.otimizar_ordem);
  const rotaVelha = !!v.rota && v.rota.assinatura !== assinaturaAtual;
  const podeApagar = !!v.id && (ehAdminOuGerente(currentUser) || String(v.criado_por_nome || '') === String(currentUser?.nome || currentUser?.email || ''));

  const mover = (i: number, d: number) => setV((x: any) => {
    const l = [...x.paradas]; const j = i + d;
    if (j < 0 || j >= l.length) return x;
    [l[i], l[j]] = [l[j], l[i]];
    return { ...x, paradas: l };
  });
  const mudarParada = (id: string, campo: string, valor: any) => set('paradas', v.paradas.map((p: any) => (p.id === id ? { ...p, [campo]: valor } : p)));

  const calcular = async () => {
    setErroRota(''); setCalculando(true);
    try {
      const rota = await calcularRota({ origem: v.origem, paradas: v.paradas, idaEVolta: v.ida_e_volta, otimizar: v.otimizar_ordem, buscarPedagio: pedirPedagioAoServidor });
      setV((x: any) => {
        let paradas = x.paradas;
        if (rota.otimizada) { const porId = new Map(x.paradas.map((p: any) => [p.id, p])); paradas = rota.ordem.map((id: string) => porId.get(id)).filter(Boolean); }
        return { ...x, paradas, rota: { ...rota, assinatura: assinaturaDoRoteiro(x.origem, paradas, x.ida_e_volta, x.otimizar_ordem) } };
      });
    } catch (e: any) { setErroRota('Não foi possível calcular a rota: ' + (e?.message || e)); }
    finally { setCalculando(false); }
  };

  const salvar = async () => {
    if (salvando) return;
    if (!String(v.titulo || '').trim()) { alert('Dê um título à viagem.'); return; }
    if (rotaVelha && !await confirmar('O roteiro mudou depois do último cálculo: o km, o tempo e os custos gravados são os da rota ANTIGA.\n\nSalvar mesmo assim? (Para atualizar, cancele e use "Calcular rota".)')) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    const por = currentUser?.nome || currentUser?.email || null;
    const linha = {
      titulo: String(v.titulo).trim(), status: v.status, data_saida: v.data_saida || null, pessoas: Math.max(1, Math.floor(Number(v.pessoas) || 1)),
      vinculo: String(v.vinculo || '').trim() || null, origem: v.origem, paradas: v.paradas, ida_e_volta: !!v.ida_e_volta, otimizar_ordem: !!v.otimizar_ordem,
      rota: v.rota, custos: v.custos, km_total: r.temRota ? r.km : null, horas_viagem: r.temRota ? r.horasDirecao : null, total_custo: r.custoTotal, total_orcamento: r.orcamento,
    };
    const { data, error } = v.id
      ? await supabase.from('viagens').update({ ...linha, atualizado_em: agora, atualizado_por_nome: por }).eq('id', v.id).select('id').maybeSingle()
      : await supabase.from('viagens').insert([{ ...linha, criado_por_nome: por, atualizado_por_nome: por }]).select('id').single();
    setSalvando(false);
    if (error || !data) { alert('Não foi possível salvar a viagem: ' + (error?.message || 'o banco não confirmou a gravação')); return; }
    logChange({ module: 'viagens', entityType: 'viagens', entityId: data.id, changeType: v.id ? 'UPDATE' : 'INSERT', oldRow: v.id ? inicial : null, newRow: { ...linha }, user: currentUser });
    aoSalvar();
  };

  const apagar = async () => {
    if (!await confirmar(`Apagar a viagem "${v.titulo}"?\n\nIsso não pode ser desfeito.`)) return;
    const { error } = await supabase.from('viagens').delete().eq('id', v.id);
    if (error) { alert('Não foi possível apagar a viagem: ' + error.message); return; }
    logChange({ module: 'viagens', entityType: 'viagens', entityId: v.id, changeType: 'DELETE', oldRow: inicial, newRow: null, user: currentUser });
    aoSalvar();
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoDoOrcamento(v, r)); alert('Orçamento copiado. É só colar na mensagem ou no e-mail.'); }
    catch { alert('Não foi possível copiar automaticamente. Use "Imprimir" ou selecione o texto na tela.'); }
  };

  const copiarRoteiro = async () => {
    try { await navigator.clipboard.writeText(textoDoRoteiro(v, roteiro)); alert('Roteiro copiado. É só colar na mensagem ou no e-mail.'); }
    catch { alert('Não foi possível copiar automaticamente. Use "Imprimir" ou selecione o texto na tela.'); }
  };

  const c = v.custos;
  return createPortal(
    <div className="modal-overlay acn-vg-ov">
      <div className="modal-box acn-modal-cadastro acn-vg-jan" role="dialog" aria-label="Viagem">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiMapMarkerPath} size={18} />{v.id ? 'Viagem' : 'Nova viagem'}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={aoFechar} />
        </div>
        <div className="acn-modal-corpo acn-vg-corpo">

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">DADOS DA VIAGEM</div>
            <div className="acn-vg-grade">
              <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">Título *</label>
                <input className="acn-input" aria-label="Título da viagem" placeholder="Ex.: Entrega e treinamento — Prefeitura de Sorocaba" value={v.titulo} onChange={e => set('titulo', e.target.value)} /></div>
              <div className="acn-vg-campo"><label className="acn-label">Data de saída</label>
                <input type="date" className="acn-input" aria-label="Data de saída" value={v.data_saida || ''} onChange={e => set('data_saida', e.target.value)} /></div>
              <div className="acn-vg-campo"><label className="acn-label">Horário de saída</label>
                <input type="time" className="acn-input" aria-label="Horário de saída de cada dia" value={v.custos.hora_saida || '08:00'} onChange={e => setCusto('hora_saida', e.target.value || '08:00')} />
                <div className="acn-ajuda">Vale para todos os dias do roteiro.</div></div>
              <CampoNumero rotulo="Pessoas" valor={v.pessoas} inteiro onChange={(n: number) => set('pessoas', Math.max(1, n || 1))} />
              <div className="acn-vg-campo acn-vg-largo"><label className="acn-label">Ligada a (OP, PV, licitação…)</label>
                <input className="acn-input" aria-label="Ligada a" placeholder="Opcional: número da OP, do PV ou da licitação" value={v.vinculo || ''} onChange={e => set('vinculo', e.target.value)} /></div>
            </div>
            <div className="acn-vg-campo"><label className="acn-label">Situação</label>
              <Chips ativo={v.status} onChange={(id: string) => set('status', id)} rotulo="Situação da viagem" itens={Object.entries(STATUS_VIAGEM).map(([id, [rotulo]]) => ({ id, rotulo }))} /></div>
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">ROTEIRO</div>
            <div className="acn-vg-campo"><label className="acn-label">Saída (origem) *</label>
              {v.origem
                ? <div className="acn-vg-ponto"><Icone path={mdiMapMarker} size={15} /> <span title={v.origem.texto}>{nomeCurto(v.origem.texto)}</span>
                    <Botao variante="discreto" pequeno onClick={() => set('origem', null)}>trocar</Botao></div>
                : <BuscaDeEndereco rotulo="Buscar o ponto de saída" placeholder="Endereço ou cidade de saída, ex.: Itatiba, SP" onEscolher={(p: any) => set('origem', p)} />}
            </div>

            <div className="acn-vg-campo"><label className="acn-label">Paradas ({v.paradas.length})</label>
              {v.paradas.map((p: any, i: number) => (
                <div key={p.id} className="acn-vg-parada">
                  <span className="acn-vg-n">{i + 1}</span>
                  <span className="acn-vg-parada-nome" title={p.texto}>{nomeCurto(p.texto)}</span>
                  <div className="acn-vg-parada-dias"><CampoNumero rotulo="" valor={p.dias || 0} inteiro sufixo="dia(s) lá" onChange={(n: number) => mudarParada(p.id, 'dias', Math.max(0, n))} /></div>
                  <Botao variante="discreto" pequeno icone={mdiArrowUp} aria-label={`Subir a parada ${i + 1}`} title="Subir" disabled={i === 0} onClick={() => mover(i, -1)} />
                  <Botao variante="discreto" pequeno icone={mdiArrowDown} aria-label={`Descer a parada ${i + 1}`} title="Descer" disabled={i === v.paradas.length - 1} onClick={() => mover(i, 1)} />
                  <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar a parada ${i + 1}`} title="Tirar" onClick={() => set('paradas', v.paradas.filter((x: any) => x.id !== p.id))} />
                </div>
              ))}
              <BuscaDeEndereco rotulo="Buscar uma parada" placeholder="Cidade ou endereço da parada, ex.: Campinas, SP" onEscolher={(p: any) => set('paradas', [...v.paradas, { ...p, dias: 0 }])} />
              <ColarEnderecos onAdicionar={(lista: any[]) => setV((x: any) => ({ ...x, paradas: [...x.paradas, ...lista] }))} />
              <div className="acn-ajuda">"Dias lá" são dias inteiros de trabalho no destino, a partir do dia seguinte à chegada; o roteiro dorme lá e sai na manhã seguinte.</div>
            </div>

            <div className="acn-vg-opcoes">
              <label className="acn-vg-check"><input type="checkbox" checked={!!v.ida_e_volta} onChange={e => set('ida_e_volta', e.target.checked)} /> Ida e volta (retorna ao ponto de saída)</label>
              <label className="acn-vg-check"><input type="checkbox" checked={!!v.otimizar_ordem} onChange={e => set('otimizar_ordem', e.target.checked)} /> Achar a melhor ordem das paradas</label>
            </div>
            <div className="acn-vg-acoes">
              <Botao variante="primario" icone={mdiRefresh} disabled={calculando || !v.origem || !v.paradas.length} onClick={calcular}>{calculando ? 'Calculando…' : 'Calcular rota'}</Botao>
              {v.rota && <span className="acn-ajuda">Calculada em {new Date(v.rota.calculada_em).toLocaleString('pt-BR')} · {v.rota.provedor}{v.rota.otimizada ? ' · melhor ordem' : ''}</span>}
            </div>
            {erroRota && <Faixa tom="erro">{erroRota}</Faixa>}
            {rotaVelha && !erroRota && <Faixa tom="atencao">O roteiro mudou depois do último cálculo: recalcule a rota para o km, o tempo e os custos valerem.</Faixa>}
            {v.rota && (
              <table className="acn-tabela acn-vg-pernas">
                <thead><tr><th>De</th><th>Para</th><th className="dir">Distância</th><th className="dir">Tempo</th>{temPedagioPorTrecho && <th className="dir">Pedágio</th>}</tr></thead>
                <tbody>
                  {v.rota.pernas.map((p: any, i: number) => (
                    <tr key={i}><td>{nomeCurto(p.de)}</td><td>{nomeCurto(p.para)}</td><td className="dir acn-num">{fmtKm(p.km)}</td><td className="dir acn-num">{fmtHoras(p.horas)}</td>{temPedagioPorTrecho && <td className="dir acn-num">{p.pedagio === null || p.pedagio === undefined ? '—' : fmtReais(p.pedagio)}</td>}</tr>
                  ))}
                  <tr className="total"><td colSpan={2}><strong>Total{v.ida_e_volta ? ' (ida e volta)' : ''}</strong></td><td className="dir acn-num"><strong>{fmtKm(v.rota.km)}</strong></td><td className="dir acn-num"><strong>{fmtHoras(v.rota.horas)}</strong></td>{temPedagioPorTrecho && <td className="dir acn-num"><strong>{v.rota.pedagio?.estado === 'calculado' ? fmtReais(v.rota.pedagio.total) : '—'}</strong></td>}</tr>
                </tbody>
              </table>
            )}
          </div>

          {roteiro && (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">ROTEIRO DIA A DIA · {roteiro.totalDias} dia(s), {roteiro.noites} noite(s)</div>
              {!roteiro.completo && <Faixa tom="atencao">A rota guardada não corresponde às paradas da tela: recalcule a rota para o roteiro ficar certo.</Faixa>}
              {rotaVelha && roteiro.completo && <Faixa tom="atencao">O roteiro mudou depois do último cálculo: recalcule a rota para os dias valerem.</Faixa>}
              <div className="acn-vg-dias">
                {roteiro.dias.map((d: any) => (
                  <div key={d.n} className="acn-vg-dia">
                    <div className="acn-vg-dia-cab">
                      <strong>Dia {d.n}</strong>
                      {d.data && <span>{dataComDiaDaSemana(d.data)}</span>}
                      {d.km > 0 && <span className="acn-num">{fmtKm(d.km)}</span>}
                      {d.minutosDirecao > 0 && <span className="acn-num">{fmtHoras(d.minutosDirecao / 60)} de direção</span>}
                    </div>
                    <ul className="acn-vg-evs">
                      {d.eventos.map((e: any, i: number) => (
                        <li key={i} className={'acn-vg-ev acn-vg-ev-' + e.tipo}>
                          <span className="acn-vg-ev-hora acn-num">{e.hora || ''}</span>
                          <span>{e.texto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="acn-ajuda">Os horários consideram só o tempo de direção, sem almoço, abastecimento nem descanso. Os dias contam sábado e domingo.</div>
              <div className="acn-vg-acoes"><Botao pequeno icone={mdiContentCopy} onClick={copiarRoteiro}>Copiar roteiro</Botao></div>
            </div>
          )}

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">CUSTOS</div>
            <div className="acn-vg-grade">
              <CampoNumero rotulo="Consumo do veículo" valor={c.consumo_km_l} sufixo="km/l" onChange={(n: number) => setCusto('consumo_km_l', n)} />
              <CampoNumero rotulo="Combustível" valor={c.preco_combustivel} sufixo="R$/l" onChange={(n: number) => setCusto('preco_combustivel', n)} />
              <CampoNumero rotulo="Desgaste do veículo" valor={c.custo_km_desgaste} sufixo="R$/km" ajuda="Pneus, manutenção, depreciação." onChange={(n: number) => setCusto('custo_km_desgaste', n)} />
              <CampoNumero rotulo="Direção por dia" valor={c.horas_por_dia} sufixo="h/dia" ajuda="Define quantos dias de estrada." onChange={(n: number) => setCusto('horas_por_dia', n)} />
              <CampoNumero rotulo="Diária do quarto" valor={c.diaria_quarto} sufixo="R$" onChange={(n: number) => setCusto('diaria_quarto', n)} />
              <CampoNumero rotulo="Quartos" valor={c.quartos} inteiro onChange={(n: number) => setCusto('quartos', n)} />
              <CampoNumero rotulo="Noites de hotel" valor={c.noites} vazioNulo inteiro placeholder={`automático (${r.noitesSugeridas})`} ajuda={`Em branco = automático: dias − 1 (hoje ${r.noitesSugeridas}).`} onChange={(n: number | null) => setCusto('noites', n)} />
              <CampoNumero rotulo="Alimentação" valor={c.alimentacao_pessoa_dia} sufixo="R$/pessoa/dia" onChange={(n: number) => setCusto('alimentacao_pessoa_dia', n)} />
              <CampoNumero rotulo="Valor do km rodado" valor={c.valor_km_rodado} vazioNulo sufixo="R$/km" placeholder={`custo real (${fmtReais(r.custoPorKm)})`} ajuda="O que se cobra ou reembolsa por km. Em branco = o custo real por km." onChange={(n: number | null) => setCusto('valor_km_rodado', n)} />
              <CampoNumero rotulo="Margem sobre o custo" valor={c.margem_pct} sufixo="%" onChange={(n: number) => setCusto('margem_pct', n)} />
            </div>
            {pedagioDaRota?.estado === 'calculado' && (
              <div className="acn-vg-pedagio-auto">
                <div className="acn-quadro-titulo">PEDÁGIO CALCULADO PELA ROTA</div>
                <div><strong className="acn-num">{fmtReais(pedagioDaRota.total)}</strong> <span className="acn-ajuda">({pedagioDaRota.fonte}{v.ida_e_volta ? ', ida e volta' : ''}; carro de passeio)</span></div>
                <label className="acn-vg-check"><input type="checkbox" checked={c.usar_pedagio_auto !== false} onChange={e => setCusto('usar_pedagio_auto', e.target.checked)} /> Somar este valor ao orçamento</label>
                {(pedagioDaRota.avisos || []).length > 0 && <div className="acn-ajuda">Avisos do serviço: {pedagioDaRota.avisos.join('; ')}</div>}
                <div className="acn-ajuda">Confira o valor antes de passar ao cliente. As linhas lançadas à mão abaixo SOMAM a este valor: não lance de novo o que a rota já calculou.</div>
              </div>
            )}
            {pedagioDaRota?.estado === 'sem_pedagio_informado' && <Faixa tom="info">O serviço de rotas não informou pedágio para esta rota: pode não haver pedágio no caminho ou o serviço não ter dados do trecho. Confira e lance à mão o que houver.</Faixa>}
            {pedagioDaRota?.estado === 'falhou' && <Faixa tom="atencao">Não foi possível calcular o pedágio automaticamente ({pedagioDaRota.motivo}). Lance à mão ou calcule a rota de novo.</Faixa>}
            {pedagioDaRota?.estado === 'nao_configurado' && <div className="acn-ajuda">O cálculo automático de pedágio ainda não está ligado neste sistema: lance os pedágios à mão.</div>}
            <ListaDeLinhas titulo={pedagioDaRota?.estado === 'calculado' ? 'Pedágios lançados à mão (somam ao calculado)' : 'Pedágios'} linhas={c.pedagios} placeholder="Ex.: Rodovia dos Bandeirantes (ida e volta)" ajuda="Lançados à mão." onChange={(l: any[]) => setCusto('pedagios', l)} />
            <ListaDeLinhas titulo="Outros custos" linhas={c.outros} placeholder="Ex.: estacionamento, balsa, aluguel de carro" onChange={(l: any[]) => setCusto('outros', l)} />
          </div>

          <div className="acn-quadro tom-info acn-vg-resumo">
            <div className="acn-quadro-titulo">ORÇAMENTO</div>
            {!r.temRota && <div className="acn-ajuda">A rota ainda não foi calculada: sem ela não há km, tempo, combustível, noites nem alimentação. Os custos lançados à mão já entram no total.</div>}
            <table className="acn-tabela">
              <tbody>
                {r.temRota && <tr><td>Percurso</td><td className="dir acn-num">{fmtKm(r.km)} · {fmtHoras(r.horasDirecao)} de direção · {r.dias} dia(s) · {r.noites} noite(s)</td></tr>}
                <tr><td>Combustível</td><td className="dir acn-num">{fmtReais(r.combustivel)}</td></tr>
                <tr><td>Desgaste do veículo</td><td className="dir acn-num">{fmtReais(r.desgaste)}</td></tr>
                <tr><td>Hospedagem</td><td className="dir acn-num">{fmtReais(r.hospedagem)}</td></tr>
                <tr><td>Alimentação</td><td className="dir acn-num">{fmtReais(r.alimentacao)}</td></tr>
                <tr><td>Pedágios{r.pedagiosAuto > 0 ? ` (inclui ${fmtReais(r.pedagiosAuto)} calculados pela rota)` : ''}</td><td className="dir acn-num">{fmtReais(r.pedagios)}</td></tr>
                <tr><td>Outros</td><td className="dir acn-num">{fmtReais(r.outros)}</td></tr>
                <tr className="total"><td><strong>Custo total</strong></td><td className="dir acn-num"><strong>{fmtReais(r.custoTotal)}</strong></td></tr>
                {c.margem_pct > 0 && <tr><td>Margem ({c.margem_pct}%)</td><td className="dir acn-num">{fmtReais(r.margem)}</td></tr>}
                {c.margem_pct > 0 && <tr className="total"><td><strong>Valor do orçamento</strong></td><td className="dir acn-num"><strong>{fmtReais(r.orcamento)}</strong></td></tr>}
                {r.temRota && <tr><td>Km rodado: {fmtReais(r.valorKmRodado)}/km × {fmtKm(r.km)}</td><td className="dir acn-num">{fmtReais(r.kmRodadoTotal)}</td></tr>}
              </tbody>
            </table>
            <div className="acn-vg-acoes">
              <Botao pequeno icone={mdiContentCopy} onClick={copiar}>Copiar texto</Botao>
              <Botao pequeno icone={mdiPrinterOutline} onClick={() => abrirImpressao(v, r)}>Imprimir</Botao>
            </div>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar viagem'}</Botao>
          <Botao onClick={aoFechar} disabled={salvando}>Fechar</Botao>
          {podeApagar && <Botao variante="perigo-sec" icone={mdiTrashCanOutline} className="acn-vg-apagar" disabled={salvando} onClick={apagar}>Apagar</Botao>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── a lista ──────────────────────────────────────────────────────────────────
export default function ViagensTab({ currentUser }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [editando, setEditando] = useState<any | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('viagens').select('*').order('data_saida', { ascending: false, nullsFirst: true }).order('criado_em', { ascending: false });
    if (error) { setErro(error.message); setCarregando(false); return; }   // a lista que já estava na tela fica; a faixa diz o motivo
    setErro(''); setLista(data || []); setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = lista.filter(v => filtro === 'todas' || v.status === filtro);
  const resumoRoteiro = (v: any) => [v.origem?.texto, ...(v.paradas || []).map((p: any) => p.texto)].filter(Boolean).map(nomeCurto).join(' → ') + (v.ida_e_volta && v.origem ? ' → volta' : '');

  return (
    <div className="acn-vg">
      <CabecalhoTela titulo="Viagens" subtitulo="Roteiro, km, tempo, hospedagem, pedágios e orçamento de cada viagem"
        acoes={<Botao variante="primario" icone={mdiPlus} onClick={() => setEditando(viagemVazia())}>Nova viagem</Botao>} />
      {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as viagens ({erro}).</Faixa>}
      <Chips ativo={filtro} onChange={setFiltro} rotulo="Filtrar por situação"
        itens={[{ id: 'todas', rotulo: `Todas (${lista.length})` }, ...Object.entries(STATUS_VIAGEM).map(([id, [rotulo]]) => ({ id, rotulo: `${rotulo} (${lista.filter(v => v.status === id).length})` }))]} />
      {carregando && !lista.length && <div className="acn-ajuda">Carregando viagens…</div>}
      {!carregando && !erro && !visiveis.length && <div className="acn-ajuda">{lista.length ? 'Nenhuma viagem nesta situação.' : 'Nenhuma viagem ainda. Use "Nova viagem" para montar o roteiro e o orçamento.'}</div>}
      <div className="acn-vg-lista">
        {visiveis.map(v => (
          <button key={v.id} type="button" className="acn-vg-card" onClick={() => setEditando(v)}>
            <div className="acn-vg-card-cab">
              <strong>{v.titulo}</strong>
              <Selo familia={STATUS_VIAGEM[v.status]?.[1] || 'neutro'} ponto={false}>{STATUS_VIAGEM[v.status]?.[0] || v.status}</Selo>
            </div>
            <div className="acn-vg-card-rota">{resumoRoteiro(v) || 'Roteiro ainda não montado'}</div>
            <div className="acn-vg-card-meta">
              <span>{diaBR(v.data_saida)}</span>
              {v.km_total != null && <span>{fmtKm(v.km_total)} · {fmtHoras(v.horas_viagem)}</span>}
              {v.vinculo && <span>{v.vinculo}</span>}
              <span className="acn-vg-card-valor acn-num">{v.total_orcamento != null && Number(v.total_orcamento) > 0 ? fmtReais(v.total_orcamento) : 'sem valor'}</span>
            </div>
          </button>
        ))}
      </div>
      {editando && <EditorDeViagem key={editando.id || 'nova'} inicial={editando} currentUser={currentUser} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); carregar(); }} />}
    </div>
  );
}
