-- Migração para o Cérebro Paris - ERP Integrado do Grupo Paris
-- Criada em: 2026-05-25
-- Descrição: Criação das tabelas base para o ERP completo com IA contextual

-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS sistema_configuracoes (
    id SERIAL PRIMARY KEY,
    chave VARCHAR(100) UNIQUE NOT NULL,
    valor TEXT,
    descricao TEXT,
    tipo VARCHAR(50) DEFAULT 'texto',
    categoria VARCHAR(50) DEFAULT 'geral',
    atualizado_por INTEGER REFERENCES vendedores(id),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de módulos do ERP
CREATE TABLE IF NOT EXISTS erp_modulos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    descricao TEXT,
    icone VARCHAR(50),
    categoria VARCHAR(50) DEFAULT 'operacional',
    status VARCHAR(20) DEFAULT 'ativo',
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de permissões de módulos por cargo
CREATE TABLE IF NOT EXISTS erp_permissoes_cargo (
    id SERIAL PRIMARY KEY,
    cargo VARCHAR(50) NOT NULL,
    modulo_slug VARCHAR(50) NOT NULL REFERENCES erp_modulos(slug),
    nivel VARCHAR(20) DEFAULT 'leitura',
    restricoes TEXT[],
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cargo, modulo_slug)
);

