-- Histórico de propostas geradas no funil
CREATE TABLE IF NOT EXISTS propostas (
  id          BIGSERIAL PRIMARY KEY,
  numero      TEXT NOT NULL,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  vendedor_nome TEXT NOT NULL DEFAULT '',
  itens       JSONB NOT NULL DEFAULT '[]',
  observacoes TEXT NOT NULL DEFAULT '',
  frete       TEXT,
  pagamento   TEXT,
  total_valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS propostas_cliente_id_idx ON propostas(cliente_id);
CREATE INDEX IF NOT EXISTS propostas_criado_em_idx  ON propostas(criado_em DESC);
