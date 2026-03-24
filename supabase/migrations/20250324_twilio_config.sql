-- Add Twilio VOIP configuration columns to bot_config
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_twiml_app_sid TEXT DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_api_key TEXT DEFAULT '';
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS twilio_api_secret TEXT DEFAULT '';
