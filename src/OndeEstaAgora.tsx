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

const chip = { whiteSpace: 'nowrap' };

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

  const cor = cancelada ? '#64748b' : et.concluida ? '#16a34a' : et.retrabalho ? '#f59e0b' : '#2563eb';
  const onde = cancelada ? 'OP cancelada' : et.concluida ? 'Concluída' : (et.setor || 'Sem setor definido');
  const estado = cancelada ? '' : et.concluida ? et.estado : et.setor ? et.estado : `${et.label}`;

  return (
    <div id="onde-esta-agora" style={{
      margin: '10px 0 0', padding: '9px 12px', borderRadius: 8,
      border: `1px solid ${cor}44`, borderLeft: `4px solid ${cor}`, background: `${cor}0d`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>
        Onde está agora
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 18px', marginTop: 4, fontSize: 12 }}>
        <span style={{ ...chip, whiteSpace: 'normal' }}>
          <strong style={{ color: cor }}>📍 {onde}</strong>{estado ? ` — ${estado}` : ''}
        </span>

        {!cancelada && (
          carregando ? (
            <span style={{ ...chip, color: '#94a3b8' }}>⏱ …</span>
          ) : desde ? (
            <span style={chip}
              title={desde.fonte === 'marco'
                ? `Data aproximada: é a do último marco registrado (${desde.marco}). Esta OP não tem o registro de quando entrou nesta etapa.`
                : 'Data em que a OP entrou nesta etapa.'}>
              ⏱ desde {desde.fonte === 'marco' ? '≈ ' : ''}{textoData(desde.data)} ({textoDias(dias)})
            </span>
          ) : (
            <span style={{ ...chip, color: '#94a3b8' }} title="Nenhuma data registrada para esta OP.">⏱ sem registro</span>
          )
        )}

        {pend.length > 0 && (
          onAbrirDossie ? (
            <button type="button" onClick={onAbrirDossie} title={pend.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join('\n')}
              style={{ ...chip, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', borderRadius: 10,
                padding: '1px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ⚠ {pend.length} pendência{pend.length > 1 ? 's' : ''} aberta{pend.length > 1 ? 's' : ''}
            </button>
          ) : (
            <span style={{ ...chip, color: '#b45309', fontWeight: 700 }} title={pend.map(p => `${p.setor || p.grupo}: ${p.titulo}`).join('\n')}>
              ⚠ {pend.length} pendência{pend.length > 1 ? 's' : ''} aberta{pend.length > 1 ? 's' : ''}
            </span>
          )
        )}

        {frete && <span style={chip}>🚚 Frete: {frete.status || 'em andamento'}</span>}
        {nf && <span style={chip}>🧾 NF {nf}</span>}
        {et.concluida && op.data_entrega && <span style={chip}>📦 Entregue em {textoData(op.data_entrega)}</span>}
      </div>
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
