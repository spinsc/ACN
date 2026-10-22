// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LIGAÇÃO GARANTIA ↔ DESENVOLVIMENTO — as duas caixas de tela (pedido do usuário em 22/10/2026). As regras estão em GarantiaDesenvolvimento.ts.
//   • ProjetoDeOrigem: dentro da ficha de garantia — o projeto do Desenvolvimento ligado ao veículo (o que a Engenharia deixou "Para a Garantia", a revisão e as lições) e o botão
//     "Pedir mudança no projeto" (o pedido de mudança que já existe depois da liberação, ligado ao número da garantia).
//   • GarantiasDoProjeto: dentro da demanda do Desenvolvimento — os atendimentos de garantia do veículo do projeto que a pessoa pode ver.
// A leitura do outro lado é só leitura; a única gravação é o pedido de mudança, pela mesma rotina do Desenvolvimento (`gravarDemanda`: relê a demanda e confere `atualizado_em`).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { Botao, Faixa, Selo } from './Interface';
import { gravarDemanda } from './DesenvolvimentoPorta';
import { pedirMudanca, STATUS_MUDANCA } from './DesenvolvimentoModelo';
import { SITUACOES_GARANTIA, podeConduzirGarantia } from './GarantiaModelo';
import {
  projetosDoVeiculo, mudancasDaFicha, podePedirMudancaDoProjeto, motivoInicialDoPedido, registrarPedidoDeMudancaNaFicha, atendimentosDoProjeto,
} from './GarantiaDesenvolvimento';
import { mdiOpenInNew, mdiPlus } from '@mdi/js';

const fmtDt = (d: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const COLUNAS_DEV = 'id,titulo,tipo_desenvolvimento,situacao,veiculo_id,veiculo_nome,etapas,mudancas,atualizado_em';
const COLUNAS_GAR = 'id,numero,cliente_nome,veiculo_id,veiculo_nome,placa,situacao,etapa,responsavel,copiados,aberto_por_email,criado_em';

/** Vai para outra aba (pelo evento do Dashboard, que só troca se a pessoa tem a aba liberada) e entrega o registro a abrir. */
function irPara(aba: string, depois: any, deepLink?: any) {
  if (deepLink) (window as any).__acnDeepLink = deepLink;
  window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba, depois } }));
}

function useLeitura(carregar: () => Promise<any[]>) {
  const [estado, setEstado] = useState<any>({ carregando: true, itens: [], erro: '' });
  const ler = useCallback(async () => {
    try { setEstado({ carregando: false, itens: await carregar(), erro: '' }); }
    catch (e: any) { setEstado({ carregando: false, itens: [], erro: e?.message || String(e) }); }
  }, []);
  useEffect(() => { ler(); }, [ler]);
  return [estado, ler] as const;
}

