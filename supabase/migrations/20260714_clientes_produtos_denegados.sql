-- Adiciona coluna para armazenar produtos denegados (reprovados em amostra) por cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS produtos_denegados JSONB;
