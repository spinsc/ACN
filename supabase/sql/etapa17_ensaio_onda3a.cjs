// Gera o SQL do ENSAIO da onda 3a (separar por aba as tabelas de dinheiro e preços): aplica etapa17_onda3a.sql dentro de um bloco que termina em erro de propósito (nada fica gravado) e,
// com o poder da chave pública, de pessoas de verdade de 6 perfis (a de MENOS abas de cada perfil; crachá simulado por request.jwt.claims + SET LOCAL ROLE) e do Admin, confere tabela por tabela
// que quem tem alguma das abas lê tudo e altera, e quem não tem não vê nem altera nada. A expectativa é calculada pelos dados (abas da pessoa × lista da tabela), não pela função nova.
//   node etapa17_ensaio_onda3a.cjs > ensaio.sql          (com --reverter: aplica a migração e logo a reversão e mostra que quem não tinha a aba volta a ler)
const fs = require('fs'); const D = __dirname + '/';
const limpa = (f) => fs.readFileSync(D + f, 'utf8').split('\n').filter(l => !/^\s*--/.test(l) && l.trim()).join('\n');
const migracao = limpa('etapa17_onda3a.sql');
const reverter = process.argv.includes('--reverter');
const reversao = reverter ? limpa('etapa17_onda3a_reverter.sql') : '';
// tabela -> abas que a usam (a mesma lista da migração)
const TABELAS = {
  financeiro_tarefas: ['financeiro', 'calendario'], financeiro_tarefa_anexos: ['financeiro'], financeiro_tipos_tarefa: ['financeiro'],
  conciliacao_extratos: ['financeiro'], conciliacao_lancamentos: ['financeiro'],
  centro_custo_recorrencias: ['admin', 'financeiro', 'compras'], centros_custo_tipos: ['admin', 'financeiro', 'compras'], compras_departamentos: ['admin', 'financeiro', 'compras'],
  pcp_cotacoes_fornecedores: ['admin', 'financeiro', 'compras'], compras_chegadas_itens: ['compras', 'engenharia', 'financeiro', 'logistica', 'pcp'],
  cotacoes_aprovacoes: ['cotacoes', 'crm'], cotacoes_precos_log: ['crm', 'formacao_precos', 'licitacoes', 'telecom'],
  cotacoes_precos_relacionadas: ['crm', 'formacao_precos', 'licitacoes', 'telecom'], formacao_precos_tipos: ['crm', 'formacao_precos', 'licitacoes', 'telecom'],
};
const PERFIS = ['Admin', 'Chicote', 'RH', 'Gerente administrativo', 'Compras', 'Comercial', 'Engenharia'];
const lista = (a) => a.map(x => `'${x}'`).join(', ');
const arr = (a) => `array[${lista(a)}]`;

const cabeca = `create function pg_temp.ator(p_perfil text) returns uuid language sql as $f$ select auth_id from public.auth_usuarios where ativo and perfil = p_perfil and auth_id is not null order by jsonb_array_length(coalesce(abas_permitidas, '[]'::jsonb)), nome limit 1 $f$;
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
  return E'\\n  ' || rpad(p_nome, 40) || ' ' || rpad(p_perfil, 24) || ' esperava ' || rpad(p_esperado, 10) || ' veio ' || got;
end $f$;`;

