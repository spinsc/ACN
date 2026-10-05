// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONTROLE DE USO DO CENTRO DE CUSTO (Etapa 15c do ux-fluxo, 05/10/2026)
//
// Três peças, todas decididas com o usuário nas respostas às 6 perguntas (quadro da Etapa 15 do PLANO_UX_FLUXO_TRABALHO.md):
//  1. REGRA "centro obrigatório na solicitação de compra" — liga e desliga (guardada em configuracoes_sistema); começa
//     DESLIGADA, até a limpeza das compras que ficaram sem centro. Ligada, a solicitação (a única, SolicitacaoCompra.tsx) exige o centro.
//  2. AVISO DE SALDO ao escolher o centro — "este centro já usou 92% do orçamento do mês". Só avisa, nunca bloqueia.
//  3. TELA "Compras sem centro" — lista as compras sem centro vinculado, sugere o centro quando o código está escrito no texto,
//     deixa escolher por linha ou "aplicar às selecionadas" e só grava depois de uma CONFERÊNCIA (a gravação é a função do banco
//     aplicar_centro_em_compras: não sobrescreve quem já ganhou centro, não zera o relógio de "compra parada" e registra o histórico).
// Visão por gestor (cada responsável vê só os seus centros) está FORA da etapa por decisão dele.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import Icone from './Icone';
import { logChange } from './AuditSystem';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Selo, Faixa, diaBR } from './Interface';
import { combinaBusca } from './SearchUtils';
import { ehAdminOuGerente } from './utils/permissoes';
import { centrosParaApontar, centroDisponivel, motivoBloqueio, fetchCentrosCusto } from './CentroCustoShared';
import { carregarMovimentosCentros, carregarOrcamentoDoAno, normalizarMovimentos, calcularCentro, somarPeriodo, faixaDoConsumo } from './CentroCustoPainel';
import { lerFechamentos, fechamentoVigente, conferirMesesAbertos, mesDaCompra } from './CentroCustoFechamento';
import { mdiMagnify, mdiRefresh } from '@mdi/js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const reais = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const primeiraLinha = (t: any) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';

// ─── 1) A REGRA ───────────────────────────────────────────────────────────────
export const CHAVE_CENTRO_OBRIGATORIO = 'centro_custo_obrigatorio_compra';
export const MSG_CENTRO_OBRIGATORIO = 'Informe o centro de custo: o sistema está configurado para exigi-lo em toda solicitação de compra.';
let cacheObrigatorio: { valor: boolean; quando: number } | null = null;

/** A regra está ligada? Lida do banco (guardada por 30 s). Leitura que falha NÃO liga a regra: uma configuração ilegível não pode impedir o trabalho. */
export async function lerCentroObrigatorio(forcar = false): Promise<boolean> {
  if (!forcar && cacheObrigatorio && Date.now() - cacheObrigatorio.quando < 30000) return cacheObrigatorio.valor;
  const { data, error } = await supabase.from('configuracoes_sistema').select('valor').eq('chave', CHAVE_CENTRO_OBRIGATORIO).maybeSingle();
  const valor = !error && String(data?.valor ?? '').toLowerCase() === 'true';
  cacheObrigatorio = { valor, quando: Date.now() };
  return valor;
}

export async function gravarCentroObrigatorio(valor: boolean, usuario: any) {
  const { error } = await supabase.from('configuracoes_sistema').upsert({
    chave: CHAVE_CENTRO_OBRIGATORIO, valor: valor ? 'true' : 'false',
    descricao: 'Exigir o centro de custo ao solicitar uma compra (Etapa 15c dos centros de custo)',
    atualizado_por: usuario?.email || null, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'chave' });
  if (!error) cacheObrigatorio = { valor, quando: Date.now() };
  return { error };
}

export function useCentroObrigatorio(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => { let vivo = true; lerCentroObrigatorio().then(x => { if (vivo) setV(x); }); return () => { vivo = false; }; }, []);
  return v;
}

// ─── 2) O AVISO DE SALDO ──────────────────────────────────────────────────────
// Lê centros, compras, despesas e orçamento uma vez por minuto (a janela de solicitação troca de centro várias vezes).
let cacheContas: { quando: number; dados: any } | null = null;
async function carregarContas() {
  if (cacheContas && Date.now() - cacheContas.quando < 60000) return cacheContas.dados;
  const ano = new Date().getFullYear();
  const [centros, mov, orcLinhas] = await Promise.all([fetchCentrosCusto(true), carregarMovimentosCentros(), carregarOrcamentoDoAno(ano)]);
  const dados = { centros, itens: normalizarMovimentos(mov), orcLinhas, ano };
  cacheContas = { quando: Date.now(), dados };
  return dados;
}

