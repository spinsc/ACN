// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LANÇAMENTO DE DESPESA DO CENTRO DE CUSTO — mais completo (Etapa 15d do ux-fluxo, 05/10/2026)
//
// A despesa avulsa só tinha valor, descrição e data. O usuário pediu "o mais completo possível, mas simples de usar": agora ela
// pode ter CATEGORIA (lista configurável), FORNECEDOR, NÚMERO DA NF, DATA DE COMPETÊNCIA (o mês a que pertence, separado da data do
// pagamento), ANEXO do comprovante, ser RECORRENTE (aluguel, internet… — com o botão "Lançar as recorrentes do mês") e ter RATEIO
// entre centros (ex.: 60% / 40%; a soma tem de dar 100% e o valor se divide sem sobrar nem faltar centavo).
//
// Decisões da etapa (registradas no plano):
//  • o rateio vale só para DESPESA AVULSA À VISTA (a compra continua com um centro só; contrato parcelado não ratea — as medições
//    de um contrato teriam de seguir a divisão e isso é outro desenho); recorrente também é só à vista;
//  • a competência é sempre o PRIMEIRO dia do mês; despesa sem competência (as de antes) vale pelo mês da data;
//  • a sobra de centavos do rateio vai para a parte de MAIOR percentual (a primeira, se empatar), para a soma fechar exata.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Chips, Selo, Faixa, diaBR, hojeISO } from './Interface';
import { centrosParaApontar, motivoBloqueio, lerValorBR, lerParcelas, MSG_PARCELAS, fetchCentrosCusto } from './CentroCustoShared';
import { EscolherAnexos } from './ComprasFluxo';
import { enviarAnexosDespesa } from './DespesaAnexos';
import { ehAdminOuGerente } from './utils/permissoes';
import { conferirMesesAbertos, mesDe } from './CentroCustoFechamento';
import { mdiPlus, mdiTrashCanOutline, mdiRefresh } from '@mdi/js';

export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const p2 = (n: number) => String(n).padStart(2, '0');
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const reais = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCampo = (v: any) => String(v).replace('.', ',');
export const ultimoDiaDoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

// ─── RATEIO ───────────────────────────────────────────────────────────────────
export type ParteRateio = { centroId: string; percentual: number };

/** Divide `total` entre as partes, em centavos: cada uma leva o seu percentual (para baixo) e a SOBRA vai para a de maior percentual. A soma fecha exata. */
export function ratearValor(total: number, partes: ParteRateio[]) {
  const cent = Math.round((Number(total) || 0) * 100);
  const base = partes.map(p => Math.floor(cent * p.percentual / 100 + 1e-9));
  const resto = cent - base.reduce((a, b) => a + b, 0);
  let maior = 0;
  partes.forEach((p, i) => { if (p.percentual > partes[maior].percentual) maior = i; });
  base[maior] += resto;
  return partes.map((p, i) => ({ ...p, valor: base[i] / 100 }));
}

/** O que falta para o rateio valer (texto para a pessoa) ou null. Percentual vazio ou inválido chega como null/NaN. */
export function validarRateio(partes: Array<{ centroId: string; percentual: number | null }>): string | null {
  if (!partes || partes.length < 2) return 'Para ratear, escolha pelo menos dois centros.';
  if (partes.some(p => !p.centroId)) return 'Escolha o centro de cada parte do rateio.';
  if (new Set(partes.map(p => p.centroId)).size !== partes.length) return 'O mesmo centro aparece duas vezes no rateio.';
  if (partes.some(p => p.percentual == null || !Number.isFinite(p.percentual) || p.percentual <= 0)) return 'Informe o percentual de cada parte (maior que zero).';
  const soma = r2(partes.reduce((s, p) => s + (p.percentual as number), 0) * 1000) / 1000;
  if (Math.abs(soma - 100) > 0.0005) return `Os percentuais somam ${String(soma).replace('.', ',')}% — precisam somar 100%.`;
  return null;
}

