// @ts-nocheck
// ============================================
// ARQUIVO: src/PausaWidget.tsx
// Pausa manual + horário comercial pras etapas com "Iniciar"/"Concluir"
// que contam tempo (Engenharia em análise, Produção, Retrabalho).
// ============================================
//
// Reaproveita src/utils/horasUteis.ts (Seg-Sex 08:00–17:45) — o mesmo
// utilitário usado no cálculo final de tempo_X_horas. O "pausar fora do
// expediente" acontece de graça: horasUteis(inicio, agora) já não soma
// nada fora do horário comercial, então o cronômetro ao vivo naturalmente
// para de andar de noite/fim de semana sem nenhum código especial pra isso.
//
// Colunas usadas em `oples` (mesmo padrão de responsaveis_producao etc,
// genéricas porque só uma etapa com "Iniciar" fica ativa por vez):
//   pausado boolean, data_pausa timestamptz, tempo_pausado_horas numeric
import React, { useState, useEffect } from 'react';
import { horasUteis, dentroDoExpediente } from './utils/horasUteis';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiPlay, mdiPause } from '@mdi/js';

// Tempo decorrido útil (já descontando pausas manuais e horário fora do
// expediente) de uma etapa com `inicio`. Só liga o intervalo de 1s quando
// está de fato contando (evita re-render à toa quando pausado/parado).
export function useTempoUtil(inicio, pausado, dataPausa, tempoPausadoHoras) {
  const [, tick] = useState(0);
  const contando = !!inicio && !pausado;
  useEffect(() => {
    if (!contando) return;
    const t = setInterval(() => tick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [contando]);

  if (!inicio) return { texto: '—', horas: 0 };
  const fim = pausado && dataPausa ? new Date(dataPausa) : new Date();
  const horas = Math.max(0, horasUteis(inicio, fim) - (Number(tempoPausadoHoras) || 0));
  const totalSeg = Math.floor(horas * 3600);
  const h = String(Math.floor(totalSeg / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeg % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeg % 60).padStart(2, '0');
  return { texto: `${h}:${m}:${s}`, horas };
}

// Botão Pausar/Retomar reutilizável — `onPausar`/`onRetomar` fazem o update
// no banco (o chamador decide a tabela/registro).
// 12e58 (09/10/2026): só aparência — virou o botão pequeno secundário do guia, com ícone. Medido antes de mexer: o sistema já repintava os dois botões (que no código eram
// verde e âmbar) no verde-marca; o que o usuário via era um botão escuro igual ao "LIBERAR BOM" ao lado, e agora ele é secundário (a ação principal é o outro).
// `fontSize` continua aceito só para não quebrar quem chama (ninguém passa); a letra agora é a do botão pequeno.
export function BotaoPausar({ pausado, fontSize = 9, onPausar, onRetomar }) {
  return pausado
    ? <Botao pequeno icone={mdiPlay} data-estado="pausado" onClick={onRetomar}>Retomar</Botao>
    : <Botao pequeno icone={mdiPause} data-estado="ativo" onClick={onPausar}>Pausar</Botao>;
}

// Helpers de update — reutilizados nos handlers de pausar/retomar de cada
// tela (Engenharia/Produção), sempre sobre a tabela `oples`.
export async function pausarOpl(supabase, opl) {
  await supabase.from('oples').update({
    pausado: true, data_pausa: new Date().toISOString(),
  }).eq('id', opl.id);
}

export async function retomarOpl(supabase, opl) {
  const acumulado = (Number(opl.tempo_pausado_horas) || 0) + horasUteis(opl.data_pausa, new Date());
  await supabase.from('oples').update({
    pausado: false, data_pausa: null, tempo_pausado_horas: acumulado,
  }).eq('id', opl.id);
}

// Badge "fora do expediente" -- só decorativo, mostra quando o horário
// atual está fora de Seg-Sex 8h-17:45 (o cronômetro já não anda sozinho
// nesse período, isso só deixa visível o porquê).
// 12e58: o tamanho e a cor foram para o design.css (`acn-pausa-fora`); o texto de 8 px passou para 11 px. `fontSize` segue aceito e ignorado, como acima.
export function BadgeForaExpediente({ fontSize = 8 }) {
  if (dentroDoExpediente()) return null;
  return (
    <span className="acn-pausa-fora">
      <Icone path={mdiPause} size={11} /> fora do expediente
    </span>
  );
}
