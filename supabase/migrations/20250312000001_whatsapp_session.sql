-- ============================================
-- Tabela para persistir sessões WhatsApp (Baileys auth state)
-- Usada pelo useSupabaseAuthState para salvar credenciais
-- e chaves do Signal Protocol entre restarts do backend.
-- ============================================

CREATE TABLE IF NOT EXISTS whatsapp_session (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por prefixo (ex: 'user_1:%', 'bot:%')
CREATE INDEX idx_wa_session_prefix ON whatsapp_session (key text_pattern_ops);

-- RLS: apenas service_role pode acessar (backend usa service key)
ALTER TABLE whatsapp_session ENABLE ROW LEVEL SECURITY;

-- Política para service_role (o backend Express usa a service role key)
CREATE POLICY "Service role full access on whatsapp_session"
  ON whatsapp_session
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política para authenticated (fallback caso o backend use anon key)
CREATE POLICY "Authenticated users can manage whatsapp_session"
  ON whatsapp_session
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
