// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DOSSIÊ DO LOTE — o lote inteiro (A1704.2610/01 a /20) numa página só, com saída em PDF para imprimir.
//
// Pedido do usuário em 16/10/2026: "preciso poder imprimir um dossiê do lote", como resumo e a título de organização, abrindo "da mesma forma que abro
// uma OP ou uma OP de um lote". Conteúdo escolhido por ele: resumo do lote, tabela carro a carro, pendências/compras/demandas/frete juntos e o histórico
// completo de cada OP. Cada OP do lote já tem o seu dossiê (OpDossie.tsx / OpVinculos.ts); aqui só se junta: o que é igual em todas aparece uma vez
// (itens, compras ligadas a várias unidades), o que é de cada carro aparece numa linha.
//
// Aparece em dois lugares, os mesmos do dossiê da OP: o botão "Dossiê do lote" no cabeçalho do dossiê de uma OP que faz parte de lote (abre pelo detalhe da OP
// e por Relatórios) e a busca de Relatórios, que oferece o lote inteiro quando o número digitado casa com várias unidades.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { carregarDossie, pendenciasEmAberto } from './OpVinculos';
import { etapaDaOp, desdeQuandoNaEtapa, diasDesde, textoDias } from './EtapasOp';
import { fluxoLabel, fluxoEfetivo } from './FluxoEntrega';
import { diaBR } from './Interface';
import { podeVerValores } from './utils/permissoes';
import { tratarFalhaDeArquivoNovo } from './VersaoNova';
import { LinkOpl } from './AcnTabShared';

const fmtD  = (d) => diaBR(d);
const fmtDH = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const fmtR  = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** "A1704.2610/05" → "A1704.2610" (o número do lote). */
export const baseDoLote = (opl) => String(opl || '').trim().replace(/\/\d+$/, '');
/** "A1704.2610/05" → "05" (o número da unidade; "—" se a OP não tiver sufixo). */
import { textosDasOps, legendaDasUnidades } from './TextosDaOp';
const sufixoDe = (opl) => (String(opl || '').match(/\/(\d+)$/) || [])[1] || '—';

const TITULO_GRUPO = {
  demanda: 'Demandas dos setores', compra: 'Compras', engenharia: 'Engenharia', ajuste: 'Ajustes',
  qualidade: 'Qualidade', frete: 'Frete', agendamento: 'Agendamentos', anexo: 'Anexos',
};
const ORDEM_GRUPOS = ['demanda', 'compra', 'engenharia', 'ajuste', 'qualidade', 'frete', 'agendamento', 'anexo'];

/** Lê todas as OPs do lote e o dossiê de cada uma (de 4 em 4, para não afogar o banco). `aoProgresso(feitas, total)` avisa a tela. */
export async function carregarLote(base, aoProgresso = () => {}) {
  const b = baseDoLote(base);
  // o próprio número do lote (OP sem sufixo) também entra, caso exista
  const [sufixadas, avulsa] = await Promise.all([
    supabase.from('oples').select('*').like('opl', `${b}/%`).order('opl'),
    supabase.from('oples').select('*').eq('opl', b),
  ]);
  const erroLeitura = sufixadas.error || avulsa.error;
  if (erroLeitura) throw new Error('Não foi possível ler as OPs do lote: ' + erroLeitura.message);
  const lista = [...(avulsa.data || []), ...(sufixadas.data || [])].filter(o => baseDoLote(o.opl) === b);
  const dossies = [];
  for (let i = 0; i < lista.length; i += 4) {
    const bloco = await Promise.all(lista.slice(i, i + 4).map(o => carregarDossie(o)));
    dossies.push(...bloco.filter(Boolean));
    aoProgresso(Math.min(i + 4, lista.length), lista.length);
  }
  return { base: b, dossies };
}

