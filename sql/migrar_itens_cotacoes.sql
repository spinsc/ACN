-- ============================================================
-- Migração: cotacoes_precos.itens → cadastro_itens
-- Extrai todos os itens únicos salvos nas cotações de preço
-- e os insere no catálogo central.
--
-- RODAR APÓS cadastro_itens.sql
-- ============================================================

-- 1. Extrair itens do JSONB e inserir no cadastro_itens
-- Deduplica por (nome, marca, fornecedor) — não duplica se já existir.

INSERT INTO cadastro_itens (
  nome,
  marca,
  fornecedor,
  moeda,
  custo_unit,
  ipi_pct,
  st_pct,
  markup_pct,
  difal_pct,
  imposto_pct,
  custo_fixo_pct,
  criado_por
)
SELECT DISTINCT ON (
  trim(item->>'produto'),
  coalesce(trim(item->>'marca'), ''),
  coalesce(trim(item->>'fornecedor'), '')
)
  trim(item->>'produto')                             AS nome,
  coalesce(trim(item->>'marca'), '')                 AS marca,
  coalesce(trim(item->>'fornecedor'), '')            AS fornecedor,
  -- normaliza moeda: DOLAR→DOLAR, EURO→EURO, REAL→REAL (mantemos padrão do sistema)
  coalesce(nullif(trim(item->>'moeda'), ''), 'REAL') AS moeda,
  coalesce((item->>'custo_unit')::numeric, 0)        AS custo_unit,
  coalesce((item->>'ipi_pct')::numeric, 0)           AS ipi_pct,
  coalesce((item->>'st_pct')::numeric, 0)            AS st_pct,
  coalesce((item->>'markup_pct')::numeric, 30)       AS markup_pct,
  coalesce((item->>'difal_pct')::numeric, 16)        AS difal_pct,
  coalesce((item->>'imposto_pct')::numeric, 16)      AS imposto_pct,
  coalesce((item->>'custo_fixo_pct')::numeric, 3)   AS custo_fixo_pct,
  'migração-cotacoes'                                AS criado_por
FROM
  cotacoes_precos cp,
  jsonb_array_elements(
    CASE jsonb_typeof(cp.itens)
      WHEN 'array' THEN cp.itens
      ELSE '[]'::jsonb
    END
  ) AS item
WHERE
  trim(coalesce(item->>'produto', '')) <> ''  -- ignora itens sem nome
ORDER BY
  trim(item->>'produto'),
  coalesce(trim(item->>'marca'), ''),
  coalesce(trim(item->>'fornecedor'), ''),
  (item->>'custo_unit')::numeric DESC NULLS LAST  -- pega o custo mais recente
;

-- 2. Resultado: quantos itens foram importados
SELECT count(*) AS itens_importados FROM cadastro_itens WHERE criado_por = 'migração-cotacoes';

-- 3. (opcional) ver todos os itens importados
-- SELECT nome, marca, fornecedor, moeda, custo_unit FROM cadastro_itens WHERE criado_por = 'migração-cotacoes' ORDER BY nome;