function FormularioDoPedido({ g, onEnviar, onCancelar, ocupado }: any) {
  const [x, setX] = useState({ motivo: motivoInicialDoPedido(g), o_que_muda: '', impacto_custo: '', impacto_ops: '' });
  const campo = (k: string, rotulo: string, ph: string, linhas = 2) => (
    <div><label className="acn-label">{rotulo} *</label>
      <textarea className="acn-input" rows={linhas} aria-label={rotulo} placeholder={ph} value={x[k]} onChange={e => setX({ ...x, [k]: e.target.value })} /></div>
  );
  return (
    <div className="acn-dev-form">
      {campo('motivo', 'Motivo da mudança', 'Por que o projeto precisa mudar (já vem o atendimento de origem; edite à vontade)')}
      {campo('o_que_muda', 'O que vai mudar no projeto', 'O que muda no desenho, no material ou na montagem')}
      {campo('impacto_custo', 'Impacto em custo', 'Quanto muda o custo; se não muda, escreva "nenhum"', 1)}
      {campo('impacto_ops', 'Impacto nas OPs abertas', 'Quais OPs em andamento são afetadas; se nenhuma, escreva "nenhum"', 1)}
      <div className="acn-dev-acoes">
        <Botao variante="primario" disabled={ocupado} onClick={() => onEnviar(x)}>Pedir a mudança à Engenharia</Botao>
        <Botao onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

/** Dentro da ficha de garantia: o projeto de origem do veículo e o pedido de mudança. `conduz` = o atendimento está aberto e a pessoa é o responsável ou a gerência. */
export function ProjetoDeOrigem({ g, currentUser, executar, ocupado }: any) {
  const [estado, ler] = useLeitura(() => lerPaginado(() => supabase.from('engenharia_desenvolvimento').select(COLUNAS_DEV).order('id')));
  const [pedindoPara, setPedindoPara] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const demandas = estado.itens;
  const projetos = projetosDoVeiculo(demandas, g.veiculo_id);
  const feitos = mudancasDaFicha(demandas, g);

  const enviar = async (projeto: any, campos: any) => {
    if (gravando) return;
    setGravando(true);
    try {
      const r = await gravarDemanda(projeto.id, (linha: any, agora: string) => {
        const pode = podePedirMudancaDoProjeto(g, linha, currentUser); if (!pode.ok) return { erro: pode.motivo };
        return pedirMudanca(linha, currentUser, { ...campos, garantia: { id: g.id, numero: g.numero } }, agora);
      }, ler);
      if (!r) return;
      const numero = r.patch.mudancas[r.patch.mudancas.length - 1].numero;
      setPedindoPara(null);
      // o pedido já nasceu no projeto: se a ficha não gravou o registro no histórico, a pessoa precisa saber o número
      const x = await executar((gg: any, agora: string) => registrarPedidoDeMudancaNaFicha(gg, currentUser, { projeto_titulo: projeto.titulo, numero }, agora));
      if (!x) alert(`O pedido de mudança ${numero} FOI aberto no projeto "${projeto.titulo}", mas não foi possível registrá-lo no histórico deste atendimento. Não peça de novo.`);
    } finally { setGravando(false); }
  };

  return (
    <>
      {estado.erro && <Faixa tom="atencao">Não foi possível ler os projetos do Desenvolvimento ({estado.erro}).</Faixa>}
      {estado.carregando && <div className="acn-ajuda">Procurando projetos do Desenvolvimento para este veículo…</div>}
      {!estado.carregando && !estado.erro && projetos.length === 0 && <div className="acn-ajuda" data-sem-projeto>Nenhum projeto do Desenvolvimento ligado a este veículo.</div>}
      {projetos.map((p: any) => {
        const dem = demandas.find((d: any) => d.id === p.id);
        // só o responsável e a gerência pedem; o resto da conta (aberto, liberado, sem outra mudança) está em podePedirMudancaDoProjeto
        const pode = g.situacao === 'aberto' && podeConduzirGarantia(g, currentUser) ? podePedirMudancaDoProjeto(g, dem, currentUser) : null;
        return (
          <div key={p.id} className="acn-gar-projeto" data-projeto={p.id}>
            <div className="acn-gar-projeto-topo">
              <strong>{p.titulo}</strong>
              <Selo familia="info" ponto={false}>{p.tipo}</Selo>
              {p.rev && <Selo familia="neutro" ponto={false}>Rev {p.rev}</Selo>}
              <Selo familia={p.liberada ? 'ok' : 'atencao'} ponto={false}>{p.liberada ? 'Liberado para a Produção' : 'Em desenvolvimento'}</Selo>
              {p.situacao === 'pausada' && <Selo familia="neutro" ponto={false}>Pausado</Selo>}
              {p.mudancaEmAndamento && <Selo familia="atencao" ponto={false}>Mudança em andamento</Selo>}
            </div>
            {p.item && <div className="acn-ajuda">Item: {p.item}</div>}
            {p.paraGarantia
              ? <div><span className="acn-pdp-rotulo">Para a Garantia (o que a Engenharia deixou)</span><div className="acn-gar-projeto-texto">{p.paraGarantia}</div></div>
              : <div className="acn-ajuda">A Engenharia não deixou observação para a Garantia neste projeto.</div>}
            {p.faria_diferente.length > 0 && (
              <div><span className="acn-pdp-rotulo">O que a Engenharia faria diferente</span>
                <ul className="acn-gar-projeto-lista">{p.faria_diferente.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>
            )}
            <div className="acn-dev-acoes">
              <Botao pequeno icone={mdiOpenInNew} onClick={() => irPara('engenharia', { nome: 'engenharia:abrir-desenvolvimento', detalhe: { termo: p.titulo } })}>Abrir o projeto</Botao>
              {pode && pedindoPara !== p.id && (
                <Botao pequeno icone={mdiPlus} disabled={!pode.ok || ocupado || gravando} title={pode.ok ? undefined : pode.motivo} onClick={() => setPedindoPara(p.id)}>Pedir mudança no projeto</Botao>
              )}
            </div>
            {pode && !pode.ok && <div className="acn-ajuda atencao" data-trava>{pode.motivo}</div>}
            {pedindoPara === p.id && <FormularioDoPedido g={g} ocupado={gravando} onCancelar={() => setPedindoPara(null)} onEnviar={(campos: any) => enviar(p, campos)} />}
          </div>
        );
      })}
      {feitos.length > 0 && (
        <div data-pedidos-feitos>
          <span className="acn-pdp-rotulo">Mudanças pedidas por este atendimento</span>
          {feitos.map((m: any) => (
            <div key={m.projeto_id + m.numero} className="acn-ajuda">{m.numero} no projeto "{m.projeto_titulo}": {STATUS_MUDANCA[m.status] || m.status}{m.rev_gerada ? ` (Rev ${m.rev_gerada})` : ''}</div>
          ))}
        </div>
      )}
    </>
  );
}
/** Dentro da demanda do Desenvolvimento: os atendimentos de garantia do veículo do projeto que a pessoa pode ver. */
export function GarantiasDoProjeto({ demanda, currentUser }: any) {
  const [estado] = useLeitura(() => lerPaginado(() => supabase.from('garantia_atendimentos').select(COLUNAS_GAR).order('criado_em', { ascending: false }).order('id')));
  const lista = atendimentosDoProjeto(estado.itens, demanda, currentUser);
  if (estado.carregando || (!estado.erro && lista.length === 0)) return null;   // lendo, ou sem atendimento do veículo (ou nenhum que a pessoa veja): a caixa nem aparece (sem piscar em todo cartão enquanto lê)
  return (
    <div className="acn-dev-garantias" data-garantias>
      <div className="acn-dev-porta-tit">Atendimentos de garantia deste veículo</div>
      {estado.erro && <Faixa tom="atencao">Não foi possível ler os atendimentos de garantia ({estado.erro}).</Faixa>}
      {lista.map((g: any) => (
        <div key={g.id} className="acn-dev-garantia" data-garantia={g.numero}>
          <div className="acn-dev-ent-topo">
            <strong>{g.numero}</strong>
            <Selo familia={g.situacao === 'aberto' ? 'info' : 'ok'} ponto={false}>{SITUACOES_GARANTIA[g.situacao] || g.situacao}</Selo>
          </div>
          <div className="acn-ajuda">{g.cliente_nome} · {g.veiculo_nome}{g.placa ? ` · ${g.placa}` : ''} · aberto em {fmtDt(g.criado_em)}</div>
          <div><Botao pequeno icone={mdiOpenInNew} onClick={() => irPara('sac', { nome: 'acn:abrir-registro', detalhe: { contexto: 'garantia', contextoId: g.id } }, { contexto: 'garantia', contextoId: g.id })}>Abrir o atendimento</Botao></div>
        </div>
      ))}
    </div>
  );
}
