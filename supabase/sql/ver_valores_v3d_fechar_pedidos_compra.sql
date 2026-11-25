-- "Ver valores" no banco, onda V3d (24/11/2026; PLANO_VER_VALORES_NO_BANCO.md, seção 10): FECHAR o pedido de compra e a demanda do Compras.
-- ESCRITO, NÃO APLICADO. Pré-requisitos: V3a aplicada, V3b e V3c publicadas (as telas já leem as tabelas novas). Aplicar FORA DO HORÁRIO e só com o OK do usuário.
-- Antes: ensaio de custo (supabase/sql/ensaio_de_custo.sql, com este arquivo no lugar marcado, em grupo pequeno e fora do horário: o ensaio de 24/11 travou o sistema vivo).
-- Depois: conferência com a conta ZZTESTE (sem a caixa) e /saude-banco.
--
-- Como passa a funcionar (o dinheiro do pedido estava em TRÊS lugares; os três saem de `pcp_pedidos_compra`):
--   * `valor_compra` fica sempre nulo; `vencedoras[].valor` e `itens[].valor_unitario` deixam de existir na linha do pedido (o resto das listas, que NÃO é dinheiro, fica).
--   * O que o front de hoje grava nesses três lugares é DESVIADO por um gatilho para `pcp_pedidos_compra_valores` (Admin e quem tem "Ver valores" leem).
--   * Valor nulo NUNCA apaga o valor guardado, com UMA exceção: quando a vencedora sai do pedido (`vencedora_id` passa de preenchido a nulo: "voltar a etapa"), o valor da compra é zerado.
--   * `vencedoras_valores`: cotação que continua na lista mantém o valor guardado, a que sai da lista sai; valor novo vindo da gravação vence. Lista apagada = valores apagados.
--   * `itens_valores` (por posição): lista de itens com preço grava os preços novos; lista SEM preço (quem não vê valores) segue a antiga PELO NOME do item (e a ordem entre nomes repetidos),
--     então tirar um item da lista não desalinha os preços dos outros.
--   * `compras_dividir_pedido` passa a ser security definer (embrulho sobre a função de sempre, agora `_interna`) e leva o preço dos itens separados ao pedido novo.
--   * `gerar_pedido_faturamento` lê o valor da tabela nova (o pedido já não o tem). A tabela `pcp_pedidos_faturamento` é da V4 e ainda não é fechada.
--   * Demanda do Compras (`demandas_setoriais.valor_compra`): mesmo desvio, sem exceção (nulo nunca apaga).
--   * Efeito colateral: o gatilho `pcp_pedido_marca_movimentacao` deixa de ver como "movimentação" uma gravação que só mude dinheiro (a coluna já volta nula). Mudança de preço sozinha não silencia o alerta de entrega.
set local lock_timeout = '3s';

-- 1) cópia de segurança do estado de AGORA (inclui o instante da última movimentação, para conferir que a limpeza não o mexe)
create table if not exists public.pcp_pedidos_compra_antes_v3d_20261124 as
  select id, valor_compra, vencedoras, itens, ultima_movimentacao_em, now() as copiado_em from public.pcp_pedidos_compra;
alter table public.pcp_pedidos_compra_antes_v3d_20261124 enable row level security;
create table if not exists public.demandas_setoriais_antes_v3d_20261124 as
  select id, valor_compra, now() as copiado_em from public.demandas_setoriais where valor_compra is not null;
alter table public.demandas_setoriais_antes_v3d_20261124 enable row level security;

-- 2) o espelho da V3a sai ANTES de zerar (senão o zeramento gravaria nulos nas tabelas novas)
drop trigger if exists pedido_compra_espelhar_valores_upd on public.pcp_pedidos_compra;
drop trigger if exists pedido_compra_espelhar_valores_ins on public.pcp_pedidos_compra;
drop trigger if exists demanda_setorial_espelhar_valores_upd on public.demandas_setoriais;
drop trigger if exists demanda_setorial_espelhar_valores_ins on public.demandas_setoriais;

