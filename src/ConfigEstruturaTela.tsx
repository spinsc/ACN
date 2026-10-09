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
import { perguntasDoItem, materiaisDoVeiculo, itensAtivosDoCatalogo } from './ConfigEstrutura';
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

export default function ConfigEstruturaTela({ currentUser }) {
  const [itemId, setItemId] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [perguntas, setPerguntas] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const itens = useItens();
  const pode = ehAdminOuGerente(currentUser) || String(currentUser?.perfil || '').trim() === 'PCP';
  const item = itens.find(i => i.id === itemId);

  const recPerguntas = async () => setPerguntas(itemId ? await perguntasDoItem(itemId) : []);
  const recMateriais = async () =>
    setMateriais(veiculoId && itemId ? await materiaisDoVeiculo(veiculoId, [itemId]) : []);
  useEffect(() => { recPerguntas(); recMateriais(); }, [itemId]);
  useEffect(() => { recMateriais(); }, [veiculoId]);

  // 12e54 (09/10/2026): só aparência — o roxo-azulado dos títulos virou o tom do guia, os botões miúdos viraram os botões do guia (pequenos) e o recuo das
  // perguntas filhas passou para [data-nivel] no design.css (antes era uma conta de margem escrita no JSX); o que cada botão grava não mudou
  return (
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

function PerguntasDoItem({ itemId, perguntas, itens, pode, currentUser, aoMudar }) {
  const nivelDe = (p, visto = 0) => {
    if (!p.opcao_pai_id || visto > 8) return 0;
    const pai = perguntas.find(x => (x.opcoes || []).some(o => o.id === p.opcao_pai_id));
    return pai ? nivelDe(pai, visto + 1) + 1 : 0;
  };
  const temFilha = (opcaoId) => perguntas.some(p => p.opcao_pai_id === opcaoId);

  const addPergunta = async (opcaoPaiId = null) => {
    const texto = await pedirTexto(opcaoPaiId
      ? 'Pergunta que só aparece depois desta resposta:'
      : 'Qual pergunta o vendedor deve responder sobre o carro?\n\nEx.: "Tem hack de teto?"', '');
    if (!texto?.trim()) return;
    const { error } = await supabase.from('item_perguntas').insert([{
      item_id: itemId, opcao_pai_id: opcaoPaiId, texto: texto.trim(), ordem: perguntas.length,
      criado_por_nome: currentUser?.nome || '—',
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
    await supabase.from(tabela).delete().eq('id', id);
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

  return (
    <div className="acn-cet-perguntas">
      <div className="acn-cet-sec">
        PERGUNTAS DESTE ITEM ({perguntas.length}) — valem em qualquer carro
      </div>
      {!perguntas.length && (
        <div className="acn-ajuda">
          Nenhuma. Se a instalação deste item não varia conforme o carro, não precisa de pergunta.
        </div>
      )}
      {perguntas.map(p => (
        <div key={p.id} className={'acn-cet-perg' + (p.opcao_pai_id ? ' filha' : '')} data-nivel={nivelDe(p)}>
          <div className="acn-cet-perg-cab">
            <span className="acn-cet-perg-txt"><Icone path={mdiHelpCircleOutline} size={14} /> {p.texto}</span>
            {pode && (
              <>
                <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini"
                  onClick={() => addOpcao(p.id, (p.opcoes || []).length)}>resposta</Botao>
                <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cet-x" aria-label={`Apagar a pergunta "${p.texto}"`}
                  onClick={() => apagar('item_perguntas', p.id, `a pergunta "${p.texto}"`)} />
              </>
            )}
          </div>
          {!(p.opcoes || []).length && (
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
        <Botao pequeno variante="secundario" icone={mdiPlus} className="acn-cet-mini acn-cet-nova" onClick={() => addPergunta(null)}>
          pergunta
        </Botao>
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
