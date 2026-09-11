-- Troca o número de uma OP (oples.opl) e de tudo que o guarda como TEXTO.
-- O número é referenciado por texto em ~30 colunas de outras tabelas; trocar
-- só na OP deixaria pedidos, histórico, CQ etc. apontando para o antigo.
-- Tudo numa transação: se qualquer passo falhar, nada muda.
-- Desmembradas (BASE/02, BASE/03...) acompanham a base quando a OP renomeada
-- é a base. Só Admin e perfis "Gerente ..." (conferido em auth_usuarios; a
-- tela também esconde o botão — ver podeAlterarNumeroOplPv em utils/permissoes.ts).
-- Chamado por src/RenomearOpl.ts.
create or replace function public.renomear_opl(
  p_opl_id uuid,
  p_novo text,
  p_email text,
  p_incluir_desmembradas boolean default true
) returns jsonb
language plpgsql
as $$
declare
  refs constant text[] := array[
    'agendamentos_manutencao.numero_opl', 'ajustes_trabalhos.opl', 'ajustes_trabalhos.opl_referencia',
    'chicotes_fabricacao.opl', 'compras_requisicoes.opl', 'cotacoes_precos.opl_numero',
    'cotacoes_propostas.opl_numero', 'cq_auditorias.numero_opl', 'cq_auditorias.opl',
    'crm_vendas.numero_op', 'demandas_setoriais.numero_opl', 'demandas_setoriais.opl',
    'engenharia_desenvolvimento.numero_opl', 'engenharia_horas_tarefas.numero_opl',
    'expedicao_envios.opl', 'kiting_checklist.opl', 'laboratorio_equipamentos.opl',
    'licitacao_pedidos.opl', 'logs_movimentacao_opl.numero_opl', 'mkt_intervencoes.numero_opl',
    'mkt_pedidos_registro.numero_opl', 'opl_anexos.opl_numero', 'pcp_pedidos_chicotes.opl',
    'pcp_pedidos_compra.opl', 'pcp_pedidos_serralheria.opl', 'qualidade_checklists.opl',
    'serralheria_demandas.opl', 'serralheria_trabalhos.opl', 'veiculos_nfc.opl_numero',
    'vistorias_patio.opl', 'vouchers_servico.numero_pvop'
  ];
  v_perfil text; v_nome text;
  v_antigo text;
  v_novo text := trim(coalesce(p_novo, ''));
  v_ref text; v_n int; v_refs int := 0; v_ops int := 0; v_colisao text;
  r record;
begin
  select perfil, nome into v_perfil, v_nome
    from auth_usuarios where lower(email) = lower(trim(coalesce(p_email, ''))) and ativo;
  if v_perfil is null or not (v_perfil = 'Admin' or v_perfil ilike 'gerente%') then
    raise exception 'Somente administradores e gerentes podem alterar o número da OP.';
  end if;

  select opl into v_antigo from oples where id = p_opl_id for update;
  if v_antigo is null then raise exception 'OP não encontrada.'; end if;
  if v_novo = '' then raise exception 'Informe o novo número da OP.'; end if;
  if v_novo = trim(v_antigo) then raise exception 'O número novo é igual ao atual.'; end if;

  -- pares (antigo -> novo): a OP e, se ela for a base, as desmembradas /NN
  create temp table if not exists _renomear_opl (id uuid, antigo text, novo text) on commit drop;
  truncate _renomear_opl;
  insert into _renomear_opl values (p_opl_id, v_antigo, v_novo);
  if p_incluir_desmembradas and v_antigo !~ '/[0-9]+$' then
    insert into _renomear_opl
      select id, opl, v_novo || substring(opl from length(v_antigo) + 1)
        from oples
       where id <> p_opl_id
         and left(opl, length(v_antigo)) = v_antigo
         and substring(opl from length(v_antigo) + 1) ~ '^/[0-9]+$';
  end if;

  select x.novo into v_colisao
    from _renomear_opl x join oples o on trim(o.opl) = trim(x.novo)
   where o.id not in (select id from _renomear_opl) limit 1;
  if v_colisao is not null then
    raise exception 'Já existe uma OP com o número %.', v_colisao;
  end if;

  for r in select * from _renomear_opl loop
    update oples set opl = r.novo, data_atualizacao = now() where id = r.id;
    v_ops := v_ops + 1;
    foreach v_ref in array refs loop
      execute format('update public.%I set %I = $1 where trim(%I::text) = trim($2)',
                     split_part(v_ref, '.', 1), split_part(v_ref, '.', 2), split_part(v_ref, '.', 2))
        using r.novo, r.antigo;
      get diagnostics v_n = row_count;
      v_refs := v_refs + v_n;
    end loop;
    update pcp_fretes set vinculo_desc = replace(vinculo_desc, trim(r.antigo), r.novo)
     where vinculo_id = r.id and vinculo_desc like '%' || trim(r.antigo) || '%';
    get diagnostics v_n = row_count;
    v_refs := v_refs + v_n;

    -- registro no histórico da OP (depois da troca, para o texto guardar os dois números)
    insert into logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo,
                                       usuario_nome, usuario_email, usuario_setor, data_hora)
    select r.id, r.novo, v_perfil,
           'Número da OP alterado de ' || trim(r.antigo) || ' para ' || r.novo || ' por ' || coalesce(v_nome, p_email) || '.',
           o.status_geral, o.status_geral, coalesce(v_nome, p_email), p_email, v_perfil, now()
      from oples o where o.id = r.id;
  end loop;

  return jsonb_build_object('antigo', trim(v_antigo), 'novo', v_novo, 'ops', v_ops, 'referencias', v_refs);
end $$;

grant execute on function public.renomear_opl(uuid, text, text, boolean) to anon, authenticated;
