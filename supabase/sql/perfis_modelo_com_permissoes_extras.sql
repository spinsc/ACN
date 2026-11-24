-- Modelos de perfil (admin_perfis_sistema) passam a guardar também as permissões extras (pedido do usuário na revisão de permissões, 24/11/2026).
-- Guarda só o que LIGA: {"pode_aprovar_compra": true, "permissoes_crm": ["totais_vendas"]}. Aplicar o modelo liga e nunca tira. Modelos existentes ficam com {} (nada muda).
alter table public.admin_perfis_sistema add column if not exists extras jsonb not null default '{}'::jsonb;
-- Reverter: alter table public.admin_perfis_sistema drop column extras;
