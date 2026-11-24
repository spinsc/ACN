-- Serviços de terceiros, fatia T3 (23/11/2026; PLANO_SERVICOS_TERCEIROS.md): o ramo dos serviços no Calendário integrado, com o alerta de serviço atrasado.
--
-- O que muda (só LEITURA das tabelas de origem; nenhuma linha de dado é alterada, e a tabela de serviços nem sofre alteração):
--   1) calendario_eventos_terceiros(p_inicio, p_fim)  — a lista de datas dos serviços: UM evento por VISITA (e não por carro), no mesmo agrupamento do Quadro
--      (mesma venda, tipo, situação, prestador e dia; no agendado também o período; serviço sem venda nunca agrupa, é um evento por serviço).
--        • fonte `terceiro_servico`: o serviço AGENDADO (alerta: vence hoje e atrasado, como as demais datas) e o REALIZADO (só aparece, esmaecido, sem alerta);
--        • fonte `terceiro_desejado`: o pedido ainda em "A definir" que informou a data desejada (só aparece, sem alerta: o pedido atrasado já tem o selo
--          "Data desejada passou" no Quadro, e quem decide a data é outra pessoa).
--      Os envolvidos: quem pediu (o e-mail do cadastro) e, nos tipos em que a Adaptação marca a data (`quem_marca_data = 'adaptacao'`), a equipe da Adaptação, que é
--      quem tem a aba `producao` (como `terceiros_ator()` define; Admin fica de fora do aviso, porque tem todas as abas e já vê tudo com "Todos os usuários").
--      Gerentes e Admin veem tudo pelo botão "Todos os usuários" do Calendário (p_todos), sem receber aviso de serviço de outra pessoa.
--   2) calendario_eventos_base passa a juntar o terceiro ramo (base_1 + mais + terceiros): quem chama (a tela e a rotina de alertas) não muda.
--   3) calendario_alvos: o CASE da aba ganha `terceiro_servico` → `terceiros` (o aviso abre o módulo). O resto da função é a de calendario_avisos_no_painel_avisos.sql.
--      O aviso é UM por visita e por dia: a chave é `terceiro_servico:<id do primeiro serviço da visita>:<dia>`, e some sozinho quando o serviço é realizado, reagendado ou cancelado.
-- A rotina `calendario-avisar` (dias úteis, 8h) já existe e não é mexida. Para desfazer: terceiros_servicos_t3_reverter.sql.

create or replace function public.calendario_eventos_terceiros(p_inicio date, p_fim date)
returns table (fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[],
               aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  with adaptacao as (
    -- a equipe da Adaptação: quem tem a aba `producao` (lista vazia = todas as abas), fora o Admin
    select coalesce(array_agg(lower(trim(u.email))), '{}'::text[]) as emails
      from public.auth_usuarios u
     where coalesce(u.ativo, false) and u.perfil <> 'Admin' and nullif(trim(u.email), '') is not null
       and (jsonb_array_length(coalesce(u.abas_permitidas, '[]'::jsonb)) = 0 or coalesce(u.abas_permitidas, '[]'::jsonb) ? 'producao')
  ), v as (
    select s.id, s.numero, s.status, s.tipo_id, s.venda_base, s.prestador_id, s.periodo, s.ligacao_rotulo, s.solicitante_nome,
           t.nome as tipo_nome, t.quem_marca_data, p.nome as prestador_nome, sol.email as solicitante_email,
           case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end as dia_do_evento
      from public.terceiros_servicos s
      join public.terceiros_tipos t on t.id = s.tipo_id
      left join public.terceiros_prestadores p on p.id = s.prestador_id
      left join public.auth_usuarios sol on sol.id = s.solicitante_id
     where s.status in ('solicitado', 'agendado', 'realizado')
       and case s.status when 'agendado' then s.data_agendada when 'realizado' then s.data_realizada else s.data_desejada end between p_inicio and p_fim
  ), g as (
    -- uma linha por visita: o agrupamento do Quadro (`chaveDoGrupo`, TerceirosFluxo.ts)
    select min(v.id::text) as primeiro_id, count(*)::int as carros, v.status, v.tipo_id, v.dia_do_evento,
           (array_agg(v.tipo_nome))[1] as tipo_nome, (array_agg(v.quem_marca_data))[1] as quem_marca_data, v.venda_base,
           v.prestador_id, (array_agg(v.prestador_nome))[1] as prestador_nome, case when v.status = 'agendado' then v.periodo end as periodo,
           (array_agg(v.numero order by v.numero))[1] as primeiro_numero, (array_agg(v.ligacao_rotulo order by v.numero))[1] as ligacao_rotulo,
           (array_agg(v.solicitante_nome order by v.numero))[1] as responsavel,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_email)), null) as emails,
           array_remove(array_agg(distinct public.cal_nome(v.solicitante_nome)), null) as nomes
      from v
     group by v.status, v.tipo_id, coalesce(v.venda_base, v.id::text), v.venda_base, v.prestador_id, v.dia_do_evento, case when v.status = 'agendado' then v.periodo end
  )
  select case when g.status = 'solicitado' then 'terceiro_desejado' else 'terceiro_servico' end,
         g.primeiro_id, g.dia_do_evento, null::time,
         g.tipo_nome || ' — '
           || case when g.carros > 1 then g.carros || ' carros' || coalesce(' da venda ' || g.venda_base, '')
                   else g.primeiro_numero || coalesce(' · ' || nullif(trim(g.ligacao_rotulo), ''), '') end,
         case g.status
           when 'agendado' then 'Serviço de terceiro · ' || coalesce(g.prestador_nome, 'sem prestador')
                                || ' · ' || case g.periodo when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'dia todo' end
           when 'realizado' then 'Serviço de terceiro realizado · ' || coalesce(g.prestador_nome, 'sem prestador')
           else 'Data desejada do pedido · ' || coalesce(g.prestador_nome, 'sem prestador definido')
         end,
         g.responsavel,
         g.emails || case when g.quem_marca_data = 'adaptacao' then a.emails else '{}'::text[] end,   -- quem pediu e, nos tipos da Adaptação, a equipe dela
         g.nomes,
         '{}'::text[], 'terceiros'::text,
         g.status = 'realizado',
         g.status = 'agendado',
         jsonb_build_object('carros', g.carros, 'venda', g.venda_base, 'periodo', g.periodo, 'prestador', g.prestador_nome, 'tipo', g.tipo_nome, 'situacao', g.status)
    from g cross join adaptacao a
