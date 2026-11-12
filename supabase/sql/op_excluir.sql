-- Excluir uma OP (pedido do usuário em 11/11/2026): só Admin e gerentes, sempre com motivo.
-- Decidido com o usuário: a OP NÃO é apagada. Ela fica no banco marcada como excluída (quem, quando, motivo, a etapa em que estava
-- e o que foi desligado), some de todas as telas e só aparece na aba "OPs em aberto" do CRM/Comercial, marcada, para leitura.
-- O número da OP excluída fica reservado (o índice único oples_opl_key continua valendo; nada é renomeado).
--
-- Como some de todas as telas: política RESTRITIVA em oples (ninguém que entrou lê, altera ou apaga a linha excluída).
-- Funções e gatilhos "security definer" continuam enxergando a linha, por isso a exclusão também põe o status em "Cancelado":
-- todas as regras automáticas (aviso de viagem, frete sem entrega, filas) tratam a OP excluída como cancelada.
-- A exclusão e a leitura das excluídas passam só pelas funções abaixo, que conferem o perfil no banco (a tela não é confiada).

alter table public.oples
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por text,
  add column if not exists excluida_motivo text,
  add column if not exists excluida_status_anterior text,
  add column if not exists excluida_desligado jsonb;

comment on column public.oples.excluida_em is 'Preenchida = OP excluída por Admin/gerente (função op_excluir). A linha fica guardada e some das telas (política oples_nao_excluidas).';

drop policy if exists oples_nao_excluidas on public.oples;
create policy oples_nao_excluidas on public.oples as restrictive for all to authenticated
  using (excluida_em is null) with check (excluida_em is null);

