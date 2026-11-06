-- XRE300 — troca de itens da estrutura e das BOMs das OPs A1733 a A1738.2610 (pedido do usuário em 06/11/2026).
--   1. Parafuso 289 (SEXT. 8.8 M6X25 ZB RI), 2 por sirene  -> 276 (SEXT. 5.8 M6X40 ZB RI), mesma quantidade.
--   2. Suportes 895 (2X SLIMLED4 LE - XRE300) e 798 (90º 2X LD - XRE300), nas 4 linhas do azul e do vermelho
--      -> 99999 (SUPORTE GENÉRICO - ADAPTADO DE SUPORTE EXISTENTE), mesma quantidade (0,5 + 0,5 por resposta,
--      que na BOM do azul soma 2 numa linha só).
--   3. Chicote da regra "Chicote da moto (Conjunto Elétrico vendido)": 4478 (G2 4D / 2T C/ CONN.) -> 81
--      (G1 .D / .T S CONN. SOLDA). Não existe no cadastro o G2 4D / 2T S/ CONN.; o usuário escolheu o 81.
--   4. As 6 BOMs das OPs recebem as mesmas trocas (mesma quantidade), sem mexer em status_bom, bom_liberado
--      nem data_liberacao_bom.
-- Cópia do antes: veiculo_item_materiais_xre_antes_20261106, veiculo_regra_materiais_xre_antes_20261106 e
-- oples_xre_antes_20261106. Tudo ou nada: qualquer conferência que falhe desfaz tudo; no fim a BOM nova de cada OP é
-- conferida contra a conta da estrutura já trocada (respostas daquela moto, itens vendidos de uma moto).
-- Ajuste feito na primeira tentativa (06/11/2026): as BOMs da A1734 e da A1735 tinham as mesmas 23 linhas das outras
-- quatro, só em OUTRA ORDEM (alguém reabriu e salvou a BOM delas). A conferência passou a comparar o conteúdo sem olhar a
-- ordem, e cada OP é regravada a partir da PRÓPRIA BOM (a ordem de cada uma fica como está), não de uma cópia da A1733.

create table public.veiculo_item_materiais_xre_antes_20261106 as
  select * from public.veiculo_item_materiais
   where id in ('c39b8ed6-5492-426e-b9a1-426a9b32db95','0952e248-ef73-4a31-922e-6c6c1ee9a0e4','adf7f839-3c17-4a33-a7b0-36698dd5361d',
                'b9a34517-ead3-4215-aaa5-410c98c98475','8289ff45-cb4d-430a-923e-5539c6f1df90');
alter table public.veiculo_item_materiais_xre_antes_20261106 enable row level security;

create table public.veiculo_regra_materiais_xre_antes_20261106 as
  select * from public.veiculo_regra_materiais where id = '92862ba3-8bbe-463e-b74d-23f0422e117a';
alter table public.veiculo_regra_materiais_xre_antes_20261106 enable row level security;

create table public.oples_xre_antes_20261106 as
  select id, opl, bom_itens, status_bom, bom_liberado, data_liberacao_bom
    from public.oples
   where opl = any (array['A1733.2610','A1734.2610','A1735.2610','A1736.2610','A1737.2610','A1738.2610']);
alter table public.oples_xre_antes_20261106 enable row level security;

do $$
declare
  v_ops   uuid[];
  v_n     int;
  v_dif   int;
  v_novo  jsonb;
  v_id    uuid;
  v_opl   text;
