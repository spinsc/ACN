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
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { logChange } from './AuditSystem';
import { ehAdminOuGerente } from './utils/permissoes';
import { CabecalhoTela, Botao, Selo, Faixa, Chips, MenuAcoes, hojeISO } from './Interface';
import { combinaBusca } from './SearchUtils';
import Icone from './Icone';
import { buscarEndereco, buscarVariosEnderecos, linhasDeEnderecos, calcularRota, nomeCurto, assinaturaDoRoteiro } from './ViagemRota';
import { CUSTOS_PADRAO, calcularViagem, fmtKm, fmtHoras, fmtReais, textoDoOrcamento, textoDoRoteiro, dataComDiaDaSemana } from './ViagemCalculo';
import { CampoNumero } from './ViagemCampos';
import { BlocoFechamento } from './ViagemFechamento';
import { VinculosDaViagem, textoDosVinculos } from './ViagemVinculos';
import { abrirVinculo } from './VinculoPicker';
import { BlocoProvisionamento, FrotaModal, lerFrota, camposDoGrupo, anexarContrato, tirarContrato } from './ViagemProvisionamento';
import { montarRoteiro } from './ViagemRoteiro';
import { abrirFicha } from './ViagemFicha';
import { conflitosDaViagem, frasesDosConflitos } from './ViagemConflitos';
import RelatorioDeCustos from './ViagemRelatorioTela';
import {
  COLUNAS_VIAGEM, statusDaViagem, colunaDaViagem, rotuloDoStatus, movimentosDaViagem, movimentoParaAColuna, faltaParaMover, patchDoMovimento, entradaDoMovimento, entradaDeAlteracao,
  diasNaColuna, diasParaSair, saidaAtrasada, textoParaBusca, permissoesDaViagem, temProvisionamento,
} from './ViagemFluxo';
import type { Movimento } from './ViagemFluxo';
import {
  mdiPlus, mdiClose, mdiArrowUp, mdiArrowDown, mdiMagnify, mdiContentSaveOutline, mdiContentCopy, mdiPrinterOutline,
  mdiTrashCanOutline, mdiMapMarkerPath, mdiMapMarker, mdiRefresh, mdiArrowRight, mdiOpenInNew, mdiCarOutline, mdiFileDocumentOutline,
} from '@mdi/js';

const novoId = () => Math.random().toString(36).slice(2, 8);
const diaBR = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const viagemVazia = () => ({ titulo: '', status: 'aberta', data_saida: '', pessoas: 1, vinculo: '', vinculos: [], origem: null, paradas: [], ida_e_volta: true, otimizar_ordem: true, rota: null, custos: { ...CUSTOS_PADRAO } });

// ── peças pequenas ───────────────────────────────────────────────────────────

