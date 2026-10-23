-- Telecom, fatia T2 (pedido do usuário em 22/10/2026): cada item do Cadastro de itens passa a dizer QUEM SEPARA e embala quando a venda é de envio de material.
-- Aplicada pelo apply_migration "telecom_t2_cadastro_itens_setor_separacao" em 22/10/2026 (4.474 itens, nenhum com setor: coluna nova e opcional, nada mudou nas linhas existentes).
-- Vazio = o padrão da venda (Almoxarifado; numa OP de tipo Rádio em envio o padrão é o Telecom, ver src/SeparacaoEnvio.ts). Só aceita os dois setores que separam hoje.
alter table public.cadastro_itens add column if not exists setor_separacao text;

alter table public.cadastro_itens drop constraint if exists cadastro_itens_setor_separacao_chk;
alter table public.cadastro_itens add constraint cadastro_itens_setor_separacao_chk
  check (setor_separacao is null or setor_separacao in ('Almoxarifado', 'Telecom'));

comment on column public.cadastro_itens.setor_separacao is
  'Quem separa e embala este item numa venda de envio de material: Almoxarifado ou Telecom. Vazio = o padrão da venda. Vira itens_vendidos[].setor ao montar a OP (Telecom, T2, 22/10/2026).';

-- Para desfazer (a coluna é nova e só o Telecom a usa):
--   alter table public.cadastro_itens drop constraint if exists cadastro_itens_setor_separacao_chk;
--   alter table public.cadastro_itens drop column if exists setor_separacao;
