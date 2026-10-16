-- Tabela de preço Omie (A/B) selecionada na tela de aprovação.
-- Afeta o cálculo de comissões no pedido Omie (codigo_tabela_preco).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tabela_preco TEXT DEFAULT 'A';
