-- Desfaz a onda 4b: devolve a regra "quem entrou faz tudo" nas dez tabelas de configuração e o direito da chave pública (anon) nas 29 funções.
do $rev$
declare
  t text;
  f record;
begin
  foreach t in array array['compras_alcadas_aprovacao','fretes_alcadas_aprovacao','contratos_padrao','fluxo_config','feriados',
                           'rh_cargos','rh_funcionario_cargos','rh_departamentos','rh_funcionario_departamentos','compras_fornecedores']
  loop
    execute format('drop policy if exists etapa17_le on public.%I', t);
    execute format('drop policy if exists etapa17_grava_aba_i on public.%I', t);
    execute format('drop policy if exists etapa17_grava_aba_u on public.%I', t);
    execute format('drop policy if exists etapa17_grava_aba_d on public.%I', t);
    execute format('create policy etapa17_logado on public.%I for all to authenticated using ((select public.esta_logado())) with check ((select public.esta_logado()))', t);
  end loop;
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in (
         'cadastro_itens_protege_1687_exclusao', 'cadastro_itens_regras_do_catalogo', 'estrutura_valida_lista_de_itens', 'fn_crm_audit_estagio',
         'gerar_numero_cotacao', 'gerar_numero_oc', 'kit_sem_ciclo', 'op_remessas_conferir_data_envio', 'pcp_filho_marca_movimentacao',
         'pcp_pedido_marca_movimentacao', 'resolver_mencoes_aprovacao_ao_decidir', 'set_cadastro_itens_updated', 'set_cadastro_produtos_updated',
         'set_cotacoes_precos_updated', 'sync_norm_cadastro_itens', 'sync_norm_cadastro_produtos', 'sync_norm_clientes', 'sync_norm_crm_oportunidades',
         'sync_norm_engenharia_desenvolvimento', 'sync_norm_licitacoes', 'sync_norm_oples', 'sync_norm_sac_ordens_servico', 'sync_simplificado_fipe_modelos',
         'tg_crm_perdida_cancela_analises', 'tg_licitacao_perdida_cancela_analises', 'trigger_atualizar_lead_time',
         'pedido_compra_extrair_valores', 'pedido_itens_sem_preco', 'pedido_vencedoras_sem_valor')
  loop
    execute format('grant execute on function %s to public, anon', f.assinatura);
  end loop;
end
$rev$;
