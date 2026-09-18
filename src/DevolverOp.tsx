// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DevolverOp — devolução de OP com escolha do destino
//
//   • Almoxarifado — refazer o kiting (kit errado, serial trocado, item faltando):
//     a OP volta para "Aguardando Almox" com o kit zerado.
//   • Engenharia — reanalisar (BOM/projeto com problema): "Devolvida para Engenharia".
//
// Usado pelo PCP e pelo Almoxarifado. O motivo é obrigatório e fica no
// histórico da OP (logs_movimentacao_opl) e em obs_devolucao_pcp.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { notificarEvento, msg } from './whatsappHelper';

export const DESTINOS_DEVOLUCAO = {
  almox: {
    rotulo: 'Almoxarifado — refazer o kiting',
    ajuda: 'Kit errado, serial trocado ou item faltando. A OP volta para o Almoxarifado com o kit zerado.',
    status: 'Aguardando Almox',
  },
  engenharia: {
    rotulo: 'Engenharia — reanalisar',
    ajuda: 'Problema no BOM ou no projeto. A OP volta para a Engenharia revisar.',
    status: 'Devolvida para Engenharia',
  },
};

export async function devolverOp({ opl, destino, motivo, setorOrigem, currentUser }) {
  const d = DESTINOS_DEVOLUCAO[destino];
  const agora = new Date().toISOString();
  const texto = `${setorOrigem}: ${motivo}`;
  const upd: any = { status_geral: d.status, obs_devolucao_pcp: texto };
  if (destino === 'almox') Object.assign(upd, { status_almox: null, obs_almox: `Devolvida para refazer o kit — ${motivo}` });
  const { error } = await supabase.from('oples').update(upd).eq('id', opl.id);
  if (error) return error;
  logChange({ module: setorOrigem === 'PCP' ? 'pcp' : 'almoxarifado', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
    oldRow: { status_geral: opl.status_geral, status_almox: opl.status_almox }, newRow: upd, user: currentUser });
  await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: opl.id, numero_opl: opl.opl, setor: setorOrigem,
    evento: destino === 'almox'
      ? `Devolvida ao Almoxarifado para refazer o kiting. Motivo: ${motivo}`
      : `Devolvida para Engenharia. Motivo: ${motivo}`,
    status_anterior: opl.status_geral, status_novo: d.status,
    usuario_nome: currentUser?.nome, data_hora: agora,
  }]);
  if (destino === 'engenharia') {
    notificarEvento('pcp_devolve_engenharia', msg.oplDevolvida(opl.opl, 'Engenharia', motivo, currentUser?.nome));
  } else {
    notificarEvento('pcp_libera_almox', msg.oplDevolvida(opl.opl, 'Almoxarifado (refazer kit)', motivo, currentUser?.nome));
  }
  return null;
}

export function ModalDevolverOp({ opl, setorOrigem, destinos = ['almox', 'engenharia'], currentUser, onClose, onFeito }) {
  const [destino, setDestino] = useState(destinos[0]);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const confirmar = async () => {
    if (!motivo.trim()) { alert('Descreva o motivo da devolução.'); return; }
    setSalvando(true);
    const erro = await devolverOp({ opl, destino, motivo: motivo.trim(), setorOrigem, currentUser });
    setSalvando(false);
    if (erro) { alert('Não foi possível devolver: ' + erro.message); return; }
    onFeito();
  };
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-title">Devolver OP {opl.opl}</div>
        <label className="acn-label">Para onde?</label>
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {destinos.map(k => {
            const d = DESTINOS_DEVOLUCAO[k];
            const sel = destino === k;
            return (
              <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1.5px solid ${sel ? '#ef4444' : '#e2e8f0'}`, background: sel ? '#fef2f2' : '#fff' }}>
                <input type="radio" name="destino-devolucao" checked={sel} onChange={() => setDestino(k)} style={{ marginTop: 2 }} />
                <span>
                  <strong style={{ fontSize: 12, color: sel ? '#b91c1c' : '#1e293b' }}>{d.rotulo}</strong>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{d.ajuda}</div>
                </span>
              </label>
            );
          })}
        </div>
        <label className="acn-label">Motivo / problema identificado *</label>
        <textarea className="acn-input" rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} aria-label="Motivo da devolução"
          style={{ width: '100%', resize: 'vertical', marginBottom: 10 }} placeholder="Ex.: serial errado na unidade /02" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acn-btn" style={{ background: '#ef4444', flex: 1, opacity: salvando ? .6 : 1 }} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Devolvendo...' : 'CONFIRMAR DEVOLUÇÃO'}
          </button>
          <button className="acn-btn" style={{ background: '#94a3b8' }} disabled={salvando} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
