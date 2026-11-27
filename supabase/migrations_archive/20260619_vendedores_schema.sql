-- ============================================
-- MIGRAÇÃO: Schema base da tabela vendedores
-- (caso a tabela ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS vendedores (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT UNIQUE,
  telefone      TEXT,
  cargo         TEXT NOT NULL DEFAULT 'vendedor',
  auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  meta_faturamento NUMERIC(12, 2) DEFAULT 0,
  meta_conversao   NUMERIC(5, 2) DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendedores_auth_id ON vendedores(auth_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_ativo ON vendedores(ativo);
