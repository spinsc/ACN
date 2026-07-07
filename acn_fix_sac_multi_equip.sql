-- SAC: suporte a múltiplos equipamentos por OS
-- Execute no Supabase > SQL Editor

ALTER TABLE sac_ordens_servico
  ADD COLUMN IF NOT EXISTS equipamentos_lista JSONB;

-- Preencher retroativamente para OS existentes (usa campos avulsos como item 0)
UPDATE sac_ordens_servico
SET equipamentos_lista = jsonb_build_array(
  jsonb_build_object(
    'marca',         COALESCE(marca, ''),
    'modelo',        COALESCE(modelo, ''),
    'numero_serie',  COALESCE(numero_serie, ''),
    'defeito',       COALESCE(defeito_reclamado, '')
  )
)
WHERE equipamentos_lista IS NULL;
