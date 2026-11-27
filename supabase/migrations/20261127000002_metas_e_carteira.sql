-- Item 4 — Metas por vendedor/mês + feriados + log de alterações
create table if not exists public.metas_vendedor_mes (
  id bigserial primary key,
  vendedor_id bigint not null references public.vendedores(id) on delete cascade,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  meta_faturamento numeric not null default 0,
  meta_volume_kg numeric not null default 0,
  meta_visitas int not null default 0,
  meta_propostas int not null default 0,
  meta_novos_clientes int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (vendedor_id, ano, mes)
);

create table if not exists public.metas_vendedor_log (
  id bigserial primary key,
  vendedor_id bigint not null,
  ano int not null,
  mes int not null,
  campo text not null,
  valor_antigo numeric,
  valor_novo numeric,
  alterado_por text,
  alterado_em timestamptz not null default now()
);

create table if not exists public.feriados (
  id bigserial primary key,
  data date not null unique,
  descricao text
);

alter table public.metas_vendedor_mes enable row level security;
alter table public.metas_vendedor_log enable row level security;
alter table public.feriados enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'metas_mes_all' and tablename = 'metas_vendedor_mes') then
    create policy metas_mes_all on public.metas_vendedor_mes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'metas_log_all' and tablename = 'metas_vendedor_log') then
    create policy metas_log_all on public.metas_vendedor_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'feriados_all' and tablename = 'feriados') then
    create policy feriados_all on public.feriados for all using (true) with check (true);
  end if;
end $$;

-- Item 21 — Decisão do gestor ao cliente sair da carteira (180 dias)
create table if not exists public.saida_carteira_decisoes (
  id bigserial primary key,
  cliente_id bigint not null,
  decisao text not null,
  detalhe text,
  prazo date,
  registrado_por text,
  registrado_em timestamptz not null default now()
);

alter table public.saida_carteira_decisoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'saida_carteira_all' and tablename = 'saida_carteira_decisoes') then
    create policy saida_carteira_all on public.saida_carteira_decisoes for all using (true) with check (true);
  end if;
end $$;
