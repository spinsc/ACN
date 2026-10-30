-- 29/10/2026 (PLANO_SAC_FLUXO.md, etapa S4): cancelar OS com motivo, e saber há quantos dias a OS está na mesma etapa.
-- `status_desde`: o instante em que a OS entrou na etapa em que está (o gatilho marca na criação e a cada troca de etapa). Nulo = OS anterior a esta regra: a tela usa a última atualização como aproximação
-- (nenhuma OS existente é regravada: não há preenchimento retroativo).
-- `motivo_cancelamento`, `cancelada_em`, `cancelada_por`: preenchidos só ao cancelar (o status "Cancelada" já era previsto no menu da OS, mas nada o gravava).
alter table public.sac_ordens_servico add column if not exists status_desde timestamptz;
alter table public.sac_ordens_servico add column if not exists motivo_cancelamento text;
alter table public.sac_ordens_servico add column if not exists cancelada_em timestamptz;
alter table public.sac_ordens_servico add column if not exists cancelada_por text;
comment on column public.sac_ordens_servico.status_desde is 'Quando a OS entrou na etapa atual (gatilho). Nulo = OS anterior à regra.';
comment on column public.sac_ordens_servico.motivo_cancelamento is 'Motivo informado pelo SAC ao cancelar a OS (status Cancelada).';

create or replace function public.sac_os_marca_status_desde()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status_desde := coalesce(new.status_desde, now());
  elsif new.status is distinct from old.status then
    new.status_desde := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.sac_os_marca_status_desde() from public, anon, authenticated;

drop trigger if exists trg_sac_os_status_desde on public.sac_ordens_servico;
create trigger trg_sac_os_status_desde before insert or update on public.sac_ordens_servico
  for each row execute function public.sac_os_marca_status_desde();
