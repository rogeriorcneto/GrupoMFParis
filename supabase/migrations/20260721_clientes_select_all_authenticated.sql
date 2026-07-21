-- Permite que vendedores autenticados consultem a base completa de clientes.
-- As regras de INSERT, UPDATE e DELETE continuam restritas por vendedor/gerente.
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  auth.uid() IS NOT NULL
);
