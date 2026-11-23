-- SERVIÇOS DE TERCEIROS — fatia T4 (banco): o modelo do contrato e a ordem de serviço em lote da pintura eletrostática (23/11/2026; PLANO_SERVICOS_TERCEIROS.md, seções 4.5 e 4.6).
-- Decidido com o usuário em 23/11/2026 (as quatro perguntas da T4):
--  • o lote SEGUE a ordem: o prestador e o dia da ordem valem para todos os serviços dela, que andam juntos para "Agendado"; tirar serviço só até a ordem ser enviada; no retorno a ordem fecha todos
--    de uma vez (cada serviço com o seu valor final e quem conferiu);
--  • a ordem só vira "Enviada" com a cópia assinada anexada; antes disso fica "montada" (aguardando assinatura);
--  • quem monta, envia e fecha a ordem: Admin, gerentes e Adaptação (quem só pediu o serviço vê a ordem e o selo, não mexe nela);
--  • um contrato por VISITA, com a lista dos carros (o texto das cláusulas e os dados das empresas moram em `terceiros_config`, que só o Admin altera).
-- Suposições minhas, a confirmar (dúvida 12 do plano): número da ordem `OT-00001`; a previsão de retorno é obrigatória; durante o envio o serviço mostra como dia marcado o do retorno previsto (para o "atrasado"
-- valer para o retorno e não para o dia em que as peças saíram); serviço que está numa ordem não se agenda, reabre, cancela nem altera pela tela do serviço (só pela ordem); a ordem enviada não se cancela.
-- Custo do banco: uma tabela de configuração (uma linha), uma tabela de ordens (poucas linhas), uma coluna e um índice na tabela dos serviços, a função do Calendário (só leitura) e as cinco funções de gravação dos serviços,
-- que ganham uma conferência a mais. Nenhuma política de tabela que já existia é tocada. Reverter: terceiros_servicos_t4_reverter.sql.

-- ═══ 1. O MODELO DO CONTRATO (uma linha só; todo mundo que entrou lê, só o Admin grava, pela função) ═══════════════════════════════════════════════
create table if not exists public.terceiros_config (
  id integer primary key default 1 check (id = 1),
  empresas jsonb not null default '[]'::jsonb,        -- quem contrata o serviço: [{id, nome, razao_social, cnpj, endereco, telefone, email}] (ACN e DETECH)
  clausulas text not null default '',                  -- o texto do contrato: UMA cláusula por linha (a impressão numera)
  aprovada boolean not null default false,             -- enquanto o Admin não aprova, a impressão sai com a faixa "MINUTA — ainda não aprovada"
  aprovada_por text,
  aprovada_em timestamptz,
  atualizado_em timestamptz,
  atualizado_por text
);

alter table public.terceiros_config enable row level security;
drop policy if exists etapa17_logado on public.terceiros_config;
create policy etapa17_logado on public.terceiros_config for select to authenticated using ((select public.esta_logado()));   -- só leitura: a gravação é a função abaixo

insert into public.terceiros_config (id, empresas, clausulas, aprovada) values (
  1,
  '[{"id":"acn","nome":"ACN","razao_social":"","cnpj":"","endereco":"Rua Osvaldo Souza, 104 — Aririu, Palhoça - SC — CEP 88135-028","telefone":"(48) 3240-0336","email":"acn@acn.com.br"},
    {"id":"detech","nome":"DETECH","razao_social":"","cnpj":"","endereco":"","telefone":"","email":""}]'::jsonb,
  $clausulas$Do objeto: o PRESTADOR executará para a CONTRATANTE o serviço descrito neste documento, nas peças ou veículos indicados, no dia e no local combinados.
Do preço: pelo serviço, a CONTRATANTE pagará ao PRESTADOR o valor combinado indicado neste documento. Valor diferente do combinado só vale se o PRESTADOR avisar e a CONTRATANTE aceitar antes da execução.
Do pagamento: o pagamento será feito depois da conclusão e da conferência do serviço pela CONTRATANTE, mediante nota fiscal ou recibo do PRESTADOR, na forma e no prazo combinados entre as partes.
Da execução: o PRESTADOR executará o serviço com técnica e material adequados, seguindo as especificações e os desenhos entregues pela CONTRATANTE, e responderá pelos profissionais que utilizar.
Do prazo: o serviço será executado, e as peças ou veículos devolvidos, até o dia indicado neste documento. Havendo atraso, o PRESTADOR avisará a CONTRATANTE assim que souber.
Da guarda das peças e veículos: enquanto estiverem com o PRESTADOR, as peças e os veículos da CONTRATANTE ficam sob sua guarda e responsabilidade e serão devolvidos nas condições em que foram recebidos, salvo o serviço contratado. Danos, extravios ou perdas nesse período serão reparados pelo PRESTADOR.
Da conferência: ao receber o serviço, a CONTRATANTE conferirá o resultado. Havendo defeito de execução, o PRESTADOR o corrigirá sem custo adicional, em prazo combinado entre as partes.
Da garantia: o PRESTADOR garante o serviço executado contra defeitos de execução, pelo prazo combinado entre as partes ou, na falta dele, pelo previsto em lei.
Do sigilo: o PRESTADOR não divulgará desenhos, projetos e informações da CONTRATANTE a que tiver acesso para executar o serviço, nem os usará para outro fim.
Do foro: as partes elegem o foro da comarca da sede da CONTRATANTE para resolver qualquer dúvida deste documento.$clausulas$,
  false)
on conflict (id) do nothing;

-- a única porta de gravação do modelo: só o Admin; qualquer mudança no texto ou nas empresas tira a aprovação, e "aprovar" vale para o texto que está sendo salvo
create or replace function public.terceiros_config_salvar(p_empresas jsonb, p_clausulas text, p_aprovar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); c public.terceiros_config; el jsonb; k text; v_id text; v_ids text[] := '{}';
  v_claus text := btrim(coalesce(p_clausulas, '')); v_mudou boolean;
