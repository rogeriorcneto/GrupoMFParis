-- VERIFICAR QUAIS CATEGORIAS SÃO VÁLIDAS NA TABELA produtos
-- EXECUTAR NO SQL EDITOR DO SUPABASE

-- 1. Verificar a constraint de categoria (PostgreSQL 13+)
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint 
WHERE conrelid = 'produtos'::regclass 
AND conname = 'produtos_categoria_check';

-- 2. Verificar categorias existentes na tabela
SELECT DISTINCT categoria, COUNT(*) as total
FROM produtos 
GROUP BY categoria 
ORDER BY categoria;

-- 3. Verificar estrutura completa da tabela
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'produtos' 
AND table_schema = 'public'
ORDER BY ordinal_position;