-- 3) as tabelas novas passam a ter, sem exceção, o que estava nas colunas antigas (o espelho já fazia isso; aqui só se garante, sem apagar nada)
insert into public.pcp_pedidos_compra_valores as v (pedido_id, valor_compra, vencedoras_valores, itens_valores, atualizado_em)
select p.id, p.valor_compra, x.vencedoras_valores, x.itens_valores, now()
  from public.pcp_pedidos_compra p cross join lateral public.pedido_compra_extrair_valores(p.vencedoras, p.itens) x
 where p.valor_compra is not null or x.vencedoras_valores is not null or x.itens_valores is not null
on conflict (pedido_id) do update set
  valor_compra = coalesce(excluded.valor_compra, v.valor_compra),
  vencedoras_valores = coalesce(excluded.vencedoras_valores, v.vencedoras_valores),
  itens_valores = coalesce(excluded.itens_valores, v.itens_valores);
insert into public.demandas_setoriais_valores as v (demanda_id, valor_compra, atualizado_em)
select id, valor_compra, now() from public.demandas_setoriais where valor_compra is not null
on conflict (demanda_id) do update set valor_compra = coalesce(excluded.valor_compra, v.valor_compra);

-- 4) tirar o dinheiro das duas listas (puras)
create or replace function public.pedido_vencedoras_sem_valor(p jsonb) returns jsonb language sql immutable as $function$
  select case when jsonb_typeof(p) = 'array'
    then coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'valor' else e end order by o) from jsonb_array_elements(p) with ordinality t(e, o)), '[]'::jsonb)
    else p end
$function$;
create or replace function public.pedido_itens_sem_preco(p jsonb) returns jsonb language sql immutable as $function$
  select case when jsonb_typeof(p) = 'array'
    then coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'valor_unitario' else e end order by o) from jsonb_array_elements(p) with ordinality t(e, o)), '[]'::jsonb)
    else p end
$function$;

-- 5) o gatilho que desvia o pedido (security definer: quem grava o pedido pode não ver valores). Roda ANTES de qualquer outro gatilho de nome maior
create or replace function public.pedido_compra_desviar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  s public.pcp_pedidos_compra_valores%rowtype;
  mudou boolean := false; ins boolean := (tg_op = 'INSERT'); vch boolean; ich boolean; vsai boolean := false;
  ext record; vv jsonb; novo_iv jsonb;
begin
  select * into s from public.pcp_pedidos_compra_valores where pedido_id = new.id;
  s.pedido_id := new.id;
  -- OLD não existe no INSERT: toda comparação com ele fica atrás deste if (o plpgsql não garante a ordem de um OR)
  if ins then vch := true; ich := true;
  else vch := new.vencedoras is distinct from old.vencedoras; ich := new.itens is distinct from old.itens; vsai := (old.vencedora_id is not null and new.vencedora_id is null); end if;

  -- valor da compra
  if new.valor_compra is not null then
    s.valor_compra := new.valor_compra; mudou := true;
  elsif vsai and s.valor_compra is not null then
    s.valor_compra := null; mudou := true;   -- a vencedora saiu do pedido: o valor da compra sai junto
  end if;

  -- vencedoras
  if new.vencedoras is not null and jsonb_typeof(new.vencedoras) = 'array' and vch then
    select * into ext from public.pedido_compra_extrair_valores(new.vencedoras, null);
    vv := coalesce((select jsonb_object_agg(x.k, x.v) from jsonb_each(coalesce(s.vencedoras_valores, '{}'::jsonb)) x(k, v)
                     where x.k in (select e ->> 'cotacao_id' from jsonb_array_elements(new.vencedoras) e where jsonb_typeof(e) = 'object')), '{}'::jsonb)
          || coalesce(ext.vencedoras_valores, '{}'::jsonb);
    if nullif(vv, '{}'::jsonb) is distinct from s.vencedoras_valores then s.vencedoras_valores := nullif(vv, '{}'::jsonb); mudou := true; end if;
    new.vencedoras := public.pedido_vencedoras_sem_valor(new.vencedoras);
  elsif new.vencedoras is null and vch and s.vencedoras_valores is not null then
    s.vencedoras_valores := null; mudou := true;   -- a lista toda foi apagada
  end if;

  -- itens
  if new.itens is not null and jsonb_typeof(new.itens) = 'array' and ich then
    select * into ext from public.pedido_compra_extrair_valores(null, new.itens);
    if ext.itens_valores is not null then
      novo_iv := ext.itens_valores;
    elsif not ins and s.itens_valores is not null then
      -- lista nova sem preço (gravada por quem não vê valores): cada item pega o preço do item de mesmo nome da lista antiga
      select case when bool_or(coalesce(s.itens_valores -> (o.ord::int - 1), 'null'::jsonb) <> 'null'::jsonb)
                  then jsonb_agg(coalesce(s.itens_valores -> (o.ord::int - 1), 'null'::jsonb) order by n.ord) end
        into novo_iv
        from (select t.ord, lower(btrim(coalesce(t.e ->> 'nome', ''))) nm,
                     row_number() over (partition by lower(btrim(coalesce(t.e ->> 'nome', ''))) order by t.ord) rn
                from jsonb_array_elements(new.itens) with ordinality t(e, ord)) n
        left join (select t.ord, lower(btrim(coalesce(t.e ->> 'nome', ''))) nm,
                          row_number() over (partition by lower(btrim(coalesce(t.e ->> 'nome', ''))) order by t.ord) rn
                     from jsonb_array_elements(old.itens) with ordinality t(e, ord)) o
          on o.nm = n.nm and o.rn = n.rn;
    else
      novo_iv := null;
    end if;
    if novo_iv is distinct from s.itens_valores then s.itens_valores := novo_iv; mudou := true; end if;
    new.itens := public.pedido_itens_sem_preco(new.itens);
  elsif new.itens is null and ich and s.itens_valores is not null then
    s.itens_valores := null; mudou := true;
  end if;

  if mudou then
    insert into public.pcp_pedidos_compra_valores as v (pedido_id, valor_compra, vencedoras_valores, itens_valores, atualizado_em)
    values (s.pedido_id, s.valor_compra, s.vencedoras_valores, s.itens_valores, now())
    on conflict (pedido_id) do update set valor_compra = excluded.valor_compra, vencedoras_valores = excluded.vencedoras_valores,
      itens_valores = excluded.itens_valores, atualizado_em = now();
  end if;
  new.valor_compra := null;
  return new;
