-- MIGRAÇÃO da venda A1763.2611 (11 OPs, "CRT PR - PLOTAGEM CRT", só plotagem) para o fluxo "Somente serviço de terceiro" (pedido do usuário em 26/11/2026:
-- "preciso alterar o fluxo do lote de OP 1763 para serviço somente de terceiros").
--
-- Mesmo caso das 22 OPs de A1760, A1797 e A1806 (terceiros_so_servico_migrar_ops.sql, 25/11/2026): as 11 OPs estão em "Em Espera PCP", sem kit, BOM, remessa nem serviço, e já têm a
-- caixinha "Necessita serviço de terceiro" com o tipo Plotagem. Em UMA transação (tudo ou nada):
--   1) guarda o estado de antes em `oples_antes_so_terceiro_20261125` (a mesma cópia da migração anterior; a reversão dela devolve também estas OPs);
--   2) passa cada OP para o fluxo `somente_servico_terceiro` e a etapa "Aguardando Servico de Terceiro" (`data_chegada_pcp` vazia, como na OP que nasce nesse fluxo) e escreve o histórico;
--   3) abre um serviço de Plotagem por OP, em "A definir", em nome de QUEM ABRIU A OP (Thiago), sem prestador, data nem valor.
-- NÃO mexe em valores, prazo de entrega (15/12/2026), itens vendidos, chassi nem em nenhuma OP fora de "Em Espera PCP".
-- É IDEMPOTENTE: OP já no fluxo novo não é tocada e par (OP, tipo) com serviço vivo não é recriado.
-- Ensaio: v_teste = true (relata na mensagem de erro "ENSAIO DA MIGRAÇÃO A1763" e DESFAZ tudo).
do $migracao$
declare
  v_teste constant boolean := false;
  v_por constant text := 'Migração (fluxo só de terceiro)';
  v_venda constant text := 'A1763.2611';
  v_ops_esperadas constant int := 11;
  v_servicos_esperados constant int := 11;
  v_ops int; v_mudadas int; v_novos int; v_antes int; v_depois int; v_sem_tipo int; v_sem_solicitante int; v_relatorio text;
