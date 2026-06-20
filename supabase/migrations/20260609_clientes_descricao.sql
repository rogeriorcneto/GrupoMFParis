-- ============================================================
-- Migration: adiciona campo descricao à tabela clientes
-- Campo livre para dados da Receita Federal, sócios, etc.
-- ============================================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS descricao text;

-- ============================================================
-- FIM
-- ============================================================
