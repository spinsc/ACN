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
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto } from './Feedback';
import { SelectBusca, Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiPuzzleOutline, mdiLockOutline, mdiHelpCircleOutline, mdiChevronRight, mdiAlertOutline, mdiClose, mdiPlus } from '@mdi/js';
import { SelectVeiculo } from './VeiculoCadastro';
import { perguntasDoItem, perguntasDaOp, materiaisDoVeiculo, itensAtivosDoCatalogo, regrasDoVeiculo, todasAsPerguntas, copiarRegras, ehQuantidade, copiarEstruturaDeItem, resumoDaCopia } from './ConfigEstrutura';
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

export default function ConfigEstruturaTela({ currentUser, itemInicial = '', veiculoInicial = '' }) {
  // 18d (13/10/2026): o atalho "Cadastrar estrutura" do pedido de desenvolvimento abre a tela já no item e no veículo daquela linha
  const [itemId, setItemId] = useState(itemInicial || '');
  const [veiculoId, setVeiculoId] = useState(veiculoInicial || '');
  const [perguntas, setPerguntas] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [perguntasOp, setPerguntasOp] = useState([]);
  const [falhaOp, setFalhaOp] = useState('');
  const itens = useItens();
  // 18d (13/10/2026): quem desenvolve o item cadastra a estrutura dele no veículo (decisão do usuário em 12/10/2026) — a Engenharia entra junto do PCP
  const pode = ehAdminOuGerente(currentUser) || ['PCP', 'Engenharia'].includes(String(currentUser?.perfil || '').trim());
  const item = itens.find(i => i.id === itemId);

  const recPerguntas = async () => setPerguntas(itemId ? await perguntasDoItem(itemId) : []);
  const recMateriais = async () =>
    setMateriais(veiculoId && itemId ? await materiaisDoVeiculo(veiculoId, [itemId]) : []);
  // 15/10/2026: perguntas da OP (sem item). Se a leitura falhar, a tela diz — lista vazia pareceria "nenhuma cadastrada" e convidaria a recadastrar em dobro
  const recPerguntasOp = async () => {
    try { setPerguntasOp(await perguntasDaOp()); setFalhaOp(''); }
    catch (e) { setFalhaOp(e?.message || 'falha ao ler'); }
  };
  useEffect(() => { recPerguntasOp(); }, []);
  useEffect(() => { recPerguntas(); recMateriais(); }, [itemId]);
  useEffect(() => { recMateriais(); }, [veiculoId]);

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
          diz qual suporte usa.
        </div>

        {/* perguntas que não são de nenhum item: valem para a OP inteira (15/10/2026) */}
        {falhaOp
          ? <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> Não foi possível ler as perguntas da OP ({falhaOp}). Recarregue a tela antes de cadastrar.</div>
          : <PerguntasDoItem itemId={null} perguntas={perguntasOp} itens={itens}
              pode={pode} currentUser={currentUser} aoMudar={recPerguntasOp}
              titulo="PERGUNTAS DA OP"
              ajuda="Valem para a OP inteira, qualquer que seja o item vendido (ex.: caracterizada ou descaracterizada, bateria frontal ou traseira). O vendedor responde na abertura da OP; só aparecem quando a venda leva o Conjunto Elétrico." />}

        <label className="acn-label">ITEM VENDIDO</label>
        <SelectBusca opcoes={opcoesDeItem(itens)} valor={itemId} onChange={setItemId}
          placeholder="Procure o item (nome ou código)" />

        {item && (
          <>
            <MarcaConjunto item={item} pode={pode} />
            {/* o Conjunto Elétrico é o recipiente: ele não tem pergunta nem material próprios (29/09/2026) */}
            {String(item.codigo) !== '1687' && (
              <>
                <PerguntasDoItem itemId={itemId} perguntas={perguntas} itens={itens}
                  pode={pode} currentUser={currentUser} aoMudar={recPerguntas} />

                <div className="acn-cet-material">
                  <label className="acn-label">MATERIAL DESTE ITEM EM QUAL CARRO</label>
                  <SelectVeiculo valor={veiculoId} onChange={setVeiculoId} currentUser={currentUser} />
                  {veiculoId && (
                    <MaterialNoVeiculo veiculoId={veiculoId} itemId={itemId} materiais={materiais}
                      perguntas={perguntas} itens={itens} pode={pode} currentUser={currentUser}
                      aoMudar={recMateriais} />
                  )}
                </div>

                {/* 15/10/2026: leva perguntas, material por veículo e regras de um item para este (ex.: de uma variante de slimled para outra) */}
                {pode && (
                  <CopiarEstruturaDeItem itemId={itemId} itens={itens} veiculoId={veiculoId} currentUser={currentUser}
                    aoCopiar={() => { recPerguntas(); recMateriais(); recPerguntasOp(); }} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
    {/* etapa 3 (15/10/2026): chicote e suporte por regra "se… então…", sempre de um veículo */}
    <RegrasDoVeiculo currentUser={currentUser} pode={pode} itens={itens} />
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
    if (r.erro) { alert('A cópia falhou e o que ela tinha criado foi desfeito: ' + r.erro); return; }
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
 * quantidades (slimled: 2 na frente). Sempre por veículo, como decidido com o usuário. Para editar uma regra, apague e crie de novo: assim nenhuma
 * regra muda de sentido por acidente.
 */
function RegrasDoVeiculo({ currentUser, pode, itens }) {
  const [veiculo, setVeiculo] = useState({ id: '', nome: '' });
  const [regras, setRegras] = useState([]);
  const [perguntas, setPerguntas] = useState([]);
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState('');
  const [condicoes, setCondicoes] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [cond, setCond] = useState({ tipo: 'resposta', opcao_id: '', item_id: '', pergunta_id: '', valor: '' });
  const [mat, setMat] = useState({ material_item_id: '', quantidade: '1', acao: 'adicionar' });

  const recarregar = async () => {
    if (!veiculo.id) { setRegras([]); return; }
    try { setRegras(await regrasDoVeiculo(veiculo.id)); setFalha(''); }
    catch (e) { setFalha(e?.message || 'falha ao ler as regras'); }
  };
  useEffect(() => { recarregar(); }, [veiculo.id]);
  useEffect(() => { todasAsPerguntas().then(setPerguntas).catch(e => setFalha(e?.message || 'falha ao ler as perguntas')); }, []);

  const dona = (p) => (p.item_id ? (p.cadastro_itens?.nome || 'item') : 'da OP');
  const opcoesDeResposta = perguntas.filter(p => !ehQuantidade(p)).flatMap(p => (p.opcoes || []).map(o => ({ id: o.id, rotulo: `${p.texto} → ${o.rotulo} (${dona(p)})` })));
  const perguntasQtd = perguntas.filter(p => ehQuantidade(p));
  const rotuloItem = (id) => { const i = itens.find(x => x.id === id); return i ? `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}` : '(item)'; };
  const textoCondicao = (c) => {
    if (c.tipo === 'item') return `vendeu ${rotuloItem(c.item_id)}`;
    if (c.tipo === 'quantidade') return `${perguntas.find(p => p.id === c.pergunta_id)?.texto || '(pergunta)'} = ${Number(c.valor_numerico ?? c.valor)}`;
    return opcoesDeResposta.find(o => o.id === c.opcao_id)?.rotulo || '(resposta)';
  };

  const adicionarCondicao = () => {
    let nova = null;
    if (cond.tipo === 'resposta' && cond.opcao_id) nova = { tipo: 'resposta', opcao_id: cond.opcao_id };
    if (cond.tipo === 'item' && cond.item_id) nova = { tipo: 'item', item_id: cond.item_id };
    if (cond.tipo === 'quantidade' && cond.pergunta_id && /^\d+$/.test(String(cond.valor).trim())) nova = { tipo: 'quantidade', pergunta_id: cond.pergunta_id, valor_numerico: Number(cond.valor) };
    if (!nova) { alert('Preencha a condição: escolha a resposta, o item ou a pergunta com o número inteiro.'); return; }
    if (condicoes.some(c => JSON.stringify(c) === JSON.stringify(nova))) { alert('Esta condição já está na regra.'); return; }
    setCondicoes(l => [...l, nova]);
    setCond(c => ({ ...c, opcao_id: '', item_id: '', pergunta_id: '', valor: '' }));
  };
  const adicionarSaida = () => {
    const q = Number(String(mat.quantidade).replace(',', '.'));
    if (!mat.material_item_id || !(q > 0)) { alert('Escolha o material e uma quantidade maior que zero.'); return; }
    setSaidas(l => [...l, { material_item_id: mat.material_item_id, quantidade: q, acao: mat.acao }]);
    setMat({ material_item_id: '', quantidade: '1', acao: 'adicionar' });
  };

  const salvar = async () => {
    if (ocupado) return;
    if (!veiculo.id) { alert('Escolha o veículo.'); return; }
    if (!condicoes.length) { alert('A regra precisa de pelo menos uma condição, senão valeria para toda OP deste veículo.'); return; }
    if (!saidas.length) { alert('A regra precisa de pelo menos um material (o chicote ou o suporte que ela escolhe).'); return; }
    const assinatura = (cs) => JSON.stringify(cs.map(c => `${c.tipo}:${c.opcao_id || c.item_id || c.pergunta_id}:${c.valor_numerico ?? ''}`).sort());
    if (regras.some(r => assinatura(r.condicoes) === assinatura(condicoes))
        && !await confirmar('Este veículo já tem uma regra com exatamente estas condições. Criar outra assim mesmo? O material das duas soma.')) return;
    setOcupado(true);
    try {
      const { data: nova, error } = await supabase.from('veiculo_regras')
        .insert([{ veiculo_id: veiculo.id, nome: nome.trim() || null, ordem: regras.length, criado_por_nome: currentUser?.nome || '—' }]).select('id').single();
      if (error || !nova?.id) { alert('Não foi possível criar a regra: ' + (error?.message || 'sem resposta do banco')); return; }
      const ec = await supabase.from('veiculo_regra_condicoes').insert(condicoes.map(c => ({ regra_id: nova.id, ...c })));
      const em = ec.error ? null : await supabase.from('veiculo_regra_materiais').insert(saidas.map((s, i) => ({ regra_id: nova.id, ...s, ordem: i })));
      const falhou = ec.error || em?.error;
      if (falhou) {
        // regra sem condição ou sem material é pior que nenhuma: desfaz só o que ESTA ação acabou de criar
        await supabase.from('veiculo_regras').delete().eq('id', nova.id);
        alert('Não foi possível gravar a regra: ' + falhou.message + '\n\nNada foi criado; tente de novo.');
        return;
      }
      setNome(''); setCondicoes([]); setSaidas([]);
      await recarregar();
    } finally { setOcupado(false); }
  };

  const apagar = async (r) => {
    if (!await confirmar(`Apagar a regra "${r.nome || 'sem nome'}" deste veículo?\n\nAs OPs já criadas não mudam; as próximas deixam de receber o material dela.`)) return;
    const { error } = await supabase.from('veiculo_regras').delete().eq('id', r.id);
    if (error) { alert('Não foi possível apagar a regra: ' + error.message); return; }
    recarregar();
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
    if (r.erro) alert(`Foram copiadas ${r.copiadas} de ${qtd} regra(s). Parou em: ${r.erro}`);
    recarregar();
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
        {falha && <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> {falha}</div>}

        <label className="acn-label">VEÍCULO</label>
        <SelectVeiculo valor={veiculo.id} onChange={(id, v) => setVeiculo({ id: id || '', nome: v ? (v.nome_exibicao || [v.marca, v.modelo].filter(Boolean).join(' ')) : '' })} currentUser={currentUser} />

        {veiculo.id && (
          <>
            <div className="acn-cet-sec espaco">REGRAS DESTE VEÍCULO ({regras.length})</div>
            {!regras.length && !falha && <div className="acn-ajuda">Nenhuma regra ainda: nenhum chicote ou suporte é escolhido por resposta neste veículo.</div>}
            {regras.map(r => (
              <div key={r.id} className="acn-cet-regra">
                <div className="acn-cet-regra-cab">
                  <b className="acn-cet-regra-nome">{r.nome || 'Regra sem nome'}</b>
                  {pode && <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a regra ${r.nome || 'sem nome'}`} onClick={() => apagar(r)} />}
                </div>
                <div className="acn-cet-regra-se"><b>SE</b> {r.condicoes.map(textoCondicao).join(' E ')}</div>
                {r.materiais.map(m => (
                  <div key={m.id} className="acn-cet-linha">
                    <span className={'acn-cet-acao' + (m.acao === 'remover' ? ' remover' : '')}>{m.acao === 'remover' ? '− tira' : '+ usa'} {m.quantidade}</span>
                    <span className="acn-cet-mat-nome">{m.material?.codigo ? <b>{m.material.codigo} — </b> : null}{m.material?.nome || '(item)'}</span>
                  </div>
                ))}
              </div>
            ))}

            {pode && (
              <>
                <div className="acn-cet-form">
                  <label className="acn-label"><Icone path={mdiPlus} size={13} /> NOVA REGRA NESTE VEÍCULO</label>
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

                  <div className="acn-cet-regra-salvar">
                    <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Gravando…' : 'Salvar regra'}</Botao>
                  </div>
                </div>

                <div className="acn-cet-copiar">
                  <label className="acn-label">COPIAR AS REGRAS DE OUTRO VEÍCULO PARA ESTE</label>
                  <SelectVeiculo valor="" onChange={(id, v) => { if (id) copiarDe(id, { nome: v ? (v.nome_exibicao || [v.marca, v.modelo].filter(Boolean).join(' ')) : '' }); }}
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
function PerguntasDoItem({ itemId, perguntas, itens, pode, currentUser, aoMudar, titulo = '', ajuda = '' }) {
  const daOp = !itemId;
  const nivelDe = (p, visto = 0) => {
    if (!p.opcao_pai_id || visto > 8) return 0;
    const pai = perguntas.find(x => (x.opcoes || []).some(o => o.id === p.opcao_pai_id));
    return pai ? nivelDe(pai, visto + 1) + 1 : 0;
  };
  const temFilha = (opcaoId) => perguntas.some(p => p.opcao_pai_id === opcaoId);

  // `tipo` 'quantidade' (etapa 2, 15/10/2026): quem responde digita um número em vez de escolher uma resposta cadastrada
  const addPergunta = async (opcaoPaiId = null, tipo = 'opcoes') => {
    const texto = await pedirTexto(opcaoPaiId
      ? 'Pergunta que só aparece depois desta resposta:'
      : tipo === 'quantidade' ? 'Qual quantidade o vendedor deve informar?\n\nEx.: "Quantos na frente?"'
      : daOp ? 'Qual pergunta o vendedor deve responder sobre a OP?\n\nEx.: "O veículo é caracterizado?"'
        : 'Qual pergunta o vendedor deve responder sobre o carro?\n\nEx.: "Tem hack de teto?"', '');
    if (!texto?.trim()) return;
    const { error } = await supabase.from('item_perguntas').insert([{
      item_id: itemId || null, opcao_pai_id: opcaoPaiId, texto: texto.trim(), ordem: perguntas.length,
      tipo, criado_por_nome: currentUser?.nome || '—',
    }]);
    if (error) { alert('Não foi possível criar: ' + error.message); return; }
    aoMudar();
  };
  const addOpcao = async (perguntaId, qtd) => {
    const rot = await pedirTexto('Resposta possível:\n\nEx.: "Tem, hack alto"', '');
    if (!rot?.trim()) return;
    await supabase.from('item_pergunta_opcoes').insert([{ pergunta_id: perguntaId, rotulo: rot.trim(), ordem: qtd }]);
    aoMudar();
  };
  const apagar = async (tabela, id, oque) => {
    if (!await confirmar(`Apagar ${oque}?`)) return;
    // etapa 3 (15/10/2026): se uma regra de chicote/suporte usa esta pergunta/resposta, o banco recusa de propósito (apagar mudaria o que a regra faz) — e a tela explica em vez de fingir que apagou
    const { error } = await supabase.from(tabela).delete().eq('id', id);
    if (error) {
      alert(error.code === '23503'
        ? 'Não dá para apagar: esta pergunta ou resposta é usada por uma regra de chicote/suporte de algum veículo. Apague a regra antes.'
        : 'Não foi possível apagar: ' + error.message);
      return;
    }
    aoMudar();
  };
  const definirRegra = async (opcao) => {
    const txt = await pedirTexto(
      'Esta resposta vale sozinha quando QUAIS itens estiverem na venda?\n\n'
      + 'Códigos separados por vírgula. Vazio apaga a regra.\n'
      + 'Caso real: parachoque de impulsão + slimled — os slimled prendem direto no parachoque,\n'
      + 'então o suporte deles sai da lista e ninguém precisa ser perguntado.', '');
    if (txt === null) return;
    const codigos = String(txt).split(',').map(s => s.trim()).filter(Boolean);
    let ids = [];
    if (codigos.length) {
      const { data } = await supabase.from('cadastro_itens').select('id,codigo').in('codigo', codigos);
      ids = (data || []).map(d => d.id);
      const faltando = codigos.filter(c => !(data || []).some(d => String(d.codigo) === c));
      if (faltando.length) { alert('Código não encontrado: ' + faltando.join(', ')); return; }
    }
    await supabase.from('item_pergunta_opcoes')
      .update({ auto_quando_itens: ids.length ? ids : null }).eq('id', opcao.id);
    aoMudar();
  };

  // Condição (etapa 2, 15/10/2026): a pergunta só aparece quando TODOS os itens listados estão na venda — "somente quando 1 ou mais itens são vendidos juntos"
  const definirCondicao = async (p) => {
    const atuais = (p.quando_itens || []).map(id => itens.find(i => i.id === id)?.codigo).filter(Boolean).join(', ');
    const txt = await pedirTexto(
      'Esta pergunta só aparece quando QUAIS itens estiverem juntos na venda?\n\n'
      + 'Códigos separados por vírgula; precisam estar TODOS na venda. Vazio apaga a condição.\n'
      + 'Ex.: pergunta de quantidade do slimled que só vale quando o parachoque de impulsão também foi vendido.', atuais);
    if (txt === null) return;
    const codigos = String(txt).split(',').map(s => s.trim()).filter(Boolean);
    let ids = [];
    if (codigos.length) {
      const { data, error: er } = await supabase.from('cadastro_itens').select('id,codigo').in('codigo', codigos);
      if (er) { alert('Não foi possível conferir os códigos: ' + er.message); return; }
      const faltando = codigos.filter(c => !(data || []).some(d => String(d.codigo) === c));
      if (faltando.length) { alert('Código não encontrado: ' + faltando.join(', ')); return; }
      ids = (data || []).map(d => d.id);
    }
    const { error } = await supabase.from('item_perguntas').update({ quando_itens: ids.length ? ids : null }).eq('id', p.id);
    if (error) { alert('Não foi possível gravar a condição: ' + error.message); return; }
    aoMudar();
  };
  const codigosDaCondicao = (p) => (p.quando_itens || []).map(id => itens.find(i => i.id === id)?.codigo || '?').join(', ');

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
      {perguntas.map(p => (
        <div key={p.id} className={'acn-cet-perg' + (p.opcao_pai_id ? ' filha' : '')} data-nivel={nivelDe(p)}>
          <div className="acn-cet-perg-cab">
            <span className="acn-cet-perg-txt">
              <Icone path={mdiHelpCircleOutline} size={14} /> {p.texto}
              {p.tipo === 'quantidade' && <Selo familia="info" ponto={false}>resposta numérica</Selo>}
              {(p.quando_itens || []).length > 0 && <Selo familia="atencao" ponto={false}>só com: {codigosDaCondicao(p)}</Selo>}
            </span>
            {pode && (
              <>
                <Botao pequeno variante="secundario" className="acn-cet-mini" onClick={() => definirCondicao(p)}>condição</Botao>
                {p.tipo !== 'quantidade' && (
                  <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini"
                    onClick={() => addOpcao(p.id, (p.opcoes || []).length)}>resposta</Botao>
                )}
                <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a pergunta "${p.texto}"`}
                  onClick={() => apagar('item_perguntas', p.id, `a pergunta "${p.texto}"`)} />
              </>
            )}
          </div>
          {p.tipo !== 'quantidade' && !(p.opcoes || []).length && (
            <div className="acn-cet-alerta"><Icone path={mdiAlertOutline} size={13} /> sem respostas — não faz nada ainda</div>
          )}
          {(p.opcoes || []).map(o => (
            <div key={o.id} className="acn-cet-opcao">
              <span className="acn-cet-opcao-txt">
                <Icone path={mdiChevronRight} size={13} /> {o.rotulo}
                {(o.auto_quando_itens || []).length > 0 && (
                  <Selo familia="atencao" ponto={false}>
                    automática ({o.auto_quando_itens.length})
                  </Selo>
                )}
              </span>
              {pode && (
                <>
                  <Botao pequeno variante="secundario" className="acn-cet-mini" onClick={() => definirRegra(o)}>regra</Botao>
                  {!temFilha(o.id) && (
                    <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini"
                      onClick={() => addPergunta(o.id)}>pergunta</Botao>
                  )}
                  <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a resposta "${o.rotulo}"`}
                    onClick={() => apagar('item_pergunta_opcoes', o.id, `a resposta "${o.rotulo}"`)} />
                </>
              )}
            </div>
          ))}
        </div>
      ))}
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
  const [novo, setNovo] = useState({ material_item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '' });

  const add = async () => {
    if (!novo.material_item_id) { alert('Escolha o material.'); return; }
    const { error } = await supabase.from('veiculo_item_materiais').insert([{
      veiculo_id: veiculoId, item_id: itemId,
      opcao_id: novo.opcao_id || null,
      material_item_id: novo.material_item_id,
      quantidade: Number(String(novo.quantidade).replace(',', '.')) || 1,
      acao: novo.acao, ordem: materiais.length,
      criado_por_nome: currentUser?.nome || '—',
    }]);
    if (error) { alert('Não foi possível adicionar: ' + error.message); return; }
    setNovo({ material_item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '' });
    aoMudar();
  };
  const apagar = async (id) => {
    if (!await confirmar('Apagar esta linha de material?')) return;
    await supabase.from('veiculo_item_materiais').delete().eq('id', id);
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
            <Botao pequeno variante="primario" onClick={add}>Adicionar</Botao>
          </div>
          <div className="acn-ajuda">
            "tira da lista" é para a regra que <b>desfaz</b>. Quantidade 0 tira o item inteiro.
          </div>
        </div>
      )}
    </div>
  );
}
