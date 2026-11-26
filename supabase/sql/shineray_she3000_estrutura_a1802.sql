-- Estrutura de instalação do veículo "Shineray SHE-3000 2023" (kit moto da OP A1802.2611, MR Telecomunicações),
-- montada pela planilha 304 em 26/11/2026, a pedido do usuário. O veículo não tinha estrutura nenhuma
-- (0 materiais, 0 regras), então nada é alterado: só se acrescentam linhas marcadas com o texto abaixo
-- (para desfazer: shineray_she3000_estrutura_a1802_reverter.sql).
--
-- Como a planilha foi lida (a planilha é de UMA moto: 2 luzes na frente e 2 atrás):
--  * Slimled4 G2 Âmbar (item 246): material POR LUZ, multiplicado pela resposta de "Quantos na frente?" /
--    "Quantos atrás?" (mesmo padrão da XRE300): frente = suporte 767 (retrovisor), atrás = suporte 820 + parafuso 303.
--  * Terminal e selo "Fant." da planilha = terminal 33 e selo 35 (regra do usuário de 28/10/2026), 4 de cada por luz.
--  * Controlador M01 (2335): suporte 2931 x1 por controlador vendido.
--  * Sirene LF40 (1278): material do DRIVER da planilha (276 x2, 141 x4, 339 x2). A venda desta OP não traz sirene:
--    o material só vale quando uma sirene for vendida.
--  * Chicote 79 (1 por moto na planilha) = REGRA do veículo "Conjunto Elétrico vendido" + Caracterizado + Frontal
--    + Controladora Detech, quantidade 2 (a OP A1802 tem 2 motos; escolha do usuário em 26/11/2026).
--    Nunca se grava material no Conjunto Elétrico (1687): ele é só o gatilho da regra.

do $$
declare
  v_veiculo constant uuid := '45aa30bd-9342-460b-9572-6a2a2b108800';
  v_slim constant uuid := 'aa4ba321-ba94-479d-b666-79aa2d2918d9';       -- Slimled4 G2 Ambar (246)
  v_ctrl constant uuid := '58d6750d-ea3b-461e-9b14-6041e9eec5be';       -- Controlador moto M01 (2335)
  v_sirene constant uuid := '5e4a1967-d690-4d72-aade-815297503865';     -- Sirene amplificada LF40 (1278)
  v_conj constant uuid := '9639e126-3c06-4f5c-9ff0-7be2069e584f';       -- Conjunto Elétrico (1687), só gatilho
  v_frente constant uuid := '62fe54ad-d86c-4f94-9682-779fd53e73e4';     -- "Quantos na frente?"
  v_atras constant uuid := '188e2874-28db-4549-b4ee-28c3cb237c8b';      -- "Quantos atrás?"
  v_marca constant text := 'Claude — planilha OPL A1802 (Shineray SHE-3000), 26/11/2026';
  v_regra uuid;
  v_n int;
  v_ids jsonb := jsonb_build_object(
    '79','dc51cf01-b831-4a96-b01c-9c9bf5e6e0aa','767','0bfe4537-3390-4cbc-94b9-eac97676e9fb',
    '820','1a24ceea-6f5d-411c-bbf6-683c4391e81a','320','d8fe1bb2-47ab-4299-a031-3e2648699e94',
    '346','8391d381-e725-41df-81a5-4a12eabe8b8f','594','639d3d85-4dfc-44d2-b96f-d6c0160b5cf2',
    '760','3d77c943-3268-4dea-83ae-ceba6a0b4f45','303','cda87da3-fc88-4ed3-a07f-7ce5f7dce365',
    '33','8f684b20-aea8-4468-b216-697f95e20dad','35','171d7fae-d979-4b45-9c64-84f327ff5513',
    '2931','e1e05f7f-feb2-4285-8e33-c4b9ac574f2e','276','449d0fbf-fbfc-426f-a59f-885019c5453c',
    '141','ff267938-6d09-47c7-bcc0-65c71de504e1','339','c757c2f9-179c-4c1a-81ec-3c844960738c');
  r record;
