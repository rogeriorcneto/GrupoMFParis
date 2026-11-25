-- Trava pós-restauração:
-- 1) Impede alteração da data de criação original (created_at / criado_em) em clientes, tarefas e interacoes.
-- 2) Impede arquivar como duplicata (arquivado_duplicata = true) qualquer card que possua tarefas, notas/interacoes ou propostas (além de pedidos).

BEGIN;

CREATE OR REPLACE FUNCTION public.proteger_created_at_imutavel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.created_at IS NOT NULL AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A data de criação original (created_at) de % é imutável e não pode ser sobrescrita.', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_criado_em_clientes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.created_at IS NOT NULL AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A data de criação original (created_at) do cliente/card é imutável.';
  END IF;
  IF OLD.criado_em IS NOT NULL AND NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'A data de criação original (criado_em) do cliente/card é imutável.';
  END IF;
  -- Regra: nunca permitir arquivar como duplicata um ciclo real que tenha tarefas, notas, propostas, amostra ou vendas!
  IF NEW.arquivado_duplicata AND NOT COALESCE(OLD.arquivado_duplicata, FALSE) THEN
    IF EXISTS (SELECT 1 FROM public.tarefas WHERE cliente_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.interacoes WHERE cliente_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.propostas WHERE cliente_id = NEW.id)
       OR OLD.etapa IN ('follow_up', 'amostra', 'amostra_perdida') THEN
      RAISE EXCEPTION 'Proibido usar arquivado_duplicata em ciclo real com tarefas, notas, propostas, amostra ou follow-up (card %).', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_imutavel_created_at_clientes ON public.clientes;
CREATE TRIGGER trg_imutavel_created_at_clientes
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_criado_em_clientes();

DROP TRIGGER IF EXISTS trg_imutavel_created_at_tarefas ON public.tarefas;
CREATE TRIGGER trg_imutavel_created_at_tarefas
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_created_at_imutavel();

DROP TRIGGER IF EXISTS trg_imutavel_created_at_interacoes ON public.interacoes;
CREATE TRIGGER trg_imutavel_created_at_interacoes
  BEFORE UPDATE ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_created_at_imutavel();

COMMIT;
