-- Tipos de Serviço dinâmicos para o SAC
-- Executar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS sac_tipos_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE sac_tipos_servico DISABLE ROW LEVEL SECURITY;

-- Tipos padrão (insert only if table is empty)
INSERT INTO sac_tipos_servico (nome) VALUES
  ('Orçamento'),
  ('Conserto'),
  ('Troca'),
  ('Garantia'),
  ('Instalação'),
  ('Manutenção Preventiva'),
  ('Visita Técnica'),
  ('Suporte Remoto')
ON CONFLICT (nome) DO NOTHING;
