// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DEMANDAS GERAIS — o hospedeiro da janela da demanda aberta PELO ENDEREÇO (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fase 5, 26/11/2026).
//
// O endereço `#/demanda/<código>` (o F5, o link colado, o Voltar e o Avançar, e a Menção ou o aviso do Calendário de uma demanda) abre a janela da demanda POR CIMA da tela em que a pessoa
// está, para qualquer pessoa: o painel de demandas só existe dentro das telas dos setores, e quem recebe o aviso muitas vezes não tem a tela do setor. Decidido com o usuário em
// 26/11/2026: só a peça nova, sem migrar o `DemandaAvulsaPanel`. Montado uma vez só, na casca do sistema (`DashboardTab`). Lê a demanda do banco, mostra "Abrindo a demanda…" enquanto
// espera e monta a `ModalDetalhe`, que já cuida do endereço (`useEnderecoDaDemanda`). Se o painel de um setor já abriu esta demanda, não monta outra por cima.
//
// Demanda que não existe ou que a pessoa não lê: UMA mensagem em vermelho e o endereço é limpo. Leitura que falha diz isso, e nunca "não encontrei".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { telaSobDemanda, TelaSobDemanda } from './CarregarTela';
// 26/11/2026 (lentidão): esta peça fica montada o tempo todo na casca; se importasse o painel direto, ele inteiro viria junto no pacote de abertura. A janela só é baixada quando uma demanda abre.
const ModalDetalhe = telaSobDemanda(() => import('./DemandaAvulsaPanel'), m => m.ModalDetalhe);
import { aoMudarEndereco } from './EnderecoDoNavegador';
import { ehCodigoInterno } from './Rotas';
import { tirarEnderecoDeRegistroSemTela } from './OpNoEndereco';
import { chaveDaDemandaNoEndereco, janelaDaDemandaEstaAberta } from './DemandaNoEndereco';
import './endereco.css';

/** Lê a demanda pelo código do endereço. Devolve `{ demanda, erro }`: `erro` preenchido = a leitura falhou; os dois vazios = não achou (não existe ou a pessoa não lê). */
async function lerDemandaDoEndereco(chave: string): Promise<{ demanda: any | null; erro: string }> {
  // um texto que nem é um código não existe: nem se pergunta ao banco (que responderia "erro de sintaxe", e isso diria "a leitura falhou" sem ser verdade)
  if (!ehCodigoInterno(chave)) return { demanda: null, erro: '' };
  const { data, error } = await supabase.from('demandas_avulsas').select('*').eq('id', chave.trim()).maybeSingle();
  if (error) return { demanda: null, erro: error.message || 'sem resposta' };
  return { demanda: data || null, erro: '' };
}

export default function DemandaDoEndereco({ currentUser }: any) {
  const [chave, setChave] = useState<string | null>(() => chaveDaDemandaNoEndereco());
  const [demanda, setDemanda] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);

  // o endereço manda: Voltar, Avançar, link digitado e também o que o próprio sistema escreve (a Menção e o aviso do Calendário)
  useEffect(() => aoMudarEndereco(hash => setChave(chaveDaDemandaNoEndereco(hash)), { internas: true }), []);

  useEffect(() => {
    if (!chave) { setDemanda(null); setCarregando(false); return; }
    if (janelaDaDemandaEstaAberta(chave)) { setCarregando(false); return; }   // o painel de um setor (ou outra) já abriu esta demanda: a janela dela cuida de tudo
    let vivo = true;
    setDemanda(null);
    setCarregando(true);
    lerDemandaDoEndereco(chave).then(r => {
      if (!vivo) return;   // o endereço mudou enquanto lia (Voltar, outra demanda): este resultado não vale mais
      setCarregando(false);
      if (r.demanda) { setDemanda(r.demanda); return; }
      // o texto começa com "Não foi possível" para o aviso sair vermelho e ficar na tela até a pessoa fechar (Feedback.tsx)
      window.alert(r.erro
        ? `Não foi possível abrir a demanda: a leitura falhou (${r.erro}). Tente de novo.`
        : 'Não foi possível abrir a demanda: não a encontrei, ou você não tem acesso a ela.');
      tirarEnderecoDeRegistroSemTela();
    }).catch(e => {
      if (!vivo) return;
      setCarregando(false);
      window.alert(`Não foi possível abrir a demanda: a leitura falhou (${e?.message || 'sem resposta'}). Tente de novo.`);
      tirarEnderecoDeRegistroSemTela();
    });
    return () => { vivo = false; };
  }, [chave]);

  const fechar = () => setDemanda(atual => (atual === demanda ? null : atual));
  // a janela mudou algo: relê a demanda para ela não mostrar o que ficou para trás (a lista do painel, se estiver por baixo, relê sozinha a cada 30 s)
  const reler = () => {
    if (!demanda) return;
    supabase.from('demandas_avulsas').select('*').eq('id', demanda.id).maybeSingle().then(({ data }) => { if (data) setDemanda(atual => (atual && atual.id === data.id ? data : atual)); });
  };
  return (
    <>
      {carregando && chave && <div className="acn-op-endereco-carregando" role="status">Abrindo a demanda…</div>}
      {demanda && (
        <TelaSobDemanda chave={demanda.id}>
          <ModalDetalhe key={demanda.id} demanda={demanda} currentUser={currentUser} onClose={fechar} onRefresh={reler} />
        </TelaSobDemanda>
      )}
    </>
  );
}
