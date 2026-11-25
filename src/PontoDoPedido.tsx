// @ts-nocheck
// O ponto do dia ao lado de um pedido de hora extra (P3, 25/11/2026): só leitura, só para quem pode ver o ponto de todos (RH, Admin e gerentes).
// As regras estão em PontoHoraExtra.ts. A peça lê uma vez a ficha do RH da pessoa e a linha do dia em `ponto_dias`; leitura recusada diz isso e nunca vale como "sem ponto".
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { hojeISO, Selo } from './Interface';
import { lerDiasDaPessoa, lerPermissoes, primeiroDiaDoMes } from './PontoSecullum';
import { fichaDoPedido, diaDoPedido, compararComOPedido } from './PontoHoraExtra';
import { explicarErroDoBanco } from './ErroDoBanco';

/** Quem pode ver o ponto dos outros, e as fichas básicas do RH (sem CPF nem salário) para achar a pessoa do pedido. */
export function usePontoParaAprovar(ativo: boolean) {
  const [estado, setEstado] = useState<{ pronto: boolean; verTodos: boolean; fichas: any[]; erro: string }>({ pronto: false, verTodos: false, fichas: [], erro: '' });
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    (async () => {
      const perm = await lerPermissoes();
      if (!vivo) return;
      if (!perm.verTodos) { setEstado({ pronto: true, verTodos: false, fichas: [], erro: perm.erro || '' }); return; }
      const { data, error } = await supabase.from('rh_funcionarios_basico').select('id, nome, usuario_id, ativo');
      if (!vivo) return;
      setEstado({ pronto: true, verTodos: true, fichas: data || [], erro: error ? explicarErroDoBanco(error) : '' });
    })();
    return () => { vivo = false; };
  }, [ativo]);
  return estado;
}

/** Uma linha com o que o ponto diz do dia do pedido. Some sozinha quando a pessoa não tem ficha ligada ou quando quem olha não pode ver o ponto. */
export default function PontoDoPedido({ pedido, ponto }: { pedido: any; ponto: { pronto: boolean; verTodos: boolean; fichas: any[]; erro: string } }) {
  const [leitura, setLeitura] = useState<{ carregando: boolean; erro: string; valores: any }>({ carregando: true, erro: '', valores: null });
  const ficha = ponto.pronto && ponto.verTodos ? fichaDoPedido(pedido, ponto.fichas) : null;
  const dia = diaDoPedido(pedido.inicio);
  const hoje = hojeISO();
  useEffect(() => {
    if (!ficha || dia > hoje) { setLeitura({ carregando: false, erro: '', valores: null }); return; }
    let vivo = true;
    setLeitura({ carregando: true, erro: '', valores: null });
    (async () => {
      const r = await lerDiasDaPessoa(ficha.id, primeiroDiaDoMes(dia));
      if (!vivo) return;
      const linha = (r.dados || []).find((d: any) => String(d.dia).slice(0, 10) === dia);
      setLeitura({ carregando: false, erro: r.erro || '', valores: linha?.valores || null });
    })();
    return () => { vivo = false; };
  }, [ficha?.id, dia, hoje]);

  if (!ponto.pronto || !ponto.verTodos) return null;
  if (!ficha) return null;
  if (leitura.carregando) return <div className="acn-fraco acn-hx-t12">Lendo o ponto da Secullum…</div>;
  if (leitura.erro) return <div className="acn-fraco acn-hx-t12">Não foi possível ler o ponto deste dia ({leitura.erro}).</div>;
  const minutos = Math.round((new Date(pedido.fim).getTime() - new Date(pedido.inicio).getTime()) / 60000);
  const c = compararComOPedido(leitura.valores, dia, hoje, minutos);
  return (
    <div className="acn-hx-t12" data-teste="hx-ponto">
      <Selo familia={c.tom === 'atencao' ? 'atencao' : 'neutro'}>Ponto</Selo> <span className={c.tom === 'atencao' ? undefined : 'acn-fraco'}>{c.frase}</span>
    </div>
  );
}
