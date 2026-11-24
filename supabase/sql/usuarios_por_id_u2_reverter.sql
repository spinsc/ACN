-- Desfaz usuarios_por_id_u2.sql (plano "toda pessoa por ID", 24/11/2026).
-- Tira os gatilhos, as funcoes, as colunas *_pessoa_id e as duas tabelas de apoio. Os NOMES em texto nunca foram apagados pela migracao,
-- entao nada do que a tela le deixa de existir; so se perde o ID guardado (que se refaz rodando a migracao de novo).
do $r$
declare r record;
begin
  for r in select distinct tabela from public.pessoa_colunas loop
    execute format('drop trigger if exists pessoa_sincronizar_ids on public.%I', r.tabela);
    execute format('drop function if exists public.%I()', 'pessoa_trg_' || r.tabela);
  end loop;
  for r in select tabela, id_coluna from public.pessoa_colunas loop
    execute format('alter table public.%I drop column if exists %I', r.tabela, r.id_coluna);
  end loop;
end $r$;
drop trigger if exists pessoa_apelidos_usuario on public.auth_usuarios;
drop trigger if exists pessoa_apelidos_rh on public.rh_funcionarios;
drop function if exists public.pessoa_trg_auth_usuarios();
drop function if exists public.pessoa_trg_rh_funcionarios();
drop function if exists public.pessoa_unificar(uuid, uuid);
drop function if exists public.pessoa_propagar_nome(uuid);
drop function if exists public.pessoa_sincronizar(boolean, text, text, uuid, uuid, text);
drop function if exists public.pessoa_id_por_texto(text);
drop function if exists public.pessoa_nome(uuid);
drop function if exists public.pessoa_canonica(uuid);
drop function if exists public.pessoa_aplicar_lote(text[], integer);
drop function if exists public.pessoa_ligar_gatilho(text);
drop function if exists public.pessoa_preencher(text, integer);
drop function if exists public.pessoa_aplicar_estrutura(text);
drop function if exists public.pessoa_listar_colunas();
drop function if exists public.pessoa_chave(text);
drop table if exists public.usuarios_nomes_antigos;
drop table if exists public.pessoa_colunas;
