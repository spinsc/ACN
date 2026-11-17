-- 17/11/2026: desfaz formacao_excluir.sql (NÃO aplicado; fica guardado para quem precisar voltar atrás).
-- Regra do projeto: nunca apagar dado do usuário. Por isso este arquivo RECUSA rodar se já existe formação (ou versão) excluída:
-- as colunas excluida_* guardam o motivo, quem e quando, e o vínculo com card/licitação escondido; apagá-las perderia isso e traria de volta, de uma vez, formações que alguém tirou de propósito.
-- Se houver excluídas, primeiro decida com o usuário o que fazer com elas (restaurar uma a uma pelo banco, ou manter) e só então rode.
do $$
declare n int;
begin
  select count(*) into n from public.cotacoes_precos where excluida_em is not null;
  if n > 0 then
    raise exception 'Há % formação(ões) excluída(s): não desfaça sem decidir o que fazer com elas', n;
  end if;
end $$;

drop function if exists public.formacoes_excluidas();
drop function if exists public.formacao_excluir(uuid, text, text, timestamptz);
drop function if exists public.formacao_excluir_conferir(uuid, text);

drop policy if exists cotacoes_precos_vinculos_da_excluida on public.cotacoes_precos_vinculos;
drop policy if exists cotacoes_precos_nao_excluidas on public.cotacoes_precos;

alter table public.cotacoes_precos_vinculos drop column if exists cotacao_excluida;
alter table public.cotacoes_precos
  drop column if exists excluida_desligado,
  drop column if exists excluida_escopo,
  drop column if exists excluida_motivo,
  drop column if exists excluida_por,
  drop column if exists excluida_em;
