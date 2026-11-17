---
name: saude-banco
description: Checar a saúde do banco (Supabase) e medir o custo de uma mudança antes e depois de publicar. Use depois de qualquer deploy ou migração, quando o sistema estiver lento ou com timeout, ou quando o usuário digitar /saude-banco.
---

# Saúde do banco — ensaio antes, checagem depois

Criada em 13/11/2026, depois que a migração "Ver como" (12/11) encareceu ~10x a conferência de acesso que as regras chamam por linha e o sistema deu timeout (instância pequena, CPU compartilhada que estoura e é limitada). Projeto Supabase: `qgemelnuqdilnggxmrdw`. **Só lê e mede; não grava nada.** Responda em português, em linguagem de processo.

As ferramentas do Supabase (`execute_sql`, `query_logs`) são deferidas: carregue-as numa só chamada de `ToolSearch` (`select:mcp__0efd1d0a-c7df-4fc5-86ed-4fd92cf82fc5__execute_sql,mcp__0efd1d0a-c7df-4fc5-86ed-4fd92cf82fc5__query_logs`).

## A) ANTES de aplicar uma migração (obrigatório se ela mexe em função de acesso, política/RLS, gatilho ou índice)

1. Rode `supabase/sql/ensaio_de_custo.sql` pelo `execute_sql`, **uma vez como o banco está** (a base) e **outra com o SQL da migração colado no lugar marcado** `-- >>> MIGRAÇÃO EM ENSAIO <<<`. Tudo é desfeito no fim; o relatório vem na mensagem de erro que começa com "ENSAIO DE CUSTO".
2. Qualquer linha com `<< FALHA` **barra a migração**: ache o porquê (a causa clássica é função chamada por linha dentro de política: troque `f()` por `(select f())`) e ensaie de novo. Compare as duas rodadas: o ensaio com a migração não pode ficar pior que a base.
3. Só então aplique com `apply_migration` e rode o ensaio de novo (deve ficar igual ao ensaiado).

## B) DEPOIS de publicar (ou quando reclamarem de lentidão)

Faça as quatro medidas e dê o veredito em poucas linhas:

1. **CPU do banco** (`execute_sql`): `do $$ declare t0 timestamptz; r text := ''; i int; x bigint; begin for i in 1..5 loop t0 := clock_timestamp(); select count(*) into x from generate_series(1,2000000); r := r || round(extract(epoch from clock_timestamp()-t0)*1000) || 'ms '; end loop; raise exception 'ciclos: %', r; end $$;` — a base saudável dá **~400 ms** cada; **1 a 2 s = CPU começando a ser limitada; 4 s ou mais = estrangulada** (foi o caso em 12/11/2026).
2. **Timeouts** (`query_logs`, janela das últimas 2 horas, `source='postgres_logs'`, `event_message ilike '%statement timeout%'`, contando por 10 minutos). Zero é o normal; as funções têm limite de 3 s (chave pública) e 8 s (quem entrou).
3. **Volume** (`query_logs`, `source='edge_logs'`, contagem por 10 minutos e, por `log_attributes['request.path']`, os caminhos que mais aparecem): com a equipe toda a base é ~100 pedidos por minuto; **mais de 300 por minuto sem motivo** = alguma tela voltou a consultar demais (cheque `setInterval` novo sem `intervaloVisivel`).
4. **Consultas mais caras** (`execute_sql`): `select calls, round(mean_exec_time::numeric,1) mean_ms, round(max_exec_time::numeric) max_ms, left(regexp_replace(query,'\s+',' ','g'),150) q from pg_stat_statements where query not ilike '%pg_stat%' and query not ilike 'SELECT wal%' order by total_exec_time desc limit 8;` — média acima de 100 ms numa consulta que roda muitas vezes é suspeita. `pg_stat_statements_reset()` só com pedido, porque zera o histórico.

Se algo estiver fora do normal: diga qual das quatro, o que mudou por último (`select version, name from supabase_migrations.schema_migrations order by version desc limit 10` e `git log`), e proponha a correção — **não aplique migração sem o OK do usuário**. O último recurso, que é do usuário, é subir a instância no painel do Supabase (Settings → Compute and Disk).

## Regras que evitam o problema desde o começo

- Política nova: `(select public.esta_logado())`, `(select public.tem_alguma_aba(...))`, nunca a função solta (vale para `eh_admin`, `tem_aba`, `pode_*`).
- Atualização periódica nova: `intervaloVisivel` (`src/IntervaloVisivel.ts`), nunca `setInterval` para dado do banco; prefira o tempo real ao "perguntar de novo".
- Consulta nova que roda em toda tela (selo, contador): conte quantas linhas ela lê e se usa índice; `ilike` com `or` não usa índice.
