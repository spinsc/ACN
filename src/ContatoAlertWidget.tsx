// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { hojeISO, diaISO, Botao } from './Interface';
import Icone from './Icone';
import { mdiBellRingOutline, mdiCalendarOutline, mdiClockOutline, mdiAccountOutline, mdiCellphone, mdiDomain, mdiCheck, mdiClose } from '@mdi/js';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hojeStr() {
  return hojeISO(); // YYYY-MM-DD
}

function daqui2Dias() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return diaISO(d);
}

function horaAtualMinutos() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function horaParaMinutos(hora: string) {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function fmtHora(hora: string) {
  return hora ? hora.slice(0, 5) : '';
}

// Chave de dismissal para evitar reexibir alertas já vistos nesta sessão
function keyDismiss(id: string, tipo: string) {
  return `alerta_${tipo}_${id}_${hojeStr()}`;
}

function isDismissed(id: string, tipo: string) {
  try { return !!sessionStorage.getItem(keyDismiss(id, tipo)); } catch { return false; }
}

function dismiss(id: string, tipo: string) {
  try { sessionStorage.setItem(keyDismiss(id, tipo), '1'); } catch {}
}

// ─── POPUP 15 MINUTOS ─────────────────────────────────────────────────────────
// 12e48 (09/10/2026): só a aparência (classes acn-cta-* em design.css); a janela de 15 minutos e o banner de 2 dias dizem e fazem o mesmo de antes
function Popup15Min({ contatos, onClose }) {
  return (
    <div className="modal-overlay acn-cta-ov">
      <div className="modal-box acn-modal-cadastro acn-cta-jan" role="alertdialog" aria-label="Contato em 15 minutos">
        {/* Header */}
        <div className="acn-cta-cab">
          <Icone path={mdiBellRingOutline} size={30} />
          <div>
            <div className="acn-cta-tit">CONTATO EM 15 MINUTOS!</div>
            <div className="acn-cta-sub">Você tem {contatos.length} contato{contatos.length > 1 ? 's' : ''} agendado{contatos.length > 1 ? 's' : ''} agora</div>
          </div>
        </div>

        {/* Lista */}
        <div className="acn-modal-corpo acn-cta-lista">
          {contatos.map(c => (
            <div key={c.id} className="acn-cta-item">
              <div className="acn-cta-item-tit">{c.titulo}</div>
              <div className="acn-cta-quando">
                <Icone path={mdiClockOutline} size={12} /> {fmtHora(c.hora_prox_contato)} — {c.prox_contato}
              </div>
              {c.nome_contato && (
                <div className="acn-cta-linha">
                  <Icone path={mdiAccountOutline} size={12} /> {c.nome_contato}
                  {c.contato && <span> · <Icone path={mdiCellphone} size={12} /> {c.contato}</span>}
                </div>
              )}
              {c.orgao && <div className="acn-cta-linha"><Icone path={mdiDomain} size={12} /> {c.orgao}</div>}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="acn-modal-rodape">
          <Botao variante="perigo" icone={mdiCheck} onClick={onClose}>Entendido</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── BANNER 2 DIAS ────────────────────────────────────────────────────────────
function Banner2Dias({ contatos, onClose }) {
  return (
    <div className="acn-cta-banner atencao">
      <div className="acn-cta-banner-cab">
        <div className="acn-cta-banner-tit">
          <Icone path={mdiCalendarOutline} size={14} /> {contatos.length} contato{contatos.length > 1 ? 's' : ''} em 2 dias
        </div>
        <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cta-banner-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
      </div>
      <div className="acn-cta-banner-corpo">
        {contatos.map(c => (
          <div key={c.id} className="acn-cta-banner-item">
            <div className="acn-cta-banner-nome">{c.titulo}</div>
            <div className="acn-cta-banner-quando">
              <Icone path={mdiCalendarOutline} size={12} /> {c.prox_contato}
              {c.hora_prox_contato && <span> <Icone path={mdiClockOutline} size={12} /> {fmtHora(c.hora_prox_contato)}</span>}
            </div>
            {c.nome_contato && <div className="acn-cta-banner-det"><Icone path={mdiAccountOutline} size={12} /> {c.nome_contato}{c.contato ? ` · ${c.contato}` : ''}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function ContatoAlertWidget({ currentUser }) {
  const [alertas15, setAlertas15]   = useState<any[]>([]);
  const [alertas2d, setAlertas2d]   = useState<any[]>([]);
  const [popup15, setPopup15]       = useState(false);
  const [banner2d, setBanner2d]     = useState(false);
  const timerRef = useRef<any>(null);

  const verificar = useCallback(async () => {
    const hoje   = hojeStr();
    const em2d   = daqui2Dias();
    const agora  = horaAtualMinutos();
    const nomeUser = currentUser?.nome || '';

    // Busca contatos agendados para hoje e em 2 dias para este usuário
    const { data } = await supabase
      .from('crm_oportunidades')
      .select('id, titulo, orgao, responsavel_nome, prox_contato, hora_prox_contato, nome_contato, contato')
      .in('prox_contato', [hoje, em2d])
      .eq('responsavel_nome', nomeUser);

    if (!data) return;

    // 15 min antes: prox_contato === hoje E hora dentro dos próximos 15 min (ou até 5 min passados)
    const novos15 = data.filter(c => {
      if (c.prox_contato !== hoje) return false;
      if (!c.hora_prox_contato) return false;
      if (isDismissed(c.id, '15min')) return false;
      const horaC = horaParaMinutos(c.hora_prox_contato);
      if (horaC === null) return false;
      const diff = horaC - agora; // positivo = ainda não chegou, negativo = passou
      return diff >= -5 && diff <= 15; // janela: -5min a +15min
    });

    // 2 dias antes: prox_contato === daqui 2 dias
    const novos2d = data.filter(c => {
      if (c.prox_contato !== em2d) return false;
      if (isDismissed(c.id, '2dias')) return false;
      return true;
    });

    if (novos15.length > 0) { setAlertas15(novos15); setPopup15(true); }
    if (novos2d.length > 0) { setAlertas2d(novos2d); setBanner2d(true); }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.nome) return;
    verificar(); // verifica imediatamente
    timerRef.current = setInterval(verificar, 60_000); // repete a cada 1 min
    return () => clearInterval(timerRef.current);
  }, [verificar]);

  const fecharPopup15 = () => {
    alertas15.forEach(c => dismiss(c.id, '15min'));
    setPopup15(false);
    setAlertas15([]);
  };

  const fecharBanner2d = () => {
    alertas2d.forEach(c => dismiss(c.id, '2dias'));
    setBanner2d(false);
    setAlertas2d([]);
  };

  return (
    <>
      {popup15 && alertas15.length > 0 && (
        <Popup15Min contatos={alertas15} onClose={fecharPopup15} />
      )}
      {banner2d && alertas2d.length > 0 && (
        <Banner2Dias contatos={alertas2d} onClose={fecharBanner2d} />
      )}
    </>
  );
}
