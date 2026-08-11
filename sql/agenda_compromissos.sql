-- Agenda de compromissos por usuário e setor
CREATE TABLE IF NOT EXISTS agenda_compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor text NOT NULL,                        -- 'licitacoes' | 'engenharia' | 'comercial' | 'sac'
  usuario_email text NOT NULL,                -- currentUser?.email
  usuario_nome text,
  titulo text NOT NULL,
  descricao text,
  data_hora timestamptz NOT NULL,             -- data + hora do compromisso
  criado_em timestamptz DEFAULT now(),
  concluido boolean DEFAULT false,
  concluido_em timestamptz
);
ALTER TABLE agenda_compromissos DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agenda_usuario ON agenda_compromissos(usuario_email, setor);
CREATE INDEX IF NOT EXISTS idx_agenda_data ON agenda_compromissos(data_hora);

-- Configurações de agenda por setor (admin pode habilitar/desabilitar)
ALTER TABLE configuracoes_sistema
  ADD COLUMN IF NOT EXISTS agendas_setores jsonb DEFAULT '{"licitacoes":true,"engenharia":true,"comercial":true,"sac":true}'::jsonb;
