-- ============================================
-- Habilitar Realtime na tabela pedidos
-- (faltava na migration original de RLS)
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE itens_pedido;
