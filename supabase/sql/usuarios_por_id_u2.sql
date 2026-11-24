-- Plano "toda pessoa por ID" (PLANO_USUARIOS_POR_ID.md), etapa U2 — pedido do usuario em 24/11/2026.
-- Depois que o usuario renomeou Tatiana e Thiago no Admin, o que estava gravado pelo NOME deixou de casar. Esta migracao acrescenta, ao lado de cada
-- coluna que guarda uma pessoa em texto, um campo com o ID da pessoa, e faz o BANCO manter os dois em dia:
--   * ID da pessoa = o ID do usuario (auth_usuarios.id); quem tem ficha no RH e nao tem usuario usa o ID da ficha (rh_funcionarios.id); quando a
--     ficha ganhar usuario (usuario_id), o ID da ficha e trocado pelo do usuario (pessoa_unificar). Sistema/automacao ("importacao_erp", "Claude — ...")
--     NAO e pessoa: fica so o texto, sem ID (decisao do usuario).
--   * Quem grava so o nome (todas as telas de hoje) tem o ID achado sozinho; quem grava o ID tem o nome preenchido com o nome ATUAL.
--   * Renomear um usuario (auth_usuarios.nome) leva o novo nome a todas as colunas da pessoa PELO ID, historicos inclusive (decisao do usuario).
-- Nada que as telas gravam hoje muda de jeito: as colunas novas sao opcionais. Gatilhos de usuario das tabelas ficam desligados so durante o
-- preenchimento e a troca de nomes (como nas trocas de 11/11 e 24/11), para a troca nao contar como "movimentacao" nem disparar calculos.
-- Desfazer: usuarios_por_id_u2_reverter.sql.
-- MUDANCA (24/11/2026, depois do ensaio que travou o sistema): a parte pesada NAO roda mais num bloco so. Este arquivo cria as funcoes e a base (rapido);
-- cada tabela e aplicada depois, em lotes pequenos, por pessoa_aplicar_lote(array[...]) com trava curta (ver o comando /usuarios-por-id).

-- trava curta: se auth_usuarios ou rh_funcionarios estiverem ocupadas, a migracao desiste em vez de segurar o sistema
set local lock_timeout = '5s';

-- 1) funcoes de base ------------------------------------------------------------------------------------------------------------------------------
create or replace function public.pessoa_chave(p text) returns text language sql immutable as
$$ select regexp_replace(lower(btrim(coalesce(p,''))), '\s+', ' ', 'g') $$;

create table if not exists public.usuarios_nomes_antigos (
  chave text primary key,            -- nome sem caixa nem espaco repetido, ou e-mail em minuscula
  pessoa_id uuid not null,           -- ID de usuario ou de ficha do RH (pessoa_canonica leva ao ID de verdade)
  origem text not null               -- usuario | email | rh | par
);
comment on table public.usuarios_nomes_antigos is 'Apelidos de cada pessoa (nomes de agora e de antes, e e-mails) para o banco achar o ID a partir de um texto. Nome antigo nunca sai daqui: e assim que o historico escrito com o nome de antes continua casando.';
alter table public.usuarios_nomes_antigos enable row level security;
create policy etapa17_logado on public.usuarios_nomes_antigos for select to authenticated using ((select public.esta_logado()));

create table if not exists public.pessoa_colunas (
  tabela text not null,
  coluna text not null,
  id_coluna text not null,
  tipo text not null check (tipo in ('nome','fixo')),   -- nome = o texto e um nome e acompanha renomeacao; fixo = e-mail ou ID, nunca reescrito
  primary key (tabela, coluna)
);
comment on table public.pessoa_colunas is 'Registro das colunas que guardam uma pessoa e do campo de ID de cada uma. Quem cria coluna de pessoa nova deve registrar aqui (e criar o gatilho pessoa_sincronizar_ids).';
alter table public.pessoa_colunas enable row level security;
create policy etapa17_logado on public.pessoa_colunas for select to authenticated using ((select public.esta_logado()));

