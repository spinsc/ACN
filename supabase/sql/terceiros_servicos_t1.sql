-- SERVIÇOS DE TERCEIROS — fatia T1 (banco): tipos, prestadores e o serviço, com as regras de quem pode o quê (pedido do usuário em 22/11/2026; PLANO_SERVICOS_TERCEIROS.md).
-- Decidido com o usuário:
--  • todos pedem e todos VEEM todos os serviços (a leitura é de quem entrou); só edita quem pode, e a gravação do serviço passa SÓ pelas funções abaixo (não existe política de gravação);
--  • A definir (solicitado) → Agendado → Realizado, mais Cancelado; nada se apaga; voltar, reabrir e cancelar pedem motivo; toda mudança confere a situação de antes (duas pessoas não atropelam o mesmo pedido);
--  • película, plotagem e pintura: quem marca a data é a Adaptação (aba producao), mesmo que o Comercial tenha pedido; nos outros tipos, quem pediu. Gerentes e Admin decidem sobre qualquer pedido
--    (a regra mora no tipo: `quem_marca_data`, que o Admin muda sem mexer em código);
--  • um serviço por carro (cada OP /NN): pedir para um lote cria um serviço por unidade, todos ou nenhum; a tela agrupa pela venda (`venda_base`);
--  • quem confirma "Realizado" nos tipos da Adaptação: quem pediu OU a Adaptação (gerentes e Admin sempre); nos outros tipos, quem pediu.
-- Suposições minhas, a confirmar com o usuário: os prestadores são cadastrados por Admin, gerentes e Adaptação; os tipos, só pelo Admin; a leitura dos valores é de quem entrou (a tela esconde de quem não vê valores,
-- o mesmo padrão do Compras).
-- Custo do banco: só objetos NOVOS (nenhuma tabela, política ou função que já existe é alterada); as políticas novas usam (select ...) para a conferência rodar uma vez por consulta.
-- Reverter: terceiros_servicos_t1_reverter.sql.

-- ── tipos de serviço (cadastro com regra) ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.terceiros_tipos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_norm text not null,                     -- o nome sem acento e em minúsculas (a tela calcula); barra nome repetido
  quem_marca_data text not null default 'solicitante' check (quem_marca_data in ('solicitante', 'adaptacao')),
  onde_padrao text check (onde_padrao in ('fabrica', 'prestador')),   -- null = a pessoa escolhe em cada serviço
  usa_ordem_em_lote boolean not null default false,   -- pintura eletrostática: várias demandas juntas numa ordem de serviço que o prestador assina (fatia T4)
  ativo boolean not null default true,
  ordem integer not null default 100,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz,
  atualizado_por text
);
create unique index if not exists terceiros_tipos_nome_norm_uk on public.terceiros_tipos (nome_norm);

-- ── prestadores (cadastro próprio, não é o de fornecedores do Compras) ──────────────────────────────────────────────────────────────────────────
create table if not exists public.terceiros_prestadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_norm text not null,
  razao_social text,
  cnpj_cpf text,                               -- só dígitos (11 = CPF, 14 = CNPJ)
  contato_nome text,
  telefone text,
  email text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf text,
  tipos_ids uuid[] not null default '{}',      -- os tipos de serviço que o prestador faz (vazio = a tela não filtra por tipo)
  observacao text,
  ativo boolean not null default true,         -- nada se apaga: os serviços já feitos apontam para o prestador
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz,
  atualizado_por text,
  constraint terceiros_prestadores_documento_ck check (cnpj_cpf is null or cnpj_cpf ~ '^[0-9]{11}$' or cnpj_cpf ~ '^[0-9]{14}$')
);
create unique index if not exists terceiros_prestadores_nome_norm_uk on public.terceiros_prestadores (nome_norm);
create unique index if not exists terceiros_prestadores_documento_uk on public.terceiros_prestadores (cnpj_cpf) where cnpj_cpf is not null;

-- ── o serviço de terceiro (um por carro) ─────────────────────────────────────────────────────────────────────────────────────────────────────
create sequence if not exists public.terceiros_servico_seq;

