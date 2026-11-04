// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DEMANDAS GERAIS — "esta demanda vai usar o veículo da frota" no formulário da Nova Demanda (04/11/2026). Pedido do usuário: quem abre a demanda geral e sabe que ela prende o carro
// reserva o veículo na hora, com o motivo; a reserva nasce ligada à demanda criada e aparece na Agenda das Viagens (ViagemReservas.ts). Depois de criada, a demanda tem o quadro
// "Veículo da frota" (VeiculoDaDemanda.tsx) para reservar, mudar ou cancelar. O formulário só junta os dados: quem grava é o NovaDemandaModal, depois de criar a demanda.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { CamposDaReserva } from './ReservaDeVeiculoModal';
import { erroDaReserva } from './ViagemReservas';
import { hojeISO } from './Interface';

export const veiculoVazio = (currentUser?: any) => ({ usar: false, frota_id: '', data_inicio: hojeISO(), data_fim: hojeISO(), motivo: '', observacao: '', responsavel_nome: currentUser?.nome || '' });

/** O que falta para a reserva da Nova Demanda poder ser gravada; vazio = pode (ou a demanda não usa veículo). */
export const erroDoVeiculoDaDemanda = (v: any) => (v?.usar ? erroDaReserva(v, hojeISO(), true) : '');

export default function VeiculoNaNovaDemanda({ valor, onChange }: any) {
  return (
    <div className="acn-vg-veiculo-nova">
      <label className="acn-vg-check">
        <input type="checkbox" checked={!!valor.usar} onChange={e => onChange({ ...valor, usar: e.target.checked })} />
        {' '}Esta demanda vai usar um veículo da frota (buscar ou levar material, visita…)
      </label>
      {valor.usar && (
        <>
          <div className="acn-ajuda">O veículo fica ocupado nesses dias e aparece na Agenda das Viagens; a Adaptação vê se bate com alguma viagem.</div>
          <CamposDaReserva f={valor} setF={(fn: any) => onChange(typeof fn === 'function' ? fn(valor) : fn)} />
        </>
      )}
    </div>
  );
}
