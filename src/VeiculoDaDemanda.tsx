// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DEMANDAS GERAIS — o quadro "Veículo" da demanda (04/11/2026). Pedido do usuário: quem abre uma demanda geral que prende o carro da frota (buscar material, levar material…) reserva o
// veículo dali mesmo, com o motivo; a reserva aparece na Agenda das Viagens como ocupação do carro (ViagemReservas.ts) e some sozinha se a demanda for cancelada. A janela é a mesma da
// Agenda (ReservaDeVeiculoModal.tsx). Peça nova no padrão novo, encaixada na janela da demanda sem migrar a DemandaAvulsaPanel inteira (combinado com o usuário em 04/11/2026).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Botao, Faixa, Selo, hojeISO } from './Interface';
import ReservaDeVeiculoModal from './ReservaDeVeiculoModal';
import { lerFrota } from './ViagemProvisionamento';
import { lerReservasDaDemanda, rotuloDaReserva } from './ViagemReservas';
import { textoDoPeriodo } from './ViagemConflitos';
import { mdiCarClock } from '@mdi/js';

export default function VeiculoDaDemanda({ demanda, currentUser, podeMexer }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [frota, setFrota] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<any | null>(null);   // {} = nova, {reserva} = uma existente

  const carregar = useCallback(async () => {
    const [r, f] = await Promise.all([lerReservasDaDemanda(demanda.id), lerFrota()]);
    setLista(r.lista); setFrota(f.lista); setErro(r.erro || f.erro); setCarregando(false);
  }, [demanda.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const nome = (id: string) => frota.find(f => String(f.id) === String(id))?.apelido || 'Veículo';
  const ativas = lista.filter(r => r.status !== 'cancelada');
  // sem reserva nenhuma e sem poder reservar (demanda encerrada), o quadro nem aparece
  if (!carregando && !erro && !lista.length && !podeMexer) return null;

  return (
    <div className="acn-quadro acn-vg-veiculo-demanda">
      <div className="acn-quadro-titulo">VEÍCULO DA FROTA {ativas.length ? `(${ativas.length})` : ''}</div>
      {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler as reservas de veículo desta demanda ({erro}).</Faixa>}
      {!carregando && !erro && !lista.length && <div className="acn-ajuda">A demanda vai prender o carro da frota (buscar ou levar material, visita…)? Reserve o veículo: ele aparece na Agenda das Viagens e a Adaptação vê o conflito.</div>}
      {lista.length > 0 && (
        <table className="acn-tabela">
          <tbody>
            {lista.map(r => (
              <tr key={r.id} className="acn-vg-linha-tab" onClick={() => setAberta({ reserva: r })}>
                <td><strong>{nome(r.frota_id)}</strong><div className="acn-ajuda">{rotuloDaReserva({ ...r, demanda_titulo: null })}</div></td>
                <td className="acn-num">{textoDoPeriodo({ de: String(r.data_inicio).slice(0, 10), ate: String(r.data_fim).slice(0, 10) })}</td>
                <td>{r.responsavel_nome || '—'}</td>
                <td>{r.status === 'cancelada' ? <Selo familia="neutro" ponto={false} title={r.motivo_cancelamento || ''}>Cancelada</Selo> : String(r.data_fim).slice(0, 10) < hojeISO() ? <Selo familia="neutro" ponto={false}>Já usada</Selo> : <Selo familia="atencao" ponto={false}>Reservado</Selo>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {podeMexer && <div className="acn-vg-acoes"><Botao pequeno icone={mdiCarClock} onClick={() => setAberta({})}>Reservar veículo</Botao></div>}
      {aberta && <ReservaDeVeiculoModal key={aberta.reserva?.id || 'nova'} reserva={aberta.reserva} demanda={{ id: demanda.id, titulo: demanda.titulo }} currentUser={currentUser} aoFechar={() => setAberta(null)} aoMudar={carregar} />}
    </div>
  );
}