begin
  if a is null or not public.eh_admin() then raise exception 'Só o Admin altera o modelo do contrato.' using errcode = '42501'; end if;
  if p_empresas is null or jsonb_typeof(p_empresas) <> 'array' or jsonb_array_length(p_empresas) not between 1 and 6 then
    raise exception 'Informe de 1 a 6 empresas (as que contratam o serviço).';
  end if;
  for el in select value from jsonb_array_elements(p_empresas) loop
    if jsonb_typeof(el) <> 'object' then raise exception 'Cada empresa deve ter um nome e os seus dados.'; end if;
    v_id := btrim(coalesce(el ->> 'id', ''));
    if v_id !~ '^[a-z0-9_]{2,20}$' then raise exception 'O código da empresa deve ter de 2 a 20 letras minúsculas, números ou sublinhado.'; end if;
    if v_id = any(v_ids) then raise exception 'Há duas empresas com o mesmo código (%).', v_id; end if;
    v_ids := v_ids || v_id;
    if btrim(coalesce(el ->> 'nome', '')) = '' then raise exception 'Toda empresa precisa de um nome.'; end if;
    for k in select jsonb_object_keys(el) loop
      if k not in ('id', 'nome', 'razao_social', 'cnpj', 'endereco', 'telefone', 'email') then raise exception 'O campo "%" não existe no cadastro da empresa.', k; end if;
      if jsonb_typeof(el -> k) <> 'string' or length(el ->> k) > 300 then raise exception 'O campo "%" da empresa % deve ser um texto de até 300 letras.', k, v_id; end if;
    end loop;
  end loop;
  if length(v_claus) < 20 then raise exception 'Escreva o texto do contrato (as cláusulas, uma por linha).'; end if;
  if length(v_claus) > 20000 then raise exception 'O texto do contrato passa de 20.000 letras.'; end if;
  select * into c from public.terceiros_config where id = 1 for update;
  if not found then
    insert into public.terceiros_config (id) values (1) returning * into c;
  end if;
  v_mudou := c.empresas is distinct from p_empresas or c.clausulas is distinct from v_claus;
  if not v_mudou and not coalesce(p_aprovar, false) then return to_jsonb(c); end if;   -- nada mudou e ninguém aprovou: a aprovação que já existe continua
  update public.terceiros_config set empresas = p_empresas, clausulas = v_claus,
         aprovada = coalesce(p_aprovar, false), aprovada_por = case when coalesce(p_aprovar, false) then a ->> 'autor' else null end,
         aprovada_em = case when coalesce(p_aprovar, false) then now() else null end,
         atualizado_em = now(), atualizado_por = a ->> 'autor'
   where id = 1 returning * into c;
  return to_jsonb(c);
end $function$;
revoke all on function public.terceiros_config_salvar(jsonb, text, boolean) from public, anon;
grant execute on function public.terceiros_config_salvar(jsonb, text, boolean) to authenticated;

-- ═══ 2. A ORDEM DE SERVIÇO EM LOTE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
create sequence if not exists public.terceiros_ordem_seq;

create table if not exists public.terceiros_ordens (
  id uuid primary key default gen_random_uuid(),
  numero text not null,                                 -- OT-00001, dado pelo banco (gatilho abaixo)
  prestador_id uuid not null references public.terceiros_prestadores(id) on delete restrict,
  status text not null default 'montada' check (status in ('montada', 'enviada', 'fechada', 'cancelada')),   -- montada = aguardando assinatura
  status_desde timestamptz not null default now(),
  data_envio_prevista date not null,                    -- o dia em que as peças vão ao prestador (e, enquanto a ordem espera, o dia marcado dos serviços)
  previsao_retorno date not null,
  data_envio_real date,
  data_retorno_real date,
  copias jsonb not null default '[]'::jsonb,            -- as páginas da cópia assinada: [{caminho, nome, tamanho, por, em}], mesma regra dos anexos do serviço
  observacao text,
  cancelado_motivo text,
  cancelado_em timestamptz,
  cancelado_por text,
  enviada_em timestamptz,
  enviada_por text,
  fechada_em timestamptz,
  fechada_por text,
  historico jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  constraint terceiros_ordens_datas_ck check (previsao_retorno >= data_envio_prevista),
  constraint terceiros_ordens_enviada_ck check (status not in ('enviada', 'fechada') or (data_envio_real is not null and jsonb_array_length(copias) > 0 and enviada_em is not null)),
  constraint terceiros_ordens_fechada_ck check (status <> 'fechada' or (data_retorno_real is not null and fechada_em is not null)),
  constraint terceiros_ordens_cancelada_ck check (status <> 'cancelada' or (cancelado_motivo is not null and cancelado_em is not null))
);
create unique index if not exists terceiros_ordens_numero_uk on public.terceiros_ordens (numero);
create index if not exists terceiros_ordens_status_idx on public.terceiros_ordens (status, previsao_retorno);
create index if not exists terceiros_ordens_prestador_idx on public.terceiros_ordens (prestador_id);

create or replace function public.terceiros_ordem_numerar()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := 'OT-' || lpad(nextval('public.terceiros_ordem_seq')::text, 5, '0');
  end if;
  return new;
end $function$;
revoke all on function public.terceiros_ordem_numerar() from public, anon, authenticated;   -- função de gatilho: dispara sem esse direito
drop trigger if exists terceiros_ordem_numerar on public.terceiros_ordens;
create trigger terceiros_ordem_numerar before insert on public.terceiros_ordens for each row execute function public.terceiros_ordem_numerar();

-- o serviço guarda a ordem em que está (a ordem fechada continua apontada, para o rastro; a cancelada solta os serviços)
alter table public.terceiros_servicos add column if not exists ordem_id uuid references public.terceiros_ordens(id) on delete restrict;
create index if not exists terceiros_servicos_ordem_idx on public.terceiros_servicos (ordem_id) where ordem_id is not null;

alter table public.terceiros_ordens enable row level security;
drop policy if exists etapa17_logado on public.terceiros_ordens;
create policy etapa17_logado on public.terceiros_ordens for select to authenticated using ((select public.esta_logado()));   -- só leitura: não há política de gravação

revoke all on table public.terceiros_config, public.terceiros_ordens from anon;
revoke insert, update, delete, truncate, references, trigger on table public.terceiros_config, public.terceiros_ordens from authenticated;
revoke usage, select, update on sequence public.terceiros_ordem_seq from anon, authenticated;

comment on table public.terceiros_config is 'Modelo do contrato dos serviços de terceiros: as empresas que contratam e o texto das cláusulas. Só leitura para a tela; o Admin grava pela função terceiros_config_salvar.';
comment on table public.terceiros_ordens is 'Ordem de serviço em lote dos serviços de terceiros (pintura eletrostática). Só leitura para a tela; a gravação passa pelas funções terceiros_ordem_*.';

