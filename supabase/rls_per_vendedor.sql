-- ============================================
-- RLS: Políticas por vendedor
-- Vendedor vê apenas seus dados. Gerente vê todos.
-- Executar no Supabase Dashboard → SQL Editor
-- ============================================

-- Helper: função que verifica se o usuário logado é gerente
CREATE OR REPLACE FUNCTION is_gerente()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM vendedores
    WHERE auth_id = auth.uid() AND cargo = 'gerente'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: retorna o vendedor_id do usuário logado
CREATE OR REPLACE FUNCTION my_vendedor_id()
RETURNS integer AS $$
  SELECT id FROM vendedores WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- CLIENTES
-- ============================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (
  is_gerente()
);

-- ============================================
-- INTERACOES (via join com clientes.vendedor_id)
-- ============================================
ALTER TABLE interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interacoes_select" ON interacoes;
CREATE POLICY "interacoes_select" ON interacoes FOR SELECT USING (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "interacoes_insert" ON interacoes;
CREATE POLICY "interacoes_insert" ON interacoes FOR INSERT WITH CHECK (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "interacoes_update" ON interacoes;
CREATE POLICY "interacoes_update" ON interacoes FOR UPDATE USING (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "interacoes_delete" ON interacoes;
CREATE POLICY "interacoes_delete" ON interacoes FOR DELETE USING (
  is_gerente()
);

-- ============================================
-- TAREFAS (via join com clientes.vendedor_id)
-- ============================================
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarefas_select" ON tarefas;
CREATE POLICY "tarefas_select" ON tarefas FOR SELECT USING (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR vendedor_id = my_vendedor_id()
  OR is_gerente()
);

DROP POLICY IF EXISTS "tarefas_insert" ON tarefas;
CREATE POLICY "tarefas_insert" ON tarefas FOR INSERT WITH CHECK (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR vendedor_id = my_vendedor_id()
  OR is_gerente()
);

DROP POLICY IF EXISTS "tarefas_update" ON tarefas;
CREATE POLICY "tarefas_update" ON tarefas FOR UPDATE USING (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR vendedor_id = my_vendedor_id()
  OR is_gerente()
);

DROP POLICY IF EXISTS "tarefas_delete" ON tarefas;
CREATE POLICY "tarefas_delete" ON tarefas FOR DELETE USING (
  is_gerente()
);

-- ============================================
-- HISTORICO_ETAPAS (via join com clientes)
-- ============================================
ALTER TABLE historico_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_etapas_select" ON historico_etapas;
CREATE POLICY "historico_etapas_select" ON historico_etapas FOR SELECT USING (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "historico_etapas_insert" ON historico_etapas;
CREATE POLICY "historico_etapas_insert" ON historico_etapas FOR INSERT WITH CHECK (
  cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

-- ============================================
-- PEDIDOS (via join com clientes)
-- ============================================
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_select" ON pedidos;
CREATE POLICY "pedidos_select" ON pedidos FOR SELECT USING (
  vendedor_id = my_vendedor_id()
  OR cliente_id IN (SELECT id FROM clientes WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "pedidos_insert" ON pedidos;
CREATE POLICY "pedidos_insert" ON pedidos FOR INSERT WITH CHECK (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

DROP POLICY IF EXISTS "pedidos_update" ON pedidos;
CREATE POLICY "pedidos_update" ON pedidos FOR UPDATE USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

-- ============================================
-- ITENS_PEDIDO (via join com pedidos)
-- ============================================
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itens_pedido_select" ON itens_pedido;
CREATE POLICY "itens_pedido_select" ON itens_pedido FOR SELECT USING (
  pedido_id IN (SELECT id FROM pedidos WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

DROP POLICY IF EXISTS "itens_pedido_insert" ON itens_pedido;
CREATE POLICY "itens_pedido_insert" ON itens_pedido FOR INSERT WITH CHECK (
  pedido_id IN (SELECT id FROM pedidos WHERE vendedor_id = my_vendedor_id())
  OR is_gerente()
);

-- ============================================
-- NOTIFICACOES (próprias)
-- ============================================
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_select" ON notificacoes;
CREATE POLICY "notificacoes_select" ON notificacoes FOR SELECT USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

DROP POLICY IF EXISTS "notificacoes_insert" ON notificacoes;
CREATE POLICY "notificacoes_insert" ON notificacoes FOR INSERT WITH CHECK (
  true -- Qualquer autenticado pode inserir notificação
);

DROP POLICY IF EXISTS "notificacoes_update" ON notificacoes;
CREATE POLICY "notificacoes_update" ON notificacoes FOR UPDATE USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);

-- ============================================
-- VENDEDORES (todos lêem, gerente edita)
-- ============================================
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedores_select" ON vendedores;
CREATE POLICY "vendedores_select" ON vendedores FOR SELECT USING (
  true -- Todos autenticados podem ver a equipe
);

DROP POLICY IF EXISTS "vendedores_insert" ON vendedores;
CREATE POLICY "vendedores_insert" ON vendedores FOR INSERT WITH CHECK (
  is_gerente()
);

DROP POLICY IF EXISTS "vendedores_update" ON vendedores;
CREATE POLICY "vendedores_update" ON vendedores FOR UPDATE USING (
  auth_id = auth.uid() OR is_gerente()
);

-- ============================================
-- PRODUTOS, TEMPLATES, TEMPLATES_MSGS (leitura para todos, escrita gerente)
-- ============================================
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produtos_select" ON produtos;
CREATE POLICY "produtos_select" ON produtos FOR SELECT USING (true);
DROP POLICY IF EXISTS "produtos_insert" ON produtos;
CREATE POLICY "produtos_insert" ON produtos FOR INSERT WITH CHECK (is_gerente());
DROP POLICY IF EXISTS "produtos_update" ON produtos;
CREATE POLICY "produtos_update" ON produtos FOR UPDATE USING (is_gerente());
DROP POLICY IF EXISTS "produtos_delete" ON produtos;
CREATE POLICY "produtos_delete" ON produtos FOR DELETE USING (is_gerente());

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select" ON templates;
CREATE POLICY "templates_select" ON templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "templates_insert" ON templates;
CREATE POLICY "templates_insert" ON templates FOR INSERT WITH CHECK (is_gerente());
DROP POLICY IF EXISTS "templates_delete" ON templates;
CREATE POLICY "templates_delete" ON templates FOR DELETE USING (is_gerente());

ALTER TABLE templates_msgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_msgs_select" ON templates_msgs;
CREATE POLICY "templates_msgs_select" ON templates_msgs FOR SELECT USING (true);
DROP POLICY IF EXISTS "templates_msgs_insert" ON templates_msgs;
CREATE POLICY "templates_msgs_insert" ON templates_msgs FOR INSERT WITH CHECK (is_gerente());

-- ============================================
-- CADENCIAS, CADENCIA_STEPS, CAMPANHAS, JOBS_AUTOMACAO, ATIVIDADES
-- ============================================
ALTER TABLE cadencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cadencias_select" ON cadencias;
CREATE POLICY "cadencias_select" ON cadencias FOR SELECT USING (true);
DROP POLICY IF EXISTS "cadencias_insert" ON cadencias;
CREATE POLICY "cadencias_insert" ON cadencias FOR INSERT WITH CHECK (is_gerente());

ALTER TABLE cadencia_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cadencia_steps_select" ON cadencia_steps;
CREATE POLICY "cadencia_steps_select" ON cadencia_steps FOR SELECT USING (true);
DROP POLICY IF EXISTS "cadencia_steps_insert" ON cadencia_steps;
CREATE POLICY "cadencia_steps_insert" ON cadencia_steps FOR INSERT WITH CHECK (is_gerente());

ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campanhas_select" ON campanhas;
CREATE POLICY "campanhas_select" ON campanhas FOR SELECT USING (true);
DROP POLICY IF EXISTS "campanhas_insert" ON campanhas;
CREATE POLICY "campanhas_insert" ON campanhas FOR INSERT WITH CHECK (is_gerente());
DROP POLICY IF EXISTS "campanhas_update" ON campanhas;
CREATE POLICY "campanhas_update" ON campanhas FOR UPDATE USING (is_gerente());

ALTER TABLE jobs_automacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs_automacao_select" ON jobs_automacao;
CREATE POLICY "jobs_automacao_select" ON jobs_automacao FOR SELECT USING (true);
DROP POLICY IF EXISTS "jobs_automacao_insert" ON jobs_automacao;
CREATE POLICY "jobs_automacao_insert" ON jobs_automacao FOR INSERT WITH CHECK (is_gerente());
DROP POLICY IF EXISTS "jobs_automacao_update" ON jobs_automacao;
CREATE POLICY "jobs_automacao_update" ON jobs_automacao FOR UPDATE USING (is_gerente());

ALTER TABLE atividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atividades_select" ON atividades;
CREATE POLICY "atividades_select" ON atividades FOR SELECT USING (true);
DROP POLICY IF EXISTS "atividades_insert" ON atividades;
CREATE POLICY "atividades_insert" ON atividades FOR INSERT WITH CHECK (true);

-- ============================================
-- Habilitar Realtime nas tabelas principais
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE interacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE tarefas;
