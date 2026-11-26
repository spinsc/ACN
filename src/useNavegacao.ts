// Qual tela está aberta e como trocar de tela (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 1, decidido com o usuário em 25/11/2026).
//
// Antes: a tela era uma variável do `DashboardTab` trocada por cerca de 20 pontos (menu, logo, busca geral, painéis, chat, atalhos internos),
// sem nada na barra do navegador (F5 voltava ao Início; Voltar e Avançar não funcionavam; não se mandava link).
// Agora: UMA função (`irParaTela`) troca de tela e escreve o endereço; a barra de endereço também manda (F5, Voltar, Avançar e link colado).
//
// Decisões do usuário no mesmo dia que moram aqui:
//  - todo atalho passa a conferir a permissão (hoje só "ir para a aba" conferia): quem não tem a tela vê um aviso, nunca uma tela vazia;
//  - num link, o "sem acesso" espera a releitura das permissões do banco (as guardadas no navegador podem estar velhas): "conferindo o acesso";
//  - voltar e avançar reabrem a tela do zero (como já era ao trocar de aba pelo menu): aceito por ora.
//
// Fase 2 (25/11/2026): o endereço de um REGISTRO (`#/op/<número>`) não é tela: a tela fica como está (na abertura da página, a tela inicial) e a
// janela da OP abre por cima dela, quem cuida disso é o `OpDoEndereco` e a própria janela da OP (`OpNoEndereco.ts`). Aqui só não se mexe na tela.
//
// Fase 3 (26/11/2026): licitação, card do CRM, compra e OS moram DENTRO de uma tela (`#/crm/card/<código>`). Dois acréscimos, ambos sobre o que já existia:
//  - `irParaRegistro` troca de tela e escreve o endereço do registro num passo só (a busca geral, as Análises e o Cotações abrem card, licitação e OS por ela);
//  - `irParaTela` traduz o recado interno `__acnDeepLink` ("abra este registro") em endereço quando o recado é de um registro da tela de destino: as Menções, o chat, os avisos e os
//    vínculos continuam fazendo o que sempre fizeram (gravar o recado e trocar de tela) e ganham o endereço, também num passo só. Quem lê o endereço e abre a janela é a própria tela
//    (`RegistroNoEndereco.ts`). Trocar para a tela em que a pessoa JÁ está, com a janela de um registro dela aberta, não mexe em nada (o mesmo que acontecia: a janela continua aberta).
import { useCallback, useEffect, useRef, useState } from 'react';
import { decidirEndereco, enderecoEhDaTela, montarEndereco, montarEnderecoDoRegistroDaTela, registroDoRecado, type ContextoDoEndereco, type Decisao, type TipoDeRegistroDaTela } from './Rotas';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';
import { guardarDicaDeAbertura } from './RegistroNoEndereco';

/** Por que nenhuma tela está aberta: o sistema ainda confere o acesso da pessoa, ou ela não tem a tela do link. */
export type Bloqueio = { tipo: 'conferindo' | 'semAcesso'; tela: string };

export type EntradaDaNavegacao = {
  ids: readonly string[];                 // as telas que existem no menu
  podeVer: (id: string) => boolean;       // a mesma regra do menu
  telaInicial: () => string;              // a tela de abertura da pessoa
  acessoConferido: boolean;               // as permissões já foram relidas do banco?
  avisar: (texto: string) => void;        // aviso no canto da tela (o `alert` do sistema)
  chavePermissoes: string;                // muda quando as permissões mudam (nova leitura do banco): reavalia um link que estava esperando
};

/** Se a releitura das permissões não terminar (banco fora do ar), decide com o que há, depois deste tempo, em vez de ficar "conferindo" para sempre. */
const ESPERA_MAXIMA_DA_CONFERENCIA_MS = 8000;

const TEXTO_SEM_ACESSO = 'Você não tem acesso a essa aba. Peça a liberação a um Admin.';

function telaDaDecisao(d: Decisao, telaInicial: () => string): string {
  if (d.tipo === 'abrir') return d.tela;
  if (d.tipo === 'desconhecido') return telaInicial();
  if (d.tipo === 'registro') return telaInicial();   // a OP do endereço abre por cima; por baixo, na abertura da página, fica a tela inicial
  return '';   // conferindo ou sem acesso: nenhuma tela aberta
}

