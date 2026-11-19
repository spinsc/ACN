-- ENTREGA POR FORNECEDOR — etapa E3 (atrasos e Calendário), 17/11/2026 (PLANO_ENTREGA_POR_FORNECEDOR.md).
-- Decidido com o usuário: cada data é do seu fornecedor em tudo, inclusive no alerta de atraso e no Calendário.
--
-- 1) `compras_entregas.posicao_em`: quando a posição daquela entrega foi registrada em Avisos ("o que aconteceu com a entrega e qual a nova previsão").
--    É o que silencia o alerta de UM fornecedor por 24 horas úteis sem silenciar o do outro (antes a posição era do pedido todo).
--    Coluna nova e vazia, sem índice: a tabela tem 0 linhas e o alerta lê só as entregas dos pedidos "Comprado".
-- 2) Calendário: o ramo "compra_entrega" de `calendario_eventos_base_1` passa a dar UM evento por entrega ainda aberta (e não um por pedido):
--      • pedido de um fornecedor só (a maioria, com ou sem linha em `compras_entregas`): idêntico ao de antes — mesma chave (`ref_id` = id do pedido, para o que a
--        pessoa já dispensou em "Já cuidei" não voltar), mesmo título, e o prazo prometido ao cliente/produção continua mandando na data;
--      • pedido de vários fornecedores: um evento por fornecedor, com a data dele; chave `pedido#cotação` (a tela de origem abre o pedido pelo que vem antes do "#");
--        o prazo prometido, que é do pedido todo, só aparece escrito no detalhe;
--      • entrega já recebida não aparece; pedido sem linhas vale como entrega "virtual" (uma por vencedora, ou a do próprio pedido), como na tela (`ComprasEntregas.ts`).
--    A função é refeita a partir da definição que está no banco (troca só o trecho do ramo), para não copiar à mão as outras 12 fontes de data.
--
-- Custo: o ramo lê `pcp_pedidos_compra` filtrado por "Comprado" (14 linhas hoje) e `compras_entregas` pelo índice de `pedido_id`; ensaio de custo antes e depois.
-- Para desfazer: `compras_entregas_alertas_calendario_reverter.sql`.

alter table public.compras_entregas add column if not exists posicao_em timestamptz;
comment on column public.compras_entregas.posicao_em is 'Quando a posição desta entrega (o que aconteceu e a nova previsão) foi registrada em Avisos; silencia o alerta de atraso DESTE fornecedor por 24 horas úteis.';

do $mig$
declare
  d text; antigo text; novo text;
begin
  d := pg_get_functiondef('public.calendario_eventos_base_1(date,date)'::regprocedure);
  if position('compras_entregas' in d) > 0 then
    raise notice 'calendario_eventos_base_1 já lê compras_entregas: nada a trocar';
    return;
  end if;

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

  if position(antigo in d) = 0 then
    raise exception 'o ramo antigo de compra_entrega não foi achado em calendario_eventos_base_1 (a função mudou depois de 17/11/2026?): nada foi alterado';
  end if;
  execute replace(d, antigo, novo);
end
$mig$;
