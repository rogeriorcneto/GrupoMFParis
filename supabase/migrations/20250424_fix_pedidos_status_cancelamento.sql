-- ============================================
-- Adicionar status 'cancelamento_solicitado' ao check constraint da tabela pedidos
-- ============================================

-- Remover constraint existente (se houver)
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;

-- Adicionar novo constraint com todos os status permitidos
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check 
  CHECK (status IN ('rascunho', 'enviado', 'confirmado', 'cancelado', 'cancelamento_solicitado'));

-- ============================================
-- Criar/atualizar função para solicitar cancelamento
-- ============================================

CREATE OR REPLACE FUNCTION solicitar_cancelamento_pedido(
  p_pedido_id INT,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
BEGIN
  -- Verificar se pedido existe
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id;
  
  IF v_pedido IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;
  
  -- Verificar se pedido já está cancelado ou em cancelamento
  IF v_pedido.status IN ('cancelado', 'cancelamento_solicitado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido já está cancelado ou com cancelamento solicitado');
  END IF;
  
  -- Verificar se pedido está confirmado (só pode cancelar pedidos confirmados)
  IF v_pedido.status <> 'confirmado' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas pedidos confirmados podem ser cancelados');
  END IF;

  -- Atualizar status para cancelamento_solicitado
  UPDATE pedidos 
  SET status = 'cancelamento_solicitado',
      motivo_recusa = p_motivo
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('success', true, 'message', 'Cancelamento solicitado com sucesso');
END;
$$;

-- ============================================
-- Criar função para confirmar cancelamento
-- ============================================

CREATE OR REPLACE FUNCTION confirmar_cancelamento_pedido(
  p_pedido_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pedidos 
  SET status = 'cancelado',
      data_aprovacao = NULL,
      aprovado_por = NULL
  WHERE id = p_pedido_id AND status = 'cancelamento_solicitado';

  RETURN jsonb_build_object('success', true, 'message', 'Cancelamento confirmado');
END;
$$;

-- ============================================
-- Criar função para rejeitar cancelamento
-- ============================================

CREATE OR REPLACE FUNCTION rejeitar_cancelamento_pedido(
  p_pedido_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pedidos 
  SET status = 'confirmado',
      motivo_recusa = NULL
  WHERE id = p_pedido_id AND status = 'cancelamento_solicitado';

  RETURN jsonb_build_object('success', true, 'message', 'Cancelamento rejeitado, pedido restaurado');
END;
$$;
