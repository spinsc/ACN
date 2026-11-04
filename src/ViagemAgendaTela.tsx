// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a tela da agenda: quem está onde (04/11/2026). A conta está em ViagemAgenda.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from 'react';
import { Botao, Faixa, hojeISO } from './Interface';
import { lerFrota } from './ViagemProvisionamento';
import { montarAgenda, segundaDaSemana, somarDias } from './ViagemAgenda';
import { rotuloDoStatus, statusDaViagem } from './ViagemFluxo';
import ReservaDeVeiculoModal from './ReservaDeVeiculoModal';
import { rotuloDaReserva } from './ViagemReservas';
import { mdiChevronLeft, mdiCarClock } from '@mdi/js';

const DIAS = 14;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function Bloco({ titulo, linhas, dias, hoje, aoAbrir, aoAbrirReserva }: any) {
  return (
    <div className="acn-quadro">
      <div className="acn-quadro-titulo">{titulo}</div>
      {!linhas.length && <div className="acn-ajuda">Ninguém aparece em viagem neste período.</div>}
      <div className="acn-vg-ag">
        <div className="acn-vg-ag-cab" style={{ gridTemplateColumns: `150px repeat(${dias.length}, minmax(34px, 1fr))` }}>
          <span />
          {dias.map((d: string) => {
            const dow = new Date(d + 'T12:00:00').getDay();
            return <span key={d} className={'acn-vg-ag-dia' + (dow === 0 || dow === 6 ? ' fds' : '') + (d === hoje ? ' hoje' : '')}>{SEMANA[dow]}<em>{d.slice(8)}</em></span>;
          })}
        </div>
        {linhas.map((l: any) => (
          <div key={l.chave} className={'acn-vg-ag-linha' + (l.conflito ? ' acn-vg-ag-conflito' : '')} style={{ gridTemplateColumns: `150px repeat(${dias.length}, minmax(34px, 1fr))` }}>
            <div className="acn-vg-ag-rot" style={{ gridRow: `1 / span ${l.faixas}` }} title={l.conflito ? 'Duas viagens ao mesmo tempo' : undefined}>
              <strong>{l.rotulo}</strong>{l.sub ? <span className="acn-ajuda">{l.sub}</span> : null}{l.conflito ? <span className="acn-txt-erro">conflito</span> : null}
            </div>
            {dias.map((d: string, i: number) => {
              const dow = new Date(d + 'T12:00:00').getDay();
              return <div key={d} className={'acn-vg-ag-cel' + (dow === 0 || dow === 6 ? ' fds' : '') + (d === hoje ? ' hoje' : '')} style={{ gridColumn: i + 2, gridRow: `1 / span ${l.faixas}` }} />;
            })}
            {l.barras.map((b: any) => b.reserva ? (
              // a reserva do veículo para uso interno (04/11/2026): outra cor (hachurada), para não se confundir com viagem
              <button key={'r' + b.reserva.id + ':' + b.faixa} type="button" className={`acn-vg-barra-ag reserva${b.deOntem ? ' corta-esq' : ''}${b.paraDepois ? ' corta-dir' : ''}`}
                style={{ gridColumn: `${b.de + 2} / ${b.ate + 3}`, gridRow: b.faixa + 1 }}
                title={`Uso interno: ${rotuloDaReserva(b.reserva)}${b.reserva.responsavel_nome ? ' · ' + b.reserva.responsavel_nome : ''}${b.reserva.observacao ? ' · ' + b.reserva.observacao : ''}`}
                onClick={() => aoAbrirReserva(b.reserva)}>Uso interno · {rotuloDaReserva(b.reserva)}</button>
            ) : (
              <button key={b.viagem.id + ':' + b.faixa} type="button" className={`acn-vg-barra-ag st-${statusDaViagem(b.viagem)}${b.deOntem ? ' corta-esq' : ''}${b.paraDepois ? ' corta-dir' : ''}`}
                style={{ gridColumn: `${b.de + 2} / ${b.ate + 3}`, gridRow: b.faixa + 1 }}
                title={`${b.viagem.titulo} · ${rotuloDoStatus(statusDaViagem(b.viagem))}${(b.viagem.equipe || []).length ? ' · ' + b.viagem.equipe.map((m: any) => m.nome).join(', ') : ''}`}
                onClick={() => aoAbrir(b.viagem)}>{b.viagem.titulo}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgendaDasViagens({ viagens, aoAbrir, reservas = [], erroReservas = '', aoMudarReservas, currentUser }: any) {
  const hoje = hojeISO();
  const [inicio, setInicio] = useState(() => segundaDaSemana(hoje));
  const [frota, setFrota] = useState<any[]>([]);
  const [erroFrota, setErroFrota] = useState('');
  useEffect(() => { lerFrota().then(r => { setFrota(r.lista); setErroFrota(r.erro); }); }, []);
  const [reservando, setReservando] = useState<any | null>(null);   // a janela da reserva: {} = nova, {reserva} = uma que já existe
  const ag = useMemo(() => montarAgenda(viagens, frota, inicio, DIAS, hoje, reservas), [viagens, frota, inicio, hoje, reservas]);
  const fim = somarDias(inicio, DIAS - 1);
  const dia = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const conflitos = [...ag.veiculos, ...ag.pessoas].filter(l => l.conflito);
  return (
    <div className="acn-vg-agenda">
      <div className="acn-vg-barra">
        <Botao pequeno icone={mdiChevronLeft} aria-label="Semana anterior" onClick={() => setInicio(somarDias(inicio, -7))}>Semana anterior</Botao>
        <Botao pequeno onClick={() => setInicio(segundaDaSemana(hoje))}>Esta semana</Botao>
        <Botao pequeno onClick={() => setInicio(somarDias(inicio, 7))}>Próxima semana</Botao>
        <strong className="acn-vg-ag-periodo">{dia(inicio)} a {dia(fim)}</strong>
        <Botao pequeno variante="primario" icone={mdiCarClock} onClick={() => setReservando({})}>Reservar veículo</Botao>
        <span className="acn-ajuda">Viagens de Aberta até Andamento e o veículo reservado para uso interno (barra hachurada). Clique numa barra para abrir.</span>
      </div>
      {erroReservas && <Faixa tom="erro">Não foi possível ler as reservas de veículo ({erroReservas}); só aparecem as viagens.</Faixa>}
      {erroFrota && <Faixa tom="erro">Não foi possível ler a frota ({erroFrota}); só aparecem os veículos que estão em viagens.</Faixa>}
      {conflitos.length > 0 && <Faixa tom="erro"><strong>Conflito neste período:</strong> {conflitos.map(l => l.rotulo).join(', ')} {conflitos.length === 1 ? 'aparece' : 'aparecem'} em duas viagens (ou numa viagem e num uso interno) ao mesmo tempo.</Faixa>}
      <Bloco titulo="POR VEÍCULO" linhas={ag.veiculos} dias={ag.dias} hoje={hoje} aoAbrir={aoAbrir} aoAbrirReserva={(r: any) => setReservando({ reserva: r })} />
      <Bloco titulo="POR PESSOA" linhas={ag.pessoas} dias={ag.dias} hoje={hoje} aoAbrir={aoAbrir} aoAbrirReserva={() => {}} />
      {reservando && <ReservaDeVeiculoModal key={reservando.reserva?.id || 'nova'} reserva={reservando.reserva} currentUser={currentUser} aoFechar={() => setReservando(null)} aoMudar={() => aoMudarReservas?.()} />}
    </div>
  );
}
