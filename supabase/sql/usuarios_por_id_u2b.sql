-- Plano "toda pessoa por ID" (PLANO_USUARIOS_POR_ID.md), etapa U2b — 24/11/2026.
-- As colunas que guardam VARIAS pessoas numa lista (jsonb): participantes de agenda, CRM, Financeiro e agendamentos, membros do chat e das demandas, equipe de producao
-- e da viagem. Cada elemento da lista continua com o mesmo formato de antes ({nome, email} ou {id, nome}: nenhuma tela muda) e GANHA a chave `pessoa_id` (o ID da pessoa).
-- Regras: o `pessoa_id` ja gravado manda; sem ele, a pessoa e achada pelo `id` do elemento (se for uma pessoa conhecida), depois pelo e-mail e por fim pelo nome;
-- o `nome` de um USUARIO e regravado como o nome ATUAL dele (mesma regra do U4); elemento que nao se acha fica como esta. Renomear um usuario leva o nome novo tambem para as listas.
-- Ficam de fora (formato proprio ou sem pessoa): garantia_atendimentos.autorizacoes e .responsavel (objetos com varios nomes dentro), oples.tecnicos_producao (lista de textos, vazia hoje),
-- chat_mensagens.lida_por (vazia e sem uso) e as listas de PERFIS (perfis_aprovadores, destinatarios_perfis).
-- Aplicacao: tabela por tabela, com `select pessoa_lista_aplicar('tabela')`. Desfazer: usuarios_por_id_u2b_reverter.sql.
set local lock_timeout = '5s';

create table if not exists public.pessoa_colunas_lista (tabela text not null, coluna text not null, primary key (tabela, coluna));
insert into public.pessoa_colunas_lista (tabela, coluna) values
  ('agenda_compromissos', 'participantes'), ('agendamentos_manutencao', 'participantes'), ('chat_salas', 'membros'), ('crm_oportunidades', 'participantes'),
  ('demandas_avulsas', 'membros'), ('engenharia_horas_tarefas', 'participantes'), ('financeiro_tarefas', 'participantes'), ('producao_equipes', 'membros'), ('viagens', 'equipe')
on conflict do nothing;
alter table public.pessoa_colunas_lista enable row level security;
revoke all on public.pessoa_colunas_lista from anon, public, authenticated;

-- 1) a conta de uma lista: devolve a lista com `pessoa_id` e nome atual em cada elemento que se acha (VOLATILE de proposito: ao renomear, ve o nome novo na mesma transacao)
create or replace function public.pessoa_lista_sincronizar(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$
declare e jsonb; res jsonb := '[]'::jsonb; novo jsonb; pid uuid; c uuid; v text; re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return p; end if;
  for e in select x from jsonb_array_elements(p) x loop
    novo := e;
    if jsonb_typeof(e) = 'object' then
      pid := null;
      v := e->>'pessoa_id';
      if v ~* re then pid := v::uuid; end if;
      if pid is null then
        v := e->>'id';
        if v ~* re then pid := public.pessoa_canonica(v::uuid); end if;
      end if;
      if pid is null and btrim(coalesce(e->>'email', '')) <> '' then pid := public.pessoa_id_por_texto(e->>'email'); end if;
      if pid is null and btrim(coalesce(e->>'nome', '')) <> '' then pid := public.pessoa_id_por_texto(e->>'nome'); end if;
      if pid is not null then
        c := public.pessoa_canonica(pid);
        if c is not null then
          novo := e || jsonb_build_object('pessoa_id', c::text);
          if e ? 'nome' and exists (select 1 from public.auth_usuarios a where a.id = c) then novo := novo || jsonb_build_object('nome', public.pessoa_nome(c)); end if;
        end if;
      end if;
    end if;
    res := res || jsonb_build_array(novo);
  end loop;
  return res;
end $$;

-- 2) renomear um usuario leva o nome novo as listas (chamada por pessoa_propagar_nome)
create or replace function public.pessoa_propagar_listas(p_pid uuid) returns integer language plpgsql security definer set search_path = public as
$$
declare r record; ex boolean; n integer; total integer := 0; marca jsonb := jsonb_build_array(jsonb_build_object('pessoa_id', p_pid::text));
begin
  for r in select * from public.pessoa_colunas_lista loop
    execute format('select exists (select 1 from public.%I where jsonb_typeof(%I) = ''array'' and %I @> $1 and public.pessoa_lista_sincronizar(%I) is distinct from %I)', r.tabela, r.coluna, r.coluna, r.coluna, r.coluna) into ex using marca;
    if ex then
      execute format('alter table public.%I disable trigger user', r.tabela);
      begin
        execute format('update public.%I set %I = public.pessoa_lista_sincronizar(%I) where jsonb_typeof(%I) = ''array'' and %I @> $1 and public.pessoa_lista_sincronizar(%I) is distinct from %I', r.tabela, r.coluna, r.coluna, r.coluna, r.coluna, r.coluna, r.coluna) using marca;
        get diagnostics n = row_count; total := total + n;
      exception when others then
        execute format('alter table public.%I enable trigger user', r.tabela);
        raise;
      end;
      execute format('alter table public.%I enable trigger user', r.tabela);
    end if;
  end loop;
  return total;
