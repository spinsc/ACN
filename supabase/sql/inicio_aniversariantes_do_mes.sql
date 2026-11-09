-- Tela Início: os aniversariantes do MÊS INTEIRO (pedido do usuário em 09/11/2026: "deve aparecer todos os aniversariantes do mês, não somente eu").
--
-- A primeira versão (inicio_aniversariantes, em inicio_carrossel.sql) olhava só os próximos 7 dias. Ela FICA no banco por enquanto, sem uso na tela nova: a tela que já está
-- publicada ainda a chama, e tirá-la antes do front novo ir ao ar deixaria o cartão com erro. Depois do front novo no ar ela pode ser apagada (com o aval do usuário).
--
-- A data de nascimento é dado do RH (a tabela rh_funcionarios é fechada por perfil). As duas funções rodam com o poder do dono (security definer) e devolvem apenas o que a
-- tela precisa:
--  · inicio_aniversariantes_do_mes(): para quem entrou (esta_logado). Nome, departamento, dia, mês e em_dias (dia do aniversário menos o dia de hoje; NEGATIVO = já passou
--    neste mês) de quem faz aniversário NO MÊS DE HOJE (horário de Brasília), em ordem de dia e nome. Nunca o ano nem a idade. Quem saiu da empresa e quem não tem a data
--    cadastrada ficam de fora. Quem nasceu em 29/02 aparece no dia 28 nos anos em que fevereiro não tem o dia 29 (a mesma regra da função de 7 dias).
--  · inicio_aniversariantes_cobertura(): só para quem EDITA a tela Início (pode_postar_inicio(): Admin ou a marca "Pode postar na tela Início"; o banco não confia na tela, que
--    só a pede a essas pessoas). Só dois números, as pessoas ativas e quantas delas têm a data de nascimento cadastrada, para a tela dizer a quem edita por que o cartão não
--    mostra todo mundo. Nenhum nome. Quem não pode recebe 0 e 0, que a tela trata como "sem aviso". Em 09/11/2026, de manhã, só 1 das 41 pessoas ativas tinha a data; à tarde o RH
--    preencheu e ficaram 40 das 42.
--
-- No banco isto foi aplicado em duas migrações no mesmo dia: inicio_aniversariantes_do_mes (as duas funções, a cobertura ainda para quem entrou) e
-- inicio_aniversariantes_cobertura_so_quem_edita (a cobertura só para quem edita). Este arquivo mostra o estado final.

create or replace function public.inicio_aniversariantes_do_mes()
returns table (nome text, departamento text, dia integer, mes integer, em_dias integer)
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  do_mes as (
    select f.nome, f.departamento, h.d as hoje,
           extract(month from f.data_nascimento)::int as mes,
           least(extract(day from f.data_nascimento)::int,
                 extract(day from (make_date(extract(year from h.d)::int, extract(month from h.d)::int, 1) + interval '1 month - 1 day'))::int) as dia
    from public.rh_funcionarios f cross join hoje h
    where public.esta_logado()
      and coalesce(f.ativo, true) and f.data_desligamento is null
      and f.data_nascimento is not null
      and extract(month from f.data_nascimento) = extract(month from h.d)
  )
  select m.nome, m.departamento, m.dia, m.mes, (m.dia - extract(day from m.hoje)::int)
  from do_mes m
  order by m.dia, m.nome;
$f$;
revoke all on function public.inicio_aniversariantes_do_mes() from public, anon;
grant execute on function public.inicio_aniversariantes_do_mes() to authenticated;

create or replace function public.inicio_aniversariantes_cobertura()
returns table (ativos integer, com_nascimento integer)
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select count(*)::int, (count(*) filter (where f.data_nascimento is not null))::int
  from public.rh_funcionarios f
  where public.pode_postar_inicio() and coalesce(f.ativo, true) and f.data_desligamento is null;
$f$;
revoke all on function public.inicio_aniversariantes_cobertura() from public, anon;
grant execute on function public.inicio_aniversariantes_cobertura() to authenticated;
