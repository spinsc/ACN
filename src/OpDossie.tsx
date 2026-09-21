// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DOSSIÊ DA OP — tudo o que aconteceu e tudo o que está pendurado numa OP,
// numa página só, com saída em PDF.
//
// Pedido do usuário em 21/09/2026: "quero tirar relatório de uma OPL específica
// e tudo vinculado a ela vir no relatório — todas as demandas, sendo compra,
// serralheria ou chicote, análise da engenharia e etc".
//
// Quem acha o que está ligado à OP é OpVinculos.ts (um lugar só). Aqui só se
// desenha. Aparece em dois lugares:
//   • aba "Dossiê" dentro do detalhe da OP (abre de qualquer tela pelo número);
//   • aba "Dossiê da OP" em Relatórios, buscando por OPL ou por PV.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { carregarDossie, buscarOps } from './OpVinculos';
import { QuadroItensOp } from './OpItens';
import { fluxoLabel, fluxoEfetivo } from './FluxoEntrega';
import { OplProgressBar } from './AcnTabShared';

const fmtD   = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtDH  = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const fmtR   = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtH   = (h) => `${Number(h || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

const GRUPOS = [
  { id: 'demanda',     titulo: '🧰 Demandas dos setores', cor: '#7c3aed' },
  { id: 'compra',      titulo: '🛒 Compras',              cor: '#16a34a' },
  { id: 'engenharia',  titulo: '📐 Engenharia',           cor: '#0891b2' },
  { id: 'ajuste',      titulo: '🔧 Ajustes',              cor: '#b45309' },
  { id: 'qualidade',   titulo: '✅ Qualidade',            cor: '#15803d' },
  { id: 'frete',       titulo: '🚚 Frete',                cor: '#0e7490' },
  { id: 'agendamento', titulo: '📅 Agendamentos',         cor: '#4f46e5' },
  { id: 'anexo',       titulo: '📎 Anexos',               cor: '#64748b' },
];

const Secao = ({ titulo, cor = '#1e293b', children, vazio }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: cor, textTransform: 'uppercase',
      letterSpacing: '.3px', borderBottom: `2px solid ${cor}22`, paddingBottom: 3, marginBottom: 7 }}>
      {titulo}
    </div>
    {children || <div style={{ fontSize: 11, color: '#94a3b8' }}>{vazio || 'Nada registrado.'}</div>}
  </div>
);

const Campo = ({ rot, children }) => (
  <div>
    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{rot}</div>
    <div style={{ fontSize: 11.5, color: 'var(--txt, #1e293b)' }}>{children ?? '—'}</div>
  </div>
);

const Grade = ({ children, min = 150 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 8 }}>{children}</div>
);

// ── Lista de vínculos de um grupo ────────────────────────────────────────────
function ListaVinculos({ itens, cor }) {
  if (!itens.length) return null;
  const th = { textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' };
  const td = { padding: '4px 6px', fontSize: 11, borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead><tr>
          <th style={th}>O quê</th><th style={th}>Setor</th><th style={th}>Situação</th>
          <th style={th}>Responsável</th><th style={th}>Aberto em</th><th style={{ ...th, textAlign: 'right' }}>Valor</th>
        </tr></thead>
        <tbody>
          {itens.map(v => (
            <tr key={`${v.tipo}:${v.id}`}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>
                  {v.numero ? <span style={{ color: cor, fontWeight: 800 }}>{v.numero} · </span> : null}
                  {v.titulo}
                </div>
                {v.descricao && <div style={{ fontSize: 10, color: '#64748b' }}>{String(v.descricao).slice(0, 160)}</div>}
                {v.porTexto && (
                  <span title="Encontrado pelo número escrito no texto — não é um vínculo gravado"
                    style={{ fontSize: 8.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
                      borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>por menção</span>
                )}
              </td>
              <td style={td}>{v.setor || '—'}</td>
              <td style={td}>
                <span style={{ fontWeight: 700, color: v.aberto ? '#b45309' : '#16a34a' }}>{v.status || '—'}</span>
              </td>
              <td style={td}>{v.responsavel || '—'}</td>
              <td style={td}>{fmtD(v.data)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{v.valor != null ? fmtR(v.valor) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── O dossiê ─────────────────────────────────────────────────────────────────
export function DossieOp({ op, dossieCarregado = null }) {
  const [d, setD] = useState(dossieCarregado);
  const [carregando, setCarregando] = useState(!dossieCarregado);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    if (dossieCarregado) { setD(dossieCarregado); return; }
    if (!op?.id) return;
    let vivo = true;
    setCarregando(true);
    carregarDossie(op).then(r => { if (vivo) { setD(r); setCarregando(false); } });
    return () => { vivo = false; };
  }, [op?.id, dossieCarregado]);

  if (carregando) return <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>Montando o dossiê...</div>;
  if (!d) return <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>OP não encontrada.</div>;

  const { op: o, origem, vinculos, logs, acompanhamentos, irmas, pendencias, tempos, marcos } = d;
  const porGrupo = (g) => vinculos.filter(v => v.grupo === g);
  const totalHoras = tempos.reduce((s, t) => s + t.horas, 0);

  return (
    <div id="dossie-op" style={{ fontSize: 12 }}>
      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{o.opl}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {o.cliente_nome || '—'}{o.modelo ? ` · ${o.modelo}` : ''}{o.placa ? ` · ${o.placa}` : ''}
          </div>
        </div>
        <button onClick={() => gerarPdfDossie(d, setGerandoPdf)} disabled={gerandoPdf}
          style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 5,
            padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: gerandoPdf ? .6 : 1 }}>
          {gerandoPdf ? 'Gerando...' : '📄 Baixar PDF'}
        </button>
      </div>

      <OplProgressBar status={o.status_geral} />

      {/* ── Pendências em aberto: o que interessa de imediato ── */}
      {pendencias.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', margin: '12px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', marginBottom: 4 }}>
            ⚠️ {pendencias.length} pendência(s) em aberto nesta OP
          </div>
          <div style={{ fontSize: 11, color: '#78350f' }}>
            {pendencias.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join(' · ')}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Secao titulo="Identificação">
          <Grade>
            <Campo rot="Situação">{o.status_geral}</Campo>
            <Campo rot="Tipo de projeto">{o.tipo_projeto}</Campo>
            <Campo rot="Fluxo de entrega">{fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega))}</Campo>
            <Campo rot="Quantidade">{o.quantidade || 1}</Campo>
            <Campo rot="Empresa">{o.faturamento_empresa}</Campo>
            <Campo rot="Responsável comercial">{o.responsavel_comercial || o.vendedor}</Campo>
            <Campo rot="Entrada">{fmtD(o.data_entrada)}</Campo>
            <Campo rot="Prazo de entrega">{fmtD(o.prazo_entrega_comercial || o.data_prevista_entrega)}</Campo>
            <Campo rot="Destino">{[o.destino_cidade, o.destino_uf].filter(Boolean).join('/')}</Campo>
            <Campo rot="Chassi">{o.chassi}</Campo>
            <Campo rot="NF-e">{o.numero_nf || o.nfe}</Campo>
            <Campo rot="Valor total">{fmtR(o.valor_total)}</Campo>
          </Grade>
          {irmas.length > 0 && (
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 6 }}>
              Lote: mais {irmas.length} unidade(s) — {irmas.map(i => i.opl).join(', ')}
            </div>
          )}
        </Secao>

        {/* ── Origem da venda ── */}
        <Secao titulo="Origem da venda" cor="#1d4ed8"
          vazio="Sem card do CRM nem empenho de licitação ligados — OP criada direto.">
          {(origem.oportunidade || origem.licitacao || origem.formacoes.length) ? (
            <>
              <Grade>
                {origem.oportunidade && <Campo rot="Oportunidade (CRM)">{origem.oportunidade.titulo}</Campo>}
                {origem.oportunidade && <Campo rot="Pedido de venda">{origem.oportunidade.numero_pv || '—'}</Campo>}
                {origem.oportunidade && <Campo rot="Vendedor">{origem.oportunidade.responsavel_nome}</Campo>}
                {origem.licitacao && <Campo rot="Licitação">{origem.licitacao.numero_processo}</Campo>}
                {origem.licitacao && <Campo rot="Órgão">{origem.licitacao.orgao}</Campo>}
                {origem.pedido && <Campo rot="Empenho / pedido">{origem.pedido.documento || '—'}</Campo>}
                {origem.pedido && <Campo rot="Qtd. do empenho">{origem.pedido.quantidade}</Campo>}
                {origem.pedido && <Campo rot="Data do pedido">{fmtD(origem.pedido.data_pedido)}</Campo>}
              </Grade>
              {origem.formacoes.length > 0 && (
                <div style={{ marginTop: 7, fontSize: 11 }}>
                  <strong>Formação de preços:</strong>{' '}
                  {origem.formacoes.map(f => `${f.nome || 'sem nome'} v${f.versao || 1}${f.vencedora ? ' (oficial)' : ''}`).join(' · ')}
                </div>
              )}
            </>
          ) : null}
        </Secao>

        {/* ── Vendido × BOM × Separado ── */}
        <Secao titulo="O que foi vendido, o que a BOM pediu e o que saiu do estoque" cor="#0f766e"
          vazio="Esta OP não tem itens vendidos nem BOM estruturada (OPs anteriores a set/2026).">
          {(o.itens_vendidos?.length || o.bom_itens?.length) ? <QuadroItensOp opl={o} /> : null}
        </Secao>

        {/* ── Grupos de vínculos ── */}
        {GRUPOS.map(g => {
          const itens = porGrupo(g.id);
          if (!itens.length) return null;
          return (
            <Secao key={g.id} titulo={`${g.titulo} (${itens.length})`} cor={g.cor}>
              <ListaVinculos itens={itens} cor={g.cor} />
            </Secao>
          );
        })}

        {/* ── Tempos ── */}
        {tempos.length > 0 && (
          <Secao titulo={`Tempo por setor — ${fmtH(totalHoras)} no total`} cor="#7c3aed">
            <Grade min={120}>
              {tempos.map(t => <Campo key={t.setor} rot={t.setor}>{fmtH(t.horas)}</Campo>)}
            </Grade>
          </Secao>
        )}

        {/* ── Marcos ── */}
        {marcos.length > 0 && (
          <Secao titulo="Marcos" cor="#0891b2">
            <Grade min={160}>
              {marcos.map(m => <Campo key={m.etapa} rot={m.etapa}>{fmtDH(m.data)}</Campo>)}
            </Grade>
          </Secao>
        )}

        {/* ── Acompanhamento do comercial ── */}
        {acompanhamentos.length > 0 && (
          <Secao titulo={`Acompanhamento (${acompanhamentos.length})`} cor="#b45309">
            {acompanhamentos.map(a => (
              <div key={a.id} style={{ borderLeft: '2px solid #fde68a', paddingLeft: 8, marginBottom: 5 }}>
                <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{fmtDH(a.criado_em)} · {a.usuario_nome || '—'}{a.setor ? ` · ${a.setor}` : ''}</div>
                <div style={{ fontSize: 11 }}>{a.texto}</div>
              </div>
            ))}
          </Secao>
        )}

        {/* ── Linha do tempo ── */}
        <Secao titulo={`Linha do tempo (${logs.length} evento(s))`} cor="#334155"
          vazio="Sem eventos registrados.">
          {logs.length ? (
            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 5 }}>
              {logs.map(l => (
                <div key={l.id} style={{ padding: '5px 8px', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ fontSize: 9.5, color: '#94a3b8' }}>
                    {fmtDH(l.data_hora)} · <strong>{l.setor || '—'}</strong> · {l.usuario_nome || '—'}
                  </div>
                  <div style={{ fontSize: 11 }}>{l.evento}</div>
                  {l.status_anterior !== l.status_novo && (
                    <div style={{ fontSize: 9.5, color: '#64748b' }}>{l.status_anterior} → {l.status_novo}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Secao>
      </div>
    </div>
  );
}

// ── PDF ──────────────────────────────────────────────────────────────────────
async function gerarPdfDossie(d, setGerando) {
  setGerando(true);
  try {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { op: o, origem, vinculos, logs, pendencias, tempos, marcos } = d;
    let y = 16;

    const novaPagina = (precisa = 12) => { if (y + precisa > 285) { doc.addPage(); y = 16; } };
    const titulo = (t, cor = [15, 118, 110]) => {
      novaPagina(14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      doc.setTextColor(cor[0], cor[1], cor[2]);
      doc.text(t, 14, y); doc.setTextColor(0, 0, 0); y += 5;
    };
    const tabela = (head, body) => {
      if (!body.length) return;
      autoTable(doc, {
        head: [head], body, startY: y, theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7, textColor: 255 },
        bodyStyles: { fontSize: 7, cellPadding: 1.4 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 5;
    };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('DOSSIÊ DA ORDEM DE PRODUÇÃO', 105, y, { align: 'center' }); y += 7;
    doc.setFontSize(12); doc.text(String(o.opl || ''), 105, y, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(100); doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 105, y, { align: 'center' });
    doc.setTextColor(0); y += 8;

    titulo('IDENTIFICAÇÃO');
    tabela(['Campo', 'Valor', 'Campo', 'Valor'], [
      ['Cliente', o.cliente_nome || '—', 'Situação', o.status_geral || '—'],
      ['Modelo / veículo', o.modelo || o.veiculo || '—', 'Tipo de projeto', o.tipo_projeto || '—'],
      ['Fluxo de entrega', fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega)), 'Quantidade', String(o.quantidade || 1)],
      ['Chassi', o.chassi || '—', 'Placa', o.placa || '—'],
      ['Entrada', fmtD(o.data_entrada), 'Prazo', fmtD(o.prazo_entrega_comercial || o.data_prevista_entrega)],
      ['Comercial', o.responsavel_comercial || o.vendedor || '—', 'Empresa', o.faturamento_empresa || '—'],
      ['Destino', [o.destino_cidade, o.destino_uf].filter(Boolean).join('/') || '—', 'NF-e', o.numero_nf || o.nfe || '—'],
    ]);

    titulo('ORIGEM DA VENDA', [29, 78, 216]);
    tabela(['Item', 'Informação'], [
      ['Oportunidade (CRM)', origem.oportunidade?.titulo || '—'],
      ['Pedido de venda', origem.oportunidade?.numero_pv || '—'],
      ['Licitação', origem.licitacao ? `${origem.licitacao.numero_processo || ''} — ${origem.licitacao.orgao || ''}` : '—'],
      ['Empenho / pedido', origem.pedido ? `${origem.pedido.documento || 's/ documento'} — ${origem.pedido.quantidade} un. em ${fmtD(origem.pedido.data_pedido)}` : '—'],
      ['Formação de preços', origem.formacoes.length
        ? origem.formacoes.map(f => `${f.nome || 'sem nome'} v${f.versao || 1}${f.vencedora ? ' (oficial)' : ''}`).join('; ') : '—'],
    ]);

    const vendidos = o.itens_vendidos || [], bom = o.bom_itens || [], conf = o.kit_conferencia?.linhas || [];
    if (vendidos.length || bom.length) {
      titulo('VENDIDO × BOM × SEPARADO');
      if (vendidos.length) tabela(['Vendido ao cliente', 'Qt', 'Descrição'],
        vendidos.map(i => [i.nome || '—', String(i.quantidade ?? '—'), i.descricao || '']));
      if (bom.length) tabela(['BOM (material da OP)', 'Qt', 'Separado', 'Observação'],
        bom.map((b, i) => {
          const c = conf.find(x => x.nome === b.nome) || conf[i];
          return [b.nome || '—', String(b.quantidade ?? '—'), c ? String(c.separado ?? '—') : '—', c?.obs || ''];
        }));
    }

    if (pendencias.length) {
      titulo(`PENDÊNCIAS EM ABERTO (${pendencias.length})`, [180, 83, 9]);
      tabela(['Setor', 'O quê', 'Situação', 'Responsável', 'Aberto em'],
        pendencias.map(p => [p.setor || p.grupo, p.titulo, p.status || '—', p.responsavel || '—', fmtD(p.data)]));
    }

    GRUPOS.forEach(g => {
      const itens = vinculos.filter(v => v.grupo === g.id);
      if (!itens.length) return;
      titulo(`${g.titulo.replace(/^[^ ]+ /, '').toUpperCase()} (${itens.length})`);
      tabela(['Nº', 'O quê', 'Setor', 'Situação', 'Responsável', 'Data', 'Valor'],
        itens.map(v => [
          v.numero || '—', `${v.titulo}${v.porTexto ? ' [por menção]' : ''}`, v.setor || '—',
          v.status || '—', v.responsavel || '—', fmtD(v.data), v.valor != null ? fmtR(v.valor) : '—',
        ]));
    });

    if (tempos.length) {
      titulo('TEMPO POR SETOR', [124, 58, 237]);
      tabela(['Setor', 'Horas'], tempos.map(t => [t.setor, fmtH(t.horas)]));
    }
    if (marcos.length) {
      titulo('MARCOS', [8, 145, 178]);
      tabela(['Etapa', 'Quando'], marcos.map(m => [m.etapa, fmtDH(m.data)]));
    }
    if (logs.length) {
      titulo(`LINHA DO TEMPO (${logs.length})`, [51, 65, 85]);
      tabela(['Quando', 'Setor', 'Usuário', 'Evento'],
        logs.map(l => [fmtDH(l.data_hora), l.setor || '—', l.usuario_nome || '—', l.evento || '']));
    }

    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`Dossiê da OP ${o.opl} — página ${p} de ${paginas}`, 105, 292, { align: 'center' });
    }
    doc.save(`Dossie_${String(o.opl || 'OP').replace(/[^\w.-]/g, '_')}.pdf`);
  } catch (e) {
    alert('Não foi possível gerar o PDF: ' + (e?.message || e));
  } finally {
    setGerando(false);
  }
}

// ── Relatórios: busca por OPL ou PV e mostra o dossiê ────────────────────────
export function RelDossieOp() {
  const [termo, setTermo] = useState('');
  const [opcoes, setOpcoes] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [dossie, setDossie] = useState(null);
  const [montando, setMontando] = useState(false);

  const buscar = async (e) => {
    e?.preventDefault?.();
    if (!termo.trim()) return;
    setBuscando(true); setDossie(null);
    const ops = await buscarOps(termo);
    setOpcoes(ops);
    setBuscando(false);
    if (ops.length === 1) abrir(ops[0]);
  };

  const abrir = async (op) => {
    setMontando(true);
    const d = await carregarDossie(op.id);
    setDossie(d); setMontando(false);
  };

  return (
    <div>
      <form onSubmit={buscar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={termo} onChange={e => setTermo(e.target.value)} aria-label="Número da OP ou do pedido de venda"
          placeholder="Número da OP (ex.: A1530.2608) ou do pedido de venda (ex.: 1212)"
          style={{ flex: 1, minWidth: 240, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }} />
        <button type="submit" disabled={buscando}
          style={{ background: '#1e293b', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {buscando ? 'Buscando...' : '🔍 Buscar'}
        </button>
      </form>

      {opcoes && opcoes.length === 0 && (
        <div style={{ fontSize: 12, color: '#b45309' }}>Nenhuma OP encontrada para "{termo}".</div>
      )}
      {opcoes && opcoes.length > 1 && !dossie && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{opcoes.length} OPs encontradas — escolha uma:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {opcoes.map(op => (
              <button key={op.id} onClick={() => abrir(op)}
                style={{ textAlign: 'left', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 5,
                  background: 'var(--bg-card, #fff)', cursor: 'pointer', fontSize: 11.5 }}>
                <strong>{op.opl}</strong> — {op.cliente_nome || '—'} · {op.status_geral}
              </button>
            ))}
          </div>
        </div>
      )}
      {montando && <div style={{ fontSize: 12, color: '#64748b' }}>Montando o dossiê...</div>}
      {dossie && (
        <>
          {opcoes?.length > 1 && (
            <button onClick={() => setDossie(null)}
              style={{ marginBottom: 8, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', fontSize: 10.5, cursor: 'pointer' }}>
              ← voltar à lista
            </button>
          )}
          <DossieOp op={dossie.op} dossieCarregado={dossie} />
        </>
      )}
    </div>
  );
}

// ── Modal: o dossiê aberto por cima do detalhe da OP ─────────────────────────
export function ModalDossieOp({ op, onClose }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 900, width: '96vw', maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ background: '#0f766e', color: '#fff', margin: '-14px -14px 12px', padding: '10px 16px',
          borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>📚 Dossiê da OP {op?.opl}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <DossieOp op={op} />
      </div>
    </div>
  );
}
