-- Calendário integrado (pedido do usuário em 12/11/2026; PLANO_CALENDARIO.md).
-- Uma lista única das datas do sistema, lida pelo Calendário (tela) e pela rotina de alertas, para os dois nunca discordarem.
-- A data continua morando onde nasce (prazo da demanda, chegada na OP, entrega da compra...): nada é copiado para agenda_compromissos.
-- Só LEITURA das tabelas de origem; nenhuma linha de dado é alterada.
--
-- calendario_eventos_base  : todas as datas, com os "envolvidos" (e-mails, nomes e perfis); SEM filtro, só o servidor a chama.
-- calendario_eventos       : a que a tela chama; devolve só o que a pessoa que entrou pode ver (responsável, participante, perfil que age;
--                            Admin e gerentes veem tudo com p_todos).
-- calendario_avisar        : a rotina de alertas (um aviso por item, que se renova todo dia útil enquanto atrasado, até 15 dias).
--                            NÃO é agendada aqui: só liga depois da simulação mostrada ao usuário.

create or replace function public.cal_nome(p text) returns text language sql immutable as $$ select nullif(lower(trim(p)), '') $$;

-- e-mails ou nomes de uma lista de participantes ([{email, nome}])
create or replace function public.cal_participantes(p jsonb, campo text) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct lower(trim(x ->> campo))) filter (where coalesce(trim(x ->> campo), '') <> ''), '{}'::text[])
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
$$;

