-- Desfaz shineray_she3000_estrutura_a1802.sql: o veículo não tinha estrutura nenhuma antes (0 materiais, 0 regras),
-- então voltar é apagar só as linhas marcadas pela migração.
do $$
declare v_marca constant text := 'Claude — planilha OPL A1802 (Shineray SHE-3000), 26/11/2026';
begin
  delete from veiculo_regras where veiculo_id = '45aa30bd-9342-460b-9572-6a2a2b108800' and criado_por_nome = v_marca;  -- as condições e os materiais da regra saem junto (chave em cascata)
  delete from veiculo_item_materiais where veiculo_id = '45aa30bd-9342-460b-9572-6a2a2b108800' and criado_por_nome = v_marca;
end $$;