create table if not exists public.terceiros_servicos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,                        -- TS-00001, dado pelo banco (gatilho abaixo)
  tipo_id uuid not null references public.terceiros_tipos(id) on delete restrict,
  descricao text not null,
  status text not null default 'solicitado' check (status in ('solicitado', 'agendado', 'realizado', 'cancelado')),
  status_desde timestamptz not null default now(),
  solicitante_id uuid,                         -- auth_usuarios.id de quem pediu (a pessoa vista, no "Ver como")
  solicitante_nome text not null,
  solicitante_perfil text,                     -- o perfil na hora do pedido ("pedido do Comercial")
  ligacao_tipo text check (ligacao_tipo in ('op', 'os', 'demanda', 'projeto')),
  ligacao_id uuid,
  ligacao_rotulo text,                         -- o que a tela mostra (número da OP /NN, da OS, título da demanda); o banco o lê da origem, não confia na tela
  venda_base text,                             -- só para OP: o número sem o /NN, para a tela agrupar as unidades da mesma venda
  prestador_id uuid references public.terceiros_prestadores(id) on delete restrict,
  onde text check (onde in ('fabrica', 'prestador')),
  valor_combinado numeric(12,2) check (valor_combinado is null or valor_combinado >= 0),
  valor_final numeric(12,2) check (valor_final is null or valor_final >= 0),
  data_desejada date,                          -- o que quem pediu gostaria (nos tipos da Adaptação, quem pediu não marca a data, só diz a desejada)
  data_agendada date,
  periodo text check (periodo in ('manha', 'tarde', 'dia_todo')),
  data_realizada date,
  conferido_por text,                          -- quem deu como realizado (com "(vendo como X)" se foi o Admin vendo como alguém)
  conferido_em timestamptz,
  pecas jsonb not null default '[]'::jsonb,    -- [{descricao, quantidade}]
  anexos jsonb not null default '[]'::jsonb,   -- [{caminho, nome}] (desenho de corte e dobra, por exemplo; a fatia T2 sobe os arquivos)
  observacao text,
  cancelado_motivo text,
  cancelado_em timestamptz,
  cancelado_por text,
  historico jsonb not null default '[]'::jsonb,   -- [{em, por, acao, detalhe}]
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  constraint terceiros_servicos_ligacao_ck check ((ligacao_tipo is null) = (ligacao_id is null)),
  constraint terceiros_servicos_agenda_ck check (status not in ('agendado', 'realizado') or (prestador_id is not null and data_agendada is not null and periodo is not null)),
  constraint terceiros_servicos_realizado_ck check (status <> 'realizado' or (data_realizada is not null and valor_final is not null and conferido_por is not null and conferido_em is not null)),
  constraint terceiros_servicos_cancelado_ck check (status <> 'cancelado' or (cancelado_motivo is not null and cancelado_em is not null))
);
create unique index if not exists terceiros_servicos_numero_uk on public.terceiros_servicos (numero);
create index if not exists terceiros_servicos_status_idx on public.terceiros_servicos (status, data_agendada);
create index if not exists terceiros_servicos_prestador_idx on public.terceiros_servicos (prestador_id, data_agendada) where prestador_id is not null;
create index if not exists terceiros_servicos_ligacao_idx on public.terceiros_servicos (ligacao_tipo, ligacao_id) where ligacao_id is not null;
create index if not exists terceiros_servicos_venda_idx on public.terceiros_servicos (venda_base) where venda_base is not null;
create index if not exists terceiros_servicos_solicitante_idx on public.terceiros_servicos (solicitante_id);

-- número legível, dado pelo banco (qualquer caminho que crie serviço já sai no padrão)
create or replace function public.terceiros_servico_numerar()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := 'TS-' || lpad(nextval('public.terceiros_servico_seq')::text, 5, '0');
  end if;
  return new;
end $function$;
revoke all on function public.terceiros_servico_numerar() from public, anon, authenticated;   -- função de gatilho: dispara sem esse direito
drop trigger if exists terceiros_servico_numerar on public.terceiros_servicos;
create trigger terceiros_servico_numerar before insert on public.terceiros_servicos for each row execute function public.terceiros_servico_numerar();

-- ── quem pode o quê (o banco confere, não só a tela) ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.terceiros_hoje()
returns date language sql stable set search_path to 'public', 'pg_temp' as $function$
  select (now() at time zone 'America/Sao_Paulo')::date;
$function$;
revoke all on function public.terceiros_hoje() from public, anon, authenticated;

-- a pessoa que está agindo: a VISTA (uid_efetivo, do "Ver como"), com o autor REAL no histórico; diretoria = Admin e perfis "Gerente …"; adaptacao = quem tem a aba Adaptação (producao)
create or replace function public.terceiros_ator()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select (
    select jsonb_build_object(
      'id', u.id, 'nome', u.nome, 'perfil', u.perfil,
      'diretoria', coalesce(u.perfil = 'Admin' or u.perfil ilike 'gerente%', false),
      'adaptacao', coalesce((select public.tem_aba('producao')), false),
      'autor', case when auth.uid() is distinct from public.uid_efetivo()
                    then coalesce((select r.nome from public.auth_usuarios r where r.auth_id = auth.uid() limit 1), 'Admin') || ' (vendo como ' || u.nome || ')'
                    else u.nome end)
      from public.auth_usuarios u
     where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false)
     limit 1
  );
