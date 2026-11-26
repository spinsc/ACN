-- ENSAIO da onda 4a (26/11/2026, chat privado): aplica etapa17_onda4a_chat_privado.sql dentro de um bloco que termina em erro de propósito
-- (nada fica gravado) e confere, com o poder de cada pessoa ativa de verdade (crachá simulado por request.jwt.claims + SET LOCAL ROLE):
-- (1) TODA pessoa ativa lê exatamente as mensagens e salas das conversas de que é membro (a conta é feita por fora, pelo jsonb, sem usar
-- as funções novas) e nenhuma além delas; (2) a chave pública não lê; (3) escrever: só em sala sua e só como si mesma; criar sala só se
-- incluir a si; sair do grupo continua valendo; quem não é membro não muda nem apaga; (4) custo: tempo de ler todas as mensagens como a
-- pessoa que mais lê, antes e depois (linha "<< FALHA" se passar de 150 ms). Cole TODO este arquivo no SQL do banco; a mensagem de erro final
-- é o resultado. O bloco da migração (entre $mig$) repete etapa17_onda4a_chat_privado.sql sem os comentários: se um mudar, mude o outro.
-- Rodar só fora do horário de uso (as duas tabelas ficam travadas até o fim do bloco; `lock_timeout` curto desiste em vez de esperar).
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
create function pg_temp.confere(p_nome text, p_uid uuid, p_sql text, p_esperado text) returns text language plpgsql as $f$
declare got text;
begin
  got := pg_temp.tenta(p_uid, p_sql);
  if got = p_esperado then return null; end if;
  return E'\n  ' || rpad(p_nome, 52) || ' esperava ' || rpad(p_esperado, 9) || ' veio ' || got;
end $f$;
create function pg_temp.ms(p_uid uuid) returns numeric language plpgsql as $f$
declare t0 timestamptz; t1 timestamptz; j text; i int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..2 loop   -- vale a segunda medida (a primeira paga o plano e o catálogo frios)
    t0 := clock_timestamp();
    execute 'select json_agg(t)::text from (select * from public.chat_mensagens) t' into j;
    execute 'select json_agg(t)::text from (select * from public.chat_salas) t' into j;
    t1 := clock_timestamp();
  end loop;
  reset role;
  return round(extract(epoch from (t1 - t0)) * 1000, 1);
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; r text; got text; u record;
        esp_msgs bigint; esp_salas bigint; vis_msgs bigint; vis_salas bigint; total_msgs bigint; total_salas bigint;
        pessoas int := 0; max_vis bigint := 0; quem_mais uuid; ms_antes numeric; ms_depois numeric;
        a uuid; b uuid; c uuid; sala_ab uuid; msg_ab uuid; a_id uuid; b_id uuid; c_id uuid; grupo uuid;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  total_msgs := (select count(*) from public.chat_mensagens);
  total_salas := (select count(*) from public.chat_salas);
  -- a pessoa que mais lê (para medir o custo antes e depois)
  select au.auth_id into quem_mais from public.auth_usuarios au where au.ativo and au.auth_id is not null limit 1;
  ms_antes := pg_temp.ms(quem_mais);
  execute $mig$
create or replace function public.chat_minhas_salas() returns setof uuid
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  with e as materialized (select public.usuario_atual_id() as eu)
  select s.id
    from e
    join public.chat_salas s
      on e.eu is not null
     and (s.membros @> jsonb_build_array(jsonb_build_object('id', e.eu::text))
          or s.membros @> jsonb_build_array(jsonb_build_object('pessoa_id', e.eu::text)))
$f$;
create or replace function public.chat_membro(p_membros jsonb) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((select p_membros @> jsonb_build_array(jsonb_build_object('id', e.eu::text))
                          or p_membros @> jsonb_build_array(jsonb_build_object('pessoa_id', e.eu::text))
                     from (select public.usuario_atual_id() as eu) e
                    where e.eu is not null), false)
