-- Adicionar coluna para guardar erro do Omie quando pedido é rejeitado
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS omie_erro TEXT;
