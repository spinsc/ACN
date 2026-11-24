-- Desfaz usuarios_por_id_u2b.sql: tira os gatilhos das listas, as funcoes e a tabela de apoio, e devolve a pessoa_propagar_nome de antes (sem as listas).
-- A chave `pessoa_id` que ja entrou nos elementos das listas fica (e inofensiva: nenhuma tela a le) e os nomes regravados como o nome atual tambem ficam.
set local lock_timeout = '5s';
do $r$
declare r record; f text; d text;
begin
  for r in select * from public.pessoa_colunas_lista loop
    f := 'pessoa_lista_trg_' || r.tabela || '_' || r.coluna;
    execute format('drop trigger if exists %I on public.%I', f, r.tabela);
    execute format('drop function if exists public.%I()', f);
  end loop;
  d := pg_get_functiondef('public.pessoa_propagar_nome(uuid)'::regprocedure);
  d := replace(d, E'total := total + public.pessoa_propagar_listas(p_pid);\n  return total;', 'return total;');
  execute d;
end $r$;
drop function if exists public.pessoa_lista_aplicar(text);
drop function if exists public.pessoa_propagar_listas(uuid);
drop function if exists public.pessoa_lista_sincronizar(jsonb);
drop table if exists public.pessoa_colunas_lista;
