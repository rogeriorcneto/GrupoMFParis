-- Tabela para persistir conversas de IA por usuário
CREATE TABLE IF NOT EXISTS ai_conversations (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'assistente', -- 'assistente' ou 'workspace'
  messages jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- Índice único: 1 conversa por user + channel
CREATE UNIQUE INDEX IF NOT EXISTS ai_conversations_user_channel_idx
  ON ai_conversations(user_id, channel);

-- RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Cada usuário só vê/edita suas próprias conversas
CREATE POLICY "Users manage own conversations"
  ON ai_conversations FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
