-- Etapa 17, onda 4c, parte b (26/11/2026): o dinheiro dos centros de custo passa a ser lido e gravado só por quem tem a aba que o usa.
-- Por que: as despesas dos centros, os anexos delas e o orçamento ainda tinham a regra "quem entrou faz tudo", então qualquer pessoa que entrou
-- lia quanto cada centro gastou e quanto tem de orçamento. Quem lê hoje (conferido no código em 26/11/2026): o Financeiro (painel, lançamentos,
-- fechamento do mês, conciliação, custo por OP), os Relatórios, e a ficha dos centros, que mora no Admin, no Compras e no Financeiro. A única
-- tela de fora dessas abas que usava o dinheiro dos centros era o aviso de saldo da solicitação de compra, que agora vem da função
-- `centro_aviso_saldo` (parte a), só com a faixa e o percentual. As três tabelas passam a `etapa17_abas` (Admin, lista vazia = todas, ou alguma
-- de financeiro, relatorios ou compras).
-- `centros_custo` (a lista dos centros, que 11 telas leem para escolher o centro) continua LIDA por quem entrou; só passa a ser GRAVADA por quem
-- tem a aba financeiro ou compras (a ficha dos centros, `CentroCustoFicha`, é a única que grava; `renomear_codigo_centro_custo` roda no nome de quem chama).
-- Ficam como estão: `centro_custo_fechamentos` (só diz qual mês está fechado, sem valor), `centros_custo_alertas` (percentuais) e `centro_custo_categorias`.
-- Custo do banco (regra de 13/11/2026): `(select tem_alguma_aba(...))`, uma conferência por consulta; tabelas de 0 a 38 linhas.
-- Como desfazer: etapa17_onda4c_reverter.sql.

do $mig$
declare
  t text;
begin
  foreach t in array array['centro_custo_despesas', 'centro_custo_despesas_anexos', 'centros_custo_orcamento'] loop
    execute format('drop policy if exists etapa17_logado on public.%I', t);
    execute format('create policy etapa17_abas on public.%I for all to authenticated using ((select public.tem_alguma_aba(array[''financeiro'', ''relatorios'', ''compras'']))) with check ((select public.tem_alguma_aba(array[''financeiro'', ''relatorios'', ''compras''])))', t);
  end loop;
  drop policy if exists etapa17_logado on public.centros_custo;
  create policy etapa17_le on public.centros_custo for select to authenticated using ((select public.esta_logado()));
  create policy etapa17_grava_aba_i on public.centros_custo for insert to authenticated with check ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
  create policy etapa17_grava_aba_u on public.centros_custo for update to authenticated using ((select public.tem_alguma_aba(array['financeiro', 'compras']))) with check ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
  create policy etapa17_grava_aba_d on public.centros_custo for delete to authenticated using ((select public.tem_alguma_aba(array['financeiro', 'compras'])));
end
$mig$;
