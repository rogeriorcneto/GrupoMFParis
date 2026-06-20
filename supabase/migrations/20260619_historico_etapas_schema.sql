-- ============================================
-- MIGRAÇÃO: Schema base da tabela historico_etapas
-- (caso ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS historico_etapas (
  id            SERIAL PRIMARY KEY,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  etapa         TEXT NOT NULL,
  etapa_anterior TEXT,
  data          DATE NOT NULL,
  observacao    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_etapas_cliente_id ON historico_etapas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_historico_etapas_cliente_data ON historico_etapas(cliente_id, data DESC);
