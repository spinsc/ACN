-- Etapa 17b, onda 2 (22/10/2026) — fecha TUDO o que ainda aceitava a chave pública: as tabelas que sobraram, as visões, as funções, os arquivos, e faz tabela/função nova já nascer fechada.
--
-- Por que existe: a chave pública é a que o navegador usa e está no código publicado; até aqui ela lia, gravava e apagava em ~150 tabelas sem ninguém entrar no sistema (a onda 1a fechou só as 14 mais sensíveis).
-- Decidido com o usuário em 22/10/2026: "fechar tudo à chave pública agora". Esta onda NÃO separa por aba/perfil: quem entrou (crachá válido, pessoa ativa) continua fazendo o que fazia — só quem NÃO entrou perde o acesso.
-- A separação por aba (cada setor só enxerga o seu) é a etapa seguinte e depende de decisão do usuário setor a setor.
--
-- O que continua aberto à chave pública de propósito (os dois portais do cliente, public/portal.html e public/veiculo.html, não têm login):
--   configuracoes_sistema (só 5 chaves: nome, logo, WhatsApp, endereço e o PIN do portal), veiculos_nfc (só os ativos), servicos_executados_nfc (ler) e chamados_suporte (ler e abrir chamado).
--   Todo o resto de escrita nessas 4 tabelas, e tudo nas demais, fica fechado.
-- As funções de servidor (entrar, recuperar-senha, whatsapp-*, send-*) usam a chave de serviço e não passam por estas regras. Todas as 23 pessoas ativas já têm crachá (medido em 22/10/2026) e a trava EXIGIR_CRACHA está ligada desde 14/10.
-- Fotografia do estado anterior (políticas, grants, funções) fica em public.etapa17_estado_anterior (só Admin lê); para voltar atrás: etapa17_onda2_reverter.sql.

