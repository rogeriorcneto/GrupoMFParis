-- Migration 005: Adicionar colunas Omie em pedidos e produtos
-- Execute no Supabase SQL Editor

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_codigo text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_numero text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_status text;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS omie_codigo text;
