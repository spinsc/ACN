-- Reverte a fatia T3 do banco (ramo dos serviços de terceiros no Calendário integrado): a base volta a juntar só as duas partes de antes e o CASE da aba perde a linha nova.
-- Nenhum dado é apagado (a T3 não gravou nada). Os avisos de serviço que a rotina já tenha criado ficam como estão e a própria rotina os resolve ("Sistema") na próxima rodada.
create or replace function public.calendario_eventos_base(p_inicio date, p_fim date)
returns table (fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[],
               aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  select * from public.calendario_eventos_base_1(p_inicio, p_fim)
  union all
  select * from public.calendario_eventos_mais(p_inicio, p_fim)
$$;
drop function if exists public.calendario_eventos_terceiros(date, date);
-- calendario_alvos sem a linha `terceiro_servico`: reaplicar a definição de supabase/sql/calendario_avisos_no_painel_avisos.sql (a função `calendario_alvos` dele)