$function$;
revoke all on function public.terceiros_ator() from public, anon, authenticated;

-- altera, confirma e cancela: quem pediu, gerentes e Admin; nos tipos em que a Adaptação marca a data, a Adaptação também
create or replace function public.terceiros_pode_mexer(a jsonb, p_quem text, p_sol uuid)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select a is not null and (
    coalesce((a->>'diretoria')::boolean, false)
    or (p_sol is not null and p_sol = (a->>'id')::uuid)
    or (p_quem = 'adaptacao' and coalesce((a->>'adaptacao')::boolean, false)));
$function$;
revoke all on function public.terceiros_pode_mexer(jsonb, text, uuid) from public, anon, authenticated;

-- marca a data: no tipo em que a Adaptação decide, só ela (e gerentes e Admin); nos outros, quem pediu (e gerentes e Admin)
create or replace function public.terceiros_pode_marcar_data(a jsonb, p_quem text, p_sol uuid)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select a is not null and (
    coalesce((a->>'diretoria')::boolean, false)
    or case when p_quem = 'adaptacao' then coalesce((a->>'adaptacao')::boolean, false)
            else (p_sol is not null and p_sol = (a->>'id')::uuid) end);
$function$;
revoke all on function public.terceiros_pode_marcar_data(jsonb, text, uuid) from public, anon, authenticated;

-- cadastra e corrige prestadores: Admin, gerentes e Adaptação (as políticas abaixo chamam esta, como a pessoa que consulta: por isso quem entrou executa)
create or replace function public.terceiros_pode_gerir_prestadores()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select coalesce((select coalesce((q.x->>'diretoria')::boolean, false) or coalesce((q.x->>'adaptacao')::boolean, false) from (select public.terceiros_ator() as x) q), false);
$function$;
revoke all on function public.terceiros_pode_gerir_prestadores() from public, anon;
grant execute on function public.terceiros_pode_gerir_prestadores() to authenticated;

-- ── políticas: quem entrou lê tudo; tipos só o Admin grava; prestadores quem gere; o serviço só pelas funções ─────────────────────────────────────
alter table public.terceiros_tipos enable row level security;
drop policy if exists etapa17_logado on public.terceiros_tipos;
create policy etapa17_logado on public.terceiros_tipos for select to authenticated using ((select public.esta_logado()));
drop policy if exists terceiros_tipos_incluir on public.terceiros_tipos;
create policy terceiros_tipos_incluir on public.terceiros_tipos for insert to authenticated with check ((select public.eh_admin()));
drop policy if exists terceiros_tipos_alterar on public.terceiros_tipos;
create policy terceiros_tipos_alterar on public.terceiros_tipos for update to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));

alter table public.terceiros_prestadores enable row level security;
drop policy if exists etapa17_logado on public.terceiros_prestadores;
create policy etapa17_logado on public.terceiros_prestadores for select to authenticated using ((select public.esta_logado()));
drop policy if exists terceiros_prestadores_incluir on public.terceiros_prestadores;
create policy terceiros_prestadores_incluir on public.terceiros_prestadores for insert to authenticated with check ((select public.terceiros_pode_gerir_prestadores()));
drop policy if exists terceiros_prestadores_alterar on public.terceiros_prestadores;
create policy terceiros_prestadores_alterar on public.terceiros_prestadores for update to authenticated
  using ((select public.terceiros_pode_gerir_prestadores())) with check ((select public.terceiros_pode_gerir_prestadores()));

alter table public.terceiros_servicos enable row level security;
drop policy if exists etapa17_logado on public.terceiros_servicos;
create policy etapa17_logado on public.terceiros_servicos for select to authenticated using ((select public.esta_logado()));   -- só leitura: não há política de gravação

revoke all on table public.terceiros_tipos, public.terceiros_prestadores, public.terceiros_servicos from anon;
revoke delete, truncate, references, trigger on table public.terceiros_tipos, public.terceiros_prestadores from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.terceiros_servicos from authenticated;
revoke usage, select, update on sequence public.terceiros_servico_seq from anon, authenticated;

comment on table public.terceiros_tipos is 'Tipos de serviço de terceiro (película, plotagem, pintura, lavagem...), com a regra de quem marca a data e o local padrão. O Admin edita.';
comment on table public.terceiros_prestadores is 'Prestadores de serviço de terceiro (cadastro próprio). Nada se apaga: desativa.';
comment on table public.terceiros_servicos is 'Serviços de terceiro, um por carro (cada OP /NN). Só leitura para a tela; a gravação passa pelas funções terceiros_*.';

