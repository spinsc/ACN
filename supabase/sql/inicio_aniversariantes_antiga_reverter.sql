-- Desfaz a remoção da função antiga dos aniversariantes (26/11/2026): recria `public.inicio_aniversariantes(p_dias)`, a de 7 dias, exatamente como estava no banco
-- (definição lida de pg_get_functiondef antes de apagar). Ela estava sem uso desde que a tela Início passou a usar `inicio_aniversariantes_do_mes` (09/11/2026):
-- nenhuma tela, função, visão, gatilho, política ou rotina do banco a chamava (conferido em 26/11/2026).
-- Direitos como estavam: só quem entrou (authenticated) executa; a chave pública não.

create or replace function public.inicio_aniversariantes(p_dias integer default 7)
 returns table(nome text, departamento text, dia integer, mes integer, em_dias integer)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  base as (
    select f.nome, f.departamento, f.data_nascimento as nasc, h.d as hoje
    from public.rh_funcionarios f cross join hoje h
    where public.esta_logado() and coalesce(f.ativo, true) and f.data_desligamento is null and f.data_nascimento is not null
  ),
  este_ano as (
    select b.*, make_date(extract(year from b.hoje)::int, extract(month from b.nasc)::int,
             least(extract(day from b.nasc)::int, extract(day from (make_date(extract(year from b.hoje)::int, extract(month from b.nasc)::int, 1) + interval '1 month - 1 day'))::int)) as a
    from base b
  ),
  proximo as (
    select e.nome, e.departamento, e.nasc, e.hoje,
           case when e.a >= e.hoje then e.a
                else make_date(extract(year from e.hoje)::int + 1, extract(month from e.nasc)::int,
                       least(extract(day from e.nasc)::int, extract(day from (make_date(extract(year from e.hoje)::int + 1, extract(month from e.nasc)::int, 1) + interval '1 month - 1 day'))::int)) end as quando
    from este_ano e
  )
  select p.nome, p.departamento, extract(day from p.nasc)::int, extract(month from p.nasc)::int, (p.quando - p.hoje)::int
  from proximo p where (p.quando - p.hoje) between 0 and greatest(p_dias, 0)
  order by (p.quando - p.hoje), p.nome;
$function$;

revoke all on function public.inicio_aniversariantes(integer) from public, anon;
grant execute on function public.inicio_aniversariantes(integer) to authenticated;
