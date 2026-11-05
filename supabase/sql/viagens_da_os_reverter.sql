-- Volta atrás de viagens_da_os.sql (05/11/2026). A coluna só é apagada se nenhuma OS tiver viagem_id (confira antes: select count(*) from sac_ordens_servico where viagem_id is not null).
drop trigger if exists viagens_sincronizar_os on public.sac_ordens_servico;
drop function if exists public.viagens_sincronizar_os();
drop function if exists public.viagens_refazer_ligacao_das_os(uuid);
-- alter table public.sac_ordens_servico drop column viagem_id;   -- só depois de conferir a contagem acima
