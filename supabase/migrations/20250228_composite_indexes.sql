-- P1-7: Índices compostos para queries frequentes do CRM

-- Clientes: filtro por vendedor + etapa (usado no funil filtrado)
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_etapa ON clientes (vendedor_id, etapa);

-- Clientes: busca por CNPJ (dedup + lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cnpj_unique ON clientes (cnpj) WHERE cnpj IS NOT NULL AND cnpj != '';

-- Clientes: ordenação por score + etapa (ranking dentro do funil)
CREATE INDEX IF NOT EXISTS idx_clientes_etapa_score ON clientes (etapa, score DESC);

-- Interações: filtro por cliente + ordenação por data
CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_data ON interacoes (cliente_id, created_at DESC);

-- Tarefas: filtro por vendedor + status + data (agenda do vendedor)
CREATE INDEX IF NOT EXISTS idx_tarefas_vendedor_status_data ON tarefas (vendedor_id, status, data);

-- Tarefas: filtro por cliente
CREATE INDEX IF NOT EXISTS idx_tarefas_cliente ON tarefas (cliente_id);

-- Histórico etapas: filtro por cliente + ordenação por data
CREATE INDEX IF NOT EXISTS idx_historico_etapas_cliente_data ON historico_etapas (cliente_id, data);

-- Pedidos: filtro por cliente + ordenação por data
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_data ON pedidos (cliente_id, data_criacao DESC);

-- Pedidos: filtro por vendedor
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON pedidos (vendedor_id);

-- Itens pedido: FK lookup
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON itens_pedido (pedido_id);

-- Jobs automação: filtro por status + agendamento (usado pelo cron)
CREATE INDEX IF NOT EXISTS idx_jobs_status_agendado ON jobs_automacao (status, agendado_para) WHERE status = 'pendente';

-- Jobs automação: filtro por campanha
CREATE INDEX IF NOT EXISTS idx_jobs_campanha ON jobs_automacao (campanha_id);

-- Atividades: ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_atividades_created ON atividades (created_at DESC);

-- Notificações: filtro por lida + ordenação
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida_created ON notificacoes (lida, created_at DESC);

-- Vendedores: lookup por auth_id (usado no login)
CREATE INDEX IF NOT EXISTS idx_vendedores_auth_id ON vendedores (auth_id) WHERE auth_id IS NOT NULL;
