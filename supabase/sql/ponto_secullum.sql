-- Ponto Secullum (PLANO_PONTO_SECULLUM.md, etapa P2) — 19/11/2026
-- A cópia do ponto dos CLT da Detech no nosso banco: o dia a dia de cada pessoa, os totais do mês e o registro de cada rodada de atualização.
-- Quem grava é só a função de servidor `ponto-secullum` (com a chave de serviço); quem entrou só LÊ, e só o que lhe cabe:
--   • RH, Admin e gerentes veem todos (`ponto_pode_ver_todos`);
--   • cada pessoa vê o próprio ponto (`ponto_meu_rh_id`, que liga o usuário à ficha do RH).
-- Chave pública sem direito nenhum. Política com `(select f())` (regra de custo do banco de 13/11/2026).

-- ── 1. Tabelas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ponto_dias (
  rh_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  dia date not null,
  -- coluna da Secullum → valor, só as preenchidas ("Entrada 1": "08:01", "Normais": "08:48", "Ex50%": "01:10"…): as colunas variam por pessoa, então se lê pelo NOME
  valores jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (rh_id, dia)
);
create table if not exists public.ponto_totais (
  rh_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  mes date not null,                 -- sempre o dia 1 do mês
  ate_dia date not null,             -- até que dia o cálculo foi feito (mês corrente: hoje)
  valores jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (rh_id, mes)
);
create table if not exists public.ponto_rodadas (
  id bigint generated always as identity primary key,
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  origem text not null check (origem in ('rotina', 'botao')),
  por text,                          -- quem apertou o botão; a rotina diz "rotina"
  ok boolean,
  pessoas integer not null default 0,
  consultas_calculo integer not null default 0,   -- cada pessoa/mês gasta 1 das 100 consultas por hora que a Secullum dá ao cálculo
  restante_na_hora integer,          -- o que a Secullum disse que ainda sobrava na hora, ao fim da rodada
  erro text,
  detalhes jsonb not null default '{}'::jsonb      -- sem_par (ids do RH), so_na_secullum (quantidade), erros por pessoa (id + frase)
);
create index if not exists ponto_rodadas_iniciada_idx on public.ponto_rodadas (iniciada_em desc);
create index if not exists ponto_dias_dia_idx on public.ponto_dias (dia);

-- o segredo que a rotina agendada manda à função: nasce aqui, só o servidor o lê (nenhuma política, nenhum direito a quem entrou)
create table if not exists public.ponto_rotina_segredo (
  id integer primary key check (id = 1),
  segredo text not null
);
insert into public.ponto_rotina_segredo (id, segredo) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

-- ── 2. Quem é quem ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Liga a ficha do RH ao usuário do sistema: pela marca `usuario_id` do RH; se não houver, pelo e-mail; se não houver, pelo nome inteiro.
-- Só vale quando o casamento é ÚNICO (dois candidatos = ninguém: nunca se chuta). Em 19/11/2026 `usuario_id` estava vazio em todas as fichas.
create or replace function public.ponto_usuario_de(p_rh uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select id, usuario_id, lower(trim(coalesce(email, ''))) email, regexp_replace(lower(trim(coalesce(nome, ''))), '\s+', ' ', 'g') nome from public.rh_funcionarios where id = p_rh),
  por_marca as (select u.id from public.auth_usuarios u, r where r.usuario_id is not null and u.id = r.usuario_id and coalesce(u.ativo, false)),
  por_email as (select u.id from public.auth_usuarios u, r where r.email <> '' and lower(trim(coalesce(u.email, ''))) = r.email and coalesce(u.ativo, false)),
  por_nome  as (select u.id from public.auth_usuarios u, r where r.nome <> '' and regexp_replace(lower(trim(coalesce(u.nome, ''))), '\s+', ' ', 'g') = r.nome and coalesce(u.ativo, false))
  select case when (select count(*) from por_marca) = 1 then (select id from por_marca)
              when (select count(*) from por_email) = 1 then (select id from por_email)
              when (select count(*) from por_nome) = 1 then (select id from por_nome) end;
$$;

create or replace function public.ponto_meu_rh_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select (array_agg(r.id))[1] from public.rh_funcionarios r
   where r.ativo and public.ponto_usuario_de(r.id) = (select public.usuario_atual_id())
  having count(*) = 1;
$$;

create or replace function public.ponto_pode_ver_todos() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select public.pode_ver_rh()), false) or coalesce((select public.perfil_atual()) ilike 'Gerente%', false);
$$;

-- a lista que o RH usa para ver quem ainda não consegue abrir o próprio ponto (não achamos o usuário da ficha); só quem tem a aba RH
create or replace function public.ponto_ligacoes() returns table (rh_id uuid, usuario_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, public.ponto_usuario_de(r.id) from public.rh_funcionarios r
   where (select public.pode_ver_rh()) and r.ativo and r.tipo_colaborador = 'Funcionário';
$$;

-- ── 3. Acesso ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.ponto_dias enable row level security;
alter table public.ponto_totais enable row level security;
alter table public.ponto_rodadas enable row level security;
alter table public.ponto_rotina_segredo enable row level security;

drop policy if exists ponto_dias_le on public.ponto_dias;
create policy ponto_dias_le on public.ponto_dias for select to authenticated
  using (rh_id = (select public.ponto_meu_rh_id()) or (select public.ponto_pode_ver_todos()));
drop policy if exists ponto_totais_le on public.ponto_totais;
create policy ponto_totais_le on public.ponto_totais for select to authenticated
  using (rh_id = (select public.ponto_meu_rh_id()) or (select public.ponto_pode_ver_todos()));
drop policy if exists ponto_rodadas_le on public.ponto_rodadas;
create policy ponto_rodadas_le on public.ponto_rodadas for select to authenticated
  using ((select public.ponto_pode_ver_todos()));

revoke all on public.ponto_dias, public.ponto_totais, public.ponto_rodadas, public.ponto_rotina_segredo from anon, public, authenticated;
grant select on public.ponto_dias, public.ponto_totais, public.ponto_rodadas to authenticated;

revoke all on function public.ponto_usuario_de(uuid) from public, anon, authenticated;
revoke all on function public.ponto_meu_rh_id() from public, anon;
revoke all on function public.ponto_pode_ver_todos() from public, anon;
revoke all on function public.ponto_ligacoes() from public, anon;
grant execute on function public.ponto_meu_rh_id() to authenticated;
grant execute on function public.ponto_pode_ver_todos() to authenticated;
grant execute on function public.ponto_ligacoes() to authenticated;

-- ── 4. A rotina: 8h30 e 20h30 de Brasília (11h30 e 23h30 em UTC; o Brasil não tem horário de verão desde 2019), todos os dias ──────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.ponto_disparar_rotina() returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare seg text; pedido bigint;
begin
  select segredo into seg from public.ponto_rotina_segredo where id = 1;
  select net.http_post(
    url := 'https://qgemelnuqdilnggxmrdw.supabase.co/functions/v1/ponto-secullum',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k', 'x-ponto-rotina', seg),
    body := jsonb_build_object('acao', 'sincronizar', 'origem', 'rotina'),
    timeout_milliseconds := 60000
  ) into pedido;
  return pedido;
end $$;
revoke all on function public.ponto_disparar_rotina() from public, anon, authenticated;

select cron.schedule('ponto-secullum-manha', '30 11 * * *', 'select public.ponto_disparar_rotina()');
select cron.schedule('ponto-secullum-noite', '30 23 * * *', 'select public.ponto_disparar_rotina()');
