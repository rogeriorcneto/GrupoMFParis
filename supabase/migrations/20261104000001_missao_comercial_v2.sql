-- =====================================================
-- Missão Comercial v2 — workflow completo do diretor
-- solicitação → aprovação → execução → custos → encerramento + IEM
-- =====================================================

-- 1) Colunas novas em missoes
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS orcamento_previsto JSONB,      -- {combustivel, pedagio, hotel, alimentacao, outros}
  ADD COLUMN IF NOT EXISTS meta              JSONB,       -- {visitas, distribuidores, amostras, toneladas, treinamentos}
  ADD COLUMN IF NOT EXISTS resultado_esperado TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por      INTEGER REFERENCES public.vendedores(id),
  ADD COLUMN IF NOT EXISTS aprovado_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT,
  ADD COLUMN IF NOT EXISTS solicitante_id    INTEGER REFERENCES public.vendedores(id),
  ADD COLUMN IF NOT EXISTS resumo_ia         TEXT,
  ADD COLUMN IF NOT EXISTS iem               NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS iem_detalhe       JSONB;

-- status agora admite: rascunho, aguardando_aprovacao, aprovada, reprovada,
-- em_andamento, concluida, cancelada (mantém 'planejada' legado como aprovada)

-- 2) Vendedores participantes da missão
CREATE TABLE IF NOT EXISTS public.missao_vendedores (
  id           SERIAL PRIMARY KEY,
  missao_id    INTEGER NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  vendedor_id  INTEGER NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  papel        TEXT NOT NULL DEFAULT 'acompanhado', -- acompanhado | lider
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (missao_id, vendedor_id)
);

-- 3) Clientes planejados/vinculados à missão
CREATE TABLE IF NOT EXISTS public.missao_clientes (
  id           SERIAL PRIMARY KEY,
  missao_id    INTEGER NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  cliente_id   INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  planejado    BOOLEAN NOT NULL DEFAULT true, -- false = visita avulsa no caminho
  dia          DATE,
  ordem        INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (missao_id, cliente_id)
);

