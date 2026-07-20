ALTER TABLE clientes ADD COLUMN IF NOT EXISTS classe_cliente TEXT;

CREATE TABLE IF NOT EXISTS classes_clientes (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO classes_clientes (nome) VALUES
  ('Indústria'),
  ('Foods'),
  ('Grandes Contas'),
  ('Cozinha Industrial'),
  ('Cesta Básica'),
  ('Outros')
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE classes_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_manage_classes_clientes" ON classes_clientes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
