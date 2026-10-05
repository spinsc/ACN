// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CENTRO DE CUSTO — componente único compartilhado (Fase 7)
// Antes existiam 3 implementações duplicadas de CRUD (AdminTab.tsx
// PainelCentrosCusto, ComprasTab.tsx modalGerCentros, FinanceiroTab.tsx
// ModalCentros), todas em lista plana, sem hierarquia. Este arquivo
// centraliza: helpers de árvore/hierarquia, um <select> reutilizável com
// indentação (CentroCustoSelect) para usar em formulários, e o painel de
// gestão completo (CentrosCustoManager) reaproveitado nos 3 lugares.
// Etapa 15a (05/10/2026): o painel de gestão, agora com a ficha completa do centro (tipo, empresa, responsável,
// vigência, orçamento mensal), mora em CentroCustoFicha.tsx — aqui ficam as regras e as peças que as outras telas usam.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { ehAdminOuGerente } from './utils/permissoes';
import { logChange } from './AuditSystem';
import { confirmar } from './Feedback';
import { hojeISO, Faixa } from './Interface';
import { AnexosDespesa } from './DespesaAnexos';
import { conferirMesesAbertos, mesDe, mesDoLancamento, mesDaCompra } from './CentroCustoFechamento';

export async function fetchCentrosCusto(incluirInativos = false) {
  let q = supabase.from('centros_custo').select('*').order('codigo');
  if (!incluirInativos) q = q.eq('ativo', true);
  const { data } = await q;
  return data || [];
}

// CÓDIGO DO CENTRO DE CUSTO — formato decidido com o usuário em 05/10/2026 (pergunta clicável):
//   raiz  = SIGLA-NNN           ex.: PROD-002   (a sigla é a área; NNN é o próximo número livre daquela sigla)
//   filho = CÓDIGO-DO-PAI.NN    ex.: PROD-002.01
// O sistema SUGERE o código ao criar e a pessoa pode editar. Ao trocar o código de um centro que já existe, o banco troca também o texto
// gravado nas compras, faturamentos, demandas e OPs (função renomear_codigo_centro_custo) — os códigos dos filhos NÃO mudam sozinhos.
const escaparRegex = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const siglaDoCodigo = (codigo: string) => (String(codigo || '').match(/^([A-Z]+)-/) || [])[1] || '';
export function sugerirCodigoCentro(centros: any[], parentId: string | null, sigla: string): string {
  if (parentId) {
    const pai = centros.find(c => c.id === parentId);
    if (!pai) return '';
    const re = new RegExp('^' + escaparRegex(pai.codigo) + '\\.(\\d+)$');
    const maior = Math.max(0, ...centros.map(c => Number((String(c.codigo).match(re) || [])[1] || 0)));
    return `${pai.codigo}.${String(maior + 1).padStart(2, '0')}`;
  }
  const s = String(sigla || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const re = new RegExp('^' + s + '-(\\d+)$');
  const maior = Math.max(0, ...centros.map(c => Number((String(c.codigo).match(re) || [])[1] || 0)));
  return `${s}-${String(maior + 1).padStart(3, '0')}`;
}

// Retorna a lista em ordem de árvore (pai imediatamente antes dos filhos),
// cada item com `nivel` (0 = raiz) para indentação visual.
export function ordenarArvore(centros: any[]) {
  const porPai: Record<string, any[]> = {};
  centros.forEach(c => { const p = c.parent_id || 'raiz'; (porPai[p] ||= []).push(c); });
  const resultado: any[] = [];
  const visitar = (paiId: string | null, nivel: number, visitados: Set<string>) => {
    (porPai[paiId || 'raiz'] || []).forEach(c => {
      if (visitados.has(c.id)) return; // guarda contra ciclo acidental
      resultado.push({ ...c, nivel });
      visitar(c.id, nivel + 1, new Set(visitados).add(c.id));
    });
  };
  visitar(null, 0, new Set());
  // Sobra: centros cujo parent_id aponta para algo fora da lista (órfão) —
  // mostra como raiz em vez de desaparecer silenciosamente.
  const idsColocados = new Set(resultado.map(c => c.id));
  centros.forEach(c => { if (!idsColocados.has(c.id)) resultado.push({ ...c, nivel: 0 }); });
  return resultado;
}

// "FLUTUANTE > PIER" — cadeia completa até a raiz, para exibir em badges e
// nos textos gravados como fallback (centro_custo texto livre).
export function labelHierarquico(centro: any, todosCentros: any[]) {
  const porId = Object.fromEntries(todosCentros.map(c => [c.id, c]));
  const cadeia: string[] = [];
  let atual = centro;
  let guarda = 0;
  while (atual && guarda++ < 10) {
    cadeia.unshift(atual.codigo);
    atual = atual.parent_id ? porId[atual.parent_id] : null;
  }
  return cadeia.join(' > ');
}

// Todos os ids de descendentes de um centro (filhos, netos, ...) — usado
// para "um pedido/despesa de um centro filho também conta no total do pai"
// nos relatórios (Financeiro, RelatoriosTab).
export function idsComDescendentes(centroId: string, todosCentros: any[]): string[] {
  const resultado = [centroId];
  const filhos = todosCentros.filter(c => c.parent_id === centroId);
  filhos.forEach(f => { idsComDescendentes(f.id, todosCentros).forEach(id => resultado.push(id)); });
  return resultado;
}

// ─── REGRAS DA FICHA DO CENTRO (Etapa 15a, 05/10/2026) ─────────────────────
// Empresas que o centro pode ter. Ponto de partida decidido com o usuário (as mesmas duas das OS do SAC);
// o campo grava texto livre, então acrescentar uma empresa é só incluí-la aqui.
export const EMPRESAS_CENTRO = ['ACN', 'DETECH'];

/** Vigência vencida ou ainda não começada (datas em AAAA-MM-DD, comparadas como texto — coluna *date*, sem new Date). */
export function foraDaVigencia(c: any, hoje: string = hojeISO()): boolean {
  const ini = c?.vigencia_inicio ? String(c.vigencia_inicio).slice(0, 10) : '';
  const fim = c?.vigencia_fim ? String(c.vigencia_fim).slice(0, 10) : '';
  return (!!ini && ini > hoje) || (!!fim && fim < hoje);
}

/** O centro pode receber um apontamento novo (compra, despesa, demanda)? Só agrupa → não; fora da vigência → não; inativo → não. */
export function centroDisponivel(c: any, hoje: string = hojeISO()): boolean {
  if (!c || c.ativo === false) return false;
  if (c.recebe_lancamento === false) return false;
  return !foraDaVigencia(c, hoje);
}

// A lista para escolher o centro de um apontamento, na ordem da árvore. Regra decidida com o usuário (15a):
//  • centro que só AGRUPA ou fora da vigência não é oferecido;
//  • o que JÁ está gravado no registro continua aparecendo (senão a tela mostraria outro centro no lugar);
//  • um pai que só agrupa continua na lista, desativado, quando algum filho pode receber — senão o filho perderia o recuo.
export function centrosParaApontar(centros: any[], valorAtual: string | null = null) {
  const hoje = hojeISO();
  const porId = Object.fromEntries(centros.map(c => [c.id, c]));
  const pode = (c: any) => centroDisponivel(c, hoje) || c.id === valorAtual;
  const visivel = new Set<string>();
  for (const c of centros) {
    if (!pode(c)) continue;
    let a = c, guarda = 0;
    while (a && !visivel.has(a.id) && guarda++ < 12) { visivel.add(a.id); a = a.parent_id ? porId[a.parent_id] : null; }
  }
  return ordenarArvore(centros.filter(c => visivel.has(c.id))).map(c => ({ ...c, bloqueado: !pode(c) }));
}
/** Por que um centro aparece desativado na lista de escolha. */
export const motivoBloqueio = (c: any) => c.recebe_lancamento === false ? 'só agrupa' : 'fora da vigência';

/** Lê um valor em reais digitado pela pessoa. "" → null; inválido → NaN. Aceita 1.234,56 · 1234,56 · 1234.56 · 12.000 (ponto de milhar). */
export function lerValorBR(txt: any): number | null {
  const s = String(txt ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!s) return null;
  // com vírgula, o ponto é milhar; sem vírgula, "12.000" é doze mil (padrão de milhar), mas "12.5" é doze e meio
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.'))
    : /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "Dividir igual": o valor anual em 12 partes, em centavos; a sobra de centavos vai toda para dezembro (a soma fecha exata). */
export function dividirAnualIgual(total: number): number[] {
  const cent = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cent / 12);
  const resto = cent - base * 12;
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? base + resto : base) / 100);
}

