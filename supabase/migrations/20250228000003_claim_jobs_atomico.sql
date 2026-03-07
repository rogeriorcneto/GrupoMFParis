-- Função atômica para "reclamar" jobs pendentes de forma idempotente.
-- Usa UPDATE ... RETURNING com filtro de status para garantir que
-- apenas uma instância do cron processa cada job (sem advisory locks).
CREATE OR REPLACE FUNCTION claim_jobs_pendentes(p_limit INT DEFAULT 50)
RETURNS SETOF jobs_automacao
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs_automacao
  SET status = 'processando', executado_em = NOW()
  WHERE id IN (
    SELECT id FROM jobs_automacao
    WHERE status = 'pendente'
      AND agendado_para <= NOW()
    ORDER BY agendado_para
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
