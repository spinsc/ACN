// O filtro de uma tela e o endereço dele (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fase 5, parte 3, 26/11/2026).
//
// É o mesmo `useState` do filtro com a barra do navegador por baixo: `const [saida, setSaida] = useFiltroNoEndereco({ tela: 'viagens', chave: 'saida', padrao: 'todas' })`.
// O filtro mora depois do `?` do endereço (`#/viagens/lista?saida=semana`) e o caminho (tela, aba, registro) segue como sempre. O que o gancho faz, nos dois sentidos:
//  - a pessoa muda o filtro (`setFiltro`): o endereço passa a mostrá-lo, TROCANDO o endereço do passo atual (nenhum passo novo no histórico: filtrar não é navegar). O valor padrão
//    some do endereço, então a tela sem filtro continua sendo `#/viagens`;
//  - o endereço muda por fora (Voltar, Avançar, link colado, F5): o filtro passa a ser o do endereço (o endereço MANDA; sem a chave, o padrão). Valor que a tela não aceita (`validar`)
//    vira o padrão e a chave suja é tirada da barra, sem passo;
//  - ao abrir a tela: o filtro de partida é o do endereço; sem ele, o padrão. Sair da tela pelo menu e voltar abre sem filtro, como sempre abriu (decidido com o usuário em 26/11/2026:
//    "lembrar ao voltar" é pelo endereço, que o F5, o Voltar e o Avançar do navegador e um link colado já trazem; não se guarda filtro no navegador, para um filtro esquecido não esconder registro);
//  - a barra nunca mente: quem escreve o endereço de uma aba, de um registro ou da tela (`irParaTela`, a troca de aba, a janela de uma licitação) não conhece os filtros e os apaga; o gancho
//    percebe e põe o filtro de volta, ainda sem passo novo. Por isso o filtro de uma tela (Viagens, Licitações) sobrevive à troca de visão e à janela de um registro, e o de uma aba (`aba`:
//    Financeiro, os relatórios) volta à barra quando a pessoa volta à aba. O que NÃO sobrevive é sair da tela: ela desmonta e reabre limpa.
// Filtro de uma tela que não é a do endereço de agora (a janela de uma OP aberta por cima) não escreve na barra.
import { useCallback, useEffect, useRef, useState } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';
import { abaNoEndereco, abasDoNivel, lerFiltros, montarEnderecoComFiltros, nomeNoEndereco, separarConsulta, telaDoEndereco } from './Rotas';

export type EntradaDoFiltro = {
  tela: string;                              // id interno da tela (o mesmo de `ABAS_DAS_TELAS`)
  chave: string;                             // o nome do filtro no endereço (curto, minúsculo: `saida`, `mes`, `setor`)
  padrao: string;                            // o valor de quem não filtrou: não aparece no endereço
  aba?: string;                              // filtro de UMA aba da tela (id da aba, nível 0): o gancho só age quando o endereço é dessa aba (sem isto, o filtro de um relatório limparia o do vizinho); sem `aba`, vale em qualquer parte da tela
  validar?: (valor: string) => boolean;      // a tela aceita este valor? (valor inválido do endereço vira o padrão)
};

type Atualizacao = string | ((atual: string) => string);

export function useFiltroNoEndereco(entrada: EntradaDoFiltro): [string, (novo: Atualizacao) => void] {
  const ref = useRef(entrada);
  ref.current = entrada;
  const nomeDaTela = () => nomeNoEndereco(ref.current.tela);
  const aceita = (v: string) => !ref.current.validar || ref.current.validar(v);
  /** O endereço é da aba deste filtro? (só vale quando a entrada diz `aba`; a aba sem nome no endereço é a padrão da tela) */
  const ehDaAba = (hash: string): boolean => {
    const { tela, aba } = ref.current;
    if (aba === undefined) return true;
    const l = abaNoEndereco(hash, tela, 0);
    return l.tipo === 'aba' && (l.aba ?? abasDoNivel(tela, 0)?.padrao) === aba;
  };

  /** O valor que um endereço diz para ESTE filtro; `null` se o endereço não é desta tela (ou desta aba): então o filtro não é da conta dele. */
  const doEndereco = (hash: string = enderecoAtual()): { valor: string; limpo: boolean } | null => {
    if (telaDoEndereco(hash) !== nomeDaTela() || !ehDaAba(hash)) return null;
    const f = lerFiltros(hash);
    if (!Object.prototype.hasOwnProperty.call(f, ref.current.chave)) return { valor: ref.current.padrao, limpo: true };
    const v = f[ref.current.chave];
    return aceita(v) ? { valor: v, limpo: true } : { valor: ref.current.padrao, limpo: false };
  };

  const [valor, setValorEstado] = useState<string>(() => doEndereco()?.valor ?? entrada.padrao);
  const valorRef = useRef(valor);
  valorRef.current = valor;

  /** Escreve (ou tira) o filtro no endereço de agora, trocando o passo atual. Só se o endereço de agora é desta tela (e desta aba). */
  const gravar = useCallback((v: string): void => {
    const atual = enderecoAtual();
    if (telaDoEndereco(atual) !== nomeDaTela() || !ehDaAba(atual)) return;
    const f = lerFiltros(atual);
    const { chave, padrao } = ref.current;
    // valor vazio nunca aparece no endereço (volta ao padrão ao ler): a tela cujo "sem filtro" é vazio e o padrão não é usa uma palavra no lugar do vazio (ex.: `todos`)
    if (v === padrao) delete f[chave]; else f[chave] = v;
    const alvo = montarEnderecoComFiltros(separarConsulta(atual)[0], f);
    if (alvo !== atual) irParaEndereco(alvo, { substituir: true });
  }, []);

  const setFiltro = useCallback((novo: Atualizacao): void => {
    const proximo = typeof novo === 'function' ? novo(valorRef.current) : novo;
    if (proximo === valorRef.current) return;
    valorRef.current = proximo;
    setValorEstado(proximo);
    gravar(proximo);
  }, [gravar]);

  useEffect(() => {
    /** A barra mostra o filtro como a tela o tem: põe de volta o que alguém apagou (a aba, o registro e a tela não o conhecem) e arruma o que veio torto de um link (valor que a tela não aceita,
     *  vazio, o próprio padrão escrito). `gravar` não faz nada se a barra já está certa, então não há laço entre os filtros da mesma tela. Sem passo novo. */
    const reafirmar = () => {
      if (doEndereco()) gravar(valorRef.current);
    };
    reafirmar();                                 // a aba da tela pode ter escrito o endereço antes de este gancho se inscrever
    return aoMudarEndereco((hash, origem) => {
      const d = doEndereco(hash);
      if (!d) return;
      if (origem === 'navegador') {              // Voltar, Avançar ou endereço digitado: o endereço manda
        if (d.valor !== valorRef.current) { valorRef.current = d.valor; setValorEstado(d.valor); }
        if (!d.limpo) gravar(d.valor);           // valor que a tela não aceita: tira a chave suja da barra
      } else {
        reafirmar();
      }
    }, { internas: true });
  }, [gravar]);

  return [valor, setFiltro];
}