/** Tudo o que a tela e o PDF mostram, já calculado (puro: não lê nada do banco). */
export function resumirLote(dados) {
  const ds = dados.dossies;
  const ops = ds.map(d => d.op);
  const primeira = ops[0] || {};
  const unidades = ds.map(d => {
    const o = d.op;
    const et = etapaDaOp(o.status_geral, o);
    const desde = desdeQuandoNaEtapa(o, d.logs);
    return {
      id: o.id, opl: o.opl, sufixo: sufixoDe(o.opl), modelo: o.modelo || o.veiculo || '', chassi: o.chassi || '', placa: o.placa || '',
      situacao: o.status_geral || '—', onde: et.concluida ? 'Concluída' : (et.setor || et.label || '—'),
      desde: desde ? textoDias(diasDesde(desde.data)) : '—', pendencias: d.pendencias.length, valor: o.valor_total,
    };
  });
  // quantas unidades em cada situação
  const porSituacao = new Map();
  unidades.forEach(u => porSituacao.set(u.situacao, (porSituacao.get(u.situacao) || 0) + 1));
  // itens vendidos: o que é igual em todas as unidades aparece uma vez; se diferirem, cada variação vem com as suas unidades
  const gruposDeItens = new Map();
  ds.forEach(d => {
    const itens = Array.isArray(d.op.itens_vendidos) ? d.op.itens_vendidos : [];
    const chave = JSON.stringify(itens.map(i => [i.nome || '', i.quantidade ?? '', i.descricao || '']));
    if (!gruposDeItens.has(chave)) gruposDeItens.set(chave, { itens, unidades: [] });
    gruposDeItens.get(chave).unidades.push(sufixoDe(d.op.opl));
  });
  // vínculos (compras, demandas, frete...): o mesmo registro ligado a várias unidades vira uma linha só, com a lista das unidades
  const unicos = new Map();
  ds.forEach(d => d.vinculos.forEach(v => {
    const k = `${v.grupo}|${v.tipo}:${v.id}`;
    if (!unicos.has(k)) unicos.set(k, { ...v, unidades: [] });
    unicos.get(k).unidades.push(sufixoDe(d.op.opl));
  }));
  const vinculos = [...unicos.values()];
  const pendencias = pendenciasEmAberto(vinculos);
  const valorTotal = ops.reduce((s, o) => s + (Number(o.valor_total) || 0), 0);
  return {
    base: dados.base, n: ops.length, primeira, origem: ds[0]?.origem || {}, unidades, porSituacao: [...porSituacao.entries()],
    gruposDeItens: [...gruposDeItens.values()], vinculos, pendencias, valorTotal,
    textos: textosDasOps(ops, o => '/' + sufixoDe(o.opl)),
    prazoMin: ops.map(o => o.prazo_entrega_comercial || o.data_prevista_entrega).filter(Boolean).sort()[0] || null,
    prazoMax: ops.map(o => o.prazo_entrega_comercial || o.data_prevista_entrega).filter(Boolean).sort().slice(-1)[0] || null,
  };
}

/** "todas (20)" quando a linha vale para todas as unidades; senão "/01, /02". */
const textoUnidades = (lista, total) => (lista.length >= total && total > 1 ? `todas (${total})` : lista.map(s => '/' + s).join(', '));

