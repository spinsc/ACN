-- Reverte a fatia T4 do banco (modelo do contrato e ordem de serviço em lote): as cinco funções dos serviços e a do Calendário voltam ao que eram na T1, T2 e T3, e o que a T4 criou sai.
-- SÓ RODA se não houver ordem, serviço ligado a ordem nem modelo de contrato editado: nada que alguém gravou é apagado por este arquivo (se houver, a tela de Ordens e o modelo precisam ser tratados à mão antes).
do $$
begin
  if exists (select 1 from public.terceiros_ordens) then raise exception 'Há ordem de serviço gravada: não vou apagar a tabela. Resolva as ordens antes (ou peça ajuda).'; end if;
  if exists (select 1 from public.terceiros_servicos where ordem_id is not null) then raise exception 'Há serviço ligado a uma ordem: não vou soltar a ligação.'; end if;
  if exists (select 1 from public.terceiros_config where atualizado_em is not null or aprovada) then raise exception 'O modelo do contrato já foi editado ou aprovado: não vou apagá-lo.'; end if;
end $$;

-- 1) o Calendário volta a agrupar só por venda (T3)
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
           case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end as dia_do_evento
      from public.terceiros_servicos s
      join public.terceiros_tipos t on t.id = s.tipo_id
      left join public.terceiros_prestadores p on p.id = s.prestador_id
      left join public.auth_usuarios sol on sol.id = s.solicitante_id
     where s.status in ('solicitado', 'agendado', 'realizado')
       and case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end between p_inicio and p_fim
  ), g as (
    -- uma linha por visita: o agrupamento do Quadro (`chaveDoGrupo`, TerceirosFluxo.ts)
    select min(v.id::text) as primeiro_id, count(*)::int as carros, v.status, v.tipo_id, v.dia_do_evento,
           (array_agg(v.tipo_nome))[1] as tipo_nome, (array_agg(v.quem_marca_data))[1] as quem_marca_data, v.venda_base,
           v.prestador_id, (array_agg(v.prestador_nome))[1] as prestador_nome, case when v.status = 'agendado' then v.periodo end as periodo,
           (array_agg(v.numero order by v.numero))[1] as primeiro_numero, (array_agg(v.ligacao_rotulo order by v.numero))[1] as ligacao_rotulo,
           (array_agg(v.solicitante_nome order by v.numero))[1] as responsavel,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_email)), null) as emails,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_nome)), null) as nomes
      from v
     group by v.status, v.tipo_id, coalesce(v.venda_base, v.id::text), v.venda_base, v.prestador_id, v.dia_do_evento, case when v.status = 'agendado' then v.periodo end
  )
  select case when g.status = 'solicitado' then 'terceiro_desejado' else 'terceiro_servico' end,
         g.primeiro_id, g.dia_do_evento, null::time,
         g.tipo_nome || ' — '
           || case when g.carros > 1 then g.carros || ' carros' || coalesce(' da venda ' || g.venda_base, '')
                   else g.primeiro_numero || coalesce(' · ' || nullif(trim(g.ligacao_rotulo), ''), '') end,
         case g.status
           when 'agendado' then 'Serviço de terceiro · ' || coalesce(g.prestador_nome, 'sem prestador')
                                || ' · ' || case g.periodo when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'dia todo' end
           when 'realizado' then 'Serviço de terceiro realizado · ' || coalesce(g.prestador_nome, 'sem prestador')
           else 'Data desejada do pedido · ' || coalesce(g.prestador_nome, 'sem prestador definido')
         end,
         g.responsavel,
         g.emails || case when g.quem_marca_data = 'adaptacao' then a.emails else '{}'::text[] end,   -- quem pediu e, nos tipos da Adaptação, a equipe dela
         g.nomes,
         '{}'::text[], 'terceiros'::text,
         g.status = 'realizado',
         g.status = 'agendado',
         jsonb_build_object('carros', g.carros, 'venda', g.venda_base, 'periodo', g.periodo, 'prestador', g.prestador_nome, 'tipo', g.tipo_nome, 'situacao', g.status)
    from g cross join adaptacao a
$$;
revoke all on function public.calendario_eventos_terceiros(date, date) from public, anon, authenticated;

-- 2) as cinco funções dos serviços voltam sem a trava da ordem (T1 e T2)
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

-- 3) as funções da ordem e as conferências internas
drop function if exists public.terceiros_ordem_montar(uuid[], uuid, date, date, text);
drop function if exists public.terceiros_ordem_incluir(uuid, uuid[], text);
drop function if exists public.terceiros_ordem_tirar(uuid, uuid[], text, text);
drop function if exists public.terceiros_ordem_atualizar(uuid, jsonb, text);
drop function if exists public.terceiros_ordem_enviar(uuid, jsonb, date, date, text);
drop function if exists public.terceiros_ordem_realizar(uuid, date, jsonb, text, text);
drop function if exists public.terceiros_ordem_cancelar(uuid, text, text);
drop function if exists public.terceiros_config_salvar(jsonb, text, boolean);
drop function if exists public.terceiros_incluir_na_ordem(public.terceiros_ordens, uuid[], text);
drop function if exists public.terceiros_soltar_da_ordem(public.terceiros_ordens, uuid[], text, text);
drop function if exists public.terceiros_validar_para_ordem(uuid[], uuid);
drop function if exists public.terceiros_recusar_se_em_ordem(uuid[]);
drop function if exists public.terceiros_prestador_faz(uuid, uuid);
drop function if exists public.terceiros_pode_ordem(jsonb);

-- 4) a coluna, as tabelas, o gatilho e o contador
drop index if exists public.terceiros_servicos_ordem_idx;
alter table public.terceiros_servicos drop column if exists ordem_id;
drop table if exists public.terceiros_ordens;
drop table if exists public.terceiros_config;
drop function if exists public.terceiros_ordem_numerar();
drop sequence if exists public.terceiros_ordem_seq;
