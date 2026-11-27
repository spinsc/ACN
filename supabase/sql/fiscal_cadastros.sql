-- Preparação do módulo fiscal (pedido do usuário em 26/11/2026): os cadastros que a emissão de nota vai precisar e que o sistema não tinha.
-- Nada aqui emite nota nem muda tabela que já existia: são QUATRO TABELAS NOVAS. Os dados fiscais do cliente e do item ficam em tabelas-irmãs
-- (uma linha por cliente / por item, só quando alguém preenche), no mesmo desenho de `cadastro_itens_valores`: assim `clientes` e `cadastro_itens`,
-- lidas por quase todas as telas, não ganham coluna, não ficam mais pesadas e não são travadas pela migração.
-- Campo vazio (nulo) = "ninguém respondeu ainda": é o que o relatório de pendências do Fiscal conta. Por isso nenhum campo tem valor padrão.
-- Para desfazer: fiscal_cadastros_reverter.sql (apaga as quatro tabelas; só use se ninguém preencheu nada).

set local lock_timeout = '3s';

-- 1) Dados fiscais do cliente (o destinatário da nota)
create table if not exists public.fiscal_clientes (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  inscricao_estadual text,          -- só dígitos; vazio quando o cliente não tem
  indicador_ie text check (indicador_ie in ('contribuinte', 'isento', 'nao_contribuinte')),   -- vira o "indicador da IE do destinatário" da nota
  tipo_orgao text check (tipo_orgao in ('nenhum', 'estadual_sc', 'estadual_outro', 'municipal', 'federal')),   -- órgão público muda o imposto (isenção em SC)
  retem_ir boolean,                 -- o cliente retém imposto de renda no pagamento?
  codigo_ibge text check (codigo_ibge ~ '^[0-9]{7}$'),   -- código do município (a nota exige; o CEP do sistema não o traz)
  inscricao_municipal text,         -- para a nota de serviço
  inscricao_suframa text,           -- venda para área de livre comércio / Zona Franca
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por_id uuid            -- auth_usuarios.id de quem preencheu por último (pessoa é o ID)
);

-- 2) Dados fiscais do item (o produto da nota). O NCM e o IPI (%) continuam em cadastro_itens.
create table if not exists public.fiscal_itens (
  item_id uuid primary key references public.cadastro_itens(id) on delete cascade,
  cest text check (cest ~ '^[0-9]{7}$'),
  cest_nao_se_aplica boolean not null default false,   -- muito NCM não tem CEST: marcar aqui tira o item da lista de pendências
  origem_fiscal smallint check (origem_fiscal between 0 and 8),   -- 0 nacional, 1 importado direto, 2 importado comprado aqui... (tabela da nota)
  monofasico boolean,               -- PIS/COFINS monofásico (nulo = ninguém respondeu)
  enquadramento_ipi text check (enquadramento_ipi ~ '^[0-9]{3}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por_id uuid
);

-- 3) As empresas que emitem nota (hoje ACN e DETECH). Sem certificado digital e sem senha: isso NUNCA mora no banco do sistema.
create table if not exists public.fiscal_emitentes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,      -- 'ACN', 'DETECH' (o mesmo nome curto que o resto do sistema usa)
  razao_social text,
  nome_fantasia text,
  cnpj text,                        -- só dígitos
  inscricao_estadual text,
  inscricao_municipal text,
  crt smallint check (crt in (1, 2, 3, 4)),   -- regime: 1 Simples, 2 Simples com excesso, 3 regime normal, 4 MEI
  cnae text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text,
  codigo_ibge text check (codigo_ibge ~ '^[0-9]{7}$'),
  telefone text,
  email_fiscal text,
  serie_nfe integer,                -- a série em uso hoje
  serie_nfe_nova integer,           -- a série reservada para o emissor novo (na transição as duas não podem ser a mesma)
  serie_nfse text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por_id uuid
);

-- 4) Transportadoras (a nota leva CNPJ, inscrição estadual e endereço de quem transporta; hoje o frete guarda só o nome digitado)
create table if not exists public.fiscal_transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  razao_social text,
  documento text,                   -- CNPJ ou CPF, só dígitos
  inscricao_estadual text,
  rntrc text,                       -- registro da ANTT, quando houver
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text,
  telefone text,
  email text,
  observacao text,
  ativo boolean not null default true,   -- nada se apaga: transportadora que não se usa mais fica inativa
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por_id uuid
);
create unique index if not exists fiscal_transportadoras_documento_uk on public.fiscal_transportadoras (documento) where documento is not null;

-- Acesso: o banco só atende quem entrou (Etapa 17). A chave pública não lê nem grava.
alter table public.fiscal_clientes enable row level security;
alter table public.fiscal_itens enable row level security;
alter table public.fiscal_emitentes enable row level security;
alter table public.fiscal_transportadoras enable row level security;
revoke all on public.fiscal_clientes, public.fiscal_itens, public.fiscal_emitentes, public.fiscal_transportadoras from anon, public;

-- Cliente e item: a mesma regra das tabelas-mãe (quem entrou lê e grava; a tela é que diz quem edita).
drop policy if exists etapa17_logado on public.fiscal_clientes;
create policy etapa17_logado on public.fiscal_clientes for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));
drop policy if exists etapa17_logado on public.fiscal_itens;
create policy etapa17_logado on public.fiscal_itens for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));

-- Empresa emitente: todos leem (o nome e a série aparecem em outras telas no futuro); só quem tem a aba Fiscal (e o Admin) grava.
drop policy if exists etapa17_logado on public.fiscal_emitentes;
create policy etapa17_logado on public.fiscal_emitentes for select to authenticated
  using ((select public.esta_logado()));
drop policy if exists etapa17_abas on public.fiscal_emitentes;
create policy etapa17_abas on public.fiscal_emitentes for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal']))) with check ((select public.tem_alguma_aba(array['fiscal'])));

-- Transportadora: todos leem; Fiscal e Logística gravam.
drop policy if exists etapa17_logado on public.fiscal_transportadoras;
create policy etapa17_logado on public.fiscal_transportadoras for select to authenticated
  using ((select public.esta_logado()));
drop policy if exists etapa17_abas on public.fiscal_transportadoras;
create policy etapa17_abas on public.fiscal_transportadoras for all to authenticated
  using ((select public.tem_alguma_aba(array['fiscal', 'logistica']))) with check ((select public.tem_alguma_aba(array['fiscal', 'logistica'])));
