-- 29/10/2026 (revisão pós-queda de 28/10): cotacoes_precos tinha dois índices idênticos em (status): cotacoes_precos_status_idx e idx_cotacoes_status.
-- Apaga só o primeiro; o segundo continua servindo as mesmas consultas. Nenhum dado é apagado, só um índice repetido (autorizado pelo usuário em 29/10/2026).
drop index if exists public.cotacoes_precos_status_idx;
