// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OpItens — o que foi vendido, o que a Engenharia planejou e o que saiu no kit
//
//   1. Vendido  (oples.itens_vendidos) — Comercial, ao gerar a OP. Obrigatório.
//      Pode vir da formação de preços da venda ou do item do edital, ou ser
//      preenchido à mão. No lote é POR UNIDADE (cada OP /NN recebe a lista).
//   2. BOM      (oples.bom_itens) — Engenharia, ao liberar a BOM. Material do
//      Cadastro de Itens (kit abre nos itens); item fora do cadastro é aceito,
//      mas fica marcado "não cadastrado". Sugerida a partir do vendido.
//   3. Separado (oples.kit_conferencia) — Almoxarifado, no kiting: a quantidade
//      separada de cada linha da BOM. Diferença exige observação e o kit sai
//      "com pendência".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';
import { BuscaCadastro, ItensDemandaEditor, itemVazio, itensPreenchidos, estruturaParaDemanda } from './DemandaItens';
import { SelectBusca, Botao } from './Interface';
import Icone from './Icone';
import { mdiPackageVariantClosed, mdiArrowDown, mdiClipboardTextOutline, mdiClose, mdiToolboxOutline, mdiAutoFix } from '@mdi/js';

const num = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};
const fmtQ = (v: any) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
// 12e43 (09/10/2026): a aparência vive em design.css (classes acn-opit-*); aqui ficam só as regras e os textos

// ── 1. VENDIDO ───────────────────────────────────────────────────────────────

