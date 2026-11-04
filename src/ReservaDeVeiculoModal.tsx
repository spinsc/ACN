// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — a janela da reserva do veículo para uso interno (04/11/2026). As regras estão em ViagemReservas.ts.
// É a mesma janela nos dois lugares em que se reserva: o botão "Reservar veículo" da Agenda (aba Viagens) e o quadro "Veículo" de uma demanda geral (`demanda` = a demanda).
// Reservar em cima de uma viagem GRAVA e avisa em vermelho: a viagem é que fica travada na saída até a Adaptação trocar o carro ou a data.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { mostrarAviso, confirmar, pedirTexto } from './Feedback';
import { Botao, Faixa, hojeISO } from './Interface';
import Icone from './Icone';
import { lerFrota, placaParaMostrar } from './ViagemProvisionamento';
import { permissoesDaViagem } from './ViagemFluxo';
import { periodoDaViagem } from './ViagemConflitos';
import { MOTIVOS_DE_USO, lerReservas, gravarReserva, cancelarReserva, erroDaReserva, rotuloDaReserva, viagensQueConflitam, reservasQueSeSobrepoem } from './ViagemReservas';
import { textoDoPeriodo } from './ViagemConflitos';
import { mdiClose, mdiContentSaveOutline, mdiCarClock } from '@mdi/js';

const em = (iso: string) => new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');

/**
 * Os campos da reserva + o aviso de conflito em vermelho (lê a frota, as viagens e as reservas na hora). É usado pela janela da reserva e pelo formulário da Nova Demanda:
 * quem usa recebe as frases do conflito por `aoConflitar` (para perguntar antes de gravar). `f` é a reserva como está na tela; `setF` troca o objeto inteiro.
 */
export function CamposDaReserva({ f, setF, desabilitado, aoConflitar }: any) {
  const hoje = hojeISO();
  const [frota, setFrota] = useState<any[]>([]);
  const [viagens, setViagens] = useState<any[]>([]);
  const [outras, setOutras] = useState<any[]>([]);
  const [erroLeitura, setErroLeitura] = useState('');
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  // o que ocupa o carro hoje, para o aviso aparecer na hora; leitura recusada vira aviso, nunca "sem conflito" calado
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [fr, vg, rs] = await Promise.all([
        lerFrota(),
        supabase.from('viagens').select('*').in('status', ['aberta', 'em_aprovacao', 'provisionamento', 'aprovada', 'andamento']),
        lerReservas(hoje),
      ]);
      if (!vivo) return;
      setFrota(fr.lista); setViagens(vg.data || []); setOutras(rs.lista);
      setErroLeitura([fr.erro && 'a frota (' + fr.erro + ')', vg.error && 'as viagens (' + vg.error.message + ')', rs.erro && 'as reservas (' + rs.erro + ')'].filter(Boolean).join('; '));
    })();
    return () => { vivo = false; };
  }, []);

  const veiculos = frota.filter(x => x.ativo || String(x.id) === String(f.frota_id));
  const viagensEmCima = useMemo(() => viagensQueConflitam(f, viagens, hoje), [f.frota_id, f.data_inicio, f.data_fim, viagens]);
  const reservasEmCima = useMemo(() => reservasQueSeSobrepoem(f, outras), [f.id, f.frota_id, f.data_inicio, f.data_fim, outras]);
  const frasesDoConflito = [
    ...viagensEmCima.map((v: any) => `O veículo está na viagem «${v.titulo}» (${textoDoPeriodo(periodoDaViagem(v, hoje))}).`),
    ...reservasEmCima.map((r: any) => `O veículo já está reservado (${rotuloDaReserva(r)}) de ${textoDoPeriodo({ de: String(r.data_inicio).slice(0, 10), ate: String(r.data_fim).slice(0, 10) })}${r.responsavel_nome ? ', com ' + r.responsavel_nome : ''}.`),
  ];
  const chave = frasesDoConflito.join('|');
  useEffect(() => { aoConflitar?.(frasesDoConflito, !!erroLeitura); }, [chave, erroLeitura]);

  return (
    <>
      {erroLeitura && <Faixa tom="erro">Não foi possível ler {erroLeitura}. O aviso de conflito não vale agora.</Faixa>}
      <fieldset className="acn-vg-fs" disabled={desabilitado}>
        <div className="acn-vg-grade">
          <div className="acn-vg-campo"><label className="acn-label">Veículo *</label>
            <select className="acn-input" aria-label="Veículo da reserva" value={f.frota_id || ''} onChange={e => set('frota_id', e.target.value)}>
              <option value="">Escolha o veículo</option>
              {veiculos.map(x => <option key={x.id} value={x.id}>{x.apelido} ({placaParaMostrar(x.placa)}){x.ativo ? '' : ' — inativo'}</option>)}
            </select></div>
          <div className="acn-vg-campo"><label className="acn-label">Primeiro dia *</label>
            <input type="date" className="acn-input" aria-label="Primeiro dia de uso" value={f.data_inicio || ''} onChange={e => setF((x: any) => ({ ...x, data_inicio: e.target.value, data_fim: !x.data_fim || x.data_fim < e.target.value ? e.target.value : x.data_fim }))} /></div>
          <div className="acn-vg-campo"><label className="acn-label">Último dia *</label>
            <input type="date" className="acn-input" aria-label="Último dia de uso" min={f.data_inicio || undefined} value={f.data_fim || ''} onChange={e => set('data_fim', e.target.value)} /></div>
          <div className="acn-vg-campo"><label className="acn-label">Motivo *</label>
            <select className="acn-input" aria-label="Motivo do uso" value={f.motivo || ''} onChange={e => set('motivo', e.target.value)}>
              <option value="">Escolha o motivo</option>
              {MOTIVOS_DE_USO.map(m => <option key={m} value={m}>{m}</option>)}
            </select></div>
          <div className="acn-vg-campo"><label className="acn-label">Quem vai estar com o veículo *</label>
            <input className="acn-input" aria-label="Responsável pelo veículo" placeholder="Nome de quem vai usar" value={f.responsavel_nome || ''} onChange={e => set('responsavel_nome', e.target.value)} /></div>
          <div className="acn-vg-campo"><label className="acn-label">Observação{f.motivo === 'Outro' ? ' *' : ''}</label>
            <input className="acn-input" aria-label="Observação da reserva" placeholder="Ex.: buscar as chapas no fornecedor, em Campinas" value={f.observacao || ''} onChange={e => set('observacao', e.target.value)} /></div>
        </div>
      </fieldset>
      {!desabilitado && frasesDoConflito.length > 0 && (
        <Faixa tom="erro"><strong>Conflito de datas.</strong>{frasesDoConflito.map((t, i) => <div key={i}>{t}</div>)}<div className="acn-ajuda">A reserva pode ser gravada mesmo assim; a viagem fica travada na saída ("A equipe saiu") até a Adaptação trocar o veículo ou a data.</div></Faixa>
      )}
    </>
  );
}

