-- BOX do carro na Adaptação (pedido do usuário em 16/11/2026): ao iniciar o trabalho informa-se em quais BOX (01 a 09 ou EXTRA) o carro está, podendo ser mais de um, e a troca fica registrada.
-- boxes = onde o carro está agora; boxes_historico = lista de {boxes, entrou_em, saiu_em, por}, a última sem saiu_em é a atual. Só duas colunas novas, vazias nas OPs que já existem.
alter table public.oples add column if not exists boxes text[];
alter table public.oples add column if not exists boxes_historico jsonb;
comment on column public.oples.boxes is 'BOX da Adaptação em que o carro está agora (BOX 01 a BOX 09 ou BOX EXTRA; pode ser mais de um)';
comment on column public.oples.boxes_historico is 'Por onde o carro já passou: lista de {boxes, entrou_em, saiu_em, por}; a última, sem saiu_em, é a atual';

-- para desfazer (só se nenhuma OP tiver BOX gravado):
--   alter table public.oples drop column boxes, drop column boxes_historico;
