-- Adicionar campo para linkar regras de automação com tarefas específicas existentes
ALTER TABLE jobs_automacao 
ADD COLUMN tarefa_especifica_id INTEGER REFERENCES tarefas(id) ON DELETE SET NULL;

-- Adicionar comentário
COMMENT ON COLUMN jobs_automacao.tarefa_especifica_id IS 'ID da tarefa específica existente no CRM que deve ser concluída para disparar esta regra';

-- Criar índice para melhor performance
CREATE INDEX idx_jobs_automacao_tarefa_especifica_id ON jobs_automacao(tarefa_especifica_id);
