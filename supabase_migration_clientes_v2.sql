-- Migração: adicionar novos campos na tabela clientes
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/zeaeppmnetdhzwwdydmq/sql

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS contato_celular       TEXT,
  ADD COLUMN IF NOT EXISTS contato_telefone_fixo TEXT,
  ADD COLUMN IF NOT EXISTS endereco_rua          TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_complemento  TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_estado       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cep          TEXT,
  ADD COLUMN IF NOT EXISTS cnae_primario         TEXT,
  ADD COLUMN IF NOT EXISTS cnae_secundario       TEXT;
