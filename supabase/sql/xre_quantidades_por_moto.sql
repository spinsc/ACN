-- XRE300, OPs A1733.2610 a A1738.2610 — correção das quantidades da estrutura para UMA moto
-- (pedido do usuário em 05/11/2026: "A XRE foi descrita com a quantidade da venda inteira, gerou 6 OPs
-- e a estrutura foi montada em cima disso. Os itens vendidos já foram ajustados, a estrutura não.").
--
-- O que houve: em 29/10/2026 as seis OPs traziam nos itens vendidos o total das 6 motos; as respostas
-- "Quantos na frente / atrás / no retrovisor" foram multiplicadas por 6 (12 em vez de 2) e as BOMs foram
-- geradas e liberadas em cima disso. Em 05/11/2026 o Comercial corrigiu os itens vendidos (1 controlador,
-- 1 sirene, 2 slimleds azuis, 4 vermelhos, 1 conjunto por moto), mas a correção não recalcula respostas
-- nem BOM. A estrutura do veículo (veiculo_item_materiais e a regra do chicote) está certa por unidade.
--
-- O que este script faz, tudo ou nada (qualquer conferência que falhe desfaz tudo):
--   1. cópia de segurança das 6 BOMs e das respostas das 6 OPs;
--   2. as 18 respostas de quantidade que valem 12 passam a valer 2 (a quantidade de UMA moto);
--   3. as 6 BOMs são regravadas com a quantidade de uma moto, sem a TAXA MAXI FROTAS e sem a linha do
--      CONJUNTO ELETRICO (decisão do usuário: taxa não é material de prateleira; o conjunto aparece só
--      como título do chicote);
--   4. antes de gravar, confere a BOM nova contra a conta da estrutura do veículo com as respostas novas.
-- Não mexe em status_bom, bom_liberado, data_liberacao_bom nem em nenhuma outra coluna da OP.

create table public.oples_xre_antes_20261105 as
  select id, opl, bom_itens, status_bom, bom_liberado, data_liberacao_bom
    from public.oples
   where opl = any (array['A1733.2610','A1734.2610','A1735.2610','A1736.2610','A1737.2610','A1738.2610']);
alter table public.oples_xre_antes_20261105 enable row level security;

create table public.op_configuracao_respostas_xre_antes_20261105 as
  select r.*
    from public.op_configuracao_respostas r
    join public.oples o on o.id = r.opl_id
   where o.opl = any (array['A1733.2610','A1734.2610','A1735.2610','A1736.2610','A1737.2610','A1738.2610']);
alter table public.op_configuracao_respostas_xre_antes_20261105 enable row level security;

do $$
declare
  v_ops   uuid[];
  v_novo  jsonb;
  v_n     int;
  v_dif   int;
begin
  select array_agg(id) into v_ops
    from public.oples
   where opl = any (array['A1733.2610','A1734.2610','A1735.2610','A1736.2610','A1737.2610','A1738.2610']);
  if coalesce(array_length(v_ops, 1), 0) <> 6 then
    raise exception 'XRE: esperava 6 OPs, encontrei %', coalesce(array_length(v_ops, 1), 0);
  end if;

  -- 2. respostas: 12 (seis motos) vira 2 (uma moto)
  update public.op_configuracao_respostas
     set valor_numerico = 2,
         respondido_por = 'MATHEUS SPINELLI (corrigido de 12 para 2, quantidade de UMA moto, por Claude em 05/11/2026)',
         respondido_em  = now()
   where opl_id = any (v_ops) and valor_numerico = 12;
  get diagnostics v_n = row_count;
  if v_n <> 18 then
    raise exception 'XRE: esperava corrigir 18 respostas, corrigiria %', v_n;
  end if;

  -- 3. BOM nova: o modelo é a BOM da A1733 (as materiais dela são exatamente 6x as de uma moto);
  --    o chicote (1 por conjunto) já está certo, o resto divide por 6.
  select jsonb_agg(l.linha order by l.grupo, l.ord) into v_novo
    from (
      select case when (e.b->>'item_id') = 'dbb83cda-2026-489e-a5ae-546098075906'
                  then e.b
                  else jsonb_set(e.b, '{quantidade}', to_jsonb(trim_scale(round((e.b->>'quantidade')::numeric / 6, 4))))
             end as linha,
             case when e.b ? 'pai_item_id' then 1 else 0 end as grupo,
             e.ord
        from public.oples o,
             jsonb_array_elements(o.bom_itens) with ordinality as e(b, ord)
       where o.opl = 'A1733.2610'
         and (e.b->>'item_id') not in ('7ce64c2b-3253-4e04-855b-53a448326d0e',   -- TAXA MAXI FROTAS
                                       '9639e126-3c06-4f5c-9ff0-7be2069e584f')   -- CONJUNTO ELETRICO
    ) l;
  if v_novo is null or jsonb_array_length(v_novo) <> 23 then
    raise exception 'XRE: a BOM nova deveria ter 23 linhas, tem %', coalesce(jsonb_array_length(v_novo), 0);
  end if;

  -- 4. conferência independente: a conta da estrutura do veículo (material x resposta, ou material x
  --    quantidade do item pai) com as respostas JÁ corrigidas e os itens vendidos de UMA moto
  with qtd_item(item_id, qtd) as (
    values ('58d6750d-ea3b-461e-9b14-6041e9eec5be'::uuid, 1::numeric),   -- CONTROLADOR PARA MOTO M01
           ('5e4a1967-d690-4d72-aade-815297503865'::uuid, 1::numeric),   -- SIRENE AMPLIFICADA LF40
           ('cea70c42-1a5e-4de4-a7c2-5d8de66b5e02'::uuid, 2::numeric),   -- SLIMLED4 G2 AZUL
           ('4aac14c3-b902-40d6-a328-212fb72ee7a3'::uuid, 4::numeric)    -- SLIMLED4 G2 VERMELHO
  ), resp as (
    select r.pergunta_id, r.valor_numerico
      from public.op_configuracao_respostas r
      join public.oples o on o.id = r.opl_id
     where o.opl = 'A1733.2610' and r.valor_numerico is not null
  ), esperado as (
    select vm.material_item_id, vm.item_id as pai_id,
           sum(vm.quantidade * case when vm.multiplicar_pergunta_id is null
                                    then q.qtd
                                    else coalesce(rp.valor_numerico, 0) end) as qtd
      from public.veiculo_item_materiais vm
      join qtd_item q on q.item_id = vm.item_id
      left join resp rp on rp.pergunta_id = vm.multiplicar_pergunta_id
     where vm.veiculo_id = '46673d33-6953-4ac3-b97f-874e9477bde8'
     group by vm.material_item_id, vm.item_id
    having sum(vm.quantidade * case when vm.multiplicar_pergunta_id is null
                                    then q.qtd
                                    else coalesce(rp.valor_numerico, 0) end) > 0
  ), gravado as (
    select (b->>'item_id')::uuid as material_item_id, (b->>'pai_item_id')::uuid as pai_id,
           sum((b->>'quantidade')::numeric) as qtd
      from jsonb_array_elements(v_novo) b
     where b ? 'pai_item_id' and (b->>'item_id') <> 'dbb83cda-2026-489e-a5ae-546098075906'
     group by 1, 2
  ), itens as (
    select (b->>'item_id')::uuid as item_id, (b->>'quantidade')::numeric as qtd
      from jsonb_array_elements(v_novo) b
     where not (b ? 'pai_item_id')
  )
  select (select count(*) from esperado e full join gravado g
                 on g.material_item_id = e.material_item_id and g.pai_id = e.pai_id
           where e.qtd is distinct from g.qtd)
       + (select count(*) from itens i full join qtd_item q on q.item_id = i.item_id
           where i.qtd is distinct from q.qtd)
    into v_dif;
  if v_dif <> 0 then
    raise exception 'XRE: a BOM nova difere da conta da estrutura em % linha(s); nada foi gravado', v_dif;
  end if;

  update public.oples set bom_itens = v_novo where id = any (v_ops);
  get diagnostics v_n = row_count;
  if v_n <> 6 then
    raise exception 'XRE: esperava regravar 6 BOMs, regravaria %', v_n;
  end if;
end $$;
