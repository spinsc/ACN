// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import * as XLSX from 'xlsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIAS_DEFAULT = [
  'Kit Instalação', 'Adaptação Veicular', 'Rastreamento', 'Comunicação',
  'Segurança', 'Câmera', 'Elétrico', 'Mecânico', 'Acessório', 'Serviço', 'Outro',
];

function fmtR(v: number) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number) {
  return `${Number(v || 0).toFixed(1)}%`;
}

/** Calcula custo total e preço de venda estimado do produto a partir do BOM */
function calcProduto(linhas: any[], markup_pct: number, difal_pct: number, imposto_pct: number, custo_fixo_pct: number) {
  const custoTotal = linhas.reduce((acc, l) => {
    const item = l._item || {};
    const qt   = Number(l.quantidade) || 1;
    const cu   = Number(item.custo_unit) || 0;
    // aplica IPI e ST do item
    const cu_c = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
    return acc + cu_c * qt;
  }, 0);

  const mk  = 1 - (Number(markup_pct) || 0) / 100;
  const di  = 1 + (Number(difal_pct) || 0) / 100;
  const imp = 1 - (Number(imposto_pct) || 0) / 100;
  const cf  = 1 - (Number(custo_fixo_pct) || 0) / 100;
  const precoVenda = (mk > 0 && imp > 0 && cf > 0)
    ? (custoTotal * di) / (mk * imp * cf)
    : 0;

  return { custoTotal, precoVenda };
}

