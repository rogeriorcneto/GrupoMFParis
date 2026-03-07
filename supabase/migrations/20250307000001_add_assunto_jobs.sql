-- Add missing assunto column to jobs_automacao
ALTER TABLE jobs_automacao ADD COLUMN IF NOT EXISTS assunto text DEFAULT '';
