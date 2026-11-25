-- MIGRAÇÃO das OPs A1760.2611, A1797.2611 e A1806.2611 para o fluxo "Somente serviço de terceiro" (pedido do usuário em 25/11/2026:
-- "os 3 lotes com OP 1806, 1760 e 1797 é tudo nesse novo fluxo", inclusive o "Outro / LAVAÇÃO" da A1806).
--
-- O que faz, em UMA transação (tudo ou nada):
--   1) guarda o estado de antes (fluxo, etapa e data de chegada ao PCP) em `oples_antes_so_terceiro_20261125`, para desfazer;
--   2) passa cada OP viva dessas vendas, que ainda esteja em "Em Espera PCP", para o fluxo `somente_servico_terceiro` e a etapa "Aguardando Servico de Terceiro"
--      (`data_chegada_pcp` fica vazia, como na OP que nasce nesse fluxo) e escreve a linha no histórico da OP;
--   3) abre um serviço de terceiro por OP e por tipo da caixinha, em "A definir", em nome de QUEM ABRIU A OP (Tatiana e Thiago: é o que a tela faria se eles tivessem criado
--      a OP já nesse fluxo), sem prestador, data nem valor. O "Outro" leva o texto da OP ("LAVAÇÃO") como descrição.
-- NÃO mexe: a OP-base A1760.2611 (cancelada e excluída), OP fora de "Em Espera PCP", valores, datas de entrega, itens vendidos nem o que o PCP já configurou (nenhuma tinha kit/BOM).
-- É IDEMPOTENTE: OP já no fluxo novo não é tocada e par (OP, tipo) com serviço vivo não é recriado.
-- Ensaio: troque `v_teste` por true (relata na mensagem de erro "ENSAIO DA MIGRAÇÃO" e DESFAZ tudo). Reverter: terceiros_so_servico_migrar_ops_reverter.sql.
do $migracao$
declare
  v_teste constant boolean := false;
  v_por constant text := 'Migração (fluxo só de terceiro)';
  v_vendas constant text[] := array['A1760.2611', 'A1797.2611', 'A1806.2611'];
  v_ops_esperadas constant int := 22;
  v_servicos_esperados constant int := 24;
  v_ops int; v_mudadas int; v_novos int; v_antes int; v_depois int; v_sem_tipo int; v_por_tipo text; v_relatorio text;
