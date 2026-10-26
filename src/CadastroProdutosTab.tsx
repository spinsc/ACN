// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { normalizarBusca, buscarPorPalavras, combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import * as XLSX from 'xlsx';
import { linhasDoKitComErro, custoDoKitComErro, usosDoKitComErro } from './KitEstrutura';
import { Faixa, Botao } from './Interface';
import { ProdutoArquivos } from './ProdutoArquivos';
import { custoComImpostos, precoUnitario } from './FormacaoCalculo';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIAS_DEFAULT = [
  'Kit Instalação', 'Adaptação Veicular', 'Rastreamento', 'Comunicação',
  'Segurança', 'Câmera', 'Elétrico', 'Mecânico', 'Acessório', 'Serviço',
  // modelos fabricados internamente (a demanda do setor busca estes primeiro)
  'Chicote', 'Serralheria', 'Outro',
];

/** Percentual digitado: campo vazio vale o padrão; 0 vale 0 (antes `Number(x) || padrão` trocava o 0 digitado pelo padrão na gravação, enquanto a prévia do preço usava o 0). */
function numOuPadrao(v: any, padrao: number) {
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return padrao;
  const n = Number(t);
  return Number.isFinite(n) ? n : padrao;
}

function fmtR(v: number) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number) {
  return `${Number(v || 0).toFixed(1)}%`;
}

/** Calcula custo total e preço de venda estimado do produto a partir do BOM
 *  (linha de sub-kit entra com o custo do kit todo, já calculado ao carregar) */
function calcProduto(linhas: any[], markup_pct: number, difal_pct: number, imposto_pct: number, custo_fixo_pct: number) {
  const custoTotal = linhas.reduce((acc, l) => {
    const item = l._item || {};
    const qt   = Number(l.quantidade) || 1;
    // aplica IPI e ST do item
    return acc + custoComImpostos(item.custo_unit, item.ipi_pct, item.st_pct) * qt;
  }, 0);

  // Mesma conta da Formação de Preços (ver FormacaoCalculo.precoUnitario):
  // markup sobre o custo e DIFAL no denominador. Imposto e custo fixo ficam
  // fora do preço — descontam da margem, não encarecem o produto.
  const precoVenda = precoUnitario(custoTotal, markup_pct, difal_pct);

  return { custoTotal, precoVenda };
}

