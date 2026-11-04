-- Viagens: o Financeiro LIBERA a verba (04/11/2026, pedido do usuário: o Financeiro "nutre e aprova" a parte dele, com uma fila de pendências no próprio Financeiro).
--  • `verba_liberada_em`, `verba_liberada_por`, `verba_liberada_valor`: quem liberou, quando e QUANTO. A liberação só vale enquanto a verba total é igual ao valor liberado: se o Financeiro
--    muda a verba depois, a liberação deixa de valer sozinha e é preciso liberar de novo (sem coluna de "invalidada" nem gatilho).
--  • Viagem já em Andamento ou Finalizada com verba lançada ANTES desta regra vale como liberada (nenhuma viagem existente foi regravada); em Provisionamento a liberação é pedida.
--  • A função do aviso de saída próxima passa a dizer "a liberação da verba" quando a verba está lançada mas não liberada (mesma conta da tela: ViagemVerba.ts).

alter table public.viagens
  add column if not exists verba_liberada_em timestamptz,
  add column if not exists verba_liberada_por text,
  add column if not exists verba_liberada_valor numeric;
comment on column public.viagens.verba_liberada_em is 'Quando o Financeiro liberou a verba da viagem.';
comment on column public.viagens.verba_liberada_por is 'Quem do Financeiro liberou a verba.';
comment on column public.viagens.verba_liberada_valor is 'A verba total no instante da liberação; a liberação só vale enquanto for igual à verba total.';

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
    if coalesce(v.verba_total, 0) <= 0 then f_fin := array_append(f_fin, 'a verba total'::text);
    elsif v.verba_liberada_em is null or v.verba_liberada_valor is distinct from v.verba_total then f_fin := array_append(f_fin, 'a liberação da verba'::text); end if;
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
