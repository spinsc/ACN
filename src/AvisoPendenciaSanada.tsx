// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// O aviso grande, no meio da tela do Almoxarifado, de que a pendência de uma OP foi sanada (pedido do usuário em 27/10/2026).
// As regras e a gravação do "Entendi" estão em PendenciasSanadas.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiCheckCircleOutline } from '@mdi/js';
import { marcarVistos, chaveDoUsuario } from './PendenciasSanadas';

const quandoBR = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); };

export default function AvisoPendenciaSanada({ avisos, currentUser, onEntendi }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  if (!avisos?.length) return null;

  const entendi = async () => {
    setSalvando(true); setErro('');
    const falha = await marcarVistos(chaveDoUsuario(currentUser), avisos);
    setSalvando(false);
    if (falha) { setErro(falha); return; }   // fica na tela: se não gravou, o aviso voltaria na próxima abertura sem a pessoa saber
    onEntendi?.(avisos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-alm-sanada" role="alertdialog" aria-label="Pendências sanadas">
        <div className="acn-modal-cab">
          <span className="modal-title acn-alm-sanada-tit">
            <Icone path={mdiCheckCircleOutline} size={22} /> {avisos.length === 1 ? 'Uma pendência foi sanada' : `${avisos.length} pendências foram sanadas`}
          </span>
        </div>
        <div className="acn-modal-corpo">
          {avisos.map(a => (
            <div key={a.opId + '|' + a.pendenciaId} className="acn-alm-sanada-item">
              <div className="acn-alm-sanada-op">A pendência da OP {a.opl} foi sanada{a.cliente ? <span className="acn-ajuda"> · {a.cliente}</span> : null}</div>
              <div className="acn-alm-sanada-motivo">Porque {a.motivo}{quandoBR(a.quando) ? ` (${quandoBR(a.quando)})` : ''}.</div>
            </div>
          ))}
          {erro && <div className="acn-erro" role="alert">{erro}</div>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={entendi} disabled={salvando}>{salvando ? 'Gravando…' : 'Entendi'}</Botao>
        </div>
      </div>
    </div>
  );
}
