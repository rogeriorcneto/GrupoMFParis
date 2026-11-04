CREATE TABLE IF NOT EXISTS public.automacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  descricao       TEXT,
  tipo            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'rascunho',
  gatilho_tipo    TEXT NOT NULL DEFAULT 'manual',
  gatilho_config  JSONB NOT NULL DEFAULT '{}',
  acoes           JSONB NOT NULL DEFAULT '[]',
  criado_por      UUID,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  execucoes       INTEGER NOT NULL DEFAULT 0,
  ultima_execucao TIMESTAMPTZ,
  proxima_execucao TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automacoes_execucoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id UUID NOT NULL REFERENCES public.automacoes(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'sucesso',
  inicio       TIMESTAMPTZ,
  fim          TIMESTAMPTZ,
  resultado    JSONB,
  erro_mensagem TEXT,
  dados_entrada JSONB,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.automacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacoes_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automacoes_all ON public.automacoes;
CREATE POLICY automacoes_all ON public.automacoes FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS automacoes_execucoes_all ON public.automacoes_execucoes;
CREATE POLICY automacoes_execucoes_all ON public.automacoes_execucoes FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
