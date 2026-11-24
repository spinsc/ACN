-- Aprovação de compra conferida NO BANCO (etapa 6 da revisão de permissões, 24/11/2026).
-- Antes: só a tela barrava quem não é aprovador (`podeAprovarCompra` = auth_usuarios.pode_aprovar_compra, regra de 24/09/2026: aprova quem está marcado no Admin, e mais ninguém,
-- nem Admin sem a marca). Quem chamasse o banco por fora (ou uma janela antiga) aprovava ou rejeitava qualquer pedido.
-- Agora dois gatilhos repetem a regra, com a pessoa do crachá (uid_efetivo: o "Ver como" vale como a pessoa vista):
--   1) pcp_aprovacoes: a linha só passa a "aprovado" ou "rejeitado" (ao gravar ou ao mudar) se a pessoa tem a marca. Voltar a "pendente" e "cancelado" (reprocesso, descarte,
--      desfazer uma rejeição que falhou) continuam livres. Sem pessoa no crachá (rotinas do servidor e migrações) não confere.
--   2) pcp_pedidos_compra: o pedido não vai para "Aprovado" enquanto houver linha de aprovação pendente (era só uma conta da tela).
-- Só roda ao gravar (nada muda na leitura). Nenhum dado existente foi alterado: as 9 linhas de aprovação que existem foram todas decididas por quem tem a marca.
create or replace function public.pcp_aprovacoes_conferir_quem_decide()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then return new; end if;
  if new.status in ('aprovado', 'rejeitado') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not coalesce((select u.pode_aprovar_compra from public.auth_usuarios u where u.auth_id = public.uid_efetivo() and coalesce(u.ativo, false) limit 1), false) then
      raise exception 'Só quem foi marcado para aprovar compras pode aprovar ou rejeitar (Admin → Usuários → "Aprovar compra").' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.pcp_aprovacoes_conferir_quem_decide() from public, anon, authenticated;
drop trigger if exists pcp_aprovacoes_quem_decide on public.pcp_aprovacoes;
create trigger pcp_aprovacoes_quem_decide before insert or update on public.pcp_aprovacoes
  for each row execute function public.pcp_aprovacoes_conferir_quem_decide();

create or replace function public.pcp_pedido_compra_conferir_aprovacoes()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.pcp_aprovacoes a where a.pedido_id = new.id and a.status = 'pendente') then
    raise exception 'Esta compra ainda tem aprovação pendente: ela só vai para "%" depois que todos os níveis aprovarem.', new.status_compra using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.pcp_pedido_compra_conferir_aprovacoes() from public, anon, authenticated;
drop trigger if exists pcp_pedido_compra_aprovacoes_pendentes on public.pcp_pedidos_compra;
create trigger pcp_pedido_compra_aprovacoes_pendentes before update of status_compra on public.pcp_pedidos_compra
  for each row when (new.status_compra = 'Aprovado' and old.status_compra is distinct from new.status_compra)
  execute function public.pcp_pedido_compra_conferir_aprovacoes();

-- Reverter: drop trigger pcp_aprovacoes_quem_decide on public.pcp_aprovacoes; drop function public.pcp_aprovacoes_conferir_quem_decide();
--           drop trigger pcp_pedido_compra_aprovacoes_pendentes on public.pcp_pedidos_compra; drop function public.pcp_pedido_compra_conferir_aprovacoes();
