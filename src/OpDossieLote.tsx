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
import { fluxoDaOp, ehUnidadeDeEnvio, resumoDosFluxosDoLote } from './FluxoMisto';
import { diaBR, Faixa, Botao, Selo } from './Interface';
import { mostrarAviso } from './Feedback';
import { explicarErroDoBanco } from './ErroDoBanco';
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
export async function carregarLote(base, aoProgresso: (feitas: number, total: number) => void = () => {}) {
  const b = baseDoLote(base);
  // o próprio número do lote (OP sem sufixo) também entra, caso exista
  const [sufixadas, avulsa] = await Promise.all([
    supabase.from('oples').select('*').like('opl', `${b}/%`).order('opl'),
    supabase.from('oples').select('*').eq('opl', b),
  ]);
  const erroLeitura = sufixadas.error || avulsa.error;
  // 12e77 (25/11/2026): a frase do erro vem em português (antes ia o texto técnico do banco)
  if (erroLeitura) throw new Error('Não foi possível ler as OPs do lote. ' + explicarErroDoBanco(erroLeitura));
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
      // fluxo misto (M2, 27/10/2026): o fluxo de cada unidade e se ela é de envio (sem chassi nem placa)
      fluxo: fluxoLabel(fluxoDaOp(o)), envio: ehUnidadeDeEnvio(o),
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
  // 12e77: o que o dossiê de cada unidade NÃO conseguiu ler (nomes de `carregarDossie().falhas`), com as unidades afetadas. Leitura que falha não vale como "nenhuma":
  // a tela e o PDF avisam que o dossiê está incompleto, e o valor do lote não é mostrado como número se o valor de alguma OP não foi lido (a soma sairia menor, calada)
  const falhasPorNome = new Map();
  ds.forEach(d => (d.falhas || []).forEach(nome => falhasPorNome.set(nome, [...(falhasPorNome.get(nome) || []), sufixoDe(d.op.opl)])));
  const falhas = [...falhasPorNome.entries()].map(([rotulo, unidades]) => ({ rotulo, unidades }));
  const valorNaoLido = falhasPorNome.has('valor da OP');
  // fluxo misto (M2): o fluxo do lote deixa de ser "o da primeira OP"; o destino também pode mudar de uma unidade para outra
  const fluxos = resumoDosFluxosDoLote(ops);
  const porDestino = new Map();
  ops.forEach(o => { const d = [o.destino_cidade, o.destino_uf].filter(Boolean).join('/'); if (d) porDestino.set(d, [...(porDestino.get(d) || []), sufixoDe(o.opl)]); });
  const destino = porDestino.size <= 1 ? ([...porDestino.keys()][0] || '') : [...porDestino.entries()].map(([d, us]) => `${d} (${textoUnidades(us, ops.length)})`).join(' · ');
  return {
    base: dados.base, n: ops.length, primeira, origem: ds[0]?.origem || {}, unidades, porSituacao: [...porSituacao.entries()], fluxos, destino,
    gruposDeItens: [...gruposDeItens.values()], vinculos, pendencias, valorTotal, falhas, valorNaoLido,
    textos: textosDasOps(ops, o => '/' + sufixoDe(o.opl)),
    prazoMin: ops.map(o => o.prazo_entrega_comercial || o.data_prevista_entrega).filter(Boolean).sort()[0] || null,
    prazoMax: ops.map(o => o.prazo_entrega_comercial || o.data_prevista_entrega).filter(Boolean).sort().slice(-1)[0] || null,
  };
}

/** "todas (20)" quando a linha vale para todas as unidades; senão "/01, /02". */
const textoUnidades = (lista, total) => (lista.length >= total && total > 1 ? `todas (${total})` : lista.map(s => '/' + s).join(', '));

