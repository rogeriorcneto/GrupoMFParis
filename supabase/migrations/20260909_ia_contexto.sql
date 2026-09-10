CREATE TABLE IF NOT EXISTS ia_contexto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secao TEXT NOT NULL CHECK (secao IN ('visao-geral', 'processos', 'produtos', 'clientes', 'vendas')),
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'pdf', 'regra', 'produto')),
  conteudo TEXT NOT NULL,
  url_arquivo TEXT,
  tamanho_arquivo BIGINT,
  criado_por INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ia_contexto_secao ON ia_contexto(secao);
CREATE INDEX IF NOT EXISTS idx_ia_contexto_tipo ON ia_contexto(tipo);
CREATE INDEX IF NOT EXISTS idx_ia_contexto_criado_por ON ia_contexto(criado_por);
CREATE INDEX IF NOT EXISTS idx_ia_contexto_ativo ON ia_contexto(ativo);

ALTER TABLE ia_contexto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gerentes podem ver contexto da IA" ON ia_contexto;
DROP POLICY IF EXISTS "Gerentes podem inserir contexto da IA" ON ia_contexto;
DROP POLICY IF EXISTS "Gerentes podem atualizar contexto da IA" ON ia_contexto;
DROP POLICY IF EXISTS "Gerentes podem deletar contexto da IA" ON ia_contexto;

CREATE POLICY "Gerentes podem ver contexto da IA" ON ia_contexto
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vendedores
    WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
  ));

CREATE POLICY "Gerentes podem inserir contexto da IA" ON ia_contexto
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM vendedores
    WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
  ));

CREATE POLICY "Gerentes podem atualizar contexto da IA" ON ia_contexto
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vendedores
    WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM vendedores
    WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
  ));

CREATE POLICY "Gerentes podem deletar contexto da IA" ON ia_contexto
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vendedores
    WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
  ));

CREATE OR REPLACE FUNCTION update_ia_contexto_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ia_contexto_atualizado_em ON ia_contexto;
CREATE TRIGGER trigger_ia_contexto_atualizado_em
  BEFORE UPDATE ON ia_contexto
  FOR EACH ROW
  EXECUTE FUNCTION update_ia_contexto_atualizado_em();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', true, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Gerentes podem enviar documentos da IA" ON storage.objects;
DROP POLICY IF EXISTS "Publico pode ler documentos da IA" ON storage.objects;
DROP POLICY IF EXISTS "Gerentes podem excluir documentos da IA" ON storage.objects;

CREATE POLICY "Gerentes podem enviar documentos da IA"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = 'ia-contexto'
    AND EXISTS (
      SELECT 1 FROM vendedores
      WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
    )
  );

CREATE POLICY "Publico pode ler documentos da IA"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'documentos' AND (storage.foldername(name))[1] = 'ia-contexto');

CREATE POLICY "Gerentes podem excluir documentos da IA"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (storage.foldername(name))[1] = 'ia-contexto'
    AND EXISTS (
      SELECT 1 FROM vendedores
      WHERE vendedores.auth_id = auth.uid() AND vendedores.cargo = 'gerente'
    )
  );
