// A aba de dentro de uma tela e o endereço dela (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 4, construída em 26/11/2026).
//
// Cada tela guarda a aba aberta num `useState` dela (`aba`, `secao`, `visao`…). Este gancho é o mesmo `useState` com a barra do navegador por baixo: quem o usa troca UMA linha da tela
// (`const [aba, setAba] = useAbaNoEndereco({ tela: 'compras' })`) e o resto da tela segue como estava. O que ele faz, nos dois sentidos:
//  - a pessoa muda de aba (`setAba`): o endereço passa a mostrar a aba (`#/compras/fornecedores`), um passo novo no histórico (o Voltar do navegador volta à aba de antes e o Avançar a reabre).
//    A aba padrão da tela some do endereço (`#/compras`), então o endereço de sempre continua sendo o da aba de sempre;
//  - o endereço muda por fora (Voltar, Avançar, link colado, F5): a aba passa a ser a do endereço. Endereço sem aba = a padrão. Aba que a tela não tem, ou que a pessoa não pode ver
//    (`permitida`), vira a padrão e a barra é corrigida sem criar passo;
//  - ao abrir a tela: a aba de partida é a do endereço; sem ela, o que a tela já usava para partir (`inicial`: a última aba guardada no navegador, um recado interno…); sem isso, a padrão.
//    A barra passa a mostrar essa aba, sem criar passo (a pessoa que clicou no menu da tela vê a aba em que a tela sempre abriu, e o endereço acompanha);
//  - o endereço de um REGISTRO da tela (`#/crm/card/<código>`) ou da OP é uma janela POR CIMA da aba: nada disso mexe na aba nem a aba escreve por cima do endereço da janela.
//    Fechar a janela num link colado troca o endereço pelo da tela sem aba (`RegistroNoEndereco.ts`): este gancho percebe e põe a aba aberta de volta na barra.
// Dois níveis no máximo: `nivel: 1` + `pai` é a aba de DENTRO de uma aba (`#/rh/ponto/mes`); o componente que a usa só existe enquanto a aba de fora está aberta.
// O quadro das abas de cada tela está em `Rotas.ts` (`ABAS_DAS_TELAS`); tela que não está lá fica como um `useState` comum (o endereço não é tocado).
import { useCallback, useEffect, useRef, useState } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco } from './EnderecoDoNavegador';
import { abaNoEndereco, abasDoNivel, montarEnderecoDaAba, montarEnderecoDaAbaDeFora, separarConsulta, type AbasDeUmNivel } from './Rotas';

export type EntradaDaAba = {
  tela: string;                                      // id interno da tela (a mesma chave de `ABAS_DAS_TELAS`)
  nivel?: 0 | 1;                                     // 0 = a aba da tela (o padrão); 1 = a aba de dentro da aba `pai`
  pai?: string;                                      // nível 1: o id da aba de fora a que estas abas pertencem
  inicial?: () => string | null | undefined;         // de onde a tela parte quando o endereço não diz a aba (o que ela já guardava); chamada uma vez por abertura
  permitida?: (aba: string) => boolean;              // a pessoa pode ver esta aba? (aba escondida por permissão nunca abre pelo endereço)
};

type Atualizacao = string | ((atual: string) => string);

