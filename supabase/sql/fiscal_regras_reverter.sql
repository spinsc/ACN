-- Desfaz fiscal_regras.sql (27/11/2026): apaga as duas tabelas das regras fiscais versionadas, os gatilhos e as funções.
-- ATENÇÃO: apaga as regras e o histórico de versões. Só use se ninguém gravou regra de verdade (ou depois de guardar uma cópia).
set local lock_timeout = '3s';
drop function if exists public.fiscal_regras_aprovar(uuid, text);
drop function if exists public.fiscal_regras_descartar(uuid);
drop function if exists public.fiscal_regras_nova_versao(uuid, text);
drop function if exists public.fiscal_regras_conflitos(uuid);
drop table if exists public.fiscal_regras;
drop table if exists public.fiscal_regras_versoes;
drop function if exists public.fiscal_regras_guarda();
drop function if exists public.fiscal_regras_versoes_guarda();
