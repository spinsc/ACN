-- Reverte terceiros_servicos_t1.sql (Serviços de terceiros, fatia T1). Só apaga o que a T1 criou; roda inteiro, na ordem.
-- ATENÇÃO: apaga também os serviços, prestadores e tipos cadastrados depois da T1. Só use se nada de real foi lançado, ou depois de tirar uma cópia.
drop function if exists public.terceiros_cancelar(uuid[], text, text);
drop function if exists public.terceiros_voltar(uuid[], text, text, text);
drop function if exists public.terceiros_realizar(uuid[], date, numeric, text, text);
drop function if exists public.terceiros_agendar(uuid[], uuid, date, text, text, text);
drop function if exists public.terceiros_atualizar(uuid, jsonb, text);
drop function if exists public.terceiros_solicitar(uuid, text, jsonb, date, text, jsonb, uuid, numeric, text, boolean);
drop table if exists public.terceiros_servicos cascade;
drop table if exists public.terceiros_prestadores cascade;
drop table if exists public.terceiros_tipos cascade;
drop function if exists public.terceiros_pode_gerir_prestadores();
drop function if exists public.terceiros_pode_marcar_data(jsonb, text, uuid);
drop function if exists public.terceiros_pode_mexer(jsonb, text, uuid);
drop function if exists public.terceiros_ator();
drop function if exists public.terceiros_hoje();
drop function if exists public.terceiros_servico_numerar();
drop sequence if exists public.terceiros_servico_seq;
