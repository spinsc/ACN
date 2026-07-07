-- ═══════════════════════════════════════════════════════════════
-- ACN Sinal Verde — Sequência atômica para numero_os
-- Roda no Supabase SQL Editor → evita duplicate key em paralelo
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabela de controle de sequência por ano
CREATE TABLE IF NOT EXISTS sac_os_sequence (
  ano           INTEGER PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);

-- 2. Inicializa com o MAX atual (para não reutilizar números existentes)
INSERT INTO sac_os_sequence (ano, ultimo_numero)
SELECT
  EXTRACT(YEAR FROM NOW())::INTEGER AS ano,
  COALESCE(MAX(
    CASE
      WHEN numero_os ~ '^OS-[0-9]+/'
      THEN CAST(SUBSTRING(numero_os FROM 'OS-([0-9]+)/') AS INTEGER)
      ELSE 0
    END
  ), 0) AS ultimo_numero
FROM sac_ordens_servico
WHERE numero_os LIKE 'OS-%-' || EXTRACT(YEAR FROM NOW())::TEXT
ON CONFLICT (ano) DO UPDATE
  SET ultimo_numero = GREATEST(sac_os_sequence.ultimo_numero, EXCLUDED.ultimo_numero);

-- 3. Função atômica — usa INSERT ON CONFLICT para garantir atomicidade
--    Chamada via supabase.rpc('proximo_numero_os')
CREATE OR REPLACE FUNCTION public.proximo_numero_os()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano     INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_proximo INTEGER;
BEGIN
  -- Operação atômica: insere ou incrementa e retorna o próximo número
  INSERT INTO sac_os_sequence (ano, ultimo_numero)
  VALUES (v_ano, 1)
  ON CONFLICT (ano) DO UPDATE
    SET ultimo_numero = sac_os_sequence.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_proximo;

  RETURN 'OS-' || LPAD(v_proximo::TEXT, 4, '0') || '/' || v_ano::TEXT;
END;
$$;

-- Verifica o estado atual da sequência
SELECT * FROM sac_os_sequence;
