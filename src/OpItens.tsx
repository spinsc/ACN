// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OpItens — o que foi vendido, o que o PCP planejou (a BOM; era da Engenharia até a Etapa 18, de 13/10/2026) e o que saiu no kit
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
import React, { useState, useEffect } from 'react';
import { confirmarRemocao, mostrarAviso } from './Feedback';
import { lerMarcasDeSerial, gravarMarcaDeSerial } from './SerialDosItens';
import { imprimirListaDeSeparacao } from './ListaDeSeparacao';
import { supabase } from './supabaseClient';
import { BuscaCadastro, ItensDemandaEditor, itemVazio, itensPreenchidos, estruturaParaDemanda } from './DemandaItens';
import { SelectBusca, Botao, Selo } from './Interface';
import { ehEnvioDeMaterial, ehVendaComposta, setorDaLinha, setorPadraoDaVenda, partesEmbaladas, SETORES_DE_SEPARACAO, SETOR_TELECOM } from './SeparacaoEnvio';
import { normalizarBusca } from './SearchUtils';
import { completarItensPeloNome } from './ConfigEstrutura';
import Icone from './Icone';
import { mdiPackageVariantClosed, mdiArrowDown, mdiClipboardTextOutline, mdiClose, mdiToolboxOutline, mdiAutoFix, mdiPrinterOutline } from '@mdi/js';

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
  // 27/10/2026 (OP A1741.2610): linha da formação sem o vínculo com o cadastro é procurada pelo nome, para a OP nascer com o item ligado (é o vínculo que faz o sistema reconhecer o
  // Conjunto Elétrico e montar a estrutura). Se a procura falhar a lista vem como estava e a tela avisa.
  let erroVinculo = '';
  try { const ligadas = await completarItensPeloNome(itens); ligadas.forEach((l: any, i: number) => { itens[i] = l; }); } catch (e: any) { erroVinculo = e?.message || 'falha ao procurar no cadastro'; }
  // Telecom, T2 (22/10/2026): a linha que vem do cadastro traz o "Quem separa" do item (só quando o cadastro diz Telecom; vazio vale o padrão da venda).
  // Se a leitura do cadastro falhar a lista vem sem a marca e a tela avisa: a marca é uma ajuda e não impede carregar a formação.
  let erroSetor = '';
  const idsDosItens = [...new Set(itens.map((l: any) => l.item_id).filter(Boolean))];
  if (idsDosItens.length) {
    const { data: cad, error: erroCad } = await supabase.from('cadastro_itens').select('id,setor_separacao').in('id', idsDosItens);
    if (erroCad) erroSetor = erroCad.message;
    else {
      const porId = new Map((cad || []).map((c: any) => [String(c.id), c.setor_separacao]));
      itens.forEach((l: any) => { const s = l.item_id ? porId.get(String(l.item_id)) : null; if (s) l.setor = s; });
    }
  }
  return { formacao: f, itens, erroSetor: erroSetor || (erroVinculo ? 'vínculo com o cadastro: ' + erroVinculo : '') };
}

/**
 * Itens cuja quantidade PARECE ser o total do lote (pedido do usuário em 16/10/2026).
 * Na Nova OP o item vale POR CARRO: o sistema copia a mesma lista em cada OP do lote. Numa venda de 20 carros, quem digitou 80 Slimleds, 20 Conjuntos e 20
 * Instalações (o total) deixou cada carro com 80, 20 e 20 — foi o que aconteceu no lote A1704. A quantidade que "parece o total" é a que é múltiplo exato
 * do número de carros (e pelo menos esse número): 80 e 20 num lote de 20. É só um palpite para avisar; quem tem certeza de que é por carro segue.
 */
export function itensQueParecemTotalDoLote(itens: any[], unidades: number) {
  if (!(unidades > 1)) return [];
  return itensPreenchidos(itens || [])
    .map((i: any) => ({ nome: String(i.nome || '').trim(), quantidade: num(i.quantidade) }))
    .filter(i => i.quantidade >= unidades && i.quantidade % unidades === 0)
    .map(i => ({ ...i, porCarro: i.quantidade / unidades }));
}