function bloqueioDaDecisao(d: Decisao): Bloqueio | null {
  return d.tipo === 'conferindo' || d.tipo === 'semAcesso' ? { tipo: d.tipo, tela: d.tela } : null;
}

export function useNavegacao(entrada: EntradaDaNavegacao) {
  const [esperaAcabou, setEsperaAcabou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEsperaAcabou(true), ESPERA_MAXIMA_DA_CONFERENCIA_MS);
    return () => clearTimeout(t);
  }, []);

  // sempre a última versão (as permissões mudam depois que a tela abre): os ouvintes e as funções estáveis leem daqui
  const ctx: ContextoDoEndereco & { avisar: (t: string) => void } = {
    ids: entrada.ids, podeVer: entrada.podeVer, telaInicial: entrada.telaInicial, avisar: entrada.avisar,
    acessoConferido: entrada.acessoConferido || esperaAcabou,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // o que a barra de endereço pedia no instante em que a tela abriu
  const inicial = useRef<Decisao | null>(null);
  if (inicial.current === null) inicial.current = decidirEndereco(enderecoAtual(), ctxRef.current);
  const [tela, setTela] = useState<string>(() => telaDaDecisao(inicial.current as Decisao, entrada.telaInicial));
  const [bloqueio, setBloqueio] = useState<Bloqueio | null>(() => bloqueioDaDecisao(inicial.current as Decisao));
  const bloqueioRef = useRef(bloqueio);
  bloqueioRef.current = bloqueio;

  /** Põe na tela o que a decisão manda (o endereço da barra NÃO ganha passo novo: o passo já foi dado pelo navegador). */
  const aplicar = useCallback((d: Decisao) => {
    const atual = ctxRef.current;
    if (d.tipo === 'abrir') {
      setTela(d.tela); setBloqueio(null);
      if (d.corrigirEndereco) irParaEndereco(montarEndereco(d.tela), { substituir: true });
    } else if (d.tipo === 'registro') {
      // a janela da OP é do `OpDoEndereco`; a tela de baixo fica como está. Só se havia o aviso de "conferindo/sem acesso" (de OUTRO endereço, que
      // já não está na barra) a tela inicial aparece por baixo da janela, em vez de a janela abrir por cima de um aviso que não vale mais
      if (bloqueioRef.current) { setTela(atual.telaInicial()); setBloqueio(null); }
    } else if (d.tipo === 'desconhecido') {
      const t = atual.telaInicial();
      atual.avisar('Não reconheci este endereço do sistema. Abri a tela inicial.');
      setTela(t); setBloqueio(null);
      irParaEndereco(montarEndereco(t), { substituir: true });
    } else {
      setTela('');
      // o mesmo bloqueio de novo não refaz a tela (a reavaliação roda na abertura e a cada releitura das permissões)
      setBloqueio(prev => (prev && prev.tipo === d.tipo && prev.tela === d.tela ? prev : { tipo: d.tipo, tela: d.tela }));
    }
  }, []);

  // na abertura: o que a decisão inicial pede para a barra (endereço vazio passa a mostrar a tela inicial; endereço desconhecido é trocado, com aviso).
  // O estado da tela já nasceu certo (acima); isto só faz o que mexe fora dela, uma vez (o modo de desenvolvimento roda os efeitos duas vezes).
  const abriu = useRef(false);
  useEffect(() => {
    if (abriu.current) return;
    abriu.current = true;
    const d = inicial.current as Decisao;
    if (d.tipo === 'abrir' && d.corrigirEndereco) irParaEndereco(montarEndereco(d.tela), { substituir: true });
    if (d.tipo === 'desconhecido') {
      ctxRef.current.avisar('Não reconheci este endereço do sistema. Abri a tela inicial.');
      irParaEndereco(montarEndereco(telaDaDecisao(d, entrada.telaInicial)), { substituir: true });
    }
  }, []);

  // Voltar, Avançar e endereço digitado: a barra manda
  useEffect(() => aoMudarEndereco(hash => aplicar(decidirEndereco(hash, ctxRef.current))), [aplicar]);

  // link que esperava a conferência do acesso (ou que foi recusado): reavalia quando a releitura do banco termina ou as permissões mudam
  useEffect(() => {
    if (!bloqueio) return;
    aplicar(decidirEndereco(enderecoAtual(), ctxRef.current));
  }, [ctx.acessoConferido, entrada.chavePermissoes]);

  /**
   * Abre uma tela (o menu, o logo e todos os atalhos internos passam por aqui). Confere a permissão: sem ela, avisa e não troca nada
   * (e apaga o recado de uso único `__acnDeepLink`, que ninguém mais vai ler e poderia abrir um registro numa tela montada depois).
   * Devolve se a tela abriu. `substituir` troca o endereço sem criar passo no histórico.
   */
  const irParaTela = useCallback((id: string, opcoes: { substituir?: boolean } = {}): boolean => {
    const atual = ctxRef.current;
    const recusar = (texto: string) => {
      (window as unknown as { __acnDeepLink?: unknown }).__acnDeepLink = null;
      atual.avisar(texto);
      return false;
    };
    if (!atual.ids.includes(id)) return recusar('Não encontrei a tela de destino.');
    if (!atual.podeVer(id)) return recusar(TEXTO_SEM_ACESSO);
    // Fase 3: o recado "abra este registro" (Menção, chat, aviso, vínculo) que é de um registro DESTA tela vira o endereço dele, num passo só; apaga-se o recado para a tela não
    // abrir o registro uma segunda vez (ela lê o endereço, ao montar ou já montada, pelo gancho `useRegistroNoEndereco`)
    const global = window as unknown as { __acnDeepLink?: unknown };
    const doRecado = registroDoRecado(global.__acnDeepLink, id);
    if (doRecado) global.__acnDeepLink = null;
    if (doRecado?.dica) guardarDicaDeAbertura(id, doRecado.tipo, doRecado.chave, doRecado.dica);   // a OS de uma Menção abre o Acompanhamento, não o resumo
    setTela(id); setBloqueio(null);
    if (doRecado) irParaEndereco(montarEnderecoDoRegistroDaTela(id, doRecado.tipo, doRecado.chave), { substituir: !!opcoes.substituir });
    // Fase 4: o endereço de agora já é desta tela (a aba aberta, ou a janela de um registro dela): fica como está. Clicar no menu na tela em que se está nunca derrubou a aba nem fechou a janela
    // (a tela não é montada de novo), e o endereço não pode contradizer isso passando a mostrar a tela sem aba.
    else if (!enderecoEhDaTela(enderecoAtual(), id)) irParaEndereco(montarEndereco(id), { substituir: !!opcoes.substituir });
    return true;
  }, []);

  /**
   * Abre um registro que mora numa tela (a busca geral, as Análises e o Cotações abrem card, licitação e OS por aqui): confere a permissão da tela como `irParaTela`, troca de tela e escreve
   * o endereço do registro num passo só. Quem abre a janela é a tela, lendo o endereço. `dica` (uso único) diz em que parte do registro cair (a aba "Análise" do card do CRM).
   * Devolve se abriu. Registro cujo código não é de um registro, ou que não existe, a tela diz ao ler.
   */
  const irParaRegistro = useCallback((tela: string, tipo: TipoDeRegistroDaTela, chave: string, opcoes: { substituir?: boolean; dica?: string } = {}): boolean => {
    const atual = ctxRef.current;
    const recusar = (texto: string) => {
      (window as unknown as { __acnDeepLink?: unknown }).__acnDeepLink = null;
      atual.avisar(texto);
      return false;
    };
    if (!atual.ids.includes(tela)) return recusar('Não encontrei a tela de destino.');
    if (!atual.podeVer(tela)) return recusar(TEXTO_SEM_ACESSO);
    if (opcoes.dica) guardarDicaDeAbertura(tela, tipo, chave, opcoes.dica);
    setTela(tela); setBloqueio(null);
    irParaEndereco(montarEnderecoDoRegistroDaTela(tela, tipo, chave), { substituir: !!opcoes.substituir });
    return true;
  }, []);

  return { tela, bloqueio, irParaTela, irParaRegistro };
}