/**
 * O orçamento do centro mês a mês (12 valores) num ano. `linhas` são as linhas de centros_custo_orcamento DAQUELE ano.
 * Centro com orçamento próprio usa o que está digitado nele; pai em "soma dos filhos" soma os filhos ATIVOS (recursivo,
 * e cada filho vale pelo seu próprio modo). Mês sem linha conta como zero — e centro sem nenhuma linha fica sem alerta (15b).
 */
export function orcamentoDoCentro(centro: any, centros: any[], linhas: any[]): number[] {
  const proprio: Record<string, number[]> = {};
  for (const l of linhas || []) {
    const m = Number(l.mes);
    if (m >= 1 && m <= 12) (proprio[l.centro_id] ||= Array(12).fill(0))[m - 1] = Number(l.valor) || 0;
  }
  const calc = (c: any, visitados: Set<string>): number[] => {
    if (visitados.has(c.id)) return Array(12).fill(0); // guarda contra ciclo acidental
    if (c.orcamento_modo !== 'soma_filhos') return proprio[c.id] ? [...proprio[c.id]] : Array(12).fill(0);
    const soma = Array(12).fill(0);
    const v = new Set(visitados).add(c.id);
    centros.filter(f => f.parent_id === c.id && f.ativo !== false).forEach(f => calc(f, v).forEach((x, i) => { soma[i] += x; }));
    return soma;
  };
  return calc(centro, new Set()).map(v => Math.round(v * 100) / 100);
}

