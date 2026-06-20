-- ============================================
-- Habilitar Realtime na tabela pedidos
-- (faltava na migration original de RLS)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pedidos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'itens_pedido'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE itens_pedido;
  END IF;
END $$;