begin
  -- só mexe se o veículo continua sem estrutura (nada de misturar com algo que alguém tenha gravado depois)
  select count(*) into v_n from veiculo_item_materiais where veiculo_id = v_veiculo;
  if v_n <> 0 then raise exception 'O veículo já tem % materiais: nada foi gravado', v_n; end if;
  select count(*) into v_n from veiculo_regras where veiculo_id = v_veiculo;
  if v_n <> 0 then raise exception 'O veículo já tem % regras: nada foi gravado', v_n; end if;

  -- cada código tem de existir, ativo, com o id esperado
  for r in select k as cod, v #>> '{}' as id from jsonb_each(v_ids) as t(k, v) loop
    select count(*) into v_n from cadastro_itens where id = r.id::uuid and codigo = r.cod and ativo;
    if v_n <> 1 then raise exception 'Item de código % não confere com o cadastro', r.cod; end if;
  end loop;

  -- material por item vendido: (item, pergunta que multiplica, código do material, quantidade por luz/unidade, observação)
  insert into veiculo_item_materiais (veiculo_id, item_id, material_item_id, quantidade, acao, observacoes, ordem, criado_por_nome, multiplicar_pergunta_id)
  select v_veiculo, x.item, (v_ids ->> x.cod)::uuid, x.qtd, 'adicionar', x.obs, x.ordem, v_marca, x.pergunta
  from (values
    -- Slimled na FRENTE (suporte de retrovisor 767, sem parafuso 303)
    (v_slim, v_frente, '767',  1::numeric,     null::text, 1),
    (v_slim, v_frente, '320',  2,              null, 2),
    (v_slim, v_frente, '346',  2,              null, 3),
    (v_slim, v_frente, '594',  0.25,           'Planilha 304: 0,5 de fita para as 2 luzes da frente', 4),
    (v_slim, v_frente, '760',  1,              null, 5),
    (v_slim, v_frente, '33',   4,              'Planilha 304: terminal "Fant." = 33', 6),
    (v_slim, v_frente, '35',   4,              'Planilha 304: selo "Fant." = 35', 7),
    -- Slimled ATRÁS (suporte 90 graus longo 820 e parafuso autobrocante 303)
    (v_slim, v_atras,  '820',  1,              null, 8),
    (v_slim, v_atras,  '320',  2,              null, 9),
    (v_slim, v_atras,  '346',  2,              null, 10),
    (v_slim, v_atras,  '303',  2,              null, 11),
    (v_slim, v_atras,  '594',  0.125,          'Planilha 304: 0,25 de fita para as 2 luzes de trás', 12),
    (v_slim, v_atras,  '760',  1,              null, 13),
    (v_slim, v_atras,  '33',   4,              'Planilha 304: terminal "Fant." = 33', 14),
    (v_slim, v_atras,  '35',   4,              'Planilha 304: selo "Fant." = 35', 15),
    -- Controlador M01: um suporte por controlador vendido
    (v_ctrl, null::uuid, '2931', 1,            null, 1),
    -- Sirene LF40 (driver): só vale se a venda trouxer a sirene
    (v_sirene, null::uuid, '276', 2,           'Planilha 304 (DRIVER): só vale com a sirene vendida', 1),
    (v_sirene, null::uuid, '141', 4,           'Planilha 304 (DRIVER)', 2),
    (v_sirene, null::uuid, '339', 2,           'Planilha 304 (DRIVER)', 3)
  ) as x(item, pergunta, cod, qtd, obs, ordem);
  get diagnostics v_n = row_count;
  if v_n <> 19 then raise exception 'Esperava 19 materiais e gravei %', v_n; end if;

  -- regra do veículo: chicote da moto
  insert into veiculo_regras (veiculo_id, nome, ordem, criado_por_nome)
  values (v_veiculo, 'Chicote da moto (Conjunto Elétrico vendido)', 1, v_marca) returning id into v_regra;

  insert into veiculo_regra_condicoes (regra_id, tipo, item_id)
  values (v_regra, 'item', v_conj);

  insert into veiculo_regra_condicoes (regra_id, tipo, opcao_id)
  select v_regra, 'resposta', o.id
  from item_pergunta_opcoes o join item_perguntas p on p.id = o.pergunta_id
  where p.item_id is null and (
       (p.texto = 'O veículo é caracterizado?' and o.rotulo = 'Caracterizado')
    or (p.texto = 'A bateria é frontal ou traseira?' and o.rotulo = 'Frontal')
    or (p.texto = 'Onde as luzes serão ligadas?' and o.rotulo = 'Controladora Detech'));
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'Esperava 3 condições de resposta e achei %', v_n; end if;

  insert into veiculo_regra_materiais (regra_id, material_item_id, quantidade, acao, ordem)
  values (v_regra, (v_ids ->> '79')::uuid, 2, 'adicionar', 1);
end $$;