-- Tabela de usuários do ERP (extensão de vendedores)
CREATE TABLE IF NOT EXISTS erp_usuarios (
    id SERIAL PRIMARY KEY,
    vendedor_id INTEGER UNIQUE REFERENCES vendedores(id) ON DELETE CASCADE,
    departamento VARCHAR(100),
    modulos_permitidos TEXT[],
    permissoes_customizadas JSONB,
    preferencias JSONB DEFAULT '{}',
    ultimo_acesso_modulo VARCHAR(50),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de KPIs principais
CREATE TABLE IF NOT EXISTS erp_kpis (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    descricao TEXT,
    modulo_origem VARCHAR(50) REFERENCES erp_modulos(slug),
    unidade VARCHAR(20) DEFAULT 'numero',
    meta_padrao DECIMAL(15,2),
    formula_calculo TEXT,
    frequencia_atualizacao VARCHAR(20) DEFAULT 'hora',
    status VARCHAR(20) DEFAULT 'ativo',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de valores históricos dos KPIs
CREATE TABLE IF NOT EXISTS erp_kpi_valores (
    id SERIAL PRIMARY KEY,
    kpi_id INTEGER REFERENCES erp_kpis(id) ON DELETE CASCADE,
    valor DECIMAL(15,2) NOT NULL,
    meta DECIMAL(15,2),
    variacao_percentual DECIMAL(5,2),
    data_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    contexto JSONB DEFAULT '{}',
    criado_por INTEGER REFERENCES vendedores(id)
);

-- Tabela de alertas inteligentes
CREATE TABLE IF NOT EXISTS erp_alertas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    severidade VARCHAR(20) DEFAULT 'media',
    modulo VARCHAR(50) REFERENCES erp_modulos(slug),
    dados_relacionados JSONB DEFAULT '{}',
    acoes_sugeridas TEXT[],
    status VARCHAR(20) DEFAULT 'ativo',
    lido BOOLEAN DEFAULT FALSE,
    criado_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolvido_em TIMESTAMP WITH TIME ZONE,
    resolvido_por INTEGER REFERENCES vendedores(id)
);

-- Tabela de previsões
CREATE TABLE IF NOT EXISTS erp_previsoes (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    periodo VARCHAR(50) NOT NULL,
    valor_previsto DECIMAL(15,2) NOT NULL,
    confianca INTEGER CHECK (confianca >= 0 AND confianca <= 100),
    cenario VARCHAR(20) DEFAULT 'realista',
    modulo VARCHAR(50) REFERENCES erp_modulos(slug),
    dados JSONB DEFAULT '{}',
    modelo_ia VARCHAR(100),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de recomendações da IA
CREATE TABLE IF NOT EXISTS erp_recomendacoes_ia (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    impacto VARCHAR(20) DEFAULT 'medio',
    esforco VARCHAR(20) DEFAULT 'medio',
    modulo VARCHAR(50) REFERENCES erp_modulos(slug),
    contexto TEXT,
    dados_analise JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pendente',
    prioridade INTEGER DEFAULT 5,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    implementada_em TIMESTAMP WITH TIME ZONE,
    implementada_por INTEGER REFERENCES vendedores(id)
);

-- Tabela de ações recomendadas
CREATE TABLE IF NOT EXISTS erp_acoes_recomendadas (
    id SERIAL PRIMARY KEY,
    recomendacao_id INTEGER REFERENCES erp_recomendacoes_ia(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'manual',
    prioridade INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pendente',
    concluida_em TIMESTAMP WITH TIME ZONE,
    concluida_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de contexto empresarial para IA
CREATE TABLE IF NOT EXISTS erp_contexto_empresarial (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    categoria VARCHAR(50),
    titulo VARCHAR(200),
    conteudo TEXT,
    dados JSONB DEFAULT '{}',
    fonte VARCHAR(100),
    tags TEXT[],
    versao INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ativo',
    criado_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de agentes de IA
CREATE TABLE IF NOT EXISTS erp_agentes_ia (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    descricao TEXT,
    especialidade VARCHAR(50) REFERENCES erp_modulos(slug),
    capacidades TEXT[],
    modelo_base VARCHAR(100),
    prompt_sistema TEXT,
    configuracao JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'ativo',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de conversas com IA
CREATE TABLE IF NOT EXISTS erp_conversas_ia (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES vendedores(id),
    agente_id INTEGER REFERENCES erp_agentes_ia(id),
    titulo VARCHAR(200),
    contexto TEXT,
    status VARCHAR(20) DEFAULT 'ativa',
    dados_sessao JSONB DEFAULT '{}',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizada_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de mensagens das conversas
CREATE TABLE IF NOT EXISTS erp_mensagens_ia (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER REFERENCES erp_conversas_ia(id) ON DELETE CASCADE,
    papel VARCHAR(20) NOT NULL CHECK (papel IN ('usuario', 'assistente', 'sistema')),
    conteudo TEXT NOT NULL,
    dados JSONB DEFAULT '{}',
    tokens_usados INTEGER,
    modelo VARCHAR(100),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de automações empresariais
CREATE TABLE IF NOT EXISTS erp_automacoes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    modulo VARCHAR(50) REFERENCES erp_modulos(slug),
    gatilhos JSONB DEFAULT '{}',
    acoes JSONB DEFAULT '{}',
    condicoes JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'inativa',
    executar_como INTEGER REFERENCES vendedores(id),
    agenda JSONB DEFAULT '{}',
    logs_execucao JSONB DEFAULT '[]',
    criado_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizada_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de execuções de automações
CREATE TABLE IF NOT EXISTS erp_automacao_execucoes (
    id SERIAL PRIMARY KEY,
    automacao_id INTEGER REFERENCES erp_automacoes(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'executando',
    resultado JSONB DEFAULT '{}',
    erro_mensagem TEXT,
    duracao_ms INTEGER,
    dados_entrada JSONB DEFAULT '{}',
    iniciada_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    concluida_em TIMESTAMP WITH TIME ZONE
);

-- Tabela de módulos financeiros
CREATE TABLE IF NOT EXISTS financeiro_contas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nome VARCHAR(200) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ativo', 'passivo', 'receita', 'custo', 'despesa')),
    categoria VARCHAR(100),
    nivel INTEGER DEFAULT 1,
    conta_pai INTEGER REFERENCES financeiro_contas(id),
    status VARCHAR(20) DEFAULT 'ativa',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de lançamentos financeiros
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
    id SERIAL PRIMARY KEY,
    conta_id INTEGER REFERENCES financeiro_contas(id),
    documento VARCHAR(100),
    descricao TEXT,
    valor DECIMAL(15,2) NOT NULL,
    data_lancamento DATE NOT NULL,
    data_vencimento DATE,
    data_pagamento DATE,
    status VARCHAR(20) DEFAULT 'pendente',
    categoria VARCHAR(100),
    centro_custo VARCHAR(100),
    projeto VARCHAR(100),
    cliente_fornecedor VARCHAR(200),
      tipo_lancamento VARCHAR(20) DEFAULT 'simples',
      recorrente BOOLEAN DEFAULT FALSE,
      dados_complementares JSONB DEFAULT '{}',
      criado_por INTEGER REFERENCES vendedores(id),
      criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de fluxo de caixa
CREATE TABLE IF NOT EXISTS financeiro_fluxo_caixa (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    saldo_inicial DECIMAL(15,2) DEFAULT 0,
    entradas DECIMAL(15,2) DEFAULT 0,
    saidas DECIMAL(15,2) DEFAULT 0,
    saldo_final DECIMAL(15,2) GENERATED ALWAYS AS (saldo_inicial + entradas - saidas) STORED,
    projecao_30d DECIMAL(15,2),
    projecao_90d DECIMAL(15,2),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(data)
);

-- Tabela de módulo logístico - estoque
CREATE TABLE IF NOT EXISTS logistica_produtos_estoque (
    id SERIAL PRIMARY KEY,
    produto_codigo VARCHAR(50) UNIQUE NOT NULL,
    produto_nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    unidade_medida VARCHAR(20) DEFAULT 'UN',
    categoria VARCHAR(100),
    quantidade_atual DECIMAL(10,2) DEFAULT 0,
    quantidade_minima DECIMAL(10,2) DEFAULT 0,
    quantidade_maxima DECIMAL(10,2),
    valor_unitario DECIMAL(15,2) DEFAULT 0,
    valor_total DECIMAL(15,2) GENERATED ALWAYS AS (quantidade_atual * valor_unitario) STORED,
    localizacao_padrao VARCHAR(100),
    status VARCHAR(20) DEFAULT 'normal',
    ultimo_movimento TIMESTAMP WITH TIME ZONE,
    dados_complementares JSONB DEFAULT '{}',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de movimentações de estoque
CREATE TABLE IF NOT EXISTS logistica_movimentacoes_estoque (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER REFERENCES logistica_produtos_estoque(id),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'transferencia', 'ajuste')),
    quantidade DECIMAL(10,2) NOT NULL,
    valor_unitario DECIMAL(15,2),
    valor_total DECIMAL(15,2),
    documento VARCHAR(100),
    motivo TEXT,
    origem VARCHAR(100),
    destino VARCHAR(100),
    responsavel INTEGER REFERENCES vendedores(id),
    data_movimento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    dados_complementares JSONB DEFAULT '{}'
);

-- Tabela de frotas
CREATE TABLE IF NOT EXISTS logistica_frotas (
    id SERIAL PRIMARY KEY,
    veiculo_placa VARCHAR(10) UNIQUE NOT NULL,
    veiculo_modelo VARCHAR(100),
    veiculo_tipo VARCHAR(50),
    capacidade DECIMAL(10,2),
    consumo_medio DECIMAL(8,2),
      status VARCHAR(20) DEFAULT 'disponivel',
    motorista_padrao INTEGER REFERENCES vendedores(id),
    localizacao_atual JSONB,
    ultima_manutencao DATE,
    proxima_manutencao DATE,
    dados_complementares JSONB DEFAULT '{}',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de módulo produção - ordens
CREATE TABLE IF NOT EXISTS producao_ordens (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    produto_codigo VARCHAR(50) REFERENCES logistica_produtos_estoque(produto_codigo),
    quantidade DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'planejada',
    prioridade INTEGER DEFAULT 5,
    data_inicio DATE,
    data_fim_prevista DATE,
    data_fim_real DATE,
    recursos JSONB DEFAULT '{}',
    materiais JSONB DEFAULT '{}',
    qualidade_resultado JSONB DEFAULT '{}',
    custo_total DECIMAL(15,2),
    criado_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizada_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de RH - funcionários (extensão)
CREATE TABLE IF NOT EXISTS rh_funcionarios (
    id SERIAL PRIMARY KEY,
    vendedor_id INTEGER UNIQUE REFERENCES vendedores(id) ON DELETE CASCADE,
    cpf VARCHAR(14) UNIQUE,
    data_nascimento DATE,
    data_admissao DATE,
    data_demissao DATE,
    salario DECIMAL(10,2),
    cargo VARCHAR(100),
    departamento VARCHAR(100),
    supervisor_id INTEGER REFERENCES rh_funcionarios(id),
    habilidades TEXT[],
      status VARCHAR(20) DEFAULT 'ativo',
    dados_complementares JSONB DEFAULT '{}',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de folha de pagamento
CREATE TABLE IF NOT EXISTS rh_folha_pagamento (
    id SERIAL PRIMARY KEY,
    mes_referencia DATE NOT NULL,
    funcionario_id INTEGER REFERENCES rh_funcionarios(id),
    salario_base DECIMAL(10,2),
    proventos DECIMAL(10,2) DEFAULT 0,
    descontos DECIMAL(10,2) DEFAULT 0,
    salario_liquido DECIMAL(10,2) GENERATED ALWAYS AS (salario_base + proventos - descontos) STORED,
    status VARCHAR(20) DEFAULT 'processando',
    dados_lancamentos JSONB DEFAULT '{}',
    processado_por INTEGER REFERENCES vendedores(id),
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mes_referencia, funcionario_id)
);

-- Inserir dados base dos módulos
INSERT INTO erp_modulos (nome, slug, descricao, icone, categoria, ordem) VALUES
('Dashboard Executivo', 'dashboard-executivo', 'Visão 360° da empresa com KPIs e alertas', 'HomeIcon', 'executivo', 1),
('CRM', 'crm', 'Gestão de clientes, vendas e relacionamento', 'UserGroupIcon', 'operacional', 2),
('Financeiro', 'financeiro', 'Contas, fluxo de caixa, DRE e análises financeiras', 'CurrencyDollarIcon', 'operacional', 3),
('Logística', 'logistica', 'Estoque, frota, supply chain e transportes', 'TruckIcon', 'operacional', 4),
('Produção', 'producao', 'MRP, ordens, qualidade e OEE', 'CogIcon', 'operacional', 5),
('Recursos Humanos', 'rh', 'Folha, benefícios, performance e treinamentos', 'AcademicCapIcon', 'operacional', 6),
('Business Intelligence', 'bi', 'Dashboards, relatórios e análises avançadas', 'ChartPieIcon', 'estrategico', 7),
('IA Contextual', 'ia-contextual', 'Assistente empresarial com contexto completo', 'SparklesIcon', 'estrategico', 8),
('Automações', 'automacoes', 'Fluxos, integrações e automações empresariais', 'Cog6ToothIcon', 'estrategico', 9),
('Configurações', 'configuracoes', 'Sistema, integrações e parâmetros', 'BuildingOfficeIcon', 'suporte', 10)
ON CONFLICT (slug) DO NOTHING;

-- Inserir permissões base por cargo
INSERT INTO erp_permissoes_cargo (cargo, modulo_slug, nivel) VALUES
-- Gerente tem acesso completo
('gerente', 'dashboard-executivo', 'administracao'),
('gerente', 'crm', 'administracao'),
('gerente', 'financeiro', 'administracao'),
('gerente', 'logistica', 'administracao'),
('gerente', 'producao', 'administracao'),
('gerente', 'rh', 'administracao'),
('gerente', 'bi', 'administracao'),
('gerente', 'ia-contextual', 'administracao'),
('gerente', 'automacoes', 'administracao'),
('gerente', 'configuracoes', 'administracao'),

-- Vendedor tem acesso limitado
('vendedor', 'dashboard-executivo', 'leitura'),
('vendedor', 'crm', 'escrita'),
('vendedor', 'financeiro', 'leitura'),
('vendedor', 'logistica', 'leitura'),
('vendedor', 'producao', 'leitura'),
('vendedor', 'rh', 'leitura'),
('vendedor', 'bi', 'leitura'),
('vendedor', 'ia-contextual', 'escrita'),
('vendedor', 'automacoes', 'leitura'),

-- SDR tem acesso básico
('sdr', 'dashboard-executivo', 'leitura'),
('sdr', 'crm', 'escrita'),
('sdr', 'financeiro', 'leitura'),
('sdr', 'logistica', 'leitura'),
('sdr', 'producao', 'leitura'),
('sdr', 'rh', 'leitura'),
('sdr', 'bi', 'leitura'),
('sdr', 'ia-contextual', 'escrita'),
('sdr', 'automacoes', 'leitura')
ON CONFLICT (cargo, modulo_slug) DO NOTHING;

-- Inserir KPIs principais
INSERT INTO erp_kpis (nome, slug, descricao, modulo_origem, unidade, meta_padrao, formula_calculo) VALUES
('Faturamento Mensal', 'faturamento-mensal', 'Total de vendas no mês', 'financeiro', 'currency', 0, 'SUM(valor) FROM financeiro_lancamentos WHERE tipo = ''receita'' AND data_lancamento >= DATE_TRUNC(''month'', CURRENT_DATE)'),
('Margem de Lucro', 'margem-lucro', 'Percentual de lucro sobre faturamento', 'financeiro', 'percent', 20, '(receitas - custos) / receitas * 100'),
('Pedidos no Mês', 'pedidos-mes', 'Quantidade de pedidos no mês', 'crm', 'numero', 0, 'COUNT(*) FROM pedidos WHERE data_pedido >= DATE_TRUNC(''month'', CURRENT_DATE)'),
('Taxa de Entrega', 'taxa-entrega', 'Percentual de entregues no prazo', 'logistica', 'percent', 95, 'entregues_no_prazo / total_entregas * 100'),
('Eficiência Produção', 'eficiencia-producao', 'OEE geral da produção', 'producao', 'percent', 85, 'disponibilidade * performance * qualidade / 10000'),
('Satisfação Equipe', 'satisfacao-equipe', 'Média de satisfação dos funcionários', 'rh', 'nota', 8.5, 'AVG(nota_satisfacao) FROM rh_avaliacoes')
ON CONFLICT (slug) DO NOTHING;

-- Inserir agentes de IA base
INSERT INTO erp_agentes_ia (nome, slug, descricao, especialidade, capacidades, modelo_base, status) VALUES
('Assistente Executivo', 'assistente-executivo', 'IA com contexto completo da empresa', 'dashboard-executivo', 
ARRAY['análise_geral', 'previsões', 'recomendações_estratégicas'], 'gemini-pro', 'ativo'),
('Especialista Financeiro', 'especialista-financeiro', 'IA focada em análises financeiras', 'financeiro',
ARRAY['análise_financeira', 'previsão_fluxo', 'otimização_custos'], 'gemini-pro', 'ativo'),
('Especialista Logística', 'especialista-logistica', 'IA para otimização logística', 'logistica',
ARRAY['roteirização', 'gestão_estoque', 'previsão_demanda'], 'gemini-pro', 'ativo'),
('Especialista Produção', 'especialista-producao', 'IA para otimização da produção', 'producao',
ARRAY['planejamento_mrp', 'qualidade', 'manutenção_preditiva'], 'gemini-pro', 'ativo')
ON CONFLICT (slug) DO NOTHING;

-- Inserir configurações base do sistema
INSERT INTO sistema_configuracoes (chave, valor, descricao, tipo, categoria) VALUES
('erp.nome_empresa', 'Grupo MF Paris', 'Nome da empresa', 'texto', 'geral'),
('erp.cnpj', '00.000.000/0000-00', 'CNPJ da empresa', 'texto', 'geral'),
('erp.moeda_padrao', 'BRL', 'Moeda padrão do sistema', 'texto', 'financeiro'),
('erp.idioma_padrao', 'pt-BR', 'Idioma padrão do sistema', 'texto', 'geral'),
('erp.fuso_horario', 'America/Sao_Paulo', 'Fuso horário padrão', 'texto', 'geral'),
('ia.modelo_padrao', 'gemini-pro', 'Modelo de IA padrão', 'texto', 'ia'),
('ia.contexto_max_tokens', '32000', 'Tokens máximos para contexto', 'numero', 'ia'),
('automacoes.max_execucoes_hora', '100', 'Máximo de execuções por hora', 'numero', 'automacoes')
ON CONFLICT (chave) DO NOTHING;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_erp_kpi_valores_data ON erp_kpi_valores(data_registro DESC);
CREATE INDEX IF NOT EXISTS idx_erp_alertas_status ON erp_alertas(status, lido);
CREATE INDEX IF NOT EXISTS idx_erp_conversas_usuario ON erp_conversas_ia(usuario_id, atualizada_em DESC);
CREATE INDEX IF NOT EXISTS idx_erp_automacoes_status ON erp_automacoes(status);
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_data ON financeiro_lancamentos(data_lancamento DESC);
CREATE INDEX IF NOT EXISTS idx_logistica_estoque_status ON logistica_produtos_estoque(status);
CREATE INDEX IF NOT EXISTS idx_producao_ordens_status ON producao_ordens(status, data_fim_prevista);

-- Habilitar RLS nas novas tabelas
ALTER TABLE erp_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_conversas_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_mensagens_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_automacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_automacao_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_folha_pagamento ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (serão ajustadas conforme necessidade)
-- Usuários só podem ver seus próprios dados
CREATE POLICY "Usuários podem ver próprios dados" ON erp_usuarios 
    FOR ALL USING (vendedor_id = auth.uid());

-- Gerentes podem ver todos os alertas
CREATE POLICY "Gerentes veem todos alertas" ON erp_alertas 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM vendedores v 
            JOIN erp_usuarios eu ON v.id = eu.vendedor_id 
            WHERE v.cargo = 'gerente' AND v.auth_user_id = auth.uid()
        )
    );

-- Usuários podem ver/conversar com IA
CREATE POLICY "Usuários podem usar IA" ON erp_conversas_ia 
    FOR ALL USING (usuario_id = auth.uid());

CREATE POLICY "Usuários podem ver mensagens próprias" ON erp_mensagens_ia 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM erp_conversas_ia ec 
            WHERE ec.id = conversa_id AND ec.usuario_id = auth.uid()
        )
    );
