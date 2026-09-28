// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DA ESTRUTURA NA BOM DA ENGENHARIA
//
// A BOM da Engenharia é CONFERÊNCIA, não montagem (definido com o usuário em
// 28/09/2026). Ela mostra a lista completa — o que foi vendido mais o que é
// usado para instalar — e a Engenharia confere.
//
// E cobra o que falta: numa lista de 5 itens, se 4 já foram adaptados naquele
// carro e 1 não, só o item novo é cobrado. Cadastrou a composição dele para
// aquele modelo e ano, vira automático dali em diante. É assim que o sistema
// fica completo sozinho, um carro de cada vez.
//
// O INTERRUPTOR: nada é montado se o Conjunto Elétrico não estiver na venda.
// Cliente que traz suporte e chicote de terceiros não leva conjunto.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  perguntasDeVariosItens, perguntasPendentes, respostasAutomaticas,
  materiaisDoVeiculo, montarMaterial, itensSemEstrutura,
  itensConjunto, vendaTemConjunto,
} from './ConfigEstrutura';

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (v) => Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2).replace('.', ',');

/** O que vai faltar, se estas linhas forem separadas. Não reserva nada. */
export async function previsaoDeFalta(linhas) {
  const ids = (linhas || []).map(l => l.item_id).filter(Boolean);
  if (!ids.length) return [];
  const { data } = await supabase.from('vw_estoque_disponivel').select('*').in('item_id', ids);
  const porId = new Map((data || []).map(d => [d.item_id, d]));
  const falta = [];
  for (const l of linhas) {
    const e = porId.get(l.item_id);
    if (!e) continue;                                  // sem controle: fora da conta
    const disp = num(e.disponivel);
    if (num(l.quantidade) > disp) {
      falta.push({ nome: l.nome, codigo: l.codigo, precisa: num(l.quantidade),
        disponivel: disp, falta: num(l.quantidade) - disp });
    }
  }
  return falta;
}

