-- Tabela para persistir sessões de roleplay de vendas no CRM
CREATE TABLE IF NOT EXISTS roleplay_sessions (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL,
  modulo TEXT,
  perfil_id TEXT,
  perfil_nome TEXT,
  mensagens JSONB NOT NULL DEFAULT '[]',
  duracao_segundos INT NOT NULL DEFAULT 0,
  nota INT,
  feedback JSONB,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_vendedor_id ON roleplay_sessions(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_data ON roleplay_sessions(data);
CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_vendedor_data ON roleplay_sessions(vendedor_id, data DESC);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_roleplay_sessions_updated_at ON roleplay_sessions;
CREATE TRIGGER set_roleplay_sessions_updated_at
  BEFORE UPDATE ON roleplay_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
