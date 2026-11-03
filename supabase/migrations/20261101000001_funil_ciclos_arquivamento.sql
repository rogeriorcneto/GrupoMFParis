-- Proteção do funil: identidade estável de ciclos, 1 card comercial por empresa
-- e arquivamento reversível de duplicatas (preserva pedidos e histórico).
BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS empresa_funil_id INTEGER REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS origem_ciclo_id INTEGER REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS arquivado_duplicata BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS card_principal_id INTEGER REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS motivo_arquivamento TEXT,
  ADD COLUMN IF NOT EXISTS regularizacao_historico JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Garantia dura entre ciclos da mesma família: empresa_funil_id é preenchido
-- pelo trigger; linhas legadas usam o próprio id (não conflitam na criação).
CREATE UNIQUE INDEX IF NOT EXISTS clientes_um_comercial_por_empresa
  ON public.clientes ((COALESCE(empresa_funil_id, id)))
  WHERE etapa IN ('proposta', 'negociacao') AND NOT arquivado_duplicata;

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_funil ON public.clientes (empresa_funil_id);
CREATE INDEX IF NOT EXISTS idx_clientes_origem_ciclo ON public.clientes (origem_ciclo_id);

-- Normalização de nome equivalente à chaveClienteFunil do frontend
-- (sem depender da extensão unaccent: cobre acentos pt-BR via translate).
CREATE OR REPLACE FUNCTION public.funil_norm_nome(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_temp AS $$
  SELECT NULLIF(regexp_replace(lower(translate(trim(COALESCE(t, '')),
    'àáâãäåèéêëìíîïòóôõöùúûüçñýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '\s+', ' ', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION public.funil_mesma_empresa(a public.clientes, b public.clientes)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN (a).id = (b).id THEN TRUE
    WHEN COALESCE((a).empresa_funil_id, (a).id) = COALESCE((b).empresa_funil_id, (b).id) THEN TRUE
    WHEN regexp_replace(COALESCE(NULLIF((a).cnpj, ''), (a).cpf, ''), '\D', '', 'g') <> ''
      AND regexp_replace(COALESCE(NULLIF((b).cnpj, ''), (b).cpf, ''), '\D', '', 'g') <> ''
      THEN regexp_replace(COALESCE(NULLIF((a).cnpj, ''), (a).cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(NULLIF((b).cnpj, ''), (b).cpf, ''), '\D', '', 'g')
    WHEN NULLIF((a).omie_codigo, '') IS NOT NULL AND NULLIF((b).omie_codigo, '') IS NOT NULL
      THEN (a).omie_codigo = (b).omie_codigo
    ELSE public.funil_norm_nome((a).razao_social) IS NOT NULL
      AND public.funil_norm_nome((a).razao_social) = public.funil_norm_nome((b).razao_social)
  END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_ciclos_funil()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  origem public.clientes;
  principal public.clientes;
  gerente BOOLEAN;
  conflito INTEGER;
  mudanca_arquivo BOOLEAN;
BEGIN
  -- Serializa criação de ciclo/regularização: impede duplo-clique e duas
  -- sessões concorrentes de gerar cards ou números de ciclo repetidos.
  PERFORM pg_advisory_xact_lock(20261101, 1);
  gerente := COALESCE(auth.role() = 'service_role', FALSE) OR public.is_gerente();
  mudanca_arquivo := TG_OP = 'UPDATE' AND NEW.arquivado_duplicata IS DISTINCT FROM OLD.arquivado_duplicata;

  IF TG_OP = 'INSERT' THEN
    IF NEW.arquivado_duplicata OR NEW.card_principal_id IS NOT NULL OR NEW.regularizacao_historico <> '[]'::jsonb THEN
      RAISE EXCEPTION 'Arquivamento só é permitido sobre um card existente';
    END IF;
    IF NEW.novo_ciclo AND NEW.origem_ciclo_id IS NULL THEN
      RAISE EXCEPTION 'Novo ciclo exige referência ao card de origem';
    END IF;
    IF NEW.origem_ciclo_id IS NOT NULL THEN
      SELECT * INTO origem FROM public.clientes WHERE id = NEW.origem_ciclo_id;
      IF NOT FOUND OR origem.arquivado_duplicata OR origem.etapa IN ('proposta', 'negociacao') THEN
        RAISE EXCEPTION 'Origem inválida ou ainda possui ciclo comercial ativo';
      END IF;
      NEW.empresa_funil_id := COALESCE(origem.empresa_funil_id, origem.id);
      NEW.vendedor_id := origem.vendedor_id;
      NEW.novo_ciclo := TRUE;
      SELECT COALESCE(MAX(COALESCE(c.ciclo_numero, 1)), 1) + 1 INTO NEW.ciclo_numero
        FROM public.clientes c WHERE public.funil_mesma_empresa(c, origem);
    ELSE
      NEW.empresa_funil_id := NEW.id;
      NEW.ciclo_numero := COALESCE(NEW.ciclo_numero, 1);
    END IF;
  ELSE
    IF NEW.origem_ciclo_id IS DISTINCT FROM OLD.origem_ciclo_id THEN
      RAISE EXCEPTION 'A origem do ciclo não pode ser alterada';
    END IF;
    IF NEW.empresa_funil_id IS DISTINCT FROM OLD.empresa_funil_id THEN
      RAISE EXCEPTION 'A identidade do ciclo não pode ser alterada';
    END IF;
    IF NEW.regularizacao_historico IS DISTINCT FROM OLD.regularizacao_historico THEN
      RAISE EXCEPTION 'O histórico de regularização é controlado pelo banco';
    END IF;
    IF NEW.motivo_arquivamento IS DISTINCT FROM OLD.motivo_arquivamento AND NOT mudanca_arquivo THEN
      RAISE EXCEPTION 'O motivo de arquivamento só muda durante a regularização';
    END IF;
    IF NEW.card_principal_id IS DISTINCT FROM OLD.card_principal_id AND NOT mudanca_arquivo THEN
      RAISE EXCEPTION 'A referência principal só muda durante a regularização';
    END IF;
    IF OLD.arquivado_duplicata AND NOT mudanca_arquivo AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Restaure o card arquivado antes de alterá-lo';
    END IF;
    IF OLD.etapa = 'negociacao' AND NEW.etapa = 'proposta' THEN
      RAISE EXCEPTION 'Negociação não pode voltar para Proposta';
    END IF;
    IF NEW.etapa = 'amostra' AND OLD.etapa <> 'amostra' THEN
      IF OLD.etapa NOT IN ('prospecção', 'proposta', 'amostra_perdida') THEN
        RAISE EXCEPTION 'Amostra só pode partir de Prospecção ou Proposta';
      END IF;
      IF OLD.etapa = 'amostra_perdida' THEN
        IF COALESCE(OLD.tentativa_amostra, 0) >= 2 THEN RAISE EXCEPTION 'Limite de tentativas de amostra atingido'; END IF;
        NEW.tentativa_amostra := GREATEST(COALESCE(NEW.tentativa_amostra, 0), COALESCE(OLD.tentativa_amostra, 0) + 1);
      END IF;
    END IF;
  END IF;

  IF mudanca_arquivo THEN
    IF NOT gerente THEN RAISE EXCEPTION 'Somente gerente pode arquivar ou restaurar duplicatas'; END IF;
    IF NEW.etapa IS DISTINCT FROM OLD.etapa OR NEW.ciclo_numero IS DISTINCT FROM OLD.ciclo_numero OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
      RAISE EXCEPTION 'Regularização não altera etapa, ciclo ou vendedor';
    END IF;
    IF NEW.arquivado_duplicata THEN
      IF length(trim(COALESCE(NEW.motivo_arquivamento, ''))) < 10 THEN RAISE EXCEPTION 'Informe o motivo da regularização'; END IF;
      SELECT * INTO principal FROM public.clientes WHERE id = NEW.card_principal_id;
      IF NOT FOUND OR principal.id = NEW.id OR principal.arquivado_duplicata OR NOT COALESCE(public.funil_mesma_empresa(OLD, principal), FALSE) THEN
        RAISE EXCEPTION 'Card principal inválido ou identidade divergente';
      END IF;
      IF EXISTS (SELECT 1 FROM public.pedidos WHERE cliente_id = NEW.id AND status IS DISTINCT FROM 'cancelado') THEN
        RAISE EXCEPTION 'Card com pedido não cancelado exige revisão individual e não pode ser arquivado';
      END IF;
    ELSE
      NEW.card_principal_id := OLD.card_principal_id;
    END IF;
    NEW.regularizacao_historico := OLD.regularizacao_historico || jsonb_build_array(jsonb_build_object(
      'acao', CASE WHEN NEW.arquivado_duplicata THEN 'arquivar' ELSE 'restaurar' END,
      'data', clock_timestamp(), 'usuario', auth.uid(), 'principal_id', NEW.card_principal_id, 'motivo', NEW.motivo_arquivamento
    ));
  END IF;

  -- 1 card comercial por empresa: verifica apenas quando a operação CRIA um
  -- novo card comercial (insert, entrada na coluna ou restauração). Updates em
  -- cards que já estão em proposta/negociacao não revalidam, para não travar a
  -- edição dos grupos já duplicados que aguardam regularização.
  IF NOT NEW.arquivado_duplicata AND NEW.etapa IN ('proposta', 'negociacao') AND
     (TG_OP = 'INSERT' OR mudanca_arquivo OR OLD.etapa NOT IN ('proposta', 'negociacao')) THEN
    SELECT c.id INTO conflito FROM public.clientes c
      WHERE c.id <> NEW.id AND NOT c.arquivado_duplicata AND c.etapa IN ('proposta', 'negociacao')
        AND COALESCE(public.funil_mesma_empresa(c, NEW), FALSE)
      ORDER BY c.id LIMIT 1;
    IF conflito IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe card comercial ativo para esta empresa (card %)', conflito USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_ciclos_funil ON public.clientes;
CREATE TRIGGER proteger_ciclos_funil BEFORE INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_ciclos_funil();

-- Arquiva um lote de cards excedentes apontando o principal. Reversível e
-- auditado em regularizacao_historico; nunca apaga nem marca como perdido.
CREATE OR REPLACE FUNCTION public.arquivar_duplicatas_funil(p_principal INTEGER, p_excedentes INTEGER[], p_motivo TEXT)
RETURNS SETOF public.clientes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(array_length(p_excedentes, 1), 0) = 0 OR p_principal = ANY(p_excedentes) THEN
    RAISE EXCEPTION 'Informe os excedentes sem incluir o card principal';
  END IF;
  PERFORM pg_advisory_xact_lock(20261101, 1);
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_principal AND NOT arquivado_duplicata) THEN
    RAISE EXCEPTION 'Card principal inexistente ou já arquivado';
  END IF;
  IF (SELECT COUNT(*) FROM public.clientes WHERE id = ANY(p_excedentes)) <> cardinality(p_excedentes) THEN
    RAISE EXCEPTION 'Lote contém IDs repetidos, inexistentes ou sem acesso';
  END IF;
  RETURN QUERY UPDATE public.clientes SET arquivado_duplicata = TRUE, card_principal_id = p_principal, motivo_arquivamento = p_motivo
    WHERE id = ANY(p_excedentes) AND NOT arquivado_duplicata RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_duplicata_funil(p_card_id INTEGER)
RETURNS SETOF public.clientes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY UPDATE public.clientes SET arquivado_duplicata = FALSE
    WHERE id = p_card_id AND arquivado_duplicata RETURNING *;
END;
$$;

-- Persiste os campos que o frontend já envia em p_extras mas a RPC descartava
-- (resultado/tentativas de amostra, satisfação e recompra).
CREATE OR REPLACE FUNCTION public.mover_cliente_atomico(
  p_cliente_id INT,
  p_etapa TEXT,
  p_etapa_anterior TEXT,
  p_data_entrada_etapa TEXT,
  p_extras JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE clientes SET
    etapa = p_etapa,
    etapa_anterior = p_etapa_anterior,
    data_entrada_etapa = p_data_entrada_etapa::timestamptz,
    updated_at = NOW(),
    motivo_perda = COALESCE(p_extras->>'motivo_perda', motivo_perda),
    categoria_perda = COALESCE(p_extras->>'categoria_perda', categoria_perda),
    status_amostra = COALESCE(p_extras->>'status_amostra', status_amostra),
    valor_proposta = COALESCE((p_extras->>'valor_proposta')::NUMERIC, valor_proposta),
    status_entrega = COALESCE(p_extras->>'status_entrega', status_entrega),
    status_faturamento = COALESCE(p_extras->>'status_faturamento', status_faturamento),
    resultado_amostra = CASE
      WHEN p_etapa = 'amostra' AND p_etapa_anterior = 'amostra_perdida' AND p_extras->>'resultado_amostra' IS NULL THEN NULL
      ELSE COALESCE(p_extras->>'resultado_amostra', resultado_amostra)
    END,
    motivo_reprovacao = CASE
      WHEN p_etapa = 'amostra' AND p_etapa_anterior = 'amostra_perdida' AND p_extras->>'motivo_reprovacao' IS NULL THEN NULL
      ELSE COALESCE(p_extras->>'motivo_reprovacao', motivo_reprovacao)
    END,
    tentativa_amostra = COALESCE((p_extras->>'tentativa_amostra')::INT, tentativa_amostra),
    status_satisfacao = COALESCE(p_extras->>'status_satisfacao', status_satisfacao),
    nota_satisfacao = COALESCE((p_extras->>'nota_satisfacao')::INT, nota_satisfacao),
    feedback_satisfacao = COALESCE(p_extras->>'feedback_satisfacao', feedback_satisfacao),
    total_compras = COALESCE((p_extras->>'total_compras')::INT, total_compras),
    status_follow_up = CASE
      WHEN p_extras->>'status_follow_up' IS NOT NULL AND p_extras->>'status_follow_up' != '' THEN p_extras->>'status_follow_up'
      WHEN p_etapa = 'negociacao' THEN NULL
      ELSE status_follow_up
    END
  WHERE id = p_cliente_id;

  IF p_extras->>'data_perda' IS NOT NULL AND p_extras->>'data_perda' != '' THEN
    UPDATE clientes SET data_perda = (p_extras->>'data_perda')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_envio_amostra' IS NOT NULL AND p_extras->>'data_envio_amostra' != '' THEN
    UPDATE clientes SET data_envio_amostra = (p_extras->>'data_envio_amostra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_resultado_amostra' IS NOT NULL AND p_extras->>'data_resultado_amostra' != '' THEN
    UPDATE clientes SET data_resultado_amostra = (p_extras->>'data_resultado_amostra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_homologacao' IS NOT NULL AND p_extras->>'data_homologacao' != '' THEN
    UPDATE clientes SET data_homologacao = (p_extras->>'data_homologacao')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_proposta' IS NOT NULL AND p_extras->>'data_proposta' != '' THEN
    UPDATE clientes SET data_proposta = (p_extras->>'data_proposta')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_ultimo_pedido' IS NOT NULL AND p_extras->>'data_ultimo_pedido' != '' THEN
    UPDATE clientes SET data_ultimo_pedido = (p_extras->>'data_ultimo_pedido')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'data_proxima_recompra' IS NOT NULL AND p_extras->>'data_proxima_recompra' != '' THEN
    UPDATE clientes SET data_proxima_recompra = (p_extras->>'data_proxima_recompra')::date WHERE id = p_cliente_id;
  END IF;

  IF p_extras->>'vendedor_id' IS NOT NULL AND p_extras->>'vendedor_id' != '' THEN
    UPDATE clientes SET vendedor_id = (p_extras->>'vendedor_id')::INT WHERE id = p_cliente_id;
  END IF;

  IF p_etapa = 'prospecção' THEN
    UPDATE clientes SET
      motivo_perda = NULL,
      categoria_perda = NULL,
      data_perda = NULL
    WHERE id = p_cliente_id;
  END IF;

  INSERT INTO historico_etapas (cliente_id, etapa, etapa_anterior, data)
  VALUES (p_cliente_id, p_etapa, p_etapa_anterior, p_data_entrada_etapa::timestamptz);
END;
$$;

COMMIT;
