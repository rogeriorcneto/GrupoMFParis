-- CNPJ nos cards de novo ciclo.
-- O índice único em cnpj forçava buildNovoCicloCliente a criar cards sem
-- documento; pedidos desses cards eram rejeitados no Omie ("cliente sem CNPJ").
-- A anti-duplicata real já existe em clientes_um_comercial_por_empresa.
-- Regra nova: CNPJ único apenas entre cards de ORIGEM (origem_ciclo_id nulo);
-- cards de ciclo podem compartilhar o documento da empresa.

DROP INDEX IF EXISTS public.idx_clientes_cnpj_unique;

CREATE UNIQUE INDEX idx_clientes_cnpj_unique
  ON public.clientes (cnpj)
  WHERE cnpj IS NOT NULL AND cnpj <> '' AND origem_ciclo_id IS NULL;

-- Backfill: cards de ciclo sem CNPJ recebem o documento do card de origem
-- (origem_ciclo_id) ou do primeiro card da mesma empresa_funil que tenha CNPJ.
UPDATE public.clientes c
SET cnpj = origem.cnpj
FROM public.clientes origem
WHERE c.origem_ciclo_id = origem.id
  AND (c.cnpj IS NULL OR c.cnpj = '')
  AND origem.cnpj IS NOT NULL AND origem.cnpj <> '';

UPDATE public.clientes c
SET cnpj = sub.cnpj
FROM (
  SELECT DISTINCT ON (COALESCE(empresa_funil_id, id)) id, COALESCE(empresa_funil_id, id) AS empresa, cnpj
  FROM public.clientes
  WHERE cnpj IS NOT NULL AND cnpj <> ''
  ORDER BY COALESCE(empresa_funil_id, id), id
) sub
WHERE COALESCE(c.empresa_funil_id, c.id) = sub.empresa
  AND (c.cnpj IS NULL OR c.cnpj = '');
