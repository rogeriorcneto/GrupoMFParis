ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf TEXT;
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
NOTIFY pgrst, 'reload schema';
