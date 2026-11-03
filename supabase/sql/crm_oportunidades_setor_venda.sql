-- 03/11/2026: a aba Vendas do Telecom (operador de vendas para o setor privado) trabalha nos MESMOS cards do CRM, sem funil nem tabela própria.
-- A marca diz de quem é o card: 'telecom' = lançado pela aba Vendas do Telecom; nula = card do CRM de sempre (os 232 existentes não são mexidos).
-- O card continua no funil 'venda_direta', por isso o CRM, o Dashboard, os relatórios e a Nova OP seguem enxergando-o.
alter table public.crm_oportunidades add column if not exists setor_venda text;
alter table public.crm_oportunidades drop constraint if exists crm_oportunidades_setor_venda_chk;
alter table public.crm_oportunidades add constraint crm_oportunidades_setor_venda_chk check (setor_venda is null or setor_venda in ('telecom'));
create index if not exists crm_oportunidades_setor_venda_idx on public.crm_oportunidades (setor_venda) where setor_venda is not null;
comment on column public.crm_oportunidades.setor_venda is 'Marca do card lançado pela aba Vendas do Telecom (setor privado: shoppings, condomínios etc.). Nula = card do CRM comum.';
