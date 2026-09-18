// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ConciliacaoBancaria — extrato do banco x o que o sistema registrou
//
// Importa o extrato (OFX, o arquivo que todo banco exporta, ou CSV/planilha) e
// cada lançamento é conciliado com o que o sistema já tem:
//   • entradas → OPs faturadas (valor total, NF)
//   • saídas   → faturamento de compras (NF do fornecedor), pedidos de compra
//                e despesas avulsas por centro de custo
// O sistema sugere pelo valor e pela data; o que não tiver par vira
// classificação por centro de custo, ou é ignorado (tarifa, transferência
// entre contas...). Importar o mesmo extrato de novo não duplica nada: cada
// lançamento tem uma chave (FITID do OFX, ou data+valor+descrição no CSV).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { CentroCustoSelect, fetchCentrosCusto } from './CentroCustoShared';
import { combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const numBr = (v: any) => {
  let t = String(v ?? '').replace(/[R$\s]/g, '');
  if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || /-$/.test(t);
  t = t.replace(/[()]/g, '').replace(/-$/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return neg ? -Math.abs(n) : n;
};
const diasEntre = (a: string, b: string) => Math.abs((new Date(a.slice(0, 10)).getTime() - new Date(b.slice(0, 10)).getTime()) / 86400000);

// ── Leitura do arquivo ───────────────────────────────────────────────────────
function lerOfx(texto: string) {
  const tag = (bloco: string, nome: string) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  const lancamentos = blocos.map(b => {
    const d = tag(b, 'DTPOSTED');
    return {
      data: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '',
      valor: numBr(tag(b, 'TRNAMT').replace(',', '.')),
      descricao: [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' — '),
      documento: tag(b, 'CHECKNUM') || tag(b, 'REFNUM') || null,
      chave: tag(b, 'FITID'),
    };
  }).filter(l => l.data && Number.isFinite(l.valor));
  const saldoTxt = (texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i) || [])[1];
  return { conta: tag(texto, 'ACCTID'), lancamentos, saldoFinal: saldoTxt ? numBr(saldoTxt.replace(',', '.')) : null };
}

function lerCsv(texto: string) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { conta: '', lancamentos: [], saldoFinal: null };
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const partir = (l: string) => {
    const out: string[] = []; let atual = ''; let aspas = false;
    for (const ch of l) {
      if (ch === '"') aspas = !aspas;
      else if (ch === sep && !aspas) { out.push(atual.trim()); atual = ''; }
      else atual += ch;
    }
    out.push(atual.trim());
    return out;
  };
  // procura a linha de cabeçalho (primeira com "data")
  const iCab = linhas.findIndex(l => /data/i.test(l));
  const cab = partir(linhas[Math.max(0, iCab)]).map(c => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (...nomes: string[]) => cab.findIndex(c => nomes.some(n => c.includes(n)));
  const cData = col('data'), cDesc = col('hist', 'descri', 'lanc', 'memo'), cDoc = col('doc', 'numero');
  const cValor = col('valor'), cCred = col('credito', 'entrada'), cDeb = col('debito', 'saida');
  const vistos: Record<string, number> = {};
  const lancamentos = linhas.slice(iCab + 1).map(l => {
    const c = partir(l);
    const d = c[cData] || '';
    const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const data = m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '');
    let valor = cValor >= 0 ? numBr(c[cValor]) : NaN;
    if (!Number.isFinite(valor) && (cCred >= 0 || cDeb >= 0)) {
      const cr = numBr(c[cCred]); const db = numBr(c[cDeb]);
      valor = (Number.isFinite(cr) ? Math.abs(cr) : 0) - (Number.isFinite(db) ? Math.abs(db) : 0);
    }
    const descricao = cDesc >= 0 ? c[cDesc] : '';
    const base = `${data}|${valor}|${descricao}`;
    vistos[base] = (vistos[base] || 0) + 1;
    return { data, valor, descricao, documento: cDoc >= 0 ? c[cDoc] || null : null, chave: `${base}|${vistos[base]}` };
  }).filter(l => l.data && Number.isFinite(l.valor) && l.valor !== 0 && !/saldo/i.test(l.descricao || ''));
  return { conta: '', lancamentos, saldoFinal: null };
}

