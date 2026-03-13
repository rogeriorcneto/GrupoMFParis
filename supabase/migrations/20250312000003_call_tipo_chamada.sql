-- ============================================
-- Adiciona coluna tipo_chamada na tabela gravacoes_chamada
-- Valores: 'phone' (ligação telefônica) ou 'whatsapp' (chamada WhatsApp)
-- ============================================

ALTER TABLE gravacoes_chamada
  ADD COLUMN IF NOT EXISTS tipo_chamada TEXT DEFAULT 'phone';

-- Tornar cliente_id nullable (já é, mas garantir — para gravações de contatos WA sem cliente CRM)
-- ALTER TABLE gravacoes_chamada ALTER COLUMN cliente_id DROP NOT NULL;
-- (já era nullable por usar REFERENCES ... ON DELETE SET NULL)
