-- =====================================================
-- MIGRAÇÃO: Missão Comercial + campos de visita em tarefas
-- =====================================================

CREATE TABLE IF NOT EXISTS missoes (
  id              SERIAL PRIMARY KEY,
  nome            TEXT NOT NULL,
  objetivo        TEXT,
  vendedor_id     INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  estado          TEXT,
  cidades         TEXT[],
  data_saida      DATE NOT NULL,
  data_retorno    DATE NOT NULL,
  veiculo         TEXT,
  hotel           TEXT,
  status          TEXT NOT NULL DEFAULT 'planejada', -- planejada, em_andamento, concluida, cancelada
  metas           JSONB DEFAULT NULL,
  custo_estimado  NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS missao_despesas (
  id              SERIAL PRIMARY KEY,
  missao_id       INTEGER REFERENCES missoes(id) ON DELETE CASCADE NOT NULL,
  vendedor_id     INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL, -- combustivel, pedagio, hotel, alimentacao, estacionamento, outro
  valor           NUMERIC(12,2) NOT NULL,
  data            DATE NOT NULL,
  comprovante_url TEXT,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS missao_id          INTEGER REFERENCES missoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dia_missao        INTEGER,
  ADD COLUMN IF NOT EXISTS ordem             INTEGER,
  ADD COLUMN IF NOT EXISTS chegada_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saida_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS localizacao_chegada JSONB,
  ADD COLUMN IF NOT EXISTS localizacao_saida  JSONB,
  ADD COLUMN IF NOT EXISTS resultado          TEXT,
  ADD COLUMN IF NOT EXISTS interesse        TEXT,
  ADD COLUMN IF NOT EXISTS produtos_apresentados TEXT[],
  ADD COLUMN IF NOT EXISTS proximos_passos    TEXT,
  ADD COLUMN IF NOT EXISTS amostras_entregues INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tarefas_missao_id ON tarefas(missao_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_dia_missao ON tarefas(dia_missao);
CREATE INDEX IF NOT EXISTS idx_missao_despesas_missao_id ON missao_despesas(missao_id);
CREATE INDEX IF NOT EXISTS idx_missoes_vendedor_status ON missoes(vendedor_id, status);