/** Faixa de aviso sob o seletor de centro. SÓ AVISA: a compra segue normalmente. Sem orçamento, abaixo de 80% ou com leitura falhando: não mostra nada. */
export function AvisoSaldoCentro({ centroId }: { centroId: string | null }) {
  const [aviso, setAviso] = useState<any>(null);
  useEffect(() => {
    let vivo = true;
    setAviso(null);
    if (!centroId) return;
    carregarContas().then(({ centros, itens, orcLinhas, ano }) => {
      const centro = centros.find((c: any) => c.id === centroId);
      if (!centro || !vivo) return;
      const mes = new Date().getMonth() + 1;
      const { meses } = calcularCentro({ centro, centros, itens, orcLinhas, ano });
      const sMes = somarPeriodo(meses, mes), sAno = somarPeriodo(meses, 0);
      setAviso({ centro, mes, sMes, sAno, fMes: faixaDoConsumo(sMes.usado, sMes.orcado), fAno: faixaDoConsumo(sAno.usado, sAno.orcado) });
    }).catch(() => { /* aviso é cortesia: se a leitura falhar, a solicitação segue sem ele */ });
    return () => { vivo = false; };
  }, [centroId]);
  if (!aviso) return null;
  const { sMes, sAno, fMes, fAno, mes, centro } = aviso;
  const linhas: any[] = [];
  if (fMes === 'estouro') linhas.push({ tom: 'erro', t: `${centro.codigo} já passou do orçamento de ${MESES[mes - 1]}: ${reais(sMes.usado)} de ${reais(sMes.orcado)} (${sMes.pct}%).` });
  else if (fMes === 'atencao') linhas.push({ tom: 'atencao', t: `${centro.codigo} já usou ${sMes.pct}% do orçamento de ${MESES[mes - 1]}: ${reais(sMes.usado)} de ${reais(sMes.orcado)}.` });
  if (fAno === 'estouro') linhas.push({ tom: 'erro', t: `No ano, ${centro.codigo} já passou do orçamento: ${reais(sAno.usado)} de ${reais(sAno.orcado)} (${sAno.pct}%).` });
  else if (fAno === 'atencao') linhas.push({ tom: 'atencao', t: `No ano, ${centro.codigo} já usou ${sAno.pct}% do orçamento: ${reais(sAno.usado)} de ${reais(sAno.orcado)}.` });
  if (!linhas.length) return null;
  return (
    <div className="acn-cc-aviso-saldo" role="status">
      {linhas.map((l, i) => <Faixa key={i} tom={l.tom}>{l.t} Só um aviso: a compra pode seguir normalmente.</Faixa>)}
    </div>
  );
}

// ─── 3) COMPRAS SEM CENTRO ────────────────────────────────────────────────────
const escaparRegex = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Procura, no texto que ficou na compra, o CÓDIGO de um centro (ou o código que ele tinha antes da renumeração). "PROD-007.01" ganha de
 * "PROD-007" (o código maior é testado primeiro e o menor não casa quando vem ".NN" depois). Só sugere centro que pode receber lançamento.
 */
export function sugerirCentroPeloTexto(texto: any, centros: any[]) {
  const t = String(texto || '').toUpperCase();
  if (!t.trim()) return null;
  const candidatos: Array<{ centro: any; codigo: string }> = [];
  for (const c of centros) {
    if (!centroDisponivel(c)) continue;
    if (c.codigo) candidatos.push({ centro: c, codigo: String(c.codigo).toUpperCase() });
    if (c.codigo_anterior) candidatos.push({ centro: c, codigo: String(c.codigo_anterior).toUpperCase() });
  }
  candidatos.sort((a, b) => b.codigo.length - a.codigo.length);
  for (const { centro, codigo } of candidatos) {
    if (new RegExp('(^|[^A-Z0-9.\\-])' + escaparRegex(codigo) + '(?![A-Z0-9\\-]|\\.[0-9])').test(t)) return centro;
  }
  return null;
}

/** Quantas compras estão sem centro vinculado (as descartadas não contam). Devolve null se a leitura falhar. */
export async function contarComprasSemCentro(): Promise<number | null> {
  const { count, error } = await supabase.from('pcp_pedidos_compra').select('id', { count: 'exact', head: true }).is('centro_custo_id', null).neq('status_compra', 'Descartada');
  return error ? null : (count ?? 0);
}

