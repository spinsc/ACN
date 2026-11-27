-- ENSAIO da onda 4d (26/11/2026, menções por destinatário): aplica as partes a e b dentro de um bloco que termina em erro de propósito (nada fica gravado) e
-- confere, com o poder de cada pessoa ativa de verdade (crachá simulado por request.jwt.claims + SET LOCAL ROLE):
-- (1) cada pessoa lê exatamente as menções dela (o Admin lê todas); (2) altera e apaga só as dela (o Admin, todas); (3) criar menção para outra pessoa continua livre;
-- (4) a conferência de duplicata funciona para menção de outra pessoa; (5) "resolver para todos" resolve as menções de todos e devolve a contagem certa;
-- (6) o gatilho do pedido de compra decidido continua resolvendo as menções dos aprovadores quando quem grava é uma pessoa comum; (7) a chave pública não lê nem executa nada;
-- (8) custo: o tempo da leitura da caixa de Menções (a consulta da tela) antes e depois ("<< FALHA" se passar de 100 ms).
-- Cole TODO este arquivo no SQL do banco; a mensagem final é o resultado. Rodar só fora do horário de uso (a troca de política segura a tabela até o fim do ensaio).
create function pg_temp.tenta(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v_rol text; n bigint; m text;
begin
  if p_uid is null then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    if p_sql ~* '^select count' then execute p_sql into n; else execute p_sql; get diagnostics n = row_count; end if;
    m := 'ok:' || n;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
create function pg_temp.valor(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v_rol text; m text;
begin
  if p_uid is null then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    execute p_sql into m;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
create function pg_temp.ms(p_uid uuid, p_id text) returns numeric language plpgsql as $f$
declare t0 timestamptz; t1 timestamptz; j text; i int; n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..2 loop
    t0 := clock_timestamp();
    execute format('select json_agg(t)::text from (select * from public.mencoes where mencionado_id = %L and contexto <> ''op_adaptacao'' and contexto <> ''calendario'' order by criado_em desc limit 100) t', p_id) into j;
    execute format('select count(*) from public.mencoes where mencionado_id = %L and contexto <> ''op_adaptacao'' and contexto <> ''calendario'' and resolvida = false', p_id) into n;
    t1 := clock_timestamp();
  end loop;
  reset role;
  return round(extract(epoch from (t1 - t0)) * 1000, 1);
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; u record; got text; esperado text; qtd bigint; total bigint; pessoas int := 0;
        quem uuid; quem_id text; ms_antes numeric; ms_depois numeric; linha text; propria uuid; alheia uuid; outro_id text; outro_nome text;
        ctx text; ctx_id text; n_ctx bigint; ped uuid; restantes bigint; sem_func int;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into total from public.mencoes;
  -- a pessoa que mais tem menções (para medir o custo da caixa)
  select au.auth_id, au.id::text into quem, quem_id from public.auth_usuarios au join public.mencoes m on m.mencionado_id = au.id::text
   where au.ativo and au.auth_id is not null group by au.auth_id, au.id order by count(*) desc limit 1;
  ms_antes := pg_temp.ms(quem, quem_id);
  execute $mig$
create function public.mencoes_ja_pendente(p_mencionado text, p_contexto_id text, p_campo text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $f$
  select (select public.esta_logado())
     and exists (select 1 from public.mencoes m where m.mencionado_id = p_mencionado and m.contexto_id = p_contexto_id and m.campo = p_campo and m.lida = false);
$f$;
create function public.mencoes_resolver_todos(p_contexto text, p_contexto_id text, p_por text default null, p_campo text default null)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $f$
declare n integer;
begin
  if not (select public.esta_logado()) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if coalesce(p_contexto, '') = '' or coalesce(p_contexto_id, '') = '' then return 0; end if;
  update public.mencoes set resolvida = true, resolvida_em = now(), resolvida_por = p_por, lida = true
   where contexto = p_contexto and contexto_id = p_contexto_id and resolvida = false and (p_campo is null or campo = p_campo);
  get diagnostics n = row_count;
  return n;
end $f$;
revoke all on function public.mencoes_ja_pendente(text, text, text) from public, anon;
grant execute on function public.mencoes_ja_pendente(text, text, text) to authenticated;
revoke all on function public.mencoes_resolver_todos(text, text, text, text) from public, anon;
grant execute on function public.mencoes_resolver_todos(text, text, text, text) to authenticated;
create or replace function public.resolver_mencoes_aprovacao_ao_decidir()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $f$
begin
  if NEW.status_compra in ('Aprovado','Comprado','Recebido','Descartada') or (OLD.status_compra = 'Aguardando Aprovação') then
    update public.mencoes set resolvida = true, resolvida_em = now(), resolvida_por = 'Sistema (aprovação decidida)', lida = true
     where contexto = 'compra_aprovacao' and contexto_id = NEW.id::text
       and campo in ('aprovacao_departamento','aprovacao_nivel','aguardando_aprovacao') and resolvida = false;
  end if;
  return NEW;
end $f$;
revoke all on function public.resolver_mencoes_aprovacao_ao_decidir() from public, anon, authenticated;
drop policy if exists etapa17_logado on public.mencoes;
create policy etapa17_le on public.mencoes for select to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));
create policy etapa17_insere on public.mencoes for insert to authenticated with check ((select public.esta_logado()));
create policy etapa17_minhas_u on public.mencoes for update to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text))
  with check ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));
