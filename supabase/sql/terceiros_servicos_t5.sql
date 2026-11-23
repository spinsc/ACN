-- Serviços de terceiros, fatia T5 (23/11/2026): pedir o pagamento ao Financeiro, ligar o serviço à saída da Vistoria de pátio e a pintura da Serralheria virando serviço.
-- Decidido com o usuário em 23/11/2026 (PLANO_SERVICOS_TERCEIROS.md, andamento da T5):
--   • UM pedido de pagamento por visita ou ordem: a soma do valor final dos serviços escolhidos, de UM prestador só, abre UMA demanda no Financeiro já preenchida;
--   • a saída da vistoria se liga ao serviço (vários serviços podem ligar a mesma saída: uma viagem com as peças de uma ordem);
--   • a Serralheria deixa de abrir requisição no Compras e abre um serviço de pintura eletrostática: a demanda guarda o serviço em `pintura_servico_id`.
-- NADA é gravado em dado real: só colunas novas (todas vazias), três funções e dois índices pequenos. Nenhuma política, gatilho ou índice de tabela de muitas telas foi tocado.
-- Reverter: terceiros_servicos_t5_reverter.sql.

-- ── colunas novas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.terceiros_servicos
  add column if not exists pagamento_demanda_id uuid,       -- a demanda do Financeiro que pede o pagamento (sem chave estrangeira: a demanda pode ser cancelada, e quem lê olha a situação dela)
  add column if not exists pagamento_pedido_em timestamptz,
  add column if not exists pagamento_pedido_por text,
  add column if not exists vistoria_id uuid,                -- a saída da vistoria de pátio (vistorias_patio.id); vários serviços podem apontar para a mesma
  add column if not exists vistoria_ligada_em timestamptz,
  add column if not exists vistoria_ligada_por text;
create index if not exists terceiros_servicos_pagamento_idx on public.terceiros_servicos (pagamento_demanda_id) where pagamento_demanda_id is not null;
create index if not exists terceiros_servicos_vistoria_idx on public.terceiros_servicos (vistoria_id) where vistoria_id is not null;
alter table public.demandas_avulsas add column if not exists pintura_servico_id uuid;   -- o serviço de pintura que nasceu quando a Serralheria concluiu a peça (no lugar de `pintura_pedido_id`, do Compras)