/** Percentuais iguais para n partes (a sobra de milésimos vai para a última): 3 → 33,333 · 33,333 · 33,334. */
export function percentuaisIguais(n: number): string[] {
  const base = Math.floor(100 / n * 1000) / 1000;
  return Array.from({ length: n }, (_, i) => paraCampo(i === n - 1 ? r2((100 - base * (n - 1)) * 1000) / 1000 : base));
}

const novoUuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

/** As linhas de despesa que um lançamento gera: uma, ou uma por parte do rateio (todas no mesmo grupo). `base` = os campos comuns. */
export function montarLinhasDespesa({ base, valor, centroId, partes }: { base: any; valor: number; centroId: string; partes?: ParteRateio[] | null }) {
  if (!partes || !partes.length) return [{ ...base, centro_custo_id: centroId, valor: r2(valor) }];
  const grupo = novoUuid();
  return ratearValor(valor, partes).map(p => ({ ...base, centro_custo_id: p.centroId, valor: p.valor, rateio_grupo_id: grupo, rateio_percentual: p.percentual }));
}

const opcoesCentro = (centros: any[], atual: string | null) => centrosParaApontar(centros, atual || null);
const rotuloOpcao = (c: any) => `${'　'.repeat(c.nivel)}${c.nivel > 0 ? '└ ' : ''}${c.codigo} — ${c.nome}${c.bloqueado ? ` (${motivoBloqueio(c)})` : ''}`;

