-- ============================================================
-- Migration: adiciona campos de auditoria à tabela clientes
-- criado_em, criado_por_nome, atualizado_em
-- ============================================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS criado_em        timestamptz DEFAULT now();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS criado_por_nome  text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS atualizado_em    timestamptz DEFAULT now();

-- Trigger para atualizar atualizado_em automaticamente em cada UPDATE
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clientes_atualizado_em ON clientes;
CREATE TRIGGER trg_clientes_atualizado_em
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Backfill: preenche criado_em com a data de criação estimada (ultima_interacao ou now)
UPDATE clientes SET criado_em = now() WHERE criado_em IS NULL;

-- ============================================================
-- FIM
-- ============================================================
