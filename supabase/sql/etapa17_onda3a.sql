-- Etapa 17b, onda 3a (04/11/2026) — separa POR ABA as 14 tabelas de dinheiro e preços que só poucas telas usam.
--
-- Por que existe: desde a onda 2 (22/10/2026) o banco só aceita quem entrou, mas quem entrou ainda lê e grava em tudo. Aqui as tabelas de dinheiro e preços abaixo passam a aceitar só o Admin e
-- quem tem ALGUMA das abas que as usam (decisão do usuário em 04/11/2026: "quem tem qualquer aba que a usa"). A lista de abas de cada tabela saiu do código (mapa de importações: tabela → arquivos →
-- telas que os alcançam, inclusive as telas embutidas, como a Formação de Preços dentro do CRM, das Licitações e das Vendas do Telecom) e é a mesma conta que o menu já faz: Admin, ou a lista vazia (= todas),
-- ou a aba na lista de abas liberadas (função nova tem_alguma_aba, irmã de tem_aba).
--
-- O que NÃO entra nesta onda (e por quê): cotacoes_propostas (a função renomear_opl, que roda com o poder de quem chama, mexe nela quando se renomeia uma OP); compras_alcadas_aprovacao (o aviso de
-- "compras esperando aprovação" da casca do sistema lê para todo mundo); e as tabelas que a casca ou muitas telas leem (cotacoes_precos, pcp_pedidos_compra, centros de custo e despesas…), que pedem
-- um desenho próprio (visão sem custo e margem, como foi feito no RH) antes de qualquer fechamento.
-- Para voltar atrás: etapa17_onda3a_reverter.sql.

create or replace function public.tem_alguma_aba(p_abas text[])
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce((select u.perfil = 'Admin' or jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ?| p_abas
                   from public.auth_usuarios u where u.auth_id = auth.uid() and coalesce(u.ativo, false) limit 1), false);
$f$;
revoke all on function public.tem_alguma_aba(text[]) from public, anon;
grant execute on function public.tem_alguma_aba(text[]) to authenticated;

-- Financeiro: tarefas (o Calendário também as mostra), anexos e tipos
drop policy if exists etapa17_logado on public.financeiro_tarefas;
create policy etapa17_abas on public.financeiro_tarefas for all to authenticated using (public.tem_alguma_aba(array['financeiro', 'calendario'])) with check (public.tem_alguma_aba(array['financeiro', 'calendario']));
drop policy if exists etapa17_logado on public.financeiro_tarefa_anexos;
create policy etapa17_abas on public.financeiro_tarefa_anexos for all to authenticated using (public.tem_alguma_aba(array['financeiro'])) with check (public.tem_alguma_aba(array['financeiro']));
drop policy if exists etapa17_logado on public.financeiro_tipos_tarefa;
create policy etapa17_abas on public.financeiro_tipos_tarefa for all to authenticated using (public.tem_alguma_aba(array['financeiro'])) with check (public.tem_alguma_aba(array['financeiro']));

-- Conciliação bancária (extratos e lançamentos): só o Financeiro
drop policy if exists etapa17_logado on public.conciliacao_extratos;
create policy etapa17_abas on public.conciliacao_extratos for all to authenticated using (public.tem_alguma_aba(array['financeiro'])) with check (public.tem_alguma_aba(array['financeiro']));
drop policy if exists etapa17_logado on public.conciliacao_lancamentos;
create policy etapa17_abas on public.conciliacao_lancamentos for all to authenticated using (public.tem_alguma_aba(array['financeiro'])) with check (public.tem_alguma_aba(array['financeiro']));

-- Recorrências e tipos dos centros de custo, departamentos do Compras e cotações dos fornecedores: Financeiro, Compras e a aba Administração (o AdminTab também as lê)
drop policy if exists etapa17_logado on public.centro_custo_recorrencias;
create policy etapa17_abas on public.centro_custo_recorrencias for all to authenticated using (public.tem_alguma_aba(array['admin', 'financeiro', 'compras'])) with check (public.tem_alguma_aba(array['admin', 'financeiro', 'compras']));
drop policy if exists etapa17_logado on public.centros_custo_tipos;
create policy etapa17_abas on public.centros_custo_tipos for all to authenticated using (public.tem_alguma_aba(array['admin', 'financeiro', 'compras'])) with check (public.tem_alguma_aba(array['admin', 'financeiro', 'compras']));
drop policy if exists etapa17_logado on public.compras_departamentos;
create policy etapa17_abas on public.compras_departamentos for all to authenticated using (public.tem_alguma_aba(array['admin', 'financeiro', 'compras'])) with check (public.tem_alguma_aba(array['admin', 'financeiro', 'compras']));

-- Cotações dos fornecedores (preços e fornecedores de cada pedido de compra): Compras, Financeiro e Administração
drop policy if exists etapa17_logado on public.pcp_cotacoes_fornecedores;
create policy etapa17_abas on public.pcp_cotacoes_fornecedores for all to authenticated using (public.tem_alguma_aba(array['admin', 'financeiro', 'compras'])) with check (public.tem_alguma_aba(array['admin', 'financeiro', 'compras']));

-- Chegada de itens (a Logística marca; Compras, Financeiro, PCP e Engenharia acompanham)
drop policy if exists etapa17_logado on public.compras_chegadas_itens;
create policy etapa17_abas on public.compras_chegadas_itens for all to authenticated using (public.tem_alguma_aba(array['compras', 'engenharia', 'financeiro', 'logistica', 'pcp'])) with check (public.tem_alguma_aba(array['compras', 'engenharia', 'financeiro', 'logistica', 'pcp']));

-- Aprovação das cotações de venda: Cotações e Comercial
drop policy if exists etapa17_logado on public.cotacoes_aprovacoes;
create policy etapa17_abas on public.cotacoes_aprovacoes for all to authenticated using (public.tem_alguma_aba(array['cotacoes', 'crm'])) with check (public.tem_alguma_aba(array['cotacoes', 'crm']));

-- Histórico, relacionadas e tipos da Formação de Preços: onde a Formação aparece (a tela dela, CRM, Licitações e Vendas do Telecom)
drop policy if exists etapa17_logado on public.cotacoes_precos_log;
create policy etapa17_abas on public.cotacoes_precos_log for all to authenticated using (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom'])) with check (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom']));
drop policy if exists etapa17_logado on public.cotacoes_precos_relacionadas;
create policy etapa17_abas on public.cotacoes_precos_relacionadas for all to authenticated using (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom'])) with check (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom']));
drop policy if exists etapa17_logado on public.formacao_precos_tipos;
create policy etapa17_abas on public.formacao_precos_tipos for all to authenticated using (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom'])) with check (public.tem_alguma_aba(array['crm', 'formacao_precos', 'licitacoes', 'telecom']));
