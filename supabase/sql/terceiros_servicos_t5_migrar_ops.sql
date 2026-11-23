-- Serviços de terceiros, T5 (23/11/2026): MIGRAÇÃO DAS OPs que já tinham a caixinha "Necessita serviço de terceiro" marcada e ainda não chegaram ao CQ.
--
-- Decisões do usuário (22 e 23/11/2026, no PLANO_SERVICOS_TERCEIROS.md):
--   • só as OPs em "Em Espera PCP", "Aguardando Almox", "Aguardando Inicio Producao" e "Em Producao" (as que já saíram da produção a equipe conhece e dariam falso "pendente");
--   • um serviço por OP e por tipo marcado (a tela agrupa as unidades da mesma venda);
--   • "Pintura" das vendas 1583.2608 e A1226.2604 vira "Pintura eletrostática" (com ordem em lote); a "Pintura" das outras vendas segue como "Pintura" comum
--     (as 3 vendas pequenas, A1731.2610, A1799.2611 e A1347.2606, o usuário não classificou: ficam comuns, e o tipo se troca no cartão enquanto ele está em "A definir");
--   • OP marcada SEM dizer o tipo vira "Outro", com a observação pedindo para escolher o tipo certo ou cancelar.
--
-- O que a migração faz e o que NÃO faz: só INSERE serviços em "A definir", sem prestador, sem data e sem valor, em nome de "Migração (caixinha da OP)" (sem solicitante: só a diretoria e,
-- nos tipos da Adaptação, a Adaptação mexem neles). Não altera nem apaga nada: a caixinha da OP e o resto continuam como estão. É IDEMPOTENTE: não recria o par (OP, tipo) que já tem serviço
-- vivo (qualquer situação menos cancelado) nem o que ela mesma criou antes e alguém cancelou; rodar de novo não duplica. Nada de dado do usuário muda.
--
-- Como usar: (1) o ensaio: troque `v_teste constant boolean := false` por `true` — a rodada insere, relata na mensagem de erro que começa com "ENSAIO DA MIGRAÇÃO" e DESFAZ tudo;
-- (2) a aplicação de verdade (apply_migration) com `false`, só depois do OK do usuário sobre a lista de vendas e a contagem.
do $migracao$
declare
  v_teste constant boolean := false;
  v_por constant text := 'Migração (caixinha da OP)';
  v_eletrostatica constant text[] := array['1583.2608', 'A1226.2604'];
  v_status constant text[] := array['Em Espera PCP', 'Aguardando Almox', 'Aguardando Inicio Producao', 'Em Producao'];
  v_antes int; v_depois int; v_ops int; v_vendas int; v_pares int; v_sem_tipo_cadastrado int; v_ja int; v_novos int; v_por_tipo text; v_relatorio text;
