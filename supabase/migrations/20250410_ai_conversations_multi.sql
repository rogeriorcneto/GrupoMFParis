-- Migration: múltiplos históricos de conversa por usuário
-- Remove a estrutura antiga (1 conversa por canal) e cria nova (N conversas por usuário)

-- 1. Remover índice único antigo (user_id, channel)
DROP INDEX IF EXISTS ai_conversations_user_channel_idx;

-- 2. Alterar coluna id de serial para uuid gerado automaticamente
ALTER TABLE ai_conversations
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE ai_conversations
  ALTER COLUMN id TYPE uuid USING gen_random_uuid();

ALTER TABLE ai_conversations
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Adicionar coluna title (se não existir)
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Nova conversa';

-- 4. Adicionar coluna created_at (se não existir)
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 5. Remover coluna channel (não usada no novo modelo)
ALTER TABLE ai_conversations
  DROP COLUMN IF EXISTS channel;

-- 6. Índice por user_id + updated_at para listagem ordenada
CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx
  ON ai_conversations(user_id, updated_at DESC);
