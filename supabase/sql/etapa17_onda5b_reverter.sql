-- Desfaz a onda 5b (bucket privado). ATENÇÃO: só rode se o bucket `acn-privado` estiver VAZIO (ou se os arquivos já voltaram para o `acn-media`):
-- o Supabase recusa apagar bucket com arquivo, e apagar arquivo pelo SQL deixa o arquivo físico órfão. Quem já enviou chat/assinatura pelo front novo
-- teria o arquivo no bucket privado e a tela antiga não o acharia.
drop policy if exists "acn-privado logado le" on storage.objects;
drop policy if exists "acn-privado logado envia" on storage.objects;
-- delete from storage.buckets where id = 'acn-privado';   -- só com o bucket vazio
