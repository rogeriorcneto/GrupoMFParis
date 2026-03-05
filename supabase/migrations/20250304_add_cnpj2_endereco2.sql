-- Adicionar campos CNPJ 2 e Endereço 2 na tabela clientes
-- Migration: 2025-03-04

-- Adicionar CNPJ 2
ALTER TABLE clientes 
ADD COLUMN cnpj2 TEXT;

-- Adicionar campos do Endereço 2
ALTER TABLE clientes 
ADD COLUMN endereco_rua2 TEXT,
ADD COLUMN endereco_numero2 TEXT,
ADD COLUMN endereco_complemento2 TEXT,
ADD COLUMN endereco_bairro2 TEXT,
ADD COLUMN endereco_cidade2 TEXT,
ADD COLUMN endereco_estado2 TEXT,
ADD COLUMN endereco_cep2 TEXT;

-- Comentários
COMMENT ON COLUMN clientes.cnpj2 IS 'Segundo CNPJ da empresa (opcional)';
COMMENT ON COLUMN clientes.endereco_rua2 IS 'Rua do segundo endereço';
COMMENT ON COLUMN clientes.endereco_numero2 IS 'Número do segundo endereço';
COMMENT ON COLUMN clientes.endereco_complemento2 IS 'Complemento do segundo endereço';
COMMENT ON COLUMN clientes.endereco_bairro2 IS 'Bairro do segundo endereço';
COMMENT ON COLUMN clientes.endereco_cidade2 IS 'Cidade do segundo endereço';
COMMENT ON COLUMN clientes.endereco_estado2 IS 'Estado do segundo endereço';
COMMENT ON COLUMN clientes.endereco_cep2 IS 'CEP do segundo endereço';
