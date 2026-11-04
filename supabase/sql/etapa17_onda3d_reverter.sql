-- Volta atrás da onda 3d (04/11/2026): devolve às duas tabelas de frete a regra "quem entrou" (etapa17_logado). A revogação das três funções de gatilho fica (nada a desfazer: gatilho
-- dispara sem esse direito).
drop policy if exists etapa17_abas on public.pcp_cotacoes_fretes;
create policy etapa17_logado on public.pcp_cotacoes_fretes for all to authenticated using (public.esta_logado()) with check (public.esta_logado());
drop policy if exists etapa17_abas on public.pcp_aprovacoes_fretes;
create policy etapa17_logado on public.pcp_aprovacoes_fretes for all to authenticated using (public.esta_logado()) with check (public.esta_logado());
