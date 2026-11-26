-- Desfaz a onda 4c: devolve a regra "quem entrou faz tudo" às três tabelas de dinheiro dos centros e a `centros_custo`, e apaga a função do aviso de saldo.
-- ATENÇÃO: se a tela nova (aviso de saldo pela função) já estiver publicada, apagar a função faz o aviso sumir (a tela trata a falha em silêncio); para voltar ao aviso antigo é preciso publicar a tela anterior.
do $rev$
declare t text;
begin
  foreach t in array array['centro_custo_despesas', 'centro_custo_despesas_anexos', 'centros_custo_orcamento'] loop
    execute format('drop policy if exists etapa17_abas on public.%I', t);
    execute format('create policy etapa17_logado on public.%I for all to authenticated using ((select public.esta_logado())) with check ((select public.esta_logado()))', t);
  end loop;
  drop policy if exists etapa17_le on public.centros_custo;
  drop policy if exists etapa17_grava_aba_i on public.centros_custo;
  drop policy if exists etapa17_grava_aba_u on public.centros_custo;
  drop policy if exists etapa17_grava_aba_d on public.centros_custo;
  create policy etapa17_logado on public.centros_custo for all to authenticated using ((select public.esta_logado())) with check ((select public.esta_logado()));
end
$rev$;
drop function if exists public.centro_aviso_saldo(uuid, int, int);
