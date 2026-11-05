-- VIAGENS ↔ OS (pedido do usuário em 05/11/2026)
-- 1) A OS de atendimento externo (a categoria do SAC com a marca "tem despesas", hoje "Servico Externo") gera sozinha a viagem quando é APROVADA, como a OP de Adaptação externa faz ao fechar o kit:
--    uma viagem por lote (OS do mesmo lote_id entram na mesma viagem), nasce em "Em aprovação" com o endereço do cliente como destino sugerido e avisa Admin e gerentes na caixa de Menções.
--    Nunca trava a OS: se algo falhar, só avisa no log do banco.
-- 2) A viagem e a OS se enxergam: sac_ordens_servico.viagem_id guarda a viagem da OS e a viagem recebe a ligação "OS" (marcada auto = true, que a tela não deixa tirar à mão, pois a OS existe
--    por causa da viagem). Uma viagem pode ter várias OS (lote); a OS escolhida à mão pelo seletor de ligações continua sendo só uma ligação, sem viagem_id.
-- Reverter: viagens_da_os_reverter.sql.
alter table public.sac_ordens_servico add column if not exists viagem_id uuid references public.viagens(id) on delete set null;
create index if not exists sac_os_viagem_id_idx on public.sac_ordens_servico (viagem_id) where viagem_id is not null;

-- reescreve a lista de ligações "OS" automáticas da viagem a partir das OS que têm viagem_id (e tira a mesma OS se ela também tinha sido ligada à mão, para não aparecer duas vezes)
create or replace function public.viagens_refazer_ligacao_das_os(p_viagem uuid) returns void
language plpgsql security definer set search_path to 'public' as $f$
begin
  update public.viagens x set
    vinculos = coalesce((select jsonb_agg(e) from jsonb_array_elements(x.vinculos) e
                          where not (e->>'tipo' = 'os' and (coalesce((e->>'auto')::boolean, false) or e->>'id' in (select o.id::text from public.sac_ordens_servico o where o.viagem_id = x.id)))), '[]'::jsonb)
            || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'os', 'id', o.id::text, 'descricao', o.numero_os || coalesce(' — ' || nullif(btrim(o.cliente_nome), ''), ''), 'auto', true) order by o.numero_os)
                           from public.sac_ordens_servico o where o.viagem_id = x.id), '[]'::jsonb),
    atualizado_em = now()
  where x.id = p_viagem;
  update public.viagens x set vinculo = nullif((select string_agg(split_part(e->>'descricao', ' — ', 1), ', ') from jsonb_array_elements(x.vinculos) e), '') where x.id = p_viagem;
end $f$;

create or replace function public.viagens_sincronizar_os() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
declare v_chave text; v_id uuid; v_nova boolean; v_titulo text; v_destino text; u record;
begin
  -- (1) OS de atendimento externo aprovada e ainda sem viagem: gera (ou entra na viagem do lote)
  if new.viagem_id is null and new.status in ('Aprovado', 'Em Execução')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (select 1 from public.sac_categorias c where c.nome = new.tipo_projeto and coalesce(c.tem_despesas, false) and coalesce(c.ativo, true)) then
    v_chave := 'os:' || coalesce(new.lote_id::text, new.id::text);
    v_destino := coalesce(nullif(btrim(coalesce(new.endereco, '')), ''), nullif(btrim(coalesce(new.empresa_orgao, '')), ''), new.cliente_nome);
    v_titulo := 'Atendimento externo — ' || coalesce(nullif(btrim(new.cliente_nome), ''), 'sem cliente');
    insert into public.viagens (titulo, status, status_desde, origem, paradas, ida_e_volta, otimizar_ordem, custos, pessoas, chave_origem, sugestao_destino, historico, criado_por_nome, atualizado_por_nome)
    values (v_titulo, 'em_aprovacao', now(),
            '{"id":"fabrica","lat":-27.6631788,"lng":-48.6792346,"texto":"ACN Sinal Verde, 104, Rua Osvaldo de Souza, Aririú, Palhoça, Santa Catarina, Região Sul, 88134-000, Brasil"}'::jsonb,
            '[]'::jsonb, true, true, '{}'::jsonb, 1, v_chave, v_destino,
            jsonb_build_array(jsonb_build_object('em', now(), 'por', 'Sistema', 'de', '', 'para', 'em_aprovacao',
              'nota', 'Viagem gerada sozinha: a OS ' || new.numero_os || ' (atendimento externo) foi aprovada. Falta localizar o destino no mapa, calcular a rota e aprovar.')),
            'Sistema', 'Sistema')
    on conflict (chave_origem) do update set
      historico = public.viagens.historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', 'Sistema', 'de', public.viagens.status, 'para', public.viagens.status,
        'nota', 'A OS ' || new.numero_os || ' entrou nesta viagem (mesmo lote).'))
    returning id, (xmax = 0) into v_id, v_nova;
    update public.sac_ordens_servico set viagem_id = v_id where id = new.id;   -- dispara este gatilho de novo, que refaz as ligações (caso 2)
    if v_nova then
      for u in select a.id, a.nome from public.auth_usuarios a
                where coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and (a.perfil = 'Admin' or a.perfil ilike 'gerente%')
      loop
        insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
        values (u.id::text, u.nome, '', 'Sistema', 'viagem', v_id::text, v_titulo, 'aprovacao',
                'A viagem «' || v_titulo || '» foi gerada pela OS ' || new.numero_os || ' e espera a aprovação' || coalesce(' (destino: ' || v_destino || ')', '') || '. Abra a viagem, localize o destino no mapa, calcule a rota e aprove ou recuse.',
                'viagens', false);
      end loop;
    end if;
    return new;
  end if;
  -- (2) a OS entrou numa viagem (ou saiu de uma): refaz a lista de ligações dela
  if new.viagem_id is not null and (tg_op = 'INSERT' or old.viagem_id is distinct from new.viagem_id) then
    perform public.viagens_refazer_ligacao_das_os(new.viagem_id);
  end if;
  if tg_op = 'UPDATE' and old.viagem_id is not null and old.viagem_id is distinct from new.viagem_id then
    perform public.viagens_refazer_ligacao_das_os(old.viagem_id);
  end if;
  return new;
exception when others then
  raise warning 'viagens_sincronizar_os (OS %): %', new.numero_os, sqlerrm;
  return new;
end $f$;

drop trigger if exists viagens_sincronizar_os on public.sac_ordens_servico;
create trigger viagens_sincronizar_os after insert or update of status, viagem_id on public.sac_ordens_servico
  for each row execute function public.viagens_sincronizar_os();

-- função de gatilho e auxiliar: ninguém de fora executa (regra da Etapa 17); o gatilho dispara sem esse direito
revoke all on function public.viagens_sincronizar_os() from public, anon, authenticated;
revoke all on function public.viagens_refazer_ligacao_das_os(uuid) from public, anon, authenticated;