-- ═══ 3. AS CONFERÊNCIAS QUE AS FUNÇÕES DA ORDEM E DOS SERVIÇOS REPARTEM ═══════════════════════════════════════════════════════════════════════════
-- quem mexe na ordem: Admin, gerentes e Adaptação (decidido com o usuário em 23/11/2026; a mesma conta de terceiros_pode_gerir_prestadores)
create or replace function public.terceiros_pode_ordem(a jsonb)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select a is not null and (coalesce((a ->> 'diretoria')::boolean, false) or coalesce((a ->> 'adaptacao')::boolean, false));
$function$;
revoke all on function public.terceiros_pode_ordem(jsonb) from public, anon, authenticated;

-- o prestador faz este tipo? (a lista de tipos vazia vale "faz todos", como a tela)
create or replace function public.terceiros_prestador_faz(p_prestador uuid, p_tipo uuid)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $function$
  select coalesce((select coalesce(array_length(p.tipos_ids, 1), 0) = 0 or p_tipo = any(p.tipos_ids) from public.terceiros_prestadores p where p.id = p_prestador), false);
$function$;
revoke all on function public.terceiros_prestador_faz(uuid, uuid) from public, anon, authenticated;

-- serviço que está numa ordem montada ou enviada anda COM a ordem: as funções dos serviços (agendar, realizar, voltar, cancelar e alterar) recusam, e a frase diz o caminho
create or replace function public.terceiros_recusar_se_em_ordem(p_ids uuid[])
returns void language plpgsql stable set search_path to 'public', 'pg_temp' as $function$
declare r record;
begin
  select s.numero as servico, o.numero as ordem into r
    from public.terceiros_servicos s join public.terceiros_ordens o on o.id = s.ordem_id
   where s.id = any(p_ids) and o.status in ('montada', 'enviada') order by s.numero limit 1;
  if found then
    raise exception 'O serviço % faz parte da ordem % e anda junto com ela. Para mexer nele, tire-o da ordem (só antes de ela ser enviada) ou use a própria ordem.', r.servico, r.ordem;
  end if;
end $function$;
revoke all on function public.terceiros_recusar_se_em_ordem(uuid[]) from public, anon, authenticated;

-- confere se estes serviços podem entrar numa ordem do prestador: situação, tipo com ordem em lote, prestador que faz o tipo, e não estar em outra ordem
create or replace function public.terceiros_validar_para_ordem(p_ids uuid[], p_prestador_id uuid)
returns void language plpgsql stable set search_path to 'public', 'pg_temp' as $function$
declare r record;
begin
  for r in select s.numero, s.status, s.tipo_id, o.numero as ordem_numero, o.status as ordem_status, t.nome as tipo_nome, t.usa_ordem_em_lote
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id left join public.terceiros_ordens o on o.id = s.ordem_id
            where s.id = any(p_ids) order by s.numero loop
    if r.status not in ('solicitado', 'agendado') then
      raise exception 'Serviço %: só entra na ordem o serviço que está em "A definir" ou em "Agendado" (agora: %).', r.numero, case r.status when 'realizado' then 'Realizado' when 'cancelado' then 'Cancelado' else r.status end;
    end if;
    if r.ordem_status in ('montada', 'enviada') then raise exception 'O serviço % já está na ordem %.', r.numero, r.ordem_numero; end if;
    if not r.usa_ordem_em_lote then raise exception 'Serviço %: o tipo "%" não usa ordem de serviço em lote.', r.numero, r.tipo_nome; end if;
    if not public.terceiros_prestador_faz(p_prestador_id, r.tipo_id) then raise exception 'O prestador escolhido não faz o tipo "%" (serviço %).', r.tipo_nome, r.numero; end if;
  end loop;
end $function$;
revoke all on function public.terceiros_validar_para_ordem(uuid[], uuid) from public, anon, authenticated;

-- põe os serviços na ordem: prestador e dia da ordem, período "dia todo", Agendado (o que já estava agendado guarda o dia de antes no histórico)
create or replace function public.terceiros_incluir_na_ordem(o public.terceiros_ordens, p_ids uuid[], p_autor text)
returns void language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_prest text;
begin
  select nome into v_prest from public.terceiros_prestadores where id = o.prestador_id;
  update public.terceiros_servicos s set
         ordem_id = o.id, prestador_id = o.prestador_id, status = 'agendado', status_desde = case when s.status = 'agendado' then s.status_desde else now() end,
         data_agendada = o.data_envio_prevista, periodo = 'dia_todo', atualizado_em = now(), atualizado_por = p_autor,
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', p_autor, 'acao', 'em_ordem',
           'detalhe', 'Entrou na ordem ' || o.numero || ' — ' || coalesce(v_prest, 'prestador') || ', peças para ' || to_char(o.data_envio_prevista, 'DD/MM/YYYY') || ', retorno previsto ' || to_char(o.previsao_retorno, 'DD/MM/YYYY')
              || case when s.status = 'agendado' and s.data_agendada is not null then ' (estava agendado para ' || to_char(s.data_agendada, 'DD/MM/YYYY') || ')' else '' end))
   where s.id = any(p_ids);
end $function$;
revoke all on function public.terceiros_incluir_na_ordem(public.terceiros_ordens, uuid[], text) from public, anon, authenticated;

-- tira os serviços da ordem: voltam para "A definir", sem dia e sem ordem (o prestador fica; a pessoa muda se quiser)
create or replace function public.terceiros_soltar_da_ordem(o public.terceiros_ordens, p_ids uuid[], p_autor text, p_motivo text)
returns void language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  update public.terceiros_servicos s set
         ordem_id = null, status = 'solicitado', status_desde = now(), data_agendada = null, periodo = null, atualizado_em = now(), atualizado_por = p_autor,
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', p_autor, 'acao', 'saiu_da_ordem',
           'detalhe', 'Saiu da ordem ' || o.numero || ' e voltou para "A definir". Motivo: ' || p_motivo))
   where s.id = any(p_ids) and s.ordem_id = o.id;
end $function$;
revoke all on function public.terceiros_soltar_da_ordem(public.terceiros_ordens, uuid[], text, text) from public, anon, authenticated;

