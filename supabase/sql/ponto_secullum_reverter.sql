-- Desfaz supabase/sql/ponto_secullum.sql (a cópia do ponto some; o que está na Secullum não muda).
select cron.unschedule('ponto-secullum-manha');
select cron.unschedule('ponto-secullum-noite');
drop function if exists public.ponto_disparar_rotina();
drop function if exists public.ponto_ligacoes();
drop function if exists public.ponto_pode_ver_todos();
drop function if exists public.ponto_meu_rh_id();
drop function if exists public.ponto_usuario_de(uuid);
drop table if exists public.ponto_rotina_segredo;
drop table if exists public.ponto_rodadas;
drop table if exists public.ponto_totais;
drop table if exists public.ponto_dias;
-- a extensão pg_net fica (outras rotinas podem passar a usá-la)
