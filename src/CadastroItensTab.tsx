// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';
import { normalizarBusca, combinaBusca } from './SearchUtils';
import { custoComImpostos, precoUnitario } from './FormacaoCalculo';
import { lerPlanilha, primeiraAbaComDados } from './LerPlanilha';
import { EXT_PLANILHAS_IMPORTACAO } from './FormatosArquivo';
import { confirmar } from './Feedback';
import { CamposEstoqueItem, CamposEstruturaChicote } from './Estoque';
import { hojeISO, Faixa, Botao, Selo } from './Interface';
import { lerPaginado } from './LerPaginado';

// ─── Constantes ──────────────────────────────────────────────────────────────
const MOEDAS   = ['REAL', 'USD', 'EUR'];
const UNIDADES = ['UN', 'PC', 'KG', 'M', 'M²', 'M³', 'L', 'CX', 'RL', 'PR', 'JG', 'KIT', 'VB'];
const CATEGORIAS_DEFAULT = [
  'Elétrico', 'Eletrônico', 'Mecânico', 'Hidráulico', 'Pneumático',
  'Estrutural', 'Chicote', 'Acessório', 'Consumível', 'Serviço', 'Outro',
];

const ITEM_VAZIO = {
  codigo: '', nome: '', descricao: '', unidade: 'UN', categoria: '',
  ncm: '', marca: '', fornecedor: '', moeda: 'REAL', custo_unit: 0, compra_multiplo: 1, custo_embalagem: null,
  ipi_pct: 0, st_pct: 0, difal_pct: 0, imposto_pct: 16,   // DIFAL começa zerado (depende do destino da venda)
  markup_pct: 30, custo_fixo_pct: 3, ativo: true,
  // Fabricação interna: é o que faz o PCP abrir a demanda do setor sozinho ao
  // liberar o kiting, e o que já roteia a reposição do Almoxarifado.
  origem_producao: 'externa', setor_fabricante: '',
  // Telecom, fatia T2 (pedido do usuário em 22/10/2026): quem separa e embala este item numa venda de envio. Vazio = Almoxarifado (o padrão da venda).
  setor_separacao: '',
  // Número de série (pedido do usuário em 27/10/2026): o item entra sozinho na lista de seriais da Venda para Envio no Almoxarifado
  tem_serial: false,
  // Controle de estoque é opt-in (ver Estoque.tsx): item nasce sem controle e
  // só passa a dar baixa, conferir mínimo e travar liberação quando alguém do
  // Almoxarifado ligar o checkbox — decidido com o usuário em 24/09/2026.
  controla_estoque: false, estoque_atual: 0, estoque_minimo: null, estoque_ideal: null,
  tem_inacabado: false, estoque_inacabado: 0, inacabado_minimo: null, inacabado_ideal: null,
  servico_acabamento: '', servico_bruto: '',
};

/** Setores que fabricam item aqui dentro (mesma lista das demandas) */
const SETORES_FABRICANTES = ['Chicotes', 'Serralheria'];

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

// "CONJUNTO ELETRICO PV 747", "CONJUNTO ELETRICO OPL A0690", "COPIA DE CONJUNTO ELETRICO PV 67" — os criados por pedido.
// O item "CONJUNTO ELETRICO" puro (código 1687, o gatilho) NÃO casa: exige algo depois do nome.
const CONJUNTO_POR_PEDIDO = /^(copia de\s+)?conjunto\s+el[eé]trico\s+\S/i;

function parseValorBool(v: any) {
  const s = String(v ?? '').trim().toLowerCase();
  return !(s === 'não' || s === 'nao' || s === 'n' || s === 'false' || s === '0' || s === 'inativo');
}

function parseNumero(v: any) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // Texto (CSV/TXT, célula formatada como texto): aceita "R$ 1.234,56", "16%",
  // "10,5" e também o americano "1,234.56" — o separador que aparece por
  // último é o decimal; o outro é de milhar.
  let s = String(v).replace(/[R$%\s]/g, '');
  const virgula = s.lastIndexOf(','), ponto = s.lastIndexOf('.');
  if (virgula > ponto) s = s.replace(/\./g, '').replace(',', '.');
  else if (virgula >= 0) s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Lê a planilha (qualquer formato — ver LerPlanilha.ts) e retorna os itens já
