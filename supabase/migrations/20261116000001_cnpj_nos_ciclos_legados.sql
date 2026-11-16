-- Estende o escopo de idx_clientes_cnpj_unique para também permitir CNPJ em
-- cards de novo_ciclo legados (criados antes de existir origem_ciclo_id) e
-- faz backfill de CNPJ/omie_codigo nesses cards a partir do cadastro raiz.

DROP INDEX IF EXISTS public.idx_clientes_cnpj_unique;

CREATE UNIQUE INDEX idx_clientes_cnpj_unique
  ON public.clientes (cnpj)
  WHERE cnpj IS NOT NULL AND cnpj <> '' AND origem_ciclo_id IS NULL AND NOT COALESCE(novo_ciclo, false);

UPDATE public.clientes c
SET
  cnpj = COALESCE(NULLIF(c.cnpj, ''), origem.cnpj),
  omie_codigo = COALESCE(NULLIF(c.omie_codigo, ''), origem.omie_codigo)
FROM (
  SELECT DISTINCT ON (public.funil_norm_nome(razao_social))
    public.funil_norm_nome(razao_social) AS nome_norm,
    cnpj,
    omie_codigo
  FROM public.clientes
  WHERE cnpj IS NOT NULL AND cnpj <> ''
  ORDER BY public.funil_norm_nome(razao_social), arquivado_duplicata ASC, id ASC
) origem
WHERE c.novo_ciclo IS TRUE
  AND NOT COALESCE(c.arquivado_duplicata, false)
  AND (c.cnpj IS NULL OR c.cnpj = '')
  AND public.funil_norm_nome(c.razao_social) = origem.nome_norm;
