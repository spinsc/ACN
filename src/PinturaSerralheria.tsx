// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PINTURA DA SERRALHERIA — do pedido da peça até o serviço de terceiro
//
// Regra definida com o usuário em 21/09/2026:
//   • toda demanda de Serralheria — tanto a peça de fabricação interna
//     (suporte para a adaptação) quanto a carretinha — pergunta se vai pintura;
//   • o TIPO é texto livre, escrito por quem abre a demanda, porque é o que
//     quem cuida do serviço precisa ler: "eletrostática", "epóxi", "precisa de
//     jato de areia antes" e por aí vai;
//   • quem abre preenche e a Serralheria não mexe — ela executa o que foi
//     pedido;
//   • o pedido de pintura nasce QUANDO A SERRALHERIA CONCLUI a demanda: a peça
//     já existe, é ela que vai para o pintor. Antes disso não há o que enviar.
//
// A pintura é da demanda inteira, não de cada peça: sai um pedido de pintura
// por demanda, com a lista de peças dentro.
//
// MUDANÇA de 23/11/2026 (T5 do módulo Serviços de terceiros, decidida com o usuário):
// o pedido deixou de ser uma requisição no Compras e passou a ser um SERVIÇO DE TERCEIRO do tipo
// "Pintura eletrostática", ligado à demanda, em "A definir", no nome de quem concluiu a peça; a
// Adaptação (que monta a ordem de serviço da pintura) é avisada por WhatsApp, no lugar do Compras.
// O tipo continua trocável enquanto o serviço está em "A definir" (se a pintura não é eletrostática).
// As demandas que já abriram requisição no Compras (`pintura_pedido_id`) ficam como estão.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { itensPreenchidos } from './DemandaItens';
import { lerTipos } from './TerceirosModelo';
import { pedirServicos } from './TerceirosServicos';
import { notificarEvento } from './whatsappHelper';
import { Selo, Botao, Faixa } from './Interface';
import { confirmar } from './Feedback';
import Icone from './Icone';
import { mdiPalette } from '@mdi/js';

