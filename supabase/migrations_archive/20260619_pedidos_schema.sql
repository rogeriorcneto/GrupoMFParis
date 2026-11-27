-- ============================================
-- MIGRAÇÃO: Schema base das tabelas pedidos e itens_pedido
-- (caso ainda não existam no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS pedidos (
  id                      SERIAL PRIMARY KEY,
  numero                  TEXT NOT NULL,
  cliente_id              INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  vendedor_id             INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  observacoes             TEXT,
  status                  TEXT NOT NULL DEFAULT 'pendente',
  total_valor             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  data_criacao            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_envio              TIMESTAMPTZ,
  tipo                    TEXT NOT NULL DEFAULT 'venda',
  forma_pagamento         TEXT DEFAULT 'À vista',
  tipo_frete              TEXT,
  endereco_diferente      BOOLEAN DEFAULT FALSE,
  endereco_entrega_rua    TEXT,
  endereco_entrega_numero TEXT,
  endereco_entrega_bairro TEXT,
  endereco_entrega_cidade TEXT,
  endereco_entrega_estado TEXT,
  endereco_entrega_cep    TEXT,
  data_aprovacao          TIMESTAMPTZ,
  aprovado_por            INTEGER,
  motivo_recusa           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor_id ON pedidos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_data_criacao ON pedidos(data_criacao DESC);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id            SERIAL PRIMARY KEY,
  pedido_id     INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id    INTEGER,
  nome_produto  TEXT NOT NULL,
  sku           TEXT,
  unidade       TEXT,
  preco         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantidade    NUMERIC(10, 2) NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_id ON itens_pedido(pedido_id);
