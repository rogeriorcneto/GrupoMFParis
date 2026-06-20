-- ============================================
-- Cria bucket interacoes-anexos no Supabase Storage
-- + políticas de acesso para usuários autenticados
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interacoes-anexos',
  'interacoes-anexos',
  true,
  20971520,  -- 20MB
  NULL       -- todos os tipos permitidos
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Autenticado pode upload interacao anexo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interacoes-anexos');

CREATE POLICY "Publico pode ler interacao anexo"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'interacoes-anexos');

CREATE POLICY "Autenticado pode deletar interacao anexo"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'interacoes-anexos');
