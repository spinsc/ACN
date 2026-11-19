-- DESFAZ a E3 da entrega por fornecedor (compras_entregas_alertas_calendario.sql): o ramo "compra_entrega" do Calendário volta a dar um evento por PEDIDO
-- (com a data mais distante do pedido) e a coluna `compras_entregas.posicao_em` sai. Os avisos do calendário já gravados continuam valendo (a rotina os resolve ou renova).
-- A coluna só sai se NENHUMA entrega tem posição registrada (senão o texto "o que aconteceu com a entrega" se perderia): nesse caso, apague a coluna à mão depois de conferir.
-- Gerado a partir do arquivo da migração: os dois trechos trocam de lugar.

do $rev$
declare
  d text; novo text; antigo text;
begin
  d := pg_get_functiondef('public.calendario_eventos_base_1(date,date)'::regprocedure);
  novo := $b$  -- entrega ou coleta prevista da compra: UMA POR FORNECEDOR ainda a receber (E3, 17/11/2026)
  select 'compra_entrega',
         case when x.n > 1 then x.pedido_id::text || '#' || coalesce(x.cotacao_id::text, x.entrega_id::text, x.fornecedor) else x.pedido_id::text end,
         x.dia, null::time,
         case when x.coleta then 'Coleta da compra ' else 'Chega a compra ' end || coalesce(x.numero_pedido, '')
           || coalesce(' · ' || nullif(trim(case when x.n > 1 then x.fornecedor else x.fornecedor_do_pedido end), ''), ''),
         case when x.coleta then 'Coleta marcada' else 'Entrega prevista' end || coalesce(' · OC ' || nullif(trim(x.numero_oc), ''), '')
           || case when x.n > 1 and x.prazo_prometido is not null then ' · prazo prometido ' || to_char(x.prazo_prometido, 'DD/MM') else '' end,
         x.responsavel, x.emails, x.nomes,
         array['Almoxarifado', 'Compras'], 'compras', false, true, null::jsonb
    from (
      select p.id as pedido_id, p.numero_pedido, p.numero_oc, p.fornecedor as fornecedor_do_pedido, p.prazo_prometido_entrega as prazo_prometido,
             (p.forma_recebimento = 'coleta') as coleta,
             coalesce(nullif(trim(p.comprador_nome), ''), p.criado_por_nome) as responsavel,
             array_remove(array[cal_nome(p.comprador_email)], null) as emails,
             array_remove(array[cal_nome(p.comprador_nome), cal_nome(p.criado_por_nome)], null) as nomes,
             e.entrega_id, e.cotacao_id, e.fornecedor, e.situacao,
             count(*) over (partition by p.id) as n,   -- conta TODAS as entregas do pedido (recebidas também): a chave de uma não muda quando outra é recebida
             case when count(*) over (partition by p.id) = 1 then coalesce(p.prazo_prometido_entrega, e.dia) else e.dia end as dia
        from pcp_pedidos_compra p
       cross join lateral (
         -- as linhas de compras_entregas do pedido
         select l.id as entrega_id, l.cotacao_id, l.fornecedor, l.situacao, l.data_prevista as dia
           from compras_entregas l where l.pedido_id = p.id
         union all
         -- pedido sem linhas e com mais de um fornecedor vencedor: uma entrega virtual por vencedora, com a data do pedido
         select null::uuid, (v ->> 'cotacao_id')::uuid, nullif(trim(v ->> 'fornecedor'), ''),
                case when coalesce(p.tem_divergencia, false) then 'divergencia' else 'aguardando' end,
                (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date
           from jsonb_array_elements(case when jsonb_typeof(p.vencedoras) = 'array' then p.vencedoras else '[]'::jsonb end) v
          where v ->> 'cotacao_id' is not null
            and not exists (select 1 from compras_entregas l where l.pedido_id = p.id)
            and (select count(*) from jsonb_array_elements(case when jsonb_typeof(p.vencedoras) = 'array' then p.vencedoras else '[]'::jsonb end) w where w ->> 'cotacao_id' is not null) > 1
         union all
         -- pedido sem linhas e com um fornecedor só (ou nenhuma vencedora): a entrega do próprio pedido
         select null::uuid, p.vencedora_id, nullif(trim(p.fornecedor), ''),
                case when coalesce(p.tem_divergencia, false) then 'divergencia' else 'aguardando' end,
                (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date
          where not exists (select 1 from compras_entregas l where l.pedido_id = p.id)
            and (select count(*) from jsonb_array_elements(case when jsonb_typeof(p.vencedoras) = 'array' then p.vencedoras else '[]'::jsonb end) w where w ->> 'cotacao_id' is not null) <= 1
       ) e
       where p.status_compra = 'Comprado' and coalesce(p.coletado_em::text, '') = ''
    ) x
   where x.situacao <> 'recebida' and x.dia between p_inicio and p_fim$b$;
  antigo := $a$  select 'compra_entrega', p.id::text,
         coalesce(p.prazo_prometido_entrega, (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date), null::time,
         case when p.forma_recebimento = 'coleta' then 'Coleta da compra ' else 'Chega a compra ' end || coalesce(p.numero_pedido, '') || coalesce(' · ' || nullif(trim(p.fornecedor), ''), ''),
         case when p.forma_recebimento = 'coleta' then 'Coleta marcada' else 'Entrega prevista' end || coalesce(' · OC ' || nullif(trim(p.numero_oc), ''), ''),
         coalesce(nullif(trim(p.comprador_nome), ''), p.criado_por_nome),
         array_remove(array[cal_nome(p.comprador_email)], null),
         array_remove(array[cal_nome(p.comprador_nome), cal_nome(p.criado_por_nome)], null),
         array['Almoxarifado', 'Compras'], 'compras', false, true, null::jsonb
    from pcp_pedidos_compra p
   where p.status_compra = 'Comprado' and coalesce(p.coletado_em::text, '') = ''
     and coalesce(p.prazo_prometido_entrega, (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date) between p_inicio and p_fim$a$;
  if position('compras_entregas' in d) = 0 then
    raise notice 'calendario_eventos_base_1 já está no formato antigo: nada a trocar';
  else
    if position(novo in d) = 0 then
      raise exception 'o ramo novo de compra_entrega não foi achado em calendario_eventos_base_1 (a função mudou depois da E3?): nada foi alterado';
    end if;
    execute replace(d, novo, antigo);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'compras_entregas' and column_name = 'posicao_em') then
    if exists (select 1 from public.compras_entregas where posicao_em is not null) then
      raise notice 'há entregas com posição registrada: a coluna posicao_em foi mantida';
    else
      alter table public.compras_entregas drop column posicao_em;
    end if;
  end if;
end
$rev$;
