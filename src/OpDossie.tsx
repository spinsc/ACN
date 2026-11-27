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
//
// 12e80 (25/11/2026): migrado para o design system (classes `acn-dos-*` no design.css; nenhum `style` solto, nenhum botão cru) e com a leitura recusada
// dita em voz alta: o que o banco não deixou ler (`falhas` do `carregarDossie`) aparece numa faixa vermelha com "Tentar de novo", no PDF e no "Onde está
// agora"; antes a página mostrava "nenhuma compra" e "sem pendências" quando a leitura tinha falhado. Nenhuma regra de negócio mudou.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { tratarFalhaDeArquivoNovo } from './VersaoNova';
import { carregarDossie, buscarOps } from './OpVinculos';
import { QuadroItensOp, conferenciaInicial } from './OpItens';
import { RespostasDaOp } from './RespostasDaOp';
import { fluxoLabel, fluxoEfetivo, soTerceiros } from './FluxoEntrega';
import { OplProgressBar } from './AcnTabShared';
import { diaBR, Botao, Faixa, Selo } from './Interface';
import { mostrarAviso } from './Feedback';
import { textosDasOps } from './TextosDaOp';
import { OndeEstaAgora } from './OndeEstaAgora';
import { DossieLote, baseDoLote } from './OpDossieLote';
import { QuadroComprasLigadas, podePedirCompraDaOp, usuarioAtual } from './ComprasLigadas';
import { QuadroServicosLigados } from './TerceirosLigados';
import { QuadroFiscalDaOp } from './FiscalProntidaoTela';

