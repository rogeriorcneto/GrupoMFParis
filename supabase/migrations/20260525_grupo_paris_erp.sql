-- =====================================================================
-- Grupo Paris ERP — Migration completa de todos os módulos
-- Data: 2026-05-25
-- Cria tabelas para: Logística, Financeiro, Produção, RH, Documentos
-- =====================================================================

-- ============================================================
-- LOGÍSTICA & FRETE
-- ============================================================

CREATE TABLE IF NOT EXISTS transportadoras (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  contato TEXT,
  telefone TEXT,
  email TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fretes (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  transportadora_id BIGINT REFERENCES transportadoras(id) ON DELETE SET NULL,
  codigo_rastreio TEXT,
  origem TEXT,
  destino TEXT,
  cep_origem TEXT,
  cep_destino TEXT,
  peso_kg NUMERIC(10,3),
  volume_m3 NUMERIC(10,3),
  valor_frete NUMERIC(12,2),
  valor_declarado NUMERIC(12,2),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','cotado','contratado','coletado','em_transito','entregue','cancelado')),
  data_coleta DATE,
  data_prevista DATE,
  data_entrega DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fretes_status ON fretes(status);
CREATE INDEX IF NOT EXISTS idx_fretes_pedido ON fretes(pedido_id);

-- ============================================================
-- FINANCEIRO
-- ============================================================

CREATE TABLE IF NOT EXISTS contas_bancarias (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo TEXT DEFAULT 'corrente' CHECK (tipo IN ('corrente','poupanca','aplicacao','caixa')),
  saldo_inicial NUMERIC(14,2) DEFAULT 0,
  saldo_atual NUMERIC(14,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  cor TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  categoria_id BIGINT REFERENCES categorias_financeiras(id) ON DELETE SET NULL,
  conta_bancaria_id BIGINT REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','atrasado','cancelado')),
  forma_pagamento TEXT,
  documento TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos_financeiros(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON lancamentos_financeiros(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo ON lancamentos_financeiros(tipo);

-- ============================================================
-- PRODUÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS ordens_producao (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,
  produto_id BIGINT REFERENCES produtos(id) ON DELETE SET NULL,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  quantidade NUMERIC(10,3) NOT NULL,
  data_inicio DATE,
  data_prevista DATE,
  data_conclusao DATE,
  status TEXT DEFAULT 'aberta' CHECK (status IN ('aberta','em_producao','pausada','concluida','cancelada')),
  prioridade TEXT DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  responsavel TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etapas_producao (
  id BIGSERIAL PRIMARY KEY,
  ordem_id BIGINT REFERENCES ordens_producao(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem_execucao INT DEFAULT 0,
  responsavel TEXT,
  inicio TIMESTAMPTZ,
  fim TIMESTAMPTZ,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
  observacoes TEXT
);

-- ============================================================
-- RECURSOS HUMANOS
-- ============================================================

CREATE TABLE IF NOT EXISTS funcionarios (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  rg TEXT,
  data_nascimento DATE,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cargo TEXT,
  departamento TEXT,
  data_admissao DATE,
  data_demissao DATE,
  salario NUMERIC(10,2),
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','ferias','afastado','demitido')),
  vendedor_id BIGINT REFERENCES vendedores(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_ponto (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT REFERENCES funcionarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  entrada TIME,
  saida_almoco TIME,
  retorno_almoco TIME,
  saida TIME,
  total_horas NUMERIC(5,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(funcionario_id, data)
);

-- ============================================================
-- DOCUMENTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS documentos_categorias (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT DEFAULT '#6366f1',
  icone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documentos (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria_id BIGINT REFERENCES documentos_categorias(id) ON DELETE SET NULL,
  arquivo_url TEXT,
  arquivo_nome TEXT,
  arquivo_tipo TEXT,
  arquivo_tamanho BIGINT,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE SET NULL,
  tags TEXT[],
  validade DATE,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','expirado','arquivado')),
  uploaded_by BIGINT REFERENCES vendedores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS — Permissivo (gerentes acessam tudo, vendedores veem o seu)
-- ============================================================

ALTER TABLE transportadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE fretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapas_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- Policies: usuários autenticados podem ler/escrever (ajustar depois conforme necessário)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'transportadoras','fretes','contas_bancarias','categorias_financeiras',
    'lancamentos_financeiros','ordens_producao','etapas_producao',
    'funcionarios','registros_ponto','documentos_categorias','documentos'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- Seeds iniciais (opcionais)
-- ============================================================

INSERT INTO categorias_financeiras (nome, tipo, cor) VALUES
  ('Vendas', 'receita', '#10b981'),
  ('Serviços', 'receita', '#3b82f6'),
  ('Outras Receitas', 'receita', '#8b5cf6'),
  ('Fornecedores', 'despesa', '#ef4444'),
  ('Salários', 'despesa', '#f59e0b'),
  ('Aluguel', 'despesa', '#ec4899'),
  ('Impostos', 'despesa', '#6b7280'),
  ('Marketing', 'despesa', '#14b8a6'),
  ('Outras Despesas', 'despesa', '#64748b')
ON CONFLICT DO NOTHING;

INSERT INTO documentos_categorias (nome, cor, icone) VALUES
  ('Contratos', '#3b82f6', '📄'),
  ('Notas Fiscais', '#10b981', '🧾'),
  ('Propostas', '#f59e0b', '📋'),
  ('Certificados', '#8b5cf6', '🎖️'),
  ('Outros', '#6b7280', '📁')
ON CONFLICT DO NOTHING;