// ─── Buscador de itens do catálogo ───────────────────────────────────────────
function ItemBuscador({ onSelect, excluirIds = [] }: { onSelect: (item: any) => void; excluirIds?: string[] }) {
  const [q, setQ]           = useState('');
  const [itens, setItens]   = useState<any[]>([]);
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setItens([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('cadastro_itens')
        .select('id, codigo, nome, marca, fornecedor, unidade, custo_unit, ipi_pct, st_pct, moeda')
        .eq('ativo', true)
        .ilike('nome', `%${q}%`)
        .limit(20);
      setItens((data || []).filter(i => !excluirIds.includes(i.id)));
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="🔍 Buscar item do catálogo para adicionar..."
        style={{
          width: '100%', padding: '6px 9px', border: '1px solid #d1d5db',
          borderRadius: 5, fontSize: 11, color: '#374151', boxSizing: 'border-box',
        }}
        onFocus={() => { if (itens.length) setOpen(true); }}
      />
      {open && itens.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 240, overflowY: 'auto',
        }}>
          {itens.map(it => (
            <div
              key={it.id}
              onClick={() => { onSelect(it); setQ(''); setOpen(false); }}
              style={{
                padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                display: 'flex', gap: 8, alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>{it.nome}</div>
                <div style={{ fontSize: 9, color: '#9ca3af' }}>
                  {[it.marca, it.fornecedor].filter(Boolean).join(' · ')} · {it.unidade}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                R$ {Number(it.custo_unit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Adicionar vários itens ao kit ───────────────────────────────────────────
// Kit grande não se monta item por item: aqui dá para marcar vários na busca (por
// código ou nome), colar uma lista de códigos, importar uma planilha ou trazer os
// itens de outro kit já montado. Tudo cai na mesma estrutura (BOM) do produto.
const MODOS_ADICIONAR = [
  { id: 'buscar',   rotulo: '🔍 Buscar e marcar' },
  { id: 'colar',    rotulo: '📋 Colar lista' },
  { id: 'planilha', rotulo: '📥 Planilha' },
  { id: 'kit',      rotulo: '🧩 Outro kit' },
];

// PostgREST usa vírgula e parênteses na sintaxe do filtro: fora do texto buscado
const limparBusca = (v: string) => normalizarBusca(v).replace(/[,()*%\\]/g, ' ').trim();

/** Itens do catálogo pelos códigos informados (em lotes, sem acento e sem caixa) */
async function itensPorCodigo(codigos: string[]) {
  const achados = new Map<string, any>();
  const unicos = [...new Set(codigos.map(c => normalizarBusca(String(c ?? '').trim())).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = unicos.slice(i, i + 150);
    const { data } = await supabase.from('cadastro_itens').select('*').in('codigo_norm', lote);
    (data || []).forEach((it: any) => achados.set(normalizarBusca(String(it.codigo || '').trim()), it));
  }
  return achados;
}

/** "1832" · "1832;2" · "1832 x 3" · "1832<tab>2,5" → { codigo, quantidade } */
function lerLinhaDaLista(linha: string) {
  const m = linha.match(/^(.*?)[\s;,\t]+x?\s*(\d+(?:[.,]\d+)?)$/i);
  if (m && m[1].trim()) return { codigo: m[1].trim(), quantidade: Number(m[2].replace(',', '.')) || 1 };
  return { codigo: linha.trim(), quantidade: 1 };
}

const CABECALHOS_CODIGO = ['codigo', 'código', 'cod', 'item', 'coditem', 'codigo do item', 'código do item'];
const CABECALHOS_QTD = ['quantidade', 'qtd', 'qtde', 'qt', 'quant'];
const CABECALHOS_OBS = ['observacao', 'observação', 'obs', 'observacoes', 'observações'];

function ModalAdicionarItens({ produtoId, onAdicionar, onClose }: any) {
  const [modo, setModo] = useState('buscar');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [marcados, setMarcados] = useState<Record<string, number>>({});
  const [texto, setTexto] = useState('');
  const [produtos, setProdutos] = useState<any[]>([]);
  const [kitSel, setKitSel] = useState('');
  const [processando, setProcessando] = useState(false);
  const [relatorio, setRelatorio] = useState<any>(null);

  // busca por código ou nome, com bem mais resultados que o campo de um item só
  useEffect(() => {
    const alvo = limparBusca(q);
    if (!alvo) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('cadastro_itens')
        .select('id, codigo, nome, marca, fornecedor, unidade, custo_unit, ipi_pct, st_pct, moeda')
        .eq('ativo', true)
        .or(`nome_norm.ilike.%${alvo}%,codigo_norm.ilike.%${alvo}%`)
        .order('nome')
        .limit(200);
      setResultados(data || []);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (modo !== 'kit' || produtos.length) return;
    supabase.from('cadastro_produtos').select('id, codigo, nome, categoria').eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos((data || []).filter((p: any) => p.id !== produtoId)));
  }, [modo, produtoId]);

  const marcar = (item: any) => setMarcados(m => {
    const novo = { ...m };
    if (novo[item.id] != null) delete novo[item.id]; else novo[item.id] = 1;
    return novo;
  });

  const concluir = (itens: any[], naoEncontrados: string[] = []) => {
    const n = onAdicionar(itens);
    setRelatorio({ adicionados: n.novos, somados: n.somados, naoEncontrados });
    setProcessando(false);
  };

  const adicionarMarcados = () => {
    const itens = resultados.filter(r => marcados[r.id] != null)
      .map(r => ({ item: r, quantidade: marcados[r.id] || 1 }));
    if (!itens.length) { alert('Marque pelo menos um item.'); return; }
    setMarcados({});
    concluir(itens);
  };

  const adicionarDaLista = async () => {
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(lerLinhaDaLista);
    if (!linhas.length) { alert('Cole a lista de códigos (um por linha).'); return; }
    setProcessando(true);
    const achados = await itensPorCodigo(linhas.map(l => l.codigo));
    const itens: any[] = [];
    const faltando: string[] = [];
    linhas.forEach(l => {
      const item = achados.get(normalizarBusca(l.codigo));
      if (item) itens.push({ item, quantidade: l.quantidade });
      else faltando.push(l.codigo);
    });
    setTexto('');
    concluir(itens, faltando);
  };

  const importarPlanilha = async (file: File) => {
    setProcessando(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const aba = wb.Sheets[wb.SheetNames[0]];
      const linhas: any[] = aba ? XLSX.utils.sheet_to_json(aba, { defval: '' }) : [];
      if (!linhas.length) { alert('A planilha está vazia.'); setProcessando(false); return; }
      const chaves = Object.keys(linhas[0]);
      const achaCol = (nomes: string[]) => chaves.find(k => nomes.includes(normalizarBusca(k).trim()));
      const colCod = achaCol(CABECALHOS_CODIGO);
      const colQtd = achaCol(CABECALHOS_QTD);
      const colObs = achaCol(CABECALHOS_OBS);
      if (!colCod) {
        alert('A planilha precisa de uma coluna "Código" (aceita também Cod, Item ou CODITEM).');
        setProcessando(false);
        return;
      }
      const pedidos = linhas.map(l => ({
        codigo: String(l[colCod] ?? '').trim(),
        quantidade: Number(String(colQtd ? l[colQtd] : 1).replace(',', '.')) || 1,
        observacoes: colObs ? String(l[colObs] ?? '').trim() : '',
      })).filter(p => p.codigo);
      const achados = await itensPorCodigo(pedidos.map(p => p.codigo));
      const itens: any[] = [];
      const faltando: string[] = [];
      pedidos.forEach(p => {
        const item = achados.get(normalizarBusca(p.codigo));
        if (item) itens.push({ item, quantidade: p.quantidade, observacoes: p.observacoes });
        else faltando.push(p.codigo);
      });
      concluir(itens, faltando);
    } catch (e: any) {
      alert('Não foi possível ler a planilha: ' + e.message);
      setProcessando(false);
    }
  };

  const trazerDoKit = async () => {
    if (!kitSel) { alert('Escolha o kit de onde vêm os itens.'); return; }
    setProcessando(true);
    const { data } = await supabase.from('cadastro_produtos_itens')
      .select('quantidade, observacoes, cadastro_itens(*)')
      .eq('produto_id', kitSel).order('ordem');
    const itens = (data || []).filter((l: any) => l.cadastro_itens)
      .map((l: any) => ({ item: l.cadastro_itens, quantidade: Number(l.quantidade) || 1, observacoes: l.observacoes || '' }));
    if (!itens.length) { alert('Esse kit não tem itens na estrutura.'); setProcessando(false); return; }
    concluir(itens);
  };

  const cx: React.CSSProperties = { width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, boxSizing: 'border-box' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#7c3aed', color: '#fff', padding: '12px 16px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>➕ Adicionar vários itens</div>
            <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 1 }}>Item repetido soma na quantidade que já está no kit</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', flexWrap: 'wrap' }}>
          {MODOS_ADICIONAR.map(m => (
            <button key={m.id} onClick={() => { setModo(m.id); setRelatorio(null); }}
              style={{ padding: '5px 12px', border: '1px solid ' + (modo === m.id ? '#7c3aed' : '#d1d5db'), background: modo === m.id ? '#ede9fe' : '#fff', color: modo === m.id ? '#6d28d9' : '#374151', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              {m.rotulo}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {relatorio && (
            <div style={{ background: relatorio.naoEncontrados.length ? '#fef9c3' : '#dcfce7', border: '1px solid ' + (relatorio.naoEncontrados.length ? '#fde68a' : '#bbf7d0'), borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 10, color: '#374151' }}>
              <div style={{ fontWeight: 700 }}>
                {relatorio.adicionados} item(ns) adicionado(s){relatorio.somados ? ` · ${relatorio.somados} já estavam no kit e tiveram a quantidade somada` : ''}
              </div>
              {relatorio.naoEncontrados.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  Não encontrados no catálogo ({relatorio.naoEncontrados.length}): {relatorio.naoEncontrados.slice(0, 30).join(', ')}
                  {relatorio.naoEncontrados.length > 30 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          {modo === 'buscar' && (
            <div>
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus style={cx}
                placeholder="🔍 Buscar por código ou nome (ex.: 1832, cabo, sirene)" />
              <div style={{ fontSize: 10, color: '#64748b', margin: '6px 0' }}>
                {buscando ? 'Buscando…' : `${resultados.length} item(ns) · ${Object.keys(marcados).length} marcado(s)`}
                {resultados.length === 200 && ' · mostrando os 200 primeiros, refine a busca'}
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 320, overflowY: 'auto' }}>
                {resultados.map(it => {
                  const marcado = marcados[it.id] != null;
                  return (
                    <div key={it.id} onClick={() => marcar(it)}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: marcado ? '#f0fdf4' : '#fff' }}>
                      <input type="checkbox" checked={marcado} onChange={() => marcar(it)} onClick={e => e.stopPropagation()} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{it.nome}</div>
                        <div style={{ fontSize: 9, color: '#9ca3af' }}>{[it.codigo, it.marca, it.unidade].filter(Boolean).join(' · ')}</div>
                      </div>
                      {marcado && (
                        <input type="number" min={0.001} step="0.001" value={marcados[it.id]} onClick={e => e.stopPropagation()}
                          onChange={e => setMarcados(m => ({ ...m, [it.id]: Number(e.target.value) || 1 }))}
                          style={{ width: 62, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 10, textAlign: 'right' }} />
                      )}
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>{fmtR(it.custo_unit)}</div>
                    </div>
                  );
                })}
                {!buscando && !resultados.length && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
                    {q.trim() ? 'Nenhum item encontrado.' : 'Digite parte do código ou do nome do item.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {modo === 'colar' && (
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                Um código por linha. Para informar a quantidade, use espaço, ponto e vírgula ou tabulação: <b>1832 3</b> ou <b>1832;3</b>.
                Também funciona colando duas colunas do Excel.
              </div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={12} autoFocus
                placeholder={'1832\n1827 2\n1828;10'} style={{ ...cx, resize: 'vertical', fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
          )}

          {modo === 'planilha' && (
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
                A planilha precisa de uma coluna <b>Código</b>. As colunas <b>Quantidade</b> e <b>Observação</b> são opcionais.
                Serve Excel (.xlsx, .xls), LibreOffice (.ods) e CSV.
              </div>
              <input type="file" accept=".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) importarPlanilha(f); e.target.value = ''; }}
                style={{ fontSize: 11 }} />
            </div>
          )}

          {modo === 'kit' && (
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                Traz para este kit todos os itens da estrutura de outro produto já montado, com as quantidades dele.
                Os itens passam a fazer parte deste kit: mudanças posteriores no outro kit não vêm junto.
              </div>
              <select value={kitSel} onChange={e => setKitSel(e.target.value)} style={cx}>
                <option value="">Escolha o kit…</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{[p.codigo, p.nome].filter(Boolean).join(' — ')}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fafafa', borderRadius: '0 0 10px 10px' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            Fechar
          </button>
          {modo === 'buscar' && (
            <button onClick={adicionarMarcados} disabled={!Object.keys(marcados).length}
              style={{ padding: '6px 18px', border: 'none', borderRadius: 5, background: Object.keys(marcados).length ? '#7c3aed' : '#9ca3af', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ➕ Adicionar {Object.keys(marcados).length || ''} item(ns)
            </button>
          )}
          {modo === 'colar' && (
            <button onClick={adicionarDaLista} disabled={processando || !texto.trim()}
              style={{ padding: '6px 18px', border: 'none', borderRadius: 5, background: texto.trim() ? '#7c3aed' : '#9ca3af', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {processando ? 'Adicionando…' : '➕ Adicionar lista'}
            </button>
          )}
          {modo === 'kit' && (
            <button onClick={trazerDoKit} disabled={processando || !kitSel}
              style={{ padding: '6px 18px', border: 'none', borderRadius: 5, background: kitSel ? '#7c3aed' : '#9ca3af', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              {processando ? 'Trazendo…' : '🧩 Trazer itens do kit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal de criação/edição de produto ──────────────────────────────────────
function ProdutoModal({ produto, onSave, onClose, currentUser, copiarBomDe }: any) {
  const isEdit = !!produto?.id;

  const [form, setForm] = useState<any>({
    codigo: '', nome: '', descricao: '', categoria: '', unidade: 'UN', ncm: '',
    markup_pct: 100, custo_fixo_pct: 3, imposto_pct: 16, difal_pct: 0,
    garantia_meses: 12,
    preco_manual: false, preco_venda: 0, observacoes: '', ativo: true,
    // campo nulo no banco vira texto vazio: input controlado não aceita null
    ...Object.fromEntries(Object.entries(produto || {}).map(([k, v]) => [k, v ?? ''])),
  });
  const [linhas, setLinhas]       = useState<any[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [loadingBom, setLoadingBom] = useState(false);
  const [adicionarVarios, setAdicionarVarios] = useState(false);
  // Fotos e catálogo
  const [fotos, setFotos]         = useState<string[]>(produto?.fotos || []);
  const [catalogoUrl, setCatalogoUrl] = useState<string>(produto?.catalogo_url || '');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCatalogo, setUploadingCatalogo] = useState(false);

  // ID pré-gerado para novos produtos (permite upload antes do save)
  const [produtoIdLocal] = useState<string>(() => produto?.id || crypto.randomUUID());

  const uploadFoto = async (file: File) => {
    setUploadingFoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `produtos/${produtoIdLocal}/fotos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: false });
    if (!error) {
      const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
      setFotos(prev => [...prev, urlData.publicUrl]);
    } else {
      alert('Erro ao enviar foto: ' + error.message);
    }
    setUploadingFoto(false);
  };

  const removeFoto = (idx: number) => setFotos(prev => prev.filter((_, i) => i !== idx));

  const uploadCatalogo = async (file: File) => {
    setUploadingCatalogo(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `produtos/${produtoIdLocal}/catalogo/catalogo.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
      setCatalogoUrl(urlData.publicUrl);
    } else {
      alert('Erro ao enviar catálogo: ' + error.message);
    }
    setUploadingCatalogo(false);
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Carrega o BOM ao editar — e também ao duplicar, copiando a estrutura do outro kit
  const idDoBom = produto?.id || copiarBomDe;
  useEffect(() => {
    if (!idDoBom) return;
    setLoadingBom(true);
    supabase
      .from('cadastro_produtos_itens')
      .select('*, cadastro_itens(*)')
      .eq('produto_id', idDoBom)
      .order('ordem')
      .then(({ data }) => {
        setLinhas((data || []).map(l => ({
          ...l,
          id: produto?.id ? l.id : undefined,
          _tmpId: Math.random().toString(36).slice(2),
          _item: l.cadastro_itens || { nome: l.item_nome, custo_unit: 0 },
        })));
        setLoadingBom(false);
      });
  }, [idDoBom]);

  // Um item ou uma leva inteira. Item que já está no kit soma na quantidade,
  // em vez de virar linha repetida.
  const adicionarItens = (novos: any[]) => {
    const resumo = { novos: 0, somados: 0 };
    setLinhas(prev => {
      const lista = [...prev];
      novos.forEach(({ item, quantidade, observacoes }) => {
        if (!item?.id) return;
        const qt = Number(quantidade) || 1;
        const i = lista.findIndex(l => l.item_id === item.id);
        if (i >= 0) {
          lista[i] = { ...lista[i], quantidade: (Number(lista[i].quantidade) || 0) + qt };
          resumo.somados++;
        } else {
          lista.push({
            _tmpId: Math.random().toString(36).slice(2),
            item_id: item.id,
            item_nome: item.nome,
            item_codigo: item.codigo,
            quantidade: qt,
            unidade: item.unidade || 'UN',
            observacoes: observacoes || '',
            ordem: lista.length,
            _item: item,
          });
          resumo.novos++;
        }
      });
      return lista;
    });
    return resumo;
  };
  const addItem = (item: any) => adicionarItens([{ item, quantidade: 1 }]);

  const removeItem = (idx: number) => setLinhas(prev => prev.filter((_, i) => i !== idx));

  const setLinha = (idx: number, k: string, v: any) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));

  const { custoTotal, precoVenda } = calcProduto(
    linhas, form.markup_pct, form.difal_pct, form.imposto_pct, form.custo_fixo_pct,
  );

  const handleSave = async () => {
    if (!form.nome?.trim()) return;
    setSalvando(true);

    const payload: any = {
      codigo:        form.codigo?.trim() || null,
      nome:          form.nome.trim(),
      descricao:     form.descricao?.trim() || null,
      categoria:     form.categoria?.trim() || null,
      unidade:       form.unidade || 'UN',
      ncm:           form.ncm?.trim() || null,
      markup_pct:    Number(form.markup_pct) || 100,
      custo_fixo_pct: Number(form.custo_fixo_pct) || 3,
      imposto_pct:   Number(form.imposto_pct) || 16,
      difal_pct:     Number(form.difal_pct) || 0,   // antes "|| 16" transformava um 0 digitado em 16
      garantia_meses: Number(form.garantia_meses) || 12,
      fotos:         fotos,
      catalogo_url:  catalogoUrl || null,
      preco_manual:  !!form.preco_manual,
      preco_venda:   form.preco_manual ? (Number(form.preco_venda) || 0) : precoVenda,
      observacoes:   form.observacoes?.trim() || null,
      ativo:         form.ativo !== false,
    };

    let produtoId = produtoIdLocal;
    if (isEdit) {
      await supabase.from('cadastro_produtos').update(payload).eq('id', produtoId);
    } else {
      payload.id = produtoIdLocal;
      payload.criado_por = currentUser?.email;
      await supabase.from('cadastro_produtos').insert([payload]);
    }

    if (produtoId) {
      // Recria BOM
      await supabase.from('cadastro_produtos_itens').delete().eq('produto_id', produtoId);
      if (linhas.length > 0) {
        await supabase.from('cadastro_produtos_itens').insert(
          linhas.map((l, idx) => ({
            produto_id:  produtoId,
            item_id:     l.item_id || null,
            item_nome:   l.item_nome,
            item_codigo: l.item_codigo || null,
            quantidade:  Number(l.quantidade) || 1,
            unidade:     l.unidade || 'UN',
            observacoes: l.observacoes || null,
            ordem:       idx,
          }))
        );
      }
    }

    setSalvando(false);
    onSave();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 7px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 11, boxSizing: 'border-box', color: '#374151',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700, color: '#6b7280',
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.4px',
  };


  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: 760, maxWidth: '97vw',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)',
      }}>
        {/* Header */}
        <div style={{
          background: '#7c3aed', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>
              {isEdit ? '✏️ Editar Produto' : '➕ Novo Produto'}
            </div>
            <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 1 }}>
              Produto composto de itens do catálogo (BOM)
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Coluna esquerda — dados do produto */}
          <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 14px 16px', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
              📦 Identificação
            </div>

            {[
              { label: 'CODPRODUTO', k: 'codigo', ph: 'Ex: PROD-001' },
              { label: 'Nome do Produto *', k: 'nome', ph: 'Nome do produto final' },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 8 }}>
                <span style={lbl}>{f.label}</span>
                <input style={{ ...inp, borderColor: f.k === 'nome' && !form.nome ? '#f87171' : '#d1d5db' }}
                  value={form[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.ph} />
              </div>
            ))}

            <div style={{ marginBottom: 8 }}>
              <span style={lbl}>Descrição</span>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 46 }}
                value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Especificações, observações..." />
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={lbl}>Categoria</span>
                <select style={inp} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                  <option value="">— Selecionar —</option>
                  {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 0.6 }}>
                <span style={lbl}>Unidade</span>
                <select style={inp} value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                  {['UN', 'PC', 'KG', 'M', 'KIT', 'JG', 'VB'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={lbl}>NCM</span>
              <input style={inp} value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="0000.00.00" />
            </div>

            <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
              📊 Tributação e Markup
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              {[
                { label: 'Markup (%)', k: 'markup_pct' },
                { label: 'Custo Fixo (%)', k: 'custo_fixo_pct' },
                { label: 'Impostos s/Venda (%)', k: 'imposto_pct' },
                { label: 'DIFAL (%)', k: 'difal_pct' },
              ].map(f => (
                <div key={f.k}>
                  <span style={lbl}>{f.label}</span>
                  <input style={inp} type="number" min={0} max={200} step="0.5"
                    value={form[f.k]} onChange={e => set(f.k, e.target.value)} />
                </div>
              ))}
            </div>

            {/* Garantia */}
            <div style={{ marginBottom: 10 }}>
              <span style={lbl}>🛡️ Garantia Padrão</span>
              <select style={{ ...inp, cursor: 'pointer' }}
                value={form.garantia_meses} onChange={e => set('garantia_meses', Number(e.target.value))}>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
                <option value={24}>24 meses</option>
                <option value={60}>60 meses</option>
              </select>
            </div>

            {/* Resumo financeiro */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6,
              padding: '8px 10px', marginTop: 10,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                💰 Resumo Financeiro
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Custo total BOM:</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#374151' }}>{fmtR(custoTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Itens na estrutura:</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>{linhas.length}</span>
              </div>
              <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Preço venda est.:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#15803d' }}>{fmtR(form.preco_manual ? form.preco_venda : precoVenda)}</span>
              </div>
            </div>

            {/* Preço manual */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 10, color: '#374151' }}>
              <input type="checkbox" checked={form.preco_manual} onChange={e => set('preco_manual', e.target.checked)}
                style={{ accentColor: '#7c3aed', width: 13, height: 13 }} />
              Definir preço de venda manualmente
            </label>
            {form.preco_manual && (
              <div style={{ marginTop: 6 }}>
                <span style={lbl}>Preço de Venda (R$)</span>
                <input style={inp} type="number" min={0} step="0.01"
                  value={form.preco_venda} onChange={e => set('preco_venda', e.target.value)} />
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#374151' }}>
                <input type="checkbox" checked={form.ativo !== false} onChange={e => set('ativo', e.target.checked)}
                  style={{ accentColor: '#0f766e', width: 13, height: 13 }} />
                Produto ativo
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <span style={lbl}>Observações</span>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 40 }}
                value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
                placeholder="Notas adicionais..." />
            </div>

            {/* ── Fotos e Catálogo ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
                📸 Fotos e Catálogo
              </div>

              {/* Fotos */}
              <span style={lbl}>Fotos do Produto</span>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                padding: '6px 9px', border: '1px dashed #c4b5fd', borderRadius: 5,
                cursor: uploadingFoto ? 'wait' : 'pointer', background: '#faf5ff', fontSize: 10, color: '#7c3aed',
              }}>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  disabled={uploadingFoto}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) await uploadFoto(f);
                    e.target.value = '';
                  }} />
                {uploadingFoto ? '⏳ Enviando...' : '📎 Selecionar fotos (múltiplas)'}
              </label>

              {fotos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {fotos.map((url, i) => (
                    <div key={i} style={{ position: 'relative', width: 56, height: 56 }}>
                      <img src={url} alt={`foto-${i}`} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 5, border: '1px solid #d1d5db' }} />
                      <button onClick={() => removeFoto(i)} title="Remover"
                        style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, background: '#ef4444', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 9, cursor: 'pointer', lineHeight: '16px', textAlign: 'center', padding: 0 }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Catálogo PDF */}
              <span style={{ ...lbl, marginTop: 6 }}>Catálogo PDF</span>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 9px', border: '1px dashed #c4b5fd', borderRadius: 5,
                cursor: uploadingCatalogo ? 'wait' : 'pointer', background: '#faf5ff', fontSize: 10, color: '#7c3aed',
              }}>
                <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                  disabled={uploadingCatalogo}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) await uploadCatalogo(f);
                    e.target.value = '';
                  }} />
                {uploadingCatalogo ? '⏳ Enviando...' : '📄 Selecionar PDF'}
              </label>
              {catalogoUrl && (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <a href={catalogoUrl} target="_blank" rel="noreferrer"
                    style={{ color: '#7c3aed', textDecoration: 'underline', flex: 1, wordBreak:'break-word' }}>
                    📄 Ver catálogo
                  </a>
                  <button onClick={() => setCatalogoUrl('')}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita — BOM */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 14px 8px', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3, marginBottom: 10 }}>
                🔩 Estrutura do Produto (BOM — {linhas.length} {linhas.length === 1 ? 'item' : 'itens'})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ItemBuscador onSelect={addItem} />
                <button onClick={() => setAdicionarVarios(true)} title="Buscar e marcar vários, colar lista, importar planilha ou trazer de outro kit"
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 5, background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ➕ Vários itens
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
              {loadingBom ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 11 }}>Carregando estrutura...</div>
              ) : linhas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 11, fontStyle: 'italic', border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
                  Nenhum item na estrutura.<br />
                  <span style={{ fontSize: 10 }}>Busque e adicione itens do catálogo acima.</span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                  <thead>
                    <tr>
                      {['#', 'Item', 'Qtd', 'Un.', 'Custo Unit.', 'Total', 'Obs.', ''].map(h => (
                        <th key={h} style={{ background: '#1e293b', color: '#cbd5e1', padding: '5px 7px', fontSize: 9, fontWeight: 700, textAlign: h === 'Total' || h === 'Custo Unit.' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, idx) => {
                      const item   = l._item || {};
                      const cu     = Number(item.custo_unit) || 0;
                      const cu_c   = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
                      const total  = cu_c * (Number(l.quantidade) || 1);
                      return (
                        <tr key={l._tmpId || l.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '4px 7px', fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, fontWeight: 600 }}>
                            <div>{l.item_nome}</div>
                            {l.item_codigo && <div style={{ fontSize: 8, color: '#9ca3af' }}>{l.item_codigo}</div>}
                          </td>
                          <td style={{ padding: '4px 7px' }}>
                            <input
                              type="number" min={0.001} step="0.001"
                              value={l.quantidade}
                              onChange={e => setLinha(idx, 'quantidade', e.target.value)}
                              style={{ width: 56, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 10, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '4px 7px', fontSize: 10, color: '#6b7280' }}>{l.unidade}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, textAlign: 'right', color: '#374151', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(cu_c)}</td>
                          <td style={{ padding: '4px 7px', fontSize: 10, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(total)}</td>
                          <td style={{ padding: '4px 7px' }}>
                            <input
                              value={l.observacoes || ''}
                              onChange={e => setLinha(idx, 'observacoes', e.target.value)}
                              placeholder="obs."
                              style={{ width: 80, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 9 }}
                            />
                          </td>
                          <td style={{ padding: '4px 7px', textAlign: 'center' }}>
                            <button onClick={() => removeItem(idx)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} style={{ padding: '6px 7px', fontWeight: 700, fontSize: 10, color: '#6b7280', textAlign: 'right', borderTop: '2px solid #e2e8f0' }}>
                        Total custo BOM:
                      </td>
                      <td style={{ padding: '6px 7px', fontWeight: 800, fontSize: 12, color: '#0f766e', textAlign: 'right', borderTop: '2px solid #e2e8f0', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                        {fmtR(custoTotal)}
                      </td>
                      <td colSpan={2} style={{ borderTop: '2px solid #e2e8f0' }} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>

        {adicionarVarios && (
          <ModalAdicionarItens
            produtoId={produto?.id || copiarBomDe}
            onAdicionar={adicionarItens}
            onClose={() => setAdicionarVarios(false)}
          />
        )}

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0, background: '#fafafa', borderRadius: '0 0 10px 10px',
        }}>
          <button onClick={onClose} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151' }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={salvando || !form.nome?.trim()}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 5,
              background: !form.nome?.trim() ? '#9ca3af' : '#7c3aed', color: '#fff',
              cursor: !form.nome?.trim() ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 700, opacity: salvando ? .6 : 1,
            }}
          >
            {salvando ? 'Salvando...' : isEdit ? '💾 Salvar Produto' : '✅ Cadastrar Produto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de visualização de estrutura ──────────────────────────────────────
function BomViewer({ produto, onClose }: any) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('cadastro_produtos_itens')
      .select('*, cadastro_itens(custo_unit, ipi_pct, st_pct)')
      .eq('produto_id', produto.id)
      .order('ordem')
      .then(({ data }) => { setLinhas(data || []); setLoading(false); });
  }, [produto.id]);

  const custoTotal = linhas.reduce((acc, l) => {
    const item = l.cadastro_itens || {};
    const cu   = Number(item.custo_unit) || 0;
    const cu_c = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
    return acc + cu_c * (Number(l.quantidade) || 1);
  }, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 10, width: 560, maxWidth: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#7c3aed', color: '#fff', padding: '10px 14px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🔩 Estrutura: {produto.nome}</div>
            <div style={{ fontSize: 10, color: '#ddd6fe' }}>{produto.categoria} · {produto.unidade}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: 14 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>Carregando...</div>
          ) : linhas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontStyle: 'italic' }}>Nenhum item na estrutura.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'Item', 'Qtd', 'Un.', 'Total', 'Obs.'].map(h => (
                    <th key={h} style={{ background: '#1e293b', color: '#cbd5e1', padding: '5px 8px', fontSize: 9, fontWeight: 700, textAlign: h === 'Total' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const item  = l.cadastro_itens || {};
                  const cu    = Number(item.custo_unit) || 0;
                  const cu_c  = cu * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
                  const total = cu_c * (Number(l.quantidade) || 1);
                  return (
                    <tr key={l.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '4px 8px', fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600 }}>{l.item_nome}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, textAlign: 'right' }}>{l.quantidade}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, color: '#6b7280' }}>{l.unidade}</td>
                      <td style={{ padding: '4px 8px', fontSize: 10, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(total)}</td>
                      <td style={{ padding: '4px 8px', fontSize: 9, color: '#6b7280' }}>{l.observacoes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: '#6b7280', borderTop: '2px solid #e2e8f0' }}>Custo total BOM:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0f766e', borderTop: '2px solid #e2e8f0', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(custoTotal)}</td>
                  <td style={{ borderTop: '2px solid #e2e8f0' }} />
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: '#7c3aed' }}>Preço de venda ({produto.preco_manual ? 'manual' : 'calculado'}):</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#7c3aed', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>{fmtR(produto.preco_venda)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CadastroProdutosTab({ currentUser }: { currentUser: any }) {
  const [produtos, setProdutos]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState('');
  const [filtCat, setFiltCat]         = useState('');
  const [filtAtivo, setFiltAtivo]     = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const [modal, setModal]             = useState<any>(null);
  const [bomView, setBomView]         = useState<any>(null);
  const [duplicarDe, setDuplicarDe]   = useState<string | null>(null);
  const [deletando, setDeletando]     = useState<string | null>(null);
  const [ordenar, setOrdenar]         = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'nome', dir: 'asc' });

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cadastro_produtos')
      .select('*')
      .order(ordenar.col, { ascending: ordenar.dir === 'asc' });
    setProdutos(data || []);
    setLoading(false);
  }, [ordenar]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = produtos.filter(p => {
    if (filtAtivo === 'ativo'   && !p.ativo) return false;
    if (filtAtivo === 'inativo' &&  p.ativo) return false;
    if (filtCat && p.categoria !== filtCat) return false;
    if (busca.trim()) {
      const t = normalizarBusca(busca);
      return normalizarBusca(p.nome).includes(t) || normalizarBusca(p.codigo).includes(t) || normalizarBusca(p.categoria).includes(t);
    }
    return true;
  });

  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort();

  const sortBy = (col: string) =>
    setOrdenar(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

  // Funcao de render (nao componente) - ver mesma correcao em CadastroItensTab.
  const sortIcon = (col: string) =>
    ordenar.col !== col ? <span style={{ opacity: .3 }}>⇅</span> : <span>{ordenar.dir === 'asc' ? '↑' : '↓'}</span>;

  const excluir = async (id: string) => {
    if (!await confirmar('Excluir este produto? A estrutura BOM também será removida.')) return;
    setDeletando(id);
    await supabase.from('cadastro_produtos').delete().eq('id', id);
    setProdutos(prev => prev.filter(p => p.id !== id));
    setDeletando(null);
  };

  const stats = {
    total:  produtos.length,
    ativos: produtos.filter(p => p.ativo).length,
    cats:   new Set(produtos.filter(p => p.categoria).map(p => p.categoria)).size,
  };

  const thStyle: React.CSSProperties = {
    background: '#1e293b', color: '#cbd5e1', padding: '6px 8px',
    fontSize: 9, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', borderRight: '1px solid #334155',
  };
  const tdStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 10 }}>
      {/* Cabeçalho */}
      <div className="acn-quebra" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>🏭 Produto e Mercadorias</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Produtos compostos de itens do catálogo (BOM — Bill of Materials)</div>
        </div>
        <div className="acn-quebra" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {[
            { label: 'Total', value: stats.total, cor: '#7c3aed' },
            { label: 'Ativos', value: stats.ativos, cor: '#16a34a' },
            { label: 'Categorias', value: stats.cats, cor: '#0f766e' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 6, padding: '5px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.cor }}>{s.value}</div>
              <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
          <button
            onClick={() => { setDuplicarDe(null); setModal({}); }}
            style={{ padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
          >
            ➕ Novo Produto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="🔍 Buscar por nome, código, categoria..."
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '5px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}
        />
        <select value={filtCat} onChange={e => setFiltCat(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['todos', 'ativo', 'inativo'] as const).map(v => (
          <button key={v} onClick={() => setFiltAtivo(v)}
            style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: filtAtivo === v ? '#7c3aed' : '#fff', color: filtAtivo === v ? '#fff' : '#374151' }}>
            {v === 'todos' ? 'Todos' : v === 'ativo' ? '✅ Ativos' : '⛔ Inativos'}
          </button>
        ))}
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>{filtrados.length} produto{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>Carregando produtos...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
            {produtos.length === 0
              ? 'Nenhum produto cadastrado. Clique em "Novo Produto" para começar.'
              : 'Nenhum produto encontrado para os filtros aplicados.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => sortBy('codigo')}>Código {sortIcon('codigo')}</th>
                  <th style={thStyle} onClick={() => sortBy('nome')}>Nome do Produto {sortIcon('nome')}</th>
                  <th style={thStyle} onClick={() => sortBy('categoria')}>Categoria {sortIcon('categoria')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Un.</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Custo BOM</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Markup%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => sortBy('preco_venda')}>Preço Venda {sortIcon('preco_venda')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ativo</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p, idx) => (
                  <tr key={p.id} style={{ background: p.ativo ? (idx % 2 === 0 ? '#fff' : '#fafafa') : '#fdf4ff' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", fontSize: 9 }}>{p.codigo || '—'}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 240 }}>
                      <div>{p.nome}</div>
                      {p.descricao && <div style={{ fontSize: 9, color: '#9ca3af', maxWidth: 230, wordBreak:'break-word' }}>{p.descricao}</div>}
                    </td>
                    <td style={tdStyle}>
                      {p.categoria ? (
                        <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{p.categoria}</span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{p.unidade}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#374151', fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace", fontSize: 10 }}>—</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmtPct(p.markup_pct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#0f766e', fontSize: 11, fontFamily: "'ACN Icones', 'IBM Plex Mono', monospace" }}>
                      {p.preco_venda ? fmtR(p.preco_venda) : <span style={{ color: '#d1d5db' }}>—</span>}
                      {p.preco_manual && <span style={{ fontSize: 8, color: '#9ca3af', marginLeft: 4 }}>(M)</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ background: p.ativo ? '#dcfce7' : '#fee2e2', color: p.ativo ? '#15803d' : '#991b1b', padding: '1px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                        {p.ativo ? '✅ Ativo' : '⛔ Inativo'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => setBomView(p)} title="Ver estrutura BOM"
                          style={{ padding: '3px 7px', border: '1px solid #ddd6fe', background: '#ede9fe', borderRadius: 4, cursor: 'pointer', fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>
                          🔩
                        </button>
                        <button onClick={() => { setDuplicarDe(p.id); setModal({ ...p, id: undefined, codigo: '', nome: `${p.nome} (cópia)` }); }} title="Duplicar este kit como um novo produto"
                          style={{ padding: '3px 8px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                          ⧉
                        </button>
                        <button onClick={() => { setDuplicarDe(null); setModal(p); }} title="Editar"
                          style={{ padding: '3px 8px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                          ✏️
                        </button>
                        <button onClick={() => excluir(p.id)} disabled={deletando === p.id} title="Excluir"
                          style={{ padding: '3px 8px', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4, cursor: 'pointer', fontSize: 10, opacity: deletando === p.id ? .5 : 1 }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modais */}
      {modal !== null && (
        <ProdutoModal
          produto={modal}
          copiarBomDe={duplicarDe}
          onSave={() => { setModal(null); setDuplicarDe(null); carregar(); }}
          onClose={() => { setModal(null); setDuplicarDe(null); }}
          currentUser={currentUser}
        />
      )}
      {bomView && <BomViewer produto={bomView} onClose={() => setBomView(null)} />}
    </div>
  );
}