-- ═══ 4. AS CINCO FUNÇÕES DOS SERVIÇOS, COM A TRAVA DA ORDEM ═══════════════════════════════════════════════════════════════════════════════════════
-- As mesmas funções da T1 (agendar, realizar, voltar, cancelar) e da T2 (atualizar), palavra por palavra, com UMA linha a mais depois de achar os serviços:
-- se algum deles está numa ordem montada ou enviada, a função recusa e diz o caminho (terceiros_recusar_se_em_ordem). terceiros_atualizar_varios chama terceiros_atualizar
-- serviço a serviço, então herda a trava sem mudar.

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
  perform public.terceiros_recusar_se_em_ordem(ids);   -- T4: o serviço que está numa ordem anda com ela
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
  perform public.terceiros_recusar_se_em_ordem(ids);   -- T4: o serviço que está numa ordem anda com ela
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
  perform public.terceiros_recusar_se_em_ordem(ids);   -- T4: o serviço que está numa ordem anda com ela
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
  perform public.terceiros_recusar_se_em_ordem(ids);   -- T4: o serviço que está numa ordem anda com ela
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

create or replace function public.terceiros_atualizar(p_id uuid, p_dados jsonb, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje();
  s public.terceiros_servicos; t public.terceiros_tipos; k text;
  v_desc text; v_prest uuid; v_valor numeric; v_onde text; v_desejada date; v_obs text; v_pecas jsonb; v_anexos jsonb; v_entrou text; v_saiu text;
  mudancas text := ''; nome_ant text; nome_novo text;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode alterar um serviço.' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe o que mudar.'; end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k not in ('descricao', 'prestador_id', 'valor_combinado', 'onde', 'data_desejada', 'observacao', 'pecas', 'anexos') then
      raise exception 'O campo "%" não pode ser alterado por aqui.', k;
    end if;
  end loop;
  select * into s from public.terceiros_servicos where id = p_id for update;
  if not found then raise exception 'Serviço não encontrado. Atualize a tela.'; end if;
  perform public.terceiros_recusar_se_em_ordem(array[p_id]);   -- T4: o serviço que está numa ordem anda com ela
  if s.status is distinct from p_status_esperado then
    raise exception 'O serviço % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', s.numero, s.status;
  end if;
  if s.status not in ('solicitado', 'agendado') then raise exception 'O serviço % já está encerrado (%). Um gerente pode reabri-lo.', s.numero, s.status; end if;
  select * into t from public.terceiros_tipos where id = s.tipo_id;
  if not public.terceiros_pode_mexer(a, t.quem_marca_data, s.solicitante_id) then
    raise exception 'Só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin alteram este serviço.' using errcode = '42501';
  end if;
  v_desc := s.descricao; v_prest := s.prestador_id; v_valor := s.valor_combinado; v_onde := s.onde; v_desejada := s.data_desejada; v_obs := s.observacao; v_pecas := s.pecas; v_anexos := s.anexos;

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
  if p_dados ? 'anexos' then
    -- a tela manda a lista INTEIRA de volta (com os que ficaram e os novos); quem já estava mantém quem anexou e quando
    v_anexos := public.terceiros_limpar_anexos(p_dados->'anexos', s.anexos, a->>'autor');
    if v_anexos is distinct from s.anexos then
      select string_agg(e->>'nome', ', ') into v_entrou from jsonb_array_elements(v_anexos) e where not exists (select 1 from jsonb_array_elements(s.anexos) o where o->>'caminho' = e->>'caminho');
      select string_agg(o->>'nome', ', ') into v_saiu from jsonb_array_elements(s.anexos) o where not exists (select 1 from jsonb_array_elements(v_anexos) e where e->>'caminho' = o->>'caminho');
      mudancas := mudancas || '; anexos' || case when v_entrou is not null then ' (entrou: ' || v_entrou || ')' else '' end || case when v_saiu is not null then ' (saiu: ' || v_saiu || ')' else '' end;
    end if;
  end if;
  if mudancas = '' then return to_jsonb(s); end if;   -- nada mudou: não grava nem sujeita o histórico

  update public.terceiros_servicos x set descricao = v_desc, prestador_id = v_prest, valor_combinado = v_valor, onde = v_onde, data_desejada = v_desejada, observacao = v_obs, pecas = v_pecas, anexos = v_anexos,
         atualizado_em = now(), atualizado_por = a->>'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'alterado', 'detalhe', substr(mudancas, 3)))
   where x.id = p_id returning * into s;
  return to_jsonb(s);
end $function$;
revoke all on function public.terceiros_atualizar(uuid, jsonb, text) from public, anon;
grant execute on function public.terceiros_atualizar(uuid, jsonb, text) to authenticated;

-- ═══ 5. AS FUNÇÕES DA ORDEM (tudo ou nada; conferem quem pode, a situação de antes e deixam histórico na ordem e em cada serviço) ═══════════════════════════════
-- Todas devolvem {ordem, servicos}: a linha da ordem (sem o histórico, que a tela lê à parte) e as linhas dos serviços que mudaram.

-- ── montar: junta serviços numa ordem nova (o prestador e o dia da ordem valem para todos; eles passam a "Agendado") ──────────────────────────────────
create or replace function public.terceiros_ordem_montar(p_servicos uuid[], p_prestador_id uuid, p_data_envio date, p_previsao_retorno date, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje(); ids uuid[]; achados int; v_prest text;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), ''); o public.terceiros_ordens;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode montar uma ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação montam a ordem de serviço em lote.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_servicos, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço para a ordem.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Uma ordem leva no máximo 100 serviços.'; end if;
  if p_prestador_id is null then raise exception 'Escolha o prestador da ordem.'; end if;
  select nome into v_prest from public.terceiros_prestadores where id = p_prestador_id and ativo;
  if not found then raise exception 'O prestador escolhido não existe ou está inativo.'; end if;
  if p_data_envio is null then raise exception 'Informe o dia em que as peças vão ao prestador.'; end if;
  if p_data_envio < hoje then raise exception 'O dia do envio não pode ser anterior a hoje.'; end if;
  if p_previsao_retorno is null then raise exception 'Informe a previsão de retorno das peças.'; end if;
  if p_previsao_retorno < p_data_envio then raise exception 'A previsão de retorno não pode ser anterior ao dia do envio.'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  perform public.terceiros_validar_para_ordem(ids, p_prestador_id);
  insert into public.terceiros_ordens (prestador_id, data_envio_prevista, previsao_retorno, observacao, historico, criado_por, atualizado_por)
  values (p_prestador_id, p_data_envio, p_previsao_retorno, v_obs,
          jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'montada',
            'detalhe', v_prest || ' — ' || array_length(ids, 1)::text || ' serviço(s); peças para ' || to_char(p_data_envio, 'DD/MM/YYYY') || ', retorno previsto ' || to_char(p_previsao_retorno, 'DD/MM/YYYY'))),
          a ->> 'autor', a ->> 'autor')
  returning * into o;
  perform public.terceiros_incluir_na_ordem(o, ids, a ->> 'autor');
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_montar(uuid[], uuid, date, date, text) from public, anon;
grant execute on function public.terceiros_ordem_montar(uuid[], uuid, date, date, text) to authenticated;

