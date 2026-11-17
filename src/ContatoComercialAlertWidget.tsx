// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { intervaloVisivel } from './IntervaloVisivel';
import { supabase } from './supabaseClient';
import { hojeISO, diaISO, Botao } from './Interface';
import Icone from './Icone';
import { mdiPhoneOutline, mdiCalendarOutline, mdiClockOutline, mdiAccountOutline, mdiClose } from '@mdi/js';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function hojeStr() {
  return hojeISO(); // YYYY-MM-DD
}

function amanhaStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return diaISO(d);
}

function fmtHora(hora: string) {
  return hora ? hora.slice(0, 5) : '';
}

// Chave de dismissal para evitar reexibir alertas já vistos nesta sessão
function keyDismiss(id: string, tipo: string) {
  return `alerta_comercial_${tipo}_${id}_${hojeStr()}`;
}

function isDismissed(id: string, tipo: string) {
  try { return !!sessionStorage.getItem(keyDismiss(id, tipo)); } catch { return false; }
}

function dismiss(id: string, tipo: string) {
  try { sessionStorage.setItem(keyDismiss(id, tipo), '1'); } catch {}
}

// ─── BANNER (1 dia antes / no dia) ─────────────────────────────────────────────
// 12e48 (09/10/2026): o tom (vermelho = hoje, âmbar = amanhã) e o "empilhar acima do de hoje" viraram classes (antes eram cor e posição passadas em estilo)
// 10/2026 (pedido do usuário, 10/11/2026): cada contato do aviso abre o card no CRM. Quem recebe o aviso por ser gestor do vendedor
// não tinha como saber onde o compromisso estava nem os detalhes; o clique leva ao card (o aviso mostra de quem é, no "Vendedor").
function BannerComercial({ contatos, titulo, icone, tom, onClose, acima, onAbrir }) {
  return (
    <div className={'acn-cta-banner comercial ' + tom + (acima ? ' acima' : '')}>
      <div className="acn-cta-banner-cab">
        <div className="acn-cta-banner-tit"><Icone path={icone} size={14} /> {titulo} ({contatos.length})</div>
        <Botao variante="discreto" pequeno icone={mdiClose} className="acn-cta-banner-x" aria-label="Fechar" title="Fechar" onClick={onClose} />
      </div>
      <div className="acn-cta-banner-corpo">
        {contatos.map(c => (
          <div key={c.id} className="acn-cta-banner-item acn-cta-banner-link" role="button" tabIndex={0}
            title="Abrir este card no CRM" aria-label={'Abrir o card ' + c.titulo + ' no CRM'}
            onClick={() => onAbrir(c)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(c); } }}>
            <div className="acn-cta-banner-nome">{c.titulo}</div>
            <div className="acn-cta-banner-quando">
              <Icone path={mdiCalendarOutline} size={12} /> {c.prox_contato}
              {c.hora_prox_contato && <span> <Icone path={mdiClockOutline} size={12} /> {fmtHora(c.hora_prox_contato)}</span>}
            </div>
            {c.responsavel_nome && <div className="acn-cta-banner-det"><Icone path={mdiAccountOutline} size={12} /> Vendedor: {c.responsavel_nome}</div>}
            {c.nome_contato && <div className="acn-cta-banner-det">Contato: {c.nome_contato}{c.contato ? ` · ${c.contato}` : ''}</div>}
            <div className="acn-cta-banner-abrir">Abrir o card no CRM ›</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
// Alerta comercial (aba CRM/Comercial): avisa o vendedor responsável E o
// gestor dele (via auth_usuarios.gestor_id) 1 dia antes e no dia do
// próximo contato agendado — cliente-side (polling), sem infra de servidor.
export default function ContatoComercialAlertWidget({ currentUser }) {
  const [alertasAmanha, setAlertasAmanha] = useState<any[]>([]);
  const [alertasHoje, setAlertasHoje]     = useState<any[]>([]);
  const [showAmanha, setShowAmanha]       = useState(false);
  const [showHoje, setShowHoje]           = useState(false);
  const timerRef = useRef<any>(null);

  const verificar = useCallback(async () => {
    if (!currentUser?.nome) return;
    const hoje   = hojeStr();
    const amanha = amanhaStr();

    // Nomes dos vendedores que este usuário gerencia (se for gestor de alguém)
    const { data: liderados } = await supabase
      .from('auth_usuarios').select('nome').eq('gestor_id', currentUser.id);
    const nomesEquipe = (liderados || []).map(u => u.nome).filter(Boolean);
    const nomesRelevantes = [...new Set([currentUser.nome, ...nomesEquipe])];

    const { data } = await supabase
      .from('crm_oportunidades_basico')
      .select('id, titulo, responsavel_nome, prox_contato, hora_prox_contato, nome_contato, contato, numero_pv')
      .in('prox_contato', [hoje, amanha])
      .in('responsavel_nome', nomesRelevantes);

    if (!data) return;

    const novosHoje = data.filter(c => c.prox_contato === hoje && !isDismissed(c.id, 'hoje'));
    const novosAmanha = data.filter(c => c.prox_contato === amanha && !isDismissed(c.id, 'amanha'));

    if (novosHoje.length > 0)   { setAlertasHoje(novosHoje);     setShowHoje(true); }
    if (novosAmanha.length > 0) { setAlertasAmanha(novosAmanha); setShowAmanha(true); }
  }, [currentUser?.id, currentUser?.nome]);

  useEffect(() => {
    if (!currentUser?.id) return;
    verificar();
    timerRef.current = intervaloVisivel(verificar, 300_000); // 12/11/2026: era 1 min; o aviso é por dia, não precisa de minuto
    return () => clearInterval(timerRef.current);
  }, [verificar]);

  const fecharHoje = () => {
    alertasHoje.forEach(c => dismiss(c.id, 'hoje'));
    setShowHoje(false);
    setAlertasHoje([]);
  };

  const fecharAmanha = () => {
    alertasAmanha.forEach(c => dismiss(c.id, 'amanha'));
    setShowAmanha(false);
    setAlertasAmanha([]);
  };

  // Abre o card no CRM pela navegação que já existe (`acn:ir-para-aba` confere se a pessoa tem a aba CRM e, ao trocar, manda o
  // `analise:abrir-origem` que abre o card). O contato aberto sai do aviso (já foi visto); o aviso some quando o último sai.
  const abrirNoCrm = (c: any, tipo: 'hoje' | 'amanha') => {
    dismiss(c.id, tipo);
    if (tipo === 'hoje') setAlertasHoje(l => l.filter(x => x.id !== c.id));
    else setAlertasAmanha(l => l.filter(x => x.id !== c.id));
    window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'crm', depois: { nome: 'analise:abrir-origem', detalhe: { origem: 'crm', origemId: c.id } } } }));
  };

  return (
    <>
      {showHoje && alertasHoje.length > 0 && (
        <BannerComercial contatos={alertasHoje} titulo="Contato comercial HOJE" icone={mdiPhoneOutline} tom="erro" onClose={fecharHoje} onAbrir={c => abrirNoCrm(c, 'hoje')} />
      )}
      {showAmanha && alertasAmanha.length > 0 && (
        <BannerComercial contatos={alertasAmanha} titulo="Contato comercial amanhã" icone={mdiCalendarOutline} tom="atencao" onClose={fecharAmanha} onAbrir={c => abrirNoCrm(c, 'amanha')} acima={showHoje && alertasHoje.length > 0} />
      )}
    </>
  );
}
