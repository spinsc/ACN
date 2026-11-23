-- Serviços de terceiros, T5: DESFAZ a migração das OPs (terceiros_servicos_t5_migrar_ops.sql) — SÓ COM O OK DO USUÁRIO (regra do projeto: nunca apagar dado sem confirmar).
-- Apaga APENAS o que a migração criou e ninguém mexeu: em nome de "Migração (caixinha da OP)", ainda "A definir", sem prestador, sem data marcada, sem ordem, sem pedido de pagamento
-- e com UMA só linha de histórico (a do nascimento). Serviço que alguém já mexeu fica onde está. Confira a contagem antes: o select abaixo diz quantos saem.
-- select count(*) from public.terceiros_servicos where solicitante_nome = 'Migração (caixinha da OP)' and status = 'solicitado' and prestador_id is null and data_agendada is null and ordem_id is null and pagamento_demanda_id is null and jsonb_array_length(historico) = 1;
delete from public.terceiros_servicos
 where solicitante_nome = 'Migração (caixinha da OP)' and status = 'solicitado'
   and prestador_id is null and data_agendada is null and ordem_id is null and pagamento_demanda_id is null
   and jsonb_array_length(historico) = 1;
