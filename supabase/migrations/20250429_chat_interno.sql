-- Chat interno: mensagens entre usuários da equipe
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id          BIGSERIAL PRIMARY KEY,
  sender_id   INT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  receiver_id INT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read_at     TIMESTAMPTZ DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sender   ON chat_mensagens (sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_mensagens (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_pair     ON chat_mensagens (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- RLS: authenticated users see only their own messages
ALTER TABLE chat_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_select" ON chat_mensagens
  FOR SELECT USING (
    sender_id   = (SELECT id FROM vendedores WHERE auth_id = auth.uid() LIMIT 1)
    OR
    receiver_id = (SELECT id FROM vendedores WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "chat_insert" ON chat_mensagens
  FOR INSERT WITH CHECK (
    sender_id = (SELECT id FROM vendedores WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "chat_update" ON chat_mensagens
  FOR UPDATE USING (
    receiver_id = (SELECT id FROM vendedores WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Enable Realtime for this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_mensagens;
  END IF;
END $$;