-- ── pedir o pagamento ao Financeiro ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Cria a demanda do Financeiro (setor "Financeiro", com o quadro de pagamento a terceiro) e liga os serviços a ela, tudo ou nada. O valor NÃO vem da tela: é a soma dos valores finais gravados.
-- Quem pode: quem pediu, a Adaptação (nos tipos dela), gerentes e Admin (a mesma conta de dar o serviço como realizado); numa ordem de lote, também quem pode mexer na ordem.
-- Se a demanda de um pedido anterior foi CANCELADA, os serviços podem pedir de novo; se foi concluída (pago) ou está aberta, não.
create or replace function public.terceiros_pagamento_pedir(p_ids uuid[], p_pagamento jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); p jsonb := coalesce(p_pagamento, '{}'::jsonb);
  ids uuid[]; achados int; r record; v_prest uuid; v_prest_nome text; v_prest_doc text;
  v_total numeric := 0; v_n int := 0; v_linhas text := ''; v_vinc jsonb := '[]'::jsonb; v_tipos text[] := '{}'::text[];
  v_fav text; v_doc text; v_tipo text; v_forma text; v_venc date; v_dados text; v_obs text;
  v_demanda uuid := gen_random_uuid(); v_email text; v_titulo text; v_desc text; v_pag jsonb; v_valor_txt text;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode pedir um pagamento.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Peça o pagamento de no máximo 100 serviços de uma vez.'; end if;

  v_fav := nullif(btrim(coalesce(p->>'favorecido', '')), '');
  if v_fav is null then raise exception 'Diga quem vai receber o pagamento (o favorecido).'; end if;
  v_doc := nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), '');
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'O CPF tem 11 números e o CNPJ tem 14.'; end if;
  v_tipo := coalesce(nullif(btrim(coalesce(p->>'tipo', '')), ''), 'servico');
  if v_tipo not in ('servico', 'material', 'frete', 'diaria', 'outro') then raise exception 'O tipo de custo não é válido.'; end if;
  v_forma := coalesce(nullif(btrim(coalesce(p->>'forma', '')), ''), 'pix');
  if v_forma not in ('pix', 'boleto', 'transferencia', 'outro') then raise exception 'A forma de pagamento não é válida.'; end if;
  begin
    v_venc := nullif(btrim(coalesce(p->>'vencimento', '')), '')::date;
  exception when others then
    raise exception 'O vencimento não é uma data válida.';
  end;
  if v_venc is not null and v_venc < date '2020-01-01' then raise exception 'O vencimento não é uma data válida.'; end if;
  v_dados := nullif(btrim(coalesce(p->>'dados_pagamento', '')), '');
  v_obs := nullif(btrim(coalesce(p->>'observacao', '')), '');

  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;

  for r in select s.numero, s.status, s.valor_final, s.prestador_id, s.solicitante_id, s.ordem_id, s.pagamento_demanda_id, s.ligacao_tipo, s.ligacao_id, s.ligacao_rotulo, s.descricao,
                  t.nome as tipo_nome, t.quem_marca_data,
                  (select d.status from public.demandas_avulsas d where d.id = s.pagamento_demanda_id) as pag_status
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status <> 'realizado' then raise exception 'O serviço % ainda não foi dado como realizado: só se pede o pagamento do que foi feito.', r.numero; end if;
    if coalesce(r.valor_final, 0) <= 0 then raise exception 'O serviço % não tem valor final maior que zero: não há o que pagar.', r.numero; end if;
    if r.prestador_id is null then raise exception 'O serviço % não tem prestador.', r.numero; end if;
    if v_prest is null then v_prest := r.prestador_id;
    elsif v_prest <> r.prestador_id then raise exception 'Um pedido de pagamento é de um prestador só: separe os serviços de prestadores diferentes.'; end if;
    if not (public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) or (r.ordem_id is not null and public.terceiros_pode_ordem(a))) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin pedem o pagamento.', r.numero using errcode = '42501';
    end if;
    if r.pagamento_demanda_id is not null and r.pag_status is not null and r.pag_status <> 'Cancelada' then
      raise exception 'O pagamento do serviço % já foi pedido ao Financeiro (a demanda está "%").', r.numero, lower(r.pag_status);
    end if;
    v_total := v_total + r.valor_final; v_n := v_n + 1;
    if not (r.tipo_nome = any(v_tipos)) then v_tipos := v_tipos || r.tipo_nome; end if;
    if v_n <= 40 then
      v_linhas := v_linhas || E'\n• ' || r.numero || ' — ' || r.tipo_nome || coalesce(' · ' || r.ligacao_rotulo, '') || ': R$ ' || replace(to_char(r.valor_final, 'FM999999990.00'), '.', ',');
    end if;
    if r.ligacao_tipo in ('op', 'os') and r.ligacao_id is not null and jsonb_array_length(v_vinc) < 50
       and not exists (select 1 from jsonb_array_elements(v_vinc) e where e->>'tipo' = r.ligacao_tipo and e->>'id' = r.ligacao_id::text) then
      v_vinc := v_vinc || jsonb_build_array(jsonb_build_object('tipo', r.ligacao_tipo, 'id', r.ligacao_id::text, 'descricao', coalesce(r.ligacao_rotulo, '')));
    end if;
  end loop;
  if v_n > 40 then v_linhas := v_linhas || E'\n• … e mais ' || (v_n - 40) || ' serviço(s).'; end if;
  v_total := round(v_total, 2);
  v_valor_txt := replace(to_char(v_total, 'FM999999990.00'), '.', ',');

  select p2.nome, p2.cnpj_cpf into v_prest_nome, v_prest_doc from public.terceiros_prestadores p2 where p2.id = v_prest;
  select u.email into v_email from public.auth_usuarios u where u.id = (a->>'id')::uuid;

  v_titulo := left('Pagamento — ' || coalesce(v_prest_nome, v_fav) || ' — ' || array_to_string(v_tipos, ' / ') || ' (' || v_n || ' serviço' || case when v_n > 1 then 's' else '' end || ')', 200);
  v_desc := 'Pedido de pagamento a terceiro, aberto pelos Serviços de terceiros.' || E'\nPrestador: ' || coalesce(v_prest_nome, v_fav) || coalesce(' (' || v_prest_doc || ')', '')
            || E'\nServiços:' || v_linhas || E'\nTotal: R$ ' || v_valor_txt;
  v_pag := jsonb_build_object('favorecido', v_fav, 'documento', v_doc, 'tipo', v_tipo, 'valor', v_total, 'vencimento', to_char(v_venc, 'YYYY-MM-DD'), 'forma', v_forma, 'dados_pagamento', v_dados, 'observacao', v_obs);

  insert into public.demandas_avulsas (id, setor, titulo, descricao, status, prioridade, criado_por, criado_por_nome, criado_em, atualizado_em, informacoes, vinculos, vinculo_tipo, vinculo_id, vinculo_descricao, origem, pagamento_terceiro)
  values (v_demanda, 'Financeiro', v_titulo, v_desc, 'Pendente', 'Média', v_email, a->>'nome', now(), now(),
          jsonb_build_array(jsonb_build_object('texto', 'Pedido aberto pelos Serviços de terceiros (' || v_n || ' serviço' || case when v_n > 1 then 's' else '' end || ', total R$ ' || v_valor_txt || ').', 'usuario', a->>'nome', 'data', now())),
          v_vinc, v_vinc->0->>'tipo', v_vinc->0->>'id', v_vinc->0->>'descricao', 'terceiros_servicos', v_pag);

  update public.terceiros_servicos s set
         pagamento_demanda_id = v_demanda, pagamento_pedido_em = now(), pagamento_pedido_por = a->>'autor', atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'pagamento_pedido',
           'detalhe', 'Pagamento pedido ao Financeiro: ' || v_n || ' serviço' || case when v_n > 1 then 's' else '' end || ', total R$ ' || v_valor_txt
              || case when v_venc is not null then ', vence em ' || to_char(v_venc, 'DD/MM/YYYY') else '' end))
   where s.id = any(ids);

  return jsonb_build_object('demanda_id', v_demanda, 'total', v_total, 'quantidade', v_n,
                            'servicos', coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb));
