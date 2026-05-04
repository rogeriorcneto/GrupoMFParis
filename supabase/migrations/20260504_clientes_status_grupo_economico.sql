-- Migration: Add status_cliente and grupo_economico_id to clientes
-- Date: 2026-05-04

-- Status de Cliente (enum-like text field)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS status_cliente TEXT
    CHECK (status_cliente IN ('ativo', 'em_risco', 'inativo', 'prospecto', 'descartado', 'bloqueado'));

-- Grupo Econômico: FK to another clientes row (self-referencing)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS grupo_economico_id BIGINT
    REFERENCES clientes(id) ON DELETE SET NULL;

-- Index for grupo economico lookups
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_economico
  ON clientes(grupo_economico_id)
  WHERE grupo_economico_id IS NOT NULL;

-- Index for status_cliente filters
CREATE INDEX IF NOT EXISTS idx_clientes_status_cliente
  ON clientes(status_cliente)
  WHERE status_cliente IS NOT NULL;
