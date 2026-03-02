-- Migração: adicionar 'nota' ao CHECK CONSTRAINT da tabela interacoes
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/zeaeppmnetdhzwwdydmq/sql

ALTER TABLE interacoes DROP CONSTRAINT IF EXISTS interacoes_tipo_check;

ALTER TABLE interacoes ADD CONSTRAINT interacoes_tipo_check 
  CHECK (tipo IN ('email', 'whatsapp', 'linkedin', 'instagram', 'ligacao', 'reuniao', 'nota'));
