-- CORREÇÃO (25/11/2026), bug reportado pelo usuário: ao SALVAR um usuário no Admin (Permissões extras e outras) aparecia
-- "Não foi possível salvar: Este registro está ligado a outro que não existe mais (ou que ainda depende dele). Confira o vínculo."
--
-- Causa: o gatilho `auth_usuarios_registrar_permissoes` (histórico de permissões, 24/11/2026) gravava em `audit_log.user_id` o `auth.uid()` (o código da sessão do banco),
-- mas a chave `audit_log_user_id_fkey` exige o `id` da tabela `auth_usuarios`, que NÃO é o mesmo código (nenhum dos 32 usuários tem `id = auth_id`; 6 nem têm `auth_id`).
-- Toda mudança de permissão feita por uma pessoa logada era recusada, e como o gatilho roda na mesma gravação, o salvamento inteiro do usuário voltava com erro
-- (nada era gravado, nem a mudança, nem o histórico). Os 15 registros que já existem em `audit_log` do módulo "usuarios" têm `user_id` nulo: vieram de gravações sem sessão.
--
-- Correção: o autor passa a ser o `id` do usuário em `auth_usuarios` (achado pelo `auth_id` real da sessão; nulo se a sessão não é de nenhum usuário, como já era).
-- O resto da função é idêntico ao que estava no banco. Nenhum dado é mexido. Reverter: não precisa (a versão antiga é a que falha); se for preciso voltar, `usuarios_historico_de_permissoes.sql`.
create or replace function public.auth_usuarios_registrar_permissoes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_real uuid := auth.uid();
  v_ator uuid;          -- o id de quem mexeu em auth_usuarios (é o que audit_log.user_id referencia), e NÃO o auth.uid()
  v_nome text;
  v_efetivo uuid := public.uid_efetivo();
  v_como text;
  v_autor text;
  v_campo record;
  v_antes text; v_depois text;
  v_add text; v_rem text;
  v_todas constant text := 'todas as telas';
begin
  select u.id, u.nome into v_ator, v_nome from public.auth_usuarios u where u.auth_id = v_real limit 1;
  v_autor := coalesce(v_nome, 'Sistema (banco)');
  if v_efetivo is distinct from v_real then
    select u.nome into v_como from public.auth_usuarios u where u.auth_id = v_efetivo limit 1;
    v_autor := v_autor || ' (vendo como ' || coalesce(v_como, '?') || ')';
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_log (user_id, user_nome, module, entity_type, entity_id, change_type, metadata)
    values (v_ator, v_autor, 'usuarios', 'auth_usuarios', new.id::text, 'CREATE', jsonb_build_object('nome', new.nome, 'perfil', new.perfil));
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, user_nome, module, entity_type, entity_id, change_type, metadata)
    values (v_ator, v_autor, 'usuarios', 'auth_usuarios', old.id::text, 'DELETE', jsonb_build_object('nome', old.nome, 'perfil', old.perfil));
    return old;
  end if;
  for v_campo in
    select * from (values
      ('perfil', old.perfil::text, new.perfil::text),
      ('ativo', old.ativo::text, new.ativo::text),
      ('pode_autorizar_rh', old.pode_autorizar_rh::text, new.pode_autorizar_rh::text),
      ('pode_aprovar_compra', old.pode_aprovar_compra::text, new.pode_aprovar_compra::text),
      ('ve_todas_tarefas_financeiro', old.ve_todas_tarefas_financeiro::text, new.ve_todas_tarefas_financeiro::text),
      ('pode_deletar_anexos', old.pode_deletar_anexos::text, new.pode_deletar_anexos::text),
      ('recebe_alerta_analise', old.recebe_alerta_analise::text, new.recebe_alerta_analise::text),
      ('pode_postar_inicio', old.pode_postar_inicio::text, new.pode_postar_inicio::text),
      ('pode_gerir_terceiros', old.pode_gerir_terceiros::text, new.pode_gerir_terceiros::text),
      ('ver_valores', old.ver_valores::text, new.ver_valores::text),
      ('eh_dev', old.eh_dev::text, new.eh_dev::text),
      ('pode_excluir_op', old.pode_excluir_op::text, new.pode_excluir_op::text),
      ('pode_alterar_numero_op', old.pode_alterar_numero_op::text, new.pode_alterar_numero_op::text),
      ('pode_excluir_formacao', old.pode_excluir_formacao::text, new.pode_excluir_formacao::text),
      ('pode_copiar_op', old.pode_copiar_op::text, new.pode_copiar_op::text),
      ('pode_excluir_registros', old.pode_excluir_registros::text, new.pode_excluir_registros::text),
      ('pode_corrigir_data_nota', old.pode_corrigir_data_nota::text, new.pode_corrigir_data_nota::text)
    ) t(campo, antes, depois)
  loop
    if v_campo.antes is distinct from v_campo.depois then
      v_antes := case v_campo.antes when 'true' then 'Sim' when 'false' then 'Não' else coalesce(v_campo.antes, '—') end;
      v_depois := case v_campo.depois when 'true' then 'Sim' when 'false' then 'Não' else coalesce(v_campo.depois, '—') end;
      insert into public.audit_log (user_id, user_nome, module, entity_type, entity_id, change_type, field_name, old_value, new_value)
      values (v_ator, v_autor, 'usuarios', 'auth_usuarios', new.id::text, 'UPDATE', v_campo.campo, v_antes, v_depois);
    end if;
  end loop;
  for v_campo in
    select * from (values
      ('abas_permitidas', to_jsonb(old.abas_permitidas), to_jsonb(new.abas_permitidas)),
      ('permissoes_crm', to_jsonb(old.permissoes_crm), to_jsonb(new.permissoes_crm)),
      ('permissoes_rh', to_jsonb(old.permissoes_rh), to_jsonb(new.permissoes_rh))
    ) t(campo, antes, depois)
  loop
    if v_campo.antes is distinct from v_campo.depois then
      select string_agg(x, ', ' order by x) into v_add from (select jsonb_array_elements_text(coalesce(v_campo.depois, '[]'::jsonb)) x except select jsonb_array_elements_text(coalesce(v_campo.antes, '[]'::jsonb))) q;
      select string_agg(x, ', ' order by x) into v_rem from (select jsonb_array_elements_text(coalesce(v_campo.antes, '[]'::jsonb)) x except select jsonb_array_elements_text(coalesce(v_campo.depois, '[]'::jsonb))) q;
      insert into public.audit_log (user_id, user_nome, module, entity_type, entity_id, change_type, field_name, old_value, new_value)
      values (v_ator, v_autor, 'usuarios', 'auth_usuarios', new.id::text, 'UPDATE', v_campo.campo,
        case when v_campo.campo = 'abas_permitidas' and jsonb_array_length(coalesce(v_campo.antes, '[]'::jsonb)) = 0 then v_todas else jsonb_array_length(coalesce(v_campo.antes, '[]'::jsonb))::text || ' item(ns)' end,
        concat_ws(' · ',
          case when v_campo.campo = 'abas_permitidas' and jsonb_array_length(coalesce(v_campo.depois, '[]'::jsonb)) = 0 then v_todas else jsonb_array_length(coalesce(v_campo.depois, '[]'::jsonb))::text || ' item(ns)' end,
          case when v_add is not null then 'liberou: ' || v_add end,
          case when v_rem is not null then 'tirou: ' || v_rem end));
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.auth_usuarios_registrar_permissoes() from public, anon, authenticated;
