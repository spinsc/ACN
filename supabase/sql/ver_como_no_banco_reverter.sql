-- Desfaz `ver_como_no_banco.sql` (12/11/2026): as funções de identidade voltam a olhar o `auth.uid()` do crachá, e a tabela e as funções do "Ver como" saem.
-- Estado de antes copiado do banco no dia 12/11/2026. Ordem importa: primeiro as funções voltam, depois as peças novas são apagadas.

create or replace function public.eh_admin() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.eh_gerente_comercial() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or translate(lower(btrim(coalesce(u.perfil, ''))), 'áàâãäéèêíìîóòôõöúùûç', 'aaaaaeeeiiiooooouuuc') in ('gerente comercial', 'comercial', 'crm')
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.nome_do_usuario_atual() returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.nome from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1;
$$;
create or replace function public.perfil_atual() returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.perfil from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1;
$$;
create or replace function public.pode_autorizar_rh() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_autorizar_rh, false) from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.pode_postar_inicio() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_postar_inicio, false)
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_aba(p_aba text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ? p_aba
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_alguma_aba(p_abas text[]) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ?| p_abas
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_permissao_rh(p_permissao text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select p_permissao = any(coalesce(u.permissoes_rh, '{}'::text[])) from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.usuario_atual_id() returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.id from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1;
$$;

create or replace function public.calendario_eventos(p_inicio date, p_fim date, p_todos boolean default false, p_como text default null)
returns table(fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[], aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text; v_nome text; v_perfil text; v_gerente boolean;
begin
  select lower(trim(a.email)), lower(trim(a.nome)), a.perfil
    into v_email, v_nome, v_perfil
    from auth_usuarios a where a.auth_id = auth.uid() and coalesce(a.ativo, false) limit 1;
  if v_perfil is null and v_email is null then return; end if;
  if p_como is not null and trim(p_como) <> '' and v_perfil = 'Admin' then
    select lower(trim(a.email)), lower(trim(a.nome)), a.perfil
      into v_email, v_nome, v_perfil
      from auth_usuarios a where lower(trim(a.email)) = lower(trim(p_como)) and coalesce(a.ativo, false) limit 1;
    if v_perfil is null and v_email is null then return; end if;
  end if;
  v_gerente := coalesce(v_perfil, '') = 'Admin' or coalesce(v_perfil, '') ilike 'gerente%';
  return query
    select b.* from calendario_eventos_base(p_inicio, p_fim) b
     where (p_todos and v_gerente) or v_email = any (b.emails) or v_nome = any (b.nomes) or v_perfil = any (b.perfis);
end;
$$;

create or replace function public.op_excluir(p_id uuid, p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  u record; o record; c jsonb;
begin
  select a.id, a.nome, a.email, a.perfil into u from public.auth_usuarios a where a.auth_id = auth.uid() and coalesce(a.ativo, false) limit 1;
  if not found or not (u.perfil = 'Admin' or u.perfil ilike 'gerente%') then
    raise exception 'Só Admin e gerentes podem excluir uma OP.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da exclusão (pelo menos 5 letras).'; end if;

  select * into o from public.oples where id = p_id for update;
  if not found then raise exception 'OP não encontrada (pode já ter sido excluída). Atualize a tela.'; end if;
  if o.status_geral is distinct from p_status_esperado then
    raise exception 'A OP mudou de etapa enquanto a janela estava aberta (agora: %). Atualize a tela e confira antes de excluir.', o.status_geral;
  end if;

  c := public.op_excluir_conferir(p_id);
  if jsonb_array_length(c->'bloqueios') > 0 then
    raise exception 'Esta OP não pode ser excluída: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(c->'bloqueios') x);
  end if;

  update public.estoque_reservas set situacao = 'liberada', encerrada_em = now(), encerrada_por = u.nome,
         motivo_encerramento = 'OP ' || o.opl || ' excluída: ' || btrim(p_motivo)
   where opl_id = p_id and situacao = 'reservada';
  update public.demandas_setoriais set status = 'Cancelada', updated_at = now(),
         observacoes_execucao = concat_ws(E'\n', nullif(observacoes_execucao, ''), 'Cancelada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': a OP ' || o.opl || ' foi excluída por ' || u.nome || ' — ' || btrim(p_motivo))
   where (opl_id = p_id or (opl_id is null and numero_opl = o.opl)) and status in ('Pendente', 'Em Andamento');
  update public.pcp_fretes set status = 'Cancelado',
         observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Cancelado: OP ' || o.opl || ' excluída — ' || btrim(p_motivo))
   where vinculo_id = p_id and status = 'Cotação';

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, usuario_email, data_hora)
  values (p_id, o.opl, u.perfil, 'OP EXCLUÍDA por ' || u.nome || '. Motivo: ' || btrim(p_motivo), o.status_geral, 'Cancelado', u.nome, u.email, now());

  update public.oples set excluida_em = now(), excluida_por = u.nome, excluida_motivo = btrim(p_motivo),
         excluida_status_anterior = o.status_geral, status_geral = 'Cancelado',
         excluida_desligado = jsonb_build_object('desligados', c->'desligados', 'avisos', c->'avisos')
   where id = p_id;
  return c;
end $$;

drop function if exists public.ver_como_iniciar(text);
drop function if exists public.ver_como_encerrar();
drop function if exists public.uid_efetivo();
drop table if exists public.ver_como_sessoes;
