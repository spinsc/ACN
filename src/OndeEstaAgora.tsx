// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ONDE ESTÁ AGORA — a resposta de relance sobre uma OP.
//
// Etapa 6 do PLANO_UX_FLUXO_TRABALHO.md (29/09/2026). O Dossiê da OP conta TUDO o que
// aconteceu, numa página longa; esta faixa responde só o que se pergunta primeiro:
// com quem a OP está, o que ela espera, desde quando, o que a trava, e — se houver —
// o frete e a NF. Decidido com o usuário: mostra os dias, sem cor de alerta.
//
// Aparece no topo do detalhe da OP e do Dossiê. A lógica (etapa, setor, "desde
// quando") é de EtapasOp.ts, a mesma que a lista e o card do CRM vão usar.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { vinculosDaOp, linhaDoTempo, pendenciasEmAberto } from './OpVinculos';
import { etapaDaOp, desdeQuandoNaEtapa, diasDesde, textoDias, textoData } from './EtapasOp';
import { Selo } from './Interface';
import Icone from './Icone';
import { mdiMapMarkerOutline, mdiTimerOutline, mdiAlertOutline, mdiTruckOutline, mdiReceiptTextOutline, mdiPackageVariantClosed } from '@mdi/js';

/** A faixa, com os dados já em mãos (o Dossiê carrega os seus e repassa). */
export function OndeEstaAgora({ op, vinculos = [], logs = [], onAbrirDossie = null, carregando = false }) {
  if (!op) return null;
  const cancelada = op.status_geral === 'Cancelado';
  const et = etapaDaOp(op.status_geral);
  const desde = desdeQuandoNaEtapa(op, logs);
  const dias = desde ? diasDesde(desde.data) : null;
  const pend = pendenciasEmAberto(vinculos);
  const fretes = vinculos.filter(v => v.grupo === 'frete')
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const frete = fretes[0];
  const nf = op.numero_nf || op.nfe;

  // 12e52 (09/10/2026): só aparência — a cor da faixa (cinza, verde, âmbar, azul) mora no design.css por [data-oea]; o texto não mudou
  const tom = cancelada ? 'cancelada' : et.concluida ? 'concluida' : et.retrabalho ? 'retrabalho' : 'andamento';
  const onde = cancelada ? 'OP cancelada' : et.concluida ? 'Concluída' : (et.setor || 'Sem setor definido');
  const estado = cancelada ? '' : et.concluida ? et.estado : et.setor ? et.estado : `${et.label}`;

  return (
    <div id="onde-esta-agora" className="acn-oea" data-oea={tom}>
      <div className="acn-oea-tit">
        Onde está agora
      </div>
      <div className="acn-oea-linha">
        <span className="acn-oea-onde">
          <strong><Icone path={mdiMapMarkerOutline} size={14} /> {onde}</strong>{estado ? ` — ${estado}` : ''}
        </span>

        {!cancelada && (
          carregando ? (
            <span className="acn-oea-chip acn-oea-fraco"><Icone path={mdiTimerOutline} size={13} /> …</span>
          ) : desde ? (
            <span className="acn-oea-chip"
              title={desde.fonte === 'marco'
                ? `Data aproximada: é a do último marco registrado (${desde.marco}). Esta OP não tem o registro de quando entrou nesta etapa.`
                : 'Data em que a OP entrou nesta etapa.'}>
              <Icone path={mdiTimerOutline} size={13} /> desde {desde.fonte === 'marco' ? '≈ ' : ''}{textoData(desde.data)} ({textoDias(dias)})
            </span>
          ) : (
            <span className="acn-oea-chip acn-oea-fraco" title="Nenhuma data registrada para esta OP."><Icone path={mdiTimerOutline} size={13} /> sem registro</span>
          )
        )}

        {pend.length > 0 && (
          onAbrirDossie ? (
            <Selo familia="atencao" ponto={false} onClick={onAbrirDossie} title={pend.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join('\n')}>
              <Icone path={mdiAlertOutline} size={13} /> {pend.length} pendência{pend.length > 1 ? 's' : ''} aberta{pend.length > 1 ? 's' : ''}
            </Selo>
          ) : (
            <Selo familia="atencao" ponto={false} title={pend.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join('\n')}>
              <Icone path={mdiAlertOutline} size={13} /> {pend.length} pendência{pend.length > 1 ? 's' : ''} aberta{pend.length > 1 ? 's' : ''}
            </Selo>
          )
        )}

        {frete && <span className="acn-oea-chip"><Icone path={mdiTruckOutline} size={13} /> Frete: {frete.status || 'em andamento'}</span>}
        {nf && <span className="acn-oea-chip"><Icone path={mdiReceiptTextOutline} size={13} /> NF {nf}</span>}
        {op.numero_nf_servico && <span className="acn-oea-chip"><Icone path={mdiReceiptTextOutline} size={13} /> NFS-e {op.numero_nf_servico}</span>}
        {et.concluida && op.data_entrega && <span className="acn-oea-chip"><Icone path={mdiPackageVariantClosed} size={13} /> Entregue em {textoData(op.data_entrega)}</span>}
      </div>
    </div>
  );
}