/** 12e77: "compras (todas (20)), fretes (/02)" — o que não foi lido e em quais unidades; vazio se tudo foi lido. */
export const fraseDasFalhas = (falhas, total) => (falhas || []).map(f => `${f.rotulo} (${textoUnidades(f.unidades, total)})`).join(', ');
const AVISO_INCOMPLETO = 'Este dossiê pode estar incompleto: o que não foi lido não aparece aqui, e isso não quer dizer que não exista.';
/** O valor do lote só vira número quando o valor de todas as OPs foi lido. */
const valorDoLoteTexto = (r, valor) => (r.valorNaoLido ? 'não lido' : valor);

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
  // 12e77: papel impresso não pode afirmar "nenhuma pendência" quando a leitura falhou: o aviso vai no alto, em vermelho
  if (r.falhas.length) {
    const aviso = doc.splitTextToSize(`ATENÇÃO — NÃO FOI POSSÍVEL LER: ${fraseDasFalhas(r.falhas, r.n)}. ${AVISO_INCOMPLETO}`, 182);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(185, 28, 28);
    doc.text(aviso, 14, y); doc.setTextColor(0); y += aviso.length * 4 + 4;
  }

  titulo('RESUMO DO LOTE');
  const linhasResumo = [
    ['Cliente', o.cliente_nome || '—', 'Pedido de venda', r.origem.oportunidade?.numero_pv || '—'],
    ['Tipo de projeto', o.tipo_projeto || '—', 'Fluxo de entrega', r.fluxos.misto ? 'Misto — ' + r.fluxos.texto : fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega))],
    ['Unidades', String(r.n), 'Empresa', o.faturamento_empresa || '—'],
    ['Comercial', o.responsavel_comercial || o.vendedor || '—', 'Destino', r.destino || '—'],
    ['Entrada', fmtD(o.data_entrada), 'Prazo', r.prazoMin ? (r.prazoMin === r.prazoMax ? fmtD(r.prazoMin) : `${fmtD(r.prazoMin)} a ${fmtD(r.prazoMax)}`) : '—'],
  ];
  if (verValores) linhasResumo.push(['Valor total do lote', valorDoLoteTexto(r, fmtR(r.valorTotal)), 'Valor por carro (médio)', valorDoLoteTexto(r, fmtR(r.n ? r.valorTotal / r.n : null))]);
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
  tabela(['Unid.', ...(r.fluxos.misto ? ['Fluxo'] : []), 'Modelo', 'Chassi', 'Placa', 'Situação', 'Onde está', 'Há', 'Pend.'],
    r.unidades.map(u => ['/' + u.sufixo, ...(r.fluxos.misto ? [u.fluxo] : []), u.modelo || '—', u.chassi || (r.fluxos.misto && u.envio ? 'envio' : '—'), u.placa || (r.fluxos.misto && u.envio ? 'envio' : '—'), u.situacao, u.onde, u.desde, u.pendencias ? String(u.pendencias) : '—']));

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
// 12e77 (25/11/2026): os 42 estilos pintados à mão viraram classes `acn-dlote-*` (design.css); as tabelas seguem com a regra global de tabela (cabeçalho, margens e letra), só a largura mínima é daqui.
const Secao = ({ titulo, tom = undefined, children }: { titulo: any; tom?: any; children?: any }) => (
  <div className="acn-dlote-sec" data-tom={tom}>
    <div className="acn-dlote-sec-titulo">{titulo}</div>
    {children}
  </div>
);

