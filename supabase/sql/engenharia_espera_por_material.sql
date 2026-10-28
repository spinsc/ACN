-- 28/10/2026 (pedido do usuário): um desenvolvimento da Engenharia só pode começar quando chega o material de uma compra da OP (ex.: o suporte da barra
-- sinalizadora só se desenvolve quando chega o rack de teto). A demanda de Desenvolvimento passa a ESPERAR um ou mais ITENS de uma OC; a Logística marca a
-- quantidade que chegou de cada item (sem mexer no recebimento da OC) e, na primeira unidade, o desenvolvimento é liberado e a Engenharia é avisada na caixa de Menções.
--
-- 1) chegada por item: tabela própria (não mexe em pcp_pedidos_compra, que tem gatilhos de movimentação e faturamento). O item é identificado pela posição na OC
--    (chave 'i0', 'i1'…) mais o nome, porque os itens da OC não têm código próprio em todos os casos.
-- 2) engenharia_desenvolvimento.espera_material (jsonb): { itens:[{pedido_id,chave,nome,numero,fornecedor}], avisar:[{email,nome}], ligada_em, ligada_por, chegou_em, liberada }.
-- 3) o aviso nasce no banco (gatilho), e não na tela, porque a OC vira "Recebido" em mais de uma tela e o item chega por outra: assim ninguém precisa lembrar de avisar.

create table if not exists public.compras_chegadas_itens (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pcp_pedidos_compra(id),
  chave       text not null,
  nome        text not null,
  quantidade  numeric not null check (quantidade > 0),
  em          timestamptz not null default now(),
  por         text,
  unique (pedido_id, chave)
);
alter table public.compras_chegadas_itens enable row level security;
drop policy if exists etapa17_logado on public.compras_chegadas_itens;
create policy etapa17_logado on public.compras_chegadas_itens for all to authenticated using (public.esta_logado()) with check (public.esta_logado());

alter table public.engenharia_desenvolvimento add column if not exists espera_material jsonb;

-- o item chegou? chegada marcada pela Logística (mesmo nome) OU a OC inteira já está "Recebido"
create or replace function public.engenharia_item_chegou(p_pedido uuid, p_chave text, p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.compras_chegadas_itens c where c.pedido_id = p_pedido and c.chave = p_chave and c.quantidade > 0
                   and lower(btrim(c.nome)) = lower(btrim(coalesce(p_nome, ''))))
      or exists (select 1 from public.pcp_pedidos_compra p where p.id = p_pedido and p.status_compra = 'Recebido');
$$;

-- reavalia UMA demanda: todos os itens chegaram → marca chegou_em, escreve no histórico e avisa; voltou a faltar item → tira a marca
create or replace function public.engenharia_reavaliar_espera(p_demanda uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record; todos boolean; n int; pessoa jsonb; u record; oc text; texto text;
begin
  select * into d from public.engenharia_desenvolvimento where id = p_demanda for update;
  if not found or d.espera_material is null or d.situacao = 'cancelada' then return; end if;
  if jsonb_typeof(d.espera_material->'liberada') = 'object' then return; end if;     -- liberada à mão por um gerente: nada a avaliar
  n := jsonb_array_length(coalesce(d.espera_material->'itens', '[]'::jsonb));
  if n = 0 then return; end if;
  todos := not exists (
    select 1 from jsonb_array_elements(d.espera_material->'itens') e
    where not public.engenharia_item_chegou((e->>'pedido_id')::uuid, e->>'chave', e->>'nome'));

  if todos and coalesce(d.espera_material->>'chegou_em', '') = '' then
    update public.engenharia_desenvolvimento
       set espera_material = espera_material || jsonb_build_object('chegou_em', now()),
           historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'em', now(), 'por', 'Sistema', 'tipo', 'material_chegou', 'etapa', null,
             'texto', 'Chegou o material esperado: o desenvolvimento pode ser iniciado')),
           atualizado_em = now()
     where id = p_demanda;
    texto := 'Chegou o material esperado para "' || coalesce(d.titulo, 'o desenvolvimento') || '"' ||
             case when d.numero_opl is not null then ' (OP ' || d.numero_opl || ')' else '' end || ': a Engenharia já pode iniciar.';
    for pessoa in select * from jsonb_array_elements(coalesce(d.espera_material->'avisar', '[]'::jsonb)) loop
      select id, nome into u from public.auth_usuarios where lower(email) = lower(pessoa->>'email') limit 1;
      if found then
        insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao,
                                    campo, texto_trecho, aba_destino, lida, criado_em)
        values (u.id::text, u.nome, '', 'Sistema', 'engenharia_desenvolvimento', d.id::text,
                'Desenvolvimento: ' || coalesce(d.titulo, ''), 'material_chegou', left(texto, 200), 'engenharia', false, now());
      end if;
    end loop;
  elsif not todos and coalesce(d.espera_material->>'chegou_em', '') <> '' then
    update public.engenharia_desenvolvimento
       set espera_material = espera_material - 'chegou_em',
           historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'em', now(), 'por', 'Sistema', 'tipo', 'material_voltou', 'etapa', null,
             'texto', 'Um item esperado deixou de constar como chegado: o desenvolvimento volta a esperar o material')),
           atualizado_em = now()
     where id = p_demanda;
  end if;
end $$;

-- reavalia as demandas que esperam algum item desta OC
create or replace function public.engenharia_reavaliar_por_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.engenharia_desenvolvimento
            where espera_material is not null
              and espera_material->'itens' @> jsonb_build_array(jsonb_build_object('pedido_id', p_pedido::text)) loop
    perform public.engenharia_reavaliar_espera(r.id);
  end loop;
end $$;

create or replace function public.trg_chegada_item_reavalia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- no DELETE o NEW não existe: escolher pelo tipo da operação, e não por coalesce(new, old)
  if tg_op = 'DELETE' then perform public.engenharia_reavaliar_por_pedido(old.pedido_id);
  else perform public.engenharia_reavaliar_por_pedido(new.pedido_id); end if;
  return null;
end $$;
drop trigger if exists trg_chegada_item_reavalia on public.compras_chegadas_itens;
create trigger trg_chegada_item_reavalia after insert or update or delete on public.compras_chegadas_itens
  for each row execute function public.trg_chegada_item_reavalia();

create or replace function public.trg_pedido_recebido_reavalia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.engenharia_reavaliar_por_pedido(new.id);
  return null;
end $$;
drop trigger if exists trg_pedido_recebido_reavalia on public.pcp_pedidos_compra;
create trigger trg_pedido_recebido_reavalia after update of status_compra on public.pcp_pedidos_compra
  for each row when (old.status_compra is distinct from new.status_compra and (old.status_compra = 'Recebido' or new.status_compra = 'Recebido'))
  execute function public.trg_pedido_recebido_reavalia();

-- funções de gatilho e de apoio: só quem entrou (nunca a chave pública)
revoke all on function public.engenharia_item_chegou(uuid, text, text) from public, anon;
revoke all on function public.engenharia_reavaliar_espera(uuid) from public, anon;
revoke all on function public.engenharia_reavaliar_por_pedido(uuid) from public, anon;
grant execute on function public.engenharia_item_chegou(uuid, text, text) to authenticated;
