// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Peças que os painéis de configuração do Admin dividem (12e83, 26/11/2026): ler as chaves de `configuracoes_sistema` sem tratar leitura recusada
// como "tudo vazio" e traduzir o motivo de uma função de servidor que recusou.
//
// Por que existe (achado da 7.x da 12e83): os painéis liam a configuração com `.then(({ data }) => { if (data) … })`, sem olhar o erro. Com a leitura recusada
// a tela mostrava os valores de partida (tudo desligado, desconto 0, faixas de 65 e 80) e o botão Salvar GRAVAVA esses valores por cima da configuração real.
// Agora a leitura que falha mostra a faixa vermelha com "Tentar de novo" e o Salvar fica desligado até a leitura dar certo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { Botao, Faixa } from './Interface';

export type LeituraDeConfig = { dados: Record<string, string> | null; erro: string; lendo: boolean; reler: () => void };

// `chaves` tem de ser uma lista fixa (constante fora do componente): ela não dispara nova leitura se mudar.
export function useConfiguracoes(chaves: string[]): LeituraDeConfig {
  const [estado, setEstado] = useState<{ dados: Record<string, string> | null; erro: string; lendo: boolean }>({ dados: null, erro: '', lendo: true });
  const reler = useCallback(async () => {
    setEstado(e => ({ ...e, erro: '', lendo: true }));
    const { data, error } = await supabase.from('configuracoes_sistema').select('chave,valor').in('chave', chaves);
    if (error) { setEstado({ dados: null, erro: explicarErroDoBanco(error), lendo: false }); return; }
    setEstado({ dados: Object.fromEntries((data || []).map((r: any) => [r.chave, r.valor])), erro: '', lendo: false });
  }, []);
  useEffect(() => { reler(); }, [reler]);
  return { ...estado, reler };
}

// A faixa única de "não consegui ler": diz o motivo, explica por que o Salvar fica desligado e oferece tentar de novo.
export function FaixaDeLeituraRecusada({ oQue, erro, onTentar }: { oQue: string; erro: string; onTentar: () => void }) {
  return (
    <Faixa tom="erro" acao={<Botao pequeno onClick={onTentar}>Tentar de novo</Botao>}>
      Não foi possível ler {oQue} ({erro}). O botão Salvar fica desligado: gravar agora trocaria o que está guardado pelos valores de partida da tela.
    </Faixa>
  );
}

// Quando a função de servidor recusa (status diferente de 200) o supabase-js só devolve "Edge Function returned a non-2xx status code"; a frase de verdade
// (por exemplo "Só o Admin altera a configuração do e-mail") vem no corpo da resposta.
export async function motivoDaFuncao(error: any, data?: any): Promise<string> {
  if (data?.error) return String(data.error);
  try {
    const corpo = await error?.context?.json?.();
    if (corpo?.error) return String(corpo.error);
  } catch { /* sem corpo legível: cai na frase do banco */ }
  return explicarErroDoBanco(error);
}