-- 4) Visitas executadas na missão (check-in real)
CREATE TABLE IF NOT EXISTS public.missao_visitas (
  id                    SERIAL PRIMARY KEY,
  missao_id             INTEGER NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  cliente_id            INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
  tarefa_id             INTEGER REFERENCES public.tarefas(id) ON DELETE SET NULL,
  vendedor_acompanhado_id INTEGER REFERENCES public.vendedores(id) ON DELETE SET NULL,
  chegada_em            TIMESTAMPTZ,
  saida_em              TIMESTAMPTZ,
  localizacao           JSONB,
  resultado             TEXT, -- visitado | ausente | cancelado | remarcado
  concorrentes          TEXT,
  objecoes              TEXT,
  potencial             TEXT,
  proxima_acao          TEXT,
  anexos                JSONB DEFAULT '[]', -- [{url,tipo,nome}]
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Avaliação do vendedor acompanhado em campo
CREATE TABLE IF NOT EXISTS public.missao_avaliacoes (
  id            SERIAL PRIMARY KEY,
  missao_id     INTEGER NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  visita_id     INTEGER REFERENCES public.missao_visitas(id) ON DELETE SET NULL,
  vendedor_id   INTEGER NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  conhecimento  INTEGER CHECK (conhecimento BETWEEN 0 AND 10),
  negociacao    INTEGER CHECK (negociacao BETWEEN 0 AND 10),
  postura       INTEGER CHECK (postura BETWEEN 0 AND 10),
  crm           INTEGER CHECK (crm BETWEEN 0 AND 10),
  planejamento  INTEGER CHECK (planejamento BETWEEN 0 AND 10),
  observacao    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missao_vendedores_missao ON public.missao_vendedores (missao_id);
CREATE INDEX IF NOT EXISTS idx_missao_clientes_missao   ON public.missao_clientes (missao_id);
CREATE INDEX IF NOT EXISTS idx_missao_visitas_missao    ON public.missao_visitas (missao_id);
CREATE INDEX IF NOT EXISTS idx_missao_avaliacoes_missao ON public.missao_avaliacoes (missao_id);
CREATE INDEX IF NOT EXISTS idx_missoes_status           ON public.missoes (status);

-- 6) RLS — mesmo padrão das demais tabelas
ALTER TABLE public.missao_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missao_clientes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missao_visitas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missao_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS missao_vendedores_all ON public.missao_vendedores;
CREATE POLICY missao_vendedores_all ON public.missao_vendedores FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS missao_clientes_all ON public.missao_clientes;
CREATE POLICY missao_clientes_all ON public.missao_clientes FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS missao_visitas_all ON public.missao_visitas;
CREATE POLICY missao_visitas_all ON public.missao_visitas FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS missao_avaliacoes_all ON public.missao_avaliacoes;
CREATE POLICY missao_avaliacoes_all ON public.missao_avaliacoes FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- 7) IEM — Índice de Eficiência da Missão
-- pesos: agenda 20, dev equipe 20, resultado comercial 20, qualidade registros 15,
--        controle financeiro 15, inteligência mercado 10  (escala 0-100)
CREATE OR REPLACE FUNCTION public.calcular_iem(p_missao_id INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_missao missoes%ROWTYPE;
  v_planejadas INT; v_realizadas INT;
  v_avaliacoes INT; v_visitas_com_registro INT;
  v_visitas_com_intel INT;
  v_propostas NUMERIC; v_pedidos NUMERIC;
  v_previsto NUMERIC; v_realizado NUMERIC;
  s_agenda NUMERIC := 0; s_equipe NUMERIC := 0; s_comercial NUMERIC := 0;
  s_registros NUMERIC := 0; s_financeiro NUMERIC := 0; s_intel NUMERIC := 0;
BEGIN
  SELECT * INTO v_missao FROM missoes WHERE id = p_missao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_planejadas FROM missao_clientes WHERE missao_id = p_missao_id AND planejado;
  SELECT COUNT(*) INTO v_realizadas FROM missao_visitas WHERE missao_id = p_missao_id AND resultado = 'visitado';

  -- 20% cumprimento da agenda
  IF v_planejadas > 0 THEN s_agenda := LEAST(v_realizadas::NUMERIC / v_planejadas * 20, 20); END IF;

  -- 20% desenvolvimento da equipe (avaliações feitas)
  SELECT COUNT(*) INTO v_avaliacoes FROM missao_avaliacoes WHERE missao_id = p_missao_id;
  IF v_avaliacoes > 0 THEN s_equipe := LEAST(v_avaliacoes * 10, 20); END IF;

  -- 20% resultado comercial (propostas + pedidos criados no período da missão p/ clientes da missão)
  SELECT COUNT(*) INTO v_propostas FROM propostas pr
    JOIN missao_clientes mc ON mc.cliente_id = pr.cliente_id
    WHERE mc.missao_id = p_missao_id AND pr.criado_em >= v_missao.data_saida;
  SELECT COUNT(*) INTO v_pedidos FROM pedidos pe
    JOIN missao_clientes mc ON mc.cliente_id = pe.cliente_id
    WHERE mc.missao_id = p_missao_id AND pe.data_criacao >= v_missao.data_saida;
  s_comercial := LEAST((v_propostas + v_pedidos * 2) * 4, 20);

  -- 15% qualidade dos registros (visitas com resultado + próxima ação + algum detalhe)
  SELECT COUNT(*) INTO v_visitas_com_registro FROM missao_visitas
    WHERE missao_id = p_missao_id AND resultado IS NOT NULL AND proxima_acao IS NOT NULL;
  IF v_realizadas + (SELECT COUNT(*) FROM missao_visitas WHERE missao_id=p_missao_id) > 0 THEN
    s_registros := LEAST(v_visitas_com_registro::NUMERIC / GREATEST((SELECT COUNT(*) FROM missao_visitas WHERE missao_id=p_missao_id),1) * 15, 15);
  END IF;

  -- 15% controle financeiro (aderência ao orçamento: quanto mais perto do previsto, melhor)
  SELECT COALESCE(SUM((orcamento_previsto->>k)::NUMERIC),0) INTO v_previsto
    FROM missoes, LATERAL (SELECT unnest(ARRAY['combustivel','pedagio','hotel','alimentacao','outros']) k) kk WHERE id = p_missao_id;
  SELECT COALESCE(SUM(valor),0) INTO v_realizado FROM missao_despesas WHERE missao_id = p_missao_id;
  IF v_previsto > 0 THEN
    s_financeiro := GREATEST(15 - ABS(v_realizado - v_previsto) / v_previsto * 15, 0);
  ELSIF v_realizado = 0 THEN s_financeiro := 15;
  ELSE s_financeiro := 7;
  END IF;

  -- 10% inteligência de mercado (visitas com concorrente/objeções/potencial preenchidos)
  SELECT COUNT(*) INTO v_visitas_com_intel FROM missao_visitas
    WHERE missao_id = p_missao_id AND (concorrentes IS NOT NULL OR objecoes IS NOT NULL OR potencial IS NOT NULL);
  IF v_realizadas > 0 THEN s_intel := LEAST(v_visitas_com_intel::NUMERIC / v_realizadas * 10, 10); END IF;

  RETURN ROUND(s_agenda + s_equipe + s_comercial + s_registros + s_financeiro + s_intel, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
