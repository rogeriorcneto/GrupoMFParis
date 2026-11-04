-- Ponte: UI automacoes → worker (jobs_automacao)
-- Eventos do sistema enfileirados p/ o cron avaliar automacoes ativas

ALTER TABLE public.jobs_automacao ADD COLUMN IF NOT EXISTS mensagem TEXT;
ALTER TABLE public.jobs_automacao ADD COLUMN IF NOT EXISTS automacao_id UUID REFERENCES public.automacoes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.automacao_eventos (
  id          BIGSERIAL PRIMARY KEY,
  evento      TEXT NOT NULL,            -- 'mudanca_etapa' | 'tarefa_concluida' | 'cliente_criado'
  cliente_id  INTEGER REFERENCES public.clientes(id) ON DELETE CASCADE,
  tarefa_id   INTEGER,
  dados       JSONB DEFAULT '{}',       -- {etapa_antes, etapa_depois, tipo_tarefa...}
  processado  BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automacao_eventos_pendente ON public.automacao_eventos(processado, criado_em) WHERE NOT processado;
ALTER TABLE public.automacao_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automacao_eventos_all ON public.automacao_eventos;
CREATE POLICY automacao_eventos_all ON public.automacao_eventos FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- Trigger: mudança de etapa do cliente
CREATE OR REPLACE FUNCTION public.fn_evento_mudanca_etapa() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.etapa IS DISTINCT FROM NEW.etapa THEN
    INSERT INTO public.automacao_eventos (evento, cliente_id, dados)
    VALUES ('mudanca_etapa', NEW.id, jsonb_build_object('de', OLD.etapa, 'para', NEW.etapa));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_evento_etapa ON public.clientes;
CREATE TRIGGER trg_evento_etapa AFTER UPDATE OF etapa ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_evento_mudanca_etapa();

-- Trigger: tarefa concluída
CREATE OR REPLACE FUNCTION public.fn_evento_tarefa_concluida() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'concluida' AND NEW.status = 'concluida' AND NEW.cliente_id IS NOT NULL THEN
    INSERT INTO public.automacao_eventos (evento, cliente_id, tarefa_id, dados)
    VALUES ('tarefa_concluida', NEW.cliente_id, NEW.id, jsonb_build_object('tipo_tarefa', NEW.tipo, 'titulo', NEW.titulo));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_evento_tarefa ON public.tarefas;
CREATE TRIGGER trg_evento_tarefa AFTER UPDATE OF status ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.fn_evento_tarefa_concluida();