create or replace function public.calendario_eventos_base(p_inicio date, p_fim date)
returns table (
  fonte text, ref_id text, dia date, hora time, titulo text, detalhe text, responsavel text,
  emails text[], nomes text[], perfis text[], aba_destino text, concluido boolean, alerta boolean, extra jsonb
)
language sql stable security definer set search_path = public, pg_temp
as $$
  -- 1) compromissos digitados no calendário (a única fonte criada na própria tela)
  select 'compromisso'::text, c.id::text,
         (c.data_hora at time zone 'America/Sao_Paulo')::date, (c.data_hora at time zone 'America/Sao_Paulo')::time,
         c.titulo, c.descricao, c.usuario_nome,
         array_remove(array[cal_nome(c.usuario_email)], null) || cal_participantes(c.participantes, 'email'),
         cal_participantes(c.participantes, 'nome'), '{}'::text[], 'calendario'::text, coalesce(c.concluido, false), true, to_jsonb(c)
    from agenda_compromissos c
   where (c.data_hora at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim

  union all
  -- 2) próximo contato com o cliente (CRM e Telecom Vendas); card encerrado (perdido, desistência, faturado) não tem mais contato a fazer
  select case when c.setor_venda = 'telecom' then 'telecom_retorno' else 'crm_retorno' end, c.id::text,
         c.prox_contato, c.hora_prox_contato,
         c.titulo, 'Contato com o cliente' || coalesce(' · ' || nullif(trim(c.nome_contato), ''), ''), c.responsavel_nome,
         cal_participantes(c.participantes, 'email'),
         array_remove(array[cal_nome(c.responsavel_nome)], null) || cal_participantes(c.participantes, 'nome'),
         '{}'::text[], case when c.setor_venda = 'telecom' then 'telecom' else 'crm' end, false, true,
         jsonb_build_object('nome_contato', c.nome_contato, 'numero_pv', c.numero_pv)
    from crm_oportunidades c
    left join crm_estagios_funil e on e.id = c.estagio_id
   where c.funil = 'venda_direta' and c.prox_contato between p_inicio and p_fim
     and coalesce(e.tipo, '') not in ('perdido', 'desistencia', 'faturado')

  union all
  -- 3) limite da proposta e da análise no card do CRM
  select 'crm_limite', c.id::text || '#proposta', c.data_limite_proposta, null::time,
         'Limite da proposta — ' || c.titulo, 'Prazo para enviar a proposta', c.responsavel_nome,
         cal_participantes(c.participantes, 'email'),
         array_remove(array[cal_nome(c.responsavel_nome)], null) || cal_participantes(c.participantes, 'nome'),
         '{}'::text[], 'crm', false, true, null::jsonb
    from crm_oportunidades c
    left join crm_estagios_funil e on e.id = c.estagio_id
   where c.funil = 'venda_direta' and c.data_limite_proposta between p_inicio and p_fim
     and coalesce(e.tipo, '') not in ('perdido', 'desistencia', 'faturado', 'enviado', 'aguardando_empenho', 'ganho')
  union all
  select 'crm_limite', c.id::text || '#analise', c.data_limite_analise, null::time,
         'Limite da análise — ' || c.titulo, 'Prazo para a análise técnica', c.responsavel_nome,
         cal_participantes(c.participantes, 'email'),
         array_remove(array[cal_nome(c.responsavel_nome)], null) || cal_participantes(c.participantes, 'nome'),
         '{}'::text[], 'crm', false, true, null::jsonb
    from crm_oportunidades c
    left join crm_estagios_funil e on e.id = c.estagio_id
   where c.funil = 'venda_direta' and c.data_limite_analise between p_inicio and p_fim
     and coalesce(e.tipo, '') not in ('perdido', 'desistencia', 'faturado', 'enviado', 'aguardando_empenho', 'ganho')

  union all
  -- 4) datas das licitações abertas: esclarecimentos, proposta, análise técnica e disputa; o perfil Licitações vê todas
  select 'licitacao', l.id::text || '#' || d.tipo, (d.quando at time zone 'America/Sao_Paulo')::date, (d.quando at time zone 'America/Sao_Paulo')::time,
         d.rotulo || ' — ' || coalesce(nullif(trim(l.numero), ''), nullif(trim(l.nome_projeto), ''), 'licitação'),
         coalesce(nullif(trim(l.orgao), ''), 'Licitação'), coalesce(nullif(trim(l.analista_nome), ''), nullif(trim(l.coordenador_nome), ''), nullif(trim(l.operador), '')),
         array_remove(array[cal_nome(l.analista_email), cal_nome(l.coordenador_email)], null),
         array_remove(array[cal_nome(l.analista_nome), cal_nome(l.coordenador_nome), cal_nome(l.operador)], null),
         array['Licitações', 'Gerente de Licitações'], 'licitacoes', false, true, null::jsonb
    from licitacoes l
    cross join lateral (values
      ('esclarecimentos', 'Limite de esclarecimentos', l.data_limite_esclarecimentos),
      ('proposta', 'Limite da proposta', l.data_limite_proposta),
      ('analise', 'Limite da análise técnica', l.data_limite_analise_tecnica),
      ('disputa', 'Disputa', l.data_disputa)) as d(tipo, rotulo, quando)
   where l.status in ('Aberta', 'Em Andamento') and d.quando is not null
     and (d.quando at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim

  union all
  -- 5) prazo da demanda avulsa (hora só quando a pessoa pôs uma; o prazo "só dia" é gravado ao meio-dia)
  select 'demanda_avulsa', d.id::text, (d.prazo at time zone 'America/Sao_Paulo')::date,
         case when (d.prazo at time zone 'America/Sao_Paulo')::time = time '12:00' then null else (d.prazo at time zone 'America/Sao_Paulo')::time end,
         d.titulo, 'Demanda' || coalesce(' · ' || nullif(trim(d.setor), ''), '') || ' · ' || d.status, d.responsavel_nome,
         case when cal_nome(d.responsavel_email) is null and cal_nome(d.responsavel_nome) is null then array_remove(array[cal_nome(d.criado_por)], null) else array_remove(array[cal_nome(d.responsavel_email)], null) end
           || cal_participantes(d.membros, 'email'),
         array_remove(array[cal_nome(d.responsavel_nome)], null) || cal_participantes(d.membros, 'nome'),
         '{}'::text[], 'demandas', false, true, null::jsonb
    from demandas_avulsas d
   where d.prazo is not null and d.status not in ('Concluída', 'Cancelada')
     and (d.prazo at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim

  union all
  -- 6) OS do SAC: prazo do orçamento e previsão de entrega (some quando a OS sai da etapa, é entregue ou cancelada)
  select 'sac_prazo', s.id::text || '#orcamento', s.prazo_orcamento, null::time,
         'Prazo do orçamento — OS ' || coalesce(s.numero_os, '') || coalesce(' · ' || nullif(trim(s.cliente_nome), ''), ''), 'OS do SAC · ' || s.status, s.responsavel_nome,
         '{}'::text[], array_remove(array[cal_nome(s.responsavel_nome), cal_nome(s.criado_por_nome)], null),
         '{}'::text[], 'sac', false, true, null::jsonb
    from sac_ordens_servico s
   where s.prazo_orcamento between p_inicio and p_fim and s.status in ('Aberta', 'Diagnóstico', 'Verificação e Orçamento')
  union all
  select 'sac_prazo', s.id::text || '#entrega', s.data_prevista_entrega, null::time,
         'Previsão de entrega — OS ' || coalesce(s.numero_os, '') || coalesce(' · ' || nullif(trim(s.cliente_nome), ''), ''), 'OS do SAC · ' || s.status, s.responsavel_nome,
         '{}'::text[], array_remove(array[cal_nome(s.responsavel_nome), cal_nome(s.criado_por_nome)], null),
         '{}'::text[], 'sac', false, true, null::jsonb
    from sac_ordens_servico s
   where s.data_prevista_entrega between p_inicio and p_fim
     and s.status not in ('Cancelada', 'Entregue', 'Concluído', 'Aguardando Emissão NF', 'Faturada - Aguardando Entrega')

  union all
  -- 7) recebimento do carro da OP de adaptação: a data é a PREVISÃO (decidido com o usuário em 12/11/2026); chassi lançado = o carro já chegou
  select 'op_chegada_veiculo', o.id::text, o.data_chegada_veiculo, null::time,
         'Chega o veículo — OP ' || o.opl || coalesce(' · ' || nullif(trim(o.cliente_nome), ''), ''), 'Recebimento do veículo · ' || o.status_geral,
         coalesce(nullif(trim(o.responsavel_comercial), ''), nullif(trim(o.vendedor), '')),
         '{}'::text[], array_remove(array[cal_nome(o.responsavel_comercial), cal_nome(o.vendedor)], null),
         array['Almoxarifado'], 'almoxarifado', false, true, null::jsonb
    from oples o
   where o.excluida_em is null and o.data_chegada_veiculo between p_inicio and p_fim
     and o.status_geral in ('Em Espera PCP', 'Aguardando Almox', 'Aguardando Inicio Producao', 'Devolvida PCP')
     and coalesce(trim(o.chassi), '') = '' and coalesce(o.fluxo_entrega, '') not like 'envio%'

  union all
  -- 8) entrega prometida da OP ao cliente (some quando a OP é faturada ou cancelada)
  select 'op_entrega', o.id::text, o.data_prevista_entrega, null::time,
         'Entrega ao cliente — OP ' || o.opl || coalesce(' · ' || nullif(trim(o.cliente_nome), ''), ''), 'Previsão de entrega · ' || o.status_geral,
         coalesce(nullif(trim(o.responsavel_comercial), ''), nullif(trim(o.vendedor), '')),
         '{}'::text[], array_remove(array[cal_nome(o.responsavel_comercial), cal_nome(o.vendedor)], null),
         '{}'::text[], 'crm', false, true, null::jsonb
    from oples o
   where o.excluida_em is null and o.data_prevista_entrega between p_inicio and p_fim
     and o.status_geral not in ('Faturado', 'Cancelado', 'Cancelada')

  union all
  -- 9) saída da vistoria de pátio que ainda não voltou
  select 'vistoria_retorno', v.id::text, v.previsao_retorno, null::time,
         'Retorno da vistoria de pátio' || coalesce(' — ' || nullif(trim(v.veiculo_modelo), ''), '') || coalesce(' ' || nullif(trim(v.veiculo_placa), ''), ''),
         'Saída da vistoria' || coalesce(' · ' || nullif(trim(v.destino), ''), ''), coalesce(nullif(trim(v.solicitante), ''), v.criado_por_nome),
         array_remove(array[cal_nome(v.criado_por)], null), array_remove(array[cal_nome(v.solicitante), cal_nome(v.criado_por_nome)], null),
         '{}'::text[], 'logistica', false, true, null::jsonb
    from vistorias_patio v
   where v.previsao_retorno between p_inicio and p_fim and coalesce(v.status, '') <> 'Retornou'

  union all
  -- 10) entrega ou coleta prevista da compra (só a já comprada e ainda não recebida)
  select 'compra_entrega', p.id::text,
         coalesce(p.prazo_prometido_entrega, (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date), null::time,
         case when p.forma_recebimento = 'coleta' then 'Coleta da compra ' else 'Chega a compra ' end || coalesce(p.numero_pedido, '') || coalesce(' · ' || nullif(trim(p.fornecedor), ''), ''),
         case when p.forma_recebimento = 'coleta' then 'Coleta marcada' else 'Entrega prevista' end || coalesce(' · OC ' || nullif(trim(p.numero_oc), ''), ''),
         coalesce(nullif(trim(p.comprador_nome), ''), p.criado_por_nome),
         array_remove(array[cal_nome(p.comprador_email)], null),
         array_remove(array[cal_nome(p.comprador_nome), cal_nome(p.criado_por_nome)], null),
         array['Almoxarifado', 'Compras'], 'compras', false, true, null::jsonb
    from pcp_pedidos_compra p
   where p.status_compra = 'Comprado' and coalesce(p.coletado_em::text, '') = ''
     and coalesce(p.prazo_prometido_entrega, (p.data_prevista_recebimento at time zone 'America/Sao_Paulo')::date) between p_inicio and p_fim

  union all
  -- 11) tarefas do Financeiro (vencimento)
  select 'tarefa_financeiro', t.id::text, t.data_vencimento, null::time, t.titulo, 'Tarefa do Financeiro · vence neste dia', t.responsavel_nome,
         array_remove(array[cal_nome(t.responsavel_email)], null) || cal_participantes(t.participantes, 'email'),
         array_remove(array[cal_nome(t.responsavel_nome)], null) || cal_participantes(t.participantes, 'nome'),
         '{}'::text[], 'financeiro', false, true, null::jsonb
    from financeiro_tarefas t
   where t.data_vencimento between p_inicio and p_fim and coalesce(t.etapa, '') <> 'Concluído'

  union all
  -- 12) tarefas da Engenharia (dia do início ou da criação): só aparecem, não geram alerta (não são prazo)
  select 'tarefa_engenharia', t.id::text, (coalesce(t.data_inicio, t.criado_em) at time zone 'America/Sao_Paulo')::date,
         case when t.data_inicio is null then null else (t.data_inicio at time zone 'America/Sao_Paulo')::time end,
         t.titulo, 'Tarefa da Engenharia · ' || case when t.data_inicio is null then 'criada neste dia' else 'iniciada neste dia' end || coalesce(' · OP ' || nullif(trim(t.numero_opl), ''), ''),
         t.responsavel_nome, cal_participantes(t.participantes, 'email'),
         array_remove(array[cal_nome(t.responsavel_nome)], null) || cal_participantes(t.participantes, 'nome'),
         '{}'::text[], 'engenharia', false, false, null::jsonb
    from engenharia_horas_tarefas t
   where coalesce(t.status, '') <> 'concluida'
     and (coalesce(t.data_inicio, t.criado_em) at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
     and t.criado_em >= (p_inicio - 62)

  union all
  -- 13) agendamentos de manutenção
  select 'agendamento', a.id::text, a.data_agendamento, null::time,
         'Manutenção — OP ' || coalesce(a.numero_opl, '—') || coalesce(' · ' || nullif(trim(a.cliente_nome), ''), ''),
         'Agendamento de manutenção' || coalesce(' · ' || nullif(trim(a.periodo), ''), '') || coalesce(' · ' || nullif(trim(a.modelo), ''), ''), a.agendado_por,
         cal_participantes(a.participantes, 'email'),
         array_remove(array[cal_nome(a.agendado_por)], null) || cal_participantes(a.participantes, 'nome'),
         '{}'::text[], 'producao', false, true, null::jsonb
    from agendamentos_manutencao a
   where a.data_agendamento between p_inicio and p_fim
