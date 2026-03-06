-- ============================================
-- Adicionar colunas de aprovação/recusa na tabela pedidos
-- ============================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS motivo_recusa TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por INT REFERENCES vendedores(id),
  ADD COLUMN IF NOT EXISTS data_aprovacao TIMESTAMPTZ;

-- ============================================
-- Atualizar RPC insert_pedido_atomico para cast correto de timestamps
-- ============================================

CREATE OR REPLACE FUNCTION insert_pedido_atomico(
  p_numero TEXT,
  p_cliente_id INT,
  p_vendedor_id INT,
  p_observacoes TEXT,
  p_status TEXT,
  p_total_valor NUMERIC,
  p_data_criacao TEXT,
  p_data_envio TEXT,
  p_itens JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id INT;
  v_pedido RECORD;
  v_item JSONB;
BEGIN
  -- 1. Inserir pedido (cast TEXT -> TIMESTAMPTZ)
  INSERT INTO pedidos (numero, cliente_id, vendedor_id, observacoes, status, total_valor, data_criacao, data_envio)
  VALUES (
    p_numero,
    p_cliente_id,
    p_vendedor_id,
    p_observacoes,
    p_status,
    p_total_valor,
    CASE WHEN p_data_criacao IS NOT NULL AND p_data_criacao <> '' THEN p_data_criacao::TIMESTAMPTZ ELSE NOW() END,
    CASE WHEN p_data_envio IS NOT NULL AND p_data_envio <> '' THEN p_data_envio::TIMESTAMPTZ ELSE NULL END
  )
  RETURNING id INTO v_pedido_id;

  -- 2. Inserir itens (se houver)
  IF p_itens IS NOT NULL AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, sku, unidade, preco, quantidade)
      VALUES (
        v_pedido_id,
        (v_item->>'produto_id')::INT,
        v_item->>'nome_produto',
        v_item->>'sku',
        v_item->>'unidade',
        (v_item->>'preco')::NUMERIC,
        (v_item->>'quantidade')::INT
      );
    END LOOP;
  END IF;

  -- 3. Retornar o pedido criado com id
  SELECT INTO v_pedido * FROM pedidos WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'cliente_id', v_pedido.cliente_id,
    'vendedor_id', v_pedido.vendedor_id,
    'observacoes', v_pedido.observacoes,
    'status', v_pedido.status,
    'total_valor', v_pedido.total_valor,
    'data_criacao', v_pedido.data_criacao,
    'data_envio', v_pedido.data_envio,
    'data_aprovacao', v_pedido.data_aprovacao,
    'motivo_recusa', v_pedido.motivo_recusa,
    'aprovado_por', v_pedido.aprovado_por
  );
END;
$$;
