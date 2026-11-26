-- "Ver valores" no banco, onda V4d (26/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 11): FECHAR o frete, as cotações de frete, as aprovações de frete e o pedido de faturamento.
-- ESCRITO, NÃO APLICADO. Pré-requisitos: V4a aplicada e V4b e V4c publicadas (as telas já leem as tabelas novas e nenhuma grava dinheiro lido de uma conta sem valores). Aplicar FORA DO HORÁRIO e só com o OK do usuário.
-- Antes: ensaio de custo (supabase/sql/ensaio_de_custo.sql, com este arquivo no lugar marcado, fora do horário). Depois: conferência com a conta ZZTESTE (sem a caixa) e /saude-banco.
--
-- Como passa a funcionar (o dinheiro estava em QUATRO lugares; os quatro saem das tabelas de origem):
--   * `pcp_fretes.valor_frete` e `valor_nota`, `pcp_cotacoes_fretes.valor`, `pcp_aprovacoes_fretes.valor_no_momento` e `pcp_pedidos_faturamento.valor` ficam sempre nulos.
--   * O que o front (e `gerar_pedido_faturamento`) gravar nessas colunas é DESVIADO por um gatilho BEFORE para as tabelas `*_valores` (Admin e quem tem "Ver valores" leem).
--   * Valor nulo NUNCA apaga o valor guardado (nenhum caminho do sistema apaga valor de frete ou de cotação gravando nulo; a cotação apagada deixa a linha de valor solta, sem efeito).
--   * O espelho da V4a sai ANTES de zerar (senão o zeramento copiaria nulos para as tabelas novas); a limpeza não passa pelo desvio, que entra depois.
-- Volumes em 26/11/2026: 19 fretes, 17 cotações, 0 aprovações, 205 pedidos de faturamento. Nenhum outro gatilho de negócio nessas tabelas (só o de identidade de pessoa, que não olha dinheiro);
-- nenhuma visão, política, índice ou agendamento (pg_cron) lê as colunas antigas; `gerar_pedido_faturamento` já lê o valor da tabela nova (V3d) e insere o faturamento, que o desvio trata.
set local lock_timeout = '3s';

-- 1) cópia de segurança do estado de AGORA (a da V4a é de 25/11 e não tem o que entrou depois)
create table if not exists public.pcp_fretes_antes_v4d_20261126 as
  select id, valor_frete, valor_nota, now() as copiado_em from public.pcp_fretes;
alter table public.pcp_fretes_antes_v4d_20261126 enable row level security;
create table if not exists public.pcp_cotacoes_fretes_antes_v4d_20261126 as
  select id, valor, now() as copiado_em from public.pcp_cotacoes_fretes;
alter table public.pcp_cotacoes_fretes_antes_v4d_20261126 enable row level security;
create table if not exists public.pcp_aprovacoes_fretes_antes_v4d_20261126 as
  select id, valor_no_momento, now() as copiado_em from public.pcp_aprovacoes_fretes;
alter table public.pcp_aprovacoes_fretes_antes_v4d_20261126 enable row level security;
create table if not exists public.pcp_pedidos_faturamento_antes_v4d_20261126 as
  select id, valor, now() as copiado_em from public.pcp_pedidos_faturamento;
alter table public.pcp_pedidos_faturamento_antes_v4d_20261126 enable row level security;

-- 2) o espelho da V4a sai ANTES de zerar
drop trigger if exists frete_espelhar_valores_upd on public.pcp_fretes;
drop trigger if exists frete_espelhar_valores_ins on public.pcp_fretes;
drop trigger if exists cotacao_frete_espelhar_valores_upd on public.pcp_cotacoes_fretes;
drop trigger if exists cotacao_frete_espelhar_valores_ins on public.pcp_cotacoes_fretes;
drop trigger if exists aprovacao_frete_espelhar_valores_upd on public.pcp_aprovacoes_fretes;
drop trigger if exists aprovacao_frete_espelhar_valores_ins on public.pcp_aprovacoes_fretes;
drop trigger if exists faturamento_espelhar_valores_upd on public.pcp_pedidos_faturamento;
drop trigger if exists faturamento_espelhar_valores_ins on public.pcp_pedidos_faturamento;

-- 3) as tabelas novas passam a ter, sem exceção, o que está nas colunas antigas (o espelho já fazia isso; aqui só se garante, sem apagar nada: valor novo só entra onde faltava)
insert into public.pcp_fretes_valores as v (frete_id, valor_frete, valor_nota, atualizado_em)
  select id, valor_frete, valor_nota, now() from public.pcp_fretes where valor_frete is not null or valor_nota is not null
  on conflict (frete_id) do update set valor_frete = coalesce(v.valor_frete, excluded.valor_frete), valor_nota = coalesce(v.valor_nota, excluded.valor_nota);