/** Itens da formação de preços ligada à venda (card do CRM e/ou licitação) */
export async function itensDaFormacao({ crmId, licitacaoId }: { crmId?: string | null; licitacaoId?: string | null }) {
  const filtros = [crmId ? `and(tipo.eq.crm,processo_id.eq.${crmId})` : null, licitacaoId ? `and(tipo.eq.licitacao,processo_id.eq.${licitacaoId})` : null].filter(Boolean);
  if (!filtros.length) return { formacao: null, itens: [] };
  const { data: vinc } = await supabase.from('cotacoes_precos_vinculos').select('cotacao_id').or(filtros.join(','));
  const ids = [...new Set((vinc || []).map((v: any) => v.cotacao_id))];
  if (!ids.length) return { formacao: null, itens: [] };
  const { data } = await supabase.from('cotacoes_precos').select('id,nome,versao,status,vencedora,criado_em,itens').in('id', ids);
  // a oficial (vencedora); sem ela, a finalizada mais nova; senão a versão mais alta
  const f = [...(data || [])].sort((a: any, b: any) =>
    Number(!!b.vencedora) - Number(!!a.vencedora)
    || Number(b.status === 'finalizada') - Number(a.status === 'finalizada') || (b.versao || 1) - (a.versao || 1)
    || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
  if (!f) return { formacao: null, itens: [] };
  const itens = (f.itens || []).filter((l: any) => String(l.produto || '').trim()).map((l: any) => ({
    nome: String(l.produto).trim(),
    quantidade: num(l.qt) || 1,
    descricao: [l.marca, l.modelo, l.lote_nome && (/^lote/i.test(String(l.lote_nome).trim()) ? l.lote_nome : `Lote ${l.lote_nome}`)].filter(Boolean).join(' · '),
    produto_id: l.kit_id || null,
    item_id: l.item_id || null,
  }));
  return { formacao: f, itens };
}

/** Editor dos itens vendidos, com "carregar da formação" e "dividir por unidade" */
export function ItensVendidosEditor({ itens, onChange, crmId, licitacaoId, unidades = 1 }: {
  itens: any[]; onChange: (v: any[]) => void; crmId?: string | null; licitacaoId?: string | null; unidades?: number;
}) {
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const temVinculo = !!(crmId || licitacaoId);
  const carregar = async () => {
    setCarregando(true); setAviso('');
    const { formacao, itens: vindos } = await itensDaFormacao({ crmId, licitacaoId });
    setCarregando(false);
    if (!formacao || !vindos.length) { setAviso('Nenhuma formação de preços com itens ligada a esta venda. Preencha à mão.'); return; }
    const jaPreenchidos = itensPreenchidos(itens);
    onChange([...jaPreenchidos, ...vindos]);
    setAviso(`Carregado da formação ${formacao.vencedora ? 'oficial' : '(nenhuma marcada como oficial; usada a mais recente)'} "${formacao.nome || 'formação'}" v${formacao.versao || 1}: ${vindos.length} item(ns). Confira nomes e quantidades.`
      + (unidades > 1 ? ' As quantidades da formação são do total da venda.' : ''));
  };
  const dividir = () => {
    onChange(itens.map(i => {
      const q = num(i.quantidade);
      return { ...i, quantidade: q && q % unidades === 0 ? q / unidades : q };
    }));
    setAviso(`Quantidades divididas pelas ${unidades} unidades (as que não dividem exato ficaram como estavam).`);
  };
  return (
    <div className="acn-quadro tom-info acn-opit-quadro">
      <div className="acn-opit-cab">
        <span className="acn-opit-tit info"><Icone path={mdiPackageVariantClosed} size={15} />Itens vendidos *{unidades > 1 ? ` — por unidade (cada uma das ${unidades} OPs)` : ''}</span>
        <span className="acn-ajuda">Informa à Engenharia exatamente o que foi vendido.</span>
        <span className="acn-opit-acoes">
          {temVinculo && (
            <Botao pequeno icone={mdiArrowDown} onClick={carregar} disabled={carregando}>
              {carregando ? 'Carregando...' : 'Carregar da formação oficial'}
            </Botao>
          )}
          {unidades > 1 && itensPreenchidos(itens).length > 0 && (
            <Botao pequeno onClick={dividir}>÷ Dividir por {unidades} unidades</Botao>
          )}
        </span>
      </div>
      {aviso && <div className="acn-opit-aviso">{aviso}</div>}
      <ItensDemandaEditor itens={itens.length ? itens : [itemVazio()]} onChange={onChange} titulo="" />
    </div>
  );
}

// ── 2. BOM ───────────────────────────────────────────────────────────────────
export const linhaBomVazia = () => ({ item_id: null, codigo: '', nome: '', unidade: 'UN', quantidade: 1, descricao: '', nao_cadastrado: false });
export const bomPreenchida = (linhas: any[]) => (linhas || [])
  .filter(l => String(l.nome || '').trim())
  .map(l => ({ ...l, nome: String(l.nome).trim(), descricao: String(l.descricao || '').trim(), quantidade: num(l.quantidade) || 1, nao_cadastrado: !l.item_id }));

/** BOM sugerida pelo vendido: kit/produto com estrutura abre nos itens; item do catálogo entra direto */
export async function sugerirBom(vendidos: any[]) {
  const porItem = new Map<string, any>();
  const somar = (l: any) => {
    const chave = l.item_id || `txt:${l.nome}`;
    const atual = porItem.get(chave);
    if (atual) atual.quantidade += l.quantidade; else porItem.set(chave, { ...l });
  };
  for (const v of vendidos || []) {
    const q = num(v.quantidade) || 1;
    if (v.produto_id) {
      const estrutura = v.estrutura?.length ? v.estrutura : await estruturaParaDemanda(v.produto_id);
      estrutura.forEach((e: any) => somar({ item_id: e.item_id, codigo: e.codigo || '', nome: e.nome, unidade: e.unidade || 'UN', quantidade: num(e.quantidade) * q, descricao: `do ${v.nome}`, nao_cadastrado: !e.item_id }));
    } else if (v.item_id) {
      const { data } = await supabase.from('cadastro_itens').select('id,codigo,nome,unidade').eq('id', v.item_id).maybeSingle();
      if (data) somar({ item_id: data.id, codigo: data.codigo || '', nome: data.nome, unidade: data.unidade || 'UN', quantidade: q, descricao: '', nao_cadastrado: false });
    }
  }
  // R19 (decidida com o usuário em 01/10/2026, aplicada em 06/10/2026): serviço e item genérico (categoria GENERICO:
  // película, instalação do kit, garantia estendida, plotagem, licença…) continuam na venda e na proposta, mas NÃO são
  // material para o Almoxarifado separar — saem da BOM sugerida. Se a leitura das categorias falhar, a lista segue
  // como estava (melhor sobrar um serviço do que sumir um material).
  const sugeridas = [...porItem.values()];
  const idsSug = sugeridas.map(l => l.item_id).filter(Boolean);
  if (!idsSug.length) return sugeridas;
  const { data: cats, error: erroCats } = await supabase.from('cadastro_itens').select('id,categoria').in('id', idsSug);
  if (erroCats) return sugeridas;
  const genericos = new Set((cats || []).filter((c: any) => String(c.categoria || '').trim().toUpperCase() === 'GENERICO').map((c: any) => String(c.id)));
  return sugeridas.filter(l => !l.item_id || !genericos.has(String(l.item_id)));
}

/**
 * COPIAR A LISTA DE MATERIAL DE OUTRA OP (28/09/2026)
 *
 * Pedido da Engenharia. Carro parecido já adaptado antes tem a lista pronta, e
 * redigitar item por item é trabalho jogado fora — além de ser onde nasce a
 * diferença entre duas OPs que deviam ser iguais.
 *
 * A armadilha é a quantidade: a OP de origem pode ser de um lote de 3 carros e
 * esta de um só. Copiar cru traria o triplo de material. Por isso, quando as
 * quantidades diferem, o painel ajusta na proporção e diz que está ajustando —
 * com como desligar, para o caso de a lista de origem já ser por unidade.
 */
export function CopiarBomDeOutraOp({ oplAtual, onCopiar }: any) {
  const [aberto, setAberto] = useState(false);
  const [ops, setOps] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [escolhidaId, setEscolhidaId] = useState('');
  const [ajustar, setAjustar] = useState(true);

  const abrir = async () => {
    setAberto(true);
    if (ops.length) return;
    setCarregando(true);
    const { data } = await supabase.from('oples')
      .select('id,opl,cliente_nome,modelo,quantidade,bom_itens,data_liberacao_bom')
      .not('bom_itens', 'is', null)
      .order('data_liberacao_bom', { ascending: false, nullsFirst: false })
      .limit(300);
    setOps((data || [])
      .filter((o: any) => Array.isArray(o.bom_itens) && o.bom_itens.length && o.id !== oplAtual?.id));
    setCarregando(false);
  };

  const origem = ops.find(o => o.id === escolhidaId);
  const qtdOrigem = Math.max(1, Number(origem?.quantidade) || 1);
  const qtdAtual  = Math.max(1, Number(oplAtual?.quantidade) || 1);
  const precisaAjuste = qtdOrigem !== qtdAtual;
  const fator = precisaAjuste && ajustar ? qtdAtual / qtdOrigem : 1;

  const linhasCopiadas = () => (origem?.bom_itens || []).map((l: any) => ({
    ...l,
    quantidade: Math.round(num(l.quantidade) * fator * 1000) / 1000,
    descricao: [l.descricao, `copiado da OP ${origem.opl}`].filter(Boolean).join(' · '),
  }));

  if (!aberto) {
    return (
      <Botao pequeno className="acn-opit-copiar-abrir" icone={mdiClipboardTextOutline} onClick={abrir}>
        Copiar a lista de outra OP
      </Botao>
    );
  }

  return (
    <div className="acn-quadro acn-opit-quadro acn-opit-copiar">
      <div className="acn-opit-cab entre">
        <div className="acn-opit-tit"><Icone path={mdiClipboardTextOutline} size={15} />Copiar a lista de material de outra OP</div>
        <Botao variante="discreto" pequeno icone={mdiClose} title="Fechar" aria-label="Fechar" onClick={() => { setAberto(false); setEscolhidaId(''); }} />
      </div>

      {carregando ? (
        <div className="acn-ajuda">Procurando OPs com lista pronta…</div>
      ) : !ops.length ? (
        <div className="acn-ajuda">
          Nenhuma outra OP tem lista de material montada ainda.
        </div>
      ) : (
        <>
          <SelectBusca valor={escolhidaId} onChange={setEscolhidaId}
            placeholder="— procure a OP pelo número, cliente ou veículo —" vazio="— nenhuma —"
            opcoes={ops.map(o => ({
              valor: o.id,
              rotulo: `OP ${o.opl}`,
              detalhe: [o.cliente_nome, o.modelo, `${o.bom_itens.length} itens`,
                        (Number(o.quantidade) || 1) > 1 ? `lote de ${o.quantidade}` : ''].filter(Boolean).join(' · '),
              busca: [o.opl, o.cliente_nome, o.modelo],
            }))} />

          {origem && (
            <div className="acn-opit-origem">
              {precisaAjuste && (
                <label className="acn-opit-ajuste">
                  <input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} />
                  <span>
                    A OP {origem.opl} é de <b>{qtdOrigem} unidade(s)</b> e esta é de <b>{qtdAtual}</b>.
                    Ajustar as quantidades na proporção. Desmarque se a lista de origem já for por unidade.
                  </span>
                </label>
              )}
              <div className="acn-ajuda">
                {origem.bom_itens.length} item(ns):{' '}
                {origem.bom_itens.slice(0, 4).map((l: any) => `${fmtQ(num(l.quantidade) * fator)}× ${l.nome}`).join(' · ')}
                {origem.bom_itens.length > 4 ? ` … e mais ${origem.bom_itens.length - 4}` : ''}
              </div>
              <div className="acn-opit-botoes">
                <Botao variante="primario" pequeno onClick={() => { onCopiar(linhasCopiadas(), 'somar'); setAberto(false); }}>
                  Somar à lista atual
                </Botao>
                <Botao pequeno onClick={() => { onCopiar(linhasCopiadas(), 'substituir'); setAberto(false); }}>
                  Substituir a lista
                </Botao>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BomEditor({ linhas, onChange, vendidos = [] }: { linhas: any[]; onChange: (v: any[]) => void; vendidos?: any[] }) {
  const [sugerindo, setSugerindo] = useState(false);
  const lista = linhas.length ? linhas : [linhaBomVazia()];
  const set = (i: number, patch: any) => onChange(lista.map((l, j) => j === i ? { ...l, ...patch } : l));
  const escolher = async (i: number, s: any) => {
    if (s.tipo === 'item') {
      set(i, { item_id: s.id, codigo: s.codigo || '', nome: s.nome, unidade: s.unidade || 'UN', nao_cadastrado: false });
      return;
    }
    // produto/kit: troca a linha pelos itens da estrutura (multiplicados pela quantidade da linha)
    const q = num(lista[i].quantidade) || 1;
    const estrutura = await estruturaParaDemanda(s.id);
    if (!estrutura.length) {
      set(i, { item_id: null, codigo: s.codigo || '', nome: s.nome, nao_cadastrado: true, descricao: 'produto sem estrutura cadastrada' });
      return;
    }
    const novas = estrutura.map((e: any) => ({ item_id: e.item_id, codigo: e.codigo || '', nome: e.nome, unidade: e.unidade || 'UN', quantidade: num(e.quantidade) * q, descricao: `do ${s.nome}`, nao_cadastrado: !e.item_id }));
    onChange([...lista.slice(0, i), ...novas, ...lista.slice(i + 1)]);
  };
  const sugerir = async () => {
    setSugerindo(true);
    const sug = await sugerirBom(vendidos);
    setSugerindo(false);
    if (!sug.length) { alert('Os itens vendidos não têm estrutura nem código do cadastro para sugerir a BOM. Monte a lista buscando os itens.'); return; }
    onChange([...bomPreenchida(lista), ...sug]);
  };
  const naoCad = bomPreenchida(lista).filter(l => l.nao_cadastrado).length;
  return (
    <div className="acn-quadro tom-ok acn-opit-quadro">
      <div className="acn-opit-cab">
        <span className="acn-opit-tit ok"><Icone path={mdiToolboxOutline} size={15} />BOM — material para executar (por unidade) *</span>
        {vendidos.length > 0 && (
          <Botao pequeno className="acn-opit-fim" icone={mdiAutoFix} onClick={sugerir} disabled={sugerindo}>
            {sugerindo ? 'Montando...' : 'Sugerir pelo que foi vendido'}
          </Botao>
        )}
      </div>
      <div className="acn-opit-linhas">
        {lista.map((l, i) => (
          <div key={i} className="acn-opit-linha">
            <BuscaCadastro valor={l.nome} placeholder="Item do cadastro (ou kit, que abre nos itens)"
              onTexto={v => set(i, { nome: v, item_id: null, codigo: '', nao_cadastrado: true })}
              onEscolher={s => escolher(i, s)} />
            {l.codigo && <span className="acn-opit-cod">{l.codigo}</span>}
            {String(l.nome || '').trim() && !l.item_id && (
              <span title="Item fora do Cadastro de Itens — cadastre para controlar o estoque" className="acn-opit-naocad">não cadastrado</span>
            )}
            <input type="number" min="0" step="any" value={l.quantidade} aria-label="Quantidade na BOM" className="acn-input acn-opit-qtd"
              onChange={e => set(i, { quantidade: e.target.value })} />
            <span className="acn-opit-un">{l.unidade || 'UN'}</span>
            <input value={l.descricao || ''} placeholder="Descrição" aria-label="Descrição na BOM" className="acn-input acn-opit-desc"
              onChange={e => set(i, { descricao: e.target.value })} />
            <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Remover linha" title="Remover"
              onClick={async () => { if (!await confirmarRemocao('esta linha da lista')) return; onChange(lista.length > 1 ? lista.filter((_, j) => j !== i) : [linhaBomVazia()]); }} />
          </div>
        ))}
      </div>
      <div className="acn-opit-rodape">
        <Botao pequeno onClick={() => onChange([...lista, linhaBomVazia()])}>+1 item</Botao>
        {naoCad > 0 && <span className="acn-opit-naocad">{naoCad} item(ns) fora do cadastro — dá para liberar, mas cadastre para controlar o estoque.</span>}
      </div>
    </div>
  );
}

// ── 3. CONFERÊNCIA DO KITING ─────────────────────────────────────────────────
/**
 * Estado inicial do checklist de separação.
 *
 * Começa VAZIO: quem marca é o Almoxarifado, conforme coloca a peça na caixa
 * (decidido com o usuário em 28/09/2026). Antes vinha tudo preenchido com a
 * quantidade da BOM e "separado" passava no automático — a conferência dizia
 * que alguém tinha olhado sem que ninguém tivesse olhado.
 *
 * Separação salva pela metade volta de onde parou.
 *
 * `completo` é para o kiting em lote, onde não há conferência linha a linha e a
 * BOM inteira é registrada como separada de uma vez.
 */
export const conferenciaInicial = (opl: any, { completo = false }: any = {}) => {
  const anteriores = opl?.kit_conferencia?.linhas || [];
  return (opl?.bom_itens || []).map((b: any, i: number) => {
    const ant = anteriores[i]?.nome === b.nome ? anteriores[i] : null;
    return {
      ...b, planejado: num(b.quantidade),
      separado: ant ? num(ant.separado) : (completo ? num(b.quantidade) : 0),
      obs: ant?.obs || '',
    };
  });
};
export const divergencias = (linhas: any[]) => (linhas || []).filter(l => num(l.separado) !== num(l.planejado));
/** Texto curto das diferenças (vai para a observação do kit) */
export const resumoDivergencias = (linhas: any[]) => divergencias(linhas)
  .map(l => `${l.nome}: BOM ${fmtQ(l.planejado)}, separado ${fmtQ(l.separado)}${l.obs ? ` (${l.obs})` : ''}`).join('; ');
/** Valida: toda diferença precisa de observação. Devolve mensagem de erro ou '' */
export const validarConferencia = (linhas: any[]) => {
  const semObs = divergencias(linhas).filter(l => !String(l.obs || '').trim());
  return semObs.length ? `Explique a diferença em: ${semObs.map(l => l.nome).join(', ')}.` : '';
};
export const registroConferencia = (linhas: any[], currentUser: any, emLote = false) => ({
  linhas: (linhas || []).map(l => ({ item_id: l.item_id, codigo: l.codigo, nome: l.nome, unidade: l.unidade, planejado: num(l.planejado), separado: num(l.separado), obs: String(l.obs || '').trim() })),
  divergente: divergencias(linhas).length > 0,
  conferido_por: currentUser?.nome || null,
  conferido_em: new Date().toISOString(),
  em_lote: emLote,
});

/**
 * O que ainda precisa sair da prateleira para esta linha — e se dá para tirar.
 *
 * Numa separação salva pela metade o saldo já caiu do que saiu antes, então o
 * que falta tirar é o planejado menos o que esta OP já baixou.
 */
export const situacaoDaLinha = (l: any, saldos: any = {}) => {
  const s = saldos?.[l?.item_id] || null;
  const aTirar = num(l.planejado) - num(s?.jaBaixado || 0);
  const semSaldo = !!s?.controla && aTirar > 0 && num(s.saldo) < aTirar;
  return { ...(s || {}), aTirar, semSaldo, temSaldoInfo: !!s };
};

/**
 * CHECKLIST DE SEPARAÇÃO (Etapa 8 — 28/09/2026)
 *
 * A lista de material virou checklist: o Almoxarifado marca item a item
 * conforme coloca na caixa. Marcar e desmarcar NÃO movem estoque — a baixa
 * acontece quando a separação é salva. O raciocínio do usuário: o material já
 * está reservado para aquela OP de qualquer jeito, então não há corrida por
 * peça durante a conferência e marcar errado não exige estorno.
 *
 * Item sob controle sem saldo não marca. A saída continua sendo separar o que
 * tem, salvar, e fechar o kit quando o resto chegar.
 */
export function ConferenciaKit({ linhas, onChange, saldos = {} }: { linhas: any[]; onChange: (v: any[]) => void; saldos?: any }) {
  if (!linhas?.length) return null;
  const set = (i: number, patch: any) => onChange(linhas.map((l, j) => j === i ? { ...l, ...patch } : l));
  const div = divergencias(linhas).length;
  const prontas = linhas.filter(l => num(l.separado) >= num(l.planejado) && num(l.planejado) > 0).length;
  const tudo = prontas === linhas.length;
  const marcarTudo = (ligar: boolean) => onChange(linhas.map(l => {
    if (!ligar) return { ...l, separado: 0 };
    return situacaoDaLinha(l, saldos).semSaldo ? l : { ...l, separado: num(l.planejado) };
  }));
  return (
    <div className={'acn-quadro acn-opit-quadro ' + (tudo ? 'tom-ok' : 'pendente')}>
      <div className="acn-opit-cab entre">
        <div className={'acn-opit-tit ' + (tudo ? 'ok' : 'atencao')}>
          <Icone path={mdiPackageVariantClosed} size={15} />Separação — {prontas} de {linhas.length} {tudo ? 'itens separados' : 'itens separados, faltam ' + (linhas.length - prontas)}
        </div>
        <Botao pequeno onClick={() => marcarTudo(!tudo)}>
          {tudo ? 'desmarcar tudo' : 'marcar tudo que tem saldo'}
        </Botao>
      </div>
      <table className="acn-opit-tabela">
        <thead><tr>
          <th className="chk"></th>
          <th>Item</th>
          <th className="dir">BOM</th>
          <th className="dir">Separado</th>
          <th>Observação</th>
        </tr></thead>
        <tbody>
          {linhas.map((l, i) => {
            const difere = num(l.separado) !== num(l.planejado);
            const marcado = num(l.separado) > 0;
            const st = situacaoDaLinha(l, saldos);
            const travado = st.semSaldo && !marcado;
            return (
              <tr key={i} className={travado ? 'travado' : difere ? 'difere' : undefined}>
                <td className="chk">
                  <input type="checkbox" checked={!difere && marcado} disabled={travado} className="acn-opit-chk"
                    aria-label={`Separar ${l.nome}`}
                    title={travado ? 'Sem saldo no estoque para separar este item' : ''}
                    onChange={e => set(i, { separado: e.target.checked ? num(l.planejado) : 0 })} />
                </td>
                <td>
                  {l.nome}{l.codigo && <span className="acn-opit-peq">{l.codigo}</span>}
                  {!l.item_id && <span className="acn-opit-peq aviso">não cadastrado</span>}
                  {l.descricao && <span className="acn-opit-peq">{l.descricao}</span>}
                  {st.semSaldo && <div className="acn-opit-semsaldo">
                    sem saldo: precisa de {fmtQ(st.aTirar)} e tem {fmtQ(st.saldo)} {st.unidade || l.unidade}
                  </div>}
                </td>
                <td className="dir sem-quebra">{fmtQ(l.planejado)} {l.unidade}</td>
                <td className="dir">
                  <input type="number" min="0" step="any" value={l.separado} aria-label={`Separado de ${l.nome}`}
                    className={'acn-input acn-opit-sep' + (difere ? ' difere' : '')}
                    onChange={e => set(i, { separado: e.target.value })} />
                </td>
                <td>
                  <input value={l.obs || ''} placeholder={difere ? 'Obrigatório: por que mudou?' : ''} aria-label={`Observação de ${l.nome}`}
                    className={'acn-input acn-opit-obs' + (difere && !String(l.obs || '').trim() ? ' falta' : '')}
                    onChange={e => set(i, { obs: e.target.value })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="acn-ajuda">
        Marcar e desmarcar não mexem no estoque. A baixa acontece quando você salva a separação.
      </div>
    </div>
  );
}

// ── Leitura: Vendido × BOM × Separado (detalhe da OP) ─────────────────────────
export function QuadroItensOp({ opl }: { opl: any }) {
  const vendidos = opl?.itens_vendidos || [];
  const bom = opl?.bom_itens || [];
  const conf = opl?.kit_conferencia?.linhas || [];
  if (!vendidos.length && !bom.length) return null;
  return (
    <div className="acn-opit-grade">
      <div className="acn-opit-box info">
        <div className="acn-opit-box-cab"><Icone path={mdiPackageVariantClosed} size={14} />Vendido ({vendidos.length})</div>
        {vendidos.length ? (
          <table className="acn-opit-leitura"><tbody>
            {vendidos.map((v: any, i: number) => (
              <tr key={i}><td className="qtd">{fmtQ(v.quantidade)}×</td>
                <td>{v.nome}{v.descricao && <div className="acn-opit-peq bloco">{v.descricao}</div>}</td></tr>
            ))}
          </tbody></table>
        ) : <div className="acn-opit-vazio">Não informado (OP anterior à lista obrigatória).</div>}
      </div>
      <div className="acn-opit-box ok">
        <div className="acn-opit-box-cab">
          <Icone path={mdiToolboxOutline} size={14} />BOM × separado no kit {opl?.kit_conferencia?.divergente && <span className="acn-opit-dif">· com diferença</span>}
        </div>
        {bom.length ? (
          <table className="acn-opit-leitura">
            <thead><tr><th>Item</th><th className="dir">BOM</th><th className="dir">Separado</th></tr></thead>
            <tbody>
              {bom.map((b: any, i: number) => {
                const c = conf[i] && conf[i].nome === b.nome ? conf[i] : null;
                const difere = c && num(c.separado) !== num(b.quantidade);
                return (
                  <tr key={i} className={difere ? 'difere' : undefined}>
                    <td>{b.nome}{b.codigo && <span className="acn-opit-peq">{b.codigo}</span>}
                      {c?.obs && <div className="acn-opit-peq bloco dif">{c.obs}</div>}</td>
                    <td className="dir sem-quebra">{fmtQ(b.quantidade)} {b.unidade}</td>
                    <td className={'dir' + (difere ? ' dif' : '')}>{c ? fmtQ(c.separado) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="acn-opit-vazio">BOM ainda não liberada pela Engenharia.</div>}
        {opl?.kit_conferencia?.conferido_por && (
          <div className="acn-ajuda acn-opit-conferido">
            Conferido por {opl.kit_conferencia.conferido_por}{opl.kit_conferencia.em_lote ? ' (em lote)' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
