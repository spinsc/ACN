-- 30/10/2026: o SAC passa a registrar o atendimento que já foi feito fora da fábrica (atendimento externo) e levar a OS direto a "Concluído".
-- Caso que originou: o lote de 7 viaturas da Defesa Civil de Taió (recall da prussiana, OS-0044 a 0050) foi atendido no local e as OS ficaram em "Em Cotação" sem caminho para concluir.
-- `atendimento_externo` guarda o registro: { data (AAAA-MM-DD), executor, observacao, registrado_por, registrado_em, etapa_de_antes }. Nulo = a OS não foi concluída por esse caminho.
-- Coluna nova, vazia em todas as OS que já existem: nenhuma linha antiga é regravada. A política de acesso da tabela (etapa17_logado) já cobre a coluna.
alter table public.sac_ordens_servico add column if not exists atendimento_externo jsonb;
comment on column public.sac_ordens_servico.atendimento_externo is 'Registro do atendimento já realizado fora da fábrica: data, executor, observacao, registrado_por, registrado_em, etapa_de_antes. Nulo = OS concluída pelo caminho normal.';
