-- Tabela de leads da Receita Federal (base CNPJ filtrada por CNAE alimentício)
CREATE TABLE IF NOT EXISTS leads_rf (
  cnpj          TEXT PRIMARY KEY,
  razao_social  TEXT,
  nome_fantasia TEXT,
  segmento      TEXT,
  cnae          TEXT,
  estado_sigla  TEXT,
  estado        TEXT,
  municipio     TEXT,
  logradouro    TEXT,
  bairro        TEXT,
  cep           TEXT,
  telefone      TEXT,
  email         TEXT,
  socio_nome    TEXT,
  socio_cpf     TEXT,
  cnpj_basico   TEXT,
  importado     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_rf_uf         ON leads_rf(estado_sigla);
CREATE INDEX IF NOT EXISTS idx_leads_rf_municipio  ON leads_rf(municipio);
CREATE INDEX IF NOT EXISTS idx_leads_rf_cnae       ON leads_rf(cnae);
CREATE INDEX IF NOT EXISTS idx_leads_rf_segmento   ON leads_rf(segmento);
CREATE INDEX IF NOT EXISTS idx_leads_rf_importado  ON leads_rf(importado);
CREATE INDEX IF NOT EXISTS idx_leads_rf_uf_mun     ON leads_rf(estado_sigla, municipio);

ALTER TABLE leads_rf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_rf_auth" ON leads_rf
  FOR ALL USING (auth.role() = 'authenticated');
