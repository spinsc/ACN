// @ts-nocheck
// Serviços de terceiros: o QUADRO (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026): três colunas, A definir, Agendado e Realizado, com o cancelado fora (só no filtro "Cancelados").
// "No prestador", atrasado, choque de data e sem data são selos no cartão, não colunas. Um serviço por carro, e a tela junta num cartão só os carros da mesma venda, tipo, situação, prestador e dia
// (clicar no cartão do grupo abre a lista dos carros). Arrastar o cartão para outra coluna faz o mesmo que o menu "⋯": o passo que leva até lá, ou o porquê de não poder.
// Quem confere de verdade é o banco; a tela só deixa de oferecer o passo que ele recusaria (regras em TerceirosFluxo.ts).
import React, { useRef, useState } from 'react';
import { mdiLinkVariant, mdiAccountWrenchOutline, mdiCalendarOutline, mdiClipboardTextOutline } from '@mdi/js';
import Icone from './Icone';
import { MenuAcoes, Tag } from './Interface';
import { mostrarAviso } from './Feedback';
import {
  COLUNAS_TERCEIROS, COLUNA_CANCELADO, cartoesDaColuna, movimentosDoServico, movimentoParaAColuna, selosDoServico, rotuloDaLigacao, diasNaColunaDoServico, reaisDoServico,
} from './TerceirosFluxo';
import { itensDoMenu, movimentosEmComum, extrasDoServico } from './TerceirosAcoes';
import { SelosDoServico, juntarSelos, textoDoDia } from './TerceirosPecas';

const TEXTO_DA_COLUNA_VAZIA = {
  solicitado: 'Nenhum pedido esperando prestador e dia.',
  agendado: 'Nada agendado.',
  realizado: 'Nada realizado neste período.',
  cancelado: 'Nenhum pedido cancelado.',
};

const quandoNaColuna = (dias: number) => (dias === 0 ? 'hoje' : `há ${dias} dia${dias > 1 ? 's' : ''}`);

/** O valor que o cartão mostra: o final do que já foi feito, o combinado do resto (só para quem vê valores). */
function valorDoCartao(s: any) {
  const v = s.status === 'realizado' ? s.valor_final : s.valor_combinado;
  return v == null ? null : { texto: reaisDoServico(v), titulo: s.status === 'realizado' ? 'Valor final cobrado' : 'Valor combinado' };
}

function CartaoDeServico({ s, tipo, prestador, selos, verValor, currentUser, aoAbrir, aoAbrirOrdem, aoImprimir, aoMover, aoComecarArraste, aoTerminarArraste }) {
  const movs = movimentosDoServico(s, tipo, currentUser);
  const valor = verValor ? valorDoCartao(s) : null;
  return (
    <div className={'acn-terc-card' + (movs.length ? ' arrastavel' : '')} data-servico={s.id} tabIndex={0} role="group" aria-label={`Serviço ${s.numero}, ${tipo?.nome || ''}`}
      draggable={movs.length > 0}
      onDragStart={e => { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; aoComecarArraste([s]); }}
      onDragEnd={aoTerminarArraste}
      onClick={() => aoAbrir(s)}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) aoAbrir(s); }}>
      <div className="acn-terc-card-cab">
        <div className="acn-terc-card-id"><strong>{s.numero}</strong><Tag>{tipo?.nome || 'Tipo removido'}</Tag></div>
        <MenuAcoes rotulo={`Ações do serviço ${s.numero}`} itens={itensDoMenu(movs, m => aoMover(m, [s]), extrasDoServico([s], { aoAbrir: () => aoAbrir(s), aoAbrirOrdem, aoImprimir }))} />
      </div>
      <p className="acn-terc-card-desc">{s.descricao}</p>
      {s.ligacao_tipo && <div className="acn-terc-card-lig"><Icone path={mdiLinkVariant} size={13} />{rotuloDaLigacao(s)}</div>}
      <div className="acn-terc-card-meta">
        <span className={prestador ? '' : 'acn-terc-sem'}><Icone path={mdiAccountWrenchOutline} size={13} />{prestador?.nome || 'Sem prestador'}</span>
        <span><Icone path={mdiCalendarOutline} size={13} />{textoDoDia(s)}</span>
      </div>
      {selos.length > 0 && <div className="acn-terc-card-selos"><SelosDoServico selos={selos} /></div>}
      <div className="acn-terc-card-pe">
        <span title="Quem pediu">{s.solicitante_nome}{s.solicitante_perfil ? ` · ${s.solicitante_perfil}` : ''}</span>
        <span title="Há quanto tempo está nesta coluna">{quandoNaColuna(diasNaColunaDoServico(s))}</span>
        {valor && <strong className="acn-terc-card-valor" title={valor.titulo}>{valor.texto}</strong>}
      </div>
    </div>
  );
}

