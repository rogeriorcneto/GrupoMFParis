-- ============================================================
-- Migration: adiciona data_ultima_amostra e data_ultima_venda
-- à tabela clientes para controle de status automático
-- ============================================================

-- Última amostra enviada ao cliente (faturada no Omie via etapa amostra)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_ultima_amostra date;

-- Última venda realizada (faturada no Omie via etapa follow_up)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_ultima_venda date;

-- Índices para calcular status automático com performance
CREATE INDEX IF NOT EXISTS idx_clientes_data_ultima_venda   ON clientes(data_ultima_venda);
CREATE INDEX IF NOT EXISTS idx_clientes_data_ultima_amostra ON clientes(data_ultima_amostra);

-- Backfill: onde já existe data_ultimo_pedido e data_ultima_venda está vazia,
-- usar data_ultimo_pedido como fallback de última venda
UPDATE clientes
SET data_ultima_venda = data_ultimo_pedido::date
WHERE data_ultima_venda IS NULL
  AND data_ultimo_pedido IS NOT NULL;

-- ============================================================
-- FIM
-- ============================================================
