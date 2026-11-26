-- ENSAIO da onda 4c, parte a (26/11/2026, função do aviso de saldo do centro de custo): cria a função dentro de um bloco que termina em erro
-- de propósito (nada fica gravado), inventa orçamentos dentro do bloco (hoje o banco não tem nenhum: 0 linhas) e confere, para TODO centro e TODOS
-- os 12 meses de 2026 mais o ano, que a faixa e o percentual da função batem com uma conta de REFERÊNCIA escrita de outro jeito (subárvore por
-- laço, compra = maior entre o valor e o já pago, orçamento por recursão simples). Inclui centros em "soma dos filhos" e um filho inativo.
-- Confere também: nenhum valor em reais na resposta, centro que não existe devolve nulo, a chave pública é barrada e uma pessoa sem as abas de
-- dinheiro consegue chamar. O bloco da função (entre $mig$) repete etapa17_onda4c_a_aviso_de_saldo.sql sem os comentários.
-- Rodar fora do horário de uso; cole TODO este arquivo no SQL do banco; a mensagem de erro final é o resultado.
create function pg_temp.sub_ids(p uuid) returns uuid[] language plpgsql as $f$
declare r uuid[] := array[p]; novo uuid[];
begin
  loop
    select coalesce(array_agg(c.id), '{}') into novo from public.centros_custo c where c.parent_id = any (r) and not (c.id = any (r));
    exit when cardinality(novo) = 0;
    r := r || novo;
  end loop;
  return r;
end $f$;
create function pg_temp.orc_ref(p uuid, m int, trilha uuid[]) returns numeric language plpgsql as $f$
declare c record; s numeric := 0; f record;
begin
  if p = any (trilha) then return 0; end if;
  select * into c from public.centros_custo where id = p;
  if c.orcamento_modo is distinct from 'soma_filhos' then
    return coalesce((select o.valor from public.centros_custo_orcamento o where o.centro_id = p and o.ano = 2026 and o.mes = m order by o.id desc limit 1), 0);
  end if;
  for f in select id from public.centros_custo where parent_id = p and ativo is not false loop
    s := s + pg_temp.orc_ref(f.id, m, trilha || p);
  end loop;
  return s;
end $f$;
create function pg_temp.uso_ref(p uuid, m int) returns numeric language plpgsql as $f$
declare a numeric; b numeric;
begin
  select coalesce(sum(case when x.status_compra in ('Aprovado', 'Comprado', 'Recebido')
           then greatest(coalesce(v.valor_compra, 0),
                         coalesce((select sum(coalesce(fv.valor, 0)) from public.pcp_pedidos_faturamento f left join public.pcp_pedidos_faturamento_valores fv on fv.faturamento_id = f.id
                                    where f.pedido_id = x.id and f.data_pagamento is not null), 0))
           else 0 end), 0)
    into a
    from public.pcp_pedidos_compra x left join public.pcp_pedidos_compra_valores v on v.pedido_id = x.id
   where x.centro_custo_id = any (pg_temp.sub_ids(p)) and x.status_compra is distinct from 'Descartada'
     and extract(year from (x.data_criacao at time zone 'America/Sao_Paulo')) = 2026
     and (m = 0 or extract(month from (x.data_criacao at time zone 'America/Sao_Paulo')) = m);
  select coalesce(sum(case when d.parcelado
           then greatest(0, coalesce(d.valor_total_negociado, 0) - coalesce((select sum(coalesce(k.valor, 0)) from public.centro_custo_despesas k where k.despesa_pai_id = d.id), 0))
           else coalesce(d.valor, 0) end), 0)
    into b
    from public.centro_custo_despesas d
   where d.centro_custo_id = any (pg_temp.sub_ids(p))
     and extract(year from coalesce(d.competencia, d.data)) = 2026
     and (m = 0 or extract(month from coalesce(d.competencia, d.data)) = m);
  return round(a + b, 2);