// ─── A JANELA DE LANÇAR DESPESA ───────────────────────────────────────────────
export function ModalLancarDespesa({ centro, currentUser, onClose, onSalvo }: any) {
  const [forma, setForma] = useState<'vista' | 'parcelado'>('vista');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(() => hojeISO());
  const [competencia, setCompetencia] = useState(() => hojeISO().slice(0, 7));
  const [compManual, setCompManual] = useState(false);          // enquanto a pessoa não mexe, a competência acompanha o mês da data
  const [categoriaId, setCategoriaId] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [numeroNf, setNumeroNf] = useState('');
  const [parcelas, setParcelas] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  const [ratear, setRatear] = useState(false);
  const [partes, setPartes] = useState<Array<{ centroId: string; pct: string }>>([{ centroId: centro.id, pct: '60' }, { centroId: '', pct: '40' }]);
  const [recorrente, setRecorrente] = useState(false);
  const [dia, setDia] = useState('');
  const [ate, setAte] = useState('');
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from('centro_custo_categorias').select('*').order('ordem').order('nome').then(({ data: d }) => setCategorias((d || []).filter((c: any) => c.ativo)));
    fetchCentrosCusto().then(setCentros);
  }, []);
  useEffect(() => { if (!compManual) setCompetencia(String(data || '').slice(0, 7)); }, [data, compManual]);

  const v = lerValorBR(valor);
  const vOk = v !== null && Number.isFinite(v) && v > 0;
  const ehParcelado = forma === 'parcelado';
  const parcelasLidas = lerParcelas(parcelas);
  const partesNum = partes.map(p => ({ centroId: p.centroId, percentual: lerValorBR(p.pct) }));
  const somaPct = r2(partesNum.reduce((s, p) => s + (Number.isFinite(p.percentual as number) ? (p.percentual as number) : 0), 0) * 1000) / 1000;
  const previa = ratear && vOk && !validarRateio(partesNum) ? ratearValor(v as number, partesNum as ParteRateio[]) : null;

  const trocarForma = (f: 'vista' | 'parcelado') => { setForma(f); if (f === 'parcelado') { setRatear(false); setRecorrente(false); } };
  const setParte = (i: number, k: 'centroId' | 'pct', val: string) => setPartes(ps => ps.map((p, j) => (j === i ? { ...p, [k]: val } : p)));

  const salvar = async () => {
    setErro('');
    if (!vOk) { setErro(ehParcelado ? 'Informe o valor total negociado.' : 'Informe um valor válido (maior que zero).'); return; }
    if (!descricao.trim()) { setErro('Informe a descrição da despesa.'); return; }
    if (!data) { setErro('Informe a data.'); return; }
    if (!/^\d{4}-\d{2}$/.test(competencia)) { setErro('Informe o mês de competência.'); return; }
    if (ehParcelado && !parcelasLidas.ok) { setErro(MSG_PARCELAS); return; }
    if (ratear) { const f = validarRateio(partesNum); if (f) { setErro(f); return; } }
    let diaNum = 0;
    if (recorrente) {
      diaNum = Number(dia || data.slice(8, 10));
      if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31) { setErro('Em que dia do mês a despesa se repete? Informe um número de 1 a 31.'); return; }
      if (ate && ate < `${competencia}-01`) { setErro('A recorrência não pode terminar antes de começar: confira a data final.'); return; }
    }

    setSalvando(true);
    // Etapa 15e-2 (05/10/2026): mês fechado não recebe despesa — conferido no banco AGORA, antes de criar qualquer coisa (nem a recorrência)
    const trava = await conferirMesesAbertos([mesDe(competencia)]);
    if (!trava.ok) { setSalvando(false); setErro(trava.mensagem); return; }
    const quem = { criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema' };
    // 1) o modelo da recorrência, quando for o caso (o lançamento deste mês já nasce ligado a ele, para o botão do mês não lançar de novo)
    let recId: string | null = null;
    if (recorrente) {
      const { data: rec, error: errRec } = await supabase.from('centro_custo_recorrencias').insert([{
        descricao: descricao.trim(), valor: r2(v as number),
        centro_custo_id: ratear ? null : centro.id,
        rateio: ratear ? partesNum.map(p => ({ centro_custo_id: p.centroId, percentual: p.percentual })) : null,
        categoria_id: categoriaId || null, fornecedor: fornecedor.trim() || null,
        dia_do_mes: diaNum, inicio: `${competencia}-01`, fim: ate || null, ativo: true,
        criado_por: quem.criado_por, criado_por_nome: quem.criado_por_nome,
      }]).select('id').single();
      if (errRec || !rec) { setSalvando(false); setErro('Não foi possível criar a recorrência: ' + (errRec?.message || 'o banco não devolveu o registro')); return; }
      recId = rec.id;
    }
    // 2) as linhas da despesa
    const base: any = {
      descricao: descricao.trim(), data, competencia: `${competencia}-01`,
      categoria_id: categoriaId || null, fornecedor: fornecedor.trim() || null, numero_nf: numeroNf.trim() || null,
      recorrencia_id: recId, ...quem,
    };
    let linhas: any[];
    if (ehParcelado) linhas = [{ ...base, centro_custo_id: centro.id, valor: 0, valor_total_negociado: v, parcelado: true, num_parcelas: parcelasLidas.n }];
    else linhas = montarLinhasDespesa({ base, valor: v as number, centroId: centro.id, partes: ratear ? partesNum as ParteRateio[] : null });
    const { data: criadas, error } = await supabase.from('centro_custo_despesas').insert(linhas).select('id,centro_custo_id');
    if (error || !criadas?.length) {
      // não deixa uma recorrência sem lançamento (a que acabou de ser criada aqui) para trás
      if (recId) await supabase.from('centro_custo_recorrencias').delete().eq('id', recId);
      setSalvando(false); setErro('Erro ao lançar a despesa: ' + (error?.message || 'o banco não devolveu o registro')); return;
    }
    criadas.forEach((c: any, i: number) => logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: c.id, changeType: 'CREATE', newRow: linhas[i], user: currentUser }));
    // 3) o comprovante (sobe uma vez e vale para todas as partes do rateio)
    const errosAnexo = anexos.length ? await enviarAnexosDespesa(criadas.map((c: any) => c.id), anexos, currentUser) : [];
    setSalvando(false);
    const resumo = ehParcelado ? 'Contrato parcelado criado! Lance as medições (pagamentos) depois, na lista de despesas do centro.'
      : ratear ? `Despesa lançada e dividida entre ${linhas.length} centros.` : 'Despesa lançada!';
    mostrarAviso(resumo + (recorrente ? ' Ela passa a repetir todo mês (veja "Despesas recorrentes").' : ''), 'ok');
    if (errosAnexo.length) mostrarAviso('A despesa foi lançada, mas o anexo não subiu: ' + errosAnexo.join(' · '), 'atencao');
    onSalvo?.();
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }}>
      <div className="modal-box acn-modal-cadastro acn-cc-desp" role="dialog" aria-label={`Lançar despesa no centro ${centro.codigo}`}>
        <div className="acn-modal-cab"><span className="modal-title">Lançar despesa — {centro.codigo}</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">{centro.nome}</div>
          <Chips rotulo="Forma de pagamento" ativo={forma} onChange={f => trocarForma(f as any)} itens={[{ id: 'vista', rotulo: 'À vista' }, { id: 'parcelado', rotulo: 'Parcelado' }]} />

          <div className="acn-cc-linha">
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-valor">{ehParcelado ? 'Valor total negociado (R$) *' : 'Valor (R$) *'}</label>
              <input id="dp-valor" className="acn-input" inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-data">Data do lançamento *</label>
              <input id="dp-data" className="acn-input" type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-comp">Competência (mês) *</label>
              <input id="dp-comp" className="acn-input" type="month" value={competencia} onChange={e => { setCompManual(true); setCompetencia(e.target.value); }} />
            </div>
          </div>
          {ehParcelado && <div className="acn-ajuda">Isso só registra o valor combinado. Os pagamentos parciais (medições) são lançados depois, um a um.</div>}
          <div className="acn-ajuda">A competência é o mês a que a despesa pertence (e em que ela conta no orçamento do centro); a data é quando foi lançada ou paga.</div>

          <div className="form-group">
            <label className="acn-label" htmlFor="dp-desc">Descrição *</label>
            <textarea id="dp-desc" className="acn-input" rows={2} placeholder="Ex: Manutenção do compressor, material extra..." value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          <div className="acn-cc-linha">
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-cat">Categoria</label>
              <select id="dp-cat" className="acn-input" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                <option value="">— Sem categoria —</option>
                {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-forn">Fornecedor</label>
              <input id="dp-forn" className="acn-input" placeholder="Quem recebeu o pagamento" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-nf">Nº da NF</label>
              <input id="dp-nf" className="acn-input" placeholder="Número da nota" value={numeroNf} onChange={e => setNumeroNf(e.target.value)} />
            </div>
          </div>

          {ehParcelado && (
            <div className="form-group">
              <label className="acn-label" htmlFor="dp-parc">Em quantas vezes?</label>
              <div className="acn-acoes-linha quebra">
                <input id="dp-parc" className="acn-input acn-cc-parc" inputMode="numeric" placeholder="ex: 6" aria-label="Número de parcelas" value={parcelas} onChange={e => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                {[2, 3, 4, 6, 10, 12].map(q => <Botao key={q} pequeno variante={parcelasLidas.n === q ? 'primario' : 'secundario'} aria-pressed={parcelasLidas.n === q} onClick={() => setParcelas(String(q))}>{q}x</Botao>)}
              </div>
              {!parcelasLidas.ok && <div className="acn-txt-erro">{MSG_PARCELAS}</div>}
              {parcelasLidas.ok && parcelasLidas.n && vOk && <div className="acn-ajuda">Cada parcela: <strong>{reais((v as number) / parcelasLidas.n)}</strong> ({reais(v as number)} ÷ {parcelasLidas.n}). As parcelas entram depois, uma a uma, como medições.</div>}
              {parcelasLidas.ok && !parcelasLidas.n && <div className="acn-ajuda">Deixe em branco se ainda não foi combinado.</div>}
            </div>
          )}

          <div className="form-group">
            <label className="acn-label">Comprovante (opcional)</label>
            <EscolherAnexos arquivos={anexos} onChange={setAnexos} />
          </div>

          {!ehParcelado && (
            <div className="acn-quadro">
              <label className={'acn-sac-opcao' + (ratear ? ' on' : '')}>
                <input type="checkbox" checked={ratear} onChange={e => setRatear(e.target.checked)} />
                Ratear entre centros
              </label>
              {ratear && (<>
                <div className="acn-ajuda">O valor se divide entre os centros pelos percentuais (soma 100%); cada centro recebe a sua parte como uma despesa, ligadas entre si. A sobra de centavos vai para a maior parte.</div>
                {partes.map((p, i) => (
                  <div key={i} className="acn-cc-parte">
                    <select className="acn-input" value={p.centroId} onChange={e => setParte(i, 'centroId', e.target.value)} aria-label={`Centro da parte ${i + 1}`}>
                      <option value="">— escolher o centro —</option>
                      {opcoesCentro(centros, p.centroId).map(c => <option key={c.id} value={c.id} disabled={c.bloqueado}>{rotuloOpcao(c)}</option>)}
                    </select>
                    <input className="acn-input acn-cc-pct" inputMode="decimal" value={p.pct} onChange={e => setParte(i, 'pct', e.target.value)} aria-label={`Percentual da parte ${i + 1}`} />
                    <span className="acn-fraco">%</span>
                    <span className="acn-cc-parte-valor acn-nowrap">{previa ? reais(previa[i].valor) : ''}</span>
                    <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Remover a parte ${i + 1}`} title="Remover" disabled={partes.length <= 2} onClick={() => setPartes(ps => ps.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <div className="acn-acoes-linha quebra">
                  <Botao pequeno icone={mdiPlus} onClick={() => setPartes(ps => [...ps, { centroId: '', pct: '' }])}>Outro centro</Botao>
                  <Botao pequeno onClick={() => { const q = percentuaisIguais(partes.length); setPartes(ps => ps.map((p, i) => ({ ...p, pct: q[i] }))); }}>Dividir igual</Botao>
                  <span className={Math.abs(somaPct - 100) < 0.0005 ? 'acn-txt-ok' : 'acn-txt-erro'}>Soma: {String(somaPct).replace('.', ',')}%{Math.abs(somaPct - 100) < 0.0005 ? ' ✓' : ''}</span>
                </div>
              </>)}
            </div>
          )}

          {!ehParcelado && (
            <div className="acn-quadro">
              <label className={'acn-sac-opcao' + (recorrente ? ' on' : '')}>
                <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} />
                Repetir todo mês (aluguel, internet…)
              </label>
              {recorrente && (<>
                <div className="acn-cc-linha">
                  <div className="form-group">
                    <label className="acn-label" htmlFor="dp-dia">Dia do mês</label>
                    <input id="dp-dia" className="acn-input" inputMode="numeric" placeholder={data.slice(8, 10)} value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </div>
                  <div className="form-group">
                    <label className="acn-label" htmlFor="dp-ate">Repetir até (opcional)</label>
                    <input id="dp-ate" className="acn-input" type="date" value={ate} onChange={e => setAte(e.target.value)} />
                  </div>
                </div>
                <div className="acn-ajuda">Esta despesa vale para o mês escolhido; os próximos meses entram quando alguém usar "Lançar as recorrentes do mês" (Despesas recorrentes), sem duplicar. Mês curto: o dia 31 vira o último dia.</div>
              </>)}
            </div>
          )}

          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : ehParcelado ? 'Criar contrato' : 'Lançar despesa'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── DESPESAS RECORRENTES ─────────────────────────────────────────────────────
function FormRecorrencia({ rec, categorias, currentUser, onClose, onSalvo }: any) {
  const [descricao, setDescricao] = useState(rec.descricao || '');
  const [valor, setValor] = useState(paraCampo(Number(rec.valor).toFixed(2)));
  const [dia, setDia] = useState(String(rec.dia_do_mes));
  const [fim, setFim] = useState(rec.fim || '');
  const [categoriaId, setCategoriaId] = useState(rec.categoria_id || '');
  const [fornecedor, setFornecedor] = useState(rec.fornecedor || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setErro('');
    const v = lerValorBR(valor); const d = Number(dia);
    if (!descricao.trim()) { setErro('Informe a descrição.'); return; }
    if (v === null || !Number.isFinite(v) || v <= 0) { setErro('Informe um valor maior que zero.'); return; }
    if (!Number.isInteger(d) || d < 1 || d > 31) { setErro('O dia do mês vai de 1 a 31.'); return; }
    if (fim && fim < rec.inicio) { setErro('A recorrência não pode terminar antes de começar.'); return; }
    const depois = { descricao: descricao.trim(), valor: r2(v), dia_do_mes: d, fim: fim || null, categoria_id: categoriaId || null, fornecedor: fornecedor.trim() || null };
    setSalvando(true);
    const { error } = await supabase.from('centro_custo_recorrencias').update(depois).eq('id', rec.id);
    setSalvando(false);
    if (error) { setErro('Não foi possível salvar: ' + error.message); return; }
    const antes = { descricao: rec.descricao, valor: Number(rec.valor), dia_do_mes: rec.dia_do_mes, fim: rec.fim || null, categoria_id: rec.categoria_id || null, fornecedor: rec.fornecedor || null };
    logChange({ module: 'financeiro', entityType: 'centro_custo_recorrencias', entityId: rec.id, changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
    onSalvo(); onClose();
  };
  return (
    <div className="modal-overlay" style={{ zIndex: 2700 }}>
      <div className="modal-box acn-modal-cadastro menor" role="dialog" aria-label="Editar despesa recorrente">
        <div className="acn-modal-cab"><span className="modal-title">Editar despesa recorrente</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">Vale daqui para frente: o que já foi lançado não muda. Para trocar o centro (ou o rateio), pause esta e crie outra.</div>
          <div className="form-group"><label className="acn-label" htmlFor="rc-desc">Descrição *</label><input id="rc-desc" className="acn-input" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
          <div className="acn-cc-linha">
            <div className="form-group"><label className="acn-label" htmlFor="rc-valor">Valor (R$) *</label><input id="rc-valor" className="acn-input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="rc-dia">Dia do mês *</label><input id="rc-dia" className="acn-input" inputMode="numeric" value={dia} onChange={e => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
            <div className="form-group"><label className="acn-label" htmlFor="rc-fim">Repetir até</label><input id="rc-fim" className="acn-input" type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
          </div>
          <div className="acn-cc-linha">
            <div className="form-group"><label className="acn-label" htmlFor="rc-cat">Categoria</label>
              <select id="rc-cat" className="acn-input" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                <option value="">— Sem categoria —</option>
                {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? '' : ' (desativada)'}</option>)}
              </select></div>
            <div className="form-group"><label className="acn-label" htmlFor="rc-forn">Fornecedor</label><input id="rc-forn" className="acn-input" value={fornecedor} onChange={e => setFornecedor(e.target.value)} /></div>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

export function ModalRecorrencias({ currentUser, onClose, onMudou }: any) {
  const agora = new Date();
  const [recs, setRecs] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const pode = ehAdminOuGerente(currentUser);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const [r, c, k] = await Promise.all([
      supabase.from('centro_custo_recorrencias').select('*').order('ativo', { ascending: false }).order('descricao'),
      supabase.from('centro_custo_categorias').select('*').order('ordem').order('nome'),
      supabase.from('centros_custo').select('id,codigo,nome').order('codigo'),
    ]);
    const falha = r.error || c.error || k.error;
    if (falha) { setErro(falha.message); setCarregando(false); return; }
    setRecs(r.data || []); setCategorias(c.data || []); setCentros(k.data || []);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const codigo = (id: string) => centros.find(c => c.id === id)?.codigo || '?';
  const nomeCategoria = (id: string) => categorias.find(c => c.id === id)?.nome || '';
  const destino = (r: any) => (r.rateio ? r.rateio.map((p: any) => `${codigo(p.centro_custo_id)} ${String(p.percentual).replace('.', ',')}%`).join(' · ') : codigo(r.centro_custo_id));

  const alternar = async (r: any) => {
    const { error } = await supabase.from('centro_custo_recorrencias').update({ ativo: !r.ativo }).eq('id', r.id);
    if (error) { mostrarAviso('Não foi possível salvar: ' + error.message, 'erro'); return; }
    logChange({ module: 'financeiro', entityType: 'centro_custo_recorrencias', entityId: r.id, changeType: 'UPDATE', oldRow: { ativo: r.ativo }, newRow: { ativo: !r.ativo }, user: currentUser });
    carregar();
  };

  const lancar = async () => {
    setResultado(''); setErro('');
    // Etapa 15e-2: não lança recorrente em mês fechado
    const trava = await conferirMesesAbertos([{ ano, mes }]);
    if (!trava.ok) { setErro(trava.mensagem); return; }
    const ini = `${ano}-${p2(mes)}-01`; const ultimo = ultimoDiaDoMes(ano, mes); const fimMes = `${ano}-${p2(mes)}-${p2(ultimo)}`;
    const vigentes = recs.filter(r => r.ativo && String(r.inicio).slice(0, 10) <= fimMes && (!r.fim || String(r.fim).slice(0, 10) >= ini));
    setOcupado(true);
    const { data: ja, error: errJa } = await supabase.from('centro_custo_despesas').select('recorrencia_id').eq('competencia', ini).not('recorrencia_id', 'is', null);
    setOcupado(false);
    if (errJa) { setErro('Não foi possível conferir o que já foi lançado: ' + errJa.message); return; }
    const jaIds = new Set((ja || []).map((x: any) => x.recorrencia_id));
    const aLancar = vigentes.filter(r => !jaIds.has(r.id));
    const jaLancadas = vigentes.length - aLancar.length;
    const nomeMes = `${MESES_LONGOS[mes - 1]}/${ano}`;
    if (!aLancar.length) { setResultado(vigentes.length ? `Nada a lançar: as ${vigentes.length} recorrente(s) de ${nomeMes} já foram lançadas.` : `Nenhuma despesa recorrente ativa vale para ${nomeMes}.`); return; }
    const linhasTxt = aLancar.slice(0, 15).map(r => `${r.descricao} — ${destino(r)} — ${reais(r.valor)}`).join('\n');
    const mais = aLancar.length > 15 ? `\n… e mais ${aLancar.length - 15}` : '';
    if (!await confirmar(`Lançar ${aLancar.length} despesa(s) recorrente(s) de ${nomeMes}?\n${linhasTxt}${mais}\n\n${jaLancadas ? `${jaLancadas} já estava(m) lançada(s) neste mês e não entra(m) de novo.` : 'Nenhuma delas foi lançada neste mês ainda.'}`)) return;

    setOcupado(true);
    let criadas = 0, repetidas = 0; const falhas: string[] = [];
    for (const r of aLancar) {
      const dia = Math.min(Number(r.dia_do_mes), ultimo);
      const base: any = {
        descricao: r.descricao, data: `${ano}-${p2(mes)}-${p2(dia)}`, competencia: ini, categoria_id: r.categoria_id || null, fornecedor: r.fornecedor || null,
        recorrencia_id: r.id, criado_por: currentUser?.email, criado_por_nome: currentUser?.nome || 'Sistema',
      };
      const partes = r.rateio ? r.rateio.map((p: any) => ({ centroId: p.centro_custo_id, percentual: Number(p.percentual) })) : null;
      const linhas = montarLinhasDespesa({ base, valor: Number(r.valor), centroId: r.centro_custo_id, partes });
      const { data: novas, error } = await supabase.from('centro_custo_despesas').insert(linhas).select('id');
      if (error) {
        // a restrição do banco (uma por recorrência, mês e centro) é a garantia: alguém lançou ao mesmo tempo
        if (/23505|duplicate|unique/i.test(`${error.code} ${error.message}`)) repetidas++; else falhas.push(`${r.descricao}: ${error.message}`);
        continue;
      }
      criadas += linhas.length;
      (novas || []).forEach((n: any, i: number) => logChange({ module: 'financeiro', entityType: 'centro_custo_despesas', entityId: n.id, changeType: 'CREATE', newRow: linhas[i], user: currentUser }));
    }
    setOcupado(false);
    const partesTxt = [`${criadas} lançamento(s) criado(s) em ${nomeMes}`];
    if (jaLancadas + repetidas) partesTxt.push(`${jaLancadas + repetidas} recorrente(s) já estava(m) lançada(s)`);
    if (falhas.length) partesTxt.push(`NÃO lançadas: ${falhas.join(' · ')}`);
    setResultado(partesTxt.join('. ') + '.');
    mostrarAviso(partesTxt[0] + '.', falhas.length ? 'atencao' : 'ok');
    onMudou?.();
  };

  const anos = Array.from(new Set([agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1, ano])).sort();
  return (
    <>
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget && !ocupado) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cc-recorr" role="dialog" aria-label="Despesas recorrentes">
        <div className="acn-modal-cab"><span className="modal-title">Despesas recorrentes</span></div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">Despesas que se repetem todo mês (aluguel, internet…). Elas nascem na janela "Lançar despesa" (caixa "Repetir todo mês"); aqui você acompanha, pausa e lança as do mês, <strong>sem duplicar</strong>: a que já entrou naquele mês é pulada.</div>
          {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>{erro}</Faixa>}
          {resultado && <Faixa tom="info">{resultado}</Faixa>}
          <div className="acn-cc-sem-lote">
            <span className="acn-label">Lançar as recorrentes de</span>
            <select className="acn-input acn-cc-filtro" value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mês das recorrentes">
              {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="acn-input acn-cc-filtro" value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano das recorrentes">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Botao variante="primario" pequeno onClick={lancar} disabled={ocupado || carregando || !pode}>{ocupado ? 'Lançando…' : `Lançar as recorrentes de ${MESES_LONGOS[mes - 1]}`}</Botao>
            <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando || ocupado}>Atualizar</Botao>
          </div>
          {!pode && <Faixa tom="info">Só Admin e gerentes lançam, editam ou pausam as recorrentes; você pode olhar a lista.</Faixa>}
          {carregando && !recs.length ? <div className="acn-empty">Carregando…</div>
            : !erro && recs.length === 0 ? <div className="acn-empty">Nenhuma despesa recorrente ainda. Marque "Repetir todo mês" ao lançar uma despesa.</div>
            : (
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr><th>Descrição</th><th>Valor</th><th>Centro</th><th>Dia</th><th>Categoria</th><th>Vigência</th><th>Situação</th><th /></tr></thead>
                  <tbody>
                    {recs.map(r => (
                      <tr key={r.id} className={r.ativo ? '' : 'acn-linha-inativa'}>
                        <td className="acn-texto-longo"><strong className="acn-forte">{r.descricao}</strong>{r.fornecedor && <div className="acn-fraco">{r.fornecedor}</div>}</td>
                        <td className="acn-nowrap">{reais(r.valor)}</td>
                        <td className="acn-texto-longo">{destino(r)}</td>
                        <td>{r.dia_do_mes}</td>
                        <td>{nomeCategoria(r.categoria_id) || <span className="acn-fraco">—</span>}</td>
                        <td className="acn-nowrap">{diaBR(r.inicio)}{r.fim ? ` a ${diaBR(r.fim)}` : ' em diante'}</td>
                        <td><Selo familia={r.ativo ? 'ok' : 'neutro'}>{r.ativo ? 'Ativa' : 'Pausada'}</Selo></td>
                        <td><div className="acn-acoes-linha">
                          <Botao pequeno onClick={() => setEditando(r)} disabled={!pode} aria-label={`Editar a recorrente ${r.descricao}`}>Editar</Botao>
                          <Botao pequeno onClick={() => alternar(r)} disabled={!pode} aria-label={`${r.ativo ? 'Pausar' : 'Reativar'} a recorrente ${r.descricao}`}>{r.ativo ? 'Pausar' : 'Reativar'}</Botao>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape"><Botao onClick={onClose} disabled={ocupado}>Fechar</Botao></div>
      </div>
    </div>
    {editando && <FormRecorrencia rec={editando} categorias={categorias} currentUser={currentUser} onClose={() => setEditando(null)} onSalvo={carregar} />}
    </>
  );
}
