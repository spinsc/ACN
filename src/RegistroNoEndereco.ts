// A janela de um registro que mora numa tela e o endereço dela (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 3, decidido com o usuário em 25/11/2026 e construído em 26/11/2026).
//
// O endereço `#/crm/card/<código>` (e `#/licitacoes/licitacao/…`, `#/compras/pedido/…`, `#/sac/os/…`) abre a janela do registro DENTRO da tela dona dele. Cada tela já abre a
// janela do seu jeito (um `useState` com o registro escolhido), e quem a abre é a lista, uma Menção, um aviso, o chat, a busca geral… então, como na janela da OP (Fase 2), a regra
// mora do lado da PRÓPRIA janela: a tela chama `useRegistroNoEndereco` uma vez e diz (a) qual registro a janela mostra agora, (b) como ler um registro pelo código,
// (c) como abri-lo e (d) como fechá-lo. O gancho cuida do resto, nos dois sentidos:
//  - a janela abriu (por qualquer caminho): escreve o endereço, um passo novo no histórico (o Voltar do navegador fecha a janela e o Avançar a reabre). Se a janela foi aberta
//    PELO endereço (F5, link colado, Voltar, Avançar), o endereço já é o dela e nada é escrito;
//  - a janela fechou (X, ou qualquer coisa que a feche) com o endereço ainda sendo o dela: tira o endereço (um passo atrás se o passo é do próprio sistema; num link colado, troca
//    pelo endereço da tela, sem criar passo: nunca joga a pessoa para fora do sistema);
//  - o endereço mudou por fora (Voltar, Avançar, outro endereço, ou o sistema escrevendo-o) e agora pede OUTRO registro desta tela: lê o registro no banco e abre; ou deixou de pedir
//    registro: fecha a janela. Uma janela de OP aberta POR CIMA da janela do registro (o endereço passa a ser `#/op/…`) não a fecha: ela continua por baixo;
//  - ao montar a tela (a tela "lê o endereço quando fica pronta", sem esperar por relógio): se o endereço pede um registro, abre.
// O registro que não existe, que a pessoa não pode ler ou cujo código não é um código: UMA mensagem ("não o encontrei, ou você não tem acesso a ele": o banco responde igual nos dois
// casos) e o endereço é limpo. Leitura que falha (banco fora do ar) diz isso, e NUNCA "não encontrei": o registro pode existir.
import { useEffect, useRef } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco, temPassoAnterior, voltarUmPasso } from './EnderecoDoNavegador';
import { ehCodigoInterno, mesmaChave, montarEndereco, montarEnderecoDoRegistroDaTela, normalizarChave, registroDaTelaNoEndereco, registroDoEndereco, type TipoDeRegistroDaTela } from './Rotas';
import { copiarTexto } from './CopiarTexto';

/** O resultado de ler um registro pelo código: `erro` preenchido = a leitura falhou; os dois vazios = não achou (não existe ou a pessoa não lê). */
export type LeituraDoRegistro = { registro: any | null; erro: string };

/** Transforma uma consulta do banco (`.maybeSingle()`) no resultado do gancho. Leitura recusada é `erro`, nunca "não achei". */
export async function lerPorCodigo(consulta: PromiseLike<{ data: any; error: any }>): Promise<LeituraDoRegistro> {
  try {
    const { data, error } = await consulta;
    if (error) return { registro: null, erro: String(error.message || 'sem resposta') };
    return { registro: data || null, erro: '' };
  } catch (e: any) {
    return { registro: null, erro: String(e?.message || 'sem resposta') };
  }
}

/** Tira o endereço do registro da barra: um passo atrás se o passo é do sistema; senão (link colado), o endereço da tela, sem criar passo. */
export function tirarEnderecoDoRegistro(tela: string): void {
  if (temPassoAnterior()) { voltarUmPasso(); return; }
  irParaEndereco(montarEndereco(tela), { substituir: true });
}

