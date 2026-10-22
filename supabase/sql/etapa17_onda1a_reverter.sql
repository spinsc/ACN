-- REVERTE a onda 1a da Etapa 17b (22/10/2026): volta as 14 tabelas ao estado de antes (sem proteção por linha, chave pública e usuário logado com todos os poderes).
-- Só usar se uma tela deixar de funcionar por causa das regras; depois, avisar o usuário e corrigir a regra em vez de deixar aberto.
alter table public.admin_perfis_sistema disable row level security; drop policy if exists admin_perfis_so_admin on public.admin_perfis_sistema; grant all on public.admin_perfis_sistema to anon;
alter table public.auth_usuarios disable row level security; drop policy if exists auth_usuarios_le on public.auth_usuarios; drop policy if exists auth_usuarios_cria on public.auth_usuarios; drop policy if exists auth_usuarios_altera on public.auth_usuarios; drop policy if exists auth_usuarios_apaga on public.auth_usuarios; grant all on public.auth_usuarios to anon;
alter table public.rh_funcionarios disable row level security; drop policy if exists rh_func_le on public.rh_funcionarios; drop policy if exists rh_func_cria on public.rh_funcionarios; drop policy if exists rh_func_altera on public.rh_funcionarios; drop policy if exists rh_func_apaga on public.rh_funcionarios; grant all on public.rh_funcionarios to anon;
grant all on public.rh_funcionarios_basico to anon, authenticated;
alter table public.rh_lancamentos disable row level security; drop policy if exists rh_lanc_rh on public.rh_lancamentos; grant all on public.rh_lancamentos to anon;
alter table public.rh_fechamentos disable row level security; drop policy if exists rh_fech_rh on public.rh_fechamentos; grant all on public.rh_fechamentos to anon;
alter table public.rh_autorizacoes disable row level security; drop policy if exists rh_aut_rh on public.rh_autorizacoes; grant all on public.rh_autorizacoes to anon;
alter table public.rh_comissoes_fechamento disable row level security; drop policy if exists rh_comfech_rh on public.rh_comissoes_fechamento; grant all on public.rh_comissoes_fechamento to anon;
alter table public.crm_whatsapp_config disable row level security; drop policy if exists wpp_config_gc on public.crm_whatsapp_config; grant all on public.crm_whatsapp_config to anon;
alter table public.crm_whatsapp_instancias disable row level security; drop policy if exists wpp_inst_gc on public.crm_whatsapp_instancias; grant all on public.crm_whatsapp_instancias to anon;
grant all on public.configuracoes_email_smtp to anon, authenticated;
create policy email_smtp_update_anon on public.configuracoes_email_smtp for update to public using (true) with check (true);
create policy email_smtp_write_anon on public.configuracoes_email_smtp for insert to public with check (true);
alter table public.notificacoes_config disable row level security; drop policy if exists notif_config_le on public.notificacoes_config; drop policy if exists notif_config_admin on public.notificacoes_config; grant all on public.notificacoes_config to anon;
drop policy if exists notif_resp_le on public.notificacoes_responsaveis; drop policy if exists notif_resp_admin on public.notificacoes_responsaveis;
create policy notif_resp_delete on public.notificacoes_responsaveis for delete to public using (true);
create policy notif_resp_insert on public.notificacoes_responsaveis for insert to public with check (true);
create policy notif_resp_select on public.notificacoes_responsaveis for select to public using (true);
create policy notif_resp_update on public.notificacoes_responsaveis for update to public using (true);
grant all on public.notificacoes_responsaveis to anon;
alter table public.audit_log disable row level security; drop policy if exists audit_le on public.audit_log; drop policy if exists audit_inclui on public.audit_log; grant all on public.audit_log to anon, authenticated;
alter table public.lixeira disable row level security; drop policy if exists lixeira_inclui on public.lixeira; drop policy if exists lixeira_le on public.lixeira; drop policy if exists lixeira_altera on public.lixeira; drop policy if exists lixeira_apaga on public.lixeira; grant all on public.lixeira to anon;