// ─── SELECT REUTILIZÁVEL (formulários de pedido/demanda) ──────────────────
export function CentroCustoSelect({ value, onChange, permitirNenhum = true, style, className }: any) {
  const [centros, setCentros] = useState<any[]>([]);
  useEffect(() => { fetchCentrosCusto().then(setCentros); }, []);
  const arvore = centrosParaApontar(centros, value || null);
  return (
    <select className={className} value={value || ''} onChange={e => onChange(e.target.value || null)}
      style={{ padding:'4px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, ...style }}>
      {permitirNenhum && <option value="">— Não informar —</option>}
      {arvore.map(c => (
        <option key={c.id} value={c.id} disabled={c.bloqueado}>{'　'.repeat(c.nivel)}{c.nivel>0?'└ ':''}{c.codigo} — {c.nome}{c.bloqueado ? ` (${motivoBloqueio(c)})` : (c.id === value && !centroDisponivel(c) ? ` (${motivoBloqueio(c)})` : '')}</option>
      ))}
    </select>
  );
}

// ─── LANÇAR DESPESA AVULSA ─────────────────────────────────────────────────
// "Parcelado" grava só o CONTRATO (valor:0, valor_total_negociado:X) — os
// pagamentos parciais em si (medições) são lançados depois, um a um, via
// ModalLancarMedicao (abaixo), a partir da lista de despesas do centro
// (ver ModalComprasCentro em FinanceiroTab.tsx). Ver plano "Pagamentos
// parcelados no Centro de Custo" — soma de despesas do centro já soma
// TODAS as linhas desta tabela, então o contrato (valor:0) não infla nada
// e cada medição conta como o pagamento real que é, sem mexer em nenhuma
// fórmula de totais existente.
// ─── EM QUANTAS VEZES (pedido do usuário em 29/09/2026) ───────────────────
// O contrato parcelado sabia o valor total, mas não em quantas vezes foi combinado — então a lista
// não conseguia dizer "pagas 2 de 6" nem sugerir o valor da próxima parcela. O número fica em
// `num_parcelas` (vazio = ainda não combinado; é o caso de todos os contratos anteriores).
// Não gera cronograma: as parcelas continuam sendo lançadas uma a uma como medições, na data em que
// são pagas — o número só serve de régua para conferir e sugerir o valor.
export const lerParcelas = (txt: any): { ok: boolean; n: number | null } => {
  const s = String(txt ?? '').trim();
  if (!s) return { ok: true, n: null };
  const n = Number(s);
  return Number.isInteger(n) && n >= 2 && n <= 120 ? { ok: true, n } : { ok: false, n: null };
};
export const MSG_PARCELAS = 'Em quantas vezes: informe um número inteiro de 2 a 120, ou deixe em branco se ainda não foi combinado.';

// escopo de módulo de propósito: declarado dentro de um modal, remontaria o campo a cada tecla
function CampoParcelas({ parcelas, onChange, total, feitas = 0 }: any) {
  const { ok, n } = lerParcelas(parcelas);
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="acn-label">Em quantas vezes?</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="acn-input" style={{ width: 72 }} inputMode="numeric" placeholder="ex: 6" aria-label="Número de parcelas"
          value={parcelas} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        {[2, 3, 4, 6, 10, 12].map(q => (
          <button key={q} type="button" onClick={() => onChange(String(q))}
            style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
              border: `1.5px solid ${n === q ? '#0f766e' : '#d1d5db'}`,
              background: n === q ? '#ccfbf1' : '#fff', color: n === q ? '#0f766e' : '#6b7280' }}>{q}x</button>
        ))}
      </div>
      {!ok && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 4 }}>{MSG_PARCELAS}</div>}
      {ok && n && total > 0 && (
        <div style={{ fontSize: 10, color: '#0f766e', marginTop: 4 }}>
          Cada parcela: <b>{moeda(total / n)}</b> ({moeda(total)} ÷ {n}). As parcelas entram depois, uma a uma, como medições.
        </div>
      )}
      {ok && !n && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Deixe em branco se ainda não foi combinado.</div>}
      {ok && feitas > 0 && (
        <div style={{ fontSize: 10, marginTop: 2, color: n && feitas > n ? '#b91c1c' : '#64748b' }}>
          Já lançadas: <b>{feitas}</b>{n ? ` de ${n}` : ''}{n && feitas > n ? ' — há mais medições do que parcelas combinadas.' : '.'}
        </div>
      )}
    </div>
  );
}

