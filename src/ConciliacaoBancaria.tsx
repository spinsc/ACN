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
import { diaISO, Faixa, Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiTrayArrowDown, mdiTagOutline } from '@mdi/js';

// Etapa 12e3 (04/10/2026): a parte visual desta tela passou para as peças do design system (Botao, Selo, Faixa e as
// classes acn-kpi / acn-filtros / acn-tabela / acn-quadro), no lugar do estilo pintado à mão em cada elemento. Só aparência:
// os cliques, as gravações, as leituras, os textos e as regras são os de antes.

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

// Em que dia um registro do sistema entra, para casar com a linha do extrato.
//
// Corrigido em 25/09/2026: antes a conciliação cortava os 10 primeiros
// caracteres de qualquer campo, o que devolve o dia de Londres. Uma NF emitida
// às 22h daqui já é o dia seguinte lá, e o lançamento não casava com o extrato.
//
// Os campos são de duas naturezas e cada uma pede um tratamento:
//   • só o dia (coluna date, ou data escolhida num calendário, que o sistema
//     guarda à meia-noite de Londres) — vale o próprio dia, sem conversão;
//   • instante de verdade (emissão da NF, criação do pedido) — vale o dia de
//     quem está aqui.
const diaDoRegistro = (v: any): string => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 10);
  if (/T00:00:00(\.0+)?(Z|\+00:?00)$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? s.slice(0, 10) : diaISO(d);
};

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
    supabase.from('oples').select('id,opl,cliente_nome,valor_total,numero_nf,numero_nf_servico,data_emissao_nf,data_nf,status_geral')
      .not('valor_total', 'is', null).or('numero_nf.not.is.null,status_geral.ilike.Faturado%'),
    supabase.from('pcp_pedidos_faturamento').select('id,numero_pedido,numero_oc,fornecedor,valor,data_pagamento,recebimento_confirmado_em,criado_em,nf_fornecedor_numero'),
    supabase.from('pcp_pedidos_compra').select('id,numero_pedido,numero_oc,fornecedor,valor_compra,data_prevista_recebimento,data_criacao,status_compra').not('valor_compra', 'is', null),
    supabase.from('centro_custo_despesas').select('id,descricao,valor,data'),
  ]);
  // Etapa 7.36 (04/10/2026): leitura que falha não pode virar "nada no sistema com este valor". Antes o erro era
  // ignorado e a lista de candidatos saía vazia, sem nenhum aviso; agora a tela diz o que não conseguiu ler.
  const falhas = [['as OPs faturadas', ops], ['os faturamentos de compra', fats], ['os pedidos de compra', compras], ['as despesas', despesas]]
    .filter(([, r]: any) => r.error).map(([nome, r]: any) => `${nome} (${r.error.message})`);
  const lista = [
    ...(ops.data || []).map((o: any) => ({ sentido: 1, tipo: 'opl', id: String(o.id), valor: Number(o.valor_total), data: diaDoRegistro(o.data_emissao_nf || o.data_nf),
      descricao: `OP ${o.opl} — ${o.cliente_nome || ''}${o.numero_nf ? ` · NF ${o.numero_nf}` : ''}${o.numero_nf_servico ? ` · NFS-e ${o.numero_nf_servico}` : ''}` })),
    ...(fats.data || []).map((f: any) => ({ sentido: -1, tipo: 'faturamento_compra', id: String(f.id), valor: Number(f.valor), data: diaDoRegistro(f.data_pagamento || f.recebimento_confirmado_em || f.criado_em),
      descricao: `Faturamento ${f.numero_oc || f.numero_pedido || ''} — ${f.fornecedor || ''}${f.nf_fornecedor_numero ? ` · NF ${f.nf_fornecedor_numero}` : ''}` })),
    ...(compras.data || []).map((p: any) => ({ sentido: -1, tipo: 'compra', id: String(p.id), valor: Number(p.valor_compra), data: diaDoRegistro(p.data_prevista_recebimento || p.data_criacao),
      descricao: `Compra ${p.numero_oc || p.numero_pedido || ''} — ${p.fornecedor || ''} (${p.status_compra || ''})` })),
    ...(despesas.data || []).map((d: any) => ({ sentido: -1, tipo: 'despesa', id: String(d.id), valor: Number(d.valor), data: diaDoRegistro(d.data),
      descricao: `Despesa — ${d.descricao || ''}` })),
  ].filter(c => Number.isFinite(c.valor) && c.valor > 0);
  return { lista, erro: falhas.length ? `Não foi possível ler ${falhas.join('; ')}. As sugestões de conciliação podem estar incompletas.` : '' };
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

