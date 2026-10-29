-- 29/10/2026 (queda do sistema de 28/10): grava a nova ordem dos cartões do CRM numa chamada só, mexendo apenas nos cartões cuja posição mudou.
create or replace function public.crm_reordenar_cards(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path to 'public'
as $$
declare n integer;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  update public.crm_oportunidades c set posicao = x.pos
    from (select t.id, t.ord::integer as pos from unnest(p_ids) with ordinality as t(id, ord)) x
   where c.id = x.id and c.posicao is distinct from x.pos;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_reordenar_cards(uuid[]) from public, anon;
grant execute on function public.crm_reordenar_cards(uuid[]) to authenticated;
