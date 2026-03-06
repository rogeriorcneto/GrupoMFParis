import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

// Use service role key for server-side DB operations (bypasses RLS)
// Falls back to anon key if SUPABASE_SERVICE_ROLE_KEY is not set
export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
