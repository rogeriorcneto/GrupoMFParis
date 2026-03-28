-- Fix COALESCE type mismatch in mover_cliente_atomico function
-- Column types: data_entrada_etapa=timestamptz, data_*=date, text fields=text
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
BEGIN
  -- 1. Atualizar campos de texto + timestamp (cast explícito para timestamptz)
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
    status_faturamento = COALESCE(p_extras->>'status_faturamento', status_faturamento)
  WHERE id = p_cliente_id;

  -- 2. Campos de data (tipo date): atualizar separadamente com cast explícito
  IF p_extras->>'data_perda' IS NOT NULL AND p_extras->>'data_perda' != '' THEN
    UPDATE clientes SET data_perda = (p_extras->>'data_perda')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_envio_amostra' IS NOT NULL AND p_extras->>'data_envio_amostra' != '' THEN
    UPDATE clientes SET data_envio_amostra = (p_extras->>'data_envio_amostra')::date WHERE id = p_cliente_id;
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

  -- 3. Limpar campos ao voltar para prospecção
  IF p_etapa = 'prospecção' THEN
    UPDATE clientes SET
      motivo_perda = NULL,
      categoria_perda = NULL,
      data_perda = NULL
    WHERE id = p_cliente_id;
  END IF;

  -- 4. Inserir histórico de etapa (cast para timestamptz)
  INSERT INTO historico_etapas (cliente_id, etapa, etapa_anterior, data)
  VALUES (p_cliente_id, p_etapa, p_etapa_anterior, p_data_entrada_etapa::timestamptz);
END;
$$;
