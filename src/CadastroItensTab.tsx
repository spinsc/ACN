// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

// ─── Constantes ──────────────────────────────────────────────────────────────
const MOEDAS   = ['REAL', 'USD', 'EUR'];
const UNIDADES = ['UN', 'PC', 'KG', 'M', 'M²', 'M³', 'L', 'CX', 'RL', 'PR', 'JG', 'KIT', 'VB'];
const CATEGORIAS_DEFAULT = [
  'Elétrico', 'Eletrônico', 'Mecânico', 'Hidráulico', 'Pneumático',
  'Estrutural', 'Chicote', 'Acessório', 'Consumível', 'Serviço', 'Outro',
];

const ITEM_VAZIO = {
  codigo: '', nome: '', descricao: '', unidade: 'UN', categoria: '',
  ncm: '', marca: '', fornecedor: '', moeda: 'REAL', custo_unit: 0,
  ipi_pct: 0, st_pct: 0, difal_pct: 16, imposto_pct: 16,
  markup_pct: 30, custo_fixo_pct: 3, ativo: true,
};

function moedaSimbolo(m: string) {
  if (m === 'USD') return '$';
  if (m === 'EUR') return '€';
  return 'R$';
}

function fmtMoeda(v: number, moeda = 'REAL') {
  const s = moedaSimbolo(moeda);
  return `${s} ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number) {
  return `${Number(v || 0).toFixed(2)}%`;
}

// ─── Import/Export XLSX ────────────────────────────────────────────────────────
// Template único: exportar sempre gera essas colunas, importar sempre espera essas colunas.
const TEMPLATE_COLS: { label: string; key: string }[] = [
  { label: 'Código',          key: 'codigo' },
  { label: 'Nome',            key: 'nome' },
  { label: 'Descrição',       key: 'descricao' },
  { label: 'Unidade',         key: 'unidade' },
  { label: 'Categoria',       key: 'categoria' },
  { label: 'NCM',             key: 'ncm' },
  { label: 'Marca',           key: 'marca' },
  { label: 'Fornecedor',      key: 'fornecedor' },
  { label: 'Moeda',           key: 'moeda' },
  { label: 'Custo Unitário',  key: 'custo_unit' },
  { label: 'IPI %',           key: 'ipi_pct' },
  { label: 'ST %',            key: 'st_pct' },
  { label: 'DIFAL %',         key: 'difal_pct' },
  { label: 'Impostos %',      key: 'imposto_pct' },
  { label: 'Markup %',        key: 'markup_pct' },
  { label: 'Custo Fixo %',    key: 'custo_fixo_pct' },
  { label: 'Ativo',           key: 'ativo' },
];

function normalizarCabecalho(s: string) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos (marcas diacriticas combinantes pos-NFD)
    .toLowerCase().replace(/[^a-z0-9]/g, ''); // remove espaços, %, etc.
}

// mapa "cabecalhonormalizado" -> chave do campo, construído a partir do template
const MAPA_IMPORT: Record<string, string> = {};
TEMPLATE_COLS.forEach(c => { MAPA_IMPORT[normalizarCabecalho(c.label)] = c.key; });
// aliases adicionais aceitos na importação
MAPA_IMPORT[normalizarCabecalho('CODITEM')]      = 'codigo';
MAPA_IMPORT[normalizarCabecalho('Cod Item')]     = 'codigo';
MAPA_IMPORT[normalizarCabecalho('Nome/Produto')] = 'nome';
MAPA_IMPORT[normalizarCabecalho('Custo Unit.')]  = 'custo_unit';
MAPA_IMPORT[normalizarCabecalho('Custo Unitario')] = 'custo_unit';

function itemParaLinhaExport(it: any) {
  const linha: Record<string, any> = {};
  TEMPLATE_COLS.forEach(c => {
    if (c.key === 'ativo') { linha[c.label] = it.ativo ? 'Sim' : 'Não'; return; }
    linha[c.label] = it[c.key] ?? '';
  });
  return linha;
}

function exportarItens(itens: any[], nomeArquivo: string) {
  const linhas = itens.map(itemParaLinhaExport);
  const ws = XLSX.utils.json_to_sheet(linhas, { header: TEMPLATE_COLS.map(c => c.label) });
  ws['!cols'] = TEMPLATE_COLS.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itens');
  XLSX.writeFile(wb, nomeArquivo);
}

function parseValorBool(v: any) {
  const s = String(v ?? '').trim().toLowerCase();
  return !(s === 'não' || s === 'nao' || s === 'n' || s === 'false' || s === '0' || s === 'inativo');
}

function parseNumero(v: any) {
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Lê um arquivo .xlsx/.xls/.csv e retorna os itens já mapeados para o schema de cadastro_itens
async function lerArquivoItens(file: File): Promise<any[]> {
  const ehCsv = /\.csv$/i.test(file.name);
  // CSV é texto puro sem metadado de encoding — decodifica como UTF-8 explicitamente
  // (o parser binário do XLSX assume codepage 1252 para CSV e corrompe acentos/cabeçalhos).
  const wb = ehCsv
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const primeiraAba = wb.SheetNames[0];
  const linhas: any[] = XLSX.utils.sheet_to_json(wb.Sheets[primeiraAba], { defval: '' });

  return linhas.map(linha => {
    const item: any = { codigo: null, nome: '', unidade: 'UN', moeda: 'REAL', ativo: true };
    for (const [cabecalho, valor] of Object.entries(linha)) {
      const chave = MAPA_IMPORT[normalizarCabecalho(cabecalho)];
      if (!chave) continue;
      if (chave === 'ativo') item[chave] = parseValorBool(valor);
      else if (['custo_unit', 'ipi_pct', 'st_pct', 'difal_pct', 'imposto_pct', 'markup_pct', 'custo_fixo_pct'].includes(chave)) {
        item[chave] = parseNumero(valor);
      } else if (chave === 'codigo') {
        item.codigo = String(valor ?? '').trim() || null; // '' vira null (índice único não aceita duplicar '')
      } else {
        item[chave] = String(valor ?? '').trim();
      }
    }
    return item;
  }).filter(it => it.nome); // ignora linhas sem nome (obrigatório)
}

// ─── Modal de criação/edição ──────────────────────────────────────────────────
function ItemModal({
  item, onSave, onClose, categorias, currentUser,
}: {
  item: any; onSave: (data: any) => void; onClose: () => void;
  categorias: string[]; currentUser: any;
}) {
  const [form, setForm] = useState<any>({ ...ITEM_VAZIO, ...item });
  const [salvando, setSalvando] = useState(false);
  const isEdit = !!item?.id;

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 7px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 11, boxSizing: 'border-box', background: '#fff', color: '#374151',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 9, fontWeight: 700, color: '#6b7280',
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.4px',
  };

  const handleSave = async () => {
    if (!form.nome?.trim()) return;
    setSalvando(true);
    const payload = {
      codigo:        form.codigo?.trim() || null,
      nome:          form.nome.trim(),
      descricao:     form.descricao?.trim() || null,
      unidade:       form.unidade || 'UN',
      categoria:     form.categoria?.trim() || null,
      ncm:           form.ncm?.trim() || null,
      marca:         form.marca?.trim() || '',
      fornecedor:    form.fornecedor?.trim() || '',
      moeda:         form.moeda || 'REAL',
      custo_unit:    Number(form.custo_unit) || 0,
      ipi_pct:       Number(form.ipi_pct) || 0,
      st_pct:        Number(form.st_pct) || 0,
      difal_pct:     Number(form.difal_pct) || 0,
      imposto_pct:   Number(form.imposto_pct) || 0,
      markup_pct:    Number(form.markup_pct) || 0,
      custo_fixo_pct: Number(form.custo_fixo_pct) || 0,
      ativo:         form.ativo !== false,
      criado_por:    form.criado_por || currentUser?.email || '',
    };
    await onSave({ id: form.id, ...payload });
    setSalvando(false);
  };

  const Section = ({ title }: { title: string }) => (
    <div style={{
      fontSize: 9, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase',
      letterSpacing: '.6px', borderBottom: '1px solid #e2e8f0', paddingBottom: 3,
      marginBottom: 8, marginTop: 14,
    }}>
      {title}
    </div>
  );

  const Row = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>{children}</div>
  );

  const Field = ({ label, width = 'auto', flex = 1, children }: any) => (
    <div style={{ flex, minWidth: 90, width }}>
      <span style={lbl}>{label}</span>
      {children}
    </div>
  );

  // Calcula preço final estimado
  const precoFinal = (() => {
    const cu = Number(form.custo_unit) || 0;
    const ipi = 1 + (Number(form.ipi_pct) || 0) / 100;
    const st  = 1 + (Number(form.st_pct) || 0) / 100;
    const imp = 1 - (Number(form.imposto_pct) || 0) / 100;
    const cf  = 1 - (Number(form.custo_fixo_pct) || 0) / 100;
    const mk  = 1 - (Number(form.markup_pct) || 0) / 100;
    const di  = 1 + (Number(form.difal_pct) || 0) / 100;
    if (imp <= 0 || cf <= 0 || mk <= 0) return 0;
    return (cu * ipi * st * di) / (imp * cf * mk);
  })();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: 660, maxWidth: '96vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)',
      }}>
        {/* Header */}
        <div style={{
          background: '#0f766e', color: '#fff', padding: '12px 16px',
          borderRadius: '10px 10px 0 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>
              {isEdit ? '✏️ Editar Item' : '➕ Novo Item'}
            </div>
            <div style={{ fontSize: 10, color: '#99f6e4', marginTop: 1 }}>
              Cadastro de Itens — base para cotações e compras
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#fff',
            fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '14px 16px', flex: 1 }}>

          <Section title="📦 Identificação" />
          <Row>
            <Field label="CODITEM" flex={0.5}>
              <input style={inp} value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="Ex: ELT-001" />
            </Field>
            <Field label="Nome / Produto *" flex={2}>
              <input style={{ ...inp, borderColor: !form.nome ? '#f87171' : '#d1d5db' }}
                value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Descrição do item" />
            </Field>
          </Row>
          <Row>
            <Field label="Descrição completa" flex={3}>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }}
                value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Especificações, referências, observações..." />
            </Field>
          </Row>
          <Row>
            <Field label="Categoria">
              <select style={inp} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                <option value="">— Selecionar —</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Unidade">
              <select style={inp} value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="NCM">
              <input style={inp} value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="0000.00.00" />
            </Field>
            <Field label="Ativo" flex={0.4}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)}
                  style={{ accentColor: '#0f766e', width: 14, height: 14 }} />
                <span style={{ fontSize: 10, color: '#374151' }}>Sim</span>
              </div>
            </Field>
          </Row>

          <Section title="🏭 Fornecedor / Fabricante" />
          <Row>
            <Field label="Marca">
              <input style={inp} value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="Ex: Schneider" />
            </Field>
            <Field label="Fornecedor preferencial">
              <input style={inp} value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} placeholder="Ex: Distribuidora ABC" />
            </Field>
          </Row>

          <Section title="💰 Custo e Moeda" />
          <Row>
            <Field label="Moeda" flex={0.5}>
              <select style={inp} value={form.moeda} onChange={e => set('moeda', e.target.value)}>
                {MOEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label={`Custo Unitário (${moedaSimbolo(form.moeda)})`} flex={1.2}>
              <input style={inp} type="number" min={0} step="0.01"
                value={form.custo_unit} onChange={e => set('custo_unit', e.target.value)}
                placeholder="0,00" />
            </Field>
          </Row>

          <Section title="📊 Impostos e Markup" />
          <Row>
            <Field label="IPI (%)">
              <input style={inp} type="number" min={0} max={100} step="0.01"
                value={form.ipi_pct} onChange={e => set('ipi_pct', e.target.value)} />
            </Field>
            <Field label="ST (%)">
              <input style={inp} type="number" min={0} max={100} step="0.01"
                value={form.st_pct} onChange={e => set('st_pct', e.target.value)} />
            </Field>
            <Field label="DIFAL (%)">
              <input style={inp} type="number" min={0} max={100} step="0.01"
                value={form.difal_pct} onChange={e => set('difal_pct', e.target.value)} />
            </Field>
            <Field label="Impostos s/Venda (%)">
              <input style={inp} type="number" min={0} max={100} step="0.01"
                value={form.imposto_pct} onChange={e => set('imposto_pct', e.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="Markup (%)">
              <input style={inp} type="number" min={0} max={200} step="0.5"
                value={form.markup_pct} onChange={e => set('markup_pct', e.target.value)} />
            </Field>
            <Field label="Custo Fixo (%)">
              <input style={inp} type="number" min={0} max={100} step="0.5"
                value={form.custo_fixo_pct} onChange={e => set('custo_fixo_pct', e.target.value)} />
            </Field>
            <Field label="Preço Final Estimado" flex={2}>
              <div style={{
                padding: '5px 10px', background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: 4, fontSize: 13, fontWeight: 800, color: '#15803d',
              }}>
                {fmtMoeda(precoFinal, form.moeda)}
              </div>
            </Field>
          </Row>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex',
          justifyContent: 'flex-end', gap: 8, flexShrink: 0, background: '#fafafa',
          borderRadius: '0 0 10px 10px',
        }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 5,
            background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151',
          }}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={salvando || !form.nome?.trim()}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 5,
              background: !form.nome?.trim() ? '#9ca3af' : '#0f766e', color: '#fff',
              cursor: !form.nome?.trim() ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 700, opacity: salvando ? .6 : 1,
            }}
          >
            {salvando ? 'Salvando...' : isEdit ? '💾 Salvar Alterações' : '✅ Cadastrar Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CadastroItensTab({ currentUser }: { currentUser: any }) {
  const [itens, setItens]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busca, setBusca]           = useState('');
  const [filtCat, setFiltCat]       = useState('');
  const [filtAtivo, setFiltAtivo]   = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  const [modal, setModal]           = useState<any>(null); // null | {} | item
  const [deletando, setDeletando]   = useState<string | null>(null);
  const [categorias, setCategorias] = useState<string[]>([...CATEGORIAS_DEFAULT]);
  const [ordenar, setOrdenar]       = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'nome', dir: 'asc' });
  const [pagina, setPagina]         = useState(0);
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{ novos: number; atualizados: number; ignorados: number; erro?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const POR_PAG = 50;

  // ── Carregar itens ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    // Supabase limita a 1000 linhas por requisição — pagina até esgotar
    // (necessário desde a importação em massa que passou de 4.000 itens).
    const PAGINA_SUPABASE = 1000;
    let lista: any[] = [];
    for (let offset = 0; ; offset += PAGINA_SUPABASE) {
      const { data } = await supabase
        .from('cadastro_itens')
        .select('*')
        .order(ordenar.col, { ascending: ordenar.dir === 'asc' })
        .range(offset, offset + PAGINA_SUPABASE - 1);
      const pagina = data || [];
      lista = lista.concat(pagina);
      if (pagina.length < PAGINA_SUPABASE) break;
    }
    setItens(lista);

    // Extrair categorias únicas (merge com default)
    const cats = [...new Set([
      ...CATEGORIAS_DEFAULT,
      ...lista.map((i: any) => i.categoria).filter(Boolean),
    ])].sort();
    setCategorias(cats);
    setLoading(false);
  }, [ordenar]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtros aplicados ───────────────────────────────────────────────────────
  const filtrados = itens.filter(it => {
    if (filtAtivo === 'ativo'   && !it.ativo) return false;
    if (filtAtivo === 'inativo' &&  it.ativo) return false;
    if (filtCat && it.categoria !== filtCat) return false;
    if (busca.trim()) {
      const t = busca.toLowerCase();
      return (
        it.nome?.toLowerCase().includes(t) ||
        it.codigo?.toLowerCase().includes(t) ||
        it.marca?.toLowerCase().includes(t) ||
        it.fornecedor?.toLowerCase().includes(t) ||
        it.ncm?.toLowerCase().includes(t)
      );
    }
    return true;
  });

  const total = filtrados.length;
  const paginas = Math.ceil(total / POR_PAG);
  const visiveis = filtrados.slice(pagina * POR_PAG, (pagina + 1) * POR_PAG);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const salvarItem = async (data: any) => {
    if (data.id) {
      const { id, ...payload } = data;
      await supabase.from('cadastro_itens').update(payload).eq('id', id);
    } else {
      await supabase.from('cadastro_itens').insert([{ ...data, criado_por: currentUser?.email }]);
    }
    setModal(null);
    await carregar();
  };

  const toggleAtivo = async (item: any) => {
    await supabase.from('cadastro_itens').update({ ativo: !item.ativo }).eq('id', item.id);
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i));
  };

  const excluirItem = async (id: string) => {
    if (!window.confirm('Excluir este item permanentemente?')) return;
    setDeletando(id);
    await supabase.from('cadastro_itens').delete().eq('id', id);
    setItens(prev => prev.filter(i => i.id !== id));
    setDeletando(null);
  };

  // ── Import/Export ──────────────────────────────────────────────────────────
  const handleExportar = () => {
    const nomeArquivo = `cadastro_itens_${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportarItens(filtrados, nomeArquivo);
  };

  const handleBaixarModelo = () => {
    exportarItens([], 'modelo_cadastro_itens.xlsx');
  };

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setImportando(true);
    setResultadoImport(null);
    try {
      const linhas = await lerArquivoItens(file);
      if (linhas.length === 0) {
        setResultadoImport({ novos: 0, atualizados: 0, ignorados: 0, erro: 'Nenhuma linha válida encontrada (verifique se a coluna "Nome" está preenchida).' });
        return;
      }

      const comCodigo = linhas.filter(l => l.codigo);
      const semCodigo = linhas.filter(l => !l.codigo);
      let atualizados = 0, novos = 0;
      const TAM_LOTE = 500;

      // Itens com código: upsert (atualiza se já existir, cria se não existir)
      for (let i = 0; i < comCodigo.length; i += TAM_LOTE) {
        const lote = comCodigo.slice(i, i + TAM_LOTE).map(it => ({ ...it, criado_por: currentUser?.email || '' }));
        const { data: existentes } = await supabase
          .from('cadastro_itens').select('codigo').in('codigo', lote.map(it => it.codigo));
        const codigosExistentes = new Set((existentes || []).map((e: any) => e.codigo));
        const { error } = await supabase.from('cadastro_itens').upsert(lote, { onConflict: 'codigo' });
        if (error) throw error;
        lote.forEach(it => codigosExistentes.has(it.codigo) ? atualizados++ : novos++);
      }

      // Itens sem código: sempre insert (não há como identificar duplicata)
      for (let i = 0; i < semCodigo.length; i += TAM_LOTE) {
        const lote = semCodigo.slice(i, i + TAM_LOTE).map(it => ({ ...it, criado_por: currentUser?.email || '' }));
        const { error } = await supabase.from('cadastro_itens').insert(lote);
        if (error) throw error;
        novos += lote.length;
      }

      setResultadoImport({ novos, atualizados, ignorados: 0 });
      await carregar();
    } catch (err: any) {
      setResultadoImport({ novos: 0, atualizados: 0, ignorados: 0, erro: err?.message || 'Erro ao importar arquivo.' });
    } finally {
      setImportando(false);
    }
  };

  // ── Ordenação ───────────────────────────────────────────────────────────────
  const sortBy = (col: string) => {
    setOrdenar(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
    setPagina(0);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (ordenar.col !== col) return <span style={{ opacity: .3 }}>⇅</span>;
    return <span>{ordenar.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── Estatísticas ────────────────────────────────────────────────────────────
  const stats = {
    total: itens.length,
    ativos: itens.filter(i => i.ativo).length,
    cats: new Set(itens.filter(i => i.categoria).map(i => i.categoria)).size,
  };

  const thStyle: React.CSSProperties = {
    background: '#1e293b', color: '#cbd5e1', padding: '6px 8px',
    fontSize: 9, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', borderRight: '1px solid #334155',
  };

  const tdStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: 10, borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle', color: '#374151',
  };

  return (
    <div style={{ padding: 10 }}>
      {/* ── Cabeçalho ── */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '10px 14px', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>📦 Cadastro de Itens (CODITEM)</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
            Base de itens para composição de preços, compras e orçamentos
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Stats */}
          {[
            { label: 'Total de itens', value: stats.total, cor: '#0f766e' },
            { label: 'Ativos',         value: stats.ativos, cor: '#16a34a' },
            { label: 'Categorias',     value: stats.cats, cor: '#7c3aed' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center', background: '#f8fafc',
              borderRadius: 6, padding: '5px 12px', border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.cor }}>{s.value}</div>
              <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleArquivoSelecionado}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
            title="Importar itens de planilha Excel (.xlsx) ou CSV"
            style={{
              padding: '7px 12px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e',
              borderRadius: 6, cursor: importando ? 'wait' : 'pointer', fontWeight: 700, fontSize: 11,
              opacity: importando ? .6 : 1,
            }}
          >
            {importando ? '⏳ Importando...' : '📥 Importar'}
          </button>
          <button
            onClick={handleExportar}
            title="Exportar itens filtrados para Excel (.xlsx)"
            style={{
              padding: '7px 12px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e',
              borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11,
            }}
          >
            📤 Exportar ({filtrados.length})
          </button>
          <button
            onClick={() => setModal({})}
            style={{
              padding: '7px 14px', background: '#0f766e', color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 11,
            }}
          >
            ➕ Novo Item
          </button>
        </div>
      </div>

      {/* ── Resultado da importação ── */}
      {resultadoImport && (
        <div style={{
          background: resultadoImport.erro ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${resultadoImport.erro ? '#fca5a5' : '#86efac'}`,
          borderRadius: 8, padding: '8px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          fontSize: 11, color: resultadoImport.erro ? '#991b1b' : '#15803d', fontWeight: 600,
        }}>
          <span>
            {resultadoImport.erro
              ? `❌ ${resultadoImport.erro}`
              : `✅ Importação concluída — ${resultadoImport.novos} novo(s), ${resultadoImport.atualizados} atualizado(s).`}
          </span>
          <button onClick={() => setResultadoImport(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'inherit',
          }}>✕</button>
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '8px 12px', marginBottom: 10,
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          placeholder="🔍 Buscar por nome, código, marca, fornecedor, NCM..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPagina(0); }}
          style={{
            flex: 1, minWidth: 220, padding: '5px 9px', border: '1px solid #d1d5db',
            borderRadius: 5, fontSize: 11, color: '#374151',
          }}
        />
        <select
          value={filtCat}
          onChange={e => { setFiltCat(e.target.value); setPagina(0); }}
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, color: '#374151' }}
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['todos', 'ativo', 'inativo'] as const).map(v => (
          <button
            key={v}
            onClick={() => { setFiltAtivo(v); setPagina(0); }}
            style={{
              padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: filtAtivo === v ? '#0f766e' : '#fff',
              color: filtAtivo === v ? '#fff' : '#374151',
            }}
          >
            {v === 'todos' ? 'Todos' : v === 'ativo' ? '✅ Ativos' : '⛔ Inativos'}
          </button>
        ))}
        {(busca || filtCat || filtAtivo !== 'ativo') && (
          <button
            onClick={() => { setBusca(''); setFiltCat(''); setFiltAtivo('ativo'); setPagina(0); }}
            style={{ padding: '4px 8px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}
          >
            ✕ Limpar
          </button>
        )}
        <button
          onClick={handleBaixarModelo}
          title="Baixar planilha modelo com as colunas esperadas na importação"
          style={{
            padding: '4px 8px', border: '1px dashed #94a3b8', background: '#f8fafc',
            color: '#475569', borderRadius: 5, fontSize: 10, cursor: 'pointer', marginLeft: 'auto',
          }}
        >
          📄 Baixar modelo
        </button>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          {total} item{total !== 1 ? 'ns' : ''}
        </span>
      </div>

      {/* ── Tabela ── */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
            Carregando itens...
          </div>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>
            {itens.length === 0
              ? 'Nenhum item cadastrado. Clique em "Novo Item" para começar.'
              : 'Nenhum item encontrado para os filtros aplicados.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => sortBy('codigo')}>Código <SortIcon col="codigo" /></th>
                  <th style={thStyle} onClick={() => sortBy('nome')}>Nome / Produto <SortIcon col="nome" /></th>
                  <th style={thStyle} onClick={() => sortBy('categoria')}>Categoria <SortIcon col="categoria" /></th>
                  <th style={thStyle} onClick={() => sortBy('marca')}>Marca <SortIcon col="marca" /></th>
                  <th style={thStyle} onClick={() => sortBy('fornecedor')}>Fornecedor <SortIcon col="fornecedor" /></th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Un.</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Moeda</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => sortBy('custo_unit')}>Custo Unit. <SortIcon col="custo_unit" /></th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>IPI%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>ST%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Markup%</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>NCM</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ativo</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(it => (
                  <tr key={it.id} style={{ background: it.ativo ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', fontFamily: 'monospace', fontSize: 9 }}>
                      {it.codigo || '—'}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 200 }}>
                      <div style={{ lineHeight: 1.3 }}>{it.nome}</div>
                      {it.descricao && (
                        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, maxWidth: 200, wordBreak:'break-word' }}>
                          {it.descricao}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {it.categoria ? (
                        <span style={{
                          background: '#e0f2fe', color: '#0369a1',
                          padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                        }}>{it.categoria}</span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={tdStyle}>{it.marca || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={tdStyle}>{it.fornecedor || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        background: '#f1f5f9', color: '#475569',
                        padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                      }}>{it.unidade}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 9, fontWeight: 700, color: it.moeda !== 'REAL' ? '#7c3aed' : '#374151' }}>
                      {it.moeda}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontFamily: 'monospace' }}>
                      {fmtMoeda(it.custo_unit, it.moeda)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>{fmtPct(it.ipi_pct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>{fmtPct(it.st_pct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmtPct(it.markup_pct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: 9, color: '#9ca3af' }}>
                      {it.ncm || '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => toggleAtivo(it)}
                        title={it.ativo ? 'Desativar item' : 'Reativar item'}
                        style={{
                          padding: '2px 8px', border: 'none', borderRadius: 10, cursor: 'pointer',
                          fontSize: 9, fontWeight: 700,
                          background: it.ativo ? '#dcfce7' : '#fee2e2',
                          color: it.ativo ? '#15803d' : '#991b1b',
                        }}
                      >
                        {it.ativo ? '✅ Ativo' : '⛔ Inativo'}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          onClick={() => setModal(it)}
                          title="Editar"
                          style={{
                            padding: '3px 8px', border: '1px solid #d1d5db', background: '#fff',
                            borderRadius: 4, cursor: 'pointer', fontSize: 10,
                          }}
                        >✏️</button>
                        <button
                          onClick={() => excluirItem(it.id)}
                          disabled={deletando === it.id}
                          title="Excluir"
                          style={{
                            padding: '3px 8px', border: '1px solid #fca5a5', background: '#fef2f2',
                            borderRadius: 4, cursor: deletando === it.id ? 'not-allowed' : 'pointer',
                            fontSize: 10, opacity: deletando === it.id ? .5 : 1,
                          }}
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginação ── */}
        {paginas > 1 && (
          <div style={{
            padding: '8px 14px', borderTop: '1px solid #f1f5f9',
            display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 9, color: '#6b7280', marginRight: 6 }}>
              {pagina * POR_PAG + 1}–{Math.min((pagina + 1) * POR_PAG, total)} de {total}
            </span>
            <button
              onClick={() => setPagina(0)} disabled={pagina === 0}
              style={{ padding: '2px 6px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 4, cursor: pagina === 0 ? 'not-allowed' : 'pointer', fontSize: 10, opacity: pagina === 0 ? .4 : 1 }}
            >«</button>
            <button
              onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}
              style={{ padding: '2px 6px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 4, cursor: pagina === 0 ? 'not-allowed' : 'pointer', fontSize: 10, opacity: pagina === 0 ? .4 : 1 }}
            >‹</button>
            {Array.from({ length: Math.min(paginas, 7) }, (_, i) => {
              const p = paginas <= 7 ? i : Math.max(0, Math.min(paginas - 7, pagina - 3)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPagina(p)}
                  style={{
                    padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4,
                    fontSize: 10, cursor: 'pointer',
                    background: pagina === p ? '#0f766e' : '#fff',
                    color: pagina === p ? '#fff' : '#374151',
                    fontWeight: pagina === p ? 700 : 400,
                  }}
                >{p + 1}</button>
              );
            })}
            <button
              onClick={() => setPagina(p => p + 1)} disabled={pagina >= paginas - 1}
              style={{ padding: '2px 6px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 4, cursor: pagina >= paginas - 1 ? 'not-allowed' : 'pointer', fontSize: 10, opacity: pagina >= paginas - 1 ? .4 : 1 }}
            >›</button>
            <button
              onClick={() => setPagina(paginas - 1)} disabled={pagina >= paginas - 1}
              style={{ padding: '2px 6px', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 4, cursor: pagina >= paginas - 1 ? 'not-allowed' : 'pointer', fontSize: 10, opacity: pagina >= paginas - 1 ? .4 : 1 }}
            >»</button>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modal !== null && (
        <ItemModal
          item={modal}
          onSave={salvarItem}
          onClose={() => setModal(null)}
          categorias={categorias}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
