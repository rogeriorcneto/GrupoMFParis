-- Add transcription column to call recordings
ALTER TABLE gravacoes_chamada ADD COLUMN IF NOT EXISTS transcricao text;
