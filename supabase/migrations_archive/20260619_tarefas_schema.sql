-- ============================================
-- MIGRAÇÃO: Schema base da tabela tarefas
-- (caso a tabela ainda não exista no projeto)
-- ============================================
CREATE TABLE IF NOT EXISTS tarefas (
  id            SERIAL PRIMARY KEY,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  data          DATE NOT NULL,
  hora          TIME,
  tipo          TEXT NOT NULL DEFAULT 'outro',
  status        TEXT NOT NULL DEFAULT 'pendente',
  prioridade    TEXT NOT NULL DEFAULT 'media',
  cliente_id    INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id   INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  origem_automacao_id INTEGER REFERENCES jobs_automacao(id) ON DELETE SET NULL,
  reagendamentos JSONB DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_cliente_id ON tarefas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_vendedor_id ON tarefas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_data ON tarefas(data);
CREATE INDEX IF NOT EXISTS idx_tarefas_vendedor_status_data ON tarefas(vendedor_id, status, data);
CREATE INDEX IF NOT EXISTS idx_tarefas_origem_automacao_id ON tarefas(origem_automacao_id);

COMMENT ON COLUMN tarefas.reagendamentos IS 'Histórico de reagendamentos (array JSON com dataOriginal, horaOriginal, motivo, reagendadoEm)';
