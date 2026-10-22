-- Etapa 17b, onda 1a (22/10/2026) — fecha a ESCRITA das 14 tabelas da onda 1 e a LEITURA das mais sensíveis.
--
-- Por que existe: até aqui a chave pública (a que o navegador usa e que está no código publicado) lia, gravava e apagava nessas tabelas sem entrar no sistema. Com isso qualquer pessoa
-- podia, por exemplo, virar Admin (auth_usuarios), ler CPF e salário do RH, ler o token do WhatsApp ou apagar o histórico. A regra de cada tabela segue o que o sistema JÁ decide hoje
-- (perfil Admin, abas liberadas, permissões do RH), pelas funções da migração etapa17b0_funcoes_de_regra_por_perfil; nenhuma regra nova foi inventada.
--
-- O que NÃO fecha agora (onda 1b, depende de o teste de navegador ter um crachá de verdade): a LEITURA de auth_usuarios, notificacoes_*, audit_log e da visão rh_funcionarios_basico
-- continua aberta também à chave pública (nomes, perfis e histórico; nada de CPF, salário ou token) — o teste de navegador do projeto ainda lê essas tabelas por ela.
--
-- Todas as 23 pessoas ativas já têm crachá (medido em 22/10/2026: 23 de 23), a trava EXIGIR_CRACHA está ligada desde 14/10, as funções de servidor usam a chave de serviço
-- (não passam por estas regras) e os portais públicos de veículos não tocam nestas tabelas. Para voltar atrás: etapa17_onda1a_reverter.sql.

-- 1) admin_perfis_sistema — só Admin (só a tela de Administração usa)
alter table public.admin_perfis_sistema enable row level security;
create policy admin_perfis_so_admin on public.admin_perfis_sistema for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
revoke all on public.admin_perfis_sistema from anon;

-- 2) auth_usuarios — ler: todos (por ora, também a chave pública); criar, editar, apagar e ativar: só Admin (hoje qualquer um podia se dar o perfil Admin)
alter table public.auth_usuarios enable row level security;
create policy auth_usuarios_le on public.auth_usuarios for select to anon, authenticated using (true);
create policy auth_usuarios_cria on public.auth_usuarios for insert to authenticated with check (public.eh_admin());
create policy auth_usuarios_altera on public.auth_usuarios for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy auth_usuarios_apaga on public.auth_usuarios for delete to authenticated using (public.eh_admin());
revoke insert, update, delete, truncate on public.auth_usuarios from anon;

-- 3) rh_funcionarios (CPF, salário, endereço…) — ler: Admin, aba RH ou permissão de comissões de técnicos; gravar: Admin ou aba RH. As outras telas leem a visão rh_funcionarios_basico.
alter table public.rh_funcionarios enable row level security;
create policy rh_func_le on public.rh_funcionarios for select to authenticated using (public.pode_ver_comissoes());
create policy rh_func_cria on public.rh_funcionarios for insert to authenticated with check (public.pode_ver_rh());
create policy rh_func_altera on public.rh_funcionarios for update to authenticated using (public.pode_ver_rh()) with check (public.pode_ver_rh());
create policy rh_func_apaga on public.rh_funcionarios for delete to authenticated using (public.pode_ver_rh());
revoke all on public.rh_funcionarios from anon;
-- a visão básica segue legível por ora, mas nunca aceita escrita (ela roda com o poder do dono e passaria por cima das regras da tabela)
revoke insert, update, delete, truncate on public.rh_funcionarios_basico from anon, authenticated;

-- 4) banco de horas e fechamentos do RH — Admin ou aba RH
alter table public.rh_lancamentos enable row level security;
create policy rh_lanc_rh on public.rh_lancamentos for all to authenticated using (public.pode_ver_rh()) with check (public.pode_ver_rh());
revoke all on public.rh_lancamentos from anon;
alter table public.rh_fechamentos enable row level security;
create policy rh_fech_rh on public.rh_fechamentos for all to authenticated using (public.pode_ver_rh()) with check (public.pode_ver_rh());
revoke all on public.rh_fechamentos from anon;

