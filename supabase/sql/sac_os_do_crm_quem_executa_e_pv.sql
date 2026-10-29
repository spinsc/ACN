-- 29/10/2026 (PLANO_SAC_FLUXO.md, etapa S3): a OS lançada pelo card do CRM passa a nascer com caminho (já vendida: sem cotação, direto para a execução).
-- `quem_executa`: 'laboratorio' (nasce Aprovada e o Laboratório recebe a demanda de execução) ou 'sac' (nasce Em Execução e o SAC conclui). Nula = OS anterior a esta regra.
-- `numero_pv`: o pedido de venda do card (4 dígitos), para o SAC e o Fiscal verem a venda de onde a OS veio. Nula = OS sem pedido de venda.
-- Colunas novas, vazias em todas as OS que já existem: nenhuma linha antiga é regravada.
alter table public.sac_ordens_servico add column if not exists quem_executa text;
alter table public.sac_ordens_servico add column if not exists numero_pv text;
alter table public.sac_ordens_servico drop constraint if exists sac_os_quem_executa_valido;
alter table public.sac_ordens_servico add constraint sac_os_quem_executa_valido check (quem_executa is null or quem_executa in ('laboratorio', 'sac'));
comment on column public.sac_ordens_servico.quem_executa is 'Quem executa a OS lançada pelo card do CRM: laboratorio (demanda de execução) ou sac (o SAC conclui). Nula = OS antiga.';
comment on column public.sac_ordens_servico.numero_pv is 'Pedido de venda (4 dígitos) do card do CRM de onde a OS foi lançada. Nulo = sem pedido de venda.';
