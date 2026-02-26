-- Tabela para persistir configurações do bot (email SMTP, etc.)
-- Necessária porque o Railway tem filesystem efêmero
CREATE TABLE IF NOT EXISTS bot_config (
  id int PRIMARY KEY DEFAULT 1,
  email_host text DEFAULT '',
  email_port int DEFAULT 587,
  email_user text DEFAULT '',
  email_pass text DEFAULT '',
  email_from text DEFAULT '',
  whatsapp_numero text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- RLS: apenas gerentes podem ler/alterar
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerentes_bot_config" ON bot_config
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM vendedores WHERE auth_id = auth.uid() AND cargo = 'gerente')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendedores WHERE auth_id = auth.uid() AND cargo = 'gerente')
  );

-- Permitir service_role (backend) acesso total
CREATE POLICY "service_role_bot_config" ON bot_config
  FOR ALL
  USING (auth.role() = 'service_role');

-- Seed: inserir linha inicial
INSERT INTO bot_config (id) VALUES (1) ON CONFLICT DO NOTHING;