-- 5) autorizações de saída e entrada — Admin, aba RH ou "pode autorizar RH"
alter table public.rh_autorizacoes enable row level security;
create policy rh_aut_rh on public.rh_autorizacoes for all to authenticated using (public.pode_ver_rh() or public.pode_autorizar_rh()) with check (public.pode_ver_rh() or public.pode_autorizar_rh());
revoke all on public.rh_autorizacoes from anon;

-- 6) comissões fechadas dos técnicos — Admin, aba RH ou permissão de comissões de técnicos (resposta do usuário em 12/10/2026)
alter table public.rh_comissoes_fechamento enable row level security;
create policy rh_comfech_rh on public.rh_comissoes_fechamento for all to authenticated using (public.pode_ver_comissoes()) with check (public.pode_ver_comissoes());
revoke all on public.rh_comissoes_fechamento from anon;

-- 7) WhatsApp (token da API e segredo do webhook; números conectados) — Admin e Gerente Comercial (na prática o perfil Comercial também: é o que o botão da tela já faz)
alter table public.crm_whatsapp_config enable row level security;
create policy wpp_config_gc on public.crm_whatsapp_config for all to authenticated using (public.eh_gerente_comercial()) with check (public.eh_gerente_comercial());
revoke all on public.crm_whatsapp_config from anon;
alter table public.crm_whatsapp_instancias enable row level security;
create policy wpp_inst_gc on public.crm_whatsapp_instancias for all to authenticated using (public.eh_gerente_comercial()) with check (public.eh_gerente_comercial());
revoke all on public.crm_whatsapp_instancias from anon;

-- 8) configuração do e-mail (senha SMTP) — ninguém pelo navegador: só as funções de servidor (chave de serviço) leem e gravam
drop policy if exists email_smtp_update_anon on public.configuracoes_email_smtp;
drop policy if exists email_smtp_write_anon on public.configuracoes_email_smtp;
revoke all on public.configuracoes_email_smtp from anon, authenticated;

-- 9) avisos de WhatsApp (quais estão ligados e para quem) — ler: todos (por ora, também a chave pública); gravar: só Admin
alter table public.notificacoes_config enable row level security;
create policy notif_config_le on public.notificacoes_config for select to anon, authenticated using (true);
create policy notif_config_admin on public.notificacoes_config for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
revoke insert, update, delete, truncate on public.notificacoes_config from anon;
drop policy if exists notif_resp_delete on public.notificacoes_responsaveis;
drop policy if exists notif_resp_insert on public.notificacoes_responsaveis;
drop policy if exists notif_resp_select on public.notificacoes_responsaveis;
drop policy if exists notif_resp_update on public.notificacoes_responsaveis;
create policy notif_resp_le on public.notificacoes_responsaveis for select to anon, authenticated using (true);
create policy notif_resp_admin on public.notificacoes_responsaveis for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
revoke insert, update, delete, truncate on public.notificacoes_responsaveis from anon;

-- 10) histórico de alterações — ler: todos (por ora, também a chave pública); incluir: quem está logado; alterar e apagar: ninguém (o histórico fica imutável)
alter table public.audit_log enable row level security;
create policy audit_le on public.audit_log for select to anon, authenticated using (true);
create policy audit_inclui on public.audit_log for insert to authenticated with check (public.esta_logado());
revoke insert, update, delete, truncate on public.audit_log from anon;
revoke update, delete, truncate on public.audit_log from authenticated;

-- 11) lixeira (cópia do que foi apagado: pode conter dado de qualquer tabela, inclusive do RH) — incluir: quem está logado; ler, restaurar e limpar: Admin e quem tem a aba Licitações (resposta do usuário em 12/10/2026)
alter table public.lixeira enable row level security;
create policy lixeira_inclui on public.lixeira for insert to authenticated with check (public.esta_logado());
create policy lixeira_le on public.lixeira for select to authenticated using (public.eh_admin() or public.tem_aba('licitacoes'));
create policy lixeira_altera on public.lixeira for update to authenticated using (public.eh_admin() or public.tem_aba('licitacoes')) with check (public.eh_admin() or public.tem_aba('licitacoes'));
create policy lixeira_apaga on public.lixeira for delete to authenticated using (public.eh_admin() or public.tem_aba('licitacoes'));
revoke all on public.lixeira from anon;
