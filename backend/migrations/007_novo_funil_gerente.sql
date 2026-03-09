-- Migration 007: Novo Funil do Gerente
-- Novas colunas: lead, amostra_perdida, inativo
-- Novos campos: segmento, localizacao, tentativa_amostra

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS segmento TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS localizacao TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tentativa_amostra INTEGER DEFAULT 0;

-- Migrar clientes em cliente_ativo para follow_up (etapa removida do funil)
-- Clientes ativos com 90+ dias sem atividade → inativo
UPDATE clientes SET etapa = 'inativo' WHERE etapa = 'cliente_ativo' AND dias_inativo >= 90;
UPDATE clientes SET etapa = 'follow_up' WHERE etapa = 'cliente_ativo';
