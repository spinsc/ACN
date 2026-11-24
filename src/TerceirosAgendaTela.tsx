// @ts-nocheck
// Serviços de terceiros: a AGENDA (fatia T3 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): a semana e o mês, por prestador ou por tipo, com o choque de data em vermelho.
// O Quadro mostra o que falta fazer com cada pedido; a Agenda mostra QUANDO: quem está onde em cada dia. Uma visita é uma linha só ("manhã · 10 carros (venda 1673.2609)").
// Esta tela só desenha: as contas (visitas, linhas, choque) estão em TerceirosAgenda.ts e os filtros e contadores são os mesmos do Quadro e da Lista (a barra fica na casca, TerceirosTab.tsx).
import React, { useMemo, useState } from 'react';
import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';   // o ícone do botão fica antes do texto; a seta da direita só marca o sentido
import { Botao, Chips, Faixa } from './Interface';
import { selosDoServico } from './TerceirosFluxo';
import { diaCurto } from './TerceirosPecas';
import {
  DIAS_DA_SEMANA, janelaDaAgenda, andarNaAgenda, rotuloDaJanela, diaDeOutroMes, visitasDaAgenda, visitasDaJanela, linhasDaAgenda, visitasPorDia, resumoDaAgenda, choquesDaJanela,
  nomeDoTipoDaVisita, nomeDoPrestadorDaVisita, textoDoPeriodoDaVisita, detalheDaVisita,
} from './TerceirosAgenda';

const CHAVE_DA_AGENDA = 'acn_terceiros_agenda';
const MAX_NO_DIA_DO_MES = 3;   // o mês é uma grade apertada: acima disso o dia mostra "mais N" e leva para a semana dele

/** A escolha da última vez (semana ou mês, por prestador ou por tipo); o armazenamento pode falhar: aí abre na semana, por prestador. */
function escolhaGuardada(): { periodo: string; agrupar: string } {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_DA_AGENDA) || '{}');
    return { periodo: j.periodo === 'mes' ? 'mes' : 'semana', agrupar: j.agrupar === 'tipo' ? 'tipo' : 'prestador' };
  } catch { return { periodo: 'semana', agrupar: 'prestador' }; }
}
function guardarEscolha(periodo: string, agrupar: string) {
  try { localStorage.setItem(CHAVE_DA_AGENDA, JSON.stringify({ periodo, agrupar })); } catch { /* sem armazenamento: na próxima vez abre na semana */ }
}

/** Uma visita: o período, o nome (o do que NÃO é a linha: na semana por prestador, o tipo), os carros e os alertas. Clicar abre o serviço, ou os carros do grupo. */
function VisitaNaAgenda({ v, principal, mapas, hoje, verValor, aoAbrir, aoAbrirGrupo }) {
  const abrir = () => (v.carros > 1 ? aoAbrirGrupo({ servicos: v.servicos, base: v.base }) : aoAbrir(v.servicos[0]));
  const selos = v.servicos.flatMap(s => selosDoServico(s, hoje, mapas.tipos.get(s.tipo_id), mapas.choques, verValor)).filter(s => s.id === 'choque' || s.id === 'atrasado');
  const choque = selos.find(s => s.id === 'choque');
  const atraso = selos.find(s => s.id === 'atrasado');
  const quando = textoDoPeriodoDaVisita(v);
  const dica = [nomeDoTipoDaVisita(v, mapas), nomeDoPrestadorDaVisita(v, mapas), quando, detalheDaVisita(v), choque?.title, atraso?.title].filter(Boolean).join(' · ');
  return (
    <div className={`acn-terc-visita sit-${v.situacao}${v.choque ? ' choque' : ''}${v.atrasada ? ' atrasada' : ''}${v.ehHoje ? ' hoje' : ''}`}
      role="button" tabIndex={0} data-visita={v.chave} title={dica} aria-label={dica}
      onClick={abrir} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); abrir(); } }}>
      <span className="acn-terc-visita-topo"><em>{quando}</em>{principal}</span>
      <span className="acn-terc-visita-sub">{detalheDaVisita(v)}</span>
      {choque && <span className="acn-terc-visita-alerta">Choque de data</span>}
      {atraso && <span className="acn-terc-visita-alerta">{atraso.rotulo}</span>}
    </div>
  );
}

