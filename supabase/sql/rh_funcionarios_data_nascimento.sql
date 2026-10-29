-- 29/10/2026 (pedido do usuário): a ficha do colaborador no RH não tinha a data de nascimento (o e-mail já existia, na coluna `email`).
-- Coluna nova, vazia em todos os colaboradores: nenhum dado existente é mexido. Fica de fora da visão `rh_funcionarios_basico` (que todo usuário logado lê) de propósito: é dado pessoal e só quem tem acesso ao RH enxerga, como o CPF e o endereço.
alter table public.rh_funcionarios add column if not exists data_nascimento date;
comment on column public.rh_funcionarios.data_nascimento is 'Data de nascimento do colaborador (ficha do RH). Nula = não informada.';
