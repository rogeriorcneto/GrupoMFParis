-- ============================================================================
-- Aba Missões — Viagens dos Vendedores (Primeira Versão)
-- ============================================================================

-- 1) Parâmetros globais de Missões (editáveis somente pelo gestor em Parâmetros)
CREATE TABLE IF NOT EXISTS public.missao_parametros (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  valor_km            NUMERIC(10,2) NOT NULL DEFAULT 1.50,
  valor_diaria        NUMERIC(10,2) NOT NULL DEFAULT 120.00,
  raio_checkin_metros INTEGER NOT NULL DEFAULT 300,
  cidade_base         TEXT NOT NULL DEFAULT '',
  atualizado_por      TEXT,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.missao_parametros (id, valor_km, valor_diaria, raio_checkin_metros, cidade_base)
VALUES (1, 1.50, 120.00, 300, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.missao_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missao_parametros_select ON public.missao_parametros;
CREATE POLICY missao_parametros_select ON public.missao_parametros
  FOR SELECT TO authenticated, service_role USING (true);
DROP POLICY IF EXISTS missao_parametros_write ON public.missao_parametros;
CREATE POLICY missao_parametros_write ON public.missao_parametros
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- 2) Campos complementares em missoes (preservando todos os campos já existentes:
--    nome, objetivo, vendedor_id, data_saida, data_retorno, veiculo, hotel, cidades, custo_estimado)
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS cidade_origem          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cidade_retorno         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS hospedagem_prevista    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_total               NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_km_aplicado      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_diaria_aplicado  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dias_viagem            INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS custo_previsto         NUMERIC(12,2) DEFAULT 0;

-- 3) Roteiro e execução de visitas da missão (sem tocar em funil/etapas/ciclos)
CREATE TABLE IF NOT EXISTS public.missao_roteiro_visitas (
  id                       SERIAL PRIMARY KEY,
  missao_id                INTEGER NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  cliente_id               INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  dia_numero               INTEGER NOT NULL DEFAULT 1,
  data_visita              DATE,
  ordem                    INTEGER NOT NULL DEFAULT 1,
  planejada                BOOLEAN NOT NULL DEFAULT true,
  -- pendente | visitado | nao_realizada | nao_localizado | removida
  status                   TEXT NOT NULL DEFAULT 'pendente',
  -- Check-in pelo GPS do celular
  checkin_em               TIMESTAMPTZ,
  checkin_lat              NUMERIC(10,7),
  checkin_lon              NUMERIC(10,7),
  cliente_lat              NUMERIC(10,7),
  cliente_lon              NUMERIC(10,7),
  distancia_metros         INTEGER,
  fora_do_local            BOOLEAN NOT NULL DEFAULT false,
  raio_aplicado_metros     INTEGER,
  motivo_nao_realizada     TEXT,
  -- Fluxo "Estabelecimento não localizado": gestor decide se descarta o lead
  decisao_gestor_descarte  TEXT, -- pendente | descartado | mantido
  decisao_gestor_por       TEXT,
  decisao_gestor_em        TIMESTAMPTZ,
  decisao_gestor_obs       TEXT,
  -- Gravação de visita + resumo IA revisado e confirmado pelo vendedor
  audio_path               TEXT,
  audio_url                TEXT,
  audio_duracao_seg        INTEGER,
  transcricao              TEXT,
  resumo_ia                JSONB, -- { conversado, produtosInteresse, objecoes, proximoPasso, proximoPrazo }
  resumo_confirmado        BOOLEAN NOT NULL DEFAULT false,
  resumo_confirmado_em     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missao_roteiro_missao  ON public.missao_roteiro_visitas (missao_id, dia_numero, ordem);
CREATE INDEX IF NOT EXISTS idx_missao_roteiro_cliente ON public.missao_roteiro_visitas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_missao_roteiro_descarte ON public.missao_roteiro_visitas (decisao_gestor_descarte)
  WHERE status = 'nao_localizado';

ALTER TABLE public.missao_roteiro_visitas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missao_roteiro_visitas_all ON public.missao_roteiro_visitas;
CREATE POLICY missao_roteiro_visitas_all ON public.missao_roteiro_visitas
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- 4) Garantir RLS em missoes e missao_despesas
ALTER TABLE public.missoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missao_despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS missoes_all_auth ON public.missoes;
CREATE POLICY missoes_all_auth ON public.missoes
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS missao_despesas_all_auth ON public.missao_despesas;
CREATE POLICY missao_despesas_all_auth ON public.missao_despesas
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- 5) Bucket de arquivos de missão (comprovantes de despesa e gravações de visita)
INSERT INTO storage.buckets (id, name, public)
VALUES ('missao-arquivos', 'missao-arquivos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'missao_arquivos_public_read'
  ) THEN
    CREATE POLICY missao_arquivos_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'missao-arquivos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'missao_arquivos_auth_write'
  ) THEN
    CREATE POLICY missao_arquivos_auth_write ON storage.objects
      FOR INSERT TO authenticated, service_role WITH CHECK (bucket_id = 'missao-arquivos');
  END IF;
END $$;
