-- XRE300 — o chicote da moto passa a depender das 3 respostas para as quais ele foi montado (06/11/2026).
-- Pedido do usuário: "o chicote que já está configurado é justamente para essa configuração". A regra "Chicote da moto
-- (Conjunto Elétrico vendido)" só olhava o item vendido; por isso a janela Configurar OP avisava "Chicote/suporte a definir:
-- 3 resposta(s) sem regra neste veículo" (as respostas Caracterizado, Frontal e Controladora Detech não eram usadas por
-- nenhuma regra aplicada). Agora a regra exige, além do Conjunto Elétrico vendido, as três respostas:
--   O veículo é caracterizado? = Caracterizado | A bateria é frontal ou traseira? = Frontal | Onde as luzes serão ligadas? = Controladora Detech.
-- Efeito combinado com o usuário: outra combinação de respostas NÃO leva esse chicote e mostra o aviso "a definir"
-- (a estrutura da moto com bateria traseira ou luz fora da controladora ainda não foi montada).
-- Registro do que foi aplicado como migração "xre_chicote_ligado_as_respostas"; escrito para poder rodar de novo sem duplicar.

do $$
declare
  v_n int;
begin
  insert into public.veiculo_regra_condicoes (regra_id, tipo, opcao_id)
  select '49c0ca97-4cdd-44bd-ac09-47fa6e225fa5'::uuid, 'resposta', o.id
    from (values ('a4fdbd9e-f956-4df7-89d7-c205bec5d868'::uuid),   -- Caracterizado
                 ('92a31179-8c75-44d6-8950-bacdfba1d24b'::uuid),   -- Frontal
                 ('fd4decb7-2b8a-4f3d-84c7-a4f9c72f0399'::uuid)    -- Controladora Detech
         ) as o(id)
   where not exists (select 1 from public.veiculo_regra_condicoes c
                      where c.regra_id = '49c0ca97-4cdd-44bd-ac09-47fa6e225fa5' and c.tipo = 'resposta' and c.opcao_id = o.id);

  -- a regra fica com a condição do item (Conjunto Elétrico) e as 3 respostas, nada além disso
  select count(*) into v_n from public.veiculo_regra_condicoes where regra_id = '49c0ca97-4cdd-44bd-ac09-47fa6e225fa5';
  if v_n <> 4 then raise exception 'XRE: a regra do chicote deveria ter 4 condições (item + 3 respostas), tem %', v_n; end if;
end $$;