end;
$function$;
revoke all on function public.pedido_compra_desviar_valores() from public, anon, authenticated;

-- 6) a demanda do Compras
create or replace function public.demanda_setorial_desviar_valores()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.demandas_setoriais_valores as v (demanda_id, valor_compra, atualizado_em)
  values (new.id, new.valor_compra, now())
  on conflict (demanda_id) do update set valor_compra = coalesce(excluded.valor_compra, v.valor_compra), atualizado_em = now();
  new.valor_compra := null;
  return new;
end;
$function$;
revoke all on function public.demanda_setorial_desviar_valores() from public, anon, authenticated;

-- 7) o valor do pedido de faturamento vem da tabela nova (o gatilho roda DEPOIS do desvio, na mesma transação, e vê a linha já gravada)
create or replace function public.gerar_pedido_faturamento()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.status_compra = 'Comprado' and (old.status_compra is distinct from 'Comprado') then
    insert into public.pcp_pedidos_faturamento (pedido_id, numero_oc, numero_pedido, fornecedor, centro_custo, valor)
    values (new.id, new.numero_oc, new.numero_pedido, new.fornecedor, new.centro_custo,
            coalesce(new.valor_compra, (select v.valor_compra from public.pcp_pedidos_compra_valores v where v.pedido_id = new.id)))
    on conflict (pedido_id) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function public.gerar_pedido_faturamento() from public, anon, authenticated;

