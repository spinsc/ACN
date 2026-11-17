-- ENSAIO DE CUSTO DO BANCO (13/11/2026). Roda ANTES de aplicar qualquer migração que mexa em função de acesso, política (RLS),
-- gatilho ou índice de tabela usada por muitas telas, e DEPOIS de aplicar, para comparar. Não grava nada: tudo roda como uma pessoa
-- comum (papel "authenticated", como o navegador) dentro de um bloco que termina em erro de propósito, então o banco desfaz tudo.
-- O resultado vem NA MENSAGEM DE ERRO ("ENSAIO ..."): é assim que o relatório chega, não é falha de verdade.
--
-- Por quê: em 12/11/2026 a migração "Ver como" encareceu ~10x a conferência de acesso (esta_logado) que as regras chamavam para CADA
-- linha lida; ninguém mediu antes e o sistema deu timeout. Este roteiro mede isso em todas as tabelas de uma vez.
--
-- Como usar (MCP do Supabase, execute_sql no projeto qgemelnuqdilnggxmrdw): cole o arquivo inteiro. Para ensaiar uma migração ainda
-- não aplicada, ponha o SQL dela no lugar marcado "-- >>> MIGRAÇÃO EM ENSAIO <<<" (o ensaio roda antes e depois dela, no mesmo bloco).
--
-- Como ler: "FALHA" = passou do limite e NÃO se publica sem entender o porquê. Provado em 13/11/2026: com a política de mencoes e oples sem o
-- (select ...) o ensaio acusa as duas tabelas (~640 ms por mil linhas); com o banco como está, passa sem falha.
--   * esta_logado(): custo de UMA chamada (limite 1,00 ms; em 13/11/2026 a base saudável, já com o Ver como, ficou em ~0,64 ms;
--     antes do Ver como era uns 10x menos: se subir, ache o porquê, porque toda requisição paga esse custo uma vez);
--   * cada tabela: tempo de um count(*) completo como usuário comum, por mil linhas (limite 40 ms/mil; regra por linha mal feita
--     dá centenas) — tabelas com menos de 200 linhas só falham acima de 150 ms no total;
--   * consultas das telas mais usadas (selo de Menções, OPs, chat, análises): limite próprio em cada uma.
-- A primeira medida de uma sessão sai mais cara (catálogo frio): por isso cada medida roda duas vezes e vale a segunda.
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_id::text from public.auth_usuarios where coalesce(ativo, false) and auth_id is not null order by (perfil = 'Admin') limit 1),
  'role', 'authenticated', 'session_id', 'ensaio-de-custo')::text, true) as pessoa_do_ensaio;

-- >>> MIGRAÇÃO EM ENSAIO <<<
-- (cole aqui o SQL da migração; deixe vazio para medir o banco como está)

set local role authenticated;
do $ensaio$
declare
  t0 timestamptz; ms numeric; ms1 numeric; relatorio text := ''; falhas int := 0; r record; n bigint; i int; x bigint;
  uid text := 'x'; nome text := 'x';
