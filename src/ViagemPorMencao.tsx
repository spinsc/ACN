// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — abrir a viagem pela Menção para quem NÃO tem a aba Viagens (04/11/2026)
//
// O aviso "a viagem foi aprovada, falta a sua parte" vai à Adaptação, ao Financeiro e ao Comercial, e boa parte dessas pessoas não tem a aba Viagens (cada uma preenche só a
// parte do seu setor). Para o clique na Menção não levar a uma tela que ela não tem, esta peça fica montada na casca do sistema e abre a janela da viagem por cima de qualquer
// aba — a mesma janela, com as partes dos outros setores só para leitura. Quem TEM a aba Viagens segue pelo caminho de sempre (a Menção troca de aba e a ViagensTab abre a viagem).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { mostrarAviso } from './Feedback';
import { permissoesDaViagem } from './ViagemFluxo';
import { telaSobDemanda, TelaSobDemanda } from './CarregarTela';
// 26/11/2026 (lentidão): esta peça fica montada o tempo todo na casca; se importasse a ViagensTab direto, a tela inteira das Viagens viria junto no pacote de abertura.
// Agora o editor só é baixado quando uma Menção realmente abre a viagem.
const EditorDeViagem = telaSobDemanda(() => import('./ViagensTab'), m => m.EditorDeViagem);

export default function ViagemPorMencao({ currentUser }: any) {
  const [viagem, setViagem] = useState<any | null>(null);
  const temAba = permissoesDaViagem(currentUser).base;

  useEffect(() => {
    if (temAba) return;
    const abrir = async () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'viagem') return;
      (window as any).__acnDeepLink = null;
      const { data, error } = await supabase.from('viagens').select('*').eq('id', pend.contextoId).maybeSingle();
      if (data) setViagem(data); else mostrarAviso('Não foi possível abrir a viagem: ' + (error?.message || 'ela não foi encontrada (pode ter sido apagada).'));
    };
    window.addEventListener('acn:abrir-registro', abrir);
    return () => window.removeEventListener('acn:abrir-registro', abrir);
  }, [temAba]);

  if (!viagem) return null;
  return (
    <TelaSobDemanda chave={viagem.id}>
      <EditorDeViagem key={viagem.id} inicial={viagem} currentUser={currentUser} aoFechar={() => setViagem(null)} aoSalvar={() => setViagem(null)} />
    </TelaSobDemanda>
  );
}
