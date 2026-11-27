-- Desfaz a B0: volta o limite do bucket privado para 20 MB (só vale se nenhum arquivo acima disso já foi para lá).
update storage.buckets set file_size_limit = 20971520 where id = 'acn-privado';
