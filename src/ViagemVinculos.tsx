// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — ligações de verdade (pedido do usuário em 04/11/2026, fatia 3)
//
// Até a fatia 2 a viagem tinha só um campo de texto "Ligada a". Agora ela guarda uma LISTA de ligações ({tipo, id, descricao}, o mesmo formato do VinculoPicker) com OP, PV (o card
// do CRM, que inclui os processos do funil de licitação) e licitação; clicar numa ligação abre o registro. As OPs que geraram a viagem entram sozinhas (gatilho do banco) e não se
// tiram à mão: a viagem existe por causa delas. No sentido contrário, `ViagensLigadas` mostra, dentro do card do CRM e da licitação, as viagens ligadas a eles.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { mostrarAviso } from './Feedback';
import { Botao, Selo } from './Interface';
import Icone from './Icone';
import { VinculoPicker, abrirVinculo, TIPO_LABEL } from './VinculoPicker';
import { mdiClose, mdiLinkVariant, mdiMapMarkerPath } from '@mdi/js';

export const TIPOS_DA_VIAGEM = ['op', 'pv', 'licitacao'];

/** O texto curto que o quadro e a busca usam ("A1710.2610, PV 4321"): o começo de cada descrição, antes do " — ". */
export const textoDosVinculos = (lista: any[]) => (Array.isArray(lista) ? lista : []).map((x: any) => String(x?.descricao || '').split(' — ')[0].trim()).filter(Boolean).join(', ');

export function VinculosDaViagem({ v, set, pode, aoAbrir }: any) {
  const lista = Array.isArray(v.vinculos) ? v.vinculos : [];
  const dasOps = new Set((v.op_ids || []).map(String));
  const juntar = (x: any) => {
    if (lista.some((y: any) => y.tipo === x.tipo && String(y.id) === String(x.id))) { mostrarAviso('Essa ligação já está na viagem.', 'atencao'); return; }
    set('vinculos', [...lista, { tipo: x.tipo, id: String(x.id), descricao: x.descricao }]);
  };
  const tirar = (x: any) => set('vinculos', lista.filter((y: any) => !(y.tipo === x.tipo && String(y.id) === String(x.id))));
  return (
    <div className="acn-vg-vincs">
      {lista.length === 0 && !v.vinculo && <div className="acn-ajuda">Nenhuma ligação. Ligue a viagem à OP, ao PV ou à licitação para achar tudo de um lugar só.</div>}
      {lista.length === 0 && !!v.vinculo && <div className="acn-ajuda">Referência escrita antes das ligações existirem: «{v.vinculo}». Busque abaixo para ligar de verdade.</div>}
      {lista.length > 0 && (
        <ul className="acn-vg-vinc-lista">
          {lista.map((x: any) => (
            <li key={x.tipo + ':' + x.id} className="acn-vg-vinc">
              <span className="acn-vcp-tipo"><Icone path={mdiLinkVariant} size={14} />{TIPO_LABEL[x.tipo] || x.tipo}</span>
              <button type="button" className="acn-vg-vinc-abrir" title="Abrir o registro" onClick={() => aoAbrir(x)}>{x.descricao}</button>
              {x.tipo === 'op' && dasOps.has(String(x.id))
                ? <span className="acn-ajuda" title="A viagem foi gerada por esta OP">gerou a viagem</span>
                : pode.base && <Botao variante="discreto" pequeno icone={mdiClose} aria-label={`Tirar a ligação ${x.descricao}`} title="Tirar a ligação" onClick={() => tirar(x)} />}
            </li>
          ))}
        </ul>
      )}
      {pode.base && <div className="acn-ajuda">Ligar a outro registro: escolha o tipo e busque.</div>}
      {pode.base && <VinculoPicker value={null} onSelect={juntar} onClear={() => {}} tipos={TIPOS_DA_VIAGEM} />}
    </div>
  );
}

/** As viagens ligadas a um registro (card do CRM = 'pv', licitação = 'licitacao', OP = 'op'): uma faixa com um botão por viagem; some se não há nenhuma. */
export function ViagensLigadas({ tipo, id }: any) {
  const [lista, setLista] = useState<any[]>([]);
  useEffect(() => {
    let vivo = true;
    if (!id) { setLista([]); return; }
    supabase.from('viagens').select('id,titulo,status,data_saida').contains('vinculos', JSON.stringify([{ tipo, id: String(id) }]))   // texto JSON: o cliente do banco transformaria uma lista em lista do Postgres e não em JSON
      .then(({ data, error }) => { if (vivo) setLista(error ? [] : (data || [])); });
    return () => { vivo = false; };
  }, [tipo, id]);
  if (!lista.length) return null;
  const abrir = (viagem: any) => {
    (window as any).__acnDeepLink = { contexto: 'viagem', contextoId: viagem.id };
    window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail: { contexto: 'viagem', contextoId: viagem.id } }));
    window.dispatchEvent(new CustomEvent('acn:trocar-aba', { detail: { aba: 'viagens' } }));
  };
  return (
    <div className="acn-vg-ligadas">
      <span className="acn-vg-ligadas-rot"><Icone path={mdiMapMarkerPath} size={14} /> {lista.length === 1 ? 'Viagem ligada' : 'Viagens ligadas'}:</span>
      {lista.map(x => <Botao key={x.id} pequeno variante="secundario" title="Abrir a viagem (precisa da aba Viagens)" onClick={() => abrir(x)}>{x.titulo}</Botao>)}
    </div>
  );
}