-- ficha do RH SEM usuario_id preenchido, mas com o mesmo nome ou e-mail de um usuario, vale como a mesma pessoa (so 9 das 61 fichas tem usuario_id; a unificacao
-- de nomes de 11/11 deixou nome do usuario = nome da ficha). O vinculo oficial continua sendo rh_funcionarios.usuario_id e nenhum dado do RH e gravado aqui.
create or replace function public.pessoa_canonica(p_id uuid) returns uuid language sql stable security definer set search_path = public as
$$ select case when p_id is null then null
       else coalesce((select u.id from public.auth_usuarios u where u.id = p_id),
                     (select coalesce(f.usuario_id,
                                      (select u.id from public.auth_usuarios u
                                        where public.pessoa_chave(u.nome) = public.pessoa_chave(f.nome)
                                           or (btrim(coalesce(f.nome_completo, '')) <> '' and public.pessoa_chave(u.nome) = public.pessoa_chave(f.nome_completo))
                                           or (btrim(coalesce(f.email, '')) <> '' and lower(btrim(u.email)) = lower(btrim(f.email)))
                                        order by u.ativo desc, u.id limit 1),
                                      f.id)
                        from public.rh_funcionarios f where f.id = p_id)) end $$;

create or replace function public.pessoa_nome(p_id uuid) returns text language sql stable security definer set search_path = public as
$$ select case when p_id is null then null
       else coalesce((select u.nome from public.auth_usuarios u where u.id = public.pessoa_canonica(p_id)),
                     (select f.nome from public.rh_funcionarios f where f.id = p_id)) end $$;

create or replace function public.pessoa_id_por_texto(p text) returns uuid language plpgsql stable security definer set search_path = public as
$$
declare k text; a uuid;
begin
  if p is null or btrim(p) = '' then return null; end if;
  k := btrim(p);
  if k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return public.pessoa_canonica(k::uuid); end if;
  select pessoa_id into a from public.usuarios_nomes_antigos where chave = public.pessoa_chave(k);
  if a is null then return null; end if;
  return public.pessoa_canonica(a);
end $$;

-- regra do gatilho: o texto escrito manda; se o texto nao e de ninguem (sistema, anotacao) o ID fica vazio; so o ID mudou = o ID manda e o nome vira o atual
create or replace function public.pessoa_sincronizar(p_ins boolean, p_old_txt text, p_new_txt text, p_old_id uuid, p_new_id uuid, p_kind text)
returns table(txt text, pid uuid) language plpgsql stable security definer set search_path = public as
$$
declare r uuid; c uuid;
begin
  txt := p_new_txt; pid := p_new_id;
  if not p_ins and p_new_txt is not distinct from p_old_txt and p_new_id is not distinct from p_old_id then return next; return; end if;
  if not p_ins and p_new_txt is not distinct from p_old_txt then
    -- so o ID mudou: o ID manda
    c := public.pessoa_canonica(p_new_id);
    if c is not null then
      pid := c;
      if p_kind = 'nome' and p_new_txt is not null then txt := public.pessoa_nome(c); end if;
    else
      pid := public.pessoa_id_por_texto(p_new_txt);
    end if;
    return next; return;
  end if;
  if p_new_txt is not null and btrim(p_new_txt) <> '' then
    r := public.pessoa_id_por_texto(p_new_txt);
    if r is not null then pid := r;
    elsif p_new_id is not null and (p_ins or p_new_id is distinct from p_old_id) and public.pessoa_canonica(p_new_id) is not null then pid := public.pessoa_canonica(p_new_id);
    else pid := null; end if;
  else
    c := public.pessoa_canonica(p_new_id);
    if c is not null then
      pid := c;
      if p_kind = 'nome' then txt := public.pessoa_nome(c); end if;
    else
      pid := null;
    end if;
  end if;
  return next;
end $$;

