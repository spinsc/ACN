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
import { useCallback, useEffect, useRef, useState } from 'react';
import { decidirEndereco, montarEndereco, type ContextoDoEndereco, type Decisao } from './Rotas';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';

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

  /** Põe na tela o que a decisão manda (o endereço da barra NÃO ganha passo novo: o passo já foi dado pelo navegador). */
  const aplicar = useCallback((d: Decisao) => {
    const atual = ctxRef.current;
    if (d.tipo === 'abrir') {
      setTela(d.tela); setBloqueio(null);
      if (d.corrigirEndereco) irParaEndereco(montarEndereco(d.tela), { substituir: true });
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
    setTela(id); setBloqueio(null);
    irParaEndereco(montarEndereco(id), { substituir: !!opcoes.substituir });
    return true;
  }, []);

  return { tela, bloqueio, irParaTela };
}
