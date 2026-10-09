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
import Icone from './Icone';
import { mdiBank, mdiHandshakeOutline } from '@mdi/js';

export type OrigemVenda = 'licitacao' | 'venda_direta';

// 12e58 (09/10/2026): a etiqueta (OrigemVendaBadge) agora pinta pelas classes do design.css (`acn-orv`, por `[data-origem]`) e usa `icone` no lugar do emoji; `emoji`, `cor` e
// `fundo` ficam aqui só porque a Nova OP/OS (NovaOpOsModal) ainda lê os três nos botões de escolher a origem — saem quando essa tela for migrada.
export const ORIGENS: { valor: OrigemVenda; label: string; emoji: string; icone: string; cor: string; fundo: string }[] = [
  { valor: 'licitacao',    label: 'Licitação',    emoji: '🏛️', icone: mdiBank,              cor: '#7c2d12', fundo: '#fed7aa' },
  { valor: 'venda_direta', label: 'Venda direta', emoji: '🤝', icone: mdiHandshakeOutline, cor: '#1e3a8a', fundo: '#bfdbfe' },
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
      <span title="Origem da venda não informada — complete pelo detalhe da OP" className={'acn-orv sem' + (tv ? ' tv' : '')}>
        {tv ? 'ORIGEM ?' : 'origem ?'}
      </span>
    );
  }
  return (
    <span title={'Origem da venda: ' + info.label} className={'acn-orv' + (tv ? ' tv' : '')} data-origem={info.valor}>
      <Icone path={info.icone} size={tv ? 18 : 12} /> {info.label}
    </span>
  );
}
