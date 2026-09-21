// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PINTURA DA SERRALHERIA — do pedido da peça até o serviço de terceiro
//
// Regra definida com o usuário em 21/09/2026:
//   • toda demanda de Serralheria — tanto a peça de fabricação interna
//     (suporte para a adaptação) quanto a carretinha — pergunta se vai pintura;
//   • o TIPO é texto livre, escrito por quem abre a demanda, porque é o que o
//     comprador precisa ler para cotar: "eletrostática", "epóxi", "precisa de
//     jato de areia antes" e por aí vai;
//   • quem abre preenche e a Serralheria não mexe — ela executa o que foi
//     pedido;
//   • o pedido ao Compras nasce QUANDO A SERRALHERIA CONCLUI a demanda: a peça
//     já existe, é ela que vai para o pintor. Antes disso não há o que enviar.
//
// A pintura é da demanda inteira, não de cada peça: sai um pedido de pintura
// por demanda, com a lista de peças dentro.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { supabase } from './supabaseClient';
import { itensPreenchidos, vinculosDaDemanda } from './DemandaItens';
import { criarRequisicaoCompra } from './ComprasFluxo';
import { notificarEvento } from './whatsappHelper';

export const ehSerralheria = (setor: any) =>
  String(setor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'serralheria';

/** Campos de pintura no formulário da demanda (só aparece para Serralheria) */
export function PinturaCampos({ valor, onChange, somenteLeitura = false }) {
  const tem = !!valor?.pintura;
  return (
    <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: somenteLeitura ? 'default' : 'pointer' }}>
        <input type="checkbox" checked={tem} disabled={somenteLeitura}
          onChange={e => onChange({ pintura: e.target.checked, pintura_tipo: e.target.checked ? (valor?.pintura_tipo || '') : '' })} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#9a3412' }}>🎨 Esta peça vai precisar de pintura</span>
      </label>
      {tem && (
        <div style={{ marginTop: 7 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', marginBottom: 3 }}>
            Tipo da pintura — o comprador vai ler isto para cotar
          </div>
          <textarea rows={2} disabled={somenteLeitura} value={valor?.pintura_tipo || ''}
            onChange={e => onChange({ pintura: true, pintura_tipo: e.target.value })}
            placeholder="ex.: pintura eletrostática preta; precisa de jato de areia antes"
            style={{ width: '100%', padding: '5px 8px', border: '1px solid #fdba74', borderRadius: 4,
              fontSize: 11, resize: 'vertical', boxSizing: 'border-box', background: somenteLeitura ? '#fff' : undefined }} />
          <div style={{ fontSize: 9, color: '#c2410c', marginTop: 3 }}>
            O pedido ao Compras nasce sozinho quando a Serralheria concluir esta demanda.
          </div>
        </div>
      )}
    </div>
  );
}

/** Selo curto para listas e detalhe */
export function PinturaSelo({ d }) {
  if (!d?.pintura) return null;
  const feito = !!d.pintura_pedido_id;
  return (
    <span title={d.pintura_tipo || 'Pintura'}
      style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
        background: feito ? '#dcfce7' : '#ffedd5', color: feito ? '#15803d' : '#9a3412',
        border: `1px solid ${feito ? '#86efac' : '#fdba74'}` }}>
      🎨 {feito ? 'pintura no Compras' : 'com pintura'}
    </span>
  );
}

/**
 * Abre o pedido de pintura para o Compras. Chamado quando a Serralheria
 * conclui a demanda. Não faz nada se não tem pintura ou se o pedido já existe
 * (concluir de novo não abre outro).
 */
export async function abrirPedidoPintura(d: any, currentUser: any) {
  if (!d?.pintura || d.pintura_pedido_id) return null;
  const agora = new Date().toISOString();
  const pecas = itensPreenchidos(d.itens || []);
  const vinculos = vinculosDaDemanda(d);

  // Entra no quadro do Compras como qualquer outra requisição — cotação,
  // aprovação e OC do mesmo jeito (unificação de 21/09/2026).
  const pedido = await criarRequisicaoCompra({
    titulo: `Pintura — ${d.titulo}`,
    descricao: [
      'Serviço de terceiro: PINTURA de peça fabricada na Serralheria.',
      `Tipo pedido: ${String(d.pintura_tipo || '').trim() || '(não informado)'}`,
      'A peça está pronta na Serralheria.',
    ].join('\n'),
    itens: pecas.map((i: any) => ({ nome: i.nome, quantidade: i.quantidade, descricao: i.descricao || '' })),
    prioridade: d.prioridade || 'Média',
    vinculo: vinculos[0] || null,
    origemSetor: 'Serralheria — pintura',
    demandaAvulsaId: d.id,
    currentUser,
  });

  if (pedido.erro) return { erro: pedido.erro };

  const info = [...(d.informacoes || []), {
    texto: `Serralheria concluída com pintura pedida (${String(d.pintura_tipo || '').trim() || 'tipo não informado'}). Requisição ${pedido.numero_pedido} aberta para o Compras cotar.`,
    usuario: currentUser?.nome || '', data: agora,
  }];
  await supabase.from('demandas_avulsas')
    .update({ pintura_pedido_id: pedido.id, informacoes: info, atualizado_em: agora })
    .eq('id', d.id);

  notificarEvento('demanda_criada_setor',
    `*Pintura para cotar* — ${d.titulo}\n${String(d.pintura_tipo || '').trim() || 'Tipo não informado'}\nPeça pronta na Serralheria. Requisição ${pedido.numero_pedido}.`,
    'Compras');

  return { id: pedido.id, numero_pedido: pedido.numero_pedido };
}
