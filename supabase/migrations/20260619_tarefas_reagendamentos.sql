-- ============================================
-- MIGRAÇÃO: Adicionar histórico de reagendamentos às tarefas
-- ============================================
ALTER TABLE tarefas
ADD COLUMN IF NOT EXISTS reagendamentos JSONB DEFAULT NULL;

COMMENT ON COLUMN tarefas.reagendamentos IS 'Histórico de reagendamentos (array JSON com dataOriginal, horaOriginal, motivo, reagendadoEm)';