-- ── pedir (um serviço por unidade; todos ou nenhum) ──────────────────────────────────────────────────────────────────────────────────────────
-- p_ligacoes: [{"tipo":"op","id":"<uuid>"}, ...]; vazia = um serviço sem ligação. O banco lê o rótulo e a venda da origem (OP, OS, demanda ou projeto) e recusa o que não existe.
create or replace function public.terceiros_solicitar(
  p_tipo_id uuid, p_descricao text, p_ligacoes jsonb default '[]'::jsonb, p_data_desejada date default null, p_observacao text default null,
  p_pecas jsonb default '[]'::jsonb, p_prestador_id uuid default null, p_valor_combinado numeric default null, p_onde text default null, p_permitir_duplicado boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje();
  t public.terceiros_tipos; v_desc text := btrim(coalesce(p_descricao, '')); v_onde text; v_ligs jsonb := coalesce(p_ligacoes, '[]'::jsonb);
  v_pecas jsonb := coalesce(p_pecas, '[]'::jsonb); el jsonb; v_tipo text; v_id uuid; v_rot text; v_venda text; dup record; novo public.terceiros_servicos; saida jsonb := '[]'::jsonb;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode pedir um serviço de terceiro.' using errcode = '42501'; end if;
  select * into t from public.terceiros_tipos where id = p_tipo_id and ativo;
  if not found then raise exception 'Escolha o tipo de serviço (o tipo escolhido não existe ou foi desativado).'; end if;
  if length(v_desc) < 3 then raise exception 'Descreva o serviço (pelo menos 3 letras).'; end if;
  if p_data_desejada is not null and p_data_desejada < hoje then raise exception 'A data desejada já passou: informe hoje ou uma data futura.'; end if;
  v_onde := coalesce(nullif(btrim(coalesce(p_onde, '')), ''), t.onde_padrao);
  if v_onde is not null and v_onde not in ('fabrica', 'prestador') then raise exception 'O local do serviço deve ser "na fábrica" ou "no prestador".'; end if;
  if p_valor_combinado is not null and p_valor_combinado < 0 then raise exception 'O valor combinado não pode ser negativo.'; end if;
  if jsonb_typeof(v_ligs) <> 'array' then raise exception 'As ligações devem vir em uma lista.'; end if;
  if jsonb_typeof(v_pecas) <> 'array' then raise exception 'As peças devem vir em uma lista.'; end if;
  if jsonb_array_length(v_ligs) > 100 then raise exception 'Peça no máximo 100 unidades de uma vez.'; end if;
  if p_prestador_id is not null then
    perform 1 from public.terceiros_prestadores where id = p_prestador_id and ativo;
    if not found then raise exception 'O prestador escolhido não existe ou está inativo.'; end if;
  end if;
  if jsonb_array_length(v_ligs) = 0 then v_ligs := jsonb_build_array(jsonb_build_object('tipo', null, 'id', null)); end if;

  for el in select value from jsonb_array_elements(v_ligs) loop
    v_tipo := nullif(el->>'tipo', ''); v_id := nullif(el->>'id', '')::uuid; v_rot := null; v_venda := null;
    if v_tipo is null then
      v_id := null;
    elsif v_tipo = 'op' then
      select o.opl, regexp_replace(o.opl, '/[0-9]+$', '') into v_rot, v_venda from public.oples o where o.id = v_id and o.excluida_em is null;
      if not found then raise exception 'Uma das OPs escolhidas não foi encontrada (ela pode ter sido excluída).'; end if;
    elsif v_tipo = 'os' then
      select coalesce(nullif(btrim(o.numero_os), ''), 'OS sem número') into v_rot from public.sac_ordens_servico o where o.id = v_id;
      if not found then raise exception 'A OS escolhida não foi encontrada.'; end if;
    elsif v_tipo = 'demanda' then
      select coalesce(nullif(btrim(d.titulo), ''), 'Demanda') into v_rot from public.demandas_avulsas d where d.id = v_id;
      if not found then raise exception 'A demanda escolhida não foi encontrada.'; end if;
    elsif v_tipo = 'projeto' then
      select coalesce(nullif(btrim(e.titulo), ''), 'Projeto') into v_rot from public.engenharia_desenvolvimento e where e.id = v_id;
      if not found then raise exception 'O projeto escolhido não foi encontrado.'; end if;
    else
      raise exception 'A ligação deve ser uma OP, uma OS, uma demanda ou um projeto.';
    end if;

    if v_id is not null and not coalesce(p_permitir_duplicado, false) then
      select s.numero into dup from public.terceiros_servicos s
       where s.tipo_id = p_tipo_id and s.ligacao_tipo = v_tipo and s.ligacao_id = v_id and s.status in ('solicitado', 'agendado') limit 1;
      if found then
        raise exception 'Já existe o serviço % (%) em aberto para %. Se é outro serviço do mesmo tipo, confirme que quer pedir de novo.', dup.numero, t.nome, v_rot using errcode = 'TS001';
      end if;
    end if;

    insert into public.terceiros_servicos (tipo_id, descricao, solicitante_id, solicitante_nome, solicitante_perfil, ligacao_tipo, ligacao_id, ligacao_rotulo, venda_base,
        prestador_id, onde, valor_combinado, data_desejada, pecas, observacao, historico, criado_por, atualizado_por)
    values (p_tipo_id, v_desc, (a->>'id')::uuid, a->>'nome', a->>'perfil', v_tipo, v_id, v_rot, v_venda,
        p_prestador_id, v_onde, p_valor_combinado, p_data_desejada, v_pecas, nullif(btrim(coalesce(p_observacao, '')), ''),
        jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'solicitado', 'detalhe', t.nome || coalesce(' — ' || v_rot, ''))),
        a->>'autor', a->>'autor')
    returning * into novo;
    saida := saida || jsonb_build_array(jsonb_build_object('id', novo.id, 'numero', novo.numero, 'ligacao_rotulo', novo.ligacao_rotulo));
  end loop;
  return jsonb_build_object('servicos', saida);
