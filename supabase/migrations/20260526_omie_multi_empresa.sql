-- Adicionar coluna para múltiplas credenciais Omie (multi-empresa)
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS omie_empresas JSONB DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN bot_config.omie_empresas IS 'Array de empresas Omie com nome, appKey, appSecret e ativo';
