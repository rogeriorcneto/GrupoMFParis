-- Tabela para armazenar configurações do bot (WhatsApp + Email)
-- Sempre terá apenas 1 linha (id=1)
CREATE TABLE IF NOT EXISTS bot_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  email_host text DEFAULT '',
  email_port integer DEFAULT 587,
  email_user text DEFAULT '',
  email_pass text DEFAULT '',
  email_from text DEFAULT '',
  whatsapp_numero text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- Inserir linha padrão
INSERT INTO bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: permitir leitura e escrita para usuários autenticados
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bot_config"
  ON bot_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update bot_config"
  ON bot_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert bot_config"
  ON bot_config FOR INSERT
  TO authenticated
  WITH CHECK (true);
