// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VIAGENS — o hospedeiro da janela da viagem aberta PELO ENDEREÇO (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fase 5, 26/11/2026).
//
// Substitui o `ViagemPorMencao` (04/11/2026), que abria a viagem por cima de qualquer aba só para quem NÃO tem a aba Viagens, pelo recado interno. Agora quem pede a viagem é o
// endereço `#/viagem/<código>` (o F5, o link colado, o Voltar e o Avançar, e a Menção de quem não tem a aba), para qualquer pessoa: a mesma janela, com as partes dos outros setores
// só para leitura (`permissoesDaViagem`). Montado uma vez só, na casca do sistema (`DashboardTab`). Lê a viagem do banco, mostra "Abrindo a viagem…" enquanto espera e monta o
// `EditorDeViagem`, que já cuida do endereço (`useEnderecoDaViagem`). Se a tela Viagens (ou as Pendências do Financeiro) já abriu esta viagem, não monta outra por cima.
//
// Quem TEM a aba Viagens segue pelo caminho de sempre quando a Menção troca de aba (a `ViagensTab` lê o recado e abre a janela, que escreve o endereço); quem NÃO a tem entra por
// `abrirViagemPeloEndereco`. Viagem que não existe ou que a pessoa não lê: UMA mensagem em vermelho e o endereço é limpo. Leitura que falha diz isso, e nunca "não encontrei".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { permissoesDaViagem } from './ViagemFluxo';
import { telaSobDemanda, TelaSobDemanda } from './CarregarTela';
// 26/11/2026 (lentidão): esta peça fica montada o tempo todo na casca; se importasse a ViagensTab direto, a tela inteira das Viagens viria junto no pacote de abertura. O editor só é baixado quando uma viagem realmente abre.
const EditorDeViagem = telaSobDemanda(() => import('./ViagensTab'), m => m.EditorDeViagem);
import { aoMudarEndereco } from './EnderecoDoNavegador';
import { ehCodigoInterno } from './Rotas';
import { tirarEnderecoDeRegistroSemTela } from './OpNoEndereco';
import { abrirViagemPeloEndereco, chaveDaViagemNoEndereco, janelaDaViagemEstaAberta } from './ViagemNoEndereco';
import './endereco.css';

/** Lê a viagem pelo código do endereço. Devolve `{ viagem, erro }`: `erro` preenchido = a leitura falhou; os dois vazios = não achou (não existe ou a pessoa não lê). */
async function lerViagemDoEndereco(chave: string): Promise<{ viagem: any | null; erro: string }> {
  // um texto que nem é um código não existe: nem se pergunta ao banco (que responderia "erro de sintaxe", e isso diria "a leitura falhou" sem ser verdade)
  if (!ehCodigoInterno(chave)) return { viagem: null, erro: '' };
  const { data, error } = await supabase.from('viagens').select('*').eq('id', chave.trim()).maybeSingle();
  if (error) return { viagem: null, erro: error.message || 'sem resposta' };
  return { viagem: data || null, erro: '' };
}

export default function ViagemDoEndereco({ currentUser }: any) {
  const [chave, setChave] = useState<string | null>(() => chaveDaViagemNoEndereco());
  const [viagem, setViagem] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);
  const temAba = permissoesDaViagem(currentUser).base;

  // o endereço manda: Voltar, Avançar, link digitado e também o que o próprio sistema escreve (a Menção de quem não tem a aba)
  useEffect(() => aoMudarEndereco(hash => setChave(chaveDaViagemNoEndereco(hash)), { internas: true }), []);

  // a Menção "a viagem foi aprovada, falta a sua parte" de quem NÃO tem a aba Viagens: trocar de aba levaria a uma tela que a pessoa não tem, então o recado vira o endereço
  useEffect(() => {
    if (temAba) return;
    const abrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'viagem' || !pend.contextoId) return;
      (window as any).__acnDeepLink = null;
      abrirViagemPeloEndereco(String(pend.contextoId));
    };
    window.addEventListener('acn:abrir-registro', abrir);
    return () => window.removeEventListener('acn:abrir-registro', abrir);
  }, [temAba]);

  useEffect(() => {
    if (!chave) { setViagem(null); setCarregando(false); return; }
    if (janelaDaViagemEstaAberta(chave)) { setCarregando(false); return; }   // a tela Viagens (ou outra) já abriu esta viagem: a janela dela cuida de tudo
    let vivo = true;
    setViagem(null);
    setCarregando(true);
    lerViagemDoEndereco(chave).then(r => {
      if (!vivo) return;   // o endereço mudou enquanto lia (Voltar, outra viagem): este resultado não vale mais
      setCarregando(false);
      if (r.viagem) { setViagem(r.viagem); return; }
      // o texto começa com "Não foi possível" para o aviso sair vermelho e ficar na tela até a pessoa fechar (Feedback.tsx)
      window.alert(r.erro
        ? `Não foi possível abrir a viagem: a leitura falhou (${r.erro}). Tente de novo.`
        : 'Não foi possível abrir a viagem: não a encontrei, ou você não tem acesso a ela.');
      tirarEnderecoDeRegistroSemTela();
    }).catch(e => {
      if (!vivo) return;
      setCarregando(false);
      window.alert(`Não foi possível abrir a viagem: a leitura falhou (${e?.message || 'sem resposta'}). Tente de novo.`);
      tirarEnderecoDeRegistroSemTela();
    });
    return () => { vivo = false; };
  }, [chave]);

  const fechar = () => setViagem(atual => (atual === viagem ? null : atual));
  // salvou: a tela Viagens (se estiver por baixo) relê a lista, senão ela mostraria a viagem de antes
  const salvou = () => { fechar(); window.dispatchEvent(new CustomEvent('acn:viagens-mudaram')); };
  return (
    <>
      {carregando && chave && <div className="acn-op-endereco-carregando" role="status">Abrindo a viagem…</div>}
      {viagem && (
        <TelaSobDemanda chave={viagem.id}>
          <EditorDeViagem key={viagem.id} inicial={viagem} currentUser={currentUser} aoFechar={fechar} aoSalvar={salvou} />
        </TelaSobDemanda>
      )}
    </>
  );
}
