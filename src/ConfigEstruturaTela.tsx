// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TELA DA ESTRUTURA DE INSTALAÇÃO
//
// Duas coisas diferentes, e é por isso que a tela tem duas partes:
//
//   PERGUNTAS DO ITEM     "tem hack de teto?" é pergunta da barra sinalizadora
//                         e vale em qualquer carro. Cadastra uma vez.
//
//   MATERIAL NO VEÍCULO   o que cada resposta consome MUDA de carro para carro.
//                         É aqui que se diz qual suporte o Nivus usa.
//
// Reescrita em 28/09/2026: a primeira versão misturava as duas, obrigando a
// redigitar a mesma pergunta em cada carro.
//
// REDESENHO de 16/10/2026 (pedido do usuário; análise com olhar de backend, frontend e UX/UI; só tela — nenhuma tabela, coluna ou função do banco mudou):
//   • o VEÍCULO é escolhido uma vez, no alto (antes eram dois seletores iguais em dois quadros) e vale para o material do item, as regras, a cobertura e o simulador;
//   • as PERGUNTAS vêm recolhidas, com o uso de cada resposta (quantas regras e quantas linhas de material dependem dela) — resposta que nada usa aparece em âmbar;
//   • "condição" e "regra" (dois sentidos diferentes, e um terceiro "Regras do veículo") viraram "aparece só com…" e "automática se…", e escolhem ITENS POR BUSCA
//     (antes era uma caixa de texto com códigos separados por vírgula);
//   • a REGRA é lida em uma frase (SE … E … ENTÃO usa …) e pode ser editada ou duplicada. Editar grava a regra nova PRIMEIRO e só então apaga a antiga: se a
//     gravação falhar, a antiga continua valendo (mantém a decisão de 15/10/2026 de que nenhuma regra muda de sentido por acidente);
//   • COBERTURA: toda combinação de respostas tem regra? Usa o mesmo cálculo da OP, então "a definir" aqui é "a definir" lá (CoberturaDaEstrutura.ts);
//   • SIMULADOR: monta uma OP de mentira e mostra o material que a conta oficial devolveria (só leitura);
//   • apagar pergunta ou resposta diz ANTES o que leva junto (o banco apaga o material por resposta e as respostas já dadas nas OPs; se uma regra a usa, ele recusa).
//
// FASE 2 de 16/10/2026 (banco; pedido do usuário: "segue"): criar, editar e copiar regra, e copiar a estrutura de um item, passam a ser UMA chamada a uma função do banco
// (`estrutura_gravar_regra`, `estrutura_copiar_regras`, `estrutura_copiar_item`): tudo ou nada, sem o desfazer feito pelo navegador; as listas de itens de "aparece só com…" e
// "automática se…" só aceitam item que existe no cadastro (gatilho do banco); cada mudança grava uma linha de histórico (`registrarNaEstrutura`, módulo "estrutura"); e, ao
// escolher o item vendido, a tela diz onde ele já é usado (`estrutura_onde_item_e_usado`).
//
// FASE 3 de 16/10/2026, versão que NÃO mexe em dado nem na conta da OP: "material por resposta" (`veiculo_item_materiais`) e "regras do veículo" não são a mesma coisa — o material por item
// MULTIPLICA pela quantidade vendida do item (vendeu 2, entra o dobro) e a regra é POR CARRO (`montarMaterial` × `avaliarRegras`); trocar um pelo outro mudaria a lista de material das OPs
// futuras. Por isso os dois ficam, e a tela passou a (a) dizer a diferença de quantidade nos dois lugares e (b) mostrar, ao lado das regras, o material por item do veículo, com atalho para abrir o item.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto } from './Feedback';
import { SelectBusca, Botao, Selo, Faixa } from './Interface';
import Icone from './Icone';
import { mdiPuzzleOutline, mdiLockOutline, mdiHelpCircleOutline, mdiChevronRight, mdiChevronDown, mdiAlertOutline, mdiClose, mdiPlus, mdiPencilOutline, mdiContentCopy, mdiTrashCanOutline } from '@mdi/js';
import { SelectVeiculo } from './VeiculoCadastro';
import { perguntasDoItem, perguntasDaOp, materiaisDoVeiculo, itensAtivosDoCatalogo, regrasDoVeiculo, todasAsPerguntas, copiarRegras, ehQuantidade, copiarEstruturaDeItem, resumoDaCopia, registrarNaEstrutura, ondeOItemEUsado, fraseDeOndeOItemEUsado, resumoDoMaterialPorItem, perguntasQueMultiplicamNoVeiculo } from './ConfigEstrutura';
import { coberturaDoVeiculo, perguntasSemRegra, lerUsoDasRespostas, usosDaResposta, oQueApagarRespostaLeva, oQueApagarPerguntaLeva, fraseDoQueLeva } from './CoberturaDaEstrutura';
import { EditorDeItens, FraseDaRegra, CoberturaDasRegras, SimuladorDaEstrutura, rotuloDoItem } from './ConfigEstruturaPecas';
import { ehAdminOuGerente } from './utils/permissoes';

function useItens() {
  const [itens, setItens] = useState([]);
  useEffect(() => {
    // paginado: o servidor corta em 1.000 linhas (achado A8, 29/09/2026)
    itensAtivosDoCatalogo('id,codigo,nome,unidade,controla_estoque,eh_conjunto_instalacao')
      .then(setItens);
  }, []);
  return itens;
}
const opcoesDeItem = (itens) => itens.map(i => ({
  valor: i.id, rotulo: `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}`, busca: [i.codigo, i.nome],
}));
const nomeDoVeiculo = (v) => (v ? (v.nome_exibicao || [v.marca, v.modelo].filter(Boolean).join(' ')) : '');

