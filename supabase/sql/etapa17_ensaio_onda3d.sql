-- ENSAIO da onda 3d (04/11/2026): aplica etapa17_onda3d.sql dentro de um bloco que termina em erro de propósito (nada fica gravado) e confere, com o poder da chave pública e de
-- pessoas de verdade (crachá simulado por request.jwt.claims + SET LOCAL ROLE): (1) as duas tabelas de frete só abrem a quem tem Logística, Compras, Financeiro ou Admin (como todos os 25
-- ativos têm Logística, a pessoa de teste TROCA de abas dentro do ensaio, e o que foi mexido volta ao fim); (2) a chave pública não lê; (3) as três funções de gatilho não são mais executáveis
-- por ninguém de fora e os gatilhos continuam disparando (a Compras altera o status de um pedido e o gatilho roda). Cole TODO este arquivo no SQL do banco; a mensagem de erro final é o resultado.
-- O bloco da migração (entre $mig$) repete etapa17_onda3d.sql sem os comentários: se um mudar, mude o outro.
create function pg_temp.ator(p_perfil text) returns uuid language sql as $f$ select auth_id from public.auth_usuarios where ativo and perfil = p_perfil and auth_id is not null order by jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)), nome limit 1 $f$;
create function pg_temp.tenta(p_perfil text, p_sql text) returns text language plpgsql as $f$
declare v_uid uuid; v_rol text; n bigint; m text;
begin
  if p_perfil in ('anon', 'service_role') then v_rol := p_perfil; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; v_uid := pg_temp.ator(p_perfil); perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    if p_sql ~* '^select count' then execute p_sql into n; else execute p_sql; get diagnostics n = row_count; end if;
    m := 'ok:' || n;
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
create function pg_temp.confere(p_nome text, p_perfil text, p_sql text, p_esperado text) returns text language plpgsql as $f$
declare got text;
begin
  got := pg_temp.tenta(p_perfil, p_sql);
  if got = p_esperado then return null; end if;
  return E'\n  ' || rpad(p_nome, 46) || ' ' || rpad(p_perfil, 24) || ' esperava ' || rpad(p_esperado, 10) || ' veio ' || got;
end $f$;
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; r text; got text; perfil text; ator uuid; fretes bigint; abas_combo jsonb; esperado text; fn text; ped uuid;
begin
  execute $mig$
drop policy if exists etapa17_logado on public.pcp_cotacoes_fretes;
create policy etapa17_abas on public.pcp_cotacoes_fretes for all to authenticated
  using (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica'])) with check (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica']));
drop policy if exists etapa17_logado on public.pcp_aprovacoes_fretes;
create policy etapa17_abas on public.pcp_aprovacoes_fretes for all to authenticated
  using (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica'])) with check (public.tem_alguma_aba(array['compras', 'financeiro', 'logistica']));
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.trg_chegada_item_reavalia() from public, anon, authenticated;
revoke all on function public.trg_pedido_recebido_reavalia() from public, anon, authenticated;
$mig$;
  perform set_config('request.jwt.claims', '', true);
  fretes := (select count(*) from public.pcp_cotacoes_fretes);
  -- 1) pessoas reais como estão (todas têm Logística): leem as 17 cotações
  foreach perfil in array array['Admin', 'Almoxarifado', 'Chicote', 'Compras', 'Engenharia', 'Gerente administrativo', 'RH'] loop
    r := pg_temp.confere('cotacoes de frete (abas de hoje)', perfil, 'select count(*) from public.pcp_cotacoes_fretes', 'ok:' || fretes); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  -- 2) a pessoa do Chicote com abas trocadas dentro do ensaio: quem tem uma das três abas lê, grava e apaga; quem não tem, nada
  ator := pg_temp.ator('Chicote');
  foreach abas_combo in array array['["dashboard"]'::jsonb, '["dashboard","rh"]'::jsonb, '["dashboard","compras"]'::jsonb, '["financeiro"]'::jsonb, '["logistica"]'::jsonb, '[]'::jsonb] loop
    update public.auth_usuarios set abas_permitidas = abas_combo where auth_id = ator;
    esperado := case when abas_combo ?| array['compras', 'financeiro', 'logistica'] or abas_combo = '[]'::jsonb then 'sim' else 'nao' end;   -- lista vazia = todas as abas (regra do sistema)
    r := pg_temp.confere('cotacoes (leitura) abas ' || abas_combo::text, 'Chicote', 'select count(*) from public.pcp_cotacoes_fretes', 'ok:' || case when esperado = 'sim' then fretes else 0 end); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    r := pg_temp.confere('cotacoes (alterar) abas ' || abas_combo::text, 'Chicote', 'update public.pcp_cotacoes_fretes set id = id where ctid in (select ctid from public.pcp_cotacoes_fretes limit 1)', case when esperado = 'sim' then 'ok:1' else 'ok:0' end); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    got := pg_temp.tenta('Chicote', 'insert into public.pcp_aprovacoes_fretes default values'); testes := testes + 1;
    if (esperado = 'sim' and got = 'ERRO 42501') or (esperado = 'nao' and got <> 'ERRO 42501') then achados := achados || E'\n  aprovacoes (inserir) abas ' || abas_combo::text || ' esperava ' || esperado || ' veio ' || got; falhas := falhas + 1; end if;
  end loop;
  -- 3) a chave pública não lê
  foreach fn in array array['public.pcp_cotacoes_fretes', 'public.pcp_aprovacoes_fretes'] loop
    r := pg_temp.confere(fn || ' (chave publica)', 'anon', 'select count(*) from ' || fn, 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  -- 4) funções: ninguém de fora executa; o gatilho segue disparando (a Compras muda o status de um pedido, que passa pelo trg_pedido_recebido_reavalia)
  foreach fn in array array['public.rls_auto_enable()', 'public.trg_chegada_item_reavalia()', 'public.trg_pedido_recebido_reavalia()'] loop
    testes := testes + 1;
    if has_function_privilege('anon', fn::regprocedure, 'execute') or has_function_privilege('authenticated', fn::regprocedure, 'execute') then achados := achados || E'\n  ainda executavel por quem esta fora: ' || fn; falhas := falhas + 1; end if;
  end loop;
  ped := (select id from public.pcp_pedidos_compra order by id limit 1);
  r := pg_temp.confere('gatilho do pedido dispara (Compras altera o status)', 'Compras', format('update public.pcp_pedidos_compra set status_compra = status_compra where id = %L', ped), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  r := pg_temp.confere('o resto do frete (pcp_fretes) segue como era', 'Chicote', 'select count(*) from public.pcp_fretes', 'ok:' || (select count(*) from public.pcp_fretes)); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  raise exception E'ENSAIO ONDA 3d (nada foi gravado): % cotacoes de frete, % conferencias, % fora do esperado%', fretes, testes, falhas, achados;
end $ensaio$;