end $function$;
revoke all on function public.terceiros_solicitar(uuid, text, jsonb, date, text, jsonb, uuid, numeric, text, boolean) from public, anon;
grant execute on function public.terceiros_solicitar(uuid, text, jsonb, date, text, jsonb, uuid, numeric, text, boolean) to authenticated;

-- ── alterar os dados do pedido (sem mexer na data agendada nem na situação) ─────────────────────────────────────────────────────────────────────
create or replace function public.terceiros_atualizar(p_id uuid, p_dados jsonb, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje();
  s public.terceiros_servicos; t public.terceiros_tipos; k text;
  v_desc text; v_prest uuid; v_valor numeric; v_onde text; v_desejada date; v_obs text; v_pecas jsonb;
  mudancas text := ''; nome_ant text; nome_novo text;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode alterar um serviço.' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe o que mudar.'; end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k not in ('descricao', 'prestador_id', 'valor_combinado', 'onde', 'data_desejada', 'observacao', 'pecas') then
      raise exception 'O campo "%" não pode ser alterado por aqui.', k;
    end if;
  end loop;
  select * into s from public.terceiros_servicos where id = p_id for update;
  if not found then raise exception 'Serviço não encontrado. Atualize a tela.'; end if;
  if s.status is distinct from p_status_esperado then
    raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', s.numero, s.status;
  end if;
  if s.status not in ('solicitado', 'agendado') then raise exception 'O serviço % já está encerrado (%). Um gerente pode reabri-lo.', s.numero, s.status; end if;
  select * into t from public.terceiros_tipos where id = s.tipo_id;
  if not public.terceiros_pode_mexer(a, t.quem_marca_data, s.solicitante_id) then
    raise exception 'Só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin alteram este serviço.' using errcode = '42501';
  end if;
  v_desc := s.descricao; v_prest := s.prestador_id; v_valor := s.valor_combinado; v_onde := s.onde; v_desejada := s.data_desejada; v_obs := s.observacao; v_pecas := s.pecas;

  if p_dados ? 'descricao' then
    v_desc := btrim(coalesce(p_dados->>'descricao', ''));
    if length(v_desc) < 3 then raise exception 'Descreva o serviço (pelo menos 3 letras).'; end if;
    if v_desc is distinct from s.descricao then mudancas := mudancas || '; descrição'; end if;
  end if;
  if p_dados ? 'prestador_id' then
    v_prest := nullif(p_dados->>'prestador_id', '')::uuid;
    if v_prest is null and s.status = 'agendado' then raise exception 'Para tirar o prestador, volte o serviço % para "A definir".', s.numero; end if;
    if v_prest is not null then
      perform 1 from public.terceiros_prestadores where id = v_prest and ativo;
      if not found then raise exception 'O prestador escolhido não existe ou está inativo.'; end if;
    end if;
    if v_prest is distinct from s.prestador_id then
      select nome into nome_ant from public.terceiros_prestadores where id = s.prestador_id;
      select nome into nome_novo from public.terceiros_prestadores where id = v_prest;
      mudancas := mudancas || '; prestador: ' || coalesce(nome_ant, 'sem prestador') || ' → ' || coalesce(nome_novo, 'sem prestador');
    end if;
  end if;
  if p_dados ? 'valor_combinado' then
    v_valor := nullif(p_dados->>'valor_combinado', '')::numeric;
    if v_valor is not null and v_valor < 0 then raise exception 'O valor combinado não pode ser negativo.'; end if;
    if v_valor is distinct from s.valor_combinado then
      mudancas := mudancas || '; valor combinado: ' || coalesce(replace(to_char(s.valor_combinado, 'FM999999990.00'), '.', ','), 'sem valor') || ' → ' || coalesce(replace(to_char(v_valor, 'FM999999990.00'), '.', ','), 'sem valor');
    end if;
  end if;
  if p_dados ? 'onde' then
    v_onde := nullif(btrim(coalesce(p_dados->>'onde', '')), '');
    if v_onde is not null and v_onde not in ('fabrica', 'prestador') then raise exception 'O local do serviço deve ser "na fábrica" ou "no prestador".'; end if;
    if v_onde is distinct from s.onde then mudancas := mudancas || '; local'; end if;
  end if;
  if p_dados ? 'data_desejada' then
    v_desejada := nullif(p_dados->>'data_desejada', '')::date;
    if v_desejada is not null and v_desejada < hoje and v_desejada is distinct from s.data_desejada then raise exception 'A data desejada já passou: informe hoje ou uma data futura.'; end if;
    if v_desejada is distinct from s.data_desejada then mudancas := mudancas || '; data desejada'; end if;
  end if;
  if p_dados ? 'observacao' then
    v_obs := nullif(btrim(coalesce(p_dados->>'observacao', '')), '');
    if v_obs is distinct from s.observacao then mudancas := mudancas || '; observação'; end if;
  end if;
  if p_dados ? 'pecas' then
    v_pecas := coalesce(p_dados->'pecas', '[]'::jsonb);
    if jsonb_typeof(v_pecas) <> 'array' then raise exception 'As peças devem vir em uma lista.'; end if;
    if v_pecas is distinct from s.pecas then mudancas := mudancas || '; peças'; end if;
  end if;
  if mudancas = '' then return to_jsonb(s); end if;   -- nada mudou: não grava nem sujeita o histórico

  update public.terceiros_servicos x set descricao = v_desc, prestador_id = v_prest, valor_combinado = v_valor, onde = v_onde, data_desejada = v_desejada, observacao = v_obs, pecas = v_pecas,
         atualizado_em = now(), atualizado_por = a->>'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'alterado', 'detalhe', substr(mudancas, 3)))
   where x.id = p_id returning * into s;
  return to_jsonb(s);
end $function$;
revoke all on function public.terceiros_atualizar(uuid, jsonb, text) from public, anon;
grant execute on function public.terceiros_atualizar(uuid, jsonb, text) to authenticated;

-- ── agendar (ou reagendar) um ou vários serviços de uma vez: prestador + dia + período ──────────────────────────────────────────────────────────
create or replace function public.terceiros_agendar(p_ids uuid[], p_prestador_id uuid, p_data date, p_periodo text, p_status_esperado text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje();
  r record; ids uuid[]; achados int; v_prest_nome text; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_periodo_txt text;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode agendar um serviço.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Agende no máximo 100 serviços de uma vez.'; end if;
  if p_status_esperado is null or p_status_esperado not in ('solicitado', 'agendado') then raise exception 'Só se agenda serviço que está em "A definir" ou em "Agendado".'; end if;
  if p_data is null then raise exception 'Informe a data do serviço.'; end if;
  if p_data < hoje then raise exception 'A data do agendamento não pode ser anterior a hoje. Se o serviço já foi feito, registre-o como realizado.'; end if;
  if p_periodo is null or p_periodo not in ('manha', 'tarde', 'dia_todo') then raise exception 'Escolha o período: manhã, tarde ou dia todo.'; end if;
  if p_prestador_id is not null then
    select nome into v_prest_nome from public.terceiros_prestadores where id = p_prestador_id and ativo;
    if not found then raise exception 'O prestador escolhido não existe ou está inativo.'; end if;
  end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.status, s.solicitante_id, s.prestador_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status <> p_status_esperado then
      raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', r.numero, r.status;
    end if;
    if not public.terceiros_pode_marcar_data(a, r.quem_marca_data, r.solicitante_id) then
      raise exception 'Serviço %: %', r.numero,
        case when r.quem_marca_data = 'adaptacao' then 'quem marca a data deste tipo de serviço é a Adaptação (ou um gerente).' else 'só quem pediu, gerentes e Admin marcam a data.' end using errcode = '42501';
    end if;
    if p_prestador_id is null and r.prestador_id is null then raise exception 'Defina o prestador do serviço % antes de agendar.', r.numero; end if;
  end loop;
  v_periodo_txt := case p_periodo when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'dia todo' end;
  update public.terceiros_servicos s set
         prestador_id = coalesce(p_prestador_id, s.prestador_id), data_agendada = p_data, periodo = p_periodo,
         status = 'agendado', status_desde = case when s.status = 'agendado' then s.status_desde else now() end,
         atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor',
           'acao', case when s.status = 'agendado' then 'reagendado' else 'agendado' end,
           'detalhe', coalesce(v_prest_nome, (select pp.nome from public.terceiros_prestadores pp where pp.id = s.prestador_id)) || ' — ' || to_char(p_data, 'DD/MM/YYYY') || ' (' || v_periodo_txt || ')'
              || case when s.status = 'agendado' and s.data_agendada is not null then ' — antes: ' || to_char(s.data_agendada, 'DD/MM/YYYY') else '' end
              || case when v_motivo is not null then '. Motivo: ' || v_motivo else '' end))
   where s.id = any(ids);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_agendar(uuid[], uuid, date, text, text, text) from public, anon;