const FAMILIA_COMPRA: Record<string, string> = { 'Pendente': 'atencao', 'Em Andamento': 'info', 'Aguardando Aprovação': 'marca', 'Aprovado': 'info', 'Comprado': 'ok', 'Recebido': 'ok' };

export function ModalComprasSemCentro({ currentUser, onClose, onGravou }: any) {
  const [compras, setCompras] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});      // pedido → centro escolhido
  const [sugeridos, setSugeridos] = useState<Record<string, boolean>>({});   // pedido → a escolha veio da sugestão pelo texto
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [centroLote, setCentroLote] = useState('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Etapa 15e-2 (05/10/2026): compra criada num mês FECHADO não recebe centro por aqui (mudaria o centro de um mês já fechado). O Admin reabre o mês se precisar.
  const [fechamentos, setFechamentos] = useState<any[]>([]);
  const escolhasRef = useRef<Record<string, string>>({});
  const sugeridosRef = useRef<Record<string, boolean>>({});
  escolhasRef.current = escolhas; sugeridosRef.current = sugeridos;

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const [c, k] = await Promise.all([
      supabase.from('pcp_pedidos_compra').select('id,numero_pedido,descricao_material,fornecedor,status_compra,valor_compra,data_criacao,centro_custo,criado_por_nome')
        .is('centro_custo_id', null).neq('status_compra', 'Descartada').order('data_criacao', { ascending: true }),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('codigo'),
    ]);
    const falha = c.error || k.error;
    if (falha) { setErro(falha.message); setCarregando(false); return; }
    setCompras(c.data || []); setCentros(k.data || []);
    try { setFechamentos(await lerFechamentos()); } catch (_) { setFechamentos([]); } // se não ler, a conferência na hora de gravar barra do mesmo jeito
    // o que a pessoa já escolheu e continua sem centro fica; o resto recebe a sugestão pelo texto (nada é gravado por isso).
    // As duas marcas são calculadas FORA de uma função de atualização de estado (dentro dela o React perdia a de "sugerido").
    const prev = escolhasRef.current; const prevSug = sugeridosRef.current;
    const novo: Record<string, string> = {}; const sug: Record<string, boolean> = {};
    for (const p of c.data || []) {
      if (prev[p.id]) { novo[p.id] = prev[p.id]; if (prevSug[p.id]) sug[p.id] = true; continue; }
      const s = sugerirCentroPeloTexto(p.centro_custo, k.data || []);
      if (s) { novo[p.id] = s.id; sug[p.id] = true; }
    }
    setEscolhas(novo); setSugeridos(sug);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const arvore = useMemo(() => centrosParaApontar(centros, null), [centros]);
  const centroPorId = useMemo(() => Object.fromEntries(centros.map(c => [c.id, c])), [centros]);
  const rotuloCentro = (id: string) => { const c = centroPorId[id]; return c ? `${c.codigo} — ${c.nome}` : '?'; };
  const visiveis = compras.filter(p => !busca.trim() || combinaBusca(`${p.numero_pedido} ${p.descricao_material} ${p.fornecedor || ''} ${p.centro_custo || ''} ${p.status_compra}`, busca));
  const fechadaPorId: Record<string, boolean> = useMemo(() => Object.fromEntries(compras.map(p => [p.id, !!fechamentoVigente(fechamentos, mesDaCompra(p))])), [compras, fechamentos]);
  const nFechadas = compras.filter(p => fechadaPorId[p.id]).length;
  const comEscolha = compras.filter(p => escolhas[p.id] && !fechadaPorId[p.id]);
  const nMarcadas = visiveis.filter(p => marcadas[p.id] && !fechadaPorId[p.id]).length;
  // mesma regra de quem corrige o centro de uma compra no Financeiro (podeEditarLancamento): Admin e gerentes
  const podeGravar = ehAdminOuGerente(currentUser);

  const escolher = (id: string, centroId: string) => {
    setEscolhas(e => { const n = { ...e }; if (centroId) n[id] = centroId; else delete n[id]; return n; });
    setSugeridos(s => { const n = { ...s }; delete n[id]; return n; });
  };
  const aplicarAsMarcadas = () => {
    if (!centroLote) { setAviso('Escolha o centro que vai para as compras marcadas.'); return; }
    const ids = visiveis.filter(p => marcadas[p.id] && !fechadaPorId[p.id]).map(p => p.id);
    if (!ids.length) { setAviso('Marque as compras que recebem esse centro (as de mês fechado não entram).'); return; }
    setAviso('');
    setEscolhas(e => { const n = { ...e }; ids.forEach(id => { n[id] = centroLote; }); return n; });
    setSugeridos(s => { const n = { ...s }; ids.forEach(id => delete n[id]); return n; });
  };
  const marcarTodas = (v: boolean) => setMarcadas(Object.fromEntries(visiveis.map(p => [p.id, v])));

  const gravar = async () => {
    const itens = comEscolha.map(p => ({ pedido_id: p.id, centro_id: escolhas[p.id] }));
    if (!itens.length) { setAviso('Escolha o centro de pelo menos uma compra.'); return; }
    // a conferência de verdade é no banco, agora: o mês pode ter sido fechado depois que a lista foi lida
    const trava = await conferirMesesAbertos(comEscolha.map(p => mesDaCompra(p)));
    if (!trava.ok) { setErro(trava.mensagem + ' Atualize a lista: as compras desse mês saem do lote.'); try { setFechamentos(await lerFechamentos()); } catch (_) { /* a conferência acima já barrou */ } return; }
    // CONFERÊNCIA antes de gravar: a pessoa vê cada compra e o centro que vai receber
    const linhas = comEscolha.slice(0, 15).map(p => `${p.numero_pedido}  →  ${rotuloCentro(escolhas[p.id])}`);
    const mais = comEscolha.length > 15 ? `\n… e mais ${comEscolha.length - 15} compra(s)` : '';
    if (!await confirmar(`Gravar o centro de custo em ${itens.length} compra(s)?\n${linhas.join('\n')}${mais}\n\nSó entram as compras que ainda estão sem centro; a que já ganhou um centro não é alterada.`)) return;
    setSalvando(true); setErro(''); setAviso('');
    const { data: r, error } = await supabase.rpc('aplicar_centro_em_compras', { p_itens: itens, p_usuario_email: currentUser?.email || null, p_usuario_nome: currentUser?.nome || null });
    setSalvando(false);
    if (error) { setErro('Nada foi gravado: ' + error.message); return; }
    const antes = compras;
    mostrarAviso(`Centro de custo gravado em ${r?.aplicados ?? 0} compra(s).${r?.ja_tinham_centro ? ` ${r.ja_tinham_centro} já tinha(m) centro e não foi(ram) alterada(s).` : ''}`, r?.aplicados ? 'ok' : 'atencao');
    // histórico de alterações do sistema: as compras que saíram da lista foram as gravadas
    const idsGravados = new Set(itens.map(i => i.pedido_id));
    const { data: restantes } = await supabase.from('pcp_pedidos_compra').select('id').is('centro_custo_id', null).in('id', [...idsGravados]);
    const aindaSem = new Set((restantes || []).map((x: any) => x.id));
    for (const p of antes) {
      if (!idsGravados.has(p.id) || aindaSem.has(p.id)) continue;
      logChange({ module: 'compras', entityType: 'pcp_pedidos_compra', entityId: p.id, changeType: 'UPDATE', oldRow: { centro_custo: p.centro_custo ?? null, centro_custo_vinculado: null }, newRow: { centro_custo: rotuloCentro(escolhas[p.id]), centro_custo_vinculado: rotuloCentro(escolhas[p.id]) }, user: currentUser });
      // (o texto antigo pode já ser igual ao novo — ex.: "ADM-001 — …" — e mesmo assim a compra ganhou o VÍNCULO: por isso o campo extra)
    }
    setEscolhas({}); setSugeridos({}); setMarcadas({});
    await carregar();
    onGravou?.();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cc-sem" role="dialog" aria-label="Compras sem centro de custo">
        <div className="acn-modal-cab"><span className="modal-title">Compras sem centro de custo</span></div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">
            Compras que não estão ligadas a nenhum centro (as descartadas ficam de fora). Escolha o centro de cada uma — ou marque várias e use
            <strong> Aplicar às marcadas</strong> — e depois <strong>Conferir e gravar</strong>: você vê o que vai ser gravado antes. Quando o código do centro
            está escrito no texto da compra, ele já vem sugerido. Nada é gravado até você confirmar.
          </div>
          {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>{erro}</Faixa>}
          {aviso && <Faixa tom="atencao">{aviso}</Faixa>}
          {!podeGravar && <Faixa tom="info">Só Admin e gerentes gravam o centro das compras; você pode olhar a lista.</Faixa>}
          {nFechadas > 0 && <Faixa tom="info">{nFechadas} compra(s) são de mês fechado e não recebem centro por aqui (ficam fora do lote). Para dar centro a elas, o Admin reabre o mês em Financeiro › Fechamento do mês.</Faixa>}

          {carregando && !compras.length ? <div className="acn-empty">Carregando…</div>
            : !erro && compras.length === 0 ? <div className="acn-empty">Nenhuma compra sem centro. Tudo está vinculado a um centro de custo.</div>
            : (<>
              <div className="acn-ms-filtros">
                <label className="acn-ms-busca">
                  <Icone path={mdiMagnify} size={16} />
                  <input className="acn-input" placeholder="Buscar por pedido, material, fornecedor…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar compra" />
                </label>
                <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando || salvando}>Atualizar</Botao>
              </div>
              <div className="acn-cc-sem-lote">
                <span className="acn-label">Para as marcadas:</span>
                <select className="acn-input acn-cc-filtro" value={centroLote} onChange={e => setCentroLote(e.target.value)} aria-label="Centro para as compras marcadas">
                  <option value="">— escolher o centro —</option>
                  {arvore.map(c => <option key={c.id} value={c.id} disabled={c.bloqueado}>{'　'.repeat(c.nivel)}{c.nivel > 0 ? '└ ' : ''}{c.codigo} — {c.nome}{c.bloqueado ? ` (${motivoBloqueio(c)})` : ''}</option>)}
                </select>
                <Botao pequeno onClick={aplicarAsMarcadas} disabled={!podeGravar}>Aplicar às marcadas ({nMarcadas})</Botao>
              </div>
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr>
                    <th><input type="checkbox" aria-label="Marcar todas" checked={visiveis.length > 0 && visiveis.every(p => marcadas[p.id])} onChange={e => marcarTodas(e.target.checked)} /></th>
                    <th>Pedido</th><th>Material</th><th>Situação</th><th>Valor</th><th>Texto antigo</th><th>Centro a gravar</th>
                  </tr></thead>
                  <tbody>
                    {visiveis.map(p => (
                      <tr key={p.id}>
                        <td><input type="checkbox" aria-label={`Marcar ${p.numero_pedido}`} checked={!!marcadas[p.id]} onChange={e => setMarcadas(m => ({ ...m, [p.id]: e.target.checked }))} /></td>
                        <td className="acn-nowrap"><strong className="acn-forte">{p.numero_pedido}</strong><div className="acn-fraco">{diaBR(p.data_criacao)}</div></td>
                        <td className="acn-texto-longo">{primeiraLinha(p.descricao_material) || '—'}{p.fornecedor && <div className="acn-fraco">{p.fornecedor}</div>}</td>
                        <td><Selo familia={FAMILIA_COMPRA[p.status_compra] || 'neutro'}>{p.status_compra}</Selo></td>
                        <td className="acn-nowrap">{p.valor_compra ? reais(p.valor_compra) : <span className="acn-fraco">—</span>}</td>
                        <td className="acn-texto-longo">{p.centro_custo ? <span title="O que estava escrito no campo antigo de centro de custo">{p.centro_custo}</span> : <span className="acn-fraco">—</span>}</td>
                        <td>
                          {fechadaPorId[p.id] && <div><Selo familia="info" ponto={false} title="O mês desta compra está fechado">mês fechado</Selo></div>}
                          <select className="acn-input acn-cc-sem-sel" value={escolhas[p.id] || ''} onChange={e => escolher(p.id, e.target.value)} disabled={!podeGravar || fechadaPorId[p.id]} aria-label={`Centro de ${p.numero_pedido}`}>
                            <option value="">— escolher —</option>
                            {centrosParaApontar(centros, escolhas[p.id] || null).map(c => <option key={c.id} value={c.id} disabled={c.bloqueado}>{'　'.repeat(c.nivel)}{c.nivel > 0 ? '└ ' : ''}{c.codigo} — {c.nome}{c.bloqueado ? ` (${motivoBloqueio(c)})` : ''}</option>)}
                          </select>
                          {sugeridos[p.id] && <div><Selo familia="info" ponto={false} title="O código do centro estava escrito no texto da compra">sugerido pelo texto</Selo></div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="acn-ajuda">{compras.length} compra(s) sem centro · {comEscolha.length} com centro escolhido para gravar.</div>
            </>)}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={gravar} disabled={salvando || !podeGravar || comEscolha.length === 0}>{salvando ? 'Gravando…' : `Conferir e gravar (${comEscolha.length})`}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