// ── Candidatos do sistema para conciliar ─────────────────────────────────────
async function carregarCandidatos() {
  const [ops, fats, compras, despesas] = await Promise.all([
    supabase.from('oples').select('id,opl,cliente_nome,valor_total,numero_nf,data_emissao_nf,data_nf,status_geral')
      .not('valor_total', 'is', null).or('numero_nf.not.is.null,status_geral.ilike.Faturado%'),
    supabase.from('pcp_pedidos_faturamento').select('id,numero_pedido,numero_oc,fornecedor,valor,data_pagamento,recebimento_confirmado_em,criado_em,nf_fornecedor_numero'),
    supabase.from('pcp_pedidos_compra').select('id,numero_pedido,numero_oc,fornecedor,valor_compra,data_prevista_recebimento,data_criacao,status_compra').not('valor_compra', 'is', null),
    supabase.from('centro_custo_despesas').select('id,descricao,valor,data'),
  ]);
  return [
    ...(ops.data || []).map((o: any) => ({ sentido: 1, tipo: 'opl', id: String(o.id), valor: Number(o.valor_total), data: String(o.data_emissao_nf || o.data_nf || '').slice(0, 10),
      descricao: `OP ${o.opl} — ${o.cliente_nome || ''}${o.numero_nf ? ` · NF ${o.numero_nf}` : ''}` })),
    ...(fats.data || []).map((f: any) => ({ sentido: -1, tipo: 'faturamento_compra', id: String(f.id), valor: Number(f.valor), data: String(f.data_pagamento || f.recebimento_confirmado_em || f.criado_em || '').slice(0, 10),
      descricao: `Faturamento ${f.numero_oc || f.numero_pedido || ''} — ${f.fornecedor || ''}${f.nf_fornecedor_numero ? ` · NF ${f.nf_fornecedor_numero}` : ''}` })),
    ...(compras.data || []).map((p: any) => ({ sentido: -1, tipo: 'compra', id: String(p.id), valor: Number(p.valor_compra), data: String(p.data_prevista_recebimento || p.data_criacao || '').slice(0, 10),
      descricao: `Compra ${p.numero_oc || p.numero_pedido || ''} — ${p.fornecedor || ''} (${p.status_compra || ''})` })),
    ...(despesas.data || []).map((d: any) => ({ sentido: -1, tipo: 'despesa', id: String(d.id), valor: Number(d.valor), data: String(d.data || '').slice(0, 10),
      descricao: `Despesa — ${d.descricao || ''}` })),
  ].filter(c => Number.isFinite(c.valor) && c.valor > 0);
}
const ROTULO_TIPO = { opl: 'OP faturada', faturamento_compra: 'Faturamento de compra', compra: 'Pedido de compra', despesa: 'Despesa', centro_custo: 'Centro de custo' };

function sugestoes(l: any, candidatos: any[], jaUsados: Set<string>) {
  const alvo = Math.abs(Number(l.valor));
  const sentido = l.valor > 0 ? 1 : -1;
  return candidatos
    .filter(c => c.sentido === sentido && !jaUsados.has(c.tipo + ':' + c.id))
    .map(c => ({ ...c, difValor: Math.abs(c.valor - alvo), difDias: c.data ? diasEntre(c.data, l.data) : 999 }))
    .filter(c => c.difValor <= Math.max(0.05, alvo * 0.02))
    .sort((a, b) => a.difValor - b.difValor || a.difDias - b.difDias)
    .slice(0, 5);
}

