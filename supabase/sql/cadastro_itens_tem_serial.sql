-- Pedido do usuário em 27/10/2026: na Venda para Envio a lista de serial deve vir pronta (o Almoxarifado só digita o serial), e só com os itens que têm número de série
-- (o Conjunto Elétrico, o frete e o serviço não têm). A marca é do Cadastro de itens e começa desligada: nenhum item existente é alterado; quem cuida do cadastro liga
-- nos itens que recebem serial (controlador, sirene, amplificador...). Item sem a marca fica de fora da lista; venda sem nenhum item marcado segue com a digitação à mão de sempre.
alter table public.cadastro_itens add column if not exists tem_serial boolean not null default false;
comment on column public.cadastro_itens.tem_serial is 'O item recebe número de série na separação (Venda para Envio): entra sozinho na lista de seriais do Almoxarifado. O Conjunto Elétrico nunca tem.';
