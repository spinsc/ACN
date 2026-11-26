// A janela da demanda geral e o endereço dela (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 5, decidido com o usuário em 26/11/2026: "por cima de qualquer tela, só a peça nova").
//
// O endereço `#/demanda/<código>` abre a janela da demanda por cima da tela em que a pessoa está. O painel de demandas (`DemandaAvulsaPanel`) mora em seis telas e abas (Comercial,
// Engenharia, PCP, Financeiro, Almoxarifado e os setores), e quem recebe o aviso de uma demanda muitas vezes nem tem a tela do setor dela, então o endereço não pode ser "dentro de uma
// tela": como a OP (Fase 2) e a viagem (Fase 5, parte 1), a regra mora na PRÓPRIA janela (`ModalDetalhe`), sem migrar o painel:
//  - ao abrir uma demanda, escreve `#/demanda/<código>` (um passo novo: o Voltar do navegador fecha a janela e o Avançar a reabre). Se a janela foi aberta DE UM endereço (F5, link
//    colado, Avançar), o endereço já é o dela e nada é escrito;
//  - ao ser fechada com o endereço ainda sendo o dela, o tira (um passo atrás, ou, em link colado, o endereço da tela de baixo: nunca joga a pessoa para fora do sistema);
//  - se o endereço muda por fora (Voltar, Avançar, outro endereço) e deixa de ser o dela, a janela se fecha. O X da janela da demanda nunca perguntou sobre alteração não salva
//    (cada ação grava na hora), então o Voltar também não pergunta: é a mesma ação do X.
// A janela aberta DE UM endereço é montada pelo `DemandaDoEndereco`, que lê a demanda do banco; a lista de janelas abertas abaixo existe para ele não abrir uma segunda por cima de uma
// que o painel de um setor já abriu.
import { useEffect, useRef } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';
import { mesmaChave, montarEnderecoDaDemanda, registroDoEndereco } from './Rotas';
import { tirarEnderecoDeRegistroSemTela } from './OpNoEndereco';
import { copiarTexto } from './CopiarTexto';

/** O código da demanda que o endereço de agora pede, ou `null` se o endereço não é de demanda. */
export function chaveDaDemandaNoEndereco(hash: string = enderecoAtual()): string | null {
  const r = registroDoEndereco(hash);
  return r && r.registro === 'demanda' ? r.chave : null;
}

/** Abre a janela de uma demanda pelo endereço (um passo novo no histórico). Quem a monta é o `DemandaDoEndereco`. */
export function abrirDemandaPeloEndereco(id: string): void {
  const c = String(id ?? '').trim();
  if (!c) return;
  irParaEndereco(montarEnderecoDaDemanda(c));
}

type Janela = {
  id: () => string;             // o código da demanda que a janela mostra
  fechar: () => void;           // fecha a janela (a mesma ação do X)
  fechando: boolean;            // já mandou fechar: não manda duas vezes
  tituloAntes: string;
  tituloMeu: string;
};
const janelas: Janela[] = [];

/** Já existe uma janela aberta para esta demanda? */
export function janelaDaDemandaEstaAberta(id: string): boolean {
  return janelas.some(j => mesmaChave(j.id(), id));
}

/**
 * O gancho da janela da demanda (chamado por `ModalDetalhe`). `demanda` é o que a janela mostra e `aoFechar`, a mesma ação do X. Os dois podem mudar a cada desenho: o gancho guarda a
 * última versão e se prende só ao código da demanda. Demanda sem código não faz nada.
 */
export function useEnderecoDaDemanda(demanda: any, aoFechar: () => void): void {
  const demandaRef = useRef(demanda);
  demandaRef.current = demanda;
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  const janela = useRef<Janela | null>(null);
  if (!janela.current) janela.current = { id: () => String(demandaRef.current?.id ?? ''), fechar: () => fecharRef.current(), fechando: false, tituloAntes: '', tituloMeu: '' };
  const id = String(demanda?.id ?? '');

  useEffect(() => {
    if (!id) return;
    const j = janela.current as Janela;
    j.fechando = false;
    // registra ANTES de escrever o endereço: o hospedeiro e as outras janelas conferem esta lista quando o endereço muda
    if (!janelas.includes(j)) janelas.push(j);
    const atual = chaveDaDemandaNoEndereco();
    if (atual === null || !mesmaChave(atual, id)) irParaEndereco(montarEnderecoDaDemanda(id));   // aberta por um clique (ou aviso, Menção): passo novo no histórico
    j.tituloAntes = document.title;
    j.tituloMeu = 'Demanda · ACN';
    document.title = j.tituloMeu;
    const parar = aoMudarEndereco(() => {
      if (j.fechando || !janelas.includes(j)) return;
      const c = chaveDaDemandaNoEndereco();
      if (c === null || !mesmaChave(c, j.id())) { j.fechando = true; j.fechar(); }
    }, { internas: true });
    return () => {
      parar();
      const i = janelas.indexOf(j);
      if (i >= 0) janelas.splice(i, 1);
      if (document.title === j.tituloMeu) document.title = j.tituloAntes;
      // A janela saiu (X, a tela que a abriu desmontou, ou o endereço mandou fechar). Se o endereço ainda é o dela, a barra fica com um endereço que ninguém mostra: tira.
      // Adiado um instante porque o modo de desenvolvimento desmonta e monta a MESMA janela de novo (aí ela já voltou à lista).
      setTimeout(() => {
        if (janelas.includes(j)) return;
        const c = chaveDaDemandaNoEndereco();
        if (c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();
      }, 0);
    };
  }, [id]);
}

// ── Copiar link ──

/** O endereço completo da janela da demanda, para colar numa mensagem ou e-mail: o endereço do sistema de agora (sem o `#` antigo) + `#/demanda/<código>`. */
export function enderecoCompletoDaDemanda(id: string): string {
  return window.location.href.split('#')[0] + montarEnderecoDaDemanda(id);
}

/** O botão "Copiar link" da janela da demanda: copia e avisa. A falha avisa em vermelho e manda copiar da barra (que, com a janela aberta, mostra o mesmo endereço). */
export async function copiarLinkDaDemandaComAviso(id: string): Promise<void> {
  const ok = await copiarTexto(enderecoCompletoDaDemanda(id));
  if (ok) window.alert('Link da demanda copiado. É só colar na mensagem ou no e-mail.');
  else window.alert('Não foi possível copiar o link da demanda. Copie o endereço que está na barra do navegador.');
}