$f$;
revoke all on function public.chat_minhas_salas() from public, anon;
revoke all on function public.chat_membro(jsonb) from public, anon;
grant execute on function public.chat_minhas_salas() to authenticated;
grant execute on function public.chat_membro(jsonb) to authenticated;
drop policy if exists etapa17_logado on public.chat_salas;
create policy chat_salas_le on public.chat_salas for select to authenticated using (id in (select public.chat_minhas_salas()));
create policy chat_salas_cria on public.chat_salas for insert to authenticated with check (tipo in ('direto', 'grupo') and public.chat_membro(membros));
create policy chat_salas_muda on public.chat_salas for update to authenticated using (id in (select public.chat_minhas_salas())) with check ((select public.esta_logado()));
create policy chat_salas_apaga on public.chat_salas for delete to authenticated using (id in (select public.chat_minhas_salas()));
drop policy if exists etapa17_logado on public.chat_mensagens;
create policy chat_mensagens_le on public.chat_mensagens for select to authenticated using (sala_id in (select public.chat_minhas_salas()));
create policy chat_mensagens_escreve on public.chat_mensagens for insert to authenticated with check (sala_id in (select public.chat_minhas_salas()) and remetente_id = (select public.usuario_atual_id())::text);
create policy chat_mensagens_muda on public.chat_mensagens for update to authenticated using (sala_id in (select public.chat_minhas_salas())) with check (sala_id in (select public.chat_minhas_salas()));
$mig$;
  perform set_config('request.jwt.claims', '', true);
  ms_depois := pg_temp.ms(quem_mais);
  -- 1) toda pessoa ativa lê exatamente o que é dela
  for u in select au.id, au.auth_id from public.auth_usuarios au where au.ativo and au.auth_id is not null loop
    pessoas := pessoas + 1;
    esp_salas := (select count(*) from public.chat_salas s where exists (select 1 from jsonb_array_elements(s.membros) e where e->>'id' = u.id::text or e->>'pessoa_id' = u.id::text));
    esp_msgs := (select count(*) from public.chat_mensagens m where m.sala_id in (select s.id from public.chat_salas s where exists (select 1 from jsonb_array_elements(s.membros) e where e->>'id' = u.id::text or e->>'pessoa_id' = u.id::text)));
    r := pg_temp.confere('salas que a pessoa le', u.auth_id, 'select count(*) from public.chat_salas', 'ok:' || esp_salas); testes := testes + 1;
    if r is not null then achados := achados || r || ' (pessoa ' || u.id || ')'; falhas := falhas + 1; end if;
    r := pg_temp.confere('mensagens que a pessoa le', u.auth_id, 'select count(*) from public.chat_mensagens', 'ok:' || esp_msgs); testes := testes + 1;
    if r is not null then achados := achados || r || ' (pessoa ' || u.id || ')'; falhas := falhas + 1; end if;
    if esp_msgs > max_vis then max_vis := esp_msgs; end if;
  end loop;
  -- ninguém lê tudo: se a pessoa que mais lê vê todas as mensagens, a regra não está isolando nada
  testes := testes + 1;
  if max_vis >= total_msgs and total_msgs > 0 then achados := achados || E'\n  alguem le TODAS as mensagens (' || max_vis || ' de ' || total_msgs || ')'; falhas := falhas + 1; end if;
  -- 2) a chave pública não lê
  r := pg_temp.confere('chave publica nas salas', null, 'select count(*) from public.chat_salas', 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('chave publica nas mensagens', null, 'select count(*) from public.chat_mensagens', 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  -- 3) escrever. A e B = membros de uma conversa direta com mensagem; C = ativa que não é membro dela
  select s.id into sala_ab from public.chat_salas s where s.tipo = 'direto' and jsonb_array_length(s.membros) = 2
    and exists (select 1 from public.chat_mensagens m where m.sala_id = s.id)
    and (select count(*) from jsonb_array_elements(s.membros) e join public.auth_usuarios au on au.id::text = e->>'id' where au.ativo and au.auth_id is not null) = 2
  order by s.criado_em limit 1;
  select au.id, au.auth_id into a_id, a from jsonb_array_elements((select membros from public.chat_salas where id = sala_ab)) e join public.auth_usuarios au on au.id::text = e->>'id' order by e->>'id' limit 1;
  select au.id, au.auth_id into b_id, b from jsonb_array_elements((select membros from public.chat_salas where id = sala_ab)) e join public.auth_usuarios au on au.id::text = e->>'id' where au.id <> a_id limit 1;
  select au.id, au.auth_id into c_id, c from public.auth_usuarios au where au.ativo and au.auth_id is not null and au.id not in (a_id, b_id) order by au.criado_em nulls last, au.id limit 1;
  msg_ab := (select m.id from public.chat_mensagens m where m.sala_id = sala_ab limit 1);
  r := pg_temp.confere('A escreve na sala dele, como ele', a, format('insert into public.chat_mensagens (sala_id, remetente_id, remetente_nome, texto) values (%L, %L, %L, %L)', sala_ab, a_id, 'ensaio', 'ensaio'), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('A escreve como se fosse B (recusado)', a, format('insert into public.chat_mensagens (sala_id, remetente_id, remetente_nome, texto) values (%L, %L, %L, %L)', sala_ab, b_id, 'ensaio', 'ensaio'), 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C escreve na sala de A e B (recusado)', c, format('insert into public.chat_mensagens (sala_id, remetente_id, remetente_nome, texto) values (%L, %L, %L, %L)', sala_ab, c_id, 'ensaio', 'ensaio'), 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('B marca como lida (membro)', b, format('update public.chat_mensagens set lida_por = lida_por where id = %L', msg_ab), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C marca como lida (nao e membro: 0 linhas)', c, format('update public.chat_mensagens set lida_por = lida_por where id = %L', msg_ab), 'ok:0'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C cria sala com ele dentro', c, format('insert into public.chat_salas (tipo, membros) values (%L, %L::jsonb)', 'direto', jsonb_build_array(jsonb_build_object('id', c_id::text, 'nome', 'c'), jsonb_build_object('id', a_id::text, 'nome', 'a'))::text), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C cria sala SEM ele dentro (recusado)', c, format('insert into public.chat_salas (tipo, membros) values (%L, %L::jsonb)', 'direto', jsonb_build_array(jsonb_build_object('id', a_id::text, 'nome', 'a'), jsonb_build_object('id', b_id::text, 'nome', 'b'))::text), 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('A sai da conversa (tira a si de membros)', a, format('update public.chat_salas set membros = %L::jsonb where id = %L', jsonb_build_array(jsonb_build_object('id', b_id::text, 'nome', 'b'))::text, sala_ab), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C muda os membros da sala de A e B (0 linhas)', c, format('update public.chat_salas set membros = membros where id = %L', sala_ab), 'ok:0'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('C apaga a sala de A e B (0 linhas)', c, format('delete from public.chat_salas where id = %L', sala_ab), 'ok:0'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('A apaga a propria sala', a, format('delete from public.chat_salas where id = %L', sala_ab), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  -- 4) custo
  testes := testes + 1;
  if ms_depois > 150 then achados := achados || E'\n  << FALHA custo: ler tudo levou ' || ms_depois || ' ms depois (antes ' || ms_antes || ' ms)'; falhas := falhas + 1; end if;
  raise exception E'ENSAIO ONDA 4a, CHAT (nada foi gravado): % pessoas ativas, % salas e % mensagens no banco, a pessoa que mais le ve % mensagens; % conferencias, % fora do esperado; custo de ler tudo como uma pessoa: antes % ms, depois % ms%',
    pessoas, total_salas, total_msgs, max_vis, testes, falhas, ms_antes, ms_depois, achados;
end $ensaio$;
