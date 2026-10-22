// Gera o SQL do ENSAIO da onda 2: aplica etapa17_onda2.sql dentro de um bloco que termina em erro de propósito (nada fica gravado) e, com o poder da chave pública, de dois perfis que entraram
// (crachá simulado por request.jwt.claims + SET LOCAL ROLE) e da chave de serviço, confere tabela por tabela, visão, função, portal e arquivo contra o que a onda 2 promete.
// Só aparece no resultado o que NÃO bateu, mais os totais.   node etapa17_ensaio_onda2.cjs > ensaio.sql      (com --reverter: aplica a migração e logo a reversão, e mostra que a chave pública volta a ler)
const fs = require('fs'); const D = __dirname + '/';
const limpa = (f) => fs.readFileSync(D + f, 'utf8').split('\n').filter(l => !/^\s*--/.test(l) && l.trim()).join('\n');
const migracao = limpa('etapa17_onda2.sql');
const reverter = process.argv.includes('--reverter');
const reversao = reverter ? limpa('etapa17_onda2_reverter.sql') : '';
const PROPRIAS = ['admin_perfis_sistema', 'auth_credenciais', 'rh_autorizacoes', 'rh_comissoes_fechamento', 'rh_fechamentos', 'rh_funcionarios', 'rh_lancamentos', 'rh_funcionarios_antes_quadro_20261014', 'crm_whatsapp_config', 'crm_whatsapp_instancias', 'configuracoes_email_smtp', 'garantia_contadores', 'lixeira', 'etapa17_estado_anterior'];
const PORTAIS = ['configuracoes_sistema', 'veiculos_nfc', 'servicos_executados_nfc', 'chamados_suporte'];
const lista = (a) => a.map(x => `'${x}'`).join(', ');

const cabeca = `create function pg_temp.ator(p_perfil text) returns uuid language sql as $f$ select auth_id from public.auth_usuarios where ativo and perfil = p_perfil and auth_id is not null limit 1 $f$;
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
  if got like p_esperado then return null; end if;
  return E'\\n  ' || rpad(p_nome, 44) || ' ' || rpad(p_perfil, 12) || ' esperava ' || rpad(p_esperado, 10) || ' veio ' || got;
end $f$;`;

const corpo = `
  ${reverter ? '' : ''}
  execute $mig$${migracao}$mig$;
  ${reverter ? `execute $rev$${reversao}$rev$;` : ''}
  -- 1) tabela por tabela
  for t in
    select c.relname, (c.relname = any (array[${lista(PROPRIAS)}])) as propria, (c.relname = any (array[${lista(PORTAIS)}])) as portal,
      (select column_name from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname order by ordinal_position limit 1) as col
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname
  loop
    total := total + 1;
    foreach a in array array['anon', 'Admin', 'Almoxarifado'] loop
      if a <> 'anon' and t.propria then continue; end if;
      foreach q in array array['S', 'U', 'D'] loop
        sql := case q when 'S' then format('select count(*) from public.%I', t.relname)
                      when 'U' then format('update public.%I set %I = %I where false', t.relname, t.col, t.col)
                      else format('delete from public.%I where false', t.relname) end;
        if a = 'anon' then esp := case when q = 'S' and t.portal then 'ok:%' else 'ERRO 42501' end;
        else esp := 'ok:%'; end if;
        r := pg_temp.confere(t.relname || ' ' || q, a, sql, esp);
        testes := testes + 1;
        if r is not null then achados := achados || r; falhas := falhas + 1; end if;
      end loop;
    end loop;
  end loop;
  -- 2) visões
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1 loop
    foreach a in array array['anon', 'Admin', 'Almoxarifado'] loop
      r := pg_temp.confere('visao ' || t.relname, a, format('select count(*) from public.%I', t.relname), case when a = 'anon' then 'ERRO 42501' else 'ok:%' end);
      testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    end loop;
  end loop;
  -- 3) portais (a chave pública enxerga só o que a página mostra)
  select count(*) into n_ativos from public.veiculos_nfc where ativo is true;
  select id into um_veiculo from public.veiculos_nfc where ativo is true limit 1;
  foreach r in array array[
    pg_temp.confere('portal: ler as 5 chaves', 'anon', 'select count(*) from public.configuracoes_sistema', 'ok:5'),
    pg_temp.confere('portal: chave de custos escondida', 'anon', 'select count(*) from public.configuracoes_sistema where chave = $q$cotacoes_ver_markup$q$', 'ok:0'),
    pg_temp.confere('portal: so veiculos ativos', 'anon', 'select count(*) from public.veiculos_nfc', 'ok:' || n_ativos),
    pg_temp.confere('portal: gravar config negado', 'anon', 'insert into public.configuracoes_sistema (chave, valor) values ($q$zz17$q$, $q$x$q$)', 'ERRO 42501'),
    pg_temp.confere('portal: chamado sem veiculo negado', 'anon', 'insert into public.chamados_suporte (nome_solicitante) values ($q$ZZ$q$)', 'ERRO 42501'),
    pg_temp.confere('portal: abrir chamado (passa da regra)', 'anon', format('insert into public.chamados_suporte (veiculo_id, nome_solicitante) values (%L, $q$ZZ$q$)', um_veiculo), 'ok:1'),
    pg_temp.confere('portal: ler chamados', 'anon', 'select count(*) from public.chamados_suporte', 'ok:%')
  ] loop
    testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  -- 4) funções
  foreach r in array array[
    pg_temp.confere('funcao eh_admin()', 'anon', 'select public.eh_admin()', 'ERRO 42501'),
    pg_temp.confere('funcao normalizar_busca()', 'anon', 'select public.normalizar_busca($q$x$q$)', 'ERRO 42501'),
    pg_temp.confere('funcao auth_login()', 'anon', 'select public.auth_login($q$x$q$, $q$y$q$)', 'ERRO 42501'),
    pg_temp.confere('funcao auth_login()', 'Admin', 'select public.auth_login($q$x$q$, $q$y$q$)', 'ERRO 42501'),
    pg_temp.confere('funcao auth_login()', 'service_role', 'select public.auth_login($q$x$q$, $q$y$q$)', 'ok:1'),
    pg_temp.confere('funcao esta_logado()', 'Almoxarifado', 'select public.esta_logado()', 'ok:1'),
    pg_temp.confere('funcao normalizar_busca()', 'Almoxarifado', 'select public.normalizar_busca($q$x$q$)', 'ok:1'),
    pg_temp.confere('funcao proximo_numero_os()', 'anon', 'select public.proximo_numero_os()', 'ERRO 42501')
  ] loop
    testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  -- 5) arquivos
  foreach r in array array[
    pg_temp.confere('arquivos: enviar', 'anon', 'insert into storage.objects (bucket_id, name) values ($q$acn-media$q$, $q$zz17/teste.txt$q$)', 'ERRO 42501'),
    pg_temp.confere('arquivos: listar', 'anon', 'select count(*) from storage.objects', 'ok:0'),
    pg_temp.confere('arquivos: enviar logado', 'Almoxarifado', 'insert into storage.objects (bucket_id, name) values ($q$acn-media$q$, $q$zz17/teste.txt$q$)', 'ok:1'),
    pg_temp.confere('arquivos: listar logado', 'Almoxarifado', 'select count(*) from storage.objects where bucket_id = $q$acn-media$q$', 'ok:%')
  ] loop
    testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  -- 6) quem entrou ainda grava de verdade (linha de verdade, desfeito em seguida)
  foreach tab in array array['cadastro_itens', 'oples', 'crm_clientes', 'avisos_sistema', 'demandas_avulsas', 'mencoes', 'compras_requisicoes', 'estoque_movimentos'] loop
    select column_name into col from information_schema.columns where table_schema = 'public' and table_name = tab order by ordinal_position limit 1;
    foreach a in array array['Admin', 'Almoxarifado'] loop
      r := pg_temp.confere(tab || ' U (linha real)', a, format('update public.%I set %I = %I where ctid in (select ctid from public.%I limit 1)', tab, col, col, tab), 'ok:%');
      testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    end loop;
  end loop;
  -- 7) o que sobrou aberto à chave pública (deve ser só os portais; as 3 políticas "falsas" abaixo negam tudo)
  restantes := (select string_agg(tablename || '.' || policyname, ', ' order by tablename) from pg_policies where schemaname = 'public' and roles && array['public', 'anon']::name[]);
  com_grant := (select string_agg(c.relname, ', ' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege('anon', c.oid, 'SELECT'));
  sem_rls := (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity);
  fun_anon := (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype) and has_function_privilege('anon', p.oid, 'EXECUTE'));
  raise exception E'ENSAIO ONDA 2 (nada foi gravado): % tabelas, % conferencias, % fora do esperado%\\n  politicas ainda abertas a chave publica: %\\n  anon ainda le: %\\n  tabelas sem protecao de linha: %\\n  funcoes (nao-gatilho) que a chave publica ainda chama: %', total, testes, falhas, achados, restantes, com_grant, sem_rls, fun_anon;
`;


