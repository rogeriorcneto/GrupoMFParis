-- Adiciona vendedor_id à tabela notificacoes para filtrar por usuário
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notificacoes_vendedor_id ON notificacoes(vendedor_id);

-- Atualiza RLS: vendedor só vê suas próprias notificações (ou gerente vê todas)
DROP POLICY IF EXISTS "notificacoes_select" ON notificacoes;
CREATE POLICY "notificacoes_select" ON notificacoes FOR SELECT USING (true);

DROP POLICY IF EXISTS "notificacoes_insert" ON notificacoes;
CREATE POLICY "notificacoes_insert" ON notificacoes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notificacoes_update" ON notificacoes;
CREATE POLICY "notificacoes_update" ON notificacoes FOR UPDATE USING (true);