end $$;

do $do$
declare d text;
begin
  d := pg_get_functiondef('public.pessoa_propagar_nome(uuid)'::regprocedure);
  if position('pessoa_propagar_listas' in d) = 0 then
    if (length(d) - length(replace(d, 'return total;', ''))) / length('return total;') <> 1 then raise exception 'pessoa_propagar_nome: ponto de insercao nao achado ou repetido'; end if;
    d := replace(d, 'return total;', E'total := total + public.pessoa_propagar_listas(p_pid);\n  return total;');
    execute d;
  end if;
end $do$;

-- 3) por tabela: preenche as listas que ja existem e liga o gatilho (uma tabela por vez, trava curta; ao falhar, desfaz aquela tabela e diz qual)
create or replace function public.pessoa_lista_aplicar(p_tabela text) returns text language plpgsql security definer set search_path = public as
$fn$
declare r record; n integer; total integer := 0; f text;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '60s', true);
  begin
    if not exists (select 1 from public.pessoa_colunas_lista where tabela = p_tabela) then return p_tabela || ': SEM LISTA DE PESSOAS (nome de tabela errado?)'; end if;
    for r in select * from public.pessoa_colunas_lista where tabela = p_tabela loop
      f := 'pessoa_lista_trg_' || r.tabela || '_' || r.coluna;
      execute format('drop trigger if exists %I on public.%I', f, r.tabela);
      execute format('alter table public.%I disable trigger user', r.tabela);
      execute format('update public.%I set %I = public.pessoa_lista_sincronizar(%I) where jsonb_typeof(%I) = ''array'' and jsonb_array_length(%I) > 0 and public.pessoa_lista_sincronizar(%I) is distinct from %I', r.tabela, r.coluna, r.coluna, r.coluna, r.coluna, r.coluna, r.coluna);
      get diagnostics n = row_count; total := total + n;
      execute format('alter table public.%I enable trigger user', r.tabela);
      execute format($pg$create or replace function public.%I() returns trigger language plpgsql security definer set search_path = public as $b$
begin
  if TG_OP = 'UPDATE' and NEW.%I is not distinct from OLD.%I then return NEW; end if;
  NEW.%I := public.pessoa_lista_sincronizar(NEW.%I);
  return NEW;
end $b$$pg$, f, r.coluna, r.coluna, r.coluna, r.coluna);
      execute format('revoke all on function public.%I() from public, anon, authenticated', f);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.%I()', f, r.tabela, f);
    end loop;
    return p_tabela || ': pronta (' || total || ' linhas regravadas)';
  exception when others then
    return p_tabela || ': FALHOU (' || sqlerrm || ')';
  end;
end $fn$;

revoke all on function public.pessoa_lista_sincronizar(jsonb) from public, anon, authenticated;
revoke all on function public.pessoa_propagar_listas(uuid) from public, anon, authenticated;
revoke all on function public.pessoa_lista_aplicar(text) from public, anon, authenticated;