end $function$;
revoke all on function public.terceiros_pagamento_pedir(uuid[], jsonb) from public, anon;
grant execute on function public.terceiros_pagamento_pedir(uuid[], jsonb) to authenticated;

-- ── ligar o serviço à saída da vistoria de pátio ─────────────────────────────────────────────────────────────────────────────────────────────
-- A saída é registrada na Vistoria de pátio (o carro ou a peça sai com assinatura e fotos); aqui só se APONTA para ela. Vários serviços podem apontar para a mesma saída.
-- O serviço de uma ordem em andamento também liga (é justamente a viagem das peças da ordem): por isso NÃO usa `terceiros_recusar_se_em_ordem`; quem pode é quem pode mexer no serviço ou na ordem.
create or replace function public.terceiros_vistoria_ligar(p_ids uuid[], p_vistoria_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); ids uuid[]; achados int; r record; v record; v_texto text;
begin
  if a is null then raise exception 'Só quem entrou no sistema pode ligar uma saída da vistoria.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Ligue no máximo 100 serviços de uma vez.'; end if;
  select id, status, destino, data_saida, tipo_servico into v from public.vistorias_patio where id = p_vistoria_id;
  if not found then raise exception 'Essa saída não foi encontrada na vistoria de pátio. Atualize a tela e escolha de novo.'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.status, s.solicitante_id, s.ordem_id, s.vistoria_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.status = 'cancelado' then raise exception 'O serviço % está cancelado.', r.numero; end if;
    if not (public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) or (r.ordem_id is not null and public.terceiros_pode_ordem(a))) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin ligam a saída da vistoria.', r.numero using errcode = '42501';
    end if;
    if r.vistoria_id is not null and r.vistoria_id <> p_vistoria_id then
      raise exception 'O serviço % já está ligado a outra saída da vistoria. Desligue-a antes de ligar esta.', r.numero;
    end if;
  end loop;
  v_texto := 'Saída da vistoria de pátio ligada: ' || coalesce(v.tipo_servico, 'saída') || ' para ' || coalesce(nullif(btrim(v.destino), ''), 'destino não informado')
             || coalesce(' (saiu em ' || to_char(v.data_saida at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')', '');
  update public.terceiros_servicos s set
         vistoria_id = p_vistoria_id, vistoria_ligada_em = now(), vistoria_ligada_por = a->>'autor', atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'vistoria_ligada', 'detalhe', v_texto))
   where s.id = any(ids);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_vistoria_ligar(uuid[], uuid) from public, anon;
