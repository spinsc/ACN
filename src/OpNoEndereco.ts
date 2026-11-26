// A janela da OP e o endereço dela (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 2, decidido com o usuário em 25/11/2026).
//
// O endereço `#/op/<número>` abre a janela da OP por cima da tela em que a pessoa está. A janela (`OplDetalheModal`) é aberta por 11 lugares do sistema
// (a lista de cada setor, o painel de Avisos, o card do CRM, a busca geral, o número clicável `LinkOpl`…), então a regra mora na PRÓPRIA janela, no
// gancho `useEnderecoDaOp`: qualquer um que a abra ganha o endereço, o passo no histórico e o título da aba sem mudar nada. O que o gancho faz:
//  - ao abrir, escreve `#/op/<número>` (um passo novo no histórico: o Voltar do navegador fecha a janela e o Avançar a reabre). Se a janela
//    foi aberta DE UM endereço (F5, link colado, Avançar), o endereço já é o dela e nada é escrito; se ele trazia o código interno (uuid), é trocado pelo número;
//  - ao ser fechada (X da janela, ou qualquer coisa que a desmonte) com o endereço ainda sendo o dela, o tira: volta um passo se o passo é do próprio
//    sistema; num link colado (sem passo anterior dentro do sistema) troca pelo endereço da tela de baixo, para nunca jogar a pessoa para fora do sistema;
//  - se o endereço muda por fora (Voltar, Avançar, outro endereço, ou o sistema trocando de tela) e deixa de ser o dela, a janela se fecha;
//  - o título da aba vira "OP <número> · ACN" enquanto ela está aberta.
// A janela aberta DE UM endereço (e não por um módulo) é montada pelo `OpDoEndereco`, que lê a OP do banco; esta lista de janelas abertas
// existe para ele não abrir uma segunda por cima de uma que um módulo já abriu, e para uma OP aberta de dentro de outra (o lote) não fechar a de baixo.
import { useEffect, useRef } from 'react';
import { aoMudarEndereco, enderecoAtual, irParaEndereco, temPassoAnterior, voltarUmPasso } from './EnderecoDoNavegador';
import { mesmaChave, montarEndereco, montarEnderecoDaOp, registroDoEndereco } from './Rotas';
import { copiarTexto } from './CopiarTexto';

/** A chave da OP no endereço: o número que a equipe usa (A1750.2611); se por algum motivo ela não tem número, o código interno. */
export function chaveDaOp(op: any): string {
  return String(op?.opl || op?.id || '').trim();
}

/** A chave da OP que o endereço de agora pede, ou `null` se o endereço não é de OP. */
export function chaveDaOpNoEndereco(hash: string = enderecoAtual()): string | null {
  const r = registroDoEndereco(hash);
  return r && r.registro === 'op' ? r.chave : null;
}

// ── a tela que fica por baixo da janela ──
// Num link colado, fechar a janela troca o endereço pelo da tela de baixo (não há passo anterior para voltar). Quem sabe qual é essa tela é o hospedeiro
// (`OpDoEndereco`, que recebe a tela aberta do DashboardTab); sem ela, o Início, que existe para todo mundo.
let telaDeBaixo = '';
export function informarTelaDeBaixo(id: string): void {
  telaDeBaixo = String(id || '');
}

/**
 * Tira da barra o endereço de um registro SEM tela dona (a OP e, desde a Fase 5, a viagem): um passo atrás se o passo é do sistema; senão (link colado), o endereço da tela de baixo, sem criar passo.
 * Serve às duas porque a tela de baixo é a mesma (`informarTelaDeBaixo`).
 */
export function tirarEnderecoDeRegistroSemTela(): void {
  if (temPassoAnterior()) { voltarUmPasso(); return; }
  irParaEndereco(montarEndereco(telaDeBaixo || 'inicio'), { substituir: true });
}

/** Tira o endereço da OP da barra (ver `tirarEnderecoDeRegistroSemTela`). */
export function tirarEnderecoDaOp(): void {
  tirarEnderecoDeRegistroSemTela();
}

/** Abre a janela de uma OP pelo endereço (um passo novo no histórico). A busca geral e as Menções entram por aqui; quem a monta é o `OpDoEndereco`. */
export function abrirOpPeloEndereco(chave: string): void {
  const c = String(chave ?? '').trim();
  if (!c) return;
  irParaEndereco(montarEnderecoDaOp(c));
}

// ── as janelas de OP abertas agora ──
type Janela = {
  op: () => any;                // a OP que a janela mostra agora (muda quando o número é alterado)
  fechar: () => void;           // fecha a janela (a mesma ação do X)
  escrito: string;              // o número que ela escreveu no endereço
  fechando: boolean;            // já mandou fechar: não manda duas vezes
  tituloAntes: string;
  tituloMeu: string;
};
const janelas: Janela[] = [];   // na ordem em que abriram: a última é a de cima

function chavesDaJanela(j: Janela): string[] {
  const op = j.op();
  return [op?.opl, op?.id, j.escrito].map(c => String(c ?? '').trim()).filter(Boolean);
}
function janelaEhDe(j: Janela, chave: string): boolean {
  return chavesDaJanela(j).some(c => mesmaChave(c, chave));
}