// Cartão de resumo do topo: a cor mora no ponto do rótulo (família do design system); o número fica na cor do texto.
function Kpi({ rotulo, valor, tom, sub = '' }) {
  return (
    <div className="acn-kpi">
      <span className="rot"><i data-acn-familia={tom} />{rotulo}</span>
      <span className="val acn-num">{valor}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
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
      <div className="modal-box acn-modal-cadastro acn-sac-jan">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTrayArrowDown} size={18} /> Importar extrato bancário</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">
            OFX (no internet banking: "exportar extrato" → OFX/Money) ou planilha CSV com colunas de data, histórico e valor
            (ou crédito e débito). Lançamentos já importados não se repetem.
          </div>
          <input type="file" accept=".ofx,.OFX,.csv,.txt" aria-label="Arquivo do extrato"
            onChange={e => { const f = e.target.files?.[0]; if (f) ler(f); }} />
          {lido && (lido.lancamentos.length === 0 ? (
            <Faixa tom="erro">Nenhum lançamento reconhecido neste arquivo. Confira se é OFX ou CSV com data e valor.</Faixa>
          ) : (
            <div className="acn-quadro">
              <div>
                <strong className="acn-forte">{lido.formato}: {lido.lancamentos.length} lançamentos</strong>
                {' · '}{dataBr(lido.lancamentos.map((l: any) => l.data).sort()[0])} a {dataBr(lido.lancamentos.map((l: any) => l.data).sort().pop())}
              </div>
              <div>
                <span className="acn-txt-ok">Entradas {brl(entradas)}</span> · <span className="acn-txt-erro">Saídas {brl(saidas)}</span>
                {lido.saldoFinal != null && <> · Saldo final {brl(lido.saldoFinal)}</>}
              </div>
            </div>
          ))}
          <div className="form-group">
            <label className="acn-label">Conta *</label>
            <input className="acn-input" value={conta} onChange={e => setConta(e.target.value)}
              placeholder="Ex.: Banco do Brasil 12345-6" aria-label="Conta" />
          </div>
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" disabled={salvando || !lido?.lancamentos?.length} onClick={importar}>
            {salvando ? 'Importando...' : 'Importar'}
          </Botao>
          <Botao disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

// ── Conciliar um lançamento ─────────────────────────────────────────────────
function PainelConciliar({ l, candidatos, jaUsados, leituraFalhou, currentUser, onFeito, onFechar }) {
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
    <div className="acn-conc-linha">
      <span className="acn-conc-tipo">{ROTULO_TIPO[c.tipo]}</span>
      <span className="acn-conc-registro">{c.descricao}</span>
      <span className="acn-fraco acn-nowrap">{c.data ? dataBr(c.data) : ''}</span>
      <strong className="acn-conc-valor acn-num">{brl(c.valor)}</strong>
      <Botao pequeno variante="primario" onClick={() => vincular(c)}>Conciliar</Botao>
    </div>
  );
  return (
    <div className="acn-quadro acn-conc-painel">
      <div className="acn-quadro-titulo">Sugestões pelo valor e pela data</div>
      {sug.length ? sug.map(c => <Linha key={c.tipo + c.id} c={c} />) : leituraFalhou ? (
        <div className="acn-ajuda">Não foi possível ler os registros do sistema para sugerir (veja o aviso no topo da tela). Tente de novo mais tarde ou classifique por centro de custo.</div>
      ) : (
        <div className="acn-ajuda">Nada no sistema com este valor. Procure abaixo ou classifique por centro de custo.</div>
      )}
      <input className="acn-input" value={busca} onChange={e => setBusca(e.target.value)}
        placeholder={sentido > 0 ? 'Procurar OP, cliente, NF...' : 'Procurar fornecedor, OC, NF, despesa...'} aria-label="Procurar registro para conciliar" />
      {achados.map(c => <Linha key={'b' + c.tipo + c.id} c={c} />)}
      <div className="acn-conc-centro">
        <span className="acn-label">Centro de custo</span>
        <CentroCustoSelect value={centro} onChange={setCentro} className="acn-input acn-conc-sel" />
        <input className="acn-input acn-conc-obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" aria-label="Observação" />
      </div>
      <div className="acn-acoes-linha quebra">
        <Botao pequeno variante="primario" disabled={!centro}
          title={centro ? '' : 'Escolha o centro de custo'}
          onClick={() => gravar({ status: 'conciliado', vinculo_tipo: 'centro_custo', vinculo_id: centro, vinculo_descricao: null, centro_custo_id: centro })}>
          Conciliar só com o centro de custo
        </Botao>
        <Botao pequeno
          onClick={() => gravar({ status: 'ignorado', vinculo_tipo: null, vinculo_id: null, vinculo_descricao: null, centro_custo_id: centro })}>
          Ignorar (tarifa, transferência entre contas...)
        </Botao>
        <Botao pequeno variante="discreto" onClick={onFechar}>Fechar</Botao>
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
  // Etapa 7.36 (04/10/2026): o que a tela não conseguiu ler. `erroLista` é a leitura dos lançamentos do mês (sem ela a
  // tela não pode dizer "nenhum lançamento"); `erroApoio` são as leituras de apoio (contas, o que já foi conciliado e os
  // registros do sistema para sugerir), que deixam as sugestões incompletas.
  const [erroLista, setErroLista] = useState('');
  const [erroApoio, setErroApoio] = useState('');
  const [sugestoesIncompletas, setSugestoesIncompletas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const ini = `${ano}-${mes}-01`;
    const fim = diaISO(new Date(Number(ano), Number(mes), 0));
    let q = supabase.from('conciliacao_lancamentos').select('*').gte('data', ini).lte('data', fim).order('data', { ascending: false });
    if (conta) q = q.eq('conta', conta);
    const [{ data, error: errLanc }, { data: todasContas, error: errContas }, { data: conciliados, error: errUsados }, cand] = await Promise.all([
      q,
      supabase.from('conciliacao_extratos').select('conta').order('importado_em', { ascending: false }),
      supabase.from('conciliacao_lancamentos').select('vinculo_tipo,vinculo_id').eq('status', 'conciliado').not('vinculo_id', 'is', null),
      carregarCandidatos(),
    ]);
    setLancs(data || []);
    setContas([...new Set((todasContas || []).map((x: any) => x.conta))]);
    setUsados(new Set((conciliados || []).filter((x: any) => x.vinculo_tipo !== 'centro_custo').map((x: any) => x.vinculo_tipo + ':' + x.vinculo_id)));
    setCandidatos(cand.lista);
    setErroLista(errLanc ? 'Não foi possível ler os lançamentos do extrato: ' + errLanc.message : '');
    setErroApoio([
      errContas && 'Não foi possível ler a lista de contas: ' + errContas.message,
      errUsados && 'Não foi possível ler o que já foi conciliado (a sugestão pode repetir um registro já usado): ' + errUsados.message,
      cand.erro,
    ].filter(Boolean).join(' · '));
    setSugestoesIncompletas(!!(errUsados || cand.erro));
    setCarregando(false);
  }, [mes, ano, conta]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { fetchCentrosCusto().then(setCentros); }, []);

  const desfazer = async (l: any) => {
    if (!await confirmar('Desfazer a conciliação deste lançamento? Ele volta para pendente.')) return;
    const { error } = await supabase.from('conciliacao_lancamentos').update({ status: 'pendente', vinculo_tipo: null, vinculo_id: null, vinculo_descricao: null, conciliado_por: null, conciliado_em: null }).eq('id', l.id);
    // Etapa 7.36 (04/10/2026): antes o resultado não era conferido e a lista recarregava como se tivesse desfeito.
    if (error) { alert('Não foi possível desfazer a conciliação: ' + error.message); return; }
    carregar();
  };

  const entradas = lancs.filter(l => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0);
  const saidas = lancs.filter(l => l.valor < 0).reduce((s, l) => s + Number(l.valor), 0);
  const pendentes = lancs.filter(l => l.status === 'pendente');
  const resolvidos = lancs.length - pendentes.length;
  const nomeCentro = (id: string) => { const c = centros.find((x: any) => x.id === id); return c ? `${c.codigo} — ${c.nome}` : ''; };
  const lista = lancs.filter(l => (!status || l.status === status) && (!busca.trim() || combinaBusca(`${l.descricao} ${l.documento || ''} ${l.valor} ${l.vinculo_descricao || ''}`, busca)));
  const anos = Array.from({ length: 4 }, (_, i) => String(hoje.getFullYear() - i));

  return (
    <div>
      {/* Resumo no topo */}
      <div className="acn-kpis">
        <Kpi rotulo="Entradas" valor={brl(entradas)} tom="ok" />
        <Kpi rotulo="Saídas" valor={brl(Math.abs(saidas))} tom="erro" />
        <Kpi rotulo="Resultado do mês" valor={brl(entradas + saidas)} tom={entradas + saidas >= 0 ? 'marca' : 'erro'} />
        <Kpi rotulo="Pendentes" valor={String(pendentes.length)} tom="atencao" sub={erroLista ? 'leitura falhou' : pendentes.length ? brl(pendentes.reduce((s, l) => s + Math.abs(Number(l.valor)), 0)) + ' a conciliar' : 'tudo conciliado'} />
        <Kpi rotulo="Conciliados" valor={lancs.length ? `${Math.round(resolvidos / lancs.length * 100)}%` : '—'} tom="info" sub={`${resolvidos} de ${lancs.length}`} />
      </div>

      <div className="sec-card">
        <div className="acn-filtros">
          <select className="acn-input acn-select-mini" value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês">
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
              <option key={m} value={m}>{new Date(2000, Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>
            ))}
          </select>
          <select className="acn-input acn-select-mini" value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano">
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="acn-input acn-select-mini" value={conta} onChange={e => setConta(e.target.value)} aria-label="Conta">
            <option value="">Todas as contas</option>
            {contas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="acn-input acn-select-mini" value={status} onChange={e => setStatus(e.target.value)} aria-label="Situação">
            <option value="pendente">Pendentes</option>
            <option value="conciliado">Conciliados</option>
            <option value="ignorado">Ignorados</option>
            <option value="">Todos</option>
          </select>
          <input className="acn-input acn-input-filtro" value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar no extrato..." aria-label="Buscar no extrato" />
          <Botao variante="primario" icone={mdiTrayArrowDown} className="acn-filtros-dir" onClick={() => setImportar(true)}>Importar extrato</Botao>
        </div>

        <div className="sec-body">
          {erroLista && <Faixa tom="erro">{erroLista}</Faixa>}
          {erroApoio && <Faixa tom="erro">{erroApoio}</Faixa>}
          {carregando ? <div className="acn-empty">Carregando...</div> : lista.length === 0 ? (
            erroLista ? null : <div className="acn-empty">
              {lancs.length === 0 ? 'Nenhum lançamento neste mês. Importe o extrato do banco (OFX ou CSV).' : 'Nada nesta situação.'}
            </div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr><th>Data</th><th>Descrição</th><th className="acn-dir">Valor</th><th>Situação</th><th>Conciliado com</th><th></th></tr></thead>
                <tbody>
                  {lista.map(l => (
                    <React.Fragment key={l.id}>
                      <tr>
                        <td className="acn-nowrap">{dataBr(l.data)}</td>
                        <td className="acn-conc-descricao">
                          <div className="acn-duas">
                            <span>{l.descricao || '—'}</span>
                            <small>{l.conta}{l.documento ? ` · doc ${l.documento}` : ''}</small>
                          </div>
                        </td>
                        <td className="acn-dir acn-nowrap acn-num"><span className={l.valor >= 0 ? 'acn-txt-ok' : 'acn-txt-erro'}>{brl(l.valor)}</span></td>
                        <td>
                          <Selo familia={l.status === 'conciliado' ? 'ok' : l.status === 'ignorado' ? 'neutro' : 'atencao'}>
                            {l.status === 'conciliado' ? 'Conciliado' : l.status === 'ignorado' ? 'Ignorado' : 'Pendente'}
                          </Selo>
                        </td>
                        <td className="acn-conc-vinculo">
                          {l.vinculo_tipo && l.vinculo_tipo !== 'centro_custo' && <div><strong className="acn-forte">{ROTULO_TIPO[l.vinculo_tipo]}:</strong> {l.vinculo_descricao}</div>}
                          {l.centro_custo_id && <div className="acn-conc-centro-nome"><Icone path={mdiTagOutline} size={14} /> {nomeCentro(l.centro_custo_id)}</div>}
                          {l.observacao && <div className="acn-fraco">{l.observacao}</div>}
                          {l.conciliado_por && <div className="acn-fraco">{l.conciliado_por}</div>}
                        </td>
                        <td>
                          <div className="acn-acoes-linha">
                            {l.status === 'pendente' ? (
                              <Botao pequeno variante={aberto === l.id ? 'secundario' : 'primario'}
                                onClick={() => setAberto(a => a === l.id ? null : l.id)}>
                                {aberto === l.id ? 'Fechar' : `Conciliar${sugestoes(l, candidatos, usados).length ? ' ✨' : ''}`}
                              </Botao>
                            ) : (
                              <Botao pequeno onClick={() => desfazer(l)}>Desfazer</Botao>
                            )}
                          </div>
                        </td>
                      </tr>
                      {aberto === l.id && (
                        <tr><td colSpan={6}>
                          <PainelConciliar l={l} candidatos={candidatos} jaUsados={usados} leituraFalhou={sugestoesIncompletas} currentUser={currentUser}
                            onFeito={() => { setAberto(null); carregar(); }} onFechar={() => setAberto(null)} />
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="acn-ajuda acn-conc-nota">
        ✨ = o sistema achou registro com o mesmo valor. Entradas são comparadas com OPs faturadas; saídas com faturamento de compras, pedidos de compra e despesas.
      </div>

      {importar && (
        <ModalImportar currentUser={currentUser} contaPadrao={conta || contas[0] || ''} onClose={() => setImportar(false)}
          onImportado={(c: string) => { setImportar(false); setConta(c); setStatus('pendente'); carregar(); }} />
      )}
    </div>
  );
}
