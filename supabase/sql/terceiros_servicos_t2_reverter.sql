-- Reverte a fatia T2 do banco (anexos e edição em lote): volta as duas funções para a versão da T1 e tira as novas.
-- Os anexos já gravados em terceiros_servicos.anexos NÃO são apagados (a coluna é da T1); só deixam de poder ser gravados.
drop function if exists public.terceiros_atualizar_varios(uuid[], jsonb, text);
drop function if exists public.terceiros_solicitar(uuid, text, jsonb, date, text, jsonb, uuid, numeric, text, boolean, jsonb);
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

drop function if exists public.terceiros_limpar_anexos(jsonb, jsonb, text);