begin
  select array_agg(id) into v_ops from public.oples
   where opl = any (array['A1733.2610','A1734.2610','A1735.2610','A1736.2610','A1737.2610','A1738.2610']);
  if coalesce(array_length(v_ops, 1), 0) <> 6 then
    raise exception 'XRE: esperava 6 OPs, achei %', coalesce(array_length(v_ops, 1), 0);
  end if;
  -- os três itens novos existem e são os que o usuário disse
  select count(*) into v_n from public.cadastro_itens
   where (id, codigo) in (('449d0fbf-fbfc-426f-a59f-885019c5453c'::uuid, '276'),
                          ('d4c53835-efe8-494d-a6f4-54e885df0336'::uuid, '99999'),
                          ('d0197cd9-78bd-4292-80b3-24ac9cca748d'::uuid, '81'));
  if v_n <> 3 then raise exception 'XRE: esperava achar os itens 276, 99999 e 81, achei %', v_n; end if;
  -- as 6 BOMs têm as mesmas linhas (a ordem pode variar: a A1734 e a A1735 foram reabertas e salvas); se o CONTEÚDO
  -- de uma mudou, alguém mexeu nela de verdade e não se troca às cegas
  select count(distinct h) into v_n from (
    select o.id, md5(string_agg(b::text, '|' order by b::text)) as h
      from public.oples o, jsonb_array_elements(o.bom_itens) as b
     where o.id = any (v_ops)
     group by o.id) s;
  if v_n <> 1 then raise exception 'XRE: as 6 BOMs não têm mais as mesmas linhas (% versões); nada foi trocado', v_n; end if;

  -- 1. parafuso 289 -> 276 (a linha da sirene)
  update public.veiculo_item_materiais set material_item_id = '449d0fbf-fbfc-426f-a59f-885019c5453c'
   where id = 'c39b8ed6-5492-426e-b9a1-426a9b32db95' and material_item_id = '84dcff90-686f-4f51-8006-ef5a8999a59d';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'XRE: esperava trocar 1 parafuso, trocaria %', v_n; end if;

  -- 2. suportes 895 e 798 -> 99999 (2 linhas do azul e 2 do vermelho)
  update public.veiculo_item_materiais set material_item_id = 'd4c53835-efe8-494d-a6f4-54e885df0336'
   where id in ('0952e248-ef73-4a31-922e-6c6c1ee9a0e4','adf7f839-3c17-4a33-a7b0-36698dd5361d',
                'b9a34517-ead3-4215-aaa5-410c98c98475','8289ff45-cb4d-430a-923e-5539c6f1df90')
     and material_item_id in ('49f4aafa-bf4a-4266-8af1-c709bb43faa5','bdd6ad73-6204-4bba-86e1-b7a16a98a300');
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'XRE: esperava trocar 4 suportes, trocaria %', v_n; end if;

  -- 3. chicote da regra 4478 -> 81
  update public.veiculo_regra_materiais set material_item_id = 'd0197cd9-78bd-4292-80b3-24ac9cca748d'
   where id = '92862ba3-8bbe-463e-b74d-23f0422e117a' and material_item_id = 'dbb83cda-2026-489e-a5ae-546098075906';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'XRE: esperava trocar 1 chicote, trocaria %', v_n; end if;

  -- 4. a BOM de CADA OP, a partir da própria BOM: troca os itens, soma o que ficou repetido sob o mesmo pai
  --    (os dois suportes do azul) e mantém a ordem em que a OP já estava
  for v_id, v_opl in select id, opl from public.oples where id = any (v_ops) order by opl loop
    with base as (
      select e.b, e.ord from public.oples o, jsonb_array_elements(o.bom_itens) with ordinality as e(b, ord) where o.id = v_id
    ), troca as (
      select case when m.novo is not null
                  then base.b || jsonb_build_object('item_id', ci.id::text, 'codigo', ci.codigo, 'nome', ci.nome, 'unidade', coalesce(ci.unidade, 'UN'))
                  else base.b end as linha,
             base.ord
        from base
        left join (values ('84dcff90-686f-4f51-8006-ef5a8999a59d', '449d0fbf-fbfc-426f-a59f-885019c5453c'::uuid),
                          ('49f4aafa-bf4a-4266-8af1-c709bb43faa5', 'd4c53835-efe8-494d-a6f4-54e885df0336'::uuid),
                          ('bdd6ad73-6204-4bba-86e1-b7a16a98a300', 'd4c53835-efe8-494d-a6f4-54e885df0336'::uuid),
                          ('dbb83cda-2026-489e-a5ae-546098075906', 'd0197cd9-78bd-4292-80b3-24ac9cca748d'::uuid)) as m(velho, novo)
               on m.velho = base.b->>'item_id'
        left join public.cadastro_itens ci on ci.id = m.novo
    ), agrupado as (
      select (array_agg(linha order by ord))[1] as primeira,
             sum((linha->>'quantidade')::numeric) as qtd,
             min(ord) as pos
        from troca
       group by linha->>'item_id', coalesce(linha->>'pai_item_id', '')
    )
    select jsonb_agg(jsonb_set(primeira, '{quantidade}', to_jsonb(trim_scale(qtd))) order by pos) into v_novo from agrupado;
    if v_novo is null or jsonb_array_length(v_novo) <> 22 then
      raise exception 'XRE %: a BOM nova deveria ter 22 linhas, tem %', v_opl, coalesce(jsonb_array_length(v_novo), 0);
    end if;

    -- 5. conferência: a BOM nova contra a conta da estrutura já trocada (material x resposta daquela OP, ou material x
    --    quantidade do item pai)
    with qtd_item(item_id, qtd) as (
      values ('58d6750d-ea3b-461e-9b14-6041e9eec5be'::uuid, 1::numeric),
             ('5e4a1967-d690-4d72-aade-815297503865'::uuid, 1::numeric),
             ('cea70c42-1a5e-4de4-a7c2-5d8de66b5e02'::uuid, 2::numeric),
             ('4aac14c3-b902-40d6-a328-212fb72ee7a3'::uuid, 4::numeric)
    ), resp as (
      select r.pergunta_id, r.valor_numerico
        from public.op_configuracao_respostas r
       where r.opl_id = v_id and r.valor_numerico is not null
    ), esperado as (
      select vm.material_item_id, vm.item_id as pai_id,
             sum(vm.quantidade * case when vm.multiplicar_pergunta_id is null then q.qtd else coalesce(rp.valor_numerico, 0) end) as qtd
        from public.veiculo_item_materiais vm
        join qtd_item q on q.item_id = vm.item_id
        left join resp rp on rp.pergunta_id = vm.multiplicar_pergunta_id
       where vm.veiculo_id = '46673d33-6953-4ac3-b97f-874e9477bde8'
       group by vm.material_item_id, vm.item_id
      having sum(vm.quantidade * case when vm.multiplicar_pergunta_id is null then q.qtd else coalesce(rp.valor_numerico, 0) end) > 0
    ), gravado as (
      select (b->>'item_id')::uuid as material_item_id, (b->>'pai_item_id')::uuid as pai_id, sum((b->>'quantidade')::numeric) as qtd
        from jsonb_array_elements(v_novo) b
       where b ? 'pai_item_id' and (b->>'item_id') <> 'd0197cd9-78bd-4292-80b3-24ac9cca748d'
       group by 1, 2
    ), itens as (
      select (b->>'item_id')::uuid as item_id, (b->>'quantidade')::numeric as qtd
        from jsonb_array_elements(v_novo) b where not (b ? 'pai_item_id')
    )
    select (select count(*) from esperado e full join gravado g on g.material_item_id = e.material_item_id and g.pai_id = e.pai_id
             where e.qtd is distinct from g.qtd)
         + (select count(*) from itens i full join qtd_item q on q.item_id = i.item_id where i.qtd is distinct from q.qtd)
      into v_dif;
    if v_dif <> 0 then
      raise exception 'XRE %: a BOM nova difere da conta da estrutura em % linha(s); nada foi gravado', v_opl, v_dif;
    end if;
    -- o chicote: uma linha, o 81, quantidade 1, sob o Conjunto Elétrico
    select count(*) into v_n from jsonb_array_elements(v_novo) b
     where b->>'item_id' = 'd0197cd9-78bd-4292-80b3-24ac9cca748d' and (b->>'quantidade')::numeric = 1 and b->>'pai_item_id' = '9639e126-3c06-4f5c-9ff0-7be2069e584f';
    if v_n <> 1 then raise exception 'XRE %: o chicote 81 deveria estar 1 vez sob o Conjunto Elétrico, está % vez(es)', v_opl, v_n; end if;
    -- e nenhum dos itens velhos pode sobrar
    select count(*) into v_n from jsonb_array_elements(v_novo) b
     where b->>'item_id' in ('84dcff90-686f-4f51-8006-ef5a8999a59d','49f4aafa-bf4a-4266-8af1-c709bb43faa5','bdd6ad73-6204-4bba-86e1-b7a16a98a300','dbb83cda-2026-489e-a5ae-546098075906');
    if v_n <> 0 then raise exception 'XRE %: sobraram % linha(s) com item velho', v_opl, v_n; end if;

    update public.oples set bom_itens = v_novo where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'XRE %: esperava regravar 1 BOM, regravaria %', v_opl, v_n; end if;
  end loop;
end $$;