const corpoTabelas = `
  foreach tab in array array[${lista(Object.keys(TABELAS))}] loop
    abas := case tab ${Object.entries(TABELAS).map(([t, a]) => `when '${t}' then ${arr(a)}`).join(' ')} end;
    select column_name into col from information_schema.columns where table_schema = 'public' and table_name = tab order by ordinal_position limit 1;
    total := (select substring(pg_temp.tenta('service_role', format('select count(*) from public.%I', tab)) from 4)::bigint);
    if total = 0 then vazias := vazias || tab || ' '; end if;
    -- a chave pública não lê
    r := pg_temp.confere(tab || ' S', 'anon', format('select count(*) from public.%I', tab), 'ERRO 42501'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    foreach perfil in array array[${lista(PERFIS)}] loop
      ator := pg_temp.ator(perfil);
      if ator is null then achados := achados || E'\\n  sem pessoa de verdade para o perfil ' || perfil; falhas := falhas + 1; continue; end if;
      pode := exists (select 1 from public.auth_usuarios u where u.auth_id = ator and (u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or u.abas_permitidas ?| abas));
      if pode then pode_n := pode_n + 1; else nega_n := nega_n + 1; end if;
      r := pg_temp.confere(tab || ' S', perfil, format('select count(*) from public.%I', tab), case when pode then 'ok:' || total else 'ok:0' end); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
      if total = 0 then
        -- tabela vazia: a leitura não prova nada; a INSERÇÃO prova, porque a política (WITH CHECK) barra antes de qualquer outra regra (sem direito = 42501; com direito = passa ou cai em outra regra, como campo obrigatório)
        got := pg_temp.tenta(perfil, format('insert into public.%I default values', tab)); testes := testes + 1;
        if (pode and got = 'ERRO 42501') or (not pode and got <> 'ERRO 42501') then achados := achados || E'\\n  ' || rpad(tab || ' I (vazia)', 40) || ' ' || rpad(perfil, 24) || ' pode=' || pode || ' veio ' || got; falhas := falhas + 1; end if;
      else
        r := pg_temp.confere(tab || ' U', perfil, format('update public.%I set %I = %I where ctid in (select ctid from public.%I limit 1)', tab, col, col, tab), case when pode then 'ok:1' else 'ok:0' end); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
        -- apagar: com direito, o banco pode recusar por outra tabela apontar para a linha (23503); isso prova que a política deixou passar, então vale como esperado
        r := pg_temp.confere(tab || ' D', perfil, format('delete from public.%I where ctid in (select ctid from public.%I limit 1)', tab, tab), case when pode then 'ok:1' else 'ok:0' end); testes := testes + 1;
        if r is not null and not (pode and r like '%ERRO 23503%') then achados := achados || r; falhas := falhas + 1; end if;
      end if;
    end loop;
  end loop;
  -- o resto continua como era: quem entrou lê e grava nas outras tabelas, mesmo sem a aba (o que esta onda NÃO mexe)
  foreach tab in array array['cotacoes_precos', 'pcp_pedidos_compra', 'cotacoes_propostas', 'compras_alcadas_aprovacao', 'centros_custo', 'oples', 'cadastro_itens'] loop
    select column_name into col from information_schema.columns where table_schema = 'public' and table_name = tab order by ordinal_position limit 1;
    foreach perfil in array array['Chicote', 'RH'] loop
      r := pg_temp.confere(tab || ' U (fora da onda)', perfil, format('update public.%I set %I = %I where ctid in (select ctid from public.%I limit 1)', tab, col, col, tab), 'ok:1'); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
    end loop;
  end loop;
  -- a função de regra: chave pública não chama; quem entrou, sim
  foreach r in array array[
    pg_temp.confere('funcao tem_alguma_aba()', 'anon', 'select public.tem_alguma_aba(array[$q$x$q$])', 'ERRO 42501'),
    pg_temp.confere('funcao tem_alguma_aba()', 'Chicote', 'select public.tem_alguma_aba(array[$q$x$q$])', 'ok:1')
  ] loop testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if; end loop;
  politicas := (select count(*) from pg_policies where schemaname = 'public' and policyname = 'etapa17_abas');
  raise exception E'ENSAIO ONDA 3a (nada foi gravado): % tabelas, % politicas novas, % conferencias, % fora do esperado%\\n  pessoa x tabela com acesso: %, sem acesso: %\\n  tabelas vazias (nao deu para conferir leitura): %',
    ${Object.keys(TABELAS).length}, politicas, testes, falhas, achados, pode_n, nega_n, coalesce(nullif(vazias, ''), 'nenhuma');
`;

const corpoRev = `
  execute $rev$${reversao}$rev$;
  foreach tab in array array[${lista(Object.keys(TABELAS))}] loop
    total := (select substring(pg_temp.tenta('service_role', format('select count(*) from public.%I', tab)) from 4)::bigint);
    if total = 0 then continue; end if;
    r := pg_temp.confere('depois de reverter: ' || tab, 'Chicote', format('select count(*) from public.%I', tab), 'ok:' || total); testes := testes + 1; if r is not null then achados := achados || r; falhas := falhas + 1; end if;
  end loop;
  politicas := (select count(*) from pg_policies where schemaname = 'public' and policyname = 'etapa17_abas');
  raise exception E'ENSAIO DA REVERSAO 3a (nada foi gravado): % conferencias, % fora do esperado%\\n  politicas etapa17_abas que sobraram: %', testes, falhas, achados, politicas;
`;

console.log(`${cabeca}
do $ensaio$
declare achados text := ''; testes int := 0; falhas int := 0; r text; got text; tab text; col text; abas text[]; total bigint; perfil text; ator uuid; pode boolean; pode_n int := 0; nega_n int := 0; vazias text := ''; politicas bigint;
begin
  execute $mig$${migracao}$mig$;${reverter ? corpoRev : corpoTabelas}
end $ensaio$;`);
