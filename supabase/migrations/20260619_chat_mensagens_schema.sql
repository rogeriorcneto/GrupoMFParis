-- ============================================
-- MIGRAÇÃO: Schema base da tabela chat_mensagens
-- (caso ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id          SERIAL PRIMARY KEY,
  sender_id   INTEGER NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_sender_receiver ON chat_mensagens(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_receiver_read ON chat_mensagens(receiver_id, read_at);
