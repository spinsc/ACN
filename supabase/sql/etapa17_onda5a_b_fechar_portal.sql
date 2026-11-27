-- Etapa 17, onda 5a, parte b (26/11/2026): a chave pública deixa de ler as tabelas dos portais e de inserir chamado direto; o portal passa a viver só nas funções da parte a.
-- Por que: ver a parte a. Depois desta parte a chave pública só lê da `configuracoes_sistema` os dados de exibição (nome, logo, endereço no mapa e WhatsApp da empresa),
-- sem o PIN global.
-- SÓ APLICAR depois da parte a e das duas páginas novas (portal.html e veiculo.html) no ar: as páginas antigas leem e gravam essas tabelas direto.
-- Como desfazer: etapa17_onda5a_reverter.sql.

drop policy if exists portal_le_veiculos on public.veiculos_nfc;
drop policy if exists portal_le_servicos on public.servicos_executados_nfc;
drop policy if exists portal_le_chamados on public.chamados_suporte;
drop policy if exists portal_abre_chamado on public.chamados_suporte;

drop policy if exists portal_le_config on public.configuracoes_sistema;
create policy portal_le_config on public.configuracoes_sistema for select to anon
  using (chave = any (array['nfc_nome_empresa', 'nfc_logo_url', 'nfc_whatsapp_numero', 'nfc_endereco_maps']));

revoke all on public.veiculos_nfc from anon;
revoke all on public.servicos_executados_nfc from anon;
revoke all on public.chamados_suporte from anon;
