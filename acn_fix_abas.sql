-- Adiciona 'rh' e 'licitacoes' ao array abas_permitidas de todos os usuários
-- que já possuem a lista salva (não nulos/vazios)

UPDATE auth_usuarios
SET abas_permitidas = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements(
    abas_permitidas::jsonb || '["rh","licitacoes","crm"]'::jsonb
  ) AS elem
)
WHERE abas_permitidas IS NOT NULL
  AND abas_permitidas != '[]'
  AND abas_permitidas != 'null';

-- Confirma
SELECT nome, perfil, abas_permitidas
FROM auth_usuarios
ORDER BY nome;
