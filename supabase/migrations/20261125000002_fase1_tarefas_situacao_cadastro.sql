-- Fase 1 — Fluxo de tarefas, situação de compra e cadastro completo
-- Não altera funil, etapas, ciclos, pedidos existentes nem created_at.

-- Tarefas: dados do fluxo de conclusão com próximo passo
alter table public.tarefas
  add column if not exists concluida_em timestamptz,
  add column if not exists concluida_por text,
  add column if not exists criado_por text,
  add column if not exists canal_usado text,
  add column if not exists objetivo text,
  add column if not exists origem text,
  add column if not exists justificativa_prazo_longo text,
  add column if not exists proxima_tarefa_id bigint;

-- Índices de apoio para histórico/indicadores
create index if not exists idx_tarefas_concluida_em on public.tarefas (concluida_em desc) where status = 'concluida';
create index if not exists idx_tarefas_cliente_status_data on public.tarefas (cliente_id, status, data);
create index if not exists idx_tarefas_objetivo on public.tarefas (objetivo) where objetivo is not null;
create index if not exists idx_tarefas_canal_usado on public.tarefas (canal_usado) where canal_usado is not null;

-- Cadastro completo: contatos fixos, e-mail de boleto e justificativas auditáveis
alter table public.clientes
  add column if not exists contato_compras_setor text,
  add column if not exists contato_financeiro_setor text,
  add column if not exists email_boleto text,
  add column if not exists cadastro_justificativas jsonb not null default '[]'::jsonb;

-- Pedidos: base para situação de compra e lead time (Fase 2)
alter table public.pedidos
  add column if not exists data_envio_omie timestamptz,
  add column if not exists data_faturamento date;

create index if not exists idx_pedidos_cliente_venda_omie on public.pedidos (cliente_id, data_aprovacao desc)
  where status = 'confirmado' and tipo = 'venda';

-- Migração segura de dados de contato já existente para o Contato Comprador.
-- Só preenche campos vazios; não sobrescreve nada.
update public.clientes
set contato_compras_nome = contato_nome
where (contato_compras_nome is null or btrim(contato_compras_nome) = '')
  and contato_nome is not null and btrim(contato_nome) <> ''
  and not coalesce(arquivado_duplicata, false);

update public.clientes
set contato_compras_telefone = coalesce(nullif(contato_celular, ''), nullif(contato_telefone, ''), nullif(contato_telefone_fixo, ''))
where (contato_compras_telefone is null or btrim(contato_compras_telefone) = '')
  and coalesce(nullif(contato_celular, ''), nullif(contato_telefone, ''), nullif(contato_telefone_fixo, '')) is not null
  and not coalesce(arquivado_duplicata, false);

-- Setores nascem pré-marcados conforme a especificação.
update public.clientes
set contato_compras_setor = 'Compras'
where (contato_compras_setor is null or btrim(contato_compras_setor) = '')
  and not coalesce(arquivado_duplicata, false);

update public.clientes
set contato_financeiro_setor = 'Financeiro'
where (contato_financeiro_setor is null or btrim(contato_financeiro_setor) = '')
  and not coalesce(arquivado_duplicata, false);

-- Retrocompatibilidade de pedidos já enviados/aprovados: usa a data de aprovação
-- como proxy do envio ao Omie apenas quando o pedido está confirmado e vinculado.
update public.pedidos
set data_envio_omie = coalesce(data_aprovacao, data_criacao)
where data_envio_omie is null
  and status = 'confirmado'
  and tipo = 'venda'
  and (omie_codigo is not null or omie_numero is not null);