// ─── Buscador de itens do catálogo ───────────────────────────────────────────
function ItemBuscador({ onSelect, excluirIds = [] }: { onSelect: (item: any) => void; excluirIds?: string[] }) {
  const [q, setQ]           = useState('');
  const [itens, setItens]   = useState<any[]>([]);
  const [open, setOpen]     = useState(false);
  const [erro, setErro]     = useState('');
  const seq                 = useRef(0);   // 7.x: a resposta de uma busca antiga não sobrescreve a da mais nova
  const ref                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const minha = ++seq.current;
    if (!q.trim()) { setItens([]); setErro(''); setOpen(false); return; }
    const t = setTimeout(async () => {
      const { data, error } = await buscarPorPalavras(supabase
        .from('cadastro_itens')
        .select('id, codigo, nome, marca, fornecedor, unidade, custo_unit, ipi_pct, st_pct, moeda')
        .eq('ativo', true), ['nome_norm', 'codigo_norm'], q).limit(20);
      if (minha !== seq.current) return;
      setErro(error ? (error.message || 'falha na consulta') : '');
      setItens(error ? [] : (data || []).filter(i => !excluirIds.includes(i.id)));
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
    <div ref={ref} className="acn-cp-c87">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="🔍 Buscar item do catálogo para adicionar..."
        className="acn-cp-inp92"
        onFocus={() => { if (itens.length) setOpen(true); }}
      />
      {open && (itens.length > 0 || erro) && (
        <div className="acn-cp-c99">
          {erro && <div className="acn-cp-c104">Não foi possível buscar os itens ({erro}). Isso não quer dizer que o item não exista.</div>}
          {itens.map(it => (
            <div
              key={it.id}
              onClick={() => { onSelect(it); setQ(''); setOpen(false); }}
              className="acn-cp-hv acn-cp-c110"

            >
              <div className="acn-cp-c115">
                <div className="acn-cp-c116">{it.nome}</div>
                <div className="acn-cp-c117">
                  {[it.marca, it.fornecedor].filter(Boolean).join(' · ')} · {it.unidade}
                </div>
              </div>
              <div className="acn-cp-c121">
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

/** Itens do catálogo pelos códigos informados (em lotes, sem acento e sem caixa) */
async function itensPorCodigo(codigos: string[]) {
  const achados = new Map<string, any>();
  const unicos = [...new Set(codigos.map(c => normalizarBusca(String(c ?? '').trim())).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = unicos.slice(i, i + 150);
    const { data, error } = await supabase.from('cadastro_itens').select('*').in('codigo_norm', lote);
    // 7.x (23/10/2026): leitura recusada valia como "esses códigos não existem" e o relatório listava todos como não encontrados
    if (error) { const e: any = new Error('Não foi possível consultar o catálogo (' + (error.message || 'falha na consulta') + ').'); e.daConsulta = true; throw e; }
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

function ModalAdicionarItens({ produtoId, onAdicionar, onVincularKit, onClose }: any) {
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
  const [erroBusca, setErroBusca] = useState('');
  const [erroKits, setErroKits] = useState('');
  const seqBusca = useRef(0);   // 7.x: a resposta de uma busca antiga não sobrescreve a da mais nova

  // busca por código ou nome, com bem mais resultados que o campo de um item só
  useEffect(() => {
    const minha = ++seqBusca.current;
    if (!q.trim()) { setResultados([]); setErroBusca(''); setBuscando(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data, error } = await buscarPorPalavras(supabase.from('cadastro_itens')
        .select('id, codigo, nome, marca, fornecedor, unidade, custo_unit, ipi_pct, st_pct, moeda')
        .eq('ativo', true), ['nome_norm', 'codigo_norm'], q).order('nome').limit(200);
      if (minha !== seqBusca.current) return;
      setErroBusca(error ? (error.message || 'falha na consulta') : '');
      setResultados(error ? [] : (data || []));
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (modo !== 'kit' || produtos.length) return;
    supabase.from('cadastro_produtos').select('id, codigo, nome, categoria').eq('ativo', true).order('nome')
      .then(({ data, error }) => {
        if (error) { setErroKits(error.message || 'falha na consulta'); return; }
        setErroKits('');
        setProdutos((data || []).filter((p: any) => p.id !== produtoId));
      });
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
    let achados: Map<string, any>;
    try { achados = await itensPorCodigo(linhas.map(l => l.codigo)); }
    catch (e: any) { alert(e.message + ' Nada foi adicionado.'); setProcessando(false); return; }   // a lista colada continua na caixa
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
      alert(e.daConsulta ? e.message + ' Nada foi adicionado.' : 'Não foi possível ler a planilha: ' + e.message);
      setProcessando(false);
    }
  };

  const vincularKit = async () => {
    if (!kitSel) { alert('Escolha o kit que vai dentro deste.'); return; }
    setProcessando(true);
    const kit = produtos.find((p: any) => p.id === kitSel);
    const r = await onVincularKit(kit);
    if (!r.falhou) setRelatorio({ adicionados: r.novos, somados: r.somados, naoEncontrados: [], kit: kit?.nome });
    setProcessando(false);
  };

  const trazerDoKit = async () => {
    if (!kitSel) { alert('Escolha o kit de onde vêm os itens.'); return; }
    setProcessando(true);
    const { data, error } = await supabase.from('cadastro_produtos_itens')
      .select('quantidade, observacoes, cadastro_itens(*)')
      .eq('produto_id', kitSel).order('ordem');
    // 7.x: leitura recusada valia como "esse kit não tem itens"
    if (error) { alert('Não foi possível ler os itens desse kit (' + (error.message || 'falha na consulta') + '). Nada foi copiado.'); setProcessando(false); return; }
    const itens = (data || []).filter((l: any) => l.cadastro_itens)
      .map((l: any) => ({ item: l.cadastro_itens, quantidade: Number(l.quantidade) || 1, observacoes: l.observacoes || '' }));
    if (!itens.length) { alert('Esse kit não tem itens na estrutura.'); setProcessando(false); return; }
    concluir(itens);
  };


  return (
    <div className="acn-cp-fundo acn-cp-c310"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-cp-c312">
        <div className="acn-cp-c313">
          <div>
            <div className="acn-cp-c315">➕ Adicionar vários itens</div>
            <div className="acn-cp-c316">Item repetido soma na quantidade que já está no kit</div>
          </div>
          <Botao onClick={onClose} className="acn-cp-bt acn-cp-b318">✕</Botao>
        </div>

        <div className="acn-cp-c321">
          {MODOS_ADICIONAR.map(m => (
            <Botao key={m.id} onClick={() => { setModo(m.id); setRelatorio(null); }}
              className={'acn-cp-bt acn-cp-b324' + (modo === m.id ? ' acn-cp-b324-2' : ' acn-cp-b324-3')}>
              {m.rotulo}
            </Botao>
          ))}
        </div>

        <div className="acn-cp-c330">
          {relatorio && (
            <div className={'acn-cp-c332' + (relatorio.naoEncontrados.length ? ' acn-cp-c332-2' : ' acn-cp-c332-3')}>
              <div className="acn-cp-c333">
                {relatorio.kit
                  ? (relatorio.adicionados ? `Kit "${relatorio.kit}" vinculado` : `O kit "${relatorio.kit}" já estava vinculado: somou 1 na quantidade`)
                  : `${relatorio.adicionados} item(ns) adicionado(s)${relatorio.somados ? ` · ${relatorio.somados} já estavam no kit e tiveram a quantidade somada` : ''}`}
              </div>
              {relatorio.naoEncontrados.length > 0 && (
                <div className="acn-cp-c339">
                  Não encontrados no catálogo ({relatorio.naoEncontrados.length}): {relatorio.naoEncontrados.slice(0, 30).join(', ')}
                  {relatorio.naoEncontrados.length > 30 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          {modo === 'buscar' && (
            <div>
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus className="acn-cp-inp349"
                placeholder="🔍 Buscar por código ou nome (ex.: 1832, cabo, sirene)" />
              <div className="acn-cp-c351">
                {buscando ? 'Buscando…' : `${resultados.length} item(ns) · ${Object.keys(marcados).length} marcado(s)`}
                {resultados.length === 200 && ' · mostrando os 200 primeiros, refine a busca'}
              </div>
              <div className="acn-cp-c355">
                {resultados.map(it => {
                  const marcado = marcados[it.id] != null;
                  return (
                    <div key={it.id} onClick={() => marcar(it)}
                      className={'acn-cp-c360' + (marcado ? ' acn-cp-c360-2' : ' acn-cp-c360-3')}>
                      <input type="checkbox" checked={marcado} onChange={() => marcar(it)} onClick={e => e.stopPropagation()} />
                      <div className="acn-cp-c362">
                        <div className="acn-cp-c363">{it.nome}</div>
                        <div className="acn-cp-c117">{[it.codigo, it.marca, it.unidade].filter(Boolean).join(' · ')}</div>
                      </div>
                      {marcado && (
                        <input type="number" min={0.001} step="0.001" value={marcados[it.id]} onClick={e => e.stopPropagation()}
                          onChange={e => setMarcados(m => ({ ...m, [it.id]: Number(e.target.value) || 1 }))}
                          className="acn-cp-inp369" />
                      )}
                      <div className="acn-cp-c121">{fmtR(it.custo_unit)}</div>
                    </div>
                  );
                })}
                {!buscando && !resultados.length && (
                  <div className={'acn-cp-c376' + (erroBusca ? ' acn-cp-c376-2' : ' acn-cp-c376-3')}>
                    {erroBusca ? `Não foi possível buscar os itens (${erroBusca}). Isso não quer dizer que o item não exista.` : q.trim() ? 'Nenhum item encontrado.' : 'Digite parte do código ou do nome do item.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {modo === 'colar' && (
            <div>
              <div className="acn-cp-c386">
                Um código por linha. Para informar a quantidade, use espaço, ponto e vírgula ou tabulação: <b>1832 3</b> ou <b>1832;3</b>.
                Também funciona colando duas colunas do Excel.
              </div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={12} autoFocus
                placeholder={'1832\n1827 2\n1828;10'} className="acn-cp-ta391" />
            </div>
          )}

          {modo === 'planilha' && (
            <div>
              <div className="acn-cp-c397">
                A planilha precisa de uma coluna <b>Código</b>. As colunas <b>Quantidade</b> e <b>Observação</b> são opcionais.
                Serve Excel (.xlsx, .xls), LibreOffice (.ods) e CSV.
              </div>
              <input type="file" accept=".xlsx,.xlsm,.xlsb,.xls,.ods,.csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) importarPlanilha(f); e.target.value = ''; }}
                className="acn-cp-inp403" />
            </div>
          )}

          {modo === 'kit' && (
            <div>
              <div className="acn-cp-c386">
                <b>Vincular</b> deixa o kit escolhido dentro deste: a composição continua sendo a do cadastro dele,
                então mudou lá, muda aqui e nas formações de preço feitas com este kit.
                <br />
                <b>Copiar itens</b> traz os itens de uma vez, e depois cada kit segue seu caminho.
              </div>
              {erroKits && <div className="acn-cp-c415">Não foi possível ler a lista de kits ({erroKits}).</div>}
              <select value={kitSel} onChange={e => setKitSel(e.target.value)} className="acn-cp-sel416">
                <option value="">Escolha o kit…</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{[p.codigo, p.nome].filter(Boolean).join(' — ')}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="acn-cp-c424">
          <Botao onClick={onClose} className="acn-cp-bt acn-cp-b425">
            Fechar
          </Botao>
          {modo === 'buscar' && (
            <Botao onClick={adicionarMarcados} disabled={!Object.keys(marcados).length}
              className={'acn-cp-bt acn-cp-b430' + (Object.keys(marcados).length ? ' acn-cp-b430-2' : ' acn-cp-b430-3')}>
              ➕ Adicionar {Object.keys(marcados).length || ''} item(ns)
            </Botao>
          )}
          {modo === 'colar' && (
            <Botao onClick={adicionarDaLista} disabled={processando || !texto.trim()}
              className={'acn-cp-bt acn-cp-b430' + (texto.trim() ? ' acn-cp-b430-2' : ' acn-cp-b430-3')}>
              {processando ? 'Adicionando…' : '➕ Adicionar lista'}
            </Botao>
          )}
          {modo === 'kit' && (
            <>
              <Botao onClick={trazerDoKit} disabled={processando || !kitSel}
                className="acn-cp-bt acn-cp-b443">
                {processando ? '…' : '📄 Copiar itens'}
              </Botao>
              <Botao onClick={vincularKit} disabled={processando || !kitSel}
                className={'acn-cp-bt acn-cp-b430' + (kitSel ? ' acn-cp-b430-2' : ' acn-cp-b430-3')}>
                {processando ? 'Vinculando…' : '🧩 Vincular kit'}
              </Botao>
            </>
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
  // A estrutura do kit só pode ser regravada se foi LIDA com sucesso (ou se o produto é novo, sem
  // estrutura). Antes, salvar com a estrutura ainda carregando — ou depois de uma falha de leitura,
  // que virava lista vazia — apagava a estrutura inteira do kit (achado em 29/09/2026, revisão dos
  // formulários de edição).
  const [bomCarregado, setBomCarregado] = useState(!(produto?.id || copiarBomDe));
  const [erroBom, setErroBom] = useState('');
  const [adicionarVarios, setAdicionarVarios] = useState(false);
  const salvandoRef = useRef(false);   // 7.x: clique duplo gravava duas vezes
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
      alert('Não foi possível enviar a foto: ' + explicarErroDeEnvio(error, file));
    }
    setUploadingFoto(false);
  };

  const removeFoto = async (idx: number) => { if (!await confirmarRemocao('esta foto')) return; setFotos(prev => prev.filter((_, i) => i !== idx)); };

  const uploadCatalogo = async (file: File) => {
    setUploadingCatalogo(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `produtos/${produtoIdLocal}/catalogo/catalogo.${ext}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('acn-media').getPublicUrl(path);
      setCatalogoUrl(urlData.publicUrl);
    } else {
      alert('Não foi possível enviar o catálogo: ' + explicarErroDeEnvio(error, file));
    }
    setUploadingCatalogo(false);
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Carrega o BOM ao editar — e também ao duplicar, copiando a estrutura do outro kit
  const idDoBom = produto?.id || copiarBomDe;
  useEffect(() => {
    if (!idDoBom) return;
    setLoadingBom(true); setBomCarregado(false); setErroBom('');
    linhasDoKitComErro(idDoBom)
      .then(async ({ linhas: linhasSalvas, erro }: { linhas: any[]; erro: string }) => {
        if (erro) { setErroBom(erro); setLoadingBom(false); return; }
        const montadas = [];
        let erroCusto = '';
        for (const l of linhasSalvas) {
          const base = { ...l, id: produto?.id ? l.id : undefined, _tmpId: Math.random().toString(36).slice(2) };
          if (l.produto_filho_id) {
            // sub-kit vinculado: custo é o do kit de origem, sempre o atual
            const { custo, erro: ec } = await custoDoKitComErro(l.produto_filho_id);
            if (ec) erroCusto = erroCusto || ec;
            montadas.push({ ...base, _kit: l.filho || { nome: l.item_nome }, _item: { nome: l.item_nome, custo_unit: custo, ipi_pct: 0, st_pct: 0 } });
          } else {
            montadas.push({ ...base, _item: l.cadastro_itens || { nome: l.item_nome, custo_unit: 0 } });
          }
        }
        // 7.x: com a leitura de um sub-kit recusada o custo saía menor e o preço sugerido era gravado assim; a estrutura só vale como lida com todos os custos
        if (erroCusto) { setErroBom('o custo de um kit vinculado não pôde ser lido: ' + erroCusto); setLoadingBom(false); return; }
        setLinhas(montadas);
        setBomCarregado(true);
        setLoadingBom(false);
      })
      .catch((e: any) => { setErroBom(e?.message || 'Falha ao ler a estrutura do kit.'); setLoadingBom(false); });
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

  // Kit dentro de kit VINCULADO: guarda a referência, não os itens. A composição
  // do sub-kit é sempre lida do cadastro dele — mudou lá, muda aqui.
  const vincularKit = async (kit: any, quantidade = 1) => {
    if (produto?.id && kit.id === produto.id) { alert('Um kit não pode conter ele mesmo.'); return { novos: 0, somados: 0, falhou: true }; }
    const { custo, erro: erroCusto } = await custoDoKitComErro(kit.id);
    if (erroCusto) { alert('Não foi possível ler a composição do kit "' + (kit.nome || '') + '" (' + erroCusto + '). O kit não foi vinculado.'); return { novos: 0, somados: 0, falhou: true }; }
    let resumo = { novos: 0, somados: 0 };
    setLinhas(prev => {
      const i = prev.findIndex(l => l.produto_filho_id === kit.id);
      if (i >= 0) {
        resumo = { novos: 0, somados: 1 };
        return prev.map((l, j) => j === i ? { ...l, quantidade: (Number(l.quantidade) || 0) + quantidade } : l);
      }
      resumo = { novos: 1, somados: 0 };
      return [...prev, {
        _tmpId: Math.random().toString(36).slice(2),
        produto_filho_id: kit.id,
        item_id: null,
        item_nome: kit.nome,
        item_codigo: kit.codigo || null,
        quantidade,
        unidade: 'KIT',
        observacoes: '',
        ordem: prev.length,
        _kit: kit,
        _item: { nome: kit.nome, custo_unit: custo, ipi_pct: 0, st_pct: 0 },
      }];
    });
    return resumo;
  };

  const removeItem = async (idx: number) => { if (!await confirmarRemocao('este item do produto')) return; setLinhas(prev => prev.filter((_, i) => i !== idx)); };

  const setLinha = (idx: number, k: string, v: any) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));

  const { custoTotal, precoVenda } = calcProduto(
    linhas, numOuPadrao(form.markup_pct, 100), numOuPadrao(form.difal_pct, 0), numOuPadrao(form.imposto_pct, 16), numOuPadrao(form.custo_fixo_pct, 3),
  );

  const handleSave = async () => {
    if (!form.nome?.trim() || salvandoRef.current) return;
    // 7.x: os campos de percentual declaram 0 a 200, mas o navegador só aplica isso nas setas
    for (const [k, rot] of [['markup_pct', 'Markup'], ['custo_fixo_pct', 'Custo fixo'], ['imposto_pct', 'Impostos s/ venda'], ['difal_pct', 'DIFAL']] as const) {
      const n = numOuPadrao(form[k], 0);
      if (n < 0 || n > 200) { alert(`O campo "${rot}" precisa estar entre 0 e 200.`); return; }
    }
    // sem a estrutura lida, salvar regravaria uma lista vazia por cima da que existe
    if (!bomCarregado) {
      alert(erroBom
        ? `Não foi possível ler a estrutura deste kit (${erroBom}).\n\nFeche e abra de novo o produto antes de salvar, para a estrutura não ser apagada.`
        : 'A estrutura do kit ainda está carregando. Aguarde um instante e salve de novo.');
      return;
    }
    salvandoRef.current = true;
    setSalvando(true);
    try { await gravarProduto(); } finally { salvandoRef.current = false; setSalvando(false); }
  };

  const gravarProduto = async () => {
    // 7.x (23/10/2026): lê a estrutura que já existe ANTES de gravar qualquer coisa (leitura recusada deixava de saber o que apagar e a estrutura nova ia somada à antiga) e pergunta antes de apagar tudo
    let idsAntigos: string[] = [];
    if (isEdit) {
      const { data: antigas, error: erroAntigas } = await supabase.from('cadastro_produtos_itens').select('id').eq('produto_id', produtoIdLocal);
      if (erroAntigas) { alert('Não foi possível ler a estrutura que o produto já tem (' + erroAntigas.message + '). Nada foi gravado.'); return; }
      idsAntigos = (antigas || []).map((a: any) => a.id);
      if (linhas.length === 0 && idsAntigos.length > 0
          && !await confirmar(`Este kit tem ${idsAntigos.length} item(ns) na estrutura e a lista está vazia.\n\nSalvar assim APAGA a estrutura inteira. Confirmar?`)) return;
    }

    const payload: any = {
      codigo:        form.codigo?.trim() || null,
      nome:          form.nome.trim(),
      descricao:     form.descricao?.trim() || null,
      categoria:     form.categoria?.trim() || null,
      unidade:       form.unidade || 'UN',
      ncm:           form.ncm?.trim() || null,
      markup_pct:    numOuPadrao(form.markup_pct, 100),   // 7.x: o 0 digitado fica 0 (antes "|| 100" o trocava pelo padrão)
      custo_fixo_pct: numOuPadrao(form.custo_fixo_pct, 3),
      imposto_pct:   numOuPadrao(form.imposto_pct, 16),
      difal_pct:     numOuPadrao(form.difal_pct, 0),
      garantia_meses: Number(form.garantia_meses) || 12,
      fotos:         fotos,
      catalogo_url:  catalogoUrl || null,
      preco_manual:  !!form.preco_manual,
      preco_venda:   form.preco_manual ? (Number(form.preco_venda) || 0) : precoVenda,
      observacoes:   form.observacoes?.trim() || null,
      ativo:         form.ativo !== false,
    };

    let produtoId = produtoIdLocal;
    // 7.x: a gravação do produto recusada (ou que o banco não fez, 0 linhas) seguia como salva e a estrutura era regravada por cima
    if (isEdit) {
      const { data: atualizados, error: erroUpd } = await supabase.from('cadastro_produtos').update(payload).eq('id', produtoId).select('id');
      if (erroUpd || !(atualizados || []).length) { alert('Não foi possível salvar o produto: ' + (erroUpd?.message || 'o banco não atualizou nenhum produto (ele pode ter sido excluído por outra pessoa)') + '. A estrutura não foi mexida.'); return; }
    } else {
      payload.id = produtoIdLocal;
      payload.criado_por = currentUser?.email;
      const { error: erroIns } = await supabase.from('cadastro_produtos').insert([payload]);
      if (erroIns) { alert('Não foi possível cadastrar o produto: ' + erroIns.message); return; }
    }

    if (produtoId) {
      // Recria a estrutura: grava as linhas NOVAS primeiro e só então remove as ANTIGAS. Antes era apagar e
      // depois inserir — uma falha no meio deixava o kit sem estrutura.
      let novosIds: string[] = [];
      if (linhas.length > 0) {
        const { data: inseridas, error: erroInsert } = await supabase.from('cadastro_produtos_itens').insert(
          linhas.map((l, idx) => ({
            produto_id:  produtoId,
            item_id:     l.item_id || null,
            produto_filho_id: l.produto_filho_id || null,
            item_nome:   l.item_nome,
            item_codigo: l.item_codigo || null,
            quantidade:  Number(l.quantidade) || 1,
            unidade:     l.unidade || 'UN',
            observacoes: l.observacoes || null,
            ordem:       idx,
          }))
        ).select('id');
        if (erroInsert) {
          alert('Os dados do produto foram salvos, mas a estrutura NÃO foi gravada (a anterior continua como estava): ' + erroInsert.message);
          return;
        }
        novosIds = (inseridas || []).map((x: any) => x.id);
      }
      if (idsAntigos.length) {
        // 7.x: se as linhas antigas não saíram, a estrutura ficava em dobro sem aviso; desfaz as novas para a anterior continuar valendo
        const { error: erroApagar } = await supabase.from('cadastro_produtos_itens').delete().in('id', idsAntigos);
        if (erroApagar) {
          if (novosIds.length) await supabase.from('cadastro_produtos_itens').delete().in('id', novosIds);
          alert('Os dados do produto foram salvos, mas a estrutura NÃO foi trocada (a anterior continua como estava): ' + erroApagar.message);
          return;
        }
      }
    }

    onSave();
  };



  return (
    <div className="acn-cp-fundo acn-cp-c729" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-cp-c733">
        {/* Header */}
        <div className="acn-cp-c739">
          <div>
            <div className="acn-cp-c315">
              {isEdit ? '✏️ Editar Produto' : '➕ Novo Produto'}
            </div>
            <div className="acn-cp-c316">
              Produto composto de itens do catálogo (BOM)
            </div>
          </div>
          <Botao onClick={onClose} className="acn-cp-bt acn-cp-b752">✕</Botao>
        </div>

        <div className="acn-cp-c755">

          {/* Coluna esquerda — dados do produto */}
          <div className="acn-cp-c758">
            <div className="acn-cp-c759">
              📦 Identificação
            </div>

            {[
              { label: 'CODPRODUTO', k: 'codigo', ph: 'Ex: PROD-001' },
              { label: 'Nome do Produto *', k: 'nome', ph: 'Nome do produto final' },
            ].map(f => (
              <div key={f.k} className="acn-cp-c767">
                <span className="acn-cp-s768">{f.label}</span>
                <input className={'acn-cp-inp769' + (f.k === 'nome' && !form.nome ? ' acn-cp-inp769-2' : ' acn-cp-inp769-3')}
                  value={form[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.ph} />
              </div>
            ))}

            <div className="acn-cp-c767">
              <span className="acn-cp-s768">Descrição</span>
              <textarea className="acn-cp-ta776"
                value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Especificações, observações..." />
            </div>

            <div className="acn-cp-c781">
              <div className="acn-cp-c115">
                <span className="acn-cp-s768">Categoria</span>
                <select className="acn-cp-sel784" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                  <option value="">— Selecionar —</option>
                  {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
                  {form.categoria && !CATEGORIAS_DEFAULT.includes(form.categoria) && <option value={form.categoria}>{form.categoria}</option>}
                </select>
              </div>
              <div className="acn-cp-c790">
                <span className="acn-cp-s768">Unidade</span>
                <select className="acn-cp-sel784" value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                  {['UN', 'PC', 'KG', 'M', 'KIT', 'JG', 'VB'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="acn-cp-c798">
              <span className="acn-cp-s768">NCM</span>
              <input className="acn-cp-inp769" value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="0000.00.00" />
            </div>

            <div className="acn-cp-c759">
              📊 Tributação e Markup
            </div>

            <div className="acn-cp-c807">
              {[
                { label: 'Markup (%)', k: 'markup_pct' },
                { label: 'Custo Fixo (%)', k: 'custo_fixo_pct' },
                { label: 'Impostos s/Venda (%)', k: 'imposto_pct' },
                { label: 'DIFAL (%)', k: 'difal_pct' },
              ].map(f => (
                <div key={f.k}>
                  <span className="acn-cp-s768">{f.label}</span>
                  <input className="acn-cp-inp769" type="number" min={0} max={200} step="0.5"
                    value={form[f.k]} onChange={e => set(f.k, e.target.value)} />
                </div>
              ))}
            </div>

            {/* Garantia */}
            <div className="acn-cp-c823">
              <span className="acn-cp-s768">🛡️ Garantia Padrão</span>
              <select className="acn-cp-sel825"
                value={form.garantia_meses} onChange={e => set('garantia_meses', Number(e.target.value))}>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
                <option value={24}>24 meses</option>
                <option value={60}>60 meses</option>
              </select>
            </div>

            {/* Resumo financeiro */}
            <div className="acn-cp-c835">
              <div className="acn-cp-c839">
                💰 Resumo Financeiro
              </div>
              <div className="acn-cp-c842">
                <span className="acn-cp-s843">Custo total BOM:</span>
                <span className="acn-cp-s844">{fmtR(custoTotal)}</span>
              </div>
              <div className="acn-cp-c842">
                <span className="acn-cp-s843">Itens na estrutura:</span>
                <span className="acn-cp-s848">{linhas.length}</span>
              </div>
              <div className="acn-cp-c850">
                <span className="acn-cp-s851">Preço venda est.:</span>
                <span className="acn-cp-s852">{fmtR(form.preco_manual ? form.preco_venda : precoVenda)}</span>
              </div>
            </div>

            {/* Preço manual */}
            <label className="acn-cp-lb857">
              <input type="checkbox" checked={form.preco_manual} onChange={e => set('preco_manual', e.target.checked)}
                className="acn-cp-inp859" />
              Definir preço de venda manualmente
            </label>
            {form.preco_manual && (
              <div className="acn-cp-c863">
                <span className="acn-cp-s768">Preço de Venda (R$)</span>
                <input className="acn-cp-inp769" type="number" min={0} step="0.01"
                  value={form.preco_venda} onChange={e => set('preco_venda', e.target.value)} />
              </div>
            )}

            <div className="acn-cp-c870">
              <label className="acn-cp-lb871">
                <input type="checkbox" checked={form.ativo !== false} onChange={e => set('ativo', e.target.checked)}
                  className="acn-cp-inp873" />
                Produto ativo
              </label>
            </div>

            <div className="acn-cp-c870">
              <span className="acn-cp-s768">Observações</span>
              <textarea className="acn-cp-ta880"
                value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
                placeholder="Notas adicionais..." />
            </div>

            {/* ── Fotos e Catálogo ── */}
            <div className="acn-cp-c886">
              <div className="acn-cp-c759">
                📸 Fotos e Catálogo
              </div>

              {/* Fotos */}
              <span className="acn-cp-s768">Fotos do Produto</span>
              <label className={'acn-cp-lb893' + (uploadingFoto ? ' acn-cp-lb893-2' : ' acn-cp-lb893-3')}>
                <input type="file" accept="image/*" multiple className="acn-cp-inp898"
                  disabled={uploadingFoto}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) await uploadFoto(f);
                    e.target.value = '';
                  }} />
                {uploadingFoto ? '⏳ Enviando...' : '📎 Selecionar fotos (múltiplas)'}
              </label>

              {fotos.length > 0 && (
                <div className="acn-cp-c909">
                  {fotos.map((url, i) => (
                    <div key={i} className="acn-cp-c911">
                      <img src={url} alt={`foto-${i}`} className="acn-cp-img912" />
                      <Botao onClick={() => removeFoto(i)} title="Remover"
                        className="acn-cp-bt acn-cp-b914">
                        ✕
                      </Botao>
                    </div>
                  ))}
                </div>
              )}

              {/* Catálogo PDF */}
              <span className="acn-cp-s923">Catálogo PDF</span>
              <label className={'acn-cp-lb924' + (uploadingCatalogo ? ' acn-cp-lb893-2' : ' acn-cp-lb893-3')}>
                <input type="file" accept=".pdf,application/pdf" className="acn-cp-inp898"
                  disabled={uploadingCatalogo}
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (f) await uploadCatalogo(f);
                    e.target.value = '';
                  }} />
                {uploadingCatalogo ? '⏳ Enviando...' : '📄 Selecionar PDF'}
              </label>
              {catalogoUrl && (
                <div className="acn-cp-c939">
                  <a href={catalogoUrl} target="_blank" rel="noreferrer"
                    className="acn-cp-a941">
                    📄 Ver catálogo
                  </a>
                  <Botao onClick={() => setCatalogoUrl('')}
                    className="acn-cp-bt acn-cp-b945">✕</Botao>
                </div>
              )}

              {/* Arquivos de projeto da estrutura (desenho, esquema, DXF...) */}
              {isEdit ? (
                <ProdutoArquivos produtoId={produto.id} currentUser={currentUser} />
              ) : (
                <div className="acn-cp-c953">📐 Arquivos de projeto: cadastre o produto para poder anexar.</div>
              )}
            </div>
          </div>

          {/* Coluna direita — BOM */}
          <div className="acn-cp-c959">
            <div className="acn-cp-c960">
              <div className="acn-cp-c759">
                🔩 Estrutura do Produto (BOM — {linhas.length} {linhas.length === 1 ? 'item' : 'itens'})
              </div>
              <div className="acn-cp-c964">
                <ItemBuscador onSelect={addItem} />
                <Botao onClick={() => setAdicionarVarios(true)} title="Buscar e marcar vários, colar lista, importar planilha ou trazer de outro kit"
                  className="acn-cp-bt acn-cp-b967">
                  ➕ Vários itens
                </Botao>
              </div>
            </div>

            <div className="acn-cp-c973">
              {loadingBom ? (
                <div className="acn-cp-c975">Carregando estrutura...</div>
              ) : linhas.length === 0 ? (
                <div className="acn-cp-c977">
                  Nenhum item na estrutura.<br />
                  <span className="acn-cp-s979">Busque e adicione itens do catálogo acima.</span>
                </div>
              ) : (
                <table className="acn-cp-tb982">
                  <thead>
                    <tr>
                      {['#', 'Item', 'Qtd', 'Un.', 'Custo Unit.', 'Total', 'Obs.', ''].map(h => (
                        <th key={h} className={'acn-cp-cel986' + (h === 'Total' || h === 'Custo Unit.' ? ' acn-cp-cel986-2' : ' acn-cp-cel986-3')}>{h}</th>
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
                        <tr key={l._tmpId || l.id} className={'' + (idx % 2 === 0 ? ' acn-cp-tr997' : ' acn-cp-tr997-2')}>
                          <td className="acn-cp-td998">{idx + 1}</td>
                          <td className="acn-cp-td999">
                            <div>
                              {l.produto_filho_id && (
                                <span title="Kit vinculado: a composição vem do cadastro dele e acompanha as mudanças"
                                  className="acn-cp-s1003">
                                  🧩 KIT
                                </span>
                              )}
                              {l.item_nome}
                            </div>
                            {l.item_codigo && <div className="acn-cp-c1009">{l.item_codigo}</div>}
                          </td>
                          <td className="acn-cp-td1011">
                            <input
                              type="number" min={0.001} step="0.001"
                              value={l.quantidade}
                              onChange={e => setLinha(idx, 'quantidade', e.target.value)}
                              className="acn-cp-inp1016"
                            />
                          </td>
                          <td className="acn-cp-td1019">{l.unidade}</td>
                          <td className="acn-cp-td1020">{fmtR(cu_c)}</td>
                          <td className="acn-cp-td1021">{fmtR(total)}</td>
                          <td className="acn-cp-td1011">
                            <input
                              value={l.observacoes || ''}
                              onChange={e => setLinha(idx, 'observacoes', e.target.value)}
                              placeholder="obs."
                              className="acn-cp-inp1027"
                            />
                          </td>
                          <td className="acn-cp-td1030">
                            <Botao onClick={() => removeItem(idx)}
                              className="acn-cp-bt acn-cp-b1032"
                            >✕</Botao>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} className="acn-cp-td1041">
                        Total custo BOM:
                      </td>
                      <td className="acn-cp-td1044">
                        {fmtR(custoTotal)}
                      </td>
                      <td colSpan={2} className="acn-cp-td1047" />
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
            onVincularKit={vincularKit}
            onClose={() => setAdicionarVarios(false)}
          />
        )}

        {/* Footer */}
        <div className="acn-cp-c1066">
          <Botao onClick={onClose} className="acn-cp-bt acn-cp-b1071">
            Cancelar
          </Botao>
          <Botao
            onClick={handleSave}
            disabled={salvando || loadingBom || !form.nome?.trim()}
            className={'acn-cp-bt acn-cp-b1077' + (!form.nome?.trim() ? ' acn-cp-b1077-2' : ' acn-cp-b1077-3') + (salvando ? ' acn-cp-b1077-4' : ' acn-cp-b1077-5')}
          >
            {salvando ? 'Salvando...' : loadingBom ? 'Carregando estrutura...' : isEdit ? '💾 Salvar Produto' : '✅ Cadastrar Produto'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de visualização de estrutura ──────────────────────────────────────
function BomViewer({ produto, onClose }: any) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [custosKit, setCustosKit] = useState<Record<string, number>>({});

  // 7.x (23/10/2026): a leitura recusada dizia "Nenhum item na estrutura" e a linha de kit vinculado valia zero no total (o item vem do outro kit e a linha não tem item do catálogo)
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { linhas: salvas, erro: e } = await linhasDoKitComErro(produto.id);
      if (!vivo) return;
      if (e) { setErro(e); setLoading(false); return; }
      const custos: Record<string, number> = {};
      let erroCusto = '';
      for (const l of salvas) if (l.produto_filho_id) {
        const r = await custoDoKitComErro(l.produto_filho_id);
        if (r.erro) erroCusto = erroCusto || r.erro; else custos[l.produto_filho_id] = r.custo;
      }
      if (!vivo) return;
      setErro(erroCusto ? 'o custo de um kit vinculado não pôde ser lido: ' + erroCusto : '');
      setCustosKit(custos); setLinhas(salvas); setLoading(false);
    })();
    return () => { vivo = false; };
  }, [produto.id]);

  const custoLinha = (l: any) => {
    if (l.produto_filho_id) return custosKit[l.produto_filho_id] || 0;
    const item = l.cadastro_itens || {};
    return (Number(item.custo_unit) || 0) * (1 + (Number(item.ipi_pct) || 0) / 100) * (1 + (Number(item.st_pct) || 0) / 100);
  };
  const custoTotal = linhas.reduce((acc, l) => acc + custoLinha(l) * (Number(l.quantidade) || 1), 0);

  return (
    <div className="acn-cp-fundo acn-cp-c1127" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acn-cp-c1131">
        <div className="acn-cp-c1132">
          <div>
            <div className="acn-cp-c315">🔩 Estrutura: {produto.nome}</div>
            <div className="acn-cp-c1135">{produto.categoria} · {produto.unidade}</div>
          </div>
          <Botao onClick={onClose} className="acn-cp-bt acn-cp-b752">✕</Botao>
        </div>
        <div className="acn-cp-c1139">
          <div className="acn-cp-c767"><ProdutoArquivos produtoId={produto.id} somenteLeitura /></div>
          {erro && (
            <div className="acn-cp-c767">
              <Faixa tom="erro">Não foi possível ler a estrutura ({erro}). {linhas.length ? 'O custo total abaixo está incompleto.' : 'Isso não quer dizer que o produto não tenha itens.'}</Faixa>
            </div>
          )}
          {loading ? (
            <div className="acn-cp-c1147">Carregando...</div>
          ) : linhas.length === 0 ? (
            erro ? null : <div className="acn-cp-c1149">Nenhum item na estrutura.</div>
          ) : (
            <table className="acn-cp-tb1151">
              <thead>
                <tr>
                  {['#', 'Item', 'Qtd', 'Un.', 'Total', 'Obs.'].map(h => (
                    <th key={h} className={'acn-cp-cel1155' + (h === 'Total' ? ' acn-cp-cel986-2' : ' acn-cp-cel986-3')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const total = custoLinha(l) * (Number(l.quantidade) || 1);
                  return (
                    <tr key={l.id} className={'' + (idx % 2 === 0 ? ' acn-cp-tr997' : ' acn-cp-tr997-2')}>
                      <td className="acn-cp-td1164">{idx + 1}</td>
                      <td className="acn-cp-td1165">
                        {l.produto_filho_id && <span title="Kit vinculado: a composição vem do cadastro dele" className="acn-cp-s1003">🧩 KIT</span>}
                        {l.item_nome}
                      </td>
                      <td className="acn-cp-td1169">{l.quantidade}</td>
                      <td className="acn-cp-td1170">{l.unidade}</td>
                      <td className="acn-cp-td1171">{fmtR(total)}</td>
                      <td className="acn-cp-td1172">{l.observacoes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="acn-cp-td1179">Custo total BOM:</td>
                  <td className="acn-cp-td1180">{fmtR(custoTotal)}</td>
                  <td className="acn-cp-td1047" />
                </tr>
                <tr>
                  <td colSpan={4} className="acn-cp-td1184">Preço de venda ({produto.preco_manual ? 'manual' : 'calculado'}):</td>
                  <td className="acn-cp-td1185">{fmtR(produto.preco_venda)}</td>
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
  const [erroLista, setErroLista]     = useState('');
  const [listaLida, setListaLida]     = useState(false);   // 7.x: a leitura recusada não pode parecer "nenhum produto cadastrado"

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cadastro_produtos')
      .select('*')
      .order(ordenar.col, { ascending: ordenar.dir === 'asc' })
      .order('id');   // desempate: a ordem por marca/categoria repete valores
    if (error) setErroLista(error.message || 'falha na consulta');   // mantém a última lista lida
    else { setErroLista(''); setListaLida(true); setProdutos(data || []); }
    setLoading(false);
  }, [ordenar]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = produtos.filter(p => {
    if (filtAtivo === 'ativo'   && !p.ativo) return false;
    if (filtAtivo === 'inativo' &&  p.ativo) return false;
    if (filtCat && p.categoria !== filtCat) return false;
    if (busca.trim()) return combinaBusca([p.nome, p.codigo, p.categoria], busca);
    return true;
  });

  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort();

  const sortBy = (col: string) =>
    setOrdenar(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

  // Funcao de render (nao componente) - ver mesma correcao em CadastroItensTab.
  const sortIcon = (col: string) =>
    ordenar.col !== col ? <span className="acn-cp-s1241">⇅</span> : <span>{ordenar.dir === 'asc' ? '↑' : '↓'}</span>;

  const excluir = async (id: string) => {
    setDeletando(id);
    // produto usado em outro kit ou numa formação de preço não pode sumir
    const { kits, formacoes, bloqueado, erro: erroUso } = await usosDoKitComErro(id);
    // 7.x: sem saber se o produto está em uso (leitura recusada) ele não é apagado — a ligação com a formação de preço o banco não impede
    if (erroUso) {
      setDeletando(null);
      alert('Não foi possível conferir se o produto está em uso (' + erroUso + '). Por segurança ele não foi excluído.');
      return;
    }
    if (bloqueado) {
      setDeletando(null);
      const partes = [
        kits.length ? `${kits.length} kit(s): ${kits.map((k: any) => k.nome).join(', ')}` : '',
        formacoes.length ? `${formacoes.length} formação(ões) de preço: ${formacoes.map((f: any) => f.nome || f.numero_cotacao).join(', ')}` : '',
      ].filter(Boolean);
      alert(`Este produto não pode ser excluído porque está em uso — ${partes.join(' e ')}. Tire o vínculo lá ou deixe o produto inativo.`);
      return;
    }
    if (!await confirmar('Excluir este produto? A estrutura BOM também será removida.')) { setDeletando(null); return; }
    const { data: apagados, error } = await supabase.from('cadastro_produtos').delete().eq('id', id).select('id');
    setDeletando(null);
    if (error || !(apagados || []).length) { alert('Não foi possível excluir: ' + (error?.message || 'o banco não apagou nada') + '.'); return; }
    setProdutos(prev => prev.filter(p => p.id !== id));
  };

  const stats = {
    total:  produtos.length,
    ativos: produtos.filter(p => p.ativo).length,
    cats:   new Set(produtos.filter(p => p.categoria).map(p => p.categoria)).size,
  };


  return (
    <div className="acn-cp-c1277">
      {/* Cabeçalho */}
      <div className="acn-quebra acn-cp-c1279">
        <div>
          <div className="acn-cp-c1281">🏭 Produto e Mercadorias</div>
          <div className="acn-cp-c1282">Produtos compostos de itens do catálogo (BOM — Bill of Materials)</div>
        </div>
        <div className="acn-quebra acn-cp-c1284">
          {[
            { label: 'Total', value: stats.total, cor: 'roxo' },
            { label: 'Ativos', value: stats.ativos, cor: 'verde' },
            { label: 'Categorias', value: stats.cats, cor: 'teal' },
          ].map(s => (
            <div key={s.label} className="acn-cp-c1290">
              <div className={('acn-cp-stat acn-cp-stat-' + s.cor) + ' acn-cp-c1291'}>{s.value}</div>
              <div className="acn-cp-c1292">{s.label}</div>
            </div>
          ))}
          <Botao
            onClick={() => { setDuplicarDe(null); setModal({}); }}
            className="acn-cp-bt acn-cp-b1297"
          >
            ➕ Novo Produto
          </Botao>
        </div>
      </div>

      {erroLista && (
        <div className="acn-cp-c823">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregar()}>Tentar de novo</Botao>}>
            Não foi possível ler os produtos ({erroLista}). {listaLida ? 'A lista abaixo é a última que foi lida.' : 'Isso não quer dizer que não haja produtos cadastrados.'}
          </Faixa>
        </div>
      )}

      {/* Filtros */}
      <div className="acn-cp-c1313">
        <input
          placeholder="🔍 Buscar por nome, código, categoria..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="acn-cp-inp1317"
        />
        <select value={filtCat} onChange={e => setFiltCat(e.target.value)}
          className="acn-cp-sel1320">
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['todos', 'ativo', 'inativo'] as const).map(v => (
          <Botao key={v} onClick={() => setFiltAtivo(v)}
            className={'acn-cp-bt acn-cp-b1326' + (filtAtivo === v ? ' acn-cp-b1326-2' : ' acn-cp-b1326-3')}>
            {v === 'todos' ? 'Todos' : v === 'ativo' ? '✅ Ativos' : '⛔ Inativos'}
          </Botao>
        ))}
        <span className="acn-cp-s1330">{filtrados.length} produto{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tabela */}
      <div className="acn-cp-c1334">
        {loading ? (
          <div className="acn-cp-c1336">Carregando produtos...</div>
        ) : filtrados.length === 0 ? (
          !listaLida ? null : (
          <div className="acn-cp-c1339">
            {produtos.length === 0
              ? 'Nenhum produto cadastrado. Clique em "Novo Produto" para começar.'
              : 'Nenhum produto encontrado para os filtros aplicados.'}
          </div>
          )
        ) : (
          <div className="acn-cp-c1346">
            <table className="acn-cp-tb1151">
              <thead>
                <tr>
                  <th className="acn-cp-cel1350" onClick={() => sortBy('codigo')}>Código {sortIcon('codigo')}</th>
                  <th className="acn-cp-cel1350" onClick={() => sortBy('nome')}>Nome do Produto {sortIcon('nome')}</th>
                  <th className="acn-cp-cel1350" onClick={() => sortBy('categoria')}>Categoria {sortIcon('categoria')}</th>
                  <th className="acn-cp-cel1353">Un.</th>
                  <th className="acn-cp-cel1354">Custo BOM</th>
                  <th className="acn-cp-cel1354">Markup%</th>
                  <th className="acn-cp-cel1354" onClick={() => sortBy('preco_venda')}>Preço Venda {sortIcon('preco_venda')}</th>
                  <th className="acn-cp-cel1353">Ativo</th>
                  <th className="acn-cp-cel1353">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p, idx) => (
                  <tr key={p.id} className={'acn-cp-tr ' + (p.ativo ? (idx % 2 === 0 ? 'acn-cp-tr-par' : 'acn-cp-tr-impar') : 'acn-cp-tr-inativo')}>
                    <td className="acn-cp-td1364">{p.codigo || '—'}</td>
                    <td className="acn-cp-td1365">
                      <div>{p.nome}</div>
                      {p.descricao && <div className="acn-cp-c1367">{p.descricao}</div>}
                    </td>
                    <td className="acn-cp-td1369">
                      {p.categoria ? (
                        <span className="acn-cp-s1371">{p.categoria}</span>
                      ) : <span className="acn-cp-s1372">—</span>}
                    </td>
                    <td className="acn-cp-td1374">
                      <span className="acn-cp-s1375">{p.unidade}</span>
                    </td>
                    <td className="acn-cp-td1377">—</td>
                    <td className="acn-cp-td1378">{fmtPct(p.markup_pct)}</td>
                    <td className="acn-cp-td1379">
                      {p.preco_venda ? fmtR(p.preco_venda) : <span className="acn-cp-s1372">—</span>}
                      {p.preco_manual && <span className="acn-cp-s1381">(M)</span>}
                    </td>
                    <td className="acn-cp-td1374">
                      <span className={'acn-cp-s1384' + (p.ativo ? ' acn-cp-s1384-2' : ' acn-cp-s1384-3')}>
                        {p.ativo ? '✅ Ativo' : '⛔ Inativo'}
                      </span>
                    </td>
                    <td className="acn-cp-td1374">
                      <div className="acn-cp-c1389">
                        <Botao onClick={() => setBomView(p)} title="Ver estrutura BOM"
                          className="acn-cp-bt acn-cp-b1391">
                          🔩
                        </Botao>
                        <Botao onClick={() => { setDuplicarDe(p.id); setModal({ ...p, id: undefined, codigo: '', nome: `${p.nome} (cópia)` }); }} title="Duplicar este kit como um novo produto"
                          className="acn-cp-bt acn-cp-b1395">
                          ⧉
                        </Botao>
                        <Botao onClick={() => { setDuplicarDe(null); setModal(p); }} title="Editar"
                          className="acn-cp-bt acn-cp-b1395">
                          ✏️
                        </Botao>
                        <Botao onClick={() => excluir(p.id)} disabled={deletando === p.id} title="Excluir"
                          className={'acn-cp-bt acn-cp-b1403' + (deletando === p.id ? ' acn-cp-b1403-2' : ' acn-cp-b1077-5')}>
                          🗑️
                        </Botao>
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