-- ── incluir: mais serviços numa ordem que ainda espera a assinatura ────────────────────────────────────────────────────────────────────────────────
create or replace function public.terceiros_ordem_incluir(p_id uuid, p_servicos uuid[], p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); ids uuid[]; achados int; o public.terceiros_ordens;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode mexer numa ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação mexem na ordem de serviço em lote.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_servicos, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço para incluir.'; end if;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status <> 'montada' then raise exception 'Só se inclui serviço na ordem que ainda espera a assinatura (a ordem % está "%").', o.numero, o.status; end if;
  if (select count(*) from public.terceiros_servicos where ordem_id = o.id) + array_length(ids, 1) > 100 then raise exception 'Uma ordem leva no máximo 100 serviços.'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  perform public.terceiros_validar_para_ordem(ids, o.prestador_id);
  perform public.terceiros_incluir_na_ordem(o, ids, a ->> 'autor');
  update public.terceiros_ordens x set atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'incluiu',
           'detalhe', array_length(ids, 1)::text || ' serviço(s): ' || left((select string_agg(s.numero, ', ' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), 300)))
   where x.id = o.id returning * into o;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_incluir(uuid, uuid[], text) from public, anon;
grant execute on function public.terceiros_ordem_incluir(uuid, uuid[], text) to authenticated;

-- ── tirar: serviços saem da ordem (só antes de ela ser enviada) e voltam para "A definir"; a ordem não pode ficar vazia ─────────────────────────────────
create or replace function public.terceiros_ordem_tirar(p_id uuid, p_servicos uuid[], p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); ids uuid[]; o public.terceiros_ordens; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if a is null then raise exception 'Só quem entrou no sistema pode mexer numa ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação mexem na ordem de serviço em lote.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_servicos, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço para tirar da ordem.'; end if;
  if length(v_motivo) < 5 then raise exception 'Informe o motivo (pelo menos 5 letras).'; end if;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status <> 'montada' then raise exception 'Só se tira serviço da ordem antes de ela ser enviada (a ordem % está "%").', o.numero, o.status; end if;
  perform 1 from public.terceiros_servicos where ordem_id = o.id order by id for update;
  if (select count(*) from public.terceiros_servicos where id = any(ids) and ordem_id = o.id) <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não está nesta ordem. Atualize a tela.'; end if;
  if (select count(*) from public.terceiros_servicos where ordem_id = o.id and not (id = any(ids))) = 0 then
    raise exception 'A ordem não pode ficar sem serviços. Para desfazer tudo, cancele a ordem.';
  end if;
  perform public.terceiros_soltar_da_ordem(o, ids, a ->> 'autor', v_motivo);
  update public.terceiros_ordens x set atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'tirou',
           'detalhe', array_length(ids, 1)::text || ' serviço(s): ' || left((select string_agg(s.numero, ', ' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), 300) || '. Motivo: ' || v_motivo))
   where x.id = o.id returning * into o;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_tirar(uuid, uuid[], text, text) from public, anon;
grant execute on function public.terceiros_ordem_tirar(uuid, uuid[], text, text) to authenticated;