// ─── LANÇAR MEDIÇÃO (pagamento parcial contra um contrato "Parcelado") ────
export function ModalLancarMedicao({ contrato, currentUser, onClose, onSaved }: any) {
  const [jaPago, setJaPago]   = useState<number | null>(null);
  const [qtdFeitas, setQtdFeitas] = useState(0);
  const [valor, setValor]     = useState('');
  const [obs, setObs]         = useState('');
  const [data, setData]       = useState(() => hojeISO());
  const [salvando, setSalvando] = useState(false);

  const totalNegociado = Number(contrato.valor_total_negociado) || 0;
  const nParcelas = Number(contrato.num_parcelas) || 0;
  // valor sugerido da próxima parcela = o que falta pagar ÷ as parcelas que faltam (só quando o número foi combinado)
  const sugestao = (pago: number, feitas: number) =>
    nParcelas > feitas && totalNegociado > pago ? Math.round((totalNegociado - pago) / (nParcelas - feitas) * 100) / 100 : 0;

  useEffect(() => {
    supabase.from('centro_custo_despesas').select('valor').eq('despesa_pai_id', contrato.id)
      .then(({ data }) => {
        const pago = (data || []).reduce((s: number, r: any) => s + (Number(r.valor) || 0), 0);
        setJaPago(pago); setQtdFeitas((data || []).length);
        const s = sugestao(pago, (data || []).length);
        // só preenche se a pessoa ainda não digitou nada
        if (s > 0) setValor(v => v || s.toFixed(2).replace('.', ','));
      });
  }, [contrato.id]);

  const vNum = parseFloat(String(valor).replace(',', '.')) || 0;
  const somaComEsta = (jaPago || 0) + vNum;
  const excedente = somaComEsta - totalNegociado;
  const numeroDaParcela = qtdFeitas + 1;

  const salvar = async () => {
    if (!vNum || vNum <= 0) { alert('Informe um valor válido.'); return; }
    setSalvando(true);
    // Etapa 15e-2 (05/10/2026): a medição vale no mês da sua data; mês fechado não recebe (conferido no banco agora)
    const trava = await conferirMesesAbertos([mesDe(data)]);
    if (!trava.ok) { setSalvando(false); alert(trava.mensagem); return; }
    const { error } = await supabase.from('centro_custo_despesas').insert([{
      centro_custo_id: contrato.centro_custo_id, despesa_pai_id: contrato.id, valor: vNum,
      descricao: obs.trim() || (nParcelas ? `Parcela ${numeroDaParcela}/${nParcelas} — ${contrato.descricao || ''}` : `Medição — ${contrato.descricao || ''}`), data,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema',
    }]);
    setSalvando(false);
    if (error) { alert('Erro ao lançar medição: ' + error.message); return; }
    onSaved?.();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth:400 }}>
        <div className="modal-title">🧾 Lançar Medição — {contrato.descricao}</div>
        <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>
          Total negociado: <strong>R$ {totalNegociado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
          {' · '}Já pago: <strong>{jaPago == null ? '...' : `R$ ${jaPago.toLocaleString('pt-BR',{minimumFractionDigits:2})}`}</strong>
          {nParcelas > 0 && jaPago != null && (
            <div style={{ marginTop: 4, color: qtdFeitas >= nParcelas ? '#b45309' : '#0f766e', fontWeight: 700 }}>
              {qtdFeitas >= nParcelas
                ? `As ${nParcelas} parcelas combinadas já foram lançadas (${qtdFeitas}).`
                : `Parcela ${numeroDaParcela} de ${nParcelas}${sugestao(jaPago, qtdFeitas) > 0 ? ` — sugestão: R$ ${sugestao(jaPago, qtdFeitas).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''}`}
            </div>
          )}
        </div>
        <label className="acn-label">Valor desta Medição (R$) *</label>
        <input className="acn-input" style={{ width:'100%', marginBottom:6 }} placeholder="0,00" inputMode="decimal"
          value={valor} onChange={e => setValor(e.target.value)} autoFocus />
        {vNum > 0 && excedente > 0 && (
          <div style={{ fontSize:10, fontWeight:700, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:4, padding:'6px 8px', marginBottom:10 }}>
            ⚠️ Isso ultrapassa o valor total negociado em R$ {excedente.toLocaleString('pt-BR',{minimumFractionDigits:2})}.
          </div>
        )}
        <label className="acn-label">Observação</label>
        <textarea className="acn-input" rows={2} style={{ width:'100%', resize:'vertical', marginBottom:10, boxSizing:'border-box' }}
          placeholder={nParcelas ? `Ex: referente à etapa X (sem texto, vai como "Parcela ${numeroDaParcela}/${nParcelas}")` : 'Ex: 1ª parcela, referente à etapa X...'}
          value={obs} onChange={e => setObs(e.target.value)} />
        <label className="acn-label">Data</label>
        <input type="date" className="acn-input" style={{ width:'100%', marginBottom:14 }}
          value={data} onChange={e => setData(e.target.value)} />
        <div style={{ display:'flex', gap:8 }}>
          <button className="acn-btn" style={{ background:'#16a34a', flex:1 }} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '💾 Lançar Medição'}
          </button>
          <button className="acn-btn" style={{ background:'#94a3b8' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR / EXCLUIR UM LANÇAMENTO DO CENTRO DE CUSTO
//
// Pedido do usuário em 24/09/2026. Até aqui o lançamento era criado e nunca
// mais tocado: erro de valor, descrição trocada ou centro errado ficavam na
// conta para sempre, e o total do centro passava a mentir.
//
// Só Admin e gerentes, porque isto mexe em número que vira relatório e
// conciliação. Toda alteração e toda exclusão vão para a auditoria com o valor
// de antes e o de depois — o histórico é o que permite conferir depois.
//
// Trocar o centro de custo do lançamento é de propósito: "lancei no centro
// errado" é o engano mais comum, e sem isso a correção seria apagar e lançar
// de novo, perdendo quem lançou e quando.
// ─────────────────────────────────────────────────────────────────────────────
export const podeEditarLancamento = (u: any) => ehAdminOuGerente(u);

const moeda = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ModalEditarLancamento({ lancamento, jaPago = 0, medicoes = 0, currentUser, onClose, onSalvo }: any) {
  const eraContrato = !!lancamento?.parcelado;
  const ehMedicao = !!lancamento?.despesa_pai_id;
  // "Em quantas vezes?" abre com o número que já estava combinado (pedido do usuário em 29/09/2026)
  const [parcelas, setParcelas] = useState(String(lancamento?.num_parcelas || ''));
  const [descricao, setDescricao] = useState(lancamento?.descricao || '');
  const [valor, setValor] = useState(String(
    (eraContrato ? lancamento?.valor_total_negociado : lancamento?.valor) ?? '').replace('.', ','));
  const [data, setData] = useState(String(lancamento?.data || '').slice(0, 10));
  const [centroId, setCentroId] = useState(lancamento?.centro_custo_id || '');
  // Etapa 15d (05/10/2026): os campos novos do lançamento. Vazio continua vazio: despesa de antes não ganha competência sozinha (vale pelo mês da data).
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoria_id || '');
  const [fornecedor, setFornecedor] = useState(lancamento?.fornecedor || '');
  const [numeroNf, setNumeroNf] = useState(lancamento?.numero_nf || '');
  const [competencia, setCompetencia] = useState(String(lancamento?.competencia || '').slice(0, 7));
  const [categorias, setCategorias] = useState<any[]>([]);
  const [irmaos, setIrmaos] = useState<any[]>([]); // as outras partes, quando o lançamento é uma parte de um rateio
  useEffect(() => {
    supabase.from('centro_custo_categorias').select('*').order('ordem').order('nome').then(({ data: d }) => setCategorias(d || []));
    if (lancamento?.rateio_grupo_id) {
      supabase.from('centro_custo_despesas').select('id,centro_custo_id,valor,rateio_percentual').eq('rateio_grupo_id', lancamento.rateio_grupo_id).then(({ data: d }) => setIrmaos(d || []));
    }
  }, [lancamento?.id]);
  const [salvando, setSalvando] = useState(false);
  /**
   * À VISTA ↔ PARCELADO TAMBÉM NA EDIÇÃO (28/09/2026)
   *
   * A tela de lançar oferece a escolha; a de editar não oferecia. Quem lançava
   * uma despesa à vista e depois descobria que o fornecedor ia parcelar tinha
   * de excluir e lançar de novo — perdendo a data original e o registro de
   * quem lançou.
   *
   * Medição não muda de forma: ela é o pagamento de um contrato, não um
   * lançamento independente.
   */
  const [ehContrato, setEhContrato] = useState(eraContrato);
  const trocouForma = ehContrato !== eraContrato;
  // Etapa 15e-2 (05/10/2026): despesa de mês fechado não se edita nem se exclui. A tela avisa ao abrir; a conferência de verdade é no banco,
  // na hora de gravar (e também barra mudar a competência/data PARA um mês fechado). Falha ao ler o fechamento só avisa aqui; ao gravar, barra.
  const [travaMes, setTravaMes] = useState<any>(null);
  useEffect(() => { conferirMesesAbertos([mesDoLancamento(lancamento)]).then(r => setTravaMes(r.ok ? null : r)); }, [lancamento?.id]);
  const mesFechado = !!travaMes && !travaMes.falhaLeitura;

  const num = (v: any) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const v = num(valor);
  const abaixoDoPago = ehContrato && Number.isFinite(v) && jaPago > 0 && v < jaPago;
  const trocouCentro = centroId && centroId !== lancamento?.centro_custo_id;

  const salvar = async () => {
    if (!descricao.trim()) { alert('Informe a descrição.'); return; }
    if (!Number.isFinite(v) || v < 0) { alert('Informe um valor válido.'); return; }
    if (!data) { alert('Informe a data.'); return; }
    if (!centroId) { alert('Escolha o centro de custo.'); return; }
    const pp = lerParcelas(parcelas);
    if (ehContrato && !pp.ok) { alert(MSG_PARCELAS); return; }
    // o mês de onde sai e o mês para onde vai (competência; sem ela, a data): nenhum dos dois pode estar fechado
    const trava = await conferirMesesAbertos([mesDoLancamento(lancamento), competencia ? mesDe(competencia) : mesDe(data)]);
    if (!trava.ok) { alert(trava.mensagem); return; }
    // menos parcelas do que as medições já lançadas: pode ser renegociação ou erro de digitação — pergunta
    if (ehContrato && pp.n && medicoes > pp.n && !await confirmar(
      `Já existem ${medicoes} medições lançadas neste contrato, e você combinou ${pp.n} parcelas.\n\n` +
      `A lista vai mostrar "${medicoes} de ${pp.n}". Se foi renegociação, tudo bem. Salvar assim?`)) return;
    // contrato com total abaixo do já pago: avisa, mas deixa seguir — renegociar
    // para menos acontece (decidido com o usuário em 24/09/2026)
    if (abaixoDoPago && !await confirmar(
      `O total negociado (${moeda(v)}) ficou ABAIXO do que já foi pago (${moeda(jaPago)}).\n\n` +
      `O contrato vai aparecer com mais de 100% pago. Se foi renegociação, tudo bem. Salvar assim?`)) return;

    // virar contrato em despesa à vista com medições lançadas deixaria os
    // pagamentos sem contrato e o total do centro contaria o dinheiro duas
    // vezes — uma na despesa, outra em cada medição
    if (trocouForma && eraContrato && jaPago > 0) {
      alert(`Este contrato já tem ${moeda(jaPago)} em medições lançadas.\n\n`
        + `Para voltar a ser à vista, apague as medições primeiro — senão elas ficam sem contrato `
        + `e o centro de custo conta o mesmo dinheiro duas vezes.`);
      return;
    }
    if (trocouForma && !await confirmar(ehContrato
      ? `Transformar esta despesa à vista em CONTRATO PARCELADO?\n\n`
        + `${moeda(v)} passa a ser o total negociado, e os pagamentos entram depois como medições. `
        + `Até a primeira medição, o centro de custo vai mostrar este contrato com 0% pago.`
      : `Transformar este contrato em despesa À VISTA?\n\n`
        + `${moeda(v)} passa a contar direto no total do centro de custo.`)) return;

    setSalvando(true);
    const antes = {
      descricao: lancamento.descricao, data: lancamento.data, centro_custo_id: lancamento.centro_custo_id,
      valor: lancamento.valor, valor_total_negociado: lancamento.valor_total_negociado,
      parcelado: lancamento.parcelado, num_parcelas: lancamento.num_parcelas ?? null,
      categoria_id: lancamento.categoria_id ?? null, fornecedor: lancamento.fornecedor ?? null, numero_nf: lancamento.numero_nf ?? null, competencia: lancamento.competencia ?? null,
    };
    // no contrato o dinheiro mora em valor_total_negociado e `valor` fica 0 —
    // é o que faz o contrato não inflar a soma do centro (ver ModalLancarDespesa)
    const depois: any = { descricao: descricao.trim(), data, centro_custo_id: centroId };
    // só o que a pessoa mexeu (campo novo vazio fica como está; o texto vazio vira null)
    const compNova = competencia ? `${competencia}-01` : null, compAntiga = lancamento.competencia ? String(lancamento.competencia).slice(0, 10) : null;
    if ((categoriaId || null) !== (lancamento.categoria_id || null)) depois.categoria_id = categoriaId || null;
    if ((fornecedor.trim() || null) !== (lancamento.fornecedor || null)) depois.fornecedor = fornecedor.trim() || null;
    if ((numeroNf.trim() || null) !== (lancamento.numero_nf || null)) depois.numero_nf = numeroNf.trim() || null;
    if (compNova !== compAntiga) depois.competencia = compNova;
    if (ehContrato) { depois.parcelado = true;  depois.valor_total_negociado = v; depois.valor = 0; }
    else            { depois.parcelado = false; depois.valor = v; depois.valor_total_negociado = null; }
    // o número de parcelas é do contrato: a medição não tem, e virar à vista o zera
    if (!ehMedicao) depois.num_parcelas = ehContrato ? pp.n : null;

    const { error } = await supabase.from('centro_custo_despesas').update(depois).eq('id', lancamento.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: lancamento.id,
      changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
    onSalvo?.();
    onClose();
  };

  const excluir = async () => {
    const travaEx = await conferirMesesAbertos([mesDoLancamento(lancamento)]);
    if (!travaEx.ok) { alert(travaEx.mensagem); return; }
    const quanto = ehContrato ? lancamento.valor_total_negociado : lancamento.valor;
    const aviso = ehContrato && jaPago > 0
      ? `\n\nATENÇÃO: este contrato tem ${moeda(jaPago)} em medições lançadas. Elas NÃO são apagadas e vão ficar sem contrato — confira a lista depois.`
      : '';
    if (!await confirmar(
      `Excluir este lançamento?\n\n${lancamento.descricao}\n${moeda(quanto)} · ` +
      `${String(lancamento.data).slice(0, 10).split('-').reverse().join('/')}\n\n` +
      `O total do centro de custo muda na hora. Fica registrado na auditoria quem excluiu.${aviso}`)) return;
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_despesas').delete().eq('id', lancamento.id);
    setSalvando(false);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: lancamento.id,
      changeType: 'DELETE', oldRow: lancamento, newRow: null, user: currentUser });
    onSalvo?.();
    onClose();
  };

  // Rateio: apagar só uma parte deixaria as outras com a divisão errada; o caminho é apagar o rateio inteiro (todas as partes)
  const excluirRateio = async () => {
    const travaRat = await conferirMesesAbertos([mesDoLancamento(lancamento)]);
    if (!travaRat.ok) { alert(travaRat.mensagem); return; }
    const partes = irmaos.length || 1;
    const somaTotal = irmaos.reduce((s: number, x: any) => s + (Number(x.valor) || 0), 0);
    if (!await confirmar(`Excluir o rateio inteiro?\n\n${lancamento.descricao}\n${partes} parte(s), ${moeda(somaTotal)} no total.\n\nTodas as partes saem dos totais dos centros na hora. Fica registrado na auditoria quem excluiu.`)) return;
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_despesas').delete().eq('rateio_grupo_id', lancamento.rateio_grupo_id);
    setSalvando(false);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    irmaos.forEach((x: any) => logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: x.id, changeType: 'DELETE', oldRow: { ...lancamento, id: x.id, centro_custo_id: x.centro_custo_id, valor: x.valor }, newRow: null, user: currentUser }));
    onSalvo?.();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2300 }}
      onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-title">
          ✏️ Editar lançamento{eraContrato ? ' — contrato parcelado' : ehMedicao ? ' — medição' : ''}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Lançado por {lancamento.criado_por_nome || '—'}
          {lancamento.criado_em ? ` em ${new Date(lancamento.criado_em).toLocaleDateString('pt-BR')}` : ''}.
          A alteração fica na auditoria com o valor de antes.
        </div>
        {mesFechado && <div style={{ marginBottom: 10 }}><Faixa tom="atencao">{travaMes.mensagem.replace(' Nada foi gravado.', '')}</Faixa></div>}

        {/* Medição é o pagamento de um contrato, não um lançamento que possa
            mudar de forma — por isso a escolha não aparece para ela. */}
        {!ehMedicao && (
          <>
            <label className="acn-label">Forma</label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {([[false, 'À Vista'], [true, 'Parcelado']] as const).map(([v, label]) => (
                <button key={label} type="button" onClick={() => setEhContrato(v)}
                  style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                    border: `1.5px solid ${ehContrato === v ? '#0f766e' : '#d1d5db'}`,
                    background: ehContrato === v ? '#ccfbf1' : '#fff',
                    color: ehContrato === v ? '#0f766e' : '#6b7280' }}>
                  {label}
                </button>
              ))}
            </div>
            {trocouForma && (
              <div style={{ fontSize: 10, color: '#b45309', background: '#fffbeb',
                border: '1px solid #fcd34d', borderRadius: 5, padding: '6px 8px', marginBottom: 10 }}>
                {ehContrato
                  ? 'Vira contrato: o valor passa a ser o total negociado e os pagamentos entram depois como medições.'
                  : 'Vira despesa à vista: o valor passa a contar direto no total do centro de custo.'}
              </div>
            )}
          </>
        )}

        <label className="acn-label">Descrição *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 8 }} autoFocus
          value={descricao} onChange={e => setDescricao(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="acn-label">{ehContrato ? 'Valor total negociado (R$) *' : 'Valor (R$) *'}</label>
            <input className="acn-input" style={{ width: '100%' }} inputMode="decimal"
              value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="acn-label">Data *</label>
            <input type="date" className="acn-input" style={{ width: '100%' }}
              value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        {/* Em quantas vezes: só no contrato parcelado (medição é o pagamento de UMA parcela) */}
        {ehContrato && !ehMedicao && (
          <div style={{ marginTop: 8 }}>
            <CampoParcelas parcelas={parcelas} onChange={setParcelas} total={Number.isFinite(v) ? v : 0} feitas={medicoes} />
          </div>
        )}
        {ehContrato && jaPago > 0 && (
          <div style={{ fontSize: 10, color: abaixoDoPago ? '#b91c1c' : '#64748b', marginTop: 6 }}>
            Já lançado em medições: <b>{moeda(jaPago)}</b>
            {abaixoDoPago ? ' — o novo total fica abaixo disso, e o contrato vai passar de 100% pago.' : ''}
          </div>
        )}

        <label className="acn-label" style={{ marginTop: 8 }}>Centro de custo *</label>
        <CentroCustoSelect value={centroId} onChange={setCentroId} permitirNenhum={false} />
        {trocouCentro && (
          <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>
            O valor sai do centro atual e entra no novo — os dois totais mudam.
          </div>
        )}

        {/* Etapa 15d: categoria, competência, fornecedor, NF, comprovante e o aviso do rateio */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label className="acn-label">Categoria</label>
            <select className="acn-input" style={{ width: '100%' }} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
              <option value="">— Sem categoria —</option>
              {categorias.filter((c: any) => c.ativo || c.id === categoriaId).map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? '' : ' (desativada)'}</option>)}
            </select>
          </div>
          <div>
            <label className="acn-label">Competência (mês)</label>
            <input type="month" className="acn-input" style={{ width: '100%' }} value={competencia} onChange={e => setCompetencia(e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Fornecedor</label>
            <input className="acn-input" style={{ width: '100%' }} value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
          </div>
          <div>
            <label className="acn-label">Nº da NF</label>
            <input className="acn-input" style={{ width: '100%' }} value={numeroNf} onChange={e => setNumeroNf(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Sem competência, a despesa conta no mês da data (como as de antes).</div>
        {lancamento?.rateio_grupo_id && (
          <div style={{ fontSize: 11, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: '6px 8px', marginTop: 8 }}>
            Esta despesa é uma parte de um <b>rateio</b>{irmaos.length ? ` (${irmaos.length} partes: ${irmaos.map((x: any) => `${x.centro_custo_id === lancamento.centro_custo_id ? 'esta' : 'outra'} ${moeda(x.valor)}${x.rateio_percentual != null ? ` · ${String(Number(x.rateio_percentual)).replace('.', ',')}%` : ''}`).join(' | ')})` : ''}.
            Mudar o valor ou o centro de uma parte não refaz as outras.
          </div>
        )}
        <label className="acn-label" style={{ marginTop: 8 }}>Comprovante</label>
        <AnexosDespesa despesaId={lancamento.id} currentUser={currentUser} podeEditar />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="acn-btn" style={{ background: '#dc2626' }} disabled={salvando || mesFechado} onClick={excluir}>
            Excluir
          </button>
          {lancamento?.rateio_grupo_id && (
            <button className="acn-btn" style={{ background: '#b91c1c' }} disabled={salvando || mesFechado} onClick={excluirRateio} title="Apaga todas as partes do rateio">
              Excluir o rateio todo
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="acn-btn" style={{ background: '#16a34a' }} disabled={salvando || mesFechado} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR UM PEDIDO DE COMPRA A PARTIR DO CENTRO DE CUSTO (28/09/2026)
//
// A lista de compras de um centro mistura duas coisas: os lançamentos do
// próprio centro (despesa avulsa, contrato, medição) e os PEDIDOS DE COMPRA que
// foram alocados naquele centro. Os primeiros já tinham botão de editar; os
// pedidos não tinham ação nenhuma, e é justamente neles que o erro aparece —
// pedido lançado no centro errado, ou com valor diferente do que foi pago.
//
// Aqui se corrige o que é da conta do Financeiro: o centro, o valor, a
// descrição e a data. Fornecedor, cotação, aprovação e Ordem de Compra
// continuam sendo do módulo de Compras, porque lá eles têm fluxo e histórico
// próprios — duplicar isso aqui criaria duas verdades.
// ─────────────────────────────────────────────────────────────────────────────
export function ModalEditarPedidoCompra({ pedido, currentUser, onClose, onSalvo }: any) {
  const [descricao, setDescricao] = useState(pedido?.descricao_material || '');
  const [valor, setValor] = useState(String(pedido?.valor_compra ?? '').replace('.', ','));
  const [data, setData] = useState(String(pedido?.data_solicitacao || '').slice(0, 10));
  const [centroId, setCentroId] = useState(pedido?.centro_custo_id || '');
  const [salvando, setSalvando] = useState(false);
  // Etapa 15e-2 (05/10/2026): compra criada num mês fechado não tem valor, centro nem data corrigidos por aqui (o mês é o da criação).
  // A tela avisa ao abrir; a conferência de verdade é no banco, na hora de gravar.
  const [travaMes, setTravaMes] = useState<any>(null);
  useEffect(() => { conferirMesesAbertos([mesDaCompra(pedido)]).then(r => setTravaMes(r.ok ? null : r)); }, [pedido?.id]);
  const mesFechado = !!travaMes && !travaMes.falhaLeitura;

  const num = (v: any) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const v = num(valor);
  const trocouCentro = (centroId || null) !== (pedido?.centro_custo_id || null);

  const salvar = async () => {
    if (!descricao.trim()) { alert('Informe a descrição do material.'); return; }
    if (valor !== '' && (!Number.isFinite(v) || v < 0)) { alert('Informe um valor válido.'); return; }
    setSalvando(true);
    const trava = await conferirMesesAbertos([mesDaCompra(pedido)]);
    if (!trava.ok) { setSalvando(false); alert(trava.mensagem); return; }
    const antes = {
      descricao_material: pedido.descricao_material, valor_compra: pedido.valor_compra,
      data_solicitacao: pedido.data_solicitacao, centro_custo_id: pedido.centro_custo_id,
    };
    const depois: any = {
      descricao_material: descricao.trim(),
      valor_compra: valor === '' ? null : v,
      centro_custo_id: centroId || null,
    };
    if (data) depois.data_solicitacao = data;
    const { error } = await supabase.from('pcp_pedidos_compra').update(depois).eq('id', pedido.id);
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    logChange({ module: 'financeiro', entityType: 'pcp_pedidos_compra', entityId: pedido.id,
      changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
    onSalvo?.();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2300 }}
      onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-title">🛒 Editar pedido de compra — {pedido.numero_pedido || '—'}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>
          Fornecedor {pedido.fornecedor || '—'} · status {pedido.status_compra || '—'}
          {pedido.numero_oc ? ` · OC ${pedido.numero_oc}` : ''}.
          A alteração fica na auditoria com o valor de antes.
        </div>
        {mesFechado && <div style={{ marginBottom: 10 }}><Faixa tom="atencao">{travaMes.mensagem.replace(' Nada foi gravado.', '')}</Faixa></div>}

        <label className="acn-label">Descrição do material *</label>
        <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
          value={descricao} onChange={e => setDescricao(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="acn-label">Valor da compra (R$)</label>
            <input className="acn-input" style={{ width: '100%' }} inputMode="decimal"
              value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="acn-label">Data</label>
            <input type="date" className="acn-input" style={{ width: '100%' }}
              value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <label className="acn-label" style={{ marginTop: 8 }}>Centro de custo</label>
        <CentroCustoSelect value={centroId} onChange={setCentroId} permitirNenhum={true} />
        {trocouCentro && (
          <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>
            O valor sai do centro atual e entra no novo — os dois totais mudam.
          </div>
        )}

        <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 10, background: '#f8fafc',
          border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
          Fornecedor, cotação, aprovação e Ordem de Compra são alterados no módulo de Compras,
          onde cada um tem o seu fluxo e o seu histórico.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="acn-btn" style={{ background: '#16a34a' }} disabled={salvando || mesFechado} onClick={salvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
