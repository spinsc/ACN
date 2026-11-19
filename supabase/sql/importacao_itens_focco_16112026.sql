-- Importação de itens do Focco (lista 16112026.xls, 16/11/2026), pedido do usuário.
-- Mesmas regras da carga de 09/11/2026 (decididas em 22/10/2026): só entra código que NÃO está no cadastro e NUNCA foi
-- excluído dele (conferido contra o cadastro e a cópia cadastro_itens_conjunto_eletrico_apagados_20261021);
-- qualquer nome com "conjunto elétrico" fica de fora (só existe o gatilho 1687); item que já existe não é atualizado.
-- Ficaram de fora: 72 conjuntos elétricos por PV (4483 a 4967, 5033 e 5041); 4611, 4613 e 4614 ("ELETRICO PV 1607 - CRETA",
-- "... 1608 - NISSAN SENTRA", "... 1609 - RANGER"), que são conjunto elétrico por PV com o nome abreviado (a regra de
-- 22/10/2026 já os cita: "qualquer variação, inclusive ELETRICO PV 1607 - CRETA"); 4576 (inativo no Focco, SIT = I).
-- Entraram agora 5015, 5021 e 5023, que a carga de 09/11 deixou de fora por faltar NCM no Focco e hoje têm o dado completo.
-- Serviço sem NCM entra com NCM nulo (5027, como 5025 e 5026 na carga de 09/11). Nas divergências entre ACN (empresa 1) e
-- Detech (empresa 2) vale a ACN (5029, 5030 e 5031: grupo ou NCM diferentes na Detech). Custo 0, origem externa, sem controle
-- de estoque (padrões da tabela). Marca de origem para poder desfazer: criado_por = 'importacao_erp_16112026'.
insert into public.cadastro_itens (codigo, nome, categoria, unidade, ncm, marca, criado_por)
select v.codigo, v.nome, v.categoria, v.unidade, v.ncm, v.marca, 'importacao_erp_16112026'
from (values
('5015','REFIL GAS PARA MACARICO MANUAL','MATERIAL DE USO E CONSUMO','UN','27111300',''),
('5021','PATINS PARA GUIA LINAR SEM ABA 20MM','MATERIAL DE USO E CONSUMO','UN','84123110',''),
('5023','PLACA SINALIZACAO BANHEIRO 30X0,7CM','MATERIAL DE USO E CONSUMO','UN','39031900',''),
('5027','PRESTACAO DE SERVIÇOS','GENERICO','UN',null,''),
('5028','COPIA DE PROTETOR DE CARTER - GWM POER P30','MERCADORIA PARA REVENDA','UN','72104910',''),
('5029','REPAIR PARA GEL COAT BRITEC','MATERIA-PRIMA','UN','39079100',''),
('5030','INTERCOMUNICADOR PARA MOTO ANJ.GG RGB','MERCADORIA PARA REVENDA','UN','85444200',''),
('5031','PLUG PARA LAMPADA H11','MERCADORIA PARA REVENDA','UN','85369090',''),
('5032','BAU DE FERRAMENTAS - CAÇAMBA','MERCADORIA PARA REVENDA','UN','73262000',''),
('5034','TUBO DE ACO RETANGULAR PRETO 30X30 MM PAREDE: 2,0MM COMP. 600','MATERIA-PRIMA','MT','73066100',''),
('5035','CHAPA ACO PRETO LOSANGULO 50X80 MM ESP:4,75 MM 2000 X 1200 MM','MATERIA-PRIMA','M2','72111900',''),
('5036','SUPORTE S/ PINT. PÇ1 LE BARRA SIN. - PEUGEOT BOXER','PRODUTO EM PROCESSO','UN','72104910',''),
('5037','SUPORTE S/ PINT. LE BARRA SIN. - PEUGEOT BOXER','PRODUTO EM PROCESSO','UN','72104910',''),
('5038','SUPORTE S/ PINT. REFORÇO INTERNO BARRA SIN. PEUGEOT BOXER','PRODUTO EM PROCESSO','UN','72104910',''),
('5039','SUPORTE S/ PINT. PÇ1 LD BARRA SIN. - PEUGEOT BOXER','PRODUTO EM PROCESSO','UN','72104910',''),
('5040','SUPORTE S/ PINT. LD BARRA SIN. - PEUGEOT BOXER','PRODUTO EM PROCESSO','UN','72104910','')
) as v(codigo, nome, categoria, unidade, ncm, marca)
where not exists (select 1 from public.cadastro_itens c where c.codigo = v.codigo)
  and not exists (select 1 from public.cadastro_itens_conjunto_eletrico_apagados_20261021 a where a.codigo = v.codigo);