-- ── atualizar: prestador, dia do envio e previsão de retorno (a ordem que espera a assinatura), previsão e observação (a enviada), troca da cópia (a enviada) ──
create or replace function public.terceiros_ordem_atualizar(p_id uuid, p_dados jsonb, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje(); o public.terceiros_ordens; k text; r record;
  v_prest uuid; v_envio date; v_ret date; v_obs text; v_copias jsonb; mudancas text := ''; nome_ant text; nome_novo text; v_mexe_nos_servicos boolean := false; ids uuid[];
begin
  if a is null then raise exception 'Só quem entrou no sistema pode mexer numa ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação mexem na ordem de serviço em lote.' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe o que mudar.'; end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k not in ('prestador_id', 'data_envio_prevista', 'previsao_retorno', 'observacao', 'copias') then raise exception 'O campo "%" não pode ser alterado por aqui.', k; end if;
  end loop;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status not in ('montada', 'enviada') then raise exception 'A ordem % já está encerrada (%).', o.numero, o.status; end if;
  perform 1 from public.terceiros_servicos where ordem_id = o.id order by id for update;
  v_prest := o.prestador_id; v_envio := o.data_envio_prevista; v_ret := o.previsao_retorno; v_obs := o.observacao; v_copias := o.copias;

  if p_dados ? 'prestador_id' then
    if o.status <> 'montada' then raise exception 'O prestador só muda enquanto a ordem espera a assinatura.'; end if;
    v_prest := nullif(p_dados ->> 'prestador_id', '')::uuid;
    if v_prest is null then raise exception 'A ordem precisa de um prestador.'; end if;
    perform 1 from public.terceiros_prestadores where id = v_prest and ativo;
    if not found then raise exception 'O prestador escolhido não existe ou está inativo.'; end if;
    if v_prest is distinct from o.prestador_id then
      for r in select s.numero, t.nome as tipo_nome, s.tipo_id from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.ordem_id = o.id order by s.numero loop
        if not public.terceiros_prestador_faz(v_prest, r.tipo_id) then raise exception 'O prestador escolhido não faz o tipo "%" (serviço %).', r.tipo_nome, r.numero; end if;
      end loop;
      select nome into nome_ant from public.terceiros_prestadores where id = o.prestador_id;
      select nome into nome_novo from public.terceiros_prestadores where id = v_prest;
      mudancas := mudancas || '; prestador: ' || coalesce(nome_ant, '—') || ' → ' || coalesce(nome_novo, '—');
      v_mexe_nos_servicos := true;
    end if;
  end if;
  if p_dados ? 'data_envio_prevista' then
    if o.status <> 'montada' then raise exception 'O dia do envio só muda enquanto a ordem espera a assinatura (depois do envio vale o dia real).'; end if;
    v_envio := nullif(p_dados ->> 'data_envio_prevista', '')::date;
    if v_envio is null then raise exception 'Informe o dia em que as peças vão ao prestador.'; end if;
    if v_envio is distinct from o.data_envio_prevista then
      if v_envio < hoje then raise exception 'O dia do envio não pode ser anterior a hoje.'; end if;
      mudancas := mudancas || '; dia do envio: ' || to_char(o.data_envio_prevista, 'DD/MM/YYYY') || ' → ' || to_char(v_envio, 'DD/MM/YYYY');
      v_mexe_nos_servicos := true;
    end if;
  end if;
  if p_dados ? 'previsao_retorno' then
    v_ret := nullif(p_dados ->> 'previsao_retorno', '')::date;
    if v_ret is null then raise exception 'Informe a previsão de retorno das peças.'; end if;
    if v_ret is distinct from o.previsao_retorno then
      mudancas := mudancas || '; previsão de retorno: ' || to_char(o.previsao_retorno, 'DD/MM/YYYY') || ' → ' || to_char(v_ret, 'DD/MM/YYYY');
      if o.status = 'enviada' then v_mexe_nos_servicos := true; end if;   -- durante o envio o dia marcado dos serviços é o do retorno previsto
    end if;
  end if;
  if v_ret < v_envio then raise exception 'A previsão de retorno não pode ser anterior ao dia do envio.'; end if;
  if o.status = 'enviada' and v_ret < o.data_envio_real then raise exception 'A previsão de retorno não pode ser anterior ao dia em que as peças foram enviadas (%).', to_char(o.data_envio_real, 'DD/MM/YYYY'); end if;
  if p_dados ? 'observacao' then
    v_obs := nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '');
    if v_obs is distinct from o.observacao then mudancas := mudancas || '; observação'; end if;
  end if;
  if p_dados ? 'copias' then
    if o.status <> 'enviada' then raise exception 'A cópia assinada entra junto com o envio das peças.'; end if;
    v_copias := public.terceiros_limpar_anexos(p_dados -> 'copias', o.copias, a ->> 'autor');
    if jsonb_array_length(v_copias) = 0 then raise exception 'A ordem enviada precisa da cópia assinada: troque o arquivo, não o tire.'; end if;
    if v_copias is distinct from o.copias then mudancas := mudancas || '; cópia assinada trocada'; end if;
  end if;
  if mudancas = '' then
    return jsonb_build_object('ordem', to_jsonb(o) - 'historico', 'servicos', '[]'::jsonb);   -- nada mudou: não grava nem sujeita o histórico
  end if;

  update public.terceiros_ordens x set prestador_id = v_prest, data_envio_prevista = v_envio, previsao_retorno = v_ret, observacao = v_obs, copias = v_copias,
         atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'alterada', 'detalhe', substr(mudancas, 3)))
   where x.id = o.id returning * into o;
  ids := array(select s.id from public.terceiros_servicos s where s.ordem_id = o.id);
  if v_mexe_nos_servicos then
    update public.terceiros_servicos s set prestador_id = o.prestador_id, data_agendada = case when o.status = 'montada' then o.data_envio_prevista else o.previsao_retorno end,
           atualizado_em = now(), atualizado_por = a ->> 'autor',
           historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'reagendado', 'detalhe', 'Ordem ' || o.numero || ' alterada: ' || substr(mudancas, 3)))
     where s.ordem_id = o.id;
  end if;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', case when v_mexe_nos_servicos then coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb) else '[]'::jsonb end);
end $function$;
revoke all on function public.terceiros_ordem_atualizar(uuid, jsonb, text) from public, anon;
grant execute on function public.terceiros_ordem_atualizar(uuid, jsonb, text) to authenticated;

-- ── enviar: a cópia assinada anexada e o dia real em que as peças saíram; a ordem passa a "Enviada" e os serviços passam a esperar o retorno ──────────────
create or replace function public.terceiros_ordem_enviar(p_id uuid, p_copias jsonb, p_data_envio_real date, p_previsao_retorno date, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje(); o public.terceiros_ordens; v_copias jsonb; v_ret date; ids uuid[];
begin
  if a is null then raise exception 'Só quem entrou no sistema pode enviar uma ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação enviam a ordem de serviço em lote.' using errcode = '42501'; end if;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status <> 'montada' then raise exception 'Só se envia a ordem que está esperando a assinatura (a ordem % está "%").', o.numero, o.status; end if;
  v_copias := public.terceiros_limpar_anexos(p_copias, '[]'::jsonb, a ->> 'autor');
  if jsonb_array_length(v_copias) = 0 then raise exception 'Anexe a cópia assinada pelo prestador: sem ela a ordem não é enviada.'; end if;
  if p_data_envio_real is null then raise exception 'Informe o dia em que as peças foram enviadas.'; end if;
  if p_data_envio_real > hoje then raise exception 'O dia do envio não pode ser no futuro.'; end if;
  if p_data_envio_real < hoje - 60 then raise exception 'O dia do envio está a mais de 60 dias: confira a data.'; end if;
  v_ret := coalesce(p_previsao_retorno, o.previsao_retorno);
  if v_ret < p_data_envio_real then raise exception 'A previsão de retorno não pode ser anterior ao dia do envio. Informe uma nova previsão.'; end if;
  perform 1 from public.terceiros_servicos where ordem_id = o.id order by id for update;
  if exists (select 1 from public.terceiros_servicos where ordem_id = o.id and status <> 'agendado') then
    raise exception 'Algum serviço da ordem % saiu de "Agendado". Atualize a tela e confira os serviços.', o.numero;
  end if;
  -- se as peças saíram antes do dia previsto, o dia previsto recua para o dia real: a previsão de retorno nunca pode ser anterior a ele (terceiros_ordens_datas_ck)
  update public.terceiros_ordens x set status = 'enviada', status_desde = now(), copias = v_copias, data_envio_real = p_data_envio_real, previsao_retorno = v_ret,
         data_envio_prevista = least(x.data_envio_prevista, p_data_envio_real),
         enviada_em = now(), enviada_por = a ->> 'autor', atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'enviada',
           'detalhe', 'Peças enviadas em ' || to_char(p_data_envio_real, 'DD/MM/YYYY') || ', retorno previsto ' || to_char(v_ret, 'DD/MM/YYYY') || ' (' || jsonb_array_length(v_copias)::text || ' arquivo(s) da cópia assinada)'))
   where x.id = o.id returning * into o;
  ids := array(select s.id from public.terceiros_servicos s where s.ordem_id = o.id);
  update public.terceiros_servicos s set data_agendada = o.previsao_retorno, periodo = 'dia_todo', atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'ordem_enviada',
           'detalhe', 'Ordem ' || o.numero || ': peças enviadas em ' || to_char(p_data_envio_real, 'DD/MM/YYYY') || ', retorno previsto ' || to_char(o.previsao_retorno, 'DD/MM/YYYY')))
   where s.ordem_id = o.id;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_enviar(uuid, jsonb, date, date, text) from public, anon;
