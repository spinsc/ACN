-- Pedido do usuário em 30/10/2026: numa lista de materiais, o item sem cotação não pode travar os que já têm.
-- Ao aprovar, os itens sem cotação saem do pedido e viram um pedido novo (PC-00123-B, em "Pendente"), e o original segue o fluxo só com o que tem cotação.
-- Tudo numa função só (tudo ou nada, com o pedido travado): a posição dos itens muda, e a escolha de vencedora e as cotações apontam para a posição,
-- então elas são renumeradas junto. Só vale antes da aprovação e só para item que nenhuma cotação cobre.
create or replace function public.compras_dividir_pedido(p_pedido_id uuid, p_indices_fora int[], p_usuario_email text, p_usuario_nome text)
returns jsonb language plpgsql as $$
declare
  ped public.pcp_pedidos_compra%rowtype;
  fora int[];
  total int; k int := 0; i int; j int;
  mapa jsonb := '{}'::jsonb;
  itens_mant jsonb; itens_fora jsonb;
  linhas_fora text[]; linhas_todas text[]; todas_do_pedido text[]; cab text[]; resto text[];
  desc_orig text; desc_novo text;
  qtd_mant numeric; qtd_fora numeric;
  base text; novo_num text := null; novo_id uuid; hoje text;
begin
  select coalesce(array_agg(distinct x order by x), '{}') into fora from unnest(p_indices_fora) x;
  select * into ped from public.pcp_pedidos_compra where id = p_pedido_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if ped.status_compra not in ('Pendente', 'Em Andamento') then
    raise exception 'só dá para separar itens antes da aprovação (o pedido está em "%")', ped.status_compra;
  end if;
  if ped.itens is null or jsonb_typeof(ped.itens) <> 'array' then raise exception 'o pedido não tem lista de itens'; end if;
  total := jsonb_array_length(ped.itens);
  if coalesce(array_length(fora, 1), 0) = 0 then raise exception 'nenhum item para separar'; end if;
  if fora[1] < 0 or fora[array_length(fora, 1)] >= total then raise exception 'item inexistente no pedido'; end if;
  if array_length(fora, 1) >= total then raise exception 'ao menos um item precisa ficar no pedido original'; end if;
  if not exists (select 1 from public.pcp_cotacoes_fornecedores where pedido_id = ped.id) then
    raise exception 'o pedido ainda não tem nenhuma cotação';
  end if;
  -- cotação do formato antigo (sem itens) cobre o pedido todo: não há item "sem cotação"
  if exists (select 1 from public.pcp_cotacoes_fornecedores c where c.pedido_id = ped.id
             and (c.itens is null or jsonb_typeof(c.itens) <> 'array' or jsonb_array_length(c.itens) = 0)) then
    raise exception 'há cotação do pedido inteiro; não há item sem cotação para separar';
  end if;
  if exists (select 1 from public.pcp_cotacoes_fornecedores c, jsonb_array_elements(c.itens) x
             where c.pedido_id = ped.id and (x->>'indice')::int = any(fora)) then
    raise exception 'algum dos itens a separar já tem cotação';
  end if;

  -- posição antiga -> posição nova dos itens que ficam
  for i in 0 .. total - 1 loop
    if not (i = any(fora)) then mapa := mapa || jsonb_build_object(i::text, k); k := k + 1; end if;
  end loop;

  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb) into itens_mant
    from jsonb_array_elements(ped.itens) with ordinality e(value, ord) where not ((e.ord - 1)::int = any(fora));
  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb) into itens_fora
    from jsonb_array_elements(ped.itens) with ordinality e(value, ord) where (e.ord - 1)::int = any(fora);

  -- a descrição guarda uma linha "N× item" por item (como a criação monta): as dos itens que saem vão para o pedido novo
  select coalesce(array_agg(l.linha order by l.ord) filter (where (l.ord - 1)::int = any(fora)), '{}'),
         coalesce(array_agg(l.linha order by l.ord), '{}')
    into linhas_fora, linhas_todas
    from (select e.ord,
                 (case when coalesce(e.value->>'quantidade', '') in ('', '0') then '1' else e.value->>'quantidade' end)
                 || '× ' || coalesce(e.value->>'nome', '')
                 || case when coalesce(e.value->>'descricao', '') <> '' then ' (' || (e.value->>'descricao') || ')' else '' end as linha
            from jsonb_array_elements(ped.itens) with ordinality e(value, ord)) l;
  todas_do_pedido := regexp_split_to_array(coalesce(ped.descricao_material, ''), E'\n');
  select coalesce(array_agg(u.ln order by u.o), '{}') into resto from unnest(todas_do_pedido) with ordinality u(ln, o) where not (u.ln = any(linhas_fora));
  select coalesce(array_agg(u.ln order by u.o), '{}') into cab from unnest(todas_do_pedido) with ordinality u(ln, o) where not (u.ln = any(linhas_todas));
  desc_orig := array_to_string(resto, E'\n');
  desc_novo := array_to_string(cab || linhas_fora, E'\n');

  select coalesce(sum(case when (e.value->>'quantidade') ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'quantidade')::numeric else 0 end), 0) into qtd_fora
    from jsonb_array_elements(itens_fora) e;
  select coalesce(sum(case when (e.value->>'quantidade') ~ '^[0-9]+([.][0-9]+)?$' then (e.value->>'quantidade')::numeric else 0 end), 0) into qtd_mant
    from jsonb_array_elements(itens_mant) e;

  -- número do pedido novo: o do original + a primeira letra livre (B, C...)
  base := regexp_replace(ped.numero_pedido, '-[A-Z]$', '');
  for j in 66 .. 90 loop
    if not exists (select 1 from public.pcp_pedidos_compra where numero_pedido = base || '-' || chr(j)) then
      novo_num := base || '-' || chr(j); exit;
    end if;
  end loop;
  if novo_num is null then raise exception 'este pedido já foi dividido o máximo de vezes'; end if;
  hoje := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');

  insert into public.pcp_pedidos_compra (
    numero_pedido, opl, descricao_material, quantidade, status_compra, itens, observacoes_compra,
    criado_por, criado_por_nome, criado_por_setor, data_criacao, data_solicitacao, prazo_entrega,
    centro_custo, centro_custo_id, departamento_id, vinculo_tipo, vinculo_id, vinculo_descricao,
    link_url, comprador_email, comprador_nome, oportunidade_id, demanda_avulsa_id)
  values (
    novo_num, ped.opl, desc_novo, greatest(1, round(qtd_fora)), 'Pendente', itens_fora,
    nullif(concat_ws(E'\n', ped.observacoes_compra, 'Itens sem cotação separados do pedido ' || ped.numero_pedido || ' em ' || hoje || '.'), ''),
    ped.criado_por, ped.criado_por_nome, ped.criado_por_setor, ped.data_criacao, ped.data_solicitacao, ped.prazo_entrega,
    ped.centro_custo, ped.centro_custo_id, ped.departamento_id, ped.vinculo_tipo, ped.vinculo_id, ped.vinculo_descricao,
    ped.link_url, ped.comprador_email, ped.comprador_nome, ped.oportunidade_id, ped.demanda_avulsa_id)
  returning id into novo_id;

  insert into public.pcp_pedidos_compra_anexos (pedido_id, nome, url, tipo, tamanho, criado_por, criado_por_nome)
    select novo_id, nome, url, tipo, tamanho, criado_por, criado_por_nome from public.pcp_pedidos_compra_anexos where pedido_id = ped.id;

  -- o original fica só com o que tem cotação; a escolha de vencedora e as cotações apontam para a posição do item, então são renumeradas
  update public.pcp_pedidos_compra set
      itens = itens_mant, descricao_material = desc_orig, quantidade = greatest(1, round(qtd_mant)),
      vencedoras = case when ped.vencedoras is not null and jsonb_typeof(ped.vencedoras) = 'array' then
        (select coalesce(jsonb_agg(jsonb_set(v, '{itens}',
            (select coalesce(jsonb_agg(mapa -> e), '[]'::jsonb) from jsonb_array_elements_text(coalesce(v->'itens', '[]'::jsonb)) e))), '[]'::jsonb)
           from jsonb_array_elements(ped.vencedoras) v)
        else ped.vencedoras end
    where id = ped.id;
  update public.pcp_cotacoes_fornecedores c set itens =
      (select jsonb_agg(jsonb_set(x, '{indice}', mapa -> (x->>'indice'))) from jsonb_array_elements(c.itens) x)
    where c.pedido_id = ped.id;

  insert into public.pcp_pedidos_compra_historico (pedido_id, tipo, status_de, status_para, motivo, dados, usuario_email, usuario_nome) values
    (ped.id, 'divisao', ped.status_compra, ped.status_compra,
     'Itens sem cotação separados no pedido ' || novo_num || ': ' || coalesce((select string_agg(e->>'nome', ', ') from jsonb_array_elements(itens_fora) e), ''),
     jsonb_build_object('novo_pedido', novo_num, 'itens', itens_fora), p_usuario_email, p_usuario_nome),
    (novo_id, 'divisao', null, 'Pendente',
     'Pedido aberto com os itens sem cotação do pedido ' || ped.numero_pedido || '.',
     jsonb_build_object('pedido_origem', ped.numero_pedido), p_usuario_email, p_usuario_nome);

  return jsonb_build_object('novo_id', novo_id, 'novo_numero', novo_num, 'mapa', mapa, 'itens_fora', itens_fora);
end $$;
revoke all on function public.compras_dividir_pedido(uuid, int[], text, text) from public, anon;
grant execute on function public.compras_dividir_pedido(uuid, int[], text, text) to authenticated;