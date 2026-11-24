-- "Ver valores" no banco, onda V1 (24/11/2026; PLANO_VER_VALORES_NO_BANCO.md): custo e markup do cadastro de itens saem da tabela comum.
-- Decisões do usuário em 24/11/2026: o Admin vê sempre; quem lê é decidido POR ABA (não pela caixa "Ver valores").
-- A tabela-irmã `cadastro_itens_valores` guarda custo_unit, custo_embalagem, custo_fixo_pct e markup_pct (uma linha por item). Só quem tem uma das abas abaixo
-- (ou é Admin) lê e grava; o resto do sistema segue lendo `cadastro_itens` sem os valores.
-- Abas que precisam do custo: cadastro_itens, cadastro_produtos, formacao_precos, cotacoes e as que abrem a formação de preços dentro do card (crm, licitacoes, telecom).
--   Em 24/11/2026, 15 das 26 pessoas ativas têm pelo menos uma delas (a separação protege as outras).
-- NESTA ONDA AS COLUNAS ANTIGAS FICAM em `cadastro_itens` (nada é apagado): o código novo já não as lê. Elas só saem na V6, depois de conferido o uso real e com OK do usuário.
-- Cópia de segurança dos valores: cadastro_itens_custos_antes_20261124 (sem política: ninguém lê pelo sistema).
-- ATENÇÃO (custo do banco): aplicar FORA DO HORÁRIO; a cópia mexe em ~4.600 linhas de uma tabela nova, mas não toca em `cadastro_itens`.

set local lock_timeout = '3s'; -- a chave estrangeira toca em cadastro_itens: se houver fila de gravações, desiste em vez de travar o sistema

-- 1) cópia de segurança
create table if not exists public.cadastro_itens_custos_antes_20261124 as
  select id, custo_unit, custo_embalagem, custo_fixo_pct, markup_pct, now() as copiado_em from public.cadastro_itens;
alter table public.cadastro_itens_custos_antes_20261124 enable row level security;

-- 2) tabela-irmã
create table if not exists public.cadastro_itens_valores (
  item_id uuid primary key references public.cadastro_itens(id) on delete cascade,
  custo_unit numeric not null default 0,
  custo_embalagem numeric,
  custo_fixo_pct numeric not null default 3,
  markup_pct numeric not null default 30,
  atualizado_em timestamptz not null default now()
);
alter table public.cadastro_itens_valores enable row level security;
revoke all on public.cadastro_itens_valores from anon, public;

drop policy if exists etapa17_abas on public.cadastro_itens_valores;
create policy etapa17_abas on public.cadastro_itens_valores for all to authenticated
  using ((select public.tem_alguma_aba(array['cadastro_itens','cadastro_produtos','formacao_precos','cotacoes','crm','licitacoes','telecom'])))
  with check ((select public.tem_alguma_aba(array['cadastro_itens','cadastro_produtos','formacao_precos','cotacoes','crm','licitacoes','telecom'])));

-- 3) copia os valores que já existem (uma linha por item; repetir é seguro)
insert into public.cadastro_itens_valores (item_id, custo_unit, custo_embalagem, custo_fixo_pct, markup_pct, atualizado_em)
select id, coalesce(custo_unit, 0), custo_embalagem, coalesce(custo_fixo_pct, 3), coalesce(markup_pct, 30), coalesce(atualizado_em, now())
  from public.cadastro_itens
on conflict (item_id) do nothing;

-- 4) o histórico de unificação guarda o custo do item repetido: passa a seguir a mesma regra por aba
drop policy if exists etapa17_logado on public.itens_unificacoes;
drop policy if exists etapa17_abas on public.itens_unificacoes;
create policy etapa17_abas on public.itens_unificacoes for all to authenticated
  using ((select public.tem_alguma_aba(array['cadastro_itens','cadastro_produtos','formacao_precos','cotacoes'])))
  with check ((select public.tem_alguma_aba(array['cadastro_itens','cadastro_produtos','formacao_precos','cotacoes'])));

-- 5) unificar_item passa a ler o custo da tabela-irmã (a coluna antiga sai na V6)
do $$
declare v text;
begin
  v := pg_get_functiondef('public.unificar_item'::regproc);
  if v not like '%d.custo_unit%' then raise exception 'unificar_item: trecho esperado não encontrado'; end if;
  v := replace(v, '  v_txt text := ''%'' || p_dup::text || ''%'';', '  v_txt text := ''%'' || p_dup::text || ''%'';' || E'\n' || '  v_custo numeric;');
  v := replace(v, '  select * into p from public.cadastro_itens where id = p_princ;',
                  '  select custo_unit into v_custo from public.cadastro_itens_valores where item_id = p_dup;' || E'\n' || '  select * into p from public.cadastro_itens where id = p_princ;');
  v := replace(v, 'd.custo_unit', 'v_custo');
  if v not like '%v_custo numeric;%' or v not like '%into v_custo%' then raise exception 'unificar_item: troca incompleta'; end if;
  execute v;
end $$;

-- Reverter: drop table public.cadastro_itens_valores;
--   create policy etapa17_logado on public.itens_unificacoes for all to authenticated using ((select public.esta_logado())) with check ((select public.esta_logado()));
--   drop policy etapa17_abas on public.itens_unificacoes;
--   (unificar_item: refazer com `d.custo_unit`, como estava; as colunas antigas continuam na tabela.)