-- O que impede a exclusão, o que será desligado sozinho e o que fica como está (só avisa). Não grava nada.
create or replace function public.op_excluir_conferir(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  o record; bloq text[] := '{}'; desl text[] := '{}'; avis text[] := '{}'; n int; lista text;
begin
  select * into o from public.oples where id = p_id;
  if not found then return jsonb_build_object('erro', 'OP não encontrada (pode já ter sido excluída).'); end if;

  -- ── o que BARRA ──
  if o.data_emissao_nf is not null or o.status_geral in ('Faturado', 'Faturado e Disponivel para Entrega') then
    bloq := bloq || 'Nota fiscal emitida: a OP já foi faturada.'::text;
  end if;
  select count(*) into n from public.op_remessas where opl_id = p_id and not coalesce(cancelada, false);
  if n > 0 then bloq := bloq || format('%s remessa(s) registrada(s) (envio parcial). Cancele as remessas antes.', n); end if;
  select count(*), string_agg(coalesce(transportadora, 'frete'), ', ') into n, lista from public.pcp_fretes
   where vinculo_id = p_id and status in ('Em Trânsito', 'Entregue');
  if n > 0 then bloq := bloq || format('%s frete(s) já saiu/saíram (%s).', n, lista); end if;
  select count(*), string_agg(coalesce(numero_oc, numero_pedido), ', ') into n, lista from public.pcp_pedidos_compra
   where ((vinculo_tipo = 'op' and vinculo_id = p_id::text) or (vinculo_id is null and opl = o.opl))
     and (status_compra = 'Recebido' or coletado_em is not null);
  if n > 0 then bloq := bloq || format('%s compra(s) já recebida(s): %s.', n, lista); end if;

  -- ── o que será DESLIGADO sozinho ──
  select count(*) into n from public.estoque_reservas where opl_id = p_id and situacao = 'reservada';
  if n > 0 then desl := desl || format('%s reserva(s) de estoque liberada(s)', n); end if;
  select count(*) into n from public.demandas_setoriais
   where (opl_id = p_id or (opl_id is null and numero_opl = o.opl)) and status in ('Pendente', 'Em Andamento');
  if n > 0 then desl := desl || format('%s demanda(s) de setor em aberto cancelada(s)', n); end if;
  select count(*) into n from public.pcp_fretes where vinculo_id = p_id and status = 'Cotação';
  if n > 0 then desl := desl || format('%s frete(s) em cotação cancelado(s)', n); end if;
  select count(*) into n from public.viagens where p_id = any(op_ids) and status not in ('finalizada', 'nao_aprovada');
  if n > 0 then desl := desl || format('%s viagem(ns) ligada(s): quem aprova viagens é avisado e confere se ainda faz sentido', n); end if;

  -- ── o que FICA como está (só avisa) ──
  select count(*), string_agg(coalesce(numero_oc, numero_pedido), ', ') into n, lista from public.pcp_pedidos_compra
   where ((vinculo_tipo = 'op' and vinculo_id = p_id::text) or (vinculo_id is null and opl = o.opl))
     and status_compra not in ('Recebido', 'Descartada') and coletado_em is null;
  if n > 0 then avis := avis || format('%s compra(s) em andamento continuam no Compras (%s): cancele lá se for o caso', n, lista); end if;
  select count(*) into n from public.estoque_movimentos where vinculo_tipo = 'op' and vinculo_id = p_id::text and tipo = 'saida';
  if n > 0 then avis := avis || format('material já baixado do estoque (%s movimento(s)): a baixa NÃO volta sozinha', n); end if;
  select count(*) into n from public.pcp_pedidos_serralheria where opl = o.opl and data_conclusao is null;
  if n > 0 then avis := avis || format('%s pedido(s) de serralheria em aberto continuam na fila', n); end if;
  select count(*) into n from public.pcp_pedidos_chicotes where opl = o.opl and data_conclusao is null;
  if n > 0 then avis := avis || format('%s pedido(s) de chicotes em aberto continuam na fila', n); end if;
  select count(*) into n from public.agendamentos_manutencao where opl_id = p_id;
  if n > 0 then avis := avis || format('%s agendamento(s) de manutenção continuam na agenda', n); end if;

  return jsonb_build_object('opl', o.opl, 'status', o.status_geral, 'bloqueios', to_jsonb(bloq), 'desligados', to_jsonb(desl), 'avisos', to_jsonb(avis));
end $$;

-- Exclui (esconde) a OP. Confere perfil, motivo, etapa e bloqueios no banco; tudo ou nada.
create or replace function public.op_excluir(p_id uuid, p_motivo text, p_status_esperado text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  u record; o record; c jsonb; nota text := 'OP excluída';
begin
  select a.id, a.nome, a.email, a.perfil into u from public.auth_usuarios a where a.auth_id = auth.uid() and coalesce(a.ativo, false) limit 1;
  if not found or not (u.perfil = 'Admin' or u.perfil ilike 'gerente%') then
    raise exception 'Só Admin e gerentes podem excluir uma OP.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da exclusão (pelo menos 5 letras).'; end if;

  select * into o from public.oples where id = p_id for update;
  if not found then raise exception 'OP não encontrada (pode já ter sido excluída). Atualize a tela.'; end if;
  if o.status_geral is distinct from p_status_esperado then
    raise exception 'A OP mudou de etapa enquanto a janela estava aberta (agora: %). Atualize a tela e confira antes de excluir.', o.status_geral;
  end if;

  c := public.op_excluir_conferir(p_id);
  if jsonb_array_length(c->'bloqueios') > 0 then
    raise exception 'Esta OP não pode ser excluída: %', (select string_agg(x, ' · ') from jsonb_array_elements_text(c->'bloqueios') x);
  end if;

  update public.estoque_reservas set situacao = 'liberada', encerrada_em = now(), encerrada_por = u.nome,
         motivo_encerramento = 'OP ' || o.opl || ' excluída: ' || btrim(p_motivo)
   where opl_id = p_id and situacao = 'reservada';
  update public.demandas_setoriais set status = 'Cancelada', updated_at = now(),
         observacoes_execucao = concat_ws(E'\n', nullif(observacoes_execucao, ''), 'Cancelada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ': a OP ' || o.opl || ' foi excluída por ' || u.nome || ' — ' || btrim(p_motivo))
   where (opl_id = p_id or (opl_id is null and numero_opl = o.opl)) and status in ('Pendente', 'Em Andamento');
  update public.pcp_fretes set status = 'Cancelado',
         observacoes = concat_ws(' · ', nullif(observacoes, ''), 'Cancelado: OP ' || o.opl || ' excluída — ' || btrim(p_motivo))
   where vinculo_id = p_id and status = 'Cotação';

  insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, usuario_email, data_hora)
  values (p_id, o.opl, u.perfil, 'OP EXCLUÍDA por ' || u.nome || '. Motivo: ' || btrim(p_motivo), o.status_geral, 'Cancelado', u.nome, u.email, now());

  -- por último: marca (o gatilho do aviso de viagem dispara com o status "Cancelado")
  update public.oples set excluida_em = now(), excluida_por = u.nome, excluida_motivo = btrim(p_motivo),
         excluida_status_anterior = o.status_geral, status_geral = 'Cancelado',
         excluida_desligado = jsonb_build_object('desligados', c->'desligados', 'avisos', c->'avisos')
   where id = p_id;
  return c;
end $$;

-- As OPs excluídas, só para a aba "OPs em aberto" do CRM/Comercial (quem tem a aba CRM ou Comercial, e o Admin).
create or replace function public.ops_excluidas_para_o_comercial()
returns setof public.oples language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.tem_alguma_aba(array['crm', 'comercial']) then return; end if;
  return query select * from public.oples where excluida_em is not null order by excluida_em desc;
end $$;

revoke all on function public.op_excluir_conferir(uuid) from public, anon;
revoke all on function public.op_excluir(uuid, text, text) from public, anon;
revoke all on function public.ops_excluidas_para_o_comercial() from public, anon;
grant execute on function public.op_excluir_conferir(uuid) to authenticated;
grant execute on function public.op_excluir(uuid, text, text) to authenticated;
grant execute on function public.ops_excluidas_para_o_comercial() to authenticated;
