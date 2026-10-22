// Gera o SQL do ENSAIO da onda 1a: aplica a migração dentro de um bloco que termina em erro de propósito (nada fica gravado) e, com o poder de cada perfil (crachá simulado por
// request.jwt.claims + SET LOCAL ROLE), tenta ler, alterar, apagar e incluir em cada tabela. O resultado volta na mensagem do erro.   node gera_teste_onda1.cjs > ensaio.sql
const fs = require('fs'); const SC = __dirname + '/';
const migracao = process.argv[2] === '--sem-migracao' ? '' : fs.readFileSync(SC + 'etapa17_onda1a.sql', 'utf8').split('\n').filter(l => !/^\s*--/.test(l) && l.trim()).join('\n');
const ATORES = ['anon', 'Admin', 'RH', 'Gerente Produção', 'Comercial', 'Gerente Comercial', 'Licitações', 'Almoxarifado'];
const TABELAS = ['admin_perfis_sistema', 'auth_usuarios', 'rh_funcionarios', 'rh_funcionarios_basico', 'rh_lancamentos', 'rh_fechamentos', 'rh_autorizacoes', 'rh_comissoes_fechamento', 'crm_whatsapp_config', 'crm_whatsapp_instancias', 'configuracoes_email_smtp', 'notificacoes_config', 'notificacoes_responsaveis', 'audit_log', 'lixeira'];
const INSERE = {
  auth_usuarios: "insert into public.auth_usuarios (email, nome, perfil, ativo) values ('zz17@teste.local', 'ZZ 17', 'Admin', true)",
  audit_log: "insert into public.audit_log (user_nome, module, entity_type, entity_id, change_type) values ('ZZ', 'zz', 'zz', 'zz', 'CREATE')",
  lixeira: "insert into public.lixeira (tabela, registro_id, dados) values ('zz', '00000000-0000-0000-0000-000000000000', '{}'::jsonb)",
  notificacoes_responsaveis: "insert into public.notificacoes_responsaveis (perfil, usuario_id) values ('ZZ', '00000000-0000-0000-0000-000000000000')",
  crm_whatsapp_config: "insert into public.crm_whatsapp_config (evolution_url, api_token) values ('x', 'y')",
};
const atoresSql = ATORES.map(a => `'${a}'`).join(', ');
const tabelasSql = TABELAS.map(a => `'${a}'`).join(', ');
const insereSql = Object.entries(INSERE).map(([t, q]) => `('${t}', $q$${q}$q$)`).join(', ');
console.log(`create function pg_temp.ator(p_perfil text) returns uuid language sql as $f$ select auth_id from public.auth_usuarios where ativo and perfil = p_perfil and auth_id is not null limit 1 $f$;
create function pg_temp.tenta(p_perfil text, p_sql text) returns text language plpgsql as $f$
declare v_uid uuid; v_rol text; n bigint; m text;
begin
  if p_perfil = 'anon' then v_rol := 'anon'; perform set_config('request.jwt.claims', '', true);
  else v_rol := 'authenticated'; v_uid := pg_temp.ator(p_perfil); perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true); end if;
  execute 'set local role ' || v_rol;
  begin
    if p_sql ~* '^select count' then execute p_sql into n; else execute p_sql; get diagnostics n = row_count; end if;
    m := 'ok:' || n;
    raise exception 'desfaz';   -- cada teste se desfaz: o seguinte parte do mesmo estado
  exception when others then if sqlerrm <> 'desfaz' then m := 'ERRO ' || sqlstate; end if; end;
  reset role;
  return m;
end $f$;
do $ensaio$
declare saida text := ''; t text; c text; a text; q text; ops text[]; linha text; eh_visao boolean;
begin
${migracao}
  foreach t in array array[${tabelasSql}] loop
    select column_name into c from information_schema.columns where table_schema = 'public' and table_name = t order by ordinal_position limit 1;
    eh_visao := exists (select 1 from pg_class k join pg_namespace s on s.oid = k.relnamespace where s.nspname = 'public' and k.relname = t and k.relkind = 'v');
    foreach q in array array['S', 'U', 'D', 'I'] loop
      if q = 'D' and eh_visao then continue; end if;
      if q = 'I' and not exists (select 1 from (values ${insereSql}) v(tab, sql) where v.tab = t) then continue; end if;
      linha := rpad(t, 27) || ' ' || q || ' ';
      foreach a in array array[${atoresSql}] loop
        linha := linha || rpad(substr(a, 1, 6), 6) || '=' || rpad(pg_temp.tenta(a, case q
          when 'S' then format('select count(*) from public.%I', t)
          when 'U' then format('update public.%I set %I = %I', t, c, c)
          when 'D' then format('delete from public.%I where ctid in (select ctid from public.%I limit 1)', t, t)
          else (select sql from (values ${insereSql}) v(tab, sql) where v.tab = t) end), 11) || ' ';
      end loop;
      saida := saida || E'\\n' || linha;
    end loop;
  end loop;
  raise exception 'ENSAIO (nada foi gravado):%', saida;
end $ensaio$;`);
