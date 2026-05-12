-- ============================================
-- MIGRAÇÃO: Automação de Tarefas e Mensagens
-- ============================================

-- Tabela: Regras de Automação de Tarefas
CREATE TABLE IF NOT EXISTS regras_automacao (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  ativa BOOLEAN DEFAULT true,
  gatilho TEXT NOT NULL CHECK (gatilho IN ('mudanca_etapa', 'inatividade', 'substatus', 'data_especifica', 'reconquista')),
  condicoes JSONB DEFAULT '{}',
  acao JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para regras_automacao
CREATE INDEX IF NOT EXISTS idx_regras_automacao_ativa ON regras_automacao(ativa);
CREATE INDEX IF NOT EXISTS idx_regras_automacao_gatilho ON regras_automacao(gatilho);

-- Habilitar Row Level Security
ALTER TABLE regras_automacao ENABLE ROW LEVEL SECURITY;

-- Política: Permitir SELECT para todos os usuários autenticados
CREATE POLICY IF NOT EXISTS "Permitir SELECT para usuários autenticados" ON regras_automacao
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Permitir INSERT/UPDATE/DELETE apenas para gerentes
CREATE POLICY IF NOT EXISTS "Permitir modificações apenas para gerentes" ON regras_automacao
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.email = auth.email() 
      AND vendedores.cargo = 'gerente'
    )
  );

-- Comentários
COMMENT ON TABLE regras_automacao IS 'Regras para criação automática de tarefas quando eventos ocorrem no funil';
COMMENT ON COLUMN regras_automacao.condicoes IS 'JSON com etapaOrigem, etapaDestino, diasInatividade, subStatus, etc.';
COMMENT ON COLUMN regras_automacao.acao IS 'JSON com titulo, descricao, tipo, prioridade, diasPrazo, horaPadrao';

-- Tabela: Mensagens Automáticas (IA)
CREATE TABLE IF NOT EXISTS mensagens_automacao (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  ativa BOOLEAN DEFAULT true,
  gatilho TEXT NOT NULL CHECK (gatilho IN ('mudanca_etapa', 'substatus', 'data_especifica', 'inatividade')),
  condicoes JSONB DEFAULT '{}',
  config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mensagens_automacao
CREATE INDEX IF NOT EXISTS idx_mensagens_automacao_ativa ON mensagens_automacao(ativa);
CREATE INDEX IF NOT EXISTS idx_mensagens_automacao_gatilho ON mensagens_automacao(gatilho);

-- Habilitar Row Level Security
ALTER TABLE mensagens_automacao ENABLE ROW LEVEL SECURITY;

-- Política: Permitir SELECT para todos os usuários autenticados
CREATE POLICY IF NOT EXISTS "Permitir SELECT mensagens para usuários autenticados" ON mensagens_automacao
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Permitir INSERT/UPDATE/DELETE apenas para gerentes
CREATE POLICY IF NOT EXISTS "Permitir modificações mensagens apenas para gerentes" ON mensagens_automacao
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.email = auth.email() 
      AND vendedores.cargo = 'gerente'
    )
  );

-- Comentários
COMMENT ON TABLE mensagens_automacao IS 'Mensagens automáticas enviadas via WhatsApp/Email quando eventos ocorrem';
COMMENT ON COLUMN mensagens_automacao.condicoes IS 'JSON com etapaDestino, subStatus, diasInatividade, etc.';
COMMENT ON COLUMN mensagens_automacao.config IS 'JSON com canal, usarIA, promptIA, mensagemFixa, instrucoes';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_regras_automacao_updated_at 
  BEFORE UPDATE ON regras_automacao 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mensagens_automacao_updated_at 
  BEFORE UPDATE ON mensagens_automacao 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DADOS INICIAIS: Regras de Automação
-- ============================================

INSERT INTO regras_automacao (nome, ativa, gatilho, condicoes, acao) VALUES
('Follow-up após amostra', true, 'mudanca_etapa', '{"etapaDestino": "amostra"}', '{"titulo": "Follow-up amostra — {cliente}", "descricao": "Verificar se o cliente recebeu e analisou a amostra", "tipo": "ligacao", "prioridade": "media", "diasPrazo": 20, "horaPadrao": "10:00"}'),