create policy etapa17_minhas_d on public.mencoes for delete to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));
$mig$;
  perform set_config('request.jwt.claims', '', true);
  ms_depois := pg_temp.ms(quem, quem_id);

  -- um assunto com várias menções abertas, para a conferência de "resolver para todos"
  select m.contexto, m.contexto_id, count(*) into ctx, ctx_id, n_ctx from public.mencoes m
   where m.resolvida = false and m.contexto not in ('op_adaptacao', 'calendario')
   group by m.contexto, m.contexto_id order by count(*) desc limit 1;
  select p.id into ped from public.pcp_pedidos_compra p where p.status_compra in ('Aprovado','Comprado','Recebido') limit 1;

  for u in select au.auth_id, au.id::text uid, au.nome, au.perfil from public.auth_usuarios au where au.ativo and au.auth_id is not null loop
    pessoas := pessoas + 1;
    -- (1) leitura
    select count(*) into qtd from public.mencoes where mencionado_id = u.uid;
    esperado := 'ok:' || (case when u.perfil = 'Admin' then total else qtd end);
    testes := testes + 1; got := pg_temp.tenta(u.auth_id, 'select count(*) from public.mencoes');
    if got <> esperado then falhas := falhas + 1; achados := achados || E'\n  LER ' || u.nome || ' veio ' || got || ' esperado ' || esperado; end if;
    -- linhas para os testes de alterar e apagar: uma dela e uma de outra pessoa
    select m.id into propria from public.mencoes m where m.mencionado_id = u.uid limit 1;
    select m.id into alheia from public.mencoes m where m.mencionado_id <> u.uid limit 1;
    if propria is not null then
      testes := testes + 1; got := pg_temp.tenta(u.auth_id, format('update public.mencoes set lida = lida where id = %L', propria));
      if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n  ALTERAR a propria ' || u.nome || ' veio ' || got; end if;
      testes := testes + 1; got := pg_temp.tenta(u.auth_id, format('delete from public.mencoes where id = %L', propria));
      if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n  APAGAR a propria ' || u.nome || ' veio ' || got; end if;
    end if;
    esperado := case when u.perfil = 'Admin' then 'ok:1' else 'ok:0' end;
    testes := testes + 1; got := pg_temp.tenta(u.auth_id, format('update public.mencoes set lida = lida where id = %L', alheia));
    if got <> esperado then falhas := falhas + 1; achados := achados || E'\n  ALTERAR a alheia ' || u.nome || ' veio ' || got || ' esperado ' || esperado; end if;
    testes := testes + 1; got := pg_temp.tenta(u.auth_id, format('delete from public.mencoes where id = %L', alheia));
    if got <> esperado then falhas := falhas + 1; achados := achados || E'\n  APAGAR a alheia ' || u.nome || ' veio ' || got || ' esperado ' || esperado; end if;
    -- (3) criar menção para outra pessoa continua livre
    select au.id::text, au.nome into outro_id, outro_nome from public.auth_usuarios au where au.ativo and au.id::text <> u.uid limit 1;
    testes := testes + 1;
    got := pg_temp.tenta(u.auth_id, format('insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida, criado_em) values (%L, %L, %L, %L, ''ensaio'', ''ensaio'', ''ensaio'', ''ensaio'', ''x'', ''crm'', false, now())', outro_id, outro_nome, u.uid, u.nome));
    if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n  CRIAR para outra pessoa ' || u.nome || ' veio ' || got; end if;
    -- (4) duplicata: a menção aberta de outra pessoa é "vista" pela função
    select m.mencionado_id, m.contexto_id, m.campo into outro_id, ctx_id, got from public.mencoes m where m.lida = false and m.mencionado_id <> u.uid limit 1;
    if outro_id is not null then
      testes := testes + 1;
      got := pg_temp.valor(u.auth_id, format('select public.mencoes_ja_pendente(%L, %L, %L)::text', outro_id, ctx_id, (select m.campo from public.mencoes m where m.lida = false and m.mencionado_id = outro_id and m.contexto_id = ctx_id limit 1)));
      if got <> 'true' then falhas := falhas + 1; achados := achados || E'\n  DUPLICATA ' || u.nome || ' veio ' || coalesce(got, 'nulo'); end if;
      testes := testes + 1;
      got := pg_temp.valor(u.auth_id, format('select public.mencoes_ja_pendente(%L, %L, ''campo-que-nao-existe'')::text', outro_id, ctx_id));
      if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n  DUPLICATA inexistente ' || u.nome || ' veio ' || coalesce(got, 'nulo'); end if;
    end if;
    -- (5) resolver para todos
    if ctx is not null then
      testes := testes + 1;
      got := pg_temp.valor(u.auth_id, format('select public.mencoes_resolver_todos(%L, %L, ''ensaio'')::text', ctx, (select m.contexto_id from public.mencoes m where m.resolvida = false and m.contexto = ctx and m.contexto not in (''op_adaptacao'',''calendario'') group by m.contexto_id order by count(*) desc limit 1)));
      if got <> n_ctx::text then falhas := falhas + 1; achados := achados || E'\n  RESOLVER todos ' || u.nome || ' veio ' || coalesce(got, 'nulo') || ' esperado ' || n_ctx; end if;
    end if;
  end loop;

  -- (6) o gatilho do pedido decidido, com uma pessoa comum gravando o pedido
  if ped is not null then
    select au.auth_id into quem from public.auth_usuarios au where au.ativo and au.auth_id is not null and au.perfil <> 'Admin' limit 1;
    insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida, criado_em)
      select au.id::text, au.nome, '', 'Sistema', 'compra_aprovacao', ped::text, 'ensaio', 'aprovacao_nivel', 'x', 'compras', false, now()
        from public.auth_usuarios au where au.ativo and au.auth_id is not null limit 3;
    testes := testes + 1;
    perform set_config('request.jwt.claims', json_build_object('sub', quem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      -- o gatilho só dispara quando o status MUDA
      update public.pcp_pedidos_compra set status_compra = case when status_compra = 'Aprovado' then 'Comprado' else 'Aprovado' end where id = ped;
    exception when others then
      falhas := falhas + 1; achados := achados || E'\n  GATILHO do pedido: o update do pedido falhou ' || sqlstate || ' ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into restantes from public.mencoes where contexto = 'compra_aprovacao' and contexto_id = ped::text and campo = 'aprovacao_nivel' and resolvida = false and texto_trecho = 'x';
    if restantes <> 0 then falhas := falhas + 1; achados := achados || E'\n  GATILHO do pedido deixou ' || restantes || ' menções abertas'; end if;
  end if;

  -- (7) chave pública: não lê, não executa
  testes := testes + 1; got := pg_temp.tenta(null, 'select count(*) from public.mencoes');
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública lendo mencoes veio ' || got; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select public.mencoes_ja_pendente(''x'', ''x'', ''x'')::text');
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública na função de duplicata veio ' || got; end if;
  testes := testes + 1; got := pg_temp.valor(null, 'select public.mencoes_resolver_todos(''x'', ''x'')::text');
  if got <> 'ERRO 42501' then falhas := falhas + 1; achados := achados || E'\n  chave pública na função de resolver veio ' || got; end if;
  select count(*) into sem_func from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('mencoes_ja_pendente', 'mencoes_resolver_todos', 'resolver_mencoes_aprovacao_ao_decidir')
     and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');
  testes := testes + 1;
  if sem_func <> 0 then falhas := falhas + 1; achados := achados || E'\n  ' || sem_func || ' função(ões) executável(is) pela chave pública'; end if;

  linha := E'\n  caixa de Menções da pessoa com mais menções (leitura + contagem): antes ' || ms_antes || ' ms, depois ' || ms_depois || ' ms';
  if ms_depois > 100 then falhas := falhas + 1; linha := linha || '   << FALHA (passou de 100 ms)'; end if;
  raise exception E'ENSAIO DA ONDA 4d: % pessoas ativas, % conferências, % falhas % %', pessoas, testes, falhas, linha, achados;
end
$ensaio$;
