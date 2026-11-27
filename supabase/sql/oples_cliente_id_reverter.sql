-- Desfaz oples_cliente_id.sql (27/11/2026). Só tira a ligação OP ↔ cliente do cadastro; `cliente_nome` e o resto da OP não são tocados.
-- ATENÇÃO: apagar a coluna perde as ligações já feitas pelo Fiscal (a prontidão volta a achar o cliente só pelo nome).
set local lock_timeout = '3s';
drop trigger if exists oples_cliente_id_acompanha_o_nome on public.oples;
drop function if exists public.oples_cliente_id_acompanha_o_nome();
drop index if exists public.oples_cliente_id_idx;
alter table public.oples drop column if exists cliente_id;
