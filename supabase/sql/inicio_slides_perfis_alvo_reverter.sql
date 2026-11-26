-- Desfaz a remoção da coluna `inicio_slides.perfis_alvo` (26/11/2026): a recoloca, vazia, como era (`text[]`, sem valor padrão).
-- Em 26/11/2026, antes de apagar, as 6 linhas de `inicio_slides` tinham a coluna nula (0 com valor), então não há dado a devolver: a reversão é só a coluna.
-- A ideia de "quem vê" por perfil saiu em 09/11/2026 (todo usuário vê todo slide); a tela nunca mais leu nem gravou a coluna.

alter table public.inicio_slides add column if not exists perfis_alvo text[];
