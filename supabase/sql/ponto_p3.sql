-- Ponto Secullum, fatia P3 (25/11/2026; PLANO_PONTO_SECULLUM.md): o aviso de batida incompleta e de falta para o RH, e a caixa "Não bate ponto" da ficha.
--
-- O que muda (nenhum dado de ponto é alterado; só se LÊ ponto_dias):
--   1) rh_funcionarios.nao_bate_ponto (boolean, padrão false): quem o RH marcar sai da faixa "sem par", dos avisos e do relatório. A função de servidor da Secullum NÃO muda:
--      quem não existe lá simplesmente não é achado e não gasta consulta; quem existe e foi marcado continua sendo lido (a marca só vale para as telas e os avisos).
--   2) ponto_ocorrencia_do_dia(valores, dia, hoje): a conta de PontoSecullum.ts › situacaoDoDia (só as ocorrências que o RH precisa ajustar), repetida em SQL.
--      Devolve 'incompleto' (entrada sem saída), 'falta' (a Secullum contou falta, ou escreveu a marca FALTA com horas de falta no lugar das batidas), 'sem_batida' (jornada prevista e nenhuma batida, sem abono) ou nulo.
--   3) calendario_eventos_ponto(p_inicio, p_fim): UM evento por DIA que já passou, com a contagem e os nomes (fonte `ponto_dia`, alerta). Os envolvidos são os usuários do
--      perfil RH. Admin e gerentes veem tudo pelo botão "Todos os usuários" do Calendário, sem receber o aviso. Some sozinho quando a Secullum deixa de ter a ocorrência
--      (o RH corrigiu lá e a leitura seguinte traz o dia certo): a rotina `calendario-avisar` (dias úteis, 8h) resolve o aviso como "Sistema".
--      Só dias ANTERIORES a hoje (hoje a Secullum ainda conta como falta quem não bateu), até 20 dias para trás, só quem está ativo e não é "não bate ponto".
--   4) calendario_eventos_base ganha o quarto ramo e calendario_alvos ganha uma linha no CASE da aba (`ponto_dia` → `rh`). O resto das duas funções é o que já estava no banco.
-- Para desfazer: ponto_p3_reverter.sql (a coluna nao_bate_ponto fica: tirar a coluna apagaria as marcas do RH).
set local lock_timeout = '5s';

alter table public.rh_funcionarios add column if not exists nao_bate_ponto boolean not null default false;

create or replace function public.ponto_ocorrencia_do_dia(v jsonb, p_dia date, p_hoje date)
returns text language plpgsql immutable set search_path = public, pg_temp
as $fn$
declare
  n int; c text; x text; e text; s text; entradas int := 0; saidas int := 0; pares int := 0; incompleto boolean := false; ehh text := '^-?\d{1,4}:\d{2}$';
begin
  if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
  -- o dia tem uma marca (FOLGA, FERIADO, ATESTADO…) no lugar das batidas: não é ocorrência, EXCETO a marca FALTA com horas de falta (a Secullum escreve FALTA no lugar das batidas
  -- do dia que a pessoa faltou; achado de 25/11/2026: a tela tratava essa marca como um aviso neutro e a falta nunca chegava ao "A tratar")
  for n in 1..5 loop
    foreach c in array array['Entrada ' || n, 'Saída ' || n] loop
      x := btrim(coalesce(v ->> c, ''));
      if x <> '' and x !~ ehh then
        if upper(x) = 'FALTA' and p_dia < p_hoje then
          x := btrim(coalesce(v ->> 'Faltas', ''));
          if x ~ ehh and x !~ '^-' and split_part(x, ':', 1)::int * 60 + split_part(x, ':', 2)::int > 0 then return 'falta'; end if;
        end if;
        return null;
      end if;
    end loop;
  end loop;
  for n in 1..5 loop
    e := btrim(coalesce(v ->> ('Entrada ' || n), ''));
    s := btrim(coalesce(v ->> ('Saída ' || n), ''));
    if e !~ ehh then e := null; end if;
    if s !~ ehh then s := null; end if;
    if e is not null or s is not null then
      pares := pares + 1;
      if e is not null then entradas := entradas + 1; end if;
      if s is not null then saidas := saidas + 1; end if;
      if e is not null and s is null then incompleto := true; end if;
    end if;
  end loop;
  if pares > 0 then
    if entradas > saidas or incompleto then return case when p_dia = p_hoje then null else 'incompleto' end; end if;
    return null;
  end if;
  -- sem nenhuma batida: o dia de hoje ainda não acabou
  if p_dia = p_hoje then return null; end if;
  x := btrim(coalesce(v ->> 'Faltas', ''));
  if x ~ ehh and x !~ '^-' and split_part(x, ':', 1)::int * 60 + split_part(x, ':', 2)::int > 0 then return 'falta'; end if;
  foreach c in array array['Abono2', 'Abono3', 'Abono4', 'JustPa.', 'Ajuste'] loop
    x := coalesce(v ->> c, '');
    if x <> '' and x <> '00:00' then return null; end if;
  end loop;
  x := btrim(coalesce(v ->> 'Carga', ''));
  if x ~ ehh and x !~ '^-' and split_part(x, ':', 1)::int * 60 + split_part(x, ':', 2)::int > 0 and p_dia < p_hoje then return 'sem_batida'; end if;
  return null;