end $f$;
create function pg_temp.tenta(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v_rol text; m text; r text;
begin
  if p_uid is null then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    execute p_sql into r; m := 'ok:' || coalesce(r, 'nulo');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; c record; m int; r jsonb; o numeric; u numeric; fx text; px numeric; got text;
        n_sem int := 0; n_ok int := 0; n_at int := 0; n_est int := 0; ms numeric; t0 timestamptz; pessoa uuid; n_com_uso int := 0; texto_total text := '';
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  execute $mig$
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
$mig$;

  -- orçamentos inventados (só dentro do bloco): de 1.000 a 50.000 por centro e mês, para haver variedade de faixas;
  -- os centros que têm filhos viram "soma dos filhos"; um filho vira inativo para provar que não entra na soma
  insert into public.centros_custo_orcamento (centro_id, ano, mes, valor)
    select cc.id, 2026, g,
           case when pg_temp.uso_ref(cc.id, g) > 0 then round(pg_temp.uso_ref(cc.id, g) * (0.8 + (abs(hashtext(cc.id::text || g::text)) % 50) / 100.0), 2)
                else 1000 * (1 + abs(hashtext(cc.id::text || g::text)) % 50) end
      from public.centros_custo cc, generate_series(1, 12) g;
  update public.centros_custo set orcamento_modo = 'soma_filhos' where id in (select distinct parent_id from public.centros_custo where parent_id is not null);
  update public.centros_custo set ativo = false where id = (select id from public.centros_custo where parent_id is not null order by id limit 1);

  for c in select id, codigo from public.centros_custo order by id loop
    for m in 1..12 loop
      testes := testes + 1;
      r := public.centro_aviso_saldo(c.id, 2026, m);
      o := round(pg_temp.orc_ref(c.id, m, '{}'), 2); u := pg_temp.uso_ref(c.id, m);
      fx := case when o <= 0 then 'sem' when u >= o then 'estouro' when u >= o * 0.8 then 'atencao' else 'ok' end;
      px := case when fx in ('atencao', 'estouro') then floor(u / o * 1000 + 0.000000001) / 10 end;
      if (r->>'faixa_mes') is distinct from fx or (r->>'pct_mes')::numeric is distinct from px then
        falhas := falhas + 1; achados := achados || E'\n  ' || c.codigo || ' mês ' || m || ': função ' || (r->>'faixa_mes') || '/' || coalesce(r->>'pct_mes','-') || ' referência ' || fx || '/' || coalesce(px::text,'-') || ' (orçado ' || o || ', usado ' || u || ')';
      end if;
      if u > 0 then n_com_uso := n_com_uso + 1; end if;
      if fx = 'sem' then n_sem := n_sem + 1; elsif fx = 'ok' then n_ok := n_ok + 1; elsif fx = 'atencao' then n_at := n_at + 1; else n_est := n_est + 1; end if;
    end loop;
    -- o ano inteiro
    testes := testes + 1;
    r := public.centro_aviso_saldo(c.id, 2026, 1);
    o := round((select sum(pg_temp.orc_ref(c.id, g, '{}')) from generate_series(1, 12) g), 2); u := pg_temp.uso_ref(c.id, 0);
    fx := case when o <= 0 then 'sem' when u >= o then 'estouro' when u >= o * 0.8 then 'atencao' else 'ok' end;
    px := case when fx in ('atencao', 'estouro') then floor(u / o * 1000 + 0.000000001) / 10 end;
    if (r->>'faixa_ano') is distinct from fx or (r->>'pct_ano')::numeric is distinct from px then
      falhas := falhas + 1; achados := achados || E'\n  ' || c.codigo || ' ano: função ' || (r->>'faixa_ano') || '/' || coalesce(r->>'pct_ano','-') || ' referência ' || fx || '/' || coalesce(px::text,'-') || ' (orçado ' || o || ', usado ' || u || ')';
    end if;
    texto_total := texto_total || (r::text);
  end loop;

  -- a resposta não carrega reais: só estas chaves
  testes := testes + 1;
  r := public.centro_aviso_saldo((select id from public.centros_custo order by id limit 1), 2026, 11);
  if (select array_agg(k order by k) from jsonb_object_keys(r) k) is distinct from array['ano','codigo','faixa_ano','faixa_mes','mes','pct_ano','pct_mes'] then
    falhas := falhas + 1; achados := achados || E'\n  a resposta tem chaves inesperadas: ' || r::text;
  end if;
  -- centro que não existe
  testes := testes + 1;
  if public.centro_aviso_saldo('00000000-0000-0000-0000-000000000000'::uuid) is not null then falhas := falhas + 1; achados := achados || E'\n  centro inexistente deveria devolver nulo'; end if;
  -- pessoa sem as abas de dinheiro chama; chave pública não
  select au.auth_id into pessoa from public.auth_usuarios au
   where au.ativo and au.auth_id is not null and au.perfil <> 'Admin' and jsonb_array_length(coalesce(au.abas_permitidas, '[]'::jsonb)) > 0
     and not (coalesce(au.abas_permitidas, '[]'::jsonb) ?| array['financeiro', 'relatorios', 'compras', 'admin']) limit 1;
  testes := testes + 1;
  got := pg_temp.tenta(pessoa, format('select (public.centro_aviso_saldo(%L::uuid, 2026, 11))->>''faixa_mes''', (select id from public.centros_custo order by id limit 1)));
  if pessoa is null or got in ('ERRO 42501') or got = 'ok:nulo' then falhas := falhas + 1; achados := achados || E'\n  pessoa sem as abas de dinheiro: ' || coalesce(got, '-') || ' (pessoa ' || coalesce(pessoa::text, 'nenhuma') || ')'; end if;
  testes := testes + 1;
  got := pg_temp.tenta(null, format('select (public.centro_aviso_saldo(%L::uuid, 2026, 11))->>''faixa_mes''', (select id from public.centros_custo order by id limit 1)));
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública chamando a função: ' || got; end if;
  -- custo: a chamada que a tela faz (centro da raiz, mês de agora)
  t0 := clock_timestamp();
  for c in select id from public.centros_custo loop perform public.centro_aviso_saldo(c.id); end loop;
  ms := round(extract(epoch from (clock_timestamp() - t0)) * 1000 / greatest(1, (select count(*) from public.centros_custo)), 1);
  raise exception E'ENSAIO DA ONDA 4c-a: % conferências, % falhas\n  centros x meses com uso > 0: %; faixas: sem % / ok % / atenção % / estouro %\n  custo de uma chamada: % ms (média entre os centros)%',
    testes, falhas, n_com_uso, n_sem, n_ok, n_at, n_est, ms, achados;
end
$ensaio$;