/** A soma que o cartão do grupo mostra: o final do que foi feito, o combinado do resto, e quantos ainda estão sem valor. */
function somaDoGrupo(servicos: any[]) {
  const final = servicos[0]?.status === 'realizado';
  let total = 0; let semValor = 0;
  for (const s of servicos) { const v = final ? s.valor_final : s.valor_combinado; if (v == null) semValor++; else total += Number(v); }
  return { total: Math.round(total * 100) / 100, semValor, final };
}

function CartaoDeGrupo({ cartao, tipo, prestador, selos, verValor, tipoDe, currentUser, aoAbrirGrupo, aoAbrirOrdem, aoImprimir, aoMover, aoComecarArraste, aoTerminarArraste }) {
  const { servicos, base } = cartao;
  const movs = movimentosEmComum(servicos, tipoDe, currentUser);
  const soma = verValor ? somaDoGrupo(servicos) : null;
  const mesmoPedido = servicos.every(s => s.solicitante_id === base.solicitante_id);
  // T4: o cartão dos serviços de uma ORDEM de serviço em lote diz a ordem, não a venda (a ordem junta peças de vendas diferentes)
  const daOrdem = !!base.ordem_id && base.ordem_status !== 'cancelada';
  const ondeEsta = daOrdem ? `ordem ${base.ordem_numero || 'de serviço'}` : `venda ${base.venda_base}`;
  return (
    <div className={'acn-terc-card acn-terc-grupo' + (movs.length ? ' arrastavel' : '')} data-grupo={cartao.chave} tabIndex={0} role="group" aria-label={`${servicos.length} serviços de ${tipo?.nome || ''}, ${ondeEsta}`}
      draggable={movs.length > 0}
      onDragStart={e => { e.dataTransfer.setData('text/plain', cartao.chave); e.dataTransfer.effectAllowed = 'move'; aoComecarArraste(servicos); }}
      onDragEnd={aoTerminarArraste}
      onClick={() => aoAbrirGrupo(cartao)}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) aoAbrirGrupo(cartao); }}>
      <div className="acn-terc-card-cab">
        <div className="acn-terc-card-id"><strong>{servicos.length} carros</strong><Tag>{tipo?.nome || 'Tipo removido'}</Tag></div>
        <MenuAcoes rotulo={`Ações dos ${servicos.length} serviços`} itens={itensDoMenu(movs, m => aoMover(m, servicos), extrasDoServico(servicos, { aoAbrir: () => aoAbrirGrupo(cartao), aoAbrirOrdem, aoImprimir }))} />
      </div>
      <p className="acn-terc-card-desc">{base.descricao}</p>
      <div className="acn-terc-card-lig"><Icone path={daOrdem ? mdiClipboardTextOutline : mdiLinkVariant} size={13} />{daOrdem ? `Ordem ${base.ordem_numero || 'de serviço'}` : `Venda ${base.venda_base}`}</div>
      <div className="acn-terc-card-meta">
        <span className={prestador ? '' : 'acn-terc-sem'}><Icone path={mdiAccountWrenchOutline} size={13} />{prestador?.nome || 'Sem prestador'}</span>
        <span><Icone path={mdiCalendarOutline} size={13} />{textoDoDia(base)}</span>
      </div>
      {selos.length > 0 && <div className="acn-terc-card-selos"><SelosDoServico selos={selos} /></div>}
      <div className="acn-terc-card-pe">
        <span title="Quem pediu">{mesmoPedido ? `${base.solicitante_nome}${base.solicitante_perfil ? ` · ${base.solicitante_perfil}` : ''}` : 'Pedidos de pessoas diferentes'}</span>
        <span title="Há quanto tempo está nesta coluna">{quandoNaColuna(Math.min(...servicos.map(s => diasNaColunaDoServico(s))))}</span>
        {/* Grupo em que NENHUM carro tem valor não mostra a linha (como o cartão de um serviço só); com valor em parte dos carros diz quantos faltam. */}
        {soma && soma.semValor < servicos.length && (
          <strong className="acn-terc-card-valor" title={soma.final ? 'Soma dos valores finais' : 'Soma dos valores combinados'}>
            {reaisDoServico(soma.total)}{soma.semValor > 0 ? ` · ${soma.semValor} sem valor` : ''}
          </strong>
        )}
      </div>
    </div>
  );
}