// modo --reverter: aplica a migração, aplica a reversão e mostra que o estado voltou ao da fotografia (mesmos números de antes) e que a chave pública volta a ler, gravar e chamar
const corpoRev = `
  execute $mig$${migracao}$mig$;
  execute $rev$${reversao}$rev$;
  foreach r in array array[
    pg_temp.confere('depois de reverter: ler oples', 'anon', 'select count(*) from public.oples', 'ok:%'),
    pg_temp.confere('depois de reverter: gravar config', 'anon', 'insert into public.configuracoes_sistema (chave, valor) values ($q$zz17$q$, $q$x$q$)', 'ok:1'),
    pg_temp.confere('depois de reverter: ler arquivos', 'anon', 'select count(*) from storage.objects', 'ok:%'),
    pg_temp.confere('depois de reverter: funcao eh_admin()', 'anon', 'select public.eh_admin()', 'ok:1'),
    pg_temp.confere('depois de reverter: auth_login()', 'Admin', 'select public.auth_login($q$x$q$, $q$y$q$)', 'ok:1')
  ] loop
    testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  raise exception E'ENSAIO DA REVERSAO (nada foi gravado): % conferencias, % fora do esperado%\\n  sem protecao de linha: antes % agora %\\n  politicas: antes % agora %\\n  tabelas/visoes que a chave publica le: antes % agora %\\n  funcoes que a chave publica chama: antes % agora %',
    testes, falhas, achados,
    (select count(*) from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'tabela' and detalhe->>'tipo' in ('r', 'p') and not (detalhe->>'rls')::boolean),
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
    (select count(*) from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'politica'),
    (select count(*) from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')),
    (select count(*) from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'tabela' and detalhe->'anon' ? 'SELECT'),
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege('anon', c.oid, 'SELECT')),
    (select count(*) from public.etapa17_estado_anterior where onda = 'onda2' and tipo = 'funcao' and (detalhe->>'anon')::boolean),
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') and has_function_privilege('anon', p.oid, 'EXECUTE'));
`;

console.log(`${cabeca}
do $ensaio$
declare achados text := ''; total int := 0; testes int := 0; falhas int := 0; r text; t record; a text; q text; sql text; esp text; n_ativos bigint; um_veiculo uuid; tab text; col text;
        restantes text; com_grant text; sem_rls bigint; fun_anon bigint;
begin${reverter ? corpoRev : corpo}
end $ensaio$;`);
