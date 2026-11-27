-- ============================================================
-- Migration: adiciona produto Maltodextrina 25kg na base de produtos.
-- Doc: MF_Paris_CRM_AbaClientes_v3 — checklist CADASTRO.
-- ============================================================

INSERT INTO produtos (nome, descricao, categoria, preco, unidade, sku, ativo, destaque)
SELECT 'MALTODEXTRINA 25KG',
       'Maltodextrina pura 25kg — insumo para uso industrial e formulações.',
       'sacaria',
       0,
       'SC',
       'MALT-25KG',
       true,
       false
WHERE NOT EXISTS (
  SELECT 1 FROM produtos WHERE upper(nome) = 'MALTODEXTRINA 25KG'
);