$$;
revoke all on function public.calendario_eventos_terceiros(date, date) from public, anon, authenticated;

-- a base do calendário: as três partes juntas (a tela e a rotina de alertas chamam esta, e não mudam)
create or replace function public.calendario_eventos_base(p_inicio date, p_fim date)
returns table (fonte text, ref_id text, dia date, hora time without time zone, titulo text, detalhe text, responsavel text, emails text[], nomes text[], perfis text[],
               aba_destino text, concluido boolean, alerta boolean, extra jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  select * from public.calendario_eventos_base_1(p_inicio, p_fim)
  union all
  select * from public.calendario_eventos_mais(p_inicio, p_fim)
  union all
  select * from public.calendario_eventos_terceiros(p_inicio, p_fim)
$$;

-- a rotina de alertas: igual à de calendario_avisos_no_painel_avisos.sql, com UMA linha a mais no CASE da aba (`terceiro_servico` abre o módulo Serviços de terceiros)
create or replace function public.calendario_alvos(p_hoje date)
returns table (usuario_id uuid, usuario_nome text, fonte text, ref_id text, dia date, titulo text, detalhe text, aba_destino text, dias_atraso integer, texto_pronto text)
language sql stable security definer set search_path = public, pg_temp
as $$
  with x as (
    select u.id as uid, u.nome as unome, b.fonte, b.ref_id, b.dia, b.titulo, b.detalhe,
           case b.fonte
             when 'crm_retorno' then 'crm' when 'crm_limite' then 'crm' when 'op_entrega' then 'crm' when 'telecom_retorno' then 'telecom'
             when 'licitacao' then 'licitacoes' when 'demanda_avulsa' then 'ajustes' when 'demanda_etapa' then 'ajustes' when 'sac_prazo' then 'sac' when 'sac_chegada_veiculo' then 'sac'
             when 'desenvolvimento_etapa' then 'engenharia'
             when 'op_chegada_veiculo' then 'almoxarifado'
             when 'vistoria_retorno' then 'vistorias' when 'compra_entrega' then 'compras' when 'tarefa_financeiro' then 'financeiro' when 'agendamento' then 'producao'
             when 'terceiro_servico' then 'terceiros'
             else 'calendario' end as aba,
           (p_hoje - b.dia) as atraso,
           array_position(array['esclarecimentos', 'proposta', 'analise', 'disputa'], split_part(b.ref_id, '#', 2)) as ordem   -- a ordem em que as datas de uma licitação acontecem
      from public.calendario_eventos_base(p_hoje - 15, p_hoje) b
      join public.auth_usuarios u
        on coalesce(u.ativo, false) and lower(u.email) not like '%@teste.acn.invalid'
       and (lower(trim(u.email)) = any (b.emails) or lower(trim(u.nome)) = any (b.nomes) or u.perfil = any (b.perfis))
     where b.alerta and not b.concluido
  )
  select x.uid, x.unome, x.fonte, x.ref_id, x.dia, x.titulo, x.detalhe, x.aba, x.atraso, null::text
    from x where x.fonte <> 'licitacao'
  union all
  -- licitação: um aviso por pessoa e licitação. O título de cada data é "<rótulo> — <número>"; o número é igual em todas as datas da licitação.
  select x.uid, x.unome, 'licitacao', split_part(x.ref_id, '#', 1), max(x.dia),
         max(substr(x.titulo, strpos(x.titulo, ' — ') + 3)),
         null::text, 'licitacoes', (p_hoje - max(x.dia)),
         'Licitação ' || max(substr(x.titulo, strpos(x.titulo, ' — ') + 3))
         || case
              when count(*) filter (where x.dia < p_hoje) > 0 then
                ' em andamento com a data vencida ('
                || string_agg(lower(split_part(x.titulo, ' — ', 1)) || ' ' || to_char(x.dia, 'DD/MM'), ', ' order by x.dia, x.ordem) filter (where x.dia < p_hoje)
                || '). Manter atualizada.'
                || coalesce(' Hoje: ' || string_agg(lower(split_part(x.titulo, ' — ', 1)), ', ' order by x.ordem) filter (where x.dia = p_hoje) || '.', '')
              else
                ' tem data hoje: ' || string_agg(lower(split_part(x.titulo, ' — ', 1)), ', ' order by x.ordem) || '.'
            end
    from x where x.fonte = 'licitacao'
   group by x.uid, x.unome, split_part(x.ref_id, '#', 1)
$$;
revoke all on function public.calendario_alvos(date) from public, anon, authenticated;
