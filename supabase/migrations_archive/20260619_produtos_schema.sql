-- ============================================
-- MIGRAÇÃO: Schema base da tabela produtos
-- (caso ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS produtos (
  id              SERIAL PRIMARY KEY,
  nome            TEXT NOT NULL,
  descricao       TEXT,
  categoria       TEXT,
  preco           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unidade         TEXT,
  foto            TEXT,
  sku             TEXT,
  estoque         NUMERIC(10, 2) DEFAULT 0,
  peso_kg         NUMERIC(10, 3),
  margem_lucro    NUMERIC(5, 2),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  destaque        BOOLEAN NOT NULL DEFAULT FALSE,
  omie_codigo     TEXT,
  marca           TEXT,
  local_estoque   TEXT,
  especie_volume  TEXT,
  cfop_interno    TEXT,
  cfop_externo    TEXT,
  ncm             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos(ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);