begin
  -- 1) custo de UMA conferência de acesso (a chamada que as regras repetem por linha)
  perform public.esta_logado();
  t0 := clock_timestamp();
  for i in 1..1000 loop perform public.esta_logado(); end loop;
  ms := extract(epoch from clock_timestamp() - t0) * 1000 / 1000;
  relatorio := relatorio || format(E'esta_logado(): %s ms por chamada %s\n', round(ms, 3), case when ms > 1.00 then '<< FALHA (limite 1,00)' else 'ok' end);
  if ms > 1.00 then falhas := falhas + 1; end if;

  -- 2) todas as tabelas do esquema public: leitura completa como usuário comum
  for r in
    select c.relname, greatest(c.reltuples, 0)::bigint as linhas
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', r.relname) into n;                 -- esquenta (catálogo e plano)
      t0 := clock_timestamp();
      execute format('select count(*) from public.%I', r.relname) into n;
      ms := extract(epoch from clock_timestamp() - t0) * 1000;
      if (n >= 200 and ms / (n / 1000.0) > 40) or (n < 200 and ms > 150) then
        relatorio := relatorio || format(E'tabela %s: %s linhas lidas, %s ms (%s ms por mil) << FALHA\n', r.relname, n, round(ms), round(ms / greatest(n, 1) * 1000));
        falhas := falhas + 1;
      end if;
    exception when others then
      relatorio := relatorio || format(E'tabela %s: leitura recusada (%s) — normal para dado sensível\n', r.relname, sqlerrm);
    end;
  end loop;

  -- 3) as consultas das telas mais usadas (limite em ms, segunda medida)
  for r in
    select * from (values
      ('selo de Menções', $q$select count(*) from public.mencoes where (mencionado_id = 'x' or mencionado_nome ilike '%x%') and contexto <> 'op_adaptacao' and resolvida = false$q$, 60),
      ('lista de OPs', $q$select * from public.oples where status_geral = any(array['Em Espera PCP','Aguardando Almox','Aguardando Inicio Producao','Em Producao','Faturado']) order by data_entrada desc limit 1000$q$, 120),
      ('chat (selo)', $q$select id, sala_id, texto, criado_em from public.chat_mensagens order by criado_em desc limit 500$q$, 80),
      ('análises por setor', $q$select * from public.analise_setores limit 1000$q$, 60),
      ('cards do CRM (visão básica)', $q$select * from public.crm_oportunidades_basico limit 1000$q$, 40),   -- 13/11/2026: era 261 ms (função de acesso por linha na visão); hoje ~8 ms
      ('PCP: OPs com select *', $q$select * from public.oples where status_geral = any(array['Em Espera PCP','Aguardando Almox','Kit OK - Aguardando PCP','Devolvida PCP','Retrabalho']) order by data_entrada desc$q$, 80),
      ('Produção: OPs com select *', $q$select * from public.oples where status_geral = any(array['Aguardando Inicio Producao','Em Producao','Retrabalho','Em Retrabalho']) order by data_entrada desc$q$, 80),
      ('Fiscal: OPs com select *', $q$select * from public.oples where status_geral = any(array['Aguarda Emissao NF','Faturado e Disponivel para Entrega']) order by data_liberacao_comercial$q$, 250),
      ('pedidos de compra', $q$select * from public.pcp_pedidos_compra order by data_criacao desc limit 1000$q$, 120),
      ('busca de itens', $q$select id, codigo, nome from public.cadastro_itens where (nome_norm ilike '%cabo%' or codigo_norm ilike '%cabo%') and ativo = true limit 50$q$, 80),
      ('demandas do setor', $q$select * from public.demandas_setoriais where setor_destino = 'PCP' order by data_abertura desc limit 500$q$, 80)
    ) as v(nome, sql, limite)
  loop
    begin
      execute 'select length(coalesce(json_agg(q), ''[]'')::text) from (' || r.sql || ') q' into x;   -- esquenta (catálogo e plano)
    exception when others then null; end;
    begin
      -- 13/11/2026: mede montando o JSON como o PostgREST faz (json_agg). Com count(*) o banco nem calcula as colunas da resposta, e uma visão com função de acesso por linha
      -- (crm_oportunidades_basico, 261 ms por chamada) passava no ensaio sem falha.
      t0 := clock_timestamp();
      execute 'select length(coalesce(json_agg(q), ''[]'')::text) from (' || r.sql || ') q' into x;
      ms := extract(epoch from clock_timestamp() - t0) * 1000;
      relatorio := relatorio || format(E'tela "%s": %s ms (limite %s) %s\n', r.nome, round(ms), r.limite, case when ms > r.limite then '<< FALHA' else 'ok' end);
      if ms > r.limite then falhas := falhas + 1; end if;
    exception when others then
      relatorio := relatorio || format(E'tela "%s": não foi possível medir (%s)\n', r.nome, sqlerrm);
    end;
  end loop;

  raise exception E'ENSAIO DE CUSTO — % falha(s)\n%', falhas, relatorio;
end
$ensaio$;
rollback;
