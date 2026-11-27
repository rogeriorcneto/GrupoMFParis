-- Adicionar campos de validação WhatsApp na tabela clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp_valido BOOLEAN;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp_validado_em TIMESTAMPTZ;
