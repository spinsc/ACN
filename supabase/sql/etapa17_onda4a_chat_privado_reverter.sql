-- Desfaz a onda 4a (chat privado): volta a regra "quem entrou faz tudo" nas duas tabelas do chat e apaga as duas funções.
drop policy if exists chat_salas_le on public.chat_salas;
drop policy if exists chat_salas_cria on public.chat_salas;
drop policy if exists chat_salas_muda on public.chat_salas;
drop policy if exists chat_salas_apaga on public.chat_salas;
drop policy if exists chat_mensagens_le on public.chat_mensagens;
drop policy if exists chat_mensagens_escreve on public.chat_mensagens;
drop policy if exists chat_mensagens_muda on public.chat_mensagens;
create policy etapa17_logado on public.chat_salas for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));
create policy etapa17_logado on public.chat_mensagens for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));
drop function if exists public.chat_minhas_salas();
drop function if exists public.chat_membro(jsonb);
