-- Etapa 17, onda 4a (26/11/2026): o chat passa a ser privado por pessoa.
-- Por que: até aqui qualquer pessoa que entrou lia TODAS as conversas (as 59 diretas e os grupos dos outros), porque as duas
-- tabelas do chat tinham a regra "quem entrou faz tudo" (etapa17_logado). A regra agora é por PESSOA, não por aba:
-- só quem é membro da sala lê e escreve nela (decisão do usuário em 26/11/2026: nem o Admin lê as conversas dos outros).
-- Quem lê o quê hoje: só o ChatWidget (nenhuma visão, função de leitura ou outra tela cita as duas tabelas; os gatilhos de pessoa
-- só mexem na própria linha). O ChatWidget já lê só as salas em que a pessoa é membro; o banco passa a exigir o mesmo.
-- Custo do banco (regra de 13/11/2026): a pessoa vista é calculada UMA vez por consulta (CTE MATERIALIZED dentro da função)
-- e a política usa `(select ...)`; as duas tabelas são pequenas (62 salas, 600 mensagens) e `idx_chat_msgs_sala` cobre o filtro.
-- Membro = o `id` da pessoa OU o `pessoa_id` (um membro antigo guarda o id de antes da unificação; o gatilho de pessoa mantém o `pessoa_id`).
-- Como desfazer: etapa17_onda4a_chat_privado_reverter.sql (devolve a regra anterior e apaga as duas funções).

create or replace function public.chat_minhas_salas() returns setof uuid
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  with e as materialized (select public.usuario_atual_id() as eu)   -- MATERIALIZED: sem isso o banco refazia a conferência da pessoa a cada sala lida (40 ms em vez de 1 ms, medido no ensaio de 26/11/2026)
  select s.id
    from e
    join public.chat_salas s
      on e.eu is not null
     and (s.membros @> jsonb_build_array(jsonb_build_object('id', e.eu::text))
          or s.membros @> jsonb_build_array(jsonb_build_object('pessoa_id', e.eu::text)))
$f$;

create or replace function public.chat_membro(p_membros jsonb) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((select p_membros @> jsonb_build_array(jsonb_build_object('id', e.eu::text))
                          or p_membros @> jsonb_build_array(jsonb_build_object('pessoa_id', e.eu::text))
                     from (select public.usuario_atual_id() as eu) e
                    where e.eu is not null), false)
$f$;

revoke all on function public.chat_minhas_salas() from public, anon;
revoke all on function public.chat_membro(jsonb) from public, anon;
grant execute on function public.chat_minhas_salas() to authenticated;
grant execute on function public.chat_membro(jsonb) to authenticated;

-- Salas: ler, mudar os membros e apagar só quem é membro; criar só incluindo a si mesmo.
-- O "sair do grupo" tira a própria pessoa de `membros`: por isso o WITH CHECK do update só exige estar logado (a regra de antes).
drop policy if exists etapa17_logado on public.chat_salas;
create policy chat_salas_le on public.chat_salas for select to authenticated
  using (id in (select public.chat_minhas_salas()));
create policy chat_salas_cria on public.chat_salas for insert to authenticated
  with check (tipo in ('direto', 'grupo') and public.chat_membro(membros));
create policy chat_salas_muda on public.chat_salas for update to authenticated
  using (id in (select public.chat_minhas_salas()))
  with check ((select public.esta_logado()));
create policy chat_salas_apaga on public.chat_salas for delete to authenticated
  using (id in (select public.chat_minhas_salas()));

-- Mensagens: ler, marcar como lida e apagar (a marca) só nas salas de que a pessoa é membro; escrever só como si mesma.
drop policy if exists etapa17_logado on public.chat_mensagens;
create policy chat_mensagens_le on public.chat_mensagens for select to authenticated
  using (sala_id in (select public.chat_minhas_salas()));
create policy chat_mensagens_escreve on public.chat_mensagens for insert to authenticated
  with check (sala_id in (select public.chat_minhas_salas()) and remetente_id = (select public.usuario_atual_id())::text);
create policy chat_mensagens_muda on public.chat_mensagens for update to authenticated
  using (sala_id in (select public.chat_minhas_salas()))
  with check (sala_id in (select public.chat_minhas_salas()));
