-- ============================================
-- Add forma_pagamento column to pedidos table
-- ============================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT DEFAULT 'À vista';
