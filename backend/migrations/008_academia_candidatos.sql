-- Migration 008 (OPCIONAL): Academia de Candidatos — links temporários de acesso
--
-- NOTA: a implementação atual NÃO depende desta migration. Links e sessões de
-- candidatos são persistidos na tabela whatsapp_session (chave/valor) com os
-- prefixos "academia_link:" e "academia_sessao:". Rode este script apenas se
-- quiser formalizar o schema no futuro — seria necessário também migrar os
-- dados existentes e atualizar backend/src/database.ts.

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