export function PainelConferenciaEstrutura({ opl, onUsar, currentUser }) {
  const [estado, setEstado] = useState({ carregando: true });

  useEffect(() => {
    (async () => {
      const vendidos = opl?.itens_vendidos || [];
      const idsVendidos = vendidos.map(v => v.item_id).filter(Boolean);
      const conj = await itensConjunto();
      const temConjunto = vendaTemConjunto(vendidos, conj.map(c => c.id));

      if (!opl?.veiculo_id || !temConjunto) {
        setEstado({ carregando: false, temConjunto, semVeiculo: !opl?.veiculo_id, conj });
        return;
      }
      // o próprio conjunto não tem estrutura: ele é o recipiente
      const idsParaEstrutura = idsVendidos.filter(id => !conj.some(c => c.id === id));
      const [perguntas, materiais, semEstrutura] = await Promise.all([
        perguntasDeVariosItens(idsParaEstrutura),
        materiaisDoVeiculo(opl.veiculo_id, idsParaEstrutura),
        itensSemEstrutura(opl.veiculo_id, idsParaEstrutura),
      ]);
      const auto = respostasAutomaticas(perguntas, idsVendidos);

      // respostas que o vendedor já deu na abertura da OPL
      const { data: salvas } = await supabase.from('op_configuracao_respostas')
        .select('pergunta_id,opcao_id,automatica').eq('opl_id', opl.id);
      const respostas = { ...auto };
      (salvas || []).forEach(r => { respostas[r.pergunta_id] = r.opcao_id; });

      const qtdPorItem = {};
      vendidos.forEach(v => { if (v.item_id) qtdPorItem[v.item_id] = num(v.quantidade) || 1; });

      const linhas = montarMaterial(materiais, respostas, qtdPorItem);
      const falta = await previsaoDeFalta(linhas);
      const pendentes = perguntasPendentes(perguntas, respostas);
      const nomesSem = vendidos.filter(v => semEstrutura.includes(String(v.item_id)));

      setEstado({ carregando: false, temConjunto: true, conj, linhas, falta, pendentes,
        semEstrutura: nomesSem, respondidas: Object.keys(respostas).length });
    })();
  }, [opl?.id]);

  const e = estado;
  if (e.carregando) {
    return <Caixa cor="#eef2ff" borda="#c7d2fe" texto="#4338ca">Conferindo a configuração do veículo…</Caixa>;
  }

  // Sem conjunto elétrico na venda: a estrutura não se aplica, e isso é normal.
  if (!e.temConjunto) {
    return (
      <Caixa cor="#f8fafc" borda="#e2e8f0" texto="#475569">
        <b>Sem Conjunto de Instalação nesta venda.</b> O material de instalação não é montado —
        é o caso de quem usa suporte e chicote de terceiros. A BOM segue preenchida à mão.
      </Caixa>
    );
  }
  if (e.semVeiculo) {
    return (
      <Caixa cor="#fffbeb" borda="#fcd34d" texto="#92400e">
        Esta venda leva Conjunto de Instalação, mas a OP <b>não tem veículo do catálogo</b>.
        Sem saber o carro não dá para montar o material — escolha o veículo na OP.
      </Caixa>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {e.semEstrutura?.length > 0 && (
        <Caixa cor="#fef2f2" borda="#fecaca" texto="#7f1d1d">
          <b>⚠ {e.semEstrutura.length} item(ns) nunca foram adaptados neste carro.</b>
          <div style={{ marginTop: 3 }}>
            {e.semEstrutura.map(v => `• ${v.nome}`).join('  ')}
          </div>
          <div style={{ marginTop: 4, fontSize: 9.5 }}>
            O material deles não entra sozinho. Cadastre a composição em
            <b> Administração → Estruturas</b>, escolhendo o item e este veículo — a partir daí
            toda OP igual sai pronta.
          </div>
        </Caixa>
      )}

      {e.pendentes?.length > 0 && (
        <Caixa cor="#fffbeb" borda="#fcd34d" texto="#92400e">
          {e.pendentes.length} pergunta(s) sobre o carro sem resposta — normalmente respondidas
          pelo vendedor na abertura da OP. O material pode sair incompleto.
        </Caixa>
      )}

      {e.linhas?.length > 0 && (
        <Caixa cor="#f0fdf4" borda="#bbf7d0" texto="#166534">
          <b>Material de instalação calculado ({e.linhas.length}):</b>
          <div style={{ marginTop: 3 }}>
            {e.linhas.map(l => (
              <div key={l.item_id} style={{ fontSize: 10 }}>
                • {fmt(l.quantidade)} {l.unidade || 'UN'} — {l.codigo ? l.codigo + ' ' : ''}{l.nome}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => onUsar?.(e.linhas)}
            style={{ marginTop: 6, fontSize: 9.5, fontWeight: 700, padding: '3px 11px', border: 'none',
              borderRadius: 4, background: '#16a34a', color: '#fff', cursor: 'pointer' }}>
            ✓ Jogar na BOM
          </button>
        </Caixa>
      )}

      {e.falta?.length > 0 && (
        <Caixa cor="#fef2f2" borda="#fecaca" texto="#7f1d1d">
          <b>⚠ Vai faltar material:</b>
          {e.falta.map(f => (
            <div key={f.codigo + f.nome} style={{ fontSize: 10 }}>
              • {f.nome}: precisa de {fmt(f.precisa)}, disponível {fmt(f.disponivel)} — faltam {fmt(f.falta)}
            </div>
          ))}
          <div style={{ fontSize: 9, marginTop: 3 }}>
            Nada foi reservado nem pedido ainda — isso acontece quando o PCP liberar para o
            Almoxarifado. Mas agora já dá tempo de resolver.
          </div>
        </Caixa>
      )}
    </div>
  );
}

const Caixa = ({ cor, borda, texto, children }) => (
  <div style={{ background: cor, border: `1px solid ${borda}`, borderRadius: 6,
    padding: '7px 10px', fontSize: 10.5, color: texto, marginBottom: 6 }}>
    {children}
  </div>
);
