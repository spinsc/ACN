-- Desfaz fiscal_arquivo_de_notas.sql (26/11/2026). APAGA as notas, eventos, inutilizações e XMLs guardados: só rode com o OK do usuário
-- e depois de conferir as contagens (se não forem zero, há nota guardada pelo Fiscal; os XMLs originais continuam onde a pessoa os pegou).
--   select (select count(*) from public.fiscal_notas) notas, (select count(*) from public.fiscal_eventos) eventos,
--          (select count(*) from public.fiscal_inutilizacoes) inutilizacoes, (select count(*) from public.fiscal_arquivos) arquivos;
set local lock_timeout = '3s';
drop function if exists public.fiscal_guardar(jsonb, jsonb, jsonb);
drop table if exists public.fiscal_notas_valores;
drop table if exists public.fiscal_arquivos;
drop table if exists public.fiscal_eventos;
drop table if exists public.fiscal_inutilizacoes;
drop table if exists public.fiscal_notas;
