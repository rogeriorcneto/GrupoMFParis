-- Migração: Adicionar campos do Google Maps para prospecção

-- Adicionar colunas na tabela clientes
ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS google_place_id TEXT,
ADD COLUMN IF NOT EXISTS google_rating DECIMAL(2,1),
ADD COLUMN IF NOT EXISTS google_reviews INTEGER;

-- Criar índice para busca rápida por place_id
CREATE INDEX IF NOT EXISTS idx_clientes_google_place_id ON clientes(google_place_id);

-- Comentários nas colunas
COMMENT ON COLUMN clientes.google_place_id IS 'ID do lugar no Google Maps (Places API)';
COMMENT ON COLUMN clientes.google_rating IS 'Avaliação média do lugar no Google (0-5)';
COMMENT ON COLUMN clientes.google_reviews IS 'Quantidade de avaliações no Google';