grant execute on function public.terceiros_vistoria_ligar(uuid[], uuid) to authenticated;

-- desligar: a ligação errada se desfaz, com motivo (nada se apaga: a saída continua na vistoria e o histórico do serviço guarda quem desligou e por quê)
create or replace function public.terceiros_vistoria_desligar(p_ids uuid[], p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a jsonb := public.terceiros_ator(); ids uuid[]; achados int; r record; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if a is null then raise exception 'Só quem entrou no sistema pode desligar uma saída da vistoria.' using errcode = '42501'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) x);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
  if array_length(ids, 1) > 100 then raise exception 'Desligue no máximo 100 serviços de uma vez.'; end if;
  if length(v_motivo) < 5 then raise exception 'Diga o motivo (pelo menos 5 letras).'; end if;
  perform 1 from public.terceiros_servicos where id = any(ids) order by id for update;
  select count(*) into achados from public.terceiros_servicos where id = any(ids);
  if achados <> array_length(ids, 1) then raise exception 'Algum serviço escolhido não foi encontrado. Atualize a tela.'; end if;
  for r in select s.numero, s.solicitante_id, s.ordem_id, s.vistoria_id, t.quem_marca_data
             from public.terceiros_servicos s join public.terceiros_tipos t on t.id = s.tipo_id where s.id = any(ids) order by s.numero loop
    if r.vistoria_id is null then raise exception 'O serviço % não está ligado a nenhuma saída da vistoria.', r.numero; end if;
    if not (public.terceiros_pode_mexer(a, r.quem_marca_data, r.solicitante_id) or (r.ordem_id is not null and public.terceiros_pode_ordem(a))) then
      raise exception 'Serviço %: só quem pediu, a Adaptação (nos tipos dela), gerentes e Admin desligam a saída da vistoria.', r.numero using errcode = '42501';
    end if;
  end loop;
  update public.terceiros_servicos s set
         vistoria_id = null, vistoria_ligada_em = null, vistoria_ligada_por = null, atualizado_em = now(), atualizado_por = a->>'autor',
         historico = s.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', a->>'autor', 'acao', 'vistoria_desligada', 'detalhe', 'Saída da vistoria desligada. Motivo: ' || v_motivo))
   where s.id = any(ids);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.numero) from public.terceiros_servicos s where s.id = any(ids)), '[]'::jsonb);
end $function$;
revoke all on function public.terceiros_vistoria_desligar(uuid[], text) from public, anon;
grant execute on function public.terceiros_vistoria_desligar(uuid[], text) to authenticated;
