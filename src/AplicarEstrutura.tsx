// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// APLICAR A CONFIGURAÇÃO DO VEÍCULO NA BOM DA OP
//
// Junta duas coisas que já existiam separadas:
//
//   sugerirBom (OpItens.ts)  — o que os itens vendidos são. Já explode KIT nos
//                              itens individuais desde antes: venda de kit e
//                              venda avulsa caem na mesma lista.
//   a árvore (Etapa 6)       — o que a INSTALAÇÃO daquele item NAQUELE carro
//                              consome: suportes, chicote, cabo.
//
// O que esta tela faz: pergunta o que a árvore precisa saber, resolve sozinha o
// que der pela combinação de itens vendidos, monta a lista e entrega para a BOM.
//
// Não grava nada na OP por conta própria — devolve as linhas para quem chamou
// (hoje o editor de BOM da Engenharia), que segue sendo quem revisa e libera.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  carregarArvore, perguntasPendentes, respostasAutomaticas,
  materialDaConfiguracao, juntarMateriais,
} from './ConfigEstrutura';

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (v) => Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2).replace('.', ',');

/**
 * Carrega a árvore de cada item vendido que tenha configuração para este
 * veículo. Item sem árvore não é erro — é só um item que ninguém configurou
 * ainda, e a tela avisa em vez de travar.
 */
export async function arvoresDaOp({ veiculoId, vendidos }) {
  if (!veiculoId) return { arvores: [], semConfig: [] };
  const arvores = [], semConfig = [];
  for (const v of vendidos || []) {
    if (!v?.item_id) continue;
    const a = await carregarArvore(veiculoId, v.item_id);
    if (a) arvores.push({ vendido: v, arvore: a });
    else semConfig.push(v);
  }
  return { arvores, semConfig };
}