/** Editor dos itens vendidos, com "carregar da formação" e "dividir por unidade" */
export function ItensVendidosEditor({ itens, onChange, crmId, licitacaoId, unidades = 1, comSetor = false, setorPadrao = 'Almoxarifado' }: {
  itens: any[]; onChange: (v: any[]) => void; crmId?: string | null; licitacaoId?: string | null; unidades?: number;
  /** Telecom, T2 (22/10/2026): mostra o "Quem separa" de cada linha; só faz sentido quando a rota é envio de material. `setorPadrao` é o que vale para a linha sem marca. */
  comSetor?: boolean; setorPadrao?: string;
}) {
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const temVinculo = !!(crmId || licitacaoId);
  const suspeitos = itensQueParecemTotalDoLote(itens, unidades);
  // corrige só os suspeitos (o "÷ Dividir" divide todos); o que não parece total fica como está
  const corrigirSuspeitos = () => {
    const nomes = new Set(suspeitos.map(s => s.nome));
    onChange(itens.map(i => {
      const q = num(i.quantidade);
      return nomes.has(String(i.nome || '').trim()) && q && q % unidades === 0 ? { ...i, quantidade: q / unidades } : i;
    }));
    setAviso(`Corrigido: ${suspeitos.map(s => `${s.nome} ${s.quantidade} → ${s.porCarro}`).join('; ')} por carro.`);
  };
  const carregar = async () => {
    setCarregando(true); setAviso('');
    const { formacao, itens: vindos, erroSetor } = await itensDaFormacao({ crmId, licitacaoId });
    setCarregando(false);
    if (!formacao || !vindos.length) { setAviso('Nenhuma formação de preços com itens ligada a esta venda. Preencha à mão.'); return; }
    const jaPreenchidos = itensPreenchidos(itens);
    onChange([...jaPreenchidos, ...vindos]);
    setAviso(`Carregado da formação ${formacao.vencedora ? 'oficial' : '(nenhuma marcada como oficial; usada a mais recente)'} "${formacao.nome || 'formação'}" v${formacao.versao || 1}: ${vindos.length} item(ns). Confira nomes e quantidades.`
      + (unidades > 1 ? ' As quantidades da formação são do total da venda.' : '')
      + (comSetor && erroSetor ? ` Não consegui ler quem separa cada item no cadastro (${erroSetor}): confira a coluna "Quem separa" antes de salvar.` : ''));
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
        <span className="acn-ajuda">Informa ao PCP exatamente o que foi vendido.</span>
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
      {suspeitos.length > 0 && (
        <div className="acn-opit-aviso" role="alert" data-aviso="total-do-lote">
          ⚠️ <strong>Isto parece o total do lote.</strong> Aqui o item vale <strong>por carro</strong> (cada uma das {unidades} OPs recebe a quantidade digitada):{' '}
          {suspeitos.map(s => `${s.nome || 'item sem nome'}: ${s.quantidade} (por carro seria ${s.porCarro})`).join(' · ')}.{' '}
          <Botao pequeno onClick={corrigirSuspeitos}>Corrigir para por carro</Botao>
        </div>
      )}
      <ItensDemandaEditor itens={itens.length ? itens : [itemVazio()]} onChange={onChange} titulo="" comSetor={comSetor} setorPadrao={setorPadrao} comSemEstrutura />
    </div>
  );
}

// ── 2. BOM ───────────────────────────────────────────────────────────────────
export const linhaBomVazia = () => ({ item_id: null, codigo: '', nome: '', unidade: 'UN', quantidade: 1, descricao: '', nao_cadastrado: false });
export const bomPreenchida = (linhas: any[]) => (linhas || [])
  .filter(l => String(l.nome || '').trim())
  .map(l => ({ ...l, nome: String(l.nome).trim(), descricao: String(l.descricao || '').trim(), quantidade: num(l.quantidade) || 1, nao_cadastrado: !l.item_id }));

/**
 * O cadastro de um item vendido que veio só com o NOME (21/10/2026). OP aberta por lote, importação ou texto digitado à mão guarda o item sem `item_id`/`produto_id`, e a BOM sugerida
 * achava que não havia o que sugerir (caso real: A1700.2610, quatro itens que existem no cadastro com o mesmo nome). Casa pelo nome sem acento e sem diferença de maiúscula, e SÓ quando
 * acha exatamente um cadastro — dois cadastros com o mesmo nome é ambíguo e não se chuta. Item do cadastro primeiro, depois produto/kit. Leitura que falha conta como "não achou".
 */
