-- ============================================
-- Novos campos em produtos (dados vindos do Omie)
-- ============================================
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS local_estoque TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS especie_volume TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cfop_interno TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cfop_externo TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ncm TEXT;

-- ============================================
-- Novos campos em pedidos (parâmetros Omie)
-- ============================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'venda';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo_frete TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_diferente BOOLEAN DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_rua TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_numero TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_bairro TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_cidade TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_estado TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS endereco_entrega_cep TEXT;

-- ============================================
-- Novo campo em vendedores (código Omie)
-- ============================================
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS omie_codigo TEXT;
