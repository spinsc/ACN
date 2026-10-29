-- 29/10/2026 (pedido do usuário): a rotina que avisa o vendedor da OP quando o frete saiu e a entrega não foi confirmada (public.fretes_avisar_sem_entrega, em frete_sem_entrega_aviso.sql).
-- O banco não tinha nenhuma rotina agendada: esta é a primeira, e por isso liga a extensão pg_cron. Roda nos dias úteis às 11:00 UTC = 8:00 em Brasília (o Brasil não tem horário de verão desde 2019).
-- Para ver se rodou: select * from cron.job_run_details order by start_time desc limit 10;   Para desligar: select cron.unschedule('fretes-avisar-sem-entrega');
create extension if not exists pg_cron;
select cron.schedule('fretes-avisar-sem-entrega', '0 11 * * 1-5', 'select public.fretes_avisar_sem_entrega()');
