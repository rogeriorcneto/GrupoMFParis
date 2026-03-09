-- Adicionar colunas Omie na tabela pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_codigo text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_numero text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_status text DEFAULT 'pendente';

-- Adicionar coluna omie_codigo na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS omie_codigo text;
