-- Corrige RLS de notificações: a tabela não tem a coluna vendedor_id,
-- então as políticas anteriores causavam erro 403 em qualquer select/update.
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_select" ON notificacoes;
CREATE POLICY "notificacoes_select" ON notificacoes FOR SELECT USING (true);

DROP POLICY IF EXISTS "notificacoes_insert" ON notificacoes;
CREATE POLICY "notificacoes_insert" ON notificacoes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notificacoes_update" ON notificacoes;
CREATE POLICY "notificacoes_update" ON notificacoes FOR UPDATE USING (true);
