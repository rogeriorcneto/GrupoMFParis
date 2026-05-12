-- Adicionar campo para linkar tarefas com regras de automação
ALTER TABLE tarefas 
ADD COLUMN origem_automacao_id INTEGER REFERENCES jobs_automacao(id) ON DELETE SET NULL;

-- Adicionar comentário
COMMENT ON COLUMN tarefas.origem_automacao_id IS 'ID da regra de automação que criou esta tarefa (se aplicável)';

-- Criar índice para melhor performance
CREATE INDEX idx_tarefas_origem_automacao_id ON tarefas(origem_automacao_id);
