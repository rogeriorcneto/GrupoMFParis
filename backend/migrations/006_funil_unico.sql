-- Migration 006: Funil Único 6 Etapas
-- Novos campos para sub-status de amostra, follow-up, satisfação, recompra e Omie logístico

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS resultado_amostra TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_resultado_amostra DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status_follow_up TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status_satisfacao TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nota_satisfacao INTEGER;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS feedback_satisfacao TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ciclo_recompra INTEGER;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_proxima_recompra DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS total_compras INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_status_logistico TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_codigo_rastreio TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_nota_fiscal TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_data_faturamento DATE;

-- Migrar clientes em etapas removidas para as novas equivalentes
UPDATE clientes SET etapa = 'proposta' WHERE etapa = 'cotacao';
UPDATE clientes SET etapa = 'proposta' WHERE etapa = 'homologado';
UPDATE clientes SET etapa = 'follow_up' WHERE etapa = 'pos_venda';