-- 0) onde guardar a fotografia do estado anterior
create table if not exists public.etapa17_estado_anterior (
  id bigserial primary key,
  onda text not null,
  tipo text not null,
  objeto text not null,
  detalhe jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.etapa17_estado_anterior enable row level security;
drop policy if exists etapa17_estado_so_admin on public.etapa17_estado_anterior;
create policy etapa17_estado_so_admin on public.etapa17_estado_anterior for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
revoke all on public.etapa17_estado_anterior from anon;

do $etapa17snap$
begin
  -- só tira a fotografia na primeira vez: rodar de novo depois de fechado não pode apagar o "antes" verdadeiro
  if exists (select 1 from public.etapa17_estado_anterior where onda = 'onda2') then return; end if;
  insert into public.etapa17_estado_anterior (onda, tipo, objeto, detalhe)
  select 'onda2', 'politica', p.schemaname || '.' || p.tablename || '.' || p.policyname,
    jsonb_build_object('esquema', p.schemaname, 'tabela', p.tablename, 'nome', p.policyname, 'permissiva', p.permissive, 'papeis', to_jsonb(p.roles), 'comando', p.cmd, 'usando', p.qual, 'com_check', p.with_check)
  from pg_policies p
  where p.schemaname = 'public' or (p.schemaname = 'storage' and p.tablename = 'objects');
  insert into public.etapa17_estado_anterior (onda, tipo, objeto, detalhe)
  select 'onda2', 'tabela', c.relname,
    jsonb_build_object('tipo', c.relkind, 'rls', c.relrowsecurity,
      'anon', coalesce((select jsonb_agg(a.privilege_type) from aclexplode(c.relacl) a where a.grantee = (select oid from pg_roles where rolname = 'anon')), '[]'::jsonb))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm');
  insert into public.etapa17_estado_anterior (onda, tipo, objeto, detalhe)
  select 'onda2', 'funcao', p.oid::regprocedure::text,
    jsonb_build_object('anon', has_function_privilege('anon', p.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p');
end $etapa17snap$;

-- 1) as tabelas: liga a proteção de linha, tira as regras abertas à chave pública e deixa uma só regra — "quem entrou no sistema faz o que fazia"
do $etapa17tab$
declare
  t record;
  p record;
  -- já têm regra própria (onda 1a) ou nunca foram abertas: só garante que a chave pública não tem nenhum direito
  proprias text[] := array[
    'admin_perfis_sistema', 'auth_credenciais', 'rh_autorizacoes', 'rh_comissoes_fechamento', 'rh_fechamentos', 'rh_funcionarios', 'rh_lancamentos',
    'rh_funcionarios_antes_quadro_20261014', 'crm_whatsapp_config', 'crm_whatsapp_instancias', 'configuracoes_email_smtp', 'garantia_contadores', 'lixeira', 'etapa17_estado_anterior'];
  -- vazias e sem nenhuma tela que as use (proteção ligada e nenhuma regra: ninguém entra, como já era); não ganham a regra geral para não "abrir" o que estava fechado
  sem_uso text[] := array['kiting_checklist', 'serralheria_demandas', 'serralheria_trabalhos', 'expedicao_envios', 'kpis_setores', 'chicotes_fabricacao', 'pcp_pedidos_chicotes', 'sac_os_sequence'];
  -- leitura que a onda 1a deixou aberta à chave pública "por ora": agora só quem entrou lê
  so_leitura text[] := array['auth_usuarios', 'audit_log', 'notificacoes_config', 'notificacoes_responsaveis'];
  portais text[] := array['configuracoes_sistema', 'veiculos_nfc', 'servicos_executados_nfc', 'chamados_suporte'];
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname <> all (proprias) and c.relname <> all (sem_uso) and c.relname <> all (so_leitura) and c.relname <> all (portais)
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.relname and roles && array['public', 'anon']::name[] loop
      execute format('drop policy %I on public.%I', p.policyname, t.relname);
    end loop;
    execute format('drop policy if exists etapa17_logado on public.%I', t.relname);
    execute format('create policy etapa17_logado on public.%I for all to authenticated using (public.esta_logado()) with check (public.esta_logado())', t.relname);
    execute format('revoke all on public.%I from anon', t.relname);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
  end loop;

  -- as quatro de leitura: a regra de gravação da onda 1a fica; só a leitura passa a exigir crachá
  drop policy if exists auth_usuarios_le on public.auth_usuarios;
  create policy auth_usuarios_le on public.auth_usuarios for select to authenticated using (public.esta_logado());
  drop policy if exists audit_le on public.audit_log;
  create policy audit_le on public.audit_log for select to authenticated using (public.esta_logado());
  drop policy if exists notif_config_le on public.notificacoes_config;
  create policy notif_config_le on public.notificacoes_config for select to authenticated using (public.esta_logado());
  drop policy if exists notif_resp_le on public.notificacoes_responsaveis;
  create policy notif_resp_le on public.notificacoes_responsaveis for select to authenticated using (public.esta_logado());

  -- os portais do cliente (sem login): a chave pública só LÊ o que a página mostra e só INSERE o chamado
  for t in select unnest(portais) as relname loop
    execute format('alter table public.%I enable row level security', t.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.relname and roles && array['public', 'anon']::name[] loop
      execute format('drop policy %I on public.%I', p.policyname, t.relname);
    end loop;
    execute format('drop policy if exists etapa17_logado on public.%I', t.relname);
    execute format('create policy etapa17_logado on public.%I for all to authenticated using (public.esta_logado()) with check (public.esta_logado())', t.relname);
    execute format('revoke all on public.%I from anon', t.relname);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
  end loop;

  -- tudo o que sobrou: a chave pública sem nenhum direito
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and (c.relname = any (proprias) or c.relname = any (sem_uso) or c.relname = any (so_leitura))
  loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $etapa17tab$;

drop policy if exists portal_le_config on public.configuracoes_sistema;
create policy portal_le_config on public.configuracoes_sistema for select to anon using (chave in ('nfc_nome_empresa', 'nfc_logo_url', 'nfc_whatsapp_numero', 'nfc_endereco_maps', 'nfc_pin_global'));
drop policy if exists portal_le_veiculos on public.veiculos_nfc;
create policy portal_le_veiculos on public.veiculos_nfc for select to anon using (ativo is true);
drop policy if exists portal_le_servicos on public.servicos_executados_nfc;
create policy portal_le_servicos on public.servicos_executados_nfc for select to anon using (true);
drop policy if exists portal_le_chamados on public.chamados_suporte;
create policy portal_le_chamados on public.chamados_suporte for select to anon using (true);
drop policy if exists portal_abre_chamado on public.chamados_suporte;
create policy portal_abre_chamado on public.chamados_suporte for insert to anon with check (veiculo_id is not null);
grant select on public.configuracoes_sistema, public.veiculos_nfc, public.servicos_executados_nfc, public.chamados_suporte to anon;
grant insert on public.chamados_suporte to anon;

-- 2) as visões rodam com o poder do dono (passariam por cima das regras das tabelas): a chave pública não lê nenhuma
do $etapa17vis$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') loop
    execute format('revoke all on public.%I from anon', v.relname);
  end loop;
end $etapa17vis$;

-- 3) sequências (números automáticos): a chave pública não consome nenhuma
revoke all on all sequences in schema public from anon;

-- 4) funções: a chave pública não chama nenhuma (os portais não usam). Funções de gatilho ficam como estão (gatilho não depende de quem chama).
--    auth_login só a função de servidor `entrar` chama (chave de serviço); a tela não a usa mais como reserva.
do $etapa17fun$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p') and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $etapa17fun$;
revoke execute on function public.auth_login(text, text) from authenticated;

-- 5) arquivos (bucket acn-media): enviar, trocar e listar só quem entrou. O endereço direto de um arquivo já enviado continua abrindo (o bucket segue público; torná-lo privado exige trocar todos os endereços guardados por endereços assinados — fica para decisão à parte).
drop policy if exists "acn-media public insert" on storage.objects;
drop policy if exists "acn-media public update" on storage.objects;
drop policy if exists "acn-media public read" on storage.objects;
drop policy if exists "acn-media logado insert" on storage.objects;
drop policy if exists "acn-media logado update" on storage.objects;
drop policy if exists "acn-media logado read" on storage.objects;
create policy "acn-media logado insert" on storage.objects for insert to authenticated with check (bucket_id = 'acn-media' and public.esta_logado());
create policy "acn-media logado update" on storage.objects for update to authenticated using (bucket_id = 'acn-media' and public.esta_logado());
create policy "acn-media logado read" on storage.objects for select to authenticated using (bucket_id = 'acn-media' and public.esta_logado());

-- 6) o que nascer daqui para frente já nasce fechado à chave pública (tabela, sequência e função novas); a regra de quem entrou é escrita junto da tabela nova
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