export default function ReservaDeVeiculoModal({ reserva, demanda, veiculoInicial, diaInicial, currentUser, aoFechar, aoMudar }: any) {
  const hoje = hojeISO();
  const nova = !reserva?.id;
  const [f, setF] = useState<any>(() => reserva
    ? { ...reserva, data_inicio: String(reserva.data_inicio).slice(0, 10), data_fim: String(reserva.data_fim).slice(0, 10) }
    : { frota_id: veiculoInicial || '', data_inicio: diaInicial || hoje, data_fim: diaInicial || hoje, motivo: '', observacao: '', responsavel_nome: currentUser?.nome || '', demanda_id: demanda?.id || null, demanda_titulo: demanda?.titulo || null });
  const [frasesDoConflito, setFrasesDoConflito] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const cancelada = !nova && reserva.status === 'cancelada';
  // quem marca pode mexer na sua; a aba Viagens e a direção mexem em qualquer uma
  const pode = nova || permissoesDaViagem(currentUser).base || String(reserva.criado_por_nome || '') === String(currentUser?.nome || currentUser?.email || '');
  const temConflito = frasesDoConflito.length > 0;

  const salvar = async () => {
    if (salvando || !pode || cancelada) return;
    const erro = erroDaReserva(f, hoje, nova);
    if (erro) { mostrarAviso(erro, 'atencao'); return; }
    if (temConflito && !await confirmar(['Conflito de datas:', '', ...frasesDoConflito, '', 'A reserva será gravada e a viagem ficará travada na saída até trocar o veículo ou a data. Reservar mesmo assim?'].join(String.fromCharCode(10)))) return;
    setSalvando(true);
    const r = await gravarReserva(f, currentUser);
    setSalvando(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso(nova ? 'Veículo reservado.' : 'Reserva atualizada.', 'ok');
    aoMudar?.(); aoFechar();
  };

  const cancelar = async () => {
    if (salvando || !pode || cancelada) return;
    const m = await pedirTexto('Cancelar a reserva: qual o motivo? (obrigatório)');
    if (m === null) return;
    if (!m.trim()) { mostrarAviso('Não foi possível cancelar a reserva: o motivo é obrigatório.'); return; }
    setSalvando(true);
    const r = await cancelarReserva(reserva, m.trim(), currentUser);
    setSalvando(false);
    if (r.erro) { mostrarAviso(r.erro); return; }
    mostrarAviso('Reserva cancelada.', 'ok');
    aoMudar?.(); aoFechar();
  };

  return createPortal(
    <div className="modal-overlay acn-vg-ov">
      <div className="modal-box acn-modal-cadastro acn-vg-reserva" role="dialog" aria-label="Reserva do veículo">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCarClock} size={18} />{nova ? 'Reservar veículo' : cancelada ? 'Reserva cancelada' : 'Reserva do veículo'}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={aoFechar} />
        </div>
        <div className="acn-modal-corpo acn-vg-corpo">
          <div className="acn-ajuda">O veículo fica ocupado nesses dias, mesmo sem viagem: aparece na Agenda das Viagens e a Adaptação vê o choque com as viagens para remanejar.{demanda ? ` Ligada à demanda «${demanda.titulo}».` : ''}</div>
          {cancelada && <Faixa tom="info">Cancelada por {reserva.cancelada_por_nome || '—'}{reserva.cancelada_em ? ' em ' + em(reserva.cancelada_em) : ''}{reserva.motivo_cancelamento ? ': ' + reserva.motivo_cancelamento : ''}</Faixa>}
          {!nova && !pode && !cancelada && <Faixa tom="info">Só quem fez a reserva, quem tem a aba Viagens e a direção podem mudar ou cancelar.</Faixa>}
          <CamposDaReserva f={f} setF={setF} desabilitado={!pode || cancelada} aoConflitar={(frases: string[]) => setFrasesDoConflito(frases)} />
        </div>
        <div className="acn-modal-rodape">
          {pode && !cancelada && <Botao variante="primario" icone={mdiContentSaveOutline} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : nova ? 'Reservar veículo' : 'Salvar reserva'}</Botao>}
          {pode && !nova && !cancelada && <Botao variante="perigo-sec" disabled={salvando} onClick={cancelar}>Cancelar a reserva</Botao>}
          <Botao onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>
    </div>,
    document.body,
  );
}
