-- Varredura dos endereços de arquivo guardados no banco (plano do bucket privado, B0, 26/11/2026). SÓ LEITURA: não grava nada e não cria objeto.
-- Para cada coluna que guarda endereço de arquivo, conta quantas linhas ainda têm o endereço PÚBLICO do `acn-media` e quantas já guardam `privado:` (arquivo novo no `acn-privado`).
-- Uso: antes e depois de cada fatia (as linhas "privado:" crescem com o uso; as públicas só caem se alguém regravar o registro: o endereço antigo continua valendo e o ajudante o traduz).
-- A conferência que decide o FIM do plano (virar o `acn-media` para privado) é outra: o script de cópia não achar mais nada para copiar e o teste de navegador não ver nenhum pedido a `/object/public/acn-media/`.
-- Lista de colunas montada em 26/11/2026 por `information_schema` (nome com url, anexo, arquivo, foto, comprovante, documento, imagem, canhoto, assinatura) + o código das telas.
-- Coluna nova que guarde endereço de arquivo: acrescentar aqui. Lê só tabelas pequenas; rodar fora do horário de uso mesmo assim.
select t || '.' || c as coluna,
       (xpath('/row/p/text()', x))[1]::text::int as publicas,
       (xpath('/row/q/text()', x))[1]::text::int as privadas
from (
  select t, c, query_to_xml(format(
    'select count(*) filter (where %1$I::text like %2$L) p, count(*) filter (where %1$I::text like %3$L) q from public.%4$I',
    c, '%/object/public/acn-media/%', '%privado:%', t), false, true, '') x
  from (values
    ('analise_anexos','url'),('cadastro_produtos','fotos'),('cadastro_produtos','catalogo_url'),('cadastro_produtos','imagem_url'),('cadastro_produtos_anexos','url'),
    ('centro_custo_despesas_anexos','url'),('chat_mensagens','anexo_url'),('contratos_padrao','arquivo_url'),('cq_auditorias','assinatura_url'),('crm_anexos','url'),
    ('crm_oportunidades','ctrl_relatorio_fotografico'),('demanda_avulsa_anexos','url'),('demandas_setoriais','anexos'),('engenharia_desenvolvimento','anexos'),
    ('engenharia_tarefas_anexos','url'),('financeiro_tarefa_anexos','url'),('licitacao_anexos','url'),('licitacao_documentos','anexo_url'),('licitacao_documentos','url'),
    ('logistica_manifestos','foto_cam'),('logistica_manifestos','foto_gal'),('logistica_manifestos','fotos'),('opl_anexos','url'),('oples','fotos_veiculo'),
    ('pcp_cotacoes_fornecedores','anexo_url'),('pcp_cotacoes_fretes','anexo_url'),('pcp_fretes','canhoto_url'),('pcp_pedidos_compra_anexos','url'),
    ('pcp_pedidos_faturamento','nf_fornecedor_url'),('sac_ordens_servico','arquivos_os'),('sac_ordens_servico','fotos_entrada'),('sac_ordens_servico','fotos_saida'),
    ('sac_ordens_servico','assinatura_aprovacao_url'),('sac_ordens_servico','assinatura_saida_url'),('terceiros_servicos','anexos'),('viagens','comprovantes'),
    ('viagens','contrato_anexos'),('vistorias_patio','fotos'),('vistorias_patio','fotos_saida'),('vistorias_patio','assinatura_envio_url'),
    ('vistorias_patio','assinatura_recebimento_url'),('vistorias_patio','assinatura_retorno_url')
  ) v(t, c)
) z
order by 2 desc, 3 desc, 1;
