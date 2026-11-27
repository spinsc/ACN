-- ENSAIO da onda 5b (26/11/2026, bucket privado): aplica o SQL do bucket dentro de um bloco que termina em erro de propósito (nada fica gravado, nem o bucket)
-- e confere, com o poder de pessoas ativas de verdade (crachá simulado por request.jwt.claims + SET LOCAL ROLE):
-- (1) o membro de uma sala lê e envia na pasta chat/<sala>/; quem não é da sala não lê nem envia ali; (2) quem entrou lê e envia nas pastas de assinaturas;
-- (3) a chave pública não lê nem envia; (4) ninguém apaga nem altera pelo navegador; (5) o bucket nasce privado; (6) o `acn-media` continua como estava.
-- Cole TODO este arquivo no SQL do banco; a mensagem final é o resultado. Fora do horário de uso, por segurança.
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
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; got text;
        sala uuid; membro uuid; fora uuid; ms numeric; t0 timestamptz;
begin
  set local lock_timeout = '3s';
  perform set_config('request.jwt.claims', '', true);
  -- uma sala com membro ativo, e uma pessoa ativa que NÃO é dela
  select s.id, au.auth_id into sala, membro
    from public.chat_salas s join public.auth_usuarios au
      on au.ativo and au.auth_id is not null
     and (s.membros @> jsonb_build_array(jsonb_build_object('id', au.id::text)) or s.membros @> jsonb_build_array(jsonb_build_object('pessoa_id', au.id::text)))
   limit 1;
  select au.auth_id into fora from public.auth_usuarios au
   where au.ativo and au.auth_id is not null
     and not exists (select 1 from public.chat_salas s where s.id = sala
          and (s.membros @> jsonb_build_array(jsonb_build_object('id', au.id::text)) or s.membros @> jsonb_build_array(jsonb_build_object('pessoa_id', au.id::text))))
   limit 1;
  if sala is null or membro is null or fora is null then raise exception 'ENSAIO sem sala, membro ou pessoa de fora para testar (sala %, membro %, fora %)', sala, membro, fora; end if;

  execute $mig$
insert into storage.buckets (id, name, public, file_size_limit) values ('acn-privado', 'acn-privado', false, 20971520) on conflict (id) do nothing;
create policy "acn-privado logado le" on storage.objects for select to authenticated
  using (bucket_id = 'acn-privado' and (select public.esta_logado())
    and ((storage.foldername(name))[1] is distinct from 'chat' or (storage.foldername(name))[2] in (select s::text from public.chat_minhas_salas() s)));
