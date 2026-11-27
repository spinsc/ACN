-- Plano do bucket privado, B0 (26/11/2026): o maior arquivo do bucket público é de 42,8 MB (licitações); o privado, criado com 20 MB, precisa aceitar o mesmo limite do acn-media (50 MB).
-- Só muda o limite de tamanho; políticas e arquivos não mudam. Reverter: bucket_privado_b0_reverter.sql.
update storage.buckets set file_size_limit = 52428800 where id = 'acn-privado';
