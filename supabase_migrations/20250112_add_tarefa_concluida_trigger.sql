-- ============================================
-- MIGRAÇÃO: Adicionar gatilho 'tarefa_concluida'
-- ============================================
-- Execute este SQL se você JÁ executou a migração anterior

-- Remover constraint antigo
ALTER TABLE regras_automacao DROP CONSTRAINT IF EXISTS regras_automacao_gatilho_check;

-- Adicionar novo constraint com 'tarefa_concluida'
ALTER TABLE regras_automacao ADD CONSTRAINT regras_automacao_gatilho_check 
  CHECK (gatilho IN ('mudanca_etapa', 'inatividade', 'substatus', 'data_especifica', 'reconquista', 'tarefa_concluida'));

-- Inserir regras exemplo de tarefa_concluida
INSERT INTO regras_automacao (nome, ativa, gatilho, condicoes, acao) VALUES
('Após ligação em Prospecção → Enviar amostra', true, 'tarefa_concluida', 
 '{"tipoTarefaConcluida": "ligacao", "etapaCliente": "prospecção"}', 
 '{"titulo": "Enviar amostra — {cliente}", "descricao": "Cliente teve ligação positiva. Preparar e enviar amostra.", "tipo": "outro", "prioridade": "alta", "diasPrazo": 3, "horaPadrao": "10:00"}'),

('Após ligação em Amostra → Follow-up em 7 dias', true, 'tarefa_concluida', 
 '{"tipoTarefaConcluida": "ligacao", "etapaCliente": "amostra"}', 
 '{"titulo": "Follow-up pós-ligação amostra — {cliente}", "descricao": "Verificar status da amostra após contato.", "tipo": "ligacao", "prioridade": "media", "diasPrazo": 7, "horaPadrao": "10:00"}'),

('Após reunião em Proposta → Cobrar resposta', true, 'tarefa_concluida', 
 '{"tipoTarefaConcluida": "reuniao", "etapaCliente": "proposta"}', 
 '{"titulo": "Cobrar resposta proposta — {cliente}", "descricao": "Reunião realizada. Cobrar retorno sobre a proposta.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 5, "horaPadrao": "10:00"}'),

('Após WhatsApp em Negociação → Ligar', true, 'tarefa_concluida', 
 '{"tipoTarefaConcluida": "whatsapp", "etapaCliente": "negociacao"}', 
 '{"titulo": "Ligar para fechar — {cliente}", "descricao": "WhatsApp enviado. Reforçar com ligação para fechamento.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 2, "horaPadrao": "14:00"}');
