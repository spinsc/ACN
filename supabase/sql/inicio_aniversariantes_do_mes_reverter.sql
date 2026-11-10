-- Desfaz inicio_aniversariantes_do_mes.sql (09/11/2026): tira as duas funções novas. A função de 7 dias (inicio_aniversariantes) nunca saiu do banco.
drop function if exists public.inicio_aniversariantes_do_mes();
drop function if exists public.inicio_aniversariantes_cobertura();
