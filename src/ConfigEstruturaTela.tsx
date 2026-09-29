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
import { SelectBusca } from './Interface';
import { SelectVeiculo } from './VeiculoCadastro';
import { perguntasDoItem, materiaisDoVeiculo, itensAtivosDoCatalogo } from './ConfigEstrutura';
import { ehAdminOuGerente } from './utils/permissoes';

const campo = { padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
                fontSize: 11, boxSizing: 'border-box', width: '100%' };
const rotulo = { fontSize: 9, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 3 };

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

  return (
    <div className="sec-card" style={{ marginTop: 12 }}>
      <div className="sec-hdr" style={{ background: '#eef2ff', borderBottom: '2px solid #4f46e5' }}>
        <span style={{ color: '#4338ca' }}>🧩 Estrutura de instalação</span>
      </div>
      <div className="sec-body">
        <div style={{ fontSize: 10, color: '#3730a3', marginBottom: 8 }}>
          A <b>pergunta</b> fica no item e vale em qualquer carro. O <b>material</b> que cada resposta
          consome fica no carro. Assim "tem hack de teto?" é cadastrada uma vez só, e cada veículo
          diz qual suporte usa.
        </div>

        <label style={rotulo}>ITEM VENDIDO</label>
        <SelectBusca opcoes={opcoesDeItem(itens)} valor={itemId} onChange={setItemId}
          placeholder="Procure o item (nome ou código)" />

        {item && (
          <>
            <MarcaConjunto item={item} pode={pode} />
            <PerguntasDoItem itemId={itemId} perguntas={perguntas} itens={itens}
              pode={pode} currentUser={currentUser} aoMudar={recPerguntas} />

            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '2px solid #e0e7ff' }}>
              <label style={rotulo}>MATERIAL DESTE ITEM EM QUAL CARRO</label>
              <SelectVeiculo valor={veiculoId} onChange={setVeiculoId} currentUser={currentUser} />
              {veiculoId && (
                <MaterialNoVeiculo veiculoId={veiculoId} itemId={itemId} materiais={materiais}
                  perguntas={perguntas} itens={itens} pode={pode} currentUser={currentUser}
                  aoMudar={recMateriais} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** O interruptor: marcar o item que representa o material de instalação. */
function MarcaConjunto({ item, pode }) {
  const [marcado, setMarcado] = useState(!!item.eh_conjunto_instalacao);
  useEffect(() => { setMarcado(!!item.eh_conjunto_instalacao); }, [item.id]);
  const trocar = async (v) => {
    setMarcado(v);
    await supabase.from('cadastro_itens').update({ eh_conjunto_instalacao: v }).eq('id', item.id);
  };
  return (
    <div style={{ marginTop: 8, background: marcado ? '#fffbeb' : '#f8fafc',
      border: `1px solid ${marcado ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 6, padding: '7px 10px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, cursor: pode ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={marcado} disabled={!pode}
          onChange={e => trocar(e.target.checked)} style={{ accentColor: '#d97706' }} />
        <span><b>Este item é o Conjunto Elétrico</b></span>
      </label>
      <div style={{ fontSize: 9, color: '#78350f', marginTop: 3 }}>
        É o item que representa suportes, chicotes, parafusos e afins na nota e no PV. A presença
        dele na venda é o que <b>liga</b> a montagem automática do material. Venda sem conjunto —
        cliente que usa peça de terceiro — não monta nada.
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
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#3730a3', marginBottom: 5 }}>
        PERGUNTAS DESTE ITEM ({perguntas.length}) — valem em qualquer carro
      </div>
      {!perguntas.length && (
        <div style={{ fontSize: 10, color: '#94a3b8' }}>
          Nenhuma. Se a instalação deste item não varia conforme o carro, não precisa de pergunta.
        </div>
      )}
      {perguntas.map(p => (
        <div key={p.id} style={{ marginLeft: nivelDe(p) * 16, borderLeft: p.opcao_pai_id ? '2px solid #e0e7ff' : 'none',
          paddingLeft: p.opcao_pai_id ? 8 : 0, marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>❓ {p.texto}</span>
            {pode && (
              <>
                <button onClick={() => addOpcao(p.id, (p.opcoes || []).length)}
                  style={{ fontSize: 9, padding: '1px 7px', border: '1px solid #4f46e5', borderRadius: 4,
                    background: '#fff', color: '#4338ca', cursor: 'pointer' }}>+ resposta</button>
                <button onClick={() => apagar('item_perguntas', p.id, `a pergunta "${p.texto}"`)}
                  style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>
              </>
            )}
          </div>
          {!(p.opcoes || []).length && (
            <div style={{ fontSize: 9.5, color: '#f59e0b', marginLeft: 14 }}>⚠ sem respostas — não faz nada ainda</div>
          )}
          {(p.opcoes || []).map(o => (
            <div key={o.id} style={{ marginLeft: 14, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, flex: 1 }}>
                ▸ {o.rotulo}
                {(o.auto_quando_itens || []).length > 0 && (
                  <span style={{ fontSize: 8, background: '#fef3c7', color: '#b45309', borderRadius: 3,
                    padding: '0 4px', marginLeft: 5, fontWeight: 800 }}>
                    automática ({o.auto_quando_itens.length})
                  </span>
                )}
              </span>
              {pode && (
                <>
                  <button onClick={() => definirRegra(o)}
                    style={{ fontSize: 8.5, padding: '1px 6px', border: '1px solid #fcd34d', borderRadius: 4,
                      background: '#fff', color: '#b45309', cursor: 'pointer' }}>regra</button>
                  {!temFilha(o.id) && (
                    <button onClick={() => addPergunta(o.id)}
                      style={{ fontSize: 8.5, padding: '1px 6px', border: '1px solid #c7d2fe', borderRadius: 4,
                        background: '#fff', color: '#4338ca', cursor: 'pointer' }}>+ pergunta</button>
                  )}
                  <button onClick={() => apagar('item_pergunta_opcoes', o.id, `a resposta "${o.rotulo}"`)}
                    style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      {pode && (
        <button onClick={() => addPergunta(null)}
          style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', border: '1px solid #4f46e5',
            borderRadius: 4, background: '#fff', color: '#4338ca', cursor: 'pointer', marginTop: 3 }}>
          + pergunta
        </button>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, padding: '2px 0' }}>
      <span style={{ fontWeight: 800, color: m.acao === 'remover' ? '#b91c1c' : '#0f766e', minWidth: 60 }}>
        {m.acao === 'remover' ? '− tira' : '+ usa'} {m.quantidade}
      </span>
      <span style={{ flex: 1 }}>
        {m.material?.codigo ? <b>{m.material.codigo} — </b> : null}{m.material?.nome || '(item)'}
        {m.material?.controla_estoque && (
          <span style={{ fontSize: 8, background: '#dcfce7', color: '#15803d', borderRadius: 3,
            padding: '0 4px', marginLeft: 5, fontWeight: 800 }}>estoque</span>
        )}
      </span>
      {pode && <button onClick={() => apagar(m.id)}
        style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>}
    </div>
  );

  return (
    <div style={{ marginTop: 10, border: '1px solid #c7d2fe', borderRadius: 7, padding: 10, background: '#fafaff' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#3730a3', marginBottom: 4 }}>
        SEMPRE, NESTE CARRO ({fixos.length})
      </div>
      {!fixos.length && <div style={{ fontSize: 10, color: '#94a3b8' }}>Nenhum material fixo.</div>}
      {fixos.map(m => <Linha key={m.id} m={m} />)}

      {porResposta.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#3730a3', margin: '10px 0 4px' }}>
            CONFORME A RESPOSTA ({porResposta.length})
          </div>
          {porResposta.map(m => (
            <div key={m.id}>
              <div style={{ fontSize: 9, color: '#6366f1', marginTop: 3 }}>{rotuloDaOpcao(m.opcao_id)}</div>
              <div style={{ marginLeft: 10 }}><Linha m={m} /></div>
            </div>
          ))}
        </>
      )}

      {pode && (
        <div style={{ marginTop: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px' }}>
          <label style={rotulo}>＋ MATERIAL QUE ESTE ITEM CONSOME NESTE CARRO</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 70px 110px minmax(0,1.6fr) auto', gap: 6, alignItems: 'center' }}>
            <SelectBusca opcoes={opcoesDeItem(itens)} valor={novo.material_item_id}
              onChange={v => setNovo(f => ({ ...f, material_item_id: v }))} placeholder="Material" />
            <input style={campo} inputMode="decimal" value={novo.quantidade}
              onChange={e => setNovo(f => ({ ...f, quantidade: e.target.value }))} placeholder="Qtd" />
            <select style={campo} value={novo.acao} onChange={e => setNovo(f => ({ ...f, acao: e.target.value }))}>
              <option value="adicionar">usa</option>
              <option value="remover">tira da lista</option>
            </select>
            <select style={campo} value={novo.opcao_id} onChange={e => setNovo(f => ({ ...f, opcao_id: e.target.value }))}>
              <option value="">sempre, neste carro</option>
              {perguntas.flatMap(p => (p.opcoes || []).map(o => (
                <option key={o.id} value={o.id}>{p.texto} → {o.rotulo}</option>
              )))}
            </select>
            <button onClick={add}
              style={{ fontSize: 9, fontWeight: 700, padding: '5px 12px', border: 'none', borderRadius: 4,
                background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>Adicionar</button>
          </div>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
            "tira da lista" é para a regra que <b>desfaz</b>. Quantidade 0 tira o item inteiro.
          </div>
        </div>
      )}
    </div>
  );
}