create policy "acn-privado logado envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'acn-privado' and (select public.esta_logado())
    and ((storage.foldername(name))[1] is distinct from 'chat' or (storage.foldername(name))[2] in (select s::text from public.chat_minhas_salas() s)));
  $mig$;

  -- arquivos de teste, postos pelo dono do banco
  insert into storage.objects (bucket_id, name) values
    ('acn-privado', 'chat/' || sala || '/zz_ensaio.txt'),
    ('acn-privado', 'assinaturas/zz_ensaio.png'),
    ('acn-privado', 'sac/zz/assinatura_zz.png');

  -- (5) privado
  testes := testes + 1; got := (select public::text from storage.buckets where id = 'acn-privado');
  if got <> 'false' then falhas := falhas + 1; achados := achados || E'\n<< FALHA bucket nasceu publico: ' || got; end if;

  -- (1) chat: membro lê e envia; de fora não lê nem envia
  testes := testes + 1; got := pg_temp.tenta(membro, format($q$select count(*) from storage.objects where bucket_id='acn-privado' and name = 'chat/%s/zz_ensaio.txt'$q$, sala));
  if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n<< FALHA membro nao le o chat: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(fora, format($q$select count(*) from storage.objects where bucket_id='acn-privado' and name = 'chat/%s/zz_ensaio.txt'$q$, sala));
  if got <> 'ok:0' then falhas := falhas + 1; achados := achados || E'\n<< FALHA quem e de fora le o chat: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(membro, format($q$insert into storage.objects (bucket_id, name) values ('acn-privado', 'chat/%s/zz_novo.txt')$q$, sala));
  if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n<< FALHA membro nao envia ao chat: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(fora, format($q$insert into storage.objects (bucket_id, name) values ('acn-privado', 'chat/%s/zz_novo.txt')$q$, sala));
  if got not like 'ERRO%' then falhas := falhas + 1; achados := achados || E'\n<< FALHA quem e de fora envia ao chat: ' || got; end if;

  -- (2) assinaturas: quem entrou lê e envia
  testes := testes + 1; got := pg_temp.tenta(fora, $q$select count(*) from storage.objects where bucket_id='acn-privado' and name in ('assinaturas/zz_ensaio.png','sac/zz/assinatura_zz.png')$q$);
  if got <> 'ok:2' then falhas := falhas + 1; achados := achados || E'\n<< FALHA quem entrou nao le assinatura: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(fora, $q$insert into storage.objects (bucket_id, name) values ('acn-privado', 'assinaturas/zz_novo.png')$q$);
  if got <> 'ok:1' then falhas := falhas + 1; achados := achados || E'\n<< FALHA quem entrou nao envia assinatura: ' || got; end if;

  -- (3) chave pública
  testes := testes + 1; got := pg_temp.tenta(null, $q$select count(*) from storage.objects where bucket_id='acn-privado'$q$);
  if got <> 'ok:0' and got not like 'ERRO%' then falhas := falhas + 1; achados := achados || E'\n<< FALHA chave publica le o bucket privado: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(null, $q$insert into storage.objects (bucket_id, name) values ('acn-privado', 'assinaturas/zz_anon.png')$q$);
  if got not like 'ERRO%' then falhas := falhas + 1; achados := achados || E'\n<< FALHA chave publica envia ao bucket privado: ' || got; end if;

  -- (4) ninguém apaga nem altera pelo navegador (0 linhas = a regra escondeu a linha)
  testes := testes + 1; got := pg_temp.tenta(membro, format($q$delete from storage.objects where bucket_id='acn-privado' and name = 'chat/%s/zz_ensaio.txt'$q$, sala));
  if got <> 'ok:0' and got not like 'ERRO%' then falhas := falhas + 1; achados := achados || E'\n<< FALHA membro apagou arquivo: ' || got; end if;
  testes := testes + 1; got := pg_temp.tenta(membro, format($q$update storage.objects set name = name || 'x' where bucket_id='acn-privado' and name = 'chat/%s/zz_ensaio.txt'$q$, sala));
  if got <> 'ok:0' and got not like 'ERRO%' then falhas := falhas + 1; achados := achados || E'\n<< FALHA membro alterou arquivo: ' || got; end if;

  -- (6) o acn-media segue igual (3 políticas de quem entrou, bucket público)
  testes := testes + 1; got := (select count(*)::text from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'acn-media%');
  if got <> '3' then falhas := falhas + 1; achados := achados || E'\n<< FALHA politicas do acn-media mudaram: ' || got; end if;
  testes := testes + 1; got := (select public::text from storage.buckets where id = 'acn-media');
  if got <> 'true' then falhas := falhas + 1; achados := achados || E'\n<< FALHA acn-media mudou: ' || got; end if;

  -- custo: a leitura de um arquivo do chat pelo membro (a política consulta as salas)
  t0 := clock_timestamp();
  got := pg_temp.tenta(membro, format($q$select count(*) from storage.objects where bucket_id='acn-privado' and name = 'chat/%s/zz_ensaio.txt'$q$, sala));
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  testes := testes + 1;
  if ms > 100 then falhas := falhas + 1; achados := achados || E'\n<< FALHA leitura lenta: ' || ms || ' ms'; end if;

  raise exception E'ENSAIO 5b: % conferencias, % falhas, leitura do chat % ms%', testes, falhas, ms, achados;
end $ensaio$;
