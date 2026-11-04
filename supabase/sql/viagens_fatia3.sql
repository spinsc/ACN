-- Viagens, fatia 3 (04/11/2026): vínculos de verdade, fechamento (km de volta e custo real) e avisos.
--  • `vinculos` (jsonb): a lista de ligações da viagem com OP, PV (card do CRM) e licitação ({tipo, id, descricao}, o mesmo formato do VinculoPicker); as OPs que geraram a viagem entram sozinhas.
--    O texto antigo `vinculo` continua existindo (a busca e o quadro leem) e passa a ser derivado da lista.
--  • `km_volta` (Adaptação) e `custo_real` (Financeiro): o que a viagem de fato rodou e gastou, para comparar com o orçamento.
--  • Aviso na caixa de Menções de quem aprova (Admin e qualquer "Gerente …") quando a viagem NASCE da OP; a menção se resolve sozinha quando a viagem sai de Em aprovação.
--  • Ao finalizar, o km de volta vira o km atual do veículo da frota (só se for maior que o que o cadastro já tem).

alter table public.viagens
  add column if not exists vinculos jsonb not null default '[]'::jsonb,
  add column if not exists km_volta numeric,
  add column if not exists custo_real jsonb;

comment on column public.viagens.vinculos is 'Ligações da viagem: [{tipo: op|pv|licitacao, id, descricao}]. As OPs que a geraram entram pelo gatilho; o resto a pessoa escolhe na janela da viagem.';
comment on column public.viagens.km_volta is 'Km que o painel do veículo marcava na volta (Adaptação). Km rodado = km_volta − km_saida.';
comment on column public.viagens.custo_real is 'O que foi gasto de fato (Financeiro): {combustivel, pedagios, hospedagem, alimentacao, outros, observacao}.';

-- as viagens que já existem e foram geradas por OP ganham a lista (só a coluna nova é preenchida)
update public.viagens v
   set vinculos = coalesce((select jsonb_agg(jsonb_build_object('tipo', 'op', 'id', o.id::text, 'descricao', o.opl || coalesce(' — ' || nullif(btrim(o.cliente_nome), ''), '')) order by o.opl)
                              from public.oples o where o.id = any(v.op_ids)), '[]'::jsonb)
 where coalesce(array_length(v.op_ids, 1), 0) > 0 and v.vinculos = '[]'::jsonb;

