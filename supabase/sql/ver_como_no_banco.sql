-- "Ver como" de verdade no banco (pedido do usuário em 12/11/2026, depois de o Calendário aparecer igual para todo mundo).
--
-- O problema: o "Ver como" do Admin trocava só o usuário guardado no navegador; o crachá do banco continuava o do Admin,
-- então toda regra que o banco aplica pela pessoa (abas, perfil, nome, RH, tela Início, Calendário, funções de gravação) enxergava o Admin.
-- A tela mostrava MAIS do que a pessoa vista veria de verdade, e algumas funções gravavam com o nome do Admin.
--
-- A solução: o banco passa a saber, POR SESSÃO (o `session_id` do crachá), quem o Admin está vendo.
--   * `ver_como_sessoes` guarda "esta sessão do Admin está vendo a pessoa X até tal hora" (12 horas, renovada a cada abertura do sistema);
--   * `uid_efetivo()` devolve a pessoa vista quando a sessão é de um Admin de verdade e a linha ainda vale; senão, devolve `auth.uid()`;
--   * todas as funções de identidade (`eh_admin`, `tem_aba`, `perfil_atual`, `nome_do_usuario_atual`, `usuario_atual_id`, RH, Início...) usam `uid_efetivo()`
--     no lugar de `auth.uid()` — as políticas das tabelas e as visões que já as chamavam passam a enxergar a pessoa vista sem mudar uma linha.
-- Só um Admin real liga (a conferência usa o `auth.uid()` verdadeiro) e a linha só vale enquanto o chamador continuar sendo esse Admin ativo.
-- Quem não é Admin nunca é afetado: a função cai em `auth.uid()`. Nada é gravado em tabela de negócio.
-- Para desfazer tudo: `ver_como_no_banco_reverter.sql`.

create table if not exists public.ver_como_sessoes (
  session_id text primary key,
  admin_auth_id uuid not null,
  como_auth_id uuid not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
alter table public.ver_como_sessoes enable row level security;
-- sem política de propósito: ninguém lê nem grava a tabela direto; só as funções abaixo (security definer)
revoke all on public.ver_como_sessoes from public, anon, authenticated;

create or replace function public.uid_efetivo() returns uuid
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select v.como_auth_id
       from public.ver_como_sessoes v
      where v.session_id = nullif(auth.jwt() ->> 'session_id', '')
        and v.admin_auth_id = auth.uid()
        and v.expira_em > now()
        and exists (select 1 from public.auth_usuarios a
                     where a.auth_id = auth.uid() and a.perfil = 'Admin' and coalesce(a.ativo, false))),
    auth.uid());
$$;
revoke all on function public.uid_efetivo() from public, anon, authenticated;

create or replace function public.ver_como_iniciar(p_email text) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_sessao text := nullif(auth.jwt() ->> 'session_id', ''); v_alvo record;
begin
  if auth.uid() is null or v_sessao is null then raise exception 'Sem sessão do banco: entre de novo no sistema.' using errcode = '42501'; end if;
  if not exists (select 1 from public.auth_usuarios a where a.auth_id = auth.uid() and a.perfil = 'Admin' and coalesce(a.ativo, false)) then
    raise exception 'Só o Admin pode ver o sistema como outra pessoa.' using errcode = '42501';
  end if;
  select a.id, a.nome, a.auth_id into v_alvo
    from public.auth_usuarios a
   where lower(trim(a.email)) = lower(trim(coalesce(p_email, ''))) and coalesce(a.ativo, false) and a.auth_id is not null limit 1;
  if not found then raise exception 'Usuário não encontrado ou inativo.'; end if;
  delete from public.ver_como_sessoes where expira_em < now();
  insert into public.ver_como_sessoes (session_id, admin_auth_id, como_auth_id, expira_em)
  values (v_sessao, auth.uid(), v_alvo.auth_id, now() + interval '12 hours')
  on conflict (session_id) do update set admin_auth_id = excluded.admin_auth_id, como_auth_id = excluded.como_auth_id,
                                         criado_em = now(), expira_em = excluded.expira_em;
  return jsonb_build_object('nome', v_alvo.nome);
end $$;
revoke all on function public.ver_como_iniciar(text) from public, anon;
grant execute on function public.ver_como_iniciar(text) to authenticated;

create or replace function public.ver_como_encerrar() returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.ver_como_sessoes
   where session_id = nullif(auth.jwt() ->> 'session_id', '') and admin_auth_id = auth.uid();
