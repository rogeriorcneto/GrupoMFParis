-- ============================================
-- Tabela para armazenar mensagens WhatsApp
-- ============================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT NOT NULL,              -- número do contato (sem @s.whatsapp.net)
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('enviada', 'recebida')),
  mensagem TEXT NOT NULL,
  tipo TEXT DEFAULT 'text',          -- text, image, audio, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX idx_wa_msgs_numero ON whatsapp_messages(numero);
CREATE INDEX idx_wa_msgs_cliente ON whatsapp_messages(cliente_id);
CREATE INDEX idx_wa_msgs_created ON whatsapp_messages(created_at DESC);

-- RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read whatsapp_messages"
  ON whatsapp_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert whatsapp_messages"
  ON whatsapp_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);
