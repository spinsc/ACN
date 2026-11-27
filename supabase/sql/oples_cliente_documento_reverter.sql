-- Desfaz oples_cliente_documento.sql (apaga o que foi digitado nessa coluna: só com OK do usuário).
alter table public.oples drop column if exists cliente_documento;
