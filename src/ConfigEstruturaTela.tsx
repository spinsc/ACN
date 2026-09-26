// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TELA DA ESTRUTURA DE CONFIGURAÇÃO — veículo × item vendido
//
// Onde se ensina ao sistema o que a adaptação consome. A regra e o cálculo
// moram em ConfigEstrutura.ts; aqui é só tela.
//
// As perguntas aparecem numa lista com recuo, não numa árvore desenhada: com
// dois ou três níveis a árvore visual custa mais para ler do que o recuo, e o
// que importa é ver de qual resposta cada pergunta pendura.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { confirmar, pedirTexto } from './Feedback';
import { SelectBusca } from './Interface';
import { combinaBusca } from './SearchUtils';
import { SelectVeiculo } from './VeiculoCadastro';
import { carregarArvorePorId, estruturasDoVeiculo } from './ConfigEstrutura';
import { ehAdminOuGerente } from './utils/permissoes';

const campo = { padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
                fontSize: 11, boxSizing: 'border-box', width: '100%' };
const rotulo = { fontSize: 9, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 3 };

/** Busca itens do cadastro por nome ou código, para os selects desta tela. */
function useItens() {
  const [itens, setItens] = useState([]);
  useEffect(() => {
    supabase.from('cadastro_itens').select('id,codigo,nome,unidade,controla_estoque')
      .eq('ativo', true).order('nome').limit(5000)
      .then(({ data }) => setItens(data || []));
  }, []);
  return itens;
}

const opcoesDeItem = (itens) => itens.map(i => ({
  valor: i.id, rotulo: `${i.codigo ? i.codigo + ' — ' : ''}${i.nome}`, busca: [i.codigo, i.nome],
}));

