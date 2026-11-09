-- Tela Início (09/11/2026, pedido do usuário): carrossel de imagens postado pelo RH (ex.: aniversariantes do mês), datas da empresa e aniversariantes da semana.
--
-- Por que existe: o RH pediu um lugar para postar a imagem dos aniversariantes do mês; o sistema passa a abrir numa tela de boas-vindas (Início) e o Dashboard geral continua no menu.
-- Quem posta: a marca `auth_usuarios.pode_postar_inicio` (decidido com o usuário: "uma marca no cadastro de usuários"); o Admin sempre pode. Todo mundo que entrou LÊ; só quem posta grava.
-- As imagens ficam num bucket PRIVADO próprio (acn-inicio), porque a imagem dos aniversariantes tem nomes de pessoas: a tela pede um endereço assinado de 1 hora, não existe endereço público.
-- Tudo aqui é acréscimo: nenhuma tabela ou linha existente é alterada (a coluna nova nasce falsa para todos).
-- Para voltar atrás: inicio_carrossel_reverter.sql.

-- 1) a marca no cadastro de usuários
alter table public.auth_usuarios add column if not exists pode_postar_inicio boolean not null default false;

-- 2) quem pode postar: Admin ou quem tem a marca (conferido pelo crachá do banco, como as outras regras por aba)
create or replace function public.pode_postar_inicio()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_postar_inicio, false)
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$f$;
revoke all on function public.pode_postar_inicio() from public, anon;
grant execute on function public.pode_postar_inicio() to authenticated;

-- 3) os slides do carrossel
create table if not exists public.inicio_slides (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  legenda text,
  imagem_path text not null,                         -- caminho no bucket acn-inicio (a tela gera o endereço assinado)
  imagem_nome text,                                  -- nome original do arquivo, para a lista
  area text,                                         -- quem postou (setor ou perfil), só para mostrar na lista
  link_tipo text not null default 'nenhum' check (link_tipo in ('nenhum', 'aba', 'url')),
  link_destino text,                                 -- id da aba do sistema ou endereço da internet
  exibir_de date,                                    -- vazio = já no ar
  exibir_ate date,                                   -- vazio = sem data final; passou desta data, sai do ar sozinho
  perfis_alvo text[],                                -- vazio = todos; senão só quem tem um destes perfis (filtro de relevância, não segredo)
  ordem integer not null default 0,
  rascunho boolean not null default false,
  criado_por_nome text,
  criado_por_email text,
  criado_em timestamptz not null default now(),
  atualizado_por_nome text,
  atualizado_em timestamptz not null default now(),
  check (exibir_ate is null or exibir_de is null or exibir_ate >= exibir_de)
);
create index if not exists inicio_slides_ordem on public.inicio_slides (ordem, criado_em);

-- 4) as datas da empresa (reunião, evento, recesso) que aparecem em "Próximos dias" junto dos feriados
create table if not exists public.inicio_datas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  data date not null,
  hora text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  local text,
  criado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists inicio_datas_data on public.inicio_datas (data);

-- 5) regras: quem entrou lê; só quem pode postar grava
alter table public.inicio_slides enable row level security;
alter table public.inicio_datas enable row level security;
do $pol$
declare t text;
begin
  foreach t in array array['inicio_slides', 'inicio_datas'] loop
    execute format('drop policy if exists inicio_ler on public.%I', t);
    execute format('drop policy if exists inicio_postar_inserir on public.%I', t);
    execute format('drop policy if exists inicio_postar_mudar on public.%I', t);
    execute format('drop policy if exists inicio_postar_apagar on public.%I', t);
    execute format('create policy inicio_ler on public.%I for select to authenticated using (public.esta_logado())', t);
    execute format('create policy inicio_postar_inserir on public.%I for insert to authenticated with check (public.pode_postar_inicio())', t);
    execute format('create policy inicio_postar_mudar on public.%I for update to authenticated using (public.pode_postar_inicio()) with check (public.pode_postar_inicio())', t);
    execute format('create policy inicio_postar_apagar on public.%I for delete to authenticated using (public.pode_postar_inicio())', t);
  end loop;
end $pol$;

-- 6) o bucket das imagens: PRIVADO, só imagem, até 5 MB. Ler: quem entrou. Enviar, trocar e apagar: quem pode postar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acn-inicio', 'acn-inicio', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "acn-inicio logado le" on storage.objects;
drop policy if exists "acn-inicio posta envia" on storage.objects;
drop policy if exists "acn-inicio posta troca" on storage.objects;
drop policy if exists "acn-inicio posta apaga" on storage.objects;
create policy "acn-inicio logado le" on storage.objects for select to authenticated using (bucket_id = 'acn-inicio' and public.esta_logado());
create policy "acn-inicio posta envia" on storage.objects for insert to authenticated with check (bucket_id = 'acn-inicio' and public.pode_postar_inicio());
create policy "acn-inicio posta troca" on storage.objects for update to authenticated using (bucket_id = 'acn-inicio' and public.pode_postar_inicio());
create policy "acn-inicio posta apaga" on storage.objects for delete to authenticated using (bucket_id = 'acn-inicio' and public.pode_postar_inicio());

-- 7) aniversariantes dos próximos dias, para a tela Início. A data de nascimento é dado do RH (a tabela é fechada por perfil): esta função devolve SÓ nome, departamento, dia e mês
--    de quem faz aniversário nos próximos p_dias dias (hoje conta), nunca o ano nem a idade. Quem saiu da empresa e quem não tem a data cadastrada ficam de fora.
create or replace function public.inicio_aniversariantes(p_dias integer default 7)
returns table (nome text, departamento text, dia integer, mes integer, em_dias integer)
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  base as (
    select f.nome, f.departamento, f.data_nascimento as nasc, h.d as hoje
    from public.rh_funcionarios f cross join hoje h
    where public.esta_logado() and coalesce(f.ativo, true) and f.data_desligamento is null and f.data_nascimento is not null
  ),
  este_ano as (
    -- 29/02 em ano que não é bissexto cai em 28/02 (make_date recusaria o dia inexistente)
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
$f$;
revoke all on function public.inicio_aniversariantes(integer) from public, anon;
grant execute on function public.inicio_aniversariantes(integer) to authenticated;
