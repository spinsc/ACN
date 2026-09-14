// ─────────────────────────────────────────────────────────────────────────────
// ORIGEM DA VENDA da OP — Licitação ou Venda direta (oples.origem_venda).
//
// Mostrada no Kanban da Adaptação e, com destaque maior, no Painel TV: prazo
// de licitação é contratual (multa, atestado), então quem está na produção
// precisa ver de relance de onde veio a OP.
//
// Nasce automática quando a OP vem do CRM (funil da oportunidade) ou do
// "Gerar OP" da licitação; na abertura manual é obrigatória. OP antiga sem
// vínculo fica nula — "origem não informada" — e é completada pelo detalhe
// da OP (OplDetalheModal) por Comercial, Licitações, PCP, Gerentes e Admin.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

export type OrigemVenda = 'licitacao' | 'venda_direta';

export const ORIGENS: { valor: OrigemVenda; label: string; emoji: string; cor: string; fundo: string }[] = [
  { valor: 'licitacao',    label: 'Licitação',    emoji: '🏛️', cor: '#7c2d12', fundo: '#fed7aa' },
  { valor: 'venda_direta', label: 'Venda direta', emoji: '🤝', cor: '#1e3a8a', fundo: '#bfdbfe' },
];

export const origemInfo = (v: any) => ORIGENS.find(o => o.valor === v) || null;

/** Origem de uma OP criada a partir de uma oportunidade do CRM. */
export const origemDeOportunidade = (op: any): OrigemVenda =>
  op?.funil === 'licitacao' ? 'licitacao' : 'venda_direta';

/** Quem pode definir/trocar a origem de uma OP já criada. */
export function podeEditarOrigem(usuario: any): boolean {
  const p = String(usuario?.perfil || '').trim();
  return p === 'Admin' || /^gerente/i.test(p) || /^(comercial|licita|pcp)/i.test(p);
}

/** Etiqueta. `tamanho="tv"` é a versão grande do Painel de Produção. */
export function OrigemVendaBadge({ origem, tamanho = 'normal', ocultarSemOrigem = false }: { origem: any; tamanho?: 'normal' | 'tv'; ocultarSemOrigem?: boolean }) {
  const info = origemInfo(origem);
  const tv = tamanho === 'tv';
  if (!info && ocultarSemOrigem) return null;
  if (!info) {
    return (
      <span title="Origem da venda não informada — complete pelo detalhe da OP"
        style={{ fontSize: tv ? 13 : 8, fontWeight: 800, borderRadius: tv ? 6 : 3, padding: tv ? '3px 10px' : '1px 5px',
          border: '1px dashed ' + (tv ? '#64748b' : '#94a3b8'), color: tv ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap' }}>
        {tv ? 'ORIGEM ?' : 'origem ?'}
      </span>
    );
  }
  return (
    <span title={'Origem da venda: ' + info.label}
      style={{ fontSize: tv ? 18 : 9, fontWeight: 900, borderRadius: tv ? 8 : 3, padding: tv ? '4px 12px' : '1px 6px',
        background: info.fundo, color: info.cor, letterSpacing: tv ? .5 : .2, whiteSpace: 'nowrap',
        textTransform: 'uppercase', border: '1px solid ' + info.cor + '55' }}>
      {info.emoji} {info.label}
    </span>
  );
}