// ── a "dica" de como abrir ──
// O endereço diz QUAL registro, não em que parte dele a pessoa quer cair. As Análises (e quem as abre pelo mesmo caminho) querem o card do CRM já na aba "Análise", como sempre foi;
// um link comum abre na aba de sempre. A dica é de uso único e vale por 15 segundos: quem abre o registro a consome (`consumirDicaDeAbertura`), qualquer outra abertura a descarta.
let dica: { tela: string; tipo: TipoDeRegistroDaTela; chave: string; valor: string; em: number } | null = null;

export function guardarDicaDeAbertura(tela: string, tipo: TipoDeRegistroDaTela, chave: string, valor: string): void {
  dica = { tela, tipo, chave: normalizarChave(chave), valor, em: Date.now() };
}

/** A dica guardada para este registro (e apaga: é de uso único), ou `null`. */
export function consumirDicaDeAbertura(tela: string, tipo: TipoDeRegistroDaTela, chave: unknown): string | null {
  const d = dica;
  dica = null;
  if (!d || Date.now() - d.em > 15000) return null;
  return d.tela === tela && d.tipo === tipo && mesmaChave(d.chave, chave) ? d.valor : null;
}

// ── o gancho ──
export type EntradaDoRegistro = {
  tela: string;                                           // id interno da tela dona (`crm`, `licitacoes`, `compras`, `sac`)
  tipo: TipoDeRegistroDaTela;                             // `card`, `licitacao`, `pedido`, `os`
  rotulo: string;                                         // para as mensagens, com o artigo: "o card", "a licitação", "o pedido de compra", "a OS"
  aberto: string | null;                                  // o código do registro que a janela mostra agora (`null` = nenhuma janela)
  ler: (chave: string) => Promise<LeituraDoRegistro>;     // lê o registro pelo código (a tela sabe a tabela e o que anexar)
  mostrar: (registro: any) => void;                       // abre a janela com o registro lido (o mesmo que o clique na lista faz)
  fechar: () => void;                                     // fecha a janela (a mesma ação do X, com o que ela faz ao fechar)
};

/** A mensagem de quando a janela não abre. Começa com "Não foi possível" para sair vermelha e ficar parada na tela até a pessoa fechar (Feedback.tsx). */
export function mensagemDeRegistroNaoAberto(rotulo: string, erro: string): string {
  const artigo = rotulo.startsWith('a ') ? 'a' : 'o';
  const ele = artigo === 'a' ? 'ela' : 'ele';
  return erro
    ? `Não foi possível abrir ${rotulo}: a leitura falhou (${erro}). Tente de novo.`
    : `Não foi possível abrir ${rotulo}: não ${artigo} encontrei, ou você não tem acesso a ${ele}.`;
}

/**
 * O gancho da janela do registro (chamado uma vez pela tela dona). Todos os campos podem mudar a cada desenho: o gancho guarda a última versão e se prende só ao código do
 * registro que está aberto.
 */
