-- ============================================
-- Limpeza de clientes duplicados + índice único de CNPJ
-- Remove duplicatas mantendo o registro de menor id (mais antigo)
-- e garante o índice único parcial para evitar duplicação futura.
-- ============================================

-- 1) Remover duplicatas por CNPJ (mantém o menor id)
DELETE FROM clientes a
USING clientes b
WHERE a.cnpj IS NOT NULL
  AND a.cnpj <> ''
  AND a.cnpj = b.cnpj
  AND a.id > b.id;

-- 2) Garantir índice único parcial em CNPJ (ignora vazios/nulos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cnpj_unique
  ON clientes (cnpj)
  WHERE cnpj IS NOT NULL AND cnpj <> '';

NOTIFY pgrst, 'reload schema';
