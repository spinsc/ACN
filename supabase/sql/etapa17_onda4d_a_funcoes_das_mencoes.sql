-- Etapa 17, onda 4d, parte a (26/11/2026): as três coisas que o sistema faz com a menção de OUTRA pessoa passam a ser funções do banco.
-- Por que: hoje a tabela `mencoes` (3.659 linhas, 31 pessoas) deixa qualquer pessoa que entrou ler e alterar a menção de todo mundo. Para cada pessoa ler só
-- as suas (parte b), o que hoje mexe na linha de outra precisa de um caminho próprio, que só faz aquilo e nada mais:
--   1. `mencoes_ja_pendente`: saber se a pessoa já tem uma menção aberta daquele assunto (a conferência de duplicata de `salvarMencoes`); só devolve sim ou não.
--   2. `mencoes_resolver_todos`: a aprovação de compra, de frete e de hora extra encerra o assunto para todos os avisados (regra do usuário em 24/09/2026);
--      não apaga nada, só marca resolvida, como a tela já fazia.
--   3. o gatilho `resolver_mencoes_aprovacao_ao_decidir` (pedido de compra decidido) passa a rodar com o poder de dono, senão deixaria de resolver as menções
--      dos outros sem dar erro (mesma lição do `licitacao_doc_touch_licitacao`).
-- Esta parte só ACRESCENTA: nada do que existe deixa de funcionar. Quem entra executa; a chave pública não. Como desfazer: etapa17_onda4d_reverter.sql.

create or replace function public.mencoes_ja_pendente(p_mencionado text, p_contexto_id text, p_campo text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $f$
  select (select public.esta_logado())
     and exists (select 1 from public.mencoes m
                  where m.mencionado_id = p_mencionado and m.contexto_id = p_contexto_id
                    and m.campo = p_campo and m.lida = false);
$f$;

create or replace function public.mencoes_resolver_todos(p_contexto text, p_contexto_id text, p_por text default null, p_campo text default null)
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $f$
declare n integer;
begin
  if not (select public.esta_logado()) then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if coalesce(p_contexto, '') = '' or coalesce(p_contexto_id, '') = '' then return 0; end if;
  update public.mencoes
     set resolvida = true, resolvida_em = now(), resolvida_por = p_por, lida = true
   where contexto = p_contexto and contexto_id = p_contexto_id
     and resolvida = false
     and (p_campo is null or campo = p_campo);
  get diagnostics n = row_count;
  return n;
end $f$;

revoke all on function public.mencoes_ja_pendente(text, text, text) from public, anon;
grant execute on function public.mencoes_ja_pendente(text, text, text) to authenticated;
revoke all on function public.mencoes_resolver_todos(text, text, text, text) from public, anon;
grant execute on function public.mencoes_resolver_todos(text, text, text, text) to authenticated;

-- o gatilho do pedido de compra resolve as menções de todos os aprovadores quando o pedido é decidido
create or replace function public.resolver_mencoes_aprovacao_ao_decidir()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if NEW.status_compra in ('Aprovado','Comprado','Recebido','Descartada')
     or (OLD.status_compra = 'Aguardando Aprovação') then
    update public.mencoes
       set resolvida = true, resolvida_em = now(), resolvida_por = 'Sistema (aprovação decidida)', lida = true
     where contexto = 'compra_aprovacao' and contexto_id = NEW.id::text
       and campo in ('aprovacao_departamento','aprovacao_nivel','aguardando_aprovacao')
       and resolvida = false;
  end if;
  return NEW;
end $f$;

-- função de gatilho: dispara sem esse direito (regra do banco)
revoke all on function public.resolver_mencoes_aprovacao_ao_decidir() from public, anon, authenticated;
