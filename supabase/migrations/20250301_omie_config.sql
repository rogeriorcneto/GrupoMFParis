-- Adicionar colunas para credenciais Omie na tabela bot_config
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS omie_app_key text DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS omie_app_secret text DEFAULT '';
