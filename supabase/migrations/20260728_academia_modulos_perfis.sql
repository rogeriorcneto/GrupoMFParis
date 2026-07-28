-- Tabelas para gerenciamento de módulos e perfis do roleplay da Academia de Vendas

-- ============================================
-- MÓDULOS DE TREINAMENTO
-- ============================================
create table if not exists modulos_treinamento (
  id bigint generated always as identity primary key,
  ordem int not null default 0,
  ativo boolean not null default true,
  titulo text not null,
  descricao text not null default '',
  objetivo text not null default '',
  emoji text not null default '',
  dificuldade text not null default 'Médio' check (dificuldade in ('Iniciante', 'Médio', 'Avançado')),
  prompt_instrucoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_modulos_treinamento_ordem on modulos_treinamento(ordem);
create index if not exists idx_modulos_treinamento_ativo on modulos_treinamento(ativo);

-- ============================================
-- PERFIS DE CLIENTE PARA TREINAMENTO
-- ============================================
create table if not exists perfis_treinamento (
  id bigint generated always as identity primary key,
  ordem int not null default 0,
  ativo boolean not null default true,
  nome text not null,
  negocio text not null default '',
  emoji text not null default '',
  dor text not null default '',
  estilo text not null default '',
  prompt_instrucoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_perfis_treinamento_ordem on perfis_treinamento(ordem);
create index if not exists idx_perfis_treinamento_ativo on perfis_treinamento(ativo);

-- ============================================
-- RLS
-- ============================================
alter table modulos_treinamento enable row level security;
alter table perfis_treinamento enable row level security;

-- Leitura liberada para usuários autenticados
create policy "vendedores_ler_modulos_treinamento"
  on modulos_treinamento
  for select
  to authenticated
  using (true);

create policy "vendedores_ler_perfis_treinamento"
  on perfis_treinamento
  for select
  to authenticated
  using (true);

-- Escrita permitida apenas para gerentes
create policy "gerentes_editar_modulos_treinamento"
  on modulos_treinamento
  for all
  to authenticated
  using (
    exists (select 1 from vendedores where auth_id = auth.uid() and cargo = 'gerente')
  )
  with check (
    exists (select 1 from vendedores where auth_id = auth.uid() and cargo = 'gerente')
  );

create policy "gerentes_editar_perfis_treinamento"
  on perfis_treinamento
  for all
  to authenticated
  using (
    exists (select 1 from vendedores where auth_id = auth.uid() and cargo = 'gerente')
  )
  with check (
    exists (select 1 from vendedores where auth_id = auth.uid() and cargo = 'gerente')
  );

-- Acesso total para service_role (backend)
create policy "service_role_modulos_treinamento"
  on modulos_treinamento
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_perfis_treinamento"
  on perfis_treinamento
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================
-- TRIGGER updated_at
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_modulos_treinamento_updated_at on modulos_treinamento;
create trigger set_modulos_treinamento_updated_at
  before update on modulos_treinamento
  for each row execute function update_updated_at_column();

drop trigger if exists set_perfis_treinamento_updated_at on perfis_treinamento;
create trigger set_perfis_treinamento_updated_at
  before update on perfis_treinamento
  for each row execute function update_updated_at_column();

-- ============================================
-- SEED: módulos e perfis atuais do TreinamentoView.tsx
-- ============================================
insert into modulos_treinamento (ordem, ativo, titulo, descricao, objetivo, emoji, dificuldade, prompt_instrucoes)
values
  (0, true, 'Abertura & Conexão', 'Captar atenção nos primeiros 30s e criar rapport', 'Objetivo: o cliente concorda em ouvir a proposta.', '📞', 'Iniciante', ''),
  (1, true, 'Qualificação BANT', 'Descobrir orçamento, autoridade, necessidade e timing', 'Objetivo: entender o perfil completo antes de propor.', '🔍', 'Médio', ''),
  (2, true, 'Objeção: Preço', 'Lidar com "está caro" e "o concorrente é mais barato"', 'Objetivo: reverter objeção de preço e avançar.', '💸', 'Médio', ''),
  (3, true, 'Objeção: Prazo & Frete', 'Negociar prazos de pagamento e condições CIF/FOB', 'Objetivo: fechar condições logísticas favoráveis.', '🚚', 'Avançado', ''),
  (4, true, 'Solicitação de Amostra', 'Converter interesse em amostra física com data de retorno', 'Objetivo: cliente aceita receber amostra com prazo de feedback.', '🧪', 'Médio', ''),
  (5, true, 'Fechamento & Próximo Passo', 'Propor ação concreta sem ser agressivo', 'Objetivo: cliente confirma pedido ou agenda próxima etapa.', '🤝', 'Avançado', ''),
  (6, true, 'Pós-Venda & Fidelização', 'Garantir satisfação e abrir oportunidade de recompra', 'Objetivo: cliente satisfeito e nova compra agendada.', '🌟', 'Médio', ''),
  (7, true, 'Roleplay Livre', 'Simule uma call completa do zero ao fechamento', 'Objetivo: conduzir toda a jornada comercial.', '🎯', 'Avançado', '')
on conflict do nothing;

insert into perfis_treinamento (ordem, ativo, nome, negocio, emoji, dor, estilo, prompt_instrucoes)
values
  (0, true, 'João da Silva', 'Panificadora Estrela', '🥖', 'custo de insumos alto e falta de tempo', 'direto, impaciente, foco total em preço e prazo de entrega', ''),
  (1, true, 'Carlos Mendes', 'Sorveteria Gelada', '🍦', 'qualidade inconsistente dos fornecedores atuais', 'técnico, detalhista, compara ingredientes e laudos', ''),
  (2, true, 'Márcio Ferreira', 'Indústria FrioPar', '🏭', 'processo de compra burocrático e múltiplos aprovadores', 'corporativo, frio, pede cotação formal e prazo de entrega garantido', ''),
  (3, true, 'Ana Lima', 'Confeitaria Premium Belle', '🧁', 'clientes exigentes que pedem produtos especiais', 'sofisticada, exige excelência, pergunta sobre origem e diferenciais', ''),
  (4, true, 'Roberto Costa', 'Restaurante Sabor Mineiro', '🍽️', 'volume alto mas margem apertada', 'negociador nato, sempre pede desconto e prazo maior', '')
on conflict do nothing;