export default function ConfigEstruturaTela({ currentUser, itemInicial = '', veiculoInicial = '' }) {
  // 18d (13/10/2026): o atalho "Cadastrar estrutura" do pedido de desenvolvimento abre a tela já no item e no veículo daquela linha
  const [itemId, setItemId] = useState(itemInicial || '');
  // 16/10/2026: um veículo só para a tela inteira (antes: um seletor em cada quadro)
  const [veiculo, setVeiculo] = useState({ id: veiculoInicial || '', nome: '' });
  const veiculoId = veiculo.id;
  const [perguntas, setPerguntas] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [perguntasOp, setPerguntasOp] = useState([]);
  const [falhaOp, setFalhaOp] = useState('');
  const [perguntasTodas, setPerguntasTodas] = useState([]);   // as da OP e as de todos os itens, para montar as condições das regras
  const [falhaPerguntas, setFalhaPerguntas] = useState('');
  const [regras, setRegras] = useState([]);
  const [falhaRegras, setFalhaRegras] = useState('');
  const [uso, setUso] = useState(null);                       // quantas regras e linhas de material usam cada resposta
  const [falhaUso, setFalhaUso] = useState('');
  const [combinacaoSim, setCombinacaoSim] = useState(null);   // { respostas, sinal }: "Simular" na tabela da cobertura
  const [pedidoDeRegra, setPedidoDeRegra] = useState(null);   // { condicoes, sinal }: "Criar regra" na tabela da cobertura
  const itens = useItens();
  const loteRegras = useRef(0);
  const loteMateriais = useRef(0);
  const [usoDoItem, setUsoDoItem] = useState(null);           // { frase } ou { falha }: onde o item escolhido já é usado na estrutura (Fase 2, 16/10/2026)
  const loteUsoItem = useRef(0);
  const [matPorItem, setMatPorItem] = useState(null);         // { lista } ou { falha }: o material por item do veículo escolhido (Fase 3, 16/10/2026)
  const loteMatPorItem = useRef(0);
  const [multiplicam, setMultiplicam] = useState(() => new Set<string>());   // perguntas de quantidade que o material do veículo usa para multiplicar (Slimled, 22/10/2026)
  // 18d (13/10/2026): quem desenvolve o item cadastra a estrutura dele no veículo (decisão do usuário em 12/10/2026) — a Engenharia entra junto do PCP
  const pode = ehAdminOuGerente(currentUser) || ['PCP', 'Engenharia'].includes(String(currentUser?.perfil || '').trim());
  const item = itens.find(i => i.id === itemId);

  const recPerguntas = async () => setPerguntas(itemId ? await perguntasDoItem(itemId) : []);
  // a resposta de uma leitura antiga não pode sobrescrever a da mais nova (trocar de veículo depressa)
  const recMateriais = async () => {
    const meu = ++loteMateriais.current;
    const lista = veiculoId && itemId ? await materiaisDoVeiculo(veiculoId, [itemId]) : [];
    if (meu === loteMateriais.current) setMateriais(lista);
  };
  // 15/10/2026: perguntas da OP (sem item). Se a leitura falhar, a tela diz — lista vazia pareceria "nenhuma cadastrada" e convidaria a recadastrar em dobro
  const recPerguntasOp = async () => {
    try { setPerguntasOp(await perguntasDaOp()); setFalhaOp(''); }
    catch (e) { setFalhaOp(e?.message || 'falha ao ler'); }
  };
  const recPerguntasTodas = async () => {
    try { setPerguntasTodas(await todasAsPerguntas()); setFalhaPerguntas(''); }
    catch (e) { setFalhaPerguntas(e?.message || 'falha ao ler as perguntas'); }
  };
  const recRegras = async () => {
    const meu = ++loteRegras.current;
    if (!veiculoId) { setRegras([]); setFalhaRegras(''); return; }
    try { const lista = await regrasDoVeiculo(veiculoId); if (meu === loteRegras.current) { setRegras(lista); setFalhaRegras(''); } }
    catch (e) { if (meu === loteRegras.current) setFalhaRegras(e?.message || 'falha ao ler as regras'); }
  };
  // contador de uso: se a leitura falhar, os contadores somem (não mostram "sem uso" de algo que é usado)
  const recUso = async () => {
    try { setUso(await lerUsoDasRespostas()); setFalhaUso(''); }
    catch (e) { setUso(null); setFalhaUso(e?.message || 'falha ao ler o uso das respostas'); }
  };
  // leitura recusada nunca vale como "não é usado em lugar nenhum": a tela diz que não conseguiu conferir
  const recUsoDoItem = async () => {
    const meu = ++loteUsoItem.current;
    if (!itemId) { setUsoDoItem(null); return; }
    try { const u = await ondeOItemEUsado(itemId); if (meu === loteUsoItem.current) setUsoDoItem({ frase: fraseDeOndeOItemEUsado(u) }); }
    catch (e) { if (meu === loteUsoItem.current) setUsoDoItem({ falha: e?.message || 'falha ao ler' }); }
  };
  // leitura recusada nunca vale como "nenhum item tem material": a tela diz que não conseguiu ler
  const recMatPorItem = async () => {
    const meu = ++loteMatPorItem.current;
    if (!veiculoId) { setMatPorItem(null); return; }
    try {
      const [l, m] = await Promise.all([resumoDoMaterialPorItem(veiculoId), perguntasQueMultiplicamNoVeiculo(veiculoId)]);
      if (meu === loteMatPorItem.current) { setMatPorItem({ lista: l }); setMultiplicam(m); }
    }
    catch (e) { if (meu === loteMatPorItem.current) setMatPorItem({ falha: e?.message || 'falha ao ler' }); }
  };
  // do resumo do veículo para o item: escolhe o item e leva a tela até o quadro dele
  const abrirItem = (id) => { setItemId(id); setTimeout(() => document.getElementById('acn-cet-item')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); };
  useEffect(() => { recPerguntasOp(); recPerguntasTodas(); recUso(); }, []);
  // aberta pelo atalho da Engenharia (veículo já escolhido): o seletor só sabe o id, então o nome vem de uma leitura — é ele que aparece em "Regras de …" e na cópia de regras
  useEffect(() => {
    if (!veiculoInicial) return;
    supabase.from('veiculos').select('*').eq('id', veiculoInicial).maybeSingle()
      .then(({ data }) => { if (data) setVeiculo(v => (v.id === veiculoInicial && !v.nome ? { id: v.id, nome: nomeDoVeiculo(data) } : v)); });
  }, []);
  useEffect(() => { recPerguntas(); recMateriais(); recUsoDoItem(); }, [itemId]);
  useEffect(() => { recMateriais(); recRegras(); recMatPorItem(); }, [veiculoId]);

  // depois de mexer em pergunta ou resposta: tudo o que depende delas se atualiza (as regras montam as condições a partir delas)
  const aposMudarPerguntas = () => { recPerguntas(); recPerguntasOp(); recPerguntasTodas(); recUso(); recUsoDoItem(); };
  const aposMudarMaterial = () => { recMateriais(); recUso(); recUsoDoItem(); recMatPorItem(); };
  const aposMudarRegras = () => { recRegras(); recUso(); recUsoDoItem(); };

  const cobertura = useMemo(() => (veiculoId ? coberturaDoVeiculo(regras, perguntasTodas) : { eixos: [], linhas: [], total: 0, truncado: false, condicionais: [] }), [veiculoId, regras, perguntasTodas]);
  const semRegra = useMemo(() => (veiculoId ? perguntasSemRegra(regras, perguntasTodas, multiplicam) : []), [veiculoId, regras, perguntasTodas, multiplicam]);
  const falhaCobertura = falhaRegras || falhaPerguntas;

  // 64 combinações já enchem a tela: "Criar regra" leva as respostas daquela linha para o formulário
  const criarRegraDaCombinacao = (respostas, eixos) => setPedidoDeRegra({
    sinal: Date.now(),
    condicoes: eixos.filter(p => respostas[p.id]).map(p => ({ tipo: 'resposta', opcao_id: respostas[p.id] })),
  });
  const simularCombinacao = (respostas) => {
    setCombinacaoSim({ respostas, sinal: Date.now() });
    setTimeout(() => document.getElementById('acn-cet-simulador')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  // 12e54 (09/10/2026): só aparência — o roxo-azulado dos títulos virou o tom do guia, os botões miúdos viraram os botões do guia (pequenos) e o recuo das
  // perguntas filhas passou para [data-nivel] no design.css (antes era uma conta de margem escrita no JSX); o que cada botão grava não mudou
  return (
    <>
    <div className="sec-card acn-cet">
      <div className="sec-hdr">
        <span className="acn-cet-tit"><Icone path={mdiPuzzleOutline} size={16} />Estrutura de instalação</span>
      </div>
      <div className="sec-body">
        <div className="acn-ajuda acn-cet-intro">
          A <b>pergunta</b> fica no item e vale em qualquer carro. O <b>material</b> que cada resposta
          consome fica no carro. Assim "tem hack de teto?" é cadastrada uma vez só, e cada veículo
          diz qual suporte usa. Escolha o veículo aqui em cima: vale para o material do item, para as regras, para a cobertura e para o simulador.
        </div>

        <label className="acn-label">VEÍCULO</label>
        <SelectVeiculo valor={veiculoId} onChange={(id, v) => setVeiculo({ id: id || '', nome: nomeDoVeiculo(v) })} currentUser={currentUser} />
        {falhaUso && <Faixa tom="atencao">Não foi possível ler onde cada resposta é usada ({falhaUso}). Os contadores de uso ficam escondidos e apagar uma resposta não consegue avisar o que leva junto.</Faixa>}

        {/* perguntas que não são de nenhum item: valem para a OP inteira (15/10/2026) */}
        {falhaOp
          ? <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> Não foi possível ler as perguntas da OP ({falhaOp}). Recarregue a tela antes de cadastrar.</div>
          : <PerguntasDoItem itemId={null} perguntas={perguntasOp} itens={itens}
              pode={pode} currentUser={currentUser} aoMudar={aposMudarPerguntas} uso={uso}
              titulo="PERGUNTAS DA OP"
              ajuda="Valem para a OP inteira, qualquer que seja o item vendido (ex.: caracterizada ou descaracterizada, bateria frontal ou traseira). O vendedor responde na abertura da OP; só aparecem quando a venda leva o Conjunto Elétrico." />}

        <label className="acn-label" id="acn-cet-item">ITEM VENDIDO</label>
        <SelectBusca opcoes={opcoesDeItem(itens)} valor={itemId} onChange={setItemId}
          placeholder="Procure o item (nome ou código)" />
        {itemId && usoDoItem && (usoDoItem.falha
          ? <Faixa tom="atencao">Não foi possível conferir onde este item é usado ({usoDoItem.falha}).</Faixa>
          : <div className="acn-ajuda">{usoDoItem.frase ? `Este item aparece em: ${usoDoItem.frase}.` : 'Este item ainda não aparece em nenhuma pergunta, regra ou material da estrutura.'}</div>)}

        {item && (
          <>
            <MarcaConjunto item={item} pode={pode} />
            {/* o Conjunto Elétrico é o recipiente: ele não tem pergunta nem material próprios (29/09/2026) */}
            {String(item.codigo) !== '1687' && (
              <>
                <PerguntasDoItem itemId={itemId} perguntas={perguntas} itens={itens}
                  pode={pode} currentUser={currentUser} aoMudar={aposMudarPerguntas} uso={uso} />

                <div className="acn-cet-material">
                  <label className="acn-label">MATERIAL DESTE ITEM NO VEÍCULO ESCOLHIDO</label>
                  {veiculoId
                    ? <MaterialNoVeiculo veiculoId={veiculoId} itemId={itemId} materiais={materiais}
                        perguntas={perguntas} itens={itens} pode={pode} currentUser={currentUser}
                        aoMudar={aposMudarMaterial} />
                    : <div className="acn-ajuda">Escolha o veículo no alto da tela para ver e cadastrar o material deste item.</div>}
                </div>

                {/* 15/10/2026: leva perguntas, material por veículo e regras de um item para este (ex.: de uma variante de slimled para outra) */}
                {pode && (
                  <CopiarEstruturaDeItem itemId={itemId} itens={itens} veiculoId={veiculoId} currentUser={currentUser}
                    aoCopiar={() => { aposMudarPerguntas(); recMateriais(); recRegras(); recMatPorItem(); }} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
    {/* etapa 3 (15/10/2026): chicote e suporte por regra "se… então…", sempre de um veículo */}
    <RegrasDoVeiculo veiculo={veiculo} regras={regras} falha={falhaCobertura} perguntas={perguntasTodas} itens={itens}
      pode={pode} currentUser={currentUser} aoMudar={aposMudarRegras} pedidoDeRegra={pedidoDeRegra} matPorItem={matPorItem} aoAbrirItem={abrirItem} />

    <div className="sec-card acn-cet">
      <div className="sec-hdr">
        <span className="acn-cet-tit"><Icone path={mdiPuzzleOutline} size={16} />Cobertura e simulador do veículo</span>
      </div>
      <div className="sec-body">
        {!veiculoId && <div className="acn-ajuda">Escolha o veículo no alto da tela.</div>}
        {veiculoId && (
          <>
            <div className="acn-cet-sec">COBERTURA: TODA COMBINAÇÃO DE RESPOSTAS TEM REGRA?</div>
            <div className="acn-ajuda">Usa a mesma conta da OP: "a definir" aqui é o que a OP mostraria como "chicote/suporte a definir".</div>
            {falhaCobertura
              ? <Faixa tom="erro">Não foi possível ler as regras ou as perguntas ({falhaCobertura}): sem elas a cobertura não é confiável.</Faixa>
              : <CoberturaDasRegras cobertura={cobertura} semRegra={semRegra} totalDeRegras={regras.length} pode={pode}
                  aoSimular={simularCombinacao} aoCriarRegra={criarRegraDaCombinacao} />}
            <div className="acn-cet-sec espaco" id="acn-cet-simulador">SIMULADOR: O QUE UMA OP RECEBE</div>
            <SimuladorDaEstrutura veiculo={veiculo} itens={itens} combinacao={combinacaoSim?.respostas} sinal={combinacaoSim?.sinal} />
          </>
        )}
      </div>
    </div>
    </>
  );
}

/**
 * COPIAR ESTRUTURA E PERGUNTAS DE OUTRO ITEM (15/10/2026, pedido do usuário)
 *
 * O catálogo tem muitas variantes do mesmo produto (17 de slimled); o que uma tem de pergunta, material e regra serve para as outras. A cópia sempre SOMA ao que
 * este item já tem. O "escopo de veículos" vale para o material e as regras: todos os veículos, ou só o que está escolhido na tela.
 */
function CopiarEstruturaDeItem({ itemId, itens, veiculoId, currentUser, aoCopiar }) {
  const [origem, setOrigem] = useState('');
  const [escopo, setEscopo] = useState('todos');      // 'todos' | 'veiculo'
  const [marcas, setMarcas] = useState({ perguntas: true, materiais: true, regras: true });
  const [resumo, setResumo] = useState(null);
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const veiculoDoEscopo = escopo === 'veiculo' && veiculoId ? veiculoId : null;

  useEffect(() => {
    setResumo(null); setFalha('');
    if (!origem || origem === itemId) return;
    let vivo = true;
    resumoDaCopia(origem, veiculoDoEscopo).then(r => { if (vivo) setResumo(r); }).catch(e => { if (vivo) setFalha(e?.message || 'falha ao ler o item de origem'); });
    return () => { vivo = false; };
  }, [origem, escopo, veiculoId, itemId]);

  const nome = (id) => { const i = itens.find(x => x.id === id); return i ? `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}` : '(item)'; };

  const copiar = async () => {
    if (ocupado || !resumo) return;
    if (!marcas.perguntas && !marcas.materiais && !marcas.regras) { alert('Marque o que copiar.'); return; }
    if (escopo === 'veiculo' && !veiculoId) { alert('Escolha o veículo acima, ou copie para todos os veículos.'); return; }
    const partes = [
      marcas.perguntas ? `${resumo.perguntas} pergunta(s) com ${resumo.respostas} resposta(s)` : '',
      marcas.materiais ? `${resumo.materiais} linha(s) de material por veículo` : '',
      marcas.regras ? `${resumo.regras} regra(s) de chicote/suporte` : '',
    ].filter(Boolean).join(', ');
    if (!await confirmar(`Copiar para "${nome(itemId)}" o que há em "${nome(origem)}": ${partes}?\n\nA cópia se soma ao que este item já tem; nada é apagado nem substituído. `
        + `Se copiar duas vezes, fica duplicado.`)) return;
    setOcupado(true);
    const r = await copiarEstruturaDeItem({ origemId: origem, destinoId: itemId, opcoes: { ...marcas, veiculoId: veiculoDoEscopo }, currentUser });
    setOcupado(false);
    if (r.erro) { alert('A cópia falhou e nada foi copiado (a cópia é tudo ou nada): ' + r.erro); return; }
    registrarNaEstrutura(currentUser, {
      entidade: 'cadastro_itens', id: itemId, acao: 'CREATE',
      descricao: `Copiou para "${nome(itemId)}" o que havia em "${nome(origem)}": ${r.perguntas} pergunta(s) com ${r.respostas} resposta(s), ${r.materiais} linha(s) de material e ${r.regras} regra(s)`,
      detalhes: { origem, destino: itemId, veiculo: veiculoDoEscopo, perguntas: r.perguntas, respostas: r.respostas, materiais: r.materiais, regras: r.regras, materiaisSemResposta: r.materiaisSemResposta, regrasPuladas: r.regrasPuladas },
    });
    const avisos = [
      r.materiaisSemResposta ? `${r.materiaisSemResposta} linha(s) de material que dependem de uma resposta não foram copiadas (copie também as perguntas)` : '',
      r.regrasPuladas ? `${r.regrasPuladas} regra(s) que usam perguntas do item de origem não foram copiadas (copie também as perguntas)` : '',
    ].filter(Boolean);
    alert(`Copiado: ${r.perguntas} pergunta(s) com ${r.respostas} resposta(s), ${r.materiais} linha(s) de material e ${r.regras} regra(s).` + (avisos.length ? '\n\nAtenção: ' + avisos.join('; ') + '.' : ''));
    aoCopiar?.();
  };

  return (
    <div className="acn-cet-copiar">
      <label className="acn-label">COPIAR PERGUNTAS, MATERIAL E REGRAS DE OUTRO ITEM PARA ESTE</label>
      <SelectBusca opcoes={opcoesDeItem(itens.filter(i => i.id !== itemId))} valor={origem} onChange={setOrigem} placeholder="Item de origem (nome ou código)" />
      {falha && <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> {falha}</div>}
      {origem && resumo && (
        <div className="acn-cet-copiar-opcoes">
          <label><input type="checkbox" checked={marcas.perguntas} onChange={e => setMarcas(m => ({ ...m, perguntas: e.target.checked }))} /> Perguntas e respostas ({resumo.perguntas} pergunta(s), {resumo.respostas} resposta(s))</label>
          <label><input type="checkbox" checked={marcas.materiais} onChange={e => setMarcas(m => ({ ...m, materiais: e.target.checked }))} /> Material por veículo ({resumo.materiais} linha(s))</label>
          <label><input type="checkbox" checked={marcas.regras} onChange={e => setMarcas(m => ({ ...m, regras: e.target.checked }))} /> Regras de chicote/suporte que usam essas perguntas ou o item ({resumo.regras})</label>
          <select className="acn-input" value={escopo} aria-label="Veículos do material e das regras" onChange={e => setEscopo(e.target.value)}>
            <option value="todos">Material e regras de todos os veículos</option>
            <option value="veiculo" disabled={!veiculoId}>{veiculoId ? 'Só do veículo escolhido acima' : 'Só do veículo escolhido acima (escolha um veículo antes)'}</option>
          </select>
          <div><Botao pequeno variante="primario" disabled={ocupado} onClick={copiar}>{ocupado ? 'Copiando…' : 'Copiar para este item'}</Botao></div>
        </div>
      )}
      {origem && !resumo && !falha && <div className="acn-ajuda">Lendo o item de origem…</div>}
    </div>
  );
}

/**
 * REGRAS "SE… ENTÃO…" DE UM VEÍCULO (etapa 3, 15/10/2026)
 *
 * Define qual chicote e qual suporte entram, a partir das respostas da OP (caracterizada, bateria), de itens vendidos juntos (sirene S100W…) e de
 * quantidades (slimled: 2 na frente). Sempre por veículo, como decidido com o usuário.
 *
 * Editar uma regra (16/10/2026): a regra NOVA é gravada e a antiga apagada na MESMA transação do banco (`estrutura_gravar_regra`, Fase 2): ou troca inteira, ou nada
 * muda e a antiga segue valendo. (Na Fase 1 eram passos soltos feitos pelo navegador, e uma queda entre a nova e o apagar da antiga deixava as duas valendo, com o material
 * somando em dobro.)
 */
function RegrasDoVeiculo({ veiculo, regras, falha, perguntas, itens, pode, currentUser, aoMudar, pedidoDeRegra, matPorItem, aoAbrirItem }) {
  const [nome, setNome] = useState('');
  const [condicoes, setCondicoes] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [cond, setCond] = useState({ tipo: 'resposta', opcao_id: '', item_id: '', pergunta_id: '', valor: '' });
  const [mat, setMat] = useState({ material_item_id: '', quantidade: '1', acao: 'adicionar' });
  const [erroForm, setErroForm] = useState('');
  const [editando, setEditando] = useState(null);   // { id, ordem, nome } da regra que está sendo refeita
  const [ocupado, setOcupado] = useState(false);
  const refForm = useRef(null);
  const irParaForm = () => setTimeout(() => refForm.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);

  useEffect(() => { setEditando(null); setErroForm(''); }, [veiculo.id]);
  // "Criar regra" da cobertura: as respostas daquela combinação já entram como condições
  useEffect(() => {
    if (!pedidoDeRegra) return;
    setEditando(null); setNome(''); setSaidas([]); setErroForm('');
    setCondicoes(pedidoDeRegra.condicoes || []);
    irParaForm();
  }, [pedidoDeRegra?.sinal]);

  const dona = (p) => (p.item_id ? (p.cadastro_itens?.nome || 'item') : 'da OP');
  const opcoesDeResposta = perguntas.filter(p => !ehQuantidade(p)).flatMap(p => (p.opcoes || []).map(o => ({ id: o.id, rotulo: `${p.texto} → ${o.rotulo} (${dona(p)})` })));
  const perguntasQtd = perguntas.filter(p => ehQuantidade(p));
  const rotuloItem = (id) => rotuloDoItem(itens, id);
  const textoCondicao = (c) => {
    if (c.tipo === 'item') return `vendeu ${rotuloItem(c.item_id)}`;
    if (c.tipo === 'quantidade') return `${perguntas.find(p => p.id === c.pergunta_id)?.texto || '(pergunta)'} = ${Number(c.valor_numerico ?? c.valor)}`;
    return opcoesDeResposta.find(o => o.id === c.opcao_id)?.rotulo || '(resposta)';
  };
  const rotuloMaterialSalvo = (m) => (m.material ? `${m.material.codigo ? m.material.codigo + ' — ' : ''}${m.material.nome}` : rotuloItem(m.material_item_id));
  // a regra em uma frase de texto, para o histórico (a tela mostra a mesma frase com etiquetas, em FraseDaRegra)
  const fraseDaRegraTexto = (conds, mats) => `SE ${(conds || []).map(textoCondicao).join(' E ')} ENTÃO ${(mats || []).map(m => `${m.acao === 'remover' ? 'tira' : 'usa'} ${Number(m.quantidade)} × ${rotuloMaterialSalvo(m)}`).join(' + ')}`;

  const adicionarCondicao = () => {
    let nova = null;
    if (cond.tipo === 'resposta' && cond.opcao_id) nova = { tipo: 'resposta', opcao_id: cond.opcao_id };
    if (cond.tipo === 'item' && cond.item_id) nova = { tipo: 'item', item_id: cond.item_id };
    if (cond.tipo === 'quantidade' && cond.pergunta_id && /^\d+$/.test(String(cond.valor).trim())) nova = { tipo: 'quantidade', pergunta_id: cond.pergunta_id, valor_numerico: Number(cond.valor) };
    if (!nova) { setErroForm('Preencha a condição: escolha a resposta, o item ou a pergunta com o número inteiro.'); return; }
    if (condicoes.some(c => JSON.stringify(c) === JSON.stringify(nova))) { setErroForm('Esta condição já está na regra.'); return; }
    setErroForm('');
    setCondicoes(l => [...l, nova]);
    setCond(c => ({ ...c, opcao_id: '', item_id: '', pergunta_id: '', valor: '' }));
  };
  const adicionarSaida = () => {
    const q = Number(String(mat.quantidade).replace(',', '.'));
    if (!mat.material_item_id || !(q > 0)) { setErroForm('Escolha o material e uma quantidade maior que zero.'); return; }
    setErroForm('');
    setSaidas(l => [...l, { material_item_id: mat.material_item_id, quantidade: q, acao: mat.acao }]);
    setMat({ material_item_id: '', quantidade: '1', acao: 'adicionar' });
  };
  const limpar = () => { setNome(''); setCondicoes([]); setSaidas([]); setEditando(null); setErroForm(''); };

  // o formulário recebe uma regra existente (editar) ou uma cópia (duplicar)
  const carregarNoForm = (r, comoEdicao) => {
    setNome(comoEdicao ? (r.nome || '') : (r.nome ? `${r.nome} (cópia)` : ''));
    setCondicoes((r.condicoes || []).map(c => (c.tipo === 'item' ? { tipo: 'item', item_id: c.item_id }
      : c.tipo === 'quantidade' ? { tipo: 'quantidade', pergunta_id: c.pergunta_id, valor_numerico: Number(c.valor_numerico) }
      : { tipo: 'resposta', opcao_id: c.opcao_id })));
    setSaidas((r.materiais || []).map(m => ({ material_item_id: m.material_item_id, quantidade: Number(m.quantidade), acao: m.acao })));
    setEditando(comoEdicao ? { id: r.id, ordem: r.ordem, nome: r.nome || '' } : null);
    setErroForm('');
    irParaForm();
  };

  const salvar = async () => {
    if (ocupado) return;
    setErroForm('');
    if (!veiculo.id) { setErroForm('Escolha o veículo.'); return; }
    if (!condicoes.length) { setErroForm('A regra precisa de pelo menos uma condição, senão valeria para toda OP deste veículo.'); return; }
    if (!saidas.length) { setErroForm('A regra precisa de pelo menos um material (o chicote ou o suporte que ela escolhe).'); return; }
    const assinatura = (cs) => JSON.stringify(cs.map(c => `${c.tipo}:${c.opcao_id || c.item_id || c.pergunta_id}:${c.valor_numerico ?? ''}`).sort());
    if (regras.some(r => r.id !== editando?.id && assinatura(r.condicoes) === assinatura(condicoes))
        && !await confirmar('Este veículo já tem uma regra com exatamente estas condições. Criar outra assim mesmo? O material das duas soma.')) return;
    setOcupado(true);
    try {
      // Fase 2 (16/10/2026): regra + condições + materiais (e, ao editar, o apagar da antiga) numa transação só, no banco — regra sem condição ou sem material é pior que
      // nenhuma (vale para toda OP do veículo), e as duas regras valendo somam o material em dobro; com a função, nenhum dos dois sobra por queda de internet
      const antiga = editando ? regras.find(r => r.id === editando.id) : null;
      const { data: novaId, error } = await supabase.rpc('estrutura_gravar_regra', {
        p_veiculo_id: veiculo.id, p_nome: nome.trim() || null, p_ordem: editando ? editando.ordem : regras.length,
        p_condicoes: condicoes, p_materiais: saidas, p_criado_por_nome: currentUser?.nome || '—', p_substitui_id: editando?.id || null,
      });
      if (error || !novaId) {
        alert('Não foi possível gravar a regra: ' + (error?.message || 'sem resposta do banco') + '\n\nNada foi gravado' + (editando ? '; a regra antiga continua valendo' : '') + '. Tente de novo.');
        return;
      }
      const frase = fraseDaRegraTexto(condicoes, saidas);
      const deVeiculo = veiculo.nome || 'veículo';
      const registroDaNova = registrarNaEstrutura(currentUser, {
        entidade: 'veiculo_regras', id: novaId, acao: 'CREATE',
        descricao: `${editando ? 'Editou' : 'Criou'} a regra "${nome.trim() || 'sem nome'}" de ${deVeiculo}: ${frase}`,
        detalhes: { veiculo_id: veiculo.id, substitui: editando?.id || null },
      });
      if (editando) {
        // um depois do outro (sem travar a tela): o histórico sai na ordem em que as coisas aconteceram — duas gravações soltas podiam chegar trocadas
        registroDaNova.then(() => registrarNaEstrutura(currentUser, {
          entidade: 'veiculo_regras', id: editando.id, acao: 'DELETE',
          descricao: `Regra "${editando.nome || 'sem nome'}" de ${deVeiculo} trocada pela versão editada: ${antiga ? fraseDaRegraTexto(antiga.condicoes, antiga.materiais) : '(não foi possível ler a regra antiga)'}`,
          detalhes: { veiculo_id: veiculo.id, substituida_por: novaId },
        }));
      }
      limpar();
      await aoMudar();
    } finally { setOcupado(false); }
  };

  const apagar = async (r) => {
    if (!await confirmar(`Apagar a regra "${r.nome || 'sem nome'}" deste veículo?\n\nAs OPs já criadas não mudam; as próximas deixam de receber o material dela.`)) return;
    const { error } = await supabase.from('veiculo_regras').delete().eq('id', r.id);
    if (error) { alert('Não foi possível apagar a regra: ' + error.message); return; }
    registrarNaEstrutura(currentUser, {
      entidade: 'veiculo_regras', id: r.id, acao: 'DELETE',
      descricao: `Apagou a regra "${r.nome || 'sem nome'}" de ${veiculo.nome || 'veículo'}: ${fraseDaRegraTexto(r.condicoes, r.materiais)}`,
      detalhes: { veiculo_id: veiculo.id },
    });
    if (editando?.id === r.id) limpar();
    aoMudar();
  };

  const copiarDe = async (origemId, origem) => {
    if (!origemId || !veiculo.id) return;
    if (origemId === veiculo.id) { alert('Escolha um veículo diferente.'); return; }
    let qtd = 0;
    try { qtd = (await regrasDoVeiculo(origemId)).length; } catch (e) { alert('Não foi possível ler as regras de origem: ' + (e?.message || e)); return; }
    if (!qtd) { alert('Esse veículo não tem regras para copiar.'); return; }
    if (!await confirmar(`Copiar ${qtd} regra(s) de "${origem?.nome || 'outro veículo'}" para "${veiculo.nome || 'este veículo'}"?`
        + (regras.length ? `\n\nEste veículo já tem ${regras.length} regra(s): as copiadas se somam a elas, e regras iguais ficam duplicadas.` : ''))) return;
    setOcupado(true);
    const r = await copiarRegras(origemId, veiculo.id, currentUser);
    setOcupado(false);
    if (r.erro) alert(`Não foi possível copiar as regras: ${r.erro}\n\nNada foi copiado (a cópia é tudo ou nada); tente de novo.`);
    else {
      registrarNaEstrutura(currentUser, {
        entidade: 'veiculo_regras', id: veiculo.id, acao: 'CREATE',
        descricao: `Copiou ${r.copiadas} regra(s) de "${origem?.nome || 'outro veículo'}" para "${veiculo.nome || 'este veículo'}"`,
        detalhes: { origem: origemId, destino: veiculo.id, copiadas: r.copiadas },
      });
    }
    aoMudar();
  };

  return (
    <div className="sec-card acn-cet">
      <div className="sec-hdr">
        <span className="acn-cet-tit"><Icone path={mdiPuzzleOutline} size={16} />Regras de chicote e suporte por veículo</span>
      </div>
      <div className="sec-body">
        <div className="acn-ajuda acn-cet-intro">
          Uma regra diz: <b>se</b> todas as condições valerem (resposta da OP, item vendido junto, quantidade informada) <b>então</b> entra este material.
          Cada veículo tem as suas. Várias regras podem valer na mesma OP e o material delas soma; a quantidade é <b>por carro</b>.
          Se uma resposta não for usada por nenhuma regra do veículo, a OP mostra "chicote/suporte a definir".
        </div>
        {falha && <Faixa tom="erro">{falha}</Faixa>}

        {!veiculo.id && <div className="acn-ajuda">Escolha o veículo no alto da tela para ver e cadastrar as regras dele.</div>}

        {veiculo.id && (
          <>
            <div className="acn-cet-sec espaco">REGRAS DE {(veiculo.nome || 'ESTE VEÍCULO').toUpperCase()} ({regras.length})</div>
            {!regras.length && !falha && <div className="acn-ajuda">Nenhuma regra ainda: nenhum chicote ou suporte é escolhido por resposta neste veículo.</div>}
            {regras.map(r => (
              <div key={r.id} className={'acn-cet-regra' + (editando?.id === r.id ? ' editando' : '')}>
                <div className="acn-cet-regra-cab">
                  <b className="acn-cet-regra-nome">{r.nome || 'Regra sem nome'}</b>
                  {editando?.id === r.id && <Selo familia="atencao" ponto={false}>em edição</Selo>}
                  {pode && (
                    <>
                      <Botao variante="discreto" pequeno icone={mdiPencilOutline} aria-label={`Editar a regra ${r.nome || 'sem nome'}`} title="Editar: carrega a regra no formulário abaixo" onClick={() => carregarNoForm(r, true)} />
                      <Botao variante="discreto" pequeno icone={mdiContentCopy} aria-label={`Duplicar a regra ${r.nome || 'sem nome'}`} title="Duplicar: começa uma regra nova a partir desta" onClick={() => carregarNoForm(r, false)} />
                      <Botao variante="discreto" pequeno icone={mdiTrashCanOutline} className="acn-cet-x" aria-label={`Apagar a regra ${r.nome || 'sem nome'}`} onClick={() => apagar(r)} />
                    </>
                  )}
                </div>
                <FraseDaRegra condicoes={r.condicoes} saidas={r.materiais} textoCondicao={textoCondicao} rotuloMaterial={rotuloMaterialSalvo} />
              </div>
            ))}

            <div className="acn-cet-sec espaco">MATERIAL POR ITEM NESTE VEÍCULO{matPorItem?.lista?.length ? ` (${matPorItem.lista.reduce((n, m) => n + m.fixas + m.porResposta, 0)} linha(s) em ${matPorItem.lista.length} item(ns))` : ''}</div>
            <div className="acn-ajuda">
              Este material é cadastrado dentro de cada item (no quadro de cima) e <b>multiplica pela quantidade vendida</b> do item; as regras acima valem <b>por carro</b>.
              Os dois somam na lista de material da OP.
            </div>
            {matPorItem?.falha && <Faixa tom="atencao">Não foi possível ler o material por item deste veículo ({matPorItem.falha}).</Faixa>}
            {matPorItem?.lista && !matPorItem.lista.length && <div className="acn-ajuda">Nenhum item tem material cadastrado neste veículo.</div>}
            {(matPorItem?.lista || []).slice().sort((a, b) => rotuloItem(a.item_id).localeCompare(rotuloItem(b.item_id))).map(m => (
              <div key={m.item_id} className="acn-cet-linha">
                <span className="acn-cet-mat-nome"><b>{rotuloItem(m.item_id)}</b> · {m.fixas} sempre, {m.porResposta} conforme a resposta</span>
                <Botao variante="discreto" pequeno onClick={() => aoAbrirItem(m.item_id)}>Abrir o item</Botao>
              </div>
            ))}

            {pode && (
              <>
                <div className="acn-cet-form" ref={refForm}>
                  <label className="acn-label"><Icone path={mdiPlus} size={13} /> {editando ? `EDITANDO A REGRA "${(editando.nome || 'SEM NOME').toUpperCase()}"` : 'NOVA REGRA NESTE VEÍCULO'}</label>
                  {editando && <div className="acn-ajuda">Ao salvar, a regra nova entra e a antiga sai de uma vez só. Se algo falhar, nada muda e a antiga continua valendo.</div>}
                  <input className="acn-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (opcional). Ex.: Chicote principal — caracterizado, bateria frontal" />

                  <div className="acn-cet-sec espaco">SE (todas as condições)</div>
                  {condicoes.map((c, i) => (
                    <div key={i} className="acn-cet-linha">
                      <span className="acn-cet-mat-nome">{textoCondicao(c)}</span>
                      <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label="Tirar esta condição" onClick={() => setCondicoes(l => l.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <div className="acn-cet-grade-regra">
                    <select className="acn-input" value={cond.tipo} aria-label="Tipo de condição" onChange={e => setCond({ tipo: e.target.value, opcao_id: '', item_id: '', pergunta_id: '', valor: '' })}>
                      <option value="resposta">a resposta foi…</option>
                      <option value="item">o item foi vendido…</option>
                      <option value="quantidade">a quantidade é…</option>
                    </select>
                    {cond.tipo === 'resposta' && (
                      <select className="acn-input" value={cond.opcao_id} aria-label="Resposta" onChange={e => setCond(c => ({ ...c, opcao_id: e.target.value }))}>
                        <option value="">— escolha a resposta —</option>
                        {opcoesDeResposta.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                      </select>
                    )}
                    {cond.tipo === 'item' && (
                      <SelectBusca opcoes={opcoesDeItem(itens)} valor={cond.item_id} onChange={v => setCond(c => ({ ...c, item_id: v }))} placeholder="Item vendido" />
                    )}
                    {cond.tipo === 'quantidade' && (
                      <select className="acn-input" value={cond.pergunta_id} aria-label="Pergunta de quantidade" onChange={e => setCond(c => ({ ...c, pergunta_id: e.target.value }))}>
                        <option value="">— escolha a pergunta —</option>
                        {perguntasQtd.map(p => <option key={p.id} value={p.id}>{p.texto} ({dona(p)})</option>)}
                      </select>
                    )}
                    {cond.tipo === 'quantidade'
                      ? <input className="acn-input" inputMode="numeric" value={cond.valor} aria-label="Quantidade" placeholder="Nº" onChange={e => setCond(c => ({ ...c, valor: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                      : <span />}
                    <Botao pequeno variante="secundario" onClick={adicionarCondicao}>Adicionar condição</Botao>
                  </div>

                  <div className="acn-cet-sec espaco">ENTÃO (material)</div>
                  {saidas.map((s, i) => (
                    <div key={i} className="acn-cet-linha">
                      <span className={'acn-cet-acao' + (s.acao === 'remover' ? ' remover' : '')}>{s.acao === 'remover' ? '− tira' : '+ usa'} {s.quantidade}</span>
                      <span className="acn-cet-mat-nome">{rotuloItem(s.material_item_id)}</span>
                      <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label="Tirar este material" onClick={() => setSaidas(l => l.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <div className="acn-cet-grade">
                    <SelectBusca opcoes={opcoesDeItem(itens)} valor={mat.material_item_id} onChange={v => setMat(m => ({ ...m, material_item_id: v }))} placeholder="Material (chicote, suporte…)" />
                    <input className="acn-input" inputMode="decimal" value={mat.quantidade} aria-label="Quantidade do material" onChange={e => setMat(m => ({ ...m, quantidade: e.target.value }))} placeholder="Qtd" />
                    <select className="acn-input" value={mat.acao} aria-label="Ação" onChange={e => setMat(m => ({ ...m, acao: e.target.value }))}>
                      <option value="adicionar">usa</option>
                      <option value="remover">tira da lista</option>
                    </select>
                    <span />
                    <Botao pequeno variante="secundario" onClick={adicionarSaida}>Adicionar material</Botao>
                  </div>

                  {(condicoes.length > 0 || saidas.length > 0) && (
                    <div className="acn-cet-previa">
                      <div className="acn-cet-sec espaco">COMO A REGRA VAI FICAR</div>
                      <FraseDaRegra condicoes={condicoes} saidas={saidas} textoCondicao={textoCondicao} rotuloMaterial={(s) => rotuloItem(s.material_item_id)} />
                    </div>
                  )}
                  {erroForm && <Faixa tom="erro">{erroForm}</Faixa>}
                  <div className="acn-cet-regra-salvar">
                    <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Gravando…' : (editando ? 'Salvar alterações' : 'Salvar regra')}</Botao>
                    {(editando || condicoes.length > 0 || saidas.length > 0 || nome) && <Botao variante="discreto" disabled={ocupado} onClick={limpar}>{editando ? 'Cancelar edição' : 'Limpar'}</Botao>}
                  </div>
                </div>

                <div className="acn-cet-copiar">
                  <label className="acn-label">COPIAR AS REGRAS DE OUTRO VEÍCULO PARA ESTE</label>
                  <SelectVeiculo valor="" onChange={(id, v) => { if (id) copiarDe(id, { nome: nomeDoVeiculo(v) }); }}
                    currentUser={currentUser} compacto placeholder="Veículo de origem" />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** O interruptor: marcar o item que representa o material de instalação. */
function MarcaConjunto({ item }) {
  // Decisão do usuário em 29/09/2026: existe UM Conjunto Elétrico só, o item 1687, e ele já é o gatilho — a marca não se
  // escolhe mais aqui (o banco recusa qualquer outro). A tela só explica, e só no próprio 1687.
  if (String(item?.codigo) !== '1687') return null;
  return (
    <div className="acn-cet-aviso">
      <div className="acn-cet-aviso-tit"><Icone path={mdiLockOutline} size={14} /> <b>Este é o Conjunto Elétrico</b> — o único do sistema (código 1687)</div>
      <div className="acn-cet-aviso-txt">
        Representa suportes, chicotes, parafusos e afins na nota e no PV. A presença dele na venda é o que <b>liga</b> a
        montagem automática do material de cada item. Venda sem ele — cliente que usa peça de terceiro — não monta nada.
        O material fica cadastrado nos <b>outros itens vendidos</b>, carro a carro; este item não tem estrutura própria.
      </div>
    </div>
  );
}

// `itemId` nulo = perguntas da OP (sem item). `titulo` e `ajuda` só mudam o texto.
// 16/10/2026: as perguntas vêm recolhidas (a resposta de cada uma aparece como etiqueta com o uso dela); abrir mostra as respostas e os botões. `uso` é o contador de
// quantas regras e linhas de material usam cada resposta (nulo se a leitura falhou: sem contador em vez de um "sem uso" falso).
function PerguntasDoItem({ itemId, perguntas, itens, pode, currentUser, aoMudar, uso, titulo = '', ajuda = '' }) {
  const daOp = !itemId;
  const [abertas, setAbertas] = useState(() => new Set());
  const [editor, setEditor] = useState(null);   // { tipo: 'cond' | 'auto', id }
  useEffect(() => { setAbertas(new Set()); setEditor(null); }, [itemId]);
  const alternar = (id) => setAbertas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nivelDe = (p, visto = 0) => {
    if (!p.opcao_pai_id || visto > 8) return 0;
    const pai = perguntas.find(x => (x.opcoes || []).some(o => o.id === p.opcao_pai_id));
    return pai ? nivelDe(pai, visto + 1) + 1 : 0;
  };
  const temFilha = (opcaoId) => perguntas.some(p => p.opcao_pai_id === opcaoId);
  // perguntas que só aparecem depois de uma resposta (e as filhas delas): apagar a resposta leva todas junto (o banco encadeia)
  const filhasDaOpcao = (opcaoId, visto = 0) => {
    if (visto > 8) return [];
    const diretas = perguntas.filter(p => p.opcao_pai_id === opcaoId);
    return diretas.flatMap(p => [p, ...(p.opcoes || []).flatMap(o => filhasDaOpcao(o.id, visto + 1))]);
  };

  // `tipo` 'quantidade' (etapa 2, 15/10/2026): quem responde digita um número em vez de escolher uma resposta cadastrada
  const addPergunta = async (opcaoPaiId = null, tipo = 'opcoes') => {
    const texto = await pedirTexto(opcaoPaiId
      ? 'Pergunta que só aparece depois desta resposta:'
      : tipo === 'quantidade' ? 'Qual quantidade o vendedor deve informar?\n\nEx.: "Quantos na frente?"'
      : daOp ? 'Qual pergunta o vendedor deve responder sobre a OP?\n\nEx.: "O veículo é caracterizado?"'
        : 'Qual pergunta o vendedor deve responder sobre o carro?\n\nEx.: "Tem hack de teto?"', '');
    if (!texto?.trim()) return;
    const { data: nova, error } = await supabase.from('item_perguntas').insert([{
      item_id: itemId || null, opcao_pai_id: opcaoPaiId, texto: texto.trim(), ordem: perguntas.length,
      tipo, criado_por_nome: currentUser?.nome || '—',
    }]).select('id').single();
    if (error) { alert('Não foi possível criar: ' + error.message); return; }
    if (nova?.id) {
      registrarNaEstrutura(currentUser, {
        entidade: 'item_perguntas', id: nova.id, acao: 'CREATE',
        descricao: `Criou a pergunta ${tipo === 'quantidade' ? 'de quantidade ' : ''}"${texto.trim()}" (${daOp ? 'da OP' : rotuloDoItem(itens, itemId)}${opcaoPaiId ? ', só depois de uma resposta' : ''})`,
        detalhes: { item_id: itemId || null, opcao_pai_id: opcaoPaiId, tipo },
      });
    }
    aoMudar();
  };
  const addOpcao = async (perguntaId, qtd) => {
    const rot = await pedirTexto('Resposta possível:\n\nEx.: "Tem, hack alto"', '');
    if (!rot?.trim()) return;
    const { data: nova, error } = await supabase.from('item_pergunta_opcoes').insert([{ pergunta_id: perguntaId, rotulo: rot.trim(), ordem: qtd }]).select('id').single();
    if (error) { alert('Não foi possível criar a resposta: ' + error.message); return; }
    if (nova?.id) {
      registrarNaEstrutura(currentUser, {
        entidade: 'item_pergunta_opcoes', id: nova.id, acao: 'CREATE',
        descricao: `Criou a resposta "${rot.trim()}" da pergunta "${perguntas.find(p => p.id === perguntaId)?.texto || ''}"`,
        detalhes: { pergunta_id: perguntaId },
      });
    }
    setAbertas(s => new Set(s).add(perguntaId));
    aoMudar();
  };

  // Apagar diz antes o que leva junto (16/10/2026). Etapa 3 (15/10/2026): se uma regra de chicote/suporte usa esta pergunta/resposta, o banco recusa de propósito
  // (apagar mudaria o que a regra faz) — e a tela explica em vez de fingir que apagou.
  const apagarComAviso = async (tabela, id, oque, lerLeva, filhas) => {
    let leva;
    try { leva = await lerLeva(); }
    catch (e) { alert(`Não foi possível conferir onde ${oque} é usada (${e?.message || e}). Nada foi apagado.`); return; }
    if (leva.regras > 0) {
      alert(`Não dá para apagar ${oque}: ela é usada por ${leva.regras} condição(ões) de regra de chicote/suporte de algum veículo. Apague ou ajuste a regra antes.`);
      return;
    }
    const frase = fraseDoQueLeva(leva);
    const partes = [frase, filhas.length ? `${filhas.length} pergunta(s) que só aparecem depois dela` : ''].filter(Boolean).join(', ');
    if (!await confirmar(`Apagar ${oque}?` + (partes ? `\n\nIsto também apaga: ${partes}.` : ''))) return;
    const { error } = await supabase.from(tabela).delete().eq('id', id);
    if (error) {
      alert(error.code === '23503'
        ? 'Não dá para apagar: esta pergunta ou resposta é usada por uma regra de chicote/suporte de algum veículo. Apague a regra antes.'
        : 'Não foi possível apagar: ' + error.message);
      return;
    }
    registrarNaEstrutura(currentUser, {
      entidade: tabela, id, acao: 'DELETE',
      descricao: `Apagou ${oque}${partes ? ' (junto: ' + partes + ')' : ''}`,
      detalhes: { levou: partes || null },
    });
    aoMudar();
  };
  const apagarPergunta = (p) => apagarComAviso('item_perguntas', p.id, `a pergunta "${p.texto}"`, () => oQueApagarPerguntaLeva(p),
    (p.opcoes || []).flatMap(o => filhasDaOpcao(o.id)));
  const apagarOpcao = (o) => apagarComAviso('item_pergunta_opcoes', o.id, `a resposta "${o.rotulo}"`, () => oQueApagarRespostaLeva(o.id), filhasDaOpcao(o.id));

  // "automática se…": a resposta se marca sozinha quando TODOS os itens escolhidos estão na venda. Caso real: parachoque de impulsão + slimled — os slimled
  // prendem direto no parachoque, então o suporte deles sai da lista e ninguém precisa ser perguntado. Sem itens = sem regra automática.
  const salvarAutomatica = async (opcao, ids) => {
    const { error } = await supabase.from('item_pergunta_opcoes').update({ auto_quando_itens: ids.length ? ids : null }).eq('id', opcao.id);
    if (error) return 'Não foi possível gravar: ' + error.message;
    registrarNaEstrutura(currentUser, {
      entidade: 'item_pergunta_opcoes', id: opcao.id, acao: 'UPDATE', descricao: `Mudou "automática se…" da resposta "${opcao.rotulo}"`,
      antes: { auto_quando_itens: listaDeItens(opcao.auto_quando_itens) }, depois: { auto_quando_itens: listaDeItens(ids) },
    });
    setEditor(null); aoMudar(); return '';
  };
  // "aparece só com…" (etapa 2, 15/10/2026): a pergunta só aparece quando TODOS os itens escolhidos estão na venda — "somente quando 1 ou mais itens são vendidos juntos"
  const salvarCondicao = async (p, ids) => {
    const { error } = await supabase.from('item_perguntas').update({ quando_itens: ids.length ? ids : null }).eq('id', p.id);
    if (error) return 'Não foi possível gravar a condição: ' + error.message;
    registrarNaEstrutura(currentUser, {
      entidade: 'item_perguntas', id: p.id, acao: 'UPDATE', descricao: `Mudou "aparece só com…" da pergunta "${p.texto}"`,
      antes: { quando_itens: listaDeItens(p.quando_itens) }, depois: { quando_itens: listaDeItens(ids) },
    });
    setEditor(null); aoMudar(); return '';
  };
  // o histórico guarda os itens por nome (o código sozinho não diz nada a quem lê depois)
  const listaDeItens = (ids) => ((ids || []).length ? ids.map(id => rotuloDoItem(itens, id)).join(' + ') : '(nenhum)');
  const codigosDaCondicao = (p) => (p.quando_itens || []).map(id => itens.find(i => i.id === id)?.codigo || '?').join(', ');
  const textoUso = (n) => (n ? `${n} uso${n === 1 ? '' : 's'}` : 'sem uso');
  const textoRegras = (n) => (n ? `${n} regra${n === 1 ? '' : 's'}` : 'sem regra');

  return (
    <div className="acn-cet-perguntas">
      <div className="acn-cet-sec">
        {titulo ? `${titulo} (${perguntas.length})` : `PERGUNTAS DESTE ITEM (${perguntas.length}) — valem em qualquer carro`}
      </div>
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
      {!perguntas.length && (
        <div className="acn-ajuda">
          {daOp ? 'Nenhuma ainda.' : 'Nenhuma. Se a instalação deste item não varia conforme o carro, não precisa de pergunta.'}
        </div>
      )}
      {perguntas.length > 3 && (
        <div className="acn-cet-todas">
          <Botao pequeno variante="discreto" className="acn-cet-mini" onClick={() => setAbertas(new Set(perguntas.map(p => p.id)))}>abrir todas</Botao>
          <Botao pequeno variante="discreto" className="acn-cet-mini" onClick={() => setAbertas(new Set())}>recolher todas</Botao>
        </div>
      )}
      {perguntas.map(p => {
        const aberta = abertas.has(p.id);
        const opcoes = p.opcoes || [];
        return (
          <div key={p.id} className={'acn-cet-perg' + (p.opcao_pai_id ? ' filha' : '')} data-nivel={nivelDe(p)}>
            <div className="acn-cet-perg-cab">
              <Botao variante="discreto" pequeno icone={aberta ? mdiChevronDown : mdiChevronRight} className="acn-cet-alterna" aria-expanded={aberta}
                aria-label={`${aberta ? 'Recolher' : 'Abrir'} a pergunta "${p.texto}"`} onClick={() => alternar(p.id)} />
              <span className="acn-cet-perg-txt" onClick={() => alternar(p.id)}>
                <Icone path={mdiHelpCircleOutline} size={14} /> {p.texto}
                {p.tipo === 'quantidade' && <Selo familia="info" ponto={false}>resposta numérica</Selo>}
                {(p.quando_itens || []).length > 0 && <Selo familia="atencao" ponto={false} title="A pergunta só é feita quando todos estes itens estão na venda">só com: {codigosDaCondicao(p)}</Selo>}
                {(p.quando_algum_item || []).length > 0 && <Selo familia="atencao" ponto={false} title="A pergunta só é feita quando pelo menos um destes itens está na venda">e com algum de {p.quando_algum_item.length} itens (ex.: slimled)</Selo>}
                {p.tipo !== 'quantidade' && !opcoes.length && <Selo familia="atencao" ponto={false}>sem respostas — não faz nada ainda</Selo>}
              </span>
              {pode && (
                <>
                  <Botao pequeno variante="secundario" className="acn-cet-mini" title="A pergunta só é feita quando estes itens estiverem na venda"
                    onClick={() => setEditor(e => (e?.tipo === 'cond' && e.id === p.id ? null : { tipo: 'cond', id: p.id }))}>aparece só com…</Botao>
                  {p.tipo !== 'quantidade' && (
                    <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini"
                      onClick={() => addOpcao(p.id, opcoes.length)}>resposta</Botao>
                  )}
                  <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a pergunta "${p.texto}"`}
                    onClick={() => apagarPergunta(p)} />
                </>
              )}
            </div>

            {editor?.tipo === 'cond' && editor.id === p.id && (
              <EditorDeItens titulo="Aparece só quando estes itens forem vendidos juntos" idsIniciais={p.quando_itens} itens={itens}
                ajuda="Precisam estar todos na venda. Ex.: pergunta de quantidade do slimled que só vale quando o parachoque de impulsão também foi vendido."
                aoSalvar={(ids) => salvarCondicao(p, ids)} aoCancelar={() => setEditor(null)} />
            )}

            {/* recolhida: as respostas viram etiquetas com o uso de cada uma (âmbar = nenhuma regra nem material usa) */}
            {!aberta && opcoes.length > 0 && (
              <div className="acn-cet-resumo">
                {opcoes.map(o => (
                  <Selo key={o.id} familia={!uso ? 'neutro' : usosDaResposta(uso, o.id) ? 'info' : 'atencao'} ponto={false}
                    title={uso ? 'Quantas regras de veículo e linhas de material por resposta dependem desta resposta' : undefined}>
                    {o.rotulo}{uso ? ` · ${textoUso(usosDaResposta(uso, o.id))}` : ''}
                  </Selo>
                ))}
              </div>
            )}
            {!aberta && p.tipo === 'quantidade' && uso && (
              <div className="acn-cet-resumo">
                <Selo familia={uso.regrasPorPergunta.get(String(p.id)) ? 'info' : 'atencao'} ponto={false}>
                  {textoRegras(uso.regrasPorPergunta.get(String(p.id)) || 0)}
                </Selo>
              </div>
            )}

            {aberta && p.tipo !== 'quantidade' && !opcoes.length && (
              <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> sem respostas — não faz nada ainda</div>
            )}
            {aberta && opcoes.map(o => (
              <React.Fragment key={o.id}>
                <div className="acn-cet-opcao">
                  <span className="acn-cet-opcao-txt">
                    <Icone path={mdiChevronRight} size={13} /> {o.rotulo}
                    {(o.auto_quando_itens || []).length > 0 && (
                      <Selo familia="atencao" ponto={false} title="A resposta se marca sozinha quando todos os itens escolhidos estão na venda">
                        automática com {o.auto_quando_itens.length} item(ns)
                      </Selo>
                    )}
                    {uso && <Selo familia={usosDaResposta(uso, o.id) ? 'info' : 'atencao'} ponto={false}>{textoUso(usosDaResposta(uso, o.id))}</Selo>}
                  </span>
                  {pode && (
                    <>
                      <Botao pequeno variante="secundario" className="acn-cet-mini" title="A resposta se marca sozinha quando estes itens estiverem na venda"
                        onClick={() => setEditor(e => (e?.tipo === 'auto' && e.id === o.id ? null : { tipo: 'auto', id: o.id }))}>automática se…</Botao>
                      {!temFilha(o.id) && (
                        <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini"
                          onClick={() => addPergunta(o.id)}>pergunta</Botao>
                      )}
                      <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a resposta "${o.rotulo}"`}
                        onClick={() => apagarOpcao(o)} />
                    </>
                  )}
                </div>
                {editor?.tipo === 'auto' && editor.id === o.id && (
                  <EditorDeItens titulo={`"${o.rotulo}" é marcada sozinha quando estes itens estiverem na venda`} idsIniciais={o.auto_quando_itens} itens={itens}
                    ajuda="Caso real: parachoque de impulsão + slimled — os slimled prendem direto no parachoque, então o suporte deles sai da lista e ninguém precisa ser perguntado."
                    aoSalvar={(ids) => salvarAutomatica(o, ids)} aoCancelar={() => setEditor(null)} />
                )}
              </React.Fragment>
            ))}
          </div>
        );
      })}
      {pode && (
        <>
          <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini acn-cet-nova" onClick={() => addPergunta(null)}>
            pergunta
          </Botao>
          <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini acn-cet-nova" onClick={() => addPergunta(null, 'quantidade')}>
            pergunta de quantidade
          </Botao>
        </>
      )}
    </div>
  );
}

function MaterialNoVeiculo({ veiculoId, itemId, materiais, perguntas, itens, pode, currentUser, aoMudar }) {
  const [novo, setNovo] = useState({ material_item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '', multiplicar_pergunta_id: '' });
  // perguntas de quantidade DESTE item ("Quantos na frente?"): a linha pode multiplicar por elas em vez de pela quantidade vendida (Slimled, 22/10/2026)
  const perguntasDeQuantidade = perguntas.filter(p => ehQuantidade(p));
  const textoDaPergunta = (id) => perguntas.find(p => p.id === id)?.texto || 'pergunta apagada';

  const add = async () => {
    if (!novo.material_item_id) { alert('Escolha o material.'); return; }
    const quantidade = Number(String(novo.quantidade).replace(',', '.')) || 1;
    const { data: nova, error } = await supabase.from('veiculo_item_materiais').insert([{
      veiculo_id: veiculoId, item_id: itemId,
      opcao_id: novo.opcao_id || null,
      multiplicar_pergunta_id: novo.multiplicar_pergunta_id || null,
      material_item_id: novo.material_item_id,
      quantidade,
      acao: novo.acao, ordem: materiais.length,
      criado_por_nome: currentUser?.nome || '—',
    }]).select('id').single();
    if (error) { alert('Não foi possível adicionar: ' + error.message); return; }
    if (nova?.id) {
      registrarNaEstrutura(currentUser, {
        entidade: 'veiculo_item_materiais', id: nova.id, acao: 'CREATE',
        descricao: `Material por veículo: ${novo.acao === 'remover' ? 'tira' : 'usa'} ${quantidade} × ${rotuloDoItem(itens, novo.material_item_id)} no item ${rotuloDoItem(itens, itemId)}${novo.opcao_id ? ' (' + rotuloDaOpcao(novo.opcao_id) + ')' : ''}`,
        detalhes: { veiculo_id: veiculoId, item_id: itemId, opcao_id: novo.opcao_id || null },
      });
    }
    setNovo({ material_item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '', multiplicar_pergunta_id: '' });
    aoMudar();
  };
  const apagar = async (id) => {
    if (!await confirmar('Apagar esta linha de material?')) return;
    const linha = materiais.find(x => x.id === id);
    const { error } = await supabase.from('veiculo_item_materiais').delete().eq('id', id);
    if (error) { alert('Não foi possível apagar: ' + error.message); return; }
    registrarNaEstrutura(currentUser, {
      entidade: 'veiculo_item_materiais', id, acao: 'DELETE',
      descricao: linha
        ? `Apagou o material por veículo: ${linha.acao === 'remover' ? 'tira' : 'usa'} ${Number(linha.quantidade)} × ${rotuloDoItem(itens, linha.material_item_id)} no item ${rotuloDoItem(itens, itemId)}${linha.opcao_id ? ' (' + rotuloDaOpcao(linha.opcao_id) + ')' : ''}`
        : 'Apagou uma linha de material por veículo',
      detalhes: { veiculo_id: veiculoId, item_id: itemId },
    });
    aoMudar();
  };
  const rotuloDaOpcao = (opcaoId) => {
    for (const p of perguntas) {
      const o = (p.opcoes || []).find(x => x.id === opcaoId);
      if (o) return `${p.texto} → ${o.rotulo}`;
    }
    return 'resposta apagada';
  };

  const fixos = materiais.filter(m => !m.opcao_id);
  const porResposta = materiais.filter(m => m.opcao_id);

  const Linha = ({ m }) => (
    <div className="acn-cet-linha">
      <span className={'acn-cet-acao' + (m.acao === 'remover' ? ' remover' : '')}>
        {m.acao === 'remover' ? '− tira' : '+ usa'} {m.quantidade}
        {m.multiplicar_pergunta_id ? <span title="Multiplica pela resposta, não pela quantidade vendida"> × "{textoDaPergunta(m.multiplicar_pergunta_id)}"</span> : null}
      </span>
      <span className="acn-cet-mat-nome">
        {m.material?.codigo ? <b>{m.material.codigo} — </b> : null}{m.material?.nome || '(item)'}
        {m.material?.controla_estoque && (
          <Selo familia="ok" ponto={false}>estoque</Selo>
        )}
      </span>
      {pode && <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label="Apagar esta linha de material"
        onClick={() => apagar(m.id)} />}
    </div>
  );

  return (
    <div className="acn-cet-mat">
      <div className="acn-cet-sec">
        SEMPRE, NESTE CARRO ({fixos.length})
      </div>
      {!fixos.length && <div className="acn-ajuda">Nenhum material fixo.</div>}
      {fixos.map(m => <Linha key={m.id} m={m} />)}

      {porResposta.length > 0 && (
        <>
          <div className="acn-cet-sec espaco">
            CONFORME A RESPOSTA ({porResposta.length})
          </div>
          {porResposta.map(m => (
            <div key={m.id}>
              <div className="acn-cet-rot">{rotuloDaOpcao(m.opcao_id)}</div>
              <div className="acn-cet-ind"><Linha m={m} /></div>
            </div>
          ))}
        </>
      )}

      {pode && (
        <div className="acn-cet-form">
          <label className="acn-label"><Icone path={mdiPlus} size={13} /> MATERIAL QUE ESTE ITEM CONSOME NESTE CARRO</label>
          <div className="acn-cet-grade">
            <SelectBusca opcoes={opcoesDeItem(itens)} valor={novo.material_item_id}
              onChange={v => setNovo(f => ({ ...f, material_item_id: v }))} placeholder="Material" />
            <input className="acn-input" inputMode="decimal" value={novo.quantidade}
              onChange={e => setNovo(f => ({ ...f, quantidade: e.target.value }))} placeholder="Qtd" />
            <select className="acn-input" value={novo.acao} onChange={e => setNovo(f => ({ ...f, acao: e.target.value }))}>
              <option value="adicionar">usa</option>
              <option value="remover">tira da lista</option>
            </select>
            <select className="acn-input" value={novo.opcao_id} onChange={e => setNovo(f => ({ ...f, opcao_id: e.target.value }))}>
              <option value="">sempre, neste carro</option>
              {perguntas.flatMap(p => (p.opcoes || []).map(o => (
                <option key={o.id} value={o.id}>{p.texto} → {o.rotulo}</option>
              )))}
            </select>
            {perguntasDeQuantidade.length > 0 && (
              <select className="acn-input" value={novo.multiplicar_pergunta_id} onChange={e => setNovo(f => ({ ...f, multiplicar_pergunta_id: e.target.value }))}>
                <option value="">por unidade vendida</option>
                {perguntasDeQuantidade.map(p => <option key={p.id} value={p.id}>por "{p.texto}"</option>)}
              </select>
            )}
            <Botao pequeno variante="primario" onClick={add}>Adicionar</Botao>
          </div>
          <div className="acn-ajuda">
            "tira da lista" é para a linha que <b>desfaz</b> o que outra pôs. A quantidade é <b>por unidade vendida</b> deste item: vendeu 2, entra o dobro (nas regras de chicote e suporte, mais abaixo, a quantidade é por carro).
          </div>
        </div>
      )}
    </div>
  );
}
