-- Desfaz a onda 5a: devolve à chave pública a leitura das tabelas dos portais, a inserção de chamado e a leitura do PIN global (como era até 26/11/2026).
-- Só use junto de voltar as páginas portal.html e veiculo.html à versão anterior (elas leem e gravam as tabelas direto).
grant select on public.veiculos_nfc to anon;
grant select on public.servicos_executados_nfc to anon;
grant select, insert on public.chamados_suporte to anon;
create policy portal_le_veiculos on public.veiculos_nfc for select to anon using (ativo is true);
create policy portal_le_servicos on public.servicos_executados_nfc for select to anon using (true);
create policy portal_le_chamados on public.chamados_suporte for select to anon using (true);
create policy portal_abre_chamado on public.chamados_suporte for insert to anon with check (veiculo_id is not null);
drop policy if exists portal_le_config on public.configuracoes_sistema;
create policy portal_le_config on public.configuracoes_sistema for select to anon
  using (chave = any (array['nfc_nome_empresa', 'nfc_logo_url', 'nfc_whatsapp_numero', 'nfc_endereco_maps', 'nfc_pin_global']));

-- só se for preciso desfazer também a parte a (as funções e a tabela de tentativas não atrapalham):
-- drop function if exists public.portal_veiculo_por_token(uuid);
-- drop function if exists public.nfc_veiculo_por_chassi(text);
-- drop function if exists public.nfc_area_restrita(text, text);
-- drop function if exists public.portal_abrir_chamado(uuid, text, text, text, text);
-- drop table if exists public.nfc_pin_tentativas;