async function acharNoCadastroPeloNome(nome: string): Promise<{ item_id?: string; produto_id?: string } | null> {
  const chave = normalizarBusca(String(nome || '')).trim();
  if (!chave) return null;
  const itens = await supabase.from('cadastro_itens').select('id').eq('nome_norm', chave).neq('ativo', false).limit(2);
  if (!itens.error && itens.data?.length === 1) return { item_id: itens.data[0].id };
  if (!itens.error && (itens.data?.length || 0) > 1) return null;
  const produtos = await supabase.from('cadastro_produtos').select('id').eq('nome_norm', chave).neq('ativo', false).limit(2);
  if (!produtos.error && produtos.data?.length === 1) return { produto_id: produtos.data[0].id };
  return null;
}

/** BOM sugerida pelo vendido: kit/produto com estrutura abre nos itens; item do catálogo entra direto. Item vendido só com o nome é procurado no cadastro pelo nome; o que não se achou vai em `semCadastro` do resultado. */
export async function sugerirBom(vendidos: any[]) {
  const porItem = new Map<string, any>();
  const somar = (l: any) => {
    const chave = l.item_id || `txt:${l.nome}`;
    const atual = porItem.get(chave);
    if (atual) atual.quantidade += l.quantidade; else porItem.set(chave, { ...l });
  };
  const semCadastro: string[] = [];
  for (const v0 of vendidos || []) {
    let v = v0;
    if (!v.produto_id && !v.item_id && String(v.nome || '').trim()) {
      const achado = await acharNoCadastroPeloNome(v.nome);
      if (achado) v = { ...v, ...achado };
    }
    const q = num(v.quantidade) || 1;
    if (!v.produto_id && !v.item_id) semCadastro.push(String(v.nome || '').trim());
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
  const sugeridas: any[] & { semCadastro?: string[] } = [...porItem.values()];
  sugeridas.semCadastro = semCadastro;
  const idsSug = sugeridas.map(l => l.item_id).filter(Boolean);
  if (!idsSug.length) return sugeridas;
  const { data: cats, error: erroCats } = await supabase.from('cadastro_itens').select('id,categoria').in('id', idsSug);
  if (erroCats) return sugeridas;
  const genericos = new Set((cats || []).filter((c: any) => String(c.categoria || '').trim().toUpperCase() === 'GENERICO').map((c: any) => String(c.id)));
  const filtradas: any[] & { semCadastro?: string[] } = sugeridas.filter(l => !l.item_id || !genericos.has(String(l.item_id)));
  filtradas.semCadastro = semCadastro;
  return filtradas;
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

export function BomEditor({ linhas, onChange, vendidos = [], currentUser }: { linhas: any[]; onChange: (v: any[]) => void; vendidos?: any[]; currentUser?: any }) {
  const [sugerindo, setSugerindo] = useState(false);
  const lista = linhas.length ? linhas : [linhaBomVazia()];
  // "Serial" por linha (27/10/2026): quem monta a BOM diz se o item recebe número de série e isso é gravado no próprio item do Cadastro (vale para todas as OPs) — é a marca que monta a lista de seriais do Almoxarifado
  const [marcas, setMarcas] = useState<Record<string, { tem: boolean; conjunto: boolean }>>({});
  const [gravandoMarca, setGravandoMarca] = useState<string>('');
  const idsDaLista = [...new Set(lista.map((l: any) => l.item_id).filter(Boolean).map(String))].sort().join(',');
  useEffect(() => {
    const faltam = idsDaLista ? idsDaLista.split(',').filter(id => !(id in marcas)) : [];
    if (!faltam.length) return;
    let vivo = true;
    lerMarcasDeSerial(faltam).then(r => { if (vivo && !r.erro) setMarcas(m => ({ ...m, ...r.marcas })); });   // leitura que falha só deixa a caixa de fora
    return () => { vivo = false; };
  }, [idsDaLista]);
  const alternarSerial = async (l: any, tem: boolean) => {
    setGravandoMarca(String(l.item_id));
    const erro = await gravarMarcaDeSerial({ id: l.item_id, nome: l.nome }, tem, currentUser);
    setGravandoMarca('');
    if (erro) { mostrarAviso(`Não foi possível gravar a marca de serial de "${l.nome}": ${erro}`, 'erro'); return; }
    setMarcas(m => ({ ...m, [String(l.item_id)]: { tem, conjunto: false } }));
    mostrarAviso(tem ? `"${l.nome}" passou a ter número de série (fica no Cadastro de itens, vale para todas as OPs).` : `"${l.nome}" deixou de ter número de série.`, 'ok');
  };
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
    const fora: string[] = (sug as any).semCadastro || [];
    if (!sug.length) { alert('Os itens vendidos não têm estrutura nem código do cadastro para sugerir a BOM' + (fora.length ? ` (não achei no cadastro: ${fora.join(', ')})` : '') + '. Monte a lista buscando os itens.'); return; }
    // a BOM já pode ter vindo preenchida pela sugestão automática da janela: o botão só acrescenta o que ainda não está na lista (antes duplicava tudo)
    const atuais = bomPreenchida(lista);
    const jaTem = new Set(atuais.map((l: any) => l.item_id || `txt:${l.nome}`));
    const novas = sug.filter((l: any) => !jaTem.has(l.item_id || `txt:${l.nome}`));
    if (!novas.length) { alert('A BOM já tem todos os itens que o vendido sugere.'); return; }
    onChange([...atuais, ...novas]);
    // o que não está no cadastro não vira linha da BOM: avisa quais ficaram de fora para a pessoa buscar à mão
    if (fora.length) alert(`A BOM foi sugerida, mas estes itens vendidos não estão no cadastro (nem com o mesmo nome) e ficaram de fora: ${fora.join(', ')}. Busque-os à mão.`);
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
            {l.item_id && marcas[String(l.item_id)] && (
              <label className={'acn-opit-serial' + (marcas[String(l.item_id)].tem ? ' ligado' : '')}
                title={marcas[String(l.item_id)].conjunto ? 'O Conjunto Elétrico nunca tem número de série' : 'Este item recebe número de série? Ao marcar, fica gravado no Cadastro de itens (vale para todas as OPs) e o item entra sozinho na lista de seriais do Almoxarifado na Venda para Envio.'}>
                <input type="checkbox" checked={marcas[String(l.item_id)].tem} disabled={marcas[String(l.item_id)].conjunto || gravandoMarca === String(l.item_id)}
                  aria-label={`Tem número de série: ${l.nome}`} onChange={e => alternarSerial(l, e.target.checked)} /> Serial
              </label>
            )}
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
      seriais: ant?.seriais || '',
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
// ── Seriais por item da separação (pedido do usuário em 23/10/2026) ───────────
// Antes havia UMA caixa para os seriais de todos os itens do kit. Agora cada linha da separação tem o seu campo de serial (vários, separados por vírgula, quando o item tem mais de uma
// unidade). Fica guardado na própria conferência (kit_conferencia.linhas[].seriais), então "salvar separação" e continuar amanhã não perde nada. O texto de oples.seriais_equipamentos
// (e-mail ao Fiscal, dossiê e telas antigas leem esse) é montado daqui: uma linha por item ("ITEM: SN1, SN2"). Sobrou uma caixa pequena para os "outros seriais" (de algo que não está na
// lista); numa OP antiga, o texto de seriais que já existia entra nela inteiro, para nada se perder (kit_conferencia.seriais_outros).
/** Unidades em que cada peça é uma unidade (e pode ter o seu serial): UN, PC, CJ, KIT, PAR. Metro, quilo e litro não têm um serial por unidade. */
export const ehUnidadeContada = (u: any) => /^(un|und|unid|unidade|pc|pç|pca|peça|peca|cj|conjunto|kit|par)s?\.?$/i.test(String(u ?? '').trim());
/** "SN1, SN2" ou um por linha → lista sem vazios nem repetidos */
export const listaDeSeriais = (t: any): string[] => [...new Set(String(t ?? '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean))];
/** O texto de oples.seriais_equipamentos: uma linha por item com serial, depois os "outros seriais" como foram digitados. */
export const textoDosSeriais = (linhas: any[], outros: any = '') => [
  ...(linhas || []).map(l => { const s = listaDeSeriais(l?.seriais); return s.length ? `${l.nome}: ${s.join(', ')}` : ''; }).filter(Boolean),
  ...String(outros ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
].join('\n');
/** Os seriais que não são de um item da lista: os guardados em kit_conferencia.seriais_outros; numa OP em que o texto antigo (uma caixa só) é tudo o que existe, ele inteiro. */
export const seriaisOutrosDaOp = (opl: any) => {
  const reg = opl?.kit_conferencia;
  if (typeof reg?.seriais_outros === 'string') return reg.seriais_outros;
  const temPorItem = (reg?.linhas || []).some((l: any) => String(l?.seriais || '').trim());
  return temPorItem ? '' : String(opl?.seriais_equipamentos || '');
};
export const registroConferencia = (linhas: any[], currentUser: any, emLote = false, outrosSeriais: any = '') => ({
  linhas: (linhas || []).map(l => ({
    item_id: l.item_id, codigo: l.codigo, nome: l.nome, unidade: l.unidade, planejado: num(l.planejado), separado: num(l.separado), obs: String(l.obs || '').trim(),
    ...(listaDeSeriais(l.seriais).length ? { seriais: listaDeSeriais(l.seriais).join(', ') } : {}),
  })),
  divergente: divergencias(linhas).length > 0,
  conferido_por: currentUser?.nome || null,
  conferido_em: new Date().toISOString(),
  em_lote: emLote,
  ...(String(outrosSeriais ?? '').trim() ? { seriais_outros: String(outrosSeriais).trim() } : {}),
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
// `semEstoque` (22/10/2026): o Telecom usa o mesmo checklist, mas ainda não tem estoque — o texto de rodapé não pode prometer baixa
// `comSerial` (23/10/2026): cada linha ganha o seu campo de serial (kiting e embalagem de envio); sem ele a tabela é a de sempre
// `opl` (27/10/2026): com a OP à mão o cabeçalho ganha o botão "Imprimir lista" (item, código e quantidade a separar — ListaDeSeparacao.ts); `setor` é o nome que sai no papel
export function ConferenciaKit({ linhas, onChange, saldos = {}, semEstoque = false, comSerial = false, opl = null, setor = 'Almoxarifado' }: { linhas: any[]; onChange: (v: any[]) => void; saldos?: any; semEstoque?: boolean; comSerial?: boolean; opl?: any; setor?: string }) {
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
        <span className="acn-opit-acoes">
          {opl && (
            <Botao pequeno icone={mdiPrinterOutline} title="Imprimir a lista do que separar: item, código e quantidade"
              onClick={() => { if (!imprimirListaDeSeparacao(opl, linhas, setor)) mostrarAviso('Não foi possível abrir a janela de impressão: o navegador bloqueou. Libere as janelas deste site e tente de novo.', 'atencao'); }}>
              Imprimir lista
            </Botao>
          )}
          <Botao pequeno onClick={() => marcarTudo(!tudo)}>
            {tudo ? 'desmarcar tudo' : 'marcar tudo que tem saldo'}
          </Botao>
        </span>
      </div>
      <table className={'acn-opit-tabela' + (comSerial ? ' com-serial' : '')}>
        <thead><tr>
          <th className="chk"></th>
          <th>Item</th>
          <th className="dir">BOM</th>
          <th className="dir">Separado</th>
          {comSerial && <th>Serial(is)</th>}
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
                <td className="dir" data-rot="Separado">
                  <input type="number" min="0" step="any" value={l.separado} aria-label={`Separado de ${l.nome}`}
                    className={'acn-input acn-opit-sep' + (difere ? ' difere' : '')}
                    onChange={e => set(i, { separado: e.target.value })} />
                </td>
                {comSerial && (
                  <td className="acn-opit-ser" data-rot="Serial(is)">
                    <input className="acn-input acn-alm-mono acn-opit-serial" value={l.seriais || ''} aria-label={`Serial de ${l.nome}`}
                      placeholder={num(l.planejado) > 1 ? 'ex.: SN1, SN2' : 'nº de série, se tiver'}
                      onChange={e => set(i, { seriais: e.target.value })}
                      onPaste={e => {
                        // colar uma coluna do Excel (um serial por linha) vira "SN1, SN2, SN3" na mesma caixa
                        const t = e.clipboardData?.getData('text') || '';
                        if (!/[\n\t]/.test(t)) return;
                        e.preventDefault();
                        set(i, { seriais: [...listaDeSeriais(l.seriais), ...listaDeSeriais(t.replace(/\t/g, ','))].join(', ') });
                      }} />
                    {listaDeSeriais(l.seriais).length > 1 && (
                      // item contado em unidades (UN, PC, CJ…): avisa se o número de seriais não bate com a quantidade; metro, quilo e afins não têm um serial por unidade
                      <span className={'acn-opit-peq' + (ehUnidadeContada(l.unidade) && listaDeSeriais(l.seriais).length !== num(l.planejado) ? ' aviso' : '')}>
                        {listaDeSeriais(l.seriais).length}{ehUnidadeContada(l.unidade) ? ` de ${fmtQ(l.planejado)}` : ''} serial(is)
                      </span>
                    )}
                  </td>
                )}
                <td data-rot="Observação">
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
        {semEstoque
          ? 'Ainda não há estoque neste setor: marcar só registra o que foi separado, nada dá baixa.'
          : 'Marcar e desmarcar não mexem no estoque. A baixa acontece quando você salva a separação.'}
      </div>
      {comSerial && <div className="acn-ajuda">O número de série vai na linha do próprio item (nem todo item tem). Item com mais de uma unidade: um serial por unidade, separados por vírgula; dá para colar uma coluna do Excel.</div>}
    </div>
  );
}

// ── Leitura: Vendido × BOM × Separado (detalhe da OP) ─────────────────────────
export function QuadroItensOp({ opl }: { opl: any }) {
  const vendidos = opl?.itens_vendidos || [];
  const bom = opl?.bom_itens || [];
  const conf = opl?.kit_conferencia?.linhas || [];
  // Telecom, T2 (22/10/2026): numa venda de envio de material com linha do Telecom, cada linha diz quem a separa (sem ruído nas OPs que são todas do Almoxarifado)
  const mostraSetor = ehEnvioDeMaterial(opl) && (ehVendaComposta(opl) || setorPadraoDaVenda(opl) === SETOR_TELECOM || vendidos.some((v: any) => v?.setor === SETOR_TELECOM));
  if (!vendidos.length && !bom.length) return null;
  return (
    <div className="acn-opit-grade">
      <div className="acn-opit-box info">
        <div className="acn-opit-box-cab"><Icone path={mdiPackageVariantClosed} size={14} />Vendido ({vendidos.length})</div>
        {vendidos.length ? (
          <table className="acn-opit-leitura"><tbody>
            {vendidos.map((v: any, i: number) => (
              <tr key={i}><td className="qtd">{fmtQ(v.quantidade)}×</td>
                <td>{v.nome}{mostraSetor && <> <Selo familia={setorDaLinha(v, opl) === SETOR_TELECOM ? 'info' : 'neutro'} ponto={false} title="Quem separa, serializa e embala esta linha">{setorDaLinha(v, opl)}</Selo></>}{v.descricao && <div className="acn-opit-peq bloco">{v.descricao}</div>}</td></tr>
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
                      {c?.obs && <div className="acn-opit-peq bloco dif">{c.obs}</div>}
                      {c?.seriais && <div className="acn-opit-peq bloco">Serial: {c.seriais}</div>}</td>
                    <td className="dir sem-quebra">{fmtQ(b.quantidade)} {b.unidade}</td>
                    <td className={'dir' + (difere ? ' dif' : '')}>{c ? fmtQ(c.separado) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="acn-opit-vazio">BOM ainda não configurada pelo PCP.</div>}
        {opl?.kit_conferencia?.conferido_por && (
          <div className="acn-ajuda acn-opit-conferido">
            Conferido por {opl.kit_conferencia.conferido_por}{opl.kit_conferencia.em_lote ? ' (em lote)' : ''}
          </div>
        )}
      </div>
      {/* Telecom, T3 (22/10/2026): na venda composta, a embalagem de cada setor (a caixa de cada um; o frete é um só, com a soma) */}
      {ehVendaComposta(opl) && (
        <div className="acn-opit-box info" data-teste="partes-da-embalagem">
          <div className="acn-opit-box-cab"><Icone path={mdiPackageVariantClosed} size={14} />Embalagem por setor</div>
          <table className="acn-opit-leitura"><tbody>
            {SETORES_DE_SEPARACAO.map(s => {
              const p = partesEmbaladas(opl)[s];
              return (
                <tr key={s}>
                  <td>{s}</td>
                  <td>{p?.concluida_em
                    ? <>embalada em {new Date(p.concluida_em).toLocaleDateString('pt-BR')} por {p.por || '—'}<div className="acn-opit-peq bloco">{fmtQ(p.altura)} × {fmtQ(p.largura)} × {fmtQ(p.comprimento)} cm · {fmtQ(p.peso_total)} kg · {p.volumes || 1} volume(s)</div></>
                    : 'aguardando separar e embalar'}</td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