('Cobrança resultado amostra (45 dias)', true, 'mudanca_etapa', '{"etapaDestino": "amostra"}', '{"titulo": "Cobrar resultado amostra — {cliente}", "descricao": "Prazo de 45 dias se aproximando. Cobrar retorno urgente.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 40, "horaPadrao": "09:00"}'),

('Preparar proposta', true, 'mudanca_etapa', '{"etapaDestino": "proposta"}', '{"titulo": "Preparar proposta — {cliente}", "descricao": "Amostra aprovada. Preparar e enviar proposta comercial.", "tipo": "reuniao", "prioridade": "alta", "diasPrazo": 5, "horaPadrao": "10:00"}'),

('Follow-up proposta', true, 'mudanca_etapa', '{"etapaDestino": "proposta"}', '{"titulo": "Follow-up proposta — {cliente}", "descricao": "Verificar se o cliente analisou a proposta.", "tipo": "ligacao", "prioridade": "media", "diasPrazo": 15, "horaPadrao": "10:00"}'),

('Cobrar resposta proposta', true, 'mudanca_etapa', '{"etapaDestino": "negociacao"}', '{"titulo": "Cobrar resposta proposta — {cliente}", "descricao": "Verificar retorno da proposta comercial enviada.", "tipo": "ligacao", "prioridade": "alta", "diasPrazo": 7, "horaPadrao": "10:00"}'),

('Acompanhar logística', true, 'mudanca_etapa', '{"etapaDestino": "follow_up"}', '{"titulo": "Acompanhar logística — {cliente}", "descricao": "Pedido aprovado. Acompanhar produção e entrega.", "tipo": "ligacao", "prioridade": "media", "diasPrazo": 7, "horaPadrao": "11:00"}'),

('Coletar satisfação', true, 'mudanca_etapa', '{"etapaDestino": "follow_up"}', '{"titulo": "Coletar satisfação — {cliente}", "descricao": "Após entrega, avaliar satisfação do cliente.", "tipo": "email", "prioridade": "media", "diasPrazo": 30, "horaPadrao": "14:00"}'),

('Preparar próximo ciclo', true, 'mudanca_etapa', '{"etapaDestino": "follow_up"}', '{"titulo": "Preparar proposta comercial — {cliente}", "descricao": "Cliente em Follow-up. Preparar nova proposta para próximo ciclo de compra.", "tipo": "reuniao", "prioridade": "alta", "diasPrazo": 15, "horaPadrao": "09:00"}'),

('Avaliar 2ª tentativa amostra', true, 'mudanca_etapa', '{"etapaDestino": "amostra_perdida"}', '{"titulo": "Avaliar 2ª tentativa amostra — {cliente}", "descricao": "Amostra reprovada. Avaliar se vale tentar novamente.", "tipo": "reuniao", "prioridade": "alta", "diasPrazo": 3, "horaPadrao": "10:00"}');

-- ============================================
-- DADOS INICIAIS: Mensagens Automáticas
-- ============================================

INSERT INTO mensagens_automacao (nome, ativa, gatilho, condicoes, config) VALUES
('Pesquisa de satisfação pós-entrega', true, 'substatus', '{"subStatus": "entregue"}', '{"canal": "whatsapp", "usarIA": true, "promptIA": "Crie uma mensagem amigável perguntando como foi a experiência com a entrega do produto e solicitando feedback. Seja cordial e profissional.", "instrucoes": "Enviada automaticamente após confirmação de entrega"}'),

('Aviso de amostra liberada', true, 'substatus', '{"subStatus": "liberada"}', '{"canal": "whatsapp", "usarIA": false, "mensagemFixa": "Olá! Sua amostra foi liberada e está em processo de faturamento. Em breve entraremos em contato com os detalhes de envio. Obrigado!", "instrucoes": "Notifica cliente quando amostra é aprovada"}'),

('Reativação de cliente inativo', true, 'inatividade', '{"diasInatividade": 30}', '{"canal": "email", "usarIA": true, "promptIA": "Crie um email de reativação para um cliente que não compra há 30 dias. Ofereça ajuda, novidades e incentive uma nova conversa.", "instrucoes": "Tentativa de reativar cliente após 30 dias sem interação"}');
