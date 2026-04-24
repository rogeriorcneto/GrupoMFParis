-- Migration: Adicionar campos para controle de novo ciclo de vendas
-- Clientes duplicados de perda em negociação ficam em proposta com novoCiclo=true

ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS novo_ciclo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ciclo_numero INTEGER DEFAULT 1;

-- Comentários para documentação
COMMENT ON COLUMN clientes.novo_ciclo IS 'Indica se este cliente é um novo ciclo criado após perda em negociação';
COMMENT ON COLUMN clientes.ciclo_numero IS 'Número do ciclo de vendas (1=original, 2+=novos ciclos)';

-- Índice para otimizar filtros
CREATE INDEX IF NOT EXISTS idx_clientes_novo_ciclo ON clientes(novo_ciclo) WHERE novo_ciclo = TRUE;
