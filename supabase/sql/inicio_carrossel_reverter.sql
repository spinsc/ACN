-- Desfaz inicio_carrossel.sql (tela Início). ATENÇÃO: apaga os slides e as datas já postados; as imagens do bucket acn-inicio precisam ser apagadas antes pelo painel de Storage
-- (o banco não deixa apagar um bucket que ainda tem arquivo).
drop function if exists public.inicio_aniversariantes(integer);
drop policy if exists "acn-inicio logado le" on storage.objects;
drop policy if exists "acn-inicio posta envia" on storage.objects;
drop policy if exists "acn-inicio posta troca" on storage.objects;
drop policy if exists "acn-inicio posta apaga" on storage.objects;
delete from storage.buckets where id = 'acn-inicio';
drop table if exists public.inicio_datas;
drop table if exists public.inicio_slides;
drop function if exists public.pode_postar_inicio();
alter table public.auth_usuarios drop column if exists pode_postar_inicio;