export default function ConfigEstruturaTela({ currentUser }) {
  const [veiculoId, setVeiculoId] = useState('');
  const [estruturas, setEstruturas] = useState([]);
  const [abertaId, setAbertaId] = useState('');
  const [arvore, setArvore] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [novoItemId, setNovoItemId] = useState('');
  const itens = useItens();
  const pode = ehAdminOuGerente(currentUser) || String(currentUser?.perfil || '').trim() === 'PCP';

  const recarregarLista = async (vid) => {
    if (!vid) { setEstruturas([]); return; }
    setEstruturas(await estruturasDoVeiculo(vid));
  };
  useEffect(() => { recarregarLista(veiculoId); setAbertaId(''); setArvore(null); }, [veiculoId]);

  const abrir = async (id) => {
    setAbertaId(id); setCarregando(true);
    setArvore(await carregarArvorePorId(id));
    setCarregando(false);
  };
  const recarregarArvore = async () => { if (abertaId) setArvore(await carregarArvorePorId(abertaId)); };

  const criarEstrutura = async () => {
    if (!veiculoId || !novoItemId) { alert('Escolha o veículo e o item vendido.'); return; }
    const { data, error } = await supabase.from('config_estruturas').insert([{
      veiculo_id: veiculoId, item_id: novoItemId,
      criado_por_nome: currentUser?.nome || currentUser?.email || '—',
    }]).select('id').single();
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? 'Este item já tem configuração para este veículo — abra a que existe.'
        : 'Não foi possível criar: ' + error.message);
      return;
    }
    setNovoItemId('');
    await recarregarLista(veiculoId);
    abrir(data.id);
  };

  const apagarEstrutura = async (e) => {
    if (!await confirmar(`Apagar a configuração de "${e.cadastro_itens?.nome}" para este veículo?\n\n`
      + 'As perguntas e o material dela somem junto. OPs que já usaram a configuração não mudam.')) return;
    await supabase.from('config_estruturas').delete().eq('id', e.id);
    if (abertaId === e.id) { setAbertaId(''); setArvore(null); }
    recarregarLista(veiculoId);
  };

  return (
    <div className="sec-card" style={{ marginTop: 12 }}>
      <div className="sec-hdr" style={{ background: '#eef2ff', borderBottom: '2px solid #4f46e5' }}>
        <span style={{ color: '#4338ca' }}>🧩 Estrutura de configuração — o que cada item consome em cada carro</span>
      </div>
      <div className="sec-body">
        <div style={{ fontSize: 10, color: '#3730a3', marginBottom: 8 }}>
          Configure uma vez por par <b>veículo × item vendido</b>. Vale para sempre: a próxima OP
          daquele carro com aquele item já sai com a lista de material montada.
        </div>

        <label style={rotulo}>VEÍCULO</label>
        <SelectVeiculo valor={veiculoId} onChange={setVeiculoId} currentUser={currentUser} />

        {veiculoId && (
          <>
            <div style={{ margin: '12px 0 6px', fontSize: 10, fontWeight: 800, color: '#334155' }}>
              ITENS JÁ CONFIGURADOS ({estruturas.length})
            </div>
            {!estruturas.length && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
                Nenhum ainda. Escolha um item vendido abaixo para começar.
              </div>
            )}
            {estruturas.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                borderTop: '1px solid #f1f5f9' }}>
                <span style={{ flex: 1, fontSize: 11, fontWeight: abertaId === e.id ? 800 : 400 }}>
                  {e.cadastro_itens?.codigo ? <b>{e.cadastro_itens.codigo} — </b> : null}
                  {e.cadastro_itens?.nome}
                </span>
                <button onClick={() => abrir(e.id)}
                  style={{ fontSize: 9, fontWeight: 700, padding: '2px 9px', border: '1px solid #4f46e5',
                    borderRadius: 4, background: abertaId === e.id ? '#e0e7ff' : '#fff', color: '#4338ca', cursor: 'pointer' }}>
                  {abertaId === e.id ? 'aberta' : 'abrir'}
                </button>
                {pode && (
                  <button onClick={() => apagarEstrutura(e)}
                    style={{ fontSize: 9, padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4,
                      background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>apagar</button>
                )}
              </div>
            ))}

            {pode && (
              <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '8px 10px' }}>
                <label style={rotulo}>＋ CONFIGURAR UM ITEM VENDIDO NESTE VEÍCULO</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SelectBusca opcoes={opcoesDeItem(itens)} valor={novoItemId} onChange={setNovoItemId}
                      placeholder="Procure o item vendido (nome ou código)" />
                  </div>
                  <button onClick={criarEstrutura}
                    style={{ fontSize: 9, fontWeight: 700, padding: '5px 12px', border: 'none', borderRadius: 4,
                      background: '#4f46e5', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Configurar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {carregando && <div style={{ fontSize: 10, color: '#4338ca', marginTop: 10 }}>Carregando…</div>}
        {arvore && !carregando && (
          <EditorArvore arvore={arvore} itens={itens} pode={pode} currentUser={currentUser}
            aoMudar={recarregarArvore} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EditorArvore({ arvore, itens, pode, currentUser, aoMudar }) {
  const [novoMaterial, setNovoMaterial] = useState({ item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '' });
  const estruturaId = arvore.estrutura.id;

  const perguntaPorOpcao = new Map();
  arvore.perguntas.forEach(p => { if (p.opcao_pai_id) perguntaPorOpcao.set(p.opcao_pai_id, p); });

  const nivelDe = (p, visto = 0) => {
    if (!p.opcao_pai_id || visto > 8) return 0;
    const pai = arvore.perguntas.find(x => (x.opcoes || []).some(o => o.id === p.opcao_pai_id));
    return pai ? nivelDe(pai, visto + 1) + 1 : 0;
  };

  const addPergunta = async (opcaoPaiId = null) => {
    const texto = await pedirTexto(opcaoPaiId
      ? 'Pergunta que só aparece depois desta resposta:'
      : 'Qual pergunta o sistema deve fazer?\n\nEx.: "Tem hack de teto?"', '');
    if (!texto?.trim()) return;
    const { error } = await supabase.from('config_perguntas').insert([{
      estrutura_id: estruturaId, opcao_pai_id: opcaoPaiId,
      texto: texto.trim(), ordem: arvore.perguntas.length,
    }]);
    if (error) { alert('Não foi possível criar a pergunta: ' + error.message); return; }
    aoMudar();
  };

  const addOpcao = async (perguntaId, qtdAtual) => {
    const rot = await pedirTexto('Resposta possível:\n\nEx.: "Sim, hack alto"', '');
    if (!rot?.trim()) return;
    const { error } = await supabase.from('config_opcoes')
      .insert([{ pergunta_id: perguntaId, rotulo: rot.trim(), ordem: qtdAtual }]);
    if (error) { alert('Não foi possível criar a resposta: ' + error.message); return; }
    aoMudar();
  };

  const apagar = async (tabela, id, oque) => {
    if (!await confirmar(`Apagar ${oque}?`)) return;
    await supabase.from(tabela).delete().eq('id', id);
    aoMudar();
  };

  const addMaterial = async () => {
    if (!novoMaterial.item_id) { alert('Escolha o item de material.'); return; }
    const { error } = await supabase.from('config_materiais').insert([{
      estrutura_id: estruturaId,
      opcao_id: novoMaterial.opcao_id || null,
      item_id: novoMaterial.item_id,
      quantidade: Number(String(novoMaterial.quantidade).replace(',', '.')) || 1,
      acao: novoMaterial.acao,
      ordem: arvore.materiais.length,
    }]);
    if (error) { alert('Não foi possível adicionar: ' + error.message); return; }
    setNovoMaterial({ item_id: '', quantidade: '1', acao: 'adicionar', opcao_id: '' });
    aoMudar();
  };

  const definirRegra = async (opcao) => {
    const atual = (opcao.auto_quando_itens || []).length;
    const txt = await pedirTexto(
      'Esta resposta vale sozinha quando QUAIS itens estiverem na venda?\n\n'
      + 'Informe os códigos separados por vírgula. Vazio apaga a regra.\n'
      + 'Ex.: parachoque frontal e traseiro → o suporte deixa de ser necessário.',
      '');
    if (txt === null) return;
    const codigos = String(txt).split(',').map(s => s.trim()).filter(Boolean);
    let ids = [];
    if (codigos.length) {
      const { data } = await supabase.from('cadastro_itens').select('id,codigo').in('codigo', codigos);
      ids = (data || []).map(d => d.id);
      const achados = (data || []).map(d => String(d.codigo));
      const faltando = codigos.filter(c => !achados.includes(c));
      if (faltando.length) { alert('Código não encontrado no cadastro: ' + faltando.join(', ')); return; }
    }
    await supabase.from('config_opcoes')
      .update({ auto_quando_itens: ids.length ? ids : null }).eq('id', opcao.id);
    alert(ids.length
      ? `Regra gravada: esta resposta vale sozinha quando os ${ids.length} item(ns) estiverem na venda.`
      : (atual ? 'Regra apagada — a pergunta volta a ser feita.' : 'Nenhuma regra definida.'));
    aoMudar();
  };

  const materiaisDe = (opcaoId) => arvore.materiais.filter(m => (m.opcao_id || null) === (opcaoId || null));

  const LinhaMaterial = ({ m }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, padding: '2px 0' }}>
      <span style={{ fontWeight: 800, color: m.acao === 'remover' ? '#b91c1c' : '#0f766e', minWidth: 58 }}>
        {m.acao === 'remover' ? '− tira' : '+ usa'} {m.quantidade}
      </span>
      <span style={{ flex: 1 }}>
        {m.cadastro_itens?.codigo ? <b>{m.cadastro_itens.codigo} — </b> : null}
        {m.cadastro_itens?.nome || '(item)'}
        {m.cadastro_itens?.controla_estoque && (
          <span style={{ fontSize: 8, background: '#dcfce7', color: '#15803d', borderRadius: 3,
            padding: '0 4px', marginLeft: 5, fontWeight: 800 }}>estoque</span>
        )}
      </span>
      {pode && (
        <button onClick={() => apagar('config_materiais', m.id, 'esta linha de material')}
          style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 12, border: '1px solid #c7d2fe', borderRadius: 7, padding: 10, background: '#fafaff' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#3730a3', marginBottom: 6 }}>
        MATERIAL FIXO — entra sempre, independente das respostas
      </div>
      {materiaisDe(null).length === 0 && (
        <div style={{ fontSize: 10, color: '#94a3b8' }}>Nenhum material fixo ainda.</div>
      )}
      {materiaisDe(null).map(m => <LinhaMaterial key={m.id} m={m} />)}

      <div style={{ fontSize: 10, fontWeight: 800, color: '#3730a3', margin: '12px 0 6px' }}>
        PERGUNTAS ({arvore.perguntas.length})
      </div>
      {arvore.perguntas.length === 0 && (
        <div style={{ fontSize: 10, color: '#94a3b8' }}>
          Nenhuma. Se a adaptação não varia neste carro, o material fixo acima já basta.
        </div>
      )}
      {arvore.perguntas.map(p => (
        <div key={p.id} style={{ marginLeft: nivelDe(p) * 16, borderLeft: p.opcao_pai_id ? '2px solid #e0e7ff' : 'none',
          paddingLeft: p.opcao_pai_id ? 8 : 0, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>❓ {p.texto}</span>
            {pode && (
              <>
                <button onClick={() => addOpcao(p.id, (p.opcoes || []).length)}
                  style={{ fontSize: 9, padding: '1px 7px', border: '1px solid #4f46e5', borderRadius: 4,
                    background: '#fff', color: '#4338ca', cursor: 'pointer' }}>+ resposta</button>
                <button onClick={() => apagar('config_perguntas', p.id, `a pergunta "${p.texto}"`)}
                  style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>
              </>
            )}
          </div>
          {(p.opcoes || []).length === 0 && (
            <div style={{ fontSize: 9.5, color: '#f59e0b', marginLeft: 14 }}>
              ⚠ sem respostas — esta pergunta não faz nada ainda
            </div>
          )}
          {(p.opcoes || []).map(o => (
            <div key={o.id} style={{ marginLeft: 14, marginTop: 3, paddingLeft: 8, borderLeft: '2px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10.5, flex: 1 }}>
                  ▸ {o.rotulo}
                  {(o.auto_quando_itens || []).length > 0 && (
                    <span style={{ fontSize: 8, background: '#fef3c7', color: '#b45309', borderRadius: 3,
                      padding: '0 4px', marginLeft: 5, fontWeight: 800 }}>
                      automática ({o.auto_quando_itens.length} itens)
                    </span>
                  )}
                </span>
                {pode && (
                  <>
                    <button onClick={() => definirRegra(o)}
                      style={{ fontSize: 8.5, padding: '1px 6px', border: '1px solid #fcd34d', borderRadius: 4,
                        background: '#fff', color: '#b45309', cursor: 'pointer' }}>regra</button>
                    {!perguntaPorOpcao.get(o.id) && (
                      <button onClick={() => addPergunta(o.id)}
                        style={{ fontSize: 8.5, padding: '1px 6px', border: '1px solid #c7d2fe', borderRadius: 4,
                          background: '#fff', color: '#4338ca', cursor: 'pointer' }}>+ pergunta</button>
                    )}
                    <button onClick={() => apagar('config_opcoes', o.id, `a resposta "${o.rotulo}"`)}
                      style={{ fontSize: 9, border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}>✕</button>
                  </>
                )}
              </div>
              {materiaisDe(o.id).map(m => (
                <div key={m.id} style={{ marginLeft: 10 }}><LinhaMaterial m={m} /></div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {pode && (
        <button onClick={() => addPergunta(null)}
          style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', border: '1px solid #4f46e5',
            borderRadius: 4, background: '#fff', color: '#4338ca', cursor: 'pointer', marginTop: 4 }}>
          + pergunta
        </button>
      )}

      {pode && (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px' }}>
          <label style={rotulo}>＋ ADICIONAR MATERIAL</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 70px 110px minmax(0,1.4fr) auto', gap: 6, alignItems: 'center' }}>
            <SelectBusca opcoes={opcoesDeItem(itens)} valor={novoMaterial.item_id}
              onChange={v => setNovoMaterial(f => ({ ...f, item_id: v }))} placeholder="Item de material" />
            <input style={campo} inputMode="decimal" value={novoMaterial.quantidade}
              onChange={e => setNovoMaterial(f => ({ ...f, quantidade: e.target.value }))} placeholder="Qtd" />
            <select style={campo} value={novoMaterial.acao}
              onChange={e => setNovoMaterial(f => ({ ...f, acao: e.target.value }))}>
              <option value="adicionar">usa</option>
              <option value="remover">tira da lista</option>
            </select>
            <select style={campo} value={novoMaterial.opcao_id}
              onChange={e => setNovoMaterial(f => ({ ...f, opcao_id: e.target.value }))}>
              <option value="">sempre (material fixo)</option>
              {arvore.perguntas.flatMap(p => (p.opcoes || []).map(o => (
                <option key={o.id} value={o.id}>{p.texto} → {o.rotulo}</option>
              )))}
            </select>
            <button onClick={addMaterial}
              style={{ fontSize: 9, fontWeight: 700, padding: '5px 12px', border: 'none', borderRadius: 4,
                background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>Adicionar</button>
          </div>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
            "tira da lista" serve para a regra que <b>desfaz</b>: parachoque de impulsão frontal e traseiro
            dispensa o suporte. Deixe a quantidade em 0 para tirar o item inteiro.
          </div>
        </div>
      )}
    </div>
  );
}
