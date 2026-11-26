// @ts-nocheck
// O hospedeiro da janela da OP aberta PELO ENDEREÇO (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 2, 25/11/2026).
//
// Montado uma vez só, na casca do sistema (`DashboardTab`). Cuida dos casos em que quem pede a OP é o ENDEREÇO e não uma tela que já a tem em mãos:
// o F5 em `#/op/<número>`, o link colado, o Avançar do navegador, a busca geral e as Menções (que só escrevem o endereço: `abrirOpPeloEndereco`).
// Lê a OP do banco, mostra "Abrindo a OP…" enquanto espera e monta a MESMA janela de sempre (`OplDetalheModal`), que já sabe cuidar do endereço
// (`useEnderecoDaOp`). Quando a janela já está aberta (um módulo a abriu), não monta outra por cima.
//
// OP que não existe, que foi excluída ou que a pessoa não lê: UMA mensagem em vermelho e o endereço é limpo (nunca fica "carregando" para sempre).
// Leitura que falha (banco fora do ar) diz isso, e não "não encontrei": a OP pode existir.
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { OplDetalheModal } from './AcnTabShared';
import { anexarValoresDaOp } from './OpValores';
import { aoMudarEndereco } from './EnderecoDoNavegador';
import { ehCodigoInterno, normalizarChave } from './Rotas';
import { chaveDaOpNoEndereco, informarTelaDeBaixo, janelaDaOpEstaAberta, tirarEnderecoDaOp } from './OpNoEndereco';
import './endereco.css';

/** Lê a OP pela chave do endereço: o código interno (uuid) ou o número. Devolve `{ op, erro }`: `erro` preenchido = a leitura falhou; os dois vazios = não achou. */
async function lerOpDoEndereco(chave: string): Promise<{ op: any | null; erro: string }> {
  let r;
  if (ehCodigoInterno(chave)) {
    r = await supabase.from('oples').select('*').eq('id', chave.trim()).maybeSingle();
  } else {
    r = await supabase.from('oples').select('*').eq('opl', chave.trim()).maybeSingle();
    // grafia diferente (o link digitado em minúscula ou sem acento): a coluna `opl_norm` é o número sem maiúscula nem acento (a busca geral já a usa) e `normalizarChave` faz a mesma conta.
    // Conferido no banco em 25/11/2026: das 571 OPs, 565 só diferem na maiúscula e 6 números antigos têm acento; nenhum `opl_norm` se repete, então o `limit(1)` não escolhe entre duas.
    if (!r.error && !r.data) r = await supabase.from('oples').select('*').eq('opl_norm', normalizarChave(chave)).limit(1).maybeSingle();
  }
  if (r.error) return { op: null, erro: r.error.message || 'sem resposta' };
  if (!r.data) return { op: null, erro: '' };
  const comValor = await anexarValoresDaOp(r.data);   // o valor da OP mora numa tabela à parte (só quem tem a caixa "Ver valores" o recebe)
  return { op: comValor.op, erro: '' };
}

export default function OpDoEndereco({ currentUser, tela }: { currentUser?: any; tela?: string }) {
  const [chave, setChave] = useState<string | null>(() => chaveDaOpNoEndereco());
  const [op, setOp] = useState<any | null>(null);
  const [carregando, setCarregando] = useState(false);

  // a tela que fica por baixo: num link colado, fechar a janela troca o endereço por esta
  useEffect(() => { informarTelaDeBaixo(tela || ''); }, [tela]);

  // o endereço manda: Voltar, Avançar, link digitado e também o que o próprio sistema escreve (busca geral, Menções)
  useEffect(() => aoMudarEndereco(hash => setChave(chaveDaOpNoEndereco(hash)), { internas: true }), []);

  useEffect(() => {
    if (!chave) { setOp(null); setCarregando(false); return; }
    if (janelaDaOpEstaAberta(chave)) { setCarregando(false); return; }   // um módulo já abriu esta OP: a janela dele cuida de tudo
    let vivo = true;
    setOp(null);
    setCarregando(true);
    lerOpDoEndereco(chave).then(r => {
      if (!vivo) return;   // o endereço mudou enquanto lia (Voltar, outra OP): este resultado não vale mais
      setCarregando(false);
      if (r.op) { setOp(r.op); return; }
      // o texto começa com "Não foi possível" para o aviso sair vermelho e ficar na tela até a pessoa fechar (Feedback.tsx)
      window.alert(r.erro
        ? `Não foi possível abrir a OP ${chave}: a leitura falhou (${r.erro}). Tente de novo.`
        : `Não foi possível abrir a OP ${chave}: não a encontrei, ou você não tem acesso a ela.`);
      tirarEnderecoDaOp();
    }).catch(e => {
      if (!vivo) return;
      setCarregando(false);
      window.alert(`Não foi possível abrir a OP ${chave}: a leitura falhou (${e?.message || 'sem resposta'}). Tente de novo.`);
      tirarEnderecoDaOp();
    });
    return () => { vivo = false; };
  }, [chave]);

  return (
    <>
      {carregando && chave && <div className="acn-op-endereco-carregando" role="status">Abrindo a OP {chave}…</div>}
      {op && <OplDetalheModal opl={op} currentUser={currentUser} onClose={() => setOp(atual => (atual === op ? null : atual))} />}
    </>
  );
}
