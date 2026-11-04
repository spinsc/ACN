-- Viagens, melhorias (04/11/2026, pedido do usuário depois da fatia 3): avisos aos setores, aviso de OP que voltou/foi cancelada e manutenção da frota.
--  • Quando a viagem chega a Provisionamento, o banco avisa na caixa de Menções cada setor que precisa preencher a sua parte: Adaptação (quem tem a aba Produção/Adaptação),
--    Financeiro (quem tem a aba Financeiro) e Comercial (o vendedor / responsável comercial da OP que gerou a viagem; sem OP, quem criou a viagem). O aviso se resolve sozinho quando
--    a viagem sai de Provisionamento (para Andamento ou para trás). A direção não entra aqui: ela já foi avisada quando a viagem nasceu.
--  • Quando uma OP ligada a uma viagem em andamento de preparação volta (Devolvida PCP/Comercial) ou é cancelada, a viagem ganha uma nota no histórico e quem aprova recebe um aviso
--    para conferir se ela ainda faz sentido. Nada é alterado na viagem além da nota.
--  • Tabela `frota_manutencoes`: revisões, trocas e consertos de cada veículo da frota, com a próxima revisão (km e/ou data) para a tela avisar quando vencer.

-- 1) manutenção da frota ------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.frota_manutencoes (
  id uuid primary key default gen_random_uuid(),
  frota_id uuid not null references public.frota_veiculos(id) on delete restrict,   -- nunca apaga o veículo que tem histórico
  data date not null,
  tipo text not null,                      -- revisão, óleo, pneus, freios, elétrica, funilaria, outro
  descricao text,
  km numeric,                              -- o km do painel quando foi feito
  custo numeric,
  proxima_km numeric,                      -- a próxima revisão por km (opcional)
  proxima_data date,                       -- a próxima revisão por data (opcional)
  criado_em timestamptz not null default now(),
  criado_por_nome text
);
create index if not exists frota_manutencoes_frota_idx on public.frota_manutencoes (frota_id, data desc);
alter table public.frota_manutencoes enable row level security;
drop policy if exists etapa17_logado on public.frota_manutencoes;
create policy etapa17_logado on public.frota_manutencoes for all to authenticated using (public.esta_logado()) with check (public.esta_logado());
revoke all on table public.frota_manutencoes from anon;
comment on table public.frota_manutencoes is 'Manutenções e revisões dos veículos da frota de viagens; a próxima revisão (km e/ou data) faz a tela da frota avisar quando vencer.';

