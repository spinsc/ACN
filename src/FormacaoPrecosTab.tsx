// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';
import { loteDe, grupoDe, subgrupoDe, chaveItem, chaveSub, qtdDoItem, qtdDoSubgrupo,
         somarResultados, estruturaFormacao, custoComImpostos, precoUnitario } from './FormacaoCalculo';
import { temPoderDeGerente, perfilComPoderes } from './utils/permissoes';
import { buscarPorPalavras, combinaBusca } from './SearchUtils';
import { estruturaDoKit } from './KitEstrutura';
import { confirmar, pedirTexto } from './Feedback';
import { Faixa, Botao, Selo, Chips, Abas, Tag } from './Interface';
import Icone from './Icone';
import { mdiClose, mdiPlus, mdiPencilOutline, mdiTagOutline, mdiContentSaveOutline, mdiCogOutline, mdiFolderOpenOutline,
  mdiDownloadOutline, mdiLinkVariant, mdiCheck, mdiRefresh, mdiCalculatorVariantOutline, mdiTimerSand, mdiPackageVariantClosed, mdiPackageVariant,
  mdiFactory, mdiChevronUp, mdiChevronDown, mdiCashMultiple, mdiReceiptTextOutline, mdiInformationOutline, mdiArrowLeft, mdiFileDocumentOutline,
  mdiFileMultipleOutline, mdiContentCopy, mdiEyeOutline, mdiChevronRight, mdiPrinterOutline, mdiChartBar, mdiUndo, mdiNotebookEditOutline, mdiAlertOutline,
  mdiLockOutline, mdiTrophyOutline, mdiClockOutline, mdiLinkVariantOff, mdiHistory, mdiPaperclip, mdiOfficeBuildingOutline, mdiStorefrontOutline, mdiSync,
  mdiTrashCanOutline, mdiPuzzleOutline, mdiAccountOutline } from '@mdi/js';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MOEDAS = ['REAL', 'DOLAR', 'EURO'];

const PARAMS_PADRAO = {
  ptax_dolar:     5.85,
  ptax_euro:      6.40,
  difal_pct:      0,    // começa zerado: DIFAL depende do destino da venda
  imposto_pct:    16,
  custo_fixo_pct: 3,
  lote_qtd:       1,
  markup_pct:     100,
  // QUANTIDADE de cada item do edital (o campo "Quantidade do item"; antes se
  // chamava "Lote deste Item"). Chave = "lote::item"; formações antigas, que
  // não tinham lote, usam só o nome do item — ver qtdDoItem().
  lote_por_grupo: {} as Record<string, number>,
  // Quantidade de cada SUBGRUPO de um item ("lote::item::subgrupo").
  qtd_subgrupo:   {} as Record<string, number>,
};

function novoItem() {
  return {
    _id: Math.random().toString(36).slice(2),
    lote_nome:      'Lote 1', // LOTE do edital (agrupa itens) — ver tira de lotes
    grupo_nome:     'Item 1', // "Item do edital" ao qual este componente pertence (ver tira de abas)
    produto:        '',
    marca:          '',
    modelo:         '', // igual à coluna MODELO da planilha original (separada de Marca/Produto)
    fornecedor:     '',
    qt:             1,
    moeda:          'REAL',
    custo_unit:     0,
    ipi_pct:        0,
    st_pct:         0,
    tipo_calculo:   'CUSTO', // 'CUSTO' (markup sobre custo) ou 'TABELA' (desconto sobre preço de tabela)
    markup_pct:     100,     // reaproveitado nos 2 modos — no modo TABELA representa o desconto %
    difal_pct:      0,
    imposto_pct:    16,
    custo_fixo_pct: 3,
    // ── informações do produto (só referência, não entram no cálculo) ──
    prazo_entrega:      '',
    garantia:           '',
    fornecedor_regime:  '', // Simples / Lucro real / Lucro presumido / Regime especial
    ncm:                '',
    origem_produto:     '', // Nacional / Importado
    icms_pct:           0,
    iss_pct:            0,
  };
}

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────
// Regra de negócio da planilha original (célula "VALIDA MARKUP/DESCONTO"):
// modo CUSTO exige markup mínimo de 65% sobre o custo; modo TABELA exige
// desconto máximo de 17,5% sobre o preço de tabela. Só avisa (badge OK/ERRO
// na UI), não bloqueia — igual à planilha.
const MARKUP_MINIMO_CUSTO_PCT    = 65;
const DESCONTO_MAXIMO_TABELA_PCT = 17.5;

export function calcItem(item, params) {
  const qt             = Number(item.qt)             || 1;
  const custo_unit     = Number(item.custo_unit)     || 0;
  const ipi_pct        = Number(item.ipi_pct)        || 0;
  const st_pct         = Number(item.st_pct)         || 0;
  const tipo_calculo   = item.tipo_calculo === 'TABELA' ? 'TABELA' : 'CUSTO';
  const markup_pct     = Number(item.markup_pct)     || 0; // markup (CUSTO) ou desconto (TABELA) — mesmo campo, igual à planilha
  const difal_pct      = Number(item.difal_pct)      || 0;
  const imposto_pct    = Number(item.imposto_pct)    || 0;
  const custo_fixo_pct = Number(item.custo_fixo_pct) || 0;

  const fx = item.moeda === 'DOLAR' ? (Number(params.ptax_dolar) || 5.85)
           : item.moeda === 'EURO'  ? (Number(params.ptax_euro)  || 6.40)
           : 1;

  const custoUnitBrl = custoComImpostos(custo_unit, ipi_pct, st_pct, fx);
  const custoTotal   = custoUnitBrl * qt;

  let valorUnit, totalImposto, margem;
  if (tipo_calculo === 'TABELA') {
    // Modo TABELA: "custo" informado é o preço de tabela do fabricante, não
    // o custo real — a planilha original aproxima o custo real como metade
    // do preço de tabela (custoUnitBrl/2) só no cálculo de margem.
    valorUnit    = precoUnitario(custoUnitBrl, markup_pct, difal_pct, true);
    totalImposto = custoUnitBrl * (1 - markup_pct / 100) * qt * (imposto_pct / 100);
    margem       = (custoUnitBrl / 2 - custoUnitBrl * markup_pct / 100) * qt
                  - totalImposto
                  - (custo_fixo_pct / 100) * (custoUnitBrl - custoUnitBrl * markup_pct / 100) * qt;
  } else {
    valorUnit    = precoUnitario(custoUnitBrl, markup_pct, difal_pct);
    const receitaBruta = custoUnitBrl * (1 + markup_pct / 100) * qt;
    totalImposto = receitaBruta * (imposto_pct / 100);
    margem       = receitaBruta - totalImposto - (custo_fixo_pct / 100 * receitaBruta) - custoTotal;
  }
  const valorTotal = valorUnit * qt;
  const totalDifal = valorTotal * (difal_pct / 100);
  const lucroPct    = (valorTotal - totalDifal) > 0 ? (margem / (valorTotal - totalDifal)) * 100 : 0;

  const validacao = tipo_calculo === 'CUSTO'
    ? (markup_pct < MARKUP_MINIMO_CUSTO_PCT ? 'ERRO' : 'OK')
    : (markup_pct > DESCONTO_MAXIMO_TABELA_PCT ? 'ERRO' : 'OK');

  return { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct, validacao };
}

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const fmtR = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
};
// Lote/Item/Subgrupo, quantidades e somas: ver FormacaoCalculo.ts (a mesma
// conta é usada na lista de Preços Formados, nas propostas e no contrato).