-- 2) acompanhar nome e ligacao com o RH --------------------------------------------------------------------------------------------------------
create or replace function public.pessoa_propagar_nome(p_pid uuid) returns integer language plpgsql security definer set search_path = public as
$$
declare novo text; r record; ex boolean; n integer; total integer := 0; tabs text[] := '{}'; t text;
begin
  novo := public.pessoa_nome(p_pid);
  if novo is null or btrim(novo) = '' then return 0; end if;
  for r in select * from public.pessoa_colunas where tipo = 'nome' loop
    execute format('select exists (select 1 from public.%I where %I = $1 and %I is distinct from $2 and coalesce(%I::text, '''') not like ''%%@%%'')', r.tabela, r.id_coluna, r.coluna, r.coluna) into ex using p_pid, novo;
    if ex and not (r.tabela = any (tabs)) then tabs := tabs || r.tabela; end if;
  end loop;
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  begin
    for r in select * from public.pessoa_colunas where tipo = 'nome' and tabela = any (tabs) loop
      execute format('update public.%I set %I = $2 where %I = $1 and %I is distinct from $2 and coalesce(%I::text, '''') not like ''%%@%%''', r.tabela, r.coluna, r.id_coluna, r.coluna, r.coluna) using p_pid, novo;
      get diagnostics n = row_count; total := total + n;
    end loop;
  exception when others then
    foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
    raise;
  end;
  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  return total;
end $$;

create or replace function public.pessoa_unificar(p_ficha uuid, p_usuario uuid) returns integer language plpgsql security definer set search_path = public as
$$
declare r record; ex boolean; n integer; total integer := 0; tabs text[] := '{}'; t text;
begin
  for r in select * from public.pessoa_colunas loop
    execute format('select exists (select 1 from public.%I where %I = $1)', r.tabela, r.id_coluna) into ex using p_ficha;
    if ex and not (r.tabela = any (tabs)) then tabs := tabs || r.tabela; end if;
  end loop;
  foreach t in array tabs loop execute format('alter table public.%I disable trigger user', t); end loop;
  begin
    for r in select * from public.pessoa_colunas where tabela = any (tabs) loop
      execute format('update public.%I set %I = $2 where %I = $1', r.tabela, r.id_coluna, r.id_coluna) using p_ficha, p_usuario;
      get diagnostics n = row_count; total := total + n;
    end loop;
  exception when others then
    foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
    raise;
  end;
  foreach t in array tabs loop execute format('alter table public.%I enable trigger user', t); end loop;
  total := total + public.pessoa_propagar_nome(p_usuario);
  return total;
end $$;