/** A versão de uma linha de tabela (coluna "Onde está" da lista de OPs em aberto, Etapa 6.2):
 *  setor, há quantos dias e quantas pendências seguram a OP. Sem cor de alerta por tempo —
 *  decisão do usuário em 29/09/2026. `pendencias` são só as de fabricação/compra que ainda
 *  não fecharam as três etapas (índice de OpPendencias); o Dossiê conta mais tipos. */
export function OndeEstaCelula({ op, desde = null, pendencias = [] }) {
  if (!op) return null;
  const et = etapaDaOp(op.status_geral);
  const dias = desde ? diasDesde(desde.data) : null;
  const aprox = desde?.fonte === 'marco';
  return (
    <div className="acn-oea-cel" data-oea-cel={et.retrabalho ? 'retrabalho' : 'andamento'}>
      <div className="acn-oea-cel-setor" title={et.estado}><Icone path={mdiMapMarkerOutline} size={13} /> {et.setor || et.label}</div>
      {desde ? (
        <div className="acn-oea-cel-quando"
          title={aprox
            ? `Data aproximada: é a do último marco registrado (${desde.marco}). Esta OP não tem o registro de quando entrou nesta etapa.`
            : 'Data em que a OP entrou nesta etapa.'}>
          <Icone path={mdiTimerOutline} size={12} /> {aprox ? '≈ ' : ''}{textoDias(dias)}
          <span className="acn-oea-fraco"> · {textoData(desde.data)}</span>
        </div>
      ) : (
        <div className="acn-oea-cel-quando acn-oea-fraco" title="Nenhuma data registrada para esta OP."><Icone path={mdiTimerOutline} size={12} /> sem registro</div>
      )}
      {pendencias.length > 0 && (
        <div className="acn-oea-cel-pend"
          title={pendencias.map(p => `${p.setor || 'Setor'}: ${p.titulo}`).join('\n')}>
          <Icone path={mdiAlertOutline} size={12} /> {pendencias.length} pend.
        </div>
      )}
    </div>
  );
}

/** Versão que busca os próprios dados: para o detalhe da OP, que pode receber uma linha
 *  parcial de uma lista (sem as datas dos marcos) — por isso relê a OP inteira. */
export function OndeEstaAgoraAuto({ op, onAbrirDossie = null }) {
  const [dados, setDados] = useState(null);
  useEffect(() => {
    if (!op?.id) return;
    let vivo = true;
    (async () => {
      const [completa, vinculos, logs] = await Promise.all([
        supabase.from('oples').select('*').eq('id', op.id).maybeSingle().then(r => r.data),
        vinculosDaOp(op),
        linhaDoTempo(op),
      ]);
      if (vivo) setDados({ op: completa || op, vinculos, logs });
    })();
    return () => { vivo = false; };
  }, [op?.id, op?.status_geral]);
  // enquanto carrega, mostra o que já dá para saber só pelo status (sem "desde quando")
  if (!dados) return <OndeEstaAgora op={op} carregando />;
  return <OndeEstaAgora op={dados.op} vinculos={dados.vinculos} logs={dados.logs} onAbrirDossie={onAbrirDossie} />;
}
