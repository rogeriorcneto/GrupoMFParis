-- Add missing columns to jobs_automacao that the backend cron/RPC needs
ALTER TABLE jobs_automacao ADD COLUMN IF NOT EXISTS executado_em timestamptz;
ALTER TABLE jobs_automacao ADD COLUMN IF NOT EXISTS erro text DEFAULT '';