insert into public.pcp_cotacoes_fretes_valores as v (cotacao_id, valor, atualizado_em)
  select id, valor, now() from public.pcp_cotacoes_fretes where valor is not null
  on conflict (cotacao_id) do update set valor = coalesce(v.valor, excluded.valor);
insert into public.pcp_aprovacoes_fretes_valores as v (aprovacao_id, valor_no_momento, atualizado_em)
  select id, valor_no_momento, now() from public.pcp_aprovacoes_fretes where valor_no_momento is not null
  on conflict (aprovacao_id) do update set valor_no_momento = coalesce(v.valor_no_momento, excluded.valor_no_momento);
insert into public.pcp_pedidos_faturamento_valores as v (faturamento_id, valor, atualizado_em)
  select id, valor, now() from public.pcp_pedidos_faturamento where valor is not null
  on conflict (faturamento_id) do update set valor = coalesce(v.valor, excluded.valor);

-- 4) os gatilhos de desvio (security definer: quem grava pode não ver valores). BEFORE: a linha segue para a tabela já sem o dinheiro. Nulo nunca apaga.
create or replace function public.frete_desviar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.valor_frete is not null or new.valor_nota is not null then
    insert into public.pcp_fretes_valores as v (frete_id, valor_frete, valor_nota, atualizado_em) values (new.id, new.valor_frete, new.valor_nota, now())
    on conflict (frete_id) do update set valor_frete = coalesce(excluded.valor_frete, v.valor_frete), valor_nota = coalesce(excluded.valor_nota, v.valor_nota), atualizado_em = now();
  end if;
  new.valor_frete := null; new.valor_nota := null;
  return new;
end; $function$;
create or replace function public.cotacao_frete_desviar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.valor is not null then
    insert into public.pcp_cotacoes_fretes_valores as v (cotacao_id, valor, atualizado_em) values (new.id, new.valor, now())
    on conflict (cotacao_id) do update set valor = coalesce(excluded.valor, v.valor), atualizado_em = now();
  end if;
  new.valor := null;
  return new;
end; $function$;
create or replace function public.aprovacao_frete_desviar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.valor_no_momento is not null then
    insert into public.pcp_aprovacoes_fretes_valores as v (aprovacao_id, valor_no_momento, atualizado_em) values (new.id, new.valor_no_momento, now())
    on conflict (aprovacao_id) do update set valor_no_momento = coalesce(excluded.valor_no_momento, v.valor_no_momento), atualizado_em = now();
  end if;
  new.valor_no_momento := null;
  return new;
end; $function$;
create or replace function public.faturamento_desviar_valores() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.valor is not null then
    insert into public.pcp_pedidos_faturamento_valores as v (faturamento_id, valor, atualizado_em) values (new.id, new.valor, now())
    on conflict (faturamento_id) do update set valor = coalesce(excluded.valor, v.valor), atualizado_em = now();
  end if;
  new.valor := null;
  return new;
end; $function$;
revoke all on function public.frete_desviar_valores(), public.cotacao_frete_desviar_valores(),
  public.aprovacao_frete_desviar_valores(), public.faturamento_desviar_valores() from public, anon, authenticated;

-- 5) zera o dinheiro das colunas antigas (a limpeza roda ANTES dos gatilhos de desvio entrarem)
update public.pcp_fretes set valor_frete = null, valor_nota = null where valor_frete is not null or valor_nota is not null;
update public.pcp_cotacoes_fretes set valor = null where valor is not null;
update public.pcp_aprovacoes_fretes set valor_no_momento = null where valor_no_momento is not null;
update public.pcp_pedidos_faturamento set valor = null where valor is not null;

-- 6) só agora os gatilhos de desvio entram
create trigger frete_desviar_valores_ins before insert on public.pcp_fretes
  for each row when (new.valor_frete is not null or new.valor_nota is not null) execute function public.frete_desviar_valores();
create trigger frete_desviar_valores_upd before update of valor_frete, valor_nota on public.pcp_fretes
  for each row when (new.valor_frete is not null or new.valor_nota is not null) execute function public.frete_desviar_valores();
create trigger cotacao_frete_desviar_valores_ins before insert on public.pcp_cotacoes_fretes
  for each row when (new.valor is not null) execute function public.cotacao_frete_desviar_valores();
create trigger cotacao_frete_desviar_valores_upd before update of valor on public.pcp_cotacoes_fretes
  for each row when (new.valor is not null) execute function public.cotacao_frete_desviar_valores();
