-- ─────────────────────────────────────────────────────────────────────────────
-- FLUXO "SOMENTE SERVIÇO DE TERCEIRO" (pedido do usuário em 25/11/2026)
--
-- As OPs 1760, 1797 e 1806 eram só plotagem e mais nada: não precisam do PCP, do Almoxarifado nem da Adaptação. A OP desse fluxo nasce em "Aguardando Servico de Terceiro"
-- (a tela a cria assim e abre um serviço do módulo de Serviços de terceiros por tipo e por unidade) e, quando TODOS os serviços dela estão realizados, o banco a leva
-- à Liberação Comercial (ou direto ao Fiscal/entrega, se o faturamento foi antecipado: a mesma regra de `statusDeLiberacaoComercial`, FluxoEntrega.ts). Decidido com o
-- usuário em 25/11/2026: sem PCP; depois do serviço, Liberação Comercial e Fiscal, sem CQ.
--
-- Por que no banco e não na tela: o serviço é dado como realizado de vários jeitos (a janela do serviço, a do grupo, a ordem de pintura em lote, o arrastar no Quadro) e todos
-- terminam num UPDATE de `terceiros_servicos.status`. Um gatilho cobre todos e nenhuma tela esquece de levar a OP adiante.
--
-- O que muda no banco:
--   1) `oples_fluxo_entrega_check` passa a aceitar 'somente_servico_terceiro' (a licitação e o card do CRM não: nenhum deles escolhe esse fluxo);
--   2) função + gatilho `terceiros_avancar_op` em `terceiros_servicos` (só dispara quando o status muda e o serviço é ligado a uma OP).
-- Nenhum dado existente é mexido. Reverter: terceiros_so_servico_reverter.sql.
-- ─────────────────────────────────────────────────────────────────────────────

set local lock_timeout = '3s';

-- 1) o valor novo do fluxo. A nova trava entra primeiro (NOT VALID não varre a tabela), é validada e só então a antiga sai: a OP nunca fica sem trava.
alter table public.oples add constraint oples_fluxo_entrega_check_v2 check (
  fluxo_entrega is null or fluxo_entrega = any (array[
    'adaptacao_matriz', 'adaptacao_externa', 'fabricacao_interna_envio', 'fabricacao_serralheria_envio',
    'envio_adaptacao_terceiro', 'envio_material', 'somente_servico_terceiro'
  ])) not valid;
alter table public.oples validate constraint oples_fluxo_entrega_check_v2;
alter table public.oples drop constraint oples_fluxo_entrega_check;
alter table public.oples rename constraint oples_fluxo_entrega_check_v2 to oples_fluxo_entrega_check;

-- 2) o gatilho
create or replace function public.terceiros_avancar_op()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o record; novo text; faltam int; feitos int; quem text;
begin
  if new.ligacao_id is null then return new; end if;

  -- só a OP desse fluxo (a de adaptação, envio etc. que tem um serviço de terceiro segue o caminho dela); a linha é travada para duas baixas ao mesmo tempo não se atropelarem
  select id, opl, status_geral, fluxo_entrega, fat_antecipado_em, data_emissao_nf into o
    from public.oples where id = new.ligacao_id and excluida_em is null for update;
  if not found or o.fluxo_entrega is distinct from 'somente_servico_terceiro' then return new; end if;

  quem := coalesce((select u.nome from public.auth_usuarios u where u.auth_id = public.uid_efetivo() limit 1), 'Sistema');

  if new.status in ('realizado', 'cancelado') and o.status_geral = 'Aguardando Servico de Terceiro' then
    select count(*) filter (where s.status in ('solicitado', 'agendado')), count(*) filter (where s.status = 'realizado')
      into faltam, feitos
      from public.terceiros_servicos s where s.ligacao_tipo = 'op' and s.ligacao_id = o.id;
    -- só avança quando nenhum serviço está aberto E pelo menos um foi feito: se todos foram cancelados a OP fica onde está, para a pessoa decidir
    if faltam = 0 and feitos > 0 then
      novo := case when o.fat_antecipado_em is null then 'Aguardando Liberacao Comercial'
                   when o.data_emissao_nf is not null then 'Faturado e Disponivel para Entrega'
                   else 'Aguarda Emissao NF' end;
      update public.oples set status_geral = novo where id = o.id and status_geral = o.status_geral;
      insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
      values (o.id, o.opl, 'Serviços de terceiros', 'Todos os serviços de terceiro foram realizados — a OP segue para a etapa seguinte', o.status_geral, novo, quem, now());
    end if;

  elsif old.status = 'realizado' and new.status in ('agendado', 'solicitado') and o.status_geral = 'Aguardando Liberacao Comercial' then
    -- o serviço foi reaberto (voltou de Realizado para Agendado) e o Comercial ainda não liberou a OP: ela volta a esperar o prestador
    update public.oples set status_geral = 'Aguardando Servico de Terceiro' where id = o.id and status_geral = o.status_geral;
    insert into public.logs_movimentacao_opl (opl_id, numero_opl, setor, evento, status_anterior, status_novo, usuario_nome, data_hora)
    values (o.id, o.opl, 'Serviços de terceiros', 'Um serviço de terceiro foi reaberto — a OP volta a esperar o prestador', o.status_geral, 'Aguardando Servico de Terceiro', quem, now());
  end if;

  return new;
end $$;

-- gatilho não precisa de direito de ninguém: só o próprio gatilho a executa (regra do projeto para função de gatilho nova)
revoke all on function public.terceiros_avancar_op() from public, anon, authenticated;

drop trigger if exists terceiros_avancar_op on public.terceiros_servicos;
create trigger terceiros_avancar_op
  after update of status on public.terceiros_servicos
  for each row
  when (old.status is distinct from new.status and new.ligacao_tipo = 'op')
  execute function public.terceiros_avancar_op();