grant execute on function public.terceiros_agendar(uuid[], uuid, date, text, text, text) to authenticated;

-- ── dar como realizado: dia em que foi feito, valor final e quem conferiu (quem está agindo) ────────────────────────────────────────────────────
create or replace function public.terceiros_realizar(p_ids uuid[], p_data_realizada date, p_valor_final numeric, p_status_esperado text, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje();
  r record; ids uuid[]; achados int; v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if a is null then raise exception 'Só quem entrou no sistema pode dar um serviço como realizado.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Confirme no máximo 100 serviços de uma vez.'; end if;
  if p_status_esperado is null or p_status_esperado not in ('solicitado', 'agendado') then raise exception 'Só se dá como realizado o serviço que está em "A definir" ou em "Agendado".'; end if;
  if p_data_realizada is null then raise exception 'Informe o dia em que o serviço foi feito.'; end if;
  if p_data_realizada > hoje then raise exception 'O dia em que o serviço foi feito não pode ser no futuro.'; end if;
  if p_data_realizada < hoje - 365 then raise exception 'O dia em que o serviço foi feito está a mais de um ano: confira a data.'; end if;
  if p_valor_final is null then raise exception 'Informe o valor final cobrado pelo prestador (pode ser zero).'; end if;
  if p_valor_final < 0 then raise exception 'O valor final não pode ser negativo.'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.status, s.solicitante_id, s.prestador_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status <> p_status_esperado then
      raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', r.numero, r.status;
    end if;
    if not public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin dão o serviço como realizado.', r.numero using errcode = '42501';
    end if;
    if r.prestador_id is null then raise exception 'Defina o prestador do serviço % antes de dar como realizado.', r.numero; end if;
  end loop;
  update public.terceiros_servicos s set
         status = 'realizado', status_desde = now(), data_realizada = p_data_realizada, valor_final = p_valor_final, conferido_por = a->>'autor', conferido_em = now(),
         data_agendada = coalesce(s.data_agendada, p_data_realizada), periodo = coalesce(s.periodo, 'dia_todo'),
         atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'realizado',
           'detalhe', 'Feito em ' || to_char(p_data_realizada, 'DD/MM/YYYY') || ' — valor final R$ ' || replace(to_char(p_valor_final, 'FM999999990.00'), '.', ',')
              || case when s.valor_combinado is not null then ' (combinado R$ ' || replace(to_char(s.valor_combinado, 'FM999999990.00'), '.', ',') || ')' else '' end
              || case when v_obs is not null then '. ' || v_obs else '' end))
   where s.id = any(ids);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_realizar(uuid[], date, numeric, text, text) from public, anon;