export function useRegistroNoEndereco(entrada: EntradaDoRegistro): void {
  const ref = useRef(entrada);
  ref.current = entrada;
  const leitura = useRef(0);                    // numera as leituras: só a mais recente vale (o Voltar durante uma leitura não pode abrir a janela depois)
  const fechandoPara = useRef<string | null>(null);   // o código que já mandei fechar: não mando duas vezes

  // ── o endereço manda: ao montar e a cada mudança (Voltar, Avançar, digitado, ou escrito pelo próprio sistema) ──
  useEffect(() => {
    const abrirDoEndereco = (chave: string) => {
      const minha = ++leitura.current;
      const { tela, rotulo, ler, mostrar } = ref.current;
      const naoAbriu = (erro: string) => {
        if (minha !== leitura.current) return;     // o endereço mudou enquanto lia: este resultado não vale mais
        window.alert(mensagemDeRegistroNaoAberto(rotulo, erro));
        tirarEnderecoDoRegistro(tela);
      };
      // um texto que nem é um código não existe: nem se pergunta ao banco (que responderia "erro de sintaxe", que diria "a leitura falhou" sem ser verdade)
      if (!ehCodigoInterno(chave)) { naoAbriu(''); return; }
      ler(chave.trim()).then(r => {
        if (minha !== leitura.current) return;     // outra abertura ou o Voltar chegou antes
        if (r.registro) { mostrar(r.registro); return; }
        naoAbriu(r.erro);
      }).catch(e => naoAbriu(String(e?.message || 'sem resposta')));
    };

    const tratar = () => {
      const atual = ref.current;
      const r = registroDaTelaNoEndereco(enderecoAtual(), atual.tela);
      if (r && r.tipo === atual.tipo) {
        if (atual.aberto && mesmaChave(atual.aberto, r.chave)) { leitura.current++; return; }   // a janela já mostra este registro
        abrirDoEndereco(r.chave);
        return;
      }
      leitura.current++;                           // o endereço deixou de pedir um registro desta tela: leitura em andamento não vale mais
      if (!atual.aberto) return;
      // uma janela de OP (ou de outro registro sem tela dona) aberta POR CIMA desta: a minha continua por baixo, como o lote por baixo de uma OP
      if (registroDoEndereco(enderecoAtual())) return;
      if (fechandoPara.current === atual.aberto) return;
      fechandoPara.current = atual.aberto;
      atual.fechar();
    };

    tratar();                                      // ao montar: F5, link colado, ou Voltar/Avançar que trouxe a pessoa a esta tela
    return aoMudarEndereco(tratar, { internas: true });
  }, []);

  // ── a janela abriu ou fechou: o endereço acompanha ──
  const aberto = entrada.aberto;
  useEffect(() => {
    if (!aberto) return;
    fechandoPara.current = null;
    const { tela, tipo } = ref.current;
    const r = registroDaTelaNoEndereco(enderecoAtual(), tela);
    if (!(r && r.tipo === tipo && mesmaChave(r.chave, aberto))) {
      irParaEndereco(montarEnderecoDoRegistroDaTela(tela, tipo, aberto));       // aberta por um clique (ou Menção, aviso…): passo novo no histórico
    }
    return () => {
      // A janela saiu (X, o endereço mandou fechar, ou foi trocada por outro registro). Se o endereço ainda é o dela, a barra ficou com um endereço que ninguém mostra: tira.
      // Adiado um instante: o modo de desenvolvimento desmonta e monta o mesmo efeito de novo, e trocar de registro roda este fim e o começo do próximo juntos.
      setTimeout(() => {
        const atual = ref.current;
        if (atual.aberto) return;                  // outra janela (ou a mesma de novo) está aberta
        const r2 = registroDaTelaNoEndereco(enderecoAtual(), atual.tela);
        if (r2 && r2.tipo === atual.tipo && mesmaChave(r2.chave, aberto)) tirarEnderecoDoRegistro(atual.tela);
      }, 0);
    };
  }, [aberto]);
}

// ── Copiar link ──

/** O endereço completo do registro, para colar numa mensagem ou e-mail: o endereço do sistema de agora (sem o `#` antigo) + `#/crm/card/<código>`. */
export function enderecoCompletoDoRegistro(tela: string, tipo: TipoDeRegistroDaTela, chave: string): string {
  return window.location.href.split('#')[0] + montarEnderecoDoRegistroDaTela(tela, tipo, chave);
}

/**
 * O botão "Copiar link" da janela: copia e avisa. `de` é o "do card", "da licitação", "do pedido", "da OS". A falha avisa em vermelho e manda copiar da barra
 * (que, com a janela aberta, mostra o mesmo endereço).
 */
export async function copiarLinkDoRegistroComAviso(tela: string, tipo: TipoDeRegistroDaTela, chave: string, de: string): Promise<void> {
  const ok = await copiarTexto(enderecoCompletoDoRegistro(tela, tipo, chave));
  if (ok) window.alert(`Link ${de} copiado. É só colar na mensagem ou no e-mail.`);
  else window.alert(`Não foi possível copiar o link ${de}. Copie o endereço que está na barra do navegador.`);
}
