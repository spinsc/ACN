-- Desfaz fiscal_cadastros.sql (26/11/2026). APAGA o que tiver sido preenchido nas quatro tabelas: só rode com o OK do usuário
-- e depois de conferir as contagens abaixo (se alguma não for zero, há dado digitado pelo Fiscal).
--   select (select count(*) from public.fiscal_clientes) clientes, (select count(*) from public.fiscal_itens) itens,
--          (select count(*) from public.fiscal_emitentes) emitentes, (select count(*) from public.fiscal_transportadoras) transportadoras;
set local lock_timeout = '3s';
drop table if exists public.fiscal_clientes;
drop table if exists public.fiscal_itens;
drop table if exists public.fiscal_emitentes;
drop table if exists public.fiscal_transportadoras;