export const ehSerralheria = (setor: any) =>
  String(setor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'serralheria';

/** O nome (sem acento, minúsculo) do tipo de serviço que a pintura da Serralheria pede: o cadastro está em Serviços de terceiros › Tipos de serviço. */
export const TIPO_DA_PINTURA_DA_SERRALHERIA = 'pintura eletrostatica';

/** A pintura desta demanda já foi pedida (no Compras, antes de 23/11/2026, ou como serviço de terceiro, depois)? */
export const pinturaJaPedida = (d: any) => !!(d?.pintura_pedido_id || d?.pintura_servico_id);

/** Campos de pintura no formulário da demanda (só aparece para Serralheria) */
// 12e51 (09/10/2026): só aparência — a cor laranja da pintura mora no design.css (--acn-pin-cor), com tom mais claro no tema escuro
export function PinturaCampos({ valor, onChange, somenteLeitura = false }) {
  const tem = !!valor?.pintura;
  return (
    <div className="acn-pin">
      <label className={'acn-pin-marca' + (somenteLeitura ? ' leitura' : '')}>
        <input type="checkbox" checked={tem} disabled={somenteLeitura}
          onChange={e => onChange({ pintura: e.target.checked, pintura_tipo: e.target.checked ? (valor?.pintura_tipo || '') : '' })} />
        <span><Icone path={mdiPalette} size={14} />Esta peça vai precisar de pintura</span>
      </label>
      {tem && (
        <div className="acn-pin-corpo">
          <div className="acn-pin-rot">
            Tipo da pintura — quem cuida do serviço de pintura vai ler isto
          </div>
          <textarea rows={2} className="acn-input acn-pin-texto" disabled={somenteLeitura} value={valor?.pintura_tipo || ''}
            onChange={e => onChange({ pintura: true, pintura_tipo: e.target.value })}
            placeholder="ex.: pintura eletrostática preta; precisa de jato de areia antes" />
          <div className="acn-pin-ajuda">
            Quando a Serralheria concluir esta demanda, nasce sozinho um serviço de pintura em Serviços de terceiros (a Adaptação confere o tipo e escolhe o prestador).
          </div>
        </div>
      )}
    </div>
  );
}

/** Selo curto para listas e detalhe */
export function PinturaSelo({ d }) {
  if (!d?.pintura) return null;
  const feito = pinturaJaPedida(d);
  const rotulo = d.pintura_servico_id ? 'pintura em serviço de terceiros' : d.pintura_pedido_id ? 'pintura no Compras' : 'com pintura';
  return (
    <Selo familia={feito ? 'ok' : 'atencao'} ponto={false} title={d.pintura_tipo || 'Pintura'}>
      <Icone path={mdiPalette} size={12} /> {rotulo}
    </Selo>
  );
}

/** Limita o texto de uma peça ao tamanho de uma linha da lista de peças do serviço. */
const aparar = (t: any, max: number) => { const s = String(t || '').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };

/**
 * Abre o serviço de pintura para a Adaptação. Chamado quando a Serralheria
 * conclui a demanda. Não faz nada se não tem pintura ou se o pedido já existe
 * (concluir de novo não abre outro). Devolve `{ id, numero }` do serviço, `{ erro }` se algo
 * impediu (a demanda segue concluída; "Pedir a pintura agora" na demanda tenta de novo) ou `null`.
 */
export async function abrirPedidoPintura(d: any, currentUser: any) {
  if (!d?.pintura || pinturaJaPedida(d)) return null;
  const agora = new Date().toISOString();
  const pecas = itensPreenchidos(d.itens || []);
  const tipoPedido = String(d.pintura_tipo || '').trim();

  // O tipo vem do cadastro (o Admin pode renomear ou desativar): sem ele o pedido não nasce, e a frase diz onde consertar.
  const tipos = await lerTipos();
  if (tipos.erro) return { erro: `não foi possível ler os tipos de serviço (${tipos.erro})` };
  const tipo = tipos.lista.find((t: any) => t.ativo && t.nome_norm === TIPO_DA_PINTURA_DA_SERRALHERIA);
  if (!tipo) return { erro: 'o tipo "Pintura eletrostática" não existe ou está desativado em Serviços de terceiros › Tipos de serviço' };

  const r = await pedirServicos({
    tipo_id: tipo.id,
    descricao: aparar(`Pintura — ${d.titulo}`, 200),
    ligacoes: [{ tipo: 'demanda', id: d.id }],
    data_desejada: null,
    // o texto que quem abriu a demanda escreveu vai inteiro para a observação: é o que o prestador e a Adaptação precisam ler
    observacao: tipoPedido ? `Tipo de pintura pedido na Serralheria: ${tipoPedido}` : 'Peça pronta na Serralheria. O tipo de pintura não foi informado.',
    pecas: pecas.map((i: any) => ({
      descricao: aparar(i.descricao ? `${i.nome} — ${i.descricao}` : i.nome, 150),
      quantidade: Math.min(99999, Math.max(1, Math.round(Number(i.quantidade) || 1))),
    })),
    prestador_id: null, valor_combinado: null, onde: null, permitir_duplicado: false, anexos: [],
  });
  if (!r.ok || !r.dados?.[0]) return { erro: r.erro || 'o banco não confirmou o pedido' };
  const servico = r.dados[0];

  const info = [...(d.informacoes || []), {
    texto: `Serralheria concluída com pintura pedida (${tipoPedido || 'tipo não informado'}). Serviço de terceiros ${servico.numero} (Pintura eletrostática) aberto em "A definir"; a Adaptação foi avisada.`,
    usuario: currentUser?.nome || '', data: agora,
  }];
  // A marca na demanda impede um segundo pedido. Se ela não gravar, o serviço já existe (o banco recusa um igual em aberto: TS001), então o aviso diz isso.
  const { data: gravada, error: erroMarca } = await supabase.from('demandas_avulsas')
    .update({ pintura_servico_id: servico.id, informacoes: info, atualizado_em: agora })
    .eq('id', d.id).select('id');
  const avisoDaMarca = (erroMarca || !gravada?.length)
    ? `O serviço ${servico.numero} foi aberto, mas a demanda não guardou a ligação com ele (${erroMarca?.message || 'nenhuma linha atualizada'}). Não peça de novo: o serviço já existe em Serviços de terceiros.`
    : null;

  notificarEvento('demanda_criada_setor',
    `*Pintura para a Adaptação* — ${d.titulo}\n${tipoPedido || 'Tipo não informado'}\nPeça pronta na Serralheria. Serviço de terceiros ${servico.numero}, em "A definir": escolha o prestador e o dia (ou entre numa ordem de pintura).`,
    'Produção');

  return { id: servico.id, numero: servico.numero, aviso: avisoDaMarca };
}

/**
 * Atalho da demanda JÁ concluída que ficou sem pedido de pintura (o banco ou a leitura dos tipos falhou na hora de concluir):
 * oferece pedir de novo, com confirmação. Só aparece para demanda concluída há até 30 dias (a mais antiga segue como está).
 */
export function PinturaPedirAgora({ d, currentUser, aoFeito }) {
  const [salvando, setSalvando] = useState(false);
  const concluidaRecente = d?.status === 'Concluída' && d?.data_fim && (Date.now() - new Date(d.data_fim).getTime()) < 30 * 86400000;
  if (!ehSerralheria(d?.setor) || !d?.pintura) return null;
  // pedido já feito (no Compras, antes de 23/11/2026, ou em Serviços de terceiros): o selo diz onde está
  if (pinturaJaPedida(d)) return <PinturaSelo d={d} />;
  if (!concluidaRecente) return null;
  const pedir = async () => {
    if (!await confirmar(`Pedir agora o serviço de pintura de "${d.titulo}"? Ele nasce em "A definir", em Serviços de terceiros, em seu nome, e a Adaptação é avisada.`)) return;
    setSalvando(true);
    const r = await abrirPedidoPintura(d, currentUser);
    setSalvando(false);
    if (r?.erro) { alert('Não foi possível pedir a pintura: ' + r.erro); return; }
    if (r?.aviso) alert(r.aviso);
    await aoFeito();
  };
  return (
    <Faixa tom="erro" acao={<Botao pequeno variante="primario" disabled={salvando} onClick={pedir}>{salvando ? 'Pedindo…' : 'Pedir a pintura agora'}</Botao>}>
      A demanda foi concluída, mas o serviço de pintura ainda não foi pedido.
    </Faixa>
  );
}
