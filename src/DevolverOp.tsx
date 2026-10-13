// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DevolverOp — devolução de OP com escolha do destino
//
//   • Almoxarifado — refazer o kiting (kit errado, serial trocado, item faltando):
//     a OP volta para "Aguardando Almox" com o kit zerado.
//   • Engenharia — reanalisar (BOM/projeto com problema): "Devolvida para Engenharia". (Desde a Etapa 18e, de 13/10/2026, não é mais oferecida: a OP
//     não passa pela Engenharia. Fica aqui só porque OPs antigas ainda podem ter esse status no histórico.)
//   • Comercial — faltam dados (só o PCP, OP ainda em "Em Espera PCP"): "Devolvida Comercial", motivo em obs_devolucao.
//   • PCP — rever a BOM (só o Almoxarifado): volta para "Em Espera PCP" sem a BOM, e a reserva de material é solta.
//
// Usado pelo PCP e pelo Almoxarifado. O motivo é obrigatório e fica no
// histórico da OP (logs_movimentacao_opl) e em obs_devolucao_pcp.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { notificarEvento, msg } from './whatsappHelper';
import { liberarReservaDaOp } from './Estoque';
import { Botao } from './Interface';

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
  comercial: {
    rotulo: 'Comercial — faltam dados',
    ajuda: 'A OP não tem o que o PCP precisa para configurar (itens vendidos, veículo, respostas do carro...). Volta para o Comercial corrigir e reenviar.',
    status: 'Devolvida Comercial',
  },
  pcp: {
    rotulo: 'PCP — rever a BOM',
    ajuda: 'Problema na BOM ou na estrutura. A OP volta para a triagem do PCP, sem a BOM, para ser configurada de novo; a reserva de material é solta.',
    status: 'Em Espera PCP',
  },
};

export async function devolverOp({ opl, destino, motivo, setorOrigem, currentUser }) {
  const d = DESTINOS_DEVOLUCAO[destino];
  const agora = new Date().toISOString();
  const texto = `${setorOrigem}: ${motivo}`;
  const upd: any = { status_geral: d.status, obs_devolucao_pcp: texto };
  if (destino === 'almox') Object.assign(upd, { status_almox: null, obs_almox: `Devolvida para refazer o kit — ${motivo}` });
  if (destino === 'comercial') { delete upd.obs_devolucao_pcp; upd.obs_devolucao = motivo; }   // a tela do CRM lê obs_devolucao, como na devolução que a Engenharia fazia
  if (destino === 'pcp') Object.assign(upd, { status_bom: null, data_chegada_pcp: agora });
  const { error } = await supabase.from('oples').update(upd).eq('id', opl.id);
  if (error) return error;
  logChange({ module: setorOrigem === 'PCP' ? 'pcp' : 'almoxarifado', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
    oldRow: { status_geral: opl.status_geral, status_almox: opl.status_almox }, newRow: upd, user: currentUser });
  await supabase.from('logs_movimentacao_opl').insert([{
    opl_id: opl.id, numero_opl: opl.opl, setor: setorOrigem,
    evento: destino === 'almox'
      ? `Devolvida ao Almoxarifado para refazer o kiting. Motivo: ${motivo}`
      : destino === 'comercial' ? `OP devolvida para Comercial. Motivo: ${motivo}`
      : destino === 'pcp' ? `Devolvida ao PCP para rever a BOM. Motivo: ${motivo}`
      : `Devolvida para Engenharia. Motivo: ${motivo}`,
    status_anterior: opl.status_geral, status_novo: d.status,
    usuario_nome: currentUser?.nome, data_hora: agora,
  }]);
  if (destino === 'engenharia' || destino === 'pcp') {
    // A BOM vai ser revista: a lista de material daquela OP deixou de valer, e
    // segurar estoque com base nela travaria peça para as outras OPs sem razão.
    // Devolução ao Almoxarifado NÃO solta: ali a OP continua de pé, só o kit é
    // que vai ser refeito (regra definida com o usuário em 25/09/2026).
    await liberarReservaDaOp({ oplId: opl.id, motivo: `BOM devolvida para ${destino === 'pcp' ? 'o PCP' : 'a Engenharia'}: ${motivo}`, currentUser });
    if (destino === 'pcp') notificarEvento('op_devolvida_ao_pcp', msg.oplDevolvida(opl.opl, 'PCP', motivo, currentUser?.nome));
    else notificarEvento('pcp_devolve_engenharia', msg.oplDevolvida(opl.opl, 'Engenharia', motivo, currentUser?.nome));
  } else if (destino === 'comercial') {
    notificarEvento('pcp_devolve_comercial', msg.oplDevolvida(opl.opl, 'Comercial', motivo, currentUser?.nome));
  } else {
    notificarEvento('pcp_libera_almox', msg.oplDevolvida(opl.opl, 'Almoxarifado (refazer kit)', motivo, currentUser?.nome));
  }
  return null;
}

export function ModalDevolverOp({ opl, setorOrigem, destinos = ['almox'], currentUser, onClose, onFeito }) {
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
  // 12e51 (09/10/2026): só aparência — a janela passou para o molde do guia; destino, motivo obrigatório e o que é gravado não mudaram
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-dvo-jan" role="dialog" aria-label={`Devolver OP ${opl.opl}`}>
        <div className="acn-modal-cab">
          <span className="modal-title">Devolver OP {opl.opl}</span>
        </div>
        <div className="acn-modal-corpo">
          <label className="acn-label">Para onde?</label>
          <div role="radiogroup" className="acn-dvo-opcoes">
            {destinos.map(k => {
              const d = DESTINOS_DEVOLUCAO[k];
              const sel = destino === k;
              return (
                <label key={k} className={'acn-dvo-opcao' + (sel ? ' sel' : '')}>
                  <input type="radio" name="destino-devolucao" checked={sel} onChange={() => setDestino(k)} />
                  <span>
                    <strong>{d.rotulo}</strong>
                    <div className="acn-ajuda">{d.ajuda}</div>
                  </span>
                </label>
              );
            })}
          </div>
          <label className="acn-label">Motivo / problema identificado *</label>
          <textarea className="acn-input acn-dvo-motivo" rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} aria-label="Motivo da devolução"
            placeholder="Ex.: serial errado na unidade /02" />
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="perigo" className="acn-dvo-confirma" disabled={salvando} onClick={confirmar}>
            {salvando ? 'Devolvendo...' : 'CONFIRMAR DEVOLUÇÃO'}
          </Botao>
          <Botao disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