begin
  create table if not exists public.oples_antes_so_terceiro_20261125 (
    id uuid primary key, opl text, fluxo_entrega text, status_geral text, data_chegada_pcp timestamptz, guardado_em timestamptz default now());

  create temporary table tmp_op_so_terc on commit drop as
  select o.id, o.opl, regexp_replace(o.opl, '/[0-9]+$', '') as venda, o.cliente_nome, o.obs_servico_terceiro, o.data_prevista_entrega,
         o.fluxo_entrega, o.status_geral, o.data_chegada_pcp, o.criado_por_nome,
         array(select jsonb_array_elements_text(o.tipos_servico_terceiro)) as tipos
    from public.oples o
   where regexp_replace(o.opl, '/[0-9]+$', '') = any (v_vendas)
     and o.excluida_em is null and o.status_geral = 'Em Espera PCP'
     and jsonb_typeof(o.tipos_servico_terceiro) = 'array' and jsonb_array_length(o.tipos_servico_terceiro) > 0;

  select count(*) into v_ops from tmp_op_so_terc;
  if v_ops <> v_ops_esperadas then
    raise exception 'A migração parou: esperava % OPs em "Em Espera PCP" nessas 3 vendas e achou %. Nada foi gravado.', v_ops_esperadas, v_ops;
  end if;
  select count(*) into v_sem_tipo from tmp_op_so_terc t, unnest(t.tipos) x
   where not exists (select 1 from public.terceiros_tipos tp where tp.nome = x and tp.ativo);
  if v_sem_tipo > 0 then
    raise exception 'A migração parou: % tipo(s) escrito(s) nas OPs não existe(m) (ou está inativo) em terceiros_tipos. Nada foi gravado.', v_sem_tipo;
  end if;

  select count(*) into v_antes from public.terceiros_servicos;

  -- 1) cópia do estado de antes
  insert into public.oples_antes_so_terceiro_20261125 (id, opl, fluxo_entrega, status_geral, data_chegada_pcp)
  select id, opl, fluxo_entrega, status_geral, data_chegada_pcp from tmp_op_so_terc on conflict (id) do nothing;

  -- 2) as OPs mudam de fluxo e de etapa (só se ainda estão onde estavam)
  update public.oples o
     set fluxo_entrega = 'somente_servico_terceiro', status_geral = 'Aguardando Servico de Terceiro', data_chegada_pcp = null
    from tmp_op_so_terc t
   where o.id = t.id and o.status_geral = 'Em Espera PCP';
  get diagnostics v_mudadas = row_count;
  if v_mudadas <> v_ops then
    raise exception 'A migração parou: mudaram % de % OPs. Nada foi gravado.', v_mudadas, v_ops;
  end if;

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
  select t.id, t.opl, 'Serviços de terceiros',
         'OP passada para o fluxo "Somente serviço de terceiro" (pedido do usuário em 25/11/2026): não passa pelo PCP, Almoxarifado nem Adaptação',
         'Em Espera PCP', 'Aguardando Servico de Terceiro', v_por, now()
    from tmp_op_so_terc t;

  -- 3) os serviços: um por OP e por tipo, em nome de quem abriu a OP
  insert into public.terceiros_servicos (tipo_id, descricao, solicitante_id, solicitante_nome, solicitante_perfil, ligacao_tipo, ligacao_id, ligacao_rotulo, venda_base, onde,
                                         observacao, historico, criado_por, atualizado_por)
  select tp.id,
         case when tp.nome = 'Outro' and nullif(btrim(coalesce(t.obs_servico_terceiro, '')), '') is not null then btrim(t.obs_servico_terceiro)
              else tp.nome || ' — ' || coalesce(nullif(btrim(t.cliente_nome), ''), t.opl) end,
         u.id, coalesce(u.nome, v_por), u.perfil, 'op', t.id, t.opl, t.venda, tp.onde_padrao,
         concat_ws(' ', case when t.data_prevista_entrega is not null then 'Prazo de entrega da OP: ' || to_char(t.data_prevista_entrega, 'DD/MM/YYYY') || '.' end,
                   'Aberto ao passar a OP para o fluxo "Somente serviço de terceiro" (25/11/2026).'),
         jsonb_build_array(jsonb_build_object('em', now(), 'por', v_por, 'acao', 'solicitado',
           'detalhe', tp.nome || ' — ' || t.opl || ' (OP passada para o fluxo "Somente serviço de terceiro")')),
         coalesce(u.nome, v_por), v_por
    from tmp_op_so_terc t
   cross join lateral unnest(t.tipos) as x
    join public.terceiros_tipos tp on tp.nome = x and tp.ativo
    left join public.auth_usuarios u on u.nome = t.criado_por_nome and coalesce(u.ativo, false)
   where not exists (select 1 from public.terceiros_servicos s
                      where s.tipo_id = tp.id and s.ligacao_tipo = 'op' and s.ligacao_id = t.id and s.status <> 'cancelado')
   order by t.venda, t.opl, tp.ordem;
  get diagnostics v_novos = row_count;

  select count(*) into v_depois from public.terceiros_servicos;
  if v_depois - v_antes <> v_novos or v_novos <> v_servicos_esperados then
    raise exception 'A migração parou: esperava % serviços novos e o banco passou de % para % (criou %). Nada foi gravado.', v_servicos_esperados, v_antes, v_depois, v_novos;
  end if;

  select string_agg(tp.nome || ' ' || n, ', ' order by tp.ordem) into v_por_tipo
    from (select s.tipo_id, count(*) n from public.terceiros_servicos s where s.criado_por in (v_por) or s.atualizado_por = v_por group by s.tipo_id) z
    join public.terceiros_tipos tp on tp.id = z.tipo_id;

  v_relatorio := format('OPs passadas: %s | serviços criados: %s (antes %s, depois %s) | por tipo: %s', v_mudadas, v_novos, v_antes, v_depois, coalesce(v_por_tipo, '—'));
  if v_teste then
    raise exception 'ENSAIO DA MIGRAÇÃO (tudo desfeito): %', v_relatorio;
  end if;
  raise notice 'MIGRAÇÃO: %', v_relatorio;
end
$migracao$;
