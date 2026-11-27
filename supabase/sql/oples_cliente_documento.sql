-- CPF/CNPJ do cliente na OP (pedido do usuário em 27/11/2026, a partir do Financeiro/Logística:
-- a cotação de frete precisa do CNPJ do cliente e do valor da NF-e).
-- Obrigatório na abertura da OP só no fluxo "envio de material" (regra da tela, não do banco).
-- Só dígitos (11 = CPF, 14 = CNPJ). Nula = ninguém informou; nenhuma OP existente é mexida.
-- É diferente de cnpj_faturamento (que pode diferir do cliente).
set lock_timeout = '3s';
alter table public.oples add column if not exists cliente_documento text;
comment on column public.oples.cliente_documento is
  'CPF (11) ou CNPJ (14) do cliente da OP, só dígitos; nulo = não informado. Obrigatório na Nova OP de envio de material.';
