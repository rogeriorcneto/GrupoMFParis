-- Função atômica para mover cliente de etapa + inserir histórico em uma única transação
CREATE OR REPLACE FUNCTION mover_cliente_atomico(
  p_cliente_id INT,
  p_etapa TEXT,
  p_etapa_anterior TEXT,
  p_data_entrada_etapa TEXT,
  p_extras JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
  v_val TEXT;
  v_sql TEXT;
BEGIN
  -- 1. Atualizar cliente com nova etapa + extras
  UPDATE clientes SET
    etapa = p_etapa,
    etapa_anterior = p_etapa_anterior,
    data_entrada_etapa = p_data_entrada_etapa,
    updated_at = NOW(),
    -- extras dinâmicos via JSONB
    motivo_perda = COALESCE(p_extras->>'motivo_perda', motivo_perda),
    categoria_perda = COALESCE(p_extras->>'categoria_perda', categoria_perda),
    data_perda = COALESCE(NULLIF(p_extras->>'data_perda', ''), data_perda),
    data_envio_amostra = COALESCE(NULLIF(p_extras->>'data_envio_amostra', ''), data_envio_amostra),
    status_amostra = COALESCE(p_extras->>'status_amostra', status_amostra),
    data_homologacao = COALESCE(NULLIF(p_extras->>'data_homologacao', ''), data_homologacao),
    valor_proposta = COALESCE((p_extras->>'valor_proposta')::NUMERIC, valor_proposta),
    data_proposta = COALESCE(NULLIF(p_extras->>'data_proposta', ''), data_proposta),
    status_entrega = COALESCE(p_extras->>'status_entrega', status_entrega),
    data_ultimo_pedido = COALESCE(NULLIF(p_extras->>'data_ultimo_pedido', ''), data_ultimo_pedido),
    status_faturamento = COALESCE(p_extras->>'status_faturamento', status_faturamento)
  WHERE id = p_cliente_id;

  -- Limpar campos ao voltar para prospecção
  IF p_etapa = 'prospecção' THEN
    UPDATE clientes SET
      motivo_perda = NULL,
      categoria_perda = NULL,
      data_perda = NULL
    WHERE id = p_cliente_id;
  END IF;

  -- 2. Inserir histórico de etapa
  INSERT INTO historico_etapas (cliente_id, etapa, etapa_anterior, data)
  VALUES (p_cliente_id, p_etapa, p_etapa_anterior, p_data_entrada_etapa);
END;
$$;