// O terceiro item é a troca SEM passo novo no histórico (Fase 5, parte 2): para a tela que, depois de saber quem a pessoa é, corrige a aba que o endereço pediu (o Ponto de quem só vê o próprio).
export function useAbaNoEndereco(entrada: EntradaDaAba): [string, (nova: Atualizacao) => void, (nova: string) => void] {
  // sempre a última versão: o ouvinte do endereço e as funções estáveis leem daqui
  const ref = useRef(entrada);
  ref.current = entrada;

  const nivelDe = (): 0 | 1 => ref.current.nivel ?? 0;
  const quadro = (): AbasDeUmNivel | null => abasDoNivel(ref.current.tela, nivelDe(), ref.current.pai);
  /** `a` é uma aba que existe neste nível e que a pessoa pode ver? */
  const valida = (a: unknown): a is string => {
    const n = quadro();
    return typeof a === 'string' && !!n && n.abas.includes(a) && (!ref.current.permitida || ref.current.permitida(a));
  };
  const lerDoEndereco = (hash: string = enderecoAtual()) => abaNoEndereco(hash, ref.current.tela, nivelDe(), ref.current.pai);
  const caminho = (aba: string): string[] => (nivelDe() === 0 ? [aba] : [String(ref.current.pai), aba]);

  /** A aba de partida: a do endereço; senão a que a tela já usava; senão a padrão. Tela sem quadro: só o que ela usava. */
  const partida = (): string => {
    const dele = ref.current.inicial ? ref.current.inicial() : null;     // sempre chamada: o que ela faz (ler e apagar um recado) acontece uma vez, valha o endereço ou não
    const n = quadro();
    if (!n) return String(dele ?? '');
    const lido = lerDoEndereco();
    if (lido.tipo === 'aba' && valida(lido.aba)) return lido.aba;
    return valida(dele) ? dele : n.padrao;
  };

  const [aba, setAbaEstado] = useState<string>(partida);
  const abaRef = useRef(aba);
  abaRef.current = aba;
  const quemSou = useRef(entrada.tela + '|' + (entrada.pai ?? ''));

  /** Põe na barra a aba `valor`. `substituir` troca o endereço do passo atual (sem passo novo). Não escreve por cima de outra tela, de uma janela de OP ou de um registro. */
  const alinhar = (valor: string, substituir: boolean): void => {
    if (!quadro() || lerDoEndereco().tipo === 'fora') return;
    // aba de fora que tem abas de dentro: se o endereço de agora já é desta aba de fora, a de dentro fica (o gancho de dentro roda antes e já escreveu a dela)
    const alvo = nivelDe() === 0 ? montarEnderecoDaAbaDeFora(enderecoAtual(), ref.current.tela, valor) : montarEnderecoDaAba(ref.current.tela, caminho(valor));
    // Fase 5, parte 3 (26/11/2026): o caminho já é este e só a consulta (`?saida=semana`, os filtros) é de outro: não se mexe, senão o link colado perderia o filtro ao abrir a tela.
    if (separarConsulta(enderecoAtual())[0] === alvo) return;
    irParaEndereco(alvo, { substituir });
  };

  const setAba = useCallback((nova: Atualizacao): void => {
    const atual = abaRef.current;
    const valor = typeof nova === 'function' ? nova(atual) : nova;
    if (valor === atual) return;
    abaRef.current = valor;                         // duas trocas seguidas no mesmo clique (a segunda lê a primeira)
    setAbaEstado(valor);
    if (valida(valor)) alinhar(valor, false);       // passo novo no histórico; valor que a tela inventou fora do quadro fica só no estado
  }, []);

  /** Troca a aba e corrige a barra SEM passo novo (a aba que o endereço pediu não valia para esta pessoa). */
  const substituirAba = useCallback((nova: string): void => {
    if (nova === abaRef.current) return;
    abaRef.current = nova;
    setAbaEstado(nova);
    if (valida(nova)) alinhar(nova, true);
  }, []);

  useEffect(() => {
    if (!quadro()) return;
    // O mesmo componente atendendo outra tela (as telas de setor dividem um componente) ou outra aba de fora: recomeça da partida da nova.
    // Só quando MUDA: o modo de desenvolvimento roda este efeito duas vezes seguidas com a mesma tela, e `inicial` não pode ser chamada de novo.
    const chave = ref.current.tela + '|' + (ref.current.pai ?? '');
    if (quemSou.current !== chave) {
      quemSou.current = chave;
      const nova = partida();
      if (nova !== abaRef.current) { abaRef.current = nova; setAbaEstado(nova); }
    }
    alinhar(abaRef.current, true);                  // a barra mostra a aba de partida, sem criar passo

    return aoMudarEndereco((hash, origem) => {
      const n = quadro();
      if (!n) return;
      const lido = lerDoEndereco(hash);
      if (lido.tipo === 'fora') return;             // outra tela, ou uma janela por cima: a aba fica como está
      const atual = abaRef.current;
      const dita = lido.aba && valida(lido.aba) ? lido.aba : n.padrao;
      if (origem === 'sistema') {
        // O próprio sistema escreveu um endereço desta tela. O que este gancho escreve já é o da aba aberta; o que outro escreve (a barra sem aba, ao fechar
        // a janela de um registro num link colado) deixaria a barra mentindo: ela volta a mostrar a aba aberta.
        if (dita !== atual) alinhar(atual, true);
        return;
      }
      // Voltar, Avançar ou endereço digitado: o endereço manda
      if (dita !== atual) { abaRef.current = dita; setAbaEstado(dita); }
      if (lido.invalida || (lido.aba && !valida(lido.aba))) alinhar(dita, true);   // aba que não existe ou que a pessoa não vê: a barra é corrigida
    }, { internas: true });
  }, [entrada.tela, entrada.nivel, entrada.pai]);

  return [aba, setAba, substituirAba];
}
