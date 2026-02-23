-- M2: Tabela para receber eventos de WhatsApp, Email, Omie e outras integrações futuras
-- Execute este SQL no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,          -- 'whatsapp', 'email', 'omie', etc.
  event_type TEXT NOT NULL,      -- 'message_received', 'message_sent', 'order_created', etc.
  payload JSONB NOT NULL DEFAULT '{}',
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_cliente ON webhook_events(cliente_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

-- M3+M4: Adicionar campos whatsapp e omie_codigo na tabela clientes
-- (só execute se ainda não existirem)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS omie_codigo TEXT DEFAULT '';

-- RLS para webhook_events (permitir acesso autenticado)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read webhook_events"
  ON webhook_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert webhook_events"
  ON webhook_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update webhook_events"
  ON webhook_events FOR UPDATE
  TO authenticated
  USING (true);