// ── Importação ──────────────────────────────────────────────────────────────
function ModalImportar({ currentUser, contaPadrao, onClose, onImportado }) {
  const [lido, setLido] = useState<any>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conta, setConta] = useState(contaPadrao || '');
  const [salvando, setSalvando] = useState(false);
  const ler = async (f: File) => {
    const buf = await f.arrayBuffer();
    // OFX de banco brasileiro costuma vir em Latin-1; CSV pode vir em UTF-8
    let texto = new TextDecoder('utf-8').decode(buf);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
    const ofx = /<OFX>|OFXHEADER/i.test(texto);
    const r = ofx ? lerOfx(texto) : lerCsv(texto);
    setArquivo(f);
    setLido({ ...r, formato: ofx ? 'OFX' : 'CSV' });
    if (r.conta && !conta) setConta(r.conta);
  };
  const importar = async () => {
    if (!conta.trim()) { alert('Informe a conta (ex.: Banco do Brasil 12345-6).'); return; }
    setSalvando(true);
    const datas = lido.lancamentos.map((l: any) => l.data).sort();
    const { data: ext, error: e1 } = await supabase.from('conciliacao_extratos').insert([{
      conta: conta.trim(), arquivo_nome: arquivo?.name, formato: lido.formato,
      periodo_inicio: datas[0] || null, periodo_fim: datas[datas.length - 1] || null, saldo_final: lido.saldoFinal,
      qtd_lancamentos: lido.lancamentos.length, importado_por: currentUser?.nome || null,
    }]).select('id').single();
    if (e1) { setSalvando(false); alert('Não foi possível importar: ' + e1.message); return; }
    const linhas = lido.lancamentos.map((l: any) => ({ ...l, conta: conta.trim(), extrato_id: ext.id, chave: String(l.chave || `${l.data}|${l.valor}|${l.descricao}`) }));
    const { data: novos, error: e2 } = await supabase.from('conciliacao_lancamentos')
      .upsert(linhas, { onConflict: 'conta,chave', ignoreDuplicates: true }).select('id');
    setSalvando(false);
    if (e2) { alert('Erro ao gravar os lançamentos: ' + e2.message); return; }
    const n = (novos || []).length;
    alert(`${n} lançamento(s) novo(s) importado(s)${linhas.length - n ? `; ${linhas.length - n} já estava(m) no sistema` : ''}.`);
    onImportado(conta.trim());
  };
  const entradas = lido ? lido.lancamentos.filter((l: any) => l.valor > 0).reduce((s: number, l: any) => s + l.valor, 0) : 0;
  const saidas = lido ? lido.lancamentos.filter((l: any) => l.valor < 0).reduce((s: number, l: any) => s + l.valor, 0) : 0;
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-title">📥 Importar extrato bancário</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          OFX (no internet banking: "exportar extrato" → OFX/Money) ou planilha CSV com colunas de data, histórico e valor
          (ou crédito e débito). Lançamentos já importados não se repetem.
        </div>
        <input type="file" accept=".ofx,.OFX,.csv,.txt" aria-label="Arquivo do extrato"
          onChange={e => { const f = e.target.files?.[0]; if (f) ler(f); }} style={{ marginBottom: 10 }} />
        {lido && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: 11, marginBottom: 10 }}>
            {lido.lancamentos.length === 0 ? (
              <span style={{ color: '#b91c1c' }}>Nenhum lançamento reconhecido neste arquivo. Confira se é OFX ou CSV com data e valor.</span>
            ) : (
              <>
                <strong>{lido.formato}: {lido.lancamentos.length} lançamentos</strong>
                {' · '}{dataBr(lido.lancamentos.map((l: any) => l.data).sort()[0])} a {dataBr(lido.lancamentos.map((l: any) => l.data).sort().pop())}
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: '#15803d' }}>Entradas {brl(entradas)}</span> · <span style={{ color: '#b91c1c' }}>Saídas {brl(saidas)}</span>
                  {lido.saldoFinal != null && <> · Saldo final {brl(lido.saldoFinal)}</>}
                </div>
              </>
            )}
          </div>
        )}
        <label className="acn-label">Conta *</label>
        <input className="acn-input" style={{ width: '100%', marginBottom: 12 }} value={conta} onChange={e => setConta(e.target.value)}
          placeholder="Ex.: Banco do Brasil 12345-6" aria-label="Conta" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#0f766e', flex: 1, opacity: salvando || !lido?.lancamentos?.length ? .6 : 1 }}
            disabled={salvando || !lido?.lancamentos?.length} onClick={importar}>
            {salvando ? 'Importando...' : 'Importar'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Conciliar um lançamento ─────────────────────────────────────────────────
function PainelConciliar({ l, candidatos, jaUsados, currentUser, onFeito, onFechar }) {
  const [busca, setBusca] = useState('');
  const [centro, setCentro] = useState<string | null>(l.centro_custo_id || null);
  const [obs, setObs] = useState(l.observacao || '');
  const sug = useMemo(() => sugestoes(l, candidatos, jaUsados), [l, candidatos, jaUsados]);
  const sentido = l.valor > 0 ? 1 : -1;
  const achados = busca.trim().length >= 2
    ? candidatos.filter(c => c.sentido === sentido && combinaBusca(`${c.descricao} ${c.valor}`, busca)).slice(0, 8) : [];
  const gravar = async (patch: any) => {
    const { error } = await supabase.from('conciliacao_lancamentos').update({
      ...patch, observacao: obs.trim() || null, conciliado_por: currentUser?.nome || null, conciliado_em: new Date().toISOString(),
    }).eq('id', l.id);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    onFeito();
  };
  const vincular = (c: any) => gravar({ status: 'conciliado', vinculo_tipo: c.tipo, vinculo_id: c.id, vinculo_descricao: c.descricao, centro_custo_id: centro });
  const Linha = ({ c }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', minWidth: 110 }}>{ROTULO_TIPO[c.tipo]}</span>
      <span style={{ flex: 1 }}>{c.descricao}</span>
      <span style={{ color: '#64748b', fontSize: 10 }}>{c.data ? dataBr(c.data) : ''}</span>
      <strong style={{ minWidth: 90, textAlign: 'right' }}>{brl(c.valor)}</strong>
      <button className="acn-btn" style={{ background: '#16a34a', fontSize: 9 }} onClick={() => vincular(c)}>Conciliar</button>
    </div>
  );
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, margin: '4px 0 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#334155', marginBottom: 4 }}>Sugestões pelo valor e pela data</div>
      {sug.length ? sug.map(c => <Linha key={c.tipo + c.id} c={c} />) : (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px' }}>Nada no sistema com este valor. Procure abaixo ou classifique por centro de custo.</div>
      )}
      <input className="acn-input" style={{ width: '100%', margin: '8px 0 4px' }} value={busca} onChange={e => setBusca(e.target.value)}
        placeholder={sentido > 0 ? 'Procurar OP, cliente, NF...' : 'Procurar fornecedor, OC, NF, despesa...'} aria-label="Procurar registro para conciliar" />
      {achados.map(c => <Linha key={'b' + c.tipo + c.id} c={c} />)}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>Centro de custo</span>
        <CentroCustoSelect value={centro} onChange={setCentro} style={{ minWidth: 220, fontSize: 11 }} />
        <input className="acn-input" style={{ flex: 1, minWidth: 160 }} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" aria-label="Observação" />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="acn-btn" style={{ background: '#0369a1', fontSize: 10 }} disabled={!centro}
          title={centro ? '' : 'Escolha o centro de custo'}
          onClick={() => gravar({ status: 'conciliado', vinculo_tipo: 'centro_custo', vinculo_id: centro, vinculo_descricao: null, centro_custo_id: centro })}>
          Conciliar só com o centro de custo
        </button>
        <button className="acn-btn" style={{ background: '#64748b', fontSize: 10 }}
          onClick={() => gravar({ status: 'ignorado', vinculo_tipo: null, vinculo_id: null, vinculo_descricao: null, centro_custo_id: centro })}>
          Ignorar (tarifa, transferência entre contas...)
        </button>
        <button className="acn-btn" style={{ background: '#94a3b8', fontSize: 10 }} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export default function ConciliacaoBancaria({ currentUser }) {
  const hoje = new Date();
  const [mes, setMes] = useState(String(hoje.getMonth() + 1).padStart(2, '0'));
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [conta, setConta] = useState('');
  const [contas, setContas] = useState<string[]>([]);
  const [status, setStatus] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [lancs, setLancs] = useState<any[]>([]);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [usados, setUsados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [importar, setImportar] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const ini = `${ano}-${mes}-01`;
    const fim = new Date(Number(ano), Number(mes), 0).toISOString().slice(0, 10);
    let q = supabase.from('conciliacao_lancamentos').select('*').gte('data', ini).lte('data', fim).order('data', { ascending: false });
    if (conta) q = q.eq('conta', conta);
    const [{ data }, { data: todasContas }, { data: conciliados }, cand] = await Promise.all([
      q,
      supabase.from('conciliacao_extratos').select('conta').order('importado_em', { ascending: false }),
      supabase.from('conciliacao_lancamentos').select('vinculo_tipo,vinculo_id').eq('status', 'conciliado').not('vinculo_id', 'is', null),
      carregarCandidatos(),
    ]);
    setLancs(data || []);
    setContas([...new Set((todasContas || []).map((x: any) => x.conta))]);
    setUsados(new Set((conciliados || []).filter((x: any) => x.vinculo_tipo !== 'centro_custo').map((x: any) => x.vinculo_tipo + ':' + x.vinculo_id)));
    setCandidatos(cand);
    setCarregando(false);
  }, [mes, ano, conta]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { fetchCentrosCusto().then(setCentros); }, []);

  const desfazer = async (l: any) => {
    if (!await confirmar('Desfazer a conciliação deste lançamento? Ele volta para pendente.')) return;
    await supabase.from('conciliacao_lancamentos').update({ status: 'pendente', vinculo_tipo: null, vinculo_id: null, vinculo_descricao: null, conciliado_por: null, conciliado_em: null }).eq('id', l.id);
    carregar();
  };

  const entradas = lancs.filter(l => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0);
  const saidas = lancs.filter(l => l.valor < 0).reduce((s, l) => s + Number(l.valor), 0);
  const pendentes = lancs.filter(l => l.status === 'pendente');
  const resolvidos = lancs.length - pendentes.length;
  const nomeCentro = (id: string) => { const c = centros.find((x: any) => x.id === id); return c ? `${c.codigo} — ${c.nome}` : ''; };
  const lista = lancs.filter(l => (!status || l.status === status) && (!busca.trim() || combinaBusca(`${l.descricao} ${l.documento || ''} ${l.valor} ${l.vinculo_descricao || ''}`, busca)));
  const anos = Array.from({ length: 4 }, (_, i) => String(hoje.getFullYear() - i));
  const Kpi = ({ rotulo, valor, cor, sub = '' }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${cor}`, borderRadius: 6, padding: '8px 12px', minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>{rotulo}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: cor, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: '#64748b' }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* Resumo no topo */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Kpi rotulo="Entradas" valor={brl(entradas)} cor="#15803d" />
        <Kpi rotulo="Saídas" valor={brl(Math.abs(saidas))} cor="#b91c1c" />
        <Kpi rotulo="Resultado do mês" valor={brl(entradas + saidas)} cor={entradas + saidas >= 0 ? '#0f766e' : '#b91c1c'} />
        <Kpi rotulo="Pendentes" valor={String(pendentes.length)} cor="#b45309" sub={pendentes.length ? brl(pendentes.reduce((s, l) => s + Math.abs(Number(l.valor)), 0)) + ' a conciliar' : 'tudo conciliado'} />
        <Kpi rotulo="Conciliados" valor={lancs.length ? `${Math.round(resolvidos / lancs.length * 100)}%` : '—'} cor="#2563eb" sub={`${resolvidos} de ${lancs.length}`} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês" style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
            <option key={m} value={m}>{new Date(2000, Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>
          ))}
        </select>
        <select value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano" style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={conta} onChange={e => setConta(e.target.value)} aria-label="Conta" style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="">Todas as contas</option>
          {contas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Situação" style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11 }}>
          <option value="pendente">Pendentes</option>
          <option value="conciliado">Conciliados</option>
          <option value="ignorado">Ignorados</option>
          <option value="">Todos</option>
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar no extrato..." aria-label="Buscar no extrato"
          style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, minWidth: 180 }} />
        <button className="acn-btn" style={{ background: '#0f766e', marginLeft: 'auto' }} onClick={() => setImportar(true)}>📥 Importar extrato</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
        {carregando ? <div className="acn-empty">Carregando...</div> : lista.length === 0 ? (
          <div className="acn-empty">
            {lancs.length === 0 ? 'Nenhum lançamento neste mês. Importe o extrato do banco (OFX ou CSV).' : 'Nada nesta situação.'}
          </div>
        ) : (
          <table style={{ width: '100%' }}>
            <thead><tr><th>Data</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Valor</th><th>Situação</th><th>Conciliado com</th><th></th></tr></thead>
            <tbody>
              {lista.map(l => (
                <React.Fragment key={l.id}>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataBr(l.data)}</td>
                    <td style={{ maxWidth: 340, wordBreak: 'break-word' }}>
                      {l.descricao || '—'}
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{l.conta}{l.documento ? ` · doc ${l.documento}` : ''}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: l.valor >= 0 ? '#15803d' : '#b91c1c', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{brl(l.valor)}</td>
                    <td>
                      <span className="acn-badge" style={{ background: l.status === 'conciliado' ? '#16a34a' : l.status === 'ignorado' ? '#94a3b8' : '#d97706' }}>
                        {l.status === 'conciliado' ? 'Conciliado' : l.status === 'ignorado' ? 'Ignorado' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, maxWidth: 280 }}>
                      {l.vinculo_tipo && l.vinculo_tipo !== 'centro_custo' && <div><strong>{ROTULO_TIPO[l.vinculo_tipo]}:</strong> {l.vinculo_descricao}</div>}
                      {l.centro_custo_id && <div style={{ color: '#0369a1' }}>🏷️ {nomeCentro(l.centro_custo_id)}</div>}
                      {l.observacao && <div style={{ color: '#64748b' }}>{l.observacao}</div>}
                      {l.conciliado_por && <div style={{ color: '#94a3b8' }}>{l.conciliado_por}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l.status === 'pendente' ? (
                        <button className="acn-btn" style={{ background: aberto === l.id ? '#64748b' : '#2563eb', fontSize: 10 }}
                          onClick={() => setAberto(a => a === l.id ? null : l.id)}>
                          {aberto === l.id ? 'Fechar' : `Conciliar${sugestoes(l, candidatos, usados).length ? ' ✨' : ''}`}
                        </button>
                      ) : (
                        <button className="acn-btn" style={{ background: '#94a3b8', fontSize: 10 }} onClick={() => desfazer(l)}>Desfazer</button>
                      )}
                    </td>
                  </tr>
                  {aberto === l.id && (
                    <tr><td colSpan={6} style={{ padding: 0 }}>
                      <PainelConciliar l={l} candidatos={candidatos} jaUsados={usados} currentUser={currentUser}
                        onFeito={() => { setAberto(null); carregar(); }} onFechar={() => setAberto(null)} />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
        ✨ = o sistema achou registro com o mesmo valor. Entradas são comparadas com OPs faturadas; saídas com faturamento de compras, pedidos de compra e despesas.
      </div>

      {importar && (
        <ModalImportar currentUser={currentUser} contaPadrao={conta || contas[0] || ''} onClose={() => setImportar(false)}
          onImportado={(c: string) => { setImportar(false); setConta(c); setStatus('pendente'); carregar(); }} />
      )}
    </div>
  );
}
