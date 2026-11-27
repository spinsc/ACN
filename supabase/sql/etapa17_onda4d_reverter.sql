-- Desfaz a onda 4d: devolve a regra "quem entrou faz tudo" às menções. As funções novas ficam (não atrapalham); o gatilho do pedido de compra volta a rodar
-- com o poder de quem grava, como era (se a regra "quem entrou faz tudo" voltou, ele resolve as menções do mesmo jeito).
-- ATENÇÃO: com a regra antiga de volta, a tela nova (que usa as funções) continua funcionando.
drop policy if exists etapa17_le on public.mencoes;
drop policy if exists etapa17_insere on public.mencoes;
drop policy if exists etapa17_minhas_u on public.mencoes;
drop policy if exists etapa17_minhas_d on public.mencoes;
create policy etapa17_logado on public.mencoes for all to authenticated
  using ((select public.esta_logado())) with check ((select public.esta_logado()));

-- só se for preciso desfazer também a parte a:
-- drop function if exists public.mencoes_ja_pendente(text, text, text);
-- drop function if exists public.mencoes_resolver_todos(text, text, text, text);
-- alter function public.resolver_mencoes_aprovacao_ao_decidir() security invoker;
