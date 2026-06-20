-- ============================================
-- MIGRAÇÃO: Schema base da tabela interacoes
-- (caso a tabela ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS interacoes (
  id            SERIAL PRIMARY KEY,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  assunto       TEXT NOT NULL DEFAULT '',
  descricao     TEXT,
  automatico    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_id ON interacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_data ON interacoes(cliente_id, created_at DESC);