create trigger aprovacao_frete_desviar_valores_ins before insert on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is not null) execute function public.aprovacao_frete_desviar_valores();
create trigger aprovacao_frete_desviar_valores_upd before update of valor_no_momento on public.pcp_aprovacoes_fretes
  for each row when (new.valor_no_momento is not null) execute function public.aprovacao_frete_desviar_valores();
create trigger faturamento_desviar_valores_ins before insert on public.pcp_pedidos_faturamento
  for each row when (new.valor is not null) execute function public.faturamento_desviar_valores();
create trigger faturamento_desviar_valores_upd before update of valor on public.pcp_pedidos_faturamento
  for each row when (new.valor is not null) execute function public.faturamento_desviar_valores();
drop function if exists public.frete_espelhar_valores();
drop function if exists public.cotacao_frete_espelhar_valores();
drop function if exists public.aprovacao_frete_espelhar_valores();
drop function if exists public.faturamento_espelhar_valores();

-- 7) conferência: se algo não bate, tudo é desfeito
do $$
declare a int; b int;
begin
  select count(*) into a from public.pcp_fretes where valor_frete is not null or valor_nota is not null;
  if a <> 0 then raise exception 'V4d: % fretes ainda com dinheiro nas colunas antigas', a; end if;
  select count(*) into a from public.pcp_cotacoes_fretes where valor is not null;
  if a <> 0 then raise exception 'V4d: % cotações de frete ainda com valor na coluna antiga', a; end if;
  select count(*) into a from public.pcp_aprovacoes_fretes where valor_no_momento is not null;
  if a <> 0 then raise exception 'V4d: % aprovações de frete ainda com valor na coluna antiga', a; end if;
  select count(*) into a from public.pcp_pedidos_faturamento where valor is not null;
  if a <> 0 then raise exception 'V4d: % pedidos de faturamento ainda com valor na coluna antiga', a; end if;
  -- as tabelas novas batem com a cópia de agora
  select count(*) into a from public.pcp_fretes_antes_v4d_20261126 x where x.valor_frete is not null or x.valor_nota is not null;
  select count(*) into b from public.pcp_fretes_antes_v4d_20261126 x join public.pcp_fretes_valores v on v.frete_id = x.id
   where (x.valor_frete is not null or x.valor_nota is not null) and v.valor_frete is not distinct from x.valor_frete and v.valor_nota is not distinct from x.valor_nota;
  if a <> b then raise exception 'V4d: a tabela dos fretes difere da cópia em % de % linhas', a - b, a; end if;
  select count(*) into a from public.pcp_cotacoes_fretes_antes_v4d_20261126 x where x.valor is not null;
  select count(*) into b from public.pcp_cotacoes_fretes_antes_v4d_20261126 x join public.pcp_cotacoes_fretes_valores v on v.cotacao_id = x.id where x.valor is not null and v.valor = x.valor;
  if a <> b then raise exception 'V4d: a tabela das cotações difere da cópia em % de % linhas', a - b, a; end if;
  select count(*) into a from public.pcp_aprovacoes_fretes_antes_v4d_20261126 x where x.valor_no_momento is not null;
  select count(*) into b from public.pcp_aprovacoes_fretes_antes_v4d_20261126 x join public.pcp_aprovacoes_fretes_valores v on v.aprovacao_id = x.id where x.valor_no_momento is not null and v.valor_no_momento = x.valor_no_momento;
  if a <> b then raise exception 'V4d: a tabela das aprovações difere da cópia em % de % linhas', a - b, a; end if;
  select count(*) into a from public.pcp_pedidos_faturamento_antes_v4d_20261126 x where x.valor is not null;
  select count(*) into b from public.pcp_pedidos_faturamento_antes_v4d_20261126 x join public.pcp_pedidos_faturamento_valores v on v.faturamento_id = x.id where x.valor is not null and v.valor = x.valor;
  if a <> b then raise exception 'V4d: a tabela do faturamento difere da cópia em % de % linhas', a - b, a; end if;
  -- os oito gatilhos de desvio existem e os do espelho saíram
  select count(*) into a from pg_trigger where not tgisinternal and tgname like '%\_desviar\_valores\_%' and tgrelid::regclass::text in ('pcp_fretes','pcp_cotacoes_fretes','pcp_aprovacoes_fretes','pcp_pedidos_faturamento');
  if a <> 8 then raise exception 'V4d: % gatilhos de desvio (esperado 8)', a; end if;
  select count(*) into a from pg_trigger where not tgisinternal and tgname like '%\_espelhar\_valores\_%' and tgrelid::regclass::text in ('pcp_fretes','pcp_cotacoes_fretes','pcp_aprovacoes_fretes','pcp_pedidos_faturamento');
  if a <> 0 then raise exception 'V4d: % gatilhos do espelho ainda ligados', a; end if;
