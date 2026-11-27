// A janela da viagem e o endereço dela (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fase 5, decidido com o usuário em 26/11/2026: "por cima de qualquer tela", como a OP).
//
// O endereço `#/viagem/<código>` abre a janela da viagem por cima da tela em que a pessoa está. Quem recebe o aviso de uma viagem (Adaptação, Financeiro, Comercial) muitas vezes
// nem tem a aba Viagens (`ViagemPorMencao`, de 04/11/2026), então o endereço não pode ser "dentro da tela Viagens": um link para essa pessoa cairia em "sem acesso" e ela hoje abre
// a viagem pelo aviso. A janela (`EditorDeViagem`) é aberta pela lista da tela Viagens, pelo quadro, pela Agenda, pelas Pendências do Financeiro, pela Menção, pelo card do CRM e pela
// licitação, então, como na OP (Fase 2), a regra mora na PRÓPRIA janela: `useEnderecoDaViagem` dá a qualquer um que a abra o endereço, o passo no histórico e o título da aba.
//  - ao abrir uma viagem JÁ GRAVADA, escreve `#/viagem/<código>` (um passo novo: o Voltar do navegador fecha a janela e o Avançar a reabre). Se a janela foi aberta DE UM endereço
//    (F5, link colado, Avançar), o endereço já é o dela e nada é escrito. Viagem nova (ainda sem código) não tem endereço: nada a apontar;
//  - ao ser fechada com o endereço ainda sendo o dela, o tira (um passo atrás, ou, em link colado, o endereço da tela de baixo: nunca joga a pessoa para fora do sistema);
//  - se o endereço muda por fora (Voltar, Avançar, outro endereço) e deixa de ser o dela, a janela se fecha. O X da janela da viagem nunca perguntou sobre alteração não salva
//    (só "abrir o registro" e "gerar a OS" perguntam), então o Voltar também não pergunta: é a mesma ação do X.
// A janela aberta DE UM endereço é montada pelo `ViagemDoEndereco`, que lê a viagem do banco; a lista de janelas abertas abaixo existe para ele não abrir uma segunda por cima de uma que a
// tela Viagens já abriu.
import { useEffect, useRef } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';
import { mesmaChave, montarEnderecoDaViagem, registroDoEndereco } from './Rotas';
import { tirarEnderecoDeRegistroSemTela } from './OpNoEndereco';
import { copiarTexto } from './CopiarTexto';

/** O código da viagem que o endereço de agora pede, ou `null` se o endereço não é de viagem. */
export function chaveDaViagemNoEndereco(hash: string = enderecoAtual()): string | null {
  const r = registroDoEndereco(hash);
  return r && r.registro === 'viagem' ? r.chave : null;
}

/** Abre a janela de uma viagem pelo endereço (um passo novo no histórico). Quem a monta é o `ViagemDoEndereco`. */
export function abrirViagemPeloEndereco(id: string): void {
  const c = String(id ?? '').trim();
  if (!c) return;
  irParaEndereco(montarEnderecoDaViagem(c));
}

type Janela = {
  id: () => string;             // o código da viagem que a janela mostra
  fechar: () => void;           // fecha a janela (a mesma ação do X)
  fechando: boolean;            // já mandou fechar: não manda duas vezes
  tituloAntes: string;
  tituloMeu: string;
};
const janelas: Janela[] = [];

/** Já existe uma janela aberta para esta viagem? */
export function janelaDaViagemEstaAberta(id: string): boolean {
  return janelas.some(j => mesmaChave(j.id(), id));
}

/**
 * O gancho da janela da viagem (chamado por `EditorDeViagem`). `viagem` é o que a janela mostra e `aoFechar`, a mesma ação do X. Os dois podem mudar a cada desenho:
 * o gancho guarda a última versão e se prende só ao código da viagem. Viagem sem código (a "Nova viagem", ou a cópia ainda não salva) não faz nada.
 */
export function useEnderecoDaViagem(viagem: any, aoFechar: () => void): void {
  const viagemRef = useRef(viagem);
  viagemRef.current = viagem;
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  const janela = useRef<Janela | null>(null);
  if (!janela.current) janela.current = { id: () => String(viagemRef.current?.id ?? ''), fechar: () => fecharRef.current(), fechando: false, tituloAntes: '', tituloMeu: '' };
  const id = String(viagem?.id ?? '');

  useEffect(() => {
    if (!id) return;
    const j = janela.current as Janela;
    j.fechando = false;
    // registra ANTES de escrever o endereço: o hospedeiro e as outras janelas conferem esta lista quando o endereço muda
    if (!janelas.includes(j)) janelas.push(j);
    const atual = chaveDaViagemNoEndereco();
    if (atual === null || !mesmaChave(atual, id)) irParaEndereco(montarEnderecoDaViagem(id));   // aberta por um clique (ou aviso, card, licitação): passo novo no histórico
    j.tituloAntes = document.title;
    j.tituloMeu = 'Viagem · ACN';
    document.title = j.tituloMeu;
    const parar = aoMudarEndereco(() => {
      if (j.fechando || !janelas.includes(j)) return;
      const c = chaveDaViagemNoEndereco();
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
        const c = chaveDaViagemNoEndereco();
        if (c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();
      }, 0);
    };
  }, [id]);
}

// ── Copiar link ──

/** O endereço completo da janela da viagem, para colar numa mensagem ou e-mail: o endereço do sistema de agora (sem o `#` antigo) + `#/viagem/<código>`. */
export function enderecoCompletoDaViagem(id: string): string {
  return window.location.href.split('#')[0] + montarEnderecoDaViagem(id);
}

/** O botão "Copiar link" da janela da viagem: copia e avisa. A falha avisa em vermelho e manda copiar da barra (que, com a janela aberta, mostra o mesmo endereço). */
export async function copiarLinkDaViagemComAviso(id: string): Promise<void> {
  const ok = await copiarTexto(enderecoCompletoDaViagem(id));
  if (ok) window.alert('Link da viagem copiado. É só colar na mensagem ou no e-mail.');
  else window.alert('Não foi possível copiar o link da viagem. Copie o endereço que está na barra do navegador.');
}