/** Já existe uma janela aberta para esta OP (pelo número ou pelo código interno)? */
export function janelaDaOpEstaAberta(chave: string): boolean {
  return janelas.some(j => janelaEhDe(j, chave));
}

/** Com o endereço de agora, esta janela tem de se fechar? Fecha se o endereço não é de OP, ou se é de uma OP que nem ela nem uma janela aberta DEPOIS dela mostra. */
function devoFechar(j: Janela): boolean {
  const chave = chaveDaOpNoEndereco();
  if (!chave) return true;
  for (let i = Math.max(0, janelas.indexOf(j)); i < janelas.length; i++) if (janelaEhDe(janelas[i], chave)) return false;
  return true;
}

/**
 * O gancho da janela da OP (chamado por `OplDetalheModal`). `op` é a OP que a janela mostra e `aoFechar`, a mesma ação do X.
 * Os dois podem mudar a cada desenho: o gancho guarda a última versão e se prende só ao código interno da OP.
 */
export function useEnderecoDaOp(op: any, aoFechar: () => void): void {
  const opRef = useRef(op);
  opRef.current = op;
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  const janela = useRef<Janela | null>(null);
  if (!janela.current) {
    janela.current = { op: () => opRef.current, fechar: () => fecharRef.current(), escrito: '', fechando: false, tituloAntes: '', tituloMeu: '' };
  }
  const chave = chaveDaOp(op);
  const id = String(op?.id ?? '');

  useEffect(() => {
    const j = janela.current as Janela;
    const numero = chaveDaOp(opRef.current);
    if (!numero) return;
    j.fechando = false;
    j.escrito = numero;
    // registra ANTES de escrever o endereço: o hospedeiro e as janelas de baixo conferem esta lista quando o endereço muda
    if (!janelas.includes(j)) janelas.push(j);
    const atual = chaveDaOpNoEndereco();
    if (atual === null || !janelaEhDe(j, atual)) irParaEndereco(montarEnderecoDaOp(numero));        // aberta por um módulo: passo novo no histórico
    else if (!mesmaChave(atual, numero)) irParaEndereco(montarEnderecoDaOp(numero), { substituir: true });   // aberta pelo código interno: o endereço passa a ser o número
    j.tituloAntes = document.title;
    j.tituloMeu = `OP ${numero} · ACN`;
    document.title = j.tituloMeu;
    const parar = aoMudarEndereco(() => {
      if (j.fechando || !janelas.includes(j)) return;
      if (devoFechar(j)) { j.fechando = true; j.fechar(); }
    }, { internas: true });
    return () => {
      parar();
      const i = janelas.indexOf(j);
      if (i >= 0) janelas.splice(i, 1);
      if (document.title === j.tituloMeu) document.title = j.tituloAntes;   // se a tela já trocou o título (mudou de tela), não o desfaz
      // A janela saiu (X, a tela que a abriu desmontou, ou o endereço mandou fechar). Se o endereço ainda é o dela, a barra fica com um endereço de OP que
      // ninguém mostra: tira. É adiado um instante porque o modo de desenvolvimento desmonta e monta a MESMA janela de novo (aí ela já voltou à lista).
      setTimeout(() => {
        if (janelas.includes(j)) return;
        const c = chaveDaOpNoEndereco();
        if (c !== null && janelaEhDe(j, c)) tirarEnderecoDaOp();
      }, 0);
    };
  }, [id]);

  // o número da OP foi alterado com a janela aberta ("Alterar o número da OP"): o endereço acompanha, e o título também
  useEffect(() => {
    const j = janela.current as Janela;
    if (!chave || !janelas.includes(j) || mesmaChave(j.escrito, chave)) return;
    const antes = j.escrito;
    j.escrito = chave;
    const c = chaveDaOpNoEndereco();
    if (c !== null && mesmaChave(c, antes)) irParaEndereco(montarEnderecoDaOp(chave), { substituir: true });
    if (document.title === j.tituloMeu) { j.tituloMeu = `OP ${chave} · ACN`; document.title = j.tituloMeu; }
  }, [chave]);
}

// ── Copiar link ──

/** O endereço completo da janela da OP, para colar numa mensagem ou e-mail: o endereço do sistema de agora (sem o `#` antigo) + `#/op/<número>`. */
export function enderecoCompletoDaOp(op: any): string {
  return window.location.href.split('#')[0] + montarEnderecoDaOp(chaveDaOp(op));
}

/** Copia o endereço da OP para a área de transferência (a mesma rotina das janelas da Fase 3: `CopiarTexto.ts`). Devolve se copiou. */
export async function copiarLinkDaOp(op: any): Promise<boolean> {
  return copiarTexto(enderecoCompletoDaOp(op));
}

/** O botão "Copiar link" da janela da OP: copia e avisa. A falha avisa em vermelho e manda copiar da barra (que, com a janela aberta, mostra o mesmo endereço). */
export async function copiarLinkDaOpComAviso(op: any): Promise<void> {
  const numero = chaveDaOp(op);
  const ok = await copiarLinkDaOp(op);
  if (ok) window.alert(`Link da OP ${numero} copiado. É só colar na mensagem ou no e-mail.`);
  else window.alert(`Não foi possível copiar o link da OP ${numero}. Copie o endereço que está na barra do navegador.`);
}
