-- ============================================
-- Cria bucket call-recordings no Supabase Storage
-- + políticas de acesso para usuários autenticados
-- ============================================

-- Criar bucket (privado, limite de 50MB por arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-recordings',
  'call-recordings',
  false,
  52428800,  -- 50MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- Política: usuário autenticado pode fazer upload na sua própria pasta
CREATE POLICY "Vendedor pode upload sua gravacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'call-recordings');

-- Política: usuário autenticado pode ler qualquer gravação
CREATE POLICY "Autenticado pode ler gravacoes"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'call-recordings');

-- Política: usuário autenticado pode deletar gravações
CREATE POLICY "Autenticado pode deletar gravacoes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'call-recordings');