export function AgendaDeTerceiros({ servicos, mapaTipos, mapaPrestadores, choques, hoje, verValor, ver, aoAbrir, aoAbrirGrupo }) {
  const [escolha, setEscolha] = useState(escolhaGuardada);
  const [ancora, setAncora] = useState(hoje);
  const { periodo, agrupar } = escolha;
  const mapas = useMemo(() => ({ tipos: mapaTipos, prestadores: mapaPrestadores, choques }), [mapaTipos, mapaPrestadores, choques]);

  const mudar = (parte: any) => { const n = { ...escolha, ...parte }; setEscolha(n); guardarEscolha(n.periodo, n.agrupar); };
  const janela = useMemo(() => janelaDaAgenda(ancora, periodo), [ancora, periodo]);
  const todas = useMemo(() => visitasDaAgenda(servicos, hoje, choques), [servicos, hoje, choques]);
  const visitas = useMemo(() => visitasDaJanela(todas, janela), [todas, janela]);
  const linhas = useMemo(() => (periodo === 'semana' ? linhasDaAgenda(visitas, agrupar, mapas) : []), [visitas, agrupar, mapas, periodo]);
  const porDia = useMemo(() => (periodo === 'mes' ? visitasPorDia(visitas, agrupar, mapas) : new Map()), [visitas, agrupar, mapas, periodo]);
  const resumo = useMemo(() => resumoDaAgenda(visitas), [visitas]);
  const choquesDoPeriodo = useMemo(() => choquesDaJanela(visitas, mapas), [visitas, mapas]);

  const irParaASemanaDe = (dia: string) => { setAncora(dia); mudar({ periodo: 'semana' }); };
  const chip = (v: any, naLinha: boolean) => {
    // Na semana a linha já diz o prestador (ou o tipo), então o chip diz o outro; no mês não há linha e o chip diz os dois, na ordem do agrupamento.
    const tipo = nomeDoTipoDaVisita(v, mapas); const prestador = nomeDoPrestadorDaVisita(v, mapas);
    const principal = naLinha ? (agrupar === 'prestador' ? tipo : prestador) : (agrupar === 'prestador' ? `${prestador} · ${tipo}` : `${tipo} · ${prestador}`);
    return <VisitaNaAgenda key={v.chave} v={v} principal={principal} mapas={mapas} hoje={hoje} verValor={verValor} aoAbrir={aoAbrir} aoAbrirGrupo={aoAbrirGrupo} />;
  };
  const marcaDoDia = (dia: string) => `${dia === hoje ? ' hoje' : ''}${[5, 6].includes(janela.dias.indexOf(dia) % 7) ? ' fds' : ''}`;

  return (
    <div className="acn-terc-agenda">
      <div className="acn-terc-ag-barra">
        <div className="acn-terc-ag-nav">
          <Botao pequeno icone={mdiChevronLeft} onClick={() => setAncora(andarNaAgenda(ancora, periodo, -1))}>{periodo === 'semana' ? 'Semana anterior' : 'Mês anterior'}</Botao>
          <Botao pequeno onClick={() => setAncora(hoje)}>{periodo === 'semana' ? 'Esta semana' : 'Este mês'}</Botao>
          <Botao pequeno icone={mdiChevronRight} onClick={() => setAncora(andarNaAgenda(ancora, periodo, 1))}>{periodo === 'semana' ? 'Próxima semana' : 'Próximo mês'}</Botao>
          <strong className="acn-terc-ag-periodo">{rotuloDaJanela(ancora, periodo)}</strong>
        </div>
        <div className="acn-terc-ag-escolhas">
          <Chips rotulo="Período" ativo={periodo} onChange={id => { mudar({ periodo: id }); }} itens={[{ id: 'semana', rotulo: 'Semana' }, { id: 'mes', rotulo: 'Mês' }]} />
          <Chips rotulo="Agrupar" ativo={agrupar} onChange={id => mudar({ agrupar: id })} itens={[{ id: 'prestador', rotulo: 'Por prestador' }, { id: 'tipo', rotulo: 'Por tipo' }]} />
        </div>
      </div>

      {ver === 'cancelados' && <Faixa tom="info">A Agenda mostra só os serviços ativos. Os cancelados ficam no Quadro e na Lista, no filtro "Cancelados".</Faixa>}
      {choquesDoPeriodo.length > 0 && (
        <Faixa tom="erro">
          <strong>Choque de data neste período:</strong> {choquesDoPeriodo.map(c => c.texto).join(' · ')}. O mesmo prestador tem visitas diferentes no mesmo dia e período. Dá para gravar assim, mas confira com ele.
        </Faixa>
      )}
      <p className="acn-terc-ag-resumo acn-ajuda">
        {resumo.visitas === 0
          ? 'Nenhuma visita neste período.'
          : `${resumo.visitas} ${resumo.visitas === 1 ? 'visita' : 'visitas'} (${resumo.carros} ${resumo.carros === 1 ? 'serviço' : 'serviços'}): ${resumo.agendadas} agendada${resumo.agendadas === 1 ? '' : 's'}, ${resumo.realizadas} realizada${resumo.realizadas === 1 ? '' : 's'}${resumo.desejadas ? `, ${resumo.desejadas} só com data desejada` : ''}${resumo.atrasadas ? ` · ${resumo.atrasadas} atrasada${resumo.atrasadas === 1 ? '' : 's'}` : ''}.`}
      </p>
      <p className="acn-terc-ag-legenda">
        <span className="acn-terc-legenda sit-agendado">Agendado</span>
        <span className="acn-terc-legenda sit-solicitado">Pedido com data desejada (ainda sem prestador e dia)</span>
        <span className="acn-terc-legenda sit-realizado">Já feito</span>
        <span className="acn-terc-legenda choque">Choque ou atraso</span>
      </p>

      {periodo === 'semana' ? (
        <div className="acn-rolagem">
          <div className="acn-terc-ag-semana">
            <div className="acn-terc-ag-cab">
              <span className="acn-terc-ag-canto" />
              {janela.dias.map((d, i) => <span key={d} className={'acn-terc-ag-dia' + marcaDoDia(d)}>{DIAS_DA_SEMANA[i]}<em>{diaCurto(d)}</em></span>)}
            </div>
            {linhas.map(l => (
              <div key={l.chave} className={'acn-terc-ag-linha' + (l.choque ? ' choque' : '')} data-linha={l.chave}>
                <div className="acn-terc-ag-rot">
                  <strong className={l.semPrestador ? 'acn-terc-sem' : ''}>{l.rotulo}</strong>
                  <span className="acn-ajuda">{l.sub}</span>
                  {l.choque && <span className="acn-txt-erro">choque de data</span>}
                </div>
                {janela.dias.map((d, i) => {
                  const doDia = l.visitasPorDia.get(d) || [];
                  return (
                    <div key={d} data-dia={d} data-rotulo={`${DIAS_DA_SEMANA[i]} ${diaCurto(d)}`}
                      className={'acn-terc-ag-cel' + marcaDoDia(d) + (doDia.length ? '' : ' vazia') + (doDia.some(v => v.choque) ? ' choque' : '')}>
                      {doDia.map(v => chip(v, true))}
                    </div>
                  );
                })}
              </div>
            ))}
            {linhas.length === 0 && <div className="acn-terc-ag-vazia">Nada marcado nesta semana. Para ver o que falta agendar, use o Quadro ou a Lista.</div>}
          </div>
        </div>
      ) : (
        <div className="acn-rolagem">
          <div className="acn-terc-ag-mes">
            <div className="acn-terc-ag-mes-cab">{DIAS_DA_SEMANA.map(d => <span key={d}>{d}</span>)}</div>
            <div className="acn-terc-ag-mes-grade">
              {janela.dias.map((d, i) => {
                const doDia = porDia.get(d) || [];
                const outro = diaDeOutroMes(d, janela.mes);
                const aparecem = doDia.slice(0, MAX_NO_DIA_DO_MES);
                return (
                  <div key={d} data-dia={d} data-rotulo={`${DIAS_DA_SEMANA[i % 7]} ${diaCurto(d)}`}
                    className={'acn-terc-ag-mdia' + marcaDoDia(d) + (outro ? ' outro' : '') + (doDia.length ? '' : ' vazia') + (doDia.some(v => v.choque) ? ' choque' : '')}>
                    <span className="acn-terc-ag-mdia-num">{Number(d.slice(8))}</span>
                    {aparecem.map(v => chip(v, false))}
                    {doDia.length > aparecem.length && (
                      <Botao pequeno variante="discreto" className="acn-terc-ag-mais" onClick={() => irParaASemanaDe(d)} title="Abrir a semana deste dia">mais {doDia.length - aparecem.length}</Botao>
                    )}
                  </div>
                );
              })}
            </div>
            {visitas.length === 0 && <div className="acn-terc-ag-vazia">Nada marcado neste mês. Para ver o que falta agendar, use o Quadro ou a Lista.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
