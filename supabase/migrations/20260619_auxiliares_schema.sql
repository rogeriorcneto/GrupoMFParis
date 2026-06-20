-- ============================================
-- MIGRAÇÃO: Schema base das tabelas auxiliares
-- templates, templates_msgs, cadencias, cadencia_steps,
-- campanhas, jobs_automacao, atividades, notificacoes
-- ============================================

CREATE TABLE IF NOT EXISTS templates (
  id      SERIAL PRIMARY KEY,
  nome    TEXT NOT NULL,
  canal   TEXT NOT NULL,
  etapa   TEXT,
  assunto TEXT,
  corpo   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates_msgs (
  id        SERIAL PRIMARY KEY,
  canal     TEXT NOT NULL,
  nome      TEXT NOT NULL,
  conteudo  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cadencias (
  id                  SERIAL PRIMARY KEY,
  nome                TEXT NOT NULL,
  pausar_ao_responder BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS cadencia_steps (
  id          SERIAL PRIMARY KEY,
  cadencia_id INTEGER NOT NULL REFERENCES cadencias(id) ON DELETE CASCADE,
  canal       TEXT NOT NULL,
  delay_dias  INTEGER NOT NULL DEFAULT 1,
  template_id INTEGER,
  ordem       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cadencia_steps_cadencia_id ON cadencia_steps(cadencia_id);

CREATE TABLE IF NOT EXISTS campanhas (
  id                SERIAL PRIMARY KEY,
  nome              TEXT NOT NULL,
  cadencia_id       INTEGER REFERENCES cadencias(id) ON DELETE SET NULL,
  etapa             TEXT,
  min_score         INTEGER DEFAULT 0,
  dias_inativo_min  INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'ativa'
);

CREATE INDEX IF NOT EXISTS idx_campanhas_cadencia_id ON campanhas(cadencia_id);

CREATE TABLE IF NOT EXISTS jobs_automacao (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  canal           TEXT NOT NULL,
  tipo            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente',
  agendado_para   TIMESTAMPTZ NOT NULL,
  template_id     INTEGER,
  campanha_id     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_automacao_cliente_id ON jobs_automacao(cliente_id);
CREATE INDEX IF NOT EXISTS idx_jobs_automacao_agendado_para ON jobs_automacao(agendado_para);
CREATE INDEX IF NOT EXISTS idx_jobs_automacao_status ON jobs_automacao(status);

CREATE TABLE IF NOT EXISTS atividades (
  id            SERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL,
  descricao     TEXT,
  vendedor_nome TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id          SERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  mensagem    TEXT NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  lida        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_cliente_id ON notificacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida, created_at DESC);