/** O que vai faltar, se estas linhas forem separadas. Não reserva nada. */
export async function previsaoDeFalta(linhas) {
  const ids = (linhas || []).map(l => l.item_id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase.from('vw_estoque_disponivel').select('*').in('item_id', ids);
  const porId = new Map((data || []).map(d => [d.item_id, d]));
  const falta = [];
  for (const l of linhas) {
    const e = porId.get(l.item_id);
    if (!e) continue;                              // item sem controle: não entra na conta
    const disp = num(e.disponivel);
    if (num(l.quantidade) > disp) {
      falta.push({ nome: l.nome, codigo: l.codigo, unidade: l.unidade,
        precisa: num(l.quantidade), disponivel: disp, falta: num(l.quantidade) - disp });
    }
  }
  return falta;
}

export function ModalAplicarEstrutura({ opl, onAplicar, onFechar, currentUser }) {
  const [carregando, setCarregando] = useState(true);
  const [arvores, setArvores] = useState([]);
  const [semConfig, setSemConfig] = useState([]);
  const [respostas, setRespostas] = useState({});     // pergunta_id -> opcao_id
  const [automaticas, setAutomaticas] = useState({}); // as que o sistema resolveu
  const [falta, setFalta] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const vendidos = opl?.itens_vendidos || [];
  const idsVendidos = vendidos.map(v => v.item_id).filter(Boolean);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const { arvores: a, semConfig: s } = await arvoresDaOp({ veiculoId: opl?.veiculo_id, vendidos });
      // o que a venda já responde sozinha, sem perguntar
      const auto = {};
      a.forEach(({ arvore }) => Object.assign(auto, respostasAutomaticas(arvore, idsVendidos)));
      setArvores(a); setSemConfig(s); setAutomaticas(auto); setRespostas(auto);
      setCarregando(false);
    })();
  }, [opl?.id]);

  // recalcula o material e a previsão a cada resposta
  const linhas = juntarMateriais(arvores.map(({ vendido, arvore }) =>
    materialDaConfiguracao(arvore, respostas, num(vendido.quantidade) || 1)));

  useEffect(() => { previsaoDeFalta(linhas).then(setFalta); }, [JSON.stringify(linhas)]);

  const pendentes = arvores.flatMap(({ vendido, arvore }) =>
    perguntasPendentes(arvore, respostas).map(p => ({ ...p, de: vendido.nome, estrutura_id: arvore.estrutura.id })));

  const responder = (perguntaId, opcaoId) => setRespostas(r => ({ ...r, [perguntaId]: opcaoId }));

  const aplicar = async () => {
    setSalvando(true);
    // guarda as respostas desta OP: é o que permite refazer a conta depois e
    // sugerir o mesmo para o próximo carro igual
    const registros = [];
    for (const { arvore } of arvores) {
      for (const p of arvore.perguntas) {
        const opcaoId = respostas[p.id];
        if (!opcaoId) continue;
        registros.push({ opl_id: opl.id, estrutura_id: arvore.estrutura.id, pergunta_id: p.id,
          opcao_id: opcaoId, automatica: !!automaticas[p.id],
          respondido_por: currentUser?.nome || currentUser?.email || '—' });
      }
    }
    if (registros.length) {
      await supabase.from('op_configuracao_respostas')
        .upsert(registros, { onConflict: 'opl_id,pergunta_id' });
    }
    setSalvando(false);
    onAplicar?.(linhas);
  };

  const cx = { padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, width: '100%' };

  return (
    <div className="modal-overlay" onClick={() => !salvando && onFechar?.()}>
      <div className="modal-box" style={{ maxWidth: 620, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title">🧩 Configuração do veículo — OP {opl?.opl}</div>

        {carregando && <div style={{ fontSize: 11, color: '#4338ca', marginTop: 10 }}>Carregando a configuração…</div>}

        {!carregando && !opl?.veiculo_id && (
          <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
            padding: 10, fontSize: 11, color: '#92400e' }}>
            Esta OP não tem veículo do catálogo. Sem saber qual carro é, não dá para saber o que a
            adaptação consome — escolha o veículo na OP e volte aqui.
          </div>
        )}

        {!carregando && opl?.veiculo_id && !arvores.length && (
          <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
            padding: 10, fontSize: 11, color: '#92400e' }}>
            Nenhum item vendido desta OP tem configuração para este veículo ainda.
            Configure em <b>Administração → Estruturas</b> e a próxima OP igual já sai pronta.
          </div>
        )}

        {!carregando && pendentes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#334155', marginBottom: 6 }}>
              RESPONDA SOBRE ESTE CARRO ({pendentes.length})
            </div>
            {pendentes.map(p => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {p.texto}
                  <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                    (de {p.de})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                  {(p.opcoes || []).map(o => (
                    <button key={o.id} type="button" onClick={() => responder(p.id, o.id)}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                        border: '1px solid ' + (respostas[p.id] === o.id ? '#4f46e5' : '#cbd5e1'),
                        background: respostas[p.id] === o.id ? '#e0e7ff' : '#fff',
                        color: respostas[p.id] === o.id ? '#4338ca' : '#475569' }}>
                      {o.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!carregando && Object.keys(automaticas).length > 0 && (
          <div style={{ marginTop: 10, fontSize: 10, color: '#15803d', background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 9px' }}>
            ✓ {Object.keys(automaticas).length} pergunta(s) o sistema respondeu sozinho, pelos itens
            que já estão na venda — não precisa perguntar.
          </div>
        )}

        {!carregando && semConfig.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 10, color: '#b45309' }}>
            Sem configuração para este veículo: {semConfig.map(v => v.nome).join(', ')}.
            Esses continuam sendo lançados à mão na BOM.
          </div>
        )}

        {!carregando && linhas.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
              MATERIAL QUE A CONFIGURAÇÃO GEROU ({linhas.length})
            </div>
            {linhas.map(l => (
              <div key={l.item_id} style={{ display: 'flex', gap: 8, fontSize: 10.5, padding: '2px 0',
                borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontWeight: 800, minWidth: 54 }}>{fmt(l.quantidade)} {l.unidade || 'UN'}</span>
                <span style={{ flex: 1 }}>{l.codigo ? <b>{l.codigo} — </b> : null}{l.nome}</span>
              </div>
            ))}
          </div>
        )}

        {!carregando && falta.length > 0 && (
          <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#b91c1c', marginBottom: 3 }}>
              ⚠ VAI FALTAR — {falta.length} item(ns)
            </div>
            {falta.map(f => (
              <div key={f.codigo + f.nome} style={{ fontSize: 10, color: '#7f1d1d' }}>
                • {f.nome}: precisa de {fmt(f.precisa)}, disponível {fmt(f.disponivel)} — faltam {fmt(f.falta)}
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#b91c1c', marginTop: 4 }}>
              Isto é só um aviso: nada foi reservado nem pedido ainda. A reserva e o pedido nascem
              quando o PCP liberar a OP para o Almoxarifado — mas agora já dá tempo de resolver.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={aplicar} disabled={salvando || carregando || !linhas.length}
            style={{ background: linhas.length ? '#4f46e5' : '#cbd5e1', color: '#fff', border: 'none',
              borderRadius: 4, padding: '6px 14px', fontWeight: 700, fontSize: 11,
              cursor: linhas.length ? 'pointer' : 'not-allowed' }}>
            {salvando ? '...' : '✓ Jogar na BOM'}
          </button>
          <button onClick={onFechar} disabled={salvando}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4,
              background: '#fff', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
          {pendentes.length > 0 && (
            <span style={{ alignSelf: 'center', fontSize: 9.5, color: '#b45309' }}>
              {pendentes.length} pergunta(s) sem resposta — o material pode sair incompleto.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
