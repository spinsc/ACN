-- Etapa 17, onda 4b (26/11/2026): gravar nas tabelas de configuração passa a exigir a aba dona; funções auxiliares saem da chave pública.
-- Por que: dez tabelas de configuração ainda tinham a regra "quem entrou faz tudo" (etapa17_logado), então qualquer pessoa que entrou
-- podia, por exemplo, mudar a alçada de aprovação de compras, os feriados ou os departamentos do RH. LER continua aberto a quem entrou
-- (compras, logística, calendário e várias telas leem essas tabelas); só INSERIR, ALTERAR e APAGAR passam a exigir a aba que as edita.
-- Quem grava hoje (conferido no código em 26/11/2026): as alçadas de compras e de frete, os contratos-padrão, o fluxo e os feriados só pela
-- Administração (aba admin); cargos e departamentos do RH, e as ligações deles com as pessoas, só pelo RH (aba rh); o cadastro de
-- fornecedores só pelo Compras (aba compras). A conta é a da `tem_alguma_aba` (Admin, lista de abas vazia = todas, ou alguma das abas).
-- Custo do banco (regra de 13/11/2026): a regra de LER não muda (`(select esta_logado())`); as de gravar usam `(select tem_alguma_aba(...))`,
-- uma conferência por consulta. As tabelas têm de 0 a 65 linhas.
-- Segunda parte: 26 funções de gatilho e 3 auxiliares puras ainda podiam ser chamadas pela chave pública; passam a ser só de quem entrou
-- (gatilho dispara sem esse direito, então nada muda no uso). Como desfazer: etapa17_onda4b_gravacao_por_aba_reverter.sql.

do $mig$
declare
  r record;
begin
  for r in
    select * from (values
      ('compras_alcadas_aprovacao',  'array[''admin'']'),
      ('fretes_alcadas_aprovacao',   'array[''admin'']'),
      ('contratos_padrao',           'array[''admin'']'),
      ('fluxo_config',               'array[''admin'']'),
      ('feriados',                   'array[''admin'']'),
      ('rh_cargos',                  'array[''rh'']'),
      ('rh_funcionario_cargos',      'array[''rh'']'),
      ('rh_departamentos',           'array[''rh'']'),
      ('rh_funcionario_departamentos', 'array[''rh'']'),
      ('compras_fornecedores',       'array[''compras'']')
    ) as t(tabela, abas)
  loop
    execute format('drop policy if exists etapa17_logado on public.%I', r.tabela);
    execute format('create policy etapa17_le on public.%I for select to authenticated using ((select public.esta_logado()))', r.tabela);
    execute format('create policy etapa17_grava_aba_i on public.%I for insert to authenticated with check ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas);
    execute format('create policy etapa17_grava_aba_u on public.%I for update to authenticated using ((select public.tem_alguma_aba(%s))) with check ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas, r.abas);
    execute format('create policy etapa17_grava_aba_d on public.%I for delete to authenticated using ((select public.tem_alguma_aba(%s)))', r.tabela, r.abas);
  end loop;
end
$mig$;

-- Funções que a chave pública (anon) ainda executava: gatilhos e auxiliares puras. Quem entrou continua executando.
do $mig2$
declare
  f record;
begin
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
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated', f.assinatura);
  end loop;
end
$mig2$;