-- a viagem que a OP gera: agora também guarda a lista de vínculos e avisa quem aprova
create or replace function public.viagens_gerar_da_op()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_base text; v_cidade text; v_chave text; v_destino text; v_titulo text; v_id uuid; v_nova boolean; u record;
begin
  if new.fluxo_entrega is distinct from 'adaptacao_externa' then return new; end if;
  if new.status_geral is distinct from 'Kit OK - Aguardando PCP' then return new; end if;
  if tg_op = 'UPDATE' and old.status_geral is not distinct from new.status_geral then return new; end if;

  v_base := regexp_replace(coalesce(new.opl, ''), '/[0-9]+$', '');
  v_cidade := upper(btrim(concat_ws('/', nullif(btrim(coalesce(new.destino_cidade, '')), ''), nullif(btrim(coalesce(new.destino_uf, '')), ''))));
  v_chave := 'op:' || v_base || '|' || v_cidade;
  v_destino := nullif(btrim(concat_ws(', ',
      nullif(btrim(concat_ws(' ', new.destino_logradouro, new.destino_numero)), ''),
      nullif(btrim(coalesce(new.destino_bairro, '')), ''),
      nullif(btrim(concat_ws('/', new.destino_cidade, new.destino_uf)), ''))), '');
  v_destino := coalesce(v_destino, nullif(btrim(coalesce(new.local_instalacao, '')), ''), new.cliente_nome);
  v_titulo := 'Adaptação externa — ' || coalesce(nullif(btrim(new.cliente_nome), ''), 'sem cliente') || coalesce(' — ' || nullif(v_cidade, ''), '');

  insert into public.viagens (titulo, status, status_desde, origem, paradas, ida_e_volta, otimizar_ordem, custos, pessoas, op_ids, chave_origem, sugestao_destino, historico, criado_por_nome, atualizado_por_nome)
  values (v_titulo, 'em_aprovacao', now(),
          '{"id":"fabrica","lat":-27.6631788,"lng":-48.6792346,"texto":"ACN Sinal Verde, 104, Rua Osvaldo de Souza, Aririú, Palhoça, Santa Catarina, Região Sul, 88134-000, Brasil"}'::jsonb,
          '[]'::jsonb, true, true, '{}'::jsonb, 1, array[new.id], v_chave, v_destino,
          jsonb_build_array(jsonb_build_object('em', now(), 'por', 'Sistema', 'de', '', 'para', 'em_aprovacao',
            'nota', 'Viagem gerada sozinha: o Almoxarifado fechou o kit da OP ' || new.opl || ' (Adaptação externa). Falta localizar o destino no mapa, calcular a rota e aprovar.')),
          'Sistema', 'Sistema')
  on conflict (chave_origem) do update set
    op_ids = case when new.id = any(public.viagens.op_ids) then public.viagens.op_ids else public.viagens.op_ids || new.id end,
    historico = case when new.id = any(public.viagens.op_ids) then public.viagens.historico
      else public.viagens.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', 'Sistema', 'de', public.viagens.status, 'para', public.viagens.status,
        'nota', 'A OP ' || new.opl || ' entrou nesta viagem (mesmo lote e mesmo destino).')) end
  returning id, (xmax = 0) into v_id, v_nova;

  -- a lista de vínculos: as OPs da viagem (refeita a cada vez) + o que a pessoa já tiver ligado à mão; o texto antigo sai da lista
  update public.viagens x set
    vinculos = coalesce((select jsonb_agg(e) from jsonb_array_elements(x.vinculos) e where e->>'tipo' <> 'op'), '[]'::jsonb)
             || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'op', 'id', o.id::text, 'descricao', o.opl || coalesce(' — ' || nullif(btrim(o.cliente_nome), ''), '')) order by o.opl)
                            from public.oples o where o.id = any(x.op_ids)), '[]'::jsonb)
   where x.id = v_id;
  update public.viagens x set vinculo = (select string_agg(split_part(e->>'descricao', ' — ', 1), ', ') from jsonb_array_elements(x.vinculos) e) where x.id = v_id;

  -- só quando a viagem NASCE: avisa na caixa de Menções de quem aprova (a mesma regra da tela: Admin e qualquer "Gerente …")
  if v_nova then
    for u in select a.id, a.nome from public.auth_usuarios a
              where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and (a.perfil = 'Admin' or a.perfil ilike 'gerente%')
    loop
      insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
      values (u.id::text, u.nome, '', 'Sistema', 'viagem', v_id::text, v_titulo, 'aprovacao',
              'A viagem «' || v_titulo || '» foi gerada pela OP ' || new.opl || ' e espera a aprovação' || coalesce(' (destino: ' || v_destino || ')', '') || '. Abra a viagem, localize o destino no mapa, calcule a rota e aprove ou recuse.',
              'viagens', false);
    end loop;
  end if;
  return new;
exception when others then
  raise warning 'viagens_gerar_da_op (OP %): %', new.opl, sqlerrm;
  return new;
end $function$;

-- quando a viagem muda de etapa: resolve o aviso de aprovação e, ao finalizar, leva o km de volta ao cadastro da frota
create or replace function public.viagens_ao_mudar_de_etapa()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status is distinct from old.status then
    if old.status = 'em_aprovacao' then
      update public.mencoes set resolvida = true, resolvida_em = now(), resolvida_por = coalesce(new.atualizado_por_nome, 'Sistema')
       where contexto = 'viagem' and contexto_id = new.id::text and not resolvida;
    end if;
    if new.status = 'finalizada' and new.frota_id is not null and new.km_volta is not null then
      update public.frota_veiculos set km_atual = greatest(coalesce(km_atual, 0), new.km_volta), atualizado_em = now()
       where id = new.frota_id;
    end if;
  end if;
  return new;
exception when others then
  raise warning 'viagens_ao_mudar_de_etapa (viagem %): %', new.id, sqlerrm;
  return new;
end $function$;

revoke all on function public.viagens_gerar_da_op() from public, anon, authenticated;
revoke all on function public.viagens_ao_mudar_de_etapa() from public, anon, authenticated;

drop trigger if exists viagens_ao_mudar_de_etapa on public.viagens;
create trigger viagens_ao_mudar_de_etapa after update of status on public.viagens
  for each row execute function public.viagens_ao_mudar_de_etapa();