create or replace function public.pessoa_trg_auth_usuarios() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if btrim(coalesce(NEW.nome, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (public.pessoa_chave(NEW.nome), NEW.id, 'usuario')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if btrim(coalesce(NEW.email, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (lower(btrim(NEW.email)), NEW.id, 'email')
    on conflict (chave) do update set pessoa_id = excluded.pessoa_id, origem = excluded.origem where public.usuarios_nomes_antigos.origem in ('rh', 'par');
  end if;
  if TG_OP = 'UPDATE' and NEW.nome is distinct from OLD.nome then perform public.pessoa_propagar_nome(NEW.id); end if;
  return null;
end $$;

create or replace function public.pessoa_trg_rh_funcionarios() returns trigger language plpgsql security definer set search_path = public as
$$
declare x text;
begin
  foreach x in array array[NEW.nome, NEW.nome_completo] loop
    if btrim(coalesce(x, '')) <> '' then
      insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (public.pessoa_chave(x), NEW.id, 'rh') on conflict (chave) do nothing;
    end if;
  end loop;
  if btrim(coalesce(NEW.email, '')) <> '' then
    insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem) values (lower(btrim(NEW.email)), NEW.id, 'rh') on conflict (chave) do nothing;
  end if;
  if TG_OP = 'UPDATE' then
    if NEW.usuario_id is not null and NEW.usuario_id is distinct from OLD.usuario_id then
      perform public.pessoa_unificar(NEW.id, NEW.usuario_id);
    elsif NEW.usuario_id is null and NEW.nome is distinct from OLD.nome then
      perform public.pessoa_propagar_nome(NEW.id);
    end if;
  end if;
  return null;
end $$;

-- 3) permissoes: so quem entrou le/usa o que a tela precisa; o resto so o proprio banco ----------------------------------------------------------
revoke all on function public.pessoa_chave(text) from public, anon, authenticated;
revoke all on function public.pessoa_canonica(uuid) from public, anon, authenticated;
revoke all on function public.pessoa_nome(uuid) from public, anon, authenticated;
revoke all on function public.pessoa_id_por_texto(text) from public, anon, authenticated;
revoke all on function public.pessoa_sincronizar(boolean, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pessoa_propagar_nome(uuid) from public, anon, authenticated;
revoke all on function public.pessoa_unificar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pessoa_trg_auth_usuarios() from public, anon, authenticated;
revoke all on function public.pessoa_trg_rh_funcionarios() from public, anon, authenticated;
grant execute on function public.pessoa_canonica(uuid) to authenticated;
grant execute on function public.pessoa_nome(uuid) to authenticated;
grant execute on function public.pessoa_id_por_texto(text) to authenticated;
grant execute on function public.pessoa_chave(text) to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.usuarios_nomes_antigos, public.pessoa_colunas from authenticated, anon, public;
revoke select on public.usuarios_nomes_antigos, public.pessoa_colunas from anon, public;

-- 4) apelidos de partida (nomes de agora, antigos, e-mails e nomes do RH) --------------------------------------------------------------------------
create temp table _cand (chave text, pid uuid, origem text) on commit drop;
insert into _cand select public.pessoa_chave(nome), id, 'usuario' from public.auth_usuarios where btrim(coalesce(nome, '')) <> '';
insert into _cand select lower(btrim(email)), id, 'email' from public.auth_usuarios where btrim(coalesce(email, '')) <> '';
insert into _cand select public.pessoa_chave(x.n), f.id, 'rh' from public.rh_funcionarios f cross join lateral (values (f.nome), (f.nome_completo)) x(n) where btrim(coalesce(x.n, '')) <> '';
insert into _cand select lower(btrim(f.email)), f.id, 'rh' from public.rh_funcionarios f where btrim(coalesce(f.email, '')) <> '';
-- nomes curto e completo de antes e de depois das trocas de 11/11 e 24/11/2026
insert into _cand
select public.pessoa_chave(s.n), u.id, 'par'
from (values ('TATIANA IRENE ROSA SOARES','TATIANA ROSA'),('THIAGO CARLOS SIQUEIRA MEDEIROS','THIAGO MEDEIROS'),('FERNANDO ACOSTA WAECHTER','FERNANDO WAECHTER'),
             ('GUSTAVO CESAR DE MOURA','GUSTAVO MOURA'),('KATIA REGINA DE PAULA BARROS','KATIA BARROS'),('LUIZ CLAUDIO DO AMARAL ALBANEZ','LUIZ ALBANEZ'),
             ('MATHEUS COUTO SPINELLI','MATHEUS SPINELLI'),('RENATA ANGELINA DA SILVA','RENATA ANGELINA'),('THALLITA LOREDANE BROCA','THALLITA LOREDANE')) p(a, b)
cross join lateral (values (p.a), (p.b)) s(n)
join public.auth_usuarios u on lower(u.nome) in (lower(p.a), lower(p.b));
-- nome que serve a duas pessoas diferentes NAO vira apelido (o ID ficaria vazio em vez de errado)
insert into public.usuarios_nomes_antigos (chave, pessoa_id, origem)
select chave,
       (array_agg(pid order by case origem when 'usuario' then 0 when 'email' then 1 when 'par' then 2 else 3 end))[1],
       (array_agg(origem order by case origem when 'usuario' then 0 when 'email' then 1 when 'par' then 2 else 3 end))[1]
from _cand where chave <> ''
group by chave having count(distinct public.pessoa_canonica(pid)) = 1
on conflict (chave) do nothing;

-- 5) colunas de ID ao lado de cada coluna de pessoa: UMA TABELA POR VEZ, em lotes pequenos, com trava curta ---------------------------------------
-- Por que: o bloco unico anterior travou 133 tabelas juntas e derrubou o sistema vivo por ~10 minutos no ensaio de 24/11/2026. Agora cada tabela
-- e aplicada sozinha, com lock_timeout de 3 s: se a tabela estiver ocupada a funcao DESISTE daquela tabela (sem travar ninguem) e diz qual; basta repetir.
create or replace function public.pessoa_listar_colunas() returns table(tabela text, coluna text) language sql stable security definer set search_path = public as
$$
  select x.t, x.col from (
    select cl.table_name::text t, cl.column_name::text col
    from information_schema.columns cl
    join information_schema.tables tt on tt.table_schema = cl.table_schema and tt.table_name = cl.table_name and tt.table_type = 'BASE TABLE'
    where cl.table_schema = 'public' and cl.table_name !~ '(antes|backup|apagad|^unificacao)'
      and cl.table_name not in ('usuarios_nomes_antigos', 'pessoa_colunas', 'auth_usuarios')
      and cl.column_name ~ '(_por|_por_nome|usuario|responsavel|criado_por|mencion|remetente|analista|comprador|auditor|gestor|vendedor|solicitante|aprovador|autor|executor|tecnico|operador|analisado)'
      and cl.column_name !~ '(_em$|_at$|_id$|_norm$|^usuario_id|email|whatsapp|telefone|data|hora|setor|perfil|_url|cnpj|chave|nome_solicitante|contato_responsavel|^remetente$|participantes|membros|lida_por|autorizacoes|tecnicos_producao|^responsavel$)'
      and cl.data_type in ('text', 'character varying')
    union all select 'audit_log', 'user_nome'
  ) x order by 1, 2 $$;

-- fase 1: coluna de ID e registro (rapido; a trava de acrescentar coluna e instantanea, mas exige a tabela livre por um instante)
create or replace function public.pessoa_aplicar_estrutura(p_tabela text) returns integer language plpgsql security definer set search_path = public as
$$
declare r record; idc text; sib boolean; n_fixo bigint; n_tot bigint; kind text; n integer := 0;
begin
  for r in select * from public.pessoa_listar_colunas() l where l.tabela = p_tabela loop
    idc := r.coluna || '_pessoa_id';
    execute format('alter table public.%I add column if not exists %I uuid', r.tabela, idc);
    execute format($q$select count(*) filter (where %1$I like '%%@%%' or %1$I ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
                             count(*) filter (where %1$I is not null and btrim(%1$I) <> '') from public.%2$I$q$, r.coluna, r.tabela) into n_fixo, n_tot;
    sib := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tabela and column_name = r.coluna || '_nome');
    kind := case when sib or (n_tot > 0 and n_fixo * 2 >= n_tot) then 'fixo' else 'nome' end;
    insert into public.pessoa_colunas values (r.tabela, r.coluna, idc, kind) on conflict (tabela, coluna) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- fase 2: preenche o ID a partir do texto, no maximo p_limite linhas por coluna e por chamada (tabela grande se repete ate devolver 0)
create or replace function public.pessoa_preencher(p_tabela text, p_limite integer default 20000) returns integer language plpgsql security definer set search_path = public as
$$
declare c record; n integer; total integer := 0;
begin
  if not exists (select 1 from public.pessoa_colunas where tabela = p_tabela) then return 0; end if;
  execute format('alter table public.%I disable trigger user', p_tabela);
  for c in select * from public.pessoa_colunas where tabela = p_tabela loop
    execute format('update public.%1$I t set %2$I = public.pessoa_id_por_texto(t.%3$I) where t.ctid in (select s.ctid from public.%1$I s where s.%3$I is not null and btrim(s.%3$I::text) <> '''' and s.%2$I is null and public.pessoa_id_por_texto(s.%3$I) is not null limit %4$s)', p_tabela, c.id_coluna, c.coluna, p_limite);
    get diagnostics n = row_count; total := greatest(total, n);
  end loop;
  execute format('alter table public.%I enable trigger user', p_tabela);
  return total;
end $$;

-- fase 3: a funcao e o gatilho da tabela, com as colunas dela escritas por extenso (barato: nao copia a linha inteira)
create or replace function public.pessoa_ligar_gatilho(p_tabela text) returns void language plpgsql security definer set search_path = public as
$pg$
declare c record; body text := '';
begin
  for c in select * from public.pessoa_colunas where tabela = p_tabela order by coluna loop
    body := body || format($b$
        if TG_OP = 'UPDATE' then o_txt := OLD.%1$I; o_id := OLD.%2$I; else o_txt := null; o_id := null; end if;
        select * into s from public.pessoa_sincronizar(TG_OP = 'INSERT', o_txt, NEW.%1$I, o_id, NEW.%2$I, %3$L);
        NEW.%1$I := s.txt; NEW.%2$I := s.pid;
      $b$, c.coluna, c.id_coluna, c.tipo);
  end loop;
  if body = '' then return; end if;
  execute format($fn$create or replace function public.%1$I() returns trigger language plpgsql security definer set search_path = public as $x$
      declare s record; o_txt text; o_id uuid;
      begin %2$s return NEW; end $x$$fn$, 'pessoa_trg_' || p_tabela, body);
  execute format('revoke all on function public.%I() from public, anon, authenticated', 'pessoa_trg_' || p_tabela);
  execute format('drop trigger if exists pessoa_sincronizar_ids on public.%I', p_tabela);
  execute format('create trigger pessoa_sincronizar_ids before insert or update on public.%I for each row execute function public.%I()', p_tabela, 'pessoa_trg_' || p_tabela);
end $pg$;

-- o lote: cada tabela numa subtransacao propria; se a trava de 3 s nao sai ou algo falha, aquela tabela volta ao que era e a funcao conta e segue
create or replace function public.pessoa_aplicar_lote(p_tabelas text[], p_limite integer default 20000) returns text language plpgsql security definer set search_path = public as
$$
declare t text; rel text := ''; ncol integer; n integer; ok integer := 0;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '60s', true);
  foreach t in array p_tabelas loop
    begin
      ncol := public.pessoa_aplicar_estrutura(t);
      n := public.pessoa_preencher(t, p_limite);
      if ncol = 0 then
        rel := rel || t || ': SEM COLUNAS DE PESSOA (nome de tabela errado?); ';
      elsif n >= p_limite then
        rel := rel || t || ': PARCIAL (' || n || ' linhas; repetir antes de ligar o gatilho); ';
      else
        perform public.pessoa_ligar_gatilho(t);
        ok := ok + 1;
      end if;
    exception when others then
      rel := rel || t || ': FALHOU (' || sqlerrm || '); ';
    end;
  end loop;
  return ok || ' de ' || array_length(p_tabelas, 1) || ' tabelas prontas' || case when rel = '' then '' else ' | ' || rel end;
end $$;
revoke all on function public.pessoa_listar_colunas() from public, anon, authenticated;
revoke all on function public.pessoa_aplicar_estrutura(text) from public, anon, authenticated;
revoke all on function public.pessoa_preencher(text, integer) from public, anon, authenticated;
revoke all on function public.pessoa_ligar_gatilho(text) from public, anon, authenticated;
revoke all on function public.pessoa_aplicar_lote(text[], integer) from public, anon, authenticated;

-- 6) manutencao dos apelidos e da acompanhamento do nome ---------------------------------------------------------------------------------------
drop trigger if exists pessoa_apelidos_usuario on public.auth_usuarios;
create trigger pessoa_apelidos_usuario after insert or update of nome, email on public.auth_usuarios
  for each row execute function public.pessoa_trg_auth_usuarios();
drop trigger if exists pessoa_apelidos_rh on public.rh_funcionarios;
create trigger pessoa_apelidos_rh after insert or update of nome, nome_completo, email, usuario_id on public.rh_funcionarios
  for each row execute function public.pessoa_trg_rh_funcionarios();