grant execute on function public.terceiros_ordem_enviar(uuid, jsonb, date, date, text) to authenticated;

-- ── realizar (o retorno): fecha a ordem e dá TODOS os serviços como realizados, cada um com o seu valor final; quem confere é quem está agindo ──────────────
-- p_valores: [{"servico_id": "...", "valor_final": 123.45}, ...] com exatamente os serviços da ordem.
create or replace function public.terceiros_ordem_realizar(p_id uuid, p_data_retorno date, p_valores jsonb, p_observacao text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); hoje date := public.terceiros_hoje(); o public.terceiros_ordens; el jsonb; v_sid uuid; v_txt text; v_val numeric; v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  esperados uuid[]; recebidos uuid[] := '{}'; ids uuid[]; v_total numeric := 0;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode fechar uma ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação fecham a ordem de serviço em lote.' using errcode = '42501'; end if;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status <> 'enviada' then raise exception 'Só se fecha a ordem cujas peças já foram enviadas (a ordem % está "%").', o.numero, o.status; end if;
  if p_data_retorno is null then raise exception 'Informe o dia em que as peças voltaram.'; end if;
  if p_data_retorno > hoje then raise exception 'O dia do retorno não pode ser no futuro.'; end if;
  if p_data_retorno < o.data_envio_real then raise exception 'O dia do retorno não pode ser anterior ao do envio (%).', to_char(o.data_envio_real, 'DD/MM/YYYY'); end if;
  if p_valores is null or jsonb_typeof(p_valores) <> 'array' then raise exception 'Informe o valor final de cada serviço da ordem.'; end if;
  perform 1 from public.terceiros_servicos where ordem_id = o.id order by id for update;
  esperados := array(select s.id from public.terceiros_servicos s where s.ordem_id = o.id order by s.id);
  if exists (select 1 from public.terceiros_servicos where ordem_id = o.id and status <> 'agendado') then
    raise exception 'Algum serviço da ordem % saiu de "Agendado". Atualize a tela e confira os serviços.', o.numero;
  end if;
  for el in select value from jsonb_array_elements(p_valores) loop
    if jsonb_typeof(el) <> 'object' or coalesce(el ->> 'servico_id', '') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Cada valor deve dizer de qual serviço é.'; end if;
    v_sid := (el ->> 'servico_id')::uuid;
    if v_sid = any(recebidos) then raise exception 'O mesmo serviço veio duas vezes na lista de valores.'; end if;
    v_txt := el ->> 'valor_final';
    if v_txt is null or v_txt !~ '^[0-9]{1,10}(\.[0-9]+)?$' then raise exception 'O valor final de cada serviço deve ser um número, zero ou mais (pode ser 0).'; end if;
    recebidos := recebidos || v_sid;
  end loop;
  if (select coalesce(array_agg(x order by x), '{}'::uuid[]) from unnest(recebidos) x) is distinct from esperados then
    raise exception 'A lista de valores precisa ter exatamente os serviços da ordem % (%).', o.numero, array_length(esperados, 1)::text;
  end if;
  for el in select value from jsonb_array_elements(p_valores) loop
    v_sid := (el ->> 'servico_id')::uuid; v_val := round((el ->> 'valor_final')::numeric, 2); v_total := v_total + v_val;
    update public.terceiros_servicos s set status = 'realizado', status_desde = now(), data_realizada = p_data_retorno, valor_final = v_val,
           conferido_por = a ->> 'autor', conferido_em = now(), atualizado_em = now(), atualizado_por = a ->> 'autor',
           historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'realizado',
             'detalhe', 'Ordem ' || o.numero || ' fechada: feito em ' || to_char(p_data_retorno, 'DD/MM/YYYY') || ' — valor final R$ ' || replace(to_char(v_val, 'FM999999990.00'), '.', ',')
                || case when s.valor_combinado is not null then ' (combinado R$ ' || replace(to_char(s.valor_combinado, 'FM999999990.00'), '.', ',') || ')' else '' end
                || case when v_obs is not null then '. ' || v_obs else '' end))
     where s.id = v_sid and s.ordem_id = o.id;
  end loop;
  update public.terceiros_ordens x set status = 'fechada', status_desde = now(), data_retorno_real = p_data_retorno, fechada_em = now(), fechada_por = a ->> 'autor',
         atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'fechada',
           'detalhe', 'Peças de volta em ' || to_char(p_data_retorno, 'DD/MM/YYYY') || '; ' || array_length(esperados, 1)::text || ' serviço(s) realizados, valor final somado R$ ' || replace(to_char(v_total, 'FM999999990.00'), '.', ',')
              || case when v_obs is not null then '. ' || v_obs else '' end))
   where x.id = o.id returning * into o;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(esperados)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_realizar(uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.terceiros_ordem_realizar(uuid, date, jsonb, text, text) to authenticated;

-- ── cancelar: só a ordem que espera a assinatura; os serviços voltam para "A definir" ─────────────────────────────────────────────────────────────────
create or replace function public.terceiros_ordem_cancelar(p_id uuid, p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); o public.terceiros_ordens; v_motivo text := btrim(coalesce(p_motivo, '')); ids uuid[];
begin
  if a is null then raise exception 'Só quem entrou no sistema pode cancelar uma ordem de serviço.' using errcode = '42501'; end if;
  if not public.terceiros_pode_ordem(a) then raise exception 'Só o Admin, os gerentes e a Adaptação cancelam a ordem de serviço em lote.' using errcode = '42501'; end if;
  if length(v_motivo) < 5 then raise exception 'Informe o motivo do cancelamento (pelo menos 5 letras).'; end if;
  select * into o from public.terceiros_ordens where id = p_id for update;
  if not found then raise exception 'Ordem não encontrada. Atualize a tela.'; end if;
  if o.status is distinct from p_status_esperado then raise exception 'A ordem % mudou de situação enquanto a janela estava aberta (agora: %). Atualize a tela.', o.numero, o.status; end if;
  if o.status <> 'montada' then raise exception 'Só se cancela a ordem que ainda espera a assinatura: com as peças já enviadas, ela precisa ser fechada no retorno (a ordem % está "%").', o.numero, o.status; end if;
  perform 1 from public.terceiros_servicos where ordem_id = o.id order by id for update;
  ids := array(select s.id from public.terceiros_servicos s where s.ordem_id = o.id);
  perform public.terceiros_soltar_da_ordem(o, ids, a ->> 'autor', 'a ordem foi cancelada (' || v_motivo || ')');
  update public.terceiros_ordens x set status = 'cancelada', status_desde = now(), cancelado_motivo = v_motivo, cancelado_em = now(), cancelado_por = a ->> 'autor',
         atualizado_em = now(), atualizado_por = a ->> 'autor',
         historico = x.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a ->> 'autor', 'acao', 'cancelada', 'detalhe', 'Motivo: ' || v_motivo))
   where x.id = o.id returning * into o;
  return jsonb_build_object('ordem', to_jsonb(o) - 'historico',
    'servicos', coalesce((select jsonb_agg(to_jsonb(s) - 'historico' order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_ordem_cancelar(uuid, text, text) from public, anon;
grant execute on function public.terceiros_ordem_cancelar(uuid, text, text) to authenticated;

-- ═══ 6. O CALENDÁRIO: os serviços de uma ordem são UMA visita (as peças de várias vendas vão juntas ao prestador, no mesmo dia) ═════════════════════════
-- A mesma função da T3, com o agrupamento por ordem à frente do agrupamento por venda (o Quadro e a Agenda fazem igual: `chaveDoGrupo` e `chaveDaVisita`, TerceirosFluxo.ts).
create or replace function public.calendario_eventos_terceiros(p_inicio date, p_fim date)
returns table (fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[],
               aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  with adaptacao as (
    -- a equipe da Adaptação: quem tem a aba `producao` (lista vazia = todas as abas), fora o Admin
    select coalesce(array_agg(lower(trim(u.email))), '{}'::text[]) as emails
      from public.auth_usuarios u
     where coalesce(u.ativo, false) and u.perfil <> 'Admin' and nullif(trim(u.email), '') is not null
       and (jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ? 'producao')
  ), v as (
    select s.id, s.numero, s.status, s.tipo_id, s.venda_base, s.prestador_id, s.periodo, s.ligacao_rotulo, s.solicitante_nome,
           t.nome as tipo_nome, t.quem_marca_data, p.nome as prestador_nome, sol.email as solicitante_email,
           s.ordem_id, o.numero as ordem_numero, o.status as ordem_status,
           coalesce('ordem:' || s.ordem_id::text, 'venda:' || s.venda_base, 'servico:' || s.id::text) as visita,
           case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end as dia_do_evento
      from public.terceiros_servicos s
      join public.terceiros_tipos t on t.id = s.tipo_id
      left join public.terceiros_prestadores p on p.id = s.prestador_id
      left join public.auth_usuarios sol on sol.id = s.solicitante_id
      left join public.terceiros_ordens o on o.id = s.ordem_id
     where s.status in ('solicitado', 'agendado', 'realizado')
       and case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end between p_inicio and p_fim
  ), g as (
    -- uma linha por visita: o agrupamento do Quadro (`chaveDoGrupo`, TerceirosFluxo.ts): a ordem, ou a venda, ou o serviço sozinho
    select min(v.id::text) as primeiro_id, count(*)::int as carros, v.status, v.tipo_id, v.dia_do_evento,
           (array_agg(v.tipo_nome))[1] as tipo_nome, (array_agg(v.quem_marca_data))[1] as quem_marca_data, (array_agg(v.venda_base))[1] as venda_base,
           (array_agg(v.ordem_numero))[1] as ordem_numero, (array_agg(v.ordem_status))[1] as ordem_status,
           v.prestador_id, (array_agg(v.prestador_nome))[1] as prestador_nome, case when v.status = 'agendado' then v.periodo end as periodo,
           (array_agg(v.numero order by v.numero))[1] as primeiro_numero, (array_agg(v.ligacao_rotulo order by v.numero))[1] as ligacao_rotulo,
           (array_agg(v.solicitante_nome order by v.numero))[1] as responsavel,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_email)), null) as emails,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_nome)), null) as nomes
      from v
     group by v.status, v.tipo_id, v.visita, v.prestador_id, v.dia_do_evento, case when v.status = 'agendado' then v.periodo end
  )
  select case when g.status = 'solicitado' then 'terceiro_desejado' else 'terceiro_servico' end,
         g.primeiro_id, g.dia_do_evento, null::time,
         g.tipo_nome || ' — '
           || case when g.ordem_numero is not null then 'ordem ' || g.ordem_numero || ' · ' || g.carros || case when g.carros > 1 then ' serviços' else ' serviço' end
                   when g.carros > 1 then g.carros || ' carros' || coalesce(' da venda ' || g.venda_base, '')
                   else g.primeiro_numero || coalesce(' · ' || nullif(trim(g.ligacao_rotulo), ''), '') end,
         case g.status
           when 'agendado' then 'Serviço de terceiro · ' || coalesce(g.prestador_nome, 'sem prestador')
                                || case when g.ordem_status = 'enviada' then ' · peças no prestador, retorno previsto'
                                        when g.ordem_status = 'montada' then ' · dia do envio das peças (ordem aguardando assinatura)'
                                        else ' · ' || case g.periodo when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'dia todo' end end
           when 'realizado' then 'Serviço de terceiro realizado · ' || coalesce(g.prestador_nome, 'sem prestador')
           else 'Data desejada do pedido · ' || coalesce(g.prestador_nome, 'sem prestador definido')
         end,
         g.responsavel,
         g.emails || case when g.quem_marca_data = 'adaptacao' then a.emails else '{}'::text[] end,   -- quem pediu e, nos tipos da Adaptação, a equipe dela
         g.nomes,
         '{}'::text[], 'terceiros'::text,
         g.status = 'realizado',
         g.status = 'agendado',
         jsonb_build_object('carros', g.carros, 'venda', g.venda_base, 'ordem', g.ordem_numero, 'periodo', g.periodo, 'prestador', g.prestador_nome, 'tipo', g.tipo_nome, 'situacao', g.status)
    from g cross join adaptacao a
$$;
revoke all on function public.calendario_eventos_terceiros(date, date) from public, anon, authenticated;
