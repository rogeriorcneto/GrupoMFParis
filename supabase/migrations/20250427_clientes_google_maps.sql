-- Adicionar campos de integração Google Maps à tabela clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS google_place_id  TEXT,
  ADD COLUMN IF NOT EXISTS google_rating    NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS google_reviews   INTEGER,
  ADD COLUMN IF NOT EXISTS website          TEXT,
  ADD COLUMN IF NOT EXISTS latitude         NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude        NUMERIC(10,7);

-- Índice para lookup por place_id (evitar duplicatas na importação)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_google_place_id_idx
  ON clientes (google_place_id)
  WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN clientes.google_place_id IS 'ID único do lugar no Google Places API';
COMMENT ON COLUMN clientes.google_rating   IS 'Avaliação média no Google (0-5)';
COMMENT ON COLUMN clientes.google_reviews  IS 'Número total de avaliações no Google';
COMMENT ON COLUMN clientes.website         IS 'Site oficial do estabelecimento';
COMMENT ON COLUMN clientes.latitude        IS 'Latitude geocodificada do endereço';
COMMENT ON COLUMN clientes.longitude       IS 'Longitude geocodificada do endereço';
