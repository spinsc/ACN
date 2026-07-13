-- ─────────────────────────────────────────────────────────────────────────────
-- CRM ANEXOS — Documentos e imagens vinculados a oportunidades
-- Rodar no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_anexos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id  uuid NOT NULL REFERENCES crm_oportunidades(id) ON DELETE CASCADE,
  -- tipo: 'edital' | 'contrato' | 'proposta' | 'ata' | 'foto' | 'outro'
  tipo             text NOT NULL DEFAULT 'outro',
  nome             text NOT NULL,        -- nome original do arquivo
  url              text NOT NULL,        -- URL pública no Supabase Storage
  tamanho          bigint,               -- bytes
  mime_type        text,
  criado_por       text,
  criado_em        timestamptz DEFAULT now()
);

ALTER TABLE crm_anexos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_anexos_oportunidade ON crm_anexos(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_crm_anexos_tipo         ON crm_anexos(tipo);

-- Os arquivos ficam no bucket "acn-media" que já existe,
-- no caminho: crm-anexos/{oportunidade_id}/{timestamp}_{nome}
-- (mesmo bucket usado pelas OPLs, sem necessidade de novo bucket)

-- Verificação
SELECT COUNT(*) AS crm_anexos_criados FROM crm_anexos;