-- 2) avisos aos setores quando a viagem chega a Provisionamento --------------------------------------------------------------------------------------
create or replace function public.viagens_ao_mudar_de_etapa()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  u record; v_nomes_com text[]; v_tem_op boolean; v_texto text; v_data text;
begin
  if new.status is distinct from old.status then
    -- os avisos da etapa que a viagem deixou (aprovação ou provisionamento) se resolvem sozinhos
    if old.status in ('em_aprovacao', 'provisionamento', 'aprovada') then
      update public.mencoes set resolvida = true, resolvida_em = now(), resolvida_por = coalesce(new.atualizado_por_nome, 'Sistema')
       where contexto = 'viagem' and contexto_id = new.id::text and not resolvida;
    end if;

    -- chegou a Provisionamento: cada setor é avisado da sua parte
    if new.status = 'provisionamento' and old.status in ('em_aprovacao', 'aberta', 'nao_aprovada') then
      v_data := coalesce(' (saída em ' || to_char(new.data_saida, 'DD/MM/YYYY') || ')', '');
      -- Comercial: o vendedor / responsável da OP que gerou a viagem; sem OP (ou sem nome que bata com um usuário), quem criou a viagem
      select array_agg(distinct lower(btrim(x))), count(*) > 0 into v_nomes_com, v_tem_op
        from public.oples o, lateral unnest(array[o.responsavel_comercial::text, o.vendedor::text]) as x
       where o.id = any(coalesce(new.op_ids, '{}'::uuid[])) and btrim(coalesce(x, '')) <> '';
      if v_nomes_com is null or not exists (select 1 from public.auth_usuarios a where coalesce(a.ativo, true) and lower(btrim(a.nome)) = any(v_nomes_com)) then
        v_nomes_com := array[lower(btrim(coalesce(new.criado_por_nome, '')))];
        if v_nomes_com[1] in ('', 'sistema') then
          select array_agg(distinct lower(btrim(o.criado_por_nome::text))) into v_nomes_com from public.oples o where o.id = any(coalesce(new.op_ids, '{}'::uuid[]));
        end if;
      end if;

      for u in
        select a.id, a.nome, 'adaptacao' as setor from public.auth_usuarios a
         where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and a.perfil is distinct from 'Admin'
           and jsonb_typeof(a.abas_permitidas) = 'array' and a.abas_permitidas @> '["producao"]'::jsonb
        union all
        select a.id, a.nome, 'financeiro' from public.auth_usuarios a
         where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and a.perfil is distinct from 'Admin'
           and jsonb_typeof(a.abas_permitidas) = 'array' and a.abas_permitidas @> '["financeiro"]'::jsonb
        union all
        select a.id, a.nome, 'comercial' from public.auth_usuarios a
         where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and lower(btrim(a.nome)) = any(coalesce(v_nomes_com, '{}'::text[]))
      loop
        v_texto := case u.setor
          when 'adaptacao' then 'A viagem «' || new.titulo || '» foi aprovada' || v_data || '. Falta a parte da Adaptação: a equipe que vai, o veículo da frota e o km de saída.'
          when 'financeiro' then 'A viagem «' || new.titulo || '» foi aprovada' || v_data || '. Falta a parte do Financeiro: a verba total, o pedágio (reembolso ou convênio) e os dados do hotel.'
          else 'A viagem «' || new.titulo || '» foi aprovada' || v_data || '. Falta a parte do Comercial: a descrição do serviço e o contrato com o cliente (a viagem sai mesmo sem isso, mas a equipe precisa saber o que vai fazer).'
        end;
        insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
        values (u.id::text, u.nome, '', 'Sistema', 'viagem', new.id::text, new.titulo, 'provisionamento_' || u.setor, v_texto, 'viagens', false);
      end loop;
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
revoke all on function public.viagens_ao_mudar_de_etapa() from public, anon, authenticated;

-- 3) a OP ligada a uma viagem voltou ou foi cancelada ---------------------------------------------------------------------------------------------------
create or replace function public.viagens_avisar_op_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v record; u record; v_texto text;
begin
  if new.status_geral is distinct from old.status_geral and new.status_geral in ('Cancelado', 'Cancelada', 'Devolvida PCP', 'Devolvida Comercial') then
    for v in select id, titulo, status from public.viagens where new.id = any(op_ids) and status not in ('finalizada', 'nao_aprovada') loop
      v_texto := 'A OP ' || new.opl || ' mudou para «' || new.status_geral || '». Confira se a viagem «' || v.titulo || '» (' || v.status || ') ainda faz sentido.';
      update public.viagens set historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', now(), 'por', 'Sistema', 'de', v.status, 'para', v.status, 'nota', v_texto))
       where id = v.id;
      for u in select a.id, a.nome from public.auth_usuarios a
                where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and (a.perfil = 'Admin' or a.perfil ilike 'gerente%')
      loop
        insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
        values (u.id::text, u.nome, '', 'Sistema', 'viagem', v.id::text, v.titulo, 'op_mudou', v_texto, 'viagens', false);
      end loop;
    end loop;
  end if;
  return new;
exception when others then
  raise warning 'viagens_avisar_op_mudou (OP %): %', new.opl, sqlerrm;
  return new;
end $function$;
revoke all on function public.viagens_avisar_op_mudou() from public, anon, authenticated;

drop trigger if exists oples_avisar_viagem on public.oples;
create trigger oples_avisar_viagem after update of status_geral on public.oples
  for each row execute function public.viagens_avisar_op_mudou();
