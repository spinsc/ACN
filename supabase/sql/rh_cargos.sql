-- Cargos do RH (pedido do usuário em 16/11/2026): uma lista fixa de cargos, cadastrada pelo RH como já é a de departamentos, e cada pessoa pode ter um ou mais.
-- Mesmo molde de rh_departamentos / rh_funcionario_departamentos (14/10/2026). A coluna de texto rh_funcionarios.cargo continua existindo e passa a guardar
-- os nomes dos cargos escolhidos, juntos por " / ": é ela que as visões, os relatórios e o seletor de responsáveis já leem, então nenhuma tela antiga precisou mudar.
-- Só estrutura: nenhuma linha de rh_funcionarios é mexida por este arquivo.
create table if not exists public.rh_cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_norm text not null unique,
  ordem integer,
  criado_em timestamptz not null default now(),
  criado_por text
);

create table if not exists public.rh_funcionario_cargos (
  funcionario_id uuid not null references public.rh_funcionarios(id) on delete cascade,
  cargo_id uuid not null references public.rh_cargos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (funcionario_id, cargo_id)
);

alter table public.rh_cargos enable row level security;
alter table public.rh_funcionario_cargos enable row level security;

create policy etapa17_logado on public.rh_cargos for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));
create policy etapa17_logado on public.rh_funcionario_cargos for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));

revoke all on public.rh_cargos from anon, public;
revoke all on public.rh_funcionario_cargos from anon, public;
