-- Etapa 17, onda 4c, parte a (26/11/2026): o aviso de saldo do centro de custo passa a vir de uma função do banco que devolve SÓ a faixa
-- e o percentual, sem reais (decisão do usuário em 26/11/2026).
-- Por que: o aviso que aparece a quem faz uma solicitação de compra ou demanda (`AvisoSaldoCentro`) era calculado no navegador de quem pede,
-- que baixava todas as despesas e o orçamento do ano. Para poder fechar essas tabelas a quem não tem Financeiro, Relatórios, Compras ou
-- Admin, a conta vem pronta do banco e devolve apenas: o código do centro, a faixa do mês e do ano ('sem', 'ok', 'atencao', 'estouro') e o
-- percentual SÓ quando a faixa é atenção ou estouro (a tela só o mostra nesses casos). Nenhum valor em reais sai daqui.
-- A conta repete a da tela (CentroCustoPainel.tsx: normalizarMovimentos, calcularCentro, somarPeriodo, faixaDoConsumo; CentroCustoShared.tsx:
-- idsComDescendentes e orcamentoDoCentro): o centro vale com a subárvore inteira; o orçamento é o próprio do centro, ou, em "soma dos filhos",
-- a soma dos filhos ATIVOS (cada um pelo seu modo); compra Aprovada, Comprada ou Recebida conta o maior entre o valor e o já pago (pago = parte
-- realizada, resto = comprometido), Descartada e as demais não contam; a compra vale no dia em que foi criada (fuso de Brasília); despesa vale no
-- mês da competência (ou da data, se não tem competência); contrato parcelado conta o que falta do combinado; medição conta como paga.
-- O dinheiro da compra e do pagamento vem das tabelas `*_valores` (por isso a função é `security definer`: quem pede a compra pode não ver valores).
-- Faixa: 80% é atenção, 100% é estouro, em centavos inteiros; o percentual arredonda para baixo (79,99% não vira 80%).
-- Como desfazer: etapa17_onda4c_reverter.sql (apaga a função).

create or replace function public.centro_aviso_saldo(p_centro uuid, p_ano int default null, p_mes int default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $f$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ano int := coalesce(p_ano, extract(year from v_hoje)::int);
  v_mes int := coalesce(p_mes, extract(month from v_hoje)::int);
  v_codigo text;
  o_mes numeric; o_ano numeric; u_mes numeric; u_ano numeric;
  f_mes text; f_ano text; pct_mes numeric; pct_ano numeric;
begin
  select c.codigo into v_codigo from public.centros_custo c where c.id = p_centro;
  if not found then return null; end if;

  -- orçamento do centro (mês e ano)
  with recursive contrib(id, trilha) as (
    select c.id, array[c.id] from public.centros_custo c where c.id = p_centro
    union all
    select f.id, k.trilha || f.id
      from contrib k
      join public.centros_custo p on p.id = k.id and p.orcamento_modo = 'soma_filhos'
      join public.centros_custo f on f.parent_id = p.id and f.ativo is not false and not (f.id = any (k.trilha))
  ), proprio as (
    select distinct on (o.centro_id, o.mes) o.centro_id, o.mes, o.valor
      from public.centros_custo_orcamento o
     where o.ano = v_ano and o.mes between 1 and 12
     order by o.centro_id, o.mes, o.id desc
  )
  select coalesce(sum(p.valor) filter (where p.mes = v_mes), 0), coalesce(sum(p.valor), 0)
    into o_mes, o_ano
    from proprio p
    join contrib k on k.id = p.centro_id
    join public.centros_custo c on c.id = k.id
   where c.orcamento_modo is distinct from 'soma_filhos';

  -- o que o centro (com a subárvore) já usou: realizado + comprometido
  with recursive sub(id) as (
    select c.id from public.centros_custo c where c.id = p_centro
    union
    select c.id from public.centros_custo c join sub s on c.parent_id = s.id
  ), pago as (
    select f.pedido_id, sum(coalesce(fv.valor, 0)) as pago
      from public.pcp_pedidos_faturamento f
      left join public.pcp_pedidos_faturamento_valores fv on fv.faturamento_id = f.id
     where f.data_pagamento is not null
     group by f.pedido_id
  ), medido as (
    select d.despesa_pai_id, sum(coalesce(d.valor, 0)) as medido
      from public.centro_custo_despesas d
     where d.despesa_pai_id is not null
     group by d.despesa_pai_id
  ), itens as (
    select extract(month from x.dt)::int as mes,
           case when x.st in ('Aprovado', 'Comprado', 'Recebido') then round(x.pg, 2) else 0 end as realizado,
           case when x.st in ('Aprovado', 'Comprado', 'Recebido') then round(greatest(0, x.val - x.pg), 2) else 0 end as comprometido
      from (select p.status_compra as st,
                   (p.data_criacao at time zone 'America/Sao_Paulo')::date as dt,
                   coalesce(v.valor_compra, 0) as val,
                   coalesce(g.pago, 0) as pg
              from public.pcp_pedidos_compra p
              left join public.pcp_pedidos_compra_valores v on v.pedido_id = p.id
              left join pago g on g.pedido_id = p.id
             where p.centro_custo_id in (select id from sub)
               and p.status_compra is distinct from 'Descartada') x
     where extract(year from x.dt) = v_ano
    union all
    select extract(month from y.ref)::int,
           case when y.parcelado then 0 else round(coalesce(y.valor, 0), 2) end,
           case when y.parcelado then round(greatest(0, coalesce(y.valor_total_negociado, 0) - coalesce(m.medido, 0)), 2) else 0 end
      from (select d.id, d.parcelado, d.valor, d.valor_total_negociado, coalesce(d.competencia, d.data) as ref
              from public.centro_custo_despesas d
             where d.centro_custo_id in (select id from sub)) y
      left join medido m on m.despesa_pai_id = y.id
     where extract(year from y.ref) = v_ano
  )
  select coalesce(sum(realizado + comprometido) filter (where mes = v_mes), 0), coalesce(sum(realizado + comprometido), 0)
    into u_mes, u_ano
    from itens;

  o_mes := round(o_mes, 2); o_ano := round(o_ano, 2); u_mes := round(u_mes, 2); u_ano := round(u_ano, 2);
  f_mes := case when round(o_mes * 100) <= 0 then 'sem' when round(u_mes * 100) >= round(o_mes * 100) then 'estouro'
                when round(u_mes * 100) * 100 >= round(o_mes * 100) * 80 then 'atencao' else 'ok' end;
  f_ano := case when round(o_ano * 100) <= 0 then 'sem' when round(u_ano * 100) >= round(o_ano * 100) then 'estouro'
                when round(u_ano * 100) * 100 >= round(o_ano * 100) * 80 then 'atencao' else 'ok' end;
  pct_mes := case when f_mes in ('atencao', 'estouro') then floor(u_mes / o_mes * 1000 + 0.000000001) / 10 end;
  pct_ano := case when f_ano in ('atencao', 'estouro') then floor(u_ano / o_ano * 1000 + 0.000000001) / 10 end;

  return jsonb_build_object('codigo', v_codigo, 'ano', v_ano, 'mes', v_mes,
                            'faixa_mes', f_mes, 'pct_mes', pct_mes, 'faixa_ano', f_ano, 'pct_ano', pct_ano);
end
$f$;

revoke all on function public.centro_aviso_saldo(uuid, int, int) from public, anon;
grant execute on function public.centro_aviso_saldo(uuid, int, int) to authenticated;
