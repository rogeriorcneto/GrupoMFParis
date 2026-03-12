-- Adicionar coluna omie_codigo na tabela clientes (vinculo CRM ↔ Omie)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_codigo text;

-- Índice para busca rápida por omie_codigo
CREATE INDEX IF NOT EXISTS idx_clientes_omie_codigo ON clientes(omie_codigo) WHERE omie_codigo IS NOT NULL;

-- Índice para busca rápida por omie_codigo em produtos
CREATE INDEX IF NOT EXISTS idx_produtos_omie_codigo ON produtos(omie_codigo) WHERE omie_codigo IS NOT NULL;

-- Índice para busca rápida por omie_codigo em pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_omie_codigo ON pedidos(omie_codigo) WHERE omie_codigo IS NOT NULL;