/** Monta o PDF do lote e devolve o documento (quem chama salva). `comHistorico`: inclui a linha do tempo de cada OP. */
export async function montarPdfDossieLote(dados, { comHistorico = true, verValores = true } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const r = resumirLote(dados);
  const o = r.primeira;
  let y = 16;
  const novaPagina = (precisa = 12) => { if (y + precisa > 285) { doc.addPage(); y = 16; } };
  const titulo = (t, cor = [15, 118, 110]) => {
    novaPagina(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.setTextColor(cor[0], cor[1], cor[2]); doc.text(t, 14, y); doc.setTextColor(0, 0, 0); y += 5;
  };
  const tabela = (head, body, extra = {}) => {
    if (!body.length) return;
    autoTable(doc, { head: [head], body, startY: y, theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 7, textColor: 255 }, bodyStyles: { fontSize: 7, cellPadding: 1.4 },
      margin: { left: 14, right: 14 }, ...extra });
    y = doc.lastAutoTable.finalY + 5;
  };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('DOSSIÊ DO LOTE', 105, y, { align: 'center' }); y += 7;
  doc.setFontSize(12); doc.text(`${r.base} — ${r.n} unidade(s)`, 105, y, { align: 'center' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 105, y, { align: 'center' }); doc.setTextColor(0); y += 8;

  titulo('RESUMO DO LOTE');
  const linhasResumo = [
    ['Cliente', o.cliente_nome || '—', 'Pedido de venda', r.origem.oportunidade?.numero_pv || '—'],
    ['Tipo de projeto', o.tipo_projeto || '—', 'Fluxo de entrega', fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega))],
    ['Unidades', String(r.n), 'Empresa', o.faturamento_empresa || '—'],
    ['Comercial', o.responsavel_comercial || o.vendedor || '—', 'Destino', [o.destino_cidade, o.destino_uf].filter(Boolean).join('/') || '—'],
    ['Entrada', fmtD(o.data_entrada), 'Prazo', r.prazoMin ? (r.prazoMin === r.prazoMax ? fmtD(r.prazoMin) : `${fmtD(r.prazoMin)} a ${fmtD(r.prazoMax)}`) : '—'],
  ];
  if (verValores) linhasResumo.push(['Valor total do lote', fmtR(r.valorTotal), 'Valor por carro (médio)', fmtR(r.n ? r.valorTotal / r.n : null)]);
  tabela(['Campo', 'Valor', 'Campo', 'Valor'], linhasResumo);

  titulo('SITUAÇÃO DO LOTE');
  tabela(['Situação', 'Unidades'], r.porSituacao.map(([s, n]) => [s, String(n)]));

  if (r.textos.length) {
    titulo('DESCRIÇÃO E OBSERVAÇÕES');
    r.textos.forEach(tx => tx.grupos.forEach(g => {
      const leg = legendaDasUnidades(g, r.n);
      const linhas = doc.splitTextToSize(`${tx.rotulo}${leg ? ` (${leg})` : ''}: ${g.texto}`, 180);
      novaPagina(linhas.length * 4 + 3); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(tx.atencao ? 180 : 0, tx.atencao ? 30 : 0, 0);
      doc.text(linhas, 14, y); doc.setTextColor(0, 0, 0); y += linhas.length * 3.6 + 2;
    }));
    y += 2;
  }

  titulo('ITENS VENDIDOS (POR CARRO)');
  r.gruposDeItens.forEach(g => {
    if (r.gruposDeItens.length > 1) { novaPagina(10); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Unidades ${textoUnidades(g.unidades, r.n)}:`, 14, y); y += 4; }
    tabela(['Item', 'Qt por carro', 'Descrição'], g.itens.map(i => [i.nome || '—', String(i.quantidade ?? '—'), i.descricao || '']));
  });
  if (!r.gruposDeItens.some(g => g.itens.length)) { doc.setFontSize(8); doc.text('Nenhum item vendido registrado.', 14, y); y += 6; }

  titulo('CARRO A CARRO');
  tabela(['Unid.', 'Modelo', 'Chassi', 'Placa', 'Situação', 'Onde está', 'Há', 'Pend.'],
    r.unidades.map(u => ['/' + u.sufixo, u.modelo || '—', u.chassi || '—', u.placa || '—', u.situacao, u.onde, u.desde, u.pendencias ? String(u.pendencias) : '—']));

  if (r.pendencias.length) {
    titulo(`PENDÊNCIAS EM ABERTO (${r.pendencias.length})`, [180, 83, 9]);
    tabela(['Unid.', 'Setor', 'O quê', 'Situação', 'Responsável', 'Aberto em'],
      r.pendencias.map(p => [textoUnidades(p.unidades, r.n), p.setor || p.grupo, p.titulo, p.status || '—', p.responsavel || '—', fmtD(p.data)]));
  }
  ORDEM_GRUPOS.forEach(g => {
    const itens = r.vinculos.filter(v => v.grupo === g);
    if (!itens.length) return;
    titulo(`${TITULO_GRUPO[g].toUpperCase()} (${itens.length})`);
    tabela(['Unid.', 'Nº', 'O quê', 'Setor', 'Situação', 'Responsável', 'Data', ...(verValores ? ['Valor'] : [])],
      itens.map(v => [textoUnidades(v.unidades, r.n), v.numero || '—', `${v.titulo}${v.porTexto ? ' [por menção]' : ''}`, v.setor || '—', v.status || '—',
        v.responsavel || '—', fmtD(v.data), ...(verValores ? [v.valor != null ? fmtR(v.valor) : '—'] : [])]));
  });

  if (comHistorico) {
    dados.dossies.forEach(d => {
      if (!d.logs.length) return;
      doc.addPage(); y = 16;
      titulo(`HISTÓRICO — ${d.op.opl} (${d.logs.length} evento(s))`, [51, 65, 85]);
      tabela(['Quando', 'Setor', 'Usuário', 'Evento'], d.logs.map(l => [fmtDH(l.data_hora), l.setor || '—', l.usuario_nome || '—', l.evento || '']),
        { columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 } } });
    });
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Dossiê do lote ${r.base} — página ${p} de ${paginas}`, 105, 292, { align: 'center' });
  }
  return doc;
}

