-- 29/10/2026 (pedido do usuário): o vendedor da OP é avisado, na caixa de Menções, quando o frete dela saiu ("Em Trânsito") e a entrega ninguém confirmou.
-- A regra é a mesma do selo e da faixa da Logística (src/FreteDaOp.ts, `freteSemEntrega`): 5 dias corridos desde a coleta OU a data prevista de entrega já passada.
-- Um aviso por frete (a marca `aviso_sem_entrega_em` impede repetir); só frete de saída (outbound) ligado a uma OP que ainda está viva.
-- Quem recebe: o responsável comercial e o vendedor da OP (pelo nome, como a OP os guarda); se nenhum for um usuário ativo, quem abriu a OP.
-- A função só roda pela rotina agendada (arquivo frete_sem_entrega_rotina.sql): ninguém a chama pelo sistema, então nem a chave pública nem quem entrou podem executá-la.

alter table public.pcp_fretes add column if not exists aviso_sem_entrega_em timestamptz;
comment on column public.pcp_fretes.aviso_sem_entrega_em is 'Quando o vendedor da OP foi avisado (Menções) de que o frete saiu e a entrega não foi confirmada. Nulo = ainda não avisado.';

create or replace function public.fretes_avisar_sem_entrega()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  f record;
  u record;
  dias integer;
  texto text;
  gravou integer;
  avisados integer := 0;
begin
  for f in
    select fr.id as frete_id, fr.transportadora, fr.data_coleta, fr.data_prevista,
           o.opl, o.cliente_nome, o.responsavel_comercial, o.vendedor, o.criado_por_nome
      from public.pcp_fretes fr
      join public.oples o on o.id = fr.vinculo_id
     where fr.vinculo_tipo in ('op_os', 'opl')
       and fr.direcao = 'outbound'
       and fr.status = 'Em Trânsito'
       and fr.aviso_sem_entrega_em is null
       and o.status_geral not in ('Faturado', 'Cancelado', 'Cancelada')
       and (
         (fr.data_coleta is not null and hoje - (fr.data_coleta at time zone 'America/Sao_Paulo')::date >= 5)
         or (fr.data_prevista is not null and fr.data_prevista < hoje)
       )
     order by fr.data_coleta
  loop
    dias := case when f.data_coleta is null then null else hoje - (f.data_coleta at time zone 'America/Sao_Paulo')::date end;
    texto := 'O frete da OP ' || f.opl || ' (' || coalesce(nullif(trim(f.transportadora), ''), 'transportadora não informada') || ') '
      || case when f.data_coleta is null then 'está em trânsito' else 'saiu em ' || to_char(f.data_coleta at time zone 'America/Sao_Paulo', 'DD/MM') end
      || ' e a entrega ainda não foi confirmada'
      || case when dias is not null and dias >= 5 then ' (' || dias || ' dias)' else '' end
      || case when f.data_prevista is not null and f.data_prevista < hoje then '; a data prevista era ' || to_char(f.data_prevista, 'DD/MM') else '' end
      || '. Confirme com o cliente e peça à Logística o canhoto.';
    gravou := 0;
    for u in
      with alvos as (
        select a.id, a.nome from public.auth_usuarios a
         where coalesce(a.ativo, true) and trim(coalesce(a.nome, '')) <> ''
           and lower(trim(a.nome)) in (lower(trim(coalesce(f.responsavel_comercial, ''))), lower(trim(coalesce(f.vendedor, ''))))
      )
      select id, nome from alvos
      union
      select a.id, a.nome from public.auth_usuarios a
       where not exists (select 1 from alvos)
         and coalesce(a.ativo, true) and trim(coalesce(a.nome, '')) <> ''
         and lower(trim(a.nome)) = lower(trim(coalesce(f.criado_por_nome, '')))
    loop
      insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
      values (u.id::text, u.nome, '', 'Sistema', 'frete_entrega', f.frete_id::text,
              'OP ' || f.opl || coalesce(' — ' || nullif(trim(f.cliente_nome), ''), ''),
              'entrega_nao_confirmada', texto, 'crm', false);
      gravou := gravou + 1;
    end loop;
    if gravou > 0 then
      update public.pcp_fretes set aviso_sem_entrega_em = now() where id = f.frete_id;
      avisados := avisados + 1;
    end if;
  end loop;
  return avisados;
end;
$$;

comment on function public.fretes_avisar_sem_entrega() is 'Rotina agendada (dias úteis, 8h de Brasília): avisa na caixa de Menções o vendedor da OP cujo frete saiu e não teve a entrega confirmada em 5 dias ou depois da data prevista. Devolve quantos fretes avisou.';
revoke execute on function public.fretes_avisar_sem_entrega() from public, anon, authenticated;