$$;

-- só o servidor e as funções abaixo chamam a base (ela não filtra por pessoa)
revoke all on function public.calendario_eventos_base(date, date) from public, anon, authenticated;
revoke all on function public.cal_nome(text) from public, anon, authenticated;
revoke all on function public.cal_participantes(jsonb, text) from public, anon, authenticated;

-- a da tela: cada pessoa recebe só as datas em que é responsável, participante ou do perfil que age; Admin e gerentes veem tudo com p_todos
create or replace function public.calendario_eventos(p_inicio date, p_fim date, p_todos boolean default false)
returns table (
  fonte text, ref_id text, dia date, hora time, titulo text, detalhe text, responsavel text,
  emails text[], nomes text[], perfis text[], aba_destino text, concluido boolean, alerta boolean, extra jsonb
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_email text; v_nome text; v_perfil text; v_gerente boolean;
begin
  select lower(trim(a.email)), lower(trim(a.nome)), a.perfil
    into v_email, v_nome, v_perfil
    from auth_usuarios a where a.auth_id = auth.uid() and coalesce(a.ativo, false) limit 1;
  if v_perfil is null and v_email is null then return; end if;   -- quem não entrou não vê nada
  v_gerente := coalesce(v_perfil, '') = 'Admin' or coalesce(v_perfil, '') ilike 'gerente%';
  return query
    select b.* from calendario_eventos_base(p_inicio, p_fim) b
     where (p_todos and v_gerente) or v_email = any (b.emails) or v_nome = any (b.nomes) or v_perfil = any (b.perfis);
end;
$$;
revoke all on function public.calendario_eventos(date, date, boolean) from public, anon;
grant execute on function public.calendario_eventos(date, date, boolean) to authenticated;

-- ── Alertas (migração `calendario_avisar`, 12/11/2026) — NÃO agendada: ligar só com o OK do usuário ──
-- Decisões do usuário: um aviso POR ITEM na caixa de Menções; avisa no dia e, atrasado, todo dia útil até resolver, por até 15 dias de atraso.
-- O aviso de cada item é um só, que se RENOVA (volta a "não lido") e some sozinho quando o item é resolvido, muda de data ou passa de 15 dias.
create or replace function public.calendario_alvos(p_hoje date)
returns table (usuario_id uuid, usuario_nome text, fonte text, ref_id text, dia date, titulo text, detalhe text, aba_destino text, dias_atraso integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, u.nome, b.fonte, b.ref_id, b.dia, b.titulo, b.detalhe,
         case b.fonte
           when 'crm_retorno' then 'crm' when 'crm_limite' then 'crm' when 'op_entrega' then 'crm' when 'telecom_retorno' then 'telecom'
           when 'licitacao' then 'licitacoes' when 'demanda_avulsa' then 'ajustes' when 'sac_prazo' then 'sac' when 'op_chegada_veiculo' then 'almoxarifado'
           when 'vistoria_retorno' then 'vistorias' when 'compra_entrega' then 'compras' when 'tarefa_financeiro' then 'financeiro' when 'agendamento' then 'producao'
           else 'calendario' end,
         (p_hoje - b.dia)
    from public.calendario_eventos_base(p_hoje - 15, p_hoje) b
    join public.auth_usuarios u
      on coalesce(u.ativo, false) and lower(u.email) not like '%@teste.acn.invalid'
     and (lower(trim(u.email)) = any (b.emails) or lower(trim(u.nome)) = any (b.nomes) or u.perfil = any (b.perfis))
   where b.alerta and not b.concluido
$$;
revoke all on function public.calendario_alvos(date) from public, anon, authenticated;

create or replace function public.calendario_avisar()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record; chave text; texto text; achou integer;
  novos integer := 0; renovados integer := 0; resolvidos integer := 0;
begin
  if extract(isodow from hoje) > 5 then return jsonb_build_object('fim_de_semana', true); end if;
  drop table if exists _cal_alvos2;
  create temp table _cal_alvos2 on commit drop as select * from public.calendario_alvos(hoje);
  for r in select * from _cal_alvos2 loop
    chave := r.fonte || ':' || r.ref_id || ':' || r.dia::text;
    texto := case when r.dias_atraso = 0 then 'Hoje: ' else 'Atrasado há ' || r.dias_atraso || case when r.dias_atraso = 1 then ' dia: ' else ' dias: ' end end
             || r.titulo || coalesce(' (' || nullif(r.detalhe, '') || ')', '');
    update public.mencoes set texto_trecho = texto, lida = false, criado_em = now()
     where mencionado_id = r.usuario_id::text and contexto = 'calendario' and contexto_id = chave and not resolvida;
    get diagnostics achou = row_count;
    if achou > 0 then
      renovados := renovados + 1;
    else
      insert into public.mencoes (mencionado_id, mencionado_nome, mencionante_id, mencionante_nome, contexto, contexto_id, contexto_descricao, campo, texto_trecho, aba_destino, lida)
      values (r.usuario_id::text, r.usuario_nome, '', 'Sistema', 'calendario', chave, 'Calendário', 'data', texto, r.aba_destino, false);
      novos := novos + 1;
    end if;
  end loop;
  update public.mencoes m set resolvida = true, resolvida_em = now(), resolvida_por = 'Sistema'
   where m.contexto = 'calendario' and not m.resolvida
     and not exists (select 1 from _cal_alvos2 a where a.usuario_id::text = m.mencionado_id and a.fonte || ':' || a.ref_id || ':' || a.dia::text = m.contexto_id);
  get diagnostics resolvidos = row_count;
  return jsonb_build_object('novos', novos, 'renovados', renovados, 'resolvidos', resolvidos);
end;
$$;
revoke all on function public.calendario_avisar() from public, anon, authenticated;

-- para ligar (só com OK):    select cron.schedule('calendario-avisar', '0 11 * * 1-5', 'select public.calendario_avisar()');   -- 8h de Brasília, dias úteis
-- para desligar:             select cron.unschedule('calendario-avisar');
-- para desfazer tudo:        drop function public.calendario_avisar(); drop function public.calendario_alvos(date); drop function public.calendario_eventos(date, date, boolean);
--                            drop function public.calendario_eventos_base(date, date); drop function public.cal_participantes(jsonb, text); drop function public.cal_nome(text);

-- ── Mais fontes (migrações `calendario_eventos_mais_fontes` e `calendario_alvos_demanda_etapa`, 12/11/2026) ──
-- A base acima virou `calendario_eventos_base_1`; a `calendario_eventos_base` atual = base_1 + `calendario_eventos_mais` (quem chama não muda).
-- Em `calendario_alvos` o CASE da aba ganhou `when 'demanda_etapa' then 'ajustes'`. Chicotes e serralheria ficaram de fora: as tabelas de pedido com data prevista estão VAZIAS
-- (o trabalho deles vem pelas demandas de setor, que não têm data prevista em aberto); a chegada do carro da OS do SAC entrou em 12/11/2026 (migração `calendario_sac_chegada_veiculo`: coluna nova `sac_ordens_servico.previsao_chegada_veiculo` e o ramo `sac_chegada_veiculo` ao fim de `calendario_eventos_mais`, com alerta para quem abriu a OS, o responsável e os perfis Almoxarifado e Gerente Produção; some quando `data_chegada_veiculo` é preenchida; `calendario_alvos` leva o aviso à aba SAC). O corpo completo continua só na migração aplicada.
-- alter function public.calendario_eventos_base(date, date) rename to calendario_eventos_base_1;
-- create or replace function public.calendario_eventos_mais(p_inicio date, p_fim date) returns table (...mesmas colunas) ... :
--   demanda_etapa  — etapas[].prazo de demanda avulsa em aberto (etapa não concluída nem cancelada); alerta
--   frete_previsto — pcp_fretes outbound em Cotação ou Em Trânsito, com data_prevista; SEM alerta (já existe o aviso de frete sem entrega)
--   viagem_saida   — viagens aberta/em_aprovacao/provisionamento/aprovada com data_saida; SEM alerta (já existe o aviso de saída próxima)
--   frota_reserva  — um evento por dia de reserva ativa da frota; SEM alerta
-- (o corpo completo está na migração aplicada; este arquivo guarda a descrição)
