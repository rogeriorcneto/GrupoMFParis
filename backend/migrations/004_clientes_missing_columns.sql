-- Adicionar colunas faltantes na tabela clientes
-- Essas colunas são referenciadas no frontend (clienteToDb/clienteFromDb) mas não existem no banco

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnpj2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_rua2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_numero2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_complemento2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_bairro2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_cidade2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_estado2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco_cep2 text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_codigo text;