end $$;
revoke all on function public.ver_como_encerrar() from public, anon;
grant execute on function public.ver_como_encerrar() to authenticated;

-- As funções de identidade, agora pela pessoa efetiva (mesmo corpo de antes; só `auth.uid()` virou `public.uid_efetivo()`)
create or replace function public.eh_admin() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.eh_gerente_comercial() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or translate(lower(btrim(coalesce(u.perfil, ''))), 'áàâãäéèêíìîóòôõöúùûç', 'aaaaaeeeiiiooooouuuc') in ('gerente comercial', 'comercial', 'crm')
                   from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.nome_do_usuario_atual() returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.nome from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1;
$$;
create or replace function public.perfil_atual() returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.perfil from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1;
$$;
create or replace function public.pode_autorizar_rh() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_autorizar_rh, false) from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.pode_postar_inicio() returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or coalesce(u.pode_postar_inicio, false)
                   from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_aba(p_aba text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ? p_aba
                   from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_alguma_aba(p_abas text[]) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ?| p_abas
                   from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.tem_permissao_rh(p_permissao text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select p_permissao = any(coalesce(u.permissoes_rh, '{}'::text[])) from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false);
$$;
create or replace function public.usuario_atual_id() returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.id from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1;
$$;

-- Calendário: a pessoa efetiva decide o que se vê (o `p_como` antigo segue valendo como reserva, só para Admin de verdade)
create or replace function public.calendario_eventos(p_inicio date, p_fim date, p_todos boolean default false, p_como text default null)
returns table(fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[], aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text; v_nome text; v_perfil text; v_gerente boolean;
begin
  select lower(trim(a.email)), lower(trim(a.nome)), a.perfil
    into v_email, v_nome, v_perfil
    from auth_usuarios a where a.auth_id = public.uid_efetivo() and coalesce(a.ativo, false) limit 1;
  if v_perfil is null and v_email is null then return; end if;
  -- "Ver como": só o Admin pode pedir o calendário de outra pessoa (ativa); qualquer outro chamador ignora p_como
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

-- Excluir OP: a permissão vale pela pessoa efetiva; o AUTOR que fica gravado é quem realmente fez (o Admin), dizendo quem ele estava vendo
create or replace function public.op_excluir(p_id uuid, p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  u record; o record; c jsonb; v_autor text; v_real text;
begin
  select a.id, a.nome, a.email, a.perfil into u from public.auth_usuarios a where a.auth_id = public.uid_efetivo() and coalesce(a.ativo, false) limit 1;
  if not found or not (u.perfil = 'Admin' or u.perfil ilike 'gerente%') then
    raise exception 'Só Admin e gerentes podem excluir uma OP.' using errcode = '42501';
  end if;
  v_autor := u.nome;
  if auth.uid() is distinct from public.uid_efetivo() then
    select a.nome into v_real from public.auth_usuarios a where a.auth_id = auth.uid() limit 1;
    v_autor := coalesce(v_real, 'Admin') || ' (vendo como ' || u.nome || ')';
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

  update public.estoque_reservas set situacao = 'liberada', encerrada_em = now(), encerrada_por = v_autor,
         motivo_encerramento = 'OP ' || o.opl || ' excluída: ' || btrim(p_motivo)
   where opl_id = p_id and situacao = 'reservada';
  update public.demandas_setoriais set status = 'Cancelada', updated_at = now(),
         observacoes_execucao = concat_ws(E'\n', nullif(observacoes_execucao, ''), 'Cancelada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': a OP ' || o.opl || ' foi excluída por ' || v_autor || ' — ' || btrim(p_motivo))
   where (opl_id = p_id or (opl_id is null and numero_opl = o.opl)) and status in ('Pendente', 'Em Andamento');
  update public.pcp_fretes set status = 'Cancelado',
         observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Cancelado: OP ' || o.opl || ' excluída — ' || btrim(p_motivo))
   where vinculo_id = p_id and status = 'Cotação';

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, usuario_email, data_hora)
  values (p_id, o.opl, u.perfil, 'OP EXCLUÍDA por ' || v_autor || '. Motivo: ' || btrim(p_motivo), o.status_geral, 'Cancelado', v_autor, u.email, now());

  update public.oples set excluida_em = now(), excluida_por = v_autor, excluida_motivo = btrim(p_motivo),
         excluida_status_anterior = o.status_geral, status_geral = 'Cancelado',
         excluida_desligado = jsonb_build_object('desligados', c->'desligados', 'avisos', c->'avisos')
   where id = p_id;
  return c;
end $$;
