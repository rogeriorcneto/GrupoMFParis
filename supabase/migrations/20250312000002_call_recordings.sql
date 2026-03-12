-- ============================================
-- Tabela para gravações de chamadas telefônicas
-- ============================================

CREATE TABLE IF NOT EXISTS gravacoes_chamada (
  id BIGSERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  numero_telefone TEXT NOT NULL,
  duracao_segundos INTEGER NOT NULL DEFAULT 0,
  arquivo_url TEXT,                     -- URL do arquivo no Supabase Storage
  arquivo_path TEXT,                    -- path no bucket (para delete)
  tamanho_bytes INTEGER DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gravacoes_cliente ON gravacoes_chamada(cliente_id);
CREATE INDEX idx_gravacoes_vendedor ON gravacoes_chamada(vendedor_id);
CREATE INDEX idx_gravacoes_created ON gravacoes_chamada(created_at DESC);

-- RLS
ALTER TABLE gravacoes_chamada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read gravacoes"
  ON gravacoes_chamada FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert gravacoes"
  ON gravacoes_chamada FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update gravacoes"
  ON gravacoes_chamada FOR UPDATE TO authenticated USING (true);

-- Storage bucket (precisa ser criado via Dashboard ou API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('call-recordings', 'call-recordings', false);
