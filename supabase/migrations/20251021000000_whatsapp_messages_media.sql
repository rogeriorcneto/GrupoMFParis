-- Colunas de mídia para whatsapp_messages (áudio, imagem, vídeo, documento)
-- O backend degrada graciosamente se a coluna ainda não existir.

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mimetype TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_vendedor ON whatsapp_messages(vendedor_id);