grant execute on function public.terceiros_realizar(uuid[], date, numeric, text, text) to authenticated;

-- ── voltar uma coluna: Agendado → A definir (tira a data) ou Realizado → Agendado (reabre; o que foi lançado fica no histórico) ───────────────────
create or replace function public.terceiros_voltar(p_ids uuid[], p_para text, p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); r record; ids uuid[]; achados int; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if a is null then raise exception 'Só quem entrou no sistema pode voltar um serviço.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Volte no máximo 100 serviços de uma vez.'; end if;
  if not ((p_status_esperado = 'agendado' and p_para = 'solicitado') or (p_status_esperado = 'realizado' and p_para = 'agendado')) then
    raise exception 'Só dá para voltar de "Agendado" para "A definir" ou de "Realizado" para "Agendado".';
  end if;
  if length(v_motivo) < 5 then raise exception 'Informe o motivo (pelo menos 5 letras).'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.status, s.solicitante_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status <> p_status_esperado then
      raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', r.numero, r.status;
    end if;
    if p_status_esperado = 'agendado' then
      if not public.terceiros_pode_marcar_data(a, r.quem_marca_data, r.solicitante_id) then
        raise exception 'Serviço %: quem tira a data é quem a marca (%).', r.numero, case when r.quem_marca_data = 'adaptacao' then 'a Adaptação ou um gerente' else 'quem pediu, gerentes e Admin' end using errcode = '42501';
      end if;
    elsif not public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin reabrem o serviço.', r.numero using errcode = '42501';
    end if;
  end loop;
  if p_para = 'solicitado' then
    update public.terceiros_servicos s set status = 'solicitado', status_desde = now(), data_agendada = null, periodo = null, atualizado_em = now(), atualizado_por = a->>'autor',
           historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'voltou',
             'detalhe', 'De "Agendado" para "A definir" (estava para ' || to_char(s.data_agendada, 'DD/MM/YYYY') || '). Motivo: ' || v_motivo))
     where s.id = any(ids);
  else
    update public.terceiros_servicos s set status = 'agendado', status_desde = now(), data_realizada = null, valor_final = null, conferido_por = null, conferido_em = null,
           atualizado_em = now(), atualizado_por = a->>'autor',
           historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'reaberto',
             'detalhe', 'Reaberto (estava realizado em ' || to_char(s.data_realizada, 'DD/MM/YYYY') || ', valor final R$ ' || replace(to_char(s.valor_final, 'FM999999990.00'), '.', ',') || '). Motivo: ' || v_motivo))
     where s.id = any(ids);
  end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_voltar(uuid[], text, text, text) from public, anon;