// ─── OP AUTOCOMPLETE ──────────────────────────────────────────────────────────
function OplAutocomplete({ value, onSelect }) {
  const [query, setQuery]       = useState(value?.opl || '');
  const [resultados, setRes]    = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef(null);

  useEffect(() => {
    if (value) setQuery(value.opl);
    else setQuery('');
  }, [value]);

  const buscar = (texto) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .or(`opl.ilike.%${texto}%,cliente_nome.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (op) => {
    setQuery(op.opl);
    setAberto(false);
    setRes([]);
    onSelect(op);
  };

  const limpar = () => {
    setQuery('');
    setRes([]);
    setAberto(false);
    onSelect(null);
  };

  return (
    <div className="acn-fp-busca">
      <div className="acn-fp-busca-linha">
        <input className="acn-input acn-fp-busca-campo"
          placeholder="Buscar OP/OS por número ou cliente..."
          value={query}
          onChange={e => buscar(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 180)} />
        {value && (
          <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Limpar a OP/OS" aria-label="Limpar a OP/OS" onClick={limpar} />
        )}
        {buscando && <span className="acn-ajuda">...</span>}
      </div>
      {aberto && resultados.length > 0 && (
        <div className="acn-fp-sug">
          {resultados.map(op => (
            <div key={op.id} className="acn-fp-sug-item" onMouseDown={() => selecionar(op)}>
              <strong>{op.opl}</strong>
              <span className="acn-fp-sug-cli">{op.cliente_nome}</span>
              <span className="acn-ajuda">{op.status_geral}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MODAL DE SALVAR TEMPLATE ─────────────────────────────────────────────────
const NOVO_TIPO_SENTINEL = '___NOVO___';

// ─── CATEGORIAS ───────────────────────────────────────────────────────────────
// A "categoria" é o antigo campo Tipo (catálogo formacao_precos_tipos, gravado
// como texto em cotacoes_precos.tipo) — decidido com o usuário em 13/09/2026.
// Só Gerentes e Admins criam, renomeiam e desativam categorias; quem salva a
// formação escolhe uma. As listas de formações filtram e agrupam por ela.
const SEM_CATEGORIA = '(sem categoria)';
const categoriaDe = (m: any) => (m?.tipo && String(m.tipo).trim()) || SEM_CATEGORIA;

function agruparPorCategoria(lista: any[]) {
  const grupos: Record<string, any[]> = {};
  lista.forEach(m => { (grupos[categoriaDe(m)] ||= []).push(m); });
  return Object.keys(grupos)
    .sort((a, b) => a === SEM_CATEGORIA ? 1 : b === SEM_CATEGORIA ? -1 : a.localeCompare(b, 'pt-BR'))
    .map(nome => ({ nome, itens: grupos[nome] }));
}

function FiltroCategoria({ lista, valor, onChange }) {
  const nomes = [...new Set(lista.map(categoriaDe))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return (
    <select className="acn-input acn-fp-filtro" value={valor} onChange={e => onChange(e.target.value)}>
      <option value="">Todas as categorias ({lista.length})</option>
      {nomes.map(n => <option key={n} value={n}>{n} ({lista.filter(m => categoriaDe(m) === n).length})</option>)}
    </select>
  );
}

const TituloCategoria = ({ nome, qtd }) => (
  <div className="acn-fp-cat">
    <Icone path={mdiTagOutline} size={14} /> {nome} <span>({qtd})</span>
  </div>
);

function GerenciarCategorias({ onMudou }) {
  const [cats, setCats] = useState([]);
  const carregar = () => supabase.from('formacao_precos_tipos').select('id,nome,ativo').order('nome').then(({ data }) => setCats(data || []));
  useEffect(() => { carregar(); }, []);
  const criar = async () => {
    const nome = await pedirTexto('Nome da nova categoria:');
    if (!nome || !nome.trim()) return;
    const { error } = await supabase.from('formacao_precos_tipos').insert([{ nome: nome.trim() }]);
    if (error) { alert('Erro ao criar: ' + error.message); return; }
    carregar(); onMudou?.();
  };
  const renomear = async (c) => {
    const nome = await pedirTexto('Renomear categoria:', c.nome);
    if (!nome || !nome.trim() || nome.trim() === c.nome) return;
    const { error } = await supabase.from('formacao_precos_tipos').update({ nome: nome.trim() }).eq('id', c.id);
    if (error) { alert('Erro ao renomear: ' + error.message); return; }
    // a formação guarda o NOME da categoria: renomear leva junto as formações dela
    // Etapa 7.59 (07/10/2026): este segundo passo ignorava o erro — a categoria mudava de nome e as formações ficavam com o nome antigo
    const { error: erroFormacoes } = await supabase.from('cotacoes_precos').update({ tipo: nome.trim() }).eq('tipo', c.nome);
    if (erroFormacoes) alert('A categoria foi renomeada, mas as formações dela NÃO acompanharam o novo nome (' + erroFormacoes.message + '). Renomeie de novo para tentar outra vez ou avise o suporte.');
    carregar(); onMudou?.();
  };
  const alternar = async (c) => {
    const { error } = await supabase.from('formacao_precos_tipos').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) { alert('Não foi possível ' + (c.ativo ? 'desativar' : 'reativar') + ' a categoria: ' + error.message); return; }   // 7.59
    carregar(); onMudou?.();
  };
  return (
    <div className="acn-fp-cats">
      <div className="acn-fp-cats-topo">
        <span className="acn-fp-cats-tit">CATEGORIAS (Gerentes e Admins)</span>
        <Botao pequeno icone={mdiPlus} onClick={criar}>Nova</Botao>
      </div>
      {cats.map(c => (
        <div key={c.id} className={'acn-fp-cats-linha' + (c.ativo ? '' : ' inativa')}>
          <span className="acn-fp-cats-nome">{c.nome}{!c.ativo && ' (desativada)'}</span>
          <Botao variante="discreto" pequeno icone={mdiPencilOutline} title="Renomear" aria-label="Renomear" onClick={() => renomear(c)} />
          <Botao pequeno onClick={() => alternar(c)} title={c.ativo ? 'Desativar (some da escolha; formações já salvas mantêm)' : 'Reativar'}>
            {c.ativo ? 'Desativar' : 'Reativar'}
          </Botao>
        </div>
      ))}
    </div>
  );
}

function ModalSalvar({ onSalvar, onClose, salvando, nomeInicial, tipoInicial, editando, podeGerirCategorias }) {
  const [nome, setNome] = useState(nomeInicial || '');
  const [tipo, setTipo] = useState(tipoInicial || '');
  const [tipos, setTipos] = useState([]);
  const [carregandoTipos, setCarregandoTipos] = useState(true);
  const [gerindo, setGerindo] = useState(false);

  const carregarTipos = () => {
    supabase.from('formacao_precos_tipos').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => setTipos(data || []));
  };
  useEffect(() => {
    supabase.from('formacao_precos_tipos').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setTipos(data || []);
        setCarregandoTipos(false);
        if (!tipoInicial && (data || []).length > 0) setTipo(data[0].nome);
      });
  }, []);

  // categoria atual que foi desativada/renomeada continua aparecendo para não sumir da tela
  const opcoes = tipo && !tipos.some((t: any) => t.nome === tipo) ? [{ id: '_atual', nome: tipo }, ...tipos] : tipos;

  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro menor acn-fp-jan" role="dialog" aria-label={editando ? 'Atualizar Cotação' : 'Salvar Modelo de Cotação'}>
        <div className="acn-modal-cab">
          <span className="modal-title">
            <Icone path={editando ? mdiPencilOutline : mdiContentSaveOutline} size={18} />
            {editando ? 'Atualizar Cotação' : 'Salvar Modelo de Cotação'}
          </span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div>
            <div className="acn-label">Nome do Modelo *</div>
            <input className="acn-input" placeholder="Ex: PMSC Lote 3 – Nov/2026"
              value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <div className="acn-fp-rot-linha">
              <span className="acn-label">Categoria *</span>
              {podeGerirCategorias && (
                <Botao variante="discreto" pequeno icone={mdiCogOutline} onClick={() => setGerindo(g => !g)}>
                  {gerindo ? 'Fechar' : 'Gerenciar categorias'}
                </Botao>
              )}
            </div>
            <select className="acn-input" value={tipo} disabled={carregandoTipos}
              onChange={e => setTipo(e.target.value)}>
              {carregandoTipos && <option>Carregando...</option>}
              {!carregandoTipos && !tipo && <option value="">— escolha —</option>}
              {opcoes.map((t: any) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
            </select>
            {!podeGerirCategorias && (
              <div className="acn-ajuda">Precisa de uma categoria nova? Peça a um gerente ou administrador.</div>
            )}
            {gerindo && <GerenciarCategorias onMudou={carregarTipos} />}
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={salvando}
            onClick={() => { if (!nome.trim()) { alert('Informe o nome.'); return; } if (!tipo) { alert('Selecione a categoria.'); return; } onSalvar(nome.trim(), tipo); }}>
            {salvando ? 'Salvando...' : editando ? 'ATUALIZAR' : 'SALVAR'}
          </Botao>
          <Botao onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE CARREGAR TEMPLATE ───────────────────────────────────────────────
function ModalCarregar({ modelos, carregando, onCarregar, onExcluir, onClose, erro = '' }) {
  const [cat, setCat] = useState('');
  const lista = modelos.filter((m: any) => !cat || categoriaDe(m) === cat);
  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-fp-jan acn-fp-lista-jan" role="dialog" aria-label="Modelos Salvos">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiFolderOpenOutline} size={18} />Modelos Salvos</span>
          <FiltroCategoria lista={modelos} valor={cat} onChange={setCat} />
        </div>
        <div className="acn-modal-corpo">
          {erro && <Faixa tom="erro">Não foi possível ler os modelos ({erro}). Isso não quer dizer que não haja modelo salvo.</Faixa>}
          {carregando && <div className="acn-fp-vazio">Carregando...</div>}
          {!carregando && lista.length === 0 && !erro && (
            <div className="acn-fp-vazio">Nenhum modelo salvo.</div>
          )}
          {!carregando && agruparPorCategoria(lista).map(g => (
            <div key={g.nome}>
              <TituloCategoria nome={g.nome} qtd={g.itens.length} />
              {g.itens.map(m => (
                <div key={m.id} className="acn-fp-modelo">
                  <div className="acn-fp-modelo-txt">
                    <div className="acn-fp-modelo-nome">{m.nome}</div>
                    <div className="acn-ajuda">
                      {m.itens?.length || 0} itens · por {m.criado_por} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                      {m.opl_numero ? ` · OP: ${m.opl_numero}` : ''}
                      {m.desconto_maximo_pct > 0 ? ` · Desc.máx: ${m.desconto_maximo_pct}%` : ''}
                    </div>
                  </div>
                  <Botao variante="primario" pequeno onClick={() => onCarregar(m)}>Carregar</Botao>
                  <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Excluir modelo" aria-label="Excluir modelo" onClick={() => onExcluir(m.id)} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── IMPORTAR FORMAÇÃO EXISTENTE (modo embutido) ───────────────────────────────
// Diferente de "Carregar Modelo" (que só copia valores pra um registro novo),
// isto vincula de verdade o registro escolhido a este processo — o registro
// continua existindo em "Formação de Preços", agora com o vínculo atualizado.
function ModalImportar({ modelos, carregando, vinculo, vinculoLabels, vinculosPorCotacao, onImportar, onClose, erro = '' }) {
  const [cat, setCat] = useState('');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const jaVinculadaAqui = (m: any) =>
    (vinculosPorCotacao[m.id] || []).some((v:any) => v.tipo === vinculo.tipo && v.processo_id === vinculo.id);
  const disponiveis = modelos.filter((m: any) => !jaVinculadaAqui(m));
  const listaFiltrada = disponiveis.filter((m: any) => !cat || categoriaDe(m) === cat);
  const alternar = (id: string) => setSelecionadas(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const importar = async () => {
    const escolhidas = disponiveis.filter((m: any) => selecionadas.includes(m.id));
    if (!escolhidas.length) return;
    setImportando(true);
    await onImportar(escolhidas);
    setImportando(false);
  };
  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-fp-jan acn-fp-lista-jan" role="dialog" aria-label="Importar Formação Existente">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiDownloadOutline} size={18} />Importar Formação Existente</span>
          <FiltroCategoria lista={disponiveis} valor={cat} onChange={setCat} />
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">
            Marque uma ou mais formações. Elas passam a ficar ligadas a este processo (aparecem no seletor de versões) —
            o registro continua existindo em "Formação de Preços", sem cópia.
          </div>
          {erro && <Faixa tom="erro">Não foi possível ler as formações ({erro}). Isso não quer dizer que não haja formação para importar.</Faixa>}   {/* 7.59 */}
          {carregando && <div className="acn-fp-vazio">Carregando...</div>}
          {!carregando && listaFiltrada.length === 0 && !erro && (
            <div className="acn-fp-vazio">Nenhuma formação disponível.</div>
          )}
          {!carregando && agruparPorCategoria(listaFiltrada).map(g => (
            <div key={g.nome}>
              <TituloCategoria nome={g.nome} qtd={g.itens.length} />
              {g.itens.map((m: any) => {
                const vinculosAtuais = (vinculosPorCotacao[m.id] || [])
                  .map((v:any) => vinculoLabels[(v.tipo === 'crm' ? 'crm:' : 'lic:') + v.processo_id])
                  .filter(Boolean);
                const marcada = selecionadas.includes(m.id);
                return (
                  <label key={m.id} className={'acn-fp-modelo marcavel' + (marcada ? ' marcada' : '')}>
                    <input type="checkbox" checked={marcada} onChange={() => alternar(m.id)} />
                    <div className="acn-fp-modelo-txt">
                      <div className="acn-fp-modelo-nome">{m.nome || <em>sem nome</em>}{m.versao ? ` · v${m.versao}` : ''}</div>
                      <div className="acn-ajuda">
                        {m.itens?.length || 0} itens · por {m.criado_por} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                      </div>
                      {vinculosAtuais.length > 0 && (
                        <div className="acn-ajuda atencao">
                          <Icone path={mdiLinkVariant} size={13} /> já atende: {vinculosAtuais.join(' · ')}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <div className="acn-modal-rodape acn-fp-rodape-contagem">
          <span className="acn-ajuda">{selecionadas.length} selecionada(s)</span>
          <Botao variante="primario" icone={mdiDownloadOutline} disabled={!selecionadas.length || importando} onClick={importar}>
            {importando ? 'Vinculando...' : `Vincular ${selecionadas.length || ''} selecionada(s)`}
          </Botao>
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

// Aceita tanto "15000" quanto o formato brasileiro "15.000,50" — sem isso,
// parseFloat("15.000") vira 15 (trunca no ponto de milhar) e o resultado
// sai errado por um fator de 1000, sem nenhum aviso ao usuário.
const parseNumBr = (v) => parseFloat(String(v).trim().replace(/\./g, '').replace(',', '.')) || 0;

// ─── MARKUP REVERSO POR PRODUTO ───────────────────────────────────────────────
// Inverso exato do calcItem:
//   CUSTO : preço = custo·(1+m)/(1−difal)  →  m = preço·(1−difal)/custo − 1
//   TABELA: preço = custo·(1−d)/(1−difal)  →  d = 1 − preço·(1−difal)/custo
// `custoUnitBrl` já vem com IPI, ST e câmbio (é o "custo c/ impostos BRL").
function MarkupReversoProduto({ item, custoUnitBrl, modoTabela, bloqueado, onAplicar }) {
  const [preco, setPreco] = useState('');
  const aplicar = () => {
    const pv = parseNumBr(preco);
    const difal = (Number(item.difal_pct) || 0) / 100;
    if (!(pv > 0)) { alert('Informe o preço unitário desejado.'); return; }
    if (!(custoUnitBrl > 0)) { alert('Informe o custo do produto antes — sem custo não há markup.'); return; }
    const razao = pv * (1 - difal) / custoUnitBrl;
    const valor = modoTabela ? (1 - razao) * 100 : (razao - 1) * 100;
    onAplicar(String(Math.round(valor * 100) / 100));
    setPreco('');
  };
  return (
    <div title={bloqueado ? 'Desmarque "Markup Global" para usar markup por produto' : 'Digite o preço unitário que você quer e aplique'}>
      <div className="acn-fp-ir-rot2 com-ic"><Icone path={mdiRefresh} size={12} /> Preço unit. desejado</div>
      <div className="acn-fp-mr-linha">
        <input className="acn-input acn-fp-ir-campo acn-fp-num"
          placeholder={bloqueado ? 'markup global' : 'R$'} value={preco} disabled={bloqueado}
          onChange={e => setPreco(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') aplicar(); }} />
        <Botao variante="primario" pequeno icone={mdiRefresh} onClick={aplicar} disabled={bloqueado || !preco}
          title={modoTabela ? 'Calcula e aplica o desconto' : 'Calcula e aplica o markup'}
          aria-label={modoTabela ? 'Calcula e aplica o desconto' : 'Calcula e aplica o markup'} />
      </div>
    </div>
  );
}

// ─── CALCULADORA MARKUP REVERSO ───────────────────────────────────────────────
function CalcMarkupReverso() {
  const [precoVenda, setPrecoVenda] = useState('');
  const [custoFob, setCustoFob]     = useState('');
  const [difal, setDifal]           = useState('0');
  const [resultado, setResultado]   = useState(null);

  const calcular = () => {
    const pv = parseNumBr(precoVenda);
    const cf = parseNumBr(custoFob);
    const d  = parseNumBr(difal) / 100;
    if (pv <= 0 || cf <= 0) { alert('Informe preço de venda e custo.'); return; }
    const markup = pv * (1 - d) / cf - 1;
    setResultado(markup * 100);
  };

  return (
    <div className="acn-fp-calc">
      <div className="acn-fp-calc-tit" data-acn-familia="info"><Icone path={mdiRefresh} size={15} /> Markup Reverso</div>
      <div className="acn-fp-calc-linha">
        <div>
          <div className="acn-fp-rot">Preço de Venda (R$)</div>
          <input className="acn-input acn-fp-in-110" placeholder="Ex: 15000" value={precoVenda} onChange={e=>setPrecoVenda(e.target.value)} />
        </div>
        <div>
          <div className="acn-fp-rot">Custo c/Impostos BRL</div>
          <input className="acn-input acn-fp-in-110" placeholder="Ex: 8000" value={custoFob} onChange={e=>setCustoFob(e.target.value)} />
        </div>
        <div>
          <div className="acn-fp-rot">DIFAL %</div>
          <input className="acn-input acn-fp-in-70" value={difal} onChange={e=>setDifal(e.target.value)} />
        </div>
        <Botao variante="primario" onClick={calcular}>Calcular</Botao>
        {resultado != null && (
          <div className="acn-fp-calc-res" data-acn-familia={resultado >= 0 ? 'ok' : 'erro'}>
            Markup = {fmtPct(resultado)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CALCULADORA IMPOSTO REVERSO ──────────────────────────────────────────────
function CalcImpostoReverso() {
  const [precoComImposto, setPrecoComImposto] = useState('');
  const [imposto, setImposto]                 = useState('16');
  const [resultado, setResultado]             = useState(null);

  const calcular = () => {
    const p = parseNumBr(precoComImposto);
    const i = parseNumBr(imposto) / 100;
    if (p <= 0) { alert('Informe o preço com imposto.'); return; }
    const semImposto  = p / (1 + i);
    const valorImposto = p - semImposto;
    setResultado({ semImposto, valorImposto });
  };

  return (
    <div className="acn-fp-calc">
      <div className="acn-fp-calc-tit" data-acn-familia="neutro"><Icone path={mdiCalculatorVariantOutline} size={15} /> Imposto Reverso</div>
      <div className="acn-fp-calc-linha">
        <div>
          <div className="acn-fp-rot">Preço com Imposto (R$)</div>
          <input className="acn-input acn-fp-in-120" placeholder="Ex: 18600" value={precoComImposto} onChange={e=>setPrecoComImposto(e.target.value)} />
        </div>
        <div>
          <div className="acn-fp-rot">Imposto %</div>
          <input className="acn-input acn-fp-in-70" value={imposto} onChange={e=>setImposto(e.target.value)} />
        </div>
        <Botao variante="primario" onClick={calcular}>Calcular</Botao>
        {resultado != null && (
          <div className="acn-fp-calc-res" data-acn-familia="neutro">
            Sem imposto: <strong>{fmtR(resultado.semImposto)}</strong> &nbsp;|&nbsp; Imposto: <strong>{fmtR(resultado.valorImposto)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MODAL RÁPIDO: CRIAR NOVO ITEM NO CATÁLOGO ───────────────────────────────
function CriarItemModal({ nomeInicial, onSalvo, onClose }) {
  const [form, setForm] = useState({
    nome: nomeInicial || '', marca: '', fornecedor: '', moeda: 'REAL',
    custo_unit: 0, ipi_pct: 0, st_pct: 0, tipo_calculo: 'CUSTO', markup_pct: 30,
    difal_pct: 0, imposto_pct: 16, custo_fixo_pct: 3, unidade: 'UN', ativo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const salvar = async () => {
    if (!form.nome?.trim() || salvando || salvandoRef.current) return;   // 7.59: o clique duplo criava o item duas vezes (o ref vale na hora; o estado só no desenho seguinte)
    salvandoRef.current = true;
    setSalvando(true);
    const { data, error: erroItem } = await supabase.from('cadastro_itens').insert([{
      nome: form.nome.trim(), marca: form.marca?.trim() || '', fornecedor: form.fornecedor?.trim() || '',
      moeda: form.moeda || 'REAL', custo_unit: Number(form.custo_unit) || 0,
      ipi_pct: Number(form.ipi_pct) || 0, st_pct: Number(form.st_pct) || 0,
      tipo_calculo: form.tipo_calculo === 'TABELA' ? 'TABELA' : 'CUSTO',
      markup_pct: Number(form.markup_pct) || 30, difal_pct: Number(form.difal_pct) || 0,
      imposto_pct: Number(form.imposto_pct) || 16, custo_fixo_pct: Number(form.custo_fixo_pct) || 3,
      unidade: form.unidade || 'UN', ativo: true,
    }]).select().single();
    salvandoRef.current = false;
    setSalvando(false);
    if (erroItem) { alert('Não foi possível criar o item no catálogo: ' + erroItem.message); return; }   // 7.59: não fazia nada, sem aviso
    if (data) onSalvo(data);
  };

  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-fp-jan" role="dialog" aria-label="Novo Item no Catálogo">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPlus} size={18} />Novo Item no Catálogo</span>
          <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-fp-grade2">
            <div className="acn-fp-larga">
              <span className="acn-label">Nome / Produto *</span>
              <input className={'acn-input' + (!form.nome ? ' acn-fp-obrigatorio' : '')}
                value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do item" autoFocus />
            </div>
            <div><span className="acn-label">Marca</span><input className="acn-input" value={form.marca} onChange={e=>set('marca',e.target.value)} placeholder="Ex: Schneider" /></div>
            <div><span className="acn-label">Fornecedor</span><input className="acn-input" value={form.fornecedor} onChange={e=>set('fornecedor',e.target.value)} placeholder="Fornecedor" /></div>
            <div>
              <span className="acn-label">Moeda</span>
              <select className="acn-input" value={form.moeda} onChange={e=>set('moeda',e.target.value)}>
                {['REAL','DOLAR','EURO'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><span className="acn-label">Custo Unitário</span><input className="acn-input" type="number" min={0} step="0.01" value={form.custo_unit} onChange={e=>set('custo_unit',e.target.value)} /></div>
            <div>
              <span className="acn-label">Tipo Cálculo</span>
              <select className="acn-input" value={form.tipo_calculo} onChange={e=>set('tipo_calculo',e.target.value)}>
                <option value="CUSTO">CUSTO (markup)</option>
                <option value="TABELA">TABELA (desconto)</option>
              </select>
            </div>
          </div>
          <div className="acn-fp-grade5">
            {[['IPI%','ipi_pct'],['ST%','st_pct'],[form.tipo_calculo==='TABELA'?'Desconto%':'Markup%','markup_pct'],['DIFAL%','difal_pct'],['Imposto%','imposto_pct']].map(([l,k])=>(
              <div key={k}><span className="acn-label">{l}</span><input className="acn-input" type="number" min={0} step="0.5" value={form[k]} onChange={e=>set(k,e.target.value)} /></div>
            ))}
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiCheck} onClick={salvar} disabled={salvando || !form.nome?.trim()}>
            {salvando ? 'Salvando...' : 'Salvar e Usar'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ─── AUTOCOMPLETE: BUSCA EM CADASTRO_ITENS + CADASTRO_PRODUTOS ────────────────
function ProdutoAutocomplete({ value, onFill, onExpand, params }) {
  const [q, setQ]           = useState(value || '');
  const [res, setRes]       = useState({ itens: [], produtos: [] });
  const [open, setOpen]     = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando]   = useState(false);
  const ref   = useRef(null);
  const deb   = useRef(null);

  // mantém o campo sincronizado quando o item é preenchido externamente (load de modelo)
  useEffect(() => { setQ(value || ''); }, [value]);

  const buscar = (termo) => {
    clearTimeout(deb.current);
    if (!termo.trim()) { setRes({ itens:[], produtos:[] }); setOpen(false); return; }
    deb.current = setTimeout(async () => {
      setBuscando(true);
      const [{ data: itens }, { data: produtos }] = await Promise.all([
        buscarPorPalavras(supabase.from('cadastro_itens')
          .select('id,codigo,nome,marca,fornecedor,unidade,moeda,custo_unit,ipi_pct,st_pct,tipo_calculo,markup_pct,difal_pct,imposto_pct,custo_fixo_pct,compra_multiplo,custo_embalagem')
          .eq('ativo', true), ['nome_norm', 'codigo_norm'], termo).limit(8),
        buscarPorPalavras(supabase.from('cadastro_produtos')
          .select('id,codigo,nome,categoria,unidade,preco_venda,markup_pct,difal_pct,imposto_pct,custo_fixo_pct')
          .eq('ativo', true), ['nome_norm', 'codigo_norm'], termo).limit(5),
      ]);
      setRes({ itens: itens || [], produtos: produtos || [] });
      setOpen(true);
      setBuscando(false);
    }, 260);
  };

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // normaliza moeda do catálogo (USD/EUR) para o padrão do FormacaoPrecos (DOLAR/EURO)
  const normMoeda = (m) => m === 'USD' ? 'DOLAR' : m === 'EUR' ? 'EURO' : m || 'REAL';

  // Markup, DIFAL, imposto e custo fixo saem dos parâmetros DESTA formação —
  // o cadastro de itens manda só o custo e os dados do produto. Assim mexer no
  // markup de uma proposta não respinga em nenhuma outra nem no catálogo.
  const paramsDaFormacao = () => ({
    markup_pct:     Number(params?.markup_pct     ?? 100),
    difal_pct:      Number(params?.difal_pct      ?? 0),
    imposto_pct:    Number(params?.imposto_pct    ?? 16),
    custo_fixo_pct: Number(params?.custo_fixo_pct ?? 3),
  });

  const selecionarItem = (it) => {
    onFill({
      produto: it.nome, marca: it.marca || '', fornecedor: it.fornecedor || '',
      moeda: normMoeda(it.moeda), custo_unit: it.custo_unit || 0,
      ipi_pct: it.ipi_pct || 0, st_pct: it.st_pct || 0,
      tipo_calculo: it.tipo_calculo === 'TABELA' ? 'TABELA' : 'CUSTO',
      ...paramsDaFormacao(),
    });
    setQ(it.nome); setOpen(false);
  };

  const selecionarProdutoKit = (p) => {
    onFill({
      kit_id: p.id, kit_nome: p.nome,
      produto: p.nome, marca: '', fornecedor: '', moeda: 'REAL',
      custo_unit: p.preco_venda || 0, ipi_pct: 0, st_pct: 0,
      ...paramsDaFormacao(), markup_pct: 0,   // kit fechado entra pelo preço do produto
    });
    setQ(p.nome); setOpen(false);
  };

  // Abre o kit item a item, com os sub-kits vinculados já expandidos. O kit manda
  // na COMPOSIÇÃO; custo, markup e demais valores são desta formação (começam
  // pelos do catálogo e ficam livres para ajuste aqui).
  const expandirBom = async (p) => {
    const linhasKit = await estruturaDoKit(p.id);
    setOpen(false);
    if (!linhasKit.length) { selecionarProdutoKit(p); return; }
    const linhas = linhasKit.map(l => {
      const it = l.item || {};
      return {
        kit_id: p.id, kit_nome: p.nome,
        produto: it.nome || '', marca: it.marca || '', fornecedor: it.fornecedor || '',
        moeda: normMoeda(it.moeda), qt: l.quantidade || 1,
        observacao_kit: l.origem.length ? `Kit ${l.origem.join(' › ')}` : '',
        custo_unit: it.custo_unit || 0, ipi_pct: it.ipi_pct || 0, st_pct: it.st_pct || 0,
        tipo_calculo: it.tipo_calculo === 'TABELA' ? 'TABELA' : 'CUSTO',
        ...paramsDaFormacao(),
      };
    });
    onExpand(linhas);
  };

  const temResultados = res.itens.length > 0 || res.produtos.length > 0;

  return (
    <div ref={ref} className="acn-fp-ac">
      <input
        className="acn-input acn-fp-ac-campo"
        placeholder="Descrição do item"
        value={q}
        onChange={e => { setQ(e.target.value); onFill({ produto: e.target.value }); buscar(e.target.value); }}
        onFocus={() => { if (temResultados) setOpen(true); }}
      />
      {buscando && (
        <div className="acn-fp-ac-espera"><Icone path={mdiTimerSand} size={14} /></div>
      )}
      {open && (
        <div className="acn-fp-ac-lista">
          {/* ── Itens do catálogo ── */}
          {res.itens.length > 0 && (
            <>
              <div className="acn-fp-ac-tit" data-acn-familia="marca">
                <Icone path={mdiPackageVariantClosed} size={13} /> Itens do Catálogo
              </div>
              {res.itens.map(it => (
                <div key={it.id} className="acn-fp-ac-item" onClick={() => selecionarItem(it)}>
                  <div>
                    <div className="acn-fp-ac-nome">{it.nome}</div>
                    <div className="acn-fp-ac-apoio">
                      {[it.marca, it.fornecedor].filter(Boolean).join(' · ')} {it.codigo ? `· ${it.codigo}` : ''}
                    </div>
                  </div>
                  <div className="acn-fp-ac-preco">
                    <div className="acn-fp-ac-valor" data-acn-familia="marca">
                      R$ {Number(it.custo_unit||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </div>
                    <div className="acn-fp-ac-apoio">{it.moeda} · {it.unidade}</div>
                    {/* comprado em par/trio: o custo acima já é o da UNIDADE,
                        e vale dizer isso para ninguém achar que está errado */}
                    {Number(it.compra_multiplo) > 1 && (
                      <div className="acn-fp-ac-multi">
                        por unidade · vem {it.compra_multiplo} por embalagem
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Produtos compostos ── */}
          {res.produtos.length > 0 && (
            <>
              <div className="acn-fp-ac-tit" data-acn-familia="info">
                <Icone path={mdiFactory} size={13} /> Produtos Compostos (BOM)
              </div>
              {res.produtos.map(p => (
                <div key={p.id} className="acn-fp-ac-prod">
                  <div className="acn-fp-ac-item sem-borda">
                    <div>
                      <div className="acn-fp-ac-nome">{p.nome}</div>
                      <div className="acn-fp-ac-apoio">{p.categoria || ''} {p.codigo ? `· ${p.codigo}` : ''}</div>
                    </div>
                    <div className="acn-fp-ac-preco">
                      {p.preco_venda > 0 && (
                        <div className="acn-fp-ac-valor" data-acn-familia="info">
                          R$ {Number(p.preco_venda||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* botões de ação para produto */}
                  <div className="acn-fp-ac-acoes">
                    <Botao variante="discreto" pequeno icone={mdiPackageVariant} onClick={() => selecionarProdutoKit(p)}>
                      Inserir como kit (1 linha)
                    </Botao>
                    <Botao variante="discreto" pequeno icone={mdiCogOutline} onClick={() => expandirBom(p)}>
                      Expandir componentes BOM
                    </Botao>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Nenhum resultado ── */}
          {!buscando && !temResultados && q.trim() && (
            <div className="acn-fp-ac-vazio">
              Nenhum item encontrado para "{q}"
            </div>
          )}

          {/* ── Criar novo ── */}
          <div className="acn-fp-ac-criar" onClick={() => { setOpen(false); setCriando(true); }}>
            <Icone path={mdiPlus} size={14} />
            <span>
              Criar "{q.trim() || 'novo item'}" no catálogo
            </span>
          </div>
        </div>
      )}

      {/* Modal criar novo item */}
      {criando && (
        <CriarItemModal
          nomeInicial={q}
          onSalvo={(item) => { selecionarItem(item); setCriando(false); }}
          onClose={() => setCriando(false)}
        />
      )}
    </div>
  );
}

// ─── LINHA DE ITEM ────────────────────────────────────────────────────────────
function ItemRow({ item, result, onSet, onFill, onExpand, onRemove, usarParamsGlobais, usarMarkupGlobal, params, isVendedor, onLiberarGlobais, onLiberarMarkup }) {
  const { custoUnitBrl, custoTotal, valorUnit, valorTotal, totalDifal, totalImposto, margem, lucroPct, validacao } = result;
  const modoTabela = item.tipo_calculo === 'TABELA';
  const lucroFam = lucroPct >= 10 ? 'ok' : lucroPct >= 5 ? 'atencao' : 'erro';
  const [aberto, setAberto] = useState(false);

  // campos de valor travados pelos parâmetros globais ficam cinza (só leitura)
  const classeGlobal = usarParamsGlobais ? ' acn-fp-travado' : '';

  // Vendedor não vê custo/impostos — não há nada pra expandir (o markup fica no cabeçalho, à vista de todos).
  const temDetalhe = !isVendedor;

  // Rótulo de seção reutilizável nas 3 seções do corpo expandido
  const secao = (icone, label) => (
    <div className="acn-fp-ir-secao">
      <Icone path={icone} size={14} /> {label}
    </div>
  );
  const valor = (label, fam, texto) => (
    <div>
      <div className="acn-fp-ir-rot2">{label}</div>
      <div className="acn-fp-ir-val" data-acn-familia={fam}>{texto}</div>
    </div>
  );

  return (
    // Sem overflow:hidden aqui de propósito — o dropdown de busca de produto
    // (ProdutoAutocomplete, position:absolute) precisa poder "vazar" pra fora
    // do cartão pra aparecer inteiro; um ancestral com overflow:hidden cortava
    // a lista de sugestões numa faixa minúscula, impossível de usar.
    <div className="acn-fp-ir">
      {/* ── Cabeçalho do item — sempre visível. Todo campo segue a mesma
          estrutura (rótulo pequeno + linha de conteúdo) e a linha alinha
          pela base (flex-end) — com todos os blocos da mesma altura, os
          rótulos ficam alinhados no topo e os campos/botões alinhados
          embaixo, tudo na mesma linha de base ── */}
      <div className="acn-fp-ir-cab">
        <div className="acn-fp-ir-prod">
          <div className="acn-fp-ir-rot">Produto / Descrição</div>
          <ProdutoAutocomplete
            value={item.produto}
            params={params}
            onFill={dados => onFill(dados)}
            onExpand={linhas => onExpand(linhas)}
          />
        </div>
        <div className="acn-fp-ir-c1">
          <div className="acn-fp-ir-rot">Marca</div>
          <input className="acn-input acn-fp-ir-campo"
            value={item.marca} onChange={e=>onSet('marca',e.target.value)} />
        </div>
        <div className="acn-fp-ir-c1">
          <div className="acn-fp-ir-rot">Modelo</div>
          <input className="acn-input acn-fp-ir-campo"
            value={item.modelo||''} onChange={e=>onSet('modelo',e.target.value)} />
        </div>
        <div className="acn-fp-ir-qt">
          <div className="acn-fp-ir-rot"
            title='Quantidade deste produto DENTRO DE 1 unidade do Item (ex.: 2 antenas por viatura). Para a quantidade de viaturas/unidades do Item inteiro, use o campo "Quantidade do Item", acima da lista.'>
            Qt/un.
          </div>
          <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
            min={1} value={item.qt} onChange={e=>onSet('qt', e.target.value)} />
        </div>
        {/* Markup (ou desconto, no modo TABELA) deste produto — ao lado da quantidade,
            à vista e editável por todos os usuários. Com "Markup Global" ligado fica
            travado mostrando o valor global, como antes. */}
        <div className="acn-fp-ir-mk">
          <div className="acn-fp-ir-rot"
            title={usarMarkupGlobal ? 'Markup Global ligado: vale o markup dos parâmetros globais' : undefined}>
            {modoTabela ? 'Desconto %' : 'Markup %'}
          </div>
          <input type="number"
            className={'acn-input acn-fp-ir-campo acn-fp-num' + (usarMarkupGlobal ? ' acn-fp-mk-global' : item.markup_pct < 0 ? ' acn-fp-neg' : '')}
            aria-label={modoTabela ? 'Desconto % do produto' : 'Markup % do produto'}
            step="0.1" value={item.markup_pct}
            onChange={e=>{ if(!usarMarkupGlobal) onSet('markup_pct', e.target.value); }}
            readOnly={!!usarMarkupGlobal}
            title={usarMarkupGlobal ? 'Vale o markup global. Clique para liberar a edição item a item.' : undefined}
            onClick={() => { if (usarMarkupGlobal) onLiberarMarkup?.(); }} />
        </div>
        <div className="acn-fp-ir-uni">
          <div className="acn-fp-ir-rot">Valor Unit.</div>
          <div className="acn-fp-ir-vu" data-acn-familia="info">{fmtR(valorUnit)}</div>
        </div>
        <div className="acn-fp-ir-tot">
          <div className="acn-fp-ir-rot">Valor Total</div>
          <div className="acn-fp-ir-vt" data-acn-familia="info">{fmtR(valorTotal)}</div>
        </div>
        {temDetalhe && (
          <Botao variante="discreto" pequeno icone={aberto ? mdiChevronUp : mdiChevronDown}
            onClick={() => setAberto(v => !v)} title="Custo, impostos e informações do produto">
            {aberto ? 'Menos' : 'Custo/impostos'}
          </Botao>
        )}
        <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Remover item" aria-label="Remover item" onClick={onRemove} />
      </div>

      {/* ── Corpo expandido — reorganizado em 3 seções rotuladas ── */}
      {aberto && temDetalhe && (
        <div className="acn-fp-ir-corpo">

          {secao(mdiCashMultiple, 'Precificação')}
          <div className="acn-fp-ir-grade">
            <div>
              <div className="acn-fp-ir-rot2">Moeda</div>
              <select className="acn-input acn-fp-ir-campo"
                value={item.moeda} onChange={e=>onSet('moeda', e.target.value)}>
                {MOEDAS.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div className="acn-fp-ir-rot2">Custo Unit.</div>
              <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
                min={0} step="0.01" value={item.custo_unit} onChange={e=>onSet('custo_unit', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">IPI%</div>
              <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
                min={0} step="0.1" value={item.ipi_pct} onChange={e=>onSet('ipi_pct', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">ST%</div>
              <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
                min={0} step="0.1" value={item.st_pct} onChange={e=>onSet('st_pct', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">Tipo Cálculo</div>
              <Chips className="acn-fp-ir-tc" ativo={item.tipo_calculo || 'CUSTO'} onChange={t => onSet('tipo_calculo', t)}
                itens={[{ id: 'CUSTO', rotulo: 'CUSTO' }, { id: 'TABELA', rotulo: 'TABELA' }]} />
            </div>
            {/* Markup reverso DESTE produto: digita o preço unitário desejado e o
                markup (ou desconto, no modo TABELA) é calculado e aplicado aqui.
                É a mesma conta da calculadora "Markup Reverso" do rodapé, que
                só mostrava o número, sem aplicar em produto nenhum. */}
            <MarkupReversoProduto item={item} custoUnitBrl={custoUnitBrl} modoTabela={modoTabela}
              bloqueado={!!usarMarkupGlobal} onAplicar={(v) => onSet('markup_pct', v)} />
          </div>

          {secao(mdiReceiptTextOutline, 'Impostos & Validação')}
          <div className="acn-fp-ir-grade">
            <div>
              <div className="acn-fp-ir-rot2">DIFAL%</div>
              <input type="number" className={'acn-input acn-fp-ir-campo acn-fp-num' + classeGlobal}
                step="0.1" value={usarParamsGlobais ? params.difal_pct : item.difal_pct}
                onChange={e=>{ if(!usarParamsGlobais) onSet('difal_pct', e.target.value); }}
                readOnly={usarParamsGlobais}
                title={usarParamsGlobais ? 'Vale o parâmetro global. Clique para liberar a edição item a item.' : undefined}
                onClick={() => { if (usarParamsGlobais) onLiberarGlobais?.(); }} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">Imposto%</div>
              <input type="number" className={'acn-input acn-fp-ir-campo acn-fp-num' + classeGlobal}
                step="0.1" value={usarParamsGlobais ? params.imposto_pct : item.imposto_pct}
                onChange={e=>{ if(!usarParamsGlobais) onSet('imposto_pct', e.target.value); }}
                readOnly={usarParamsGlobais}
                title={usarParamsGlobais ? 'Vale o parâmetro global. Clique para liberar a edição item a item.' : undefined}
                onClick={() => { if (usarParamsGlobais) onLiberarGlobais?.(); }} />
            </div>
            {valor('Custo c/Imp. Unit', 'marca', fmtR(custoUnitBrl))}
            {valor('Custo Total', 'marca', fmtR(custoTotal))}
            {valor('DIFAL Total', 'atencao', fmtR(totalDifal))}
            {valor('Imposto Total', 'erro', fmtR(totalImposto))}
            {valor('Lucro%', lucroFam, fmtPct(lucroPct))}
            <div>
              <div className="acn-fp-ir-rot2">
                {modoTabela ? `Desc. máx. ${DESCONTO_MAXIMO_TABELA_PCT}%` : `Markup mín. ${MARKUP_MINIMO_CUSTO_PCT}%`}
              </div>
              <Selo familia={validacao === 'ERRO' ? 'erro' : 'ok'} ponto={false}>
                {validacao === 'ERRO' ? 'ERRO' : 'OK'}
              </Selo>
            </div>
          </div>

          {secao(mdiInformationOutline, 'Informações do Produto (só referência, não entram no cálculo)')}
          <div className="acn-fp-ir-grade">
            <div>
              <div className="acn-fp-ir-rot2">Prazo de Entrega</div>
              <input className="acn-input acn-fp-ir-campo"
                value={item.prazo_entrega||''} onChange={e=>onSet('prazo_entrega', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">Garantia</div>
              <input className="acn-input acn-fp-ir-campo"
                value={item.garantia||''} onChange={e=>onSet('garantia', e.target.value)} />
            </div>
            <div className="acn-fp-span2">
              <div className="acn-fp-ir-rot2">Regime do Fornecedor</div>
              <select className="acn-input acn-fp-ir-campo"
                value={item.fornecedor_regime||''} onChange={e=>onSet('fornecedor_regime', e.target.value)}>
                <option value="">— Selecione —</option>
                {['Simples','Lucro real','Lucro presumido','Regime especial'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="acn-fp-ir-rot2">NCM</div>
              <input className="acn-input acn-fp-ir-campo"
                value={item.ncm||''} onChange={e=>onSet('ncm', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">Origem</div>
              <select className="acn-input acn-fp-ir-campo"
                value={item.origem_produto||''} onChange={e=>onSet('origem_produto', e.target.value)}>
                <option value="">— Selecione —</option>
                {['Nacional','Importado'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div className="acn-fp-ir-rot2">ICMS%</div>
              <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
                step="0.1" value={item.icms_pct||0} onChange={e=>onSet('icms_pct', e.target.value)} />
            </div>
            <div>
              <div className="acn-fp-ir-rot2">ISS%</div>
              <input type="number" className="acn-input acn-fp-ir-campo acn-fp-num"
                step="0.1" value={item.iss_pct||0} onChange={e=>onSet('iss_pct', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ABA PREÇOS FORMADOS (Vendedores + Todos) ─────────────────────────────────
function AbaPrecoFormados({ currentUser, isVendedor, onEditar, onClonar }) {
  const [cotacoes, setCotacoes]         = useState([]);
  const [carregando, setCarregando]     = useState(true);
  const [cotacaoAberta, setAberta]      = useState(null);
  const [desconto, setDesconto]         = useState(0);
  const [obs, setObs]                   = useState('');
  const [salvando, setSalvando]         = useState(false);
  const salvandoPropostaRef = useRef(false);
  const [propostas, setPropostas]       = useState([]);
  const [filtroCat, setFiltroCat]       = useState('');
  // Pedido do usuário em 07/10/2026: pesquisar por texto dentro dos preços formados (nome, empresa, OP, autor, categoria e os nomes dos itens).
  const [buscaPF, setBuscaPF]               = useState('');
  const [gerindoCat, setGerindoCat]     = useState(false);

  // Etapa 7.59: leitura que falha não pode parecer "nenhuma formação" (e a lista que já estava na tela fica)
  const [erroLeitura, setErroLeitura] = useState('');
  const carregarCotacoes = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    if (error) { setErroLeitura(error.message); setCarregando(false); return; }
    setErroLeitura('');
    setCotacoes(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => { carregarCotacoes(); }, [carregarCotacoes]);

  const abrirCotacao = async (m) => {
    setAberta(m);
    setDesconto(0);
    setObs('');
    const { data, error } = await supabase.from('cotacoes_propostas')
      .select('*').eq('cotacao_id', m.id).order('criado_em', { ascending: false });
    if (error) alert('Não foi possível ler as propostas desta formação: ' + error.message + '\n\nA lista de propostas abaixo pode estar incompleta.');   // 7.59
    setPropostas(data || []);
  };

  const salvarProposta = async () => {
    if (!cotacaoAberta || salvando || salvandoPropostaRef.current) return;   // 7.59: clique duplo gravava a proposta duas vezes (o estado `salvando` só muda no desenho seguinte; o ref vale na hora)
    const maxDesc = Number(cotacaoAberta.desconto_maximo_pct) || 0;
    if (desconto > maxDesc) { alert(`Desconto máximo permitido é ${maxDesc}%.`); return; }
    salvandoPropostaRef.current = true;
    setSalvando(true);
    const prms  = cotacaoAberta.parametros_globais || {};
    const items = (cotacaoAberta.itens || []);
    const totVendas = estruturaFormacao(items, prms, calcItem).geral.totVendas;   // já × quantidades
    const valorComDesconto = totVendas * (1 - desconto / 100);
    const { error } = await supabase.from('cotacoes_propostas').insert([{
      cotacao_id:          cotacaoAberta.id,
      cotacao_nome:        cotacaoAberta.nome,
      opl_numero:          cotacaoAberta.opl_numero || null,
      desconto_pct:        desconto,
      valor_total:         totVendas,
      valor_com_desconto:  valorComDesconto,
      criado_por:          currentUser?.nome,
      observacoes:         obs,
    }]);
    if (error) { alert('Erro: ' + error.message); }
    else {
      alert('Proposta salva!');
      const { data } = await supabase.from('cotacoes_propostas')
        .select('*').eq('cotacao_id', cotacaoAberta.id).order('criado_em', { ascending: false });
      setPropostas(data || []);
    }
    salvandoPropostaRef.current = false;
    setSalvando(false);
  };

  // ── Detalhe de cotação aberta ──
  if (cotacaoAberta) {
    const prms  = cotacaoAberta.parametros_globais || {};
    const items = (cotacaoAberta.itens || []).map(it => ({ ...it, _id: Math.random().toString(36).slice(2) }));
    const estr     = estruturaFormacao(items, prms, calcItem);   // totais já × quantidades do item/subgrupo
    const results  = estr.results;
    const { totVendas, totImposto, totDifal } = estr.geral;
    const maxDesc    = Number(cotacaoAberta.desconto_maximo_pct) || 0;
    const descontoValor    = totVendas * desconto / 100;
    const valorComDesconto = totVendas * (1 - desconto / 100);

    return (
      <div className="acn-fp-pf">
        <div className="acn-fp-pf-cab">
          <Botao icone={mdiArrowLeft} onClick={() => setAberta(null)}>Voltar</Botao>
          <div>
            <div className="acn-fp-pf-nome">{cotacaoAberta.nome}</div>
            <div className="acn-ajuda">
              {cotacaoAberta.tipo} · {cotacaoAberta.empresa}
              {cotacaoAberta.opl_numero ? ` · OP: ${cotacaoAberta.opl_numero}` : ''}
              {' '}· por {cotacaoAberta.criado_por}
              {maxDesc > 0 ? <span className="acn-fp-pf-max">Desc.máx: {maxDesc}%</span> : ''}
            </div>
          </div>
        </div>

        {/* Tabela de itens */}
        <div className="acn-fp-pf-tabela">
          <table className="acn-tabela acn-densa">
            <thead>
              <tr>
                <th>Produto / Descrição</th>
                <th className="centro"
                  title='Quantidade deste produto por unidade do Item — não confundir com "Quantidade do Item" (o lote inteiro)'>Qt/un.</th>
                {!isVendedor && <th className="dir">Custo Unit.</th>}
                {!isVendedor && <th className="dir">Custo Total</th>}
                {!isVendedor && <th className="dir">DIFAL</th>}
                <th className="dir">Valor Unit.</th>
                <th className="dir">Valor Total</th>
                <th className="dir">Imposto</th>
                {!isVendedor && <th className="dir">Lucro%</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const r = results[idx];
                const lucroTxt = r.lucroPct >= 10 ? 'acn-txt-ok' : r.lucroPct >= 5 ? 'acn-txt-atencao' : 'acn-txt-erro';
                return (
                  <tr key={item._id}>
                    <td>
                      {item.produto || '—'}{item.marca ? <span className="acn-fraco"> ({item.marca})</span> : ''}
                    </td>
                    <td className="centro">{item.qt}</td>
                    {!isVendedor && <td className="dir acn-txt-ok">{fmtR(r.custoUnitBrl)}</td>}
                    {!isVendedor && <td className="dir acn-txt-ok">{fmtR(r.custoTotal)}</td>}
                    {!isVendedor && <td className="dir acn-txt-atencao">{fmtR(r.totalDifal)}</td>}
                    <td className="dir acn-txt-info">{fmtR(r.valorUnit)}</td>
                    <td className="dir acn-txt-info acn-forte">{fmtR(r.valorTotal)}</td>
                    <td className="dir acn-txt-erro">{fmtR(r.totalImposto)}</td>
                    {!isVendedor && <td className={'dir acn-forte ' + lucroTxt}>{fmtPct(r.lucroPct)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totais + simulação de desconto */}
        <div className="acn-fp-pf-sim">
          <div className="acn-quadro-titulo"><Icone path={mdiCashMultiple} size={14} /> Simulação de Desconto</div>
          <div className="acn-fp-pf-sim-linha">
            <div>
              <div className="acn-fp-rot">Total de Vendas</div>
              <div className="acn-fp-pf-v1" data-acn-familia="info">{fmtR(totVendas)}</div>
            </div>
            <div>
              <div className="acn-fp-rot">Total Impostos</div>
              <div className="acn-fp-pf-v2" data-acn-familia="erro">{fmtR(totImposto)}</div>
            </div>
            {!isVendedor && (
              <div>
                <div className="acn-fp-rot">Total DIFAL</div>
                <div className="acn-fp-pf-v2" data-acn-familia="atencao">{fmtR(totDifal)}</div>
              </div>
            )}
            <div className="acn-fp-pf-desc">
              <div className="acn-fp-rot">
                Desconto % &nbsp;
                {maxDesc > 0
                  ? <span>(máx autorizado: <strong className="acn-txt-erro">{maxDesc}%</strong>)</span>
                  : <span className="acn-fraco">(sem desconto definido)</span>}
              </div>
              <div className="acn-fp-pf-desc-campo">
                <input type="number" className="acn-input acn-fp-in-80 acn-fp-num"
                  min={0} max={maxDesc > 0 ? maxDesc : 100} step="0.1" value={desconto}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setDesconto(maxDesc > 0 ? Math.min(v, maxDesc) : v);
                  }} />
                <span className="acn-ajuda">%</span>
              </div>
            </div>
            {desconto > 0 && (
              <>
                <div>
                  <div className="acn-fp-rot">Desconto (R$)</div>
                  <div className="acn-fp-pf-v2" data-acn-familia="erro">- {fmtR(descontoValor)}</div>
                </div>
                <div className="acn-fp-pf-liq" data-acn-familia="ok">
                  <div className="acn-fp-rot">Total c/ Desconto</div>
                  <div className="acn-fp-pf-v1">{fmtR(valorComDesconto)}</div>
                </div>
              </>
            )}
          </div>
          <div>
            <div className="acn-fp-rot">Observações da proposta</div>
            <textarea className="acn-input acn-fp-pf-obs"
              placeholder="Condições especiais, validade da proposta, notas..."
              value={obs} onChange={e => setObs(e.target.value)} />
          </div>
          <div>
            <Botao variante="primario" icone={mdiContentSaveOutline} onClick={salvarProposta} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Proposta'}
            </Botao>
          </div>
        </div>

        {/* Histórico de propostas */}
        {propostas.length > 0 && (
          <div className="acn-fp-pf-sim">
            <div className="acn-quadro-titulo"><Icone path={mdiFileDocumentOutline} size={14} /> Propostas Salvas</div>
            {propostas.map(p => (
              <div key={p.id} className="acn-fp-prop">
                <span className="acn-ajuda">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</span>
                <span>Desc.: <strong>{p.desconto_pct}%</strong></span>
                <span>Total: <strong className="acn-txt-info">{fmtR(p.valor_total)}</strong></span>
                <span>c/ Desc.: <strong className="acn-txt-ok">{fmtR(p.valor_com_desconto)}</strong></span>
                <span className="acn-ajuda">por {p.criado_por}</span>
                {p.observacoes && <span className="acn-fp-prop-obs"><Linkify text={p.observacoes} /></span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Lista de cotações ──
  const cotacoesFiltradas = cotacoes.filter(m => (!filtroCat || categoriaDe(m) === filtroCat)
    && combinaBusca([m.nome, m.empresa, m.opl_numero, m.criado_por, categoriaDe(m), ...(m.itens || []).map((i: any) => i.produto || i.nome)], buscaPF));
  return (
    <div className="acn-fp-pf">
      <div className="acn-fp-pf-lista-cab">
        <div className="acn-fp-pf-tit"><Icone path={mdiFileMultipleOutline} size={18} /> Preços Formados</div>
        <FiltroCategoria lista={cotacoes} valor={filtroCat} onChange={setFiltroCat} />
        <input className="acn-input acn-fp-pf-busca" type="search" value={buscaPF} onChange={e => setBuscaPF(e.target.value)}
          placeholder="Buscar preço formado (nome, empresa, OP, autor, item)…" aria-label="Buscar preço formado" />
        {buscaPF.trim() && !carregando && <span className="acn-ajuda">{cotacoesFiltradas.length} de {cotacoes.length}</span>}
        {temPoderDeGerente(currentUser) && (
          <Botao icone={mdiCogOutline} onClick={() => setGerindoCat(g => !g)}>Categorias</Botao>
        )}
      </div>
      {gerindoCat && <div className="acn-fp-pf-cats"><GerenciarCategorias onMudou={carregarCotacoes} /></div>}
      {erroLeitura && <Faixa tom="erro" acao={<Botao pequeno onClick={carregarCotacoes}>Tentar de novo</Botao>}>Não foi possível ler as formações ({erroLeitura}). Isso não quer dizer que não haja formação salva{cotacoes.length ? '; a lista abaixo é a da última leitura que deu certo' : ''}.</Faixa>}
      {carregando && <div className="acn-fp-vazio">Carregando...</div>}
      {!carregando && cotacoes.length === 0 && !erroLeitura && (
        <div className="acn-fp-vazio">Nenhuma cotação salva.</div>
      )}
      {!carregando && cotacoes.length > 0 && cotacoesFiltradas.length === 0 && (
        <div className="acn-fp-vazio">{'Nenhum preço formado encontrado' + (buscaPF.trim() ? ' para "' + buscaPF.trim() + '"' : '')}.</div>
      )}
      <div className="acn-fp-pf-lista">
        {agruparPorCategoria(cotacoesFiltradas).map(g => (
          <React.Fragment key={g.nome}>
          <TituloCategoria nome={g.nome} qtd={g.itens.length} />
        {g.itens.map(m => {
          const prms    = m.parametros_globais || {};
          const items   = m.itens || [];
          const totVendas = estruturaFormacao(items, prms, calcItem).geral.totVendas;
          return (
            <div key={m.id} className="acn-fp-card">
              <div className="acn-fp-card-txt">
                <div className="acn-fp-card-nome">{m.nome}</div>
                <div className="acn-ajuda">
                  {m.empresa} · {items.length} {items.length === 1 ? 'item' : 'itens'}
                  {m.opl_numero ? ` · OP: ${m.opl_numero}` : ''}
                  {m.desconto_maximo_pct > 0 ? ` · Desc.máx: ${m.desconto_maximo_pct}%` : ''}
                  {' '}· por {m.criado_por} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div className="acn-fp-card-tot">
                <div className="acn-ajuda">Total de Vendas</div>
                <div className="acn-fp-card-v" data-acn-familia="info">{fmtR(totVendas)}</div>
              </div>
              <div className="acn-fp-card-acoes">
                {!isVendedor && onEditar && (
                  <Botao pequeno icone={mdiPencilOutline} onClick={() => onEditar(m)}>Editar</Botao>
                )}
                {!isVendedor && onClonar && (
                  <Botao pequeno icone={mdiContentCopy} onClick={() => onClonar(m)}>Clonar</Botao>
                )}
                <Botao variante="primario" pequeno icone={mdiEyeOutline} onClick={() => abrirCotacao(m)}>Abrir</Botao>
              </div>
            </div>
          );
        })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── RESUMO NO TOPO DA FORMAÇÃO ───────────────────────────────────────────────
// Todo o resumo fica ANTES da composição (pedido de 14/09): total geral de todos
// os itens, e cada lote com TODOS os seus itens (não só o item selecionado).
// A composição de cada item (custos, DIFAL, impostos, margem, lucro) fica
// recolhida e abre só quando a pessoa quer ver. Clicar no nome leva ao item.
function ResumoFormacaoTopo({ estrutura, isVendedor, multiplicador, plataforma, descontoPlatPct, retencaoPlatPct,
  descontoPlat, retencaoPlat, totalLiquidoPlat, loteAtivo, grupoAtivo, onSelecionar }: any) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [recolhido, setRecolhido] = useState(false);
  const alternar = (k: string) => setAbertos(a => ({ ...a, [k]: !a[k] }));
  const g = estrutura.geral;
  const linhasComposicao = [
    { label: 'Vendas',   k: 'totVendas',  fmt: fmtR,   hide: false },
    { label: 'Custos',   k: 'totCustos',  fmt: fmtR,   hide: isVendedor },
    { label: 'DIFAL',    k: 'totDifal',   fmt: fmtR,   hide: isVendedor },
    { label: 'Impostos', k: 'totImposto', fmt: fmtR,   hide: false },
    { label: 'Margem',   k: 'totMargem',  fmt: fmtR,   hide: isVendedor },
    { label: 'Lucro %',  k: 'lucroPct',   fmt: fmtPct, hide: isVendedor, semUnitario: true },
  ].filter(x => !x.hide);
  const th = (h: string, esquerda = false) => (
    <th key={h} className={esquerda ? 'esq' : 'dir'}>{h}</th>
  );
  // margem positiva = ok, negativa = erro (a mesma regra do resumo inteiro)
  const tomMargem = (v: number) => v >= 0 ? 'acn-txt-ok' : 'acn-txt-erro';
  if (!estrutura.itens.length) return null;

  return (
    <div className="acn-fp-rs">
      <div className={'acn-fp-rs-cab' + (recolhido ? ' recolhido' : '')}>
        <div className="acn-fp-rs-tit"><Icone path={mdiReceiptTextOutline} size={16} /> Resumo da formação</div>
        <div className="acn-fp-rs-total">
          <span className="acn-ajuda">Valor total de todos os itens</span>
          <span className="acn-fp-rs-total-v" data-acn-familia="info">{fmtR(g.totVendas)}</span>
        </div>
        <Botao pequeno icone={recolhido ? mdiChevronDown : mdiChevronUp} onClick={() => setRecolhido(r => !r)}>
          {recolhido ? 'Mostrar resumo' : 'Recolher'}
        </Botao>
      </div>

      {!recolhido && (<>
        {/* Totais gerais */}
        <div className="acn-fp-rs-kpis">
          {[
            { label:'Total de Vendas',   value: fmtR(g.totVendas),  fam:'info', hide: false },
            { label:'Total de Custos',   value: fmtR(g.totCustos),  fam:'ok', hide: isVendedor },
            { label:'Total DIFAL',       value: fmtR(g.totDifal),   fam:'atencao', hide: isVendedor },
            { label:'Total Impostos',    value: fmtR(g.totImposto), fam:'erro', hide: false },
            { label:'Margem Real Total', value: fmtR(g.totMargem),  fam: g.totMargem >= 0 ? 'ok' : 'erro', hide: isVendedor },
            { label:'Lucro % Geral',     value: fmtPct(g.lucroPct), fam: g.lucroPct >= 10 ? 'ok' : g.lucroPct >= 5 ? 'atencao' : 'erro', hide: isVendedor },
            ...(plataforma ? [
              { label:`Desconto ${plataforma.nome} (${descontoPlatPct}%)`, value: fmtR(descontoPlat),     fam:'info', hide: false },
              { label:`Retenção ${plataforma.nome} (${retencaoPlatPct}%)`, value: fmtR(retencaoPlat),     fam:'neutro', hide: false },
              { label:'Valor Líquido c/ Plataforma',                        value: fmtR(totalLiquidoPlat), fam:'marca', hide: false },
            ] : []),
          ].filter(x => !x.hide).map(({ label, value, fam }) => (
            <div key={label} className="acn-kpi acn-fp-rs-kpi">
              <span className="rot"><i data-acn-familia={fam} />{label}</span>
              <span className="acn-num acn-fp-rs-kv" data-acn-familia={/^(Margem|Lucro)/.test(label) ? fam : undefined}>{value}</span>
            </div>
          ))}
        </div>
        {multiplicador > 1 && (
          <div className="acn-fp-rs-mult">
            <strong>× {multiplicador} (Multiplicador geral)</strong>
            <span>Vendas: <strong>{fmtR(g.totVendas * multiplicador)}</strong></span>
            {!isVendedor && <span>Custos: <strong>{fmtR(g.totCustos * multiplicador)}</strong></span>}
            {!isVendedor && <span>DIFAL: <strong>{fmtR(g.totDifal * multiplicador)}</strong></span>}
            {!isVendedor && <span>Margem: <strong className={tomMargem(g.totMargem)}>{fmtR(g.totMargem * multiplicador)}</strong></span>}
          </div>
        )}

        {/* Lotes com todos os itens; composição recolhida por item */}
        <div className="acn-fp-rs-tabela">
          <table className="acn-tabela acn-densa">
            <thead>
              <tr>
                {th('Lote / Item', true)}{th('Qtd.')}{th('Unitário')}{th('Total')}
                {!isVendedor && th('Margem')}{!isVendedor && th('Lucro %')}
              </tr>
            </thead>
            <tbody>
              {estrutura.lotes.map((lc: any) => (
                <React.Fragment key={lc.nome}>
                  <tr className={'acn-fp-rs-lote' + (lc.nome === loteAtivo ? ' ativo' : '')}>
                    <td className="acn-fp-rs-lote-nome"><Icone path={mdiPackageVariantClosed} size={13} /> {lc.nome}</td>
                    <td className="dir acn-fraco">{lc.itens.length} {lc.itens.length === 1 ? 'item' : 'itens'}</td>
                    <td className="dir acn-forte" title={`Total do lote ÷ soma das quantidades dos itens (${lc.qtd})`}>{fmtR(lc.unit.totVendas)}</td>
                    <td className="dir acn-forte acn-txt-info">{fmtR(lc.total.totVendas)}</td>
                    {!isVendedor && <td className={'dir acn-forte ' + tomMargem(lc.total.totMargem)}>{fmtR(lc.total.totMargem)}</td>}
                    {!isVendedor && <td className="dir acn-forte">{fmtPct(lc.total.lucroPct)}</td>}
                  </tr>
                  {lc.itens.map((ic: any) => {
                    const chave = `${lc.nome}::${ic.nome}`;
                    const aberto = !!abertos[chave];
                    const ativo = lc.nome === loteAtivo && ic.nome === grupoAtivo;
                    return (
                      <React.Fragment key={chave}>
                        <tr className={'acn-fp-rs-item' + (ativo ? ' ativo' : '')}>
                          <td className="acn-fp-rs-item-nome">
                            <Botao variante="discreto" pequeno icone={aberto ? mdiChevronDown : mdiChevronRight} onClick={() => alternar(chave)}
                              title={aberto ? 'Esconder composição' : 'Ver composição (custos, impostos, margem)'}
                              aria-label={aberto ? 'Esconder composição' : 'Ver composição (custos, impostos, margem)'} />
                            <span onClick={() => onSelecionar(lc.nome, ic.nome)} className={'acn-fp-rs-nome' + (ativo ? ' ativo' : '')}
                              title="Ir para este item na composição">{ic.nome}</span>
                            {ic.subgrupos.length ? <span className="acn-fp-rs-sub"> · {ic.subgrupos.length} subgrupos</span> : ''}
                          </td>
                          <td className="dir">{ic.qtd}</td>
                          <td className="dir" title={ic.subgrupos.length ? 'Unitário médio (total ÷ quantidade)' : undefined}>{fmtR(ic.unit.totVendas)}</td>
                          <td className="dir acn-forte">{fmtR(ic.total.totVendas)}</td>
                          {!isVendedor && <td className={'dir ' + tomMargem(ic.total.totMargem)}>{fmtR(ic.total.totMargem)}</td>}
                          {!isVendedor && <td className="dir">{fmtPct(ic.total.lucroPct)}</td>}
                        </tr>
                        {aberto && (
                          <tr className="acn-fp-rs-det-linha">
                            <td colSpan={isVendedor ? 4 : 6} className="acn-fp-rs-det">
                              <table className="acn-fp-rs-mini">
                                <thead>
                                  <tr>
                                    <th className="esq" />
                                    <th className="dir">{ic.subgrupos.length ? 'Unitário médio' : 'Unitário (1 un.)'}</th>
                                    <th className="dir">Total (× {ic.qtd})</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {linhasComposicao.map(({ label, k, fmt, semUnitario }: any) => (
                                    <tr key={label}>
                                      <td>{label}</td>
                                      <td className="dir acn-fraco">{semUnitario ? '—' : fmt(ic.unit[k])}</td>
                                      <td className="dir acn-forte">{fmt(ic.total[k])}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {ic.subgrupos.length > 0 && (
                                <table className="acn-fp-rs-mini sub">
                                  <thead>
                                    <tr>
                                      {['Subgrupo', 'Qtd.', 'Unitário', 'Total', ...(isVendedor ? [] : ['Margem'])].map(h => (
                                        <th key={h} className={h === 'Subgrupo' ? 'esq' : 'dir'}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ic.subgrupos.map((sg: any) => (
                                      <tr key={sg.nome}>
                                        <td className="acn-forte">{sg.nome}</td>
                                        <td className="dir">{sg.qtd}</td>
                                        <td className="dir">{fmtR(sg.unit.totVendas)}</td>
                                        <td className="dir acn-forte">{fmtR(sg.total.totVendas)}</td>
                                        {!isVendedor && <td className={'dir ' + tomMargem(sg.total.totMargem)}>{fmtR(sg.total.totMargem)}</td>}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
              <tr className="acn-linha-total">
                <td>Total de todos os itens</td>
                <td />
                <td />
                <td className="dir acn-txt-info">{fmtR(g.totVendas)}</td>
                {!isVendedor && <td className={'dir ' + tomMargem(g.totMargem)}>{fmtR(g.totMargem)}</td>}
                {!isVendedor && <td className="dir">{fmtPct(g.lucroPct)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

// ─── RESUMO DA FORMAÇÃO ───────────────────────────────────────────────────────
// Por lote e item (e subgrupo): quantidade, unitário, total; total e unitário
// do lote; total geral, margem e lucro (vendedor não vê custo/margem).
// Impressão pelo navegador ("Salvar como PDF").
const escHtmlF = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' } as any)[c]);

function ResumoFormacaoModal({ estrutura, isVendedor, titulo, categoria, versao, multiplicador, plataforma, onClose }) {
  const g = estrutura.geral;
  const cols = isVendedor ? ['Lote / Item', 'Qtd.', 'Unitário', 'Total'] : ['Lote / Item', 'Qtd.', 'Unitário', 'Total', 'Custos', 'Margem', 'Lucro %'];
  const linhas: any[] = [];
  estrutura.lotes.forEach(lc => {
    linhas.push({ tipo: 'lote', nome: lc.nome, qtd: `${lc.itens.length} ${lc.itens.length === 1 ? 'item' : 'itens'}`, unit: lc.unit, total: lc.total });
    lc.itens.forEach(ic => {
      linhas.push({ tipo: 'item', nome: ic.nome, qtd: ic.qtd, unit: ic.unit, total: ic.total, medio: ic.subgrupos.length > 0 });
      ic.subgrupos.forEach(sg => linhas.push({ tipo: 'sub', nome: 'Subgrupo ' + sg.nome, qtd: sg.qtd, unit: sg.unit, total: sg.total }));
    });
  });
  const celulas = (l: any) => isVendedor
    ? [l.nome, l.qtd, fmtR(l.unit.totVendas), fmtR(l.total.totVendas)]
    : [l.nome, l.qtd, fmtR(l.unit.totVendas), fmtR(l.total.totVendas), fmtR(l.total.totCustos), fmtR(l.total.totMargem), fmtPct(l.total.lucroPct)];

  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão.'); return; }
    const corpo = linhas.map(l => {
      const estilo = l.tipo === 'lote' ? 'background:#e0f2fe;font-weight:bold' : l.tipo === 'sub' ? 'color:#6b21a8' : '';
      const recuo = l.tipo === 'item' ? 'padding-left:16px' : l.tipo === 'sub' ? 'padding-left:30px' : '';
      return `<tr style="${estilo}">${celulas(l).map((c, i) => `<td style="${i === 0 ? recuo : 'text-align:right'}">${escHtmlF(c)}${i === 2 && l.medio ? ' (médio)' : ''}</td>`).join('')}</tr>`;
    }).join('');
    const extras = [
      `Total geral: <b>${fmtR(g.totVendas)}</b>`, `Impostos: ${fmtR(g.totImposto)}`,
      ...(isVendedor ? [] : [`DIFAL: ${fmtR(g.totDifal)}`, `Custos: ${fmtR(g.totCustos)}`, `Margem: ${fmtR(g.totMargem)}`, `Lucro: ${fmtPct(g.lucroPct)}`]),
      ...(multiplicador > 1 ? [`× Multiplicador geral ${multiplicador}: ${fmtR(g.totVendas * multiplicador)}`] : []),
      ...(plataforma ? [`Plataforma ${escHtmlF(plataforma.nome)}: desconto ${fmtR(plataforma.desconto)} · retenção ${fmtR(plataforma.retencao)} · líquido ${fmtR(plataforma.liquido)}`] : []),
    ];
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumo — ${escHtmlF(titulo)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:18px}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #cbd5e1;padding:4px 6px}th{background:#1e3a5f;color:#fff;font-size:10px;text-align:right}th:first-child{text-align:left}</style></head><body>
      <h2>Resumo da Formação de Preços</h2>
      <div>${escHtmlF(titulo)}${categoria ? ' · ' + escHtmlF(categoria) : ''}${versao ? ' · v' + versao : ''} · ${new Date().toLocaleDateString('pt-BR')}</div>
      <table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>
      <p style="margin-top:10px">${extras.join(' &nbsp;·&nbsp; ')}</p>
      <p style="color:#64748b;font-size:9px">Unitário de item sem subgrupo = total dos produtos ÷ o número do "Dividir por". Unitário do lote = total do lote ÷ soma das quantidades dos itens; unitário de item com subgrupos = médio (total ÷ quantidade).</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-fp-jan acn-fp-rs-jan" role="dialog" aria-label="Resumo da formação">
        <div className="acn-modal-cab">
          <div className="acn-fp-rs-jan-tit">
            <span className="modal-title"><Icone path={mdiReceiptTextOutline} size={18} />Resumo da formação</span>
            <div className="acn-ajuda">{titulo}{categoria ? ` · ${categoria}` : ''}{versao ? ` · v${versao}` : ''}</div>
          </div>
          <div className="acn-fp-rs-jan-acoes">
            <Botao variante="primario" icone={mdiPrinterOutline} onClick={imprimir}>Imprimir / PDF</Botao>
            <Botao onClick={onClose}>Fechar</Botao>
          </div>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-fp-rs-tabela">
            <table className="acn-tabela acn-densa">
              <thead>
                <tr>
                  {cols.map(c => <th key={c} className={c === 'Lote / Item' ? 'esq' : 'dir'}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className={'acn-fp-rs-jan-linha ' + l.tipo}>
                    {celulas(l).map((c, j) => (
                      <td key={j} className={j === 0 ? 'esq' : 'dir'}>
                        {c}{j === 2 && l.medio ? <span className="acn-fp-rs-medio"> (médio)</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acn-fp-rs-cards">
            {[
              { label:'Total geral', v: fmtR(g.totVendas), fam:'info' },
              { label:'Impostos', v: fmtR(g.totImposto), fam:'erro' },
              ...(isVendedor ? [] : [
                { label:'Custos', v: fmtR(g.totCustos), fam:'ok' },
                { label:'Margem', v: fmtR(g.totMargem), fam: g.totMargem >= 0 ? 'ok' : 'erro' },
                { label:'Lucro %', v: fmtPct(g.lucroPct), fam:'neutro' },
              ]),
              ...(multiplicador > 1 ? [{ label:`× Multiplicador ${multiplicador}`, v: fmtR(g.totVendas * multiplicador), fam:'info' }] : []),
              ...(plataforma ? [{ label:`Líquido c/ ${plataforma.nome}`, v: fmtR(plataforma.liquido), fam:'marca' }] : []),
            ].map(x => (
              <div key={x.label} className="acn-fp-rs-card" data-acn-familia={x.fam}>
                <div className="acn-fp-rs-card-rot">{x.label}</div>
                <div className="acn-fp-rs-card-v">{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// `vinculo` — { tipo:'crm'|'licitacao', id, label? } — quando informado, o
// componente roda "embutido" dentro do processo (CrmTab.tsx/LicitacoesTab.tsx):
// mostra só a aba de edição (sem o navegador de abas/Preços Formados), lista
// as formações já vinculadas àquele processo pra carregar, e ao salvar grava
// o vínculo automaticamente (crm_oportunidade_id/licitacao_id), sem precisar
// procurar manualmente na tela cheia.
export default function FormacaoPrecosTab({ currentUser, vinculo, embutido, rotulo }: any = {}) {
  // Etapa 7.59 (07/10/2026): um clique duplo em salvar/registrar/excluir/vincular gravava duas vezes (duas formações iguais, duas
  // versões) — uma ação por tipo. E leitura que falha (modelos, formações do processo, plataformas) não pode parecer "vazio".
  const emAcao = useRef(new Set());
  const umaVez = (chave: string, fn: (...a: any[]) => Promise<any>) => async (...args: any[]) => {
    if (emAcao.current.has(chave)) return;
    emAcao.current.add(chave);
    try { return await fn(...args); } finally { emAcao.current.delete(chave); }
  };
  const [erroModelos, setErroModelos]       = useState('');
  const [erroVinculo, setErroVinculo]       = useState('');
  const [erroPlataformas, setErroPlataformas] = useState('');
  const plataformaCarregadaRef = useRef<string | null>(null);   // a plataforma da formação aberta, para não apagá-la ao salvar se a lista não carregou
  const [params, setParams]           = useState({ ...PARAMS_PADRAO });
  const [itens, setItens]             = useState([novoItem()]);
  const [grupoAtivo, setGrupoAtivo]   = useState('Item 1'); // aba ativa — "Item do edital"
  const [loteAtivo, setLoteAtivo]     = useState('Lote 1'); // lote ativo — nível acima dos itens
  const [subgrupoAtivo, setSubgrupoAtivo] = useState<string | null>(null); // subgrupo ativo do item (se houver)
  const [usarGlobais, setUsarGlobais]             = useState(true);
  const [usarMarkupGlobal, setUsarMarkupGlobal]   = useState(false);
  const [modelos, setModelos]         = useState([]);
  const [modalSalvar, setModalSalvar]     = useState(false);
  const [modalCarregar, setModalCarregar] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);
  const [vinculoLabels, setVinculoLabels] = useState<Record<string, string>>({});
  const [salvando, setSalvando]       = useState(false);
  const [carregando, setCarregando]   = useState(false);
  const [nomeCotacao, setNomeCotacao] = useState('');
  const [tipoCotacao, setTipoCotacao] = useState('');   // categoria da formação carregada
  const [modalResumo, setModalResumo] = useState(false);
  const [empresa, setEmpresa]         = useState('ACN');
  const [plataformas, setPlataformas]                 = useState([]);
  const [plataformaSelecionada, setPlataformaSelecionada] = useState(null);

  // Novos estados
  const [abaAtiva, setAbaAtiva]             = useState('formacao');
  const [oplVinculada, setOplVinculada]     = useState(null);
  const [descontoMaximoPct, setDescontoMax] = useState(0);
  const [finalizando, setFinalizando]       = useState(false);
  const [editandoId, setEditandoId]         = useState(null); // id da cotação em edição

  // ── Versionamento / log de alterações pós-finalização ──────────────────────
  // statusCotacao/versaoAtual/etc refletem a linha carregada em editandoId.
  // Enquanto 'rascunho', edição é livre (sem log). A partir de 'finalizada',
  // remoção de item / alteração de custo / markup gera entrada em
  // cotacoes_precos_log automaticamente.
  const [statusCotacao, setStatusCotacao]       = useState('rascunho');
  const [versaoAtual, setVersaoAtual]           = useState(1);
  const [versaoRaizId, setVersaoRaizId]         = useState(null); // id da 1ª versão do grupo (null = esta linha É a raiz)
  const [finalizadaPorNome, setFinalizadaPorNome] = useState(null);
  const [finalizadaEm, setFinalizadaEm]         = useState(null);
  const [vencedoraAtual, setVencedoraAtual]     = useState(false);
  const [modalSenha, setModalSenha]             = useState(false); // confirmação de senha pra "Registrar Versão Final"
  const [senhaConfirm, setSenhaConfirm]         = useState('');
  const [erroSenha, setErroSenha]               = useState('');
  const [registrandoVersao, setRegistrandoVersao] = useState(false);
  const [modalHistorico, setModalHistorico]     = useState(false);
  const [historicoLogs, setHistoricoLogs]       = useState<any[]>([]);
  const [historicoVersoes, setHistoricoVersoes] = useState<any[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  // ── Trava otimista contra edição simultânea ────────────────────────────────
  // `travaAtualizadoEm` guarda o `atualizado_em` da linha no momento em que ela
  // foi carregada na tela. Todo UPDATE vai com `.eq('atualizado_em', trava)`:
  // se outra pessoa salvou nesse meio tempo o banco recusa (0 linhas afetadas)
  // em vez de sobrescrever calado — que era como o trabalho de um apagava o do
  // outro quando duas pessoas mexiam na mesma formação (incidente de 08/09).
  const [travaAtualizadoEm, setTravaAtualizadoEm] = useState<string | null>(null);
  const [conflito, setConflito] = useState<any | null>(null); // { payload, dono, quando }
  const [resolvendoConflito, setResolvendoConflito] = useState(false);
  const [ultimaAlteracao, setUltimaAlteracao] = useState<any | null>(null); // { em, por }

  // ── Rascunho automático (rede de segurança) ────────────────────────────────
  // Tudo o que está na tela só existia na memória do navegador até alguém
  // clicar em salvar: fechar a aba, cair a energia ou o navegador travar
  // perdia o trabalho inteiro. Agora o estado editável é gravado no próprio
  // navegador a cada alteração (com atraso, pra não gravar a cada tecla) e
  // oferecido de volta ao reabrir a formação.
  const chaveRascunho = (id: any) =>
    `acn:formacao-rascunho:${vinculo?.tipo || 'avulso'}:${vinculo?.id || '-'}:${id || 'nova'}`;
  const [rascunhoPendente, setRascunhoPendente] = useState<any | null>(null);
  const [temNaoSalvo, setTemNaoSalvo] = useState(false);
  // "geração" muda a cada carregar/salvar; a primeira passada do efeito depois
  // disso é o próprio carregamento (não é edição do usuário) e serve só pra
  // fotografar o estado-base de comparação.
  const geracaoRef      = useRef(0);
  const geracaoVistaRef = useRef(-1);
  const baseSerializadaRef = useRef('');
  // último conteúdo não salvo, para gravar como rascunho se a formação sair da tela
  const rascunhoAoSairRef = useRef<{ chave: string; atual: string } | null>(null);

  // O que vai para o banco. As marcações "Usar globais (DIFAL/Imp/CF)" e
  // "Markup Global" existiam só na tela: não eram gravadas e, ao reabrir, a
  // formação voltava aos valores de cada produto. Além disso Cotações, proposta,
  // termômetro de markup e Contrato/Entregas calculam pelo valor de CADA
  // produto — então, com a marcação ligada, o valor global é gravado em cada
  // produto (o mesmo que a tela já mostrava e calculava) e a marcação vai junto
  // em parametros_globais para reabrir do mesmo jeito.
  // 07/10/2026 (pedido do usuário): com "Usar globais" ligado o DIFAL/Imposto do item ficavam travados sem explicação ("não deixa digitar").
  // Regra já decidida: DIFAL é livre por proposta, global ou item a item. Clicar no campo travado agora pergunta e libera a edição item a item,
  // copiando antes os globais para cada linha (os valores que o item mostrava continuam os mesmos, só passam a ser editáveis).
  const copiarGlobaisParaLinhas = () => {
    setItens(p => p.map(x => ({ ...x, difal_pct: params.difal_pct, imposto_pct: params.imposto_pct, custo_fixo_pct: params.custo_fixo_pct })));
    setUsarGlobais(false);
  };
  const liberarGlobais = async () => {
    if (!await confirmar('O DIFAL e o Imposto estão valendo pelos parâmetros globais, para todos os itens.\n\nLiberar a edição item a item? Cada item fica com o valor atual e você pode mudar só o que precisar.')) return;
    copiarGlobaisParaLinhas();
  };
  // 07/10/2026 (pedido do usuário): mesmo caso do DIFAL — definir o markup pelo global e depois ajustar item a item. Clicar no markup travado pergunta,
  // copia o markup global para cada linha e desliga o "Markup Global"; os preços não mudam, só passam a ser editáveis.
  const liberarMarkup = async () => {
    if (!await confirmar('O Markup Global está valendo para todos os itens.\n\nLiberar a edição do markup item a item? Cada item fica com o markup atual e você muda só o que precisar.')) return;
    setItens(p => p.map(x => ({ ...x, markup_pct: params.markup_pct })));
    setUsarMarkupGlobal(false);
  };
  const paramsParaGravar = () => ({ ...params, usar_globais: usarGlobais, usar_markup_global: usarMarkupGlobal });
  const itensParaGravar = () => itens.map(({ _id, ...rest }) => paramEfetivo(rest));

  const edicaoAtual = () => ({
    nome: nomeCotacao || '',
    empresa,
    plataforma_id: plataformaSelecionada?.id || null,
    params: paramsParaGravar(),
    itens: itens.map(({ _id, ...rest }) => rest),
    desconto_maximo_pct: descontoMaximoPct || 0,
  });

  // Marca "não salvo" e grava o rascunho, com 1,2s de espera depois da última
  // tecla. Só grava quando o conteúdo realmente difere do que foi carregado —
  // assim todo rascunho que existe no navegador representa trabalho de fato
  // não salvo, e o aviso de restaurar nunca aparece à toa.
  useEffect(() => {
    const atual = JSON.stringify(edicaoAtual());
    if (geracaoVistaRef.current !== geracaoRef.current) {
      geracaoVistaRef.current = geracaoRef.current;
      baseSerializadaRef.current = atual;
      rascunhoAoSairRef.current = null;
      setTemNaoSalvo(false);
      return;
    }
    const mudou = atual !== baseSerializadaRef.current;
    setTemNaoSalvo(mudou);
    rascunhoAoSairRef.current = mudou ? { chave: chaveRascunho(editandoId), atual } : null;
    if (!mudou) {
      // Voltou a ser igual ao que está salvo (o usuário desfez na mão): o
      // rascunho não representa mais nada e some, senão reapareceria depois
      // oferecendo "restaurar" um conteúdo idêntico ao já salvo.
      try { localStorage.removeItem(chaveRascunho(editandoId)); } catch { /* ignore */ }
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(chaveRascunho(editandoId), JSON.stringify({
          conteudo: JSON.parse(atual),
          salvoEm: new Date().toISOString(),
          usuario: currentUser?.nome || currentUser?.email || null,
        }));
      } catch { /* cota cheia / modo privado — rascunho é best-effort */ }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, params, nomeCotacao, empresa, plataformaSelecionada, descontoMaximoPct, editandoId, usarGlobais, usarMarkupGlobal]);

  // Ao sair da formação (trocar de aba no card, minimizar, fechar) o atraso de
  // 1,2s acima era cancelado e a edição sumia sem rascunho nenhum. Grava na hora.
  useEffect(() => () => {
    const r = rascunhoAoSairRef.current;
    if (!r) return;
    try {
      localStorage.setItem(r.chave, JSON.stringify({
        conteudo: JSON.parse(r.atual), salvoEm: new Date().toISOString(),
        usuario: currentUser?.nome || currentUser?.email || null,
      }));
    } catch { /* best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avisa antes de fechar/recarregar a aba com alterações não salvas.
  // (Sair da tela por dentro do sistema não passa por aqui — nesse caso quem
  // protege é o rascunho acima, que é oferecido de volta ao reabrir.)
  useEffect(() => {
    if (!temNaoSalvo) return;
    const aviso = (e: any) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [temNaoSalvo]);

  // Chamado depois de gravar de verdade: refotografa o estado-base e apaga o
  // aviso de "não salvo". Não dá pra deixar isso a cargo do efeito — ele só
  // roda quando algum campo muda, e depois de salvar nada mudou na tela, então
  // o aviso ficaria aceso para sempre. `nomeSalvo` vem por fora porque o
  // setNomeCotacao() da mesma função ainda não refletiu no closure.
  const marcarComoSalvo = (nomeSalvo?: string) => {
    baseSerializadaRef.current = JSON.stringify({
      ...edicaoAtual(),
      nome: nomeSalvo ?? (nomeCotacao || ''),
    });
    geracaoRef.current += 1;
    geracaoVistaRef.current = geracaoRef.current; // já fotografado aqui
    rascunhoAoSairRef.current = null;
    setTemNaoSalvo(false);
  };

  const descartarRascunho = (id: any) => {
    try { localStorage.removeItem(chaveRascunho(id)); } catch { /* ignore */ }
    if (rascunhoAoSairRef.current?.chave === chaveRascunho(id)) rascunhoAoSairRef.current = null;
    setRascunhoPendente(null);
  };

  // Procura rascunho não salvo desta formação (chamado ao carregá-la).
  const verificarRascunho = (id: any) => {
    try {
      const bruto = localStorage.getItem(chaveRascunho(id));
      setRascunhoPendente(bruto ? { ...JSON.parse(bruto), id } : null);
    } catch { setRascunhoPendente(null); }
  };

  // Traz o rascunho de volta pra tela.
  const restaurarRascunho = () => {
    const c = rascunhoPendente?.conteudo;
    if (!c) return;
    setParams({ ...PARAMS_PADRAO, ...(c.params || {}) });
    setUsarGlobais(c.params?.usar_globais ?? true);
    setUsarMarkupGlobal(c.params?.usar_markup_global ?? false);
    const itensRestaurados = (c.itens || []).map((x: any) => ({ ...novoItem(), ...x, _id: Math.random().toString(36).slice(2) }));
    setItens(itensRestaurados.length ? itensRestaurados : [novoItem()]);
    setLoteAtivo(loteDe(itensRestaurados[0]));
    setGrupoAtivo(grupoDe(itensRestaurados[0]) || 'Item 1');
    setNomeCotacao(c.nome || '');
    if (c.empresa) setEmpresa(c.empresa);
    setPlataformaSelecionada(plataformas.find((x: any) => x.id === c.plataforma_id) || null);
    setDescontoMax(Number(c.desconto_maximo_pct) || 0);
    setRascunhoPendente(null);
    // não mexe na geração: isto É uma alteração não salva, deve continuar marcada
  };

  // ── Formações já vinculadas a este processo (modo embutido) ──
  const [formacoesVinculo, setFormacoesVinculo]     = useState<any[]>([]);
  const [carregandoVinculo, setCarregandoVinculo]   = useState(!!vinculo);

  // Rótulo do botão de cada formação no seletor. Antes mostrava só `m.nome` —
  // e como nada obrigava a preencher nome, formações salvas sem nome viravam
  // pílulas VAZIAS de ~24x10px (invisíveis na prática). Agora sempre há texto:
  // versão, data, autor e os selos de finalizada/vencedora.
  const rotuloFormacao = (m: any) => {
    const dt = m.criado_em
      ? new Date(m.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '';
    const partes = [
      `v${m.versao || 1}`,
      (m.nome || '').trim() || null,
      dt || null,
      m.criado_por || null,
    ].filter(Boolean);
    return `${partes.join(' · ')}${m.status === 'finalizada' ? ' 🔒' : ''}${m.vencedora ? ' 🏆' : ''}`;
  };

  // Pedido do usuário em 07/10/2026: com a formação aberta só a VERSÃO FINAL fica à vista; as demais versões ficam num botão "Versões" (lista, resumo e troca da final). "Versão final" = a
  // marcada como vencedora; sem vencedora, a de maior número (a mais recente, em caso de empate) — a mesma regra do termômetro de markup (cotacaoAlvo, MarkupTermometro.tsx).
  // Uma formação = um grupo de versões ligado pela raiz (versao_raiz_id; a v1 é a própria raiz).
  const raizDe = (m: any) => m?.versao_raiz_id || m?.id;
  const versaoFinalDe = (lista: any[]) => (lista || []).find((m: any) => m.vencedora)
    || [...(lista || [])].sort((a: any, b: any) => (b.versao || 1) - (a.versao || 1) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
  const [modalVersoes, setModalVersoes] = useState(false);
  const [resumoVersao, setResumoVersao]   = useState<any>(null);

  const carregarFormacoesVinculo = useCallback(async () => {
    if (!vinculo?.id) return;
    setCarregandoVinculo(true);
    // N:N via tabela de junção — uma formação pode atender vários processos.
    const { data: vinc, error: erroVinc } = await supabase.from('cotacoes_precos_vinculos')
      .select('cotacao_id').eq('tipo', vinculo.tipo).eq('processo_id', vinculo.id);
    if (erroVinc) { setErroVinculo(erroVinc.message); setCarregandoVinculo(false); return; }   // 7.59: lia como "nenhuma formação neste processo" (a tela abria vazia e dava para criar uma duplicada)
    const ids = [...new Set((vinc || []).map((v: any) => v.cotacao_id))];
    if (!ids.length) { setErroVinculo(''); setFormacoesVinculo([]); setCarregandoVinculo(false); return; }
    const { data, error: erroForm } = await supabase.from('cotacoes_precos').select('*').in('id', ids).order('criado_em', { ascending: false });
    if (erroForm) { setErroVinculo(erroForm.message); setCarregandoVinculo(false); return; }
    setErroVinculo('');
    setFormacoesVinculo(data || []);
    setCarregandoVinculo(false);
  }, [vinculo?.tipo, vinculo?.id]);

  useEffect(() => { carregarFormacoesVinculo(); }, [carregarFormacoesVinculo]);

  // ── Vínculos N:N de todas as formações (badges no modal Importar) ──
  // vinculosPorCotacao: cotacao_id -> [{tipo, processo_id}] (todos os
  // processos que aquela formação atende); vinculoLabels: "crm:id"/"lic:id"
  // -> nome legível do processo.
  const [vinculosPorCotacao, setVinculosPorCotacao] = useState<Record<string, { tipo:string; processo_id:string }[]>>({});
  const carregarVinculoLabels = useCallback(async (lista: any[]) => {
    const ids = lista.map(m => m.id);
    if (!ids.length) { setVinculosPorCotacao({}); setVinculoLabels({}); return; }
    const { data: vinc } = await supabase.from('cotacoes_precos_vinculos')
      .select('cotacao_id, tipo, processo_id').in('cotacao_id', ids);
    const porCotacao: Record<string, { tipo:string; processo_id:string }[]> = {};
    (vinc || []).forEach((v: any) => { (porCotacao[v.cotacao_id] ||= []).push({ tipo: v.tipo, processo_id: v.processo_id }); });
    setVinculosPorCotacao(porCotacao);

    const crmIds = [...new Set((vinc || []).filter((v:any) => v.tipo === 'crm').map((v:any) => v.processo_id))];
    const licIds = [...new Set((vinc || []).filter((v:any) => v.tipo === 'licitacao').map((v:any) => v.processo_id))];
    const map: Record<string, string> = {};
    if (crmIds.length) {
      const { data } = await supabase.from('crm_oportunidades').select('id,titulo').in('id', crmIds);
      (data || []).forEach((o: any) => { map['crm:' + o.id] = o.titulo || 'Oportunidade CRM'; });
    }
    if (licIds.length) {
      const { data } = await supabase.from('licitacoes').select('id,numero,nome_projeto').in('id', licIds);
      (data || []).forEach((l: any) => { map['lic:' + l.id] = `${l.numero || ''} ${l.nome_projeto || ''}`.trim(); });
    }
    setVinculoLabels(map);
  }, []);

  useEffect(() => { if (modalImportar) carregarVinculoLabels(modelos); }, [modalImportar, modelos, carregarVinculoLabels]);

  // Vincula de verdade o registro escolhido a este processo (não copia) —
  // INSERT na tabela de junção, sem apagar nenhum vínculo existente: uma
  // formação pode atender vários processos (CRM e/ou Licitação) ao mesmo
  // tempo. Clicar "Importar" de novo no mesmo processo é inofensivo
  // (unique constraint com onConflict:'do nothing').
  const importarEVincular = umaVez('importar', async (selecionadas: any[]) => {
    if (!vinculo?.id) return;
    const lista = Array.isArray(selecionadas) ? selecionadas : [selecionadas];
    if (!lista.length) return;
    const { error } = await supabase.from('cotacoes_precos_vinculos')
      .upsert(lista.map(m => ({ cotacao_id: m.id, tipo: vinculo.tipo, processo_id: vinculo.id })),
              { onConflict: 'cotacao_id,tipo,processo_id', ignoreDuplicates: true });
    if (error) { alert('Erro ao vincular: ' + error.message); return; }
    const { error: erroLogImp } = await supabase.from('cotacoes_precos_log').insert(lista.map(m => ({
      cotacao_id: m.id, tipo: 'importada',
      descricao: `Importada/vinculada a ${vinculo.tipo === 'crm' ? 'oportunidade do CRM' : 'licitação'}${rotulo ? ' "' + rotulo + '"' : ''}.`,
      usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
    })));
    if (erroLogImp) alert('Vinculada, mas o registro no histórico da formação não foi gravado: ' + erroLogImp.message);   // 7.59
    await carregarFormacoesVinculo();
    // abre a mais recente das importadas
    const abrir = [...lista].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0];
    carregarModelo(abrir);
    setEditandoId(abrir.id);
    setModalImportar(false);
    carregarModelos();
    if (lista.length > 1) alert(`${lista.length} formações vinculadas a este processo. Troque entre elas pelo seletor de versões.`);
  });

  // Desfaz o vínculo da formação aberta com ESTE processo (Gerentes e Admins).
  // A formação continua salva e ligada a outros processos, se houver.
  const desvincularFormacao = umaVez('desvincular', async () => {
    if (!vinculo?.id || !editandoId) return;
    const atual = formacoesVinculo.find((x: any) => x.id === editandoId);
    if (!atual) return;
    if (temNaoSalvo && !await confirmar('Há alterações não salvas nesta formação. Desvincular mesmo assim? (as alterações ficam só no rascunho)')) return;
    if (!await confirmar(`Desvincular "${atual.nome || 'formação sem nome'}" (v${atual.versao || 1}) deste processo?\n\n` +
      'A formação NÃO é apagada: continua em Formação de Preços e nos outros processos a que estiver ligada.')) return;
    const { error } = await supabase.from('cotacoes_precos_vinculos').delete()
      .eq('cotacao_id', editandoId).eq('tipo', vinculo.tipo).eq('processo_id', vinculo.id);
    if (error) { alert('Erro ao desvincular: ' + error.message); return; }
    // a coluna antiga (crm_oportunidade_id / licitacao_id) também apontava para cá
    const coluna = vinculo.tipo === 'crm' ? 'crm_oportunidade_id' : 'licitacao_id';
    // 7.59: estes dois passos ignoravam o erro; a coluna antiga que sobrava fazia a formação continuar aparecendo neste processo
    const { error: erroColuna } = await supabase.from('cotacoes_precos').update({ [coluna]: null }).eq('id', editandoId).eq(coluna, vinculo.id);
    if (erroColuna) alert('Desvinculada, mas a ligação antiga da formação com este processo NÃO foi limpa (' + erroColuna.message + '): ela pode continuar aparecendo aqui.');
    const { error: erroLogDes } = await supabase.from('cotacoes_precos_log').insert([{
      cotacao_id: editandoId, tipo: 'desvinculada',
      descricao: `Desvinculada de ${vinculo.tipo === 'crm' ? 'oportunidade do CRM' : 'licitação'}${rotulo ? ' "' + rotulo + '"' : ''}.`,
      usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
    }]);
    if (erroLogDes) console.warn('Falha ao registrar a desvinculação no histórico:', erroLogDes.message);
    const restantes = formacoesVinculo.filter((x: any) => x.id !== editandoId);
    await carregarFormacoesVinculo();
    if (restantes.length) { carregarModelo(restantes[0]); setEditandoId(restantes[0].id); }
    else {
      setParams({ ...PARAMS_PADRAO }); setItens([novoItem()]); setGrupoAtivo('Item 1'); setLoteAtivo('Lote 1');
      setNomeCotacao(''); setTipoCotacao(''); setEditandoId(null); setStatusCotacao('rascunho'); setVersaoAtual(1);
      setVersaoRaizId(null); setVencedoraAtual(false); setTravaAtualizadoEm(null); setUltimaAlteracao(null);
      geracaoRef.current += 1;
    }
    alert('Formação desvinculada deste processo.');
  });

  // Ao abrir o processo, carrega automaticamente a formação mais recente
  // (a lista vem ordenada por criado_em desc, então [0] é a última versão).
  //
  // ⚠️ Antes daqui só carregava quando havia EXATAMENTE 1 formação vinculada.
  // Como cada "Registrar Versão Final" cria uma linha nova, bastava existir a
  // v2 pra essa condição falhar e a tela abrir VAZIA — o trabalho continuava
  // salvo no banco, mas sumia da tela (incidente relatado em 08/09/2026, em que
  // v1/v2/v3 de uma licitação pareceram perdidas). O auto-carregamento agora
  // vale pra qualquer quantidade de versões.
  //
  // O ref garante que isso rode UMA vez por processo: sem ele, o reload da
  // lista disparado por "Salvar" reabriria a versão mais recente por cima do
  // que o usuário estivesse editando (inclusive de uma "+ Nova formação"
  // ainda não salva).
  const autoCarregouRef = useRef<string | null>(null);
  useEffect(() => {
    const chave = vinculo?.id || null;
    if (!chave || autoCarregouRef.current === chave) return;
    if (editandoId) { autoCarregouRef.current = chave; return; }
    if (!formacoesVinculo.length) return; // ainda carregando, ou nenhuma ainda
    autoCarregouRef.current = chave;
    // a formação mais recente (formacoesVinculo vem por criado_em desc) e, dentro dela, a versão final
    const inicial = versaoFinalDe(formacoesVinculo.filter((x: any) => raizDe(x) === raizDe(formacoesVinculo[0]))) || formacoesVinculo[0];
    carregarModelo(inicial);
    setEditandoId(inicial.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formacoesVinculo, vinculo?.id]);

  const isVendedor = ['Comercial', 'Licitações', 'CRM'].includes(perfilComPoderes(currentUser));
  const setP = (k, v) => setParams(p => ({ ...p, [k]: v }));

  // ── Resize da tabela de itens ─────────────────────────────────────────────
  const [tableHeight, setTableHeight] = useState(320);
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = tableHeight;
    const onMove = (me) => setTableHeight(Math.max(160, startH + me.clientY - startY));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    supabase.from('plataformas_licitacao').select('*').eq('ativo', true).order('nome')
      .then(({ data, error }) => {
        // 7.59: lista que não carrega fazia a formação abrir SEM a plataforma e o próximo "Salvar" apagava a plataforma gravada
        if (error) { setErroPlataformas(error.message); return; }
        setErroPlataformas('');
        setPlataformas(data || []);
      });
  }, []);

  const paramEfetivo = (item) => {
    let it = { ...item };
    if (usarGlobais)       { it.difal_pct = params.difal_pct; it.imposto_pct = params.imposto_pct; it.custo_fixo_pct = params.custo_fixo_pct; }
    if (usarMarkupGlobal)  { it.markup_pct = params.markup_pct; }
    return it;
  };

  // Estrutura Lote › Item › (Subgrupo) com os totais JÁ multiplicados pelas
  // quantidades (produto = 1 unidade do item) — ver FormacaoCalculo.ts.
  const estrutura  = estruturaFormacao(itens.map(paramEfetivo), params, calcItem);
  const results    = estrutura.results;
  const lote       = Number(params.lote_qtd) || 1;
  const { totVendas, totCustos, totDifal, totImposto, totMargem, lucroPct: lucroGeral } = estrutura.geral;

  // ── Itens do edital (abas) — derivado direto de itens[].grupo_nome, sem
  // registro separado pra não correr risco de ficar dessincronizado. ──
  // Lote → Item → Produtos. Tudo derivado de lote_nome/grupo_nome dos próprios
  // componentes (sem registro separado, para não dessincronizar).
  const lotesNomes = [...new Set(itens.map(loteDe))];
  if (lotesNomes.length === 0) lotesNomes.push('Lote 1');
  const loteAtivoValido = lotesNomes.includes(loteAtivo) ? loteAtivo : lotesNomes[0];
  const gruposNomes = [...new Set(itens.filter(it => loteDe(it) === loteAtivoValido).map(grupoDe))];  // itens DO LOTE ativo
  if (gruposNomes.length === 0) gruposNomes.push('Item 1');
  const grupoAtivoValido = gruposNomes.includes(grupoAtivo) ? grupoAtivo : gruposNomes[0];
  const doItemAtivo = (it) => loteDe(it) === loteAtivoValido && grupoDe(it) === grupoAtivoValido;
  const itemCalcAtivo = estrutura.itens.find(x => x.lote === loteAtivoValido && x.nome === grupoAtivoValido) || null;
  const subsDoItem    = [...new Set(itens.filter(doItemAtivo).map(subgrupoDe).filter(Boolean))] as string[];
  const temSubgrupos  = subsDoItem.length > 0;
  const subAtivoValido = temSubgrupos ? (subsDoItem.includes(subgrupoAtivo) ? subgrupoAtivo : subsDoItem[0]) : null;
  // a lista de produtos mostra o subgrupo ativo (item com subgrupos) ou o item inteiro
  const idxDoGrupo    = itens.map((it, i) => ({ it, i }))
    .filter(({ it }) => doItemAtivo(it) && (!temSubgrupos || subgrupoDe(it) === subAtivoValido)).map(({ i }) => i);
  const itensDoGrupo  = idxDoGrupo.map(i => itens[i]);
  const resultsDoGrupo = idxDoGrupo.map(i => results[i]);
  const subtotalGrupo  = somarResultados(resultsDoGrupo);
  const loteGrupo       = qtdDoItem(params, loteAtivoValido, grupoAtivoValido);   // DIVISOR do item (ver FormacaoCalculo.ts)
  // todos os pares lote/item, na ordem em que aparecem (PDF, contagens)
  const paresLoteItem: { lote: string; grupo: string }[] = [];
  for (const it of itens) {
    if (!paresLoteItem.some(x => x.lote === loteDe(it) && x.grupo === grupoDe(it))) paresLoteItem.push({ lote: loteDe(it), grupo: grupoDe(it) });
  }

  const descontoPlatPct  = Number(plataformaSelecionada?.desconto_pct) || 0;
  const retencaoPlatPct  = Number(plataformaSelecionada?.retencao_pct) || 0;
  const descontoPlat     = totVendas * descontoPlatPct / 100;
  const retencaoPlat     = totVendas * retencaoPlatPct / 100;
  const totalLiquidoPlat = totVendas - descontoPlat - retencaoPlat;

  const addItem  = () => setItens(p => [...p, {
    ...novoItem(),
    lote_nome:      loteAtivoValido,
    grupo_nome:     grupoAtivoValido,
    subgrupo_nome:  subAtivoValido,
    difal_pct:      params.difal_pct,
    imposto_pct:    params.imposto_pct,
    custo_fixo_pct: params.custo_fixo_pct,
  }]);
  // Grava uma entrada no log de alterações (só chamado quando a cotação já
  // está 'finalizada' -- rascunho edita livre, sem log).
  const registrarLog = (tipo: string, descricao: string) => {
    if (!editandoId) return;
    supabase.from('cotacoes_precos_log').insert([{
      cotacao_id: editandoId, tipo, descricao,
      usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
    }]).then(({ error }) => {
      if (error) { console.error('Erro ao registrar log:', error); alert('A alteração foi feita, mas NÃO foi registrada no histórico da formação finalizada: ' + error.message); }   // 7.59: ficava só no console
    });
  };

  const remItem  = async (id) => {
    // 07/10/2026 (pedido do usuário): tirar um item da formação também pergunta — mesmo com ela ainda em montagem.
    // 08/10/2026: a linha em branco (sem produto e sem custo) também pergunta; antes saía direto e o usuário, que testou justamente numa linha recém-criada, achou que não perguntava.
    const aRemover = itens.find(x => x._id === id);
    if (!await confirmarRemocao('o item "' + (aRemover?.produto || 'sem nome') + '" desta formação')) return;
    if (statusCotacao === 'finalizada') {
      const item = itens.find(x => x._id === id);
      if (item) registrarLog('item_removido', `[${loteDe(item)} › ${grupoDe(item)}] Item removido: "${item.produto || 'sem nome'}"${item.marca ? ` (${item.marca})` : ''}`);
    }
    setItens(p => p.filter(x => x._id !== id));
  };
  // Campos que geram log quando alterados pós-finalização, com um rótulo
  // legível pra descrição do log.
  const CAMPOS_LOGADOS: Record<string,string> = { custo_unit: 'Custo unitário', markup_pct: 'Markup %' };
  const setItem  = (id, k, v) => {
    if (statusCotacao === 'finalizada' && CAMPOS_LOGADOS[k]) {
      const item = itens.find(x => x._id === id);
      const antes = item ? item[k] : undefined;
      if (antes !== undefined && String(antes) !== String(v)) {
        registrarLog(
          k === 'custo_unit' ? 'custo_alterado' : 'markup_alterado',
          `[${loteDe(item)} › ${grupoDe(item)}] ${CAMPOS_LOGADOS[k]} de "${item?.produto || 'item'}": ${antes} → ${v}`,
        );
      }
    }
    setItens(p => p.map(x => x._id === id ? { ...x, [k]: v } : x));
  };

  // ── Gerenciamento das abas "Item do edital" (dentro do lote ativo) ─────────
  // Renomear/remover mexe só no lote ativo: "Item 1" pode existir em mais de um
  // lote. A quantidade do item (lote_por_grupo) acompanha a renomeação — antes
  // ela ficava para trás, presa ao nome velho.
  const moverQtd = (deLote, deGrupo, paraLote, paraGrupo) => setParams(p => {
    const m = { ...(p.lote_por_grupo || {}) };
    const antiga = m[chaveItem(deLote, deGrupo)] ?? (deLote === 'Lote 1' ? m[deGrupo] : undefined);
    delete m[chaveItem(deLote, deGrupo)];
    if (deLote === 'Lote 1') delete m[deGrupo];
    if (antiga != null && paraLote != null) m[chaveItem(paraLote, paraGrupo)] = antiga;
    // quantidades dos subgrupos ("lote::item::sub") acompanham o item
    const qs = { ...(p.qtd_subgrupo || {}) };
    const prefixo = chaveItem(deLote, deGrupo) + '::';
    Object.keys(qs).filter(k => k.startsWith(prefixo)).forEach(k => {
      const v = qs[k]; delete qs[k];
      if (paraLote != null) qs[chaveItem(paraLote, paraGrupo) + '::' + k.slice(prefixo.length)] = v;
    });
    return { ...p, lote_por_grupo: m, qtd_subgrupo: qs };
  });

  // ── Subgrupos do item (ex.: Nivus 6 un.: 3 com conjunto A, 2 com A + cela) ──
  const setQtdSub = (sub, qtd) => setParams(p => ({ ...p,
    qtd_subgrupo: { ...(p.qtd_subgrupo || {}), [chaveSub(loteAtivoValido, grupoAtivoValido, sub)]: Math.max(1, parseInt(qtd) || 1) } }));
  const dividirEmSubgrupos = async () => {
    const nome = await pedirTexto(`Nome do 1º subgrupo de "${grupoAtivoValido}".\nOs produtos que já estão no item vão para ele.`, 'A');
    if (!nome || !nome.trim()) return;
    const n = nome.trim();
    // o número do item agora divide e o do subgrupo multiplica (28/09/2026):
    // copiar um para o outro inverteria a conta, então o subgrupo começa em 1
    setItens(p => p.map(x => doItemAtivo(x) ? { ...x, subgrupo_nome: n } : x));
    setQtdSub(n, 1);
    setSubgrupoAtivo(n);
  };
  const novoSubgrupo = async (copiarDe: string | null) => {
    const sugestao = String.fromCharCode(65 + (subsDoItem.length % 26));
    const nome = await pedirTexto(copiarDe
      ? `Nome do novo subgrupo — começa com uma CÓPIA dos produtos de "${copiarDe}" (depois é só ajustar):`
      : 'Nome do novo subgrupo:', sugestao);
    if (!nome || !nome.trim()) return;
    const n = nome.trim();
    if (subsDoItem.includes(n)) { alert(`Já existe o subgrupo "${n}" em ${grupoAtivoValido}.`); return; }
    const qtd = parseInt(await pedirTexto(`Quantas unidades no subgrupo "${n}"?`, '1') || '', 10);
    if (!(qtd > 0)) { alert('Informe uma quantidade maior que zero.'); return; }
    setItens(p => {
      const novos = copiarDe
        ? p.filter(x => doItemAtivo(x) && subgrupoDe(x) === copiarDe).map(x => ({ ...x, _id: Math.random().toString(36).slice(2), subgrupo_nome: n }))
        : [{ ...linhaNova(loteAtivoValido, grupoAtivoValido), subgrupo_nome: n }];
      return [...p, ...novos];
    });
    setQtdSub(n, qtd);
    setSubgrupoAtivo(n);
  };
  const renomearSubgrupo = async (atual: string) => {
    const nome = await pedirTexto('Renomear subgrupo:', atual);
    if (!nome || !nome.trim() || nome.trim() === atual) return;
    const n = nome.trim();
    if (subsDoItem.includes(n)) { alert(`Já existe o subgrupo "${n}".`); return; }
    setItens(p => p.map(x => doItemAtivo(x) && subgrupoDe(x) === atual ? { ...x, subgrupo_nome: n } : x));
    setParams(p => {
      const qs = { ...(p.qtd_subgrupo || {}) };
      const k = chaveSub(loteAtivoValido, grupoAtivoValido, atual);
      if (k in qs) { qs[chaveSub(loteAtivoValido, grupoAtivoValido, n)] = qs[k]; delete qs[k]; }
      return { ...p, qtd_subgrupo: qs };
    });
    setSubgrupoAtivo(n);
  };
  const removerSubgrupo = async (sub: string) => {
    const k = chaveSub(loteAtivoValido, grupoAtivoValido, sub);
    if (subsDoItem.length === 1) {
      // último subgrupo: o item volta a ser simples, com os mesmos produtos e quantidade
      if (!await confirmar(`Desfazer os subgrupos de "${grupoAtivoValido}"? Os produtos continuam no item, e o "Dividir por" volta para 1.`)) return;
      setItens(p => p.map(x => doItemAtivo(x) ? { ...x, subgrupo_nome: null } : x));
      setParams(p => {
        const qs = { ...(p.qtd_subgrupo || {}) }; delete qs[k];
        return { ...p, qtd_subgrupo: qs, lote_por_grupo: { ...(p.lote_por_grupo || {}), [chaveItem(loteAtivoValido, grupoAtivoValido)]: 1 } };
      });
      setSubgrupoAtivo(null);
      return;
    }
    const n = itens.filter(x => doItemAtivo(x) && subgrupoDe(x) === sub).length;
    if (!await confirmar(`Remover o subgrupo "${sub}" e os seus ${n} produto(s)?`)) return;
    setItens(p => p.filter(x => !(doItemAtivo(x) && subgrupoDe(x) === sub)));
    setParams(p => { const qs = { ...(p.qtd_subgrupo || {}) }; delete qs[k]; return { ...p, qtd_subgrupo: qs }; });
    setSubgrupoAtivo(subsDoItem.find(x => x !== sub) || null);
  };
  const linhaNova = (lote, grupo) => ({
    ...novoItem(), lote_nome: lote, grupo_nome: grupo,
    difal_pct: params.difal_pct, imposto_pct: params.imposto_pct, custo_fixo_pct: params.custo_fixo_pct,
  });

  const novoGrupoItem = async () => {
    const nome = await pedirTexto(`Nome do novo Item do edital (em ${loteAtivoValido}):`, `Item ${paresLoteItem.length + 1}`);
    if (!nome || !nome.trim()) return;
    const nomeFinal = nome.trim();
    if (gruposNomes.includes(nomeFinal)) { alert(`Já existe "${nomeFinal}" em ${loteAtivoValido}.`); return; }
    setItens(p => [...p, linhaNova(loteAtivoValido, nomeFinal)]);
    setGrupoAtivo(nomeFinal);
  };
  const renomearGrupoItem = async (nomeAtual: string) => {
    const nome = await pedirTexto('Renomear Item do edital:', nomeAtual);
    if (!nome || !nome.trim() || nome.trim() === nomeAtual) return;
    const nomeFinal = nome.trim();
    if (gruposNomes.includes(nomeFinal)) { alert(`Já existe "${nomeFinal}" em ${loteAtivoValido}.`); return; }
    setItens(p => p.map(x => loteDe(x) === loteAtivoValido && grupoDe(x) === nomeAtual ? { ...x, grupo_nome: nomeFinal } : x));
    moverQtd(loteAtivoValido, nomeAtual, loteAtivoValido, nomeFinal);
    if (grupoAtivoValido === nomeAtual) setGrupoAtivo(nomeFinal);
  };
  const removerGrupoItem = async (nome: string) => {
    const n = itens.filter(x => loteDe(x) === loteAtivoValido && grupoDe(x) === nome).length;
    if (!await confirmar(`Remover o Item "${nome}" de ${loteAtivoValido} e todos os seus ${n} componente(s)?`)) return;
    setItens(p => {
      const restante = p.filter(x => !(loteDe(x) === loteAtivoValido && grupoDe(x) === nome));
      return restante.length > 0 ? restante : [novoItem()]; // nunca fica sem nenhum item
    });
    moverQtd(loteAtivoValido, nome, null, null);
    if (grupoAtivoValido === nome) {
      const restantes = gruposNomes.filter(g => g !== nome);
      setGrupoAtivo(restantes[0] || 'Item 1');
    }
  };

  // ── Lotes do edital ──────────────────────────────────────────────────────
  const novoLote = async () => {
    const nome = await pedirTexto('Nome do novo Lote:', `Lote ${lotesNomes.length + 1}`);
    if (!nome || !nome.trim()) return;
    const nomeFinal = nome.trim();
    if (lotesNomes.includes(nomeFinal)) { alert(`Já existe o "${nomeFinal}".`); return; }
    setItens(p => [...p, linhaNova(nomeFinal, 'Item 1')]);
    setLoteAtivo(nomeFinal);
    setGrupoAtivo('Item 1');
  };
  const renomearLote = async (nomeAtual: string) => {
    const nome = await pedirTexto('Renomear Lote:', nomeAtual);
    if (!nome || !nome.trim() || nome.trim() === nomeAtual) return;
    const nomeFinal = nome.trim();
    if (lotesNomes.includes(nomeFinal)) { alert(`Já existe o "${nomeFinal}".`); return; }
    const gruposDoLote = [...new Set(itens.filter(x => loteDe(x) === nomeAtual).map(grupoDe))];
    setItens(p => p.map(x => loteDe(x) === nomeAtual ? { ...x, lote_nome: nomeFinal } : x));
    gruposDoLote.forEach(g => moverQtd(nomeAtual, g, nomeFinal, g));
    if (loteAtivoValido === nomeAtual) setLoteAtivo(nomeFinal);
  };
  const removerLote = async (nome: string) => {
    const n = itens.filter(x => loteDe(x) === nome).length;
    if (!await confirmar(`Remover o "${nome}" inteiro, com todos os seus itens e ${n} componente(s)?`)) return;
    const gruposDoLote = [...new Set(itens.filter(x => loteDe(x) === nome).map(grupoDe))];
    setItens(p => {
      const restante = p.filter(x => loteDe(x) !== nome);
      return restante.length > 0 ? restante : [novoItem()];
    });
    gruposDoLote.forEach(g => moverQtd(nome, g, null, null));
    if (loteAtivoValido === nome) {
      const outro = lotesNomes.find(l => l !== nome) || 'Lote 1';
      setLoteAtivo(outro);
      setGrupoAtivo(grupoDe(itens.find(x => loteDe(x) === outro)) || 'Item 1');
    }
  };

  // Preenche múltiplos campos de uma só vez (ao selecionar do catálogo)
  const fillItem = (id, dados) => setItens(p => p.map(x => x._id === id ? { ...x, ...dados } : x));

  // Expande produto BOM: substitui a linha atual por todas as linhas do BOM
  const expandItem = (id, linhas) => setItens(prev => {
    const idx = prev.findIndex(x => x._id === id);
    if (idx < 0) return prev;
    const novas = linhas.map(l => ({
      ...novoItem(),
      // herda lote e item da linha expandida — antes as linhas do BOM nasciam
      // de um item em branco e iam parar no "Item 1", fosse qual fosse o item
      lote_nome:      loteDe(prev[idx]),
      grupo_nome:     grupoDe(prev[idx]),
      subgrupo_nome:  subgrupoDe(prev[idx]),
      difal_pct:      params.difal_pct,
      imposto_pct:    params.imposto_pct,
      custo_fixo_pct: params.custo_fixo_pct,
      ...l,
    }));
    return [...prev.slice(0, idx), ...novas, ...prev.slice(idx + 1)];
  });

  // Troca de versão pelo seletor. Num <select> as setas do teclado trocam a
  // opção na hora — dá para mudar de versão sem querer, o que as antigas
  // "pílulas" não permitiam. Por isso, se há alteração não salva: confirma e
  // grava o rascunho JÁ (o automático espera 1,2s sem digitar, e a troca
  // cancelaria essa gravação pendente). Sem alteração, troca direto.
  const trocarVersao = async (id: string) => {
    const m = formacoesVinculo.find((x: any) => x.id === id);
    if (!m || m.id === editandoId) return;
    if (temNaoSalvo) {
      if (!await confirmar(
        'Esta formação tem alterações NÃO salvas.\n\n' +
        'Trocar de versão mesmo assim? As alterações ficam no rascunho desta versão ' +
        'e são oferecidas de volta quando você abri-la de novo.')) return;
      try {
        localStorage.setItem(chaveRascunho(editandoId), JSON.stringify({
          conteudo: edicaoAtual(),
          salvoEm: new Date().toISOString(),
          usuario: currentUser?.nome || currentUser?.email || null,
        }));
      } catch { /* rascunho é best-effort */ }
    }
    carregarModelo(m);
    setEditandoId(m.id);
  };

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('cotacoes_precos').select('*').order('criado_em', { ascending: false });
    if (error) { setErroModelos(error.message); setCarregando(false); return; }   // 7.59: lia como "nenhum modelo salvo"
    setErroModelos('');
    setModelos(data || []);
    setCarregando(false);
  }, []);

  // Atualiza a linha SÓ se ninguém mexeu nela desde que foi carregada.
  // Retorna { conflito:true } em vez de gravar quando alguém mexeu — a decisão
  // do que fazer fica com quem chamou (ver `abrirConflito`).
  const atualizarComTrava = async (id: string, payload: any) => {
    let q = supabase.from('cotacoes_precos')
      .update({ ...payload, atualizado_por: currentUser?.nome || currentUser?.email || 'Sistema' })
      .eq('id', id);
    // Linhas antigas podem não ter token (não deveria acontecer após a
    // migração, que preencheu todas) — sem token, grava sem trava.
    if (travaAtualizadoEm) q = q.eq('atualizado_em', travaAtualizadoEm);
    const { data, error } = await q.select('id, atualizado_em, atualizado_por');
    if (error) return { erro: error };
    if (!data || data.length === 0) return { conflito: true };
    setTravaAtualizadoEm(data[0].atualizado_em);
    setUltimaAlteracao({ em: data[0].atualizado_em, por: data[0].atualizado_por });
    return { ok: true };
  };

  // Descobre quem salvou por cima e abre o aviso de conflito, guardando o
  // payload pendente pra poder gravá-lo como nova versão se o usuário quiser.
  const abrirConflito = async (payload: any) => {
    const { data: atual } = await supabase.from('cotacoes_precos')
      .select('atualizado_em, atualizado_por, criado_por, versao').eq('id', editandoId).maybeSingle();
    setConflito({
      payload,
      dono: atual?.atualizado_por || atual?.criado_por || 'outra pessoa',
      quando: atual?.atualizado_em
        ? new Date(atual.atualizado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : null,
    });
  };

  // Grava o trabalho pendente como uma NOVA versão do mesmo grupo, preservando
  // intacta a versão que a outra pessoa salvou. É a saída padrão do conflito.
  const gravarComoNovaVersao = umaVez('nova-versao', async (payload: any) => {
    setResolvendoConflito(true);
    const idAnterior = editandoId;
    try {
      const raizId = versaoRaizId || editandoId;
      const { data: irmaos } = await supabase.from('cotacoes_precos')
        .select('versao').or(`id.eq.${raizId},versao_raiz_id.eq.${raizId}`);
      const proximaVersao = Math.max(1, ...(irmaos || []).map((r: any) => r.versao || 1)) + 1;
      const { data, error } = await supabase.from('cotacoes_precos')
        .insert([{ ...payload, versao: proximaVersao, versao_raiz_id: raizId,
                   criado_por: currentUser?.nome || 'Sistema',
                   atualizado_por: currentUser?.nome || currentUser?.email || 'Sistema' }])
        .select('id, atualizado_em, atualizado_por').single();
      if (error) throw error;
      let avisoVinculo = '';
      if (vinculo?.id) {
        const { error: erroVincNV } = await supabase.from('cotacoes_precos_vinculos')
          .upsert([{ cotacao_id: data.id, tipo: vinculo.tipo, processo_id: vinculo.id }],
                  { onConflict: 'cotacao_id,tipo,processo_id', ignoreDuplicates: true });
        // 7.59: a versão nova ficava sem ligação com o processo — sumia da tela dele (o incidente de 08/09 de novo)
        if (erroVincNV) avisoVinculo = '\n\nATENÇÃO: a versão foi gravada, mas NÃO foi ligada a este processo (' + erroVincNV.message + '). Use "Importar" para ligá-la.';
      }
      await supabase.from('cotacoes_precos_log').insert([{
        cotacao_id: data.id, tipo: 'conflito_nova_versao',
        descricao: `Versão ${proximaVersao} criada para não sobrescrever alteração salva por ${conflito?.dono || 'outra pessoa'}.`,
        usuario_id: currentUser?.id || null,
        usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
      }]);
      setEditandoId(data.id);
      setVersaoAtual(proximaVersao);
      setVersaoRaizId(raizId);
      setVencedoraAtual(false);
      setTravaAtualizadoEm(data.atualizado_em);
      setUltimaAlteracao({ em: data.atualizado_em, por: data.atualizado_por });
      setConflito(null);
      descartarRascunho(idAnterior);
      marcarComoSalvo(payload?.nome);
      carregarModelos();
      if (vinculo?.id) carregarFormacoesVinculo();
      window.dispatchEvent(new CustomEvent('acn:formacao-salva', { detail: { vinculo } }));
      alert(`Seu trabalho foi gravado como a versão ${proximaVersao}. A versão de ${conflito?.dono || 'outra pessoa'} continua intacta.` + avisoVinculo);
    } catch (err: any) {
      alert('Erro ao gravar como nova versão: ' + err.message);
    } finally {
      setResolvendoConflito(false);
    }
  });

  // Descarta o trabalho local e recarrega o que a outra pessoa salvou.
  const descartarERecarregar = async () => {
    setResolvendoConflito(true);
    const { data, error: erroRec } = await supabase.from('cotacoes_precos').select('*').eq('id', editandoId).maybeSingle();
    // 7.59: o rascunho era apagado ANTES de a leitura dar certo; se falhasse, o trabalho local se perdia sem a versão do outro na tela
    if (erroRec) { setResolvendoConflito(false); alert('Não foi possível ler a versão salva por outra pessoa: ' + erroRec.message + '\n\nNada foi descartado — o seu trabalho continua aqui.'); return; }
    descartarRascunho(editandoId); // o trabalho local foi descartado de propósito
    if (data) carregarModelo(data);
    setConflito(null);
    setRascunhoPendente(null);
    setResolvendoConflito(false);
  };

  const salvarModelo = umaVez('salvar', async (nome, tipo) => {
    // 7.59: com a lista de plataformas sem carregar, a formação abre sem a plataforma e salvar a apagaria
    if (erroPlataformas && !plataformaSelecionada && plataformaCarregadaRef.current) {
      alert('Esta formação tem uma plataforma, mas a lista de plataformas não carregou (' + erroPlataformas + '). Recarregue a tela antes de salvar, senão a plataforma seria apagada.');
      return;
    }
    setSalvando(true);
    const payload: any = {
      nome,
      tipo,
      empresa,
      plataforma_id:       plataformaSelecionada?.id || null,
      parametros_globais:  paramsParaGravar(),
      itens:               itensParaGravar(),
      opl_id:              oplVinculada?.id   || null,
      opl_numero:          oplVinculada?.opl  || null,
      desconto_maximo_pct: descontoMaximoPct  || 0,
    };
    // Modo embutido — grava o vínculo com o processo automaticamente (coluna
    // escalar mantida por compatibilidade com CotacoesTab.tsx; o vínculo N:N
    // de verdade vive na tabela de junção, inserida abaixo só ao criar).
    if (vinculo?.tipo === 'crm')       payload.crm_oportunidade_id = vinculo.id;
    if (vinculo?.tipo === 'licitacao') payload.licitacao_id        = vinculo.id;
    let error, novaCotacaoId: string | null = null;
    if (editandoId) {
      // Atualiza a cotação existente — com trava: se outra pessoa salvou desde
      // que esta tela carregou, NÃO sobrescreve; abre o aviso de conflito.
      const r = await atualizarComTrava(editandoId, payload);
      if (r.conflito) {
        setSalvando(false);
        setModalSalvar(false);
        await abrirConflito(payload);
        return;
      }
      error = r.erro;
    } else {
      // Cria nova cotação
      const { data, error: insErr } = await supabase.from('cotacoes_precos')
        .insert([{ ...payload, criado_por: currentUser?.nome || 'Sistema',
                   atualizado_por: currentUser?.nome || currentUser?.email || 'Sistema' }])
        .select('id, atualizado_em, atualizado_por').single();
      error = insErr;
      novaCotacaoId = data?.id || null;
      if (data) {
        setTravaAtualizadoEm(data.atualizado_em);
        setUltimaAlteracao({ em: data.atualizado_em, por: data.atualizado_por });
      }
    }
    let avisoVinculoSalvar = '';
    if (!error && novaCotacaoId && vinculo?.id) {
      const { error: erroVincSalvar } = await supabase.from('cotacoes_precos_vinculos')
        .upsert([{ cotacao_id: novaCotacaoId, tipo: vinculo.tipo, processo_id: vinculo.id }], { onConflict: 'cotacao_id,tipo,processo_id', ignoreDuplicates: true });
      // 7.59: a formação nascia sem ligação com o processo e sumia da tela dele
      if (erroVincSalvar) avisoVinculoSalvar = '\n\nATENÇÃO: a formação foi salva, mas NÃO foi ligada a este processo (' + erroVincSalvar.message + '). Use "Importar" para ligá-la.';
    }
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      window.dispatchEvent(new CustomEvent('acn:formacao-salva', { detail: { vinculo } }));
      alert((editandoId ? 'Cotação atualizada!' : 'Modelo salvo!') + avisoVinculoSalvar);
      setModalSalvar(false);
      // O nome digitado no modal ia só pro banco: a tela continuava achando
      // que a formação era "sem nome", então o salvamento seguinte pedia o
      // nome de novo e o cabeçalho seguia mostrando "sem nome".
      setNomeCotacao(nome);
      setTipoCotacao(tipo);
      // Gravou: o rascunho local cumpriu o papel e sai de cena.
      descartarRascunho(editandoId);
      if (novaCotacaoId) descartarRascunho(null); // era a chave "nova"
      marcarComoSalvo(nome);
      // Continua editando a MESMA formação depois de salvar. Antes zerava
      // (`setEditandoId(null)`), então o "Salvar" seguinte inseria uma linha
      // NOVA em vez de atualizar a mesma — espalhando cópias soltas do mesmo
      // trabalho e dando a impressão de que o registro certo tinha sumido.
      if (novaCotacaoId) setEditandoId(novaCotacaoId);
      carregarModelos();
      if (vinculo?.id) carregarFormacoesVinculo();
    }
    setSalvando(false);
  });

  const carregarModelo = (m) => {
    plataformaCarregadaRef.current = m.plataforma_id || null;
    // Merge com os padrões (não substitui cego pelo JSON salvo) — modelos
    // salvos antes de algum campo existir (ex: markup_pct) não têm essa
    // chave, e um valor `undefined` num input controlado dispara o warning
    // "controlled input to be uncontrolled" do React.
    setParams({ ...PARAMS_PADRAO, ...(m.parametros_globais || {}) });
    // formações gravadas antes de a marcação ir para o banco mantêm o padrão da tela
    setUsarGlobais(m.parametros_globais?.usar_globais ?? true);
    setUsarMarkupGlobal(m.parametros_globais?.usar_markup_global ?? false);
    const itensCarregados = (m.itens || []).map(x => ({ ...novoItem(), ...x, _id: Math.random().toString(36).slice(2) }));
    setItens(itensCarregados);
    setLoteAtivo(loteDe(itensCarregados[0]));
    setGrupoAtivo(grupoDe(itensCarregados[0]) || 'Item 1');
    setNomeCotacao(m.nome);
    setTipoCotacao(m.tipo || '');
    setSubgrupoAtivo(null);
    if (m.empresa) setEmpresa(m.empresa);
    if (m.plataforma_id && plataformas.length > 0) {
      setPlataformaSelecionada(plataformas.find(x => x.id === m.plataforma_id) || null);
    } else {
      setPlataformaSelecionada(null);
    }
    // Restaurar campos novos
    setDescontoMax(Number(m.desconto_maximo_pct) || 0);
    setStatusCotacao(m.status || 'rascunho');
    setVersaoAtual(m.versao || 1);
    setVersaoRaizId(m.versao_raiz_id || null);
    setFinalizadaPorNome(m.finalizada_por_nome || null);
    setFinalizadaEm(m.finalizada_em || null);
    setVencedoraAtual(!!m.vencedora);
    // Token da trava otimista — a partir daqui, salvar só grava se ninguém
    // mais tiver alterado esta linha desde este carregamento.
    setTravaAtualizadoEm(m.atualizado_em || null);
    setUltimaAlteracao(m.atualizado_em ? { em: m.atualizado_em, por: m.atualizado_por || m.criado_por || null } : null);
    // Nova geração: a próxima passada do efeito é o carregamento em si, não
    // edição — e é ali que o estado-base de comparação é fotografado.
    geracaoRef.current += 1;
    verificarRascunho(m.id);
    if (m.opl_numero) {
      // Busca o objeto completo da OP para vincular
      supabase.from('oples').select('id, opl, cliente_nome, status_geral')
        .eq('opl', m.opl_numero).maybeSingle()
        .then(({ data }) => setOplVinculada(data || null));
    } else {
      setOplVinculada(null);
    }
    setModalCarregar(false);
  };

  const excluirModelo = (id) => umaVez('excluir-' + id, async () => {
    if (!await confirmar('Excluir este modelo?')) return;
    const { error } = await supabase.from('cotacoes_precos').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir o modelo: ' + error.message); return; }   // 7.59: seguia como se tivesse excluído
    carregarModelos();
  })();

  const novaQuotacao = async () => {
    if (!await confirmar('Limpar cotação atual e iniciar nova?')) return;
    setParams({ ...PARAMS_PADRAO });
    setUsarGlobais(true);
    setUsarMarkupGlobal(false);
    setItens([novoItem()]);
    setGrupoAtivo('Item 1');
    setLoteAtivo('Lote 1');
    setNomeCotacao('');
    setTipoCotacao('');
    setSubgrupoAtivo(null);
    setEmpresa('ACN');
    setPlataformaSelecionada(null);
    setOplVinculada(null);
    setDescontoMax(0);
    setEditandoId(null);
    setStatusCotacao('rascunho');
    setVersaoAtual(1);
    setVersaoRaizId(null);
    setFinalizadaPorNome(null);
    setFinalizadaEm(null);
    setVencedoraAtual(false);
    setTravaAtualizadoEm(null);
    setUltimaAlteracao(null);
    geracaoRef.current += 1;
    verificarRascunho(null);
  };

  // Carrega cotação para edição e muda para a aba de formação
  const editarCotacao = (m) => {
    carregarModelo(m);
    setEditandoId(m.id);
    setAbaAtiva('formacao');
  };

  // Clona cotação: salva nova cópia no banco (sem OP vinculada) e abre para edição
  const clonarCotacao = umaVez('clonar', async (m) => {
    const novoNome = `Cópia de ${m.nome}`;
    const { data, error } = await supabase.from('cotacoes_precos').insert([{
      nome:                novoNome,
      tipo:                m.tipo,
      empresa:             m.empresa,
      plataforma_id:       m.plataforma_id || null,
      parametros_globais:  m.parametros_globais,
      itens:               m.itens,
      criado_por:          currentUser?.nome || currentUser?.email || 'Sistema',
      desconto_maximo_pct: m.desconto_maximo_pct || 0,
      // Sem opl_id / opl_numero — para vincular na nova OP após editar
    }]).select().single();
    if (error) { alert('Erro ao clonar: ' + error.message); return; }
    // Carrega o clone no formulário para edição imediata
    carregarModelo({ ...m, nome: novoNome, id: data.id });
    setEditandoId(data.id);
    setAbaAtiva('formacao');
    carregarModelos();
  });

  // ─── FINALIZAR: gerar PDF e anexar na OP ───────────────────────────────────
  const finalizar = umaVez('finalizar', async () => {   // 7.59: clique duplo gerava e anexava o PDF duas vezes (o estado `finalizando` só muda depois da confirmação, tarde demais)
    if (!oplVinculada) { alert('Vincule uma OP/OS primeiro para gerar o PDF.'); return; }
    if (itens.length === 0) { alert('Adicione itens antes de finalizar.'); return; }
    if (!await confirmar('Finalizar esta formação de preços e gerar o PDF?')) return;
    setFinalizando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable  = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ── Cabeçalho ──
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('FORMAÇÃO DE PREÇOS', 105, 18, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const linhas = [
        [`Empresa: ${empresa}`,  `Data: ${new Date().toLocaleDateString('pt-BR')}`],
        [`OP/OS: ${oplVinculada.opl}`,  `Cliente: ${oplVinculada.cliente_nome || '—'}`],
        [`Modelo: ${nomeCotacao || '—'}`, plataformaSelecionada ? `Plataforma: ${plataformaSelecionada.nome}` : ''],
      ];
      let y = 28;
      linhas.forEach(([esq, dir]) => {
        doc.text(esq, 14, y);
        if (dir) doc.text(dir, 130, y);
        y += 6;
      });

      // ── Tabelas de itens — uma seção por Item do edital, com subtotal ──
      const head = [isVendedor
        ? ['Produto / Descrição', 'Marca', 'Qt', 'Valor Unit.', 'Valor Total', 'Imposto']
        : ['Produto / Descrição', 'Marca', 'Qt', 'Custo Unit.', 'Valor Unit.', 'Valor Total', 'DIFAL', 'Imposto', 'Lucro%']
      ];
      const columnStyles = isVendedor
        ? { 0: { cellWidth: 60 }, 4: { halign: 'right' }, 5: { halign: 'right' } }
        : { 0: { cellWidth: 50 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } };

      let yCursor = y + 4;
      const variosLotes = estrutura.lotes.length > 1;
      const linhaPdf = (texto, cor = [15, 118, 110]) => {
        if (yCursor > 280) { doc.addPage(); yCursor = 18; }
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(cor[0], cor[1], cor[2]);
        doc.text(texto, 14, yCursor);
        doc.setTextColor(0, 0, 0);
        yCursor += 5;
      };
      estrutura.lotes.forEach(lc => {
        lc.itens.forEach(ic => {
          const nomeItem = variosLotes ? `${lc.nome} › ${ic.nome}` : ic.nome;
          if (yCursor > 265) { doc.addPage(); yCursor = 18; } // evita cabeçalho colado na borda da página
          doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
          doc.text(`${nomeItem} - Qtd.: ${ic.qtd}${ic.subgrupos.length ? ` (${ic.subgrupos.length} subgrupos)` : ''}`, 14, yCursor);
          yCursor += 5;
          const blocos = ic.subgrupos.length
            ? ic.subgrupos.map(sg => ({ titulo: `Subgrupo ${sg.nome} - ${sg.qtd} un.`, indices: sg.indices, calc: sg }))
            : [{ titulo: '', indices: ic.indices, calc: ic }];
          blocos.forEach(b => {
            if (b.titulo) {
              if (yCursor > 270) { doc.addPage(); yCursor = 18; }
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(107, 33, 168);
              doc.text(b.titulo, 18, yCursor); doc.setTextColor(0, 0, 0);
              yCursor += 4;
            }
            const body = b.indices.map(i => {
              const item = itens[i], r = results[i];
              if (isVendedor) return [item.produto || '—', item.marca || '—', item.qt, fmtR(r.valorUnit), fmtR(r.valorTotal), fmtR(r.totalImposto)];
              return [item.produto || '—', item.marca || '—', item.qt, fmtR(r.custoUnitBrl), fmtR(r.valorUnit), fmtR(r.valorTotal), fmtR(r.totalDifal), fmtR(r.totalImposto), fmtPct(r.lucroPct)];
            });
            autoTable(doc, {
              head, body, startY: yCursor, theme: 'grid',
              headStyles: { fillColor: [30, 41, 59], fontSize: 7, textColor: 255 },
              bodyStyles: { fontSize: 7 },
              columnStyles,
            });
            yCursor = (doc as any).lastAutoTable.finalY + 4;
            if (b.titulo) linhaPdf(`${b.titulo}: unitário ${fmtR(b.calc.unit.totVendas)} × ${b.calc.qtd} = ${fmtR(b.calc.total.totVendas)}`, [107, 33, 168]);
          });
          const t = ic.total;
          linhaPdf(isVendedor
            ? `Subtotal ${nomeItem}: unitário${ic.subgrupos.length ? ' médio' : ''} ${fmtR(ic.unit.totVendas)} × ${ic.qtd} = ${fmtR(t.totVendas)} · Impostos ${fmtR(t.totImposto)}`
            : `Subtotal ${nomeItem}: unitário${ic.subgrupos.length ? ' médio' : ''} ${fmtR(ic.unit.totVendas)} × ${ic.qtd} = ${fmtR(t.totVendas)} · Custos ${fmtR(t.totCustos)} · DIFAL ${fmtR(t.totDifal)} · Impostos ${fmtR(t.totImposto)} · Margem ${fmtR(t.totMargem)} · Lucro ${fmtPct(t.lucroPct)}`);
          yCursor += 2;
        });
        if (variosLotes) {
          linhaPdf(`TOTAL ${lc.nome}: unitário (total ÷ ${lc.qtd} un.) ${fmtR(lc.unit.totVendas)} · total ${fmtR(lc.total.totVendas)}${isVendedor ? '' : ` · margem ${fmtR(lc.total.totMargem)} · lucro ${fmtPct(lc.total.lucroPct)}`}`, [30, 58, 95]);
          yCursor += 3;
        }
      });

      const finalY = yCursor + 5;

      // ── Resumo financeiro ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('RESUMO FINANCEIRO', 14, finalY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let ry = finalY + 6;
      doc.text(`Total de Vendas: ${fmtR(totVendas)}`, 14, ry); ry += 5;
      doc.text(`Total Impostos: ${fmtR(totImposto)}`, 14, ry); ry += 5;
      if (!isVendedor) {
        doc.text(`Total DIFAL: ${fmtR(totDifal)}`, 14, ry); ry += 5;
        doc.text(`Margem Real: ${fmtR(totMargem)}`, 14, ry); ry += 5;
        doc.text(`Lucro % Geral: ${fmtPct(lucroGeral)}`, 14, ry); ry += 5;
      }
      if (plataformaSelecionada) {
        doc.text(`Desconto Plataforma (${descontoPlatPct}%): ${fmtR(descontoPlat)}`, 14, ry); ry += 5;
        doc.text(`Retenção Plataforma (${retencaoPlatPct}%): ${fmtR(retencaoPlat)}`, 14, ry); ry += 5;
        doc.text(`Líquido c/ Plataforma: ${fmtR(totalLiquidoPlat)}`, 14, ry); ry += 5;
      }

      // ── Campo de desconto máximo ──
      ry += 4;
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.rect(12, ry - 4, 186, 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 38, 38);
      doc.text(`Desconto máximo autorizado para negociação: ${descontoMaximoPct}%`, 15, ry + 2);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 60, 60);
      doc.text('Referência para o vendedor durante a negociação. Não ultrapassar este percentual.', 15, ry + 7);
      doc.setTextColor(0, 0, 0);

      // ── Upload para Supabase Storage ──
      const pdfBlob = doc.output('blob');
      const safeOpl  = (oplVinculada.opl || '').replace(/[^a-zA-Z0-9-]/g, '_');
      const safeName = `formacao-precos_${(nomeCotacao || 'sem-nome').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
      const path     = `opl-anexos/${safeOpl}/${safeName}`;

      const { data: upData, error: upErr } = await supabase.storage
        .from('acn-media')
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });

      if (upErr || !upData) throw new Error('Erro no upload: ' + (upErr?.message || 'desconhecido'));

      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);

      const { error: erroAnexoPdf } = await supabase.from('opl_anexos').insert([{
        opl_id:     oplVinculada.id,
        opl_numero: oplVinculada.opl,
        setor:      'Preços',
        tipo:       'documento',
        nome:       safeName,
        url:        pub?.publicUrl || '',
        criado_por: currentUser?.nome,
      }]);
      // 7.59: o PDF subia e o aviso dizia "anexado à OP" mesmo sem o registro do anexo (nada aparecia nos anexos da OP)
      if (erroAnexoPdf) throw new Error('o PDF foi gerado e enviado, mas NÃO foi anexado à OP (' + erroAnexoPdf.message + ')');

      alert(`PDF gerado e anexado à OP ${oplVinculada.opl}!\n\nO arquivo está disponível nos anexos da OP.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao finalizar: ' + err.message);
    } finally {
      setFinalizando(false);
    }
  });

  // ── Registrar como Versão Final (senha + rastreabilidade) ──────────────────
  // 1ª vez: marca a própria linha como 'finalizada' (versão 1). Da 2ª em
  // diante (já finalizada, usuário editou de novo depois): cria uma NOVA
  // linha em cotacoes_precos como próxima versão, preservando a anterior
  // intacta pra histórico -- e passa a editar a nova.
  const confirmarSenhaERegistrar = umaVez('registrar-versao', async () => {
    if (!senhaConfirm.trim()) { setErroSenha('Informe sua senha.'); return; }
    setRegistrandoVersao(true);
    setErroSenha('');
    const { data: user, error: userErr } = await supabase.from('auth_usuarios')
      .select('senha').eq('id', currentUser?.id).maybeSingle();
    if (userErr) { setErroSenha('Não foi possível conferir a senha: ' + userErr.message); setRegistrandoVersao(false); return; }   // 7.59: dizia "Senha incorreta."
    if (!user || user.senha !== senhaConfirm) {
      setErroSenha('Senha incorreta.');
      setRegistrandoVersao(false);
      return;
    }
    let avisoVinculoVersao = '';
    const agora = new Date().toISOString();
    // Nunca finaliza sem nome: sem isso a formação ficava com nome vazio e
    // aparecia em branco no seletor de versões, na tela de Cotações e na aba
    // "Preços Formados". Usa o rótulo do processo (nº da licitação / título da
    // oportunidade) quando o usuário não nomeou.
    const nomeFinal = (nomeCotacao || '').trim()
      || (rotulo || '').trim()
      || `Formação ${new Date().toLocaleDateString('pt-BR')}`;
    if (nomeFinal !== nomeCotacao) setNomeCotacao(nomeFinal);
    const payloadBase: any = {
      nome: nomeFinal, empresa,
      plataforma_id: plataformaSelecionada?.id || null,
      parametros_globais: paramsParaGravar(),
      itens: itensParaGravar(),
      opl_id: oplVinculada?.id || null,
      opl_numero: oplVinculada?.opl || null,
      desconto_maximo_pct: descontoMaximoPct || 0,
      ...(tipoCotacao ? { tipo: tipoCotacao } : {}),
      status: 'finalizada',
      finalizada_por: currentUser?.email || null,
      finalizada_por_nome: currentUser?.nome || currentUser?.email || 'Sistema',
      finalizada_em: agora,
    };
    if (vinculo?.tipo === 'crm')       payloadBase.crm_oportunidade_id = vinculo.id;
    if (vinculo?.tipo === 'licitacao') payloadBase.licitacao_id        = vinculo.id;

    try {
      if (statusCotacao !== 'finalizada') {
        // 1ª finalização — atualiza a própria linha (cria se ainda não existe).
        let cotacaoId = editandoId;
        if (cotacaoId) {
          // Mesma trava do salvarModelo: não finaliza por cima do trabalho de
          // outra pessoa sem avisar.
          const r = await atualizarComTrava(cotacaoId, { ...payloadBase, versao: 1 });
          if (r.conflito) {
            setModalSenha(false); setSenhaConfirm(''); setRegistrandoVersao(false);
            await abrirConflito({ ...payloadBase, versao: 1 });
            return;
          }
          if (r.erro) throw r.erro;
        } else {
          const { data, error } = await supabase.from('cotacoes_precos')
            .insert([{ ...payloadBase, versao: 1, criado_por: currentUser?.nome || 'Sistema',
                       atualizado_por: currentUser?.nome || currentUser?.email || 'Sistema' }])
            .select('id, atualizado_em, atualizado_por').single();
          if (error) throw error;
          cotacaoId = data.id;
          setEditandoId(cotacaoId);
          setTravaAtualizadoEm(data.atualizado_em);
          setUltimaAlteracao({ em: data.atualizado_em, por: data.atualizado_por });
        }
        if (vinculo?.id) {
          const { error: erroVincV1 } = await supabase.from('cotacoes_precos_vinculos')
            .upsert([{ cotacao_id: cotacaoId, tipo: vinculo.tipo, processo_id: vinculo.id }], { onConflict: 'cotacao_id,tipo,processo_id', ignoreDuplicates: true });
          if (erroVincV1) avisoVinculoVersao = '\n\nATENÇÃO: a versão foi registrada, mas NÃO foi ligada a este processo (' + erroVincV1.message + '). Use "Importar" para ligá-la.';   // 7.59
        }
        await supabase.from('cotacoes_precos_log').insert([{
          cotacao_id: cotacaoId, tipo: 'finalizada',
          descricao: `Formação de preços registrada como Versão 1 (final).`,
          usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
        }]);
        setStatusCotacao('finalizada'); setVersaoAtual(1); setFinalizadaPorNome(payloadBase.finalizada_por_nome); setFinalizadaEm(agora);
      } else {
        // Já finalizada antes e foi editada de novo — cria uma NOVA versão,
        // preservando a linha atual (editandoId) intocada como histórico.
        const raizId = versaoRaizId || editandoId; // se esta já é a raiz, versaoRaizId é null
        const { data: irmaos } = await supabase.from('cotacoes_precos')
          .select('versao').or(`id.eq.${raizId},versao_raiz_id.eq.${raizId}`);
        const proximaVersao = Math.max(1, ...(irmaos || []).map((r: any) => r.versao || 1)) + 1;
        const { data, error } = await supabase.from('cotacoes_precos')
          .insert([{ ...payloadBase, versao: proximaVersao, versao_raiz_id: raizId,
                     criado_por: currentUser?.nome || 'Sistema',
                     atualizado_por: currentUser?.nome || currentUser?.email || 'Sistema' }])
          .select('id, atualizado_em, atualizado_por').single();
        if (error) throw error;
        setTravaAtualizadoEm(data.atualizado_em);
        setUltimaAlteracao({ em: data.atualizado_em, por: data.atualizado_por });
        if (vinculo?.id) {
          const { error: erroVincVN } = await supabase.from('cotacoes_precos_vinculos')
            .upsert([{ cotacao_id: data.id, tipo: vinculo.tipo, processo_id: vinculo.id }], { onConflict: 'cotacao_id,tipo,processo_id', ignoreDuplicates: true });
          if (erroVincVN) avisoVinculoVersao = '\n\nATENÇÃO: a nova versão foi registrada, mas NÃO foi ligada a este processo (' + erroVincVN.message + '). Use "Importar" para ligá-la.';   // 7.59
        }
        await supabase.from('cotacoes_precos_log').insert([{
          cotacao_id: data.id, tipo: 'finalizada',
          descricao: `Nova versão (v${proximaVersao}) registrada como final.`,
          usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
        }]);
        setEditandoId(data.id);
        setStatusCotacao('finalizada'); setVersaoAtual(proximaVersao); setVersaoRaizId(raizId);
        setFinalizadaPorNome(payloadBase.finalizada_por_nome); setFinalizadaEm(agora); setVencedoraAtual(false);
      }
      setModalSenha(false); setSenhaConfirm(''); setErroSenha('');
      descartarRascunho(editandoId);
      marcarComoSalvo(nomeFinal);
      carregarModelos();
      window.dispatchEvent(new CustomEvent('acn:formacao-salva', { detail: { vinculo } }));
      alert('Formação de preços registrada como versão final!' + avisoVinculoVersao);
    } catch (err: any) {
      alert('Erro ao registrar versão: ' + err.message);
    } finally {
      setRegistrandoVersao(false);
    }
  });

  // Marca esta versão como a vencedora do pregão/licitação (e desmarca as
  // demais do mesmo grupo).
  const marcarVencedora = umaVez('vencedora', async () => {
    if (!editandoId) return;
    if (!await confirmar('Marcar esta versão como a VENCEDORA do pregão/licitação?')) return;
    const raizId = versaoRaizId || editandoId;
    // 7.59: os dois passos ignoravam o erro; se o 2º falhasse, nenhuma versão ficava vencedora e a tela dizia que sim
    const { error: erroDesmarcar } = await supabase.from('cotacoes_precos').update({ vencedora: false }).or(`id.eq.${raizId},versao_raiz_id.eq.${raizId}`);
    if (erroDesmarcar) { alert('Não foi possível marcar a vencedora: ' + erroDesmarcar.message + '\n\nNada foi alterado.'); return; }
    const { data: marcada, error: erroMarcar } = await supabase.from('cotacoes_precos')
      .update({ vencedora: true }).eq('id', editandoId).select('atualizado_em, atualizado_por').single();
    if (erroMarcar) { setVencedoraAtual(false); alert('As vencedoras anteriores foram desmarcadas, mas esta versão NÃO pôde ser marcada (' + erroMarcar.message + '). Marque de novo para tentar outra vez.'); return; }
    setVencedoraAtual(true);
    // Estes dois UPDATEs também disparam o gatilho de atualizado_em; sem
    // renovar o token aqui, o próximo "Salvar" acusaria conflito do usuário
    // consigo mesmo.
    if (marcada) {
      setTravaAtualizadoEm(marcada.atualizado_em);
      setUltimaAlteracao({ em: marcada.atualizado_em, por: marcada.atualizado_por });
    }
    await supabase.from('cotacoes_precos_log').insert([{
      cotacao_id: editandoId, tipo: 'vencedora_marcada',
      descricao: `Versão ${versaoAtual} marcada como vencedora do pregão/licitação.`,
      usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
    }]);
    alert('Versão marcada como vencedora!');
  });

  // Torna uma versão (inclusive antiga) a FINAL da formação: marca vencedora nela e desmarca nas outras do grupo — o mesmo gesto do botão "Marcar Vencedora", mas para qualquer versão da lista.
  // Só versão finalizada pode ser a final (rascunho é trabalho em andamento).
  const tornarVersaoFinal = umaVez('versao-final', async (m: any) => {
    if (!m) return;
    if (m.status !== 'finalizada') { alert('Só uma versão finalizada pode ser a versão final.'); return; }
    if (!await confirmar(`Tornar a v${m.versao || 1} a versão FINAL desta formação?\n\nÉ ela que passa a valer: abre primeiro, vale para o preço formado do card e para o termômetro de markup. As outras versões continuam guardadas em "Versões".`)) return;
    const raizId = raizDe(m);
    const { error: erroDesmarcar } = await supabase.from('cotacoes_precos').update({ vencedora: false }).or(`id.eq.${raizId},versao_raiz_id.eq.${raizId}`);
    if (erroDesmarcar) { alert('Não foi possível trocar a versão final: ' + erroDesmarcar.message + '\n\nNada foi alterado.'); return; }
    const { error: erroMarcar } = await supabase.from('cotacoes_precos').update({ vencedora: true }).eq('id', m.id);
    if (erroMarcar) { alert('A marca da versão final anterior foi retirada, mas a v' + (m.versao || 1) + ' NÃO pôde ser marcada (' + erroMarcar.message + '). Tente de novo.'); await carregarFormacoesVinculo(); return; }
    // estes UPDATEs também disparam o gatilho de atualizado_em: renova o token da versão aberta, senão o próximo "Salvar" acusaria conflito dela consigo mesma
    if (editandoId) {
      const { data: cur } = await supabase.from('cotacoes_precos').select('atualizado_em, atualizado_por, vencedora').eq('id', editandoId).maybeSingle();
      if (cur) { setTravaAtualizadoEm(cur.atualizado_em); setUltimaAlteracao({ em: cur.atualizado_em, por: cur.atualizado_por }); setVencedoraAtual(!!cur.vencedora); }
    }
    const { error: erroLog } = await supabase.from('cotacoes_precos_log').insert([{
      cotacao_id: m.id, tipo: 'vencedora_marcada',
      descricao: `Versão ${m.versao || 1} passou a ser a versão final (vencedora) da formação.`,
      usuario_id: currentUser?.id || null, usuario_nome: currentUser?.nome || currentUser?.email || 'Sistema',
    }]);
    if (erroLog) console.warn('Falha ao registrar a troca da versão final no histórico:', erroLog.message);
    await carregarFormacoesVinculo();
    alert('A v' + (m.versao || 1) + ' agora é a versão final.');
  });

  // Carrega o histórico completo (versões do grupo + log de alterações de
  // todas elas) pra exibir no modal.
  const abrirHistorico = async () => {
    if (!editandoId) { alert('Salve ou finalize a cotação antes de ver o histórico.'); return; }
    setCarregandoHistorico(true);
    setModalHistorico(true);
    const raizId = versaoRaizId || editandoId;
    const { data: versoes, error: erroVersoes } = await supabase.from('cotacoes_precos')
      .select('id,versao,finalizada_por_nome,finalizada_em,vencedora,status')
      .or(`id.eq.${raizId},versao_raiz_id.eq.${raizId}`)
      .order('versao', { ascending: true });
    const idsGrupo = (versoes || []).map((v: any) => v.id);
    const { data: logs, error: erroLogs } = idsGrupo.length
      ? await supabase.from('cotacoes_precos_log').select('*').in('cotacao_id', idsGrupo).order('criado_em', { ascending: false })
      : { data: [], error: null };
    // 7.59: leitura que falha parecia "histórico vazio"
    if (erroVersoes || erroLogs) alert('Não foi possível ler o histórico completo (' + (erroVersoes || erroLogs).message + '). O que aparece pode estar incompleto.');
    setHistoricoVersoes(versoes || []);
    setHistoricoLogs(logs || []);
    setCarregandoHistorico(false);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className={'acn-fp' + (embutido ? ' embutido' : '')}>

      {/* ── NAVEGAÇÃO DE ABAS — some no modo embutido, só a edição importa ── */}
      {!embutido && (
        <Abas ativa={abaAtiva} onChange={setAbaAtiva}
          itens={[
            { id: 'formacao', rotulo: 'Formação de Preços', icone: mdiChartBar },
            { id: 'precos_formados', rotulo: 'Preços Formados', icone: mdiFileMultipleOutline },
          ]} />
      )}

      {/* ── ABA PREÇOS FORMADOS ── */}
      {!embutido && abaAtiva === 'precos_formados' && (
        <AbaPrecoFormados currentUser={currentUser} isVendedor={isVendedor} onEditar={editarCotacao} onClonar={clonarCotacao} />
      )}

      {/* ── ABA FORMAÇÃO DE PREÇOS ── */}
      {(embutido || abaAtiva === 'formacao') && (
        <div className={'acn-fp-corpo' + (embutido ? ' embutido' : '')}>

          {erroVinculo && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={carregarFormacoesVinculo}>Tentar de novo</Botao>}>
              Não foi possível ler as formações deste processo ({erroVinculo}). Isso não quer dizer que não haja formação salva — <strong>não crie outra antes de conseguir ler</strong>, senão ela pode ficar duplicada.
            </Faixa>
          )}
          {erroPlataformas && (
            <Faixa tom="atencao">
              Não foi possível ler a lista de plataformas ({erroPlataformas}). Uma formação que tenha plataforma abre sem ela e <strong>não pode ser salva</strong> até a lista carregar — recarregue a tela.
            </Faixa>
          )}

          {/* ── AVISO DE EDIÇÃO SIMULTÂNEA ──
              Aparece quando o banco recusou o UPDATE porque outra pessoa
              salvou esta mesma formação depois que esta tela a carregou.
              Nada foi sobrescrito: o trabalho local continua na tela e o
              usuário escolhe o que fazer com ele. */}
          {conflito && (
            <div className="modal-overlay acn-fp-overlay acn-fp-conf-overlay">
              <div className="modal-box acn-modal-cadastro acn-fp-jan" role="alertdialog" aria-label="Alguém salvou esta formação enquanto você editava">
                <div className="acn-modal-cab">
                  <span className="modal-title acn-fp-conf-tit">
                    <Icone path={mdiAlertOutline} size={18} />
                    Alguém salvou esta formação enquanto você editava
                  </span>
                </div>
                <div className="acn-modal-corpo">
                  <div className="acn-fp-conf-txt">
                    <strong>{conflito.dono}</strong>
                    {conflito.quando ? ` salvou uma alteração às ${conflito.quando}` : ' salvou uma alteração'},
                    depois que esta tela foi aberta.
                    <br /><br />
                    <strong>Nada foi perdido</strong> — o seu trabalho continua aqui na tela e a
                    versão dele continua salva. Escolha como seguir:
                  </div>
                  <div className="acn-fp-conf-acoes">
                    <Botao variante="primario" icone={mdiCheck} className="acn-fp-conf-btn" disabled={resolvendoConflito}
                      onClick={() => gravarComoNovaVersao(conflito.payload)}>
                      Gravar o meu como uma NOVA versão
                      <span className="acn-fp-conf-sub">
                        Preserva os dois trabalhos. Recomendado.
                      </span>
                    </Botao>
                    <Botao icone={mdiUndo} className="acn-fp-conf-btn" disabled={resolvendoConflito} onClick={descartarERecarregar}>
                      Descartar o meu e abrir a versão de {conflito.dono}
                    </Botao>
                    <Botao variante="discreto" disabled={resolvendoConflito} onClick={() => setConflito(null)}>
                      Cancelar e continuar editando
                    </Botao>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── RASCUNHO NÃO SALVO ENCONTRADO ──
              Só aparece quando existe trabalho gravado no navegador que nunca
              chegou a ser salvo no sistema (fechou a aba, caiu a energia,
              saiu da tela sem salvar). */}
          {rascunhoPendente && (
            <Faixa tom="atencao" icone={mdiNotebookEditOutline} acao={<>
              <Botao variante="primario" pequeno icone={mdiUndo} onClick={restaurarRascunho}>Restaurar</Botao>
              <Botao pequeno onClick={() => descartarRascunho(rascunhoPendente.id)}>Descartar</Botao>
            </>}>
              <strong>Há alterações não salvas desta formação neste computador</strong>
              <div className="acn-ajuda">
                Guardadas automaticamente em{' '}
                {rascunhoPendente.salvoEm
                  ? new Date(rascunhoPendente.salvoEm).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
                  : '—'}
                {rascunhoPendente.usuario ? ` · ${rascunhoPendente.usuario}` : ''}. Elas não estão no sistema ainda.
              </div>
            </Faixa>
          )}

          {/* ── SELETOR DE FORMAÇÕES VINCULADAS (modo embutido) ── */}
          {vinculo && (
            <div className="acn-fp-sel">
              {carregandoVinculo ? (
                <span className="acn-ajuda">Carregando formações vinculadas...</span>
              ) : (
                <>
                  {formacoesVinculo.length > 0 && (() => {
                    // Pedido do usuário em 07/10/2026: só a versão final fica à vista; as outras ficam no botão "Versões" (antes: um seletor com todas).
                    const atual = formacoesVinculo.find((m: any) => m.id === editandoId);
                    const final = atual ? versaoFinalDe(formacoesVinculo.filter((x: any) => raizDe(x) === raizDe(atual))) : null;
                    const antiga = !!atual && !!final && final.id !== atual.id;
                    return (<>
                      <span className="acn-fp-sel-rot">{antiga ? 'Versão aberta' : 'Versão final'}</span>
                      <span className={'acn-fp-sel-atual' + (atual?.vencedora ? ' vencedora' : '')} title={atual ? rotuloFormacao(atual) : ''}>
                        {atual ? rotuloFormacao(atual) : (editandoId ? '— outra formação carregada —' : '— Nova formação (ainda não salva) —')}
                      </span>
                      {antiga && (
                        <Botao pequeno icone={mdiTrophyOutline} onClick={() => trocarVersao(final.id)} title={'Voltar para a versão final: ' + rotuloFormacao(final)}>
                          Ir para a final (v{final.versao || 1})
                        </Botao>
                      )}
                      {formacoesVinculo.length > 1 && (
                        <Botao pequeno icone={mdiHistory} onClick={() => setModalVersoes(true)} title="Lista das versões desta formação (e das outras formações deste processo): abrir, ver o resumo e trocar a versão final">
                          Versões ({formacoesVinculo.length})
                        </Botao>
                      )}
                    </>);
                  })()}
                  {editandoId && formacoesVinculo.some((m: any) => m.id === editandoId) && temPoderDeGerente(currentUser) && (
                    <Botao variante="perigo-sec" pequeno icone={mdiLinkVariantOff} onClick={desvincularFormacao}
                      title="Tira esta formação deste processo (não apaga a formação) — Gerentes e Admins">
                      Desvincular
                    </Botao>
                  )}
                  <Botao pequeno icone={mdiPlus} onClick={novaQuotacao}>Nova formação</Botao>
                  <Botao pequeno icone={mdiDownloadOutline} onClick={() => { setModalImportar(true); carregarModelos(); }}>
                    Importar Formação
                  </Botao>
                </>
              )}
            </div>
          )}

          {/* ── HEADER ── */}
          <div className="acn-fp-cab">
            <div>
              <div className="acn-fp-tela-tit"><Icone path={mdiChartBar} size={20} /> Formação de Preços</div>
              {/* Antes esta faixa inteira só aparecia se a formação tivesse
                  nome — então justamente as salvas sem nome (as do incidente
                  de 08/09) ficavam sem NENHUM indicador: nem "editando", nem
                  "finalizada v3", nem última alteração. Agora aparece sempre
                  que há uma formação carregada; o nome é que é opcional. */}
              {(nomeCotacao || editandoId || temNaoSalvo) && (
                <div className="acn-fp-cab-estado">
                  {editandoId
                    ? <Selo familia="atencao" ponto={false}><Icone path={mdiPencilOutline} size={12} /> EDITANDO</Selo>
                    : null}
                  {nomeCotacao ? <>Modelo: <strong>{nomeCotacao}</strong></> : <em className="acn-fraco">sem nome</em>}
                  {statusCotacao === 'finalizada' && (
                    <Selo familia="ok" ponto={false}>
                      <Icone path={mdiLockOutline} size={12} /> Finalizada v{versaoAtual}{finalizadaPorNome ? ` · ${finalizadaPorNome}` : ''}
                    </Selo>
                  )}
                  {vencedoraAtual && (
                    <Selo familia="atencao" ponto={false}>
                      <Icone path={mdiTrophyOutline} size={12} /> Versão Vencedora
                    </Selo>
                  )}
                  {temNaoSalvo && (
                    <Selo familia="erro">
                      Alterações não salvas
                    </Selo>
                  )}
                  {ultimaAlteracao?.em && (
                    <Tag>
                      <Icone path={mdiClockOutline} size={12} /> Última alteração: {new Date(ultimaAlteracao.em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      {ultimaAlteracao.por ? ` · ${ultimaAlteracao.por}` : ''}
                    </Tag>
                  )}
                </div>
              )}
            </div>
            <div className="acn-fp-cab-acoes">
              <Botao icone={mdiFolderOpenOutline} onClick={() => { setModalCarregar(true); carregarModelos(); }}>
                Carregar Modelo
              </Botao>
              <Botao variante="primario" icone={editandoId ? mdiPencilOutline : mdiContentSaveOutline} onClick={() => setModalSalvar(true)}>
                {editandoId ? 'Atualizar Cotação' : 'Salvar Modelo'}
              </Botao>
              <Botao icone={mdiFileDocumentOutline} onClick={novaQuotacao}>
                Nova Cotação
              </Botao>
              {itens.length > 0 && (
                <Botao icone={mdiReceiptTextOutline} onClick={() => setModalResumo(true)}
                  title="Resumo por lote e item: quantidades, unitários, totais e margem — com impressão/PDF">
                  Resumo
                </Botao>
              )}
              {itens.length > 0 && (
                <Botao icone={mdiLockOutline}
                  onClick={() => { setSenhaConfirm(''); setErroSenha(''); setModalSenha(true); }}
                  title="Exige confirmação de senha -- grava seu nome e data como responsável pela versão">
                  {statusCotacao === 'finalizada' ? 'Registrar Nova Versão Final' : 'Registrar Versão Final'}
                </Botao>
              )}
              {editandoId && (
                <Botao icone={mdiHistory} onClick={abrirHistorico}>
                  Histórico
                </Botao>
              )}
              {statusCotacao === 'finalizada' && !vencedoraAtual && (
                <Botao icone={mdiTrophyOutline} onClick={marcarVencedora}>
                  Marcar Vencedora
                </Botao>
              )}
              {oplVinculada && (
                <Botao icone={finalizando ? mdiTimerSand : mdiPaperclip}
                  onClick={finalizar}
                  disabled={finalizando}>
                  {finalizando ? 'Gerando PDF...' : 'Finalizar & Anexar PDF'}
                </Botao>
              )}
            </div>
          </div>
          {statusCotacao === 'finalizada' && (
            <Faixa tom="atencao">
              Esta formação já foi registrada como final. Alterações de custo, markup ou remoção de item a partir
              daqui ficam registradas no <strong>Histórico</strong> (botão acima) para rastreabilidade.
            </Faixa>
          )}

          {/* ── RESUMO — no topo, antes de toda a composição ── */}
          <ResumoFormacaoTopo estrutura={estrutura} isVendedor={isVendedor} multiplicador={lote}
            plataforma={plataformaSelecionada} descontoPlatPct={descontoPlatPct} retencaoPlatPct={retencaoPlatPct}
            descontoPlat={descontoPlat} retencaoPlat={retencaoPlat} totalLiquidoPlat={totalLiquidoPlat}
            loteAtivo={loteAtivoValido} grupoAtivo={grupoAtivoValido}
            onSelecionar={(l, gr) => { setLoteAtivo(l); setGrupoAtivo(gr); setSubgrupoAtivo(null); }} />

          {/* ── IDENTIFICAÇÃO: OP/OS, Desconto Máx., Empresa, Plataforma ──
              Um card só (antes eram 2 caixas separadas) — mesmo assunto,
              "quem é esta cotação", com uma linha divisória entre os 2 blocos. */}
          <div className="acn-fp-bloco">
            {/* alinhado pelo topo (não pela base) — o bloco Desconto tem uma 3ª
                linha de legenda que o de OP/OS não tem; alinhar pela base
                fazia os rótulos ficarem em alturas diferentes */}
            <div className="acn-fp-bloco-linha">
              <div>
                <div className="acn-fp-bloco-rot"><Icone path={mdiLinkVariant} size={13} /> OP/OS Vinculada</div>
                <OplAutocomplete value={oplVinculada} onSelect={setOplVinculada} />
                {oplVinculada && (
                  <div className="acn-fp-opl-ok" data-acn-familia="ok">
                    <Icone path={mdiCheck} size={13} /> {oplVinculada.opl} — {oplVinculada.cliente_nome}
                  </div>
                )}
              </div>
              {!isVendedor && (
                <div>
                  <div className="acn-fp-bloco-rot"><Icone path={mdiLockOutline} size={13} /> Desconto Máx. (%)</div>
                  <div className="acn-fp-desc-linha">
                    <input type="number" className="acn-input acn-fp-in-80 acn-fp-num"
                      min={0} max={100} step="0.5" value={descontoMaximoPct}
                      onChange={e => setDescontoMax(parseFloat(e.target.value) || 0)} />
                    <span className="acn-ajuda">%</span>
                  </div>
                  <div className="acn-ajuda">Limite para o vendedor negociar</div>
                </div>
              )}
            </div>

            <div className="acn-fp-bloco-linha com-divisor">
              <div>
                <div className="acn-fp-bloco-rot"><Icone path={mdiOfficeBuildingOutline} size={13} /> Empresa</div>
                <Chips ativo={empresa} onChange={setEmpresa} itens={[{ id: 'ACN', rotulo: 'ACN' }, { id: 'DETECH', rotulo: 'DETECH' }]} />
              </div>
              <div>
                <div className="acn-fp-bloco-rot"><Icone path={mdiStorefrontOutline} size={13} /> Plataforma</div>
                <select className="acn-input acn-fp-plat-campo"
                  value={plataformaSelecionada?.id || ''}
                  onChange={e => setPlataformaSelecionada(plataformas.find(x => x.id === e.target.value) || null)}>
                  <option value="">— Sem Plataforma —</option>
                  {plataformas.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome}{p.desconto_pct ? ` (desc: ${p.desconto_pct}%)` : ''}{p.retencao_pct ? ` (ret: ${p.retencao_pct}%)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {plataformaSelecionada && (
                <div className="acn-fp-plat-info">
                  <span data-acn-familia="ok">Desconto: {descontoPlatPct}% = {fmtR(descontoPlat)}</span>
                  <span data-acn-familia="erro">Retenção: {retencaoPlatPct}% = {fmtR(retencaoPlat)}</span>
                  <span data-acn-familia="marca" className="liquido">Líquido: {fmtR(totalLiquidoPlat)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── PARÂMETROS GLOBAIS — grid fixo em vez de flex-wrap, alinha certinho ── */}
          <div className="acn-fp-bloco">
            <div className="acn-fp-bloco-tit">
              <Icone path={mdiCogOutline} size={14} /> Parâmetros Globais
            </div>
            <div className="acn-fp-params">
              {[
                { label:'PTAX USD (R$)',  k:'ptax_dolar',     step:'0.0001' },
                { label:'PTAX EUR (R$)',  k:'ptax_euro',      step:'0.0001' },
                { label:'DIFAL %',        k:'difal_pct',      step:'0.1' },
                { label:'Imposto %',      k:'imposto_pct',    step:'0.1' },
                { label:'Custo Fixo %',  k:'custo_fixo_pct', step:'0.1' },
                { label:'Markup Global %',k:'markup_pct',     step:'0.1' },
                // Multiplica a formação INTEIRA (quantas vezes ela é vendida).
                // Chamava "Qtd. Lote" e confundia com o Lote do edital.
                { label:'Multiplicador geral', k:'lote_qtd',  step:'1' },
              ].map(({ label, k, step }) => (
                <div key={k}>
                  <div className="acn-fp-rot">{label}</div>
                  <input type="number" className="acn-input acn-fp-num acn-fp-campo-cheio"
                    step={step} value={params[k]}
                    onChange={e => setP(k, parseFloat(e.target.value) || 0)} />
                </div>
              ))}
            </div>
            <div className="acn-fp-params-rodape">
              <label className="acn-fp-check">
                <input type="checkbox" checked={usarGlobais} onChange={e=>setUsarGlobais(e.target.checked)} />
                Usar globais (DIFAL/Imp/CF)
              </label>
              <label className="acn-fp-check">
                <input type="checkbox" checked={usarMarkupGlobal} onChange={e=>setUsarMarkupGlobal(e.target.checked)} />
                <span className={usarMarkupGlobal ? 'acn-fp-check-on' : undefined}>
                  Markup Global (sem impostos)
                </span>
              </label>
              <Botao variante="primario" pequeno icone={mdiSync}
                onClick={copiarGlobaisParaLinhas}
                title="Copia os globais para cada linha e desbloqueia edição individual">
                Copiar globais → linhas
              </Botao>
            </div>
          </div>

          {/* ── LOTES DO EDITAL — nível acima dos itens ── */}
          <div className="acn-fp-faixa">
            <span className="acn-fp-faixa-rot">Lotes</span>
            {lotesNomes.map(nome => {
              const nItens = new Set(itens.filter(x => loteDe(x) === nome).map(grupoDe)).size;
              const ativo = nome === loteAtivoValido;
              return (
                <div key={nome} className={'acn-fp-aba' + (ativo ? ' ativa' : '')}>
                  <Botao variante={ativo ? 'primario' : 'secundario'} pequeno icone={mdiPackageVariantClosed}
                    onClick={() => { setLoteAtivo(nome); setGrupoAtivo(grupoDe(itens.find(x => loteDe(x) === nome)) || 'Item 1'); }}
                    onDoubleClick={() => renomearLote(nome)} title="Duplo-clique para renomear">
                    {nome} <span className="acn-fp-aba-n">({nItens} {nItens === 1 ? 'item' : 'itens'})</span>
                  </Botao>
                  {lotesNomes.length > 1 && (
                    <Botao variante="perigo-sec" pequeno icone={mdiTrashCanOutline} onClick={() => removerLote(nome)}
                      title={`Remover ${nome}`} aria-label={`Remover ${nome}`} />
                  )}
                </div>
              );
            })}
            <Botao pequeno icone={mdiPlus} onClick={novoLote}>Lote</Botao>
          </div>

          {/* ── ITENS DO EDITAL (abas) — do lote ativo ── */}
          <div className="acn-fp-faixa acn-fp-faixa-itens">
            {gruposNomes.map(nome => {
              const qtd = itens.filter(x => loteDe(x) === loteAtivoValido && grupoDe(x) === nome).length;
              const ativo = nome === grupoAtivoValido;
              return (
                <div key={nome} className={'acn-fp-aba' + (ativo ? ' ativa' : '')}>
                  <Botao variante={ativo ? 'primario' : 'secundario'} pequeno onClick={() => setGrupoAtivo(nome)}
                    onDoubleClick={() => renomearGrupoItem(nome)}
                    title="Duplo-clique para renomear">
                    {nome} <span className="acn-fp-aba-n">({qtd})</span>
                  </Botao>
                  {gruposNomes.length > 1 && (
                    <Botao variante="perigo-sec" pequeno icone={mdiTrashCanOutline} onClick={() => removerGrupoItem(nome)}
                      title={`Remover ${nome}`} aria-label={`Remover ${nome}`} />
                  )}
                </div>
              );
            })}
            <Botao pequeno icone={mdiPlus} onClick={novoGrupoItem}>Item do Edital</Botao>
          </div>

          {/* ── SUBGRUPOS DO ITEM (quando o item foi dividido) ── */}
          {temSubgrupos && (
            <div className="acn-fp-faixa acn-fp-faixa-sub">
              <span className="acn-fp-faixa-rot">Subgrupos</span>
              {subsDoItem.map(sub => {
                const ativo = sub === subAtivoValido;
                const q = qtdDoSubgrupo(params, loteAtivoValido, grupoAtivoValido, sub);
                return (
                  <div key={sub} className={'acn-fp-sub-chip' + (ativo ? ' ativa' : '')}>
                    <Botao variante="discreto" pequeno onClick={() => setSubgrupoAtivo(sub)} onDoubleClick={() => renomearSubgrupo(sub)}
                      title="Duplo-clique para renomear">
                      {sub}
                    </Botao>
                    <input type="number" min={1} value={q} title={`Unidades no subgrupo ${sub}`}
                      onChange={e => setQtdSub(sub, e.target.value)}
                      className="acn-input acn-fp-sub-qtd acn-fp-num" />
                    <span className="acn-ajuda">un.</span>
                  </div>
                );
              })}
              <Botao pequeno icone={mdiPlus} onClick={() => novoSubgrupo(null)}>Subgrupo</Botao>
              <Botao pequeno icone={mdiContentCopy} onClick={() => novoSubgrupo(subAtivoValido)} title={`Novo subgrupo começando com os produtos de "${subAtivoValido}"`}>
                Duplicar "{subAtivoValido}"
              </Botao>
              <Botao variante="perigo-sec" pequeno icone={mdiTrashCanOutline} onClick={() => removerSubgrupo(subAtivoValido)}
                title={`Remover o subgrupo "${subAtivoValido}"`} aria-label={`Remover o subgrupo "${subAtivoValido}"`} />
            </div>
          )}

          {/* ── DIVISOR DO ITEM ──
              Até 28/09/2026 era a quantidade do Item e multiplicava. O dono da
              empresa pediu que ele DIVIDA: item comprado em par (custo do par)
              e vendido por unidade — o unitário do resumo é o total dos
              produtos dividido por este número. Ver FormacaoCalculo.ts. */}
          <div className="acn-fp-divisor">
            <div className="acn-fp-divisor-linha">
              {temSubgrupos ? (
                <span className="acn-fp-divisor-txt">
                  Quantidade de "{grupoAtivoValido}": <strong>{itemCalcAtivo?.qtd ?? 1}</strong> <span className="acn-fraco">(soma dos {subsDoItem.length} subgrupos)</span>
                </span>
              ) : (<>
                <span className="acn-fp-divisor-txt forte">
                  Dividir "{grupoAtivoValido}" por <span className="acn-fp-divisor-ex">(ex.: comprado em par e vendido por unidade → 2)</span>
                </span>
                <input type="number" className="acn-input acn-fp-in-60 acn-fp-num"
                  min={1} value={loteGrupo}
                  onChange={e => setParams(p => {
                    const m = { ...(p.lote_por_grupo || {}) };
                    if (loteAtivoValido === 'Lote 1') delete m[grupoAtivoValido];   // tira a chave antiga, se houver
                    m[chaveItem(loteAtivoValido, grupoAtivoValido)] = parseInt(e.target.value) || 1;
                    return { ...p, lote_por_grupo: m };
                  })} />
                <Botao pequeno icone={mdiPuzzleOutline} onClick={dividirEmSubgrupos}
                  title="Unidades deste item com composições diferentes (ex.: 3 com giroflex, 2 com giroflex + cela)">
                  Dividir em subgrupos
                </Botao>
              </>)}
            </div>
            {!temSubgrupos && itemCalcAtivo && (
              <div className="acn-fp-divisor-txt">
                Total {fmtR(itemCalcAtivo.total.totVendas)} ÷ {itemCalcAtivo.qtd} = <strong>unitário {fmtR(itemCalcAtivo.unit.totVendas)}</strong>
              </div>
            )}
          </div>

          {/* ── LISTA DE ITENS (do Item do edital ativo) ── */}
          <div className="acn-fp-lista-itens-wrap">
            {/* Container com scroll — cada item é um cartão vertical (ver ItemRow),
                custo/impostos/markup ficam num painel expansível dentro do cartão */}
            <div className="acn-fp-lista-itens" style={{ height: tableHeight }}>
              {itensDoGrupo.length === 0 && (
                <div className="acn-fp-vazio">
                  Nenhum item neste Item do edital. Use o botão <strong>+ Adicionar Item</strong>, logo abaixo da lista.
                </div>
              )}
              {itensDoGrupo.map((item, idx) => (
                <ItemRow
                  key={item._id}
                  item={paramEfetivo(item)}
                  result={resultsDoGrupo[idx]}
                  onSet={(k, v) => setItem(item._id, k, v)}
                  onFill={(dados) => fillItem(item._id, dados)}
                  onExpand={(linhas) => expandItem(item._id, linhas)}
                  onRemove={() => remItem(item._id)}
                  usarParamsGlobais={usarGlobais}
                  onLiberarGlobais={liberarGlobais}
                  onLiberarMarkup={liberarMarkup}
                  usarMarkupGlobal={usarMarkupGlobal}
                  params={params}
                  isVendedor={isVendedor}
                />
              ))}
            </div>{/* fim scroll */}

            {/* ── Alça de resize ── */}
            <div className="acn-fp-alca" onMouseDown={startResize} title="Arraste para redimensionar">
              <div className="acn-fp-alca-marcas">
                {[0,1,2,3,4].map(i => (
                  <div key={i} />
                ))}
              </div>
            </div>

            {/* Contador + botão add abaixo da alça */}
            <div className="acn-fp-lista-rodape">
              <span className="acn-ajuda">
                {itensDoGrupo.length} item{itensDoGrupo.length !== 1 ? 'ns' : ''} em "{grupoAtivoValido}"{temSubgrupos ? ` › ${subAtivoValido}` : ''} · quantidades por 1 unidade · arraste a barra cinza para redimensionar
              </span>
              {/* O botao de adicionar item fica AQUI, colado na lista, e nao
                  la em cima junto dos botoes que agem sobre a formacao
                  inteira (salvar, versao final, carregar modelo): quem esta
                  montando o preco trabalha nesta altura da tela. */}
              <Botao variante="primario" icone={mdiPlus}
                onClick={addItem}
                title={'Adiciona uma linha em "' + grupoAtivoValido + '"'}>
                Adicionar Item
              </Botao>
            </div>
          </div>{/* fim wrapper resize */}

          {/* ── CALCULADORAS ── */}
          <div className="acn-fp-calcs">
            <CalcMarkupReverso />
            <CalcImpostoReverso />
          </div>

          {/* ── OBSERVAÇÕES ── */}
          <div className="acn-fp-bloco">
            <div className="acn-fp-bloco-tit">
              <Icone path={mdiNotebookEditOutline} size={14} /> Observações da Cotação
            </div>
            <textarea className="acn-input acn-fp-obs"
              placeholder="Condições comerciais, validade da proposta, notas sobre o lote..." />
          </div>

          {/* ── MODAIS ── */}
          {modalSalvar && (
            <ModalSalvar
              onSalvar={salvarModelo}
              onClose={() => setModalSalvar(false)}
              salvando={salvando}
              nomeInicial={nomeCotacao}
              tipoInicial={tipoCotacao || undefined}
              editando={!!editandoId}
              podeGerirCategorias={temPoderDeGerente(currentUser)}
            />
          )}
          {modalResumo && (
            <ResumoFormacaoModal
              estrutura={estrutura} isVendedor={isVendedor}
              titulo={nomeCotacao || rotulo || 'Formação de Preços'} categoria={tipoCotacao}
              versao={editandoId ? versaoAtual : null} multiplicador={lote}
              plataforma={plataformaSelecionada ? { nome: plataformaSelecionada.nome, desconto: descontoPlat, retencao: retencaoPlat, liquido: totalLiquidoPlat } : null}
              onClose={() => setModalResumo(false)}
            />
          )}
          {modalCarregar && (
            <ModalCarregar
              modelos={modelos}
              carregando={carregando}
              erro={erroModelos}
              onCarregar={carregarModelo}
              onExcluir={excluirModelo}
              onClose={() => setModalCarregar(false)}
            />
          )}

          {modalImportar && vinculo && (
            <ModalImportar
              modelos={modelos}
              carregando={carregando}
              erro={erroModelos}
              vinculo={vinculo}
              vinculoLabels={vinculoLabels}
              vinculosPorCotacao={vinculosPorCotacao}
              onImportar={importarEVincular}
              onClose={() => setModalImportar(false)}
            />
          )}

          {modalSenha && (
            <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) setModalSenha(false); }}>
              <div className="modal-box acn-modal-cadastro menor acn-fp-jan" role="dialog" aria-label="Confirmar Senha">
                <div className="acn-modal-cab">
                  <span className="modal-title"><Icone path={mdiLockOutline} size={18} />Confirmar Senha</span>
                </div>
                <div className="acn-modal-corpo acn-form-cheio">
                  <p className="acn-ajuda">
                    {statusCotacao === 'finalizada'
                      ? `Isso cria uma nova versão (v${versaoAtual + 1}) registrada em seu nome, mantendo a v${versaoAtual} intacta no histórico.`
                      : 'Isso registra esta formação como Versão 1 (final), com seu nome e a data/hora gravados para rastreabilidade.'}
                  </p>
                  <div>
                    <label className="acn-label">Sua senha *</label>
                    <input type="password" className="acn-input"
                      value={senhaConfirm} onChange={e => setSenhaConfirm(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') confirmarSenhaERegistrar(); }} />
                    {erroSenha && <div className="acn-fp-erro">{erroSenha}</div>}
                  </div>
                </div>
                <div className="acn-modal-rodape acn-sac-rodape">
                  <Botao variante="primario" icone={mdiCheck} disabled={registrandoVersao} onClick={confirmarSenhaERegistrar}>
                    {registrandoVersao ? 'Registrando...' : 'Confirmar'}
                  </Botao>
                  <Botao onClick={() => setModalSenha(false)}>Cancelar</Botao>
                </div>
              </div>
            </div>
          )}

          {modalHistorico && (
            <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) setModalHistorico(false); }}>
              <div className="modal-box acn-modal-cadastro acn-fp-jan acn-fp-hist-jan" role="dialog" aria-label="Histórico">
                <div className="acn-modal-cab">
                  <span className="modal-title"><Icone path={mdiHistory} size={18} />Histórico — {nomeCotacao}</span>
                </div>
                <div className="acn-modal-corpo">
                  {carregandoHistorico ? (
                    <div className="acn-fp-vazio">Carregando...</div>
                  ) : (
                    <>
                      <div className="acn-fp-hist-tit">Versões</div>
                      {historicoVersoes.length === 0 ? (
                        <div className="acn-ajuda">Nenhuma versão finalizada ainda.</div>
                      ) : (
                        <div className="acn-fp-pf-tabela">
                          <table className="acn-tabela acn-densa">
                            <thead>
                              <tr>
                                <th className="esq">Versão</th>
                                <th className="esq">Responsável</th>
                                <th className="esq">Data</th>
                                <th className="centro">Vencedora</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {historicoVersoes.map((v: any) => (
                                <tr key={v.id} className={v.id === editandoId ? 'acn-fp-hist-atual' : undefined}>
                                  <td className="acn-forte">v{v.versao}{v.id === editandoId ? ' (atual)' : ''}</td>
                                  <td>{v.finalizada_por_nome || '—'}</td>
                                  <td>{v.finalizada_em ? new Date(v.finalizada_em).toLocaleString('pt-BR') : '—'}</td>
                                  <td className="centro">{v.vencedora ? <Icone path={mdiTrophyOutline} size={15} /> : ''}</td>
                                  <td className="dir">
                                    {v.id !== editandoId && (
                                      <Botao variante="primario" pequeno
                                        onClick={async () => {
                                          const { data: full } = await supabase.from('cotacoes_precos').select('*').eq('id', v.id).single();
                                          if (full) { carregarModelo(full); setEditandoId(full.id); }
                                          setModalHistorico(false);
                                        }}>
                                        Abrir
                                      </Botao>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="acn-fp-hist-tit">Log de Alterações</div>
                      {historicoLogs.length === 0 ? (
                        <div className="acn-ajuda">Nenhuma alteração registrada.</div>
                      ) : (
                        <div>
                          {historicoLogs.map((l: any) => (
                            <div key={l.id} className="acn-fp-hist-log">
                              <div>{l.descricao}</div>
                              <div className="acn-ajuda">
                                <Icone path={mdiAccountOutline} size={12} /> {l.usuario_nome} · {new Date(l.criado_em).toLocaleString('pt-BR')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="acn-modal-rodape">
                  <Botao onClick={() => setModalHistorico(false)}>Fechar</Botao>
                </div>
              </div>
            </div>
          )}

          {modalVersoes && (() => {
            // Lista das versões ligadas a este processo, agrupadas por formação (a mais recente primeiro) e, dentro de cada uma, da maior versão para a menor.
            const grupos: Record<string, any[]> = {};
            formacoesVinculo.forEach((m: any) => { (grupos[raizDe(m)] ||= []).push(m); });
            const ordenados = Object.values(grupos)
              .map(g => [...g].sort((a: any, b: any) => (b.versao || 1) - (a.versao || 1)))
              .sort((a, b) => String(b[0]?.criado_em).localeCompare(String(a[0]?.criado_em)));
            return (
              <div className="modal-overlay acn-fp-overlay" onClick={e => { if (e.target === e.currentTarget) setModalVersoes(false); }}>
                <div className="modal-box acn-modal-cadastro acn-fp-jan acn-fp-hist-jan" role="dialog" aria-label="Versões da formação">
                  <div className="acn-modal-cab">
                    <span className="modal-title"><Icone path={mdiHistory} size={18} />Versões da formação</span>
                  </div>
                  <div className="acn-modal-corpo">
                    <div className="acn-ajuda">A versão final é a que abre primeiro e vale para o preço formado do card. Para trocar, use "Tornar final" na versão desejada (só versões finalizadas).</div>
                    {ordenados.map((g: any[]) => {
                      const final = versaoFinalDe(g);
                      return (
                        <div key={raizDe(g[0])} className="acn-fp-pf-tabela">
                          <table className="acn-tabela acn-densa">
                            <thead>
                              <tr>
                                <th className="esq">Versão</th><th className="esq">Autor</th><th className="esq">Data</th>
                                <th className="esq">Situação</th><th className="dir">Total de vendas</th><th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.map((m: any) => {
                                const tot = estruturaFormacao(m.itens || [], m.parametros_globais || {}, calcItem).geral.totVendas;
                                const ehFinal = final?.id === m.id;
                                return (
                                  <tr key={m.id} className={m.id === editandoId ? 'acn-fp-hist-atual' : undefined}>
                                    <td className="acn-forte">v{m.versao || 1}{(m.nome || '').trim() ? ' · ' + m.nome : ''}{m.id === editandoId ? ' (aberta)' : ''}</td>
                                    <td>{m.criado_por || '—'}</td>
                                    <td>{m.criado_em ? new Date(m.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                                    <td>
                                      {ehFinal && <Selo familia="atencao" ponto={false}><Icone path={mdiTrophyOutline} size={12} /> Final</Selo>}{' '}
                                      <Selo familia={m.status === 'finalizada' ? 'ok' : 'neutro'} ponto={false}>{m.status === 'finalizada' ? 'Finalizada' : 'Rascunho'}</Selo>
                                    </td>
                                    <td className="dir acn-num">{fmtR(tot)}</td>
                                    <td className="dir">
                                      <Botao pequeno icone={mdiEyeOutline} onClick={() => setResumoVersao(m)}>Resumo</Botao>{' '}
                                      {m.id !== editandoId && <Botao pequeno onClick={() => { setModalVersoes(false); trocarVersao(m.id); }}>Abrir</Botao>}{' '}
                                      {!ehFinal && m.status === 'finalizada' && <Botao pequeno variante="primario" icone={mdiTrophyOutline} onClick={() => tornarVersaoFinal(m)}>Tornar final</Botao>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                  <div className="acn-modal-rodape">
                    <Botao onClick={() => setModalVersoes(false)}>Fechar</Botao>
                  </div>
                </div>
              </div>
            );
          })()}
          {resumoVersao && (
            <ResumoFormacaoModal
              estrutura={estruturaFormacao(resumoVersao.itens || [], resumoVersao.parametros_globais || {}, calcItem)} isVendedor={isVendedor}
              titulo={resumoVersao.nome || rotulo || 'Formação de Preços'} categoria={categoriaDe(resumoVersao) === SEM_CATEGORIA ? '' : categoriaDe(resumoVersao)}
              versao={resumoVersao.versao || 1} multiplicador={1} plataforma={null}
              onClose={() => setResumoVersao(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
