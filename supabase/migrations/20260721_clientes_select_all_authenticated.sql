-- Vendedor consulta apenas seus clientes; gerente consulta todos.
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  vendedor_id = my_vendedor_id() OR is_gerente()
);