// mapeados para o schema de cadastro_itens
async function lerArquivoItens(file: File): Promise<any[]> {
  const wb = await lerPlanilha(file);
  const aba = primeiraAbaComDados(wb);
  const linhas: any[] = aba ? XLSX.utils.sheet_to_json(aba, { defval: '' }) : [];

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
// Section/Row/Field e os estilos ficam em escopo de MODULO de proposito.
// Enquanto estavam declarados dentro de ItemModal, cada render criava funcoes
// novas; para o React isso e um tipo de componente diferente, entao ele
// desmontava e remontava a arvore inteira em vez de atualizar. Como Field
// envolve os campos do formulario, cada tecla digitada remontava o <input> e o
// foco era perdido -- tinha que clicar de novo a cada caractere. Nao mover isto
// de volta para dentro do componente.
// 12e69 (22/10/2026): a aparência vive em design.css (classes acn-cit-*); aqui ficam só as regras e os textos.
// O campo (input/select/textarea) é `acn-cit-inp`, com os modificadores `desab`, `falta`, `area` e `calc`; o rótulo é `acn-cit-lbl`.
const Section = ({ title }: { title: string }) => (
  <div className="acn-cit-secao">
    {title}
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="acn-cit-linha">{children}</div>
);

// o peso de cada campo na linha (o `flex` de antes) vira classe; 1 é o padrão e não leva nenhuma
const PESO_DO_CAMPO: Record<number, string> = { 0.4: 'f04', 0.5: 'f05', 1.2: 'f12', 1.3: 'f13', 2: 'f2', 3: 'f3' };
const Field = ({ label, flex = 1, children }: any) => (
  <div className={'acn-cit-campo' + (PESO_DO_CAMPO[flex] ? ' ' + PESO_DO_CAMPO[flex] : '')}>
    <span className="acn-cit-lbl">{label}</span>
    {children}
  </div>
);

function ItemModal({
  item, onSave, onClose, categorias, currentUser,
}: {
  item: any; onSave: (data: any) => void; onClose: () => void;
  categorias: string[]; currentUser: any;
}) {
  const [form, setForm] = useState<any>({ ...ITEM_VAZIO, ...item });
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const fundoRef = useRef(false);
  const isEdit = !!item?.id;

  const set = (k: string, v: any) => { setAlterado(true); setForm((p: any) => ({ ...p, [k]: v })); };

  // fechar sem salvar: com alteração pendente, pergunta antes de descartar
  const fechar = async () => {
    if (alterado && !await confirmar('Fechar sem salvar? As alterações deste item serão perdidas.')) return;
    onClose();
  };

  const handleSave = async () => {
    if (!form.nome?.trim()) return;
    // 7.x (22/10/2026): os campos já declaram o limite (mínimo 0, porcentagem até 100, markup até 1000), mas o navegador só o aplica nas setas — digitado, "-5" passava e ia gravado
    // (um custo negativo desce o preço; um IPI negativo desconta do custo). Agora recusa dizendo qual campo.
    const LIMITES = [
      { k: 'custo_unit', r: 'Custo unitário', max: Infinity }, { k: 'custo_embalagem', r: 'Custo da embalagem', max: Infinity },
      { k: 'ipi_pct', r: 'IPI (%)', max: 100 }, { k: 'st_pct', r: 'ST (%)', max: 100 }, { k: 'difal_pct', r: 'DIFAL (%)', max: 100 },
      { k: 'imposto_pct', r: 'Impostos s/Venda (%)', max: 100 }, { k: 'custo_fixo_pct', r: 'Custo Fixo (%)', max: 100 }, { k: 'markup_pct', r: 'Markup sugerido (%)', max: 1000 },
    ];
    const fora = LIMITES.find(l => form[l.k] !== '' && form[l.k] != null && (Number(form[l.k]) < 0 || Number(form[l.k]) > l.max));
    if (fora) { alert(`"${fora.r}" está fora do limite (de 0 a ${fora.max === Infinity ? 'sem teto' : fora.max}). Corrija antes de salvar.`); return; }
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
      // `custo_unit` continua sendo o custo de UMA unidade — é o que toda a
      // conta de preço usa. Quando o item vem em embalagem, ele é derivado.
      compra_multiplo: Math.max(1, Number(form.compra_multiplo) || 1),
      custo_embalagem: Number(form.compra_multiplo) > 1 ? (Number(form.custo_embalagem) || 0) : null,
      custo_unit:    Number(form.compra_multiplo) > 1
        ? (Number(form.custo_embalagem) || 0) / Math.max(1, Number(form.compra_multiplo) || 1)
        : (Number(form.custo_unit) || 0),
      ipi_pct:       Number(form.ipi_pct) || 0,
      st_pct:        Number(form.st_pct) || 0,
      difal_pct:     Number(form.difal_pct) || 0,
      imposto_pct:   Number(form.imposto_pct) || 0,
      markup_pct:    Number(form.markup_pct) || 0,
      custo_fixo_pct: Number(form.custo_fixo_pct) || 0,
      origem_producao: form.origem_producao === 'interna' ? 'interna' : 'externa',
      setor_fabricante: form.origem_producao === 'interna' ? (form.setor_fabricante || null) : null,
      // só o Telecom precisa ser dito; vazio (null) é o Almoxarifado, que é o padrão da venda (SeparacaoEnvio.ts)
      setor_separacao: form.setor_separacao === 'Telecom' ? 'Telecom' : null,
      // o Conjunto Elétrico (gatilho da estrutura) nunca tem serial, mesmo que alguém marque
      tem_serial: !!form.tem_serial && !form.eh_conjunto_instalacao,
      // `estoque_atual` de propósito fora daqui: saldo só muda por contagem,
      // baixa ou entrada, pela função do banco (ver Estoque.tsx). Se saísse
      // neste payload, salvar o cadastro sobrescreveria o saldo real.
      controla_estoque: !!form.controla_estoque,
      estoque_minimo: form.controla_estoque && form.estoque_minimo !== '' && form.estoque_minimo != null
        ? Number(form.estoque_minimo) : null,
      estoque_ideal:  form.controla_estoque && form.estoque_ideal !== '' && form.estoque_ideal != null
        ? Number(form.estoque_ideal) : null,
      // dois estados: peça pronta e peça só cortada e dobrada (28/09/2026).
      // `estoque_inacabado` fica de fora pelo mesmo motivo do saldo: quem mexe
      // nele é o movimento, não o cadastro.
      tem_inacabado: !!form.controla_estoque && !!form.tem_inacabado,
      inacabado_minimo: form.controla_estoque && form.tem_inacabado && form.inacabado_minimo !== '' && form.inacabado_minimo != null
        ? Number(form.inacabado_minimo) : null,
      inacabado_ideal: form.controla_estoque && form.tem_inacabado && form.inacabado_ideal !== '' && form.inacabado_ideal != null
        ? Number(form.inacabado_ideal) : null,
      servico_acabamento: form.tem_inacabado ? (String(form.servico_acabamento || '').trim() || null) : null,
      servico_bruto:      form.tem_inacabado ? (String(form.servico_bruto || '').trim() || null) : null,
      ativo:         form.ativo !== false,
      criado_por:    form.criado_por || currentUser?.email || '',
    };
    await onSave({ id: form.id, ...payload });
    setSalvando(false);
  };

  // Preço de referência — mesma conta da Formação de Preços
  // (FormacaoCalculo.precoUnitario): markup sobre o custo e DIFAL no
  // denominador. Aqui é só uma estimativa: quem manda no preço de cada venda
  // é a formação, onde markup, custo e DIFAL são livres por proposta.
  // comprado em embalagem: o custo que vale para o preço é o da unidade
  const emEmbalagem = Number(form.compra_multiplo) > 1;
  const custoPorUnidade = emEmbalagem
    ? (Number(form.custo_embalagem) || 0) / Math.max(1, Number(form.compra_multiplo) || 1)
    : Number(form.custo_unit) || 0;
  const custoCImp  = custoComImpostos(custoPorUnidade, form.ipi_pct, form.st_pct);
  const precoFinal = precoUnitario(custoCImp, form.markup_pct, form.difal_pct);

  return (
    <div className="acn-cit-fundo"
      // Só fecha quando o clique COMEÇA e TERMINA no fundo. Antes bastava soltar
      // o botão aqui: selecionar o número de um campo arrastando para fora
      // fechava o modal e perdia tudo o que tinha sido digitado.
      onMouseDown={e => { fundoRef.current = e.target === e.currentTarget; }}
      onMouseUp={e => {
        const noFundo = fundoRef.current && e.target === e.currentTarget;
        fundoRef.current = false;
        if (noFundo) fechar();
      }}>
      <div className="acn-cit-caixa">
        {/* Header */}
        <div className="acn-cit-cab">
          <div>
            <div className="acn-cit-cab-tit">
              {isEdit ? '✏️ Editar Item' : '➕ Novo Item'}
            </div>
            <div className="acn-cit-cab-sub">
              Cadastro de Itens — base para cotações e compras
            </div>
          </div>
          <Botao className="acn-cit-b acn-cit-x" onClick={fechar}>✕</Botao>
        </div>

        {/* Body */}
        <div className="acn-cit-corpo">

          <Section title="📦 Identificação" />
          <Row>
            <Field label="CODITEM" flex={0.5}>
              {/* Decisão do usuário em 29/09/2026: os itens deixam de vir do ERP e passam a ser criados aqui, com o
                  código gerado pelo sistema (o banco dá o próximo número ao gravar). Por isso não se digita código
                  em item novo; item que já existe mantém o dele. */}
              {isEdit
                ? <input className="acn-cit-inp" value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="Ex: ELT-001" />
                : <input className="acn-cit-inp desab" value="" disabled placeholder="Gerado ao salvar" title="O sistema dá o próximo código ao salvar o item" />}
            </Field>
            <Field label="Nome / Produto *" flex={2}>
              <input className={'acn-cit-inp' + (!form.nome ? ' falta' : '')}
                value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Descrição do item" />
            </Field>
          </Row>
          <Row>
            <Field label="Descrição completa" flex={3}>
              <textarea className="acn-cit-inp area"
                value={form.descricao} onChange={e => set('descricao', e.target.value)}
                placeholder="Especificações, referências, observações..." />
            </Field>
          </Row>
          <Row>
            <Field label="Categoria">
              <select className="acn-cit-inp" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                <option value="">— Selecionar —</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Unidade">
              <select className="acn-cit-inp" value={form.unidade} onChange={e => set('unidade', e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="NCM">
              <input className="acn-cit-inp" value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="0000.00.00" />
            </Field>
            <Field label="Ativo" flex={0.4}>
              <div className="acn-cit-ativo">
                <input type="checkbox" className="acn-cit-chk" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} />
                <span className="acn-cit-ativo-rot">Sim</span>
              </div>
            </Field>
          </Row>

          <Section title="🏭 Fornecedor / Fabricante" />
          <Row>
            <Field label="Marca">
              <input className="acn-cit-inp" value={form.marca} onChange={e => set('marca', e.target.value)} placeholder="Ex: Schneider" />
            </Field>
            <Field label="Fornecedor preferencial">
              <input className="acn-cit-inp" value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} placeholder="Ex: Distribuidora ABC" />
            </Field>
          </Row>

          <Section title="💰 Custo e Moeda" />
          <Row>
            <Field label="Moeda" flex={0.5}>
              <select className="acn-cit-inp" value={form.moeda} onChange={e => set('moeda', e.target.value)}>
                {MOEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label={`Custo Unitário (${moedaSimbolo(form.moeda)})`} flex={1.2}>
              <input className="acn-cit-inp" type="number" min={0} step="0.01"
                value={form.custo_unit} onChange={e => set('custo_unit', e.target.value)}
                placeholder="0,00" disabled={emEmbalagem}
                title={emEmbalagem ? 'Calculado a partir do custo da embalagem' : ''} />
            </Field>
          </Row>

          {/* COMPRADO EM EMBALAGEM, VENDIDO POR UNIDADE (28/09/2026)
              O caso do rádio: o fornecedor vende o par, a nota vem com o preço
              do par, mas a fábrica vende a unidade. Quem digitava o preço do
              par no custo unitário fazia a formação calcular o preço de venda
              em cima do dobro do custo. */}
          <div className={'acn-cit-emb' + (emEmbalagem ? ' ligado' : '')}>
            <label className={'acn-cit-emb-rot' + (emEmbalagem ? ' ligado' : '')}>
              <input type="checkbox" checked={emEmbalagem}
                onChange={e => {
                  const liga = e.target.checked;
                  // desligando, o custo por unidade que já vale continua valendo
                  set('compra_multiplo', liga ? 2 : 1);
                  if (!liga) set('custo_embalagem', null);
                  else if (!form.custo_embalagem) set('custo_embalagem', Number(form.custo_unit) * 2 || '');
                }} />
              📦 Este item é comprado em embalagem com mais de uma unidade
            </label>
            <div className="acn-cit-emb-ajuda">
              {emEmbalagem
                ? 'O custo unitário passa a ser calculado: é o custo da embalagem dividido pelas unidades que vêm nela. É esse valor que a Formação de Preços usa.'
                : 'É o caso do rádio, que o fornecedor vende em par. Ligue e informe o preço da embalagem como vem na nota.'}
            </div>
            {emEmbalagem && (
              <Row>
                <Field label="Unidades por embalagem" flex={1}>
                  <input className="acn-cit-inp" type="number" min={1} step="1" value={form.compra_multiplo ?? 2}
                    onChange={e => set('compra_multiplo', Math.max(1, parseInt(e.target.value, 10) || 1))} />
                </Field>
                <Field label={`Custo da embalagem (${moedaSimbolo(form.moeda)})`} flex={1.2}>
                  <input className="acn-cit-inp" type="number" min={0} step="0.01" value={form.custo_embalagem ?? ''}
                    onChange={e => set('custo_embalagem', e.target.value)} placeholder="como vem na nota" />
                </Field>
                <Field label="Custo por unidade" flex={1.2}>
                  <div className="acn-cit-inp calc">
                    {moedaSimbolo(form.moeda)} {custoPorUnidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </Field>
              </Row>
            )}
          </div>

          <Section title="📦 Estoque" />
          <CamposEstoqueItem form={form} set={set} currentUser={currentUser} />

          <Section title="🏭 Origem do item" />
          <Row>
            <Field label="Como este item chega" flex={1.3}>
              <select className="acn-cit-inp" value={form.origem_producao || 'externa'}
                onChange={e => { const v = e.target.value; set('origem_producao', v); if (v !== 'interna') set('setor_fabricante', ''); }}>
                <option value="externa">Comprado de fornecedor</option>
                <option value="interna">Fabricado aqui dentro</option>
              </select>
            </Field>
            {form.origem_producao === 'interna' && (
              <Field label="Setor que fabrica" flex={1.3}>
                <select className="acn-cit-inp" value={form.setor_fabricante || ''}
                  onChange={e => set('setor_fabricante', e.target.value)}>
                  <option value="">— escolha o setor —</option>
                  {SETORES_FABRICANTES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            <Field label=" " flex={2}>
              <div className="acn-cit-origem-ajuda">
                {form.origem_producao === 'interna'
                  ? (form.setor_fabricante
                      ? `Ao liberar o kiting de uma OP com este item, o PCP vê a sugestão de mandar fabricar em ${form.setor_fabricante} — e decide, porque pode já ter no estoque.`
                      : 'Escolha o setor: é ele que vai receber a demanda automaticamente.')
                  : 'Item comprado: entra no kit pelo estoque ou por pedido de compra.'}
              </div>
            </Field>
          </Row>

          {form.origem_producao === 'interna' && form.setor_fabricante === 'Chicotes' && (
            <>
              <Section title="🧵 Estrutura do chicote (Etapa 9)" />
              <CamposEstruturaChicote item={form} currentUser={currentUser} />
            </>
          )}

          <Section title="📡 Quem separa numa venda de envio" />
          <Row>
            <Field label="Separa, serializa e embala" flex={1.3}>
              <select className="acn-cit-inp" value={form.setor_separacao || ''} onChange={e => set('setor_separacao', e.target.value)}>
                <option value="">Almoxarifado</option>
                <option value="Telecom">Telecom</option>
              </select>
            </Field>
            <Field label=" " flex={2}>
              <div className="acn-cit-origem-ajuda">
                {form.setor_separacao === 'Telecom'
                  ? 'Numa venda de envio de material, a linha deste item é separada, serializada e embalada pelo Telecom (rádio e acessórios de rádio). O vendedor ainda pode trocar na venda.'
                  : 'Padrão: o Almoxarifado separa e embala. Marque Telecom para rádio e acessórios de rádio.'}
              </div>
            </Field>
          </Row>

          <Section title="🔢 Número de série" />
          <Row>
            <Field label="Tem número de série" flex={1.3}>
              <div className="acn-cit-ativo">
                <input type="checkbox" className="acn-cit-chk" checked={!!form.tem_serial && !form.eh_conjunto_instalacao} disabled={!!form.eh_conjunto_instalacao}
                  onChange={e => set('tem_serial', e.target.checked)} aria-label="Tem número de série" />
                <span className="acn-cit-ativo-rot">Sim</span>
              </div>
            </Field>
            <Field label=" " flex={2}>
              <div className="acn-cit-origem-ajuda">
                {form.eh_conjunto_instalacao
                  ? 'O Conjunto Elétrico nunca tem número de série.'
                  : form.tem_serial
                    ? 'Numa Venda para Envio, este item entra sozinho na lista de seriais do Almoxarifado: ele só digita o número de série, uma linha por unidade vendida.'
                    : 'Marque nos itens que recebem número de série (controlador, sirene, amplificador...). Sem a marca o item não entra na lista; frete e serviço não têm.'}
              </div>
            </Field>
          </Row>

          <Section title="📊 Impostos e Markup (sugestão de partida)" />
          <div className="acn-cit-aviso-taxas">
            Estes percentuais são só o ponto de partida do catálogo. O preço de cada venda é
            fechado na <strong>Formação de Preços</strong>, onde markup, custo e DIFAL são livres —
            global ou item a item — e mexer numa proposta não altera as outras nem este cadastro.
          </div>
          <Row>
            <Field label="IPI (%)">
              <input className="acn-cit-inp" type="number" min={0} max={100} step="0.01"
                value={form.ipi_pct} onChange={e => set('ipi_pct', e.target.value)} />
            </Field>
            <Field label="ST (%)">
              <input className="acn-cit-inp" type="number" min={0} max={100} step="0.01"
                value={form.st_pct} onChange={e => set('st_pct', e.target.value)} />
            </Field>
            <Field label="DIFAL (%) — 0 dentro do estado">
              <input className="acn-cit-inp" type="number" min={0} max={100} step="0.01"
                value={form.difal_pct} onChange={e => set('difal_pct', e.target.value)} />
            </Field>
            <Field label="Impostos s/Venda (%)">
              <input className="acn-cit-inp" type="number" min={0} max={100} step="0.01"
                value={form.imposto_pct} onChange={e => set('imposto_pct', e.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="Markup sugerido (%)">
              <input className="acn-cit-inp" type="number" min={0} max={1000} step="1"
                value={form.markup_pct} onChange={e => set('markup_pct', e.target.value)} />
            </Field>
            <Field label="Custo Fixo (%)">
              <input className="acn-cit-inp" type="number" min={0} max={100} step="0.5"
                value={form.custo_fixo_pct} onChange={e => set('custo_fixo_pct', e.target.value)} />
            </Field>
            <Field label="Preço de referência (a formação decide)" flex={2}>
              <div className="acn-cit-preco">
                {fmtMoeda(precoFinal, form.moeda)}
              </div>
            </Field>
          </Row>
        </div>

        {/* Footer */}
        <div className="acn-cit-rodape">
          <Botao className="acn-cit-b acn-cit-cancelar" onClick={fechar}>Cancelar</Botao>
          <Botao className={'acn-cit-b acn-cit-salvar' + (!form.nome?.trim() ? ' sem-nome' : '') + (salvando ? ' ocupado' : '')}
            onClick={handleSave}
            disabled={salvando || !form.nome?.trim()}
          >
            {salvando ? 'Salvando...' : isEdit ? '💾 Salvar Alterações' : '✅ Cadastrar Item'}
          </Botao>
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
  const [resultadoImport, setResultadoImport] = useState<{ novos: number; atualizados: number; ignorados: number; mantidosInativos?: number; conjuntosInativos?: number; erro?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const POR_PAG = 50;
  // 7.x do Cadastro de itens (22/10/2026): leitura recusada não pode virar "Nenhum item cadastrado" (a pessoa cadastraria de novo o que já existe): fica a faixa de erro e a última lista lida
  const [erroLeitura, setErroLeitura] = useState('');

  // ── Carregar itens ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    // Supabase limita a 1000 linhas por requisição — pagina até esgotar (necessário desde a importação em massa que passou de 4.000 itens).
    // 7.x (22/10/2026): a ordem leva o `id` como desempate — ordenando por marca, categoria ou fornecedor (milhares de linhas iguais) um item podia aparecer em
    // dois blocos de 1.000 ou em nenhum — e a leitura recusada deixou de valer como "acabou a lista".
    let lista: any[];
    try {
      lista = await lerPaginado(() => supabase.from('cadastro_itens').select('*')
        .order(ordenar.col, { ascending: ordenar.dir === 'asc' }).order('id'));
    } catch (e: any) {
      setErroLeitura(e?.message || 'sem resposta');
      setLoading(false);
      return;
    }
    setErroLeitura('');
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
    if (busca.trim()) return combinaBusca([it.nome, it.codigo, it.marca, it.fornecedor, it.ncm], busca);
    return true;
  });

  const total = filtrados.length;
  const paginas = Math.ceil(total / POR_PAG);
  const visiveis = filtrados.slice(pagina * POR_PAG, (pagina + 1) * POR_PAG);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  // O banco recusa com mensagem clara o que fere as regras do catálogo (um Conjunto Elétrico só, o 1687; ver a migração
  // catalogo_codigo_automatico_e_conjunto_eletrico_unico). Antes o resultado da gravação nem era lido: a recusa passava
  // calada e a janela fechava como se tivesse salvo.
  const salvarItem = async (data: any) => {
    let error: any = null;
    let codigoNovo = '';
    if (data.id) {
      const { id, ...payload } = data;
      ({ error } = await supabase.from('cadastro_itens').update(payload).eq('id', id));
    } else {
      const r = await supabase.from('cadastro_itens').insert([{ ...data, criado_por: currentUser?.email }]).select('codigo').maybeSingle();
      error = r.error; codigoNovo = r.data?.codigo || '';
    }
    if (error) { alert('Não foi possível salvar o item: ' + error.message); return; }
    if (codigoNovo) alert(`Item cadastrado com o código ${codigoNovo}.`);
    setModal(null);
    await carregar();
  };

  const toggleAtivo = async (item: any) => {
    const { error } = await supabase.from('cadastro_itens').update({ ativo: !item.ativo }).eq('id', item.id);
    if (error) { alert('Não foi possível alterar o item: ' + error.message); return; }
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i));
  };

  const excluirItem = async (id: string) => {
    if (!await confirmar('Excluir este item permanentemente?')) return;
    setDeletando(id);
    const { error } = await supabase.from('cadastro_itens').delete().eq('id', id);
    setDeletando(null);
    if (error) { alert('Não foi possível excluir o item: ' + error.message); return; }
    setItens(prev => prev.filter(i => i.id !== id));
  };

  // ── Import/Export ──────────────────────────────────────────────────────────
  const handleExportar = () => {
    const nomeArquivo = `cadastro_itens_${hojeISO()}.xlsx`;
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
    let atualizados = 0, novos = 0;   // fora do try: se a importação parar no meio, a mensagem diz o que já estava gravado
    try {
      const linhas = await lerArquivoItens(file);
      if (linhas.length === 0) {
        setResultadoImport({ novos: 0, atualizados: 0, ignorados: 0, erro: 'Nenhuma linha válida encontrada (verifique se a coluna "Nome" está preenchida).' });
        return;
      }

      const comCodigo = linhas.filter(l => l.codigo);
      const semCodigo = linhas.filter(l => !l.codigo);
      const TAM_LOTE = 500;

      // Itens com código: upsert (atualiza se já existir, cria se não existir)
      let mantidosInativos = 0, conjuntosInativos = 0;
      for (let i = 0; i < comCodigo.length; i += TAM_LOTE) {
        const codigosLote = comCodigo.slice(i, i + TAM_LOTE).map(it => it.codigo);
        // 7.x (22/10/2026): estas duas conferências recusadas valiam como "nenhum existe" e "nenhum foi unificado" — o item que já existia era contado como novo, o "Conjunto Elétrico PV …"
        // que já estava no catálogo ativo entrava INATIVO e o item unificado voltava ativo. Agora a importação PARA antes de gravar o bloco e diz por quê.
        const { data: existentes, error: erroExistentes } = await supabase
          .from('cadastro_itens').select('codigo').in('codigo', codigosLote);
        if (erroExistentes) throw new Error(`Não foi possível conferir quais itens já estão cadastrados (${erroExistentes.message}); a importação parou antes de gravar este bloco.`);
        const codigosExistentes = new Set((existentes || []).map((e: any) => e.codigo));
        // Unificação de itens repetidos (pedido do usuário em 29/09/2026): o item unificado fica inativo e a
        // planilha do ERP, que traz "Ativo = Sim", não pode reativá-lo — senão o repetido volta a cada importação.
        const { data: unificados, error: erroUnificados } = await supabase
          .from('itens_unificacoes').select('codigo_duplicado').in('codigo_duplicado', codigosLote);
        if (erroUnificados) throw new Error(`Não foi possível conferir os itens já unificados (${erroUnificados.message}); a importação parou antes de gravar este bloco, para não reativar item repetido.`);
        const jaUnificados = new Set((unificados || []).map((u: any) => u.codigo_duplicado));
        const lote = comCodigo.slice(i, i + TAM_LOTE).map(it => {
          const base = { ...it, criado_por: currentUser?.email || '' };
          if (jaUnificados.has(it.codigo)) { mantidosInativos++; return { ...base, ativo: false }; }
          // O ERP cria um "CONJUNTO ELETRICO PV ..." novo a cada pedido. O gatilho do Conjunto Elétrico é UM item só
          // (o de código 1687, decisão do usuário em 29/09/2026): os novos entram inativos, sem sujar o catálogo.
          if (!codigosExistentes.has(it.codigo) && CONJUNTO_POR_PEDIDO.test(it.nome || '')) { conjuntosInativos++; return { ...base, ativo: false }; }
          return base;
        });
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

      setResultadoImport({ novos, atualizados, ignorados: 0, mantidosInativos, conjuntosInativos });
      await carregar();
    } catch (err: any) {
      // 7.x: o erro vinha sem dizer que os blocos anteriores JÁ estavam gravados (e o resumo mostrava 0 novos, 0 atualizados)
      const jaGravado = novos + atualizados > 0
        ? ` Antes de parar já estavam gravados ${novos} novo(s) e ${atualizados} atualizado(s); confira a lista antes de importar de novo.`
        : ' Nada foi gravado.';
      setResultadoImport({ novos, atualizados, ignorados: 0, erro: (err?.message || 'Erro ao importar arquivo.') + jaGravado });
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

  // Funcao de render (nao componente): declarado aqui dentro, viraria um tipo
  // novo a cada render e o React remontaria o icone em vez de atualiza-lo.
  const sortIcon = (col: string) => ordenar.col !== col
    ? <span className="acn-cit-ord-off">⇅</span>
    : <span>{ordenar.dir === 'asc' ? '↑' : '↓'}</span>;

  // ── Estatísticas ────────────────────────────────────────────────────────────
  const stats = {
    total: itens.length,
    ativos: itens.filter(i => i.ativo).length,
    cats: new Set(itens.filter(i => i.categoria).map(i => i.categoria)).size,
  };

  return (
    <div className="acn-cit-tela">
      {/* ── Cabeçalho ── */}
      <div className="acn-quebra acn-cit-topo">
        <div>
          <div className="acn-cit-tit">📦 Cadastro de Itens (CODITEM)</div>
          <div className="acn-cit-sub">
            Base de itens para composição de preços, compras e orçamentos
          </div>
        </div>
        <div className="acn-cit-acoes">
          {/* Stats */}
          {[
            { label: 'Total de itens', value: stats.total, tom: 'teal' },
            { label: 'Ativos',         value: stats.ativos, tom: 'verde' },
            { label: 'Categorias',     value: stats.cats, tom: 'roxo' },
          ].map(s => (
            <div key={s.label} className="acn-cit-stat">
              <div className={'acn-cit-stat-v ' + s.tom}>{s.value}</div>
              <div className="acn-cit-stat-r">{s.label}</div>
            </div>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            accept={EXT_PLANILHAS_IMPORTACAO}
            onChange={handleArquivoSelecionado}
            hidden
          />
          <Botao className={'acn-cit-b acn-cit-sec' + (importando ? ' ocupado' : '')}
            onClick={() => fileInputRef.current?.click()}
            disabled={importando}
            title="Importar itens de planilha (Excel .xlsx/.xlsm/.xlsb/.xls, LibreOffice .ods, Numbers, CSV...)"
          >
            {importando ? '⏳ Importando...' : '📥 Importar'}
          </Botao>
          <Botao className="acn-cit-b acn-cit-sec"
            onClick={handleExportar}
            title="Exportar itens filtrados para Excel (.xlsx)"
          >
            📤 Exportar ({filtrados.length})
          </Botao>
          <Botao className="acn-cit-b acn-cit-prim"
            onClick={() => setModal({})}
          >
            ➕ Novo Item
          </Botao>
        </div>
      </div>

      {/* ── Leitura recusada (7.x): a lista abaixo é a última que deu certo ── */}
      {erroLeitura && (
        <div className="acn-cit-faixa">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => carregar()}>Tentar de novo</Botao>}>
            Não foi possível ler o Cadastro de itens ({erroLeitura}). Isso não quer dizer que não haja item cadastrado{itens.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.
          </Faixa>
        </div>
      )}

      {/* ── Resultado da importação ── */}
      {resultadoImport && (
        <div className={'acn-cit-import ' + (resultadoImport.erro ? 'erro' : 'ok')}>
          <span>
            {resultadoImport.erro
              ? `❌ ${resultadoImport.erro}`
              : `✅ Importação concluída — ${resultadoImport.novos} novo(s), ${resultadoImport.atualizados} atualizado(s).`
                + (resultadoImport.conjuntosInativos ? ` ${resultadoImport.conjuntosInativos} "Conjunto Elétrico PV …" entraram inativos (o Conjunto Elétrico é um item só).` : '')
                + (resultadoImport.mantidosInativos ? ` ${resultadoImport.mantidosInativos} item(ns) já unificado(s) continuaram inativos.` : '')}
          </span>
          <Botao className="acn-cit-b acn-cit-import-x" onClick={() => setResultadoImport(null)}>✕</Botao>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="acn-cit-filtros">
        <input
          placeholder="🔍 Buscar por nome, código, marca, fornecedor, NCM..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPagina(0); }}
          className="acn-cit-busca"
        />
        <select
          value={filtCat}
          onChange={e => { setFiltCat(e.target.value); setPagina(0); }}
          className="acn-cit-filtro-sel"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['todos', 'ativo', 'inativo'] as const).map(v => (
          <Botao
            key={v}
            className={'acn-cit-b acn-cit-chip' + (filtAtivo === v ? ' on' : '')}
            onClick={() => { setFiltAtivo(v); setPagina(0); }}
          >
            {v === 'todos' ? 'Todos' : v === 'ativo' ? '✅ Ativos' : '⛔ Inativos'}
          </Botao>
        ))}
        {(busca || filtCat || filtAtivo !== 'ativo') && (
          <Botao className="acn-cit-b acn-cit-limpar"
            onClick={() => { setBusca(''); setFiltCat(''); setFiltAtivo('ativo'); setPagina(0); }}
          >
            ✕ Limpar
          </Botao>
        )}
        <Botao className="acn-cit-b acn-cit-modelo"
          onClick={handleBaixarModelo}
          title="Baixar planilha modelo com as colunas esperadas na importação"
        >
          📄 Baixar modelo
        </Botao>
        <span className="acn-cit-contagem">
          {/* 7.x: o texto saía "111 itemns" (o 'ns' era somado ao 'item' em vez de trocá-lo) */}
          {total} {total !== 1 ? 'itens' : 'item'}
        </span>
      </div>

      {/* ── Tabela ── */}
      <div className="acn-cit-card">
        {loading ? (
          <div className="acn-cit-vazio">
            Carregando itens...
          </div>
        ) : visiveis.length === 0 && erroLeitura && itens.length === 0 ? (
          // 7.x: com a leitura recusada e nenhuma lista anterior, não se diz "Nenhum item cadastrado" (a faixa de erro acima explica)
          <div className="acn-cit-vazio">Os itens não foram lidos.</div>
        ) : visiveis.length === 0 ? (
          <div className="acn-cit-vazio it">
            {itens.length === 0
              ? 'Nenhum item cadastrado. Clique em "Novo Item" para começar.'
              : 'Nenhum item encontrado para os filtros aplicados.'}
          </div>
        ) : (
          <div className="acn-cit-rola">
            <table className="acn-cit-tab">
              <thead>
                <tr>
                  <th className="acn-cit-th" onClick={() => sortBy('codigo')}>Código {sortIcon('codigo')}</th>
                  <th className="acn-cit-th" onClick={() => sortBy('nome')}>Nome / Produto {sortIcon('nome')}</th>
                  <th className="acn-cit-th" onClick={() => sortBy('categoria')}>Categoria {sortIcon('categoria')}</th>
                  <th className="acn-cit-th" onClick={() => sortBy('marca')}>Marca {sortIcon('marca')}</th>
                  <th className="acn-cit-th" onClick={() => sortBy('fornecedor')}>Fornecedor {sortIcon('fornecedor')}</th>
                  <th className="acn-cit-th centro">Un.</th>
                  <th className="acn-cit-th centro">Moeda</th>
                  <th className="acn-cit-th dir" onClick={() => sortBy('custo_unit')}>Custo Unit. {sortIcon('custo_unit')}</th>
                  <th className="acn-cit-th dir">IPI%</th>
                  <th className="acn-cit-th dir">ST%</th>
                  <th className="acn-cit-th dir">Markup%</th>
                  <th className="acn-cit-th centro">NCM</th>
                  <th className="acn-cit-th centro">Ativo</th>
                  <th className="acn-cit-th centro">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(it => (
                  <tr key={it.id} className={'acn-cit-tr' + (it.ativo ? '' : ' inativo')}>
                    <td className="acn-cit-td cod">
                      {it.codigo || '—'}
                    </td>
                    <td className="acn-cit-td nome">
                      <div className="acn-cit-nome-l">{it.nome}</div>
                      {it.descricao && (
                        <div className="acn-cit-desc">
                          {it.descricao}
                        </div>
                      )}
                    </td>
                    <td className="acn-cit-td">
                      {it.categoria ? (
                        <span className="acn-cit-cat">{it.categoria}</span>
                      ) : <span className="acn-cit-traco">—</span>}
                      {it.tem_serial && !it.eh_conjunto_instalacao && (
                        <div><Selo familia="info" ponto={false} title="Numa Venda para Envio, entra sozinho na lista de seriais do Almoxarifado">Tem serial</Selo></div>
                      )}
                      {it.setor_separacao === 'Telecom' && (
                        <div><Selo familia="info" ponto={false} title="Numa venda de envio, quem separa e embala este item é o Telecom">Telecom separa</Selo></div>
                      )}
                    </td>
                    <td className="acn-cit-td">{it.marca ||<span className="acn-cit-traco">—</span>}</td>
                    <td className="acn-cit-td">{it.fornecedor || <span className="acn-cit-traco">—</span>}</td>
                    <td className="acn-cit-td centro">
                      <span className="acn-cit-un">{it.unidade}</span>
                    </td>
                    <td className={'acn-cit-td centro moeda' + (it.moeda !== 'REAL' ? ' estrangeira' : '')}>
                      {it.moeda}
                    </td>
                    <td className="acn-cit-td dir custo">
                      {fmtMoeda(it.custo_unit, it.moeda)}
                    </td>
                    <td className="acn-cit-td dir cinza">{fmtPct(it.ipi_pct)}</td>
                    <td className="acn-cit-td dir cinza">{fmtPct(it.st_pct)}</td>
                    <td className="acn-cit-td dir markup">{fmtPct(it.markup_pct)}</td>
                    <td className="acn-cit-td centro ncm">
                      {it.ncm || '—'}
                    </td>
                    <td className="acn-cit-td centro">
                      <Botao className={'acn-cit-b acn-cit-tog ' + (it.ativo ? 'ativo' : 'inativo')}
                        onClick={() => toggleAtivo(it)}
                        title={it.ativo ? 'Desativar item' : 'Reativar item'}
                      >
                        {it.ativo ? '✅ Ativo' : '⛔ Inativo'}
                      </Botao>
                    </td>
                    <td className="acn-cit-td centro">
                      <div className="acn-cit-acoes-linha">
                        <Botao className="acn-cit-b acn-cit-ed"
                          onClick={() => setModal(it)}
                          title="Editar"
                        >✏️</Botao>
                        <Botao className="acn-cit-b acn-cit-ex"
                          onClick={() => excluirItem(it.id)}
                          disabled={deletando === it.id}
                          title="Excluir"
                        >🗑️</Botao>
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
          <div className="acn-cit-pag">
            <span className="acn-cit-pag-info">
              {pagina * POR_PAG + 1}–{Math.min((pagina + 1) * POR_PAG, total)} de {total}
            </span>
            <Botao className="acn-cit-b acn-cit-pg"
              onClick={() => setPagina(0)} disabled={pagina === 0}
            >«</Botao>
            <Botao className="acn-cit-b acn-cit-pg"
              onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}
            >‹</Botao>
            {Array.from({ length: Math.min(paginas, 7) }, (_, i) => {
              const p = paginas <= 7 ? i : Math.max(0, Math.min(paginas - 7, pagina - 3)) + i;
              return (
                <Botao
                  key={p}
                  className={'acn-cit-b acn-cit-pg num' + (pagina === p ? ' on' : '')}
                  onClick={() => setPagina(p)}
                >{p + 1}</Botao>
              );
            })}
            <Botao className="acn-cit-b acn-cit-pg"
              onClick={() => setPagina(p => p + 1)} disabled={pagina >= paginas - 1}
            >›</Botao>
            <Botao className="acn-cit-b acn-cit-pg"
              onClick={() => setPagina(paginas - 1)} disabled={pagina >= paginas - 1}
            >»</Botao>
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
