-- Migration 008: Academia de Candidatos — links temporários de acesso
-- Permite gerar links com vigência para candidatos acessarem a Academia de Vendas
-- sem criar login no CRM.

CREATE TABLE IF NOT EXISTS academia_links (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  nome_candidato text NOT NULL,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academia_links_token_idx ON academia_links(token);

-- Sessões de roleplay de candidatos ficam vinculadas ao link de acesso
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS academia_link_id integer REFERENCES academia_links(id);
ALTER TABLE roleplay_sessions ALTER COLUMN vendedor_id DROP NOT NULL;

-- RLS: backend acessa via service role quando disponível; como fallback o
-- backend opera com a anon key, então a policy liberada cobre os dois casos
-- (mesmo padrão usado em whatsapp_session).
ALTER TABLE academia_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage academia_links"
  ON academia_links FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can manage academia_links"
  ON academia_links FOR ALL TO anon
  USING (true) WITH CHECK (true);