begin
  create table if not exists public.oples_antes_so_terceiro_20261125 (
    id uuid primary key, opl text, fluxo_entrega text, status_geral text, data_chegada_pcp timestamptz, guardado_em timestamptz default now());

  create temporary table tmp_op_a1763 on commit drop as
  select o.id, o.opl, regexp_replace(o.opl, '/[0-9]+$', '') as venda, o.cliente_nome, o.obs_servico_terceiro, o.data_prevista_entrega,
         o.fluxo_entrega, o.status_geral, o.data_chegada_pcp, o.criado_por_nome, o.criado_por_pessoa_id,
         array(select jsonb_array_elements_text(o.tipos_servico_terceiro)) as tipos
    from public.oples o
   where regexp_replace(o.opl, '/[0-9]+$', '') = v_venda
     and o.excluida_em is null and o.status_geral = 'Em Espera PCP' and o.fluxo_entrega = 'adaptacao_matriz'
     and jsonb_typeof(o.tipos_servico_terceiro) = 'array' and jsonb_array_length(o.tipos_servico_terceiro) > 0;

  select count(*) into v_ops from tmp_op_a1763;
  if v_ops <> v_ops_esperadas then
    raise exception 'A migração parou: esperava % OPs em "Em Espera PCP" na venda A1763.2611 e achou %. Nada foi gravado.', v_ops_esperadas, v_ops;
  end if;
  select count(*) into v_sem_tipo from tmp_op_a1763 t, unnest(t.tipos) x
   where not exists (select 1 from public.terceiros_tipos tp where tp.nome = x and tp.ativo);
  if v_sem_tipo > 0 then
    raise exception 'A migração parou: % tipo(s) escrito(s) nas OPs não existe(m) (ou está inativo) em terceiros_tipos. Nada foi gravado.', v_sem_tipo;
  end if;
  -- a OP não pode ter kit, remessa nem serviço de terceiro vivo (o que o PCP já configurou não se perde)
  if exists (select 1 from public.oples o join tmp_op_a1763 t on t.id = o.id where o.kit_conferencia is not null or coalesce(o.bom_liberado, false))
     or exists (select 1 from public.op_remessas r join tmp_op_a1763 t on t.id = r.opl_id)
     or exists (select 1 from public.terceiros_servicos s join tmp_op_a1763 t on t.id = s.ligacao_id where s.ligacao_tipo = 'op' and s.status <> 'cancelado') then
    raise exception 'A migração parou: alguma OP já tem kit, BOM liberada, remessa ou serviço de terceiro. Nada foi gravado.';
  end if;
  -- o solicitante vem de quem abriu a OP (pelo ID da pessoa); se não achar, o serviço nasce sem solicitante e só a diretoria o mexe: melhor parar e olhar
  select count(*) into v_sem_solicitante from tmp_op_a1763 t
   where not exists (select 1 from public.auth_usuarios u where u.id = t.criado_por_pessoa_id and coalesce(u.ativo, false));
  if v_sem_solicitante > 0 then
    raise exception 'A migração parou: % OP(s) sem usuário ativo que as abriu. Nada foi gravado.', v_sem_solicitante;
  end if;

  select count(*) into v_antes from public.terceiros_servicos;

  -- 1) cópia do estado de antes
  insert into public.oples_antes_so_terceiro_20261125 (id, opl, fluxo_entrega, status_geral, data_chegada_pcp)
  select id, opl, fluxo_entrega, status_geral, data_chegada_pcp from tmp_op_a1763 on conflict (id) do nothing;

  -- 2) as OPs mudam de fluxo e de etapa (só se ainda estão onde estavam)
  update public.oples o
     set fluxo_entrega = 'somente_servico_terceiro', status_geral = 'Aguardando Servico de Terceiro', data_chegada_pcp = null
    from tmp_op_a1763 t
   where o.id = t.id and o.status_geral = 'Em Espera PCP' and o.fluxo_entrega = 'adaptacao_matriz';
  get diagnostics v_mudadas = row_count;
  if v_mudadas <> v_ops then
    raise exception 'A migração parou: mudaram % de % OPs. Nada foi gravado.', v_mudadas, v_ops;
  end if;

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
  select t.id, t.opl, 'Serviços de terceiros',
         'OP passada para o fluxo "Somente serviço de terceiro" (pedido do usuário em 26/11/2026): não passa pelo PCP, Almoxarifado nem Adaptação',
         'Em Espera PCP', 'Aguardando Servico de Terceiro', v_por, now()
    from tmp_op_a1763 t;

  -- 3) os serviços: um por OP e por tipo, em nome de quem abriu a OP
  insert into public.terceiros_servicos (tipo_id, descricao, solicitante_id, solicitante_nome, solicitante_perfil, ligacao_tipo, ligacao_id, ligacao_rotulo, venda_base, onde,
                                         observacao, historico, criado_por, atualizado_por)
  select tp.id,
         case when tp.nome = 'Outro' and nullif(btrim(coalesce(t.obs_servico_terceiro, '')), '') is not null then btrim(t.obs_servico_terceiro)
              else tp.nome || ' — ' || coalesce(nullif(btrim(t.cliente_nome), ''), t.opl) end,
         u.id, coalesce(u.nome, v_por), u.perfil, 'op', t.id, t.opl, t.venda, tp.onde_padrao,
         concat_ws(' ', case when t.data_prevista_entrega is not null then 'Prazo de entrega da OP: ' || to_char(t.data_prevista_entrega, 'DD/MM/YYYY') || '.' end,
                   'Aberto ao passar a OP para o fluxo "Somente serviço de terceiro" (26/11/2026).'),
         jsonb_build_array(jsonb_build_object('em', now(), 'por', v_por, 'acao', 'solicitado',
           'detalhe', tp.nome || ' — ' || t.opl || ' (OP passada para o fluxo "Somente serviço de terceiro")')),
         coalesce(u.nome, v_por), v_por
    from tmp_op_a1763 t
   cross join lateral unnest(t.tipos) as x
    join public.terceiros_tipos tp on tp.nome = x and tp.ativo
    join public.auth_usuarios u on u.id = t.criado_por_pessoa_id
   where not exists (select 1 from public.terceiros_servicos s
                      where s.tipo_id = tp.id and s.ligacao_tipo = 'op' and s.ligacao_id = t.id and s.status <> 'cancelado')
   order by t.venda, t.opl, tp.ordem;
  get diagnostics v_novos = row_count;

  select count(*) into v_depois from public.terceiros_servicos;
  if v_depois - v_antes <> v_novos or v_novos <> v_servicos_esperados then
    raise exception 'A migração parou: esperava % serviços novos e o banco passou de % para % (criou %). Nada foi gravado.', v_servicos_esperados, v_antes, v_depois, v_novos;
  end if;

  v_relatorio := format('OPs passadas: %s | serviços criados: %s (antes %s, depois %s)', v_mudadas, v_novos, v_antes, v_depois);
  if v_teste then
    raise exception 'ENSAIO DA MIGRAÇÃO A1763 (tudo desfeito): %', v_relatorio;
  end if;
  raise notice 'MIGRAÇÃO A1763: %', v_relatorio;
end
$migracao$;