begin
  select count(*) into v_antes from public.terceiros_servicos;
  -- a numeração TS-00001 não volta sozinha depois de um ensaio desfeito (a sequência não é desfeita): sem serviço nenhum no banco, a primeira linha migrada é a TS-00001
  if v_antes = 0 then perform setval('public.terceiros_servico_seq', 1, false); end if;

  create temporary table tmp_migra_ops on commit drop as
  with base as (
    select o.id, o.opl, o.status_geral, o.obs_servico_terceiro,
           regexp_replace(o.opl, '/[0-9]+$', '') as venda,
           case when jsonb_typeof(o.tipos_servico_terceiro) = 'array' and jsonb_array_length(o.tipos_servico_terceiro) > 0
                  then array(select jsonb_array_elements_text(o.tipos_servico_terceiro))
                when coalesce(btrim(o.tipo_servico_terceiro), '') <> '' then array[btrim(o.tipo_servico_terceiro)]
                else array[]::text[] end as tipos
      from public.oples o
     where o.servico_terceiro = true and o.excluida_em is null and o.status_geral = any (v_status)
  )
  select distinct b.id as op_id, b.opl, b.venda, b.status_geral, b.obs_servico_terceiro,
         (cardinality(b.tipos) = 0) as sem_tipo,
         case when cardinality(b.tipos) = 0 then 'Outro'
              when x = 'Pintura' and b.venda = any (v_eletrostatica) then 'Pintura eletrostática'
              else x end as tipo_nome
    from base b
   cross join lateral unnest(case when cardinality(b.tipos) = 0 then array['Outro'] else b.tipos end) as x;

  select count(distinct op_id), count(distinct venda), count(*) into v_ops, v_vendas, v_pares from tmp_migra_ops;

  -- um tipo escrito na OP que não existe no cadastro de tipos: para tudo, em vez de pular sem avisar
  select count(*) into v_sem_tipo_cadastrado from tmp_migra_ops m where not exists (select 1 from public.terceiros_tipos t where t.nome = m.tipo_nome and t.ativo);
  if v_sem_tipo_cadastrado > 0 then
    raise exception 'A migração parou: % par(es) OP e tipo têm um tipo que não existe (ou está inativo) em terceiros_tipos. Nada foi gravado.', v_sem_tipo_cadastrado;
  end if;

  select count(*) into v_ja from tmp_migra_ops m join public.terceiros_tipos t on t.nome = m.tipo_nome
   where exists (select 1 from public.terceiros_servicos s
                  where s.tipo_id = t.id and s.ligacao_tipo = 'op' and s.ligacao_id = m.op_id and (s.status <> 'cancelado' or s.solicitante_nome = v_por));

  insert into public.terceiros_servicos (tipo_id, descricao, solicitante_id, solicitante_nome, solicitante_perfil, ligacao_tipo, ligacao_id, ligacao_rotulo, venda_base, onde,
                                         observacao, historico, criado_por, atualizado_por)
  select t.id, t.nome || ' — pedido na caixinha da OP ' || m.opl, null, v_por, null, 'op', m.op_id, m.opl, m.venda, t.onde_padrao,
         nullif(btrim(concat_ws(E'\n',
           case when m.sem_tipo then 'A OP marcou "Necessita serviço de terceiro" sem dizer o tipo: escolha o tipo certo ou cancele o serviço com o motivo.' end,
           nullif(btrim(coalesce(m.obs_servico_terceiro, '')), ''))), ''),
         jsonb_build_array(jsonb_build_object('em', now(), 'por', v_por, 'acao', 'solicitado',
           'detalhe', t.nome || ' — ' || m.opl || ' (migrado da caixinha da OP, que estava em "' || m.status_geral || '")')),
         v_por, v_por
    from tmp_migra_ops m
    join public.terceiros_tipos t on t.nome = m.tipo_nome and t.ativo
   where not exists (select 1 from public.terceiros_servicos s
                      where s.tipo_id = t.id and s.ligacao_tipo = 'op' and s.ligacao_id = m.op_id and (s.status <> 'cancelado' or s.solicitante_nome = v_por))
   order by m.venda, m.opl, t.ordem;
  get diagnostics v_novos = row_count;

  select count(*) into v_depois from public.terceiros_servicos;
  if v_depois - v_antes <> v_novos then
    raise exception 'A migração parou: o banco passou de % para % serviços, mas esperava criar %. Nada foi gravado.', v_antes, v_depois, v_novos;
  end if;

  select string_agg(t.nome || ' ' || n, ', ' order by t.ordem) into v_por_tipo
    from (select s.tipo_id, count(*) n from public.terceiros_servicos s where s.solicitante_nome = v_por and s.criado_em >= now() - interval '1 minute' group by s.tipo_id) z
    join public.terceiros_tipos t on t.id = z.tipo_id;

  v_relatorio := format('OPs na regra: %s (%s vendas) | pares OP e tipo: %s | já existentes (pulados): %s | serviços criados: %s | antes %s, depois %s | por tipo: %s',
                        v_ops, v_vendas, v_pares, v_ja, v_novos, v_antes, v_depois, coalesce(v_por_tipo, '—'));
  if v_teste then
    raise exception 'ENSAIO DA MIGRAÇÃO (tudo desfeito): %', v_relatorio;
  end if;
  raise notice 'MIGRAÇÃO: %', v_relatorio;
end
$migracao$;
