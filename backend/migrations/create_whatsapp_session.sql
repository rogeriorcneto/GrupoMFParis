CREATE TABLE IF NOT EXISTS whatsapp_session (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_session_auth"
  ON whatsapp_session FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "whatsapp_session_anon"
  ON whatsapp_session FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
