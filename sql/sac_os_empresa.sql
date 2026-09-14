-- Empresa da OS do SAC (ACN ou DETECH), como o faturamento da OP.
-- OS antigas ficam sem valor (não se sabe de qual empresa eram) e podem ser
-- definidas pela lista do SAC. Aplicada em 13/09/2026 (migration sac_os_empresa).
alter table public.sac_ordens_servico add column if not exists empresa text
  check (empresa is null or empresa in ('ACN', 'DETECH'));
