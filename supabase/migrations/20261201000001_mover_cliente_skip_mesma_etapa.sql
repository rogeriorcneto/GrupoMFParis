-- Item 10: mover_cliente_atomico nao grava historico_etapas quando origem = destino
-- (evita registros tipo "Etapa alterada de Negociacao para Negociacao").

CREATE OR REPLACE FUNCTION public.mover_cliente_atomico(
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
BEGIN
  UPDATE clientes SET
    etapa = p_etapa,
    etapa_anterior = p_etapa_anterior,
    data_entrada_etapa = p_data_entrada_etapa::timestamptz,
    updated_at = NOW(),
    motivo_perda = COALESCE(p_extras->>'motivo_perda', motivo_perda),
    categoria_perda = COALESCE(p_extras->>'categoria_perda', categoria_perda),
    status_amostra = COALESCE(p_extras->>'status_amostra', status_amostra),
    valor_proposta = COALESCE((p_extras->>'valor_proposta')::NUMERIC, valor_proposta),
    status_entrega = COALESCE(p_extras->>'status_entrega', status_entrega),
    status_faturamento = COALESCE(p_extras->>'status_faturamento', status_faturamento),
    resultado_amostra = CASE
      WHEN p_etapa = 'amostra' AND p_etapa_anterior = 'amostra_perdida' AND p_extras->>'resultado_amostra' IS NULL THEN NULL
      ELSE COALESCE(p_extras->>'resultado_amostra', resultado_amostra)
    END,
    motivo_reprovacao = CASE
      WHEN p_etapa = 'amostra' AND p_etapa_anterior = 'amostra_perdida' AND p_extras->>'motivo_reprovacao' IS NULL THEN NULL
      ELSE COALESCE(p_extras->>'motivo_reprovacao', motivo_reprovacao)
    END,
    tentativa_amostra = COALESCE((p_extras->>'tentativa_amostra')::INT, tentativa_amostra),
    status_satisfacao = COALESCE(p_extras->>'status_satisfacao', status_satisfacao),
    nota_satisfacao = COALESCE((p_extras->>'nota_satisfacao')::INT, nota_satisfacao),
    feedback_satisfacao = COALESCE(p_extras->>'feedback_satisfacao', feedback_satisfacao),
    total_compras = COALESCE((p_extras->>'total_compras')::INT, total_compras),
    status_follow_up = CASE
      WHEN p_extras->>'status_follow_up' IS NOT NULL AND p_extras->>'status_follow_up' != '' THEN p_extras->>'status_follow_up'
      WHEN p_etapa = 'negociacao' THEN NULL
      ELSE status_follow_up
    END
  WHERE id = p_cliente_id;

  IF p_extras->>'data_perda' IS NOT NULL AND p_extras->>'data_perda' != '' THEN
    UPDATE clientes SET data_perda = (p_extras->>'data_perda')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_envio_amostra' IS NOT NULL AND p_extras->>'data_envio_amostra' != '' THEN
    UPDATE clientes SET data_envio_amostra = (p_extras->>'data_envio_amostra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_resultado_amostra' IS NOT NULL AND p_extras->>'data_resultado_amostra' != '' THEN
    UPDATE clientes SET data_resultado_amostra = (p_extras->>'data_resultado_amostra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_homologacao' IS NOT NULL AND p_extras->>'data_homologacao' != '' THEN
    UPDATE clientes SET data_homologacao = (p_extras->>'data_homologacao')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_proposta' IS NOT NULL AND p_extras->>'data_proposta' != '' THEN
    UPDATE clientes SET data_proposta = (p_extras->>'data_proposta')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_ultimo_pedido' IS NOT NULL AND p_extras->>'data_ultimo_pedido' != '' THEN
    UPDATE clientes SET data_ultimo_pedido = (p_extras->>'data_ultimo_pedido')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_proxima_recompra' IS NOT NULL AND p_extras->>'data_proxima_recompra' != '' THEN
    UPDATE clientes SET data_proxima_recompra = (p_extras->>'data_proxima_recompra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'vendedor_id' IS NOT NULL AND p_extras->>'vendedor_id' != '' THEN
    UPDATE clientes SET vendedor_id = (p_extras->>'vendedor_id')::INT WHERE id = p_cliente_id;
  END IF;

  IF p_etapa = 'prospecção' THEN
    UPDATE clientes SET
      motivo_perda = NULL,
      categoria_perda = NULL,
      data_perda = NULL
    WHERE id = p_cliente_id;
  END IF;

  -- Item 10: não registrar mudança de etapa quando a etapa não muda
  IF p_etapa IS DISTINCT FROM p_etapa_anterior THEN
    INSERT INTO historico_etapas (cliente_id, etapa, etapa_anterior, data)
    VALUES (p_cliente_id, p_etapa, p_etapa_anterior, p_data_entrada_etapa::timestamptz);
  END IF;
END;
$$;
