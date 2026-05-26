-- ============================================================
-- Migration: novos campos na tabela `clientes` referentes à
-- reformulação da Aba Clientes (v3 / Doc MF_Paris_CRM_AbaClientes_v3)
-- ============================================================
-- Aplicar no Supabase SQL Editor (ou via `supabase db push`).
-- Todos os campos são opcionais para não quebrar dados existentes.

-- 1) Redes Sociais individuais (substituem o campo único `redes_sociais`)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS facebook text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS linkedin text;
-- `website` já existe (criado em outra migration anterior). Não recriar.

-- 2) Contatos adicionais (Financeiro / Compras)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contato_financeiro_nome text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contato_financeiro_telefone text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contato_compras_nome text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contato_compras_telefone text;

-- 3) Quantidade mensal estimada por produto de interesse
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS produtos_quantidades_mensais jsonb;

-- 4) Inativação detalhada (motivo obrigatório + auditoria)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_inativacao text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS data_inativacao timestamptz;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS inativado_por bigint REFERENCES vendedores(id) ON DELETE SET NULL;
-- Flag para diferenciar "inativado por abandono (sistema)" de
-- "inativado ativamente pela equipe (com motivo)". A regra de
-- "Clientes Inativos por abandono" deve filtrar `inativado_por_abandono = true`.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS inativado_por_abandono boolean DEFAULT false;

-- 5) Backfill opcional: marcar inativos pré-existentes como abandono
-- (já que não temos motivo registrado para eles).
UPDATE clientes
SET inativado_por_abandono = true
WHERE etapa = 'inativo'
  AND inativado_por_abandono IS NULL;

-- 6) Índices úteis para os filtros novos da listagem
CREATE INDEX IF NOT EXISTS idx_clientes_status_cliente ON clientes(status_cliente);
CREATE INDEX IF NOT EXISTS idx_clientes_data_ultimo_pedido ON clientes(data_ultimo_pedido);

-- ============================================================
-- FIM
-- ============================================================