-- 8) separar os itens sem cotação: embrulho security definer sobre a função de sempre; o preço dos itens que saem vai para o pedido novo
alter function public.compras_dividir_pedido(uuid, integer[], text, text) rename to compras_dividir_pedido_interna;
revoke all on function public.compras_dividir_pedido_interna(uuid, integer[], text, text) from public, anon, authenticated;
create or replace function public.compras_dividir_pedido(p_pedido_id uuid, p_indices_fora integer[], p_usuario_email text, p_usuario_nome text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare iv jsonb; r jsonb; fora int[]; novo uuid; v jsonb;
begin
  if not (select public.esta_logado()) then raise exception 'sem acesso'; end if;
  select itens_valores into iv from public.pcp_pedidos_compra_valores where pedido_id = p_pedido_id for update;
  r := public.compras_dividir_pedido_interna(p_pedido_id, p_indices_fora, p_usuario_email, p_usuario_nome);
  if iv is not null then
    novo := (r ->> 'novo_id')::uuid;
    select coalesce(array_agg(distinct x order by x), '{}') into fora from unnest(p_indices_fora) x;
    select case when bool_or(coalesce(iv -> u.f, 'null'::jsonb) <> 'null'::jsonb) then jsonb_agg(coalesce(iv -> u.f, 'null'::jsonb) order by u.o) end
      into v from unnest(fora) with ordinality u(f, o);
    if v is not null then
      insert into public.pcp_pedidos_compra_valores as w (pedido_id, itens_valores, atualizado_em) values (novo, v, now())
      on conflict (pedido_id) do update set itens_valores = excluded.itens_valores, atualizado_em = now();
    end if;
  end if;
  return r;
end;
$function$;
revoke all on function public.compras_dividir_pedido(uuid, integer[], text, text) from public, anon;
grant execute on function public.compras_dividir_pedido(uuid, integer[], text, text) to authenticated;

-- 9) zera o dinheiro das colunas antigas. O gatilho de movimentação fica desligado só durante a limpeza (senão os 253 pedidos ganhariam "movimentação agora" e o alerta de entrega calaria)
alter table public.pcp_pedidos_compra disable trigger trg_pcp_pedido_marca_movimentacao;
update public.pcp_pedidos_compra set
  valor_compra = null,
  vencedoras = public.pedido_vencedoras_sem_valor(vencedoras),
  itens = public.pedido_itens_sem_preco(itens)
 where valor_compra is not null
    or (jsonb_typeof(vencedoras) = 'array' and exists (select 1 from jsonb_array_elements(vencedoras) e where jsonb_typeof(e) = 'object' and e ? 'valor'))
    or (jsonb_typeof(itens) = 'array' and exists (select 1 from jsonb_array_elements(itens) e where jsonb_typeof(e) = 'object' and e ? 'valor_unitario'));
alter table public.pcp_pedidos_compra enable trigger trg_pcp_pedido_marca_movimentacao;
update public.demandas_setoriais set valor_compra = null where valor_compra is not null;

-- 10) só agora os gatilhos de desvio entram (a limpeza acima não passa por eles)
create trigger pedido_compra_desviar_valores_ins before insert on public.pcp_pedidos_compra
  for each row when (new.valor_compra is not null or new.vencedoras is not null or new.itens is not null)
  execute function public.pedido_compra_desviar_valores();
create trigger pedido_compra_desviar_valores_upd before update of valor_compra, vencedoras, itens, vencedora_id on public.pcp_pedidos_compra
  for each row when (new.valor_compra is not null or new.vencedoras is distinct from old.vencedoras or new.itens is distinct from old.itens
                     or (old.vencedora_id is not null and new.vencedora_id is null))
  execute function public.pedido_compra_desviar_valores();
create trigger demanda_setorial_desviar_valores_ins before insert on public.demandas_setoriais
  for each row when (new.valor_compra is not null) execute function public.demanda_setorial_desviar_valores();
create trigger demanda_setorial_desviar_valores_upd before update of valor_compra on public.demandas_setoriais
  for each row when (new.valor_compra is not null) execute function public.demanda_setorial_desviar_valores();
drop function if exists public.pedido_compra_espelhar_valores();
drop function if exists public.demanda_setorial_espelhar_valores();

