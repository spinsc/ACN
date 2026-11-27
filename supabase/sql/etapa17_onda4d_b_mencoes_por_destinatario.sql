-- Etapa 17, onda 4d, parte b (26/11/2026): cada pessoa lê, marca e apaga só as menções que são dela; o Admin lê e mexe em todas (Painel de dados).
-- Por que: a regra "quem entrou faz tudo" deixava qualquer pessoa ler a menção de todo mundo, inclusive texto de aprovação, valores e conversa de OP.
-- Decidido pelo usuário em 26/11/2026: o Admin continua lendo todas; a pessoa comum só as suas. Criar menção para outra pessoa continua livre para
-- quem entrou (é o que o @ faz). O que mexe na menção de outra (duplicata, "resolver para todos") vai pelas funções da parte a.
-- SÓ APLICAR depois da parte a e da tela nova publicada (a tela antiga atualizava e contava a menção de outras pessoas direto na tabela).
-- Custo (regra de 13/11/2026): `(select ...)`, uma conferência por consulta; o índice (mencionado_id, lida) já cobre a leitura da pessoa.
-- Como desfazer: etapa17_onda4d_reverter.sql.

drop policy if exists etapa17_logado on public.mencoes;

create policy etapa17_le on public.mencoes for select to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));

create policy etapa17_insere on public.mencoes for insert to authenticated
  with check ((select public.esta_logado()));

create policy etapa17_minhas_u on public.mencoes for update to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text))
  with check ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));

create policy etapa17_minhas_d on public.mencoes for delete to authenticated
  using ((select public.eh_admin()) or mencoes.mencionado_id = (select public.usuario_atual_id()::text));
