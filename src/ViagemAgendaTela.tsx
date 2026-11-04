// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a tela da agenda: quem está onde (04/11/2026). A conta está em ViagemAgenda.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useEffect } from 'react';
import { Botao, Faixa, hojeISO } from './Interface';
import { lerFrota } from './ViagemProvisionamento';
import { montarAgenda, segundaDaSemana, somarDias } from './ViagemAgenda';
import { rotuloDoStatus, statusDaViagem } from './ViagemFluxo';
import { mdiChevronLeft } from '@mdi/js';

const DIAS = 14;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function Bloco({ titulo, linhas, dias, hoje, aoAbrir }: any) {
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
            {l.barras.map((b: any) => (
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

export default function AgendaDasViagens({ viagens, aoAbrir }: any) {
  const hoje = hojeISO();
  const [inicio, setInicio] = useState(() => segundaDaSemana(hoje));
  const [frota, setFrota] = useState<any[]>([]);
  const [erroFrota, setErroFrota] = useState('');
  useEffect(() => { lerFrota().then(r => { setFrota(r.lista); setErroFrota(r.erro); }); }, []);
  const ag = useMemo(() => montarAgenda(viagens, frota, inicio, DIAS, hoje), [viagens, frota, inicio, hoje]);
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
        <span className="acn-ajuda">Viagens de Aberta até Andamento. Clique numa barra para abrir a viagem.</span>
      </div>
      {erroFrota && <Faixa tom="erro">Não foi possível ler a frota ({erroFrota}); só aparecem os veículos que estão em viagens.</Faixa>}
      {conflitos.length > 0 && <Faixa tom="erro"><strong>Conflito neste período:</strong> {conflitos.map(l => l.rotulo).join(', ')} {conflitos.length === 1 ? 'aparece' : 'aparecem'} em duas viagens ao mesmo tempo.</Faixa>}
      <Bloco titulo="POR VEÍCULO" linhas={ag.veiculos} dias={ag.dias} hoje={hoje} aoAbrir={aoAbrir} />
      <Bloco titulo="POR PESSOA" linhas={ag.pessoas} dias={ag.dias} hoje={hoje} aoAbrir={aoAbrir} />
    </div>
  );
}
