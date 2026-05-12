-- Criar tabela para armazenar contexto da IA
CREATE TABLE IF NOT EXISTS ia_contexto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secao TEXT NOT NULL CHECK (secao IN ('visao-geral', 'processos', 'produtos', 'clientes', 'vendas')),
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'pdf', 'regra', 'produto')),
  conteudo TEXT NOT NULL,
  url_arquivo TEXT,
  tamanho_arquivo BIGINT,
  criado_por UUID REFERENCES vendedores(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ativo BOOLEAN DEFAULT true
);

-- Criar índices para performance
CREATE INDEX idx_ia_contexto_secao ON ia_contexto(secao);
CREATE INDEX idx_ia_contexto_tipo ON ia_contexto(tipo);
CREATE INDEX idx_ia_contexto_criado_por ON ia_contexto(criado_por);
CREATE INDEX idx_ia_contexto_ativo ON ia_contexto(ativo);

-- Criar RLS (Row Level Security)
ALTER TABLE ia_contexto ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
-- Apenas gerentes podem ver e gerenciar o contexto da IA
CREATE POLICY "Gerentes podem ver contexto da IA" ON ia_contexto
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem inserir contexto da IA" ON ia_contexto
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem atualizar contexto da IA" ON ia_contexto
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Gerentes podem deletar contexto da IA" ON ia_contexto
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM vendedores 
      WHERE vendedores.id = auth.uid() 
      AND vendedores.cargo = 'gerente'
    )
  );

-- Trigger para atualizar o campo atualizado_em
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ia_contexto_atualizado_em
  BEFORE UPDATE ON ia_contexto
  FOR EACH ROW
  EXECUTE FUNCTION update_atualizado_em();

-- Inserir alguns dados de exemplo (opcional)
INSERT INTO ia_contexto (secao, titulo, tipo, conteudo, criado_por) VALUES
('visao-geral', 'Sobre a MF Paris', 'texto', 'A MF Paris é uma empresa especializada em fornecimento de produtos para panificação e confeitaria, com foco em qualidade e atendimento personalizado.', 
 (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1)),
('produtos', 'Linhas de Produtos', 'texto', 'Trabalhamos com: 1) Farinhas e pré-misturas 2) Recheios e coberturas 3) Embalagens 4) Equipamentos de panificação', 
 (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1)),
('processos', 'Fluxo de Vendas', 'regra', '1) Prospecção → 2) Qualificação → 3) Apresentação → 4) Proposta → 5) Fechamento → 6) Pós-venda', 
 (SELECT id FROM vendedores WHERE cargo = 'gerente' LIMIT 1))
ON CONFLICT DO NOTHING;