/** `semTitulo`: quando embutido na janela do lote (OpLote.tsx), que já tem o título; cada unidade da tabela abre o detalhe da sua OP. */
export function DossieLote({ base, onVoltar = null, semTitulo = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState({ feitas: 0, total: 0 });
  const [comHistorico, setComHistorico] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [tentativa, setTentativa] = useState(0);   // 12e77: "Tentar de novo" refaz a leitura do lote inteiro
  const usuario = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const verValores = podeVerValores(usuario);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(''); setProgresso({ feitas: 0, total: 0 });
    carregarLote(base, (feitas, total) => { if (vivo) setProgresso({ feitas, total }); })
      .then(d => { if (vivo) setDados(d); })
      .catch(e => { if (vivo) setErro(e?.message || String(e)); });
    return () => { vivo = false; };
  }, [base, tentativa]);

  const baixarPdf = async () => {
    setGerando(true);
    try {
      const doc = await montarPdfDossieLote(dados, { comHistorico, verValores });
      doc.save(`Dossie_Lote_${String(dados.base).replace(/[^\w.-]/g, '_')}.pdf`);
    } catch (e) {
      // 12e77: o aviso nativo (alert) saiu; o de erro fica na tela até a pessoa fechar
      if (!tratarFalhaDeArquivoNovo(e)) mostrarAviso('Não foi possível gerar o PDF do lote: ' + (e?.message || e), 'erro');
    } finally { setGerando(false); }
  };

  const tentarDeNovo = <Botao pequeno onClick={() => setTentativa(t => t + 1)}>Tentar de novo</Botao>;
  if (erro) return <div className="acn-dlote-estado"><Faixa tom="erro" acao={tentarDeNovo}>{erro}</Faixa></div>;
  if (!dados) return <div className="acn-dlote-estado">Montando o dossiê do lote{progresso.total ? ` — ${progresso.feitas} de ${progresso.total} OPs lidas` : ''}...</div>;
  if (!dados.dossies.length) return <div className="acn-dlote-estado">Nenhuma OP encontrada para o lote {base}.</div>;

  const r = resumirLote(dados);
  const o = r.primeira;
  return (
    <div id="dossie-lote" className="acn-dlote">
      <div className="acn-dlote-topo">
        <div>
          {!semTitulo && <div className="acn-dlote-titulo">📦 Lote {r.base}</div>}
          <div className="acn-dlote-sub">{o.cliente_nome || '—'} · {r.n} unidade(s)</div>
        </div>
        <div className="acn-dlote-acoes">
          <label className="acn-dlote-historico">
            <input type="checkbox" checked={comHistorico} onChange={e => setComHistorico(e.target.checked)} />
            Incluir o histórico completo de cada OP no PDF
          </label>
          <Botao variante="primario" pequeno onClick={baixarPdf} disabled={gerando}>
            {gerando ? 'Gerando...' : '📄 Baixar PDF para imprimir'}
          </Botao>
          {onVoltar && <Botao pequeno onClick={onVoltar}>← voltar à OP</Botao>}
        </div>
      </div>

      {r.falhas.length > 0 && (
        <div className="acn-dlote-faixa">
          <Faixa tom="erro" acao={tentarDeNovo}>
            Não foi possível ler: {fraseDasFalhas(r.falhas, r.n)}. {AVISO_INCOMPLETO}
          </Faixa>
        </div>
      )}

      <Secao titulo="Resumo do lote">
        <div className="acn-dlote-resumo">
          {[
            ['Cliente', o.cliente_nome], ['Pedido de venda', r.origem.oportunidade?.numero_pv], ['Tipo de projeto', o.tipo_projeto],
            ['Fluxo de entrega', r.fluxos.misto ? 'Misto — ' + r.fluxos.texto : fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega))], ['Unidades', r.n], ['Empresa', o.faturamento_empresa],
            ['Comercial', o.responsavel_comercial || o.vendedor], ['Destino', r.destino],
            ['Entrada', fmtD(o.data_entrada)], ['Prazo', r.prazoMin ? (r.prazoMin === r.prazoMax ? fmtD(r.prazoMin) : `${fmtD(r.prazoMin)} a ${fmtD(r.prazoMax)}`) : null],
            ...(verValores ? [['Valor total do lote', valorDoLoteTexto(r, fmtR(r.valorTotal))], ['Valor por carro (médio)', valorDoLoteTexto(r, fmtR(r.n ? r.valorTotal / r.n : null))]] : []),
          ].map(([rot, val]) => (
            <div key={rot}>
              <div className="acn-dlote-rot">{rot}</div>
              <div className="acn-dlote-val">{val ?? '—'}</div>
            </div>
          ))}
        </div>
        <div className="acn-dlote-situacoes">
          {r.porSituacao.map(([s, n]) => (
            <Selo key={s} familia="info" ponto={false}>{n} em {s}</Selo>
          ))}
        </div>
      </Secao>

      {r.textos.length > 0 && (
        <Secao titulo="Descrição e observações" tom="atencao">
          {r.textos.map(tx => tx.grupos.map((g, k) => (
            <div key={tx.campo + k} className="acn-dlote-obs">
              <div className="acn-dlote-rot" data-atencao={tx.atencao ? '1' : undefined}>{tx.rotulo}{legendaDasUnidades(g, r.n) ? ` · ${legendaDasUnidades(g, r.n)}` : ''}</div>
              <div className="acn-dlote-obs-texto">{g.texto}</div>
            </div>
          )))}
        </Secao>
      )}

      <Secao titulo="Itens vendidos (por carro)" tom="info">
        {r.gruposDeItens.map((g, i) => (
          <div key={i} className="acn-dlote-grupo">
            {r.gruposDeItens.length > 1 && <div className="acn-dlote-difere">Unidades {textoUnidades(g.unidades, r.n)} (os itens diferem entre as unidades):</div>}
            {g.itens.length ? (
              <table className="acn-dlote-tab">
                <thead><tr><th>Item</th><th>Qt por carro</th><th>Descrição</th></tr></thead>
                <tbody>{g.itens.map((it, k) => (
                  <tr key={k}><td>{it.nome || '—'}</td><td><strong>{it.quantidade ?? '—'}</strong></td><td className="acn-dlote-mudo">{it.descricao || ''}</td></tr>
                ))}</tbody>
              </table>
            ) : <div className="acn-dlote-vazio">Nenhum item vendido registrado.</div>}
          </div>
        ))}
      </Secao>

      <Secao titulo="Carro a carro" tom="marca">
        <div className="acn-rolagem">
          <table className="acn-dlote-tab larga">
            <thead><tr><th>Unid.</th>{r.fluxos.misto && <th>Fluxo</th>}<th>Modelo</th><th>Chassi</th><th>Placa</th><th>Situação</th><th>Onde está</th><th>Há</th><th>Pend.</th></tr></thead>
            <tbody>{r.unidades.map(u => (
              <tr key={u.id}>
                <td><LinkOpl opl={u.opl} currentUser={usuario} /></td>{r.fluxos.misto && <td>{u.fluxo}</td>}<td>{u.modelo || '—'}</td>
                {r.fluxos.misto && u.envio
                  ? <td colSpan={2}><span className="acn-dlote-mudo">envio: sem chassi nem placa</span></td>
                  : <><td>{u.chassi || '—'}</td><td>{u.placa || '—'}</td></>}
                <td>{u.situacao}</td><td>{u.onde}</td><td>{u.desde}</td>
                <td className={u.pendencias ? 'acn-txt-atencao' : undefined}>{u.pendencias || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Secao>

      {r.pendencias.length > 0 && (
        <div className="acn-dlote-faixa">
          <Faixa tom="atencao">
            <strong>{r.pendencias.length} pendência(s) em aberto no lote</strong>
            <div>{r.pendencias.map(p => `${p.setor || p.grupo}: ${p.titulo} (${textoUnidades(p.unidades, r.n)})`).join(' · ')}</div>
          </Faixa>
        </div>
      )}

      {ORDEM_GRUPOS.map(g => {
        const itens = r.vinculos.filter(v => v.grupo === g);
        if (!itens.length) return null;
        return (
          <Secao key={g} titulo={`${TITULO_GRUPO[g]} (${itens.length})`}>
            <div className="acn-rolagem">
              <table className="acn-dlote-tab media">
                <thead><tr><th>Unid.</th><th>O quê</th><th>Setor</th><th>Situação</th><th>Responsável</th><th>Data</th>{verValores && <th className="acn-dir">Valor</th>}</tr></thead>
                <tbody>{itens.map(v => (
                  <tr key={`${v.tipo}:${v.id}`}>
                    <td>{textoUnidades(v.unidades, r.n)}</td>
                    <td><strong>{v.numero ? v.numero + ' · ' : ''}{v.titulo}</strong></td>
                    <td>{v.setor || '—'}</td>
                    <td><span className={v.aberto ? 'acn-txt-atencao' : 'acn-txt-ok'}>{v.status || '—'}</span></td>
                    <td>{v.responsavel || '—'}</td><td>{fmtD(v.data)}</td>
                    {verValores && <td className="acn-dir">{v.valor != null ? fmtR(v.valor) : '—'}</td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Secao>
        );
      })}

      <Secao titulo="Histórico de cada OP">
        {dados.dossies.map(d => (
          <details key={d.op.id} className="acn-dlote-det">
            <summary>{d.op.opl} — {d.logs.length} evento(s)</summary>
            <table className="acn-dlote-tab">
              <tbody>{d.logs.map((l, k) => (
                <tr key={k}><td className="acn-nowrap">{fmtDH(l.data_hora)}</td><td>{l.setor || '—'}</td><td>{l.usuario_nome || '—'}</td><td>{l.evento}</td></tr>
              ))}</tbody>
            </table>
          </details>
        ))}
      </Secao>
    </div>
  );
}
