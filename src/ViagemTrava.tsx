// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — campo do Financeiro preenchido fica TRAVADO (pedido do usuário em 05/11/2026)
//
// "Os campos que foram nutridos não devem poder ser editados a qualquer momento, apenas quando necessário." Decidido com o usuário: o campo do Financeiro (verba total, pedágio, hotel e
// custo real) que já está GRAVADO na viagem aparece travado, com o botão "Editar"; quem preencheu (o Financeiro) ou a direção destrava, SEMPRE com motivo, e a gravação deixa no
// histórico da viagem quem editou, o motivo e o valor de antes. O que ainda não foi preenchido nunca trava. A regra olha o que está GRAVADO (`salvo`), não o que está na tela:
// digitar o primeiro valor não tranca o campo no meio da digitação.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Botao, Selo } from './Interface';
import Icone from './Icone';
import { fmtReais } from './ViagemCalculo';
import { mdiLockOutline, mdiLockOpenVariantOutline } from '@mdi/js';

const ITENS_DO_CUSTO = ['combustivel', 'pedagios', 'hospedagem', 'alimentacao', 'outros'];
const NOME_DO_ITEM: Record<string, string> = { combustivel: 'combustível', pedagios: 'pedágios', hospedagem: 'hospedagem', alimentacao: 'alimentação', outros: 'outros' };
const lancado = (x: any) => x !== null && x !== undefined && x !== '';

export type GrupoTravavel = 'verba' | 'pedagio' | 'hotel' | 'custo_real';
/** Os grupos de campos do Financeiro que travam, com o texto que o aviso e o histórico usam e as colunas de cada um. */
export const GRUPOS_TRAVAVEIS: Record<GrupoTravavel, { rotulo: string; colunas: string[] }> = {
  verba: { rotulo: 'a verba total', colunas: ['verba_total'] },
  pedagio: { rotulo: 'o pedágio', colunas: ['pedagio_modo'] },
  hotel: { rotulo: 'os dados do hotel', colunas: ['hotel'] },
  custo_real: { rotulo: 'o custo real', colunas: ['custo_real'] },
};

/** O grupo já tem valor GRAVADO? Viagem sem id (ainda não salva) nunca tem. */
export function grupoPreenchido(grupo: GrupoTravavel, salvo: any): boolean {
  if (!salvo?.id) return false;
  if (grupo === 'verba') return lancado(salvo.verba_total);
  if (grupo === 'pedagio') return !!salvo.pedagio_modo;
  if (grupo === 'hotel') return ['nome', 'endereco', 'telefone', 'observacao'].some(k => String(salvo.hotel?.[k] || '').trim());
  return ITENS_DO_CUSTO.some(k => lancado(salvo.custo_real?.[k])) || !!String(salvo.custo_real?.observacao || '').trim();
}

export const grupoTravado = (grupo: GrupoTravavel, salvo: any, destravados: Set<string>) => grupoPreenchido(grupo, salvo) && !destravados.has(grupo);

/** O valor do grupo em uma frase curta, para o histórico ("R$ 1.000,00", "Reembolso", "Hotel X"). */
export function textoDoGrupo(grupo: GrupoTravavel, v: any): string {
  if (grupo === 'verba') return lancado(v?.verba_total) ? fmtReais(Number(v.verba_total)) : 'vazia';
  if (grupo === 'pedagio') return v?.pedagio_modo === 'reembolso' ? 'reembolso' : v?.pedagio_modo === 'convenio' ? 'convênio' : 'não definido';
  if (grupo === 'hotel') {
    const h = v?.hotel || {};
    const p = [h.nome, h.telefone, h.endereco, h.observacao].map(x => String(x || '').trim()).filter(Boolean);
    return p.length ? p.join(' · ') : 'vazio';
  }
  const c = v?.custo_real || {};
  const itens = ITENS_DO_CUSTO.filter(k => lancado(c[k])).map(k => `${NOME_DO_ITEM[k]} ${fmtReais(Number(c[k]) || 0)}`);
  const obs = String(c.observacao || '').trim();
  return [...itens, obs ? `obs.: ${obs}` : ''].filter(Boolean).join(', ') || 'vazio';
}

/** Os grupos que foram destravados E mudaram de valor: cada um vira uma nota no histórico (quem, o quê, de quanto para quanto, por quê). */
export function notasDasEdicoes(destravados: Set<string>, motivos: Record<string, string>, salvo: any, atual: any, por: string): string[] {
  const notas: string[] = [];
  for (const g of Object.keys(GRUPOS_TRAVAVEIS) as GrupoTravavel[]) {
    if (!destravados.has(g)) continue;
    const antes = textoDoGrupo(g, salvo), depois = textoDoGrupo(g, atual);
    if (antes === depois) continue;
    notas.push(`${por || 'Alguém'} editou ${GRUPOS_TRAVAVEIS[g].rotulo} (já estava preenchido). Antes: ${antes}. Agora: ${depois}. Motivo: ${motivos[g] || 'não informado'}.`);
  }
  return notas;
}

/** As colunas que a edição destravada cobre: a nota genérica "Financeiro atualizou…" não repete o que já tem nota própria. */
export const colunasDosGrupos = (grupos: Set<string>) => [...grupos].flatMap(g => GRUPOS_TRAVAVEIS[g as GrupoTravavel]?.colunas || []);

/** Envolve os campos de um grupo: travados (fieldset desabilitado) quando já preenchidos, com o botão Editar para quem pode. */
export function GrupoComTrava({ grupo, trava, children }: any) {
  const travado = !!trava && grupoTravado(grupo, trava.salvo, trava.destravados);
  const info = GRUPOS_TRAVAVEIS[grupo as GrupoTravavel];
  return (
    <>
      <fieldset className="acn-vg-fs" disabled={travado} data-teste={'trava-' + grupo} data-travado={travado ? 'sim' : 'nao'}>{children}</fieldset>
      {travado && (
        <div className="acn-vg-trava">
          <Selo familia="neutro" ponto={false}><Icone path={mdiLockOutline} size={13} /> Preenchido e travado</Selo>
          {trava.pode
            ? <Botao pequeno variante="secundario" icone={mdiLockOpenVariantOutline} title={`Destravar ${info.rotulo} para corrigir (pede o motivo)`} onClick={() => trava.aoDestravar(grupo)}>Editar</Botao>
            : <span className="acn-ajuda">Só o Financeiro ou a direção corrige.</span>}
        </div>
      )}
    </>
  );
}