grant execute on function public.terceiros_voltar(uuid[], text, text, text) to authenticated;

-- ── cancelar (nada se apaga: guarda quem, quando e o porquê) ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.terceiros_cancelar(p_ids uuid[], p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); r record; ids uuid[]; achados int; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if a is null then raise exception 'Só quem entrou no sistema pode cancelar um serviço.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Cancele no máximo 100 serviços de uma vez.'; end if;
  if p_status_esperado is null or p_status_esperado not in ('solicitado', 'agendado') then raise exception 'Só se cancela serviço que está em "A definir" ou em "Agendado". O realizado precisa ser reaberto antes.'; end if;
  if length(v_motivo) < 5 then raise exception 'Informe o motivo do cancelamento (pelo menos 5 letras).'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.status, s.solicitante_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status <> p_status_esperado then
      raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', r.numero, r.status;
    end if;
    if not public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin cancelam o serviço.', r.numero using errcode = '42501';
    end if;
  end loop;
  update public.terceiros_servicos s set status = 'cancelado', status_desde = now(), cancelado_motivo = v_motivo, cancelado_em = now(), cancelado_por = a->>'autor',
         atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'cancelado', 'detalhe', 'Motivo: ' || v_motivo))
   where s.id = any(ids);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_cancelar(uuid[], text, text) from public, anon;
grant execute on function public.terceiros_cancelar(uuid[], text, text) to authenticated;

-- ── os tipos de partida (o Admin muda, acrescenta e desativa pela tela) ─────────────────────────────────────────────────────────────────────────
-- quem_marca_data = adaptacao: película, plotagem e pintura (decidido pelo usuário). O local padrão só está preenchido onde não há dúvida (película e plotagem a equipe faz na fábrica; corte e dobra
-- e pintura eletrostática as peças vão ao prestador); nos demais a pessoa escolhe em cada serviço. Pintura eletrostática não é "da Adaptação": é peça que vem da Engenharia, da Serralheria ou do Almoxarifado.
insert into public.terceiros_tipos (nome, nome_norm, quem_marca_data, onde_padrao, usa_ordem_em_lote, ordem, criado_por) values
  ('Película',              'pelicula',              'adaptacao',   'fabrica',   false, 10,  'Sistema'),
  ('Plotagem',              'plotagem',              'adaptacao',   'fabrica',   false, 20,  'Sistema'),
  ('Pintura',               'pintura',               'adaptacao',   null,        false, 30,  'Sistema'),
  ('Blindagem',             'blindagem',             'solicitante', null,        false, 40,  'Sistema'),
  ('Lavagem',               'lavagem',               'solicitante', null,        false, 50,  'Sistema'),
  ('Funilaria',             'funilaria',             'solicitante', null,        false, 60,  'Sistema'),
  ('Mecânica',              'mecanica',              'solicitante', null,        false, 70,  'Sistema'),
  ('Corte e dobra',         'corte e dobra',         'solicitante', 'prestador', false, 80,  'Sistema'),
  ('Pintura eletrostática', 'pintura eletrostatica', 'solicitante', 'prestador', true,  90,  'Sistema'),
  ('Outro',                 'outro',                 'solicitante', null,        false, 999, 'Sistema')
on conflict (nome_norm) do nothing;