// ── Tela ─────────────────────────────────────────────────────────────────────
const Secao = ({ titulo, cor = '#1e293b', children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: cor, textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: `2px solid ${cor}22`, paddingBottom: 3, marginBottom: 7 }}>{titulo}</div>
    {children}
  </div>
);
const th = { textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' };
const td = { padding: '4px 6px', fontSize: 11, borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };

/** `semTitulo`: quando embutido na janela do lote (OpLote.tsx), que já tem o título; cada unidade da tabela abre o detalhe da sua OP. */
export function DossieLote({ base, onVoltar = null, semTitulo = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState({ feitas: 0, total: 0 });
  const [comHistorico, setComHistorico] = useState(true);
  const [gerando, setGerando] = useState(false);
  const usuario = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const verValores = podeVerValores(usuario);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro('');
    carregarLote(base, (feitas, total) => { if (vivo) setProgresso({ feitas, total }); })
      .then(d => { if (vivo) setDados(d); })
      .catch(e => { if (vivo) setErro(e?.message || String(e)); });
    return () => { vivo = false; };
  }, [base]);

  const baixarPdf = async () => {
    setGerando(true);
    try {
      const doc = await montarPdfDossieLote(dados, { comHistorico, verValores });
      doc.save(`Dossie_Lote_${String(dados.base).replace(/[^\w.-]/g, '_')}.pdf`);
    } catch (e) {
      if (!tratarFalhaDeArquivoNovo(e)) alert('Não foi possível gerar o PDF do lote: ' + (e?.message || e));
    } finally { setGerando(false); }
  };

  if (erro) return <div style={{ padding: 20, fontSize: 12, color: '#b91c1c' }}>{erro}</div>;
  if (!dados) return <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>Montando o dossiê do lote{progresso.total ? ` — ${progresso.feitas} de ${progresso.total} OPs lidas` : ''}...</div>;
  if (!dados.dossies.length) return <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>Nenhuma OP encontrada para o lote {base}.</div>;

  const r = resumirLote(dados);
  const o = r.primeira;
  return (
    <div id="dossie-lote" style={{ fontSize: 12, gridColumn: '1 / -1', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          {!semTitulo && <div style={{ fontSize: 17, fontWeight: 800 }}>📦 Lote {r.base}</div>}
          <div style={{ fontSize: 11, color: '#64748b' }}>{o.cliente_nome || '—'} · {r.n} unidade(s)</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={comHistorico} onChange={e => setComHistorico(e.target.checked)} />
            Incluir o histórico completo de cada OP no PDF
          </label>
          <button onClick={baixarPdf} disabled={gerando}
            style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: gerando ? .6 : 1 }}>
            {gerando ? 'Gerando...' : '📄 Baixar PDF para imprimir'}
          </button>
          {onVoltar && (
            <button onClick={onVoltar} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer' }}>← voltar à OP</button>
          )}
        </div>
      </div>

      <Secao titulo="Resumo do lote">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          {[
            ['Cliente', o.cliente_nome], ['Pedido de venda', r.origem.oportunidade?.numero_pv], ['Tipo de projeto', o.tipo_projeto],
            ['Fluxo de entrega', fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega))], ['Unidades', r.n], ['Empresa', o.faturamento_empresa],
            ['Comercial', o.responsavel_comercial || o.vendedor], ['Destino', [o.destino_cidade, o.destino_uf].filter(Boolean).join('/')],
            ['Entrada', fmtD(o.data_entrada)], ['Prazo', r.prazoMin ? (r.prazoMin === r.prazoMax ? fmtD(r.prazoMin) : `${fmtD(r.prazoMin)} a ${fmtD(r.prazoMax)}`) : null],
            ...(verValores ? [['Valor total do lote', fmtR(r.valorTotal)], ['Valor por carro (médio)', fmtR(r.n ? r.valorTotal / r.n : null)]] : []),
          ].map(([rot, val]) => (
            <div key={rot}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{rot}</div>
              <div style={{ fontSize: 11.5 }}>{val ?? '—'}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {r.porSituacao.map(([s, n]) => (
            <span key={s} style={{ fontSize: 10.5, background: '#f1f5f9', borderRadius: 10, padding: '2px 9px', fontWeight: 700 }}>{n} em {s}</span>
          ))}
        </div>
      </Secao>

      {r.textos.length > 0 && (
        <Secao titulo="Descrição e observações" cor="#b45309">
          {r.textos.map(tx => tx.grupos.map((g, k) => (
            <div key={tx.campo + k} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: tx.atencao ? '#b91c1c' : '#94a3b8', textTransform: 'uppercase' }}>{tx.rotulo}{legendaDasUnidades(g, r.n) ? ` · ${legendaDasUnidades(g, r.n)}` : ''}</div>
              <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{g.texto}</div>
            </div>
          )))}
        </Secao>
      )}

      <Secao titulo="Itens vendidos (por carro)" cor="#1d4ed8">
        {r.gruposDeItens.map((g, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            {r.gruposDeItens.length > 1 && <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>Unidades {textoUnidades(g.unidades, r.n)} (os itens diferem entre as unidades):</div>}
            {g.itens.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Item</th><th style={th}>Qt por carro</th><th style={th}>Descrição</th></tr></thead>
                <tbody>{g.itens.map((it, k) => (
                  <tr key={k}><td style={td}>{it.nome || '—'}</td><td style={td}><strong>{it.quantidade ?? '—'}</strong></td><td style={{ ...td, color: '#64748b' }}>{it.descricao || ''}</td></tr>
                ))}</tbody>
              </table>
            ) : <div style={{ fontSize: 11, color: '#94a3b8' }}>Nenhum item vendido registrado.</div>}
          </div>
        ))}
      </Secao>

      <Secao titulo="Carro a carro" cor="#0f766e">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr><th style={th}>Unid.</th><th style={th}>Modelo</th><th style={th}>Chassi</th><th style={th}>Placa</th><th style={th}>Situação</th><th style={th}>Onde está</th><th style={th}>Há</th><th style={th}>Pend.</th></tr></thead>
            <tbody>{r.unidades.map(u => (
              <tr key={u.id}>
                <td style={td}><LinkOpl opl={u.opl} currentUser={usuario} /></td><td style={td}>{u.modelo || '—'}</td><td style={td}>{u.chassi || '—'}</td><td style={td}>{u.placa || '—'}</td>
                <td style={td}>{u.situacao}</td><td style={td}>{u.onde}</td><td style={td}>{u.desde}</td>
                <td style={{ ...td, color: u.pendencias ? '#b45309' : undefined, fontWeight: u.pendencias ? 700 : 400 }}>{u.pendencias || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Secao>

      {r.pendencias.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', marginBottom: 4 }}>⚠️ {r.pendencias.length} pendência(s) em aberto no lote</div>
          <div style={{ fontSize: 11, color: '#78350f' }}>{r.pendencias.map(p => `${p.setor || p.grupo}: ${p.titulo} (${textoUnidades(p.unidades, r.n)})`).join(' · ')}</div>
        </div>
      )}

      {ORDEM_GRUPOS.map(g => {
        const itens = r.vinculos.filter(v => v.grupo === g);
        if (!itens.length) return null;
        return (
          <Secao key={g} titulo={`${TITULO_GRUPO[g]} (${itens.length})`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead><tr><th style={th}>Unid.</th><th style={th}>O quê</th><th style={th}>Setor</th><th style={th}>Situação</th><th style={th}>Responsável</th><th style={th}>Data</th>{verValores && <th style={{ ...th, textAlign: 'right' }}>Valor</th>}</tr></thead>
                <tbody>{itens.map(v => (
                  <tr key={`${v.tipo}:${v.id}`}>
                    <td style={td}>{textoUnidades(v.unidades, r.n)}</td>
                    <td style={td}><strong>{v.numero ? v.numero + ' · ' : ''}{v.titulo}</strong></td>
                    <td style={td}>{v.setor || '—'}</td>
                    <td style={td}><span style={{ fontWeight: 700, color: v.aberto ? '#b45309' : '#16a34a' }}>{v.status || '—'}</span></td>
                    <td style={td}>{v.responsavel || '—'}</td><td style={td}>{fmtD(v.data)}</td>
                    {verValores && <td style={{ ...td, textAlign: 'right' }}>{v.valor != null ? fmtR(v.valor) : '—'}</td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Secao>
        );
      })}

      <Secao titulo="Histórico de cada OP" cor="#334155">
        {dados.dossies.map(d => (
          <details key={d.op.id} style={{ marginBottom: 4 }}>
            <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>{d.op.opl} — {d.logs.length} evento(s)</summary>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
              <tbody>{d.logs.map((l, k) => (
                <tr key={k}><td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDH(l.data_hora)}</td><td style={td}>{l.setor || '—'}</td><td style={td}>{l.usuario_nome || '—'}</td><td style={td}>{l.evento}</td></tr>
              ))}</tbody>
            </table>
          </details>
        ))}
      </Secao>
    </div>
  );
}
