-- Desfaz terceiros_so_servico.sql (25/11/2026): tira o gatilho e a função e devolve a trava antiga do fluxo de entrega da OP.
-- ATENÇÃO: só reverta se NENHUMA OP usa o fluxo 'somente_servico_terceiro' (a trava antiga recusaria a OP). Confira antes:
--   select count(*) from public.oples where fluxo_entrega = 'somente_servico_terceiro';
set local lock_timeout = '3s';

drop trigger if exists terceiros_avancar_op on public.terceiros_servicos;
drop function if exists public.terceiros_avancar_op();

do $$
begin
  if exists (select 1 from public.oples where fluxo_entrega = 'somente_servico_terceiro') then
    raise exception 'Há OP no fluxo "somente_servico_terceiro": troque o fluxo delas antes de devolver a trava antiga.';
  end if;
end $$;

alter table public.oples add constraint oples_fluxo_entrega_check_antiga check (
  fluxo_entrega is null or fluxo_entrega = any (array[
    'adaptacao_matriz', 'adaptacao_externa', 'fabricacao_interna_envio', 'fabricacao_serralheria_envio',
    'envio_adaptacao_terceiro', 'envio_material'
  ])) not valid;
alter table public.oples validate constraint oples_fluxo_entrega_check_antiga;
alter table public.oples drop constraint oples_fluxo_entrega_check;
alter table public.oples rename constraint oples_fluxo_entrega_check_antiga to oples_fluxo_entrega_check;