/** Procura um endereço ou cidade e deixa escolher entre os candidatos. */
function BuscaDeEndereco({ rotulo, placeholder, onEscolher, semente }: any) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const buscar = async (texto?: any) => {
    if (buscando) return;
    const consulta = typeof texto === 'string' ? texto : q;
    setBuscando(true); setErro(''); setLista(null);
    try {
      const r = await buscarEndereco(consulta);
      if (!r.length) setErro('Nada encontrado. Tente a cidade e o estado, por exemplo "Sorocaba, SP".');
      setLista(r);
    } catch (e: any) { setErro('Não foi possível buscar: ' + (e?.message || e)); }
    finally { setBuscando(false); }
  };
  // o destino que a OP indica: o botão da faixa manda o texto para cá e a busca já roda (04/11/2026)
  useEffect(() => { if (semente?.texto) { setQ(semente.texto); buscar(semente.texto); } }, [semente?.n]);
  return (
    <div className="acn-vg-busca">
      <div className="acn-vg-busca-linha">
        <input className="acn-input" aria-label={rotulo} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscar(); }} />
        <Botao pequeno variante="secundario" icone={mdiMagnify} disabled={buscando || q.trim().length < 3} onClick={() => buscar()}>{buscando ? 'Buscando…' : 'Buscar'}</Botao>
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
  const pernas = (v.rota?.pernas || []).map((p: any) => `<tr><td>${esc(nomeCurto(p.de))}</td><td>${esc(nomeCurto(p.para))}</td><td style="text-align:right">${fmtKm(p.km)}</td><td style="text-align:right">${fmtHoras(p.horas)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento de viagem</title>
    <style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:24px}h2{margin:0 0 12px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f1f5f9}</style></head>
    <body><h2>Orçamento de viagem</h2><div>${texto}</div>${roteiroTexto ? `<h3>Roteiro dia a dia</h3><div>${roteiroTexto}</div>` : ''}${pernas ? `<h3>Trechos</h3><table><thead><tr><th>De</th><th>Para</th><th>Distância</th><th>Tempo</th></tr></thead><tbody>${pernas}</tbody></table>` : ''}
    <script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=820,height=700');
  if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.'); return; }
  w.document.write(html); w.document.close();
}

// ── o editor ─────────────────────────────────────────────────────────────────
export function EditorDeViagem({ inicial, currentUser, aoFechar, aoSalvar }: any) {
  const [v, setV] = useState(() => ({ ...viagemVazia(), ...inicial, custos: { ...CUSTOS_PADRAO, ...(inicial?.custos || {}) }, paradas: inicial?.paradas || [], data_saida: inicial?.data_saida || '', vinculo: inicial?.vinculo || '', vinculos: Array.isArray(inicial?.vinculos) ? inicial.vinculos : [] }));
  const fotoInicial = useRef('');   // o que a janela mostrava ao abrir: serve para avisar de alterações não salvas antes de sair para outro registro
  if (!fotoInicial.current) fotoInicial.current = JSON.stringify(v);
  const [salvando, setSalvando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erroRota, setErroRota] = useState('');
  // fatia 2 (04/11/2026): quem pode mexer em cada parte, a frota e o contrato
  const pode = permissoesDaViagem(currentUser);
  const [frota, setFrota] = useState<any[]>([]);
  const [erroFrota, setErroFrota] = useState('');
  const [subindoContrato, setSubindoContrato] = useState(false);
  const [semente, setSemente] = useState<any>(null);   // manda o destino que a OP indica para a busca de parada
  useEffect(() => { lerFrota().then(r => { setFrota(r.lista); setErroFrota(r.erro); }); }, []);
  // as outras viagens que ainda ocupam equipe e carro, para avisar de conflito de datas (04/11/2026); leitura que falha vira aviso, nunca "sem conflito" calado
  const [outras, setOutras] = useState<any[]>([]);
  const [erroOutras, setErroOutras] = useState('');
  useEffect(() => {
    if (!temProvisionamento(inicial || {})) return;
    supabase.from('viagens').select('*').in('status', ['aberta', 'em_aprovacao', 'provisionamento', 'aprovada', 'andamento']).then(({ data, error }: any) => { setErroOutras(error ? error.message : ''); setOutras(error ? [] : (data || [])); });
  }, []);
  const set = (campo: string, valor: any) => setV((x: any) => ({ ...x, [campo]: valor }));
  const setCusto = (campo: string, valor: any) => setV((x: any) => ({ ...x, custos: { ...x.custos, [campo]: valor } }));
  const r = useMemo(() => calcularViagem(v), [v]);
  const roteiro = useMemo(() => montarRoteiro(v), [v]);
  const assinaturaAtual = assinaturaDoRoteiro(v.origem, v.paradas, v.ida_e_volta, v.otimizar_ordem);
  const rotaVelha = !!v.rota && v.rota.assinatura !== assinaturaAtual;
  const coluna = colunaDaViagem(inicial || v);   // a etapa que está gravada (a pessoa não a troca no formulário: ela passa pelos botões do rodapé)
  const passos = movimentosDaViagem(inicial || v, currentUser);
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
      const rota = await calcularRota({ origem: v.origem, paradas: v.paradas, idaEVolta: v.ida_e_volta, otimizar: v.otimizar_ordem });
      setV((x: any) => {
        let paradas = x.paradas;
        if (rota.otimizada) { const porId = new Map(x.paradas.map((p: any) => [p.id, p])); paradas = rota.ordem.map((id: string) => porId.get(id)).filter(Boolean); }
        return { ...x, paradas, rota: { ...rota, assinatura: assinaturaDoRoteiro(x.origem, paradas, x.ida_e_volta, x.otimizar_ordem) } };
      });
    } catch (e: any) { setErroRota('Não foi possível calcular a rota: ' + (e?.message || e)); }
    finally { setCalculando(false); }
  };

  /** Grava a viagem. Com `mov`, grava junto a passagem de coluna (um só passo: ou tudo ou nada), com a conferência do que falta e o motivo quando a passagem pede. */
  const salvar = async (mov?: Movimento) => {
    if (salvando) return;
    if (pode.base && !String(v.titulo || '').trim()) { mostrarAviso('Dê um título à viagem.', 'atencao'); return; }
    if (!v.id && !pode.base) { mostrarAviso('Você não tem permissão para criar viagens.', 'atencao'); return; }
    if (mov) {
      const falta = faltaParaMover(v, mov.para);
      if (falta.length) { mostrarAviso(`Não foi possível mandar para "${rotuloDoStatus(mov.para)}": falta ${falta.join(', ')}.`); return; }
    }
    let motivo: string | null = null;
    if (mov?.pedeMotivo) {
      const t = await pedirTexto(`${mov.rotulo}: qual o motivo? (obrigatório)`);
      if (t === null) return;
      if (!t.trim()) { mostrarAviso('Não foi possível passar a viagem: o motivo é obrigatório.'); return; }
      motivo = t.trim();
    }
    if (mov?.para === 'andamento') {
      const frases = frasesDosConflitos(conflitosDaViagem(v, outras, hojeISO()));
      if (frases.length && !await confirmar(['Conflito de datas:', '', ...frases, '', 'Iniciar a viagem mesmo assim?'].join(String.fromCharCode(10)))) return;
    }
    if (!mov && pode.base && rotaVelha && !await confirmar('O roteiro mudou depois do último cálculo: o km, o tempo e os custos gravados são os da rota ANTIGA.\n\nSalvar mesmo assim? (Para atualizar, cancele e use "Calcular rota".)')) return;
    setSalvando(true);
    const agora = new Date().toISOString();
    const por = currentUser?.nome || currentUser?.email || null;
    // cada pessoa grava só o grupo que pode editar (a parte da Adaptação, do Comercial e do Financeiro vai separada), para não passar por cima do que outro setor preencheu
    const linhaBase: any = {
      titulo: String(v.titulo).trim(), data_saida: v.data_saida || null, pessoas: Math.max(1, Math.floor(Number(v.pessoas) || 1)),
      // o texto curto sai da lista de ligações; viagem antiga, só com o texto escrito à mão, mantém o texto
      vinculos: v.vinculos || [], vinculo: ((v.vinculos || []).length ? textoDosVinculos(v.vinculos) : String(v.vinculo || '').trim()) || null, origem: v.origem, paradas: v.paradas, ida_e_volta: !!v.ida_e_volta, otimizar_ordem: !!v.otimizar_ordem,
      rota: v.rota, custos: v.custos, km_total: r.temRota ? r.km : null, horas_viagem: r.temRota ? r.horasDirecao : null, total_custo: r.custoTotal, total_orcamento: r.orcamento,
    };
    const linha: any = { ...(pode.base ? linhaBase : {}), ...camposDoGrupo(v, pode) };
    // o histórico: a criação, a passagem de coluna e, se a viagem já saiu de Aberta, o rastro de que o roteiro ou o valor mudou
    let historico: any[] = Array.isArray(inicial?.historico) ? [...inicial.historico] : [];
    if (!v.id) historico.push({ em: agora, por, de: '', para: 'aberta', nota: 'Viagem criada.' });
    if (mov) {
      const p = patchDoMovimento(v.id ? inicial : { ...v, status: 'aberta' }, mov, por, motivo, agora);
      Object.assign(linha, { status: p.status, status_desde: p.status_desde });
      historico.push(p.historico[p.historico.length - 1]);
    } else if (pode.base && v.id && statusDaViagem(inicial) !== 'aberta') {
      const mudouRoteiro = JSON.stringify([inicial.origem, inicial.paradas, inicial.ida_e_volta]) !== JSON.stringify([v.origem, v.paradas, v.ida_e_volta]);
      const mudouValor = Math.round(Number(inicial.total_orcamento || 0) * 100) !== Math.round(Number(r.orcamento || 0) * 100);
      if (mudouRoteiro || mudouValor) historico.push(entradaDeAlteracao(inicial, inicial.total_orcamento, r.orcamento, por, agora));
    }
    // cada setor que preenche a sua parte deixa o rastro no histórico (quem, quando e quais campos)
    if (v.id && !mov) {
      const mudou = (campos: string[]) => campos.some(k => JSON.stringify(inicial?.[k] ?? null) !== JSON.stringify(v[k] ?? null));
      const notas: string[] = [];
      if (pode.adaptacao && mudou(['equipe', 'frota_id', 'km_saida', 'km_volta'])) notas.push('Adaptação atualizou a equipe, o veículo ou o km.');
      if (pode.comercial && mudou(['servico_descricao', 'contrato_obs'])) notas.push('Comercial atualizou o serviço ou o contrato.');
      if (pode.financeiro && mudou(['verba_total', 'pedagio_modo', 'hotel', 'custo_real'])) notas.push('Financeiro atualizou a verba, o pedágio, o hotel ou o custo real.');
      const st = statusDaViagem(inicial);
      for (const nota of notas) historico.push({ em: agora, por, de: st, para: st, nota });
    }
    // só regrava o histórico quando há entrada nova: quem salva a parte de um setor não pode apagar o que outro setor acabou de registrar
    if (historico.length !== (Array.isArray(inicial?.historico) ? inicial.historico.length : 0)) linha.historico = historico;
    // a gravação de quem passa de coluna só vale se a viagem ainda está na coluna que a pessoa viu (duas pessoas não passam a mesma viagem)
    const { data, error } = v.id
      ? await (mov ? supabase.from('viagens').update({ ...linha, atualizado_em: agora, atualizado_por_nome: por }).eq('id', v.id).eq('status', inicial.status) : supabase.from('viagens').update({ ...linha, atualizado_em: agora, atualizado_por_nome: por }).eq('id', v.id)).select('id').maybeSingle()
      : await supabase.from('viagens').insert([{ ...linha, status: linha.status || 'aberta', status_desde: linha.status_desde || agora, criado_por_nome: por, atualizado_por_nome: por }]).select('id').single();
    setSalvando(false);
    if (error || !data) { mostrarAviso('Não foi possível salvar a viagem: ' + (error?.message || (mov ? 'ela já mudou de coluna: feche e abra de novo' : 'o banco não confirmou a gravação'))); return; }
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

  // o contrato sobe e a lista é gravada na hora (só essa coluna): o arquivo não se perde se a janela fechar sem salvar
  const aoAnexarContrato = async (e: any) => {
    const arquivos = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (!arquivos.length || !v.id) return;
    setSubindoContrato(true);
    const res = await anexarContrato(v, arquivos, currentUser);
    setSubindoContrato(false);
    set('contrato_anexos', res.lista);
    if (res.erro) mostrarAviso(res.erro);
  };
  const aoTirarContrato = async (i: number) => {
    const res = await tirarContrato(v, i, currentUser);
    set('contrato_anexos', res.lista);
    if (res.erro) mostrarAviso(res.erro);
  };
  // abrir a OP, o card ou a licitação ligados: a janela da viagem sai da frente (senão ela cobre a tela que abriria), avisando se há algo não salvo
  const abrirLigacao = async (x: any) => {
    if (JSON.stringify(v) !== fotoInicial.current && !await confirmar('Há alterações não salvas nesta viagem. Abrir o registro mesmo assim? O que não foi salvo se perde.')) return;
    await abrirVinculo(x);
    aoFechar();
  };
  const nadaParaSalvar = !pode.base && !pode.adaptacao && !pode.comercial && !pode.financeiro;
  const c = v.custos;
  return createPortal(
    <div className="modal-overlay acn-vg-ov">
      <div className="modal-box acn-modal-cadastro acn-vg-jan" role="dialog" aria-label="Viagem">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiMapMarkerPath} size={18} />{v.id ? 'Viagem' : 'Nova viagem'}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={aoFechar} />
        </div>
        <div className="acn-modal-corpo acn-vg-corpo">

          {!pode.base && <Faixa tom="info">Você não tem a aba Viagens: pode preencher só a parte do seu setor, mais abaixo. O roteiro e os custos ficam só para leitura.</Faixa>}
          <fieldset className="acn-vg-fs" disabled={!pode.base}>
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
            </div>
            <div className="acn-vg-campo"><label className="acn-label">Ligada a (OP, PV, licitação)</label>
              <VinculosDaViagem v={v} set={set} pode={pode} aoAbrir={abrirLigacao} /></div>
            <div className="acn-vg-campo"><label className="acn-label">Etapa</label>
              <div className="acn-vg-etapa"><Selo familia={coluna.familia} ponto={false} title={coluna.ajuda}>{coluna.rotulo}</Selo><span className="acn-ajuda">{coluna.ajuda} Para mudar de etapa use os botões no rodapé.</span></div></div>
          </div>
          </fieldset>

          {['andamento', 'finalizada'].includes(statusDaViagem(inicial || v)) && <BlocoFechamento v={v} set={set} pode={pode} r={r} />}

          {temProvisionamento(inicial || v) && (
            <BlocoProvisionamento v={v} set={set} pode={pode} frota={frota} erroFrota={erroFrota} orcamento={r.orcamento}
              aoAnexarContrato={aoAnexarContrato} aoTirarContrato={aoTirarContrato} subindoContrato={subindoContrato} outras={outras} erroOutras={erroOutras} />
          )}

          <fieldset className="acn-vg-fs" disabled={!pode.base}>
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">ROTEIRO</div>
            {v.sugestao_destino && !v.paradas.length && (
              <Faixa tom="info">A OP indica o destino: «{v.sugestao_destino}». {pode.base && <Botao pequeno variante="secundario" icone={mdiMagnify} onClick={() => setSemente({ texto: v.sugestao_destino, n: Date.now() })}>Procurar no mapa</Botao>}</Faixa>
            )}
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
                  <div className="acn-vg-parada-dias"><CampoNumero rotulo="" valor={p.dias || 0} inteiro sufixo="dia(s) no local" onChange={(n: number) => mudarParada(p.id, 'dias', Math.max(0, n))} /></div>
                  <Botao variante="discreto" pequeno icone={mdiArrowUp} aria-label={`Subir a parada ${i + 1}`} title="Subir" disabled={i === 0} onClick={() => mover(i, -1)} />
                  <Botao variante="discreto" pequeno icone={mdiArrowDown} aria-label={`Descer a parada ${i + 1}`} title="Descer" disabled={i === v.paradas.length - 1} onClick={() => mover(i, 1)} />
                  <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar a parada ${i + 1}`} title="Tirar" onClick={() => set('paradas', v.paradas.filter((x: any) => x.id !== p.id))} />
                </div>
              ))}
              <BuscaDeEndereco rotulo="Buscar uma parada" placeholder="Cidade ou endereço da parada, ex.: Campinas, SP" semente={semente} onEscolher={(p: any) => set('paradas', [...v.paradas, { ...p, dias: 0 }])} />
              <ColarEnderecos onAdicionar={(lista: any[]) => setV((x: any) => ({ ...x, paradas: [...x.paradas, ...lista] }))} />
              <div className="acn-ajuda">"Dias no local" contam o dia da chegada como o dia 1: com 3 dias a equipe chega e trabalha no dia 1, dorme lá duas noites e sai no fim do dia 3.</div>
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
                <thead><tr><th>De</th><th>Para</th><th className="dir">Distância</th><th className="dir">Tempo</th></tr></thead>
                <tbody>
                  {v.rota.pernas.map((p: any, i: number) => (
                    <tr key={i}><td>{nomeCurto(p.de)}</td><td>{nomeCurto(p.para)}</td><td className="dir acn-num">{fmtKm(p.km)}</td><td className="dir acn-num">{fmtHoras(p.horas)}</td></tr>
                  ))}
                  <tr className="total"><td colSpan={2}><strong>Total{v.ida_e_volta ? ' (ida e volta)' : ''}</strong></td><td className="dir acn-num"><strong>{fmtKm(v.rota.km)}</strong></td><td className="dir acn-num"><strong>{fmtHoras(v.rota.horas)}</strong></td></tr>
                </tbody>
              </table>
            )}
          </div>
          </fieldset>

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

          <fieldset className="acn-vg-fs" disabled={!pode.base}>
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
            <ListaDeLinhas titulo="Pedágios" linhas={c.pedagios} placeholder="Ex.: Rodovia dos Bandeirantes (ida e volta)" ajuda="Lançados à mão: as fontes gratuitas de mapa não informam pedágio." onChange={(l: any[]) => setCusto('pedagios', l)} />
            <ListaDeLinhas titulo="Outros custos" linhas={c.outros} placeholder="Ex.: estacionamento, balsa, aluguel de carro" onChange={(l: any[]) => setCusto('outros', l)} />
          </div>
          </fieldset>

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
                <tr><td>Pedágios</td><td className="dir acn-num">{fmtReais(r.pedagios)}</td></tr>
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
              {temProvisionamento(inicial || v) && <Botao pequeno icone={mdiFileDocumentOutline} title="Uma folha para a equipe levar: roteiro, veículo, hotel, contrato e verba" onClick={() => { if (!abrirFicha(v)) mostrarAviso('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.', 'atencao'); }}>Ficha da equipe</Botao>}
            </div>
          </div>

          {(v.historico || []).length > 0 && (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">HISTÓRICO DA VIAGEM</div>
              <ul className="acn-vg-hist">
                {[...v.historico].reverse().map((h: any, i: number) => (
                  <li key={i}>
                    <span className="acn-num acn-vg-hist-quando">{new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <span>{h.por || 'sistema'}</span>
                    <span>{h.nota ? h.nota : `${h.de ? rotuloDoStatus(h.de) + ' → ' : ''}${rotuloDoStatus(h.para)}`}{h.motivo ? ` — ${h.motivo}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando || nadaParaSalvar} onClick={() => salvar()}>{salvando ? 'Salvando…' : 'Salvar viagem'}</Botao>
          {passos.map(m => (
            <Botao key={m.para} variante={m.perigo ? 'perigo-sec' : m.sentido === 'avanca' ? 'secundario' : 'discreto'} icone={m.sentido === 'avanca' ? mdiArrowRight : undefined} disabled={salvando}
              title={'Grava a viagem e a passa para ' + rotuloDoStatus(m.para)} onClick={() => salvar(m)}>{m.rotulo}</Botao>
          ))}
          <Botao onClick={aoFechar} disabled={salvando}>Fechar</Botao>
          {podeApagar && <Botao variante="perigo-sec" icone={mdiTrashCanOutline} className="acn-vg-apagar" disabled={salvando} onClick={apagar}>Apagar</Botao>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── passar a viagem de coluna (pelo quadro, pelo menu ou arrastando) ──────────
/** Passa a viagem para outra coluna: confere o que falta, pede o motivo quando a passagem pede e só grava se ela ainda está na coluna que a pessoa viu. */
async function moverViagem(v: any, m: Movimento, currentUser: any): Promise<boolean> {
  const falta = faltaParaMover(v, m.para);
  if (falta.length) { mostrarAviso(`Não foi possível mandar "${v.titulo}" para "${rotuloDoStatus(m.para)}": falta ${falta.join(', ')}. Abra a viagem para completar.`); return false; }
  let motivo: string | null = null;
  if (m.pedeMotivo) {
    const t = await pedirTexto(`${m.rotulo} — "${v.titulo}": qual o motivo? (obrigatório)`);
    if (t === null) return false;
    if (!t.trim()) { mostrarAviso('Não foi possível passar a viagem: o motivo é obrigatório.'); return false; }
    motivo = t.trim();
  }
  const agora = new Date().toISOString();
  const por = currentUser?.nome || currentUser?.email || null;
  const p = patchDoMovimento(v, m, por, motivo, agora);
  const { data, error } = await supabase.from('viagens').update({ ...p, atualizado_em: agora, atualizado_por_nome: por }).eq('id', v.id).eq('status', v.status).select('id');
  if (error || !data?.length) { mostrarAviso('Não foi possível passar a viagem: ' + (error?.message || 'ela já mudou de coluna; atualize a tela')); return false; }
  logChange({ module: 'viagens', entityType: 'viagens', entityId: v.id, changeType: 'UPDATE', oldRow: { status: v.status }, newRow: { status: p.status, motivo }, user: currentUser });
  mostrarAviso(`"${v.titulo}" agora está em ${rotuloDoStatus(m.para)}.`, 'ok');
  return true;
}

const resumoRoteiro = (v: any) => [v.origem?.texto, ...(v.paradas || []).map((p: any) => p.texto)].filter(Boolean).map(nomeCurto).join(' → ') + (v.ida_e_volta && v.origem ? ' → volta' : '');
/** O recado do dia da saída: atrasada (vermelho), hoje, amanhã ou em N dias. Viagem que já saiu não leva recado. */
function recadoDaSaida(v: any, hoje: string): { texto: string; atraso: boolean } | null {
  const st = statusDaViagem(v);
  if (st === 'andamento' || st === 'finalizada' || st === 'nao_aprovada') return null;
  const d = diasParaSair(v, hoje);
  if (d === null) return null;
  if (saidaAtrasada(v, hoje)) return { texto: `Saída atrasada há ${-d} dia(s)`, atraso: true };
  return { texto: d === 0 ? 'Sai hoje' : d === 1 ? 'Sai amanhã' : `Sai em ${d} dias`, atraso: false };
}
const motivoDaRecusa = (v: any) => [...(v.historico || [])].reverse().find((h: any) => h.para === 'nao_aprovada')?.motivo || null;

function CartaoDaViagem({ v, hoje, currentUser, aoAbrir, aoMover }: any) {
  const passos: Movimento[] = movimentosDaViagem(v, currentUser);
  const proximo = passos.find(m => m.sentido === 'avanca');
  const recado = recadoDaSaida(v, hoje);
  const r = v.rota ? calcularViagem(v) : null;
  const st = statusDaViagem(v);
  const parado = !['finalizada', 'nao_aprovada'].includes(st) ? diasNaColuna(v) : 0;
  const recusa = st === 'nao_aprovada' ? motivoDaRecusa(v) : null;
  return (
    <div className="acn-vg-kcard" data-viagem={v.id} draggable={passos.length > 0}
      onDragStart={e => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => aoAbrir(v)}>
      <div className="acn-vg-card-cab">
        <strong>{v.titulo}</strong>
        <span onClick={e => e.stopPropagation()}>
          <MenuAcoes itens={[
            { rotulo: 'Abrir a viagem', icone: mdiOpenInNew, onClick: () => aoAbrir(v) },
            ...(temProvisionamento(v) ? [{ rotulo: 'Ficha da equipe (imprimir)', icone: mdiFileDocumentOutline, onClick: () => { if (!abrirFicha(v)) mostrarAviso('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente de novo.', 'atencao'); } }] : []),
            ...passos.map(m => ({ rotulo: m.rotulo, onClick: () => aoMover(v, m), perigo: m.perigo, grupo: 'Passar para' })),
          ]} />
        </span>
      </div>
      <div className="acn-vg-card-rota">{resumoRoteiro(v) || 'Roteiro ainda não montado'}</div>
      <div className="acn-vg-card-meta">
        <span>{diaBR(v.data_saida)}</span>
        {r && r.dias > 0 && <span>{r.dias} dia(s)</span>}
        {v.km_total != null && <span>{fmtKm(v.km_total)}</span>}
        {v.vinculo && <span>{v.vinculo}</span>}
      </div>
      {(recado || parado >= 3) && (
        <div className="acn-vg-card-meta">
          {recado && <Selo familia={recado.atraso ? 'erro' : 'neutro'} ponto={false}>{recado.texto}</Selo>}
          {parado >= 3 && <span className="acn-vg-parada-ha" title="Dias na etapa atual">há {parado} dias nesta etapa</span>}
        </div>
      )}
      {(v.veiculo_nome || (Array.isArray(v.equipe) && v.equipe.length > 0)) && (
        <div className="acn-vg-card-meta">
          {v.veiculo_nome && <span className="acn-vg-chip" title="Veículo da frota"><Icone path={mdiCarOutline} size={13} /> {v.veiculo_nome}{v.veiculo_placa ? ' · ' + v.veiculo_placa : ''}</span>}
          {Array.isArray(v.equipe) && v.equipe.length > 0 && <span title={v.equipe.map((m: any) => m.nome).join(', ')}>{v.equipe.length} na equipe</span>}
        </div>
      )}
      {recusa && <div className="acn-vg-card-recusa">Motivo: {recusa}</div>}
      <div className="acn-vg-card-pe">
        <span className="acn-vg-card-valor acn-num">{v.total_orcamento != null && Number(v.total_orcamento) > 0 ? fmtReais(v.total_orcamento) : 'sem valor'}</span>
        {proximo && <span onClick={e => e.stopPropagation()}><Botao pequeno className="acn-vg-passo" icone={mdiArrowRight} onClick={() => aoMover(v, proximo)}>{proximo.rotulo}</Botao></span>}
      </div>
    </div>
  );
}

// ── a tela: quadro, lista e busca ────────────────────────────────────────────
const FILTROS_DE_SAIDA = [
  { id: 'todas', rotulo: 'Todas as datas' }, { id: 'atrasadas', rotulo: 'Saída atrasada' }, { id: 'semana', rotulo: 'Saem em 7 dias' }, { id: 'sem_data', rotulo: 'Sem data' },
];

export default function ViagensTab({ currentUser }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState('quadro');
  const [busca, setBusca] = useState('');
  const [saida, setSaida] = useState('todas');
  const [editando, setEditando] = useState<any | null>(null);
  const [frotaAberta, setFrotaAberta] = useState(false);   // o cadastro de frota (fatia 2, 04/11/2026)
  const [soltarEm, setSoltarEm] = useState<string | null>(null);   // a coluna sobre a qual o cartão está sendo arrastado
  const hoje = hojeISO();
  const emAcao = React.useRef(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('viagens').select('*').order('data_saida', { ascending: true, nullsFirst: false }).order('criado_em', { ascending: false });
    if (error) { setErro(error.message); setCarregando(false); return; }   // a lista que já estava na tela fica; a faixa diz o motivo
    setErro(''); setLista(data || []); setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Menções (o aviso de que a viagem espera aprovação), o card do CRM e a licitação abrem a viagem por aqui (04/11/2026): o recado fica em window.__acnDeepLink e o evento cobre a tela já aberta
  useEffect(() => {
    const abrir = async () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'viagem') return;
      (window as any).__acnDeepLink = null;
      const { data, error } = await supabase.from('viagens').select('*').eq('id', pend.contextoId).maybeSingle();
      if (data) setEditando(data); else mostrarAviso('Não foi possível abrir a viagem: ' + (error?.message || 'ela não foi encontrada (pode ter sido apagada).'));
    };
    abrir();
    window.addEventListener('acn:abrir-registro', abrir);
    return () => window.removeEventListener('acn:abrir-registro', abrir);
  }, []);

  const passaNaSaida = (v: any) => {
    if (saida === 'todas') return true;
    if (saida === 'sem_data') return !v.data_saida;
    if (saida === 'atrasadas') return saidaAtrasada(v, hoje);
    const d = diasParaSair(v, hoje);
    return d !== null && d >= 0 && d <= 7 && !['andamento', 'finalizada', 'nao_aprovada'].includes(statusDaViagem(v));
  };
  const visiveis = useMemo(() => lista.filter(v => combinaBusca(textoParaBusca(v), busca) && passaNaSaida(v)), [lista, busca, saida, hoje]);
  const contagemSaida = (id: string) => lista.filter(v => combinaBusca(textoParaBusca(v), busca) && (id === 'todas' ? true : id === 'sem_data' ? !v.data_saida : id === 'atrasadas' ? saidaAtrasada(v, hoje)
    : (() => { const d = diasParaSair(v, hoje); return d !== null && d >= 0 && d <= 7 && !['andamento', 'finalizada', 'nao_aprovada'].includes(statusDaViagem(v)); })())).length;

  const mover = async (v: any, m: Movimento) => {
    if (emAcao.current) return;
    emAcao.current = true;
    try { if (await moverViagem(v, m, currentUser)) await carregar(); } finally { emAcao.current = false; }
  };
  const soltar = (e: React.DragEvent, colunaId: string) => {
    e.preventDefault(); setSoltarEm(null);
    const v = lista.find(x => x.id === e.dataTransfer.getData('text/plain'));
    if (!v) return;
    const { movimento, porque } = movimentoParaAColuna(v, colunaId, currentUser);
    if (movimento) mover(v, movimento);
    else if (porque) mostrarAviso(porque, 'atencao');
  };

  return (
    <div className="acn-vg">
      <CabecalhoTela titulo="Viagens" subtitulo="Do roteiro e orçamento à volta da equipe: cada viagem anda pelo quadro"
        acoes={permissoesDaViagem(currentUser).base ? (
          <>
            <Botao icone={mdiCarOutline} onClick={() => setFrotaAberta(true)}>Frota</Botao>
            <Botao variante="primario" icone={mdiPlus} onClick={() => setEditando(viagemVazia())}>Nova viagem</Botao>
          </>
        ) : undefined} />
      {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as viagens ({erro}).</Faixa>}
      <div className="acn-vg-barra">
        <Chips ativo={visao} onChange={setVisao} rotulo="Forma de ver" itens={[{ id: 'quadro', rotulo: 'Quadro' }, { id: 'lista', rotulo: 'Lista' }, { id: 'custos', rotulo: 'Custos' }]} />
        {visao !== 'custos' && <Chips ativo={saida} onChange={setSaida} rotulo="Data de saída" itens={FILTROS_DE_SAIDA.map(f => ({ id: f.id, rotulo: `${f.rotulo} (${contagemSaida(f.id)})` }))} />}
        {visao !== 'custos' && <label className="acn-vg-pesquisa">
          <Icone path={mdiMagnify} size={16} />
          <input className="acn-input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar título, cidade, OP/PV ou quem criou" aria-label="Buscar viagem" />
        </label>}
      </div>
      {carregando && !lista.length && <div className="acn-ajuda">Carregando viagens…</div>}
      {visao !== 'custos' && !carregando && !erro && !lista.length && <div className="acn-ajuda">Nenhuma viagem ainda. Use "Nova viagem" para montar o roteiro e o orçamento.</div>}
      {visao !== 'custos' && !carregando && !erro && lista.length > 0 && !visiveis.length && <div className="acn-ajuda">Nenhuma viagem com essa busca ou filtro.</div>}

      {visao === 'custos' ? <RelatorioDeCustos viagens={lista} aoAbrir={setEditando} /> : visao === 'quadro' ? (
        <div className="acn-vg-quadro">
          {COLUNAS_VIAGEM.map(col => {
            const cartoes = visiveis.filter(v => statusDaViagem(v) === col.id);
            return (
              <section key={col.id} className={'acn-vg-col' + (soltarEm === col.id ? ' acn-vg-col-alvo' : '')} data-coluna={col.id}
                onDragOver={e => { e.preventDefault(); if (soltarEm !== col.id) setSoltarEm(col.id); }} onDragLeave={() => setSoltarEm(null)} onDrop={e => soltar(e, col.id)}>
                <header className="acn-vg-col-cab" title={col.ajuda}><span>{col.rotulo}</span><em>{cartoes.length}</em></header>
                <div className="acn-vg-col-corpo">
                  {cartoes.length === 0 ? <div className="acn-vg-col-vazia">Nenhuma</div>
                    : cartoes.map(v => <CartaoDaViagem key={v.id} v={v} hoje={hoje} currentUser={currentUser} aoAbrir={setEditando} aoMover={mover} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="acn-vg-tabela-caixa">
          <table className="acn-tabela">
            <thead><tr><th>Viagem</th><th>Etapa</th><th>Saída</th><th>Roteiro</th><th>Veículo</th><th className="dir">Dias</th><th className="dir">Distância</th><th className="dir">Orçamento</th><th>Ligada a</th><th /></tr></thead>
            <tbody>
              {visiveis.map(v => {
                const col = colunaDaViagem(v);
                const recado = recadoDaSaida(v, hoje);
                const r = v.rota ? calcularViagem(v) : null;
                return (
                  <tr key={v.id} className="acn-vg-linha-tab" onClick={() => setEditando(v)}>
                    <td><strong>{v.titulo}</strong></td>
                    <td><Selo familia={col.familia} ponto={false}>{col.rotulo}</Selo></td>
                    <td className={recado?.atraso ? 'acn-vg-atrasado' : ''}>{diaBR(v.data_saida)}{recado ? <div className="acn-ajuda">{recado.texto}</div> : null}</td>
                    <td className="acn-vg-card-rota">{resumoRoteiro(v) || '—'}</td>
                    <td>{v.veiculo_nome ? <>{v.veiculo_nome}{v.veiculo_placa ? <div className="acn-ajuda">{v.veiculo_placa}</div> : null}</> : '—'}</td>
                    <td className="dir acn-num">{r && r.dias > 0 ? r.dias : '—'}</td>
                    <td className="dir acn-num">{v.km_total != null ? fmtKm(v.km_total) : '—'}</td>
                    <td className="dir acn-num">{v.total_orcamento != null && Number(v.total_orcamento) > 0 ? fmtReais(v.total_orcamento) : '—'}</td>
                    <td>{v.vinculo || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <MenuAcoes itens={[
                        { rotulo: 'Abrir a viagem', icone: mdiOpenInNew, onClick: () => setEditando(v) },
                        ...movimentosDaViagem(v, currentUser).map(m => ({ rotulo: m.rotulo, onClick: () => mover(v, m), perigo: m.perigo, grupo: 'Passar para' })),
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {frotaAberta && <FrotaModal currentUser={currentUser} aoFechar={() => setFrotaAberta(false)} aoMudar={() => {}} />}
      {editando && <EditorDeViagem key={editando.id || 'nova'} inicial={editando} currentUser={currentUser} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); carregar(); }} />}
    </div>
  );
}
