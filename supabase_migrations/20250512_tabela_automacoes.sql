-- Criar tabela para armazenar automações personalizadas
CREATE TABLE IF NOT EXISTS automacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensagem', 'tarefa', 'etapa', 'notificacao', 'email', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('ativa', 'pausada', 'rascunho')),
  gatilho_tipo TEXT NOT NULL CHECK (gatilho_tipo IN ('tempo', 'evento', 'manual')),
  gatilho_config JSONB DEFAULT '{}',
  acoes JSONB DEFAULT '[]',
  criado_por UUID REFERENCES vendedores(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execucoes INTEGER DEFAULT 0,
  ultima_execucao TIMESTAMP WITH TIME ZONE,
  proxima_execucao TIMESTAMP WITH TIME ZONE,
  ativo BOOLEAN DEFAULT true
);

-- Criar índices para performance
CREATE INDEX idx_automacoes_tipo ON automacoes(tipo);
CREATE INDEX idx_automacoes_status ON automacoes(status);
CREATE INDEX idx_automacoes_gatilho_tipo ON automacoes(gatilho_tipo);
CREATE INDEX idx_automacoes_criado_por ON automacoes(criado_por);
CREATE INDEX idx_automacoes_ativo ON automacoes(ativo);
CREATE INDEX idx_automacoes_proxima_execucao ON automacoes(proxima_execucao) WHERE proxima_execucao IS NOT NULL;

-- Criar RLS (Row Level Security)
ALTER TABLE automacoes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
-- Apenas gerentes podem ver e gerenciar automações
CREATE POLICY "Gerentes podem ver automacoes" ON automacoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem inserir automacoes" ON automacoes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem atualizar automacoes" ON automacoes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem deletar automacoes" ON automacoes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

-- Trigger para atualizar o campo atualizado_em
CREATE OR REPLACE FUNCTION update_automacoes_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_automacoes_atualizado_em
  BEFORE UPDATE ON automacoes
  FOR EACH ROW
  EXECUTE FUNCTION update_automacoes_atualizado_em();

-- Criar tabela de execuções de automação (log)
CREATE TABLE IF NOT EXISTS automacoes_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id UUID REFERENCES automacoes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sucesso', 'erro', 'executando')),
  inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fim TIMESTAMP WITH TIME ZONE,
  resultado JSONB,
  erro_mensagem TEXT,
  dados_entrada JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para a tabela de execuções
CREATE INDEX idx_automacoes_execucoes_automacao_id ON automacoes_execucoes(automacao_id);
CREATE INDEX idx_automacoes_execucoes_status ON automacoes_execucoes(status);
CREATE INDEX idx_automacoes_execucoes_criado_em ON automacoes_execucoes(criado_em);

-- RLS para execuções
ALTER TABLE automacoes_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerentes podem ver execucoes" ON automacoes_execucoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

-- Inserir alguns dados de exemplo
INSERT INTO automacoes (nome, descricao, tipo, gatilho_tipo, gatilho_config, acoes, criado_por) VALUES
(
  'Boas-vindas Novos Clientes',
  'Enviar mensagem de boas-vindas quando cliente entra na prospecção',
  'mensagem',
  'evento',
  '{"evento": "cliente_etapa", "etapa_destino": "prospecção"}',
  '[{"tipo": "enviar_mensagem", "configuracao": {"mensagem": "Seja bem-vindo à MF Paris! Estamos muito felizes em ter você como cliente.", "destinatario": "cliente"}, "ordem": 1}]',
  (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1)
),
(
  'Follow-up Automático',
  'Criar tarefa de follow-up após 3 dias sem interação',
  'tarefa',
  'tempo',
  '{"frequencia": "diariamente", "horario": "09:00", "condicao": "dias_inativo >= 3"}',
  '[{"tipo": "criar_tarefa", "configuracao": {"titulo": "Follow-up Cliente", "descricao": "Fazer contato com cliente que não interage há 3 dias", "prazo": "1 dia"}, "ordem": 1}]',
  (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1)
),
(
  'Movimento para Amostra',
  'Mover cliente para etapa de amostra após proposta aprovada',
  'etapa',
  'evento',
  '{"evento": "proposta_aprovada", "valor_minimo": 1000}',
  '[{"tipo": "mover_etapa", "configuracao": {"etapa_destino": "amostra", "motivo": "Proposta aprovada - solicitar amostra"}, "ordem": 1}]',
  (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1)
)
ON CONFLICT DO NOTHING;
