-- Tabela para persistir a sessão do Baileys (WhatsApp) no Supabase
-- Permite que o Railway reinicie sem perder a conexão do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_session (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- RLS: apenas service_role acessa (o backend usa a anon key mas com RLS aberto)
ALTER TABLE whatsapp_session ENABLE ROW LEVEL SECURITY;

-- Permitir todas as operações para usuários autenticados
CREATE POLICY "Authenticated can manage whatsapp_session"
  ON whatsapp_session FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permitir também para anon (o backend pode usar anon key)
CREATE POLICY "Anon can manage whatsapp_session"
  ON whatsapp_session FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
