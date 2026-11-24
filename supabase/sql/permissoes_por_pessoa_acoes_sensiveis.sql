-- Permissões por pessoa para ações sensíveis (pedido do usuário em 24/11/2026, etapa 5 da revisão de permissões).
-- Seis caixas novas no cadastro de usuário (Admin → Usuários). Todas SOMAM ao que já valia: quem já podia continua podendo; ninguém foi marcado por este script.
--   pode_excluir_op            → excluir OP (antes: só Admin e gerentes)                       [banco: op_excluir]
--   pode_alterar_numero_op     → alterar o nº da OP/PV já preenchido (antes: Admin, gerentes e equipe de Comercial/CRM/Licitações) [banco: renomear_opl]
--   pode_excluir_formacao      → excluir QUALQUER formação de preços (antes: Admin, gerentes; quem criou só a sua) [banco: formacao_excluir]
--   pode_copiar_op             → Copiar OP (só regra de tela; antes: poder de gerente)
--   pode_excluir_registros     → excluir registros em geral, hoje o cadastro de clientes (só tela; antes: só Admin)
--   pode_corrigir_data_nota    → corrigir a data de nota emitida no Fiscal (só tela; antes: qualquer pessoa com a aba Fiscal. Decidido com o usuário: passa a valer só
--                                para Admin, gerentes e quem tiver a caixa; Gustavo e Debora precisam ser marcados)
alter table public.auth_usuarios
  add column if not exists pode_excluir_op boolean not null default false,
  add column if not exists pode_alterar_numero_op boolean not null default false,
  add column if not exists pode_excluir_formacao boolean not null default false,
  add column if not exists pode_copiar_op boolean not null default false,
  add column if not exists pode_excluir_registros boolean not null default false,
  add column if not exists pode_corrigir_data_nota boolean not null default false;

-- As três funções do banco são alteradas por troca de trecho sobre a definição que está no ar (cada troca confere que o trecho existia), para não regravar o resto.
do $m$
declare d text; novo text;
begin
  -- op_excluir
  d := pg_get_functiondef('public.op_excluir(uuid,text,text)'::regprocedure);
  if d not like '%pode_excluir_op%' then
    novo := replace(d, 'select a.id, a.nome, a.email, a.perfil into u from', 'select a.id, a.nome, a.email, a.perfil, coalesce(a.pode_excluir_op, false) as pode_excluir_op into u from');
    if novo = d then raise exception 'op_excluir: trecho 1 não encontrado'; end if;
    d := novo;
    novo := replace(d, 'not (u.perfil = ''Admin'' or u.perfil ilike ''gerente%'')', 'not (u.perfil = ''Admin'' or u.perfil ilike ''gerente%'' or u.pode_excluir_op)');
    if novo = d then raise exception 'op_excluir: trecho 2 não encontrado'; end if;
    d := replace(novo, 'Só Admin e gerentes podem excluir uma OP.', 'Só Admin, gerentes e quem recebeu essa permissão podem excluir uma OP.');
    execute d;
  end if;

  -- formacao_excluir
  d := pg_get_functiondef('public.formacao_excluir(uuid,text,text,timestamp with time zone)'::regprocedure);
  if d not like '%pode_excluir_formacao%' then
    novo := replace(d, 'select a.id, a.nome, a.email, a.perfil into u from', 'select a.id, a.nome, a.email, a.perfil, coalesce(a.pode_excluir_formacao, false) as pode_excluir_formacao into u from');
    if novo = d then raise exception 'formacao_excluir: trecho 1 não encontrado'; end if;
    d := novo;
    novo := replace(d, 'eh_dir := (u.perfil = ''Admin'' or u.perfil ilike ''gerente%'');', 'eh_dir := (u.perfil = ''Admin'' or u.perfil ilike ''gerente%'' or u.pode_excluir_formacao);');
    if novo = d then raise exception 'formacao_excluir: trecho 2 não encontrado'; end if;
    d := replace(novo, 'Só Admin, gerentes ou quem criou a formação podem excluí-la.', 'Só Admin, gerentes, quem recebeu essa permissão ou quem criou a formação podem excluí-la.');
    execute d;
  end if;

  -- renomear_opl
  d := pg_get_functiondef('public.renomear_opl(uuid,text,text,boolean)'::regprocedure);
  if d not like '%pode_alterar_numero_op%' then
    novo := replace(d, 'v_perfil text; v_nome text;', 'v_perfil text; v_nome text; v_flag boolean;');
    if novo = d then raise exception 'renomear_opl: trecho 1 não encontrado'; end if;
    d := novo;
    novo := replace(d, 'select perfil, nome into v_perfil, v_nome', 'select perfil, nome, coalesce(pode_alterar_numero_op, false) into v_perfil, v_nome, v_flag');
    if novo = d then raise exception 'renomear_opl: trecho 2 não encontrado'; end if;
    d := novo;
    novo := replace(d, 'v_perfil in (''Comercial'', ''CRM'', ''Licitações''))', 'v_perfil in (''Comercial'', ''CRM'', ''Licitações'') or v_flag)');
    if novo = d then raise exception 'renomear_opl: trecho 3 não encontrado'; end if;
    d := replace(novo, 'as equipes de Comercial e Licitações podem alterar', 'as equipes de Comercial e Licitações e quem recebeu essa permissão podem alterar');
    execute d;
  end if;

  -- histórico de permissões: as seis caixas novas entram na lista de campos acompanhados
  d := pg_get_functiondef('public.auth_usuarios_registrar_permissoes()'::regprocedure);
  if d not like '%pode_excluir_op%' then
    novo := replace(d, '(''pode_enviar_avisos'', old.pode_enviar_avisos::text, new.pode_enviar_avisos::text)',
      '(''pode_enviar_avisos'', old.pode_enviar_avisos::text, new.pode_enviar_avisos::text),
      (''pode_excluir_op'', old.pode_excluir_op::text, new.pode_excluir_op::text),
      (''pode_alterar_numero_op'', old.pode_alterar_numero_op::text, new.pode_alterar_numero_op::text),
      (''pode_excluir_formacao'', old.pode_excluir_formacao::text, new.pode_excluir_formacao::text),
      (''pode_copiar_op'', old.pode_copiar_op::text, new.pode_copiar_op::text),
      (''pode_excluir_registros'', old.pode_excluir_registros::text, new.pode_excluir_registros::text),
      (''pode_corrigir_data_nota'', old.pode_corrigir_data_nota::text, new.pode_corrigir_data_nota::text)');
    if novo = d then raise exception 'historico: trecho não encontrado'; end if;
    execute novo;
  end if;
end $m$;
-- Reverter: restaurar as definições anteriores (as condições sem o "or <caixa>") e: alter table public.auth_usuarios drop column pode_excluir_op, drop column pode_alterar_numero_op, drop column pode_excluir_formacao, drop column pode_copiar_op, drop column pode_excluir_registros, drop column pode_corrigir_data_nota;