end $$;

-- 8) autoteste dos gatilhos (cada bloco é desfeito, mesmo quando passa): gravar valor, gravar nulo por cima e inserir
do $$
declare fid uuid; cid uuid; pid uuid; aid uuid; x numeric; y numeric;
begin
  -- frete: valor e nota vão para a tabela nova, a coluna volta nula, e gravar nulo depois não apaga
  select id into fid from public.pcp_fretes order by id limit 1;
  if fid is null then raise notice 'V4d autoteste: nenhum frete para testar (ok)';
  else
    begin
      update public.pcp_fretes set valor_frete = 123.45, valor_nota = 67.89 where id = fid;
      select valor_frete, valor_nota into x, y from public.pcp_fretes_valores where frete_id = fid;
      if x is distinct from 123.45 or y is distinct from 67.89 then raise exception 'autoteste frete: o valor não foi para a tabela nova (% e %)', x, y; end if;
      if exists (select 1 from public.pcp_fretes where id = fid and (valor_frete is not null or valor_nota is not null)) then raise exception 'autoteste frete: a coluna antiga não voltou nula'; end if;
      update public.pcp_fretes set valor_frete = null where id = fid;
      select valor_frete into x from public.pcp_fretes_valores where frete_id = fid;
      if x is distinct from 123.45 then raise exception 'autoteste frete: gravar nulo apagou o valor (%)', x; end if;
      raise exception 'AUTOTESTE_OK';
    exception when others then
      if sqlerrm <> 'AUTOTESTE_OK' then raise; end if;
    end;
  end if;
  -- cotação de frete
  select id into cid from public.pcp_cotacoes_fretes order by id limit 1;
  if cid is null then raise notice 'V4d autoteste: nenhuma cotação de frete para testar (ok)';
  else
    begin
      update public.pcp_cotacoes_fretes set valor = 55.5 where id = cid;
      select valor into x from public.pcp_cotacoes_fretes_valores where cotacao_id = cid;
      if x is distinct from 55.5 then raise exception 'autoteste cotação: o valor não foi para a tabela nova (%)', x; end if;
      if exists (select 1 from public.pcp_cotacoes_fretes where id = cid and valor is not null) then raise exception 'autoteste cotação: a coluna antiga não voltou nula'; end if;
      raise exception 'AUTOTESTE_OK';
    exception when others then
      if sqlerrm <> 'AUTOTESTE_OK' then raise; end if;
    end;
  end if;
  -- pedido de faturamento
  select id into pid from public.pcp_pedidos_faturamento order by id limit 1;
  if pid is null then raise notice 'V4d autoteste: nenhum pedido de faturamento para testar (ok)';
  else
    begin
      update public.pcp_pedidos_faturamento set valor = 77.7 where id = pid;
      select valor into x from public.pcp_pedidos_faturamento_valores where faturamento_id = pid;
      if x is distinct from 77.7 then raise exception 'autoteste faturamento: o valor não foi para a tabela nova (%)', x; end if;
      if exists (select 1 from public.pcp_pedidos_faturamento where id = pid and valor is not null) then raise exception 'autoteste faturamento: a coluna antiga não voltou nula'; end if;
      raise exception 'AUTOTESTE_OK';
    exception when others then
      if sqlerrm <> 'AUTOTESTE_OK' then raise; end if;
    end;
  end if;
  -- aprovação de frete (a tabela está vazia hoje: insere uma de teste; se uma regra da tabela barrar a linha de teste, só avisa)
  if fid is not null then
    begin
      insert into public.pcp_aprovacoes_fretes (frete_id, nivel, nivel_nome, valor_no_momento, status) values (fid, 1, 'ZZ autoteste', 99.9, 'pendente') returning id into aid;
      select valor_no_momento into x from public.pcp_aprovacoes_fretes_valores where aprovacao_id = aid;
      if x is distinct from 99.9 then raise exception 'autoteste aprovação: o valor não foi para a tabela nova (%)', x; end if;
      if exists (select 1 from public.pcp_aprovacoes_fretes where id = aid and valor_no_momento is not null) then raise exception 'autoteste aprovação: a coluna antiga não voltou nula'; end if;
      raise exception 'AUTOTESTE_OK';
    exception when others then
      if sqlerrm = 'AUTOTESTE_OK' then null;
      elsif sqlstate in ('23502', '23503', '23505', '23514') then raise notice 'V4d autoteste: aprovação não testada (a linha de teste foi barrada: %)', sqlerrm;
      else raise; end if;
    end;
  end if;
end $$;

-- Reverter: supabase/sql/ver_valores_v4d_fechar_frete_faturamento_reverter.sql
