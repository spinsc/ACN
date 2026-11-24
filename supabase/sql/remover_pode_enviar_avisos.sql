-- A caixa "enviar avisos" (auth_usuarios.pode_enviar_avisos) era obsoleta desde 02/10/2026 (só o Admin publica avisos), foi zerada em 24/11/2026 e a coluna saiu a pedido do usuário no mesmo dia.
-- Antes de apagar, a coluna foi tirada das duas funções que a liam: auth_login (devolvia a marca no login) e auth_usuarios_registrar_permissoes (histórico de permissões).
-- Aplicado como migração `remover_coluna_pode_enviar_avisos` (troca de trecho sobre a definição no ar, conferindo que o trecho existia; sem CASCADE).
-- Os registros antigos do histórico que citam o campo continuam legíveis (HistoricoDePermissoes.tsx mantém o rótulo "Enviar avisos (antiga)").
-- Reverter (só a coluna; as marcações antigas não voltam): alter table public.auth_usuarios add column pode_enviar_avisos boolean default false;
alter table public.auth_usuarios drop column if exists pode_enviar_avisos;