end $fn$;
revoke all on function public.ponto_ocorrencia_do_dia(jsonb, date, date) from public, anon, authenticated;

create or replace function public.calendario_eventos_ponto(p_inicio date, p_fim date)
returns table (fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[],
               aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  with h as (select (now() at time zone 'America/Sao_Paulo')::date as hoje),
  oc as (
    select d.dia, f.nome, public.ponto_ocorrencia_do_dia(d.valores, d.dia, h.hoje) as tipo
      from public.ponto_dias d
      join public.rh_funcionarios f on f.id = d.rh_id
      cross join h
     where d.dia between p_inicio and p_fim and d.dia < h.hoje and d.dia >= h.hoje - 20
       and coalesce(f.ativo, false) and not coalesce(f.nao_bate_ponto, false)
  ), g as (
    select oc.dia,
           count(*) filter (where oc.tipo = 'incompleto')::int as inc,
           count(*) filter (where oc.tipo in ('falta', 'sem_batida'))::int as aus,
           string_agg(oc.nome, ', ' order by oc.nome) filter (where oc.tipo = 'incompleto') as nomes_inc,
           string_agg(oc.nome, ', ' order by oc.nome) filter (where oc.tipo in ('falta', 'sem_batida')) as nomes_aus
      from oc where oc.tipo is not null group by oc.dia
  )
  select 'ponto_dia'::text, g.dia::text, g.dia, null::time,
         'Ponto de ' || to_char(g.dia, 'DD/MM') || ' a ajustar na Secullum: '
           || concat_ws(' e ',
                case when g.inc > 0 then g.inc || case when g.inc = 1 then ' batida incompleta' else ' batidas incompletas' end end,
                case when g.aus > 0 then g.aus || ' sem batida ou falta' end),
         concat_ws(' · ',
                case when g.inc > 0 then 'Batida incompleta: ' || g.nomes_inc end,
                case when g.aus > 0 then 'Sem batida ou falta: ' || g.nomes_aus end),
         null::text, '{}'::text[], '{}'::text[], array['RH']::text[], 'rh'::text,
         false, true,
         jsonb_build_object('incompletas', g.inc, 'ausentes', g.aus)
    from g
$$;
revoke all on function public.calendario_eventos_ponto(date, date) from public, anon, authenticated;

-- a base do calendário: as quatro partes juntas (a tela e a rotina de alertas chamam esta, e não mudam)
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.calendario_eventos_base(date,date)'::regprocedure);
  if position('calendario_eventos_ponto' in d) = 0 then
    if position(E'  select * from public.calendario_eventos_terceiros(p_inicio, p_fim)\n' in d) = 0 then raise exception 'calendario_eventos_base: ponto de insercao nao achado'; end if;
    d := replace(d, E'  select * from public.calendario_eventos_terceiros(p_inicio, p_fim)\n', E'  select * from public.calendario_eventos_terceiros(p_inicio, p_fim)\n  union all\n  select * from public.calendario_eventos_ponto(p_inicio, p_fim)\n');
    execute d;
  end if;
  d := pg_get_functiondef('public.calendario_alvos(date)'::regprocedure);
  if position('ponto_dia' in d) = 0 then
    if position($m$when 'terceiro_servico' then 'terceiros'$m$ in d) = 0 then raise exception 'calendario_alvos: ponto de insercao nao achado'; end if;
    d := replace(d, $m$when 'terceiro_servico' then 'terceiros'$m$, $m$when 'terceiro_servico' then 'terceiros' when 'ponto_dia' then 'rh'$m$);
    execute d;
  end if;
end $do$;
