-- ============================================
-- Adiciona coluna redes_sociais na tabela clientes
-- ============================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS redes_sociais TEXT;
