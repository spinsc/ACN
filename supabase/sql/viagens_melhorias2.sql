-- Viagens, melhorias 2 (04/11/2026, pedido do usuário): alerta de saída próxima com parte faltando e comprovantes da prestação de contas.
--  • `comprovantes` (jsonb): notas e recibos que o Financeiro anexa ao custo real de cada item ({item, nome, url, path, tamanho, por, em}); gravados na hora, como os arquivos do contrato.
--  • `aviso_saida_em`: quando o aviso de "a viagem sai em até 2 dias e ainda falta parte" foi mandado (um aviso por viagem, para não repetir todo dia).
--  • Função `viagens_avisar_saida_proxima()`: de segunda a sexta às 8h de Brasília, olha as viagens em Provisionamento que saem em até 2 dias (ou que já passaram da data) e avisa na caixa de
--    Menções o setor que falta: Adaptação (equipe, veículo da frota, km de saída) e Financeiro (verba total). Comercial não entra: serviço e contrato não travam a saída.
--    Mesma regra de quem recebe do aviso de aprovação (quem tem a aba Produção / Financeiro, fora o Admin). O aviso se resolve sozinho quando a viagem sai de Provisionamento.

alter table public.viagens
  add column if not exists comprovantes jsonb not null default '[]'::jsonb,
  add column if not exists aviso_saida_em timestamptz;
comment on column public.viagens.comprovantes is 'Comprovantes da prestação de contas: [{item: combustivel|pedagios|hospedagem|alimentacao|outros, nome, url, path, tamanho, por, em}].';
comment on column public.viagens.aviso_saida_em is 'Quando o aviso de saída próxima com parte faltando foi mandado (um por viagem).';

create or replace function public.viagens_avisar_saida_proxima()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v record; u record; f_ad text[]; f_fin text[]; n integer := 0; dias integer; quando text; texto text;
begin
  for v in select * from public.viagens
            where status in ('provisionamento', 'aprovada') and data_saida is not null and data_saida <= hoje + 2 and aviso_saida_em is null
            order by data_saida
  loop
    f_ad := '{}'; f_fin := '{}';
    if (case when jsonb_typeof(v.equipe) = 'array' then jsonb_array_length(v.equipe) else 0 end) = 0 then f_ad := array_append(f_ad, 'a equipe'::text); end if;
    if v.frota_id is null then f_ad := array_append(f_ad, 'o veículo da frota'::text); end if;
    if v.km_saida is null then f_ad := array_append(f_ad, 'o km de saída'::text); end if;
    if coalesce(v.verba_total, 0) <= 0 then f_fin := array_append(f_fin, 'a verba total'::text); end if;
    if coalesce(array_length(f_ad, 1), 0) = 0 and coalesce(array_length(f_fin, 1), 0) = 0 then continue; end if;

    dias := v.data_saida - hoje;
    quando := case when dias < 0 then 'devia ter saído em ' || to_char(v.data_saida, 'DD/MM')
                   when dias = 0 then 'sai hoje' when dias = 1 then 'sai amanhã (' || to_char(v.data_saida, 'DD/MM') || ')'
                   else 'sai em ' || dias || ' dias (' || to_char(v.data_saida, 'DD/MM') || ')' end;
    for u in
      select a.id::text as id, a.nome, 'adaptacao' as setor from public.auth_usuarios a
       where coalesce(array_length(f_ad, 1), 0) > 0 and coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and a.perfil is distinct from 'Admin'
         and jsonb_typeof(a.abas_permitidas) = 'array' and a.abas_permitidas @> '["producao"]'::jsonb
      union all
      select a.id::text, a.nome, 'financeiro' from public.auth_usuarios a
       where coalesce(array_length(f_fin, 1), 0) > 0 and coalesce(a.ativo, true) and btrim(coalesce(a.nome, '')) <> '' and a.perfil is distinct from 'Admin'
         and jsonb_typeof(a.abas_permitidas) = 'array' and a.abas_permitidas @> '["financeiro"]'::jsonb
    loop
      texto := 'A viagem «' || v.titulo || '» ' || quando || ' e ainda falta, na parte ' || case u.setor when 'adaptacao' then 'da Adaptação: ' || array_to_string(f_ad, ', ') else 'do Financeiro: ' || array_to_string(f_fin, ', ') end || '. A equipe só pode sair com isso preenchido.';
      insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
      values (u.id, u.nome, '', 'Sistema', 'viagem', v.id::text, v.titulo, 'saida_proxima_' || u.setor, texto, 'viagens', false);
    end loop;
    update public.viagens set aviso_saida_em = now() where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke all on function public.viagens_avisar_saida_proxima() from public, anon, authenticated;

-- 8h de Brasília = 11h UTC, de segunda a sexta (a mesma rotina agendada dos fretes: select * from cron.job_run_details order by start_time desc limit 10)
select cron.schedule('viagens-avisar-saida-proxima', '0 11 * * 1-5', 'select public.viagens_avisar_saida_proxima()');