export function QuadroDeTerceiros({ servicos, mapaTipos, mapaPrestadores, choques, hoje, currentUser, verValor, ver, aoAbrir, aoAbrirGrupo, aoAbrirOrdem, aoImprimir, aoMover }) {
  const arrastando = useRef<any[] | null>(null);
  const [soltarEm, setSoltarEm] = useState<string | null>(null);
  const tipoDe = (s: any) => mapaTipos.get(s.tipo_id);
  const colunas = ver === 'cancelados' ? [COLUNA_CANCELADO] : ver === 'todos' ? [...COLUNAS_TERCEIROS, COLUNA_CANCELADO] : COLUNAS_TERCEIROS;

  // Soltar o cartão numa coluna: todos os carros do cartão têm de fazer o MESMO passo até lá; senão diz por quê (nada é gravado sem a pessoa ver o que vai acontecer)
  const soltar = (e: React.DragEvent, colunaId: string) => {
    e.preventDefault();
    setSoltarEm(null);
    const alvos = arrastando.current;
    arrastando.current = null;
    if (!alvos?.length || alvos[0].status === colunaId) return;
    const caminhos = alvos.map(s => movimentoParaAColuna(s, tipoDe(s), colunaId, currentUser));
    const barrado = caminhos.find(c => !c.movimento);
    if (barrado) { mostrarAviso(barrado.porque || 'Não dá para levar este cartão para essa coluna.', 'atencao'); return; }
    const acao = caminhos[0].movimento.acao;
    if (!caminhos.every(c => c.movimento.acao === acao)) { mostrarAviso('Os carros deste cartão não fazem o mesmo passo até essa coluna. Abra o cartão e mova os carros um a um.', 'atencao'); return; }
    aoMover(caminhos[0].movimento, alvos);
  };

  const comecar = (alvos: any[]) => { arrastando.current = alvos; };
  const terminar = () => { arrastando.current = null; setSoltarEm(null); };

  return (
    <div className={'acn-terc-quadro' + (colunas.length === 4 ? ' c4' : colunas.length === 1 ? ' c1' : '')}>
      {colunas.map(col => {
        const cartoes = cartoesDaColuna(servicos, col.id);
        const quantos = cartoes.reduce((n, c) => n + (c.tipo === 'grupo' ? c.servicos.length : 1), 0);
        return (
          <section key={col.id} className={'acn-terc-col' + (soltarEm === col.id ? ' alvo' : '')} data-coluna={col.id}
            onDragOver={e => { e.preventDefault(); if (soltarEm !== col.id) setSoltarEm(col.id); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSoltarEm(null); }}
            onDrop={e => soltar(e, col.id)}>
            <header className="acn-terc-col-cab" title={col.ajuda}><span>{col.rotulo}</span><em>{quantos}</em></header>
            <div className="acn-terc-col-corpo">
              {cartoes.map(c => {
                if (c.tipo === 'grupo') {
                  const tipo = tipoDe(c.base);
                  return <CartaoDeGrupo key={c.chave} cartao={c} tipo={tipo} prestador={c.base.prestador_id ? mapaPrestadores.get(c.base.prestador_id) : null}
                    selos={juntarSelos(c.servicos.map(s => selosDoServico(s, hoje, tipoDe(s), choques, verValor)))} verValor={verValor} tipoDe={tipoDe} currentUser={currentUser}
                    aoAbrirGrupo={aoAbrirGrupo} aoAbrirOrdem={aoAbrirOrdem} aoImprimir={aoImprimir} aoMover={aoMover} aoComecarArraste={comecar} aoTerminarArraste={terminar} />;
                }
                const s = c.servico;
                const tipo = tipoDe(s);
                return <CartaoDeServico key={c.chave} s={s} tipo={tipo} prestador={s.prestador_id ? mapaPrestadores.get(s.prestador_id) : null}
                  selos={selosDoServico(s, hoje, tipo, choques, verValor)} verValor={verValor} currentUser={currentUser}
                  aoAbrir={aoAbrir} aoAbrirOrdem={aoAbrirOrdem} aoImprimir={aoImprimir} aoMover={aoMover} aoComecarArraste={comecar} aoTerminarArraste={terminar} />;
              })}
              {cartoes.length === 0 && <div className="acn-terc-col-vazia">{TEXTO_DA_COLUNA_VAZIA[col.id]}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