-- 11) conferência: se algo não bate, tudo é desfeito
do $$
declare a int; b int; c int; d int; e int;
begin
  select count(*) into a from public.pcp_pedidos_compra
   where valor_compra is not null
      or (jsonb_typeof(vencedoras) = 'array' and exists (select 1 from jsonb_array_elements(vencedoras) x where jsonb_typeof(x) = 'object' and x ? 'valor'))
      or (jsonb_typeof(itens) = 'array' and exists (select 1 from jsonb_array_elements(itens) x where jsonb_typeof(x) = 'object' and x ? 'valor_unitario'));
  if a <> 0 then raise exception 'V3d: % pedidos ainda com dinheiro nas colunas antigas', a; end if;
  select count(*) into a from public.demandas_setoriais where valor_compra is not null;
  if a <> 0 then raise exception 'V3d: % demandas ainda com valor na coluna antiga', a; end if;
  -- as tabelas novas batem com a cópia (valor da compra, valor de cada vencedora e preço de cada item)
  select count(*) into b from public.pcp_pedidos_compra_antes_v3d_20261124 x
    where x.valor_compra is not null or exists (select 1 from public.pedido_compra_extrair_valores(x.vencedoras, x.itens) y where y.vencedoras_valores is not null or y.itens_valores is not null);
  select count(*) into c from public.pcp_pedidos_compra_antes_v3d_20261124 x
    cross join lateral public.pedido_compra_extrair_valores(x.vencedoras, x.itens) y
    join public.pcp_pedidos_compra_valores v on v.pedido_id = x.id
   where (x.valor_compra is not null or y.vencedoras_valores is not null or y.itens_valores is not null)
     and v.valor_compra is not distinct from x.valor_compra and v.vencedoras_valores is not distinct from y.vencedoras_valores and v.itens_valores is not distinct from y.itens_valores;
  if b <> c then raise exception 'V3d: a tabela nova difere da cópia em % de % pedidos', b - c, b; end if;
  select count(*) into d from public.demandas_setoriais_antes_v3d_20261124;
  select count(*) into e from public.demandas_setoriais_valores v join public.demandas_setoriais_antes_v3d_20261124 x on x.id = v.demanda_id where v.valor_compra is not distinct from x.valor_compra;
  if d <> e then raise exception 'V3d: a tabela das demandas difere da cópia em % de % linhas', d - e, d; end if;
  -- a limpeza não pode ter mexido na movimentação
  select count(*) into a from public.pcp_pedidos_compra p join public.pcp_pedidos_compra_antes_v3d_20261124 x on x.id = p.id
   where p.ultima_movimentacao_em is distinct from x.ultima_movimentacao_em;
  if a <> 0 then raise exception 'V3d: a limpeza mexeu na movimentação de % pedidos', a; end if;
end $$;

-- 12) autoteste dos gatilhos (cada bloco é desfeito, mesmo quando passa): escrever, apagar item e voltar a etapa num pedido com preço de item
do $$
declare pid uuid; n int; antes jsonb; depois jsonb; vc numeric;
begin
  select p.id into pid from public.pcp_pedidos_compra p join public.pcp_pedidos_compra_valores v on v.pedido_id = p.id
   where v.itens_valores is not null and jsonb_array_length(p.itens) >= 2 and p.vencedora_id is not null and v.valor_compra is not null order by p.id limit 1;
  if pid is null then raise notice 'V3d autoteste: nenhum pedido com preços e vencedora para testar (ok)'; return; end if;
  begin
    -- 12a) valor novo vai para a tabela e a coluna volta nula
    update public.pcp_pedidos_compra set valor_compra = 123.45 where id = pid;
    select valor_compra into vc from public.pcp_pedidos_compra_valores where pedido_id = pid;
    if vc <> 123.45 then raise exception 'autoteste 12a: valor não foi para a tabela nova'; end if;
    if (select valor_compra from public.pcp_pedidos_compra where id = pid) is not null then raise exception 'autoteste 12a: a coluna antiga não voltou nula'; end if;
    -- 12b) tirar o primeiro item (lista sem preço): os preços dos outros acompanham pelo nome
    select itens_valores into antes from public.pcp_pedidos_compra_valores where pedido_id = pid;
    update public.pcp_pedidos_compra set itens = (select jsonb_agg(e order by o) from jsonb_array_elements(itens) with ordinality t(e, o) where o > 1) where id = pid;
    select itens_valores into depois from public.pcp_pedidos_compra_valores where pedido_id = pid;
    if depois is not null and jsonb_array_length(depois) <> jsonb_array_length(antes) - 1 then
      raise exception 'autoteste 12b: os preços não acompanharam a lista (antes % depois %)', antes, depois;
    end if;
    -- 12c) voltar a etapa zera o valor da compra e mantém o das vencedoras
    update public.pcp_pedidos_compra set vencedora_id = null, valor_compra = null where id = pid;
    if (select valor_compra from public.pcp_pedidos_compra_valores where pedido_id = pid) is not null then raise exception 'autoteste 12c: o valor da compra não foi zerado'; end if;
    raise exception 'AUTOTESTE_OK';   -- desfaz o bloco inteiro
  exception when others then
    if sqlerrm <> 'AUTOTESTE_OK' then raise; end if;
  end;
end $$;

-- Reverter: supabase/sql/ver_valores_v3d_fechar_pedidos_compra_reverter.sql