// Entrada, prazo e data do pedido são colunas do tipo date, e a data dos vínculos mistura date e data com hora: `diaBR` lê do texto a data pura e converte a que tem hora (R16, 05/10/2026; antes `new Date(d)`: 0 de 32 batiam com o banco).
const fmtD   = (d) => diaBR(d);
const fmtDH  = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const fmtR   = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtH   = (h) => `${Number(h || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

// `tom` escolhe a cor do título da seção por token do guia (antes cada grupo tinha o seu hexadecimal escrito à mão; o roxo virou a cor da marca)
const GRUPOS = [
  { id: 'demanda',     titulo: '🧰 Demandas dos setores', tom: 'marca' },
  { id: 'compra',      titulo: '🛒 Compras',              tom: 'ok' },
  { id: 'engenharia',  titulo: '📐 Engenharia',           tom: 'info' },
  { id: 'ajuste',      titulo: '🔧 Ajustes',              tom: 'atencao' },
  { id: 'qualidade',   titulo: '✅ Qualidade',            tom: 'ok' },
  { id: 'frete',       titulo: '🚚 Frete',                tom: 'info' },
  { id: 'agendamento', titulo: '📅 Agendamentos',         tom: 'info' },
  { id: 'anexo',       titulo: '📎 Anexos',               tom: 'neutro' },
];

/** O que a faixa e o PDF dizem quando o banco recusou alguma leitura. Leitura que falha não vale como "nenhum". */
const AVISO_INCOMPLETO = 'Este dossiê pode estar incompleto: o que não foi lido não aparece aqui, e isso não quer dizer que não exista.';
export const frasePorFalhas = (falhas) => `Não foi possível ler: ${(falhas || []).join(', ')}. ${AVISO_INCOMPLETO}`;

const Secao = ({ titulo, tom = 'ink', children, vazio = undefined }: { titulo: any; tom?: string; children?: any; vazio?: any }) => (
  <div className="acn-dos-sec" data-tom={tom}>
    <div className="acn-dos-sec-titulo">{titulo}</div>
    {children || <div className="acn-dos-nada">{vazio || 'Nada registrado.'}</div>}
  </div>
);

const Campo = ({ rot, children }) => (
  <div>
    <div className="acn-dos-rot">{rot}</div>
    <div className="acn-dos-val">{children ?? '—'}</div>
  </div>
);

const Grade = ({ children, min = 150 }) => (
  <div className={'acn-dos-grade' + (min === 120 ? ' m120' : min === 160 ? ' m160' : '')}>{children}</div>
);

// ── Lista de vínculos de um grupo ────────────────────────────────────────────
function ListaVinculos({ itens, valorNaoLido }) {
  if (!itens.length) return null;
  return (
    <div className="acn-rolagem">
      <table className="acn-dos-tab">
        <thead><tr>
          <th>O quê</th><th>Setor</th><th>Situação</th>
          <th>Responsável</th><th>Aberto em</th><th className="acn-dir">Valor</th>
        </tr></thead>
        <tbody>
          {itens.map(v => (
            <tr key={`${v.tipo}:${v.id}`}>
              <td>
                <div className="acn-dos-vinc-nome">
                  {v.numero ? <span className="acn-dos-num">{v.numero} · </span> : null}
                  {v.titulo}
                </div>
                {v.descricao && <div className="acn-dos-vinc-desc">{String(v.descricao).slice(0, 160)}</div>}
                {v.porTexto && (
                  <Selo familia="atencao" ponto={false} title="Encontrado pelo número escrito no texto — não é um vínculo gravado">por menção</Selo>
                )}
              </td>
              <td>{v.setor || '—'}</td>
              <td>
                <span className={v.aberto ? 'acn-txt-atencao' : 'acn-txt-ok'}>{v.status || '—'}</span>
              </td>
              <td>{v.responsavel || '—'}</td>
              <td>{fmtD(v.data)}</td>
              {/* a leitura do valor das compras recusada: o campo diz "não lido" em vez de "—" (que significa "sem valor") */}
              <td className="acn-dir">{v.grupo === 'compra' && valorNaoLido ? 'não lido' : v.valor != null ? fmtR(v.valor) : '—'}</td>
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
  const pdfOcupado = useRef(false);   // dois cliques no mesmo instante geravam dois PDFs (o botão só desliga depois do desenho)
  const [erroMontagem, setErroMontagem] = useState('');
  const [tentativa, setTentativa] = useState(0);
  // dossiê do lote inteiro (pedido do usuário em 16/10/2026): troca esta tela pela do lote, com o botão de voltar
  const [verLote, setVerLote] = useState(false);

  useEffect(() => {
    if (dossieCarregado && tentativa === 0) { setD(dossieCarregado); return; }
    if (!op?.id) return;
    let vivo = true;
    setCarregando(true);
    carregarDossie(op)
      .then(r => { if (vivo) { setD(r); setErroMontagem(''); setCarregando(false); } })
      .catch(() => { if (vivo) { setErroMontagem('Não foi possível montar o dossiê agora: o banco não respondeu.'); setCarregando(false); } });
    return () => { vivo = false; };
  }, [op?.id, dossieCarregado, tentativa]);

  const tentarDeNovo = <Botao pequeno onClick={() => setTentativa(n => n + 1)}>Tentar de novo</Botao>;
  if (carregando) return <div className="acn-dos-estado">Montando o dossiê...</div>;
  if (erroMontagem && !d) return <div className="acn-dos-estado"><Faixa tom="erro" acao={tentarDeNovo}>{erroMontagem}</Faixa></div>;
  if (!d) return <div className="acn-dos-estado">OP não encontrada.</div>;

  const { op: o, origem, vinculos, logs, acompanhamentos, irmas, pendencias, tempos, marcos } = d;
  const falhas = d.falhas || [];
  const valorDaOpNaoLido = falhas.includes('valor da OP');
  const valorDasComprasNaoLido = falhas.includes('valor das compras');
  if (verLote) return <DossieLote base={baseDoLote(o.opl)} onVoltar={() => setVerLote(false)} />;
  const porGrupo = (g) => vinculos.filter(v => v.grupo === g);
  const totalHoras = tempos.reduce((s, t) => s + t.horas, 0);

  const baixarPdf = async () => {
    if (pdfOcupado.current) return;
    pdfOcupado.current = true;
    try { await gerarPdfDossie(d, setGerandoPdf); } finally { pdfOcupado.current = false; }
  };

  return (
    <div id="dossie-op" className="acn-dos">
      {/* ── Cabeçalho ── */}
      <div className="acn-dos-topo">
        <div>
          <div className="acn-dos-opl">{o.opl}</div>
          <div className="acn-dos-sub">
            {o.cliente_nome || '—'}{o.modelo ? ` · ${o.modelo}` : ''}{o.placa ? ` · ${o.placa}` : ''}
          </div>
        </div>
        <div className="acn-dos-acoes">
          {irmas.length > 0 && (
            <Botao pequeno onClick={() => setVerLote(true)} title="O lote inteiro numa página só, com PDF para imprimir">
              📦 Dossiê do lote ({irmas.length + 1} unidades)
            </Botao>
          )}
          <Botao variante="primario" pequeno onClick={baixarPdf} disabled={gerandoPdf}>
            {gerandoPdf ? 'Gerando...' : '📄 Baixar PDF'}
          </Botao>
        </div>
      </div>

      {/* leitura recusada: o dossiê segue na tela com o que foi lido, e diz o que faltou */}
      {falhas.length > 0 && (
        <div className="acn-dos-faixa">
          <Faixa tom="erro" acao={tentarDeNovo}>{frasePorFalhas(falhas)}</Faixa>
        </div>
      )}
      {erroMontagem && d && (
        <div className="acn-dos-faixa"><Faixa tom="erro" acao={tentarDeNovo}>{erroMontagem} O que está na tela pode estar desatualizado.</Faixa></div>
      )}

      <OndeEstaAgora op={o} vinculos={vinculos} logs={logs} falhas={falhas} />

      <OplProgressBar status={o.status_geral} op={o} />

      {/* ── Pendências em aberto: o que interessa de imediato ── */}
      {pendencias.length > 0 && (
        <div className="acn-dos-pend">
          <div className="acn-dos-pend-tit">
            ⚠️ {pendencias.length} pendência(s) em aberto nesta OP
          </div>
          <div className="acn-dos-pend-txt">
            {pendencias.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join(' · ')}
          </div>
        </div>
      )}

      <div className="acn-dos-corpo">
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
            {o.numero_nf_servico && <Campo rot="NFS-e (serviço)">{o.numero_nf_servico}</Campo>}
            <Campo rot="Valor total">{valorDaOpNaoLido ? 'não lido' : fmtR(o.valor_total)}</Campo>
          </Grade>
          {irmas.length > 0 && (
            <div className="acn-dos-lote">
              Lote: mais {irmas.length} unidade(s) — {irmas.map(i => i.opl).join(', ')}
            </div>
          )}
        </Secao>

        {/* ── Origem da venda ── */}
        <Secao titulo="Origem da venda" tom="info"
          vazio={falhas.some(f => /card do CRM|pedido da licitação|licitação|formação/i.test(f))
            ? 'Não foi possível ler a origem da venda agora (veja o aviso no alto).'
            : 'Sem card do CRM nem empenho de licitação ligados — OP criada direto.'}>
          {(origem.oportunidade || origem.licitacao || origem.formacoes.length) ? (
            <>
              <Grade>
                {origem.oportunidade && <Campo rot="Oportunidade (CRM)">{origem.oportunidade.titulo}</Campo>}
                {origem.oportunidade && <Campo rot="Pedido de venda">{origem.oportunidade.numero_pv || '—'}</Campo>}
                {origem.oportunidade && <Campo rot="Vendedor">{origem.oportunidade.responsavel_nome}</Campo>}
                {origem.licitacao && <Campo rot="Licitação">{origem.licitacao.numero}</Campo>}
                {origem.licitacao && <Campo rot="Órgão">{origem.licitacao.orgao}</Campo>}
                {origem.pedido && <Campo rot="Empenho / pedido">{origem.pedido.documento || '—'}</Campo>}
                {origem.pedido && <Campo rot="Qtd. do empenho">{origem.pedido.quantidade}</Campo>}
                {origem.pedido && <Campo rot="Data do pedido">{fmtD(origem.pedido.data_pedido)}</Campo>}
              </Grade>
              {origem.formacoes.length > 0 && (
                <div className="acn-dos-formacao">
                  <strong>Formação de preços:</strong>{' '}
                  {origem.formacoes.map(f => `${f.nome || 'sem nome'} v${f.versao || 1}${f.vencedora ? ' (oficial)' : ''}`).join(' · ')}
                </div>
              )}
            </>
          ) : null}
        </Secao>

        {/* ── Nota fiscal (26/11/2026, preparação do módulo fiscal): sem nota, o que falta para a OP virar nota; com nota, a guardada no arquivo do Fiscal ── */}
        {o.status_geral !== 'Cancelado' && (
          <Secao titulo="Nota fiscal" tom="ok">
            <QuadroFiscalDaOp op={o} currentUser={usuarioAtual()} />
          </Secao>
        )}

        {/* ── Descrição e observações (22/10/2026: não apareciam no dossiê) ── */}
        {textosDasOps([o]).length > 0 && (
          <Secao titulo="Descrição e observações" tom="atencao">
            {textosDasOps([o]).map(tx => (
              <div key={tx.campo} className="acn-dos-obs">
                <div className="acn-dos-rot" data-atencao={tx.atencao ? '1' : undefined}>{tx.rotulo}</div>
                <div className="acn-dos-obs-texto">{tx.grupos[0].texto}</div>
              </div>
            ))}
          </Secao>
        )}

        {/* ── Vendido × BOM × Separado ── */}
        <Secao titulo="O que foi vendido, o que a BOM pediu e o que saiu do estoque" tom="marca"
          vazio="Esta OP não tem itens vendidos nem BOM estruturada (OPs anteriores a set/2026).">
          {(o.itens_vendidos?.length || o.bom_itens?.length) ? (
            <>
              <QuadroItensOp opl={o} />
              {/* etapa 4 (15/10/2026): as respostas sobre o carro e a troca delas enquanto a OP ainda não saiu do PCP */}
              <RespostasDaOp op={o} />
            </>
          ) : null}
        </Secao>

        {/* 26/10/2026: o SAC pede compra a partir da OP; a compra nasce ligada à OP e aparece no grupo "Compras" logo abaixo (a lista não se repete aqui) */}
        {podePedirCompraDaOp(usuarioAtual()) && (
          <QuadroComprasLigadas vinculoTipo="op" vinculoId={o.id} descricao={`${o.opl || ''} — ${o.cliente_nome || o.modelo || ''}`.replace(/ — $/, '')}
            titulo="Pedir compra para esta OP" origemSetor="SAC" opl={o.opl} mostrarLista={false} />
        )}

        {/* 23/11/2026 (T5 de Serviços de terceiros): o que já foi pedido a quem é de fora para esta OP (película, pintura, lavagem…), com a situação, e o botão de pedir mais; qualquer pessoa pede, como no menu "Mais ações da OP" */}
        <QuadroServicosLigados ligacaoTipo="op" ligacaoId={o.id} descricao={`${o.opl || ''} — ${o.cliente_nome || o.modelo || ''}`.replace(/ — $/, '')}
          podePedir={o.status_geral !== 'Cancelado'} titulo="Serviços de terceiros desta OP" exigeServico={soTerceiros(o.fluxo_entrega) && o.status_geral !== 'Cancelado'} />

        {/* ── Grupos de vínculos ── */}
        {GRUPOS.map(g => {
          const itens = porGrupo(g.id);
          if (!itens.length) return null;
          return (
            <Secao key={g.id} titulo={`${g.titulo} (${itens.length})`} tom={g.tom}>
              <ListaVinculos itens={itens} valorNaoLido={valorDasComprasNaoLido} />
            </Secao>
          );
        })}

        {/* ── Tempos ── */}
        {tempos.length > 0 && (
          <Secao titulo={`Tempo por setor — ${fmtH(totalHoras)} no total`} tom="marca">
            <Grade min={120}>
              {tempos.map(t => <Campo key={t.setor} rot={t.setor}>{fmtH(t.horas)}</Campo>)}
            </Grade>
          </Secao>
        )}

        {/* ── Marcos ── */}
        {marcos.length > 0 && (
          <Secao titulo="Marcos" tom="info">
            <Grade min={160}>
              {marcos.map(m => <Campo key={m.etapa} rot={m.etapa}>{fmtDH(m.data)}</Campo>)}
            </Grade>
          </Secao>
        )}

        {/* ── Acompanhamento do comercial ── */}
        {acompanhamentos.length > 0 && (
          <Secao titulo={`Acompanhamento (${acompanhamentos.length})`} tom="atencao">
            {acompanhamentos.map(a => (
              <div key={a.id} className="acn-dos-nota">
                <div className="acn-dos-meta">{fmtDH(a.criado_em)} · {a.usuario_nome || '—'}{a.setor ? ` · ${a.setor}` : ''}</div>
                <div className="acn-dos-nota-texto">{a.texto}</div>
              </div>
            ))}
          </Secao>
        )}

        {/* ── Linha do tempo ── */}
        <Secao titulo={`Linha do tempo (${logs.length} evento(s))`}
          vazio={falhas.includes('histórico') ? 'Não foi possível ler o histórico agora (veja o aviso no alto).' : 'Sem eventos registrados.'}>
          {logs.length ? (
            <div className="acn-dos-log">
              {logs.map(l => (
                <div key={l.id} className="acn-dos-log-item">
                  <div className="acn-dos-meta">
                    {fmtDH(l.data_hora)} · <strong>{l.setor || '—'}</strong> · {l.usuario_nome || '—'}
                  </div>
                  <div className="acn-dos-log-evento">{l.evento}</div>
                  {l.status_anterior !== l.status_novo && (
                    <div className="acn-dos-meta">{l.status_anterior} → {l.status_novo}</div>
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
    const falhas = d.falhas || [];
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

    // 12e80: papel impresso não pode afirmar "nenhuma pendência" nem "sem compras" quando a leitura falhou: o aviso vai no alto, em vermelho (como no dossiê do lote)
    if (falhas.length) {
      const aviso = doc.splitTextToSize(`ATENÇÃO — ${frasePorFalhas(falhas).replace(/^Não foi possível ler/, 'NÃO FOI POSSÍVEL LER')}`, 182);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(185, 28, 28);
      doc.text(aviso, 14, y); doc.setTextColor(0); y += aviso.length * 4 + 4;
    }

    titulo('IDENTIFICAÇÃO');
    tabela(['Campo', 'Valor', 'Campo', 'Valor'], [
      ['Cliente', o.cliente_nome || '—', 'Situação', o.status_geral || '—'],
      ['Modelo / veículo', o.modelo || o.veiculo || '—', 'Tipo de projeto', o.tipo_projeto || '—'],
      ['Fluxo de entrega', fluxoLabel(fluxoEfetivo(o.tipo_projeto, o.fluxo_entrega)), 'Quantidade', String(o.quantidade || 1)],
      ['Chassi', o.chassi || '—', 'Placa', o.placa || '—'],
      ['Entrada', fmtD(o.data_entrada), 'Prazo', fmtD(o.prazo_entrega_comercial || o.data_prevista_entrega)],
      ['Comercial', o.responsavel_comercial || o.vendedor || '—', 'Empresa', o.faturamento_empresa || '—'],
      ['Destino', [o.destino_cidade, o.destino_uf].filter(Boolean).join('/') || '—', 'NF-e', [o.numero_nf || o.nfe, o.numero_nf_servico ? 'NFS-e ' + o.numero_nf_servico : ''].filter(Boolean).join(' · ') || '—'],
    ]);

    titulo('ORIGEM DA VENDA', [29, 78, 216]);
    tabela(['Item', 'Informação'], [
      ['Oportunidade (CRM)', origem.oportunidade?.titulo || '—'],
      ['Pedido de venda', origem.oportunidade?.numero_pv || '—'],
      ['Licitação', origem.licitacao ? `${origem.licitacao.numero || ''} —${origem.licitacao.orgao || ''}` : '—'],
      ['Empenho / pedido', origem.pedido ? `${origem.pedido.documento || 's/ documento'} — ${origem.pedido.quantidade} un. em ${fmtD(origem.pedido.data_pedido)}` : '—'],
      ['Formação de preços', origem.formacoes.length
        ? origem.formacoes.map(f => `${f.nome || 'sem nome'} v${f.versao || 1}${f.vencedora ? ' (oficial)' : ''}`).join('; ') : '—'],
    ]);

    const vendidos = o.itens_vendidos || [], bom = o.bom_itens || [], conf = o.kit_conferencia?.linhas || [];
    if (vendidos.length || bom.length) {
      titulo('VENDIDO × BOM × SEPARADO');
      if (vendidos.length) tabela(['Vendido ao cliente', 'Qt', 'Descrição'],
        vendidos.map(i => [i.nome || '—', String(i.quantidade ?? '—'), i.descricao || '']));
      if (bom.length) {
        // 06/11/2026: por ITEM, como a separação do Almoxarifado (os itens iguais da BOM somados; a conferência antiga, linha a linha, vem somada por item)
        const itensDaBom = conferenciaInicial(o);
        const comSerial = conf.some(x => String(x?.seriais || '').trim());   // o serial de cada item (separação do Almoxarifado, 23/10/2026) só ganha coluna quando existe
        tabela(['BOM (material da OP)', 'Qt', 'Separado', ...(comSerial ? ['Serial(is)'] : []), 'Observação'],
          itensDaBom.map(b => [b.nome || '—', String(b.planejado ?? '—'), conf.length ? String(b.separado ?? '—') : '—', ...(comSerial ? [b.seriais || ''] : []), conf.length ? (b.obs || '') : '']));
      }
    }

    if (pendencias.length) {
      titulo(`PENDÊNCIAS EM ABERTO (${pendencias.length})`, [180, 83, 9]);
      tabela(['Setor', 'O quê', 'Situação', 'Responsável', 'Aberto em'],
        pendencias.map(p => [p.setor || p.grupo, p.titulo, p.status || '—', p.responsavel || '—', fmtD(p.data)]));
    }

    const valorDasComprasNaoLido = falhas.includes('valor das compras');
    GRUPOS.forEach(g => {
      const itens = vinculos.filter(v => v.grupo === g.id);
      if (!itens.length) return;
      titulo(`${g.titulo.replace(/^[^ ]+ /, '').toUpperCase()} (${itens.length})`);
      tabela(['Nº', 'O quê', 'Setor', 'Situação', 'Responsável', 'Data', 'Valor'],
        itens.map(v => [
          v.numero || '—', `${v.titulo}${v.porTexto ? ' [por menção]' : ''}`, v.setor || '—',
          v.status || '—', v.responsavel || '—', fmtD(v.data), g.id === 'compra' && valorDasComprasNaoLido ? 'não lido' : v.valor != null ? fmtR(v.valor) : '—',
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
    if (!tratarFalhaDeArquivoNovo(e)) mostrarAviso('Não foi possível gerar o PDF: ' + (e?.message || e), 'erro');
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
  const [erro, setErro] = useState('');   // a busca ou a leitura da OP recusada pelo banco: nunca vale como "nenhuma OP"
  const ocupado = useRef(false);
  // lote inteiro (pedido do usuário em 16/10/2026): quando o número digitado casa com várias unidades de um mesmo lote, a busca oferece o dossiê dele
  const [lote, setLote] = useState(null);
  const lotesAchados = (() => {
    const porBase = new Map();
    (opcoes || []).forEach(op => { if (/\/\d+$/.test(String(op.opl || '').trim())) porBase.set(baseDoLote(op.opl), (porBase.get(baseDoLote(op.opl)) || 0) + 1); });
    return [...porBase.entries()].filter(([, n]) => n > 1);
  })();

  const buscar = async (e) => {
    e?.preventDefault?.();
    if (!termo.trim() || ocupado.current) return;
    ocupado.current = true;
    setBuscando(true); setDossie(null); setLote(null); setErro('');
    try {
      const falhas = [];
      const ops = await buscarOps(termo, falhas);
      if (!ops.length && falhas.length) { setOpcoes(null); setErro('Não foi possível buscar agora: o banco não respondeu. Isso não quer dizer que a OP não exista — tente de novo.'); return; }
      setOpcoes(ops);
      if (ops.length === 1) await abrir(ops[0]);
    } catch {
      setOpcoes(null); setErro('Não foi possível buscar agora: o banco não respondeu. Tente de novo.');
    } finally {
      ocupado.current = false;
      setBuscando(false);
    }
  };

  const abrir = async (op) => {
    setMontando(true); setErro('');
    try {
      const d = await carregarDossie(op.id);
      if (!d) setErro(`A OP ${op.opl} não foi encontrada.`);
      setDossie(d);
    } catch {
      setDossie(null);
      setErro(`Não foi possível abrir a OP ${op.opl} agora: o banco não respondeu. Tente de novo.`);
    } finally {
      setMontando(false);
    }
  };

  return (
    <div>
      <form onSubmit={buscar} className="acn-dos-busca">
        <input value={termo} onChange={e => setTermo(e.target.value)} aria-label="Número da OP ou do pedido de venda" className="acn-input acn-dos-busca-campo"
          placeholder="Número da OP (ex.: A1530.2608) ou do pedido de venda (ex.: 1212)" />
        <Botao type="submit" variante="primario" disabled={buscando}>
          {buscando ? 'Buscando...' : '🔍 Buscar'}
        </Botao>
      </form>

      {erro && <div className="acn-dos-faixa"><Faixa tom="erro">{erro}</Faixa></div>}
      {opcoes && opcoes.length === 0 && !erro && (
        <div className="acn-dos-nenhuma">Nenhuma OP encontrada para "{termo}".</div>
      )}
      {lote && <DossieLote base={lote} onVoltar={() => setLote(null)} />}
      {opcoes && opcoes.length > 1 && !dossie && !lote && (
        <div className="acn-dos-opcoes">
          {lotesAchados.map(([base, n]) => (
            <Botao key={base} className="acn-dos-lote-btn" onClick={() => setLote(base)}>
              📦 Dossiê do lote inteiro: {base} ({n} unidades)
            </Botao>
          ))}
          <div className="acn-dos-opcoes-tit">{opcoes.length} OPs encontradas — escolha uma:</div>
          <div className="acn-dos-opcoes-lista">
            {opcoes.map(op => (
              <Botao key={op.id} className="acn-dos-opcao" onClick={() => abrir(op)}>
                <strong>{op.opl}</strong> — {op.cliente_nome || '—'} · {op.status_geral}
              </Botao>
            ))}
          </div>
        </div>
      )}
      {montando && <div className="acn-dos-montando">Montando o dossiê...</div>}
      {dossie && (
        <>
          {opcoes?.length > 1 && (
            <Botao pequeno className="acn-dos-volta" onClick={() => setDossie(null)}>
              ← voltar à lista
            </Botao>
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
    <div className="modal-overlay acn-dos-fundo"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-dos-jan">
        <div className="acn-dos-jan-cab">
          <div className="acn-dos-jan-titulo">📚 Dossiê da OP {op?.opl}</div>
          <Botao variante="discreto" className="acn-dos-fechar" onClick={onClose} aria-label="Fechar o dossiê">✕</Botao>
        </div>
        <DossieOp op={op} />
      </div>
    </div>
  );
}
