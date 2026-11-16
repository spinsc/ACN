-- Cadastro de fornecedores do Compras (pedido do usuário em 16/11/2026): o fornecedor de uma cotação tem de ser um fornecedor CADASTRADO; se não está, o comprador
-- o cadastra antes, na aba Fornecedores do Compras. Até aqui a cotação guardava só o nome digitado (382 cotações, 174 nomes diferentes, vários iguais escritos de jeitos diferentes).
-- Cadastro "mais completo" (escolha do usuário): razão social, CNPJ/CPF, contato, telefone, e-mail, endereço, condição de pagamento padrão, categorias de material, observação.
-- Os nomes antigos NÃO foram importados (escolha do usuário): as cotações antigas seguem com o nome digitado (fornecedor_id nulo) e o cadastro nasce vazio.
create table if not exists public.compras_fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                       -- nome fantasia, como o comprador o conhece e como aparece na cotação
  nome_norm text not null,                  -- sem acento e em minúsculas, para não cadastrar o mesmo fornecedor duas vezes
  razao_social text,
  cnpj_cpf text,                            -- só dígitos (11 = CPF, 14 = CNPJ)
  contato_nome text,
  telefone text,
  email text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text,
  condicao_pagamento text,                  -- sugestão para a cotação
  categorias text[] not null default '{}',  -- o que costuma fornecer (para achar quem cotar)
  observacao text,
  ativo boolean not null default true,      -- fornecedor que não se usa mais fica inativo (nada se apaga: as cotações antigas apontam para ele)
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz,
  atualizado_por text
);
create unique index if not exists compras_fornecedores_nome_norm_uk on public.compras_fornecedores (nome_norm);
create unique index if not exists compras_fornecedores_documento_uk on public.compras_fornecedores (cnpj_cpf) where cnpj_cpf is not null;

alter table public.compras_fornecedores enable row level security;
revoke all on public.compras_fornecedores from anon, public;
drop policy if exists etapa17_logado on public.compras_fornecedores;
create policy etapa17_logado on public.compras_fornecedores for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));

-- a cotação aponta para o fornecedor cadastrado; o nome continua gravado na cotação (a leitura, os relatórios e as cotações antigas seguem como estão)
alter table public.pcp_cotacoes_fornecedores add column if not exists fornecedor_id uuid references public.compras_fornecedores(id);
create index if not exists pcp_cotacoes_fornecedores_fornecedor_id_idx on public.pcp_cotacoes_fornecedores (fornecedor_id) where fornecedor_id is not null;

-- para desfazer (só se nenhuma cotação apontar para um fornecedor):
--   alter table public.pcp_cotacoes_fornecedores drop column fornecedor_id;
--   drop table public.compras_fornecedores;
