-- ============================================
-- MIGRAÇÃO: Atualizar campos do gatilho tarefa_concluida
-- ============================================
-- Execute este SQL se você JÁ executou as migrações anteriores

-- Remover horaPadrao do JSON da ação (opcional, pois não é mais usado)
-- UPDATE regras_automacao 
-- SET acao = acao - 'horaPadrao' 
-- WHERE acao ? 'horaPadrao';

-- Inserir exemplos com tarefa específica
INSERT INTO regras_automacao (nome, ativa, gatilho, condicoes, acao) VALUES
('Após "Enviar amostra" → Follow-up em 5 dias', true, 'tarefa_concluida', 
 '{"tarefaEspecifica": "Enviar amostra", "etapaCliente": "prospecção"}', 
 '{"titulo": "Follow-up amostra — {cliente}", "descricao": "Verificar se cliente recebeu a amostra enviada.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 5}'),

('Após "Follow-up proposta" → Cobrar fechamento', true, 'tarefa_concluida', 
 '{"tarefaEspecifica": "Follow-up proposta", "etapaCliente": "proposta"}', 
 '{"titulo": "Cobrar fechamento — {cliente}", "descricao": "Follow-up realizado. Hora de cobrar a decisão.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 3}'),

('Após "Cobrar resultado amostra" → Tentar reconquista', true, 'tarefa_concluida', 
 '{"tarefaEspecifica": "Cobrar resultado amostra", "etapaCliente": "amostra"}', 
 '{"titulo": "Tentar reconquista — {cliente}", "descricao": "Cliente não deu retorno sobre amostra. Tentar nova abordagem.", "tipo": "email", "prioridade": "media", "diasPrazo": 7}');
